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

Deno.test("TEST-05 LinkedIn: successful staging run writes linkedin_grades and linked usage", async () => {
  if (skipRemote("linkedin success")) return;
  const { userId, jwt } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("grade-linkedin", jwt, {
    profileContent: optionalEnv("MERIT_TEST_LINKEDIN_TEXT") ||
      "Product leader with SaaS roadmap ownership, experimentation, customer research, analytics instrumentation, stakeholder management, and measurable launch outcomes across growth teams.",
    profileUrl: optionalEnv("MERIT_TEST_LINKEDIN_URL") || "https://www.linkedin.com/in/history-persistence-test",
  });

  assertFunctionSucceeded(result, "grade-linkedin");
  const usage = await latestLinkedUsage({ userId, actionType: "linkedin_grading", sinceIso });
  const row = await assertTableRow("linkedin_grades", usage.analysis_id);
  assertEquals(row.id, usage.analysis_id);
  await cleanupRows([{ table: "usage_tracking", id: usage.id }, { table: "linkedin_grades", id: usage.analysis_id }]);
});
