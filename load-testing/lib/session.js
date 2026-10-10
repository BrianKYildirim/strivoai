// ── Per-VU synthetic session cache ───────────────────────────────────────────
//
// k6 runs each VU in its own JS runtime, so module-level state is per-VU. Each
// VU signs in once (as a distinct synthetic user chosen by VU id) and reuses the
// token across iterations, mirroring a real browser session and letting us
// exercise per-user rate limits / usage quotas honestly.

import exec from 'k6/execution';
import { signIn, userFromPool } from './auth.js';

let cached = null; // { accessToken, userId, email }

/**
 * Get (or lazily create) this VU's authenticated session.
 * @param {object} data - setup() return: { url, anonKey, users }
 * @returns {{ accessToken, userId, email } | null}
 */
export function session(data) {
  if (cached && cached.accessToken) return cached;
  const vuId = exec.vu.idInTest; // 1-based, stable per VU
  const user = userFromPool(data.users, vuId - 1);
  // Password is NEVER committed: it comes from env (LOADTEST_PASSWORD), shared
  // across the synthetic pool. A per-user password in the fixture is only honored
  // if explicitly present (it never is in the committed example).
  const password = user.password || __ENV.LOADTEST_PASSWORD;
  if (!password) {
    throw new Error('[session] LOADTEST_PASSWORD env is required (no secret is committed to the fixture).');
  }
  const s = signIn(data.url, data.anonKey, user.email, password);
  if (!s) return null;
  cached = { accessToken: s.accessToken, userId: s.userId, email: user.email };
  return cached;
}

/** Reset the cache (used by recovery/soak tests that intentionally re-auth). */
export function resetSession() {
  cached = null;
}
