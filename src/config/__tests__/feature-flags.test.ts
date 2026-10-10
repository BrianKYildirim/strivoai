/**
 * feature-flags.test.ts — Phase 47 Plan 00 Task 2.
 *
 * Locks in the fail-closed env-coercion semantics of `isInterviewPrepEnabled()`.
 *
 * Per CONTEXT D-06/D-07/D-08/D-09:
 *   - `VITE_FEATURE_INTERVIEW_PREP` must be exactly the lowercase string 'true' to enable.
 *   - Anything else — undefined, '', 'false', 'TRUE', 'True', '1', 'yes', 'on' — must
 *     return `false` so misconfigured environments fail closed.
 *   - `import.meta.env.MODE` and `import.meta.env.PROD` must NOT influence the result
 *     (both equal 'production' for every `vite build`, including preview/staging).
 *
 * Tests use `vi.stubEnv()` (Vitest 1.6.x) which intercepts `import.meta.env` reads
 * at runtime. `vi.unstubAllEnvs()` in `afterEach` restores the original env so tests
 * stay isolated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInterviewPrepEnabled, isAnalysisLifecycleEnabled } from '../feature-flags';

describe('isInterviewPrepEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── False cases (fail-closed matrix) ─────────────────────────────────────

  it('returns false when VITE_FEATURE_INTERVIEW_PREP is undefined', () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', undefined as unknown as string);
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is '' (empty string)", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', '');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is 'false'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is 'TRUE' (uppercase)", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'TRUE');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is 'True' (mixed case)", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'True');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is '1'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', '1');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is 'yes'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'yes');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  it("returns false when value is 'on'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'on');
    expect(isInterviewPrepEnabled()).toBe(false);
  });

  // ── True case (only exact lowercase 'true' enables) ──────────────────────

  it("returns true ONLY when value is exactly 'true' (lowercase)", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    expect(isInterviewPrepEnabled()).toBe(true);
  });

  // ── D-09 lock-in: MODE / PROD must not influence the result ──────────────

  it('does NOT change based on import.meta.env.MODE or PROD (D-09 lock-in)', () => {
    // Simulate a production build (Vite always sets MODE='production' / PROD=true
    // for `vite build`, including preview/staging builds) while leaving the
    // feature flag unset. Helper must still return false.
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('PROD', true);
    // VITE_FEATURE_INTERVIEW_PREP intentionally left unset.
    expect(isInterviewPrepEnabled()).toBe(false);
  });
});

describe('isAnalysisLifecycleEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── False cases (fail-closed matrix) ─────────────────────────────────────

  it('returns false when VITE_FEATURE_ANALYSIS_LIFECYCLE is undefined (default off)', () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', undefined as unknown as string);
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  it("returns false when value is '' (empty string)", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', '');
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  it("returns false when value is 'false'", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', 'false');
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  it("returns false when value is 'True' (mixed case)", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', 'True');
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  it("returns false when value is 'TRUE' (uppercase)", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', 'TRUE');
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  it("returns false when value is '1'", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', '1');
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });

  // ── True case (only exact lowercase 'true' enables) ──────────────────────

  it("returns true ONLY when value is exactly 'true' (lowercase)", () => {
    vi.stubEnv('VITE_FEATURE_ANALYSIS_LIFECYCLE', 'true');
    expect(isAnalysisLifecycleEnabled()).toBe(true);
  });

  // ── D-09 lock-in: MODE / PROD must not influence the result ──────────────

  it('does NOT change based on import.meta.env.MODE or PROD (D-09 lock-in)', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('PROD', true);
    // VITE_FEATURE_ANALYSIS_LIFECYCLE intentionally left unset.
    expect(isAnalysisLifecycleEnabled()).toBe(false);
  });
});
