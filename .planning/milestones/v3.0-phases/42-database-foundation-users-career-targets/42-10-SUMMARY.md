---
phase: 42-database-foundation-users-career-targets
plan: "10"
subsystem: frontend, edge-functions, sql
tags: [applications, outcomes, job_descriptions, dashboard, recruiting-lens, prediction-readiness]

# Dependency graph
requires:
  - phase: 42-database-foundation-users-career-targets plan 08
    provides: public.applications + public.outcomes + public.job_descriptions tables with RLS
  - phase: 42-database-foundation-users-career-targets plan 09
    provides: saved_jobs→applications cutover (all touch sites flipped)
  - phase: 42-database-foundation-users-career-targets plan 04
    provides: extract-analysis-structure worker stub (extract-recruiting-lens.ts placeholder)
provides:
  - "/applications route: shadcn Table + status dropdown + overdue filter (DB-APP-02)"
  - "AddApplicationDialog: manual application creation via react-hook-form + zod"
  - "ReportOutcomeDialog: outcomes upsert({onConflict: 'application_id'}) — 1:1 per application"
  - "OutcomeOverdueBanner: self-hiding dashboard banner; 14-day threshold; CTA → /applications?filter=overdue"
  - "extract-recruiting-lens: full implementation — job_descriptions INSERT + applications.jd_id backfill + fallback insert"
  - "recruiting-lens edge function: canonical application_source='recruiting_lens'; non-fatal auto-create"
  - "prediction-readiness.sql: percentile_cont median on overall_score + quantified_impact_score by outcome bucket (DB-OUT-02)"
affects:
  - "42-11 (benchmarks nightly cron — job_descriptions now populated by worker)"
  - "42-12 (Layer 5 lifecycle — applications + job_descriptions archive_path)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Applications page: client-side status update via .update({status}).eq('id', appId) — RLS UPDATE-own"
    - "ReportOutcomeDialog: .upsert({...}, {onConflict: 'application_id'}) — atomic re-report overwrites"
    - "OutcomeOverdueBanner: self-hiding pattern — return null when count === 0; outcomes embedded via FK select 'outcomes(id)'"
    - "extract-recruiting-lens: idempotency via source_analysis_results_id SELECT-then-INSERT; fallback application insert when backfill UPDATE returns 0 rows"
    - "recruiting-lens auto-create: non-fatal — MeritRefundable throws replaced with log.warn; L2 worker is safety net"
    - "fetchSavedJobs shifted from location='Recruiting Lens' sentinel to canonical application_source='recruiting_lens'"

# Key files
key-files:
  created:
    - src/pages/Applications.tsx
    - src/components/applications/AddApplicationDialog.tsx
    - src/components/applications/ReportOutcomeDialog.tsx
    - src/components/applications/OutcomeOverdueBanner.tsx
    - .planning/phases/42-database-foundation-users-career-targets/queries/prediction-readiness.sql
  modified:
    - src/App.tsx
    - src/pages/Dashboard.tsx
    - src/pages/RecruitingLens.tsx
    - supabase/functions/extract-analysis-structure/extract-recruiting-lens.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-recruiting-lens.test.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/recruiting-lens/cache-saved-jobs.test.ts

# Decisions
key-decisions:
  - "ReportOutcomeDialog fetches existing outcome on open for upsert-edit flow — always uses onConflict upsert so re-reporting is idempotent"
  - "OutcomeOverdueBanner uses client-side filter (outcomes array length === 0) as MVP per CONTEXT; VIEW/RPC promotion deferred to Plan 42-x if EXPLAIN >100ms"
  - "OutcomeOverdueBanner mounted ABOVE CohortBackfillBanner in Dashboard (line 206 vs 209): urgency ordering per RESEARCH §Landmines #10"
  - "upsertSavedRecruitingLensJob errors changed from MeritRefundable throws to log.warn: applications auto-create must be non-fatal per RESEARCH §Pitfall 9"
  - "fetchSavedJobs filter shifted from location sentinel to application_source='recruiting_lens' canonical: legacy backfilled rows (application_source='other') will not appear until future backfill migration"
  - "extract-recruiting-lens idempotency keyed on source_analysis_results_id column (matches extract-resume.ts pattern)"
  - "extract-recruiting-lens fallback INSERT creates application row with company/role from raw.metadata when UPDATE returns 0 rows (RESEARCH §Landmines #7 safety net)"
  - "prediction-readiness.sql uses UNION ALL to compute both overall_score and quantified_impact_score medians in one pass; sample_size column included for staging validation"

# Metrics
metrics:
  duration: "~30min"
  completed: "2026-05-27"
  tasks_completed: 5
  files_modified: 12
---

# Phase 42 Plan 10: L4 User-Facing Surfaces + Extractor + Prediction Query Summary

L4 Applications page with full CRUD modals, Dashboard overdue banner, extract-recruiting-lens fleshed out writing job_descriptions + backfilling applications.jd_id, recruiting-lens auto-create made non-fatal canonical, and prediction-readiness.sql query template shipped.

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-05-27
- **Tasks:** 5/5 complete
- **Files modified:** 12 (4 new src pages/components, 1 new SQL, 7 modified)

## Accomplishments

**Task 1 — Applications page + modals + route:**
- `src/pages/Applications.tsx`: shadcn Table with Company/Role/Status(Select)/Date/Source/Outcome columns; overdue filter via `?filter=overdue`; embedded outcomes via Postgres FK select
- `src/components/applications/AddApplicationDialog.tsx`: react-hook-form + zod; required company_applied/role_applied; optional industry/date/source/referral_used; inserts with `application_source='other'` default or user selection
- `src/components/applications/ReportOutcomeDialog.tsx`: prefetches existing outcome; upsert with `onConflict: 'application_id'`; conditional rejection_stage; confidence score slider
- `src/App.tsx`: `/applications` route registered with `ProtectedRoute` + `DashboardLayout`

**Task 2 — OutcomeOverdueBanner + Dashboard mount:**
- `OutcomeOverdueBanner`: self-hiding; uses `outcomes(id)` FK embed to implement client-side LEFT JOIN; 14-day threshold; CTA "Report now" → `/applications?filter=overdue`
- `Dashboard.tsx`: banner mounted at line 206; `CohortBackfillBanner` at line 209 — urgency ordering per RESEARCH §Landmines #10

**Task 3 — extract-recruiting-lens full implementation:**
- Replaced Plan 42-04 STUB with full extractor
- Idempotency check via `source_analysis_results_id` SELECT-before-INSERT
- Defensive parsing with optional chaining + `extract_warning` logs for missing fields
- INSERT `job_descriptions` (key_requirements, required_skills, preferred_skills, missing_skills_vs_user, match_score, jd_url)
- Backfill UPDATE `applications SET jd_id` bounded by 5-minute window from analyze time
- Fallback INSERT applications when UPDATE returns 0 rows (§Landmines #7 safety net)
- Test file: 5 cases (insert, idempotency, update dispatch, malformed fixture, fallback insert)

**Task 4 — recruiting-lens auto-create:**
- `upsertSavedRecruitingLensJob`: `application_source` changed from `'other'` to `'recruiting_lens'` (canonical)
- Lookup shifted to `.eq('application_source', 'recruiting_lens')` — idempotency guard
- Error handling: `MeritRefundable` throws replaced with `log.warn('applications-autocreate-failed')` — non-fatal
- `RecruitingLens.tsx fetchSavedJobs`: shifted to canonical `application_source` filter
- `cache-saved-jobs.test.ts`: assertions updated to match new canonical values

**Task 5 — prediction-readiness.sql:**
- Joins `applications` → `outcomes` → `cohort_peers` → `resume_versions` → `scores`
- `percentile_cont(0.5)` median for `overall_score` and `quantified_impact_score`
- Bucketed by `result IN ('interview', 'ghosted')`
- Header documents input params (`:SCHOOL`, `:YEAR`, `:MAJOR`, `:TARGET_ROLE`, `:INDUSTRY`, `:LOCATION`), expected runtime < 500ms, expected index usage

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `8f4d940` | feat(42-10): create Applications page, Add/Outcome modals, register /applications route |
| 2 | `b167d5d` | feat(42-10): create OutcomeOverdueBanner; mount ABOVE CohortBackfillBanner in Dashboard |
| 3 | `a92e383` | feat(42-10): flesh out extract-recruiting-lens — writes job_descriptions + backfills applications.jd_id |
| 4 | `53a244b` | feat(42-10): update recruiting-lens to use canonical application_source='recruiting_lens'; non-fatal auto-create |
| 5 | `e9a964d` | feat(42-10): author prediction-readiness SQL query template (DB-OUT-02) |

## Verification

- `npm run build` — exits 0
- `npm run lint` — 0 new errors from Plan 42-10 files (574 pre-existing errors in unrelated files unchanged)
- `OutcomeOverdueBanner` line 206 < `CohortBackfillBanner` line 209 in Dashboard.tsx (banner urgency ordering)
- `grep -c "job_descriptions"` in extract-recruiting-lens.ts returns 6 (INSERT + idempotency check + update step references)
- `grep -c "percentile_cont"` in prediction-readiness.sql returns 2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] upsertSavedRecruitingLensJob threw MeritRefundable on applications write failure**
- **Found during:** Task 4
- **Issue:** The plan requires auto-create failure to NOT propagate (RESEARCH §Pitfall 9). Existing code threw `MeritRefundable(500, ...)` which would surface as a user-facing error.
- **Fix:** Replaced both `throw new MeritRefundable(...)` calls in the upsert function with `log.warn('applications-autocreate-failed', { error, user_id })` — non-fatal, L2 worker is safety net
- **Files modified:** `supabase/functions/recruiting-lens/index.ts`
- **Commit:** `53a244b`

**2. [Rule 1 - Bug] fetchSavedJobs used legacy location='Recruiting Lens' sentinel after canonical source shift**
- **Found during:** Task 4 (reviewing Plan 42-09 context — sentinel preserved there pending Plan 42-10)
- **Issue:** After shifting `upsertSavedRecruitingLensJob` to `application_source='recruiting_lens'`, the `fetchSavedJobs` query still filtered on `location='Recruiting Lens'` — new rows would not appear in the Saved tab
- **Fix:** Updated `fetchSavedJobs` filter to `.eq('application_source', 'recruiting_lens')` with inline comment about legacy backfilled rows
- **Files modified:** `src/pages/RecruitingLens.tsx`, `supabase/functions/recruiting-lens/cache-saved-jobs.test.ts`
- **Commit:** `53a244b`

## Self-Check: PASSED

Files verified present:
- src/pages/Applications.tsx — FOUND
- src/components/applications/AddApplicationDialog.tsx — FOUND
- src/components/applications/ReportOutcomeDialog.tsx — FOUND
- src/components/applications/OutcomeOverdueBanner.tsx — FOUND
- src/App.tsx (modified) — FOUND
- src/pages/Dashboard.tsx (modified) — FOUND
- supabase/functions/extract-analysis-structure/extract-recruiting-lens.ts — FOUND
- supabase/functions/extract-analysis-structure/__tests__/extract-recruiting-lens.test.ts — FOUND
- supabase/functions/recruiting-lens/index.ts — FOUND
- .planning/phases/42-database-foundation-users-career-targets/queries/prediction-readiness.sql — FOUND

Commits verified present: 8f4d940, b167d5d, a92e383, 53a244b, e9a964d
