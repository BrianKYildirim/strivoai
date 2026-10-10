import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCacheKey, sha256Hex } from "../_shared/cache-fingerprint.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

// 04-04 (Pitfall 8 / T-04-12): the cache/idempotency identity is now a STABLE
// profileContent-hash + url ONLY. prior_grade_id (a save-mutated field) is REMOVED
// — it is what made every rerun compute a different key, miss cache, and re-anchor.
async function keyFor(profileContent: string): Promise<string> {
  return await computeCacheKey({
    user_id: "00000000-0000-4000-8000-000000000001",
    feature: "linkedin_grading",
    tier: "pro",
    variant: "linkedin-grader:v5.0:100pt-banded",
    inputs: {
      profileContent_hash: await sha256Hex(profileContent),
      profileUrl: "https://linkedin.com/in/example",
    },
  });
}

Deno.test("CACHE-05: identical profile content yields a STABLE key (rerun cache hit)", async () => {
  const first = await keyFor("normalized profile content");
  const second = await keyFor("normalized profile content");
  assertEquals(first, second);
});

Deno.test("CACHE-05: different profile content misses (content-addressed identity)", async () => {
  const first = await keyFor("normalized profile content A");
  const second = await keyFor("normalized profile content B");
  assertNotEquals(first, second);
});

Deno.test("CACHE-05: grade-linkedin cache identity is stable (content + URL + tier, NO prior_grade_id)", () => {
  assert(source.includes("import { computeCacheKey, sha256Hex } from '../_shared/cache-fingerprint.ts';"));
  assert(source.includes("profileContent_hash"));
  assert(source.includes("profileUrl"));
  assert(source.includes("tier,"));
  // The save-mutated field is gone from the handler's identity (Pitfall 8 / T-04-12).
  assertEquals(source.includes("prior_grade_id"), false);
});

Deno.test("CACHE-05: paid path passes precheck_cache to withMerits", () => {
  assert(source.includes("precheck_cache: () => readLinkedInGradeCache"));
  assert(source.includes("const gated = await withMerits("));
});

Deno.test("CACHE-05: cache hits update hit metadata and return the cached grade response", () => {
  assert(source.includes(".from('analysis_cache')"));
  assert(source.includes("last_hit_at: new Date().toISOString()"));
  assert(source.includes("hit_count: Number(data.hit_count ?? 1) + 1"));
  assert(source.includes("cached: responseForLinkedInGrade(rawResponse)"));
});

Deno.test("CACHE-05: cache writes happen after persistence and linked usage", () => {
  const storeIndex = source.indexOf("const stored = await storeAndNotify(result.parsed);");
  const usageIndex = source.indexOf("recordUsageWithAnalysis(userId, 'linkedin_grading', 1, stored.recordId)");
  const cacheWriteIndex = source.indexOf("await writeLinkedInGradeCache(getServiceClient(), {", usageIndex);

  assert(storeIndex > -1);
  assert(usageIndex > storeIndex);
  assert(cacheWriteIndex > usageIndex);
});

Deno.test("CACHE-05: cache hit bypasses Anthropic through merit gateway sentinel", () => {
  assert(source.includes("precheck_cache"));
  // quick task 260713-2ay: invokeWithRetry moved to _shared/ai-retry.ts and takes a THIRD
  // argument — the request-scoped total deadline that bounds the (now 408-retrying) loop.
  // Intent unchanged: pin that the AI call sits behind the cache precheck, not in front of it.
  assertEquals(source.includes("invokeWithRetry(aiParams, log, { deadlineAt })"), true);
});
