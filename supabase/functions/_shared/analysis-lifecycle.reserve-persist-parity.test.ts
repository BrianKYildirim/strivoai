/**
 * Quick 260724-4cc — D9-08 reserve-persist PARITY guard (both lifecycle twins).
 *
 * The D9-08 fix ("persist the reserved merit_transaction_id in the SAME transition that
 * leaves reserving_merits, so a worker death in any reaper-terminalized state leaves the
 * reaper a handle it can release") was originally applied to only ONE of the two twins:
 * `_shared/analysis-lifecycle.ts` (the executor). The streaming twin,
 * `analyze-resume/index.ts` runResumeStreamingLifecycle, made the identical transition with
 * an EMPTY patch — and streaming is the path Resume Free actually takes, so the money leak
 * stayed open on the busiest route. The pre-existing guard
 * (analysis-lifecycle.refund-boundary.test.ts:91-110) reads only the `_shared` twin, which is
 * exactly why the drift went unnoticed.
 *
 * This guard is a STATIC source check driven by an explicit twin table, so a future third
 * twin is a one-line addition. It also asserts the NEGATIVE cases on the streaming twin: the
 * cache-hit short-circuit (reserving_merits -> completed) and the MERIT_RESERVATION_FAILED
 * branch (reserving_merits -> failed) must NOT carry merit_transaction_id, because NO
 * reservation exists on either path — writing one would persist a bogus handle the reaper
 * would then try to refund.
 *
 * Approach mirrors analysis-lifecycle.refund-boundary.test.ts (Windows leading-slash idiom +
 * comment stripping) so prose can neither satisfy nor invalidate the guard.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function readCode(relativeUrl: string): string {
  const rawPath = new URL(relativeUrl, import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  const src = Deno.readTextFileSync(path);
  // Strip block comments, then drop whole-line `//` comments — operate on code only.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/**
 * Slice the SINGLE transition call that starts at `token` — from the token to the first
 * `);` that closes the call. Strictly tighter than a fixed character window, so a match can
 * only come from THIS call's patch and never bleed into the next statement.
 */
function callWindow(code: string, token: string): string | null {
  const start = code.indexOf(token);
  if (start === -1) return null;
  const end = code.indexOf(');', start);
  if (end === -1) return null;
  return code.slice(start, end + 2);
}

const LEAVE_RESERVING = "'reserving_merits', 'extracting_data'";
const CACHE_HIT = "'reserving_merits', 'completed'";
const RESERVATION_FAILED = "'reserving_merits', 'failed'";

const TWINS: Array<{ label: string; url: string }> = [
  { label: '_shared/analysis-lifecycle.ts (executor twin)', url: './analysis-lifecycle.ts' },
  { label: 'analyze-resume/index.ts (streaming twin)', url: '../analyze-resume/index.ts' },
];

for (const twin of TWINS) {
  Deno.test(`reserve-persist parity: ${twin.label} persists merit_transaction_id leaving reserving_merits (D9-08)`, () => {
    const code = readCode(twin.url);

    const leaveReserving = code.indexOf(LEAVE_RESERVING);
    assert(
      leaveReserving !== -1,
      `${twin.label}: the reserving_merits -> extracting_data transition must exist`,
    );

    const window = callWindow(code, LEAVE_RESERVING);
    assert(window !== null, `${twin.label}: could not slice the transition call`);
    assert(
      window.length <= 200,
      `${twin.label}: the transition call should be a compact patch (<=200 chars), got ${window.length}`,
    );
    assert(
      /merit_transaction_id:\s*transactionId/.test(window),
      `${twin.label}: leaving reserving_merits must persist { merit_transaction_id: transactionId } ` +
        'so a worker death in a later state leaves the reaper a row it can refund (D9-08)',
    );

    // Non-vacuity: the id can only be persisted AFTER withMerits yields the reservation.
    const reserveIdx = code.indexOf('gated.transactionId');
    assert(
      reserveIdx !== -1 && reserveIdx < leaveReserving,
      `${twin.label}: merit_transaction_id can only be persisted after withMerits yields the reservation id`,
    );
  });
}

Deno.test('reserve-persist parity: the streaming cache-hit branch persists NO merit_transaction_id', () => {
  const code = readCode('../analyze-resume/index.ts');
  const window = callWindow(code, CACHE_HIT);
  assert(window !== null, 'the reserving_merits -> completed (cache-hit) transition must exist');
  assert(
    !window.includes('merit_transaction_id'),
    'the cache-hit short-circuit reserved NO Merit (gated.transactionId is the "cache-hit" sentinel); ' +
      'persisting a handle there would give the reaper a bogus id to refund',
  );
});

Deno.test('reserve-persist parity: the streaming MERIT_RESERVATION_FAILED branch persists NO merit_transaction_id', () => {
  const code = readCode('../analyze-resume/index.ts');
  const window = callWindow(code, RESERVATION_FAILED);
  assert(window !== null, 'the reserving_merits -> failed transition must exist');
  assert(
    !window.includes('merit_transaction_id'),
    'no deduction was made on the reservation-failed branch; its patch stays { failure_code, failure_stage } only',
  );
  // Non-vacuity: prove the slice really is that branch's patch.
  assert(
    window.includes('MERIT_RESERVATION_FAILED'),
    'the sliced call must be the MERIT_RESERVATION_FAILED branch',
  );
});
