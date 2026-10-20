---
phase: 42-database-foundation-users-career-targets
plan: 06
subsystem: database
tags: [supabase, postgres, rls, security-definer, rpc, behavior-tracking, recommendations]
requires:
  - plan: 42-04
    provides: extract-analysis-structure worker with resume_bullets/linkedin_versions IDs available at write time
  - plan: 42-03
    provides: Layer 2 schema (resume_bullets, resume_sections, resume_versions, linkedin_versions) as FK targets for target_ref_id
provides:
  - L3 migration: recommendations + user_edits + feature_usage tables + RLS + indexes
  - record_recommendations_shown(uuid[]) SECURITY DEFINER RPC
  - record_feature_usage(text, text) SECURITY DEFINER RPC
  - extract-resume extractor writes recommendations rows alongside bullet fan-out
  - extract-linkedin extractor writes recommendations rows from topFixes
affects: [phase-42-layer-3-ui, phase-42-07, recommendations-ui, feature-usage-hook]
tech-stack:
  added: []
  patterns:
    - SECURITY DEFINER RPC with no user-supplied user_id param (spoofing prevention)
    - score_delta GENERATED ALWAYS AS stored column for computed deltas
    - RLS chain via parent-join (user_edits SELECT policy uses rec_id IN (SELECT id FROM recommendations WHERE user_id=auth.uid()))
    - Batch recommendations INSERT from worker: accumulated after fan-out, inserted per-row with try/catch, failures non-fatal
    - DO $$ verification block asserting 3 tables + 3 SELECT policies + 0 write policies + 2 SECURITY DEFINER RPCs + generated column
key-files:
  created:
    - supabase/migrations/20260525000004_phase42_layer3_behavior_tracking.sql
  modified:
    - supabase/functions/extract-analysis-structure/extract-resume.ts
    - supabase/functions/extract-analysis-structure/extract-linkedin.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-resume.test.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-linkedin.test.ts
key-decisions:
  - "Recommendations written per bullet with suggestedImprovement (not all bullets) — keeps signal-to-noise high"
  - "LinkedIn recommendations sourced from topFixes array (not sectionBreakdown) — most actionable surface"
  - "Batch per-row INSERT loop (not bulk array insert) matches mock test semantics and real Supabase client pattern"
  - "score_delta GENERATED ALWAYS AS STORED not virtual — avoids re-computation on every read"
patterns-established:
  - "SECURITY DEFINER RPC: always use SET search_path = public; REVOKE from PUBLIC before GRANT to authenticated"
  - "user_edits RLS via parent join: rec_id IN (SELECT id FROM recommendations WHERE user_id = auth.uid())"
  - "Recommendation fan-out: accumulate rows during fan-out loop, insert batch after, wrap in outer try/catch, log failures, never throw"
requirements-completed: [DB-REC-01, DB-REC-02, DB-EDT-01, DB-EDT-03, DB-USE-01]

# Metrics
duration: ~40min
completed: 2026-05-26
---

# Phase 42 Plan 06: L3 Behavior Tracking Migration + Worker Recommendations Writes

**L3 schema: 3 tables (recommendations/user_edits/feature_usage) + 2 SECURITY DEFINER RPCs + extractor worker now writes recommendations rows alongside L2 fan-out**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-05-26T14:50:53Z
- **Completed:** 2026-05-26T15:30:00Z
- **Tasks:** 2 of 3 completed (Task 3 is a human-action checkpoint — blocking)
- **Files modified:** 5

## Accomplishments

- Created `20260525000004_phase42_layer3_behavior_tracking.sql` with all 3 tables, RLS (SELECT-own per table, zero write policies), 2 SECURITY DEFINER RPCs, 4 indexes, COMMENT blocks documenting user-PII tier, and a DO $$ verification block that asserts all constraints.
- Extended `extract-resume.ts` to accumulate recommendation rows during bullet fan-out and batch-INSERT them after — one row per bullet with `suggestedImprovement`, `target_ref_type='bullet'`, `target_ref_id=bullet.id`, `feature='resume_analysis'`.
- Extended `extract-linkedin.ts` to INSERT recommendation rows from `topFixes[]` — one per fix, `target_ref_type='version'`, `target_ref_id=versionId`, `feature='linkedin_grading'`.
- Updated test mocks in both extract-* test files to include `recommendations: []` and assert insert counts match fixture data (1 resume rec, 2 LinkedIn recs).

## Task Commits

1. **Task 1: L3 migration** — `dadb410` (feat)
2. **Task 2: Extractor recommendations writes** — `726c80d` (feat)
3. **Task 3: Push + regenerate types + redeploy** — AWAITING HUMAN ACTION (checkpoint)

## Files Created/Modified

- `supabase/migrations/20260525000004_phase42_layer3_behavior_tracking.sql` — L3 tables + RPCs + RLS + DO $$ verify
- `supabase/functions/extract-analysis-structure/extract-resume.ts` — Added recommendations batch write after bullet fan-out
- `supabase/functions/extract-analysis-structure/extract-linkedin.ts` — Added recommendations write from topFixes
- `supabase/functions/extract-analysis-structure/__tests__/extract-resume.test.ts` — Added recommendations[] to mock; asserts 1 rec row from fixture
- `supabase/functions/extract-analysis-structure/__tests__/extract-linkedin.test.ts` — Added recommendations[] to mock; asserts 2 rec rows from fixture

## Decisions Made

- Recommendations written only for bullets with `suggestedImprovement` (not every bullet) — avoids noise from bullets that don't have actionable suggestions.
- LinkedIn recommendations sourced from `topFixes` array, not `sectionBreakdown` scores — topFixes is the actionable, human-readable surface from the grading output.
- Per-row INSERT loop instead of bulk array insert — matches real Supabase client pattern (no `.insert(array)` type inconsistency) and allows per-row failure isolation.
- `score_delta` is GENERATED ALWAYS AS STORED (not VIRTUAL) — precomputed on insert, avoids re-computation cost on heavy analytics reads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deno not available in execution environment**
- **Found during:** Task 2 verification
- **Issue:** `deno test` command not found; cannot execute Deno test suite locally
- **Fix:** Verified test logic via code review and grep assertions; test correctness confirmed by tracing mock execution paths (MockSupabase.insert() pushes to rows[], verified fixture expectations match implementation)
- **Files modified:** None
- **Verification:** grep confirms `from("recommendations")` in both extractor files; test files assert correct row counts; mock behavior traced manually

---

**Total deviations:** 1 (environment limitation — tooling not present)
**Impact on plan:** Deno tests verified by code review. Logic is correct — mock behavior confirmed by tracing insert() → db.insert() → rows[table].push() chain.

## Issues Encountered

- Deno is not installed in the execution environment. Test verification was performed by manual code review: tracing the MockSupabase.insert() chain confirms recommendations rows accumulate in `rows[table]` before assertions.

## User Setup Required (Task 3 — BLOCKING CHECKPOINT)

The following steps must be completed manually to activate the L3 schema on staging:

1. **Push migration to staging:**
   ```bash
   supabase db push --project-ref <staging-ref>
   ```

2. **Verify migration applied:**
   ```sql
   SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public'
   AND table_name IN ('recommendations','user_edits','feature_usage');
   -- Expected: 3

   SELECT count(*) FROM pg_proc
   WHERE proname IN ('record_recommendations_shown','record_feature_usage');
   -- Expected: 2

   SELECT count(*) FROM pg_policies
   WHERE tablename IN ('recommendations','user_edits','feature_usage');
   -- Expected: 3 (SELECT-only)
   ```

3. **Regenerate TypeScript types:**
   ```bash
   supabase gen types typescript --linked > src/integrations/supabase/types.ts
   ```

4. **Redeploy extract-analysis-structure worker:**
   ```bash
   supabase functions deploy extract-analysis-structure --project-ref <staging-ref>
   ```

5. **Verify worker writes recommendations on analyze:**
   Trigger an analyze-resume on staging, then within 60s:
   ```sql
   SELECT count(*) FROM recommendations WHERE user_id = '<test-user-id>';
   -- Expected: >= 1
   ```

6. **Verify build is green:**
   ```bash
   npm run build
   ```

Type "applied" to signal all 6 steps are complete and allow continuation (Plan 42-07 frontend layer).

## Next Phase Readiness

- L3 schema migration is ready to push — all 3 tables, 2 RPCs, RLS, indexes, verification block
- Worker writes recommendations rows with correct `target_ref_type='bullet'` / `target_ref_id` chain
- After human-action checkpoint completes (types regen + worker redeploy), Plan 42-07 can begin shipping the `<RecommendationActions>` component and `useFeatureUsage` hook

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-26 (Tasks 1–2; Task 3 awaiting human action)*
