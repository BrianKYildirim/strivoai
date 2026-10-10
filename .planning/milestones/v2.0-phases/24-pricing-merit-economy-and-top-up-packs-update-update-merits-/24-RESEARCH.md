# Phase 24: pricing-merit-economy-and-top-up-packs-update — Research

**Researched:** 2026-04-21
**Domain:** Monetization economy retune (merits/pricing/packs), Stripe dual-path, per-feature token-budget rewiring, scoped brand-v2 rebrand
**Confidence:** HIGH

---

## Phase Boundary

Phase 24 retunes the live merit economy (caps 10/75/150; costs 3·2·3 for resume/career/linkedin and null·8·5 for recruiting-lens/interview-prep) and subscription pricing (Pro $8.99/$89.99, Elite $16.99/$169.99), introduces annual billing, and adds one-time **Merit Top-Up Packs** as a second non-expiring balance — without retroactively mutating existing balances or disrupting grandfathered subscribers. It also centralizes per-feature × per-tier output-token, input-token, and input-character budgets into a single dual-imported TS module (verbatim from SC-12), enforces both via a new `_shared/input-guard.ts` chokepoint, and applies a brand-v2 CSS-variable namespace (`#0a0607` / `#ff2d3f` / Fraunces + JetBrains Mono + Inter Tight / boxy CTAs / glassmorphism) strictly to `/pricing` and its top-up surfaces. Shop flow deep-links into `/pricing#packs`; pack purchase uses an embedded Stripe Payment Element (divergence from the existing Checkout-redirect subscription flow).

---

## Locked Decisions Summary (D-01 … D-28)

- **D-01:** Single dual-imported TS module hosts all 6 tables (`MERITS_PER_MONTH`, `MERIT_COST_PER_FEATURE`, `PRICING`, `maxTokensOutput`, `maxTokensInput`, `maxCharactersInput`).
- **D-02:** FE and BE both import the same file; no `/api/config` endpoint, no mirrored copies.
- **D-03:** `merit_feature_costs` DB table stays runtime source-of-truth for costs; boot-time DB↔TS diff assertion throws on divergence.
- **D-04:** `merit_transactions.source` enum extended additively — keep `'shop'`, add `'topup'`.
- **D-05:** Free-tier monthly reset anchored to signup anniversary day-of-month (reuses existing Pro/Elite anniversary machinery).
- **D-06:** Existing Free users NOT topped up at deploy; new allocation applies at next anniversary reset.
- **D-07:** Free users CAN buy top-up packs; top-up balance is tier-independent.
- **D-08:** Header `+` icon uses the same 20%-of-cap rule for all tiers (Free = ≤2 remaining).
- **D-09:** Three new tables extend `supabase/functions/_shared/tier-config.ts` with typed accessors `getMaxOutput` / `getMaxInputTokens` / `getMaxInputChars`.
- **D-10:** Feature handlers absorb new output budgets via accessor; boot invariant rewritten to `sum(CALL_CONFIGS) ≤ getMaxOutput(feature, tier)`.
- **D-11:** `TIER_MAX_TOKENS` kept as `@deprecated` re-export for one cycle.
- **D-12:** New `supabase/functions/_shared/input-guard.ts` exports `validateInputBudget(feature, tier, text)`; called after auth + merit gate, before LLM.
- **D-13:** `maxTokensOutput = 0` OR `maxTokensInput = null` means feature is tier-locked; validator short-circuits → existing upgrade prompt, no Merit deduction, no Claude call.
- **D-14:** SC-13 reconciliation delivered as a single Markdown audit file `24-AUDIT.md`.
- **D-15:** Brand-v2 scoped to `/pricing` + owned top-up surfaces only; sitewide rebrand deferred.
- **D-16:** New CSS-var namespace (`--bg-deep`, `--accent-red`, `--radius-boxy`) opted-in via `.theme-v2` wrapper class — existing `--background`/`--primary`/`--radius` untouched.
- **D-17:** Fraunces / JetBrains Mono / Inter Tight via Google Fonts CDN with `display=swap` + preconnect; weight-subsetted.
- **D-18:** New `boxy` Button variant + vitest scan (`pricing-boxy.lint.test.ts`) that fails CI on `rounded-full` or `variant="default"` CTA on `/pricing` surfaces.
- **D-19:** SC-12 three tables copied VERBATIM with vitest snapshot guard; per-feature enforcement is MANDATORY across all 5 feature handlers.
- **D-20:** Existing monthly Pro/Elite subscribers grandfathered forever on current price IDs.
- **D-21:** New caps (SC-1/SC-12) ship immediately at deploy — no env-flag gating.
- **D-22:** Migrations-first deploy ordering (additive enum + new RPC + unique constraint ship as migration FIRST).
- **D-23:** Pack purchases use embedded Stripe Payment Element (`@stripe/react-stripe-js`); subscriptions stay on Stripe Checkout redirect/embedded.
- **D-24:** Canonical pack catalog lives at `/pricing#packs`; header `+`, out-of-merits modal, and dashboard "Running low?" card all deep-link there.
- **D-25:** Post-purchase Sonner toast (SC-10 format) + live header balance refresh via existing merit-balance query.
- **D-26:** D-03 and D-10 invariants run at module-load only (cold start), cached in module scope.
- **D-27:** Fail-closed: invariant trip → isolate fails to boot → all requests 500 until fixed.
- **D-28:** Observability via `_shared/logger.ts` structured log + Supabase function-log alert on `invariant-violation`.

---

## Project Constraints (from CLAUDE.md)

- No commits under `.planning/` or modifications to `.gitignore` — ever.
- Frontend: Vite + React + TypeScript + shadcn/ui + Tailwind CSS; preserve existing patterns.
- Backend: Supabase Edge Functions (Deno); no new infrastructure.
- AI: Claude Haiku 4.5 (model selection preserved per SC-12).
- Semantic design tokens preferred over hardcoded colors.
- Prefer `rg` for search, `apply_patch` for focused edits.
- Prefer small, reversible changes over broad rewrites.
- Keep staging and production env settings separate and explicit.

---

## Phase Requirements

Phase-24 requirements were not given explicit REQ-IDs upfront (ROADMAP line 452 says "TBD — audit against prior-phase coverage during `/gsd-plan-phase 24`"). Research has surveyed REQUIREMENTS.md (Phase 10–21 REQ-ID space) and recommends the following REQ-ID mapping for the planner — re-uses existing IDs where the prior phase only partially delivered, and proposes new IDs for Phase-24-specific behaviour. [VERIFIED: REQUIREMENTS.md traceability table]

| ID | Source | Description | Phase-24 Reason |
|----|--------|-------------|-----------------|
| MER-14 | Existing | Subscription Merits reset monthly; shop Merits never expire | Phase 24 preserves this; `'topup'` source is a rename-compatible alias of `'shop'` bucket |
| SUB-02 | Existing | Stripe `pro_yearly` Price $89.99/yr | Phase 24 owns the FIRST live wiring in `create-checkout-session` |
| SUB-04 | Existing | Stripe `elite_yearly` Price $169.99/yr | Same — live wiring lands in Phase 24 |
| SHOP-01 … SHOP-04 | Existing | 4 pack SKUs @ $1.99/$4.99/$9.99/$17.99 | Already provisioned (scripts/provision-stripe-products.mjs) — Phase 24 wires the embedded Payment Element path |
| SHOP-05 | Existing | Stripe Checkout in `payment` mode for packs | Phase 24 **adds** an embedded-Payment-Element alternative per D-23 (keeps Checkout for subs) |
| SHOP-06 / SHOP-09 | Existing | Webhook credits via `credit_shop_merits`; idempotent on `stripe_payment_intent_id` | Already wired in `stripe-webhook-handler/index.ts` lines 485-489; Phase 24 adds the `payment_intent.succeeded` branch for Payment-Element (no Checkout Session) |
| UX-08 | Existing | `/pricing` Monthly/Yearly toggle with savings badges | Phase 24 **rewrites** the page under `.theme-v2` wrapper |
| **TOPUP-01** (new) | Phase 24 | `merit_transactions.source` accepts `'topup'` (additive enum) | D-04 |
| **TOPUP-02** (new) | Phase 24 | `credit_shop_merits` writes `source='topup'` for new pack credits | D-04 |
| **TOPUP-03** (new) | Phase 24 | Embedded Payment Element pack-purchase flow via `/create-payment-intent` | D-23 |
| **TOPUP-04** (new) | Phase 24 | Header `+` icon deep-links to `/pricing#packs` when balance < 20% of cap | D-08, SC-9b |
| **TOPUP-05** (new) | Phase 24 | "Running low?" dashboard card anchoring 25-pack | SC-9c |
| **BUDGET-01** (new) | Phase 24 | Central TS module exports `maxTokensOutput` / `maxTokensInput` / `maxCharactersInput` | D-01, D-09, SC-12 |
| **BUDGET-02** (new) | Phase 24 | `validateInputBudget(feature, tier, text)` chokepoint | D-12 |
| **BUDGET-03** (new) | Phase 24 | Every feature handler reads budgets via accessor; no hardcoded caps | D-10, D-19 |
| **BRAND-01** (new) | Phase 24 | `.theme-v2` CSS-var namespace on `/pricing` + top-up surfaces | D-15, D-16 |
| **BRAND-02** (new) | Phase 24 | `boxy` Button variant + vitest lint guard | D-18 |
| **ECON-01** (new) | Phase 24 | `MERITS_PER_MONTH = {free:10, pro:75, elite:150}` applied at next anniversary (no retro mutation) | SC-1, SC-2, D-06 |
| **ECON-02** (new) | Phase 24 | Free anniversary-day reset reuses Pro/Elite machinery | D-05 |
| **AUDIT-01** (new) | Phase 24 | `24-AUDIT.md` reconciles every per-feature budget vs SC-12 | SC-13, D-14 |

---

## Summary

The existing codebase already implements ~70% of the dual-path plumbing Phase 24 needs: `create-checkout-session` already supports both `mode: subscription` and `mode: payment` with an `ui_mode: embedded` branch (returning `clientSecret` instead of a redirect URL); `stripe-webhook-handler` already routes `checkout.session.completed` → `credit_shop_merits` RPC with idempotency on `stripe_payment_intent_id`; `merit-gateway.withMerits()` already owns deduct→refund semantics; `merit_feature_costs` table already hosts the 13-row per-feature × per-tier cost map with a read-all RLS policy for the frontend; `tier-config.ts` already exports `TIER_MAX_TOKENS` + typed accessors (`getTimeout`, `getModel`); and the `check_and_deduct_merits` RPC already performs subscription-first → shop-fallback spend ordering (SHOP-10 / SC-7) at the SQL level.

What's genuinely new in Phase 24: (1) the three SC-12 budget tables and the typed accessors that read them; (2) the `_shared/input-guard.ts` chokepoint that pairs `maxTokensInput` + `maxCharactersInput` into a single 413-style validator; (3) the boot-time DB↔TS diff invariant (D-03); (4) the rewrite of every feature handler's local token-budget constants to read from the new accessor — five handlers currently each host their own per-tier cap map; (5) additive migration extending `merit_transactions.source` enum with `'topup'` and guaranteeing per-row `stripe_payment_intent_id` idempotency; (6) the embedded Payment Element pack-purchase flow (a new `create-payment-intent` edge function — currently only Checkout sessions exist); (7) a `.theme-v2` scoped CSS-var namespace and the `boxy` Button variant with vitest lint guard; (8) the `MERITS_PER_MONTH` anniversary reset for Free users using existing machinery; (9) `24-AUDIT.md` reconciling the five feature handlers' current token caps against SC-12.

**Primary recommendation:** Place the dual-imported TS module at `src/config/pricing-config.ts` and relative-import it from edge functions via `../../../src/config/pricing-config.ts`. This keeps it inside vitest's `include` glob (`src/**/*.test.{ts,tsx}`) so the SC-12 snapshot guard (D-19) runs on every `npm test`, and it inherits the `@/*` path alias for FE consumers. The Deno side pays a two-level relative-import hop but gains zero duplication. Verified this is a safe cross-runtime import because the module will export only constants + pure functions (zero runtime deps). [VERIFIED: vitest.config.ts line 15, vite.config.ts lines 16-17]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SC-12 budget table definitions | Shared config (dual-imported) | — | Single source of truth for FE + BE; vitest snapshot lives FE-side |
| Per-feature budget enforcement | API / Edge Functions (Deno) | — | Must happen before Anthropic call; server-only |
| DB↔TS cost-map invariant | API / Edge Functions (Deno, cold-start) | Database (source of truth) | Reads `merit_feature_costs` via service client at module load |
| Dual-balance spend ordering | Database (RPC) | — | `check_and_deduct_merits` already does subscription→shop split atomically |
| Stripe subscription creation | API (edge fn) + Stripe Checkout redirect/embedded | Frontend | Existing path (`create-checkout-session`) handles both |
| Stripe pack purchase | API (new `create-payment-intent` edge fn) + Payment Element | Frontend (Stripe.js) | New dual path per D-23 |
| Pack credit on payment success | Webhook handler (existing) | Database RPC (`credit_shop_merits`) | Idempotency lives at DB layer (UNIQUE constraint) |
| Header balance display + `+` icon | Frontend (TopBar) | — | Reads `useMerits()`; purely presentation |
| `/pricing` brand-v2 surface | Frontend (scoped `.theme-v2`) | — | CSS-var namespace isolation |
| Boxy Button lint guard | CI (vitest) | — | Mechanical enforcement, not runtime |
| Input-budget 413 response | API (edge fn) | — | `validateInputBudget` returns typed shape before LLM call |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @stripe/react-stripe-js | ^6.2.0 | Payment Element provider/host for pack purchases | Already in package.json; D-23 |
| @stripe/stripe-js | ^9.2.0 | Stripe.js loader; confirms PaymentIntent client-side | Already in package.json |
| Stripe Node SDK | npm:stripe@14 | Server-side PaymentIntent creation + webhook verification | Already in use (`stripe-webhook-handler`, `create-checkout-session`) |
| @tanstack/react-query | ^5.83.0 | Merit balance query + invalidation post-purchase | Phase 20 pattern (`useMerits`) |
| zod | ^3.25.76 | Request body validation for new `create-payment-intent` | Already in project conventions |
| vitest | ^1.6.1 | Snapshot guard (D-19), boxy-lint (D-18), boundary tests (SC-7) | Only test runner in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^1.7.4 | Post-purchase toast (D-25, SC-6) | Already adopted |
| lucide-react | ^0.462.0 | Gem, Plus, Check, X icons | Already adopted |
| react-router-dom | ^6.30.1 | `navigate('/pricing#packs')` + `scroll-margin-top: 96px` | Already adopted |
| Google Fonts CDN | n/a | Fraunces/JetBrains Mono/Inter Tight via `display=swap` | D-17 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Embedded Payment Element | Stripe Checkout redirect (existing) | Rejected per D-23: worse mobile conversion; diverges from the "stay in app" UX for top-up |
| Dual-imported TS config | `/api/config` boot endpoint | Rejected per D-02: adds a cold-start HTTP hop and a sync invariant |
| Self-hosted fonts | Google Fonts CDN | Deferred per D-17; +300-500 KB to repo not worth it before sitewide rebrand |
| Sentry for invariant trips | Structured logger + Supabase alert | D-28: no new deps, reuses existing infra |

**Installation:** None required — every dep already in `package.json` and Deno `deno.json` import maps.

**Version verification:** Not re-run — packages are locked via package-lock.json and already in production use. [VERIFIED: package.json]

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Vite / React)                                             │
│                                                                     │
│  /pricing (.theme-v2 wrapper)                                       │
│    ├─ TierCardV2 (Free/Pro/Elite) ──▶ useStripeCheckout             │
│    │                                   (mode: subscription,         │
│    │                                    interval: monthly|annual)   │
│    └─ PackSectionV2 (#packs)                                        │
│         ├─ PackCardV2 (3/10/25/50) ──▶ [NEW] useCreatePaymentIntent │
│         │                              (mode: payment, pack_size)   │
│         └─ StripePaymentElementModal ──▶ stripe.confirmPayment      │
│                                           │                         │
│  TopBar                                   │                         │
│    ├─ MeritBalanceHeaderV2 ──▶ useMerits() (get_merit_balance RPC)  │
│    └─ HeaderTopUpTrigger (+ icon, <20%) ──▶ navigate('/pricing#packs')│
│                                                                     │
│  Out-of-merits modal / Dashboard "Running low?" ──▶ /pricing#packs  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SHARED CONFIG (dual-imported)                                       │
│  src/config/pricing-config.ts                                       │
│    MERITS_PER_MONTH        { free:10, pro:75, elite:150 }           │
│    MERIT_COST_PER_FEATURE  { resume/career/linkedin 3·2·3, ... }    │
│    PRICING                 { pro $8.99/$89.99, elite $16.99/$169.99 }│
│    maxTokensOutput         (5 features × 3 tiers from SC-12)        │
│    maxTokensInput          (5 features × 3 tiers, null=locked)      │
│    maxCharactersInput      (5 features × 3 tiers, null=locked)      │
│    PACK_CATALOG            [{id:'pack_25', price:999, merits:25,    │
│                              isBestValue:true}, ...]                │
│    getMaxOutput / getMaxInputTokens / getMaxInputChars               │
│       (typed accessors — feature × tier)                            │
└────────────────┬────────────────────────────┬───────────────────────┘
                 │                            │
                 ▼                            ▼
┌────────────────────────────┐  ┌────────────────────────────────────┐
│ EDGE FUNCTIONS (Deno)      │  │ EDGE FUNCTIONS (Deno) — Stripe    │
│                            │  │                                    │
│ analyze-resume             │  │ create-checkout-session            │
│ analyze-career             │  │   mode: subscription ──▶ Checkout  │
│ grade-linkedin             │  │   mode: payment (legacy; OK to     │
│ recruiting-lens            │  │     coexist with Payment Element)  │
│ interview-prep-analyze     │  │                                    │
│   1. requireAuth           │  │ [NEW] create-payment-intent        │
│   2. withMerits()          │  │   { pack_size } ──▶ PaymentIntent  │
│      (check_and_deduct_..) │  │   metadata.user_id + pack_size     │
│   3. [NEW] validateInput  │  │   returns { clientSecret }         │
│      Budget(feat,tier,txt)│  │                                    │
│      (tokens AND chars)   │  │ stripe-webhook-handler (existing)  │
│   4. getMaxOutput(feat,   │  │   checkout.session.completed (sub) │
│      tier)                │  │   checkout.session.completed (pay) │
│   5. invokeAnthropicText  │  │     ──▶ credit_shop_merits RPC     │
│      (Haiku 4.5)          │  │   [NEW] payment_intent.succeeded   │
│                            │  │     ──▶ credit_shop_merits RPC    │
│ Cold-start invariants:     │  │     (idempotent on PI id)          │
│   - D-03: DB vs TS cost map│  │                                    │
│   - D-10: sum(CALL_CONFIGS)│  └────────────────────────────────────┘
│     ≤ getMaxOutput(f,t)    │
│   FAIL-CLOSED on mismatch  │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────┐
│ POSTGRES (Supabase)                                                │
│  user_merits (id, user_id, subscription_balance, shop_balance, …)  │
│    CHECK subscription_balance ≥ 0, shop_balance ≥ 0                │
│                                                                    │
│  merit_transactions (append-only)                                  │
│    balance_type  ∈ 'subscription' | 'shop' | 'grant' | 'refund'    │
│    [NEW] source  extended with 'topup' (additive enum — D-04)      │
│    [NEW] pack_id nullable column (required for source='topup')     │
│    [NEW] stripe_payment_intent_id text NULL UNIQUE (dedupe)        │
│                                                                    │
│  merit_shop_purchases — already has stripe_payment_intent_id UNIQUE│
│    ON CONFLICT DO NOTHING pattern at RPC layer                     │
│                                                                    │
│  merit_feature_costs — 13 rows, RLS SELECT-all for authenticated   │
│    source of truth; TS module mirrors for typing                   │
│                                                                    │
│  RPCs:                                                             │
│    check_and_deduct_merits — already does subscription-first,      │
│      shop-fallback spend ordering (SC-7 already implemented)       │
│    refund_merits, get_merit_balance, credit_shop_merits,           │
│    reset_subscription_merits, reconcile_merit_balance              │
└────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── config/
│   └── pricing-config.ts          # [NEW] dual-imported SSoT (D-01/D-02)
├── config/
│   └── pricing-config.snapshot.ts # [NEW] pinned SC-12 values for D-19 snapshot
├── components/
│   ├── pricing/                   # [NEW] Phase-24 scoped components
│   │   ├── PricingPageV2.tsx
│   │   ├── TierCardV2.tsx
│   │   ├── BillingIntervalToggleV2.tsx
│   │   ├── PackSectionV2.tsx
│   │   └── PackCardV2.tsx
│   ├── topup/                     # [NEW]
│   │   ├── StripePaymentElementModal.tsx
│   │   ├── OutOfMeritsModalV2.tsx
│   │   ├── HeaderTopUpTrigger.tsx
│   │   ├── MeritBalanceHeaderV2.tsx
│   │   └── RunningLowCard.tsx
│   └── ui/button.tsx              # [MODIFY] add `boxy` variant (D-18)
├── hooks/
│   ├── useMerits.ts               # [MODIFY] expose `cap` from MERITS_PER_MONTH for 20% check
│   ├── useFeatureCosts.ts         # [MODIFY] can optionally use TS module for instant paint
│   └── useCreatePaymentIntent.ts  # [NEW] pack purchase path
├── pages/
│   └── Pricing.tsx                # [REWRITE] PricingPageV2 host
└── pages/__tests__/
    ├── pricing-boxy.lint.test.ts  # [NEW] D-18 guard
    └── sc12-snapshot.test.ts      # [NEW] D-19 guard

supabase/functions/_shared/
├── tier-config.ts                 # [MODIFY] add accessors; deprecate TIER_MAX_TOKENS
├── input-guard.ts                 # [NEW] validateInputBudget (D-12)
└── pricing-config-bridge.ts       # [NEW] re-export from ../../../src/config/pricing-config.ts

supabase/functions/
├── create-payment-intent/         # [NEW] pack purchase endpoint (D-23)
│   ├── index.ts
│   └── index.test.ts
└── stripe-webhook-handler/index.ts # [MODIFY] add payment_intent.succeeded branch

supabase/migrations/
└── 20260422000000_phase_24_topup.sql  # [NEW]
    - ALTER TABLE merit_transactions:
        - ADD COLUMN pack_id text NULL
        - ADD COLUMN stripe_payment_intent_id text NULL
        - ADD CONSTRAINT uq_merit_tx_stripe_pi UNIQUE (stripe_payment_intent_id)
          WHERE stripe_payment_intent_id IS NOT NULL  (partial unique)
    - Update CHECK on balance_type/source to accept 'topup' (additive)
    - [optional] new credit_topup_merits RPC (extends credit_shop_merits with source='topup')
```

### Pattern 1: Dual-Imported Config Module

**What:** Single TS file exporting all phase-24 constants + accessors; imported by Vite (`@/config/pricing-config`) and by Deno via relative path (`../../../src/config/pricing-config.ts`).
**When to use:** Any constant the FE must display AND the BE must enforce.
**Example:**
```typescript
// src/config/pricing-config.ts
export type Tier = 'free' | 'pro' | 'elite';
export type FeatureKey = 'resumeAnalysis' | 'careerCompass' | 'recruitingLens' | 'linkedinGrader' | 'interviewPrepCoach';

export const MERITS_PER_MONTH: Record<Tier, number> = { free: 10, pro: 75, elite: 150 };

export const MERIT_COST_PER_FEATURE: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 3,    pro: 2, elite: 3 },
  careerCompass:      { free: 3,    pro: 2, elite: 3 },
  linkedinGrader:     { free: 3,    pro: 2, elite: 3 },
  recruitingLens:     { free: null, pro: 8, elite: 5 },
  interviewPrepCoach: { free: null, pro: 8, elite: 5 },
};

export const PRICING = {
  free:  { monthly: 0,    annual: 0 },
  pro:   { monthly: 899,  annual: 8999 },   // cents
  elite: { monthly: 1699, annual: 16999 },
} as const;

export const maxTokensOutput: Record<FeatureKey, Record<Tier, number>> = {
  resumeAnalysis:     { free: 4000, pro: 8000,  elite: 12000 },
  careerCompass:      { free: 5000, pro: 12000, elite: 16000 },
  recruitingLens:     { free: 0,    pro: 12000, elite: 16000 },
  linkedinGrader:     { free: 2500, pro: 8000,  elite: 12000 },
  interviewPrepCoach: { free: 0,    pro: 12000, elite: 16000 },
};

export const maxTokensInput: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 3500, pro: 5000, elite: 10000 },
  careerCompass:      { free: 6000, pro: 6000, elite: 12000 },
  recruitingLens:     { free: null, pro: 8000, elite: 9000  },
  linkedinGrader:     { free: 3500, pro: 5000, elite: 3500  },
  interviewPrepCoach: { free: null, pro: 5850, elite: 5850  },
};

export const maxCharactersInput: Record<FeatureKey, Record<Tier, number | null>> = {
  resumeAnalysis:     { free: 14000, pro: 20000, elite: 40000 },
  careerCompass:      { free: 24000, pro: 24000, elite: 48000 },
  recruitingLens:     { free: null,  pro: 32000, elite: 36000 },
  linkedinGrader:     { free: 14000, pro: 20000, elite: 14000 },
  interviewPrepCoach: { free: null,  pro: 23400, elite: 23400 },
};

export const PACK_CATALOG = [
  { id: 'pack_3',  merits: 3,  priceCents: 199,  perMeritCents: 66 },
  { id: 'pack_10', merits: 10, priceCents: 499,  perMeritCents: 50 },
  { id: 'pack_25', merits: 25, priceCents: 999,  perMeritCents: 40, isBestValue: true },
  { id: 'pack_50', merits: 50, priceCents: 1799, perMeritCents: 36 },
] as const;

export function getMaxOutput(feature: FeatureKey, tier: Tier): number {
  return maxTokensOutput[feature][tier];
}
export function getMaxInputTokens(feature: FeatureKey, tier: Tier): number | null {
  return maxTokensInput[feature][tier];
}
export function getMaxInputChars(feature: FeatureKey, tier: Tier): number | null {
  return maxCharactersInput[feature][tier];
}
```

### Pattern 2: Boot-Time Invariant Assertion (D-03 / D-10)

**What:** At module load of each feature handler (and at tier-config module load), query DB + assert against TS; throw on divergence.
**Example:**
```typescript
// supabase/functions/_shared/tier-config.ts (extended)
import { MERIT_COST_PER_FEATURE, maxTokensOutput, type FeatureKey, type Tier }
  from '../../../src/config/pricing-config.ts';
import { getServiceClient } from './supabase-client.ts';
import { createLogger } from './logger.ts';

const log = createLogger('tier-config');

// D-03: cold-start DB↔TS cost-map diff (runs once per Deno isolate)
let _costMapVerified = false;
export async function verifyCostMap(): Promise<void> {
  if (_costMapVerified) return;
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('merit_feature_costs').select('feature, tier, cost');
  if (error) throw new Error(`tier-config: failed to read merit_feature_costs: ${error.message}`);

  const dbKey = (r: {feature:string; tier:string}) => `${r.feature}:${r.tier}`;
  const dbMap = new Map(data!.map(r => [dbKey(r), r.cost]));
  const FEATURE_KEY_TO_DB: Record<FeatureKey, string> = {
    resumeAnalysis: 'resume_analysis', careerCompass: 'career_compass',
    linkedinGrader: 'linkedin_grading', recruitingLens: 'recruiting_lens',
    interviewPrepCoach: 'interview_prep',
  };
  for (const featKey of Object.keys(FEATURE_KEY_TO_DB) as FeatureKey[]) {
    for (const tier of ['free','pro','elite'] as Tier[]) {
      const dbFeat = FEATURE_KEY_TO_DB[featKey];
      const tsCost = MERIT_COST_PER_FEATURE[featKey][tier];
      const dbCost = dbMap.get(`${dbFeat}:${tier}`) ?? null;
      if (tsCost !== dbCost) {
        log.error('invariant-violation', { feature: featKey, tier, source: 'd-03', ts_value: tsCost, db_value: dbCost });
        throw new Error(`[D-03] cost-map drift: ${featKey}/${tier} ts=${tsCost} db=${dbCost}`);
      }
    }
  }
  _costMapVerified = true;
}
```

### Pattern 3: Input Guard Chokepoint (D-12)

```typescript
// supabase/functions/_shared/input-guard.ts
import { getMaxInputTokens, getMaxInputChars, type FeatureKey, type Tier }
  from '../../../src/config/pricing-config.ts';

export type InputGuardResult =
  | { ok: true }
  | { ok: false; reason: 'tier_locked' | 'tokens_exceeded' | 'characters_exceeded';
      limit: number | null; actual: number };

/** Approximate 4 chars per token (matches SC-12 invariant). */
function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }

export function validateInputBudget(
  feature: FeatureKey,
  tier: Tier,
  text: string,
): InputGuardResult {
  const maxTok = getMaxInputTokens(feature, tier);
  const maxChar = getMaxInputChars(feature, tier);

  // D-13: null on either axis means feature is tier-locked
  if (maxTok === null || maxChar === null) {
    return { ok: false, reason: 'tier_locked', limit: null, actual: text.length };
  }

  if (text.length > maxChar) {
    return { ok: false, reason: 'characters_exceeded', limit: maxChar, actual: text.length };
  }
  const tokEst = estimateTokens(text);
  if (tokEst > maxTok) {
    return { ok: false, reason: 'tokens_exceeded', limit: maxTok, actual: tokEst };
  }
  return { ok: true };
}

export function toInputGuardResponse(
  result: Extract<InputGuardResult, { ok: false }>,
  corsType: 'user',
): Response {
  if (result.reason === 'tier_locked') {
    return new Response(
      JSON.stringify({ error: 'tier_locked', upgrade_required: true }),
      { status: 403, headers: { /* cors */ 'Content-Type':'application/json' } });
  }
  return new Response(
    JSON.stringify({ error: result.reason, limit: result.limit, actual: result.actual }),
    { status: 413, headers: { 'Content-Type':'application/json' } });
}
```

### Anti-Patterns to Avoid

- **Hardcoded per-feature token caps** — every current handler holds its own cap map (see Current-Codebase Survey §5). Phase 24 MUST kill these; the planner's first wave should replace all five with `getMaxOutput(featureKey, tier)` calls.
- **Running the invariant per-request** — D-26 locks it to cold start only; per-request invariant checks blow NFR-01's <100 ms budget.
- **Calling `refund_merits` from feature code after a validator 413** — D-12 says validator runs AFTER merit deduct. Either run validator FIRST (before `withMerits`) or wrap the validator throw as `MeritRefundable`. [RECOMMENDED: run validator INSIDE `withMerits` callback and throw a typed `InputBudgetExceeded` sentinel; the gateway refunds cleanly.] Note this diverges from CONTEXT D-12's literal order; the planner should reconcile — see Open Questions Q1.
- **Modifying `.planning/` via git** — CLAUDE.md hard rule.
- **Touching `src/index.css :root`** — D-16 is explicit: new tokens go under `.theme-v2 { ... }`; existing tokens untouched.
- **Adding non-additive enum migration** — D-04 / D-22 require additive only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe webhook signature verification | Hand-rolled HMAC | `stripe.webhooks.constructEventAsync` (already in `stripe-webhook-handler`) | HMAC timing attacks; payload versioning |
| Idempotency for pack credit | Application-level dedupe table | DB `UNIQUE (stripe_payment_intent_id)` constraint (already exists on `merit_shop_purchases`; MUST also add on `merit_transactions.stripe_payment_intent_id` per SC-5) | Race-condition safe; zero code |
| Subscription-first → shop-fallback spend | New RPC | Existing `check_and_deduct_merits` (already does this atomically — merit-rpcs.sql §2 lines 114-117) | SC-7 already implemented — Phase 24 just needs top-up BALANCE to flow through `shop_balance` |
| Token counting | Exact tokenizer | 4-char/token heuristic (SC-12 invariant holds by design) | Avoid adding a 300 KB tokenizer package; precision not required for a hard cap |
| Payment Element UI | Custom form | `@stripe/react-stripe-js` `<PaymentElement />` | SCA/3DS, card parsing, localization all free |
| Font loading | Custom `@font-face` | Google Fonts CDN (`display=swap` + preconnect) | D-17; matches existing Inter load |
| Config FE/BE sync | Boot endpoint / two mirrored files | Single dual-imported TS module | D-01/D-02; compile-time integrity |

**Key insight:** The merit RPC layer already implements SC-7 spend ordering. The "top-up vs monthly" distinction is a **naming** retune: `merit_transactions.source = 'topup'` is added as an additive enum value, and new credits target `user_merits.shop_balance` (which is already never reset per MER-14 / Phase 10 D-15). No new balance column needed.

---

## Current-Codebase Survey

### 1. Stripe Dual-Path Wiring — Status: 90% already wired

- **`supabase/functions/create-checkout-session/index.ts`** already supports both `mode: 'subscription'` and `mode: 'payment'` (lines 64-95), both with an `ui_mode: 'embedded'` branch that returns a `clientSecret` (lines 234-258, 288-319). The shop branch already sets `payment_intent_data.metadata.user_id` + `pack_size` (lines 304-309) for webhook correlation (Pitfall 9 comment).
- **`scripts/provision-stripe-products.mjs`** already establishes `STRIPE_PRICE_{PRO|ELITE}_{MONTHLY|ANNUAL}` env-var convention at lines 90-93 — annual SKUs are provisioned but not wired in the function env until Phase 24 goes live.
- **`supabase/functions/stripe-webhook-handler/index.ts`** already branches `checkout.session.completed` by `session.mode` (lines 207-230, 429-508) — subscription calls `reset_subscription_merits`, payment calls `credit_shop_merits` (line 485) with `payment_intent_id` as dedupe key.
- **Frontend** already uses `@stripe/react-stripe-js` — but only the `EmbeddedCheckout` variant (see `src/components/StripeCheckoutWrapper.tsx` lines 36-41, uses `EmbeddedCheckoutProvider` + `EmbeddedCheckout`). The `PaymentElement` component is NOT yet imported anywhere in `src/`. [VERIFIED: grep `@stripe/react-stripe-js` in src → only `StripeCheckoutWrapper.tsx` and tests]

**What's missing for Phase 24:**
1. A new **`create-payment-intent` edge function** (new path, D-23). This differs from `create-checkout-session` because a PaymentIntent returns a `clientSecret` consumable by `<PaymentElement>` directly, without a Checkout Session wrapper.
2. A new **`payment_intent.succeeded`** branch in `stripe-webhook-handler` — currently only `checkout.session.completed` triggers shop credit. Without this, the Payment-Element path would wait on webhooks that never fire (Checkout Session webhooks only fire for Checkout flows).
3. A new frontend **`StripePaymentElementModal`** component wrapping `<Elements options={{ clientSecret }}>` + `<PaymentElement />` + `stripe.confirmPayment()` submit handler.
4. An `env-var` for the publishable key is already present: `VITE_STRIPE_PUBLISHABLE_KEY` (StripeCheckoutWrapper.tsx line 13).

**Idempotency implication:** Stripe sends BOTH `payment_intent.succeeded` AND `checkout.session.completed` for embedded Checkout sessions; for PaymentIntent-only (Payment Element) flows, only `payment_intent.succeeded` fires. The webhook's existing idempotency (insert-first on `stripe_webhook_events.event_id` + `ON CONFLICT → 200 duplicate` at lines 20-21 of handler) makes adding a second trigger event safe.

### 2. Dual-Balance Spend Ordering (SC-7) — Status: already implemented at DB layer

`supabase/migrations/20260415000000_merit_rpcs.sql` §2 `check_and_deduct_merits` already does exactly what SC-7 requires:

```sql
-- Lines 113-117:
v_sub_take  := LEAST(v_sub_balance, v_cost);
v_shop_take := v_cost - v_sub_take;
-- ...then two INSERTs split by bucket + one UPDATE with FOR UPDATE row lock (line 98)
```

This is atomic, row-locked, and writes 1-or-2 `merit_transactions` rows sharing a `deduction_id` UUID (line 79). The 3 SC-7 boundary cases are:

1. **Pure monthly:** `v_sub_balance ≥ v_cost` → `v_sub_take = v_cost`, `v_shop_take = 0`, one row written with `balance_type='subscription'`.
2. **Mixed:** `v_sub_balance > 0 && v_sub_balance < v_cost` → `v_sub_take = v_sub_balance`, `v_shop_take = v_cost - v_sub_balance`, two rows written.
3. **Pure top-up:** `v_sub_balance = 0` → `v_sub_take = 0`, `v_shop_take = v_cost`, one row written with `balance_type='shop'`.

**Race conditions:** The `FOR UPDATE` at line 98 serializes concurrent feature calls per-user. Parallel `analyze-resume` calls from the same user queue at the row lock — already correct.

**Phase 24's actual ask:** Phase 24 doesn't need to change spend ordering. It needs to ensure TOP-UP credits flow into `shop_balance` (they already do — `credit_shop_merits` line 332 `shop_balance = shop_balance + p_pack_size`). The ONLY semantic change is the ledger tag: `source='topup'` instead of `'shop-credit'`. The planner's SC-7 tests cover the three boundary cases but do NOT need any code change — they exercise existing behaviour.

### 3. `merit_transactions` Schema Extension

Current shape (migration `20260414000000_merit_ledger_foundation.sql` lines 32-43):
```sql
merit_transactions (
  id, user_id, amount,
  balance_type CHECK IN ('subscription','shop','grant','refund'),
  source       text NOT NULL,  -- free-form; current values: 'feature-deduct',
                               --   'feature-refund', 'shop-credit', 'subscription-reset',
                               --   'upgrade-diff'
  feature, metadata jsonb, created_at
)
```

**Critical finding:** `source` is NOT an enum — it's a free-form `text`. CONTEXT.md D-04 says "enum migration is additive" which is slightly inaccurate; the actual change is simply "start writing `'topup'` as a new allowed value". No `CHECK` or enum type constrains `source` today. This makes D-04 even simpler than CONTEXT implies: **zero DDL change for the enum**, only an RPC/code change to start writing `'topup'`.

**What still needs DDL (SC-5):** Two new columns on `merit_transactions` and a partial unique index:
```sql
ALTER TABLE public.merit_transactions
  ADD COLUMN pack_id                  text NULL,
  ADD COLUMN stripe_payment_intent_id text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_merit_tx_stripe_pi
  ON public.merit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
```

**Note:** `merit_shop_purchases.stripe_payment_intent_id` ALREADY has a `UNIQUE` constraint (line 55). The `credit_shop_merits` RPC already does insert-first-on-purchases + idempotent shop-balance bump (lines 307-319). So the new unique index on `merit_transactions` is belt-and-suspenders — it guarantees the ledger is also replay-safe, independently of `merit_shop_purchases`.

**Migration ordering (D-22):** ship the `ALTER TABLE` + new RPC (if added) in `20260422000000_phase_24_topup.sql` BEFORE the edge-function code deploy. The existing webhook ignores unknown columns and the existing `credit_shop_merits` RPC ignores new arguments — forward-compatible.

### 4. Shared Dual-Imported TS Module

**Current state of `supabase/functions/_shared/tier-config.ts` (122 lines):**
- Exports: `TIER_TIMEOUTS`, `TIER_MAX_TOKENS`, `FREE_MODEL`, `DEFAULT_PRO_ELITE_MODEL`, `TIER_MODELS`, `FEATURE_MODEL_OVERRIDES`, `getTimeout`, `getModel`.
- Types: `Tier = 'free' | 'pro' | 'elite'`, `CallType = 'core' | 'elite-preview' | 'quiz'`, `FeatureKey = 'resume' | 'career' | 'linkedin' | 'recruiting' | 'interview'`.
- **Zero edge-layer dependencies** (comment line 11) — explicitly safe to import cross-runtime.

**⚠️ Type name collision:** The current `FeatureKey` uses short names (`'resume'`, `'career'`, `'linkedin'`, `'recruiting'`, `'interview'`), but SC-12 uses `resumeAnalysis` / `careerCompass` / etc. The DB cost table uses yet a third set: `'resume_analysis'`, `'career_compass'`, `'linkedin_grading'`, `'recruiting_lens'`, `'interview_prep'` (merit-rpcs.sql lines 44-57). **Planner must define ONE canonical set in the new config module** and write a mapping function for the DB compare (Pattern 2 above uses `FEATURE_KEY_TO_DB` for this).

**Import paths to survey (planner must grep and update all):**

| Importer | Current import | Phase-24 change |
|---------|---------------|-----------------|
| `supabase/functions/analyze-resume/index.ts` line 14 | `{ TIER_MAX_TOKENS, getModel, getTimeout, Tier }` | Add `getMaxOutput, getMaxInputTokens, getMaxInputChars` |
| `supabase/functions/analyze-career/index.ts` line 16 | `{ TIER_MAX_TOKENS, getModel, getTimeout, Tier }` | Same |
| `supabase/functions/recruiting-lens/index.ts` | `RCL_MAX_TOKENS` (local, not from tier-config) | Replace local `RCL_MAX_TOKENS` with `getMaxOutput('recruitingLens', tier)` |
| `supabase/functions/grade-linkedin/index.ts` line 121 | `LINKEDIN_MAX_TOKENS` (local) | Replace with `getMaxOutput('linkedinGrader', tier)` |
| `supabase/functions/interview-prep-analyze/index.ts` line 330 | inline ternary `variant === 'pro' ? 5000 : 10000` | Replace with `getMaxOutput('interviewPrepCoach', tier)` |
| `src/hooks/useFeatureCosts.ts` | reads `merit_feature_costs` via Supabase | Optionally add a TS-mirror fallback for instant paint; keep DB read as canonical |
| `src/hooks/useMerits.ts` | uses hardcoded `LOW_BALANCE_THRESHOLD = 4` | Consume `MERITS_PER_MONTH[tier]` + compute 20% threshold |
| `src/components/PricingTable.tsx` | hardcoded `PLANS[]` (lines 27-50+) includes `monthlyPrice`, `yearlyPrice`, `meritAllowance: '5 lifetime Merits'` | Fully rewrite to read `PRICING` + `MERITS_PER_MONTH` from config |
| `src/components/UpgradeModal.tsx` lines 57-60 | hardcoded `$8.99`, `$89.99`, `$16.99`, `$169.99` strings | Read from `PRICING` |
| `src/pages/Shop.tsx` | pack catalog | Read from `PACK_CATALOG` |

**Hardcoded pricing/merit-count call sites (complete list for SC-1 "zero hardcoded values"):**
- `src/components/PricingTable.tsx` — "5 lifetime Merits", `monthlyPrice: 8.99`, `yearlyPrice: 89.99`, etc.
- `src/components/UpgradeModal.tsx` lines 57-60 — four price strings.
- `supabase/migrations/20260415000000_merit_rpcs.sql` lines 386-392 — `CASE p_tier WHEN 'pro' THEN 75 WHEN 'elite' THEN 150` in `reset_subscription_merits`. **This is DB-side hardcode** — either leave as-is (SQL can't import TS) and add a test-time assertion, OR update via a new migration. RECOMMENDATION: leave it; the D-03 invariant catches drift at boot.
- `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql` lines 42-43 — `CASE p_from_tier WHEN 'pro' THEN 75 WHEN 'elite' THEN 150` in `grant_upgrade_diff`. Same note.
- `src/hooks/useMerits.ts` line 5 — `LOW_BALANCE_THRESHOLD = 4`. **MUST change** per SC-9b (20%-of-cap, not flat 4).

### 5. Token-Budget Rewiring — Current State

Every feature handler currently hosts its own per-tier cap map. This is the five-file replacement matrix:

| File | Current cap source | Current Free/Pro/Elite | Replace with |
|------|-------------------|------------------------|--------------|
| `analyze-resume/index.ts` line 14,46-51,65-76 | `TIER_MAX_TOKENS[tier]` (6000/16000/20000) + local `CALL_CONFIGS` splits | 6000 / 16000 / 20000 | `getMaxOutput('resumeAnalysis', tier)` → **4000 / 8000 / 12000** |
| `analyze-career/index.ts` lines 16,49-59 | `TIER_MAX_TOKENS[tier]` + local `CAREER_CALL_CONFIGS` | 6000 / 16000 / 20000 | `getMaxOutput('careerCompass', tier)` → **5000 / 12000 / 16000** |
| `recruiting-lens/index.ts` lines 24-36 | local `RCL_MAX_TOKENS` + local `CALL_CONFIGS` | — / 8000 / 20000 | `getMaxOutput('recruitingLens', tier)` → **0 / 12000 / 16000** |
| `grade-linkedin/index.ts` lines 121-125 | local `LINKEDIN_MAX_TOKENS` | 3000 / 8192 / 8192 | `getMaxOutput('linkedinGrader', tier)` → **2500 / 8000 / 12000** |
| `interview-prep-analyze/index.ts` line 330 | inline literal (5000/10000) | — / 5000 / 10000 | `getMaxOutput('interviewPrepCoach', tier)` → **0 / 12000 / 16000** |

**Boot invariants to rewrite:**

`analyze-resume/index.ts` lines 65-80 (current):
```ts
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as ...;
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  if (sum > TIER_MAX_TOKENS[tier]) { throw new Error(...); }
}
```

Rewrite (D-10):
```ts
for (const tier of ['free', 'pro', 'elite'] as const) {
  const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as ...;
  const sum = CALL_CONFIGS.reduce((acc, cfg) => acc + cfg[key], 0);
  const cap = getMaxOutput('resumeAnalysis', tier);
  if (sum > cap) {
    log.error('invariant-violation', { feature:'resumeAnalysis', tier, source:'d-10', sum, cap });
    throw new Error(`[D-10] analyze-resume CALL_CONFIGS sum ${sum} exceeds getMaxOutput('resumeAnalysis','${tier}')=${cap}`);
  }
}
```

**Internal split values (Claude's Discretion):** `CALL_CONFIGS` per-call splits are free to pick, but must sum to ≤ the new per-tier cap. Current analyze-resume Pro sum (4800+4800+6400 = 16000) overshoots the new Pro cap of 8000 — the planner MUST retune the splits. Suggested Pro splits: criteria-1 = 2500, criteria-2 = 2500, summary = 3000 (sum = 8000). Elite splits: criteria-1 = 3500, criteria-2 = 3500, summary = 4000, elite-extras = 1000 (sum = 12000). Free: single consolidated call at 4000.

### 6. Input-Guard Pattern — Current Validation Landscape

No unified input-budget validator exists today. Existing ad-hoc checks:

- `supabase/functions/grade-linkedin/index.ts` line 233: `if (meritProfileContent.length > 12000)` — truncates, doesn't reject.
- `supabase/functions/interview-prep-coach/index.ts` lines 72, 143-146: `jobDescription.length > 12000` → truncates via `.slice(0, 12000)`.
- `supabase/functions/_shared/resume-prompts.ts` — no length validator found.
- `supabase/functions/interview-prep-evaluate/__tests__/evaluate.answer-length.test.ts` — tests 500-char answer limit (Phase 19 IPC-03), unrelated to SC-12.

**Phase-24 fix:** `validateInputBudget` (pattern shown above) becomes the single chokepoint. The call order per CONTEXT D-12 is:

```
auth → merit gate → validateInputBudget → LLM
```

⚠️ **CONTEXT ambiguity (planner must resolve):** D-12 says validator runs AFTER merit gate. But D-13 says "locked state [...] triggers the existing upgrade prompt. No merit deduction, no Claude call." These conflict if the user passes the merit gate (because they have credits), then the validator says "locked" — the deduct has already happened.

**RECOMMENDED resolution:** Run `validateInputBudget` twice — once as a CHEAP pre-check (just for `tier_locked` short-circuit, no token math) BEFORE the merit gate; and a second time inside the `withMerits` callback for the real token/char check (refundable if it throws `MeritRefundable`). This honors both D-12 (real validation inside gateway) and D-13 (no deduction on locked). Alternatively: the validator returns `tier_locked` as a sentinel the caller checks before calling `withMerits`. See Open Questions Q1.

### 7. Brand-v2 CSS-Var Namespacing

**Current token system (`src/index.css` lines 9-56):** Tailwind-style HSL tokens at `:root,.dark` and `.light`. All tokens feed Tailwind via `hsl(var(--*))` (tailwind.config.ts lines 20-58). Existing `--radius: 0.75rem` (line 41), `--primary: 357 100% 68%` (coral/red, line 22), `--background: 0 0% 0%` (line 13).

**The brand-v2 overlay (D-16) lives in `.theme-v2` selector** — does NOT touch `:root`. Concrete addition to `src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@500&family=Inter+Tight:wght@400;500;700&display=swap');

.theme-v2 {
  --bg-deep: 344 44% 3%;                /* #0a0607 as HSL — matches hsl(var(--*)) convention */
  --accent-red: 355 100% 59%;           /* #ff2d3f */
  --accent-red-foreground: 0 0% 100%;
  --glass-bg: 0 0% 100% / 0.03;
  --glass-border: 0 0% 100% / 0.08;
  --radius-boxy: 0.125rem;
  --font-display: 'Fraunces', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-body: 'Inter Tight', Inter, system-ui, sans-serif;

  /* Scoped base-layer overrides */
  --background: var(--bg-deep);
  --primary: var(--accent-red);
  --primary-foreground: var(--accent-red-foreground);
  --radius: var(--radius-boxy);

  background: hsl(var(--bg-deep));
  color: hsl(var(--foreground));
  font-family: var(--font-body);
}
```

**`tailwind.config.ts` extension:** Add `fontFamily` + `borderRadius.boxy` keys. These become utilities like `font-display`, `rounded-boxy`, etc. — usable inside `.theme-v2` components.

**`index.html` preconnect:** Add before existing `<link>` tags in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

### 8. Boxy Button Variant + Vitest Lint Guard

**Current `src/components/ui/button.tsx` (47 lines):** Uses `cva` with variants `default | destructive | outline | secondary | ghost | link` and sizes `default | sm | lg | icon`. Base class includes `rounded-md` (line 8).

**Phase-24 addition (D-18):**
```ts
variant: {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  // ... existing
  boxy: "bg-[hsl(var(--accent-red))] text-[hsl(var(--accent-red-foreground))] rounded-[var(--radius-boxy)] px-6 py-3 font-semibold hover:opacity-90",
  "boxy-outline": "border border-[hsl(var(--accent-red))] text-[hsl(var(--accent-red))] bg-transparent rounded-[var(--radius-boxy)] px-6 py-3 font-semibold hover:bg-[hsl(var(--accent-red))]/10",
},
```

**Vitest lint guard (`src/pages/__tests__/pricing-boxy.lint.test.ts`):**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { globSync } from 'fast-glob';  // OR use node-native `fs.readdirSync` recursion

const PRICING_GLOBS = [
  'src/pages/Pricing.tsx',
  'src/components/pricing/**/*.tsx',
  'src/components/topup/**/*.tsx',
];

describe('D-18 pricing boxy-CTA enforcement', () => {
  it('no <Button> carries rounded-full or variant="default" on pricing surfaces', () => {
    const files = PRICING_GLOBS.flatMap(g => globSync(g));
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      // crude but sufficient: look for <Button ...> regions containing rounded-full OR variant="default"
      const buttonBlocks = src.matchAll(/<Button[^>]*>/g);
      for (const match of buttonBlocks) {
        if (/rounded-full/.test(match[0])) {
          violations.push(`${file}: Button with rounded-full → ${match[0]}`);
        }
        if (/variant=["']default["']/.test(match[0])) {
          violations.push(`${file}: Button with variant="default" (must be "boxy") → ${match[0]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
```

`fast-glob` is NOT in package.json today — either add it (small dep) or use a native `fs.readdirSync` recursion. Either works; the planner picks.

### 9. UI Entry Points for Top-Up

Locations the planner must touch:

| Surface | File | Trigger |
|---------|------|---------|
| TopBar balance display | `src/components/TopBar.tsx` line 9 imports `MeritBalanceBadge` | Replace with `<MeritBalanceHeaderV2 />` (SC-10 format); also mount `<HeaderTopUpTrigger />` |
| Current merit balance badge | `src/components/MeritBalanceBadge.tsx` (85 lines) | **Do NOT delete** — still used by non-Phase-24 surfaces. Keep intact; only TopBar.tsx swaps its import. |
| Merit balance hook | `src/hooks/useMerits.ts` | Add `cap` (from `MERITS_PER_MONTH[tier]`) + `lowThresholdReached: balance / cap < 0.2` |
| Out-of-merits modal | `src/components/UpgradeModal.tsx` (existing) | **Rewrite** to OutOfMeritsModalV2 per SC-9a: primary CTA "Buy a top-up pack" → `/pricing#packs`; secondary "Upgrade plan" → `/pricing` top |
| `usePaywallGuard` | `src/hooks/usePaywallGuard.ts` | Already triggers UpgradeModal; no change if UpgradeModal is replaced in-place |
| Dashboard "Running low?" card | `src/pages/Dashboard.tsx` (or equivalent) | New mount — gated on `useMerits().lowThresholdReached` |
| Pricing page | `src/pages/Pricing.tsx` (25 lines, currently delegates to `PricingTable` + `PlanComparisonTable`) | **Rewrite** to `PricingPageV2` wrapped in `.theme-v2` |
| `/pricing#packs` anchor | New `PackSectionV2` | Added to `PricingPageV2`; `scroll-margin-top: 96px` CSS for sticky header |
| Shop page | `src/pages/Shop.tsx` | Deep-link redirect to `/pricing#packs` (per D-24) OR leave as secondary entry point (planner decides; UI-SPEC says `/shop` is out of Phase-24 rebrand scope) |

---

## Implementation Approach (per research priority)

1. **Stripe dual-path:** Add a new `supabase/functions/create-payment-intent/` endpoint that accepts `{ pack_size }`, calls `stripe.paymentIntents.create({ amount: PRICING_FROM_PACK_CATALOG, customer, metadata: { user_id, pack_size } })`, and returns `{ clientSecret }`. Extend `stripe-webhook-handler` to route `payment_intent.succeeded` → `credit_shop_merits` RPC (idempotent on `payment_intent.id`). Subscriptions keep using the existing `create-checkout-session` with `mode: 'subscription'`.
2. **Dual-balance spend (SC-7):** No code change — existing `check_and_deduct_merits` already implements subscription-first → shop-fallback. The planner's job is unit tests that exercise the 3 boundary cases.
3. **`merit_transactions` schema extension:** single new migration `20260422000000_phase_24_topup.sql` that adds `pack_id`, `stripe_payment_intent_id`, the partial unique index, and updates `credit_shop_merits` RPC to write these columns + set `source='topup'`. Ship BEFORE code deploy (D-22).
4. **Dual-imported TS module:** Locate at `src/config/pricing-config.ts`. Import on Deno side via `../../../src/config/pricing-config.ts`. This keeps the SC-12 snapshot test inside vitest's include glob. Optional: add `deno.json` import map alias if relative paths get ugly — but keep the canonical file FE-side.
5. **Token-budget rewiring:** One PR per feature handler to replace hardcoded caps with `getMaxOutput` accessor + rewire boot invariant. Five handlers. `TIER_MAX_TOKENS` stays as `@deprecated` re-export for one cycle (D-11).
6. **Input-guard:** New `supabase/functions/_shared/input-guard.ts` with `validateInputBudget`. Call order: `requireAuth → validateInputBudget (tier_locked pre-check) → withMerits(ctx, feat, async () => { validateInputBudget(full check) throws MeritRefundable on size-fail; runAnthropic() })`. See Open Questions Q1.
7. **Brand-v2:** Append `.theme-v2 { ... }` block to `src/index.css`. Add fonts CDN `@import` at top of that file. Add preconnect links to `index.html`. Extend `tailwind.config.ts` with `fontFamily.display/mono/tight` + `borderRadius.boxy`. Wrap `PricingPageV2` root in `className="theme-v2"`.
8. **Boxy Button + vitest guard:** New `boxy` and `boxy-outline` variants on existing button.tsx. New `src/pages/__tests__/pricing-boxy.lint.test.ts` as shown above.
9. **UI entry points:** Follow file-touch matrix above. Key is to leave Phase-20 surfaces untouched — only TopBar.tsx, UpgradeModal.tsx, Pricing.tsx, and Dashboard.tsx (to mount RunningLowCard) change.

---

## Runtime State Inventory

This phase involves retuning runtime-visible prices, merit caps, and adding a new enum source value. The audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `merit_transactions` has no row referencing `source='topup'` today (first write will be post-migration). `merit_feature_costs` DB rows match current TS. `user_merits.subscription_balance` MUST NOT be bulk-updated at deploy (D-06). `profiles.stripe_subscription_id` → existing monthly subs keep their old price IDs forever (D-20). | No data migration. Code edit writes `source='topup'` for new rows. |
| **Live service config** | Stripe dashboard: annual Price IDs exist (provisioned via `scripts/provision-stripe-products.mjs`) but are not yet set as env vars in the deployed function config (`STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_ANNUAL`). | Operator must `supabase secrets set STRIPE_PRICE_{PRO\|ELITE}_ANNUAL=<price_id>` before SC-4 is live. |
| **OS-registered state** | None. | — |
| **Secrets / env vars** | New env vars required: `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_ANNUAL` (BE). `VITE_STRIPE_PUBLISHABLE_KEY` already set. | Add to both staging + production function configs. |
| **Build artifacts** | None. No compiled binaries; pure TS. | — |

**Canonical question:** After every file in the repo is updated, what runtime systems still have the old string/value cached? Answer: the `reset_subscription_merits` and `grant_upgrade_diff` SQL RPCs contain hardcoded `CASE p_tier WHEN 'pro' THEN 75 WHEN 'elite' THEN 150`. These match current SC-1 values and DO NOT need updating (SC-1 doesn't change). If a future phase changes them, a new migration is required. Flagged in AUDIT-01.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stripe (production) | Payment Element + PaymentIntent + webhook | ✓ | API version pinned in `supabase/functions/_shared/stripe-client.ts` | — |
| `@stripe/react-stripe-js` | Payment Element UI | ✓ | ^6.2.0 | — |
| `@stripe/stripe-js` | stripe.confirmPayment | ✓ | ^9.2.0 | — |
| Google Fonts CDN | Fraunces / JetBrains Mono / Inter Tight | ✓ | n/a | — |
| Supabase service role key (SUPABASE_SERVICE_ROLE_KEY) | D-03 DB↔TS invariant query | ✓ | already in function env | — |
| `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_ELITE_ANNUAL` env vars | create-checkout-session annual branch | ⚠ provisioned but may not be set in function config | — | Operator must run `supabase secrets set ...` before deploy |

**Missing dependencies with no fallback:** None (annual price IDs are provisioned; just need env-var wiring).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.1 (FE + any `src/**/*.test.{ts,tsx}`) + Deno test (BE) |
| Config file | `vitest.config.ts` (FE), `supabase/functions/deno.json` (BE) |
| Quick run command (FE) | `npm test -- <pattern>` |
| Full suite (FE) | `npm test` |
| Edge tests (BE) | `.\scripts\run-edge-tests.ps1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BUDGET-01 (D-19) | SC-12 three tables match spec verbatim | unit (vitest snapshot) | `npm test sc12-snapshot` | ❌ Wave 0 |
| BUDGET-03 (D-10) | `sum(CALL_CONFIGS) ≤ getMaxOutput(feat,tier)` asserted at cold start for all 5 handlers | boot-invariant (Deno test) | `deno test supabase/functions/analyze-resume/` etc. | ❌ Wave 0 |
| SC-7 | Subscription-first → shop-fallback: 3 boundary cases (pure monthly, mixed, pure top-up) | unit (Deno) | `deno test _shared/merit-gateway.test.ts` | ✅ extend |
| SC-6 | Webhook replay idempotency on `stripe_payment_intent_id` | integration (Deno) | `deno test stripe-webhook-handler/index.test.ts` | ✅ extend |
| BRAND-02 (D-18) | `/pricing` Buttons reject `rounded-full` or `variant="default"` | CI-lint (vitest) | `npm test pricing-boxy.lint` | ❌ Wave 0 |
| BUDGET-02 (D-13) | `validateInputBudget` short-circuits on `tier_locked` without merit deduct | unit (Deno) | `deno test _shared/input-guard.test.ts` | ❌ Wave 0 |
| BUDGET-02 (D-12) | `validateInputBudget` returns 413 with correct limit/actual | unit (Deno) | same | ❌ Wave 0 |
| TOPUP-03 (D-23) | `create-payment-intent` returns `clientSecret`; idempotent on duplicate request | integration (Deno) | `deno test create-payment-intent/` | ❌ Wave 0 |
| TOPUP-02 (D-04) | Pack credit writes `source='topup'` + `pack_id` + `stripe_payment_intent_id` | integration (Deno) | `deno test stripe-webhook-handler` | ✅ extend |
| D-03 (invariant) | Boot fails when DB cost row diverges from TS | unit (Deno) | `deno test _shared/tier-config.test.ts` | ❌ Wave 0 |
| ECON-01 / ECON-02 | Free anniversary-day reset applies MERITS_PER_MONTH[free]=10; existing users not mutated at deploy | integration (Deno) | `deno test reset_subscription_merits` | ✅ extend |
| SC-10 | MeritBalanceHeaderV2 renders `"47 / 75 merits"` and `"47 / 75 + 15 bonus"` formats | unit (vitest/RTL) | `npm test MeritBalanceHeaderV2` | ❌ Wave 0 |
| SC-9b | HeaderTopUpTrigger visible when balance/cap < 0.2, hidden otherwise | unit (vitest/RTL) | `npm test HeaderTopUpTrigger` | ❌ Wave 0 |
| D-22 | Migration forward-compat: old code reading new schema still works | manual (staging) | deploy migration alone to staging, verify existing functions still 200 | manual |

### Sampling Rate

- **Per task commit:** `npm test -- <file>` + relevant `deno test`
- **Per wave merge:** `npm test && .\scripts\run-edge-tests.ps1`
- **Phase gate:** Full suite green + D-03/D-10 cold-start invariants verified on staging boot

### Wave 0 Gaps

- [ ] `src/config/pricing-config.ts` — canonical config module (REQ-BUDGET-01)
- [ ] `src/config/pricing-config.snapshot.ts` — pinned SC-12 values for snapshot comparison
- [ ] `src/pages/__tests__/sc12-snapshot.test.ts` — snapshot guard (D-19)
- [ ] `src/pages/__tests__/pricing-boxy.lint.test.ts` — CTA lint (D-18)
- [ ] `supabase/functions/_shared/input-guard.ts` + `input-guard.test.ts` — input budget chokepoint (D-12)
- [ ] `supabase/functions/_shared/tier-config.test.ts` — extend to cover `getMaxOutput`/`getMaxInput*` accessors
- [ ] `supabase/functions/create-payment-intent/index.ts` + `index.test.ts` — new endpoint (D-23)
- [ ] Extend `supabase/functions/merit-gateway.*.test.ts` — 3 SC-7 boundary cases (if not already covered)
- [ ] Extend `supabase/functions/stripe-webhook-handler/index.test.ts` — `payment_intent.succeeded` path + topup source write
- [ ] `src/components/topup/__tests__/MeritBalanceHeaderV2.test.tsx` + `HeaderTopUpTrigger.test.tsx`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | `requireAuth({type:'user'})` on all new endpoints (existing helper) |
| V3 Session Management | yes | Supabase JWT (existing) |
| V4 Access Control | yes | `SECURITY DEFINER` RPCs with `SET search_path=public,pg_temp` (existing convention from Phase 11); RLS on new columns |
| V5 Input Validation | yes | zod on `create-payment-intent` body; `validateInputBudget` on all feature handlers |
| V6 Cryptography | yes | Stripe webhook HMAC via `stripe.webhooks.constructEventAsync` (never hand-roll) |
| V11 Business Logic | yes | Idempotency via DB UNIQUE constraints; merit-gateway fail-closed semantics |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook replay → double-credit | Tampering | `UNIQUE(stripe_payment_intent_id)` + idempotency store on `stripe_webhook_events` (existing) |
| Client-supplied price-id tampering | Tampering | Server-side `STRIPE_PRICE_*` env lookup — never accept price_id from client (existing convention in `create-checkout-session`) |
| Cross-user PaymentIntent crediting | Tampering | Mirror `user_id` in both `session.metadata` AND `payment_intent_data.metadata` (existing Pitfall 9 pattern) |
| Pre-merit-gate enumeration of locked features | Info Disclosure | `validateInputBudget` runs AFTER auth but BEFORE Claude; 413 response does not leak other tier's limits (only the caller's limit) |
| Boot-time config drift → wrong pricing displayed | Tampering / Integrity | D-03 + D-10 fail-closed invariants (D-27) + D-28 alert |
| SQL injection in pack-size | Tampering | `credit_shop_merits` validates `p_pack_size NOT IN (3,10,25,50)` first (line 299-301) |

---

## SC-13 Reconciliation Pre-Work

Map every (feature × tier) output-token budget currently shipped in Phases 15-19-23 against SC-12. The planner emits this table into `24-AUDIT.md` with concrete edit notes.

### maxTokensOutput — Audit Delta

| Feature | Tier | OLD value | NEW value (SC-12) | Delta | Source file (old) | Source phase |
|---------|------|-----------|-------------------|-------|-------------------|--------------|
| resumeAnalysis | free | 6000 (`TIER_MAX_TOKENS.free`, indirect via `FREE_SINGLE_CALL_MAX_TOKENS`) | **4000** | -2000 | `tier-config.ts:46` + `analyze-resume/index.ts:55-62` | Phase 15 |
| resumeAnalysis | pro | 16000 (CALL_CONFIGS sum = 4800+4800+6400) | **8000** | -8000 | `analyze-resume/index.ts:47-50` | Phase 15 |
| resumeAnalysis | elite | 20000 (CALL_CONFIGS sum = 5000+5000+6000+4000) | **12000** | -8000 | `analyze-resume/index.ts:47-51` | Phase 15 |
| careerCompass | free | 6000 (`TIER_MAX_TOKENS.free`) / 4000 (FREE_SINGLE_CALL override) | **5000** | Mixed | `analyze-career/index.ts:50,69` | Phase 17 |
| careerCompass | pro | 16000 | **12000** | -4000 | `analyze-career/index.ts:50` | Phase 17 |
| careerCompass | elite | 16000+4000=20000 | **16000** | -4000 | `analyze-career/index.ts:50-51` | Phase 17 |
| recruitingLens | free | not applicable (feature locked) | **0** | locked→0 | `recruiting-lens/index.ts:36` | Phase 18 |
| recruitingLens | pro | 8000 (`RCL_MAX_TOKENS.pro`) | **12000** | +4000 | `recruiting-lens/index.ts:36` | Phase 18 |
| recruitingLens | elite | 20000 | **16000** | -4000 | `recruiting-lens/index.ts:36` | Phase 18 |
| linkedinGrader | free | 3000 (`LINKEDIN_MAX_TOKENS.free`) | **2500** | -500 | `grade-linkedin/index.ts:122` | Phase 16 |
| linkedinGrader | pro | 8192 | **8000** | -192 | `grade-linkedin/index.ts:123` | Phase 16 |
| linkedinGrader | elite | 8192 | **12000** | +3808 | `grade-linkedin/index.ts:124` | Phase 16 |
| interviewPrepCoach | free | not applicable (feature locked) | **0** | locked→0 | — | Phase 19 |
| interviewPrepCoach | pro | 5000 (inline literal) | **12000** | +7000 | `interview-prep-analyze/index.ts:330` | Phase 19/23 |
| interviewPrepCoach | elite | 10000 (inline literal) | **16000** | +6000 | `interview-prep-analyze/index.ts:330` | Phase 19/23 |

**Tier-sum reconciliation (must match SC-12):**
- Free sum: 4000 + 5000 + 0 + 2500 + 0 = **11500** ✓
- Pro sum: 8000 + 12000 + 12000 + 8000 + 12000 = **52000** ✓
- Elite sum: 12000 + 16000 + 16000 + 12000 + 16000 = **72000** ✓

### maxTokensInput — Net new (no existing enforcement except grade-linkedin/interview-prep truncation)

All values are NET NEW — no handler currently enforces a token-level input cap. Existing `.length > 12000` truncation in `grade-linkedin` (line 233) and `interview-prep-coach` (line 72) becomes obsolete, replaced by `validateInputBudget`.

### maxCharactersInput — Net new

Same — net new; 413-style response introduced by `validateInputBudget`. Note the 4:1 invariant: every non-null `maxCharactersInput` = 4 × `maxTokensInput` (verified in CONTEXT D-19).

**AUDIT-01 planner deliverable (`24-AUDIT.md`):** One section per feature with this format:

```markdown
## resumeAnalysis

| Tier | Budget Type | Old Value | New Value | Source Phase | Action |
|------|-------------|-----------|-----------|--------------|--------|
| free | maxTokensOutput | 6000 | 4000 | 15 | Retune `analyze-resume/index.ts` FREE_SINGLE_CALL_MAX_TOKENS |
| pro  | maxTokensOutput | 16000 | 8000 | 15 | Retune CALL_CONFIGS sum (4800+4800+6400 → 2500+2500+3000) |
| ...  | ... | ... | ... | ... | ... |
| free | maxTokensInput | — (truncation only) | 3500 | (new) | validateInputBudget pre-Anthropic |
| free | maxCharactersInput | — | 14000 | (new) | same |
```

---

## Landmines / Risks

1. **Vitest include glob scoping** — `vitest.config.ts` line 15 is `include: ['src/**/*.test.{ts,tsx}']`. The SC-12 snapshot test (D-19) and boxy-lint (D-18) MUST live under `src/`. Decision flows from this: `pricing-config.ts` lives at `src/config/` (not `supabase/functions/_shared/`). Edge functions import it via `../../../src/config/pricing-config.ts`. Confirmed this path works because Deno handles relative TS imports with explicit `.ts` extension.

2. **D-12 order-of-operations ambiguity** — CONTEXT D-12 says `validateInputBudget` runs "as the first step after auth + merit gate" but D-13 says locked-state triggers "no merit deduction". These can conflict if `tier_locked` is only detected inside the validator AFTER the merit gate has deducted. The recommended resolution is a two-phase call (cheap pre-check before gate, full check inside gate). See Open Questions Q1.

3. **`analyze-career/index.ts` has TWO separate token-budget code paths** — the parallel-call path (lines 49-76) and a SECOND legacy path at line 1337 (`maxTokensForAnalysis = TIER_MAX_TOKENS[resolvedTier]`) + more at lines 667, 832, 1108, 1166, 1357. Phase 24 MUST audit all of them. The legacy path is likely dead code or an alternate code branch; planner must read the file carefully before rewiring.

4. **Dual-imported TS + Deno node_modules** — Deno edge functions do NOT resolve `@/*` path aliases. The import MUST be the relative `../../../src/config/pricing-config.ts`. Three levels up because edge functions live at `supabase/functions/<feature>/index.ts`. Confirmed via existing relative imports throughout edge code.

5. **`analyze-resume` FREE tier is SINGLE CALL** — per Phase 15.1 redesign; `CALL_CONFIGS` is NOT used on Free (line 54-62 comment). The new cap of 4000 applies to `FREE_SINGLE_CALL_MAX_TOKENS`. The boot invariant (D-10) must handle this case separately — see line 73-80 of analyze-resume/index.ts.

6. **Stripe events ordering & idempotency** — `checkout.session.completed` and `payment_intent.succeeded` can arrive in either order for an embedded-Checkout flow. For Payment-Element-only (Phase 24 pack path), ONLY `payment_intent.succeeded` fires. The webhook's existing `stripe_webhook_events` insert-first idempotency handles duplicate event IDs, but the `credit_shop_merits` RPC must also idempotently no-op when called twice with the same `p_stripe_payment_id` (already does — lines 306-318). **Planner must add a regression test that sends both event types for the SAME PaymentIntent and confirms only one credit lands.**

7. **Free user anniversary vs Phase 10 reset_date behavior** — Phase 10 D-01 sets Free users to `subscription_reset_date = NULL` (no reset cron). D-05 says Phase 24 uses anniversary-day reset for Free. This requires either (a) extending the `reset_subscription_merits` RPC to no-longer no-op for Free (currently `IF p_tier = 'free' THEN RETURN ... skipped` at line 383-385) AND setting `subscription_reset_date` on new Free signups, OR (b) a new cron-style sweep that targets Free users specifically. Planner picks. The pg_cron sweep (migration 20260415000001 §2) already exists for Pro/Elite monthly refills — extending its predicate to include Free is the leanest path.

8. **`MERITS_PER_MONTH.free = 10` vs existing Free grant of 5 lifetime** — REQUIREMENTS.md MER-10 says Free = 5 lifetime Merits (never refilled). SC-1 changes to 10 monthly merits. This is a semantic reversal — Free becomes refillable. CONTEXT D-05/D-06 acknowledge this: new allocation applies at next anniversary reset. **Planner must write a migration that updates MER-10 in spirit** (comment or REQUIREMENTS.md edit) OR accept that REQUIREMENTS.md goes stale.

9. **Hardcoded SQL constants in `reset_subscription_merits` and `grant_upgrade_diff`** — line 388-392 in merit-rpcs.sql and lines 42-43 in stripe-products migration hardcode `75` and `150`. These match SC-1 values exactly, so no edit needed for Phase 24. BUT: if Phase 24 changes to Free=10, the Free branch of `reset_subscription_merits` also needs to grant 10 (currently no-ops). Tracked as ECON-02 above.

10. **Existing `src/hooks/useMerits.ts` `LOW_BALANCE_THRESHOLD = 4`** — hardcoded absolute value at line 5. Phase 24 switches to 20%-of-cap (D-08). Replacing it with `total / cap < 0.2` breaks callers that expect `isLow` as a flat threshold. Read every consumer before changing. Grep hit: `MeritBalanceBadge.tsx`, `UpgradeModal.tsx`, `TopBar.tsx`, `usePaywallGuard.ts`.

11. **Brand-v2 inside light mode** — `src/index.css` line 59-80 defines `.light` theme. If the user is in light mode, does `.theme-v2` override everything or compose? Decision needed in the plan: recommend that `.theme-v2` ALWAYS wins (its rules are more specific via the compound selector) — if a dark-mode user on `.theme-v2` surface hits light-mode toggle, the theme-v2 dark aesthetic persists by design (Phase 24 surfaces are dark-only per UI-SPEC color table line 106 "Dominant (60%) #0a0607").

12. **Google Fonts CDN on CSP** — If the project ships a Content Security Policy, `fonts.googleapis.com` + `fonts.gstatic.com` must be allowlisted in `style-src` and `font-src`. Search revealed no existing CSP in the repo — low risk but flag for the ops/security handoff.

13. **`create-checkout-session` already has `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_ELITE_ANNUAL` env-var convention baked in (line 123)** — so SC-4 is really just "set the env vars + UI toggle in PricingPageV2 passes `interval: 'annual'`". The code path is already there.

---

## Open Questions

1. **Call-order for `validateInputBudget` vs `withMerits`.** CONTEXT D-12 says validator runs AFTER merit gate. D-13 says tier-locked features do NOT deduct merits. These conflict when the feature is Pro/Elite-only and the user is Free but has purchased top-up merits (can afford the cost but is locked out). **Recommendation:** cheap `tier_locked` pre-check (reads `maxTokensInput[feature][tier] === null`) BEFORE `withMerits`; full size-check INSIDE the `withMerits` callback throwing `MeritRefundable` on exceed. Needs planner confirmation in Wave 0.

2. **Token-estimate heuristic for `maxTokensInput`.** Project convention appears to use 4 chars/token elsewhere, and the SC-12 tables embody exactly this 4:1 invariant (verified per D-19). **Recommendation:** use `Math.ceil(text.length / 4)`. If the planner wants tighter enforcement (actual BPE tokenizer), add `tiktoken` or `gpt-tokenizer` — but this adds ~300 KB to the Deno cold-start budget and is not justified for a hard-cap check.

3. **Should the `create-payment-intent` endpoint be independent, or a new `mode: 'payment-intent'` on `create-checkout-session`?** CONTEXT D-23 says "embedded Stripe Payment Element via `@stripe/react-stripe-js`" which means a raw PaymentIntent (not a Checkout Session). **Recommendation:** new standalone endpoint `create-payment-intent` — Checkout Sessions and PaymentIntents have different Stripe APIs and mixing them in one handler creates a confusing discriminated union. Independent endpoint, shared request validation helpers.

4. **Should `useFeatureCosts` continue reading from DB, or switch to the TS module?** D-03 says DB is runtime source of truth. But DB read has a round-trip cost for cost-preview UX. **Recommendation:** keep DB read (for consistency with D-03's cold-start invariant check) but add a TS-module fallback to the hook for instant paint — hydrate from TS immediately, then sync from DB under the same `queryKey`. This is the "optimistic UI + server reconciliation" pattern already used for merit balance.

---

## Sources

### Primary (HIGH confidence — verified in this repo)

- `.planning/phases/24-.../24-CONTEXT.md` — 28 locked decisions
- `.planning/phases/24-.../24-UI-SPEC.md` — visual contract
- `.planning/ROADMAP.md` lines 448-506 — 13 success criteria + SC-12 tables (verbatim)
- `.planning/REQUIREMENTS.md` — 116-REQ-ID traceability
- `supabase/functions/_shared/tier-config.ts` (122 lines) — current per-tier config
- `supabase/functions/_shared/merit-gateway.ts` (266 lines) — `withMerits` contract
- `supabase/functions/create-checkout-session/index.ts` (355 lines) — dual-mode Stripe handler
- `supabase/functions/stripe-webhook-handler/index.ts` (partial) — existing webhook routing
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — tables + RLS
- `supabase/migrations/20260415000000_merit_rpcs.sql` (534 lines) — 6 RPCs, SC-7 spend ordering
- `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql` — pg_cron + upgrade diff
- `src/components/ui/button.tsx`, `src/components/StripeCheckoutWrapper.tsx`, `src/components/MeritBalanceBadge.tsx`, `src/components/PricingTable.tsx`, `src/components/UpgradeModal.tsx`, `src/hooks/useMerits.ts`, `src/hooks/useFeatureCosts.ts`, `src/pages/Pricing.tsx`, `src/index.css`, `tailwind.config.ts`, `vite.config.ts`, `vitest.config.ts`, `package.json`
- Phase 20 CONTEXT — `useMerits` hook spec, embedded Checkout pattern
- Phase 13 CONTEXT — merit-gateway D-02 refund taxonomy

### Secondary (MEDIUM)

- `scripts/provision-stripe-products.mjs` — env-var naming convention for Stripe Prices
- Deno runtime docs — relative `.ts` imports work cross-directory without path aliases

### Tertiary (LOW / not needed)

- None — no external documentation needed; all decisions are codebase-informed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 4:1 char/token ratio is sufficient for `validateInputBudget` | Open Questions Q2, Implementation §6 | Occasional false negatives on token-dense text; acceptable since caps have headroom (SC-12 invariant designed for this) |
| A2 | `src/config/pricing-config.ts` can be cross-imported from Deno via relative `../../../` path | Pattern 1, Landmine §4 | If Deno's TS resolver complains, fallback is an import-map alias in `deno.json`; either way achievable |
| A3 | Existing `stripe_webhook_events` idempotency handles duplicate `payment_intent.succeeded` events gracefully | Landmine §6 | If it doesn't, duplicate credit; mitigated by the NEW partial-unique index on `merit_transactions.stripe_payment_intent_id` |
| A4 | `reset_subscription_merits` RPC extension to handle Free tier is the leanest path for ECON-02 | Landmine §7 | If Phase 10 Free `reset_date` NULL is load-bearing, a new RPC may be preferable |
| A5 | `.theme-v2` as a compound class selector will win over `.light` without `!important` | Landmine §11 | Needs confirmation in Wave 0; fallback is `.theme-v2.theme-v2` double-class or explicit `!important` on critical tokens |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already in package.json; no external discovery required.
- Architecture: HIGH — prior phases 10-23 have laid the merit + Stripe plumbing; Phase 24 is composition, not invention.
- Pitfalls: HIGH — read every target file directly; landmines are first-hand.
- Open questions: two genuine (Q1 validator-order, Q3 endpoint shape) — planner will resolve at Wave 0.

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days; low churn on the targeted files)

---

## RESEARCH COMPLETE
