# Phase 14: tier-prompts-and-locked-section-primitive - Context

**Gathered:** 2026-04-14
**Status:** Ready for research / planning

<domain>
## Phase Boundary

Ship the shared infrastructure that powers every tier-gated feature in Phases 15–19:

1. **Tier-variant prompt loader** — three variants per feature (`_free`, `_pro`, `_elite`), selected server-side before any Anthropic call. Pro/Elite variants automatically receive `STRIVO_GLOBAL_AI_PRINCIPLES`; Free does not. (GATE-01..04)
2. **UI primitives** — `<LockedSection>` for partial-feature locks, `<LockedListItem>` for partially-locked arrays, `<ProFeatureGate>` (retained from v1.0) for whole-feature Free locks, new `<EliteFeatureGate>` for Pro-viewing-Elite locks. (GATE-05..08)
3. **Per-tier timeout + model config** — centralized module exporting timeouts (Free 50s / Pro core 125s / Pro elite-preview 65s / Elite 155s / Quiz 80s) and Free-tier model routing (Haiku 4.5). (BACK-12)
4. **Tier-output validation harness** — Deno test framework for field-presence + token-budget assertions (TEST-09, TEST-10, TEST-11), scaffolded with one example feature.

Closes GATE-01..09, BACK-12, TEST-09..11.

**Out of scope for this phase:**

* Applying tier gating to any specific feature — that is Phases 15 (resume), 16 (linkedin), 17 (career), 18 (recruiting), 19 (interview prep)
* Writing the final Free/Pro/Elite prompt bodies for all features — Phase 14 only ships the loader + one example (likely resume, since `resume-prompts.ts` already has `tier` plumbing) to validate the pattern
* Merit deduction / balance checks — already landed in Phase 13
* `MERIT_SYSTEM_ENABLED` feature flag — Phase 13
* Any changes to v1.0 `<ProFeatureBlur>` call sites — deprecation is marked in Phase 14, migrations happen lazily in Phases 15–19

</domain>

<decisions>
## Implementation Decisions

### Prompt Variant Storage + Loader

* **D-01:** Tier variants are stored as **TypeScript string constants**, not `.md` files. Each feature gets a `supabase/functions/_shared/<feature>-prompts.ts` (or evolves the existing one) exporting `FREE_PROMPT`, `PRO_PROMPT`, `ELITE_PROMPT` builders. Matches the existing `resume-prompts.ts` / `recruiting-lens-prompts.ts` pattern, bundles cleanly into Deno edge functions, gets compile-time type-checked, no file-system read at cold start. Rejected: `.md` files (diverges from existing pattern, adds runtime I/O), hybrid (unnecessary complexity for the spec's requirement).
* **D-02:** A **single shared loader** lives in `supabase/functions/_shared/tier-prompts.ts` and exports `loadPromptVariant(feature: FeatureKey, tier: Tier, params: PromptParams): string`. It owns a registry mapping each `FeatureKey` to its per-tier builder functions. One import point for every edge function — Phase 15+ features import this loader, never the underlying per-feature prompt modules directly. Easy to audit GATE-01/02 compliance.
* **D-03:** `STRIVO_GLOBAL_AI_PRINCIPLES` is **auto-prepended by the loader** when `tier !== 'free'`. The loader is the single enforcement point for GATE-04 — feature authors cannot forget to include principles, and Free is cost-ceiling-safe by construction. The principles text itself lives as a string constant in `_shared/tier-prompts.ts` (or an adjacent `_shared/global-ai-principles.ts`), sourced from `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx`.
* **D-04:** Phase 14 ships the loader + **one example feature fully wired** (resume, since its prompt module already has `tier: 'free' | 'pro' | 'elite'` plumbed). The other four features (career, linkedin, recruiting, interview) register stubs or are added to the loader registry in Phases 15–19 as each feature's gating phase lands. Keeps Phase 14 scope tight and doesn't preemptively write prompts that Phase 15+ decisions may change.

### `<LockedSection>` + `<LockedListItem>`

* **D-05:** `<LockedSection>` uses a **flat-props API** — no children. Signature:
  ```TSX
  <LockedSection
    title="Power Phrases"
    teaser="Elite unlocks 5–8 industry-specific phrases"
    requiredTier="elite"                    // 'pro' | 'elite'
    ctaHref="/pricing"                      // default
  />
  ```
  The blurred body is a generated placeholder (e.g., skeleton lines). Callers don't build fake previews. Rationale: the spec (§7.2) requires "visible header + blurred body + 1-sentence teaser + upgrade CTA" — all four are pure props, no composition needed. Simple, declarative, one component handles every locked-section use case in Phases 15–19.
* **D-06:** Partially-locked arrays (GATE-06) render via a **dedicated** **`<LockedListItem>`** **primitive**, NOT a variant prop on `<LockedSection>`. Signature:
  ```TSX
  <LockedListItem index={2} total={5} label="Edit" requiredTier="pro" teaser="…" />
  ```
  Callers map over locked slots and render one `<LockedListItem>` per slot, next to the real unlocked first item. Example from GATE-06: resume `rewriteSuggestions` — Free users see item 1 as a real card, items 2–5 as `<LockedListItem index={i} total={5} label="Edit" requiredTier="pro" />`. Rationale: composable, matches the "Edit X of N — Locked" text pattern in the spec, keeps `<LockedSection>` focused on block-level locks.
* **D-07:** **Existing** **`<ProFeatureBlur>`** **(v1.0, 37 lines, src/components/ProFeatureBlur.tsx) is marked** **`@deprecated`** but NOT removed in Phase 14. New code uses `<LockedSection>` + `<ProFeatureGate>`. Migration of existing call sites happens lazily when each feature's gating phase (15–19) touches them. Rejected: aggressive refactor (touches v1.0 production code, higher blast radius in Phase 14).
* **D-08:** **Existing** **`<ProFeatureGate>`** **(305 lines) is retained unchanged** and is the implementation of GATE-07. A new sibling **`<EliteFeatureGate>`** is added in Phase 14 for GATE-08 (Pro users viewing Elite-only fields). `<EliteFeatureGate>` is structurally a copy with different copy ("Upgrade to Elite") and different CTA destination. Both gates take `userTier` and render children only when the required tier is satisfied.
* **D-09:** The `ctaHref` default for `<LockedSection>` / `<LockedListItem>` / `<EliteFeatureGate>` is `/pricing`. Phase 14 does NOT own the `/pricing` route — that lands in Phase 20. The links still work pre-Phase-20 because React Router will render whatever fallback exists; Phase 20 ships the destination.

### Test Page for `<LockedSection>` (SC-4)

* **D-10:** The "at least one test page" required by SC-4 is a **new dev-only sandbox route** at `/dev/locked-sections` (or similar), showing every `<LockedSection>` + `<LockedListItem>` + `<EliteFeatureGate>` variant in one place. Gated to dev builds or admin users so it doesn't leak into production UX. Doubles as living documentation for Phases 15–19 authors. Rejected: wiring into a real feature page (entangles Phase 14 with Phase 15 scope), Storybook (overhead for unclear gain given no existing gallery).

### Per-Tier Timeout + Model Config

* **D-11:** All per-tier timeout and model config lives in a new **`supabase/functions/_shared/tier-config.ts`** module. Exports at minimum:
  * `TIER_TIMEOUTS` — spec values from BACK-12 (Free 50,000ms / Pro core 125,000ms / Pro elite-preview 65,000ms / Elite 155,000ms / Quiz 80,000ms)
  * `TIER_MODELS` — Free → Haiku 4.5 (`claude-haiku-4-5-20251001`), Pro/Elite → Sonnet default with per-feature override support
  * `getTimeout(tier: Tier, callType?: 'core' | 'elite-preview' | 'quiz'): number` — single function picks the right value
  * `getModel(tier: Tier, feature?: FeatureKey): string` — single function returns the model id
    One import point, auditable in review, spec values live in exactly one place. Rejected: extending `_shared/anthropic.ts` (bloats the HTTP client, mixes "how to call" with "what to call"), per-feature config (no central enforcement, drifts from spec).
* **D-12:** `getTimeout` is **keyed by (tier, callType)**. Caller passes `callType` explicitly when it matters (Pro has two distinct values). Matches the spec's 5 distinct BACK-12 values without overloading a single `tier` axis. Default `callType` is `'core'`.
* **D-13:** Free-tier model routing to Haiku 4.5 lives in `TIER_MODELS` and is the **single enforcement point** for the PROJECT.md cost ceiling (≤ \$0.051/analysis for Free). Pro/Elite can override per-feature (e.g., `analyze-career` already uses Haiku 4.5 intentionally — the override map allows that) but Free never can. Phase 15+ features call `getModel('free')` and get Haiku back; they cannot accidentally use Sonnet for Free.

### Tier-Output Validation Harness (TEST-09/10/11)

* **D-14:** The harness is **hybrid: live-model for field-presence (TEST-09), fixture snapshots for token budgets (TEST-10)**.
  * **Field-presence (TEST-09):** Deno test runs the three tier variants against a golden resume fixture, calls Anthropic live, asserts Free response contains only Free fields / Pro contains Pro fields / Elite contains all fields. Opt-in via env flag (`RUN_TIER_VALIDATION=1`) and `deno test --allow-net`.
  * **Token budgets (TEST-10):** Live runs write token counts to a JSON snapshot file. The "Free tokens < 50% of Elite tokens" assertion runs against the snapshot — deterministic, free to re-run in CI if ever desired, and records a historical trendline.
  * **Locked-section rendering (TEST-11):** Separate Vitest / Playwright test that asserts `<LockedSection>` / `<LockedListItem>` render blur + icon + CTA + teaser correctly. Lives in frontend test suite, runs on every PR (no Anthropic dependency).
    Rationale: pure live is slow/costly/flaky, pure fixture doesn't verify model obedience, hybrid gets the best of both.
* **D-15:** Harness location: **`supabase/functions/_shared/tier-validation.test.ts`** lives next to other Deno tests. Registered in `scripts/run-edge-tests.ps1` **behind an env flag** (`RUN_TIER_VALIDATION=1`) so normal `run-edge-tests` stays fast and free. Dev runs it manually before shipping a feature or editing a prompt. CI does NOT run it by default — Phase 14 explicitly avoids burning Anthropic budget on every PR.
* **D-16:** Phase 14 ships the harness **scaffold plus one example feature** (resume, matching D-04). Phases 15–19 each add their feature to the harness as they land by registering a `TierValidationFixture` entry. Keeps Phase 14 scope tight; avoids writing prompts for features whose Phase-X decisions may still be in flux.

### Claude's Discretion (Planner / Researcher decides)

* Exact file layout: one big `_shared/tier-prompts.ts` vs. one loader file importing feature modules — planner picks based on module size after one example feature is refactored.
* Exact TypeScript types for `Tier`, `FeatureKey`, `PromptParams` — may reuse existing types from `resume-prompts.ts` where compatible.
* Whether `TIER_MODELS` uses a flat map or a function — either fine as long as `getModel(tier, feature?)` is the public API.
* The skeleton style for `<LockedSection>`'s blurred body (shimmer bars, lorem-ipsum blur, etc.) — any visually consistent placeholder works.
* Exact dev sandbox route path (`/dev/locked-sections`, `/_dev/locks`, etc.) and its gating mechanism (admin-only, NODE\_ENV check, feature flag) — planner picks.
* Whether `<EliteFeatureGate>` is a copy-paste of `<ProFeatureGate>` or a shared `<TierGate requiredTier="…">` refactor — planner decides based on code duplication vs. refactor blast radius.
* Exact fixture resume used for the harness — planner picks from `scripts/test-resumes/`.
* Naming for env flag (`RUN_TIER_VALIDATION=1` is indicative).

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before research or implementation.**

### Spec (Source of Truth)

* `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §4.0 (prompt-level omission, not UI hiding), §7.2 (LockedSection primitive), §7.3 (ProFeatureGate / EliteFeatureGate), §8.3 (tier prompt variants, GLOBAL\_AI\_PRINCIPLES), §8.4 (per-tier timeouts), §11.3 (TEST-09/10/11 validation rules)
* `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — source text for `STRIVO_GLOBAL_AI_PRINCIPLES` constant (D-03)

### Requirements

* `.planning/REQUIREMENTS.md` — GATE-01..09, BACK-12, TEST-09..11 (the 13 REQ-IDs Phase 14 closes)
* `.planning/ROADMAP.md` §"Phase 14: tier-prompts-and-locked-section-primitive" — 7 Success Criteria that VERIFICATION.md must prove TRUE

### Existing Code to Refactor or Reuse

* `supabase/functions/_shared/resume-prompts.ts` — already has `tier: 'free' | 'pro' | 'elite'` plumbed and `isElite` branching inline. Phase 14 formalizes this into the three-variant pattern. D-04's "one example feature" refers to this module.
* `supabase/functions/_shared/recruiting-lens-prompts.ts` — similar shape, refactored in Phase 18 (out of Phase 14 scope).
* `supabase/functions/analyze-resume/index.ts` — already passes `tier` into `promptParams` (lines 310–311); Phase 15 will swap its direct prompt import for the new loader.
* `supabase/functions/_shared/anthropic.ts` — callers will read timeouts from `tier-config.ts` instead of hard-coded or env-based values. Do NOT fold `tier-config.ts` into this file (D-11 rejection).
* `src/components/ProFeatureGate.tsx` (305 lines) — GATE-07, retained unchanged. Sibling `<EliteFeatureGate>` is added in Phase 14.
* `src/components/ProFeatureBlur.tsx` (37 lines) — marked `@deprecated` in Phase 14. Migrations are lazy (D-07).

### Prior Phase Context

* `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — RLS service-role-only pattern established in Phase 10 (via Phase 07 D-06) carries forward project-wide. Phase 14 has no DB work so this is background context only.

### Design System

* `CLAUDE.md` § Technology Stack — Radix UI, Tailwind CSS, shadcn/ui, Framer Motion, HSL CSS variables, semantic tokens. `<LockedSection>` and `<LockedListItem>` must use semantic tokens, not hardcoded colors.

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* **`resume-prompts.ts`** already has the `Tier` type and threads it through `PromptParams`. The loader (`loadPromptVariant`) can wrap the existing `buildSharedPrefix` + per-call suffix functions without rewriting the prompt body.
* **`<ProFeatureGate>`** (305 lines) implements GATE-07 as-is; Phase 14 does NOT rewrite it, only adds a sibling `<EliteFeatureGate>`.
* **`_shared/anthropic.ts`** has `invokeAnthropicText` with configurable timeouts — callers will read from `tier-config.ts` instead of passing magic numbers.
* **`scripts/run-edge-tests.ps1`** is the existing Deno test runner — the tier validation harness registers here behind an env flag.
* **`scripts/test-resumes/`** already has fixtures that the validation harness can consume as golden inputs.

### Established Patterns

* **TS-first prompt authoring** — `resume-prompts.ts` and `recruiting-lens-prompts.ts` are both TS builders with template literals. D-01 continues this, rejecting `.md` files.
* **Semantic design tokens + shadcn/ui** — any new component must follow the "Institutional Intelligence" design system from PROJECT.md (HSL CSS variables, glass effects, Framer Motion).
* **Deno tests + env-flagged network access** — `scripts/run-edge-tests.ps1` already runs Deno tests; `RUN_TIER_VALIDATION=1` follows the same opt-in pattern used elsewhere for expensive / network-touching tests.
* **Additive, non-breaking changes to v1.0 code** — Phase 14 does NOT rewrite `<ProFeatureBlur>` call sites. Deprecation is marked; migrations are lazy in Phases 15–19.

### Integration Points

* **Phase 15 (resume-analysis-gating)** is the first consumer of `loadPromptVariant` and `getTimeout` / `getModel`. Phase 14's example feature MUST be resume so Phase 15 can reuse it directly.
* **Phase 16–19** each register their feature in the loader registry + validation harness as they land.
* **Phase 20** delivers the `/pricing` route that `<LockedSection>` / `<LockedListItem>` / `<EliteFeatureGate>` CTAs point to. Phase 14 uses `/pricing` as the default `ctaHref` even though the route doesn't exist yet — React Router's fallback rendering handles the gap.

\</code\_context>

<specifics>
## Specific Ideas

* The existing `isElite` branching inline in `resume-prompts.ts` (lines \~55–68) is the v1.0 precursor of what Phase 14 formalizes. The refactor path is: lift the three branches into explicit `FREE_PROMPT` / `PRO_PROMPT` / `ELITE_PROMPT` builders, then have `loadPromptVariant('resume', tier, params)` dispatch to the right one.
* The loader's auto-prepend of `STRIVO_GLOBAL_AI_PRINCIPLES` for Pro/Elite (D-03) is the load-bearing enforcement point for GATE-04. Don't let feature code bypass the loader "for flexibility" — that defeats the audit story.
* The dev-only sandbox route (`/dev/locked-sections`) doubles as living documentation. Make it exhaustive (every variant, every tier combination) so Phase 15–19 authors have a copy-paste reference.
* The validation harness (D-14) field-presence assertions are how TEST-09 stops being a manual checklist item and becomes a reproducible deploy gate — same philosophy as Phase 10's `DO $$ … RAISE EXCEPTION` verification block.
* Free-tier cost ceiling (\$0.051/analysis) is enforced structurally by D-13's `TIER_MODELS.free = Haiku 4.5`. This is a cost decision, not a UX decision — do not let Phase 15+ override it for Free.

</specifics>

<deferred>
## Deferred Ideas

* **Applying tier gating to any specific feature** — Phases 15 (resume), 16 (linkedin), 17 (career), 18 (recruiting), 19 (interview).
* **Writing Free/Pro/Elite prompt bodies for career / linkedin / recruiting / interview** — their respective gating phases. Phase 14 only ships the loader + one worked example (resume).
* **Migrating** **`<ProFeatureBlur>`** **call sites to** **`<LockedSection>`** — lazy migration in Phases 15–19 as each feature's page is touched.
* **`/pricing`** **route** — Phase 20.
* **Running the tier validation harness in CI** — deferred indefinitely; Phase 14 ships it as a manual dev tool behind an env flag. Revisit only if tier prompt regressions become a real problem in production.
* **Storybook-style component gallery** — rejected in favor of a single dev-only sandbox route; revisit if the team grows and needs richer component docs.
* **Refactoring** **`<ProFeatureGate>`** **and** **`<EliteFeatureGate>`** **into a shared** **`<TierGate>`** **component** — Claude's Discretion for the planner; not pre-decided here.

</deferred>

***

*Phase: 14-tier-prompts-and-locked-section-primitive*
*Context gathered: 2026-04-14*
