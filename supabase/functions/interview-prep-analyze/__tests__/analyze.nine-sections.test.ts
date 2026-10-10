/**
 * Phase 23 Plan 03 Task 1b — SC-9 / §10 nine-section completeness.
 *
 * Behavior under test (23-03-PLAN.md Behavior 7):
 *   - Every successful response body contains all 9 §10 sections:
 *       your_prep_readiness, coach_verdict, readiness_breakdown, focus_areas,
 *       quick_tips, practice_questions, prep_roadmap, strengths_and_watchouts,
 *       coaching_advice.
 *   - A fixture with `coach_verdict` removed fails Zod validation → the
 *     handler's retry-then-fail path returns 502 validation_failed.
 *   - D-11 "no silent drops": when the fixture includes role_title="Platform
 *     Engineer" AND it's mentioned in coach_verdict / focus_areas,
 *     findDroppedOptionalFields returns [] (no retry needed).
 *
 * Contract levels:
 *   1. **Fixture shape** (always runs): assert the 9 sections on every valid
 *      variant, assert the invalid variant fails validation, assert
 *      findDroppedOptionalFields is [] when optional fields are acknowledged.
 *   2. **Live-DB integration** (gated): when the fixture injection infra is
 *      available, verify the handler returns 502 validation_failed for the
 *      invalid_missing_coach_verdict fixture after both retry attempts miss.
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.nine-sections.test.ts
 *
 * VALIDATION.md row 23-03-06.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  InterviewPrepPayloadSchema,
  type InterviewPrepPayload,
} from "../../_shared/types/interviewPrep.ts";
import {
  findDroppedOptionalFields,
  validateInterviewPrepPayload,
} from "../../_shared/interview-prep-validation.ts";
import type { IntakeForm } from "../../_shared/types/interviewPrep.ts";

const FIXTURE_PATH = new URL(
  "./fixtures/interview_prep.fixture.json",
  import.meta.url,
);

function loadFixture(): Record<string, { status: number; text: string }> {
  const raw = Deno.readTextFileSync(FIXTURE_PATH);
  return JSON.parse(raw);
}

function loadPayload(variantKey: string): InterviewPrepPayload {
  const fx = loadFixture();
  const parsed = JSON.parse(fx[variantKey].text);
  return InterviewPrepPayloadSchema.parse(parsed);
}

const PLATFORM_INTAKE: IntakeForm = {
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

// ── All 9 sections present in every valid variant ─────────────────────────────

const REQUIRED_SECTIONS = [
  "your_prep_readiness",
  "coach_verdict",
  "readiness_breakdown",
  "focus_areas",
  "quick_tips",
  "practice_questions",
  "prep_roadmap",
  "strengths_and_watchouts",
  "coaching_advice",
] as const;

for (const variant of ["pro_flashcard", "elite_quiz_5", "elite_quiz_6", "elite_quiz_7"] as const) {
  Deno.test(`§10 nine-section contract: ${variant} fixture has all 9 required keys`, () => {
    const payload = loadPayload(variant) as unknown as Record<string, unknown>;
    for (const section of REQUIRED_SECTIONS) {
      assert(
        section in payload,
        `${variant} fixture missing required §10 section: ${section}`,
      );
      assert(
        payload[section] !== null && payload[section] !== undefined,
        `${variant}.${section} must not be null/undefined`,
      );
    }
  });
}

// ── Invalid fixture (coach_verdict removed) fails validation ──────────────────

Deno.test("§10 validation_failed: invalid_missing_coach_verdict fixture fails Zod schema", () => {
  const fx = loadFixture();
  const raw = JSON.parse(fx.invalid_missing_coach_verdict.text);
  // The fixture keeps all 8 other sections but removes coach_verdict. Zod must reject.
  assert(!("coach_verdict" in raw), "fixture should NOT contain coach_verdict");
  const result = InterviewPrepPayloadSchema.safeParse(raw);
  assertEquals(result.success, false);
  // And the validator wrapper must report a schema error — this is the error the
  // handler surfaces as MeritRefundable(502, `validation_failed: ...`).
  const validatorResult = validateInterviewPrepPayload(raw, "elite", {
    ...PLATFORM_INTAKE,
    duration: 30,
  });
  assertEquals(validatorResult.valid, false);
  assert(
    (validatorResult.error ?? "").startsWith("schema:"),
    `error must start with 'schema:', got: ${validatorResult.error}`,
  );
  assert(
    (validatorResult.error ?? "").includes("coach_verdict"),
    `error must mention the missing field coach_verdict, got: ${validatorResult.error}`,
  );
});

// ── D-11 no-silent-drops: optional fields mentioned → no retry needed ─────────

Deno.test("D-11 no-silent-drops: pro_flashcard mentions role_title + company → dropped=[]", () => {
  const payload = loadPayload("pro_flashcard");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "Platform Engineer",
    company: "Strivo Cloud",
    background_context: "3 years platform engineering with on-call reliability focus",
  });
  assertEquals(
    dropped,
    [],
    `expected no dropped optional fields, got: ${JSON.stringify(dropped)}`,
  );
});

Deno.test("D-11 no-silent-drops: elite_quiz_5 mentions role_title + company → dropped=[]", () => {
  const payload = loadPayload("elite_quiz_5");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "Platform Engineer",
    company: "Strivo Cloud",
    background_context: "platform engineering",
  });
  assertEquals(
    dropped,
    [],
    `expected no dropped optional fields, got: ${JSON.stringify(dropped)}`,
  );
});

Deno.test("D-11 no-silent-drops: returns intake keys that the payload ignored", () => {
  // Control — use a role_title the fixture does NOT mention to prove the detector works.
  const payload = loadPayload("pro_flashcard");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "Nurse Practitioner",
    company: "HealthCorp",
    background_context: undefined,
  });
  assert(
    dropped.includes("role_title"),
    `detector must flag role_title when the fixture does not mention it; got: ${JSON.stringify(dropped)}`,
  );
  assert(
    dropped.includes("company"),
    `detector must flag company when the fixture does not mention it; got: ${JSON.stringify(dropped)}`,
  );
});

// ── Live-DB integration (gated) ────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const liveEnabled = !!(SUPABASE_URL && SERVICE_KEY && ELITE_JWT);

if (!liveEnabled) {
  console.warn(
    "[analyze.nine-sections] live-DB env unset — live integration tests will skip. " +
      "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_ELITE_USER_JWT.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({
  name:
    "SC-9 | invalid_missing_coach_verdict fixture persistently missing → 502 validation_failed (handler returns after retry)",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    // Force BOTH the first attempt and retry to use the broken fixture so
    // validation_failed is terminal per the handler's retry-then-fail path.
    Deno.env.set("ANTHROPIC_FIXTURE_VARIANT", "invalid_missing_coach_verdict");
    const url = `${SUPABASE_URL}/functions/v1/interview-prep-analyze`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ELITE_JWT}`,
      },
      body: JSON.stringify({ ...PLATFORM_INTAKE, duration: 30 }),
    });
    // MeritRefundable(502, 'validation_failed: ...') surfaces as 502 via the
    // merit gateway's error translator.
    assertEquals(res.status, 502, "missing coach_verdict → 502 after retry fails");
    const body = await res.json();
    assert(
      (body.error ?? "").toString().toLowerCase().includes("valid") ||
        (body.message ?? "").toString().toLowerCase().includes("valid"),
      `response must signal validation failure; got: ${JSON.stringify(body)}`,
    );
  },
});
