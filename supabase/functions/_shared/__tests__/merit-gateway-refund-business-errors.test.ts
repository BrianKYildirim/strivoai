/**
 * Quick 260724-4cc — refundMeritsForJob must fail closed on refund_merits BUSINESS errors.
 *
 * `refundMeritsForJob` previously special-cased exactly ONE of the RPC's three business
 * errors. `unknown_transaction` and `user_not_found` fell through to the SUCCESS log and
 * `return { ok: true }`, so `analysis-lifecycle.ts` could persist `refunded: true` with NO
 * ledger refund behind it — corrupting the REFUND TRUTH signal that the Phase 02 handoff
 * names as a blocking constraint. A false `refunded=true` is not self-healing: it makes the
 * row ineligible for the idempotent stale-run backstop, permanently stranding the Merit.
 *
 * There is no fetch-stub harness for the merit-gateway helpers (see the header note in
 * merit-gateway-already-refunded.test.ts), so the branch logic lives in the pure exported
 * `classifyRefundRpcResult` and is tested BEHAVIORALLY here, with two source greps proving
 * the pure helper is actually wired into refundMeritsForJob (not tested in isolation while
 * production keeps its own copy of the logic).
 *
 * RPC error vocabulary per 20260723000002_merit_refund_aware_idempotency.sql:
 * already_refunded (idempotent, refund IS on file) / unknown_transaction / user_not_found.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyRefundRpcResult } from '../merit-gateway.ts';

// ── Success shapes: unchanged behavior ───────────────────────────────────────

Deno.test('classifyRefundRpcResult: a success object is ok with no alreadyRefunded flag', () => {
  const v = classifyRefundRpcResult({ refunded: 3, balance: 10 });
  assertEquals(v.ok, true);
  assert(!(v as { alreadyRefunded?: boolean }).alreadyRefunded, 'a fresh refund is not "already refunded"');
});

Deno.test('classifyRefundRpcResult: null / undefined (historical bare-success shape) is ok', () => {
  assertEquals(classifyRefundRpcResult(null), { ok: true });
  assertEquals(classifyRefundRpcResult(undefined), { ok: true });
});

// ── Idempotent path: unchanged behavior ──────────────────────────────────────

Deno.test('classifyRefundRpcResult: already_refunded stays ok with alreadyRefunded: true (D-02 idempotency)', () => {
  assertEquals(classifyRefundRpcResult({ error: 'already_refunded' }), {
    ok: true,
    alreadyRefunded: true,
  });
});

// ── Business errors: the fix. RED before quick 260724-4cc. ───────────────────

Deno.test('classifyRefundRpcResult: unknown_transaction fails CLOSED (no refund happened)', () => {
  assertEquals(classifyRefundRpcResult({ error: 'unknown_transaction' }), {
    ok: false,
    error: 'unknown_transaction',
  });
});

Deno.test('classifyRefundRpcResult: user_not_found fails CLOSED (no refund happened)', () => {
  assertEquals(classifyRefundRpcResult({ error: 'user_not_found' }), {
    ok: false,
    error: 'user_not_found',
  });
});

Deno.test('classifyRefundRpcResult: an UNRECOGNIZED error code fails closed (default-deny, non-vacuity)', () => {
  const v = classifyRefundRpcResult({ error: 'some_future_code' });
  assertEquals(v.ok, false, 'a future RPC error must never be reported as a completed refund');
  assertEquals((v as { error: string }).error, 'some_future_code');
});

// ── Wiring guards: the pure helper must be the one production uses ───────────

function readGatewaySource(): string {
  const rawPath = new URL('../merit-gateway.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

Deno.test('wiring: refundMeritsForJob classifies the RPC body via classifyRefundRpcResult', () => {
  const code = readGatewaySource();
  assert(
    /classifyRefundRpcResult\(data\)/.test(code),
    'refundMeritsForJob must delegate to the tested pure classifier, not keep a private copy',
  );
});

Deno.test('wiring: the transport-error branch still fails closed', () => {
  const code = readGatewaySource();
  assert(
    /return\s*\{\s*ok:\s*false,\s*error:\s*error\.message\s*\}/.test(code),
    'a transport-level RPC error must still return ok:false',
  );
});
