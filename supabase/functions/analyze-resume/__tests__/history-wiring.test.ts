import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("resume history: persists resume_analysis rows with resume source reference", () => {
  assert(source.includes("analysis_type: 'resume_analysis'"));
  assert(source.includes("source_reference: resumeId"));
  assert(source.includes("primary_score: result.overallScore"));
});

Deno.test("resume history: every resumes update goes through completeAndRecordSuccess", () => {
  const updateCount = [...source.matchAll(/from\('resumes'\)\.update/g)].length;
  assertEquals(updateCount, 1);
  assert(source.includes("recordUsageWithAnalysis("));
  assert(source.includes("'resume_analysis'"));
});
