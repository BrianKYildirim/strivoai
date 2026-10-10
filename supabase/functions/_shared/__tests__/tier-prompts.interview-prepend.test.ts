// supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts
// Phase 23 Plan 05 Task 2 — SC-12 regression.
//
// Asserts that `loadPromptVariant('interview', tier, params)` auto-prepends the
// STRIVO_GLOBAL_AI_PRINCIPLES block for Pro + Elite (both the base Elite quiz
// branch and the Pro-monthly `elite_taste` variant) but NOT for Free.
//
// The side-effect import below registers the 'interview' feature in the
// shared registry.
//
// Run: deno test --allow-net --allow-env --allow-read \
//        supabase/functions/_shared/__tests__/tier-prompts.interview-prepend.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Side-effect import — registers 'interview' in FEATURE_BUILDERS.
import "../interview-prep-prompts.ts";
import type { InterviewPrepPromptParams } from "../interview-prep-prompts.ts";
import { loadPromptVariant } from "../tier-prompts.ts";

// The STRIVO_GLOBAL_AI_PRINCIPLES block opens with this verbatim anchor
// (see _shared/global-ai-principles.ts line 11). Using a stable early
// substring avoids coupling this test to any single line of the full body.
const PRINCIPLES_ANCHOR = "STRIVO AI";
const PRINCIPLES_HEADING = "Global AI Principles";

function validParams(
  variant: "pro" | "elite" | "elite_taste" = "pro",
): InterviewPrepPromptParams {
  return {
    resumeText:
      "Alice, 5 years at ACME platform team — led migration of 12 microservices to k8s, shipped CI pipeline for 40+ teams.",
    jobDescription:
      "Platform engineer role building supabase-style infra: authn, authz, DB pooling, edge runtime.",
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

Deno.test("pro + interview → STRIVO_GLOBAL_AI_PRINCIPLES prepended", () => {
  const out = loadPromptVariant("interview", "pro", validParams("pro"));
  assertStringIncludes(out, PRINCIPLES_ANCHOR);
  assertStringIncludes(out, PRINCIPLES_HEADING);
});

Deno.test("elite + interview → STRIVO_GLOBAL_AI_PRINCIPLES prepended", () => {
  const out = loadPromptVariant("interview", "elite", validParams("elite"));
  assertStringIncludes(out, PRINCIPLES_ANCHOR);
  assertStringIncludes(out, PRINCIPLES_HEADING);
});

Deno.test("free + interview → no principles prepend (error stub)", () => {
  const out = loadPromptVariant("interview", "free", validParams("pro"));
  // Free variant is an error stub and must not contain the principles heading.
  assertEquals(out.includes(PRINCIPLES_HEADING), false);
  assertStringIncludes(out, "ERROR");
});

Deno.test("pro + elite_taste variant → principles still prepended (prepend is tier-based, not variant-based)", () => {
  const out = loadPromptVariant("interview", "pro", validParams("elite_taste"));
  assertStringIncludes(out, PRINCIPLES_ANCHOR);
  assertStringIncludes(out, PRINCIPLES_HEADING);
});
