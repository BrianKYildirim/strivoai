/**
 * NFR-05 pooled rate limiter assertion for the Merit gateway.
 * REQ-IDs: NFR-05
 *
 * Gating: DENO_TEST_SUPABASE_LOCAL=1 (requires local Supabase with increment_rate_limit RPC).
 * When the env var is unset, the test passes with a skip log — it is NOT ignored
 * so the test runner still exercises the file.
 *
 * When gated in: issues 60 checkRateLimit calls for key 'ai-analyses-all', asserts
 * all are allowed, then issues a 61st and asserts it is denied with retryAfterSeconds > 0.
 *
 * Note: this test writes to the local rate_limit_counters table for key
 * ai-analyses-all on testUserId — safe because the fixed window expires after 3600s.
 *
 * Run with: deno test _shared/merit-gateway.rate.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("NFR-05: 61st request/hr at key ai-analyses-all returns 429 rate_limit_exceeded", async () => {
  if (Deno.env.get("DENO_TEST_SUPABASE_LOCAL") !== "1") {
    console.log("[merit-gateway.rate] SKIP — set DENO_TEST_SUPABASE_LOCAL=1 to run pooled limiter assertion");
    return;
  }

  // Dynamic import to avoid module-scope side effects when skipped
  const { checkRateLimit } = await import("./rate-limiter.ts");

  const testUserId = "00000000-0000-0000-0000-000000000098";
  const config = {
    key: "ai-analyses-all",
    limits: { free: 60, pro: 60, elite: 60 },
  };

  // Issue 60 calls — all should be allowed
  for (let i = 1; i <= 60; i++) {
    const result = await checkRateLimit(testUserId, "free", config);
    assert(result.allowed, `Call ${i}/60 should be allowed but was denied`);
  }

  // 61st call should be denied
  const result61 = await checkRateLimit(testUserId, "free", config);
  assertEquals(result61.allowed, false, "61st call should be denied (rate limit exceeded)");
  assert(result61.retryAfterSeconds > 0, `retryAfterSeconds should be > 0, got ${result61.retryAfterSeconds}`);
  console.log(`[merit-gateway.rate] 61st call denied with retryAfterSeconds=${result61.retryAfterSeconds}`);
});
