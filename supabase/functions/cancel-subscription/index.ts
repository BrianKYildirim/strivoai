/**
 * cancel-subscription edge function — quick task 260718-jbd.
 *
 * Contract: authenticated POST in, { ok, current_period_end } out.
 *
 * Purpose: an Elite subscriber choosing the Free tier on /pricing downgrades by
 * cancelling their subscription AT PERIOD END. We flip Stripe's
 * `cancel_at_period_end` flag; the resulting `customer.subscription.updated`
 * event is handled by stripe-webhook-handler, which writes
 * `profiles.pending_downgrade_tier = "free"`. The user keeps Elite access and
 * merits until `current_period_end`, then Stripe emits
 * `customer.subscription.deleted` and the account returns to Free.
 *
 * We deliberately do NOT write tier/merit state here — the webhook is the single
 * source of truth for subscription state (mirrors the swap branch in
 * create-checkout-session, which also defers DB writes to the webhook).
 *
 * Invariants:
 * - requireAuth({type:'user'}) gates every request.
 * - Subscription lookup is keyed ONLY by ctx.userId; cross-user cancellation is
 *   structurally impossible (the subscription id is never read from the body).
 * - When profiles.stripe_subscription_id is null → 400 no_subscription.
 *
 * Test hooks: handler accepts optional `deps` so unit tests can inject fakes for
 * supabase, stripe, and requireAuth.
 */
import type Stripe from "npm:stripe@14";
import { corsHeaders, handleOptionsRequest, withCors } from "../_shared/cors.ts";
import {
  requireAuth as realRequireAuth,
  type UserContext,
} from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import { getStripeClient } from "../_shared/stripe-client.ts";

const log = createLogger("cancel-subscription");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface CancelSubscriptionDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
  requireAuth?: (req: Request) => Promise<UserContext>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders({ type: "user" }),
      "Content-Type": "application/json",
    },
  });
}

export async function handleCancelSubscription(
  req: Request,
  deps: CancelSubscriptionDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "user" });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const requireAuthFn = deps.requireAuth ??
    ((r: Request) =>
      realRequireAuth(r, { type: "user" }) as Promise<UserContext>);
  let ctx: UserContext;
  try {
    ctx = await requireAuthFn(req);
  } catch (r) {
    if (r instanceof Response) return r;
    throw r;
  }

  const supabase = deps.supabase ?? getServiceClient();
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", ctx.userId)
    .single();

  // PGRST116 = no rows; anything else is a real DB error. Without this branch a
  // transient DB failure would fall through to the null-subscription case and
  // mis-report as 400 no_subscription, telling the user to subscribe when the
  // real issue is backend-side (mirrors create-stripe-portal).
  if (profileErr && (profileErr as { code?: string }).code !== "PGRST116") {
    log.error("profile-lookup-failed", {
      userId: ctx.userId,
      code: (profileErr as { code?: string }).code,
    });
    return jsonResponse({ error: "profile_lookup_failed" }, 500);
  }

  const subscriptionId: string | null =
    (profile?.stripe_subscription_id as string | null) ?? null;

  if (!subscriptionId) {
    // No active subscription to cancel — the caller is already effectively Free.
    // The frontend treats this as a benign "already free" state, not a failure.
    return jsonResponse({ error: "no_subscription" }, 400);
  }

  const stripe = deps.stripe ?? getStripeClient();

  // Wrap the Stripe call so errors (deleted subscription, rate limit, network
  // timeout) return through jsonResponse with CORS headers instead of escaping
  // to Deno.serve's default handler where the browser surfaces them as a
  // CORS-blocked "failed to fetch".
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    log.error("subscription-cancel-failed", {
      userId: ctx.userId,
      subscriptionId,
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ error: "cancel_failed" }, 500);
  }

  log.info("subscription-cancel-scheduled", {
    userId: ctx.userId,
    subscriptionId,
    currentPeriodEnd: sub.current_period_end ?? null,
  });

  // current_period_end is unix seconds (or null on an unusual subscription
  // shape); the frontend formats it for the success toast.
  return jsonResponse(
    { ok: true, current_period_end: sub.current_period_end ?? null },
    200,
  );
}

// withCors guarantees origin-aware CORS on success, error, and OPTIONS preflight
// (CORS-02, CORS-05); the handler internals are unchanged.
Deno.serve((req) => withCors(req, "user", () => handleCancelSubscription(req)));
