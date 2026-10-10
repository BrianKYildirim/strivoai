// Phase 22 Plan 04 — recruiting-lens/index.ts source-grep contract tests (SC-6)
//
// Validates that the merit-path emits a usage_tracking row that flows into the
// record_ai_usage RPC.
//
// RECONCILED (Phase 5 Plan 05-01, 2026-06-19): stale-from-authoring assertions.
// They expected an INLINE `rpc('record_ai_usage'` call with a
// `p_action_type: 'recruiting_lens'` object key in index.ts — a call form that
// never existed in the handler (RED at v4.0-baseline; never on the offline gate).
// The handler records usage via the shared
// `recordUsageWithAnalysis(userId, 'recruiting_lens', 1, recordId)` helper in
// `_shared/usage-checker.ts`, which owns the `rpc('record_ai_usage', …)` write.
// Reconciled to assert the CURRENT helper-call form; index.ts byte-identical.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const INDEX_PATH = winSafePath('./index.ts');
const source = Deno.readTextFileSync(INDEX_PATH);

// ── SC-6: usage recorded via the shared recordUsageWithAnalysis helper ──

Deno.test('22-04 SC-6: handler records usage via recordUsageWithAnalysis helper (record_ai_usage seam)', () => {
  assertEquals(source.includes('recordUsageWithAnalysis'), true);
  assertEquals(source.includes("from '../_shared/usage-checker.ts'"), true);
});

Deno.test('22-04 SC-6: recruiting_lens action recorded on the merit path', () => {
  const hasRecord = /recordUsageWithAnalysis\(\s*[A-Za-z0-9_.]+,\s*'recruiting_lens'/.test(source);
  assertEquals(hasRecord, true);
});
