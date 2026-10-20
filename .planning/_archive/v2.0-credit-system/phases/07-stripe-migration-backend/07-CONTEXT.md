# Phase 07: Stripe Migration — Backend - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the Paddle backend with Stripe: three new edge functions (`create-checkout-session`, `stripe-webhook`, `create-stripe-portal`), additive DB schema for Stripe IDs, env-driven price→tier mapping, and idempotent webhook handling that preserves the existing graceful-cancellation contract. **Backend only** — frontend Paddle removal and UI rewiring live in Phase 08.

Out of scope for this phase:
- Frontend pricing page / checkout button rewiring (Phase 08)
- Removal of `paddle-webhook` edge function, `paddle_*` profile columns, or `paddle_webhook_events` table (later cleanup phase after Phase 08 ships)
- New tiers, trials, or billing models

</domain>

<decisions>
## Implementation Decisions

### Cutover & Coexistence
- **D-01:** Coexistence strategy — deploy Stripe functions and schema alongside Paddle. `paddle-webhook` stays deployed and functional throughout Phase 07; it simply stops receiving real traffic once Phase 08 cuts the frontend over. Rollback = re-point frontend at Paddle.
- **D-02:** No dual-write. Only one provider writes to a given profile row at a time. During Phase 07 deploy, all real traffic is still Paddle; Stripe paths are exercised via test events only.
- **D-03:** Paddle cleanup (delete edge function, drop `paddle_*` columns, drop `paddle_webhook_events`) is explicitly deferred to a post-Phase-08 cleanup phase — NOT part of Phase 07.

### Schema Migration
- **D-04:** Additive migration on `profiles` — add `stripe_customer_id text`, `stripe_subscription_id text`, `stripe_price_id text`. Keep all existing `paddle_*` columns untouched.
- **D-05:** Reuse the existing provider-agnostic columns `subscription_tier`, `subscription_status`, `current_period_end`. Do NOT namespace them per provider. The Stripe webhook writes the same columns the Paddle webhook writes.
- **D-06:** New table `public.stripe_webhook_events` mirrors `paddle_webhook_events` shape: `event_id text primary key`, `event_type text`, `payload jsonb`, `created_at timestamptz default now()`. RLS enabled with service_role-only policy — **no `USING (true)` policy** (STR-07).
- **D-07:** Indexes: `stripe_customer_id` and `stripe_subscription_id` on `profiles` (for webhook lookup fallback paths, mirroring the Paddle pattern).

### Price ID Env Layout
- **D-08:** Four discrete secrets, one per SKU: `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`. No JSON blobs, no hardcoded fallbacks (STR-12).
- **D-09:** `create-checkout-session` input contract: `{ tier: 'pro' | 'elite', interval: 'monthly' | 'annual' }`. Backend validates both fields against a fixed allowlist and resolves to a price ID server-side. **Frontend never handles price IDs.**
- **D-10:** `stripe-webhook` builds a reverse map `priceId → { tier, interval }` at module load from the same 4 env vars. Unknown price IDs map to `'free'` and log a warning (not a hard failure — prevents a bad env var from crashing the webhook).
- **D-11:** Staging and production use different Stripe price IDs via standard per-environment secrets (no app-level branching).

### Webhook Events & Idempotency
- **D-12:** Handled events — exactly the four required by STR-02: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. All other events return `200 OK` with a log line (so Stripe stops retrying) and are NOT inserted into `stripe_webhook_events`.
- **D-13:** Idempotency — insert `event_id` into `stripe_webhook_events` before processing. On duplicate (unique violation), return 200 immediately. Same pattern `paddle-webhook` uses today.
- **D-14:** Graceful cancellation preserved — on `customer.subscription.deleted`, set `subscription_status = 'canceled'` but **do NOT change `subscription_tier`**. The existing `can_perform_ai_action` SQL function already checks `current_period_end` to expire access. This keeps the "paid through period end" contract users already have from Paddle.
- **D-15:** `invoice.payment_failed` sets `subscription_status = 'past_due'` and leaves `subscription_tier` alone (same as existing Paddle path).
- **D-16:** `customer.subscription.created` / `.updated` — write `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `subscription_tier` (resolved from reverse map), `subscription_status` (from Stripe `status`), and `current_period_end` (from `current_period_end` unix → ISO).
- **D-17:** Profile lookup order when processing a webhook: (1) by `stripe_customer_id`, (2) by `stripe_subscription_id`, (3) by `customer.email` from Stripe. Missing user = log + 200 (don't make Stripe retry indefinitely).

### Stripe SDK & Signature Verification
- **D-18:** Use the official Stripe SDK via `https://esm.sh/stripe?target=deno`. Rationale: signature verification is the #1 Stripe integration footgun and the SDK's `webhooks.constructEventAsync` handles HMAC-SHA256 with timestamp tolerance correctly. STR-03 is still satisfied — the SDK verifies over the raw body obtained via `req.text()` before any JSON parsing; this is actually how the SDK expects to be called.
- **D-19:** Use SDK for checkout session creation (`stripe.checkout.sessions.create`) and portal session creation (`stripe.billingPortal.sessions.create`). No raw fetch to `api.stripe.com` anywhere in this phase.
- **D-20:** One shared helper in `supabase/functions/_shared/` builds the Stripe client from `STRIPE_SECRET_KEY`. Reuse across all three new functions.

### Customer Creation Timing
- **D-21:** Lazy customer creation on first checkout. `create-checkout-session` reads `profiles.stripe_customer_id`; if null, calls `stripe.customers.create({ email, metadata: { user_id } })`, writes the ID back to the profile, **then** creates the Checkout Session with `customer: <id>`. This avoids paying for Stripe customer records for users who never upgrade.
- **D-22:** Pass `user_id` in Stripe customer metadata so webhooks have a reliable lookup fallback beyond email.
- **D-23:** `create-stripe-portal` requires an existing `stripe_customer_id` — returns `400 no_customer` if the profile has none. Frontend (Phase 08) will only show the "Manage Billing" button to users with an active/past subscription.

### Auth & CORS
- **D-24:** `create-checkout-session` and `create-stripe-portal` use `requireAuth` (user JWT) from `_shared/auth.ts`. `stripe-webhook` uses webhook auth type — no CORS, no JWT, signature is the only credential. Same pattern as `paddle-webhook`.
- **D-25:** CORS for the two user-facing functions follows the existing `APP_URL` allowlist in `_shared/cors.ts`.

### Claude's Discretion
- Exact column types/precision on the migration (e.g., `text` vs `varchar`) — follow existing repo conventions.
- Logging format inside Stripe functions — reuse `createLogger('stripe-webhook', reqId)` pattern.
- Whether to extract a shared `resolveTierFromPriceId` helper — judgment call based on duplication.
- Error response body shape for `create-checkout-session` / `create-stripe-portal` — follow existing edge function conventions.
- Whether to add a `checkRateLimit` gate on `create-checkout-session` (likely yes, consistent with other user-auth'd endpoints, but planner decides threshold).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — STR-01 through STR-07, STR-12 (the 8 requirements this phase closes)

### Existing Paddle Implementation (reference pattern, not target)
- `supabase/functions/paddle-webhook/index.ts` — idempotency pattern, signature verify shape, profile update fallback chain, graceful cancellation logic (lines 252–259). Stripe webhook should mirror the structural choices but NOT copy the hand-rolled HMAC code.
- `supabase/migrations/20260122225033_1d494822-3e8b-4d51-bd74-993a4795241a.sql` — original migration that added `subscription_status`, `paddle_customer_id`, `current_period_end`. New Stripe migration should be additive in the same style.
- `supabase/migrations/20260123003842_abc396d4-222f-4076-bba0-12c3dc9e1b6b.sql` — `can_perform_ai_action` implementation that enforces `current_period_end` for canceled subs. Stripe cancellation logic MUST remain compatible with this function (no schema changes needed).

### Shared Utilities (reuse, don't fork)
- `supabase/functions/_shared/auth.ts` — `requireAuth` for user-facing functions, webhook auth mode for `stripe-webhook`
- `supabase/functions/_shared/cors.ts` — `handleOptionsRequest`, `corsHeaders`, `APP_URL` allowlist
- `supabase/functions/_shared/supabase-client.ts` — `getServiceClient()` for DB writes
- `supabase/functions/_shared/logger.ts` — `createLogger(fn, reqId)` structured logging
- `supabase/functions/_shared/rate-limiter.ts` — `checkRateLimit` (consider for `create-checkout-session`)

### Stripe SDK
- `https://esm.sh/stripe?target=deno` — official SDK, used for client creation, checkout/portal sessions, and webhook signature verification (`stripe.webhooks.constructEventAsync`)

### Project
- `.planning/PROJECT.md` — "Full rip-and-replace of Paddle" decision; Pro/Elite monthly+annual scope
- `.planning/ROADMAP.md` §Phase 07 — phase goal and requirement list
- `.planning/v1.0-MILESTONE-AUDIT.md` §STR-01..07, STR-12 — orphaned requirement evidence

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`paddle-webhook/index.ts`** — Structural template for idempotency, profile lookup fallback chain, graceful cancellation. Copy the *shape*, not the signature-verification code.
- **`_shared/auth.ts`** — `requireAuth` already handles user JWT; webhook auth mode already exists for the Paddle webhook and can be reused by the Stripe one.
- **`_shared/cors.ts`** — APP_URL allowlist and `handleOptionsRequest` already fail-closed; new checkout/portal functions plug in directly.
- **`_shared/supabase-client.ts`** — `getServiceClient()` singleton used by every existing webhook.
- **`_shared/logger.ts`** — `createLogger` structured JSON logging already used across 20+ edge functions.
- **`_shared/rate-limiter.ts`** — per-user sliding window counter, suitable for gating `create-checkout-session`.

### Established Patterns
- **Edge function layout:** `supabase/functions/<name>/index.ts` with `Deno.serve((req) => ...)`, CORS preflight handled first, auth second, work third, structured error responses.
- **Idempotency:** dedicated `*_webhook_events` table per provider, insert-first-then-process, duplicate → 200.
- **Graceful cancellation via `can_perform_ai_action`:** keep tier until `current_period_end`; only flip `subscription_status`. Stripe webhook MUST preserve this contract.
- **Env-var-driven mappings:** constants at module top sourced from `Deno.env.get(...)` rather than hardcoded — matches STR-12.
- **Profile lookup fallback chain:** email → customer_id → subscription_id. Stripe webhook should replicate.

### Integration Points
- **Database:** `profiles` table columns; new `stripe_webhook_events` table; `can_perform_ai_action` SQL function (read-compat only — no signature change).
- **Edge runtime:** Three new entries under `supabase/functions/`. Deployment via `supabase functions deploy` scripts in `scripts/`.
- **Frontend (Phase 08 dependency):** Phase 08 will call `create-checkout-session` with `{tier, interval}` and redirect to the returned `url`. The input contract locked here (D-09) is the Phase 08 interface.
- **Supabase secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL` — must be set in staging and production before deploy.

</code_context>

<specifics>
## Specific Ideas

- **Signature verification via SDK, not hand-rolled** — the SDK's `constructEventAsync` is the only acceptable path. Reviewer will reject any custom HMAC verify code for Stripe.
- **Webhook lookup fallback by `metadata.user_id`** — Stripe customer records created in `create-checkout-session` MUST include `metadata: { user_id }`. This gives the webhook a third, most-reliable fallback.
- **Stripe events that are NOT handled** (including `checkout.session.completed`) still return 200 with a log line so Stripe stops retrying. Do not return 4xx for unknown event types.

</specifics>

<deferred>
## Deferred Ideas

- **Additional webhook events** (`invoice.paid`, `checkout.session.completed`, `customer.subscription.trial_will_end`) — may be added later for richer observability, but not required for STR-01..07/12 closure.
- **Retry observability columns** (`processed_at`, `attempt_count`, `last_error`) on `stripe_webhook_events` — deferred unless debugging need arises.
- **Removing Paddle entirely** (delete `paddle-webhook`, drop `paddle_*` columns, drop `paddle_webhook_events`) — post-Phase-08 cleanup phase.
- **Generic provider columns** (`provider`, `customer_id`, `subscription_id`, `price_id` with a `provider` discriminator) — rejected for this phase; too large a refactor. Could be revisited if a third provider is ever added.
- **Trial periods / promo codes / coupons** — not in scope for v1.0.
- **Stripe Tax / VAT handling** — not in scope; revisit if international expansion becomes a requirement.

</deferred>

---

*Phase: 07-stripe-migration-backend*
*Context gathered: 2026-04-12*
