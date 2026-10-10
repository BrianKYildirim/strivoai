import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { invokeWithRetry, MIN_ATTEMPT_MS } from './ai-retry.ts';
import type { AnthropicInvokeParams, AnthropicInvokeResult } from './anthropic.ts';
import type { Logger } from './logger.ts';

const log: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  timer: () => () => 0,
};

function params(operationName: string, model = 'claude-haiku-4-5-20251001'): AnthropicInvokeParams {
  return {
    apiKey: 'test-key',
    model,
    messages: [{ role: 'user', content: 'test' }],
    telemetry: {
      feature: 'resume_analysis',
      tier: 'elite',
      callName: operationName,
      operationName,
      featureRunId: '11111111-1111-1111-1111-111111111111',
    },
  };
}

Deno.test('ai retry assigns one monotonic attempt number per physical request', async () => {
  const seen: AnthropicInvokeParams[] = [];
  const results: AnthropicInvokeResult[] = [
    { ok: false, status: 529, error: 'overloaded' },
    { ok: false, status: 429, error: 'rate limited' },
    { ok: true, text: 'ok', raw: {}, model: 'claude-haiku-4-5-20251001' },
  ];

  const result = await invokeWithRetry(params('summary'), log, {
    deadlineAt: 1_000_000,
    now: () => 0,
    sleep: () => Promise.resolve(),
    random: () => 0,
    invoke: (value) => {
      seen.push(value);
      return Promise.resolve(results.shift()!);
    },
  });

  assertEquals(result.ok, true);
  assertEquals(seen.map((value) => value.telemetry?.attemptNumber), [1, 2, 3]);
  assertEquals(seen.map((value) => value.telemetry?.attempt), [1, 2, 3]);
  assertEquals(seen.map((value) => value.telemetry?.isRetry), [false, true, true]);
});

Deno.test('required parallel operations each begin at attempt one', async () => {
  const seen: AnthropicInvokeParams[] = [];
  const invoke = (value: AnthropicInvokeParams): Promise<AnthropicInvokeResult> => {
    seen.push(value);
    return Promise.resolve({ ok: true, text: 'ok', raw: {}, model: value.model });
  };
  const options = {
    deadlineAt: 1_000_000,
    now: () => 0,
    invoke,
  };

  await Promise.all([
    invokeWithRetry(params('criteria-1'), log, options),
    invokeWithRetry(params('summary'), log, options),
  ]);

  assertEquals(seen.map((value) => value.telemetry?.operationName).sort(), ['criteria-1', 'summary']);
  assertEquals(seen.map((value) => value.telemetry?.attemptNumber), [1, 1]);
  assertEquals(seen.map((value) => value.telemetry?.isRetry), [false, false]);
});

Deno.test('a model fallback preserves actual model and caller-provided next attempt', async () => {
  const seen: AnthropicInvokeParams[] = [];
  const invoke = (value: AnthropicInvokeParams): Promise<AnthropicInvokeResult> => {
    seen.push(value);
    return Promise.resolve({ ok: true, text: 'ok', raw: {}, model: value.model });
  };
  const options = { deadlineAt: 1_000_000, now: () => 0, invoke, maxAttempts: 1 };

  await invokeWithRetry(params('summary', 'claude-primary'), log, options);
  const fallback = params('summary', 'claude-fallback');
  fallback.telemetry = {
    ...fallback.telemetry!,
    attemptNumber: 2,
    isRetry: true,
  };
  await invokeWithRetry(fallback, log, options);

  assertEquals(seen.map((value) => value.model), ['claude-primary', 'claude-fallback']);
  assertEquals(seen.map((value) => value.telemetry?.attemptNumber), [1, 2]);
  assertEquals(seen.map((value) => value.telemetry?.isRetry), [false, true]);
});

Deno.test('non-retryable provider errors make exactly one physical request', async () => {
  let calls = 0;
  const result = await invokeWithRetry(params('summary'), log, {
    deadlineAt: 1_000_000,
    now: () => 0,
    invoke: () => {
      calls++;
      return Promise.resolve({ ok: false, status: 400, error: 'invalid request' });
    },
  });
  assertEquals(result.ok, false);
  assertEquals(calls, 1);
});

Deno.test('exhausted deadline creates no phantom physical attempt', async () => {
  let calls = 0;
  const result = await invokeWithRetry(params('summary'), log, {
    deadlineAt: MIN_ATTEMPT_MS - 1,
    now: () => 0,
    invoke: () => {
      calls++;
      return Promise.resolve({ ok: true, text: 'unexpected', raw: {}, model: 'test' });
    },
  });
  assertEquals(result, { ok: false, status: 408, error: 'AI deadline exhausted' });
  assertEquals(calls, 0);
});
