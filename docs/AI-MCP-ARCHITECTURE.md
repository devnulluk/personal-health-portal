# AI and MCP architecture

## Objective

Allow people to ask useful questions across measurements, clinical records, family history and genomic evidence without giving a model unrestricted access or authority.

## Query layers

1. Deterministic analytics computes trends, baselines, change points, coverage and data-quality indicators.
2. A read-only health query service exposes narrowly scoped, provenance-rich results.
3. An MCP server publishes resources and read-only tools over the query service.
4. An AI assistant explains returned evidence and uncertainty; it does not query raw databases directly.

## Initial MCP surface

- `health.summary`: dated source and coverage summary.
- `health.metrics`: bounded observations with units and provenance.
- `health.trends`: precomputed trend results and method metadata.
- `health.conditions`: coded conditions and mapping provenance.
- `health.medications`: medication history without prescribing actions.
- `health.family_history`: structured relationships and conditions.
- `health.genomic_evidence`: reviewed variant assertions, never unfiltered WGS.
- `health.sources`: freshness, quality and import status.

All tools are read-only in the first release. Results are bounded by date, type and count, and every clinical or genomic fact carries source references.

## Security

- OAuth 2.1 for remote HTTP MCP, PKCE, exact redirect URIs and audience-bound tokens.
- Separate scopes for metrics, records, family history and genomic evidence.
- Explicit consent before a client receives health data.
- Audit every query, tool call, scope and returned record count without logging record contents.
- Never permit token passthrough.
- Treat tool descriptions and retrieved documents as untrusted input.

## AI output contract

Every analysis separates observations, algorithmic findings, possible interpretations and suggested questions. Recommendations must cite the evidence used, identify uncertainty and state whether clinician review is appropriate. AI output never changes the canonical record.
