# External Integrations — Merit + Stripe + Billing Surface (v3.0)

**Analysis Date:** 2026-04-28
**Scope:** Merit ledger, Stripe checkout/webhook, billing UX surface for v3.0 bug-fix planning. AI feature internals referenced only where the merit gateway wraps them.

Production state (per `STATE.md` / `v2.0-MILESTONE-AUDIT.md`):
- Stripe Live → `/functions/v1/stripe-webhook-handler` only; legacy `/stripe-webhook` is a 410-Gone shim on `by/env-fixes` (NOT on main).
- `MERIT_SYSTEM_ENABLED=true` in production.
- Real `pack_3` purchase smoke-tested 2026-04-29 → `payment_intent.succeeded` → `credit_shop_merits` → balance increment confirmed.

---

## 1. Free-Tier Cap & Replenishment — Source-of-Truth Conflict

**Verdict (code today):** Free is **5 lifetime, never replenished**. The "10 monthly via Phase 24 retune" claim in `v2.0-MILESTONE-AUDIT.md` is **wrong**. The `pricing-config.ts` `MERITS_PER_MONTH.free=10` is a **display-only cap** consumed by `useMerits().cap`; nothing in the database grants 10 or replenishes monthly for Free.

| Layer | File:Line | Value | Effect |
|---|---|---|---|
| DB seed (signup trigger) | `supabase\migrations\20260414000000_merit_ledger_foundation.sql:120-133` | `subscription_balance=5, lifetime_granted=5, subscription_reset_date=NULL` | Every new user gets exactly 5 merits, no reset date |
| DB seed (backfill) | `supabase\migrations\20260414000000_merit_ledger_foundation.sql:146-151` | Same 5/0/5/NULL | All pre-existing profiles backfilled to 5 lifetime |
| Monthly reset RPC | `supabase\migrations\20260415000000_merit_rpcs.sql:367-424` | `IF p_tier='free' THEN RETURN skipped:free_tier_noop` (lines 383-385) | Free tier explicitly excluded from monthly reset |
| Frontend cap constant | `src\config\pricing-config.ts:31-35` | `free: 10` | Display only |
| Frontend display | `src\components\topup\MeritBalanceHeaderV2.tsx:52` | `{subscription} / {cap}` | New Free user sees `5 / 10` (mismatched) |
| Per-feature cost (Free) | `pricing-config.ts:39-45` + `merit_feature_costs` seed at `20260415000000_merit_rpcs.sql:44-58` | resume/career/linkedin = 3 each | 5 merits = 1 free analysis, then locked |
| Hardcoded "5 lifetime" UI string | `src\pages\Settings\Billing.tsx:43` | `allowance: '5 lifetime Merits'` | Settings page contradicts pricing-config |

**v3.0 fix locations to change in lockstep:**
1. `auto_provision_user_merits` trigger seed (5 → 10, set `subscription_reset_date` to now+1mo)
2. Backfill migration to bump existing free users
3. `reset_subscription_merits` RPC: remove the `free_tier_noop` short-circuit; add `WHEN 'free' THEN 10` arm
4. pg_cron schedule: confirm Free users get included in the monthly sweep (currently only Pro/Elite — see `phase_12_stripe_products_webhook.sql` Section 2)
5. Static UI strings: `Settings/Billing.tsx:43`, `src\components\PricingTable.tsx`, `src\components\PlanComparisonTable.tsx`

**Cap-clamp behavior on subscription replenishment:** `reset_subscription_merits` SETS balance to 10/75/150 (line 401), it does NOT add. So a Free/Pro/Elite user who saved 4 of last cycle and gets reset jumps to the cap value, not cap+remainder. Subscription merits explicitly do not roll over (D-15). This matches v3.0 spec.

---

## 2. Pre-Call Merit Deduction & Optimistic UI

**Verdict (code today):** Deduction is **server-side, atomic, BEFORE the AI call** via `withMerits` wrapper. There is **NO client-side optimistic deduction**. The frontend invalidates the merit-balance React Query cache *after* the response returns.

### Server-side deduction wrapper

- `supabase\functions\_shared\merit-gateway.ts:115-198` — `withMerits(ctx, feature, fn)`:
  - [1] line 121: pooled rate-limit check (60/hr `ai-analyses-all`)
  - [2] line 129: `supabase.rpc('check_and_deduct_merits', {p_user_id, p_feature, p_tier})` — atomic deduct
  - [3] line 155: log `merit-transaction` AFTER RPC success
  - [4] line 166: invoke feature callback `fn(transactionId)`
  - [5] line 168-197: catch `MeritRefundable` / refundable error → `refund_merits` RPC + re-throw

- `supabase\migrations\20260415000000_merit_rpcs.sql:67-152` — `check_and_deduct_merits`:
  - L82-91: `tier_locked` if `merit_feature_costs` row missing (cost lookup before any lock)
  - L94-98: `FOR UPDATE` row lock on `user_merits`
  - L106-111: `insufficient_merits` short-circuit if subscription+shop < cost
  - L113-115: subscription-first deduction split (`v_sub_take = LEAST(v_sub_balance, v_cost)`)
  - L118-132: 1-or-2 `merit_transactions` rows sharing `deduction_id` UUID
  - L135-139: `UPDATE user_merits` (CHECK constraint = negative-balance safety net)
  - Returns `{success, transaction_id, remaining_balance, deducted_from}`

### Feature integration sites (all use `withMerits`)

- `supabase\functions\analyze-resume\index.ts:13` (import), `:377-379` (call)
- `supabase\functions\analyze-career\index.ts`
- `supabase\functions\grade-linkedin\index.ts`
- `supabase\functions\recruiting-lens\index.ts`
- `supabase\functions\interview-prep-analyze\index.ts`
- `supabase\functions\analyze-skills-gap\index.ts`
- `supabase\functions\compare-jobs\index.ts`
- `supabase\functions\submit-resume-analysis-job\index.ts:140` (async path: deducts at submission, persists `merit_transaction_id` on `analysis_jobs`)
- `supabase\functions\submit-career-analysis-job\index.ts`

### Frontend balance state

- `src\hooks\useMerits.ts:32-56` — `useQuery(['merit-balance', userId])` calling `get_merit_balance` RPC + profile tier in parallel
  - `staleTime: 5_000` (line 54)
  - `refetchOnWindowFocus: true`
- `useMerits.ts:89-92` — `useInvalidateMerits()` returns `() => queryClient.invalidateQueries({ queryKey: ['merit-balance'] })`

### Client-side post-call invalidation (no optimistic UI)

| Page | File:Line | Pattern |
|---|---|---|
| Upload (resume) | `src\pages\Upload.tsx:11,27,299` | `invalidateMerits()` only on error path; success path navigates to `/results/:id?stream=true` |
| LinkedIn Grader | `src\pages\LinkedInGrader.tsx:17,129` | `invalidateMerits()` after analyze completes |
| Career Compass | `src\pages\CareerCompass.tsx:23,82` | Same |
| Recruiting Lens | `src\pages\RecruitingLens.tsx:3,381` | Same |
| Interview Prep | `src\pages\InterviewPrep.tsx:21,188` | Same |

**v3.0 gap:** No optimistic UI. User clicks "Analyze" → balance shows old value for the duration of the AI call (8-40s), then snaps down. Bug fix: deduct N from `useMerits` cache via `queryClient.setQueryData` on submit, and on success/refund-error trigger an authoritative refetch.

**Idempotency on retry/refresh:** No client-side dedupe. If user double-clicks Analyze before the first request returns, the second `withMerits` call will deduct again because each is a fresh RPC. There is no in-flight request guard in feature pages. The `AnalysisLockContext` (`src\contexts\AnalysisLockContext.tsx`) exists but each page's actual consumption needs auditing.

**Note:** `usePaywallGuard` (`src\hooks\usePaywallGuard.ts:51`) still calls the **legacy** `can_perform_ai_action` RPC, not the merit RPCs. It's a vestige of pre-merit usage tracking. Verify whether any v3.0 feature still uses it for gating decisions.

---

## 3. Refund on AI Failure

**Verdict:** Implemented for both sync (`withMerits` catch block) and async (`refundMeritsForJob` worker path). Idempotent via deduction-id keyed lookup.

### Refund classification (narrow)

- `merit-gateway.ts:51-60` — `isRefundableAnthropicError(status, errText)`:
  - Refundable: `status >= 500`, `status === 408`, regex `/overload|overloaded|timeout|ECONNRESET|network|AbortError/i`
  - NOT refundable: 4xx client errors, parse failures, prompt-sanitizer rejections, Zod errors

### Idempotency

- `supabase\migrations\20260415000000_merit_rpcs.sql:165-241` — `refund_merits(p_user_id, p_transaction_id)`:
  - L185-193: scans `merit_transactions WHERE balance_type='refund' AND metadata->>'deduction_id' = p_transaction_id::text` → returns `{error: 'already_refunded'}` with ZERO mutations
  - L196-219: walks original deduction rows by shared `deduction_id`, writes mirroring refund rows with `balance_type='refund'`, `metadata.refund_of` = original row id
  - L277-279: partial expression index `idx_merit_transactions_deduction_id` powers the lookup

### Async-path refund (Phase 26)

- `supabase\migrations\20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` — adds `merit_transaction_id uuid NULL` to `analysis_jobs`
- `supabase\functions\process-resume-analysis-job\index.ts:5,29,284,349` — `refundMeritsForJob(userId, txId, reason)` called BEFORE every `status='failed'` UPDATE at all 4 terminal-failure sites
- `merit-gateway.ts:209-230` — `refundMeritsForJob` (async-only path, doesn't touch withMerits)

### Feature-level refund hooks

- `analyze-resume\index.ts:469,475,593` — explicit `refundMeritsForJob` calls inside the `withMerits` callback for stream-mode and free-single-call paths

**v3.0 audit point:** `interview-prep-analyze` 503-after-Claude-success (production failure log 2026-04-28) — if response handling crashes after Claude billed, the error may not be classified as refundable per the regex, so the user loses 8 merits. The `MeritRefundable` discriminator class lives in `merit-gateway.ts:73-80`.

---

## 4. Purchased Merits Exceed Cap — Bug Map

**Verdict:** No cap-clamp exists in `credit_shop_merits` (correct by design — shop merits go to a separate `shop_balance` bucket, not `subscription_balance`). The reported bug ("75/75 user buys 3 Merits, charged, balance stays 75/75") is a **UI freshness race**, not a clamp.

### `credit_shop_merits` adds, does not clamp

- `supabase\migrations\20260422000000_phase_24_topup.sql:52-158` (active version, replaces Phase 11 version):
  - L88-91: `INSERT INTO user_merits ON CONFLICT DO NOTHING` (defensive backfill — WR-04 silent-loss fix)
  - L99-111: idempotency lookup on `merit_shop_purchases.stripe_payment_intent_id`
  - L119-124: `UPDATE user_merits SET shop_balance = shop_balance + p_pack_size` — **no cap check**
  - L127-137: ledger row `source='topup'`, `pack_id`, `stripe_payment_intent_id`
- `supabase\migrations\20260414000000_merit_ledger_foundation.sql:18-26` — `user_merits.shop_balance` has only `CHECK (shop_balance >= 0)`, no upper bound

### Frontend display: subscription cap, shop bonus separate

- `src\components\topup\MeritBalanceHeaderV2.tsx:42-62`:
  - L52: shows `{subscription} / {cap}` (e.g. `75 / 75`)
  - L57-61: `+ {shop} bonus` rendered ONLY when `shop > 0` (line 32: `hasBonus = shop > 0`)
- `src\hooks\useMerits.ts:60-64`:
  - `subscription = balance?.subscription_balance` (L61)
  - `shop = balance?.shop_balance` (L62)
  - `cap = MERITS_PER_MONTH[tier]` (L64) — applies only to subscription bucket

### The actual bug (suspected location)

`src\components\topup\StripePaymentElementModal.tsx:94-101`:
```ts
if (paymentIntent?.status === 'succeeded') {
  toast.success(`${pack.merits} Merits added...`);
  queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
  onSuccess();
}
```

Race: client sees `paymentIntent.status='succeeded'` from Stripe → invalidates and refetches → DB read happens BEFORE `payment_intent.succeeded` webhook arrives at `/stripe-webhook-handler` and runs `credit_shop_merits`. Refetch returns stale `75/75 + 0 bonus`. No second invalidation ever fires; user-visible "balance stays 75/75" until next page navigation or focus event (5s `staleTime` + `refetchOnWindowFocus`).

**v3.0 fix candidates:**
- Poll `merit-balance` for ~10s after `succeeded` until shop_balance increments OR add a server-side ack endpoint that blocks until the webhook lands
- Add Realtime subscription on `user_merits` table for the current user
- Toast wording: "Merits processing — they'll appear momentarily" with a manual refresh button

**v3.0 spec note:** the user-spec says display should be `X / cap` where X CAN exceed cap (e.g. `78 / 75`). Current display shows `subscription / cap` + separate `+N bonus`. Decide in REQUIREMENTS: keep two-bucket display (current) or merge to single `total / cap` display per user spec.

---

## 5. Stripe Routes & Checkout Flows

### Route map (`src\App.tsx:60-89`)

| Path | Element | File |
|---|---|---|
| `/pricing` | `<Pricing />` | `src\pages\Pricing.tsx` — works from account icon |
| `/shop` | `<Shop />` | `src\pages\Shop.tsx` (protected) |
| `/settings/billing` | `<Billing />` | `src\pages\Settings\Billing.tsx` (protected) |
| `/celebrations` | `<Celebrations />` | `src\pages\Celebrations.tsx` |
| **`/checkout`** | **NOT REGISTERED** | catch-all `<NotFound />` line 89 |

### Bug 5a: `/checkout` 404 on subscription upgrade

- `src\pages\Pricing.tsx:22` — `navigate(\`/checkout?tier=${tier}&interval=${chosenInterval}\`)` for Pro/Elite tier CTAs
- `src\App.tsx:60-89` — no route handler for `/checkout`, falls through to `<NotFound />`
- Intended flow appears to be: subscription tier click → `/checkout` page → calls `useStripeCheckout` → embedded checkout. But `/checkout` page never existed (or was removed).

**Compare:** Shop pack purchases bypass `/checkout` entirely. They use a custom-event-driven modal: `Pricing.tsx:25-31` dispatches `topup:open` event picked up by `src\components\topup\TopUpProvider.tsx`, which opens `StripePaymentElementModal`. Subscription upgrades have no equivalent flow on `/pricing`.

**v3.0 fix candidates:**
- Add `/checkout` route that mounts a subscription embedded-checkout component (parallel to `StripePaymentElementModal`)
- OR change `Pricing.tsx:22` to dispatch a `subscription:open` event and add a `SubscriptionCheckoutModal` to `TopUpProvider`
- OR redirect `/checkout` directly to a Stripe-hosted Checkout Session URL (revert to non-embedded for subs)

### Bug 5b: `/settings/billing` stuck-on-loading

- `src\pages\Settings\Billing.tsx:287-318`:
  - L291-298: `useQuery(['currentUser'])` → `userId`
  - L305-317: `useQuery(['billing-profile', userId], ..., { enabled: !!userId })` → `profileLoading`
- L339-350: `if (profileLoading) return <Loader2 .../>`

**Suspected bug:** TanStack Query v5 default for `enabled: false` queries returns `isPending: true` (and `isLoading: true` while disabled). If `userId` query resolves to `null` (not authenticated), the billing-profile query stays disabled and `profileLoading` stays true forever → infinite spinner. The `ProtectedRoute` wrapper should prevent unauthenticated access, but a stale/missing session can leak through.

Also: L308-313 uses `.single()` (throws on missing row) rather than `.maybeSingle()` — if `profiles` row is missing for the user, this throws and renders the error card instead of degrading gracefully.

### Bug 5c: `/pricing` design system mismatch

- `Pricing.tsx:44` — uses `theme-v2` class (Phase 24 brand-v2 redesign per BRAND-01/02)
- This conflicts with the v3.0 ask: "redesign `/pricing` to match Strivo design system (light/dark)"
- The `theme-v2` styling lives in: `src\components\pricing\TierCardV2.tsx`, `BillingIntervalToggleV2.tsx`, `PackSectionV2.tsx`

### Stripe checkout flow types — which is used where

| Flow | Trigger | Edge fn | Stripe API | Webhook event |
|---|---|---|---|---|
| **Subscription upgrade** (Pro/Elite, mo/yr) | `/checkout?tier=...` (currently 404 — broken) | `create-checkout-session` mode=`subscription` | Checkout Session redirect | `checkout.session.completed` (mode=subscription) → `reset_subscription_merits` |
| **Shop pack purchase** | `topup:open` event → `StripePaymentElementModal` → `useStripeCheckout({mode:'payment'})` OR `create-payment-intent` | `create-payment-intent` (Phase 24) OR legacy `create-checkout-session` mode=`payment` | Embedded Payment Element | `payment_intent.succeeded` (preferred) OR `checkout.session.completed` (mode=payment) → `credit_shop_merits` |
| **Manage subscription** (cancel/portal) | Not surfaced in UI today — `Billing.tsx:152-157` "Cancel Subscription" links to `/pricing` | `create-stripe-portal` exists at `supabase\functions\create-stripe-portal\index.ts` (NOT wired into `/settings/billing` UI) | Customer Portal redirect | n/a |

- `src\hooks\useStripeCheckout.ts:30-32` — invokes `create-checkout-session` with `ui_mode: 'embedded'`
- `supabase\functions\create-checkout-session\index.ts:64-96` — discriminated body: `subscription` (mode + tier + interval) | `payment` (mode + pack_size) | back-compat bare `{tier, interval}`
- `supabase\functions\create-payment-intent\index.ts:48-68` — pack-id-only top-up flow (Phase 24, BACK-04, SHOP-12)
- `supabase\functions\create-stripe-portal\index.ts` — customer portal session (NOT linked from `/settings/billing` — gap)

---

## 6. Stripe Webhook Handler

**Location:** `supabase\functions\stripe-webhook-handler\index.ts` (single source of truth in production)

### `HANDLED_EVENTS` (7 total) — line 43-51

```ts
const HANDLED_EVENTS = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "checkout.session.completed",
  "payment_intent.succeeded", // Phase 24 TOPUP-02 (D-23)
]);
```

Operator-confirmed all 7 subscribed in Stripe Live dashboard 2026-04-29.

### Idempotency

- L162-179: insert-first into `stripe_webhook_events.event_id` (UNIQUE) → catch 23505 → return 200 duplicate
- L188-206: on any 4xx/5xx from `processEvent`, DELETE the idempotency row so Stripe retries can re-execute (prevents silent merit-grant loss after transient downstream errors)

### Profile lookup fallback chain (L327-499)

1. `metadata.user_id` — only for `checkout.session.completed` and `payment_intent.succeeded` (L417-429)
2. `stripe_customer_id` (L431-439)
3. `stripe_subscription_id` (L441-449)
4. `email` (L451-459)

If no match: most events return 200 `profileFound:false` (NFR-07 retry-storm avoidance). **Exception** at L495-498: `payment_intent.succeeded` returns 500 `profile_not_found_retry` so Stripe retries until the profile back-fills.

### Event → RPC routing (L502-867)

| Event | Branch | RPC / DB call |
|---|---|---|
| `checkout.session.completed` mode=subscription | L511-540 | `reset_subscription_merits(p_user_id, p_tier, p_next_reset_date=now+1mo)` |
| `checkout.session.completed` mode=payment | L541-616 | `credit_shop_merits(p_user_id, p_pack_size, p_stripe_payment_id)` + fire-and-forget `send-strivo-email` shop_receipt |
| `invoice.payment_succeeded` interval=month | L658-693 | `reset_subscription_merits` (Pro/Elite only) |
| `invoice.payment_succeeded` interval=year | L647-655 | NO-OP (pg_cron owns yearly monthly-grant cadence) |
| `customer.subscription.updated` upgrade | L720-750 | `grant_upgrade_diff(p_user_id, p_from_tier, p_to_tier)` + tier write |
| `customer.subscription.updated` downgrade or cancel-at-period-end | L702-719, L751-768 | `profiles.pending_downgrade_tier = newTier` |
| `customer.subscription.deleted` | inline updateData L312-315 | `subscription_status='canceled'`, tier preserved (D-14 graceful cancel) |
| `invoice.payment_failed` | inline updateData L224-235 | `subscription_status='past_due'` |
| `payment_intent.succeeded` | L783-865 | `credit_shop_merits` (Phase 24 embedded Payment Element path) |

### Cap bypass for shop credits

**There is no cap.** `credit_shop_merits` adds to `shop_balance` (separate bucket), and `subscription_balance` cap is enforced only by `reset_subscription_merits` setting (not adding) the value. Shop credits are by-design unbounded — see Section 4. The webhook handler does not check or enforce any cap.

### Idempotency layers for shop credit (NFR-07)

1. `stripe_webhook_events.event_id UNIQUE` (L162-179, top-level)
2. `merit_shop_purchases.stripe_payment_intent_id UNIQUE` (RPC pre-check, `20260422000000_phase_24_topup.sql:99-111`)
3. `merit_transactions_stripe_pi_unique` partial index (RPC safety net, `20260422000000_phase_24_topup.sql:36-38`, caught at `EXCEPTION WHEN unique_violation` L146-156)

### Legacy 410-Gone shim

- `supabase\functions\stripe-webhook\index.ts` — 30-line shim returns HTTP 410 + structured warn log on any POST. No DB writes, no signature verify. Lives on `by/env-fixes` branch only; not deployed to production main.

---

## 7. Other Integrations (unchanged from v2.0)

These are not v3.0 targets but are loaded by adjacent flows:

- **Anthropic Claude** — wraps every feature via `withMerits`. Client at `supabase\functions\_shared\anthropic.ts`. Models routed via `_shared\tier-config.ts` (Free → Haiku 4.5, Pro/Elite → Sonnet for resume, Haiku for career). Auth: `ANTHROPIC_API_KEY`.
- **Firecrawl** — LinkedIn scraping in `analyze-career\index.ts` only; `FIRECRAWL_API_KEY` optional.
- **Resend** — Transactional email in 8 functions; webhook receipt email fired from `stripe-webhook-handler\index.ts:579-614`. `RESEND_API_KEY`.
- **Paddle** (legacy) — `supabase\functions\paddle-webhook\index.ts` retained read-only; `profiles.paddle_customer_id/paddle_subscription_id` columns still surface in `Settings\Billing.tsx:139-144` legacy notice. Phase 27 plan is full removal post-renewal.
- **Supabase Auth / Postgres / Storage** — `@supabase/supabase-js` 2.81.1; service role for edge writes; RLS-protected user reads.
- **Supabase Realtime** — NOT currently used for merit balance updates. v3.0 candidate for Bug 4 fix.
- **Vercel Analytics + Speed Insights** — `src\App.tsx:9-10,98-99`.

---

## 8. Environment Variables (merit/Stripe-relevant)

**Frontend** (`.env.local`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY`

**Edge function secrets:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — `stripe-webhook-handler\index.ts:114`
- `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL` — subscription priceIds (server-side only, never client)
- `STRIPE_PRICE_MERIT_3`, `STRIPE_PRICE_MERIT_10`, `STRIPE_PRICE_MERIT_25`, `STRIPE_PRICE_MERIT_50` — shop pack priceIds
- `MERIT_SYSTEM_ENABLED` — read at module load via `merit-gateway.ts:27` (cold-start cached, requires worker restart to flip)
- `INTERNAL_JOB_SECRET` — async job worker auth
- `APP_URL` — checkout success/cancel URLs and shop_receipt billing link (`stripe-webhook-handler\index.ts:605`)

---

## 9. v3.0 Quick-Reference: Files That Will Likely Change

**Free cap raise (5→10 monthly):**
- `supabase\migrations\<new>_free_tier_monthly_replenish.sql` — alter trigger, alter `reset_subscription_merits`, add Free to pg_cron sweep, backfill existing users
- `src\config\pricing-config.ts` — already 10, no change needed for cap display
- `src\pages\Settings\Billing.tsx:43` — update `allowance: '5 lifetime Merits'` → `'10 Merits/month'`
- `src\components\PricingTable.tsx`, `src\components\PlanComparisonTable.tsx` — same string fix

**Optimistic deduction UI:**
- `src\hooks\useMerits.ts` — add `optimisticDeduct(cost)` helper using `queryClient.setQueryData`
- All 5 feature pages (Upload, LinkedInGrader, CareerCompass, RecruitingLens, InterviewPrep) — call optimistic helper on submit + invalidate on response/error

**Shop cap-display race fix:**
- `src\components\topup\StripePaymentElementModal.tsx:94-101` — replace single invalidation with poll-until-shop-incremented or Supabase Realtime subscription

**`/checkout` 404 fix:**
- `src\App.tsx` — add `/checkout` route OR
- `src\pages\Pricing.tsx:22` — change to event-driven embedded modal (parallel to top-up flow)

**`/settings/billing` loading fix:**
- `src\pages\Settings\Billing.tsx:291-313` — handle `userId === null` explicitly; use `.maybeSingle()` instead of `.single()`; tighten `profileLoading` to `userId && profileQueryIsLoading`

**Phase 27 deploy (carry-over tech debt):**
- Branch `by/env-fixes` commits to merge to main: `79e6fb3 / cd4e582 / 008ba6f / 551c933 / 36a266e / 0b62d46 / 93da3c3 / e1c34ea`
- Files: `supabase\functions\stripe-webhook\index.ts` (410-Gone shim), `scripts\phase21-runbook.ps1` (D1/D2/D4 ack ceremonies)
