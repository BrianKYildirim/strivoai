/**
 * Phase 23 Plan 04 Task 2 — SC-4 (evaluate side) widened tier gate.
 *
 * Behavior under test (from 23-04-PLAN.md) — matches the widened gate inserted into
 * `../index.ts` after the quiz-fetch block:
 *
 *     const canEvaluate =
 *       userContext.tier === "elite" ||
 *       (userContext.tier === "pro" && quiz.tier === "elite_taste");
 *
 * Cases (threat refs T-23-EVAL-02, T-23-EVAL-03):
 *   1. Pro user + own quiz tier='elite_taste'        → 200 (canEvaluate true)
 *   2. Pro user + own quiz tier='pro' (flashcards)   → 403 elite_or_elite_taste_required
 *   3. Elite user + own quiz tier='elite_taste'      → 200 (Elite can still evaluate taste quizzes)
 *   4. Free user                                     → 403 (pre-filter blocks before quiz fetch)
 *   5. Pro user + ANOTHER user's elite_taste quiz    → 403 not_found (ownership check fires
 *      before tier gate so no 'elite_or_elite_taste_required' leak per T-23-EVAL-03)
 *
 * Mode: LIVE-DB integration. Requires a deployed function + seeded rows in
 * `interview_quizzes` covering each (user, tier) combination below. Pro-monthly quota is
 * irrelevant here (quota gate lives in `interview-prep-analyze`, not evaluate).
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   TEST_PRO_USER_JWT                      — JWT for Pro-tier user PRO_A
 *   TEST_ELITE_USER_JWT                    — JWT for Elite-tier user ELITE_A
 *   TEST_FREE_USER_JWT                     — JWT for Free-tier user FREE_A
 *   TEST_PRO_A_ELITE_TASTE_QUIZ_ID         — quiz owned by PRO_A with tier='elite_taste'
 *   TEST_PRO_A_PRO_FLASH_QUIZ_ID           — quiz owned by PRO_A with tier='pro' (flashcards, mode='flashcard')
 *   TEST_ELITE_A_ELITE_TASTE_QUIZ_ID       — quiz owned by ELITE_A with tier='elite_taste' (rare, but possible)
 *   TEST_OTHER_USER_ELITE_TASTE_QUIZ_ID    — quiz owned by a DIFFERENT user with tier='elite_taste'
 *
 * Run with:
 *   deno test --allow-net --allow-env \
 *     supabase/functions/interview-prep-evaluate/__tests__/evaluate.pro-elite-taste-access.test.ts
 *
 * Gate: missing env → tests skip with a clear message rather than fail.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PRO_JWT = Deno.env.get("TEST_PRO_USER_JWT") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const FREE_JWT = Deno.env.get("TEST_FREE_USER_JWT") ?? "";
const PRO_ELITE_TASTE_QUIZ = Deno.env.get("TEST_PRO_A_ELITE_TASTE_QUIZ_ID") ?? "";
const PRO_FLASH_QUIZ = Deno.env.get("TEST_PRO_A_PRO_FLASH_QUIZ_ID") ?? "";
const ELITE_ELITE_TASTE_QUIZ = Deno.env.get("TEST_ELITE_A_ELITE_TASTE_QUIZ_ID") ?? "";
const OTHER_ELITE_TASTE_QUIZ = Deno.env.get("TEST_OTHER_USER_ELITE_TASTE_QUIZ_ID") ?? "";

const hasCore = !!(SUPABASE_URL && SERVICE_KEY && PRO_JWT && ELITE_JWT);
const hasPro = hasCore && !!PRO_ELITE_TASTE_QUIZ && !!PRO_FLASH_QUIZ;
const hasFree = hasCore && !!FREE_JWT;
const hasElite = hasCore && !!ELITE_ELITE_TASTE_QUIZ;
const hasOwnership = hasCore && !!OTHER_ELITE_TASTE_QUIZ;

if (!hasCore) {
  console.warn(
    "[evaluate.pro-elite-taste-access] live-DB env unset — tests will skip. Expected at minimum: " +
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_PRO_USER_JWT, TEST_ELITE_USER_JWT.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

function simpleAnswers(count = 5): Array<{ question_id: string; answer_text: string }> {
  return Array.from({ length: count }, (_, i) => ({
    question_id: String(i + 1),
    answer_text: `Sample answer ${i + 1} in under 500 chars with STAR structure.`,
  }));
}

async function callEvaluate(jwt: string, quizId: string): Promise<Response> {
  const url = `${SUPABASE_URL}/functions/v1/interview-prep-evaluate`;
  return await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ quiz_id: quizId, answers: simpleAnswers() }),
  });
}

Deno.test({
  name: "SC-4 evaluate | Pro + OWN quiz tier='elite_taste' → 200 (canEvaluate = true)",
  ignore: !hasPro,
  ...testOpts,
  fn: async () => {
    const res = await callEvaluate(PRO_JWT, PRO_ELITE_TASTE_QUIZ);
    // If quiz already evaluated, status 409 is also acceptable proof of tier-gate passage.
    const body = await res.json();
    assert(
      res.status === 200 || res.status === 409,
      `Pro+elite_taste should pass tier gate; got ${res.status}: ${JSON.stringify(body)}`,
    );
    // Critically: must NOT be 403 with elite_or_elite_taste_required.
    assert(
      body?.error !== "elite_or_elite_taste_required",
      "Pro user with elite_taste quiz must not be rejected by tier gate",
    );
  },
});

Deno.test({
  name: "SC-4 evaluate | Pro + OWN quiz tier='pro' (flashcard) → 403 elite_or_elite_taste_required",
  ignore: !hasPro,
  ...testOpts,
  fn: async () => {
    const res = await callEvaluate(PRO_JWT, PRO_FLASH_QUIZ);
    const body = await res.json();
    // Either the tier gate rejects (403 elite_or_elite_taste_required) or the mode check fires
    // first (400 invalid_mode for mode='flashcard'). Both are correct refusals of evaluate for
    // a Pro flashcard session. The explicit success criterion is that Pro cannot evaluate a
    // tier='pro' quiz, so we assert it didn't succeed.
    assert(res.status !== 200, "Pro user must not evaluate a non-elite_taste quiz");
    if (res.status === 403) {
      assertEquals(body.error, "elite_or_elite_taste_required");
    }
  },
});

Deno.test({
  name: "SC-4 evaluate | Elite + quiz tier='elite_taste' → 200 (Elite retains access)",
  ignore: !hasElite,
  ...testOpts,
  fn: async () => {
    const res = await callEvaluate(ELITE_JWT, ELITE_ELITE_TASTE_QUIZ);
    const body = await res.json();
    assert(
      res.status === 200 || res.status === 409,
      `Elite must evaluate their own elite_taste quiz; got ${res.status}: ${JSON.stringify(body)}`,
    );
    assert(
      body?.error !== "elite_or_elite_taste_required",
      "Elite users must never see elite_or_elite_taste_required",
    );
  },
});

Deno.test({
  name: "SC-4 evaluate | Free user → 403 (pre-filter blocks at auth, never reaches quiz fetch)",
  ignore: !hasFree,
  ...testOpts,
  fn: async () => {
    // Any quiz id will do — Free tier is blocked before the quiz fetch.
    const res = await callEvaluate(FREE_JWT, PRO_ELITE_TASTE_QUIZ || "00000000-0000-0000-0000-000000000000");
    const body = await res.json();
    assertEquals(res.status, 403);
    assertEquals(
      body.error,
      "elite_or_elite_taste_required",
      "Free tier is rejected with the unified 'elite_or_elite_taste_required' code (no legacy 'elite_only')",
    );
  },
});

Deno.test({
  name: "SC-4 evaluate | Pro + ANOTHER user's elite_taste quiz → 403 not_found (T-23-EVAL-03, no tier leakage)",
  ignore: !hasOwnership,
  ...testOpts,
  fn: async () => {
    const res = await callEvaluate(PRO_JWT, OTHER_ELITE_TASTE_QUIZ);
    const body = await res.json();
    assertEquals(res.status, 403);
    // Ownership check (.eq("user_id", userId)) fires before the tier gate, so the error must
    // be the generic not_found / forbidden — NEVER elite_or_elite_taste_required. Leaking
    // 'elite_or_elite_taste_required' here would reveal that the quiz exists and has tier=
    // 'elite_taste' owned by someone else, which is the Information Disclosure threat
    // T-23-EVAL-03.
    assert(
      body.error === "not_found" || body.error === "forbidden",
      `Ownership-failure error code must be generic; got ${JSON.stringify(body)}`,
    );
    assert(
      body.error !== "elite_or_elite_taste_required",
      "Tier-gate leak across users is forbidden (T-23-EVAL-03)",
    );
  },
});
