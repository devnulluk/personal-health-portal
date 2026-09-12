import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app as clinical


class SourceOverviewTests(unittest.TestCase):
    def test_source_classification_is_explicit(self):
        self.assertEqual(clinical.source_key("https://systmonline.tpp-uk.com/", ""), ("systmonline", "SystmOnline GP record"))
        self.assertEqual(clinical.source_key("pkb-fhir-export", ""), ("patients-know-best", "Patients Know Best"))

    def test_unconfigured_google_status_is_honest(self):
        with patch.object(clinical, "GOOGLE_STATUS_URL", ""), patch.object(clinical, "GOOGLE_STATUS_USER", ""), patch.object(clinical, "GOOGLE_STATUS_PASSWORD", ""):
            self.assertEqual(clinical.google_importer_status()["state"], "not_linked")

    def test_overview_uses_retained_capture_time(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "records.sqlite3"
            connection = sqlite3.connect(database)
            connection.executescript("""
                CREATE TABLE raw_capture (sha256 TEXT PRIMARY KEY, source_uri TEXT NOT NULL, captured_at TEXT NOT NULL, content_type TEXT NOT NULL, content BLOB NOT NULL);
                CREATE TABLE parsed_event (id INTEGER PRIMARY KEY, capture_sha256 TEXT NOT NULL, source_file TEXT NOT NULL, event_date TEXT NOT NULL, author TEXT NOT NULL, organisation TEXT NOT NULL, entry_type TEXT NOT NULL, source_text TEXT NOT NULL, parser_version TEXT NOT NULL, parse_confidence REAL NOT NULL, parse_notes TEXT NOT NULL);
                CREATE TABLE coding_assertion (id INTEGER PRIMARY KEY);
                CREATE TABLE coding_review (id INTEGER PRIMARY KEY);
                CREATE TABLE analysis_finding (id INTEGER PRIMARY KEY);
                INSERT INTO raw_capture VALUES ('abc', 'https://systmonline.tpp-uk.com/record', '2026-09-12T08:00:00+00:00', 'text/html', X'00');
                INSERT INTO parsed_event VALUES (1, 'abc', 'record.html', '2026-09-10', '', 'GP surgery', 'Observation', 'Source wording', '0.4.0', 1, '[]');
            """)
            connection.commit()
            connection.close()
            with patch.object(clinical, "DATABASE", database), patch.object(clinical, "GOOGLE_STATUS_URL", ""):
                payload = clinical.overview_sources()
            systm = next(item for item in payload["sources"] if item["source_key"] == "systmonline")
            self.assertEqual(systm["state"], "imported")
            self.assertEqual(systm["latest_capture_at"], "2026-09-12T08:00:00+00:00")
            self.assertEqual(systm["current_event_count"], 1)


if __name__ == "__main__":
    unittest.main()
