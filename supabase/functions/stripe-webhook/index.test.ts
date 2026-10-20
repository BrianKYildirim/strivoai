/**
 * Phase 27 SC-1 — 410-Gone shim unit tests.
 * Replaces the deleted Phase 07 fixture-driven tests.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStripeWebhook } from "./index.ts";

Deno.test("legacy webhook shim: POST returns 410 with deprecation body", async () => {
  const req = new Request("https://example.test/stripe-webhook", {
    method: "POST",
    headers: {
      "stripe-signature": "t=1,v1=abc",
      "user-agent": "Stripe/1.0",
    },
    body: '{"any":"json"}',
  });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 410);
  const body = await res.json();
  assertEquals(body.error, "endpoint_deprecated");
  assertEquals(body.use, "/functions/v1/stripe-webhook-handler");
  assert(typeof body.req_id === "string" && body.req_id.length > 0);
});

Deno.test("legacy webhook shim: OPTIONS returns 200", async () => {
  const req = new Request("https://example.test/stripe-webhook", { method: "OPTIONS" });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 200);
});

Deno.test("legacy webhook shim: GET returns 405 method_not_allowed", async () => {
  const req = new Request("https://example.test/stripe-webhook", { method: "GET" });
  const res = await handleStripeWebhook(req);
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, "method_not_allowed");
});
