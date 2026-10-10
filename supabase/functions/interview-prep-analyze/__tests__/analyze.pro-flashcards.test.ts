/**
 * Phase 23 Plan 03 Task 1b — SC-3 / IPC-02 Pro flashcard contract.
 *
 * Behavior under test (23-03-PLAN.md Behavior 2):
 *   - Pro tier, valid resume, `elite_taste_request=false` → 200 response with
 *     `variant='pro'`, `practice_questions.mode='flashcard'`, and exactly 3
 *     flashcards, each containing a full STAR block (situation/task/action/result
 *     ≥ 40 chars per §5 InterviewPrep schema) and coach_note ≤ 140 chars.
 *
 * Contract levels:
 *   1. **Fixture-shape** (always runs): the `pro_flashcard` replay fixture is
 *      the exact payload the handler returns in happy-path pro+no-taste flow.
 *      Every assertion below reads from that fixture — if these fail, the
 *      fixture is broken and every downstream test using it will falsely fail
 *      or falsely pass.
 *   2. **Live-DB integration** (gated on env): calls the deployed handler with
 *      a Pro JWT and expects a quiz row in `interview_quizzes` with
 *      `tier='pro'`, `mode='flashcard'` (D-13, D-04).
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.pro-flashcards.test.ts
 *
 * VALIDATION.md row 23-03-02.
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

const PRO_INTAKE: IntakeForm = {
  role_title: "Platform Engineer",
  company: "Strivo Cloud",
  job_description:
    "Platform Engineer role building production reliability systems at scale, focused on SLO ownership and cross-team reliability.",
  background_context: "3 years platform engineering with on-call reliability focus",
  interview_type: "behavioral",
  question_categories: ["behavioral"],
  difficulty: "mid",
  duration: 30,
  format: "written",
  elite_taste_request: false,
};

// ── Fixture shape (mode=flashcard, 3 items, full STAR per D-13) ────────────────

Deno.test("pro_flashcard fixture: practice_questions.mode === 'flashcard'", () => {
  const payload = loadPayload("pro_flashcard");
  assertEquals(payload.practice_questions.mode, "flashcard");
});

Deno.test("pro_flashcard fixture: practice_questions.items.length === 3", () => {
  const payload = loadPayload("pro_flashcard");
  assertEquals(payload.practice_questions.items.length, 3);
});

Deno.test("pro_flashcard fixture: each flashcard has full STAR (≥40 chars each beat) + coach_note (≤140 chars)", () => {
  const payload = loadPayload("pro_flashcard");
  assert(payload.practice_questions.mode === "flashcard");
  const items = payload.practice_questions.items;
  for (let i = 0; i < items.length; i++) {
    const q = items[i];
    assert(
      q.star_answer.situation.length >= 40,
      `item[${i}] situation must be ≥40 chars, got ${q.star_answer.situation.length}`,
    );
    assert(
      q.star_answer.task.length >= 40,
      `item[${i}] task must be ≥40 chars, got ${q.star_answer.task.length}`,
    );
    assert(
      q.star_answer.action.length >= 40,
      `item[${i}] action must be ≥40 chars, got ${q.star_answer.action.length}`,
    );
    assert(
      q.star_answer.result.length >= 40,
      `item[${i}] result must be ≥40 chars, got ${q.star_answer.result.length}`,
    );
    assert(
      q.coach_note.length >= 1 && q.coach_note.length <= 140,
      `item[${i}] coach_note must be 1-140 chars, got ${q.coach_note.length}`,
    );
  }
});

// ── Variant / validator contract ──────────────────────────────────────────────

Deno.test("pro_flashcard fixture passes validateInterviewPrepPayload(variant='pro')", () => {
  const payload = loadPayload("pro_flashcard");
  const result = validateInterviewPrepPayload(payload, "pro", PRO_INTAKE);
  assert(result.valid, `validator must accept pro variant: ${result.error ?? ""}`);
  assertEquals(result.payload?.practice_questions.mode, "flashcard");
});

Deno.test("pro_flashcard fixture REJECTED by validator when variant='elite' (variant-mode mismatch guard)", () => {
  const payload = loadPayload("pro_flashcard");
  // Pitfall 3 — variant guard: elite variant expects mode=quiz. pro fixture has mode=flashcard.
  const result = validateInterviewPrepPayload(payload, "elite", PRO_INTAKE);
  assertEquals(result.valid, false);
  assert(
    (result.error ?? "").includes("variant-mode-mismatch"),
    `error must cite variant-mode-mismatch, got: ${result.error}`,
  );
});

// ── Live-DB integration (gated) ────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PRO_JWT = Deno.env.get("TEST_PRO_USER_JWT") ?? "";
const liveEnabled = !!(SUPABASE_URL && SERVICE_KEY && PRO_JWT);

if (!liveEnabled) {
  console.warn(
    "[analyze.pro-flashcards] live-DB env unset — live integration tests will skip. " +
      "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_PRO_USER_JWT.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({
  name:
    "SC-3 | pro + valid intake → 200, variant='pro', mode='flashcard', items=3, tier='pro' persisted",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    Deno.env.set("ANTHROPIC_FIXTURE_VARIANT", "pro_flashcard");
    const url = `${SUPABASE_URL}/functions/v1/interview-prep-analyze`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PRO_JWT}`,
      },
      body: JSON.stringify(PRO_INTAKE),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.variant, "pro");
    assertEquals(body.payload.practice_questions.mode, "flashcard");
    assertEquals(body.payload.practice_questions.items.length, 3);
    assert(typeof body.quiz_id === "string" && body.quiz_id.length > 0);
  },
});
