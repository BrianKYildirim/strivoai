/**
 * Deno tests for stripe-webhook-handler/index.ts — Phase 12 Plan 09.
 *
 * 15 behavioral tests exercising handleStripeWebhook via deps-injected
 * fake supabase and fake stripe objects. Replaces all Plan 01 placeholder
 * `assertEquals(1,1)` bodies with real assertions.
 *
 * Covers: signature verification, unknown event handling, idempotency
 * (TEST-08), checkout subscription/shop, invoice monthly/yearly, subscription
 * CRUD, upgrade/downgrade, graceful cancel, payment failure, profile-not-found.
 *
 * Run with:
 *   deno test --allow-env --allow-read --allow-net --no-check \
 *     supabase/functions/stripe-webhook-handler/index.test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeCheckoutSessionCompletedEvent,
  makeInvoicePaymentFailedEvent,
  makeInvoicePaymentSucceededEvent,
  makePaymentIntentSucceededEvent,
  makeSubscriptionCreatedEvent,
  makeSubscriptionDeletedEvent,
  makeSubscriptionUpdatedEvent,
} from "../_shared/test-helpers/stripe-fixtures.ts";
// signStripePayload imported to satisfy lint for future reference usage
import { signStripePayload } from "../_shared/test-helpers/stripe-signature.ts";
void signStripePayload;

// ── Test-env harness ────────────────────────────────────────────────────────

const TEST_SECRET = "whsec_test_secret_abcdef1234567890";
const TEST_STRIPE_KEY = "sk_test_dummy_1234567890";
const PRO_MONTHLY = "price_pro_m_test";
const PRO_ANNUAL = "price_pro_a_test";
const ELITE_MONTHLY = "price_elite_m_test";
const ELITE_ANNUAL = "price_elite_a_test";
const MERIT_PACK_3 = "price_merit_3_test";
const MERIT_PACK_10 = "price_merit_10_test";
const MERIT_PACK_25 = "price_merit_25_test";
const MERIT_PACK_50 = "price_merit_50_test";

function setTestEnv(): void {
  Deno.env.set("STRIPE_WEBHOOK_SECRET", TEST_SECRET);
  Deno.env.set("STRIPE_SECRET_KEY", TEST_STRIPE_KEY);
  Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", PRO_MONTHLY);
  Deno.env.set("STRIPE_PRICE_PRO_ANNUAL", PRO_ANNUAL);
  Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", ELITE_MONTHLY);
  Deno.env.set("STRIPE_PRICE_ELITE_ANNUAL", ELITE_ANNUAL);
  Deno.env.set("STRIPE_PRICE_MERIT_3", MERIT_PACK_3);
  Deno.env.set("STRIPE_PRICE_MERIT_10", MERIT_PACK_10);
  Deno.env.set("STRIPE_PRICE_MERIT_25", MERIT_PACK_25);
  Deno.env.set("STRIPE_PRICE_MERIT_50", MERIT_PACK_50);
}

function clearEnv(): void {
  for (
    const k of [
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "STRIPE_PRICE_ELITE_MONTHLY",
      "STRIPE_PRICE_ELITE_ANNUAL",
      "STRIPE_PRICE_MERIT_3",
      "STRIPE_PRICE_MERIT_10",
      "STRIPE_PRICE_MERIT_25",
      "STRIPE_PRICE_MERIT_50",
    ]
  ) Deno.env.delete(k);
}

// ── Fake Supabase ───────────────────────────────────────────────────────────

interface FakeProfile {
  id: string;
  email: string | null;
  subscription_tier: string | null;
  pending_downgrade_tier?: string | null;
}

interface FakeSupabaseOpts {
  /** Event IDs that have already been seen — insert will return 23505. */
  seenEventIds?: string[];
  /** Profile row to return from lookup. null = not found. */
  profile?: FakeProfile | null;
  /** If true, profile update queries return a DB error. */
  profileDbError?: boolean;
  /** If true, event insert returns a non-23505 error. */
  insertError?: boolean;
  /** If true, stripe_webhook_events delete returns an error. */
  deleteError?: boolean;
  /** Map of RPC name -> error to return (others succeed). */
  rpcErrors?: Record<string, { code: string }>;
  /** Map of RPC name -> data payload to return (overrides null default). */
  rpcData?: Record<string, unknown>;
}

interface FakeRpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface FakeInsertCall {
  table: string;
  data: Record<string, unknown>;
}

interface FakeUpdateCall {
  table: string;
  updateData: Record<string, unknown>;
  eqColumn: string;
  eqValue: unknown;
  hasSelect: boolean;
}

function createFakeSupabase(opts: FakeSupabaseOpts = {}) {
  const seenEventIds: string[] = [...(opts.seenEventIds ?? [])];
  const profile = opts.profile ?? null;
  const rpcCalls: FakeRpcCall[] = [];
  const insertCalls: FakeInsertCall[] = [];
  const updateCalls: FakeUpdateCall[] = [];

  return {
    seenEventIds,
    rpcCalls,
    insertCalls,
    updateCalls,

    from(table: string) {
      if (table === "stripe_webhook_events") {
        return {
          insert(data: Record<string, unknown>) {
            insertCalls.push({ table, data });
            const eventId = data.event_id as string;
            if (seenEventIds.includes(eventId)) {
              return Promise.resolve({ error: { code: "23505" } });
            }
            if (opts.insertError) {
              return Promise.resolve({ error: { code: "INTERNAL" } });
            }
            seenEventIds.push(eventId);
            return Promise.resolve({ error: null });
          },
          delete() {
            return {
              eq(_col: string, val: unknown) {
                const idx = seenEventIds.indexOf(val as string);
                if (idx >= 0) seenEventIds.splice(idx, 1);
                if (opts.deleteError) {
                  return Promise.resolve({ error: { code: "DELETE_FAILED" } });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "profiles") {
        // Return a chainable builder for .update(data).eq(col, val).select(cols)
        // and also .update(data).eq(col, val) without .select()
        return {
          update(updateData: Record<string, unknown>) {
            const call: FakeUpdateCall = {
              table,
              updateData: { ...updateData },
              eqColumn: "",
              eqValue: null,
              hasSelect: false,
            };

            const chain = {
              eq(col: string, val: unknown) {
                call.eqColumn = col;
                call.eqValue = val;
                return {
                  select(_cols: string) {
                    call.hasSelect = true;
                    updateCalls.push(call);
                    if (opts.profileDbError) {
                      return Promise.resolve({
                        data: null,
                        error: { code: "PGRST301" },
                      });
                    }
                    if (profile) {
                      return Promise.resolve({
                        data: [profile],
                        error: null,
                      });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                  // When used without .select() — returns a thenable that
                  // resolves the update directly
                  then(
                    resolve: (v: unknown) => unknown,
                    reject?: (e: unknown) => unknown,
                  ) {
                    updateCalls.push(call);
                    return Promise.resolve({
                      data: profile ? [profile] : [],
                      error: null,
                    }).then(resolve, reject);
                  },
                };
              },
            };
            return chain;
          },
        };
      }

      // Fallback for unknown tables
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
      const err = opts.rpcErrors?.[fn];
      if (err) return Promise.resolve({ error: err, data: null });
      const data = opts.rpcData?.[fn] ?? null;
      return Promise.resolve({ error: null, data });
    },
  };
}

// ── Fake Stripe ─────────────────────────────────────────────────────────────

interface FakeStripeOpts {
  /** If true, constructEventAsync throws (simulating bad signature). */
  rejectSignature?: boolean;
  /** Subscription object returned by subscriptions.retrieve(). */
  subscription?: {
    items: {
      data: Array<{
        price: { id: string; recurring?: { interval: string } };
        plan?: { interval: string };
      }>;
    };
  };
}

function createFakeStripe(opts: FakeStripeOpts = {}) {
  return {
    webhooks: {
      constructEventAsync(
        rawBody: string,
        _signature: string,
        _secret: string,
        _tolerance?: unknown,
        _cryptoProvider?: unknown,
      ) {
        if (opts.rejectSignature) {
          throw new Error(
            "No signatures found matching the expected signature",
          );
        }
        return Promise.resolve(JSON.parse(rawBody));
      },
    },
    subscriptions: {
      retrieve(_subId: string) {
        if (opts.subscription) {
          return Promise.resolve(opts.subscription);
        }
        return Promise.resolve({
          items: {
            data: [
              {
                price: {
                  id: PRO_MONTHLY,
                  recurring: { interval: "month" },
                },
              },
            ],
          },
        });
      },
    },
  };
}

// ── Request builder ─────────────────────────────────────────────────────────

function buildWebhookRequest(
  event: Record<string, unknown>,
  opts?: { omitSignature?: boolean },
): Request {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!opts?.omitSignature) {
    headers["stripe-signature"] = "t=1234567890,v1=fakesig";
  }
  return new Request("https://test/stripe-webhook-handler", {
    method: "POST",
    headers,
    body,
  });
}

// ── 15 behavioral tests ─────────────────────────────────────────────────────

// The first import triggers Deno.serve() at module scope, creating a background
// HTTP listener that cannot be closed within a test. Disable resource/ops
// sanitizers on the first test only to accommodate this.
Deno.test({
  name: "missing-signature-401",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setTestEnv();
    try {
      const { handleStripeWebhook } = await import("./index.ts");
      const fakeSupabase = createFakeSupabase();
      const fakeStripe = createFakeStripe();

      const req = buildWebhookRequest(
        { id: "evt_no_sig", type: "checkout.session.completed" },
        { omitSignature: true },
      );

      const res = await handleStripeWebhook(req, {
        supabase: fakeSupabase,
        stripe: fakeStripe,
      });

      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "invalid_signature");
      // No DB writes should occur when signature is missing
      assertEquals(fakeSupabase.insertCalls.length, 0);
    } finally {
      clearEnv();
    }
  },
});

Deno.test("bad-signature-400", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");
    const fakeSupabase = createFakeSupabase();
    const fakeStripe = createFakeStripe({ rejectSignature: true });

    const req = buildWebhookRequest({
      id: "evt_bad_sig",
      type: "checkout.session.completed",
    });

    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_signature");
  } finally {
    clearEnv();
  }
});

Deno.test("unknown-event-type-200-ignored", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");
    const fakeSupabase = createFakeSupabase();
    const fakeStripe = createFakeStripe();

    const event = {
      id: "evt_unknown_1",
      type: "customer.source.created",
      data: { object: {} },
    };
    const req = buildWebhookRequest(event);

    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.received, true);
    assertEquals(body.ignored, true);
    // Ignored events skip idempotency insert
    assertEquals(fakeSupabase.insertCalls.length, 0);
  } finally {
    clearEnv();
  }
});

// ── TEST-08: load-bearing idempotency guarantee ─────────────────────────────
Deno.test("test-08-duplicate-event-no-double-credit", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeCheckoutSessionCompletedEvent({
      mode: "subscription",
      user_id: "user-dup-test",
      tier: "pro",
    });

    const fakeSupabase = createFakeSupabase({
      seenEventIds: [],
      profile: {
        id: "user-dup-test",
        email: "dup@test.com",
        subscription_tier: "free",
      },
    });
    const fakeStripe = createFakeStripe();

    // FIRST call — should succeed and call reset_subscription_merits once
    const req1 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res1 = await handleStripeWebhook(req1, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res1.status, 200);
    const body1 = await res1.json();
    assertEquals(body1.received, true);
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");

    // seenEventIds now contains the event id (added by first insert success)
    // SECOND call with same event — should return duplicate
    const req2 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res2 = await handleStripeWebhook(req2, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res2.status, 200);
    const body2 = await res2.json();
    assertEquals(body2.received, true);
    assertEquals(body2.duplicate, true);
    // RPC should STILL have only 1 call — no second RPC on duplicate
    assertEquals(fakeSupabase.rpcCalls.length, 1);
  } finally {
    clearEnv();
  }
});

Deno.test("checkout-completed-subscription", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeCheckoutSessionCompletedEvent({
      mode: "subscription",
      user_id: "user-sub-1",
      tier: "pro",
      customer: "cus_test_1",
      subscription: "sub_test_1",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-sub-1",
        email: "sub@test.com",
        subscription_tier: "free",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Should have called reset_subscription_merits RPC
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-sub-1");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "pro");
    assertExists(fakeSupabase.rpcCalls[0].args.p_next_reset_date);

    // Should have profile update with subscription_tier and subscription_status
    const profileUpdate = fakeSupabase.updateCalls.find(
      (c) => c.hasSelect && c.updateData.subscription_tier === "pro",
    );
    assertExists(profileUpdate);
    assertEquals(profileUpdate.updateData.subscription_status, "active");
  } finally {
    clearEnv();
  }
});

Deno.test("checkout-completed-shop-credit", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      user_id: "user-shop-1",
      pack_size: 25,
      payment_intent: "pi_test_shop_1",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-shop-1",
        email: "shop@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Should have called credit_shop_merits RPC
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "credit_shop_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-shop-1");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_pack_size, 25);
    assertEquals(
      fakeSupabase.rpcCalls[0].args.p_stripe_payment_id,
      "pi_test_shop_1",
    );
  } finally {
    clearEnv();
  }
});

Deno.test("MER-10 axis-3: same checkout session/PI replay (payment mode) — credit_shop_merits called exactly once", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeCheckoutSessionCompletedEvent({
      mode: "payment",
      user_id: "user-shop-dup",
      pack_size: 10,
      payment_intent: "pi_test_shop_dup",
    });

    const fakeSupabase = createFakeSupabase({
      seenEventIds: [],
      profile: {
        id: "user-shop-dup",
        email: "shopdup@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    // FIRST call — should succeed and call credit_shop_merits once
    const req1 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res1 = await handleStripeWebhook(req1, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res1.status, 200);
    const shopCallsAfter1 = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCallsAfter1.length, 1);
    assertEquals(shopCallsAfter1[0].fn, "credit_shop_merits");

    // SECOND call with same checkout session / PI — same event_id replays, so the
    // stripe_webhook_events insert-first 23505 short-circuit returns duplicate before
    // the checkout path can re-credit. credit_shop_merits stays at exactly one call.
    const req2 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res2 = await handleStripeWebhook(req2, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res2.status, 200);
    const body2 = await res2.json();
    assertEquals(body2.duplicate, true);
    // No additional crediting RPC — still exactly ONE credit_shop_merits call total
    const shopCallsAfter2 = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCallsAfter2.length, 1);
  } finally {
    clearEnv();
  }
});

Deno.test("invoice-paid-monthly", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeInvoicePaymentSucceededEvent({
      subscription: "sub_monthly_1",
      customer: "cus_monthly_1",
      interval: "month",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-monthly-1",
        email: "monthly@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe({
      subscription: {
        items: {
          data: [
            {
              price: {
                id: PRO_MONTHLY,
                recurring: { interval: "month" },
              },
            },
          ],
        },
      },
    });

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Should have called reset_subscription_merits
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "pro");
  } finally {
    clearEnv();
  }
});

Deno.test("invoice-paid-yearly-noop", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeInvoicePaymentSucceededEvent({
      subscription: "sub_yearly_1",
      customer: "cus_yearly_1",
      interval: "year",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-yearly-1",
        email: "yearly@test.com",
        subscription_tier: "elite",
      },
    });
    const fakeStripe = createFakeStripe({
      subscription: {
        items: {
          data: [
            {
              price: {
                id: ELITE_ANNUAL,
                recurring: { interval: "year" },
              },
            },
          ],
        },
      },
    });

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.noop, "yearly-handled-by-cron");
    // No reset RPC for yearly subscriptions
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-created-pro-grants-75", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionCreatedEvent({
      customerId: "cus_sc_1",
      subscriptionId: "sub_sc_1",
      priceId: PRO_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-sc-1",
        email: "sc@test.com",
        subscription_tier: null,
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Profile update should contain tier, customer id, subscription id
    const profileUpdate = fakeSupabase.updateCalls.find(
      (c) =>
        c.hasSelect &&
        c.updateData.subscription_tier === "pro",
    );
    assertExists(profileUpdate);
    assertEquals(profileUpdate.updateData.stripe_customer_id, "cus_sc_1");
    assertEquals(profileUpdate.updateData.stripe_subscription_id, "sub_sc_1");
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-updated-upgrade-pro-to-elite", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionUpdatedEvent({
      customerId: "cus_up_1",
      subscriptionId: "sub_up_1",
      priceId: ELITE_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-up-1",
        email: "up@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Should have called grant_upgrade_diff RPC
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "grant_upgrade_diff");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-up-1");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_from_tier, "pro");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_to_tier, "elite");

    // Should have a second update that writes subscription_tier = "elite"
    const tierWriteUpdate = fakeSupabase.updateCalls.find(
      (c) =>
        !c.hasSelect &&
        c.updateData.subscription_tier === "elite",
    );
    assertExists(tierWriteUpdate);
    assertEquals(tierWriteUpdate.updateData.pending_downgrade_tier, null);
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-updated-same-tier-renewal-clears-pending-without-merits", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionUpdatedEvent({
      customerId: "cus_renew_1",
      subscriptionId: "sub_renew_1",
      priceId: ELITE_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });
    (event.data.object as Record<string, unknown>).cancel_at_period_end = false;

    const fakeSupabase = createFakeSupabase({
      seenEventIds: [],
      profile: {
        id: "user-renew-1",
        email: "renew@test.com",
        subscription_tier: "elite",
        pending_downgrade_tier: "free",
      },
    });
    const fakeStripe = createFakeStripe();

    const firstResponse = await handleStripeWebhook(
      buildWebhookRequest(event as unknown as Record<string, unknown>),
      { supabase: fakeSupabase, stripe: fakeStripe },
    );

    assertEquals(firstResponse.status, 200);
    const renewalUpdate = fakeSupabase.updateCalls.find(
      (call) =>
        !call.hasSelect &&
        call.updateData.subscription_tier === "elite" &&
        call.updateData.pending_downgrade_tier === null,
    );
    assertExists(renewalUpdate);
    assertEquals(fakeSupabase.rpcCalls.length, 0);

    const updateCount = fakeSupabase.updateCalls.length;
    const duplicateResponse = await handleStripeWebhook(
      buildWebhookRequest(event as unknown as Record<string, unknown>),
      { supabase: fakeSupabase, stripe: fakeStripe },
    );
    assertEquals(duplicateResponse.status, 200);
    assertEquals((await duplicateResponse.json()).duplicate, true);
    assertEquals(fakeSupabase.updateCalls.length, updateCount);
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-updated-cancel-at-period-end-keeps-tier-and-schedules-free", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionUpdatedEvent({
      customerId: "cus_cancel_1",
      subscriptionId: "sub_cancel_1",
      priceId: ELITE_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });
    (event.data.object as Record<string, unknown>).cancel_at_period_end = true;

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-cancel-1",
        email: "cancel@test.com",
        subscription_tier: "elite",
      },
    });
    const fakeStripe = createFakeStripe();

    const response = await handleStripeWebhook(
      buildWebhookRequest(event as unknown as Record<string, unknown>),
      { supabase: fakeSupabase, stripe: fakeStripe },
    );

    assertEquals(response.status, 200);
    const scheduledUpdate = fakeSupabase.updateCalls.find(
      (call) =>
        !call.hasSelect &&
        call.updateData.pending_downgrade_tier === "free",
    );
    assertExists(scheduledUpdate);
    assertEquals(scheduledUpdate.updateData.subscription_tier, undefined);
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-updated-downgrade-pending", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionUpdatedEvent({
      customerId: "cus_dn_1",
      subscriptionId: "sub_dn_1",
      priceId: PRO_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-dn-1",
        email: "dn@test.com",
        subscription_tier: "elite",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // No upgrade diff RPC for downgrades
    assertEquals(fakeSupabase.rpcCalls.length, 0);

    // Should have update that sets pending_downgrade_tier
    const downgradeUpdate = fakeSupabase.updateCalls.find(
      (c) =>
        !c.hasSelect &&
        c.updateData.pending_downgrade_tier === "pro",
    );
    assertExists(downgradeUpdate);
  } finally {
    clearEnv();
  }
});

Deno.test("subscription-deleted-graceful-cancel", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionDeletedEvent({
      customerId: "cus_del_1",
      subscriptionId: "sub_del_1",
      priceId: PRO_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-del-1",
        email: "del@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Profile update should contain subscription_status: "canceled" but NOT subscription_tier
    const cancelUpdate = fakeSupabase.updateCalls.find(
      (c) =>
        c.hasSelect &&
        c.updateData.subscription_status === "canceled",
    );
    assertExists(cancelUpdate);
    // Tier should NOT be in updateData — D-14 graceful cancel preserves tier
    assertEquals(cancelUpdate.updateData.subscription_tier, undefined);
  } finally {
    clearEnv();
  }
});

Deno.test("invoice-payment-failed-past-due", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeInvoicePaymentFailedEvent({
      customerId: "cus_fail_1",
      subscriptionId: "sub_fail_1",
      email: "fail@test.com",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-fail-1",
        email: "fail@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);

    // Profile update should contain subscription_status: "past_due"
    const pastDueUpdate = fakeSupabase.updateCalls.find(
      (c) =>
        c.hasSelect &&
        c.updateData.subscription_status === "past_due",
    );
    assertExists(pastDueUpdate);
  } finally {
    clearEnv();
  }
});

Deno.test("profile-not-found-200", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makeSubscriptionCreatedEvent({
      customerId: "cus_ghost_1",
      subscriptionId: "sub_ghost_1",
      priceId: PRO_MONTHLY,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 2592000,
    });

    // No profile — all lookups return empty
    const fakeSupabase = createFakeSupabase({ profile: null });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.received, true);
    assertEquals(body.profileFound, false);
    // No RPCs if no profile
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

// ── Phase 24 TOPUP-02: payment_intent.succeeded branch ──────────────────────

Deno.test("Phase 24 TOPUP-02: payment_intent.succeeded credits topup pack once", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makePaymentIntentSucceededEvent({
      user_id: "user-topup-1",
      pack_id: "pack_25",
      piId: "pi_test_abc",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-topup-1",
        email: "topup@test.com",
        subscription_tier: "pro",
      },
      rpcData: {
        credit_shop_merits: { success: true, shop_balance: 25, pack_id: "pack_25" },
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.received, true);
    assertEquals(body.packId, "pack_25");
    assertEquals(body.duplicate, false);

    // Exactly one RPC call to credit_shop_merits with pack_size=25 + PI id
    const shopCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCalls.length, 1);
    assertEquals(shopCalls[0].args.p_user_id, "user-topup-1");
    assertEquals(shopCalls[0].args.p_pack_size, 25);
    assertEquals(shopCalls[0].args.p_stripe_payment_id, "pi_test_abc");
  } finally {
    clearEnv();
  }
});

Deno.test("MER-10 axis-1: same event_id replay short-circuits — credit_shop_merits called exactly once", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makePaymentIntentSucceededEvent({
      user_id: "user-topup-dup",
      pack_id: "pack_10",
      eventId: "evt_topup_replay",
      piId: "pi_test_replay",
    });

    const fakeSupabase = createFakeSupabase({
      seenEventIds: [],
      profile: {
        id: "user-topup-dup",
        email: "topdup@test.com",
        subscription_tier: "free",
      },
      rpcData: {
        credit_shop_merits: { success: true, shop_balance: 10 },
      },
    });
    const fakeStripe = createFakeStripe();

    // FIRST delivery
    const req1 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res1 = await handleStripeWebhook(req1, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(res1.status, 200);
    const shopCallsAfter1 = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCallsAfter1.length, 1);

    // SECOND delivery with SAME event id — stripe_webhook_events UNIQUE 23505
    const req2 = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res2 = await handleStripeWebhook(req2, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(res2.status, 200);
    const body2 = await res2.json();
    assertEquals(body2.duplicate, true);

    // Still exactly ONE credit_shop_merits call (short-circuited by event dedupe)
    const shopCallsAfter2 = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCallsAfter2.length, 1);
  } finally {
    clearEnv();
  }
});

Deno.test("MER-10 axis-2: same payment_intent_id across two event_ids — second RPC returns duplicate:true, ledger credits once", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event1 = makePaymentIntentSucceededEvent({
      user_id: "user-topup-xpi",
      pack_id: "pack_25",
      eventId: "evt_topup_xpi_1",
      piId: "pi_test_shared",
    });
    const event2 = makePaymentIntentSucceededEvent({
      user_id: "user-topup-xpi",
      pack_id: "pack_25",
      eventId: "evt_topup_xpi_2",
      piId: "pi_test_shared",
    });

    // Fake RPC returns { duplicate: true } since merit_shop_purchases already has this PI
    const fakeSupabase = createFakeSupabase({
      seenEventIds: [],
      profile: {
        id: "user-topup-xpi",
        email: "xpi@test.com",
        subscription_tier: "pro",
      },
      rpcData: {
        credit_shop_merits: { success: true, shop_balance: 25, duplicate: true },
      },
    });
    const fakeStripe = createFakeStripe();

    // First event id
    const req1 = buildWebhookRequest(event1 as unknown as Record<string, unknown>);
    const res1 = await handleStripeWebhook(req1, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(res1.status, 200);

    // Second event id carrying same PI
    const req2 = buildWebhookRequest(event2 as unknown as Record<string, unknown>);
    const res2 = await handleStripeWebhook(req2, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });
    assertEquals(res2.status, 200);
    const body2 = await res2.json();
    assertEquals(body2.duplicate, true);

    // Both events reach the RPC (different event ids bypass webhook_events dedupe),
    // but RPC itself returns duplicate: true on the second via merit_shop_purchases
    // UNIQUE pre-check. In production the ledger ends up with exactly 1 row.
    const shopCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCalls.length, 2);
    // Both RPC calls MUST carry the SAME p_stripe_payment_id — this is the key the
    // credit_shop_merits merit_shop_purchases.stripe_payment_intent_id UNIQUE pre-check
    // dedupes on, so the production merit ledger ends with EXACTLY ONE crediting row
    // even though two distinct event_ids each reached the RPC.
    assertEquals(shopCalls[0].args.p_stripe_payment_id, "pi_test_shared");
    assertEquals(shopCalls[1].args.p_stripe_payment_id, "pi_test_shared");
  } finally {
    clearEnv();
  }
});

Deno.test("Phase 24 TOPUP-02: invalid pack_id returns warning, no RPC", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makePaymentIntentSucceededEvent({
      user_id: "user-topup-bad",
      pack_id: "pack_99", // not in VALID_PACK_IDS
      eventId: "evt_topup_bad",
      piId: "pi_test_bad",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-topup-bad",
        email: "bad@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.warning, "invalid_shop_metadata");

    // No credit_shop_merits RPC invoked — fail-closed
    const shopCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("Phase 24 TOPUP-02: missing metadata.user_id returns 500 profile_not_found_retry, deletes idempotency row", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makePaymentIntentSucceededEvent({
      // NO user_id in metadata
      pack_id: "pack_10",
      eventId: "evt_topup_nouser",
      piId: "pi_test_nouser",
      metadataOverride: { pack_id: "pack_10" },
    });

    // No profile can be matched — profile lookup fallback returns empty.
    const fakeSupabase = createFakeSupabase({ profile: null });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    // CR-01: PI with no profile returns 500 so Stripe retries once the user's
    // profile becomes reachable. The idempotency row is deleted by the outer
    // cleanup so the retry can re-enter the router.
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "profile_not_found_retry");

    // Idempotency row deleted: seenEventIds no longer contains this event id.
    assertEquals(fakeSupabase.seenEventIds.includes("evt_topup_nouser"), false);

    // No credit_shop_merits RPC invoked
    const shopCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("Phase 24 TOPUP-02: PI with no metadata (non-pack) returns fail-closed warning, no RPC", async () => {
  setTestEnv();
  try {
    const { handleStripeWebhook } = await import("./index.ts");

    const event = makePaymentIntentSucceededEvent({
      user_id: "user-topup-bare",
      // No pack_id — metadata is just { user_id } so profile matches but
      // the handler cannot determine which pack to credit.
      eventId: "evt_topup_bare",
      piId: "pi_test_bare",
    });

    const fakeSupabase = createFakeSupabase({
      profile: {
        id: "user-topup-bare",
        email: "bare@test.com",
        subscription_tier: "pro",
      },
    });
    const fakeStripe = createFakeStripe();

    const req = buildWebhookRequest(event as unknown as Record<string, unknown>);
    const res = await handleStripeWebhook(req, {
      supabase: fakeSupabase,
      stripe: fakeStripe,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.warning, "invalid_shop_metadata");

    // No credit_shop_merits RPC invoked — fail-closed on missing pack_id
    const shopCalls = fakeSupabase.rpcCalls.filter(
      (c) => c.fn === "credit_shop_merits",
    );
    assertEquals(shopCalls.length, 0);
  } finally {
    clearEnv();
  }
});
