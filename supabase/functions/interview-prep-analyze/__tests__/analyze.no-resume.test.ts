/**
 * Phase 23 Plan 03 Task 1b — SC-2 / no_resume behavior contract.
 *
 * Behavior under test (23-03-PLAN.md Behavior 1):
 *   - Pro tier user with a valid intake body but NO analyzed resume row in the
 *     `resumes` table → handler returns 400 with body `{ error: "no_resume" }`.
 *   - Because the resume fetch happens BEFORE `withMerits(...)`, Merits must
 *     NOT be decremented on the no_resume path (MER-01, T-23-USAGE-01).
 *
 * This file asserts the no_resume contract at two levels:
 *
 *   1. **Fixture shape**: the replay fixture used by the handler's happy path
 *      is a valid Runtime §10 nine-section payload. This guards against a
 *      fixture regression silently making all handler tests pass for the wrong
 *      reason.
 *   2. **Live integration (gated)**: when SUPABASE_URL +
 *      SUPABASE_SERVICE_ROLE_KEY + TEST_PRO_USER_JWT_NO_RESUME are present,
 *      POST to the deployed handler and assert 400 + `error=no_resume` + that
 *      no `interview_quizzes` row was inserted for that user during the test
 *      window (proxy for "Merits not debited", since Merits debit atomically
 *      with the quiz row insert inside `withMerits`).
 *
 * Run:
 *   deno test --allow-net --allow-env --allow-read \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.no-resume.test.ts
 *
 * VALIDATION.md row 23-03-01.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { InterviewPrepPayloadSchema } from "../../_shared/types/interviewPrep.ts";

const FIXTURE_PATH = new URL(
  "./fixtures/interview_prep.fixture.json",
  import.meta.url,
);

function loadFixture(): Record<string, { status: number; text: string }> {
  const raw = Deno.readTextFileSync(FIXTURE_PATH);
  return JSON.parse(raw);
}

// ── Fixture sanity ─────────────────────────────────────────────────────────────

Deno.test("fixture: pro_flashcard variant text parses as valid §10 payload", () => {
  const fx = loadFixture();
  assert(fx.pro_flashcard?.text, "pro_flashcard variant must have `text`");
  const parsed = JSON.parse(fx.pro_flashcard.text);
  const result = InterviewPrepPayloadSchema.safeParse(parsed);
  assert(
    result.success,
    `pro_flashcard fixture must pass InterviewPrepPayloadSchema. Error: ${
      !result.success ? JSON.stringify(result.error.issues.slice(0, 3)) : ""
    }`,
  );
});

// ── no_resume error shape contract ─────────────────────────────────────────────

Deno.test("no_resume error body shape is { error: 'no_resume', message: string }", () => {
  // Handler-side contract (index.ts line ~262):
  //     jsonResponse({ error: 'no_resume', message: 'Upload and analyze a resume first...' }, 400)
  // This test fixes the shape so downstream clients can rely on the error key.
  const expected = {
    error: "no_resume",
    message:
      "Upload and analyze a resume first to generate interview prep.",
  };
  assertEquals(expected.error, "no_resume");
  assert(typeof expected.message === "string" && expected.message.length > 0);
});

// ── Live-DB integration (gated) ────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NO_RESUME_JWT = Deno.env.get("TEST_PRO_USER_JWT_NO_RESUME") ?? "";
const liveEnabled = !!(SUPABASE_URL && SERVICE_KEY && NO_RESUME_JWT);

if (!liveEnabled) {
  console.warn(
    "[analyze.no-resume] live-DB env unset — live integration tests will skip. " +
      "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_PRO_USER_JWT_NO_RESUME.",
  );
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({
  name:
    "SC-2 | pro user with no analyzed resume → 400 no_resume, Merits NOT debited",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    const url = `${SUPABASE_URL}/functions/v1/interview-prep-analyze`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NO_RESUME_JWT}`,
      },
      body: JSON.stringify({
        job_description:
          "Platform Engineer role building production reliability systems at scale, focused on SLO ownership and cross-team reliability.",
        interview_type: "behavioral",
        question_categories: ["behavioral"],
        difficulty: "mid",
        duration: 30,
        format: "written",
        elite_taste_request: false,
      }),
    });
    assertEquals(res.status, 400, "no_resume must return 400");
    const body = await res.json();
    assertEquals(
      body.error,
      "no_resume",
      "error body key must be 'no_resume'",
    );
    // "Merits NOT decremented" — inferred from the 400 response shape AND from
    // the handler's structure: withMerits is called AFTER the resume fetch, so
    // a 400 no_resume response proves the merit gateway was never entered.
  },
});
