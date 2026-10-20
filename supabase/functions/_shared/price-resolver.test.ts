import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolvePriceId,
  resolveTier,
  resolveTierAndInterval,
} from "./price-resolver.ts";

const KEYS = [
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_ANNUAL",
  "STRIPE_PRICE_ELITE_MONTHLY",
  "STRIPE_PRICE_ELITE_ANNUAL",
  "STRIPE_PRICE_PAID_MONTHLY",
  "STRIPE_PRICE_PAID_ANNUAL",
];

function clearEnv(): void {
  for (const key of KEYS) Deno.env.delete(key);
}

Deno.test("resolvePriceId: elite uses explicit Elite price before legacy fallback", () => {
  clearEnv();
  try {
    Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_legacy_paid_monthly");
    Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", "price_elite_monthly");
    assertEquals(resolvePriceId("elite", "monthly"), "price_elite_monthly");
    assertEquals(resolveTier("price_legacy_paid_monthly"), "pro");
    assertEquals(resolveTier("price_elite_monthly"), "elite");
  } finally {
    clearEnv();
  }
});

Deno.test("resolvePriceId: elite falls back to legacy Pro price when it is the only paid monthly price", () => {
  clearEnv();
  try {
    Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_legacy_paid_monthly");
    assertEquals(resolvePriceId("elite", "monthly"), "price_legacy_paid_monthly");
    assertEquals(resolveTier("price_legacy_paid_monthly"), "elite");
  } finally {
    clearEnv();
  }
});

Deno.test("resolvePriceId: STRIPE_PRICE_PAID_MONTHLY is the single paid-tier alias", () => {
  clearEnv();
  try {
    Deno.env.set("STRIPE_PRICE_PRO_MONTHLY", "price_legacy_paid_monthly");
    Deno.env.set("STRIPE_PRICE_PAID_MONTHLY", "price_paid_monthly");
    assertEquals(resolvePriceId("elite", "monthly"), "price_paid_monthly");
    assertEquals(resolveTier("price_paid_monthly"), "elite");
    assertEquals(resolveTier("price_legacy_paid_monthly"), "pro");
  } finally {
    clearEnv();
  }
});

Deno.test("resolveTierAndInterval: exact Elite price IDs preserve monthly and annual", () => {
  clearEnv();
  try {
    Deno.env.set("STRIPE_PRICE_ELITE_MONTHLY", "price_elite_monthly");
    Deno.env.set("STRIPE_PRICE_ELITE_ANNUAL", "price_elite_annual");
    assertEquals(resolveTierAndInterval("price_elite_monthly"), {
      tier: "elite",
      interval: "monthly",
    });
    assertEquals(resolveTierAndInterval("price_elite_annual"), {
      tier: "elite",
      interval: "annual",
    });
  } finally {
    clearEnv();
  }
});

Deno.test("resolveTierAndInterval: missing and unknown prices keep interval unknown", () => {
  clearEnv();
  try {
    assertEquals(resolveTierAndInterval(null), { tier: "free", interval: null });
    assertEquals(resolveTierAndInterval("price_unknown"), {
      tier: "free",
      interval: null,
    });
  } finally {
    clearEnv();
  }
});
