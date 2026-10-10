// Phase 22 Plan 04 — grade-linkedin/index.ts source-grep contract tests (SC-6)
//
// Validates that both runtime paths emit paid usage_tracking rows that flow
// into the record_ai_usage RPC.
//
// RECONCILED (Phase 5 Plan 05-01, 2026-06-19): these assertions were stale from
// authoring — they expected an INLINE `rpc('record_ai_usage'` call with a
// `p_action_type: 'linkedin_grading'` object key in index.ts. That call form
// never existed in the handler (it was RED even at v4.0-baseline, which is why
// these files were never on the offline gate). The handler records usage via the
// shared `recordUsageWithAnalysis(userId, 'linkedin_grading', <credits>, recordId)`
// helper in `_shared/usage-checker.ts`, which internally performs the
// `rpc('record_ai_usage', { p_action_type, p_credits })` write.

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
  // The helper is imported from the shared usage-checker (the record_ai_usage RPC owner).
  assertEquals(source.includes("from '../_shared/usage-checker.ts'"), true);
});

Deno.test('22-04 SC-6: linkedin_grading action recorded at >= 2 call sites', () => {
  const matches = [...source.matchAll(/recordUsageWithAnalysis\(\s*[A-Za-z0-9_.]+,\s*'linkedin_grading'/g)];
  assertEquals(matches.length >= 2, true);
});

Deno.test('22-04 SC-6: paid merit path records 1 credit', () => {
  const paidWrites = source.match(
    /recordUsageWithAnalysis\(\s*[A-Za-z0-9_.]+,\s*'linkedin_grading',\s*1\b/g,
  ) ?? [];
  assertEquals(paidWrites.length >= 2, true);
});

Deno.test('22-04 SC-6: no zero-credit LinkedIn usage write survives', () => {
  assertEquals(
    /recordUsageWithAnalysis\(\s*[A-Za-z0-9_.]+,\s*'linkedin_grading',\s*0\b/.test(source),
    false,
  );
});

Deno.test('22-04 SC-6: no conditional zero-credit usage expression survives', () => {
  assertEquals(source.includes('? 0 : 1'), false);
});
