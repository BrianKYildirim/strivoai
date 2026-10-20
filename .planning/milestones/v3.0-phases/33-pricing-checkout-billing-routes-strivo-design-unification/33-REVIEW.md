---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/components/pricing/BillingIntervalToggleV2.tsx
  - src/components/pricing/PackCardV2.tsx
  - src/components/pricing/PackSectionV2.tsx
  - src/components/pricing/TierCardV2.tsx
  - src/hooks/useMerits.ts
  - src/pages/Dashboard.tsx
  - src/pages/Pricing.tsx
  - src/pages/Settings/Billing.tsx
  - supabase/functions/create-checkout-session/index.ts
  - supabase/functions/create-stripe-portal/index.ts
findings:
  critical: 3
  warning: 4
  info: 3
  total: 10
critical_resolved: 3
status: criticals_resolved
resolution_commit: f857352
---

> **Resolution (2026-05-21):** All 3 critical findings fixed in commit `f857352`.
> - **CR-01** — `create-checkout-session` swap branch now guards a missing/empty subscription item id and returns 500 before calling `subscriptions.update`. Regression test added.
> - **CR-02** — `isMissingPaymentMethodError` narrowed to `payment_method_not_set` + canonical "no attached payment source"/"no default payment method" messages; generic `resource_missing` now surfaces as 500. Regression test added.
> - **CR-03** — `Billing.tsx` derives tier prices/allowances from `pricing-config` (`PRICING`, `MERITS_PER_MONTH`); removed stale hardcoded strings (free was showing 5 vs canonical 10).
> Warnings (4) and Info (3) remain open — address via `/gsd-code-review 33 --fix` or a follow-up pass if desired.

# Phase 33: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 33 delivers the Stripe checkout/portal integration, a subscription-swap path (Pro→Elite in-place), merit-reconciliation polling after upgrades, and a redesigned V2 pricing UI. The edge function security posture is generally sound: auth is gated before all Stripe operations, customer IDs are always resolved from the server-side `ctx.userId` profile row, and price IDs are always env-resolved. The main risks are a null-itemId silently passed to Stripe on subscription swap, hardcoded price strings in Billing.tsx that will drift from the canonical config, a race window in the Dashboard reconciliation snapshot, and several design-token violations in Billing.tsx.

---

## Critical Issues

### CR-01: Subscription swap passes `undefined` as item ID to Stripe — charges wrong price silently

**File:** `supabase/functions/create-checkout-session/index.ts:294-297`

**Issue:** When the swap branch retrieves the existing subscription, `sub.items?.data?.[0]?.id` evaluates to `undefined` if the subscription has no items (e.g., a cancelled or incomplete subscription that was not fully cleaned up, or a Stripe API schema change). Stripe's `subscriptions.update` call receives `{ id: undefined, price: priceId }`. The Stripe Node SDK does **not** reject an `undefined` `id` field at the TypeScript level — it serialises to a missing key, which Stripe may interpret as "add a new item" instead of "replace the existing item", creating a second active subscription item on the same subscription. The user could be charged for both the old and new price simultaneously (double-billing), which is the exact invariant the swap branch was designed to prevent.

**Fix:** Validate that `itemId` is a non-empty string before calling `update`. If it is missing, fail loudly with a 500 rather than proceeding:

```typescript
const sub = await stripe.subscriptions.retrieve(existingSubId);
const itemId = sub.items?.data?.[0]?.id;
if (!itemId) {
  log.error("subscription-swap-no-item-id", {
    userId: ctx.userId,
    subscriptionId: existingSubId,
  });
  return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
}
await stripe.subscriptions.update(existingSubId, {
  items: [{ id: itemId, price: priceId }],
  proration_behavior: "create_prorations",
});
```

---

### CR-02: `isMissingPaymentMethodError` matches on `code === "missing"` — too broad, masks real Stripe errors

**File:** `supabase/functions/create-checkout-session/index.ts:133-144`

**Issue:** The function checks `code === "missing"` as one of its conditions. `"missing"` is Stripe's generic `resource_missing` sub-code (e.g., deleted customer, missing price, missing subscription). A subscription update failure caused by a **deleted customer** or a **non-existent priceId** would also carry `code === "missing"` and be mis-routed to `{ mode: 'portal_required' }` instead of a real 500. The user is silently redirected to the Stripe portal with no indication that a configuration error occurred, and the real root cause is suppressed in the logs.

Stripe's canonical error code for "no payment method" on a subscription charge is `payment_method_not_set`, not `"missing"`. The correct message fragment is "No payment methods attached to this subscription" or similar.

**Fix:** Remove the overly broad `code === "missing"` check and limit matching to the specific Stripe error code and message strings that exclusively indicate missing payment method:

```typescript
function isMissingPaymentMethodError(err: unknown): boolean {
  const stripeErr = err as { code?: string; message?: string } | null;
  const code = stripeErr?.code ?? "";
  const msg = (stripeErr?.message ?? "").toLowerCase();
  return (
    code === "payment_method_not_set" ||
    msg.includes("no attached payment source") ||
    msg.includes("no default payment method")
  );
}
```

Note: `resource_missing` should be kept if it is specifically observed in Stripe logs for this scenario, but should be tested before inclusion.

---

### CR-03: Hardcoded price strings in `Billing.tsx` will silently drift from `PRICING` in `pricing-config.ts`

**File:** `src/pages/Settings/Billing.tsx:49-57`

**Issue:** The `TIER_CONFIG` map in `Billing.tsx` hardcodes the display prices as plain strings (`'$8.99/month'`, `'$16.99/month'`). The canonical source of truth is `PRICING` in `pricing-config.ts` (`pro.monthly = 899`, `elite.monthly = 1699`). If prices change in `pricing-config.ts` (or if the annual price is shown), `Billing.tsx` will display stale/wrong amounts to users on the billing page. The allowance strings (`'75 Merits/month'`, `'150 Merits/month'`) have the same problem — the canonical values are in `MERITS_PER_MONTH`.

This is a data-correctness defect in a billing context: a user may see a price on the Billing page that does not match what they are actually charged.

**Fix:** Import `PRICING` and `MERITS_PER_MONTH` from `pricing-config.ts` and derive display strings at runtime:

```typescript
import { PRICING, MERITS_PER_MONTH } from '@/config/pricing-config';

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const TIER_CONFIG: Record<string, { label: string; badgeClass: string; price: string; allowance: string }> = {
  free:  { label: 'Free',  badgeClass: '...', price: 'Free',                              allowance: `${MERITS_PER_MONTH.free} lifetime Merits` },
  pro:   { label: 'Pro',   badgeClass: '...', price: `${fmtUsd(PRICING.pro.monthly)}/month`,   allowance: `${MERITS_PER_MONTH.pro} Merits/month` },
  elite: { label: 'Elite', badgeClass: '...', price: `${fmtUsd(PRICING.elite.monthly)}/month`, allowance: `${MERITS_PER_MONTH.elite} Merits/month` },
};
```

---

## Warnings

### WR-01: Dashboard reconciliation snapshot of `tier` captured before `useMerits` has loaded — always `'free'` on first render

**File:** `src/pages/Dashboard.tsx:42`

**Issue:** `const snapshotTier = tier` is captured inside the `useEffect` at line 42. The effect fires on mount (empty dependency array at line 64). At mount time, `tier` comes from `useTierAccess()`, which in turn reads from a React Query cache that may still be loading. If the cache is cold, `tier` will be `'free'` (the default) at snapshot time. After `reconcileTierUpgrade()` resolves, the success toast compares the reconciled tier against `snapshotTier === 'free'`, which is always different from a paid tier, so the toast fires even if the user was already Pro before the redirect (e.g., visiting `/dashboard?checkout=complete` manually without actually upgrading). More critically, if the user was already Elite and checks out again, `snapshotTier` being `'free'` means `newTier !== snapshotTier` is always true and the toast will always fire on any cache state, showing a misleading "You're now on Pro" message.

**Fix:** Guard the snapshot against the loading state, or defer the snapshot until `useMerits` returns a settled `tier`:

```typescript
const { isZero, reconcileTierUpgrade, tier, isLoading: isMeritsLoading } = useMerits();

useEffect(() => {
  if (searchParams.get('checkout') !== 'complete') return;
  if (reconcileFiredRef.current) return;
  if (isMeritsLoading) return; // wait for settled tier before snapshotting
  reconcileFiredRef.current = true;
  // ... rest of effect
}, [isMeritsLoading]); // re-run once loading resolves
```

---

### WR-02: `reconcileShopCredit` and `reconcileTierUpgrade` poll loop does not guard against `userId` becoming `null` mid-poll

**File:** `src/hooks/useMerits.ts:130-151`, `161-188`

**Issue:** Both poll functions close over `userId` at call time and check `if (!userId) return` only at entry. The query client invalidation inside the `while` loop — `queryClient.invalidateQueries({ queryKey: ['merit-balance'] })` — uses a prefix match. If the user signs out during the poll window (10 seconds), `userId` is no longer the authenticated user, but the loop continues invalidating and re-fetching the stale key. The refetch will likely return an error (unauthenticated), but this is silently discarded. The real risk is that `cachedShopExceeds()` / `tierReconciled()` reads `queryClient.getQueryData(key)` on a key that may now contain stale/error data, and the loop may run to its full 10-second ceiling unnecessarily or (in a worst case) incorrectly signal reconciliation as complete.

**Fix:** Re-check `userId` inside the loop before each invalidation:

```typescript
while (Date.now() - start < POLL_CEILING_MS) {
  if (!userId) return; // user signed out — abort poll
  await queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
  if (cachedShopExceeds()) return;
  await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}
```

---

### WR-03: `Pricing.tsx` — unauthenticated user clicking a paid tier CTA causes a `create-checkout-session` call that will 401, not a sign-in redirect

**File:** `src/pages/Pricing.tsx:27-84`

**Issue:** `handleTierCta` only redirects to `/auth` when `tier === 'free'`. For `'pro'` and `'elite'`, it immediately invokes `create-checkout-session`. An unauthenticated user (no session) will have no JWT to send, so `requireAuth` on the edge function returns a 401, which surfaces as `error` being truthy in the `supabase.functions.invoke` response. The user then sees the generic toast "Could not start checkout. Please try again." instead of being directed to sign in. This is a broken UX path for unauthenticated visitors on the pricing page.

**Fix:** Check authentication state before invoking the edge function:

```typescript
const handleTierCta = async (tier: Tier, chosenInterval: 'monthly' | 'annual') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || tier === 'free') {
    navigate('/auth');
    return;
  }
  // ... rest of handler
};
```

---

### WR-04: `create-checkout-session` does not validate that the `tier` in a subscription swap actually differs from the user's current subscription

**File:** `supabase/functions/create-checkout-session/index.ts:291-323`

**Issue:** The swap branch fires unconditionally when `existingSubId` is non-null. There is no check that `body.tier` (the target) differs from the user's current subscription tier. If a user sends `{ mode: 'subscription', tier: 'pro' }` while already on Pro (e.g., re-submitting the form, or a duplicate request), the code will call `stripe.subscriptions.update(...)` with the same price, generating a Stripe proration event with no net effect — but still consuming a Stripe API call and potentially creating a zero-amount invoice/proration record. More critically, with `proration_behavior: "create_prorations"`, Stripe may still create a proration line item even for same-price swaps, depending on billing cycle timing.

**Fix:** Read the user's current tier from the profile row (already fetched as `profile`) and short-circuit if the target tier matches:

```typescript
const currentTier = profile?.subscription_tier as string | null;
if (existingSubId && currentTier === body.tier) {
  // Already on the requested tier — return swap response without touching Stripe.
  return jsonResponse({ mode: "swap", tier: body.tier }, 200);
}
```

---

## Info

### IN-01: Hardcoded `amber-500` and `purple-500` color values in `Billing.tsx` violate design-token convention

**File:** `src/pages/Settings/Billing.tsx:50-57`, `63-66`

**Issue:** The `TIER_CONFIG.pro.badgeClass` uses `bg-amber-500/20 text-amber-500 border-amber-500/30` and `TIER_CONFIG.elite.badgeClass` uses `bg-purple-500/20 text-purple-400 border-purple-500/30`. The `getStatusBadge` function similarly uses `bg-emerald-500/15 text-emerald-500`, `bg-amber-500/15`, and `bg-destructive/15`. Per `CLAUDE.md`, the convention is semantic design tokens (e.g., `text-foreground`, `bg-primary`, `text-destructive`) — not hardcoded Tailwind color scales. This will break dark-mode or theme changes silently and is inconsistent with other V2 components in this phase (TierCardV2, PackCardV2) which correctly use tokens.

**Fix:** Replace raw Tailwind palette classes with CSS custom property overrides or align with the existing token set. At minimum use `text-warning`/`bg-warning` if those tokens exist, or define them — instead of raw `amber-500` values.

---

### IN-02: `TierCardV2` — `key={i}` on bullet list items uses array index as React key

**File:** `src/components/pricing/TierCardV2.tsx:83`

**Issue:** `key={i}` is used for the bullet list items. While the bullets array is static (no reordering or insertion), using array index keys is a maintenance hazard: if the `bullets` array is ever made dynamic or filterable (e.g., different bullets per interval), React will reuse DOM nodes incorrectly. The bullets are short strings that can serve as stable keys.

**Fix:**
```tsx
<li key={b} ...>
```

---

### IN-03: `fmtUsd` is defined independently in both `PackCardV2.tsx` and `TierCardV2.tsx`

**File:** `src/components/pricing/PackCardV2.tsx:11-13`, `src/components/pricing/TierCardV2.tsx:47-49`

**Issue:** Identical `fmtUsd(cents: number): string` helper is duplicated in two sibling files. This is minor but means a future fix (e.g., locale-aware `Intl.NumberFormat`) must be applied in two places.

**Fix:** Extract to a shared utility, e.g., `src/lib/formatCurrency.ts`, and import in both components.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
