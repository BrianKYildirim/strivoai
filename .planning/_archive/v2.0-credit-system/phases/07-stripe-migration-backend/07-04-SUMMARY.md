---
phase: 07-stripe-migration-backend
plan: 04
status: complete
requirements_closed: [STR-01, STR-12]
commits:
  - dd32638 test(07-04) RED suite
  - f39449e feat(07-04) handler implementation
---

# Plan 07-04 Summary — create-checkout-session

## What was built

Stripe Checkout session factory edge function. Accepts `{tier, interval}` from an
authenticated user, resolves the priceId server-side from env vars, lazily creates
a Stripe customer if the user doesn't have one, and returns `{url, id}` for the
frontend to redirect to.

## Files

- `supabase/functions/create-checkout-session/index.ts` — handler (169 lines)
- `supabase/functions/create-checkout-session/index.test.ts` — 12 Deno tests

## Requirements closed

- **STR-01** — checkout session creation with lazy customer creation (D-21)
- **STR-12** — server-side priceId resolution; client-supplied price ids are ignored

## Key decisions honored

- **D-09** error codes: `invalid_tier`, `invalid_interval`, `price_not_configured`
- **D-21** lazy customer creation: read `profiles.stripe_customer_id` first, only
  call `stripe.customers.create({email, metadata:{user_id}})` when null, then
  write the new id back to the profiles row
- **STR-12 contract**: body is read as `{tier, interval}` only — any `priceId`
  field on the body is never referenced
- **Rate limiting**: per-tier hourly window (free 10 / pro 30 / elite 60)
- **CORS**: `handleOptionsRequest({type:'user'})` + `corsHeaders({type:'user'})`
  use APP_URL allowlist (fail-closed per `_shared/cors.ts`)

## Test coverage (12/12 green)

1. STR-12: missing JWT → 401 Unauthorized
2. OPTIONS → 200 with CORS headers
3. GET → 405 method_not_allowed
4. invalid tier → 400 invalid_tier
5. invalid interval → 400 invalid_interval
6. unset STRIPE_PRICE_PRO_MONTHLY → 500 price_not_configured
7. STR-01 lazy create: null customer → customers.create called + write-back
8. STR-01 reuse: existing customer id → customers.create NOT called
9. STR-01 pro/monthly happy path → 200 {url, id}
10. STR-01 elite/annual uses STRIPE_PRICE_ELITE_ANNUAL
11. rate limit → 429 rate_limit_exceeded
12. STR-12 negative: `priceId: 'price_malicious'` in body is ignored

## Verification gates passed

- `grep -c "STRIPE_PRICE_" index.ts` → 2 (≥1 required)
- `grep -nE "body\?\.priceId|body\.priceId" index.ts` → 0 matches
- No hardcoded `"price_..."` literals in handler
- `deno test` → 12 passed / 0 failed

## Test hooks / DI

Handler signature: `handleCreateCheckoutSession(req, deps?)` where `deps` can
inject `supabase`, `stripe`, `requireAuth`, and `checkRateLimit`. Production
path falls back to real `getServiceClient`, `getStripeClient`,
`requireAuth({type:'user'})`, and `checkRateLimit`. `Deno.serve` wraps the
no-deps path for the function entry point.

## Not in this plan

- Stripe Dashboard product/price configuration (deferred to 07-06 runbook)
- Frontend integration (Phase 08)
