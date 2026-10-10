/**
 * Quick task 260713-2ay — the suite that would have CAUGHT the LinkedIn first-attempt bug.
 *
 * THE BUG: `_shared/anthropic.ts` reports an AbortController timeout as **408**. The old
 * `invokeWithRetry` (inlined in grade-linkedin/index.ts) guarded with
 *
 *     if (status >= 400 && status < 500 && status !== 429) return lastResult;
 *
 * so a 408 was classified as a PERMANENT client error and the 3-attempt retry loop was
 * skipped entirely — on the single most transient failure mode there is. Free tier got a 50s
 * wall for a grade that genuinely takes 45-70s to generate, so the first click aborted,
 * refunded and 500'd; the user's "second click works" was them manually performing the retry
 * the server should have performed itself. Eight production refunds landed within half a
 * second of the exact 50 000 ms timeout value.
 *
 * Every assertion below is RED against the pre-fix behavior. Legs 1 and 4/5 are the
 * load-bearing pair: retrying a 408 is only SAFE because a single request-scoped deadline
 * bounds it (grade-linkedin runs TWO retry loops — the main call and a validation-failure
 * re-call — so an unbounded retry would be 3 x 90s x 2 = 540s).
 *
 * Deterministic: an injected fake invoke + fake clock + fake sleep. No live Anthropic, no DB,
 * no real timers.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeAiBackoffMs,
  invokeWithRetry,
  isRetryableAiStatus,
  MIN_ATTEMPT_MS,
} from '../../_shared/ai-retry.ts';
import type { AnthropicInvokeParams, AnthropicInvokeResult } from '../../_shared/anthropic.ts';
import type { Logger } from '../../_shared/logger.ts';

// ── Test harness: a fake clock, fake sleep, and a scriptable fake invoke ──────────────

const NOOP_LOG: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  timer: () => () => 0,
};

const BASE_PARAMS: AnthropicInvokeParams = {
  model: 'claude-haiku-4-5-20251001',
  messages: [{ role: 'user', content: 'grade this profile' }],
  maxTokens: 5000,
  timeoutMs: 90_000,
};

interface Harness {
  /** Every `timeoutMs` the helper actually passed to Anthropic, in attempt order. */
  seenTimeouts: number[];
  /** Every backoff the helper actually slept, in order. */
  sleeps: number[];
  callCount: () => number;
  elapsed: () => number;
  run: (opts?: { deadlineMs?: number; params?: Partial<AnthropicInvokeParams> }) => Promise<AnthropicInvokeResult>;
}

/**
 * @param script   one result per attempt (last entry repeats forever)
 * @param costMs   fake-clock time each attempt consumes before returning
 */
function harness(script: AnthropicInvokeResult[], costMs = 0, jitter = 0): Harness {
  let clock = 1_000_000; // arbitrary epoch-ms origin
  let calls = 0;
  const start = clock;
  const seenTimeouts: number[] = [];
  const sleeps: number[] = [];

  const invoke = (p: AnthropicInvokeParams): Promise<AnthropicInvokeResult> => {
    seenTimeouts.push(p.timeoutMs ?? -1);
    // A REAL Anthropic call cannot outlive the timeout it was handed — anthropic.ts wires an
    // AbortController and reports the abort as 408. So a faithful fake burns
    // min(work, timeoutMs), never more. This is not a detail: CLAMPING timeoutMs to the
    // remaining budget is *the mechanism* by which the total deadline is enforced. A fake that
    // ignored its timeout would let attempt 2 run the full 90s and blow the deadline — which
    // is exactly what a real un-clamped implementation would do.
    const attemptBudget = p.timeoutMs ?? costMs;
    clock += Math.min(costMs, attemptBudget);
    const result = script[Math.min(calls, script.length - 1)];
    calls++;
    return Promise.resolve(result);
  };

  const sleep = (ms: number): Promise<void> => {
    sleeps.push(ms);
    clock += ms;
    return Promise.resolve();
  };

  return {
    seenTimeouts,
    sleeps,
    callCount: () => calls,
    elapsed: () => clock - start,
    run: (opts = {}) =>
      invokeWithRetry(
        { ...BASE_PARAMS, ...(opts.params ?? {}) },
        NOOP_LOG,
        {
          deadlineAt: start + (opts.deadlineMs ?? 165_000),
          invoke,
          now: () => clock,
          sleep,
          random: () => jitter,
        },
      ),
  };
}

const ok = (text = '{"rawScore":72}'): AnthropicInvokeResult => ({ ok: true, text, raw: {}, model: 'haiku' });
const fail = (status: number, error = 'boom'): AnthropicInvokeResult => ({ ok: false, status, error });

// ── Leg 1: 408 IS RETRIED (THE regression that shipped) ───────────────────────────────

Deno.test('408 (the AbortController timeout) is RETRIED, not treated as a permanent 4xx', async () => {
  // Pre-fix, `408 >= 400 && < 500 && !== 429` short-circuited here and the helper returned a
  // FAILURE after exactly ONE call. That is the entire production bug, in one assertion.
  const h = harness([fail(408, 'Anthropic request timed out'), ok()]);
  const res = await h.run();

  assertEquals(res.ok, true, 'a timeout must be retried — it is the most transient error there is');
  assertEquals(h.callCount(), 2, 'the helper must make a SECOND attempt after a 408');
});

Deno.test('408 is in the retryable predicate (the guard that must never regress)', () => {
  assertEquals(isRetryableAiStatus(408), true, 'reintroducing the 408-is-permanent bug');
  assertEquals(isRetryableAiStatus(429), true);
  assertEquals(isRetryableAiStatus(500), true);
  assertEquals(isRetryableAiStatus(529), true);
});

Deno.test('an abort/timeout-shaped ERROR STRING is retried even without a 408 status', async () => {
  const h = harness([{ ok: false, status: 0, error: 'Anthropic request timed out' }, ok()]);
  const res = await h.run();
  assertEquals(res.ok, true);
  assertEquals(h.callCount(), 2);
});

// ── Leg 2: genuine client errors STILL short-circuit (the fix must not over-retry) ─────

for (const status of [400, 401, 403, 422]) {
  Deno.test(`a ${status} is NOT retried — exactly ONE model call (no 3x billing for a bad request)`, async () => {
    const h = harness([fail(status, 'invalid request'), ok()]);
    const res = await h.run();

    assertEquals(res.ok, false);
    assert(!res.ok && res.status === status);
    assertEquals(h.callCount(), 1, `a ${status} is permanent — retrying it just burns money`);
  });
}

// ── Leg 3: the deadline BOUNDS the retries (what makes 408-retryability safe) ──────────

Deno.test('retries stop at the total deadline — a 90s attempt cannot overrun a 100s budget', async () => {
  // Attempt 1 burns 90s of a 100s budget and 408s. Only ~10s remains — less than
  // MIN_ATTEMPT_MS — so the helper must STOP rather than fire an attempt it cannot finish.
  const h = harness([fail(408, 'Anthropic request timed out')], 90_000);
  const res = await h.run({ deadlineMs: 100_000 });

  assertEquals(res.ok, false);
  assert(h.callCount() <= 2, `expected at most 2 attempts inside the budget, got ${h.callCount()}`);
  assert(
    h.elapsed() <= 100_000,
    `the helper overran its deadline: ${h.elapsed()}ms elapsed vs a 100000ms budget`,
  );
});

Deno.test('an always-408 call cannot run away — total elapsed stays inside the 165s deadline', async () => {
  const h = harness([fail(408, 'Anthropic request timed out')], 90_000);
  await h.run({ deadlineMs: 165_000 });
  assert(
    h.elapsed() <= 165_000,
    `unbounded retry reintroduced: ${h.elapsed()}ms elapsed vs a 165000ms deadline`,
  );
});

Deno.test('the per-attempt timeout is CLAMPED to the remaining budget (attempt 2 gets less than 90s)', async () => {
  // Attempt 1 consumes 60s of a 120s budget. Attempt 2 must be clamped to what is actually
  // left — NOT handed a fresh 90s that would blow straight through the deadline.
  const h = harness([fail(408, 'Anthropic request timed out'), ok()], 60_000);
  await h.run({ deadlineMs: 120_000 });

  assertEquals(h.seenTimeouts[0], 90_000, 'attempt 1 gets the full per-call budget');

  const secondTimeout = h.seenTimeouts[1];
  assert(secondTimeout !== undefined, 'a second attempt must have been made');
  assert(secondTimeout < 90_000, `attempt 2 must be clamped below the per-call ceiling, got ${secondTimeout}`);
  // ~60s spent + a sub-second 408 backoff → strictly less than the ~59s remaining, minus 1s slack.
  assert(
    secondTimeout <= 120_000 - 60_000 - 1_000,
    `attempt 2 timeout (${secondTimeout}) must fit inside remaining - 1000ms`,
  );
});

Deno.test('a deadline already exhausted before ANY attempt returns 408 (so the Merit is still refunded)', async () => {
  // 408 keeps the give-up inside merit-gateway.isRefundableAnthropicError. Returning, say, a
  // 400 here would silently STOP refunding users on a genuine server give-up.
  const h = harness([ok()]);
  const res = await h.run({ deadlineMs: 1_000 }); // < MIN_ATTEMPT_MS

  assertEquals(res.ok, false);
  assert(!res.ok && res.status === 408, 'a give-up must stay inside the refundable taxonomy');
  assertEquals(h.callCount(), 0, 'no attempt should be fired with no budget left');
  assert(MIN_ATTEMPT_MS > 1_000);
});

// ── Leg 4: D4 — slower, jittered backoff rides out a short 529 overload window ─────────

Deno.test('a 529 backs off materially longer than a 408 does (D4: ride out overload, do not sleep through a timeout)', async () => {
  const busy = harness([fail(529, 'overloaded'), ok()], 0, 0);
  await busy.run();

  const timedOut = harness([fail(408, 'Anthropic request timed out'), ok()], 0, 0);
  await timedOut.run();

  assert(busy.sleeps[0] >= 2_000, `a 529 must back off >= 2s to ride out overload, got ${busy.sleeps[0]}ms`);
  assert(
    busy.sleeps[0] > timedOut.sleeps[0],
    `529 backoff (${busy.sleeps[0]}ms) must exceed 408 backoff (${timedOut.sleeps[0]}ms) — a 90s wall already ate the budget`,
  );
});

Deno.test('backoff is JITTERED (identical inputs, different jitter → different sleeps)', () => {
  const low = computeAiBackoffMs(529, 0, () => 0);
  const high = computeAiBackoffMs(529, 0, () => 0.99);
  assert(high > low, 'jitter must vary the backoff so retries do not thunder-herd');
  assert(computeAiBackoffMs(529, 1, () => 0) > computeAiBackoffMs(529, 0, () => 0), 'backoff must grow');
});

Deno.test('the helper never sleeps into the wall — no backoff when no post-sleep attempt could run', async () => {
  // Attempt 1 burns 90s of a 100s budget. ~10s remains — less than MIN_ATTEMPT_MS — so there is
  // no attempt left to back off FOR. Sleeping here would just burn the user's remaining budget.
  const h = harness([fail(529, 'overloaded')], 90_000);
  await h.run({ deadlineMs: 100_000 });

  const slept = h.sleeps.reduce((a, b) => a + b, 0);
  assertEquals(slept, 0, `slept ${slept}ms with no budget for a post-sleep attempt`);
  assert(h.elapsed() <= 100_000, `overran deadline: ${h.elapsed()}ms`);
});

Deno.test('a repeatedly-529 call stays inside the deadline even while backing off', async () => {
  const h = harness([fail(529, 'overloaded')], 60_000);
  await h.run({ deadlineMs: 165_000 });
  assert(
    h.elapsed() <= 165_000,
    `backoff + attempts overran the deadline: ${h.elapsed()}ms vs 165000ms`,
  );
});

// ── Leg 5: static source guard — the wiring in index.ts, not just the helper ───────────

function readIndexCode(): string {
  const rawPath = new URL('../index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  // CODE only — a doc comment naming a forbidden literal must not satisfy OR break the guard.
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

Deno.test('source: grade-linkedin imports the SHARED invokeWithRetry (no re-inlined local copy)', () => {
  const code = readIndexCode();
  assert(
    /import\s*\{\s*invokeWithRetry\s*\}\s*from\s*'\.\.\/_shared\/ai-retry\.ts'/.test(code),
    'invokeWithRetry must come from the shared, unit-testable module',
  );
  assert(
    !/async\s+function\s+invokeWithRetry/.test(code),
    'a local invokeWithRetry was re-inlined — it cannot be unit-tested (index.ts calls serve() at import)',
  );
});

Deno.test('source: BOTH of runTieredAiCall\'s retry loops share the SAME deadline (the validation-retry gets no fresh budget)', () => {
  const code = readIndexCode();
  const start = code.indexOf('async function runTieredAiCall');
  assert(start > -1, 'runTieredAiCall must exist');
  const body = code.slice(start, code.indexOf('serve((req)', start));

  const callSites = body.match(/invokeWithRetry\([^)]*\)/g) ?? [];
  assertEquals(callSites.length, 2, 'runTieredAiCall fires TWO retry loops (main + validation-retry)');
  for (const site of callSites) {
    assert(
      site.includes('deadlineAt'),
      `every invokeWithRetry in runTieredAiCall must be deadline-bounded, missing in: ${site}`,
    );
  }
  // The deadline is computed ONCE per request, not once per loop.
  assert(
    /const deadlineAt = Date\.now\(\) \+ LINKEDIN_TOTAL_DEADLINE_MS/.test(code),
    'the deadline must be request-scoped (computed once in the handler), not per-loop',
  );
});

Deno.test('source: the LinkedIn timeout resolves from getTimeout(tier, linkedin) — no hardcoded walls', () => {
  const code = readIndexCode();
  assert(code.includes("getTimeout(tier, 'linkedin')"), 'live path must use the linkedin CallType');
  assert(code.includes("getTimeout(resolvedTier, 'linkedin')"), 'legacy path must use it too');
  // The 50s / 60s walls that sat INSIDE the real 45-70s generation band are gone.
  assertEquals(code.includes('timeoutMs: 60000'), false, 'a hardcoded 60s wall was reintroduced');
  assertEquals(code.includes('timeoutMs: 50000'), false, 'a hardcoded 50s wall was reintroduced');
});
