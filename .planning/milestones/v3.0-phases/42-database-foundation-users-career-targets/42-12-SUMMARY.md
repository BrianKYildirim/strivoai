---
phase: 42-database-foundation-users-career-targets
plan: 12
subsystem: database
tags: [postgres, storage, pg_cron, plpgsql, lifecycle, retention, rls, security-definer]

requires:
  - phase: 42-03
    provides: resume_versions + linkedin_versions tables (retention FK targets)
  - phase: 42-06
    provides: linkedin_versions with linkedin_grade_id FK
  - phase: 42-08
    provides: analysis_results/analysis_cache tables

provides:
  - ai-archives Storage bucket (private, per-user-folder RLS — 3 policies mirroring resumes/)
  - archive_path text NULL column on 7 tables (resumes, linkedin_grades, analysis_results, analysis_cache, interview_quizzes, interview_quiz_answers, profiles)
  - run_lifecycle_sweep() SECURITY-DEFINER pl/pgsql function — DB-RET-01 two-phase mark pattern (6 data classes; job_descriptions explicitly skipped)
  - lifecycle_sweep_nightly pg_cron at 04:00 UTC (pure-SQL invocation, no GUC dependency)
  - retention-policy.md doc with full DB-RET-01 policy table + operator reconciliation #2 footnote
affects: [42-13, phase-verification]

tech-stack:
  added: []
  patterns:
    - Two-phase archive design: sweep MARKS rows (sets archive_path) without nulling inline; Plan 42-13 archive-writer edge fn uploads to Storage then NULLs inline
    - Pure-SQL pg_cron invocation (no HTTP webhook / no GUC dependency) — Supabase restricts ALTER DATABASE SET on app.* params; pure-SQL pattern is the correct approach for in-DB crons
    - SECURITY DEFINER + REVOKE ALL FROM PUBLIC + SET search_path = public — same shape as run_benchmarks_rollup() (Plan 42-11)
    - ADD COLUMN IF NOT EXISTS for idempotent additive schema changes across 7 tables
    - Storage bucket RLS mirrors resumes/ bucket pattern (migration 20251113102013)

key-files:
  created:
    - supabase/migrations/20260525000007_phase42_layer5_lifecycle_archive.sql
    - .planning/phases/42-database-foundation-users-career-targets/retention-policy.md
  modified:
    - src/integrations/supabase/types.ts

key-decisions:
  - "Pure-SQL cron body (SELECT public.run_lifecycle_sweep()) — GUC-based HTTP pre-step removed because Supabase restricts app.* GUC writes; pure-SQL matches benchmarks_nightly pattern and is simpler"
  - "Two-phase archive design: this plan only marks rows (archive_path set, inline column stays); Plan 42-13 handles the Storage upload + inline NULL atomically"
  - "analysis_cache TTL guard (T-42-PHASE37): only mark when created_at < now()-30d AND last_hit_at < now()-7d to protect Phase 29 cache hit-rate KPI"
  - "interview_quizzes.star_answer + interview_quiz_answers.scoring_breakdown are DROP-ONLY (no archive) — directly nulled at 7d; archive_path stays NULL"
  - "job_descriptions explicitly excluded per SPEC L4 load-bearing constraint"
  - "operator reconciliation #2: linkedin_grades.grading_data retention condition simplified to EXISTS linkedin_versions.linkedin_grade_id ref (per-user shape per migrations 20251223075804 + 20260410235959)"

patterns-established:
  - "Two-phase lifecycle archive: DB sweep marks archive_path; edge fn completes upload + NULL"
  - "Supabase-safe pg_cron for in-DB functions: pure SELECT fn() body, no net.http_post, no GUC"
  - "Storage bucket bootstrap in migration: INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING"

requirements-completed: [DB-STO-01, DB-RET-01, DB-LIF-01, DB-LIF-02]

duration: ~2 sessions
completed: 2026-05-28
---

# Phase 42-12: L5 Lifecycle Archive — Storage Bucket + Sweep Function + Cron Summary

**`ai-archives` private Storage bucket with per-user-folder RLS, `archive_path` columns on 7 tables, SECURITY-DEFINER `run_lifecycle_sweep()` implementing DB-RET-01 two-phase mark policy, and `lifecycle_sweep_nightly` pure-SQL pg_cron at 04:00 UTC — all live on staging.**

## Performance

- **Duration:** ~2 sessions
- **Completed:** 2026-05-28
- **Tasks:** 3 (2 auto + 1 human-action checkpoint)
- **Files modified:** 3

## Accomplishments

- `retention-policy.md` written: full DB-RET-01 policy table (6 data classes), job_descriptions skip, cost-regression gate, operator reconciliation #2 footnote, restoration runbook pointer
- `run_lifecycle_sweep()` SECURITY-DEFINER function: two-phase mark design per 6 classes — marks `archive_path` on eligible rows, does NOT null inline columns (Plan 42-13 handles upload + null); job_descriptions explicitly excluded; returns JSONB summary with per-class action counts; idempotent (archive_path IS NULL guard prevents re-marking)
- `ai-archives` private Storage bucket + 3 per-user-folder RLS policies (INSERT/SELECT/DELETE on storage.objects, mirrors resumes/ bucket pattern)
- `archive_path text NULL` added to 7 tables via `ADD COLUMN IF NOT EXISTS` (fully additive, idempotent)
- `lifecycle_sweep_nightly` pg_cron at `0 4 * * *` — pure-SQL invocation (`SELECT public.run_lifecycle_sweep()`) with idempotent unschedule guard; no GUC dependency
- DO $$ verification block baked into migration; asserts bucket + 3 policies + 7 columns + SECURITY DEFINER + VOLATILE + REVOKE FROM PUBLIC + cron schedule + manual invocation returns valid jsonb + idempotency
- Migration applied to staging; manual invocation confirmed (valid JSONB, `job_descriptions_skipped: true`, all counts 0 on fresh staging); idempotency verified
- Types regenerated (`archive_path` reflected on all 7 tables); build green

## Task Commits

1. **Task 1: Write retention-policy.md** — `4ecf78e` (docs)
2. **Task 2: Write L5 atomic migration** — `1cd79b5` (feat)
3. **Task 2 fix: Fix 3 migration bugs** — `e3a9f2d` (fix) — wrong table for star_answer, user_id join, stale comment
4. **Task 2 fix: Remove GUC dependency from cron** — `b548ad6` (fix) — pure-SQL body; Supabase blocks app.* GUC writes
5. **Task 3: Applied to staging (human-action checkpoint)** — operator-verified

## Files Created/Modified

- `supabase/migrations/20260525000007_phase42_layer5_lifecycle_archive.sql` — bucket + RLS + 7 ADD COLUMN + run_lifecycle_sweep() + cron + backfill + cost-regression NOTICEs + DO $$ verify
- `.planning/phases/42-database-foundation-users-career-targets/retention-policy.md` — DB-RET-01 policy table + restoration runbook + cost-regression gate
- `src/integrations/supabase/types.ts` — regenerated; archive_path on 7 tables

## Decisions Made

- **Pure-SQL cron**: Supabase blocks `ALTER DATABASE SET` on `app.*` GUC params — removed HTTP pre-step, matched `benchmarks_nightly` pure-SQL pattern. Plan 42-13 will trigger `lifecycle-archive-writer` edge fn independently
- **Two-phase design**: this plan marks rows only; Plan 42-13 completes the archive (upload + NULL). Keeps this migration self-contained — no pg_net + Storage upload complexity
- **analysis_cache TTL guard**: `last_hit_at < now()-7d` is load-bearing (T-42-PHASE37 / Phase 29 KPI); sweeping recently-hit cache rows would regress hit-rate

## Deviations from Plan

### Auto-fixed Issues

**1. 3 SQL bugs in initial migration draft**
- **Found during:** Task 2 post-write review
- **Issues:** (1) `star_answer` column queried on wrong table (`interview_quizzes` instead of `interview_quiz_answers`); (2) `user_id` join for inactive-user check needed subquery through `interview_quizzes`; (3) stale comment
- **Fix:** Corrected table references and join path in Blocks 6/6b
- **Committed in:** `e3a9f2d`

**2. GUC dependency in cron body**
- **Found during:** Staging checkpoint (Task 3) — `app.internal_job_secret` returned NULL; `ALTER DATABASE SET` blocked with "permission denied"
- **Issue:** Cron body used `current_setting('app.functions_base_url', true)` and `current_setting('app.internal_job_secret', true)` for HTTP pre-step to lifecycle-archive-writer
- **Fix:** Changed to pure-SQL invocation (`SELECT public.run_lifecycle_sweep()`); Plan 42-13 will handle its own trigger mechanism
- **Committed in:** `b548ad6`

---

**Total deviations:** 2 auto-fixed (SQL correctness + GUC platform constraint)
**Impact on plan:** DB-LIF-01 fulfilled with pure-SQL cron (equivalent behavior). Plan 42-13 scope updated: needs its own invocation mechanism for the archive-writer edge fn.

## Issues Encountered

- Supabase `app.*` GUC writes blocked (platform restriction) — resolved by removing HTTP pre-step from cron; see fix commit `b548ad6`

## Self-Check: PASSED

- ✅ `ai-archives` bucket exists; 3 storage.objects RLS policies (INSERT/SELECT/DELETE) scoped to ai-archives
- ✅ `archive_path` column on all 7 tables (confirmed via verification block + psql count=7)
- ✅ `run_lifecycle_sweep()` SECURITY DEFINER + VOLATILE + REVOKE FROM PUBLIC
- ✅ `lifecycle_sweep_nightly` cron at `0 4 * * *` (pure-SQL)
- ✅ Manual invocation returns valid JSONB; `job_descriptions_skipped: true`
- ✅ Idempotency: second invocation = 0 new marks (archive_path IS NULL guard)
- ✅ Types regenerated; `npm run build` green
- ✅ DB-STO-01, DB-RET-01, DB-LIF-01, DB-LIF-02 satisfied

## Next Phase Readiness

- Plan 42-13 (Wave 5) ready to execute — ships `lifecycle-archive-writer` edge function (Storage upload + inline NULL + fall-through reader + cache hit-rate regression rerun); also needs its own cron/trigger mechanism (GUC-based approach not viable — see decisions above)

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-28*
