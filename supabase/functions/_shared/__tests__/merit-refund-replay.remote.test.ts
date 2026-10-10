/**
 * Quick task 260723-2b0 · Task 7b (D-7, LOCKED) — refund-aware idempotency, proven
 * against REAL Postgres, in BOTH directions.
 *
 * `20260723000002_merit_refund_aware_idempotency.sql` closes two live defects on the
 * money path, for EVERY feature routed through `withMerits`:
 *
 *   BUG 1 — the refund/replay hole. `refund_merits` used to leave the original
 *   `feature-deduct` row (and its `idempotency_key`) intact, and the entry-time
 *   pre-check never consulted refund state. So a refunded attempt whose key was
 *   replayed returned `already_deducted:true` and charged ZERO — a free run,
 *   indefinitely repeatable, reachable by accident on any transient failure the user
 *   refreshes through. Observed live before the fix:
 *     deduct(K) 30->27, refund(T) 27->30, deduct(K) again -> already_deducted, 30->30.
 *
 *   BUG 2 — the split-deduction collision (D-7b). See
 *   `merit-idempotency.remote.test.ts` case 5, which characterizes the pre-fix
 *   behavior: a split deduction with a non-NULL key wrote ZERO ledger rows and
 *   returned `{success:true, transaction_id:null}`, which `merit-gateway.ts:256-263`
 *   turns into `500 merit_system_error` — BLOCKING the feature outright for any user
 *   whose subscription_balance sits between 1 and cost-1 while shop_balance covers the
 *   remainder.
 *
 * THE HARD PART IS NOT BREAKING THE THING THAT WORKED. Case 1 is the regression guard
 * CONTEXT.md names explicitly: same key, no refund, must STILL charge exactly once.
 *
 * CROSS-CUTTING: every `check_and_deduct_merits` response in this file goes through
 * `assertNeverSuccessWithNullHandle`. `success:true` with a null `transaction_id` is a
 * corrupt contract that has already bitten this codebase once (BUG 2), and Section 4's
 * new filtered lookup in the `unique_violation` arm created a fresh way to reach it
 * (a concurrent refund stamping the winner's legs mid-race) — which is why that arm
 * now falls back to an unfiltered lookup and RAISEs rather than returning null.
 *
 * `MERIT_SYSTEM_ENABLED` is irrelevant here: this calls the RPCs directly with a
 * service-role client and never routes through the gateway's module-scope flag.
 */
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  freshClient,
  requireRemoteConfig,
  skipRemote,
} from "./history-persistence-remote.ts";

const FEATURE = "resume_analysis";
const TIER = "elite";
const USER_EMAIL_PREFIX = "merit-refund-fixture";

// ── fixture plumbing (a fresh user PER CASE — these assert absolute balances) ──────────

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

// deno-lint-ignore no-explicit-any
interface CaseUser { userId: string; client: any }

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

  // Upsert, not update: the signup grant trigger may already have seeded a balance, and
  // these cases assert EXACT deltas.
  const { error: meritsError } = await client
    .from("user_merits")
    .upsert(
      { user_id: userId, subscription_balance: seed.subscription, shop_balance: seed.shop },
      { onConflict: "user_id" },
    );
  if (meritsError) {
    throw new Error(`MERIT FIXTURE FAILED: could not seed user_merits: ${meritsError.message}`);
  }

  // Read the seed back and prove it took — see the identical note in
  // merit-idempotency.remote.test.ts. Fail HERE, where the cause is obvious, rather
  // than as a confusing balance-delta assertion three steps into a case.
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

/** profiles.id cascades to user_merits and merit_transactions — one delete is enough. */
async function cleanupUser(userId: string): Promise<void> {
  try {
    const removed = await adminFetch(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    await removed.body?.cancel();
  } catch {
    // Housekeeping, not a gate.
  }
}

async function withUser(seed: Balances, fn: (u: CaseUser) => Promise<void>): Promise<void> {
  const user = await provisionUser(seed);
  try {
    await fn(user);
  } finally {
    await cleanupUser(user.userId);
  }
}

/**
 * THE CROSS-CUTTING GUARD. `success: true` with a null/absent transaction_id is the
 * WR-03 shape: `merit-gateway.ts:256-263` converts it into `500 merit_system_error` and
 * the wrapped callback never runs. It is a corrupt contract, never an acceptable
 * response. Implemented once, called by every case.
 */
// deno-lint-ignore no-explicit-any
function assertNeverSuccessWithNullHandle(result: any, label: string): void {
  if (result?.success === true) {
    assert(
      result.transaction_id !== null && result.transaction_id !== undefined,
      `${label}: check_and_deduct_merits returned success:true with a null transaction_id — ` +
        `this is the WR-03 shape that merit-gateway turns into 500 merit_system_error. ` +
        `Response: ${JSON.stringify(result)}`,
    );
  }
}

// deno-lint-ignore no-explicit-any
async function deduct(client: any, userId: string, key: string | null, label: string): Promise<any> {
  const { data, error } = await client.rpc("check_and_deduct_merits", {
    p_user_id: userId,
    p_feature: FEATURE,
    p_tier: TIER,
    p_idempotency_key: key,
  });
  if (error) throw new Error(`check_and_deduct_merits failed (${label}): ${error.message}`);
  assertNeverSuccessWithNullHandle(data, label);
  return data;
}

// deno-lint-ignore no-explicit-any
async function refund(client: any, userId: string, transactionId: string): Promise<any> {
  const { data, error } = await client.rpc("refund_merits", {
    p_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (error) throw new Error(`refund_merits failed: ${error.message}`);
  return data;
}

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

// deno-lint-ignore no-explicit-any
async function deductRowsForKey(client: any, userId: string, key: string): Promise<any[]> {
  const { data, error } = await client
    .from("merit_transactions")
    .select("id, amount, balance_type, metadata, created_at")
    .eq("user_id", userId)
    .eq("source", "feature-deduct")
    .eq("idempotency_key", key)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`could not read merit_transactions: ${error.message}`);
  return data ?? [];
}

// deno-lint-ignore no-explicit-any
const isStamped = (row: any) => row.metadata?.refunded_at != null;

// ── Case 1 — THE REGRESSION GUARD ──────────────────────────────────────────────────────
Deno.test("refund-aware: replay with NO refund still charges exactly ONCE", async () => {
  if (skipRemote("merit-refund-replay case 1")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);
    const key = `refundaware-noref-${crypto.randomUUID()}`;

    // This is the behavior the fix must NOT break — CONTEXT.md names it explicitly as
    // the constraint on the refund-awareness change. The partial unique index and the
    // unique_violation absorber exist to protect exactly this.
    const first = await deduct(client, userId, key, "case1 first");
    assertEquals(first.success, true);
    assert(!first.already_deducted);
    assertExists(first.transaction_id);

    const replay = await deduct(client, userId, key, "case1 replay");
    assertEquals(replay.already_deducted, true, "an unrefunded key MUST still short-circuit");
    assertEquals(
      replay.transaction_id,
      first.transaction_id,
      "the replay must hand back the ORIGINAL handle",
    );

    const after = await balances(client, userId);
    assertEquals(after.subscription, before.subscription - cost, "exactly ONE charge");

    const rows = await deductRowsForKey(client, userId, key);
    assertEquals(rows.length, 1, "exactly one feature-deduct row");
    assert(!isStamped(rows[0]), "an unrefunded row must NOT carry refunded_at");
  });
});

// ── Case 2 — THE FIX ───────────────────────────────────────────────────────────────────
Deno.test("refund-aware: DEDUCT -> REFUND -> REPLAY charges AGAIN (the hole is closed)", async () => {
  if (skipRemote("merit-refund-replay case 2")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const b0 = await balances(client, userId);
    const key = `refundaware-replay-${crypto.randomUUID()}`;

    // 1. Deduct.
    const first = await deduct(client, userId, key, "case2 first");
    assert(!first.already_deducted);
    const handle = first.transaction_id as string;
    assertExists(handle);
    const b1 = await balances(client, userId);
    assertEquals(b1.subscription, b0.subscription - cost);

    // 2. Refund — balance restored, a balance_type='refund' row written.
    const refunded = await refund(client, userId, handle);
    assertEquals(refunded.success, true, `refund_merits must succeed: ${JSON.stringify(refunded)}`);
    const b2 = await balances(client, userId);
    assertEquals(b2.subscription, b0.subscription, "the refund must restore the balance");

    const { data: refundRows } = await client
      .from("merit_transactions")
      .select("id, balance_type, metadata")
      .eq("user_id", userId)
      .eq("balance_type", "refund");
    assertEquals(refundRows?.length, 1, "exactly one mirroring refund row");

    // 3. The original leg is now RETIRED from the idempotency namespace.
    const afterRefund = await deductRowsForKey(client, userId, key);
    assertEquals(afterRefund.length, 1);
    assert(
      isStamped(afterRefund[0]),
      "refund_merits must stamp metadata.refunded_at onto the deduction leg — " +
        "without the stamp the index predicate matches nothing and the fix is inert",
    );

    // 4. THE ASSERTION THIS MIGRATION EXISTS FOR: replaying a REFUNDED key charges again.
    const replay = await deduct(client, userId, key, "case2 replay-after-refund");
    assert(
      !replay.already_deducted,
      "a REFUNDED deduction must NOT be treated as already_deducted — that is the free-run hole",
    );
    assertExists(replay.transaction_id);
    assert(
      replay.transaction_id !== handle,
      "the replay must mint a NEW deduction handle, not resurrect the refunded one",
    );

    const b3 = await balances(client, userId);
    assertEquals(b3.subscription, b0.subscription - cost, "the replay must actually CHARGE");

    // 5. Both rows coexist under one key: one retired, one live. This is exactly why the
    //    index gained balance_type and the lookups gained ORDER BY created_at DESC.
    const finalRows = await deductRowsForKey(client, userId, key);
    assertEquals(finalRows.length, 2, "one retired row + one live row share the key");
    assertEquals(finalRows.filter(isStamped).length, 1, "exactly one is retired");
    assertEquals(finalRows.filter((r) => !isStamped(r)).length, 1, "exactly one is live");
  });
});

// ── Case 3 ─────────────────────────────────────────────────────────────────────────────
Deno.test("refund-aware: concurrent same-key calls STILL collapse to one charge", async () => {
  if (skipRemote("merit-refund-replay case 3")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    const before = await balances(client, userId);
    const key = `refundaware-race-${crypto.randomUUID()}`;

    // The race absorber must survive the index change. Adding balance_type to the key
    // does not weaken it: a genuine duplicate replay writes the same legs with the same
    // key, so it still collides.
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => deduct(client, userId, key, `case3 racer ${i}`)),
    );

    for (const r of results) assertEquals(r.success, true, "no racer may error");
    assertEquals(results.filter((r) => !r.already_deducted).length, 1, "exactly ONE winner");
    assertEquals(new Set(results.map((r) => r.transaction_id)).size, 1, "all converge on one handle");

    const after = await balances(client, userId);
    assertEquals(after.subscription, before.subscription - cost, "exactly ONE charge");
    assertEquals((await deductRowsForKey(client, userId, key)).length, 1);
  });
});

// ── Case 4 — BUG 2 ─────────────────────────────────────────────────────────────────────
Deno.test("refund-aware: SPLIT deduction now charges the FULL cost (D-7b defect closed)", async () => {
  if (skipRemote("merit-refund-replay case 4")) return;

  await withUser({ subscription: 1, shop: 5 }, async ({ client, userId }) => {
    const cost = await featureCost(client);
    assert(cost > 1, "this case requires a cost above the seeded subscription balance");
    const before = await balances(client, userId);
    const key = `refundaware-split-${crypto.randomUUID()}`;

    // Pre-fix (see merit-idempotency.remote.test.ts case 5) this returned
    // {success:true, transaction_id:null, already_deducted:true} with ZERO ledger rows
    // and untouched balances, which merit-gateway turned into 500 merit_system_error —
    // a hard outage for a paying customer who had topped up. The composite
    // (idempotency_key, balance_type) index stops the two legs colliding, so the
    // subtransaction no longer aborts.
    const result = await deduct(client, userId, key, "case4 split");

    assertEquals(result.success, true);
    assert(!result.already_deducted, "a first-time split deduction is NOT a replay");
    assertExists(result.transaction_id, "the split deduction must return a real handle");

    const after = await balances(client, userId);
    assertEquals(
      after.subscription + after.shop,
      before.subscription + before.shop - cost,
      "the FULL cost must be taken across the two buckets",
    );
    assertEquals(after.subscription, 0, "subscription is drained first (SHOP-10)");
    assertEquals(after.shop, before.shop - (cost - before.subscription), "shop covers the remainder");

    const rows = await deductRowsForKey(client, userId, key);
    assertEquals(rows.length, 2, "both legs must now commit");
    const types = rows.map((r) => r.balance_type).sort();
    assertEquals(types, ["shop", "subscription"], "one leg per bucket");
    const handles = new Set(rows.map((r) => r.metadata?.deduction_id));
    assertEquals(handles.size, 1, "both legs share ONE deduction_id");
    assertEquals([...handles][0], result.transaction_id, "...which is the returned handle");

    // And the replay of a split key still short-circuits with no further movement.
    const replay = await deduct(client, userId, key, "case4 split replay");
    assertEquals(replay.already_deducted, true, "replaying a split key must short-circuit");
    const afterReplay = await balances(client, userId);
    assertEquals(afterReplay.subscription, after.subscription, "no further balance movement");
    assertEquals(afterReplay.shop, after.shop, "no further balance movement");
    assertEquals((await deductRowsForKey(client, userId, key)).length, 2, "still exactly two legs");
  });
});

// ── Case 5 ─────────────────────────────────────────────────────────────────────────────
Deno.test("refund-aware: refund_merits is STILL idempotent", async () => {
  if (skipRemote("merit-refund-replay case 5")) return;

  await withUser({ subscription: 30, shop: 0 }, async ({ client, userId }) => {
    const key = `refundaware-doublerefund-${crypto.randomUUID()}`;

    const first = await deduct(client, userId, key, "case5 deduct");
    const handle = first.transaction_id as string;

    const r1 = await refund(client, userId, handle);
    assertEquals(r1.success, true);
    const afterFirst = await balances(client, userId);

    // The stamping UPDATE added in Section 3 must not disturb the already_refunded
    // guard, which short-circuits BEFORE the leg-walking loop.
    const r2 = await refund(client, userId, handle);
    assertEquals(r2.error, "already_refunded", `second refund must be rejected: ${JSON.stringify(r2)}`);

    const afterSecond = await balances(client, userId);
    assertEquals(afterSecond.subscription, afterFirst.subscription, "a second refund moves NO balance");
    assertEquals(afterSecond.shop, afterFirst.shop, "a second refund moves NO balance");

    const { data: refundRows } = await client
      .from("merit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("balance_type", "refund");
    assertEquals(refundRows?.length, 1, "still exactly one refund row");
  });
});
