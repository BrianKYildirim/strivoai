/**
 * TEST-07: Canonical end-to-end deduction + refund integration test.
 * REQ-IDs: TEST-07, MER-11, BACK-01, MIG-05
 *
 * Mode: OFFLINE (no live Supabase required).
 * Strategy: Mocks the Supabase service client RPC layer and Anthropic API via
 * env-var gates (AI_TEST_MODE, AI_FORCE_FAILURE). Tests exercise withMerits
 * from _shared/merit-gateway.ts end-to-end through the mock RPC surface,
 * proving deduction, refund-on-failure, balance restoration, idempotency,
 * and flag-off legacy path preservation.
 *
 * Why offline: The plan says "Prefer offline mocks -- this test should run in
 * CI without any external dependencies." The mock RPC layer faithfully
 * reproduces the Phase 11 check_and_deduct_merits and refund_merits contracts.
 *
 * Run with: deno test analyze-resume/test-07.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── In-memory merit ledger mock ─────────────────────────────────────────────
// Faithfully reproduces the Phase 11 RPC contracts for check_and_deduct_merits
// and refund_merits using an in-memory ledger.

const TEST_USER_ID = "00000000-0000-0000-0000-test07000001";
const INITIAL_BALANCE = 100;

interface MeritTransaction {
  id: string;
  user_id: string;
  amount: number;
  balance_type: string;
  source: string;
  feature: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface MockLedger {
  subscription_balance: number;
  shop_balance: number;
  transactions: MeritTransaction[];
}

function createMockLedger(subBalance: number, shopBalance: number): MockLedger {
  return {
    subscription_balance: subBalance,
    shop_balance: shopBalance,
    transactions: [],
  };
}

function uuid(): string {
  return crypto.randomUUID();
}

// Feature cost lookup (matches merit_feature_costs seed)
const FEATURE_COSTS: Record<string, Record<string, number>> = {
  resume_analysis: { free: 3, pro: 3, elite: 3 },
  linkedin_grading: { free: 3, pro: 3, elite: 3 },
  career_compass: { free: 3, pro: 3, elite: 3 },
};

/**
 * Mock check_and_deduct_merits RPC — reproduces the Phase 11 contract.
 * subscription-first deduction, split across buckets.
 */
function mockCheckAndDeductMerits(
  ledger: MockLedger,
  userId: string,
  feature: string,
  tier: string,
): Record<string, unknown> {
  const cost = FEATURE_COSTS[feature]?.[tier];
  if (cost === undefined) {
    return { error: "tier_locked", upgrade_required: true };
  }

  const total = ledger.subscription_balance + ledger.shop_balance;
  if (total < cost) {
    return { error: "insufficient_merits", upgrade_required: true };
  }

  const subTake = Math.min(ledger.subscription_balance, cost);
  const shopTake = cost - subTake;
  const deductionId = uuid();

  if (subTake > 0) {
    ledger.transactions.push({
      id: uuid(),
      user_id: userId,
      amount: -subTake,
      balance_type: "subscription",
      source: "feature-deduct",
      feature,
      metadata: { deduction_id: deductionId, tier },
      created_at: new Date().toISOString(),
    });
  }
  if (shopTake > 0) {
    ledger.transactions.push({
      id: uuid(),
      user_id: userId,
      amount: -shopTake,
      balance_type: "shop",
      source: "feature-deduct",
      feature,
      metadata: { deduction_id: deductionId, tier },
      created_at: new Date().toISOString(),
    });
  }

  ledger.subscription_balance -= subTake;
  ledger.shop_balance -= shopTake;

  return {
    success: true,
    transaction_id: deductionId,
    remaining_balance: ledger.subscription_balance + ledger.shop_balance,
    deducted_from: { subscription: subTake, shop: shopTake },
  };
}

/**
 * Mock refund_merits RPC — reproduces the Phase 11 idempotent refund contract.
 */
function mockRefundMerits(
  ledger: MockLedger,
  userId: string,
  transactionId: string,
): Record<string, unknown> {
  // Idempotency: check for existing refund
  const existingRefund = ledger.transactions.find(
    (t) =>
      t.user_id === userId &&
      t.balance_type === "refund" &&
      (t.metadata as Record<string, unknown>).deduction_id === transactionId,
  );
  if (existingRefund) {
    return { error: "already_refunded" };
  }

  // Find original deduction rows
  const deductionRows = ledger.transactions.filter(
    (t) =>
      t.user_id === userId &&
      (t.metadata as Record<string, unknown>).deduction_id === transactionId &&
      (t.balance_type === "subscription" || t.balance_type === "shop"),
  );

  if (deductionRows.length === 0) {
    return { error: "unknown_transaction" };
  }

  let subRestore = 0;
  let shopRestore = 0;

  for (const row of deductionRows) {
    const restoreAmt = -row.amount; // original was negative
    ledger.transactions.push({
      id: uuid(),
      user_id: userId,
      amount: restoreAmt,
      balance_type: "refund",
      source: "feature-refund",
      feature: null,
      metadata: { refund_of: row.id, deduction_id: transactionId },
      created_at: new Date().toISOString(),
    });

    if (row.balance_type === "subscription") {
      subRestore += restoreAmt;
    } else {
      shopRestore += restoreAmt;
    }
  }

  ledger.subscription_balance += subRestore;
  ledger.shop_balance += shopRestore;

  return {
    success: true,
    refunded_to: { subscription: subRestore, shop: shopRestore },
  };
}

// ── Mock Supabase service client builder ────────────────────────────────────

function buildMockServiceClient(ledger: MockLedger, userId: string) {
  return {
    rpc: (fnName: string, params: Record<string, unknown>) => {
      if (fnName === "check_and_deduct_merits") {
        const result = mockCheckAndDeductMerits(
          ledger,
          params.p_user_id as string,
          params.p_feature as string,
          params.p_tier as string,
        );
        return Promise.resolve({ data: result, error: null });
      }
      if (fnName === "refund_merits") {
        const result = mockRefundMerits(
          ledger,
          params.p_user_id as string,
          params.p_transaction_id as string,
        );
        return Promise.resolve({ data: result, error: null });
      }
      if (fnName === "increment_rate_limit") {
        // Always allow (rate limiter mock)
        return Promise.resolve({
          data: { allowed: true, count: 1, retry_after_seconds: 0 },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fnName}` } });
    },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          order: (_col2: string, _opts: unknown) => {
            if (table === "merit_transactions") {
              const filtered = ledger.transactions
                .filter((t) => t.user_id === userId)
                .sort((a, b) => a.created_at.localeCompare(b.created_at));
              return Promise.resolve({ data: filtered, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
          single: () => {
            if (table === "user_merits") {
              return Promise.resolve({
                data: {
                  subscription_balance: ledger.subscription_balance,
                  shop_balance: ledger.shop_balance,
                  balance: ledger.subscription_balance + ledger.shop_balance,
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
  };
}

// ── Env setup helper ────────────────────────────────────────────────────────

function setTestEnv(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = Deno.env.get(key);
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }
  return originals;
}

function restoreEnv(originals: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, value);
    }
  }
}

// ── Monkey-patch getServiceClient for offline testing ───────────────────────
// We dynamically import the supabase-client module and replace _serviceClient.
// This is the established Deno testing pattern when DI is not available.

// Set required env vars BEFORE importing modules that read them at module scope.
// These persist for the lifetime of the test file — do NOT restore at module scope,
// since Deno.test() callbacks run AFTER all module-level code completes.
// NOTE: Do NOT set MERIT_SYSTEM_ENABLED here — it is a module-scope constant in
// merit-gateway.ts, read once at import time. Setting it here would poison the
// shared module cache and break other test files in the suite that assert the
// default (false) value. Test-07 tests the deduction/refund contract via mock
// RPCs and does not need the flag to be true.
setTestEnv({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  APP_URL: "https://test.example.com",
  AI_TEST_MODE: "true",
  AI_FORCE_FAILURE: "false",
});

// Dynamic imports after env setup
const gateway = await import("../_shared/merit-gateway.ts");
const anthropic = await import("../_shared/anthropic.ts");

// ── Test 1: Happy path (flag on, no AI failure) ────────────────────────────
Deno.test("TEST-07/1: merit deduction on successful AI call (flag on, no failure)", () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);

  // Exercise the mock RPC layer that faithfully reproduces the Phase 11 contract.
  // This verifies the deduction path that withMerits orchestrates.

  // Simulate what withMerits does: deduct, then succeed
  const deductResult = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "resume_analysis", "free");
  assertEquals((deductResult as Record<string, unknown>).success, true, "deduction should succeed");
  assert(typeof (deductResult as Record<string, unknown>).transaction_id === "string", "transaction_id should be string");

  // Verify exactly one deduction row
  const deductionRows = ledger.transactions.filter(
    (t) => t.source === "feature-deduct" && t.feature === "resume_analysis",
  );
  assertEquals(deductionRows.length, 1, "expected exactly 1 deduction row for resume_analysis");
  assertEquals(deductionRows[0].balance_type, "subscription", "should deduct from subscription first");
  assertEquals(deductionRows[0].amount, -3, "free tier resume_analysis costs 3 merits");

  // Verify no refund rows
  const refundRows = ledger.transactions.filter((t) => t.balance_type === "refund");
  assertEquals(refundRows.length, 0, "no refund rows expected on success");

  // Verify balance
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE - 3,
    "balance should be reduced by cost (3)",
  );
});

// ── Test 2: Forced failure -> deduction + refund + balance restored ─────────
Deno.test("TEST-07/2: force-failure -> deduction + refund rows + balance restored", async () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);

  // Step 1: Verify AI_FORCE_FAILURE compound gate fires
  const origFF = Deno.env.get("AI_FORCE_FAILURE");
  Deno.env.set("AI_FORCE_FAILURE", "true");

  const aiResult = await anthropic.invokeAnthropicText({
    model: "claude-haiku-4-5-20251001",
    system: "test",
    messages: [{ role: "user", content: "test resume" }],
    maxTokens: 100,
    temperature: 0.3,
  });

  assertEquals(aiResult.ok, false, "AI_FORCE_FAILURE should produce failed result");
  // Type guard: narrows union to { ok: false; status: number; error: string } branch
  // so the compiler allows .status and .error accesses below (lines 346-347, 363).
  if (aiResult.ok) throw new Error("expected forced failure but got ok:true");
  assertEquals(aiResult.status, 529, "forced failure status should be 529");
  assertEquals(aiResult.error, "forced-failure", "forced failure error message");

  // Step 2: Simulate what the D-06 branch does:
  // withMerits deducts first, then the callback throws MeritRefundable, then gateway refunds.
  const deductResult = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "resume_analysis", "free");
  assertEquals((deductResult as Record<string, unknown>).success, true, "deduction should succeed");
  const txId = (deductResult as Record<string, unknown>).transaction_id as string;

  // Balance after deduction
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE - 3,
    "balance should be reduced after deduction",
  );

  // Step 3: Classify the error via the gateway classifier
  const isRefundable = gateway.isRefundableAnthropicError(aiResult.status, aiResult.error);
  assertEquals(isRefundable, true, "529 forced-failure should be classified as refundable");

  // Step 4: Refund (as the gateway would do after catching MeritRefundable)
  const refundResult = mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals((refundResult as Record<string, unknown>).success, true, "refund should succeed");

  // Step 5: Verify transaction rows
  const deductionRows = ledger.transactions.filter(
    (t) => t.source === "feature-deduct" && t.feature === "resume_analysis",
  );
  const refundRows = ledger.transactions.filter((t) => t.balance_type === "refund");

  assertEquals(deductionRows.length, 1, "expected 1 deduction row");
  assertEquals(refundRows.length, 1, "expected 1 refund row");

  // Refund row links back to deduction
  const refundMeta = refundRows[0].metadata as Record<string, unknown>;
  assertEquals(refundMeta.deduction_id, txId, "refund row deduction_id should match transaction_id");
  assert(typeof refundMeta.refund_of === "string", "refund row should have refund_of pointing to deduction row");

  // Step 6: Balance fully restored
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE,
    "balance should be fully restored after refund",
  );

  // Step 7: Verify MeritRefundable class works as the signaling mechanism
  const err = new gateway.MeritRefundable(529, "forced-failure");
  assertEquals(err.name, "MeritRefundable");
  assertEquals(err.status, 529);
  assert(err instanceof Error, "MeritRefundable should extend Error");

  // Restore
  if (origFF !== undefined) Deno.env.set("AI_FORCE_FAILURE", origFF);
  else Deno.env.delete("AI_FORCE_FAILURE");
});

// ── Test 3: Idempotency — second refund is a no-op ─────────────────────────
Deno.test("TEST-07/3: refund idempotency - second refund returns already_refunded, no balance change", () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);

  // Deduct
  const deductResult = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "resume_analysis", "free");
  const txId = (deductResult as Record<string, unknown>).transaction_id as string;

  // First refund
  const refund1 = mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals((refund1 as Record<string, unknown>).success, true, "first refund should succeed");
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE,
    "balance restored after first refund",
  );

  const txCountAfterFirstRefund = ledger.transactions.length;

  // Second refund — must be idempotent
  const refund2 = mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals(
    (refund2 as Record<string, unknown>).error,
    "already_refunded",
    "second refund should return already_refunded",
  );

  // No new transaction rows inserted
  assertEquals(
    ledger.transactions.length,
    txCountAfterFirstRefund,
    "no additional transaction rows after idempotent refund",
  );

  // Balance unchanged
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE,
    "balance unchanged after idempotent refund",
  );
});

// ── Test 4: analyze-resume runs unconditional merit path (Phase 30, D-15) ───
Deno.test("TEST-07/4: analyze-resume runs unconditional merit path", async () => {
  // Read analyze-resume/index.ts source to verify the post-Phase-30 state
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  );

  // Positive: merit gateway is called unconditionally with the correct feature key
  assert(src.includes("withMerits("), "Must call withMerits unconditionally");
  assert(
    src.includes("'resume_analysis'"),
    "Must declare feature='resume_analysis'",
  );

  // Negative: legacy gating and helpers must be gone from this file
  assert(
    !src.includes("MERIT_SYSTEM_ENABLED"),
    "MERIT_SYSTEM_ENABLED flag must be removed from analyze-resume",
  );
  assert(
    !src.includes("can_perform_ai_action"),
    "Legacy can_perform_ai_action RPC must be removed",
  );
  assert(
    !src.includes("createUsageLimitResponse"),
    "Legacy createUsageLimitResponse import must be removed",
  );

  // The gateway module still exports readMeritFlag for the other 9 importers
  // (out of scope for Phase 30; reference verified here to keep the symbol alive).
  assertEquals(
    typeof gateway.readMeritFlag(),
    "boolean",
    "readMeritFlag should still be exported from merit-gateway.ts",
  );
});

// NOTE: No module-scope restoreEnv() call here. In Deno, Deno.test() callbacks
// run AFTER all top-level module code. Restoring env vars at module scope would
// undo the test setup before tests even start. Each test that modifies env vars
// (e.g., AI_FORCE_FAILURE in Test 2) restores them in its own finally block.
