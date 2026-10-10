---
phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
plan: 01
subsystem: ui
tags: [react, linkedin-grader, supabase, profile-source]
requires:
  - phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull
    provides: LinkedIn source contract decisions
provides:
  - LinkedInGrader onboarding PDF auto-pull
  - successful replacement PDF profile persistence
affects: [linkedin-grader, profiles]
tech-stack:
  added: []
  patterns: [success-only profile source update, no-deep-link auto-fill guard]
key-files:
  created:
    - src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts
  modified:
    - src/pages/LinkedInGrader.tsx
key-decisions:
  - "Deep-link hydration remains authoritative; stored profile PDF content is only applied in the normal no-id mount path."
  - "Replacement PDF source updates are fire-and-forget after a successful grade and warn silently on failure."
patterns-established:
  - "Successful PDF grade can refresh `profiles.linkedin_pdf_*` without blocking result UX."
requirements-completed: [CTX-01]
duration: 20 min
completed: 2026-05-22
---

# Phase 35 Plan 01: LinkedInGrader Source Timing Summary

**LinkedInGrader now reuses onboarding PDF content on normal loads and refreshes stored PDF source only after successful grading.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-22T05:08:00Z
- **Completed:** 2026-05-22T05:28:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Extended the profile read to include `linkedin_pdf_content`, `linkedin_pdf_filename`, and `linkedin_pdf_updated_at`.
- Auto-fills `profileContent` and switches to paste mode only when no `?id=` deep-link owns the page state.
- Tracks replacement PDF extraction metadata and writes `profiles.linkedin_pdf_*` after a successful `grade-linkedin` response.
- Added source-contract tests for no-deep-link auto-pull and success-only replacement update ordering.

## Task Commits

Not committed in this run. The workspace already contained unrelated dirty planning/worktree state, so changes were left unstaged.

## Files Created/Modified

- `src/pages/LinkedInGrader.tsx` - Stored PDF auto-pull and success-only replacement update.
- `src/pages/__tests__/LinkedInGrader.linkedin-pdf-source.test.ts` - Source timing regression checks.

## Decisions Made

- Kept replacement update non-blocking and user-silent to preserve the successful grade UX.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

None.

## Verification

- `npm run test -- PriorAnalysisSelector PriorLinkedInSelector LinkedInGrader RecruitingLens CareerCompass InterviewPrep` - PASS, 20 files / 90 tests.
- `npm run build` - PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

LinkedIn source persistence is ready for cross-feature selectors and Recruiting Lens/Career Compass consumers.

---
*Phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull*
*Completed: 2026-05-22*

