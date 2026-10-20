---
phase: 29
plan: 03
subsystem: database / migrations
tags: [phase-29, history, migration, usage_tracking, record_ai_usage, HIST-01, CACHE-10]
requires:
  - public.usage_tracking (existing table, migration 20251222220418)
  - public.record_ai_usage(uuid, ai_action_type, integer) (existing 3-arg RPC)
  - public.get_billing_period_start(uuid) (existing helper)
  - public.ai_action_type (existing enum)
provides:
  - public.usage_tracking.analysis_id uuid NULL  (loose link, no FK — D-16)
  - public.record_ai_usage(uuid, ai_action_type, integer, uuid) (4-arg overload, SECURITY DEFINER)
affects:
  - Plan 29-06 (CACHE-10) — withMerits precheck-hit path can now persist analysis_id on cache-hit writes
  - Phase 36 — reads filter orphans via LEFT JOIN with NULL check
tech-stack:
  added: []
  patterns:
    - Additive nullable column with COMMENT documenting loose-link semantics
    - 4-arg RPC overload alongside existing 3-arg signature (Postgres arg-count dispatch)
    - SECURITY DEFINER + SET search_path + REVOKE ALL / GRANT EXECUTE hardening (T-11-10 / T-11-20 / T-29-RPC-PRIV)
    - Apply-time DO-block verification with RAISE EXCEPTION rollback gate
    - Re-runnable migration (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION)
key-files:
  created:
    - supabase/migrations/20260512000002_usage_tracking_analysis_id.sql
  modified: []
decisions:
  - "Preserved existing `SET search_path = public` form on the new overload to match the existing 3-arg `record_ai_usage` style (plan instruction: do not change it)."
  - "Did not drop the existing 3-arg `record_ai_usage` signature — Postgres dispatches by arg count, so every existing 3-arg caller compiles and runs unchanged across the migration window (mitigates T-29-RPC-BCOMPAT). A future migration may remove the 3-arg form once all callers move to 4 args."
  - "No foreign key on `analysis_id` per D-16 — the referenced row is polymorphic across resumes / analysis_results / linkedin_grades / saved_jobs / interview_quizzes."
  - "Preserved INSERT column ordering and added `analysis_id` as the trailing column in both the column list and the VALUES tuple."
metrics:
  duration: ~4 minutes
  completed: 2026-05-12
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 29 Plan 03: usage_tracking.analysis_id + record_ai_usage 4-arg Overload Summary

Added an additive nullable `analysis_id uuid` column to `public.usage_tracking` (no FK constraint — D-16) and shipped a new 4-arg `record_ai_usage(uuid, ai_action_type, integer, uuid)` RPC overload that persists the parameter into the new column. The existing 3-arg overload is left in place so every current edge function continues to compile and run unchanged, and Plan 29-06's withMerits precheck-hit path now has an explicit link column for CACHE-10 / D-13.

## What Shipped

Single migration file `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql` containing five sections:

1. **§1 ADD COLUMN** — `ALTER TABLE public.usage_tracking ADD COLUMN IF NOT EXISTS analysis_id uuid NULL`. No FK per D-16 (polymorphic target).
2. **§2 COMMENT** — Documents loose-link semantics: referenced row lives in `resumes` / `analysis_results` / `linkedin_grades` / `saved_jobs` / `interview_quizzes` depending on `action_type`; orphans filtered in Phase 36 via LEFT JOIN with NULL check; Plan 29-06 populates on cache-hit writes.
3. **§3 RPC overload** — `CREATE OR REPLACE FUNCTION public.record_ai_usage(p_user_id uuid, p_action_type ai_action_type, p_credits integer DEFAULT 1, p_analysis_id uuid DEFAULT NULL) RETURNS BOOLEAN`. Body mirrors original 3-arg function verbatim, INSERT extended to include `analysis_id` in column list + VALUES tuple. `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public` (preserves existing form).
4. **§4 REVOKE/GRANT** — `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated, service_role` on the new 4-arg signature (mitigates T-29-RPC-PRIV).
5. **§5 Verification DO-block** — Asserts (a) `analysis_id` column exists in `information_schema.columns` and `is_nullable='YES'`, (b) 4-arg `record_ai_usage` overload exists in `pg_proc` with `pronargs=4`, (c) the new overload has `prosecdef=true`. On any mismatch `RAISE EXCEPTION` rolls back the whole migration. On success `RAISE NOTICE 'Phase 29 HIST-01 / CACHE-10 verification passed'`.

## Verification

Plan-specified file-content gate (Task 1 `<verify><automated>`) was run and returned `OK`:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('supabase/migrations/20260512000002_usage_tracking_analysis_id.sql','utf8');const required=['ADD COLUMN IF NOT EXISTS analysis_id uuid','COMMENT ON COLUMN public.usage_tracking.analysis_id','CREATE OR REPLACE FUNCTION public.record_ai_usage','p_analysis_id uuid DEFAULT NULL','SECURITY DEFINER','GRANT EXECUTE ON FUNCTION public.record_ai_usage','TO authenticated, service_role','RAISE EXCEPTION','RAISE NOTICE'];const missing=required.filter(t=>!s.includes(t));if(missing.length){console.error('Missing:',missing);process.exit(1)}if(/\\bDROP\\s+(COLUMN|FUNCTION|TABLE)\\b/i.test(s)){console.error('Destructive DROP found');process.exit(1)}console.log('OK')"
# => OK
```

Apply-time schema verification (per Plan 29-10 after `.\scripts\deploy-staging.ps1`):

```sql
SELECT pronargs FROM pg_proc WHERE proname = 'record_ai_usage';
-- Expected: at least one row with pronargs = 4 (plus the existing 3-arg row).

SELECT data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'usage_tracking' AND column_name = 'analysis_id';
-- Expected: ('uuid', 'YES')
```

## Acceptance Criteria — All Met

- [x] File `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql` exists.
- [x] Contains `ALTER TABLE public.usage_tracking ADD COLUMN IF NOT EXISTS analysis_id uuid NULL`.
- [x] Contains `COMMENT ON COLUMN public.usage_tracking.analysis_id` referencing HIST-01.
- [x] Contains `CREATE OR REPLACE FUNCTION public.record_ai_usage(` with `p_analysis_id uuid DEFAULT NULL`.
- [x] New function INSERTs into `public.usage_tracking` with `analysis_id` in the column list and `p_analysis_id` in the VALUES tuple.
- [x] Contains `SECURITY DEFINER` and `GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) TO authenticated, service_role`.
- [x] Verification `DO $$ ... END $$` block with `RAISE EXCEPTION` failure paths and `RAISE NOTICE 'Phase 29 HIST-01 / CACHE-10 verification passed'`.
- [x] No destructive `DROP COLUMN`, `DROP FUNCTION`, or `DROP TABLE`.

## Requirements Closed

- **HIST-01** — `public.usage_tracking` now carries the loose-FK `analysis_id` column required for Phase 36's analysis-history rendering.
- **CACHE-10** — `record_ai_usage` 4-arg overload makes per-cache-hit `analysis_id` persistence implementable from the `withMerits` precheck-hit path (Plan 29-06).
- **NFR-01** — Migration is re-runnable (`ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION`); no destructive ops; roll-forward only.

## Threat Mitigations

| Threat ID         | Disposition | How Mitigated                                                                                                                                            |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-29-FK-ORPHAN    | accept      | No cascade DELETE on the loose link (D-16). Orphans filtered at query time in Phase 36 via LEFT JOIN with NULL check. Audit history preserved.           |
| T-29-RPC-PRIV     | mitigate    | `SECURITY DEFINER` + `SET search_path = public` + `REVOKE ALL ... FROM public` + `GRANT EXECUTE ... TO authenticated, service_role` on the new overload. |
| T-29-RPC-BCOMPAT  | mitigate    | Existing 3-arg signature is preserved; Postgres dispatches by arg count, so concurrent edge function deploys cannot break across the migration window.   |

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gates

None encountered.

## Known Stubs

None.

## Deferred Issues

None.

## Self-Check: PASSED

- `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql` — present in worktree
- commit `f437260` — present in `git log`
- File-content gate (plan-specified `node -e` check) — returned `OK`
