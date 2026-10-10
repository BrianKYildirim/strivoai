#!/usr/bin/env node
/**
 * Run ONE ladder stage, human-gated, with the Supabase side-channel measuring
 * in parallel. Enforces: preflight passes, no auto-escalation (one rung only),
 * and a post-run STOP prompt so the operator explicitly decides to continue.
 *
 * This wrapper deliberately does NOT loop over the ladder — the request requires
 * a human decision after every stage. It runs exactly the rung you pass.
 *
 * Usage:
 *   node tools/run-stage.mjs --scenario 10-concurrent-ai-analysis \
 *     --profile ramp --target 10 --measure-duration 300 [-- extra k6 args]
 *
 * Reads the same env as the scenarios (TARGET_ENV, CONFIRM_TARGET, SUPABASE_URL,
 * SUPABASE_ANON_KEY, LOADTEST_PASSWORD, plus SUPABASE_DB_URL for measurement).
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const a = process.argv.slice(2);
  const cfg = { scenario: null, profile: 'ramp', target: null, measureDuration: 300, passthrough: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--scenario') cfg.scenario = a[++i];
    else if (a[i] === '--profile') cfg.profile = a[++i];
    else if (a[i] === '--target') cfg.target = a[++i];
    else if (a[i] === '--measure-duration') cfg.measureDuration = parseInt(a[++i], 10);
    else if (a[i] === '--') cfg.passthrough = a.slice(i + 1);
  }
  if (!cfg.scenario || cfg.target === null) {
    console.error('Usage: node tools/run-stage.mjs --scenario <name> --profile ramp --target <N> [--measure-duration 300]');
    process.exit(1);
  }
  return cfg;
}

function resolveScenarioPath(name) {
  const candidates = [
    path.join(ROOT, 'scenarios', name.endsWith('.js') ? name : `${name}.js`),
    path.join(ROOT, 'scenarios', name),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  console.error(`Scenario not found: ${name}. Look in load-testing/scenarios/.`);
  process.exit(1);
}

async function main() {
  const cfg = parseArgs();

  // 1) Preflight (blocks on any failure, refuses production).
  const pf = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'preflight.mjs')], { stdio: 'inherit' });
  if (pf.status !== 0) {
    console.error('Aborting: preflight failed.');
    process.exit(1);
  }

  const scenarioPath = resolveScenarioPath(cfg.scenario);
  console.log(`\n=== STAGE: ${cfg.scenario} profile=${cfg.profile} target=${cfg.target} ===`);
  console.log('This runs ONE rung. After it finishes, YOU decide whether the next rung is safe.\n');

  // 2) Start the Supabase side-channel measurement in parallel (if DB url set).
  let measureProc = null;
  const tsOut = path.join(ROOT, 'results', `metrics-${cfg.scenario}-t${cfg.target}-${Math.floor(Date.now() / 1000)}.jsonl`);
  if (process.env.SUPABASE_DB_URL) {
    measureProc = spawn(
      process.execPath,
      [path.join(ROOT, 'tools', 'measure-supabase.mjs'), '--interval', '5', '--duration', String(cfg.measureDuration), '--out', tsOut],
      { stdio: 'inherit' },
    );
  } else {
    console.warn('SUPABASE_DB_URL not set — running WITHOUT the Supabase side-channel (queue depth / invariants unmeasured).');
  }

  // 3) Run k6 for this single rung.
  const k6Args = ['run', '-e', `PROFILE=${cfg.profile}`, '-e', `TARGET=${cfg.target}`, ...cfg.passthrough, scenarioPath];
  const k6 = spawnSync('k6', k6Args, { stdio: 'inherit', env: process.env });

  if (measureProc && !measureProc.killed) measureProc.kill('SIGINT');

  const k6Failed = k6.status !== 0;
  console.log('\n=== STAGE COMPLETE ===');
  console.log(`k6 exit: ${k6.status}${k6Failed ? ' (thresholds breached or error — this stage is a STOP signal)' : ''}`);
  if (process.env.SUPABASE_DB_URL) console.log(`Supabase samples: ${path.relative(process.cwd(), tsOut)}`);
  console.log('\nNEXT: review results, fill results/RESULTS-TEMPLATE.md for this rung, and ONLY escalate if every');
  console.log('stop-criterion is clear. Do NOT auto-advance. Re-run this tool with the next --target when ready.');
  process.exit(k6Failed ? 1 : 0);
}

main();
