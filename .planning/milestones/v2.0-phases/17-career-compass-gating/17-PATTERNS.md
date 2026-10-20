# Phase 17: career-compass-gating - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 6 (new/modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/career-prompts.ts` | service (prompt module) | transform | `supabase/functions/_shared/resume-prompts.ts` | exact |
| `supabase/functions/analyze-career/index.ts` | controller (edge function) | request-response + parallel fan-out | `supabase/functions/analyze-resume/index.ts` | exact |
| `supabase/functions/_shared/result-merger.ts` | service (output shaper) | transform | `supabase/functions/_shared/result-merger.ts` (self — extend) | exact |
| `supabase/functions/_shared/tier-prompts.ts` | service (registry) | transform | `supabase/functions/_shared/tier-prompts.ts` (self — consumed, not modified) | exact |
| `supabase/functions/_shared/career-shape.test.ts` | test | unit | `supabase/functions/_shared/result-merger.test.ts` | exact |
| `supabase/functions/_shared/tier-validation.test.ts` | test (integration) | request-response | `supabase/functions/_shared/tier-validation.test.ts` (self — extend) | exact |

## Pattern Assignments

### `supabase/functions/_shared/career-prompts.ts` (NEW — service, transform)

**Analog:** `supabase/functions/_shared/resume-prompts.ts`

**Imports pattern** (lines 1-23):
```typescript
import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';
```
The module imports `registerFeaturePrompts` and `PromptVariantBuilder` from the Phase 14 loader. No other shared imports needed — prompt modules are self-contained text builders.

**PromptParams interface pattern** (resume-prompts.ts lines 31-43):
```typescript
export interface PromptParams {
  isElite: boolean;
  tier: 'free' | 'pro' | 'elite';
  currentDate: string;
  wordCount: number;
  bulletCount: number;
  // ... feature-specific fields
}
```
Career equivalent will define `CareerPromptParams` with domain classification fields instead of resume stats:
- `currentDate`, `domain`, `domainConfidence`, `domainEvidence`, `secondaryDomains`, `uniqueRoles`, `uniqueFields`, `domainConfig`

**Tier builder pattern** (resume-prompts.ts lines 180-210):
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
Career equivalent: `buildFreeCareerPrompt`, `buildProCareerPrompt`, `buildEliteCareerPrompt`, plus a separate `buildEliteExtrasPrompt` for the compensation call. The Free builder appends a `FREE_TIER_SUFFIX` (like resume) that instructs the model to omit locked fields.

**Registration side-effect pattern** (resume-prompts.ts line 407):
```typescript
registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);
```
Career equivalent: `registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS);` at module bottom. The `'career'` key is already declared in `tier-prompts.ts` `FeatureKey` union (line 34).

**Core prompt text source** — extract from analyze-career/index.ts lines 831-851 (system prompt) and lines 795-828 (elite compensation prompt). The system prompt at line 831 becomes the core builder; the elite block at line 795 becomes the `ELITE_EXTRAS_PROMPT` builder.

---

### `supabase/functions/analyze-career/index.ts` (MODIFY — controller, request-response + parallel fan-out)

**Analog:** `supabase/functions/analyze-resume/index.ts`

**New imports pattern** (analyze-resume/index.ts lines 6-14):
```typescript
import { mergeAndValidateResults, applyTierShape } from '../_shared/result-merger.ts';
import { buildSystemBlocks, buildUserPrompt, buildImprovementContext, buildFallbackPrompt, type PromptParams, type CallType } from '../_shared/resume-prompts.ts';
import { TIER_MAX_TOKENS, getModel, getTimeout, type Tier } from '../_shared/tier-config.ts';
```
Career equivalent adds:
```typescript
import { loadPromptVariant } from '../_shared/tier-prompts.ts';
import '../_shared/career-prompts.ts'; // side-effect: registers 'career' feature
import { applyCareerTierShape } from '../_shared/result-merger.ts';
import { TIER_MAX_TOKENS, getModel, getTimeout, type Tier } from '../_shared/tier-config.ts';
```

**Tier resolution pattern** (analyze-resume/index.ts lines 234-244):
```typescript
const resolvedTier: 'free' | 'pro' | 'elite' =
  (userContext?.tier === 'pro' || userContext?.tier === 'elite')
    ? userContext.tier as 'free' | 'pro' | 'elite'
    : 'free';
const isElite = resolvedTier === 'elite';
if (!userContext?.tier || (userContext.tier !== 'free' && userContext.tier !== 'pro' && userContext.tier !== 'elite')) {
  log.warn('subscription-missing-or-invalid', { userId: userContext?.userId, rawTier: userContext?.tier });
}
```
This exact block replaces analyze-career/index.ts lines 353-354 (`tier: userTier` and `isElite = userTier === 'elite'`). The `resolvedTier` is then threaded into `withMerits`, `loadPromptVariant`, `getModel`, `getTimeout`, and `applyCareerTierShape`.

**CALL_CONFIGS + boot-time assertion pattern** (analyze-resume/index.ts lines 46-60):
```typescript
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'summary',    maxTokensFree: 2400, maxTokensPro: 6400, maxTokensElite: 6000 },
  { callType: 'elite-extras', maxTokensFree: 0, maxTokensPro: 0, maxTokensElite: 4000 },
];

for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensFree' | 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[analyze-resume] CALL_CONFIGS sum ${sum} exceeds TIER_MAX_TOKENS[${tier}] (${TIER_MAX_TOKENS[tier]})`);
  }
}
```
Career equivalent uses 2 call types (`'base'` and `'elite-extras'`) instead of 4. Budget split per RESEARCH.md recommendation: base 6000/16000/16000, elite-extras 0/0/4000.

**Parallel call types pattern** (analyze-resume/index.ts lines 29-44):
```typescript
interface ParallelCallResult {
  callType: CallType;
  ok: true;
  text: string;
  durationMs: number;
}
interface ParallelCallFailure {
  callType: CallType;
  ok: false;
  error: string;
  status?: number;
  durationMs: number;
}
type ParallelResult = ParallelCallResult | ParallelCallFailure;
```

**executeParallelCalls pattern** (analyze-resume/index.ts lines 65-136):
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
      timeoutMs: getTimeout(params.tier as Tier),
    });
    const durationMs = Date.now() - start;
    if (!resp.ok) {
      return { callType, ok: false, error: resp.error, status: resp.status, durationMs };
    }
    return { callType, ok: true, text: resp.text, durationMs };
  };

  const activeConfigs = CALL_CONFIGS.filter(cfg => {
    const maxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;
    return maxTokens > 0;
  });
  const promises = activeConfigs.map(cfg => {
    const maxTokens = params.tier === 'elite' ? cfg.maxTokensElite : params.tier === 'pro' ? cfg.maxTokensPro : cfg.maxTokensFree;
    return makeCall(cfg.callType, maxTokens);
  });

  const results = await Promise.allSettled(promises);
  // ... retry logic ...
  return Promise.all(retryPromises);
}
```
Career equivalent adapts this: `fixtureKey: 'analyze_career'`, uses `loadPromptVariant` for the system prompt instead of `buildSystemBlocks`, and the elite-extras call uses a different prompt than the base call.

**Model routing pattern** (analyze-resume/index.ts line 269):
```typescript
const ANTHROPIC_MODEL_TEXT = getModel(resolvedTier, 'resume');
```
Career equivalent: `getModel(resolvedTier, 'career')`. Per tier-config.ts line 77, career has a feature override: `career: { pro: FREE_MODEL, elite: FREE_MODEL }` (Haiku for all tiers).

**Merit context pattern** (analyze-resume/index.ts lines 261-264):
```typescript
const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
const gated = await withMerits(
  meritCtx,
  'resume_analysis',
```
Career equivalent: `withMerits(meritCtx, 'career_compass', ...)`. The `MERIT_COST` constant follows the same pattern (line 63 of analyze-resume): `const MERIT_COST: Record<string, number> = { free: 3, pro: 2, elite: 3 };`.

**Multi-role comparison handler** — existing at analyze-career/index.ts lines 248-339. Must be updated to receive `resolvedTier` (replacing `userTier`), use `getModel(resolvedTier, 'career')` instead of inline ternary, and apply `applyCareerTierShape` to the parsed output before returning.

**Lines to delete/replace in analyze-career/index.ts:**
- Line 353: `tier: userTier` from requestBody destructuring -- REMOVE
- Line 354: `const isElite = userTier === 'elite';` -- REPLACE with resolvedTier block
- Lines 357-359: Inline model routing -- REPLACE with `getModel(resolvedTier, 'career')`
- Lines 415-417: Inner model routing duplication -- REMOVE (use outer resolvedTier)
- Lines 795-851: Inline prompt construction -- REPLACE with `loadPromptVariant` call
- Lines 866-916: Single-call retry loop -- REPLACE with `executeParallelCalls` + merge
- Line 882: Hardcoded `timeoutMs: 85000` -- REPLACE with `getTimeout(resolvedTier)`
- Lines 250-252: Multi-role inline model routing -- REPLACE with `getModel(resolvedTier, 'career')`
- Line 407: `handleMultiRoleComparison(compareRoles, existingAnalysis, userTier)` -- CHANGE to `resolvedTier`

---

### `supabase/functions/_shared/result-merger.ts` (MODIFY — service, transform)

**Analog:** Self — extend with career-specific rules following the existing resume pattern.

**Whitelist definition pattern** (result-merger.ts lines 55-81):
```typescript
const CORE_FIELDS = ['overallScore', '_mergeSource'] as const;

const FREE_ALLOWED_FIELDS = new Set<string>([
  ...CORE_FIELDS,
  'executiveSummary',
  'resumeSignal',
  'strengths',
  'priorityImprovements',
  'criterionFeedback',
]);

const PRO_ADDITIONS = [
  'rewriteSuggestions',
  'industryGuess',
  'suggestedTargetRoles',
  'recommendedKeywords',
] as const;
const PRO_ALLOWED_FIELDS = new Set<string>([...FREE_ALLOWED_FIELDS, ...PRO_ADDITIONS]);

const ELITE_ADDITIONS = [
  'eliteInsights',
] as const;
const ELITE_ALLOWED_FIELDS = new Set<string>([...PRO_ALLOWED_FIELDS, ...ELITE_ADDITIONS]);
```
Career equivalent defines `CAREER_FREE_ALLOWED_FIELDS`, `CAREER_PRO_ALLOWED_FIELDS`, `CAREER_ELITE_ALLOWED_FIELDS` using the same cascading `Set<string>` pattern. Fields derived from the JSON schema at analyze-career/index.ts line 849.

**applyTierShape function pattern** (result-merger.ts lines 264-295):
```typescript
export function applyTierShape(
  merged: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const whitelist = tier === 'elite' ? ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? PRO_ALLOWED_FIELDS
    : FREE_ALLOWED_FIELDS;

  for (const key of Object.keys(merged)) {
    if (!whitelist.has(key)) {
      delete merged[key];
    }
  }

  // Cap priorityImprovements per tier
  const IMPROVEMENT_CAPS: Record<string, number> = { free: 1, pro: 5, elite: 7 };
  if (Array.isArray(merged.priorityImprovements)) {
    merged.priorityImprovements = (merged.priorityImprovements as unknown[]).slice(0, IMPROVEMENT_CAPS[tier]);
  }

  // Free tier: strip feedback from C2-C11
  if (tier === 'free' && Array.isArray(merged.criterionFeedback)) {
    merged.criterionFeedback = (merged.criterionFeedback as Record<string, unknown>[]).map((c, i) => {
      if (i === 0) return c;
      return { id: c.id, label: c.label, weight: c.weight, score: c.score };
    });
  }
}
```
Career equivalent: `applyCareerTierShape` — same whitelist-strip loop, plus career-specific array slicing for Free tier per CC-01 (careerFields slice to 1, surpriseFits slice to 1, roleRoadmaps steps slice to 2, roleReadinessBreakdown scorebox only). This is a new exported function, NOT a modification of the existing `applyTierShape`.

---

### `supabase/functions/_shared/career-shape.test.ts` (NEW — test, unit)

**Analog:** `supabase/functions/_shared/result-merger.test.ts`

**Test file structure pattern** (result-merger.test.ts lines 1-10):
```typescript
/**
 * Deno unit tests for result-merger module.
 * Run with: deno test supabase/functions/_shared/result-merger.test.ts --allow-read --allow-net
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAndValidateCall, mergeAndValidateResults, applyTierShape } from "./result-merger.ts";
```
Career equivalent imports `applyCareerTierShape` from `./result-merger.ts` and tests all 3 tiers against a golden career fixture.

**Fixture factory pattern** (result-merger.test.ts lines 12-60):
Each test defines factory functions that produce valid test data. Career equivalent builds a `makeFullCareerOutput()` factory returning all 20+ career fields, then asserts:
- Free: `careerFields.length === 1`, `surpriseFits.length === 1`, `roleRoadmaps[*].steps.length === 2`, `roleReadinessBreakdown` has only `overallScore`/`targetRole`/`readinessVerdict`, no `skillGaps`/`resumeImprovements`/`salaryProgression`/`compensationIntelligence`/`smartApplicationStrategy`
- Pro: all standard fields present, `compensationIntelligence` absent, `smartApplicationStrategy` absent
- Elite: all fields present including `compensationIntelligence` and `smartApplicationStrategy`

**Test naming pattern** (tier-config.test.ts lines 21-23):
```typescript
Deno.test("BACK-12: Free core timeout is 50_000ms", () => {
  assertEquals(getTimeout('free', 'core'), 50_000);
});
```
Career equivalent uses requirement IDs: `Deno.test("CC-01: Free tier slices careerFields to 1 entry", ...)`.

---

### `supabase/functions/_shared/tier-validation.test.ts` (MODIFY — test, integration)

**Analog:** Self — extend following the existing resume test pattern.

**Live test pattern** (tier-validation.test.ts lines 120-146):
```typescript
Deno.test({
  name: 'TEST-09 resume Free variant omits all locked fields (live)',
  ignore: skip,
  async fn() {
    const freeParams: PromptParams = { ...params, tier: 'free', isElite: false };
    const prompt = loadPromptVariant('resume', 'free', freeParams);
    const response = await invokeAnthropicText({
      model: getModel('free', 'resume'),
      system: prompt,
      messages: [{ role: 'user', content: resumeText }],
      maxTokens: 6000,
      timeoutMs: getTimeout('free', 'core'),
    });
    assert(response.ok, `Anthropic call failed: ${'error' in response ? response.error : 'unknown'}`);
    if (!response.ok) return;
    const parsed = JSON.parse(response.text);
    for (const field of FREE_LOCKED_FIELDS) {
      assertEquals(parsed[field], undefined, `Free response must not include '${field}'`);
    }
  },
});
```
Career equivalent adds a `TEST-09 career Free variant omits all locked fields (live)` test. Requires importing `'../_shared/career-prompts.ts'` (side-effect registration), defining `CAREER_FREE_LOCKED_FIELDS`, and building `CareerPromptParams` with domain classification data.

**Snapshot/fixture pattern** (tier-validation.test.ts lines 152-201):
```typescript
Deno.test({
  name: 'TEST-10 resume Free token count < 50% of Elite (live, snapshot)',
  ignore: skip,
  async fn() {
    // ... parallel Free + Elite calls, token comparison, fixture write ...
    const fixture = await readFixture();
    fixture['resume'] = { freeTokens, eliteTokens, ratio, timestamp };
    await writeFixture(fixture);
    assert(freeTokens < 0.5 * eliteTokens, ...);
  },
});
```
Career equivalent writes `fixture['career'] = { ... }` to the same fixture file. Uses `loadPromptVariant('career', ...)` and `getModel(tier, 'career')`.

---

## Shared Patterns

### Tier Resolution (Server-Side)
**Source:** `supabase/functions/analyze-resume/index.ts` lines 234-244
**Apply to:** `analyze-career/index.ts` — replaces `tier: userTier` from requestBody (line 353) and `isElite = userTier === 'elite'` (line 354)
```typescript
const resolvedTier: 'free' | 'pro' | 'elite' =
  (userContext?.tier === 'pro' || userContext?.tier === 'elite')
    ? userContext.tier as 'free' | 'pro' | 'elite'
    : 'free';
const isElite = resolvedTier === 'elite';
if (!userContext?.tier || (userContext.tier !== 'free' && userContext.tier !== 'pro' && userContext.tier !== 'elite')) {
  log.warn('subscription-missing-or-invalid', { userId: userContext?.userId, rawTier: userContext?.tier });
}
```

### Model Routing via tier-config
**Source:** `supabase/functions/_shared/tier-config.ts` lines 109-124
**Apply to:** `analyze-career/index.ts` (replace lines 357-359 and 250-252), `handleMultiRoleComparison`
```typescript
const model = getModel(resolvedTier, 'career');
// tier-config.ts line 77: career overrides Pro/Elite to Haiku (cost optimization)
```

### Timeout via tier-config
**Source:** `supabase/functions/_shared/tier-config.ts` lines 89-95
**Apply to:** `analyze-career/index.ts` (replace hardcoded `timeoutMs: 85000` at line 882)
```typescript
timeoutMs: getTimeout(resolvedTier),
```

### Merit Integration
**Source:** `supabase/functions/analyze-resume/index.ts` lines 261-264
**Apply to:** `analyze-career/index.ts` Merit path (line 401-403)
```typescript
const meritCtx = { userId: userContext.userId, tier: resolvedTier, corsType: 'user' as const };
const gated = await withMerits(meritCtx, 'career_compass', async (_txId) => { ... });
```

### Defense-in-Depth (Prompt + Server-Side Strip)
**Source:** `supabase/functions/_shared/resume-prompts.ts` lines 66-70 (FREE_TIER_SUFFIX) + `result-merger.ts` lines 264-295 (applyTierShape)
**Apply to:** `career-prompts.ts` (Free prompt suffix) + `result-merger.ts` (applyCareerTierShape)
- Prompt instructs model to omit locked fields (first line of defense)
- Server-side `applyCareerTierShape` strips any leaked fields (second line of defense)

### Prompt Registration Side-Effect
**Source:** `supabase/functions/_shared/resume-prompts.ts` line 407
**Apply to:** `career-prompts.ts` (bottom of file)
```typescript
registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS);
```

### MeritRefundable Error Handling
**Source:** `supabase/functions/analyze-career/index.ts` lines 434, 459, 509, 518, 523
**Apply to:** Same file — the parallel fan-out pattern wraps AI failures with `throw new MeritRefundable(status, error)` to trigger automatic merit refund via the gateway. Follows the same pattern already in the Merit path.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 17 files have exact analogs in the codebase from Phases 14-15 |

Every file in Phase 17 follows an established pattern. The phase is adaptation of Phase 15's resume-gating pattern to the career-compass feature, with zero new infrastructure.

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/functions/_shared/`, `supabase/functions/analyze-resume/`, `supabase/functions/analyze-career/`
**Files scanned:** 25+ (shared modules, edge functions, test files)
**Pattern extraction date:** 2026-04-17
