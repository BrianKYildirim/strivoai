import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createFeatureRun,
  markFeatureRunMerits,
  observeFeatureRunMeritTransaction,
  recoverFeatureRun,
  terminalizeFeatureRun,
  type FeatureRunRecord,
  type FeatureRunStore,
} from "./feature-run-telemetry.ts";

class MemoryStore implements FeatureRunStore {
  profile = { subscriptionTier: "elite", stripePriceId: "price_elite_monthly" };
  subjectId: string | null = null;
  excluded = false;
  runs = new Map<string, FeatureRunRecord>();
  rows = new Map<string, Record<string, unknown>>();
  meritPatches: Record<string, unknown>[] = [];
  meritAmount: number | null = 5;
  throwOnLookup = false;

  getProfile() {
    return Promise.resolve(this.profile);
  }
  getCostingSubject() {
    return Promise.resolve(this.subjectId);
  }
  createCostingSubject(id: string) {
    this.subjectId = id;
    return Promise.resolve(id);
  }
  isExcluded() {
    return Promise.resolve(this.excluded);
  }
  getMeritTransactionAmount() {
    return Promise.resolve(this.meritAmount);
  }
  getRunByActionHash(hash: string) {
    if (this.throwOnLookup) throw new Error("db down");
    return Promise.resolve(this.runs.get(hash) ?? null);
  }
  insertRun(row: Record<string, unknown>) {
    const id = String(row.id);
    const hash = String(row.server_action_key_hash);
    const record = { id, status: "started" as const };
    this.runs.set(hash, record);
    this.rows.set(id, row);
    return Promise.resolve(record);
  }
  updateMerits(_id: string, patch: Record<string, unknown>) {
    this.meritPatches.push(patch);
    return Promise.resolve(true);
  }
  getRunStatus(id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(
      (row?.status as "started" | "completed" | "failed" | "canceled") ?? null,
    );
  }
  terminalize(
    id: string,
    _from: "started" | "completed" | "failed" | "canceled",
    patch: Record<string, unknown>,
  ) {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(false);
    Object.assign(row, patch);
    return Promise.resolve(true);
  }
}

function deps(store: MemoryStore) {
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
  return {
    store,
    runtimeEnvironment: () => "test" as const,
    randomUuid: () => ids.shift() ?? "00000000-0000-4000-8000-000000000099",
    now: () => "2026-08-01T00:00:00.000Z",
  };
}

const params = {
  userId: "user-1",
  feature: "resume_analysis" as const,
  serverActionKey: "server-derived-action-1",
  inputType: "pdf" as const,
  documentCount: 1,
};

Deno.test("feature run owns UUIDs and immutable trusted snapshots", async () => {
  const store = new MemoryStore();
  Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", "price_elite_monthly");
  try {
    const result = await createFeatureRun(params, deps(store));
    assert(result.ok);
    assertEquals(result.featureRunId, "00000000-0000-4000-8000-000000000002");
    const row = store.rows.get(result.featureRunId)!;
    assertEquals(row.costing_subject_id, "00000000-0000-4000-8000-000000000001");
    assertEquals(row.tier_at_time, "elite");
    assertEquals(row.subscription_period_at_time, "monthly");
    assertEquals(row.environment, "test");
    assertEquals(row.exclude_from_costing_at_time, false);
    assertEquals(row.costing_epoch, "phase_04_2_complete");
    assertFalse("prompt" in row);
    assertFalse("document_text" in row);
    assertFalse("calculated_cost" in row);
  } finally {
    Deno.env.delete("STRIPE_PRICE_ELITE_MONTHLY");
  }
});

Deno.test("feature run idempotently recovers without mutating snapshots", async () => {
  const store = new MemoryStore();
  const first = await createFeatureRun(params, deps(store));
  assert(first.ok);
  store.profile.subscriptionTier = "free";
  store.excluded = true;
  const second = await createFeatureRun(params, deps(store));
  assert(second.ok);
  assertEquals(second.featureRunId, first.featureRunId);
  assertEquals(second.recovered, true);
  const row = store.rows.get(first.featureRunId)!;
  assertEquals(row.tier_at_time, "elite");
  assertEquals(row.exclude_from_costing_at_time, false);
  const recovered = await recoverFeatureRun(params, { store });
  assert(recovered.ok);
  assertEquals(recovered.featureRunId, first.featureRunId);
});

Deno.test("feature run terminal state is monotonic and duplicate-safe", async () => {
  const store = new MemoryStore();
  const created = await createFeatureRun(params, deps(store));
  assert(created.ok);
  assert(await terminalizeFeatureRun(created.featureRunId, { status: "failed", errorCode: "provider_timeout", errorCategory: "provider" }, { store, now: () => "2026-08-01T00:01:00Z" }));
  assert(await terminalizeFeatureRun(created.featureRunId, { status: "failed" }, { store }));
  assertFalse(await terminalizeFeatureRun(created.featureRunId, { status: "completed" }, { store }));
});

Deno.test("feature run Merit observations persist only non-negative exact evidence", async () => {
  const store = new MemoryStore();
  assert(await markFeatureRunMerits("run-1", { meritsCharged: 5, meritsRefunded: 0 }, { store }));
  assertEquals(store.meritPatches[0].merits_charged, 5);
  assertEquals(store.meritPatches[0].merit_charge_known, true);
  assertEquals(store.meritPatches[0].merits_refunded, 0);
  assertFalse(await markFeatureRunMerits("run-1", { meritsCharged: -1 }, { store }));
  assert(await observeFeatureRunMeritTransaction("run-1", "tx-1", "charged", { store }));
  assertEquals(store.meritPatches[1].merits_charged, 5);
  assert(await observeFeatureRunMeritTransaction("run-1", "tx-1", "refunded", { store }));
  assertEquals(store.meritPatches[2].merits_refunded, 5);
  assert(await observeFeatureRunMeritTransaction("run-1", "cache-hit", "charged", { store }));
  assertEquals(store.meritPatches[3].merits_charged, 0);
});

Deno.test("feature run telemetry never throws into the product path", async () => {
  const store = new MemoryStore();
  store.throwOnLookup = true;
  assertEquals(await createFeatureRun(params, { store }), {
    ok: false,
    reason: "feature_run_telemetry_unavailable",
  });
  assertEquals(await recoverFeatureRun(params, { store }), {
    ok: false,
    reason: "feature_run_lookup_failed",
  });
});
