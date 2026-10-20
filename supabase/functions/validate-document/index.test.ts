/**
 * Phase 01.1 validate-document HTTP contract tests.
 * Run: deno test --allow-all --no-check validate-document/index.test.ts
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { withCors } from '../_shared/cors.ts';
import type {
  DocumentValidationResult,
} from '../_shared/document-validation.ts';
import {
  handler,
  handleRequest,
  type HandlerDependencies,
} from './index.ts';

const ORIGIN = 'https://strivoai.net';
Deno.env.set('ALLOWED_ORIGINS', ORIGIN);

function request({
  body = new Uint8Array([1, 2, 3]),
  headers = {},
  method = 'POST',
}: {
  body?: Uint8Array;
  headers?: Record<string, string>;
  method?: string;
} = {}): Request {
  return new Request('https://example.supabase.co/functions/v1/validate-document', {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: 'Bearer test-token',
      'x-document-type': 'resume',
      'x-file-name': encodeURIComponent('Candidate Resume.pdf'),
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });
}

function dependencies(
  overrides: Partial<HandlerDependencies> = {},
): HandlerDependencies {
  return {
    requireAuth: async () => ({
      userId: 'user-123',
      email: 'candidate@example.com',
      tier: 'pro',
    }),
    checkRateLimit: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 59,
    }),
    validateDocumentBytes: async () => ({
      ok: true,
      kind: 'pdf',
      pageCount: 1,
    }),
    countPdfPages: async () => ({ ok: true, pages: 1 }),
    readBody: (req) => req.arrayBuffer(),
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test('OPTIONS uses production wrapper and permits both metadata headers', async () => {
  const response = await handleRequest(request({
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Headers':
        'authorization, content-type, x-document-type, x-file-name',
    },
  }));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('access-control-allow-origin'), ORIGIN);
  const allowed = response.headers.get('access-control-allow-headers') ?? '';
  assertStringIncludes(allowed, 'x-document-type');
  assertStringIncludes(allowed, 'x-file-name');
});

Deno.test('missing auth returns 401 before body read or validation', async () => {
  let bodyReads = 0;
  let validations = 0;
  const deps = dependencies({
    requireAuth: async () => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    readBody: async () => {
      bodyReads += 1;
      return new ArrayBuffer(0);
    },
    validateDocumentBytes: async () => {
      validations += 1;
      return { ok: true, kind: 'pdf', pageCount: 1 };
    },
  });

  const response = await withCors(
    request({ headers: { Authorization: '' } }),
    'user',
    () => handler(request({ headers: { Authorization: '' } }), deps),
    { extraHeaders: 'x-document-type, x-file-name' },
  );
  assertEquals(response.status, 401);
  assertEquals(bodyReads, 0);
  assertEquals(validations, 0);
});

Deno.test('declared oversize rejects before body read or validation', async () => {
  let bodyReads = 0;
  let validations = 0;
  const response = await handler(
    request({ headers: { 'Content-Length': '5242881' } }),
    dependencies({
      readBody: async () => {
        bodyReads += 1;
        return new ArrayBuffer(0);
      },
      validateDocumentBytes: async () => {
        validations += 1;
        return { ok: true, kind: 'pdf', pageCount: 1 };
      },
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(bodyReads, 0);
  assertEquals(validations, 0);
  assertEquals((await json(response)).reason, 'too_large');
});

Deno.test('actual oversize rejects before validation', async () => {
  let validations = 0;
  const response = await handler(
    request(),
    dependencies({
      readBody: async () => new ArrayBuffer(5_242_881),
      validateDocumentBytes: async () => {
        validations += 1;
        return { ok: true, kind: 'pdf', pageCount: 1 };
      },
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(validations, 0);
  assertEquals((await json(response)).reason, 'too_large');
});

Deno.test('missing or invalid metadata returns 400 without reading body', async () => {
  for (const headers of [
    { 'x-document-type': '' },
    { 'x-document-type': 'linkedin_profile' },
    { 'x-file-name': '' },
    { 'x-file-name': '%ZZ' },
  ]) {
    let bodyReads = 0;
    const response = await handler(
      request({ headers }),
      dependencies({
        readBody: async () => {
          bodyReads += 1;
          return new ArrayBuffer(0);
        },
      }),
    );
    assertEquals(response.status, 400);
    assertEquals(bodyReads, 0);
    assertEquals((await json(response)).message,
      'Unsupported file type. Please upload a PDF or DOCX file.');
  }
});

Deno.test('valid PDF and DOCX verdicts return the public 200 envelope', async () => {
  for (
    const verdict of [
      { ok: true, kind: 'pdf', pageCount: 2 },
      { ok: true, kind: 'docx', pageCount: null },
    ] satisfies DocumentValidationResult[]
  ) {
    const response = await handler(
      request(),
      dependencies({
        validateDocumentBytes: async () => verdict,
      }),
    );
    assertEquals(response.status, 200);
    assertEquals(await json(response), verdict);
  }
});

Deno.test('spoof and page-limit verdicts preserve exact locked messages', async () => {
  const verdicts: Array<Extract<DocumentValidationResult, { ok: false }>> = [
    {
      ok: false,
      reason: 'unsupported_type',
      message: 'Unsupported file type. Please upload a PDF or DOCX file.',
    },
    {
      ok: false,
      reason: 'page_limit',
      message:
        'Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.',
    },
  ];
  for (const verdict of verdicts) {
    const response = await handler(
      request(),
      dependencies({
        validateDocumentBytes: async () => verdict,
      }),
    );
    assertEquals(response.status, 400);
    assertEquals(await json(response), {
      error: 'invalid_document',
      reason: verdict.reason,
      message: verdict.message,
    });
  }
});

Deno.test('unexpected validator failure returns only validation-unavailable copy', async () => {
  const response = await handler(
    request(),
    dependencies({
      validateDocumentBytes: async () => {
        throw new Error('sensitive parser stack and path');
      },
    }),
  );
  const body = await json(response);
  assertEquals(response.status, 500);
  assertEquals(
    body.message,
    "We couldn't validate this document. Please try again or upload a different PDF or DOCX file.",
  );
  assertEquals(body.error, 'validation_unavailable');
  assert(!JSON.stringify(body).includes('sensitive parser'));
});

Deno.test('D-32 registration guard covers config, deploy, and test allowlist', async () => {
  const [config, deploy, denoConfig] = await Promise.all([
    Deno.readTextFile(new URL('../../config.toml', import.meta.url)),
    Deno.readTextFile(new URL('../../../scripts/deploy.ps1', import.meta.url)),
    Deno.readTextFile(new URL('../deno.json', import.meta.url)),
  ]);

  assertEquals(
    config.match(/^\[functions\.validate-document\]$/gm)?.length ?? 0,
    1,
  );
  assert(
    /\[functions\.validate-document\]\s+verify_jwt = false/m.test(config),
  );
  assertEquals(
    deploy.match(/^\s+"validate-document"\s*$/gm)?.length ?? 0,
    1,
  );

  const parsed = JSON.parse(denoConfig) as {
    tasks: { 'test:ci': string };
  };
  const allowlistEntries = parsed.tasks['test:ci'].split(/\s+/);
  assertEquals(
    allowlistEntries.filter((entry) =>
      entry === 'validate-document/index.test.ts'
    ).length,
    1,
  );
  assertEquals(
    allowlistEntries.filter((entry) =>
      entry === '_shared/document-validation.test.ts'
    ).length,
    1,
  );
});
