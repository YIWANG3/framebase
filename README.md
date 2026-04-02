# Media Resource Management

Local-first post-export photo content workspace.

This repository now treats the catalog as the core product object:

- `.mwcatalog` bundle with internal SQLite, previews, proxies, derived, jobs, and logs
- reference-based asset graph for plain RAW and plain export files
- RAW directory scanner and metadata cache
- export watcher with reverse lookup scoring centered on stable filename stems
- persistent registry for confirmed export-to-RAW mappings
- minimal Electron shell that surfaces summary and pending matches

## Repository layout

- `services/sidecar`: Python sidecar for catalog indexing, reverse lookup, registry, and backend services
- `apps/desktop`: minimal Electron shell for local inspection
- `tests`: backend smoke tests for scan and reverse lookup
- `docs/current-plan.md`: verified status, performance recap, and next-step plan

## Quick start

Initialize a catalog bundle:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace init-catalog --catalog data/default.mwcatalog
```

Scan a RAW directory:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace scan-raw \
  --catalog data/default.mwcatalog \
  --raw-dir /path/to/raw-library
```

This now defaults to the review-oriented fast path:

- `--fingerprint-mode head-only`
- `--metadata-profile matcher`

Backfill fuller RAW metadata later:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace enrich-raw \
  --catalog data/default.mwcatalog \
  --workers 8
```

Resolve a single export:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace resolve-export \
  --catalog data/default.mwcatalog \
  --path /path/to/export.jpg
```

Resolve an export directory in batch:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace resolve-export-batch \
  --catalog data/default.mwcatalog \
  --export-dir /path/to/exports
```

Run the polling export watcher:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace watch-export \
  --catalog data/default.mwcatalog \
  --export-dir /path/to/exports
```

Generate cached previews or proxies inside the catalog:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace generate-previews \
  --catalog data/default.mwcatalog \
  --kind preview \
  --asset-type export \
  --limit 200
```

List pending manual confirmations:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace list-pending \
  --catalog data/default.mwcatalog
```

Confirm a match:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace confirm-match \
  --catalog data/default.mwcatalog \
  --export-path /path/to/export.jpg \
  --raw-asset-id raw_1234567890abcdef
```

Export reviewed catalog rows into a ground-truth CSV:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace export-ground-truth \
  --catalog data/default.mwcatalog \
  --status matched \
  --output-csv data/ground-truth/review-seed.csv
```

Run a repeatable dataset benchmark across metadata, scan, resolve, and preview:

```bash
PYTHONPATH=services/sidecar/src python3 -m media_workspace benchmark-dataset \
  --catalog data/benchmarks/resources-large.mwcatalog \
  --raw-dir RESOURCES/RAW \
  --export-dir RESOURCES/Export \
  --report-json data/benchmarks/resources-large.json
```

Electron shell:

```bash
cd apps/desktop
npm install
MEDIA_WORKSPACE_CATALOG=../../data/default.mwcatalog npm start
```

## Current scope

The backend is intentionally conservative:

- catalog owns cache artifacts, not source RAW/export files
- RAW identity is fingerprint-based, not path-based
- reverse lookup writes a permanent registry row once confirmed
- export watching is polling-based to avoid adding native dependencies in Phase 0
- reverse lookup treats stable filename stems as the primary feature
- file-level metadata is an enhancement, not a product assumption

This is enough to validate the core workflow before adding thumbnails, proxy generation, visual hashes, content drafts, and AI/plugin layers.
