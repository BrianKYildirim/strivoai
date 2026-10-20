/**
 * Phase 23 Plan 04 Task 2 — SC-6 server-side 500-char reject.
 *
 * Behavior under test (from 23-04-PLAN.md):
 *   - Elite user submits answer of exactly 500 chars → accepted, slice is a no-op
 *   - Elite user submits answer of 501 chars → request processed; persisted answer_text = 500 chars
 *   - Elite user submits answer of 800 chars → persisted answer_text = 500 chars
 *
 * Threat T-23-SRV-02: client cannot bypass the 500-char limit by submitting a 10KB answer.
 * The handler at `../index.ts` slices `a.answer_text = a.answer_text.slice(0, 500)` unconditionally
 * inside the validation loop (preserved verbatim from Phase 19 lines 118-134).
 *
 * Mode: LIVE-DB integration. Requires a deployed `interview-prep-evaluate` function reachable at
 * `${SUPABASE_URL}/functions/v1/interview-prep-evaluate` AND a pre-seeded Elite-owned quiz with
 * `mode='quiz'`, `evaluated_at IS NULL`, and at least one `interview_quiz_answers` row.
 *
 * Required env:
 *   SUPABASE_URL                 — project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service key for post-call row inspection
 *   TEST_ELITE_USER_JWT          — JWT for an Elite-tier user
 *   TEST_ELITE_QUIZ_ID           — uuid of an unevaluated Elite quiz owned by that user
 *   TEST_ELITE_QUESTION_ORDERS   — comma-list of question_order integers on the quiz (e.g. "1,2,3,4,5")
 *
 * Run with:
 *   deno test --allow-net --allow-env \
 *     supabase/functions/interview-prep-evaluate/__tests__/evaluate.answer-length.test.ts
 *
 * Gate: missing env → tests skip with a clear message rather than fail, keeping CI green.
 *
 * NOTE: When a live DB is not available, the assertion bodies still document the expected
 * behavior so the contract is reviewable in code review and runs as soon as env is set.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const ELITE_QUIZ_ID = Deno.env.get("TEST_ELITE_QUIZ_ID") ?? "";
const ELITE_ORDERS = (Deno.env.get("TEST_ELITE_QUESTION_ORDERS") ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));

const hasEnv = !!(SUPABASE_URL && SERVICE_KEY && ELITE_JWT && ELITE_QUIZ_ID && ELITE_ORDERS.length > 0);

if (!hasEnv) {
  console.warn(
    "[evaluate.answer-length] live-DB env unset — tests will skip. Expected: " +
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_ELITE_USER_JWT, TEST_ELITE_QUIZ_ID, TEST_ELITE_QUESTION_ORDERS.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

function buildAnswers(filler: string): Array<{ question_id: string; answer_text: string }> {
  return ELITE_ORDERS.map((order) => ({
    question_id: String(order),
    answer_text: filler,
  }));
}

async function callEvaluate(answers: Array<{ question_id: string; answer_text: string }>): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/interview-prep-evaluate`;
  return await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ELITE_JWT}`,
    },
    body: JSON.stringify({ quiz_id: ELITE_QUIZ_ID, answers }),
  });
}

async function readStoredAnswerLength(order: number): Promise<number> {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await svc
    .from("interview_quiz_answers")
    .select("user_answer")
    .eq("quiz_id", ELITE_QUIZ_ID)
    .eq("question_order", order)
    .single();
  assert(!error, `reading answer row failed: ${error?.message ?? "unknown"}`);
  return (data?.user_answer as string | null)?.length ?? 0;
}

Deno.test({
  name: "SC-6 | 500-char answer persists as-is (slice is a no-op)",
  ignore: !hasEnv,
  ...testOpts,
  fn: async () => {
    const exactly500 = "a".repeat(500);
    assertEquals(exactly500.length, 500);
    const res = await callEvaluate(buildAnswers(exactly500));
    // A valid 500-char answer from an Elite-owned unevaluated quiz should succeed.
    assertEquals(res.status, 200);
    const storedLen = await readStoredAnswerLength(ELITE_ORDERS[0]);
    assertEquals(storedLen, 500, "500-char answer should persist as 500 chars (no truncation, no padding)");
  },
});

Deno.test({
  name: "SC-6 | 501-char answer is sliced to exactly 500 chars server-side",
  ignore: !hasEnv,
  ...testOpts,
  fn: async () => {
    const overLong = "a".repeat(501);
    assertEquals(overLong.length, 501);
    const res = await callEvaluate(buildAnswers(overLong));
    // Server accepts the request (no 400) and silently truncates.
    assertEquals(res.status, 200);
    const storedLen = await readStoredAnswerLength(ELITE_ORDERS[0]);
    assertEquals(storedLen, 500, "501-char answer must be truncated to 500 by the unconditional slice");
  },
});

Deno.test({
  name: "SC-6 | 800-char answer is sliced to exactly 500 chars (T-23-SRV-02)",
  ignore: !hasEnv,
  ...testOpts,
  fn: async () => {
    const way = "a".repeat(800);
    assertEquals(way.length, 800);
    const res = await callEvaluate(buildAnswers(way));
    assertEquals(res.status, 200);
    const storedLen = await readStoredAnswerLength(ELITE_ORDERS[0]);
    assertEquals(storedLen, 500, "800-char answer must be truncated to 500 — client cannot bypass 500-char limit");
  },
});
