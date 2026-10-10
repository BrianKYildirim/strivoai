# Phase 16: linkedin-grader-gating - Research

**Researched:** 2026-04-17
**Domain:** Supabase Edge Functions (Deno) -- tier-gated AI output, free-scan entitlement, shared tier resolution
**Confidence:** HIGH

## Summary

Phase 16 makes `grade-linkedin` tier-aware by wiring it into the Phase 14 prompt loader, Phase 13 Merit gateway, and extracting a shared `resolve-tier.ts` helper. The codebase is well-prepared: the Merit branch (`MERIT_SYSTEM_ENABLED`) already exists in `grade-linkedin/index.ts` (lines 100-229) with `withMerits` wrapping, the `tier-prompts.ts` loader and `tier-config.ts` model/timeout config are deployed and tested, and the `user_merits.free_linkedin_scan_used` column is present in the database schema (Phase 10 migration).

The primary complexity is the **free-scan entitlement flow** -- Pro/Elite users get one free scan per billing cycle, which must be checked BEFORE `withMerits` to avoid incorrect Merit deduction. This creates a conditional branching pattern: resolve tier -> check free-scan flag -> if free scan, skip `withMerits`; if paid scan, wrap in `withMerits`. Both paths produce tier-appropriate output via `loadPromptVariant` and `stripLinkedInFreeTier`.

A critical finding: the `subscriptions` table referenced in CONTEXT.md D-08 does **not exist** in the database. The tier source of truth is `profiles.subscription_tier`, which `requireAuth` already reads and returns in `userContext.tier`. The new `resolve-tier.ts` helper should read from `profiles.subscription_tier` (matching the existing `auth.ts` pattern), not from a non-existent `subscriptions` table. This aligns with Phase 15 research findings.

**Primary recommendation:** Structure the plan around 3 deliverables: (1) shared `resolve-tier.ts` extraction, (2) prompt variants + strip function + maxTokens + model config, (3) free-scan entitlement + Merit integration + handler restructuring.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Free Output Shape Enforcement (Defense in Depth)**
- **D-01:** Free output shape enforced at BOTH layers: prompt variant instructs model to omit locked fields, AND `stripLinkedInFreeTier(parsed)` server-side strips Pro-only keys. A leaky prompt regression cannot reach a Free user.
- **D-02:** `stripLinkedInFreeTier()` lives inline in `grade-linkedin/index.ts`. LinkedIn has no merger pipeline.
- **D-03:** Strip function whitelist: keeps `rawScore`, `scoreJustification`, `keyStrengths` (full), `nextBestAction`, `topFixes[0]` only, `sectionBreakdown` scores only (strips `feedback` arrays). Removes `profileInsights` entirely, `topFixes[1+]`, all `feedback` arrays.

**Model Routing**
- **D-04:** LinkedIn Grader uses Haiku 4.5 for all tiers. Add `linkedin` to `FEATURE_MODEL_OVERRIDES` in `tier-config.ts`.

**Free-Scan Mechanism**
- **D-05:** Merit path: check `free_linkedin_scan_used` from `user_merits`. If false and tier is pro/elite, skip Merit deduction and flip flag to true.
- **D-06:** Legacy path: preserved unchanged. `entitlement.ts` row-counting logic byte-identical.
- **D-07:** Free-scan flip uses direct `.update()` on `user_merits` via service-role client. No new RPC needed.

**Tier Resolution**
- **D-08:** Extract `resolveTier()` into `_shared/resolve-tier.ts`. Queries `profiles.subscription_tier` (the actual source of truth), defaults to `'free'` on missing row.
- **D-09:** Phase 15's `analyze-resume/index.ts` should also import from `resolve-tier.ts` (cleanup task).

**Prompt Variant Design**
- **D-10:** Register 3 variants: `FREE_PROMPT`, `PRO_PROMPT`, `ELITE_PROMPT = PRO_PROMPT`. Loader gets 3 entries.
- **D-11:** Prompt variants live in `grade-linkedin/prompts.ts`. Export `buildFreeSystemPrompt()`, `buildProSystemPrompt()` (renamed from current `buildSystemPrompt()`), register with `registerFeaturePrompts('linkedin', ...)`.
- **D-12:** Free prompt explicitly instructs model to return limited output structure.

**Merit Integration**
- **D-13:** Single `withMerits(ctx, 'linkedin_grading', ...)` wraps AI call. Costs: free=3, pro=2, elite=3.
- **D-14:** Free-scan check runs BEFORE `withMerits` -- if scan is free, skip `withMerits` entirely.

**Per-Tier maxTokens**
- **D-15:** Free=4000, Pro=8192, Elite=8192. Feature-level constants in `grade-linkedin/index.ts`.

### Claude's Discretion

- Exact fields in `stripLinkedInFreeTier` whitelist (cross-reference LIG-01/LIG-02 against parsed JSON shape).
- Whether `buildUserMessage` needs tier-aware modifications (follow-up context for Free tier).
- Whether free-scan flag flip uses `.update()` or `.rpc()`.
- Whether Phase 15 `analyze-resume/index.ts` refactor is a separate plan or folded in.
- Exact `resolveTier()` return type -- plain `Tier` string or richer object.
- Whether `grade-linkedin/prompts.ts` self-registers at import time or handler calls explicit registration function.

### Deferred Ideas (OUT OF SCOPE)

- Tier gating for Career Compass / Recruiting Lens / Interview Prep (Phases 17-19).
- Frontend LinkedInGrader.tsx changes for locked sections (Phase 20).
- Running TEST-09/TEST-10 in CI.
- Refactoring legacy path to use prompt-loading infrastructure.
- Token-count empirical measurement of Free vs Pro/Elite output.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIG-01 | Free output: rawScore, scoreJustification, full keyStrengths, nextBestAction, first topFixes entry only (~2,000 tokens) | Free prompt variant (D-12) + `stripLinkedInFreeTier` (D-01/D-03) enforce this shape; validation.ts validates full shape first, strip runs after |
| LIG-02 | Free output omits profileInsights and full sectionBreakdown feedback beyond scores | `stripLinkedInFreeTier` deletes `profileInsights` and strips `feedback` arrays from `sectionBreakdown` entries; Free prompt also instructs omission |
| LIG-03 | Pro output: all fields including profileInsights, full sectionBreakdown, all topFixes (~6,000 tokens) | Pro prompt = current `buildSystemPrompt()` (renamed to `buildProSystemPrompt`); no stripping applied; maxTokens=8192 |
| LIG-04 | Elite output: same as Pro (~6,000 tokens) | Elite prompt = Pro prompt (same builder reference); no stripping; maxTokens=8192 |
| LIG-05 | Pro/Elite get 1 free LinkedIn scan per billing cycle; subsequent scans cost 2/3 Merits | `free_linkedin_scan_used` flag in `user_merits` checked before `withMerits`; flag flip via direct update |
| LIG-06 | grade-linkedin checks `free_linkedin_scan_used`; skips deduction if false, sets true; reset on monthly cycle | Direct `.update()` on `user_merits`; `reset_subscription_merits` RPC already resets flag (Phase 11) |
| LIG-07 | maxTokens: Free=4000, Pro=Elite=8192 | Feature-level constant map in `grade-linkedin/index.ts`; selected by resolved tier |
| BACK-09 | Modified grade-linkedin: Merit check, free-scan check, prompt variant, per-tier maxTokens | Handler restructured: resolve tier -> free-scan check -> withMerits (conditional) -> loadPromptVariant -> AI call -> validate -> strip (if free) -> store -> return |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tier resolution | API / Backend (Edge Function) | Database | `profiles.subscription_tier` read via service-role client; `requireAuth` already returns tier in `UserContext` |
| Prompt variant selection | API / Backend (Edge Function) | -- | `loadPromptVariant('linkedin', tier, params)` selects server-side before AI call |
| Free output enforcement (strip) | API / Backend (Edge Function) | -- | `stripLinkedInFreeTier()` runs server-side after AI response; defense-in-depth with prompt |
| Free-scan entitlement | API / Backend (Edge Function) | Database | `user_merits.free_linkedin_scan_used` flag read/written via service-role client |
| Merit deduction | API / Backend (Edge Function) | Database | `withMerits` calls `check_and_deduct_merits` RPC; refund on AI failure |
| Model routing | API / Backend (Edge Function) | -- | `getModel(tier, 'linkedin')` returns Haiku 4.5 for all tiers via `tier-config.ts` |
| Monthly flag reset | Database | -- | `reset_subscription_merits` RPC (Phase 11) resets `free_linkedin_scan_used = false` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno | 2.7.1 | Edge function runtime | Supabase Edge Functions require Deno [VERIFIED: local `deno --version`] |
| @supabase/supabase-js | 2.x (npm:) | Database client for tier/flag operations | Already used via `getServiceClient()` throughout `_shared/` [VERIFIED: supabase-client.ts] |
| Anthropic Claude API | HTTP | AI model calls via `invokeAnthropicText` | Existing `_shared/anthropic.ts` wrapper [VERIFIED: grade-linkedin/index.ts imports] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/tier-config.ts` | N/A (internal) | Model routing, timeouts | `getModel(tier, 'linkedin')` for Haiku 4.5 override; `getTimeout(tier)` for per-tier timeout [VERIFIED: tier-config.ts exists] |
| `_shared/tier-prompts.ts` | N/A (internal) | Prompt variant loading | `registerFeaturePrompts('linkedin', ...)` + `loadPromptVariant('linkedin', tier, params)` [VERIFIED: tier-prompts.ts exists] |
| `_shared/merit-gateway.ts` | N/A (internal) | Merit deduction + refund | `withMerits(ctx, 'linkedin_grading', callback)` already imported in index.ts [VERIFIED: merit-gateway.ts exists] |
| `_shared/json-repair.ts` | N/A (internal) | Truncated JSON recovery | Already used in `parseAiResponse` [VERIFIED: grade-linkedin/index.ts line 71] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `stripLinkedInFreeTier` in index.ts | Shared strip utility in `_shared/` | LinkedIn has no merger pipeline; inline is simpler and colocated with the feature. Shared extraction deferred until pattern repeats across 3+ features |
| Direct `profiles.subscription_tier` read in handler | Reuse `userContext.tier` from `requireAuth` | `userContext.tier` is already available. `resolve-tier.ts` can just wrap/re-export the `requireAuth` pattern for consistency. See Critical Finding below |
| New RPC for free-scan flip | Direct `.update()` on `user_merits` | `.update()` is simpler; the row-level lock is sufficient for this single-field atomic flip. No concurrency issue since each user scans sequentially |

## Architecture Patterns

### System Architecture Diagram

```
User Request (Bearer JWT)
       |
       v
  requireAuth() -----> profiles.subscription_tier --> UserContext { userId, tier }
       |
       v
  Rate Limit Check (grade-linkedin: 5/15/30 per tier)
       |
       v
  MERIT_SYSTEM_ENABLED?
       |
   YES |                              NO (legacy path)
       v                                    |
  resolveTier(userId) --> Tier              v
       |                              isFreeScan(cycleGradeCount)
       v                                    |
  free_linkedin_scan_used?           checkAndRecordUsage()
       |                                    |
   [false && pro/elite]  [true or free]     v
       |                      |        buildSystemPrompt() (single variant)
       v                      v             |
  Skip withMerits      withMerits()         v
  Flip flag to true    (deduct 3/2/3)  invokeWithRetry(maxTokens=8192)
       |                      |             |
       v                      v             v
  loadPromptVariant('linkedin', tier, params)
       |
       v
  invokeWithRetry(model=haiku, maxTokens=4000|8192)
       |
       v
  parseAiResponse() --> validateLinkedInGrade()
       |
       v
  tier === 'free' ?
       |
   YES |           NO
       v            |
  stripLinkedInFreeTier()
       |            |
       v            v
  Store in linkedin_grades
       |
       v
  Return JSON response
```

### Recommended Project Structure

```
supabase/functions/
  _shared/
    resolve-tier.ts       # NEW: shared tier resolution helper
    tier-config.ts        # MODIFY: add linkedin to FEATURE_MODEL_OVERRIDES
    tier-prompts.ts       # CONSUMED: registerFeaturePrompts + loadPromptVariant
    merit-gateway.ts      # CONSUMED: withMerits, MERIT_SYSTEM_ENABLED, MeritRefundable
  grade-linkedin/
    index.ts              # MODIFY: restructure Merit branch with tier gating
    prompts.ts            # MODIFY: add Free/Pro/Elite prompt builders + registration
    validation.ts         # UNCHANGED: validates full shape for all tiers
    entitlement.ts        # UNCHANGED: legacy free-scan helper preserved
  analyze-resume/
    index.ts              # MODIFY: import resolveTier from _shared/resolve-tier.ts (cleanup)
```

### Pattern 1: Defense-in-Depth Output Shaping

**What:** Free tier output is constrained at TWO independent layers: (1) the prompt variant instructs the model to generate limited output, and (2) a server-side strip function removes any Pro-only fields from the parsed JSON.

**When to use:** Always for Free tier gating. The prompt layer saves tokens (cost optimization), and the strip layer ensures deterministic shape even if the model ignores prompt instructions.

**Example:**
```typescript
// Source: CONTEXT.md D-01, D-03
function stripLinkedInFreeTier(parsed: Record<string, unknown>): Record<string, unknown> {
  // Remove profileInsights entirely
  delete parsed.profileInsights;

  // Keep only first topFixes entry
  if (Array.isArray(parsed.topFixes) && parsed.topFixes.length > 1) {
    parsed.topFixes = [parsed.topFixes[0]];
  }

  // Strip feedback arrays from sectionBreakdown (keep scores only)
  if (Array.isArray(parsed.sectionBreakdown)) {
    for (const section of parsed.sectionBreakdown) {
      const s = section as Record<string, unknown>;
      delete s.feedback;
    }
  }

  return parsed;
}
```

### Pattern 2: Free-Scan Entitlement Check (Before Merit Deduction)

**What:** Pro/Elite users get one free scan per billing cycle. The check must run BEFORE `withMerits` to avoid incorrect deduction.

**When to use:** Only for LinkedIn Grader (this is the only feature with a free-scan entitlement).

**Example:**
```typescript
// Source: CONTEXT.md D-05, D-14
// Resolve tier
const tier = resolveTier(userContext.tier);

// Check free-scan entitlement (Pro/Elite only)
let isFreeScanUsed = true;
if (tier !== 'free') {
  const { data: merits } = await getServiceClient()
    .from('user_merits')
    .select('free_linkedin_scan_used')
    .eq('user_id', userId)
    .single();
  isFreeScanUsed = merits?.free_linkedin_scan_used ?? true; // default to used (safer)
}

const freeScanThisRequest = tier !== 'free' && !isFreeScanUsed;

if (freeScanThisRequest) {
  // Skip withMerits -- run AI directly, then flip flag
  const result = await runAiAndValidate(tier, userId, ...);
  // Flip flag after successful AI call
  await getServiceClient()
    .from('user_merits')
    .update({ free_linkedin_scan_used: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return result;
} else {
  // Paid path: wrap in withMerits
  const gated = await withMerits(ctx, 'linkedin_grading', async (_txId) => {
    return await runAiAndValidate(tier, userId, ...);
  });
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

### Pattern 3: Prompt Variant Registration

**What:** Each feature registers its per-tier prompt builders with the shared loader at import time (or handler boot).

**When to use:** Every tier-gated feature.

**Example:**
```typescript
// Source: tier-prompts.ts API [VERIFIED], CONTEXT.md D-10/D-11
import { registerFeaturePrompts, loadPromptVariant } from '../_shared/tier-prompts.ts';

// Register at module level (runs once per cold start)
registerFeaturePrompts('linkedin', {
  free: (_params: LinkedInPromptParams) => buildFreeSystemPrompt(),
  pro: (_params: LinkedInPromptParams) => buildProSystemPrompt(),
  elite: (_params: LinkedInPromptParams) => buildProSystemPrompt(), // identical to Pro
});

// Usage in handler:
const systemPrompt = loadPromptVariant('linkedin', tier, {});
```

### Anti-Patterns to Avoid

- **Reading tier from request body:** NEVER trust client-supplied tier. Always read from `userContext.tier` (set by `requireAuth` from `profiles.subscription_tier`) or `resolveTier()`. The existing `rawBody.tier` pattern in `analyze-resume` is a Phase 15 legacy that CONTEXT.md D-09 cleans up.
- **Applying strip before validation:** `stripLinkedInFreeTier` must run AFTER `validateLinkedInGrade`. Validation ensures the full shape is correct (all 4 sections, score integrity); stripping a field before validation would cause false "missing field" failures.
- **Deducting merits for free scans:** The free-scan check MUST run before `withMerits`. If `withMerits` runs first, it will deduct Merits that should have been free, and there is no mechanism to "un-deduct" without a refund (which is reserved for AI failures).
- **Modifying validation.ts for tier awareness:** Validation validates the FULL output shape for ALL tiers. The model should always produce a valid full response; the tier strip happens post-validation. Adding tier-conditional validation creates coupling that makes debugging harder.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt variant selection | Inline if/else chains for tier prompts | `registerFeaturePrompts` + `loadPromptVariant` from `_shared/tier-prompts.ts` | Auto-prepends GLOBAL_AI_PRINCIPLES for Pro/Elite; single audit point; type-checked |
| Model selection per tier | Hardcoded model strings in handler | `getModel(tier, 'linkedin')` from `_shared/tier-config.ts` | Feature override map handles LinkedIn's all-Haiku routing; Free tier locked to Haiku by construction |
| Timeout selection per tier | Hardcoded timeout values | `getTimeout(tier)` from `_shared/tier-config.ts` | Centralized spec values; fail-loud if undefined pair |
| Merit deduction + refund | Manual RPC calls to `check_and_deduct_merits` / `refund_merits` | `withMerits(ctx, feature, callback)` from `_shared/merit-gateway.ts` | Rate limit before deduction, auto-refund on AI failure, structured logging |
| JSON repair on truncated responses | Custom JSON fixup | `repairTruncatedJSON` from `_shared/json-repair.ts` | Already tested and used in `parseAiResponse` |

**Key insight:** Phase 14 shipped all the shared infrastructure. Phase 16's job is to CONSUME it, not rebuild it. The only new shared module is `resolve-tier.ts`.

## Common Pitfalls

### Pitfall 1: Subscriptions Table Does Not Exist

**What goes wrong:** CONTEXT.md D-08 references "the `subscriptions` table" for tier resolution, but this table does NOT exist in the database.
**Why it happens:** The context was written referencing an aspirational schema from the spec. The actual tier source of truth is `profiles.subscription_tier`, which `requireAuth` already reads.
**How to avoid:** `resolve-tier.ts` should query `profiles.subscription_tier` via service-role client, matching the existing `auth.ts` pattern. This is functionally identical to what `userContext.tier` provides.
**Warning signs:** Supabase `.from('subscriptions')` calls returning null or errors.

### Pitfall 2: Validation Failing After Strip

**What goes wrong:** If `stripLinkedInFreeTier` runs before `validateLinkedInGrade`, the validator will fail because it requires `profileInsights` (2-4 items), all 4 sections with 3+ feedback items, etc.
**Why it happens:** The validator checks the FULL output shape per `REQUIRED_TOP_LEVEL` (line 18: includes `profileInsights`) and section feedback count (line 109: `feedback.length < 3`).
**How to avoid:** Always call `validateLinkedInGrade(parsed)` first, THEN `stripLinkedInFreeTier(parsed)` only if `tier === 'free'`. [VERIFIED: validation.ts lines 18-27, 109-115]
**Warning signs:** 500 errors on Free-tier LinkedIn scans with "Missing required field: profileInsights" in logs.

### Pitfall 3: Free-Scan Flag Race Condition

**What goes wrong:** Two concurrent requests from the same Pro user could both read `free_linkedin_scan_used = false` and both skip Merit deduction.
**Why it happens:** The read and update of `free_linkedin_scan_used` are not atomic.
**How to avoid:** Accept this as a known TOCTOU race (worst case: 1 extra free scan per cycle). This mirrors the existing `entitlement.ts` approach (line 16-21 comment: "Worst-case TOCTOU = 1 extra free scan/cycle, explicitly accepted per threat T-05-01"). The flag flip should happen as early as possible after deciding to grant a free scan. [VERIFIED: entitlement.ts lines 9-14]
**Warning signs:** Structured log showing two free-scan-bypass entries for the same user in the same billing cycle. Acceptable risk per spec.

### Pitfall 4: Forgetting to Thread Tier Into All Code Paths

**What goes wrong:** The Merit path gets tier-gated but the non-Merit code paths (free-scan bypass, retry on validation failure) use hardcoded `maxTokens: 8192` or `buildSystemPrompt()`.
**Why it happens:** The handler has multiple AI call sites (first attempt, retry after validation failure) that all need tier-aware parameters.
**How to avoid:** Extract the AI call + validation + retry logic into a single helper function that accepts `tier` as parameter. Call this helper from both the free-scan path and the `withMerits` callback.
**Warning signs:** Free users receiving 8192 maxTokens instead of 4000; Free users seeing `profileInsights` in responses (model was given the Pro prompt).

### Pitfall 5: Not Handling the `userContext.tier` vs `resolveTier()` Duality

**What goes wrong:** Both `requireAuth` (returning `userContext.tier` from `profiles.subscription_tier`) and the new `resolveTier()` read from the same table. Using both introduces two round-trips.
**Why it happens:** The CONTEXT.md envisions `resolveTier()` as a separate helper, but `requireAuth` already performs this lookup.
**How to avoid:** For `grade-linkedin`, `userContext.tier` is already available from `requireAuth`. The `resolveTier()` helper is primarily for code that doesn't go through `requireAuth` (e.g., internal workers). For the user-facing handler, cast `userContext.tier as Tier` directly. The helper is still valuable for the shared extraction (DRY principle) and for Phases 17-18 that may have different auth paths.
**Warning signs:** Duplicate `profiles` queries in the same request (one from `requireAuth`, one from `resolveTier`).

## Code Examples

### Full stripLinkedInFreeTier Implementation

```typescript
// Source: CONTEXT.md D-03 + LIG-01/LIG-02 cross-reference with validation.ts shape
// [VERIFIED: validation.ts REQUIRED_TOP_LEVEL fields]

import type { Tier } from '../_shared/tier-config.ts';

/**
 * Strips Pro/Elite-only fields from a LinkedIn grade for Free-tier output.
 * Runs AFTER validateLinkedInGrade() — the full shape has already been validated.
 *
 * Per LIG-01/LIG-02:
 * Keeps: rawScore, scoreJustification, keyStrengths (full), nextBestAction,
 *        topFixes[0] only, sectionBreakdown with scores only (no feedback arrays).
 * Removes: profileInsights, topFixes[1+], all feedback arrays in sectionBreakdown.
 */
function stripLinkedInFreeTier(parsed: Record<string, unknown>): Record<string, unknown> {
  // LIG-02: remove profileInsights entirely
  delete parsed.profileInsights;

  // LIG-01: keep only first topFixes entry
  if (Array.isArray(parsed.topFixes)) {
    parsed.topFixes = parsed.topFixes.length > 0 ? [parsed.topFixes[0]] : [];
  }

  // LIG-02: strip feedback arrays from sectionBreakdown (keep name, score, maxScore, status)
  if (Array.isArray(parsed.sectionBreakdown)) {
    for (const section of parsed.sectionBreakdown) {
      if (section && typeof section === 'object') {
        delete (section as Record<string, unknown>).feedback;
      }
    }
  }

  return parsed;
}
```

### resolve-tier.ts Shared Helper

```typescript
// Source: CONTEXT.md D-08 + auth.ts pattern [VERIFIED: auth.ts lines 87-102]

import { getServiceClient } from './supabase-client.ts';
import { createLogger } from './logger.ts';
import type { Tier } from './tier-config.ts';

const log = createLogger('_shared/resolve-tier');

/**
 * Resolves the user's subscription tier from profiles.subscription_tier.
 * Returns 'free' if the profile is missing or the column is null (fail-closed on cost).
 *
 * NOTE: If the caller already has a UserContext from requireAuth(), use
 * userContext.tier directly instead of calling this -- it reads the same column.
 * This helper exists for code paths that don't go through requireAuth (e.g.,
 * internal workers) and as a canonical extraction point for Phases 17-18.
 */
export async function resolveTier(
  userId: string,
  callerLog?: ReturnType<typeof createLogger>,
): Promise<Tier> {
  const l = callerLog ?? log;
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    l.warn('subscription-missing', { userId, error: error?.message });
    return 'free';
  }

  const tier = (data.subscription_tier ?? 'free') as Tier;
  return tier;
}
```

### Per-Tier maxTokens Constants

```typescript
// Source: CONTEXT.md D-15 + LIG-07
// Feature-level constants, NOT using TIER_MAX_TOKENS from tier-config.ts
// (those are global caps; LinkedIn has its own specific budgets)

const LINKEDIN_MAX_TOKENS: Record<Tier, number> = {
  free: 4000,
  pro: 8192,
  elite: 8192,
};
```

### FEATURE_MODEL_OVERRIDES Addition

```typescript
// Source: CONTEXT.md D-04 + tier-config.ts [VERIFIED: tier-config.ts lines 76-78]
// In _shared/tier-config.ts:

export const FEATURE_MODEL_OVERRIDES: Partial<Record<FeatureKey, Partial<Record<Tier, string>>>> = {
  career: { pro: FREE_MODEL, elite: FREE_MODEL },
  linkedin: { pro: FREE_MODEL, elite: FREE_MODEL },  // D-04: Haiku for all tiers
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `buildSystemPrompt()` for all users | Per-tier prompt variants via `registerFeaturePrompts` + `loadPromptVariant` | Phase 14 (deployed) | Free users get cost-optimized prompt; Pro/Elite get GLOBAL_AI_PRINCIPLES prepend |
| Hardcoded `maxTokens: 8192` for all users | Per-tier `maxTokens` from feature-level constants | Phase 16 (this phase) | Free users get 4000 tokens (cost ceiling); Pro/Elite get full 8192 |
| Row-counting free-scan check via `isFreeScan(cycleGradeCount)` | `free_linkedin_scan_used` boolean flag in `user_merits` | Phase 16 (this phase, Merit path only) | Direct flag check is simpler, resets cleanly with `reset_subscription_merits` |
| `checkAndRecordUsage` for credit control | `withMerits` for Merit-based deduction | Phase 13 (deployed) | Atomic deduction + auto-refund on AI failure |

**Deprecated/outdated:**
- `entitlement.ts` `isFreeScan()`: Preserved for legacy path only. When `MERIT_SYSTEM_ENABLED=true`, the `free_linkedin_scan_used` flag replaces it. Will be removed when legacy path is cleaned up (Phase 21+).
- `checkAndRecordUsage` in `usage-checker.ts`: Legacy credit system. Used only when `MERIT_SYSTEM_ENABLED=false`. Merit system supersedes it.

## Critical Finding: No `subscriptions` Table

**Severity:** HIGH -- affects D-08 implementation.

CONTEXT.md D-08 references "the `subscriptions` table" but this table does NOT exist in the database. [VERIFIED: `grep -r "CREATE TABLE.*subscriptions" supabase/migrations/` returns no results]. The tier source of truth is `profiles.subscription_tier` [VERIFIED: `auth.ts` lines 87-102, migration `20251126115826` creates the index on this column].

**Resolution:** `resolve-tier.ts` queries `profiles.subscription_tier` instead of a non-existent `subscriptions` table. This matches `requireAuth`'s existing pattern exactly. For the `grade-linkedin` handler specifically, `userContext.tier` (returned by `requireAuth`) is already available and reads from the same column -- the handler can use it directly without calling `resolveTier()` separately. The helper is still created for DRY extraction and for Phases 17-18.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `buildUserMessage` does not need tier-aware modifications (follow-up context included for all tiers) | Architecture Patterns | LOW -- if Free tier should omit follow-up context for cost savings, add a tier parameter; but this is a marginal optimization since follow-up context is small (~2000 chars in user message, not in system prompt tokens) |
| A2 | Prompt variant registration at module top-level (import side effect) is acceptable for Deno Edge Functions | Architecture Patterns | LOW -- Deno modules are cached after first import; registration is idempotent per `registerFeaturePrompts` contract [VERIFIED: tier-prompts.ts line 63-68] |
| A3 | The free-scan flag flip should happen AFTER a successful AI call (not before) to avoid flipping the flag for a failed request | Code Examples | MEDIUM -- if flip happens before AI and the AI call fails + gets refunded, the user lost their free scan but got Merits back. Flipping after success is safer. Spec does not explicitly state ordering. |

## Open Questions (RESOLVED)

1. RESOLVED: **Should `resolveTier()` be called at all in `grade-linkedin`?**
   - Resolution: Use `userContext.tier as Tier` directly in the handler (zero extra DB cost). `resolve-tier.ts` is created as a shared module for internal worker paths and Phase 17-18 consumers. `analyze-resume` is updated to use `userContext?.tier as Tier ?? 'free'` per D-09. This satisfies the extraction goal without adding unnecessary latency.

2. RESOLVED: **Phase 15 cleanup scope: separate plan or folded in?**
   - Resolution: Folded into Phase 16 Plan 03 Task 3 as a small cleanup task. The change is a 2-line diff: (1) add `import type { Tier } from '../_shared/tier-config.ts'`, (2) replace `rawBody.tier || 'free'` with `(userContext?.tier as Tier) ?? 'free'`. This reduces the `analyze-resume` security surface (no more client-supplied tier).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno | Edge function runtime | Yes | 2.7.1 | -- |
| Supabase CLI | Deployment | Yes | 2.92.0 (from package.json) | -- |
| Node.js | Frontend build / test runner | Yes | 22+ | -- |

No missing dependencies.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test (built-in) |
| Config file | `supabase/functions/deno.json` (tasks.test) |
| Quick run command | `cd supabase/functions && deno test --allow-all grade-linkedin/ --no-check` |
| Full suite command | `powershell -File scripts/run-edge-tests.ps1` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIG-01 | Free output contains only allowed fields | unit | `deno test --allow-all grade-linkedin/strip.test.ts --no-check` | Wave 0 |
| LIG-02 | Free output omits profileInsights and feedback arrays | unit | `deno test --allow-all grade-linkedin/strip.test.ts --no-check` | Wave 0 |
| LIG-03 | Pro output contains all fields (no stripping) | unit | `deno test --allow-all grade-linkedin/strip.test.ts --no-check` | Wave 0 |
| LIG-04 | Elite output identical to Pro | unit | `deno test --allow-all grade-linkedin/strip.test.ts --no-check` | Wave 0 |
| LIG-05 | Free-scan entitlement logic (pro/elite skip deduction on first scan) | unit | `deno test --allow-all grade-linkedin/free-scan.test.ts --no-check` | Wave 0 |
| LIG-06 | free_linkedin_scan_used flag read/write behavior | unit | `deno test --allow-all grade-linkedin/free-scan.test.ts --no-check` | Wave 0 |
| LIG-07 | Per-tier maxTokens values (4000/8192/8192) | unit | `deno test --allow-all grade-linkedin/handler-config.test.ts --no-check` | Exists (needs update) |
| BACK-09 | Handler wiring: tier resolution, prompt loading, merit integration | unit (source analysis) | `deno test --allow-all grade-linkedin/handler-config.test.ts --no-check` | Exists (needs update) |
| D-04 | linkedin model override in tier-config.ts | unit | `deno test --allow-all _shared/tier-config.test.ts --no-check` | Exists (needs update) |
| D-08 | resolve-tier.ts shared helper | unit | `deno test --allow-all _shared/resolve-tier.test.ts --no-check` | Wave 0 |
| D-10 | LinkedIn prompt variants registered with loader | unit | `deno test --allow-all grade-linkedin/prompts.test.ts --no-check` | Exists (needs update) |

### Sampling Rate

- **Per task commit:** `cd supabase/functions && deno test --allow-all grade-linkedin/ _shared/tier-config.test.ts _shared/resolve-tier.test.ts --no-check`
- **Per wave merge:** `powershell -File scripts/run-edge-tests.ps1`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `grade-linkedin/strip.test.ts` -- covers LIG-01, LIG-02, LIG-03, LIG-04 (stripLinkedInFreeTier behavior)
- [ ] `grade-linkedin/free-scan.test.ts` -- covers LIG-05, LIG-06 (free-scan flag logic, unit testable without DB mocks)
- [ ] `_shared/resolve-tier.test.ts` -- covers D-08 (resolve-tier helper, requires Supabase mock or source analysis)
- [ ] Update `grade-linkedin/handler-config.test.ts` -- add assertions for per-tier maxTokens (4000 for Free), model override usage, prompt variant loading
- [ ] Update `grade-linkedin/prompts.test.ts` -- add tests for `buildFreeSystemPrompt`, `buildProSystemPrompt` exports
- [ ] Update `scripts/run-edge-tests.ps1` -- add new test files to the test runner

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `requireAuth(req, { type: 'user' })` validates JWT; userId NEVER from request body [VERIFIED: auth.ts] |
| V3 Session Management | No | Handled by Supabase Auth at platform level |
| V4 Access Control | Yes | Tier resolved server-side from DB; `stripLinkedInFreeTier` enforces output shape; Merit deduction server-only (NFR-03) |
| V5 Input Validation | Yes | Profile content length check (min 50 chars); `sanitizeUserContent` strips prompt injection; content truncation at 12,000 chars |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns for Tier-Gated AI Output

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-supplied tier escalation | Elevation of Privilege | Read tier from `profiles.subscription_tier` server-side only; never trust `rawBody.tier` [VERIFIED: auth.ts lines 87-102] |
| Prompt injection to get Pro output on Free tier | Tampering | Defense-in-depth: `stripLinkedInFreeTier` removes Pro fields server-side regardless of model output [CONTEXT.md D-01] |
| TOCTOU on free-scan flag | Elevation of Privilege | Accepted risk per T-05-01: worst case is 1 extra free scan per cycle. Flip flag immediately after decision. |
| Timing attack on tier comparison | Information Disclosure | Not applicable: tier is a string comparison against a small enum, not a secret. No timing-safe comparison needed. |

## Sources

### Primary (HIGH confidence)

- `supabase/functions/grade-linkedin/index.ts` -- current handler implementation (498 lines), Merit branch at lines 100-229, legacy path at lines 230-498
- `supabase/functions/grade-linkedin/prompts.ts` -- current prompt module (162 lines), `buildSystemPrompt()` and `buildUserMessage()`
- `supabase/functions/grade-linkedin/validation.ts` -- output validator (160 lines), `REQUIRED_TOP_LEVEL` fields, section feedback requirements
- `supabase/functions/grade-linkedin/entitlement.ts` -- legacy free-scan helper (21 lines)
- `supabase/functions/_shared/tier-config.ts` -- model/timeout config (125 lines), `FEATURE_MODEL_OVERRIDES`, `getModel()`, `getTimeout()`
- `supabase/functions/_shared/tier-prompts.ts` -- prompt loader (111 lines), `registerFeaturePrompts()`, `loadPromptVariant()`
- `supabase/functions/_shared/merit-gateway.ts` -- Merit deduction (265 lines), `withMerits()`, `MERIT_SYSTEM_ENABLED`, `MeritRefundable`
- `supabase/functions/_shared/auth.ts` -- auth module (173 lines), `requireAuth()` returns `UserContext` with tier from `profiles.subscription_tier`
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` -- `user_merits` table with `free_linkedin_scan_used` column
- `supabase/migrations/20260415000000_merit_rpcs.sql` -- `reset_subscription_merits` resets `free_linkedin_scan_used = false`

### Secondary (MEDIUM confidence)

- `.planning/phases/16-linkedin-grader-gating/16-CONTEXT.md` -- locked decisions D-01 through D-15
- `.planning/phases/15-resume-analysis-gating/15-RESEARCH.md` -- Phase 15 findings on missing `subscriptions` table (confirms current finding)
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` -- loader design decisions
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` -- Merit gateway design decisions

### Tertiary (LOW confidence)

None. All claims verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all infrastructure exists and is verified on disk
- Architecture: HIGH -- patterns directly follow Phase 15 (resume gating) precedent; code inventoried line-by-line
- Pitfalls: HIGH -- each pitfall verified against specific code locations (validation.ts line numbers, auth.ts pattern, entitlement.ts TOCTOU acceptance)
- Free-scan mechanism: MEDIUM -- flag flip ordering (after AI success vs before) is an assumption (A3)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable internal infrastructure; no external dependency version concerns)
