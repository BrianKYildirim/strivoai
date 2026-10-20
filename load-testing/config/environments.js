// ── Target environment resolution + PRODUCTION BLOCKLIST ─────────────────────
//
// This module is the single source of truth for which Supabase project a
// traffic-generating script is allowed to hit. It FAILS CLOSED:
//   - No URL/key  -> throw.
//   - URL matches a known production project ref -> throw (never load-test prod).
//   - TARGET_ENV not explicitly confirmed -> throw.
//
// Consumed by every k6 scenario (via lib/*) and by the node tools/ scripts.
// k6 reads env via __ENV; node reads via process.env. resolveEnv() accepts an
// explicit source object so both runtimes share one code path.

// Known project refs. Production is BLOCKED for any traffic. These are public
// project refs (already present in scripts/validate-performance.mjs), NOT secrets.
export const PROJECT_REFS = {
  // Non-prod, isolated. AI is AI_TEST_MODE (mocked); MERIT_SYSTEM_ENABLED=false.
  preview: 'cimjltzovkahkqecpwgi',
  // PRODUCTION — inspect-only. NEVER a load target.
  production: 'zjpjapgraoxdukdvpjes',
};

// Any URL containing one of these refs is production and is hard-blocked.
export const PRODUCTION_REFS_BLOCKLIST = [PROJECT_REFS.production];

// Environments that MAY receive generated traffic. `throwaway` is a
// production-equivalent project the operator provisions per-run (real AI + merit
// ON, capped) — its ref is supplied via env, never hardcoded here. `local` is a
// developer's Supabase local stack (loopback only) for CORRECTNESS validation.
export const TRAFFIC_ALLOWED_ENVS = ['local', 'preview', 'throwaway'];

// Loopback hosts that identify a LOCAL Supabase stack. A local target is never a
// `*.supabase.co` URL, so it is matched by host, and can never contain the prod ref.
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]'];

function isLoopbackUrl(url) {
  // NOTE: k6's JS runtime (goja) has no WHATWG `URL` constructor, so parse the
  // host with a regex that works in both Node and k6.
  const m = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(String(url));
  const host = m ? m[1] : '';
  return LOOPBACK_HOSTS.includes(host) || host.endsWith('.localhost');
}

function readEnv(source, name) {
  const v = source && source[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Resolve and VALIDATE the traffic target.
 * @param {object} source - __ENV (k6) or process.env (node).
 * @returns {{ env: string, url: string, anonKey: string, ref: string }}
 * @throws if the target is missing, unconfirmed, or is production.
 */
export function resolveEnv(source) {
  const env = readEnv(source, 'TARGET_ENV');
  const url = readEnv(source, 'SUPABASE_URL');
  const anonKey = readEnv(source, 'SUPABASE_ANON_KEY');

  if (!env) {
    throw new Error(
      '[env] TARGET_ENV is required and must be one of: ' +
        TRAFFIC_ALLOWED_ENVS.join(', ') +
        '. Refusing to send traffic to an unconfirmed target.',
    );
  }
  if (!TRAFFIC_ALLOWED_ENVS.includes(env)) {
    throw new Error(
      `[env] TARGET_ENV="${env}" is not allowed for traffic. Allowed: ${TRAFFIC_ALLOWED_ENVS.join(', ')}. ` +
        'Production is inspect-only and can never be load-tested.',
    );
  }
  if (!url || !anonKey) {
    throw new Error('[env] SUPABASE_URL and SUPABASE_ANON_KEY are required.');
  }

  // Hard production blocklist — regardless of TARGET_ENV label.
  for (const ref of PRODUCTION_REFS_BLOCKLIST) {
    if (url.includes(ref)) {
      throw new Error(
        `[env] REFUSING to run: SUPABASE_URL points at the PRODUCTION project (${ref}). ` +
          'Production must never be load-tested. Use local, preview, or a throwaway project.',
      );
    }
  }

  // LOCAL target: URL must be loopback (a real local Supabase stack). This also
  // guarantees zero requests can leave the machine to production or anywhere else.
  if (env === 'local') {
    if (!isLoopbackUrl(url)) {
      throw new Error(
        `[env] TARGET_ENV=local requires a loopback SUPABASE_URL (127.0.0.1/localhost), got "${url}". ` +
          'Refusing — a local target must never point at a hosted project.',
      );
    }
    return { env, url, anonKey, ref: 'local' };
  }

  // Hosted targets must NOT be loopback (catches a mislabeled local URL).
  if (isLoopbackUrl(url)) {
    throw new Error(`[env] TARGET_ENV="${env}" but SUPABASE_URL is loopback ("${url}"). Use TARGET_ENV=local for a local stack.`);
  }

  // Extract the ref from the URL for logging/measurement (best-effort).
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  const ref = m ? m[1] : 'unknown';

  return { env, url, anonKey, ref };
}

/** Assert an arbitrary URL is not production (used by measurement tools too). */
export function assertNotProduction(url) {
  for (const ref of PRODUCTION_REFS_BLOCKLIST) {
    if (typeof url === 'string' && url.includes(ref)) {
      throw new Error(`[env] "${url}" is the production project (${ref}) — blocked.`);
    }
  }
}
