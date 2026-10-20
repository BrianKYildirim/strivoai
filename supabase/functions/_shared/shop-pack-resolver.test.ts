/**
 * Deno unit tests for _shared/shop-pack-resolver.ts (Phase 12 Plan 01 Task 1).
 *
 * Mirrors the pattern of stripe-webhook/price-resolver.test.ts:
 *  - Env vars are cleared before each case so map state does not leak
 *  - We assert bidirectional symmetry: resolvePackSize(id) ⇔ resolveShopPriceId(size)
 *  - Unknown price IDs return null (and emit a warn log via createLogger)
 *  - Missing env vars return null for resolveShopPriceId
 *
 * Run with:
 *   deno test --allow-env --allow-read --no-check \
 *     supabase/functions/_shared/shop-pack-resolver.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildShopPackMap,
  isPackSize,
  PACK_SIZES,
  resolvePackSize,
  resolveShopPriceId,
  type PackSize,
} from "./shop-pack-resolver.ts";

const SHOP_ENV_KEYS = [
  "STRIPE_PRICE_MERIT_3",
  "STRIPE_PRICE_MERIT_10",
  "STRIPE_PRICE_MERIT_25",
  "STRIPE_PRICE_MERIT_50",
] as const;

function clearShopEnv(): void {
  for (const k of SHOP_ENV_KEYS) Deno.env.delete(k);
}

Deno.test("resolvePackSize: returns 25 when priceId matches STRIPE_PRICE_MERIT_25", () => {
  clearShopEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_25", "price_test_25");
  try {
    assertEquals(resolvePackSize("price_test_25"), 25);
  } finally {
    clearShopEnv();
  }
});

Deno.test("resolveShopPriceId: returns the configured price id for pack size 25", () => {
  clearShopEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_25", "price_test_25");
  try {
    assertEquals(resolveShopPriceId(25), "price_test_25");
  } finally {
    clearShopEnv();
  }
});

Deno.test("resolvePackSize + resolveShopPriceId are symmetric for all pack sizes", () => {
  clearShopEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_3", "price_pack_3");
  Deno.env.set("STRIPE_PRICE_MERIT_10", "price_pack_10");
  Deno.env.set("STRIPE_PRICE_MERIT_25", "price_pack_25");
  Deno.env.set("STRIPE_PRICE_MERIT_50", "price_pack_50");
  try {
    const cases: Array<[PackSize, string]> = [
      [3, "price_pack_3"],
      [10, "price_pack_10"],
      [25, "price_pack_25"],
      [50, "price_pack_50"],
    ];
    for (const [size, id] of cases) {
      assertEquals(resolveShopPriceId(size), id);
      assertEquals(resolvePackSize(id), size);
    }
  } finally {
    clearShopEnv();
  }
});

Deno.test("resolvePackSize: unknown priceId returns null (fail-closed)", () => {
  clearShopEnv();
  // No env vars set — map is empty, so any lookup misses.
  assertEquals(resolvePackSize("price_not_in_map"), null);
});

Deno.test("resolvePackSize: null / undefined / empty string returns null", () => {
  clearShopEnv();
  assertEquals(resolvePackSize(null), null);
  assertEquals(resolvePackSize(undefined), null);
  assertEquals(resolvePackSize(""), null);
});

Deno.test("resolveShopPriceId: returns null when STRIPE_PRICE_MERIT_50 env var is unset", () => {
  clearShopEnv();
  assertEquals(resolveShopPriceId(50), null);
});

Deno.test("resolveShopPriceId: returns null for every pack size when all env vars unset", () => {
  clearShopEnv();
  for (const size of PACK_SIZES) {
    assertEquals(resolveShopPriceId(size), null);
  }
});

Deno.test("buildShopPackMap: includes only env-set entries, skips undefined ones", () => {
  clearShopEnv();
  Deno.env.set("STRIPE_PRICE_MERIT_10", "price_only_10");
  try {
    const map = buildShopPackMap();
    assertEquals(map["price_only_10"], 10);
    assertEquals(Object.keys(map).length, 1);
  } finally {
    clearShopEnv();
  }
});

Deno.test("isPackSize: accepts 3 | 10 | 25 | 50 and rejects everything else", () => {
  assertEquals(isPackSize(3), true);
  assertEquals(isPackSize(10), true);
  assertEquals(isPackSize(25), true);
  assertEquals(isPackSize(50), true);
  assertEquals(isPackSize(7), false);
  assertEquals(isPackSize(100), false);
  assertEquals(isPackSize("25"), false);
  assertEquals(isPackSize(null), false);
  assertEquals(isPackSize(undefined), false);
});
