/**
 * Phase 09 · 09-06 · VER-02 — RECRUITING LENS per-feature recovery-wiring guard
 * (matrix cells S-02 / S-03 / S-04 / S-21 x `recruiting_lens`).
 *
 * Static source-contract guard, modeled on CareerCompass.recovery.test.tsx. The 09-01
 * registry rule: a shared-substrate cell is covered iff (substrate test in
 * `useAnalysisRun.test.ts`) AND (per-feature wiring assertion). This is RCL's half.
 *
 * RCL's duplicate-click lock is `useAnalysisGuard` (an in-flight ref lock that rejects a
 * second concurrent call outright) rather than AnalysisLockContext — a different mechanism
 * than Career Compass, so the assertion is written against the mechanism RCL actually uses.
 * Its dormancy gate lives in useAnalysisRun (startRun no-ops while the flag is off).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Line endings are normalized to LF before matching. On Windows checkouts git's autocrlf
// rewrites these sources to CRLF, which silently breaks any multi-line assertion written
// with `\n` — the guard below reads as deleted when the code is in fact intact. Normalizing
// at the read keeps every assertion in this file agnostic to how the tree was checked out.
const readSource = (path: string): string =>
  readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

const source = readSource('src/pages/RecruitingLens.tsx');
const guard = readSource('src/hooks/useAnalysisGuard.ts');
const hook = readSource('src/hooks/useAnalysisRun.ts');

// The failure branch of executeAnalyze. Scoped: `setResult(null)` legitimately exists
// elsewhere on the page (the explicit "analyze another role" reset), so an unscoped
// assertion would be wrong.
const failureBranch = source.slice(
  source.indexOf('} else if (result.error) {'),
  source.indexOf('const handleAnalyze = async () => {'),
);

describe('VER-02 recruiting_lens: wired to the useAnalysisRun recovery substrate', () => {
  it('recruiting_lens: scopes every persisted and deep-linked result to the authenticated user', () => {
    expect(source).not.toContain("sessionStorage.getItem('recruiting-lens-result')");
    expect(source).not.toContain("sessionStorage.setItem('recruiting-lens-result'");
    expect(source).toContain('readRecruitingLensResult<RecruitingLensResult>(userId);');
    expect(source).toContain('writeRecruitingLensResult(userId, analysis);');
    expect(source).toContain(".eq('id', idFromUrl)\n        .eq('user_id', userId)");
  });

  it('recruiting_lens: imports + initializes useAnalysisRun and the in-flight analysis guard', () => {
    expect(source).toContain('import { useAnalysisRun } from "@/hooks/useAnalysisRun";');
    expect(source).toContain('const { startRun } = useAnalysisRun();');
    expect(source).toContain('const { startAnalysis, cancelAnalysis } = useAnalysisGuard();');
  });

  // S-03 (refresh during analysis) + S-04 (navigate away and return).
  it('recruiting_lens: calls startRun(run_id) so a refresh/navigation re-attaches to the live run', () => {
    expect(source).toContain('if (runId) startRun(runId);');
    expect(source).toContain("const runId = (result.data as { run_id?: string }).run_id;");
  });

  // S-02 duplicate-click submission.
  it('recruiting_lens: engages the useAnalysisGuard in-flight lock and disables submit while isAnalyzing (a duplicate click cannot start a second run)', () => {
    expect(source).toContain('const result = await startAnalysis(async (_signal) => {');
    expect(source).toContain(
      'aria-disabled={!isFormReady || submitGuard.isSubmitting || isZero || !canAfford(getCostForFeature(featureCosts, ',
    );
    // The lock itself: a second concurrent call is rejected outright, never invoked.
    expect(guard).toContain('if (isRunningRef.current) {');
    expect(guard).toContain("return { success: false, error: 'Analysis already in progress' };");
    // A deliberate NEW analyze mints a fresh nonce; the "Try Again" retry REUSES it, so a
    // retry of the same submission dedups server-side instead of charging twice.
    expect(source).toContain('const executeAnalyze = async (reuseNonce = false) => {');
    expect(source).toContain('const submitToken = submitGuard.beginSubmit();');
    expect(source).toContain('attemptNonce: submitToken.attemptNonce,');
  });

  // S-21 previous-result preservation.
  it('recruiting_lens: a failed analysis never clears the previously rendered result (restored from sessionStorage, not cleared on failure)', () => {
    // The last success is persisted under the authenticated user id and re-read on mount.
    expect(source).toContain('writeRecruitingLensResult(userId, analysis);');
    expect(source).toContain('readRecruitingLensResult<RecruitingLensResult>(userId);');
    expect(source).toContain('<RecruitingLensPage key={userId} userId={userId} />');
    // The failure branch rolls back + offers a retry; it does NOT null the result or the
    // current account's cached copy of the last success.
    expect(failureBranch).toContain('settle.rollback();');
    expect(failureBranch).toContain('setShowTryAgain(true);');
    expect(failureBranch).not.toContain('setResult(null)');
    expect(failureBranch).not.toContain('removeRecruitingLensResult(userId)');
    expect(hook).toContain('previousResult is intentionally PRESERVED');
  });

  it('recruiting_lens: the lifecycle wiring is gated on isAnalysisLifecycleEnabled() (dormancy preserved)', () => {
    // The gate lives in the hook: startRun fail-closes to a no-op while the flag is off.
    expect(hook).toContain('const enabled = isAnalysisLifecycleEnabled();');
    expect(hook).toContain('if (!enabled || !nextRunId) return;');
    expect(source).not.toContain("supabase.channel('analysis_jobs");
  });
});
