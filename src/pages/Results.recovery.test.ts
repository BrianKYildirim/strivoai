/**
 * Response-recovery contract (this ticket, acceptance criterion #3 / #7).
 *
 * If the backend finishes but the frontend loses the response (dropped stream,
 * refresh, navigation), the completed analysis MUST be recovered by the existing
 * resume id — a realtime subscription plus a direct DB re-read of
 * `resumes.grading_data` — and MUST NOT start a second analysis or create a
 * second job/charge.
 *
 * This is a source-contract guard (the repo's convention for locking Results.tsx
 * behavior, cf. Results.phase22.test.ts): it pins the recovery seams so they
 * cannot silently regress into a "re-run on reload" flow.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const source = readFileSync(resolve(__dirname, 'Results.tsx'), 'utf-8');

describe('Results.tsx response-recovery seams', () => {
  it('reads the completed result back from resumes by id (recovery, not re-run)', () => {
    expect(source).toMatch(/\.from\(["']resumes["']\)[\s\S]{0,80}\.eq\(["']id["']/);
    expect(source).toContain('grading_data');
  });

  it('subscribes to realtime postgres_changes on the resumes row', () => {
    expect(source).toContain('postgres_changes');
    expect(source).toMatch(/table:\s*["']resumes["']/);
  });

  it('recovers a completed backend result even when the stream is lost', () => {
    // On job "completed" it force-fetches the row to cover a missed realtime event.
    expect(source).toMatch(/status === 'completed'/);
    expect(source).toContain('Force-fetch');
  });

  it('the recovery/render paths never re-invoke a new analysis or job submission', () => {
    // The ONLY analysis kickoff is the streaming hook. Recovery must not POST to
    // analyze-resume or submit a new job — that would double-charge / duplicate.
    expect(source).not.toContain('submit-resume-analysis-job');
    expect(source).not.toMatch(/functions\/v1\/analyze-resume/);
  });

  it('waits unbounded only while a concrete lifecycle run is actively tracked', () => {
    // A global feature flag is not an alive signal. If onboarding receives no run_id
    // (or a stale id is cleared), the resumes-row poll has no terminal state and must
    // retain the bounded recovery surface instead of sitting at 95% forever.
    expect(source).toContain('if (!run.enabled || !run.isActive) {');
    expect(source).toContain('[id, jobId, retryToken, run.enabled, run.isActive]');
    expect(source).not.toContain('if (!isAnalysisLifecycleEnabled()) {');
  });

  it('surfaces analysis failures through the leak-free stream sanitizer, not raw text', () => {
    expect(source).toContain('getSafeStreamErrorMessage(streamState.error)');
    expect(source).not.toContain('{streamState.error ||');
  });
});
