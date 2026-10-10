# Phase 12: stripe-products-and-webhook - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 10 (3 new edge functions/dirs, 1 extended edge function, 1 shared helper promotion, 1 new shared helper, 1 migration, 2 provisioning scripts, 1 test file)
**Analogs found:** 10 / 10 (100% — Phase 07 Stripe stack is the direct template)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/stripe-webhook-handler/index.ts` | controller (webhook) | event-driven / request-response | `supabase/functions/stripe-webhook/index.ts` | exact |
| `supabase/functions/stripe-webhook-handler/index.test.ts` | test | request-response | `supabase/functions/stripe-webhook/index.test.ts` | exact |
| `supabase/functions/stripe-webhook-handler/DEPLOY_RUNBOOK.md` | doc | n/a | `supabase/functions/stripe-webhook/DEPLOY_RUNBOOK.md` | exact |
| `supabase/functions/reset-subscription-merits/index.ts` | controller (internal job) | batch | `supabase/functions/process-resume-analysis-job/index.ts` | role-match (internal-auth + batch loop) |
| `supabase/functions/reset-subscription-merits/index.test.ts` | test | batch | `supabase/functions/stripe-webhook/index.test.ts` | partial (Deno test pattern) |
| `supabase/functions/create-checkout-session/index.ts` (EDIT) | controller | request-response | self (extend with discriminated mode) | exact |
| `supabase/functions/_shared/price-resolver.ts` (PROMOTE) | utility | transform | `supabase/functions/stripe-webhook/price-resolver.ts` | exact (move only) |
| `supabase/functions/_shared/shop-pack-resolver.ts` | utility | transform | `supabase/functions/stripe-webhook/price-resolver.ts` | exact (mirror pattern) |
| `supabase/migrations/2026MMDDHHMMSS_phase_12_stripe_products_webhook.sql` | migration | schema + cron + DO-block backfill | `supabase/migrations/20260310000000_add_keep_warm_cron.sql` + `20260412000000_stripe_migration.sql` + `20260414000000_merit_ledger_foundation.sql` | composite exact |
| `scripts/provision-stripe-products.mjs` | script | one-shot provisioning | `scripts/validate-performance.mjs` (Node .mjs shape only) | role-match |
| `scripts/provision-stripe-coupon.mjs` | script | one-shot provisioning | same | role-match |

## Pattern Assignments

### `supabase/functions/stripe-webhook-handler/index.ts` (controller, event-driven)

**Analog:** `supabase/functions/stripe-webhook/index.ts` (240 lines; structural template — copy the shape and extend `HANDLED_EVENTS` + routing).

**Imports pattern** (lines 20-28):
```typescript
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { handleOptionsRequest } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  getStripeClient,
  getStripeCryptoProvider,
} from "../_shared/stripe-client.ts";
import { resolveTier } from "../_shared/price-resolver.ts"; // PROMOTED from stripe-webhook/
```

**HANDLED_EVENTS allowlist** (lines 30-35) — extend to include:
```typescript
const HANDLED_EVENTS = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",     // NEW
  "invoice.payment_failed",
  "checkout.session.completed",    // NEW
]);
```

**Dep-injection shape for tests** (lines 40-43):
```typescript
export interface StripeWebhookDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
}
export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookDeps = {},
): Promise<Response> { ... }
```

**Method guard + raw-body-first signature verification** (lines 58-99, copy VERBATIM):
```typescript
if (req.method === "OPTIONS") return handleOptionsRequest({ type: "webhook" });
if (req.method !== "POST")    return jsonResponse({ error: "method_not_allowed" }, 405);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const signature = req.headers.get("stripe-signature");

// STR-03: raw body MUST be read before any parse
const rawBody = await req.text();

if (!webhookSecret) { log.warn("signature-verify-failed", { reason: "secret-missing" }); return jsonResponse({ error: "invalid_signature" }, 401); }
if (!signature)     { log.warn("signature-verify-failed", { reason: "header-missing" }); return jsonResponse({ error: "invalid_signature" }, 401); }

const stripe = deps.stripe ?? getStripeClient();
const cryptoProvider = getStripeCryptoProvider();

let event: Stripe.Event;
try {
  event = await stripe.webhooks.constructEventAsync(
    rawBody, signature, webhookSecret, undefined, cryptoProvider,
  );
} catch (err) {
  log.warn("signature-verify-failed", {
    reason: "constructEventAsync-throw",
    message: err instanceof Error ? err.message : "unknown",
  });
  return jsonResponse({ error: "invalid_signature" }, 400);
}
```

**Unknown-event short-circuit BEFORE idempotency insert** (lines 103-109):
```typescript
if (!HANDLED_EVENTS.has(event.type)) {
  log.info("event-ignored", { eventId: event.id, type: event.type });
  return jsonResponse({ received: true, ignored: true, type: event.type }, 200);
}
```

**Insert-first idempotency with 23505 catch** (lines 113-130 — copy VERBATIM, reuse same `stripe_webhook_events` table per D-10):
```typescript
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

**Graceful cancel for `customer.subscription.deleted`** (lines 176-180 — copy VERBATIM; D-14 invariant):
```typescript
if (event.type === "customer.subscription.deleted") {
  // D-14: graceful cancel — status only, tier stays so the user retains
  // access through current_period_end (can_perform_ai_action enforces).
  updateData.subscription_status = "canceled";
}
```

**`invoice.payment_failed` → past_due** (lines 140-151 — copy VERBATIM; D-15 carry-forward).

**Stripe unix-seconds → ISO timestamp** (lines 169-174 — copy VERBATIM; Pitfall 2):
```typescript
if (sub.current_period_end) {
  updateData.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
}
```

**Profile fallback lookup chain** (lines 189-229 — copy the `tryUpdate` helper VERBATIM, PREPEND a `metadata.user_id` first-try for `checkout.session.completed` per D-11):
```typescript
const tryUpdate = async (column: string, value: string | null): Promise<boolean> => {
  if (!value) return false;
  const { data, error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq(column, value)
    .select("email");
  if (error) { log.warn("profile-update-failed", { column }); return false; }
  return Array.isArray(data) && data.length > 0;
};

let matchedBy: string | null = null;
// Phase 12 EXTENSION — only for checkout.session.completed:
if (event.type === "checkout.session.completed") {
  const metaUserId = (event.data.object as any).metadata?.user_id ?? null;
  if (metaUserId && await tryUpdateById(metaUserId)) matchedBy = "metadata_user_id";
}
if (!matchedBy && await tryUpdate("stripe_customer_id", customerId))       matchedBy = "stripe_customer_id";
else if (!matchedBy && await tryUpdate("stripe_subscription_id", subscriptionId)) matchedBy = "stripe_subscription_id";
else if (!matchedBy && await tryUpdate("email", customerEmail))                   matchedBy = "email";

if (!matchedBy) {
  log.info("profile-not-found", { eventId: event.id, type: event.type });
  return jsonResponse({ received: true, profileFound: false }, 200); // D-12 out-of-order tolerance
}
```

**Production entry point** (line 240 — copy VERBATIM):
```typescript
Deno.serve((req) => handleStripeWebhook(req));
```

**New routing logic (Phase 12-specific, not in analog — pattern from RESEARCH.md §Code Examples):**
- `checkout.session.completed` (mode='subscription') → `reset_subscription_merits` RPC for month-0 grant
- `checkout.session.completed` (mode='payment') → `credit_shop_merits` RPC
- `customer.subscription.updated` with upgrade → `grant_upgrade_diff` RPC (Phase 11 contract ask)
- `customer.subscription.updated` with downgrade → write `profiles.pending_downgrade_tier`
- `invoice.payment_succeeded` (monthly only) → `reset_subscription_merits`; yearly → NO-OP (detect via `sub.items.data[0].price.recurring.interval === 'year'`)

---

### `supabase/functions/reset-subscription-merits/index.ts` (controller, batch)

**Analog:** `supabase/functions/process-resume-analysis-job/index.ts` (internal-auth + batch-loop pattern) combined with structural shape of `stripe-webhook/index.ts` (deps injection, createLogger).

**Internal-secret auth guard** (from `process-resume-analysis-job/index.ts:48-61`):
```typescript
serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptionsRequest({ type: 'internal' });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { "Content-Type": "application/json" },
  });
  try {
    await requireAuth(req, { type: 'internal' });
    // ... batch logic
  }
});
```

**Logger construction** (from `stripe-webhook/index.ts:56`):
```typescript
const log = createLogger("reset-subscription-merits");
```

**Batch select + per-row RPC loop** (pattern skeleton from RESEARCH.md §Code Examples, lines 661-712). Key invariant from D-25:
- `BATCH_SIZE = 1000`
- Select `user_merits` WHERE `subscription_reset_date <= now()` AND joined `profiles.subscription_tier IN ('pro','elite')`
- Loop calling `reset_subscription_merits(p_user_id, p_tier, p_next_reset_date)`
- Return `{ processed, errors, remaining }` — pg_cron polls until `remaining == 0`

**Deps injection for tests** (mirror `StripeWebhookDeps` shape):
```typescript
export interface ResetSubscriptionMeritsDeps {
  supabase?: SupabaseLike;
}
export async function handleResetSubscriptionMerits(
  req: Request,
  deps: ResetSubscriptionMeritsDeps = {},
): Promise<Response> { ... }
```

---

### `supabase/functions/create-checkout-session/index.ts` (EDIT — extend with discriminated mode)

**Self-analog:** existing file is the direct base. Reuse everything from lines 1-145 (auth, rate-limit, lazy customer creation, logger). Split the body parse (lines 101-112) and session creation (lines 147-156) into a `mode` switch.

**Existing rate-limit pattern to EXTEND** (lines 91-98):
```typescript
const rl = await rateLimitFn(ctx.userId, ctx.tier, {
  key: "create-checkout-session",
  limits: { free: 10, pro: 30, elite: 60 },
  windowSeconds: 3600,
});
if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, "user");
```

**Phase 12 addition:** add a second `checkRateLimit` call for shop mode ONLY per D-19:
```typescript
if (body.mode === 'payment') {
  // SHOP-12: 10 / user / hour across all tiers
  const rl2 = await rateLimitFn(ctx.userId, ctx.tier, {
    key: "create-checkout-session-shop",
    limits: { free: 10, pro: 10, elite: 10 },
    windowSeconds: 3600,
  });
  if (!rl2.allowed) return createRateLimitResponse(rl2.retryAfterSeconds, "user");
}
```

**Existing Checkout Session creation to branch on mode** (lines 147-156 — keep for subscription, add payment branch):
```typescript
// Current (subscription mode):
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customerId!,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${appUrl}/pricing?canceled=1`,
  client_reference_id: ctx.userId,
  metadata: { user_id: ctx.userId, tier, interval },
});
```

**Phase 12 payment branch** (RESEARCH.md lines 402-430) — mirror the same shape but set `mode: 'payment'`, resolve price via `shop-pack-resolver.ts` (new), set `metadata: { user_id, pack_size }`, AND set `payment_intent_data.metadata` so the PI carries identity (Pitfall 9). Success URL stays `/billing/success`; cancel URL becomes `/shop?canceled=1`.

**Body-type discriminated union** (new, replaces line 101-112 body parse):
```typescript
type CheckoutBody =
  | { mode: 'subscription'; tier: 'pro' | 'elite'; interval: 'monthly' | 'annual' }
  | { mode: 'payment'; pack_size: 3 | 10 | 25 | 50 };
```

---

### `supabase/functions/_shared/price-resolver.ts` (PROMOTE from `stripe-webhook/price-resolver.ts`)

**Analog:** `supabase/functions/stripe-webhook/price-resolver.ts` — move verbatim. Both `stripe-webhook-handler` and `create-checkout-session` import it. Update `createLogger('price-resolver')` import path to `./logger.ts`. Leave the original file in `stripe-webhook/` untouched (D-06: do not edit the old handler).

---

### `supabase/functions/_shared/shop-pack-resolver.ts` (NEW — mirror price-resolver pattern)

**Analog:** `supabase/functions/stripe-webhook/price-resolver.ts` lines 27-39 (env-var-driven map, rebuilt per-call so tests can mutate env).

**Pattern to copy:**
```typescript
import { createLogger } from './logger.ts';
const log = createLogger('shop-pack-resolver');

export type PackSize = 3 | 10 | 25 | 50;

export function buildShopPackMap(): Record<string, PackSize> {
  const map: Record<string, PackSize> = {};
  const pairs: Array<[string | undefined, PackSize]> = [
    [Deno.env.get('STRIPE_PRICE_MERIT_3'),  3],
    [Deno.env.get('STRIPE_PRICE_MERIT_10'), 10],
    [Deno.env.get('STRIPE_PRICE_MERIT_25'), 25],
    [Deno.env.get('STRIPE_PRICE_MERIT_50'), 50],
  ];
  for (const [id, size] of pairs) if (id) map[id] = size;
  return map;
}

export function resolvePackSize(priceId: string | null | undefined): PackSize | null {
  if (!priceId) return null;
  const hit = buildShopPackMap()[priceId];
  if (!hit) { log.warn('unknown-shop-price-id', { priceId }); return null; }
  return hit;
}

export function resolveShopPriceId(packSize: PackSize): string | null {
  const key = `STRIPE_PRICE_MERIT_${packSize}`;
  return Deno.env.get(key) ?? null;
}
```

---

### `supabase/migrations/2026MMDDHHMMSS_phase_12_stripe_products_webhook.sql` (migration)

**Analog 1 (additive columns + RLS posture):** `supabase/migrations/20260412000000_stripe_migration.sql` lines 6-36.

**Pattern to copy — additive column + "no permissive policy" comment:**
```sql
-- Phase 12: stripe-products-and-webhook — additive only.
-- CRITICAL: Do NOT add any permissive policy that matches all rows (SEC-06 anti-pattern).
-- Service role bypasses RLS automatically — that is the only legitimate write path.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_downgrade_tier text NULL;
-- No index needed — column is read only on `customer.subscription.updated` event resolution.
```

**Analog 2 (pg_cron + pg_net.http_post scheduling):** `supabase/migrations/20260310000000_add_keep_warm_cron.sql` lines 12-22.

**Pattern to copy (adapt cadence to `*/15 * * * *` per RESEARCH recommendation):**
```sql
SELECT cron.schedule(
  'reset-subscription-merits-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/reset-subscription-merits',
    headers := '{"Content-Type": "application/json", "x-internal-job-secret": "<vault-secret>"}'::jsonb,
    body    := '{"invocation_source": "pg_cron"}'::jsonb
  );
  $$
);
```

**Operator-note pattern to copy from keep-warm migration lines 3-10:**
```sql
-- IMPORTANT: Runs per-environment via Supabase SQL editor (not supabase db push)
-- because the URL and internal secret differ per project.
-- Staging:    https://cimjltzovkahkqecpwgi.supabase.co
-- Production: https://zjpjapgraoxdukdvpjes.supabase.co
```

**Analog 3 (DO-block backfill with RAISE guard):** `supabase/migrations/20260414000000_merit_ledger_foundation.sql` header comment style + existing DO-block backfill conventions. MIG-03 backfill per CONTEXT D-15:
- Check `pg_proc` for `reset_subscription_merits` and `grant_upgrade_diff`; `RAISE EXCEPTION 'Phase 11 RPCs not deployed'` if missing.
- Loop `profiles WHERE subscription_tier IN ('pro','elite') AND subscription_status = 'active'`.
- Call `reset_subscription_merits` per row with `p_next_reset_date = now() + interval '1 month'`.
- Write `merit_transactions` row with `source = 'phase-12-backfill'` (mirrors Phase 10 D-15 convention).

---

### `scripts/provision-stripe-products.mjs` and `scripts/provision-stripe-coupon.mjs` (NEW)

**Analog:** `scripts/validate-performance.mjs` (lines 1-28) for the `.mjs` Node entry point + arg parsing shape. Otherwise, the `retrieve-or-create` idempotency pattern is original (RESEARCH.md §Pattern 4).

**Shebang + imports pattern to copy:**
```javascript
#!/usr/bin/env node
/**
 * Phase 12: idempotent Stripe product/price provisioning.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... node scripts/provision-stripe-products.mjs --env staging
 *   STRIPE_SECRET_KEY=sk_... node scripts/provision-stripe-products.mjs --env staging --check
 *
 * Writes resolved Price IDs to stdout for the operator to copy into
 * `supabase secrets set STRIPE_PRICE_MERIT_3=...`.
 */
import Stripe from 'stripe';
```

**Idempotency helper** (RESEARCH.md lines 462-479):
```javascript
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
```

Same shape for products and prices — caller-supplied `id` via `lookup_key` on Price, or retrieve-by-metadata then create.

---

### `supabase/functions/stripe-webhook-handler/index.test.ts`

**Analog:** `supabase/functions/stripe-webhook/index.test.ts` — exact test structure (deps injection, `signStripePayload` for signing, `_resetForTests` between blocks, env setup via `setTestEnv()`).

**Imports pattern** (lines 10-22):
```typescript
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStripeWebhook } from "./index.ts";
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";
import {
  makeCheckoutSessionCompletedEvent,  // NEW fixture
  makeInvoicePaymentSucceededEvent,     // NEW fixture
  makeInvoicePaymentFailedEvent,
  makeSubscriptionCreatedEvent,
  makeSubscriptionDeletedEvent,
  makeSubscriptionUpdatedEvent,
} from "../_shared/test-helpers/stripe-fixtures.ts";
import { _resetForTests as resetStripeClient } from "../_shared/stripe-client.ts";
```

**Test-env setup pattern** (lines 31-39) — extend with shop price env vars `STRIPE_PRICE_MERIT_3/10/25/50`.

**The load-bearing test (TEST-08 / NFR-06 Success Criterion #4):** deliver the exact same event JSON twice, assert balance delta on the second call is zero.

---

## Shared Patterns

### Authentication
**Source:** `supabase/functions/_shared/auth.ts`
**Apply to:**
- `stripe-webhook-handler` → `handleOptionsRequest({ type: 'webhook' })` (no auth check; SDK signature is the auth)
- `reset-subscription-merits` → `requireAuth(req, { type: 'internal' })` (internal-job-secret via `timingSafeEqual`)
- `create-checkout-session` → `requireAuth(req, { type: 'user' })` (existing)

**Invariant:** signature verification lives in the webhook handler body, NOT in `_shared/auth.ts`. Do not add a webhook auth type that does HMAC.

### Stripe SDK instance + crypto provider
**Source:** `supabase/functions/_shared/stripe-client.ts` lines 18-32
**Apply to:** all three Phase 12 edge functions.
```typescript
import { getStripeClient, getStripeCryptoProvider } from "../_shared/stripe-client.ts";
const stripe = deps.stripe ?? getStripeClient();
const cryptoProvider = getStripeCryptoProvider();
```
**Never:** call `new Stripe(...)` directly in feature code. `_resetForTests()` is the test-only escape hatch.

### Structured logging
**Source:** `supabase/functions/_shared/logger.ts` via `createLogger(fn)`
**Apply to:** every Phase 12 function.
```typescript
const log = createLogger("stripe-webhook-handler");
log.info("event-processed", { eventId, type, matchedBy });
log.warn("signature-verify-failed", { reason: "..." });  // reason codes, NEVER secret values
log.error("event-persist-failed", { eventId, code });
```

### Idempotency (insert-first + 23505 catch)
**Source:** `supabase/functions/stripe-webhook/index.ts` lines 113-130
**Apply to:** `stripe-webhook-handler` for ALL events in `HANDLED_EVENTS`. D-10: reuse the `stripe_webhook_events` table; do not create `stripe_webhook_v2_events`. Layer 2 defense-in-depth: `merit_shop_purchases.stripe_payment_intent_id` UNIQUE constraint (Phase 10 schema) inside `credit_shop_merits` RPC.

### Rate limiting
**Source:** `supabase/functions/_shared/rate-limiter.ts` lines 80-113
**Apply to:** `create-checkout-session` ONLY — two independent `checkRateLimit` calls, one for subscription mode (existing) and one for shop mode (new SHOP-12 policy 10/hour for all tiers).
**Never:** re-enforce in `stripe-webhook-handler` (D-19: webhook honors any valid PI).

### CORS
**Source:** `supabase/functions/_shared/cors.ts` via `handleOptionsRequest({ type: ... })`
**Apply to:**
- `create-checkout-session` → `{ type: 'user' }` (existing; APP_URL allowlist)
- `stripe-webhook-handler` → `{ type: 'webhook' }` (no CORS headers on response)
- `reset-subscription-merits` → `{ type: 'internal' }` (no CORS headers)

### Service-role Supabase client singleton
**Source:** `supabase/functions/_shared/supabase-client.ts` via `getServiceClient()`
**Apply to:** every Phase 12 function. Deps-inject for tests:
```typescript
const supabase = deps.supabase ?? getServiceClient();
```

### Out-of-order / missing-profile tolerance
**Source:** `supabase/functions/stripe-webhook/index.ts` lines 218-228
**Apply to:** `stripe-webhook-handler` profile lookup. Missing profile → 200 + `profile-not-found` log, NEVER 5xx (D-12, NFR-07, Pitfall 3). Stripe's 72h retry window handles catch-up.

### Unix-seconds → ISO timestamp conversion
**Source:** `supabase/functions/stripe-webhook/index.ts` lines 169-174
**Apply to:** any place the new handler reads `current_period_end`, `created`, etc. from Stripe objects. Pitfall 2.

### Additive migration posture
**Source:** `supabase/migrations/20260412000000_stripe_migration.sql` lines 1-5 header comment, lines 29-32 RLS posture
**Apply to:** Phase 12 migration header + any new table (if any — recommendation is column-only). No DROP, no RENAME, RLS `ENABLE` with zero permissive policies.

### pg_cron + pg_net operator-note
**Source:** `supabase/migrations/20260310000000_add_keep_warm_cron.sql` lines 3-10
**Apply to:** Phase 12 migration header comment. Document per-environment URL + runbook-step application (not `supabase db push`).

## No Analog Found

None. Every Phase 12 file has a direct or close analog in the current codebase. The Phase 07 Stripe stack (`stripe-webhook/`, `create-checkout-session/`, `_shared/stripe-client.ts`, `stripe_migration.sql`) plus the keep-warm cron migration is a complete structural template.

**One partial gap:** there is no existing Node `.mjs` Stripe provisioning script in `scripts/`. `scripts/validate-performance.mjs` provides the entry-point shape (shebang, arg parsing, `--env` flag convention) but the `retrieve-or-create` idempotency pattern and `caller-supplied id` technique are original to Phase 12 (documented in RESEARCH.md §Pattern 4).

## Metadata

**Analog search scope:**
- `supabase/functions/stripe-webhook/` (all 5 files)
- `supabase/functions/create-checkout-session/` (2 files)
- `supabase/functions/_shared/` (stripe-client, auth, rate-limiter, cors, logger, supabase-client)
- `supabase/functions/process-resume-analysis-job/` (internal-auth batch pattern)
- `supabase/functions/keep-warm/` (reference only)
- `supabase/migrations/` (stripe_migration, merit_ledger_foundation, keep_warm_cron)
- `scripts/` (validate-performance.mjs)

**Files scanned:** 14
**Pattern extraction date:** 2026-04-15

---

## PATTERN MAPPING COMPLETE

**Phase:** 12 - stripe-products-and-webhook
**Files classified:** 11 (3 new edge fns, 1 edited edge fn, 1 shared promotion, 1 new shared helper, 1 migration, 2 provisioning scripts, 1 test file, 1 runbook)
**Analogs found:** 11 / 11 (exact-match on 8, role-match on 3)

### Coverage
- Files with exact analog: 8 (all Stripe webhook surfaces + checkout extension + price-resolver clone + migration composites)
- Files with role-match analog: 3 (reset-subscription-merits internal-auth batch, provisioning .mjs scripts)
- Files with no analog: 0

### Key Patterns Identified
- **Phase 07 `stripe-webhook/index.ts` is the structural template** — the new `stripe-webhook-handler` copies 90%+ of its shape (raw-body, SDK signature verify, insert-first idempotency, tryUpdate fallback chain, deps injection, `Deno.serve` entry point) and extends only the `HANDLED_EVENTS` set + per-event routing.
- **All Merit math lives in Phase 11 RPCs** — the webhook handler is a thin router that calls `reset_subscription_merits`, `credit_shop_merits`, `grant_upgrade_diff`. Never do balance arithmetic in TypeScript.
- **pg_cron + pg_net.http_post is the project-standard cold-path pattern** (`20260310000000_add_keep_warm_cron.sql`). Phase 12 reuses it verbatim for the `reset-subscription-merits-sweep` job.
- **Idempotency is two-layer:** `stripe_webhook_events` UNIQUE on event_id (layer 1) + `merit_shop_purchases.stripe_payment_intent_id` UNIQUE in Phase 10 schema (layer 2). Defense in depth for TEST-08.
- **Dep-injection via `deps: { supabase, stripe }` parameter** is the established test-hook shape (Phase 07) — carries forward to all three Phase 12 edge functions for Deno test injection.
- **Stripe SDK pin is load-bearing:** `https://esm.sh/stripe@14?target=denonext` + `apiVersion: '2024-11-20'` + `Stripe.createSubtleCryptoProvider()`. Do not bump or hand-roll HMAC.

### File Created
`.planning/phases/12-stripe-products-and-webhook/12-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference concrete code excerpts (by file path + line number) when writing plan actions.
