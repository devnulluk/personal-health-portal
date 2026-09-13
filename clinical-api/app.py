from __future__ import annotations

import os
import re
import secrets
import sqlite3
import tempfile
import urllib.error
import urllib.request
from base64 import b64encode
from contextlib import closing
from datetime import UTC, datetime, timedelta
from json import loads
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

DATABASE = Path(os.environ.get("CLINICAL_DATABASE", "/data/records.sqlite3"))
IMPORT_TOKEN = os.environ.get("CLINICAL_IMPORT_TOKEN", "")
GOOGLE_STATUS_URL = os.environ.get("GOOGLE_IMPORTER_STATUS_URL", "")
GOOGLE_STATUS_USER = os.environ.get("GOOGLE_IMPORTER_STATUS_USER", "")
GOOGLE_STATUS_PASSWORD = os.environ.get("GOOGLE_IMPORTER_STATUS_PASSWORD", "")
OPEN_WEARABLES_STATUS_URL = os.environ.get("OPEN_WEARABLES_STATUS_URL", "")
OPEN_WEARABLES_USER_ID = os.environ.get("OPEN_WEARABLES_USER_ID", "")
OPEN_WEARABLES_API_KEY = os.environ.get("OPEN_WEARABLES_API_KEY", "")
APPLE_FRESH_AFTER_HOURS = int(os.environ.get("APPLE_FRESH_AFTER_HOURS", "24"))
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


def apple_health_status() -> dict:
    if not (OPEN_WEARABLES_STATUS_URL and OPEN_WEARABLES_USER_ID and OPEN_WEARABLES_API_KEY):
        return {"source_key": "apple-health", "label": "Apple Health", "state": "not_linked", "detail": "Open Wearables upload freshness is not linked yet"}
    url = f"{OPEN_WEARABLES_STATUS_URL.rstrip('/')}/api/v1/users/{OPEN_WEARABLES_USER_ID}/sync/recent?limit=200"
    request = urllib.request.Request(url, headers={"X-Open-Wearables-API-Key": OPEN_WEARABLES_API_KEY})
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            payload = loads(response.read(1024 * 1024))
        events = [event for event in payload if isinstance(event, dict) and str(event.get("provider", "")).casefold() == "apple"] if isinstance(payload, list) else []
        if not events:
            return {"source_key": "apple-health", "label": "Apple Health", "state": "stale", "detail": "No Apple upload was reported in Open Wearables' recent sync window"}
        latest = max(events, key=lambda event: str(event.get("timestamp") or event.get("ended_at") or ""))
        latest_at = latest.get("ended_at") or latest.get("timestamp")
        parsed_at = datetime.fromisoformat(str(latest_at).replace("Z", "+00:00")) if latest_at else None
        status = str(latest.get("status", "unknown")).casefold()
        stage = str(latest.get("stage", "unknown")).casefold()
        if status == "failed" or stage == "failed":
            state, detail = "needs_attention", "Latest Apple Health upload failed"
        elif status in {"success", "skipped"} or stage == "completed":
            fresh_after = timedelta(hours=max(1, APPLE_FRESH_AFTER_HOURS))
            state = "fresh" if parsed_at and datetime.now(UTC) - parsed_at.astimezone(UTC) <= fresh_after else "stale"
            detail = "Latest Apple Health upload reported by Open Wearables"
        else:
            state, detail = "unknown", "Apple Health upload is currently in progress"
        return {"source_key": "apple-health", "label": "Apple Health", "state": state, "latest_data_at": latest_at, "checked_at": datetime.now(UTC).isoformat(), "detail": detail}
    except (OSError, ValueError, TypeError, urllib.error.HTTPError):
        return {"source_key": "apple-health", "label": "Apple Health", "state": "unavailable", "detail": "Open Wearables upload status is temporarily unavailable"}


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
    with closing(connect()) as connection:
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
    sources.append(apple_health_status())
    return {"generated_at": datetime.now(UTC).isoformat(), "sources": sources}


def _labelled_value(text: str, label: str) -> str | None:
    match = re.search(rf"(?:^|;\s*){re.escape(label)}:\s*(.*?)(?=;\s*[A-Z][^:;]{{1,40}}:|$)", text, re.IGNORECASE)
    return match.group(1).strip() if match else None


def _number_and_unit(value: str) -> tuple[float, str] | None:
    match = re.search(r"(?<![\w.])(-?\d+(?:\.\d+)?)\s*([^,;()]*)", value)
    return (float(match.group(1)), match.group(2).strip()) if match else None


def _reference_range(value: str) -> tuple[float, float] | None:
    match = re.search(r"(?:reference|normal|target|range)[^\d-]*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)", value, re.IGNORECASE)
    return (float(match.group(1)), float(match.group(2))) if match else None


@app.get("/observations")
def observations() -> dict:
    """Conservatively extract chartable observations while retaining source wording."""
    with closing(connect()) as connection:
        rows = connection.execute(
            """WITH ranked AS (SELECT *, row_number() OVER (
              PARTITION BY capture_sha256, source_file, event_date, author, organisation, entry_type, source_text
              ORDER BY id DESC) AS revision_rank FROM parsed_event)
            SELECT id, event_date, entry_type, source_text, source_file, organisation,
                   capture_sha256, parser_version, parse_confidence
              FROM ranked WHERE revision_rank = 1 AND lower(event_date) <> 'unknown'
              ORDER BY event_date"""
        ).fetchall()
    groups: dict[str, dict] = {}
    for row in rows:
        text, entry_type = row["source_text"], row["entry_type"].casefold()
        candidates: list[tuple[str, str, float, str, str, tuple[float, float] | None]] = []
        if "laboratory observation" in entry_type:
            name = _labelled_value(text, "Test")
            raw_value = _labelled_value(text, "Value") or ""
            numeric = _number_and_unit(raw_value)
            unit = _labelled_value(text, "Unit") or ""
            low = _labelled_value(text, "Reference low")
            high = _labelled_value(text, "Reference high")
            guide = (float(low), float(high)) if low and high else None
            if name and numeric:
                candidates.append((f"lab:{name.casefold()}", name, numeric[0], unit, "laboratory", guide))
        if "test result" in entry_type and "index" not in entry_type:
            name = _labelled_value(text, "Tests") or _labelled_value(text, "Result type")
            raw_result = _labelled_value(text, "Result") or ""
            numeric = _number_and_unit(raw_result)
            if name:
                key = f"lab:{name.casefold()}"
                guide = _reference_range(raw_result)
                group = groups.setdefault(key, {"key": key, "label": name, "kind": "laboratory", "unit": numeric[1] if numeric else "", "guide_low": guide[0] if guide else None, "guide_high": guide[1] if guide else None, "guide_kind": "source reference range" if guide else None, "points": []})
                group["points"].append({"event_id": row["id"], "date": row["event_date"], "value": numeric[0] if numeric else None, "display": raw_result, "source_text": text, "source_file": row["source_file"], "organisation": row["organisation"], "capture_sha256": row["capture_sha256"], "parser_version": row["parser_version"], "confidence": row["parse_confidence"]})
        pressure = re.search(r"\b(\d{2,3})\s*/\s*(\d{2,3})\b", text)
        if pressure and ("blood pressure" in entry_type or "blood pressure" in text.casefold()):
            candidates.extend([
                ("metric:blood-pressure-systolic", "Blood pressure — systolic", float(pressure.group(1)), "mmHg", "metric", (90, 120)),
                ("metric:blood-pressure-diastolic", "Blood pressure — diastolic", float(pressure.group(2)), "mmHg", "metric", (60, 80)),
            ])
        for key, label, pattern, unit, guide in (
            ("metric:weight", "Weight", r"\bweight\D{0,20}(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)", "kg", None),
            ("metric:bmi", "BMI", r"\bbmi\D{0,12}(\d+(?:\.\d+)?)", "kg/m²", (18.5, 24.9)),
        ):
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                candidates.append((key, label, float(match.group(1)), unit, "metric", guide))
        for key, label, value, unit, kind, guide in candidates:
            guide_kind = "NHS general guide" if key.startswith("metric:blood-pressure") or key == "metric:bmi" else ("source reference range" if guide else None)
            group = groups.setdefault(key, {"key": key, "label": label, "kind": kind, "unit": unit, "guide_low": guide[0] if guide else None, "guide_high": guide[1] if guide else None, "guide_kind": guide_kind, "points": []})
            group["points"].append({"event_id": row["id"], "date": row["event_date"], "value": value, "display": f"{value:g} {unit}".strip(), "source_text": text, "source_file": row["source_file"], "organisation": row["organisation"], "capture_sha256": row["capture_sha256"], "parser_version": row["parser_version"], "confidence": row["parse_confidence"]})
    return {"generated_at": datetime.now(UTC).isoformat(), "groups": sorted(groups.values(), key=lambda item: (item["kind"], item["label"].casefold()))}


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
