# Phase 16: linkedin-grader-gating - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 8 (new/modified files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/resolve-tier.ts` | utility | request-response | `supabase/functions/_shared/auth.ts` (lines 87-102) | exact |
| `supabase/functions/_shared/tier-config.ts` | config | N/A | Self (existing file, modify) | exact |
| `supabase/functions/grade-linkedin/prompts.ts` | utility | N/A | `supabase/functions/_shared/resume-prompts.ts` (lines 175-210, 395-407) | exact |
| `supabase/functions/grade-linkedin/index.ts` | controller | request-response | Self (existing file, modify) + `supabase/functions/analyze-resume/index.ts` (lines 238-247) | exact |
| `supabase/functions/analyze-resume/index.ts` | controller | request-response | Self (existing file, cleanup) | exact |
| `supabase/functions/grade-linkedin/strip.test.ts` | test | N/A | `supabase/functions/grade-linkedin/validation.test.ts` | role-match |
| `supabase/functions/grade-linkedin/free-scan.test.ts` | test | N/A | `supabase/functions/grade-linkedin/entitlement.test.ts` | exact |
| `supabase/functions/_shared/resolve-tier.test.ts` | test | N/A | `supabase/functions/_shared/tier-config.test.ts` | role-match |

## Pattern Assignments

### `supabase/functions/_shared/resolve-tier.ts` (utility, NEW)

**Analog:** `supabase/functions/_shared/auth.ts`

**Imports pattern** (lines 15-17):
```typescript
import { getServiceClient } from './supabase-client.ts';
import { createLogger } from './logger.ts';
```

**Tier resolution pattern from profiles** (auth.ts lines 87-102):
```typescript
// Fetch the subscription tier from the profiles table
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('subscription_tier')
  .eq('id', user.id)
  .single();

if (profileError || !profile) {
  log.warn('auth-failure', { reason: 'profile-not-found', type: 'user', userId: user.id });
  throw unauthorizedResponse();
}
// ...
tier: profile.subscription_tier ?? 'free',
```

**Type import pattern** (from tier-config.ts line 16):
```typescript
import type { Tier } from './tier-config.ts';
```

**Logger creation pattern** (auth.ts line 19):
```typescript
const log = createLogger('_shared/auth');
```

**Key differences for resolve-tier.ts:**
- Uses `maybeSingle()` instead of `single()` (default to 'free' on missing row rather than throwing)
- Returns `Tier` type, not `UserContext`
- Accepts optional caller logger to avoid duplicate logger creation
- IMPORTANT: Uses `profiles.subscription_tier` column, NOT a `subscriptions` table (which does not exist)

---

### `supabase/functions/_shared/tier-config.ts` (config, MODIFY)

**Analog:** Self -- add `linkedin` to `FEATURE_MODEL_OVERRIDES`

**Existing override pattern** (tier-config.ts lines 76-78):
```typescript
export const FEATURE_MODEL_OVERRIDES: Partial<Record<FeatureKey, Partial<Record<Tier, string>>>> = {
  career: { pro: FREE_MODEL, elite: FREE_MODEL },
};
```

**Modification:** Add `linkedin` entry following the identical pattern as `career`:
```typescript
export const FEATURE_MODEL_OVERRIDES: Partial<Record<FeatureKey, Partial<Record<Tier, string>>>> = {
  career: { pro: FREE_MODEL, elite: FREE_MODEL },
  linkedin: { pro: FREE_MODEL, elite: FREE_MODEL },
};
```

**Note:** `FeatureKey` type already includes `'linkedin'` (tier-config.ts line 18), so no type change needed.

---

### `supabase/functions/grade-linkedin/prompts.ts` (utility, MODIFY)

**Analog:** `supabase/functions/_shared/resume-prompts.ts`

**Registration import pattern** (resume-prompts.ts line 23):
```typescript
import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';
```

**Adapted for grade-linkedin/prompts.ts:**
```typescript
import { registerFeaturePrompts, type PromptVariantBuilder } from '../_shared/tier-prompts.ts';
```

**Tier builder pattern** (resume-prompts.ts lines 180-210):
```typescript
/**
 * Free tier prompt builder. Returns the core prompt body WITHOUT elite
 * additions, plus the FREE_TIER_SUFFIX instructing the model to omit
 * locked fields (RES-01 only, no RES-02 fields).
 */
export function buildFreeResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false) + FREE_TIER_SUFFIX;
}

/**
 * Pro tier prompt builder. Returns the core prompt body WITHOUT elite
 * additions. Retains the full 11-criteria-with-3-4-points instruction.
 * Equivalent to the pre-Phase-14 isElite=false path.
 */
export function buildProResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false);
}
```

**Variant map + registration pattern** (resume-prompts.ts lines 206-210, 407):
```typescript
export const RESUME_PROMPT_VARIANTS: PromptVariantBuilder<PromptParams> = {
  free: buildFreeResumePrompt,
  pro: buildProResumePrompt,
  elite: buildEliteResumePrompt,
};

// ...at module bottom:
registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);
```

**LinkedIn adaptation:** The existing `buildSystemPrompt()` becomes `buildProSystemPrompt()`. A new `buildFreeSystemPrompt()` is added with a truncated output schema omitting `profileInsights`, `feedback` arrays, and `topFixes` beyond first entry. Elite reuses the Pro builder reference.

---

### `supabase/functions/grade-linkedin/index.ts` (controller, MODIFY)

**Analog:** Self (existing Merit branch lines 100-229) + `analyze-resume/index.ts` Phase 13 branch pattern

**Merit branch entry pattern** (grade-linkedin/index.ts lines 100-117):
```typescript
// === Phase 13 branch (D-06) ===
// MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.
if (MERIT_SYSTEM_ENABLED && userContext) {
  // CR-01/CR-02: validate inputs BEFORE withMerits to avoid charging merits
  // for invalid requests that never reach the AI call.
  const meritBody = await req.clone().json();
  const meritProfileContent: string = (meritBody.profileData?.profileContent || meritBody.profileContent || '');
  const meritProfileUrl: string = (meritBody.profileData?.profileUrl || meritBody.profileUrl || '');

  if (meritProfileContent.length < 50) {
    return new Response(
      JSON.stringify({ error: 'Profile content must be at least 50 characters' }),
      { status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  }
```

**withMerits wrapping pattern** (grade-linkedin/index.ts lines 116-228):
```typescript
const gated = await withMerits(
  { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
  'linkedin_grading',
  async (_txId) => {
    // ... AI call logic ...
    if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);
    // ... parse + validate + store ...
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
    );
  },
);
if (!gated.ok) return gated.response;
return gated.value;
```

**AI call pattern with model/maxTokens/timeout** (grade-linkedin/index.ts lines 147-155):
```typescript
const ai = await invokeWithRetry({
  model: 'claude-haiku-4-5-20251001',
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  maxTokens: 8192,
  temperature: 0.3,
  timeoutMs: 60000,
  fixtureKey: 'grade_linkedin',
}, log);
```

**Phase 16 modifications needed inside the Merit branch:**
1. Resolve tier from `userContext.tier as Tier` (no extra DB call; `requireAuth` already reads it)
2. Add free-scan entitlement check BEFORE `withMerits` (read `user_merits.free_linkedin_scan_used`)
3. Replace `buildSystemPrompt()` with `loadPromptVariant('linkedin', tier, {})` from `_shared/tier-prompts.ts`
4. Replace hardcoded `model: 'claude-haiku-4-5-20251001'` with `getModel(tier, 'linkedin')`
5. Replace hardcoded `maxTokens: 8192` with `LINKEDIN_MAX_TOKENS[tier]` feature-level constant
6. Replace hardcoded `timeoutMs: 60000` with `getTimeout(tier)`
7. Add `stripLinkedInFreeTier(parsed)` after `validateLinkedInGrade(parsed)` when `tier === 'free'`
8. Conditional flow: if free scan, skip `withMerits` and flip flag; if paid scan, wrap in `withMerits`

**Per-tier maxTokens constant pattern** (follows tier-config.ts lines 46-50 but feature-level):
```typescript
import type { Tier } from '../_shared/tier-config.ts';

const LINKEDIN_MAX_TOKENS: Record<Tier, number> = {
  free: 4000,
  pro: 8192,
  elite: 8192,
};
```

**Strip function pattern** (inline in index.ts per D-02; no merger pipeline):
```typescript
function stripLinkedInFreeTier(parsed: Record<string, unknown>): Record<string, unknown> {
  delete parsed.profileInsights;

  if (Array.isArray(parsed.topFixes) && parsed.topFixes.length > 1) {
    parsed.topFixes = [parsed.topFixes[0]];
  }

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

**Free-scan entitlement check pattern** (before withMerits, using service-role client):
```typescript
let isFreeScanUsed = true; // default to used (safer)
if (tier !== 'free') {
  const { data: merits } = await getServiceClient()
    .from('user_merits')
    .select('free_linkedin_scan_used')
    .eq('user_id', userId)
    .single();
  isFreeScanUsed = merits?.free_linkedin_scan_used ?? true;
}

const freeScanThisRequest = tier !== 'free' && !isFreeScanUsed;
```

---

### `supabase/functions/analyze-resume/index.ts` (controller, MODIFY -- cleanup)

**Analog:** Self -- replace inline tier resolution with shared import

**Current inline tier resolution** (analyze-resume/index.ts line 209):
```typescript
const userTier = rawBody.tier || 'free'; // Elite tier gets deeper analysis
```

**Target pattern** (use `userContext.tier` from `requireAuth`, matching auth.ts contract):
```typescript
const userTier = (userContext?.tier as Tier) ?? 'free';
```

**New import to add:**
```typescript
import type { Tier } from '../_shared/tier-config.ts';
```

**Scope:** This is a 3-line diff (add import, replace tier source, remove `rawBody.tier` usage). The rest of `analyze-resume/index.ts` is unchanged.

---

### `supabase/functions/grade-linkedin/strip.test.ts` (test, NEW)

**Analog:** `supabase/functions/grade-linkedin/validation.test.ts`

**Test file structure** (validation.test.ts lines 1-5, 41-60):
```typescript
// No side-effect imports (no index.ts/serve)

export interface ValidationResult {
  valid: boolean;
  error?: string;
  correctedScore?: number;
}
// ...
export function validateLinkedInGrade(parsed: unknown): ValidationResult {
  // ...
}
```

**Deno test pattern** (validation.test.ts style, using direct function import):
```typescript
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
// Import the strip function directly (must be exported from index.ts or extracted)
```

**Alternative test pattern** -- source analysis (handler-config.test.ts lines 8-14):
```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);
```

**Recommendation:** Export `stripLinkedInFreeTier` from index.ts (or extract to a separate module) so tests can import it directly. Unit tests should verify:
- Keeps `rawScore`, `scoreJustification`, `keyStrengths`, `nextBestAction`
- Keeps `topFixes[0]` only, strips `topFixes[1+]`
- Deletes `profileInsights` entirely
- Strips `feedback` arrays from `sectionBreakdown` entries while keeping `name`, `score`, `maxScore`, `status`
- Returns full object unchanged when tier is not 'free' (Pro/Elite bypass)

---

### `supabase/functions/grade-linkedin/free-scan.test.ts` (test, NEW)

**Analog:** `supabase/functions/grade-linkedin/entitlement.test.ts`

**Test import pattern** (entitlement.test.ts is tested indirectly; direct import from pure function):
```typescript
// The entitlement.test.ts file does not exist separately --
// entitlement.ts exports a pure function `isFreeScan(cycleGradeCount)`
// that is unit-testable without DB mocks.
```

**Pure function test pattern** (prompts.test.ts lines 1-4):
```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildUserMessage } from './prompts.ts';
```

**Recommended tests:** Test the free-scan decision logic as a pure function (extract the check logic into a testable helper):
- Pro user with `free_linkedin_scan_used = false` -> free scan
- Pro user with `free_linkedin_scan_used = true` -> paid scan
- Elite user with `free_linkedin_scan_used = false` -> free scan
- Free user -> always paid scan (no free-scan entitlement for free tier)
- Missing `user_merits` row -> defaults to paid scan (safer default)

---

### `supabase/functions/_shared/resolve-tier.test.ts` (test, NEW)

**Analog:** `supabase/functions/_shared/tier-config.test.ts`

**Test file structure** (tier-config.test.ts lines 1-17):
```typescript
/**
 * Deno unit tests for tier-config.ts -- per-tier timeouts and model routing.
 * Covers all BACK-12 exact timeout values and D-13 Free-model enforcement.
 *
 * Run with: deno test --no-check _shared/tier-config.test.ts
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getTimeout,
  getModel,
  TIER_TIMEOUTS,
  // ...
} from "./tier-config.ts";
import type { Tier, CallType, FeatureKey } from "./tier-config.ts";
```

**Test naming convention** (tier-config.test.ts):
```typescript
Deno.test("D-13: Free model is Haiku 4.5 and cannot be overridden", () => {
  // ...
});
```

**Recommended approach:** Since `resolveTier()` requires a Supabase client, tests should either:
1. Use source analysis (like handler-config.test.ts) to verify the function reads from `profiles.subscription_tier` and defaults to `'free'`
2. Or mock `getServiceClient()` if the test framework supports it

---

## Shared Patterns

### Authentication
**Source:** `supabase/functions/_shared/auth.ts` (lines 51-67)
**Apply to:** `grade-linkedin/index.ts` (already uses `requireAuth`)
```typescript
const userContext = await requireAuth(req, { type: 'user' });
const userId = userContext!.userId;
```
No changes needed -- already wired correctly.

### Tier from UserContext (no extra DB call)
**Source:** `supabase/functions/_shared/auth.ts` (lines 99-103)
**Apply to:** `grade-linkedin/index.ts`, `analyze-resume/index.ts`
```typescript
const ctx: UserContext = {
  userId: user.id,
  email: user.email ?? '',
  tier: profile.subscription_tier ?? 'free',
};
```
Handlers should cast `userContext.tier as Tier` directly rather than calling `resolveTier()` (avoids duplicate DB query). The `resolve-tier.ts` helper exists for code paths without `requireAuth` (internal workers, Phases 17-18).

### Error Handling
**Source:** `supabase/functions/grade-linkedin/index.ts` (lines 487-498)
**Apply to:** All modifications within `grade-linkedin/index.ts`
```typescript
} catch (error) {
  // Re-throw Response objects (from requireAuth)
  if (error instanceof Response) throw error;

  const errorMessage = error instanceof Error ? error.message : 'Internal server error';
  log.error('request-failed', { error: errorMessage });
  return new Response(
    JSON.stringify({ error: errorMessage }),
    { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
```

### CORS Headers
**Source:** `supabase/functions/_shared/cors.ts` (used throughout)
**Apply to:** All Response constructors in `grade-linkedin/index.ts`
```typescript
{ headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } }
```

### Structured Logging
**Source:** `supabase/functions/_shared/logger.ts` (lines 16-49)
**Apply to:** All new code in `grade-linkedin/index.ts` and `resolve-tier.ts`
```typescript
const log = createLogger('grade-linkedin', reqId);
log.info('tier-resolved', { userId, tier });
log.info('free-scan-bypass', { userId });
log.warn('free-scan-flag-flip-failed', { userId, error: String(err) });
```

### Merit Gateway Integration
**Source:** `supabase/functions/_shared/merit-gateway.ts` (lines 115-198)
**Apply to:** `grade-linkedin/index.ts` Merit branch
```typescript
const gated = await withMerits(
  { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
  'linkedin_grading',
  async (_txId) => {
    // AI call + validation + store
    if (!ai.ok) throw new MeritRefundable(ai.status, ai.error);
    return new Response(JSON.stringify(parsed), { headers: { ... } });
  },
);
if (!gated.ok) return gated.response;
return gated.value;
```

### Prompt Variant Loading
**Source:** `supabase/functions/_shared/tier-prompts.ts` (lines 91-111)
**Apply to:** `grade-linkedin/index.ts` (replaces `buildSystemPrompt()` call)
```typescript
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
// ...
const systemPrompt = loadPromptVariant('linkedin', tier, {});
```

### Model + Timeout Selection
**Source:** `supabase/functions/_shared/tier-config.ts` (lines 89-124)
**Apply to:** `grade-linkedin/index.ts` AI call parameters
```typescript
import { getModel, getTimeout } from '../_shared/tier-config.ts';
import type { Tier } from '../_shared/tier-config.ts';
// ...
const ai = await invokeWithRetry({
  model: getModel(tier, 'linkedin'),
  system: systemPrompt,
  messages: [{ role: 'user', content: userMessage }],
  maxTokens: LINKEDIN_MAX_TOKENS[tier],
  temperature: 0.3,
  timeoutMs: getTimeout(tier),
  fixtureKey: 'grade_linkedin',
}, log);
```

### Deno Test Conventions
**Source:** `supabase/functions/_shared/tier-config.test.ts` (lines 1-8)
**Apply to:** All new test files
```typescript
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
```
Test names follow pattern: `"REQ-ID: behavior description"` (e.g., `"LIG-01: Free output omits profileInsights"`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All 8 files have close analogs in the existing codebase |

## Metadata

**Analog search scope:** `supabase/functions/` (all edge functions and `_shared/` utilities)
**Files scanned:** 35+ (all `_shared/*.ts`, `grade-linkedin/*.ts`, `analyze-resume/index.ts`, test files)
**Pattern extraction date:** 2026-04-17
