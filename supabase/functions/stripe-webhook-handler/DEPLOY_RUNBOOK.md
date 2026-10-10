# Stripe Webhook Handler (Phase 12) -- Deploy Runbook

> **Phase 12 deliverable.** This runbook documents the operator-side tasks
> required to bring the `stripe-webhook-handler` edge function live on
> staging and production. This handler supersedes the Phase 07
> `stripe-webhook` function and handles 6 event types including checkout
> sessions and monthly-plan invoice renewals.
>
> All values shown here are placeholders (`sk_test_...`, `whsec_...`,
> `price_...`). **Never commit real secrets to this file.**

---

## 1. Pre-Deploy Checklist

Verify all upstream dependencies are in place before deploying. Every
item here is a hard prerequisite -- deploying without them will cause
runtime failures on real webhook traffic.

### 1a. Phase 11 RPCs exist

Confirm these three RPCs are present in `pg_proc`:

```sql
SELECT proname FROM pg_proc
WHERE proname IN (
  'reset_subscription_merits',
  'credit_shop_merits',
  'grant_upgrade_diff'
);
```

Expected: 3 rows. If any are missing, apply the Phase 11 migration
first (`supabase migration up` or run the SQL manually).

### 1b. Phase 12 migration applied

The Phase 12 migration adds:

- `profiles.pending_downgrade_tier` column (nullable text)
- `pg_cron` extension enabled (`CREATE EXTENSION IF NOT EXISTS pg_cron`)
- `cron.schedule` row for `reset-subscription-merits-sweep`

Verify:

```sql
-- Column exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'pending_downgrade_tier';

-- pg_cron job exists
SELECT jobname FROM cron.job WHERE jobname = 'reset-subscription-merits-sweep';
```

### 1c. Database settings configured (per environment)

These `ALTER DATABASE` settings are required for pg_cron to call edge
functions and for internal-secret auth:

```sql
ALTER DATABASE postgres SET app.functions_base_url = 'https://<project-ref>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.internal_job_secret = '<INTERNAL_JOB_SECRET value>';
```

Replace `<project-ref>` with:
- **Staging:** `cimjltzovkahkqecpwgi`
- **Production:** `zjpjapgraoxdukdvpjes`

### 1d. Provisioning scripts run

```bash
# Subscription products + shop Merit pack products
STRIPE_SECRET_KEY=sk_... node scripts/provision-stripe-products.mjs --env <staging|production>

# Promo coupon agk02110
STRIPE_SECRET_KEY=sk_... node scripts/provision-stripe-coupon.mjs --env <staging|production>
```

Both scripts are idempotent -- re-running against an already-provisioned
environment is a no-op. The product script outputs the 4 shop Price IDs
needed for the secrets in section 2.

### 1e. Stripe Dashboard: Customer Portal saved

If not already done in Phase 07:

1. Go to **Settings > Billing > Customer Portal**.
2. Scroll to the bottom and click **Save** (no changes needed).

> **Why:** Until Save is clicked once, `stripe.billingPortal.sessions.create`
> fails with `No configuration provided for default test mode portal`.

---

## 2. Supabase Secrets Setup (per environment)

Set all required secrets on the target project. Replace each placeholder
with actual values from Stripe Dashboard and the provisioning script output.

```bash
# Core Stripe secrets (may already exist from Phase 07)
supabase secrets set STRIPE_SECRET_KEY=sk_... --project-ref <ref>
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref <ref>

# Subscription price IDs (may already exist from Phase 07)
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_PRO_ANNUAL=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_ELITE_MONTHLY=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_ELITE_ANNUAL=price_... --project-ref <ref>

# Shop Merit pack price IDs (NEW in Phase 12)
supabase secrets set STRIPE_PRICE_MERIT_3=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_MERIT_10=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_MERIT_25=price_... --project-ref <ref>
supabase secrets set STRIPE_PRICE_MERIT_50=price_... --project-ref <ref>

# Internal job secret (for pg_cron -> edge function auth)
supabase secrets set INTERNAL_JOB_SECRET=<secret> --project-ref <ref>
```

Verify all secrets are present:

```bash
supabase secrets list --project-ref <ref>
```

You should see `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 4
`STRIPE_PRICE_*` subscription entries, the 4 `STRIPE_PRICE_MERIT_*`
shop entries, and `INTERNAL_JOB_SECRET`.

---

## 3. Deploy Edge Functions

From the repo root, with the target project linked:

```bash
# Phase 12 webhook handler -- MUST use --no-verify-jwt
supabase functions deploy stripe-webhook-handler --no-verify-jwt --project-ref <ref>

# Phase 12 Merit reset batch function (called by pg_cron)
supabase functions deploy reset-subscription-merits --project-ref <ref>

# Phase 12 extended checkout (subscription + payment modes)
supabase functions deploy create-checkout-session --project-ref <ref>
```

> **Why `--no-verify-jwt` only on the webhook handler:** Stripe's HMAC
> signature is the only credential the webhook accepts -- there is no JWT
> on incoming Stripe requests. The handler validates signatures via
> `stripe.webhooks.constructEventAsync` using `STRIPE_WEBHOOK_SECRET`.
> The other functions require a user JWT or internal secret and must keep
> JWT verification enabled.

---

## 4. Stripe Dashboard Endpoint Swap (24h parallel run)

This is the critical cutover step. The new handler receives ALL webhook
traffic from Phase 12 forward.

### 4a. Add the new endpoint (do NOT remove the old one yet)

1. Go to **Developers > Webhooks > Add endpoint**.
2. **Endpoint URL:**
   ```
   https://<ref>.supabase.co/functions/v1/stripe-webhook-handler
   ```
3. **Events to send** -- subscribe to **exactly these 6** events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. Click **Add endpoint**.
5. On the endpoint detail page, click **Reveal** under "Signing secret"
   and copy the value (`whsec_...`). Update the `STRIPE_WEBHOOK_SECRET`
   Supabase secret to this new value:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<new_value> --project-ref <ref>
   ```
6. **Re-deploy** the webhook handler so it picks up the new secret:
   ```bash
   supabase functions deploy stripe-webhook-handler --no-verify-jwt --project-ref <ref>
   ```

> **Pitfall 8:** Stripe generates a **distinct** `whsec_` per endpoint.
> The new endpoint gets its own signing secret. The old Phase 07 endpoint
> keeps its original `whsec_`. Both can coexist during the parallel run.

### 4b. Run both endpoints in parallel for 24 hours

- Both endpoints receive the same events during the overlap window.
- The insert-first idempotency on `stripe_webhook_events.event_id`
  ensures the second handler to process any given event gets a 200
  duplicate response with no side effects.
- Monitor Supabase function logs for both handlers. Confirm:
  - New handler logs `event-processed` for each delivery.
  - Old handler logs `event-duplicate` for the same event IDs (or
    vice versa, depending on delivery order).

### 4c. Disable the old endpoint

After 24h with zero errors on the new handler:

1. Go to **Developers > Webhooks**.
2. Click the old Phase 07 endpoint (`/stripe-webhook`).
3. Click **...** (menu) > **Disable endpoint**.

> Do NOT delete the old endpoint yet -- keep it disabled so it can be
> re-enabled instantly for rollback.

---

## 5. Post-Deploy Smoke Test

### 5a. Stripe CLI trigger (staging only)

```bash
stripe trigger checkout.session.completed --override checkout_session:mode=subscription
```

Verify in Supabase Studio:
- `stripe_webhook_events` has a new row with `event_type = 'checkout.session.completed'`
- If a matching test profile exists: `user_merits.subscription_balance` updates
  within 2 seconds and a `merit_transactions` row is created

### 5b. Idempotency verification

1. **Developers > Webhooks > (new endpoint) > Send test webhook**.
2. Pick `customer.subscription.created`. Click **Send test webhook**.
3. Expect: HTTP `200`, response body `{"received":true,...}`.
4. Send the **same test webhook a second time**.
5. Expect: HTTP `200` with body `{"received":true,"duplicate":true}`.

### 5c. Event-type matrix

Repeat 5b for each of the 6 handled event types:

| Event | Expected Response |
|-------|-------------------|
| `customer.subscription.created` | 200, `matchedBy` or `profileFound:false` |
| `customer.subscription.updated` | 200, `matchedBy` or `profileFound:false` |
| `customer.subscription.deleted` | 200, status would flip to `canceled` |
| `invoice.payment_succeeded` | 200, `matchedBy` or `noop` for yearly |
| `invoice.payment_failed` | 200, status would flip to `past_due` |
| `checkout.session.completed` | 200, `matchedBy` or `profileFound:false` |

### 5d. Ignored-event verification

Send a test webhook for an event NOT in the 6 handled types (e.g.,
`payment_intent.succeeded`). Expect HTTP `200` with body
`{"received":true,"ignored":true,"type":"payment_intent.succeeded"}`.
Confirm **no row** was inserted into `stripe_webhook_events`.

---

## 6. Rollback

The Phase 07 `stripe-webhook` function remains deployed and
byte-identical to its original version. Rollback is a dashboard-only
operation:

1. Go to **Developers > Webhooks**.
2. **Re-enable** the old Phase 07 endpoint (`/stripe-webhook`).
3. **Disable** the new Phase 12 endpoint (`/stripe-webhook-handler`).
4. Restore the old `STRIPE_WEBHOOK_SECRET` if it was overwritten:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_<old_value> --project-ref <ref>
   ```

The old handler covers the 4 original event types
(`customer.subscription.created/updated/deleted`,
`invoice.payment_failed`). Merit grant events
(`checkout.session.completed`, `invoice.payment_succeeded`) will queue
in Stripe's retry buffer (72h window) and be processed once the new
handler is re-enabled.

---

## 7. Known Limitations

- **Promo coupon `agk02110` terms are ASSUMED** (100% off forever) per
  research A1. Confirm the exact discount percentage and duration with
  the founder before production cutover. If terms differ, update the
  provisioning script and re-run.
- **Yearly `invoice.payment_succeeded` is a no-op** in this handler.
  Monthly Merit grants for yearly subscribers are handled by the
  `reset-subscription-merits` edge function invoked by pg_cron every
  15 minutes. If pg_cron is not running, yearly subscribers will not
  receive their monthly Merit refills.
- **`pending_downgrade_tier` is written but not yet consumed.** The
  tier flip at period-end will be implemented when the pg_cron sweep
  processes the `customer.subscription.updated` cycle. Until then,
  downgrades are recorded but the actual tier change requires manual
  intervention or a follow-up phase.
- **Phase 07 `stripe-webhook` is NOT deleted.** It stays deployed as a
  rollback target until Phase 21 cleanup.

---

## Operator Sign-Off Checklist

Tick these before reporting "approved" on the Phase 12 deploy:

- [ ] Phase 11 RPCs verified in `pg_proc` (3 rows)
- [ ] Phase 12 migration applied (`pending_downgrade_tier` column + pg_cron job)
- [ ] `app.functions_base_url` and `app.internal_job_secret` DB settings configured
- [ ] Provisioning scripts run for target environment (products + coupon)
- [ ] All Supabase secrets set (6 subscription + 4 shop + `INTERNAL_JOB_SECRET`)
- [ ] 3 edge functions deployed (`stripe-webhook-handler`, `reset-subscription-merits`, `create-checkout-session`)
- [ ] New webhook endpoint registered with 6 event types in Stripe Dashboard
- [ ] New `STRIPE_WEBHOOK_SECRET` set and handler re-deployed
- [ ] 24h parallel run completed with zero errors on new handler
- [ ] Old endpoint disabled (not deleted)
- [ ] Smoke test: `checkout.session.completed` returned 200 and Merit balance updated
- [ ] Smoke test: duplicate webhook returned 200 with `duplicate:true`
- [ ] Smoke test: ignored event returned 200 with `ignored:true`
