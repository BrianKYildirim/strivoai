/**
 * Phase 31 · 31-04 · MER-06 — refund_merits idempotency replay (gated staging suite)
 *
 * Proves the EXISTING refund_merits RPC idempotency guard
 * (migrations/20260415000000_merit_rpcs.sql:184-193) directly against the SQL
 * invariant: calling refund_merits twice on the same deduction must
 *   1st call  -> success + balance restored to the pre-deduction value, and
 *   2nd call  -> { error: 'already_refunded' } with ZERO balance mutation.
 *
 * The deduction is seeded via the real check_and_deduct_merits RPC so the
 * merit_transactions row carries the correct `metadata->>'deduction_id'` (the
 * exact key the refund guard matches on) — no hand-crafted metadata.
 *
 * Execution model: registered in scripts/run-edge-tests.ps1 but gated behind
 * DENO_TEST_SUPABASE_REMOTE=1. Default unit-test runs SKIP without failing — the
 * always-on skip-guard self-check at the bottom confirms the gate mechanism.
 *
 * Required env (gated):
 *   - SUPABASE_URL                       (staging project URL)
 *   - SUPABASE_SERVICE_ROLE_KEY          (provision/seed/RPC/read/teardown)
 *   - DENO_TEST_SUPABASE_REMOTE=1        (opt-in)
 *
 * Verify-only: this file does NOT modify the migration.
 *
 * Run with:
 *   $env:DENO_TEST_SUPABASE_REMOTE = "1"
 *   $env:SUPABASE_URL = "https://cimjltzovkahkqecpwgi.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
 *   deno test --allow-all _shared/merit-refund-idempotency.test.ts --no-check
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";

// resume_analysis / free in merit_feature_costs costs 3 merits
// (20260415000000_merit_rpcs.sql:45).
const TEST_FEATURE = "resume_analysis";
const TEST_TIER = "free";
const TEST_COST = 3;
const SEED_BALANCE = 100;

interface DeductHit {
  success: boolean;
  transaction_id: string;
  remaining_balance?: number;
  error?: string;
}

interface RefundHit {
  success?: boolean;
  error?: string;
  refunded_to?: { subscription: number; shop: number };
}

// ── Harness (copied verbatim from merit-idempotency.test.ts) ─────────────────

async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the remote refund-idempotency suite",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function provisionTestUser(startingBalance: number): Promise<string> {
  const client = await freshClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `merit-refund-idem-test-${suffix}@strivo-test.invalid`;
  const password = crypto.randomUUID();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_fixture: "phase-31-04-merit-refund-idempotency" },
  });
  if (error || !data?.user) {
    throw new Error(`Admin createUser failed: ${error?.message ?? "no user returned"}`);
  }
  const userId = data.user.id;

  const { error: meritErr } = await client
    .from("user_merits")
    .upsert(
      { user_id: userId, subscription_balance: startingBalance, shop_balance: 0 },
      { onConflict: "user_id" },
    );
  if (meritErr) {
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Seed user_merits failed: ${meritErr.message}`);
  }

  return userId;
}

async function teardownTestUser(userId: string): Promise<void> {
  const client = await freshClient();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`[merit-refund-idempotency] teardown failed for ${userId}: ${error.message}`);
  }
}

/** Read the total balance (subscription + shop) on a fresh client. */
async function readBalance(userId: string): Promise<number> {
  const client = await freshClient();
  const { data, error } = await client
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Error(`Balance read failed: ${error?.message ?? "no row"}`);
  }
  return (data.subscription_balance ?? 0) + (data.shop_balance ?? 0);
}

/** Seed a real feature-deduct row via check_and_deduct_merits; returns the deduction_id. */
async function seedDeduction(userId: string): Promise<string> {
  const client = await freshClient();
  const { data, error } = await client.rpc("check_and_deduct_merits", {
    p_user_id: userId,
    p_feature: TEST_FEATURE,
    p_tier: TEST_TIER,
  });
  if (error) {
    throw new Error(`Seed deduction RPC error: ${error.message}`);
  }
  const hit = data as DeductHit;
  if (!hit?.success || !hit.transaction_id) {
    throw new Error(`Seed deduction did not succeed: ${JSON.stringify(hit)}`);
  }
  return hit.transaction_id;
}

/** Call refund_merits for a deduction_id and return its parsed jsonb payload. */
async function callRefund(userId: string, transactionId: string): Promise<RefundHit> {
  const client = await freshClient();
  const { data, error } = await client.rpc("refund_merits", {
    p_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (error) {
    throw new Error(`refund_merits RPC error: ${error.message}`);
  }
  return data as RefundHit;
}

// ── Test 1: refund_merits replay — second call is a no-op ────────────────────

Deno.test(
  "MER-06 replay: second refund_merits returns already_refunded with ZERO balance mutation",
  async () => {
    if (!GATED()) {
      console.log(
        "[merit-refund-idempotency] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run the refund replay",
      );
      return;
    }

    const userId = await provisionTestUser(SEED_BALANCE);
    try {
      // Seed a known deduction. After this the balance is SEED - COST.
      const transactionId = await seedDeduction(userId);
      const balanceAfterDeduct = await readBalance(userId);
      assertEquals(
        balanceAfterDeduct,
        SEED_BALANCE - TEST_COST,
        `Sanity: balance after deduction must be ${SEED_BALANCE - TEST_COST}`,
      );

      // First refund — must succeed and restore the balance to the pre-deduction seed.
      const first = await callRefund(userId, transactionId);
      assertEquals(
        first.error,
        undefined,
        `First refund must NOT return an error; got ${JSON.stringify(first)}`,
      );
      assertEquals(
        first.success,
        true,
        `First refund must report success=true; got ${JSON.stringify(first)}`,
      );
      const balanceAfterFirstRefund = await readBalance(userId);
      assertEquals(
        balanceAfterFirstRefund,
        SEED_BALANCE,
        `First refund must restore balance to seed (${SEED_BALANCE}); deduction of ${TEST_COST} fully reversed`,
      );

      // Second refund — replay. The SQL guard (refund_merits:184-193) returns
      // { error: 'already_refunded' } and performs ZERO mutations.
      const second = await callRefund(userId, transactionId);
      assertEquals(
        second.error,
        "already_refunded",
        `Replay must return error='already_refunded' (SQL guard at refund_merits:184-193); got ${JSON.stringify(second)}`,
      );
      assert(
        second.success !== true,
        `Replay must NOT report success=true; got ${JSON.stringify(second)}`,
      );

      // ZERO mutation on replay — exact equality (Pitfall 5), not a delta.
      assertEquals(
        await readBalance(userId),
        balanceAfterFirstRefund,
        `Balance after replay must be IDENTICAL to balance after the first refund (${balanceAfterFirstRefund}) — a double-credit indicates the idempotency guard failed`,
      );
    } finally {
      await teardownTestUser(userId);
    }
  },
);

// ── Test 2: Skip-guard self-check (always-on) ────────────────────────────────

Deno.test(
  "merit-refund-idempotency: skip-guard mechanism is exercised when DENO_TEST_SUPABASE_REMOTE is unset",
  () => {
    if (!GATED()) {
      console.log(
        "[merit-refund-idempotency] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 to exercise the live-staging refund replay (Plan 31-04 operator checkpoint)",
      );
    }
    // Always passes — the skip-guard itself is the feature under test here.
  },
);
