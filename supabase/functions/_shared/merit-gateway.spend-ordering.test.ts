/**
 * SC-7 spend-ordering coverage for the dual-balance merit system.
 *
 * Pins the invariant that `check_and_deduct_merits` spends from the
 * subscription balance BEFORE the shop (top-up) balance, writing 1 or 2
 * ledger rows that share the same `deduction_id` for audit-trail integrity.
 *
 * These tests drive `withMerits` through a fake supabase client whose
 * `rpc('check_and_deduct_merits', …)` hook emulates the SQL spend-ordering
 * rules, so any regression in the wrapper's result-handling or in the fake
 * (kept in-sync with the real SQL body) surfaces in CI.
 *
 * REQ-IDs: MER-14, SHOP-10, ECON-01.
 * Run with: deno test --allow-env --no-check merit-gateway.spend-ordering.test.ts
 */
// RECONCILED (Phase 5 Plan 05-01, 2026-06-19): the injection mechanism drifted.
// The original `runWithFakeClient` reassigned the EXPORTED `getServiceClient`
// binding (`supaMod.getServiceClient = …`), which the current Deno runtime
// rejects with "Cannot assign to read only property 'getServiceClient'" (ESM
// export bindings are immutable). Switched to the project-canonical seam used by
// the on-gate `merit-gateway.test.ts`: materialize the real singleton via
// `getServiceClient()` and patch its mutable `.rpc` METHOD. The SC-7
// spend-ordering CONTRACT (subscription-first drain, shared deduction_id,
// insufficient → 402 with 0 ledger rows) is unchanged — only the plumbing was
// reconciled. merit-gateway.ts source is byte-identical.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Provide env before importing the gateway / constructing the client singleton.
// Response helpers require APP_URL; getServiceClient() requires URL + key (the
// values are never dialed — we patch the singleton's .rpc method below).
//
// WR-03: these three vars are process-global and were previously set at module
// scope and NEVER restored, so on the single-process test:ci gate they leaked into
// every file imported after this one (poisoning any sibling that relies on their
// ABSENCE to exercise a fail-closed branch). We now snapshot the originals and
// restore them in a trailing teardown Deno.test (registered LAST in this file, so
// it runs after these tests but before the next file's tests in the test:ci list).
// The placeholders must still be present at module scope because getServiceClient()
// reads URL+key on its first (lazy) call and withMerits reads APP_URL per response.
const _origAppUrl = Deno.env.get("APP_URL");
const _origSupabaseUrl = Deno.env.get("SUPABASE_URL");
const _origServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
Deno.env.set("APP_URL", "https://test.example.com");
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

import { withMerits, type MeritGatewayContext } from "./merit-gateway.ts";
import { getServiceClient } from "./supabase-client.ts";

// ── Fake service-client factory ───────────────────────────────────────────────

type LedgerRow = {
  balance_type: "subscription" | "shop";
  amount: number;
  deduction_id: string;
  source: string;
};

type FakeState = {
  subscription_balance: number;
  shop_balance: number;
  ledgerRows: LedgerRow[];
};

/**
 * Builds an `.rpc` stub that emulates the SC-7 spend-ordering contract of
 * `check_and_deduct_merits`:
 *   1. If sub + shop < cost → { error: 'insufficient_merits' }, no ledger rows.
 *   2. Otherwise: drain subscription first, then shop for the remainder,
 *      sharing a single deduction_id across 1 or 2 rows.
 *
 * The rate-limiter consults `increment_rate_limit` first; we return an error so
 * the rate-limiter fails OPEN (allowed=true) per its own contract, letting the
 * deduct path run — mirroring the on-gate merit-gateway.test.ts strategy.
 */
function makeRpcStub(state: FakeState, cost: number) {
  return (fn: string, args: Record<string, unknown>) => {
    if (fn === "increment_rate_limit") {
      // Fail-open: rate-limiter returns allowed=true on RPC error (D-09).
      return Promise.resolve({
        data: null,
        error: { message: "rate-limit RPC unavailable (test stub)" },
      });
    }
    if (fn !== "check_and_deduct_merits") {
      return Promise.resolve({ data: null, error: null });
    }
    const deductionId = (args.p_deduction_id as string) ?? crypto.randomUUID();

    if (state.subscription_balance + state.shop_balance < cost) {
      return Promise.resolve({
        data: { error: "insufficient_merits", upgrade_required: true },
        error: null,
      });
    }

    const fromSub = Math.min(cost, state.subscription_balance);
    const fromShop = cost - fromSub;
    state.subscription_balance -= fromSub;
    state.shop_balance -= fromShop;
    if (fromSub > 0) {
      state.ledgerRows.push({
        balance_type: "subscription",
        amount: -fromSub,
        deduction_id: deductionId,
        source: "spend",
      });
    }
    if (fromShop > 0) {
      state.ledgerRows.push({
        balance_type: "shop",
        amount: -fromShop,
        deduction_id: deductionId,
        source: "spend",
      });
    }
    return Promise.resolve({
      data: {
        success: true,
        subscription_spent: fromSub,
        shop_spent: fromShop,
        deducted_from: fromShop > 0 && fromSub > 0 ? "both" : fromSub > 0 ? "subscription" : "shop",
        remaining_balance: state.subscription_balance + state.shop_balance,
        transaction_id: deductionId,
      },
      error: null,
    });
  };
}

/**
 * Drives the REAL `withMerits` through the fake spend-ordering RPC by patching
 * the live service-client singleton's `.rpc` method (a mutable object property —
 * the project-canonical seam; ESM export bindings cannot be reassigned).
 * Restores the original `.rpc` afterwards.
 */
async function runWithFakeClient<T>(
  state: FakeState,
  cost: number,
  ctx: MeritGatewayContext,
  feature: string,
): Promise<{ result: Awaited<ReturnType<typeof withMerits<T>>>; state: FakeState }> {
  const client = getServiceClient() as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const original = client.rpc.bind(client);
  const stub = makeRpcStub(state, cost);
  client.rpc = (name, args) => stub(name, args);

  try {
    const result = await withMerits<T>(ctx, feature, async () => {
      return undefined as unknown as T;
    });
    return { result, state };
  } finally {
    client.rpc = original;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const CTX: MeritGatewayContext = {
  userId: "u1",
  tier: "pro",
  corsType: "user",
};

Deno.test("SC-7 pure-monthly: spend 3 from sub=10 shop=0 -> subscription-only, 1 ledger row", async () => {
  const state: FakeState = { subscription_balance: 10, shop_balance: 0, ledgerRows: [] };
  const { result } = await runWithFakeClient(state, 3, CTX, "resume_analysis");
  // Note: withMerits calls rate-limiter first; in test env without DB, rate-limit
  // is expected to fail-open (returns allowed=true on DB error per D-09).
  assert(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  assertEquals(state.subscription_balance, 7);
  assertEquals(state.shop_balance, 0);
  assertEquals(state.ledgerRows.length, 1);
  assertEquals(state.ledgerRows[0].balance_type, "subscription");
  assertEquals(state.ledgerRows[0].amount, -3);
});

Deno.test("SC-7 mixed: spend 3 from sub=2 shop=5 -> sub:2 + shop:1, 2 ledger rows sharing deduction_id", async () => {
  const state: FakeState = { subscription_balance: 2, shop_balance: 5, ledgerRows: [] };
  const { result } = await runWithFakeClient(state, 3, CTX, "career_compass");
  assert(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  assertEquals(state.subscription_balance, 0);
  assertEquals(state.shop_balance, 4);
  assertEquals(state.ledgerRows.length, 2);
  assertEquals(state.ledgerRows[0].balance_type, "subscription");
  assertEquals(state.ledgerRows[0].amount, -2);
  assertEquals(state.ledgerRows[1].balance_type, "shop");
  assertEquals(state.ledgerRows[1].amount, -1);
  // Shared deduction_id (SC-7 audit trail — the money-integrity assertion).
  assertEquals(state.ledgerRows[0].deduction_id, state.ledgerRows[1].deduction_id);
});

Deno.test("SC-7 pure top-up: spend 3 from sub=0 shop=25 -> shop-only, 1 ledger row", async () => {
  const state: FakeState = { subscription_balance: 0, shop_balance: 25, ledgerRows: [] };
  const { result } = await runWithFakeClient(state, 3, CTX, "linkedin_grader");
  assert(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  assertEquals(state.subscription_balance, 0);
  assertEquals(state.shop_balance, 22);
  assertEquals(state.ledgerRows.length, 1);
  assertEquals(state.ledgerRows[0].balance_type, "shop");
  assertEquals(state.ledgerRows[0].amount, -3);
});

Deno.test("SC-7 insufficient: spend 3 from sub=1 shop=1 -> insufficient_merits, 0 ledger rows", async () => {
  const state: FakeState = { subscription_balance: 1, shop_balance: 1, ledgerRows: [] };
  const { result } = await runWithFakeClient(state, 3, CTX, "recruiting_lens");
  assert(!result.ok, "expected ok=false for insufficient_merits");
  if (!result.ok) {
    assertEquals(result.response.status, 402);
  }
  // No ledger writes on insufficient.
  assertEquals(state.subscription_balance, 1);
  assertEquals(state.shop_balance, 1);
  assertEquals(state.ledgerRows.length, 0);
});

// ── Teardown (WR-03) ────────────────────────────────────────────────────────────
// Registered LAST so it runs after every SC-7 test above but before the next file's
// tests on the test:ci gate. Restores the three module-scope env vars to their
// pre-test values so this file does not leak process-global state into siblings that
// run after it (e.g. ones exercising a SUPABASE_URL-absent fail-closed branch).
Deno.test("WR-03 teardown: restore module-scope env (APP_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)", () => {
  if (_origAppUrl !== undefined) Deno.env.set("APP_URL", _origAppUrl); else Deno.env.delete("APP_URL");
  if (_origSupabaseUrl !== undefined) Deno.env.set("SUPABASE_URL", _origSupabaseUrl); else Deno.env.delete("SUPABASE_URL");
  if (_origServiceKey !== undefined) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", _origServiceKey); else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
});
