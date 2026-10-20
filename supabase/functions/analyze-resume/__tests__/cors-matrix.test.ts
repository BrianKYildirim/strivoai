/**
 * Phase 05 · 05-03 · FEAT-02 — analyze-resume CORS status matrix (both origins).
 *
 * The v5.0 CORS defect class (Pitfall 7 / the www.strivoai.net outage): 401/4xx/5xx
 * responses built WITHOUT CORS headers, so the browser swallows the structured error
 * and the user sees a generic network failure. Phase 1 fixed the shared primitives;
 * this guard proves the fix HOLDS for the resume-analysis surface across EVERY
 * response class the function can emit — for BOTH the apex and www origins.
 *
 * For an ALLOWED origin (strivoai.net AND www.strivoai.net), every status class
 * 200/401/402/403/429/500 must carry `Access-Control-Allow-Origin` (origin-reflected,
 * never '*') + `Vary: Origin`, whether the response is a normal handler return, a
 * jsonError envelope, or a bare Response thrown by auth (Pitfall 7). It also
 * statically asserts the analyze-resume entrypoint still routes through
 * withCors(req, 'user', …) and advertises the x-internal-job-secret extra header
 * (the internal-worker path shares this endpoint).
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
  return new Request('https://fn.example/analyze-resume', { method, headers: { Origin: origin } });
}

// ── Matrix: every status class × both origins carries origin-reflected CORS + Vary ──

for (const origin of ORIGINS) {
  for (const status of STATUS_CLASSES) {
    Deno.test(
      `FEAT-02 [${origin}] status ${status} (handler return) carries ACAO + Vary: Origin`,
      withAllowlist(async () => {
        const res = await withCors(
          reqWith(origin),
          'user',
          () => new Response(JSON.stringify({ ok: status === 200 }), { status }),
          { extraHeaders: 'x-internal-job-secret' },
        );
        assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
        assert(res.headers.get('Access-Control-Allow-Origin') !== '*', 'never wildcard');
        assertEquals(res.headers.get('Vary'), 'Origin');
      }),
    );

    Deno.test(
      `FEAT-02 [${origin}] status ${status} (jsonError envelope) carries ACAO + Vary: Origin`,
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
  // emerge with CORS — the exact class that caused the browser-swallowed error.
  Deno.test(
    `FEAT-02 [${origin}] a 401 THROWN by auth still carries ACAO + Vary (Pitfall 7)`,
    withAllowlist(async () => {
      const res = await withCors(
        reqWith(origin),
        'user',
        () => {
          throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        },
        { extraHeaders: 'x-internal-job-secret' },
      );
      assertEquals(res.status, 401);
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
      assertEquals(res.headers.get('Vary'), 'Origin');
    }),
  );

  // OPTIONS preflight for the allowed origin is echoed (browser never reaches auth),
  // and it advertises the x-internal-job-secret extra header.
  Deno.test(
    `FEAT-02 [${origin}] OPTIONS preflight echoes ACAO + Vary + the internal-secret header`,
    withAllowlist(async () => {
      const res = await withCors(
        reqWith(origin, 'OPTIONS'),
        'user',
        () => new Response('unreached'),
        { extraHeaders: 'x-internal-job-secret' },
      );
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin);
      assertEquals(res.headers.get('Vary'), 'Origin');
      assert(
        (res.headers.get('Access-Control-Allow-Headers') ?? '').includes('x-internal-job-secret'),
        'the internal-worker header must be advertised on the preflight',
      );
    }),
  );
}

// ── Fail-closed: a non-allowlisted (evil) origin never gets ACAO across the matrix ──

for (const status of STATUS_CLASSES) {
  Deno.test(
    `FEAT-02 [evil] status ${status} is fail-closed (no ACAO) but keeps Vary`,
    withAllowlist(async () => {
      const res = await withCors(
        reqWith(EVIL),
        'user',
        () => new Response(JSON.stringify({ ok: false }), { status }),
        { extraHeaders: 'x-internal-job-secret' },
      );
      assertEquals(res.headers.get('Access-Control-Allow-Origin'), null, 'an unapproved origin must never be reflected');
      assertEquals(res.headers.get('Vary'), 'Origin');
    }),
  );
}

Deno.test(
  'FEAT-02 [evil] a jsonError to an evil origin is fail-closed (no ACAO)',
  withAllowlist(async () => {
    const res = jsonError(reqWith(EVIL), 401, 'Unauthorized');
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), null);
    assertEquals(res.headers.get('Vary'), 'Origin');
  }),
);

// ── Static: the entrypoint still routes through the shared user wrapper (intact) ──

function readIndex(): string {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

Deno.test("FEAT-02: analyze-resume/index.ts routes through withCors(req, 'user', …)", () => {
  const src = readIndex();
  assert(src.includes("withCors(req, 'user'"), "the withCors(req, 'user', …) wrapper must remain intact");
  assertEquals(src.includes('Access-Control-Allow-Origin'), false, 'no hand-rolled ACAO literal in the entrypoint');
});

Deno.test('FEAT-02: analyze-resume advertises the x-internal-job-secret extra header (internal-worker path)', () => {
  const src = readIndex();
  assert(src.includes('x-internal-job-secret'), 'the internal-worker CORS header must be present');
});
