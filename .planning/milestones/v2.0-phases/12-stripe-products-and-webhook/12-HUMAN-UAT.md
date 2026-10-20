***

status: partial
phase: 12-stripe-products-and-webhook
source: \[12-VERIFICATION.md]
started: 2026-04-16T19:00:00Z
updated: 2026-04-16T19:00:00Z
-----------------------------

## Current Test

\[awaiting human testing]

## Tests

### 1. Stripe Dashboard Price Verification

expected: Run `node scripts/provision-stripe-products.mjs` against staging. Stripe dashboard shows 4 subscription Price objects (pro/elite x monthly/yearly) and 4 one-time Merit pack Price objects (3/10/25/50) with correct amounts.
result: \[pending]

### 2. Stripe Dashboard Coupon Verification

expected: Run `node scripts/provision-stripe-coupon.mjs` against staging. Stripe dashboard shows `agk02110` coupon attached to Pro/Elite subscription products.
result: \[pending]

### 3. End-to-End Checkout Webhook Flow

expected: Send a test webhook via Stripe CLI (`stripe trigger checkout.session.completed`). Verify profile gets `subscription_tier = 'pro'`, merit balance update (75 Merits), and `subscription_reset_date` stamp within 2 seconds.
result: \[pending]

### 4. End-to-End Idempotency (TEST-08)

expected: Send the same Stripe event twice via CLI. Second delivery returns `duplicate: true` with no additional merit credit in the database.
result: \[pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
