---
phase: 12-stripe-products-and-webhook
plan: "07"
started: 2026-04-16T12:00:00Z
completed: 2026-04-16T14:00:00Z
status: complete
---

## Overview

Applied Phase 12 migration to staging project `cimjltzovkahkqecpwgi` via `supabase db push`. All schema assertions, backfill counts, cron registration, and edge-function tests verified green.

## Pre-flight

Phase 11 RPC existence check (3/3 present):

```json
[
  { "proname": "credit_shop_merits" },
  { "proname": "grant_upgrade_diff" },
  { "proname": "reset_subscription_merits" }
]
```

Note: `grant_upgrade_diff` was missing from the original Phase 11 migration. Added to Phase 12 migration as Section 0 (D-13/SUB-14 contract ask) before push.

## Push output

`supabase db push` exited 0 against staging project `cimjltzovkahkqecpwgi`.

Migration applied: `20260415000001_phase_12_stripe_products_webhook.sql`

Expected NOTICE lines: `phase-12-backfill complete: credited 6 active subscribers` and `phase-12 migration verify OK`.

## Schema assertions

### profiles.pending_downgrade_tier column

```json
[
  {
    "column_name": "pending_downgrade_tier",
    "data_type": "text",
    "is_nullable": "YES"
  }
]
```

### Backfill rows vs active subscribers

```json
[{ "backfill_rows": 6 }]
[{ "active_sub_users": 6 }]
```

6 backfill rows = 6 active subscribers. All credited exactly once.

### Cron job registration

```json
[
  {
    "jobname": "reset-subscription-merits-sweep",
    "schedule": "*/15 * * * *"
  }
]
```

Registered with 15-minute cadence as specified by SUB-11/SUB-12/NFR-08.

## Edge function tests

```
ok | 19 passed | 0 failed (241ms)
```

All Phase 12 tests green including stripe-webhook-handler, create-checkout-session, and reset-subscription-merits.

## Per-environment settings

`app.functions_base_url` and `app.internal_job_secret` status on staging to be confirmed per DEPLOY_RUNBOOK.md. These GUCs power the pg_cron `net.http_post` call. The migration is non-fatal if they are not yet set (cron tick produces invalid URL until configured).

## Known deferrals

- **A1 (coupon terms):** Promo `agk02110` terms assumed as 100% off forever per research. Confirm with founder before production cutover.
- **A10 (Dashboard cutover):** 24h parallel-run recommended: add new `stripe-webhook-handler` endpoint in Stripe dashboard, subscribe to 6 events, run alongside old `stripe-webhook` endpoint, verify logs, then disable old endpoint.

## Key files

- created: (none — this plan applies migrations, does not create source files)
- modified: `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql` (added `grant_upgrade_diff` RPC)

## Self-Check: PASSED
