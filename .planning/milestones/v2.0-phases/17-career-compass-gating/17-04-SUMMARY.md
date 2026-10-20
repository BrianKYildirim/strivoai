---
phase: 17-career-compass-gating
plan: 04
subsystem: testing
tags: [deno, tier-validation, career-compass, boot-assertion, anthropic]

# Dependency graph
requires:
  - phase: 17-01
    provides: career-prompts.ts with tier-specific prompt builders and feature registration
  - phase: 15-resume-analysis-gating
    provides: boot-time assertion test pattern in analyze-resume/index.test.ts, tier-validation harness pattern
provides:
  - 8 boot-time assertion unit tests for CAREER_CALL_CONFIGS budgets (CC-05)
  - Career TEST-09 live validation (Free variant omits locked fields)
  - Career TEST-10 live validation (Free token count < 50% of Elite) with snapshot fixture
affects: [21-integration-validation-and-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns: [career-specific tier-validation harness extension, CAREER_CALL_CONFIGS boot-time testing]

key-files:
  created:
    - supabase/functions/analyze-career/index.test.ts
  modified:
    - supabase/functions/_shared/tier-validation.test.ts
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Replicated CAREER_CALL_CONFIGS values in test file (same pattern as analyze-resume) to avoid importing the serve() handler"
  - "Career TEST-09/10 reuse the same resumeText fixture as resume tests since resume text is valid input to career analysis prompts"

patterns-established:
  - "Career boot-time assertion: replicate CAREER_CALL_CONFIGS in index.test.ts, assert budget sums match TIER_MAX_TOKENS"
  - "Career tier-validation: extend shared harness with CAREER_FREE_LOCKED_FIELDS and fixture['career'] snapshot"

requirements-completed: [CC-05, BACK-10]

# Metrics
duration: 3min
completed: 2026-04-17
---

# Phase 17 Plan 04: Career Compass Testing Summary

**8 boot-time assertion tests for CAREER_CALL_CONFIGS budgets plus career TEST-09/10 live validation harness entries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T09:05:30Z
- **Completed:** 2026-04-17T09:08:20Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created 8 Deno.test blocks in analyze-career/index.test.ts verifying CAREER_CALL_CONFIGS budget invariants for all 3 tiers (CC-05)
- Extended tier-validation.test.ts with career TEST-09 (Free variant omits 5 locked fields) and TEST-10 (Free token count < 50% of Elite with career snapshot)
- Registered analyze-career/index.test.ts in run-edge-tests.ps1

## Task Commits

Each task was committed atomically:

1. **Task 1: Create boot-time assertion unit tests for CAREER_CALL_CONFIGS** - `2563388` (test)
2. **Task 2: Extend tier-validation.test.ts with career TierValidationFixture for TEST-09/10** - `97755e6` (test)

## Files Created/Modified
- `supabase/functions/analyze-career/index.test.ts` - 8 boot-time assertion tests verifying CAREER_CALL_CONFIGS budgets match TIER_MAX_TOKENS for Free/Pro/Elite tiers
- `supabase/functions/_shared/tier-validation.test.ts` - Extended with career imports, CAREER_FREE_LOCKED_FIELDS, careerParams, career TEST-09 and TEST-10
- `scripts/run-edge-tests.ps1` - Added analyze-career/index.test.ts to test runner

## Decisions Made
- Replicated CAREER_CALL_CONFIGS values in the test file rather than importing from index.ts (same isolation pattern as analyze-resume/index.test.ts to avoid importing the serve() handler)
- Career TEST-09/10 reuse the existing resumeText fixture (resume text is valid input to career analysis prompts, avoids adding a separate fixture file)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `deno check` fails on tier-validation.test.ts due to pre-existing `Cannot find name 'Deno'` errors in anthropic.ts (missing deno.ns lib). This is a pre-existing issue (14 errors before changes, 16 after -- the 2 new are just the new Deno.test calls with the same issue). The project runs all Deno tests with `--no-check` flag which works correctly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All career compass testing infrastructure is in place
- Career TEST-09/10 are env-gated (RUN_TIER_VALIDATION=1) for cost protection
- Ready for Phase 21 integration validation and cutover

---
*Phase: 17-career-compass-gating*
*Completed: 2026-04-17*
