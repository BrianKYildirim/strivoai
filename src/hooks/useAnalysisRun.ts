/**
 * useAnalysisRun — Phase 03 · 03-05 · LIFE-01 / LIFE-09.
 *
 * The frontend RECOVERY SURFACE for the shared analysis lifecycle. It TRACKS a
 * single run_id (it does NOT submit an analysis — that stays feature-owned) and
 * projects the persisted lifecycle state so a user who refreshes or navigates
 * away always recovers the truth of their active run.
 *
 * Ships DORMANT (LIFE-09): the whole hook is gated behind
 * isAnalysisLifecycleEnabled(). When the VITE flag is off it early-returns an
 * inert, no-op state and NEVER opens a channel, polls, or touches storage — so no
 * feature exercises it in Phase 3. A later phase enables it by flipping the flag
 * AND threading a run_id via startRun().
 *
 * Recovery model (subscribe-first / poll-fallback — D-05):
 *   1. Subscribe FIRST to analysis_jobs postgres_changes filtered id=eq.<run_id>
 *      (owner-scoped by the analysis_jobs owner-SELECT RLS — the realtime channel
 *      cannot deliver another user's run). Realtime is the fast path.
 *   2. Poll get-analysis-run-status as the TRUE fallback — immediately on
 *      mount-recovery (to catch a state change that landed before the channel
 *      opened) and on an interval while the run is active (to cover a missed
 *      realtime event). Both stop at a terminal state.
 *
 * run_id persistence (URL param + localStorage) is what makes refresh/navigation
 * recovery work: startRun() writes both; on mount the hook recovers a run_id from
 * the URL first, then localStorage.
 *
 * Financial trust (T-03-17 / LIFE-04): meritStatus is derived from the PERSISTED
 * run row (state + merit_settled + refunded), never from optimistic client state.
 *
 * Leak-free failures (LIFE-08): a failed run's message comes from mapAnalysisError
 * (the frontend taxonomy mirror) — Retry is offered ONLY when the terminal state
 * is retryable_failed AND the mapped code is retryable. A new run that fails never
 * clears the previously successful result.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithTimeout } from '@/lib/fetchWithTimeout';
import { isAnalysisLifecycleEnabled } from '@/config/feature-flags';
import { mapAnalysisError } from '@/lib/analysisError';
import { reportDiagnostic } from '@/lib/diagnostics/client-diagnostics';

// ── Lifecycle model (mirrors the 03-01 11-state ledger) ──────────────────────

export type LifecycleState =
  | 'created'
  | 'validating_inputs'
  | 'reserving_merits'
  | 'extracting_data'
  | 'generating'
  | 'validating_output'
  | 'saving'
  | 'completed'
  | 'retryable_failed'
  | 'failed'
  | 'refunded';

const LIFECYCLE_ORDER: Record<LifecycleState, number> = {
  created: 1,
  validating_inputs: 2,
  reserving_merits: 3,
  extracting_data: 4,
  generating: 5,
  validating_output: 6,
  saving: 7,
  completed: 8,
  retryable_failed: 9,
  failed: 10,
  refunded: 11,
};

/** States at which the run is no longer progressing (the hook stops here). */
const STOP_STATES: ReadonlySet<LifecycleState> = new Set<LifecycleState>([
  'completed',
  'failed',
  'refunded',
  'retryable_failed',
]);

/** Merit lifecycle projection (derived from the run row, never client state). */
export type MeritStatus = 'idle' | 'reserved' | 'charged' | 'released' | 'refunded';

export const ANALYSIS_RUN_STORAGE_KEY = 'strivio.analysis.run_id';
const URL_PARAM = 'run_id';
const DEFAULT_POLL_MS = 2500;

/**
 * Authoritative not-found taxonomy code returned by get-analysis-run-status when
 * a run_id maps to no owned row (404). See supabase/functions/get-analysis-run-status.
 */
const NOT_FOUND_CODE = 'FILE_NOT_FOUND';

/**
 * How many CONSECUTIVE empty/transient poll results (timeout / network error with
 * no body) are tolerated before a tracked run is resolved as dead. A single 404
 * (authoritative not-found) or a null-lifecycle-state 200 clears immediately; this
 * streak guard only exists so a transient network blip cannot nuke a still-live run.
 */
const MAX_EMPTY_POLLS = 3;

/**
 * Monotonic per-instance suffix for the realtime channel topic.
 *
 * `useAnalysisRun` is a plain hook (no provider): the SAME run_id is legitimately
 * tracked by two mounted instances during a page handoff — e.g. Onboarding calls
 * startRun(run_id) then navigates to /results, where Results mounts its own
 * instance and recovers the same run_id before Onboarding's channel has finished
 * tearing down. supabase-js keys channels by topic and hands back the EXISTING,
 * already-subscribed channel for a duplicate topic, so the second instance's
 * `.on('postgres_changes', ...)` throws "cannot add callbacks after subscribe()"
 * and, with no error boundary, black-screens the results view (D9-11).
 *
 * Making the topic unique per subscription guarantees `.channel()` always returns
 * a FRESH channel, so concurrent instances never collide. The topic name is a
 * client-side identifier only; the row filter (`id=eq.<run_id>`) and owner-scoped
 * RLS are unchanged, so both instances still receive exactly this run's updates.
 */
let analysisRunChannelSeq = 0;

// ── Row shape (subset returned by realtime + get-analysis-run-status) ────────

interface RunRow {
  /** Present on the poll-endpoint success projection; absent on realtime payloads. */
  run_id?: string | null;
  /** Present on a jsonError envelope body (e.g. FILE_NOT_FOUND on 404). */
  code?: string | null;
  state?: string | null;
  status?: string | null;
  failure_code?: string | null;
  failure_stage?: string | null;
  retry_count?: number | null;
  updated_at?: string | null;
  result_ref?: string | null;
  merit_settled?: boolean | null;
  refunded?: boolean | null;
}

export interface AnalysisRunSnapshot {
  /** true only when the lifecycle VITE flag is on. */
  enabled: boolean;
  /** The tracked run_id, or null when idle. */
  runId: string | null;
  /** Persisted lifecycle state, or null before the first projection. */
  state: LifecycleState | null;
  /** Legacy status column (byte-identical dormancy dual-write). */
  status: string | null;
  /** true while a run_id is tracked and not yet at a stop state. */
  isActive: boolean;
  /** true once the run reaches a stop state (completed/failed/refunded/retryable_failed). */
  isTerminal: boolean;
  /** true when state === 'completed'. */
  isCompleted: boolean;
  /** true for failed / refunded / retryable_failed. */
  isFailed: boolean;
  /** Retry offered ONLY when state is retryable_failed AND the mapped code is retryable. */
  canRetry: boolean;
  /** Backend failure_code (taxonomy code), or null. */
  failureCode: string | null;
  /** Leak-free user-facing message for a failed run (mapAnalysisError), or null. */
  errorMessage: string | null;
  /** Pointer to the current run's result (result_ref), or null. */
  resultRef: string | null;
  /** The LAST successful run's result_ref — preserved across a later failed run. */
  previousResult: string | null;
  /** Merit lifecycle projection, derived from the run row. */
  meritStatus: MeritStatus;
  /**
   * 03-14 / XRUN-04. The realtime channel reported CHANNEL_ERROR, TIMED_OUT or
   * CLOSED and this surface is now relying on the poll fallback.
   *
   * INFORMATIONAL, NEVER AN ERROR (taxonomy rule 4). Renderers show
   * `CLIENT_REALTIME_DEGRADED` as a muted line and nothing else: no toast, no
   * error state, no destructive colour, nothing blocked. It clears silently the
   * moment the channel reports SUBSCRIBED again. Exposed on the snapshot so
   * plan 03-15's waiting surface can consume it without a signature change.
   */
  realtimeDegraded: boolean;
}

export interface UseAnalysisRunResult extends AnalysisRunSnapshot {
  /** Begin tracking a new run_id. No-op while a run is already active (dup guard). */
  startRun: (runId: string) => void;
  /** Re-arm tracking for a retry. Only meaningful when canRetry is true. */
  retry: () => void;
  /** Stop tracking and clear the persisted run_id (URL + localStorage). */
  clear: () => void;
}

// ── Pure helpers (exported for direct unit testing) ──────────────────────────

export function isStopState(state: LifecycleState | null): boolean {
  return state !== null && STOP_STATES.has(state);
}

export function deriveMeritStatus(row: {
  state?: string | null;
  merit_settled?: boolean | null;
  refunded?: boolean | null;
}): MeritStatus {
  if (row.refunded) return 'refunded';
  if (row.merit_settled) return 'charged';
  const state = (row.state ?? null) as LifecycleState | null;
  if (!state) return 'idle';
  if (state === 'failed') return 'released';
  const ord = LIFECYCLE_ORDER[state] ?? 0;
  // Merits are reserved once we pass reserving_merits and remain held while the
  // pipeline runs or awaits a retry decision.
  if (ord >= LIFECYCLE_ORDER.reserving_merits && ord <= LIFECYCLE_ORDER.saving) return 'reserved';
  if (state === 'retryable_failed') return 'reserved';
  return 'idle';
}

function coerceState(raw: string | null | undefined): LifecycleState | null {
  if (raw && Object.prototype.hasOwnProperty.call(LIFECYCLE_ORDER, raw)) {
    return raw as LifecycleState;
  }
  return null;
}

// ── run_id persistence (URL param + localStorage) ────────────────────────────

function readPersistedRunId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
    if (fromUrl) return fromUrl;
  } catch {
    /* ignore malformed URL */
  }
  try {
    return window.localStorage.getItem(ANALYSIS_RUN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistRunId(runId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ANALYSIS_RUN_STORAGE_KEY, runId);
  } catch {
    /* storage may be unavailable (private mode) — recovery degrades to URL only */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, runId);
    // Relative form (pathname+search+hash) — some environments reject an absolute
    // same-origin replaceState URL.
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore history failures */
  }
}

function clearPersistedRunId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ANALYSIS_RUN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(URL_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAnalysisRun(): UseAnalysisRunResult {
  const enabled = isAnalysisLifecycleEnabled();

  const [runId, setRunId] = useState<string | null>(null);
  const [row, setRow] = useState<RunRow | null>(null);
  const [previousResult, setPreviousResult] = useState<string | null>(null);
  // 03-14 / XRUN-04 — informational only; never an error state (taxonomy rule 4).
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);

  // Interval + channel handles kept in refs so effect cleanup is precise.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Consecutive empty/transient poll results for the current run_id (Issue C).
  const emptyPollStreakRef = useRef(0);

  const state = coerceState(row?.state);
  const isTerminal = isStopState(state);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Stop tracking and release the persisted run_id from state + URL + localStorage.
  // Used both by the public clear() and by the poll fallback when it resolves a
  // dead/stale/non-lifecycle run (Issue C) — a run the status endpoint reports as
  // non-recoverable must never keep isActive (and the submit button) wedged forever.
  const clearTracking = useCallback(() => {
    stopPolling();
    emptyPollStreakRef.current = 0;
    clearPersistedRunId();
    setRunId(null);
    setRow(null);
  }, [stopPolling]);

  // Recover a persisted run_id on mount (refresh / navigation recovery).
  useEffect(() => {
    if (!enabled) return;
    const recovered = readPersistedRunId();
    if (recovered) {
      setRunId(recovered);
    }
    // Recovery runs once on mount; startRun/retry drive it thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Apply a fresh row projection; stop-state rows also latch previousResult.
  const applyRow = useCallback((next: RunRow) => {
    setRow(next);
    if (coerceState(next.state) === 'completed' && next.result_ref) {
      // Latch the last successful result. A LATER failed run never clears this.
      setPreviousResult(next.result_ref);
    }
  }, []);

  // Subscribe-first + poll-fallback while a run is tracked and not terminal.
  useEffect(() => {
    if (!enabled || !runId) return;

    let cancelled = false;
    // Reset the empty/transient streak for this run_id.
    emptyPollStreakRef.current = 0;
    setRealtimeDegraded(false);

    // Poll get-analysis-run-status as the TRUE fallback (D-05). Declared before
    // the channel purely so the status callback below can force ONE catch-up;
    // the CALL order is unchanged — subscribe still happens first.
    const fetchStatus = async () => {
      const { data, error } = await invokeWithTimeout<RunRow>(
        'get-analysis-run-status',
        { body: { run_id: runId } },
        15000,
      );
      if (cancelled) return;

      // (A) Authoritative "run not found" (404 → FILE_NOT_FOUND envelope) OR a
      // streak of empty transient results (timeout / network error, no body).
      // Either way the tracked run is unrecoverable → resolve it terminal + clear
      // so a stale/dead run_id can never wedge isActive (and the submit button).
      // A 404 clears on the first authoritative signal; a bare transient null only
      // clears after MAX_EMPTY_POLLS in a row so one blip can't nuke a live run.
      const authoritativeNotFound = data?.code === NOT_FOUND_CODE;
      const transientEmpty = !data && error !== null;
      if (authoritativeNotFound || transientEmpty) {
        emptyPollStreakRef.current += 1;
        if (authoritativeNotFound || emptyPollStreakRef.current >= MAX_EMPTY_POLLS) {
          clearTracking();
        }
        return;
      }

      // A success with a null/absent body but no error (unusual) — wait for the
      // next poll rather than acting. Does NOT count against the empty streak so an
      // idle mock or a momentary empty projection is inert (mirrors prior guard).
      if (!data) return;

      emptyPollStreakRef.current = 0;

      // (B) A SUCCESSFUL projection (no error, a genuine run_id-bearing body) whose
      // lifecycle state is null/absent is a LEGACY / non-lifecycle row (e.g. a
      // pre-lifecycle job that the recovery surface should not track). It can never
      // reach a stop state, so resolve it dead + clear rather than polling forever
      // — the root of the 95% hang when a recovered run_id pointed at a legacy row.
      if (error === null && data.run_id != null && (data.state === null || data.state === undefined)) {
        clearTracking();
        return;
      }

      applyRow(data);
      // Stop polling once the run reaches a stop state.
      if (isStopState(coerceState(data.state))) {
        stopPolling();
      }
    };

    // 03-14 / XRUN-04 (defect register XD-18). At HEAD this was a BARE
    // `.subscribe()`, so CHANNEL_ERROR / TIMED_OUT / CLOSED were never observed:
    // realtime-js walks its reconnect intervals and then a fallback FOREVER, and
    // v2 has no long-poll transport — polling is the only recovery, which is why
    // OBSERVING the failure is the whole job. Byte-for-byte the same callback
    // shape as the live site in `Results.tsx`, so the two cannot drift.
    let degradedReported = false;
    const onRealtimeStatus = (status: string) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        degradedReported = false;
        setRealtimeDegraded(false);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeDegraded(true);
        // ONE catch-up and ONE diagnostic per TRANSITION into degraded, not one
        // per event — realtime-js retries unboundedly in the background, and a
        // poll per retry from every affected tab is a self-inflicted storm.
        if (degradedReported) return;
        degradedReported = true;
        // The status string and the error object carry transport detail (socket
        // URLs, close codes). Only the closed `realtime_degraded` CATEGORY is
        // reported; nothing about the error itself is passed, and nothing
        // reaches the DOM (XRUN-06).
        reportDiagnostic({
          surface: 'resume-analysis',
          stage: 'recovery',
          category: 'realtime_degraded',
          runId,
        });
        void fetchStatus();
      }
    };

    // Subscribe FIRST (fast path). Owner-scoped by analysis_jobs RLS.
    // Unique per-instance topic so a concurrent instance tracking the same
    // run_id (Onboarding -> Results handoff) can never be handed back an
    // already-subscribed channel — the D9-11 "add callbacks after subscribe()"
    // crash. The `id=eq.<runId>` filter below still scopes it to this run.
    const channelTopic = `analysis-run-${runId}-${++analysisRunChannelSeq}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analysis_jobs', filter: `id=eq.${runId}` },
        (payload: { new?: RunRow }) => {
          if (cancelled || !payload?.new) return;
          applyRow(payload.new);
        },
      )
      .subscribe(onRealtimeStatus);

    // Immediate mount-recovery poll (catches a change that predates the channel).
    void fetchStatus();
    // Interval fallback (covers a missed realtime event).
    pollTimerRef.current = setInterval(() => void fetchStatus(), DEFAULT_POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, runId, applyRow]);

  // Stop the interval as soon as we observe a terminal state via realtime, too.
  useEffect(() => {
    if (isTerminal && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [isTerminal]);

  const isActive = enabled && runId !== null && !isTerminal;

  const startRun = useCallback(
    (nextRunId: string) => {
      if (!enabled || !nextRunId) return;
      // Duplicate-submission guard: ignore while a run is still active.
      if (runId !== null && !isStopState(coerceState(row?.state))) return;
      // Reset stale current-run state for the deliberate new run.
      // previousResult is intentionally PRESERVED (survives a subsequent failure).
      setRow(null);
      persistRunId(nextRunId);
      setRunId(nextRunId);
    },
    [enabled, runId, row?.state],
  );

  const retry = useCallback(() => {
    if (!enabled || !runId) return;
    // Only re-arm from a retryable failure.
    if (state !== 'retryable_failed') return;
    if (!mapAnalysisError(row?.failure_code).retryable) return;
    // Re-arm tracking against the SAME run_id; the executor re-enters the pipeline.
    setRow(null);
  }, [enabled, runId, state, row?.failure_code]);

  const clear = useCallback(() => {
    clearTracking();
  }, [clearTracking]);

  const snapshot = useMemo<AnalysisRunSnapshot>(() => {
    if (!enabled) {
      return {
        enabled: false,
        runId: null,
        state: null,
        status: null,
        isActive: false,
        isTerminal: false,
        isCompleted: false,
        isFailed: false,
        canRetry: false,
        failureCode: null,
        errorMessage: null,
        resultRef: null,
        previousResult: null,
        meritStatus: 'idle',
        realtimeDegraded: false,
      };
    }

    const failureCode = row?.failure_code ?? null;
    const isCompleted = state === 'completed';
    const isFailed = state === 'failed' || state === 'refunded' || state === 'retryable_failed';
    const mapped = failureCode ? mapAnalysisError(failureCode) : null;
    const canRetry = state === 'retryable_failed' && mapped !== null && mapped.retryable;

    return {
      enabled: true,
      runId,
      state,
      status: row?.status ?? null,
      isActive,
      isTerminal,
      isCompleted,
      isFailed,
      canRetry,
      failureCode,
      errorMessage: isFailed && mapped ? mapped.message : null,
      resultRef: row?.result_ref ?? null,
      previousResult,
      meritStatus: deriveMeritStatus({
        state: row?.state ?? null,
        merit_settled: row?.merit_settled ?? null,
        refunded: row?.refunded ?? null,
      }),
      // Informational only, and only meaningful while a run is still in flight.
      realtimeDegraded: realtimeDegraded && !isTerminal,
    };
  }, [enabled, runId, row, state, isActive, isTerminal, previousResult, realtimeDegraded]);

  return { ...snapshot, startRun, retry, clear };
}
