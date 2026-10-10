/**
 * Phase 02 · gap-closure · WR-01 + WR-03 guard (SEC-13 / SEC-14) — merit-gateway
 * replay-refund suppression + transaction_id null-guard.
 *
 * WR-01 (MED, money-path): on an idempotency replay the deduct RPC returns
 * `already_deducted:true` with the ORIGINAL transaction's id. `withMerits` still runs
 * `fn(transactionId)`; if that callback throws a refundable error, the pre-fix catch ran
 * the refund path UNCONDITIONALLY (`if (refundable)`) and called `refund_merits` against
 * the ORIGINAL transaction — reversing a legitimate prior deduction for an already-
 * delivered analysis (double benefit). Latent today (no caller threads a key), but a live
 * BLOCKER the moment Phase 3 (03-02, LIFE-05) threads the key. The fix runs the refund
 * ONLY when THIS invocation performed the deduction (`refundable && !alreadyDeducted`); on
 * a replay hit it logs `merit-replay-callback-failed-no-refund` and does NOT refund.
 *
 * WR-03 (LOW-MED, money-path-adjacent): `const transactionId: string = (data as any)
 * .transaction_id;` had no null-guard — a malformed successful RPC response (schema drift /
 * partial response) would pass `undefined` into `fn()` / `refund_merits`. The error-or-no-
 * data guard above only catches RPC errors + null data. The fix fails closed with a generic
 * `merit_system_error` (no leak) when `transaction_id` is absent on a success.
 *
 * Guard class: STATIC-SOURCE (Class B, modeled on `merit-gateway.idempotency-forward.test.ts`
 * (A) + `cors-audit.test.ts`, incl. the Windows leading-slash path idiom). Isolation-safe
 * (no handler import, no runtime I/O — Pitfall 6). The frozen MeritGatewayResult shape + wire
 * bodies (genericError / insufficientMerits / tierLocked) are asserted preserved.
 *
 * Fail-before/pass-after: the pre-fix source has an unconditional `if (refundable) {`, no
 * replay no-refund branch, and no transaction_id null-guard → RED; post-fix → GREEN.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path (cors-audit.test.ts idiom).
const rawPath = new URL('./merit-gateway.ts', import.meta.url).pathname;
const GATEWAY_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(GATEWAY_PATH);

// ── WR-01 — refund suppressed on the already_deducted replay branch ──────────

Deno.test('WR-01: the refund path runs ONLY when this invocation deducted (refundable && !alreadyDeducted)', () => {
  // The load-bearing fail-before/pass-after discriminator: the pre-fix source guarded the
  // refund on the unconditional `if (refundable)`. The fix conjoins `!alreadyDeducted`.
  assertEquals(source.includes('if (refundable && !alreadyDeducted)'), true);
});

Deno.test('WR-01: a refundable callback failure on the replay branch logs no-refund instead of reversing the original deduction', () => {
  // On already_deducted:true, THIS call did not deduct — the original did (and succeeded).
  // Refunding transactionId would reverse a legitimate deduction. The replay branch must
  // log-only (no refund_merits).
  assertEquals(source.includes('merit-replay-callback-failed-no-refund'), true);
  assert(
    source.includes('refundable && alreadyDeducted'),
    'the replay branch must be explicitly keyed on refundable && alreadyDeducted',
  );
});

// ── WR-03 — transaction_id null-guard on a malformed successful RPC response ──

Deno.test('WR-03: a success response missing transaction_id fails closed (no undefined into fn/refund_merits)', () => {
  assertEquals(source.includes('if (!transactionId)'), true);
  assertEquals(source.includes("log.error('check_and_deduct_merits returned no transaction_id'"), true);
});

// ── KEEP — frozen shape + wire bodies + refund capability preserved ──────────

Deno.test('WR-01/03 [KEEP]: alreadyDeducted is still derived from already_deducted === true', () => {
  // The replay detection seam (02-05 Fix 1) is unchanged — WR-01 reuses it for the refund gate.
  assertEquals(source.includes("const alreadyDeducted = (data as any).already_deducted === true;"), true);
});

Deno.test('WR-01/03 [KEEP]: refund capability + frozen merit_system_error wire body preserved', () => {
  // The gateway still OWNS refund control flow (D-03) — refund_merits is retained, only its
  // gate changed. The generic merit_system_error body (reused by the new null-guard) is frozen.
  assert(source.includes("supabase.rpc('refund_merits'"), 'refund_merits must be preserved');
  assert(source.includes("genericError(500, 'merit_system_error', ctx.corsType)"), 'frozen wire body preserved');
});
