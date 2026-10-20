/**
 * Unit tests for _shared/usage-checker.ts helpers.
 * REQ-IDs: HIST-06, TEST-05
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEntitlement,
  recordUsageWithAnalysis
} from "./usage-checker.ts";
import { getServiceClient } from "./supabase-client.ts";

// Set up env for getServiceClient
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

interface RpcCall { name: string; args: Record<string, unknown> }

function installRpcStub(stub: (name: string, args: Record<string, unknown>) => any) {
  const client = getServiceClient() as any;
  const original = client.rpc.bind(client);
  const calls: RpcCall[] = [];
  client.rpc = async (name: string, args: Record<string, unknown>) => {
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

Deno.test("checkEntitlement: calls can_perform_ai_action and returns result", async () => {
  const stub = installRpcStub((name, _args) => {
    if (name === "can_perform_ai_action") {
      return {
        data: {
          allowed: true,
          tier: "pro",
          reset_date: "2026-06-21T00:00:00Z"
        },
        error: null
      };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });

  try {
    const result = await checkEntitlement("user-123", "resume_analysis");
    assertEquals(result, {
      allowed: true,
      tier: "pro",
      resetDate: "2026-06-21T00:00:00Z"
    });
    assertEquals(stub.calls.length, 1);
    assertEquals(stub.calls[0].name, "can_perform_ai_action");
    assertEquals(stub.calls[0].args.p_user_id, "user-123");
  } finally {
    stub.restore();
  }
});

Deno.test("recordUsageWithAnalysis: calls 4-arg record_ai_usage and returns ok", async () => {
  const stub = installRpcStub((name, _args) => {
    if (name === "record_ai_usage") {
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected RPC: ${name}` } };
  });

  try {
    const result = await recordUsageWithAnalysis("user-123", "resume_analysis", 1, "analysis-456");
    assertEquals(result, { ok: true });
    assertEquals(stub.calls.length, 1);
    assertEquals(stub.calls[0].name, "record_ai_usage");
    assertEquals(stub.calls[0].args, {
      p_user_id: "user-123",
      p_action_type: "resume_analysis",
      p_credits: 1,
      p_analysis_id: "analysis-456"
    });
  } finally {
    stub.restore();
  }
});

Deno.test("checkEntitlement: handles error by failing closed", async () => {
  const stub = installRpcStub((_name, _args) => {
    return { data: null, error: { message: "db error" } };
  });

  try {
    const result = await checkEntitlement("user-123", "resume_analysis");
    assertEquals(result.allowed, false);
    assertEquals(result.tier, "unknown");
  } finally {
    stub.restore();
  }
});
