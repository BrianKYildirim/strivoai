# Phase 15: resume-analysis-gating - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 6 (files to create or modify)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/analyze-resume/index.ts` | controller | request-response + streaming | Self (current file) | exact |
| `supabase/functions/_shared/result-merger.ts` | utility | transform | Self (current file) | exact |
| `supabase/functions/_shared/resume-prompts.ts` | utility | transform | Self (current file) | exact |
| `supabase/functions/_shared/tier-config.ts` | config | static | Self (current file, Phase 14) | exact |
| `supabase/functions/_shared/result-merger.test.ts` | test | N/A | Self (current file) | exact |
| `src/pages/Results.tsx` | component | request-response | Self (current file) | exact |

**Note:** All Phase 15 files are modifications of existing files. No new files are created. The closest analog for every file is the file itself.

## Pattern Assignments

### `supabase/functions/analyze-resume/index.ts` (controller, request-response + streaming)

**Analog:** Self -- this is a modification of an existing 1040+ line edge function handler.

**Imports pattern** (lines 1-13):
```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createUsageLimitResponse } from '../_shared/usage-checker.ts';
import { getServiceClient, getSupabaseUrl, getServiceRoleKey } from '../_shared/supabase-client.ts';
import { invokeAnthropicText } from '../_shared/anthropic.ts';
import { mergeAndValidateResults } from '../_shared/result-merger.ts';
import { createLogger } from '../_shared/logger.ts';
import { buildSystemBlocks, buildUserPrompt, buildImprovementContext, buildFallbackPrompt, type PromptParams, type CallType } from '../_shared/resume-prompts.ts';
import { repairTruncatedJSON } from '../_shared/json-repair.ts';
import { requireInternalOrUserAuth } from '../_shared/auth.ts';
import { corsHeaders, handleOptionsRequest } from '../_shared/cors.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';
```
Phase 15 adds: `import { getModel, type Tier } from '../_shared/tier-config.ts';`

**Tier resolution pattern -- the existing auth call** (lines 226-237):
```typescript
const supabase = getServiceClient();
const userContext = await requireInternalOrUserAuth(req);
// Rate limit: 5/15/30 per hour by tier (D-01). Skip for internal worker path (userContext null).
if (userContext) {
  const rl = await checkRateLimit(userContext.userId, userContext.tier, {
    key: 'analyze-resume',
    limits: { free: 5, pro: 15, elite: 30 },
  });
  if (!rl.allowed) {
    return createRateLimitResponse(rl.retryAfterSeconds, 'user');
  }
}
```
Phase 15 replaces the client-trusted `rawBody.tier` at line 209 with server-resolved tier from `userContext.tier` (already populated by `auth.ts:88-103` from `profiles.subscription_tier`).

**Current tier source (REMOVE)** (line 209):
```typescript
const userTier = rawBody.tier || 'free'; // Elite tier gets deeper analysis
```

**CALL_CONFIGS pattern** (lines 45-49):
```typescript
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensPro: 1800, maxTokensElite: 2200 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensPro: 1800, maxTokensElite: 2200 },
  { callType: 'summary',    maxTokensFree: 2400, maxTokensPro: 2800, maxTokensElite: 3200 },
];
```
Phase 15 updates these values per D-17 and adds a 4th entry `'elite-extras'`.

**capPriorityImprovements (DELETE -- relocate to merger)** (lines 51-58):
```typescript
function capPriorityImprovements(result: Record<string, any>, tier: string): void {
  const maxImprovements: Record<string, number> = { free: 4, pro: 5, elite: 7 };
  const cap = maxImprovements[tier] || 4;
  if (Array.isArray(result.priorityImprovements)) {
    result.priorityImprovements = result.priorityImprovements.slice(0, cap);
  }
}
```
9 call sites in the handler at lines 353, 389, 469, 500, 687, 779, 929, 1027 -- all must be removed.

**executeParallelCalls fan-out pattern** (lines 60-127):
```typescript
async function executeParallelCalls(
  params: {
    model: string;
    promptParams: PromptParams;
    userPrompt: string;
    isElite: boolean;
    tier: 'free' | 'pro' | 'elite';
    fixtureKey: 'analyze_resume';
  }
): Promise<ParallelResult[]> {

  const makeCall = async (callType: CallType, maxTokens: number): Promise<ParallelResult> => {
    const start = Date.now();
    const resp = await invokeAnthropicText({
      model: params.model,
      system: buildSystemBlocks(callType, params.promptParams),
      messages: [{ role: 'user', content: params.userPrompt }],
      maxTokens,
      temperature: 0.3,
      fixtureKey: params.fixtureKey,
      timeoutMs: 100000,
    });
    // ...
  };

  // Fire all 3 calls in parallel
  const promises = CALL_CONFIGS.map(cfg => {
    const maxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;
    return makeCall(cfg.callType, maxTokens);
  });
  // ...
}
```
Phase 15 adds `.filter(cfg => ...)` to skip entries with maxTokens 0, adds 4th elite-extras call.

**Merit wrapping pattern (already exists)** (lines 238-516):
```typescript
if (MERIT_SYSTEM_ENABLED && userContext) {
  const meritCtx = { userId: userContext.userId, tier: userContext.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const };
  const gated = await withMerits(
    meritCtx,
    'resume_analysis',
    async (_txId) => {
      // ... entire analysis body including parallel calls ...
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```
Phase 15 uses this existing pattern. The `withMerits` wrapping is already in place from Phase 13. No structural change needed -- only the tier must come from `resolvedTier` instead of `rawBody.tier`.

**mergeAndValidateResults call pattern** (lines 376, 494, 756, 1012):
```typescript
const mergeResult = mergeAndValidateResults(rawResults, isElite);
if (!mergeResult.ok) throw new MeritRefundable(500, `Merge failed: ${mergeResult.reason}`);
```
Phase 15 changes signature from `(rawResults, isElite)` to `(rawResults, tier)`.

**Fallback maxTokens pattern (6 sites)** (lines 324, 447, 648, 888):
```typescript
const fallbackMaxTokens = userTier === 'elite' ? 7600 : userTier === 'pro' ? 6400 : 6000;
```
Phase 15 replaces with `TIER_MAX_TOKENS[resolvedTier]` (a new constant in `tier-config.ts`, see below).

**Logging pattern** (line 223):
```typescript
log.info('request-start', { resumeId, userId, tier: userTier, resumeTextLen: resumeText.length, hasPrevious: previousSuggestions.length > 0 });
```
Phase 15 replaces `userTier` with `resolvedTier`.

---

### `supabase/functions/_shared/result-merger.ts` (utility, transform)

**Analog:** Self -- Phase 15 adds `applyTierShape` as a new function and modifies `mergeAndValidateResults` signature.

**Current mergeAndValidateResults signature** (lines 227-230):
```typescript
export function mergeAndValidateResults(
  rawResults: Record<string, string>,
  isElite: boolean,
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
```
Phase 15 changes to `(rawResults: Record<string, string>, tier: 'free' | 'pro' | 'elite')`.

**Current pipeline structure** (lines 231-258):
```typescript
  // Validate each call
  const callTypes: CallType[] = ['criteria-1', 'criteria-2', 'summary'];
  const parsed: Record<string, Record<string, unknown>> = {};

  for (const callType of callTypes) {
    const result = parseAndValidateCall(callType, rawResults[callType], isElite);
    if (!result.ok) { /* ... */ return { ok: false, reason: result.reason }; }
    parsed[callType] = result.data;
  }

  // Concatenate criterionFeedback arrays (6 + 5 = 11)
  const criteria1Feedback = parsed['criteria-1'].criterionFeedback as unknown[];
  const criteria2Feedback = parsed['criteria-2'].criterionFeedback as unknown[];
  const criterionFeedback = [...criteria1Feedback, ...criteria2Feedback];

  // Spread summary fields into merged object
  const merged: Record<string, unknown> = {
    criterionFeedback,
    ...parsed['summary'],
  };

  // Fill defaults and add metadata
  fillDefaults(merged, isElite);

  return { ok: true, data: merged };
```
Phase 15 inserts `applyTierShape(merged, tier)` after `fillDefaults` and before `return`. Also optionally handles `elite-extras` parsed results.

**fillDefaults pattern** (lines 142-171):
```typescript
function fillDefaults(merged: Record<string, unknown>, isElite: boolean): void {
  if (!merged.industryGuess) merged.industryGuess = '';
  if (!Array.isArray(merged.suggestedTargetRoles)) merged.suggestedTargetRoles = [];
  if (!Array.isArray(merged.recommendedKeywords)) merged.recommendedKeywords = [];

  if (!isElite) {
    merged.eliteInsights = null;
  } else if (merged.eliteInsights && typeof merged.eliteInsights === 'object') {
    const ei = merged.eliteInsights as Record<string, unknown>;
    if (ei.interviewLikelihood === undefined) ei.interviewLikelihood = 0;
    // ... sub-defaults ...
  }

  merged.overallScore = 0;
  merged._mergeSource = 'parallel-3';
}
```
Phase 15 changes `fillDefaults(merged, isElite)` to `fillDefaults(merged, tier === 'elite')`.

**ALLOWED_FIELDS (per-call-type) pattern** (lines 28-36):
```typescript
const ALLOWED_FIELDS: Record<string, Set<string>> = {
  'criteria-1': new Set(['criterionFeedback']),
  'criteria-2': new Set(['criterionFeedback']),
  'summary': new Set([
    'executiveSummary', 'strengths', 'priorityImprovements',
    'rewriteSuggestions', 'industryGuess', 'suggestedTargetRoles',
    'recommendedKeywords', 'eliteInsights',
  ]),
};
```
This is the per-call-type filter. Phase 15 adds a NEW per-tier whitelist (`FREE_ALLOWED_FIELDS`, `PRO_ALLOWED_FIELDS`, `ELITE_ALLOWED_FIELDS`) that is conceptually similar but operates on the **merged** output at the end.

**stripUnknownFields pattern** (lines 67-80):
```typescript
function stripUnknownFields(data: Record<string, unknown>, callType: CallType): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[callType];
  if (!allowed) return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) {
      result[key] = value;
    } else {
      console.log(`[parallel] Stripped unknown field "${key}" from ${callType} response`);
    }
  }
  return result;
}
```
Phase 15's `applyTierShape` follows an analogous whitelist-strip pattern but mutates in-place.

---

### `supabase/functions/_shared/resume-prompts.ts` (utility, transform)

**Analog:** Self -- Phase 15 extends the `CallType` union and adds `buildEliteExtrasSystem`/`buildEliteExtrasSuffix`.

**CallType union** (line 29):
```typescript
export type CallType = 'criteria-1' | 'criteria-2' | 'summary';
```
Phase 15 extends to `| 'elite-extras'`.

**Tier-specific prompt builders pattern (Phase 14)** (lines 180-210):
```typescript
export function buildFreeResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false) + FREE_TIER_SUFFIX;
}

export function buildProResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, false);
}

export function buildEliteResumePrompt(params: PromptParams): string {
  return _buildCorePrompt(params, true);
}

export const RESUME_PROMPT_VARIANTS: PromptVariantBuilder<PromptParams> = {
  free: buildFreeResumePrompt,
  pro: buildProResumePrompt,
  elite: buildEliteResumePrompt,
};
```
Phase 15 adds an analogous `buildEliteExtrasSystem` builder for the 4th parallel call.

**buildCallSuffix dispatch pattern** (lines 216-225):
```typescript
export function buildCallSuffix(callType: CallType, isElite: boolean, tier: 'free' | 'pro' | 'elite' = 'free'): string {
  switch (callType) {
    case 'criteria-1':
      return buildCriteria1Suffix(isElite);
    case 'criteria-2':
      return buildCriteria2Suffix(isElite);
    case 'summary':
      return buildSummarySuffix(isElite, tier);
  }
}
```
Phase 15 adds `case 'elite-extras': return buildEliteExtrasSuffix();`.

**Feature registration side-effect pattern** (line 376):
```typescript
registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);
```
This already runs at module load. Phase 15 does NOT change this -- the elite-extras prompt is orthogonal to the per-tier variant registration (it is a per-call-type prompt, not a per-tier variant).

**Per-suffix JSON schema pattern** (e.g., buildSummarySuffix lines 253-270):
```typescript
function buildSummarySuffix(isElite: boolean, tier: 'free' | 'pro' | 'elite' = 'free'): string {
  const eliteInsightsSchema = isElite
    ? `,"eliteInsights":{...}`
    : '';
  // ...
  return `Do NOT score any criteria. ...
Return ONLY valid JSON (no markdown, no text outside JSON) matching this schema:
{"executiveSummary":...,"strengths":...,...${eliteInsightsSchema}}
...`;
}
```
Phase 15's new `buildEliteExtrasSuffix` follows this exact pattern -- returns a string with JSON schema instructions.

**buildSystemBlocks cache-optimized pattern** (lines 290-298):
```typescript
export function buildSystemBlocks(
  callType: CallType,
  params: PromptParams,
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  return [
    { type: 'text', text: buildSharedPrefix(params), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildCallSuffix(callType, params.isElite, params.tier) },
  ];
}
```
The elite-extras call will use this same two-block structure with cache_control on the prefix.

---

### `supabase/functions/_shared/tier-config.ts` (config, static)

**Analog:** Self -- Phase 15 adds `TIER_MAX_TOKENS` constant to this existing Phase 14 file.

**Existing constant pattern** (lines 27-31):
```typescript
export const TIER_TIMEOUTS: Record<Tier, Partial<Record<CallType, number>>> = {
  free:  { core: 50_000 },
  pro:   { core: 125_000, 'elite-preview': 65_000 },
  elite: { core: 155_000, quiz: 80_000 },
};
```
Phase 15 adds an analogous `TIER_MAX_TOKENS` constant in the same style:
```typescript
export const TIER_MAX_TOKENS: Record<Tier, number> = {
  free: 6000,
  pro: 16000,
  elite: 20000,
};
```

**Existing getModel pattern** (lines 90-105):
```typescript
export function getModel(tier: Tier, feature?: FeatureKey): string {
  if (tier === 'free') {
    return FREE_MODEL;
  }
  if (feature) {
    const override = FEATURE_MODEL_OVERRIDES[feature]?.[tier];
    if (override) { return override; }
  }
  return TIER_MODELS[tier];
}
```
This is the pattern Phase 15 will use in the handler for model selection instead of inline env reads.

---

### `supabase/functions/_shared/result-merger.test.ts` (test, N/A)

**Analog:** Self -- Phase 15 adds new test cases for `applyTierShape`.

**Existing test fixture pattern** (lines 12-17):
```typescript
function makeCriterion(id: string, label: string, weight: number, score: number, feedbackFormat: 'object' | 'array' = 'object') {
  const feedback = feedbackFormat === 'object'
    ? { observation: `Observed issue in ${id}`, impact: `Impact for ${id}`, fix: `Fix for ${id}` }
    : [`Observed issue in ${id}`, `Impact for ${id}`, `Fix for ${id}`];
  return { id, label, weight, score, feedback };
}
```

**Existing test structure pattern** (lines 105-108):
```typescript
Deno.test("criteria-1 validation accepts 6 correct criteria", () => {
  const result = parseAndValidateCall('criteria-1', makeValidCriteria1(), false);
  assertEquals(result.ok, true);
});
```

**Existing merge test pattern** (lines 215-227):
```typescript
Deno.test("merged output has exactly 11 criterionFeedback items", () => {
  const rawResults = {
    'criteria-1': makeValidCriteria1(),
    'criteria-2': makeValidCriteria2(),
    'summary': makeValidSummary(false),
  };
  const result = mergeAndValidateResults(rawResults, false);
  assertEquals(result.ok, true);
  if (result.ok) {
    const feedback = (result.data as Record<string, unknown>).criterionFeedback as unknown[];
    assertEquals(feedback.length, 11);
  }
});
```
Phase 15 adds tests for:
- `applyTierShape` free: strips Pro/Elite fields, caps priorityImprovements to 1, strips C2-C11 feedback
- `applyTierShape` pro: keeps all 11 criteria with feedback, keeps rewriteSuggestions, strips eliteInsights
- `applyTierShape` elite: keeps everything including eliteInsights
- `mergeAndValidateResults` signature change from `isElite` to `tier`

**Import pattern** (lines 5-6):
```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAndValidateCall, mergeAndValidateResults } from "./result-merger.ts";
```
Phase 15 adds `applyTierShape` to the import if it is exported for fallback-path use.

---

### `src/pages/Results.tsx` (component, request-response)

**Analog:** Self -- Phase 15 requires ZERO changes. Defensive rendering already handles missing feedback.

**Defensive feedback rendering** (lines 1136-1144):
```typescript
{((() => {
  const f = c.feedback;
  if (Array.isArray(f)) return f.filter(Boolean);
  if (f && typeof f === 'object') {
    return [f.observation, f.impact, f.fix, f.deeper, f.rewrite].filter(Boolean);
  }
  if (typeof f === 'string') return f.split('.').map((s: string) => s.trim()).filter(Boolean);
  return [];  // <-- fires when feedback is undefined. Renders empty <ul>. No crash.
})()).map((point: string, idx: number) => (
```
When Phase 15's `applyTierShape` strips `feedback` from C2-C11 for Free tier, the IIFE returns `[]` and the criterion card renders with score bar + weight but empty feedback list. This is expected and visually acceptable. Phase 20 will add the paywall overlay.

---

## Shared Patterns

### Authentication (already in place)
**Source:** `supabase/functions/_shared/auth.ts` lines 71-107
**Apply to:** `analyze-resume/index.ts` (already applied)
```typescript
// requireUserAuth reads profiles.subscription_tier and returns it in UserContext.tier
const ctx: UserContext = {
  userId: user.id,
  email: user.email ?? '',
  tier: profile.subscription_tier ?? 'free',
};
```
Phase 15 uses `userContext.tier` as the server-side tier source instead of `rawBody.tier`.

### Merit Gateway (already in place)
**Source:** `supabase/functions/_shared/merit-gateway.ts` lines 115-198
**Apply to:** `analyze-resume/index.ts` merit path (lines 238-516)
```typescript
const gated = await withMerits(
  meritCtx,
  'resume_analysis',
  async (_txId) => {
    // ... feature work ...
    if (!resp.ok) throw new MeritRefundable(resp.status, resp.error);
    return response;
  },
);
if (!gated.ok) return gated.response;
return gated.value;
```
Phase 15 does NOT change this structure. The `withMerits` signature already expects `(ctx, feature, fn)`.

### Prompt Variant Loading (Phase 14, already in place)
**Source:** `supabase/functions/_shared/tier-prompts.ts` lines 91-111
**Apply to:** `analyze-resume/index.ts` anywhere `buildSystemBlocks` is called
```typescript
export function loadPromptVariant(
  feature: FeatureKey,
  tier: Tier,
  params: unknown,
): string {
  const b = FEATURE_BUILDERS[feature];
  if (!b) throw new Error(`tier-prompts: feature '${feature}' not registered`);
  const fn = b[tier];
  const body = fn(params);
  if (tier === 'free') return body;
  return `${STRIVO_GLOBAL_AI_PRINCIPLES}\n\n${body}`;
}
```
Phase 15's handler can use `loadPromptVariant('resume', resolvedTier, promptParams)` for the shared prefix. The elite-extras call uses a separate builder but follows the same prompt structure.

### Error Handling
**Source:** `supabase/functions/analyze-resume/index.ts` lines 316-321 (merit path)
**Apply to:** All fan-out call sites
```typescript
const failedCalls = parallelResults.filter((r): r is ParallelCallFailure => !r.ok);
if (failedCalls.length > 0 && failedCalls.length < 3) {
  const errorMsg = `${failedCalls.length} of 3 analysis steps failed. Please try again.`;
  throw new MeritRefundable(500, errorMsg);
}
```
Phase 15 adjusts "3" to be dynamic based on the number of active configs (3 for Free/Pro, 4 for Elite).

### Structured Logging
**Source:** `supabase/functions/_shared/logger.ts` (used throughout)
**Apply to:** All modified files
```typescript
const log = createLogger('analyze-resume', reqId);
log.info('request-start', { resumeId, userId, tier: resolvedTier, ... });
log.warn('subscription-missing', { userId: authenticatedUserId });
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | -- | -- | All Phase 15 files are modifications of existing files; every change has a direct in-codebase analog. |

---

## Blocker Status Update (Corrects RESEARCH.md)

The RESEARCH.md reported that Phase 13 and Phase 14 artifacts do not exist on disk. **This is no longer accurate.** Verified on 2026-04-16:

| Artifact | Exists? | Path |
|----------|---------|------|
| `merit-gateway.ts` (`withMerits`, `MERIT_SYSTEM_ENABLED`) | **YES** | `supabase/functions/_shared/merit-gateway.ts` (266 lines) |
| `MeritRefundable`, `refundMeritsForJob` | **YES** | Same file -- already imported in `analyze-resume/index.ts:13` |
| `tier-config.ts` (`getModel`, `getTimeout`, `Tier` type) | **YES** | `supabase/functions/_shared/tier-config.ts` (106 lines) |
| `tier-prompts.ts` (`loadPromptVariant`, `registerFeaturePrompts`) | **YES** | `supabase/functions/_shared/tier-prompts.ts` (112 lines) |
| `global-ai-principles.ts` (`STRIVO_GLOBAL_AI_PRINCIPLES`) | **YES** | `supabase/functions/_shared/global-ai-principles.ts` |
| `TIER_MAX_TOKENS` in `tier-config.ts` | **NO** | Not yet added -- Phase 15 must add this |
| `subscriptions` table | **NOT VERIFIED** | Research says no; Phase 15 should use `profiles.subscription_tier` via existing `userContext.tier` |
| `analyze-resume/index.ts` already imports `withMerits` | **YES** | Line 13 -- `import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';` |
| `resume-prompts.ts` already imports `registerFeaturePrompts` | **YES** | Line 23 -- `import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';` |
| `resume-prompts.ts` already has tier-specific builders | **YES** | Lines 180-210 -- `buildFreeResumePrompt`, `buildProResumePrompt`, `buildEliteResumePrompt` |
| Feature registration side-effect | **YES** | Line 376 -- `registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);` |

**Implication for planner:** Phase 15 can proceed without waiting for Phase 12/13/14. The only missing piece is `TIER_MAX_TOKENS` which Phase 15 adds to `tier-config.ts`. For tier resolution, use `userContext.tier` from the existing auth path (reads `profiles.subscription_tier`).

---

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/functions/_shared/`, `src/pages/`
**Files scanned:** 14 (direct reads of all analog files + grep across `supabase/functions/`)
**Pattern extraction date:** 2026-04-16
