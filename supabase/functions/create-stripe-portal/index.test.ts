/**
 * Deno tests for create-stripe-portal/index.ts — Phase 07 Plan 05 (STR-05).
 * Run with:
 *   deno test --allow-env --allow-net supabase/functions/create-stripe-portal/index.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCreateStripePortal } from "./index.ts";
import { withCors } from "../_shared/cors.ts";
import type { UserContext } from "../_shared/auth.ts";

const APP_URL = "https://test.strivo.ai";

function setTestEnv(): void {
  Deno.env.set("APP_URL", APP_URL);
  // ALLOWED_ORIGINS drives the post-01-01 origin-reflection CORS contract; the
  // OPTIONS case drives the handler through withCors with Origin === APP_URL so
  // Access-Control-Allow-Origin === APP_URL (assertion unchanged).
  Deno.env.set("ALLOWED_ORIGINS", APP_URL);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
}
function clearEnv(): void {
  Deno.env.delete("APP_URL");
  Deno.env.delete("ALLOWED_ORIGINS");
  Deno.env.delete("STRIPE_SECRET_KEY");
}

interface FakeProfile {
  id: string;
  stripe_customer_id: string | null;
}

function createFakeSupabase(profiles: FakeProfile[]) {
  const state = {
    profileQueries: [] as Array<{ id: unknown }>,
  };
  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select(_cols: string) {
          return {
            eq(_col: string, value: unknown) {
              state.profileQueries.push({ id: value });
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
      };
    },
  };
  return { client, state };
}

function createFakeStripe(sessionUrl = "https://billing.stripe.com/p/session/abc") {
  const state = {
    portalCalls: [] as Array<Record<string, unknown>>,
  };
  const stripe = {
    billingPortal: {
      sessions: {
        create(params: Record<string, unknown>) {
          state.portalCalls.push(params);
          return Promise.resolve({
            id: "bps_test_1",
            url: sessionUrl,
          });
        },
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { stripe, state };
}

const CTX_A: UserContext = { userId: "uA", email: "a@test.com", tier: "pro" };
const CTX_B: UserContext = { userId: "uB", email: "b@test.com", tier: "pro" };

function postReq(): Request {
  return new Request("https://example.test/create-stripe-portal", {
    method: "POST",
    headers: {
      authorization: "Bearer fake.jwt.token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
}

function unauthorizedThrow(): never {
  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Test 1: Missing JWT → 401 ────────────────────────────────────────────────

Deno.test("missing JWT → 401 Unauthorized", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_customer_id: "cus_abc" },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCreateStripePortal(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => unauthorizedThrow(),
    });
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
    assertEquals(fakeStripe.state.portalCalls.length, 0);
  } finally {
    clearEnv();
  }
});

// ── Test 2: OPTIONS → CORS ───────────────────────────────────────────────────

Deno.test("OPTIONS preflight → 200 with CORS headers", async () => {
  setTestEnv();
  try {
    const req = new Request("https://example.test/create-stripe-portal", {
      method: "OPTIONS",
      headers: { Origin: APP_URL },
    });
    const res = await withCors(req, 'user', () => handleCreateStripePortal(req, {
      supabase: createFakeSupabase([]).client,
      stripe: createFakeStripe().stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), APP_URL);
  } finally {
    clearEnv();
  }
});

// ── Test 3: GET → 405 ────────────────────────────────────────────────────────

Deno.test("GET → 405 method_not_allowed", async () => {
  setTestEnv();
  try {
    const req = new Request("https://example.test/create-stripe-portal", {
      method: "GET",
    });
    const res = await handleCreateStripePortal(req, {
      supabase: createFakeSupabase([]).client,
      stripe: createFakeStripe().stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 405);
    const body = await res.json();
    assertEquals(body.error, "method_not_allowed");
  } finally {
    clearEnv();
  }
});

// ── Test 4: no_customer when stripe_customer_id is null ──────────────────────

Deno.test("D-23: stripe_customer_id null → 400 no_customer", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_customer_id: null },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCreateStripePortal(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "no_customer");
    assertEquals(
      fakeStripe.state.portalCalls.length,
      0,
      "must not call Stripe without a customer id",
    );
  } finally {
    clearEnv();
  }
});

// ── Test 5: happy path ───────────────────────────────────────────────────────

Deno.test("STR-05: happy path returns {url} from billingPortal.sessions.create", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_customer_id: "cus_abc" },
    ]);
    const fakeStripe = createFakeStripe(
      "https://billing.stripe.com/p/session/uA_portal",
    );
    const res = await handleCreateStripePortal(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.url, "https://billing.stripe.com/p/session/uA_portal");

    assertEquals(fakeStripe.state.portalCalls.length, 1);
    const call = fakeStripe.state.portalCalls[0];
    assertEquals(call.customer, "cus_abc");
    assertEquals(call.return_url, `${APP_URL}/pricing`);
  } finally {
    clearEnv();
  }
});

// ── Test 6: cross-user isolation ─────────────────────────────────────────────

Deno.test("STR-05 isolation: user A's JWT never produces a portal for user B's customer", async () => {
  setTestEnv();
  try {
    // Both users have customer ids, but only A is authenticated.
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_customer_id: "cus_for_A" },
      { id: "uB", stripe_customer_id: "cus_for_B" },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCreateStripePortal(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 200);

    // Only one query, keyed by uA.
    assertEquals(fakeSb.state.profileQueries.length, 1);
    assertEquals(fakeSb.state.profileQueries[0].id, "uA");

    // Stripe portal was created for cus_for_A, NEVER cus_for_B.
    const call = fakeStripe.state.portalCalls[0];
    assertEquals(call.customer, "cus_for_A");
    assert(
      call.customer !== "cus_for_B",
      "cross-user portal creation must be impossible",
    );

    // Also verify with user B's JWT the handler returns B's portal, not A's.
    const fakeStripe2 = createFakeStripe();
    const res2 = await handleCreateStripePortal(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe2.stripe,
      requireAuth: () => Promise.resolve(CTX_B),
    });
    assertEquals(res2.status, 200);
    assertEquals(fakeStripe2.state.portalCalls[0].customer, "cus_for_B");
  } finally {
    clearEnv();
  }
});
