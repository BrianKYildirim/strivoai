# Phase 18: recruiting-lens-gating - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 4 files to modify, 0 files to create
**Analogs found:** 4 / 4

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/recruiting-lens-merger.ts` | service | transform | `supabase/functions/_shared/result-merger.ts` | exact |
| `supabase/functions/_shared/recruiting-lens-prompts.ts` | utility | transform | `supabase/functions/_shared/resume-prompts.ts` | exact |
| `supabase/functions/recruiting-lens/index.ts` | controller | request-response | `supabase/functions/analyze-resume/index.ts` | exact |
| `src/pages/RecruitingLens.tsx` | component | request-response | `src/pages/RecruitingLens.tsx` (self -- results view section) | role-match |

## Pattern Assignments

### `supabase/functions/_shared/recruiting-lens-merger.ts` (service, transform)

**Analog:** `supabase/functions/_shared/result-merger.ts` (Phase 15 applyTierShape)

**Whitelist constant pattern** (result-merger.ts lines 55-81):
```typescript
// ── Per-tier output whitelists (Phase 15 — D-15) ────────────────────────────
// Defense-in-depth: even if the prompt leaks locked fields, applyTierShape strips them.
// Fields not in the whitelist are deleted from the merged object.
// CORE_FIELDS are always kept regardless of tier.
const CORE_FIELDS = ['overallScore', '_mergeSource'] as const;

const FREE_ALLOWED_FIELDS = new Set<string>([
  ...CORE_FIELDS,
  'executiveSummary',     // RES-01
  'resumeSignal',         // RES-01 — emitted by Free prompt variant
  'strengths',            // RES-01 — full array
  'priorityImprovements', // RES-01 — capped to 1 inside applyTierShape
  'criterionFeedback',    // RES-01 — 11 entries, C2-C11 stripped to {id, label, weight, score}
]);

const PRO_ADDITIONS = [
  'rewriteSuggestions',     // RES-03
  'industryGuess',          // RES-03
  'suggestedTargetRoles',   // RES-03
  'recommendedKeywords',    // RES-03
] as const;
const PRO_ALLOWED_FIELDS = new Set<string>([...FREE_ALLOWED_FIELDS, ...PRO_ADDITIONS]);

const ELITE_ADDITIONS = [
  'eliteInsights',  // RES-04 — nested object with 6 sub-fields
] as const;
const ELITE_ALLOWED_FIELDS = new Set<string>([...PRO_ALLOWED_FIELDS, ...ELITE_ADDITIONS]);
```

**Core applyTierShape function pattern** (result-merger.ts lines 264-295):
```typescript
export function applyTierShape(
  merged: Record<string, unknown>,
  tier: 'free' | 'pro' | 'elite',
): void {
  const whitelist = tier === 'elite' ? ELITE_ALLOWED_FIELDS
    : tier === 'pro' ? PRO_ALLOWED_FIELDS
    : FREE_ALLOWED_FIELDS;

  // Strip keys not in whitelist
  for (const key of Object.keys(merged)) {
    if (!whitelist.has(key)) {
      delete merged[key];
    }
  }

  // Cap priorityImprovements per tier (D-13: relocated from handler)
  // Spec §4.1: free=1, pro=5, elite=7
  const IMPROVEMENT_CAPS: Record<string, number> = { free: 1, pro: 5, elite: 7 };
  if (Array.isArray(merged.priorityImprovements)) {
    merged.priorityImprovements = (merged.priorityImprovements as unknown[]).slice(0, IMPROVEMENT_CAPS[tier]);
  }

  // Free tier: strip feedback from C2-C11 (D-14)
  if (tier === 'free' && Array.isArray(merged.criterionFeedback)) {
    merged.criterionFeedback = (merged.criterionFeedback as Record<string, unknown>[]).map((c, i) => {
      if (i === 0) return c;
      return { id: c.id, label: c.label, weight: c.weight, score: c.score };
    });
  }
}
```

**Integration into merge function** (result-merger.ts lines 346-352):
```typescript
  // Fill defaults and add metadata
  fillDefaults(merged, tier === 'elite');

  // Tier-aware output shaping (Phase 15 — D-11/D-12)
  applyTierShape(merged, tier);

  return { ok: true, data: merged };
```

**Existing merge function to modify** (recruiting-lens-merger.ts lines 236-274):
```typescript
export function mergeRecruitingLensResults(
  results: Array<{ callType: string; text: string }>,
): { output: RecruitingLensOutput; warnings: string[] } {
  // ... parse and merge logic ...
  return {
    output: merged as RecruitingLensOutput,
    warnings: allWarnings,
  };
}
```

**Key adaptation notes:**
- Recruiting Lens has NO Free tier (Free users are blocked at handler level). Whitelist only needs `PRO_ALLOWED_FIELDS` and `ELITE_ALLOWED_FIELDS`.
- Recruiting Lens shaper must also strip sub-fields within objects: `subScores.*.rationale` for non-allowed sub-scores, `topGaps.*.howItShowsUp` and `topGaps.*.fixPriority`.
- Recruiting Lens shaper must cap arrays: `topGaps` to 2, `resumeEdits` to 2 for Pro.
- The actual field names from `RecruitingLensOutput` interface (lines 24-87) are: `preAnalysis`, `overallMatch`, `subScores`, `recruiterVerdict`, `scoreRationale`, `topGaps`, `roadmap`, `resumeEdits`, `linkedinImprovements`, `strategicAdvice`, `keywords`, `quickFixes`.

---

### `supabase/functions/_shared/recruiting-lens-prompts.ts` (utility, transform)

**Analog:** `supabase/functions/_shared/resume-prompts.ts` (Phase 14 registration)

**Feature registration side-effect pattern** (resume-prompts.ts lines 206-210, 395-407):
```typescript
import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

export const RESUME_PROMPT_VARIANTS: PromptVariantBuilder<PromptParams> = {
  free: buildFreeResumePrompt,
  pro: buildProResumePrompt,
  elite: buildEliteResumePrompt,
};

// Feature registration (module-load side effect — GATE-01)
registerFeaturePrompts('resume', RESUME_PROMPT_VARIANTS);
```

**Existing per-call suffix with tier conditional pattern** (recruiting-lens-prompts.ts lines 172-221):
```typescript
function buildCall3Suffix(isElite: boolean): string {
  const linkedinSection = `
  "linkedinImprovements": [
    {
      "area": "headline|summary|experience|skills|recommendations|other",
      "suggestion": "specific change to make on LinkedIn — reference the JD"
    }
  ],`;

  const linkedinNote = isElite
    ? 'The linkedinImprovements field is REQUIRED when LinkedIn text is provided, optional otherwise.'
    : 'The linkedinImprovements field is optional — include only if LinkedIn text was provided.';
  // ... rest of suffix ...
}
```

**System block construction pattern** (recruiting-lens-prompts.ts lines 231-254):
```typescript
export function buildRecruitingLensSystemBlock(
  callType: RecruitingLensCallType,
  params: RecruitingLensPromptParams,
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  const sharedPrefix = buildRecruitingLensSharedPrefix(params);

  let suffix: string;
  switch (callType) {
    case 'rl-call-1':
      suffix = buildCall1Suffix();
      break;
    case 'rl-call-2':
      suffix = buildCall2Suffix();
      break;
    case 'rl-call-3':
      suffix = buildCall3Suffix(params.tier === 'elite');
      break;
  }

  return [
    { type: 'text', text: sharedPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: suffix },
  ];
}
```

**Key adaptation notes:**
- Change all 3 suffix functions from `isElite: boolean` to `tier: 'pro' | 'elite'` parameter.
- For Pro tier, conditionally omit field schemas from the JSON output instructions: `scoreRationale` (call-1), `roadmap` and `strategicAdvice` (call-2), `linkedinImprovements`, `keywords`, and `quickFixes` (call-3).
- The shared prefix `buildRecruitingLensSharedPrefix` already accepts `tier` in `params` and conditionally adds Elite enhancements. Extend with Pro-specific instructions to explicitly tell the model to omit locked fields.
- Register with `registerFeaturePrompts('recruiting', ...)` at module load time. Free variant throws since Free users are blocked.

---

### `supabase/functions/recruiting-lens/index.ts` (controller, request-response)

**Analog:** `supabase/functions/analyze-resume/index.ts` (Phase 15 tier-gated handler)

**Imports pattern** (analyze-resume/index.ts lines 1-14):
```typescript
import { mergeAndValidateResults, applyTierShape } from '../_shared/result-merger.ts';
import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';
import { TIER_MAX_TOKENS, getModel, getTimeout, type Tier } from '../_shared/tier-config.ts';
```

**CALL_CONFIGS with 3-tier budget pattern** (analyze-resume/index.ts lines 46-51):
```typescript
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'summary',    maxTokensFree: 2400, maxTokensPro: 6400, maxTokensElite: 6000 },
  { callType: 'elite-extras', maxTokensFree: 0, maxTokensPro: 0, maxTokensElite: 4000 },
];
```

**Boot-time budget assertion pattern** (analyze-resume/index.ts lines 53-60):
```typescript
// -- Boot-time invariant: per-tier budgets must not exceed TIER_MAX_TOKENS (D-18) --
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensFree' | 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[analyze-resume] CALL_CONFIGS sum ${sum} exceeds TIER_MAX_TOKENS[${tier}] (${TIER_MAX_TOKENS[tier]})`);
  }
}
```

**Merit cost constant pattern** (analyze-resume/index.ts line 63):
```typescript
const MERIT_COST: Record<string, number> = { free: 3, pro: 2, elite: 3 };
```

**Tier resolution pattern** (recruiting-lens/index.ts lines 175-182 -- current):
```typescript
if (userContext!.tier === 'free') {
  return new Response(
    JSON.stringify({ error: 'pro_or_elite_required', message: 'Recruiting Lens requires a Pro or Elite subscription.' }),
    { status: 403, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
const isElite = userContext!.tier === 'elite';
```

**Key adaptation notes:**
- Replace `const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'` with `getModel(tier, 'recruiting')` from tier-config.ts. Register a `FEATURE_MODEL_OVERRIDES` entry for `'recruiting'` if Haiku should be used for all tiers.
- Replace `const isElite = userContext!.tier === 'elite'` with `const resolvedTier = userContext!.tier as 'pro' | 'elite'` (safe because Free is already gated above).
- Update CALL_CONFIGS Pro budgets: current Pro total is 16,000 but spec requires 8,000. Suggested split: ~3000/2500/2500.
- Add boot-time budget assertion for `'pro'` and `'elite'` (not `'free'` since Free users are blocked).
- Replace `isElite ? cfg.maxTokensElite : cfg.maxTokensPro` with tier-keyed lookup.
- Replace `isElite ? 155000 : 125000` timeout with `getTimeout(resolvedTier)` from tier-config.ts.
- Pass `tier` into `mergeRecruitingLensResults` so it can call `applyRecruitingLensTierShape` internally.
- Keep `if (tier === 'elite')` guard for persistence (D-14, line 242/345).

---

### `src/pages/RecruitingLens.tsx` (component, request-response)

**Analog:** Self (existing `RecruitingLensResultsView` at lines 630-981) + `src/components/LockedSection.tsx` and `src/components/LockedListItem.tsx` (Phase 14)

**LockedSection props API** (LockedSection.tsx lines 7-13):
```typescript
export interface LockedSectionProps {
  title: string;
  teaser: string;
  requiredTier: 'pro' | 'elite';
  ctaHref?: string;
  className?: string;
}
```

**LockedSection usage pattern** (inline within results view):
```typescript
<LockedSection
  title="Score Rationale"
  teaser="Unlock detailed category-by-category analysis with Elite."
  requiredTier="elite"
/>
```

**LockedListItem props API** (LockedListItem.tsx lines 5-13):
```typescript
export interface LockedListItemProps {
  index: number;
  total: number;
  label: string;
  requiredTier: 'pro' | 'elite';
  teaser?: string;
  ctaHref?: string;
  className?: string;
}
```

**LockedListItem usage pattern** (inline within capped arrays):
```typescript
{/* Show first 2 items as real content */}
{result.topGaps.slice(0, 2).map((gap, i) => (
  <Card key={i}>{ /* real gap card */ }</Card>
))}
{/* Show remaining as locked items */}
{Array.from({ length: Math.max(0, totalGaps - 2) }).map((_, i) => (
  <LockedListItem
    key={`locked-${i}`}
    index={i + 3}
    total={totalGaps}
    label="Gap"
    requiredTier="elite"
    teaser="Upgrade to Elite to see all gaps with fix priorities."
  />
))}
```

**Inline LockedSection for sub-fields within a card** (novel pattern for gap cards):
```typescript
{/* Inside a gap card, after whyItMatters */}
<LockedSection
  title="How It Shows Up"
  teaser="Upgrade to Elite for full gap analysis."
  requiredTier="elite"
  className="mt-2"
/>
<LockedSection
  title="Fix Priority"
  teaser="Upgrade to Elite to see fix priorities."
  requiredTier="elite"
  className="mt-2"
/>
```

**Existing sub-scores rendering** (RecruitingLens.tsx lines 732-763):
```typescript
{result.subScores && (
  <div>
    <h3 className="text-lg font-semibold text-foreground mb-4">Score Breakdown</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {(Object.keys(SUB_SCORE_LABELS) as Array<keyof typeof SUB_SCORE_LABELS>).map((key) => {
        const sub = result.subScores[key];
        if (!sub) return null;
        return (
          <Card key={key} className="border border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{SUB_SCORE_LABELS[key]}</span>
                <span className={`text-lg font-bold ${scoreColor(sub.score)}`}>{sub.score}</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                <motion.div /* ... progress bar ... */ />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{sub.rationale}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  </div>
)}
```

**ProFeatureGate for Free users** (RecruitingLens.tsx lines 393-410):
```typescript
if (tier === 'free') {
  return (
    <div className="container mx-auto px-4 pt-8 pb-16">
      <ProFeatureGate
        featureName="Recruiting Lens"
        featureIcon={<Target className="h-8 w-8" />}
        featureColor="hsl(var(--primary))"
        description="See how recruiters evaluate your profile against any job posting."
        benefits={[
          "Recruiter-grade match score",
          "Gap analysis with fix priority",
          "Ready-to-paste resume bullet rewrites",
          "Strategic action roadmap",
        ]}
      />
    </div>
  );
}
```

**Key adaptation notes:**
- The `RecruitingLensResultsView` component needs to accept `tier` as a prop.
- For Pro users (`tier === 'pro'`): render `overallMatch`, `recruiterVerdict`, 2 sub-scores (experienceAlignment, skillAlignment) with score only (no rationale), first 2 `topGaps` with `whyItMatters` but LockedSection for `howItShowsUp`/`fixPriority`, first 2 `resumeEdits`, and `preAnalysis`. All other sections get `<LockedSection requiredTier="elite">`.
- For Elite users: render everything as currently done (no change).
- The `_meta.totalGaps` and `_meta.totalEdits` fields from backend response inform `<LockedListItem>` total counts.
- The existing `result.topGaps` rendering at lines 766-798 needs to be split: first 2 items show real content (with locked sub-fields for Pro), remaining show `<LockedListItem>`.
- Need to add `import { LockedSection } from '@/components/LockedSection'` and `import { LockedListItem } from '@/components/LockedListItem'`.
- The `RecruitingLensResult` type interface (lines 49-106) may need a `_meta?: { totalGaps: number; totalEdits: number }` field.
- Auto-resume detection (lines 213-275) is already implemented and needs NO changes per Research Pitfall 5.

---

## Shared Patterns

### Authentication
**Source:** `supabase/functions/_shared/auth.ts` (requireAuth)
**Apply to:** `recruiting-lens/index.ts` (already imported and used)
```typescript
const userContext = await requireAuth(req, { type: 'user' });
```
No changes needed -- already in place.

### Tier Resolution (Server-Side)
**Source:** `supabase/functions/analyze-resume/index.ts` line 14, `supabase/functions/_shared/tier-config.ts`
**Apply to:** `recruiting-lens/index.ts`
```typescript
import { TIER_MAX_TOKENS, getModel, getTimeout, type Tier } from '../_shared/tier-config.ts';

// After Free gate (line 175-179):
const resolvedTier = userContext!.tier as 'pro' | 'elite';
```

### Merit Gateway
**Source:** `supabase/functions/_shared/merit-gateway.ts`
**Apply to:** `recruiting-lens/index.ts` (already wired at line 195-264)
```typescript
if (MERIT_SYSTEM_ENABLED && userContext) {
  const gated = await withMerits(
    { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
    'recruiting_lens',
    async (_txId) => {
      // ... analysis pipeline ...
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```
Existing wiring is correct. Update Merit cost values to `{ pro: 8, elite: 5 }` per D-15.

### Error Handling
**Source:** `supabase/functions/recruiting-lens/index.ts` lines 383-391
**Apply to:** No changes needed -- existing pattern is correct
```typescript
} catch (err) {
  log.error('Unhandled error', { error: (err as Error).message, stack: (err as Error).stack });
  return new Response(
    JSON.stringify({ error: 'internal_error', message: 'An unexpected error occurred. Please try again.' }),
    { status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' } },
  );
}
```

### Prompt Loader Registration
**Source:** `supabase/functions/_shared/tier-prompts.ts` (registerFeaturePrompts, loadPromptVariant)
**Apply to:** `supabase/functions/_shared/recruiting-lens-prompts.ts`
```typescript
import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

const RECRUITING_LENS_VARIANTS: PromptVariantBuilder<RecruitingLensPromptParams> = {
  free: () => { throw new Error('Recruiting Lens is not available for Free tier'); },
  pro: (params) => buildRecruitingLensSharedPrefix({ ...params, tier: 'pro' }),
  elite: (params) => buildRecruitingLensSharedPrefix({ ...params, tier: 'elite' }),
};

registerFeaturePrompts('recruiting', RECRUITING_LENS_VARIANTS);
```

### Test Pattern for applyTierShape
**Source:** `supabase/functions/_shared/result-merger.test.ts` lines 387-555
**Apply to:** New tests in `supabase/functions/_shared/recruiting-lens-merger.test.ts`
```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

function makeFullRecruitingLensOutput(): Record<string, unknown> {
  return {
    preAnalysis: { jdKeywords: [...], dealBreakers: [...], industry: '...', culture: '...' },
    overallMatch: { score: 72, label: 'Moderate Match', summary: '...' },
    // ... all fields ...
  };
}

Deno.test("applyRecruitingLensTierShape pro: strips Elite-only fields", () => {
  const merged = makeFullRecruitingLensOutput();
  applyRecruitingLensTierShape(merged as RecruitingLensOutput, 'pro');

  // Pro keeps: preAnalysis, overallMatch, subScores (partial), recruiterVerdict, topGaps (2), resumeEdits (2)
  assertEquals(merged.preAnalysis !== undefined, true);
  assertEquals(merged.overallMatch !== undefined, true);

  // Pro strips: scoreRationale, roadmap, strategicAdvice, keywords, quickFixes, linkedinImprovements
  assertEquals(merged.scoreRationale, undefined);
  assertEquals(merged.roadmap, undefined);
  assertEquals(merged.strategicAdvice, undefined);
  assertEquals(merged.keywords, undefined);
  assertEquals(merged.quickFixes, undefined);
  assertEquals(merged.linkedinImprovements, undefined);
});

Deno.test("applyRecruitingLensTierShape elite: no-op", () => {
  const merged = makeFullRecruitingLensOutput();
  const keysBefore = Object.keys(merged).sort();
  applyRecruitingLensTierShape(merged as RecruitingLensOutput, 'elite');
  assertEquals(Object.keys(merged).sort(), keysBefore);
});
```

---

## No Analog Found

No files are without an analog -- all 4 modified files have exact or role-match analogs in the existing codebase. The Phase 15 resume analysis gating pattern applies directly to Phase 18 recruiting lens gating.

## Key Field Name Mapping (Critical for Implementation)

The CONTEXT.md spec uses human-readable names that differ from the actual TypeScript field names. Implementors MUST use the actual field names:

| CONTEXT.md Name | Actual TypeScript Field | Call Owner |
|-----------------|------------------------|------------|
| `quickStrategicFixes` | `quickFixes` (string[]) | rl-call-3 |
| `finalAdvice` | `strategicAdvice` ({applyNow, summary, biggestScoreMover}) | rl-call-2 |
| `matchedKeywords` | `keywords.matched` (string[]) | rl-call-3 |
| `missingKeywords` | `keywords.missing` (string[]) | rl-call-3 |
| `linkedinImprovements` | `linkedinImprovements` (correct) | rl-call-3 |
| `roadmap` | `roadmap` (correct) | rl-call-2 |
| `scoreRationale` | `scoreRationale` (correct) | rl-call-1 |

## Key Namespace Distinction

Two different registries use different feature key formats:

| Registry | Key to Use | Example |
|----------|-----------|---------|
| Merit gateway (`withMerits`) | `'recruiting_lens'` (snake_case) | `withMerits(ctx, 'recruiting_lens', fn)` |
| Tier-prompts (`loadPromptVariant`, `getModel`, `getTimeout`) | `'recruiting'` (short) | `getModel(tier, 'recruiting')` |

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/functions/_shared/`, `src/pages/`, `src/components/`
**Files scanned:** 14
**Pattern extraction date:** 2026-04-17
