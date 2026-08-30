# Longitudinal analysis

## Regular jobs

- Daily: source freshness, missing-data windows, outliers, unit changes and 24-hour summaries.
- Weekly: personal baselines, sleep/activity consistency, resting-heart-rate and HRV trends, correlations and data-quality changes.
- Monthly: clinical-record additions, medication/condition timeline reconciliation, longer trends and preventive-care question prompts.
- Evidence watch: versioned genomic and pharmacogenomic source updates, processed separately from personal records.

## Method rules

- Compare a person primarily with their own baseline, not population averages.
- Account for sample count, source changes, seasonality and missingness.
- Require repeated or material changes before alerting.
- Record algorithm version, window, units and confidence with every finding.
- Do not imply causality from correlation.
- Alerts suggest review or a question; they do not diagnose or prescribe.

## Dashboard layers

- Useful: latest values, trends, coverage and record changes.
- Fun: streaks, consistency, personal bests and gentle comparisons.
- Geeky: samples, source lag, units, coding systems, provenance, windows and confidence.
