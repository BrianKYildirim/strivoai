---
phase: 07-stripe-migration-backend
plan: 01
subsystem: payments
tags: [stripe, billing, test-infrastructure, shared, deno]

requires:
  - phase: 07-stripe-migration-backend
    provides: Phase-level RESEARCH and CONTEXT (pinned Stripe SDK version, decision log D-08/D-10/D-18)
provides:
  - Shared Stripe SDK client singleton (`getStripeClient`, `getStripeCryptoProvider`) pinned to apiVersion 2024-11-20
  - Price → tier reverse-map resolver (`resolveTier`, `resolvePriceId`, `buildPriceMap`) driven entirely by env vars
  - Deno-compatible webhook signing helper (`signStripePayload`) that works around supabase#26126
  - Event fixture builders for the 4 handled Stripe webhook event types
affects: [07-03-stripe-webhook, 07-04-create-checkout-session, 07-05-create-stripe-portal]

tech-stack:
  added:
    - "stripe@14?target=denonext (esm.sh import)"
  patterns:
    - "Module-level singleton with lazy env read and fail-fast error"
    - "Env-only price map (no hardcoded price_* literals) for STR-12 compliance"
    - "Custom HMAC-SHA256 signing helper for test-mode webhook payloads"

key-files:
  created:
    - supabase/functions/_shared/stripe-client.ts
    - supabase/functions/_shared/stripe-client.test.ts
    - supabase/functions/_shared/test-helpers/stripe-signature.ts
    - supabase/functions/_shared/test-helpers/stripe-fixtures.ts
    - supabase/functions/stripe-webhook/price-resolver.ts
    - supabase/functions/stripe-webhook/price-resolver.test.ts
  modified: []

key-decisions:
  - "Pinned Stripe SDK via esm.sh/stripe@14?target=denonext and apiVersion 2024-11-20 (D-18)"
  - "Built price map lazily inside resolveTier so tests can mutate env without module reload"
  - "Used custom crypto.subtle HMAC helper instead of Stripe.generateTestHeaderString (broken on Deno edge)"

patterns-established:
  - "Shared singleton pattern: lazy env read + fail-fast in supabase/functions/_shared/*"
  - "Price resolver: reverse map built from 4 fixed STRIPE_PRICE_* env vars, unknown ids fail-open to 'free' with warn log"

requirements-completed: [STR-04, STR-12]

duration: ~25min
completed: 2026-04-13
---

# Phase 07-01: Wave 0 Stripe Test Infrastructure Summary

**Shared Stripe SDK singleton, env-driven price-tier resolver, and Deno-compatible webhook signing helper + event fixtures — ready for Wave 2 edge functions to consume.**

## Performance

- **Duration:** ~25 min (across 3 commits)
- **Completed:** 2026-04-13
- **Tasks:** 3
- **Files created:** 6

## Accomplishments
- `getStripeClient()` / `getStripeCryptoProvider()` singletons pinned to `apiVersion: '2024-11-20'` with fail-fast on missing `STRIPE_SECRET_KEY`
- `resolveTier` / `resolvePriceId` / `buildPriceMap` helpers driven entirely by `STRIPE_PRICE_*` env vars (no hardcoded price literals — STR-12 compliant)
- `signStripePayload` async helper producing valid `t=<unix>,v1=<hex>` headers via `crypto.subtle.sign` (workaround for supabase#26126)
- 4 event fixture builders covering `customer.subscription.{created,updated,deleted}` and `invoice.payment_failed`
- 14/14 unit tests green (`deno test` across stripe-client.test.ts and price-resolver.test.ts)
- `deno check` passes on both test-helper files

## Task Commits

1. **Task 1: Shared Stripe client singleton + unit tests** - `83eb019` (feat)
2. **Task 2: Price-resolver helpers + 9 unit tests (STR-04, STR-12)** - `123a064` (feat)
3. **Task 3: signStripePayload + event fixture builders** - `ba41ee0` (feat)

## Files Created/Modified
- `supabase/functions/_shared/stripe-client.ts` — Stripe SDK singleton + crypto provider
- `supabase/functions/_shared/stripe-client.test.ts` — 4 unit tests (missing-key, instance, singleton, crypto provider)
- `supabase/functions/_shared/test-helpers/stripe-signature.ts` — HMAC-SHA256 test payload signer
- `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` — 4 event builders for handled webhook types
- `supabase/functions/stripe-webhook/price-resolver.ts` — env-driven reverse/forward price maps
- `supabase/functions/stripe-webhook/price-resolver.test.ts` — 10 unit tests covering STR-04 + STR-12

## Decisions Made
- Stripe SDK pin: `esm.sh/stripe@14?target=denonext` + `apiVersion: '2024-11-20'` per RESEARCH §Standard Stack / D-18. No `npm:stripe`.
- Price map built lazily inside `resolveTier` (not at module load) so tests can `Deno.env.set` per-case without dynamic import cache busting.
- `signStripePayload` implemented manually with `crypto.subtle` because `Stripe.generateTestHeaderString` is broken on Deno edge runtime.

## Deviations from Plan
None - plan executed as specified across three atomic commits.

## Issues Encountered
None.

## User Setup Required
None in this plan. The `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` secrets will be added as part of Plan 07-06 (deploy runbook).

## Next Phase Readiness
- Wave 1 Plan 07-02 (DB migration) is independent and can proceed.
- Wave 2 plans 07-03/04/05 can now import `getStripeClient`, `resolveTier`, `resolvePriceId`, and the test helpers without re-solving SDK pinning or signing.

---
*Phase: 07-stripe-migration-backend*
*Completed: 2026-04-13*
