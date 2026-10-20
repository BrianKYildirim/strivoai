/**
 * Phase 06 — terminalize-stuck-run: the two-writer deferral-gap rescue.
 *
 * Regression proof for career-compass-flag-split-95-hang (Bug 3): when
 * analyze-<feature> early-returns a permanent 4xx BEFORE its lifecycle executor
 * ran, submit's pre-created run is orphaned at a non-terminal state (typically
 * 'created') and the frontend hangs at 95%. terminalizeStuckRun must
 * DETERMINISTICALLY move such a run to 'failed' via the CAS — while NEVER stomping
 * a two-writer executor that already resolved the run (terminal / retryable_failed
 * off-ramp) and NEVER touching a legacy (state:null) row.
 *
 * These are FUNCTIONAL tests against a fake service client (no DB). The refund
 * decision (refund-before-CAS + refunded:true patch) is additionally pinned by a
 * comment-stripped static-source guard, since refundMeritsForJob resolves its own
 * service client internally.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { refundIsOnFile, terminalizeStuckRun } from './terminalize-stuck-run.ts';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/** Minimal fake of the service client the helper touches. */
function makeFakeClient(row: Record<string, unknown> | null, transitioned = true) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                // deno-lint-ignore require-await
                async maybeSingle() {
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
    // deno-lint-ignore require-await
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return { data: { transitioned }, error: null };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, rpcCalls };
}

Deno.test('terminalizes a stuck "created" run to failed via the CAS (not orphaned)', async () => {
  const { client, rpcCalls } = makeFakeClient({ state: 'created', merit_settled: false, refunded: false });

  const res = await terminalizeStuckRun({
    supabase: client,
    runId: 'run-created',
    userId: 'user-1',
    meritTransactionId: null, // no reservation → no refund network call (hermetic)
    failureCode: 'INPUT_MISSING',
    failureStage: 'worker_terminal_4xx',
  });

  assertEquals(res.terminalized, true);
  assertEquals(res.skipped, false);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].fn, 'transition_analysis_run');
  assertEquals(rpcCalls[0].args.p_run_id, 'run-created');
  assertEquals(rpcCalls[0].args.p_from_state, 'created');
  assertEquals(rpcCalls[0].args.p_to_state, 'failed');
  const patch = rpcCalls[0].args.p_patch as Record<string, unknown>;
  assertEquals(patch.failure_code, 'INPUT_MISSING');
  // No reservation → the CAS patch must NOT set refunded (nothing to release).
  assertEquals(patch.refunded, undefined);
});

Deno.test('terminalizes a run stuck deeper in the pipeline (e.g. reserving_merits)', async () => {
  const { client, rpcCalls } = makeFakeClient({ state: 'reserving_merits', merit_settled: false, refunded: false });

  const res = await terminalizeStuckRun({
    supabase: client,
    runId: 'run-rm',
    userId: 'user-1',
    meritTransactionId: null,
    failureCode: 'UNKNOWN_ANALYSIS_ERROR',
    failureStage: 'worker_terminal_4xx',
  });

  assertEquals(res.terminalized, true);
  assertEquals(rpcCalls[0].args.p_from_state, 'reserving_merits');
  assertEquals(rpcCalls[0].args.p_to_state, 'failed');
});

Deno.test('SKIPS an already-terminal run (executor already resolved it — no stomp)', async () => {
  for (const state of ['failed', 'completed', 'refunded']) {
    const { client, rpcCalls } = makeFakeClient({ state, merit_settled: state === 'completed', refunded: state === 'refunded' });
    const res = await terminalizeStuckRun({
      supabase: client,
      runId: `run-${state}`,
      userId: 'user-1',
      meritTransactionId: 'tx-1',
      failureCode: 'INPUT_MISSING',
      failureStage: 'worker_terminal_4xx',
    });
    assertEquals(res.skipped, true, `state=${state} must be skipped`);
    assertEquals(res.terminalized, false);
    assertEquals(rpcCalls.length, 0, `state=${state} must NOT call the CAS (no stomp)`);
  }
});

Deno.test('SKIPS a retryable_failed off-ramp (owned by executor retry / frontend Retry / reaper)', async () => {
  const { client, rpcCalls } = makeFakeClient({ state: 'retryable_failed', merit_settled: false, refunded: false });
  const res = await terminalizeStuckRun({
    supabase: client,
    runId: 'run-retryable',
    userId: 'user-1',
    meritTransactionId: 'tx-1',
    failureCode: 'INPUT_MISSING',
    failureStage: 'worker_terminal_4xx',
  });
  assertEquals(res.skipped, true);
  assertEquals(rpcCalls.length, 0);
});

Deno.test('SKIPS a legacy row (state:null) — nothing to terminalize via the CAS', async () => {
  const { client, rpcCalls } = makeFakeClient({ state: null, merit_settled: false, refunded: false });
  const res = await terminalizeStuckRun({
    supabase: client,
    runId: 'run-legacy',
    userId: 'user-1',
    meritTransactionId: null,
    failureCode: 'INPUT_MISSING',
    failureStage: 'worker_terminal_4xx',
  });
  assertEquals(res.skipped, true);
  assertEquals(rpcCalls.length, 0);
});

// ── REFUND TRUTH: the persisted `refunded` column follows the refund OUTCOME ──
//
// refundIsOnFile answers "does a refund exist ON FILE for this reservation?", which is the
// meaning of the analysis_jobs.refunded COLUMN. It is deliberately NOT the same value as
// TerminalizeStuckRunResult.refunded ("a reservation was released by THIS call"): the two
// diverge on the idempotent already_refunded path.

Deno.test('refundIsOnFile: a fresh successful refund is ON FILE -> refunded=true', () => {
  assertEquals(refundIsOnFile({ ok: true }), true);
});

Deno.test('refundIsOnFile: already_refunded is ON FILE -> refunded=true (the naive fix gets this wrong)', () => {
  // The local `refunded` (return contract: "released by THIS call") is FALSE here, because
  // this call released nothing — but the money IS refunded. So `patch.refunded = refunded`
  // would write false and wrongly re-open a settled row to the reaper backstop.
  assertEquals(refundIsOnFile({ ok: true, alreadyRefunded: true }), true);
});

Deno.test('refundIsOnFile: a genuine RPC failure is NOT on file -> refunded stays unset (backstop stays armed)', () => {
  assertEquals(refundIsOnFile({ ok: false, error: 'unknown_transaction' }), false);
  assertEquals(refundIsOnFile({ ok: false, error: 'user_not_found' }), false);
});

Deno.test('refundIsOnFile: no refund attempted (null verdict) is NOT on file', () => {
  assertEquals(refundIsOnFile(null), false);
});

// ── Static money-path guards (refundMeritsForJob resolves its own client) ─────

/** Read terminalize-stuck-run.ts with comments stripped, so guards match CODE only. */
function readStrippedSource(): string {
  const rawPath = new URL('./terminalize-stuck-run.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

Deno.test('money path: the CAS patch is gated on the refund OUTCOME, never on eligibility', () => {
  const src = readStrippedSource();

  assert(
    /refundIsOnFile\(\s*refundVerdict\s*\)/.test(src),
    'the CAS patch must be gated on the refund OUTCOME helper',
  );
  assert(
    !/if\s*\(\s*canRefund\s*\)\s*patch\.refunded/.test(src),
    'patch.refunded must NOT be gated on canRefund (eligibility != outcome)',
  );
  assert(
    !/patch\.refunded\s*=\s*refunded\b/.test(src),
    'patch.refunded must not reuse the return-contract variable (already_refunded would wrongly write false)',
  );
});

Deno.test('money path: a FAILED refund still falls through to the terminal CAS (log-and-continue, no hang)', () => {
  const src = readStrippedSource();
  const failIdx = src.indexOf('refund-failed');
  const casIdx = src.indexOf('transition_analysis_run');
  assert(failIdx !== -1, 'helper must log the refund-failed branch');
  assert(casIdx !== -1, 'helper must call transition_analysis_run');
  assert(failIdx < casIdx, 'a failed refund must still fall through to the terminal CAS (no hang)');
});

Deno.test('money path: refund runs BEFORE the terminal CAS and the CAS patch sets refunded', () => {
  const src = readStrippedSource();

  const refundIdx = src.indexOf('refundMeritsForJob(');
  const casIdx = src.indexOf("transition_analysis_run");
  assert(refundIdx !== -1, 'helper must call refundMeritsForJob');
  assert(casIdx !== -1, 'helper must call transition_analysis_run');
  assert(refundIdx < casIdx, 'refund must happen BEFORE the terminal CAS (pre-save money rule)');
  assert(/patch\.refunded\s*=\s*true/.test(src), 'the CAS patch must set refunded=true when a reservation was released');
  // Only a live, unsettled reservation is refunded (settle/refund CHECK + money rule).
  assert(/!settled\s*&&\s*!alreadyRefunded/.test(src), 'refund must be gated on !settled && !alreadyRefunded');
});
