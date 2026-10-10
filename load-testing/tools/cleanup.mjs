#!/usr/bin/env node
/**
 * Teardown — remove synthetic load-test data from a NON-PRODUCTION target.
 * Deleting each synthetic auth user cascades their resumes / analysis_jobs /
 * storage objects via the project's user-deletion cascade + storage-purge
 * trigger, so this is the single clean teardown path. Also empties the isolated
 * load_test_scratch table.
 *
 * Hard production block. Never logs the service key.
 *
 * Usage:
 *   node tools/cleanup.mjs --domain loadtest.strivio.invalid [--yes]
 *
 * Env: SUPABASE_URL (non-prod), SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'zjpjapgraoxdukdvpjes';

function parseArgs() {
  const a = process.argv.slice(2);
  const cfg = { domain: 'loadtest.strivio.invalid', yes: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--domain') cfg.domain = a[++i];
    else if (a[i] === '--yes') cfg.yes = true;
  }
  return cfg;
}

async function main() {
  const cfg = parseArgs();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  if (url.includes(PRODUCTION_REF)) throw new Error(`REFUSING to run teardown against production (${PRODUCTION_REF}).`);

  if (!cfg.yes) {
    console.log(`This deletes ALL synthetic users @${cfg.domain} (cascading their data) on ${url}.`);
    console.log('Re-run with --yes to proceed.');
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // 1) Empty the isolated scratch table (ignore if it does not exist).
  try {
    // PostgREST bulk delete needs a filter; delete all rows via always-true predicate.
    await admin.from('load_test_scratch').delete().not('id', 'is', null);
    console.log('Cleared load_test_scratch.');
  } catch (e) {
    console.warn('load_test_scratch clear skipped:', e.message);
  }

  // 2) Delete synthetic users (paginated) — cascades their data + storage.
  let page = 1;
  let deleted = 0;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const synthetic = data.users.filter((u) => u.email && u.email.endsWith(`@${cfg.domain}`));
    for (const u of synthetic) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) console.warn(`  delete ${u.email} failed: ${delErr.message}`);
      else deleted++;
    }
    if (data.users.length < 200) break;
    page++;
  }
  console.log(`Deleted ${deleted} synthetic users @${cfg.domain} (data cascaded).`);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
