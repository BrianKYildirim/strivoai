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

Deno.test("TEST-05 career: successful staging run writes analysis_results and linked usage", async () => {
  if (skipRemote("career success")) return;
  const { userId, jwt } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("analyze-career", jwt, {
    resumeTextContent: optionalEnv("MERIT_TEST_RESUME_TEXT") ||
      "Product leader with eight years in B2B SaaS, shipping analytics products, increasing activation, mentoring teams, and partnering with sales and customer success.",
    resumeFilePath: "history-persistence-test.pdf",
    linkedinPdfContent: optionalEnv("MERIT_TEST_LINKEDIN_TEXT") ||
      "LinkedIn profile for a product leader with SaaS roadmap ownership, go-to-market collaboration, analytics, experimentation, and team leadership experience.",
    linkedinUrl: optionalEnv("MERIT_TEST_LINKEDIN_URL") || "https://www.linkedin.com/in/history-persistence-test",
    targetRoles: ["Senior Product Manager"],
  });

  assertFunctionSucceeded(result, "analyze-career");
  const usage = await latestLinkedUsage({ userId, actionType: "career_compass", sinceIso });
  await assertAnalysisResult({ analysisId: usage.analysis_id, analysisType: "career_compass" });
  await cleanupRows([{ table: "usage_tracking", id: usage.id }, { table: "analysis_results", id: usage.analysis_id }]);
});
