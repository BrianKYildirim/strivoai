---
phase: 07-stripe-migration-backend
plan: 05
status: complete
requirements_closed: [STR-05]
commits:
  - bca765c feat(07-05) create-stripe-portal edge function
---

# Plan 07-05 Summary — create-stripe-portal

## What was built

Stripe Customer Portal session factory. Authenticated POST reads the caller's
`profiles.stripe_customer_id`, creates a billingPortal session, and returns
`{url}`. Phase 08 frontend hits this from the billing management UI.

## Files

- `supabase/functions/create-stripe-portal/index.ts` (100 lines)
- `supabase/functions/create-stripe-portal/index.test.ts` (6 Deno tests)

## Requirements closed

- **STR-05** — Customer Portal session creation with cross-user isolation

## Key decisions honored

- **D-23** — 400 `no_customer` when `profiles.stripe_customer_id` is null
- **Cross-user isolation** — profile lookup keyed ONLY by `ctx.userId` from
  `requireAuth`; no query param, no body value. Structurally impossible to
  create a portal for another user's customer id.
- **return_url** — `${APP_URL}/billing` with trailing slash normalized
- **CORS** — `{type: 'user'}` uses APP_URL allowlist (fail-closed)

## Test coverage (6/6 green)

1. Missing JWT → 401 Unauthorized (Stripe not called)
2. OPTIONS → 200 with `Access-Control-Allow-Origin: APP_URL`
3. GET → 405 method_not_allowed
4. D-23: null stripe_customer_id → 400 `no_customer` (Stripe not called)
5. STR-05 happy path → 200 with `{url}`, billingPortal called with correct
   `{customer, return_url}`
6. Cross-user isolation — user A's JWT queries profiles.id=uA and produces
   session for cus_for_A only; separate call with user B's JWT produces
   session for cus_for_B. Both flows keyed strictly by `ctx.userId`.

## Verification gates passed

- `grep -c "billingPortal.sessions.create"` → 1
- `grep -c "no_customer"` → 2 (error return + comment)
- No hardcoded `cus_...` customer id literals in handler
- `deno test` → 6 passed / 0 failed

## Test hooks / DI

Handler signature: `handleCreateStripePortal(req, deps?)` where `deps` can
inject `supabase`, `stripe`, and `requireAuth`. Production path uses real
`getServiceClient`, `getStripeClient`, `requireAuth({type:'user'})`.

## Not in this plan

- Stripe Dashboard Customer Portal configuration (deferred to 07-06 runbook)
- Frontend billing management UI (Phase 08)
