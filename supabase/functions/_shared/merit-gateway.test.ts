/**
 * Unit tests for _shared/merit-gateway.ts pure functions and types.
 * REQ-IDs: BACK-01, MER-11, NFR-09
 *
 * These tests exercise the synchronous, pure-function surface of the gateway
 * (isRefundableAnthropicError, MeritRefundable, MERIT_SYSTEM_ENABLED).
 * Integration tests requiring a live Supabase instance are in the .perf, .rate,
 * and .raw test files gated on DENO_TEST_SUPABASE_LOCAL=1.
 *
 * Run with: deno test _shared/merit-gateway.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isRefundableAnthropicError,
  MeritRefundable,
  MERIT_SYSTEM_ENABLED,
  insufficientMeritsResponse,
  tierLockedResponse,
  withMerits,
  type MeritGatewayContext,
  type MeritGatewayOptions,
} from "./merit-gateway.ts";
import { getServiceClient } from "./supabase-client.ts";

// Set APP_URL for response helper tests (corsHeaders requires it)
Deno.env.set("APP_URL", "https://test.example.com");
// Set Supabase env so getServiceClient() can construct its singleton; the tests
// below patch the singleton's `.rpc` method on the live object to deterministic
// stubs, so the URL/key values do not need to point at a real instance.
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

// ── isRefundableAnthropicError classification tests ─────────────────────────

Deno.test("isRefundableAnthropicError: 500 (5xx) is refundable", () => {
  assertEquals(isRefundableAnthropicError(500, ""), true);
});

Deno.test("isRefundableAnthropicError: 529 overloaded is refundable", () => {
  assertEquals(isRefundableAnthropicError(529, "overloaded"), true);
});

Deno.test("isRefundableAnthropicError: 408 timeout is refundable", () => {
  assertEquals(isRefundableAnthropicError(408, ""), true);
});

Deno.test("isRefundableAnthropicError: 400 bad json is NOT refundable", () => {
  assertEquals(isRefundableAnthropicError(400, "bad json"), false);
});

Deno.test("isRefundableAnthropicError: 200 success is NOT refundable", () => {
  assertEquals(isRefundableAnthropicError(200, ""), false);
});

Deno.test("isRefundableAnthropicError: text-only match for network error patterns", () => {
  // Status is non-refundable (200) but text contains refundable pattern
  assertEquals(isRefundableAnthropicError(200, "ECONNRESET"), true);
  assertEquals(isRefundableAnthropicError(200, "network error"), true);
  assertEquals(isRefundableAnthropicError(200, "AbortError: request timed out"), true);
  assertEquals(isRefundableAnthropicError(200, "overloaded"), true);
  assertEquals(isRefundableAnthropicError(200, "connection timeout"), true);
  // Non-matching text
  assertEquals(isRefundableAnthropicError(200, "parse error"), false);
  assertEquals(isRefundableAnthropicError(200, "validation failed"), false);
});

// ── MERIT_SYSTEM_ENABLED env var test ────────────────────────────────────────

Deno.test("MERIT_SYSTEM_ENABLED reflects env at module load time", () => {
  // Note: MERIT_SYSTEM_ENABLED is read at module-scope (import time), not per-call.
  // In this test environment, the env var was not set to 'true' before the module
  // was imported, so it should be false. This validates the module-scope caching
  // behavior documented in D-05.
  // To test the 'true' case requires a subprocess (deno eval) because module-scope
  // reads happen at import time and cannot be re-evaluated.
  assertEquals(typeof MERIT_SYSTEM_ENABLED, "boolean");
  // Since we did not set MERIT_SYSTEM_ENABLED=true before importing, it should be false
  assertEquals(MERIT_SYSTEM_ENABLED, false);
});

// ── MeritRefundable error class tests ────────────────────────────────────────

Deno.test("MeritRefundable has correct name and status", () => {
  const err = new MeritRefundable(529, "overloaded");
  assertEquals(err.name, "MeritRefundable");
  assertEquals(err.status, 529);
  assertEquals(err.message, "overloaded");
  assert(err instanceof Error, "MeritRefundable must extend Error");
});

// ── Response helper tests ────────────────────────────────────────────────────

Deno.test("insufficientMeritsResponse returns 402 with correct error code", async () => {
  const response = insufficientMeritsResponse("user");
  assertEquals(response.status, 402);
  const body = await response.json();
  assertEquals(body.error, "insufficient_merits");
  assertEquals(body.upgrade_required, true);
  assert(typeof body.message === "string" && body.message.length > 0);
});

Deno.test("tierLockedResponse returns 403 with correct error code", async () => {
  const response = tierLockedResponse("user");
  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, "tier_locked");
  assertEquals(body.upgrade_required, true);
  assert(typeof body.message === "string" && body.message.length > 0);
});

// ── withMerits precheck_cache contract tests (Plan 29-06) ───────────────────
//
// REQ-IDs: CACHE-09 (short-circuit), CACHE-10 (usage_tracking write with
// credits=0 + analysis_id), CACHE-11 (user-scoped via caller's cache_key),
// NFR-05 (CORS/rate-limit/sanitizer/JWT preserved on miss path).
//
// Mocking strategy: getServiceClient() returns a module-level singleton; we
// materialize it once and replace its `.rpc` method on the live object with
// deterministic stubs that record arguments. This covers both the cache-hit
// path (record_ai_usage RPC) and the rate-limit + deduct path (increment_rate_limit
// + check_and_deduct_merits RPCs) without spinning up a real Supabase instance.

interface RpcCall { name: string; args: Record<string, unknown> }

type RpcStub = (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };

function installRpcStub(stub: RpcStub): { calls: RpcCall[]; restore: () => void } {
  const client = getServiceClient() as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const original = client.rpc.bind(client);
  const calls: RpcCall[] = [];
  client.rpc = async (name, args) => {
    calls.push({ name, args });
    return stub(name, args);
  };
  return {
    calls,
    restore: () => {
      client.rpc = original;
    },
  };
}

const baseCtx: MeritGatewayContext = {
  userId: "user-abc",
  tier: "pro",
  corsType: "user",
};

Deno.test("withMerits precheck_cache: hit short-circuits rate-limit + deduct and returns cache-hit sentinel", async () => {
  const stub = installRpcStub((name, _args) => {
    // Only record_ai_usage should be called on the cache-hit path.
    if (name === "record_ai_usage") return { data: null, error: null };
    // Any other RPC is unexpected on this path — return error to make the
    // assertion fail loudly if the gateway reaches rate-limit / deduct.
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });
  try {
    let fnInvoked = false;
    const result = await withMerits<{ foo: string }>(
      baseCtx,
      "resume_analysis",
      async () => {
        fnInvoked = true;
        return { foo: "should-not-run" };
      },
      {
        precheck_cache: async () => ({ cached: { foo: "bar" }, analysis_id: "orig-id" }),
      },
    );
    assert(result.ok, "result must be ok");
    if (!result.ok) return; // type guard
    assertEquals(result.value, { foo: "bar" });
    assertEquals(result.transactionId, "cache-hit");
    assertEquals(fnInvoked, false, "fn must NOT be invoked on cache-hit");

    // CACHE-10 / D-13: usage_tracking row written with credits=0 + analysis_id
    const recordCall = stub.calls.find((c) => c.name === "record_ai_usage");
    assert(recordCall, "record_ai_usage must be called on cache-hit");
    assertEquals(recordCall!.args.p_credits, 0);
    assertEquals(recordCall!.args.p_analysis_id, "orig-id");
    assertEquals(recordCall!.args.p_user_id, "user-abc");
    assertEquals(recordCall!.args.p_action_type, "resume_analysis");

    // CACHE-09 / D-15: rate-limit + deduct must NOT be consulted on cache-hit
    const unexpected = stub.calls.find(
      (c) => c.name === "increment_rate_limit" || c.name === "check_and_deduct_merits",
    );
    assertEquals(
      unexpected,
      undefined,
      `cache-hit must skip rate-limit + deduct (saw: ${unexpected?.name})`,
    );
  } finally {
    stub.restore();
  }
});

Deno.test("withMerits precheck_cache: record_ai_usage error is swallowed (D-08)", async () => {
  const stub = installRpcStub((name) => {
    if (name === "record_ai_usage") {
      return { data: null, error: { message: "simulated db transient" } };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });
  try {
    const result = await withMerits<{ x: number }>(
      baseCtx,
      "linkedin_grader",
      async () => ({ x: 999 }),
      {
        precheck_cache: async () => ({ cached: { x: 1 }, analysis_id: "an-id-2" }),
      },
    );
    // User STILL gets the cached value despite the usage-tracking write error.
    assert(result.ok, "result must be ok even when record_ai_usage errors");
    if (!result.ok) return;
    assertEquals(result.value, { x: 1 });
    assertEquals(result.transactionId, "cache-hit");
  } finally {
    stub.restore();
  }
});

Deno.test("withMerits precheck_cache: throwing callback is treated as miss (defensive — D-12)", async () => {
  // On a throw, the gateway falls through to the existing rate-limit + deduct
  // path. We stub increment_rate_limit to return "not allowed" so we can assert
  // the fall-through happened without needing the full deduct surface; the
  // gateway will return a 429 Response (ok: false). That return shape proves
  // the existing path was consulted — i.e. the throw did NOT propagate as a
  // gateway error and did NOT short-circuit.
  const stub = installRpcStub((name, _args) => {
    if (name === "increment_rate_limit") {
      // rate-limiter expects { current_count, limit, window_start } shape, but
      // returning a count >= limit signals "blocked" via fail-closed at the
      // helper layer. To keep this test independent of rate-limiter internals,
      // return an error → rate-limiter fails OPEN (allowed=true) per its own
      // contract, so we proceed to the deduct call which we then short-circuit.
      return { data: null, error: { message: "rate-limit RPC unavailable (test stub)" } };
    }
    if (name === "check_and_deduct_merits") {
      // Simulate insufficient merits → gateway returns a 402 response (ok: false).
      return { data: { error: "insufficient_merits", upgrade_required: true }, error: null };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });
  try {
    const result = await withMerits<{ ok: boolean }>(
      baseCtx,
      "career_compass",
      async () => ({ ok: true }),
      {
        precheck_cache: async () => {
          throw new Error("simulated precheck implementation bug");
        },
      },
    );
    // Fall-through path was consulted: rate-limit fail-open → deduct →
    // insufficient_merits → ok:false with 402 response. The key assertion is
    // that the gateway did NOT crash with the simulated error AND did NOT
    // return a cache-hit sentinel.
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.response.status, 402);
    // increment_rate_limit was consulted → confirms fall-through to the
    // existing path.
    const sawRateLimit = stub.calls.some((c) => c.name === "increment_rate_limit");
    assert(sawRateLimit, "rate-limit RPC must be consulted when precheck throws");
    // check_and_deduct_merits was consulted → confirms full fall-through.
    const sawDeduct = stub.calls.some((c) => c.name === "check_and_deduct_merits");
    assert(sawDeduct, "deduct RPC must be consulted when precheck throws");
  } finally {
    stub.restore();
  }
});

Deno.test("withMerits precheck_cache: null result falls through to existing rate-limit + deduct path", async () => {
  const stub = installRpcStub((name, _args) => {
    if (name === "increment_rate_limit") {
      return { data: null, error: { message: "rate-limit RPC unavailable (test stub)" } };
    }
    if (name === "check_and_deduct_merits") {
      return { data: { error: "insufficient_merits", upgrade_required: true }, error: null };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });
  try {
    let fnInvoked = false;
    const result = await withMerits<{ ok: boolean }>(
      baseCtx,
      "recruiting_lens",
      async () => {
        fnInvoked = true;
        return { ok: true };
      },
      {
        precheck_cache: async () => null,
      },
    );
    // Miss → existing rate-limit + deduct path → insufficient_merits 402.
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.response.status, 402);
    assertEquals(fnInvoked, false, "fn must NOT run when deduct denies");
    // record_ai_usage must NOT be called on the miss path (callers may write
    // their own usage row after a successful deduct; the cache-hit branch is
    // the only place the gateway writes it directly).
    const sawRecord = stub.calls.some((c) => c.name === "record_ai_usage");
    assertEquals(sawRecord, false, "record_ai_usage must NOT be called on cache miss");
  } finally {
    stub.restore();
  }
});

Deno.test("withMerits 3-arg call (no options) compiles and runs unchanged (backwards-compat)", async () => {
  const stub = installRpcStub((name, _args) => {
    if (name === "increment_rate_limit") {
      return { data: null, error: { message: "rate-limit RPC unavailable (test stub)" } };
    }
    if (name === "check_and_deduct_merits") {
      return { data: { error: "insufficient_merits", upgrade_required: true }, error: null };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });
  try {
    // Call without the 4th `options` arg — must compile and execute the
    // existing rate-limit + deduct path identically to pre-29-06 callers.
    const result = await withMerits<{ ok: boolean }>(
      baseCtx,
      "interview_prep_analyze",
      async () => ({ ok: true }),
    );
    assertEquals(result.ok, false);
    if (result.ok) return;
    assertEquals(result.response.status, 402);
    // No record_ai_usage write on the existing path.
    const sawRecord = stub.calls.some((c) => c.name === "record_ai_usage");
    assertEquals(sawRecord, false);
  } finally {
    stub.restore();
  }
});
