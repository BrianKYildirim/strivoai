---
phase: 15-resume-analysis-gating
reviewed: 2026-04-16T12:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - supabase/functions/_shared/result-merger.ts
  - supabase/functions/_shared/resume-prompts.ts
  - supabase/functions/_shared/tier-config.ts
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/analyze-resume/index.test.ts
  - supabase/functions/_shared/result-merger.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-16T12:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The Phase 15 resume-analysis-gating implementation is architecturally sound: tier is resolved server-side from `profiles.subscription_tier` via `requireInternalOrUserAuth`, `rawBody.tier` is never read, `applyTierShape` is called on every exit path (parallel success, fallback single-call, merit path, and legacy path), and the boot-time CALL_CONFIGS budget assertion correctly prevents token budget overruns. The test coverage for `applyTierShape` and the boot-time invariants is thorough.

However, there is one critical runtime crash bug, three warnings about functional gaps in the tier-shaping pipeline, and two minor code quality issues.

## Critical Issues

### CR-01: Temporal Dead Zone -- `resolvedTier` referenced before declaration

**File:** `supabase/functions/analyze-resume/index.ts:230`
**Issue:** Line 230 logs `resolvedTier` in `log.info('request-start', ...)`, but `resolvedTier` is not declared until line 239 (after `requireInternalOrUserAuth` on line 234). In JavaScript/TypeScript, `const` variables are in the temporal dead zone from the start of their enclosing block until their declaration. Any access before the declaration throws a `ReferenceError` at runtime, meaning every single request to this function will crash before performing auth or any analysis.
**Fix:**
Move the `log.info('request-start', ...)` call to after line 245 (after `resolvedTier` is declared and `isElite` is derived):
```typescript
// Line 234:
const userContext = await requireInternalOrUserAuth(req);

// Lines 239-245: resolvedTier declaration and isElite derivation...

// THEN log:
log.info('request-start', { resumeId, userId, tier: resolvedTier, resumeTextLen: resumeText.length, hasPrevious: previousSuggestions.length > 0 });
```

## Warnings

### WR-01: `resumeSignal` whitelisted in `FREE_ALLOWED_FIELDS` but stripped by per-call `ALLOWED_FIELDS`

**File:** `supabase/functions/_shared/result-merger.ts:64`
**Issue:** `FREE_ALLOWED_FIELDS` includes `resumeSignal` (line 64), and the Free prompt variant (`FREE_TIER_SUFFIX` in resume-prompts.ts:68) instructs the model to produce it. However, `ALLOWED_FIELDS['summary']` (lines 32-36) does NOT include `resumeSignal`. This means `stripUnknownFields()` removes `resumeSignal` from the summary call's parsed output during `parseAndValidateCall` -- before it ever reaches `applyTierShape`. The field is dead code in the pipeline: the model generates it, validation strips it, and `FREE_ALLOWED_FIELDS` preserves a ghost.
**Fix:**
Add `'resumeSignal'` to `ALLOWED_FIELDS['summary']`:
```typescript
'summary': new Set([
  'executiveSummary', 'strengths', 'priorityImprovements',
  'rewriteSuggestions', 'industryGuess', 'suggestedTargetRoles',
  'recommendedKeywords', 'eliteInsights', 'resumeSignal',
]),
```
Alternatively, if `resumeSignal` is not needed, remove it from `FREE_ALLOWED_FIELDS` and the `FREE_TIER_SUFFIX` prompt instruction.

### WR-02: `buildSharedPrefix` uses `isElite` boolean, not tier -- Free tier prompt lacks output restrictions

**File:** `supabase/functions/_shared/resume-prompts.ts:165-169`
**Issue:** `buildSharedPrefix` dispatches on `params.isElite`, meaning Free and Pro both receive the identical prompt (the non-elite variant). The `FREE_TIER_SUFFIX` (which instructs the model to omit locked fields) is only appended by `buildFreeResumePrompt` -- but the handler calls `buildSystemBlocks`, which calls `buildSharedPrefix`, which never dispatches to `buildFreeResumePrompt`. As a result, the Free tier prompt tells the model to generate ALL fields (rewriteSuggestions, industryGuess, etc.), which `applyTierShape` then discards. This is not a security vulnerability (server-side shaping is the defense-in-depth layer), but it wastes model output tokens on Free-tier requests, directly increasing cost against the $0.10 Free ceiling target (spec reference: PROJECT.md).
**Fix:**
Update `buildSharedPrefix` to dispatch on `params.tier`:
```typescript
export function buildSharedPrefix(params: PromptParams): string {
  if (params.tier === 'free') return buildFreeResumePrompt(params);
  if (params.tier === 'elite') return buildEliteResumePrompt(params);
  return buildProResumePrompt(params);
}
```
Or, migrate `buildSystemBlocks` to use `loadPromptVariant('resume', tier, params)` as the Phase 15 plan originally intended.

### WR-03: Fallback prompt omits `elite-extras` suffix for Elite tier

**File:** `supabase/functions/_shared/resume-prompts.ts:338-358`
**Issue:** `buildFallbackPrompt` concatenates suffixes for `criteria-1`, `criteria-2`, and `summary`, but does not include the `elite-extras` suffix. When all 4 parallel calls fail for an Elite user and the single-call fallback fires, the fallback prompt does not instruct the model to produce `eliteInsights`. The `COMBINED OUTPUT FORMAT` line at the end conditionally mentions `eliteInsights` (line 357: `${params.isElite ? ', eliteInsights' : ''}`), but the detailed schema/instructions for generating elite insights (from `buildEliteExtrasSuffix`) are absent. The model may produce a partial or missing `eliteInsights` object, which `fillDefaults` then nulls out (line 195), giving Elite users a degraded fallback experience.
**Fix:**
Add the `elite-extras` suffix as a 4th section when `params.isElite` is true:
```typescript
const eliteExtras = params.isElite
  ? `\n\nSECTION 4 -- Elite Insights:\n${buildCallSuffix('elite-extras', true, params.tier)}`
  : '';

return `${prefix}

You must produce a SINGLE JSON response...
${suffix1}
...
${suffixSummary}
${eliteExtras}

COMBINED OUTPUT FORMAT: ...`;
```

## Info

### IN-01: Redundant type assertion on `resolvedTier`

**File:** `supabase/functions/analyze-resume/index.ts:241`
**Issue:** The ternary expression `(userContext?.tier === 'pro' || userContext?.tier === 'elite') ? userContext.tier as 'free' | 'pro' | 'elite' : 'free'` includes `as 'free' | 'pro' | 'elite'` on the truthy branch. Since the condition already narrows `userContext.tier` to `'pro' | 'elite'`, and the falsy branch produces `'free'`, the assertion is redundant -- TypeScript can infer the union type without it.
**Fix:**
Remove the `as` assertion:
```typescript
const resolvedTier: 'free' | 'pro' | 'elite' =
  (userContext?.tier === 'pro' || userContext?.tier === 'elite')
    ? userContext.tier
    : 'free';
```

### IN-02: Unused `resumeHash` variable

**File:** `supabase/functions/analyze-resume/index.ts:272` and `supabase/functions/analyze-resume/index.ts:589`
**Issue:** `resumeHash` is computed in both the merit path (line 272) and the legacy path (line 589) but is never referenced after assignment. This is dead code from a previous differentiation strategy.
**Fix:**
Remove the `resumeHash` computation in both locations, or use it (e.g., as a cache key or deduplication identifier).

---

_Reviewed: 2026-04-16T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
