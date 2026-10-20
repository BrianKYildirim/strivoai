---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
plan: 03
subsystem: billing-frontend
tags: [stripe, checkout, embedded-modal, reconciliation, PRICE-01, PRICE-03]
requires:
  - "create-checkout-session discriminated response (Plan 02): { clientSecret, id } | { mode:'swap', tier } | { mode:'portal_required' }"
  - "create-stripe-portal edge function ({ url } | { error })"
  - "StripeCheckoutWrapper (embedded checkout dialog)"
  - "useMerits ['merit-balance', userId] cache + reconcileShopCredit poll pattern (Phase 32)"
provides:
  - "Pricing.tsx embedded-modal wiring (net-new) + swap/portal branching (existing subscribers)"
  - "useMerits.reconcileTierUpgrade sibling poll (tier-change stop condition, silent timeout)"
  - "Dashboard ?checkout=complete reconciliation handler (processing toast + reconcile + URL cleanup)"
affects:
  - "Plan 05 Pricing restyle (must not regress the checkout handler/wiring added here)"
tech-stack:
  added: []
  patterns:
    - "Direct supabase.functions.invoke('create-checkout-session') in the paid CTA branch to read the { mode } discriminator that useStripeCheckout discards"
    - "reconcileTierUpgrade mirrors reconcileShopCredit (same key/bounds/immediate-check/silent-timeout) with a tier-change stop condition"
    - "Post-redirect reconciliation effect mirroring Shop.tsx ?checkout=complete (ref-guarded once-per-return)"
key-files:
  created:
    - src/pages/Dashboard.test.tsx
  modified:
    - src/pages/Pricing.tsx
    - src/pages/Pricing.test.tsx
    - src/hooks/useMerits.ts
    - src/hooks/useMerits.test.ts
    - src/pages/Dashboard.tsx
decisions:
  - "Pricing paid branch invokes create-checkout-session directly (not via useStripeCheckout) because the hook returns only string|null and discards the swap/portal mode discriminator (useStripeCheckout.ts:42) — a direct invoke is the minimal seam, no new hook/abstraction (CLAUDE.md)."
  - "Free-tier regression spec sets currentTier='pro' so the Free CTA is enabled (a free user sees the Free card as the current/disabled plan); the /auth navigation guard only matters when free is not the current tier."
  - "reconcileTierUpgrade default (no expectedTier) stops on a tier change from the at-call snapshot; an optional expectedTier stops on equality — matching the plan contract."
metrics:
  duration: ~38m
  completed: 2026-05-21
---

# Phase 33 Plan 03: Frontend Checkout Wiring + Dashboard Reconciliation Summary

Wired the frontend half of the Stripe checkout flow: `/pricing` Upgrade now opens the proven embedded Stripe modal for net-new subscribers and branches on the Plan 02 swap contract for existing subscribers, and the Dashboard reconciles tier + merit cap on return from checkout without a manual refresh — reusing the Phase 32 `reconcileShopCredit` poll pattern rather than reinventing it.

## What Changed

- **`src/pages/Pricing.tsx`** — Replaced the broken `navigate('/checkout?...')` paid branch with a direct `supabase.functions.invoke('create-checkout-session', { body: { mode:'subscription', tier, interval, ui_mode:'embedded' } })`. Branches on the raw `data`: `clientSecret` → open `<StripeCheckoutWrapper>` (net-new); `mode:'swap'` → `navigate('/dashboard?checkout=complete')` (no modal); `mode:'portal_required'` → invoke `create-stripe-portal` and `window.location.href = data.url`, with a `toast.error` + no-navigation fallback when the portal invoke errors or returns no `url`. Free CTA still navigates to `/auth`. `topup:open` pack dispatch preserved verbatim; no styling touched (Plan 05 owns the restyle); `useStripeCheckout` unmodified. `isCurrent` now passed to `TierCardV2`.
- **`src/hooks/useMerits.ts`** — Added `reconcileTierUpgrade(expectedTier?: Tier)` cloned from `reconcileShopCredit`: same `['merit-balance', userId]` key, same `POLL_INTERVAL_MS` (1500) / `POLL_CEILING_MS` (10000), immediate first check, silent on timeout. Stop condition reads the cached `tier` (the query already selects `subscription_tier`) — stops on equality with `expectedTier`, or on a change from the at-call snapshot when `expectedTier` is omitted. Added to the `MeritBalance` interface and the returned object; `reconcileShopCredit` untouched.
- **`src/pages/Dashboard.tsx`** — Added a `useSearchParams` mount effect mirroring `Shop.tsx`: on `checkout=complete` it fires the "Upgrade processing…" toast, captures the at-mount tier snapshot, calls `reconcileTierUpgrade()`, and cleans the `checkout` param with `{ replace: true }`. A success toast ("You're now on {Tier}.") fires only when the reconciled tier advanced; timeout is silent (no error toast). A `useRef` guard fires the poll/toast exactly once per return.
- **Tests** — `Pricing.test.tsx` gained the four PRICE-01 checkout-wiring specs (preserving the six Plan 01 layout specs); `Dashboard.test.tsx` created with the three PRICE-03 reconciliation specs; `useMerits.test.ts` gained two `reconcileTierUpgrade` specs (tier-change stop + silent ceiling timeout).

## TDD Gates

- **RED (`3d68e48`)** — Wave 0 specs added: 7 new specs fail against current source (`vitest` exit 1), 8 Plan 01 layout specs pass.
- **GREEN** — `74b9e12` (useMerits poll), `1fae912` (Pricing wiring turns the 4 Pricing specs green), `a192031` (Dashboard handler turns the 3 Dashboard specs green).
- **REFACTOR** — none needed.

## Verification

- `npx vitest run src/pages/Pricing.test.tsx src/pages/Dashboard.test.tsx src/hooks/useMerits.test.ts` → **29 passed / 0 failed**.
- Source assertions: no `navigate('/checkout` in `Pricing.tsx` (0 matches); `StripeCheckoutWrapper` rendered; direct `create-checkout-session` invoke branching on `data.mode` / `data.clientSecret`; `reconcileTierUpgrade` present in `useMerits` and called from `Dashboard`.
- `npx eslint` clean on `src/pages/Pricing.tsx` and `src/hooks/useMerits.ts`.

## Deviations from Plan

**1. [Rule 1 — Test design] Free-tier regression spec needs a non-free current tier**
- **Found during:** Task 3 GREEN run.
- **Issue:** With `useTierAccess` mocked to `tier:'free'`, `TierCardV2` renders the Free CTA as the disabled "Current plan", so the click never fired `navigate('/auth')` and the spec failed.
- **Fix:** The Free-tier regression spec now sets `currentTier='pro'` so the Free CTA is enabled and clickable — the `/auth` guard is what's under test, not the current-plan disabled state.
- **Files modified:** `src/pages/Pricing.test.tsx`
- **Commit:** `1fae912`

## Deferred Issues

- **Pre-existing `@typescript-eslint/no-explicit-any` in `Dashboard.tsx`** (6 errors on the existing infinite-query / saved-jobs code, not the lines this plan added). Out of scope per the executor SCOPE BOUNDARY; logged to `deferred-items.md`. Plan 03's added code is lint-clean.

## Known Stubs

None — all wiring is connected to live edge functions (`create-checkout-session`, `create-stripe-portal`) and the authoritative `['merit-balance']` cache. No placeholder/empty data paths introduced.

## Threat Flags

None — no new network surface beyond the Plan 02 / existing portal endpoints. The `?checkout=complete` param triggers a read-only reconciliation poll (T-33-08/09/10 dispositions hold).

## Success Criteria

- **PRICE-01** — `/pricing` Upgrade opens a working embedded Stripe checkout; no `/checkout` route used. — MET (asserted by the four Pricing specs + source scan).
- **PRICE-03 (frontend)** — existing subscribers route through swap/portal; post-redirect Dashboard reconciliation updates tier + merit cap mirroring Phase 32. — MET (asserted by the three Dashboard specs + `reconcileTierUpgrade` unit specs). Live staging Free→Pro/Elite verification is the Plan 05 operator phase gate.

## Self-Check: PASSED
- src/pages/Pricing.tsx — FOUND
- src/pages/Pricing.test.tsx — FOUND
- src/hooks/useMerits.ts — FOUND
- src/hooks/useMerits.test.ts — FOUND
- src/pages/Dashboard.tsx — FOUND
- src/pages/Dashboard.test.tsx — FOUND
- Commit 3d68e48 — FOUND
- Commit 74b9e12 — FOUND
- Commit 1fae912 — FOUND
- Commit a192031 — FOUND
