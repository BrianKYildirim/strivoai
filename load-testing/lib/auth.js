// ── Synthetic auth for k6 — GoTrue password grant, no SDK ────────────────────
//
// Load tests must use SYNTHETIC accounts only (never real student data). This
// mints a Supabase JWT for a synthetic user by POSTing the GoTrue password
// grant directly (the JS SDK does not run inside k6). Credentials come from the
// fixtures pool passed via env / setup(), never hardcoded.
//
// A pool of synthetic users is loaded once in a scenario's setup() and each VU
// picks one by index so concurrent VUs authenticate as distinct users (needed
// to exercise per-user rate limits and usage quotas realistically).

import http from 'k6/http';
import { check } from 'k6';

/**
 * Exchange a synthetic email/password for a Supabase access token.
 * @returns {{ accessToken: string, userId: string } | null}
 */
export function signIn(supabaseUrl, anonKey, email, password) {
  const res = http.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      tags: { name: 'auth:token' },
    },
  );

  const ok = check(res, {
    'auth: 200': (r) => r.status === 200,
    'auth: has access_token': (r) => {
      try {
        return !!r.json('access_token');
      } catch {
        return false;
      }
    },
  });
  if (!ok) return null;

  const body = res.json();
  return { accessToken: body.access_token, userId: body.user ? body.user.id : null };
}

/** Standard authenticated headers for an edge-function invoke. */
export function authHeaders(anonKey, accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Load the synthetic user pool. In k6, fixtures are read at init time via
 * open() by the scenario and passed here. Returns the pool array unchanged;
 * exists as the single contract point so scenarios don't reach into raw JSON.
 */
export function userFromPool(pool, vuIndex) {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('[auth] synthetic user pool is empty — run fixtures/generate-fixtures.mjs');
  }
  return pool[vuIndex % pool.length];
}
