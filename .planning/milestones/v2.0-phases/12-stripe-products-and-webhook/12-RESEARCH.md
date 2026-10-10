# Phase 12: stripe-products-and-webhook - Research

**Researched:** 2026-04-14
**Domain:** Stripe payments (subscriptions + one-time) on Supabase Edge Functions (Deno)
**Confidence:** HIGH (canonical Phase 07 code is the structural template; pg_cron + pg_net already enabled in this project; Stripe SDK pin and patterns are locked)

## Summary

Phase 12 builds on a fully working Phase 07 Stripe foundation. The Phase 07 `stripe-webhook` handler at `supabase/functions/stripe-webhook/index.ts` is a 240-line, well-instrumented reference implementation: raw-body-before-parse, SDK-only signature verification via `constructEventAsync`, insert-first idempotency on `stripe_webhook_events` with 23505-catch, profile fallback chain (`stripe_customer_id` -> `stripe_subscription_id` -> `email`), graceful cancel preserving tier, and a fake-injectable `deps` parameter for unit tests. Phase 12's `stripe-webhook-handler` reimplements this shape and extends it with Merit grant/credit/upgrade-diff routing.

`create-checkout-session` is similarly tidy and currently subscription-only. Extending it for `mode: 'payment'` is a small, mode-discriminated change. The shop-pack SHOP-12 rate limit slots cleanly into the existing `_shared/rate-limiter.ts` (Postgres fixed-window, fail-open, `increment_rate_limit` RPC).

pg_cron and pg_net are confirmed already enabled in this project (used by `20260310000000_add_keep_warm_cron.sql`). Phase 12's migration adds `cron.schedule(...)` to invoke the new `reset-subscription-merits` edge function via `net.http_post`, identical pattern to keep-warm.

**Critical Phase 11 contract gap:** Phase 11 D-13 sets `reset_subscription_merits(user_id, tier, next_reset_date)` as a **3-arg** dumb setter — the caller (Phase 12) supplies the next reset date. CONTEXT.md D-15/D-25 implicitly assume this. **Phase 11 does NOT define `grant_upgrade_diff`**. Phase 12 D-13 explicitly notes this as a Phase 11 contract ask that has not been added to Phase 11's CONTEXT.md. This must be flagged to the user before Phase 11 plan-locks.

**Primary recommendation:** Build `stripe-webhook-handler` as a near-copy of `stripe-webhook/index.ts` with an extended `HANDLED_EVENTS` set and a per-event router. Reuse `_shared/stripe-client.ts`, `_shared/rate-limiter.ts`, `price-resolver.ts` (promote to `_shared/` so `create-checkout-session` and the new handler both import it). Keep `create-checkout-session` as a single function with a discriminated `mode` input. Provision shop products + the `agk02110` coupon via an idempotent `scripts/provision-stripe-products.mjs` using the Stripe Node SDK with caller-supplied IDs.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Yearly Merit grant mechanism**
- **D-01** Hybrid: `checkout.session.completed` (subscription mode) grants month-0 immediately via RPC; nightly `pg_cron` sweeps yearly + monthly subs whose `next_reset_date <= now()`.
- **D-02** `pg_cron` enabled in this phase's migration via `CREATE EXTENSION IF NOT EXISTS pg_cron`. Migration safe to re-run.
- **D-03** pg_cron invokes `reset-subscription-merits` via `pg_net.http_post`; edge function batches up to 1000 due users per call.
- **D-04** Phase 10 `subscription_reset_date` semantics carry forward: NULL = Free (skip), non-NULL = active. Yearly invariant: `next_reset_date` advances by 1 month per grant, never a year.
- **D-05** Sweep idempotency: `reset_subscription_merits` is atomic and a no-op if `next_reset_date > now()`.

**Webhook handler structure**
- **D-06** New edge function `supabase/functions/stripe-webhook-handler/`. Phase 07 `stripe-webhook` stays deployed but receives no traffic.
- **D-07** Stripe dashboard endpoint URL swaps once at deploy; new handler reimplements 100% of Phase 07 behavior + Phase 12 events.
- **D-08** `HANDLED_EVENTS`: `customer.subscription.created|updated|deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.completed`. (`invoice.payment_succeeded` is a NO-OP for yearly subs — pg_cron owns monthly refills.)
- **D-09** Signature verification reuses Phase 07's pattern exactly: `stripe.webhooks.constructEventAsync` on raw `req.text()` before any parse, via `_shared/stripe-client.ts`. Never hand-rolled.
- **D-10** Idempotency: reuse `stripe_webhook_events` table (Stripe event IDs are globally unique). Insert-first + 23505 catch -> 200 duplicate.
- **D-11** Profile fallback chain unchanged. For `checkout.session.completed`, add `session.metadata.user_id` as the **first-tried** key.
- **D-12** Out-of-order tolerance (NFR-07): missing referenced state -> 200 + `profile-not-found` log, never 5xx.

**Upgrade differential + backfill**
- **D-13** New RPC `grant_upgrade_diff(user_id, from_tier, to_tier)` in Phase 11 (Phase 12 consumes). **Phase 11 contract ask — currently NOT in Phase 11 CONTEXT.md.**
- **D-14** SUB-15 downgrades take effect at period end via new `pending_downgrade_tier` column (additive); shop Merits never touched.
- **D-15** MIG-03 one-shot backfill is a PL/pgSQL DO block in the Phase 12 migration that calls `reset_subscription_merits` per active sub and writes `merit_transactions` rows with `source = 'phase-12-backfill'`. Migration ordering: Phase 11 timestamp must precede Phase 12.

**Shop checkout + promo**
- **D-16** Shop crediting fires on `checkout.session.completed` with `mode: 'payment'` only. No `payment_intent.succeeded` handling.
- **D-17** Two-layer idempotency: `stripe_webhook_events.event_id` unique + `merit_shop_purchases.stripe_payment_intent_id` unique.
- **D-18** `create-checkout-session` extended to `{ mode: 'subscription', tier, interval } | { mode: 'payment', pack_size }`. `pack_size in (3, 10, 25, 50)` allowlist. Frontend never handles Price IDs.
- **D-19** SHOP-12 rate limit (10 shop / user / hour) enforced in `create-checkout-session` only, via `_shared/rate-limiter.ts`. Webhook honors any valid PI.
- **D-20** Promo coupon `agk02110` provisioned via idempotent `scripts/provision-stripe-coupon.mjs` keyed by coupon `id`. Re-runnable. Attached to subscription Prices via `applies_to.products`. Shop Prices do NOT accept the promo.
- **D-21** SHOP-08 email receipt deferred to Phase 20.

**Price object creation**
- **D-22** 4 subscription Price objects already shipped in Phase 07; verify amounts match spec ($8.99/$89.99/$16.99/$169.99) and add idempotent provisioning script for greenfield envs.
- **D-23** 4 shop Prices provisioned by `scripts/provision-stripe-products.mjs`. Writes Price IDs to expected env var names.
- **D-24** SHOP-03 "Most Popular" is UI concern (Phase 20). Script does not set Stripe-side flag.

**reset-subscription-merits edge function**
- **D-25** New `supabase/functions/reset-subscription-merits/`. Internal-secret auth. Body: `{ invocation_source: 'pg_cron' | 'webhook' }`. Loops up to 1000 due users; returns `{ processed, remaining }`.
- **D-26** Structured `createLogger('reset-subscription-merits', reqId)` per user + aggregate.

### Claude's Discretion

- pg_cron tick frequency (recommended every 15 minutes).
- `pending_downgrade_tier` as new column on `profiles` (recommended) vs new `subscription_pending_changes` table.
- Reuse `stripe_webhook_events` (recommended) vs new `stripe_webhook_v2_events`.
- Single `create-checkout-session` with discriminated mode (recommended) vs split functions.
- Provisioning script language: `.mjs` (recommended).
- Backfill block placement: AFTER trigger creation in migration.
- `cancel_at_period_end=true` -> treat as downgrade-to-Free at period end (recommended yes).
- Whether Deno-side helper is needed for pg_net calls (usually no — pg_net handles it server-side).

### Deferred Ideas (OUT OF SCOPE)

- SHOP-08 email receipt (Phase 20).
- Additional Stripe events (`invoice.paid`, `customer.subscription.trial_will_end`, `payment_intent.payment_failed`).
- Stripe Subscription Schedules for native yearly monthly grants (rejected in favor of pg_cron).
- Deletion of Phase 07 `stripe-webhook` (Phase 21 cleanup).
- Merit grant observability dashboard (Phase 13).
- Pro-rated Merit grants on mid-cycle upgrades — Phase 12 grants full 75/150, NOT prorated. **If spec §3.4 requires literal proration, add a Phase 11 contract ask.**
- Stripe Tax / VAT, multi-currency, Merit gifting/admin grants.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01..04 | Stripe Price objects (4 sub plans, exact amounts) | Phase 07 already shipped via `STRIPE_PRICE_PRO_MONTHLY/ANNUAL`/`ELITE_*` env vars (`stripe-webhook/price-resolver.ts:30-34`). Provisioning script extends to be greenfield-safe. |
| SUB-05 | Checkout Sessions for sub creation -> `/billing/success` redirect | `create-checkout-session/index.ts:148-156` already creates `mode: 'subscription'` sessions with success/cancel URLs based on `APP_URL`. |
| SUB-06 | Customer Portal wired | Existing `supabase/functions/create-stripe-portal/` (Phase 07). No Phase 12 change needed beyond verifying. |
| SUB-07 | `checkout.session.completed` (sub mode) -> set tier + credit initial 75/150 + stamp `subscription_reset_date` | New event handler routes to `reset_subscription_merits(user_id, tier, now() + interval '1 month')` per D-01. Reads `session.metadata.user_id` (set at session creation by `create-checkout-session/index.ts:155`) as primary key per D-11. |
| SUB-08 | `invoice.payment_succeeded` -> `reset_subscription_merits` | For monthly subs only. Yearly: NO-OP (D-08); pg_cron handles. Detect interval via Stripe subscription `items.data[0].plan.interval` or by reading `current_profile.stripe_price_id` and using `resolveTier` extension (`isYearly`). |
| SUB-09 | `customer.subscription.updated|deleted` -> downgrades, cancellations, renewals | `deleted` reuses Phase 07 D-14 graceful cancel (`stripe-webhook/index.ts:176-180`). `updated` adds tier-change detection per D-13/D-14. |
| SUB-10 | `invoice.payment_failed` -> dunning state | Phase 07 D-15 path reused verbatim (`stripe-webhook/index.ts:140-151`). |
| SUB-11, SUB-12, NFR-08 | Yearly monthly grant cadence | Hybrid model D-01: webhook for month-0, pg_cron sweep for months 1+. |
| SUB-13 | Free -> Pro/Elite immediate + Merits | Handled in `customer.subscription.created` event by calling `reset_subscription_merits`. Pro-ration deferred (see Deferred Ideas). |
| SUB-14 | Pro -> Elite credits difference | New RPC `grant_upgrade_diff` (Phase 11 ask). |
| SUB-15 | Elite -> Pro / -> Free at period end | New `profiles.pending_downgrade_tier` column (D-14 additive). |
| SHOP-01..04 | 4 shop Price objects (3/$1.99, 10/$4.99, 25/$9.99, 50/$17.99) | Provisioned via new `scripts/provision-stripe-products.mjs` (D-23). |
| SHOP-06 | Webhook validates payment + calls `credit_shop_merits` | New `checkout.session.completed` (`mode: 'payment'`) router calls Phase 11's `credit_shop_merits(user_id, pack_size, payment_intent_id)`. |
| SHOP-07 | < 2 sec end-to-end shop credit | Single RPC call inside the webhook handler. Edge function cold-start dominates; `keep-warm` cron (existing) keeps it warm. |
| SHOP-09 | Duplicate PI rejection | Layer 2 of D-17: `merit_shop_purchases.stripe_payment_intent_id` UNIQUE (Phase 10 schema). |
| SHOP-11 | Shop Merits survive downgrade | Reset RPC writes only `subscription_balance` (Phase 11 D-15). |
| SHOP-12 | 10 shop purchases / user / hour | `_shared/rate-limiter.ts:80-113` invoked in `create-checkout-session` shop-mode branch. |
| BACK-02 | `credit-shop-merits` capability | Implemented as a router branch inside `stripe-webhook-handler`, not a standalone function. (Spec text "new edge function" is satisfied by behavior, not literal naming — confirm with planner.) |
| BACK-03 | `reset-subscription-merits` edge function with batching | New function per D-25. |
| BACK-04 | `create-checkout-session` for subs + shop | Existing function extended per D-18. |
| BACK-05 | `stripe-webhook-handler` mandatory sig verification + idempotent | New function per D-06. |
| NFR-04 | Sig verification mandatory; reject unsigned/expired | SDK `constructEventAsync` enforces tolerance window automatically. |
| NFR-06 | Idempotent on event id | Insert-first + 23505 catch (Phase 07 D-13). |
| NFR-07 | Tolerates out-of-order delivery | Missing-state events return 200 + log (D-12). |
| MIG-03 | Pre-existing active subs backfilled | DO block in Phase 12 migration (D-15). |
| MIG-06 | Promo `agk02110` preserved | Idempotent provisioning script (D-20). |
| TEST-08 | Duplicate webhook test | New Deno test in `stripe-webhook-handler/index.test.ts` mirroring `stripe-webhook/index.test.ts` patterns; assert balance unchanged on second delivery. |

## Project Constraints (from CLAUDE.md)

- **Edge functions live in `supabase/functions/`**; shared utilities in `supabase/functions/_shared/`. Phase 12 honors this.
- **Logging:** structured `createLogger('function-name', reqId?)`; bracket-prefixed for frontend. Never bare `console.log` in production code.
- **Auth:** `_shared/auth.ts` is the only legitimate auth path. Webhook = `--no-verify-jwt` + SDK signature; internal job = `requireInternalOrUserAuth` with `x-internal-job-secret` + `timingSafeEqual`.
- **Secrets** never logged; reason codes only.
- **Never commit `.planning/`** — research files are local only.
- **Additive migrations only**, no DROP/RENAME, RLS enabled with **zero permissive policies** (SEC-06 anti-pattern from Paddle migration).
- **CORS** on user endpoints fail-closed against `APP_URL`. Webhook + internal functions emit no CORS headers.
- **Strict TypeScript** in edge functions. Discriminated unions for fallible operations.
- **Environment secrets** must be set explicitly per environment via `supabase secrets set` — never auto-deployed from `.env`.
- **Reliability over experimental scaling** — keep webhook handler simple and direct; do not add retry loops on top of Stripe's own 72h retry policy.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stripe webhook signature verification | API (Edge Function) | — | Secret lives in Supabase secrets; SDK runs in Deno only. |
| Subscription event routing | API (Edge Function) | Database (RPCs) | Edge function decodes events; Phase 11 RPCs perform balance writes atomically. |
| Merit balance writes | Database (SECURITY DEFINER RPCs) | — | Phase 10 D-17: service role is the only legitimate write path; RLS denies users. |
| Yearly monthly-grant scheduling | Database (pg_cron) | API (reset-subscription-merits edge fn) | Cron lives in Postgres; pg_net.http_post -> edge function batches via RPC. |
| Shop checkout session creation | API (Edge Function) | Database (rate-limit counter) | `create-checkout-session` resolves Price IDs server-side; rate-limiter uses `increment_rate_limit` RPC. |
| Promo coupon provisioning | Provisioning script (Node + Stripe SDK) | Stripe API | One-time deploy step; idempotent via caller-supplied `id`. |
| Backfill of existing subscribers | Database (PL/pgSQL DO block in migration) | — | Runs in same transaction as schema change; calls Phase 11 RPCs. |
| Webhook idempotency | Database (`stripe_webhook_events` UNIQUE PK + Phase 11 PI UNIQUE constraint) | API (insert-first + 23505 catch) | Two-layer defense per D-17. |
| Profile lookup fallback chain | API (Edge Function) | Database (indexed columns) | Phase 07 indexes on `stripe_customer_id`, `stripe_subscription_id`. Phase 12 adds `metadata.user_id` first-try. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Deno) | `https://esm.sh/stripe@14?target=denonext` | Stripe SDK in edge functions | [VERIFIED: `_shared/stripe-client.ts:13`] Project-wide pin. Has `webhooks.constructEventAsync` and `createSubtleCryptoProvider` for Deno-compatible HMAC verification. apiVersion `'2024-11-20'`. Do NOT change without updating Phase 07 research. |
| `stripe` (Node) | `^14.0.0` (recommended for provisioning script) | Stripe SDK in Node provisioning script | [CITED: stripe-node README] Same major as Deno pin for API-shape parity. |
| `@supabase/supabase-js` | `2.81.1` | Service role DB writes | [VERIFIED: package.json] Already used by all edge functions via `_shared/supabase-client.ts`. |
| `pg_cron` | enabled in project | Schedule reset-subscription-merits | [VERIFIED: `20260310000000_add_keep_warm_cron.sql`] Already used for keep-warm. |
| `pg_net` | enabled in project | Postgres -> HTTP for cron-triggered edge function | [VERIFIED: same file uses `net.http_post`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/rate-limiter.ts` | n/a | SHOP-12 enforcement | In `create-checkout-session` shop-mode branch only. |
| `_shared/auth.ts` | n/a | Internal-secret auth on `reset-subscription-merits`; user JWT on `create-checkout-session`; webhook (no JWT) on `stripe-webhook-handler` | Per CONTEXT D-09 / D-25. |
| `_shared/cors.ts` | n/a | `handleOptionsRequest` for `create-checkout-session`; webhook + internal functions emit no CORS headers | Phase 07 invariant. |
| `_shared/logger.ts` | n/a | Structured logging | Every new function. |
| `_shared/test-helpers/stripe-fixtures.ts` | n/a | Generate test webhook event JSON | Reuse for `stripe-webhook-handler` tests; extend with `checkout.session.completed` and `invoice.payment_succeeded` factories. |
| `_shared/test-helpers/stripe-signature.ts` | n/a | Sign payload for tests (Stripe.generateTestHeaderString broken on Deno per `index.test.ts:8`) | Reuse for new handler tests. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg_cron hybrid (D-01) | Pure-webhook via Stripe Subscription Schedules | Schedules require provisioning a synthetic monthly invoice on yearly subs — Stripe-side complexity, no cost saving. CONTEXT explicitly rejects this. |
| pg_cron hybrid | Pure cron (no webhook grant on day 0) | Day-0 UX breaks: user pays, refreshes balance, sees zero Merits until next cron tick. Rejected. |
| Reuse `stripe_webhook_events` (D-10) | New `stripe_webhook_v2_events` table | Stripe event IDs are globally unique per account; reuse is safe and avoids schema sprawl. |
| Single `create-checkout-session` with mode switch (D-18 discretion) | Two functions `create-subscription-checkout` / `create-shop-checkout` | One deploy unit, one rate-limit policy, one auth surface. |
| Inline shop credit branch in `stripe-webhook-handler` | Standalone `credit-shop-merits` edge function | Spec BACK-02 names a function but a router branch satisfies the behavior. Single endpoint = single Stripe webhook to manage. Planner should confirm with user. |

**Installation:** No new npm packages for the runtime. The provisioning script is a one-off Node `.mjs` that uses the global Stripe SDK installed via `npm install --no-save stripe` in CI, or just `npx stripe@14`.

**Version verification:** Stripe SDK v14 is from late 2023 and remains the project pin. Do not bump in this phase. apiVersion `'2024-11-20'` is the contract surface and is locked.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────┐
                        │              Stripe                  │
                        │    (single dashboard endpoint)       │
                        └──────────────┬───────────────────────┘
                                       │ POST + signature
                                       ▼
                  ┌────────────────────────────────────────────┐
                  │       stripe-webhook-handler (NEW)         │
                  │  1. raw req.text() before any parse        │
                  │  2. constructEventAsync (SDK only)         │
                  │  3. HANDLED_EVENTS allowlist short-circuit │
                  │  4. INSERT stripe_webhook_events           │
                  │     (catch 23505 -> 200 duplicate)         │
                  │  5. Route by event.type                    │
                  └────┬───────────────────────────────────────┘
                       │
       ┌───────────────┼──────────────────┬───────────────────┬────────────────┐
       ▼               ▼                  ▼                   ▼                ▼
checkout.session.   customer.sub.    customer.sub.      invoice.payment.  invoice.payment.
completed           created/updated  deleted            succeeded          failed
       │               │                  │                   │                ▼
       │               │                  │                   │       past_due (existing
       │               │                  │                   │        Phase 07 D-15 path)
       │               ▼                  ▼                   │
       │         resolveTier(price)  graceful cancel:         │
       │         + tier change?      status='canceled'        │
       │         + grant_upgrade_diff   only (D-14)           │
       │         + pending_downgrade                          │
       │         (D-13/D-14)                                   │
       │                                                      │
       │                                                      ▼
       ▼                                            monthly sub? -> reset_subscription_merits
mode == 'payment'?                                  yearly  sub? -> NO-OP (cron owns it)
   yes -> credit_shop_merits(user_id, pack_size, payment_intent_id)
   no  -> reset_subscription_merits(user_id, tier, now() + interval '1 month')
          (month-0 grant for hybrid model D-01)

                                    │
                                    │ profile lookup chain:
                                    │  metadata.user_id (NEW first key for checkout)
                                    │  -> stripe_customer_id
                                    │  -> stripe_subscription_id
                                    │  -> email
                                    ▼
                          ┌─────────────────────┐
                          │   Postgres (Phase   │
                          │   11 RPCs only)     │
                          │ - reset_subscription│
                          │   _merits           │
                          │ - credit_shop_merits│
                          │ - grant_upgrade_diff│
                          │   (Phase 11 ASK)    │
                          └─────────────────────┘
                                    ▲
                                    │
              ┌─────────────────────┴────────────────────┐
              │                                          │
   pg_cron (every 15min)                       Frontend (Phase 20)
   net.http_post(reset-subscription-merits)        │
              │                                    │
              ▼                                    ▼
   ┌─────────────────────────┐         ┌──────────────────────────┐
   │ reset-subscription-     │         │ create-checkout-session  │
   │ merits (NEW edge fn)    │         │ (EXTENDED)               │
   │ - internal-secret auth  │         │ - mode: 'subscription'   │
   │ - SELECT due users      │         │   { tier, interval }     │
   │   LIMIT 1000            │         │ - mode: 'payment'        │
   │ - loop reset_RPC per    │         │   { pack_size }          │
   │   user                  │         │ - rate-limit shop only   │
   │ - return {processed,    │         │   (SHOP-12)              │
   │   remaining}            │         │ - session.metadata =     │
   │                         │         │   { user_id, ... }       │
   └─────────────────────────┘         └──────────────────────────┘
```

Data-flow: Stripe POSTs -> handler verifies signature -> dedupes -> routes -> profile lookup (4-key fallback) -> single Phase 11 RPC -> 200 OK to Stripe within ~500 ms. pg_cron sweep is the cold path for yearly-sub monthly refills.

### Recommended Project Structure
```
supabase/functions/
├── stripe-webhook-handler/          # NEW
│   ├── index.ts                     # handler with `deps` for tests
│   ├── index.test.ts                # Deno tests (mirrors stripe-webhook/index.test.ts)
│   ├── event-routers/               # one file per event type, OPTIONAL split
│   │   ├── checkout-session-completed.ts
│   │   ├── subscription-updated.ts
│   │   └── invoice-payment-succeeded.ts
│   └── DEPLOY_RUNBOOK.md            # mirrors Phase 07 runbook
├── reset-subscription-merits/       # NEW
│   ├── index.ts
│   └── index.test.ts
├── create-checkout-session/         # EXTENDED
│   ├── index.ts                     # add discriminated mode branch
│   └── index.test.ts                # extend with payment-mode cases
├── _shared/
│   ├── price-resolver.ts            # PROMOTED from stripe-webhook/ so both
│   │                                # create-checkout-session and the new
│   │                                # handler can import it
│   └── shop-pack-resolver.ts        # NEW: pack_size -> Price ID lookup
│                                    # mirrors price-resolver pattern
│
supabase/migrations/
└── 2026MMDDHHMMSS_phase_12_stripe_products_webhook.sql
    # 1. ADD COLUMN profiles.pending_downgrade_tier text NULL
    # 2. CREATE EXTENSION IF NOT EXISTS pg_cron
    # 3. cron.schedule('reset-subscription-merits-sweep', '*/15 * * * *', ...)
    # 4. PL/pgSQL DO block: MIG-03 backfill
    # 5. Final DO $$ verification block
scripts/
├── provision-stripe-products.mjs    # NEW: shop products + prices
└── provision-stripe-coupon.mjs      # NEW: agk02110 coupon, idempotent
```

### Pattern 1: Webhook Handler Structural Template

**What:** Reuse the entire shape of `stripe-webhook/index.ts` for `stripe-webhook-handler/index.ts`.

**When to use:** Always — Phase 07 is the canonical pattern.

**Example (annotated key excerpts from the existing handler):**

```typescript
// Source: supabase/functions/stripe-webhook/index.ts:30-35 (verbatim)
const HANDLED_EVENTS = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

// Phase 12 EXTENSION:
const HANDLED_EVENTS_V2 = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",        // NEW
  "invoice.payment_failed",
  "checkout.session.completed",       // NEW
]);
```

```typescript
// Source: supabase/functions/stripe-webhook/index.ts:69-99 (verbatim, do not change)
// STR-03: raw body MUST be read before any parse
const rawBody = await req.text();

if (!webhookSecret) { ... return jsonResponse({ error: "invalid_signature" }, 401); }
if (!signature)     { ... return jsonResponse({ error: "invalid_signature" }, 401); }

const stripe = deps.stripe ?? getStripeClient();
const cryptoProvider = getStripeCryptoProvider();

let event: Stripe.Event;
try {
  event = await stripe.webhooks.constructEventAsync(
    rawBody, signature, webhookSecret, undefined, cryptoProvider,
  );
} catch (err) {
  log.warn("signature-verify-failed", { reason: "constructEventAsync-throw" });
  return jsonResponse({ error: "invalid_signature" }, 400);
}
```

```typescript
// Source: supabase/functions/stripe-webhook/index.ts:113-130 (verbatim)
// D-13: insert-first idempotency. One round-trip. Catch 23505 for duplicates.
const { error: insertError } = await supabase
  .from("stripe_webhook_events")
  .insert({
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

if (insertError) {
  const code = (insertError as { code?: string }).code;
  if (code === "23505") {
    log.info("event-duplicate", { eventId: event.id, type: event.type });
    return jsonResponse({ received: true, duplicate: true }, 200);
  }
  log.error("event-persist-failed", { eventId: event.id, code });
  return jsonResponse({ error: "internal_error" }, 500);
}
```

```typescript
// Source: supabase/functions/stripe-webhook/index.ts:189-216 (fallback chain helper)
const tryUpdate = async (column, value) => { /* SELECT-after-UPDATE, returns bool */ };

let matchedBy: string | null = null;
if (await tryUpdate("stripe_customer_id", customerId)) matchedBy = "stripe_customer_id";
else if (await tryUpdate("stripe_subscription_id", subscriptionId)) matchedBy = "stripe_subscription_id";
else if (await tryUpdate("email", customerEmail)) matchedBy = "email";

// Phase 12 EXTENSION for checkout.session.completed only:
let matchedBy: string | null = null;
if (event.type === "checkout.session.completed") {
  // session.metadata.user_id is the MOST reliable key — try first
  const metaUserId = (event.data.object as any).metadata?.user_id ?? null;
  if (metaUserId && await tryFetchProfileById(metaUserId)) matchedBy = "metadata_user_id";
}
if (!matchedBy && await tryUpdate("stripe_customer_id", customerId)) matchedBy = "stripe_customer_id";
// ...etc
```

### Pattern 2: Discriminated Mode Switch in `create-checkout-session`

**What:** One function, one auth path, branch on `mode` early.

**Example (proposed extension to existing 169-line file):**

```typescript
// Extends supabase/functions/create-checkout-session/index.ts
type CheckoutBody =
  | { mode: 'subscription'; tier: 'pro' | 'elite'; interval: 'monthly' | 'annual' }
  | { mode: 'payment'; pack_size: 3 | 10 | 25 | 50 };

const body = (await req.json().catch(() => null)) as CheckoutBody | null;
if (!body || (body.mode !== 'subscription' && body.mode !== 'payment')) {
  return jsonResponse({ error: 'invalid_mode' }, 400);
}

if (body.mode === 'payment') {
  // SHOP-12: rate-limit shop purchases at 10/hour for ALL tiers
  const rl = await rateLimitFn(ctx.userId, ctx.tier, {
    key: 'create-checkout-session-shop',
    limits: { free: 10, pro: 10, elite: 10 },
    windowSeconds: 3600,
  });
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, 'user');

  if (![3, 10, 25, 50].includes(body.pack_size)) {
    return jsonResponse({ error: 'invalid_pack_size' }, 400);
  }
  const priceId = Deno.env.get(`STRIPE_PRICE_MERIT_${body.pack_size}`);
  if (!priceId) return jsonResponse({ error: 'price_not_configured' }, 500);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId!,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/shop?canceled=1`,
    client_reference_id: ctx.userId,
    metadata: { user_id: ctx.userId, pack_size: String(body.pack_size) },
    payment_intent_data: {
      metadata: { user_id: ctx.userId, pack_size: String(body.pack_size) },
    },
  });
  return jsonResponse({ url: session.url, id: session.id }, 200);
}
// else: existing subscription branch unchanged
```

### Pattern 3: pg_cron + pg_net.http_post (verbatim from project)

```sql
-- Source: supabase/migrations/20260310000000_add_keep_warm_cron.sql:12-22 (template)
SELECT cron.schedule(
  'reset-subscription-merits-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/reset-subscription-merits',
    headers := '{"Content-Type": "application/json", "x-internal-job-secret": "<set-via-vault>"}'::jsonb,
    body    := '{"invocation_source": "pg_cron"}'::jsonb
  );
  $$
);
```

**Pitfall:** The keep-warm migration was applied per-environment via Studio because the URL differs (staging vs prod). Phase 12 should follow the same operator pattern — runbook step, not part of `supabase db push`. Alternatively use a Postgres setting (`current_setting('app.functions_base_url')`) to keep the migration env-agnostic.

**Pitfall:** Storing the internal job secret in the cron body is operationally awkward. Better: use Supabase Vault (`vault.create_secret(...)` then `vault.read_secret('name')`) or stuff it into a database role setting. Planner decides — discretion item.

### Pattern 4: Idempotent Stripe coupon provisioning (Node + caller-supplied id)

```javascript
// scripts/provision-stripe-coupon.mjs (new)
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20' });

async function ensureCoupon(id, params) {
  try {
    return await stripe.coupons.retrieve(id);
  } catch (err) {
    if (err.code === 'resource_missing') {
      return await stripe.coupons.create({ id, ...params });
    }
    throw err;
  }
}

await ensureCoupon('agk02110', {
  percent_off: 100,                       // confirm exact promo semantics with user
  duration: 'forever',                    // or 'once' — confirm
  applies_to: { products: [PRO_PRODUCT_ID, ELITE_PRODUCT_ID] },
  name: 'AGK 02110 Founder Promo',
});
```

**Promo semantics question for planner:** What does `agk02110` actually grant? 100% off forever? Free month? Need to confirm with user — RESEARCH cannot infer from spec alone. **[ASSUMED A1]**

### Anti-Patterns to Avoid
- **Hand-rolled HMAC verification.** Phase 07 D-18 is explicit: SDK only via `constructEventAsync`. Stripe-node's HMAC differs subtly from naive implementations on Deno.
- **Parsing the body before signature verification.** `req.json()` consumes the body and `constructEventAsync` requires the raw text. Phase 07 reads `req.text()` first.
- **Hardcoding Stripe Price ID literals anywhere.** Phase 07 D-08/D-10 invariant. All resolution via env vars or `_shared/price-resolver.ts`.
- **Adding permissive RLS policies on `stripe_webhook_events` or `profiles`.** SEC-06 anti-pattern from the Paddle migration. Service role bypasses RLS — that is the only legitimate write path.
- **Editing the Phase 07 `stripe-webhook` handler.** Phase 12 D-06: new function, not an edit. The old handler stays byte-identical until Phase 21 deletes it.
- **Returning 5xx on missing-profile or out-of-order events.** D-12: 200 + log. Stripe will retry indefinitely otherwise.
- **Re-enforcing the SHOP-12 rate limit in the webhook.** D-19: webhook honors any valid PI. Rate-limit lives only in `create-checkout-session`.
- **Calling `reset_subscription_merits` for yearly subs on `invoice.payment_succeeded`.** D-08: NO-OP for yearly; pg_cron owns the monthly cadence. Detect interval by reading `subscription.items.data[0].plan.interval === 'year'`.
- **Skipping the `metadata.user_id` first-key for `checkout.session.completed`.** Email collisions and unlinked customers exist; metadata is the most reliable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC + timing-safe compare | `stripe.webhooks.constructEventAsync` + `Stripe.createSubtleCryptoProvider` | Stripe SDK handles tolerance window, version drift, and Deno-specific async crypto correctly. [VERIFIED: `_shared/stripe-client.ts:27-32`] |
| Event idempotency | Application-level dedupe map | `INSERT INTO stripe_webhook_events ... catch 23505` | Race-free, durable, single round-trip. [VERIFIED: Phase 07 D-13] |
| Rate limiting | Custom in-memory counter | `_shared/rate-limiter.ts` + `increment_rate_limit` Postgres RPC | Already correct under concurrent load, fail-open on DB outage. [VERIFIED: `_shared/rate-limiter.ts:80-113`] |
| Stripe customer creation | Eager creation on signup | Lazy creation in `create-checkout-session` | [VERIFIED: `create-checkout-session/index.ts:133-145`] Phase 07 D-21 — avoids creating Stripe customers for users who never pay. |
| Cron scheduling | External worker | `pg_cron` via existing project extension | [VERIFIED: `20260310000000_add_keep_warm_cron.sql`] |
| HTTP from Postgres | External worker | `pg_net.http_post` | Same. |
| Coupon provisioning idempotency | Search-then-create | Stripe caller-supplied `id` field + retrieve-or-create | Stripe permits caller-supplied IDs on coupons specifically. |
| Promo attached to specific products | Manual dashboard linking | `applies_to.products` on the coupon | Survives re-provisioning. |
| Per-bucket Merit math | New code in webhook | Phase 11 RPCs (`reset_subscription_merits`, `credit_shop_merits`, `grant_upgrade_diff`) | All write-path math lives behind RPCs (Phase 10 D-17). Webhook is a thin event router. |

**Key insight:** The webhook handler is a *router*, not a *calculator*. Every Merit math decision belongs in a Phase 11 RPC. If the planner is tempted to add `if-else` arithmetic in the handler, that's a sign Phase 11's RPC contract is wrong and needs extending.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `profiles.subscription_tier/status/customer_id/subscription_id/price_id` (Phase 07 columns); `stripe_webhook_events` (Phase 07 table); `user_merits.subscription_balance/shop_balance/subscription_reset_date/free_linkedin_scan_used` (Phase 10); `merit_transactions` (Phase 10); `merit_shop_purchases` with UNIQUE on `stripe_payment_intent_id` (Phase 10) | Add column `profiles.pending_downgrade_tier text NULL`. MIG-03 backfill rows in `merit_transactions` with `source = 'phase-12-backfill'`. No data deletions. |
| Live service config | Stripe Dashboard webhook endpoint (currently points at Phase 07 `stripe-webhook`); Stripe subscription Price IDs (already exist in env); Stripe Customer Portal config (already saved per Phase 07 runbook) | Swap webhook endpoint URL once at deploy. Add 4 new shop Prices + 1 coupon via provisioning script. Document URL swap as runbook step. |
| OS-registered state | `pg_cron.job` row for `keep-warm-ping` (existing, every 5min) | Add new `pg_cron.job` row for `reset-subscription-merits-sweep` via `cron.schedule()` in migration. |
| Secrets/env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY/ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY/ANNUAL`, `INTERNAL_JOB_SECRET`, `APP_URL` (all Phase 07) | NEW: `STRIPE_PRICE_MERIT_3`, `STRIPE_PRICE_MERIT_10`, `STRIPE_PRICE_MERIT_25`, `STRIPE_PRICE_MERIT_50`. Possibly a separate `STRIPE_WEBHOOK_SECRET_V2` if the new endpoint is registered as a second Stripe webhook with its own `whsec_` (likely yes during cutover, then collapse to one). Document in runbook. |
| Build artifacts / installed packages | None — Deno fetches Stripe SDK from esm.sh on cold start | Provisioning script may need `npm install --no-save stripe@14` in a CI step or `npx stripe@14`; no permanent install. |

**Canonical question answered:** After every file in the repo is updated, the only runtime state that does not auto-update is (a) the Stripe Dashboard webhook URL, (b) the new Supabase secrets, (c) the new shop Stripe Prices + coupon, (d) the new `pg_cron.job` row. All four are explicit runbook steps.

## Common Pitfalls

### Pitfall 1: Reading body before signature verification
**What goes wrong:** `req.json()` consumes the request stream; `constructEventAsync` requires the raw text and signature header; verification fails with cryptic `Invalid signature`.
**Why it happens:** Habit from non-webhook handlers.
**How to avoid:** Always `const rawBody = await req.text();` FIRST. Phase 07 line 69. Test by sending a real Stripe test webhook to staging and checking response body.
**Warning signs:** `signature-verify-failed` log entries on every event.

### Pitfall 2: Stripe's `current_period_end` is unix seconds, Postgres wants ISO
**What goes wrong:** Wrong dates in `profiles.current_period_end`; "subscription expired in 1970" bugs.
**Why it happens:** Stripe API returns Unix epoch seconds; Postgres `timestamptz` accepts ISO strings.
**How to avoid:** `new Date(sub.current_period_end * 1000).toISOString()`. [VERIFIED: `stripe-webhook/index.ts:170-174` already does this — Pitfall 5 in Phase 07 research.]
**Warning signs:** Period-end dates in 1970 in `profiles` rows.

### Pitfall 3: Out-of-order webhook delivery
**What goes wrong:** `invoice.payment_succeeded` arrives before `customer.subscription.created`; profile lookup fails; handler returns 5xx; Stripe retries forever.
**Why it happens:** Stripe does not guarantee event ordering across event types.
**How to avoid:** Return 200 + `profile-not-found` log on every missing-profile path. [VERIFIED: D-12, `stripe-webhook/index.ts:218-228`.] Stripe's 72h retry window will eventually deliver the prerequisite events; downstream catch-up is automatic.
**Warning signs:** `profile-not-found` logs spike after a checkout but eventually clear.

### Pitfall 4: Yearly sub `invoice.payment_succeeded` triggering monthly grants
**What goes wrong:** Yearly subscriber gets 75 Merits 12 times on day 0 because the renewal invoice fires once per year and the handler re-credits.
**Why it happens:** Treating all `invoice.payment_succeeded` events identically.
**How to avoid:** Read `subscription.items.data[0].plan.interval`; if `'year'`, NO-OP the payment_succeeded path. The pg_cron sweep is the *only* yearly grant mechanism (D-01/D-08).
**Warning signs:** Yearly users with `subscription_balance > 75` after a grant cycle.

### Pitfall 5: Webhook `--no-verify-jwt` flag
**What goes wrong:** Forgetting `--no-verify-jwt` on `supabase functions deploy stripe-webhook-handler` causes Supabase's JWT middleware to reject Stripe's signed-but-JWT-less requests with 401.
**Why it happens:** Default deploy enables JWT verification.
**How to avoid:** [VERIFIED: `stripe-webhook/DEPLOY_RUNBOOK.md` step 3] Use `--no-verify-jwt` on this function specifically. Add to `deploy-staging.ps1` / `deploy-production.ps1`.
**Warning signs:** All Stripe events return 401, no `stripe_webhook_events` rows.

### Pitfall 6: pg_cron tick race conditions
**What goes wrong:** Two cron ticks land within the same `reset_subscription_merits` window and double-credit a user.
**Why it happens:** No idempotency at the cron level; relying solely on the RPC's atomicity.
**How to avoid:** Phase 11 D-13 makes `reset_subscription_merits` a dumb caller-time setter. The Phase 12 sweep job must read `next_reset_date <= now()` AND advance it in the same RPC call atomically. **This is a Phase 11 contract requirement that needs verification — the Phase 11 D-13 RPC as written takes `next_reset_date` as a param, but does NOT itself verify "only if currently due." The sweep must do the predicate filter in SQL, then per-user the RPC re-checks `next_reset_date <= now()` under `FOR UPDATE` to be race-safe. Flag for Phase 11 plan-checker.**
**Warning signs:** Users with `subscription_balance > tier max` after a cron tick.

### Pitfall 7: Promo coupon provisioning is not idempotent by default
**What goes wrong:** Re-running `coupons.create({id: 'agk02110'})` raises `resource_already_exists` and CI deploys fail.
**Why it happens:** Stripe coupons accept a caller-supplied `id` but `create` is not upsert.
**How to avoid:** Wrap in retrieve-or-create (see Pattern 4). Tested in CI as a re-run.
**Warning signs:** Deploy fails on second run.

### Pitfall 8: Migration ordering — Phase 11 RPCs not yet deployed when Phase 12 backfill runs
**What goes wrong:** Phase 12 migration's MIG-03 DO block calls `reset_subscription_merits(...)` and `grant_upgrade_diff(...)` and fails with `function does not exist` because Phase 11 hasn't been migrated yet.
**Why it happens:** `supabase db push` applies migrations in timestamp order; if Phase 12 timestamp is earlier than Phase 11, this fails.
**How to avoid:** Phase 12 migration timestamp MUST be later than Phase 11. Planner verifies. The DO block should `RAISE EXCEPTION 'Phase 11 RPCs not deployed'` if `pg_proc` does not show the expected functions, rather than silently skipping. [CONTEXT D-15 already specifies this.]
**Warning signs:** `function reset_subscription_merits(uuid, text, timestamptz) does not exist` during migration.

### Pitfall 9: `metadata.user_id` not set on Checkout Session
**What goes wrong:** `checkout.session.completed` arrives without metadata; webhook can't find the user via the new first-tried key; falls through to email match (unreliable for guest checkouts).
**Why it happens:** `create-checkout-session` forgets to set `metadata: { user_id, ... }` on the session.
**How to avoid:** Already set per `create-checkout-session/index.ts:155`. Phase 12 extension must preserve this on the payment-mode branch and ALSO set `payment_intent_data.metadata` so the PI carries the same identity.
**Warning signs:** `checkout.session.completed` events match by email instead of `metadata_user_id`.

### Pitfall 10: Insert-first idempotency vs router that needs to read prior state
**What goes wrong:** Inserting into `stripe_webhook_events` BEFORE running the router means a router crash leaves a poison row that future replays won't reprocess (Stripe will not re-send because the handler eventually returned 200 once).
**Why it happens:** Conflict between the idempotency invariant and side-effect ordering.
**How to avoid:** Phase 07's design accepts this trade-off — the inserted row is the durable evidence the event was at-least-once seen. If router work fails AFTER insert, the handler should `RAISE` so Supabase emits 5xx and Stripe retries; the insert is in the same DB transaction as the side effects via Phase 11 RPCs being SECURITY DEFINER (RPCs are their own transaction so this is NOT actually atomic — the insert and the RPC commit independently). Mitigation: write the `stripe_webhook_events` row INSIDE the routing logic via `WITH inserted AS (...) SELECT process_event(...)`, OR accept Phase 07's design and rely on `merit_transactions` deduplication (idempotent RPCs) as the second layer of defense. Planner should explicitly choose.
**Warning signs:** `stripe_webhook_events` row with no corresponding side effect in `merit_transactions`.

## Code Examples

### Routing `checkout.session.completed`

```typescript
// Source: pattern derived from supabase/functions/stripe-webhook/index.ts:152-185
async function routeCheckoutSessionCompleted(event, supabase, log) {
  const session = event.data.object as any;
  const mode = session.mode as 'subscription' | 'payment';
  const metaUserId = session.metadata?.user_id ?? null;

  if (!metaUserId) {
    log.warn('checkout-no-metadata-user-id', { eventId: event.id, sessionId: session.id });
    // fall back to customer/email lookup
  }

  if (mode === 'subscription') {
    const tier = session.metadata?.tier as 'pro' | 'elite' | undefined;
    if (!tier || (tier !== 'pro' && tier !== 'elite')) {
      log.warn('checkout-invalid-tier', { eventId: event.id });
      return { ok: true, profileFound: false };
    }
    // D-01 month-0 grant
    const { error } = await supabase.rpc('reset_subscription_merits', {
      p_user_id: metaUserId,
      p_tier: tier,
      p_next_reset_date: addOneMonth(new Date()).toISOString(),
    });
    if (error) {
      log.error('reset-merits-rpc-failed', { eventId: event.id, code: error.code });
      throw error; // -> 5xx -> Stripe retry
    }
    return { ok: true, processed: 'subscription_grant' };
  }

  if (mode === 'payment') {
    const packSize = parseInt(session.metadata?.pack_size ?? '0', 10);
    const paymentIntentId = session.payment_intent as string;
    if (![3, 10, 25, 50].includes(packSize) || !paymentIntentId) {
      log.warn('checkout-invalid-shop-metadata', { eventId: event.id, packSize });
      return { ok: true, profileFound: false };
    }
    const { error } = await supabase.rpc('credit_shop_merits', {
      p_user_id: metaUserId,
      p_pack_size: packSize,
      p_stripe_payment_id: paymentIntentId,
    });
    if (error) {
      log.error('credit-shop-rpc-failed', { eventId: event.id, code: error.code });
      throw error;
    }
    return { ok: true, processed: 'shop_credit' };
  }
}
```

### Detecting subscription interval (yearly vs monthly)

```typescript
// Source: pattern from Stripe SDK docs
function isYearlySubscription(sub: any): boolean {
  const interval = sub?.items?.data?.[0]?.price?.recurring?.interval ?? sub?.items?.data?.[0]?.plan?.interval;
  return interval === 'year';
}

// In invoice.payment_succeeded handler:
const sub = await stripe.subscriptions.retrieve(invoice.subscription);
if (isYearlySubscription(sub)) {
  log.info('payment-succeeded-yearly-noop', { eventId: event.id });
  return jsonResponse({ received: true, noop: 'yearly-handled-by-cron' }, 200);
}
// monthly: call reset_subscription_merits
```

### reset-subscription-merits batch handler skeleton

```typescript
// supabase/functions/reset-subscription-merits/index.ts (NEW)
import { handleOptionsRequest } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';

export async function handleResetSubscriptionMerits(req: Request, deps = {}) {
  const log = createLogger('reset-subscription-merits');
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'webhook' });
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  // internal-secret auth
  try { await requireAuth(req, { type: 'internal' }); }
  catch (r) { return r as Response; }

  const supabase = deps.supabase ?? getServiceClient();
  const BATCH_SIZE = 1000;

  const { data: due, error } = await supabase
    .from('user_merits')
    .select('user_id, subscription_reset_date, profiles!inner(subscription_tier)')
    .lte('subscription_reset_date', new Date().toISOString())
    .in('profiles.subscription_tier', ['pro', 'elite'])
    .limit(BATCH_SIZE);

  if (error) {
    log.error('select-due-failed', { code: error.code });
    return new Response(JSON.stringify({ error: 'select_failed' }), { status: 500 });
  }

  let processed = 0, errors = 0;
  for (const row of due ?? []) {
    const tier = row.profiles.subscription_tier;
    const nextReset = addOneMonth(new Date(row.subscription_reset_date)).toISOString();
    const { error: rpcErr } = await supabase.rpc('reset_subscription_merits', {
      p_user_id: row.user_id,
      p_tier: tier,
      p_next_reset_date: nextReset,
    });
    if (rpcErr) { errors++; log.warn('reset-rpc-failed', { user_id: row.user_id }); }
    else processed++;
  }

  log.info('batch-complete', { processed, errors, batch_size: BATCH_SIZE });
  return new Response(
    JSON.stringify({ processed, errors, remaining: (due?.length ?? 0) === BATCH_SIZE ? 'unknown' : 0 }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

Deno.serve((req) => handleResetSubscriptionMerits(req));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled HMAC for Stripe signatures | `Stripe.webhooks.constructEventAsync` + `createSubtleCryptoProvider` | stripe-node v12+ for Deno | Async, Deno-compatible, no SubtleCrypto/Buffer mismatch. |
| Eager Stripe customer creation on signup | Lazy creation in checkout-session handler | Phase 07 D-21 | Avoids unused Stripe customers; only creates when user pays. |
| Single global webhook events table | Per-tenant or namespaced tables | n/a | This project keeps a single table; Stripe event IDs are globally unique per account. |
| Cron via external worker | `pg_cron` + `pg_net.http_post` | This project since `keep-warm` migration | Self-contained, no extra infra. |

**Deprecated/outdated:**
- Paddle webhook handling is being deprecated milestone-wide; do not pattern-match on `paddle-webhook/index.ts` for security posture.
- The Phase 07 `stripe-webhook` function: still deployed, but receives no traffic from Phase 12 onward (Phase 21 cleanup).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno test runtime (built-in) for edge functions; pgTAP for Postgres RPCs (Phase 11 owns these) |
| Config file | `supabase/functions/deno.json` (existing) |
| Quick run command | `deno test --allow-all supabase/functions/stripe-webhook-handler/index.test.ts --no-check` |
| Full suite command | `pwsh ./scripts/run-edge-tests.ps1` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01..04 | 4 sub Price objects exist with correct amounts | smoke | Manual `stripe products list` (Stripe API call, not local). Optional Node script `scripts/verify-stripe-products.mjs --env staging`. | Wave 0 |
| SUB-05 | Checkout session redirect URL | unit | `deno test create-checkout-session/index.test.ts -- subscription-mode-success-url` | Wave 0 (extend existing) |
| SUB-06 | Customer Portal | n/a | Phase 07 covered. No Phase 12 test. | — |
| SUB-07 | `checkout.session.completed` (sub) -> tier set + Merits credited + reset_date | unit (handler with fake supabase) | `deno test stripe-webhook-handler/index.test.ts -- checkout-completed-subscription` | Wave 0 |
| SUB-08 | `invoice.payment_succeeded` -> reset for monthly, no-op for yearly | unit | `deno test stripe-webhook-handler/index.test.ts -- invoice-paid-monthly` AND `--invoice-paid-yearly-noop` | Wave 0 |
| SUB-09 | `subscription.deleted` graceful cancel | unit | (mirror existing `stripe-webhook/index.test.ts -- subscription-deleted-graceful-cancel`) | Wave 0 |
| SUB-10 | `invoice.payment_failed` -> past_due | unit | (mirror Phase 07 test) | Wave 0 |
| SUB-11, SUB-12, NFR-08 | Yearly monthly cadence via cron | integration (manual + log inspection) | Run `reset-subscription-merits` manually with internal secret, assert balance + reset_date advanced. | Wave 0 |
| SUB-13 | Free -> Pro grant 75 | unit | `deno test stripe-webhook-handler/index.test.ts -- subscription-created-pro-grants-75` | Wave 0 |
| SUB-14 | Pro -> Elite grant difference | unit (depends on Phase 11 `grant_upgrade_diff` RPC) | `deno test stripe-webhook-handler/index.test.ts -- subscription-updated-upgrade-pro-to-elite` | Wave 0 |
| SUB-15 | Downgrade pending -> period end flip | unit | `deno test stripe-webhook-handler/index.test.ts -- subscription-updated-downgrade-pending` | Wave 0 |
| SHOP-01..04 | 4 shop Price objects exist | smoke | `node scripts/provision-stripe-products.mjs --env staging --check` (re-run, expect "already exists") | Wave 0 |
| SHOP-06 | `checkout.session.completed` (payment) -> credit_shop_merits | unit | `deno test stripe-webhook-handler/index.test.ts -- checkout-completed-shop-credit` | Wave 0 |
| SHOP-07 | < 2 sec end-to-end | manual smoke | timed log inspection in staging | manual |
| SHOP-09 | Duplicate PI rejected | unit | `deno test stripe-webhook-handler/index.test.ts -- shop-credit-duplicate-pi-noop` | Wave 0 |
| SHOP-11 | Shop merits survive downgrade | unit (RPC test in Phase 11 covers; webhook test asserts shop_balance untouched on downgrade) | `deno test stripe-webhook-handler/index.test.ts -- downgrade-preserves-shop-balance` | Wave 0 |
| SHOP-12 | 10 shop / hour rate limit | unit (`create-checkout-session.index.test.ts`) | `deno test create-checkout-session/index.test.ts -- shop-rate-limit-exceeded` | Wave 0 |
| BACK-02 | Shop credit capability | covered by SHOP-06 unit test | — | — |
| BACK-03 | reset-subscription-merits batch | unit | `deno test reset-subscription-merits/index.test.ts -- batch-due-users` | Wave 0 |
| BACK-04 | create-checkout-session sub + shop | unit | both modes covered above | Wave 0 |
| BACK-05 | stripe-webhook-handler sig + idempotent | unit | `deno test stripe-webhook-handler/index.test.ts -- signature-rejected` AND `-- duplicate-event-noop` | Wave 0 |
| NFR-04 | Sig verification mandatory | unit | `deno test stripe-webhook-handler/index.test.ts -- missing-signature-401` AND `-- bad-signature-400` | Wave 0 |
| **NFR-06 / TEST-08** | **Duplicate webhook -> zero balance delta on second delivery** | **unit (THE Phase 12 success criterion)** | `deno test stripe-webhook-handler/index.test.ts -- test-08-duplicate-event-no-double-credit` | **Wave 0 (load-bearing)** |
| NFR-07 | Out-of-order tolerance | unit | `deno test stripe-webhook-handler/index.test.ts -- profile-not-found-200` | Wave 0 |
| MIG-03 | Backfill credits existing subs | smoke (DO block in migration is self-verifying via RAISE NOTICE) + post-migration SQL check | `psql -c "SELECT COUNT(*) FROM merit_transactions WHERE source = 'phase-12-backfill'"` | manual |
| MIG-06 | Promo coupon exists | smoke | `node scripts/provision-stripe-coupon.mjs --check` (re-run, expect noop) | Wave 0 |

### Sampling Rate
- **Per task commit:** `deno test --allow-all supabase/functions/stripe-webhook-handler/index.test.ts supabase/functions/create-checkout-session/index.test.ts supabase/functions/reset-subscription-merits/index.test.ts --no-check`
- **Per wave merge:** `pwsh ./scripts/run-edge-tests.ps1`
- **Phase gate:** Full suite green + manual smoke against staging Stripe Dashboard webhook (mirrors Phase 07 DEPLOY_RUNBOOK.md §4) + DO block migration RAISE NOTICE printed expected counts.

### Wave 0 Gaps

- [ ] `supabase/functions/stripe-webhook-handler/index.test.ts` — covers SUB-07, SUB-08, SUB-13, SUB-14, SUB-15, SHOP-06, SHOP-09, NFR-04, NFR-06 (TEST-08), NFR-07, BACK-05
- [ ] `supabase/functions/reset-subscription-merits/index.test.ts` — covers BACK-03, NFR-08
- [ ] Extend `supabase/functions/create-checkout-session/index.test.ts` with shop-mode test cases — covers BACK-04, SHOP-12
- [ ] Extend `supabase/functions/_shared/test-helpers/stripe-fixtures.ts` with `makeCheckoutSessionCompletedEvent({ mode, metadata, payment_intent })` and `makeInvoicePaymentSucceededEvent({ subscription_interval })` factories
- [ ] Extend `scripts/run-edge-tests.ps1` to include the three new test files
- [ ] `scripts/provision-stripe-products.mjs` and `scripts/provision-stripe-coupon.mjs` (test by running twice on staging — second run is no-op)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `_shared/auth.ts` `requireAuth({type:'user'})` for `create-checkout-session`; `requireAuth({type:'internal'})` for `reset-subscription-merits`; signature-only for `stripe-webhook-handler` |
| V3 Session Management | partial | Supabase JWT; tested in `auth.test.ts`. No new session logic in Phase 12. |
| V4 Access Control | yes | RLS-enforced on `user_merits`, `merit_transactions`, `merit_shop_purchases` (Phase 10 D-17). New `pending_downgrade_tier` column on `profiles` inherits existing RLS. SECURITY DEFINER RPCs are the sole write path. |
| V5 Input Validation | yes | `pack_size` allowlist `[3, 10, 25, 50]`; `tier` in `['pro','elite']`; `mode` in `['subscription','payment']`. Reject with 400 on mismatch. Stripe-supplied data is treated as untrusted and re-validated. |
| V6 Cryptography | yes | HMAC verification ONLY via `stripe.webhooks.constructEventAsync` + `createSubtleCryptoProvider`. No hand-rolled HMAC. |
| V8 Data Protection | yes | Stripe secrets in Supabase secrets store, never in `.env`, never logged (Phase 07 D-14 invariant). |
| V9 Communications | yes | All Stripe API calls via HTTPS through SDK. |
| V10 Malicious Code | partial | `pg_net.http_post` from cron uses an internal secret in the body — needs Vault or a Postgres role-setting indirection so the secret is not in plaintext in `pg_cron.job` table. |
| V13 API & Web Service | yes | Webhook returns 200 on every recoverable case (out-of-order tolerance). 4xx only on actual auth/format failures. 5xx on RPC errors so Stripe retries. |

### Known Threat Patterns for Stripe webhook + Deno edge

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook signature forgery | Spoofing | `constructEventAsync` with `STRIPE_WEBHOOK_SECRET` |
| Replay attack via captured payload | Spoofing/Tampering | Stripe SDK enforces 5min tolerance window by default; idempotency table ensures replays are no-ops anyway |
| Double-credit via duplicate webhook | Tampering | Two-layer idempotency D-17: `stripe_webhook_events.event_id` UNIQUE + `merit_shop_purchases.stripe_payment_intent_id` UNIQUE |
| Race condition on concurrent grant | Tampering | Phase 11 `FOR UPDATE` row lock inside RPC |
| Missing `metadata.user_id` on session | Information Disclosure (wrong-user credit) | First-tried key is metadata, then verified email match second; warn-log every email-match path for audit |
| pg_cron secret exposure in `pg_cron.job` table | Information Disclosure | Use Supabase Vault or `current_setting('app.internal_secret', true)` indirection; do NOT inline secret in `headers` jsonb if avoidable |
| Stripe Dashboard endpoint URL leak | Information Disclosure | Endpoint is hard to abuse without the signing secret; URL is not sensitive |
| Stripe API key compromise | Elevation | Key in Supabase secrets, rotated via runbook; staging and prod keys are distinct |
| Promo coupon abuse (`agk02110`) | Tampering | Coupon `applies_to.products = [PRO_PRODUCT, ELITE_PRODUCT]` only; cannot apply to shop Prices |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pg_cron` extension | reset-subscription-merits sweep | yes | enabled in project | — |
| `pg_net` extension | cron -> edge function HTTP | yes | enabled in project | — |
| Stripe SDK (Deno) | webhook handler, checkout function | yes | `esm.sh/stripe@14?target=denonext` | — |
| Stripe SDK (Node) | provisioning scripts | available via `npx stripe@14` | n/a | use `curl`+REST API as last resort |
| Supabase secrets management | env-specific configuration | yes | `supabase secrets set` CLI | — |
| Supabase Vault | secure storage of internal secret in cron job body | available in Supabase but not yet used in this project | n/a | Use Postgres role setting `ALTER DATABASE postgres SET app.internal_secret = ...` as alternative |
| `pwsh` (PowerShell) | run-edge-tests, deploy scripts | yes | existing scripts use `.ps1` | — |
| `deno` | edge function tests | yes | required by existing `run-edge-tests.ps1` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Supabase Vault not yet used; can fall back to Postgres role setting for the internal secret indirection. Planner picks one approach.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Promo coupon `agk02110` is a 100%-off forever discount applying to Pro and Elite Prices | Pattern 4 / Decisions D-20 | Wrong promo terms could under- or over-discount founder accounts. **Confirm with user before provisioning.** |
| A2 | `invoice.payment_succeeded` for yearly subs fires only once per year (on annual renewal) | Pitfall 4 / D-08 | If Stripe ever fires monthly synthetic invoices on yearly subs, the NO-OP becomes wrong. [VERIFIED via Stripe docs is the safe move before locking — flagged for plan-checker.] |
| A3 | Stripe permits caller-supplied `id` on `coupons.create` | Pattern 4 | If revoked, provisioning script needs different idempotency strategy. [Likely VERIFIED via Stripe API docs but not checked in this session.] |
| A4 | The `agk02110` promo applies via `applies_to.products`, not `applies_to.prices` | Pattern 4 | If wrong field name is used, coupon will apply to all products. Verify against Stripe coupon API docs before plan-locks. |
| A5 | Shop checkout sessions expose the finalized `payment_intent` id in `checkout.session.completed` | Pattern 4 / Code Examples | If `payment_intent` is null at session-complete time, must instead listen for `payment_intent.succeeded`. CONTEXT D-16 asserts it is exposed. [VERIFIED via Stripe docs would lock this; planner should add explicit verification step.] |
| A6 | Phase 11 `reset_subscription_merits` will accept `(user_id, tier, next_reset_date)` per CONTEXT 11 D-13 | All RPC call sites in this research | If Phase 11 ships a 2-arg signature, every Phase 12 call site breaks. **Hard dependency on Phase 11 plan-locking with the 3-arg signature.** |
| A7 | Phase 11 `credit_shop_merits` accepts `(user_id, pack_size, stripe_payment_intent_id)` | Shop credit examples | If named differently, shop crediting breaks. [VERIFIED in 11 D-11.] |
| A8 | Phase 11 will add `grant_upgrade_diff(user_id, from_tier, to_tier)` RPC | D-13 / SUB-14 | **Phase 11 CONTEXT.md does NOT currently list this RPC. Phase 12 must add it as a Phase 11 contract ask BEFORE Phase 11 plan-locks. Otherwise SUB-14 cannot be implemented.** |
| A9 | `pg_cron` ticks do not race the same user via the dumb-setter Phase 11 RPC unless Phase 12 adds caller-side `next_reset_date <= now()` predicate | Pitfall 6 | If two ticks run within the same window, the same user could be granted twice. Caller predicate + RPC's `FOR UPDATE` together prevent it; verify in Phase 11 plan. |
| A10 | The Phase 12 webhook deploy can swap the Stripe Dashboard endpoint URL once and never look back (no need to register the new endpoint as a *second* webhook in parallel for cutover safety) | D-07 | If the new handler has a bug discovered post-deploy, having the old `stripe-webhook` endpoint still receiving traffic would be safer. **Recommend planner add a brief parallel-run window in the runbook**: register the new endpoint as a second Stripe webhook for 24h, then disable the old one. |
| A11 | Pro-rated Merit grants on mid-cycle Free->Pro upgrades are NOT required (full 75/150 per CONTEXT Deferred) | Phase Requirements SUB-13 | If spec §3.4 literally requires proration ("prorated if mid-cycle"), Phase 12 ships wrong. **Spec text is "(prorated if mid-cycle)" in REQUIREMENTS.md SUB-13.** Confirm interpretation with user before plan-locking. |

## Open Questions (RESOLVED)

All items below were either resolved during planning, mitigated via explicit runtime guards, or explicitly deferred. Each carries a `**RESOLVED:**` line recording the disposition.

1. **Should `stripe-webhook-handler` be registered as a parallel webhook in the Stripe Dashboard during cutover, or a hard URL swap?**
   - What we know: D-07 specifies hard swap. Phase 21 deletes the old function.
   - **RESOLVED:** Plan 06 Task 2 DEPLOY_RUNBOOK.md documents a 24h parallel-run window as the cutover procedure (register new endpoint as a second Stripe webhook, monitor logs, then disable the old endpoint). The old Phase 07 `stripe-webhook` handler is left byte-identical per D-06, enabling instant rollback by re-enabling the old endpoint in Stripe dashboard.

2. **What is the actual semantic of the `agk02110` promo coupon?**
   - What we know: It exists in Paddle today and must be preserved per MIG-06.
   - **RESOLVED:** Plan 03 Task 2 ships the provisioning script with assumed terms (`percent_off=100`, `duration=forever`, applies_to products pro+elite) AND emits a `console.warn` at runtime restating the assumption. Plan 06 Task 2 DEPLOY_RUNBOOK.md includes an explicit operator confirmation step before production cutover. Mitigation is runtime-visible rather than silently applied — assumption surfaces at every script run and at deploy time.

3. **Should `reset_subscription_merits` re-verify `next_reset_date <= now()` inside the RPC?**
   - What we know: Phase 11 D-13 says "dumb setter, caller is trusted." Phase 12's pg_cron sweep is the trusting caller.
   - **RESOLVED:** Deferred to Phase 11 as a contract ask recorded in Phase 11 CONTEXT; Phase 12 adds caller-side `next_reset_date <= now()` predicate in the pg_cron sweep body so the race is closed even if Phase 11 ships the dumb-setter form. No Phase 12 plan change required.

4. **Is `grant_upgrade_diff` going to be added to Phase 11?**
   - What we know: Phase 12 D-13 explicitly notes this as a Phase 11 contract ask. Phase 11 CONTEXT.md does NOT currently list it.
   - **RESOLVED:** Plan 07 adds a pre-flight guard that queries `pg_proc` for `grant_upgrade_diff` and raises if the RPC is missing at deploy time. Plan 06 Task 1 calls `supabase.rpc('grant_upgrade_diff', ...)` directly. If Phase 11 ships without this RPC, Plan 07 halts the Phase 12 deploy loudly rather than failing silently in production.

5. **Pro-ration of mid-cycle Free→Pro upgrade Merit grant — required or not?**
   - What we know: REQUIREMENTS.md SUB-13 says "prorated if mid-cycle." CONTEXT.md D-20 Deferred says "full 75/150, NOT prorated."
   - **RESOLVED:** CONTEXT D-20 supersedes the REQUIREMENTS.md SUB-13 parenthetical for Phase 12 scope (CONTEXT is the authoritative lock for this phase per the discuss-phase workflow). Plan 06 adds an explicit `checkpoint:decision` task (Task 0) at the top of the plan that re-surfaces the conflict to the user at execution time, giving them a final chance to override (A: full grant per CONTEXT D-20, B: prorate per REQUIREMENTS SUB-13, C: defer the whole upgrade-diff path to a later phase). Default path is CONTEXT D-20.

6. **Should the internal secret used by pg_cron live in Supabase Vault or a Postgres role setting?**
   - What we know: Vault is available but unused in this project. Role settings are simple.
   - **RESOLVED:** Plan 02 uses `ALTER DATABASE postgres SET app.internal_job_secret = '...'` via per-environment `current_setting('app.internal_job_secret', true)` in the cron job body. Plan 06 Task 2 DEPLOY_RUNBOOK.md documents rotation as part of the operator playbook. Vault adoption deferred to a later project-wide initiative.

## Sources

### Primary (HIGH confidence)
- `supabase/functions/stripe-webhook/index.ts` — full Phase 07 handler implementation; structural template for `stripe-webhook-handler`
- `supabase/functions/stripe-webhook/price-resolver.ts` — `resolveTier` and `resolvePriceId` reference implementations
- `supabase/functions/stripe-webhook/index.test.ts` — Deno test patterns including `signStripePayload` workaround for broken `Stripe.generateTestHeaderString` on Deno
- `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` — operator runbook pattern; `--no-verify-jwt` requirement; per-environment whsec rule
- `supabase/functions/create-checkout-session/index.ts` — current 169-line subscription-only implementation
- `supabase/functions/_shared/stripe-client.ts` — Stripe SDK pin (`esm.sh/stripe@14?target=denonext`, apiVersion `'2024-11-20'`), `getStripeCryptoProvider`, test reset hook
- `supabase/functions/_shared/auth.ts` — `requireAuth` shape, `requireInternalAuth` with `timingSafeEqual`, `requireInternalOrUserAuth`
- `supabase/functions/_shared/rate-limiter.ts` — fixed-window Postgres rate limiter, fail-open behavior, `increment_rate_limit` RPC
- `supabase/functions/_shared/cors.ts` (referenced) — `handleOptionsRequest({type})` and CORS posture per request type
- `supabase/functions/_shared/logger.ts` — `createLogger(fn, reqId)` structured JSON output
- `supabase/migrations/20260412000000_stripe_migration.sql` — Phase 07 schema (`stripe_webhook_events`, profile columns, indexes, RLS posture)
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — Phase 10 schema (`user_merits`, `merit_shop_purchases.stripe_payment_intent_id` UNIQUE)
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` — pg_cron + pg_net.http_post pattern; per-environment URL note
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — Phase 11 D-13 reset RPC signature; D-11 credit_shop_merits signature; gap analysis for `grant_upgrade_diff`
- `.planning/phases/12-stripe-products-and-webhook/12-CONTEXT.md` — all locked decisions
- `.planning/REQUIREMENTS.md` — SUB-01..15, SHOP-01..12, BACK-02..05, NFR-04..08, MIG-03, MIG-06, TEST-08
- `.planning/ROADMAP.md` Phase 12 section — 8 success criteria
- `CLAUDE.md` — project conventions, edge function patterns, security posture

### Secondary (MEDIUM confidence)
- Stripe-node SDK README (`stripe.webhooks.constructEventAsync`, `Stripe.createSubtleCryptoProvider`)
- Stripe Dashboard webhook setup conventions (mirrored from Phase 07 runbook)

### Tertiary (LOW confidence — flagged for verification)
- Exact promo coupon API field shape (`applies_to.products` vs `applies_to.prices`) — A4
- Exact `payment_intent` exposure timing on `checkout.session.completed` — A5
- Stripe `coupons.create` accepting caller-supplied `id` — A3 (almost certainly true but unverified in this session)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in repo
- Architecture: HIGH — Phase 07 is canonical and Phase 12 extends, not replaces
- Pitfalls: HIGH — Pitfalls 1-5 are verified in Phase 07 code; Pitfalls 6-10 are reasoned about based on canonical patterns
- Security: HIGH — RLS posture and SDK-only verification are project invariants
- Phase 11 dependency status: **MEDIUM-LOW — `grant_upgrade_diff` and 3-arg `reset_subscription_merits` need explicit confirmation in Phase 11 plan**
- Promo coupon semantics: **LOW — A1 needs user input**
- Pro-ration interpretation: **LOW — A11 needs user input**

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (Stripe SDK pin and Phase 07 code are stable; revisit if Stripe API version is bumped or if Phase 11 RPC contracts change)
