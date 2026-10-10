#!/usr/bin/env node
/**
 * Real-provider spend GATE — Part 2 calibration support. Enforces a CUMULATIVE
 * $5 hard cap across runs and requires an explicit typed human confirmation
 * BEFORE any real-provider analysis. It makes NO provider call itself: it vets
 * the request, reserves the projected spend in a local ledger, and prints the
 * exact vetted command for you to run. Nothing runs unless you then run it.
 *
 * Never prints or stores any secret value. It only checks that the provider key
 * env var is PRESENT (by name), never reads or echoes it.
 *
 * Usage (dry-run verdict):
 *   node tools/real-run-guard.mjs --analyses 3 --tier free \
 *     --confirm "I APPROVE REAL SPEND"
 * Reserve the spend against the cumulative cap (do this right before you run):
 *   node tools/real-run-guard.mjs --analyses 3 --tier free \
 *     --confirm "I APPROVE REAL SPEND" --commit
 *
 * Ledger: results/.real-spend-ledger.json (dollar amounts only — no secrets).
 * Do NOT commit the ledger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPS, EST_COST_PER_REAL_ANALYSIS_USD } from '../config/safety-limits.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(__dirname, '..', 'results', '.real-spend-ledger.json');
const CONFIRM_PHRASE = 'I APPROVE REAL SPEND';
const PROVIDER_KEY_ENV = 'ANTHROPIC_API_KEY'; // presence-checked only, never read

function parseArgs() {
  const a = process.argv.slice(2);
  const cfg = { analyses: null, tier: 'free', confirm: null, commit: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--analyses') cfg.analyses = parseInt(a[++i], 10);
    else if (a[i] === '--tier') cfg.tier = a[++i];
    else if (a[i] === '--confirm') cfg.confirm = a[++i];
    else if (a[i] === '--commit') cfg.commit = true;
  }
  if (!Number.isInteger(cfg.analyses) || cfg.analyses < 1) throw new Error('--analyses must be a positive integer');
  return cfg;
}

function readLedger() {
  try {
    const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
    const j = JSON.parse(raw);
    return { capUsd: CAPS.maxRealProviderSpendUsd, spentUsd: j.spentUsd || 0, reservations: j.reservations || [] };
  } catch {
    return { capUsd: CAPS.maxRealProviderSpendUsd, spentUsd: 0, reservations: [] };
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

function main() {
  const cfg = parseArgs();
  const per = EST_COST_PER_REAL_ANALYSIS_USD[cfg.tier] ?? EST_COST_PER_REAL_ANALYSIS_USD.elite;
  const projected = cfg.analyses * per;
  const ledger = readLedger();
  const cap = ledger.capUsd;
  const remaining = cap - ledger.spentUsd;

  console.log('\n=== Real-provider spend gate ===');
  console.log(`Cumulative cap:      $${cap.toFixed(2)}`);
  console.log(`Already reserved:    $${ledger.spentUsd.toFixed(2)}`);
  console.log(`Remaining:           $${remaining.toFixed(2)}`);
  console.log(`This request:        ${cfg.analyses} × ${cfg.tier} @ ~$${per.toFixed(3)} = $${projected.toFixed(2)} projected`);

  // Gate 1: provider key present (name-only; never read/printed).
  const keyPresent = typeof process.env[PROVIDER_KEY_ENV] === 'string' && process.env[PROVIDER_KEY_ENV].length > 0;
  if (!keyPresent) {
    console.error(`\nREFUSED: ${PROVIDER_KEY_ENV} is not set in the environment. Supply the test provider key (value never printed).`);
    process.exit(1);
  }
  console.log(`Provider key:        ${PROVIDER_KEY_ENV} present ✓ (value not read or printed)`);

  // Gate 2: typed human confirmation.
  if (cfg.confirm !== CONFIRM_PHRASE) {
    console.error(`\nREFUSED: human confirmation missing. Re-run with --confirm "${CONFIRM_PHRASE}".`);
    process.exit(1);
  }

  // Gate 3: cumulative cap.
  if (ledger.spentUsd + projected > cap + 1e-9) {
    console.error(`\nREFUSED: projected $${projected.toFixed(2)} would push cumulative to $${(ledger.spentUsd + projected).toFixed(2)}, over the $${cap.toFixed(2)} cap.`);
    console.error('Reduce --analyses, or the cap is exhausted for this test campaign.');
    process.exit(1);
  }

  console.log('\nAPPROVED (within cap + confirmed).');
  console.log('This tool does NOT call the provider. To actually run, execute:\n');
  console.log(`  # Set AI_TEST_MODE=false on the FUNCTIONS serve (real provider) and keep it OFF for high volume.`);
  console.log(`  node tools/validate-local.mjs --phase success   # 1 real analysis, or:`);
  console.log(`  k6 run -e TARGET_ENV=<local|throwaway> -e CONFIRM_TARGET=<ref> \\`);
  console.log(`    -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e LOADTEST_PASSWORD=... \\`);
  console.log(`    -e MODE=real -e TIER=${cfg.tier} -e TARGET=${Math.min(cfg.analyses, 10)} -e EST_RUNS=${cfg.analyses} \\`);
  console.log(`    scenarios/10-concurrent-ai-analysis.js\n`);

  if (cfg.commit) {
    ledger.reservations.push({ analyses: cfg.analyses, tier: cfg.tier, projectedUsd: Number(projected.toFixed(4)), reservedAtIso: new Date().toISOString() });
    ledger.spentUsd = Number((ledger.spentUsd + projected).toFixed(4));
    writeLedger(ledger);
    console.log(`Reserved $${projected.toFixed(2)} against the cap. New cumulative: $${ledger.spentUsd.toFixed(2)} / $${cap.toFixed(2)}.`);
    console.log('(Reservation is conservative — it counts projected worst-case spend, not actuals.)');
  } else {
    console.log('Dry-run only (no reservation written). Add --commit to reserve this spend before running.');
  }
}

main();
