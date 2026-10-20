# Phase 17: career-compass-gating - Research

**Researched:** 2026-04-17
**Domain:** Supabase Edge Function tier-gating (Deno/TypeScript), Anthropic parallel calls, Career Compass output shaping
**Confidence:** HIGH

## Summary

Phase 17 makes the `analyze-career` edge function tier-aware by following the exact pattern Phase 15 established for `analyze-resume`. The changes are mechanical: replace client-trusted `rawBody.tier` with server-resolved tier from `userContext.tier`, extract prompts into `_shared/career-prompts.ts` with the Phase 14 loader pattern, split the single retry-loop AI call into a 2-call parallel fan-out (base + conditional elite-extras), enforce per-tier `maxTokens` caps from `tier-config.ts`, and add career-specific `applyTierShape` rules to `result-merger.ts`.

The existing `analyze-career/index.ts` is 1063 lines with a Merit-gated path already wired (lines 375-536) and a legacy path (lines 538-1063). Both paths share the same single-call retry loop pattern (3 attempts with backoff) and identical prompt construction. The Merit path already uses `withMerits` and `MeritRefundable` but still trusts `rawBody.tier` and uses inline model routing. The primary risk is that Career Compass's JSON output schema is much larger than resume analysis (20+ top-level fields vs 5-6) requiring careful whitelist definition, and the `handleMultiRoleComparison` sub-path also needs tier-awareness.

**Primary recommendation:** Follow the Phase 15 pattern exactly — resolve tier from `userContext.tier`, register career prompts with the loader, 2-call parallel fan-out with conditional elite-extras, career-specific `applyTierShape` in result-merger, and boot-time budget assertion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 2-call parallel fan-out: base analysis (all tiers) + conditional elite-extras (Elite only for compensationIntelligence + smartApplicationStrategy)
- **D-02:** Replace single-call retry loop with parallel execution pattern similar to `executeParallelCalls` in analyze-resume
- **D-03:** Per-tier maxTokens from TIER_MAX_TOKENS: Free 6000 / Pro 16000 / Elite 20000. Budget split is planner's discretion
- **D-04:** Prompts extracted to `_shared/career-prompts.ts` with FREE_PROMPT, PRO_PROMPT, ELITE_PROMPT + ELITE_EXTRAS_PROMPT. Registered with Phase 14 loader under 'career' key
- **D-05:** Domain classification logic stays in index.ts (not prompt text)
- **D-06:** STRIVO_GLOBAL_AI_PRINCIPLES auto-prepended by Phase 14 loader for Pro/Elite
- **D-07:** Free output enforced at both layers: prompt instructs model + applyTierShape strips server-side
- **D-08:** Career-specific shaping rules added to existing applyTierShape in result-merger.ts
- **D-09:** Free tier array slicing rules per CC-01 (detailed in CONTEXT.md)
- **D-10:** Pro tier shaping per CC-03: all standard fields, all 5 roadmap phases, full roleReadinessBreakdown, salaryProgression. Omit compensationIntelligence, smartApplicationStrategy
- **D-11:** CAREER_FREE_ALLOWED_FIELDS and CAREER_PRO_ALLOWED_FIELDS whitelists in result-merger.ts
- **D-12:** Multi-role comparison costs same Merits as full analysis (3/2/3)
- **D-13:** Multi-role comparison output tier-shaped identically to full analysis
- **D-14:** Tier resolved server-side from subscriptions table (via userContext.tier from auth.ts)
- **D-15:** Missing subscription -> default to 'free' with warn log
- **D-16:** Replace isElite from untrusted input with resolvedTier from subscriptions lookup
- **D-17:** Model routing via getModel('free'/'career') from tier-config.ts, replacing inline logic
- **D-18:** Timeouts via getTimeout(tier) from tier-config.ts, replacing hardcoded 85000

### Claude's Discretion
- Exact maxTokens budget split between base call and elite-extras call
- Whether Career Compass needs its own executeParallelCalls or can reuse/adapt from analyze-resume
- Exact CAREER_FREE_ALLOWED_FIELDS list
- Whether handleMultiRoleComparison gets its own prompt variant or reuses main analysis prompt with comparison flag
- Shape of the elite-extras prompt (temperature, system block style, context depth)
- Whether retry/backoff logic is preserved per-call or replaced by simpler pattern
- Exact buildAnthropicImageBlocks positioning (stays in index.ts)

### Deferred Ideas (OUT OF SCOPE)
- Tier gating for LinkedIn / Recruiting Lens / Interview Prep — Phases 16, 18, 19
- Rich frontend Career Compass Elite presentation — Phase 20
- Extracting resolveTier() into _shared/resolve-tier.ts — defer to Phase 16+
- Refactoring DOMAIN_MAPPING into separate module
- Running TEST-09/TEST-10 in CI
- Token-count empirical measurement of elite-extras budget
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CC-01 | Free output: full careerDNA, first careerFields entry, roleReadinessBreakdown scorebox, first 2 roleRoadmaps phases, first surpriseFits entry | Whitelists + array slicing in applyTierShape; FREE_PROMPT instructs model to omit locked fields |
| CC-02 | Free omits: skillAssessments detail, skillGaps, resumeImprovements, salaryProgression, compensationIntelligence, smartApplicationStrategy | Field whitelist deletion + prompt constraint; defense-in-depth pattern from Phase 15 |
| CC-03 | Pro output: all standard fields, all 5 roadmap phases, full roleReadinessBreakdown, salaryProgression; omits compensationIntelligence, smartApplicationStrategy | Pro whitelist permits all standard fields; elite-extras call not fired for Pro |
| CC-04 | Elite output: all Pro fields + compensationIntelligence + smartApplicationStrategy; saved to dashboard | Elite-extras 2nd parallel call produces compensation fields; merger folds them in |
| CC-05 | maxTokens enforced: Free=6000, Pro=16000, Elite=20000 | TIER_MAX_TOKENS from tier-config.ts; boot-time assertion verifies sum(call budgets) <= cap |
| BACK-10 | Modified analyze-career: Merit check, prompt variant, per-tier maxTokens | withMerits already wired; add tier resolution, loader, parallel fan-out, applyTierShape |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tier resolution | API / Backend (auth.ts) | — | Server-side only; profiles.subscription_tier via requireInternalOrUserAuth |
| Prompt variant selection | API / Backend (_shared/tier-prompts.ts) | — | Loader pattern; server-side prompt assembly before Anthropic call |
| Parallel AI fan-out | API / Backend (analyze-career/index.ts) | — | Anthropic API calls from edge function |
| Output shaping (defense-in-depth) | API / Backend (_shared/result-merger.ts) | — | Server-side whitelist strip; never trust prompt compliance alone |
| Merit deduction | API / Backend (_shared/merit-gateway.ts) | — | Pre-call deduction with refund on failure; Phase 13 contract |
| Tier-gated rendering | Browser / Client (CareerCompass.tsx) | — | Defensive: handle missing fields, render LockedSection for absent data |
| Domain classification | API / Backend (analyze-career/index.ts) | — | Keyword-based classifier runs on combined resume+LinkedIn text |

## Standard Stack

### Core (consumed, not installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno std | 0.168.0 | HTTP server, test assertions | Already pinned across all edge functions [VERIFIED: codebase import] |
| @supabase/supabase-js | 2.81.1 | Service client for subscriptions, profiles, analysis_results tables | Already installed; used via getServiceClient() [VERIFIED: package.json] |
| Anthropic Claude API | HTTP v1 | LLM inference for career analysis | Direct fetch via _shared/anthropic.ts; no SDK [VERIFIED: codebase] |

### Supporting (consumed, not installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tier-config.ts | Phase 14 | TIER_MAX_TOKENS, getModel, getTimeout | Every AI call in the fan-out [VERIFIED: codebase] |
| tier-prompts.ts | Phase 14 | loadPromptVariant, registerFeaturePrompts | Prompt selection by tier [VERIFIED: codebase] |
| merit-gateway.ts | Phase 13 | withMerits, MERIT_SYSTEM_ENABLED, MeritRefundable | Pre-call deduction + refund [VERIFIED: codebase] |
| result-merger.ts | Phase 15 | applyTierShape | Output shaping (extended with career rules) [VERIFIED: codebase] |

**Installation:** No new packages needed. Phase 17 consumes only existing shared modules.

## Architecture Patterns

### System Architecture Diagram

```
Client Request (analyze-career)
        |
        v
[requireInternalOrUserAuth]  --> resolvedTier from profiles.subscription_tier
        |
        v
[MERIT_SYSTEM_ENABLED?] --false--> Legacy path (unchanged)
        |true
        v
[Input validation] -- bad input --> 400 (before withMerits)
        |
        v
[withMerits(ctx, 'career_compass', fn)]
    |-- rate limit check (60/hr pool)
    |-- check_and_deduct_merits RPC (3/2/3 by tier)
    |
    v
[compareRoles?] --yes--> handleMultiRoleComparison(resolvedTier) --> applyCareerTierShape --> Response
    |no
    v
[Resume/LinkedIn extraction] -- MeritRefundable on AI OCR fail
    |
    v
[classifyDomains(profileContent)] -- domain, roles, fields
    |
    v
[loadPromptVariant('career', resolvedTier, params)] -- FREE/PRO/ELITE system prompt
    |
    v
[Parallel Fan-Out]
    |-- Base call: core analysis (all tiers)
    |-- Elite-extras call: compensationIntelligence + smartApplicationStrategy (Elite only)
    |
    v
[Merge results + JSON repair]
    |
    v
[applyCareerTierShape(merged, resolvedTier)] -- whitelist strip + array slicing
    |
    v
[Save to analysis_results (Elite only per CC-04)] --> Response
```

### Recommended Project Structure

```
supabase/functions/
├── analyze-career/
│   └── index.ts                    # Modified: tier resolution, parallel fan-out, uses loader
├── _shared/
│   ├── career-prompts.ts           # NEW: FREE/PRO/ELITE/ELITE_EXTRAS prompt builders
│   ├── tier-prompts.ts             # Consumed: registerFeaturePrompts('career', ...)
│   ├── tier-config.ts              # Consumed: TIER_MAX_TOKENS, getModel, getTimeout
│   ├── merit-gateway.ts            # Consumed: withMerits, MeritRefundable
│   ├── result-merger.ts            # Modified: career-specific applyTierShape rules
│   └── tier-validation.test.ts     # Modified: add career TierValidationFixture
```

### Pattern 1: Parallel Fan-Out (from Phase 15 analyze-resume)

**What:** Split a single monolithic AI call into N parallel calls, each with its own maxTokens budget, merged after completion.
**When to use:** When different tiers need different output and isolating Elite-only content into a separate call avoids paying the cost for Free/Pro.

```typescript
// Source: analyze-resume/index.ts lines 46-136 [VERIFIED: codebase]
// Career Compass adaptation: 2 calls instead of 4

const CAREER_CALL_CONFIGS: Array<{
  callType: 'base' | 'elite-extras';
  maxTokensFree: number;
  maxTokensPro: number;
  maxTokensElite: number;
}> = [
  { callType: 'base',          maxTokensFree: 6000, maxTokensPro: 16000, maxTokensElite: 16000 },
  { callType: 'elite-extras',  maxTokensFree: 0,    maxTokensPro: 0,     maxTokensElite: 4000  },
];

// Boot-time invariant (D-18 pattern from Phase 15)
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as const;
  const sum = CAREER_CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[analyze-career] budget sum ${sum} > TIER_MAX_TOKENS[${tier}]`);
  }
}
```

### Pattern 2: Prompt Registration with Tier Loader (from Phase 14)

**What:** Register per-tier prompt builders at module load; the loader auto-prepends GLOBAL_AI_PRINCIPLES for Pro/Elite.
**When to use:** Every feature that needs tier-differentiated prompts.

```typescript
// Source: resume-prompts.ts lines 394-407 [VERIFIED: codebase]
// Career Compass equivalent in career-prompts.ts:

import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

interface CareerPromptParams {
  currentDate: string;
  domain: string;
  domainConfidence: number;
  domainEvidence: string[];
  secondaryDomains: Array<{ domain: string; confidence: number }>;
  uniqueRoles: string[];
  uniqueFields: string[];
  domainConfig: { roles: string[]; fields: string[] };
}

const CAREER_PROMPT_VARIANTS: PromptVariantBuilder<CareerPromptParams> = {
  free: (p) => buildFreeCareerPrompt(p),
  pro: (p) => buildProCareerPrompt(p),
  elite: (p) => buildEliteCareerPrompt(p),
};

registerFeaturePrompts('career', CAREER_PROMPT_VARIANTS);
```

### Pattern 3: Defense-in-Depth Output Shaping (from Phase 15)

**What:** Strip fields from AI output server-side using a per-tier whitelist, regardless of whether the prompt correctly omitted them.
**When to use:** Every tier-gated feature output.

```typescript
// Source: result-merger.ts lines 264-295 [VERIFIED: codebase]
// Career Compass extends applyTierShape with a feature discriminator:

export function applyCareerTierShape(
  data: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const whitelist = tier === 'elite' ? CAREER_ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? CAREER_PRO_ALLOWED_FIELDS
    : CAREER_FREE_ALLOWED_FIELDS;

  for (const key of Object.keys(data)) {
    if (!whitelist.has(key)) {
      delete data[key];
    }
  }
  // Array slicing for Free tier (CC-01)
  if (tier === 'free') {
    if (Array.isArray(data.careerFields)) data.careerFields = (data.careerFields as unknown[]).slice(0, 1);
    if (Array.isArray(data.surpriseFits)) data.surpriseFits = (data.surpriseFits as unknown[]).slice(0, 1);
    // roleRoadmaps: keep all roles but slice steps to first 2 phases each
    if (Array.isArray(data.roleRoadmaps)) {
      data.roleRoadmaps = (data.roleRoadmaps as any[]).map(rm => ({
        ...rm,
        steps: Array.isArray(rm.steps) ? rm.steps.slice(0, 2) : rm.steps,
      }));
    }
    // roleReadinessBreakdown: keep scorebox only
    if (data.roleReadinessBreakdown && typeof data.roleReadinessBreakdown === 'object') {
      const rrb = data.roleReadinessBreakdown as Record<string, unknown>;
      data.roleReadinessBreakdown = {
        overallScore: rrb.overallScore,
        targetRole: rrb.targetRole,
        readinessVerdict: rrb.readinessVerdict,
      };
    }
  }
}
```

### Anti-Patterns to Avoid
- **Trusting rawBody.tier:** The existing code at line 353 reads `tier: userTier` from the request body. This is a silent billing defect — any client can claim 'elite'. Must be replaced with `userContext.tier` from `requireInternalOrUserAuth`. [VERIFIED: codebase line 353]
- **Duplicating model routing inline:** Lines 357-359 duplicate what `getModel(tier, 'career')` provides. Use the centralized `tier-config.ts` module. [VERIFIED: codebase lines 357-359]
- **Hardcoded timeout values:** Line 882 uses `timeoutMs: 85000`. Replace with `getTimeout(resolvedTier)`. [VERIFIED: codebase line 882]
- **Nesting prompt text in index.ts:** Lines 795-851 contain ~70 lines of prompt construction inline. Extract to career-prompts.ts per D-04. [VERIFIED: codebase lines 795-851]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tier resolution | Custom subscriptions query | `userContext.tier` from `requireInternalOrUserAuth` | auth.ts already reads profiles.subscription_tier (line 88-103) and returns it on the UserContext [VERIFIED: codebase] |
| Prompt variant selection | Feature-specific if/else chains | `loadPromptVariant('career', tier, params)` | Phase 14 loader auto-prepends GLOBAL_AI_PRINCIPLES and is the single audit point [VERIFIED: codebase] |
| Model routing | Inline ternary `tier === 'free' ? Haiku : env` | `getModel(resolvedTier, 'career')` | tier-config.ts already has career-specific override (Haiku for all tiers) [VERIFIED: codebase line 77] |
| Timeout selection | Hardcoded `85000` | `getTimeout(resolvedTier)` | Spec values from BACK-12 in one place [VERIFIED: codebase] |
| Merit deduction | Custom RPC calls | `withMerits(ctx, 'career_compass', fn)` | Gateway owns refund flow, rate limiting, and transaction logging [VERIFIED: codebase] |
| Output field stripping | Manual delete statements | `applyCareerTierShape(data, tier)` via whitelist | Defense-in-depth pattern from Phase 15; single enforcement point [VERIFIED: codebase] |
| JSON repair | Custom regex fixes | `repairTruncatedJSON(text)` | Existing shared utility handles truncation patterns [VERIFIED: codebase] |

**Key insight:** Phase 17 should introduce almost zero new infrastructure. Every pattern it needs — tier resolution, prompt loading, parallel execution, output shaping, merit gating — already exists from Phases 13-15. The work is adaptation, not invention.

## Common Pitfalls

### Pitfall 1: Career Compass has a much larger JSON schema than Resume Analysis

**What goes wrong:** The career output has 20+ top-level fields (`careerDNA`, `whatYouHave`, `skillGaps`, `resumeImprovements`, `roleReadinessBreakdown`, `careerFields`, `surpriseFits`, `roles`, `roleRoadmaps`, `roadmap`, `compensationIntelligence`, `detectedDomain`, `domainEvidence`, etc.) vs resume's ~6 top-level fields. Getting the whitelist wrong silently drops data.
**Why it happens:** The career prompt template (line 849) defines the full schema inline as a JSON skeleton — it's easy to miss a field when building the whitelists.
**How to avoid:** Enumerate all fields from the existing prompt JSON skeleton at line 849. Cross-reference against CC-01/CC-02/CC-03/CC-04 specs. Unit test each tier's whitelist against a golden fixture.
**Warning signs:** Frontend renders empty sections for a tier that should have data; or Free users see fields they shouldn't.

### Pitfall 2: handleMultiRoleComparison bypass

**What goes wrong:** The multi-role comparison sub-path (line 248-340) is a separate function that constructs its own prompt and AI call. If not updated for tier-awareness, it continues using `rawBody.tier` and skips output shaping.
**Why it happens:** It's a separate code path that's easy to overlook. The Merit path (line 406) already wraps it inside `withMerits`, but passes `userTier` (client-supplied) to it (line 407).
**How to avoid:** Thread `resolvedTier` into `handleMultiRoleComparison`. Apply `applyCareerTierShape` to its output. Use `getModel(resolvedTier, 'career')` instead of inline model selection (line 250-252).
**Warning signs:** Multi-role comparison returns different data than main analysis for the same tier.

### Pitfall 3: Duplicated code between Merit and Legacy paths

**What goes wrong:** The `analyze-career` function has the entire analysis logic duplicated between the Merit path (lines 375-536) and the legacy path (lines 538-1063). Changes to prompt construction, model routing, and output shaping must be applied to both paths.
**Why it happens:** Phase 13's `MERIT_SYSTEM_ENABLED` branching pattern copies the feature body into `withMerits`. The legacy path must remain byte-identical for rollback safety (MIG-05).
**How to avoid:** For Phase 17, update the Merit path first. The legacy path MUST also get tier-config and applyTierShape changes — tier gating applies regardless of `MERIT_SYSTEM_ENABLED` (D-09 from CONTEXT.md says the flag gates billing only, not output shape). However, the legacy path can read tier from `userContext.tier` directly (same as Merit path).
**Warning signs:** Feature works correctly when `MERIT_SYSTEM_ENABLED=true` but not when `false`.

### Pitfall 4: salaryProgression is not a field in the current schema

**What goes wrong:** CC-03 requires Pro to see `salaryProgression`. But the current career prompt (line 849) does not include a field called `salaryProgression`. The closest are `compensationIntelligence.salaryBands` (Elite) and individual `careerFields[].salaryRange` (all tiers).
**Why it happens:** The spec uses `salaryProgression` as a concept; the implementation schema uses different field names.
**How to avoid:** The Pro prompt should instruct the model to produce a `salaryProgression` field (or reuse `compensationIntelligence.salaryBands` at Pro level with a limited subset). The planner must decide: introduce a new `salaryProgression` top-level field in the Pro prompt, or promote `careerFields[].salaryRange` as the Pro salary data. The whitelist must match whatever the prompt produces.
**Warning signs:** Pro users expect salary data and see nothing.

### Pitfall 5: Elite dashboard save conditional

**What goes wrong:** CC-04 says Elite results are "saved to dashboard." The current code saves to `analysis_results` for ALL tiers (line 1005). Phase 17 must ensure the save still happens for all tiers (since results are useful for history) but the spec says "saved to dashboard" only for Elite.
**Why it happens:** Ambiguity in CC-04 — does "saved to dashboard" mean only Elite saves, or all tiers save but only Elite sees it on dashboard?
**How to avoid:** Keep the save for all tiers (existing behavior). The dashboard visibility is a frontend concern (Phase 20) — Phase 17 just ensures the shaped output is what gets saved. If Free's shaped output is saved, that's correct — Free users see their results immediately but the saved record has the Free-shaped data.
**Warning signs:** Missing analysis records for non-Elite users.

## Code Examples

### Career JSON Schema Field Inventory (from prompt at line 849)

All fields produced by the current career prompt, with tier classification:

```typescript
// Source: analyze-career/index.ts line 849 [VERIFIED: codebase]

// Always present (metadata, not AI-generated):
// detectedDomain, domainEvidence

// Core fields (all tiers):
const CAREER_CORE_FIELDS = [
  'detectedDomain',         // Metadata from classifyDomains
  'domainEvidence',         // Metadata from classifyDomains
  'roleReadinessScore',     // Top-level numeric score
  'targetRole',             // Top-level string
  'careerDNA',              // CC-01: full for all tiers
  'whatYouHave',            // Array of strings
] as const;

// Free tier fields (CC-01):
const CAREER_FREE_FIELDS = [
  ...CAREER_CORE_FIELDS,
  'careerFields',            // CC-01: sliced to first entry
  'roleReadinessBreakdown',  // CC-01: scorebox only (overallScore, targetRole, readinessVerdict)
  'roleRoadmaps',            // CC-01: steps sliced to first 2 phases
  'surpriseFits',            // CC-01: sliced to first entry
  'roles',                   // Top-level roles array (score + description per role)
  'roadmap',                 // General roadmap categories
] as const;

// Pro additions (CC-03):
const CAREER_PRO_ADDITIONS = [
  'skillGaps',               // CC-02 omits for Free, CC-03 includes
  'resumeImprovements',      // CC-02 omits for Free, CC-03 includes
  'salaryProgression',       // CC-03 explicitly includes (NEW field for Pro)
  // roleReadinessBreakdown: full (skillAssessments, strengths, gaps, etc.)
  // roleRoadmaps: all 5 phases
  // careerFields: all entries
  // surpriseFits: all entries
] as const;

// Elite additions (CC-04):
const CAREER_ELITE_ADDITIONS = [
  'compensationIntelligence', // CC-04: salaryBands, roleTransitionROI, applicationStrategy, fiveYearEarnings
  'smartApplicationStrategy', // CC-04: renamed from applicationStrategy? Or separate field?
] as const;
```

### Tier Resolution Pattern (from Phase 15 analyze-resume)

```typescript
// Source: analyze-resume/index.ts lines 234-244 [VERIFIED: codebase]
// Exact pattern to replicate in analyze-career:

const resolvedTier: 'free' | 'pro' | 'elite' =
  (userContext?.tier === 'pro' || userContext?.tier === 'elite')
    ? userContext.tier as 'free' | 'pro' | 'elite'
    : 'free';
const isElite = resolvedTier === 'elite';
if (!userContext?.tier || (userContext.tier !== 'free' && userContext.tier !== 'pro' && userContext.tier !== 'elite')) {
  log.warn('subscription-missing-or-invalid', { userId: userContext?.userId, rawTier: userContext?.tier });
}
```

### Merit Cost Configuration

```typescript
// Source: Phase 17 CONTEXT.md D-12; spec §4.3 [CITED: CONTEXT.md]
const MERIT_COST: Record<string, number> = { free: 3, pro: 2, elite: 3 };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single monolithic AI call with retry loop | Parallel fan-out (2+ calls) with conditional Elite extras | Phase 15 (2026-04) | Isolates Elite cost; Free/Pro latency unaffected |
| Client-supplied `rawBody.tier` | Server-resolved `userContext.tier` from profiles.subscription_tier | Phase 15 (2026-04) | Eliminates billing defect |
| Inline prompt construction in handler | Extracted prompt modules registered with shared loader | Phase 14 (2026-04) | Audit-friendly; auto GLOBAL_AI_PRINCIPLES prepend |
| Hardcoded model/timeout values | Centralized tier-config.ts with getModel/getTimeout | Phase 14 (2026-04) | Single enforcement point for cost ceiling |
| No output shaping | Per-tier whitelist strip in applyTierShape | Phase 15 (2026-04) | Defense-in-depth against prompt leaks |

**Deprecated/outdated:**
- `rawBody.tier` / `userTier` from request body: security defect, replaced by `userContext.tier` [VERIFIED: codebase line 353]
- Inline `ANTHROPIC_MODEL_TEXT = tier === 'free' ? haiku : env` pattern: replaced by `getModel(tier, feature)` [VERIFIED: codebase line 357-359]
- Hardcoded `timeoutMs: 85000`: replaced by `getTimeout(tier)` [VERIFIED: codebase line 882]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `salaryProgression` needs to be introduced as a new Pro-level field since the current schema does not have it by that name | Pitfalls / Code Examples | Pro users may not see salary data; or the wrong field gets whitelisted |
| A2 | `smartApplicationStrategy` in CC-04 maps to `compensationIntelligence.applicationStrategy` in the current prompt schema | Code Examples | Elite field may not render if wrong key is used |
| A3 | `careerFields[].salaryRange` is sufficient as Free/Pro salary info (the field already exists in every careerField entry) | Pitfalls | May need a dedicated salaryProgression field construction |
| A4 | Multi-role comparison output structure (`multiRoleReadiness` array) can reuse the same applyCareerTierShape by applying it to each element | Pitfalls | If the multi-role structure is fundamentally different, shaping logic won't work |
| A5 | The legacy path (lines 538-1063) also needs tier-config and applyTierShape, since D-10 says tier gating applies regardless of MERIT_SYSTEM_ENABLED | Pitfalls | Legacy path would produce unshaped output |

## Open Questions (RESOLVED)

1. **`salaryProgression` field mapping**
   - What we know: CC-03 requires Pro to see `salaryProgression`. The current prompt has `compensationIntelligence.salaryBands` (Elite-only) and `careerFields[].salaryRange` (all tiers).
   - What's unclear: Whether `salaryProgression` is a new top-level field that the Pro prompt should produce, or if it maps to existing salary data in `careerFields`.
   - RESOLVED: Introduce a new `salaryProgression` field in the Pro and Elite prompts (array of role-based salary ranges). This field is cheaper to produce than full `compensationIntelligence` and satisfies CC-03. The Free prompt omits it. The shaper strips it for Free.

2. **`smartApplicationStrategy` vs `compensationIntelligence.applicationStrategy`**
   - What we know: CC-04 lists `smartApplicationStrategy` as a separate Elite field. The current prompt nests it as `compensationIntelligence.applicationStrategy`.
   - What's unclear: Whether CC-04's `smartApplicationStrategy` is a top-level field or nested inside `compensationIntelligence`.
   - RESOLVED: Keep both fields nested under `compensationIntelligence` for the base-call schema, and produce a separate top-level `smartApplicationStrategy` in the elite-extras call. The frontend already accesses `(analysis as any).compensationIntelligence?.applicationStrategy` (line 1938 in CareerCompass.tsx). The spec names them separately, so the elite-extras call should produce both as top-level fields: `compensationIntelligence` (salary bands, ROI, 5-year projection) and `smartApplicationStrategy` (application triage).

3. **Budget split between base call and elite-extras call**
   - What we know: Total Elite budget is 20000. The elite-extras call carries `compensationIntelligence` + `smartApplicationStrategy` which currently use ~800 tokens (4 salary bands, 3 role transitions, 3-5 application entries, 2 projection strings).
   - What's unclear: Whether 4000 tokens is correct for elite-extras.
   - RESOLVED: Start with `base: 16000, elite-extras: 4000` (same as Phase 15's approach). Measure after first implementation. The 4000 budget is generous for 2 narrative fields.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test (edge functions) + Vitest 1.6.1 (frontend) |
| Config file | `supabase/functions/deno.json` (Deno), `vitest.config.ts` (Vitest) |
| Quick run command | `deno test supabase/functions/_shared/tier-validation.test.ts --allow-net --allow-read --allow-env` |
| Full suite command | `.\scripts\run-edge-tests.ps1` (all Deno tests) + `npm run test` (Vitest) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CC-01 | Free output shape: full careerDNA, 1 careerField, scorebox only, 2 roadmap phases, 1 surpriseFit | unit (applyCareerTierShape) | `deno test supabase/functions/_shared/career-shape.test.ts -x` | Wave 0 |
| CC-02 | Free output omits: skillAssessments detail, skillGaps, resumeImprovements, salaryProgression, compensationIntelligence, smartApplicationStrategy | unit (whitelist) | Same as CC-01 | Wave 0 |
| CC-03 | Pro output: all standard fields, 5 roadmap phases, full roleReadinessBreakdown, salaryProgression; no compensation/strategy | unit | Same as CC-01 | Wave 0 |
| CC-04 | Elite output: all Pro + compensationIntelligence + smartApplicationStrategy | unit | Same as CC-01 | Wave 0 |
| CC-05 | maxTokens caps: Free=6000, Pro=16000, Elite=20000 | unit (boot-time assertion) | Module load throws if violated | Wave 0 |
| BACK-10 | Modified analyze-career with Merit check, prompt variant, per-tier maxTokens | integration (manual, live) | `RUN_TIER_VALIDATION=1 deno test ...tier-validation.test.ts` | Extend existing |

### Sampling Rate

- **Per task commit:** `deno test supabase/functions/_shared/career-shape.test.ts --allow-read --allow-env` (unit tests for shaper)
- **Per wave merge:** `.\scripts\run-edge-tests.ps1` (full Deno suite)
- **Phase gate:** Full suite green + manual `RUN_TIER_VALIDATION=1` harness run before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `supabase/functions/_shared/career-shape.test.ts` — unit tests for `applyCareerTierShape` with golden fixtures for all 3 tiers (CC-01 through CC-04)
- [ ] `supabase/functions/_shared/tier-validation.test.ts` — extend with `career` TierValidationFixture entry for live TEST-09/10 validation
- [ ] Golden fixture: a representative career analysis JSON output with all fields populated, used as input to shaper tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireInternalOrUserAuth` — already in place [VERIFIED: codebase line 362] |
| V3 Session Management | no | Supabase Auth manages sessions |
| V4 Access Control | yes | Server-side tier resolution from profiles.subscription_tier; never trust client tier [VERIFIED: Phase 15 pattern] |
| V5 Input Validation | yes | Existing input validation (resumeFilePath, linkedinPdfContent, linkedinUrl checks); prompt sanitization via prompt-sanitizer.ts |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client claims elite tier to get full output | Elevation of Privilege | Server-side tier from profiles.subscription_tier via auth.ts [VERIFIED] |
| Prompt injection to leak locked fields | Information Disclosure | Defense-in-depth: applyTierShape whitelist strips leaked fields server-side [VERIFIED: Phase 15 pattern] |
| Replay attack with modified tier in body | Tampering | Ignore rawBody.tier entirely; use JWT-authenticated user context [VERIFIED: Phase 15 D-01] |
| AI model returns fields not in prompt | Information Disclosure | Server-side whitelist enforcement; fields not in whitelist are deleted [VERIFIED: result-merger.ts] |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/analyze-career/index.ts` — full source read (1063 lines), all line references verified
- `supabase/functions/_shared/result-merger.ts` — full source read (353 lines), applyTierShape pattern verified
- `supabase/functions/_shared/tier-config.ts` — full source read (125 lines), TIER_MAX_TOKENS and getModel verified
- `supabase/functions/_shared/tier-prompts.ts` — full source read (111 lines), loader API verified
- `supabase/functions/_shared/merit-gateway.ts` — full source read (265 lines), withMerits signature verified
- `supabase/functions/_shared/auth.ts` — tier resolution from profiles.subscription_tier verified at line 88-103
- `supabase/functions/_shared/resume-prompts.ts` — Phase 14 registration pattern verified at line 407
- `supabase/functions/analyze-resume/index.ts` — Phase 15 pattern (CALL_CONFIGS, executeParallelCalls, resolvedTier) verified
- `.planning/phases/17-career-compass-gating/17-CONTEXT.md` — all decisions D-01 through D-18
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — precedent decisions D-01 through D-19
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — infrastructure decisions
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — gateway and flag decisions
- `.planning/REQUIREMENTS.md` — CC-01 through CC-05, BACK-10 requirements text
- `src/pages/CareerCompass.tsx` — frontend consumption of career analysis output verified

### Secondary (MEDIUM confidence)
- Career Compass JSON schema: derived from prompt template at line 849 of analyze-career/index.ts

### Tertiary (LOW confidence)
- None. All claims verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries/modules already exist and are verified in codebase
- Architecture: HIGH — follows established Phase 15 pattern exactly; all integration points verified
- Pitfalls: HIGH — identified from direct code reading of all 1063 lines of analyze-career
- Whitelists: MEDIUM — CC-01/CC-02/CC-03/CC-04 field mapping to actual JSON schema requires careful cross-referencing (see Open Questions)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable — internal codebase patterns, no external API changes expected)
