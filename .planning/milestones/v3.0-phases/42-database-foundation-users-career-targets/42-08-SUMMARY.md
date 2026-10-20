---
phase: 42-database-foundation-users-career-targets
plan: "08"
subsystem: database
tags: [postgres, supabase, rls, migrations, applications, outcomes, benchmarks, saved_jobs]

# Dependency graph
requires:
  - phase: 42-database-foundation-users-career-targets plan 02
    provides: resume_versions and linkedin_versions tables (FK targets for applications)
  - phase: 42-database-foundation-users-career-targets plan 01
    provides: career_targets, profiles extension, update_updated_at_column trigger function
provides:
  - "public.applications table (18 cols, subsumes saved_jobs, full user CRUD RLS)"
  - "public.outcomes table (10 cols, 1:1 with applications via UNIQUE FK, FULL user CRUD via parent-join RLS)"
  - "public.job_descriptions table (9 cols, lean JD signals, SELECT-own RLS, service-role writes)"
  - "public.benchmarks table (9 cols, aggregate percentiles, SELECT-all authenticated, sample_size>=5 de-anonymization barrier)"
  - "Atomic saved_jobs → applications cutover migration with pre/post count verification"
  - "6 indexes on L4 tables + update_updated_at_column trigger on applications"
  - "42-SPEC.md DB-APP-01 amended with 4 reconciled nullable columns documentation"
affects:
  - "42-09 (frontend cutover: Jobs.tsx, Dashboard.tsx, RecruitingLens.tsx, recruiting-lens edge function)"
  - "42-10 (Applications page UI + recruiting-lens auto-create + job_descriptions write)"
  - "42-11 (benchmarks nightly pg_cron rollup)"
  - "42-12 (Layer 5 lifecycle — archive_path on applications table)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "L4 migration: atomic CREATE + backfill + DROP in single transaction (same pattern as L1 DB-USR-02 for saved_jobs cutover)"
    - "applications is the documented exception to service-role-write-only: full user CRUD RLS because frontend manages its own application rows"
    - "outcomes RLS via parent-join: USING (application_id IN (SELECT id FROM applications WHERE user_id = auth.uid()))"
    - "benchmarks documented aggregate-read exception T-42-BENCHMARKS: SELECT USING (true) TO authenticated"
    - "jd_id FK deferred-then-added: job_descriptions created first, then ALTER TABLE applications ADD CONSTRAINT applications_jd_id_fkey inside DO $$ IF NOT EXISTS guard"

key-files:
  created:
    - "supabase/migrations/20260525000005_phase42_layer4_applications_outcomes.sql"
    - ".planning/phases/42-database-foundation-users-career-targets/42-08-SUMMARY.md"
  modified:
    - ".planning/phases/42-database-foundation-users-career-targets/42-SPEC.md"
    - "src/integrations/supabase/types.ts (PENDING — awaiting operator push + supabase gen types)"

key-decisions:
  - "applications gets FULL user CRUD RLS (not service-role-only): users create/update/delete their own application rows from the frontend Applications tracker"
  - "4 reconciled nullable columns (posted/salary/url/location) added to applications per operator reconciliation #1: preserve Jobs.tsx swipe-save field shape without changing prediction-relevant column set"
  - "jd_id FK on applications deferred until job_descriptions exists within same migration, added via DO $$ ALTER TABLE guard"
  - "saved_jobs backfill: application_source='other' for all rows; source refinement deferred to Plan 42-09 frontend cutover"
  - "benchmarks RLS documented exception T-42-BENCHMARKS: SELECT USING (true) to authenticated; sample_size >= 5 CHECK is the de-anonymization barrier"

patterns-established:
  - "Pattern: deferred FK within same migration — CREATE table A, CREATE table B, then ALTER TABLE A ADD CONSTRAINT FK → B inside DO $$ idempotency guard"
  - "Pattern: pre-migration count capture via CREATE TEMP TABLE in DO $$ IF EXISTS guard — skipped on fresh envs"

requirements-completed: [DB-APP-01, DB-OUT-01, DB-JD-01, DB-BMK-01]

# Metrics
duration: ~20min
completed: 2026-05-27
---

# Phase 42 Plan 08: L4 Outcomes Foundation Summary

**4-table L4 schema (applications/outcomes/job_descriptions/benchmarks) with atomic saved_jobs cutover, full-CRUD RLS, 6 indexes, and DO $$ verification block — awaiting operator push to staging**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-27T04:47:12Z
- **Completed:** 2026-05-27T04:54:00Z (code tasks); Task 3 awaiting operator action
- **Tasks:** 2/3 complete (Task 3 is blocking human-action checkpoint)
- **Files modified:** 2 (migration SQL + SPEC.md)

## Accomplishments

- Wrote 690-line L4 atomic migration: 4 tables with full RLS, 6 indexes, saved_jobs backfill + DROP, DO $$ verification block
- 4 reconciled nullable columns (posted/salary/url/location) on applications preserve Jobs.tsx field shape per operator reconciliation #1
- Amended 42-SPEC.md DB-APP-01 column inventory with reconciled columns + rationale
- Both code tasks committed atomically; migration ready to push

## Task Commits

1. **Task 1: Write L4 atomic migration** - `1af845e` (feat)
2. **Task 2: Amend 42-SPEC.md DB-APP-01** - `a54300e` (docs)
3. **Task 3: Push migration + regenerate types** - PENDING (awaiting operator action)

## Files Created/Modified

- `supabase/migrations/20260525000005_phase42_layer4_applications_outcomes.sql` - Full L4 migration: 4 tables, saved_jobs cutover, RLS, indexes, verification
- `.planning/phases/42-database-foundation-users-career-targets/42-SPEC.md` - DB-APP-01 column inventory amended with 4 reconciled nullable columns + Layer 4 reconciliation header note

## Decisions Made

- **applications FULL CRUD RLS:** applications is the documented exception to the service-role-write-only pattern because users manage their own application rows from the frontend tracker (not through an edge function worker)
- **4 reconciled nullable columns:** posted/salary/url/location added to applications as nullable columns, preserving Jobs.tsx swipe-save data shape; non-load-bearing for prediction queries; future migration can move them to job_descriptions if application_source='job_discovery' bucket stabilizes
- **jd_id FK deferred-then-added:** job_descriptions created after applications; FK wired via DO $$ idempotency guard in same migration transaction
- **application_source='other' for all backfilled rows:** exact source (linkedin vs. job_discovery) not determinable from saved_jobs; Plan 42-09 frontend cutover can refine via UPDATE if needed
- **benchmarks T-42-BENCHMARKS exception:** SELECT USING (true) TO authenticated; aggregate data; sample_size >= 5 CHECK is de-anonymization barrier at write time; no write policy

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Task 3 requires manual operator action (blocking checkpoint):**

### Pre-push verification
Run on target Supabase environment:
```sql
SELECT current_setting('app.functions_base_url', true),
       current_setting('app.internal_job_secret', true);
```
Both must return non-NULL values (set by Phase 12 migration). If NULL, set via:
```sql
ALTER DATABASE postgres SET app.functions_base_url = 'https://<project-ref>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.internal_job_secret = '<value-from-vault>';
```

### Capture pre-migration count
```bash
psql -c "SELECT count(*) FROM public.saved_jobs"
```
Save this value for post-push verification.

### Push migration
```bash
supabase db push --project-ref <staging-ref>
```

### Post-push verification queries
```sql
-- 1. All 4 L4 tables present
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('applications','outcomes','job_descriptions','benchmarks');
-- Expected: 4

-- 2. saved_jobs dropped
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_name='saved_jobs';
-- Expected: 0

-- 3. saved_jobs → applications cutover count match
SELECT count(*) FROM public.applications WHERE status='saved';
-- Expected: >= pre-migration saved_jobs count

-- 4. applications policies
SELECT count(*) FROM pg_policies WHERE tablename='applications';
-- Expected: 4

-- 5. benchmarks policies (SELECT-only)
SELECT count(*) FROM pg_policies WHERE tablename='benchmarks';
-- Expected: 1

-- 6. Reconciled columns present
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='applications'
AND column_name IN ('posted','salary','url','location');
-- Expected: 4
```

### Regenerate TypeScript types
```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
npm run build
```
Expected: build exits 0; types.ts includes applications, outcomes, job_descriptions, benchmarks; no saved_jobs type.

### Commit updated types
```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(42-08): regenerate types after L4 migration push"
```

**Resume signal:** Type "applied" after confirming migration pushed cleanly + pre/post count match + types regenerated + build green.

## Next Phase Readiness

Once Task 3 (operator push + types regen) completes:
- L4 schema live; Plan 42-09 (frontend cutover: Jobs.tsx, Dashboard.tsx, RecruitingLens.tsx, recruiting-lens edge function) can proceed
- Plan 42-10 (Applications page UI + auto-create + dashboard banner) unblocked
- Plan 42-11 (benchmarks nightly cron) unblocked

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-27 (code tasks); operator action pending*
