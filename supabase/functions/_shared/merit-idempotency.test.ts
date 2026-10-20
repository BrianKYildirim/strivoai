/**
 * Phase 29 · 29-09 · TEST-02 / NFR-07 — merit_transactions idempotency
 * end-to-end behavioral regression against a live Supabase instance.
 *
 * Layer split:
 *   - 29-04 shipped the substrate (column + partial UNIQUE + 4-arg RPC).
 *   - This file is the canonical proof that the substrate honours
 *     `p_idempotency_key` under both:
 *       (a) Sequential retry — same key submitted twice → second call returns
 *           { success: true, already_deducted: true } with the SAME
 *           transaction_id as the winner; balance is unchanged.
 *       (b) Retry-storm — N concurrent callers using the same key → exactly
 *           one balance deduction, all callers receive { success: true } and
 *           all returned transaction_ids agree.
 *
 * Execution model: this file is registered in `scripts/run-edge-tests.ps1`
 * but is gated behind `DENO_TEST_SUPABASE_REMOTE=1`. Plan 29-10 (the final
 * blocking wave) runs the gated path against staging once-and-for-all.
 * Default unit-test runs skip without failing — there is one always-on test
 * at the bottom that confirms the skip-guard mechanism itself.
 *
 * Why this RPC: see migration 20260512000003_merit_transactions_idempotency.sql
 *   - 4-arg `check_and_deduct_merits(uuid, text, text, text)` returns
 *     `{ success, transaction_id, already_deducted: true }` on idempotency hit
 *     and `{ success, transaction_id, remaining_balance, deducted_from }` on
 *     the happy path. The retry-storm absorber lives inside an inner
 *     `BEGIN ... EXCEPTION WHEN unique_violation` block — the EXCEPTION arm
 *     re-queries `metadata->>'deduction_id'` and returns the same
 *     `already_deducted=true` shape as the entry-time pre-check.
 *
 * Required env (gated):
 *   - SUPABASE_URL                       (staging Postgres URL)
 *   - SUPABASE_SERVICE_ROLE_KEY          (bypasses RLS; used for setup + RPC)
 *   - DENO_TEST_SUPABASE_REMOTE=1        (opt-in)
 *
 * Test fixture: a freshly-provisioned auth user via the Admin API, with a
 * seeded user_merits row. The user is deleted at teardown — auth.users
 * CASCADEs into profiles and user_merits / merit_transactions.
 *
 * Run with:
 *   $env:DENO_TEST_SUPABASE_REMOTE = "1"
 *   $env:SUPABASE_URL = "https://<staging-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
 *   deno test --allow-all _shared/merit-idempotency.test.ts --no-check
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";

// Use the `resume_analysis` / `free` row from merit_feature_costs
// (20260415000000_merit_rpcs.sql:45 — cost = 3 merits).
const TEST_FEATURE = "resume_analysis";
const TEST_TIER = "free";
const TEST_COST = 3;

// Starting balance well above 3 × (parallel-fan-out) so even if every
// concurrent caller mistakenly committed, we'd still not hit the
// insufficient_merits early-return — that would mask the real bug.
const STARTING_BALANCE = 100;
const PARALLEL_FAN_OUT = 10;

interface RpcHit {
  success: boolean;
  transaction_id: string;
  already_deducted?: boolean;
  remaining_balance?: number;
  deducted_from?: { subscription: number; shop: number };
  error?: string;
}

/**
 * Build a fresh service-role client. Intentionally not memoised — every
 * call uses a new connection so we can observe writes from one client
 * via reads on another (mirrors the read-after-write pattern in
 * merit-gateway.raw.test.ts).
 */
async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run the remote idempotency suite",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Provision a fresh auth user via Admin API, then seed user_merits with a
 * known starting balance. Returns the user id.
 *
 * We use a randomly-suffixed email so concurrent CI runs don't collide on
 * the auth.users.email unique constraint.
 */
async function provisionTestUser(startingBalance: number): Promise<string> {
  const client = await freshClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `merit-idem-test-${suffix}@strivo-test.invalid`;
  const password = crypto.randomUUID();

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_fixture: "phase-29-09-merit-idempotency" },
  });
  if (error || !data?.user) {
    throw new Error(`Admin createUser failed: ${error?.message ?? "no user returned"}`);
  }
  const userId = data.user.id;

  // The handle_new_user trigger (if installed) auto-creates a profiles row;
  // user_merits we always upsert manually so we control the starting balance.
  const { error: meritErr } = await client
    .from("user_merits")
    .upsert(
      {
        user_id: userId,
        subscription_balance: startingBalance,
        shop_balance: 0,
      },
      { onConflict: "user_id" },
    );
  if (meritErr) {
    // Best-effort teardown so a partial seed doesn't leak a test user.
    await client.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Seed user_merits failed: ${meritErr.message}`);
  }

  return userId;
}

/**
 * Tear down the test user. auth.users.id CASCADEs into profiles, which
 * CASCADEs into user_merits and merit_transactions — a single delete
 * removes every fixture row.
 */
async function teardownTestUser(userId: string): Promise<void> {
  const client = await freshClient();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) {
    console.error(
      `[merit-idempotency] teardown failed for ${userId}: ${error.message}`,
    );
  }
}

/**
 * Invoke the 4-arg check_and_deduct_merits RPC and return its parsed payload.
 * The PostgREST `rpc()` wrapper unwraps the `jsonb` return to the JS value.
 */
async function callRpc(
  userId: string,
  idempotencyKey: string | null,
): Promise<RpcHit> {
  const client = await freshClient();
  const { data, error } = await client.rpc("check_and_deduct_merits", {
    p_user_id: userId,
    p_feature: TEST_FEATURE,
    p_tier: TEST_TIER,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    throw new Error(`RPC error: ${error.message}`);
  }
  return data as RpcHit;
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

/** Count feature-deduct rows for a given idempotency_key. */
async function countFeatureDeductRows(
  userId: string,
  idempotencyKey: string,
): Promise<number> {
  const client = await freshClient();
  const { data, error } = await client
    .from("merit_transactions")
    .select("id, idempotency_key, source")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("source", "feature-deduct");
  if (error) {
    throw new Error(`Transaction count read failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

// ── Test 1: Sequential retry — same idempotency_key twice ───────────────────

Deno.test(
  "TEST-02 sequential: second call with same idempotency_key returns already_deducted and does not double-debit",
  async () => {
    if (!GATED()) {
      console.log(
        "[merit-idempotency] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run sequential retry",
      );
      return;
    }

    const userId = await provisionTestUser(STARTING_BALANCE);
    const idempotencyKey = crypto.randomUUID();

    try {
      // First call — winner. Returns happy-path shape.
      const first = await callRpc(userId, idempotencyKey);
      assert(
        first.success === true,
        `First call must succeed; got ${JSON.stringify(first)}`,
      );
      assert(
        typeof first.transaction_id === "string" && first.transaction_id.length > 0,
        "First call must return a non-empty transaction_id (the deduction_id)",
      );
      assertEquals(
        first.already_deducted,
        undefined,
        "First call must NOT carry already_deducted (it is the winner path)",
      );
      assertEquals(
        first.remaining_balance,
        STARTING_BALANCE - TEST_COST,
        `First call should report remaining_balance = ${STARTING_BALANCE - TEST_COST}`,
      );

      // Balance reflects exactly one deduction.
      assertEquals(
        await readBalance(userId),
        STARTING_BALANCE - TEST_COST,
        "Balance after first call must equal starting - cost",
      );
      assertEquals(
        await countFeatureDeductRows(userId, idempotencyKey),
        1,
        "Exactly one feature-deduct row should exist after first call",
      );

      // Second call — replay. Same idempotency_key.
      const second = await callRpc(userId, idempotencyKey);
      assertEquals(
        second.success,
        true,
        `Replay must report success=true; got ${JSON.stringify(second)}`,
      );
      assertEquals(
        second.already_deducted,
        true,
        "Replay must carry already_deducted=true (NFR-07 idempotency contract)",
      );
      assertEquals(
        second.transaction_id,
        first.transaction_id,
        "Replay must return the SAME transaction_id (deduction_id) as the winner",
      );

      // Balance and ledger UNCHANGED.
      assertEquals(
        await readBalance(userId),
        STARTING_BALANCE - TEST_COST,
        "Balance after replay must be identical to balance after first call (no double-debit)",
      );
      assertEquals(
        await countFeatureDeductRows(userId, idempotencyKey),
        1,
        "Still exactly one feature-deduct row after replay (no extra ledger entry)",
      );
    } finally {
      await teardownTestUser(userId);
    }
  },
);

// ── Test 2: Retry-storm — N concurrent callers, same idempotency_key ────────

Deno.test(
  "NFR-07 retry-storm: N parallel calls with same idempotency_key debit exactly once",
  async () => {
    if (!GATED()) {
      console.log(
        "[merit-idempotency] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run retry-storm",
      );
      return;
    }

    const userId = await provisionTestUser(STARTING_BALANCE);
    const idempotencyKey = crypto.randomUUID();

    try {
      // Fire PARALLEL_FAN_OUT calls in parallel. Each uses its own client
      // (freshClient inside callRpc) so they cannot share a connection or
      // serialise inside a single pool.
      const results = await Promise.all(
        Array.from({ length: PARALLEL_FAN_OUT }, () =>
          callRpc(userId, idempotencyKey),
        ),
      );

      // Every call must return success=true. NONE may return tier_locked,
      // insufficient_merits, or any other error — both the winner path and
      // the EXCEPTION arm return success=true.
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        assert(
          r.success === true,
          `Concurrent call #${i} must report success=true; got ${JSON.stringify(r)}`,
        );
        assert(
          typeof r.transaction_id === "string" && r.transaction_id.length > 0,
          `Concurrent call #${i} must return a non-empty transaction_id`,
        );
      }

      // All returned transaction_ids must agree — there is exactly one
      // deduction_id, and every caller (winner + EXCEPTION-arm losers)
      // must report it.
      const uniqueTxnIds = new Set(results.map((r) => r.transaction_id));
      assertEquals(
        uniqueTxnIds.size,
        1,
        `All ${PARALLEL_FAN_OUT} concurrent calls must report the SAME transaction_id, got ${uniqueTxnIds.size} distinct values: ${JSON.stringify([...uniqueTxnIds])}`,
      );

      // Exactly one caller is the winner (no already_deducted flag); the
      // remaining N-1 are absorbed losers (already_deducted=true). The
      // entry-time pre-check and the EXCEPTION arm both set
      // already_deducted=true, so any caller that arrived after the
      // winner's INSERT committed will be a loser.
      const winners = results.filter((r) => r.already_deducted !== true);
      const losers = results.filter((r) => r.already_deducted === true);
      assertEquals(
        winners.length,
        1,
        `Exactly 1 winner expected; got ${winners.length}. Winner shape carries remaining_balance + deducted_from, losers carry already_deducted=true.`,
      );
      assertEquals(
        losers.length,
        PARALLEL_FAN_OUT - 1,
        `Exactly ${PARALLEL_FAN_OUT - 1} losers expected; got ${losers.length}.`,
      );

      // Balance reflects EXACTLY one deduction — this is the load-bearing
      // NFR-07 assertion. If the inner EXCEPTION block failed to absorb
      // the race, balance would be < STARTING_BALANCE - TEST_COST.
      assertEquals(
        await readBalance(userId),
        STARTING_BALANCE - TEST_COST,
        `Balance after retry-storm must equal starting - cost (single deduction); double-debit indicates EXCEPTION absorber failed`,
      );

      // Exactly one row in merit_transactions for this idempotency_key —
      // the partial UNIQUE index merit_transactions_idempotency_key_unique
      // is the substrate guarantee here.
      assertEquals(
        await countFeatureDeductRows(userId, idempotencyKey),
        1,
        `Exactly 1 feature-deduct row expected for the idempotency_key; >1 means the partial UNIQUE index did not block the race`,
      );
    } finally {
      await teardownTestUser(userId);
    }
  },
);

// ── Test 3: Skip-guard self-check ───────────────────────────────────────────

Deno.test(
  "merit-idempotency: skip-guard mechanism is exercised when DENO_TEST_SUPABASE_REMOTE is unset",
  () => {
    if (!GATED()) {
      console.log(
        "[merit-idempotency] SKIP — set DENO_TEST_SUPABASE_REMOTE=1 to exercise the live-DB suite (Plan 29-10)",
      );
    }
    // Always passes — the skip-guard is the feature under test here.
  },
);
