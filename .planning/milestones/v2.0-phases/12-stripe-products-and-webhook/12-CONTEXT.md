# Phase 12: stripe-products-and-webhook - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up Stripe as primary checkout (subscriptions + Merit shop) with a signed, idempotent, replay-safe webhook handler covering the full subscription lifecycle AND the Merit grant/reset/shop-credit flows. Ship 4 subscription Prices + 4 one-time shop Prices, extend `create-checkout-session` to support `payment` mode, introduce a new `stripe-webhook-handler` edge function that supersedes the Phase 07 `stripe-webhook`, add the `reset-subscription-merits` edge function batched by pg_cron, backfill existing active subscribers, and preserve the `agk02110` promo coupon. Closes SUB-01..15, SHOP-01..04, SHOP-06, SHOP-07, SHOP-09, SHOP-11, SHOP-12, BACK-02..05, NFR-04, NFR-06..08, MIG-03, MIG-06, TEST-08.

**Out of scope for this phase:**

* Merit deduction / `check-and-deduct-merits` gateway — Phase 13
* `MERIT_SYSTEM_ENABLED` feature flag cutover — Phase 13
* Frontend `/pricing` UI, Merit Shop UI, cost preview components — Phase 20
* Deleting the legacy Phase 07 `stripe-webhook` function — Phase 21 cutover cleanup
* Any tier-prompt gating, rate-limit thresholds beyond SHOP-12 — Phase 13/14
* Paddle cleanup (already deferred since Phase 07)

</domain>

<decisions>
## Implementation Decisions

### Yearly Merit Grant Mechanism (SUB-11, SUB-12, NFR-08)

* **D-01:** **Hybrid model.** `checkout.session.completed` in subscription mode grants the month-0 allowance (75 Pro / 150 Elite) immediately via an RPC call. A nightly `pg_cron` job then sweeps yearly (and monthly) subscribers whose `next_reset_date <= now()` and triggers the next monthly grant. Rationale: hot-path purchase experience stays webhook-driven (zero user-visible delay), cold-path refills live in one self-healing sweep, and no coupling to Stripe-synthetic monthly invoices is required.
* **D-02:** **pg_cron enabled in this phase's migration.** `CREATE EXTENSION IF NOT EXISTS pg_cron` is part of the Phase 12 migration file, followed by `cron.schedule(...)` inserting the recurring job. Self-contained phase — no dependency on an external infra ticket. Migration must be safe to re-run (wrap in `IF NOT EXISTS` / conflict guards).
* **D-03:** **pg_cron invokes the `reset-subscription-merits` edge function via `pg_net.http_post`** (BACK-03 shape). The edge function owns batching: `SELECT ... FROM user_merits WHERE next_reset_date <= now() AND subscription_tier IN ('pro','elite') LIMIT 1000`, processes each user through `reset_subscription_merits(user_id, tier)` RPC (Phase 11), updates `next_reset_date`, and returns. Cron tick frequency is `Claude's Discretion` (planner recommends every 15 min) — bounded work per invocation, natural backpressure, Deno logger observability.
* **D-04:** `subscription_reset_date` semantics from Phase 10 D-01 carry forward unchanged: `NULL` = Free (sweep skips), non-NULL = active subscriber. Yearly sub invariant: `next_reset_date` always advances by exactly 1 month on each grant, never a full year — the field tracks *next monthly refill*, not billing anniversary. The actual billing renewal is still Stripe's job via `invoice.payment_succeeded`.
* **D-05:** Idempotency of the sweep: each `reset_subscription_merits` call must be atomic — read current `next_reset_date`, compare to `now()`, credit + advance in a single RPC transaction. Running the cron twice in the same tick window is a no-op. Phase 11 contract item.

### Webhook Handler Structure (BACK-05, NFR-04, NFR-06, NFR-07)

* **D-06:** **New edge function `supabase/functions/stripe-webhook-handler/`** stood up alongside the existing Phase 07 `stripe-webhook`. Literal BACK-05 compliance. The new handler is the single Stripe dashboard endpoint from Phase 12 deploy forward; the old `stripe-webhook` stays deployed but receives no traffic (deleted in Phase 21 cleanup).
* **D-07:** **Stripe dashboard endpoint URL swaps once at Phase 12 deploy.** The new handler re-implements 100% of Phase 07's behavior (subs lifecycle, `invoice.payment_failed`, graceful cancellation via D-14, fallback lookup chain) PLUS the new Phase 12 events. Single source of truth from day one — no split-endpoint configuration, no flag-gated forwarding.
* **D-08:** **`HANDLED_EVENTS` set for the new handler:**
  * `customer.subscription.created` — write tier/status/ids/period_end (carry-forward from Phase 07 D-16)
  * `customer.subscription.updated` — same + handle upgrade differential (D-13) and downgrade-at-period-end (SUB-15)
  * `customer.subscription.deleted` — graceful cancel: status only, preserve tier (Phase 07 D-14)
  * `invoice.payment_succeeded` — call `reset_subscription_merits` for monthly subs; for yearly, NO-OP here (pg_cron owns monthly refills per D-01/D-03; yearly `invoice.payment_succeeded` fires only on the annual renewal, which just advances `current_period_end`)
  * `invoice.payment_failed` — `subscription_status = 'past_due'` (Phase 07 D-15)
  * `checkout.session.completed` — mode-discriminated: `subscription` mode grants month-0 Merits + sets `subscription_reset_date`; `payment` mode routes to shop credit path (D-14)
* **D-09:** **Signature verification reuses Phase 07's pattern exactly.** `stripe.webhooks.constructEventAsync` via the SDK on raw `req.text()` before any parse. Never hand-rolled. The shared `_shared/stripe-client.ts` helpers (`getStripeClient`, `getStripeCryptoProvider`) are reused as-is.
* **D-10:** **Idempotency: new table `public.stripe_webhook_v2_events`** (or reuse `stripe_webhook_events` — planner decides based on whether event_id collisions can occur across the two handlers; recommendation: reuse the existing table since event IDs are globally unique per Stripe account). Insert-first pattern with 23505 catch → 200 duplicate, identical to Phase 07 D-13.
* **D-11:** **Profile fallback lookup chain** (`stripe_customer_id` → `stripe_subscription_id` → `email`, Phase 07 D-17) carries forward unchanged. For `checkout.session.completed` add a fourth lookup: `session.metadata.user_id` (set by `create-checkout-session`) — this is the MOST reliable key and should be tried first for checkout events.
* **D-12:** **Webhook is written to be tolerant of out-of-order delivery** (NFR-07): any event that references state the DB doesn't have yet (e.g., `invoice.payment_succeeded` before `customer.subscription.created`) short-circuits to 200 + logged `profile-not-found` rather than failing. Stripe's 72h retry window handles the eventual catch-up.

### Upgrade Differential + Existing-Subscriber Backfill (SUB-13, SUB-14, SUB-15, MIG-03)

* **D-13:** **New RPC `grant_upgrade_diff(user_id, from_tier, to_tier)`** in Phase 11 (Phase 12 consumes, doesn't own). Atomic: reads `user_merits.subscription_balance`, computes `GREATEST(target_allowance - current_balance, 0)`, credits via `merit_transactions` + updates balance in a single SQL transaction. Prevents TOCTOU between read-and-credit if a Merit deduction lands concurrently. Webhook on `customer.subscription.updated` detects tier change via `resolveTier(new_price_id) != current_profile.subscription_tier` and calls this RPC.
  * **Phase 11 contract ask:** add `grant_upgrade_diff(user_id uuid, from_tier text, to_tier text)` to the Phase 11 RPC list. If Phase 11 discussion has already locked without this RPC, Phase 12 must add a replan request.
* **D-14:** **SUB-15 downgrades take effect at period end.** `customer.subscription.updated` with a downgrade (Elite→Pro, anything→Free) writes `pending_downgrade_tier` to `profiles` (new column — additive migration) but does NOT touch `subscription_tier` or the Merit balance. At `current_period_end`, the next `invoice.payment_succeeded` / `customer.subscription.updated` cycle flips the tier. Shop Merits are never touched (SHOP-11).
* **D-15:** **MIG-03 one-shot backfill.** The Phase 12 migration includes a PL/pgSQL block that loops `SELECT id, subscription_tier FROM profiles WHERE subscription_tier IN ('pro','elite') AND subscription_status = 'active'` and for each row:
  1. Calls `reset_subscription_merits(user_id, tier)` to credit 75/150 Merits.
  2. Sets `user_merits.subscription_reset_date = now() + interval '1 month'`.
  3. Writes a `merit_transactions` row with `source = 'phase-12-backfill'` — traceable and distinguishable from normal `reset-subscription-merits` grants, mirroring Phase 10 D-15's convention.
  * Runs in the same migration transaction as the edge-function deploy is NOT possible (migration is SQL-only), so the backfill must run AFTER the Phase 11 RPCs are live. Migration ordering: Phase 11 migration → Phase 12 migration. Planner validates the migration timestamp order.
  * If Phase 11 RPCs are not yet deployed when Phase 12 migration runs, the backfill block must fail loudly rather than silently skip.

### Shop Checkout + Promo (SHOP-05, SHOP-06, SHOP-07, SHOP-09, SHOP-12, MIG-06)

* **D-16:** **Shop purchase crediting fires on `checkout.session.completed` with `mode: 'payment'`.** Single event source — no `payment_intent.succeeded` handling. Session metadata (`user_id`, `pack_size`) is set by `create-checkout-session` at session creation time. Webhook reads metadata, calls `credit_shop_merits(user_id, pack_size, stripe_payment_intent_id)` (Phase 11 RPC). The Checkout Session exposes the finalized `payment_intent` id on completion.
* **D-17:** **Two-layer idempotency for shop credits:**
  * Layer 1: `stripe_webhook_events.event_id` unique constraint (general Stripe event dedupe).
  * Layer 2: `merit_shop_purchases.stripe_payment_intent_id` unique constraint from Phase 10 (SHOP-09). A replayed event that somehow slipped past layer 1 hits the PI unique constraint inside `credit_shop_merits` and the RPC returns no-op success. Defense in depth.
* **D-18:** **`create-checkout-session` gains a second mode.** Extended input contract: `{ mode: 'subscription', tier, interval }` | `{ mode: 'payment', pack_size }`. Backend validates `pack_size ∈ (3, 10, 25, 50)` against an allowlist (mirrors Phase 10 D-11 CHECK), resolves to the right shop Price ID from env vars (`STRIPE_PRICE_MERIT_3`, `STRIPE_PRICE_MERIT_10`, `STRIPE_PRICE_MERIT_25`, `STRIPE_PRICE_MERIT_50`), creates the Checkout Session with `metadata: { user_id, pack_size }`, and returns the URL. Frontend never handles Price IDs (Phase 07 D-09 invariant carries forward).
* **D-19:** **SHOP-12 rate limit (10 shop purchases / user / hour)** enforced in `create-checkout-session` via the existing `_shared/rate-limiter.ts` sliding window. The webhook path does NOT re-enforce — a Stripe event with a valid PI is always honored.
* **D-20:** **Promo coupon `agk02110` provisioned via script** — `scripts/provision-stripe-coupon.mjs` uses the Stripe SDK to idempotently create/upsert the coupon in the target environment keyed by coupon id `agk02110`. Script is re-runnable, runs as a deploy-time step in both staging and production runbooks. Coupon is attached to the 4 subscription Price objects via `allowed_products`. Zero dashboard drift across environments. Shop Prices do NOT accept the promo (spec scope: subs only, MIG-06).
* **D-21:** **SHOP-08 email receipt is deferred to Phase 20 scope** — Phase 12 success criteria list does NOT include receipt emails, and `send-strivo-email` integration belongs with the shop UI work. Note in deferred ideas.

### Price Object Creation (SUB-01..04, SHOP-01..04)

* **D-22:** **4 subscription Price objects** are NOT recreated — Phase 07 already shipped them (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`). Phase 12 verifies they exist, verifies amounts match spec (\$8.99 / \$89.99 / \$16.99 / \$169.99), and adds provisioning script idempotency for greenfield environments.
* **D-23:** **4 shop Price objects provisioned by the same script as the promo coupon.** `scripts/provision-stripe-products.mjs` (or extend the coupon script): idempotently creates Products + one-time Prices for 3/\$1.99, 10/\$4.99, 25/\$9.99, 50/\$17.99, attaches `metadata: { pack_size: N }`, and writes the resulting Price IDs to the expected env var names (`STRIPE_PRICE_MERIT_3/10/25/50`). Runbook documents setting these as Supabase secrets after the script completes.
* **D-24:** **SHOP-03's "Most Popular" flag** is a UI concern — tracked in Phase 20. Phase 12 script does NOT set any Stripe-side "featured" attribute.

### reset-subscription-merits Edge Function (BACK-03)

* **D-25:** **New edge function `supabase/functions/reset-subscription-merits/`**. Request body: `{ invocation_source: 'pg_cron' | 'webhook' }`. Auth: internal-secret (same pattern as existing internal-job functions). Body: select up to 1000 due users, loop through calling `reset_subscription_merits(user_id, tier)` per-user, bump `next_reset_date`, return `{ processed, remaining }`. pg_cron tick calls this repeatedly until `remaining == 0`.
* **D-26:** **Observability:** structured `createLogger('reset-subscription-merits', reqId)` output per user processed + aggregate summary. A run with `processed > 0 AND errors > 0` raises a warn-level log that the Phase 13 alert pipeline can consume.

### Claude's Discretion (Planner / Researcher decides)

* Exact pg_cron tick frequency (recommended: every 15 minutes; planner may pick another interval).
* Whether `pending_downgrade_tier` is a new column on `profiles` or a row in a new `subscription_pending_changes` table — one column is simpler; table is more normalized.
* Exact `stripe_webhook_events` row shape for the new handler (reuse the Phase 07 table vs. create a new one — recommendation: reuse, since Stripe event IDs are globally unique and the two handlers never run in parallel on the same Stripe endpoint).
* Whether `create-checkout-session` is a single function with a mode switch or two functions (`create-subscription-checkout` / `create-shop-checkout`) — recommendation: single function with discriminated input for fewer moving parts.
* Provisioning script language: Node (`.mjs`) matching the existing `scripts/` conventions vs PowerShell — recommend `.mjs` for Stripe SDK ergonomics.
* Ordering of the PL/pgSQL backfill block within the migration (before or after trigger creation): after, so the backfill sees a fully-functional schema.
* Whether `customer.subscription.updated` that flips `cancel_at_period_end=true` should be treated as a downgrade-to-Free at period end (D-14 semantics) — recommend yes.
* Which Deno SDK version for pg_net → edge function HTTP call (if any Deno-side helper is needed at all; usually pg_net.http_post handles it server-side).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

* `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §3.2, §3.3, §3.4, §5.1, §5.2, §5.3, §8.1, §9.1, §9.2, §9.3, §9.5, §10, §11.2 — Subscription lifecycle, yearly monthly-grant rule, upgrade/downgrade rules, shop pricing, shop credit path, edge function roster, idempotency invariants, MIG-03 backfill, TEST-08 duplicate webhook test.

### Requirements

* `.planning/REQUIREMENTS.md` — SUB-01..15, SHOP-01..04, SHOP-06, SHOP-07, SHOP-09, SHOP-11, SHOP-12, BACK-02..05, NFR-04, NFR-06..08, MIG-03, MIG-06, TEST-08 (the 32 REQ-IDs Phase 12 closes).
* `.planning/ROADMAP.md` §"Phase 12: stripe-products-and-webhook" — the 8 Success Criteria that VERIFICATION.md must prove TRUE.

### Existing Code (Pattern to Follow / Extend)

* `supabase/functions/stripe-webhook/index.ts` — Phase 07 handler. New `stripe-webhook-handler` re-implements all of its event routing + adds Merit events. Structural template, not a target to edit.
* `supabase/functions/stripe-webhook/price-resolver.ts` — `resolveTier(priceId)` implementation. New handler reuses this module unchanged (or promotes it to `_shared/`).
* `supabase/functions/create-checkout-session/index.ts` — Phase 07 subscription-only checkout. Phase 12 extends this function with `mode: 'payment'` support per D-18.
* `supabase/functions/_shared/stripe-client.ts` — `getStripeClient()`, `getStripeCryptoProvider()`. Reuse as-is.
* `supabase/functions/_shared/auth.ts` — `requireAuth` for user endpoints, webhook auth for `stripe-webhook-handler`, internal-secret auth for `reset-subscription-merits`.
* `supabase/functions/_shared/cors.ts` — `handleOptionsRequest`, `APP_URL` allowlist for checkout endpoint. Webhook + internal functions do not set CORS headers.
* `supabase/functions/_shared/rate-limiter.ts` — SHOP-12 rate limit (D-19).
* `supabase/functions/_shared/logger.ts` — `createLogger(fn, reqId)` structured logging, used by all new handlers.
* `supabase/functions/_shared/supabase-client.ts` — `getServiceClient()` singleton for DB writes.

### Existing Migrations (Pattern to Follow)

* `supabase/migrations/20260412000000_stripe_migration.sql` — Phase 07 Stripe schema. Phase 12 migration is additive on top: new columns (`pending_downgrade_tier`), pg_cron extension, cron.schedule row, MIG-03 backfill block. Follow the same additive / no-drops / no-rename style and the `ENABLE ROW LEVEL SECURITY` + zero-permissive-policies rule (SEC-06 anti-pattern).
* Phase 10 migration (when it lands) — `user_merits`, `merit_transactions`, `merit_shop_purchases` tables. Phase 12 writes through Phase 11 RPCs, never direct INSERT/UPDATE on these tables.

### Prior Phase Context (Carries Forward)

* `.planning/_archive/v2.0-credit-system/phases/07-stripe-migration-backend/07-CONTEXT.md` — D-06 RLS posture, D-13 idempotency pattern, D-14 graceful cancel contract, D-17 fallback lookup chain, D-18 SDK-only signature verification, D-22 `metadata.user_id` on Stripe customers. All carry forward to the new handler unchanged.
* `.planning/phases/10-merit-ledger-foundation/10-CONTEXT.md` — D-01 `subscription_reset_date` NULL semantics for Free, D-05 trigger guarantees `user_merits` row exists for every profile, D-11 `pack_size` CHECK constraint, D-15 traceable backfill `source` convention (Phase 12 reuses for MIG-03), D-17 RLS inherited.

### Phase 11 Contract Asks (Must Be Addressed in Phase 11 Discussion)

* `reset_subscription_merits(user_id uuid, tier text)` — atomic credit + `next_reset_date` advance. Consumed by `stripe-webhook-handler` and `reset-subscription-merits` edge function.
* `credit_shop_merits(user_id uuid, pack_size integer, stripe_payment_intent_id text)` — idempotent on PI (SHOP-09). Consumed by `stripe-webhook-handler`.
* `grant_upgrade_diff(user_id uuid, from_tier text, to_tier text)` — NEW, D-13. Consumed by `stripe-webhook-handler` on tier-upgrade events.
* `get_merit_balance(user_id uuid)` — read helper (already in spec §2.6).
* All four must be deployed before the Phase 12 MIG-03 backfill block runs — migration ordering dependency.

### External

* Stripe SDK via `https://esm.sh/stripe@14?target=denonext` — same pin as Phase 07. Used for all checkout/session/coupon operations and `webhooks.constructEventAsync` signature verification.
* pg_cron + pg_net Postgres extensions — enabled via this phase's migration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

* **`stripe-webhook/index.ts`** — Phase 07 handler. Structural template for the new `stripe-webhook-handler`: raw-body read order, sig verify, insert-first idempotency, profile fallback chain, graceful cancel. Copy the *shape*, extend with Merit events.
* **`stripe-webhook/price-resolver.ts`** — `resolveTier(priceId)` module. Reuse directly; may need promotion to `_shared/` if both the new handler and `create-checkout-session` import it.
* **`create-checkout-session/index.ts`** — Existing subscription checkout. Extend with a discriminated input for `mode: 'payment'` (D-18).
* **`_shared/stripe-client.ts`** — Stripe SDK instance helpers. Reuse across all Phase 12 functions.
* **`_shared/rate-limiter.ts`** — SHOP-12 (10 shop purchases / user / hour).
* **`_shared/auth.ts`** — webhook auth mode (existing), internal-secret auth (existing via `requireInternalOrUserAuth`).
* **`_shared/logger.ts`** — `createLogger` structured JSON logging, used by every new function.

### Established Patterns

* **Webhook idempotency:** insert-first on `stripe_webhook_events`, catch 23505 unique violation → return 200 duplicate. Phase 07 D-13; Phase 12 inherits.
* **Graceful cancellation:** `customer.subscription.deleted` sets `subscription_status = 'canceled'` ONLY; `subscription_tier` preserved until `current_period_end`; `can_perform_ai_action` enforces expiration. Phase 07 D-14; Phase 12 keeps this contract.
* **Profile fallback chain:** `stripe_customer_id` → `stripe_subscription_id` → `email`. Phase 12 adds `session.metadata.user_id` as the first-tried key for `checkout.session.completed`.
* **Env-var price IDs:** one secret per SKU; no JSON blobs; no hardcoded fallbacks (Phase 07 D-08/D-10). Phase 12 adds 4 shop secrets in the same shape.
* **Frontend never sees Price IDs:** all resolution is backend. Phase 07 D-09 invariant.
* **Additive migrations only:** no drops/renames. `pg_cron` extension, new column(s), cron job, backfill block — all additive.
* **RLS service-role-only on webhook event tables:** zero permissive policies (SEC-06).
* **Structured logging:** bracket-prefixed or `createLogger`-owned, never bare `console.log`.

### Integration Points

* **Database:** `profiles` (add `pending_downgrade_tier`), `stripe_webhook_events` (reuse), `user_merits` + `merit_transactions` + `merit_shop_purchases` (via Phase 11 RPCs only), `pg_cron.job` catalog (new row).
* **Edge runtime:** Two new functions (`stripe-webhook-handler`, `reset-subscription-merits`), one extended function (`create-checkout-session`). Deployed via existing `scripts/deploy-*.ps1`.
* **Stripe dashboard:** webhook endpoint URL swap (one-time operational step, documented in DEPLOY_RUNBOOK.md), 4 new one-time Products + Prices (provisioned via script), 1 new coupon (provisioned via script).
* **Supabase secrets (new):** `STRIPE_PRICE_MERIT_3`, `STRIPE_PRICE_MERIT_10`, `STRIPE_PRICE_MERIT_25`, `STRIPE_PRICE_MERIT_50`. Plus any pg_net auth header for cron → edge function calls.
* **Phase 13 dependency:** Merit deduction gateway will live in Phase 13; Phase 12 only handles grants/credits/refunds, never deductions.
* **Phase 20 dependency:** `/pricing` page and Merit Shop UI call `create-checkout-session` with the mode-discriminated contract from D-18.

</code_context>

<specifics>
## Specific Ideas

* **Hybrid grant model (D-01) is load-bearing.** Don't let the planner collapse to a pure-webhook or pure-cron design "for simplicity" — the yearly sub case breaks pure-webhook, and the day-0 UX breaks pure-cron.
* **Migration ordering (D-15):** Phase 11 migration must have an earlier timestamp than Phase 12's. The MIG-03 backfill PL/pgSQL block calls `reset_subscription_merits` and `grant_upgrade_diff` — those RPCs must already exist. If Phase 11 discussion hasn't locked them, flag that in the research phase.
* **`stripe-webhook-handler` is a new function, not an edit** (D-06/D-07). Do NOT add Phase 12 event routing inside `stripe-webhook/index.ts`. The old handler stays byte-identical until Phase 21 deletes it.
* **Idempotency is proven by TEST-08** (Success Criterion #4): reviewer will run the exact same event JSON through the handler twice and assert zero balance delta on the second call. Both layers (D-17) must be exercised.
* **The `session.metadata.user_id` lookup (D-11)** is the MOST reliable identifier for `checkout.session.completed` and MUST be the first key tried — not appended at the end of the fallback chain. Prevents email-collision bugs and unlinked-customer edge cases.
* **Promo coupon provisioning script (D-20)** must be idempotent via the coupon `id` field (Stripe allows caller-supplied IDs). Re-running the script against an already-provisioned environment is a no-op, not an error.

</specifics>

<deferred>
## Deferred Ideas

* **SHOP-08 email receipt** via `send-strivo-email` after successful shop purchase — deferred to Phase 20 alongside Merit Shop UI. The webhook credits Merits; the email fires async from the UI layer.
* **Additional Stripe events** (`invoice.paid`, `customer.subscription.trial_will_end`, `payment_intent.payment_failed` for shop) — not required for Phase 12 success criteria. Add later if observability gaps appear.
* **Stripe Subscription Schedules for native monthly grant on yearly plans** — considered and rejected in favor of pg_cron hybrid (D-01). Could revisit if pg_cron proves flaky at scale.
* **Deleting the Phase 07 `stripe-webhook` function** — Phase 21 cleanup.
* **Merit grant observability dashboard** (total circulating Merits, per-tier consumption) — Phase 13 per BACK-10 / admin metrics.
* **Pro-rated Merit grants on mid-cycle upgrades** (SUB-13 mentions "prorated if mid-cycle" for Free→Pro) — treated as a full 75/150 grant in Phase 12, NOT prorated. If spec §3.4 requires literal proration, add a Phase 11 contract ask. Planner should flag this during research.
* **Stripe Tax / VAT** — out of scope.
* **Multi-currency pricing** — out of scope.
* **Merit gifting / admin grants** — out of scope for v2.0.

</deferred>

---

*Phase: 12-stripe-products-and-webhook*
*Context gathered: 2026-04-14*
