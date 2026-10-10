/**
 * TEST-04: Free signup -> 5 Merits -> Resume Analysis (3) -> 2 left ->
 *          Career Compass (3) blocked -> shop 3-pack via signed Stripe webhook
 *          -> 5 Merits -> Career Compass succeeds (subscription-first ordering)
 *          -> 2 left.
 *
 * REQ-IDs: TEST-04
 * Phase: 21 (integration-validation-and-cutover), Plan 21-01
 * Source pattern: analyze-resume/test-07.test.ts (lines 44-121, 188-246)
 *
 * Mode: OFFLINE. Zero external deps.
 *
 * Mirrors:
 *   - public.check_and_deduct_merits  -- supabase/migrations/20260415000000_merit_rpcs.sql §2 (lines 67-152)
 *   - public.credit_shop_merits       -- supabase/migrations/20260415000000_merit_rpcs.sql §5 (lines 288-352)
 *
 * The mock-ledger contracts MUST stay in lockstep with the migration above.
 * If Phase 11 RPC contracts change, update this file alongside the migration.
 *
 * Run with:
 *   deno test --allow-env --allow-net --allow-read --no-check \
 *     supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeCheckoutSessionCompletedEvent } from "../_shared/test-helpers/stripe-fixtures.ts";
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";

// ── Test-env setup (must run BEFORE importing handleStripeWebhook) ──────────
//
// stripe-webhook-handler reads STRIPE_WEBHOOK_SECRET via Deno.env.get() inside
// the handler (not at module scope), but the production Stripe client init
// requires STRIPE_SECRET_KEY at module load. Set both before dynamic import.
//
// The test-secret value matches the one used in stripe-webhook-handler tests
// (whsec_test_secret_abcdef1234567890). It is a known-public test fixture and
// cannot be replayed against production webhooks (T-21-01-01 disposition).
const TEST_WEBHOOK_SECRET = "whsec_test_secret_abcdef1234567890";

Deno.env.set("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APP_URL", "https://test.example.com");

// Dynamic import after env setup so the production client init has values.
const { handleStripeWebhook } = await import(
  "../stripe-webhook-handler/index.ts"
);

// ── In-memory merit ledger (copied from analyze-resume/test-07.test.ts) ─────

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

// Feature cost lookup (matches merit_feature_costs seed + Phase 11 §2 contract).
const FEATURE_COSTS: Record<string, Record<string, number>> = {
  resume_analysis: { free: 3, pro: 3, elite: 3 },
  career_compass: { free: 3, pro: 3, elite: 3 },
  linkedin_grading: { free: 3, pro: 3, elite: 3 },
};

/**
 * Mock check_and_deduct_merits RPC -- mirrors migration §2 (lines 67-152).
 * Subscription-first deduction, split across buckets, two ledger rows sharing
 * a single deduction_id when the cost spans both buckets.
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
 * Mock credit_shop_merits RPC -- mirrors migration §5 (lines 288-352).
 * Idempotency keyed on stripe_payment_intent_id. Validates pack size first.
 * Returns { success: true, duplicate: true, shop_balance } on idempotent retry,
 * matching the real RPC's response shape (line 314-318).
 */
function mockCreditShopMerits(
  ledger: MockLedger,
  userId: string,
  packSize: number,
  stripePaymentId: string,
): Record<string, unknown> {
  if (![3, 10, 25, 50].includes(packSize)) {
    return { error: "invalid_pack_size" };
  }

  // Idempotency: any prior shop-credit row for this stripe_payment_id?
  const duplicate = ledger.transactions.find(
    (t) =>
      t.source === "shop-credit" &&
      (t.metadata as Record<string, unknown>).stripe_payment_id ===
        stripePaymentId,
  );
  if (duplicate) {
    return {
      success: true,
      duplicate: true,
      shop_balance: ledger.shop_balance,
    };
  }

  ledger.shop_balance += packSize;
  const txId = uuid();
  ledger.transactions.push({
    id: txId,
    user_id: userId,
    amount: packSize,
    balance_type: "shop",
    source: "shop-credit",
    feature: null,
    metadata: { stripe_payment_id: stripePaymentId, pack_size: packSize },
    created_at: new Date().toISOString(),
  });

  return {
    success: true,
    shop_balance: ledger.shop_balance,
    pack_size: packSize,
  };
}

// ── Mock Supabase service client for stripe-webhook-handler ─────────────────
//
// stripe-webhook-handler exercises this surface:
//   1. .from('stripe_webhook_events').insert(...)             -- idempotency
//   2. .from('profiles').update(...).eq(...).select(...)      -- profile lookup
//   3. .rpc('credit_shop_merits', { p_user_id, p_pack_size, p_stripe_payment_id })
//   4. .from('profiles').select('email, full_name').eq('id', ...).single() -- receipt
//
// This fake serializes event-id idempotency in-memory and routes the shop-credit
// RPC to mockCreditShopMerits.

interface FakeProfile {
  id: string;
  email: string | null;
  full_name?: string | null;
  subscription_tier: string | null;
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

  return {
    seenEventIds,
    rpcCalls,

    from(table: string) {
      if (table === "stripe_webhook_events") {
        return {
          insert(data: Record<string, unknown>) {
            const eventId = data.event_id as string;
            if (seenEventIds.includes(eventId)) {
              // Postgres unique-violation code: triggers handler's duplicate path
              return Promise.resolve({ error: { code: "23505" } });
            }
            seenEventIds.push(eventId);
            return Promise.resolve({ error: null });
          },
          delete() {
            return {
              eq(_col: string, _val: unknown) {
                // Used by stripe-webhook-handler when stripe.subscriptions.retrieve
                // throws after the idempotency insert; not exercised in TEST-04.
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "profiles") {
        return {
          update(updateData: Record<string, unknown>) {
            return {
              eq(eqColumn: string, eqValue: unknown) {
                const matches =
                  (eqColumn === "id" && eqValue === profile.id) ||
                  (eqColumn === "email" && eqValue === profile.email);
                return {
                  select(_cols: string) {
                    if (matches) {
                      // Apply the update locally so subsequent reads see new fields.
                      Object.assign(profile, updateData);
                      return Promise.resolve({
                        data: [{
                          id: profile.id,
                          email: profile.email,
                          subscription_tier: profile.subscription_tier,
                        }],
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
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
        update(_data: unknown) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                select(_cols: string) {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
      };
    },

    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "credit_shop_merits") {
        const result = mockCreditShopMerits(
          ledger,
          args.p_user_id as string,
          args.p_pack_size as number,
          args.p_stripe_payment_id as string,
        );
        // stripe-webhook-handler treats any non-null error as a 500.
        if ((result as Record<string, unknown>).error) {
          return Promise.resolve({
            error: { code: (result as Record<string, unknown>).error },
          });
        }
        return Promise.resolve({ error: null });
      }
      // Unknown RPCs return success silently — keeps the fake permissive for
      // event types TEST-04 does not exercise.
      return Promise.resolve({ error: null });
    },
  };
}

// ── Fake Stripe SDK (constructEventAsync only) ──────────────────────────────
//
// We construct the event in-process so HMAC verification is tautological in
// tests; production still uses the real npm:stripe SDK with the real secret.

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
        // Not exercised by TEST-04 (no invoice.payment_succeeded events) but
        // returned permissively in case the handler ever inspects it.
        return Promise.resolve({
          items: { data: [{ price: { id: "price_test", recurring: { interval: "month" } } }] },
        });
      },
    },
  };
}

// ── Test 1: full happy-path scenario ────────────────────────────────────────

Deno.test({
  name:
    "TEST-04: Free signup -> 5 Merits -> Resume (3) -> Career Compass blocked -> shop 3-pack -> Career Compass succeeds",
  // The first import of stripe-webhook-handler triggers Deno.serve at module
  // scope; disable resource/op sanitizers so the background listener does not
  // trip the test harness (mirrors stripe-webhook-handler/index.test.ts:309).
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test04000001";
    const ledger = createMockLedger(5, 0); // 5 lifetime Merits per MER-10

    // ─ Step 1: Resume Analysis (cost 3, free tier) succeeds ──────────────
    const r1 = mockCheckAndDeductMerits(
      ledger,
      USER,
      "resume_analysis",
      "free",
    );
    assertEquals((r1 as Record<string, unknown>).success, true);
    assertEquals((r1 as Record<string, unknown>).remaining_balance, 2);
    assertEquals(
      ((r1 as Record<string, unknown>).deducted_from as Record<string, number>)
        .subscription,
      3,
    );
    assertEquals(
      ((r1 as Record<string, unknown>).deducted_from as Record<string, number>)
        .shop,
      0,
    );

    // ─ Step 2: Career Compass (cost 3) blocked — only 2 left ─────────────
    const r2 = mockCheckAndDeductMerits(
      ledger,
      USER,
      "career_compass",
      "free",
    );
    assertEquals((r2 as Record<string, unknown>).error, "insufficient_merits");
    assertEquals(
      (r2 as Record<string, unknown>).upgrade_required,
      true,
    );
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      2,
      "balance unchanged on insufficient_merits",
    );

    // ─ Step 3: Signed shop-3-pack webhook credits 3 to shop_balance ──────
    const event = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      pack_size: 3,
      payment_intent: "pi_test04_3pack",
      user_id: USER,
    });
    const body = JSON.stringify(event);
    const signature = await signStripePayload(body, TEST_WEBHOOK_SECRET);
    const req = new Request(
      "https://example.com/stripe-webhook-handler",
      {
        method: "POST",
        headers: {
          "stripe-signature": signature,
          "Content-Type": "application/json",
        },
        body,
      },
    );
    const fakeSupabase = buildMockServiceClient(ledger, {
      id: USER,
      email: "test04@example.com",
      full_name: "Test User 04",
      subscription_tier: "free",
    });
    const fakeStripe = buildFakeStripe(
      event as unknown as Record<string, unknown>,
    );

    const resp = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(resp.status, 200, "webhook should succeed with valid sig");

    // The handler must have invoked credit_shop_merits exactly once with
    // pack_size=3 and the payment-intent we crafted.
    const creditCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(creditCalls.length, 1, "credit_shop_merits called exactly once");
    assertEquals(creditCalls[0].args.p_user_id, USER);
    assertEquals(creditCalls[0].args.p_pack_size, 3);
    assertEquals(creditCalls[0].args.p_stripe_payment_id, "pi_test04_3pack");

    assertEquals(ledger.shop_balance, 3, "shop_balance credited by 3");
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      5,
      "total balance back to 5 (2 sub + 3 shop)",
    );

    // ─ Step 4: Career Compass now succeeds; subscription-first ordering ──
    const r4 = mockCheckAndDeductMerits(
      ledger,
      USER,
      "career_compass",
      "free",
    );
    assertEquals((r4 as Record<string, unknown>).success, true);
    assertEquals((r4 as Record<string, unknown>).remaining_balance, 2);
    assertEquals(
      ((r4 as Record<string, unknown>).deducted_from as Record<string, number>)
        .subscription,
      2,
      "subscription-first: drained the 2 remaining sub merits",
    );
    assertEquals(
      ((r4 as Record<string, unknown>).deducted_from as Record<string, number>)
        .shop,
      1,
      "subscription-first: pulled 1 shop merit to cover the 3-cost",
    );
    assertEquals(ledger.subscription_balance, 0);
    assertEquals(ledger.shop_balance, 2);

    // Two deduction rows must share a single deduction_id (Phase 11 §2 step 5).
    const lastDeduction = (r4 as Record<string, unknown>)
      .transaction_id as string;
    const splitRows = ledger.transactions.filter(
      (t) =>
        (t.metadata as Record<string, unknown>).deduction_id === lastDeduction,
    );
    assertEquals(splitRows.length, 2, "split deduction writes 2 ledger rows");
    assert(
      splitRows.some((r) => r.balance_type === "subscription") &&
        splitRows.some((r) => r.balance_type === "shop"),
      "split deduction has both subscription and shop rows",
    );
  },
});

// ── Test 2: idempotency — same signed event delivered twice does not double-credit ──

Deno.test({
  name:
    "TEST-04 idempotency: re-delivery of same Stripe event does not double-credit",
  // The handler fires a fire-and-forget fetch to send-strivo-email after a
  // successful shop credit (stripe-webhook-handler/index.ts:513). That fetch
  // never resolves in offline tests, so the Deno resource sanitizer reports a
  // leak. Matches the disposition used by Test 1 above.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test04000002";
    const ledger = createMockLedger(0, 0);

    const event = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      pack_size: 3,
      payment_intent: "pi_test04_dup",
      user_id: USER,
    });
    const body = JSON.stringify(event);
    const signature = await signStripePayload(body, TEST_WEBHOOK_SECRET);

    const fakeSupabase = buildMockServiceClient(ledger, {
      id: USER,
      email: "test04dup@example.com",
      full_name: "Test User 04 Dup",
      subscription_tier: "free",
    });
    const fakeStripe = buildFakeStripe(
      event as unknown as Record<string, unknown>,
    );

    const mkReq = () =>
      new Request("https://example.com/stripe-webhook-handler", {
        method: "POST",
        headers: {
          "stripe-signature": signature,
          "Content-Type": "application/json",
        },
        body,
      });

    // First delivery — credits 3 to shop_balance.
    const resp1 = await handleStripeWebhook(mkReq(), {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(resp1.status, 200);
    assertEquals(ledger.shop_balance, 3, "first delivery credits 3");

    // Second delivery — handler's event-level idempotency fires (23505 path);
    // RPC must NOT run again.
    const resp2 = await handleStripeWebhook(mkReq(), {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(resp2.status, 200);
    const body2 = await resp2.json();
    assertEquals(
      body2.duplicate,
      true,
      "second delivery returns duplicate flag",
    );

    assertEquals(ledger.shop_balance, 3, "second delivery must not re-credit");

    const creditCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(
      creditCalls.length,
      1,
      "credit_shop_merits invoked exactly once across both deliveries",
    );
  },
});
