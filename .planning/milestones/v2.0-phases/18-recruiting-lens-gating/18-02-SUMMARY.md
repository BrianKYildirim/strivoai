---
phase: 18-recruiting-lens-gating
plan: 02
subsystem: api
tags: [recruiting-lens, tier-gating, tier-config, budget-assertion, deno]

# Dependency graph
requires:
  - phase: 14-tier-prompts-and-locked-section-primitive
    provides: getModel, getTimeout, TIER_MAX_TOKENS, Tier type from tier-config.ts
  - phase: 18-recruiting-lens-gating plan 01
    provides: mergeRecruitingLensResults with tier parameter, applyRecruitingLensTierShape
provides:
  - Tier-aware recruiting-lens handler with resolvedTier replacing isElite boolean
  - CALL_CONFIGS Pro budget reduced to 8000 total (cost optimization)
  - Boot-time RCL_MAX_TOKENS assertion for budget invariant validation
  - Centralized getModel/getTimeout usage replacing hardcoded constants
  - FEATURE_MODEL_OVERRIDES recruiting entry for explicit Haiku 4.5 routing
affects: [18-recruiting-lens-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boot-time budget assertion pattern (RCL_MAX_TOKENS) matching analyze-resume D-18 pattern"
    - "resolvedTier string replacing isElite boolean for tier-conditional logic"
    - "getModel(tier, 'recruiting') centralized model selection via tier-config"

key-files:
  created: []
  modified:
    - supabase/functions/_shared/tier-config.ts
    - supabase/functions/recruiting-lens/index.ts

key-decisions:
  - "Pro CALL_CONFIGS budget reduced from 16000 to 8000 (3000+2500+2500) matching RCL-05 spec for Pro tier cost optimization"
  - "Used local RCL_MAX_TOKENS constant instead of importing TIER_MAX_TOKENS since recruiting-lens has feature-specific caps (Pro=8000 vs global Pro=16000)"
  - "FEATURE_MODEL_OVERRIDES recruiting entry maps both Pro and Elite to FREE_MODEL (Haiku 4.5) for cost optimization"

patterns-established:
  - "Recruiting Lens tier-config integration: getModel(resolvedTier, 'recruiting') + getTimeout(tier) pattern"
  - "Feature-specific budget caps via local RCL_MAX_TOKENS with boot-time assertion"

requirements-completed: [RCL-01, RCL-05, BACK-11]

# Metrics
duration: 4min
completed: 2026-04-17
---

# Phase 18 Plan 02: Recruiting Lens Handler Tier Wiring Summary

**Rewired recruiting-lens handler with resolvedTier string, Pro budget cap at 8000, boot-time assertion, and centralized getModel/getTimeout from tier-config**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T08:28:30Z
- **Completed:** 2026-04-17T08:32:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `recruiting` entry to `FEATURE_MODEL_OVERRIDES` in tier-config.ts, routing both Pro and Elite to Haiku 4.5
- Replaced `isElite` boolean with `resolvedTier` string throughout the entire handler (zero `isElite` references remain)
- Reduced Pro CALL_CONFIGS budget from 16000 to 8000 total (3000+2500+2500) per RCL-05
- Added boot-time `RCL_MAX_TOKENS` assertion validating Pro=8000 and Elite=20000 caps
- Replaced hardcoded `ANTHROPIC_MODEL` constant with `getModel(resolvedTier, 'recruiting')` in both Merit and legacy paths
- Replaced hardcoded timeout ternary with `getTimeout(tier)` from tier-config
- Passed `resolvedTier` to `mergeRecruitingLensResults` in both Merit and legacy paths
- Updated Elite persistence guard to use `resolvedTier === 'elite'`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add recruiting model override to tier-config.ts** - `fbf1079` (feat)
2. **Task 2: Rewire handler -- resolvedTier, CALL_CONFIGS, model/timeout, boot assertion, merger tier param** - `ff4b58b` (feat)

## Files Created/Modified
- `supabase/functions/_shared/tier-config.ts` - Added recruiting entry to FEATURE_MODEL_OVERRIDES (Pro and Elite mapped to FREE_MODEL)
- `supabase/functions/recruiting-lens/index.ts` - Replaced isElite with resolvedTier, updated CALL_CONFIGS Pro budgets to 8000, added RCL_MAX_TOKENS boot assertion, replaced ANTHROPIC_MODEL with getModel, replaced timeout ternary with getTimeout, passed tier to merger

## Decisions Made
- Pro CALL_CONFIGS budget reduced from 16000 to 8000 per RCL-05 spec -- aligns with Pro tier's reduced output scope (fewer fields from call-2 and call-3)
- Used local `RCL_MAX_TOKENS` constant rather than importing `TIER_MAX_TOKENS` since recruiting-lens has feature-specific caps (Pro=8000 vs global TIER_MAX_TOKENS.pro=16000)
- Added recruiting entry to FEATURE_MODEL_OVERRIDES for explicit auditability even though the default model would also work

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing `deno check` errors in shared modules (anthropic.ts, auth.ts, cors.ts, merit-gateway.ts, supabase-client.ts) related to `Deno` namespace and type narrowing -- confirmed identical errors exist on base commit. Not introduced by our changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend tier-gating pipeline for Recruiting Lens is complete
- Handler uses server-side resolvedTier with proper budget caps and centralized config
- Ready for Plan 03 (frontend LockedListItem integration) to wire the tier-shaped output to UI components

## Self-Check: PASSED

All 2 modified files exist. All 2 task commits verified in git log. SUMMARY.md created.

---
*Phase: 18-recruiting-lens-gating*
*Completed: 2026-04-17*
