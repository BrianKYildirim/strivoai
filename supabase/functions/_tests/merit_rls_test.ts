/**
 * Phase 10 — Merit Ledger RLS denial tests (MER-04).
 *
 * These tests MUST run against a real Postgres (local `supabase start` or a
 * staging branch) because RLS cannot be faked. This is a deliberate departure
 * from the repo convention of colocated tests + fake supabase clients — the
 * test is not tied to a single edge function, so it lives in _tests/.
 *
 * Prerequisites:
 *   1. `supabase start` running locally OR SUPABASE_URL + SUPABASE_ANON_KEY
 *      pointing at a staging branch with the Phase 10 migration applied.
 *   2. TEST_USER_JWT exported — a valid JWT for a signed-in test user in that DB.
 *
 * Run with:
 *   deno test supabase/functions/_tests/merit_rls_test.ts --no-check --allow-env --allow-net
 *
 * Will skip with a clear message if prerequisites are missing so CI does not
 * red out when the migration is not yet deployed to the target environment.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const TEST_USER_JWT = Deno.env.get("TEST_USER_JWT") ?? "";

const hasPrereqs = SUPABASE_URL && SUPABASE_ANON_KEY && TEST_USER_JWT;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${TEST_USER_JWT}` } },
  });
}

function rlsDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // Postgres error code 42501 = insufficient_privilege (RLS denial surface)
  // PostgREST may also surface "new row violates row-level security policy"
  return (
    error.code === "42501" ||
    /row-level security/i.test(error.message ?? "") ||
    /permission denied/i.test(error.message ?? "")
  );
}

// NOTE: sanitizeOps/sanitizeResources disabled because @supabase/supabase-js v2
// creates an internal GoTrueClient auto-refresh interval that is not cleanable
// from user code (no public `dispose()`), so Deno's default leak sanitizer
// flags every test as FAILED even though the RLS assertions themselves pass.
// See Plan 10-04 SC-2 verification for the empirical 42501 responses.
const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

Deno.test({
  name: "MER-04: anon client INSERT into user_merits blocked by RLS",
  ...testOpts,
  fn: async () => {
    if (!hasPrereqs) {
      console.warn("[SKIP] SUPABASE_URL / SUPABASE_ANON_KEY / TEST_USER_JWT not set");
      return;
    }
    const supabase = client();
    const { data, error } = await supabase.from("user_merits").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      subscription_balance: 999,
      shop_balance: 0,
      lifetime_granted: 999,
    }).select();

    assert(error !== null, `Expected RLS denial, got data: ${JSON.stringify(data)}`);
    assert(
      rlsDenied(error),
      `Expected RLS denial error, got: ${error?.code} ${error?.message}`,
    );
  },
});

Deno.test({
  name: "MER-04: anon client UPDATE to user_merits blocked by RLS",
  ...testOpts,
  fn: async () => {
    if (!hasPrereqs) {
      console.warn("[SKIP] SUPABASE_URL / SUPABASE_ANON_KEY / TEST_USER_JWT not set");
      return;
    }
    const supabase = client();
    const { data, error } = await supabase
      .from("user_merits")
      .update({ subscription_balance: 9999 })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select();

    // UPDATE may return empty array instead of error if RLS filters rows;
    // either is acceptable denial evidence.
    if (error) {
      assert(rlsDenied(error), `Unexpected error: ${error.code} ${error.message}`);
    } else {
      assertEquals((data ?? []).length, 0, "RLS should have filtered all rows");
    }
  },
});

Deno.test({
  name: "MER-04: anon client DELETE from user_merits blocked by RLS",
  ...testOpts,
  fn: async () => {
    if (!hasPrereqs) {
      console.warn("[SKIP] SUPABASE_URL / SUPABASE_ANON_KEY / TEST_USER_JWT not set");
      return;
    }
    const supabase = client();
    const { data, error } = await supabase
      .from("user_merits")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .select();

    if (error) {
      assert(rlsDenied(error), `Unexpected error: ${error.code} ${error.message}`);
    } else {
      assertEquals((data ?? []).length, 0, "RLS should have filtered all rows");
    }
  },
});

Deno.test({
  name: "MER-04: anon client INSERT into merit_transactions blocked by RLS",
  ...testOpts,
  fn: async () => {
    if (!hasPrereqs) {
      console.warn("[SKIP] SUPABASE_URL / SUPABASE_ANON_KEY / TEST_USER_JWT not set");
      return;
    }
    const supabase = client();
    const { data, error } = await supabase.from("merit_transactions").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      amount: 9999,
      balance_type: "grant",
      source: "client-forged",
      metadata: {},
    }).select();

    assert(error !== null, `Expected RLS denial, got data: ${JSON.stringify(data)}`);
    assert(
      rlsDenied(error),
      `Expected RLS denial error, got: ${error?.code} ${error?.message}`,
    );
  },
});

Deno.test({
  name: "MER-04: anon client INSERT into merit_shop_purchases blocked by RLS",
  ...testOpts,
  fn: async () => {
    if (!hasPrereqs) {
      console.warn("[SKIP] SUPABASE_URL / SUPABASE_ANON_KEY / TEST_USER_JWT not set");
      return;
    }
    const supabase = client();
    const { data, error } = await supabase.from("merit_shop_purchases").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      pack_size: 3,
      price_cents: 1,
      stripe_payment_intent_id: "pi_forged_test",
      status: "succeeded",
    }).select();

    assert(error !== null, `Expected RLS denial, got data: ${JSON.stringify(data)}`);
    assert(
      rlsDenied(error),
      `Expected RLS denial error, got: ${error?.code} ${error?.message}`,
    );
  },
});
