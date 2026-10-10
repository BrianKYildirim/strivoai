---
phase: 15-resume-analysis-gating
verified: 2026-04-16T09:00:00Z
status: human_needed
score: 11/11
overrides_applied: 0
human_verification:
  - test: "Analyze a resume as a Free user and inspect the returned grading_data JSON"
    expected: "Only overallScore, executiveSummary, resumeSignal, strengths, 1 priorityImprovements, 11 criterionFeedback entries where C2-C11 have only {id, label, weight, score}. Zero rewriteSuggestions, industryGuess, suggestedTargetRoles, recommendedKeywords, eliteInsights keys present."
    why_human: "applyTierShape logic is verified statically but actual AI output shaping after the full Anthropic call stack requires a live run to confirm."
  - test: "Analyze a resume as an Elite user and inspect the returned grading_data JSON"
    expected: "All Pro fields plus eliteInsights object with interviewLikelihood, competitiveRanking, recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis fields populated (not null)."
    why_human: "Verifying the 4th elite-extras parallel call fires and its results fold into the merged output requires a live Anthropic call."
  - test: "Confirm Free analysis does NOT fire the elite-extras 4th call (cost guard)"
    expected: "Only 3 parallel calls fire for Free/Pro tiers; 4 calls fire for Elite. Check logs for 'elite-extras' call type absence in Free/Pro runs."
    why_human: "activeConfigs filter is verified statically but actual call count requires observing Supabase function logs."
---

# Phase 15: Resume Analysis Gating — Verification Report

**Phase Goal:** Apply tier-gated prompts and Merit deduction to analyze-resume with per-tier maxTokens and parallel-call budgets.
**Verified:** 2026-04-16T09:00:00Z
**Status:** human_needed (all automated checks passed; 3 runtime behaviors need human testing)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free tier merged output contains only allowed fields (overallScore, executiveSummary, resumeSignal, strengths, 1 priorityImprovements, 11 criterionFeedback where C2-C11 are score-only) | VERIFIED | `applyTierShape` exists in result-merger.ts with FREE_ALLOWED_FIELDS whitelist, IMPROVEMENT_CAPS free=1, and C2-C11 stripping logic. Unit tests `applyTierShape free: strips Pro/Elite-only fields`, `caps priorityImprovements to 1`, `strips feedback from C2-C11` all exist in result-merger.test.ts |
| 2 | Free tier merged output omits rewriteSuggestions, industryGuess, suggestedTargetRoles, recommendedKeywords, eliteInsights | VERIFIED | FREE_ALLOWED_FIELDS set does not include these keys. applyTierShape deletes any key not in whitelist. Confirmed by test `applyTierShape free: strips Pro/Elite-only fields` |
| 3 | Pro tier merged output contains all 11 criteria with full feedback plus Pro-only fields, no eliteInsights | VERIFIED | PRO_ALLOWED_FIELDS includes rewriteSuggestions, industryGuess, suggestedTargetRoles, recommendedKeywords but not eliteInsights. Test `applyTierShape pro: keeps all criteria feedback, keeps rewriteSuggestions, strips eliteInsights` exists |
| 4 | Elite tier merged output contains everything Pro has plus eliteInsights | VERIFIED | ELITE_ALLOWED_FIELDS = PRO_ALLOWED_FIELDS + eliteInsights. Test `applyTierShape elite: keeps everything including eliteInsights` exists. elite-extras 4th parallel call folds eliteInsights into merged output |
| 5 | mergeAndValidateResults signature accepts tier string instead of isElite boolean | VERIFIED | Signature is `mergeAndValidateResults(rawResults: Record<string, string>, tier: 'free' \| 'pro' \| 'elite')`. All 4 call sites in analyze-resume/index.ts pass `resolvedTier`. No boolean callers found codebase-wide. |
| 6 | CallType union includes 'elite-extras' | VERIFIED | Line 29 of resume-prompts.ts: `export type CallType = 'criteria-1' \| 'criteria-2' \| 'summary' \| 'elite-extras'` |
| 7 | buildEliteExtrasSuffix returns prompt for 6 Elite-only fields, dispatched via buildCallSuffix | VERIFIED | Function defined at line 288 of resume-prompts.ts, case 'elite-extras' at line 224. Prompt contains interviewLikelihood, competitiveRanking, recruiterFirstImpressions, hiddenWeaknesses, powerPhrases, detailedATSGapAnalysis |
| 8 | TIER_MAX_TOKENS constant exists with free=6000, pro=16000, elite=20000 | VERIFIED | tier-config.ts lines 46-50: `export const TIER_MAX_TOKENS: Record<Tier, number> = { free: 6000, pro: 16000, elite: 20000 }` |
| 9 | rawBody.tier is not used; tier comes from userContext.tier (server-side) | VERIFIED | Line 237-240: resolvedTier derived from `userContext?.tier`. rawBody.tier appears only in a comment (line 234). Zero `userTier` references, zero `rawBody.tier` code references. log.warn('subscription-missing-or-invalid') present at line 243. |
| 10 | CALL_CONFIGS has 4 entries with correct D-17 budgets; boot-time assertion verifies sums | VERIFIED | Lines 46-60 of analyze-resume/index.ts: 4-entry CALL_CONFIGS (Free 1800/1800/2400/0=6000, Pro 4800/4800/6400/0=16000, Elite 5000/5000/6000/4000=20000). Boot-time loop throws if sum > TIER_MAX_TOKENS[tier]. |
| 11 | capPriorityImprovements function and all 8 call sites deleted | VERIFIED | grep count = 0 for `capPriorityImprovements` in analyze-resume/index.ts. Function definition and all 8 call sites removed. |

**Score:** 11/11 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/_shared/result-merger.ts` | applyTierShape, tier whitelists, updated mergeAndValidateResults | VERIFIED | Exports applyTierShape, mergeAndValidateResults (tier string), parseAndValidateCall. FREE/PRO/ELITE_ALLOWED_FIELDS, IMPROVEMENT_CAPS all present. |
| `supabase/functions/_shared/result-merger.test.ts` | 8+ applyTierShape unit tests, all calls use string tier | VERIFIED | 32 total tests. 8 applyTierShape tests covering all 3 tiers. All mergeAndValidateResults calls use tier strings ('free', 'pro', 'elite') — no booleans remain. |
| `supabase/functions/_shared/resume-prompts.ts` | elite-extras CallType, buildEliteExtrasSuffix | VERIFIED | CallType includes 'elite-extras'. buildEliteExtrasSuffix at line 288. case 'elite-extras' dispatch in buildCallSuffix at line 224. |
| `supabase/functions/_shared/tier-config.ts` | TIER_MAX_TOKENS with correct values | VERIFIED | TIER_MAX_TOKENS exported with free=6000, pro=16000, elite=20000. Existing getModel, getTimeout, TIER_TIMEOUTS unchanged. |
| `supabase/functions/analyze-resume/index.ts` | Full handler rewire — server-side tier, D-17 budgets, boot assertion, applyTierShape on all paths | VERIFIED | All criteria met: resolvedTier from userContext, CALL_CONFIGS 4 entries, boot-time assertion, activeConfigs filter, 4 mergeAndValidateResults(resolvedTier), 4 applyTierShape(fallbackResult, resolvedTier), 4 TIER_MAX_TOKENS[resolvedTier], getModel/getTimeout from tier-config. |
| `supabase/functions/analyze-resume/index.test.ts` | 8 boot-time assertion tests | VERIFIED | File exists with 8 tests: 3 verify correct sums pass, 3 verify misconfigured sums throw, 1 verifies non-throw, 1 verifies zero-budget edge case. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| result-merger.ts | analyze-resume/index.ts | mergeAndValidateResults import | WIRED | Line 6 import, 4 call sites all pass resolvedTier |
| result-merger.ts | analyze-resume/index.ts | applyTierShape import | WIRED | Line 6 import, 4 fallback path call sites at lines 382, 502, 729, 975 |
| tier-config.ts | analyze-resume/index.ts | TIER_MAX_TOKENS import | WIRED | Line 14 import, used at 3 boot-assertion lines + 4 fallbackMaxTokens lines |
| resume-prompts.ts | analyze-resume/index.ts | CallType and buildSystemBlocks imports | WIRED | Line 8 import, buildSystemBlocks used in makeCall |
| tier-config.ts | analyze-resume/index.ts | getModel import | WIRED | Line 14 import, used at lines 269, 585 (merit and legacy model selection) |
| tier-config.ts | analyze-resume/index.ts | getTimeout import | WIRED | Line 14 import, used at line 85 (makeCall timeoutMs) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| analyze-resume/index.ts | resolvedTier | userContext.tier from requireInternalOrUserAuth (profiles.subscription_tier) | Yes — reads DB via auth helper | FLOWING |
| analyze-resume/index.ts | mergeResult.data | mergeAndValidateResults(rawResults, resolvedTier) | Yes — Anthropic API results processed through applyTierShape | FLOWING |
| analyze-resume/index.ts | fallbackResult after applyTierShape | buildFallbackPrompt response processed inline | Yes — calls Anthropic, applies tier shape | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires live Supabase function execution with Anthropic API credentials. Runtime behavior is routed to human verification below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RES-01 | 15-01, 15-03 | Free output: overallScore, executiveSummary, resumeSignal, full strengths, 1 priorityImprovements, C1 full feedback, C2-C11 score-only | SATISFIED | FREE_ALLOWED_FIELDS whitelist, IMPROVEMENT_CAPS free=1, C2-C11 strip logic in applyTierShape |
| RES-02 | 15-01, 15-03 | Free output omits: rewriteSuggestions, industryGuess, suggestedTargetRoles, recommendedKeywords, all Elite fields | SATISFIED | FREE_ALLOWED_FIELDS excludes all Pro/Elite fields. applyTierShape deletes unlisted keys. |
| RES-03 | 15-01, 15-03 | Pro output: all standard fields, all 11 criteria, rewrites, industryGuess, roles, keywords (no Elite) | SATISFIED | PRO_ALLOWED_FIELDS includes all standard fields, excludes eliteInsights. applyTierShape caps priorityImprovements to 5. |
| RES-04 | 15-01, 15-02, 15-03 | Elite output: all Pro fields plus 6 Elite-only fields via 4th parallel call | SATISFIED | ELITE_ALLOWED_FIELDS includes eliteInsights. elite-extras call type + buildEliteExtrasSuffix produces 6 Elite fields. elite-extras merged via rawResults['elite-extras'] fold-in. |
| RES-05 | 15-02, 15-03 | analyze-resume selects tier-specific prompt, sets maxTokens free=6000/pro=16000/elite=20000 | SATISFIED | TIER_MAX_TOKENS in tier-config.ts. CALL_CONFIGS budgets sum to exactly TIER_MAX_TOKENS per tier. getModel(resolvedTier, 'resume') selects model. |
| RES-06 | 15-02, 15-03 | Parallel-call budgets re-derived from per-tier maxTokens cap | SATISFIED | Boot-time assertion verifies CALL_CONFIGS sum <= TIER_MAX_TOKENS for all tiers. index.test.ts has 8 tests proving assertion catches misconfigurations. |
| BACK-08 | 15-03 | analyze-resume: tier param, Merit check, prompt variant selection, per-tier maxTokens | SATISFIED | resolvedTier from server-side auth, withMerits wraps AI calls, buildSystemBlocks uses tier-aware prompts, TIER_MAX_TOKENS controls budgets. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/_shared/tier-config.ts` | 59 | `TODO(Phase 15): Confirm this model ID matches production Sonnet deployment.` | Info | Pre-existing TODO on DEFAULT_PRO_ELITE_MODEL constant. Does not affect tier-gating logic. Model ID is a separate deployment concern. |
| `supabase/functions/analyze-resume/index.ts` | 63 | `const MERIT_COST` defined but never consumed by withMerits | Info | MERIT_COST = { free: 3, pro: 2, elite: 3 } is documentation. withMerits uses the check_and_deduct_merits RPC internally for cost lookup — the constant is informational. No functional gap. |

### Human Verification Required

#### 1. Free Tier Output Field Stripping

**Test:** Submit a resume for analysis logged in as a Free user. Inspect the `grading_data` JSON in the response (or in the `analysis_jobs` / `resumes` table).
**Expected:** The JSON must contain ONLY: `overallScore`, `executiveSummary`, `resumeSignal`, `strengths`, `priorityImprovements` (array of exactly 1 item), `criterionFeedback` (11 entries where indices 0 has `feedback` object, indices 1-10 have only `{id, label, weight, score}`). Fields `rewriteSuggestions`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, `eliteInsights` must be absent.
**Why human:** applyTierShape is verified statically and unit tested, but the full request lifecycle (auth -> tier resolution -> Anthropic call -> merge -> tier shape -> response) requires a live end-to-end run.

#### 2. Elite Tier eliteInsights Population

**Test:** Submit a resume for analysis logged in as an Elite user. Inspect the `grading_data` JSON.
**Expected:** Response includes `eliteInsights` object with populated `interviewLikelihood` (number 0-100), `competitiveRanking` (one of "Top 10%", "Top 25%", "Top 50%", "Bottom 50%"), `recruiterFirstImpressions` (object), `hiddenWeaknesses` (array), `powerPhrases` (array), `detailedATSGapAnalysis` (array). Should NOT be null.
**Why human:** The elite-extras 4th parallel call fires only at runtime. Static verification confirms the code path exists; actual Anthropic output and fold-in requires a live call.

#### 3. Free/Pro Parallel Call Count (Cost Guard)

**Test:** Trigger a resume analysis for a Free user and a Pro user. Check Supabase function logs for parallel call activity.
**Expected:** Free and Pro analyses show exactly 3 parallel calls (criteria-1, criteria-2, summary). Elite shows 4 (adds elite-extras). The `elite-extras` call type must NOT appear in Free/Pro logs.
**Why human:** The activeConfigs filter (maxTokens === 0 excluded) is verified statically, but observing call count requires live execution logs.

### Gaps Summary

No automated gaps found. All 11 observable truths are VERIFIED. All 6 required artifacts exist and are wired. All 7 requirement IDs (RES-01 through RES-06, BACK-08) are satisfied by code evidence.

Three human verification items cover runtime behavior that cannot be confirmed statically: Free output field stripping under real AI calls, Elite eliteInsights population from the 4th parallel call, and call-count enforcement in production logs.

---

_Verified: 2026-04-16T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
