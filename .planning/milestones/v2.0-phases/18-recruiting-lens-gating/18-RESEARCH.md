# Phase 18: recruiting-lens-gating - Research

**Researched:** 2026-04-17
**Domain:** Tier-gated AI output shaping (Supabase Edge Functions + React frontend)
**Confidence:** HIGH

## Summary

Phase 18 applies the tier-gating pattern established in Phases 14-15 to the Recruiting Lens feature. The codebase already contains all infrastructure needed: `withMerits` (Phase 13), `loadPromptVariant` / `registerFeaturePrompts` (Phase 14), `<LockedSection>` / `<LockedListItem>` (Phase 14), `applyTierShape` pattern in `result-merger.ts` (Phase 15), and `TIER_MAX_TOKENS` in `tier-config.ts`. The Recruiting Lens handler at `recruiting-lens/index.ts` already has the Merit gateway branch wired (line 195), a Free gate (line 175), and an `isElite` boolean (line 181). The frontend at `RecruitingLens.tsx` already renders `<ProFeatureGate>` for Free users and has auto-resume detection via `analysis_results` and `resumes` tables.

The primary work is: (1) refactor `recruiting-lens-prompts.ts` to accept a `tier` parameter and register with `loadPromptVariant`, (2) add `applyRecruitingLensTierShape` to `recruiting-lens-merger.ts`, (3) update `CALL_CONFIGS` to respect Pro=8000 / Elite=20000 maxTokens caps, (4) update `RecruitingLensResultsView` in the frontend to conditionally render `<LockedSection>` and `<LockedListItem>` for Pro users.

**Primary recommendation:** Follow the Phase 15 `applyTierShape` pattern exactly -- whitelist-based field stripping inside the merger module, prompt variants registered via the loader, and boot-time budget assertions. The Phase 18 UI spec already provides exact copywriting and component composition.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pro output shape is enforced at both layers: (a) Pro prompt variant instructs the model to produce only Pro-allowed fields, and (b) a server-side `applyRecruitingLensTierShape(merged, tier)` step strips Elite-only keys using a whitelist. Defense-in-depth.
- **D-02:** `applyRecruitingLensTierShape` lives in `supabase/functions/_shared/recruiting-lens-merger.ts` as a new final step inside the merge function, receiving `tier` as a parameter. Single exit point.
- **D-03:** Pro allowed fields whitelist: `overallMatch` (full), `recruiterVerdict` (full), `subScores.experienceAlignment` and `subScores.skillAlignment` (score only, rationale stripped), first 2 `topGaps` (title/severity/whyItMatters only -- `howItShowsUp` and `fixPriority` stripped), first 2 `resumeEdits`, `preAnalysis` (full). Everything else is stripped for Pro.
- **D-04:** Elite allowed fields: all fields, no stripping. The shaper is a no-op for Elite tier.
- **D-05:** Tier variants use conditional sections within existing call suffixes, not separate Pro/Elite suffix functions. The existing `buildCall3Suffix(isElite)` pattern is extended across all three suffixes with a `tier` parameter.
- **D-06:** Register the Recruiting Lens feature with Phase 14's `loadPromptVariant` loader under key `'recruiting_lens'`. The loader dispatches to the existing `buildRecruitingLensSystemBlock` with the resolved tier. No `_free` variant is needed since Free users are blocked entirely.
- **D-07:** `STRIVO_GLOBAL_AI_PRINCIPLES` auto-prepend for Pro/Elite is handled by the Phase 14 loader -- Recruiting Lens does NOT manually inject it.
- **D-08:** Auto-detection happens on the frontend. `RecruitingLens.tsx` queries `analysis_results` on mount for most recent `resume_analysis`.
- **D-09:** The user retains full control -- pre-filled text is editable.
- **D-10:** If no prior resume analysis exists, the textarea remains empty with placeholder text.
- **D-11:** Locked fields within gap cards render using inline `<LockedSection>` per field.
- **D-12:** The 6 omitted top-level sections each render as individual `<LockedSection>` placeholders for Pro users.
- **D-13:** `<LockedListItem>` is used for capped arrays: `topGaps` shows items 1-2 as real content, items 3+ as locked. Same for `resumeEdits`.
- **D-14:** Existing save to `analysis_results` is sufficient. No new table needed.
- **D-15:** Merit costs are `{ pro: 8, elite: 5 }`. The existing `withMerits` call is already wired.
- **D-16:** `MERIT_SYSTEM_ENABLED=false` still runs the tier-gated output path. Only Merit deduction is gated on the flag.
- **D-17:** Tier is resolved from `userContext.tier` as returned by `requireAuth`.

### Claude's Discretion
- Exact `PRO_ALLOWED_FIELDS` list -- planner cross-references RCL-02/03 spec against the actual `RecruitingLensOutput` type.
- Whether `applyRecruitingLensTierShape` is a standalone function or integrated into `mergeRecruitingLensResults` as an optional parameter.
- Exact teaser text for each `<LockedSection>` placeholder -- provided in 18-UI-SPEC.md.
- How the frontend detects total gap/edit count for `<LockedListItem>` rendering -- backend `_meta.totalGaps` field, or fixed count from spec.
- Whether the conditional prompt sections use `if (tier === 'pro')` or `if (tier !== 'elite')` internally.
- How `resumeSummary` text is extracted from `analysis_results.raw_response` -- depends on actual JSON shape stored by `analyze-resume`.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RCL-01 | Free tier shows `<ProFeatureGate>` -- feature is not accessible | Already implemented at `RecruitingLens.tsx:393-410` and `recruiting-lens/index.ts:175`. No change needed. |
| RCL-02 | Pro output (8 Merits, ~3000 output tokens) -- limited preview with specific allowed fields | Requires `applyRecruitingLensTierShape` whitelist + prompt conditional sections. CALL_CONFIGS Pro budgets need re-derivation from 8000 cap. |
| RCL-03 | Pro output omits: `quickStrategicFixes`, `roadmap`, `matchedKeywords`, `missingKeywords`, `linkedinImprovements`, `finalAdvice`; locks `howItShowsUp` and `fixPriority` on shown gaps | Whitelist stripping in merger + frontend `<LockedSection>` / `<LockedListItem>` rendering |
| RCL-04 | Elite output (5 Merits, ~14000 output tokens) -- all fields, full output, saved to dashboard near saved jobs | Already implemented for Elite persistence at `recruiting-lens/index.ts:244-253`. Shaper is no-op for Elite. |
| RCL-05 | `recruiting-lens` checks `check-and-deduct-merits` for Pro/Elite only; sets `maxTokens` Pro=8000 / Elite=20000 | Merit gateway already wired at line 195. CALL_CONFIGS token budgets need updating. |
| RCL-06 | Auto-detect last uploaded/analyzed resume without re-prompting on Recruiting Lens entry | Already implemented at `RecruitingLens.tsx:213-275`. Uses `resumes` table primary path + `analysis_results` fallback. |
| BACK-11 | Modified `recruiting-lens` -- Merit check, prompt variant, per-tier `maxTokens` | All three modifications documented. Merit check exists; prompt variant registration needed; maxTokens update needed. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Free user gate (RCL-01) | API / Backend | Browser / Client | Backend returns 403; frontend renders ProFeatureGate. Both already exist. |
| Pro output shaping (RCL-02/03) | API / Backend | -- | Server-side whitelist stripping is the enforcement point. Prompt also instructs model to omit. |
| Pro locked-field UI (RCL-03) | Browser / Client | -- | Frontend renders LockedSection/LockedListItem based on absent/stripped fields. |
| Elite full output (RCL-04) | API / Backend | -- | Shaper no-ops for Elite; persistence already implemented. |
| Merit deduction (RCL-05) | API / Backend | -- | withMerits gateway already wired in handler. |
| Per-tier maxTokens (RCL-05) | API / Backend | -- | CALL_CONFIGS in handler, validated against TIER_MAX_TOKENS. |
| Auto-resume detection (RCL-06) | Browser / Client | Database / Storage | Frontend queries analysis_results via Supabase client auth. RLS filters to current user. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno runtime | 2+ | Edge function execution | Supabase platform requirement [VERIFIED: supabase/functions/deno.json] |
| @supabase/supabase-js | 2.81.1 | Client-side DB queries for auto-resume | Already in use throughout frontend [VERIFIED: package.json] |
| React | 18.3.1 | Frontend component rendering | Existing app framework [VERIFIED: package.json] |
| Framer Motion | 12.23.26 | LockedSection animation | Already used by LockedSection component [VERIFIED: src/components/LockedSection.tsx] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | 0.462.0 | Lock icon in LockedSection/LockedListItem | Already imported in these components [VERIFIED: component source] |
| Sonner | 1.7.4 | Toast notifications for errors | Already used in RecruitingLens.tsx [VERIFIED: component source] |

No new dependencies are required for this phase.

## Architecture Patterns

### System Architecture Diagram

```
Frontend (RecruitingLens.tsx)                     Backend (recruiting-lens/index.ts)
  |                                                     |
  |-- mount: query analysis_results (RLS)               |
  |   for most recent resume_analysis                   |
  |   -> pre-fill resumeSummary                         |
  |                                                     |
  |-- Free user? -> <ProFeatureGate> (no API call)      |
  |                                                     |
  |-- Pro/Elite: POST /recruiting-lens -->              |
  |   { resumeSummary, jobDescription, linkedinText }   |
  |                                                     |
  |                                          requireAuth -> userContext.tier
  |                                          tier === 'free' -> 403
  |                                          checkRateLimit
  |                                                     |
  |                                          if MERIT_SYSTEM_ENABLED:
  |                                            withMerits(userId, 'recruiting_lens', fn)
  |                                              -> check_and_deduct_merits RPC
  |                                              -> sanitize inputs
  |                                              -> build prompts (tier-conditional)
  |                                              -> 3x parallel Anthropic calls
  |                                              -> mergeRecruitingLensResults()
  |                                              -> applyRecruitingLensTierShape(merged, tier)
  |                                              -> Elite: save to analysis_results
  |                                              -> return shaped JSON
  |                                          else:
  |                                            checkAndRecordUsage (legacy)
  |                                            -> same pipeline without Merit deduction
  |                                                     |
  |<-- JSON response (tier-shaped) <--------------------|
  |                                                     |
  |-- Pro results:                                      |
  |   render allowed fields                             |
  |   + <LockedSection> for omitted sections            |
  |   + <LockedListItem> for capped arrays              |
  |   + inline <LockedSection> for locked gap fields    |
  |                                                     |
  |-- Elite results:                                    |
  |   render all fields (existing behavior)             |
```

### Recommended Project Structure

No new files need to be created. Modifications to existing files:

```
supabase/functions/
  recruiting-lens/
    index.ts                     # Update CALL_CONFIGS, tier resolution, prompt loading
  _shared/
    recruiting-lens-prompts.ts   # Refactor with tier param, register with loadPromptVariant
    recruiting-lens-merger.ts    # Add applyRecruitingLensTierShape
src/
  pages/
    RecruitingLens.tsx           # Add tier-conditional rendering in results view
```

### Pattern 1: Whitelist-Based Tier Shaping (Defense in Depth)

**What:** Server-side function strips fields not in a per-tier whitelist from the merged API response. This runs AFTER the merge step and BEFORE the HTTP response, regardless of what the prompt requested.

**When to use:** Every tier-gated feature. The prompt instructs the model to omit locked fields, but the shaper guarantees it even if the model leaks.

**Example:**
```typescript
// Source: supabase/functions/_shared/result-merger.ts (Phase 15 implementation)
const PRO_ALLOWED_FIELDS = new Set<string>([
  'preAnalysis', 'overallMatch', 'recruiterVerdict', 'subScores',
  'topGaps', 'resumeEdits',
]);

const ELITE_ALLOWED_FIELDS = new Set<string>([
  ...PRO_ALLOWED_FIELDS,
  'scoreRationale', 'roadmap', 'strategicAdvice',
  'keywords', 'quickFixes', 'linkedinImprovements',
]);

export function applyRecruitingLensTierShape(
  merged: RecruitingLensOutput,
  tier: 'pro' | 'elite',
): void {
  if (tier === 'elite') return; // no-op for Elite

  const whitelist = PRO_ALLOWED_FIELDS;
  for (const key of Object.keys(merged)) {
    if (!whitelist.has(key)) {
      delete (merged as Record<string, unknown>)[key];
    }
  }

  // Strip rationale from non-allowed sub-scores
  if (merged.subScores) {
    const allowedSubScores = ['experienceAlignment', 'skillAlignment'];
    for (const [key, val] of Object.entries(merged.subScores)) {
      if (!allowedSubScores.includes(key)) {
        delete (merged.subScores as Record<string, unknown>)[key];
      } else if (val && typeof val === 'object') {
        delete (val as Record<string, unknown>).rationale;
      }
    }
  }

  // Cap arrays
  if (merged.topGaps) merged.topGaps = merged.topGaps.slice(0, 2);
  if (merged.resumeEdits) merged.resumeEdits = merged.resumeEdits.slice(0, 2);

  // Strip fields from shown gaps
  for (const gap of merged.topGaps || []) {
    delete (gap as Record<string, unknown>).howItShowsUp;
    delete (gap as Record<string, unknown>).fixPriority;
  }
}
```

### Pattern 2: Feature Registration with Tier-Prompt Loader

**What:** Each feature registers its prompt builders with the shared `loadPromptVariant` registry at module load time. The loader auto-prepends `STRIVO_GLOBAL_AI_PRINCIPLES` for Pro/Elite.

**When to use:** Every feature that has tier-gated prompts.

**Example:**
```typescript
// Source: supabase/functions/_shared/resume-prompts.ts (Phase 14/15 pattern)
import { registerFeaturePrompts, type PromptVariantBuilder } from './tier-prompts.ts';

// Recruiting Lens has no Free variant (Free users are blocked entirely)
// but the loader registry requires all 3 tiers, so Free throws
const RECRUITING_LENS_VARIANTS: PromptVariantBuilder<RecruitingLensPromptParams> = {
  free: () => { throw new Error('Recruiting Lens is not available for Free tier'); },
  pro: (params) => buildRecruitingLensSharedPrefix({ ...params, tier: 'pro' }),
  elite: (params) => buildRecruitingLensSharedPrefix({ ...params, tier: 'elite' }),
};

registerFeaturePrompts('recruiting', RECRUITING_LENS_VARIANTS);
```

### Pattern 3: Boot-Time Budget Assertion

**What:** Module-level assertion that verifies per-tier CALL_CONFIGS budgets sum to at most `TIER_MAX_TOKENS[tier]`. Fails at function cold start if a future edit miscounts.

**Example:**
```typescript
// Source: supabase/functions/analyze-resume/index.ts (Phase 15 pattern)
import { TIER_MAX_TOKENS } from '../_shared/tier-config.ts';

for (const tier of ['pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as 'maxTokensPro' | 'maxTokensElite';
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) {
    throw new Error(`[recruiting-lens] CALL_CONFIGS sum ${sum} exceeds TIER_MAX_TOKENS[${tier}]`);
  }
}
```

### Anti-Patterns to Avoid
- **Client-supplied tier:** Never trust `body.tier` from the request. Always use `userContext.tier` from `requireAuth` (reads `profiles.subscription_tier`). [VERIFIED: auth.ts lines 87-102]
- **Forgetting the shaper:** Never return merged output without running `applyRecruitingLensTierShape`. The shaper must be called inside the merge function, not at the handler level, so no caller can forget it. [VERIFIED: Phase 15 D-12 pattern]
- **Hardcoded model IDs:** Use `getModel(tier, 'recruiting')` from `tier-config.ts` instead of the hardcoded `ANTHROPIC_MODEL` constant at line 22. [VERIFIED: tier-config.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tier-conditional prompts | Custom if/else in handler | `loadPromptVariant('recruiting', tier, params)` from `tier-prompts.ts` | Auto-prepends GLOBAL_AI_PRINCIPLES, single audit point [VERIFIED: tier-prompts.ts] |
| Locked UI sections | Custom blur/overlay components | `<LockedSection>` and `<LockedListItem>` from Phase 14 | Consistent visual language, tested, a11y compliant [VERIFIED: src/components/LockedSection.tsx] |
| Merit deduction | Custom RPC calls | `withMerits(ctx, 'recruiting_lens', fn)` from `merit-gateway.ts` | Handles rate limit, deduction, refund, logging in one surface [VERIFIED: merit-gateway.ts] |
| Timeout/model config | Magic numbers | `getTimeout(tier)` and `getModel(tier, 'recruiting')` from `tier-config.ts` | Single source of truth, validated per-spec [VERIFIED: tier-config.ts] |
| Free tier gate | Custom 403 logic | Already exists at `recruiting-lens/index.ts:175` | Backend + frontend both already block Free |
| Auto-resume detection | Service-role query | Client-side query with RLS via `supabase.from('analysis_results')` | RLS auto-filters to current user, no service role needed [VERIFIED: RecruitingLens.tsx:213-275] |

**Key insight:** Every infrastructure component needed for Phase 18 has already been built and battle-tested in Phases 13-15. Phase 18 is a pattern application, not infrastructure creation.

## Common Pitfalls

### Pitfall 1: Field Name Mismatch Between CONTEXT.md and Actual Types

**What goes wrong:** The CONTEXT.md uses names like `quickStrategicFixes`, `finalAdvice`, `matchedKeywords`, `missingKeywords` which do not match the actual `RecruitingLensOutput` type field names: `quickFixes`, `strategicAdvice`, `keywords.matched`, `keywords.missing`.
**Why it happens:** The spec and discussion use human-readable names; the TypeScript types use the actual JSON keys.
**How to avoid:** The planner MUST cross-reference D-03's whitelist against the actual `RecruitingLensOutput` interface in `recruiting-lens-merger.ts` (lines 24-87). Use those field names in the whitelist, not the CONTEXT.md names.
**Warning signs:** Test assertions fail because field names don't match the whitelist keys.

**Actual field name mapping** [VERIFIED: recruiting-lens-merger.ts lines 24-87]:
| CONTEXT.md Name | Actual TypeScript Field | Call Owner |
|-----------------|------------------------|------------|
| `quickStrategicFixes` | `quickFixes` (string[]) | rl-call-3 |
| `finalAdvice` | `strategicAdvice` ({applyNow, summary, biggestScoreMover}) | rl-call-2 |
| `matchedKeywords` | `keywords.matched` (string[]) | rl-call-3 |
| `missingKeywords` | `keywords.missing` (string[]) | rl-call-3 |
| `linkedinImprovements` | `linkedinImprovements` (correct) | rl-call-3 |
| `roadmap` | `roadmap` (correct) | rl-call-2 |
| `scoreRationale` | `scoreRationale` (correct) | rl-call-1 |

### Pitfall 2: CALL_CONFIGS Pro Budget Needs Major Reduction

**What goes wrong:** The current Pro total is 16,000 tokens (5500+5000+5500). The spec requires Pro=8000. Simply scaling down could cause truncated output.
**Why it happens:** The existing configs were designed before tier-specific caps were defined.
**How to avoid:** Re-derive Pro budgets from the 8000 cap. Since Pro omits many fields (roadmap, quickFixes, keywords, linkedinImprovements, strategicAdvice, full scoreRationale), the token budget reduction aligns with the reduced output scope. Suggested split: ~2700/2700/2600 for Pro totaling 8000.
**Warning signs:** Pro responses are truncated or the JSON doesn't parse.

### Pitfall 3: Two Different Key Namespaces

**What goes wrong:** Using `'recruiting_lens'` (merit gateway feature key) where `'recruiting'` (FeatureKey for tier-prompts/tier-config) is expected, or vice versa.
**Why it happens:** The Merit system uses `snake_case` feature identifiers (`'recruiting_lens'`), while the Phase 14 tier infrastructure uses short `PascalCase`-style keys (`'recruiting'`).
**How to avoid:** Use `'recruiting_lens'` for `withMerits()` calls and `'recruiting'` for `loadPromptVariant()` and `getModel()` / `getTimeout()` calls. The two registries are separate and independent. [VERIFIED: merit-gateway.ts vs tier-config.ts/tier-prompts.ts]
**Warning signs:** "feature not registered" errors at runtime.

### Pitfall 4: LockedSection Requires requiredTier="elite" (Not "pro")

**What goes wrong:** Using `requiredTier="pro"` for the locked sections shown to Pro users.
**Why it happens:** Intuitive mistake -- "I'm locking this from Pro users, so it's a pro lock."
**How to avoid:** The `requiredTier` prop on `<LockedSection>` means "the tier required to unlock this content." Pro users viewing Elite-only sections need `requiredTier="elite"` so the CTA reads "Upgrade to Elite." [VERIFIED: LockedSection.tsx line 24]
**Warning signs:** CTA says "Upgrade to Pro" when it should say "Upgrade to Elite."

### Pitfall 5: Auto-Resume Already Implemented

**What goes wrong:** Re-implementing the auto-resume detection query, breaking the existing logic.
**Why it happens:** CONTEXT.md D-08 describes the query, which already exists at `RecruitingLens.tsx:213-275`.
**How to avoid:** The existing implementation at lines 213-275 already handles: (1) primary path via `resumes` table with `grading_data`, (2) fallback path via `analysis_results` table, (3) `buildResumeSummary()` helper for text extraction. Verify it works for both Pro and Elite users (it should, since it queries user-owned data via auth session). No changes needed for RCL-06.
**Warning signs:** Duplicate query logic, or breaking the existing fallback chain.

### Pitfall 6: Pro Persistence Decision

**What goes wrong:** Saving Pro results to `analysis_results` when only Elite should persist.
**Why it happens:** The existing code saves only when `isElite` is true (line 242/345), but after refactoring to a `resolvedTier` model, the condition might be written incorrectly.
**How to avoid:** Keep the persistence guard as `if (tier === 'elite')`, matching D-14. Pro results are ephemeral -- they exist in sessionStorage on the client but are not server-persisted.
**Warning signs:** Pro users see saved Recruiting Lens results on their dashboard.

## Code Examples

### Verified: Existing Recruiting Lens Output Type
```typescript
// Source: supabase/functions/_shared/recruiting-lens-merger.ts lines 24-87
export interface RecruitingLensOutput {
  preAnalysis: { jdKeywords: string[]; dealBreakers: string[]; industry: string; culture: string };
  overallMatch: { score: number; label: string; summary: string };
  subScores: {
    experienceAlignment: RecruitingLensSubScore;
    skillAlignment: RecruitingLensSubScore;
    impactStrength: RecruitingLensSubScore;
    keywordAndLanguageMatch: RecruitingLensSubScore;
    credibilityAndSeniorityFit: RecruitingLensSubScore;
  };
  recruiterVerdict: string;
  scoreRationale: Array<{ category: string; strengths: string[]; weaknesses: string[] }>;
  topGaps: Array<{ title: string; severity: string; whyItMatters: string; howItShowsUp: string; fixPriority: string }>;
  roadmap: Array<{ stage: string; action: string; why: string; expectedImpact: string }>;
  resumeEdits: Array<{ original?: string; rewritten: string; qualityGates: Record<string, boolean> }>;
  linkedinImprovements?: Array<{ area: string; suggestion: string }>;
  strategicAdvice: { applyNow: boolean; summary: string; biggestScoreMover: string };
  keywords: { matched: string[]; missing: string[] };
  quickFixes: string[];
}
```

### Verified: Existing Merit Gateway Wiring
```typescript
// Source: supabase/functions/recruiting-lens/index.ts lines 195-264
if (MERIT_SYSTEM_ENABLED && userContext) {
  const gated = await withMerits(
    { userId: userContext!.userId, tier: userContext!.tier as 'free' | 'pro' | 'elite', corsType: 'user' as const },
    'recruiting_lens',
    async (_txId) => {
      // ... analysis pipeline ...
      return new Response(JSON.stringify(merged), { ... });
    },
  );
  if (!gated.ok) return gated.response;
  return gated.value;
}
```

### Verified: LockedSection Props API
```typescript
// Source: src/components/LockedSection.tsx
export interface LockedSectionProps {
  title: string;
  teaser: string;
  requiredTier: 'pro' | 'elite';
  ctaHref?: string;    // default '/pricing'
  className?: string;
}
```

### Verified: LockedListItem Props API
```typescript
// Source: src/components/LockedListItem.tsx
export interface LockedListItemProps {
  index: number;
  total: number;
  label: string;
  requiredTier: 'pro' | 'elite';
  teaser?: string;
  ctaHref?: string;    // default '/pricing'
  className?: string;
}
```

### Verified: Existing CALL_CONFIGS (Pre-Phase 18)
```typescript
// Source: supabase/functions/recruiting-lens/index.ts lines 25-33
const CALL_CONFIGS = [
  { callType: 'rl-call-1', maxTokensPro: 5500, maxTokensElite: 7000 },
  { callType: 'rl-call-2', maxTokensPro: 5000, maxTokensElite: 6000 },
  { callType: 'rl-call-3', maxTokensPro: 5500, maxTokensElite: 7000 },
];
// Pro total: 16,000 | Elite total: 20,000
// MUST change to: Pro total: 8,000 | Elite total: 20,000 (unchanged)
```

### Verified: CALL_FIELD_OWNERSHIP (What Each Call Produces)
```typescript
// Source: supabase/functions/_shared/recruiting-lens-merger.ts lines 93-97
const CALL_FIELD_OWNERSHIP: Record<string, string[]> = {
  'rl-call-1': ['preAnalysis', 'overallMatch', 'subScores', 'recruiterVerdict', 'scoreRationale'],
  'rl-call-2': ['topGaps', 'roadmap', 'strategicAdvice'],
  'rl-call-3': ['resumeEdits', 'linkedinImprovements', 'keywords', 'quickFixes'],
};
```

### Verified: Phase 15 Pro CALL_CONFIGS Pattern
```typescript
// Source: supabase/functions/analyze-resume/index.ts lines 46-51
const CALL_CONFIGS: Array<{ callType: CallType; maxTokensFree: number; maxTokensPro: number; maxTokensElite: number }> = [
  { callType: 'criteria-1', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'criteria-2', maxTokensFree: 1800, maxTokensPro: 4800, maxTokensElite: 5000 },
  { callType: 'summary',    maxTokensFree: 2400, maxTokensPro: 6400, maxTokensElite: 6000 },
  { callType: 'elite-extras', maxTokensFree: 0, maxTokensPro: 0, maxTokensElite: 4000 },
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `isElite` boolean (Phase 2) | `tier: 'pro' \| 'elite'` string | Phase 15 (April 2026) | All tier logic uses string comparison, not boolean |
| Direct prompt imports | `loadPromptVariant` loader | Phase 14 (April 2026) | Single audit point for prompt variant selection |
| No output shaping | `applyTierShape` whitelist | Phase 15 (April 2026) | Defense-in-depth against prompt leaks |
| Hardcoded timeouts | `getTimeout(tier, callType)` | Phase 14 (April 2026) | Centralized, per-spec timeout values |
| `rawBody.tier` client trust | `userContext.tier` from auth | Phase 15 (April 2026) | Tier is server-authoritative |

**Deprecated/outdated:**
- `isElite` boolean at `recruiting-lens/index.ts:181`: Will be replaced by `resolvedTier` string in Phase 18
- `maxTokensPro: 5500/5000/5500` totaling 16,000: Will be reduced to total 8,000 per spec
- `ANTHROPIC_MODEL` hardcoded constant at line 22: Should be replaced by `getModel(tier, 'recruiting')` from `tier-config.ts`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pro CALL_CONFIGS budget split of ~2700/2700/2600 (totaling 8000) is sufficient for Pro's reduced field set | Common Pitfalls | If too tight, Pro responses may truncate. Can be adjusted post-measurement. |
| A2 | Recruiting Lens uses Haiku 4.5 for all tiers (existing `ANTHROPIC_MODEL` at line 22) and no tier-specific model override is needed | Architecture Patterns | If spec requires different models for Pro vs Elite recruiting lens, tier-config override map needs an entry. Low risk -- Haiku 4.5 is already hardcoded. [ASSUMED] |
| A3 | The `_meta.totalGaps` / `_meta.totalEdits` approach for LockedListItem total count is the preferred backend approach | Claude's Discretion | If the frontend uses a hardcoded count instead, fewer backend changes but less accurate locked-item text. |

## Open Questions

1. **Pro CALL_CONFIGS budget distribution**
   - What we know: Pro total must be 8000. Three calls. Pro omits many fields from rl-call-2 (roadmap, strategicAdvice) and rl-call-3 (quickFixes, keywords, linkedinImprovements).
   - What's unclear: The optimal per-call split for Pro's reduced scope. rl-call-2 produces only topGaps for Pro (roadmap and strategicAdvice are stripped). rl-call-3 produces only resumeEdits for Pro (everything else stripped).
   - Recommendation: Since the prompt conditional sections will tell the model to skip omitted fields for Pro, the actual token usage will be lower. A ~3000/2500/2500 split for Pro gives call-1 more room (it produces overallMatch, subScores, recruiterVerdict, scoreRationale -- though scoreRationale is stripped, the prompt should also omit it). Measure actual usage after implementation.

2. **`_meta` total counts vs hardcoded**
   - What we know: `<LockedListItem>` needs `total` prop to display "Gap 3 of 5 -- Locked". The actual total count depends on what the model produces (3-5 gaps per prompt spec).
   - What's unclear: Whether to have the backend include a `_meta` field with total counts, or whether the prompt should instruct a fixed count (e.g., always 5 gaps, always 8 edits for Elite).
   - Recommendation: Add `_meta: { totalGaps: number, totalEdits: number }` to the response before tier shaping. This way the frontend knows the total even though only 2 items are visible. The shaper preserves `_meta` for both tiers.

3. **Model override for Recruiting Lens**
   - What we know: `recruiting-lens/index.ts:22` hardcodes `claude-haiku-4-5-20251001`. `FEATURE_MODEL_OVERRIDES` in `tier-config.ts` has no entry for `'recruiting'`.
   - What's unclear: Whether the spec intends Haiku 4.5 for all tiers or if Pro/Elite should use a different model.
   - Recommendation: Keep Haiku 4.5 for all tiers (existing behavior). Add a `FEATURE_MODEL_OVERRIDES` entry `recruiting: { pro: FREE_MODEL, elite: FREE_MODEL }` to make this explicit and use `getModel(tier, 'recruiting')` instead of the hardcoded constant. [ASSUMED: Haiku for all tiers is correct based on existing code]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test (edge functions) + Vitest (frontend) |
| Config file | `supabase/functions/deno.json` (Deno), `vite.config.ts` (Vitest) |
| Quick run command | `deno test supabase/functions/_shared/recruiting-lens-merger.test.ts --no-check --allow-env --allow-read` |
| Full suite command | `deno test supabase/functions/_shared/*.test.ts --no-check --allow-env --allow-read && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCL-01 | Free users get 403 from backend | unit | `deno test` (mock handler test) | No -- Wave 0 |
| RCL-02 | Pro output contains only allowed fields | unit | `deno test supabase/functions/_shared/recruiting-lens-merger.test.ts` | Partial -- merger tests exist, shaper tests needed |
| RCL-03 | Pro output omits Elite fields, locks gap subfields | unit | Same as RCL-02 | No -- Wave 0 |
| RCL-04 | Elite output contains all fields | unit | Same as RCL-02 | No -- Wave 0 |
| RCL-05 | Merit deduction runs for Pro/Elite; maxTokens correct | unit | `deno test` (mock withMerits) | No -- covered by existing merit-gateway tests |
| RCL-06 | Auto-resume detection pre-fills textarea | manual-only | Visual verification | N/A -- already implemented, no regression expected |
| BACK-11 | Handler uses prompt variant, merit check, per-tier tokens | integration | Manual edge function invocation | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `deno test supabase/functions/_shared/recruiting-lens-merger.test.ts --no-check --allow-env --allow-read`
- **Per wave merge:** `deno test supabase/functions/_shared/*.test.ts --no-check --allow-env --allow-read`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/_shared/recruiting-lens-merger.test.ts` -- add `applyRecruitingLensTierShape` unit tests (Pro whitelist, Elite no-op, sub-score rationale stripping, array capping, gap field stripping)
- [ ] Existing `recruiting-lens-merger.test.ts` needs updating to accept `tier` parameter in `mergeRecruitingLensResults` if the function signature changes

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth(req, { type: 'user' })` -- already in handler [VERIFIED] |
| V3 Session Management | no | Handled by Supabase Auth globally |
| V4 Access Control | yes | Tier checked server-side via `userContext.tier` from `profiles.subscription_tier`; never trusted from client [VERIFIED] |
| V5 Input Validation | yes | Input length limits already enforced (resumeSummary 5000, jobDescription 3000, linkedinText 4000); prompt sanitization via `sanitizeUserContent` [VERIFIED] |
| V6 Cryptography | no | No crypto operations in this phase |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client claims higher tier to get Elite output | Elevation of Privilege | Tier read from `profiles.subscription_tier` server-side, never from request body [VERIFIED: auth.ts lines 87-102] |
| Pro user bypasses output shaping | Information Disclosure | `applyRecruitingLensTierShape` strips fields server-side as defense-in-depth -- even if prompt leaks, shaper removes [VERIFIED: Phase 15 pattern] |
| Prompt injection via resume/JD text | Tampering | `sanitizeUserContent` strips injection phrases before LLM ingestion [VERIFIED: recruiting-lens/index.ts lines 201-203] |
| Rate limit bypass | Denial of Service | Pooled 60/hr limiter via `merit-gateway.ts` + per-feature limiter at lines 187-191 [VERIFIED] |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/recruiting-lens/index.ts` -- full handler source, 391 lines [VERIFIED: direct read]
- `supabase/functions/_shared/recruiting-lens-prompts.ts` -- prompt module, 277 lines [VERIFIED: direct read]
- `supabase/functions/_shared/recruiting-lens-merger.ts` -- merger + types, 274 lines [VERIFIED: direct read]
- `supabase/functions/_shared/tier-config.ts` -- TIER_MAX_TOKENS, getModel, getTimeout [VERIFIED: direct read]
- `supabase/functions/_shared/tier-prompts.ts` -- loadPromptVariant, registerFeaturePrompts [VERIFIED: direct read]
- `supabase/functions/_shared/merit-gateway.ts` -- withMerits, MeritRefundable [VERIFIED: direct read]
- `src/pages/RecruitingLens.tsx` -- full frontend component, 983 lines [VERIFIED: direct read]
- `src/components/LockedSection.tsx` -- LockedSection component API [VERIFIED: direct read]
- `src/components/LockedListItem.tsx` -- LockedListItem component API [VERIFIED: direct read]
- `supabase/functions/analyze-resume/index.ts` -- Phase 15 CALL_CONFIGS pattern [VERIFIED: direct read]
- `supabase/functions/_shared/result-merger.ts` -- Phase 15 applyTierShape pattern [VERIFIED: direct read]

### Secondary (MEDIUM confidence)
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` -- loader and UI primitive decisions
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` -- applyTierShape and budget split patterns
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` -- withMerits gateway contract
- `.planning/phases/18-recruiting-lens-gating/18-UI-SPEC.md` -- exact copywriting, component composition, view states

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows established Phase 15 pattern exactly, all code verified
- Pitfalls: HIGH -- derived from actual field name mismatches and verified code paths

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- pattern is established and infrastructure is locked)
