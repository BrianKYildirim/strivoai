/**
 * Phase 13 Plan 04 — admin-merit-metrics edge function tests.
 * REQ-IDs: NFR-10
 * Covers: T-13-AUTH1 dual admin gate, T-13-AUTH2 anon rejection, aggregate shape.
 * Run with: deno test admin-merit-metrics/index.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Test helpers: build mock Supabase service client ─────────────────────────

interface MockQueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

function buildMockServiceClient(overrides?: {
  viewResults?: Record<string, MockQueryResult>;
  profileResult?: { data: { email: string } | null; error: null };
  userRolesResult?: { data: { role: string } | null; error: null };
}) {
  const defaultViewResult: MockQueryResult = { data: [], error: null };
  const viewResults = overrides?.viewResults ?? {};
  const profileResult = overrides?.profileResult ?? { data: { email: 'admin@test.com' }, error: null };
  const userRolesResult = overrides?.userRolesResult ?? { data: null, error: null };

  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: () => Promise.resolve(profileResult),
            }),
          }),
        };
      }
      if (table === 'user_roles') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              eq: (_col2: string, _val2: string) => ({
                maybeSingle: () => Promise.resolve(userRolesResult),
              }),
            }),
          }),
        };
      }
      // View tables
      return {
        select: (_cols: string) => Promise.resolve(viewResults[table] ?? defaultViewResult),
      };
    },
  };
}

// ── Import the handler factory for testing ───────────────────────────────────
// We test via the createHandler export that accepts injectable dependencies.

type CreateHandlerFn = (deps: {
  getServiceClient: () => unknown;
  requireAuth: (req: Request, opts: { type: string }) => Promise<{ userId: string; email: string; tier: string } | null>;
}) => (req: Request) => Promise<Response>;

let createHandler: CreateHandlerFn;

// Dynamic import to handle module resolution
const mod = await import("./index.ts");
createHandler = mod.createHandler;

// ── Test 1: Unauthenticated request returns 401 ─────────────────────────────
Deno.test("unauthenticated request returns 401", async () => {
  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient(),
    requireAuth: async () => {
      throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    },
  });

  const req = new Request("http://localhost/admin-merit-metrics", { method: "GET" });
  let response: Response;
  try {
    response = await handler(req);
  } catch (e) {
    // requireAuth throws Response for 401
    response = e as Response;
  }
  assertEquals(response.status, 401);
});

// ── Test 2: Non-admin email returns 403 ──────────────────────────────────────
Deno.test("non-admin email receives 403 forbidden", async () => {
  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient({
      profileResult: { data: { email: 'nobody@example.com' }, error: null },
      userRolesResult: { data: null, error: null },
    }),
    requireAuth: async () => ({ userId: 'user-123', email: 'nobody@example.com', tier: 'free' }),
  });

  // Set ADMIN_EMAILS to a specific admin
  const origEmails = Deno.env.get("ADMIN_EMAILS");
  Deno.env.set("ADMIN_EMAILS", "real-admin@test.com");

  const req = new Request("http://localhost/admin-merit-metrics", { method: "GET" });
  const response = await handler(req);

  assertEquals(response.status, 403);
  const body = await response.json();
  assertEquals(body.error, "forbidden");

  // Restore
  if (origEmails !== undefined) Deno.env.set("ADMIN_EMAILS", origEmails);
  else Deno.env.delete("ADMIN_EMAILS");
});

// ── Test 3: Admin via ADMIN_EMAILS env returns 200 with 4 aggregate keys ────
Deno.test("admin email receives aggregate of 4 views", async () => {
  const origEmails = Deno.env.get("ADMIN_EMAILS");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");

  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient({
      profileResult: { data: { email: 'admin@test.com' }, error: null },
      viewResults: {
        v_merits_in_circulation: { data: [{ tier: 'free', user_count: 5 }], error: null },
        v_feature_consumption_daily: { data: [{ day: '2026-04-16' }], error: null },
        v_shop_purchases_daily: { data: [], error: null },
        v_conversion_funnel: { data: [], error: null },
      },
    }),
    requireAuth: async () => ({ userId: 'admin-id', email: 'admin@test.com', tier: 'elite' }),
  });

  const req = new Request("http://localhost/admin-merit-metrics", { method: "GET" });
  const response = await handler(req);

  assertEquals(response.status, 200);
  const body = await response.json();

  // All four aggregate keys must be present
  assertExists(body.merits_in_circulation, "merits_in_circulation key missing");
  assertExists(body.feature_consumption, "feature_consumption key missing");
  assertExists(body.shop_purchases, "shop_purchases key missing");
  assertExists(body.conversion_funnel, "conversion_funnel key missing");

  // Verify shape
  assertEquals(Array.isArray(body.merits_in_circulation), true);
  assertEquals(Array.isArray(body.feature_consumption), true);
  assertEquals(Array.isArray(body.shop_purchases), true);
  assertEquals(Array.isArray(body.conversion_funnel), true);

  if (origEmails !== undefined) Deno.env.set("ADMIN_EMAILS", origEmails);
  else Deno.env.delete("ADMIN_EMAILS");
});

// ── Test 4: Admin via user_roles fallback (ADMIN_EMAILS unset) returns 200 ──
Deno.test("admin via user_roles fallback receives 200", async () => {
  const origEmails = Deno.env.get("ADMIN_EMAILS");
  Deno.env.delete("ADMIN_EMAILS");

  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient({
      profileResult: { data: { email: 'role-admin@test.com' }, error: null },
      userRolesResult: { data: { role: 'admin' }, error: null },
    }),
    requireAuth: async () => ({ userId: 'admin-id', email: 'role-admin@test.com', tier: 'pro' }),
  });

  const req = new Request("http://localhost/admin-merit-metrics", { method: "GET" });
  const response = await handler(req);

  assertEquals(response.status, 200);
  const body = await response.json();
  assertExists(body.merits_in_circulation);
  assertExists(body.feature_consumption);
  assertExists(body.shop_purchases);
  assertExists(body.conversion_funnel);

  if (origEmails !== undefined) Deno.env.set("ADMIN_EMAILS", origEmails);
  else Deno.env.delete("ADMIN_EMAILS");
});

// ── Test 5: Service client error on view returns 500 ─────────────────────────
Deno.test("view read error returns 500 metrics-unavailable", async () => {
  const origEmails = Deno.env.get("ADMIN_EMAILS");
  Deno.env.set("ADMIN_EMAILS", "admin@test.com");

  const handler = createHandler({
    getServiceClient: () => buildMockServiceClient({
      profileResult: { data: { email: 'admin@test.com' }, error: null },
      viewResults: {
        v_merits_in_circulation: { data: null, error: { message: 'relation does not exist' } },
        v_feature_consumption_daily: { data: [], error: null },
        v_shop_purchases_daily: { data: [], error: null },
        v_conversion_funnel: { data: [], error: null },
      },
    }),
    requireAuth: async () => ({ userId: 'admin-id', email: 'admin@test.com', tier: 'elite' }),
  });

  const req = new Request("http://localhost/admin-merit-metrics", { method: "GET" });
  const response = await handler(req);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, "metrics-unavailable");

  if (origEmails !== undefined) Deno.env.set("ADMIN_EMAILS", origEmails);
  else Deno.env.delete("ADMIN_EMAILS");
});
