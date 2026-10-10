# Phase 33: Pricing / Checkout / Billing Routes + Strivo Design Unification - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 10 (8 modified, 0 net-new source, 2 test files to add/extend)
**Analogs found:** 10 / 10 (all in-repo, exact or role-match)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/pages/Pricing.tsx` | page | request-response (checkout) + presentation | `src/components/PricingTable.tsx` + `src/pages/Shop.tsx` | exact (worked example) |
| `src/pages/Dashboard.tsx` | page | event-driven (post-redirect reconciliation) | `src/pages/Shop.tsx` `?checkout=complete` + `useMerits.reconcileShopCredit` | exact |
| `src/pages/Settings/Billing.tsx` | page | CRUD (read-only react-query) | `src/hooks/useMerits.ts:48-72` (`.maybeSingle()` gating) | exact |
| `src/hooks/useMerits.ts` | hook | event-driven (poll) | self — add `reconcileTierUpgrade` sibling to `reconcileShopCredit:129-150` | exact (in-file sibling) |
| `src/components/pricing/TierCardV2.tsx` | component | presentation | `src/components/PricingTable.tsx:226-357` (semantic-token Card) | exact |
| `src/components/pricing/PackCardV2.tsx` | component | presentation | `src/components/PricingTable.tsx` Card pattern | role-match |
| `src/components/pricing/PackSectionV2.tsx` | component | presentation | Dashboard token catalog | role-match |
| `src/components/pricing/BillingIntervalToggleV2.tsx` | component | presentation | `src/components/PricingTable.tsx:196-222` (toggle, semantic tokens) | exact |
| `supabase/functions/create-checkout-session/index.ts` | edge function | request-response (Stripe) | self — add swap branch alongside `:247-313` | exact (in-file) |
| `supabase/functions/create-stripe-portal/index.ts` | edge function | request-response (Stripe) | self — fix `return_url:106` | exact (one-line) |

---

## Pattern Assignments

### `src/pages/Pricing.tsx` (page — checkout wiring + restyle)

**Analog:** `src/components/PricingTable.tsx` (working embedded-checkout reference) + `src/pages/Shop.tsx` (state shape).

**PRICE-02 — Free CTA fix.** `Pricing.tsx:19` navigates to `/auth/signup`; route table (`App.tsx:63`) only has `/auth`. Change to `navigate('/auth')`.

**PRICE-01 — replace `navigate('/checkout')` (`Pricing.tsx:22`) with the modal-open pattern.** State + handler to copy from `PricingTable.tsx:102-149`:
```typescript
// PricingTable.tsx:102-107 — state to add to Pricing.tsx
const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
const [checkoutOpen, setCheckoutOpen] = useState(false);
const [checkoutTitle, setCheckoutTitle] = useState('');
const [loadingTier, setLoadingTier] = useState<string | null>(null);
const { isLoading: isCheckoutLoading, fetchClientSecret } = useStripeCheckout();
const { tier: currentTier, loading: tierLoading } = useTierAccess();

// PricingTable.tsx:136-148 — handler body (NOTE: Pricing.tsx already passes
// interval as 'monthly'|'annual', so NO 'yearly'->'annual' mapping is needed,
// unlike PricingTable.tsx:140 which maps it)
setLoadingTier(tier);
const secret = await fetchClientSecret({ mode: 'subscription', tier, interval: chosenInterval });
if (secret) { setCheckoutSecret(secret); setCheckoutTitle(`Subscribe to ${tier}`); setCheckoutOpen(true); }
setLoadingTier(null);
```

**Render the wrapper** (copy `PricingTable.tsx:374-379`):
```typescript
<StripeCheckoutWrapper open={checkoutOpen} onOpenChange={setCheckoutOpen}
  clientSecret={checkoutSecret} title={checkoutTitle} />
```

**PRICE-08 — current-plan highlight.** `Pricing.tsx:61-68` does NOT pass `isCurrent` to `TierCardV2`. Wire `useTierAccess().tier` and pass `isCurrent={currentTier === tier}` (pattern: `PricingTable.tsx:151-154` `isCurrent`).

**PRICE-06/07 restyle** (drop `theme-v2` `:44`, `font-display` `:46`, `text-[--text-muted]` `:49`). Keep `BillingIntervalToggleV2` `:53`, the tier `.map` `:61`, and `PackSectionV2` `:71` mounted. Pack top-up dispatch (`:25-31`, `topup:open` event) must be preserved verbatim (CLAUDE.md: existing features must keep working).

---

### `src/pages/Dashboard.tsx` (page — post-redirect tier reconciliation, D-02/D-03)

**Analog:** `src/pages/Shop.tsx:33-50` (`?checkout=complete` effect) + `src/hooks/useMerits.ts:129-150` (`reconcileShopCredit` poll).

Dashboard already imports `useMerits` (`:11`), `useQueryClient` (`:1`), `useTierAccess` (`:16`), `toast` (`:9`). It does NOT yet import `useSearchParams`. Add an effect mirroring `Shop.tsx:34-41` but calling the new `reconcileTierUpgrade` (see useMerits below) instead of a bare invalidate:
```typescript
// Shop.tsx:34-41 — the structure to mirror (toast wording differs per D-02)
useEffect(() => {
  if (searchParams.get('checkout') === 'complete') {
    toast.success('Merits added to your balance!');          // D-02: "Upgrade processing…"
    queryClient.invalidateQueries({ queryKey: ['merit-balance'] });  // D-02: replace with reconcileTierUpgrade()
    searchParams.delete('checkout');
    setSearchParams(searchParams, { replace: true });
  }
}, [searchParams, setSearchParams, queryClient]);
```
**Differences for D-02:** expected tier is unknown from the URL (return_url carries `session_id`, not tier). Recommend reading `useTierAccess().tier` to detect change, OR have `reconcileTierUpgrade` poll until `subscription_tier` differs from the at-mount snapshot (D-03 also resets merit total to the new cap, a second watchable signal). Toast text: "Upgrade processing…" per D-02.

---

### `src/hooks/useMerits.ts` (hook — add `reconcileTierUpgrade` sibling, Claude's-discretion recommendation)

**Analog:** `reconcileShopCredit` in the same file (`:129-150`). Add a sibling that owns the same `['merit-balance', userId]` key and reuses `POLL_INTERVAL_MS`/`POLL_CEILING_MS` (`:29-30`, 1500/10000ms — CONTEXT confirms no reason to change).

**Poll body to clone** (`useMerits.ts:129-150`), changing only the stop condition:
```typescript
const reconcileShopCredit = async (snapshot: number): Promise<void> => {
  if (!userId) return;
  const key = ['merit-balance', userId] as const;
  const cachedShopExceeds = (): boolean => {
    const current = queryClient.getQueryData<MeritQueryShape>(key);
    const shopBalance = current?.balance?.shop_balance;
    return typeof shopBalance === 'number' && shopBalance > snapshot;
  };
  if (cachedShopExceeds()) return;                       // immediate first check
  const start = Date.now();
  while (Date.now() - start < POLL_CEILING_MS) {
    await queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
    if (cachedShopExceeds()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};
```
For `reconcileTierUpgrade(expectedTier?: Tier)`: the query already selects `subscription_tier` (`:59`) and exposes it as `tier` in the cache shape (`:66`). Stop condition becomes `current.tier === expectedTier` (or `current.tier !== snapshotTier` if expected is unknown). Must be added to the `MeritBalance` interface (`:6-19`) and the return object (`:152-165`), exactly as `reconcileShopCredit` is exported at `:18`/`:164`. Silent on timeout — same as the existing comment (`:149`).

---

### `src/pages/Settings/Billing.tsx` (page — spinner fix PRICE-04 + portal button PRICE-05)

**Analog (spinner fix):** `useMerits.ts:57-63` already applies the prescribed `.maybeSingle()` convention.

**PRICE-04 — three prescribed fixes (verbatim per REQUIREMENTS):**
1. `Billing.tsx:312` `.single()` → `.maybeSingle()` so a missing `profiles` row returns `data:null` instead of throwing PGRST116 (matches `useMerits.ts:59`).
2. `Billing.tsx:291-298` + the loading guard at `:339`: handle `userId === null` explicitly (render an error/redirect branch, not a perpetual `<Loader2>` `:346`). The profile query is `enabled: !!userId` (`:316`) — when null it never runs, never leaves loading.
3. `Billing.tsx:327-331` `merit_shop_purchases` query: add `.eq('user_id', userId!)` (currently relies solely on RLS).

**PRICE-05 — Manage Subscription, conditional.** `CurrentPlanCard` (`:78-163`) already renders the Free upgrade link (`:126-134`) and the Paddle-legacy notice (`:137-144`). Changes needed:
- Add `stripe_customer_id` to the profile select (`Billing.tsx:310` currently selects `stripe_subscription_id` but NOT `stripe_customer_id`) and to the `ProfileBilling` interface (`:19-26`).
- Replace the "Cancel Subscription" link that wrongly points to `/pricing` (`:152-157`) with a real button gated on `stripe_customer_id`, invoking `create-stripe-portal` (pattern from RESEARCH Pattern 3):
```typescript
const { data, error } = await supabase.functions.invoke('create-stripe-portal');
if (data?.url) window.location.href = data.url;
// else if error/'no_customer' → show /pricing upgrade link instead (D-05)
```
- Paddle-legacy (has paddle id, no `stripe_customer_id`): keep the existing notice (`:137-144`), no button.

---

### V2 pricing components — restyle off arbitrary CSS vars onto semantic tokens (PRICE-06)

**Analog:** `src/components/PricingTable.tsx:226-357` is the worked semantic-token example for pricing specifically (shadcn `Card`, `border-primary`, `text-foreground`, `bg-secondary/50`, `Badge`). Dashboard token catalog (RESEARCH §Code Examples) is the broader north star: `text-muted-foreground`, `text-foreground`, `text-primary`, `text-destructive`, `border-border`, `bg-muted/50`, `text-2xl`/`text-3xl font-bold`, shadcn `Card` — NO `font-display`, NO `.theme-v2`.

**`TierCardV2.tsx` — class swaps (content in `TIER_COPY:14-45` is FROZEN, D-08):**
```
:63  bg-[--surface-card] border border-[--surface-elevated] rounded-[--radius-boxy]
       → bg-card border border-border rounded-lg   (or shadcn <Card>)
:65  scale-[1.02] border-[--accent-red]            → border-primary (popular/current ring)
:70  font-display text-2xl font-semibold           → text-2xl font-bold (drop font-display)
:71  text-[--text-muted]                           → text-muted-foreground
:75  font-mono text-3xl                            → text-2xl/3xl font-bold (drop font-mono)
:85  text-[--text-primary]                         → text-foreground
:95  variant={'boxy-outline' : 'boxy'}             → variant={'outline' : 'default'}
```
**Button variant note:** `boxy`/`boxy-outline` (`button.tsx:20-21`) themselves embed `bg-[--accent-red]`, `font-mono`, `rounded-boxy` — switching to `default`/`outline` is required, not optional, to fully drop arbitrary vars.

**`BillingIntervalToggleV2.tsx`** (`:13,21-23,33-34,40`): `bg-[--surface-card] border-[--surface-elevated] rounded-[--radius-boxy]` → `bg-secondary/50 border border-border rounded-full`; `bg-[--accent-red] text-white` (active) → `bg-background text-foreground shadow-sm`; `text-[--text-muted]` → `text-muted-foreground`; `font-mono` → drop. Mirror `PricingTable.tsx:196-222`.

**`PackCardV2.tsx`** (`:20-23,30,36,37,39,40`): `bg-[--surface-card]` → `bg-card`; `border-[--accent-red] border-2 shadow-[0_0_40px_var(--accent-red-glow)]` → `border-primary border-2 shadow-lg`; `border-[--surface-elevated]` → `border-border`; `font-display`/`font-mono` → `font-bold`; `text-[--text-muted]` → `text-muted-foreground`; Best-Value badge → shadcn `Badge`; Button `boxy`/`boxy-outline` → `default`/`outline`.

**`PackSectionV2.tsx`** (`:13,16`): `font-display` → `text-3xl font-bold`; `text-[--text-muted]` → `text-muted-foreground`. Keep the `PACK_CATALOG.map` (`:21`) and 4-pack grid (`:20`) intact (D-08).

---

### `supabase/functions/create-checkout-session/index.ts` (edge — Pro→Elite swap branch, PRICE-03)

**Analog:** the existing embedded subscription branch in the same file (`:258-282`), plus the customer-lookup pattern (`:198-202`).

**Confirmed bug (RESEARCH Pitfall 1):** the subscription path always calls `stripe.checkout.sessions.create({ mode:'subscription' })` (`:260` / `:284`), which creates a SECOND active subscription for an existing subscriber → double-billing. The webhook only swaps on `customer.subscription.updated` (verified `stripe-webhook-handler/index.ts:694-750` — does `grant_upgrade_diff` + tier write), which a fresh Checkout Session never fires.

**Fix sketch (RESEARCH:193-203).** Before creating a session in the subscription branch, look up `profiles.stripe_subscription_id` (extend the select at `:200` which currently fetches `stripe_customer_id, email`). If an active sub exists, `stripe.subscriptions.update(...)` instead of creating a session — this routes through the existing, working webhook upgrade-diff branch:
```typescript
const sub = await stripe.subscriptions.retrieve(existingSubId);
await stripe.subscriptions.update(existingSubId, {
  items: [{ id: sub.items.data[0].id, price: newPriceId }],
  proration_behavior: 'create_prorations',
});
// → customer.subscription.updated → grant_upgrade_diff + tier write (already implemented)
```
**Plan-time decision (Open Question 1/2 + Assumption A2):** in-place swap (no embedded modal — saved card from initial checkout) vs. portal redirect. Recommend swap for net-new payment skip; fall back to portal if no saved card. Net-new subscribers keep the existing embedded `:258-282` path. Mirror error handling: wrap Stripe calls in try/catch returning `jsonResponse(...500)` (pattern `:305-313`).

---

### `supabase/functions/create-stripe-portal/index.ts` (edge — return_url fix, D-06/PRICE-05)

**Confirmed bug (RESEARCH Pitfall 3):** `:106` `return_url: ${appUrl}/billing` — no `/billing` route (App.tsx has only `/settings/billing` `:81`, falls to `<NotFound />`). One-line fix:
```typescript
// :106
return_url: `${appUrl}/settings/billing`,
```
Also update the docstring invariant at `:11` ("return_url is always APP_URL/billing") to match.

---

## Shared Patterns

### Embedded Stripe Checkout
**Source:** `src/components/StripeCheckoutWrapper.tsx` (whole file) + `src/hooks/useStripeCheckout.ts` (whole file)
**Apply to:** `Pricing.tsx` (D-01). Do NOT modify these abstractions — `useStripeCheckout.fetchClientSecret({mode:'subscription',tier,interval})` already POSTs `create-checkout-session` with `ui_mode:'embedded'` and handles unauth/invoke/unexpected errors with toasts (`useStripeCheckout.ts:23-48`). `StripeCheckoutWrapper` renders `EmbeddedCheckoutProvider`+`EmbeddedCheckout` in a shadcn `Dialog` and returns null when `clientSecret` is null (`:28`).

### Post-Redirect Reconciliation Poll (Phase 32)
**Source:** `src/hooks/useMerits.ts:122-150`
**Apply to:** Dashboard tier reconciliation (D-02/D-03). 1500ms interval / 10000ms ceiling, immediate first check, silent timeout, owns the `['merit-balance', userId]` key. Add the tier sibling in the hook (not the component) so it can read the cache back via `getQueryData` (the hook owns `userId`, the component does not — see the rationale comment at `:122-128`).

### `.maybeSingle()` for race-safe profile reads
**Source:** `src/hooks/useMerits.ts:55-63`
**Apply to:** `Billing.tsx:312` profile query (PRICE-04). A freshly-signed-up user whose `profiles` row has not yet materialized returns `data:null` instead of throwing PGRST116 and wedging react-query.

### Edge-function CORS-safe error envelope
**Source:** `create-checkout-session/index.ts:109-117` (`jsonResponse`) + try/catch wrapping every Stripe call (`:223-241`, `:305-313`; `create-stripe-portal:103-114`)
**Apply to:** any new swap logic in `create-checkout-session`. Uncaught throws escape `Deno.serve` without CORS headers and surface as misleading "failed to fetch" on the client — always wrap and return `jsonResponse(..., 500)`.

### Semantic-token card vocabulary
**Source:** `src/components/PricingTable.tsx:226-357` (pricing-specific worked example) + Dashboard catalog (RESEARCH §Code Examples)
**Apply to:** all four V2 pricing components (PRICE-06). shadcn `Card`/`Button`/`Badge`, `border-border`/`border-primary`, `text-foreground`/`text-muted-foreground`/`text-primary`/`text-destructive`, `bg-secondary/50`/`bg-muted/50`, `text-2xl`/`text-3xl font-bold`. No `font-display`, `font-mono`, `theme-v2`, `[--surface-*]`, `[--accent-*]`, `boxy`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/pages/Pricing.test.tsx` | test | — | Does not exist (Wave 0 gap). Model after existing `src/pages/Settings/Billing.test.tsx` (RTL + mocked `useNavigate`/`fetchClientSecret`). |

No source file lacks an analog — every modified file has an in-repo exact or role-match. The two genuine backend gaps (subscription swap, portal return_url) are in-file modifications to functions that already work for the adjacent case.

---

## Metadata

**Analog search scope:** `src/pages/`, `src/components/`, `src/components/pricing/`, `src/hooks/`, `supabase/functions/{create-checkout-session,create-stripe-portal,stripe-webhook-handler}/`, `src/App.tsx`, `src/components/ui/button.tsx`
**Files scanned (read in full or targeted):** 14
**Verifications confirmed:** webhook `customer.subscription.updated` does upgrade-diff + tier write (`stripe-webhook-handler:694-750`); `/auth` exists & `/billing` does not (`App.tsx:63,81,93`); `boxy`/`boxy-outline` variants embed arbitrary vars (`button.tsx:20-21`).
**Pattern extraction date:** 2026-05-21
