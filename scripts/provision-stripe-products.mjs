#!/usr/bin/env node
/**
 * Phase 12: idempotent Stripe shop product + price provisioning.
 *
 * Creates 4 one-time shop Products+Prices for Merit packs (SHOP-01..04) using
 * Stripe `lookup_key` retrieve-or-create idempotency, and verifies the 4
 * subscription Price objects already shipped in Phase 07 still match the spec
 * amounts (SUB-01..04).
 *
 * Re-running this script is a no-op: existing Prices keyed by `lookup_key` are
 * reused. Use `--check` to run in read-only mode (errors if any shop entry is
 * missing rather than creating it).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/provision-stripe-products.mjs --env staging
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/provision-stripe-products.mjs --env production
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/provision-stripe-products.mjs --env staging --check
 *
 * Stripe SDK install:
 *   The Stripe Node SDK is NOT in package.json. Run with one of:
 *     npx --yes stripe@14
 *     npm install --no-save stripe@14 (in CI) then `node scripts/provision-stripe-products.mjs ...`
 */

import Stripe from 'stripe';

// ── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { env: null, check: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.env = args[++i];
        break;
      case '--check':
        config.check = true;
        break;
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
Usage: node scripts/provision-stripe-products.mjs --env <staging|production> [--check]

Options:
  --env staging|production   Target environment label (required, used for log clarity)
  --check                    Read-only mode: error if any shop entry missing, do not create
  --help, -h                 Show this help message

Environment variables:
  STRIPE_SECRET_KEY              (required) Stripe secret key for the target environment
  STRIPE_PRICE_PRO_MONTHLY       (optional) Sub Price ID to verify against $8.99
  STRIPE_PRICE_PRO_ANNUAL        (optional) Sub Price ID to verify against $89.99
  STRIPE_PRICE_ELITE_MONTHLY     (optional) Sub Price ID to verify against $16.99
  STRIPE_PRICE_ELITE_ANNUAL      (optional) Sub Price ID to verify against $169.99
`);
}

// ── Catalog Definitions ────────────────────────────────────────────────────

const SHOP_CATALOG = [
  { packSize: 3,  unit_amount: 199,  name: 'Strivo Merits — 3 Pack',  lookup_key: 'merit_pack_3'  },
  { packSize: 10, unit_amount: 499,  name: 'Strivo Merits — 10 Pack', lookup_key: 'merit_pack_10' },
  { packSize: 25, unit_amount: 999,  name: 'Strivo Merits — 25 Pack', lookup_key: 'merit_pack_25' },
  { packSize: 50, unit_amount: 1799, name: 'Strivo Merits — 50 Pack', lookup_key: 'merit_pack_50' },
];

const SUB_VERIFY = [
  { envVar: 'STRIPE_PRICE_PRO_MONTHLY',    expected: 899,   label: 'Pro monthly $8.99'     },
  { envVar: 'STRIPE_PRICE_PRO_ANNUAL',     expected: 8999,  label: 'Pro yearly $89.99'     },
  { envVar: 'STRIPE_PRICE_ELITE_MONTHLY',  expected: 1699,  label: 'Elite monthly $16.99'  },
  { envVar: 'STRIPE_PRICE_ELITE_ANNUAL',   expected: 16999, label: 'Elite yearly $169.99' },
];

// ── Provisioning Logic ─────────────────────────────────────────────────────

/**
 * Retrieve-or-create a Price by lookup_key. Idempotent: if a price with the
 * given lookup_key already exists and is active, reuse it; otherwise create
 * the Product + Price. In `--check` mode, missing entries become errors.
 */
async function ensureShopPrice(stripe, entry, checkOnly) {
  const { packSize, unit_amount, name, lookup_key } = entry;

  const existing = await stripe.prices.search({
    query: `lookup_key:'${lookup_key}' AND active:'true'`,
  });

  if (existing.data.length > 0) {
    const price = existing.data[0];
    console.log(`[exists] ${lookup_key} -> ${price.id} (unit_amount=${price.unit_amount})`);
    return { entry, price, created: false };
  }

  if (checkOnly) {
    throw new Error(
      `[check-fail] ${lookup_key} not found in Stripe. Re-run without --check to create.`,
    );
  }

  const product = await stripe.products.create({
    name,
    metadata: { strivo_pack_size: String(packSize) },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount,
    currency: 'usd',
    lookup_key,
    transfer_lookup_key: true,
    metadata: { pack_size: String(packSize) },
  });

  console.log(`[created] ${lookup_key} -> ${price.id} (product=${product.id})`);
  return { entry, price, created: true };
}

/**
 * Verify a single subscription Price object exists and matches the expected
 * unit_amount. Missing env vars are skip warnings (not errors). Mismatched
 * amounts are hard errors that flip the process exit code.
 */
async function verifySubscriptionPrice(stripe, verify) {
  const priceId = process.env[verify.envVar];

  if (!priceId) {
    console.warn(`[skip] ${verify.envVar} not set in current env`);
    return { ok: true, skipped: true };
  }

  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (err) {
    console.error(`[error] failed to fetch ${verify.envVar}=${priceId}: ${err.message}`);
    return { ok: false, error: err.message };
  }

  if (price.unit_amount !== verify.expected) {
    console.error(
      `[MISMATCH] ${verify.label} expected ${verify.expected} got ${price.unit_amount}`,
    );
    return { ok: false, mismatch: true };
  }

  console.log(`[ok] ${verify.label} (${verify.envVar}=${priceId}) unit_amount=${price.unit_amount}`);
  return { ok: true };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Error: STRIPE_SECRET_KEY environment variable is required.');
    console.error('Export the secret for the target environment before running this script.');
    process.exit(1);
  }

  console.log(`=== Stripe Shop Provisioning (env=${config.env}, check=${config.check}) ===\n`);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

  let exitCode = 0;

  // ── Step 1: Shop Products + Prices ─────────────────────────────────────
  console.log('--- Shop Products + Prices (SHOP-01..04) ---');
  const shopResults = [];
  for (const entry of SHOP_CATALOG) {
    try {
      const result = await ensureShopPrice(stripe, entry, config.check);
      shopResults.push(result);
    } catch (err) {
      console.error(`[error] ${entry.lookup_key}: ${err.message}`);
      exitCode = 1;
    }
  }
  console.log('');

  // ── Step 2: Subscription Price Verification ─────────────────────────────
  console.log('--- Subscription Price Verification (SUB-01..04) ---');
  for (const verify of SUB_VERIFY) {
    const result = await verifySubscriptionPrice(stripe, verify);
    if (!result.ok) exitCode = 1;
  }
  console.log('');

  // ── Step 3: Emit secrets-set block for operator copy ────────────────────
  if (shopResults.length === SHOP_CATALOG.length) {
    console.log('--- Operator: copy these into Supabase secrets for the target project ---');
    for (const { entry, price } of shopResults) {
      console.log(`supabase secrets set STRIPE_PRICE_MERIT_${entry.packSize}=${price.id}`);
    }
    console.log('');
  }

  if (exitCode === 0) {
    console.log('[ok] provisioning complete (no drift)');
  } else {
    console.error('[fail] provisioning encountered errors — see logs above');
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  if (err.code) console.error(`  Stripe error code: ${err.code}`);
  if (err.type) console.error(`  Stripe error type: ${err.type}`);
  process.exit(1);
});
