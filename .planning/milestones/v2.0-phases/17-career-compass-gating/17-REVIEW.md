---
phase: 17-career-compass-gating
reviewed: 2026-04-17T18:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - scripts/run-edge-tests.ps1
  - src/pages/CareerCompass.tsx
  - supabase/functions/_shared/career-prompts.ts
  - supabase/functions/_shared/career-shape.test.ts
  - supabase/functions/_shared/result-merger.ts
  - supabase/functions/_shared/tier-validation.test.ts
  - supabase/functions/analyze-career/index.test.ts
  - supabase/functions/analyze-career/index.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-04-17T18:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 17 adds tier-gating to Career Compass: per-tier prompt builders in `career-prompts.ts`, a server-side whitelist shaper (`applyCareerTierShape` in `result-merger.ts`), comprehensive unit tests for shape correctness, boot-time budget invariant tests, and frontend rendering with `LockedSection`/`LockedListItem` for free-tier users. The defense-in-depth architecture (prompt-level restriction + server-side whitelist strip) is solid.

Three warnings found: missing JSON repair in the multi-role comparison path (could cause 500 errors on truncated AI responses), legacy path token budget inconsistency between tiers, and a test fixture confidence value mismatch. Three info-level items noted for code quality.

## Warnings

### WR-01: Missing repairTruncatedJSON in handleMultiRoleComparison

**File:** `supabase/functions/analyze-career/index.ts:440`
**Issue:** `handleMultiRoleComparison` uses raw `JSON.parse(content)` without first running `repairTruncatedJSON`. Every other `JSON.parse` site in the same file (lines 649, 659, 1096) repairs the JSON first. AI model responses are frequently truncated, especially with the tight 1800 maxTokens budget for multi-role comparison (line 415). A truncated response would cause an unhandled exception that propagates to the generic catch block on line 453, returning a vague "Failed to compare roles" error.
**Fix:**
```typescript
// Line 440: replace raw JSON.parse with repaired parse
const repaired = repairTruncatedJSON(content);
const parsed = JSON.parse(repaired);
```

### WR-02: Legacy path uses non-tier-differentiated token budget

**File:** `supabase/functions/analyze-career/index.ts:1024`
**Issue:** The legacy path (non-merit branch, line 1011-1110) uses `maxTokens: isElite ? 3500 : 2500` for the AI call, which gives Free and Pro the same 2500-token budget. The new merit path uses the tier-differentiated `TIER_MAX_TOKENS` (Free=6000, Pro=16000, Elite=16000). This means Pro users on the legacy path get substantially less AI output than Pro users on the merit path, creating an inconsistent experience depending on which code path is active (`MERIT_SYSTEM_ENABLED` flag).
**Fix:** Align the legacy path with tier-specific budgets to ensure consistent behavior regardless of the merit system flag:
```typescript
// Line 1024: replace fixed maxTokens with per-tier budget
maxTokens: TIER_MAX_TOKENS[resolvedTier],
```

### WR-03: Test fixture uses fractional confidence (0.85) instead of percentage (85)

**File:** `supabase/functions/_shared/tier-validation.test.ts:224`
**Issue:** The `careerParams` fixture sets `domainConfidence: 0.85`, but `classifyDomains()` in `index.ts:282` produces confidence as an integer percentage (0-100 range, via `Math.round((data.score / totalScore) * 100)`). The `career-prompts.ts:84` prompt template renders this as `${domainConfidence}%`, so the test would produce "0.85%" in the prompt instead of "85%". While this does not cause a runtime crash (it is just prompt text), it means the live validation test sends a misleading confidence value to the AI model, potentially affecting the quality of the test assertion.
**Fix:**
```typescript
// Line 224: use integer percentage to match production classifyDomains output
domainConfidence: 85,
```
And update secondaryDomains similarly:
```typescript
secondaryDomains: [{ domain: 'Data Science', confidence: 45 }],
```

## Info

### IN-01: Dead code -- error instanceof Response check

**File:** `supabase/functions/analyze-career/index.ts:1202`
**Issue:** `if (error instanceof Response) throw error;` is dead code. No code path in this handler throws a `Response` object. `MeritRefundable` extends `Error`, and all other error paths throw standard `Error` instances or return `Response` objects directly. If this line ever triggered, it would re-throw the Response, which Deno's `serve()` would convert into a generic 500 rather than returning it properly.
**Fix:** Remove the dead check, or if the intent is to support Response-as-error, return it instead of throwing:
```typescript
if (error instanceof Response) return error;
```

### IN-02: Multi-role comparison tier shaping applied to individual role entries

**File:** `supabase/functions/analyze-career/index.ts:442-445`
**Issue:** `applyCareerTierShape` is applied to each individual `multiRoleReadiness` entry, which are role-readiness breakdown objects (with `overallScore`, `strengths`, `gaps`, `skillAssessments`, etc.). The career tier shaper's whitelist is designed for the top-level career analysis output (which has `careerDNA`, `careerFields`, etc.). When applied to a role entry that only has readiness fields, the shaper would delete all keys not in the career whitelist -- meaning `overallScore`, `targetRole`, `industryBenchmark`, `strengths`, `gaps`, `skillAssessments`, and `readinessVerdict` would all be deleted because none of these are top-level career whitelist keys. This appears to silently strip all useful data from multi-role entries for all tiers. The current behavior may work only because these keys happen to NOT be in any whitelist, causing the shaper to delete everything, but the frontend guards rendering with `(subscriptionTier === 'pro' || subscriptionTier === 'elite')` checks (line 1379). However, the data is still sent in the response -- the shaper is ineffective on these sub-objects.

**Upon further inspection:** The whitelist includes `roleReadinessBreakdown` as a top-level key but individual role entries in `multiRoleReadiness` have the same schema as `roleReadinessBreakdown` entries. Since none of the role entry keys (`overallScore`, `targetRole`, etc.) are in the career whitelist as top-level keys, the shaper strips them all. This means the multi-role response on the merit path returns empty objects. On the legacy path (non-merit), the same shaping applies. This should be verified in manual testing.

**Fix:** Either skip `applyCareerTierShape` for multi-role entries (since the frontend already gates display by tier), or create a dedicated shaper for role-readiness objects.

### IN-03: Unused imports in CareerCompass.tsx

**File:** `src/pages/CareerCompass.tsx:10-11,33,43`
**Issue:** Several imported symbols appear unused in the rendered JSX: `TrendingUp` (line 43) is imported but never referenced in the component. Note that the project ESLint config has `@typescript-eslint/no-unused-vars` turned off, so this is not a lint violation, but it increases bundle size marginally.
**Fix:** Remove the unused import:
```typescript
// Remove TrendingUp from the import list on line 43
```

---

_Reviewed: 2026-04-17T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
