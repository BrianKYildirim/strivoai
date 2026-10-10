/**
 * supabase/functions/_shared/terminalize-stuck-run.ts
 *
 * Worker rescue for the two-writer deferral gap (D-04: "failures never hang").
 *
 * Context (career-compass-flag-split-95-hang, Bug 3): when a lifecycle run is
 * pre-created by a SUBMIT step (submit-career-analysis-job calls
 * create_or_recover_analysis_run -> state='created') and a separate WORKER then
 * invokes analyze-<feature>, the analyze function can EARLY-RETURN a non-2xx
 * (e.g. a pre-lifecycle input-validation 400 or an entitlement 402) BEFORE its
 * runAnalysisLifecycle executor ever runs its CAS transitions. Under Pattern 2
 * (06-02) the worker DEFERS all status/refund writes to the executor — but the
 * executor never ran, so nobody terminalizes the run: it is orphaned at 'created'
 * with a live Merit reservation, the frontend polls forever (95% hang), and the
 * reaper only rescues it minutes later.
 *
 * This helper lets the worker deterministically terminalize such a run + release
 * its reservation EXACTLY ONCE, WITHOUT stomping a two-writer executor that DID run:
 *
 *   - It is called ONLY on a PERMANENT (non-retryable / retries-exhausted) failure.
 *   - If the executor already resolved the run (state is terminal, or the
 *     deliberately-recoverable 'retryable_failed' off-ramp), this is a no-op — the
 *     executor / frontend-Retry / reaper own those. Only genuinely-stuck pipeline
 *     states (created / validating_inputs / ... / saving) are terminalized.
 *   - A non-2xx from analyze-<feature> implies the durable save did NOT complete,
 *     so a refund is always pre-save-safe (money rule: never refund after a durable
 *     save; DO refund a pre-save failure). refundMeritsForJob is idempotent
 *     (already_refunded) and the CAS is a no-op if another actor already moved the
 *     row — together these make the release EXACTLY ONCE.
 *
 * No new migration: reuses the existing transition_analysis_run CAS + refund_merits.
 */
import { refundMeritsForJob, type RefundVerdict } from './merit-gateway.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * The client this helper receives — the REAL supabase-js client type, i.e. exactly what
 * getServiceClient() returns and what process-career-analysis-job actually passes.
 *
 * This replaces a hand-rolled "minimal shape ... kept loose for testability" mimic. Loose
 * was not free: a real SupabaseClient was NOT assignable to it (TS2322 — PostgREST's
 * builders are Thenable, not Promise, so they lack catch/finally), so the two production
 * call sites were erroring rather than being checked. A chainable mimic cannot be fixed
 * into honesty either — PostgREST's builders are self-recursive AND heavily generic, so
 * assigning a real client to any of them ends in TS2589. See the same reasoning and
 * trade-off recorded in extract-analysis-structure/types.ts.
 *
 * Testability is unaffected: the tests run under `deno test --no-check` and pass
 * duck-typed mocks that still satisfy this helper at runtime.
 */
type SupaLike = SupabaseClient;

/**
 * States the worker must NOT touch: the three terminals plus the deliberately
 * recoverable 'retryable_failed' off-ramp (owned by the executor's retry path,
 * the frontend Retry, and the reaper). Terminalizing any of these would stomp a
 * two-writer executor that already ran.
 */
const RESOLVED_OR_RECOVERABLE = new Set<string>([
  'completed',
  'failed',
  'refunded',
  'retryable_failed',
]);

/**
 * Does a refund exist ON FILE for this reservation?
 *
 * This is the meaning of the analysis_jobs.refunded COLUMN, and it is NOT the same as
 * TerminalizeStuckRunResult.refunded ("a reservation was released by THIS call"). The two
 * diverge on the idempotent path: already_refunded means this call released nothing
 * (result false) but the money IS refunded (column true).
 *
 *   { ok: true }                          fresh refund      -> true
 *   { ok: true, alreadyRefunded: true }   idempotent (D-02) -> true
 *   { ok: false, error }                  fail-closed       -> false
 *   null                                  not attempted     -> false
 *
 * Writing true without a refund behind it is not self-healing: reap-stale-analysis-runs
 * skips any row with merit_settled || refunded, so a false true permanently strands the
 * Merit (quick 260724-4cc, REFUND TRUTH). Exported solely so the branch can be tested
 * behaviorally — mirrors classifyRefundRpcResult in merit-gateway.ts.
 */
export function refundIsOnFile(verdict: RefundVerdict | null): boolean {
  return verdict !== null && verdict.ok === true;
}

export interface TerminalizeStuckRunParams {
  supabase: SupaLike;
  /** analysis_jobs.id (== run_id). */
  runId: string;
  /** Deduction owner (for the idempotent refund). */
  userId: string;
  /** merit_transaction_id stamped on the run at reserve time, or null. */
  meritTransactionId: string | null;
  /** Permanent taxonomy code to record (e.g. INPUT_MISSING for a 400). */
  failureCode: string;
  /** Pipeline stage/reason label recorded in failure_stage. */
  failureStage: string;
}

export interface TerminalizeStuckRunResult {
  /** true when THIS call moved the row to 'failed' via the CAS. */
  terminalized: boolean;
  /** true when the run was already resolved/recoverable (executor owned it) → skipped. */
  skipped: boolean;
  /** true when a Merit reservation was released by THIS call. */
  refunded: boolean;
}

/**
 * Deterministically terminalize a lifecycle run the worker knows FAILED PERMANENTLY
 * but which the deferred executor never terminalized. Refund-before-fail, CAS-guarded,
 * exactly-once. Safe to call unconditionally on any permanent worker-observed failure.
 */
export async function terminalizeStuckRun(
  params: TerminalizeStuckRunParams,
): Promise<TerminalizeStuckRunResult> {
  const { supabase, runId, userId, meritTransactionId, failureCode, failureStage } = params;

  // Read the run's current state (belt; the CAS below is the authoritative race guard).
  const { data: row } = await supabase
    .from('analysis_jobs')
    .select('state, merit_settled, refunded')
    .eq('id', runId)
    .maybeSingle();

  const state = (row?.state ?? null) as string | null;

  // No lifecycle row / legacy row (state null): nothing to terminalize via the CAS.
  if (!state) return { terminalized: false, skipped: true, refunded: false };
  // Executor already resolved it (or it is a deliberately-recoverable off-ramp): skip.
  if (RESOLVED_OR_RECOVERABLE.has(state)) return { terminalized: false, skipped: true, refunded: false };

  const settled = row?.merit_settled === true;
  const alreadyRefunded = row?.refunded === true;
  // Refund only a live, unsettled reservation (money rule + the settle/refund CHECK).
  const canRefund = !!meritTransactionId && !settled && !alreadyRefunded;

  // Refund BEFORE the terminal CAS (mirrors the executor's refundAndFail + the
  // worker's OFF-path refund-then-failed ordering). Idempotent.
  let refunded = false;
  let refundVerdict: RefundVerdict | null = null;
  if (canRefund && meritTransactionId) {
    const r = await refundMeritsForJob(userId, meritTransactionId, `${failureStage}:${failureCode}`);
    refundVerdict = r;
    if (r.ok) {
      refunded = !r.alreadyRefunded;
    } else {
      // Log-and-continue: still terminalize so the run cannot hang. If the refund
      // genuinely failed the idempotent reaper backstop will retry it.
      console.error('[terminalizeStuckRun] refund-failed', { run_id: runId, reason: r.error });
    }
  }

  const patch: Record<string, unknown> = {
    failure_code: failureCode,
    failure_stage: failureStage,
  };
  // REFUND TRUTH: the column follows the refund OUTCOME, never mere eligibility. A failed
  // RPC leaves refunded unset so the row stays eligible for the idempotent reaper backstop
  // (the safety net this line used to disarm). Still terminalizes below — no hang.
  if (refundIsOnFile(refundVerdict)) patch.refunded = true;

  const { data: tData, error: tError } = await supabase.rpc('transition_analysis_run', {
    p_run_id: runId,
    p_from_state: state,
    p_to_state: 'failed',
    p_patch: patch,
  });

  if (tError) {
    console.error('[terminalizeStuckRun] transition-failed', {
      run_id: runId,
      from: state,
      error: tError.message,
    });
    return { terminalized: false, skipped: false, refunded };
  }

  const transitioned = (tData as { transitioned?: boolean } | null)?.transitioned === true;
  return { terminalized: transitioned, skipped: false, refunded };
}
