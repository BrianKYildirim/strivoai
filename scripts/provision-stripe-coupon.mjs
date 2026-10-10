#!/usr/bin/env node
/**
 * Phase 12: idempotent Stripe promo coupon provisioning for `agk02110`.
 *
 * Creates (or verifies) the `agk02110` promo coupon and attaches it to the
 * Pro + Elite subscription Products via `applies_to.products`. Re-running the
 * script is a no-op: existing coupons keyed by caller-supplied `id` are
 * retrieved, not recreated. Implements MIG-06.
 *
 * IMPORTANT: The promo discount terms (`percent_off`, `duration`) are an
 * **assumption** (Research A1 — `100% off / forever`). If the script is run
 * without explicit `--percent-off` / `--duration` overrides, a runtime warning
 * is emitted at the top of the run instructing the operator to confirm with
 * the user/founder before production deploy.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/provision-stripe-coupon.mjs --env staging
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/provision-stripe-coupon.mjs --env staging --check
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-coupon.mjs --env production --percent-off 100 --duration forever
 *
 * Stripe SDK install:
 *   The Stripe Node SDK is NOT in package.json. Run with one of:
 *     npx --yes stripe@14
 *     npm install --no-save stripe@14 (in CI) then `node scripts/provision-stripe-coupon.mjs ...`
 */

import Stripe from 'stripe';

// ── Constants ──────────────────────────────────────────────────────────────

const COUPON_ID = 'bqyu0S69';

// ── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    env: null,
    check: false,
    percentOff: 100,
    duration: 'forever',
    percentOffExplicit: false,
    durationExplicit: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.env = args[++i];
        break;
      case '--check':
        config.check = true;
        break;
      case '--percent-off': {
        const raw = args[++i];
        const n = parseInt(raw, 10);
        if (isNaN(n) || n < 1 || n > 100) {
          console.error(`Error: --percent-off must be an integer between 1 and 100 (got: ${raw})`);
          process.exit(1);
        }
        config.percentOff = n;
        config.percentOffExplicit = true;
        break;
      }
      case '--duration': {
        const raw = args[++i];
        if (!['forever', 'once', 'repeating'].includes(raw)) {
          console.error(`Error: --duration must be one of forever|once|repeating (got: ${raw})`);
          process.exit(1);
        }
        config.duration = raw;
        config.durationExplicit = true;
        break;
      }
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!config.env || !['staging', 'production'].includes(config.env)) {
    console.error('Error: --env must be "staging" or "production"');
    printUsage();
    process.exit(1);
  }

  return config;
}

function printUsage() {
  console.log(`
Usage: node scripts/provision-stripe-coupon.mjs --env <staging|production> [options]

Options:
  --env staging|production         Target environment label (required)
  --check                          Read-only mode: error if coupon missing, do not create
  --percent-off N                  Percent off (1..100, default 100). Passing this
                                   flag suppresses the A1 assumption warning.
  --duration forever|once|repeating  Coupon duration (default "forever"). Passing this
                                   flag suppresses the A1 assumption warning.
  --help, -h                       Show this help message

Environment variables:
  STRIPE_SECRET_KEY              (required) Stripe secret key for the target environment
  STRIPE_PRICE_PRO_MONTHLY       (required) Pro sub Price ID — used to resolve Pro Product
  STRIPE_PRICE_ELITE_MONTHLY     (required) Elite sub Price ID — used to resolve Elite Product
`);
}

// ── Provisioning Logic ─────────────────────────────────────────────────────

/**
 * Retrieve-or-create a Stripe coupon by caller-supplied id. Stripe permits
 * caller-supplied ids on coupons specifically (Research A3); `retrieve` throws
 * `resource_missing` when the id is not yet provisioned, which is the cue to
 * create. Idempotent: re-running is a no-op once the coupon exists.
 */
async function ensureCoupon(stripe, id, params) {
  const expectedProducts = params.applies_to?.products ?? [];

  try {
    const existing = await stripe.coupons.retrieve(id);
    const actualProducts = existing.applies_to?.products ?? [];

    // If coupon exists but applies_to is missing, delete and recreate
    if (expectedProducts.length > 0 && actualProducts.length === 0) {
      console.log(`[fix] coupon ${id} exists without applies_to — deleting to recreate`);
      await stripe.coupons.del(id);
      const recreated = await stripe.coupons.create({ id, ...params });
      return { coupon: recreated, created: true };
    }

    return { coupon: existing, created: false };
  } catch (err) {
    if (err.code === 'resource_missing') {
      const created = await stripe.coupons.create({ id, ...params });
      return { coupon: created, created: true };
    }
    throw err;
  }
}

/**
 * Resolve a Stripe Product id by reading a Price env var and fetching the
 * Price object, then extracting `price.product`. Phase 07 ships the 4
 * subscription Prices keyed by env var; this lookup avoids hard-coding any
 * Stripe id literal in the script.
 */
async function resolveProductIdFromPriceEnv(stripe, envVar) {
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(
      `Missing env var ${envVar}. The coupon must attach to Pro + Elite Products; ` +
        `set ${envVar} for the target environment before running this script.`,
    );
  }
  const price = await stripe.prices.retrieve(priceId);
  if (typeof price.product !== 'string') {
    throw new Error(
      `Price ${priceId} did not return a product id (got ${typeof price.product}). ` +
        `Cannot attach coupon without resolved Product id.`,
    );
  }
  return price.product;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Error: STRIPE_SECRET_KEY environment variable is required.');
    console.error('Export the secret for the target environment before running this script.');
    process.exit(1);
  }

  console.log(`=== Stripe Coupon Provisioning (env=${config.env}, check=${config.check}) ===\n`);

  // A1 assumption warning — only when running with defaults (operator did
  // not explicitly confirm terms via flags).
  if (!config.percentOffExplicit && !config.durationExplicit) {
    console.warn(
      `[WARN] Coupon ${COUPON_ID} terms assumed: ${config.percentOff}% off ${config.duration} ` +
        `(A1 in research). Confirm with user before production deploy.`,
    );
    console.warn('');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  // Resolve Pro + Elite Product ids from sub Price env vars. Required for
  // both create and verify paths so the operator can confirm the coupon is
  // attached to the right Products. CONTEXT D-20: shop Prices do NOT accept
  // the promo, so resolution is intentionally limited to the sub Prices.
  let proProductId;
  let eliteProductId;
  try {
    proProductId = await resolveProductIdFromPriceEnv(stripe, 'STRIPE_PRICE_PRO_MONTHLY');
    eliteProductId = await resolveProductIdFromPriceEnv(stripe, 'STRIPE_PRICE_ELITE_MONTHLY');
  } catch (err) {
    console.error(`[error] product resolution failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`[ok] Pro Product resolved:   ${proProductId}`);
  console.log(`[ok] Elite Product resolved: ${eliteProductId}`);
  console.log('');

  // Retrieve-or-create the coupon (or verify-only in --check mode).
  let result;
  try {
    if (config.check) {
      const existing = await stripe.coupons.retrieve(COUPON_ID);
      result = { coupon: existing, created: false };
      console.log(`[ok] coupon ${COUPON_ID} present (check mode)`);
    } else {
      const params = {
        percent_off: config.percentOff,
        duration: config.duration,
        name: 'AGK 02110 Promo',
        applies_to: { products: [proProductId, eliteProductId] },
      };
      result = await ensureCoupon(stripe, COUPON_ID, params);
      const verb = result.created ? '[created]' : '[exists]';
      console.log(`${verb} coupon ${COUPON_ID}`);
    }
  } catch (err) {
    if (err.code === 'resource_missing') {
      console.error(
        `[check-fail] coupon ${COUPON_ID} not found in Stripe. ` +
          `Re-run without --check to create it.`,
      );
    } else {
      console.error(`[error] coupon operation failed: ${err.message}`);
      if (err.code) console.error(`  Stripe error code: ${err.code}`);
    }
    process.exit(1);
  }

  // Re-fetch to verify applies_to persisted (Stripe may silently drop it)
  const verified = await stripe.coupons.retrieve(COUPON_ID);
  const attachedProducts = verified.applies_to?.products ?? [];

  if (attachedProducts.length > 0) {
    console.log(
      `[ok] coupon ${COUPON_ID} applies_to.products = [${attachedProducts.join(', ')}]`,
    );

    const expectedSet = new Set([proProductId, eliteProductId]);
    const attachedSet = new Set(attachedProducts);
    const drift =
      expectedSet.size !== attachedSet.size ||
      [...expectedSet].some((p) => !attachedSet.has(p));
    if (drift) {
      console.warn(
        `[WARN] applies_to.products drift: expected [${proProductId}, ${eliteProductId}] ` +
          `got [${attachedProducts.join(', ')}]`,
      );
    }
  } else {
    console.warn(
      `[WARN] applies_to.products is empty — Stripe does not reliably persist this field.`,
    );
    console.warn(
      `  Product restriction must be enforced application-side at checkout.`,
    );
  }

  console.log(`\n[ok] coupon ${COUPON_ID} provisioning complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  if (err.code) console.error(`  Stripe error code: ${err.code}`);
  if (err.type) console.error(`  Stripe error type: ${err.type}`);
  process.exit(1);
});
