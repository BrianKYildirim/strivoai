import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertFunctionSucceeded,
  assertTableRow,
  cleanupRows,
  invokeFunction,
  latestLinkedUsage,
  optionalEnv,
  remoteTestFixture,
  skipRemote,
} from "../../_shared/__tests__/history-persistence-remote.ts";

Deno.test("TEST-05 Interview Prep: successful staging run writes interview_quizzes and linked usage", async () => {
  if (skipRemote("interview prep success")) return;
  const { userId, jwt } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("interview-prep-analyze", jwt, {
    job_description: optionalEnv("MERIT_TEST_JOB_DESCRIPTION") ||
      "We need a product manager to lead discovery, prioritize roadmap bets, partner with engineering, measure activation, and communicate clearly with executives.",
    role_title: "Product Manager",
    company: "Strivo Test Co",
    interview_type: "behavioral",
    question_categories: ["leadership", "product strategy"],
    difficulty: "mid",
    duration: 30,
    format: "written",
  });

  assertFunctionSucceeded(result, "interview-prep-analyze");
  const usage = await latestLinkedUsage({ userId, actionType: "interview_prep", sinceIso });
  const row = await assertTableRow("interview_quizzes", usage.analysis_id);
  assertEquals(row.id, usage.analysis_id);
  await cleanupRows([{ table: "usage_tracking", id: usage.id }, { table: "interview_quizzes", id: usage.analysis_id }]);
});
