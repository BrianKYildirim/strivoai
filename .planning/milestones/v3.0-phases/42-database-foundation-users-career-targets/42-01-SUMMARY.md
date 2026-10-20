---
phase: 42-database-foundation-users-career-targets
plan: 01
subsystem: database
tags: [supabase, postgres, rls, migrations, types]
requires:
  - phase: 29-foundation-infrastructure
    provides: Supabase migration verification and generated types precedent
provides:
  - Phase 42 Layer 1 profiles education columns
  - career_targets table with user-scoped RLS
  - Legacy target_roles/career_interests backfill and drop
  - cohort_peers view and cohort indexes
  - Regenerated Supabase TypeScript types
affects: [phase-42-layer-1, profile-targets, onboarding-cutover, career-compass-cutover]
tech-stack:
  added: []
  patterns:
    - Atomic Supabase migration with dynamic legacy-column guards and final DO $$ verification
    - Security-invoker cohort view over RLS-protected tables
key-files:
  created:
    - supabase/migrations/20260525000001_phase42_layer1_users_career_targets.sql
  modified:
    - src/integrations/supabase/types.ts
key-decisions:
  - "Used a security_invoker cohort_peers view so the view preserves caller RLS instead of bypassing it through owner privileges."
  - "Made the backfill source dynamic so a re-apply after legacy columns are dropped does not fail."
patterns-established:
  - "Layer 1 schema cutovers should store pre-drop legacy values in a temp source table before destructive column removal."
  - "Generated Supabase types are committed after remote migration verification passes."
requirements-completed: [DB-USR-01, DB-USR-02, DB-USR-03, DB-TGT-01, DB-TGT-02]
duration: 1h 23m
completed: 2026-05-26
---

# Phase 42 Plan 01: Layer 1 Users and Career Targets Summary

**Atomic Supabase schema foundation for education context, user career targets, cohort queries, and generated frontend types**

## Performance

- **Duration:** 1h 23m
- **Started:** 2026-05-25T23:26:38Z
- **Completed:** 2026-05-26T00:50:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added the Phase 42 Layer 1 migration with nullable education columns on `profiles`, the `career_targets` table, user-scoped RLS, backfill, legacy column drop, indexes, comments, and a final verification block.
- Applied the migration to the linked Supabase project; the migration verification block emitted `Phase 42 Layer 1 users + career_targets verification passed`.
- Regenerated `src/integrations/supabase/types.ts`; generated types now include `career_targets`, profiles education columns, and `cohort_peers`.
- Confirmed `npm run build` passes after type generation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write L1 atomic migration file** - `89eb413` (`feat(42-01): add users and career targets migration`)
2. **Task 2: Push migration and regenerate types** - `f252b7e` (`chore(42-01): regenerate Supabase types for career targets`)

**Plan metadata:** recorded in the follow-up docs close-out commit.

## Files Created/Modified

- `supabase/migrations/20260525000001_phase42_layer1_users_career_targets.sql` - Atomic Layer 1 migration with down-migration comment, backfill, RLS policies, cohort indexes/view, comments, and verification.
- `src/integrations/supabase/types.ts` - Regenerated linked Supabase types after applying the migration.

## Decisions Made

- Used `WITH (security_invoker = true)` on `public.cohort_peers` to preserve user-scoped RLS behavior through the view.
- Used a temporary backfill source table populated through dynamic SQL only when legacy columns still exist, keeping the migration safe to re-run after those columns are dropped.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial `npm run build` failed because local dependencies were not installed and `vite` was missing from `node_modules/.bin`.
- `npm i` timed out after 10 minutes, but it installed the required dependencies before timing out; rerunning `npm run build` then passed.

## User Setup Required

None - the linked Supabase migration was applied, types were regenerated, and the production build passed.

## Next Phase Readiness

Plan 42-02 can proceed against the live Layer 1 schema and regenerated types. The next plan should cut over frontend readers/writers from legacy `profiles.target_roles` / `profiles.career_interests` to `career_targets`.

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-26*
