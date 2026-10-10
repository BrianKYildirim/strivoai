/**
 * TEST-06: Pro yearly subscribe -> 75 Merits -> simulate 30-day advance via
 *          direct invocation of reset-subscription-merits batch sweeper ->
 *          subscription_balance resets to 75 (ZERO rollover of unused Merits);
 *          shop_balance preserved; auth guard rejects unauthenticated calls.
 *
 * REQ-IDs: TEST-06
 * Phase: 21 (integration-validation-and-cutover), Plan 21-03
 * Source pattern: _tests/test-04-free-signup-to-shop.test.ts,
 *                 _tests/test-05-upgrade-proration.test.ts,
 *                 reset-subscription-merits/index.test.ts
 *
 * Mode: OFFLINE. Zero external deps.
 *
 * Mirrors:
 *   - public.check_and_deduct_merits   -- supabase/migrations/20260415000000_merit_rpcs.sql §2
 *   - public.reset_subscription_merits -- supabase/migrations/20260415000000_merit_rpcs.sql §6
 *     (overwrite-to-allowance, no rollover, shop_balance untouched)
 *
 * Architectural note (Rule 3 deviation vs. plan text):
 *   - The shipped `makeInvoicePaymentSucceededEvent` fixture takes
 *     `{ subscription, customer, interval }`, not `{ userId, amountPaid,
 *     billingCycle }`. And the shipped handler NO-OPs `invoice.payment_succeeded`
 *     for `interval === "year"` (stripe-webhook-handler/index.ts:575-584) —
 *     yearly monthly refills are owned by pg_cron per 12-CONTEXT D-08.
 *   - Therefore Step 1 (initial 75-Merit credit on a Pro yearly subscribe) is
 *     routed via `checkout.session.completed` mode=subscription
 *     interval=annual, which invokes `reset_subscription_merits` at
 *     stripe-webhook-handler/index.ts:445-459. This matches the shipped
 *     production path and the pattern TEST-05 established.
 *   - Step 3 (30-day advance) directly invokes the batch-sweeper handler
 *     `handleResetSubscriptionMerits` per 21-CONTEXT D-03 (no time mocking).
 *     The handler queries `user_merits` for rows with past
 *     `subscription_reset_date` and `profiles.subscription_tier in
 *     ('pro','elite')`, then calls the RPC per row. The test seeds a due row
 *     and asserts subscription_balance resets to 75 with shop_balance preserved.
 *
 * Run with:
 *   deno test --allow-env --allow-net --allow-read --no-check \
 *     supabase/functions/_tests/test-06-yearly-reset.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeCheckoutSessionCompletedEvent } from "../_shared/test-helpers/stripe-fixtures.ts";
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";
// handleResetSubscriptionMerits is imported dynamically below AFTER
// neutering Deno.serve — see comment block around line 80.

// ── Test-env setup (must run BEFORE importing handleStripeWebhook) ──────────
//
// Mirrors TEST-04 / TEST-05. INTERNAL_JOB_SECRET is scoped to the test process
// via Deno.env.set and uses a random value so it never leaks as a static
// fixture (T-21-03-03 disposition).
const TEST_WEBHOOK_SECRET = "whsec_test_secret_abcdef1234567890";
const PRO_YEARLY_PRICE = "price_pro_y_test06";
const INTERNAL_SECRET = "internal_secret_test06_" + crypto.randomUUID();

Deno.env.set("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
Deno.env.set("STRIPE_PRICE_PRO_YEARLY", PRO_YEARLY_PRICE);
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APP_URL", "https://test.example.com");
Deno.env.set("INTERNAL_JOB_SECRET", INTERNAL_SECRET);

// ── Neuter Deno.serve BEFORE loading the handler modules ──────────────────
// Both `stripe-webhook-handler/index.ts` AND `reset-subscription-merits/index.ts`
// call `Deno.serve(...)` at module scope (port 8000 default). Loading both in
// the same test file causes AddrInUse: only one module can bind the port.
// Production is unaffected — the handler `export async function` is what the
// tests invoke. Replacing Deno.serve with a no-op before any import lets both
// modules load safely. This pattern matches precedent set by
// stripe-webhook-handler/index.test.ts's module-load harness.
// Deno 2.x made Deno.serve a getter-only property; use Object.defineProperty
// to override it (configurable: true allows replacing the accessor descriptor).
Object.defineProperty(Deno, "serve", {
  writable: true,
  configurable: true,
  value: (..._args: unknown[]) => ({
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref: () => {},
    unref: () => {},
  }),
});

// Dynamic imports after env setup + serve-neutering. Dynamic rather than top-
// level static so the mutated Deno.serve is in effect before either module
// evaluates its module-scope `Deno.serve(...)` call.
const { handleStripeWebhook } = await import(
  "../stripe-webhook-handler/index.ts"
);
const { handleResetSubscriptionMerits } = await import(
  "../reset-subscription-merits/index.ts"
);

// ── In-memory merit ledger (mirrors TEST-04/05) ─────────────────────────────

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
  /** When populated, the user is "due" for a reset on this ISO timestamp. */
  subscription_reset_date: string | null;
  transactions: MeritTransaction[];
}

function createMockLedger(
  subBalance: number,
  shopBalance: number,
  resetDate: string | null = null,
): MockLedger {
  return {
    subscription_balance: subBalance,
    shop_balance: shopBalance,
    subscription_reset_date: resetDate,
    transactions: [],
  };
}

function uuid(): string {
  return crypto.randomUUID();
}

// Tier allowance table (mirrors reset_subscription_merits §6 lines 388-392).
const TIER_ALLOWANCE: Record<string, number> = {
  free: 0,
  pro: 75,
  elite: 150,
};

// Feature cost lookup (mirrors merit_feature_costs seed).
const FEATURE_COSTS: Record<string, Record<string, number | undefined>> = {
  resume_analysis: { free: 3, pro: 3, elite: 3 },
  career_compass: { free: 3, pro: 3, elite: 3 },
  linkedin_grading: { free: 3, pro: 3, elite: 3 },
};

/**
 * Mock check_and_deduct_merits RPC -- mirrors migration §2.
 * Subscription-first deduction across buckets.
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
 * Mock reset_subscription_merits RPC -- mirrors migration §6 lines 367-424.
 *
 * Critical contract assertions (T-21-03-01 + T-21-03-04 mitigations):
 *   - Sets subscription_balance to the per-tier allowance (OVERWRITE, not add).
 *     This is what proves ZERO rollover of unused Merits per NFR-08.
 *   - Leaves shop_balance UNTOUCHED. No subscription reset ever drains a
 *     user's shop-purchased Merits.
 *   - Writes a single grant ledger row with source='subscription-reset' and
 *     amount = new - old (can be negative if previous_balance > allowance).
 */
function mockResetSubscriptionMerits(
  ledger: MockLedger,
  userId: string,
  tier: string,
  nextResetDate: string | null,
): Record<string, unknown> {
  if (tier === "free") {
    return { success: true, skipped: "free_tier_noop" };
  }
  const target = TIER_ALLOWANCE[tier];
  if (target === undefined) {
    return { error: "invalid_tier" };
  }
  const oldBalance = ledger.subscription_balance;
  const delta = target - oldBalance;
  // OVERWRITE — zero rollover. shop_balance unchanged.
  ledger.subscription_balance = target;
  if (nextResetDate) {
    ledger.subscription_reset_date = nextResetDate;
  }
  const txId = uuid();
  ledger.transactions.push({
    id: txId,
    user_id: userId,
    amount: delta,
    balance_type: "grant",
    source: "subscription-reset",
    feature: null,
    metadata: { reset_for_tier: tier, prev_balance: oldBalance },
    created_at: new Date().toISOString(),
  });
  return {
    success: true,
    previous_balance: oldBalance,
    new_subscription_balance: target,
    shop_balance_preserved: ledger.shop_balance,
    transaction_id: txId,
  };
}

// ── Mock Supabase service client ────────────────────────────────────────────
//
// TEST-06 exercises two handler surfaces:
//
//   1. handleStripeWebhook (Step 1 — yearly checkout):
//        - .from('stripe_webhook_events').insert(...)         -- idempotency
//        - .from('profiles').update(...).eq(...).select(...)  -- profile lookup
//        - .rpc('reset_subscription_merits', {...})           -- merit grant
//
//   2. handleResetSubscriptionMerits (Step 3 — 30-day sweep):
//        - .from('user_merits').select(...).lte(...).in(...).limit(...)
//        - .rpc('reset_subscription_merits', { p_user_id, p_tier, p_next_reset_date })
//
// The same fake is shared between calls so the ledger mutations from the
// checkout webhook carry forward into the sweep.

interface FakeProfile {
  id: string;
  email: string | null;
  full_name?: string | null;
  subscription_tier: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

interface FakeSupabaseRpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function buildMockServiceClient(
  ledger: MockLedger,
  profile: FakeProfile,
) {
  const seenEventIds: string[] = [];
  const rpcCalls: FakeSupabaseRpcCall[] = [];

  function buildUserMeritsQuery() {
    // Mirrors the sweeper chain:
    //   supabase.from('user_merits').select(...).lte(col, val).in(col, vals).limit(n)
    // Returns the row iff the ledger is "due" (reset_date present and the
    // profile tier is in the allowed list). Reset_date is set by Step 1's
    // checkout; until then the user is not in the due queue.
    const q: Record<string, unknown> = {};
    q.select = (_cols: string) => q;
    q.lte = (_col: string, _val: string) => q;
    q.in = (_col: string, vals: string[]) => {
      const matches = profile.subscription_tier !== null &&
        vals.includes(profile.subscription_tier) &&
        ledger.subscription_reset_date !== null;
      (q as Record<string, unknown>).__matches = matches;
      return q;
    };
    q.limit = (_n: number) => {
      const matches = (q as Record<string, unknown>).__matches === true;
      if (!matches) {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({
        data: [{
          user_id: profile.id,
          subscription_reset_date: ledger.subscription_reset_date,
          profiles: { subscription_tier: profile.subscription_tier },
        }],
        error: null,
      });
    };
    return q;
  }

  return {
    seenEventIds,
    rpcCalls,

    from(table: string) {
      if (table === "stripe_webhook_events") {
        return {
          insert(data: Record<string, unknown>) {
            const eventId = data.event_id as string;
            if (seenEventIds.includes(eventId)) {
              return Promise.resolve({ error: { code: "23505" } });
            }
            seenEventIds.push(eventId);
            return Promise.resolve({ error: null });
          },
          delete() {
            return {
              eq(_col: string, _val: unknown) {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "user_merits") {
        return buildUserMeritsQuery();
      }

      if (table === "profiles") {
        return {
          update(updateData: Record<string, unknown>) {
            const chain = {
              eq(eqColumn: string, eqValue: unknown) {
                const matches =
                  (eqColumn === "id" && eqValue === profile.id) ||
                  (eqColumn === "email" && eqValue === profile.email) ||
                  (eqColumn === "stripe_customer_id" &&
                    eqValue != null &&
                    profile.stripe_customer_id === eqValue) ||
                  (eqColumn === "stripe_subscription_id" &&
                    eqValue != null &&
                    profile.stripe_subscription_id === eqValue);
                return {
                  select(_cols: string) {
                    if (matches) {
                      const preUpdateTier = profile.subscription_tier;
                      Object.assign(profile, updateData);
                      return Promise.resolve({
                        data: [{
                          id: profile.id,
                          email: profile.email,
                          subscription_tier: preUpdateTier,
                        }],
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                  then(
                    resolve: (v: unknown) => unknown,
                    reject?: (e: unknown) => unknown,
                  ) {
                    if (matches) {
                      Object.assign(profile, updateData);
                      return Promise.resolve({
                        data: [profile],
                        error: null,
                      }).then(resolve, reject);
                    }
                    return Promise.resolve({
                      data: [],
                      error: null,
                    }).then(resolve, reject);
                  },
                };
              },
            };
            return chain;
          },
          select(_cols: string) {
            return {
              eq(_col: string, val: unknown) {
                return {
                  single() {
                    if (val === profile.id) {
                      return Promise.resolve({
                        data: {
                          email: profile.email,
                          full_name: profile.full_name ?? null,
                        },
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }

      // Default no-op for any unexpected table.
      return {
        insert(_data: unknown) {
          return Promise.resolve({ error: null });
        },
      };
    },

    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "reset_subscription_merits") {
        const result = mockResetSubscriptionMerits(
          ledger,
          args.p_user_id as string,
          args.p_tier as string,
          (args.p_next_reset_date as string | null) ?? null,
        );
        if ((result as Record<string, unknown>).error) {
          return Promise.resolve({
            error: { code: (result as Record<string, unknown>).error },
          });
        }
        return Promise.resolve({ error: null });
      }
      // Unknown RPCs return success silently.
      return Promise.resolve({ error: null });
    },
  };
}

// ── Fake Stripe SDK ─────────────────────────────────────────────────────────

function buildFakeStripe(signedEvent: Record<string, unknown>) {
  return {
    webhooks: {
      constructEventAsync(
        _rawBody: string,
        _signature: string,
        _secret: string,
        _tolerance?: unknown,
        _cryptoProvider?: unknown,
      ) {
        return Promise.resolve(signedEvent);
      },
    },
    subscriptions: {
      retrieve(_subId: string) {
        return Promise.resolve({
          items: {
            data: [{
              price: {
                id: PRO_YEARLY_PRICE,
                recurring: { interval: "year" },
              },
            }],
          },
        });
      },
    },
  };
}

// ── Test 1: full yearly-subscribe + 30-day reset scenario ───────────────────

Deno.test({
  name:
    "TEST-06: Pro yearly subscribe -> 75 Merits -> 30-day advance -> reset to 75 with ZERO rollover; shop_balance preserved",
  // See TEST-04 / TEST-05: handler fires fire-and-forget fetch to
  // send-strivo-email after shop credit (stripe-webhook-handler/index.ts:513);
  // module-scope Deno.serve() + network primitives trip the Deno sanitizer.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test06000001";
    // Fixed ISO timestamp far enough in the past that `.lte(now)` matches
    // regardless of wall-clock drift. Per 21-CONTEXT D-03 and the Plan 21-03
    // acceptance criteria, this file uses NO time-mocking primitives — the
    // past date is a literal fixture, not a manipulated clock.
    const DUE_RESET_DATE = "2020-01-01T00:00:00.000Z";
    const ledger = createMockLedger(0, 0, null);

    const profile: FakeProfile = {
      id: USER,
      email: "test06@example.com",
      full_name: "Test User 06",
      subscription_tier: "free",
    };
    const fakeSupabase = buildMockServiceClient(ledger, profile);

    // ─ Step 1: Pro yearly checkout credits 75 Merits ─────────────────────
    // Routed via checkout.session.completed mode=subscription interval=annual
    // per the architectural deviation note in the file header.
    const evCheckout = makeCheckoutSessionCompletedEvent({
      mode: "subscription",
      user_id: USER,
      tier: "pro",
      interval: "annual",
      customer: "cus_test06",
      subscription: "sub_test06",
    });
    const body1 = JSON.stringify(evCheckout);
    const sig1 = await signStripePayload(body1, TEST_WEBHOOK_SECRET);
    const req1 = new Request("https://example.com/stripe-webhook-handler", {
      method: "POST",
      headers: {
        "stripe-signature": sig1,
        "Content-Type": "application/json",
      },
      body: body1,
    });
    const fakeStripe1 = buildFakeStripe(
      evCheckout as unknown as Record<string, unknown>,
    );
    const resp1 = await handleStripeWebhook(req1, {
      supabase: fakeSupabase,
      stripe: fakeStripe1,
    });
    assertEquals(resp1.status, 200, "yearly checkout webhook should 200");
    assertEquals(
      ledger.subscription_balance,
      75,
      "Pro yearly subscribe credits 75 Merits via reset_subscription_merits",
    );
    assertEquals(
      ledger.shop_balance,
      0,
      "shop_balance stays at 0 on subscription grant",
    );
    assertEquals(profile.subscription_tier, "pro", "profile tier -> pro");

    // Prime the ledger's reset_date so the Step 3 sweeper sees the user as
    // "due". In production this column is set by the reset_subscription_merits
    // RPC itself (migration §6 writes subscription_reset_date = p_next_reset_date);
    // the mock reset RPC did write the next-month date, but we want to
    // simulate 30+ days later — overwrite to a past timestamp.
    ledger.subscription_reset_date = DUE_RESET_DATE;

    // ─ Step 2: User spends 10 Merits over the month ──────────────────────
    // Five resume_analysis calls at cost 3 (Pro) deduct 15 total. Remaining: 60.
    for (let i = 0; i < 5; i++) {
      const r = mockCheckAndDeductMerits(
        ledger,
        USER,
        "resume_analysis",
        "pro",
      );
      assertEquals(
        (r as Record<string, unknown>).success,
        true,
        `deduction ${i + 1} should succeed`,
      );
    }
    assertEquals(
      ledger.subscription_balance,
      60,
      "after 5x resume_analysis (3 each), 60 sub Merits remain",
    );

    // Seed 10 shop-balance Merits (valid pack size per SHOP-01: 3/10/25/50).
    ledger.shop_balance = 10;
    ledger.transactions.push({
      id: uuid(),
      user_id: USER,
      amount: 10,
      balance_type: "shop",
      source: "shop-credit",
      feature: null,
      metadata: { stripe_payment_id: "pi_test06_seed", pack_size: 10 },
      created_at: new Date().toISOString(),
    });
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      75,
      "pre-reset total: 65 sub + 10 shop = 75",
    );

    // ─ Step 3: 30-day advance via direct batch-sweeper invocation ────────
    // Per 21-CONTEXT D-03: no time mocking — exercise the real reset entry
    // point. The sweeper finds ledger rows with past reset_date + tier in
    // (pro, elite) and calls reset_subscription_merits per row.
    const resetReq = new Request(
      "https://example.com/reset-subscription-merits",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${INTERNAL_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invocation_source: "manual" }),
      },
    );
    const resetResp = await handleResetSubscriptionMerits(resetReq, {
      supabase: fakeSupabase,
      requireAuth: () => Promise.resolve(null),
    });
    assertEquals(resetResp.status, 200, "reset sweep returns 200");
    const resetBody = await resetResp.json();
    assertEquals(resetBody.processed, 1, "one user processed");
    assertEquals(resetBody.errors, 0, "zero errors");
    assertEquals(resetBody.batch_size, 1, "batch size 1");

    // T-21-03-01 mitigation: reset OVERWROTE (not added). Proof: final
    // balance is 75, not 65 + 75 = 140. This is the ZERO rollover invariant.
    assertEquals(
      ledger.subscription_balance,
      75,
      "subscription_balance resets to 75 (ZERO rollover of the 65 unused)",
    );
    assert(
      ledger.subscription_balance === 75,
      "ZERO rollover verified (balance is exactly 75, not 140)",
    );

    // T-21-03-04 mitigation: shop_balance preserved (subscription reset
    // never drains shop-purchased Merits).
    assertEquals(
      ledger.shop_balance,
      10,
      "shop_balance preserved (no rollover-back, no drain)",
    );

    // ─ Step 4: Verify merit_transactions rows were written ────────────────
    // Two subscription-reset rows exist: one from Step 1 checkout grant
    // (amount=75, 0->75) and one from Step 3 sweeper (amount=10, 65->75).
    // The sweeper row is the later one — find it by filtering on prev_balance.
    const resetTxs = ledger.transactions.filter(
      (t) => t.source === "subscription-reset",
    );
    assertEquals(
      resetTxs.length,
      2,
      "two subscription-reset rows written (checkout grant + 30-day sweep)",
    );
    const sweepResetTx = resetTxs.find(
      (t) =>
        (t.metadata as Record<string, unknown>).prev_balance === 65,
    );
    assert(
      sweepResetTx !== undefined,
      "sweep reset transaction row written with source='subscription-reset' and prev_balance=65",
    );
    // delta = 75 (target) - 65 (prev) = 10
    assertEquals(
      sweepResetTx?.amount,
      10,
      "sweep grant amount = new (75) - old (65) = 10",
    );

    // ─ Step 5: Verify RPC was called with the right payload ──────────────
    const rpcCallsForReset = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "reset_subscription_merits",
    );
    // One from Step 1 (checkout) + one from Step 3 (sweep) = 2 total.
    assertEquals(
      rpcCallsForReset.length,
      2,
      "reset_subscription_merits called twice (checkout + sweep)",
    );
    const sweepCall = rpcCallsForReset[1];
    assertEquals(sweepCall.args.p_user_id, USER);
    assertEquals(sweepCall.args.p_tier, "pro");
    assert(
      typeof sweepCall.args.p_next_reset_date === "string",
      "sweep RPC carries a next_reset_date",
    );
  },
});

// ── Test 2: auth guard — unauthenticated sweep invocation is rejected ───────

Deno.test({
  name:
    "TEST-06 auth guard: reset-subscription-merits rejects unauthenticated calls; ledger unchanged",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test06000002";
    // Fixed past ISO (no time mocking per 21-CONTEXT D-03).
    const DUE_RESET_DATE = "2020-01-01T00:00:00.000Z";
    const ledger = createMockLedger(40, 5, DUE_RESET_DATE);

    const profile: FakeProfile = {
      id: USER,
      email: "test06auth@example.com",
      full_name: "Test User 06 Auth",
      subscription_tier: "pro",
      stripe_customer_id: "cus_test06auth",
      stripe_subscription_id: "sub_test06auth",
    };
    const fakeSupabase = buildMockServiceClient(ledger, profile);

    const req = new Request(
      "https://example.com/reset-subscription-merits",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invocation_source: "manual" }),
      },
    );

    // Inject a requireAuth stub that throws a 401 Response (matches the real
    // _shared/auth.ts requireAuth contract — throws Response on failure).
    const throwingAuth = () => {
      throw new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    };

    const resp = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: throwingAuth,
    });

    assert(
      resp.status === 401 || resp.status === 403,
      `auth failure returns 401 or 403 (got ${resp.status})`,
    );

    // T-21-03-02 mitigation: ledger untouched on auth failure.
    assertEquals(
      ledger.subscription_balance,
      40,
      "subscription_balance unchanged on auth failure",
    );
    assertEquals(
      ledger.shop_balance,
      5,
      "shop_balance unchanged on auth failure",
    );
    assertEquals(
      fakeSupabase.rpcCalls.length,
      0,
      "no RPCs invoked when auth fails",
    );
  },
});
