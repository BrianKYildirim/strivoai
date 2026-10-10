/**
 * create-stripe-portal edge function — Phase 07 Plan 05 (STR-05).
 *
 * Contract: authenticated POST in, { url } out.
 *
 * Invariants:
 * - requireAuth({type:'user'}) gates every request.
 * - Profile lookup is keyed ONLY by ctx.userId; cross-user access is
 *   structurally impossible.
 * - When profiles.stripe_customer_id is null → 400 no_customer (D-23).
 * - return_url is always APP_URL/pricing (trailing slash normalized).
 *
 * Test hooks: handler accepts optional `deps` so unit tests can inject fakes
 * for supabase, stripe, and requireAuth.
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

const log = createLogger("create-stripe-portal");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface CreateStripePortalDeps {
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

export async function handleCreateStripePortal(
  req: Request,
  deps: CreateStripePortalDeps = {},
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
    .select("stripe_customer_id")
    .eq("id", ctx.userId)
    .single();

  // PGRST116 = no rows; everything else is a real DB error. Without this
  // check, a transient DB failure would fall through to the null-customer
  // branch and mis-report as 400 no_customer, telling the user to subscribe
  // when the real issue is backend-side.
  if (profileErr && (profileErr as { code?: string }).code !== "PGRST116") {
    log.error("profile-lookup-failed", {
      userId: ctx.userId,
      code: (profileErr as { code?: string }).code,
    });
    return jsonResponse({ error: "profile_lookup_failed" }, 500);
  }

  const customerId: string | null =
    (profile?.stripe_customer_id as string | null) ?? null;

  if (!customerId) {
    return jsonResponse({ error: "no_customer" }, 400);
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const stripe = deps.stripe ?? getStripeClient();

  // Wrap Stripe call so errors (portal not configured in dashboard, deleted
  // customer, rate limit, network timeout) return through jsonResponse with
  // CORS headers instead of escaping to Deno.serve's default error handler
  // where the browser surfaces them as CORS-blocked "failed to fetch".
  let session: Stripe.BillingPortal.Session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/pricing`,
    });
  } catch (err) {
    log.error("portal-create-failed", {
      userId: ctx.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ error: "portal_creation_failed" }, 500);
  }

  log.info("portal-session-created", {
    userId: ctx.userId,
    sessionId: session.id,
  });

  return jsonResponse({ url: session.url }, 200);
}

// withCors guarantees origin-aware CORS on success, error, and OPTIONS preflight
// (CORS-02, CORS-05); the handler internals are unchanged.
Deno.serve((req) => withCors(req, 'user', () => handleCreateStripePortal(req)));
