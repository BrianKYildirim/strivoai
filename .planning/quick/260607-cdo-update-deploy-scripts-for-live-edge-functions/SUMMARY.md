---
status: complete
completed: 2026-06-07
quick_id: 260607-cdo
slug: update-deploy-scripts-for-live-edge-functions
---

# Quick Summary: Update Deploy Scripts for Live Edge Functions

## Completed

- Updated `scripts/deploy-staging.ps1` and `scripts/deploy-production.ps1`.
- Added missing live deployable functions:
  - `extract-analysis-structure`
  - `lifecycle-archive-writer`
  - `recruiting-lens`
- Left existing compatibility/shim functions in place; no deployed function entries were removed.

## Verification

- PASS: deployable function inventory (`supabase/functions/*/index.ts`) compared against both scripts: `missing=0`, `extra=0`, `count=38`.
- PASS: PowerShell parser check for both edited scripts.

## Notes

- Non-deployable directories (`_shared`, `_tests`, `node_modules`) were excluded because they do not have function `index.ts` entrypoints.
- The known dead `interview-prep-coach` function is not present in repo source and is not listed in either deploy script.
