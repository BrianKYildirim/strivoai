/**
 * Deno tests for create-checkout-session/index.ts — Phase 07 Plan 04 +
 * Phase 12 Plan 04 (BACK-04 / SHOP-12 / SUB-05/SUB-06 back-compat).
 *
 * Run with:
 *   deno test --allow-env --allow-net supabase/functions/create-checkout-session/index.test.ts
 *
 * Tests drive the handler directly (no Deno.serve) and inject fake Supabase,
 * Stripe, requireAuth, and checkRateLimit via the `deps` parameter.
 *
 * Covers STR-01 (lazy customer + checkout session creation), STR-12
 * (server-side priceId resolution, no client-supplied price IDs), and the
 * Phase 12 BACK-04 mode discriminator that adds Merit Shop one-time payment
 * sessions while preserving Phase 07 subscription behavior.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCreateCheckoutSession } from "./index.ts";
import { withCors } from "../_shared/cors.ts";
import type { UserContext } from "../_shared/auth.ts";
import type { RateLimitResult } from "../_shared/rate-limiter.ts";

const PRO_MONTHLY = "price_pro_m_test";
const PRO_ANNUAL = "price_pro_a_test";
const ELITE_MONTHLY = "price_elite_m_test";
const ELITE_ANNUAL = "price_elite_a_test";
const APP_URL = "https://test.strivo.ai";

function setTestEnv(): void {
  Deno.env.set("APP_URL", APP_URL);
  // ALLOWED_ORIGINS drives the post-01-01 origin-reflection CORS contract: an
  // allowlisted request Origin is echoed in Access-Control-Allow-Origin. The
  // ACAO-asserting cases below drive the handler through withCors with an
  // Origin === APP_URL so ACAO === APP_URL (the assertions are unchanged).
  Deno.env.set("ALLOWED_ORIGINS", APP_URL);
  Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", PRO_MONTHLY);
  Deno.env.set("STRIPE_PRICE_PRO_ANNUAL", PRO_ANNUAL);
  Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", ELITE_MONTHLY);
  Deno.env.set("STRIPE_PRICE_ELITE_ANNUAL", ELITE_ANNUAL);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
}

function clearEnv(): void {
  for (
    const k of [
      "APP_URL",
      "ALLOWED_ORIGINS",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "STRIPE_PRICE_ELITE_MONTHLY",
      "STRIPE_PRICE_ELITE_ANNUAL",
      "STRIPE_SECRET_KEY",
    ]
  ) Deno.env.delete(k);
}

// ── Fakes ────────────────────────────────────────────────────────────────────

interface FakeProfile {
  id: string;
  email: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

interface FakeSupabaseOpts {
  profiles?: FakeProfile[];
}

function createFakeSupabase(opts: FakeSupabaseOpts = {}) {
  const profiles: FakeProfile[] = opts.profiles ?? [];
  const state = {
    profiles,
    updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
  };

  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select(_cols: string) {
          return {
            eq(_col: string, value: unknown) {
              return {
                single() {
                  const match = profiles.find((p) => p.id === value) ?? null;
                  return Promise.resolve({
                    data: match,
                    error: match ? null : { code: "PGRST116" },
                  });
                },
              };
            },
          };
        },
        update(data: Record<string, unknown>) {
          return {
            eq(_col: string, value: unknown) {
              state.updates.push({ id: value as string, data });
              const match = profiles.find((p) => p.id === value);
              if (match) Object.assign(match, data);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client, state };
}

interface FakeStripeOpts {
  customerId?: string;
  sessionId?: string;
  sessionUrl?: string;
  // Subscription-swap controls (Phase 33 Plan 02 / PRICE-03).
  retrievedItemId?: string;
  // When set, subscriptions.update throws this error (simulates Stripe failure).
  updateThrows?: unknown;
}

function createFakeStripe(opts: FakeStripeOpts = {}) {
  const state = {
    customersCreated: [] as Array<Record<string, unknown>>,
    sessionsCreated: [] as Array<Record<string, unknown>>,
    subscriptionsRetrieved: [] as string[],
    subscriptionsUpdated: [] as Array<
      { id: string; params: Record<string, unknown> }
    >,
  };

  const stripe = {
    customers: {
      create(params: Record<string, unknown>) {
        state.customersCreated.push(params);
        return Promise.resolve({ id: opts.customerId ?? "cus_new_fake" });
      },
    },
    subscriptions: {
      retrieve(id: string) {
        state.subscriptionsRetrieved.push(id);
        return Promise.resolve({
          id,
          items: {
            data: [{ id: opts.retrievedItemId ?? "si_fake_item_1" }],
          },
        });
      },
      update(id: string, params: Record<string, unknown>) {
        state.subscriptionsUpdated.push({ id, params });
        if (opts.updateThrows !== undefined) {
          return Promise.reject(opts.updateThrows);
        }
        return Promise.resolve({ id });
      },
    },
    checkout: {
      sessions: {
        create(params: Record<string, unknown>) {
          state.sessionsCreated.push(params);
          return Promise.resolve({
            id: opts.sessionId ?? "cs_test_fake_session",
            url: opts.sessionUrl ??
              "https://checkout.stripe.com/c/pay/cs_test_fake",
            // Embedded sessions return a client_secret instead of a redirect URL.
            client_secret: "cs_secret_fake_123",
          });
        },
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { stripe, state };
}

const BASE_CTX: UserContext = {
  userId: "u1",
  email: "a@test.com",
  tier: "free",
};

function makeReq(
  body: unknown,
  opts: { method?: string; bearer?: boolean; origin?: string } = {},
): Request {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.bearer !== false && method === "POST") {
    headers.authorization = "Bearer fake.jwt.token";
  }
  // ACAO-asserting cases pass an allowlisted Origin so withCors reflects it.
  if (opts.origin) headers.Origin = opts.origin;
  return new Request("https://example.test/create-checkout-session", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function unauthorizedThrow(): never {
  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

const OK_RL: RateLimitResult = {
  allowed: true,
  retryAfterSeconds: 0,
  remaining: 10,
};

// ─── STR-12: auth ────────────────────────────────────────────────────────────

Deno.test("STR-12: missing JWT → 401 Unauthorized", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase();
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "pro", interval: "monthly" }, {
      bearer: false,
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => unauthorizedThrow(),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
  } finally {
    clearEnv();
  }
});

// ─── OPTIONS preflight ───────────────────────────────────────────────────────

Deno.test("OPTIONS request → 200 with CORS headers", async () => {
  setTestEnv();
  try {
    const req = new Request("https://example.test/create-checkout-session", {
      method: "OPTIONS",
      headers: { Origin: APP_URL },
    });
    const res = await withCors(req, 'user', () => handleCreateCheckoutSession(req, {
      supabase: createFakeSupabase().client,
      stripe: createFakeStripe().stripe,
      requireAuth: () => Promise.resolve(BASE_CTX),
      checkRateLimit: () => Promise.resolve(OK_RL),
    }));
    assertEquals(res.status, 200);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      APP_URL,
    );
  } finally {
    clearEnv();
  }
});

// ─── Method not allowed ──────────────────────────────────────────────────────

Deno.test("GET request → 405 method_not_allowed", async () => {
  setTestEnv();
  try {
    const req = makeReq(null, { method: "GET" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: createFakeSupabase().client,
      stripe: createFakeStripe().stripe,
      requireAuth: () => Promise.resolve(BASE_CTX),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 405);
    const body = await res.json();
    assertEquals(body.error, "method_not_allowed");
  } finally {
    clearEnv();
  }
});

// ─── STR-12 / D-09: invalid_tier ─────────────────────────────────────────────

Deno.test("STR-12: invalid tier → 400 invalid_tier", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "basic", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(BASE_CTX),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_tier");
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "must not reach Stripe",
    );
  } finally {
    clearEnv();
  }
});

// ─── STR-12 / D-09: invalid_interval ─────────────────────────────────────────

Deno.test("STR-12: invalid interval → 400 invalid_interval", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "pro", interval: "weekly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(BASE_CTX),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_interval");
    assertEquals(fakeStripe.state.sessionsCreated.length, 0);
  } finally {
    clearEnv();
  }
});

// ─── STR-12: price_not_configured ────────────────────────────────────────────

Deno.test("STR-12: unset STRIPE_PRICE_PRO_MONTHLY → 500 price_not_configured", async () => {
  setTestEnv();
  Deno.env.delete("STRIPE_PRICE_PRO_MONTHLY");
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(BASE_CTX),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "price_not_configured");
    assertEquals(fakeStripe.state.sessionsCreated.length, 0);
  } finally {
    clearEnv();
  }
});

// ─── STR-01: lazy customer create ────────────────────────────────────────────

Deno.test("active paid tier: elite/monthly falls back to legacy PRO price env when ELITE is unset", async () => {
  setTestEnv();
  Deno.env.delete("STRIPE_PRICE_ELITE_MONTHLY");
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
      ui_mode: "embedded",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "free" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const session = fakeStripe.state.sessionsCreated[0];
    const lineItems = session.line_items as Array<{ price: string }>;
    assertEquals(lineItems[0].price, PRO_MONTHLY);
    const metadata = session.metadata as Record<string, string>;
    assertEquals(metadata.tier, "elite");
    assertEquals(metadata.interval, "monthly");
  } finally {
    clearEnv();
  }
});

Deno.test("STR-01: lazy customer create when stripe_customer_id is null", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{ id: "u1", email: "a@test.com", stripe_customer_id: null }],
    });
    const fakeStripe = createFakeStripe({ customerId: "cus_new_42" });
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);

    // stripe.customers.create IS called with email + metadata.user_id
    assertEquals(fakeStripe.state.customersCreated.length, 1);
    const customerCall = fakeStripe.state.customersCreated[0];
    assertEquals(customerCall.email, "a@test.com");
    assertEquals(
      (customerCall.metadata as Record<string, string>).user_id,
      "u1",
    );

    // profile write-back
    const writeBack = fakeSb.state.updates.find((u) =>
      (u.data as Record<string, unknown>).stripe_customer_id === "cus_new_42"
    );
    assert(writeBack, "expected profile write-back with new stripe_customer_id");

    // session was created with the new customer id
    assertEquals(fakeStripe.state.sessionsCreated.length, 1);
    assertEquals(fakeStripe.state.sessionsCreated[0].customer, "cus_new_42");
  } finally {
    clearEnv();
  }
});

// ─── STR-01: customer reuse ──────────────────────────────────────────────────

Deno.test("STR-01: reuse existing stripe_customer_id (no customers.create)", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    assertEquals(
      fakeStripe.state.customersCreated.length,
      0,
      "customer must not be re-created",
    );
    assertEquals(fakeStripe.state.sessionsCreated[0].customer, "cus_existing");
  } finally {
    clearEnv();
  }
});

// ─── STR-01: happy path pro/monthly ──────────────────────────────────────────

Deno.test("STR-01: pro/monthly happy path → 200 with {url, id}", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe({
      sessionId: "cs_pro_m_1",
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_pro_m_1",
    });
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, "cs_pro_m_1");
    assertEquals(body.url, "https://checkout.stripe.com/c/pay/cs_pro_m_1");

    const session = fakeStripe.state.sessionsCreated[0];
    assertEquals(session.mode, "subscription");
    const lineItems = session.line_items as Array<{ price: string; quantity: number }>;
    assertEquals(lineItems[0].price, PRO_MONTHLY);
    assertEquals(lineItems[0].quantity, 1);
    assertEquals(session.client_reference_id, "u1");
    const metadata = session.metadata as Record<string, string>;
    assertEquals(metadata.user_id, "u1");
    assertEquals(metadata.tier, "pro");
    assertEquals(metadata.interval, "monthly");
    assertStringIncludes(session.success_url as string, APP_URL);
    assertStringIncludes(session.success_url as string, "{CHECKOUT_SESSION_ID}");
  } finally {
    clearEnv();
  }
});

// ─── STR-01: happy path elite/annual ─────────────────────────────────────────

Deno.test("STR-01: elite/annual uses STRIPE_PRICE_ELITE_ANNUAL", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "elite", interval: "annual" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () =>
        Promise.resolve({ ...BASE_CTX, tier: "elite" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const session = fakeStripe.state.sessionsCreated[0];
    const lineItems = session.line_items as Array<{ price: string }>;
    assertEquals(lineItems[0].price, ELITE_ANNUAL);
  } finally {
    clearEnv();
  }
});

// ─── Rate limit ──────────────────────────────────────────────────────────────

Deno.test("rate limit exceeded → 429 rate_limit_exceeded", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () =>
        Promise.resolve({
          allowed: false,
          retryAfterSeconds: 1800,
          remaining: 0,
        }),
    });
    assertEquals(res.status, 429);
    const body = await res.json();
    assertEquals(body.error, "rate_limit_exceeded");
    assertEquals(fakeStripe.state.sessionsCreated.length, 0);
  } finally {
    clearEnv();
  }
});

// ─── STR-12: priceId in body is IGNORED ──────────────────────────────────────

Deno.test("STR-12: malicious priceId in body is ignored — env value used", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({
      tier: "pro",
      interval: "monthly",
      priceId: "price_malicious",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const session = fakeStripe.state.sessionsCreated[0];
    const lineItems = session.line_items as Array<{ price: string }>;
    assertEquals(lineItems[0].price, PRO_MONTHLY);
    assert(
      lineItems[0].price !== "price_malicious",
      "client-supplied priceId must never reach Stripe",
    );
  } finally {
    clearEnv();
  }
});

// ─── Phase 12 Plan 04: BACK-04 / SHOP-12 / back-compat ───────────────────────

const MERIT_25 = "price_merit_25_test";
const MERIT_50 = "price_merit_50_test";
const MERIT_KEYS = [
  "STRIPE_PRICE_MERIT_3",
  "STRIPE_PRICE_MERIT_10",
  "STRIPE_PRICE_MERIT_25",
  "STRIPE_PRICE_MERIT_50",
] as const;

function clearMeritEnv(): void {
  for (const k of MERIT_KEYS) Deno.env.delete(k);
}

// ─── BACK-04 (back-compat): bare {tier, interval} (no `mode`) ────────────────

Deno.test("subscription-back-compat-no-mode-field: bare {tier, interval} still works", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe({
      sessionId: "cs_back_compat_1",
    });
    // No `mode` field — must be treated as subscription (Phase 07 contract).
    const req = makeReq({ tier: "pro", interval: "monthly" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const session = fakeStripe.state.sessionsCreated[0];
    assertEquals(session.mode, "subscription");
    const lineItems = session.line_items as Array<{ price: string }>;
    assertEquals(lineItems[0].price, PRO_MONTHLY);
    const metadata = session.metadata as Record<string, string>;
    assertEquals(metadata.tier, "pro");
    assertEquals(metadata.interval, "monthly");
  } finally {
    clearEnv();
  }
});

// ─── BACK-04: payment-mode happy path with shop session metadata ─────────────

Deno.test("payment-mode-creates-shop-session: writes shop metadata + payment_intent_data", async () => {
  setTestEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_25", MERIT_25);
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe({
      sessionId: "cs_shop_25_1",
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_shop_25_1",
    });
    const req = makeReq({ mode: "payment", pack_size: 25 });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);

    const body = await res.json();
    assertEquals(body.id, "cs_shop_25_1");
    assertEquals(body.url, "https://checkout.stripe.com/c/pay/cs_shop_25_1");

    const session = fakeStripe.state.sessionsCreated[0];
    assertEquals(session.mode, "payment");
    assertEquals(session.customer, "cus_existing");

    const lineItems = session.line_items as Array<
      { price: string; quantity: number }
    >;
    assertEquals(lineItems[0].price, MERIT_25);
    assertEquals(lineItems[0].quantity, 1);

    assertEquals(session.client_reference_id, "u1");

    // Pitfall 9: BOTH session.metadata.user_id AND
    // payment_intent_data.metadata.user_id must be present so the future shop
    // webhook handler can correlate via either path.
    const metadata = session.metadata as Record<string, string>;
    assertEquals(metadata.user_id, "u1");
    assertEquals(metadata.pack_size, "25");

    const piData = session.payment_intent_data as {
      metadata: Record<string, string>;
    };
    assert(piData, "payment_intent_data must be set on payment-mode sessions");
    assertEquals(piData.metadata.user_id, "u1");
    assertEquals(piData.metadata.pack_size, "25");

    assertStringIncludes(session.success_url as string, "/pricing?checkout=complete");
    assertStringIncludes(session.cancel_url as string, "/pricing?canceled=1");
  } finally {
    clearMeritEnv();
    clearEnv();
  }
});

// ─── BACK-04: invalid pack_size returns 400 ──────────────────────────────────

Deno.test("payment-mode-invalid-pack-size-400: pack_size=7 returns 400 invalid_pack_size", async () => {
  setTestEnv();
  // Set a valid env var so we know the rejection is on pack_size, not env config.
  Deno.env.set("STRIPE_PRICE_MERIT_25", MERIT_25);
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ mode: "payment", pack_size: 7 });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_pack_size");
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "must not reach Stripe",
    );
  } finally {
    clearMeritEnv();
    clearEnv();
  }
});

// ─── BACK-04: missing shop env var returns 500 ───────────────────────────────

Deno.test("payment-mode-missing-price-env-500: pack_size=50 with unset env returns 500 price_not_configured", async () => {
  setTestEnv();
  // Explicitly ensure STRIPE_PRICE_MERIT_50 is unset.
  Deno.env.delete("STRIPE_PRICE_MERIT_50");
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({ mode: "payment", pack_size: 50 });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "price_not_configured");
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "must not reach Stripe when shop price is unconfigured",
    );
  } finally {
    clearMeritEnv();
    clearEnv();
  }
});

// ─── SHOP-12: shop-specific rate limit denies even when first one allows ─────

Deno.test("shop-rate-limit-exceeded: shop key denied → 429 even when entry key allowed", async () => {
  setTestEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_25", MERIT_25);
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();

    // Dispatch on cfg.key: entry-point limit allows, shop-specific limit denies.
    const checkRateLimit = (
      _userId: string,
      _tier: string,
      cfg: { key: string },
    ) => {
      if (cfg.key === "create-checkout-session-shop") {
        return Promise.resolve({
          allowed: false,
          retryAfterSeconds: 60,
          remaining: 0,
        });
      }
      return Promise.resolve(OK_RL);
    };

    const req = makeReq({ mode: "payment", pack_size: 25 });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit,
    });
    assertEquals(res.status, 429);
    const body = await res.json();
    assertEquals(body.error, "rate_limit_exceeded");
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "must not reach Stripe when shop rate limit denies",
    );
  } finally {
    clearMeritEnv();
    clearEnv();
  }
});

// ─── BACK-04: invalid_body for unrecognized shapes ───────────────────────────

Deno.test("invalid-body-returns-400: unrecognized body shape returns 400 invalid_body", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
      }],
    });
    const fakeStripe = createFakeStripe();
    // Body has neither {mode:'payment',pack_size} nor {tier,interval} nor explicit subscription mode.
    const req = makeReq({ foo: "bar" });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_body");
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "must not reach Stripe on invalid body",
    );
  } finally {
    clearEnv();
  }
});

// ─── Phase 33 Plan 02 (PRICE-03): subscription-swap branch ───────────────────
//
// An existing subscriber upgrading (Pro→Elite) must have their CURRENT
// subscription's item swapped in place (subscriptions.update) — NOT a second
// active subscription created via checkout.sessions.create (double-billing bug).

Deno.test("PRICE-03 swap: existing subscriber → subscriptions.update, no 2nd session", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    const fakeStripe = createFakeStripe({ retrievedItemId: "si_pro_item" });
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.mode, "swap");
    assertEquals(body.tier, "elite");

    // retrieve was called with the caller's own subscription id
    assertEquals(fakeStripe.state.subscriptionsRetrieved, ["sub_existing_1"]);

    // update was called once, swapping the retrieved item to the env Elite price
    assertEquals(fakeStripe.state.subscriptionsUpdated.length, 1);
    const upd = fakeStripe.state.subscriptionsUpdated[0];
    assertEquals(upd.id, "sub_existing_1");
    const items = upd.params.items as Array<{ id: string; price: string }>;
    assertEquals(items[0].id, "si_pro_item");
    assertEquals(items[0].price, ELITE_MONTHLY);
    assertEquals(upd.params.proration_behavior, "create_prorations");

    // and NO second subscription was created via checkout
    assertEquals(
      fakeStripe.state.sessionsCreated.length,
      0,
      "existing subscriber must not get a 2nd checkout session",
    );
  } finally {
    clearEnv();
  }
});

Deno.test("PRICE-03 swap: net-new subscriber (null sub id) → embedded session unchanged", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: null,
      }],
    });
    const fakeStripe = createFakeStripe({ sessionId: "cs_new_1" });
    const req = makeReq({
      mode: "subscription",
      tier: "pro",
      interval: "monthly",
      ui_mode: "embedded",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body.clientSecret !== undefined, "net-new path returns clientSecret");
    assertEquals(body.mode, undefined, "net-new path is NOT a swap");
    // stripe-checkout-key-mismatch: embedded checkout responses report the backend
    // secret-key mode so the frontend can refuse a test/live split at mount time.
    // setTestEnv sets STRIPE_SECRET_KEY=sk_test_ → getStripeMode()='test'.
    assertEquals(body.stripeMode, "test", "embedded checkout reports its Stripe mode");

    // embedded session created; no subscription swap attempted
    assertEquals(fakeStripe.state.sessionsCreated.length, 1);
    assertEquals(fakeStripe.state.subscriptionsUpdated.length, 0);
    assertEquals(fakeStripe.state.subscriptionsRetrieved.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("PRICE-03 swap: price resolved from env, body.priceId ignored", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    const fakeStripe = createFakeStripe();
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "annual",
      priceId: "price_malicious",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 200);
    const upd = fakeStripe.state.subscriptionsUpdated[0];
    const items = upd.params.items as Array<{ price: string }>;
    assertEquals(items[0].price, ELITE_ANNUAL);
    assert(
      items[0].price !== "price_malicious",
      "client-supplied priceId must never reach Stripe",
    );
  } finally {
    clearEnv();
  }
});

Deno.test("PRICE-03 swap: no-payment-method failure → { mode: 'portal_required' } 200 + CORS", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    // Simulate Stripe rejecting the swap because there is no usable card on file.
    const noPmError = Object.assign(
      new Error("This customer has no attached payment source or default payment method."),
      { code: "missing", type: "StripeInvalidRequestError" },
    );
    const fakeStripe = createFakeStripe({ updateThrows: noPmError });
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
    }, { origin: APP_URL });
    const res = await withCors(req, 'user', () => handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.mode, "portal_required");
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP_URL);
    // No checkout session minted on the fallback path.
    assertEquals(fakeStripe.state.sessionsCreated.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("PRICE-03 swap: generic Stripe failure → 500 with CORS headers", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    const fakeStripe = createFakeStripe({
      updateThrows: new Error("stripe is down"),
    });
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
    }, { origin: APP_URL });
    const res = await withCors(req, 'user', () => handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    }));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP_URL);
    const body = await res.json();
    assertEquals(body.error, "checkout_session_creation_failed");
  } finally {
    clearEnv();
  }
});

// CR-01: the retrieved subscription has no usable item id. The swap must fail
// loudly with a 500 BEFORE calling subscriptions.update — never pass an
// undefined/empty item id (which Stripe treats as "add a new item",
// double-billing the customer).
Deno.test("PRICE-03 swap: missing item id → 500, no update attempted (CR-01)", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    // Empty item id simulates a subscription with no chargeable item.
    const fakeStripe = createFakeStripe({ retrievedItemId: "" });
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
    }, { origin: APP_URL });
    const res = await withCors(req, 'user', () => handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    }));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP_URL);
    const body = await res.json();
    assertEquals(body.error, "checkout_session_creation_failed");
    // Critical: update must NOT be called with a bad item id.
    assertEquals(
      fakeStripe.state.subscriptionsUpdated.length,
      0,
      "must not call subscriptions.update with a missing item id",
    );
    assertEquals(fakeStripe.state.sessionsCreated.length, 0);
  } finally {
    clearEnv();
  }
});

// CR-02: a generic resource_missing failure (e.g. deleted customer, unknown
// price) is NOT a missing-payment-method case. It must surface as a 500, not be
// mis-routed to { mode: 'portal_required' } which would mask the real config error.
Deno.test("PRICE-03 swap: generic resource_missing → 500, NOT portal_required (CR-02)", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase({
      profiles: [{
        id: "u1",
        email: "a@test.com",
        stripe_customer_id: "cus_existing",
        stripe_subscription_id: "sub_existing_1",
      }],
    });
    const resourceMissing = Object.assign(
      new Error("No such price: 'price_deleted_123'"),
      { code: "resource_missing", type: "StripeInvalidRequestError" },
    );
    const fakeStripe = createFakeStripe({ updateThrows: resourceMissing });
    const req = makeReq({
      mode: "subscription",
      tier: "elite",
      interval: "monthly",
    });
    const res = await handleCreateCheckoutSession(req, {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve({ ...BASE_CTX, tier: "pro" }),
      checkRateLimit: () => Promise.resolve(OK_RL),
    });
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "checkout_session_creation_failed");
    assert(
      body.mode !== "portal_required",
      "generic resource_missing must not be mis-routed to portal_required",
    );
  } finally {
    clearEnv();
  }
});
