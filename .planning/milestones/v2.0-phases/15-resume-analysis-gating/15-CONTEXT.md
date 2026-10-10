# Phase 15: resume-analysis-gating - Context

**Gathered:** 2026-04-15
**Status:** Ready for research / planning

<domain>
## Phase Boundary

Make `analyze-resume` tier-aware by wiring it onto the Phase 14 shared infrastructure and the Phase 13 Merit gateway:

1. **Resolve tier server-side** from the `subscriptions` table (no client trust).
2. **Use `loadPromptVariant('resume', tier, promptParams)`** from Phase 14 instead of direct prompt imports.
3. **Enforce per-tier `maxTokens` caps** — Free 6000 / Pro 16000 / Elite 20000 — and re-derive parallel-call budgets from those caps (RES-05, RES-06).
4. **Shape Free output** to spec (RES-01/02): `overallScore`, `executiveSummary`, `resumeSignal`, full `strengths`, exactly 1 `priorityImprovements` entry, only C1 `criterionFeedback` detailed (C2–C11 score-only), and zero Pro/Elite fields.
5. **Pro output** (RES-03): all 11 criteria with 3–4 points each, 5–7 rewrites, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`.
6. **Elite output** (RES-04): all Pro fields plus `interviewLikelihood`, `competitiveRanking`, `recruiterFirstImpressions`, `hiddenWeaknesses`, `powerPhrases`, `detailedATSGapAnalysis`.
7. **Merit deduction** 3/2/3 (Free/Pro/Elite) via `withMerits` wrapping all parallel calls, with refund on Anthropic upstream failure (Phase 13 contract).
8. Tier gating applies **regardless of `MERIT_SYSTEM_ENABLED`** — the flag gates billing semantics only, not output shape.

Closes: RES-01, RES-02, RES-03, RES-04, RES-05, RES-06, BACK-08.

**Out of scope for this phase:**

- Tier gating for any other feature — Phases 16 (LinkedIn), 17 (Career), 18 (Recruiting Lens), 19 (Interview Prep).
- Phase 14's loader, tier-config, LockedSection/LockedListItem, EliteFeatureGate — consumed, not modified.
- Phase 13's `withMerits`, `MERIT_SYSTEM_ENABLED`, refund taxonomy — consumed, not modified.
- Frontend Results page changes to render new Elite fields or locked C2–C11 criteria — Results.tsx updates happen in Phase 15 only to the extent needed to not crash on the new shape; rich Elite presentation lands alongside Phase 20's pricing/paywall polish.
- Any change to `process-resume-analysis-job` or the async queue path (submit-time deduction already decided in Phase 13 D-07).
- Changes to `analyze-career` / `recruiting-lens` merger utilities.

</domain>

<decisions>
## Implementation Decisions

### Tier Source of Truth

- **D-01:** Tier is resolved **server-side from the `subscriptions` table** at the top of the `analyze-resume` handler, keyed by `authenticatedUserId`. The existing `rawBody.tier` read at `supabase/functions/analyze-resume/index.ts:208` is removed — any client-supplied tier is ignored. Rationale: Phase 12 establishes `subscriptions` as the Stripe-authoritative source; trusting `rawBody.tier` today lets any client claim Elite and is a silent cost/billing defect.
- **D-02:** Tier lookup is **read once, cached in a local `const resolvedTier`**, and threaded into `promptParams`, `CALL_CONFIGS` selection, `withMerits(cost)`, and the shaper. One DB round-trip per request. No re-reads inside the parallel fan-out — mid-request tier drift is not a concern.
- **D-03:** **Missing subscription row → default to `'free'`**, log a warn (`log.warn('subscription-missing', { userId })`) so support can reconcile against Stripe. Rationale: fail-closed on cost, don't block brand-new signups during the Stripe webhook race window. An explicit 403 was rejected.
- **D-04:** Service-role `supabase.from('subscriptions').select('tier').eq('user_id', userId).maybeSingle()` pattern — matches existing RLS service-role-only pattern carried from Phase 10. The query lives inline in the handler for now; if Phase 16–19 duplicate this block, extract to `_shared/resolve-tier.ts` in the first phase that needs to refactor.

### Elite-Only Field Delivery

- **D-05:** Elite-only fields are produced by a **new 4th parallel call** named `'elite-extras'`, only fired when `resolvedTier === 'elite'`. Free/Pro execute the existing 3 calls (`criteria-1`, `criteria-2`, `summary`) with zero added latency. Rationale: isolating Elite cost from Free/Pro, preserving their latency, and letting the merger conditionally fold in the new fields is cleaner than expanding the existing `summary` call (which would balloon its `maxTokens` past safe single-call limits) or adding a sequential dependent call (which would add ~8–15s to the highest-paying tier).
- **D-06:** The `'elite-extras'` call is added to `CALL_CONFIGS` as a new entry with `maxTokens: 4000` for Elite, `0` (not fired) for Free/Pro. The existing fan-out loop in `executeParallelCalls` skips any config whose tier budget is 0. `result-merger` gains an optional `eliteExtras` branch that no-ops when the field is absent in the merged result.
- **D-07:** Prompt for `'elite-extras'` is a new builder in `resume-prompts.ts` (`buildEliteExtrasSystem` / returns only the 6 Elite-only fields as strict JSON). Phase 14's `loadPromptVariant` is the loader entry point; the elite-extras builder is wired through that loader by registering it under the `'resume'` feature key alongside the existing variants. Free and Pro variants do NOT declare the elite-extras fields at all — they can't leak even if the model hallucinates.

### Merit Deduction Integration

- **D-08:** A single `withMerits(authenticatedUserId, 'resume_analysis', tierCost, async () => { ...all parallel calls... })` call wraps the entire fan-out (3 calls for Free/Pro, 4 for Elite). One transaction, one refund on any upstream failure, matching Phase 13 D-03's "gateway owns refund control flow" contract. Tier cost is `{ free: 3, pro: 2, elite: 3 }` per spec §4.1 / RES-01/03/04.
- **D-09:** `MERIT_SYSTEM_ENABLED=false` **still runs the tier-gated output path**. Only Merit deduction is gated on the flag. Legacy `can_perform_ai_action` + `checkAndRecordUsage` remain the quota mechanism for the flag-off path; a Free user's new 1-priority-improvement output still counts as **1 quota unit** on the legacy path (no cap adjustment). Rationale: decouples output-shape correctness from billing-engine cutover — we can QA tier gating in prod before flipping the Merit flag, and rolling back Merits doesn't regress Free/Pro delta users will have already seen. Rejected: "flag gates everything" (couples the two changes into one deploy), "Elite-extras only on flag-on" (creates a weird downgrade-at-flip moment).
- **D-10:** `resume_analysis` is the gateway's `feature` key. Matches Phase 13 D-07's enumerated feature list. Pooled 60/hr rate limit (Phase 13 D-08) applies before deduction.

### Free-Shape Enforcement (Defense in Depth)

- **D-11:** Free output shape is enforced at **both layers**: (a) `loadPromptVariant('resume','free')` instructs the model to omit all locked fields and return detailed feedback only for C1, and (b) a new `applyTierShape(merged, tier)` step at the end of `result-merger.mergeAndValidateResults` **strips any Pro/Elite-only keys** from the merged JSON using a `FREE_ALLOWED_FIELDS` whitelist before returning. A leaky prompt regression cannot reach a Free user. Rejected: "prompt-only + harness" (TEST-09 is opt-in, so prod regressions between harness runs are possible).
- **D-12:** `applyTierShape` lives **in `supabase/functions/_shared/result-merger.ts`**, as a new final step inside `mergeAndValidateResults`, receiving `tier` as a parameter. Single exit point means every current and future caller of the merger benefits without remembering to call it. Rejected: new `_shared/tier-output-shaper.ts` module (adds a function handlers must remember to invoke), inline in `analyze-resume/index.ts` (each future feature reimplements).
- **D-13:** `capPriorityImprovements` (currently at `analyze-resume/index.ts:51`) is updated from `{ free: 4, pro: 5, elite: 7 }` to `{ free: 1, pro: 5, elite: 7 }` per RES-01. This cap runs inside the new `applyTierShape` step so Pro's 16–19 gating phases inherit the correct behavior for free. The caller-side `capPriorityImprovements` call site in `analyze-resume/index.ts` is removed in favor of the merger-level enforcement.
- **D-14:** The C1-only-feedback rule (RES-01: C2–C11 score-only) is enforced via **prompt + shaper**:
  - The Free prompt says *"return detailed feedback only for Criterion 1 (Visual Clarity); criteria 2–11 return `{ criterion, score }` only."*
  - `applyTierShape` walks `criterionFeedback[]` (or whatever the merged field is named) for Free tier and drops every key except `criterion` and `score` from entries 2–11. Deterministic shape even if the model returns full feedback.
- **D-15:** The `FREE_ALLOWED_FIELDS` whitelist is authored from the RES-01 spec list, colocated with `applyTierShape` inside `result-merger.ts`. Pro and Elite whitelists are additive supersets (`PRO_ALLOWED_FIELDS = [...FREE_ALLOWED_FIELDS, ...PRO_ADDITIONS]`, `ELITE_ALLOWED_FIELDS = [...PRO_ALLOWED_FIELDS, ...ELITE_ADDITIONS]`) — three tiers, one source of truth per field.

### Parallel-Call Budget Split

- **D-16:** Per-tier `maxTokens` caps live in `supabase/functions/_shared/tier-config.ts` (Phase 14) as `TIER_MAX_TOKENS = { free: 6000, pro: 16000, elite: 20000 }`. Per-feature call budgets live in each feature's own handler (`CALL_CONFIGS` in `analyze-resume/index.ts`). Phase 14 owns the **cap**; Phase 15 owns **how this feature spends its cap**. Rationale: Phase 16 LinkedIn uses 4000/8192, not a 3-way split — per-feature budgets don't generalize. Rejected: "tier-config.ts owns everything" (bloats the module, leaks feature internals).
- **D-17:** Budget split strategy is **evidence-weighted (~30/30/40)** — summary call gets the largest share because it carries `executiveSummary`, `resumeSignal`, and the Pro-new `rewriteSuggestions` / `industryGuess` / `suggestedTargetRoles` / `recommendedKeywords`. Updated `CALL_CONFIGS` values:
  - **Free (cap 6000):** `criteria-1: 1800`, `criteria-2: 1800`, `summary: 2400`. Sum = 6000. Unchanged from today — Free already fit.
  - **Pro (cap 16000):** `criteria-1: 4800`, `criteria-2: 4800`, `summary: 6400`. Sum = 16000. Today's Pro is under-budget at 6400 total — this spends the full spec allocation on deeper criterion points, more rewrites, and room for the Pro-new fields.
  - **Elite (cap 20000):** `criteria-1: 5000`, `criteria-2: 5000`, `summary: 6000`, `elite-extras: 4000`. Sum = 20000. Elite base is slightly below Pro because the elite-extras call carries all the Elite-only narrative.
- **D-18:** A **boot-time assertion** in `analyze-resume/index.ts` verifies `sum(CALL_CONFIGS[tier]) <= TIER_MAX_TOKENS[tier]` for all three tiers. Throws at module load if a future edit miscounts. Single line, fails loudly, zero runtime cost. Same pattern as the model-id assertions already in the repo.
- **D-19:** The 4000-token budget for `'elite-extras'` is a **Phase 15 starting guess** sized for 6 narrative fields at ~600 tokens each plus safety margin. Phase 15's tier-validation harness entry (TEST-09, live Anthropic) will measure actual token counts — if `detailedATSGapAnalysis` alone consistently exceeds 1500 tokens, a follow-up patch bumps Elite base-call budgets down and elite-extras up. Do not pre-optimize; measure first.

### Claude's Discretion (Researcher / Planner decides)

- The exact `FREE_ALLOWED_FIELDS` list — planner cross-references RES-01 spec §4.1 against the actual merged JSON shape emitted today.
- Whether `applyTierShape` uses a whitelist-keep or blacklist-strip implementation internally — same observable behavior, planner picks whichever is cleaner.
- Exact Pro / Elite additive field lists — derived from RES-03 / RES-04 spec once the merged JSON keys are enumerated.
- Shape of the `'elite-extras'` prompt builder's system block — tone, temperature, whether it reuses `buildSystemBlocks` patterns or ships a fresh system string.
- Whether `resolveTier()` is extracted into `_shared/resolve-tier.ts` in Phase 15 or left inline until Phase 16 needs the same helper. Lazy extraction is acceptable.
- Whether the legacy-path quota key changes, or stays `resume_analysis` with current usage_tracking semantics — Phase 13 left this alone, and Phase 15 has no reason to touch it.
- Whether the boot-time assertion lives in `analyze-resume/index.ts` or in `tier-config.ts` as a register-then-validate pattern. Either is fine as long as an incorrect split fails at module-load time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before research or implementation.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §4.1 (per-tier field tables for resume), §8.2 (tier maxTokens + parallel-call budgets), §8.3 (tier prompt variants), §11.3 (TEST-09/10 validation rules).
- `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — injected automatically by Phase 14 loader for Pro/Elite; Phase 15 does NOT re-inject.

### Requirements

- `.planning/REQUIREMENTS.md` — RES-01, RES-02, RES-03, RES-04, RES-05, RES-06, BACK-08 (the 7 REQ-IDs Phase 15 closes).
- `.planning/ROADMAP.md` §"Phase 15: resume-analysis-gating" — 6 Success Criteria that VERIFICATION.md must prove TRUE.

### Prior Phase Context (MUST read)

- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 (loader is the only import point), D-03 (auto-prepend of GLOBAL_AI_PRINCIPLES), D-04 (resume is the example feature wired in Phase 14), D-11..D-13 (tier-config.ts, `TIER_MAX_TOKENS`, `getModel`/`getTimeout`). Phase 15 consumes all of these.
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 (`withMerits` in `_shared/merit-gateway.ts`), D-02 (refund only on Anthropic upstream failure), D-03 (gateway owns refund flow), D-06 (flag branching inside each feature handler), D-07 (feature list, `resume_analysis` is enumerated), D-08/D-09 (pooled 60/hr rate limit runs before deduction).
- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — establishes `subscriptions` as tier source of truth. D-01's tier resolution depends on this.

### Existing Code to Modify or Reuse

- `supabase/functions/analyze-resume/index.ts` — primary target. Lines 44–48 (`CALL_CONFIGS`), 51–57 (`capPriorityImprovements`), 59–140 (`executeParallelCalls`), 208 (`userTier = rawBody.tier || 'free'` — REMOVE), 275–276 (model routing — move to `getModel(tier)` from Phase 14 tier-config), 308–321 (`promptParams` construction), 339, 342, 567, 570, 609 (existing elite branches). The legacy `checkAndRecordUsage` block (lines 239–274) stays behind the Phase 13 flag branch.
- `supabase/functions/_shared/resume-prompts.ts` — already has `tier: 'free' | 'pro' | 'elite'` plumbed and inline `isElite` branching (~lines 55–68). Phase 14 formalizes into three variants; Phase 15 adds the new `buildEliteExtrasSystem` builder and registers it with `loadPromptVariant`.
- `supabase/functions/_shared/result-merger.ts` — gets the new `applyTierShape(merged, tier)` final step + `{FREE,PRO,ELITE}_ALLOWED_FIELDS` whitelist. This is the Phase 15 enforcement point for RES-01/02.
- `supabase/functions/_shared/tier-config.ts` (Phase 14) — Phase 15 imports `TIER_MAX_TOKENS`, `getModel`, `getTimeout`. Phase 15 does NOT add per-feature budgets here.
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — Phase 15 imports `withMerits` and `MERIT_SYSTEM_ENABLED`. Phase 15 does NOT modify the gateway.
- `supabase/functions/_shared/tier-prompts.ts` (Phase 14) — Phase 15 imports `loadPromptVariant('resume', tier, promptParams)`. The `'elite-extras'` call-type gets a new builder registered under the `'resume'` feature key.
- `supabase/functions/_shared/rate-limiter.ts` — no changes; Phase 13 D-08 already establishes the pooled 60/hr key.
- `src/pages/Results.tsx` — consumes the new shape. Minimal defensive changes only: must not crash when Free users have `criterionFeedback[i]` entries without the `points` field (i ≥ 1). Rich Elite presentation of the new fields (powerPhrases, etc.) is deferred to Phase 20.

### Design System

- `CLAUDE.md` § Technology Stack + § Architecture — merge rules, json-repair usage, structured logging, fail-closed CORS. Phase 15 preserves all existing error-handling patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`CALL_CONFIGS` + `executeParallelCalls`** (`analyze-resume/index.ts:44–140`) — the existing 3-way parallel fan-out is the pattern. Phase 15 adds a 4th conditional entry and updates the per-tier values; no new infrastructure.
- **`capPriorityImprovements`** (`analyze-resume/index.ts:51`) — the logic lives; Phase 15 relocates it into `applyTierShape` and updates `{ free: 1, pro: 5, elite: 7 }` per spec.
- **`mergeAndValidateResults`** (`_shared/result-merger.ts`) — the natural home for `applyTierShape`. Single exit point means Phase 16–19 gating phases inherit the pattern when their features adopt it.
- **`requireInternalOrUserAuth`** (`_shared/auth.ts`) — already returns `userContext` with `userId`. Phase 15 adds the `subscriptions` lookup immediately after.
- **`buildSystemBlocks` / `buildUserPrompt`** (`_shared/resume-prompts.ts`) — Phase 14's loader wraps these. Phase 15 passes `resolvedTier` through unchanged except for the new elite-extras call path.

### Established Patterns

- **Parallel fan-out with merge + json-repair fallback** — existing pattern; Phase 15's 4th call slots into it cleanly because `ParallelResult` is already a discriminated union.
- **Service-role Supabase client for server-side reads** — RLS is service-role-only (Phase 10 D-06 / Phase 07 heritage). `subscriptions.select('tier')` uses the existing `getServiceClient()` helper.
- **Structured logging with bracket-prefixed function names** — `log.info('request-start', { ... tier: resolvedTier ... })` already in place at line 222. Phase 15 keeps the same log line but replaces the `userTier` value with the authoritative `resolvedTier`.
- **Module-level pooled Supabase client** — `getServiceClient()` is warm-worker-pooled. One additional `.select()` per request is negligible.

### Integration Points

- **Phase 14 loader** is consumed for all three tier variants + the new elite-extras builder.
- **Phase 13 gateway** wraps the entire fan-out; refund on upstream failure is Phase 13's responsibility, Phase 15 does not implement it.
- **Phase 12 subscriptions table** is the tier source; Phase 15 depends on Stripe webhook correctness.
- **Phase 20 pricing route** is eventually where Free/Pro users clicking "unlock" will land — Phase 15 does NOT change any Results.tsx CTAs, only defensively handles the new shape.
- **Validation harness (Phase 14 D-14)** — Phase 15 registers a `TierValidationFixture` entry for resume so TEST-09/10 have real data.

</code_context>

<specifics>
## Specific Ideas

- The existing `userTier = rawBody.tier || 'free'` on line 208 is the single highest-priority code change in the phase — it is a silent billing/cost defect and must be deleted before any other Phase 15 work lands.
- `applyTierShape` being inside `result-merger.ts` rather than the handler is the Phase 15 analog of Phase 14 D-03's "loader is the single enforcement point for GLOBAL_AI_PRINCIPLES" — the pattern is "put shape enforcement where it cannot be forgotten."
- The boot-time assertion `sum(CALL_CONFIGS[tier]) <= TIER_MAX_TOKENS[tier]` is how RES-06 stops being a manual review item and becomes a structural invariant. Same philosophy as Phase 10's `DO $$ … RAISE EXCEPTION` verification block.
- The 4th parallel call conditional on `tier === 'elite'` is the cheapest path to isolating Elite cost — Free/Pro latency is provably unchanged, because those tiers literally do not fire the call.
- Tier gating must work with `MERIT_SYSTEM_ENABLED=false`. This is the explicit safety net for rolling Merit out — if Phase 13's billing behavior is bad in prod, we flip the flag and tier shaping keeps working. If Phase 15 had coupled the two, we would have to roll both back together.

</specifics>

<deferred>
## Deferred Ideas

- **Tier gating for LinkedIn / Career / Recruiting Lens / Interview Prep** — Phases 16, 17, 18, 19 respectively. Phase 15 is scoped to `analyze-resume` only.
- **Extracting `resolveTier()` into `_shared/resolve-tier.ts`** — defer to the first phase (likely Phase 16) that duplicates the subscriptions lookup. Lazy extraction.
- **Rich Results.tsx presentation of Elite-only fields** (powerPhrases carousel, hiddenWeaknesses callouts, interviewLikelihood gauge) — UI work belongs with Phase 20's pricing/paywall polish, not Phase 15's backend gating.
- **Adjusting legacy `usage_tracking` quotas** to compensate for Free's smaller output — rejected; legacy remains per-analysis, the flag-off path should not drift from the flag-on path.
- **Running TEST-09 / TEST-10 in CI on every PR** — still deferred from Phase 14. Phase 15 runs the harness manually against its validation fixture before ship.
- **Token-count empirical measurement** of the 4000-token elite-extras budget — do it once in Phase 15's post-implementation validation, not up front. Patch the number after seeing real data.
- **Moving the `can_perform_ai_action` RPC call** onto the Merit path — out of scope; legacy path remains intact behind the flag.
- **Refactoring the async queue path** (`submit-resume-analysis-job` / `process-resume-analysis-job`) to honor tier gating — the spec (Phase 13 D-07) already places deduction at submit time; tier shaping in that path is a follow-up if/when async resume analysis re-emerges as a live feature.

</deferred>

---

*Phase: 15-resume-analysis-gating*
*Context gathered: 2026-04-15*
