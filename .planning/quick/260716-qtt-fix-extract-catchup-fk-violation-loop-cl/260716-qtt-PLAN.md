---
id: 260716-qtt
slug: fix-extract-catchup-fk-violation-loop-cl
date: 2026-07-17
---

# Quick Task: Stop the extract-catchup FK violation loop

Prod postgres logs ~770 failed inserts/day: `resume_versions_user_id_fkey`,
`linkedin_versions_user_id_fkey`, `resume_versions_resume_id_fkey`, in a batch of 8 every
15 minutes, indefinitely.

## Root cause (investigated against PROD before planning — do NOT re-investigate)

`extract_catchup_nightly` (cron job 6) runs `*/15` (despite "nightly"), calling
`extract-analysis-structure`. `runCatchup` scans the oldest 50 `analysis_results` and
backfills `resume_versions` / `linkedin_versions`. Eight rows can never succeed and are
retried forever:

- **6 rows** — the user was deleted. `analysis_results` is the ONLY user-owned table with
  no FK to `auth.users`; every other table cascades (`profiles_id_fkey` is ON DELETE
  CASCADE, and the 15 orphan users have zero surviving rows in `profiles`, `resumes`,
  `linkedin_grades`, `usage_tracking`). So the rows outlive their user and the version
  insert violates `*_user_id_fkey`.
- **2 rows** — user alive, but the referenced **resume** was deleted
  (`user_exists: true, resume_exists: false`). `extract-resume.ts:173` only skips when
  `source_reference` is NULL; it never checks the resume still exists, so the insert
  violates `resume_versions_resume_id_fkey`. A user FK cascade does NOT fix these —
  `analysis_results.source_reference` is untyped text with no FK.

6 + 2 = the batch of 8 in the logs. `admin-delete-user` is NOT the culprit — it deletes
`analysis_results` explicitly (index.ts:69). The orphans come from some other deletion path
(Supabase dashboard / auth admin API); because `profiles` cascades, the path leaves no
forensic trace and cannot be identified retroactively. Do not claim which path it was.

### Second, more serious defect: the catchup window never advances

`runCatchup` (index.ts:93-99) selects the oldest 50 rows by `created_at` with **no
"not yet extracted" filter** — already-extracted rows are fetched and skipped in
application code, so they permanently occupy the window. With 84 eligible rows, ranks
51-84 are invisible to catchup and always will be. The safety net is already dead for the
newest rows and silently degrades as the table grows. Today 0 legitimate rows are starved
(`pending_legit_starved = 0`), so no user impact yet — but any future extraction failure
past rank 50 would never be repaired. Resume Analysis is business-critical.

### Why the orphans must be deleted, not just skipped

`run_lifecycle_sweep` Block 1a only sets `archive_path` when a matching
`resume_versions`/`linkedin_versions` row EXISTS, and Block 1b only deletes rows with
`archive_path IS NOT NULL AND raw_response IS NULL`. An orphan can never have a version row
(the FK forbids it), so it is never archived and never deleted: deleted users' raw AI
response blobs live on prod forever, permanently outside the retention policy. Deleting
them is a retention/privacy fix, not just log hygiene.

## Verified facts (prod, at planning time)

- `analysis_results`: 111 rows; 30 orphaned across 15 deleted users; 22 orphans are
  extractable types; `user_id` has 0 NULLs; 2 indexes already cover `user_id`.
- `analysis_results` has **no** FK constraints at all.
- `run_benchmarks_rollup` does NOT read `analysis_results` — deleting orphans cannot skew
  benchmarks. `run_lifecycle_sweep` does (see above).
- Orphan rows are unreachable by any user-facing feature (RLS keys on `user_id`; the user
  is gone).

## Sequencing (strict — later steps depend on earlier ones)

Cleanup must precede the FK or it will not validate.

---

## Task 1: Migration — delete orphans, then add the cascade FK

**File:** `supabase/migrations/20260717010000_analysis_results_user_fk_cascade.sql`
**Rollback:** `supabase/migrations/rollback/20260717010000_analysis_results_user_fk_cascade.rollback.sql`

1. `DELETE FROM public.analysis_results ar WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ar.user_id);`
2. `ALTER TABLE public.analysis_results ADD CONSTRAINT analysis_results_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`
3. Fail-loud DO block: assert 0 orphans remain AND the constraint exists with `confdeltype='c'`.

Constraints:
- Delete ONLY rows whose `user_id` has no `auth.users` row. Never touch live users' rows.
- Do not add an index (two already cover `user_id`).
- This is the destructive step. Apply to PREVIEW ONLY. Production requires operator approval.

## Task 2: Migration — `get_pending_extractions` RPC (fixes head-of-line)

**File:** `supabase/migrations/20260717010001_get_pending_extractions.sql` (+ rollback)

Create `public.get_pending_extractions(p_limit integer DEFAULT 50)` returning the
`analysis_results` columns `runCatchup` selects (`id, user_id, analysis_type,
primary_score, raw_response, source_reference, created_at`), for rows where:
- `created_at < now() - interval '5 minutes'`
- `analysis_type IN ('resume_analysis','linkedin_grading')` — `recruiting_lens` is skipped
  by the caller anyway (plan 42-08), so excluding it here stops it consuming window slots
- NO matching version row exists (`resume_versions` / `linkedin_versions` by
  `user_id` + `source_analysis_results_id`, per type)
ordered `created_at ASC`, limited to `p_limit`.

Requirements:
- `SECURITY DEFINER`, `SET search_path TO 'public'`, owned by postgres.
- Grant EXECUTE to `service_role` ONLY. Do NOT grant to `authenticated` or `anon` — this
  returns other users' `raw_response`. Fail-loud DO block asserting anon/authenticated hold
  no EXECUTE.
- Clamp `p_limit` to a sane max (e.g. least(greatest(p_limit,1), 200)).

## Task 3: Code — consume the RPC + guard the deleted-resume case

**Files:** `supabase/functions/extract-analysis-structure/index.ts`,
`supabase/functions/extract-analysis-structure/extract-resume.ts`

3a. `runCatchup` (index.ts:91-144): replace the `.from("analysis_results").select(...)
.lt(...).in(...).order(...).limit(50)` scan with an `.rpc("get_pending_extractions",
{ p_limit: 50 })` call. Keep the existing per-row `alreadyExtracted` check (harmless
belt-and-braces against races). Keep the error/summary shape and log lines. The
`recruiting_lens` skip branch stays — the RPC no longer returns those, so it simply
becomes unreachable for catchup while the direct-dispatch path (serve handler) still
uses it. Note `SupabaseClientLike` has no `rpc` member — extend the type.

3b. `extract-resume.ts` (~line 173-177): after the `!resumeId` guard, verify the resume row
still exists (`from('resumes').select('id').eq('id', resumeId).maybeSingle()`); if absent,
return `{ ok: true, skipped: true, reason: 'resume_deleted' }` with a `log.warn`, matching
the existing `missing_resume_id` shape. This must be a SKIP, not a throw — the row is
permanently unextractable and must not be retried forever.

**Verification:**
- `npm run lint`, `npm run type-check`, `npm run test`, `npm run test:edge`, `npm run build`.
- Add/extend deno tests for the `resume_deleted` skip path alongside existing
  `extract-analysis-structure` tests if a natural home exists.

## Out of scope

- Applying anything to production (operator approves; see below).
- The E2E teardown that orphans preview rows (`e2e/onboarding-flow.spec.ts:72` deletes the
  auth user only) — record as a follow-up; Task 1's FK fixes it structurally anyway.
- The 14 non-orphan `analysis_results` rows that disappeared mid-investigation (125 -> 111),
  almost certainly the 90d `run_lifecycle_sweep` terminal delete. Unrelated; note only.

## Operator gate

Apply Tasks 1 + 2 to PREVIEW and verify there. Do NOT apply to production — the prod MCP is
read-only and `supabase db push` is blocked by the harness classifier. Surface the exact
commands for the operator to run.
