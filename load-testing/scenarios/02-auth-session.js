// ── Workload 2: Authentication & session validation ──────────────────────────
//
// DIMENSION: requests/second against GoTrue (auth). Exercises sign-in (password
// grant), session validation (/auth/v1/user), and token refresh — the auth
// surface every page load hits. Uses the OPEN arrival-rate model (RPS), because
// auth is request-shaped, not session-shaped.
//
// Run (one rung):
//   k6 run -e TARGET_ENV=preview -e CONFIRM_TARGET=cimjltzovkahkqecpwgi \
//     -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e TARGET=50 \
//     scenarios/02-auth-session.js

import http from 'k6/http';
import { check } from 'k6';
import { preflight } from '../lib/guards.js';
import { buildRpsOptions } from '../lib/scenario.js';
import { userFromPool } from '../lib/auth.js';
import { businessErrors, recordHttp, firstClickCompletion } from '../lib/metrics.js';

const USERS = JSON.parse(open(__ENV.USERS_FILE || '../fixtures/synthetic-users.json'));

export const options = buildRpsOptions({
  env: __ENV,
  latencyClass: 'fast',
  defaultRps: 10,
  preAllocatedVUs: 50,
  maxVUs: 500,
});

export function setup() {
  const resolved = preflight(__ENV);
  return { url: resolved.url, anonKey: resolved.anonKey, users: USERS };
}

export default function (data) {
  // Each iteration: a full sign-in + validate + refresh cycle for a synthetic user.
  const user = userFromPool(data.users, __ITER % data.users.length);
  const password = user.password || __ENV.LOADTEST_PASSWORD;
  let ok = true;

  // 1) Sign in (password grant). Password comes from env, never the fixture.
  const signRes = http.post(
    `${data.url}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: user.email, password }),
    { headers: { apikey: data.anonKey, 'Content-Type': 'application/json' }, tags: { name: 'auth:signin' } },
  );
  recordHttp(signRes, { acceptStatuses: [200] });
  const signedIn = check(signRes, { 'signin 200': (r) => r.status === 200 });
  if (!signedIn) {
    businessErrors.add(1);
    firstClickCompletion.add(false);
    return;
  }
  const accessToken = signRes.json('access_token');
  const refreshToken = signRes.json('refresh_token');

  // 2) Validate session.
  const userRes = http.get(`${data.url}/auth/v1/user`, {
    headers: { apikey: data.anonKey, Authorization: `Bearer ${accessToken}` },
    tags: { name: 'auth:validate' },
  });
  recordHttp(userRes, { acceptStatuses: [200] });
  if (!check(userRes, { 'validate 200': (r) => r.status === 200 })) ok = false;

  // 3) Refresh token (the near-expiry path the client auto-runs).
  if (refreshToken) {
    const refreshRes = http.post(
      `${data.url}/auth/v1/token?grant_type=refresh_token`,
      JSON.stringify({ refresh_token: refreshToken }),
      { headers: { apikey: data.anonKey, 'Content-Type': 'application/json' }, tags: { name: 'auth:refresh' } },
    );
    recordHttp(refreshRes, { acceptStatuses: [200] });
    if (!check(refreshRes, { 'refresh 200': (r) => r.status === 200 })) ok = false;
  }

  firstClickCompletion.add(ok);
}
