# Phase 14: tier-prompts-and-locked-section-primitive - Research

**Researched:** 2026-04-14
**Domain:** Shared tier-variant prompt loader + locked-section UI primitives + per-tier timeout/model config + tier-output validation harness
**Confidence:** HIGH

## Summary

Phase 14 ships four tightly-scoped pieces of shared infrastructure that every Phase 15-19 feature will consume: (1) a `loadPromptVariant()` loader in `supabase/functions/_shared/` that dispatches to per-feature, per-tier prompt builders and auto-prepends `STRIVO_GLOBAL_AI_PRINCIPLES` for Pro/Elite; (2) a `<LockedSection>` + `<LockedListItem>` + `<EliteFeatureGate>` primitive set in `src/components/` alongside the retained `<ProFeatureGate>`; (3) a centralized `tier-config.ts` module exposing `TIER_TIMEOUTS`, `TIER_MODELS`, `getTimeout()`, and `getModel()`; and (4) a Deno `tier-validation.test.ts` harness registered behind an env flag in `scripts/run-edge-tests.ps1`.

All four pieces have existing scaffolding in the codebase: `resume-prompts.ts` already threads `tier: 'free' | 'pro' | 'elite'` through `PromptParams` and has an inline `isElite` branch (lines 55-68) that is the v1.0 precursor to the three-variant pattern. `_shared/anthropic.ts` already accepts `timeoutMs` on every invoke and callers currently hard-code magic numbers (100000, 125000, 155000) that `tier-config.ts` will replace. `<ProFeatureGate>` (305 lines) and `<ProFeatureBlur>` (37 lines) both exist; Phase 14 retains the former unchanged, deprecates the latter with `@deprecated`, and adds the new primitives as siblings. The Deno test runner (`scripts/run-edge-tests.ps1`) already runs `_shared/*.test.ts` files — the harness registers with one new line behind a `RUN_TIER_VALIDATION=1` env check.

**Primary recommendation:** Start by extracting the existing `isElite` branches in `resume-prompts.ts` into three explicit builders (`buildFreeSuffix`, `buildProSuffix`, `buildEliteSuffix`), create the `tier-prompts.ts` loader that dispatches to them, ship `<LockedSection>`/`<LockedListItem>`/`<EliteFeatureGate>` as pure presentational components using existing shadcn `Button` + Lucide icons + Tailwind semantic tokens, centralize timeouts in `tier-config.ts`, then wire the Deno harness scaffold with one fixture (`scripts/test-resumes/medium.txt`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Prompt Variant Storage + Loader**

- **D-01:** Tier variants stored as TypeScript string constants (not `.md` files). Each feature exports `FREE_PROMPT`, `PRO_PROMPT`, `ELITE_PROMPT` builders from its `<feature>-prompts.ts`. Matches existing `resume-prompts.ts` pattern, bundles cleanly in Deno, compile-time type-checked.
- **D-02:** Single shared loader at `supabase/functions/_shared/tier-prompts.ts` exporting `loadPromptVariant(feature: FeatureKey, tier: Tier, params: PromptParams): string`. It owns a `FeatureKey → builders` registry. Every Phase 15+ edge function imports from here, never the per-feature modules directly.
- **D-03:** `STRIVO_GLOBAL_AI_PRINCIPLES` is auto-prepended by the loader when `tier !== 'free'`. Loader is the single enforcement point for GATE-04. Principles text lives as a string constant in `_shared/tier-prompts.ts` or adjacent `_shared/global-ai-principles.ts`, sourced from `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx`.
- **D-04:** Phase 14 ships the loader + one example feature fully wired (resume). Other four features register stubs or are added in Phases 15-19.

**`<LockedSection>` + `<LockedListItem>`**

- **D-05:** `<LockedSection>` uses flat-props API — no children. Signature: `<LockedSection title teaser requiredTier ctaHref />`. Blurred body is a generated skeleton placeholder.
- **D-06:** Partially-locked arrays render via dedicated `<LockedListItem>` primitive (NOT a variant of `<LockedSection>`). Signature: `<LockedListItem index total label requiredTier teaser />`.
- **D-07:** Existing `<ProFeatureBlur>` (37 lines) marked `@deprecated` but NOT removed. Lazy migration in Phases 15-19.
- **D-08:** Existing `<ProFeatureGate>` (305 lines) retained unchanged (GATE-07). New sibling `<EliteFeatureGate>` added for GATE-08 — structurally a copy with different copy/CTA.
- **D-09:** Default `ctaHref = '/pricing'`. Phase 14 does NOT own `/pricing` — Phase 20 does.
- **D-10:** SC-4 "test page" is a new dev-only sandbox route (e.g., `/dev/locked-sections`) showing every variant in one place. Gated to dev builds or admin users.

**Per-Tier Timeout + Model Config**

- **D-11:** New `supabase/functions/_shared/tier-config.ts` exports `TIER_TIMEOUTS`, `TIER_MODELS`, `getTimeout(tier, callType?)`, `getModel(tier, feature?)`. Do NOT fold into `_shared/anthropic.ts`.
- **D-12:** `getTimeout` is keyed by (tier, callType) — callType is `'core' | 'elite-preview' | 'quiz'`, default `'core'`.
- **D-13:** Free-tier model = Haiku 4.5 (`claude-haiku-4-5-20251001`). Single enforcement point for PROJECT.md cost ceiling (≤ $0.051/analysis). Pro/Elite can override per-feature via `TIER_MODELS`; Free never can.

**Tier-Output Validation Harness (TEST-09/10/11)**

- **D-14:** Hybrid: live-model for field-presence (TEST-09), fixture snapshots for token budgets (TEST-10). Locked-section rendering (TEST-11) is a separate frontend test.
- **D-15:** Harness at `supabase/functions/_shared/tier-validation.test.ts`. Registered in `scripts/run-edge-tests.ps1` behind `RUN_TIER_VALIDATION=1` env flag. NOT run in CI by default.
- **D-16:** Phase 14 ships scaffold + one example (resume). Phases 15-19 each register their `TierValidationFixture` entry.

### Claude's Discretion

- Exact file layout (monolithic `tier-prompts.ts` vs. loader-imports-feature-modules) — planner picks based on module size.
- Exact TS types for `Tier`, `FeatureKey`, `PromptParams` — may reuse existing types from `resume-prompts.ts`.
- Whether `TIER_MODELS` is a flat map or function — public API is `getModel(tier, feature?)`.
- Skeleton style for `<LockedSection>` blurred body (shimmer bars, lorem-ipsum blur, etc.).
- Exact dev sandbox route path (`/dev/locked-sections`, `/_dev/locks`, etc.) and gating mechanism (admin-only, NODE_ENV, feature flag).
- Whether `<EliteFeatureGate>` is a copy of `<ProFeatureGate>` or a shared `<TierGate>` refactor.
- Exact fixture resume for the harness.
- Env flag name (`RUN_TIER_VALIDATION=1` indicative).

### Deferred Ideas (OUT OF SCOPE)

- Applying tier gating to any specific feature — Phases 15-19.
- Writing Free/Pro/Elite prompt bodies for career / linkedin / recruiting / interview — their respective gating phases. Phase 14 only ships the loader + resume as the worked example.
- Migrating `<ProFeatureBlur>` call sites to `<LockedSection>` — lazy in Phases 15-19.
- `/pricing` route — Phase 20.
- Running the harness in CI — deferred indefinitely; manual dev tool only.
- Storybook-style gallery — rejected in favor of dev sandbox route.
- Refactoring `<ProFeatureGate>`/`<EliteFeatureGate>` into shared `<TierGate>` — planner's discretion.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Each feature ships 3 system prompt variants (free/pro/elite) | D-01 constants in `<feature>-prompts.ts`; Phase 14 ships resume only (D-04) |
| GATE-02 | Edge functions select variant by user tier BEFORE building API call | `loadPromptVariant()` loader (D-02); resume already passes `tier` into `promptParams` (analyze-resume/index.ts lines 310-311) |
| GATE-03 | Free prompts instruct model to omit locked fields entirely | Lives in `FREE_PROMPT` body per feature; validated by TEST-09 field-presence harness |
| GATE-04 | Pro/Elite include `STRIVO_GLOBAL_AI_PRINCIPLES`; Free does not | Loader auto-prepends on `tier !== 'free'` (D-03); single enforcement point |
| GATE-05 | `<LockedSection>`: header + blurred body + teaser + upgrade CTA | New component in `src/components/` (D-05); uses shadcn Button + Lucide Lock + semantic Tailwind tokens |
| GATE-06 | Partially locked arrays render first item + "Edit X of N — Locked" cards | New `<LockedListItem>` component (D-06); consumers map and render per slot |
| GATE-07 | `<ProFeatureGate>` for Free users on Recruiting Lens + Interview Prep | Retained as-is (D-08); already 305 lines in `src/components/ProFeatureGate.tsx` |
| GATE-08 | `<EliteFeatureGate>` for Pro users viewing Elite fields | New sibling of `<ProFeatureGate>` (D-08); copy-paste or shared refactor (discretion) |
| GATE-09 | Free output tokens < 50% of Elite output tokens | TEST-10 snapshot assertion in harness (D-14) |
| BACK-12 | Per-tier timeouts: Free 50s / Pro core 125s / Pro elite-preview 65s / Elite 155s / Quiz 80s | `tier-config.ts` `TIER_TIMEOUTS` + `getTimeout(tier, callType)` (D-11, D-12) |
| TEST-09 | Tier output validation — run 3 analyses per feature, verify correct fields | Deno test in `tier-validation.test.ts` with live Anthropic calls (D-14, D-15) |
| TEST-10 | Verify Free tokens < 50% of Elite tokens per feature | Fixture snapshot assertion in same harness (D-14) |
| TEST-11 | Verify locked sections render: blur + icon + CTA + teaser | Frontend Vitest/Playwright test (D-14) — runs on every PR, no Anthropic |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tier → prompt variant selection | API / Backend (Deno edge) | — | Must happen server-side BEFORE Anthropic call (GATE-02); client is untrusted |
| `STRIVO_GLOBAL_AI_PRINCIPLES` auto-prepend | API / Backend (Deno edge) | — | Single enforcement point for GATE-04; feature code must not bypass |
| Per-tier timeout/model config | API / Backend (Deno edge) | — | Applied to `fetch` to Anthropic API; BACK-12 cost/latency ceilings |
| Free→Haiku 4.5 model pinning | API / Backend (Deno edge) | — | Cost ceiling enforcement; must not be overrideable by feature code for Free |
| `<LockedSection>` / `<LockedListItem>` rendering | Browser / Client (React) | — | Pure presentational UI; no server state |
| `<ProFeatureGate>` / `<EliteFeatureGate>` rendering | Browser / Client (React) | — | Whole-feature gate based on `userTier` prop from auth context |
| Tier detection (which tier is the user?) | API / Backend (Supabase Auth + profiles) | Browser / Client (context) | Server authoritative; client reads from `AiCreditsContext`/auth session for UI |
| Tier output validation harness | API / Backend (Deno test runner) | — | Live Anthropic calls via Deno's `--allow-net`; runs outside request path |
| Locked-section render test (TEST-11) | Browser / Client (Vitest) | — | No backend, no Anthropic; pure DOM assertion |
| Dev-only sandbox route `/dev/locked-sections` | Browser / Client (React Router) | — | Static showcase page; no server involvement |

## Standard Stack

### Core (Edge Function Side)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno | 2+ | Runtime for edge functions + test harness | [VERIFIED: supabase/functions/deno.json, project CLAUDE.md] Project standard; already runs existing `*.test.ts` files |
| Deno standard test lib | std@0.168.0 | `Deno.test` + assertions | [VERIFIED: `supabase/functions/_shared/json-repair.test.ts`, `logger.test.ts` use this pattern] Already used by 8+ existing test files |
| `_shared/anthropic.ts` `invokeAnthropicText` | existing | Live model calls for TEST-09 harness | [VERIFIED: Read of `_shared/anthropic.ts`] Already accepts `timeoutMs` param; harness reuses it |
| `_shared/logger.ts` `createLogger` | existing | Structured logging from loader + harness | [VERIFIED: grep of shared layer] Project convention per CLAUDE.md § Logging |

### Core (Frontend Side)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | UI primitives | [VERIFIED: package.json] Project standard |
| shadcn/ui `Button` + `Badge` | existing | LockedSection CTA + tier chip | [VERIFIED: `src/components/ui/` + used in ProFeatureGate.tsx] Project standard |
| Lucide React (`Lock`, `Crown`, `Sparkles`) | 0.462.0 | Icons in locked primitives | [VERIFIED: package.json + ProFeatureBlur.tsx imports] Project standard for icons |
| Tailwind CSS (semantic tokens) | 3.4.17 | Blur + layout styling | [VERIFIED: CLAUDE.md § Coding Style] Project requires semantic tokens, not hardcoded colors |
| Framer Motion | 12.23.26 | Optional reveal animations | [VERIFIED: ProFeatureGate.tsx already uses `motion`/`AnimatePresence`] Reuse existing pattern if animation desired |
| React Router `Link` | 6.30.1 | Navigation to `/pricing` CTA | [VERIFIED: ProFeatureBlur.tsx already uses `Link to="/profile"`] Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest or React Testing Library | not currently in package.json | Frontend TEST-11 locked-section render test | Only if planner decides to add a frontend test runner. Current repo has NO frontend test runner — this is a gap. See Wave 0 Gaps in Validation Architecture. |
| Playwright | not currently installed | Alternative for TEST-11 | Heavier; probably overkill for a single rendering assertion |
| `cn` / `clsx` + `tailwind-merge` | 2.1.1 / 2.6.0 | Classname composition in new components | [VERIFIED: package.json + existing component pattern] Project standard |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TS string constants (D-01) | `.md` files loaded at runtime | Rejected in D-01 — diverges from existing `resume-prompts.ts` pattern, adds FS I/O in Deno functions |
| Single shared loader (D-02) | Per-function imports of feature prompt modules | Rejected — loses the GATE-04 audit point; feature code could bypass principles injection |
| Monolithic `tier-prompts.ts` holding everything | Loader + per-feature module files | Claude's discretion; planner picks after refactoring resume. **Recommend:** loader imports per-feature modules (keeps `resume-prompts.ts` as the single place for resume prompts, follows separation of concerns). |
| Copy-paste `<EliteFeatureGate>` from `<ProFeatureGate>` | Shared `<TierGate requiredTier>` refactor | Claude's discretion. **Recommend:** copy-paste for Phase 14 (lower blast radius on 305-line v1.0 component); revisit if both gates drift. |
| Vitest for TEST-11 | Manual visual check in dev sandbox | Automated check required by spec §11.3. Frontend test runner must be added (Wave 0 gap). |

**Installation (for frontend test runner if planner chooses Vitest for TEST-11):**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Version verification — Anthropic model IDs:**
- `claude-haiku-4-5-20251001` [VERIFIED: `supabase/functions/analyze-career/index.ts:250`] — already in production use for `analyze-career` Free path; D-13 makes this the canonical Free-tier model.
- Sonnet default for Pro/Elite [ASSUMED] — exact model ID (`claude-sonnet-4-5-YYYYMMDD`) is not hardcoded anywhere Phase 14 controls; falls back to `Deno.env.get('ANTHROPIC_MODEL_TEXT')`. Planner should confirm current default by checking the `ANTHROPIC_MODEL_TEXT` secret set in Supabase for staging/prod.

## Architecture Patterns

### System Architecture Diagram

```
                          PHASE 14 SHARED INFRASTRUCTURE

  [Phase 15-19 Edge Function]                    [Phase 15-19 Frontend Page]
         (e.g. analyze-resume)                         (e.g. Results.tsx)
                  |                                            |
                  | 1. getModel(tier, 'resume')                |
                  | 2. getTimeout(tier, 'core')                | renders
                  | 3. loadPromptVariant('resume',             |
                  |      tier, params)                         v
                  v                                     +-----------------+
       +--------------------------+                     | <ProFeatureGate>| (tier=='free'
       | _shared/tier-config.ts   |                     |  / EliteFeature |  on Pro-only
       |  TIER_TIMEOUTS           |                     |    Gate>        |  feature)
       |  TIER_MODELS             |                     +-----------------+
       |  getTimeout / getModel   |                             |
       +--------------------------+                             | renders locked
                  |                                             | regions as:
                  v                                             v
       +--------------------------+               +---------------------------+
       | _shared/tier-prompts.ts  |               | <LockedSection            |
       |  loadPromptVariant()     |               |   title teaser            |
       |  [auto-prepends GLOBAL_  |               |   requiredTier ctaHref /> |
       |   AI_PRINCIPLES unless   |               +---------------------------+
       |   tier==='free']         |               +---------------------------+
       |  registry: FeatureKey -> |               | <LockedListItem           |
       |   per-tier builders      |               |   index total label       |
       +--------------------------+               |   requiredTier teaser />  |
                  |                                +---------------------------+
                  | dispatches to                        (partial array locks)
                  v
       +--------------------------+
       | _shared/resume-prompts.ts|  (D-04 example feature)
       |  FREE_PROMPT builder     |
       |  PRO_PROMPT builder      |
       |  ELITE_PROMPT builder    |
       +--------------------------+
                  |
                  v
       +--------------------------+         +----------------------------+
       | _shared/anthropic.ts     |<--------| RUN_TIER_VALIDATION=1      |
       | invokeAnthropicText({    |         | tier-validation.test.ts    |
       |   model, timeoutMs, ... })|         |  - live field-presence     |
       +--------------------------+         |  - snapshot token budgets  |
                  |                         +----------------------------+
                  v
          [Anthropic API]                   (manual dev run only — NOT in CI)


  SEPARATE FRONTEND TEST SURFACE
  [Vitest / frontend test runner]
         |
         v
  TEST-11: LockedSection render test (DOM assertion, no Anthropic)
```

### Component Responsibilities

| File (new unless noted) | Responsibility | Phase 14 action |
|-----|-----|-----|
| `supabase/functions/_shared/tier-prompts.ts` | Loader + `FeatureKey` registry + `loadPromptVariant()` + principles auto-prepend | Create |
| `supabase/functions/_shared/global-ai-principles.ts` (optional) | Holds `STRIVO_GLOBAL_AI_PRINCIPLES` string constant | Create (or inline into tier-prompts.ts) |
| `supabase/functions/_shared/tier-config.ts` | `TIER_TIMEOUTS`, `TIER_MODELS`, `getTimeout()`, `getModel()` | Create |
| `supabase/functions/_shared/resume-prompts.ts` (existing) | Refactor inline `isElite` branches into explicit `FREE_PROMPT` / `PRO_PROMPT` / `ELITE_PROMPT` builders | Refactor (keep API surface compatible so Phase 15 can migrate the import later) |
| `supabase/functions/_shared/tier-validation.test.ts` | Deno harness: hybrid live TEST-09 + fixture snapshot TEST-10 | Create |
| `supabase/functions/_shared/tier-validation-fixtures/resume.json` | Token budget snapshot for resume feature | Create after first live run |
| `scripts/run-edge-tests.ps1` (existing) | Register `tier-validation.test.ts` behind `RUN_TIER_VALIDATION=1` gate | Modify |
| `src/components/LockedSection.tsx` | Flat-props locked block primitive (GATE-05) | Create |
| `src/components/LockedListItem.tsx` | Partial-array locked slot primitive (GATE-06) | Create |
| `src/components/EliteFeatureGate.tsx` | Pro-viewing-Elite full-feature gate (GATE-08) | Create |
| `src/components/ProFeatureGate.tsx` (existing, 305 lines) | GATE-07 | Leave unchanged (D-08) |
| `src/components/ProFeatureBlur.tsx` (existing, 37 lines) | v1.0 — mark `@deprecated` JSDoc on default export | Modify (deprecation only) |
| `src/pages/DevLockedSections.tsx` (or similar) | Dev-only sandbox showing every locked primitive variant (SC-4) | Create |
| `src/App.tsx` (existing) | Register dev-only route behind `import.meta.env.DEV` or admin check | Modify |
| `src/components/LockedSection.test.tsx` (or under `__tests__/`) | TEST-11: render + blur + icon + CTA + teaser assertion | Create (gated on Wave 0 frontend test runner install) |

### Recommended Project Structure

```
supabase/functions/_shared/
├── tier-prompts.ts              # NEW — loader + registry + principles auto-prepend
├── global-ai-principles.ts      # NEW (optional sibling)
├── tier-config.ts               # NEW — TIER_TIMEOUTS / TIER_MODELS / getters
├── tier-validation.test.ts      # NEW — Deno harness behind env flag
├── tier-validation-fixtures/    # NEW — snapshot JSON per feature
│   └── resume.json              #   (Phase 14 only; Phases 15-19 add more)
├── resume-prompts.ts            # REFACTOR — explicit FREE/PRO/ELITE builders
├── recruiting-lens-prompts.ts   # unchanged (Phase 18 work)
└── anthropic.ts                 # unchanged — accepts timeoutMs as today

src/components/
├── LockedSection.tsx            # NEW — GATE-05 primitive
├── LockedListItem.tsx           # NEW — GATE-06 primitive
├── EliteFeatureGate.tsx         # NEW — GATE-08 gate
├── ProFeatureGate.tsx           # unchanged — GATE-07
└── ProFeatureBlur.tsx           # @deprecated JSDoc only

src/pages/
└── DevLockedSections.tsx        # NEW — SC-4 sandbox page

scripts/
└── run-edge-tests.ps1           # MODIFY — register harness behind env flag
```

### Pattern 1: Loader Registry with Principles Auto-Prepend

**What:** Feature code never touches per-tier prompts directly. It calls `loadPromptVariant(feature, tier, params)` and gets back a ready-to-send system prompt string. The loader is the ONLY place `STRIVO_GLOBAL_AI_PRINCIPLES` is injected.

**When to use:** Every edge function that calls Anthropic for a tier-gated feature (Phases 15-19).

**Example:**
```typescript
// _shared/tier-prompts.ts  (NEW)
import { STRIVO_GLOBAL_AI_PRINCIPLES } from './global-ai-principles.ts';
import * as resume from './resume-prompts.ts';
// Phase 15+: import * as career from './career-prompts.ts'; etc.

export type Tier = 'free' | 'pro' | 'elite';
export type FeatureKey = 'resume' | 'career' | 'linkedin' | 'recruiting' | 'interview';

type PromptBuilder<P> = (params: P) => string;

interface TierBuilderSet<P> {
  free: PromptBuilder<P>;
  pro: PromptBuilder<P>;
  elite: PromptBuilder<P>;
}

const REGISTRY: Record<FeatureKey, TierBuilderSet<any>> = {
  resume: {
    free: resume.buildFreePrompt,   // NEW export after D-01 refactor
    pro: resume.buildProPrompt,
    elite: resume.buildElitePrompt,
  },
  // Phase 15-19 register here as their phases land
  career: undefined as any,
  linkedin: undefined as any,
  recruiting: undefined as any,
  interview: undefined as any,
};

export function loadPromptVariant<P>(
  feature: FeatureKey,
  tier: Tier,
  params: P,
): string {
  const set = REGISTRY[feature];
  if (!set || !set[tier]) {
    throw new Error(`[tier-prompts] No ${tier} variant registered for ${feature}`);
  }
  const body = set[tier](params);
  // GATE-04: auto-prepend principles for Pro/Elite only
  return tier === 'free'
    ? body
    : `${STRIVO_GLOBAL_AI_PRINCIPLES}\n\n${body}`;
}
```

### Pattern 2: Centralized Tier Config

**What:** One module, one import, audit-friendly. Feature code never hard-codes timeouts or model IDs.

**Example:**
```typescript
// _shared/tier-config.ts  (NEW)
import type { Tier, FeatureKey } from './tier-prompts.ts';

export type CallType = 'core' | 'elite-preview' | 'quiz';

// BACK-12 spec values in ms
export const TIER_TIMEOUTS: Record<Tier, Record<CallType, number>> = {
  free:  { core:  50_000, 'elite-preview':  50_000, quiz: 50_000 },
  pro:   { core: 125_000, 'elite-preview':  65_000, quiz: 80_000 },
  elite: { core: 155_000, 'elite-preview': 155_000, quiz: 80_000 },
};

export function getTimeout(tier: Tier, callType: CallType = 'core'): number {
  return TIER_TIMEOUTS[tier][callType];
}

const FREE_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL_TEXT') ?? 'claude-sonnet-4-5';  // confirm ID

export function getModel(tier: Tier, feature?: FeatureKey): string {
  if (tier === 'free') return FREE_MODEL;  // D-13: cost ceiling, no override
  // Pro/Elite: allow per-feature override (e.g., analyze-career already uses Haiku intentionally)
  // Implementation left to planner per Claude's Discretion note in D-13
  return DEFAULT_MODEL;
}
```

### Pattern 3: LockedSection Flat-Props Primitive

**What:** Pure presentational, no children, no composition surprises. Semantic tokens per CLAUDE.md § Coding Style.

**Example:**
```tsx
// src/components/LockedSection.tsx  (NEW)
import { Lock, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LockedSectionProps {
  title: string;
  teaser: string;
  requiredTier: 'pro' | 'elite';
  ctaHref?: string;
  className?: string;
}

export const LockedSection = ({
  title,
  teaser,
  requiredTier,
  ctaHref = '/pricing',
  className,
}: LockedSectionProps) => {
  const ctaLabel = requiredTier === 'elite' ? 'Upgrade to Elite' : 'Upgrade to Pro';
  return (
    <section
      className={cn(
        'relative rounded-lg border border-border bg-card/50 p-4',
        className,
      )}
      aria-label={`${title} — locked, ${requiredTier} feature`}
    >
      {/* Visible header */}
      <header className="flex items-center gap-2 mb-3">
        <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </header>

      {/* Blurred body — generated placeholder, NOT caller-provided content */}
      <div className="space-y-2 mb-4" aria-hidden>
        <div className="h-3 w-5/6 rounded bg-muted blur-sm" />
        <div className="h-3 w-4/6 rounded bg-muted blur-sm" />
        <div className="h-3 w-3/6 rounded bg-muted blur-sm" />
      </div>

      {/* One-sentence teaser */}
      <p className="text-sm text-muted-foreground mb-3">{teaser}</p>

      {/* Upgrade CTA */}
      <Link to={ctaHref}>
        <Button size="sm" className="gap-2">
          <Crown className="h-4 w-4" />
          {ctaLabel}
        </Button>
      </Link>
    </section>
  );
};
```

### Anti-Patterns to Avoid

- **Feature code importing per-feature prompt modules directly** — defeats GATE-04 enforcement. Always go through `loadPromptVariant()`.
- **Hard-coding Anthropic model IDs or timeouts in `<feature>/index.ts`** — bypass the `tier-config.ts` audit point. Existing code like `recruiting-lens/index.ts:89` (`timeoutMs: isElite ? 155000 : 125000`) should be migrated in Phase 18, not by Phase 14.
- **`<LockedSection>` children API** — D-05 explicitly rejects. Flat props force callers to commit to the same blur placeholder; no fake-preview escape hatch.
- **Using `<ProFeatureBlur>` in new code** — deprecated. Use `<LockedSection>` for block locks, `<LockedListItem>` for array slots, `<ProFeatureGate>`/`<EliteFeatureGate>` for whole-feature locks.
- **Running `tier-validation.test.ts` in CI** — D-15 explicitly rejects. Would burn Anthropic budget on every PR. Keep it dev-manual behind `RUN_TIER_VALIDATION=1`.
- **Hardcoded colors in new locked components** — CLAUDE.md § Coding Style requires semantic tokens (`text-foreground`, `bg-muted`, etc.) — no `#0A66C2`-style literals except when forwarded as a prop (matching `ProFeatureGate`'s `featureColor`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blur + overlay layout | Custom absolute-positioning math | Tailwind `blur-sm` + `backdrop-blur-[2px]` already used in `ProFeatureBlur.tsx:14,19` | Already in the design system; consistent with v1.0 locked look |
| Tier gate wrapper | New context provider for "is this component locked?" | Pass `userTier` prop (pattern in `ProFeatureGate`) and use `requiredTier` prop on primitives | Simpler, no context wiring, matches existing gate pattern |
| Deno test assertions | Custom assertion helpers | `std/assert` module already used in `json-repair.test.ts` | Project convention |
| Icon imports | Custom SVG | Lucide React (`Lock`, `Crown`, `Sparkles`) already used in `ProFeatureBlur` and `ProFeatureGate` | Project standard per package.json |
| Prompt string templating | Custom interpolator | Plain TS template literals (pattern in `resume-prompts.ts`) | Project standard, type-safe, no runtime dependency |
| Token counting | Custom tokenizer | Use Anthropic API response `usage.output_tokens` field | Already returned by `invokeAnthropicText`; no tiktoken dependency needed |
| `/pricing` route | Build a stub page | Leave href as-is; Phase 20 ships the destination | D-09: React Router fallback rendering handles the gap |

**Key insight:** Phase 14 is a pure infrastructure phase — it introduces no new external dependencies, no new build-time tools, no new database tables. Every piece reuses an existing project pattern or library. The only potential new dependency is a frontend test runner (Vitest) for TEST-11, and even that is a Wave 0 gap the planner must close before TEST-11 can be automated.

## Common Pitfalls

### Pitfall 1: Principles Auto-Prepend Bypass

**What goes wrong:** Feature code imports `resume.buildElitePrompt` directly instead of going through `loadPromptVariant('resume', 'elite', params)`. The Pro/Elite response ships without `STRIVO_GLOBAL_AI_PRINCIPLES`, silently failing GATE-04.

**Why it happens:** Per-feature modules are also imported for backward compat during the refactor window. TypeScript doesn't flag it; there's no runtime check unless the harness is run.

**How to avoid:** (a) Mark the per-feature `buildFreePrompt`/`buildProPrompt`/`buildElitePrompt` exports with a `/** @internal — use loadPromptVariant() from tier-prompts.ts */` JSDoc; (b) The TEST-09 harness asserts principles text appears in the Pro/Elite request body; (c) Add an ESLint rule (or code-review checklist item) banning direct imports of `*-prompts.ts` from `<feature>/index.ts` in Phases 15+.

**Warning signs:** Pro/Elite output quality regressions after a Phase 15-19 ship; `STRIVO_GLOBAL_AI_PRINCIPLES` string not findable in the latest Anthropic request log for a feature.

### Pitfall 2: Frontend Test Runner Gap for TEST-11

**What goes wrong:** Phase 14 ships `<LockedSection>` but TEST-11 cannot be automated because the repo has no frontend test runner. Planner defers TEST-11 to "manual visual check" and SC-4 passes TRUE falsely.

**Why it happens:** `package.json` currently has no `vitest`, `jest`, `@testing-library/*`, or `playwright` devDependencies. Existing test coverage is Deno-only (edge functions).

**How to avoid:** Wave 0 adds Vitest + `@testing-library/react` + `jsdom` + a `test:ui` script to `package.json`. If the planner defers frontend test runner installation, TEST-11 must be downgraded to a dev-sandbox manual assertion in SC-4 and re-opened in a later phase.

**Warning signs:** PLAN.md verification steps for GATE-05/06 that read "open `/dev/locked-sections` and visually confirm".

### Pitfall 3: Hard-Coded Timeout Drift

**What goes wrong:** Phase 14 ships `tier-config.ts` but Phase 15 author doesn't migrate `analyze-resume/index.ts:79` (`timeoutMs: 100000`) — the edge function still uses its old number, BACK-12 silently fails.

**Why it happens:** Phase 14 only touches the config module and the resume example. Other hard-coded numbers (6 grep hits across `compare-jobs`, `analyze-career`, `grade-linkedin`, `analyze-skills-gap`, `recruiting-lens`, `analyze-resume`) remain until each feature's gating phase lands.

**How to avoid:** Document this explicitly in the Phase 14 SUMMARY and in each Phase 15-19 CONTEXT as a "migration checklist" item — "Replace hard-coded `timeoutMs` with `getTimeout(tier, callType)`". The planner for each phase must include it.

**Warning signs:** grep for `timeoutMs:\s*\d` in `supabase/functions/**/index.ts` after Phase 19 returns any hits.

### Pitfall 4: Free Model Override Escape Hatch

**What goes wrong:** A Phase 15-19 author thinks "my feature needs Sonnet for Free to avoid quality regression" and adds a per-feature override path that bypasses `TIER_MODELS.free`. Free-tier cost ceiling silently breaks; a single user can trigger a $0.20 analysis.

**Why it happens:** `getModel(tier, feature?)` takes a `feature` param. If the implementation naively allows override for all tiers, Free becomes overridable.

**How to avoid:** D-13 is explicit — the override map applies to Pro/Elite only. `getModel('free', anything)` MUST always return `claude-haiku-4-5-20251001`. Unit-test this in the Deno harness (deterministic, no Anthropic call needed).

**Warning signs:** `getModel('free', ...)` returning anything other than Haiku 4.5 in a test run.

### Pitfall 5: Dev Sandbox Route Leaks to Production

**What goes wrong:** `/dev/locked-sections` is shipped without a `import.meta.env.DEV` guard or admin check. End users discover it, see unbranded component variants, and file confused support tickets.

**Why it happens:** Route registration in `App.tsx` is unconditional; the dev-only intent was documentation-only.

**How to avoid:** Gate the route with `{import.meta.env.DEV && <Route path="/dev/locked-sections" ... />}` — Vite strips it from production builds at build time. Alternatively, gate on an admin-tier check similar to `AdminTierTestContext`.

**Warning signs:** Vite production bundle contains the string `/dev/locked-sections` (grep the build output).

### Pitfall 6: Partial Array Not Numbered Starting at Item Index + 1

**What goes wrong:** `<LockedListItem index={2} total={5}>` renders "Edit 2 of 5 — Locked" but the spec shows item 1 is real content, items 2-5 are locked — so the first locked item should display "Edit 2 of 5" (not "Edit 1 of 4"). Easy off-by-one during consumer integration.

**Why it happens:** Naive consumers iterate `locked.map((_, i) => <LockedListItem index={i} total={locked.length} />)` and get "Edit 0 of 4", "Edit 1 of 4", etc.

**How to avoid:** Document in `<LockedListItem>` JSDoc that `index` is 1-based and represents the item's position in the FULL array (not the locked subset). Show usage example: `suggestions.slice(1).map((_, i) => <LockedListItem index={i + 2} total={suggestions.length} ... />)` — assumes `suggestions[0]` is the real unlocked item.

**Warning signs:** Dev sandbox page shows "Edit 0 of 4" text, or the spec's "item 1 real, items 2-5 locked" example renders as "Edit 2 of 4 — Locked" (wrong total).

## Runtime State Inventory

*(Not applicable — Phase 14 is greenfield infrastructure. No rename, refactor of naming, or migration.)*

The one near-rename concern is `<ProFeatureBlur>` deprecation: D-07 explicitly defers call-site migration to Phases 15-19. No stored data, live config, OS state, secrets, or build artifacts carry the old name — it's a pure source code rename with zero runtime state implications.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno 2+ | Harness + existing edge tests | ✓ (assumed — project standard) | 2+ per CLAUDE.md | — |
| Supabase CLI 2.76.9+ | Deploying refactored shared modules | ✓ | 2.76.9 per CLAUDE.md | — |
| Node 22+ | Frontend build + Vitest (if added) | ✓ | 22+ per package.json | — |
| Anthropic API key (`ANTHROPIC_API_KEY`) | Harness live calls for TEST-09 | ✓ (in Supabase secrets) | — | Dev-only, manual `export ANTHROPIC_API_KEY=...` for local harness runs |
| Sonnet model via `ANTHROPIC_MODEL_TEXT` | Pro/Elite default in `tier-config.ts` | [ASSUMED ✓] | unverified | Fall back to known-good Sonnet ID if env var unset |
| Vitest + `@testing-library/react` + `jsdom` | TEST-11 automation | ✗ NOT INSTALLED | — | Wave 0: add to package.json devDependencies, OR defer TEST-11 to manual check |
| `$3.50 Anthropic budget` for harness live runs | Harness execution | [ASSUMED ✓] | — | Run harness only before shipping a feature |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:**
- Frontend test runner — planner decides Wave 0 install vs. manual-check-only for TEST-11.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno `std/assert` for edge layer; **no frontend test runner currently installed** |
| Config file | `supabase/functions/deno.json` (exists); `vitest.config.ts` (would be new if TEST-11 is automated) |
| Quick run command | `powershell .\scripts\run-edge-tests.ps1` (no tier harness — that's env-gated) |
| Full suite command | `$env:RUN_TIER_VALIDATION='1'; powershell .\scripts\run-edge-tests.ps1` (planner must add registration line) |
| Phase gate | Full edge suite green + dev manually runs tier harness against fixture before ship |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | 3 prompt variants exist per feature (resume only in Phase 14) | unit (Deno) | `deno test --no-check supabase/functions/_shared/tier-prompts.test.ts` | ❌ Wave 0 |
| GATE-02 | Edge function selects variant BY TIER before API call | unit (Deno) | `deno test --no-check supabase/functions/_shared/tier-prompts.test.ts` — assert `loadPromptVariant('resume','pro',params)` differs from `'free'` | ❌ Wave 0 |
| GATE-03 | Free prompt omits locked fields (end-to-end model obedience) | live (Deno + Anthropic) | `$env:RUN_TIER_VALIDATION='1'; deno test --allow-all supabase/functions/_shared/tier-validation.test.ts` | ❌ Wave 0 |
| GATE-04 | Pro/Elite contain `STRIVO_GLOBAL_AI_PRINCIPLES`; Free does not | unit (string diff) | `deno test --no-check supabase/functions/_shared/tier-prompts.test.ts` — assert principles substring present/absent | ❌ Wave 0 |
| GATE-05 | `<LockedSection>` renders header + blur + teaser + CTA | unit (Vitest/RTL) or manual | `npm run test -- LockedSection` (once Vitest added) | ❌ Wave 0 |
| GATE-06 | Partial array renders item 1 + "Edit X of 5 — Locked" 2-5 | unit (Vitest/RTL) or manual | `npm run test -- LockedListItem` | ❌ Wave 0 |
| GATE-07 | `<ProFeatureGate>` retained unchanged | visual / smoke | dev sandbox at `/dev/locked-sections` | ❌ Wave 0 |
| GATE-08 | `<EliteFeatureGate>` gates Pro users on Elite fields | unit (Vitest/RTL) or manual | `npm run test -- EliteFeatureGate` | ❌ Wave 0 |
| GATE-09 | Free tokens < 50% of Elite tokens | snapshot (Deno) | `deno test --no-check supabase/functions/_shared/tier-validation.test.ts` — asserts against `tier-validation-fixtures/resume.json` | ❌ Wave 0 |
| BACK-12 | Timeouts match spec values | unit (Deno) | `deno test --no-check supabase/functions/_shared/tier-config.test.ts` — asserts each pair against spec | ❌ Wave 0 |
| TEST-09 | Field presence per tier | live (Deno + Anthropic) | same as GATE-03 — dev-manual only | ❌ Wave 0 |
| TEST-10 | Token budget assertion | snapshot (Deno) | same as GATE-09 | ❌ Wave 0 |
| TEST-11 | Locked-section render correctness | unit (Vitest/RTL) | `npm run test` (once Vitest added) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `powershell .\scripts\run-edge-tests.ps1` (fast, free — Deno unit tests only)
- **Per wave merge:** Same, plus `npm run lint`
- **Phase gate:** Full Deno suite green + ONE dev-manual run of the tier validation harness (`RUN_TIER_VALIDATION=1`) against the resume fixture before `/gsd-verify-work`. Record the token snapshot. Do NOT run the live harness on every wave merge — Anthropic cost.
- **TEST-11 automation gate:** If Vitest is installed in Wave 0, TEST-11 runs on every commit. If not, TEST-11 becomes a manual visual check at phase gate.

### Wave 0 Gaps

- [ ] `supabase/functions/_shared/tier-prompts.test.ts` — unit tests for loader, principles auto-prepend, registry missing-key behavior (covers GATE-01, GATE-02, GATE-04 via string assertions)
- [ ] `supabase/functions/_shared/tier-config.test.ts` — unit tests asserting BACK-12 spec values exactly, plus Free model override guard
- [ ] `supabase/functions/_shared/tier-validation.test.ts` — hybrid harness scaffold (covers GATE-03/09, TEST-09/10)
- [ ] `supabase/functions/_shared/tier-validation-fixtures/resume.json` — token snapshot (created on first live run)
- [ ] `scripts/run-edge-tests.ps1` — register `tier-prompts.test.ts` + `tier-config.test.ts` unconditionally, `tier-validation.test.ts` behind `$env:RUN_TIER_VALIDATION -eq '1'`
- [ ] Frontend test runner (Vitest + `@testing-library/react` + `jsdom`) install — **required for TEST-11 automation, otherwise TEST-11 degrades to manual check**
- [ ] `vitest.config.ts` + `src/test-setup.ts` (if Vitest added)
- [ ] `src/components/LockedSection.test.tsx` (if Vitest added) — covers GATE-05 + TEST-11
- [ ] `src/components/LockedListItem.test.tsx` (if Vitest added) — covers GATE-06
- [ ] `src/components/EliteFeatureGate.test.tsx` (if Vitest added) — covers GATE-08

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | Phase 14 does not add new auth, but `<LockedSection>` / gates must trust server-authoritative `userTier` from `AiCreditsContext`/session, NOT client-side URL params. Existing `requireAuth` in `_shared/auth.ts` remains the gate. |
| V3 Session Management | no | No new session state introduced |
| V4 Access Control | yes | **CRITICAL** — GATE-03 enforces that Free-tier responses contain no locked fields. This is server-side prompt-level omission, NOT client-side UI hiding. If Free prompt fails to instruct omission, a malicious client could scrape locked fields. TEST-09 harness is the enforcement point. |
| V5 Input Validation | yes | `params: PromptParams` passed to `loadPromptVariant` is already sanitized by existing `prompt-sanitizer.ts` at the edge function entry point. Phase 14 adds no new user-input surface. |
| V6 Cryptography | no | No crypto work |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side tier spoofing (user edits localStorage `tier='elite'` to unlock UI) | Elevation of Privilege | Tier check is server-side at edge function entry (`requireAuth` + profiles table lookup). `<LockedSection>` visibility is UX-only — the locked CONTENT is never generated by the model on Free (GATE-03), so there is nothing for the client to spoof into. |
| Prompt injection via resume text causing Free tier to emit locked fields | Tampering | Existing `_shared/prompt-sanitizer.ts` strips high-confidence injection phrases. Free prompt must additionally use a hard "never emit these fields under any circumstance" instruction. Validated by TEST-09 harness. |
| API key leak via harness running in CI logs | Information Disclosure | D-15 deliberately keeps harness out of CI. When run locally, developer must not paste output into issue trackers unredacted. |
| Cost-ceiling bypass (Free user forced onto Sonnet) | Denial of Service / cost amplification | `getModel('free', ...)` ALWAYS returns Haiku 4.5 per D-13. Unit-tested. |
| Dev sandbox route leaking prod | Information Disclosure | Gate via `import.meta.env.DEV` (Vite strips at build time) or admin-only context check (Pitfall 5) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pro/Elite default Sonnet model ID resolves from `ANTHROPIC_MODEL_TEXT` env var — exact current value not verified in this session | Standard Stack / Pattern 2 | `tier-config.ts` default fallback string needs updating; planner should read the Supabase staging secret to confirm |
| A2 | `STRIVO_GLOBAL_AI_PRINCIPLES` text content from `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — I did not extract the DOCX content; cannot verify final token count of the principles string | Pattern 1 | Principles may be longer than expected and push Pro/Elite prompts above context window limits; planner should extract DOCX to plain text early in Wave 0 and measure |
| A3 | `scripts/test-resumes/medium.txt` is a valid fixture for the resume tier validation harness | Standard Stack | Harness may fail on edge cases (too short to trigger some criteria); planner can swap to `long.txt` if needed |
| A4 | Project has no existing frontend test runner configured | Wave 0 Gaps | I grepped package.json and found no Vitest/Jest/Playwright; if one exists in a non-obvious location, the Wave 0 install step is unnecessary |
| A5 | `claude-haiku-4-5-20251001` is the canonical Free model ID used project-wide | Pattern 2 | Verified in `analyze-career/index.ts:250` but not cross-checked against all other functions — may already be overridden in a Phase 13 secret update |
| A6 | Free Anthropic call cost ceiling of $0.051/analysis is still the PROJECT.md target | Common Pitfalls #4 | I did not re-read PROJECT.md this session; if the target has moved, the pitfall framing needs updating |
| A7 | `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §8.4 is the source of the BACK-12 spec timeout values | CONTEXT verbatim | CONTEXT.md quotes them as canonical; I did not re-verify against the DOCX |

## Open Questions (RESOLVED)

1. **Should `<EliteFeatureGate>` be a copy-paste of `<ProFeatureGate>` (305 lines) or a shared `<TierGate requiredTier>` refactor?**
   - What we know: CONTEXT D-08 leaves this to planner's discretion. `<ProFeatureGate>` is large and animation-heavy.
   - What's unclear: Whether Phase 15-19 authors will diverge the two gates enough that refactoring is premature.
   - RESOLVED: Recommendation: **Copy-paste for Phase 14.** Lower blast radius, faster to ship. Revisit as a Phase 21 cleanup if both gates are still structurally identical after all gating phases land.

2. **Where does `STRIVO_GLOBAL_AI_PRINCIPLES` text live — inline constant in `tier-prompts.ts` or separate `global-ai-principles.ts`?**
   - What we know: D-03 says "lives as a string constant in `_shared/tier-prompts.ts` (or an adjacent `_shared/global-ai-principles.ts`)".
   - What's unclear: Length of the principles text once extracted from DOCX.
   - RESOLVED: Recommendation: **Separate file (`global-ai-principles.ts`).** Keeps `tier-prompts.ts` focused on loader logic. Easier to diff-review principles changes without scrolling past the registry.

3. **Should the Pro elite-preview callType apply only to Recruiting Lens (Phase 18), or do other features have "elite preview" calls?**
   - What we know: BACK-12 spec value is 65s; CONTEXT groups it under Pro only; the existing hard-coded `recruiting-lens/index.ts:89` uses 125s/155s by `isElite`.
   - What's unclear: Whether Phase 18's elite-preview is a second call type distinct from `core`, or a rename of `core` for that one feature.
   - RESOLVED: Recommendation: Define `callType = 'core' | 'elite-preview' | 'quiz'` in `tier-config.ts` and let Phase 18 decide which value to pass. Phase 14 cannot pre-decide.

4. **What gating mechanism for `/dev/locked-sections`?**
   - What we know: D-10 leaves it to the planner (dev builds, admin users, feature flag).
   - What's unclear: Whether admin-only is preferred for live debugging of locked-sections on staging.
   - RESOLVED: Recommendation: Use `import.meta.env.DEV` for first pass (Vite strips at build time — zero production footprint). If a staging debug need arises, add an admin gate in a later phase.

5. **Does Phase 14 refactor `resume-prompts.ts` in place, or create a `resume-prompts.v2.ts` sibling?**
   - What we know: D-04 says Phase 14 ships the loader + one example feature "fully wired". CONTEXT says `analyze-resume/index.ts` already passes `tier` into `promptParams`, so a compatible refactor is possible without breaking the call site.
   - What's unclear: Whether the refactor keeps `buildSystemPrompt`/`buildSystemBlocks`/`buildFallbackPrompt` exports intact (so Phase 15 can migrate the analyze-resume import cleanly) or replaces them.
   - RESOLVED: Recommendation: **Refactor in place and keep existing exports as thin wrappers** that delegate to the new `FREE_PROMPT`/`PRO_PROMPT`/`ELITE_PROMPT` builders. Zero breakage for Phase 14; Phase 15 swaps the analyze-resume import to `loadPromptVariant()` as its first task.

## Project Constraints (from CLAUDE.md)

- **IMPORTANT: NEVER COMMIT anything within `.planning/` or `.gitignore`.** Applies to all plan/research/summary artifacts for Phase 14.
- **Make changes directly in the workspace when asked for implementation.** Phase 14 plans should not introduce a branching/review-only workflow.
- **Prefer small, reversible changes.** Phase 14's "one example feature" (resume) refactor must keep existing exports intact as a safety net.
- **Frontend uses semantic design tokens, not hardcoded colors.** `<LockedSection>`/`<LockedListItem>`/`<EliteFeatureGate>` must use `text-foreground`, `bg-muted`, `border-border`, etc. — no hex literals except when forwarded as caller-provided props (matching `ProFeatureGate`'s `featureColor` precedent).
- **Edge functions use TypeScript strict mode (Deno runtime).** New `tier-prompts.ts` / `tier-config.ts` must pass `deno check` — type every exported function's return.
- **Logging: `console.log('[ComponentName] message')` on frontend; `createLogger('function-name', reqId?)` on edge.** Loader errors (missing registry entry, etc.) use the edge logger pattern.
- **Error handling: discriminated unions with `ok` field for fallible operations.** `loadPromptVariant` can throw (registry miss is a programmer error, not a runtime condition), but any I/O in the harness should return `{ ok: true | false, ... }`.
- **Secrets never logged.** Harness live-call logs must not include the `ANTHROPIC_API_KEY` or the full response body if the body contains any PII from the resume fixture.
- **2-space indentation, semicolons, trailing commas, PascalCase types, camelCase functions, SCREAMING_SNAKE_CASE constants.** `TIER_TIMEOUTS`, `TIER_MODELS`, `STRIVO_GLOBAL_AI_PRINCIPLES` are all SCREAMING_SNAKE.
- **Prefer `rg` for search, `apply_patch` for focused edits.** Execution-phase convention.
- **GSD workflow enforcement:** Plan wave-by-wave; `/gsd-execute-phase` is the correct command for Phase 14.
- **`.planning/` and `.gitignore` are never committed.** Phase 14 SUMMARY/VERIFICATION must be written there, per orchestrator convention.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — all 16 decisions (D-01..D-16) quoted verbatim
- `.planning/REQUIREMENTS.md` — GATE-01..09, BACK-12, TEST-09..11 requirement text + phase mapping table
- `.planning/ROADMAP.md` — Phase 14 Goal + 7 Success Criteria
- `./CLAUDE.md` — project working agreement, stack, conventions, logging/error/security patterns
- `./package.json` — frontend dependency inventory (React 18.3.1, shadcn/ui via Radix, Lucide 0.462.0, Framer Motion 12.23.26, Tailwind 3.4.17, no frontend test runner)
- `supabase/functions/_shared/resume-prompts.ts` (full Read) — existing `Tier`/`PromptParams` types, inline `isElite` branch that Phase 14 refactors, `buildSystemPrompt`/`buildSystemBlocks`/`buildFallbackPrompt` API surface
- `supabase/functions/_shared/` directory listing — confirms existing `anthropic.ts`, `logger.ts`, `prompt-sanitizer.ts`, `usage-checker.ts` ready for reuse
- `supabase/functions/_shared/anthropic.ts` lines 1-50 — confirms `timeoutMs` parameter already exists on `invokeAnthropicText`, no new API needed
- `supabase/functions/analyze-career/index.ts:249-251` — canonical `claude-haiku-4-5-20251001` model ID for Free tier
- `supabase/functions/analyze-resume/index.ts` (grep) — confirms `tier: 'free' | 'pro' | 'elite'` already plumbed through `promptParams` at lines 310-311
- `supabase/functions/recruiting-lens/index.ts:89` — existing hard-coded `timeoutMs: isElite ? 155000 : 125000` that Phase 18 will migrate
- `scripts/run-edge-tests.ps1` (full Read) — existing Deno test runner pattern; `tier-validation.test.ts` registers here behind env flag
- `src/components/ProFeatureBlur.tsx` (full Read) — v1.0 37-line component confirmed; deprecation target for Phase 14
- `src/components/ProFeatureGate.tsx` lines 1-60 — confirms 305-line animated gate using Framer Motion, Radix Button, Lucide icons

### Secondary (MEDIUM confidence)

- `scripts/test-resumes/` directory listing — confirms `short.txt`, `medium.txt`, `long.txt` fixtures exist for harness use

### Tertiary (LOW confidence)

- None — Phase 14 research is fully grounded in the codebase and CONTEXT.md. No WebSearch required.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library verified against package.json or codebase grep
- Architecture: HIGH — matches CONTEXT D-01..D-16 exactly; builds on verified existing patterns
- Pitfalls: HIGH — each pitfall traced to a specific codebase line or CONTEXT decision
- Validation architecture: MEDIUM — Deno test framework confirmed, but frontend test runner gap introduces TEST-11 uncertainty
- Security domain: HIGH — no new attack surface; existing auth/sanitizer/CORS layer is authoritative

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable infrastructure domain; revisit only if Phase 13 ships introduce conflicting shared-layer changes)
