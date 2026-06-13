# Backlink Parity Benchmark (Helio vs Ahrefs/SEMrush)

## Purpose
Produce **measured** parity numbers using the same domains and exported backlink data.

## 1) Place baseline CSV files
Create a folder (recommended):

`/Users/Hamzaa/Documents/Helio/reports/baselines`

Add exports with filenames containing provider name:

- `domain_ahrefs.csv`
- `domain_semrush.csv`

Examples:

- `vnscollection.com_ahrefs.csv`
- `vnscollection.com_semrush.csv`
- `omnisocials.com_ahrefs.csv`
- `omnisocials.com_semrush.csv`

## 2) Required CSV columns
At least one of these referring-page columns must exist:

- `Referring page URL`
- `Source URL`
- `source_url`
- `referring page`
- `url_from`
- `url`

Optional target column (used if present):

- `Target URL`
- `target`
- `url_to`
- `destination url`

## 3) Run parity benchmark

```bash
npm run helio-backlinks:parity -- --baseline-dir reports/baselines
```

## 4) Output
Script writes a report file:

`/Users/Hamzaa/Documents/Helio/reports/backlink-parity-benchmark-<timestamp>.json`

Includes:

- Per-domain overlap hosts
- Precision %
- Recall %
- F1 %
- Final parity % (average F1) vs Ahrefs and vs SEMrush

