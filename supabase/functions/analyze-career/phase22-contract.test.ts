// Phase 22 Plan 03 + 04 — analyze-career/index.ts source-grep contract tests
// (SC-4, SC-5, SC-6, SC-7)
//
// Uses the project-standard source-grep pattern (see grade-linkedin/handler-config.test.ts)
// to validate structural properties of the edge function without executing it.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

const INDEX_PATH = winSafePath('./index.ts');
const source = Deno.readTextFileSync(INDEX_PATH);

// ── Plan 22-03 SC-4: Cross-feature memory — reusedLinkedinGrade response fields ──

Deno.test('22-03 SC-4: reusedLinkedinGrade boolean set on success path', () => {
  assertEquals(source.includes('reusedLinkedinGrade'), true);
  assertEquals(source.includes('analysisResult.reusedLinkedinGrade'), true);
});

Deno.test('22-03 SC-4: linkedinGradeDate string injected into every success response', () => {
  assertEquals(source.includes('linkedinGradeDate'), true);
  assertEquals(source.includes('analysisResult.linkedinGradeDate'), true);
});

Deno.test('22-03 SC-4: career.reuse structured log emitted on short-circuit path', () => {
  assertEquals(source.includes('career.reuse'), true);
  assertEquals(source.includes('skippedPdfParse'), true);
});

// ── Plan 22-03 SC-5: D-16 graceful fallback — 412 linkedin_prior_missing ──

Deno.test('22-03 SC-5: 412 linkedin_prior_missing returned BEFORE withMerits', () => {
  assertEquals(source.includes('linkedin_prior_missing'), true);
  // Must carry structured details with hasResume + hasLinkedin
  assertEquals(source.includes('hasResume'), true);
  assertEquals(source.includes('hasLinkedin'), true);
});

Deno.test('22-03 SC-5: allowResumeOnly flag accepted and used to bypass 412 gate', () => {
  assertEquals(source.includes('allowResumeOnly'), true);
});

// ── Plan 22-04 SC-6: career_compass usage recorded via recordUsageWithAnalysis ──
//
// RECONCILED (Phase 5 Plan 05-01, 2026-06-19): the three SC-6 assertions below
// were stale from authoring — they expected an INLINE `rpc('record_ai_usage'`
// call with a `p_action_type: 'career_compass'` object key in index.ts. That call
// form never existed in the handler (RED at v4.0-baseline; never on the offline
// gate). The handler records usage via the shared
// `recordUsageWithAnalysis(userId, 'career_compass', …)` helper in
// `_shared/usage-checker.ts`, which owns the `rpc('record_ai_usage', …)` write.
// Reconciled to assert the CURRENT helper-call form; index.ts byte-identical.
// (The SC-4/SC-5 assertions above were already green and are untouched.)

Deno.test('22-04 SC-6: handler records usage via recordUsageWithAnalysis helper (record_ai_usage seam)', () => {
  assertEquals(source.includes('recordUsageWithAnalysis'), true);
  assertEquals(source.includes("from '../_shared/usage-checker.ts'"), true);
});

Deno.test('22-04 SC-6: career_compass action recorded on the merit path', () => {
  const hasRecord = /recordUsageWithAnalysis\([\s\S]*?'career_compass'/.test(source);
  assertEquals(hasRecord, true);
});

Deno.test('22-04 SC-6: canonical single recordUsageWithAnalysis call site (current behavior)', () => {
  // CURRENT behavior is a single canonical usage-record call site (1 at
  // v4.0-baseline AND HEAD). The original "at least 2 call sites" claim was
  // stale-from-authoring (it counted inline p_action_type matches that never
  // existed). Pin the actual count of one.
  const callMatches = [...source.matchAll(/recordUsageWithAnalysis\(/g)];
  assertEquals(callMatches.length, 1);
  // And that single call records the career_compass action with the gated feature.
  assertEquals(source.includes('career_compass'), true);
});
