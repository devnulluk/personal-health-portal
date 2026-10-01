import importlib
import json
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("MCP_API_TOKEN", "test-token")
server = importlib.import_module("server")


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def read(self, _limit): return self.payload


class HealthToolsTest(unittest.TestCase):
    def test_limit_is_bounded(self):
        self.assertEqual(server._limit(0), 1)
        self.assertEqual(server._limit(500), 50)

    def test_query_is_trimmed_and_bounded(self):
        self.assertEqual(server._query("  sleep  "), "sleep")
        self.assertEqual(len(server._query("x" * 500)), 120)

    @patch("server.urllib.request.urlopen")
    def test_api_get_builds_internal_request(self, urlopen):
        urlopen.return_value = FakeResponse({"items": []})
        payload = server._api_get("/events", {"limit": 5, "query": "sleep"})
        self.assertEqual(payload, {"items": []})
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.startswith(server.CLINICAL_API_URL + "/events?"))
        self.assertIn("limit=5", request.full_url)
        self.assertIn("query=sleep", request.full_url)


if __name__ == "__main__":
    unittest.main()
