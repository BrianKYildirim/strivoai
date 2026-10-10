# Phase 20: merit-ux-shop-pricing-and-streak-ui - Research

**Researched:** 2026-04-17
**Domain:** Frontend UI (React + Stripe), minor backend (webhook email, checkout session extension)
**Confidence:** HIGH

## Summary

Phase 20 is the user-facing capstone of the Merit system: it ships the balance badge, cost previews, low/zero-balance states, pricing page overhaul, Merit Shop, billing page, purchase history, and receipt emails. The backend infrastructure is already complete (Phases 10-13 for Merit ledger/RPCs/enforcement, Phase 12 for Stripe checkout/webhook, Phase 19 for Interview Prep UI and streak display). This phase is almost entirely **frontend React work** with two minor backend touches: (1) extending `create-checkout-session` to support Stripe Embedded Checkout via `ui_mode`, and (2) adding a receipt email call to `stripe-webhook-handler` after shop crediting.

The highest-risk change is the **removal of `AiCreditsContext`** and migration of all 10 consumer files to the new `useMerits()` React Query hook. This is a load-bearing refactor -- if any consumer is missed, the build breaks. The second risk is the **Paddle-to-Stripe frontend migration** on the pricing page and upgrade modal, which requires adding `@stripe/react-stripe-js` and `@stripe/stripe-js` as new dependencies and removing all Paddle client-side references.

**Primary recommendation:** Structure the plan as: (1) `useMerits()` hook + `AiCreditsContext` removal, (2) TopBar badge, (3) cost previews across all feature pages, (4) Stripe integration + pricing page rewrite, (5) Merit Shop page, (6) billing page + purchase history, (7) webhook receipt email, (8) cleanup and sidebar updates. The `AiCreditsContext` removal must be a single atomic task or the build breaks mid-migration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Merit balance badge in TopBar with Radix Popover showing subscription/shop breakdown, reset date, quick links to Shop/Pricing
- **D-02:** Badge updates via `useMerits()` hook; invalidates on analysis completion
- **D-03:** Inline cost preview text above Analyze button: "Costs X Merits . Y remaining" with normal/amber/red/disabled states
- **D-04:** Cost values read from `merit_feature_costs` table via `useMerits()` or companion query
- **D-05:** Global low-balance threshold is 4 Merits (2x cheapest feature cost of 2)
- **D-05b:** Zero-balance state: disabled Analyze button, "Out of Merits" with two CTAs, red badge in TopBar
- **D-06:** `useMerits()` is React Query `useQuery` wrapping `get_merit_balance` RPC, queryKey `['merit-balance', userId]`, staleTime 5s, refetchOnWindowFocus true
- **D-07:** `useMerits()` replaces `AiCreditsContext` entirely; all consumers migrated, old context removed
- **D-08:** After analysis completes, `queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` for immediate refresh
- **D-09:** `/pricing` fully rewritten with pill toggle (Monthly/Yearly), 3-column grid, savings badges, crossed-out prices, Stripe embedded checkout
- **D-10:** Stripe Embedded Checkout via `@stripe/react-stripe-js`, inline on `/pricing` page, `VITE_STRIPE_PUBLISHABLE_KEY` env var
- **D-11:** `usePaddleCheckout` removed, all Paddle references deleted, Paddle SDK script tag removed from `index.html`
- **D-12:** `PlanComparisonTable` updated with Merit-specific rows
- **D-13:** Merit Shop at `/shop` with sidebar entry, accessible from multiple CTAs
- **D-14:** 4 pack cards in responsive grid (3/$1.99, 10/$4.99, 25/$9.99 "Most Popular", 50/$17.99)
- **D-15:** Per-pack contextual upgrade comparison banners (Free/Pro-conditional, none for Elite)
- **D-16:** Shop checkout uses same Stripe embedded checkout as subscriptions
- **D-17:** New `/settings/billing` route with Current Plan section and Purchase History table
- **D-18:** `SubscriptionManagement` simplified or removed; billing info moves to `/settings/billing`
- **D-19:** Receipt email triggered inside `stripe-webhook-handler` after `credit_shop_merits()` succeeds, calls `send-strivo-email` with `shop-receipt` template
- **D-20:** Receipt email is a minor addition -- one `fetch()` call, fire-and-forget
- **D-21:** `@stripe/react-stripe-js` added, shared `StripeProvider` wraps checkout pages, `VITE_STRIPE_PUBLISHABLE_KEY` env var
- **D-22:** `create-checkout-session` extended to return `client_secret` for embedded checkout mode

### Claude's Discretion
- Exact TopBar badge styling (icon choice, animation on balance change, popover width)
- Whether pill toggle uses Radix Tabs or custom toggle
- "Cancel subscription" handling -- Stripe customer portal redirect vs inline confirmation
- Purchase history pagination: React Query infinite scroll vs simple pagination
- Exact `shop-receipt` email template HTML/layout
- Whether `StripeProvider` wraps entire app or only checkout-capable pages
- Exact sidebar icon and label for Shop entry
- How to handle Paddle subscription transition period (read-only info on billing page)

### Deferred Ideas (OUT OF SCOPE)
- Paddle subscription management portal (read-only info only for existing Paddle subs)
- Stripe customer portal integration for self-service management
- Merit transaction history beyond shop purchases
- Animated balance counter
- Push notifications for low balance
- A/B testing pricing page layouts
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Persistent Merit balance badge in dashboard header, tap to expand breakdown | TopBar.tsx exists with credits badge pattern; `get_merit_balance` RPC returns `{ subscription_balance, shop_balance, total, next_reset_date }`; Radix Popover available |
| UX-02 | Every feature page shows Merit cost + current balance before Analyze button | `merit_feature_costs` table (13 rows, RLS select-all for authenticated) provides per-feature per-tier costs; all feature pages currently import `useAiCredits` which gets replaced by `useMerits()` |
| UX-03 | Low-balance amber warning when total Merits < 2x cheapest feature cost | Threshold is 4 Merits (D-05); `useMerits()` returns `isLow` derived from balance vs threshold |
| UX-04 | Zero-balance state disables Analyze button with "Out of Merits" + two CTAs | `useMerits()` returns `isZero`; existing disabled button patterns on Upload page |
| UX-05 | Merit Shop UI -- 4 pack cards with "Most Popular" badge on 25-pack | Pack prices/sizes defined in `merit_feature_costs` seed and `create-checkout-session` VALID_PACK_SIZES; shop Price IDs in Supabase secrets |
| UX-06 | Shop upgrade comparison banners -- tier-conditional | User tier available via profile query or `useMerits()`; conditional rendering per Free/Pro/Elite |
| UX-07 | Purchase history page at `/settings/billing` | `merit_shop_purchases` table has RLS select-own policy; columns: pack_size, price_cents, stripe_payment_intent_id, status, created_at |
| UX-08 | Pricing page with 3-column comparison, monthly/yearly toggle, savings badges | Existing PricingTable.tsx is structural template; Stripe Embedded Checkout replaces Paddle; prices fixed in spec |
| UX-09 | Interview Prep Elite UI (quiz card, 500-char counter, results screen) | **Already shipped in Phase 19 (D-08/D-09)** -- Phase 20 does NOT touch this |
| UX-10 | Streak display (flame, day count, cold/expired states) | **Already shipped in Phase 19 (D-08/D-09)** -- Phase 20 does NOT touch this |
| UX-11 | `useMerits()` hook -- live balance, cost preview, affordability check, 5s consistency | `get_merit_balance` RPC exists (Phase 11); React Query `useQuery` with staleTime 5000ms and refetchOnWindowFocus |
| SHOP-05 | Frontend creates Stripe Checkout Session in `payment` mode for shop packs | `create-checkout-session` already supports `mode: 'payment'` with `pack_size`; needs `ui_mode: 'embedded'` extension for client_secret |
| SHOP-08 | Email receipt sent asynchronously after successful shop purchase | `stripe-webhook-handler` already calls `credit_shop_merits`; add `send-strivo-email` call after; `send-strivo-email` pattern established with 7 email types |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Merit balance display (UX-01) | Browser / Client | -- | Pure UI: reads from React Query cache of `get_merit_balance` RPC |
| Cost previews (UX-02) | Browser / Client | Database | UI renders cost from `merit_feature_costs` table; DB owns truth |
| Low/zero balance warnings (UX-03, UX-04) | Browser / Client | -- | Threshold comparison in client from cached balance data |
| `useMerits()` hook (UX-11) | Browser / Client | API / Backend | React Query wrapper calling Supabase RPC; DB does the balance computation |
| Pricing page (UX-08) | Browser / Client | API / Backend | UI renders plan cards; checkout calls `create-checkout-session` edge function |
| Stripe embedded checkout (D-10, D-16) | Browser / Client | API / Backend | `@stripe/react-stripe-js` renders Stripe iframe; backend creates session with `ui_mode` |
| Merit Shop (UX-05, UX-06) | Browser / Client | API / Backend | UI renders pack cards; checkout same as pricing |
| Billing page (UX-07) | Browser / Client | Database | UI reads `merit_shop_purchases` via Supabase client with RLS |
| Shop receipt email (SHOP-08) | API / Backend | -- | Webhook handler calls `send-strivo-email` after shop credit |
| `create-checkout-session` extension (D-22) | API / Backend | -- | Edge function change to support `ui_mode: 'embedded'` returning `client_secret` |

## Standard Stack

### Core (existing -- no new frameworks)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | UI framework | Already in project [VERIFIED: package.json] |
| @tanstack/react-query | 5.83.0 | Server state management | Already in project; `useMerits()` uses `useQuery` [VERIFIED: package.json] |
| @radix-ui/react-popover | 1.1.14 | Balance badge popover | Already in project [VERIFIED: package.json] |
| @radix-ui/react-tabs | 1.1.12 | Monthly/yearly pill toggle | Already in project [VERIFIED: package.json] |
| @supabase/supabase-js | 2.81.1 | Supabase client for RPC calls and table reads | Already in project [VERIFIED: package.json] |
| Tailwind CSS | 3.4.17 | Utility-first styling | Already in project [VERIFIED: package.json] |
| lucide-react | 0.462.0 | Icons (gem, flame, alert, etc.) | Already in project [VERIFIED: package.json] |
| sonner | 1.7.4 | Toast notifications | Already in project [VERIFIED: package.json] |
| date-fns | 3.6.0 | Date formatting for reset dates, purchase history | Already in project [VERIFIED: package.json] |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @stripe/react-stripe-js | 6.2.0 | Stripe EmbeddedCheckout component | Pricing page and Shop page checkout [VERIFIED: npm registry] |
| @stripe/stripe-js | 9.2.0 | Stripe.js loader (`loadStripe`) | Required peer dependency for @stripe/react-stripe-js [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stripe Embedded Checkout | Stripe redirect checkout (current) | Redirect already works but user leaves the page; embedded keeps user on-site per D-10 |
| Radix Tabs for pill toggle | Custom toggle buttons | Radix Tabs provides accessibility out of the box; custom toggle is simpler but needs ARIA handling |
| React Query infinite scroll for purchase history | Simple pagination | Infinite scroll is overkill for < 100 rows typical; simple pagination with `LIMIT/OFFSET` is simpler |

**Installation:**
```bash
npm install @stripe/react-stripe-js@^6.2.0 @stripe/stripe-js@^9.2.0
```

## Architecture Patterns

### System Architecture Diagram

```
User Browser
    |
    +-- TopBar (Merit Badge)
    |     |
    |     +-- useMerits() hook
    |           |
    |           +-- React Query useQuery ['merit-balance', userId]
    |                 |
    |                 +-- Supabase RPC: get_merit_balance(userId)
    |                       |
    |                       +-- user_merits table (subscription_balance + shop_balance)
    |
    +-- Feature Pages (Upload, CareerCompass, LinkedInGrader, etc.)
    |     |
    |     +-- MeritCostPreview component
    |     |     +-- useMerits() for balance
    |     |     +-- useFeatureCosts() for per-feature cost from merit_feature_costs
    |     |
    |     +-- Analyze Button (disabled when isZero)
    |           +-- On success: invalidateQueries(['merit-balance'])
    |
    +-- /pricing page
    |     |
    |     +-- PricingTable (monthly/yearly toggle, 3-column cards)
    |     +-- PlanComparisonTable (Merit rows)
    |     +-- StripeEmbeddedCheckout (inline payment form)
    |           |
    |           +-- fetchClientSecret -> create-checkout-session (ui_mode: 'embedded')
    |                 |
    |                 +-- Returns { clientSecret } instead of { url }
    |
    +-- /shop page
    |     |
    |     +-- 4 pack cards (3/10/25/50 Merits)
    |     +-- Upgrade comparison banners (tier-conditional)
    |     +-- StripeEmbeddedCheckout (mode: 'payment')
    |           |
    |           +-- fetchClientSecret -> create-checkout-session (mode: 'payment', ui_mode: 'embedded')
    |
    +-- /settings/billing page
          |
          +-- Current Plan card (tier, interval, price, Merits, renewal date)
          +-- Purchase History table
                |
                +-- Supabase client: merit_shop_purchases (RLS: select own)

Backend (Edge Functions):
    |
    +-- create-checkout-session (extended)
    |     +-- New: ui_mode: 'embedded' -> session with return_url, returns { clientSecret }
    |     +-- Existing: redirect mode -> returns { url }
    |
    +-- stripe-webhook-handler (minor addition)
          +-- On checkout.session.completed (payment mode):
                +-- credit_shop_merits() [existing]
                +-- NEW: fetch('send-strivo-email', { emailType: 'shop-receipt', ... })
```

### Recommended Project Structure

```
src/
  hooks/
    useMerits.ts                  # NEW: React Query wrapper for get_merit_balance
    useFeatureCosts.ts            # NEW: React Query wrapper for merit_feature_costs
    useStripeCheckout.ts          # NEW: shared hook for embedded checkout
    usePaywallGuard.ts            # MODIFIED: use useMerits() instead of AiCreditsContext
    usePaddleCheckout.ts          # DELETED
  components/
    TopBar.tsx                    # MODIFIED: add Merit badge with Radix Popover
    MeritBalanceBadge.tsx         # NEW: extracted badge + popover component
    MeritCostPreview.tsx          # NEW: inline cost text above Analyze buttons
    PricingTable.tsx              # REWRITTEN: Stripe embedded checkout, Merit pricing
    PlanComparisonTable.tsx       # MODIFIED: Merit-specific rows
    UpgradeModal.tsx              # MODIFIED: Stripe instead of Paddle, Merit copy
    SubscriptionManagement.tsx    # SIMPLIFIED or REMOVED
    UsageCounter.tsx              # REPLACED with MeritBalanceBadge or REMOVED
    UsageLimitBanner.tsx          # REPLACED with Merit low-balance warning or REMOVED
    MeritShopCard.tsx             # NEW: individual pack card component
    UpgradeComparisonBanner.tsx   # NEW: tier-conditional upgrade pitch
    StripeCheckoutWrapper.tsx     # NEW: EmbeddedCheckoutProvider wrapper
    AppSidebar.tsx                # MODIFIED: add Shop and Billing entries
  contexts/
    AiCreditsContext.tsx          # DELETED
  pages/
    Pricing.tsx                   # MODIFIED: uses new PricingTable with StripeProvider
    Shop.tsx                      # NEW: Merit Shop page
    Settings/
      Billing.tsx                 # NEW: billing + purchase history
  App.tsx                         # MODIFIED: add routes, remove AiCreditsProvider

supabase/functions/
  stripe-webhook-handler/
    index.ts                      # MODIFIED: add receipt email call after shop credit
  create-checkout-session/
    index.ts                      # MODIFIED: support ui_mode: 'embedded' returning clientSecret
  send-strivo-email/
    index.ts                      # MODIFIED: add 'shop-receipt' template
```

### Pattern 1: `useMerits()` Hook (D-06)
**What:** React Query wrapper over the `get_merit_balance` Supabase RPC, replacing the entire `AiCreditsContext`.
**When to use:** Every component that needs to know the user's Merit balance, affordability, or low/zero state.
**Example:**
```typescript
// Source: Phase 20 CONTEXT.md D-06
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

const LOW_BALANCE_THRESHOLD = 4; // D-05: 2x cheapest feature cost

interface MeritBalance {
  total: number;
  subscription: number;
  shop: number;
  resetDate: string | null;
  isLow: boolean;
  isZero: boolean;
  isLoading: boolean;
  canAfford: (cost: number) => boolean;
}

export function useMerits(): MeritBalance {
  const { data, isLoading } = useQuery({
    queryKey: ['merit-balance', userId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_merit_balance', { p_user_id: userId });
      return data;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const total = data?.total ?? 0;
  return {
    total,
    subscription: data?.subscription_balance ?? 0,
    shop: data?.shop_balance ?? 0,
    resetDate: data?.next_reset_date ?? null,
    isLow: total > 0 && total < LOW_BALANCE_THRESHOLD,
    isZero: total <= 0,
    isLoading,
    canAfford: (cost: number) => total >= cost,
  };
}
```

### Pattern 2: Stripe Embedded Checkout (D-10, D-16)
**What:** Inline Stripe payment form that keeps the user on the Strivo page.
**When to use:** Both `/pricing` (subscription mode) and `/shop` (payment mode).
**Example:**
```typescript
// Source: Stripe docs https://docs.stripe.com/checkout/embedded/quickstart
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ mode, params }: { mode: 'subscription' | 'payment'; params: Record<string, unknown> }) {
  const fetchClientSecret = useCallback(async () => {
    const { data } = await supabase.functions.invoke('create-checkout-session', {
      body: { ...params, mode, ui_mode: 'embedded' },
    });
    return data.clientSecret;
  }, [mode, params]);

  return (
    <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
```

### Pattern 3: Feature Cost Companion Query (D-04)
**What:** Query the `merit_feature_costs` table to get per-feature per-tier cost.
**When to use:** Feature pages that show "Costs X Merits" above the Analyze button.
**Example:**
```typescript
// Source: merit_feature_costs table (Phase 11 migration)
export function useFeatureCosts() {
  return useQuery({
    queryKey: ['feature-costs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('merit_feature_costs')
        .select('feature, tier, cost');
      return data ?? [];
    },
    staleTime: 60_000, // costs rarely change; 1-minute cache
  });
}

// In a feature page:
function getCostForFeature(costs: FeatureCost[], feature: string, tier: string): number {
  return costs.find(c => c.feature === feature && c.tier === tier)?.cost ?? 0;
}
```

### Pattern 4: AiCreditsContext Removal (D-07)
**What:** Replace every `useAiCredits()` call with `useMerits()`, then delete the context and its provider from App.tsx.
**When to use:** This is a one-time migration, not a repeating pattern.
**Verification:** After removal, `grep -r "AiCreditsContext\|useAiCredits\|AiCreditsProvider\|creditsAvailable\|markCreditsDepletedFromError\|markCreditsRestored\|checkUsageLimitError" src/` must return zero matches.

### Anti-Patterns to Avoid
- **Incremental AiCreditsContext migration:** Do NOT leave both `AiCreditsContext` and `useMerits()` coexisting. Remove the context in the same task that introduces `useMerits()` -- otherwise consumers get confused about which to use, and the build may break if the provider order changes.
- **Direct Stripe Price ID exposure to frontend:** The frontend NEVER sends Price IDs to `create-checkout-session`. It sends `{ mode, tier, interval }` or `{ mode, pack_size }`. The backend resolves Price IDs from env vars. [VERIFIED: create-checkout-session/index.ts D-09 invariant]
- **Blocking webhook response on email:** The receipt email call (D-19/D-20) must be fire-and-forget. Do NOT `await` the email call before returning 200 to Stripe -- webhook timeout is 20s and email delivery is unreliable.
- **Paddle alongside Stripe:** Do NOT keep Paddle checkout code "just in case." D-11 is explicit: remove `usePaddleCheckout`, remove Paddle SDK script tag, remove all Paddle references. Existing Paddle subscribers are handled read-only on the billing page.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment form UI | Custom card input fields | `@stripe/react-stripe-js` `EmbeddedCheckout` | PCI compliance, hosted by Stripe, zero card data touches your server [CITED: docs.stripe.com/checkout/embedded/quickstart] |
| Balance caching / invalidation | Custom context with localStorage | React Query `useQuery` with `staleTime: 5000` | Automatic refetch, stale detection, window focus refetch, cache invalidation via `queryClient.invalidateQueries` [VERIFIED: @tanstack/react-query in package.json] |
| Popover component | Custom dropdown div | Radix Popover (`@radix-ui/react-popover`) | Accessible, trap focus, dismiss on outside click, portal rendering [VERIFIED: already in package.json] |
| Toggle component | Custom button group | Radix Tabs (`@radix-ui/react-tabs`) | Accessible, keyboard navigation, ARIA roles [VERIFIED: already in package.json] |
| Date formatting | Manual string concatenation | `date-fns` `format()` | Locale support, timezone handling, already used project-wide [VERIFIED: already in package.json] |

**Key insight:** Every UI primitive needed for this phase already exists in the project's dependency tree. No new UI libraries are needed -- only the two Stripe packages for embedded checkout.

## Common Pitfalls

### Pitfall 1: AiCreditsContext Removal Breaks Build
**What goes wrong:** Removing `AiCreditsContext` without updating all 10 consumer files causes TypeScript compilation errors.
**Why it happens:** `useAiCredits()` is imported in TopBar, Navbar, Dashboard, Upload, CareerCompass, SkillsGapAnalysis, useResumeStream, and UsageLimitBanner. Missing even one causes a build failure.
**How to avoid:** Before removing the context, grep for ALL consumers: `useAiCredits`, `AiCreditsContext`, `AiCreditsProvider`, `creditsAvailable`, `markCreditsDepletedFromError`, `markCreditsRestored`, `checkUsageLimitError`. Update every file in the same task. Run `npm run build` before committing.
**Warning signs:** TypeScript errors mentioning "Cannot find name 'useAiCredits'" or "No exported member 'AiCreditsProvider'".

### Pitfall 2: Stripe Embedded Checkout Requires ui_mode on Session
**What goes wrong:** The frontend requests a `clientSecret` but `create-checkout-session` creates a redirect-mode session that has no `client_secret` property.
**Why it happens:** Stripe Checkout Sessions only expose `client_secret` when created with `ui_mode: 'embedded'` (or `'embedded_page'`). Without this parameter, `session.client_secret` is null.
**How to avoid:** Add `ui_mode: 'embedded'` to the Stripe session creation params in `create-checkout-session` when the frontend passes `ui_mode: 'embedded'` in the request body. Also requires `return_url` instead of `success_url`/`cancel_url`.
**Warning signs:** `clientSecret is null` errors in the browser console; `EmbeddedCheckout` fails to mount.

### Pitfall 3: Paddle Script Tag Left in index.html
**What goes wrong:** The Paddle SDK script tag (`https://cdn.paddle.com/paddle/v2/paddle.js`) remains in `index.html` after the Paddle code is removed, causing unnecessary 3rd-party script loading and potential console errors.
**Why it happens:** Developers focus on removing JS files but forget the HTML script tag.
**How to avoid:** D-11 explicitly requires removing the script tag from `index.html` (line 44 currently). Add this to the Paddle removal task checklist.
**Warning signs:** Network tab shows a request to `cdn.paddle.com`; console shows "Paddle is not defined" warnings if any stale code references it.

### Pitfall 4: useMerits() Called Without Auth
**What goes wrong:** `get_merit_balance` RPC is called when the user is not authenticated, causing a Supabase error.
**Why it happens:** The hook might be rendered in non-authenticated contexts (e.g., public pricing page).
**How to avoid:** The `useMerits()` hook must check for a valid user session before making the RPC call. Use `enabled: !!userId` on the `useQuery` config. Return zero/null defaults when not authenticated.
**Warning signs:** Supabase RPC errors in the console on the public pricing page.

### Pitfall 5: Race Condition Between Analysis Completion and Balance Refresh
**What goes wrong:** User completes an analysis, sees the old balance for several seconds.
**Why it happens:** `useMerits()` has a 5-second `staleTime`. Even with query invalidation, the React Query refetch is asynchronous.
**How to avoid:** Call `queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` immediately on analysis completion (D-08). This forces an immediate refetch regardless of staleTime. The 5-second staleTime only prevents redundant background fetches, not explicit invalidations.
**Warning signs:** Balance badge doesn't update after analysis until the user switches tabs and back.

### Pitfall 6: Feature Cost Not Available for User's Tier
**What goes wrong:** A Free user on the Interview Prep page has no cost entry in `merit_feature_costs` (because `interview_prep/free` row is deliberately absent -- it's tier-locked).
**Why it happens:** Missing row in `merit_feature_costs` means `tier_locked`, not cost=0.
**How to avoid:** The `MeritCostPreview` component must handle the "no cost found" case as "feature locked for this tier" -- which should already be handled by `ProFeatureGate` wrapping the page. The cost preview only renders when the user has access to the feature.
**Warning signs:** "Costs undefined Merits" text appearing on locked feature pages.

### Pitfall 7: Pricing Page Accessible Both Authenticated and Unauthenticated
**What goes wrong:** The pricing page currently renders without `DashboardLayout` (uses `Navbar` + `Footer`). If the Stripe embedded checkout is mounted for unauthenticated users, `create-checkout-session` rejects with 401.
**Why it happens:** `/pricing` is a public route (no `ProtectedRoute` wrapper in App.tsx).
**How to avoid:** Show plan cards with pricing info to all users, but only mount the `EmbeddedCheckout` component after the user clicks "Subscribe" and is authenticated. If not authenticated, redirect to `/auth` first (existing PricingTable pattern).
**Warning signs:** 401 errors from `create-checkout-session` when unauthenticated user clicks upgrade.

## Code Examples

### Example 1: create-checkout-session Extension for Embedded Mode
```typescript
// Source: Stripe docs + existing create-checkout-session/index.ts pattern
// Add ui_mode support to the body normalization and session creation

// In normalizeBody, accept an optional ui_mode field:
type CheckoutBody =
  | { mode: "subscription"; tier: "pro" | "elite"; interval: "monthly" | "annual"; ui_mode?: "embedded" }
  | { mode: "payment"; pack_size: PackSize; ui_mode?: "embedded" };

// In session creation, conditionally use ui_mode:
if (body.ui_mode === "embedded") {
  session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    mode: body.mode,
    customer: customerId!,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    client_reference_id: ctx.userId,
    metadata: { user_id: ctx.userId, ...modeMetadata },
  });
  return jsonResponse({ clientSecret: session.client_secret, id: session.id }, 200);
} else {
  // Existing redirect flow -- unchanged
  session = await stripe.checkout.sessions.create({
    mode: body.mode,
    customer: customerId!,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/${body.mode === 'payment' ? 'shop' : 'pricing'}?canceled=1`,
    ...
  });
  return jsonResponse({ url: session.url, id: session.id }, 200);
}
```

### Example 2: Receipt Email in stripe-webhook-handler
```typescript
// Source: existing stripe-webhook-handler/index.ts + send-strivo-email pattern
// After the successful credit_shop_merits call (line ~497):

log.info("checkout-shop-credited", { eventId: event.id, userId, packSize });

// D-19/D-20: fire-and-forget receipt email
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseUrl && serviceKey) {
  fetch(`${supabaseUrl}/functions/v1/send-strivo-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: profile.email,
      userName: profile.full_name,
      emailType: "shop_receipt",
      metadata: {
        packSize,
        amountPaid: session.amount_total ? (session.amount_total / 100).toFixed(2) : "N/A",
        purchaseDate: new Date().toISOString(),
        billingUrl: `${Deno.env.get("APP_URL")}/settings/billing`,
      },
    }),
  }).catch((err) => log.error("receipt-email-failed", { eventId: event.id, err: String(err) }));
}
```

### Example 3: MeritCostPreview Component
```typescript
// Inline text above Analyze button per D-03
import { AlertTriangle } from 'lucide-react';
import { useMerits } from '@/hooks/useMerits';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface MeritCostPreviewProps {
  featureCost: number;
}

export function MeritCostPreview({ featureCost }: MeritCostPreviewProps) {
  const { total, isZero, isLow, canAfford } = useMerits();

  if (isZero) {
    return (
      <div className="text-sm text-destructive flex flex-col items-center gap-2">
        <span>Out of Merits</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/shop">Buy Merits</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/pricing">Upgrade Plan</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!canAfford(featureCost)) {
    return (
      <div className="text-sm text-amber-500 flex items-center gap-1">
        <AlertTriangle className="w-4 h-4" />
        <span>Costs {featureCost} Merits . {total} remaining (not enough)</span>
      </div>
    );
  }

  const isLowBalance = total < 4; // D-05 threshold
  return (
    <p className={`text-sm ${isLowBalance ? 'text-amber-500' : 'text-muted-foreground'}`}>
      {isLowBalance && <AlertTriangle className="w-4 h-4 inline mr-1" />}
      Costs {featureCost} Merits . {total} remaining
    </p>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Paddle client-side checkout | Stripe Embedded Checkout | Phase 12 (backend) + Phase 20 (frontend) | No redirect; user stays on page; PCI handled by Stripe iframe |
| `AiCreditsContext` (localStorage + React context) | `useMerits()` (React Query + Supabase RPC) | Phase 20 | Server-authoritative balance; automatic caching; window focus refetch |
| `can_perform_ai_action` RPC | `get_merit_balance` RPC | Phase 11 | Returns granular balance breakdown (sub/shop/total/reset date) instead of boolean |
| Hardcoded credit limits (3/100/300) | `merit_feature_costs` table | Phase 11 | Per-feature per-tier costs; source of truth in DB; frontend reads via RLS |

**Deprecated/outdated:**
- `AiCreditsContext`: Removed entirely in this phase (D-07). All consumers migrate to `useMerits()`.
- `usePaddleCheckout`: Removed entirely (D-11). Replaced by `useStripeCheckout()` wrapping Stripe Embedded Checkout.
- `UsageCounter` component: Replaced by `MeritBalanceBadge` in TopBar.
- `UsageLimitBanner` component: Replaced by inline low-balance warnings in `MeritCostPreview`.
- `can_perform_ai_action` RPC usage in frontend: Replaced by `get_merit_balance` RPC via `useMerits()`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stripe Checkout Sessions support `ui_mode: 'embedded'` for both `subscription` and `payment` modes | Architecture Patterns / Pitfall 2 | If subscription mode doesn't support embedded, pricing page must fall back to redirect checkout |
| A2 | `@stripe/react-stripe-js` v6.2.0 `EmbeddedCheckout` component works with Vite (non-Next.js) | Standard Stack | If it requires Next.js SSR features, would need a different integration approach |
| A3 | The `send-strivo-email` edge function can be extended with a new `shop_receipt` email type without breaking existing templates | Code Examples | If the function requires a code deploy to add new types, the email type must be added as part of this phase |

## Open Questions (RESOLVED)

1. **Stripe Embedded Checkout `return_url` behavior**
   - What we know: Embedded checkout requires `return_url` instead of `success_url`/`cancel_url`. After payment, the user is redirected to this URL with `{CHECKOUT_SESSION_ID}` appended.
   - What's unclear: Whether the return happens inside the parent page (no navigation) or forces a full page redirect. The existing `create-checkout-session` uses `success_url: /billing/success?session_id=...`.
   - Recommendation: Test with a simple return URL first. If the embedded checkout forces a redirect, create a lightweight `/checkout/return` route that reads session status and redirects to `/dashboard` or `/shop` with a success toast.
   - **RESOLVED (Plan 04):** Plan 04 creates `StripeCheckoutWrapper.tsx` with `return_url` set to `?checkout=complete&session_id={CHECKOUT_SESSION_ID}` appended to `/dashboard` (subscriptions) or `/shop` (payments). The Shop page (Plan 05) detects this query param and shows a success toast. Embedded Checkout forces a full page redirect to the return_url after payment completion.

2. **Paddle subscription read-only display on billing page**
   - What we know: Some users may still have active Paddle subscriptions. D-18 says billing info moves to `/settings/billing`.
   - What's unclear: Whether Paddle subscription data is accessible from `profiles` table (columns like `paddle_customer_id`, `paddle_subscription_id` may exist) or only from Paddle's API.
   - Recommendation: Check `profiles` table for Paddle columns. If present, show a read-only card on `/settings/billing` with "Managed by Paddle" note. Do NOT add Paddle API calls.
   - **RESOLVED (Plan 06):** Plan 06 Billing page queries `profiles` table for `paddle_customer_id` and `paddle_subscription_id` columns. If non-null, a read-only info card is shown with "Managed by Paddle" note. No Paddle API calls are made.

3. **StripeProvider scope**
   - What we know: `EmbeddedCheckoutProvider` needs `loadStripe()` which loads the Stripe.js script.
   - What's unclear: Whether to wrap the entire app (simpler, one-time script load) or only checkout pages (lazy load, smaller initial bundle).
   - Recommendation: Wrap only checkout-capable pages (`/pricing`, `/shop`) to avoid loading Stripe.js on every page. Use `React.lazy()` or dynamic import for the checkout components.
   - **RESOLVED (Plan 04):** Plan 04 creates `StripeCheckoutWrapper.tsx` with module-level `loadStripe()` that only loads when the component is imported. The wrapper is used only on `/pricing` (Plan 04) and `/shop` (Plan 05) pages. Stripe.js is not loaded on other pages.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Frontend build | Yes | 22+ | -- |
| npm | Package installation | Yes | -- | -- |
| Supabase CLI | Edge function deployment | Yes | 2.76.9+ | -- |
| VITE_STRIPE_PUBLISHABLE_KEY | Stripe embedded checkout | Not yet set | -- | Must be added to .env / Vercel env vars before deployment |
| `get_merit_balance` RPC | `useMerits()` hook | Yes (Phase 11 deployed) | -- | -- |
| `merit_feature_costs` table | Feature cost display | Yes (Phase 11 deployed) | -- | -- |
| `merit_shop_purchases` table | Purchase history | Yes (Phase 10 deployed) | -- | -- |
| `create-checkout-session` edge fn | Stripe checkout | Yes (Phase 12 deployed) | -- | Needs extension for ui_mode |
| `stripe-webhook-handler` edge fn | Receipt email | Yes (Phase 12 deployed) | -- | Needs minor addition |
| `send-strivo-email` edge fn | Receipt email | Yes (existing) | -- | Needs new template |

**Missing dependencies with no fallback:**
- `VITE_STRIPE_PUBLISHABLE_KEY` environment variable must be configured before the Stripe embedded checkout can work. Blocking for pricing page and shop checkout.

**Missing dependencies with fallback:**
- `@stripe/react-stripe-js` and `@stripe/stripe-js` npm packages must be installed. No fallback -- these are required for D-10.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.1 + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-11 | `useMerits()` returns correct shape from RPC data | unit | `npx vitest run src/hooks/useMerits.test.ts -x` | No -- Wave 0 |
| UX-01 | Merit badge renders total, popover shows breakdown | unit | `npx vitest run src/components/MeritBalanceBadge.test.tsx -x` | No -- Wave 0 |
| UX-02 | MeritCostPreview shows cost + balance text | unit | `npx vitest run src/components/MeritCostPreview.test.tsx -x` | No -- Wave 0 |
| UX-03 | Amber warning when balance < 4 | unit | `npx vitest run src/components/MeritCostPreview.test.tsx -x` | No -- Wave 0 |
| UX-04 | Zero balance disables Analyze, shows CTAs | unit | `npx vitest run src/components/MeritCostPreview.test.tsx -x` | No -- Wave 0 |
| D-07 | No AiCreditsContext references remain in codebase | smoke | `grep -r "useAiCredits\|AiCreditsContext" src/ && exit 1 \|\| exit 0` | N/A -- grep check |
| D-11 | No Paddle references remain in frontend code | smoke | `grep -r "usePaddleCheckout\|Paddle\|paddle" src/ index.html && exit 1 \|\| exit 0` | N/A -- grep check |
| UX-08 | PricingTable renders 3 columns with correct prices | unit | `npx vitest run src/components/PricingTable.test.tsx -x` | No -- Wave 0 |
| SHOP-08 | Receipt email body shape (shop_receipt template) | manual-only | Manual: trigger shop purchase in staging, verify email | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run && npm run build && npm run lint`
- **Phase gate:** Full suite green + successful build + grep checks for removed code

### Wave 0 Gaps
- [ ] `src/hooks/useMerits.test.ts` -- covers UX-11 (hook shape, loading state, isLow/isZero thresholds)
- [ ] `src/components/MeritCostPreview.test.tsx` -- covers UX-02, UX-03, UX-04 (normal/amber/zero states)
- [ ] `src/components/MeritBalanceBadge.test.tsx` -- covers UX-01 (badge rendering, popover content)
- [ ] Test setup for mocking `supabase.rpc` calls -- may need shared mock fixture

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- no auth changes in this phase |
| V3 Session Management | No | N/A -- no session changes |
| V4 Access Control | Yes | `merit_shop_purchases` RLS policy restricts to own records; `merit_feature_costs` is read-all; `create-checkout-session` requires `requireAuth` |
| V5 Input Validation | Yes | `create-checkout-session` validates `ui_mode` field; frontend validates cost > 0 before rendering |
| V6 Cryptography | No | N/A -- Stripe handles all payment cryptography |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Frontend Merit balance manipulation | Tampering | Balance is server-authoritative via `get_merit_balance` RPC; no client-side writes (NFR-03) |
| Price ID injection in checkout | Tampering | `create-checkout-session` ignores client-supplied `priceId`; resolves from env vars only (STR-12 invariant) |
| Stripe publishable key exposure | Information Disclosure | Publishable keys are designed to be public; secret key stays server-side only |
| Unauthorized purchase history access | Information Disclosure | `merit_shop_purchases` has RLS `select-own` policy (Phase 10 migration) |
| Receipt email to wrong user | Spoofing | Email address read from profile lookup inside webhook handler; not from request body |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260415000000_merit_rpcs.sql` -- `get_merit_balance` RPC shape, `merit_feature_costs` table schema and seed data, `credit_shop_merits` RPC
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` -- `merit_shop_purchases` RLS policy
- `supabase/functions/create-checkout-session/index.ts` -- Current session creation logic, response shape `{ url, id }`, mode discrimination
- `supabase/functions/stripe-webhook-handler/index.ts` -- Shop credit path at line 485-497, profile lookup chain
- `src/contexts/AiCreditsContext.tsx` -- Full source of the context being removed (113 lines)
- `src/hooks/usePaddleCheckout.ts` -- Full Paddle integration being removed (249 lines)
- `src/components/PricingTable.tsx` -- Current pricing table being rewritten (351 lines)
- `src/components/TopBar.tsx` -- Current TopBar where badge will be added (278 lines)
- `src/App.tsx` -- Current routes and provider tree (98 lines)
- `src/components/AppSidebar.tsx` -- Sidebar navigation items (174 lines)

### Secondary (MEDIUM confidence)
- [Stripe Embedded Checkout docs](https://docs.stripe.com/checkout/embedded/quickstart) -- `ui_mode`, `return_url`, `client_secret` pattern
- [@stripe/react-stripe-js npm](https://www.npmjs.com/package/@stripe/react-stripe-js) -- v6.2.0 current, `EmbeddedCheckoutProvider` + `EmbeddedCheckout` components
- [@stripe/stripe-js npm](https://www.npmjs.com/package/@stripe/stripe-js) -- v9.2.0 current, `loadStripe` function

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project except Stripe React (verified on npm)
- Architecture: HIGH -- all integration points verified in existing code; RPC shapes confirmed in migration SQL
- Pitfalls: HIGH -- based on direct code analysis of all 10 AiCreditsContext consumers, Paddle references, and Stripe session creation
- Stripe Embedded Checkout: MEDIUM -- pattern verified in official docs but `ui_mode` for subscription mode is assumed (A1)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable stack; Stripe SDK versions may update)
