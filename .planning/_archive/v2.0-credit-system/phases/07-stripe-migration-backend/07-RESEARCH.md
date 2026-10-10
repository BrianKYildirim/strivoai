# Phase 07: Stripe Migration — Backend - Research

**Researched:** 2026-04-12
**Domain:** Stripe subscription billing on Supabase Edge Functions (Deno)
**Confidence:** HIGH

## Summary

This phase replaces the Paddle backend with three new Stripe edge functions plus an additive DB migration. Every core implementation pattern already exists in the repo: `paddle-webhook/index.ts` supplies the idempotency + profile-lookup-fallback + graceful-cancellation shape; `_shared/auth.ts`, `_shared/cors.ts`, `_shared/supabase-client.ts`, `_shared/logger.ts`, and `_shared/rate-limiter.ts` supply the plumbing. The only genuinely new surface is the Stripe SDK integration, which is well-documented and well-established for Deno edge runtimes.

Signature verification is the single biggest footgun. Do **not** hand-roll HMAC. Use `Stripe.createSubtleCryptoProvider()` + `stripe.webhooks.constructEventAsync(...)` with the raw body from `req.text()`. This is the officially-supported Deno path and matches the `constructEventAsync` contract (sync `constructEvent` relies on Node `crypto` and fails on Deno).

**Primary recommendation:** Mirror `paddle-webhook/index.ts` structurally. Replace only (1) the HMAC verify block with the Stripe SDK's async verify, (2) the payload extraction logic with Stripe event shapes, (3) the price-to-tier map with the four env-driven constants. Everything else — idempotency table insert, profile lookup fallback chain (stripe_customer_id → stripe_subscription_id → email), graceful cancellation block — is a near-line-for-line port.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cutover & Coexistence**
- **D-01:** Coexistence — deploy Stripe functions and schema alongside Paddle. `paddle-webhook` stays deployed throughout Phase 07; rollback = re-point frontend at Paddle.
- **D-02:** No dual-write. Only one provider writes to a given profile row at a time. During Phase 07 deploy, Stripe paths are exercised via test events only.
- **D-03:** Paddle cleanup (delete edge function, drop `paddle_*` columns, drop `paddle_webhook_events`) is explicitly deferred to a post-Phase-08 cleanup phase.

**Schema Migration**
- **D-04:** Additive migration on `profiles` — add `stripe_customer_id text`, `stripe_subscription_id text`, `stripe_price_id text`. Keep all existing `paddle_*` columns untouched.
- **D-05:** Reuse the existing provider-agnostic columns `subscription_tier`, `subscription_status`, `current_period_end`. Do NOT namespace them per provider.
- **D-06:** New table `public.stripe_webhook_events` mirrors `paddle_webhook_events` shape: `event_id text primary key`, `event_type text`, `payload jsonb`, `created_at timestamptz default now()`. RLS enabled with service_role-only policy — **no `USING (true)` policy** (STR-07).
- **D-07:** Indexes: `stripe_customer_id` and `stripe_subscription_id` on `profiles` for webhook lookup fallback paths.

**Price ID Env Layout**
- **D-08:** Four discrete secrets: `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`. No JSON blobs, no hardcoded fallbacks.
- **D-09:** `create-checkout-session` input contract: `{ tier: 'pro' | 'elite', interval: 'monthly' | 'annual' }`. Backend validates both fields against a fixed allowlist and resolves to a price ID server-side. Frontend never handles price IDs.
- **D-10:** `stripe-webhook` builds a reverse map `priceId → { tier, interval }` at module load from the same 4 env vars. Unknown price IDs map to `'free'` and log a warning (not a hard failure).
- **D-11:** Staging and production use different Stripe price IDs via standard per-environment secrets.

**Webhook Events & Idempotency**
- **D-12:** Handled events — exactly `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. All other events return `200 OK` with a log line and are NOT inserted into `stripe_webhook_events`.
- **D-13:** Idempotency — insert `event_id` into `stripe_webhook_events` before processing. On duplicate (unique violation), return 200 immediately.
- **D-14:** Graceful cancellation — on `customer.subscription.deleted`, set `subscription_status = 'canceled'` but do NOT change `subscription_tier`. The existing `can_perform_ai_action` SQL function already enforces `current_period_end`.
- **D-15:** `invoice.payment_failed` sets `subscription_status = 'past_due'` and leaves `subscription_tier` alone.
- **D-16:** `customer.subscription.created` / `.updated` — write `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `subscription_tier` (from reverse map), `subscription_status` (from Stripe `status`), and `current_period_end` (from unix → ISO).
- **D-17:** Profile lookup order: (1) by `stripe_customer_id`, (2) by `stripe_subscription_id`, (3) by `customer.email` from Stripe. Missing user = log + 200.

**Stripe SDK & Signature Verification**
- **D-18:** Use the official Stripe SDK via `https://esm.sh/stripe?target=deno`. Use `webhooks.constructEventAsync` with `createSubtleCryptoProvider()`. No hand-rolled HMAC.
- **D-19:** Use SDK for checkout and portal session creation. No raw fetch to `api.stripe.com`.
- **D-20:** One shared helper in `supabase/functions/_shared/` builds the Stripe client from `STRIPE_SECRET_KEY`.

**Customer Creation Timing**
- **D-21:** Lazy customer creation on first checkout. `create-checkout-session` reads `profiles.stripe_customer_id`; if null, calls `stripe.customers.create({ email, metadata: { user_id } })`, writes ID back, then creates Session with `customer: <id>`.
- **D-22:** Pass `user_id` in Stripe customer metadata.
- **D-23:** `create-stripe-portal` requires an existing `stripe_customer_id` — returns `400 no_customer` if none.

**Auth & CORS**
- **D-24:** `create-checkout-session` and `create-stripe-portal` use `requireAuth` (user JWT). `stripe-webhook` uses webhook auth type — signature only.
- **D-25:** CORS for the two user-facing functions follows the `APP_URL` allowlist.

### Claude's Discretion
- Exact column types/precision on the migration (e.g., `text` vs `varchar`) — follow existing repo conventions.
- Logging format inside Stripe functions — reuse `createLogger('stripe-webhook', reqId)` pattern.
- Whether to extract a shared `resolveTierFromPriceId` helper — judgment call.
- Error response body shape — follow existing edge function conventions.
- Whether to add a `checkRateLimit` gate on `create-checkout-session` — likely yes; planner decides threshold.

### Deferred Ideas (OUT OF SCOPE)
- Additional webhook events (`invoice.paid`, `checkout.session.completed`, `customer.subscription.trial_will_end`).
- Retry observability columns (`processed_at`, `attempt_count`, `last_error`) on `stripe_webhook_events`.
- Removing Paddle entirely (delete `paddle-webhook`, drop `paddle_*` columns, drop `paddle_webhook_events`).
- Generic provider columns (`provider`, `customer_id`, ...) with a discriminator.
- Trial periods / promo codes / coupons.
- Stripe Tax / VAT handling.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STR-01 | `create-checkout-session` creates Stripe Checkout Sessions for Pro/Elite monthly + annual | §Stripe SDK — Checkout Session Create, §Code Examples — create-checkout-session skeleton |
| STR-02 | `stripe-webhook` handles `customer.subscription.{created,updated,deleted}` + `invoice.payment_failed` | §Webhook Event Payload Shapes, §Code Examples — stripe-webhook skeleton |
| STR-03 | Webhook verifies signature via HMAC-SHA256 with `req.text()` before JSON parsing | §Signature Verification — satisfied by `constructEventAsync` which HMACs raw body before parsing |
| STR-04 | Webhook updates `profiles.subscription_tier` from env-var price→tier mapping | §Price→Tier Reverse Map |
| STR-05 | `create-stripe-portal` creates Customer Portal sessions | §Stripe SDK — Billing Portal Session Create |
| STR-06 | Migration adds `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` to `profiles` | §Migration Style |
| STR-07 | Migration creates `stripe_webhook_events` with service_role-only RLS (no `USING(true)`) | §Migration Style — locked RLS pattern |
| STR-12 | Price IDs stored in env vars, not hardcoded | §Price→Tier Reverse Map — four env vars resolved at module load |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Make changes directly in the workspace** when the user asks for implementation work.
- **Prefer small, reversible changes.** Additive migration, three new functions, no touches to `paddle-webhook`.
- **Preserve existing TypeScript and React patterns** — use the exact shared helpers already in use.
- **Avoid unnecessary abstractions** — one shared `_shared/stripe-client.ts` helper; do not build a generic provider-abstraction layer.
- **Never commit anything in `.planning/`** or modify `.gitignore`.
- **Deno edge functions use strict TypeScript.** All parameters typed, explicit return types on exported functions.
- **Structured logging via `createLogger('fn-name', reqId)`.** No `console.log` churn — use the logger consistently.
- **Keep user-facing error messages specific and operationally useful.** `400 invalid_tier`, `400 no_customer`, etc. — not `400 bad_request`.
- **Secrets never logged.** Use reason codes in `log.warn('signature-verify-failed', { reason: '...' })`.
- **CORS fail-closed** via `APP_URL` allowlist for user-facing functions; webhook has no CORS.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (SDK) | `14.x` via `https://esm.sh/stripe@14?target=denonext` | Checkout, portal, webhook signature verification | `[VERIFIED: Supabase official example]` The Supabase docs' canonical Stripe webhook edge function pins `@14?target=denonext`. This is the battle-tested Deno entry-point. |
| `@supabase/supabase-js` | `2.x` (already in repo) | Service-role DB writes | Already the singleton via `_shared/supabase-client.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/auth.ts` | in-repo | `requireAuth({ type: 'user' })` for checkout + portal, `{ type: 'webhook' }` for stripe-webhook | Every new edge function |
| `_shared/cors.ts` | in-repo | `handleOptionsRequest({ type: 'user' })` + `corsHeaders({ type: 'user' })` | Checkout + portal (user-facing); webhook uses `{ type: 'webhook' }` which returns `{}` |
| `_shared/supabase-client.ts` | in-repo | `getServiceClient()` for profile reads/updates + event inserts | Every new edge function |
| `_shared/logger.ts` | in-repo | `createLogger('stripe-webhook', reqId)` structured JSON | Every new edge function |
| `_shared/rate-limiter.ts` | in-repo | `checkRateLimit(userId, tier, { key: 'create-checkout-session', limits: { free: 10, pro: 30, elite: 60 }, windowSeconds: 3600 })` | `create-checkout-session` only (abuse gate) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `esm.sh/stripe@14?target=denonext` | `npm:stripe` specifier | `npm:` works but is slower cold-start in Deno Deploy / Supabase Edge; esm.sh pre-bundles for the target runtime. **Locked by D-18 to `esm.sh/stripe?target=deno`.** |
| SDK `constructEventAsync` | Hand-rolled HMAC-SHA256 | Hand-rolled code is the #1 Stripe integration footgun (timestamp tolerance, raw-body handling, timing-safe compare). D-18 forbids it. STR-03 is still satisfied because the SDK does HMAC over raw `req.text()` body. |
| Embedded Checkout (`ui_mode: 'embedded'`) | Redirect Checkout | Embedded requires frontend changes + `return_url` pattern. Phase 08 scope is a simple redirect flow. |

**Installation:** None. Everything is ESM imports from `esm.sh` and `deno.land/std@0.224.0/...`. No `deno.json` or `import_map.json` updates required — imports are inline per existing convention (see `_shared/auth.ts`).

**Version verification:**
- `stripe@14` on esm.sh is the version explicitly referenced in the [Supabase Stripe webhook example](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/stripe-webhooks/index.ts) `[CITED]`.
- Latest published `stripe` on esm.sh as of 2026-04-12: `22.0.1` `[VERIFIED: esm.sh/stripe]`. **Recommend `stripe@18` or `stripe@14`** — pin to a major the Supabase example is proven against. **Use `stripe@14?target=denonext`** for this phase to stay aligned with the canonical working example; revisit when a new Deno example is published.
- `apiVersion`: Pin to `'2024-11-20'` `[CITED: Supabase example]`. Stripe changes the API version string periodically; pinning freezes the payload shapes our webhook depends on.

## Architecture Patterns

### Recommended Project Structure
```
supabase/functions/
├── create-checkout-session/
│   └── index.ts            # Deno.serve, requireAuth('user'), APP_URL CORS, stripe.checkout.sessions.create
├── create-stripe-portal/
│   └── index.ts            # Deno.serve, requireAuth('user'), APP_URL CORS, stripe.billingPortal.sessions.create
├── stripe-webhook/
│   └── index.ts            # Deno.serve, webhook auth, constructEventAsync, handle 4 events
└── _shared/
    └── stripe-client.ts    # NEW: getStripeClient() + createSubtleCryptoProvider() singleton (D-20)

supabase/migrations/
└── <timestamp>_stripe_migration.sql  # additive profiles cols + stripe_webhook_events table
```

### Pattern 1: Module-level Stripe client singleton
**What:** Mirror the `_serviceClient` singleton pattern in `_shared/supabase-client.ts`.
**When to use:** Any edge function that touches Stripe.
**Example:**
```typescript
// supabase/functions/_shared/stripe-client.ts
// Source: adapted from supabase-client.ts singleton + Supabase Stripe example
import Stripe from 'https://esm.sh/stripe@14?target=denonext';

let _stripe: Stripe | null = null;
let _cryptoProvider: ReturnType<typeof Stripe.createSubtleCryptoProvider> | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, {
      apiVersion: '2024-11-20',
      // httpClient: Stripe.createFetchHttpClient(), // auto-selected on Deno target
    });
  }
  return _stripe;
}

export function getStripeCryptoProvider() {
  if (!_cryptoProvider) {
    _cryptoProvider = Stripe.createSubtleCryptoProvider();
  }
  return _cryptoProvider;
}
```

### Pattern 2: Price→Tier Reverse Map (D-10)
**What:** Build the map at module load from env vars. Unknown IDs → `'free'` + warn.
**Example:**
```typescript
// Inside stripe-webhook/index.ts — module scope
interface TierInfo { tier: 'pro' | 'elite'; interval: 'monthly' | 'annual'; }
const PRICE_ID_TO_TIER: Record<string, TierInfo> = (() => {
  const map: Record<string, TierInfo> = {};
  const pairs: Array<[string | undefined, TierInfo]> = [
    [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),    { tier: 'pro',   interval: 'monthly' }],
    [Deno.env.get('STRIPE_PRICE_PRO_ANNUAL'),     { tier: 'pro',   interval: 'annual'  }],
    [Deno.env.get('STRIPE_PRICE_ELITE_MONTHLY'),  { tier: 'elite', interval: 'monthly' }],
    [Deno.env.get('STRIPE_PRICE_ELITE_ANNUAL'),   { tier: 'elite', interval: 'annual'  }],
  ];
  for (const [id, info] of pairs) if (id) map[id] = info;
  return map;
})();

function resolveTier(priceId: string | null): 'free' | 'pro' | 'elite' {
  if (!priceId) return 'free';
  const hit = PRICE_ID_TO_TIER[priceId];
  if (!hit) {
    log.warn('unknown-price-id', { priceId });
    return 'free';
  }
  return hit.tier;
}
```

### Pattern 3: `create-checkout-session` → resolve tier+interval server-side (D-09)
```typescript
function resolvePriceId(tier: 'pro' | 'elite', interval: 'monthly' | 'annual'): string | null {
  const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  return Deno.env.get(envKey) ?? null;
}
```
Validate `tier` and `interval` with a Zod schema or a manual allowlist check. Reject with `400 invalid_tier` / `400 invalid_interval` on any other input. **Never accept a `priceId` from the client.**

### Pattern 4: Idempotency insert-first (mirror of `paddle-webhook` lines 150–171)
```typescript
const { error: insertError } = await supabase
  .from('stripe_webhook_events')
  .insert({ event_id: event.id, event_type: event.type, payload: event });

if (insertError) {
  // 23505 = unique_violation → duplicate event, already processed
  if (insertError.code === '23505') {
    log.info('duplicate-event', { eventId: event.id });
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }
  log.error('insert-event-failed', { error: insertError.message });
  return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
}
```
**Critical difference vs. Paddle code:** Paddle does a SELECT-then-INSERT (lines 152–164), which has a race window. **Use single INSERT + unique-violation check** for Stripe. `event_id` is `PRIMARY KEY`, so Postgres guarantees atomicity.

### Pattern 5: Profile lookup fallback chain (D-17)
```typescript
async function findProfileId(opts: {
  customerId?: string | null;
  subscriptionId?: string | null;
  email?: string | null;
}): Promise<{ id: string; email: string } | null> {
  const supabase = getServiceClient();

  if (opts.customerId) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('stripe_customer_id', opts.customerId).maybeSingle();
    if (data) return data;
  }
  if (opts.subscriptionId) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('stripe_subscription_id', opts.subscriptionId).maybeSingle();
    if (data) return data;
  }
  if (opts.email) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('email', opts.email).maybeSingle();
    if (data) return data;
  }
  return null;
}
```
**Order matters:** `stripe_customer_id` is the most specific (comes directly from Stripe on every event); `stripe_subscription_id` is next; email is last-resort (users can change it, multiple records could share it in theory). If `findProfileId` returns `null`, log + 200 — do not make Stripe retry.

### Pattern 6: Graceful cancellation (mirror `paddle-webhook` lines 252–259)
```typescript
// For customer.subscription.deleted:
updateData.subscription_status = 'canceled';
// Deliberately DO NOT set subscription_tier — user keeps tier until current_period_end.
// can_perform_ai_action SQL function expires access when current_period_end < NOW().
log.info('graceful-cancel', { profileId, currentPeriodEnd });
```

### Anti-Patterns to Avoid
- **Hand-rolling HMAC for signature verification.** Forbidden by D-18.
- **Parsing `req.json()` before signature verification.** Stripe signs the exact byte stream. You MUST use `await req.text()` and pass that string to `constructEventAsync`. Parsing first destroys whitespace/ordering and verification fails.
- **Sync `constructEvent`.** Deno doesn't ship Node `crypto`. `constructEvent` will throw. Use `constructEventAsync` + `createSubtleCryptoProvider()`.
- **Returning 4xx for unknown event types.** Stripe will retry indefinitely. Return `200` with a log line (D-12).
- **Accepting `priceId` from frontend.** Opens client-side tier promotion. D-09 is explicit: frontend sends `{tier, interval}` only.
- **Creating a customer on every checkout.** D-21: read `profiles.stripe_customer_id` first, only create if null, write back before session creation.
- **Forgetting `metadata: { user_id }` on `stripe.customers.create`.** Kills the email-fallback recovery path (D-22).
- **RLS `USING (true)` on `stripe_webhook_events`.** STR-07 forbids it. The existing `paddle_webhook_events` migration uses `USING (true)` which is a SEC-06 bug — do NOT copy that pattern. Service-role bypasses RLS regardless of policies; the policy should explicitly restrict to `auth.role() = 'service_role'` or have no permissive policy at all.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA256 signature verification | Custom `crypto.subtle` HMAC code | `stripe.webhooks.constructEventAsync(body, sig, secret, undefined, cryptoProvider)` | Timestamp tolerance, raw-body handling, constant-time compare, and replay protection all already correct in the SDK |
| Stripe API calls | Raw `fetch('https://api.stripe.com/v1/...')` | `stripe.checkout.sessions.create(...)`, `stripe.billingPortal.sessions.create(...)`, `stripe.customers.create(...)` | Typed responses, auto-retry, auto-auth headers, error classes |
| Webhook event types | Custom `any` casts everywhere | `Stripe.Event` + `Stripe.Subscription` + `Stripe.Invoice` narrowed via `event.type` | SDK exports match exact wire payloads |
| Customer lookup | A "do everything in one query" giant SQL statement | Three sequential `maybeSingle()` calls in a helper (Pattern 5) | Matches `paddle-webhook` shape, easy to unit-test |
| Price→tier mapping | Hardcoded map in source | Env-var resolved module-load map (D-10, Pattern 2) | STR-12 requires env vars; per-env price IDs (D-11) require env-driven |
| Idempotency semaphore | Distributed lock / external cache | Single INSERT on `event_id PRIMARY KEY` with 23505 check | Postgres unique constraint is the lock |

**Key insight:** Every hand-rolled variant of the above has appeared in some production Stripe integration — and every single one has been the root cause of a real outage or security incident. The SDK and Postgres primitives are boringly correct; use them.

## Runtime State Inventory

Not applicable — this is a new-feature phase, not a rename/refactor. No existing runtime state to migrate. The only adjacent live state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — additive migration only. New `stripe_*` columns are null on all existing rows; Paddle state in `paddle_*` columns untouched (D-04). | None |
| Live service config | Stripe Dashboard: (a) webhook endpoint pointing at `stripe-webhook` function URL, (b) Customer Portal default configuration, (c) 4 Price objects for Pro/Elite monthly/annual. **Action:** Operator creates these out-of-band and pastes IDs into Supabase secrets before deploy. Phase task list should include a deploy-runbook checklist item. | Operator task (documented) |
| OS-registered state | None | None |
| Secrets/env vars | 6 new Supabase secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`. Must be set in staging before Phase 07 deploy, and again in production before Phase 08 cutover. | Set via `supabase secrets set` in both environments |
| Build artifacts | None — Deno edge functions don't produce build artifacts | None |

**Nothing found in category:** Confirmed — Phase 07 is purely additive code + schema.

## Common Pitfalls

### Pitfall 1: `req.json()` before signature verification
**What goes wrong:** `constructEventAsync` throws "No signatures found matching the expected signature for payload."
**Why it happens:** `JSON.parse(JSON.stringify(x))` is not byte-identical to the raw body. Any re-serialization destroys HMAC.
**How to avoid:** `const rawBody = await req.text();` — hand that string directly to `constructEventAsync`. Parse JSON fields off `event.data.object` after verification.
**Warning signs:** Works locally with your own payloads; fails with real Stripe webhooks.

### Pitfall 2: Sync `constructEvent` on Deno
**What goes wrong:** Runtime error about missing Node `crypto` module.
**Why it happens:** SDK has two verify paths — sync uses Node's built-in `crypto`; async uses a pluggable crypto provider. Deno has no Node `crypto`.
**How to avoid:** Always `constructEventAsync` + `Stripe.createSubtleCryptoProvider()`.

### Pitfall 3: Missing `user_id` in customer metadata
**What goes wrong:** If webhook fires before `profiles.stripe_customer_id` is persisted (race), lookup falls back to email. If the user changed email between signup and checkout — lost mapping.
**How to avoid:** `stripe.customers.create({ email, metadata: { user_id: ctx.userId } })`. Even if all three fallbacks in the lookup chain fail, the customer metadata has the truth — add a 4th fallback: fetch the customer via `stripe.customers.retrieve(customerId)` and read `metadata.user_id`. **Optional stretch; the 3-fallback chain is sufficient for STR-02.**

### Pitfall 4: Portal returns "No configuration provided for default test mode portal"
**What goes wrong:** First call to `stripe.billingPortal.sessions.create` in a fresh test/live account fails because no default portal configuration exists.
**How to avoid:** Operator must visit Stripe Dashboard → Settings → Billing → Customer Portal and click "Save" once to create the default configuration. Document this in the deploy runbook. `[CITED: docs.stripe.com/customer-management/configure-portal]`

### Pitfall 5: `current_period_end` as `number` vs `timestamptz`
**What goes wrong:** Stripe sends unix seconds (integer). DB column is `timestamptz`. Forgetting to convert → SQL type mismatch error.
**How to avoid:** `new Date(subscription.current_period_end * 1000).toISOString()`. The `paddle-webhook` uses a pre-formatted ISO string from Paddle (`ends_at`); Stripe gives you unix. **Note:** In Stripe SDK v18+, `current_period_end` moved to `subscription.items.data[0].current_period_end`. For `stripe@14`, it's still on the top-level subscription. Verify in your chosen version.

### Pitfall 6: RLS `USING (true)` copied from Paddle migration
**What goes wrong:** STR-07 reviewer rejects PR; SEC-06 gets re-opened.
**How to avoid:** Either (a) enable RLS and define **no** permissive policies (service role bypasses RLS), or (b) define policies with `USING (auth.role() = 'service_role')`. The simplest and most auditable is (a):
```sql
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY statements. Service role bypasses RLS automatically.
-- Anon and authenticated roles are denied by default with RLS enabled and no policy.
```

### Pitfall 7: Returning 4xx for unknown Stripe events
**What goes wrong:** Stripe retries exponentially for up to 3 days, filling logs and triggering alerts.
**How to avoid:** D-12 — always return 200 with a log line for events not in the handled set.

### Pitfall 8: Webhook secret mismatch between environments
**What goes wrong:** Staging webhook secret pasted into production, or vice versa. All webhooks start 400-ing.
**How to avoid:** Stripe generates a distinct `whsec_` for each endpoint. Staging and production have separate endpoints → separate secrets. Verify by running a test webhook from the Stripe CLI against each environment after deploy.

## Code Examples

### `create-checkout-session/index.ts` skeleton
```typescript
// Source: adapted from existing _shared patterns + Stripe API docs
import { handleOptionsRequest, corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, createRateLimitResponse } from '../_shared/rate-limiter.ts';
import { getStripeClient } from '../_shared/stripe-client.ts';

const log = createLogger('create-checkout-session');

function resolvePriceId(tier: 'pro' | 'elite', interval: 'monthly' | 'annual'): string | null {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  return Deno.env.get(key) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  }

  let ctx;
  try { ctx = await requireAuth(req, { type: 'user' }); }
  catch (r) { return r as Response; }
  if (!ctx) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const rl = await checkRateLimit(ctx.userId, ctx.tier, {
    key: 'create-checkout-session',
    limits: { free: 10, pro: 30, elite: 60 },
    windowSeconds: 3600,
  });
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, 'user');

  const body = await req.json().catch(() => null) as { tier?: string; interval?: string } | null;
  const tier = body?.tier;
  const interval = body?.interval;
  if (tier !== 'pro' && tier !== 'elite') {
    return new Response(JSON.stringify({ error: 'invalid_tier' }), {
      status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  }
  if (interval !== 'monthly' && interval !== 'annual') {
    return new Response(JSON.stringify({ error: 'invalid_interval' }), {
      status: 400, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  }

  const priceId = resolvePriceId(tier, interval);
  if (!priceId) {
    log.error('price-id-not-configured', { tier, interval });
    return new Response(JSON.stringify({ error: 'price_not_configured' }), {
      status: 500, headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();
  const stripe = getStripeClient();

  // Lazy customer creation (D-21)
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id, email').eq('id', ctx.userId).single();

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: ctx.email,
      metadata: { user_id: ctx.userId },
    });
    customerId = customer.id;
    await supabase.from('profiles')
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('id', ctx.userId);
  }

  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?canceled=1`,
    client_reference_id: ctx.userId,
    metadata: { user_id: ctx.userId, tier, interval },
  });

  log.info('checkout-session-created', { userId: ctx.userId, tier, interval, sessionId: session.id });

  return new Response(JSON.stringify({ url: session.url, id: session.id }), {
    status: 200,
    headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
  });
});
```

### `create-stripe-portal/index.ts` skeleton
```typescript
import { handleOptionsRequest, corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';
import { getStripeClient } from '../_shared/stripe-client.ts';

const log = createLogger('create-stripe-portal');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'user' });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  let ctx;
  try { ctx = await requireAuth(req, { type: 'user' }); }
  catch (r) { return r as Response; }
  if (!ctx) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const supabase = getServiceClient();
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', ctx.userId).single();

  const customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    return new Response(JSON.stringify({ error: 'no_customer' }), {
      status: 400,
      headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
    });
  }

  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/billing`,
  });

  log.info('portal-session-created', { userId: ctx.userId, sessionId: session.id });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...corsHeaders({ type: 'user' }), 'Content-Type': 'application/json' },
  });
});
```

### `stripe-webhook/index.ts` skeleton
```typescript
// Source: adapted from paddle-webhook/index.ts + Supabase Stripe example
import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { handleOptionsRequest } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { createLogger } from '../_shared/logger.ts';
import { getStripeClient, getStripeCryptoProvider } from '../_shared/stripe-client.ts';

const log = createLogger('stripe-webhook');

interface TierInfo { tier: 'pro' | 'elite'; interval: 'monthly' | 'annual'; }
const PRICE_ID_TO_TIER: Record<string, TierInfo> = (() => {
  const map: Record<string, TierInfo> = {};
  const pairs: Array<[string | undefined, TierInfo]> = [
    [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),   { tier: 'pro',   interval: 'monthly' }],
    [Deno.env.get('STRIPE_PRICE_PRO_ANNUAL'),    { tier: 'pro',   interval: 'annual'  }],
    [Deno.env.get('STRIPE_PRICE_ELITE_MONTHLY'), { tier: 'elite', interval: 'monthly' }],
    [Deno.env.get('STRIPE_PRICE_ELITE_ANNUAL'),  { tier: 'elite', interval: 'annual'  }],
  ];
  for (const [id, info] of pairs) if (id) map[id] = info;
  return map;
})();

function resolveTier(priceId: string | null | undefined): 'free' | 'pro' | 'elite' {
  if (!priceId) return 'free';
  const hit = PRICE_ID_TO_TIER[priceId];
  if (!hit) { log.warn('unknown-price-id', { priceId }); return 'free'; }
  return hit.tier;
}

async function findProfile(opts: {
  customerId?: string | null; subscriptionId?: string | null; email?: string | null;
}) {
  const supabase = getServiceClient();
  if (opts.customerId) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('stripe_customer_id', opts.customerId).maybeSingle();
    if (data) return { ...data, matchedBy: 'stripe_customer_id' as const };
  }
  if (opts.subscriptionId) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('stripe_subscription_id', opts.subscriptionId).maybeSingle();
    if (data) return { ...data, matchedBy: 'stripe_subscription_id' as const };
  }
  if (opts.email) {
    const { data } = await supabase.from('profiles')
      .select('id, email').eq('email', opts.email).maybeSingle();
    if (data) return { ...data, matchedBy: 'email' as const };
  }
  return null;
}

const HANDLED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptionsRequest({ type: 'webhook' });
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const signature = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !webhookSecret) {
    log.warn('signature-missing', { hasSignature: !!signature, hasSecret: !!webhookSecret });
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 });
  }

  // MUST be raw body, pre-parse. Satisfies STR-03.
  const rawBody = await req.text();

  const stripe = getStripeClient();
  const cryptoProvider = getStripeCryptoProvider();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined, // tolerance (default 300s)
      cryptoProvider,
    );
  } catch (err) {
    log.warn('signature-verify-failed', { error: (err as Error).message });
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400 });
  }

  log.info('event-received', { eventId: event.id, eventType: event.type });

  // Unhandled events → 200 + log (D-12). Do NOT insert into stripe_webhook_events.
  if (!HANDLED_EVENTS.has(event.type)) {
    log.info('event-ignored', { eventId: event.id, eventType: event.type });
    return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200 });
  }

  // Idempotency — insert first, duplicate = 200 (D-13)
  const supabase = getServiceClient();
  const { error: insertError } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown> });

  if (insertError) {
    if (insertError.code === '23505') {
      log.info('duplicate-event', { eventId: event.id });
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
    }
    log.error('event-insert-failed', { error: insertError.message });
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }

  // Route by event type
  try {
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated' ||
        event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      // Email fallback — customer is string | Customer. If expanded, read email; else fetch.
      let email: string | null = null;
      if (typeof sub.customer !== 'string' && sub.customer && !sub.customer.deleted) {
        email = sub.customer.email ?? null;
      }
      if (!email && customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        if (!('deleted' in cust && cust.deleted)) email = (cust as Stripe.Customer).email ?? null;
      }

      const profile = await findProfile({ customerId, subscriptionId: sub.id, email });
      if (!profile) {
        log.warn('profile-not-found', { customerId, subscriptionId: sub.id, email });
        return new Response(JSON.stringify({ received: true, profileFound: false }), { status: 200 });
      }

      const update: Record<string, unknown> = {
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: priceId,
        subscription_status: sub.status, // active | canceled | past_due | ...
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      };

      if (event.type === 'customer.subscription.deleted') {
        // Graceful cancellation (D-14): keep tier, only flip status.
        update.subscription_status = 'canceled';
        log.info('graceful-cancel', { profileId: profile.id, currentPeriodEnd });
      } else {
        // created/updated: set tier from price map
        update.subscription_tier = resolveTier(priceId);
      }

      const { error: updateError } = await supabase.from('profiles').update(update).eq('id', profile.id);
      if (updateError) {
        log.error('profile-update-failed', { profileId: profile.id, error: updateError.message });
        return new Response(JSON.stringify({ error: 'update_failed' }), { status: 500 });
      }

      log.info('profile-updated', { profileId: profile.id, matchedBy: profile.matchedBy, eventType: event.type });
      return new Response(JSON.stringify({ received: true, updated: true }), { status: 200 });
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;
      const email = invoice.customer_email ?? null;

      const profile = await findProfile({ customerId, subscriptionId, email });
      if (!profile) {
        log.warn('profile-not-found-on-payment-failed', { customerId, subscriptionId, email });
        return new Response(JSON.stringify({ received: true, profileFound: false }), { status: 200 });
      }

      // D-15: set past_due, leave tier alone
      const { error: updateError } = await supabase.from('profiles').update({
        subscription_status: 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('id', profile.id);

      if (updateError) {
        log.error('profile-update-failed', { profileId: profile.id, error: updateError.message });
        return new Response(JSON.stringify({ error: 'update_failed' }), { status: 500 });
      }

      log.info('payment-failed-recorded', { profileId: profile.id });
      return new Response(JSON.stringify({ received: true, updated: true }), { status: 200 });
    }
  } catch (err) {
    log.error('handler-threw', { error: (err as Error).message, eventId: event.id });
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }

  // Fall-through — shouldn't hit because HANDLED_EVENTS gates above
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

### Migration SQL
```sql
-- supabase/migrations/<timestamp>_stripe_migration.sql

-- Additive profile columns (D-04)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text;

-- Indexes for webhook lookup fallback chain (D-07)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id
  ON public.profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Webhook events idempotency table (D-06)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS — no USING (true), service role bypasses RLS automatically (STR-07, SEC-06 correct pattern)
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- Intentionally no permissive policies. Anon / authenticated have no access.
-- Service role bypasses RLS.

-- Optional helper index for analytics queries
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON public.stripe_webhook_events(created_at DESC);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled HMAC in Deno edge functions | `Stripe.createSubtleCryptoProvider()` + `constructEventAsync` | Stripe Node SDK ≥10 (2022) | Official Deno support; SDK handles tolerance, timing-safe compare, replay protection |
| `npm:stripe` specifier | `esm.sh/stripe@14?target=denonext` | Supabase example canonical since 2024 | Faster cold starts, better Deno compat |
| `subscription.current_period_end` top-level | `subscription.items.data[0].current_period_end` | Stripe SDK v18+ | **Stay on `stripe@14`** for Phase 07 to keep current examples correct; upgrade in a future phase with test coverage |
| Paddle-style SELECT-then-INSERT idempotency | INSERT-only with `23505` catch | Current Postgres best practice | Eliminates race window |

**Deprecated/outdated:**
- `Stripe.generateTestHeaderString()` for tests — known broken on Deno edge runtime (`[CITED: supabase/supabase#26126]`). See Testing section.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pinning `stripe@14?target=denonext` is the safest choice | Standard Stack | LOW — Latest is `22.0.1` and works on Deno, but the Supabase canonical example uses `14`. Using latest risks an API-version/payload incompatibility. Planner can revisit with explicit test coverage. |
| A2 | `subscription.current_period_end` is a top-level unix integer in `stripe@14` payloads | Pitfall 5, code skeleton | MEDIUM — Verified against Stripe docs/SDK v14 types. If wrong, the field is on `items.data[0]` instead. First integration test will surface this. |
| A3 | Inserting only with PK uniqueness is sufficient for idempotency | Pattern 4 | LOW — Postgres `PRIMARY KEY` is an atomic constraint; `23505` is the defined error code. |
| A4 | `stripe_webhook_events` with RLS enabled + no policies is equivalent to "service role only" | Pattern/migration | LOW — Supabase documents this behavior explicitly; service role bypasses RLS. Alternative: explicit `USING (auth.role() = 'service_role')` policy. Both valid; no-policy is simpler. |
| A5 | The 3-fallback lookup (customer_id → subscription_id → email) covers all real-world flows | Pattern 5 | LOW — Identical to Paddle production logic which has worked for the current user base. Stripe additionally preserves `metadata.user_id` as a 4th fallback if needed. |
| A6 | `checkout.sessions.create` with `customer: <id>` + `line_items: [{ price, quantity: 1 }]` + `mode: 'subscription'` is the minimal working set | Code Examples | LOW — Confirmed via Stripe docs. `success_url` / `cancel_url` required (not using embedded UI). |
| A7 | Stripe's default portal configuration must exist before `billingPortal.sessions.create` succeeds | Pitfall 4 | HIGH — This is a real operator task, not a code task. MUST be in the deploy runbook. If missed, first portal call fails with a helpful error but blocks Phase 08. |

## Open Questions

1. **Which Stripe SDK major version to pin long-term?**
   - What we know: `stripe@14?target=denonext` works in the canonical Supabase example. `22.0.1` is latest on esm.sh.
   - What's unclear: Whether v18+ breaking changes to `current_period_end` location warrant staying on 14.
   - Recommendation: **Pin to `stripe@14` for Phase 07.** Open a follow-up ticket to evaluate upgrade after Phase 08 ships and webhook traffic is observed to be stable.

2. **Rate limit thresholds for `create-checkout-session`?**
   - What we know: Other user-auth'd endpoints in the repo use per-tier limits via `checkRateLimit`.
   - What's unclear: Whether checkout should be rate-limited at all (low-frequency operation; one per upgrade).
   - Recommendation: Apply a generous limit (e.g., 10/hr free, 30/hr pro, 60/hr elite) as an abuse gate, not a usage cap. Locked decision delegated to Claude's Discretion (D-65).

3. **Should we fetch Stripe `customers.retrieve` as a 4th lookup fallback via `metadata.user_id`?**
   - What we know: D-22 stores `user_id` in customer metadata. D-17 only requires a 3-fallback chain.
   - What's unclear: Whether the extra Stripe API call per unresolved webhook is worth the reliability boost.
   - Recommendation: **Defer.** The 3-chain is sufficient for STR-02. Add if production logs show profile-not-found events. The customer-retrieve fallback is a ~20-line addition any planner can slot in later.

4. **`success_url` / `cancel_url` — exact frontend routes?**
   - What we know: Phase 08 will define the UI but Phase 07 needs working URLs for end-to-end testing.
   - Recommendation: Use `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}` and `${APP_URL}/pricing?canceled=1`. Phase 08 will either honor these routes or request URL changes via a follow-up; either way it's a 2-line edit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Local dev, migration, deploy | Expected ✓ | 2.76.9+ per `package.json` | — |
| Deno runtime | Edge function execution | Expected ✓ (Supabase Edge) | 2+ | — |
| `esm.sh/stripe@14?target=denonext` | SDK import | ✓ network-fetched at first edge invocation | 14.x | `npm:stripe` specifier (slower cold start) |
| Stripe CLI (for local webhook testing) | Dev validation | Unknown — not repo-managed | — | Skip local test; use test-mode webhook from Stripe Dashboard |
| `STRIPE_SECRET_KEY` secret | All three functions | ✗ — must be added | — | Blocks deploy |
| `STRIPE_WEBHOOK_SECRET` secret | `stripe-webhook` | ✗ — must be added | — | Blocks webhook functionality |
| `STRIPE_PRICE_PRO_MONTHLY` / `_PRO_ANNUAL` / `_ELITE_MONTHLY` / `_ELITE_ANNUAL` | `create-checkout-session`, `stripe-webhook` | ✗ — must be added | — | Blocks checkout + tier resolution |
| Stripe Dashboard: webhook endpoint | `stripe-webhook` | ✗ — operator task | — | Blocks webhook delivery |
| Stripe Dashboard: Customer Portal default config | `create-stripe-portal` | ✗ — operator task, click "Save" once | — | First portal call fails with clear error |
| Stripe Dashboard: 4 Price objects | Env var values | ✗ — operator task | — | Blocks tier assignment |

**Missing dependencies with no fallback:**
- All 6 new Supabase secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 4× price IDs)
- Stripe Dashboard webhook endpoint registration (one per environment)
- Stripe Dashboard Customer Portal default config
- Stripe Dashboard Price objects (Pro monthly, Pro annual, Elite monthly, Elite annual)

**Missing dependencies with fallback:**
- Stripe CLI: tests can use constructed fixtures instead of live CLI forwarding (see Testing section).

**Planner action:** Phase 07 plan MUST include a "Deploy Runbook" task that lists these operator tasks. Code tasks cannot close the phase without the runbook because real webhooks won't fire without the Dashboard config.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno built-in `Deno.test` (matches repo convention; see `supabase/functions/deno.json` and existing `*.test.ts` patterns) |
| Config file | `supabase/functions/deno.json` (import map already present) |
| Quick run command | `deno test --allow-env --allow-net supabase/functions/_shared/stripe-webhook.test.ts` |
| Full suite command | `./scripts/run-edge-tests.ps1` (existing script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STR-01 | Checkout session creation returns valid URL for pro/monthly | unit (mock Stripe client) | `deno test supabase/functions/create-checkout-session/index.test.ts` | ❌ Wave 0 |
| STR-01 | `{tier, interval}` validation rejects invalid combinations with 400 | unit | same file | ❌ Wave 0 |
| STR-01 | Lazy customer creation only calls `stripe.customers.create` when `stripe_customer_id` is null | unit | same file | ❌ Wave 0 |
| STR-02 | Handler routes `customer.subscription.created/updated/deleted` + `invoice.payment_failed` | unit | `deno test supabase/functions/stripe-webhook/index.test.ts` | ❌ Wave 0 |
| STR-02 | Unknown event types return 200 + log (not inserted) | unit | same file | ❌ Wave 0 |
| STR-03 | Signature verification rejects invalid signatures | unit (construct a signed payload manually with HMAC-SHA256) | same file | ❌ Wave 0 |
| STR-03 | `req.text()` is called before any JSON parsing | code inspection + test via spy on `req.json` | same file | ❌ Wave 0 |
| STR-04 | `priceId → tier` resolver returns pro/elite for known, free for unknown | unit | `deno test supabase/functions/_shared/resolve-tier.test.ts` | ❌ Wave 0 |
| STR-04 | `profiles.subscription_tier` write occurs on subscription.created/updated | integration (in-memory Supabase client mock) | `stripe-webhook/index.test.ts` | ❌ Wave 0 |
| STR-05 | Portal session creation requires `stripe_customer_id`, returns `400 no_customer` if missing | unit | `deno test supabase/functions/create-stripe-portal/index.test.ts` | ❌ Wave 0 |
| STR-06 | Migration applies cleanly on a DB with Paddle columns already present | migration test | `supabase migration up --db-url <test>` | manual or CI script |
| STR-07 | `stripe_webhook_events` RLS enabled with no permissive policies | SQL assertion | `deno test supabase/functions/_shared/migration.test.ts` (query `pg_policies`) | ❌ Wave 0 |
| STR-12 | Module fails fast / logs warning when price env vars missing | unit | `resolve-tier.test.ts` | ❌ Wave 0 |
| idempotency | Duplicate event inserts return 200 + `duplicate: true` | integration | `stripe-webhook/index.test.ts` | ❌ Wave 0 |
| graceful cancel | `subscription.deleted` keeps `subscription_tier` unchanged | integration | `stripe-webhook/index.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `deno test --allow-env --allow-net supabase/functions/{create-checkout-session,create-stripe-portal,stripe-webhook}/index.test.ts` (< 30s)
- **Per wave merge:** `./scripts/run-edge-tests.ps1` (full edge test suite)
- **Phase gate:** Full suite green + manual Stripe CLI `stripe listen --forward-to <staging>` smoke test against staging deploy before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/functions/_shared/stripe-client.ts` — new singleton file (implementation, not test)
- [ ] `supabase/functions/create-checkout-session/index.test.ts` — unit tests (mock Stripe client + getServiceClient)
- [ ] `supabase/functions/create-stripe-portal/index.test.ts` — unit tests
- [ ] `supabase/functions/stripe-webhook/index.test.ts` — unit + integration tests
- [ ] `supabase/functions/_shared/resolve-tier.test.ts` — pure-function tests for the price→tier resolver (if extracted to `_shared`)
- [ ] A signed-payload helper: constructing a valid `Stripe-Signature` header for tests via `crypto.subtle.sign` + `t=<unix>,v1=<hex>` format. **Known pitfall:** `Stripe.generateTestHeaderString` from the SDK is broken on Deno edge runtime `[CITED: supabase/supabase#26126]`. Build the helper directly with `crypto.subtle`.

**Signed payload helper sketch:**
```typescript
async function signStripePayload(payload: string, secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}
```

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAuth({ type: 'user' })` for checkout/portal; signature-only for webhook |
| V3 Session Management | yes | Supabase JWT (existing); Stripe session tokens are short-lived and generated per-checkout |
| V4 Access Control | yes | `create-stripe-portal` requires `stripe_customer_id` tied to the JWT-verified user — no cross-user portal access |
| V5 Input Validation | yes | `{tier, interval}` allowlist check; no price ID from client; Stripe payload parsed only after verification |
| V6 Cryptography | yes | **Never hand-roll HMAC** — Stripe SDK's `constructEventAsync` + `createSubtleCryptoProvider` |
| V7 Error Handling & Logging | yes | Structured `createLogger` entries; secrets never logged; reason codes only |
| V9 Communications | yes | HTTPS-only (enforced by Supabase Edge); CORS locked to `APP_URL` (fail-closed via `_shared/cors.ts`) |
| V10 Configuration | yes | Secrets via `Deno.env.get`; no hardcoded price IDs (STR-12) |

### Known Threat Patterns for Deno Stripe Edge Functions

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook replay attack | Spoofing | `constructEventAsync` enforces 300s timestamp tolerance; DB idempotency on `event_id` stops re-plays |
| Client-side tier promotion (user posts `priceId` → elite) | Elevation of Privilege | Backend resolves price ID from `{tier, interval}` + env; client cannot inject |
| Webhook signature forgery | Spoofing | HMAC-SHA256 via SDK on raw `req.text()` |
| Cross-user portal access | Elevation of Privilege | `create-stripe-portal` only opens portal for JWT user's own `stripe_customer_id` |
| RLS bypass via `USING (true)` | Information Disclosure | No permissive policies on `stripe_webhook_events`; service role bypasses RLS naturally |
| Secret leakage to logs | Information Disclosure | `createLogger` never logs secret values; reason codes only |
| `current_period_end` expiration drift | Business Logic | `can_perform_ai_action` SQL function already checks `current_period_end` |
| Missing `user_id` → profile lookup fails → webhook retries forever | Denial of Service | Return 200 on `profile-not-found` to stop Stripe retries; log for ops visibility |

## Sources

### Primary (HIGH confidence)
- [Supabase — Stripe Webhook Edge Function example](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/stripe-webhooks/index.ts) — canonical import URL, `createSubtleCryptoProvider`, `constructEventAsync` usage
- [Supabase — Handling Stripe Webhooks docs](https://supabase.com/docs/guides/functions/examples/stripe-webhooks) — official integration page
- [Stripe — Create a Checkout Session API Reference](https://docs.stripe.com/api/checkout/sessions/create) — required params for subscription mode
- [Stripe — Create a Billing Portal Session](https://docs.stripe.com/api/customer_portal/sessions/create) — `customer` + `return_url` contract
- [Stripe — Configure the customer portal](https://docs.stripe.com/customer-management/configure-portal) — default portal configuration requirement
- `supabase/functions/paddle-webhook/index.ts` — structural template (idempotency, fallback chain, graceful cancel)
- `supabase/migrations/20260122225033_*.sql` — Paddle migration style to mirror
- `supabase/migrations/20260123003842_*.sql` — `can_perform_ai_action` contract the Stripe webhook must preserve
- `supabase/functions/_shared/{auth,cors,supabase-client,logger,rate-limiter}.ts` — reusable plumbing

### Secondary (MEDIUM confidence)
- [stripe-node Deno example - dev.to](https://dev.to/4thzoa/stripe-node-with-deno-1fc4) — community walkthrough confirming `esm.sh?target=denonext` pattern
- [esm.sh/stripe](https://esm.sh/stripe) — current latest version (22.0.1) for reference

### Tertiary (LOW confidence, flagged)
- [supabase/supabase#26126](https://github.com/supabase/supabase/issues/26126) — `Stripe.generateTestHeaderString` broken on Deno edge runtime. Verified by tracking the linked discussion; implication is to build signed-payload helper manually for tests.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against canonical Supabase example + Stripe docs
- Architecture: HIGH — mirrors existing `paddle-webhook` shape verbatim where compatible
- Pitfalls: HIGH — all major pitfalls sourced from Stripe/Supabase docs or reproduced GitHub issues
- SDK version pinning: MEDIUM — `stripe@14` recommended but a newer major may also work; first test pass will surface any payload-shape drift
- Testing helper (signed payload construction): MEDIUM — pattern is standard but Deno-specific helper is custom to this repo

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — Stripe API version pinned, SDK version pinned; Stripe Dashboard config is stable)
