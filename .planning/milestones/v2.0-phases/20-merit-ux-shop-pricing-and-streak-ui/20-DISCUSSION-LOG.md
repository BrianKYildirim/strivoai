# Phase 20: merit-ux-shop-pricing-and-streak-ui - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 20-merit-ux-shop-pricing-and-streak-ui
**Areas discussed:** Merit balance & cost previews, Pricing page overhaul, Merit Shop & purchase flow, Billing history & receipts

---

## Merit Balance & Cost Previews

### Badge Location

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar badge | Small Merit count in AppSidebar with inline dropdown for breakdown | |
| TopBar badge | Merit count in top bar with click popover for breakdown | ✓ |
| Both locations | Redundant badge in both sidebar and TopBar | |

**User's choice:** TopBar badge
**Notes:** Popover shows subscription/shop breakdown, reset date, and quick links to Shop/Pricing.

### Cost Preview Style

| Option | Description | Selected |
|--------|-------------|----------|
| Inline text | Small line above Analyze button: "Costs X Merits · Y remaining". Amber/red for low/zero. | ✓ |
| Cost card above button | Styled card with cost, balance, and mini progress bar | |
| Button label includes cost | Button shows "Analyze Resume (3 Merits)" | |

**User's choice:** Inline text (Recommended)
**Notes:** Minimal footprint. Turns amber when low, red/disabled when zero with Buy Merits / Upgrade Plan CTAs.

### useMerits() Hook Shape

| Option | Description | Selected |
|--------|-------------|----------|
| React Query + RPC | useQuery wrapper over get_merit_balance RPC, replaces AiCreditsContext | ✓ |
| New MeritContext provider | Dedicated context with 5s polling interval | |

**User's choice:** React Query + RPC (Recommended)
**Notes:** Consistent with existing TanStack Query patterns. refetchOnWindowFocus + staleTime 5s.

### Low-Balance Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| 2x cheapest = 4 Merits | Global threshold at 4 Merits (2x cheapest standard cost of 2) | ✓ |
| Dynamic per-feature | Each feature computes its own threshold | |
| You decide | Claude picks | |

**User's choice:** 2x cheapest = 4 Merits (Recommended)
**Notes:** Simple global threshold. Amber warning at < 4 total Merits.

---

## Pricing Page Overhaul

### Checkout Method

| Option | Description | Selected |
|--------|-------------|----------|
| Stripe redirect | Replace Paddle with Stripe hosted checkout (redirect to Stripe) | |
| Stripe embedded checkout | Use @stripe/react-stripe-js for inline payment form on the page | ✓ |
| You decide | Claude picks simplest approach | |

**User's choice:** Stripe embedded checkout
**Notes:** Richer UX — user stays on the page during payment. Adds @stripe/react-stripe-js dependency.

### Monthly/Yearly Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Pill toggle above cards | Centered pill toggle, switching updates all prices. Yearly shows crossed-out monthly + savings badge. | ✓ |
| Tabs (Monthly / Yearly) | Radix Tabs with separate tab content per interval | |
| You decide | Claude picks | |

**User's choice:** Pill toggle above cards (Recommended)
**Notes:** Green savings badges "Save $17.98" / "Save $33.89". Current plan highlighted border.

### PlanComparisonTable

| Option | Description | Selected |
|--------|-------------|----------|
| Update with Merit features | Keep structure, update rows for Merit system | ✓ |
| Remove it | Drop comparison table entirely | |
| You decide | Claude decides | |

**User's choice:** Update with Merit features (Recommended)
**Notes:** Add Merit allowance, feature access by tier, locked sections, streak/quiz access rows.

---

## Merit Shop & Purchase Flow

### Shop Location

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated /shop page | New route with sidebar entry, 4 pack cards in grid | ✓ |
| Sheet/drawer overlay | Slide-out drawer accessible from any page | |
| Section on /pricing | Add shop below subscription plans on /pricing | |

**User's choice:** Dedicated /shop page (Recommended)
**Notes:** Sidebar entry with shop icon. Linkable from balance dropdown, warnings, feature gates.

### Upgrade Comparison Banners

| Option | Description | Selected |
|--------|-------------|----------|
| Per-pack contextual banner | Each relevant pack card shows tier-specific upgrade pitch | ✓ |
| Single top banner | One banner at top of shop page | |
| You decide | Claude picks | |

**User's choice:** Per-pack contextual banner (Recommended)
**Notes:** Free user → 25-pack shows Pro pitch. Pro user → 50-pack shows Elite pitch. Elite → no banners.

### Shop Checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Same embedded checkout | Use @stripe/react-stripe-js for shop too (consistent UX) | ✓ |
| Stripe redirect | Redirect to Stripe hosted checkout for one-time payments | |
| You decide | Claude picks | |

**User's choice:** Same embedded checkout
**Notes:** Consistent experience across subscriptions and shop. User stays on page during payment.

---

## Billing History & Receipts

### Billing Page Location

| Option | Description | Selected |
|--------|-------------|----------|
| New /settings/billing route | Dedicated billing page with subscription info + purchase history | ✓ |
| Tab on Profile page | Add Billing tab to existing Profile page | |
| You decide | Claude picks | |

**User's choice:** New /settings/billing route (Recommended)
**Notes:** Two sections: Current Plan (tier, price, renewal) + Purchase History (table of shop transactions).

### Receipt Email Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Webhook-triggered | stripe-webhook-handler calls send-strivo-email after credit_shop_merits succeeds | ✓ |
| Frontend-triggered | Frontend calls send-receipt edge function after Stripe redirect | |
| You decide | Claude picks | |

**User's choice:** Webhook-triggered (Recommended)
**Notes:** Fully server-side, reliable. Email includes pack size, amount, new balance, purchase history link.

---

## Claude's Discretion

- TopBar badge styling (icon, animation, popover width)
- Pill toggle implementation (Radix Tabs vs custom toggle)
- Cancel subscription handling (Stripe portal vs confirmation dialog)
- Purchase history pagination approach
- Shop receipt email template HTML
- StripeProvider scope (full app vs checkout-capable pages only)
- Sidebar icon and label for Shop entry
- Paddle subscription read-only display on billing page

## Deferred Ideas

- Stripe customer portal integration for self-service subscription management
- Merit transaction history (all deductions/refunds, not just shop purchases)
- Animated balance counter on balance changes
- Push notifications for low balance
- A/B testing pricing page layouts
