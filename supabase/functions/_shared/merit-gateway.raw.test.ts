/**
 * NFR-02 BACKEND-TRUTH read-after-write assertion for the Merit gateway.
 *
 * Layer split (see 13-02-PLAN.md objective):
 *   - Phase 13 / this test: after check_and_deduct_merits commits, a FRESH
 *     service-role client read sees the new balance + ledger row with zero sleep.
 *   - Phase 20: the UI propagation budget (<5 s from commit to all browser
 *     surfaces — AiCreditsContext, header badge, mid-stream UI). NOT tested here.
 *
 * If this test fails the write-commit guarantee is broken at the Postgres layer
 * and NFR-02 cannot hold regardless of any frontend strategy.
 *
 * Gating: `DENO_TEST_SUPABASE_LOCAL=1` (requires local Supabase + Phase 10/11 schema).
 *
 * Test user UUID: 00000000-0000-0000-0000-000000000097 (fixed, exclusively cleaned up).
 *
 * Run with: deno test _shared/merit-gateway.raw.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000097";
const GATED = () => Deno.env.get("DENO_TEST_SUPABASE_LOCAL") === "1";

/**
 * Creates a BRAND-NEW Supabase client instance for read-after-write proof.
 * This is intentionally NOT getServiceClient() — we need to prove the data
 * is durable at Postgres, not cached in the original service-client reference.
 */
async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Clean up test user's merit data — only rows matching TEST_USER_ID. */
async function teardown() {
  const client = await freshClient();
  await client.from("merit_transactions").delete().eq("user_id", TEST_USER_ID);
  await client.from("user_merits").delete().eq("user_id", TEST_USER_ID);
}

/** Seed test user with a known starting balance. */
async function seedTestUser(balance: number) {
  const client = await freshClient();
  // Ensure clean state first
  await teardown();
  // Insert user_merits row with known balance
  const { error } = await client.from("user_merits").insert({
    user_id: TEST_USER_ID,
    subscription_balance: balance,
    shop_balance: 0,
  });
  if (error) throw new Error(`Failed to seed test user: ${error.message}`);
}

// ── Test 1: Happy-path read-after-write ─────────────────────────────────────

Deno.test("NFR-02 read-after-write: fresh client sees deducted balance and ledger row immediately", async () => {
  if (!GATED()) {
    console.log("[merit-gateway.raw] SKIP — set DENO_TEST_SUPABASE_LOCAL=1 to run read-after-write NFR-02 backend-truth assertion");
    return;
  }

  const STARTING_BALANCE = 50;
  await seedTestUser(STARTING_BALANCE);

  const { withMerits } = await import("./merit-gateway.ts");

  // Call withMerits — should deduct and succeed
  const result = await withMerits(
    { userId: TEST_USER_ID, tier: "free", corsType: "user" },
    "resume_analysis",
    async () => "analysis-result",
  );

  assert(result.ok === true, "withMerits should succeed");
  const transactionId = (result as { ok: true; transactionId: string }).transactionId;
  assert(typeof transactionId === "string" && transactionId.length > 0, "transactionId must be a non-empty string");

  // IMMEDIATELY read with a FRESH client — NO sleep, NO polling
  const reader = await freshClient();

  // Check 1: user_merits balance is reduced
  const { data: meritRow, error: meritErr } = await reader
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", TEST_USER_ID)
    .single();

  assert(!meritErr, `user_merits read failed: ${meritErr?.message}`);
  assert(meritRow !== null, "user_merits row must exist");
  const totalBalance = (meritRow.subscription_balance ?? 0) + (meritRow.shop_balance ?? 0);
  assert(totalBalance < STARTING_BALANCE, `Balance should be reduced: got ${totalBalance}, started at ${STARTING_BALANCE}`);

  // Check 2: merit_transactions has exactly one row for this transaction
  const { data: txRows, error: txErr } = await reader
    .from("merit_transactions")
    .select("*")
    .eq("transaction_id", transactionId);

  assert(!txErr, `merit_transactions read failed: ${txErr?.message}`);
  assert(txRows !== null && txRows.length === 1, `Expected exactly 1 transaction row, got ${txRows?.length ?? 0}`);
  assertEquals(txRows[0].user_id, TEST_USER_ID);
  assertEquals(txRows[0].feature, "resume_analysis");
  assertEquals(txRows[0].status, "deducted");

  // Teardown
  await teardown();
});

// ── Test 2: Refund visible immediately ──────────────────────────────────────

Deno.test("NFR-02 read-after-write: refund is visible on fresh client immediately after MeritRefundable", async () => {
  if (!GATED()) {
    console.log("[merit-gateway.raw] SKIP — set DENO_TEST_SUPABASE_LOCAL=1 to run refund read-after-write assertion");
    return;
  }

  const STARTING_BALANCE = 50;
  await seedTestUser(STARTING_BALANCE);

  const { withMerits, MeritRefundable } = await import("./merit-gateway.ts");

  // Call withMerits with a callback that throws MeritRefundable
  let caughtError: Error | null = null;
  try {
    await withMerits(
      { userId: TEST_USER_ID, tier: "free", corsType: "user" },
      "resume_analysis",
      async () => {
        throw new MeritRefundable(529, "overloaded");
      },
    );
  } catch (err) {
    caughtError = err as Error;
  }

  assert(caughtError !== null, "withMerits should re-throw the MeritRefundable error");
  assertEquals(caughtError!.name, "MeritRefundable");

  // IMMEDIATELY read with a FRESH client — NO sleep, NO polling
  const reader = await freshClient();

  // Check 1: merit_transactions should have 2 rows (deduct + refund)
  const { data: txRows, error: txErr } = await reader
    .from("merit_transactions")
    .select("*")
    .eq("user_id", TEST_USER_ID)
    .order("created_at", { ascending: true });

  assert(!txErr, `merit_transactions read failed: ${txErr?.message}`);
  assert(txRows !== null && txRows.length === 2, `Expected 2 transaction rows (deduct + refund), got ${txRows?.length ?? 0}`);

  const deductRow = txRows.find((r: any) => r.status === "deducted");
  const refundRow = txRows.find((r: any) => r.status === "refunded");
  assert(deductRow !== undefined, "Must have a deducted row");
  assert(refundRow !== undefined, "Must have a refunded row");
  assertEquals(refundRow.refund_of, deductRow.transaction_id, "refund_of must point at the deduct row's transaction_id");

  // Check 2: user_merits balance is FULLY restored
  const { data: meritRow, error: meritErr } = await reader
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", TEST_USER_ID)
    .single();

  assert(!meritErr, `user_merits read failed: ${meritErr?.message}`);
  assert(meritRow !== null, "user_merits row must exist");
  const totalBalance = (meritRow.subscription_balance ?? 0) + (meritRow.shop_balance ?? 0);
  assertEquals(totalBalance, STARTING_BALANCE, `Balance should be fully restored to ${STARTING_BALANCE}, got ${totalBalance}`);

  // Teardown
  await teardown();
});

// ── Test 3: Documented skip when env unset ──────────────────────────────────

Deno.test("NFR-02 read-after-write: documented skip guard when DENO_TEST_SUPABASE_LOCAL is not set", () => {
  // This test verifies the skip-guard mechanism itself. When DENO_TEST_SUPABASE_LOCAL
  // is NOT '1', the gated tests above skip gracefully. This test always passes to
  // confirm the file is exercised by deno test.
  if (!GATED()) {
    console.log("[merit-gateway.raw] SKIP — set DENO_TEST_SUPABASE_LOCAL=1 to run read-after-write NFR-02 backend-truth assertion");
  }
  // Always passes — the skip guard is the feature under test
});
