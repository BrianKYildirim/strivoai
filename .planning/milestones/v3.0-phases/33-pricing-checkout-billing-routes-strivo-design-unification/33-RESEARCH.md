# Phase 33: Pricing / Checkout / Billing Routes + Strivo Design Unification - Research

**Researched:** 2026-05-20
**Domain:** Stripe embedded checkout (subscription) + React Router routing + react-query data-loading + shadcn/Tailwind semantic-token restyle
**Confidence:** HIGH (all critical paths traced in repo source; D-04 verified against Stripe official docs)

## Summary

Phase 33 is almost entirely a **frontend wiring + restyle** phase against backend infrastructure that already exists and works. Every reusable building block is present in the codebase: the embedded subscription checkout (`StripeCheckoutWrapper` + `useStripeCheckout`), the post-redirect reconciliation poll (`useMerits.reconcileShopCredit`, 1500ms/10000ms bounds, already shipped in Phase 32), the customer-portal edge function (`create-stripe-portal`), and Dashboard's semantic-token vocabulary. The work is connecting these to `Pricing.tsx`, `Dashboard.tsx`, and `Settings/Billing.tsx`, and converging the V2 pricing components off their arbitrary CSS-var system onto semantic tokens.

**Two verification items resolved (both confirm a real bug to fix):**
1. **D-04 (Pro→Elite double-billing) — CONFIRMED BUG.** The `create-checkout-session` subscription path *always* calls `stripe.checkout.sessions.create({ mode: 'subscription' })`, which — per Stripe's own docs — **creates a SECOND active subscription** on the same customer rather than swapping the existing one. The webhook's upgrade-diff logic only fires on `customer.subscription.updated` (a subscription *modification*), which a fresh Checkout Session does NOT trigger. A Pro subscriber who "upgrades" to Elite via the current flow ends up with two active subscriptions and is double-billed. **PRICE-03 requires a server-side swap path.**
2. **D-06 (portal return_url) — CONFIRMED BUG.** `create-stripe-portal/index.ts:106` sets `return_url = ${APP_URL}/billing`. The React Router table (`src/App.tsx`) has **no `/billing` route** — only `/settings/billing` (`:81`). `vercel.json` rewrites all paths to `index.html`, so `/billing` loads the SPA but React Router falls through to `<NotFound />` (`:93`). It is a dead end. **PRICE-05 must change `return_url` to `${appUrl}/settings/billing`.**

**Primary recommendation:** Replace `Pricing.tsx` `navigate('/checkout')` with the proven `PricingTable.tsx` embedded-modal pattern; add a server-side subscription-swap branch to `create-checkout-session` (or a sibling function) for existing subscribers; fix the portal `return_url`; fix the Billing spinner with the prescribed `.maybeSingle()` + `userId === null` + `.eq('user_id', userId!)` changes; mirror `reconcileShopCredit` for tier reconciliation on Dashboard; and restyle the V2 pricing components onto Dashboard's semantic tokens.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Open checkout / collect payment | Browser (embedded Stripe iframe) | API (`create-checkout-session` mints clientSecret) | Stripe Embedded Checkout renders client-side; price IDs resolved server-side from env (never client-supplied) |
| Resolve price ID + create session | API (edge function) | — | `STRIPE_PRICE_<TIER>_<INTERVAL>` env-only; security invariant STR-12 |
| Subscription swap (Pro→Elite) | API (edge function) | Stripe (subscription item update) | Must run server-side; client cannot be trusted to pick the price; needs existing `stripe_subscription_id` lookup |
| Grant tier + reset merits on payment | API (`stripe-webhook-handler`) | Database (RPCs) | Webhook is the authoritative source of tier/merit state |
| Post-redirect reconciliation poll | Browser (`Dashboard.tsx` + `useMerits`) | API (re-reads `profiles`/`get_merit_balance`) | UI race: redirect returns before webhook lands; bounded poll on client |
| Customer portal session | API (`create-stripe-portal`) | Stripe (hosted portal) | Stripe-hosted; edge function only mints the session URL |
| Billing page data load | Browser (react-query) | Database (`profiles`, `merit_shop_purchases`) | Read-only display; spinner bug is a client-side query-gating issue |
| Pricing restyle | Browser (Tailwind/shadcn) | — | Pure presentation; semantic tokens resolve via CSS vars in `index.css` |

## Standard Stack

### Core (all already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@stripe/stripe-js` | ^9.2.0 | `loadStripe()` client | Already used by `StripeCheckoutWrapper` [VERIFIED: package.json] |
| `@stripe/react-stripe-js` | ^6.2.0 | `EmbeddedCheckoutProvider` + `EmbeddedCheckout` | Already the embedded-checkout primitive in repo [VERIFIED: StripeCheckoutWrapper.tsx] |
| `npm:stripe@14` (Deno) | 14 | Edge-function Stripe SDK | Pinned in `create-checkout-session/index.ts:32` and webhook [VERIFIED: source] |
| `@tanstack/react-query` | ^5.83.0 | Server-state + reconciliation poll cache | `['merit-balance', userId]` is the reconciliation key [VERIFIED: useMerits.ts] |
| `react-router-dom` | ^6.30.1 | Route table + `useNavigate`/`useSearchParams` | `src/App.tsx` route registry [VERIFIED: source] |
| `sonner` | ^1.7.4 | Toasts (upgrade-processing, error) | Project-standard toast [VERIFIED: Shop.tsx, useStripeCheckout.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `Card` (`@/components/ui/card`) | local | Restyle target primitive | D-07 restyle — Dashboard + Billing already use it [VERIFIED] |
| `date-fns` | ^3.6.0 | Renewal/reset date formatting | Already used in Billing.tsx [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Embedded checkout modal (D-01) | New `/checkout` route with redirect Checkout | CONTEXT D-01 locks the embedded modal — no new route. Redirect path exists in `create-checkout-session` (non-embedded branch) but is NOT the chosen path. |
| Server-side subscription swap (PRICE-03) | Stripe "limit to one subscription" dashboard setting | The dashboard setting only *redirects* in Stripe-hosted/Payment-Link mode, not guaranteed for `ui_mode:'embedded'`. Server-side swap is robust and explicit. [CITED: docs.stripe.com/payments/checkout/limit-subscriptions] |

**Installation:** None required — all packages present.

**Env vars referenced (no changes needed unless adding swap):**
- Frontend: `VITE_STRIPE_PUBLISHABLE_KEY` [VERIFIED: StripeCheckoutWrapper.tsx:13]
- Backend: `STRIPE_PRICE_PRO_MONTHLY|ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY|ANNUAL`, `APP_URL`, `STRIPE_WEBHOOK_SECRET` [VERIFIED: create-checkout-session.ts:123, create-stripe-portal.ts:95]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRICE-01 | `/pricing` Upgrade → working embedded Stripe checkout | `PricingTable.tsx:122-149` is the exact, working reference wiring. Replace `Pricing.tsx:22` `navigate('/checkout')` with `fetchClientSecret({mode:'subscription',tier,interval}) → setCheckoutSecret → setCheckoutOpen` + render `<StripeCheckoutWrapper>`. Note interval mapping: V2 already uses `'monthly'|'annual'` (matches backend); `PricingTable` mapped `'yearly'→'annual'` — `Pricing.tsx` already passes `'annual'` directly so no mapping needed. |
| PRICE-02 | Free CTA → working signup | `Pricing.tsx:19` navigates to `/auth/signup`; route table has only `/auth` (`App.tsx:63`). Change to `navigate('/auth')` (prescribed). |
| PRICE-03 | Free→Pro, Free→Elite, **Pro→Elite** complete; tier + merit cap update post-redirect | Free→Pro / Free→Elite work today (webhook `checkout.session.completed` → `reset_subscription_merits`). **Pro→Elite is BROKEN — see Pitfall 1 (double-billing).** Needs server-side swap. Post-redirect tier reconciliation needs the Dashboard mirror of `reconcileShopCredit` (D-02). |
| PRICE-04 | `/settings/billing` renders, no infinite spinner | Bug + fix located — see Pitfall 2. |
| PRICE-05 | Working "Manage Subscription" via `create-stripe-portal`; conditional rendering | `create-stripe-portal` works; not wired into `CurrentPlanCard`. `return_url` mismatch (D-06) must be fixed. Conditional needs `stripe_customer_id` (NOT currently selected by the billing query). |
| PRICE-06 | Restyle off `.theme-v2` + arbitrary CSS vars onto semantic tokens | Token catalog below; V2 components use `bg-[--surface-card]`, `font-display`, `font-mono`, `text-[--text-muted]`, `border-[--accent-red]`, `rounded-[--radius-boxy]`, `variant="boxy"`. |
| PRICE-07 | Tier content stays accurate post-restyle | Content lives in `TierCardV2` `TIER_COPY` + `pricing-config.ts` `PRICING`/`MERITS_PER_MONTH`. Preserve verbatim. |
| PRICE-08 | Current-plan highlight, monthly/annual toggle, savings badges, 4 packs intact | `BillingIntervalToggleV2`, `PackSectionV2` (renders `PackCardV2` × 4 from `PACK_CATALOG`), current-plan via `isCurrent` prop (currently unused by `Pricing.tsx` — must pass it). |
| TEST-07 | Checkout regression: Free→Pro, Free→Elite, Pro→Elite, shop pack | See Validation Architecture. e2e is the hard part — partial automation + manual Stripe test-card. |
| TEST-08 | Billing regression: renders ≤5s with valid session; never infinite spinner with stale/null session | See Validation Architecture. Testable via react-query + render assertions (existing `Billing.test.tsx`). |
</phase_requirements>

## Architecture Patterns

### System Architecture Diagram — Subscription Upgrade Flow

```
USER on /pricing
   │ clicks "Upgrade to Pro/Elite"
   ▼
handleTierCta(tier, interval)
   │  (D-01: open modal, NOT navigate)
   ▼
useStripeCheckout.fetchClientSecret({mode:'subscription', tier, interval})
   │  POST create-checkout-session  { ui_mode:'embedded' }
   ▼
EDGE: create-checkout-session
   │  ┌─ NEW subscriber → checkout.sessions.create({mode:'subscription'})  → clientSecret
   │  └─ EXISTING subscriber (Pro→Elite) → ⚠ MUST swap, not create 2nd sub
   ▼
clientSecret ──► StripeCheckoutWrapper (EmbeddedCheckoutProvider + EmbeddedCheckout)
   │  user pays in iframe
   ▼
Stripe redirects to return_url = /dashboard?checkout=complete&session_id=...
   │                                                  │
   │ (async, seconds later)                           ▼
   ▼                                            Dashboard mount handler (D-02)
EDGE: stripe-webhook-handler                    │ toast "Upgrade processing…"
   │ checkout.session.completed (subscription)  │ reconcile poll on profiles.subscription_tier
   │ → reset_subscription_merits (tier, cap)    │ + merit balance, ~10s bound
   │ customer.subscription.updated (if swap)    │ stop when tier === expected
   │ → grant_upgrade_diff + tier write          ▼
   ▼                                            UI shows new tier + cap
profiles.subscription_tier updated  ◄───────────┘ (eventual consistency)
```

### Recommended Touch Points (no new files required except possibly swap helper)
```
src/pages/Pricing.tsx              # D-01 modal wiring + D-07 restyle (drop theme-v2/CSS vars)
src/pages/Dashboard.tsx            # D-02 ?checkout=complete handler + tier reconciliation
src/pages/Settings/Billing.tsx     # PRICE-04 spinner fix + PRICE-05 Manage Subscription button
src/hooks/useMerits.ts             # (optional) add reconcileTierUpgrade sibling to reconcileShopCredit
src/components/pricing/*.tsx       # D-07 restyle TierCardV2/PackCardV2/BillingIntervalToggleV2/PackSectionV2
supabase/functions/create-checkout-session/index.ts  # PRICE-03 Pro→Elite swap branch
supabase/functions/create-stripe-portal/index.ts     # D-06 return_url fix (:106)
```

### Pattern 1: Embedded Subscription Checkout (the locked D-01 pattern)
**What:** Fetch clientSecret → store → open modal. NOT a route navigation.
**When to use:** Every paid-tier CTA on `/pricing`.
**Example (verbatim working reference):**
```typescript
// Source: src/components/PricingTable.tsx:122-149 (existing, working)
const { isLoading: isCheckoutLoading, fetchClientSecret } = useStripeCheckout();
const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
const [checkoutOpen, setCheckoutOpen] = useState(false);

const handleSubscribe = async (tier: 'pro'|'elite', interval: 'monthly'|'annual') => {
  const secret = await fetchClientSecret({ mode: 'subscription', tier, interval });
  if (secret) { setCheckoutSecret(secret); setCheckoutOpen(true); }
};
// render:
<StripeCheckoutWrapper open={checkoutOpen} onOpenChange={setCheckoutOpen}
  clientSecret={checkoutSecret} title={`Subscribe to ${name}`} />
```

### Pattern 2: Post-Redirect Reconciliation Poll (D-02 / D-03)
**What:** On `?checkout=complete`, show "processing" toast and poll the authoritative balance/tier until the webhook lands or ~10s elapses.
**When to use:** Dashboard mount, mirroring `Shop.tsx`'s `?checkout=complete` handler but for tier instead of shop credit.
**Example (existing pattern to mirror):**
```typescript
// Source: src/hooks/useMerits.ts:122-150 — reconcileShopCredit (ALREADY SHIPPED, Phase 32)
const POLL_INTERVAL_MS = 1500;
const POLL_CEILING_MS = 10000;
// reads ['merit-balance', userId] cache, invalidates on interval,
// stops when shop_balance > snapshot OR ceiling reached (silent on timeout)
```
For tier reconciliation the watch condition changes from `shop_balance > snapshot` to `subscription_tier === expectedTier` (and/or `total === MERITS_PER_MONTH[expectedTier]` since D-03 resets merits to the new cap). The poll can read `profiles.subscription_tier` (a fresh query) or piggyback the `['merit-balance', userId]` query which already selects `subscription_tier` (`useMerits.ts:59`).

> **Discretion note (CONTEXT):** Reuse-vs-sibling is Claude's discretion. Recommendation: add a sibling `reconcileTierUpgrade(expectedTier)` to `useMerits` (it already owns `userId` and the `['merit-balance']` key that carries `tier`), keeping the poll logic colocated with the cache it watches — same rationale the existing comment gives for why `reconcileShopCredit` lives in the hook.

### Pattern 3: Conditional Manage-Subscription (D-05)
**What:** Show portal button only when a Stripe customer exists; Free → upgrade link; Paddle-legacy → notice.
**When to use:** `CurrentPlanCard` in `Settings/Billing.tsx`.
**Example (portal invocation):**
```typescript
// create-stripe-portal returns { url }; open it
const { data, error } = await supabase.functions.invoke('create-stripe-portal');
if (data?.url) window.location.href = data.url;
// else if error.message includes 'no_customer' → show upgrade link instead (D-05)
```
The existing `CurrentPlanCard` (`Billing.tsx:78-160`) already renders the Paddle-legacy notice (`:137-144`) and a Free upgrade link (`:126-134`). PRICE-05 needs: (a) add `stripe_customer_id` to the billing profile query (it currently selects `stripe_subscription_id` but not `stripe_customer_id` — `Billing.tsx:310`), (b) replace the "Cancel Subscription" link that wrongly points to `/pricing` (`:152-157`) with a real Manage-Subscription button that invokes `create-stripe-portal`, gated on `stripe_customer_id` presence.

### Anti-Patterns to Avoid
- **Creating a 2nd Stripe subscription for an upgrade** (current Pro→Elite behavior). Double-bills the user. Swap server-side.
- **A new `/checkout` route** — CONTEXT D-01 explicitly forbids it; use the modal.
- **`navigate('/billing')`** anywhere — that route does not exist; use `/settings/billing`.
- **Hardcoded colors / arbitrary CSS-var classes** (`bg-[--surface-card]`, `text-[--text-muted]`) — CLAUDE.md mandates semantic tokens. Dashboard uses none of these.
- **Fire-and-forget single invalidate after checkout** — loses the webhook race; use the bounded poll (this is exactly the Phase 32 lesson encoded in `useMerits`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedded checkout UI | Custom Stripe Elements modal | `StripeCheckoutWrapper` | Already wraps `EmbeddedCheckoutProvider`/`EmbeddedCheckout` with the project Dialog [VERIFIED] |
| clientSecret fetch + auth + error toast | Inline `supabase.functions.invoke` | `useStripeCheckout` | Handles unauth, invoke error, unexpected error with toasts [VERIFIED] |
| Post-redirect balance race | New polling effect | `useMerits.reconcileShopCredit` pattern | 1500/10000ms bounds already tuned in Phase 32 [VERIFIED] |
| Customer portal session | Direct Stripe API from frontend | `create-stripe-portal` edge fn | Customer lookup is server-side, keyed on `ctx.userId` — cross-user-safe [VERIFIED] |
| Webhook signature verify | Hand-rolled HMAC | `stripe.webhooks.constructEventAsync` | Already done; D-18 invariant [VERIFIED] |
| Tier→price resolution | Client-passed priceId | `STRIPE_PRICE_*` env in edge fn | Security invariant STR-12; client price is ignored [VERIFIED] |

**Key insight:** This phase's risk is in *wiring existing pieces correctly* (and the one genuine backend gap — subscription swap), not in building new capability.

## Common Pitfalls

### Pitfall 1: Pro→Elite creates a second subscription (double-billing) — THE D-04 FINDING
**What goes wrong:** An existing Pro subscriber clicks "Upgrade to Elite". The current flow calls `create-checkout-session` which unconditionally runs `stripe.checkout.sessions.create({ mode: 'subscription', line_items:[elite_price] })`. Stripe creates a **new, second** active subscription on the same customer; the Pro subscription is NOT canceled. The user now pays for both.
**Why it happens:** A Checkout Session in subscription mode never modifies an existing subscription — it always creates a new one. The webhook's upgrade-diff branch (`stripe-webhook-handler:694-782`) only runs on `customer.subscription.updated`, which fires when a subscription *item* is changed via the API/portal — NOT when a new Checkout Session is completed. So no swap, no proration, two subscriptions. [VERIFIED: source trace] [CITED: docs.stripe.com — "by default... Stripe will create a second subscription rather than automatically replacing an existing one"]
**How to avoid (recommended fix for PRICE-03):** In `create-checkout-session` (or a sibling `upgrade-subscription` function), before creating a session, look up `profiles.stripe_subscription_id`. If the user already has an active subscription, **update it** instead of creating a new Checkout Session:
```typescript
// Server-side swap (sketch — verify item id from retrieved subscription)
const sub = await stripe.subscriptions.retrieve(existingSubId);
await stripe.subscriptions.update(existingSubId, {
  items: [{ id: sub.items.data[0].id, price: newPriceId }],
  proration_behavior: 'create_prorations', // or 'always_invoice'
});
// → fires customer.subscription.updated → webhook grant_upgrade_diff + tier write (already implemented)
```
This routes through the *existing, working* `customer.subscription.updated` webhook branch, so merit upgrade-diff + tier write happen automatically. The frontend then shows the reconciliation toast (no embedded payment needed for an in-place upgrade with a saved card; if no saved card, fall back to portal). **Decide the exact UX (in-place swap vs. portal redirect for upgrades) at plan time** — both are valid; the swap is the cleaner UX, the portal is less code.
**Warning signs:** Two rows in Stripe Dashboard → Customer → Subscriptions; user reports two charges; `profiles.stripe_subscription_id` points at the newer sub while the old one keeps billing.
**Confidence:** HIGH — confirmed in source AND Stripe docs.

### Pitfall 2: `/settings/billing` infinite spinner (PRICE-04 / TEST-08)
**What goes wrong:** Billing page shows `<Loader2>` forever for some sessions.
**Why it happens:** Three compounding issues in `Settings/Billing.tsx`:
1. The `billing-profile` query uses `.single()` (`:312`). If the `profiles` row doesn't exist yet (fresh signup race) `.single()` throws a PostgREST error → react-query error state, but the loading guard (`:339 if (profileLoading)`) interacts poorly with the disabled query.
2. `enabled: !!userId` (`:316`) — when `userId === null` (the `currentUser` query resolved to null, e.g. stale/expired session), the profile query never runs, so it never leaves its initial state and the page can hang on the spinner because `userId === null` is not handled explicitly (no redirect/error branch).
3. The `merit_shop_purchases` query (`:327-331`) has **no `.eq('user_id', userId!)` filter** — it relies entirely on RLS; if RLS context is off it can over-fetch or error.
**How to avoid (prescribed in CONTEXT/REQUIREMENTS, VERBATIM):**
- Handle `userId === null` explicitly (render an error/redirect, not a spinner).
- Switch `.single()` → `.maybeSingle()` on the profile query so a missing row returns `data:null` instead of throwing (same fix `useMerits.ts:59` already applies).
- Add `.eq('user_id', userId!)` to the `merit_shop_purchases` query.
**Warning signs:** Spinner never resolves on a fresh account or after session expiry; PostgREST `PGRST116` in console.
**Confidence:** HIGH — lines located; fix matches the project's existing `.maybeSingle()` convention.

### Pitfall 3: Portal `return_url` 404 (D-06)
**What goes wrong:** After managing their subscription, the user clicks "Return to Strivo" and lands on a NotFound page.
**Why it happens:** `create-stripe-portal:106` → `return_url: ${appUrl}/billing`; no `/billing` route exists. [VERIFIED: App.tsx has only `/settings/billing` at :81]
**How to avoid:** Change `return_url` to `${appUrl}/settings/billing`. (Alternative: add a `/billing` → `/settings/billing` redirect route, but changing the URL is the minimal fix.)
**Warning signs:** Portal "return" lands on `<NotFound />`.
**Confidence:** HIGH.

### Pitfall 4: Restyle drops content / breaks current-plan highlight (PRICE-07/08)
**What goes wrong:** Converging V2 cards to Dashboard tokens accidentally removes the savings badge, the current-plan ring, or relabels a feature.
**Why it happens:** `Pricing.tsx` currently does NOT pass `isCurrent` to `TierCardV2` (the prop exists, `TierCardV2.tsx:51`, default `false`), so the live page never highlights the current plan even though the component supports it. A restyle must *add* the `isCurrent` wiring (read `useTierAccess().tier`) while preserving `TIER_COPY` and `PACK_CATALOG` content verbatim.
**How to avoid:** Treat content (`TIER_COPY`, `pricing-config` values) as frozen; only change className vocabulary. Add `isCurrent={currentTier === tier}` when mapping tiers. Keep `BillingIntervalToggleV2` + `PackSectionV2` mounted.
**Warning signs:** Snapshot test (`sc12-snapshot.test.ts`) drift; missing "Most Popular" / current-plan badge; feature bullet text changed.
**Confidence:** HIGH.

## Code Examples

### Dashboard semantic-token vocabulary (D-07 restyle target — VERIFIED catalog)
Dashboard.tsx uses these tokens (frequency in parens), and **zero** `font-display`, `font-mono`, `theme-v2`, or `surface-*`/`accent-*` arbitrary CSS-var classes:
```
text-muted-foreground (18)   font-semibold (5)   font-bold (5)
text-primary (3)             text-destructive (3)  text-2xl (3)
rounded-lg (2)               border-primary (2)    border-border (2)
text-3xl (1)                 bg-muted/50 (1)        bg-muted/30 (1)
```
Plus shadcn `Card` (`@/components/ui/card`), `Button`, `Badge`. Headings are `text-2xl`/`text-3xl font-bold`/`font-semibold`. Cards are `border border-border rounded-lg` with `p-*` padding. **No `.theme-v2` scope, no `font-display`.** [VERIFIED: grep over Dashboard.tsx]

`PricingTable.tsx` (the legacy/unrouted reference) is ALREADY on these semantic tokens (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-secondary/50`, `border-primary`, shadcn `Card`/`Button`/`Badge`) — it is effectively a worked example of the D-07 target for pricing specifically. [VERIFIED: PricingTable.tsx:182-360]

### V2 components' current arbitrary-var classes to REPLACE (PRICE-06)
```
Pricing.tsx:44   <main className="theme-v2 ...">          → drop theme-v2
Pricing.tsx:46   font-display text-4xl                    → text-3xl/4xl font-bold (no font-display)
Pricing.tsx:49   text-[--text-muted]                      → text-muted-foreground
TierCardV2:63    bg-[--surface-card] border-[--surface-elevated] rounded-[--radius-boxy]
                                                          → bg-card border border-border rounded-lg
TierCardV2:65    border-[--accent-red]                    → border-primary (current-plan/popular ring)
TierCardV2:70    font-display                             → font-semibold/font-bold
TierCardV2:71    text-[--text-muted]                      → text-muted-foreground
TierCardV2:75    font-mono text-3xl                       → text-2xl/3xl font-bold (no font-mono)
TierCardV2:85    text-[--text-primary]                    → text-foreground
TierCardV2:95    variant="boxy"/"boxy-outline"            → "default"/"outline" (verify Button variants)
```
Apply the same audit to `PackCardV2.tsx`, `PackSectionV2.tsx`, `BillingIntervalToggleV2.tsx` (read each before editing). [VERIFIED: TierCardV2.tsx, Pricing.tsx source]

### Backend already-correct: subscription checkout (embedded)
```typescript
// Source: create-checkout-session/index.ts:258-282 — works for NEW subscribers
session = await stripe.checkout.sessions.create({
  ui_mode: "embedded", mode: "subscription", customer: customerId!,
  line_items: [{ price: priceId, quantity: 1 }],
  return_url: `${appUrl}/dashboard?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
  client_reference_id: ctx.userId,
  metadata: { user_id: ctx.userId, tier: body.tier, interval: body.interval },
});
return jsonResponse({ clientSecret: session.client_secret, id: session.id }, 200);
```
The `return_url` already targets `/dashboard?checkout=complete` (D-02). [VERIFIED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/checkout` route navigation | Embedded modal via `StripeCheckoutWrapper` | Phase 12/24 (top-up) | `Pricing.tsx` never got migrated — that's the PRICE-01 bug |
| Single invalidate after Stripe redirect | Bounded reconciliation poll | Phase 32 (`reconcileShopCredit`) | Dashboard tier reconciliation must adopt this |
| `.theme-v2` + arbitrary CSS vars on pricing | App-wide semantic tokens | App default | `/pricing` V2 components are the last holdout (PRICE-06) |

**Deprecated/outdated in this area:**
- `Pricing.tsx` `navigate('/checkout')` — dead route, never existed.
- `create-stripe-portal` `return_url=/billing` — dead route.
- `PricingTable.tsx` content `meritAllowance: '5 lifetime Merits'` / `'75 Merits/month'` — note Free is now **10 monthly** (Phase 30); `pricing-config.ts MERITS_PER_MONTH.free = 10`. The V2 `TierCardV2` reads from `pricing-config` (correct); `PricingTable.tsx` has stale hardcoded copy but it is unrouted, so out of scope unless reused.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Preferred Pro→Elite UX is server-side in-place swap (vs. portal redirect) | Pitfall 1 | LOW — both fix double-billing; plan-time decision. Recommend swap for UX. |
| A2 | A saved card exists for an in-place swap to charge proration without re-collecting payment | Pitfall 1 | MEDIUM — first-time subscribers have a card on file from initial checkout; if not, swap needs a payment method → fall back to portal. Verify against a real Pro account at plan/exec time. |
| A3 | The infinite-spinner repro is the `userId===null` + `.single()` interaction (not a different render path) | Pitfall 2 | LOW — lines match REQUIREMENTS prescription; existing `Billing.test.tsx` can confirm. |
| A4 | Phase 32 (`reconcileShopCredit`) is actually merged into `useMerits.ts` despite STATE.md labeling Phase 32 "Not started" | Pattern 2 | LOW — VERIFIED present in source (`useMerits.ts:122-150`); STATE.md is stale relative to the worktree. Planner should not block on the STATE label. |

## Open Questions (RESOLVED)

1. **Pro→Elite: in-place swap or portal redirect?**
   - What we know: Current flow double-bills (confirmed). Webhook handles `customer.subscription.updated` upgrade-diff correctly.
   - What's unclear: Whether to swap server-side (`subscriptions.update`) or send existing subscribers to the customer portal to switch plans.
   - Recommendation: Server-side swap for the cleanest UX; route through the existing `customer.subscription.updated` branch. Decide at plan time; document in PLAN.
   - **RESOLVED: Server-side in-place swap.** Plan 02 implements `subscriptions.update` and returns a discriminated `{ mode:'swap' }` response; when no payment method is on file it falls back to `{ mode:'portal_required' }`. No double-billing; webhook updates tier.

2. **Does the embedded modal need to also handle the swap, or only new subscriptions?**
   - What we know: New subs need the embedded payment element (collect card). An in-place swap on an existing customer with a saved card needs no payment element.
   - Recommendation: For existing subscribers, skip the modal — invoke the swap directly, show the reconciliation toast, and let the webhook update tier. Only open the embedded modal for net-new subscriptions.
   - **RESOLVED: Modal only for net-new subscriptions.** Plan 03 invokes `create-checkout-session` directly and branches on `data.mode`: `clientSecret` → open embedded modal (new sub); `swap` → reconciliation toast, no modal; `portal_required` → redirect to portal.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stripe test keys (`pk_test`/`sk_test`) | TEST-07 e2e checkout | Assumed (staging Stripe configured) | — | Manual test-mode card `4242…` |
| `STRIPE_PRICE_*` env (pro/elite × monthly/annual) | PRICE-01/03 | Assumed set (subscription flow shipped Phase 07/12) | — | none — blocks checkout if unset |
| Stripe Customer Portal configured in Dashboard | PRICE-05 | Assumed (function exists + tested Phase 07) | — | portal `sessions.create` 500s if not configured |
| `VITE_STRIPE_PUBLISHABLE_KEY` | embedded modal | Assumed (used by existing top-up) | — | modal renders nothing if empty |

**Missing dependencies with no fallback:** none identified at code level; operator must confirm Stripe test-mode price IDs + portal config on staging before TEST-07.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | Vitest ^4.1.6 + @testing-library/react ^14.3.1 + jsdom |
| Config file | `vitest.config.ts` [VERIFIED] |
| Quick run command | `npx vitest run src/pages/Settings/Billing.test.tsx` |
| Full suite command | `npm run test` (`vitest run`) |
| Edge fn tests (Deno) | `.\scripts\run-edge-tests.ps1` (Deno test) |
| Lint | `npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICE-01 | CTA opens embedded modal (clientSecret fetched, modal opens) | unit (RTL) | `npx vitest run src/pages/Pricing.test.tsx` | ❌ Wave 0 |
| PRICE-02 | Free CTA navigates to `/auth` | unit (RTL, mock useNavigate) | `npx vitest run src/pages/Pricing.test.tsx` | ❌ Wave 0 |
| PRICE-03 | Existing subscriber → swap path invoked (not 2nd session); webhook upgrade-diff branch | unit (edge, deps inject) + manual e2e | `.\scripts\run-edge-tests.ps1` (create-checkout-session) | ⚠ extend existing edge test |
| PRICE-04 | `userId===null` and missing-row do NOT spin forever; `.maybeSingle()` | unit (RTL) | `npx vitest run src/pages/Settings/Billing.test.tsx` | ✅ extend |
| PRICE-05 | Manage Subscription button invokes `create-stripe-portal`; hidden when no customer; Paddle notice | unit (RTL, mock invoke) | `npx vitest run src/pages/Settings/Billing.test.tsx` | ✅ extend |
| PRICE-06 | No `theme-v2`/arbitrary-var classes in pricing source | static assert / snapshot | `npx vitest run src/components/pricing` + grep guard | ⚠ snapshot exists (`sc12-snapshot.test.ts` is content-only) |
| PRICE-07 | Tier content unchanged (price/feature/CTA) | snapshot | `npx vitest run src/config/__tests__/sc12-snapshot.test.ts` | ✅ |
| PRICE-08 | Toggle + savings + 4 packs + current-plan render | unit (RTL) | `npx vitest run src/pages/Pricing.test.tsx` | ❌ Wave 0 |
| TEST-07 | Free→Pro/Elite + Pro→Elite + shop e2e | manual + edge unit | manual staging w/ test card; edge swap test | partial |
| TEST-08 | Billing ≤5s valid session; null/stale → error not spinner | unit (RTL, fake timers) | `npx vitest run src/pages/Settings/Billing.test.tsx` | ✅ extend |

### Sampling Rate
- **Per task commit:** `npm run lint` + the specific test file touched (`npx vitest run <file>`).
- **Per wave merge:** `npm run test` (full Vitest) + `.\scripts\run-edge-tests.ps1` if edge fns touched.
- **Phase gate:** Full Vitest green + edge tests green + manual TEST-07 e2e checklist (Stripe test cards: Free→Pro, Free→Elite, Pro→Elite verifying ONE active subscription, shop pack) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/pages/Pricing.test.tsx` — PRICE-01/02/08 (modal open, free nav, toggle/packs/current-plan). Does not exist.
- [ ] Extend `src/pages/Settings/Billing.test.tsx` — PRICE-04 (null userId + missing row no-spin), PRICE-05 (portal button conditional + invoke), TEST-08 (≤5s / error path).
- [ ] Extend `create-checkout-session` edge test — PRICE-03 swap branch (existing `stripe_subscription_id` → `subscriptions.update`, not a new session).
- [ ] (Optional) static guard test asserting no `theme-v2` / `\[--` arbitrary-var classes remain under `src/pages/Pricing.tsx` + `src/components/pricing/` (PRICE-06).
- [ ] TEST-07 is inherently manual at the Stripe boundary — author an operator e2e checklist (test cards, expected single-subscription assertion in Stripe Dashboard) rather than a fully automated test.

## Project Constraints (from CLAUDE.md)

- **Semantic design tokens, never hardcoded colors** — directly governs PRICE-06; drop `theme-v2`/`text-[--…]`/`bg-[--…]`.
- **Preserve existing TypeScript & React patterns** — reuse `useStripeCheckout`/`StripeCheckoutWrapper`/`useMerits`, do not invent new abstractions.
- **Supabase Edge Functions (Deno) + React frontend; no new infrastructure** — swap fix must live in an edge function, not a new service.
- **All existing features remain functional** — restyle must not break shop top-up (`PackSectionV2` → `topup:open` event, `Pricing.tsx:25-31`) or the merit header.
- **GSD workflow enforcement** — all edits via a GSD command; no direct edits outside the workflow.
- **Do not commit `.planning/`-ignored or `.gitignore` content; never `git add -A`/`.`** (user MEMORY).
- **User-facing error messages specific and operationally useful** — portal `no_customer` → show upgrade link, not a raw error toast (D-05).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Upgrade buttons open an embedded Stripe checkout modal, reusing `StripeCheckoutWrapper` (`EmbeddedCheckoutProvider` + `EmbeddedCheckout`) driven by `useStripeCheckout({ mode:'subscription', tier, interval })`. No new `/checkout` route — replace `navigate('/checkout?...')` in `Pricing.tsx:22` with the modal open.
- **D-02:** After a successful subscription checkout, Stripe redirects to `return_url = /dashboard?checkout=complete`. Add a Dashboard handler: "Upgrade processing…" toast + reconciliation poll of `profiles.subscription_tier` + merit balance until the webhook lands (~10s), mirroring Phase 32's `reconcileShopCredit`. No such handler exists today (only `Shop.tsx` handles `?checkout=complete`).
- **D-03:** Merit balance on upgrade resets to the new tier's cap — locked by PRICE-03. Reconciliation poll watches for this.
- **D-04:** Pro→Elite uses the same `create-checkout-session` subscription flow as Free→Pro for now (no separate portal-based upgrade path). ⚠ Research/verify backend/webhook swaps the existing subscription rather than leaving two active subscriptions. **[RESEARCH RESULT: It does NOT swap — it double-bills. See Pitfall 1; PRICE-03 must add a server-side swap.]**
- **D-05:** "Manage Subscription" lives on `/settings/billing`, rendered conditionally: shown only when `profiles.stripe_customer_id` exists (calls `create-stripe-portal`). Free users see an "Upgrade" link to `/pricing`. Paddle-legacy subscribers (paddle id, no `stripe_customer_id`) see a clear note, not a 400ing button.
- **D-06:** ⚠ Research/verify: `create-stripe-portal` `return_url = ${APP_URL}/billing` vs app route `/settings/billing`. **[RESEARCH RESULT: `/billing` is NOT a route — dead end → NotFound. Fix `return_url` to `${appUrl}/settings/billing`. See Pitfall 3.]**
- **D-07:** Restyle `/pricing` to match `/dashboard`. Drop `.theme-v2` (`Pricing.tsx:44`) and arbitrary CSS-var refs (`text-[--text-muted]` `:49`) in favor of Dashboard's semantic tokens: shadcn `Card` (`border border-border rounded-lg`, `p-4`/`p-12`), `text-foreground`/`text-muted-foreground`, `bg-background`/`bg-muted/50`, `text-primary`/`text-destructive`, bold headings (`text-2xl`/`text-3xl font-bold`). No `font-display`, no `.theme-v2`.
- **D-08:** Preserve all content/structure required by PRICE-07/08: accurate price/feature/CTA per tier, current-plan highlight, monthly/annual toggle (`BillingIntervalToggleV2`), savings badges, 4 Top-Up Pack cards (`PackSectionV2`). Light/dark must work. Converge visuals toward Dashboard; drop/relabel no content.

### Claude's Discretion
- Exact reconciliation poll interval/timeout (default to Phase 32's ~10s cadence: 1500ms interval / 10000ms ceiling unless research finds better — research found no reason to change).
- Whether the Dashboard `?checkout=complete` handler is a shared hook reused from shop reconciliation or a new sibling (recommendation: sibling `reconcileTierUpgrade` in `useMerits`).

### Deferred Ideas (OUT OF SCOPE)
- None within this phase. Celebrations page = Phase 34. Per-feature output trim = Phases 37–41.
</user_constraints>

## Sources

### Primary (HIGH confidence)
- Repo source (traced directly):
  - `src/pages/Pricing.tsx`, `src/components/StripeCheckoutWrapper.tsx`, `src/hooks/useStripeCheckout.ts`, `src/components/PricingTable.tsx` (reference wiring)
  - `src/pages/Shop.tsx`, `src/hooks/useMerits.ts` (reconciliation pattern, ALREADY shipped)
  - `src/pages/Settings/Billing.tsx` (spinner bug + CurrentPlanCard), `src/pages/Dashboard.tsx` (token catalog)
  - `src/App.tsx` (route table — no `/billing`), `vercel.json` (SPA rewrite)
  - `src/components/pricing/TierCardV2.tsx`, `src/config/pricing-config.ts`
  - `supabase/functions/create-checkout-session/index.ts`, `create-stripe-portal/index.ts`, `stripe-webhook-handler/index.ts`
  - `.planning/REQUIREMENTS.md` (PRICE-01..08, TEST-07/08), `.planning/ROADMAP.md`, `.planning/STATE.md`, `33-CONTEXT.md`
- [Stripe — Limit customers to one subscription](https://docs.stripe.com/payments/checkout/limit-subscriptions) — confirms default = second subscription; limit feature only redirects in hosted/Payment-Link mode.

### Secondary (MEDIUM confidence)
- [Stripe — Build a subscriptions integration with Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions)
- [Stripe — Create a Checkout Session (API)](https://docs.stripe.com/api/checkout/sessions/create)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages present and already in use; no new deps.
- Architecture / wiring: HIGH — every reuse path traced in source with line numbers.
- D-04 (double-billing): HIGH — confirmed in source AND Stripe docs.
- D-06 (return_url): HIGH — route table verified.
- Pitfall fixes: HIGH — match prescribed REQUIREMENTS text and existing project conventions.
- TEST-07 e2e: MEDIUM — Stripe-boundary verification is inherently partly manual.

**Research date:** 2026-05-20
**Valid until:** 2026-06-19 (stable; revisit if Stripe SDK major bump or pricing-config changes)
