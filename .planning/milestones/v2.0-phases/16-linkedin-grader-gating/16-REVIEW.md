---
phase: 16-linkedin-grader-gating
reviewed: 2026-04-17T18:32:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - supabase/functions/grade-linkedin/prompts.ts
  - supabase/functions/grade-linkedin/prompts.test.ts
  - supabase/functions/grade-linkedin/index.ts
  - supabase/functions/grade-linkedin/validation.ts
  - supabase/functions/grade-linkedin/validation.test.ts
  - supabase/functions/grade-linkedin/free-scan.test.ts
  - supabase/functions/grade-linkedin/handler-config.test.ts
  - supabase/functions/grade-linkedin/strip.test.ts
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/_shared/resolve-tier.ts
  - supabase/functions/_shared/tier-config.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-04-17T18:32:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 16 adds tier-aware LinkedIn Grader gating with Free/Pro/Elite prompt variants, per-tier maxTokens and timeouts, free-scan entitlement for Pro/Elite subscribers, and defense-in-depth output stripping for Free tier. The core tier infrastructure is solid: `validation.ts` correctly gates `profileInsights` and `feedback` arrays behind `tier !== 'free'` checks, `prompts.ts` cleanly separates Free and Pro output schemas, and `tier-config.ts` enforces the Free-tier cost ceiling at the model level. Test coverage is thorough, including source-analysis tests that verify structural properties of the handler. No critical issues found. Three warnings and two informational items are noted below.

## Warnings

### WR-01: Free-scan entitlement denied for new Pro/Elite users without a user_merits row

**File:** `supabase/functions/grade-linkedin/index.ts:247-252`
**Issue:** The free-scan entitlement check queries `user_merits` with `.single()` (line 249). For a newly upgraded Pro/Elite user who does not yet have a `user_merits` row, `.single()` returns an error (PGRST116: not found), causing `merits` to be null. The fallback `merits?.free_linkedin_scan_used ?? true` then evaluates to `true`, meaning "already used." This silently denies the free scan to new Pro/Elite subscribers who have never interacted with the merit system. The code comment on line 244 acknowledges this as a "safer default," but it degrades the user experience for the exact users the feature targets.

**Fix:** Use `.maybeSingle()` instead of `.single()` to distinguish "row missing" from "query error," and treat a missing row as "free scan available":

```typescript
const { data: merits, error: meritsError } = await getServiceClient()
  .from('user_merits')
  .select('free_linkedin_scan_used')
  .eq('user_id', userId)
  .maybeSingle();

if (meritsError) {
  log.warn('merits-query-error', { userId, error: String(meritsError) });
  isFreeScanUsed = true; // Safer default on actual DB error
} else if (!merits) {
  isFreeScanUsed = false; // No row = never used = free scan available
} else {
  isFreeScanUsed = merits.free_linkedin_scan_used ?? false;
}
```

### WR-02: runTieredAiCall return type includes unreachable Response branch (dead code)

**File:** `supabase/functions/grade-linkedin/index.ts:129`
**Issue:** The return type of `runTieredAiCall` is a discriminated union: `{ parsed: Record<string, unknown>; response?: never } | { parsed?: never; response: Response }`. However, every error path in the function throws `MeritRefundable` rather than returning a `{ response: Response }` object. The `response` branch of the union is never taken. This makes the checks at line 299 (`if (result.response) return result.response`) and line 317 (same pattern) dead code. The dead branch obscures the actual control flow and could mislead future developers into thinking the function can return error responses directly.

**Fix:** Simplify the return type to just return the parsed object, and remove the dead-code checks:

```typescript
async function runTieredAiCall(
  tier: Tier,
  userId: string,
  truncatedContent: string,
  profileUrl: string,
  followUpContext: string | null,
  log: ReturnType<typeof createLogger>,
): Promise<Record<string, unknown>> {
  // ... existing logic (unchanged -- all error paths already throw MeritRefundable) ...
  return parsed as Record<string, unknown>;
}

// Callers simplify to:
const parsed = await runTieredAiCall(tier, userId, truncatedContent, meritProfileUrl, followUpContext, log);
return await storeAndNotify(parsed);
```

### WR-03: Legacy path validates without tier parameter -- all users get Pro validation rules

**File:** `supabase/functions/grade-linkedin/index.ts:463,473,507,511`
**Issue:** The legacy code path (active when `MERIT_SYSTEM_ENABLED` is false, lines 327-581) calls `validateLinkedInGrade(parsed)` without passing a `tier` argument. The function defaults to `tier: Tier = 'pro'`, enforcing Pro-level requirements (profileInsights, feedback arrays). This is currently consistent because the legacy path also uses the Pro prompt (`buildSystemPrompt()`) for all users regardless of tier. However, if the merit flag is temporarily disabled during an incident rollback, Free-tier users will receive Pro-quality output (no cost gating, no output stripping). The tier-aware model selection (`getModel`), prompt selection (`loadPromptVariant`), and output stripping (`stripLinkedInFreeTier`) are all bypassed on this path.

**Fix:** If this is accepted behavior during the migration period, add an explicit comment documenting the risk. Otherwise, add minimal tier awareness to the legacy path:

```typescript
// Legacy path: resolve tier for validation consistency
const legacyTier = (userContext!.tier as Tier) ?? 'free';
const systemPrompt = legacyTier === 'free' ? buildFreeSystemPrompt() : buildSystemPrompt();
// ... later ...
let validation = parsed ? validateLinkedInGrade(parsed, legacyTier) : { valid: false as const, error: 'JSON parse failed' };
```

## Info

### IN-01: Deprecated buildSystemPrompt alias still imported and used in legacy path

**File:** `supabase/functions/grade-linkedin/index.ts:17,417`
**Issue:** The import at line 17 brings in `buildSystemPrompt` which is a deprecated alias (`@deprecated` JSDoc tag in prompts.ts line 275) for `buildProSystemPrompt`. It is only used at line 417 in the legacy path. Once `MERIT_SYSTEM_ENABLED` is permanently set to true and the legacy path is removed, this import and usage become dead code.

**Fix:** No immediate action needed. When the legacy path is removed, also remove the `buildSystemPrompt` import. Optionally rename the import to `buildProSystemPrompt` now for clarity:

```typescript
import { buildProSystemPrompt as buildSystemPrompt, buildUserMessage } from './prompts.ts';
```

### IN-02: Tier type defined in two separate modules

**File:** `supabase/functions/_shared/tier-config.ts:16` and `supabase/functions/_shared/tier-prompts.ts:32`
**Issue:** Both `tier-config.ts` and `tier-prompts.ts` independently define `type Tier = 'free' | 'pro' | 'elite'`. While the types are identical string literal unions and structurally compatible, having two definitions increases the risk of them diverging in the future (e.g., adding a new tier to one but not the other).

**Fix:** Have `tier-prompts.ts` re-export from `tier-config.ts`:

```typescript
// In tier-prompts.ts:
export type { Tier } from './tier-config.ts';
```

---

_Reviewed: 2026-04-17T18:32:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
