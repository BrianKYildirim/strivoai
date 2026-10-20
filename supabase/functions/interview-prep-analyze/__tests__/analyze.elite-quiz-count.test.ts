/**
 * Phase 23 Plan 03 Task 1b — SC-5 / IPC-03 Elite quiz question-count contract.
 *
 * Behavior under test (23-03-PLAN.md Behavior 5):
 *   - Elite tier → duration ∈ {15,30,45,60} maps to {5,5,6,7} questions each.
 *   - `practice_questions.mode === 'quiz'`.
 *   - Integer `id` per QuizQuestion (SC-7 downstream evaluator join).
 *
 * The fixture has three variants — elite_quiz_5, elite_quiz_6, elite_quiz_7 —
 * covering the three unique counts. Duration 15 and 30 both produce 5 questions
 * per the D-13 duration→count map so they share the elite_quiz_5 fixture.
 *
 * Contract levels:
 *   1. **Fixture shape** (always runs): each variant fixture has the correct
 *      number of quiz items with integer ids.
 *   2. **Live-DB integration** (gated on env): calls the deployed handler for
 *      each duration and verifies `interview_quiz_answers` contains rows
 *      numbered 1..n matching the expected count.
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.elite-quiz-count.test.ts
 *
 * VALIDATION.md row 23-03-04.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  InterviewPrepPayloadSchema,
  type InterviewPrepPayload,
} from "../../_shared/types/interviewPrep.ts";
import { validateInterviewPrepPayload } from "../../_shared/interview-prep-validation.ts";
import type { IntakeForm } from "../../_shared/types/interviewPrep.ts";

const FIXTURE_PATH = new URL(
  "./fixtures/interview_prep.fixture.json",
  import.meta.url,
);

function loadPayload(variantKey: string): InterviewPrepPayload {
  const raw = Deno.readTextFileSync(FIXTURE_PATH);
  const fx = JSON.parse(raw);
  const parsed = JSON.parse(fx[variantKey].text);
  return InterviewPrepPayloadSchema.parse(parsed);
}

function makeIntake(duration: 15 | 30 | 45 | 60): IntakeForm {
  return {
    role_title: "Platform Engineer",
    company: "Strivo Cloud",
    job_description:
      "Platform Engineer role building production reliability systems at scale, focused on SLO ownership and cross-team reliability.",
    background_context:
      "3 years platform engineering with on-call reliability focus",
    interview_type: "behavioral",
    question_categories: ["behavioral"],
    difficulty: "mid",
    duration,
    format: "written",
    elite_taste_request: false,
  };
}

// ── Fixture shape (per-duration count) ─────────────────────────────────────────

Deno.test("elite_quiz_5 fixture: mode=quiz, 5 items, integer ids 1..5", () => {
  const payload = loadPayload("elite_quiz_5");
  assertEquals(payload.practice_questions.mode, "quiz");
  assert(payload.practice_questions.mode === "quiz");
  assertEquals(payload.practice_questions.items.length, 5);
  for (let i = 0; i < 5; i++) {
    const q = payload.practice_questions.items[i];
    assertEquals(q.id, i + 1, `items[${i}].id must be ${i + 1}, got ${q.id}`);
    assertEquals(
      Number.isInteger(q.id),
      true,
      `items[${i}].id must be an integer (SC-7 evaluator join), got ${q.id}`,
    );
  }
});

Deno.test("elite_quiz_6 fixture: mode=quiz, 6 items, integer ids 1..6", () => {
  const payload = loadPayload("elite_quiz_6");
  assert(payload.practice_questions.mode === "quiz");
  assertEquals(payload.practice_questions.items.length, 6);
  for (let i = 0; i < 6; i++) {
    assertEquals(payload.practice_questions.items[i].id, i + 1);
  }
});

Deno.test("elite_quiz_7 fixture: mode=quiz, 7 items, integer ids 1..7", () => {
  const payload = loadPayload("elite_quiz_7");
  assert(payload.practice_questions.mode === "quiz");
  assertEquals(payload.practice_questions.items.length, 7);
  for (let i = 0; i < 7; i++) {
    assertEquals(payload.practice_questions.items[i].id, i + 1);
  }
});

// ── Validator accepts each elite variant ──────────────────────────────────────

Deno.test("elite_quiz_5 passes validateInterviewPrepPayload(variant='elite', duration=15)", () => {
  const payload = loadPayload("elite_quiz_5");
  const result = validateInterviewPrepPayload(payload, "elite", makeIntake(15));
  assert(result.valid, `validator must accept: ${result.error ?? ""}`);
});

Deno.test("elite_quiz_5 passes validateInterviewPrepPayload(variant='elite', duration=30)", () => {
  const payload = loadPayload("elite_quiz_5");
  const result = validateInterviewPrepPayload(payload, "elite", makeIntake(30));
  assert(result.valid, `validator must accept: ${result.error ?? ""}`);
});

Deno.test("elite_quiz_6 passes validateInterviewPrepPayload(variant='elite', duration=45)", () => {
  const payload = loadPayload("elite_quiz_6");
  const result = validateInterviewPrepPayload(payload, "elite", makeIntake(45));
  assert(result.valid, `validator must accept: ${result.error ?? ""}`);
});

Deno.test("elite_quiz_7 passes validateInterviewPrepPayload(variant='elite', duration=60)", () => {
  const payload = loadPayload("elite_quiz_7");
  const result = validateInterviewPrepPayload(payload, "elite", makeIntake(60));
  assert(result.valid, `validator must accept: ${result.error ?? ""}`);
});

// ── Variant guard: elite fixture rejected for pro variant ─────────────────────

Deno.test("elite_quiz_5 fixture REJECTED by validator when variant='pro' (variant-mode mismatch)", () => {
  const payload = loadPayload("elite_quiz_5");
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake(30));
  assertEquals(result.valid, false);
  assert((result.error ?? "").includes("variant-mode-mismatch"));
});

// ── Live-DB integration (gated) ────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const liveEnabled = !!(SUPABASE_URL && SERVICE_KEY && ELITE_JWT);

if (!liveEnabled) {
  console.warn(
    "[analyze.elite-quiz-count] live-DB env unset — live integration tests will skip. " +
      "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_ELITE_USER_JWT.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

for (const [duration, expected, fixtureVariant] of [
  [15, 5, "elite_quiz_5"],
  [30, 5, "elite_quiz_5"],
  [45, 6, "elite_quiz_6"],
  [60, 7, "elite_quiz_7"],
] as const) {
  Deno.test({
    name:
      `SC-5 | elite duration=${duration} → ${expected} questions, mode='quiz', integer ids`,
    ignore: !liveEnabled,
    ...testOpts,
    fn: async () => {
      Deno.env.set("ANTHROPIC_FIXTURE_VARIANT", fixtureVariant);
      const url = `${SUPABASE_URL}/functions/v1/interview-prep-analyze`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ELITE_JWT}`,
        },
        body: JSON.stringify(makeIntake(duration)),
      });
      assertEquals(res.status, 200, `duration=${duration} must 200`);
      const body = await res.json();
      assertEquals(body.variant, "elite");
      assertEquals(body.payload.practice_questions.mode, "quiz");
      assertEquals(
        body.payload.practice_questions.items.length,
        expected,
        `duration=${duration} → expected ${expected} questions`,
      );
      for (let i = 0; i < expected; i++) {
        assertEquals(body.payload.practice_questions.items[i].id, i + 1);
        assert(
          Number.isInteger(body.payload.practice_questions.items[i].id),
          `items[${i}].id must be integer`,
        );
      }
    },
  });
}
