/**
 * Unit tests for _shared/anthropic.ts AI_FORCE_FAILURE compound gate (Phase 13).
 * Run with: deno test _shared/anthropic.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invokeAnthropicText } from "./anthropic.ts";
import { getCareerOutputSchema } from './career-output-schema.ts';
import {
  __resetAiTelemetryForTest,
  __setAiPricingResolverForTest,
  __setAiTelemetryClientFactoryForTest,
} from './ai-telemetry.ts';

Deno.test("AI_FORCE_FAILURE without AI_TEST_MODE does NOT short-circuit", async () => {
  // WR-02: save/restore the two flags in try/finally so an assertion throw cannot
  // leak AI_TEST_MODE / AI_FORCE_FAILURE into sibling files on the single-process
  // test:ci gate (matches the TEST-05 pattern at L62+).
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    Deno.env.delete("AI_TEST_MODE");
    Deno.env.set("AI_FORCE_FAILURE", "true");
    // Should NOT return { ok: false, status: 529, error: 'forced-failure' }
    // Either throws (no API key) or hits the real fetch path — both mean the gate is off.
    // We assert the return is NOT the forced-failure shape.
    try {
      const r = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1 } as any);
      if (r && !r.ok && r.status === 529 && r.error === "forced-failure") {
        throw new Error("compound gate leaked: AI_FORCE_FAILURE activated without AI_TEST_MODE");
      }
    } catch (err) {
      // Any non-assertion error is acceptable (real fetch failure, missing key, etc.)
      if ((err as Error).message?.includes("compound gate leaked")) throw err;
    }
  } finally {
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("AI_FORCE_FAILURE + AI_TEST_MODE short-circuits with 529 forced-failure", async () => {
  // WR-02: save/restore the two flags in try/finally (see note above).
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.set("AI_FORCE_FAILURE", "true");
    const r = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1 } as any);
    assertEquals(r.ok, false);
    assertEquals((r as any).status, 529);
    assertEquals((r as any).error, "forced-failure");
  } finally {
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("AI_TEST_MODE alone (no AI_FORCE_FAILURE) preserves existing mock fixture path", async () => {
  // WR-02: save/restore the two flags in try/finally (see note above).
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.delete("AI_FORCE_FAILURE");
    const r = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1, fixtureKey: "default" } as any);
    // Success path may be ok:true with mock text, or ok:false with a non-529 shape — NOT forced-failure.
    if (!r.ok && (r as any).status === 529 && (r as any).error === "forced-failure") {
      throw new Error("existing AI_TEST_MODE fixture path was hijacked by compound gate");
    }
  } finally {
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("AI_TEST_MODE returns constrained incremental Elite unlock fixtures", async () => {
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.delete("AI_FORCE_FAILURE");

    const details = await invokeAnthropicText({
      model: "x",
      system: "Generate only the requested missing Elite resume-analysis delta.",
      messages: [{ role: "user", content: "backend engineer" }],
      maxTokens: 100,
      fixtureKey: "analyze_resume",
      outputSchema: {
        type: "object",
        properties: {
          criterionFeedback: {
            items: { properties: { id: { enum: ["c1_visual_clarity"] } } },
          },
          priorityImprovements: { type: "array" },
          rewriteSuggestions: { type: "array" },
          industryGuess: { type: "string" },
          suggestedTargetRoles: { type: "array" },
          recommendedKeywords: { type: "array" },
        },
      },
    } as any);
    assert(details.ok);
    const detailsPatch = JSON.parse(details.text);
    assertEquals(Object.keys(detailsPatch).sort(), [
      "criterionFeedback",
      "industryGuess",
      "priorityImprovements",
      "recommendedKeywords",
      "rewriteSuggestions",
      "suggestedTargetRoles",
    ]);
    assertEquals(detailsPatch.criterionFeedback[0].id, "c1_visual_clarity");
    assertEquals(detailsPatch.priorityImprovements.length, 6);
    assertEquals(detailsPatch.rewriteSuggestions.length, 9);

    const extras = await invokeAnthropicText({
      model: "x",
      system: "Generate only the missing Elite strategic-insights delta.",
      messages: [{ role: "user", content: "backend engineer" }],
      maxTokens: 100,
      fixtureKey: "analyze_resume",
      outputSchema: { type: "object", properties: { eliteInsights: { type: "object" } } },
    } as any);
    assert(extras.ok);
    const extrasPatch = JSON.parse(extras.text);
    assertEquals(Object.keys(extrasPatch), ["eliteInsights"]);
    assert(Object.keys(extrasPatch.eliteInsights).length > 0);
  } finally {
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode);
    else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce);
    else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Plan 05-05 (TEST-05) — environment-specific behavior characterization.
// Pins the CURRENT return shapes of the three env-dependent branches in
// invokeAnthropicText (shapes verified by reading anthropic.ts at HEAD):
//   - ANTHROPIC_API_KEY-missing fail-closed  -> { ok:false, status:500, error:'ANTHROPIC_API_KEY not configured' }  (index.ts:648-650)
//   - AI_TEST_MODE deterministic mock branch -> { ok:true, ... , model:'mock:<key>' } WITHOUT a network call         (index.ts:570-643)
//   - AI_FORCE_FAILURE two-key safety gate   -> inert unless AI_TEST_MODE also 'true'; else { ok:false, status:529, error:'forced-failure' }  (index.ts:563-568)
//
// Discipline: set/unset env per branch, restore in finally; never set a real key
// (T-05-11 fixture-secret hygiene). anthropic.ts reads these flags per-CALL (not at
// module scope), so no module-cache poisoning of sibling files (Pitfall 4) — but we
// still restore each flag to its pre-test value.
// ════════════════════════════════════════════════════════════════════════════

Deno.test("TEST-05 fail-closed: ANTHROPIC_API_KEY missing + AI_TEST_MODE off => { ok:false, status:500, 'ANTHROPIC_API_KEY not configured' }", async () => {
  const origKey = Deno.env.get("ANTHROPIC_API_KEY");
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  const origRefundable = Deno.env.get("MERIT_TEST_FORCE_REFUNDABLE_ERROR");
  try {
    // Fail-closed branch requires: AI_TEST_MODE off, no MERIT refundable override,
    // no key in env, and (below) no apiKey passed in params.
    Deno.env.delete("AI_TEST_MODE");
    Deno.env.delete("AI_FORCE_FAILURE");
    Deno.env.delete("MERIT_TEST_FORCE_REFUNDABLE_ERROR");
    Deno.env.delete("ANTHROPIC_API_KEY");
    const r = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1 } as any);
    // ACTUAL current shape (verified at HEAD, anthropic.ts:648-650).
    assertEquals(r.ok, false);
    assertEquals((r as any).status, 500);
    assertEquals((r as any).error, "ANTHROPIC_API_KEY not configured");
  } finally {
    if (origKey !== undefined) Deno.env.set("ANTHROPIC_API_KEY", origKey); else Deno.env.delete("ANTHROPIC_API_KEY");
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
    if (origRefundable !== undefined) Deno.env.set("MERIT_TEST_FORCE_REFUNDABLE_ERROR", origRefundable); else Deno.env.delete("MERIT_TEST_FORCE_REFUNDABLE_ERROR");
  }
});

Deno.test("TEST-05 AI_TEST_MODE branch: returns deterministic mock { ok:true, model:'mock:plain_text' } WITHOUT a real network call (key absent)", async () => {
  const origKey = Deno.env.get("ANTHROPIC_API_KEY");
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.delete("AI_FORCE_FAILURE");
    // Key intentionally ABSENT — proves the mock branch (570) short-circuits BEFORE
    // the key-resolve fail-closed branch (647), i.e. no network is attempted offline.
    Deno.env.delete("ANTHROPIC_API_KEY");
    const r = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "hello" }], maxTokens: 1, fixtureKey: "plain_text" } as any);
    assertEquals(r.ok, true);
    if (!r.ok) throw new Error("expected mock success"); // type-narrow the union
    assertEquals(r.model, "mock:plain_text");
    assertEquals(r.text, "Mock Claude response for test mode.");
  } finally {
    if (origKey !== undefined) Deno.env.set("ANTHROPIC_API_KEY", origKey); else Deno.env.delete("ANTHROPIC_API_KEY");
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("TEST-05 AI_FORCE_FAILURE two-key safety: INERT without AI_TEST_MODE, fires { ok:false, status:529, 'forced-failure' } only when BOTH set", async () => {
  const origKey = Deno.env.get("ANTHROPIC_API_KEY");
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  try {
    // (1) AI_FORCE_FAILURE alone (AI_TEST_MODE off, key absent) MUST NOT produce the
    // forced-failure shape — the prod-safety contract (an accidental prod flip is a no-op).
    Deno.env.delete("AI_TEST_MODE");
    Deno.env.set("AI_FORCE_FAILURE", "true");
    Deno.env.delete("ANTHROPIC_API_KEY");
    const inert = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1 } as any);
    // With both AI_TEST_MODE off and no key, the next reachable branch is the
    // fail-closed key-missing 500 — definitively NOT the 529 forced-failure shape.
    assertEquals(inert.ok, false);
    const isForced = !inert.ok && (inert as any).status === 529 && (inert as any).error === "forced-failure";
    assertEquals(isForced, false, "AI_FORCE_FAILURE must be INERT without AI_TEST_MODE");

    // (2) BOTH keys set -> the compound gate fires the deterministic 529.
    Deno.env.set("AI_TEST_MODE", "true");
    Deno.env.set("AI_FORCE_FAILURE", "true");
    const forced = await invokeAnthropicText({ model: "x", messages: [{ role: "user", content: "x" }], maxTokens: 1 } as any);
    assertEquals(forced.ok, false);
    assertEquals((forced as any).status, 529);
    assertEquals((forced as any).error, "forced-failure");
  } finally {
    if (origKey !== undefined) Deno.env.set("ANTHROPIC_API_KEY", origKey); else Deno.env.delete("ANTHROPIC_API_KEY");
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("elite-cc-mixed-format: outputSchema reaches Anthropic as output_config.format", async () => {
  const originalFetch = globalThis.fetch;
  const origTestMode = Deno.env.get("AI_TEST_MODE");
  const origForce = Deno.env.get("AI_FORCE_FAILURE");
  let requestBody: Record<string, unknown> | null = null;
  const schema = {
    type: "object",
    properties: { careerDNA: { type: "string" } },
    required: ["careerDNA"],
    additionalProperties: false,
  };

  try {
    Deno.env.delete("AI_TEST_MODE");
    Deno.env.delete("AI_FORCE_FAILURE");
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"careerDNA":"focused"}' }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await invokeAnthropicText({
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
      messages: [{ role: "user", content: "return career JSON" }],
      maxTokens: 100,
      outputSchema: schema,
    });

    assertEquals(result.ok, true);
    assertEquals(
      (requestBody as Record<string, unknown> | null)?.["output_config"],
      { format: { type: "json_schema", schema } },
      "the shared client must preserve Anthropic's exact output_config.format wire shape",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
    if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

type JsonSchema = Record<string, unknown>;

function schemaProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema.properties ?? {}) as Record<string, JsonSchema>;
}

function assertClosedSchema(schema: JsonSchema, path = '$'): void {
  if (schema.type === 'object') {
    const properties = schemaProperties(schema);
    assertEquals(schema.additionalProperties, false, `${path} must reject undeclared fields`);
    assertEquals(
      [...((schema.required ?? []) as string[])].sort(),
      Object.keys(properties).sort(),
      `${path} must require every declared field`,
    );
    for (const [key, child] of Object.entries(properties)) {
      assertClosedSchema(child, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    assertClosedSchema(schema.items as JsonSchema, `${path}[]`);
  }
}

function schemaPropertyCount(schema: JsonSchema): number {
  if (schema.type === 'array') return schemaPropertyCount(schema.items as JsonSchema);
  if (schema.type !== 'object') return 0;
  const properties = schemaProperties(schema);
  return Object.keys(properties).length +
    Object.values(properties).reduce((total, child) => total + schemaPropertyCount(child), 0);
}

Deno.test("elite-cc-grammar-limit: Elite core, growth, and extras are separate closed envelopes", () => {
  const base = getCareerOutputSchema('elite', 'base');
  const growth = getCareerOutputSchema('elite', 'growth');
  const extras = getCareerOutputSchema('elite', 'elite-extras');
  const baseProperties = schemaProperties(base);
  const growthProperties = schemaProperties(growth);
  const extrasProperties = schemaProperties(extras);

  assert('careerDNA' in baseProperties);
  assert('careerFields' in baseProperties);
  assert(!('skillGaps' in baseProperties));
  assert(!('roleRoadmaps' in baseProperties));
  assert(!('compensationIntelligence' in baseProperties));
  assert('skillGaps' in growthProperties);
  assert('roleReadinessBreakdown' in growthProperties);
  assert('roleRoadmaps' in growthProperties);
  assert('roadmap' in growthProperties);
  assertEquals(Object.keys(extrasProperties), ['compensationIntelligence', 'smartApplicationStrategy']);

  const compensation = schemaProperties(extrasProperties.compensationIntelligence);
  assert('salaryBands' in compensation);
  assert('roleTransitionROI' in compensation);
  assert('smartApplicationStrategy' in extrasProperties);

  assertClosedSchema(base);
  assertClosedSchema(growth);
  assertClosedSchema(extras);

  // The 81-property original and 56-property first split both failed. Keep every
  // compiled grammar close to the proven-successful 25-property extras envelope.
  assert(schemaPropertyCount(base) <= 26);
  assert(schemaPropertyCount(growth) <= 28);
  assert(schemaPropertyCount(extras) <= 25);
  assert(JSON.stringify(base).length < 2_000);
  assert(JSON.stringify(growth).length < 2_000);
  assert(JSON.stringify(extras).length < 2_000);
});

Deno.test("elite-cc-grammar-limit: Free retains its single-call constrained schema", () => {
  const free = getCareerOutputSchema('free');
  const properties = schemaProperties(free);

  assert('careerDNA' in properties);
  assert('surpriseFits' in properties);
  assert(!('skillGaps' in properties));
  assert(!('compensationIntelligence' in properties));
  assertClosedSchema(free);
});

// ── Phase 02 · 02-02 · TOK-01: per-call token telemetry seam ──────────────────
//
// `invokeAnthropicText` is the single chokepoint for 100% of live Anthropic calls
// (streamAnthropicText has no feature caller). These tests pin the two properties
// that make the instrument safe to ship: it is INERT without a telemetry context,
// and it is INCAPABLE of changing the returned result when it fails.

type CapturedRow = Record<string, unknown>;

/** Installs a capturing telemetry client and returns the collected rows. */
function captureTelemetry(opts?: { rejectInsert?: boolean; returnId?: number }): CapturedRow[] {
  const rows: CapturedRow[] = [];
  __resetAiTelemetryForTest();
  __setAiTelemetryClientFactoryForTest(() => ({
    from: () => ({
      insert: (row: unknown) => {
        rows.push(row as CapturedRow);
        if (typeof opts?.returnId === 'number') {
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: opts.returnId }, error: null }),
            }),
          };
        }
        return opts?.rejectInsert
          ? Promise.reject(new Error('telemetry writer exploded'))
          : Promise.resolve({ error: null });
      },
    }),
  }));
  return rows;
}

async function withAnthropicStub(
  handler: (init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const origTestMode = Deno.env.get('AI_TEST_MODE');
  const origForce = Deno.env.get('AI_FORCE_FAILURE');
  const origError = console.error;
  Deno.env.delete('AI_TEST_MODE');
  Deno.env.delete('AI_FORCE_FAILURE');
  console.error = () => {};
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) =>
    await handler(init)) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    console.error = origError;
    __resetAiTelemetryForTest();
    if (origTestMode !== undefined) Deno.env.set('AI_TEST_MODE', origTestMode); else Deno.env.delete('AI_TEST_MODE');
    if (origForce !== undefined) Deno.env.set('AI_FORCE_FAILURE', origForce); else Deno.env.delete('AI_FORCE_FAILURE');
  }
}

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: 'hello world' }],
      usage: {
        input_tokens: 1200,
        output_tokens: 3400,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 20,
      },
      stop_reason: 'end_turn',
    }),
    { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'msg_test_123' } },
  );
}

Deno.test('telemetry: WITHOUT params.telemetry no write is attempted (byte-identical behavior)', async () => {
  const rows = captureTelemetry();
  await withAnthropicStub(
    () => Promise.resolve(okResponse()),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
      });
      assertEquals(result.ok, true);
      assertEquals(rows.length, 0, 'an uninstrumented call must not touch the telemetry table');
    },
  );
});

Deno.test('telemetry: WITH params.telemetry the returned result is unchanged', async () => {
  const rows = captureTelemetry();
  await withAnthropicStub(
    () => Promise.resolve(okResponse()),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        telemetry: { feature: 'resume_analysis', tier: 'free', callName: 'free-single' },
      });
      assert(result.ok);
      assertEquals(result.text, 'hello world');
      assertEquals(result.model, 'claude-haiku-4-5-20251001');
      assertEquals(rows.length, 1, 'exactly one row per completed call');
    },
  );
});

Deno.test('telemetry: a rejecting writer does not change the result and does not throw out', async () => {
  const rows = captureTelemetry({ rejectInsert: true });
  await withAnthropicStub(
    () => Promise.resolve(okResponse()),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        telemetry: { feature: 'career_compass', tier: 'elite', callName: 'base' },
      });
      assert(result.ok, 'a telemetry failure must never fail the analysis');
      assertEquals(result.text, 'hello world');
      assertEquals(rows.length, 1);
    },
  );
});

Deno.test('telemetry: the success row carries the CLAMPED max_tokens plus usage and timings', async () => {
  const rows = captureTelemetry();
  await withAnthropicStub(
    () => Promise.resolve(okResponse()),
    async () => {
      await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 99999, // above ABSOLUTE_MAX_TOKENS
        telemetry: {
          feature: 'linkedin_grader',
          tier: 'free',
          callName: 'linkedin-grade',
          reqId: 'req12345',
          userId: '11111111-1111-1111-1111-111111111111',
          attempt: 2,
        },
      });

      assertEquals(rows.length, 1);
      const r = rows[0];
      assertEquals(r.max_tokens, 12000, 'recording the UNCLAMPED request would make every headroom figure wrong');
      assertEquals(r.feature, 'linkedin_grader');
      assertEquals(r.tier, 'free');
      assertEquals(r.call_name, 'linkedin-grade');
      assertEquals(r.req_id, 'req12345');
      assertEquals(r.user_id, '11111111-1111-1111-1111-111111111111');
      assertEquals(r.attempt, 2);
      assertEquals(r.attempt_number, 2);
      assertEquals(r.is_retry, true);
      assertEquals(r.operation_name, 'linkedin-grade');
      assertEquals(r.provider, 'anthropic');
      assertEquals(r.provider_request_id, 'msg_test_123');
      assertEquals(r.model, 'claude-haiku-4-5-20251001');
      assertEquals(r.input_tokens, 1200);
      assertEquals(r.output_tokens, 3400);
      assertEquals(r.cache_creation_input_tokens, 10);
      assertEquals(r.cache_read_input_tokens, 20);
      assertEquals(r.stop_reason, 'end_turn');
      assertEquals(r.ok, true);
      assertEquals(r.http_status, null);
      assertEquals(r.output_chars, 'hello world'.length);
      assertEquals(r.status, 'completed');
      assertEquals(r.error_code, null);
      assertEquals(r.error_category, null);
      assert(typeof r.started_at === 'string');
      assert(typeof r.completed_at === 'string');
      assert(typeof r.duration_ms === 'number' && (r.duration_ms as number) >= 0);
      assert(typeof r.ttfb_ms === 'number' && (r.ttfb_ms as number) >= 0);
    },
  );
});

Deno.test('telemetry: successful persistence returns the AI row ID for document correlation', async () => {
  captureTelemetry({ returnId: 42 });
  await withAnthropicStub(
    () => Promise.resolve(okResponse()),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        telemetry: { feature: 'resume_analysis', tier: 'elite', callName: 'document-ocr' },
      });
      assert(result.ok);
      assertEquals(result.telemetryId, 42);
    },
  );
});

Deno.test('telemetry: proven-absent cache categories normalize to priced zero', async () => {
  const rows = captureTelemetry();
  __setAiPricingResolverForTest(() => Promise.resolve({
    id: '33333333-3333-3333-3333-333333333333',
    input_per_million_usd: 1,
    output_per_million_usd: 5,
    cache_write_per_million_usd: 1.25,
    cache_read_per_million_usd: 0.1,
  }));
  await withAnthropicStub(
    () => Promise.resolve(new Response(JSON.stringify({
      content: [{ type: 'text', text: 'priced' }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'content-type': 'application/json' } })),
    async () => {
      await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        telemetry: { feature: 'resume_analysis', tier: 'free', callName: 'summary' },
      });
      assertEquals(rows[0].cache_creation_input_tokens, 0);
      assertEquals(rows[0].cache_read_input_tokens, 0);
      assertEquals(rows[0].incurred_cost_usd, 6);
      assertEquals(rows[0].cost_known, true);
    },
  );
});

Deno.test('telemetry: the !response.ok branch writes ok:false with the HTTP status and null usage', async () => {
  const rows = captureTelemetry();
  await withAnthropicStub(
    () => Promise.resolve(new Response('overloaded', { status: 529 })),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        telemetry: { feature: 'recruiting_lens', tier: 'elite', callName: 'rl-call-1' },
      });
      assertEquals(result.ok, false);

      assertEquals(rows.length, 1);
      const r = rows[0];
      assertEquals(r.ok, false);
      assertEquals(r.http_status, 529);
      assertEquals(r.input_tokens, null);
      assertEquals(r.output_tokens, null);
      assertEquals(r.stop_reason, null);
      assertEquals(r.output_chars, null);
      assertEquals(r.max_tokens, 100);
    },
  );
});

Deno.test('telemetry: the catch branch writes 408 for an AbortError', async () => {
  const rows = captureTelemetry();
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  await withAnthropicStub(
    () => Promise.reject(abort),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        telemetry: { feature: 'resume_analysis', tier: 'elite', callName: 'summary' },
      });
      assert(!result.ok);
      assertEquals(result.status, 408);

      assertEquals(rows.length, 1);
      assertEquals(rows[0].ok, false);
      // A timeout under a RAISED cap is a first-class finding: a widened token budget
      // without a widened wall clock produced a 408 mid-generation (quick task 260713-2ay).
      assertEquals(rows[0].http_status, 408);
    },
  );
});

Deno.test('telemetry: the catch branch writes 500 for a non-abort throw', async () => {
  const rows = captureTelemetry();
  await withAnthropicStub(
    () => Promise.reject(new Error('connection reset')),
    async () => {
      const result = await invokeAnthropicText({
        apiKey: 'test-key',
        model: 'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 100,
        telemetry: { feature: 'resume_analysis', tier: 'elite', callName: 'summary' },
      });
      assert(!result.ok);
      assertEquals(result.status, 500);

      assertEquals(rows.length, 1);
      assertEquals(rows[0].ok, false);
      assertEquals(rows[0].http_status, 500);
    },
  );
});

Deno.test('telemetry: streamAnthropicText is intentionally uninstrumented and says so', async () => {
  const src = await Deno.readTextFile(new URL('./anthropic.ts', import.meta.url));
  const streamStart = src.indexOf('export async function* streamAnthropicText');
  assert(streamStart > -1, 'streamAnthropicText must still exist');
  const header = src.slice(Math.max(0, streamStart - 1600), streamStart);
  assert(
    /no feature function calls it/i.test(header),
    'the stream helper must carry the comment explaining why it is not instrumented',
  );
  assert(
    !src.slice(streamStart).includes('recordAiTelemetry'),
    'streamAnthropicText must not write telemetry',
  );
});
