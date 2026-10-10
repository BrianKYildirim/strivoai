---
phase: 33-pricing-checkout-billing-routes-strivo-design-unification
plan: 01
subsystem: pricing-billing-routes
tags: [routing, billing, stripe-portal, regression-test, tdd]
requires:
  - "React Router /auth + /settings/billing routes (App.tsx) already registered"
  - "useMerits.ts maybeSingle convention as reference pattern"
provides:
  - "Free CTA on /pricing → /auth (live route)"
  - "create-stripe-portal return_url → /settings/billing (live route)"
  - "Billing.tsx never hangs on spinner for null session or missing profiles row"
  - "Billing.test.tsx regression coverage for the spinner-hang failure modes"
affects:
  - "src/pages/Pricing.tsx"
  - "src/pages/Settings/Billing.tsx"
  - "src/pages/Settings/Billing.test.tsx"
  - "supabase/functions/create-stripe-portal/index.ts"
tech-stack:
  added: []
  patterns:
    - ".maybeSingle() for race-safe single-row reads that may legitimately return no row"
    - "Explicit null-userId render branch before loading guard to avoid enabled:!!userId spinner deadlock"
    - "Query-layer .eq('user_id', userId) as defense-in-depth alongside RLS"
key-files:
  created: []
  modified:
    - src/pages/Pricing.tsx
    - src/pages/Settings/Billing.tsx
    - src/pages/Settings/Billing.test.tsx
    - supabase/functions/create-stripe-portal/index.ts
decisions:
  - "Distinguished 'auth still loading' from 'auth resolved to null' via userLoading flag so the null-userId error branch does not flash during initial load."
metrics:
  duration: ~15m
  completed: 2026-05-21
  tasks: 2
  files: 4
---

# Phase 33 Plan 01: Pricing/Billing Route Dead-Link Fixes Summary

Landed three decided, low-risk route/spinner fixes — Free CTA route string (PRICE-02), Billing infinite-spinner hardening with regression tests (PRICE-04 / TEST-08), and the Stripe portal `return_url` dead-route correction (D-06, supports PRICE-05) — without touching the checkout-modal or restyle work reserved for later plans.

## What Was Built

### Task 1 — Free CTA + portal return_url dead routes (commit 6f333da)
- `src/pages/Pricing.tsx`: `handleTierCta` free branch changed `navigate('/auth/signup')` → `navigate('/auth')`. `/auth/signup` is not a registered route; `/auth` is. The paid-tier `navigate('/checkout?...')` line was left untouched (Plan 03's scope).
- `supabase/functions/create-stripe-portal/index.ts`: session `return_url` changed from `${appUrl}/billing` (falls through to `<NotFound />`) to `${appUrl}/settings/billing`. Docstring invariant at the file header updated to match. The `ctx.userId`-keyed customer lookup and `no_customer` 400 branch were preserved exactly (T-33-01 security invariant — no client-supplied customer access; return_url remains a static first-party literal, no open-redirect surface).

### Task 2 — Billing infinite-spinner fix + regression tests (TDD: RED ac86903 → GREEN d304123)
- `src/pages/Settings/Billing.tsx`:
  1. `billing-profile` query `.single()` → `.maybeSingle()` so a missing `profiles` row (fresh signup, auth-trigger race) returns `data:null` instead of throwing PGRST116 (mirrors `useMerits.ts:59`). Return type widened to `ProfileBilling | null` — `CurrentPlanCard` already accepted `null`.
  2. Added an explicit `!userLoading && !userId` render branch BEFORE the `profileLoading` spinner guard. Because the profile/purchase queries are `enabled: !!userId`, a stale/expired session (userId resolves to null) would otherwise leave `profileLoading` permanently true and the page stuck on `<Loader2>`. The new branch renders the copy "We couldn't load your billing details. Please sign in again." with a Sign-in button to `/auth`.
  3. Added `.eq('user_id', userId!)` to the `merit_shop_purchases` query for defense-in-depth alongside RLS (T-33-02).
- `src/pages/Settings/Billing.test.tsx`: added `maybeSingle` to the mock `from()` chain and three regression cases — null userId renders the explicit error (no `.animate-spin`), missing profiles row renders the plan card without hanging, and an existing profile row still renders normally (no regression). All 5 tests pass.

## Verification

- `npx vitest run src/pages/Settings/Billing.test.tsx` → 5 passed (RED proved the null-userId case failed before the fix; GREEN after).
- `npx eslint` on all four modified files → zero new errors. (`create-stripe-portal/index.ts` retains one pre-existing `no-explicit-any` on the `SupabaseLike` test-hook type at line 29, untouched by this plan and outside scope.)
- Source assertions confirmed by grep: `navigate('/auth')` present and `navigate('/auth/signup')` gone; `return_url` contains `/settings/billing` with no bare `${appUrl}/billing`; `.maybeSingle()` present and `.single()` gone from the billing-profile query; error copy present; `.eq('user_id', userId!)` present on the purchases query.

## Deviations from Plan

None — plan executed exactly as written.

## Lint Scope Note

`npm run lint` (whole repo) reports 803 pre-existing errors across unrelated files (supabase edge functions, `tailwind.config.ts`, etc.). These predate this plan and are out of scope per the executor scope boundary. The four files this plan modified introduce zero new lint errors.

## Threat Surface

No new security surface introduced. T-33-01 (server-side customer lookup) and T-33-03 (static first-party return_url) preserved; T-33-02 (user-scoped purchases query) implemented as planned.
