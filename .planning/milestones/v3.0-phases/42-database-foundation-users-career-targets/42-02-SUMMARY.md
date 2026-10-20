---
phase: 42-database-foundation-users-career-targets
plan: 02
subsystem: frontend
tags: [react, supabase, profile, onboarding, dashboard]
requires:
  - plan: 42-01
    provides: Phase 42 Layer 1 profiles education columns and career_targets schema
provides:
  - useUserTargets profiles + career_targets reader hook
  - Profile Education & Targets section
  - Onboarding and Career Compass career_targets cutover
  - Dashboard cohort backfill banner
  - Legacy frontend target-field reference cleanup
affects: [profile-targets, onboarding-cutover, career-compass-cutover, dashboard]
tech-stack:
  added: []
  patterns:
    - Promise.all profile + career_targets reads and writes
    - Self-hiding dashboard banner with guarded localStorage access
key-files:
  created:
    - src/hooks/useUserTargets.ts
    - src/hooks/__tests__/useUserTargets.test.ts
    - src/components/profile/EducationTargetsSection.tsx
    - src/components/dashboard/CohortBackfillBanner.tsx
  modified:
    - src/pages/Profile.tsx
    - src/pages/Onboarding.tsx
    - src/pages/CareerCompass.tsx
    - src/pages/Dashboard.tsx
    - src/hooks/useOnboardingStatus.ts
    - src/types/database.ts
key-decisions:
  - "Kept the target form UX intact while mapping legacy career_interests semantics to career_targets.target_industries."
  - "Guarded dashboard banner localStorage reads/writes so restricted jsdom/browser contexts do not crash rendering."
  - "Updated useOnboardingStatus and local database types because they still referenced legacy fields after the page-level cutover."
requirements-completed: [DB-USR-04, DB-USR-05, DB-USR-06]
duration: 2h 20m
completed: 2026-05-26
---

# Phase 42 Plan 02: Frontend Target Cutover Summary

**Cut over frontend target readers/writers to `career_targets` and shipped Profile education/target capture plus the dashboard backfill banner.**

## Performance

- **Duration:** 2h 20m
- **Tasks:** 5
- **Files modified:** 10

## Accomplishments

- Added `useUserTargets()` with focused tests covering loading, success, error, and refresh refetch behavior.
- Added the Profile `EducationTargetsSection` for school, major, year, graduation year, location preference, target industries, target roles, target companies, and career goals.
- Updated Profile save behavior to write profile fields and `career_targets` via `Promise.all`, with partial-failure toasts and refreshed target state.
- Updated Onboarding to upsert target roles and industries into `career_targets`, and updated Career Compass to read target data through `useUserTargets()`.
- Added `CohortBackfillBanner` to Dashboard with SPEC-locked copy, `/profile#education-targets` CTA, dismiss persistence, and safe localStorage handling for tests.
- Removed remaining app-side references to `career_interests`, `profiles.target_roles`, and `profiles.career_interests` by updating `useOnboardingStatus` and `src/types/database.ts`.

## Task Commits

Each implementation task was committed atomically:

1. **Task 1: Create useUserTargets hook + tests** - `1395d2b` (`feat(42-02): add user targets hook`)
2. **Task 2: Profile Education & Targets section** - `d8867c3` (`feat(42-02): add education targets profile section`)
3. **Task 3: Onboarding and Career Compass cutover** - `30a44ce` (`feat(42-02): cut over onboarding and career compass targets`)
4. **Task 4: Dashboard cohort backfill banner** - `72582aa` (`feat(42-02): add cohort backfill dashboard banner`)
5. **Task 5: Legacy reference cleanup** - `ea280e7` (`fix(42-02): clear legacy target references`)

**Plan metadata:** recorded in the follow-up docs close-out commit.

## Verification

- `npm run build` passed.
- `npm run test -- src/hooks/__tests__/useUserTargets.test.ts` passed: 1 file, 4 tests.
- `npm run test -- src/pages/Dashboard.test.tsx` passed: 1 file, 4 tests.
- Targeted ESLint passed on touched files with two existing hook dependency warnings in `Onboarding.tsx` and `Profile.tsx`.
- `rg -n "career_interests|profiles\.target_roles|profiles\.career_interests" src supabase\functions` returned zero matches.

## Full-Suite Status

- `npm run lint` still fails on pre-existing repo-wide lint debt: 560 problems, including `.claude/worktrees` files, existing `any` usage, Supabase function lint debt, and unrelated page warnings/errors.
- `npm run test` still fails outside this plan: 9 failed files, 72 passed files, 8 failed tests, 440 passed tests. Remaining failures include Phase 24 requirements coverage, unrelated LinkedIn/Recruiting Lens/BlurredLockCard/Navbar expectations, HTTPS imports in Supabase function tests, and a pre-existing `ThemeToggle` localStorage crash.
- `gsd-sdk query requirements.mark-complete DB-USR-04 DB-USR-05 DB-USR-06` returned all three IDs as `not_found`; roadmap and state were still advanced.

## Deviations from Plan

- Subagent dispatch failed because the configured model `gpt-5.3-spark` is unsupported in this environment, so the plan was completed inline.
- `useOnboardingStatus.ts` and `src/types/database.ts` were updated even though they were not in the original file list; both were necessary to satisfy the legacy-reference grep guard.
- Full repo lint/test gates could not be made green without unrelated cleanup outside the plan scope.

## User Setup Required

None for this plan. Plan 42-01 already applied the required database migration; this plan only changes frontend code and local type helpers.

## Next Phase Readiness

Plan 42-03 can proceed. The frontend now reads/writes target state through `career_targets`, Profile captures the new education/target fields, and the pre-deploy legacy-reference guard is clean for `src/` and `supabase/functions/`.

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-26*
