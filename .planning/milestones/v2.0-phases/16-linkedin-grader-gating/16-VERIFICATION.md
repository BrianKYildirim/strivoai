---
phase: 16-linkedin-grader-gating
verified: 2026-04-17T15:45:00Z
status: human_needed
score: 4/5
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Free user gets stripped output (no profileInsights, no feedback arrays, 1 topFix)"
    - "Free user response has no profileInsights and no feedback arrays in sectionBreakdown"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "On monthly Merit reset, free_linkedin_scan_used returns to false"
    addressed_in: "Phase 11"
    evidence: "reset_subscription_merits RPC in supabase/migrations/20260415000000_merit_rpcs.sql sets free_linkedin_scan_used = false. Success criterion 4 is an RPC-layer concern delivered in Phase 11, not Phase 16."
human_verification:
  - test: "Pro user first-scan entitlement flow end-to-end"
    expected: "Pro user with free_linkedin_scan_used=false submits LinkedIn profile; receives full Pro output (profileInsights + feedback arrays); merit balance unchanged; free_linkedin_scan_used flips to true"
    why_human: "Requires live MERIT_SYSTEM_ENABLED=true environment with a seeded user_merits row; cannot verify without deployed function and real Supabase DB"
  - test: "Free user Free-tier output shape end-to-end"
    expected: "Free user submits LinkedIn profile; receives rawScore, scoreJustification, keyStrengths, nextBestAction, exactly 1 topFixes entry; no profileInsights key; sectionBreakdown has name/score/maxScore/status but no feedback arrays"
    why_human: "Requires deployed function with MERIT_SYSTEM_ENABLED=true and a real Anthropic API call to confirm the Free prompt + relaxed validator + strip produces the correct output shape"
---

# Phase 16: LinkedIn Grader Gating -- Verification Report

**Phase Goal:** Make LinkedIn Grader tier-aware with a free monthly scan for Pro/Elite users, preserving the full v3.0 scoring flow.
**Verified:** 2026-04-17T15:45:00Z
**Status:** human_needed
**Re-verification:** Yes -- after gap closure (Plan 16-04 closed CR-01)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free user gets `rawScore`, `scoreJustification`, full `keyStrengths`, `nextBestAction`, and only the first `topFixes` entry | VERIFIED | `validateLinkedInGrade(parsed, tier)` at index.ts lines 148/151/161/164 now passes tier; validation.ts line 47 accepts `tier: Tier = 'pro'`; Free skips `profileInsights` check (line 56: `REQUIRED_TOP_LEVEL_BASE`) and `feedback` check (line 116: `if (tier !== 'free')`); `stripLinkedInFreeTier` (index.ts lines 170-172) runs after validation for `tier === 'free'`, deleting `profileInsights`, truncating `topFixes` to `[0]`, and stripping `feedback` arrays. Validation test `makeValidFreeGrade()` confirms Free response shape passes validation with `tier='free'`. |
| 2 | Free user sees no `profileInsights` and no detailed `sectionBreakdown` beyond scores | VERIFIED | Defense-in-depth: (a) `buildFreeSystemPrompt()` (prompts.ts line 26) omits `profileInsights` from schema and instructs no feedback arrays, (b) `validateLinkedInGrade(parsed, 'free')` does not require `profileInsights` or `feedback`, (c) `stripLinkedInFreeTier` deletes `profileInsights` and `feedback` arrays server-side. Free prompt test confirms: `D-12: Free prompt omits profileInsights from output schema` passes. |
| 3 | Pro/Elite first scan in billing cycle costs 0 Merits; subsequent scans deduct 2 (Pro) / 3 (Elite) | VERIFIED | `freeScanThisRequest = tier !== 'free' && !isFreeScanUsed` (index.ts line 253). Free-scan path calls `runTieredAiCall` directly bypassing `withMerits` (lines 295-309). Paid path wraps in `withMerits` (lines 311-323). Flag flip to `true` after AI success (lines 301-307). 7 free-scan.test.ts tests all pass. |
| 4 | On monthly Merit reset, `free_linkedin_scan_used` returns to false | DEFERRED | Handled in Phase 11: `reset_subscription_merits` RPC sets `free_linkedin_scan_used = false`. This is a DB-layer concern outside Phase 16 scope. |
| 5 | `maxTokens` is 4000 for Free and 8192 for Pro/Elite | VERIFIED | `LINKEDIN_MAX_TOKENS` constant (index.ts lines 111-115): `{ free: 4000, pro: 8192, elite: 8192 }`. Used in `runTieredAiCall` line 137: `maxTokens: LINKEDIN_MAX_TOKENS[tier]`. 3 handler-config.test.ts tests confirm. |

**Score:** 4/5 truths verified (SC4 deferred to Phase 11)

### Deferred Items

Items not yet met but explicitly addressed in earlier/co-milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Monthly reset of `free_linkedin_scan_used` to false | Phase 11 | `reset_subscription_merits` RPC: `free_linkedin_scan_used = false` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/_shared/resolve-tier.ts` | Shared tier resolution helper | VERIFIED | Exports `resolveTier`, queries `profiles.subscription_tier` via `maybeSingle()`, defaults to `'free'` (47 lines) |
| `supabase/functions/_shared/resolve-tier.test.ts` | 6 source-analysis tests | VERIFIED | 6 Deno.test blocks all pass covering profiles query, maybeSingle, export shape, Tier import |
| `supabase/functions/_shared/tier-config.ts` | LinkedIn model override | VERIFIED | `linkedin: { pro: FREE_MODEL, elite: FREE_MODEL }` present at line 77. No stale `TODO(Phase 15)` (removed by Plan 16-04). |
| `supabase/functions/grade-linkedin/prompts.ts` | Free/Pro/Elite prompt variants + registration | VERIFIED | `buildFreeSystemPrompt` (line 26), `buildProSystemPrompt` (line 149), `LINKEDIN_PROMPT_VARIANTS` (line 314), `registerFeaturePrompts('linkedin', ...)` (line 320). `buildSystemPrompt` alias retained for legacy path (line 276). |
| `supabase/functions/grade-linkedin/prompts.test.ts` | 9 tier variant + 11 existing tests | VERIFIED | 20 Deno.test blocks all pass. D-12, LIG-03, D-10 tests present. |
| `supabase/functions/grade-linkedin/index.ts` | Tier-gated handler with strip, free-scan, tier-aware validation | VERIFIED | `stripLinkedInFreeTier` exported (line 89), `LINKEDIN_MAX_TOKENS` (lines 111-115), `loadPromptVariant('linkedin', tier, {})` (line 130), `getModel(tier, 'linkedin')` (line 134), `getTimeout(tier)` (line 139), `validateLinkedInGrade(parsed, tier)` at all 4 call sites (lines 148, 151, 161, 164). No duplicate `import './prompts.ts'`. Legacy path byte-identical (uses `buildSystemPrompt()` and `maxTokens: 8192`). |
| `supabase/functions/grade-linkedin/validation.ts` | Tier-aware validator | VERIFIED | `validateLinkedInGrade(parsed: unknown, tier: Tier = 'pro')` (line 47). `REQUIRED_TOP_LEVEL_BASE` (6 fields, no profileInsights, line 20). `REQUIRED_TOP_LEVEL_PRO` (7 fields, includes profileInsights, line 29). Check 7 guarded with `if (tier !== 'free')` (line 116). Check 9 guarded with `if (tier !== 'free')` (line 135). |
| `supabase/functions/grade-linkedin/validation.test.ts` | 22 existing + 5 Free-tier tests | VERIFIED | 27 tests all pass. `makeValidFreeGrade()` helper present. Free-tier validation, Pro backward compat, and default-tier tests all confirmed. |
| `supabase/functions/grade-linkedin/strip.test.ts` | 5 source-analysis tests | VERIFIED | 5 Deno.test blocks all pass (LIG-01/02/03/04 strip assertions). |
| `supabase/functions/grade-linkedin/free-scan.test.ts` | 7 source-analysis tests | VERIFIED | 7 Deno.test blocks all pass (LIG-05/06 free-scan decision logic). |
| `supabase/functions/grade-linkedin/handler-config.test.ts` | 7 legacy + 9 Phase 16 tests | VERIFIED | 16 Deno.test blocks all pass (LIG-07, BACK-09, D-05, D-14). |
| `supabase/functions/analyze-resume/index.ts` | Tier from userContext.tier, not rawBody.tier | VERIFIED | Line 236: `const resolvedTier = (userContext?.tier as Tier) ?? 'free'`. Comment on line 235: `// Never trust rawBody.tier.` No `rawBody.tier` reference found. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `grade-linkedin/index.ts` | `_shared/tier-prompts.ts` | `loadPromptVariant('linkedin', tier, {})` | WIRED | Line 18 import + line 130 call confirmed |
| `grade-linkedin/index.ts` | `_shared/tier-config.ts` | `getModel(tier, 'linkedin')` + `getTimeout(tier)` | WIRED | Lines 19-20 imports; lines 134, 139 calls confirmed |
| `grade-linkedin/index.ts` | `_shared/merit-gateway.ts` | `withMerits` in paid path | WIRED | Lines 11, 312 confirmed |
| `grade-linkedin/index.ts` | `grade-linkedin/validation.ts` | `validateLinkedInGrade(parsed, tier)` | WIRED | Line 15 import; 4 tier-aware calls at lines 148, 151, 161, 164. CR-01 CLOSED. |
| `grade-linkedin/prompts.ts` | `_shared/tier-prompts.ts` | `registerFeaturePrompts('linkedin', LINKEDIN_PROMPT_VARIANTS)` | WIRED | Line 11 import + line 320 registration confirmed |
| `analyze-resume/index.ts` | `_shared/tier-config.ts` | `(userContext?.tier as Tier) ?? 'free'` | WIRED | Line 236 confirmed; no rawBody.tier usage |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `grade-linkedin/index.ts` (Merit branch) | `tier` | `userContext.tier` from `requireAuth` -> `profiles.subscription_tier` | Yes -- DB query in auth | FLOWING |
| `grade-linkedin/index.ts` (Merit branch) | `parsed` (AI response) | `runTieredAiCall` -> `invokeWithRetry` -> Anthropic API | Yes -- real AI call | FLOWING |
| `grade-linkedin/index.ts` (Merit branch) | `freeScanThisRequest` | `user_merits.free_linkedin_scan_used` DB query (lines 246-251) | Yes -- real DB row | FLOWING |
| `stripLinkedInFreeTier` | `parsed` after strip | Called from `runTieredAiCall` line 171 when `tier === 'free'` | Now reachable -- CR-01 fixed. Validation passes for Free-tier shape, strip runs. | FLOWING |
| `loadPromptVariant` | system prompt | `LINKEDIN_PROMPT_VARIANTS` registered at module load (prompts.ts line 320) | Yes -- returns `buildFreeSystemPrompt()` or `buildProSystemPrompt()` based on tier | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 103 Phase 16 Deno tests pass | `deno test --allow-all grade-linkedin/ _shared/tier-config.test.ts _shared/resolve-tier.test.ts --no-check` | 103 passed, 0 failed (762ms) | PASS |
| Free-tier validation accepts response without profileInsights | Deno test `Free-tier response without profileInsights returns valid: true` | ok (0ms) | PASS |
| Pro-tier validation rejects response without profileInsights | Deno test `Pro-tier response without profileInsights still returns valid: false` | ok (0ms) | PASS |
| Default tier enforces Pro validation (backward compat) | Deno test `Default tier parameter (no tier arg) enforces Pro validation` | ok (0ms) | PASS |
| 4 tier-aware validateLinkedInGrade calls in runTieredAiCall | `grep -c "validateLinkedInGrade(parsed, tier)" index.ts` | 4 | PASS |
| No duplicate side-effect import | `grep "import './prompts.ts'" index.ts` | No matches | PASS |
| No stale TODO(Phase 15) | `grep "TODO(Phase 15)" tier-config.ts` | No matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LIG-01 | 16-02, 16-03 | Free output: rawScore, scoreJustification, keyStrengths, nextBestAction, first topFixes only | SATISFIED | Free prompt omits locked fields; `stripLinkedInFreeTier` truncates topFixes to `[0]`; tier-aware validator accepts Free shape |
| LIG-02 | 16-02, 16-03 | Free output omits profileInsights and sectionBreakdown feedback arrays | SATISFIED | Free prompt excludes profileInsights and feedback; validator relaxed for Free; strip deletes both server-side |
| LIG-03 | 16-02, 16-03 | Pro output: all fields including profileInsights, full sectionBreakdown feedback, all topFixes | SATISFIED | `buildProSystemPrompt` includes profileInsights and feedback schema; `validateLinkedInGrade(parsed, 'pro')` enforces full schema |
| LIG-04 | 16-02, 16-03 | Elite output: same as Pro | SATISFIED | `LINKEDIN_PROMPT_VARIANTS.elite` uses `buildProSystemPrompt()`; `LINKEDIN_MAX_TOKENS.elite = 8192`; test `D-10: Elite variant references Pro builder` passes |
| LIG-05 | 16-03 | Pro/Elite first scan per billing cycle costs 0 Merits | SATISFIED | `freeScanThisRequest` logic bypasses `withMerits`; 7 free-scan.test.ts tests pass |
| LIG-06 | 16-03 | linkedin-grader checks free_linkedin_scan_used; sets true after use | SATISFIED | Reads from `user_merits` (lines 246-251); flips to true after AI success (lines 301-307) |
| LIG-07 | 16-01, 16-03 | maxTokens: Free=4000, Pro=Elite=8192 | SATISFIED | `LINKEDIN_MAX_TOKENS` constant and usage in `runTieredAiCall` confirmed; 3 handler-config tests pass |
| BACK-09 | 16-01, 16-03, 16-04 | Modified linkedin-grader: Merit check, free-scan check, prompt variant, per-tier maxTokens | SATISFIED | All components wired: `withMerits`, `freeScanThisRequest`, `loadPromptVariant`, `LINKEDIN_MAX_TOKENS`, tier-aware `validateLinkedInGrade`. CR-01 closed by Plan 16-04. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | No TODOs, FIXMEs, stubs, or placeholder patterns found in Phase 16 source files | -- | -- |

### Human Verification Required

#### 1. Pro/Elite Free-Scan End-to-End

**Test:** With `MERIT_SYSTEM_ENABLED=true`, log in as a Pro user whose `user_merits.free_linkedin_scan_used = false`. Submit a LinkedIn profile (>50 chars). Inspect response.
**Expected:** Full Pro-tier response with `profileInsights` and `sectionBreakdown.feedback` arrays. Merit balance unchanged. Second request against same user deducts 2 Merits.
**Why human:** Requires live deployed function + seeded `user_merits` row + real Anthropic call.

#### 2. Free User Free-Tier Output Shape

**Test:** With `MERIT_SYSTEM_ENABLED=true`, log in as a Free user. Submit a LinkedIn profile. Inspect the JSON response shape.
**Expected:** Response contains `rawScore`, `scoreJustification`, `keyStrengths`, `nextBestAction`, exactly one entry in `topFixes`. No `profileInsights` key present. Each entry in `sectionBreakdown` has `name`, `score`, `maxScore`, `status` -- NO `feedback` array.
**Why human:** Requires deployed function with real Anthropic API call to confirm the Free prompt + relaxed validator + strip produces the correct output shape end-to-end.

### Gaps Summary

No gaps remain. The CR-01 blocker identified in the initial verification has been fully closed by Plan 16-04:

1. `validation.ts` now accepts a `tier: Tier = 'pro'` parameter (line 47)
2. `REQUIRED_TOP_LEVEL_BASE` (6 fields without profileInsights) is used for Free tier (line 56)
3. Check 7 (feedback arrays) guarded with `if (tier !== 'free')` (line 116)
4. Check 9 (profileInsights) guarded with `if (tier !== 'free')` (line 135)
5. All 4 `validateLinkedInGrade` calls in `runTieredAiCall` pass `tier` (lines 148, 151, 161, 164)
6. `stripLinkedInFreeTier` at line 171 is now reachable for Free-tier requests

All 103 Deno tests pass (27 validation + 20 prompts + 16 handler-config + 5 strip + 7 free-scan + 22 tier-config + 6 resolve-tier). All 8 requirement IDs (LIG-01 through LIG-07, BACK-09) are satisfied. The duplicate import (IN-01) and stale TODO (IN-02) have been cleaned up.

Two human verification items remain: Pro free-scan entitlement flow and Free-tier output shape both require a live deployed environment with real Anthropic API calls.

---

_Verified: 2026-04-17T15:45:00Z_
_Verifier: Claude (gsd-verifier)_
