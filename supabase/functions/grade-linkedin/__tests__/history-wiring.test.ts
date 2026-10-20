import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

// Rule-1 stale-test reconciliation (09-07): storeAndNotify's return type gained a third
// field, `analysisId`, when the analysis_results linkage landed. The old assertion pinned
// the 2-field shape `{ response, recordId }` verbatim and went RED on a legitimate product
// change. The CONTRACT being guarded is unchanged and is what is asserted here: the helper
// still hands the linkedin_grades row id back to the caller so usage can be linked to it.
Deno.test("linkedin history: storeAndNotify returns the linkedin_grades id", () => {
  assert(source.includes("Promise<{ response: Response; recordId: string; analysisId: string | null }>"));
  assert(source.includes("return { response, recordId: record.id, analysisId };"));
});

Deno.test("linkedin history: usage writes include p_analysis_id via helper", () => {
  assert(source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 1, stored.recordId)"));
  assert(source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 1, record.id)"));
  assert(!source.includes("recordUsageWithAnalysis(userId, 'linkedin_grading', 0"));
});

Deno.test("linkedin history: paid path checks entitlement without pre-writing usage", () => {
  assert(source.includes("checkEntitlement(userId, 'linkedin_grading')"));
  assert(!source.includes("checkAndRecordUsage("));
});
