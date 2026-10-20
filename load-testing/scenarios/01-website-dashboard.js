// ── Workload 1: Website & dashboard traffic (concurrent BROWSING SESSIONS) ───
//
// DIMENSION: concurrent browsing sessions (VUs). This is the CHEAP dimension —
// authenticated PostgREST reads the dashboard performs on load. It is NOT AI
// analysis: 5000 VUs here != 5000 analyses. Static SPA assets are served by
// Vercel's CDN and are out of scope for the Supabase-capacity question.
//
// Ladder rungs (browsingSessions): 100, 500, 1000, 2500, 5000, 10000.
//
// Run (one rung, human-gated):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e PROFILE=ramp -e TARGET=100 \
//     scenarios/01-website-dashboard.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildVuOptions } from '../lib/scenario.js';
import { session } from '../lib/session.js';
import { authHeaders } from '../lib/auth.js';
import { dbLatencyMs, firstClickCompletion, businessErrors, recordHttp } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));

export const options = buildVuOptions({
  env: __ENV,
  capDimension: 'maxBrowsingVUs',
  latencyClass: 'fast',
  defaultTarget: 100,
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
  const headers = authHeaders(data.anonKey, s.accessToken);
  const rest = `${data.url}/rest/v1`;

  // A dashboard "first paint" fires several owner-scoped reads. first-click
  // completion = did the whole bundle succeed as a real dashboard load would.
  let allOk = true;

  group('dashboard-load', () => {
    const reqs = {
      profile: {
        method: 'GET',
        url: `${rest}/profiles?select=id,subscription_tier&limit=1`,
        params: { headers, tags: { name: 'rest:profiles' } },
      },
      resumes: {
        method: 'GET',
        url: `${rest}/resumes?select=id,created_at&order=created_at.desc&limit=5`,
        params: { headers, tags: { name: 'rest:resumes' } },
      },
      history: {
        method: 'GET',
        url: `${rest}/analysis_jobs?select=id,status,created_at&order=created_at.desc&limit=10`,
        params: { headers, tags: { name: 'rest:history' } },
      },
    };
    const responses = http.batch(reqs);
    for (const key of Object.keys(responses)) {
      const res = responses[key];
      dbLatencyMs.add(res.timings.duration, { read: key });
      const ok = recordHttp(res, { acceptStatuses: [200, 206] });
      const good = check(res, { [`${key}: read ok`]: () => ok });
      if (!good) allOk = false;
    }
  });

  firstClickCompletion.add(allOk);
  // Real users pause between interactions (think time).
  sleep(Number(__ENV.THINK_SEC || 3));
}
