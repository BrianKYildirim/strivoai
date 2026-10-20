/**
 * Deno tests for reset-subscription-merits/index.ts — Phase 12 Plan 05 Task 1.
 *
 * GREEN: Plan 05 implements `./index.ts` with `handleResetSubscriptionMerits`.
 * These tests inject a fake supabase client (array-backed builder) and a fake
 * `requireAuth` to drive the handler without touching real network/auth.
 *
 * Coverage (one-to-one with plan 12-05 truths):
 *
 *  (a) internal-secret-required        — auth gate: requireAuth throws → 401
 *  (b) batch-due-users                  — happy path: 3 due rows, all rpc ok
 *  (c) empty-queue-returns-zero         — no due rows: zero counts and zero remaining
 *  (d) rpc-error-increments-errors-count — partial failure: errors counted, loop continues
 *
 * Run with:
 *   deno test --allow-env --allow-read --allow-net --no-check \
 *     supabase/functions/reset-subscription-merits/index.test.ts
 */
import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleResetSubscriptionMerits } from "./index.ts";

function setTestEnv(): void {
  Deno.env.set("INTERNAL_JOB_SECRET", "internal_secret_test_abc123");
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service_role_test_key");
}

function clearEnv(): void {
  for (
    const k of [
      "INTERNAL_JOB_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) Deno.env.delete(k);
}

// ── Fake supabase client ─────────────────────────────────────────────────────
//
// The handler issues exactly this query chain:
//
//   supabase
//     .from("user_merits")
//     .select(...)
//     .lte("subscription_reset_date", nowIso)
//     .in("profiles.subscription_tier", ["pro","elite"])
//     .limit(BATCH_SIZE);
//
// followed by N calls to:
//
//   supabase.rpc("reset_subscription_merits", { p_user_id, p_tier, p_next_reset_date });
//
// Tests pass a `dueRows` payload and an optional `rpcErrorForUserId` to model
// per-user RPC failures.

interface FakeRow {
  user_id: string;
  subscription_reset_date: string;
  profiles: { subscription_tier: "free" | "pro" | "elite" };
}

interface FakeSupabaseOpts {
  dueRows?: FakeRow[];
  selectError?: { code: string } | null;
  // Map of user_id → rpc error to return for that user (others succeed).
  rpcErrors?: Record<string, { code: string }>;
}

interface FakeRpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function createFakeSupabase(opts: FakeSupabaseOpts = {}) {
  const dueRows: FakeRow[] = opts.dueRows ?? [];
  const rpcErrors = opts.rpcErrors ?? {};
  const rpcCalls: FakeRpcCall[] = [];

  // The query builder is a single object whose chained methods all return
  // `this` until `.limit()` resolves to the final {data,error} promise.
  function buildQuery() {
    const q: Record<string, unknown> = {};
    q.select = (_cols: string) => q;
    q.lte = (_col: string, _val: string) => q;
    q.in = (_col: string, _vals: string[]) => q;
    q.limit = (_n: number) =>
      Promise.resolve(
        opts.selectError
          ? { data: null, error: opts.selectError }
          : { data: dueRows, error: null },
      );
    return q;
  }

  return {
    rpcCalls,
    from(_table: string) {
      return buildQuery();
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      const userId = String(args.p_user_id);
      const err = rpcErrors[userId];
      if (err) return Promise.resolve({ error: err });
      return Promise.resolve({ error: null });
    },
  };
}

// Fake `requireAuth` that always succeeds — auth gate is exercised by the
// `internal-secret-required` test which injects a throwing version instead.
const passingRequireAuth = () => Promise.resolve(null);

// ── Tests ────────────────────────────────────────────────────────────────────

Deno.test("internal-secret-required", async () => {
  setTestEnv();
  try {
    assertEquals(typeof handleResetSubscriptionMerits, "function");

    const fakeSupabase = createFakeSupabase({ dueRows: [] });
    const throwingAuth = () => {
      throw new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    };

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "manual" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: throwingAuth,
    });

    assertEquals(res.status, 401);
    // Should not have queried anything when auth fails.
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("batch-due-users", async () => {
  setTestEnv();
  try {
    assertEquals(typeof handleResetSubscriptionMerits, "function");

    const dueRows: FakeRow[] = [
      {
        user_id: "user-1",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "pro" },
      },
      {
        user_id: "user-2",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "elite" },
      },
      {
        user_id: "user-3",
        subscription_reset_date: "2026-04-14T12:00:00.000Z",
        profiles: { subscription_tier: "pro" },
      },
    ];

    const fakeSupabase = createFakeSupabase({ dueRows });

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "pg_cron" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 3);
    assertEquals(body.errors, 0);
    assertEquals(body.remaining, 0);
    assertEquals(body.batch_size, 3);

    // RPC called once per user with the right payload shape.
    assertEquals(fakeSupabase.rpcCalls.length, 3);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-1");
    // Pro is a legacy stored tier; the handler applies normalizeActiveTier()
    // (index.ts:90) which collapses pro -> elite (Pro users get the Elite
    // allowance), so the RPC receives "elite" for a stored-pro row. Reconciled
    // stale assertion (was "pro") — same Pro->Elite collapse 01-01 reconciled
    // in tier-config.test.ts; source unchanged.
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "elite");
    assertEquals(
      fakeSupabase.rpcCalls[0].args.p_next_reset_date,
      "2026-05-15T00:00:00.000Z",
    );
    assertEquals(fakeSupabase.rpcCalls[1].args.p_user_id, "user-2");
    assertEquals(fakeSupabase.rpcCalls[1].args.p_tier, "elite");
    assertEquals(
      fakeSupabase.rpcCalls[1].args.p_next_reset_date,
      "2026-05-15T00:00:00.000Z",
    );
    assertEquals(fakeSupabase.rpcCalls[2].args.p_user_id, "user-3");
    assertEquals(
      fakeSupabase.rpcCalls[2].args.p_next_reset_date,
      "2026-05-14T12:00:00.000Z",
    );
  } finally {
    clearEnv();
  }
});

Deno.test("empty-queue-returns-zero", async () => {
  setTestEnv();
  try {
    assertEquals(typeof handleResetSubscriptionMerits, "function");

    const fakeSupabase = createFakeSupabase({ dueRows: [] });

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "pg_cron" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 0);
    assertEquals(body.errors, 0);
    assertEquals(body.remaining, 0);
    assertEquals(body.batch_size, 0);
    assertEquals(fakeSupabase.rpcCalls.length, 0);
  } finally {
    clearEnv();
  }
});

Deno.test("rpc-error-increments-errors-count", async () => {
  setTestEnv();
  try {
    assertEquals(typeof handleResetSubscriptionMerits, "function");

    const dueRows: FakeRow[] = [
      {
        user_id: "user-1",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "pro" },
      },
      {
        user_id: "user-2",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "elite" },
      },
      {
        user_id: "user-3",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "pro" },
      },
    ];

    const fakeSupabase = createFakeSupabase({
      dueRows,
      rpcErrors: { "user-2": { code: "P0001" } },
    });

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "pg_cron" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 2);
    assertEquals(body.errors, 1);
    assertEquals(body.remaining, 0);
    assertEquals(body.batch_size, 3);
    // Loop continued past user-2 failure and still processed user-3.
    assertEquals(fakeSupabase.rpcCalls.length, 3);
    assertEquals(fakeSupabase.rpcCalls[2].args.p_user_id, "user-3");
  } finally {
    clearEnv();
  }
});

// Phase 30 Plan 01 Task 4 (D-07): Free tier is now part of the cron sweep.
// Mirrors the batch-due-users pattern; the additional assertions on
// p_tier === "free" and the one-month-advance of p_next_reset_date verify
// that (1) the widened `.in("profiles.subscription_tier", [...])` filter
// surfaces Free rows, (2) the RPC dispatch passes the Free tier through to
// the new `WHEN 'free' THEN 10` arm in reset_subscription_merits, and
// (3) `addOneMonthIso` (shared with Pro/Elite) advances the reset date.
Deno.test("free-tier-reset-arm", async () => {
  setTestEnv();
  try {
    assertEquals(typeof handleResetSubscriptionMerits, "function");

    const dueRows: FakeRow[] = [
      {
        user_id: "free-user-1",
        subscription_reset_date: "2026-04-15T00:00:00.000Z",
        profiles: { subscription_tier: "free" },
      },
    ];

    const fakeSupabase = createFakeSupabase({ dueRows });

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "pg_cron" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 1);
    assertEquals(body.errors, 0);
    assertEquals(body.remaining, 0);
    assertEquals(body.batch_size, 1);

    // RPC dispatched with p_tier = "free" (proves the widened filter and the
    // new Free arm are wired end-to-end).
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "free-user-1");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "free");
    // addOneMonthIso advances 2026-04-15 → 2026-05-15.
    assertEquals(
      fakeSupabase.rpcCalls[0].args.p_next_reset_date,
      "2026-05-15T00:00:00.000Z",
    );
  } finally {
    clearEnv();
  }
});
