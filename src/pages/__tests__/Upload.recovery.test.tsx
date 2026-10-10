/**
 * Phase 09 · 09-06 · VER-02 — RESUME per-feature recovery-wiring guard
 * (matrix cells S-02 / S-03 / S-04 / S-21 x `resume`).
 *
 * WHY THIS FILE EXISTS (the registry rule adopted in 09-01):
 *   `src/hooks/__tests__/useAnalysisRun.test.ts` proves the SUBSTRATE (dup-guard,
 *   mount recovery, preserve-previous-on-failure). It does NOT prove that the resume
 *   feature is WIRED to it. A shared-substrate cell is covered iff
 *   (substrate test) AND (per-feature wiring assertion). This is the resume half.
 *
 * Modeled verbatim on the ONLY pre-existing per-feature wiring test,
 * `src/pages/__tests__/CareerCompass.recovery.test.tsx`: a STATIC source-contract
 * guard (no render harness, no Supabase mocks). "Is this feature wired to the
 * recovery substrate?" is a question about the wiring, and the wiring is the source.
 *
 * The resume recovery surface deliberately spans THREE files (05-02):
 *   - Upload.tsx        — the submit: per-submit attemptNonce + the submit-lock.
 *   - useResumeStream.ts — the SSE owner: startRun(run_id) off the `complete` event.
 *   - Results.tsx       — the recovery/render surface: run-state recovery + the
 *                         preserve-previous-success gate.
 * Asserting only against Upload.tsx would MISS startRun entirely, so all three are
 * read. Every assertion targets REAL product source (no fixture copies).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const upload = readFileSync(resolve('src/pages/Upload.tsx'), 'utf8');
const stream = readFileSync(resolve('src/hooks/useResumeStream.ts'), 'utf8');
const results = readFileSync(resolve('src/pages/Results.tsx'), 'utf8');
const hook = readFileSync(resolve('src/hooks/useAnalysisRun.ts'), 'utf8');

describe('VER-02 resume: wired to the useAnalysisRun recovery substrate', () => {
  it('resume: imports + initializes useAnalysisRun and the analysis lock', () => {
    expect(upload).toContain("import { useAnalysisRun } from '@/hooks/useAnalysisRun';");
    expect(upload).toContain("import { useAnalysisLock } from '@/contexts/AnalysisLockContext';");
    expect(upload).toContain('isLocked,');
    expect(upload).toContain('showWaitingSurface,');
    expect(upload).toContain('hideWaitingSurface,');
    expect(upload).toContain('} = useAnalysisLock();');
    expect(upload).toContain('const { isActive: isAnalysisRunActive } = useAnalysisRun();');
    // The SSE owner holds the same hook — it is where the run_id actually arrives.
    expect(stream).toContain("import { useAnalysisRun } from '@/hooks/useAnalysisRun';");
    expect(stream).toContain('const { startRun } = useAnalysisRun();');
  });

  // S-03 (refresh during analysis) + S-04 (navigate away and return) — the hook
  // treats both as ONE recovery path (run_id from URL + localStorage on mount).
  it('resume: calls startRun(event.run_id) so a refresh/navigation re-attaches to the live run', () => {
    expect(stream).toContain('startRunRef.current(event.run_id);');
    // ...off the `complete` SSE event, gated on the flag (dormant while off).
    expect(stream).toContain(
      "if (isAnalysisLifecycleEnabled() && typeof event.run_id === 'string' && event.run_id) {",
    );
    // And Results.tsx — the screen a refresh lands on — tracks the recovered run.
    expect(results).toContain('const run = useAnalysisRun();');
  });

  // S-02 duplicate-click submission.
  it('resume: engages a submit-lock (isLocked || isAnalysisRunActive) to block a duplicate concurrent submit', () => {
    expect(upload).toContain('(isAnalysisLifecycleEnabled() && (isLocked || isAnalysisRunActive))');
    // ...and the shared guard supplies exactly one stable nonce for the acquired attempt.
    expect(upload).toContain('const submitToken = submitGuard.beginSubmit();');
    expect(upload).toContain('const attemptNonce = submitToken.attemptNonce;');
    expect(upload).toContain('attemptNonce,');
  });

  // S-21 previous-result preservation.
  it('resume: preserves the last successful result so a later failure never clears it', () => {
    // The terminal-failure screen renders ONLY when no prior result is saved. A later
    // failed run therefore cannot replace a previously delivered analysis.
    expect(results).toContain('if (run.enabled && run.isFailed && !resume?.grading_data) {');
    // The substrate's own contract that makes this true across runs.
    expect(hook).toContain('previousResult is intentionally PRESERVED');
  });

  it('resume: lifecycle wiring remains dormant while unbounded waiting requires an active run', () => {
    expect(upload).toContain("import { isAnalysisLifecycleEnabled } from '@/config/feature-flags';");
    expect(stream).toContain("import { isAnalysisLifecycleEnabled } from '@/config/feature-flags';");
    expect(results).toContain('const waitingLifecycleState = run.enabled && !isStreamMode');
    expect(results).toContain('if (!run.enabled || !run.isActive) {');
    // The hook itself fail-closes: startRun is an inert no-op while the flag is off.
    expect(hook).toContain('const enabled = isAnalysisLifecycleEnabled();');
    expect(hook).toContain('if (!enabled || !nextRunId) return;');
  });
});
