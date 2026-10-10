# Phase 12 Stripe Provisioning Scripts

Two idempotent Node ES module scripts that stand up the Stripe-side resources
required by Phase 12 (Merit System & Monetization). Both scripts are safe to
re-run — each uses a retrieve-or-create pattern keyed by stable identifiers
(`lookup_key` for shop Prices, caller-supplied `id` for the coupon), and a
second run on the same environment exits 0 with no drift.

The Stripe Node SDK is intentionally **not** in `package.json`. Run via:

```
npx --yes stripe@14
# or in CI:
npm install --no-save stripe@14
```

`apiVersion` is pinned to `2024-11-20` to match the Deno-side
`_shared/stripe-client.ts` SDK pin.

## provision-stripe-products.mjs

Creates 4 one-time shop Products + Prices for Merit packs (SHOP-01..04) and
verifies the 4 subscription Prices already shipped in Phase 07 (SUB-01..04)
still match the spec amounts.

| Pack    | Lookup key      | Amount  | Env var emitted         |
| ------- | --------------- | ------- | ----------------------- |
| 3-pack  | `merit_pack_3`  | \$1.99  | `STRIPE_PRICE_MERIT_3`  |
| 10-pack | `merit_pack_10` | \$4.99  | `STRIPE_PRICE_MERIT_10` |
| 25-pack | `merit_pack_25` | \$9.99  | `STRIPE_PRICE_MERIT_25` |
| 50-pack | `merit_pack_50` | \$17.99 | `STRIPE_PRICE_MERIT_50` |

Subscription Prices verified against:

| Plan          | Expected amount | Env var read                 |
| ------------- | --------------- | ---------------------------- |
| Pro monthly   | \$8.99          | `STRIPE_PRICE_PRO_MONTHLY`   |
| Pro yearly    | \$89.99         | `STRIPE_PRICE_PRO_ANNUAL`    |
| Elite monthly | \$16.99         | `STRIPE_PRICE_ELITE_MONTHLY` |
| Elite yearly  | \$169.99        | `STRIPE_PRICE_ELITE_ANNUAL`  |

**Usage:**

```
STRIPE_SECRET_KEY=sk_test_...  node scripts/provision-stripe-products.mjs --env staging
STRIPE_SECRET_KEY=sk_live_...  node scripts/provision-stripe-products.mjs --env production
STRIPE_SECRET_KEY=sk_test_...  node scripts/provision-stripe-products.mjs --env staging --check
```

`--check` runs read-only and exits 1 if any shop entry is missing.

After a successful run, the script prints a `secrets set` block. Copy those
lines and run them against the matching Supabase project:

```
supabase secrets set --project-ref <ref> STRIPE_PRICE_MERIT_3=price_...
supabase secrets set --project-ref <ref> STRIPE_PRICE_MERIT_10=price_...
supabase secrets set --project-ref <ref> STRIPE_PRICE_MERIT_25=price_...
supabase secrets set --project-ref <ref> STRIPE_PRICE_MERIT_50=price_...
```

The 4 subscription `STRIPE_PRICE_*` env vars must already be set in the target
environment before running this script — the verification step requires them.
Missing sub env vars produce a `[skip]` warning, not an error, so the script
remains usable in greenfield envs that have not yet provisioned subs.

## provision-stripe-coupon.mjs

Creates / verifies the `agk02110` promo coupon and attaches it to the Pro and
Elite Products via `applies_to.products`. Implements MIG-06.

The coupon is keyed by caller-supplied `id` (`agk02110`), so the script is
idempotent: a re-run on the same environment retrieves the existing coupon
and exits 0.

**Usage:**

```
STRIPE_SECRET_KEY=sk_test_...  node scripts/provision-stripe-coupon.mjs --env staging
STRIPE_SECRET_KEY=sk_test_...  node scripts/provision-stripe-coupon.mjs --env staging --check
STRIPE_SECRET_KEY=sk_live_...  node scripts/provision-stripe-coupon.mjs --env production --percent-off 100 --duration forever
```

`--check` runs retrieve-only and exits 1 if the coupon is missing.

**A1 ASSUMPTION — confirm before production deploy:**

The default discount terms are `percent_off=100` and `duration=forever`,
attached to the Pro + Elite subscription Products only. These are
**Research A1 assumptions** carried forward from
`.planning/phases/12-stripe-products-and-webhook/12-RESEARCH.md`.

When the script is run with neither `--percent-off` nor `--duration` set
explicitly, it emits a `[WARN]` line at the top of the run restating the
assumed terms. Confirm the actual promo semantics with the user/founder
before running the script against production. Passing either flag explicitly
(even with the same value) suppresses the warning — that flag is treated as
operator confirmation.

The script also requires `STRIPE_PRICE_PRO_MONTHLY` and
`STRIPE_PRICE_ELITE_MONTHLY` to be set in the environment so it can resolve
the Pro and Elite Product ids (via `prices.retrieve(price).product`) without
hard-coding any Stripe id literal in the source.

## Wave 2 vs Wave 0 dependencies

These scripts ship in Wave 2 of Phase 12. They depend only on:

* The Phase 07 subscription Prices already existing in the target Stripe
  account (verified, not created).
* `STRIPE_SECRET_KEY` and the 4 sub Price env vars being set in the operator's
  shell at run time.

They do NOT depend on the Phase 12 webhook handler, migration, or
`create-checkout-session` extension being deployed yet. Order of operations is
flexible — these scripts can be run before or after the rest of Wave 2.
