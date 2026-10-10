import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCacheKey, sha256Hex } from "../_shared/cache-fingerprint.ts";

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith("/") && raw[2] === ":" ? raw.slice(1) : raw;
}

const source = await Deno.readTextFile(winSafePath("./index.ts"));

Deno.test("CACHE-06: analyze-career uses shared cache substrate", () => {
  assert(source.includes("from '../_shared/cache-fingerprint.ts'"));
  assert(source.includes("computeCacheKey"));
  assert(source.includes("sha256Hex"));
  assert(source.includes(".from('analysis_cache')"));
  assert(source.includes("precheck_cache"));
});

Deno.test("CACHE-06: variants distinguish every Career Compass subpath", () => {
  for (const variant of [
    "free-single-call",
    "pro-elite-short-circuit",
    "pro-elite-full",
  ]) {
    assert(source.includes(variant), `missing cache variant ${variant}`);
  }
});

Deno.test("CACHE-06: cache inputs include normalized content hashes and branch controls", () => {
  for (const inputName of [
    "resume_text_hash",
    "linkedin_text_hash",
    "linkedinUrl",
    "allowResumeOnly",
  ]) {
    assert(source.includes(inputName), `missing cache input ${inputName}`);
  }
});

Deno.test("CACHE-06: cache writes happen after strict validation and durable persistence", () => {
  // 260713-hrd: `assertPaidCareerOutputComplete` → `assertCareerOutputComplete`. The old name
  // encoded the bug: completeness was asserted only for PAID tiers, so a truncated Free result
  // sailed through. Completeness is now asserted at every tier, and the ordering guarantee this
  // test protects (validate → persist → cache) is unchanged and still load-bearing: a truncated
  // result must never reach the durable store OR the cache.
  const validation = source.indexOf("assertCareerOutputComplete(analysisResult");
  const persistence = source.indexOf("persistCareerResultAndRecordUsage(supabase");
  const cacheWrite = source.indexOf("writeCareerAnalysisCache(supabase");

  assert(validation > -1, "missing strict validation");
  assert(persistence > -1, "missing persistence");
  assert(cacheWrite > -1, "missing cache write");
  assert(validation < persistence, "validation must happen before persistence");
  assert(persistence < cacheWrite, "cache write must happen after persistence");
});

Deno.test("CACHE-06: exact-input key changes by tier, resume, LinkedIn, URL, and resume-only flag", async () => {
  const base = {
    user_id: "user-1",
    feature: "career_compass",
    tier: "pro" as const,
    variant: "career-overload-patch-2026-02-25:pro-elite-full",
    inputs: {
      resume_text_hash: await sha256Hex("resume a"),
      linkedin_text_hash: await sha256Hex("linkedin a"),
      linkedinUrl: "https://linkedin.com/in/example",
      allowResumeOnly: false,
    },
  };

  const key = await computeCacheKey(base);
  assertEquals(key.length, 64);
  assertNotEquals(key, await computeCacheKey({ ...base, tier: "elite" }));
  assertNotEquals(key, await computeCacheKey({
    ...base,
    inputs: { ...base.inputs, resume_text_hash: await sha256Hex("resume b") },
  }));
  assertNotEquals(key, await computeCacheKey({
    ...base,
    inputs: { ...base.inputs, linkedin_text_hash: await sha256Hex("linkedin b") },
  }));
  assertNotEquals(key, await computeCacheKey({
    ...base,
    inputs: { ...base.inputs, linkedinUrl: "https://linkedin.com/in/other" },
  }));
  assertNotEquals(key, await computeCacheKey({
    ...base,
    inputs: { ...base.inputs, allowResumeOnly: true },
  }));
});
