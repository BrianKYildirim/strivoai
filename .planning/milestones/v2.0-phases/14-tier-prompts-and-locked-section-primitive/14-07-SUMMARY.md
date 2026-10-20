---
phase: 14-tier-prompts-and-locked-section-primitive
plan: 07
subsystem: testing
tags: [deno, anthropic, tier-validation, env-gate, snapshot]

# Dependency graph
requires:
  - phase: 14-01
    provides: tier-config.ts with getTimeout and getModel
  - phase: 14-02
    provides: tier-prompts.ts loader with loadPromptVariant
  - phase: 14-03
    provides: resume-prompts.ts with tier-specific builders registered
provides:
  - env-gated Deno test harness for tier-output validation (TEST-09, TEST-10)
  - snapshot fixture file for token budget trend tracking
  - conditional registration in run-edge-tests.ps1
affects: [resume-analysis-gating, linkedin-grader-gating, career-compass-gating, recruiting-lens-gating, interview-prep-flashcards-and-quiz]

# Tech tracking
tech-stack:
  added: []
  patterns: [env-gated live-model test with ignore flag, snapshot fixture for trend tracking]

key-files:
  created:
    - supabase/functions/_shared/tier-validation.test.ts
    - supabase/functions/_shared/tier-validation-fixtures/resume.json
  modified:
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Used Deno.test ignore flag for cost protection rather than separate test runner entry"
  - "Parallel Promise.all for Free+Elite calls in TEST-10 to minimize wall-clock time"
  - "Snapshot stores only metric fields (tokens, ratio, timestamp) -- no response text or resume content (T-14-15)"

patterns-established:
  - "Env-gated live Anthropic tests: RUN_TIER_VALIDATION=1 activates, default skips silently"
  - "Snapshot fixture pattern: tier-validation-fixtures/<feature>.json populated on first live run"

requirements-completed: [TEST-09, TEST-10, GATE-09]

# Metrics
duration: 10min
completed: 2026-04-17
---

# Phase 14 Plan 07: Tier-Output Validation Harness Summary

**Env-gated Deno test harness validating Free locked-field absence (TEST-09) and Free < 50% Elite token budget (TEST-10) via live Anthropic calls**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-17T05:06:02Z
- **Completed:** 2026-04-17T05:16:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created tier-validation.test.ts with env-gated skip (RUN_TIER_VALIDATION=1) and two live Anthropic assertions
- Seeded tier-validation-fixtures/resume.json as empty {} for first-run population
- Registered conditional tier-validation block in run-edge-tests.ps1 after unconditional unit tests
- Default CI runs remain fast with zero Anthropic cost (both Deno.test ignore flag and runner conditional)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write tier-validation.test.ts with env-gated skip and live Anthropic assertions** - `1c64e8b` (test)
2. **Task 2: Seed fixture file and register harness in run-edge-tests.ps1** - `c8e93d9` (chore)

## Files Created/Modified
- `supabase/functions/_shared/tier-validation.test.ts` - Deno test harness with TEST-09 field presence and TEST-10 token budget assertions
- `supabase/functions/_shared/tier-validation-fixtures/resume.json` - Empty seed fixture populated on first live run
- `scripts/run-edge-tests.ps1` - Added conditional RUN_TIER_VALIDATION block after unconditional tests

## Decisions Made
- Used `Deno.test({ ignore: skip })` as defense-in-depth alongside the runner conditional -- even if someone accidentally adds the file to unconditional deno test args, tests skip without the env flag
- Parallel Free + Elite calls in TEST-10 via Promise.all to reduce wall-clock time (~$0.05 total cost per run)
- Snapshot fixture stores only freeTokens, eliteTokens, ratio, and timestamp -- no response text or resume content to avoid information disclosure (T-14-15 mitigation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Developer Note

The snapshot fixture file (`tier-validation-fixtures/resume.json`) will be populated on the first manual `RUN_TIER_VALIDATION=1` run. The developer running phase verification should commit that populated snapshot for trend tracking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Validation harness is scaffold + resume seed; Phases 15-19 extend it per-feature
- run-edge-tests.ps1 unconditional test suite unchanged
- Ready for plan 14-08 or subsequent phase execution

---
*Phase: 14-tier-prompts-and-locked-section-primitive*
*Completed: 2026-04-17*
