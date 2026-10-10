/**
 * Deno unit tests for repairTruncatedJSON.
 * Run with: deno test supabase/functions/_shared/json-repair.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { repairTruncatedJSON, repairTruncatedJSONChecked, describeBufferShape } from "./json-repair.ts";

// Helper: parse the repaired string and return the object, or throw.
function repairAndParse(raw: string): unknown {
  return JSON.parse(repairTruncatedJSON(raw));
}

Deno.test("already-valid JSON passes through unchanged", () => {
  const input = JSON.stringify({ a: 1, b: [2, 3] });
  assertEquals(repairTruncatedJSON(input), input);
});

Deno.test("strips ```json markdown fence", () => {
  const input = '```json\n{"a":1}\n```';
  assertEquals(repairAndParse(input), { a: 1 });
});

Deno.test("strips ``` markdown fence without language tag", () => {
  const input = '```\n{"a":1}\n```';
  assertEquals(repairAndParse(input), { a: 1 });
});

Deno.test("closes single unterminated object", () => {
  const result = repairAndParse('{"a":1');
  assertEquals(result, { a: 1 });
});

Deno.test("closes nested objects", () => {
  const result = repairAndParse('{"a":{"b":2');
  assertEquals(result, { a: { b: 2 } });
});

Deno.test("closes object inside array inside object", () => {
  // Truncated version of the entScore issue: [{}}, wrong nesting was the old bug
  const result = repairAndParse('{"items":[{"x":1}');
  assertEquals(result, { items: [{ x: 1 }] });
});

Deno.test("closes unterminated string at end", () => {
  const result = repairAndParse('{"a":"hello');
  assertEquals((result as { a: string }).a, "hello");
});

Deno.test("removes dangling key with colon but no value", () => {
  const result = repairAndParse('{"a":1,"b":');
  assertEquals(result, { a: 1 });
});

Deno.test("removes dangling key with no colon or value", () => {
  const result = repairAndParse('{"a":1,"b"');
  assertEquals(result, { a: 1 });
});

Deno.test("removes trailing comma before closing brace", () => {
  const result = repairAndParse('{"a":1,}');
  assertEquals(result, { a: 1 });
});

Deno.test("removes trailing comma before closing bracket", () => {
  const result = repairAndParse('{"arr":[1,2,]}');
  assertEquals(result, { arr: [1, 2] });
});

Deno.test("handles deeply nested truncation (resume-style)", () => {
  const partial = `{"overallScore":72,"criteria":{"structure":{"score":7,"feedback":"Good layout","suggestions":["Use cleaner section headers`;
  const result = repairAndParse(partial) as any;
  assertEquals(result.overallScore, 72);
  assertEquals(result.criteria.structure.score, 7);
});

Deno.test("handles career-style truncation (entScore array bug)", () => {
  // Simulates the exact pattern that caused `"entScore":[]}}`
  const partial = `{"domains":[{"name":"Tech","roles":["SWE"],"entScore":[80,90`;
  const result = repairAndParse(partial) as any;
  assertEquals(result.domains[0].name, "Tech");
  assertEquals(Array.isArray(result.domains[0].entScore), true);
});

Deno.test("handles escaped quotes inside string values", () => {
  const input = '{"msg":"he said \\"hello\\""}';
  assertEquals(repairAndParse(input), { msg: 'he said "hello"' });
});

Deno.test("handles truncation mid-escape-sequence gracefully", () => {
  // Truncated after a backslash — just ensure it doesn't throw
  const result = repairTruncatedJSON('{"a":"test\\');
  // May not parse perfectly but should not throw
  assertEquals(typeof result, "string");
});

Deno.test("strips bare 'json' prefix without code fences", () => {
  const input = 'json\n{"a":1}';
  assertEquals(repairAndParse(input), { a: 1 });
});

Deno.test("strips bare 'json' prefix with truncated output", () => {
  const input = 'json\n{"executiveSummary":{"keyStrengths":["good at coding';
  const result = repairAndParse(input) as any;
  assertEquals(result.executiveSummary.keyStrengths[0], "good at coding");
});

Deno.test("strips text preamble before JSON object", () => {
  const input = 'Here is the JSON:\n{"a":1}';
  assertEquals(repairAndParse(input), { a: 1 });
});

Deno.test("strips text preamble before JSON array", () => {
  const input = 'json\n[1,2,3]';
  assertEquals(repairAndParse(input), [1, 2, 3]);
});

// ─────────────────────────────────────────────────────────────────────────────
// elite-cc-output-incomplete — REAL ~29k Elite Career Compass regression corpus.
//
// This bug survived a green verify:baseline because every existing fixture above
// is a toy string. It only reproduces at REAL SIZE with REAL SHAPE: the model
// wraps its JSON in a fence AND emits a further ``` later in the buffer. The old
// lazy regex /```(?:json)?\s*([\s\S]*?)(?:```|$)/i stopped at that second fence,
// silently discarded the remainder, and brace-closed the surviving prefix into a
// stub that PARSED — 28,905 -> 6,509 chars in production.
//
// The three signatures that must be reproduced SIMULTANEOUSLY, or the fixture is
// not exercising the bug:
//   1. ~77-80% of the buffer dropped
//   2. the stub still parses cleanly (which is why nothing ever errored)
//   3. exactly careerFields / surpriseFits / roles / roadmap go missing
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => "x".repeat(n);

/** Elite-shaped head: the sections that survive ahead of the stray fence. */
const ELITE_HEAD =
  `{"detectedDomain":"Tech","careerDNA":"${pad(400)}","whatYouHave":["${pad(200)}"],` +
  `"skillGaps":[{"skill":"A","priority":"Critical","action":"${pad(300)}"}],` +
  `"roleReadinessBreakdown":{"overallScore":72,"targetRole":"DA","readinessVerdict":"${pad(4000)}"}`;

/** The four sections production lost — they live AFTER the stray fence. */
const ELITE_MID =
  `,"careerFields":[{"title":"F","matchScore":80,"whyMatch":"${pad(6000)}"}],` +
  `"surpriseFits":[{"role":"R","readinessScore":78,"whySurprising":"${pad(4000)}"}],` +
  `"roles":[{"title":"T","description":"${pad(5000)}"}],` +
  `"roleRoadmaps":[{"role":"X","steps":[{"phase":"Months 1-2","items":["${pad(3000)}"]}]}],` +
  `"roadmap":[{"category":"Courses","items":["${pad(3000)}"]}]`;

/** The genuinely-unterminated tail, verbatim from the failing prod run's tail200. */
const ELITE_TAIL =
  `,"compensationIntelligence":{"fiveYearEarnings":"5-year earnings potential: $1.6M-$2.1M.`;

const LOST_SECTIONS = ["careerFields", "surpriseFits", "roles", "roadmap"];

Deno.test("elite-cc: ~29k fenced response with a stray inner fence keeps ALL sections", () => {
  const input = "```json\n" + ELITE_HEAD + "\n```\n" + ELITE_MID + ELITE_TAIL;
  // The fixture must be REAL SIZE — a synthetic stub does not exercise this bug.
  assert(input.length > 25_000, `fixture too small to reproduce prod: ${input.length}`);

  const repaired = repairTruncatedJSON(input);
  const parsed = JSON.parse(repaired) as Record<string, unknown>;

  // Signature 1 inverted: we must now retain essentially the whole buffer.
  assert(
    repaired.length > input.length * 0.9,
    `silent content loss: ${input.length} -> ${repaired.length}`,
  );
  // Signature 3 inverted: the four sections prod lost must all be present.
  for (const section of LOST_SECTIONS) {
    assert(section in parsed, `lost section '${section}' — the fence regex ate the remainder`);
  }
  assertEquals(Object.keys(parsed).length, 11);
});

Deno.test("elite-cc: a stray fence INSIDE a string value is preserved, not truncated at", () => {
  // The fork the investigation deliberately did not pin: a ``` inside a string is
  // legal JSON content and must survive verbatim.
  const input = '```json\n{"a":"see ```code``` here","b":2}\n```';
  const parsed = JSON.parse(repairTruncatedJSON(input)) as { a: string; b: number };
  assertEquals(parsed.a, "see ```code``` here");
  assertEquals(parsed.b, 2);
});

Deno.test("elite-cc: pure structural truncation stays lossless (no false loss-guard trip)", () => {
  // Probe shapes A and B: repair handles these losslessly, so the guard must not
  // fire on them — otherwise we would convert working repairs into hard failures.
  for (const input of [ELITE_HEAD + ELITE_MID + ELITE_TAIL, "```json\n" + ELITE_HEAD + ELITE_MID + ELITE_TAIL]) {
    const checked = repairTruncatedJSONChecked(input);
    assert(checked.ok, "loss-guard must not fire on lossless structural truncation");
    const parsed = JSON.parse(checked.json) as Record<string, unknown>;
    for (const section of LOST_SECTIONS) assert(section in parsed);
  }
});

Deno.test("elite-cc: loss-guard fires when repair falls back to a heavily-truncated candidate", () => {
  // A closed fenced block followed by a large unparseable remainder: no
  // content-preserving candidate parses, so repair falls back to the small
  // last-resort block. That IS a parseable stub — exactly the shape that used to
  // be persisted silently. The guard must refuse it rather than hand it back.
  const input = '```json\n{"a":1}\n```\n' + pad(20_000);
  const parsedStub = JSON.parse(repairTruncatedJSON(input)) as Record<string, unknown>;
  assertEquals(parsedStub, { a: 1 }); // it parses — which is why this was invisible

  const checked = repairTruncatedJSONChecked(input);
  assert(!checked.ok, "guard must reject a repair that discarded the bulk of the buffer");
  if (!checked.ok) {
    assert(checked.error.includes("discarded"), checked.error);
    assert(checked.repairedLen < checked.originalLen * 0.6);
  }
});

Deno.test("returns valid JSON string (parseable output)", () => {
  const cases = [
    '{"a":1',
    '{"a":[1,2',
    '{"a":{"b":{"c":3',
    '{"a":"unterminated',
    '{"a":1,"b":',
  ];
  for (const c of cases) {
    const repaired = repairTruncatedJSON(c);
    try {
      JSON.parse(repaired);
    } catch (e) {
      throw new Error(`Failed to parse repaired output for input: ${JSON.stringify(c)}\nRepaired: ${repaired}\n${e}`);
    }
  }
});

// ── describeBufferShape — the A-vs-B discriminator (elite-cc-output-incomplete) ──
// These two shapes are indistinguishable from tail500 alone, yet they demand
// OPPOSITE fixes. The probe exists solely to tell them apart on the next failing
// prod run, so each shape gets a test asserting the verdict it must produce.

Deno.test("shape probe: balanced object + trailing prose -> jsonEndsAt set, prose measured", () => {
  const json = '{"careerDNA":"x","readiness":1}';
  const raw = '```json\n' + json + '\n```\n\nYou are on track. **Next steps:**\n1. Do the thing.';
  const shape = describeBufferShape(raw);

  assert(shape.jsonEndsAt !== null, "a balanced object must report where it closed");
  assert(shape.trailingAfterJson > 0, "trailing prose after the close must be measured");
  // The verdict that matters: the model DID close its object, so nothing downstream
  // of the parser can be blamed for the missing sections — they were never emitted.
  assertEquals(raw.trim().slice(shape.jsonStartsAt!, shape.jsonEndsAt! + 1), json);
});

Deno.test("shape probe: never-balanced object -> jsonEndsAt null (structural truncation)", () => {
  const raw = '```json\n{"careerDNA":"x","fields":[{"title":"Eng"';
  const shape = describeBufferShape(raw);

  assertEquals(shape.jsonEndsAt, null);
  assertEquals(shape.trailingAfterJson, 0);
});

Deno.test("shape probe: a fence INSIDE a string value is classified as in-string", () => {
  // The exact shape the debug session named as the only one able to drop ~77% and
  // still parse: an inner ``` living inside a string value. A string-aware scan must
  // see it as invisible-to-structure, which is what makes Fix Option A safe.
  const raw = '{"roadmap":"run ```bash npm i``` first","roles":[]}';
  const shape = describeBufferShape(raw);

  assert(shape.fenceCount >= 1, "inner fences must be located");
  assert(shape.fencesInString.some((v) => v), "an inner fence inside a string must be flagged in-string");
  assert(shape.jsonEndsAt !== null, "an inner fence must not prevent the object from balancing");
});
