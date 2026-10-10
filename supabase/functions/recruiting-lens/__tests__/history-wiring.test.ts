import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("recruiting lens history: pro and elite share one persistence helper", () => {
  assert(source.includes("async function persistRecruitingLensResult"));
  assert(source.includes("analysis_type: 'recruiting_lens'"));
  assert(!source.includes("if (resolvedTier === 'elite')"));
});

Deno.test("recruiting lens history: linked usage uses inserted analysis_results id", () => {
  const helper = source.slice(
    source.indexOf("async function persistRecruitingLensResult"),
    source.indexOf("async function executeParallelCalls"),
  );
  assert(helper.includes(".select('id').single()"));
  assert(helper.includes("recordUsageWithAnalysis(params.userId, 'recruiting_lens', 1, data.id)"));
});

Deno.test("recruiting lens history: synchronous response returns merged output + analysisId (+ run_id under lifecycle)", () => {
  // The async-queue response shape ({ jobId, status: 'queued' }) was removed with the
  // dead queue path (HIST-07). The merit path returns the merged analysis inline; the
  // 04-01 lifecycle path additionally carries run_id for frontend refresh recovery.
  assert(source.includes("JSON.stringify({ ...merged, analysisId })"));
  assert(source.includes("run_id: lifecycleResult.runId"));
});
