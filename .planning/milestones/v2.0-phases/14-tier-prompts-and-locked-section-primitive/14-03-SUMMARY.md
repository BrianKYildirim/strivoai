---
phase: 14-tier-prompts-and-locked-section-primitive
plan: 03
subsystem: api
tags: [prompts, tier-gating, deno, anthropic, resume]

# Dependency graph
requires:
  - phase: 14-02
    provides: tier-prompts loader (registerFeaturePrompts, loadPromptVariant)
  - phase: 14-01
    provides: global-ai-principles constant (STRIVO_GLOBAL_AI_PRINCIPLES)
provides:
  - Three tier-specific resume prompt builders (buildFreeResumePrompt, buildProResumePrompt, buildEliteResumePrompt)
  - RESUME_PROMPT_VARIANTS map registered in tier-prompts loader for 'resume' feature
  - FREE_TIER_SUFFIX constraint text for Free field omission at prompt level
  - Variant divergence test suite (8 assertions) proving tier separation
affects: [15-resume-analysis-gating, 14-07-tier-validation-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tier builder pattern: _buildCorePrompt(params, includeElite) as internal helper, three exported wrappers"
    - "Module-load side-effect registration: registerFeaturePrompts called at bottom of module"
    - "Backward-compatible refactor: existing exports preserved, new builders added as siblings"

key-files:
  created:
    - supabase/functions/_shared/resume-prompts-variants.test.ts
  modified:
    - supabase/functions/_shared/resume-prompts.ts
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Used _buildCorePrompt internal helper to avoid duplicating the massive prompt body across three builders"
  - "Extracted ELITE_ADDITIONS and FREE_TIER_SUFFIX as named constants for readability and test assertions"
  - "buildSharedPrefix preserved as backward-compatible wrapper delegating to _buildCorePrompt(params, params.isElite)"

patterns-established:
  - "Feature prompt registration: each feature module calls registerFeaturePrompts at module load"
  - "Tier builder trio: buildFree*, buildPro*, buildElite* with shared internal core"

requirements-completed: [GATE-01]

# Metrics
duration: 19min
completed: 2026-04-17
---

# Phase 14 Plan 03: Resume Prompt Tier Variants Summary

**Three tier-specific resume prompt builders (Free/Pro/Elite) registered in the tier-prompts loader with Free field-omission constraint and 8-assertion divergence test suite**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-17T03:52:15Z
- **Completed:** 2026-04-17T04:11:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Lifted inline isElite branching in resume-prompts.ts into three explicit tier builders with named constants (ELITE_ADDITIONS, FREE_TIER_SUFFIX)
- Registered resume feature in tier-prompts loader via module-load side-effect, enabling `loadPromptVariant('resume', tier, params)` for Phase 15
- Preserved all existing exports (buildSharedPrefix, buildCallSuffix, buildSystemBlocks, buildFallbackPrompt, etc.) so analyze-resume/index.ts continues working without modification
- Created comprehensive variant divergence test suite validating GATE-01 registration, RES-01..04 tier content separation, and GATE-04 global AI principles prepend behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Lift tier branching into three explicit builders** - `025e97f` (feat)
2. **Task 2: Variant divergence tests** - `4f40635` (test)

## Files Created/Modified
- `supabase/functions/_shared/resume-prompts.ts` - Added ELITE_ADDITIONS/FREE_TIER_SUFFIX constants, _buildCorePrompt helper, three tier builders, RESUME_PROMPT_VARIANTS export, registerFeaturePrompts side-effect
- `supabase/functions/_shared/resume-prompts-variants.test.ts` - 8 test assertions for tier variant divergence and loader integration
- `scripts/run-edge-tests.ps1` - Added resume-prompts-variants.test.ts to test runner

## Decisions Made
- Used `_buildCorePrompt(params, includeElite)` internal helper to centralize the massive prompt body, avoiding triplication across builders
- Extracted ELITE_ADDITIONS and FREE_TIER_SUFFIX as named module-level constants for clarity and testability
- `buildSharedPrefix` preserved as thin wrapper delegating to `_buildCorePrompt(params, params.isElite)` for zero-change backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 (resume-analysis-gating) can now import `loadPromptVariant('resume', tier, params)` from the shared loader
- Phase 14-07 (tier-validation-harness) can add resume as the first feature in its field-presence assertions
- All 191 edge function tests pass, confirming zero regressions

## Self-Check: PASSED

All files exist, all commits verified:
- resume-prompts.ts: FOUND
- resume-prompts-variants.test.ts: FOUND
- run-edge-tests.ps1: FOUND
- Commit 025e97f: FOUND
- Commit 4f40635: FOUND

---
*Phase: 14-tier-prompts-and-locked-section-primitive*
*Completed: 2026-04-17*
