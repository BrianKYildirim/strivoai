---
phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
plan: 00
subsystem: ui
tags: [react, shadcn, selectors, supabase, vitest]
requires:
  - phase: 29-foundation-infrastructure
    provides: user-scoped analysis data and cache/history conventions
provides:
  - shared resume prior selector
  - shared LinkedIn prior selector
  - shared prior empty-state and loading skeleton components
affects: [recruiting-lens, career-compass, interview-prep, linkedin-grader]
tech-stack:
  added: []
  patterns: [self-fetching prior selectors, shared blocking/non-blocking empty states]
key-files:
  created:
    - src/components/PriorAnalysisSelector.tsx
    - src/components/PriorLinkedInSelector.tsx
    - src/components/PriorSelectorEmptyState.tsx
    - src/components/PriorSelectorSkeleton.tsx
    - src/components/__tests__/PriorAnalysisSelector.test.tsx
    - src/components/__tests__/PriorLinkedInSelector.test.tsx
  modified: []
key-decisions:
  - "Selectors self-fetch current-user priors and expose normalized callbacks to avoid duplicating Supabase query logic in host pages."
  - "Empty-state copy and CTA destinations remain host-configurable so resume missing can block while LinkedIn missing stays optional."
patterns-established:
  - "Prior selectors auto-select the newest usable row and emit the selected normalized object once per selected id."
  - "Selector fetch failures degrade silently to empty-state with console warnings."
requirements-completed: [CTX-05, CTX-06, CTX-07]
duration: 50 min
completed: 2026-05-22
---

# Phase 35 Plan 00: Shared Prior Selectors Summary

**Reusable shadcn prior selectors normalize resume analyses and LinkedIn sources for cross-feature form defaults.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-05-22T04:18:00Z
- **Completed:** 2026-05-22T05:08:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `PriorAnalysisSelector` with newest-first user-scoped resume prior fetch, score/date display, default selection, and normalized callback.
- Added `PriorLinkedInSelector` with onboarding PDF plus v3 `linkedin_grades` merge, newest-first sort, legacy-grade filtering, and ungraded score display as `-`.
- Added shared `PriorSelectorEmptyState` and `PriorSelectorSkeleton`.
- Added focused component tests for default selection, empty-state CTAs, LinkedIn merge ordering, and legacy row filtering.

## Task Commits

Not committed in this run. The workspace already contained unrelated dirty planning/worktree state, so changes were left unstaged.

## Files Created/Modified

- `src/components/PriorAnalysisSelector.tsx` - Resume-prior selector.
- `src/components/PriorLinkedInSelector.tsx` - LinkedIn-source selector.
- `src/components/PriorSelectorEmptyState.tsx` - Shared CTA empty state.
- `src/components/PriorSelectorSkeleton.tsx` - Selector-height loading state.
- `src/components/__tests__/PriorAnalysisSelector.test.tsx` - Resume selector tests.
- `src/components/__tests__/PriorLinkedInSelector.test.tsx` - LinkedIn selector tests.

## Decisions Made

- Selectors own query behavior and emit normalized data to host pages.
- Host pages own empty-state semantics because blocking differs by input type.

## Deviations from Plan

None - plan executed within the intended selector/component scope.

## Issues Encountered

- Full `npm run lint` did not finish within 124 seconds. Targeted ESLint passed for new components and Phase 35 source-contract tests.

## Verification

- `npm run test -- PriorAnalysisSelector PriorLinkedInSelector LinkedInGrader RecruitingLens CareerCompass InterviewPrep` - PASS, 20 files / 90 tests.
- `npm run build` - PASS.
- Targeted ESLint for new selector components and new tests - PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for host page integrations in plans 35-02 and 35-03.

---
*Phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull*
*Completed: 2026-05-22*

