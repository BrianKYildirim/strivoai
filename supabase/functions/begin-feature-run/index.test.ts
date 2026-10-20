import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handler,
  parseBeginFeatureRunEnvelope,
  type BeginFeatureRunDependencies,
} from './index.ts';
import {
  createFeatureRunToken,
  FEATURE_RUN_TOKEN_TTL_MS,
  resolveFeatureRunToken,
} from '../_shared/feature-run-token.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const NONCE = 'deliberate_action_12345';

function request(body: Record<string, unknown>): Request {
  return new Request('https://example.test/functions/v1/begin-feature-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify(body),
  });
}

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    feature: 'resume_analysis',
    runVariant: 'standard',
    inputType: 'pdf',
    documentCount: 1,
    serverActionNonce: NONCE,
    ...overrides,
  };
}

function dependencies(overrides: Partial<BeginFeatureRunDependencies> = {}): BeginFeatureRunDependencies {
  return {
    requireAuth: async () => ({ userId: USER_ID, email: 'test@example.com', tier: 'elite' }),
    createFeatureRun: async () => ({ ok: true, featureRunId: RUN_ID, recovered: false }),
    createToken: async () => 'fr1.opaque-token',
    ...overrides,
  };
}

Deno.test('begin-feature-run authenticates and validates before creating one trusted run', async () => {
  const order: string[] = [];
  const response = await handler(request(envelope()), dependencies({
    requireAuth: async () => {
      order.push('auth');
      return { userId: USER_ID, email: 'test@example.com', tier: 'elite' };
    },
    createFeatureRun: async (params) => {
      order.push('create');
      assertEquals(params.userId, USER_ID);
      assertEquals(params.feature, 'resume_analysis');
      assertEquals(params.serverActionKey, `begin-feature-run:standard:${NONCE}`);
      return { ok: true, featureRunId: RUN_ID, recovered: false };
    },
    createToken: async (payload) => {
      order.push('token');
      assertEquals(payload.featureRunId, RUN_ID);
      return 'fr1.opaque-token';
    },
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { featureRunToken: 'fr1.opaque-token' });
  assertEquals(order, ['auth', 'create', 'token']);
});

Deno.test('strict envelope rejects every browser-asserted costing authority field', async () => {
  const forbidden = [
    'featureRunId', 'userId', 'tier', 'subscriptionPeriod', 'environment',
    'excludeFromCosting', 'meritsCharged', 'featureRunToken', 'pageCount',
    'attemptCount', 'provider', 'model', 'incurredCostUsd',
  ];
  for (const field of forbidden) {
    let creates = 0;
    const response = await handler(request(envelope({ [field]: 'spoofed' })), dependencies({
      createFeatureRun: async () => {
        creates++;
        return { ok: true, featureRunId: RUN_ID, recovered: false };
      },
    }));
    assertEquals(response.status, 400, field);
    assertEquals(creates, 0, `${field} must not reach run creation`);
  }
});

Deno.test('duplicate action nonce recovers one run while a rerun variant is distinct', async () => {
  const ids = new Map<string, string>();
  let inserts = 0;
  const deps = dependencies({
    createFeatureRun: async (params) => {
      const key = params.serverActionKey;
      const existing = ids.get(key);
      if (existing) return { ok: true, featureRunId: existing, recovered: true };
      const id = `run-${++inserts}`;
      ids.set(key, id);
      return { ok: true, featureRunId: id, recovered: false };
    },
    createToken: async (payload) => `token:${payload.featureRunId}`,
  });

  const first = await (await handler(request(envelope()), deps)).json();
  const duplicate = await (await handler(request(envelope()), deps)).json();
  const rerun = await (await handler(request(envelope({ runVariant: 'rerun' })), deps)).json();
  assertEquals(first, duplicate);
  assertEquals(rerun, { featureRunToken: 'token:run-2' });
  assertEquals(inserts, 2);
});

Deno.test('feature-run token is opaque, tamper-evident, owner-bound, and expiring', async () => {
  const now = 1_000_000;
  const token = await createFeatureRunToken({
    featureRunId: RUN_ID,
    userId: USER_ID,
    feature: 'resume_analysis',
    runVariant: 'standard',
    inputType: 'pdf',
    documentCount: 1,
  }, {
    readSecret: () => 'test-secret',
    now: () => now,
    randomBytes: () => new Uint8Array(12).fill(7),
  });
  assert(!token.includes(RUN_ID));
  assert(!token.includes(USER_ID));

  const resolved = await resolveFeatureRunToken(token, {
    readSecret: () => 'test-secret',
    now: () => now + 1,
  });
  assertEquals(resolved?.featureRunId, RUN_ID);
  assertEquals(resolved?.userId, USER_ID);
  assertEquals(await resolveFeatureRunToken(`${token}x`, { readSecret: () => 'test-secret' }), null);
  assertEquals(await resolveFeatureRunToken(token, {
    readSecret: () => 'test-secret',
    now: () => now + FEATURE_RUN_TOKEN_TTL_MS,
  }), null);
});

Deno.test('envelope parser accepts only canonical bounded values', () => {
  assert(parseBeginFeatureRunEnvelope(envelope()));
  assertEquals(parseBeginFeatureRunEnvelope(envelope({ documentCount: 13 })), null);
  assertEquals(parseBeginFeatureRunEnvelope(envelope({ serverActionNonce: 'short' })), null);
  assertEquals(parseBeginFeatureRunEnvelope(envelope({ feature: 'unknown' })), null);
});
