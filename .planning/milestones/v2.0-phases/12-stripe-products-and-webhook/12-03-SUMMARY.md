---
phase: 12-stripe-products-and-webhook
plan: 03
subsystem: payments
tags: [stripe, provisioning, node-esm, idempotency, coupon, merit-shop]

# Dependency graph
requires:
  - phase: 07-stripe-backend
    provides: 4 subscription Price objects (Pro/Elite × monthly/annual) + STRIPE_PRICE_*_MONTHLY/ANNUAL env var contract
  - phase: 12-stripe-products-and-webhook
    provides: 12-01 wave 1 shared helpers (price-resolver promoted to _shared, shop-pack-resolver, fixture factories)
provides:
  - Idempotent Node ESM provisioning script for 4 shop Products+Prices (merit_pack_3/10/25/50) keyed by Stripe lookup_key
  - Idempotent Node ESM provisioning script for the agk02110 promo coupon keyed by caller-supplied id
  - Drift-detection mode (--check) on both scripts that exits 1 when expected resources are missing
  - Subscription Price amount verification path (verifies $8.99/$89.99/$16.99/$169.99 against env var ids)
  - Operator README runbook covering both scripts, secret-set steps, and the A1 assumption mitigation
affects: [12-04-create-checkout-session, 12-05-stripe-webhook-handler, 12-06-deploy, 13-merit-enforcement, 20-merit-shop-ui]

# Tech tracking
tech-stack:
  added: [stripe-node-sdk-via-npx]
  patterns:
    - "Retrieve-or-create idempotency by lookup_key (shop Prices) and caller-supplied id (coupon)"
    - "Stripe Node SDK invoked via `npx --yes stripe@14` to keep package.json clean"
    - "Drift detection via --check flag (read-only mode)"
    - "Operator-confirmed assumptions: defaulted terms emit a runtime [WARN], explicit flags suppress the warning"

key-files:
  created:
    - scripts/provision-stripe-products.mjs
    - scripts/provision-stripe-coupon.mjs
    - scripts/README-stripe-provisioning.md
  modified: []

key-decisions:
  - "Stripe Node SDK kept out of package.json — operator runs via `npx --yes stripe@14` or `npm install --no-save stripe@14` in CI"
  - "Sub Price verification reads the existing STRIPE_PRICE_*_MONTHLY/ANNUAL env vars (Phase 07 contract) — missing env vars are skip warnings, not errors, so the script remains usable in greenfield envs"
  - "Coupon resolution reads STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_ELITE_MONTHLY env vars and dereferences price.product to find the Pro + Elite Product ids — no hard-coded Stripe id literals anywhere"
  - "A1 assumption (`percent_off=100`, `duration=forever`) is the default but emits a runtime [WARN] when neither flag is explicit — passing either flag suppresses the warning and is treated as operator confirmation"
  - "apiVersion pinned to '2024-11-20' to match the Deno-side _shared/stripe-client.ts SDK pin"

patterns-established:
  - "Provisioning script idempotency: retrieve-or-create with stable identifier (lookup_key for Prices, id for coupons), --check flag for drift detection, exit 0 on no-op re-runs"
  - "Operator copy block: scripts emit `supabase secrets set` lines on stdout for the operator to paste into the matching Supabase project"
  - "Assumption warning protocol: defaulted assumptions emit a [WARN] line at runtime; passing the corresponding flag explicitly is treated as operator confirmation and suppresses the warning"

requirements-completed: [SUB-01, SUB-02, SUB-03, SUB-04, SHOP-01, SHOP-02, SHOP-03, SHOP-04, MIG-06]

# Metrics
duration: 4min
completed: 2026-04-15
---

# Phase 12 Plan 03: Stripe Products + Coupon Provisioning Scripts Summary

**Idempotent Node ESM provisioning scripts for 4 shop Products+Prices, sub Price amount verification ($8.99/$89.99/$16.99/$169.99), and the agk02110 promo coupon — keyed by Stripe lookup_key and caller-supplied id, runnable via `npx stripe@14` with no package.json churn**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-15T21:49:07Z
- **Completed:** 2026-04-15T21:53:00Z (approx)
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- Shipped `scripts/provision-stripe-products.mjs` — retrieve-or-create 4 shop Products+Prices for the 3/10/25/50-pack Merit catalog by `lookup_key`, plus a verification step that reads each `STRIPE_PRICE_*_MONTHLY/ANNUAL` env var and asserts `price.unit_amount` matches the Phase 12 spec amounts ($8.99/$89.99/$16.99/$169.99).
- Shipped `scripts/provision-stripe-coupon.mjs` — retrieve-or-create the `agk02110` coupon by caller-supplied id, with `applies_to.products` resolved live from `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_ELITE_MONTHLY` (no hard-coded ids), and a runtime `[WARN]` on the A1 assumption (`percent_off=100`, `duration=forever`) when neither flag is explicit.
- Shipped `scripts/README-stripe-provisioning.md` — operator runbook covering both scripts, the `supabase secrets set` follow-up step, the A1 confirmation requirement, and Wave 2 dependency notes.
- Closed SUB-01..04 (sub Price verification path), SHOP-01..04 (shop Price provisioning), and MIG-06 (coupon preservation).

## Task Commits

Each task was committed atomically.

1. **Task 1: provision-stripe-products.mjs** — `0b5ce6d` (feat)
2. **Task 2: provision-stripe-coupon.mjs + README** — `f390272` (feat)

_No plan-metadata commit yet — execute-plan worktree mode skips the orchestrator-owned shared-file commit; SUMMARY.md is committed separately at the end._

## Files Created/Modified

- `scripts/provision-stripe-products.mjs` — 234 lines. Idempotent Node ESM script. Parses `--env staging|production` (required) and `--check` (read-only). Reads `STRIPE_SECRET_KEY` (exit 1 if missing). Defines `SHOP_CATALOG` with 4 packs (`unit_amount: 199/499/999/1799`, `lookup_key: merit_pack_3/10/25/50`) and `SUB_VERIFY` with 4 expected amounts (`899`, `8999`, `1699`, `16999`). For each shop entry, calls `stripe.prices.search({ query: "lookup_key:'merit_pack_X' AND active:'true'" })` — reuse on hit, create Product+Price on miss. For each sub entry, calls `stripe.prices.retrieve(envVarValue)` and asserts `price.unit_amount === expected`. Mismatches and create errors flip `exitCode = 1`. On success, prints a `supabase secrets set STRIPE_PRICE_MERIT_<N>=<id>` block for operator copy. Stripe SDK pinned to `apiVersion: '2024-11-20'`.
- `scripts/provision-stripe-coupon.mjs` — 264 lines. Idempotent Node ESM script. Parses `--env staging|production` (required), `--check` (optional), `--percent-off N` (1..100, default 100), `--duration forever|once|repeating` (default `forever`). Reads `STRIPE_SECRET_KEY` (exit 1 if missing). Resolves Pro + Elite Product ids by reading `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_ELITE_MONTHLY` and calling `stripe.prices.retrieve(priceId)` to extract `price.product` (no hard-coded Stripe id literals). `ensureCoupon` retrieves by id, falls through to `stripe.coupons.create({ id, ...params })` only on `err.code === 'resource_missing'`. `--check` mode is retrieve-only. Emits a runtime `[WARN]` on the A1 assumption when neither `--percent-off` nor `--duration` is explicit. Final summary always logs `applies_to.products` and warns (not fails) on drift between resolved and attached Products.
- `scripts/README-stripe-provisioning.md` — 116 lines. Operator runbook for both scripts. Tables for shop pack mapping, sub Price expected amounts, and `STRIPE_PRICE_*` env var contract. Explicit `npx --yes stripe@14` install instructions (SDK is intentionally NOT in package.json). A1 assumption section calls out the runtime warning and the operator confirmation protocol. Wave 2 dependency notes clarify these scripts only depend on Phase 07 sub Prices being live.

## Decisions Made

- **Stripe Node SDK kept out of `package.json`.** Plan task 1 explicitly forbids adding the SDK; the operator runs via `npx --yes stripe@14` or installs `--no-save` in CI. README documents the install path.
- **`apiVersion: '2024-11-20'` pinned in both scripts.** Matches the Deno-side `_shared/stripe-client.ts` SDK pin so behavior is consistent across runtime contexts.
- **Sub Price verification env vars are skip-warnings, not errors.** A greenfield environment that has not yet provisioned subs should still be able to run the products script and provision shop Prices. Missing sub env vars print `[skip] STRIPE_PRICE_X not set in current env` and continue.
- **Coupon resolves Pro + Elite Product ids dynamically from sub Price env vars.** Reading `STRIPE_PRICE_PRO_MONTHLY` and dereferencing `price.product` keeps the script free of hard-coded Stripe id literals (Phase 07 D-08/D-09 invariant carries forward). Both env vars are required at run time — exit 1 if missing.
- **A1 assumption surfaced at runtime, not silently applied.** Default coupon terms are `percent_off=100` + `duration=forever` per Research A1, but a runtime `[WARN]` line restates the assumption every run unless the operator passes either flag explicitly. This matches the Plan 06 DEPLOY_RUNBOOK confirmation protocol described in the Research file (Open Question 2 resolution).
- **Drift warning on `applies_to.products` mismatch is a warn, not a fail.** If the existing coupon is attached to different Products than the script resolves now, the coupon retrieve still succeeds (the user may have manually re-attached). Operator decides whether to reconcile.
- **Both scripts exit 1 immediately on missing `STRIPE_SECRET_KEY`.** No partial runs that mutate Stripe state without explicit operator opt-in.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria for both tasks met on the first pass:

- Task 1 acceptance criteria (file exists, `node --check` passes, all 4 `unit_amount` literals, all 4 `lookup_key` literals, all 4 sub verify amounts, `apiVersion: '2024-11-20'`, `--check` arg handling, `stripe.prices.search` with `lookup_key:` query) — all confirmed via grep before commit.
- Task 2 acceptance criteria (`provision-stripe-coupon.mjs` exists, `node --check` passes, contains `'agk02110'`, contains `apiVersion: '2024-11-20'`, contains retrieve-or-create with `err.code === 'resource_missing'` branch, contains `applies_to: { products:` pattern, contains the A1 warn output string, README exists and mentions both scripts) — all confirmed via grep before commit.

## Issues Encountered

- **Worktree contained pre-existing untracked/modified files.** The worktree base was reset to the plan-required commit `511650a`, but the working tree retained an untracked `supabase/functions/reset-subscription-merits/index.ts` and a modified `supabase/functions/reset-subscription-merits/index.test.ts` from prior worktree state. These files are unrelated to plan 12-03 and were left untouched per the destructive_git_prohibition rule. All Task 1 and Task 2 commits stage files explicitly by name, so the unrelated dirty state was not included in any commit. The base commit hash matches the requirement and no plan files were affected.

## User Setup Required

None — these scripts are themselves the user setup mechanism for SHOP-01..04 and MIG-06. Operator instructions live in `scripts/README-stripe-provisioning.md` and will be cross-referenced from the Plan 06 DEPLOY_RUNBOOK.md (Wave 3).

## Next Phase Readiness

- `STRIPE_PRICE_MERIT_3/10/25/50` env var contract is now established. Plan 12-04 (`create-checkout-session` extension) and Plan 12-05 (`stripe-webhook-handler`) can read these env vars via `_shared/shop-pack-resolver.ts` (shipped in Plan 12-01) without the Price ids needing to exist in Stripe yet — that is an operator deploy step covered by the README.
- The 4 sub Price amounts are verified against the Phase 07 env vars at script run time. If Phase 07 Prices ever drift from spec, a re-run of `provision-stripe-products.mjs --check` against the affected env will surface the mismatch loudly.
- The `agk02110` coupon is provisionable on demand. The A1 assumption warning ensures the operator confirms terms before production deploy. Plan 06 (Wave 3) DEPLOY_RUNBOOK.md will reference this script as a one-shot deploy step.

## Self-Check: PASSED

Verified after writing SUMMARY.md (before final commit):

- `scripts/provision-stripe-products.mjs` — FOUND
- `scripts/provision-stripe-coupon.mjs` — FOUND
- `scripts/README-stripe-provisioning.md` — FOUND
- Commit `0b5ce6d` (feat 12-03 products) — FOUND on branch
- Commit `f390272` (feat 12-03 coupon + README) — FOUND on branch
- `node --check scripts/provision-stripe-products.mjs` — passes
- `node --check scripts/provision-stripe-coupon.mjs` — passes

---
*Phase: 12-stripe-products-and-webhook*
*Completed: 2026-04-15*
