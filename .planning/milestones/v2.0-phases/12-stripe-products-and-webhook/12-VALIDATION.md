***

phase: 12
slug: stripe-products-and-webhook
status: complete
nyquist\_compliant: true
wave\_0\_complete: true
created: 2026-04-14
audited: 2026-04-16
-------------------

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

***

## Test Infrastructure

| Property               | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| **Framework**          | Deno test (edge functions) + existing PowerShell runner |
| **Config file**        | `supabase/functions/deno.json`                          |
| **Quick run command**  | `.\scripts\run-edge-tests.ps1`                          |
| **Full suite command** | `.\scripts\run-edge-tests.ps1; npm run lint`            |
| **Estimated runtime**  | \~1 second (113 tests)                                  |

***

## Sampling Rate

* **After every task commit:** Run `.\scripts\run-edge-tests.ps1`
* **After every plan wave:** Run `.\scripts\run-edge-tests.ps1; npm run lint`
* **Before** **`/gsd-verify-work`:** Full suite must be green + manual Stripe CLI replay
* **Max feedback latency:** 60 seconds

***

## Per-Task Verification Map

| Task ID | Plan       | Wave | Requirement                                                                 | Test Type  | Automated Command                                                          | File                                      | Status          |
| ------- | ---------- | ---- | --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| T01-01  | 01         | 1    | BACK-05, NFR-06                                                             | unit       | `deno test --allow-all --no-check _shared/shop-pack-resolver.test.ts`      | `_shared/shop-pack-resolver.test.ts`      | ✅ green (9/9)   |
| T01-03  | 01         | 1    | TEST-08                                                                     | scaffold   | `deno test --allow-all --no-check stripe-webhook-handler/index.test.ts`    | `stripe-webhook-handler/index.test.ts`    | ✅ green (15/15) |
| T01-03  | 01         | 1    | BACK-03                                                                     | scaffold   | `deno test --allow-all --no-check reset-subscription-merits/index.test.ts` | `reset-subscription-merits/index.test.ts` | ✅ green (4/4)   |
| T04-01  | 04         | 2    | SUB-05, SUB-06, SHOP-12, BACK-04                                            | unit       | `deno test --allow-all --no-check create-checkout-session/index.test.ts`   | `create-checkout-session/index.test.ts`   | ✅ green (18/18) |
| T05-01  | 05         | 2    | BACK-03, SUB-11, SUB-12, NFR-08                                             | unit       | `deno test --allow-all --no-check reset-subscription-merits/index.test.ts` | `reset-subscription-merits/index.test.ts` | ✅ green (4/4)   |
| T06-01  | 06         | 2    | SUB-07..10, SUB-13..15, SHOP-06,07,09,11, BACK-02,05, NFR-04,06,07, TEST-08 | unit       | `deno test --allow-all --no-check stripe-webhook-handler/index.test.ts`    | `stripe-webhook-handler/index.test.ts`    | ✅ green (15/15) |
| T09-01  | 09         | 2    | TEST-08 + 14 more                                                           | behavioral | `deno test --allow-all --no-check stripe-webhook-handler/index.test.ts`    | `stripe-webhook-handler/index.test.ts`    | ✅ green (15/15) |
| WR-03   | review-fix | —    | addOneMonthIso month-end clamping                                           | unit       | `deno test --allow-all --no-check _shared/date-utils.test.ts`              | `_shared/date-utils.test.ts`              | ✅ green (7/7)   |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

***

## Wave 0 Requirements

* [x] `supabase/functions/stripe-webhook-handler/index.test.ts` — 15 behavioral tests covering signature, idempotency, 6-event router, merit RPCs
* [x] `supabase/functions/create-checkout-session/index.test.ts` — 18 tests covering subscription back-compat + payment mode
* [x] `supabase/functions/reset-subscription-merits/index.test.ts` — 4 tests covering internal auth, batch processing, error containment
* [x] `supabase/functions/_shared/shop-pack-resolver.test.ts` — 9 tests covering bidirectional pack size resolver
* [x] `supabase/functions/_shared/date-utils.test.ts` — 7 tests covering month-end clamping, year boundary, input types
* [x] `supabase/functions/_shared/stripe-client.test.ts` — pre-existing shared Stripe client tests

***

## Manual-Only Verifications

| Behavior                             | Requirement     | Why Manual                                       | Test Instructions                                                                                                                     |
| ------------------------------------ | --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end Stripe Checkout redirect  | SUB-02, SHOP-01 | Requires real Stripe test-mode session           | Run `stripe trigger checkout.session.completed` against staging; verify `profiles.subscription_tier` + merit balance update within 2s |
| Promo code `agk02110` application    | SUB-14          | Stripe coupon dashboard dependency               | Create test subscription with coupon via Stripe CLI; confirm final amount reflects discount                                           |
| Sub Price amount verification        | SUB-01..04      | Requires Stripe API credentials                  | Run `node scripts/provision-stripe-products.mjs --env staging --check`; verify 4 sub Prices match spec amounts                        |
| Shop Product provisioning            | SHOP-01..04     | Requires Stripe API credentials                  | Run `node scripts/provision-stripe-products.mjs --env staging`; verify 4 Products + Prices in Stripe dashboard                        |
| MIG-03 subscriber backfill           | MIG-03          | One-shot migration, verified during staging push | Re-verify: `SELECT count(*) FROM merit_transactions WHERE source = 'phase-12-backfill'` matches active subscriber count               |
| Coupon provisioning                  | MIG-06          | Requires Stripe API credentials                  | Run `node scripts/provision-stripe-coupon.mjs --env staging`; verify `agk02110` in Stripe dashboard                                   |
| Pro->Elite upgrade diff credit (E2E) | SUB-08          | Requires live subscription state                 | Trigger `customer.subscription.updated` with tier change in staging; verify `grant_upgrade_diff` RPC output                           |

***

## Validation Sign-Off

* [x] All tasks have `<automated>` verify or Wave 0 dependencies
* [x] Sampling continuity: no 3 consecutive tasks without automated verify
* [x] Wave 0 covers all MISSING references
* [x] No watch-mode flags
* [x] Feedback latency < 60s
* [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete

***

## Validation Audit 2026-04-16

| Metric     | Count |
| ---------- | ----- |
| Gaps found | 2     |
| Resolved   | 2     |
| Escalated  | 0     |

**Gap 1 (MISSING):** `_shared/date-utils.ts` had no test file. Created `_shared/date-utils.test.ts` with 7 tests covering normal advance, month-end clamping (Jan→Feb non-leap, Jan→Feb leap, Mar→Apr), year boundary, and input type variants. All 7 green.

**Gap 2 (PARTIAL):** `run-edge-tests.ps1` still had Phase 12 tests in a "red scaffolds" block with relaxed error handling. Promoted `stripe-webhook-handler/index.test.ts` and `reset-subscription-merits/index.test.ts` into the main strict test list and added `date-utils.test.ts`. Removed the entire scaffolds block. Full suite: 113 passed, 0 failed.
