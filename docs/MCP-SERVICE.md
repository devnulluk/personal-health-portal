# Private MCP service

The portal includes a read-only Model Context Protocol endpoint so an authorised assistant
can query a bounded view of the longitudinal record without receiving database access.

## Connection

- URL on Mobius: `http://10.30.30.2:31020/mcp`
- Transport: Streamable HTTP
- Authentication: `Authorization: Bearer <MCP_API_TOKEN>`

Create a long random `MCP_API_TOKEN` in the Portainer stack environment. This credential is
separate from the clinical import token and the private genomics-service token. A Docker
secret can instead be mounted and referenced with `MCP_API_TOKEN_FILE`.

## Read-only tools

| Tool | Purpose |
| --- | --- |
| `health_summary` | Retained record, review and capture counts |
| `health_sources` | Source freshness, import state and coverage |
| `search_health_records` | Bounded GP/clinical-record search with provenance |
| `health_observations` | Lab and metric histories with available source ranges |
| `wearable_summary` | Bounded activity, sleep, recovery and body summaries |
| `genomics_report` | Aggregate private genome/evidence index progress |
| `genomic_findings` | Bounded evidence-linked findings with called genotype |

Search text is capped at 120 characters, individual result pages at 50, and observation
series at 50 points by default. Each tool is
annotated read-only and non-destructive. Audit events contain the tool name, safe filter
metadata and result count, never the returned medical content or search text.

## Trust boundary

```text
authorised MCP client
       │ bearer token
       ▼
gateway /mcp ──► health-mcp ──► clinical-api ──► retained sources
                       read-only       │
                                       ├── Open Wearables
                                       └── genomics-monitor
```

The MCP container has no database volume and receives none of the downstream service
credentials. The clinical API remains the sole policy and redaction boundary.
DNS-rebinding protection remains enabled; `MCP_ALLOWED_HOSTS` contains an explicit,
comma-separated allowlist for the Mobius gateway and any approved portal hostname.

The dedicated bearer token is the private single-user deployment's bootstrap authentication.
Before exposing the MCP endpoint beyond Cloudflare Access/the trusted network, replace it
with OAuth 2.1 resource-server validation, explicit scopes and consent. Keep AI answers
separate from canonical facts: retrieved records are evidence, not diagnosis or treatment.
