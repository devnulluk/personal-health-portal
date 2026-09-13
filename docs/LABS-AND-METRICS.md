# Labs and metrics

The portal groups numeric observations by test or measurement so a person can see history rather than isolated timeline rows.

## Evidence rules

- Only unambiguous numeric values are charted; the original source wording remains canonical.
- Each reading retains its event, capture checksum, source file, organisation, parser version and extraction confidence.
- Laboratory bands are shown only when a reference interval is present in the retained result.
- Blood pressure and BMI may show clearly labelled NHS general guides. They are contextual aids, not personalised targets or diagnoses.
- Weight has no generic ideal band because an appropriate range depends on height and personal context.
- Units are part of the group identity shown to the user. Future ingestion must normalise or separate differing units before combining series.

The private API exposes the derived view at `GET /observations`. It does not modify the retained clinical record.

## Initial supported observations

- Numeric SystmOnline test-result details
- Component-level rows from the retained SystmOnline `Pathology Investigations` section
- Systolic and diastolic blood pressure
- Weight in kilograms
- BMI

Future work should add structured Observation storage in the importer, unit normalisation, source-specific range fields and wearable metrics from Open Wearables rather than expanding heuristic extraction indefinitely.
