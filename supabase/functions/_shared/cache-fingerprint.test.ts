/**
 * Deno unit tests for cache-fingerprint.ts.
 *
 * Phase 29 / Plan 29-05 — exercises the shared SHA-256 cache key builder.
 * Run with:
 *   deno test --no-check --allow-read supabase/functions/_shared/cache-fingerprint.test.ts
 *
 * Coverage (per 29-VALIDATION.md "Per-Task Verification Map" CACHE-02 row):
 *   1. determinism (identical inputs -> identical hash)
 *   2. CACHE-11 cross-user isolation (differing user_id -> different hash)
 *   3. feature / tier / variant differentiation
 *   4. inputs key-order independence
 *   5. trailing-whitespace + NFC normalization (Pitfall 2 from 29-RESEARCH.md)
 *   6. null vs undefined variant equivalence
 *   7. array input ordering independence
 *   8. sha256Hex golden vector ("hello")
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCacheKey, sha256Hex } from "./cache-fingerprint.ts";

const HEX64 = /^[0-9a-f]{64}$/;

Deno.test("computeCacheKey: identical inputs produce identical hash (determinism)", async () => {
  const opts = {
    user_id: "user-1",
    feature: "resume_analysis",
    tier: "free" as const,
    inputs: { resume_text_hash: "abc123", role: "SWE" },
  };
  const a = await computeCacheKey(opts);
  const b = await computeCacheKey(opts);
  assertEquals(a, b, "identical opts must produce identical hash");
  assert(HEX64.test(a), `hash must be 64-char lowercase hex, got: ${a}`);
});

Deno.test("computeCacheKey: differing user_id produces different hash (CACHE-11 cross-user isolation)", async () => {
  const base = {
    feature: "resume_analysis",
    tier: "pro" as const,
    inputs: { resume_text_hash: "abc123" },
  };
  const a = await computeCacheKey({ ...base, user_id: "user-1" });
  const b = await computeCacheKey({ ...base, user_id: "user-2" });
  assert(a !== b, "differing user_id MUST produce a different hash (CACHE-11)");
});

Deno.test("computeCacheKey: differing feature / tier / variant each produce different hashes", async () => {
  const baseInputs = { resume_text_hash: "abc123" };
  const a = await computeCacheKey({
    user_id: "u",
    feature: "resume_analysis",
    tier: "free",
    inputs: baseInputs,
  });
  const diffFeature = await computeCacheKey({
    user_id: "u",
    feature: "linkedin_grading",
    tier: "free",
    inputs: baseInputs,
  });
  const diffTier = await computeCacheKey({
    user_id: "u",
    feature: "resume_analysis",
    tier: "pro",
    inputs: baseInputs,
  });
  const diffVariant = await computeCacheKey({
    user_id: "u",
    feature: "resume_analysis",
    tier: "free",
    variant: "v2",
    inputs: baseInputs,
  });
  assert(a !== diffFeature, "differing feature must change hash");
  assert(a !== diffTier, "differing tier must change hash");
  assert(a !== diffVariant, "differing variant must change hash");
});

Deno.test("computeCacheKey: inputs key insertion order does not affect the hash", async () => {
  const a = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { a: 1, b: 2, c: 3 },
  });
  const b = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { c: 3, a: 1, b: 2 },
  });
  assertEquals(a, b, "key insertion order must not affect hash (keys are sorted)");
});

Deno.test("computeCacheKey: trailing whitespace and NFC variants are normalized", async () => {
  // Whitespace normalization
  const aTrim = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { role: "SWE" },
  });
  const bTrim = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { role: " SWE " },
  });
  assertEquals(aTrim, bTrim, "trailing whitespace must be trimmed before hashing");

  // NFC normalization: "cafe + acute" — composed (U+00E9) vs decomposed (e + U+0301).
  // Explicit Unicode escape sequences so the fixture is unambiguous regardless
  // of how this source file is encoded on disk.
  const composed = "café";          // c a f é   (1 code point for é)
  const decomposed = "café";       // c a f e + combining acute (2 code points)
  assert(composed !== decomposed, "test fixture sanity: raw strings must differ before normalization");
  assertEquals(
    composed.normalize("NFC"),
    decomposed.normalize("NFC"),
    "fixture sanity: NFC of both forms is equal",
  );
  const aNfc = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { role: composed },
  });
  const bNfc = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { role: decomposed },
  });
  assertEquals(aNfc, bNfc, "NFC-equivalent strings must produce the same hash");
});

Deno.test("computeCacheKey: null vs undefined variant produce identical hash", async () => {
  const base = {
    user_id: "u",
    feature: "f",
    tier: "free" as const,
    inputs: { x: "y" },
  };
  const aNull = await computeCacheKey({ ...base, variant: null });
  const aUndef = await computeCacheKey({ ...base, variant: undefined });
  const aOmitted = await computeCacheKey(base);
  assertEquals(aNull, aUndef, "variant: null and variant: undefined must produce the same hash");
  assertEquals(aNull, aOmitted, "omitting variant must equal variant: null");
});

Deno.test("computeCacheKey: array input ordering is canonicalized", async () => {
  const a = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { tags: ["b", "a", "c"] },
  });
  const b = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { tags: ["a", "b", "c"] },
  });
  const c = await computeCacheKey({
    user_id: "u",
    feature: "f",
    tier: "free",
    inputs: { tags: ["c", "a", "b"] },
  });
  assertEquals(a, b, "array element order must not affect hash");
  assertEquals(b, c, "array element order must not affect hash");
});

Deno.test("sha256Hex: golden vector hello -> 2cf24dba...", async () => {
  const hash = await sha256Hex("hello");
  assertEquals(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    "Web Crypto SHA-256 of 'hello' must match the canonical golden vector",
  );
  assert(HEX64.test(hash), "sha256Hex must return 64-char lowercase hex");
});
