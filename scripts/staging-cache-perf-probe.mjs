#!/usr/bin/env node
/**
 * Phase 29 · 29-10 · NFR-02 — analysis_cache lookup p95 latency probe.
 *
 * Owns the NFR-02 measurement contract: cache-hit lookup against
 * `public.analysis_cache` (single SHA-256 cache_key SELECT through the
 * UNIQUE btree index `analysis_cache_key_unique`) must complete with
 * p95 < 100ms over >= 100 lookups against staging.
 *
 * Usage:
 *   node scripts/staging-cache-perf-probe.mjs --env staging --runs 100 --warmup
 *
 * Required environment variables (staging):
 *   SUPABASE_URL_STAGING                 — staging Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY_STAGING    — staging service-role key (required
 *                                          for the seed INSERT — bypasses RLS
 *                                          per D-03; same legitimate pattern
 *                                          used by the merit-gateway precheck
 *                                          callback)
 * Optional:
 *   MERIT_TEST_USER_ID                   — UUID of a staging test user owned
 *                                          by the seeded analysis_cache row.
 *                                          If unset, the probe falls back to
 *                                          a random UUID; the FK
 *                                          analysis_cache.user_id ->
 *                                          public.profiles(id) means the
 *                                          random UUID path will fail unless
 *                                          a profile with that id exists.
 *                                          Operators should always set
 *                                          MERIT_TEST_USER_ID for staging.
 *
 * Exit semantics:
 *   0 — All phases succeeded AND p95 < 100ms. Evidence appended.
 *   1 — Any phase failed OR p95 >= 100ms (NFR-02 fail). FAIL row appended.
 *
 * Phase 29 plan reference: .planning/phases/29-foundation-infrastructure/29-10-PLAN.md
 * Substrate reference:    supabase/migrations/20260512000000_analysis_cache_table.sql
 * Analog:                 scripts/validate-performance.mjs (env-config block, CLI shape).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Environment configs (mirror scripts/validate-performance.mjs:45-56) ────
const ENV_CONFIGS = {
  staging: {
    urlVar: 'SUPABASE_URL_STAGING',
    keyVar: 'SUPABASE_SERVICE_ROLE_KEY_STAGING',
  },
  production: {
    urlVar: 'SUPABASE_URL_PRODUCTION',
    keyVar: 'SUPABASE_SERVICE_ROLE_KEY_PRODUCTION',
  },
};

const DEFAULT_EVIDENCE_FILE = path.join(
  PROJECT_ROOT,
  '.planning/phases/29-foundation-infrastructure/29-VERIFICATION.md',
);

// NFR-02 ceiling.
const P95_CEILING_MS = 100;
const MIN_RUNS = 30;

// ── CLI parsing ────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    env: 'staging',
    runs: 100,
    warmup: false,
    evidenceFile: DEFAULT_EVIDENCE_FILE,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.env = args[++i];
        break;
      case '--runs':
        config.runs = parseInt(args[++i], 10);
        break;
      case '--warmup':
        config.warmup = true;
        break;
      case '--evidence-file':
        config.evidenceFile = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }
  if (!ENV_CONFIGS[config.env]) {
    console.error(`Error: --env must be one of ${Object.keys(ENV_CONFIGS).join(', ')}`);
    process.exit(1);
  }
  if (isNaN(config.runs) || config.runs < MIN_RUNS) {
    console.error(`Error: --runs must be an integer >= ${MIN_RUNS} (got ${config.runs})`);
    process.exit(1);
  }
  return config;
}

function printUsage() {
  console.log(`
Usage: node scripts/staging-cache-perf-probe.mjs [options]

Options:
  --env staging|production        Target environment (default: staging)
  --runs N                        Number of measured lookups (default: 100, min: ${MIN_RUNS})
  --warmup                        Fire 5 throwaway SELECTs before measuring
  --evidence-file PATH            Markdown evidence destination
                                  (default: ${DEFAULT_EVIDENCE_FILE})
  --help, -h                      Show this help

Phase 29 NFR-02 ceiling: p95 < ${P95_CEILING_MS}ms.
`);
}

// ── Env-var validation ─────────────────────────────────────────────────────
function loadEnv(envName) {
  const cfg = ENV_CONFIGS[envName];
  const url = process.env[cfg.urlVar];
  const key = process.env[cfg.keyVar];
  const missing = [];
  if (!url) missing.push(cfg.urlVar);
  if (!key) missing.push(cfg.keyVar);
  if (missing.length > 0) {
    console.error('Error: Missing required environment variables:');
    for (const v of missing) console.error(`  - ${v}`);
    console.error('\nSet these in the shell session before running the probe.');
    process.exit(1);
  }
  return { url, key };
}

// ── Statistics helpers ─────────────────────────────────────────────────────
function percentile(sortedSamples, p) {
  // Nearest-rank percentile, 1-indexed (Wikipedia "nearest-rank method").
  if (sortedSamples.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedSamples.length);
  const idx = Math.min(Math.max(rank, 1), sortedSamples.length) - 1;
  return sortedSamples[idx];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    stddev: Math.sqrt(variance),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function fmt(ms) {
  return ms.toFixed(2);
}

// ── Evidence file append ───────────────────────────────────────────────────
function appendEvidence(evidencePath, payload) {
  const dir = path.dirname(evidencePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const ts = payload.timestamp;
  const verdict = payload.passed ? 'PASS' : 'FAIL';
  const s = payload.stats;

  const section = [
    '',
    '## NFR-02 Cache Lookup Perf Probe',
    '',
    `Probe run: ${ts}  (env: ${payload.env}, runs: ${s.n}, warmup: ${payload.warmup})`,
    `Verdict: **${verdict}** (NFR-02 ceiling: p95 < ${P95_CEILING_MS}ms — observed p95 ${fmt(s.p95)}ms)`,
    '',
    '| timestamp | env | runs | warmup | min | mean | p50 | p95 | p99 | max | stddev | verdict |',
    '|-----------|-----|------|--------|-----|------|-----|-----|-----|-----|--------|---------|',
    `| ${ts} | ${payload.env} | ${s.n} | ${payload.warmup} | ${fmt(s.min)} | ${fmt(s.mean)} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.max)} | ${fmt(s.stddev)} | ${verdict} |`,
    '',
    `_Probe: \`node scripts/staging-cache-perf-probe.mjs --env ${payload.env} --runs ${s.n}${payload.warmup ? ' --warmup' : ''}\`_`,
    '',
  ].join('\n');

  fs.appendFileSync(evidencePath, section, 'utf8');
  console.log(`Evidence appended to ${evidencePath}`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const config = parseArgs();
  const { url, key } = loadEnv(config.env);

  // Probe identity — deterministic per-run for cleanup safety.
  const runId = crypto.randomUUID();
  const cacheKey = `phase-29-perf-probe-${runId}`;
  const userId = process.env.MERIT_TEST_USER_ID || crypto.randomUUID();

  console.log('Phase 29 · NFR-02 · analysis_cache lookup perf probe');
  console.log(`  env:        ${config.env}`);
  console.log(`  url:        ${url}`);
  console.log(`  runs:       ${config.runs}`);
  console.log(`  warmup:     ${config.warmup}`);
  console.log(`  cache_key:  ${cacheKey}`);
  console.log(`  user_id:    ${userId}${process.env.MERIT_TEST_USER_ID ? '' : '  (random — set MERIT_TEST_USER_ID for staging)'}`);
  console.log(`  evidence:   ${config.evidenceFile}`);
  console.log('');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const samples = [];
  let phase = 'init';
  let seeded = false;
  let exitCode = 0;

  try {
    // ── Phase 1: SEED ────────────────────────────────────────────────────
    phase = 'seed';
    console.log('[1/6] Seeding analysis_cache row...');
    const seedPayload = {
      cache_key: cacheKey,
      feature: 'resume_analysis',
      tier: 'free',
      variant: null,
      user_id: userId,
      raw_response: { probe: true, runId, ts: new Date().toISOString() },
    };
    // upsert with onConflict cache_key — re-running the probe shouldn't fail.
    const { error: seedError } = await supabase
      .from('analysis_cache')
      .upsert(seedPayload, { onConflict: 'cache_key', ignoreDuplicates: true });
    if (seedError) {
      throw new Error(`SEED failed: ${seedError.message}  (hint: confirm MERIT_TEST_USER_ID exists in public.profiles — FK to profiles.id)`);
    }
    seeded = true;

    // ── Phase 2: WARMUP ──────────────────────────────────────────────────
    if (config.warmup) {
      phase = 'warmup';
      console.log('[2/6] Warming up (5 throwaway SELECTs)...');
      for (let i = 0; i < 5; i++) {
        await supabase
          .from('analysis_cache')
          .select('id, raw_response')
          .eq('cache_key', cacheKey)
          .maybeSingle();
      }
    } else {
      console.log('[2/6] Warmup skipped (--warmup not set)');
    }

    // ── Phase 3: MEASURE ─────────────────────────────────────────────────
    phase = 'measure';
    console.log(`[3/6] Measuring ${config.runs} sequential SELECT-by-cache_key lookups...`);
    for (let i = 0; i < config.runs; i++) {
      const t0 = performance.now();
      const { data, error } = await supabase
        .from('analysis_cache')
        .select('id, raw_response')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      const t1 = performance.now();
      if (error) {
        throw new Error(`MEASURE failed on run ${i + 1}: ${error.message}`);
      }
      if (!data) {
        throw new Error(`MEASURE failed on run ${i + 1}: seeded row not found (cache_key=${cacheKey})`);
      }
      samples.push(t1 - t0);
    }

    // ── Phase 4: REPORT ──────────────────────────────────────────────────
    phase = 'report';
    const s = stats(samples);
    console.log('[4/6] Report:');
    console.log('');
    console.log('| metric  | ms        |');
    console.log('|---------|-----------|');
    console.log(`| n       | ${s.n}        |`);
    console.log(`| min     | ${fmt(s.min)}  |`);
    console.log(`| mean    | ${fmt(s.mean)} |`);
    console.log(`| p50     | ${fmt(s.p50)}  |`);
    console.log(`| p95     | ${fmt(s.p95)}  |`);
    console.log(`| p99     | ${fmt(s.p99)}  |`);
    console.log(`| max     | ${fmt(s.max)}  |`);
    console.log(`| stddev  | ${fmt(s.stddev)} |`);
    console.log('');

    const passed = s.p95 < P95_CEILING_MS;
    const verdict = passed ? 'PASS' : 'FAIL';
    console.log(`NFR-02 verdict: ${verdict} (p95 ${fmt(s.p95)}ms ${passed ? '<' : '>='} ${P95_CEILING_MS}ms)`);

    // ── Phase 5: EVIDENCE ────────────────────────────────────────────────
    phase = 'evidence';
    console.log('[5/6] Appending markdown evidence...');
    appendEvidence(config.evidenceFile, {
      timestamp: new Date().toISOString(),
      env: config.env,
      warmup: config.warmup,
      passed,
      stats: s,
    });

    if (!passed) {
      exitCode = 1;
    }
  } catch (err) {
    console.error(`\nERROR during phase "${phase}": ${err.message}`);
    if (err.stack) console.error(err.stack);
    exitCode = 1;
    // Best-effort: still append a FAIL evidence row if we have samples.
    if (samples.length >= MIN_RUNS) {
      try {
        appendEvidence(config.evidenceFile, {
          timestamp: new Date().toISOString(),
          env: config.env,
          warmup: config.warmup,
          passed: false,
          stats: stats(samples),
        });
      } catch (e) {
        console.error(`Failed to append fail-evidence: ${e.message}`);
      }
    }
  } finally {
    // ── Phase 6: CLEANUP ─────────────────────────────────────────────────
    if (seeded) {
      console.log('[6/6] Cleaning up seeded row...');
      try {
        const { error: deleteError } = await supabase
          .from('analysis_cache')
          .delete()
          .eq('cache_key', cacheKey);
        if (deleteError) {
          console.error(`CLEANUP warning: ${deleteError.message}  (cache_key=${cacheKey} may be orphaned)`);
        } else {
          console.log('Cleanup complete.');
        }
      } catch (e) {
        console.error(`CLEANUP error: ${e.message}`);
      }
    } else {
      console.log('[6/6] Cleanup skipped (no row seeded).');
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
