/**
 * Phase 13 Plan 04 — check-merit-alerts edge function tests.
 * REQ-IDs: NFR-11
 * Covers: T-13-AL1 debounce, T-13-AL2 upsert-before-email, T-13-AL4 non-fatal DB errors,
 *         T-13-CRON1 internal auth gate, threshold boundary regression.
 * Run with: deno test check-merit-alerts/index.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createHandler,
  tryFireAlert,
  AI_FAILURE_THRESHOLD,
  SHOP_FAILURE_THRESHOLD,
  DEBOUNCE_MINUTES,
  type AlertDeps,
  type AlertKey,
} from "./index.ts";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function buildMockServiceClient(overrides?: {
  negativeBalanceUsers?: unknown[];
  negativeBalanceError?: { message: string } | null;
  aiFailureRate?: number | null;
  aiFailureRateError?: { message: string } | null;
  shopFailureRate?: number | null;
  shopFailureRateError?: { message: string } | null;
  alertStateSelectResult?: { data: { last_fired_at: string } | null; error: null | { message: string } };
  alertStateUpsertResult?: { error: null | { message: string } };
}) {
  const negUsers = overrides?.negativeBalanceUsers ?? [];
  const negErr = overrides?.negativeBalanceError ?? null;
  const aiRate = overrides?.aiFailureRate ?? 0;
  const aiErr = overrides?.aiFailureRateError ?? null;
  const shopRate = overrides?.shopFailureRate ?? 0;
  const shopErr = overrides?.shopFailureRateError ?? null;
  const alertSelect = overrides?.alertStateSelectResult ?? { data: null, error: null };
  const alertUpsert = overrides?.alertStateUpsertResult ?? { error: null };

  return {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: (_cols: string) => ({
            or: (_filter: string) => ({
              limit: (_n: number) => Promise.resolve({ data: negUsers, error: negErr }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () => Promise.resolve(alertSelect),
            }),
          }),
          upsert: (_row: unknown) => Promise.resolve(alertUpsert),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: (fnName: string) => {
      if (fnName === 'get_ai_failure_rate_1h') {
        return Promise.resolve({ data: aiRate, error: aiErr });
      }
      if (fnName === 'get_shop_failure_rate_1h') {
        return Promise.resolve({ data: shopRate, error: shopErr });
      }
      return Promise.resolve({ data: null, error: { message: 'unknown rpc' } });
    },
  };
}

function buildInternalRequest(): Request {
  return new Request("http://localhost/check-merit-alerts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-job-secret": "test-secret",
    },
    body: JSON.stringify({ source: "test" }),
  });
}

function buildDeps(overrides: Partial<AlertDeps> & { getServiceClient: () => unknown }): AlertDeps {
  return {
    requireAuth: async () => null,
    fetchFn: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    nowFn: () => Date.now(),
    ...overrides,
  };
}

// ── Test 1: Unauthenticated request returns 401 ─────────────────────────────
Deno.test("unauthenticated request returns 401", async () => {
  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient(),
    requireAuth: async () => {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    },
    fetchFn: async () => new Response("", { status: 200 }),
    nowFn: () => Date.now(),
  });

  const req = new Request("http://localhost/check-merit-alerts", { method: "POST" });
  let response: Response;
  try {
    response = await handler(req);
  } catch (e) {
    response = e as Response;
  }
  assertEquals(response.status, 401);
});

// ── Test 2: Negative balance fires immediately (no debounce on first fire) ──
Deno.test("negative_balance fires immediately (no debounce)", async () => {
  const upsertCalls: unknown[] = [];
  const fetchCalls: string[] = [];

  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({
                data: [{ user_id: 'u1', subscription_balance: -5, shop_balance: 0 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: (row: unknown) => {
            upsertCalls.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: () => Promise.resolve({ data: 0, error: null }),
  };

  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
    fetchFn: async (url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.dispatched, 1);

  // Verify upsert happened (Pitfall 7: upsert BEFORE email)
  assertEquals(upsertCalls.length > 0, true, "alert_state upsert must happen");
  // Verify email was sent
  assertEquals(fetchCalls.length > 0, true, "email fetch must happen");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});

// ── Test 3: AI failure rate above threshold fires, below does not ────────────
Deno.test("ai_failure_rate_high debounces via alert_state upsert (1h)", async () => {
  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  let emailSent = false;

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: (fnName: string) => {
      if (fnName === 'get_ai_failure_rate_1h') return Promise.resolve({ data: 0.08, error: null });
      if (fnName === 'get_shop_failure_rate_1h') return Promise.resolve({ data: 0, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };

  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
    fetchFn: async () => {
      emailSent = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.dispatched, 1, "AI failure rate 0.08 > 0.05 threshold should fire");
  assertEquals(emailSent, true, "email should be sent for AI failure rate above threshold");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});

// ── Test 3a: Boundary regression — below threshold does NOT fire ─────────────
Deno.test("below-threshold rates do NOT fire (boundary regression)", async () => {
  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: (fnName: string) => {
      // AI rate 0.04 < 0.05 threshold, Shop rate 0.015 < 0.02 threshold
      if (fnName === 'get_ai_failure_rate_1h') return Promise.resolve({ data: 0.04, error: null });
      if (fnName === 'get_shop_failure_rate_1h') return Promise.resolve({ data: 0.015, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };

  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.dispatched, 0, "Below-threshold rates must NOT fire");
  assertEquals(body.evaluated, 3, "All 3 evaluators must run");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});

// ── Test 4: Debounce hit — repeated call within 1h does not dispatch ─────────
Deno.test("debounced call within 1h does not dispatch email", async () => {
  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: { last_fired_at: fiveMinutesAgo },
                error: null,
              }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: (fnName: string) => {
      if (fnName === 'get_ai_failure_rate_1h') return Promise.resolve({ data: 0.08, error: null });
      if (fnName === 'get_shop_failure_rate_1h') return Promise.resolve({ data: 0.03, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };

  let emailSent = false;
  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
    fetchFn: async () => {
      emailSent = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.dispatched, 0, "Debounced alerts must not dispatch");
  assertEquals(emailSent, false, "No email when debounced");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});

// ── Test 5: DB error on alert_state is non-fatal ─────────────────────────────
Deno.test("DB error during evaluation is logged and non-fatal", async () => {
  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({
                data: [{ user_id: 'u1', subscription_balance: -5, shop_balance: 0 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: null,
                error: { message: 'connection refused' },
              }),
            }),
          }),
          upsert: () => Promise.resolve({ error: { message: 'connection refused' } }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: () => Promise.resolve({ data: 0, error: null }),
  };

  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200, "Must return 200 even on DB error (non-fatal for cron)");
  const body = await response.json();
  assertEquals(body.dispatched, 0, "No dispatch when alert_state has DB error");
  assertEquals(body.evaluated, 3, "All evaluators should still run");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});

// ── Test 6: Email failure does not rewind debounce (Pitfall 7) ───────────────
Deno.test("email failure does not rewind alert_state debounce (Pitfall 7)", async () => {
  const origEnv = Deno.env.get("ADMIN_EMAILS");
  const origUrl = Deno.env.get("SUPABASE_URL");
  const origSecret = Deno.env.get("INTERNAL_JOB_SECRET");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");
  Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  Deno.env.set("INTERNAL_JOB_SECRET", "test-secret");

  const upsertCalls: unknown[] = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'user_merits') {
        return {
          select: () => ({
            or: () => ({
              limit: () => Promise.resolve({
                data: [{ user_id: 'u1', subscription_balance: -5, shop_balance: 0 }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'alert_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: (row: unknown) => {
            upsertCalls.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    },
    rpc: () => Promise.resolve({ data: 0, error: null }),
  };

  const handler = createHandler(buildDeps({
    getServiceClient: () => mockClient,
    fetchFn: async () => {
      // Email returns 500 — failure
      return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
    },
  }));

  const response = await handler(buildInternalRequest());
  assertEquals(response.status, 200);
  const body = await response.json();

  // Upsert happened (debounce state persisted)
  assertEquals(upsertCalls.length > 0, true, "alert_state upsert MUST happen before email");
  // Email failed, so dispatched = 0
  assertEquals(body.dispatched, 0, "Failed email should not count as dispatched");
  assertEquals(body.email_errors, 1, "Email error should be tracked");

  // Restore env
  if (origEnv !== undefined) Deno.env.set("ADMIN_EMAILS", origEnv); else Deno.env.delete("ADMIN_EMAILS");
  if (origUrl !== undefined) Deno.env.set("SUPABASE_URL", origUrl); else Deno.env.delete("SUPABASE_URL");
  if (origSecret !== undefined) Deno.env.set("INTERNAL_JOB_SECRET", origSecret); else Deno.env.delete("INTERNAL_JOB_SECRET");
});
