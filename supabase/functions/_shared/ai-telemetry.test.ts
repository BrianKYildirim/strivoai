/**
 * Phase 02 · 02-02 · TOK-01 — ai-telemetry never-throws contract.
 *
 * `recordAiCall` sits on the hot path of EVERY live Anthropic call. Its single
 * hard requirement is that it can never fail an analysis: not when the Supabase
 * client cannot be built, not when the insert is rejected, not when the client
 * getter throws synchronously. Threat T-02-05 (DoS on the Resume Analysis /
 * Career Compass request path) is closed by these assertions, not by review.
 *
 * It also must stay dependency-free at module load: a STATIC import of
 * `supabase-client.ts` would drag `npm:@supabase/supabase-js@2` into every
 * offline Deno test that touches the Anthropic helper and risk a network fetch
 * under `--offline` CI. The dynamic-import assertion below is the guard.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calculateAnthropicTokenCost,
  recordAiCall,
  recordAiTelemetry,
  __resetAiTelemetryForTest,
  __setAiPricingResolverForTest,
  __setAiTelemetryClientFactoryForTest,
  type AiCallTelemetryRow,
} from './ai-telemetry.ts';

function row(): AiCallTelemetryRow {
  return {
    feature: 'resume_analysis',
    tier: 'free',
    call_name: 'free-single',
    attempt: 1,
    req_id: 'abc12345',
    user_id: null,
    model: 'claude-test',
    max_tokens: 4096,
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    stop_reason: 'end_turn',
    ok: true,
    http_status: null,
    duration_ms: 1234,
    ttfb_ms: 800,
    output_chars: 900,
  };
}

/** Silences the module's warn logs so a passing run does not spew JSON lines. */
async function quiet(fn: () => Promise<void>): Promise<void> {
  const origError = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = origError;
  }
}

function withEnv(key: string, value: string | null, fn: () => Promise<void>): Promise<void> {
  const prev = Deno.env.get(key);
  if (value === null) Deno.env.delete(key);
  else Deno.env.set(key, value);
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete(key);
    else Deno.env.set(key, prev);
  });
}

Deno.test('recordAiCall resolves when the Supabase client cannot be constructed', async () => {
  __resetAiTelemetryForTest();
  __setAiTelemetryClientFactoryForTest(() => Promise.reject(new Error('SUPABASE_URL not configured')));
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      // Must RESOLVE (not reject) — an unhandled rejection here would surface as a 500.
      await recordAiCall(row());
    }),
  );
  __resetAiTelemetryForTest();
});

Deno.test('recordAiCall resolves when the insert returns a PostgREST error', async () => {
  __resetAiTelemetryForTest();
  let inserted = 0;
  __setAiTelemetryClientFactoryForTest(() => ({
    from: () => ({
      insert: () => {
        inserted++;
        return Promise.resolve({ error: { code: '42P01', message: 'relation does not exist' } });
      },
    }),
  }));
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      await recordAiCall(row());
    }),
  );
  assertEquals(inserted, 1, 'the insert was attempted exactly once');
  __resetAiTelemetryForTest();
});

Deno.test('recordAiCall resolves when the client getter throws synchronously', async () => {
  __resetAiTelemetryForTest();
  __setAiTelemetryClientFactoryForTest(() => {
    throw new Error('synchronous boom');
  });
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      await recordAiCall(row());
    }),
  );
  __resetAiTelemetryForTest();
});

Deno.test('recordAiCall resolves when the insert call itself throws', async () => {
  __resetAiTelemetryForTest();
  __setAiTelemetryClientFactoryForTest(() => ({
    from: () => ({
      insert: () => {
        throw new Error('client exploded mid-insert');
      },
    }),
  }));
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      await recordAiCall(row());
    }),
  );
  __resetAiTelemetryForTest();
});

Deno.test('AI_TEST_MODE=true short-circuits before any client resolution', async () => {
  __resetAiTelemetryForTest();
  let factoryCalls = 0;
  __setAiTelemetryClientFactoryForTest(() => {
    factoryCalls++;
    return { from: () => ({ insert: () => Promise.resolve({ error: null }) }) };
  });
  await withEnv('AI_TEST_MODE', 'true', () =>
    quiet(async () => {
      await recordAiCall(row());
    }),
  );
  assertEquals(factoryCalls, 0, 'fixture mode must not touch the database at all');
  __resetAiTelemetryForTest();
});

Deno.test('a client-resolution failure memoises the disable (no retry on later calls)', async () => {
  __resetAiTelemetryForTest();
  let factoryCalls = 0;
  __setAiTelemetryClientFactoryForTest(() => {
    factoryCalls++;
    return Promise.reject(new Error('still not configured'));
  });
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      await recordAiCall(row());
      await recordAiCall(row());
      await recordAiCall(row());
    }),
  );
  assertEquals(factoryCalls, 1, 'subsequent calls short-circuit on the memoised disable');
  __resetAiTelemetryForTest();
});

Deno.test('a successful client is memoised and reused across calls', async () => {
  __resetAiTelemetryForTest();
  let factoryCalls = 0;
  let inserted = 0;
  __setAiTelemetryClientFactoryForTest(() => {
    factoryCalls++;
    return {
      from: () => ({
        insert: () => {
          inserted++;
          return Promise.resolve({ error: null });
        },
      }),
    };
  });
  await withEnv('AI_TEST_MODE', null, () =>
    quiet(async () => {
      await recordAiCall(row());
      await recordAiCall(row());
    }),
  );
  assertEquals(factoryCalls, 1, 'client resolved once');
  assertEquals(inserted, 2, 'both rows attempted');
  __resetAiTelemetryForTest();
});

Deno.test('ai-telemetry.ts does not statically import the Supabase client', async () => {
  const src = await Deno.readTextFile(new URL('./ai-telemetry.ts', import.meta.url));
  const staticImports = src
    .split('\n')
    .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s*\(/.test(l));

  for (const line of staticImports) {
    assert(
      !/supabase-client/.test(line),
      `static import of supabase-client is forbidden (found: ${line.trim()})`,
    );
    assert(
      !/@supabase\/supabase-js/.test(line),
      `static import of @supabase/supabase-js is forbidden (found: ${line.trim()})`,
    );
  }

  assert(
    /await\s+import\(\s*['"]\.\/supabase-client\.ts['"]\s*\)/.test(src),
    'the client must be resolved via a dynamic await import()',
  );
});

Deno.test('recordAiTelemetry snapshots effective pricing across every token category', async () => {
  __resetAiTelemetryForTest();
  const inserted: AiCallTelemetryRow[] = [];
  __setAiTelemetryClientFactoryForTest(() => ({
    from: () => ({
      insert: (value: AiCallTelemetryRow) => {
        inserted.push(value);
        return Promise.resolve({ error: null });
      },
    }),
  }));
  __setAiPricingResolverForTest(() => Promise.resolve({
    id: '11111111-1111-1111-1111-111111111111',
    input_per_million_usd: 1,
    output_per_million_usd: 5,
    cache_write_per_million_usd: 1.25,
    cache_read_per_million_usd: 0.1,
  }));

  await withEnv('AI_TEST_MODE', null, async () => {
    await recordAiTelemetry({
      ...row(),
      provider: 'anthropic',
      started_at: '2026-08-01T12:00:00.000Z',
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
  });

  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].input_tokens, 1_000_000, 'raw provider usage must be preserved');
  assertEquals(inserted[0].output_tokens, 1_000_000);
  assertEquals(inserted[0].cache_creation_input_tokens, 1_000_000);
  assertEquals(inserted[0].cache_read_input_tokens, 1_000_000);
  assertEquals(inserted[0].pricing_id, '11111111-1111-1111-1111-111111111111');
  assertEquals(inserted[0].incurred_cost_usd, 7.35);
  assertEquals(inserted[0].cost_known, true);
  assertEquals(inserted[0].cost_confidence, 'calculated');
  __resetAiTelemetryForTest();
});

Deno.test('recordAiTelemetry preserves unknown cost for failed calls without usage', async () => {
  __resetAiTelemetryForTest();
  const inserted: AiCallTelemetryRow[] = [];
  __setAiTelemetryClientFactoryForTest(() => ({
    from: () => ({
      insert: (value: AiCallTelemetryRow) => {
        inserted.push(value);
        return Promise.resolve({ error: null });
      },
    }),
  }));
  __setAiPricingResolverForTest(() => Promise.resolve({
    id: '22222222-2222-2222-2222-222222222222',
    input_per_million_usd: 1,
    output_per_million_usd: 5,
    cache_write_per_million_usd: 1.25,
    cache_read_per_million_usd: 0.1,
  }));

  await withEnv('AI_TEST_MODE', null, async () => {
    await recordAiTelemetry({
      ...row(),
      ok: false,
      provider: 'anthropic',
      started_at: '2026-08-01T12:00:00.000Z',
      input_tokens: null,
      output_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    });
  });

  assertEquals(inserted[0].pricing_id, null);
  assertEquals(inserted[0].incurred_cost_usd, null, 'unknown cost must never become zero');
  assertEquals(inserted[0].cost_known, false);
  assertEquals(inserted[0].cost_confidence, 'unknown');
  __resetAiTelemetryForTest();
});

Deno.test('calculateAnthropicTokenCost requires priced non-zero cache categories', () => {
  const calculated = calculateAnthropicTokenCost(
    {
      ...row(),
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 0,
    },
    {
      id: 'price',
      input_per_million_usd: 1,
      output_per_million_usd: 5,
      cache_write_per_million_usd: null,
      cache_read_per_million_usd: null,
    },
  );
  assertEquals(calculated, null);
});
