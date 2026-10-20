import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("career history: durable result is written before linked usage", () => {
  const helper = source.slice(
    source.indexOf("async function persistCareerResultAndRecordUsage"),
    source.indexOf("// 260419-35x"),
  );
  assert(helper.includes(".from('analysis_results')"));
  assert(helper.includes(".insert({"));
  assert(helper.indexOf("recordUsageWithAnalysis(") > helper.indexOf(".insert({"));
  assert(helper.includes("'career_compass'"));
});

Deno.test("career history: merit paths call shared persistence helper", () => {
  assert(source.includes("label: 'Free-single-call'"));
  assert(source.includes("label: 'Merit path'"));
  assert(source.includes("label: 'Legacy path'"));
});

Deno.test("career history: Merits are the ONLY paywall — usage is RECORDED, never gated on", () => {
  // RULE-1 FLIP (quick task 260713-hrd). This used to assert the legacy entitlement gate was
  // PRESENT: `checkEntitlement(authenticatedUserId, 'career_compass')`.
  //
  // That gate was a second quota running alongside Merits (`can_perform_ai_action`: Free = 3
  // AI actions per cycle, counted across ALL features). Career Compass told Free users to run
  // Resume Analysis and LinkedIn Grader first — and those priors ate 2 of the 3 actions, so
  // the feature deadlocked itself. Production showed Free users stuck at exactly 3 usage rows,
  // charged Merits at submit and then permanently 429'd here.
  //
  // Inverted, not weakened: the gate must be GONE, and the usage ROW must still be written
  // (History and analytics depend on it — we record usage, we just never block on it).
  assert(
    !source.includes("checkEntitlement"),
    "the legacy entitlement gate must be gone — Merits are the only paywall",
  );
  assert(
    !source.includes("createUsageLimitResponse"),
    "career must not emit a legacy usage-limit 429",
  );
  assert(
    source.includes("recordUsageWithAnalysis"),
    "usage must still be RECORDED for History/analytics — record, never block",
  );
  assert(!source.includes("checkAndRecordUsage("));
});
