/**
 * Phase 09 · 09-06 · VER-02 — ONBOARDING per-feature recovery-wiring guard
 * (matrix cells S-02 / S-03 / S-04 / S-21 x `onboarding`).
 *
 * Onboarding is NOT a separate edge function — it is `analyze-resume` with an explicit
 * `origin: 'onboarding'` discriminator (05-01), so the BACKEND cells reuse the resume
 * column plus the dispatch assertion. Its FRONTEND surface, however, is a distinct real
 * page with its own submit path, so a per-feature page-wiring spec is exactly right here.
 *
 * Static source-contract guard, modeled on CareerCompass.recovery.test.tsx (the 09-01
 * registry rule: a shared-substrate cell is covered iff (substrate test) AND (per-feature
 * wiring assertion)).
 *
 * The onboarding recovery surface spans TWO files:
 *   - Onboarding.tsx — the submit: origin discriminator, per-submit attemptNonce,
 *                      startRun(run_id) BEFORE navigating, and the byte-identical
 *                      flag-OFF legacy fire-and-forget fall-through.
 *   - Results.tsx    — where onboarding navigates (`/results/:resumeId`); the run-state
 *                      recovery + preserve-previous-success gate live there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const onboarding = readFileSync(resolve('src/pages/Onboarding.tsx'), 'utf8');
const results = readFileSync(resolve('src/pages/Results.tsx'), 'utf8');
const hook = readFileSync(resolve('src/hooks/useAnalysisRun.ts'), 'utf8');

describe('VER-02 onboarding: wired to the useAnalysisRun recovery substrate', () => {
  it('onboarding: imports + initializes useAnalysisRun and dispatches origin: onboarding', () => {
    expect(onboarding).toContain('import { useAnalysisRun } from "@/hooks/useAnalysisRun";');
    expect(onboarding).toContain('const analysisRun = useAnalysisRun();');
    // The discriminator that makes onboarding its own feature namespace on the edge
    // (NOT stream!==true — Pitfall C).
    expect(onboarding).toContain("origin: 'onboarding',");
  });

  // S-03 (refresh during analysis) + S-04 (navigate away and return).
  it('onboarding: calls startRun(data.run_id) before navigating so a refresh/navigation re-attaches to the live run', () => {
    expect(onboarding).toContain('if (data.run_id) analysisRun.startRun(data.run_id);');
    // startRun must run BEFORE the navigate, or the results screen mounts with no
    // persisted run_id to recover from.
    const startIdx = onboarding.indexOf('if (data.run_id) analysisRun.startRun(data.run_id);');
    const navIdx = onboarding.indexOf('navigate(`/results/${resume.id}`);', startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(startIdx);
    // The screen the user lands on tracks the recovered run.
    expect(results).toContain('const run = useAnalysisRun();');
  });

  // S-02 duplicate-click submission.
  it('onboarding: derives the attemptNonce from a STABLE ref and disables the button while loading (a duplicate click cannot mint a second run)', () => {
    // first-attempt-reliability (direction 1): the per-submit `crypto.randomUUID()` at the
    // invoke site is GONE — a retry that minted a fresh nonce derived a NEW server idempotency
    // key and charged again. The nonce is now held in a ref (mirrors CareerCompass) and reused
    // across a same-page retry so the charge happens exactly once.
    expect(onboarding).toContain('const attemptNonce = submitToken.attemptNonce;');
    expect(onboarding).toContain('attemptNonce,');
    // The submit control is disabled for the whole in-flight window.
    // Stale-literal reconciliation (quick task 260713-2ay): commit e8fa2e2b anchored onboarding
    // on a professional goal and tightened this guard to
    //   disabled={loading || professionalGoal.trim().length === 0}
    // which is STRICTLY STRONGER than the `disabled={loading}` literal this test used to grep
    // for — so the assertion went red while the behavior it protects got better. Intent is
    // unchanged and still pinned (loading gates the button); only the brittle exact-literal is
    // replaced, so a future legitimate guard addition cannot false-alarm here again.
    expect(onboarding).toContain('onClick={handleFinishSetup}');
    expect(onboarding).toMatch(/aria-disabled=\{loading(\s*\|\|[^}]*)?\}/);
    expect(onboarding).toContain('setLoading(true);');
  });

  // S-21 previous-result preservation.
  it('onboarding: preserves the last successful result so a later failure never clears it', () => {
    expect(results).toContain('if (run.enabled && run.isFailed && !resume?.grading_data) {');
    expect(hook).toContain('previousResult is intentionally PRESERVED');
  });

  // Quick 260718-j2x: entitlement freshness before dispatch. The backend resolves tier
  // authoritatively from profiles.subscription_tier, so a stale (un-refreshed) row can hand
  // an upgraded Elite user a free-depth analysis. Pin the freshness step so it can't silently
  // regress, and lock the tier:'free' cleanup.
  it('onboarding: refreshes entitlement (reconcileTierUpgrade) BEFORE the dormant analyze-resume invoke and no longer sends tier:"free"', () => {
    // Wiring present.
    expect(onboarding).toContain('reconcileTierUpgrade');
    expect(onboarding).toContain('useInvalidateMerits');

    // Order: the freshness step must appear BEFORE the dormant call site. Anchor BOTH sides to
    // the actual statements, NOT bare `indexOf('reconcileTierUpgrade')` — that matches the
    // top-of-file destructure (`const { reconcileTierUpgrade } = useMerits()`), which sits far
    // above every call site and makes the ordering assertion vacuously true (M-02). Anchor the
    // invoke side to `const analysisPromise =` and the freshness side to its awaited call site.
    const dormantInvokeIdx = onboarding.indexOf('const analysisPromise =');
    const reconcileCallIdx = onboarding.indexOf('await reconcileTierUpgrade(');
    expect(dormantInvokeIdx).toBeGreaterThan(-1);
    expect(reconcileCallIdx).toBeGreaterThan(-1);
    expect(reconcileCallIdx).toBeLessThan(dormantInvokeIdx);

    // Cleanup lock: the misleading client tier is gone from BOTH invoke bodies.
    expect(onboarding).not.toContain("tier: 'free'");

    // Shared guard is acquired before the first asynchronous full-path operation.
    expect(onboarding).toContain('submitToken = submitGuard.beginSubmit();');
    expect(onboarding).toContain('if (!submitToken) return;');
    expect(onboarding).toContain('submitGuard.endSubmit(submitToken)');
  });

  it('onboarding: the lifecycle wiring is gated on isAnalysisLifecycleEnabled() (dormancy preserved)', () => {
    expect(onboarding).toContain(
      'import { isAnalysisLifecycleEnabled } from "@/config/feature-flags";',
    );
    expect(onboarding).toContain('if (isAnalysisLifecycleEnabled()) {');
    // The flag-OFF branch is the byte-identical legacy path (fire-and-forget + navigate).
    // Stale-literal reconciliation (260713-hrd / 260715-onb silent-failure repair): the legacy
    // branch's generic tightened from `invokeWithTimeout<unknown>` to
    // `invokeWithTimeout<{ error?: string }>` so the resolved value's `.error` can be inspected
    // (the fix that made a failed first analysis surface a toast instead of a silent 120s spinner).
    // Behavior is unchanged/stronger; only the brittle exact generic drifted. Match generic-agnostic
    // so a future legitimate type change cannot false-alarm the fire-and-forget guard again.
    expect(onboarding).toMatch(/const analysisPromise = invokeWithTimeout<[^>]*>\(/);
    expect(hook).toContain('const enabled = isAnalysisLifecycleEnabled();');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// first-attempt-reliability (directions 1+2) — onboarding stable-idempotency +
// pre-toast recovery. Source-contract guards (the established convention for this
// page): the invariants are all about the SHAPE of the retry/recovery seam, which a
// source contract pins precisely.
//
// `codeOnly` strips comments so a doc comment that NAMES a forbidden literal (e.g. the
// per-submit `crypto.randomUUID()` this fix deleted) neither satisfies nor breaks a guard.
// ─────────────────────────────────────────────────────────────────────────────
const onboardingCode = onboarding
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('first-attempt-reliability · direction 1: stable idempotency across a same-page retry', () => {
  it('holds the attemptNonce in useSubmitGuard — the invoke no longer mints a fresh UUID per submit', () => {
    expect(onboarding).toContain('const submitGuard = useSubmitGuard({');
    expect(onboarding).toContain('const attemptNonce = submitToken.attemptNonce;');
    // The per-submit mint at the invoke site is gone (that was the double-charge seam).
    expect(onboardingCode).not.toContain('const attemptNonce = crypto.randomUUID();');
  });

  it('reuses the uploaded resumes row across a retry (no duplicate row / no second run identity)', () => {
    expect(onboarding).toContain('const resumeRecordRef = useRef<{ id: string } | null>(null);');
    // The upload + insert is gated: a held record short-circuits it.
    expect(onboardingCode).toContain('if (resumeRecordRef.current) {');
    expect(onboardingCode).toContain('resumeRecordRef.current = { id: insertedResume.id };');
  });

  it('releases the held resume row only on terminal outcomes while the guard releases in finally', () => {
    const nullResume = (onboardingCode.match(/resumeRecordRef\.current = null;/g) || []).length;
    expect(nullResume).toBeGreaterThanOrEqual(3);
    expect(onboardingCode).toContain('submitGuard.endSubmit(submitToken)');
  });
});

describe('first-attempt-reliability · direction 2: recover BEFORE toasting', () => {
  it('re-reads the authoritative resumes.grading_data by resumeId before surfacing any error', () => {
    expect(onboarding).toContain('const onboardingResultLanded = async (resumeId: string): Promise<boolean> => {');
    expect(onboardingCode).toContain(".select(\"grading_data\")");
    expect(onboardingCode).toContain('return data?.grading_data != null;');
    // The recovery read must be awaited INSIDE the give-up branch, before the toast.
    const giveUp = onboardingCode.slice(onboardingCode.indexOf('if (error || !data || data.error) {'));
    const landedIdx = giveUp.indexOf('await onboardingResultLanded(resume.id)');
    const toastIdx = giveUp.indexOf('toast.error(mapped.message)');
    expect(landedIdx).toBeGreaterThan(-1);
    expect(toastIdx).toBeGreaterThan(landedIdx);
  });

  it('landed → navigate; bodyless transport ambiguity → bounded Results recovery; every server-reported lifecycle failure toasts', () => {
    const giveUp = onboardingCode.slice(
      onboardingCode.indexOf('if (error || !data || data.error) {'),
      // Anchor the end on the success-path literal (data.run_id, not data?.run_id) — it
      // survives comment stripping and marks the first line AFTER the give-up block.
      onboardingCode.indexOf('if (data.run_id) analysisRun.startRun(data.run_id);'),
    );
    // landed → navigate, no toast in that branch
    expect(giveUp).toContain('if (landed) {');
    expect(giveUp).toContain('navigate(`/results/${resume.id}`);');
    // GENUINE terminal = any server-returned taxonomy code (the lifecycle has already
    // terminalized/refunded) OR an immediate client-side rejection. Only a bodyless
    // 408/network failure remains ambiguous.
    expect(giveUp).toContain('const isImmediateRejection = status === 400 || status === 402 || status === 403 || status === 429;');
    expect(giveUp).toContain('const isServerReportedFailure = failureCode !== null;');
    expect(giveUp).toContain('if (isServerReportedFailure || isImmediateRejection) {');
    // only ONE toast in the entire give-up block, and it is the terminal branch
    expect((giveUp.match(/toast\.error\(/g) || []).length).toBe(1);
    expect(giveUp).toContain('toast.error(mapped.message);');
  });

  it('classifies terminal-vs-alive from the taxonomy code (data.code) + HTTP status, not a generic 500 assumption', () => {
    // The invoke type now carries `code`, and the branch maps it. This is what keeps a
    // non-retryable terminal (truncation/schema) from being masked by the alive path even
    // though it also arrives as HTTP 500.
    expect(onboarding).toContain('import { mapAnalysisError } from "@/lib/analysisError";');
    expect(onboarding).toContain('run_id?: string; error?: string; code?: string');
    expect(onboardingCode).toContain('const mapped = mapAnalysisError(failureCode);');
  });
});
