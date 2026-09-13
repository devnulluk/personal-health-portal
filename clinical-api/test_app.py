import sqlite3
import tempfile
import unittest
from datetime import UTC, datetime
from json import dumps
from pathlib import Path
from unittest.mock import MagicMock, patch

import app as clinical


class SourceOverviewTests(unittest.TestCase):
    def test_source_classification_is_explicit(self):
        self.assertEqual(clinical.source_key("https://systmonline.tpp-uk.com/", ""), ("systmonline", "SystmOnline GP record"))
        self.assertEqual(clinical.source_key("pkb-fhir-export", ""), ("patients-know-best", "Patients Know Best"))

    def test_unconfigured_google_status_is_honest(self):
        with patch.object(clinical, "GOOGLE_STATUS_URL", ""), patch.object(clinical, "GOOGLE_STATUS_USER", ""), patch.object(clinical, "GOOGLE_STATUS_PASSWORD", ""):
            self.assertEqual(clinical.google_importer_status()["state"], "not_linked")

    def test_unconfigured_apple_status_is_honest(self):
        with patch.object(clinical, "OPEN_WEARABLES_STATUS_URL", ""), patch.object(clinical, "OPEN_WEARABLES_USER_ID", ""), patch.object(clinical, "OPEN_WEARABLES_API_KEY", ""):
            self.assertEqual(clinical.apple_health_status()["state"], "not_linked")

    def test_recent_successful_apple_upload_is_fresh(self):
        event = [{"provider": "apple", "source": "sdk", "stage": "completed", "status": "success", "timestamp": datetime.now(UTC).isoformat()}]
        response = MagicMock()
        response.read.return_value = dumps(event).encode()
        response.__enter__.return_value = response
        with patch.object(clinical, "OPEN_WEARABLES_STATUS_URL", "http://open-wearables"), patch.object(clinical, "OPEN_WEARABLES_USER_ID", "user"), patch.object(clinical, "OPEN_WEARABLES_API_KEY", "key"), patch("app.urllib.request.urlopen", return_value=response):
            self.assertEqual(clinical.apple_health_status()["state"], "fresh")

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

    def test_observations_group_labs_and_blood_pressure(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "records.sqlite3"
            connection = sqlite3.connect(database)
            connection.executescript("""
                CREATE TABLE raw_capture (sha256 TEXT PRIMARY KEY, source_uri TEXT, captured_at TEXT, content_type TEXT, content BLOB);
                CREATE TABLE parsed_event (id INTEGER PRIMARY KEY, capture_sha256 TEXT, source_file TEXT, event_date TEXT, author TEXT, organisation TEXT, entry_type TEXT, source_text TEXT, parser_version TEXT, parse_confidence REAL, parse_notes TEXT);
                CREATE TABLE coding_assertion (id INTEGER PRIMARY KEY);
                CREATE TABLE coding_review (id INTEGER PRIMARY KEY);
                CREATE TABLE analysis_finding (id INTEGER PRIMARY KEY);
                INSERT INTO parsed_event VALUES (1,'a','lab.html','2026-09-01','','GP','Test result','Tests: Haemoglobin; Result: 142 g/L (reference range 130-180)','0.4.0',.99,'[]');
                INSERT INTO parsed_event VALUES (2,'b','record.html','2026-09-02','','GP','Blood pressure','Blood pressure 118/76 mmHg','0.4.0',1,'[]');
            """)
            connection.commit(); connection.close()
            with patch.object(clinical, "DATABASE", database):
                groups = clinical.observations()["groups"]
            self.assertEqual(len(groups), 3)
            lab = next(group for group in groups if group["key"].startswith("lab:"))
            self.assertEqual(lab["guide_high"], 180)


if __name__ == "__main__":
    unittest.main()
