# Personal Health Portal

A calm, person-centred interface for health measurements, GP records, documents and carefully governed genomic evidence. Vendors and devices are sources; the longitudinal record belongs to the person.

## Direction

- `health.newland-brown.com` is reserved for the eventual household-facing portal.
- Technical services remain under `devnull.co.uk`.
- Source systems retain provenance and original files.
- Interchange uses FHIR R4 where it fits, without discarding richer source material.
- Genomic annotations always show evidence source, review date, confidence and limitations.

The current screen is a representative shell with sample status values. It does not yet connect to private health APIs.

The architecture includes a read-only MCP query layer, regular longitudinal analysis, structured FHIR family history, NHS/ICD terminology provenance and an evidence-versioned genomics pipeline. See the `docs/` directory.

## Safety

This software displays and organises personal information. It does not diagnose or recommend treatment. Pharmacogenomic and clinical decision support must be evidence-linked, versioned and reviewed by qualified professionals.

## AI disclosure

This project is explicitly vibe coded. Its initial product design, code, documentation and visual assets were produced collaboratively by Mark Brown with OpenAI Codex/ChatGPT. AI output is reviewed and tested, and is not treated as medical evidence.

## Licence

MIT.
