---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
plan: 02
subsystem: billing
tags: [stripe, subscriptions, checkout, edge-function, PRICE-03]
requires:
  - "profiles.stripe_subscription_id (existing column)"
  - "stripe-webhook-handler customer.subscription.updated branch (grant_upgrade_diff + tier write)"
provides:
  - "create-checkout-session server-side subscription-swap branch for existing subscribers"
  - "discriminated response: { mode:'swap', tier } | { mode:'portal_required' } | { clientSecret, id }"
affects:
  - "Plan 03 frontend checkout wiring (must branch on response.mode)"
tech-stack:
  added: []
  patterns:
    - "Server-side in-place subscription item swap via stripe.subscriptions.update with create_prorations"
    - "Env-only price resolution (STRIPE_PRICE_<TIER>_<INTERVAL>) — client price never trusted"
    - "Portal-fallback discriminated response on no-payment-method failure"
key-files:
  created: []
  modified:
    - supabase/functions/create-checkout-session/index.ts
    - supabase/functions/create-checkout-session/index.test.ts
decisions:
  - "Test file lives at create-checkout-session/index.test.ts (extended in place), not __tests__/index.test.ts as the plan text said — index.test.ts is the path the run-edge-tests.ps1 runner actually registers, so a __tests__/ file would never run."
metrics:
  duration: ~25m
  completed: 2026-05-21
---

# Phase 33 Plan 02: Server-Side Subscription Swap (PRICE-03) Summary

Fixed the Pro→Elite double-billing bug: `create-checkout-session` now swaps an existing subscriber's current subscription item in place (`stripe.subscriptions.update` with `create_prorations`) instead of always minting a second active subscription via `checkout.sessions.create`.

## What Changed

- **`create-checkout-session/index.ts`**
  - Profile select extended to fetch `stripe_subscription_id` alongside `stripe_customer_id, email` (keyed on `ctx.userId` — no cross-user mutation, T-33-04).
  - New swap branch in subscription mode: if the caller has a non-null `stripe_subscription_id`, retrieve the sub, swap `items[0].id` to the env-resolved target price (`STRIPE_PRICE_<TIER>_<INTERVAL>`, T-33-05), `proration_behavior: 'create_prorations'`, and return `{ mode: 'swap', tier }`. No second session is created.
  - The swap fires `customer.subscription.updated`; the existing webhook upgrade-diff branch grants tier + resets merits. No tier/merit writes added here.
  - New `isMissingPaymentMethodError` helper: on a no-usable-card Stripe failure the swap returns `{ mode: 'portal_required' }` (200, CORS) so the frontend can redirect to the customer portal; all other Stripe failures return `jsonResponse(..., 500)` with CORS headers (T-33-07).
  - Net-new subscribers (null `stripe_subscription_id`) fall through to the unchanged embedded `checkout.sessions.create` path returning `{ clientSecret, id }`.

- **`create-checkout-session/index.test.ts`** (extended in place)
  - Fake Stripe gained `subscriptions.retrieve` / `subscriptions.update` spies and a `client_secret` on created sessions; `FakeProfile` gained `stripe_subscription_id`.
  - Five new PRICE-03 cases: existing-subscriber swap (update called, no 2nd session), net-new embedded session unchanged, env price used / body.priceId ignored, no-payment-method → `portal_required`, generic failure → 500 + CORS.

## TDD Gates

- RED: `294f628` — 5 new swap tests added and failing (18 existing passing).
- GREEN: `1aeef2f` — implementation lands; 23/23 in the file pass, 68/68 across Stripe-related edge tests pass.
- REFACTOR: none needed.

## Verification

- `deno test create-checkout-session/index.test.ts`: 23 passed / 0 failed.
- Stripe-related edge suite (stripe-client, shop-pack-resolver, stripe-webhook, create-checkout-session, create-stripe-portal, stripe-webhook-handler, test-05-upgrade-proration): 68 passed / 0 failed.
- `pwsh` not available in this sandbox, so `run-edge-tests.ps1` was executed as its underlying `deno test` invocation (same files) directly.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test target path corrected to `index.test.ts`**
- **Found during:** Task 2 setup
- **Issue:** Plan referenced `create-checkout-session/__tests__/index.test.ts`, but no `__tests__/` dir exists; the runner (`scripts/run-edge-tests.ps1`) registers `create-checkout-session/index.test.ts`. A test under `__tests__/` would never run.
- **Fix:** Extended the existing `index.test.ts` in place (reusing its DI/Stripe-mock harness per CLAUDE.md "no new abstraction").
- **Files modified:** `supabase/functions/create-checkout-session/index.test.ts`
- **Commit:** `294f628`, `1aeef2f`

**2. [Rule 1 - Test fixture] Fake Stripe missing `client_secret`**
- **Found during:** GREEN run
- **Issue:** The net-new embedded assertion failed because the fake `checkout.sessions.create` did not return a `client_secret`, so `clientSecret` was undefined.
- **Fix:** Added `client_secret` to the fake session result (fixture completeness, not a code change).
- **Commit:** `1aeef2f`

## Success Criteria

- PRICE-03 (backend): Pro→Elite swaps the existing subscription in place; Free→Pro / Free→Elite keep the embedded session; tier + merit reset happen via the existing webhook; no second subscription is created for an existing subscriber. — MET (asserted by edge tests).

## Self-Check: PASSED
- supabase/functions/create-checkout-session/index.ts — FOUND
- supabase/functions/create-checkout-session/index.test.ts — FOUND
- Commit 294f628 — FOUND
- Commit 1aeef2f — FOUND
