import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type UserContext } from "../_shared/auth.ts";
import { withCors } from "../_shared/cors.ts";
import { handleRenewSubscription } from "./index.ts";

const APP_URL = "https://test.strivo.ai";
const CTX: UserContext = {
  userId: "user-a",
  email: "a@test.com",
  tier: "elite",
};

function setTestEnv(): void {
  Deno.env.set("ALLOWED_ORIGINS", APP_URL);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_1234567890");
}

function clearTestEnv(): void {
  Deno.env.delete("ALLOWED_ORIGINS");
  Deno.env.delete("STRIPE_SECRET_KEY");
}

interface FakeProfile {
  id: string;
  stripe_subscription_id: string | null;
}

function createFakeSupabase(
  profiles: FakeProfile[],
  profileError?: { code?: string },
) {
  const state = {
    profileQueries: [] as Array<{ column: string; value: unknown }>,
    updateCalls: [] as Array<{ table: string; value: unknown }>,
  };

  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: unknown) {
              state.profileQueries.push({ column, value });
              return {
                single() {
                  if (profileError) {
                    return Promise.resolve({ data: null, error: profileError });
                  }
                  const profile = profiles.find((row) => row.id === value) ??
                    null;
                  return Promise.resolve({
                    data: profile,
                    error: profile ? null : { code: "PGRST116" },
                  });
                },
              };
            },
          };
        },
        update(value: unknown) {
          state.updateCalls.push({ table, value });
          throw new Error("renew-subscription must never update profiles");
        },
      };
    },
  };

  return { client, state };
}

interface FakeStripeOptions {
  retrieveResponse?: Record<string, unknown>;
  updateResponse?: Record<string, unknown>;
  retrieveError?: boolean;
  updateError?: boolean;
}

function createFakeStripe(options: FakeStripeOptions = {}) {
  const state = {
    retrieveCalls: [] as string[],
    updateCalls: [] as Array<{ id: string; params: Record<string, unknown> }>,
  };

  const stripe = {
    subscriptions: {
      retrieve(id: string) {
        state.retrieveCalls.push(id);
        if (options.retrieveError) throw new Error("provider unavailable");
        return Promise.resolve(
          options.retrieveResponse ?? {
            id,
            cancel_at_period_end: true,
            current_period_end: 1900000000,
          },
        );
      },
      update(id: string, params: Record<string, unknown>) {
        state.updateCalls.push({ id, params });
        if (options.updateError) throw new Error("provider unavailable");
        return Promise.resolve(
          options.updateResponse ?? {
            id,
            cancel_at_period_end: false,
            current_period_end: 1900000000,
          },
        );
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { stripe, state };
}

function request(
  body: unknown,
  method = "POST",
): Request {
  return new Request("https://example.test/renew-subscription", {
    method,
    headers: {
      Origin: APP_URL,
      Authorization: "Bearer fake.jwt.token",
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

async function invoke(
  req: Request,
  options: {
    supabase?: ReturnType<typeof createFakeSupabase>["client"];
    stripe?: ReturnType<typeof createFakeStripe>["stripe"];
    requireAuth?: (req: Request) => Promise<UserContext>;
  } = {},
): Promise<Response> {
  return await withCors(req, "user", () =>
    handleRenewSubscription(req, {
      supabase: options.supabase ?? createFakeSupabase([]).client,
      stripe: options.stripe ?? createFakeStripe().stripe,
      requireAuth: options.requireAuth ?? (() => Promise.resolve(CTX)),
    }));
}

function assertCors(response: Response): void {
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), APP_URL);
  assertEquals(response.headers.get("Vary"), "Origin");
}

function unauthorized(): never {
  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("renew-subscription OPTIONS uses the shared user CORS contract", async () => {
  setTestEnv();
  try {
    const response = await invoke(request(null, "OPTIONS"));
    assertEquals(response.status, 200);
    assertCors(response);
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription rejects non-POST methods with readable CORS", async () => {
  setTestEnv();
  try {
    const response = await invoke(request(null, "GET"));
    assertEquals(response.status, 405);
    assertEquals((await response.json()).error, "method_not_allowed");
    assertCors(response);
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription rejects missing and unknown actions before provider access", async () => {
  setTestEnv();
  try {
    for (const body of [{}, { action: "resume" }]) {
      const stripe = createFakeStripe();
      const response = await invoke(request(body), { stripe: stripe.stripe });
      assertEquals(response.status, 400);
      assertEquals((await response.json()).error, "invalid_action");
      assertCors(response);
      assertEquals(stripe.state.retrieveCalls.length, 0);
      assertEquals(stripe.state.updateCalls.length, 0);
    }
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription rejects malformed JSON with readable CORS", async () => {
  setTestEnv();
  try {
    const req = new Request("https://example.test/renew-subscription", {
      method: "POST",
      headers: { Origin: APP_URL, "Content-Type": "application/json" },
      body: "{",
    });
    const response = await invoke(req);
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error, "invalid_action");
    assertCors(response);
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription preserves auth failure and adds CORS", async () => {
  setTestEnv();
  try {
    const response = await invoke(request({ action: "preview" }), {
      requireAuth: () => unauthorized(),
    });
    assertEquals(response.status, 401);
    assertEquals((await response.json()).error, "Unauthorized");
    assertCors(response);
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription distinguishes profile lookup failures", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([], { code: "DATABASE_ERROR" });
    const response = await invoke(request({ action: "preview" }), {
      supabase: supabase.client,
    });
    assertEquals(response.status, 500);
    assertEquals((await response.json()).error, "profile_lookup_failed");
    assertCors(response);
  } finally {
    clearTestEnv();
  }
});

Deno.test("renew-subscription returns no_subscription for a missing stored subscription", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: null },
    ]);
    const stripe = createFakeStripe();
    const response = await invoke(request({ action: "restore" }), {
      supabase: supabase.client,
      stripe: stripe.stripe,
    });
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error, "no_subscription");
    assertCors(response);
    assertEquals(stripe.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});

Deno.test("preview returns the exact Stripe period end without mutation", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: "sub_stored" },
    ]);
    const stripe = createFakeStripe({
      retrieveResponse: { current_period_end: 1911111111 },
    });
    const response = await invoke(request({ action: "preview" }), {
      supabase: supabase.client,
      stripe: stripe.stripe,
    });
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      ok: true,
      action: "preview",
      current_period_end: 1911111111,
    });
    assertEquals(stripe.state.retrieveCalls, ["sub_stored"]);
    assertEquals(stripe.state.updateCalls.length, 0);
    assertEquals(supabase.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});

Deno.test("restore uses only the authenticated user's stored subscription", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: "user-a", stripe_subscription_id: "sub_for_a" },
      { id: "user-b", stripe_subscription_id: "sub_for_b" },
    ]);
    const stripe = createFakeStripe();
    const maliciousBody = {
      action: "restore",
      userId: "user-b",
      subscriptionId: "sub_for_b",
      customerId: "cus_for_b",
      tier: "free",
      price: 0,
    };

    const response = await invoke(request(maliciousBody), {
      supabase: supabase.client,
      stripe: stripe.stripe,
    });
    assertEquals(response.status, 200);
    assertEquals(supabase.state.profileQueries, [
      { column: "id", value: "user-a" },
    ]);
    assertEquals(stripe.state.updateCalls, [{
      id: "sub_for_a",
      params: { cancel_at_period_end: false },
    }]);
    const body = await response.json();
    assertEquals(body.cancel_at_period_end, false);
    assertFalse("price" in body);
    assertEquals(supabase.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});

Deno.test("restore is idempotent when Stripe already reports renewal enabled", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: "sub_restored" },
    ]);
    const stripe = createFakeStripe({
      updateResponse: {
        cancel_at_period_end: false,
        current_period_end: 1922222222,
      },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await invoke(request({ action: "restore" }), {
        supabase: supabase.client,
        stripe: stripe.stripe,
      });
      assertEquals(response.status, 200);
      assertEquals(await response.json(), {
        ok: true,
        action: "restore",
        current_period_end: 1922222222,
        cancel_at_period_end: false,
      });
    }

    assertEquals(stripe.state.updateCalls.length, 2);
    assertEquals(supabase.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});

Deno.test("provider failures remain failures with CORS and no profile write", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: "sub_stored" },
    ]);

    for (
      const testCase of [
        {
          action: "preview",
          options: { retrieveError: true },
          error: "preview_failed",
        },
        {
          action: "restore",
          options: { updateError: true },
          error: "restore_failed",
        },
      ]
    ) {
      const stripe = createFakeStripe(testCase.options);
      const response = await invoke(request({ action: testCase.action }), {
        supabase: supabase.client,
        stripe: stripe.stripe,
      });
      assertEquals(response.status, 500);
      assertEquals((await response.json()).error, testCase.error);
      assertCors(response);
      assertEquals(supabase.state.updateCalls.length, 0);
    }
  } finally {
    clearTestEnv();
  }
});

Deno.test("invalid or missing period ends never become success", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: "sub_stored" },
    ]);

    for (const periodEnd of [undefined, null, 0, -1, Number.NaN]) {
      const previewStripe = createFakeStripe({
        retrieveResponse: { current_period_end: periodEnd },
      });
      const preview = await invoke(request({ action: "preview" }), {
        supabase: supabase.client,
        stripe: previewStripe.stripe,
      });
      assertEquals(preview.status, 502);
      assertEquals(
        (await preview.json()).error,
        "invalid_subscription_response",
      );
      assertCors(preview);

      const restoreStripe = createFakeStripe({
        updateResponse: {
          cancel_at_period_end: false,
          current_period_end: periodEnd,
        },
      });
      const restore = await invoke(request({ action: "restore" }), {
        supabase: supabase.client,
        stripe: restoreStripe.stripe,
      });
      assertEquals(restore.status, 502);
      assertEquals((await restore.json()).error, "restore_not_confirmed");
      assertCors(restore);
    }
    assertEquals(supabase.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});

Deno.test("ambiguous cancel_at_period_end responses never confirm restoration", async () => {
  setTestEnv();
  try {
    const supabase = createFakeSupabase([
      { id: CTX.userId, stripe_subscription_id: "sub_stored" },
    ]);

    for (const cancelState of [undefined, null, true, 0, "false"]) {
      const stripe = createFakeStripe({
        updateResponse: {
          cancel_at_period_end: cancelState,
          current_period_end: 1900000000,
        },
      });
      const response = await invoke(request({ action: "restore" }), {
        supabase: supabase.client,
        stripe: stripe.stripe,
      });
      assertEquals(response.status, 502);
      assertEquals((await response.json()).error, "restore_not_confirmed");
      assertCors(response);
    }
    assertEquals(supabase.state.updateCalls.length, 0);
  } finally {
    clearTestEnv();
  }
});
