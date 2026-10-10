---
phase: 14-tier-prompts-and-locked-section-primitive
plan: 01
subsystem: api
tags: [deno, typescript, tier-config, anthropic, haiku, sonnet, timeouts]

# Dependency graph
requires: []
provides:
  - "getTimeout(tier, callType) — centralized per-tier AI call timeouts (BACK-12)"
  - "getModel(tier, feature?) — centralized per-tier model routing with Free-tier Haiku enforcement (D-13)"
  - "TIER_TIMEOUTS, TIER_MODELS, FREE_MODEL, DEFAULT_PRO_ELITE_MODEL constants"
  - "Tier, CallType, FeatureKey type exports"
  - "FEATURE_MODEL_OVERRIDES with career feature Haiku routing for Pro/Elite"
affects: [resume-analysis-gating, linkedin-grader-gating, career-compass-gating, recruiting-lens-gating, interview-prep-flashcards-and-quiz]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized tier configuration module with fail-loud semantics]

key-files:
  created:
    - supabase/functions/_shared/tier-config.ts
    - supabase/functions/_shared/tier-config.test.ts
  modified:
    - scripts/run-edge-tests.ps1

key-decisions:
  - "Used claude-sonnet-4-5-20250929 as DEFAULT_PRO_ELITE_MODEL with TODO for Phase 15 confirmation, since existing functions currently default to Haiku via env var"
  - "getTimeout throws Error for undefined tier/callType pairs (fail-loud over silent defaults)"
  - "Free tier model routing ignores FEATURE_MODEL_OVERRIDES unconditionally (D-13 hard enforcement)"

patterns-established:
  - "Tier config as zero-dependency leaf module: no imports from anthropic.ts or other edge-layer modules"
  - "Deno test assert style: import from https://deno.land/std@0.224.0/assert/mod.ts"

requirements-completed: [BACK-12]

# Metrics
duration: 3min
completed: 2026-04-17
---

# Phase 14 Plan 01: Tier Config Summary

**Centralized per-tier timeout and model routing module (tier-config.ts) with 19 Deno tests covering all BACK-12 values and D-13 Free-model enforcement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T03:09:49Z
- **Completed:** 2026-04-17T03:13:14Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Shipped `tier-config.ts` as the single source of truth for per-tier timeouts (Free 50s, Pro core 125s, Pro elite-preview 65s, Elite 155s, Elite quiz 80s) and model IDs
- Free tier structurally locked to Haiku 4.5 (`claude-haiku-4-5-20251001`) — `getModel('free', ...)` ignores feature overrides unconditionally (D-13)
- Career feature override routes Pro/Elite to Haiku (preserving existing analyze-career behavior)
- 19 comprehensive Deno tests validate every timeout value, throw behavior for unsupported pairs, and Free-model invariant across all feature keys

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tier-config.ts** - `80a3050` (test: RED phase) -> `3560c4d` (feat: GREEN phase)
2. **Task 2: Write comprehensive test suite** - `5d28009` (test: full 19-test suite + run-edge-tests.ps1 update)

## TDD Gate Compliance

- RED gate: `80a3050` — test(14-01): add failing test for tier-config module (RED phase)
- GREEN gate: `3560c4d` — feat(14-01): implement tier-config.ts with BACK-12 timeouts and D-13 Free-model guard
- Full test suite: `5d28009` — test(14-01): comprehensive tier-config test suite with all BACK-12 and D-13 assertions

## Files Created/Modified
- `supabase/functions/_shared/tier-config.ts` - Per-tier timeout and model config with getTimeout/getModel API
- `supabase/functions/_shared/tier-config.test.ts` - 19 Deno tests covering all BACK-12 values and D-13 Free-model enforcement
- `scripts/run-edge-tests.ps1` - Added tier-config.test.ts to test runner

## Decisions Made
- Used `claude-sonnet-4-5-20250929` as the default Pro/Elite model ID with a TODO comment for Phase 15 confirmation, since existing edge functions currently default to Haiku via `ANTHROPIC_MODEL_TEXT` env var
- Chose fail-loud semantics (throw Error) for undefined tier/callType pairs rather than a fallback default, so misuse is caught immediately
- Free tier model routing unconditionally returns Haiku without consulting FEATURE_MODEL_OVERRIDES, preventing any accidental override path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getTimeout` and `getModel` are ready for consumption by Phase 15+ feature edge functions
- Phase 15 (resume-analysis-gating) can import directly: `import { getTimeout, getModel } from '../_shared/tier-config.ts'`
- The `DEFAULT_PRO_ELITE_MODEL` constant should be confirmed against production Sonnet deployment in Phase 15

---
*Phase: 14-tier-prompts-and-locked-section-primitive*
*Completed: 2026-04-17*
