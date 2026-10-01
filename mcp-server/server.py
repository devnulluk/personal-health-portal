"""Read-only MCP façade for the Personal Health Portal.

The service deliberately talks to the bounded clinical API rather than opening any
database. Tool arguments and response sizes are constrained, and audit logs contain
metadata only—not health-record contents.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from starlette.responses import JSONResponse

CLINICAL_API_URL = os.environ.get("CLINICAL_API_URL", "http://clinical-api:8000").rstrip("/")
MAX_RESULT_LIMIT = 50
MAX_QUERY_LENGTH = 120

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(message)s")
LOGGER = logging.getLogger("personal-health-mcp")


def _read_secret() -> str:
    value = os.environ.get("MCP_API_TOKEN", "").strip()
    path = os.environ.get("MCP_API_TOKEN_FILE", "").strip()
    if not value and path:
        value = Path(path).read_text(encoding="utf-8").strip()
    return value


API_TOKEN = _read_secret()
if not API_TOKEN:
    raise RuntimeError("Set MCP_API_TOKEN or MCP_API_TOKEN_FILE before starting the MCP service")

ALLOWED_HOSTS = [
    host.strip() for host in os.environ.get(
        "MCP_ALLOWED_HOSTS",
        "127.0.0.1:*,localhost:*,10.30.30.2:*,health.newland-brown.com",
    ).split(",") if host.strip()
]


def _audit(tool: str, result_count: int | None = None, **parameters: Any) -> None:
    safe_parameters = {
        key: value for key, value in parameters.items()
        if key in {"category", "entry_type", "kind", "limit", "offset", "days", "has_query"}
    }
    LOGGER.info(json.dumps({
        "event": "mcp_tool_call",
        "at": datetime.now(UTC).isoformat(),
        "tool": tool,
        "parameters": safe_parameters,
        "result_count": result_count,
    }, separators=(",", ":")))


def _limit(value: int) -> int:
    return max(1, min(int(value), MAX_RESULT_LIMIT))


def _query(value: str) -> str:
    return str(value or "").strip()[:MAX_QUERY_LENGTH]


def _api_get(path: str, parameters: dict[str, Any] | None = None) -> dict[str, Any]:
    query = f"?{urlencode(parameters)}" if parameters else ""
    request = urllib.request.Request(
        f"{CLINICAL_API_URL}{path}{query}",
        headers={"Accept": "application/json", "User-Agent": "personal-health-mcp/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read(8 * 1024 * 1024))
    except (OSError, ValueError, urllib.error.HTTPError) as error:
        raise RuntimeError("The private health data service is temporarily unavailable") from error
    if not isinstance(payload, dict):
        raise RuntimeError("The private health data service returned an unexpected response")
    return payload


mcp = MCPServer(
    "Personal Health Data",
    instructions=(
        "Read-only access to Mark's private longitudinal health record. Treat all returned "
        "data as sensitive. Distinguish source facts from interpretation, preserve provenance "
        "and uncertainty, and never present results as a diagnosis or prescribing instruction."
    ),
)
READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)


@mcp.tool(annotations=READ_ONLY)
def health_summary() -> dict[str, Any]:
    """Return counts and coverage for the retained clinical record."""
    payload = _api_get("/summary")
    _audit("health_summary")
    return payload


@mcp.tool(annotations=READ_ONLY)
def health_sources() -> dict[str, Any]:
    """Return source freshness, coverage, import state and review counts."""
    payload = _api_get("/overview/sources")
    _audit("health_sources", len(payload.get("sources", [])))
    return payload


@mcp.tool(annotations=READ_ONLY)
def search_health_records(
    query: str = "", entry_type: str = "", limit: int = 25, offset: int = 0,
) -> dict[str, Any]:
    """Search retained GP/clinical records. Results include source wording, provenance and mapping confidence."""
    safe_query, safe_limit, safe_offset = _query(query), _limit(limit), max(0, int(offset))
    payload = _api_get("/events", {
        "query": safe_query, "entry_type": _query(entry_type),
        "limit": safe_limit, "offset": safe_offset,
    })
    _audit("search_health_records", len(payload.get("items", [])), limit=safe_limit,
           offset=safe_offset, entry_type=_query(entry_type), has_query=bool(safe_query))
    return payload


@mcp.tool(annotations=READ_ONLY)
def health_observations(
    kind: str = "", query: str = "", limit: int = 25, points_per_series: int = 50,
) -> dict[str, Any]:
    """Return bounded lab or physical-measurement histories with source reference ranges when available."""
    safe_limit, safe_points = _limit(limit), _limit(points_per_series)
    safe_query, safe_kind = _query(query).casefold(), _query(kind).casefold()
    payload = _api_get("/observations")
    groups = payload.get("groups", []) if isinstance(payload.get("groups"), list) else []
    selected = [dict(group) for group in groups if isinstance(group, dict)
                and (not safe_kind or str(group.get("kind", "")).casefold() == safe_kind)
                and (not safe_query or safe_query in str(group.get("label", "")).casefold())][:safe_limit]
    for group in selected:
        points = group.get("points", [])
        group["points"] = points[-safe_points:] if isinstance(points, list) else []
    result = {"generated_at": payload.get("generated_at"), "groups": selected,
              "limit": safe_limit, "points_per_series": safe_points}
    _audit("health_observations", len(selected), limit=safe_limit, kind=safe_kind, has_query=bool(safe_query))
    return result


@mcp.tool(annotations=READ_ONLY)
def wearable_summary() -> dict[str, Any]:
    """Return the current bounded wearable overview: activity, sleep, recovery and body summaries."""
    payload = _api_get("/overview/wearables")
    count = sum(len(payload.get(key, [])) for key in ("activity", "sleep", "recovery") if isinstance(payload.get(key), list))
    _audit("wearable_summary", count)
    return payload


@mcp.tool(annotations=READ_ONLY)
def genomics_report() -> dict[str, Any]:
    """Return aggregate progress and evidence counts from the private genome index."""
    payload = _api_get("/overview/genomics/report")
    _audit("genomics_report")
    return payload


@mcp.tool(annotations=READ_ONLY)
def genomic_findings(
    category: str = "clinical", query: str = "", limit: int = 20, offset: int = 0,
) -> dict[str, Any]:
    """Return bounded evidence-linked genomic findings and the called genotype. These are not diagnoses."""
    allowed = {"clinical", "health", "uncertain", "research", "trait", "ancestry"}
    safe_category = category if category in allowed else "clinical"
    safe_query, safe_limit, safe_offset = _query(query), _limit(limit), max(0, int(offset))
    payload = _api_get("/overview/genomics/findings", {
        "category": safe_category, "q": safe_query, "limit": safe_limit, "offset": safe_offset,
    })
    _audit("genomic_findings", len(payload.get("items", [])), category=safe_category,
           limit=safe_limit, offset=safe_offset, has_query=bool(safe_query))
    return payload


@mcp.custom_route("/health", methods=["GET"])
async def service_health(_request):
    return JSONResponse({"status": "ok", "service": "personal-health-mcp"})


class BearerTokenMiddleware:
    """Require a dedicated bearer token for MCP traffic, leaving only /health public."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path") != "/health":
            headers = {key.lower(): value for key, value in scope.get("headers", [])}
            supplied = headers.get(b"authorization", b"").decode("latin-1")
            expected = f"Bearer {API_TOKEN}"
            if not secrets.compare_digest(supplied, expected):
                response = JSONResponse(
                    {"error": "unauthorized"}, status_code=401,
                    headers={"WWW-Authenticate": "Bearer"},
                )
                await response(scope, receive, send)
                return
        await self.inner(scope, receive, send)


app = BearerTokenMiddleware(mcp.streamable_http_app(
    streamable_http_path="/mcp", stateless_http=True, json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=ALLOWED_HOSTS,
    ),
))
