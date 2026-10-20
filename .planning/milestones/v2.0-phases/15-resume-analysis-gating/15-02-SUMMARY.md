---
phase: 15-resume-analysis-gating
plan: 02
subsystem: api
tags: [anthropic, prompts, tier-config, elite, resume-analysis]

# Dependency graph
requires:
  - phase: 14-tier-prompts-and-locked-section-primitive
    provides: tier-config.ts with Tier type, TIER_TIMEOUTS pattern; resume-prompts.ts with tier-variant builders
provides:
  - "elite-extras CallType variant for 4th parallel resume analysis call"
  - "buildEliteExtrasSuffix prompt builder for 6 Elite-only fields"
  - "TIER_MAX_TOKENS constant with per-tier token budget caps (6000/16000/20000)"
affects: [15-resume-analysis-gating, 16-linkedin-grader-gating, 17-career-compass-gating, 18-recruiting-lens-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-tier maxTokens caps as shared constant consumed by feature handlers"
    - "Isolated elite-extras call type for Elite-only fields without inflating Free/Pro latency"

key-files:
  created: []
  modified:
    - supabase/functions/_shared/resume-prompts.ts
    - supabase/functions/_shared/tier-config.ts

key-decisions:
  - "elite-extras is a private function (not exported) dispatched via buildCallSuffix — callers use the existing switch, not direct import"
  - "TIER_MAX_TOKENS placed after TIER_TIMEOUTS block following the same Record<Tier, T> pattern"

patterns-established:
  - "Per-tier token cap constant: TIER_MAX_TOKENS as the single source of truth for feature-level budget derivation"
  - "Conditional 4th parallel call: elite-extras fires only for Elite tier, zero latency impact on Free/Pro"

requirements-completed: [RES-04, RES-05, RES-06]

# Metrics
duration: 2min
completed: 2026-04-17
---

# Phase 15 Plan 02: Elite-Extras Prompt and TIER_MAX_TOKENS Summary

**Elite-extras call type added to resume-prompts.ts for 4th parallel call, TIER_MAX_TOKENS constant (6000/16000/20000) added to tier-config.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-17T06:47:23Z
- **Completed:** 2026-04-17T06:49:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended CallType union with 'elite-extras' for the dedicated 4th parallel call that produces Elite-only narrative fields
- Added buildEliteExtrasSuffix() with strict JSON schema for interviewLikelihood, competitiveRanking, recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, and detailedATSGapAnalysis
- Added TIER_MAX_TOKENS constant to tier-config.ts with spec-mandated values (free: 6000, pro: 16000, elite: 20000)
- All 8 existing resume-prompts-variants tests pass unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend CallType with elite-extras and add buildEliteExtrasSuffix** - `d592725` (feat)
2. **Task 2: Add TIER_MAX_TOKENS to tier-config.ts** - `543cbdc` (feat)

## Files Created/Modified
- `supabase/functions/_shared/resume-prompts.ts` - Added 'elite-extras' to CallType, buildEliteExtrasSuffix builder, case dispatch in buildCallSuffix
- `supabase/functions/_shared/tier-config.ts` - Added TIER_MAX_TOKENS constant with per-tier token caps, updated module JSDoc

## Decisions Made
- Kept buildEliteExtrasSuffix as a private (non-exported) function, accessible only through the buildCallSuffix dispatcher -- matches the pattern of buildCriteria1Suffix/buildCriteria2Suffix/buildSummarySuffix
- No changes needed to buildFallbackPrompt -- the fallback path intentionally excludes elite-extras (degraded path produces base result without Elite bonus fields)
- No changes needed to buildSystemBlocks -- it already delegates through buildCallSuffix which now handles the new case

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 can now import TIER_MAX_TOKENS from tier-config.ts for budget derivation and boot-time assertions
- Plan 03 can add 'elite-extras' entries to CALL_CONFIGS in analyze-resume/index.ts
- The buildEliteExtrasSuffix prompt is ready for the fan-out loop to invoke via buildCallSuffix('elite-extras', ...)

---
*Phase: 15-resume-analysis-gating*
*Completed: 2026-04-17*
