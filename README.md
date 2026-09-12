# Personal Health Portal

A calm, person-centred interface for health measurements, GP records, documents and carefully governed genomic evidence. Vendors and devices are sources; the longitudinal record belongs to the person.

## Direction

- `health.newland-brown.com` is reserved for the eventual household-facing portal.
- Technical services remain under `devnull.co.uk`.
- Source systems retain provenance and original files.
- Interchange uses FHIR R4 where it fits, without discarding richer source material.
- Genomic annotations always show evidence source, review date, confidence and limitations.

The portal is deployed privately on Mobius behind Cloudflare Access. Its clinical API reads the retained GP-record SQLite database from a named Docker volume; the browser never connects to the database directly. The timeline loads live records in bounded batches and presents record detail in a desktop split view or mobile sheet.

The architecture includes a read-only MCP query layer, regular longitudinal analysis, structured FHIR family history, NHS/ICD terminology provenance and an evidence-versioned genomics pipeline. See the `docs/` directory.

The first evidence-first [timeline explorer](docs/TIMELINE-EXPLORER.md) is live. It turns a deliberately limited set of natural-language-style questions into visible deterministic filters, keeping source records and uncertainty in view. The [data-source overview](docs/DATA-SOURCE-OVERVIEW.md) reports retained clinical captures and can consume a sanitised Google importer freshness signal without exposing its credentials or health measurements.

## Mobius deployment

`compose.mobius.yml` runs three containers:

- `portal`: the browser interface;
- `clinical-api`: a private read API and authenticated atomic database-import endpoint;
- `gateway`: the only published container, routing `/api/clinical/` to the API and all other requests to the portal.

The clinical database is held in the `personal-health-clinical-data` named volume. Recreating or updating containers does not replace that volume. Published images use `pull_policy: always`, so a Portainer redeploy retrieves the current tested image instead of silently retaining an older `latest` tag.

The current GP snapshot contains real private data only on Mobius. No medical database or source capture is committed to this repository.

## Safety

This software displays and organises personal information. It does not diagnose or recommend treatment. Pharmacogenomic and clinical decision support must be evidence-linked, versioned and reviewed by qualified professionals.

## AI disclosure

This project is explicitly vibe coded. Its initial product design, code, documentation and visual assets were produced collaboratively by Mark Brown with OpenAI Codex/ChatGPT. AI output is reviewed and tested, and is not treated as medical evidence.

## Licence

MIT.
