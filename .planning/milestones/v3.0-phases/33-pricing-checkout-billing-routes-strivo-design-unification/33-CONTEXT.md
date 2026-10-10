# Phase 33: Pricing / Checkout / Billing Routes + Strivo Design Unification - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the broken `/pricing` → checkout path (`404 /checkout`), fix the `/settings/billing` infinite-spinner bug, wire the Stripe customer portal into the UI, restyle `/pricing` onto Strivo's semantic design tokens, and verify Free→Pro / Free→Elite / Pro→Elite subscription upgrades end-to-end. Requirements PRICE-01..08, TEST-07, TEST-08.

Several fixes are already prescribed verbatim in REQUIREMENTS.md and are treated as decided (not re-discussed):
- **PRICE-02** — change `Pricing.tsx:19` `/auth/signup` → `/auth` (or add `/auth/signup` alias route).
- **PRICE-04** — `Settings/Billing.tsx:307-317`: handle `userId === null` explicitly, switch `.single()` → `.maybeSingle()`, and add `.eq('user_id', userId!)` to the `merit_shop_purchases` query at `:328-335`.

</domain>

<decisions>
## Implementation Decisions

### Checkout integration (PRICE-01)
- **D-01:** Upgrade buttons open an **embedded Stripe checkout modal**, reusing the existing `StripeCheckoutWrapper` (`EmbeddedCheckoutProvider` + `EmbeddedCheckout`) driven by `useStripeCheckout({ mode: 'subscription', tier, interval })`. This is the proven pattern already used in `Shop.tsx` and the legacy (unrouted) `PricingTable.tsx`. **No new `/checkout` route** — replace the `navigate('/checkout?...')` call in `Pricing.tsx:22` with the modal open. Least risk, consistent with the top-up flow.

### Post-upgrade tier reconciliation (PRICE-03)
- **D-02:** After a successful subscription checkout, Stripe redirects to the session `return_url` = **`/dashboard?checkout=complete`** (current backend default). Add a handler on the Dashboard that shows an **"Upgrade processing…" toast** and runs a **reconciliation poll** of `profiles.subscription_tier` + merit balance until the webhook lands (~10s window), mirroring Phase 32's `reconcileShopCredit` pattern. There is no such handler today (only `Shop.tsx` handles `?checkout=complete`).
- **D-03:** Merit balance on upgrade **resets to the new tier's cap** — locked by PRICE-03, not a discussion choice. Reconciliation poll watches for this.
- **D-04:** Pro→Elite uses the **same `create-checkout-session` subscription flow** as Free→Pro for now (no separate portal-based upgrade path). ⚠️ **Research/verify (see canonical refs + code context):** confirm the backend/webhook swaps the existing subscription rather than leaving the user with **two active Stripe subscriptions**.

### Customer portal entry + no-customer case (PRICE-05)
- **D-05:** "Manage Subscription" lives on **`/settings/billing`**, rendered **conditionally**: shown only when `profiles.stripe_customer_id` exists (calls `create-stripe-portal`). Free users see an **"Upgrade" link to `/pricing`** instead; Paddle-legacy subscribers (have a paddle id but no `stripe_customer_id`) see a **clear note** rather than a button that 400s with `no_customer`. Avoid the click-then-fail UX.
- **D-06:** ⚠️ **Research/verify:** `create-stripe-portal` sets `return_url` to `${APP_URL}/billing`, but the app route is `/settings/billing`. Confirm whether `/billing` is a valid alias/redirect; if not, this is a redirect mismatch to fix as part of PRICE-05.

### Restyle fidelity (PRICE-06/07/08)
- **D-07:** Restyle `/pricing` to **match the `/dashboard` page** as the visual north star. Drop the `.theme-v2` scope class (`Pricing.tsx:44`) and arbitrary CSS-var refs (`text-[--text-muted]` at `:49`) in favor of the **same semantic-token language Dashboard uses**: standard shadcn `Card` (`border border-border rounded-lg`, `p-4`/`p-12`), `text-foreground` / `text-muted-foreground`, `bg-background` / `bg-muted/50`, `text-primary` / `text-destructive`, bold headings (`text-2xl`/`text-3xl font-bold`). Dashboard uses **no `font-display` and no `.theme-v2`** — match that.
- **D-08:** Preserve all content/structure required by PRICE-07/08: accurate price/feature/CTA per tier, current-plan highlight, monthly/annual toggle (`BillingIntervalToggleV2`), savings badges, and the 4 Top-Up Pack cards (`PackSectionV2`). Light/dark must work like the rest of the app. Visual treatment should converge toward Dashboard's look, but no content may be dropped or relabeled.

### Claude's Discretion
- Exact reconciliation poll interval/timeout (default to Phase 32's ~10s/poll cadence unless research finds better).
- Whether the dashboard `?checkout=complete` handler is a shared hook reused from the shop reconciliation logic or a new sibling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §PRICE-01..08, TEST-07, TEST-08 — locked requirement text, includes prescribed fixes for PRICE-02 and PRICE-04.
- `.planning/ROADMAP.md` — Phase 33 goal, success criteria, out-of-scope (Celebrations = Phase 34; per-feature output trim = Phases 37–41).

### Frontend — pricing/checkout
- `src/pages/Pricing.tsx` — active `/pricing` page (V2 components); `:19` Free CTA route, `:22` broken `navigate('/checkout')`, `:44` `.theme-v2`, `:49` `text-[--text-muted]`.
- `src/components/StripeCheckoutWrapper.tsx` — embedded subscription checkout modal to reuse for D-01.
- `src/hooks/useStripeCheckout.ts` — `fetchClientSecret({ mode:'subscription', tier, interval })` → `create-checkout-session` (embedded).
- `src/components/PricingTable.tsx` (legacy, unrouted) + `src/pages/Shop.tsx` — reference implementations of the embedded-checkout pattern; `Shop.tsx:33` is the existing `?checkout=complete` handler to mirror on Dashboard (D-02).
- `src/pages/Dashboard.tsx` — **restyle north star** (D-07) and the page to add the post-upgrade reconciliation handler to (D-02).
- `src/components/pricing/{TierCardV2,BillingIntervalToggleV2,PackSectionV2}.tsx` + `src/config/pricing-config.ts` — tier/pack content to preserve (D-08).

### Frontend — billing
- `src/pages/Settings/Billing.tsx` — `:290-336` queries (spinner fix PRICE-04), where "Manage Subscription" link goes (D-05).

### Backend — Stripe edge functions
- `supabase/functions/create-checkout-session/index.ts` — subscription embedded path; `return_url` = `/dashboard?checkout=complete&session_id=...` (`:265`). Verify Pro→Elite subscription-swap behavior (D-04).
- `supabase/functions/create-stripe-portal/index.ts` — portal session; 400 `no_customer` when `stripe_customer_id` null (`:10`), `return_url` = `${APP_URL}/billing` (`:106`) — verify route alias (D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StripeCheckoutWrapper` + `useStripeCheckout` — drop-in for D-01; subscription embedded mode already supported end-to-end.
- `Shop.tsx` `?checkout=complete` handler + Phase 32 `reconcileShopCredit` poll — template for the Dashboard post-upgrade reconciliation (D-02).
- Dashboard's semantic-token + shadcn `Card` styling — copy this token vocabulary for the `/pricing` restyle (D-07).
- `create-stripe-portal` edge function — already functional; only UI wiring + no-customer handling needed (D-05).

### Established Patterns
- Async webhook crediting creates a UI race; the project's answer is a snapshot + bounded reconciliation poll (Phase 32). Reuse, don't reinvent.
- Semantic design tokens over scoped/arbitrary CSS vars — the whole app except the V2 pricing scope already follows this.

### Integration Points
- `Pricing.tsx` `handleTierCta` → embedded modal (replaces broken navigate).
- `Dashboard.tsx` mount → read `?checkout=complete` → toast + reconciliation poll on `profiles`/merit balance.
- `Settings/Billing.tsx` → conditional "Manage Subscription" → `create-stripe-portal`.

### Open verification items for the researcher
- Pro→Elite must not leave two active Stripe subscriptions (D-04).
- `create-stripe-portal` `return_url` `/billing` vs app route `/settings/billing` mismatch (D-06).

</code_context>

<specifics>
## Specific Ideas

- `/pricing` should look like `/dashboard` — same card treatment, same semantic tokens, no separate visual system (user's explicit reference).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Celebrations page = Phase 34; per-feature output trim = Phases 37–41, per ROADMAP out-of-scope.)

</deferred>

---

*Phase: 33-pricing-checkout-billing-routes-strivo-design-unification*
*Context gathered: 2026-05-20*
