/**
 * Phase 03 (XLOG-01 / XLOG-02) log-client-diagnostic contract tests.
 * Run: deno test --allow-all --no-check log-client-diagnostic/index.test.ts
 *
 * Two contracts are machine-enforced here rather than assumed:
 *   1. ALWAYS 204 — every case asserts the status explicitly, including oversize,
 *      malformed JSON, non-POST, rate-limited and insert-failure paths (D-11).
 *   2. THE ALLOWLIST DROPS — the forbidden-key list is asserted key by key, so this
 *      file fails loudly the day someone widens ALLOWED_FIELDS (XLOG-02).
 *
 * Offline by construction: the pure helpers are tested directly and the only I/O
 * seam (the insert) is stubbed, so no network and no database are touched.
 */
import {
  assert,
  assertEquals,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALLOWED_FIELDS,
  buildRow,
  CATEGORIES,
  clampString,
  coerceCategory,
  DEFAULT_CATEGORY,
  deriveIpHash,
  handler,
  type HandlerDependencies,
  handleRequest,
  IP_HASH_CHARS,
  MAX_BODY_BYTES,
  MAX_STRING_CHARS,
  utcDateSalt,
} from './index.ts';

const ORIGIN = 'https://strivoai.net';
Deno.env.set('ALLOWED_ORIGINS', ORIGIN);

/**
 * Names that must NEVER reach a row. Each is a real leak vector: document text,
 * an uploaded filename, a stack, a raw error message, a profile URL, an email
 * address, a raw IP, and a client-asserted identity.
 */
const FORBIDDEN_KEYS = [
  'resume_text',
  'resumeText',
  'stack',
  'message',
  'filename',
  'file_name',
  'linkedin_url',
  'email',
  'ip',
  'user_id',
] as const;

function request({
  body = JSON.stringify(validRecord()),
  headers = {},
  method = 'POST',
}: {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
} = {}): Request {
  return new Request('https://example.supabase.co/functions/v1/log-client-diagnostic', {
    method,
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'text/plain',
      'x-forwarded-for': '203.0.113.7, 70.41.3.18',
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

function validRecord(): Record<string, unknown> {
  return {
    event_id: '11111111-2222-3333-4444-555555555555',
    app_version: 'build-abc123',
    surface: 'resume-analysis',
    lifecycle_stage: 'extracting',
    error_category: 'chunk_load_failed',
    error_name: 'TypeError',
    script_origin: 'first-party',
    browser: 'Safari',
    browser_version: '17.4',
    os: 'iOS',
    os_version: '17.4',
    device_type: 'mobile',
    engine: 'webkit',
    viewport_w: 390,
    viewport_h: 844,
    dpr: 3,
    is_extension: false,
    capability_tier: 'degraded',
    online: true,
    connection_type: '4g',
    user_agent: 'Mozilla/5.0 (iPhone)',
    run_id: '99999999-8888-7777-6666-555555555555',
  };
}

interface Recorder {
  deps: HandlerDependencies;
  rows: Array<Record<string, unknown>>;
}

function recorder(overrides: Partial<HandlerDependencies> = {}): Recorder {
  const rows: Array<Record<string, unknown>> = [];
  const deps: HandlerDependencies = {
    // Default: anonymous. requireAuth throws a Response in production when the
    // Authorization header is missing; the handler must treat that as "no user".
    requireAuth: () => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    },
    checkRateLimitByKey: () =>
      Promise.resolve({ allowed: true, retryAfterSeconds: 0, remaining: 59 }),
    insertRow: (row) => {
      rows.push(row);
      return Promise.resolve();
    },
    now: () => new Date('2026-07-28T12:00:00.000Z'),
    ...overrides,
  };
  return { deps, rows };
}

// ── Always-204 contract (D-11) ───────────────────────────────────────────────

Deno.test('a well-formed anonymous record returns 204 and stores user_id null', async () => {
  const { deps, rows } = recorder();
  const response = await handler(request(), deps);

  assertEquals(response.status, 204);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].user_id, null);
  assertEquals(rows[0].surface, 'resume-analysis');
  assertEquals(rows[0].error_category, 'chunk_load_failed');
});

Deno.test('an authenticated record stores the verified user id, never a body value', async () => {
  const { deps, rows } = recorder({
    requireAuth: () =>
      Promise.resolve({ userId: 'verified-user', email: 'a@b.test', tier: 'elite' }),
  });
  const response = await handler(
    request({ body: JSON.stringify({ ...validRecord(), user_id: 'attacker-asserted' }) }),
    deps,
  );

  assertEquals(response.status, 204);
  assertEquals(rows[0].user_id, 'verified-user');
});

Deno.test('a body larger than MAX_BODY_BYTES returns 204 and performs no insert', async () => {
  const { deps, rows } = recorder();
  const oversize = JSON.stringify({
    ...validRecord(),
    user_agent: 'x'.repeat(MAX_BODY_BYTES + 1024),
  });
  assert(oversize.length > MAX_BODY_BYTES);

  const response = await handler(request({ body: oversize }), deps);

  assertEquals(response.status, 204);
  assertEquals(rows.length, 0);
});

Deno.test('malformed JSON returns 204 and performs no insert', async () => {
  const { deps, rows } = recorder();
  const response = await handler(request({ body: '{"surface": "resume-' }), deps);

  assertEquals(response.status, 204);
  assertEquals(rows.length, 0);
});

Deno.test('a non-object JSON body returns 204 and performs no insert', async () => {
  const { deps, rows } = recorder();
  for (const body of ['[1,2,3]', '"a string"', 'null', '42']) {
    const response = await handler(request({ body }), deps);
    assertEquals(response.status, 204);
  }
  assertEquals(rows.length, 0);
});

Deno.test('non-POST methods return 204 and perform no insert', async () => {
  const { deps, rows } = recorder();
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const response = await handler(request({ method }), deps);
    assertEquals(response.status, 204);
  }
  assertEquals(rows.length, 0);
});

Deno.test('a rate-limited beacon is dropped silently with 204, never 429', async () => {
  const { deps, rows } = recorder({
    checkRateLimitByKey: () =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 900, remaining: 0 }),
  });
  const response = await handler(request(), deps);

  assertEquals(response.status, 204);
  assertEquals(response.headers.get('Retry-After'), null);
  assertEquals(rows.length, 0);
});

Deno.test('an insert failure still returns 204', async () => {
  const { deps } = recorder({
    insertRow: () => Promise.reject(new Error('relation does not exist')),
  });
  const response = await handler(request(), deps);

  assertEquals(response.status, 204);
});

Deno.test('a throwing rate limiter fails open and still returns 204', async () => {
  const { deps, rows } = recorder({
    checkRateLimitByKey: () => Promise.reject(new Error('db down')),
  });
  const response = await handler(request(), deps);

  assertEquals(response.status, 204);
  assertEquals(rows.length, 1);
});

Deno.test('the production wrapper answers 204 with CORS for an allowlisted origin', async () => {
  const response = await handleRequest(request({ method: 'GET' }));

  assertEquals(response.status, 204);
  assertEquals(response.headers.get('access-control-allow-origin'), ORIGIN);
});

// ── XLOG-02: the allowlist drops, key by key ─────────────────────────────────

Deno.test('XLOG-02 forbidden keys never reach a projected row', async () => {
  const hostile: Record<string, unknown> = {
    ...validRecord(),
    resume_text: 'CONFIDENTIAL RESUME BODY',
    resumeText: 'CONFIDENTIAL RESUME BODY',
    stack: 'at foo (/Users/someone/secret/path.ts:12:3)',
    message: 'Cannot read property x of undefined',
    filename: 'Jane Doe Resume Final v3.pdf',
    file_name: 'Jane Doe Resume Final v3.pdf',
    linkedin_url: 'https://linkedin.com/in/janedoe',
    email: 'jane@example.com',
    ip: '203.0.113.7',
    user_id: 'attacker-asserted',
  };

  const { deps, rows } = recorder();
  const response = await handler(request({ body: JSON.stringify(hostile) }), deps);
  assertEquals(response.status, 204);
  assertEquals(rows.length, 1);
  const row = rows[0];

  for (const key of FORBIDDEN_KEYS) {
    // `user_id` IS a column, but it must carry the server value (null here), never
    // the client-asserted one. Every other forbidden key must be absent outright.
    if (key === 'user_id') {
      assertEquals(row.user_id, null, 'user_id must come from requireAuth only');
      continue;
    }
    assertEquals(
      Object.prototype.hasOwnProperty.call(row, key),
      false,
      `forbidden key "${key}" reached the row — ALLOWED_FIELDS has been widened`,
    );
  }

  // Nothing hostile survived anywhere in the serialized row.
  const serialized = JSON.stringify(row);
  assert(!serialized.includes('CONFIDENTIAL RESUME BODY'));
  assert(!serialized.includes('Jane Doe Resume Final v3.pdf'));
  assert(!serialized.includes('attacker-asserted'));
  assert(!serialized.includes('secret/path.ts'));
});

Deno.test('ALLOWED_FIELDS itself contains no server-owned or forbidden name', () => {
  const allowed = new Set<string>(ALLOWED_FIELDS);
  for (const key of FORBIDDEN_KEYS) {
    assertEquals(allowed.has(key), false, `"${key}" must not be on ALLOWED_FIELDS`);
  }
  assertEquals(allowed.has('ip_hash'), false, 'ip_hash is server-owned');
  assertEquals(allowed.has('user_id'), false, 'user_id is server-owned');
});

Deno.test('non-primitive values are dropped rather than smuggled through', () => {
  const row = buildRow(
    {
      surface: { nested: 'CONFIDENTIAL RESUME BODY' },
      user_agent: ['CONFIDENTIAL RESUME BODY'],
      app_version: 'build-abc123',
    },
    { userId: null, ipHash: null },
  );

  assertEquals(Object.prototype.hasOwnProperty.call(row, 'surface'), false);
  assertEquals(Object.prototype.hasOwnProperty.call(row, 'user_agent'), false);
  assertEquals(row.app_version, 'build-abc123');
});

// ── Category coercion ────────────────────────────────────────────────────────

Deno.test('an unknown error_category coerces to unexpected', () => {
  for (const value of ['not_a_category', '', 'DROP TABLE', undefined, null, 42, {}]) {
    assertEquals(coerceCategory(value), DEFAULT_CATEGORY);
  }
});

Deno.test('every category in the closed set is preserved unchanged', () => {
  for (const category of CATEGORIES) {
    assertEquals(coerceCategory(category), category);
  }
});

Deno.test('a missing error_category still yields a value (NOT NULL column)', () => {
  const row = buildRow({ app_version: 'v1' }, { userId: null, ipHash: null });
  assertEquals(row.error_category, DEFAULT_CATEGORY);
});

Deno.test('an out-of-set error_category on the wire is coerced on the row', async () => {
  const { deps, rows } = recorder();
  const response = await handler(
    request({ body: JSON.stringify({ ...validRecord(), error_category: 'made_up' }) }),
    deps,
  );

  assertEquals(response.status, 204);
  assertEquals(rows[0].error_category, DEFAULT_CATEGORY);
});

// ── String clamp ─────────────────────────────────────────────────────────────

Deno.test('a string longer than the clamp is truncated to exactly MAX_STRING_CHARS', () => {
  const long = 'u'.repeat(MAX_STRING_CHARS + 500);
  assertEquals(clampString(long).length, MAX_STRING_CHARS);
  assertEquals(clampString('short').length, 5);
});

Deno.test('clamping applies through buildRow to every string field', () => {
  const long = 'u'.repeat(MAX_STRING_CHARS + 500);
  const row = buildRow({ user_agent: long, surface: long }, { userId: null, ipHash: null });

  assertEquals((row.user_agent as string).length, MAX_STRING_CHARS);
  assertEquals((row.surface as string).length, MAX_STRING_CHARS);
});

// ── D-13: the ip hash ────────────────────────────────────────────────────────

Deno.test('the ip hash never contains the address and is truncated', async () => {
  const address = '203.0.113.7';
  const hash = await deriveIpHash(`${address}, 70.41.3.18`, '2026-07-28');

  assert(hash !== null);
  assertEquals(hash!.length, IP_HASH_CHARS);
  assertEquals(hash!.includes(address), false);
  assertEquals(hash!.includes('203'), false);
  assertEquals(hash!.includes('113'), false);
  // hex only — no fragment of an address could survive as hex-invalid characters
  assert(/^[0-9a-f]+$/.test(hash!));
});

Deno.test('the same address hashes differently under a different date salt', async () => {
  const a = await deriveIpHash('203.0.113.7', '2026-07-28');
  const b = await deriveIpHash('203.0.113.7', '2026-07-29');
  const aAgain = await deriveIpHash('203.0.113.7', '2026-07-28');

  assertNotEquals(a, b);
  assertEquals(a, aAgain);
});

Deno.test('a missing address yields a null hash rather than a hash of empty string', async () => {
  assertEquals(await deriveIpHash(null, '2026-07-28'), null);
  assertEquals(await deriveIpHash('', '2026-07-28'), null);
  assertEquals(await deriveIpHash('  ,  ', '2026-07-28'), null);
});

Deno.test('utcDateSalt is the UTC calendar date', () => {
  assertEquals(utcDateSalt(new Date('2026-07-28T23:59:59.000Z')), '2026-07-28');
});

Deno.test('the row carries ip_hash, never the raw address', async () => {
  const { deps, rows } = recorder();
  await handler(request(), deps);

  const row = rows[0];
  assertEquals(typeof row.ip_hash, 'string');
  assertEquals((row.ip_hash as string).length, IP_HASH_CHARS);
  assertEquals(JSON.stringify(row).includes('203.0.113.7'), false);
  assertEquals(Object.prototype.hasOwnProperty.call(row, 'ip'), false);
});

Deno.test('the rate-limit key is derived from the ip hash, not the address', async () => {
  const keys: string[] = [];
  const { deps } = recorder({
    checkRateLimitByKey: (key) => {
      keys.push(key);
      return Promise.resolve({ allowed: true, retryAfterSeconds: 0, remaining: 59 });
    },
  });
  await handler(request(), deps);

  assertEquals(keys.length, 1);
  assert(keys[0].startsWith('diag:'));
  assertEquals(keys[0].includes('203.0.113.7'), false);
  assertEquals(keys[0].length, 'diag:'.length + IP_HASH_CHARS);
});

// ── Three-place registration guard (Phase 01.1 D-32 precedent) ───────────────
// Both traps this repo has hit before are invisible on an otherwise green gate:
// `test:ci` is an EXPLICIT FILE LIST, not a directory walk, so an unenrolled test
// runs in no lane at all (RESEARCH Pitfall 9); and a function absent from
// `deploy.ps1 $Functions` is never deployed, silently.

Deno.test('this test file is enrolled in the deno.json test:ci allowlist', async () => {
  const denoConfig = await Deno.readTextFile(new URL('../deno.json', import.meta.url));
  const parsed = JSON.parse(denoConfig) as { tasks: { 'test:ci': string } };
  const allowlistEntries = parsed.tasks['test:ci'].split(/\s+/);

  assertEquals(
    allowlistEntries.filter((entry) => entry === 'log-client-diagnostic/index.test.ts').length,
    1,
  );
});

Deno.test('config.toml registers the function and states it is identity-optional', async () => {
  const config = await Deno.readTextFile(new URL('../../config.toml', import.meta.url));

  assertEquals(
    config.match(/^\[functions\.log-client-diagnostic\]$/gm)?.length ?? 0,
    1,
  );
  assert(/\[functions\.log-client-diagnostic\]\s+verify_jwt = false/m.test(config));

  // validate-document's comment ends "This endpoint is not anonymous." — copying it
  // here would be FALSE. The comment immediately above this section must instead say
  // the endpoint is identity-optional by design.
  const section = config.slice(0, config.indexOf('[functions.log-client-diagnostic]'));
  const comment = section.split(/\n\s*\n/).pop() ?? '';
  assertEquals(comment.includes('This endpoint is not anonymous'), false);
  assert(comment.includes('IDENTITY-OPTIONAL'));
});

Deno.test('deploy.ps1 $Functions carries the function exactly once', async () => {
  const deploy = await Deno.readTextFile(new URL('../../../scripts/deploy.ps1', import.meta.url));

  assertEquals(
    deploy.match(/^\s+"log-client-diagnostic"\s*$/gm)?.length ?? 0,
    1,
  );
});
