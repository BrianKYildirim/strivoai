# Phase 33: Pricing / Checkout / Billing Routes + Strivo Design Unification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 33-pricing-checkout-billing-routes-strivo-design-unification
**Areas discussed:** Checkout integration approach, Post-upgrade tier reconciliation, Customer portal entry + no-customer case, Restyle fidelity vs refinement

---

## Checkout integration approach (PRICE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded modal (reuse existing) | Wire handleTierCta to StripeCheckoutWrapper (EmbeddedCheckoutProvider) via useStripeCheckout({mode:'subscription'}); proven in Shop.tsx + legacy PricingTable.tsx; no new route. | ✓ |
| Real /checkout route page | Add a dedicated /checkout route rendering embedded checkout full-page; keeps existing navigate() call. | |
| Stripe-hosted redirect | create-checkout-session in redirect mode + window.location to hosted Checkout. | |

**User's choice:** Embedded modal (reuse existing)
**Notes:** Lowest risk, consistent with the top-up flow already in the app.

---

## Post-upgrade tier reconciliation (PRICE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard + reconciliation poll | return_url = /dashboard?checkout=complete; add handler with "processing" toast + poll of subscription_tier + merit balance (Phase 32 pattern). | ✓ |
| Billing page + poll | Redirect to /settings/billing?checkout=complete with same poll. | |
| Stay on /pricing + poll | Return to /pricing with current-plan highlight updating live. | |

**User's choice:** Dashboard + reconciliation poll
**Notes:** Mirrors Phase 32 reconcileShopCredit; no /dashboard handler exists today.

### Follow-up: Pro→Elite upgrade mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Same new-checkout flow for now | Pro→Elite uses same create-checkout-session subscription flow; flag two-subscription risk for plan-phase. | ✓ |
| Route Pro users to customer portal | Existing subscribers change tiers via Stripe portal (proration). | |
| Flag as research item | Leave unlocked for researcher. | |

**User's choice:** Same new-checkout flow for now
**Notes:** Captured the "two active subscriptions" risk as a research/verify item (CONTEXT D-04).

---

## Customer portal entry + no-customer case (PRICE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Billing page, conditional render | Show Manage Subscription only when stripe_customer_id exists; free → Upgrade link; Paddle-legacy → clear note. | ✓ |
| Billing page, always show + handle error | Always render; on no_customer toast + redirect to /pricing. | |
| Both billing + nav menu | Surface in billing AND account/nav menu, same conditional handling. | |

**User's choice:** Billing page, conditional render
**Notes:** Avoids click-then-fail UX. Also flagged return_url /billing vs /settings/billing mismatch (CONTEXT D-06).

---

## Restyle fidelity vs refinement (PRICE-06/07/08)

| Option | Description | Selected |
|--------|-------------|----------|
| Token swap, preserve layout | Keep V2 layout, only swap .theme-v2 / arbitrary CSS vars → semantic tokens. | |
| Token swap + light refinement | Migrate tokens AND allow minor spacing/type/card refinement. | |
| Match a reference page | Restyle to mirror a specific existing Strivo page. | ✓ |

**User's choice:** Match a reference page → **/dashboard** (specified in free-text follow-up)
**Notes:** Dashboard uses plain shadcn Card + semantic tokens, no .theme-v2, no font-display — directly serves PRICE-06's goal. All PRICE-07/08 content (prices, current-plan highlight, monthly/annual toggle, savings badges, 4 Top-Up Packs) must be preserved.

---

## Claude's Discretion

- Reconciliation poll interval/timeout (default to Phase 32 ~10s cadence).
- Whether the dashboard reconciliation handler reuses the shop reconciliation hook or is a new sibling.

## Deferred Ideas

None — discussion stayed within phase scope.
