/**
 * Deno unit tests for validateModelOutput (LIFE-07 — strict no-masking).
 *
 * Run with:
 *   deno test _shared/llm-validation.test.ts --no-check --allow-read --allow-env
 *
 * The load-bearing invariant under test: on EVERY failure path the validator
 * returns a TYPED error — it never fabricates a fixed score, empty object, or
 * generic body (Pitfall 9). A static-source guard asserts there is exactly one
 * `return { ok: true` branch (the genuine-success path).
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { z } from "https://esm.sh/zod@3.25.76";
import { validateModelOutput } from "./llm-validation.ts";

const schema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1),
  items: z.array(z.string()),
});

// ── Genuine-success paths ────────────────────────────────────────

Deno.test("valid bare JSON → ok:true with parsed value", () => {
  const raw = JSON.stringify({ score: 80, summary: "Solid", items: ["a", "b"] });
  const r = validateModelOutput(raw, schema);
  assert(r.ok);
  if (r.ok) assertEquals(r.value, { score: 80, summary: "Solid", items: ["a", "b"] });
});

Deno.test("markdown-fenced valid JSON is unwrapped → ok:true", () => {
  const raw = '```json\n{"score":75,"summary":"Ok","items":["x"]}\n```';
  const r = validateModelOutput(raw, schema);
  assert(r.ok);
  if (r.ok) assertEquals(r.value.score, 75);
});

Deno.test("prose-preamble valid JSON is unwrapped → ok:true", () => {
  const raw = 'Here is the JSON:\n{"score":50,"summary":"Meh","items":[]}';
  const r = validateModelOutput(raw, schema);
  assert(r.ok);
  if (r.ok) assertEquals(r.value.score, 50);
});

// ── Truncation → MODEL_OUTPUT_TRUNCATED (never partial-but-accepted) ──

Deno.test("truncated JSON body → MODEL_OUTPUT_TRUNCATED", () => {
  const raw = '{"score":80,"summary":"Solid","items":["a","b"';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_OUTPUT_TRUNCATED");
});

Deno.test("truncated JSON inside a markdown fence → MODEL_OUTPUT_TRUNCATED", () => {
  const raw = '```json\n{"score":80,"summary":"Sol';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_OUTPUT_TRUNCATED");
});

// ── Empty / generic → MODEL_INVALID_RESPONSE ─────────────────────

Deno.test("empty string → MODEL_INVALID_RESPONSE", () => {
  const r = validateModelOutput("", schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_INVALID_RESPONSE");
});

Deno.test("whitespace-only string → MODEL_INVALID_RESPONSE", () => {
  const r = validateModelOutput("   \n  ", schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_INVALID_RESPONSE");
});

Deno.test('"{}" empty object → MODEL_INVALID_RESPONSE', () => {
  const r = validateModelOutput("{}", schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_INVALID_RESPONSE");
});

Deno.test("all-null object → MODEL_INVALID_RESPONSE", () => {
  const raw = '{"score":null,"summary":null,"items":null}';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_INVALID_RESPONSE");
});

Deno.test("non-JSON garbage → MODEL_INVALID_RESPONSE", () => {
  const r = validateModelOutput("the model refused to answer", schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "MODEL_INVALID_RESPONSE");
});

// ── Schema failure → SCHEMA_VALIDATION_FAILED (safe detail) ───────

Deno.test("wrong type → SCHEMA_VALIDATION_FAILED", () => {
  const raw = '{"score":"eighty","summary":"x","items":[]}';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "SCHEMA_VALIDATION_FAILED");
});

Deno.test("missing required field → SCHEMA_VALIDATION_FAILED", () => {
  const raw = '{"summary":"x","items":[]}';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.code, "SCHEMA_VALIDATION_FAILED");
    assertStringIncludes(r.detail, "score");
  }
});

Deno.test("out-of-range value → SCHEMA_VALIDATION_FAILED", () => {
  const raw = '{"score":150,"summary":"x","items":[]}';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "SCHEMA_VALIDATION_FAILED");
});

Deno.test("schema detail carries field path, NOT the raw model body", () => {
  const raw = '{"score":"LEAK_SECRET_VALUE","summary":"x","items":[]}';
  const r = validateModelOutput(raw, schema);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.code, "SCHEMA_VALIDATION_FAILED");
    assert(!r.detail.includes("LEAK_SECRET_VALUE"), "detail must not echo the raw model value");
  }
});

// ── Semantic hook ────────────────────────────────────────────────

Deno.test("semantic-check failure → SCHEMA_VALIDATION_FAILED", () => {
  const raw = JSON.stringify({ score: 80, summary: "Solid", items: ["a"] });
  const r = validateModelOutput(raw, schema, {
    semanticCheck: () => ({ ok: false, detail: "score.mismatch" }),
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "SCHEMA_VALIDATION_FAILED");
});

Deno.test("semantic-check pass → ok:true", () => {
  const raw = JSON.stringify({ score: 80, summary: "Solid", items: ["a"] });
  const r = validateModelOutput(raw, schema, {
    semanticCheck: () => ({ ok: true }),
  });
  assert(r.ok);
});

// ── NO MASKING: no failure input ever yields a fabricated ok:true ──

Deno.test("no failure input ever produces a fabricated ok:true body", () => {
  const failingInputs = [
    "",
    "   ",
    "{}",
    "[]",
    '{"score":null,"summary":null,"items":null}',
    "not json at all",
    '{"score":80,"summary":"Solid","items":["a"', // truncated
    '{"score":"eighty","summary":"x","items":[]}', // wrong type
    '{"summary":"x","items":[]}', // missing field
    '{"score":150,"summary":"x","items":[]}', // out of range
  ];
  for (const input of failingInputs) {
    const r = validateModelOutput(input, schema);
    assert(!r.ok, `expected typed failure for input: ${JSON.stringify(input)}`);
    if (!r.ok) {
      assert(
        ["MODEL_OUTPUT_TRUNCATED", "MODEL_INVALID_RESPONSE", "SCHEMA_VALIDATION_FAILED"].includes(r.code),
        `unexpected code ${r.code}`,
      );
      assert(!("value" in r), "failure result must not carry a value");
    }
  }
});

// ── Static-source guard: exactly one genuine-success return ───────

Deno.test("source has exactly one `return { ok: true` and no default-value substitution", async () => {
  const src = await Deno.readTextFile(new URL("./llm-validation.ts", import.meta.url));
  const okTrueReturns = src.match(/return\s*{\s*ok:\s*true/g) ?? [];
  assertEquals(okTrueReturns.length, 1, "there must be exactly one genuine-success return");
  const okFalseReturns = src.match(/ok:\s*false/g) ?? [];
  assert(okFalseReturns.length >= 4, "failure branches must return typed ok:false errors");
  // No fabricated default body on a success return.
  assert(!/return\s*{\s*ok:\s*true,\s*value:\s*(\{\}|\[\]|0|null)/.test(src), "no fabricated success value");
});
