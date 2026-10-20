# Phase 8: Paddle Retirement - Research

**Researched:** 2026-07-09
**Status:** Ready for planning
**Mode:** Manual fallback after `gsd-sdk` stale-cache failure and `gsd-phase-researcher` unsupported-model failure

## RESEARCH COMPLETE

## Executive Summary

Phase 8 should be planned as a gated billing-retirement sequence, not a direct deletion pass. The live repo still has a Paddle function registration, a Paddle webhook function, a replay-window test in the Edge test gate, generated Supabase types for `paddle_webhook_events` and `profiles.paddle_*`, public/admin copy that names Paddle as the current processor, and deployment docs that describe the retired Paddle secret. Prior Phase 2 evidence says `PADDLE_WEBHOOK_SECRET` was unset and there were zero in-flight Paddle subscriptions, but the Phase 8 context correctly treats that evidence as stale for destructive work.

The safest plan split is:

1. Gate and rollback package: re-run prod app-state evidence, collect authoritative Paddle dashboard/export evidence, compare both, preserve only redacted evidence, and prepare reversible SQL plus deploy rollback instructions.
2. Conditional cleanup: if the gate is clear, remove all live Paddle code/config/schema/types/docs/tests/copy. If not clear, do only safe-prep and document the blocker.
3. Invariant verification: prove there is no live Paddle dependency and Stripe subscription, portal, tier access, and Merit behavior still work.

## Current Live Paddle Surface

### Code and config

- `supabase/config.toml` still registers `[functions.paddle-webhook]` with `verify_jwt = false`.
- `scripts/deploy.ps1` still includes `"paddle-webhook"` in the deployment function list.
- `supabase/functions/paddle-webhook/index.ts` still implements Paddle HMAC verification, replay-window checking, idempotent `paddle_webhook_events` writes, and profile updates through `paddle_customer_id`, `paddle_subscription_id`, and `paddle_price_id`.
- `supabase/functions/paddle-webhook/replay-window.test.ts` is still present and registered in `supabase/functions/deno.json` `test:ci`.
- `supabase/functions/_shared/auth.ts` still comments that `type: 'webhook'` is for Paddle HMAC handled in `paddle-webhook`.

### Database and generated types

- `supabase/migrations/20260122225033_1d494822-3e8b-4d51-bd74-993a4795241a.sql` introduced `profiles.paddle_customer_id`, `profiles.paddle_subscription_id`, `profiles.paddle_price_id`, `profiles.current_period_end`, `profiles.subscription_status`, and `paddle_webhook_events`.
- Phase 8 decisions keep provider-neutral `profiles.current_period_end`, `subscription_status`, and `subscription_tier`; only Paddle identifiers and `paddle_webhook_events` are removal targets.
- `src/integrations/supabase/types.ts` still contains `paddle_webhook_events` and the three `profiles.paddle_*` fields.

### User/admin docs and copy

- `src/pages/Profile.tsx` stores Paddle IDs in local profile state even though the rendered billing UI routes to `/pricing`.
- `src/pages/Refund.tsx` says Strivo uses Paddle as authorized reseller / merchant of record and that Paddle handles refunds.
- `supabase/functions/send-notification-email/index.ts` defaults upgrade-request `payment_method` to `"Paddle"` and says payment was processed via Paddle.
- `supabase/functions/notify-upgrade-request/index.ts` says payment was processed via Paddle.
- `supabase/functions/notify-admin-activity/index.ts` defaults upgrade request payment method to `"Paddle"`.
- `.env.example` and `docs/ENVIRONMENT.md` already describe `PADDLE_WEBHOOK_SECRET` as retired/unset, but they still name the old function/config surface and say to restore it if in-flight subscriptions exist.

### Stripe and billing surfaces that must remain untouched

- `supabase/functions/stripe-webhook-handler/index.ts` is the live webhook handler.
- `supabase/functions/stripe-webhook/index.ts` is a legacy Stripe 410 shim. Phase 8 context explicitly rejects copying this shim for Paddle if the gate clears.
- `supabase/functions/create-checkout-session/index.ts`, `create-stripe-portal/index.ts`, and `create-payment-intent/index.ts` are the smoke targets for subscriptions, portal, and Merit shop/payment behavior.
- `supabase/functions/_shared/price-resolver.ts` and `_shared/merit-gateway.ts` are billing invariants and should not be refactored as part of Paddle cleanup.

## Gate Evidence Standard

The phase must not remove Paddle based only on repo evidence. Required execution-time evidence:

- Fresh prod app-state read against `zjpjapgraoxdukdvpjes` listing counts and redacted identifiers for all rows with any `paddle_*` field, Paddle-like `subscription_status`, or future `current_period_end` associated with a Paddle ID.
- Authoritative Paddle dashboard/export evidence from the operator for subscriptions/customers/history relevant to the old Paddle account.
- A comparison table showing clear/blocked/disagreeing status.
- A proof that generic access fields (`subscription_tier`, `subscription_status`, `current_period_end`) preserve access before and after the proposed migration.
- Evidence stored in planning artifacts must be redacted: counts, timestamps, query/export provenance, and non-reversible hashes or short suffixes only. No raw exports, customer emails, webhook payloads, secrets, or full external IDs.

If prod app records and Paddle evidence disagree, the plan must stop destructive removal and record a blocker. If the gate is not clear, safe-prep may still update neutral copy and draft migrations, but it must not drop columns/table or remove the only webhook path.

## Recommended Plan Split

### 08-01 - Expiration Gate and Rollback Package

Purpose: satisfy PADL-01 before any deletion. Build `08-PADDLE-GATE.md` and `08-PADDLE-ROLLBACK.md`, with preview/prod evidence procedure and rollback SQL/deploy instructions.

### 08-02 - Conditional Removal or Safe-Prep

Purpose: satisfy PADL-02 and PADL-04 depending on the gate. Clear gate removes live Paddle function/config/schema/types/tests/docs/copy; blocked gate writes `08-PADDLE-BLOCKER.md` and performs safe-prep only.

### 08-03 - Post-Removal Invariants and Billing Regression

Purpose: satisfy PADL-03 and Phase 8 completion evidence. Run no-live-Paddle static guard, Stripe/access/Merit smokes, preview-to-prod ceremony, and final verification.

## Risks and Mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Removing Paddle while an old subscription still grants access | Hard gate using both app DB and authoritative Paddle evidence; disagreement blocks removal |
| Losing legally useful billing history | Preserve provider-neutral access fields; allow external operator archive outside repo; do not commit raw exports |
| Dropping generic access fields accidentally | Migration must drop only Paddle IDs/table; tests assert `subscription_tier`, `subscription_status`, `current_period_end` remain |
| Generated types drift | Regenerate `src/integrations/supabase/types.ts` after preview schema changes; negative guard fails if `paddle_*` remains |
| Deployed endpoint remains active | Remove config entry and deploy-list entry; verify no public function deploy remains |
| Stripe billing regression | Run focused Stripe subscription, portal, webhook, tier-access, and Merit tests after cleanup |

## Verification Commands

- `rg -n "paddle_customer_id|paddle_subscription_id|paddle_price_id|paddle_webhook_events|PADDLE_WEBHOOK_SECRET|paddle-webhook|Paddle|paddle" src supabase docs scripts .env.example`
- `deno.cmd test --allow-all --no-check supabase/functions/_shared/no-paddle-live-surface.test.ts`
- `deno.cmd test --allow-all --no-check supabase/functions/create-checkout-session/index.test.ts supabase/functions/create-stripe-portal/index.test.ts supabase/functions/stripe-webhook-handler/index.test.ts supabase/functions/create-payment-intent/index.test.ts supabase/functions/_shared/merit-gateway.test.ts`
- `npm.cmd run type-check` after generated types update. Existing unrelated Recharts typing debt may still block; if so, record it as unrelated.
- `npm.cmd run verify:baseline` where the environment supports it.

## Rollback Requirements

Rollback artifacts must include SQL to re-add the three `profiles.paddle_*` columns and recreate `paddle_webhook_events`, instructions to restore `supabase/functions/paddle-webhook/`, `[functions.paddle-webhook]`, the deploy-list entry, and `PADDLE_WEBHOOK_SECRET` only if an in-flight Paddle subscription is confirmed, and instructions to regenerate Supabase types after rollback.

## Decision Coverage Map

- D-01..D-04: 08-01 gate evidence.
- D-05..D-09: 08-02 conditional removal/safe-prep.
- D-10..D-12: 08-01 access snapshot and 08-02 schema migration.
- D-13..D-17: 08-02 copy/docs/tests cleanup.
- D-18..D-22: 08-03 operator ceremony, rollback, billing smoke, and negative reference guards.
