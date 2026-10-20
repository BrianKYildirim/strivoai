/**
 * Plan 05-02 / Task 2 — analyze-career budget-cap + tier-gating + failure-path coverage.
 * REQ-IDs: TEST-03 (failure/error paths), TEST-05 (edge cases, failure states,
 * permissions/tier gating) for the business-critical Career Compass flow (D-01).
 *
 * Mode: OFFLINE (no live Supabase, no live Anthropic).
 *
 * Strategy (RESEARCH testability matrix — analyze-career/index.ts is an inline
 * `serve(async (req) => …)` handler, NOT handler-invocable offline; Phase 5 MUST
 * NOT relocate product source to enable a test):
 *
 *   • Pattern C (logic-extraction): replicate CAREER_CALL_CONFIGS +
 *     validateCareerCallConfigBudgets against the REAL getMaxOutput ceiling and
 *     drive the over-budget `assertThrows` branch. This file COMPLEMENTS the
 *     existing `analyze-career/index.test.ts` (which already covers the per-tier
 *     budget SUMS + one over-ELITE-ceiling throw) by adding the over-FREE-ceiling
 *     throw + the FREE_SINGLE_CALL_MAX_TOKENS-vs-ceiling characterization.
 *     `FREE_SINGLE_CALL_MAX_TOKENS` is imported directly from
 *     `_shared/career-prompts.ts` (already there — not relocated).
 *
 *   • Pattern D (EXECUTED seam): the AI-failure → refundable classification path
 *     for the `analyze_career` fixtureKey, exercised through the real
 *     _shared/merit-gateway.ts + _shared/anthropic.ts via the same in-memory
 *     mock-RPC ledger discipline as analyze-resume/test-07.test.ts.
 *
 *   • Pattern A (source-read): the inline-`serve` tier-gating / per-tier input cap
 *     / auth-reject / 412 / failure branches asserted WIRED against index.ts.
 *
 * Zero functional change: analyze-career/index.ts AND _shared/career-prompts.ts
 * are byte-identical to v4.0-baseline (no source relocation).
 *
 * Run with: deno test analyze-career/failure-branches.test.ts --no-check --allow-all
 */
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { getMaxOutput } from "../_shared/tier-config.ts";

// ── Pattern C: replicate the boot-time CAREER_CALL_CONFIGS invariant ─────────
// Keep in sync with analyze-career/index.ts CAREER_CALL_CONFIGS (260608-p5k).

interface CareerCallConfig {
  callType: string;
  maxTokensFree: number;
  maxTokensPro: number;
  maxTokensElite: number;
}

/** Current production CAREER_CALL_CONFIGS from index.ts (Free right-sized to 4800 by 260713-hrd). */
const CAREER_CALL_CONFIGS: CareerCallConfig[] = [
  { callType: "base", maxTokensFree: 4800, maxTokensPro: 4500, maxTokensElite: 4500 },
  { callType: "growth", maxTokensFree: 0, maxTokensPro: 3500, maxTokensElite: 3500 },
  { callType: "elite-extras", maxTokensFree: 0, maxTokensPro: 2000, maxTokensElite: 2000 },
];

function ceilingFor(tier: "free" | "pro" | "elite"): number {
  return getMaxOutput("careerCompass", tier);
}

/** Extracted boot-time invariant from index.ts L69-76 (the over-budget throw branch). */
function validateCareerCallConfigBudgets(configs: CareerCallConfig[]): void {
  for (const tier of ["free", "pro", "elite"] as const) {
    const key = `maxTokens${tier[0].toUpperCase() + tier.slice(1)}` as keyof CareerCallConfig;
    const sum = configs.reduce((acc, cfg) => acc + (cfg[key] as number), 0);
    const ceiling = ceilingFor(tier);
    if (sum > ceiling) {
      throw new Error(
        `[analyze-career] CAREER_CALL_CONFIGS sum ${sum} exceeds getMaxOutput('careerCompass','${tier}') (${ceiling})`,
      );
    }
  }
}

// ── Source-read of the inline-serve handler (Pattern A) ──────────────────────
// Windows: import.meta.url pathname begins with /C:/… — strip the leading slash.
const _rawPath = new URL("./index.ts", import.meta.url).pathname;
const INDEX_PATH = _rawPath.startsWith("/") && _rawPath[2] === ":" ? _rawPath.slice(1) : _rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

/**
 * `source` with comments stripped (260713-hrd).
 *
 * Removal assertions ("this branch must be GONE") have to inspect CODE, not prose — the
 * handler still carries a comment explaining WHY the 412 prior-analyses gates were
 * deleted, and a naive `source.includes("missing_prior_analyses")` would match that
 * comment and fail on the very documentation of the fix.
 */
const codeOnly = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── In-memory merit ledger mock (mirrors test-07.test.ts) ───────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-fb02career01";
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

// Per-tier career_compass merit cost (index.ts L79: free=3, pro=2, elite=3).
const FEATURE_COSTS: Record<string, Record<string, number>> = {
  career_compass: { free: 3, pro: 2, elite: 3 },
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

// ── Env setup (env-before-import; synthetic placeholders only — T-05-03) ─────

function setTestEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
}

// Do NOT set MERIT_SYSTEM_ENABLED (module-scope constant — Pitfall 4).
setTestEnv({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  APP_URL: "https://test.example.com",
  AI_TEST_MODE: "true",
  AI_FORCE_FAILURE: "false",
});

const gateway = await import("../_shared/merit-gateway.ts");
const anthropic = await import("../_shared/anthropic.ts");
const careerPrompts = await import("../_shared/career-prompts.ts");

// ── Pattern C: complementary budget-cap cases (no overlap with index.test.ts) ─

Deno.test("05-02/career(C): current CAREER_CALL_CONFIGS do NOT throw the boot invariant", () => {
  validateCareerCallConfigBudgets(CAREER_CALL_CONFIGS);
});

Deno.test("05-02/career(C): throws when the FREE budget exceeds getMaxOutput('careerCompass','free')", () => {
  // Complements index.test.ts (which only drives the over-ELITE-ceiling throw):
  // push the FREE base call past the 4800 free ceiling and assert the throw.
  const freeCeiling = ceilingFor("free");
  const overFree = freeCeiling + 1;
  const badConfigs: CareerCallConfig[] = [
    { callType: "base", maxTokensFree: overFree, maxTokensPro: 4500, maxTokensElite: 4500 },
    { callType: "growth", maxTokensFree: 0, maxTokensPro: 3500, maxTokensElite: 3500 },
    { callType: "elite-extras", maxTokensFree: 0, maxTokensPro: 2000, maxTokensElite: 2000 },
  ];
  assertThrows(
    () => validateCareerCallConfigBudgets(badConfigs),
    Error,
    `CAREER_CALL_CONFIGS sum ${overFree} exceeds getMaxOutput('careerCompass','free') (${freeCeiling})`,
  );
});

Deno.test("05-02/career(C): FREE_SINGLE_CALL_MAX_TOKENS stays within the free output ceiling", () => {
  // The free single-call path uses FREE_SINGLE_CALL_MAX_TOKENS (career-prompts.ts,
  // imported WITHOUT the serve side-effect). It must not exceed the free ceiling,
  // and index.ts L379 additionally bounds it to <=4000.
  const free = careerPrompts.FREE_SINGLE_CALL_MAX_TOKENS;
  assertEquals(free, 4000, "current FREE_SINGLE_CALL_MAX_TOKENS value (260419-35x)");
  assert(free <= ceilingFor("free"), "free single-call cap must fit within the free output ceiling");
  assert(free <= 4000, "index.ts boot guard bounds FREE_SINGLE_CALL_MAX_TOKENS to <= 4000");
});

// ── Pattern D: EXECUTED AI-failure → refundable for the career fixtureKey ────

Deno.test("05-02/career(D): forced AI failure (analyze_career) is refundable AND restores the ledger", async () => {
  const ledger = createMockLedger(INITIAL_BALANCE, 0);

  const origFF = Deno.env.get("AI_FORCE_FAILURE");
  Deno.env.set("AI_FORCE_FAILURE", "true");
  try {
    const aiResult = await anthropic.invokeAnthropicText({
      model: "claude-haiku-4-5-20251001",
      system: "test",
      messages: [{ role: "user", content: "test career profile for failure branch" }],
      maxTokens: 100,
      temperature: 0.3,
      fixtureKey: "analyze_career",
    });
    assertEquals(aiResult.ok, false, "AI_FORCE_FAILURE should fail the career call");
    if (aiResult.ok) throw new Error("expected forced failure but got ok:true");
    assertEquals(aiResult.status, 529, "forced failure status should be 529");
    assertEquals(aiResult.error, "forced-failure", "forced failure error message");

    assertEquals(
      gateway.isRefundableAnthropicError(aiResult.status, aiResult.error),
      true,
      "529 forced-failure must be classified refundable (D-02)",
    );

    // Career free-tier cost = 3; deduct, then refund on the refundable failure.
    const deduct = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "career_compass", "free");
    assertEquals((deduct as Record<string, unknown>).success, true, "deduction should succeed");
    const txId = (deduct as Record<string, unknown>).transaction_id as string;
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      INITIAL_BALANCE - 3,
      "balance reduced by the free career_compass cost (3)",
    );

    // The handler raises MeritRefundable on a failed career AI call (index.ts
    // e.g. `throw new MeritRefundable(resp.status, resp.error)`).
    const refundable = new gateway.MeritRefundable(aiResult.status, aiResult.error);
    assertEquals(refundable.status, 529);
    assert(refundable instanceof Error);

    const refund = mockRefundMerits(ledger, TEST_USER_ID, txId);
    assertEquals((refund as Record<string, unknown>).success, true, "refund should succeed");
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      INITIAL_BALANCE,
      "balance fully restored — no merit-accounting loss on a failed career analysis",
    );
  } finally {
    if (origFF !== undefined) Deno.env.set("AI_FORCE_FAILURE", origFF);
    else Deno.env.delete("AI_FORCE_FAILURE");
  }
});

Deno.test("05-02/career(D): pro career cost (2) deducts AND fully refunds on failure", () => {
  // Pro tier cost = 2 (encourages subscription, index.ts L79). Exercise the
  // tier-specific deduct/refund symmetry that withMerits drives.
  const ledger = createMockLedger(INITIAL_BALANCE, 0);
  const deduct = mockCheckAndDeductMerits(ledger, TEST_USER_ID, "career_compass", "pro");
  assertEquals((deduct as Record<string, unknown>).success, true);
  assertEquals(ledger.subscription_balance + ledger.shop_balance, INITIAL_BALANCE - 2, "pro cost is 2");
  const txId = (deduct as Record<string, unknown>).transaction_id as string;
  mockRefundMerits(ledger, TEST_USER_ID, txId);
  assertEquals(
    ledger.subscription_balance + ledger.shop_balance,
    INITIAL_BALANCE,
    "pro deduction fully restored on refund",
  );
});

// ── Pattern A: inline-serve branches asserted via source-read ────────────────

Deno.test("05-02/career(A): withMerits wraps career_compass and raises MeritRefundable on failure", () => {
  assert(source.includes("withMerits("), "handler must call withMerits");
  assert(source.includes("'career_compass'"), "handler must declare feature='career_compass'");
  assert(source.includes("MeritRefundable"), "handler must use MeritRefundable for refundable failures");
  assert(source.includes("throw new MeritRefundable"), "handler throws MeritRefundable on failure");
  assert(source.includes("JSON parse failed"), "handler surfaces the parse-failure branch");
});

Deno.test("05-02/career(A): per-tier output budget invariant is wired (the throw branch source)", () => {
  // The EXECUTED Pattern-C throw above mirrors this boot-time invariant in index.ts.
  assert(
    source.includes("CAREER_CALL_CONFIGS sum"),
    "handler must enforce the per-tier output-budget ceiling at boot",
  );
  assert(
    source.includes("getMaxOutput('careerCompass'"),
    "handler must measure budgets against the central getMaxOutput ceiling",
  );
});

Deno.test("05-02/career(A): per-tier INPUT cap is wired (getMaxInputChars('careerCompass'))", () => {
  assert(
    source.includes("getMaxInputChars('careerCompass'"),
    "handler must apply the per-tier careerCompass input cap",
  );
});

Deno.test("05-02/career(A): tier is resolved server-side (never trusts a client-supplied tier)", () => {
  // D-14: the tier is resolved SERVER-SIDE on BOTH auth paths — never from the body.
  //   • JWT path      -> userContext.tier (profiles.subscription_tier via auth.ts)
  //   • internal path -> resolveTierForUserId(userId) (profiles lookup under the service
  //     client). 260713-hrd added this second branch: requireInternalAuth returns null, so
  //     the JWT-only derivation silently resolved 'free' for EVERY queued run (RC-1).
  assert(
    source.includes("userContext.tier") || source.includes("userContext?.tier"),
    "handler must resolve tier from userContext on the JWT path (server-side)",
  );
  assert(
    source.includes("resolveTierForUserId("),
    "handler must resolve tier from the DB on the internal/worker path (server-side)",
  );
  // Fail-closed on cost: an unresolvable tier defaults to 'free', never to elite.
  assert(
    /resolvedTier\s*=\s*'free'/.test(source) && source.includes("resolvedTier"),
    "handler derives resolvedTier server-side, fail-closed to free",
  );
  // There must be no value-read of a client-supplied tier anywhere.
  assert(
    !source.includes("= rawBody.tier") && !source.includes("= body.tier") &&
      !source.includes("rawBody.tier") && !source.includes("body.tier"),
    "handler must NOT read or assign tier from a client-supplied value",
  );
});

Deno.test("05-02/career(A): auth-reject is wired (requireInternalOrUserAuth)", () => {
  // NOTE (divergence from plan wording): the plan's key_links referenced
  // `requireAuth(req, { type: 'user' })` (the grade-linkedin form). analyze-career
  // ACTUALLY wires requireInternalOrUserAuth (JWT user OR internal worker secret).
  // Assert CURRENT behavior.
  assert(
    source.includes("requireInternalOrUserAuth"),
    "handler must authenticate via requireInternalOrUserAuth",
  );
});

Deno.test("05-02/career(A): the 412 prior-analyses gates are GONE; bad-input 400 still wired", () => {
  // RULE-1 FLIP (quick task 260713-hrd). This test used to assert `status: 412` was
  // present — it encoded the OLD behavior, where Career Compass refused to run until the
  // user had ALREADY completed a Resume Analysis AND a LinkedIn Grade.
  //
  // That gate is now deleted by operator decision: Career Compass Free is STANDALONE. A
  // resume is the only requirement; LinkedIn is optional; a prior Resume Analysis /
  // LinkedIn Grade is OPTIONAL ENRICHMENT, never a gate. (It was also self-defeating —
  // the priors it demanded consumed the very legacy quota it then checked.)
  //
  // So the assertion is INVERTED, not weakened: no 412 may survive anywhere in the handler.
  // Checked against `codeOnly` — the handler still CARRIES a comment explaining the removal.
  assert(
    !codeOnly.includes("status: 412"),
    "no 412 gate may remain — Career Compass Free is standalone (resume-only must succeed)",
  );
  assert(
    !codeOnly.includes("missing_prior_analyses") && !codeOnly.includes("linkedin_prior_missing"),
    "the prior-analyses gate error codes must be gone from the handler code",
  );
  assert(source.includes("status: 400"), "handler still returns 400 on genuinely bad input");
});

Deno.test("05-02/career(A): downstream 429/402 usage/cap branches are wired", () => {
  assert(
    source.includes("status === 429") || source.includes("status: 429"),
    "handler handles 429 (rate limit)",
  );
  assert(
    source.includes("status === 402") || source.includes("status: 402"),
    "handler handles 402 (insufficient merits)",
  );
});
