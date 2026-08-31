# Timeline explorer

The timeline explorer is the evidence-first query surface for the personal health record. Its purpose is to answer useful longitudinal questions without hiding where an answer came from or overstating what the data proves.

## Shipped foundation

The first version runs entirely in the browser over records already returned by the private clinical API. It translates a small, explicit vocabulary into visible filters:

- record families such as medications, tests, vaccinations, letters and problems;
- records whose parser confidence or notes require review;
- records without a usable source date;
- records from the last 90 days;
- exact phrases enclosed in quotation marks.

The interface always shows its interpretation, the number of matching records and a descriptive-search warning. It does not call a language model, diagnose, recommend treatment or claim causation.

## Evidence contract

Every future answer must include:

1. the question as asked;
2. the query or filters actually executed;
3. matching source records and capture checksums;
4. the observation window and known data gaps;
5. mapping and parser confidence;
6. a clear separation between source fact, deterministic calculation, proposed interpretation and experimental analysis;
7. model, prompt and evidence versions whenever AI contributes.

No answer may silently convert an association into causation. Missing data must be shown rather than treated as normal or zero.

## Next stages

### Cross-source timeline

Normalise GP events, medication changes, Apple Health, Fitbit/Google Health, manual context and later genomic evidence into a queryable event envelope while retaining each source's native payload.

### Evidence bundles

Allow a result set to be saved as an immutable, timestamped bundle containing the records, query, provenance, confidence and dataset version. Bundles should be suitable for personal review or discussion with a clinician without exposing the entire database.

### Deterministic trends

Calculate transparent rolling baselines, changes, missing-data intervals and temporal overlaps before adding AI interpretation. Each chart or statement must expose its window, units, sample count and exclusions.

### MCP and AI

Expose a read-only, narrowly scoped MCP layer over curated query functions rather than raw unrestricted SQL. AI-generated synthesis must cite evidence-bundle record identifiers, state limitations, and remain in the experimental-analysis layer until reviewed.

### Genomic context

Genomic evidence must be versioned against a named reference assembly, source publication or knowledge base, review date and evidence strength. It may add context to a question but must not overwrite clinical facts or present research associations as personal diagnoses.

## Safety and privacy

- The browser talks only to the same-origin private API.
- Clinical records remain on Mobius.
- Public repositories contain no patient data, credentials or captures.
- Cloudflare Access protects the human-facing hostname.
- Any future external AI processing requires an explicit data-flow decision and visible disclosure.

