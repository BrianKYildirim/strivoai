// supabase/functions/_shared/__tests__/interview-prep-validation.test.ts
// Zod-backed §10 validator tests + D-11 no-silent-drops tests.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  findDroppedOptionalFields,
  validateInterviewPrepPayload,
} from "../interview-prep-validation.ts";
import type { InterviewPrepPayload, IntakeForm } from "../types/interviewPrep.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 40-char filler for STAR beats (min 40) — 48 chars to be safe.
const FILLER_40 = "This string is intentionally long enough. OK?!!";
// 120-char filler for coach_verdict (min 120) — 160 chars.
const FILLER_120 =
  "This is a long coach verdict that intentionally contains enough characters to clear the minimum length requirement for the runtime ten schema check.";
// 60-char filler for coaching_advice.advice (min 60).
const FILLER_60 =
  "Advice string long enough to pass the sixty character min requirement.";
// 40-char filler for notes.
const FILLER_40_NOTES =
  "Notes string long enough to clear forty chars.";

function makeStar() {
  return {
    situation: FILLER_40,
    task: FILLER_40,
    action: FILLER_40,
    result: FILLER_40,
    resume_anchor: "Resume line: led platform migration at ACME",
    signal_missing: false,
  };
}

function makeFlashcard(i: number) {
  return {
    question: `Tell me about a time you shipped feature ${i}?`,
    competency: "ownership",
    star_answer: makeStar(),
    coach_note: "Lead with outcome, keep it crisp.",
  };
}

function makeQuizQuestion(id: number) {
  return {
    id,
    question: `Describe quiz question number ${id} in detail please`,
    competency: "collaboration",
  };
}

function makeValidPayload(mode: "flashcard" | "quiz"): InterviewPrepPayload {
  const practice_questions = mode === "flashcard"
    ? {
      mode: "flashcard" as const,
      items: [makeFlashcard(1), makeFlashcard(2), makeFlashcard(3)],
    }
    : {
      mode: "quiz" as const,
      items: [
        makeQuizQuestion(1),
        makeQuizQuestion(2),
        makeQuizQuestion(3),
        makeQuizQuestion(4),
        makeQuizQuestion(5),
      ],
    };

  return {
    your_prep_readiness: {
      score: 72,
      band: "ready_to_practice",
      one_line_verdict: "Solid base, practice STAR structure before panel.",
    },
    coach_verdict: FILLER_120,
    readiness_breakdown: {
      resume_alignment: 75,
      jd_alignment: 68,
      star_depth: 70,
      communication: 72,
      notes: FILLER_40_NOTES,
    },
    focus_areas: [
      {
        title: "Sharpen STAR result metrics",
        why: "Your results often lack quantified outcomes.",
        what_to_do: "Add concrete numbers or percentages to each result line.",
      },
      {
        title: "Map stories to JD competencies",
        why: "The JD lists ownership and cross-team collaboration.",
        what_to_do: "Pre-select two STAR stories per competency and rehearse.",
      },
    ],
    quick_tips: [
      "Lead each answer with the outcome.",
      "Keep each STAR answer under ninety seconds.",
      "Name the specific stakeholders you influenced.",
    ],
    practice_questions,
    prep_roadmap: [
      { when: "today", action: "Read JD and pick three anchor stories" },
      { when: "this_week", action: "Rehearse each STAR story out loud" },
      { when: "before_interview", action: "Review quantified metrics list" },
    ],
    strengths_and_watchouts: {
      strengths: [
        "Clear ownership across platform migrations",
        "Strong metric-driven framing in resume",
      ],
      watch_outs: [
        "Tendency to rush past the Result beat",
        "Missing cross-functional context in Task",
      ],
    },
    coaching_advice: {
      advice: FILLER_60,
      biggest_score_mover: "Quantify every Result beat with a concrete metric.",
    },
  };
}

function makeIntake(overrides: Partial<IntakeForm> = {}): IntakeForm {
  return {
    job_description:
      "We are hiring a platform engineer to own our migration from legacy infra.",
    interview_type: "behavioral",
    question_categories: ["ownership", "collaboration"],
    difficulty: "mid",
    duration: 30,
    format: "written",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — validateInterviewPrepPayload (Tests 1-6)
// ---------------------------------------------------------------------------

Deno.test("Test 1: valid §10 pro-flashcard payload returns valid", () => {
  const payload = makeValidPayload("flashcard");
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake());
  assertEquals(result.valid, true);
});

Deno.test("Test 2: valid §10 elite-quiz payload returns valid", () => {
  const payload = makeValidPayload("quiz");
  const result = validateInterviewPrepPayload(payload, "elite", makeIntake());
  assertEquals(result.valid, true);
});

Deno.test("Test 3: missing coach_verdict returns invalid + error mentions coach_verdict", () => {
  const payload = makeValidPayload("flashcard") as unknown as Record<string, unknown>;
  delete payload.coach_verdict;
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake());
  assertEquals(result.valid, false);
  assertEquals(result.error?.includes("coach_verdict"), true);
});

Deno.test("Test 4: variant=pro with quiz-mode payload returns invalid (variant-mode-mismatch)", () => {
  const payload = makeValidPayload("quiz");
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake());
  assertEquals(result.valid, false);
  assertEquals(result.error?.includes("variant-mode-mismatch"), true);
});

Deno.test("Test 5: flashcard items.length=2 fails (must be exactly 3)", () => {
  const payload = makeValidPayload("flashcard");
  payload.practice_questions = {
    mode: "flashcard",
    items: [makeFlashcard(1), makeFlashcard(2)],
  } as never;
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake());
  assertEquals(result.valid, false);
});

Deno.test("Test 6: readiness_breakdown.jd_alignment=-1 fails", () => {
  const payload = makeValidPayload("flashcard");
  payload.readiness_breakdown.jd_alignment = -1;
  const result = validateInterviewPrepPayload(payload, "pro", makeIntake());
  assertEquals(result.valid, false);
});

// ---------------------------------------------------------------------------
// Tests — findDroppedOptionalFields (Tests 7-12)
// ---------------------------------------------------------------------------

Deno.test("Test 7: role_title mentioned in coach_verdict → not dropped", () => {
  const payload = makeValidPayload("flashcard");
  payload.coach_verdict =
    "As a Platform Engineer you show solid ownership across migrations and have enough signal to ship with practice on STAR metrics.";
  const dropped = findDroppedOptionalFields(payload, { role_title: "Platform Engineer" });
  assertEquals(dropped, []);
});

Deno.test("Test 8: company in intake but not in payload → returned as dropped", () => {
  const payload = makeValidPayload("flashcard");
  payload.coach_verdict =
    "You show strong ownership across platform migrations and have enough signal to ship with practice on STAR metrics today.";
  const dropped = findDroppedOptionalFields(payload, { company: "Stripe" });
  assertEquals(dropped, ["company"]);
});

Deno.test("Test 9: 'Metadata' in payload is not a \\b-bounded match for 'Meta' → dropped", () => {
  const payload = makeValidPayload("flashcard");
  payload.coach_verdict =
    "You built a Metadata pipeline that served ownership signals and have enough ground to ship with practice on STAR metrics today.";
  const dropped = findDroppedOptionalFields(payload, { company: "Meta" });
  assertEquals(dropped, ["company"]);
});

Deno.test("Test 10: background_context token present in payload → not dropped", () => {
  const payload = makeValidPayload("flashcard");
  payload.coach_verdict =
    "You are pivoting roles and show ownership across migrations with enough signal to ship after focused practice on STAR metrics.";
  const dropped = findDroppedOptionalFields(payload, {
    background_context: "pivoting from data eng to platform",
  });
  assertEquals(dropped, []);
});

Deno.test("Test 11: Unicode NFC — 'Café' in intake matches 'Cafe' in payload", () => {
  const payload = makeValidPayload("flashcard");
  payload.coach_verdict =
    "You shipped Cafe migrations and show strong ownership with enough signal to ship after focused practice on STAR metrics today.";
  const dropped = findDroppedOptionalFields(payload, { company: "Café" });
  assertEquals(dropped, []);
});

Deno.test("Test 12: all optional fields undefined → returns empty array", () => {
  const payload = makeValidPayload("flashcard");
  const dropped = findDroppedOptionalFields(payload, {});
  assertEquals(dropped, []);
});
