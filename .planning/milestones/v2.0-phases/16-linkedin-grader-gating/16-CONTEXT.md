# Phase 16: linkedin-grader-gating - Context

**Gathered:** 2026-04-16
**Status:** Ready for research / planning

<domain>
## Phase Boundary

Make `grade-linkedin` tier-aware by wiring it onto the Phase 14 shared infrastructure and the Phase 13 Merit gateway:

1. **Resolve tier server-side** from the `subscriptions` table via a new `_shared/resolve-tier.ts` helper (extracted from Phase 15's inline pattern).
2. **Use `loadPromptVariant('linkedin', tier, promptParams)`** from Phase 14 instead of the current single `buildSystemPrompt()`.
3. **Enforce per-tier `maxTokens` caps** — Free 4000 / Pro 8192 / Elite 8192 (LIG-07).
4. **Shape Free output** to spec (LIG-01/LIG-02): `rawScore`, `scoreJustification`, full `keyStrengths`, `nextBestAction`, first `topFixes` entry only. Omit `profileInsights` and detailed `sectionBreakdown` feedback (scores only, no feedback arrays).
5. **Pro and Elite output** (LIG-03/LIG-04): identical — all fields including `profileInsights`, full `sectionBreakdown` (4 sections × 3+ feedback points), all `topFixes`.
6. **Merit deduction** 3/2/3 (Free/Pro/Elite) via `withMerits`, with refund on AI failure (Phase 13 contract).
7. **Free-scan entitlement** (LIG-05/LIG-06): Pro/Elite's first scan per billing cycle costs 0 Merits; checks `free_linkedin_scan_used` in `user_merits`; flips to true after first scan; reset by `reset_subscription_merits` on monthly cycle.
8. Tier gating applies **regardless of `MERIT_SYSTEM_ENABLED`** — the flag gates billing semantics only, not output shape.

Closes: LIG-01, LIG-02, LIG-03, LIG-04, LIG-05, LIG-06, LIG-07, BACK-09.

**Out of scope for this phase:**

- Tier gating for any other feature — Phases 15 (resume), 17 (career), 18 (recruiting lens), 19 (interview prep).
- Phase 14's loader, tier-config, LockedSection/LockedListItem — consumed, not modified.
- Phase 13's `withMerits`, `MERIT_SYSTEM_ENABLED`, refund taxonomy — consumed, not modified.
- Frontend LinkedInGrader.tsx changes to render locked sections or Free-specific UI — that lands in Phase 20 alongside pricing/paywall polish.
- Changes to `analyze-resume`, `analyze-career`, or `recruiting-lens`.
- Any changes to the legacy `usage_tracking` / `checkAndRecordUsage` path beyond preserving it behind the flag.

</domain>

<decisions>
## Implementation Decisions

### Free Output Shape Enforcement (Defense in Depth)

- **D-01:** Free output shape is enforced at **both layers**: (a) `loadPromptVariant('linkedin', 'free')` instructs the model to omit `profileInsights`, detailed `sectionBreakdown` feedback, and `topFixes` beyond the first entry, and (b) a new `stripLinkedInFreeTier(parsed)` function server-side **strips any Pro-only keys** from the parsed JSON before returning. A leaky prompt regression cannot reach a Free user.
- **D-02:** `stripLinkedInFreeTier()` lives **inline in `grade-linkedin/index.ts`** as a final step before returning the response. LinkedIn has no merger pipeline (`result-merger.ts` is not used), so there's no shared exit point to hook into. The strip is colocated with the feature it protects. Phases 17-18 each write their own equivalent for their respective features.
- **D-03:** The strip function enforces LIG-01/LIG-02 specifically:
  - Keeps: `rawScore`, `scoreJustification`, `keyStrengths` (full array), `nextBestAction`, `topFixes[0]` only, `sectionBreakdown` with scores only (strips `feedback` arrays from each section entry).
  - Removes: `profileInsights` entirely, `topFixes[1+]`, all `feedback` arrays inside `sectionBreakdown` entries.
  - Deterministic shape even if the model returns full Pro-level output.

### Model Routing

- **D-04:** LinkedIn Grader uses **Haiku 4.5 for all tiers**. Add `linkedin` to `FEATURE_MODEL_OVERRIDES` in `tier-config.ts`: `linkedin: { pro: FREE_MODEL, elite: FREE_MODEL }`. Rationale: LinkedIn is a structured scoring task that Haiku handles well, Pro/Elite outputs are identical (no Elite-exclusive narrative benefiting from a larger model), and keeping Haiku maintains favorable unit economics. Matches `career`'s existing override pattern.

### Free-Scan Mechanism

- **D-05:** Under `MERIT_SYSTEM_ENABLED=true` (Merit path): the handler checks `free_linkedin_scan_used` from the `user_merits` table. If `false` and tier is `pro` or `elite`, skip Merit deduction and flip the flag to `true` via an RPC or direct update. Subsequent scans in the same billing cycle deduct 2 (Pro) or 3 (Elite) Merits normally.
- **D-06:** Under `MERIT_SYSTEM_ENABLED=false` (legacy path): the existing v1.0 row-counting logic in `entitlement.ts` is preserved unchanged. Legacy path remains byte-identical until the flag flips. Clean separation — legacy path does not depend on Merit-system tables. Matches Phase 15 D-09's philosophy: tier gating works regardless of flag, but billing mechanism stays on its own path.
- **D-07:** The `free_linkedin_scan_used` flip does NOT use a standalone RPC — it is a direct `update` on `user_merits` via service-role client, scoped to the authenticated user's row. The existing `reset_subscription_merits` RPC (Phase 11) already resets this flag on monthly cycle. No new RPC needed.

### Tier Resolution

- **D-08:** **Extract `resolveTier()` into `supabase/functions/_shared/resolve-tier.ts`** now. Phase 15 deferred this to "the first phase that duplicates the subscriptions lookup" — Phase 16 is that phase. The helper exports `resolveTier(userId: string, log: Logger): Promise<Tier>`, performs a service-role `subscriptions.select('tier').eq('user_id', userId).maybeSingle()`, defaults to `'free'` on missing row with a warn log. Phases 17-18 import it directly.
- **D-09:** Phase 15's `analyze-resume/index.ts` should also be updated to import from `resolve-tier.ts` instead of its inline version — this is a Phase 16 cleanup task, not a Phase 15 regression fix.

### Prompt Variant Design

- **D-10:** Register **3 variants** with the Phase 14 loader: `FREE_PROMPT` (omits profileInsights, detailed sectionBreakdown feedback, topFixes beyond first), `PRO_PROMPT` (full output — the current `buildSystemPrompt()`), `ELITE_PROMPT = PRO_PROMPT` (same builder reference). Loader gets 3 entries per contract. `STRIVO_GLOBAL_AI_PRINCIPLES` auto-prepends for Pro/Elite via the loader (Phase 14 D-03).
- **D-11:** Prompt variants live in **`grade-linkedin/prompts.ts`** (evolve the existing module). Export `buildFreeSystemPrompt()`, `buildProSystemPrompt()` (the current `buildSystemPrompt()` renamed), and register all three with `registerFeaturePrompts('linkedin', { free: ..., pro: ..., elite: ... })` at module boot. Matches Phase 14 D-01: "each feature gets a prompt module exporting builders."
- **D-12:** The Free prompt variant explicitly instructs the model to:
  - Return `rawScore`, `scoreJustification`, full `keyStrengths`, `nextBestAction`
  - Return only 1 `topFixes` entry (the highest priority)
  - Return `sectionBreakdown` with `name`, `score`, `maxScore`, `status` only — NO `feedback` arrays
  - Omit `profileInsights` entirely
  - This is the prompt-level enforcement; `stripLinkedInFreeTier()` is the server-side backup (D-01).

### Merit Integration

- **D-13:** A single `withMerits(ctx, 'linkedin_grading', async (_txId) => { ... })` call wraps the AI call + validation + retry logic. One transaction, one refund on any upstream AI failure. Tier cost is `{ free: 3, pro: 2, elite: 3 }` per spec §4.2. The existing `'linkedin_grading'` feature key from Phase 13 D-07 is reused.
- **D-14:** The free-scan check (D-05) runs **before** `withMerits` — if the scan is free, `withMerits` is skipped entirely for that request. The tier-gated prompt and output shaping still apply (free scan ≠ free tier output; a Pro user's free scan gets Pro output at 0 Merit cost).

### Per-Tier maxTokens

- **D-15:** `maxTokens` values: Free 4000, Pro 8192, Elite 8192 per LIG-07. These live in `grade-linkedin/index.ts` as a feature-level constant (same pattern as Phase 15 D-16: `tier-config.ts` owns global caps, feature handlers own their specific budgets). LinkedIn has no parallel-call budget split since it's a single AI call.

### Claude's Discretion (Researcher / Planner decides)

- The exact fields in the `stripLinkedInFreeTier` whitelist — planner cross-references LIG-01/LIG-02 against the actual parsed JSON shape.
- Whether `buildUserMessage` also needs tier-aware modifications (e.g., whether follow-up context is included for Free tier or omitted for cost savings).
- Whether the free-scan flag flip uses `.update()` or `.rpc()` — either works as long as it's service-role and atomic.
- Whether Phase 15's `analyze-resume/index.ts` refactor to import `resolve-tier.ts` is a separate plan or folded into the main Phase 16 plan.
- Exact structure of the `resolveTier()` return type — plain `Tier` string or a richer object with metadata (like `subscriptionStatus`, `periodEnd`).
- Whether `grade-linkedin/prompts.ts` self-registers at import time (module-level side effect) or the handler calls a `registerLinkedInPrompts()` function explicitly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before research or implementation.**

### Spec (Source of Truth)

- `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §4.2 (per-tier field tables for LinkedIn Grader), §6 (free monthly scan logic), §8.2 (tier maxTokens), §8.3 (tier prompt variants), §8.4 (per-tier timeouts), §11.3 (TEST-09/10 validation rules).
- `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — injected automatically by Phase 14 loader for Pro/Elite; Phase 16 does NOT re-inject.

### Requirements

- `.planning/REQUIREMENTS.md` — LIG-01, LIG-02, LIG-03, LIG-04, LIG-05, LIG-06, LIG-07, BACK-09 (the 8 REQ-IDs Phase 16 closes).
- `.planning/ROADMAP.md` §"Phase 16: linkedin-grader-gating" — 5 Success Criteria that VERIFICATION.md must prove TRUE.

### Prior Phase Context (MUST read)

- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 (loader is the only import point), D-03 (auto-prepend of GLOBAL_AI_PRINCIPLES), D-04 (resume is the example feature wired in Phase 14), D-11..D-13 (tier-config.ts, `getModel`/`getTimeout`). Phase 16 consumes all of these.
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — D-01..D-04 (tier resolution pattern — Phase 16 extracts to shared helper), D-08/D-09 (`withMerits` wrapping pattern), D-11 (defense-in-depth philosophy that Phase 16 D-01 follows). Phase 16 extracts `resolve-tier.ts` from Phase 15's inline code.
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 (`withMerits` in `_shared/merit-gateway.ts`), D-06 (flag branching inside each feature handler), D-07 (feature list, `linkedin_grading` is enumerated), D-08/D-09 (pooled 60/hr rate limit).
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — `reset_subscription_merits` RPC resets `free_linkedin_scan_used = false` on monthly cycle (MER-09).

### Existing Code to Modify or Reuse

- `supabase/functions/grade-linkedin/index.ts` — primary target. Already has Phase 13 Merit branch (lines 100-229) and legacy path (lines 230-498). Needs: tier resolution via new shared helper, prompt variant loading, `maxTokens` per tier, `stripLinkedInFreeTier()`, free-scan check via `free_linkedin_scan_used`.
- `supabase/functions/grade-linkedin/prompts.ts` — evolve with Free/Pro/Elite builders. Current `buildSystemPrompt()` becomes the Pro builder. `buildUserMessage()` may remain tier-agnostic (Claude's Discretion).
- `supabase/functions/grade-linkedin/entitlement.ts` — v1.0 free-scan helper. Preserved for legacy path; Merit path uses `free_linkedin_scan_used` flag instead.
- `supabase/functions/grade-linkedin/validation.ts` — no changes expected; validates output structure which remains the same for Pro/Elite.
- `supabase/functions/_shared/tier-config.ts` — add `linkedin` to `FEATURE_MODEL_OVERRIDES` (D-04).
- `supabase/functions/_shared/tier-prompts.ts` — Phase 16 registers `'linkedin'` feature with 3 variant builders.
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — import `withMerits`, `MERIT_SYSTEM_ENABLED`, `MeritRefundable`. No modifications.
- `supabase/functions/_shared/resolve-tier.ts` — NEW file. Extracted from Phase 15's inline pattern. Also update `analyze-resume/index.ts` to import from here.

### Design System

- `CLAUDE.md` § Technology Stack + § Architecture — structured logging, fail-closed CORS, bracket-prefixed log names. Phase 16 preserves all existing patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`withMerits` + `MeritRefundable`** (`_shared/merit-gateway.ts`) — the Merit-path branch in `index.ts` (lines 100-229) already uses these correctly. Phase 16 restructures this branch to add tier resolution, prompt loading, and free-scan logic.
- **`loadPromptVariant` + `registerFeaturePrompts`** (`_shared/tier-prompts.ts`) — the loader is ready. Phase 16 registers `'linkedin'` as a new feature and calls `loadPromptVariant('linkedin', tier, params)`.
- **`getTimeout` / `getModel`** (`_shared/tier-config.ts`) — Phase 16 imports these for timeout and model selection. Adds `linkedin` to `FEATURE_MODEL_OVERRIDES`.
- **`invokeWithRetry`** (`grade-linkedin/index.ts:30-54`) — existing retry logic, reused as-is within the Merit-wrapped AI call.
- **`parseAiResponse`** (`grade-linkedin/index.ts:60-73`) — existing JSON parse + repair logic, reused as-is.
- **`validateLinkedInGrade`** (`grade-linkedin/validation.ts`) — existing output validation, runs on all tiers' parsed output before `stripLinkedInFreeTier` (strip happens post-validation).

### Established Patterns

- **Phase 13 flag branching** — `grade-linkedin/index.ts` already has the `if (MERIT_SYSTEM_ENABLED)` branch. Phase 16 adds tier resolution and prompt loading inside this branch; the legacy path below remains unchanged.
- **Service-role Supabase client** — `getServiceClient()` is the established pattern for server-side DB reads. `resolveTier()` uses the same client.
- **Structured logging** — `createLogger('grade-linkedin', reqId)` already in place. Tier resolution adds log lines consistent with existing patterns.
- **Single AI call architecture** — Unlike resume's 3-call parallel fan-out, LinkedIn is one `invokeWithRetry` call. Simpler tier gating: one `maxTokens` value, one model, one prompt.

### Integration Points

- **Phase 14 loader** — consumed for prompt variant registration and loading.
- **Phase 13 gateway** — wraps the AI call; refund on upstream failure is Phase 13's responsibility.
- **Phase 11 `reset_subscription_merits`** — resets `free_linkedin_scan_used` on monthly cycle. Phase 16 reads the flag; Phase 11 resets it.
- **Phase 15 `analyze-resume/index.ts`** — Phase 16 refactors its inline tier resolution to import from the new `resolve-tier.ts`.
- **Phase 20 pricing/paywall** — eventual frontend changes to show LockedSection/LockedListItem on LinkedIn Grader results page. Phase 16 only shapes the backend output.
- **Validation harness (Phase 14 D-14)** — Phase 16 registers a `TierValidationFixture` entry for linkedin so TEST-09/10 cover this feature.

</code_context>

<specifics>
## Specific Ideas

- The existing `withMerits` block in `index.ts` (lines 116-228) is a good starting point but needs restructuring: add tier resolution at the top, replace hardcoded model/maxTokens with tier-config values, replace `buildSystemPrompt()` with `loadPromptVariant('linkedin', tier, params)`, and add `stripLinkedInFreeTier()` before the response return.
- The free-scan check (D-05/D-14) must run BEFORE `withMerits` — otherwise the gateway deducts Merits that should have been free. The flow is: resolve tier → check free-scan entitlement → if free scan, run AI without `withMerits`; if paid scan, wrap in `withMerits`.
- `stripLinkedInFreeTier()` runs AFTER `validateLinkedInGrade()` — validate the full shape first (all tiers produce the same JSON structure from the model), then strip for Free. This means validation.ts doesn't need tier awareness.
- Since Pro and Elite outputs are identical, `stripLinkedInFreeTier` only needs to check `tier === 'free'`. No Pro-specific stripping needed.
- The `resolve-tier.ts` extraction from Phase 15 should be a clean lift: take the inline `supabase.from('subscriptions').select('tier')...` pattern, wrap it in a function with logging and default-to-free, and update Phase 15's `analyze-resume/index.ts` to import from the new module.

</specifics>

<deferred>
## Deferred Ideas

- **Tier gating for Career Compass / Recruiting Lens / Interview Prep** — Phases 17, 18, 19 respectively.
- **Frontend LinkedInGrader.tsx changes** to render `<LockedSection>` for Free users on profileInsights and sectionBreakdown feedback — Phase 20.
- **Running TEST-09/TEST-10 in CI** — still deferred from Phase 14. Phase 16 registers LinkedIn in the harness and runs manually before ship.
- **Refactoring the legacy path** to use the same prompt-loading + tier-shaping infrastructure — deferred until `MERIT_SYSTEM_ENABLED` flips and the legacy path can be removed entirely (Phase 21).
- **Token-count empirical measurement** of Free vs. Pro/Elite LinkedIn output — measure in Phase 16's post-implementation validation via the tier harness, not up front.

</deferred>

---

*Phase: 16-linkedin-grader-gating*
*Context gathered: 2026-04-16*
