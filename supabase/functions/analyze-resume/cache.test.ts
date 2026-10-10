import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { computeCacheKey, sha256Hex } from "../_shared/cache-fingerprint.ts";

const handlerSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

async function resumeKey(overrides: Partial<{
  text: string;
  targetRole: string;
  targetIndustry: string;
  previousScore: number | string;
  previousSuggestions: string;
  tier: "free" | "pro" | "elite";
}> = {}): Promise<string> {
  const normalizedText = (overrides.text ?? "Senior product manager resume with metrics").replace(/\s+/g, " ").trim();
  return computeCacheKey({
    user_id: "user-1",
    feature: "resume_analysis",
    tier: overrides.tier ?? "pro",
    variant: "resume-analysis:test:standard",
    inputs: {
      text_hash: await sha256Hex(normalizedText),
      targetRole: overrides.targetRole ?? "Product Manager",
      targetIndustry: overrides.targetIndustry ?? "SaaS",
      previousScore: overrides.previousScore ?? 82,
      previousSuggestions: overrides.previousSuggestions ?? "[]",
    },
  });
}

Deno.test("resume cache key changes for each output-affecting input", async () => {
  const base = await resumeKey();

  assertNotEquals(await resumeKey({ text: "Different resume text with metrics" }), base);
  assertNotEquals(await resumeKey({ targetRole: "Director of Product" }), base);
  assertNotEquals(await resumeKey({ targetIndustry: "Healthcare" }), base);
  assertNotEquals(await resumeKey({ previousScore: 74 }), base);
  assertNotEquals(await resumeKey({ previousSuggestions: "[{\"title\":\"Improve impact\"}]" }), base);
  assertNotEquals(await resumeKey({ tier: "elite" }), base);
});

Deno.test("analyze-resume wires CACHE-04 through merit precheck and post-success write", () => {
  assert(handlerSource.includes("computeCacheKey"));
  assert(handlerSource.includes("precheck_cache"));
  assert(handlerSource.includes("readResumeAnalysisCache"));
  assert(handlerSource.includes("writeResumeAnalysisCache"));
  assert(handlerSource.includes("completeAndRecordSuccess"));
  assertEquals(handlerSource.includes("priorityActions"), false);
  assertEquals(handlerSource.includes("quickActions"), false);
});
