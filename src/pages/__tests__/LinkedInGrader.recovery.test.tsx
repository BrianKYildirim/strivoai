/**
 * Phase 09 · 09-06 · VER-02 — LINKEDIN per-feature recovery-wiring guard
 * (matrix cells S-02 / S-03 / S-04 / S-21 x `linkedin`).
 *
 * Static source-contract guard, modeled on CareerCompass.recovery.test.tsx. The 09-01
 * registry rule: a shared-substrate cell is covered iff (substrate test in
 * `useAnalysisRun.test.ts`) AND (per-feature wiring assertion). This is LinkedIn's half.
 *
 * NOTE on the dormancy gate: LinkedInGrader.tsx does NOT import isAnalysisLifecycleEnabled
 * directly — it relies on the hook's own fail-closed gate (`startRun` is an inert no-op
 * while the flag is off, opening no channel / poll / storage). That is a legitimate gating
 * strategy, so the gate is asserted where it actually lives (useAnalysisRun.ts) rather than
 * demanding a redundant page-level import.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('src/pages/LinkedInGrader.tsx'), 'utf8');
const hook = readFileSync(resolve('src/hooks/useAnalysisRun.ts'), 'utf8');

// The failure tail of handleAnalyze (from the success toast to the next declaration).
// Scoping the slice matters: `setResult(null)` legitimately exists elsewhere on this page
// (the ?id= hydration miss and the "grade another profile" reset), so an unscoped
// assertion would be either vacuous or wrong.
const failureTail = source.slice(
  source.indexOf("toast.success('Profile analyzed with personalized insights!');"),
  source.indexOf('const getSectionIcon'),
);

describe('VER-02 linkedin: wired to the useAnalysisRun recovery substrate', () => {
  it('linkedin: imports + initializes useAnalysisRun', () => {
    expect(source).toContain("import { useAnalysisRun } from '@/hooks/useAnalysisRun';");
    expect(source).toContain('const analysisRun = useAnalysisRun();');
  });

  // S-03 (refresh during analysis) + S-04 (navigate away and return).
  it('linkedin: calls startRun(run_id) so a refresh/navigation re-attaches to the live run', () => {
    expect(source).toContain('if (runId) analysisRun.startRun(runId);');
    expect(source).toContain("const runId = (data as LinkedInGradeResponse)?.run_id;");
    // The RESULT body re-hydrates through the existing ?id= path (analysis_jobs has no
    // result pointer — result_ref is always null), so recovery needs BOTH halves.
    expect(source).toContain("url.searchParams.set('id', normalized.recordId);");
  });

  // S-02 duplicate-click submission.
  it('linkedin: mints ONE attemptNonce per deliberate grade and disables submit while loading (a duplicate click cannot double-charge)', () => {
    expect(source).toContain('const submitToken = submitGuard.beginSubmit();');
    expect(source).toContain('const attemptNonce = submitToken.attemptNonce;');
    // The nonce rides the request body — the edge derives the idempotency key from it,
    // so a resubmit of the SAME action dedups exactly once server-side.
    expect(source).toContain('attemptNonce,');
    expect(source).toContain('setLoading(true);');
    expect(source).toContain(
      'aria-disabled={loading || submitGuard.isSubmitting || !canSubmit || isZero || !canAfford(linkedInMeritCost)}',
    );
  });

  // S-21 previous-result preservation.
  it('linkedin: a failed grade never clears the previously rendered result (no setResult(null) on the failure path)', () => {
    // The failure tail rolls back the optimistic decrement and surfaces error copy —
    // it does NOT null the rendered grade and does not bounce back to the input screen.
    expect(failureTail).toContain('settle.rollback();');
    expect(failureTail).toContain('toast.error(title,');
    expect(failureTail).not.toContain('setResult(null)');
    expect(failureTail).not.toContain('setShowInput(true)');
    expect(hook).toContain('previousResult is intentionally PRESERVED');
  });

  it('linkedin: the lifecycle wiring is gated on isAnalysisLifecycleEnabled() (dormancy preserved)', () => {
    // The gate lives in the hook: startRun fail-closes to a no-op while the flag is off,
    // so LinkedIn is byte-identical in the dormant posture.
    expect(hook).toContain('const enabled = isAnalysisLifecycleEnabled();');
    expect(hook).toContain('if (!enabled || !nextRunId) return;');
    // ...and the page never opens its own channel/poll/storage path around the run.
    expect(source).not.toContain("supabase.channel('analysis_jobs");
  });
});
