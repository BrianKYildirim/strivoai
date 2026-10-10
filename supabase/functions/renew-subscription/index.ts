/**
 * Authenticated scheduled-cancellation recovery.
 *
 * The caller may preview the authoritative renewal date or restore automatic
 * renewal. Stripe subscription ownership is derived exclusively from the
 * authenticated user's profile; persisted billing state remains webhook-owned.
 */
import type Stripe from "npm:stripe@14";
import {
  corsHeaders,
  handleOptionsRequest,
  withCors,
} from "../_shared/cors.ts";
import {
  requireAuth as realRequireAuth,
  type UserContext,
} from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import { getStripeClient } from "../_shared/stripe-client.ts";

const log = createLogger("renew-subscription");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

type RenewalAction = "preview" | "restore";

export interface RenewSubscriptionDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
  requireAuth?: (req: Request) => Promise<UserContext>;
}

function jsonResponse(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders({ type: "user" }, req),
      "Content-Type": "application/json",
    },
  });
}

function validPeriodEnd(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function readAction(req: Request): Promise<RenewalAction | null> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return null;
  }

  if (!body || typeof body !== "object") return null;
  const action = (body as { action?: unknown }).action;
  return action === "preview" || action === "restore" ? action : null;
}

export async function handleRenewSubscription(
  req: Request,
  deps: RenewSubscriptionDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "user" }, req);
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const action = await readAction(req);
  if (!action) {
    return jsonResponse(req, { error: "invalid_action" }, 400);
  }

  const requireAuthFn = deps.requireAuth ??
    ((request: Request) => realRequireAuth(request, { type: "user" }));

  let ctx: UserContext;
  try {
    ctx = await requireAuthFn(req);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const supabase = deps.supabase ?? getServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", ctx.userId)
    .single();

  if (
    profileError &&
    (profileError as { code?: string }).code !== "PGRST116"
  ) {
    log.error("profile-lookup-failed", {
      userId: ctx.userId,
      code: (profileError as { code?: string }).code,
    });
    return jsonResponse(req, { error: "profile_lookup_failed" }, 500);
  }

  const subscriptionId =
    (profile?.stripe_subscription_id as string | null | undefined) ?? null;
  if (!subscriptionId) {
    return jsonResponse(req, { error: "no_subscription" }, 400);
  }

  const stripe = deps.stripe ?? getStripeClient();

  if (action === "preview") {
    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      log.error("subscription-preview-failed", {
        userId: ctx.userId,
        subscriptionId,
        reason: "provider_error",
      });
      return jsonResponse(req, { error: "preview_failed" }, 500);
    }

    if (!validPeriodEnd(subscription.current_period_end)) {
      log.warn("subscription-preview-invalid", {
        userId: ctx.userId,
        subscriptionId,
        reason: "invalid_period_end",
      });
      return jsonResponse(req, { error: "invalid_subscription_response" }, 502);
    }

    return jsonResponse(req, {
      ok: true,
      action: "preview",
      current_period_end: subscription.current_period_end,
    }, 200);
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  } catch {
    log.error("subscription-restore-failed", {
      userId: ctx.userId,
      subscriptionId,
      reason: "provider_error",
    });
    return jsonResponse(req, { error: "restore_failed" }, 500);
  }

  if (
    subscription.cancel_at_period_end !== false ||
    !validPeriodEnd(subscription.current_period_end)
  ) {
    log.warn("subscription-restore-unconfirmed", {
      userId: ctx.userId,
      subscriptionId,
      reason: subscription.cancel_at_period_end !== false
        ? "ambiguous_cancel_state"
        : "invalid_period_end",
    });
    return jsonResponse(req, { error: "restore_not_confirmed" }, 502);
  }

  log.info("subscription-restore-confirmed", {
    userId: ctx.userId,
    subscriptionId,
    currentPeriodEnd: subscription.current_period_end,
  });

  return jsonResponse(req, {
    ok: true,
    action: "restore",
    current_period_end: subscription.current_period_end,
    cancel_at_period_end: false,
  }, 200);
}

Deno.serve((req) => withCors(req, "user", () => handleRenewSubscription(req)));
