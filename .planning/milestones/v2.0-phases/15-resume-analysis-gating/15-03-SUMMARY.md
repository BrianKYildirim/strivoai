---
phase: 15-resume-analysis-gating
plan: 03
subsystem: analyze-resume handler
tags: [tier-gating, server-side-tier, boot-assertion, parallel-calls, merit-cost]
dependency_graph:
  requires: [15-01, 15-02]
  provides: [tier-aware-analyze-resume]
  affects: [supabase/functions/analyze-resume/index.ts]
tech_stack:
  added: []
  patterns: [server-side-tier-resolution, boot-time-assertion, activeConfigs-filter]
key_files:
  created:
    - supabase/functions/analyze-resume/index.test.ts
  modified:
    - supabase/functions/analyze-resume/index.ts
decisions:
  - "D-01: Tier resolved server-side from userContext.tier (profiles.subscription_tier) -- rawBody.tier eliminated"
  - "D-03: Missing subscription defaults to 'free' with warn log for reconciliation"
  - "D-17: CALL_CONFIGS budgets updated to Free 1800/1800/2400/0=6000, Pro 4800/4800/6400/0=16000, Elite 5000/5000/6000/4000=20000"
  - "D-18: Boot-time assertion validates per-tier budget sums do not exceed TIER_MAX_TOKENS"
  - "validateFeedbackDepth gated behind resolvedTier !== 'free' to avoid spurious warnings on shaped Free output"
metrics:
  duration: "10 minutes"
  completed: "2026-04-17T07:33:00Z"
  tasks: 3/3
  files_modified: 2
---

# Phase 15 Plan 03: Tier-Aware analyze-resume Handler Summary

Server-side tier resolution with D-17 budgets, 4th elite-extras call, boot-time assertion, applyTierShape on all paths, and getModel/getTimeout from tier-config.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Update imports, CALL_CONFIGS, boot-time assertion, delete capPriorityImprovements | 6cbba32 | New imports (applyTierShape, TIER_MAX_TOKENS, getModel, getTimeout, Tier), 4-entry CALL_CONFIGS with D-17 budgets, boot-time assertion, MERIT_COST constant, activeConfigs filter, getTimeout in makeCall, capPriorityImprovements function deleted |
| 2 | Replace rawBody.tier with server-side tier, update all call sites | 2f1bdc1 | resolvedTier from userContext.tier, all 4 mergeAndValidateResults calls pass resolvedTier, all 8 capPriorityImprovements call sites deleted, 4 applyTierShape calls on fallback paths, 4 TIER_MAX_TOKENS[resolvedTier] for fallback budgets, getModel in both paths, dynamic call counts, validateFeedbackDepth gated |
| 3 | Create boot-time assertion unit tests (D-18 / RES-06) | ce9d05f | 8 Deno tests: 4 verify correct budgets pass, 3 verify misconfigured budgets throw, 1 verifies zero-budget edge case |

## Changes Made

### supabase/functions/analyze-resume/index.ts

**Imports added:**
- `applyTierShape` from `result-merger.ts` (Plan 01 output)
- `TIER_MAX_TOKENS`, `getModel`, `getTimeout`, `type Tier` from `tier-config.ts` (Plan 02 output)

**CALL_CONFIGS rewritten (D-17):**
- 4 entries: criteria-1, criteria-2, summary, elite-extras
- Free: 1800+1800+2400+0 = 6000 (matches TIER_MAX_TOKENS.free)
- Pro: 4800+4800+6400+0 = 16000 (matches TIER_MAX_TOKENS.pro)
- Elite: 5000+5000+6000+4000 = 20000 (matches TIER_MAX_TOKENS.elite)

**Boot-time assertion (D-18):**
- Module-level loop verifies sum(CALL_CONFIGS[tier]) <= TIER_MAX_TOKENS[tier] for all 3 tiers
- Throws at module load if misconfigured -- zero runtime cost

**MERIT_COST constant added:**
- `{ free: 3, pro: 2, elite: 3 }` per spec S4.1 (Pro=2 intentional)

**capPriorityImprovements eliminated:**
- Function definition deleted (enforcement moved to applyTierShape in result-merger.ts by Plan 01)
- All 8 call sites removed

**Server-side tier resolution (D-01):**
- `rawBody.tier` read deleted -- replaced with `resolvedTier` derived from `userContext.tier`
- `userContext.tier` comes from `profiles.subscription_tier` via auth.ts
- Missing/invalid tier defaults to 'free' with `log.warn('subscription-missing-or-invalid')`

**executeParallelCalls updated:**
- `activeConfigs` filter skips zero-budget entries (elite-extras for Free/Pro)
- `getTimeout(params.tier as Tier)` replaces hardcoded 100000ms
- Retry and settled arrays reference `activeConfigs` instead of `CALL_CONFIGS`

**All 4 mergeAndValidateResults calls updated:**
- Pass `resolvedTier` (string) instead of `isElite` (boolean)
- Matches Plan 01's updated signature `mergeAndValidateResults(rawResults, tier)`

**All 4 fallback paths updated:**
- `applyTierShape(fallbackResult, resolvedTier)` added after `_mergeSource` assignment
- `fallbackMaxTokens` uses `TIER_MAX_TOKENS[resolvedTier]` instead of inline ternary

**Model routing updated:**
- `getModel(resolvedTier, 'resume')` in both merit and legacy paths
- Free always gets Haiku 4.5, Pro/Elite get Sonnet 4.5 (via tier-config.ts D-13)

**Failure detection updated:**
- Partial failure: `failedCalls.length < parallelResults.length` (was `< 3`)
- Total failure: `failedCalls.length === parallelResults.length` (was `=== 3`)
- Error messages: dynamic `of ${totalCalls}` instead of hardcoded `of 3`

**validateFeedbackDepth gated:**
- Wrapped in `if (resolvedTier !== 'free')` at all 8 call sites
- Free tier's shaped output has score-only C2-C11, which would trigger spurious warnings

### supabase/functions/analyze-resume/index.test.ts (NEW)

- 8 Deno tests for D-18 boot-time assertion logic
- Tests use real `TIER_MAX_TOKENS` values from tier-config.ts
- Replicates CALL_CONFIGS values and assertion logic for isolated testing
- Covers: correct Free/Pro/Elite sums pass, each tier's misconfiguration throws, zero-budget edge case

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functionality is fully wired.

## Self-Check: PASSED

- FOUND: supabase/functions/analyze-resume/index.ts
- FOUND: supabase/functions/analyze-resume/index.test.ts
- FOUND: commit 6cbba32 (Task 1)
- FOUND: commit 2f1bdc1 (Task 2)
- FOUND: commit ce9d05f (Task 3)
- rawBody.tier: 0 code references (1 comment explaining D-01)
- userTier: 0 references
- capPriorityImprovements: 0 references
- resolvedTier: 41 references
- applyTierShape: 5 references (1 import + 4 fallback paths)
- TIER_MAX_TOKENS: 8 references (1 import + 3 assertion + 4 fallback)
- mergeAndValidateResults: all 4 call sites pass resolvedTier string
- No boolean callers of mergeAndValidateResults outside index.ts/result-merger.test.ts
- All 8 boot-time assertion tests pass
