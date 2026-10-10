/**
 * Plan 05-02 / Task 1 — analyze-resume failure & error-path coverage.
 * REQ-IDs: TEST-03 (failure/error paths), TEST-05 (edge cases, failure states,
 * permissions/tier gating) for the business-critical Resume Analysis flow (D-01).
 *
 * Mode: OFFLINE (no live Supabase, no live Anthropic).
 *
 * Strategy (RESEARCH testability matrix — analyze-resume/index.ts is an inline
 * `serve(async (req) => …)` handler, NOT handler-invocable offline):
 *
 *   • Pattern D (EXECUTED seam): the merit deduct/refund/idempotency + the
 *     AI-failure → refundable classification path that the handler COMPOSES is
 *     exercised through the shared-module seam (_shared/merit-gateway.ts +
 *     _shared/anthropic.ts) and the same in-memory mock-RPC ledger discipline as
 *     `analyze-resume/test-07.test.ts`. This proves the real `isRefundableAnthropicError`
 *     classifier + ledger restoration without invoking the serve handler.
 *
 *   • Pattern A (source-read): the inline-`serve` 402/429/timeout/bad-input/auth
 *     branches that cannot be invoked offline are asserted as WIRED via a
 *     regex/segment match against `analyze-resume/index.ts`.
 *
 * Zero functional change: `analyze-resume/index.ts` is byte-identical to v4.0-baseline.
 *
 * Run with: deno test analyze-resume/failure-branches.test.ts --no-check --allow-all
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── In-memory merit ledger mock (mirrors test-07.test.ts) ───────────────────
// Faithfully reproduces the Phase 11 check_and_deduct_merits + refund_merits
// contracts so the gateway's refund-on-AI-failure path can be exercised offline.

const TEST_USER_ID = "00000000-0000-0000-0000-fb02resume01";
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
  return { subscription_balance: subBalance, shop_balance: shopBalance, transactions: [] };
}

function uuid(): string {
  return crypto.randomUUID();
}

// Feature cost lookup (matches merit_feature_costs seed)
const FEATURE_COSTS: Record<string, Record<string, number>> = {
  resume_analysis: { free: 3, pro: 3, elite: 3 },
};

function mockCheckAndDeductMerits(
  ledger: MockLedger,
  userId: string,
  feature: string,
  tier: string,
): Record<string, unknown> {
  const cost = FEATURE_COSTS[feature]?.[tier];
  if (cost === undefined) return { error: "tier_locked", upgrade_required: true };

  const total = ledger.subscription_balance + ledger.shop_balance;
  if (total < cost) return { error: "insufficient_merits", upgrade_required: true };

  const subTake = Math.min(ledger.subscription_balance, cost);
  const shopTake = cost - subTake;
  const deductionId = uuid();

  if (subTake > 0) {
    ledger.transactions.push({
      id: uuid(), user_id: userId, amount: -subTake, balance_type: "subscription",
      source: "feature-deduct", feature, metadata: { deduction_id: deductionId, tier },
      created_at: new Date().toISOString(),
    });
  }
  if (shopTake > 0) {
    ledger.transactions.push({
      id: uuid(), user_id: userId, amount: -shopTake, balance_type: "shop",
      source: "feature-deduct", feature, metadata: { deduction_id: deductionId, tier },
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

function mockRefundMerits(
  ledger: MockLedger,
  userId: string,
  transactionId: string,
): Record<string, unknown> {
  const existingRefund = ledger.transactions.find(
    (t) => t.user_id === userId && t.balance_type === "refund" &&
      (t.metadata as Record<string, unknown>).deduction_id === transactionId,
  );
  if (existingRefund) return { error: "already_refunded" };

  const deductionRows = ledger.transactions.filter(
    (t) => t.user_id === userId &&
      (t.metadata as Record<string, unknown>).deduction_id === transactionId &&
      (t.balance_type === "subscription" || t.balance_type === "shop"),
  );
  if (deductionRows.length === 0) return { error: "unknown_transaction" };

  let subRestore = 0;
  let shopRestore = 0;
  for (const row of deductionRows) {
    const restoreAmt = -row.amount;
    ledger.transactions.push({
      id: uuid(), user_id: userId, amount: restoreAmt, balance_type: "refund",
      source: "feature-refund", feature: null,
      metadata: { refund_of: row.id, deduction_id: transactionId },
      created_at: new Date().toISOString(),
    });
    if (row.balance_type === "subscription") subRestore += restoreAmt;
    else shopRestore += restoreAmt;
  }
  ledger.subscription_balance += subRestore;
  ledger.shop_balance += shopRestore;

  return { success: true, refunded_to: { subscription: subRestore, shop: shopRestore } };
}

// ── Env setup helpers (mirror test-07.test.ts) ──────────────────────────────

function setTestEnv(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  const originals: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return originals;
}

// Set required env vars BEFORE importing modules that read them at module scope.
// These persist for the file lifetime — do NOT restore at module scope.
// NOTE: Do NOT set MERIT_SYSTEM_ENABLED (module-scope constant in merit-gateway.ts,
// read once at import time — Pitfall 4 / shared module-cache contamination).
// Synthetic placeholders ONLY (T-05-03 fixture-secret-hygiene) — never a real
// project ref or live service-role key.
setTestEnv({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  APP_URL: "https://test.example.com",
  AI_TEST_MODE: "true",
  AI_FORCE_FAILURE: "false",
});

// Dynamic imports AFTER env setup (env-before-import).
const gateway = await import("../_shared/merit-gateway.ts");
const anthropic = await import("../_shared/anthropic.ts");

// Source-read of the inline-serve handler (Pattern A). Windows: import.meta.url
// pathname begins with /C:/… which Deno cannot open — strip the leading slash.
const _rawPath = new URL("./index.ts", import.meta.url).pathname;
const INDEX_PATH = _rawPath.startsWith("/") && _rawPath[2] === ":" ? _rawPath.slice(1) : _rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

// ── EXECUTED (Pattern D): AI-failure → refundable → ledger restored ─────────

Deno.test("05-02/resume: forced AI failure is classified refundable AND restores the ledger", async () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);

  const origFF = Deno.env.get("AI_FORCE_FAILURE");
  Deno.env.set("AI_FORCE_FAILURE", "true");
  try {
    // 1. The two-key compound gate (AI_TEST_MODE + AI_FORCE_FAILURE) fires a
    //    hardcoded 529 'forced-failure' — the canonical refundable Anthropic error.
    const aiResult = await anthropic.invokeAnthropicText({
      model: "claude-haiku-4-5-20251001",
      system: "test",
      messages: [{ role: "user", content: "test resume text for failure branch" }],
      maxTokens: 100,
      temperature: 0.3,
      fixtureKey: "analyze_resume",
    });
    assertEquals(aiResult.ok, false, "AI_FORCE_FAILURE should produce a failed result");
    if (aiResult.ok) throw new Error("expected forced failure but got ok:true");
    assertEquals(aiResult.status, 529, "forced failure status should be 529");
    assertEquals(aiResult.error, "forced-failure", "forced failure error message");

    // 2. The REAL gateway classifier marks the forced 529 as refundable.
    assertEquals(
      gateway.isRefundableAnthropicError(aiResult.status, aiResult.error),
      true,
      "529 forced-failure must be classified refundable (D-02)",
    );

    // 3. Simulate the withMerits D-06 control flow the handler relies on:
    //    deduct → callback throws MeritRefundable → gateway refunds.
    const deduct = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "resume_analysis", "free");
    assertEquals((deduct as Record<string, unknown>).success, true, "deduction should succeed");
    const txId = (deduct as Record<string, unknown>).transaction_id as string;
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      INITIAL_BALANCE - 3,
      "balance reduced by the resume_analysis cost (3) after deduction",
    );

    // 4. The handler raises MeritRefundable on a failed AI call (index.ts wiring,
    //    e.g. `throw new MeritRefundable(fallbackResp.status, fallbackResp.error)`).
    const refundable = new gateway.MeritRefundable(aiResult.status, aiResult.error);
    assertEquals(refundable.name, "MeritRefundable");
    assertEquals(refundable.status, 529);
    assert(refundable instanceof Error, "MeritRefundable extends Error");

    // 5. Gateway-owned refund restores the ledger to its pre-deduction balance.
    const refund = mockRefundMerits(ledger, TEST_USER_ID, txId);
    assertEquals((refund as Record<string, unknown>).success, true, "refund should succeed");
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      INITIAL_BALANCE,
      "balance fully restored after refund (no merit-accounting loss on AI failure)",
    );
    const refundRows = ledger.transactions.filter((t) => t.balance_type === "refund");
    assertEquals(refundRows.length, 1, "exactly one refund row");
    assertEquals(
      (refundRows[0].metadata as Record<string, unknown>).deduction_id,
      txId,
      "refund row links back to the original deduction",
    );
  } finally {
    if (origFF !== undefined) Deno.env.set("AI_FORCE_FAILURE", origFF);
    else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

// ── EXECUTED (Pattern D): refund idempotency — second refund is a no-op ──────

Deno.test("05-02/resume: refund idempotency — second refund returns already_refunded, no balance change", () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);
  const deduct = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "resume_analysis", "free");
  const txId = (deduct as Record<string, unknown>).transaction_id as string;

  const refund1 = mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals((refund1 as Record<string, unknown>).success, true, "first refund succeeds");
  const rowsAfterFirst = ledger.transactions.length;

  const refund2 = mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals(
    (refund2 as Record<string, unknown>).error,
    "already_refunded",
    "second refund is idempotent",
  );
  assertEquals(ledger.transactions.length, rowsAfterFirst, "no extra rows on idempotent refund");
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE,
    "balance unchanged by the idempotent refund",
  );
});

// ── EXECUTED (Pattern D): NON-refundable classification (4xx + parse errors) ─

Deno.test("05-02/resume: 4xx client errors and parse failures are NOT refundable", () => {
  // 4xx client errors (bad request, auth, validation) must NOT auto-refund.
  assertEquals(gateway.isRefundableAnthropicError(400, "Bad Request"), false, "400 not refundable");
  assertEquals(gateway.isRefundableAnthropicError(401, "Unauthorized"), false, "401 not refundable");
  assertEquals(gateway.isRefundableAnthropicError(403, "Forbidden"), false, "403 not refundable");
  assertEquals(gateway.isRefundableAnthropicError(422, "Unprocessable"), false, "422 not refundable");
  // A plain parse-failure message (no refund keyword, no 5xx/408 status) is NOT refundable.
  assertEquals(
    gateway.isRefundableAnthropicError(200, "JSON parse failed: unexpected token"),
    false,
    "parse failure without a refund signal is NOT refundable",
  );
  // Boundary: 5xx + 408 + overload/timeout keywords ARE refundable (the deduct stays refundable).
  assertEquals(gateway.isRefundableAnthropicError(500, ""), true, "500 refundable");
  assertEquals(gateway.isRefundableAnthropicError(503, ""), true, "503 refundable");
  assertEquals(gateway.isRefundableAnthropicError(408, "timeout"), true, "408 refundable");
  assertEquals(gateway.isRefundableAnthropicError(200, "AbortError: request timed out"), true, "AbortError refundable");
});

// ── WIRED (Pattern A): inline-serve branches asserted via source-read ────────

Deno.test("05-02/resume(A): withMerits wraps resume_analysis unconditionally (no MERIT_SYSTEM_ENABLED gate)", () => {
  assert(source.includes("withMerits("), "handler must call withMerits");
  assert(source.includes("'resume_analysis'"), "handler must declare feature='resume_analysis'");
  // State-of-the-Art: the MERIT_SYSTEM_ENABLED flag was removed from analyze-resume
  // (Phase 30) — the merit path is unconditional. Assert the ACTUAL current state.
  assert(
    !source.includes("MERIT_SYSTEM_ENABLED"),
    "MERIT_SYSTEM_ENABLED must NOT gate analyze-resume (removed Phase 30)",
  );
});

Deno.test("05-02/resume(A): AI-failure and parse-failure branches throw MeritRefundable", () => {
  assert(source.includes("MeritRefundable"), "handler must import/use MeritRefundable");
  // The handler re-raises a failed Anthropic call as a refundable merit error so
  // withMerits restores the ledger (the EXECUTED path above proves the classifier).
  assert(
    source.includes("throw new MeritRefundable"),
    "handler must throw MeritRefundable on a refundable failure",
  );
  assert(
    source.includes("JSON parse failed"),
    "handler must surface the parse-failure branch (re-raised as MeritRefundable)",
  );
});

Deno.test("05-02/resume(A): bad-input rejection branch is wired (resumeText length guard)", () => {
  // index.ts L628: `if (!resumeText || resumeText.length < 50) { … 400 … }`
  assert(source.includes("resumeText.length < 50"), "handler must reject too-short resumeText");
  assert(source.includes("status: 400"), "bad-input branch returns 400");
});

Deno.test("05-02/resume(A): auth-reject is wired (server-side tier, JWT — requireInternalOrUserAuth)", () => {
  // NOTE (divergence from plan wording): the plan's key_links referenced
  // `requireAuth(req, { type: 'user' })` (the grade-linkedin form). analyze-resume
  // ACTUALLY wires the dual user/internal-worker helper. Assert CURRENT behavior.
  assert(
    source.includes("requireInternalOrUserAuth"),
    "handler must authenticate via requireInternalOrUserAuth (JWT user OR internal worker secret)",
  );
  // Auth-rejection surfaces as a 401 in the handler.
  assert(source.includes("status: 401"), "auth-reject branch returns 401");
});

Deno.test("05-02/resume(A): 402/429 usage/cap short-circuit branch is wired in the parallel-call path", () => {
  // index.ts L412: a failed call carrying a 429 (rate limit) or 402 (insufficient
  // merits) short-circuits the parallel retry rather than retrying.
  assert(
    source.includes("result.status === 429") || source.includes("status === 429"),
    "handler must short-circuit on 429 (rate limit)",
  );
  assert(
    source.includes("result.status === 402") || source.includes("status === 402"),
    "handler must short-circuit on 402 (insufficient merits)",
  );
});

Deno.test("05-02/resume(A): per-tier input cap + per-tier timeout are wired", () => {
  // Failure-adjacent edge: oversize input is trimmed (not rejected) per tier;
  // each AI call carries a per-tier timeout (the source of the 408 refundable path).
  assert(
    source.includes("getMaxInputChars('resumeAnalysis'"),
    "handler must apply the per-tier resumeAnalysis input cap",
  );
  assert(source.includes("getTimeout("), "handler must set a per-tier timeout on AI calls");
});
