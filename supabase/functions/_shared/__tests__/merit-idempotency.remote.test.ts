/**
 * Quick task 260723-2b0 · Task 7 — `check_and_deduct_merits` idempotency contract,
 * against REAL Postgres (LOCKED verification 1).
 *
 * WHY THIS FILE EXISTS. `20260512000003_merit_transactions_idempotency.sql` ships three
 * mechanisms that protect the money path, and NONE of them had an automated test against a
 * live database — the migration's own `DO $$` block (`:261-277`) was the only proof:
 *
 *   - the partial unique index (`:62-64`,
 *     `WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL`),
 *   - the entry-time `already_deducted` pre-check (`:118-133`),
 *   - the `EXCEPTION WHEN unique_violation` race absorber (`:196-212`).
 *
 * These are exactly the mechanisms that stop a retry from charging twice. They are also
 * plpgsql — no amount of Deno-side mocking exercises them. Hence a remote lane test.
 *
 * `MERIT_SYSTEM_ENABLED` IS IRRELEVANT HERE. This suite calls the RPC directly with a
 * service-role client; it never routes through `_shared/merit-gateway.ts`, whose
 * module-scope flag read (`merit-gateway.ts:37-38`) is what that env var gates. Service
 * role is the correct actor: this tests the RPC CONTRACT, not RLS.
 *
 * ─── WHERE THE SPLIT-DEDUCTION CASE WENT (read before adding one back here) ───────────
 *
 * This file originally carried a fifth case that CHARACTERIZED the pre-fix behavior of a
 * split deduction carrying a non-NULL idempotency key (D-7b). It was run against preview
 * and observed EXACTLY the predicted shape:
 *
 *     already_deducted: true,   transaction_id: null,
 *     ZERO merit_transactions rows for the key,   balances UNCHANGED.
 *
 * The counter-intuitive part — ZERO ledger rows, not one — is the signature of the second
 * leg's 23505 aborting the enclosing `BEGIN ... EXCEPTION` SUBTRANSACTION and discarding
 * the first leg's INSERT along with it. Via `merit-gateway.ts:256-263`'s WR-03 null guard
 * the caller-visible outcome was `500 merit_system_error` with the analysis never running:
 * NOT a free run, but a hard outage for any user whose subscription_balance sat between 1
 * and cost-1 while shop_balance covered the remainder.
 *
 * That observation is what justified the composite `(idempotency_key, balance_type)` index
 * in `20260723000002_merit_refund_aware_idempotency.sql`. Once that migration landed the
 * defect was fixed, so a test pinning the broken shape necessarily goes RED — it had
 * served its purpose and was retired. The PERMANENT guard for the corrected behavior is
 * `merit-refund-replay.remote.test.ts` case 4 ("SPLIT deduction now charges the FULL
 * cost"). Do not re-add a pre-fix case here.
 *
 * Deduct → refund → replay is likewise NOT a case here: it belongs to
 * `merit-refund-replay.remote.test.ts`, which both fixes that behavior and owns the
 * permanent assertion in both directions.
 */
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  freshClient,
  requireRemoteConfig,
  skipRemote,
} from "./history-persistence-remote.ts";

const FEATURE = "resume_analysis";
const TIER = "elite";
const USER_EMAIL_PREFIX = "merit-idem-fixture";

// ── per-case fixture plumbing ──────────────────────────────────────────────────────────
//
// A fresh user PER CASE, not per file. These cases assert on absolute balances and on
// exact ledger row counts scoped to a user, so a shared user would make every case
// order-dependent and every failure ambiguous. Provisioning is cheap next to the
// diagnostic value.

async function adminFetch(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = requireRemoteConfig();
  return await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

interface Balances {
  subscription: number;
  shop: number;
}

interface CaseUser {
  userId: string;
  // deno-lint-ignore no-explicit-any
  client: any;
}

/** Create a preview user with the exact seeded balances the case needs, or THROW. */
async function provisionUser(seed: Balances): Promise<CaseUser> {
  const client = await freshClient();
  const email = `${USER_EMAIL_PREFIX}+${crypto.randomUUID()}@strivo.test`;
  const password = `Fx!${crypto.randomUUID()}`;

  const created = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) {
    const status = created.status;
    await created.body?.cancel();
    throw new Error(`MERIT FIXTURE FAILED: could not create the fixture user (HTTP ${status}).`);
  }
  const userId = (await created.json()).id as string;
  if (!userId) throw new Error("MERIT FIXTURE FAILED: the admin API returned no user id.");

  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: userId, email, subscription_tier: TIER }, { onConflict: "id" });
  if (profileError) {
    throw new Error(`MERIT FIXTURE FAILED: could not set the fixture profile: ${profileError.message}`);
  }

  // A signup trigger (20260517000000_merit_free_signup_grant.sql) may already have granted
  // a free-tier balance. Upsert so the seeded values are EXACT, never additive — a case
  // that asserts "balance dropped by exactly one cost" cannot tolerate a surprise grant.
  const { error: meritsError } = await client
    .from("user_merits")
    .upsert(
      { user_id: userId, subscription_balance: seed.subscription, shop_balance: seed.shop },
      { onConflict: "user_id" },
    );
  if (meritsError) {
    throw new Error(`MERIT FIXTURE FAILED: could not seed user_merits: ${meritsError.message}`);
  }

  // Read the seed back and prove it took. `auto_provision_user_merits`
  // (20260517000000) fires AFTER INSERT ON profiles and grants 10 merits; it is
  // ON CONFLICT DO NOTHING so it cannot overwrite the seed, but a fixture that
  // silently starts from the wrong balance turns every delta assertion below into a
  // confusing mid-test failure. Fail HERE, loudly, where the cause is obvious.
  const { data: seeded, error: readbackError } = await client
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", userId)
    .single();
  if (readbackError) {
    throw new Error(`MERIT FIXTURE FAILED: could not read back user_merits: ${readbackError.message}`);
  }
  if (
    seeded.subscription_balance !== seed.subscription ||
    seeded.shop_balance !== seed.shop
  ) {
    throw new Error(
      `MERIT FIXTURE FAILED: seeded balances did not take. Wanted ` +
        `{subscription:${seed.subscription}, shop:${seed.shop}}, got ` +
        `{subscription:${seeded.subscription_balance}, shop:${seeded.shop_balance}}.`,
    );
  }

  return { userId, client };
}

/**
 * Delete the auth user. `profiles.id` cascades to `user_merits` and `merit_transactions`
 * (both `REFERENCES public.profiles(id) ON DELETE CASCADE`), so this single delete is the
 * complete cleanup. Never throws — a cleanup failure must not mask the case's own result.
 */
async function cleanupUser(userId: string): Promise<void> {
  try {
    const removed = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    await removed.body?.cancel();
  } catch {
    // Housekeeping, not a gate.
  }
}

/** Run a case against a freshly provisioned user, cleaning up unconditionally. */
async function withUser(seed: Balances, fn: (u: CaseUser) => Promise<void>): Promise<void> {
  const user = await provisionUser(seed);
  try {
    await fn(user);
  } finally {
    await cleanupUser(user.userId);
  }
}

// deno-lint-ignore no-explicit-any
async function deduct(client: any, userId: string, key: string | null): Promise<any> {
  const { data, error } = await client.rpc("check_and_deduct_merits", {
    p_user_id: userId,
    p_feature: FEATURE,
    p_tier: TIER,
    p_idempotency_key: key,
  });
  if (error) throw new Error(`check_and_deduct_merits failed: ${error.message}`);
  return data;
}

/** The configured cost, read from the source of truth rather than hardcoded. */
// deno-lint-ignore no-explicit-any
async function featureCost(client: any): Promise<number> {
  const { data, error } = await client
    .from("merit_feature_costs")
    .select("cost")
    .eq("feature", FEATURE)
    .eq("tier", TIER)
    .single();
  if (error) throw new Error(`could not read merit_feature_costs: ${error.message}`);
  return data.cost as number;
}

// deno-lint-ignore no-explicit-any
async function balances(client: any, userId: string): Promise<Balances> {
  const { data, error } = await client
    .from("user_merits")
    .select("subscription_balance, shop_balance")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`could not read user_merits: ${error.message}`);
  return { subscription: data.subscription_balance, shop: data.shop_balance };
}

/** Every `feature-deduct` row carrying this idempotency key, oldest first. */
// deno-lint-ignore no-explicit-any
async function deductRowsForKey(client: any, userId: string, key: string): Promise<any[]> {
  const { data, error } = await client
    .from("merit_transactions")
    .select("id, amount, balance_type, source, metadata, idempotency_key")
    .eq("user_id", userId)
    .eq("source", "feature-deduct")
    .eq("idempotency_key", key)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`could not read merit_transactions: ${error.message}`);
  return data ?? [];
}

// deno-lint-ignore no-explicit-any
async function allDeductRows(client: any, userId: string): Promise<any[]> {
  const { data, error } = await client
    .from("merit_transactions")
    .select("id, amount, balance_type, metadata, idempotency_key")
    .eq("user_id", userId)
    .eq("source", "feature-deduct");
  if (error) throw new Error(`could not read merit_transactions: ${error.message}`);
  return data ?? [];
}

// ── Case 1 ─────────────────────────────────────────────────────────────────────────────
Deno.test("merit idempotency: same key twice (sequential) deducts exactly ONCE", async () => {
  if (skipRemote("merit-idempotency case 1")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);
    const key = `idem-seq-${crypto.randomUUID()}`;

    const first = await deduct(client, userId, key);
    assertEquals(first.success, true, "first call must succeed");
    assert(!first.already_deducted, "first call must NOT be flagged already_deducted");
    assertExists(first.transaction_id, "first call must return a deduction handle");

    const second = await deduct(client, userId, key);
    assertEquals(second.success, true);
    assertEquals(second.already_deducted, true, "the replay MUST short-circuit");
    assertEquals(
      second.transaction_id,
      first.transaction_id,
      "the replay must hand back the ORIGINAL deduction_id — it is the refund handle",
    );

    const after = await balances(client, userId);
    assertEquals(
      after.subscription,
      before.subscription - cost,
      "balance must drop by exactly ONE feature cost across both calls",
    );
    assertEquals(after.shop, before.shop);

    const rows = await deductRowsForKey(client, userId, key);
    assertEquals(rows.length, 1, "exactly one feature-deduct row may exist for the key");
  });
});

// ── Case 2 ─────────────────────────────────────────────────────────────────────────────
Deno.test("merit idempotency: DIFFERENT keys deduct independently (the index is not over-broad)", async () => {
  if (skipRemote("merit-idempotency case 2")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);
    const keyA = `idem-a-${crypto.randomUUID()}`;
    const keyB = `idem-b-${crypto.randomUUID()}`;

    const a = await deduct(client, userId, keyA);
    const b = await deduct(client, userId, keyB);

    assert(!a.already_deducted && !b.already_deducted, "distinct keys must both charge");
    assert(
      a.transaction_id !== b.transaction_id,
      "distinct keys must produce distinct deduction handles",
    );

    const after = await balances(client, userId);
    assertEquals(
      after.subscription,
      before.subscription - 2 * cost,
      "two distinct keys must drop the balance by 2x the cost",
    );
    assertEquals((await deductRowsForKey(client, userId, keyA)).length, 1);
    assertEquals((await deductRowsForKey(client, userId, keyB)).length, 1);
  });
});

// ── Case 3 ─────────────────────────────────────────────────────────────────────────────
Deno.test("merit idempotency: CONCURRENT same-key calls collapse to one charge (race absorber)", async () => {
  if (skipRemote("merit-idempotency case 3")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);
    const key = `idem-race-${crypto.randomUUID()}`;

    // The ONLY exercise anywhere of the `EXCEPTION WHEN unique_violation` arm at
    // 20260512000003:196-212. Sequential calls take the entry-time pre-check instead and
    // never reach it.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => deduct(client, userId, key)),
    );

    for (const r of results) {
      assertEquals(r.success, true, "no concurrent caller may return an error");
    }

    const winners = results.filter((r) => !r.already_deducted);
    assertEquals(winners.length, 1, "exactly ONE caller may win the race and charge");

    const handles = new Set(results.map((r) => r.transaction_id));
    assertEquals(handles.size, 1, "every caller must converge on the winner's deduction_id");

    const after = await balances(client, userId);
    assertEquals(
      after.subscription,
      before.subscription - cost,
      "five concurrent same-key calls must move the balance by exactly ONE cost",
    );
    assertEquals((await deductRowsForKey(client, userId, key)).length, 1);
  });
});

// ── Case 4 ─────────────────────────────────────────────────────────────────────────────
Deno.test("merit idempotency: NULL keys are deliberately NOT deduplicated", async () => {
  if (skipRemote("merit-idempotency case 4")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);

    // The partial index is `WHERE ... idempotency_key IS NOT NULL`, and the entry-time
    // pre-check is gated on `IF p_idempotency_key IS NOT NULL`. A NULL key means "the
    // caller supplied no identity", which must NEVER be read as "same request". This case
    // pins that asymmetry so a future migration cannot silently collapse NULL keys and
    // start swallowing legitimate second runs.
    const a = await deduct(client, userId, null);
    const b = await deduct(client, userId, null);

    assert(!a.already_deducted && !b.already_deducted, "NULL keys must never short-circuit");
    assert(a.transaction_id !== b.transaction_id, "NULL keys must produce distinct deductions");

    const after = await balances(client, userId);
    assertEquals(
      after.subscription,
      before.subscription - 2 * cost,
      "two NULL-key calls are two runs and must charge twice",
    );
    assertEquals((await allDeductRows(client, userId)).length, 2);
  });
});
