from __future__ import annotations

import os
import secrets
import sqlite3
import tempfile
import urllib.error
import urllib.request
from base64 import b64encode
from datetime import UTC, datetime
from json import loads
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

DATABASE = Path(os.environ.get("CLINICAL_DATABASE", "/data/records.sqlite3"))
IMPORT_TOKEN = os.environ.get("CLINICAL_IMPORT_TOKEN", "")
GOOGLE_STATUS_URL = os.environ.get("GOOGLE_IMPORTER_STATUS_URL", "")
GOOGLE_STATUS_USER = os.environ.get("GOOGLE_IMPORTER_STATUS_USER", "")
GOOGLE_STATUS_PASSWORD = os.environ.get("GOOGLE_IMPORTER_STATUS_PASSWORD", "")
EXPECTED_TABLES = {"raw_capture", "parsed_event", "coding_assertion", "coding_review", "analysis_finding"}

app = FastAPI(title="Personal Health Clinical API", docs_url=None, redoc_url=None)


def connect() -> sqlite3.Connection:
    if not DATABASE.exists():
        raise HTTPException(503, "Clinical database has not been imported")
    connection = sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def verify_database(path: Path) -> dict[str, int]:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError("SQLite integrity check failed")
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not EXPECTED_TABLES.issubset(tables):
            raise ValueError("File is not a supported clinical evidence database")
        return {table: int(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]) for table in EXPECTED_TABLES}
    finally:
        connection.close()


def source_key(source_uri: str, organisation: str) -> tuple[str, str]:
    value = f"{source_uri} {organisation}".casefold()
    if "patientsknowbest" in value or "pkb" in value:
        return "patients-know-best", "Patients Know Best"
    if "systmonline" in value or "tpp-uk" in value:
        return "systmonline", "SystmOnline GP record"
    return "clinical-records", organisation or "Clinical records"


def google_importer_status() -> dict:
    if not (GOOGLE_STATUS_URL and GOOGLE_STATUS_USER and GOOGLE_STATUS_PASSWORD):
        return {"source_key": "google-health", "label": "Fitbit / Google Health", "state": "not_linked", "detail": "Importer freshness is not linked to this portal yet"}
    request = urllib.request.Request(GOOGLE_STATUS_URL)
    credential = b64encode(f"{GOOGLE_STATUS_USER}:{GOOGLE_STATUS_PASSWORD}".encode()).decode()
    request.add_header("Authorization", f"Basic {credential}")
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = loads(response.read(1024 * 1024))
        freshness = payload.get("data_freshness", {}) if isinstance(payload, dict) else {}
        sync = payload.get("sync", {}) if isinstance(payload, dict) else {}
        state = freshness.get("status", "unknown") if isinstance(freshness, dict) else "unknown"
        if isinstance(sync, dict) and sync.get("status") == "failed":
            state = "needs_attention"
        return {
            "source_key": "google-health", "label": "Fitbit / Google Health",
            "state": state if state in {"fresh", "stale", "needs_attention"} else "unknown",
            "latest_data_at": freshness.get("last_data_at") if isinstance(freshness, dict) else None,
            "checked_at": freshness.get("checked_at") if isinstance(freshness, dict) else None,
            "detail": "Freshness reported by the Google Health importer",
        }
    except (OSError, ValueError, urllib.error.HTTPError):
        return {"source_key": "google-health", "label": "Fitbit / Google Health", "state": "unavailable", "detail": "Importer status is temporarily unavailable"}


@app.get("/health")
def health() -> dict:
    if not DATABASE.exists():
        return {"status": "waiting_for_import", "database": False}
    counts = verify_database(DATABASE)
    return {"status": "ok", "database": True, "counts": counts}


@app.get("/summary")
def summary() -> dict:
    with connect() as connection:
        current = connection.execute(
            """WITH ranked AS (SELECT *, row_number() OVER (
              PARTITION BY capture_sha256, source_file, event_date, author, organisation, entry_type, source_text
              ORDER BY id DESC) AS revision_rank FROM parsed_event)
              SELECT count(*) FROM ranked WHERE revision_rank = 1"""
        ).fetchone()[0]
        review = connection.execute(
            """WITH ranked AS (SELECT *, row_number() OVER (
              PARTITION BY capture_sha256, source_file, event_date, author, organisation, entry_type, source_text
              ORDER BY id DESC) AS revision_rank FROM parsed_event)
              SELECT count(*) FROM ranked WHERE revision_rank = 1
              AND (parse_confidence < 1 OR parse_notes != '[]')"""
        ).fetchone()[0]
        captures = connection.execute("SELECT count(*) FROM raw_capture").fetchone()[0]
    return {"current_events": current, "review_items": review, "source_captures": captures}


@app.get("/overview/sources")
def overview_sources() -> dict:
    with connect() as connection:
        rows = connection.execute(
            """WITH ranked AS (SELECT *, row_number() OVER (
              PARTITION BY capture_sha256, source_file, event_date, author, organisation, entry_type, source_text
              ORDER BY id DESC) AS revision_rank FROM parsed_event)
            SELECT rc.source_uri, ranked.organisation, count(DISTINCT rc.sha256) AS capture_count,
                   count(*) AS current_event_count,
                   sum(CASE WHEN ranked.parse_confidence < 1 OR ranked.parse_notes != '[]' THEN 1 ELSE 0 END) AS review_item_count,
                   max(rc.captured_at) AS latest_capture_at,
                   max(CASE WHEN lower(ranked.event_date) != 'unknown' THEN ranked.event_date END) AS latest_event_date,
                   min(CASE WHEN lower(ranked.event_date) != 'unknown' THEN ranked.event_date END) AS earliest_event_date,
                   sum(CASE WHEN lower(ranked.event_date) = 'unknown' THEN 1 ELSE 0 END) AS unknown_date_count,
                   group_concat(DISTINCT ranked.parser_version) AS parser_versions
              FROM ranked JOIN raw_capture rc ON rc.sha256 = ranked.capture_sha256
             WHERE ranked.revision_rank = 1
             GROUP BY rc.source_uri, ranked.organisation"""
        ).fetchall()
    grouped: dict[str, dict] = {}
    for row in rows:
        key, label = source_key(row["source_uri"], row["organisation"])
        item = grouped.setdefault(key, {"source_key": key, "label": label, "state": "imported", "capture_count": 0, "current_event_count": 0, "review_item_count": 0, "latest_capture_at": None, "latest_event_date": None, "earliest_event_date": None, "unknown_date_count": 0, "parser_versions": [], "detail": "Retained source capture; not a continuous feed"})
        item["capture_count"] += row["capture_count"]
        item["current_event_count"] += row["current_event_count"]
        item["review_item_count"] += row["review_item_count"]
        item["unknown_date_count"] += row["unknown_date_count"]
        item["latest_capture_at"] = max(filter(None, [item["latest_capture_at"], row["latest_capture_at"]]), default=None)
        item["latest_event_date"] = max(filter(None, [item["latest_event_date"], row["latest_event_date"]]), default=None)
        item["earliest_event_date"] = min(filter(None, [item["earliest_event_date"], row["earliest_event_date"]]), default=None)
        item["parser_versions"] = sorted(set(item["parser_versions"] + (row["parser_versions"] or "").split(",")))
    sources = list(grouped.values())
    sources.append(google_importer_status())
    sources.append({"source_key": "apple-health", "label": "Apple Health", "state": "not_linked", "detail": "Available in Open Wearables; portal freshness is not linked yet"})
    return {"generated_at": datetime.now(UTC).isoformat(), "sources": sources}


@app.get("/events")
def events(limit: int = 500, offset: int = 0, query: str = "", entry_type: str = "") -> dict:
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    where = ["revision_rank = 1"]
    parameters: list[object] = []
    if query:
        where.append("source_text LIKE ?")
        parameters.append(f"%{query}%")
    if entry_type:
        where.append("entry_type = ?")
        parameters.append(entry_type)
    parameters.extend([limit, offset])
    with connect() as connection:
        rows = connection.execute(
            f"""WITH ranked AS (SELECT *, row_number() OVER (
              PARTITION BY capture_sha256, source_file, event_date, author, organisation, entry_type, source_text
              ORDER BY id DESC) AS revision_rank FROM parsed_event)
            SELECT id, event_date, author, organisation, entry_type, source_text, source_file,
                     capture_sha256, parser_version, parse_confidence, parse_notes,
                     (SELECT json_group_array(json_object(
                        'system', ca.system, 'code', ca.code, 'display', ca.display,
                        'version', ca.version, 'status', ca.status, 'confidence', ca.confidence,
                        'method', ca.method, 'mapping_provenance', ca.mapping_provenance,
                        'review_required', ca.review_required))
                      FROM coding_assertion ca WHERE ca.event_id = ranked.id) AS coding_assertions
              FROM ranked WHERE {' AND '.join(where)}
              ORDER BY CASE WHEN event_date = 'Unknown' THEN 1 ELSE 0 END, event_date DESC, id DESC
              LIMIT ? OFFSET ?""",
            parameters,
        ).fetchall()
    return {"items": [dict(row) for row in rows], "limit": limit, "offset": offset}


@app.post("/admin/import")
async def import_database(
    database: UploadFile = File(...),
    x_import_token: str | None = Header(default=None),
) -> dict:
    if not IMPORT_TOKEN or not x_import_token or not secrets.compare_digest(x_import_token, IMPORT_TOKEN):
        raise HTTPException(401, "Import authorisation failed")
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix="clinical-import-", suffix=".sqlite3", dir=DATABASE.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as target:
            while chunk := await database.read(1024 * 1024):
                target.write(chunk)
        counts = verify_database(temporary)
        temporary.replace(DATABASE)
        return {"status": "imported", "counts": counts}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    finally:
        temporary.unlink(missing_ok=True)
