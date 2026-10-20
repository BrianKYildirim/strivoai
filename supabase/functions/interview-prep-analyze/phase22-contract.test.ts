// Phase 22 Plan 04 — interview-prep-analyze/index.ts source-grep contract tests (SC-6)
//
// Validates that the merit-path emits a usage_tracking row via record_ai_usage.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const INDEX_PATH = winSafePath('./index.ts');
const source = Deno.readTextFileSync(INDEX_PATH);

// ── Plan 22-04 SC-6: record_ai_usage on merit path ──

Deno.test('22-04 SC-6: record_ai_usage RPC called on merit path', () => {
  assertEquals(source.includes("rpc('record_ai_usage'"), true);
});

Deno.test('22-04 SC-6: p_action_type interview_prep present', () => {
  assertEquals(source.includes("p_action_type: 'interview_prep'"), true);
});

Deno.test('22-04 SC-6: exactly 1 record_ai_usage call site (no double-count)', () => {
  const matches = [...source.matchAll(/p_action_type:\s*'interview_prep'/g)];
  assertEquals(matches.length, 1);
});
