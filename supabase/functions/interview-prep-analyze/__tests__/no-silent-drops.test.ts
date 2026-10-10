/**
 * Phase 23 Plan 08 Task 2 — D-11 no-silent-drops helper edge-case coverage.
 *
 * Tests `findDroppedOptionalFields(payload, intake)` (exported from
 * `_shared/interview-prep-validation.ts`) across the Pitfall-4 scan rules:
 *
 *   1. NFC + diacritic-strip normalization for both sides.
 *   2. Lowercase comparison.
 *   3. \b-bounded regex token match for `role_title` and `company`.
 *   4. For `background_context`: ≥4-char non-stopword tokens must match at
 *      least one haystack substring.
 *
 * Extends the existing `_shared/__tests__/interview-prep-validation.test.ts`
 * suite with Plan 08 edge cases the Plan 01 helper spec calls out by name:
 * NFC-vs-NFD normalization, word-boundary enforcement, stopword filtering,
 * and sub-threshold-length tokens in background_context.
 *
 * Run:
 *   deno test --allow-all \
 *     supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findDroppedOptionalFields } from "../../_shared/interview-prep-validation.ts";
import type { InterviewPrepPayload } from "../../_shared/types/interviewPrep.ts";

// Build a minimal valid-shape payload with a configurable coach_verdict.
// `findDroppedOptionalFields` scans coach_verdict ∪ focus_areas ∪ coaching_advice.advice,
// so placing test-signal text in coach_verdict is sufficient.
function makePayload(coachVerdict: string): InterviewPrepPayload {
  return {
    coach_verdict: coachVerdict,
    readiness_score: 50,
    strengths: ["strength-a", "strength-b", "strength-c"],
    gaps: ["gap-a", "gap-b", "gap-c"],
    risks: [],
    readiness_breakdown: {
      role_fit_score: 50,
      experience_score: 50,
      technical_score: 50,
      communication_score: 50,
      preparation_score: 50,
    },
    focus_areas: [
      {
        title: "Communication",
        why: "clarity matters",
        what_to_do: "practice crisp STAR",
      },
    ],
    coaching_advice: {
      advice: "Keep STAR tight. Lead with outcomes.",
      talking_points: ["p1", "p2"],
      do_not_say: ["never"],
    },
    practice_questions: {
      mode: "flashcard",
      items: [
        {
          id: 1,
          prompt: "Tell me about a time ...",
          answer_star: { s: "situation", t: "task", a: "action", r: "result" },
          coach_note: "keep tight",
        },
        {
          id: 2,
          prompt: "Walk through a system design ...",
          answer_star: { s: "situation", t: "task", a: "action", r: "result" },
          coach_note: "keep tight",
        },
        {
          id: 3,
          prompt: "Describe a conflict ...",
          answer_star: { s: "situation", t: "task", a: "action", r: "result" },
          coach_note: "keep tight",
        },
      ],
      overall_coaching_note: "strong overall",
    },
    alignment_blueprint: {
      summary: "Aligned with platform focus.",
      aligned_examples: ["example-1"],
      suggested_reframes: ["reframe-1"],
      mini_plan: ["plan-item-1"],
    },
    questions_to_ask: [],
    next_interview_prep: {
      priorities: [],
      materials: [],
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

// ── 1. Passthrough: all empty optional fields returns [] ─────────────────────

Deno.test("passthrough: empty optional fields returns []", () => {
  const payload = makePayload("Generic verdict without any names.");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "",
    company: "",
    background_context: "",
  });
  assertEquals(dropped, []);
});

// ── 2. Detects dropped company ───────────────────────────────────────────────

Deno.test("detects dropped company: 'Datadog' never appears in payload → ['company']", () => {
  const payload = makePayload("You did great overall — tight STAR.");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "",
    company: "Datadog",
    background_context: "",
  });
  assertEquals(dropped, ["company"]);
});

// ── 3. Stopword filtering in background_context ──────────────────────────────

Deno.test("stopwords in background_context do NOT trigger drop", () => {
  // 'the and with' → all stopwords → tokens list is empty → no match check
  // runs → helper returns [].
  const payload = makePayload("Generic verdict.");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "",
    company: "",
    background_context: "the and with the and with",
  });
  assertEquals(dropped, [], "all-stopword bg must not trigger a drop");
});

// ── 4. NFC normalization: café variants match ───────────────────────────────

Deno.test("NFC normalization: company='Café' (NFD) matches coach_verdict 'Café' (NFC)", () => {
  // NFC: precomposed é (single code point U+00E9)
  // NFD: e + combining acute (U+0065 U+0301)
  const nfc = "Caf\u00e9"; // precomposed
  const nfd = "Cafe\u0301"; // decomposed
  // Helper normalizes BOTH sides via .normalize("NFC") then .normalize("NFD") with
  // combining-mark strip. So 'Café' and 'Cafe\u0301' both collapse to 'cafe'.
  const payload = makePayload(`Great experience at ${nfc} — solid work.`);
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "",
    company: nfd,
    background_context: "",
  });
  assertEquals(dropped, [], "NFD/NFC company variants must be considered equal");
});

// ── 5. Word-boundary enforcement on role_title ───────────────────────────────

Deno.test("word-boundary: 'Data Scientist' role does NOT match 'database' substring → ['role_title']", () => {
  // 'database migration' contains the substring 'data' but NOT the \b-bounded
  // phrase 'data scientist'. Helper must treat role_title as dropped.
  const payload = makePayload(
    "You have strong database migration experience — lean into it.",
  );
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "Data Scientist",
    company: "",
    background_context: "",
  });
  assertEquals(dropped, ["role_title"]);
});

// ── 6. Sub-threshold tokens in background_context ────────────────────────────

Deno.test("background_context with only sub-4-char tokens returns [] (token threshold)", () => {
  // Tokens <4 chars are filtered by the helper's `extractTokens` (line 64:
  // `t.length >= 4`). 'AI ML SaaS BI QA' tokenizes to ['saas'] (4 chars) —
  // 'ai', 'ml', 'bi', 'qa' are all <4 chars and dropped. If `saas` is present
  // in the haystack, drop list stays empty; if absent, drop list returns
  // ['background_context'].
  //
  // This test exercises the 'all tokens below threshold' branch: a bg context
  // containing ONLY sub-threshold tokens should NEVER trigger a drop because
  // the extracted token list is empty and the helper short-circuits.
  const payload = makePayload("Generic verdict without any specific terms.");
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "",
    company: "",
    background_context: "AI ML BI QA go",
  });
  assertEquals(
    dropped,
    [],
    "bg with only sub-4-char tokens must not trigger a silent-drop",
  );
});

// ── 7. Sanity: payload that references all three fields returns [] ──────────

Deno.test("full coverage: coach_verdict names role_title + company + bg token → []", () => {
  const payload = makePayload(
    "Strong fit for Data Scientist role at Datadog given your platform experience. Lean into it.",
  );
  const dropped = findDroppedOptionalFields(payload, {
    role_title: "Data Scientist",
    company: "Datadog",
    background_context: "platform engineering experience with kubernetes",
  });
  assert(
    dropped.length === 0,
    `all fields referenced explicitly — no drops. Got: ${JSON.stringify(dropped)}`,
  );
});
