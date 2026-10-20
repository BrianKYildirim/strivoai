/**
 * Phase 02 · TOK-02 — telemetry coverage drift guard (threat T-02-12).
 *
 * Every live Anthropic call in this repo must carry a telemetry context, or the token
 * headroom study silently measures a subset of production and recommends caps from it.
 *
 * WHY THIS IS A STATIC SOURCE PROBE AND NOT A RUNTIME TEST: an unlabelled call site is
 * INVISIBLE at runtime. It simply writes no row — which is indistinguishable from "that
 * path was not exercised in this run". There is no observable failure to assert on. Only
 * a source-level count catches the omission, and the edge tests in this repo are already
 * source-probe tests (see `_shared/sanitizer-coverage.test.ts`, whose shape this mirrors).
 *
 * WHAT COUNTS AS A CALL SITE: `invokeAnthropicText(` (the raw seam) and `invokeWithRetry(`
 * (the `_shared/ai-retry.ts` wrapper, which spreads its params straight into the seam).
 * Both carry `AnthropicInvokeParams`, so both are labellable and both must be labelled.
 *
 * WHY `_shared/anthropic.ts` IS NOT ENROLLED: it DEFINES the telemetry seam and performs
 * the writes; it does not call itself. Enrolling it would assert a tautology.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

/**
 * Every edge function that makes a live, product-facing Anthropic call.
 *
 * The `=== 7` assertion below is load-bearing: adding a new AI function without adding it
 * here turns this file RED, so a whole feature cannot be silently omitted from the study.
 */
const AI_CALL_FUNCTIONS = [
  'analyze-resume',
  'analyze-career',
  'grade-linkedin',
  'recruiting-lens',
  'interview-prep-analyze',
  'interview-prep-evaluate',
  'ocr-pdf',
] as const;

/** Strips block comments and whole-line `//` comments so prose cannot inflate a count. */
function readFunctionCode(fn: string): string {
  const url = new URL(`../${fn}/index.ts`, import.meta.url);
  return Deno.readTextFileSync(url)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function countMatches(source: string, re: RegExp): number {
  return (source.match(re) ?? []).length;
}

const CALL_SITE_RE = /\b(?:invokeAnthropicText|invokeWithRetry)\(/g;
const TELEMETRY_RE = /telemetry:\s*\{/g;

function directAnthropicFetches(source: string): number {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return countMatches(code, /(?:fetch\s*\([^)]*)?https:\/\/api\.anthropic\.com\//g);
}

Deno.test('TOK-02: the enrolled AI-function list is exhaustive (no feature silently omitted)', () => {
  assertEquals(
    AI_CALL_FUNCTIONS.length,
    7,
    'a new AI function must be enrolled here (and instrumented) before this list changes',
  );
  for (const fn of AI_CALL_FUNCTIONS) {
    assert(readFunctionCode(fn).length > 0, `${fn}/index.ts must exist and be readable`);
  }
});

Deno.test('TOK-02: every Anthropic call site in an enrolled function carries a telemetry context', () => {
  // Every enrolled file is measured BEFORE asserting, so one drifting function does not
  // hide the others behind an early abort — the failure message is the whole work order.
  const drift: string[] = [];
  for (const fn of AI_CALL_FUNCTIONS) {
    const code = readFunctionCode(fn);
    const callSites = countMatches(code, CALL_SITE_RE);
    const telemetryBlocks = countMatches(code, TELEMETRY_RE);

    assert(callSites > 0, `${fn}: expected at least one Anthropic call site — did the import move?`);
    if (callSites !== telemetryBlocks) {
      drift.push(
        `${fn}/index.ts: ${callSites} Anthropic call site(s) but ${telemetryBlocks} telemetry ` +
          `block(s) (delta ${callSites - telemetryBlocks})`,
      );
    }
  }

  assertEquals(
    drift,
    [],
    `unlabelled Anthropic call site(s):\n  ${drift.join('\n  ')}\n` +
      `Every invokeAnthropicText/invokeWithRetry call must pass ` +
      `telemetry: { feature, tier, callName, reqId, userId, attempt } with the SERVER-resolved tier.`,
  );
});

Deno.test('TOK-02: _shared/anthropic.ts is the seam, not an enrolled caller', () => {
  assert(
    !(AI_CALL_FUNCTIONS as readonly string[]).includes('_shared'),
    '_shared/anthropic.ts defines the telemetry seam and must never be enrolled as a call site',
  );
  const seam = Deno.readTextFileSync(new URL('./anthropic.ts', import.meta.url));
  assert(
    seam.includes('recordAiTelemetry('),
    'the seam must still perform the telemetry write this guard presumes',
  );
});

Deno.test('TOK-02: direct Anthropic fetch bypasses are rejected', () => {
  const fixture = `await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' });`;
  assertEquals(directAnthropicFetches(fixture), 1, 'the raw direct-fetch fixture must be rejected');

  const bypasses: string[] = [];
  for (const entry of Deno.readDirSync(new URL('..', import.meta.url))) {
    if (!entry.isDirectory || entry.name === '_shared') continue;
    const indexUrl = new URL(`../${entry.name}/index.ts`, import.meta.url);
    try {
      if (directAnthropicFetches(Deno.readTextFileSync(indexUrl)) > 0) {
        bypasses.push(`${entry.name}/index.ts`);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  assertEquals(
    bypasses,
    [],
    `Anthropic requests must pass through _shared/anthropic.ts: ${bypasses.join(', ')}`,
  );
});

Deno.test('TOK-02: ocr-pdf labels every physical Claude page attempt for one-count joins', () => {
  const code = readFunctionCode('ocr-pdf');
  assert(code.includes("operationName: 'document_ocr'"));
  assert(code.includes('featureRunId: context.parent.featureRunId'));
  assert(code.includes('attemptNumber: attemptCount'));
  assert(code.includes('isRetry: false'));
  assert(code.includes('telemetryIds.push(ai.telemetryId)'));
});
