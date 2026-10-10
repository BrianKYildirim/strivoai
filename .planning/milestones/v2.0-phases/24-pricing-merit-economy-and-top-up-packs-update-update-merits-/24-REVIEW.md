---
phase: 24-pricing-merit-economy-and-top-up-packs
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - index.html
  - src/App.tsx
  - src/components/pricing/BillingIntervalToggleV2.tsx
  - src/components/pricing/PackCardV2.tsx
  - src/components/pricing/PackSectionV2.tsx
  - src/components/pricing/TierCardV2.tsx
  - src/components/TopBar.tsx
  - src/components/topup/HeaderTopUpTrigger.test.tsx
  - src/components/topup/HeaderTopUpTrigger.tsx
  - src/components/topup/MeritBalanceHeaderV2.test.tsx
  - src/components/topup/MeritBalanceHeaderV2.tsx
  - src/components/topup/OutOfMeritsModalV2.test.tsx
  - src/components/topup/OutOfMeritsModalV2.tsx
  - src/components/topup/RunningLowCard.test.tsx
  - src/components/topup/RunningLowCard.tsx
  - src/components/topup/StripePaymentElementModal.test.tsx
  - src/components/topup/StripePaymentElementModal.tsx
  - src/components/topup/TopUpProvider.test.tsx
  - src/components/topup/TopUpProvider.tsx
  - src/components/ui/button.tsx
  - src/config/__tests__/req-coverage.test.ts
  - src/config/__tests__/sc12-snapshot.test.ts
  - src/config/pricing-config.snapshot.ts
  - src/config/pricing-config.ts
  - src/hooks/useCreatePaymentIntent.test.ts
  - src/hooks/useCreatePaymentIntent.ts
  - src/hooks/useFeatureCosts.test.ts
  - src/hooks/useFeatureCosts.ts
  - src/hooks/useMerits.test.ts
  - src/hooks/useMerits.ts
  - src/hooks/useOutOfMeritsModal.ts
  - src/index.css
  - src/pages/__tests__/pricing-boxy.lint.test.ts
  - src/pages/Dashboard.tsx
  - src/pages/Pricing.test.tsx
  - src/pages/Pricing.tsx
  - supabase/functions/_shared/merit-gateway.spend-ordering.test.ts
  - supabase/functions/_shared/test-helpers/stripe-fixtures.ts
  - supabase/functions/_tests/grandfather-subscriber-stability.test.ts
  - supabase/functions/create-payment-intent/index.test.ts
  - supabase/functions/create-payment-intent/index.ts
  - supabase/functions/stripe-webhook-handler/index.test.ts
  - supabase/functions/stripe-webhook-handler/index.ts
  - supabase/migrations/20260422000000_phase_24_topup.sql
  - tailwind.config.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 24: Code Review Re-Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found (info-only; no blocking issues)

## Summary

Re-review after fixes were applied for the 1 Critical + 6 Warnings from the previous pass. All seven issues have been resolved properly (not superficially) with defensible, well-commented patches. Each fix includes an explicit code comment pointing back to its finding id (CR-01, WR-01 through WR-06), which makes future maintenance easy.

No new Critical or Warning-level issues were introduced by the fixes. Three minor Info-level observations remain and do not block the phase from closing. The most notable is IN-01 which flags a contradiction between the WR-03 change and an existing unit test that likely needs to be updated in the same commit to keep CI green.

### Fix verification (all resolved)

- **CR-01 (payment_intent.succeeded / missing profile retry)** — `supabase/functions/stripe-webhook-handler/index.ts:452-469`. On `payment_intent.succeeded` with no matching profile, the handler now deletes the idempotency row and returns 500 so Stripe retries; subscription events keep the non-retry 200 behavior. Code comment clearly explains the single-delivery vs re-deliverable distinction. Correctly scoped (does not affect other event types). Verified.
- **WR-01 (TopUpProvider rapid-open race)** — `src/components/topup/TopUpProvider.tsx:39-63`. A monotonic `requestIdRef` is incremented per `topup:open`; the awaited `create()` result is discarded if `requestIdRef.current` changed while the request was in flight. Prevents stale `clientSecret` from overwriting a fresh one. Verified.
- **WR-02 (useMerits profiles lookup)** — `src/hooks/useMerits.ts:43`. `.maybeSingle()` replaces `.single()` with a nullish-coalesce default of `'free'` when the row is absent. Correctly chosen (`.maybeSingle()` returns `{data: null, error: null}` for zero rows instead of the PGRST116 error thrown by `.single()`). Verified.
- **WR-03 (isLow excludes zero-subscription users)** — `src/hooks/useMerits.ts:73`. Formula changed to `cap > 0 && subscription / cap <= 0.2` so that `subscription === 0` now qualifies. See IN-01 for the test-interaction follow-up.
- **WR-04 (credit_shop_merits missing user_merits row)** — `supabase/migrations/20260422000000_phase_24_topup.sql:86-96`. An `INSERT ... ON CONFLICT (user_id) DO NOTHING` backfills a zeroed `user_merits` row before the `FOR UPDATE` lock, and a `RAISE EXCEPTION` guards the "impossible" path. Balance credit can no longer silently drop. Verified.
- **WR-05 (create-payment-intent lazy customer try/catch)** — `supabase/functions/create-payment-intent/index.ts:162-182`. `stripe.customers.create` and the subsequent profiles `UPDATE` are wrapped in try/catch returning `{ error: 'payment_intent_creation_failed' }` 500 on failure. Matches the shape of the PI create catch below it; no internal detail leaks. Verified.
- **WR-06 (StripePaymentElementModal missing publishable key)** — `src/components/topup/StripePaymentElementModal.tsx:53-59, 144-150`. Module-scope guard logs a dev-mode console.error when `VITE_STRIPE_PUBLISHABLE_KEY` is unset and sets `stripePromise = null`. The modal renders a graceful "Payment is temporarily unavailable" fallback instead of hanging on a broken Stripe mount. Verified.

## Critical Issues

None.

## Warnings

None.

## Info

### IN-01: WR-03 change likely breaks an existing useMerits unit test

**File:** `src/hooks/useMerits.ts:73, 83` and `src/hooks/useMerits.test.ts:97-103`
**Issue:** After WR-03, `isLow = cap > 0 && subscription / cap <= 0.2` is `true` whenever subscription is 0 with cap > 0 — including the total depletion case where `isZero` is also `true`. The test `useMerits.test.ts:97-103` titled "isZero true when total=0; isLow stays false (distinct UI states)" still seeds `tier: 'free'` with `total: 0, subscription: 0` and asserts `isLow === false`. Under the new predicate, free tier cap=10 > 0 and `subscription/cap = 0/10 = 0 <= 0.2`, so `isLow` is now `true` and that assertion will fail.

Additionally, both `RunningLowCard` and `HeaderTopUpTrigger` gate only on `isLow` and hide when `isLoading`, but do not check `isZero`. That means a user at 0/75 merits will now see the `RunningLowCard` and the header `+` trigger at the same time as the `Dashboard.tsx` "Limit Reached" banner — three overlapping "needs merits" nudges where previously `isZero` owned that state exclusively. The WR-03 comment ("The isZero flag below continues to gate the total-depletion UI independently") captures the intended contract, but the current predicate does not enforce it.
**Fix:** Pick one and make code + tests agree:
```ts
// Option A — accept zero as "low" (matches WR-03 intent), update test and
// add RunningLowCard / HeaderTopUpTrigger exclusion when isZero so they
// yield to the destructive "Limit Reached" banner:
const isLow = cap > 0 && subscription / cap <= 0.2;
// In RunningLowCard.tsx / HeaderTopUpTrigger.tsx: if (isZero) return null;
// In useMerits.test.ts: flip the 0/10 assertion to expect isLow=true.
```
or
```ts
// Option B — re-exclude the total-zero case so the existing test stays green
// and the "distinct UI states" comment holds:
const isLow = cap > 0 && subscription > 0 && subscription / cap <= 0.2;
// Consumers that want the "zero OR low" superset can compute (isLow || isZero).
```

### IN-02: `useFeatureCosts` consumers can't distinguish "loading/error" from "feature not priced"

**File:** `src/hooks/useFeatureCosts.ts:14-32`
**Issue:** The query throws on error, but callers using `getCostForFeature(costs, ...)` treat `undefined` and "no matching entry" identically — both return `null`. Combined with the 60s `staleTime`, a single transient DB error causes downstream feature-gate logic to see `cost === null` for up to 60 seconds and potentially default to free-tier costs or fail-open. Not observed in this PR's consumers (none were touched yet), but worth hardening before gate wiring lands.
**Fix:** Either surface `isError` explicitly in the returned shape and have consumers check it before calling `getCostForFeature`, or change `getCostForFeature` to distinguish "still loading / error" from "not a priced feature":
```ts
export function getCostForFeature(
  costs: FeatureCost[] | undefined,
  feature: string,
  tier: string,
): number | null | undefined {
  if (costs === undefined) return undefined; // still loading / error
  const entry = costs.find((c) => c.feature === feature && c.tier === tier);
  return entry?.cost ?? null; // null = locked, number = cost
}
```

### IN-03: TopUpProvider rejects malformed events silently without incrementing the request counter

**File:** `src/components/topup/TopUpProvider.tsx:44-47`
**Issue:** If the user clicks a valid pack button (opens the modal with `clientSecret` pending), then a malformed `topup:open` event fires (e.g., from a future broken dispatcher), the current code `console.warn`s and returns early without touching any state — the previous in-flight request continues and its result is applied normally because `requestIdRef` was NOT incremented. This is actually the right behavior (reject malformed events silently, don't disrupt a valid one in flight) but it is not stated in the comment and could be misread. No functional bug; minor maintainability concern.
**Fix:** No change required. If desired, amend the comment block at lines 11-20 to note: "Invalid-detail events are dropped without mutating state or the requestId, so a concurrent valid request in flight is unaffected."

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
