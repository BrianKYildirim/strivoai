/**
 * Stripe webhook 410-Gone shim (Phase 27 SC-1).
 *
 * The active webhook handler lives at `supabase/functions/stripe-webhook-handler/`.
 * This function exists only to make legacy Stripe dashboard URLs ending in
 * `/functions/v1/stripe-webhook` fail loud (HTTP 410 + structured warn log)
 * instead of silently 200-ignoring misrouted traffic.
 *
 * Decisions (see .planning/phases/27-cutover-safety-net/27-CONTEXT.md):
 *   D-01: Blanket-reject. No signature verify, no STRIPE_WEBHOOK_SECRET read.
 *   D-02: Logging only. No DB writes (no stripe_webhook_events insert).
 *   D-03: req_id from crypto.randomUUID() in BOTH log and response body.
 *   D-04: OPTIONS -> handleOptionsRequest({ type: 'webhook' }); non-POST -> 405.
 *
 * Background: .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md
 */
import { handleOptionsRequest } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

export async function handleStripeWebhook(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "webhook" });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const log = createLogger("stripe-webhook");
  const req_id = crypto.randomUUID();
  log.warn("legacy_endpoint_hit", {
    req_id,
    ua: req.headers.get("user-agent"),
    sig_present: req.headers.has("stripe-signature"),
  });

  return new Response(
    JSON.stringify({
      error: "endpoint_deprecated",
      use: "/functions/v1/stripe-webhook-handler",
      req_id,
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
}

Deno.serve(handleStripeWebhook);
