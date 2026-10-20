---
phase: 29
plan: 02
subsystem: database
tags: [phase-29, cache, migration, resumes, schema]
requires: []
provides:
  - "public.resumes.extracted_text text NULL"
  - "public.resumes.text_hash text NULL"
  - "public.resumes.resumes_text_hash_idx partial index"
affects:
  - "Plan 29-05 (cache-fingerprint.ts reads text_hash)"
  - "Plan 29-08 (analyze-resume + ocr-pdf write extracted_text + text_hash)"
  - "Phase 37 per-feature cache lookup (consumes text_hash)"
tech_stack:
  added: []
  patterns:
    - "ADD COLUMN IF NOT EXISTS + COMMENT + DO-block verification (mirrors 20260429000000)"
    - "Partial btree index using WHERE col IS NOT NULL for selective lookups"
key_files:
  created:
    - "supabase/migrations/20260512000001_resumes_extracted_text.sql"
  modified: []
decisions:
  - "Additive nullable columns only — no backfill; legacy rows stay NULL until Plan 29-08 wiring re-analyzes them"
  - "Partial index predicate (WHERE text_hash IS NOT NULL) keeps the index small over the NULL-heavy legacy fleet"
  - "Forward-only rollout per NFR-01 — destructive removals are intentionally omitted; future rollback would be a new forward migration"
  - "text_hash is distinct from existing file_hash: file_hash is bytes-only and does NOT identify the same content across re-OCRs, while text_hash fingerprints canonicalized extracted text"
requirements_satisfied: [CACHE-03, NFR-01]
threats_mitigated: [T-29-MIG-REPLAY]
metrics:
  duration: "<5 minutes"
  completed: 2026-05-12
  tasks: 1
  files_changed: 1
---

# Phase 29 Plan 02: resumes.extracted_text + text_hash Summary

One-liner: Added nullable `extracted_text` + `text_hash` columns and a partial btree index on `text_hash` to `public.resumes` via a re-runnable migration, laying the schema substrate for the Phase 29 cache-fingerprint path (CACHE-03) without backfilling legacy rows.

## What Shipped

- **Migration:** `supabase/migrations/20260512000001_resumes_extracted_text.sql`
  - `ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS extracted_text text NULL`
  - `ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS text_hash text NULL`
  - `COMMENT ON COLUMN` for both new columns referencing CACHE-03 + the file_hash distinction
  - `CREATE INDEX IF NOT EXISTS resumes_text_hash_idx ON public.resumes (text_hash) WHERE text_hash IS NOT NULL`
  - `DO $$ ... $$` verification block that asserts both columns and the index landed, with `RAISE EXCEPTION` on mismatch and `RAISE NOTICE 'Phase 29 CACHE-03 verification passed'` on success.

## Columns Added

| Column                          | Type        | Nullable | Purpose                                                                                       |
| ------------------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------- |
| `public.resumes.extracted_text` | `text`      | YES      | Raw text extracted from the resume PDF; written by Plan 29-08 wiring; consumed in Phase 37    |
| `public.resumes.text_hash`      | `text`      | YES      | SHA-256 hex of canonicalized `extracted_text`; deterministic resume identity for cache reads  |

## Index Added

| Index                    | Definition                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| `resumes_text_hash_idx`  | `btree (text_hash) WHERE text_hash IS NOT NULL` on `public.resumes`       |

The partial predicate skips legacy NULL rows, keeping the index compact during the slow-bake migration to populated text_hash values driven by Plan 29-08.

## Threats Mitigated

| Threat ID         | Mitigation                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T-29-MIG-REPLAY   | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + read-only DO-block make re-running the migration a no-op (NFR-01). |

`T-29-INPUT-LEN` is `accept` per the plan's threat register — the new columns inherit the existing `resumes` row-level security (user_id-scoped) and introduce no new attack surface.

## Deviations from Plan

### Minor Adjustment (out of scope of Rules 1–4)

**[Plan-gate compatibility] Reworded one comment line to avoid the verification regex.**
- **Found during:** Task 1 automated verification.
- **Issue:** The plan's content gate runs `\bDROP\s+(COLUMN|INDEX)\b` (case-insensitive) over the entire file and rejects any match. The header originally documented re-runnability with the phrase "no DROP COLUMN, no DROP INDEX, no destructive ALTER", which triggered the gate even though those tokens appeared only in a comment.
- **Fix:** Reworded the comment to "no destructive column/index removal, no destructive ALTER." Semantics preserved; the file still contains zero executable `DROP COLUMN` / `DROP INDEX` statements.
- **Files modified:** `supabase/migrations/20260512000001_resumes_extracted_text.sql`
- **Commit:** `99ab433`

No other deviations. Plan executed as written.

## Commits

| Task | Description                                           | Commit    |
| ---- | ----------------------------------------------------- | --------- |
| 1    | Create resumes.extracted_text + text_hash migration   | `99ab433` |

## Acceptance Criteria

- [x] File `supabase/migrations/20260512000001_resumes_extracted_text.sql` exists.
- [x] Contains `ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS extracted_text text` and `ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS text_hash text`.
- [x] Contains `COMMENT ON COLUMN` for both new columns referencing CACHE-03.
- [x] Contains `CREATE INDEX IF NOT EXISTS resumes_text_hash_idx` with `WHERE text_hash IS NOT NULL`.
- [x] Contains a DO-block with `RAISE EXCEPTION` (failure path) and `RAISE NOTICE` (success path).
- [x] Contains zero executable `DROP COLUMN` or `DROP INDEX` clauses.
- [ ] Schema-push verification deferred to Plan 29-10 (out of scope here).

## Follow-ups (Not in this Plan)

- **Plan 29-08** wires `analyze-resume/index.ts` + `ocr-pdf/index.ts` to populate `extracted_text` and `text_hash` on the next analyze run.
- **Plan 29-05** ships `_shared/cache-fingerprint.ts` which produces the canonical SHA-256 input for `text_hash`.
- **Plan 29-10** performs the staging schema push and runs the verification SELECT from `information_schema.columns`.
- **Phase 37** consumes `text_hash` for per-feature cache lookups.

## Known Stubs

None. This plan ships a schema substrate intentionally — `extracted_text` / `text_hash` are populated by Plan 29-08 wiring, which is its explicit scope, not an unintentional stub.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260512000001_resumes_extracted_text.sql`
- FOUND: commit `99ab433`
- Plan content gate (`node -e ...` from Task 1 `<verify>` block): OK
