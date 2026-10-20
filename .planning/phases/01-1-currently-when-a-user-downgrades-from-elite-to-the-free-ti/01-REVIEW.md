---
phase: 01-1-currently-when-a-user-downgrades-from-elite-to-the-free-ti
reviewed: 2026-07-19T00:00:00Z
depth: standard
review_round: 2
previous_round:
  findings: [CR-01, CR-02, CR-03, WR-01]
  status: remediated (c0673d0b, 00064b71, e0f75f43)
files_reviewed: 6
files_reviewed_list:
  - src/pages/Pricing.tsx
  - src/pages/Pricing.test.tsx
  - src/components/billing/RenewEliteDialog.tsx
  - src/components/billing/RenewEliteDialog.test.tsx
  - src/hooks/useSubscriptionState.ts
  - src/hooks/useSubscriptionState.test.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 01: Code Review Report (Round 2)

**Reviewed:** 2026-07-19
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Gap-closure re-review of the round-1 remediations for the scheduled Elite→Free downgrade flow. All four round-1 findings are verifiably fixed:

- **CR-01 (provisional-state retirement)** — the retirement effect (`Pricing.tsx:90-105`) correctly runs post-render, is suppressed during local Stripe confirmation, and after retirement a cleared authoritative truth wins on the same mount. Covered by a direct regression test.
- **CR-02 (exact-boundary expiry timer)** — `useSubscriptionState.ts:143-158` arms a single clamped one-shot at the exact `currentPeriodEnd` instant; cleanup on dep change/unmount prevents timer leaks; the `<=` expiry comparison plus `getSafeTimerDelay`'s `0` floor means a boundary-time refetch always derives expired. No infinite invalidation loop: the post-boundary derivation flips `isPendingDowngrade` false, disarming the effect.
- **CR-03 (reconciliation isolated from restore error boundary)** — `RenewEliteDialog.tsx:153-216` ends the provider-mutation try/catch at explicit Stripe confirmation; `stripeConfirmedRef` makes the restore mutation strictly one-shot (guards `runRestore`, the open-effect re-derivation, and close/reopen); a reconciliation rejection or timeout holds the persistent syncing state and never re-exposes Retry or a second restore invoke. Traced every path — no duplicate Stripe mutation and no false failure state after confirmation.
- **WR-01 (session-bound downgrade)** — the identity-change effect closes a stale dialog, and the pre-invoke `getUser` re-check (`Pricing.tsx:210-216`) makes it impossible to dispatch `cancel-subscription` under a swapped session. The null-userId carve-out is sound because a fully signed-out session is caught by the same pre-invoke guard.

The double-submit guards (`downgradeInFlightRef` + `downgrading`, `restoreInFlightRef`, `previewInFlightRef`) are correct, and the generation counters correctly discard stale async results after close/unmount. Two new edge-case defects were found in the fixed code paths (below); neither produces a duplicate financial mutation, so both classify as Warning rather than Blocker.

## Warnings

### WR-01: Exact-boundary expiry timer never re-arms when its effect deps are value-identical

**File:** `src/hooks/useSubscriptionState.ts:143-158`
**Severity:** WARNING
**Issue:** The one-shot timer effect depends on `[isPendingDowngrade, periodEndMs, userId, queryClient, queryKey]`. After the timer fires and `invalidateQueries` refetches, the newly derived state is a *new object with identical values* in two scenarios, so the effect never re-runs and no new timer is armed:

1. **Clamped far-future delay.** `getSafeTimerDelay` clamps to `MAX_TIMER_DELAY_MS` (~24.8 days). For a period end further out than that, the timer fires early at the clamp, the refetch re-derives *still pending* with the same `periodEndMs`, and — deps unchanged — the boundary timer is never re-armed for the rest of the mount. The code comment ("2099 fixtures cannot overflow setTimeout") addresses overflow but not chaining.
2. **Failed boundary refetch.** If the invalidation-triggered refetch errors, react-query keeps the previous (pending) `data`, deps stay value-identical, and there is no retry timer; the stale pending presentation persists past expiry until an unrelated refetch (e.g. window focus).

Practical impact is bounded (a tab must stay mounted >24.8 days, or the single boundary fetch must fail), but the fix's stated guarantee — "flipping isPendingDowngrade to false for every consumer without any new user action" — does not hold in these cases.
**Fix:** Include the query's fetch timestamp so every completed refetch re-evaluates the arm condition, which both chains clamped delays and retries after a failed boundary fetch:
```ts
const dataUpdatedAt = query.dataUpdatedAt;
useEffect(() => {
  if (!isPendingDowngrade || periodEndMs === null) return;
  const delay = getSafeTimerDelay(new Date(periodEndMs), new Date());
  if (delay === null) return;
  const timeoutId = window.setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }, delay);
  return () => window.clearTimeout(timeoutId);
}, [isPendingDowngrade, periodEndMs, dataUpdatedAt, userId, queryClient, queryKey]);
```

### WR-02: Provisional pending can never be retired if authoritative truth never reports pending on this mount

**File:** `src/pages/Pricing.tsx:90-105` (interaction with `Pricing.tsx:64-66`)
**Severity:** WARNING
**Issue:** The CR-01 retirement effect only clears `provisionalPending` when `subscriptionState.isPendingDowngrade` is observed `true`. This intentionally protects the seeding render against a transient not-yet-caught-up authoritative fetch — but it also means a *legitimately cleared* authoritative state can never override provisional unless pending was first observed. Concretely: user cancels in tab A (provisional seeded), then restores renewal in tab B (or via the Stripe portal) before tab A's authoritative query ever returns `pending_downgrade_tier='free'`. Tab A's query now reports not-pending *forever*, the retirement condition never fires, and `isDowngradePending` stays `true` via the OR at line 66 — a permanent false "downgrade scheduled" panel with an active "Keep Elite and renew" action for the rest of the mount. (Clicking it dispatches an idempotent restore, so there is no duplicate-charge risk — hence Warning, not Blocker.) The window's width depends on whether `cancel-subscription` writes `pending_downgrade_tier` synchronously before responding; if that write is webhook-driven, the window is materially wider — verify the edge-function write path when triaging.
**Fix:** Bound the provisional state by fetch recency instead of requiring a pending observation: record `Date.now()` when provisional is seeded, expose `query.dataUpdatedAt` from the hook, and retire provisional whenever a subscription fetch that *completed after* the cancel (`dataUpdatedAt > cancelSeededAt`) reports not-pending — such a fetch necessarily postdates the server-side cancel write, so it is authoritative for both the pending and the cleared case.

## Info

### IN-01: Syncing panel is terminal for the mount even after authoritative reconciliation

**File:** `src/pages/Pricing.tsx:73-79`; `src/components/billing/RenewEliteDialog.tsx:201-216`
**Issue:** Once `stripeConfirmedPeriodEnd` is set, `panelState` is `'syncing'` until `onProfileReconciled` fires. If reconciliation times out (10s ceiling) or the user closes the dialog mid-sync (Close is enabled in `syncing`; the close effect bumps the generation, discarding a later `'reconciled'` result), the panel shows "syncing your membership status" for the remainder of the mount — even after the authoritative query has long since confirmed the renewal. Tier cards remain correct (driven by authoritative state); only the panel text is stale until navigation. Tests assert this as intended behavior, so recorded as informational.
**Fix:** Consider also advancing to `'confirmed'` when `hasLocalStripeConfirmation && !subscriptionState.isPendingDowngrade && !subscriptionState.isLoading`.

### IN-02: `onStripeConfirmed` does not clear `provisionalPeriodEnd`, so the panel can show the pre-restore date

**File:** `src/pages/Pricing.tsx:67-72, 309-313`
**Issue:** In the same-mount cancel→renew sequence (before CR-01 retirement has fired), `provisionalPeriodEnd` still holds the cancel-time date. `onStripeConfirmed` clears `provisionalPending` but not `provisionalPeriodEnd`, and `panelPeriodEnd` prefers `pendingPeriodEnd` (which resolves to the stale provisional date) over `stripeConfirmedPeriodEnd`. Invisible when Stripe returns the same period end (the normal case), wrong if it returns a different one.
**Fix:** Add `setProvisionalPeriodEnd(null);` inside the `onStripeConfirmed` callback, or make `panelPeriodEnd` prefer `stripeConfirmedPeriodEnd` when set.

### IN-03: `no_subscription` success path leaves `downgradeUserId` set and skips the authoritative refresh

**File:** `src/pages/Pricing.tsx:229-234`
**Issue:** The benign `no_subscription` branch closes the dialog and invalidates merits but neither resets `downgradeUserId` (every other close path does) nor calls `subscriptionState.refresh()`, so any stale authoritative pending presentation is not re-read after the "already on Free" confirmation.
**Fix:** Add `setDowngradeUserId(null);` and `void subscriptionState.refresh();` to the branch for symmetry with the success path.

---

_Reviewed: 2026-07-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
