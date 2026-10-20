#!/usr/bin/env node
/**
 * Side-channel measurement — samples the Supabase state k6 cannot see: queue
 * depth, stuck runs, DB connection usage, and the SAFETY INVARIANTS (duplicate
 * jobs, duplicate merit charges, merit inconsistencies). Run this DURING a stage.
 *
 * Hard production block: refuses any SUPABASE_DB_URL containing the prod ref.
 *
 * Usage:
 *   node tools/measure-supabase.mjs --interval 5 --duration 300 \
 *     --out results/metrics-$(date +%s).jsonl
 *
 * Env:
 *   SUPABASE_DB_URL   Postgres connection string for the NON-PROD target (pooler).
 *                     Never a production URL. Never logged.
 *
 * Requires `pg` (npm i pg). If unavailable, the script prints the SQL bundle so
 * you can run it via psql instead.
 */

import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';

// ── The measurement queries (from the verified lifecycle/merit schema map) ────
export const QUERIES = {
  // Queue depth by lifecycle state (non-terminal).
  queue_depth_by_state: `
    SELECT state, count(*)::int AS n
    FROM analysis_jobs
    WHERE state IS NOT NULL AND state NOT IN ('completed','failed','refunded')
    GROUP BY state ORDER BY state;`,

  // Legacy queue view.
  queue_depth_legacy: `
    SELECT status, count(*)::int AS n
    FROM analysis_jobs
    WHERE status IN ('pending','retrying','processing')
    GROUP BY status ORDER BY status;`,

  // INVARIANT: no two ACTIVE jobs share an idempotency key (duplicate job).
  duplicate_active_jobs: `
    SELECT idempotency_key, count(*)::int AS n
    FROM analysis_jobs
    WHERE state NOT IN ('completed','failed','refunded') AND idempotency_key IS NOT NULL
    GROUP BY idempotency_key HAVING count(*) > 1;`,

  // INVARIANT: no live (non-refunded) feature-deduct set duplicated per key (double charge).
  duplicate_merit_charges: `
    SELECT idempotency_key, balance_type, count(*)::int AS n
    FROM merit_transactions
    WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL
      AND metadata->>'refunded_at' IS NULL
    GROUP BY idempotency_key, balance_type HAVING count(*) > 1;`,

  // INVARIANT: a run can never be both settled and refunded.
  settled_and_refunded: `
    SELECT id FROM analysis_jobs WHERE merit_settled AND refunded;`,

  // Stuck runs — non-terminal and older than a conservative 60s clock.
  stuck_runs: `
    SELECT state, count(*)::int AS n, min(state_updated_at) AS oldest
    FROM analysis_jobs
    WHERE state NOT IN ('completed','failed','refunded')
      AND state_updated_at < now() - interval '60 seconds'
    GROUP BY state ORDER BY state;`,

  // DB connection usage vs the pooler ceiling.
  db_connections: `
    SELECT count(*)::int AS active, (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max
    FROM pg_stat_activity WHERE datname = current_database();`,

  // Usage-quota enforcement: no user over their tier's monthly limit.
  usage_over_limit: `
    SELECT user_id, count(*)::int AS n
    FROM usage_tracking
    WHERE billing_period_start = date_trunc('month', now())::date
    GROUP BY user_id HAVING count(*) > 300;`, // 300 = elite ceiling; free/pro lower
};

// Invariant queries whose ANY row = a safety violation (abort the stage).
const INVARIANT_KEYS = ['duplicate_active_jobs', 'duplicate_merit_charges', 'settled_and_refunded'];

function parseArgs() {
  const a = process.argv.slice(2);
  const cfg = { interval: 5, duration: 300, out: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--interval') cfg.interval = parseInt(a[++i], 10);
    else if (a[i] === '--duration') cfg.duration = parseInt(a[++i], 10);
    else if (a[i] === '--out') cfg.out = a[++i];
  }
  return cfg;
}

function assertNotProduction(dbUrl) {
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required.');
  if (dbUrl.includes(PRODUCTION_REF)) {
    throw new Error(`REFUSING: SUPABASE_DB_URL points at production (${PRODUCTION_REF}). Measurement is read-only but production is never a load target.`);
  }
}

async function main() {
  const cfg = parseArgs();
  const dbUrl = process.env.SUPABASE_DB_URL;
  assertNotProduction(dbUrl);

  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('`pg` is not installed. Either `npm i pg`, or run the SQL bundle below via psql:\n');
    for (const [k, q] of Object.entries(QUERIES)) console.error(`-- ${k}\n${q.trim()}\n`);
    process.exit(2);
  }

  const client = new pg.default.Client({ connectionString: dbUrl });
  await client.connect();
  console.log(`[measure] connected. Sampling every ${cfg.interval}s for ${cfg.duration}s.`);

  const outPath = cfg.out || path.join('results', `metrics-${Math.floor(Date.now() / 1000)}.jsonl`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'a' });

  const deadline = Date.now() + cfg.duration * 1000;
  let violation = false;

  async function sampleOnce() {
    const iso = new Date().toISOString();
    const sample = { ts: iso };
    for (const [key, sql] of Object.entries(QUERIES)) {
      try {
        const r = await client.query(sql);
        sample[key] = r.rows;
        if (INVARIANT_KEYS.includes(key) && r.rows.length > 0) {
          violation = true;
          console.error(`[measure] !!! SAFETY INVARIANT VIOLATED: ${key} -> ${JSON.stringify(r.rows)}`);
        }
      } catch (e) {
        sample[key] = { error: e.message };
      }
    }
    // Compact console line.
    const depth = (sample.queue_depth_by_state || []).reduce((s, r) => s + (r.n || 0), 0);
    const stuck = (sample.stuck_runs || []).reduce((s, r) => s + (r.n || 0), 0);
    const conns = sample.db_connections && sample.db_connections[0];
    console.log(`[measure] ${iso} queue=${depth} stuck=${stuck} db_conns=${conns ? conns.active + '/' + conns.max : '?'}`);
    out.write(JSON.stringify(sample) + '\n');
  }

  await sampleOnce();
  await new Promise((resolve) => {
    const timer = setInterval(async () => {
      if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve();
        return;
      }
      await sampleOnce();
    }, cfg.interval * 1000);
  });

  out.end();
  await client.end();
  console.log(`[measure] done -> ${outPath}`);
  if (violation) {
    console.error('[measure] EXIT 1 — a safety invariant was violated during this window. STOP the ladder.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
