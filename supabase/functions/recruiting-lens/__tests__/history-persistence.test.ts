import {
  assertAnalysisResult,
  assertFunctionSucceeded,
  cleanupRows,
  invokeFunction,
  latestLinkedUsage,
  optionalEnv,
  remoteTestFixture,
  skipRemote,
} from "../../_shared/__tests__/history-persistence-remote.ts";

Deno.test("TEST-05 Recruiting Lens: successful staging run writes analysis_results and linked usage", async () => {
  if (skipRemote("recruiting lens success")) return;
  const { userId, jwt } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("recruiting-lens", jwt, {
    resumeSummary: optionalEnv("MERIT_TEST_RESUME_TEXT") ||
      "Senior product manager with SaaS launch experience, analytics ownership, customer discovery, stakeholder communication, and measurable activation improvements.",
    company: "Strivo Test Co",
    roleTitle: "Senior Product Manager",
    jobDescription: optionalEnv("MERIT_TEST_JOB_DESCRIPTION") ||
      "We need a senior product manager to own activation, roadmap prioritization, customer discovery, experimentation, analytics, and cross-functional launch execution.",
    linkedinText: optionalEnv("MERIT_TEST_LINKEDIN_TEXT") || undefined,
  });

  assertFunctionSucceeded(result, "recruiting-lens");
  const usage = await latestLinkedUsage({ userId, actionType: "recruiting_lens", sinceIso });
  await assertAnalysisResult({ analysisId: usage.analysis_id, analysisType: "recruiting_lens" });
  await cleanupRows([{ table: "usage_tracking", id: usage.id }, { table: "analysis_results", id: usage.analysis_id }]);
});
