// ── Workload 7: Database reads & writes (DB CONNECTIONS + latency) ───────────
//
// DIMENSION: requests/second against PostgREST, split into reads and writes.
// Reads hit owner-scoped product tables (safe, read-only). Writes hit the
// ISOLATED public.load_test_scratch table (tools/sql/load_test_scratch.sql) so
// no product row is ever mutated. Pair with tools/measure-supabase.mjs to watch
// pooler connection usage (CAPS.maxDbConnections) — the real ceiling here.
//
// WRITE_MODE=off (default) runs reads only. WRITE_MODE=scratch enables writes
// (requires the scratch table applied to the target first).
//
// Run:
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e TARGET=50 \
//     -e WRITE_MODE=scratch scenarios/07-db-read-write.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildRpsOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { dbLatencyMs, businessErrors, recordHttp, firstClickCompletion } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));
const WRITE_MODE = __ENV.WRITE_MODE || 'off'; // off | scratch
const WRITE_RATIO = Math.min(1, Math.max(0, Number(__ENV.WRITE_RATIO || 0.3)));

export const options = buildRpsOptions({
  env: __ENV,
  latencyClass: 'fast',
  defaultRps: 25,
  preAllocatedVUs: 50,
  maxVUs: 500,
});

export function setup() {
  const resolved = preflight(__ENV);
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  const s = session(data);
  if (!s) {
    businessErrors.add(1);
    return;
  }
  const rest = `${data.url}/rest/v1`;
  const headers = {
    Authorization: `Bearer ${s.accessToken}`,
    apikey: data.anonKey,
    'Content-Type': 'application/json',
  };

  const doWrite = WRITE_MODE === 'scratch' && Math.random() < WRITE_RATIO;

  if (doWrite) {
    // Owner-scoped UPSERT into the isolated scratch table (no product data).
    const res = http.post(
      `${rest}/load_test_scratch?on_conflict=user_id,scratch_key`,
      JSON.stringify({
        user_id: s.userId,
        scratch_key: `k-${__VU}`,
        scratch_val: { iter: __ITER, ts: Date.now() },
        updated_at: new Date().toISOString(),
      }),
      { headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, tags: { name: 'db:write-scratch' } },
    );
    dbLatencyMs.add(res.timings.duration, { op: 'write' });
    const ok = recordHttp(res, { acceptStatuses: [200, 201, 204] });
    firstClickCompletion.add(check(res, { 'db write ok': () => ok }));
  } else {
    // Owner-scoped read against a product table (read-only, safe).
    const res = http.get(`${rest}/analysis_jobs?select=id,status&order=created_at.desc&limit=20`, {
      headers,
      tags: { name: 'db:read' },
    });
    dbLatencyMs.add(res.timings.duration, { op: 'read' });
    const ok = recordHttp(res, { acceptStatuses: [200, 206] });
    firstClickCompletion.add(check(res, { 'db read ok': () => ok }));
  }
}
