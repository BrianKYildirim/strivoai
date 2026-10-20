// supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts
// Phase 23 Plan 05 Task 2 — SC-9 / IPC-02 / IPC-03 regression.
//
// Asserts that each of the three tier variants (Pro flashcard, Elite quiz,
// Pro-monthly Elite-taste) emits prompts that:
//   - Reference all 9 Runtime §10 output sections
//   - Embed mode-specific constraints (flashcard=3 items, quiz=5/5/6/7 items)
//   - Surface the 6 new intake fields in the context block (or "(not provided)")
//   - Carry the D-11 no-silent-drops instruction
//   - Carry the Runtime §5 signal_missing / resume_anchor instruction
//   - Carry the Runtime §11 honest-scoring guidance
//
// Run: deno test --allow-net --allow-env --allow-read \
//        supabase/functions/_shared/__tests__/interview-prep-prompts.contract.test.ts

import {
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  INTERVIEW_PREP_VARIANTS,
  type InterviewPrepPromptParams,
} from "../interview-prep-prompts.ts";

function baseParams(
  overrides: Partial<InterviewPrepPromptParams> = {},
): InterviewPrepPromptParams {
  return {
    resumeText:
      "Alice, 5 years at supabase infra team — led migration of 12 microservices to k8s, shipped CI pipeline for 40+ teams.",
    jobDescription: "Platform engineer role building edge runtime + RLS.",
    interviewType: "behavioral",
    questionCategories: ["behavioral"],
    difficulty: "mid",
    duration: 30,
    format: "written",
    variant: "pro",
    ...overrides,
  };
}

const NINE_SECTION_KEYS = [
  "your_prep_readiness",
  "coach_verdict",
  "readiness_breakdown",
  "focus_areas",
  "quick_tips",
  "practice_questions",
  "prep_roadmap",
  "strengths_and_watchouts",
  "coaching_advice",
];

Deno.test("pro variant → mentions all 9 §10 section keys", () => {
  const out = INTERVIEW_PREP_VARIANTS.pro(baseParams({ variant: "pro" }));
  for (const key of NINE_SECTION_KEYS) {
    assertStringIncludes(out, key);
  }
});

Deno.test("elite variant → mentions all 9 §10 section keys", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(baseParams({ variant: "elite" }));
  for (const key of NINE_SECTION_KEYS) {
    assertStringIncludes(out, key);
  }
});

Deno.test("pro variant → exactly 3 flashcards instruction + mode='flashcard'", () => {
  const out = INTERVIEW_PREP_VARIANTS.pro(baseParams({ variant: "pro" }));
  assertStringIncludes(out, "flashcard");
  assertStringIncludes(out, "exactly 3");
  assertStringIncludes(out, 'mode: "flashcard"');
});

Deno.test("elite variant duration=30 → exactly 5 questions + mode='quiz'", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ duration: 30, variant: "elite" }),
  );
  assertStringIncludes(out, "exactly 5 questions");
  assertStringIncludes(out, 'mode: "quiz"');
});

Deno.test("elite variant duration=15 → exactly 5 questions", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ duration: 15, variant: "elite" }),
  );
  assertStringIncludes(out, "exactly 5 questions");
});

Deno.test("elite variant duration=45 → exactly 6 questions", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ duration: 45, variant: "elite" }),
  );
  assertStringIncludes(out, "exactly 6 questions");
});

Deno.test("elite variant duration=60 → exactly 7 questions", () => {
  const out = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ duration: 60, variant: "elite" }),
  );
  assertStringIncludes(out, "exactly 7 questions");
});

Deno.test("elite_taste (selected via pro builder) → quiz mode with duration-driven count", () => {
  // Pro tier, elite_taste variant → pro builder routes to Elite quiz prompt.
  const out = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ variant: "elite_taste", duration: 45 }),
  );
  assertStringIncludes(out, 'mode: "quiz"');
  assertStringIncludes(out, "exactly 6 questions");
});

Deno.test("roleTitle included in context block when provided", () => {
  const out = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ roleTitle: "Platform Engineer" }),
  );
  assertStringIncludes(out, "Platform Engineer");
  assertStringIncludes(out, "role_title:");
});

Deno.test("backgroundContext included in context block when provided", () => {
  const out = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ backgroundContext: "pivoting from data eng" }),
  );
  assertStringIncludes(out, "pivoting from data eng");
  assertStringIncludes(out, "background_context:");
});

Deno.test("(not provided) marker when optional fields absent (D-11 explicit-absence)", () => {
  const out = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({
      roleTitle: undefined,
      company: undefined,
      backgroundContext: undefined,
    }),
  );
  assertStringIncludes(out, "(not provided)");
});

Deno.test("all 3 variants include signal_missing instruction (Runtime §5 trust)", () => {
  const proOut = INTERVIEW_PREP_VARIANTS.pro(baseParams({ variant: "pro" }));
  const eliteOut = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ variant: "elite" }),
  );
  const tasteOut = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ variant: "elite_taste" }),
  );
  for (const out of [proOut, eliteOut, tasteOut]) {
    assertStringIncludes(out, "signal_missing");
  }
});

Deno.test("all 3 variants include honest-scoring instruction (Runtime §11)", () => {
  const proOut = INTERVIEW_PREP_VARIANTS.pro(baseParams({ variant: "pro" }));
  const eliteOut = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ variant: "elite" }),
  );
  const tasteOut = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ variant: "elite_taste" }),
  );
  for (const out of [proOut, eliteOut, tasteOut]) {
    assertMatch(out, /not_ready|needs_work|honest/i);
  }
});

Deno.test("D-11 no-silent-drops instruction present in all 3 variants", () => {
  const proOut = INTERVIEW_PREP_VARIANTS.pro(baseParams({ variant: "pro" }));
  const eliteOut = INTERVIEW_PREP_VARIANTS.elite(
    baseParams({ variant: "elite" }),
  );
  const tasteOut = INTERVIEW_PREP_VARIANTS.pro(
    baseParams({ variant: "elite_taste" }),
  );
  for (const out of [proOut, eliteOut, tasteOut]) {
    // The prompt explicitly tells the model to reference provided optional
    // fields — look for either the D-11 anchor or the "mention them explicitly"
    // phrase used in the base prompt.
    assertMatch(out, /mention them explicitly|silent|never silently ignore/i);
  }
});
