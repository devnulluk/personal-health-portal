from __future__ import annotations

import os
import secrets
import sqlite3
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

DATABASE = Path(os.environ.get("CLINICAL_DATABASE", "/data/records.sqlite3"))
IMPORT_TOKEN = os.environ.get("CLINICAL_IMPORT_TOKEN", "")
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
                     capture_sha256, parser_version, parse_confidence, parse_notes
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
