/**
 * Deno tests for cancel-subscription/index.ts — quick task 260718-jbd.
 * Run with:
 *   deno test --allow-env --allow-net supabase/functions/cancel-subscription/index.test.ts
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCancelSubscription } from "./index.ts";
import { withCors } from "../_shared/cors.ts";
import type { UserContext } from "../_shared/auth.ts";

const APP_URL = "https://test.strivo.ai";

function setTestEnv(): void {
  Deno.env.set("APP_URL", APP_URL);
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
  stripe_subscription_id: string | null;
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

function createFakeStripe(currentPeriodEnd = 1893456000) {
  const state = {
    updateCalls: [] as Array<{ id: string; params: Record<string, unknown> }>,
  };
  const stripe = {
    subscriptions: {
      update(id: string, params: Record<string, unknown>) {
        state.updateCalls.push({ id, params });
        return Promise.resolve({
          id,
          cancel_at_period_end: true,
          current_period_end: currentPeriodEnd,
        });
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { stripe, state };
}

const CTX_A: UserContext = { userId: "uA", email: "a@test.com", tier: "elite" };
const CTX_B: UserContext = { userId: "uB", email: "b@test.com", tier: "elite" };

function postReq(): Request {
  return new Request("https://example.test/cancel-subscription", {
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
      { id: "uA", stripe_subscription_id: "sub_abc" },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCancelSubscription(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => unauthorizedThrow(),
    });
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized");
    assertEquals(fakeStripe.state.updateCalls.length, 0);
  } finally {
    clearEnv();
  }
});

// ── Test 2: OPTIONS → CORS ───────────────────────────────────────────────────

Deno.test("OPTIONS preflight → 200 with CORS headers", async () => {
  setTestEnv();
  try {
    const req = new Request("https://example.test/cancel-subscription", {
      method: "OPTIONS",
      headers: { Origin: APP_URL },
    });
    const res = await withCors(req, "user", () =>
      handleCancelSubscription(req, {
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
    const req = new Request("https://example.test/cancel-subscription", {
      method: "GET",
    });
    const res = await handleCancelSubscription(req, {
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

// ── Test 4: no_subscription when stripe_subscription_id is null ───────────────

Deno.test("stripe_subscription_id null → 400 no_subscription", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_subscription_id: null },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCancelSubscription(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error, "no_subscription");
    assertEquals(
      fakeStripe.state.updateCalls.length,
      0,
      "must not call Stripe without a subscription id",
    );
  } finally {
    clearEnv();
  }
});

// ── Test 5: happy path — cancel at period end ────────────────────────────────

Deno.test("happy path sets cancel_at_period_end and returns period end", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_subscription_id: "sub_uA" },
    ]);
    const fakeStripe = createFakeStripe(1900000000);
    const res = await handleCancelSubscription(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.current_period_end, 1900000000);

    assertEquals(fakeStripe.state.updateCalls.length, 1);
    const call = fakeStripe.state.updateCalls[0];
    assertEquals(call.id, "sub_uA");
    assertEquals(call.params.cancel_at_period_end, true);
  } finally {
    clearEnv();
  }
});

// ── Test 6: cross-user isolation ─────────────────────────────────────────────

Deno.test("isolation: user A's JWT never cancels user B's subscription", async () => {
  setTestEnv();
  try {
    const fakeSb = createFakeSupabase([
      { id: "uA", stripe_subscription_id: "sub_for_A" },
      { id: "uB", stripe_subscription_id: "sub_for_B" },
    ]);
    const fakeStripe = createFakeStripe();
    const res = await handleCancelSubscription(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe.stripe,
      requireAuth: () => Promise.resolve(CTX_A),
    });
    assertEquals(res.status, 200);

    // Only one query, keyed by uA.
    assertEquals(fakeSb.state.profileQueries.length, 1);
    assertEquals(fakeSb.state.profileQueries[0].id, "uA");

    // Stripe cancel targeted sub_for_A, NEVER sub_for_B.
    const call = fakeStripe.state.updateCalls[0];
    assertEquals(call.id, "sub_for_A");
    assert(
      call.id !== "sub_for_B",
      "cross-user cancellation must be impossible",
    );

    // With user B's JWT the handler cancels B's subscription, not A's.
    const fakeStripe2 = createFakeStripe();
    const res2 = await handleCancelSubscription(postReq(), {
      supabase: fakeSb.client,
      stripe: fakeStripe2.stripe,
      requireAuth: () => Promise.resolve(CTX_B),
    });
    assertEquals(res2.status, 200);
    assertEquals(fakeStripe2.state.updateCalls[0].id, "sub_for_B");
  } finally {
    clearEnv();
  }
});
