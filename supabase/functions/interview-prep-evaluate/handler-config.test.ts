// Phase 05 Plan 04 Task 3 — interview-prep-evaluate handler-config source-read (Pattern A).
//
// interview-prep-evaluate/index.ts uses an inline, un-exported `serve(async (req) => ...)`
// (index.ts ~line 59) → it is NOT handler-invocable offline (RESEARCH testability matrix).
// This is a D-03 opt-in must-cover function, so coverage is a Pattern A source-read that
// characterizes its ACTUAL CURRENT auth + ownership + tier-gate + question_order-join
// wiring — characterization, NOT a refactor and NOT a behavior change. (Its three live-DB
// colocated tests under __tests__/evaluate.*.test.ts skip gracefully offline and are
// registered alongside this file on the same test:ci gate.)
//
// Threat focus (T-05-16):
//   - requireAuth(type:'user') is the identity source; body.userId is never an auth input.
//   - the ownership check (.eq('id', quizId).eq('user_id', userId)) fires BEFORE the
//     widened tier gate so a cross-user request cannot leak 'elite_or_elite_taste_required'
//     (T-23-EVAL-03 Information Disclosure).
//   - the evaluator joins scores back via an INTEGER question_order
//     (parseInt(question_id,10) -> .eq('question_order', ...)), never a free-text content
//     join (T-23-EVAL-01 prompt-injection vector).
//
// Static source analysis: reads index.ts and asserts on its contents — no Supabase / Anthropic
// mock, no handler invocation (the function has no exported handler).
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path (same form as grade-linkedin analog).
const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

// ── Auth wiring (T-05-16) ───────────────────────────────────────────────────

Deno.test('evaluate: authenticates via requireAuth(type:user), not requireInternalOrUserAuth', () => {
  assertEquals(source.includes('requireAuth'), true);
  assertEquals(source.includes('requireInternalOrUserAuth'), false);
  const hasUserAuthCall =
    source.includes("requireAuth(req, { type: 'user' })") ||
    source.includes('requireAuth(req, { type: "user" })');
  assertEquals(hasUserAuthCall, true);
});

Deno.test('evaluate: identity comes from userContext.userId, not the request body', () => {
  assertEquals(source.includes('const userId = userContext.userId'), true);
  // body.userId / body['userId'] must never be an auth source.
  assertEquals(source.includes('body.userId'), false);
  assertEquals(source.includes("body['userId']"), false);
});

// ── No-merit characterization (D-14: evaluate is 0-Merit) ─────────────────────

Deno.test('evaluate: charges NO merits (the 5-Merit cost was at quiz generation time, D-14)', () => {
  // NOTE: index.ts line 14 contains the DOCUMENTATION comment
  // "// NOTE: No import of withMerits or MERIT_SYSTEM_ENABLED." so the bare substrings
  // `withMerits` / `MERIT_SYSTEM_ENABLED` ARE present as prose — a blanket
  // !source.includes(...) would be a false RED (same class as 05-03's rawBody.userId-in-a-comment).
  // Scope to the ACTUAL wiring instead: no merit-gateway IMPORT and no withMerits( CALL.
  assertEquals(/import [\s\S]*from ['"]\.\.\/_shared\/merit-gateway\.ts['"]/.test(source), false);
  assertEquals(source.includes('withMerits('), false);
  // The flag is never branched on (only mentioned in the explanatory comment).
  assertEquals(source.includes('if (MERIT_SYSTEM_ENABLED'), false);
});

// ── Ownership check fires BEFORE the tier gate (T-23-EVAL-03, no leak) ─────────

Deno.test('evaluate: quiz lookup is ownership-scoped (.eq id + .eq user_id)', () => {
  assertEquals(source.includes(".from('interview_quizzes')"), true);
  assertEquals(source.includes(".eq('id', quizId)"), true);
  // Ownership enforced in application code (service-role bypasses RLS).
  assertEquals(source.includes(".eq('user_id', userId)"), true);
});

Deno.test('evaluate: the ownership check precedes the canEvaluate tier gate (no cross-user tier leak)', () => {
  const ownershipIdx = source.indexOf(".eq('user_id', userId)");
  const canEvaluateIdx = source.indexOf('const canEvaluate');
  assertEquals(ownershipIdx > -1, true);
  assertEquals(canEvaluateIdx > -1, true);
  // The not-found / forbidden response on ownership failure must appear before the tier gate.
  const notFoundIdx = source.indexOf("error: 'not_found'");
  assertEquals(notFoundIdx > -1, true);
  assertEquals(
    ownershipIdx < canEvaluateIdx && notFoundIdx < canEvaluateIdx,
    true,
  );
});

// ── Widened canEvaluate tier gate (Phase 23 D-02/D-05) ────────────────────────

Deno.test('evaluate: canEvaluate = elite OR (pro AND quiz.tier === elite_taste)', () => {
  assertEquals(source.includes('const canEvaluate'), true);
  assertEquals(source.includes("userContext.tier === 'elite'"), true);
  assertEquals(source.includes("userContext.tier === 'pro'"), true);
  assertEquals(source.includes("quiz.tier === 'elite_taste'"), true);
  // Rejection uses the unified code; ownership already fired so this cannot leak cross-user.
  assertEquals(source.includes("error: 'elite_or_elite_taste_required'"), true);
});

// ── Integer question_order join, not free-text (T-23-EVAL-01) ─────────────────

Deno.test('evaluate: scores are joined back via the INTEGER question_order, not free-text content', () => {
  assertEquals(source.includes('parseInt(scoreEntry.question_id, 10)'), true);
  assertEquals(source.includes(".eq('question_order', questionOrder)"), true);
  // The original questions are fetched/ordered by the same integer column.
  assertEquals(source.includes(".from('interview_quiz_answers')"), true);
  assertEquals(source.includes("question_order"), true);
});

// ── Re-evaluation guard + quiz-mode guard (defensive contract) ────────────────

Deno.test('evaluate: rejects re-evaluation (409) and non-quiz modes (400)', () => {
  assertEquals(source.includes('already_evaluated'), true);
  assertEquals(source.includes("quiz.mode !== 'quiz'"), true);
  assertEquals(source.includes('invalid_mode'), true);
});

// ── Rate limit + model/cap wiring ─────────────────────────────────────────────

Deno.test('evaluate: per-tier rate limit keyed interview-prep-evaluate; elite-only AI budget', () => {
  assertEquals(source.includes("key: 'interview-prep-evaluate'"), true);
  assertEquals(source.includes("getModel('elite', 'interview')"), true);
  assertEquals(source.includes("getMaxOutput('interviewPrepCoach', 'elite')"), true);
});
