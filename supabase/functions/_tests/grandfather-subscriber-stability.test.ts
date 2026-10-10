/**
 * grandfather-subscriber-stability.test.ts — Phase 24 Plan 07 Task 2 (MIG-03 / D-20).
 *
 * D-20 CONTRACT: Subscribers on deprecated Stripe price IDs (STRIPE_PRICE_PRO_MONTHLY,
 * STRIPE_PRICE_ELITE_MONTHLY — the pre-Phase-24 monthly prices) keep receiving their
 * monthly merit refresh at their grandfathered entitlement (Pro=75, Elite=150) with
 * ZERO price-ID awareness in the reset pipeline.
 *
 * SC-13 ROOT INVARIANT: The merit refresh path (reset-subscription-merits) MUST NOT
 * inspect `stripe_price_id` to decide whether to credit monthly merits. It keys on
 * `subscription_tier` (read from profiles) and `subscription_reset_date` only.
 *
 * Tests verify the following regression guards are in place:
 *
 *   T1 (legacy-pro-monthly-refresh-still-works):
 *     A user on the legacy `STRIPE_PRICE_PRO_MONTHLY` price ID is refreshed to
 *     Pro=75 merits via the RPC. The handler never reads stripe_price_id.
 *
 *   T2 (shop-balance-preserved-across-reset):
 *     The reset path selects from `user_merits` by tier+reset_date only; the
 *     query projection MUST NOT include `shop_balance`. D-15 dual-balance spend
 *     ordering relies on shop_balance surviving the monthly reset untouched.
 *
 *   T3 (webhook-replay-for-legacy-price-does-not-double-credit):
 *     If `subscription_reset_date` has NOT advanced past `now()`, the handler
 *     skips the user — even though their legacy price ID remains in profiles.
 *     This proves the handler is idempotent on the date boundary, not on the
 *     price-ID boundary.
 *
 *   T4 (mixed-batch-new-and-legacy-users-both-credited):
 *     A single sweep containing one legacy-price Pro user and one new-price
 *     Elite user credits BOTH via the RPC, with no divergence of code paths.
 *
 * Run with:
 *   cd supabase/functions && deno test _tests/grandfather-subscriber-stability.test.ts --allow-env
 *
 * Requirements: MIG-03, AUDIT-01 (SC-13 §2 grandfathering snapshot).
 */
import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleResetSubscriptionMerits } from "../reset-subscription-merits/index.ts";

// ── Env helpers (mirror the sibling index.test.ts) ──────────────────────────

function setTestEnv(): void {
  Deno.env.set("INTERNAL_JOB_SECRET", "internal_secret_test_abc123");
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service_role_test_key");
  // D-20 grandfathered price IDs — the contract is that reset-subscription-merits
  // NEVER reads these values, but we set them to prove it still works if present.
  Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_OLD_PRO_MONTHLY");
  Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", "price_OLD_ELITE_MONTHLY");
}

function clearEnv(): void {
  for (
    const k of [
      "INTERNAL_JOB_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_ELITE_MONTHLY",
    ]
  ) Deno.env.delete(k);
}

// ── Fake supabase client (mirror pattern from reset-subscription-merits/index.test.ts) ──
//
// KEY GUARD: The fake records every column projection passed to .select() so we
// can assert that the handler never projects `stripe_price_id` or `shop_balance`
// out of user_merits/profiles in its reset query (D-20 + D-15).

interface FakeRow {
  user_id: string;
  subscription_reset_date: string;
  profiles: { subscription_tier: "pro" | "elite" };
}

interface FakeSupabaseOpts {
  dueRows?: FakeRow[];
  rpcErrors?: Record<string, { code: string }>;
}

interface FakeRpcCall {
  fn: string;
  args: Record<string, unknown>;
}

interface FakeSelectCapture {
  table: string;
  columns: string;
  lteColumn: string | null;
  inColumn: string | null;
  inValues: readonly string[] | null;
}

function createFakeSupabase(opts: FakeSupabaseOpts = {}) {
  const dueRows: FakeRow[] = opts.dueRows ?? [];
  const rpcErrors = opts.rpcErrors ?? {};
  const rpcCalls: FakeRpcCall[] = [];
  const selectCaptures: FakeSelectCapture[] = [];

  function buildQuery(table: string) {
    const capture: FakeSelectCapture = {
      table,
      columns: "",
      lteColumn: null,
      inColumn: null,
      inValues: null,
    };
    const q: Record<string, unknown> = {};
    q.select = (cols: string) => {
      capture.columns = cols;
      return q;
    };
    q.lte = (col: string, _val: string) => {
      capture.lteColumn = col;
      return q;
    };
    q.in = (col: string, vals: string[]) => {
      capture.inColumn = col;
      capture.inValues = vals;
      return q;
    };
    q.limit = (_n: number) => {
      selectCaptures.push(capture);
      return Promise.resolve({ data: dueRows, error: null });
    };
    return q;
  }

  return {
    rpcCalls,
    selectCaptures,
    from(table: string) {
      return buildQuery(table);
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

const passingRequireAuth = () => Promise.resolve(null);

// ── T1 ───────────────────────────────────────────────────────────────────────

Deno.test("legacy-pro-monthly-refresh-still-works", async () => {
  setTestEnv();
  try {
    // A single legacy Pro user whose subscription_reset_date has already
    // passed. In production this user's profiles.stripe_price_id would be
    // `price_OLD_PRO_MONTHLY` — but the reset handler never inspects that
    // column, so the fake row intentionally omits it to prove the contract.
    const legacyProUser: FakeRow = {
      user_id: "user-legacy-pro-001",
      subscription_reset_date: "2026-04-15T00:00:00.000Z",
      profiles: { subscription_tier: "pro" },
    };

    const fakeSupabase = createFakeSupabase({ dueRows: [legacyProUser] });

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

    // RPC fired with Pro tier — Phase 11 RPC credits MERITS_PER_MONTH.pro=75.
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-legacy-pro-001");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "pro");
    // Next reset is exactly one month later.
    assertEquals(
      fakeSupabase.rpcCalls[0].args.p_next_reset_date,
      "2026-05-15T00:00:00.000Z",
    );

    // D-20 INVARIANT: the SELECT projection must NOT include stripe_price_id.
    // If a future refactor adds price-ID-aware logic to reset-subscription-merits,
    // this assertion fails and flags the regression.
    assertEquals(fakeSupabase.selectCaptures.length, 1);
    const capture = fakeSupabase.selectCaptures[0];
    assertEquals(capture.table, "user_merits");
    assertEquals(
      capture.columns.includes("stripe_price_id"),
      false,
      "D-20: reset-subscription-merits must not project stripe_price_id",
    );
  } finally {
    clearEnv();
  }
});

// ── T2 ───────────────────────────────────────────────────────────────────────

Deno.test("shop-balance-preserved-across-reset", async () => {
  setTestEnv();
  try {
    // The handler selects from user_merits but does NOT read shop_balance —
    // that column is managed exclusively by add_shop_merits / spend_merits
    // (SC-7 dual-balance spend ordering). Projecting it here would be a
    // code smell signalling a forthcoming bug where reset overwrites shop
    // credit.
    const dueRows: FakeRow[] = [
      {
        user_id: "user-with-shop-credit-001",
        subscription_reset_date: "2026-04-10T00:00:00.000Z",
        profiles: { subscription_tier: "elite" },
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

    // SC-7 / D-15 INVARIANT: selection projection must NOT include shop_balance.
    // The Phase 11 reset_subscription_merits RPC is atomic and writes only
    // subscription_balance + subscription_reset_date. Shop balance survives.
    assertEquals(fakeSupabase.selectCaptures.length, 1);
    const capture = fakeSupabase.selectCaptures[0];
    assertEquals(
      capture.columns.includes("shop_balance"),
      false,
      "SC-7 / D-15: reset-subscription-merits must not touch shop_balance",
    );

    // Also assert the RPC payload only contains the three Phase 11 contract
    // arguments — any addition to the arg list is an API-change regression.
    assertEquals(fakeSupabase.rpcCalls.length, 1);
    const rpcArgs = fakeSupabase.rpcCalls[0].args;
    const argKeys = Object.keys(rpcArgs).sort();
    assertEquals(
      argKeys,
      ["p_next_reset_date", "p_tier", "p_user_id"],
      "Phase 11 RPC contract: exactly 3 args; any addition is a regression",
    );
  } finally {
    clearEnv();
  }
});

// ── T3 ───────────────────────────────────────────────────────────────────────

Deno.test("webhook-replay-for-legacy-price-does-not-double-credit", async () => {
  setTestEnv();
  try {
    // The query filters rows where subscription_reset_date <= now(). If a legacy
    // Pro user was already refreshed 2 minutes ago, their row's reset_date is
    // now in the FUTURE (advanced by the Phase 11 RPC), so the fake returns
    // zero due rows — simulating the real database filter. A replayed webhook
    // or duplicate pg_cron tick therefore produces zero RPC calls, zero merits
    // over-credited.
    const fakeSupabase = createFakeSupabase({ dueRows: [] });

    const req = new Request("https://test/reset-subscription-merits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invocation_source: "webhook" }),
    });

    const res = await handleResetSubscriptionMerits(req, {
      supabase: fakeSupabase,
      requireAuth: passingRequireAuth,
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, 0);
    assertEquals(body.errors, 0);
    assertEquals(body.batch_size, 0);
    // Zero RPC calls — idempotence is enforced by the date filter, NOT by
    // reading or comparing stripe_price_id.
    assertEquals(fakeSupabase.rpcCalls.length, 0);

    // And the date filter is on subscription_reset_date (not on any price-ID field).
    assertEquals(fakeSupabase.selectCaptures.length, 1);
    const capture = fakeSupabase.selectCaptures[0];
    assertEquals(capture.lteColumn, "subscription_reset_date");
  } finally {
    clearEnv();
  }
});

// ── T4 ───────────────────────────────────────────────────────────────────────

Deno.test("mixed-batch-new-and-legacy-users-both-credited", async () => {
  setTestEnv();
  try {
    // One legacy Pro user (would be on STRIPE_PRICE_PRO_MONTHLY in prod) and
    // one new-price Elite user (on whatever the post-Phase-24 monthly price is).
    // Both are refreshed identically — zero branching on price ID.
    const dueRows: FakeRow[] = [
      {
        user_id: "user-legacy-pro-002",
        subscription_reset_date: "2026-04-12T09:00:00.000Z",
        profiles: { subscription_tier: "pro" },
      },
      {
        user_id: "user-new-elite-003",
        subscription_reset_date: "2026-04-12T09:00:00.000Z",
        profiles: { subscription_tier: "elite" },
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
    assertEquals(body.processed, 2);
    assertEquals(body.errors, 0);
    assertEquals(body.batch_size, 2);

    // Both users traversed the exact same code path — 2 RPC calls, same fn,
    // differing only in (p_user_id, p_tier).
    assertEquals(fakeSupabase.rpcCalls.length, 2);
    assertEquals(fakeSupabase.rpcCalls[0].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[1].fn, "reset_subscription_merits");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_user_id, "user-legacy-pro-002");
    assertEquals(fakeSupabase.rpcCalls[0].args.p_tier, "pro");
    assertEquals(fakeSupabase.rpcCalls[1].args.p_user_id, "user-new-elite-003");
    assertEquals(fakeSupabase.rpcCalls[1].args.p_tier, "elite");

    // D-20 INVARIANT: exactly one .in() filter, on subscription_tier ∈ {pro, elite}.
    // NO filter on stripe_price_id — legacy and new price IDs both qualify.
    assertEquals(fakeSupabase.selectCaptures.length, 1);
    const capture = fakeSupabase.selectCaptures[0];
    assertEquals(capture.inColumn, "profiles.subscription_tier");
    assertEquals(capture.inValues, ["pro", "elite"]);
  } finally {
    clearEnv();
  }
});
