# Phase 24: pricing-merit-economy-and-top-up-packs-update — Context

**Gathered:** 2026-04-21
**Updated:** 2026-04-21 (gap-closure pass — D-19…D-28 added)
**Status:** Ready for planning

<domain>
## Phase Boundary

Retune Strivo's merit economy and subscription pricing, introduce annual billing, and add one-time Merit Top-Up Packs as a second, non-expiring balance — without retroactively modifying existing user balances or disrupting live Stripe subscribers. Also retune per-feature × per-tier output-token, input-token, and input-character budgets to the values locked in ROADMAP SC-12, and enforce the new brand identity (#0a0607 / #ff2d3f / Fraunces+JetBrains Mono+Inter Tight / boxy CTAs / glassmorphism + ambient red glow) on `/pricing` and the in-app top-up surfaces.

Discussion clarifies HOW we land SC-1 through SC-13. The 13 success criteria themselves are FIXED — they came from product on 2026-04-21 and supersede the original phase brief.

</domain>

<decisions>
## Implementation Decisions

### Central Config Shape & Ownership
- **D-01:** The retuned `MERITS_PER_MONTH`, `MERIT_COST_PER_FEATURE`, `PRICING`, `maxTokensOutput`, `maxTokensInput`, and `maxCharactersInput` tables live in **a single shared TypeScript module** that both the Vite frontend and Supabase Edge Functions (Deno) import directly. Single source of truth, single file edit, single import graph.
- **D-02:** FE/BE stay in sync via the **single dual-imported file** — no mirrored copies, no `/api/config` boot endpoint, no JSON intermediate. Path-aliased on the frontend (`@/...`) and relative-imported on the Deno side.
- **D-03:** `merit_feature_costs` (DB table) **stays the source of truth for per-feature merit costs at runtime**. The TS module re-declares the same costs as constants for typing/UI use, and a **boot-time assertion diffs DB rows vs the TS map and throws on divergence**. Migrations update both sides in lockstep.
- **D-04:** `merit_transactions.source` enum migration is **additive**: the existing `'shop'` value stays accepted, a new `'topup'` value is added, and all newly-credited top-up rows write `'topup'`. No data backfill, no rename. Existing `'shop'` rows remain untouched.

### Free-Tier Allocation
- **D-05:** Free users' monthly merit reset uses the **signup anniversary day-of-month** (same pattern as Pro/Elite billing-cycle anniversary already in `usage_tracking`). Avoids new abstraction and avoids a thundering-herd burst on the 1st.
- **D-06:** When `MERITS_PER_MONTH = { free: 10 }` ships, **existing Free users are NOT topped up**. New allocation kicks in on each user's next anniversary reset. Honors SC-2's "no retroactive mutation" rule.
- **D-07:** **Free users CAN buy Merit Top-Up Packs.** Top-up balance is tier-independent. Acts as a soft conversion path before they upgrade. Note: top-up merits cannot unlock features that have `cost = null` for Free (recruiting-lens, interview-prep) — those remain locked behind the upgrade prompt regardless of balance.
- **D-08:** Header `+` icon uses the **same 20%-of-monthly-cap rule for all tiers, no special-case for Free**. For Free (cap=10), the icon appears at ≤2 monthly merits remaining. Consistent logic, no per-tier branching.

### Token Budget Rewiring Scope
- **D-09:** The three new tables (`maxTokensOutput`, `maxTokensInput`, `maxCharactersInput`) **extend `supabase/functions/_shared/tier-config.ts`**, alongside the existing `TIER_TIMEOUTS`, `TIER_MAX_TOKENS`, and `TIER_MODELS`. Typed accessors `getMaxOutput(feature, tier)`, `getMaxInputTokens(feature, tier)`, `getMaxInputChars(feature, tier)` are added. Same import path everyone already uses.
- **D-10:** **Existing per-feature handlers absorb the new per-feature output budgets by reading from the shared table.** For parallel-call features (analyze-resume, recruiting-lens), the local `CALL_CONFIGS` split logic stays put but its boot-time invariant is rewritten to assert `sum(CALL_CONFIGS) ≤ getMaxOutput(featureKey, tier)` instead of `≤ TIER_MAX_TOKENS[tier]`. Internal split is the handler's business; total budget is centralized.
- **D-11:** `TIER_MAX_TOKENS` (the existing single-cap export) is **kept as a deprecated re-export** for one cycle so in-flight tests don't break, with a `@deprecated` JSDoc pointing at `getMaxOutput`. Removed once Phase 24 lands and downstream tests are migrated.
- **D-12:** Input guardrail (token + character) enforcement lives in a **new shared validator** at `supabase/functions/_shared/input-guard.ts` exposing `validateInputBudget(feature, tier, text) → { ok: true } | { ok: false; reason; limit; actual }`. Each feature handler calls it as the first step after auth + merit gate. Returns a typed 413-style response before any LLM call. Single chokepoint for input validation, separate from `merit-gateway` (which stays focused on merit math).
- **D-13:** Free-tier rows where `maxTokensOutput = 0` OR `maxTokensInput = null` mean the feature is **locked on Free**. The locked state is enforced by the same `validateInputBudget` call, which short-circuits to "feature locked on this tier" and triggers the existing upgrade prompt. **No merit deduction, no Claude call.** This honors SC-3 + SC-12.
- **D-14:** SC-13 reconciliation artefact format = **a single Markdown audit file** at `.planning/phases/24-.../24-AUDIT.md` with one section per feature. Each section contains a table: `| Feature | Tier | Budget Type | Old Value | New Value | Source Phase | Action |`. Same family of human-readable artefact as `.planning/v2.0-MILESTONE-AUDIT.md`. No JSON manifest.

### Design System Rebrand Scope
- **D-15:** Rebrand surface = **`/pricing` page + the in-app top-up surfaces it owns** (out-of-merits modal, header `+` icon trigger surface, dashboard "Running low?" card). Sitewide rebrand is **out of scope for Phase 24** and noted as a deferred candidate for a future phase. SC-11's regression clause is page-specific ("on the pricing page") — we honor that scope.
- **D-16:** Token strategy = **new brand-v2 CSS variable namespace** (`--bg-deep: #0a0607`, `--accent-red: #ff2d3f`, `--radius-boxy: 0.125rem` or similar). The pricing surface opts in via a wrapper class (e.g., `theme-v2`). Existing `--background`, `--primary`, `--radius` are **untouched**, so no risk of regressing Phases 15–23 surfaces. Future sitewide rollout becomes a token-promotion task (rename v2 → defaults), not a re-design.
- **D-17:** Fonts (Fraunces / JetBrains Mono / Inter Tight) are loaded via **Google Fonts CDN with `display=swap`**, with `<link rel="preconnect">` and weight subsetting (Fraunces 400/600, JetBrains Mono 500, Inter Tight 400/500/700) in `index.html`. Privacy/perf trade-off acknowledged; matches the existing Inter loading pattern. Self-hosting becomes a follow-up if/when the sitewide rebrand lands.
- **D-18:** "No rounded-full primary CTA regression" enforcement = **new `boxy` Button variant + a vitest scan**. The variant is added to `src/components/ui/button.tsx` with `radius-sm` and no `rounded-full`. All `/pricing` (and top-up) CTAs use it. A vitest test (e.g., `pricing-boxy.lint.test.ts`) parses `/pricing`-related component files via a glob and fails the build if any `<Button>` inside them carries `variant="default"` with rounded-full classes or any `rounded-full` literal on a Button. Mechanical enforcement; can't regress without breaking CI.

### Token-Budget Verbatim Lock
- **D-19:** The three SC-12 tables (`maxTokensOutput`, `maxTokensInput`, `maxCharactersInput`) are copied **verbatim** from product's 2026-04-21 spec into the shared TS module — values verified cell-by-cell against ROADMAP.md §SC-12 (lines 468–497). **Per-feature enforcement is MANDATORY:** every feature handler (analyze-resume, analyze-career, recruiting-lens, grade-linkedin, interview-prep-analyze) reads its three budgets via typed accessors `getMaxOutput(feature, tier)` / `getMaxInputTokens(feature, tier)` / `getMaxInputChars(feature, tier)` — no hardcoded per-feature caps anywhere. The `validateInputBudget` chokepoint (D-12) checks **BOTH** `maxTokensInput` AND `maxCharactersInput` before any Claude call; either budget triggering short-circuits to the locked/over-limit response. The 4:1 char↔token invariant holds on every non-null row by design (e.g., resumeAnalysis free: 14000 chars ÷ 3500 tokens = 4.0), so the two budgets are redundant mathematically but both are enforced as belt-and-suspenders. Planner MUST include a vitest that parses the shared TS module and asserts verbatim equality against a pinned snapshot of the SC-12 tables; any drift fails CI.

### Rollout & Live-Subscriber Safety
- **D-20:** Existing monthly Pro/Elite subscribers are **grandfathered in place** on their current Stripe price IDs forever. New signups see annual + new-monthly SKUs only. No migration, no proration, no prompt-to-switch UX. Honors SC-4's "deprecated, not deleted" literally.
- **D-21:** New merit caps (SC-1: free 10 / pro 75 / elite 150) and new per-feature token budgets (SC-12) ship **immediately at deploy — no env-flag gating**. Per D-06, existing balances are NOT mutated; the new caps kick in on each user's next anniversary reset. Accepts that budgets change per-request at deploy-time (this is the intended behaviour — tokens are not consumable state).
- **D-22:** Deploy order is **migrations-first, then code**: the additive `merit_transactions.source = 'topup'` enum value, the new pack-credit RPC, and the `stripe_payment_intent_id` dedupe constraint (see D-04 + `<specifics>` idempotency note) ship as a Supabase migration FIRST. Code deploy follows. Forward-compatible: pre-deploy code ignores the unused enum value and won't exercise the new RPC, so the migration window is safe. Rollback = revert code; migration stays (enum values are additive/non-destructive).

### Top-Up Purchase UX
- **D-23:** Pack purchase uses the **embedded Stripe Payment Element** via `@stripe/react-stripe-js` (already in package.json). User clicks pack → card expands/opens a modal with the Payment Element → submits in-app → no redirect. SCA/3DS still handled by Stripe. This diverges from the existing subscription flow (Stripe Checkout redirect) — planner must wire BOTH paths in the Stripe handler: subscription = Checkout session; top-up pack = PaymentIntent + Payment Element.
- **D-24:** Canonical pack catalog (the 4 packs rendered with SC-8 visual hierarchy — `pack_25` as "Best Value" anchor) lives on **`/pricing` below the subscription tiers**, anchored at `/pricing#packs`. Header `+` icon, out-of-merits modal "Buy top-up pack" CTA, and dashboard "Running low?" card all **deep-link to `/pricing#packs`** (scroll + highlight). Single source of truth for pack pricing + visual hierarchy — no duplicated pack-card implementations.
- **D-25:** Post-purchase flow: after webhook credits merits (idempotent via `stripe_payment_intent_id`), the Payment Element `onSuccess` callback redirects back to the origin page (the page the user initiated from — `/pricing`, out-of-merits modal caller, or dashboard), fires a **Sonner toast** in the SC-10 format (e.g., *"Added 25 merits — balance now 47 / 75 + 25 bonus"*), and the header balance component refreshes live via its existing merit-balance subscription (no full page reload). If webhook is delayed, toast shows "Processing…" and updates when the merit-balance query re-fetches.

### Boot-Invariant Failure Mode
- **D-26:** The D-03 DB↔TS cost-map assertion and the D-10 `sum(CALL_CONFIGS) ≤ getMaxOutput(feature, tier)` assertion both run at **module load (cold-start) only** — once per Deno isolate boot. Cost: one extra `SELECT cost, feature FROM merit_feature_costs` per cold start (cached in module scope thereafter). Zero per-request overhead.
- **D-27:** If either invariant trips in production, the policy is **fail-closed**: the module-load throw propagates, the isolate fails to boot, every request on that function returns 500 until fixed. Paired with D-22's migrations-first deploy ordering, the drift window is minimal. Frontend shows the existing generic error toast — no special UX.
- **D-28:** Observability = **structured log via `_shared/logger.ts`** (`log.error('invariant-violation', { feature, tier, source: 'd-03'|'d-10', ts_value, db_value, sum, cap })`) + a **Supabase function-log alert** pattern-matching on `invariant-violation` that routes to the existing on-call channel. No new deps (no Sentry) — reuses existing logger + Supabase alerting surface.

### Claude's Discretion
- Internal `CALL_CONFIGS` per-call split values inside `analyze-resume` and `recruiting-lens` (planner picks split that respects D-10's new budget total).
- Exact CSS-var values for `--radius-boxy` and the glassmorphism / ambient-glow tokens (planner derives from SC-11 visual language; D-16 dictates only the namespacing).
- The exact Stripe price-ID naming/notation in code (must reference annual SKUs per SC-4; planner picks env-var convention).
- 413-style error response shape (planner picks JSON envelope; D-12 dictates only that the validator returns a typed result).
- Toast copy for top-up confirmation per SC-6 (planner writes; SC just requires a confirmation toast).

### Folded Todos
None — no pending todos matched Phase 24 scope (no todo.match-phase output to fold).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning or implementing.**

### Phase spec (source of truth — locked)
- `.planning/ROADMAP.md` §"Phase 24: pricing-merit-economy-and-top-up-packs-update" — **all 13 success criteria, especially SC-12's three locked budget tables**. This is the contract this phase MUST satisfy.
- `.planning/REQUIREMENTS.md` — REQ-IDs to be (re)mapped during `/gsd-plan-phase 24` per ROADMAP line 452.
- `.planning/PROJECT.md` — project-level non-negotiables and reliability priorities.

### Prior-phase context (depended-upon decisions)
- `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — merit ledger schema and append-only invariants.
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — merit RPC API and reconciliation rules.
- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — existing Stripe product/webhook conventions; annual SKUs and one-time pack products extend this layer.
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — merit-gateway enforcement contract and feature-flag pattern.
- `.planning/phases/20-merit-ux-shop-pricing-and-streak-ui/20-CONTEXT.md` — existing `/pricing` and shop UI shipped in Phase 20; Phase 24 retunes the brand on top of this.
- `.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md` — interview-prep-analyze runtime + tier budgets that Phase 24 must reconcile (per SC-13).

### Existing code (must inspect before extending)
- `supabase/functions/_shared/tier-config.ts` — central per-tier config to extend per D-09. Boot-time invariants live here.
- `supabase/functions/analyze-resume/index.ts` — `CALL_CONFIGS` parallel-call pattern + boot invariant; rewire per D-10/D-11.
- `supabase/functions/_shared/merit-gateway.ts` — merit deduction chokepoint; spend-ordering (monthly first, then top-up) per SC-7 lands here.
- `supabase/migrations/20260415000000_merit_rpcs.sql` — merit RPC surface; new top-up credit RPC extends this.
- `src/hooks/useFeatureCosts.ts` — FE merit-cost reader; will read from the new shared TS module per D-01/D-02.
- `src/pages/Shop.tsx` — existing pack/shop surface; pack-card layout per SC-8 lands here or alongside.
- `tailwind.config.ts` + `src/index.css` — current token system; brand-v2 namespace per D-16 lands here.
- `src/components/ui/button.tsx` — site Button component; `boxy` variant per D-18 lands here.
- `.planning/v2.0-MILESTONE-AUDIT.md` — format reference for the SC-13 reconciliation artefact (D-14).

### Spec-locked numeric tables (DO NOT alter)
- ROADMAP §SC-12 `maxTokensOutput`, `maxTokensInput`, `maxCharactersInput` per-feature × per-tier — verbatim from product 2026-04-21. Tier sums for `maxTokensOutput` MUST reconcile to `free 11500 / pro 52000 / elite 72000`. **Per D-19, values verified verbatim against ROADMAP.md lines 468–497 on 2026-04-21; 4:1 `maxCharactersInput` ÷ `maxTokensInput` invariant holds on every non-null row. Any drift from these exact values fails CI (planner must include the vitest snapshot guard).**
- ROADMAP §SC-1 `MERITS_PER_MONTH = { free: 10, pro: 75, elite: 150 }` and `MERIT_COST_PER_FEATURE` (resume/career/linkedin = 3·2·3; recruiting-lens & interview-prep = `null·8·5`).
- ROADMAP §SC-1 / SC-4 `PRICING` (Pro $8.99/$89.99, Elite $16.99/$169.99, Free $0/$0).
- ROADMAP §SC-6 pack catalog (`pack_3` $1.99 / `pack_10` $4.99 / `pack_25` $9.99 / `pack_50` $17.99).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tier-config.ts` — already the per-tier central config (timeouts, models, single TIER_MAX_TOKENS). Extends naturally to host the three new per-feature × per-tier tables (D-09).
- `merit-gateway.ts` — already the merit-spend chokepoint with comprehensive tests (`merit-gateway.{perf,rate,raw,test}.ts`). Spend-ordering logic per SC-7 lands here without restructuring.
- `analyze-resume`'s `CALL_CONFIGS` + boot-time invariant pattern — re-used by recruiting-lens; ready to be re-wired against per-feature totals (D-10).
- shadcn/ui `Button` component — accepts variants, ready to host the `boxy` variant (D-18).
- `useFeatureCosts.ts` (FE) — single read path for merit costs; switches over to the shared TS module cleanly (D-01).
- `usage_tracking` table + anniversary-day reset pattern — the same machinery used by Pro/Elite extends to Free with no schema change (D-05).

### Established Patterns
- `_shared/` is the canonical home for cross-function utilities (auth, cors, anthropic, merit-gateway, tier-config). Adding `input-guard.ts` here matches convention (D-12).
- Boot-time invariants in feature handlers (e.g., `analyze-resume` asserts CALL_CONFIGS sum vs cap) — repeat this pattern for the per-feature budget assertion (D-10).
- DB-as-truth + TS-as-mirror with startup divergence-check is already used informally; D-03 formalizes it for `merit_feature_costs`.
- Token-based theming via CSS variables in `:root` + Tailwind `hsl(var(--*))` — brand-v2 namespace plugs in cleanly without changing the consumer pattern (D-16).
- vitest is already wired (`npm run test`), and a UI-lint vitest follows existing precedent for mechanical enforcement (D-18).

### Integration Points
- New shared TS module → imported by all 5 feature handlers (analyze-resume, analyze-career, grade-linkedin, recruiting-lens, interview-prep-analyze) AND by all FE surfaces that show merit costs / pricing.
- `merit-gateway.ts` → adds top-up balance fall-through (SC-7) without changing its public API.
- `checkout-session` creator (existing Stripe handler) → adds annual-SKU branch (SC-4) and one-time-pack mode (SC-6); the webhook adds `checkout.session.completed` / `payment_intent.succeeded` handling for pack credits (SC-6).
- `merit_transactions` table → enum extended (D-04), new rows from pack purchases written here.
- `/pricing` page → wraps in `theme-v2` class (D-16), uses `boxy` Button variant (D-18), adds Monthly/Annual toggle + pack section + visual hierarchy per SC-8.
- Header `+` icon, out-of-merits modal, dashboard "Running low?" card → all gated by the same monthly-allocation-balance threshold check (D-08, SC-9).

</code_context>

<specifics>
## Specific Ideas

- **Token tables are LOCKED** to the values product supplied on 2026-04-21 (mirrored verbatim into `24-DISCUSS-CHECKPOINT.json` and ROADMAP SC-12). These values supersede the original phase brief's "token configs are locked" note. Do not re-derive, re-tune, or "round" them — copy them exactly into the new shared TS module.
- **`null` semantics**: in `maxTokensInput` / `maxCharactersInput`, `null` = feature locked on this tier. Pair with `maxTokensOutput = 0` to make locked-state unambiguous. Validator (D-12) treats either signal as "locked → upgrade prompt".
- **`merit_transactions.pack_id`** column is required for top-up rows (per SC-5). For non-pack rows (`source = 'subscription'`, `'bonus'`), it's nullable.
- **Idempotency for pack credit (SC-6)**: webhook MUST be safe against replay. Use `stripe_payment_intent_id` as the dedupe key in `merit_transactions` (unique constraint or upsert-on-conflict).
- **Visual hierarchy per SC-8**: the `pack_25` "Best Value" card is the visual anchor. Implication for the planner: this is not "all 4 packs styled identically" — the 25-pack gets a scale/glow/border treatment.
- **Header merit format (SC-10)**: `"47 / 75 merits"` (no top-up balance) → `"47 / 75 + 15 bonus"` (with top-up). JetBrains Mono numerics, red progress bar. The "+ 15 bonus" segment is smaller and red-accented. This is the spec — don't paraphrase.

</specifics>

<deferred>
## Deferred Ideas

- **Sitewide rebrand** (apply brand-v2 tokens to all pages beyond `/pricing` and top-up surfaces). Out of scope for Phase 24 per D-15. Candidate for a future phase once the v2 token namespace has lived on `/pricing` and stabilized.
- **Self-hosted fonts** (move Fraunces / JetBrains Mono / Inter Tight from Google Fonts CDN to local woff2 in `/public/fonts`). Privacy/perf upgrade. Pairs naturally with the sitewide rebrand phase.
- **Drop deprecated `TIER_MAX_TOKENS` export** (per D-11). Schedule for the phase after Phase 24 once downstream tests have migrated to `getMaxOutput`.
- **Drop deprecated monthly Stripe price IDs** (SC-4 says "deprecated, not deleted"). Cleanup phase candidate once the last legacy subscriber has rolled to annual or Phase-24 monthly SKUs.
- **Promote brand-v2 tokens to defaults** (rename `--bg-deep` → `--background`, `--accent-red` → `--primary`, etc.). Mechanical follow-up after sitewide rebrand QA.

</deferred>

---

*Phase: 24-pricing-merit-economy-and-top-up-packs-update-update-merits-*
*Context gathered: 2026-04-21*
