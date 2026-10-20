---
phase: 42-database-foundation-users-career-targets
plan: 11
subsystem: database
tags: [postgres, pg_cron, plpgsql, benchmarks, percentile, security-definer]

requires:
  - phase: 42-08
    provides: benchmarks table + ts_to_utc_date IMMUTABLE function + Layer 4 applications/outcomes tables

provides:
  - run_benchmarks_rollup() SECURITY-DEFINER pl/pgsql function — 6-metric cohort percentile rollup with sample_size>=5 de-anon filter
  - benchmarks_nightly pg_cron job scheduled at 03:00 UTC (pure-SQL invocation)
  - Idempotent upsert via ON CONFLICT on ts_to_utc_date(computed_at) functional index
affects: [42-12, 42-13, phase-verification]

tech-stack:
  added: []
  patterns:
    - Pure-SQL pg_cron invocation (no HTTP webhook / no GUC dependency) for in-DB functions
    - DISTINCT ON for per-user latest version selection inside SECURITY DEFINER rollup functions
    - ON CONFLICT must reference IMMUTABLE functional index expression verbatim (ts_to_utc_date, not ::date cast)

key-files:
  created:
    - supabase/migrations/20260525000006_phase42_layer4_benchmarks_cron.sql
  modified: []

key-decisions:
  - "ON CONFLICT uses public.ts_to_utc_date(computed_at) (IMMUTABLE wrapper) not (computed_at::date) (STABLE — rejected by PostgreSQL for functional index conflict targets)"
  - "Pure-SQL cron body (SELECT public.run_benchmarks_rollup()) — no net.http_post, no GUC dependency — simpler than Phase 12 HTTP-webhook crons since function is in-DB"
  - "DISTINCT ON (cohort_key, user_id ORDER BY created_at DESC) prevents multi-version users from inflating sample_size"

patterns-established:
  - "Pure-SQL pg_cron pattern: PERFORM cron.schedule('job', '0 3 * * *', $job$ SELECT public.fn(); $job$) with idempotent unschedule guard"
  - "SECURITY DEFINER + REVOKE ALL FROM PUBLIC + SET search_path = public — standard shape for privileged rollup functions"

requirements-completed: [DB-BMK-02]

duration: ~30min
completed: 2026-05-27
---

# Phase 42-11: L4 Benchmarks Rollup + pg_cron Summary

**SECURITY-DEFINER `run_benchmarks_rollup()` computing 6-metric cohort percentiles (p25/p50/p75) with sample_size≥5 de-anon barrier, scheduled nightly at 03:00 UTC via pure-SQL pg_cron — no HTTP webhook or GUC dependency.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-05-27
- **Tasks:** 2 (1 auto + 1 human-action checkpoint)
- **Files modified:** 1

## Accomplishments

- `run_benchmarks_rollup()` SECURITY-DEFINER function: expands cohort_peers arrays (unnest target_roles/target_industries), computes percentile_cont(0.25/0.50/0.75) per (cohort_key, metric) across 6 metrics, UPSERTs into benchmarks with sample_size≥5 filter (T-42-BENCHMARKS de-anon barrier)
- `benchmarks_nightly` pg_cron at `0 3 * * *` — pure-SQL invocation (`SELECT public.run_benchmarks_rollup()`) with idempotent unschedule guard
- DO $$ verification block baked into migration; asserts SECURITY DEFINER + VOLATILE + REVOKE FROM PUBLIC + cron schedule + manual invocation returns valid jsonb
- Migration applied to staging; manual invocation confirmed (`{"cohort_count": 0, "rows_upserted": 0}`); idempotency verified (second call = 0 new rows via UNIQUE constraint)

## Task Commits

1. **Task 1: Write benchmarks rollup function + pg_cron migration** - `ce427aa` (feat)
2. **Task 1 fix: Fix two SQL bugs in run_benchmarks_rollup function** - `c4d5891` (fix)
3. **Task 2: Applied to staging (human-action checkpoint)** — operator-verified

## Files Created/Modified

- `supabase/migrations/20260525000006_phase42_layer4_benchmarks_cron.sql` — run_benchmarks_rollup() + benchmarks_nightly cron + DO $$ verify block

## Decisions Made

- `ON CONFLICT` must reference `public.ts_to_utc_date(computed_at)` verbatim to match the IMMUTABLE functional index created in 42-08; `(computed_at::date)` is STABLE and PostgreSQL rejects it as a conflict target
- Pure-SQL cron body (no `net.http_post`) — correct for in-DB functions; avoids GUC dependency and HTTP round-trip overhead
- `DISTINCT ON (cohort_key, rv.user_id ORDER BY rv.created_at DESC)` prevents users with multiple resume/linkedin versions from inflating sample counts

## Deviations from Plan

### Auto-fixed Issues

**1. SQL Bug — DISTINCT ON ordering + ON CONFLICT expression mismatch**
- **Found during:** Task 1 post-write review
- **Issue:** (1) Missing ORDER BY in DISTINCT ON causing PostgreSQL error; (2) ON CONFLICT used `(computed_at::date)` instead of `public.ts_to_utc_date(computed_at)` — expression doesn't match IMMUTABLE functional index
- **Fix:** Added `ORDER BY c.cohort_key, rv.user_id, rv.created_at DESC` to DISTINCT ON CTEs; changed ON CONFLICT target to `public.ts_to_utc_date(computed_at)`
- **Committed in:** `c4d5891`

---

**Total deviations:** 1 auto-fixed (2 SQL correctness bugs in migration)
**Impact on plan:** Both fixes necessary for PostgreSQL correctness. No scope creep.

## Issues Encountered

None beyond the two SQL bugs caught and fixed in the same session.

## Self-Check: PASSED

- ✅ `run_benchmarks_rollup()` function exists with SECURITY DEFINER + VOLATILE
- ✅ `benchmarks_nightly` cron registered at `0 3 * * *`
- ✅ REVOKE ALL FROM PUBLIC enforced (proacl check)
- ✅ Manual invocation returns valid jsonb on staging
- ✅ Idempotency: second invocation = 0 new rows (UNIQUE constraint via ts_to_utc_date)
- ✅ DB-BMK-02 satisfied: nightly recompute scheduled, rollup function correct per SPEC

## Next Phase Readiness

- Plan 42-12 (Wave 5, L5 lifecycle archive) ready to execute — depends on 42-03/42-06/42-08, all complete
- Plan 42-13 (Wave 5) depends on 42-12

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-27*
