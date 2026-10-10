/**
 * Phase 03 · 03-04 · Pitfall 2 / Pitfall 3 — static refund-boundary drift guard.
 *
 * The point-of-no-return invariant (T-03-10 / T-03-11): once the executor issues
 * the `saving -> completed` CAS (a verified durable write), it must NEVER refund
 * or throw MeritRefundable — the Merit is legitimately settled. This static-source
 * guard reads analysis-lifecycle.ts as TEXT, slices from the first
 * `'saving', 'completed'` transition to end-of-file, and asserts the slice
 * contains NEITHER `refundMeritsForJob` NOR `throw new MeritRefundable`. It also
 * asserts `merit_settled` appears ONLY after a `saving` transition token (settle
 * is gated on the save — Pitfall 3).
 *
 * Approach mirrors cors-audit.test.ts:43-77 (Windows leading-slash idiom) +
 * process-resume-analysis-job/__tests__/refund-on-failure.test.ts (static slice).
 * Comment lines are stripped first (operate on CODE, not prose) so a doc comment
 * mentioning the forbidden tokens cannot self-invalidate the guard.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
// Keep the production onboarding timeout/refund budget in the existing lifecycle gate.
import '../analyze-resume/__tests__/onboarding-timeout-budget.test.ts';

function readCode(): string {
  const rawPath = new URL('./analysis-lifecycle.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  const src = Deno.readTextFileSync(path);
  // Strip block comments, then drop whole-line `//` comments — operate on code only.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const SAVING_COMPLETED = "'saving', 'completed'";

Deno.test('refund-boundary: the saving -> completed transition exists in code', () => {
  const code = readCode();
  assert(code.includes(SAVING_COMPLETED), "executor must contain the saving -> completed CAS");
});

Deno.test('refund-boundary: NO refundMeritsForJob after saving -> completed (Pitfall 2)', () => {
  const code = readCode();
  const idx = code.indexOf(SAVING_COMPLETED);
  const postSaving = code.slice(idx);
  assert(
    !postSaving.includes('refundMeritsForJob'),
    'refundMeritsForJob must be lexically unreachable after the saving -> completed transition',
  );
});

Deno.test('refund-boundary: NO throw MeritRefundable after saving -> completed (Pitfall 2)', () => {
  const code = readCode();
  const idx = code.indexOf(SAVING_COMPLETED);
  const postSaving = code.slice(idx);
  assert(
    !/throw\s+new\s+MeritRefundable/.test(postSaving),
    'the executor must never throw MeritRefundable after the point of no return',
  );
});

Deno.test('refund-boundary: merit_settled appears ONLY after a saving transition token (Pitfall 3)', () => {
  const code = readCode();
  const firstSaving = code.indexOf("'saving'");
  const settleIdx = code.indexOf('merit_settled');
  assert(firstSaving !== -1, 'a saving transition token must exist');
  assert(settleIdx !== -1, 'merit_settled must be set somewhere (settle-on-saved)');
  assert(
    settleIdx > firstSaving,
    'settle (merit_settled) must appear only after a saving transition (never settle-before-save)',
  );
});

Deno.test('refund-boundary: a failed refund RPC is never recorded as refunded', () => {
  const code = readCode();
  assert(
    /const\s+refund\s*=\s*await\s+refundMeritsForJob/.test(code),
    'the lifecycle must observe the refund RPC result',
  );
  assert(
    /refunded:\s*refund\.ok/.test(code),
    'refunded must reflect the RPC result so the stale-run backstop can retry a failure',
  );
});

// D9-08: the reserved Merit transaction id must be PERSISTED onto the run before the worker
// can die in a reaper-terminalized state. withMerits returns it only in-process; if it is not
// written to the row, a stuck lifecycle run is terminalized to `failed` with merit_transaction_id
// NULL, the reaper's hasMerit gate is false, and the reservation is NEVER released — a live money
// leak under MERIT_SYSTEM_ENABLED. This guard asserts the id is persisted in the SAME transition
// that leaves reserving_merits, and that it happens AFTER the reservation exists.
Deno.test('reaper-recovery: the reserved merit_transaction_id is persisted leaving reserving_merits (D9-08)', () => {
  const code = readCode();
  const leaveReserving = code.indexOf("'reserving_merits', 'extracting_data'");
  assert(
    leaveReserving !== -1,
    'the reserving_merits -> extracting_data transition must exist',
  );
  // The same transition call must carry merit_transaction_id in its patch, bound to the
  // in-process transactionId from withMerits (not a literal, not some other field).
  const window = code.slice(leaveReserving, leaveReserving + 200);
  assert(
    /merit_transaction_id:\s*transactionId/.test(window),
    'leaving reserving_merits must persist { merit_transaction_id: transactionId } so a ' +
      'worker death in a later state leaves the reaper a row it can refund (D9-08)',
  );
  // Non-vacuity: the persistence must come AFTER the reservation is obtained, never before.
  const reserveIdx = code.indexOf('gated.transactionId');
  assert(reserveIdx !== -1 && reserveIdx < leaveReserving,
    'merit_transaction_id can only be persisted after withMerits yields the reservation id');
});
