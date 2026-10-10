/**
 * Phase 09 · 09-05 · FEAT-04 — grade-linkedin CORS status matrix (both origins).
 *
 * grade-linkedin was the ONE migrated feature with no per-feature CORS matrix: its only
 * coverage was the static 21-function `_shared/cors-audit.test.ts` sweep, which proves
 * the wrapper is WIRED but never exercises the behavioural status x origin matrix
 * (VER-02 S-23). This file closes that cell, mirroring the analyze-resume /
 * analyze-career / recruiting-lens instances exactly.
 *
 * The v5.0 CORS defect class (Pitfall 7 / the www.strivoai.net outage): 401/4xx/5xx
 * responses built WITHOUT CORS headers, so the browser swallows the structured error and
 * the user sees a generic network failure. Phase 1 fixed the shared primitives; this
 * guard proves the fix HOLDS for the LinkedIn-grader surface across EVERY response class
 * the function can emit — for BOTH the apex and the www origins.
 *
 * For an ALLOWED origin (strivoai.net AND www.strivoai.net), every status class
 * 200/401/402/403/429/500 must carry `Access-Control-Allow-Origin` (origin-reflected,
 * never '*') + `Vary: Origin`, whether the response is a normal handler return, a
 * jsonError envelope, or a bare Response thrown by auth (Pitfall 7 — the single most
 * valuable assertion in the file). An UNAPPROVED origin is fail-closed: no ACAO, ever.
 *
 * grade-linkedin wraps with `withCors(req, 'user', …)` (index.ts:283) and passes NO
 * extraHeaders (unlike analyze-resume, which advertises x-internal-job-secret) — this
 * matrix is driven exactly as the entrypoint drives it.
 *
 * Runtime primitives from _shared/cors.ts (cors.test.ts idiom). std@0.224.0.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { jsonError, withCors } from '../../_shared/cors.ts';

const APEX = 'https://strivoai.net';
const WWW = 'https://www.strivoai.net';
const EVIL = 'https://evil.example.com';
const ORIGINS = [APEX, WWW] as const;
const STATUS_CLASSES = [200, 401, 402, 403, 429, 500] as const;

function withAllowlist(fn: () => void | Promise<void>): () => Promise<void> {
  return async () => {
    const prev = Deno.env.get('ALLOWED_ORIGINS');
    Deno.env.set('ALLOWED_ORIGINS', `${APEX},${WWW}`);
    try {
      await fn();
    } finally {
      if (prev === undefined) Deno.env.delete('ALLOWED_ORIGINS');
      else Deno.env.set('ALLOWED_ORIGINS', prev);
    }
  };
}

function reqWith(origin: string, method = 'POST'): Request {
  return new Request('https://fn.example/grade-linkedin', { method, headers: { Origin: origin } });
}

// ── Matrix: every status class × both origins carries origin-reflected CORS + Vary ──

for (const origin of ORIGINS) {
  for (const status of STATUS_CLASSES) {
    Deno.test(
      `FEAT-04 [${origin}] status ${status} (handler return) carries ACAO + Vary: Origin`,
      withAllowlist(async () => {
        const res = await withCors(reqWith(origin), 'user', () =>
          new Response(JSON.stringify({ ok: status === 200 }), { status }));
        assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
        assert(res.headers.get('Access-Control-Allow-Origin') !== '*', 'never wildcard');
        assertEquals(res.headers.get('Vary'), 'Origin');
      }),
    );

    Deno.test(
      `FEAT-04 [${origin}] status ${status} (jsonError envelope) carries ACAO + Vary: Origin`,
      withAllowlist(async () => {
        const res = jsonError(reqWith(origin), status, `err_${status}`);
        assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
        assertEquals(res.headers.get('Vary'), 'Origin');
        // Body preserves the string-error contract.
        const body = await res.json();
        assertEquals(body.error, `err_${status}`);
      }),
    );
  }

  // Pitfall 7: a bare 401 Response thrown by auth (before the handler body) must still
  // emerge with CORS — the exact class that caused the browser-swallowed error. If this
  // ever regresses, a LinkedIn-grader auth failure becomes an unexplainable network error.
  Deno.test(
    `FEAT-04 [${origin}] a 401 THROWN by auth still carries ACAO + Vary (Pitfall 7)`,
    withAllowlist(async () => {
      const res = await withCors(reqWith(origin), 'user', () => {
        throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      });
      assertEquals(res.status, 401);
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
      assertEquals(res.headers.get('Vary'), 'Origin');
      // The frozen 401 contract (D-05) survives the wrapper.
      assertEquals((await res.json()).error, 'Unauthorized');
    }),
  );

  // OPTIONS preflight for the allowed origin is echoed (the browser never reaches auth).
  Deno.test(
    `FEAT-04 [${origin}] OPTIONS preflight echoes ACAO + Vary`,
    withAllowlist(async () => {
      const res = await withCors(reqWith(origin, 'OPTIONS'), 'user', () => new Response('unreached'));
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
      assertEquals(res.headers.get('Vary'), 'Origin');
    }),
  );
}

// ── Fail-closed: a non-allowlisted (evil) origin never gets ACAO across the matrix ──

for (const status of STATUS_CLASSES) {
  Deno.test(
    `FEAT-04 [evil] status ${status} is fail-closed (no ACAO) but keeps Vary`,
    withAllowlist(async () => {
      const res = await withCors(reqWith(EVIL), 'user', () =>
        new Response(JSON.stringify({ ok: false }), { status }));
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), null, 'an unapproved origin must never be reflected');
      assertEquals(res.headers.get('Vary'), 'Origin');
    }),
  );
}

Deno.test(
  'FEAT-04 [evil] a jsonError to an evil origin is fail-closed (no ACAO)',
  withAllowlist(async () => {
    const res = jsonError(reqWith(EVIL), 401, 'Unauthorized');
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), null);
    assertEquals(res.headers.get('Vary'), 'Origin');
  }),
);

Deno.test(
  'FEAT-04 [evil] an OPTIONS preflight from an evil origin is fail-closed (never a wildcard)',
  withAllowlist(async () => {
    const res = await withCors(reqWith(EVIL, 'OPTIONS'), 'user', () => new Response('unreached'));
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), null);
    assert(res.headers.get('Access-Control-Allow-Origin') !== '*', 'never wildcard');
  }),
);

// ── Static: the entrypoint still routes through the shared user wrapper (intact) ──

Deno.test("FEAT-04: grade-linkedin/index.ts routes through withCors(req, 'user', …)", () => {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  const src = Deno.readTextFileSync(path);
  assert(src.includes("withCors(req, 'user'"), "the withCors(req, 'user', …) wrapper must remain intact");
  assertEquals(
    src.includes('Access-Control-Allow-Origin'),
    false,
    'no hand-rolled ACAO literal in the entrypoint — CORS is the shared wrapper\'s job',
  );
});
