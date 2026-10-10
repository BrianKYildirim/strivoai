---
phase: 32-stripe-shop-ui-race-fix-webhook-regression
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/hooks/useMerits.ts
  - src/components/topup/StripePaymentElementModal.tsx
  - src/components/topup/StripePaymentElementModal.test.tsx
  - supabase/functions/stripe-webhook-handler/index.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This phase introduces a bounded poll (`reconcileShopCredit`) in `useMerits` and wires it into `StripePaymentElementModal` to close the webhook-latency race where a single fire-and-forget `invalidateQueries` re-read the stale pre-purchase shop balance. The webhook regression tests (MER-10 axis-1/2/3) are named and structured correctly.

One critical correctness bug was found: `invalidateQueries` is not awaited through completion before the poll's stop condition is evaluated, so the first iteration of the poll loop always reads stale data regardless of whether the webhook has already landed. Three warnings cover a state-update-on-unmounted-component risk, a `QueryClient` instantiation pattern that breaks test isolation, and a missing `useCallback` on the returned `reconcileShopCredit` function that causes a new function reference on every render. Two informational items are also noted.

---

## Critical Issues

### CR-01: `reconcileShopCredit` evaluates its stop condition against stale cache data immediately after `invalidateQueries`

**File:** `src/hooks/useMerits.ts:144-147`

**Issue:** `queryClient.invalidateQueries()` marks queries stale and *schedules* a background refetch — it does **not** await the refetch to completion. The line immediately following (`if (cachedShopExceeds()) return`) reads `getQueryData`, which still holds the *pre-refetch* value at the moment of that synchronous read. The net effect is:

- Iteration 1: `invalidateQueries` fires, read-back still shows stale balance → loop continues.
- `setTimeout(1500ms)` elapses.
- Iteration 2: by now the first refetch has (probably) settled, so `getQueryData` sees the updated balance → stop condition finally triggers.

This means the earliest the poll can detect a landed credit is **1500 ms after the first invalidate**, even if the webhook credit landed before `confirmPayment` returned (e.g. synchronous test environments). In tests driven by fake timers, the timing contract holds coincidentally (the mock `invalidateQueries` + `setQueryData` in the test scaffold resolves the read immediately), but in production the UX guarantee advertised by the D-03 comment ("a credit that already landed resolves with zero wait") is broken: the immediate pre-loop check at line 141 will catch it, but if it misses that gate the loop always pays at least one full 1500 ms interval before re-reading.

More critically, since the refetch triggered by `invalidateQueries` is async and its settlement is never awaited, there is a window where the refetch from one iteration overlaps with the next `invalidateQueries` call, creating multiple concurrent inflight requests against `get_merit_balance` during the poll window.

**Fix:** Replace the fire-and-forget `invalidateQueries` inside the loop with a `refetchQueries` call (which returns a Promise that settles when all matching queries have re-fetched) and read the cache only after that Promise resolves:

```typescript
while (Date.now() - start < POLL_CEILING_MS) {
  // refetchQueries awaits the actual network round-trip, so the read-back
  // below sees the server's current value rather than the stale snapshot.
  await queryClient.refetchQueries({ queryKey: ['merit-balance', userId] });
  if (cachedShopExceeds()) return;
  await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}
```

The outer key should be scoped to `['merit-balance', userId]` (not the broad `['merit-balance']` prefix) to avoid refetching other users' merit-balance queries if multiple tabs share the same `QueryClient` instance.

---

## Warnings

### WR-01: `setSubmitting(false)` called after `onSuccess()` risks state update on unmounted component

**File:** `src/components/topup/StripePaymentElementModal.tsx:111-117`

**Issue:** In both the `succeeded` and `processing` branches, `onSuccess()` is called synchronously before the fall-through `setSubmitting(false)` on line 117. `onSuccess` calls `onOpenChange(false)`, which triggers the parent to unmount the `Dialog` (and therefore `PaymentForm`). The subsequent `setSubmitting(false)` on line 117 then fires against the state of an unmounted component. React 18 suppresses the unmounted-component warning but may still schedule a no-op re-render; more importantly, if `onOpenChange` is asynchronous or deferred (e.g. guarded by an animation), `setSubmitting` could fire while the component is in a torn-down state.

**Fix:** Call `setSubmitting(false)` before `onSuccess()` in each branch, or use an early-return pattern:

```typescript
if (paymentIntent?.status === 'succeeded') {
  toast.success(`${pack.merits} Merits added. Enjoy your career momentum.`);
  void reconcileShopCredit(snapshot);
  setSubmitting(false);
  onSuccess();
  return;
} else if (paymentIntent?.status === 'processing') {
  toast.info("Merits processing — they'll appear shortly");
  void reconcileShopCredit(snapshot);
  setSubmitting(false);
  onSuccess();
  return;
}
setSubmitting(false);
```

---

### WR-02: `Wrapper` in the test file instantiates `QueryClient` inside a React component body, breaking cache isolation across re-renders

**File:** `src/components/topup/StripePaymentElementModal.test.tsx:100-103`

**Issue:** The `Wrapper` helper creates a `new QueryClient(...)` directly in the function body:

```typescript
function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}
```

This means a new `QueryClient` is created on every render of `Wrapper`. If the test tree re-renders (e.g. due to state updates triggered by `waitFor` polling), a *new* `QueryClient` is created and passed as `client` to `QueryClientProvider`, discarding all cached data and subscriptions. In the tests that pass a manually constructed `qc` (T4, T6, T7, T8, T9), this does not matter — but tests T1, T2, T3, T5 all use `{ wrapper: Wrapper }`, and any re-render caused by internal state (e.g. `submitting` toggling in T5) will silently drop the cache mid-test.

The standard pattern is to create `QueryClient` outside the component (e.g. with `useMemo` or by constructing it once in a factory):

```typescript
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}
```

---

### WR-03: `reconcileShopCredit` is not memoized, causing a new function identity on every `useMerits` render

**File:** `src/hooks/useMerits.ts:129`

**Issue:** `reconcileShopCredit` is defined as a plain `const` inside the hook body, so a new function object is produced on every render of any component consuming `useMerits`. `PaymentForm` destructures it:

```typescript
const { shop, reconcileShopCredit } = useMerits();
```

Because `useMerits` also contains a `useQuery` (which re-renders on cache updates during the poll), and the poll itself triggers `invalidateQueries` (which causes cache updates → re-renders), the `PaymentForm` component will re-render repeatedly during an active poll, each time receiving a *new* `reconcileShopCredit` reference. Since the detached poll is already running as a `void`-ed promise and the new reference is never invoked mid-poll, this does not cause a behavioral bug today. However, it creates fragility: any future `useEffect` or `useMemo` that depends on `reconcileShopCredit` will incorrectly re-run on each poll iteration.

The companion function `optimisticDeduct` has the same issue.

**Fix:** Wrap `reconcileShopCredit` (and `optimisticDeduct`) with `useCallback`, keyed on `[userId, queryClient]`:

```typescript
const reconcileShopCredit = useCallback(async (snapshot: number): Promise<void> => {
  // ... existing body
}, [userId, queryClient]);
```

---

## Info

### IN-01: `MeritQueryShape` type is defined locally in `useMerits.ts` but is also implicitly reconstructed in the test mock

**File:** `src/hooks/useMerits.ts:32` / `src/components/topup/StripePaymentElementModal.test.tsx:54-57`

**Issue:** The inline type `{ balance: { shop_balance?: number } | null }` used inside `reconcileShopCreditMock` (test line 54) diverges slightly from the canonical `MeritQueryShape` type defined in `useMerits.ts` (which uses `Record<string, number | string | null>`). If `MeritQueryShape` evolves, the test mock's type guard will silently lag behind. `MeritQueryShape` is not exported, so the test cannot import it.

**Fix:** Export `MeritQueryShape` from `useMerits.ts` so the test can reference it directly, or add a comment noting the type must be kept in sync with the hook.

---

### IN-02: `signStripePayload` imported then immediately voided to suppress lint — dead import pattern

**File:** `supabase/functions/stripe-webhook-handler/index.test.ts:30-31`

**Issue:**

```typescript
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";
void signStripePayload;
```

The comment says "imported to satisfy lint for future reference usage." A dead import voided to suppress an unused-variable linter warning is the opposite of useful — it silently carries a real module import cost (Deno will resolve and evaluate `stripe-signature.ts` on every test run) and communicates false intent ("will be used soon") that may never be followed up.

**Fix:** Remove the import and the `void` statement entirely. Re-add it when the tests actually use `signStripePayload` for real signature verification coverage.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
