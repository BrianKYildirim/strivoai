---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
plan: 04
subsystem: pricing-billing-routes
tags: [billing, stripe-portal, conditional-ui, regression-test, tdd]
requires:
  - "Plan 01: create-stripe-portal return_url → /settings/billing (live route); Billing.tsx spinner hardening + .maybeSingle()"
  - "create-stripe-portal edge function resolves customer server-side from ctx.userId"
provides:
  - "Conditional Manage Subscription portal button in CurrentPlanCard (Stripe customers only)"
  - "Free / no-customer users → /pricing Upgrade link instead of a 400ing button"
  - "Paddle-legacy users → clear note, no portal button"
  - "no_customer error degrades to Upgrade link, never a raw error toast (D-05)"
  - "Billing.test.tsx PRICE-05 regression coverage (4 new cases, 9 total green)"
affects:
  - "src/pages/Settings/Billing.tsx"
  - "src/pages/Settings/Billing.test.tsx"
tech-stack:
  added: []
  patterns:
    - "Conditional CTA gated on profile.stripe_customer_id presence"
    - "supabase.functions.invoke('create-stripe-portal') → window.location.href = data.url"
    - "Client-side graceful degradation flag (portalUnavailable) instead of error toast on no_customer"
key-files:
  created: []
  modified:
    - src/pages/Settings/Billing.tsx
    - src/pages/Settings/Billing.test.tsx
decisions:
  - "Free users keep the existing in-message 'Upgrade to Pro' link; the bottom-row Upgrade link renders only for paid-but-no-Stripe-customer (no_customer fallback) to avoid a duplicate /upgrade affordance."
  - "no_customer / invoke error sets a local portalUnavailable flag that flips the button to the Upgrade link in place — no toast, per CLAUDE.md operationally-useful-errors rule (D-05)."
metrics:
  duration: ~10m
  completed: 2026-05-21
  tasks: 1
  files: 2
---

# Phase 33 Plan 04: Conditional Manage Subscription on /settings/billing Summary

Wired PRICE-05 (D-05) into `CurrentPlanCard`: a real Stripe customer portal button for Stripe customers, the `/pricing` Upgrade link for everyone without a `stripe_customer_id`, and the existing Paddle-legacy note — replacing the wrong "Cancel Subscription → /pricing" dead link. Built test-first; all 9 `Billing.test.tsx` cases (Plan 01 + Plan 04) are green.

## What Was Built

### Task 1 — Conditional Manage Subscription button + tests (TDD: RED 50e3bc5 → GREEN 70c7e10)

- `src/pages/Settings/Billing.tsx`:
  1. Added `stripe_customer_id` to both the `billing-profile` `.select(...)` (the query previously selected `stripe_subscription_id` but not the customer id) and the `ProfileBilling` interface.
  2. In `CurrentPlanCard`, replaced the `isPaid && <Link to="/pricing">Cancel Subscription</Link>` block (which both mislabeled the action and pointed at a non-management route) with a conditional affordance:
     - `hasStripeCustomer` (truthy `stripe_customer_id` AND not in the degraded state) → shadcn `<Button variant="outline">Manage Subscription</Button>`. Its `onClick` calls `supabase.functions.invoke('create-stripe-portal')` and, on `data?.url`, sets `window.location.href = data.url` (RESEARCH Pattern 3). A `portalLoading` flag drives a `<Loader2>` spinner + `disabled` during the in-flight invoke.
     - On `no_customer` / any invoke error → sets `portalUnavailable`, which flips the affordance to the `/pricing` Upgrade link in place (D-05 — no raw error toast).
     - No Stripe customer, not Paddle, paid tier → `/pricing` Upgrade link directly. Free tier is excluded here because the existing free-plan message (`:126`) already renders an "Upgrade to Pro" link to `/pricing`; rendering a second would duplicate the affordance.
  3. The invoke sends no customer id — `create-stripe-portal` resolves the customer server-side from `ctx.userId` (T-33-11, cross-user-safe; unchanged from Plan 01).
  4. Updated the Paddle-legacy note copy to the UI-SPEC string: "Your subscription is managed through our previous billing provider. Contact support to make changes."
- `src/pages/Settings/Billing.test.tsx`: added a `functions.invoke` mock, an `invokeMock`, and a `mockProfile()` helper, plus the four `<behavior>` cases — Stripe customer renders the button and clicking it invokes `create-stripe-portal` and redirects to `data.url`; Free user shows the Upgrade link and no button; Paddle-legacy shows the note and no button; `no_customer` error degrades to the Upgrade link and removes the button.

## Verification

- `npx vitest run src/pages/Settings/Billing.test.tsx` → 9 passed (5 Plan-01 spinner/regression cases + 4 Plan-04 PRICE-05 cases). RED proved the 3 net-new branches failed before the source wiring; GREEN after.
- `npx eslint src/pages/Settings/Billing.tsx src/pages/Settings/Billing.test.tsx` → exit 0, zero errors.
- Acceptance criteria: `stripe_customer_id` present in both select and interface ✓; `create-stripe-portal` invoked only when `stripe_customer_id` present ✓; no "Cancel Subscription → /pricing" link remains ✓; `no_customer`/error renders the Upgrade link, no toast ✓.

## Deviations from Plan

None — plan executed exactly as written. (Two minor test-harness adjustments were made during GREEN, not deviations: the `functions.invoke` mock forwards args via spread so `toHaveBeenCalledWith('create-stripe-portal')` matches, and the Stripe-customer test stubs `window.location.href` because jsdom throws "Not implemented: navigation" on a real assignment.)

## Threat Surface

No new security surface. T-33-11 (server-side customer resolution from `ctx.userId` — the client invoke carries no customer id) and T-33-12 (`stripe_customer_id` read only via the user-scoped `billing-profile` query, used solely as a render condition) are preserved. T-33-13 (Stripe-minted signed portal `data.url`) accepted as in the threat register. No threat flags raised.

## Known Stubs

None. The button is fully wired to the live `create-stripe-portal` function (no mock/placeholder data path in production code).

## Self-Check: PASSED

- src/pages/Settings/Billing.tsx — FOUND
- src/pages/Settings/Billing.test.tsx — FOUND
- Commit 50e3bc5 (RED) — FOUND
- Commit 70c7e10 (GREEN) — FOUND
