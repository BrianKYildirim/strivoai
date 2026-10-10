// Phase 05 Plan 03 (Task 1) — recruiting-lens handler-config source-read coverage.
// Pattern A (source-read substring assertion; analog: grade-linkedin/handler-config.test.ts).
// recruiting-lens exposes `export async function handler(req)` with an IS_TEST-guarded serve
// (07.1-03 named-handler seam, index.ts ~441/~776). This characterizes its ACTUAL auth + merit +
// model-config + tier + the RUN-04 auth-Response-guard wiring by reading index.ts as text. The
// runtime 401-guard BEHAVIOR test lives in __tests__/auth-rethrow.test.ts (OFF the test:ci gate -
// isolation-only; it perturbs the shared deno-test process, see that file's header). Zero secrets
// embedded; substring assertions only (threat T-05-05). Asserts CURRENT behavior (T-05-06).
//
// std@0.168.0 chosen to match the grade-linkedin analog this replicates (do not modernize —
// two std-assert versions coexist in-repo; match the neighbor).

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path.
const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

// ── Auth (BE-04): JWT user auth, no body.userId bypass ──────────────────────────

Deno.test('recruiting-lens: imports requireAuth (not requireInternalOrUserAuth)', () => {
  assertEquals(source.includes('requireAuth'), true);
  // recruiting-lens is a user-facing Elite feature — must NOT accept the internal worker secret.
  assertEquals(source.includes('requireInternalOrUserAuth'), false);
});

Deno.test('recruiting-lens: calls requireAuth with type user', () => {
  const hasUserAuthCall =
    source.includes("requireAuth(req, { type: 'user' })") ||
    source.includes('requireAuth(req, { type: "user" })');
  assertEquals(hasUserAuthCall, true);
});

Deno.test('recruiting-lens: does not use body.userId for authentication', () => {
  // Identity must come from the JWT (userContext.userId), never the request body.
  assertEquals(source.includes('body.userId'), false);
  assertEquals(source.includes("body['userId']"), false);
  // The user identity flows from the auth helper, not the parsed body.
  assertEquals(source.includes('userContext!.userId'), true);
});

// ── Tier gating (BE-04): Free tier rejected; Elite-only feature ─────────────────

Deno.test('recruiting-lens: rejects the Free tier with a 403 elite_required gate', () => {
  assertEquals(source.includes("userContext!.tier === 'free'"), true);
  assertEquals(source.includes('elite_required'), true);
  assertEquals(source.includes('status: 403'), true);
});

// ── Merit gateway: ACTUAL state — withMerits behind the legacy MERIT_SYSTEM_ENABLED gate ──

Deno.test('recruiting-lens: wires withMerits for the recruiting_lens action', () => {
  assertEquals(source.includes('withMerits'), true);
  const hasRecruitingLensAction =
    source.includes("'recruiting_lens'") || source.includes('"recruiting_lens"');
  assertEquals(hasRecruitingLensAction, true);
});

Deno.test('recruiting-lens: merit branch sits behind the legacy MERIT_SYSTEM_ENABLED && userContext gate', () => {
  // ACTUAL-state characterization (RESEARCH State-of-the-Art): per-handler merit wiring is
  // NOT uniform. recruiting-lens still carries the legacy flag-gated branch.
  assertEquals(source.includes('MERIT_SYSTEM_ENABLED && userContext'), true);
});

Deno.test('recruiting-lens: classifies AI/persist failures as MeritRefundable', () => {
  assertEquals(source.includes('MeritRefundable'), true);
});

// ── Merger wiring: parallel-call merge seam (deepens _shared/recruiting-lens-merger.test.ts) ──

Deno.test('recruiting-lens: invokes the recruiting-lens merger on the parallel-call results', () => {
  assertEquals(source.includes('mergeRecruitingLensResults'), true);
  // The 3-call parallel fan-out the merger consumes.
  assertEquals(source.includes('executeParallelCalls'), true);
});

// ── Model / central-cap wiring (quick task 260608-p5k): per-tier output + input ceilings ──

Deno.test('recruiting-lens: derives the model from getModel (recruiting feature)', () => {
  const hasGetModel =
    source.includes("getModel(resolvedTier as Tier, 'recruiting')") ||
    source.includes('getModel(resolvedTier as Tier, "recruiting")');
  assertEquals(hasGetModel, true);
});

Deno.test('recruiting-lens: derives the per-tier output cap from getMaxOutput, not a hardcoded literal', () => {
  assertEquals(source.includes("getMaxOutput('recruitingLens', 'pro')"), true);
  assertEquals(source.includes("getMaxOutput('recruitingLens', 'elite')"), true);
});

Deno.test('recruiting-lens: enforces the per-tier input cap via getMaxInputChars', () => {
  assertEquals(source.includes("getMaxInputChars('recruitingLens'"), true);
});

Deno.test('recruiting-lens: derives the per-tier timeout from getTimeout', () => {
  assertEquals(source.includes('getTimeout(tier as Tier)'), true);
});

// ── Rate limit + failure/error branches ─────────────────────────────────────────

Deno.test('recruiting-lens: wires the per-tier rate limiter', () => {
  assertEquals(source.includes('checkRateLimit'), true);
  assertEquals(source.includes("key: 'recruiting-lens'"), true);
});

Deno.test('recruiting-lens: has the unhandled-error catch returning a 500 internal_error', () => {
  assertEquals(source.includes('internal_error'), true);
  // IN-02: standardized structured-log event key across all three functions.
  assertEquals(source.includes("log.error('unhandled-error'"), true);
});

// ── RUN-04 / RUN-05 (07.1-03): auth-Response re-throw guard + named-handler seam ──────────────
// In-gate static coverage of the 07.1-03 fix (the runtime behavior test is off-gate, see header).

Deno.test('recruiting-lens: re-throws a thrown auth Response (RUN-04 guard, named-handler return idiom)', () => {
  // The auth-failure branch returns the thrown Response so a 401 reaches the frozen
  // {error:'Unauthorized'} contract instead of being swallowed into a 500.
  assertEquals(source.includes('if (err instanceof Response) return err'), true);
});

Deno.test('recruiting-lens: exposes a named handler with an IS_TEST-guarded serve (07.1-03 seam)', () => {
  assertEquals(source.includes('export async function handler'), true);
  assertEquals(source.includes('serve(handler)'), true);
  assertEquals(source.includes("(Deno.env.get('IS_TEST') ?? '').toLowerCase() !== 'true'"), true);
});

Deno.test('recruiting-lens: emits errorCode in the unhandled-error log + 500 body, no error.message body leak (RUN-05)', () => {
  // WR-02: the canonical code is pinned to a single source of truth (`const ERR = 'internal_error'`)
  // and both `error` and `errorCode` reference it, so they cannot silently diverge.
  assertEquals(source.includes("const ERR = 'internal_error'"), true);
  assertEquals(source.includes('errorCode: ERR'), true);
  assertEquals(source.includes('error: ERR'), true);
  // recruiting-lens never leaked err.message into the body; assert the safe shape stays leak-free.
  assertEquals(source.includes('error instanceof Error ? error.message'), false);
});
