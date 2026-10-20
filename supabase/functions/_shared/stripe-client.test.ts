/**
 * Deno unit tests for the _shared/stripe-client.ts module.
 * Run with: deno test --allow-env --allow-net supabase/functions/_shared/stripe-client.test.ts
 */
import { assertEquals, assert, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getStripeClient,
  getStripeCryptoProvider,
  getStripeMode,
  _resetForTests,
} from "./stripe-client.ts";

const TEST_KEY = "sk_test_dummy_1234567890abcdef";

// ── getStripeMode — debug session `stripe-checkout-key-mismatch` (2026-07-17) ──
// Production ran a pk_test_ bundle against this function's sk_live_ secret. The
// backend now reports its mode so the frontend can refuse to mount on a split.

Deno.test("getStripeMode: reports 'live' for an sk_live_ secret", () => {
  Deno.env.set("STRIPE_SECRET_KEY", "sk_live_dummy_1234567890abcdef");
  try {
    assertEquals(getStripeMode(), "live");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
  }
});

Deno.test("getStripeMode: reports 'test' for an sk_test_ secret", () => {
  Deno.env.set("STRIPE_SECRET_KEY", TEST_KEY);
  try {
    assertEquals(getStripeMode(), "test");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
  }
});

Deno.test("getStripeMode: supports restricted keys (rk_live_ / rk_test_)", () => {
  Deno.env.set("STRIPE_SECRET_KEY", "rk_live_dummy_1234567890abcdef");
  try {
    assertEquals(getStripeMode(), "live");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
  }
  Deno.env.set("STRIPE_SECRET_KEY", "rk_test_dummy_1234567890abcdef");
  try {
    assertEquals(getStripeMode(), "test");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
  }
});

Deno.test("getStripeMode: reports 'unknown' when unset or unrecognised (never throws)", () => {
  Deno.env.delete("STRIPE_SECRET_KEY");
  assertEquals(getStripeMode(), "unknown");
  Deno.env.set("STRIPE_SECRET_KEY", "whsec_not_a_secret_key");
  try {
    assertEquals(getStripeMode(), "unknown");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
  }
});

Deno.test("getStripeClient: throws when STRIPE_SECRET_KEY is unset", () => {
  _resetForTests();
  Deno.env.delete("STRIPE_SECRET_KEY");
  try {
    assertThrows(
      () => getStripeClient(),
      Error,
      "STRIPE_SECRET_KEY not configured",
    );
  } finally {
    _resetForTests();
  }
});

Deno.test("getStripeClient: returns a Stripe instance when STRIPE_SECRET_KEY is set", () => {
  _resetForTests();
  Deno.env.set("STRIPE_SECRET_KEY", TEST_KEY);
  try {
    const stripe = getStripeClient();
    assert(stripe, "Should return a truthy Stripe instance");
    // Stripe instances expose common resource namespaces
    assert(typeof stripe === "object", "Should be an object");
    assert(
      typeof (stripe as unknown as { customers?: unknown }).customers === "object",
      "Should expose a customers resource",
    );
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
    _resetForTests();
  }
});

Deno.test("getStripeClient: two successive calls return the same singleton instance", () => {
  _resetForTests();
  Deno.env.set("STRIPE_SECRET_KEY", TEST_KEY);
  try {
    const a = getStripeClient();
    const b = getStripeClient();
    assertEquals(a, b, "Singleton must return identical references");
    assert(a === b, "Strict equality: same object reference");
  } finally {
    Deno.env.delete("STRIPE_SECRET_KEY");
    _resetForTests();
  }
});

Deno.test("getStripeCryptoProvider: returns a non-null singleton crypto provider", () => {
  _resetForTests();
  const provider1 = getStripeCryptoProvider();
  const provider2 = getStripeCryptoProvider();
  assert(provider1 !== null && provider1 !== undefined, "Provider must be non-null");
  assert(provider1 === provider2, "Must return the same singleton reference");
  _resetForTests();
});
