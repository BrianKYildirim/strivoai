/**
 * useAnalysisRun.test.ts — Phase 03 · 03-05 · LIFE-01 / LIFE-09.
 *
 * Covers the recovery-surface contract:
 *   1. flag-off inert — no channel, no poll, no storage touch, startRun no-op.
 *   2. subscribe-then-poll-fallback — opens the channel FIRST, then polls
 *      get-analysis-run-status (D-05 true fallback).
 *   3. refresh recovery via a persisted run_id (localStorage).
 *   4. terminal-stop — stops polling once a stop state is reached.
 *   5. retry-only-retryable — Retry is offered ONLY for state=retryable_failed
 *      with a retryable failure_code.
 *   6. preserve-previous-on-failure — a new run that fails never clears the last
 *      successful result.
 *   7. meritStatus derivation from the persisted row (T-03-17).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── mocks ────────────────────────────────────────────────────────────────────

let realtimeHandler: ((payload: { new?: Record<string, unknown> }) => void) | null = null;
const subscribeMock = vi.fn();
const removeChannelMock = vi.fn();
const channelMock = vi.fn((_name: string) => {
  const chan: Record<string, unknown> = {};
  chan.on = (_evt: string, _cfg: unknown, cb: (p: { new?: Record<string, unknown> }) => void) => {
    realtimeHandler = cb;
    return chan;
  };
  chan.subscribe = () => {
    subscribeMock();
    return chan;
  };
  return chan;
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    channel: (name: string) => channelMock(name),
    removeChannel: (c: unknown) => removeChannelMock(c),
  },
}));

const invokeMock = vi.fn();
vi.mock('@/lib/fetchWithTimeout', () => ({
  invokeWithTimeout: (...args: unknown[]) => invokeMock(...args),
}));

let flagEnabled = true;
vi.mock('@/config/feature-flags', () => ({
  isAnalysisLifecycleEnabled: () => flagEnabled,
}));

import { useAnalysisRun, ANALYSIS_RUN_STORAGE_KEY, deriveMeritStatus } from '../useAnalysisRun';

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  flagEnabled = true;
  realtimeHandler = null;
  vi.clearAllMocks();
  invokeMock.mockResolvedValue({ data: null, error: null });
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. flag-off inert ────────────────────────────────────────────────────────

describe('flag-off (dormant)', () => {
  it('is inert: no channel, no poll, no storage, startRun no-ops', () => {
    flagEnabled = false;
    const { result } = renderHook(() => useAnalysisRun());

    expect(result.current.enabled).toBe(false);
    expect(result.current.runId).toBeNull();
    expect(result.current.meritStatus).toBe('idle');

    act(() => result.current.startRun('run-off'));

    expect(result.current.runId).toBeNull();
    expect(channelMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY)).toBeNull();
  });
});

// ── 2. subscribe-then-poll-fallback ──────────────────────────────────────────

describe('subscribe-first / poll-fallback', () => {
  it('opens the realtime channel FIRST, then polls get-analysis-run-status', async () => {
    invokeMock.mockResolvedValue({
      data: { state: 'generating', status: 'processing', merit_settled: false, refunded: false },
      error: null,
    });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-1'));

    // Subscribe-first.
    expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^analysis-run-run-1-\d+$/));
    expect(subscribeMock).toHaveBeenCalled();
    // Persisted for recovery.
    expect(window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY)).toBe('run-1');

    // Poll fallback fires with the correct run_id contract.
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        'get-analysis-run-status',
        { body: { run_id: 'run-1' } },
        15000,
      ),
    );
    await waitFor(() => expect(result.current.state).toBe('generating'));
    expect(result.current.isActive).toBe(true);
    expect(result.current.isTerminal).toBe(false);
    expect(result.current.meritStatus).toBe('reserved');

    // A realtime UPDATE completes the run (fast path).
    act(() =>
      realtimeHandler?.({
        new: { state: 'completed', status: 'completed', result_ref: 'archive/x', merit_settled: true, refunded: false },
      }),
    );
    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    expect(result.current.isTerminal).toBe(true);
    expect(result.current.isActive).toBe(false);
    expect(result.current.meritStatus).toBe('charged');
    expect(result.current.previousResult).toBe('archive/x');
  });

  it('ignores a duplicate startRun while a run is active (dup guard)', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-1'));
    await waitFor(() => expect(result.current.runId).toBe('run-1'));

    act(() => result.current.startRun('run-2'));
    expect(result.current.runId).toBe('run-1');
  });

  // ── D9-11 regression: two concurrent instances tracking the SAME run_id must
  //    open DISTINCT realtime channel topics. Before the fix both used the bare
  //    `analysis-run-<runId>` topic, so supabase-js handed the second instance the
  //    already-subscribed channel and its `.on('postgres_changes', ...)` threw
  //    "cannot add callbacks after subscribe()" — black-screening the Onboarding
  //    -> Results handoff. A unique per-instance suffix makes the collision
  //    impossible. ──────────────────────────────────────────────────────────────
  it('opens DISTINCT channel topics for two instances of the same run_id (D9-11)', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });

    // Two independent mounts of the recovery surface, both recovering the same run_id
    // (the Onboarding-instance-still-mounted + Results-instance scenario).
    const a = renderHook(() => useAnalysisRun());
    const b = renderHook(() => useAnalysisRun());

    act(() => a.result.current.startRun('run-dup'));
    act(() => b.result.current.startRun('run-dup'));

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(2));

    const topics = channelMock.mock.calls
      .map((c) => c[0] as string)
      .filter((t) => t.startsWith('analysis-run-run-dup-'));

    // Both subscribed to this run, but with unique topics — never the same one.
    expect(topics.length).toBe(2);
    expect(topics[0]).not.toBe(topics[1]);
    for (const t of topics) {
      expect(t).toMatch(/^analysis-run-run-dup-\d+$/);
    }
  });
});

// ── 3. refresh recovery ──────────────────────────────────────────────────────

describe('refresh / navigation recovery', () => {
  it('recovers an active run from a persisted run_id on mount', async () => {
    window.localStorage.setItem(ANALYSIS_RUN_STORAGE_KEY, 'run-recovered');
    invokeMock.mockResolvedValue({ data: { state: 'saving', status: 'processing' }, error: null });

    const { result } = renderHook(() => useAnalysisRun());

    await waitFor(() => expect(result.current.runId).toBe('run-recovered'));
    expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^analysis-run-run-recovered-\d+$/));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        'get-analysis-run-status',
        { body: { run_id: 'run-recovered' } },
        15000,
      ),
    );
    await waitFor(() => expect(result.current.state).toBe('saving'));
  });
});

// ── 4. terminal-stop ─────────────────────────────────────────────────────────

describe('terminal-stop', () => {
  it('stops polling once a stop state is reached', async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({
      data: { state: 'completed', status: 'completed', result_ref: 'r', merit_settled: true },
      error: null,
    });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-t'));
    // Flush the immediate mount-recovery poll microtasks.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isTerminal).toBe(true);
    const callsAtTerminal = invokeMock.mock.calls.length;

    // Advance well past several poll intervals — no further polls should fire.
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(invokeMock.mock.calls.length).toBe(callsAtTerminal);
  });
});

// ── 5. retry-only-retryable ──────────────────────────────────────────────────

describe('retry-only-retryable', () => {
  it('offers retry ONLY for state=retryable_failed with a retryable code', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-r'));
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^analysis-run-run-r-\d+$/)));

    // retryable_failed + retryable code → canRetry true.
    act(() => realtimeHandler?.({ new: { state: 'retryable_failed', status: 'retrying', failure_code: 'MODEL_TIMEOUT' } }));
    await waitFor(() => expect(result.current.state).toBe('retryable_failed'));
    expect(result.current.canRetry).toBe(true);
    expect(result.current.isFailed).toBe(true);
    expect(result.current.errorMessage).toBeTruthy();

    // retryable_failed but a NON-retryable code → canRetry false (defense in depth).
    act(() =>
      realtimeHandler?.({ new: { state: 'retryable_failed', status: 'retrying', failure_code: 'SCHEMA_VALIDATION_FAILED' } }),
    );
    await waitFor(() => expect(result.current.failureCode).toBe('SCHEMA_VALIDATION_FAILED'));
    expect(result.current.canRetry).toBe(false);
  });

  it('does NOT offer retry for a terminal failed state even with a retryable code', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-f'));
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^analysis-run-run-f-\d+$/)));

    act(() => realtimeHandler?.({ new: { state: 'failed', failure_code: 'MODEL_TIMEOUT' } }));
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(result.current.canRetry).toBe(false);
    expect(result.current.isTerminal).toBe(true);
  });
});

// ── 6. preserve-previous-on-failure ──────────────────────────────────────────

describe('preserve-previous-on-failure', () => {
  it('keeps the last successful result when a subsequent run fails', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    // Run A completes successfully.
    act(() => result.current.startRun('run-a'));
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith(expect.stringMatching(/^analysis-run-run-a-\d+$/)));
    act(() => realtimeHandler?.({ new: { state: 'completed', result_ref: 'archive/success-a' } }));
    await waitFor(() => expect(result.current.previousResult).toBe('archive/success-a'));

    // Run B fails (poll + realtime agree to avoid a late-poll race).
    invokeMock.mockResolvedValue({ data: { state: 'failed', failure_code: 'DATABASE_SAVE_FAILED' }, error: null });
    act(() => result.current.startRun('run-b'));
    await waitFor(() => expect(result.current.runId).toBe('run-b'));
    await waitFor(() => expect(result.current.isFailed).toBe(true));

    // The previous success is preserved across the new failure.
    expect(result.current.previousResult).toBe('archive/success-a');
    expect(result.current.errorMessage).toBeTruthy();
    expect(result.current.canRetry).toBe(false);
  });
});

// ── 8. submit-lock (isActive) — Phase 05 · 05-03 · FEAT-02 ───────────────────
//
// The streaming resume submit-lock (AnalysisLockContext + useAnalysisRun.isActive,
// 05-02) prevents a double-charge from a double-click / two tabs. These assertions
// pin isActive as the lock signal and the startRun dup-guard as its enforcement.

describe('submit-lock (isActive)', () => {
  it('latches isActive true while a run is in flight and false once terminal', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating', status: 'processing' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    // Idle: not active.
    expect(result.current.isActive).toBe(false);

    act(() => result.current.startRun('run-lock'));
    await waitFor(() => expect(result.current.state).toBe('generating'));

    // In flight: the submit-lock is engaged.
    expect(result.current.isActive).toBe(true);
    expect(result.current.isTerminal).toBe(false);

    // Terminal completion releases the lock.
    act(() => realtimeHandler?.({ new: { state: 'completed', result_ref: 'archive/done', merit_settled: true } }));
    await waitFor(() => expect(result.current.isCompleted).toBe(true));
    expect(result.current.isActive).toBe(false);
  });

  it('the dup-guard holds the original run_id when startRun fires again mid-flight (no re-charge)', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-first'));
    await waitFor(() => expect(result.current.isActive).toBe(true));

    // A second deliberate submit while active is ignored — same run_id, no new channel.
    const channelCallsBefore = channelMock.mock.calls.length;
    act(() => result.current.startRun('run-second'));
    expect(result.current.runId).toBe('run-first');
    expect(channelMock.mock.calls.length).toBe(channelCallsBefore);
  });

  it('a fresh startRun IS allowed once the prior run is terminal (deliberate new run)', async () => {
    invokeMock.mockResolvedValue({ data: { state: 'completed', result_ref: 'archive/a', merit_settled: true }, error: null });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-a'));
    await waitFor(() => expect(result.current.isTerminal).toBe(true));
    expect(result.current.isActive).toBe(false);

    // Now a new run is permitted (the lock only guards an ACTIVE run).
    invokeMock.mockResolvedValue({ data: { state: 'generating' }, error: null });
    act(() => result.current.startRun('run-b'));
    await waitFor(() => expect(result.current.runId).toBe('run-b'));
    // The prior success is preserved across the deliberate new run.
    expect(result.current.previousResult).toBe('archive/a');
  });
});

// ── 9. dead / stale / legacy run resolution — Issue C ────────────────────────
//
// A tracked run the status endpoint reports as non-recoverable must be resolved
// TERMINAL and cleared (run_id released from state + URL + localStorage), so a
// stale/dead/legacy run_id can never wedge isActive (and thus the feature submit
// button) forever. This is the fix for the Career Compass 95% hang where a
// recovered ?run_id= pointed at a legacy row projecting state:null.

describe('dead / stale / legacy run resolution (Issue C)', () => {
  it('clears a tracked run when the status endpoint authoritatively 404s (FILE_NOT_FOUND)', async () => {
    // invokeWithTimeout surfaces a 404 jsonError as { data: <envelope>, error }.
    invokeMock.mockResolvedValue({
      data: { error: 'Run not found', code: 'FILE_NOT_FOUND', retryable: false },
      error: new Error('Run not found'),
    });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-dead'));
    expect(window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY)).toBe('run-dead');

    // Authoritative not-found clears on the FIRST signal.
    await waitFor(() => expect(result.current.runId).toBeNull());
    expect(result.current.isActive).toBe(false);
    expect(window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY)).toBeNull();
    expect(new URLSearchParams(window.location.search).get('run_id')).toBeNull();
  });

  it('clears a recovered run_id that resolves to a legacy row (state:null on a 200)', async () => {
    window.localStorage.setItem(ANALYSIS_RUN_STORAGE_KEY, 'run-legacy');
    window.history.replaceState({}, '', '/career-compass?run_id=run-legacy');
    // 200 projection for a pre-lifecycle / legacy row: has run_id, state is null.
    invokeMock.mockResolvedValue({
      data: { run_id: 'run-legacy', state: null, status: 'failed' },
      error: null,
    });
    const { result } = renderHook(() => useAnalysisRun());

    // Recovered on mount, then resolved dead because it carries no lifecycle state.
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.runId).toBeNull());
    expect(result.current.isActive).toBe(false);
    expect(window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY)).toBeNull();
    expect(new URLSearchParams(window.location.search).get('run_id')).toBeNull();
  });

  it('does NOT clear a live run on a single transient blip; clears only after MAX_EMPTY_POLLS', async () => {
    vi.useFakeTimers();
    // Transient failure: null data WITH an error (timeout / network) — NOT a 404.
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('Request timed out. Please try again.'),
    });
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-flaky'));

    // Immediate mount poll (empty #1) — a single blip must NOT clear a live run.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.runId).toBe('run-flaky');
    expect(result.current.isActive).toBe(true);

    // Two more interval polls (empty #2, #3) trip the streak → resolve dead + clear.
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.runId).toBeNull();
    expect(result.current.isActive).toBe(false);
  });

  it('an idle empty projection (data null, no error) is inert — neither applies nor clears', async () => {
    vi.useFakeTimers();
    // The default beforeEach mock: { data: null, error: null } — a benign empty.
    const { result } = renderHook(() => useAnalysisRun());

    act(() => result.current.startRun('run-idle'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Several intervals of benign empties must NOT clear the run (no error signal).
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(result.current.runId).toBe('run-idle');
    expect(result.current.isActive).toBe(true);
  });
});

// ── 7. meritStatus derivation (pure) ─────────────────────────────────────────

describe('deriveMeritStatus', () => {
  it('maps the run row to a Merit lifecycle projection', () => {
    expect(deriveMeritStatus({ state: null })).toBe('idle');
    expect(deriveMeritStatus({ state: 'created' })).toBe('idle');
    expect(deriveMeritStatus({ state: 'reserving_merits' })).toBe('reserved');
    expect(deriveMeritStatus({ state: 'generating' })).toBe('reserved');
    expect(deriveMeritStatus({ state: 'saving' })).toBe('reserved');
    expect(deriveMeritStatus({ state: 'completed', merit_settled: true })).toBe('charged');
    expect(deriveMeritStatus({ state: 'failed' })).toBe('released');
    expect(deriveMeritStatus({ state: 'retryable_failed' })).toBe('reserved');
    expect(deriveMeritStatus({ state: 'refunded', refunded: true })).toBe('refunded');
    // The financial flags win over the state ordinal.
    expect(deriveMeritStatus({ state: 'saving', refunded: true })).toBe('refunded');
    expect(deriveMeritStatus({ state: 'saving', merit_settled: true })).toBe('charged');
  });
});
