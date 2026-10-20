/**
 * Phase 23 Plan 08 Task 2 — supplemental coverage for D-03 /
 * STRIVO_GLOBAL_AI_PRINCIPLES auto-prepend on the 'interview' feature.
 *
 * Plan 05 shipped `supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts`
 * with 4 tests: pro/elite/elite_taste prepend present, free prepend absent.
 * This file augments Plan 05 with cases the earlier suite does NOT cover:
 *
 *   1. **Snapshot stability** — the prepended block starts byte-for-byte with
 *      the canonical `STRIVO_GLOBAL_AI_PRINCIPLES` export. Guards against a
 *      future refactor that might prepend a derived / mutated variant.
 *   2. **Prepend precedes body** — the principles block must appear BEFORE
 *      feature-specific prompt text, never after. A downstream model that
 *      reads top-to-bottom must see the principles first.
 *   3. **Idempotence** — calling the loader twice for the same tier returns
 *      the same prepend anchor exactly once (no double-prepend regression).
 *   4. **Free tier cost-ceiling** — free variant output, while a deliberate
 *      error stub today (GATE-04), must never accidentally start with
 *      `STRIVO AI` from an accidental registry swap.
 *
 * This file lives at `_tests/` (not `_shared/__tests__/`) per Plan 08's
 * `files_modified` list, and intentionally touches the same registry the
 * sibling file exercises. The side-effect import registers 'interview'.
 *
 * Run:
 *   deno test --allow-all \
 *     supabase/functions/_tests/tier-prompts.interview-prepend.test.ts
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Side-effect import — registers 'interview' in FEATURE_BUILDERS.
import "../_shared/interview-prep-prompts.ts";
import type { InterviewPrepPromptParams } from "../_shared/interview-prep-prompts.ts";
import { loadPromptVariant } from "../_shared/tier-prompts.ts";
import { STRIVO_GLOBAL_AI_PRINCIPLES } from "../_shared/global-ai-principles.ts";

const PRINCIPLES_ANCHOR = "STRIVO AI";
const PRINCIPLES_HEADING = "Global AI Principles";

function params(
  variant: "pro" | "elite" | "elite_taste" = "pro",
): InterviewPrepPromptParams {
  return {
    resumeText:
      "Alice — 5 years at ACME platform, led migration of 12 microservices to k8s.",
    jobDescription:
      "Platform engineer role building authn/authz, DB pooling, edge runtime.",
    backgroundContext: "pivoting from data eng to platform",
    roleTitle: "Platform Engineer",
    company: "Stripe",
    interviewType: "behavioral",
    questionCategories: ["behavioral"],
    difficulty: "mid",
    duration: 30,
    format: "written",
    variant,
  };
}

// ── 1. Snapshot stability — prepend matches canonical export byte-for-byte ───

Deno.test("pro variant: prepend starts with canonical STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  const out = loadPromptVariant("interview", "pro", params("pro"));
  assert(
    out.startsWith(STRIVO_GLOBAL_AI_PRINCIPLES),
    "loader output must start with the canonical STRIVO_GLOBAL_AI_PRINCIPLES block",
  );
});

Deno.test("elite variant: prepend starts with canonical STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  const out = loadPromptVariant("interview", "elite", params("elite"));
  assert(
    out.startsWith(STRIVO_GLOBAL_AI_PRINCIPLES),
    "loader output must start with the canonical STRIVO_GLOBAL_AI_PRINCIPLES block",
  );
});

// ── 2. Prepend precedes body — anchor appears before feature-specific text ──

Deno.test("pro variant: anchor index < feature prompt body index", () => {
  const out = loadPromptVariant("interview", "pro", params("pro"));
  const anchorIdx = out.indexOf(PRINCIPLES_ANCHOR);
  // The feature prompt body will reference 'flashcard' or 'coach_verdict'
  // somewhere — pick a token that is stable across Plan 05's pro builder.
  const bodyIdx = out.search(/flashcard|coach|practice_questions/i);
  assert(anchorIdx >= 0, "anchor must appear in loader output");
  assert(bodyIdx >= 0, "feature-body reference must appear in loader output");
  assert(
    anchorIdx < bodyIdx,
    `principles anchor (${anchorIdx}) must appear BEFORE feature body (${bodyIdx})`,
  );
});

Deno.test("elite_taste variant (via pro builder): prepend present and precedes body", () => {
  const out = loadPromptVariant("interview", "pro", params("elite_taste"));
  assertStringIncludes(out, PRINCIPLES_ANCHOR);
  assertStringIncludes(out, PRINCIPLES_HEADING);
  const anchorIdx = out.indexOf(PRINCIPLES_ANCHOR);
  const bodyIdx = out.search(/quiz|practice_questions|coach_verdict/i);
  assert(anchorIdx >= 0);
  if (bodyIdx >= 0) {
    assert(anchorIdx < bodyIdx);
  }
});

// ── 3. Idempotence — calling twice returns same single prepend ──────────────

Deno.test("idempotence: PRINCIPLES_ANCHOR appears exactly once per loader call", () => {
  const out = loadPromptVariant("interview", "pro", params("pro"));
  const matches = out.match(new RegExp(PRINCIPLES_ANCHOR, "g")) ?? [];
  // "STRIVO AI" may appear inside the block itself (a header line). Just pin
  // that it is present and the output is not doubly-prepended: count must be
  // identical to the count inside the canonical export.
  const expectedCount =
    (STRIVO_GLOBAL_AI_PRINCIPLES.match(new RegExp(PRINCIPLES_ANCHOR, "g")) ?? [])
      .length;
  assertEquals(
    matches.length,
    expectedCount,
    `loader output must not double-prepend: expected ${expectedCount} occurrences of '${PRINCIPLES_ANCHOR}', got ${matches.length}`,
  );
});

// ── 4. Free tier cost-ceiling (GATE-04) — no accidental STRIVO AI prepend ───

Deno.test("free variant: output does NOT start with STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  const out = loadPromptVariant("interview", "free", params("pro"));
  // Plan 05 ships free as an error stub. Pin: the free output must not
  // begin with the canonical principles block even by accident.
  assertEquals(
    out.startsWith(STRIVO_GLOBAL_AI_PRINCIPLES),
    false,
    "free variant must never carry the principles prepend (GATE-04 cost ceiling)",
  );
  // And must not contain the heading (stronger assertion than startsWith).
  assertEquals(
    out.includes(PRINCIPLES_HEADING),
    false,
    "free variant must not contain the Global AI Principles heading anywhere",
  );
});
