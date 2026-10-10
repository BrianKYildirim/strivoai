# Phase 07: Stripe Migration — Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 07-stripe-migration-backend
**Areas discussed:** Cutover + schema shape, Price ID env layout, Webhook events + idempotency, Stripe SDK vs raw fetch + customer creation

---

## Area Selection

**Question:** Which gray areas do you want to discuss for Phase 7 (Stripe backend)?

| Option | Description | Selected |
|--------|-------------|----------|
| Cutover + schema shape | Coexist with Paddle vs hard cutover; stripe_* alongside vs rename/drop | ✓ |
| Price ID env layout | JSON var, discrete vars, or mapping var; checkout input contract | ✓ |
| Webhook events + idempotency | Event set, idempotency table shape, cancellation behavior | ✓ |
| Stripe SDK vs raw fetch + customer creation | SDK vs raw fetch; customer creation timing | ✓ |

**User's choice:** All four areas selected.

---

## Cutover + Schema Shape

### Q1 — Cutover strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Coexist, Stripe primary (Recommended) | Deploy Stripe functions + schema. Leave paddle-webhook deployed but stop routing traffic. Cleanup after Phase 08. Safe rollback. | ✓ |
| Hard cutover in Phase 7 | Delete paddle-webhook and drop paddle_* columns in same migration | |
| Dual-write both | Both webhooks write the same profile rows during transition | |

**User's choice:** Coexist, Stripe primary.

### Q2 — Schema shape for stripe IDs

| Option | Description | Selected |
|--------|-------------|----------|
| Add stripe_* alongside paddle_* (Recommended) | Additive migration; paddle_* untouched; reuse subscription_status + current_period_end | ✓ |
| Rename paddle_* → stripe_* | Rename columns in-place; destructive, loses Paddle history | |
| Replace with generic provider columns | Provider-agnostic columns with provider='stripe' discriminator | |

**User's choice:** Add stripe_* alongside paddle_*.

---

## Price ID Env Layout

### Q1 — How price IDs are stored

| Option | Description | Selected |
|--------|-------------|----------|
| Four discrete vars (Recommended) | STRIPE_PRICE_PRO_MONTHLY, PRO_ANNUAL, ELITE_MONTHLY, ELITE_ANNUAL | ✓ |
| Single JSON mapping var | STRIPE_PRICE_MAP='{...}' parsed once at boot | |
| Plan-based env + metadata | Read interval from Stripe metadata at runtime | |

**User's choice:** Four discrete vars.

### Q2 — Checkout session input contract

| Option | Description | Selected |
|--------|-------------|----------|
| {tier, interval} (Recommended) | Frontend sends tier + interval; backend resolves price ID | ✓ |
| {priceId} directly | Frontend sends price ID from VITE_ env; leaks IDs to client | |

**User's choice:** {tier, interval}.

---

## Webhook Events + Idempotency

### Q1 — Event set

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly the required 4 (Recommended) | subscription.created/updated/deleted + invoice.payment_failed; unknown events log + 200 | ✓ |
| Required 4 + invoice.paid | Also mark renewals explicitly | |
| Broad coverage | Add checkout.session.completed, trial_will_end, invoice.paid | |

**User's choice:** Exactly the required 4.

### Q2 — Idempotency table shape + cancellation

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror paddle_webhook_events + graceful cancel (Recommended) | event_id PK, event_type, payload, created_at; keep tier until current_period_end | ✓ |
| Mirror shape, immediate downgrade on cancel | Immediately set tier='free' on subscription.deleted | |
| Store full event envelope + last_error | Add processed_at, attempt_count, last_error retry columns | |

**User's choice:** Mirror paddle_webhook_events + graceful cancel.

---

## Stripe SDK vs Raw Fetch + Customer Creation

### Q1 — SDK or raw fetch

| Option | Description | Selected |
|--------|-------------|----------|
| stripe-deno SDK (Recommended) | https://esm.sh/stripe; constructEventAsync for signature verify; checkout + portal session create via SDK | ✓ |
| Raw fetch like paddle-webhook | Hand-rolled HMAC + fetch to api.stripe.com | |
| SDK for API calls, raw for verify | Mixed approach | |

**User's choice:** stripe-deno SDK.

### Q2 — Customer creation timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy on first checkout (Recommended) | Create Stripe customer the first time user hits create-checkout-session; pass user_id in metadata | ✓ |
| At signup (auth hook) | Supabase trigger creates Stripe customer for every user | |
| On first webhook only | Let Stripe Checkout create customer; pick up ID from first webhook | |

**User's choice:** Lazy on first checkout.

---

## Claude's Discretion

- Migration column types (`text` vs `varchar`)
- Logging format / reqId propagation inside Stripe functions
- Whether to extract a shared `resolveTierFromPriceId` helper
- Error response body shape for checkout/portal functions
- Rate-limit threshold on `create-checkout-session`

## Deferred Ideas

- Additional webhook events (`invoice.paid`, `checkout.session.completed`, `customer.subscription.trial_will_end`)
- Retry observability columns (`processed_at`, `attempt_count`, `last_error`)
- Paddle removal (delete `paddle-webhook`, drop `paddle_*` columns) — post-Phase-08 cleanup phase
- Generic provider columns refactor
- Trial periods, promo codes, coupons
- Stripe Tax / VAT handling
