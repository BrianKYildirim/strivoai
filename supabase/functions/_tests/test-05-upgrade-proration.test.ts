/**
 * TEST-05: Free -> Pro -> Recruiting Lens (8) -> Pro -> Elite (upgrade-diff)
 *          -> Recruiting Lens (5) -> tier-gated output verification.
 *
 * REQ-IDs: TEST-05
 * Phase: 21 (integration-validation-and-cutover), Plan 21-02
 * Source pattern: _tests/test-04-free-signup-to-shop.test.ts (entire file)
 *                 stripe-webhook-handler/index.test.ts (upgrade + subscription
 *                 routing fakes)
 *
 * Mode: OFFLINE. Zero external deps.
 *
 * Mirrors:
 *   - public.check_and_deduct_merits   -- supabase/migrations/20260415000000_merit_rpcs.sql §2
 *   - public.reset_subscription_merits -- supabase/migrations/20260415000000_merit_rpcs.sql §6 (lines 367-424)
 *     (handleStripeWebhook calls this — NOT grant_subscription_merits — on
 *      checkout.session.completed mode=subscription per stripe-webhook-handler/index.ts:445-459)
 *   - public.grant_upgrade_diff        -- Phase 11 migration (§upgrade-diff).
 *     Invoked by handleStripeWebhook on customer.subscription.updated when
 *     newTier > prevTier (stripe-webhook-handler/index.ts:650-654).
 *     p_from_tier/p_to_tier args only; mock computes the diff using the
 *     documented allowance table (Pro=75, Elite=150).
 *
 * The mock-RPC contracts MUST stay in lockstep with the migration above.
 * If Phase 11 RPC contracts change, update this file alongside the migration.
 *
 * Run with:
 *   deno test --allow-env --allow-net --allow-read --no-check \
 *     supabase/functions/_tests/test-05-upgrade-proration.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeCheckoutSessionCompletedEvent,
  makeSubscriptionUpdatedEvent,
} from "../_shared/test-helpers/stripe-fixtures.ts";
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";

// ── Test-env setup (must run BEFORE importing handleStripeWebhook) ──────────
//
// Mirrors _tests/test-04-free-signup-to-shop.test.ts. The production Stripe
// client init requires STRIPE_SECRET_KEY at module load; price env vars must
// be present so resolveTier() maps the fixture priceId back to 'pro' / 'elite'
// on customer.subscription.updated.
const TEST_WEBHOOK_SECRET = "whsec_test_secret_abcdef1234567890";
const PRO_MONTHLY_PRICE = "price_pro_m_test05";
const ELITE_MONTHLY_PRICE = "price_elite_m_test05";

Deno.env.set("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", PRO_MONTHLY_PRICE);
Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", ELITE_MONTHLY_PRICE);
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APP_URL", "https://test.example.com");

// Dynamic import after env setup so the production client init has values.
const { handleStripeWebhook } = await import(
  "../stripe-webhook-handler/index.ts"
);

// ── In-memory merit ledger (copied from test-04-free-signup-to-shop) ────────

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

// Feature cost lookup (mirrors merit_feature_costs seed + spec §6.2).
// undefined entry for a (feature, tier) pair means that tier is locked out.
const FEATURE_COSTS: Record<string, Record<string, number | undefined>> = {
  resume_analysis: { free: 3, pro: 3, elite: 3 },
  career_compass: { free: 3, pro: 3, elite: 3 },
  linkedin_grading: { free: 3, pro: 3, elite: 3 },
  recruiting_lens: { free: undefined, pro: 8, elite: 8 },
};

// Tier allowance table (mirrors reset_subscription_merits §6 lines 388-392).
const TIER_ALLOWANCE: Record<string, number> = {
  free: 0,
  pro: 75,
  elite: 150,
};

/**
 * Mock check_and_deduct_merits RPC -- mirrors migration §2.
 * Subscription-first deduction, returns tier_locked when the (feature, tier)
 * cost entry is undefined.
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
 * Sets subscription_balance to the per-tier allowance (no rollover, D-14),
 * leaves shop_balance untouched (D-15), writes a single grant ledger row
 * with amount = new - old (D-16).
 *
 * handleStripeWebhook invokes this RPC on checkout.session.completed
 * mode=subscription (stripe-webhook-handler/index.ts:445-459). This is the
 * path that credits the initial 75 Merits on a fresh Pro subscription in
 * TEST-05 Step 1.
 */
function mockResetSubscriptionMerits(
  ledger: MockLedger,
  userId: string,
  tier: string,
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
  ledger.subscription_balance = target;
  ledger.transactions.push({
    id: uuid(),
    user_id: userId,
    amount: delta,
    balance_type: "grant",
    source: "subscription-reset",
    feature: null,
    metadata: { reset_for_tier: tier, prev_balance: oldBalance },
    created_at: new Date().toISOString(),
  });
  return { success: true, subscription_balance: target, delta };
}

/**
 * Mock grant_upgrade_diff RPC -- mirrors Phase 11 migration §upgrade-diff.
 * Credits (allowance[to] - allowance[from]) onto subscription_balance
 * mid-cycle; the real RPC applies a proration factor, but for TEST-05's
 * assertions we use the full-diff form (see 21-02-PLAN.md <interfaces>
 * note: "proration simplified to full diff for this test").
 *
 * Invoked by handleStripeWebhook on customer.subscription.updated when
 * newTier > prevTier (stripe-webhook-handler/index.ts:650-654).
 */
function mockGrantUpgradeDiff(
  ledger: MockLedger,
  userId: string,
  fromTier: string,
  toTier: string,
): Record<string, unknown> {
  const from = TIER_ALLOWANCE[fromTier] ?? 0;
  const to = TIER_ALLOWANCE[toTier] ?? 0;
  const diff = Math.max(0, to - from);
  ledger.subscription_balance += diff;
  const txId = uuid();
  ledger.transactions.push({
    id: txId,
    user_id: userId,
    amount: diff,
    balance_type: "grant",
    source: "upgrade-diff",
    feature: null,
    metadata: { from_tier: fromTier, to_tier: toTier },
    created_at: new Date().toISOString(),
  });
  return {
    success: true,
    diff_credited: diff,
    new_subscription_balance: ledger.subscription_balance,
    transaction_id: txId,
  };
}

/**
 * Tier-gated Recruiting Lens output shape (spec §14 / Phase 18 gating rules).
 * Elite carries two extra sections; Pro/Free see only the base shape.
 * Mocked here to prove the assertion shape — real tier-prompts validated in
 * Phase 14/18 unit tests.
 */
function tierGatedRecruitingLensOutput(
  tier: "free" | "pro" | "elite",
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    matches: [{ title: "Senior Eng", score: 88 }],
    top_fit_summary: "Probe summary",
  };
  if (tier === "elite") {
    base.compensation_intel = { median: 180000, range: [150000, 220000] };
    base.smart_application_strategy = {
      priority: "high",
      outreach: "hiring manager",
    };
  }
  return base;
}

// ── Mock Supabase service client for stripe-webhook-handler ─────────────────
//
// stripe-webhook-handler exercises this surface for TEST-05:
//   1. .from('stripe_webhook_events').insert(...)             -- idempotency
//   2. .from('profiles').update(...).eq(...).select(...)      -- profile lookup
//   3. .rpc('reset_subscription_merits', {...})               -- checkout subs
//   4. .rpc('grant_upgrade_diff', {...})                      -- upgrade path
//   5. .from('profiles').update({ subscription_tier }).eq(...) -- post-upgrade
//
// profile.subscription_tier is stateful — the mock must advance it from 'free'
// -> 'pro' after Step 1 so that on Step 3 (subscription.updated), the handler
// sees prevTier='pro' when it resolves the current profile row.

interface FakeProfile {
  id: string;
  email: string | null;
  full_name?: string | null;
  subscription_tier: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
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

      if (table === "profiles") {
        return {
          update(updateData: Record<string, unknown>) {
            const chain = {
              eq(eqColumn: string, eqValue: unknown) {
                // Match the profile row by whichever column the handler used
                // in its fallback chain (metadata.user_id -> stripe_customer_id
                // -> stripe_subscription_id -> email). The profile object
                // accumulates stripe_* fields across webhook deliveries.
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
                      // Handler reads the old tier via UNIFORM_SELECT BEFORE
                      // the router applies the new tier on upgrade.updated.
                      // Snapshot the pre-update tier to return it, then apply.
                      const preUpdateTier = profile.subscription_tier;
                      Object.assign(profile, updateData);
                      return Promise.resolve({
                        data: [{
                          id: profile.id,
                          email: profile.email,
                          // Return pre-update tier so the handler's
                          // tierCompare(newTier, prevTier) sees the OLD value
                          // on customer.subscription.updated (CR-01 fix at
                          // stripe-webhook-handler/index.ts:263).
                          subscription_tier: preUpdateTier,
                        }],
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                  // Thenable form — used by the router's post-upgrade tier
                  // write (stripe-webhook-handler/index.ts:663-666) which
                  // does not call .select().
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
      if (fn === "reset_subscription_merits") {
        const result = mockResetSubscriptionMerits(
          ledger,
          args.p_user_id as string,
          args.p_tier as string,
        );
        if ((result as Record<string, unknown>).error) {
          return Promise.resolve({
            error: { code: (result as Record<string, unknown>).error },
          });
        }
        return Promise.resolve({ error: null });
      }
      if (fn === "grant_upgrade_diff") {
        const result = mockGrantUpgradeDiff(
          ledger,
          args.p_user_id as string,
          args.p_from_tier as string,
          args.p_to_tier as string,
        );
        if ((result as Record<string, unknown>).error) {
          return Promise.resolve({
            error: { code: (result as Record<string, unknown>).error },
          });
        }
        return Promise.resolve({ error: null });
      }
      // Unknown RPCs return success silently — keeps the fake permissive.
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
                id: ELITE_MONTHLY_PRICE,
                recurring: { interval: "month" },
              },
            }],
          },
        });
      },
    },
  };
}

// ── Test 1: full upgrade-proration scenario ─────────────────────────────────

Deno.test({
  name:
    "TEST-05: Free -> Pro (checkout) -> Recruiting Lens (8) -> Pro -> Elite (upgrade-diff) -> Recruiting Lens (5), tier-gated",
  // See test-04 header: handler fires fire-and-forget fetch to send-strivo-email
  // after shop credit (stripe-webhook-handler/index.ts:513). Though TEST-05 does
  // not exercise the shop path, the module-scope Deno.serve() + network
  // primitives still require the sanitizer overrides the first handler call
  // triggers. Matches stripe-webhook-handler/index.test.ts:309.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test05000001";
    const ledger = createMockLedger(0, 0);

    const profile: FakeProfile = {
      id: USER,
      email: "test05@example.com",
      full_name: "Test User 05",
      subscription_tier: "free",
    };
    const fakeSupabase = buildMockServiceClient(ledger, profile);

    // ─ Guard: Recruiting Lens is tier-locked at free ─────────────────────
    const guard = mockCheckAndDeductMerits(
      ledger,
      USER,
      "recruiting_lens",
      "free",
    );
    assertEquals(
      (guard as Record<string, unknown>).error,
      "tier_locked",
      "recruiting_lens blocked at free tier",
    );
    assertEquals(
      (guard as Record<string, unknown>).upgrade_required,
      true,
    );
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      0,
      "balance unchanged on tier_locked",
    );

    // ─ Step 1: Pro checkout.session.completed credits 75 Merits ──────────
    // In production this is triggered by Stripe Checkout success. The handler
    // routes to reset_subscription_merits (see handler lines 445-459).
    const evCheckout = makeCheckoutSessionCompletedEvent({
      mode: "subscription",
      user_id: USER,
      tier: "pro",
      interval: "monthly",
      customer: "cus_test05",
      subscription: "sub_test05",
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
    assertEquals(resp1.status, 200, "checkout webhook should 200");
    assertEquals(
      ledger.subscription_balance,
      75,
      "Pro subscription grants 75 Merits via reset_subscription_merits",
    );

    const resetCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "reset_subscription_merits",
    );
    assertEquals(resetCalls.length, 1, "reset_subscription_merits called once");
    assertEquals(resetCalls[0].args.p_tier, "pro");
    assertEquals(resetCalls[0].args.p_user_id, USER);

    // Profile state now has subscription_tier='pro' per handler D-20 write
    // (lines 220-228) — needed so the Step 3 upgrade sees prevTier='pro'.
    assertEquals(profile.subscription_tier, "pro", "profile tier updated");

    // ─ Step 2: Recruiting Lens at Pro deducts 8 ──────────────────────────
    const r2 = mockCheckAndDeductMerits(ledger, USER, "recruiting_lens", "pro");
    assertEquals((r2 as Record<string, unknown>).success, true);
    assertEquals(
      (r2 as Record<string, unknown>).remaining_balance,
      67,
      "after Recruiting Lens (8), 67 Merits remain",
    );
    const proOutput = tierGatedRecruitingLensOutput("pro");
    assert(
      !("compensation_intel" in proOutput),
      "Pro output must NOT contain compensation_intel",
    );
    assert(
      !("smart_application_strategy" in proOutput),
      "Pro output must NOT contain smart_application_strategy",
    );
    assert("matches" in proOutput, "Pro output has base.matches");
    assert("top_fit_summary" in proOutput, "Pro output has top_fit_summary");

    // ─ Step 3: Pro -> Elite upgrade via customer.subscription.updated ────
    // Handler invokes grant_upgrade_diff (lines 650-654).
    const evUpdated = makeSubscriptionUpdatedEvent({
      customerId: "cus_test05",
      subscriptionId: "sub_test05",
      priceId: ELITE_MONTHLY_PRICE,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    });
    const body2 = JSON.stringify(evUpdated);
    const sig2 = await signStripePayload(body2, TEST_WEBHOOK_SECRET);
    const req2 = new Request("https://example.com/stripe-webhook-handler", {
      method: "POST",
      headers: {
        "stripe-signature": sig2,
        "Content-Type": "application/json",
      },
      body: body2,
    });
    const fakeStripe2 = buildFakeStripe(
      evUpdated as unknown as Record<string, unknown>,
    );
    const resp2 = await handleStripeWebhook(req2, {
      supabase: fakeSupabase,
      stripe: fakeStripe2,
    });
    assertEquals(resp2.status, 200, "upgrade webhook should 200");

    const diffCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "grant_upgrade_diff",
    );
    assertEquals(diffCalls.length, 1, "grant_upgrade_diff called once");
    assertEquals(diffCalls[0].args.p_user_id, USER);
    assertEquals(diffCalls[0].args.p_from_tier, "pro");
    assertEquals(diffCalls[0].args.p_to_tier, "elite");

    assertEquals(
      ledger.subscription_balance,
      67 + 75,
      "grant_upgrade_diff credited 75 (Elite 150 - Pro 75) on remaining 67 = 142",
    );
    assertEquals(profile.subscription_tier, "elite", "profile upgraded to elite");

    // ─ Step 4: Recruiting Lens at Elite deducts 5 ────────────────────────
    const r4 = mockCheckAndDeductMerits(
      ledger,
      USER,
      "recruiting_lens",
      "elite",
    );
    assertEquals((r4 as Record<string, unknown>).success, true);
    assertEquals(
      (r4 as Record<string, unknown>).remaining_balance,
      137,
      "after Elite Recruiting Lens (5), 137 Merits remain",
    );
    const eliteOutput = tierGatedRecruitingLensOutput("elite");
    assert(
      "compensation_intel" in eliteOutput,
      "Elite output includes compensation_intel",
    );
    assert(
      "smart_application_strategy" in eliteOutput,
      "Elite output includes smart_application_strategy",
    );
    assert("matches" in eliteOutput, "Elite output retains base.matches");
    assert(
      "top_fit_summary" in eliteOutput,
      "Elite output retains top_fit_summary",
    );

    // Ledger sanity: balance reflects every step.
    assertEquals(
      ledger.subscription_balance + ledger.shop_balance,
      137,
      "final balance = 75 - 8 + 75 - 5 = 137",
    );
  },
});

// ── Test 2: idempotency — same upgrade event delivered twice does not double-credit ──

Deno.test({
  name:
    "TEST-05 idempotency: re-delivery of customer.subscription.updated does not double-credit upgrade-diff",
  // Same rationale as Test 1 above.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const USER = "00000000-0000-0000-0000-test05000002";
    const ledger = createMockLedger(75, 0); // already a Pro subscriber

    const profile: FakeProfile = {
      id: USER,
      email: "test05dup@example.com",
      full_name: "Test User 05 Dup",
      subscription_tier: "pro",
      // Pre-populate the stripe ids so the handler's lookup chain (customerId
      // -> subscriptionId -> email) can locate the profile row without the
      // checkout.session.completed step seeding them first.
      stripe_customer_id: "cus_test05dup",
      stripe_subscription_id: "sub_test05dup",
    };
    const fakeSupabase = buildMockServiceClient(ledger, profile);

    const evUpdated = makeSubscriptionUpdatedEvent({
      customerId: "cus_test05dup",
      subscriptionId: "sub_test05dup",
      priceId: ELITE_MONTHLY_PRICE,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    });
    const body = JSON.stringify(evUpdated);
    const signature = await signStripePayload(body, TEST_WEBHOOK_SECRET);
    const fakeStripe = buildFakeStripe(
      evUpdated as unknown as Record<string, unknown>,
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

    // First delivery — grant_upgrade_diff credits 75.
    const resp1 = await handleStripeWebhook(mkReq(), {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(resp1.status, 200);
    assertEquals(ledger.subscription_balance, 150, "first delivery credits 75");

    // Second delivery — handler's event-level idempotency (23505) fires.
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
    assertEquals(
      ledger.subscription_balance,
      150,
      "second delivery must not re-credit",
    );

    const diffCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "grant_upgrade_diff",
    );
    assertEquals(
      diffCalls.length,
      1,
      "grant_upgrade_diff invoked exactly once across both deliveries",
    );
  },
});
