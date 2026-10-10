/**
 * Deno tests for create-payment-intent/index.ts — Phase 24 Plan 06 Task 1
 * (TOPUP-03 + SHOP-11 + D-27 fail-closed).
 *
 * Covers: method guard, auth propagation, rate-limit, body validation,
 * invalid pack_id, lazy customer creation, happy path, and Stripe failure
 * mode — all via deps-injected fake supabase + stripe + requireAuth +
 * checkRateLimit (zero real Stripe calls, zero DB calls).
 *
 * Run with:
 *   deno test --allow-env --allow-net --no-check \
 *     supabase/functions/create-payment-intent/index.test.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type Stripe from "npm:stripe@14";
import { withCors } from "../_shared/cors.ts";
import type { UserContext } from "../_shared/auth.ts";
import type { RateLimitResult } from "../_shared/rate-limiter.ts";

const APP_URL = "http://localhost:8080";

// ── Test-env harness ────────────────────────────────────────────────────────

function setTestEnv(): void {
  Deno.env.set("APP_URL", APP_URL);
  // ALLOWED_ORIGINS drives the post-01-01 origin-reflection CORS contract; the
  // OPTIONS case drives the handler through withCors with an allowlisted Origin
  // so Access-Control-Allow-Origin is present (assertExists unchanged).
  Deno.env.set("ALLOWED_ORIGINS", APP_URL);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

function clearEnv(): void {
  for (const k of ["APP_URL", "ALLOWED_ORIGINS", "STRIPE_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    Deno.env.delete(k);
  }
}

// ── Fake supabase with chainable profile lookup + update ────────────────────

interface FakeProfileState {
  stripe_customer_id: string | null;
  email: string | null;
}

interface ProfileUpdateCall {
  updateData: Record<string, unknown>;
  eqColumn: string;
  eqValue: unknown;
}

function createFakeSupabase(initial: FakeProfileState) {
  const state: FakeProfileState = { ...initial };
  const updateCalls: ProfileUpdateCall[] = [];

  return {
    state,
    updateCalls,
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                single() {
                  return Promise.resolve({
                    data: {
                      stripe_customer_id: state.stripe_customer_id,
                      email: state.email,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(updateData: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              updateCalls.push({ updateData, eqColumn: col, eqValue: val });
              // Apply update to local state so subsequent lookups are consistent.
              if (typeof updateData.stripe_customer_id === "string") {
                state.stripe_customer_id = updateData.stripe_customer_id;
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

// ── Fake Stripe with call log for assertions ────────────────────────────────

interface PaymentIntentCreateCall {
  args: Stripe.PaymentIntentCreateParams;
}

interface CustomerCreateCall {
  args: Stripe.CustomerCreateParams;
}

function createFakeStripe(opts: {
  throwOnPaymentIntentCreate?: boolean;
  customerId?: string;
} = {}) {
  const paymentIntentCreateCalls: PaymentIntentCreateCall[] = [];
  const customerCreateCalls: CustomerCreateCall[] = [];

  return {
    paymentIntentCreateCalls,
    customerCreateCalls,
    paymentIntents: {
      create(args: Stripe.PaymentIntentCreateParams) {
        paymentIntentCreateCalls.push({ args });
        if (opts.throwOnPaymentIntentCreate) {
          throw new Error("Stripe API is unavailable");
        }
        return Promise.resolve({
          id: "pi_test_abc123",
          client_secret: "pi_test_abc123_secret_xyz",
          amount: args.amount,
          currency: args.currency,
          metadata: args.metadata,
          status: "requires_payment_method",
        });
      },
    },
    customers: {
      create(args: Stripe.CustomerCreateParams) {
        customerCreateCalls.push({ args });
        return Promise.resolve({ id: opts.customerId ?? "cus_test_new" });
      },
    },
  } as unknown as Stripe & {
    paymentIntentCreateCalls: PaymentIntentCreateCall[];
    customerCreateCalls: CustomerCreateCall[];
  };
}

// ── Fake auth + rate-limit ──────────────────────────────────────────────────

function okAuth(tier: "free" | "pro" | "elite" = "free") {
  return (_req: Request): Promise<UserContext> =>
    Promise.resolve({
      userId: "user-test-1",
      email: "u@example.com",
      tier,
    });
}

function throwingAuth(status: number, body: unknown = { error: "Unauthorized" }) {
  return (_req: Request): Promise<UserContext> => {
    throw new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function okRateLimit(): (
  userId: string,
  tier: string,
) => Promise<RateLimitResult> {
  return () =>
    Promise.resolve({ allowed: true, retryAfterSeconds: 0, remaining: 10 });
}

function denyRateLimit(retryAfterSeconds = 120): (
  userId: string,
  tier: string,
) => Promise<RateLimitResult> {
  return () =>
    Promise.resolve({ allowed: false, retryAfterSeconds, remaining: 0 });
}

// ── Request builder ─────────────────────────────────────────────────────────

function buildRequest(opts: {
  method?: string;
  body?: unknown;
  origin?: string;
}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // ACAO-asserting case passes an allowlisted Origin so withCors reflects it.
  if (opts.origin) headers.Origin = opts.origin;
  return new Request("http://localhost/create-payment-intent", {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined
      ? undefined
      : typeof opts.body === "string"
      ? opts.body
      : JSON.stringify(opts.body),
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

// First test disables resource sanitizers because the imported module runs
// Deno.serve() at module scope (production entry point).
Deno.test({
  name: "happy-path: valid auth + valid pack_id → 200 + clientSecret + PI metadata",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    setTestEnv();
    try {
      const { handleCreatePaymentIntent } = await import("./index.ts");
      const supabase = createFakeSupabase({
        stripe_customer_id: "cus_existing_123",
        email: "u@example.com",
      });
      const stripe = createFakeStripe();

      const res = await handleCreatePaymentIntent(
        buildRequest({ body: { pack_id: "pack_25" } }),
        {
          // deno-lint-ignore no-explicit-any
          supabase: supabase as any,
          stripe,
          requireAuth: okAuth("pro"),
          checkRateLimit: okRateLimit(),
        },
      );

      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.clientSecret, "pi_test_abc123_secret_xyz");
      assertEquals(body.paymentIntentId, "pi_test_abc123");
      // stripe-checkout-key-mismatch: a pi_ secret cannot self-describe its mode,
      // so the backend MUST report it explicitly for the frontend guard. Test env
      // sets STRIPE_SECRET_KEY=sk_test_ → getStripeMode()='test'.
      assertEquals(body.stripeMode, "test");

      // Assert paymentIntents.create was called exactly once with the canonical
      // PACKS_BY_ID values (price and pack size derived server-side).
      assertEquals(stripe.paymentIntentCreateCalls.length, 1);
      const piCall = stripe.paymentIntentCreateCalls[0].args;
      assertEquals(piCall.amount, 999); // pack_25 priceCents
      assertEquals(piCall.currency, "usd");
      assertEquals(piCall.customer, "cus_existing_123");
      assertEquals(piCall.automatic_payment_methods?.enabled, true);
      assertEquals(piCall.metadata?.user_id, "user-test-1");
      assertEquals(piCall.metadata?.pack_id, "pack_25");
      assertEquals(piCall.metadata?.pack_size, "25");

      // No customer creation (existing customerId was set).
      assertEquals(stripe.customerCreateCalls.length, 0);
    } finally {
      clearEnv();
    }
  },
});

Deno.test("method guard: GET → 405 method_not_allowed", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({ stripe_customer_id: null, email: null });
    const stripe = createFakeStripe();

    const res = await handleCreatePaymentIntent(
      buildRequest({ method: "GET" }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 405);
    const body = await res.json();
    assertEquals(body.error, "method_not_allowed");
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("auth required: requireAuth throws Response → propagated unchanged", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({ stripe_customer_id: null, email: null });
    const stripe = createFakeStripe();

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: { pack_id: "pack_25" } }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: throwingAuth(401),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("rate-limit exceeded: checkRateLimit denies → 429 + Retry-After", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({ stripe_customer_id: null, email: null });
    const stripe = createFakeStripe();

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: { pack_id: "pack_25" } }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: denyRateLimit(120),
      },
    );

    assertEquals(res.status, 429);
    assertEquals(res.headers.get("Retry-After"), "120");
    const body = await res.json();
    assertEquals(body.error, "rate_limit_exceeded");
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("invalid pack_id: 'pack_99' → 400 invalid_pack_id; Stripe NOT called", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({
      stripe_customer_id: "cus_existing_123",
      email: "u@example.com",
    });
    const stripe = createFakeStripe();

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: { pack_id: "pack_99" } }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_pack_id");
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("missing pack_id in body: 400 invalid_body", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({ stripe_customer_id: null, email: null });
    const stripe = createFakeStripe();

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: {} }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "invalid_body");
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("lazy customer creation: stripe_customer_id null → stripe.customers.create called + profile updated + PI created with new id", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({
      stripe_customer_id: null,
      email: "u@example.com",
    });
    const stripe = createFakeStripe({ customerId: "cus_brand_new_456" });

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: { pack_id: "pack_10" } }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 200);

    // Customer was created with the user's email + user_id metadata.
    assertEquals(stripe.customerCreateCalls.length, 1);
    assertEquals(stripe.customerCreateCalls[0].args.email, "u@example.com");
    assertEquals(
      (stripe.customerCreateCalls[0].args.metadata as Record<string, string>)
        ?.user_id,
      "user-test-1",
    );

    // Profile row was updated with the new customer id.
    assertEquals(supabase.updateCalls.length, 1);
    assertEquals(
      supabase.updateCalls[0].updateData.stripe_customer_id,
      "cus_brand_new_456",
    );
    assertEquals(supabase.updateCalls[0].eqColumn, "id");
    assertEquals(supabase.updateCalls[0].eqValue, "user-test-1");

    // PI created with the freshly-minted customer id.
    assertEquals(stripe.paymentIntentCreateCalls.length, 1);
    assertEquals(
      stripe.paymentIntentCreateCalls[0].args.customer,
      "cus_brand_new_456",
    );
    assertEquals(stripe.paymentIntentCreateCalls[0].args.amount, 499); // pack_10 priceCents
  } finally {
    clearEnv();
  }
});

Deno.test("fail-closed: paymentIntents.create throws → 500 payment_intent_creation_failed (no stack in body)", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({
      stripe_customer_id: "cus_existing_123",
      email: "u@example.com",
    });
    const stripe = createFakeStripe({ throwOnPaymentIntentCreate: true });

    const res = await handleCreatePaymentIntent(
      buildRequest({ body: { pack_id: "pack_25" } }),
      {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      },
    );

    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "payment_intent_creation_failed");
    // No Stripe error message or stack trace should be echoed to the client.
    assertEquals(Object.keys(body).length, 1);
  } finally {
    clearEnv();
  }
});

Deno.test("OPTIONS preflight: returns CORS headers (handleOptionsRequest path)", async () => {
  setTestEnv();
  try {
    const { handleCreatePaymentIntent } = await import("./index.ts");
    const supabase = createFakeSupabase({ stripe_customer_id: null, email: null });
    const stripe = createFakeStripe();

    const req = buildRequest({ method: "OPTIONS", origin: APP_URL });
    const res = await withCors(req, 'user', () =>
      handleCreatePaymentIntent(req, {
        // deno-lint-ignore no-explicit-any
        supabase: supabase as any,
        stripe,
        requireAuth: okAuth(),
        checkRateLimit: okRateLimit(),
      }));

    assertExists(res.headers.get("Access-Control-Allow-Origin"));
    assertEquals(stripe.paymentIntentCreateCalls.length, 0);
  } finally {
    clearEnv();
  }
});
