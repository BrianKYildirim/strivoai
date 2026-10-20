/**
 * create-checkout-session edge function — Phase 07 Plan 04 (STR-01, STR-12),
 * extended in Phase 12 Plan 04 to cover Merit Shop one-time purchases
 * (BACK-04, SHOP-12, SUB-05/SUB-06 back-compat).
 *
 * Contract (discriminated union):
 *   { mode: 'subscription', tier: 'pro'|'elite', interval: 'monthly'|'annual' }
 *   { mode: 'payment',      pack_size: 3|10|25|50 }
 *   // back-compat: bare { tier, interval } is treated as mode:'subscription'
 *
 * Out: { url, id }
 *
 * Invariants:
 * - requireAuth({type:'user'}) gates every request (D-12).
 * - Subscription priceId is resolved from STRIPE_PRICE_<TIER>_<INTERVAL>;
 *   shop priceId is resolved from STRIPE_PRICE_MERIT_<PACK> (env vars only).
 *   The client never supplies the price id — such fields on the request body
 *   are ignored.
 * - Lazy Stripe customer creation (D-21): if profiles.stripe_customer_id is
 *   null, create the customer, write the id back, then use it for the session.
 * - Subscription rate limit: per-tier hourly window (free 10 / pro 30 / elite 60).
 * - Payment (shop) rate limit (SHOP-12): 10 shop purchases / user / hour
 *   regardless of tier — runs as a SECOND checkRateLimit call after the body
 *   is parsed and the mode is known to be 'payment'.
 * - Pitfall 9: shop sessions set BOTH session.metadata.user_id AND
 *   payment_intent_data.metadata.user_id so the webhook can credit Merits via
 *   either path.
 *
 * Test hooks: handler accepts optional `deps` so unit tests can inject fakes
 * for supabase, stripe, requireAuth, and checkRateLimit.
 */
import type Stripe from "npm:stripe@14";
import { corsHeaders, handleOptionsRequest, withCors } from "../_shared/cors.ts";
import {
  requireAuth as realRequireAuth,
  type UserContext,
} from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  checkRateLimit as realCheckRateLimit,
  createRateLimitResponse,
  type RateLimitConfig,
  type RateLimitResult,
} from "../_shared/rate-limiter.ts";
import { getStripeClient, getStripeMode } from "../_shared/stripe-client.ts";
import {
  isPackSize,
  resolveShopPriceId,
  type PackSize,
} from "../_shared/shop-pack-resolver.ts";
import { resolvePriceId } from "../_shared/price-resolver.ts";

const log = createLogger("create-checkout-session");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

// ── Body shape ──────────────────────────────────────────────────────────────
//
// Phase 12 BACK-04 introduces a discriminated `mode` switch. The bare
// `{tier, interval}` shape (no explicit `mode`) is preserved for back-compat
// with Phase 07 callers and any existing frontend code in flight during the
// cutover.
type CheckoutBody =
  // Pro is intentionally still accepted here for old clients/Stripe metadata.
  // Current frontend pricing renders only Free and Elite, so no new Pro
  // checkout is offered through the active product UI.
  | { mode: "subscription"; tier: "pro" | "elite"; interval: "monthly" | "annual"; ui_mode?: "embedded" }
  | { mode: "payment"; pack_size: PackSize; ui_mode?: "embedded" };

function normalizeBody(raw: unknown): CheckoutBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;

  if (b.mode === "payment") {
    // pack_size is validated for membership in PACK_SIZES later via
    // isPackSize() so the handler can return a precise 400 invalid_pack_size.
    return {
      mode: "payment",
      pack_size: b.pack_size as PackSize,
      ui_mode: b.ui_mode === "embedded" ? "embedded" as const : undefined,
    };
  }

  // Explicit subscription mode OR back-compat (no mode field, just tier+interval).
  if (
    b.mode === "subscription" ||
    (b.mode === undefined && typeof b.tier === "string" && typeof b.interval === "string")
  ) {
    return {
      mode: "subscription",
      tier: b.tier as "pro" | "elite",
      interval: b.interval as "monthly" | "annual",
      ui_mode: b.ui_mode === "embedded" ? "embedded" as const : undefined,
    };
  }

  return null;
}

export interface CreateCheckoutSessionDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
  requireAuth?: (req: Request) => Promise<UserContext>;
  checkRateLimit?: (
    userId: string,
    tier: string,
    cfg: RateLimitConfig,
  ) => Promise<RateLimitResult>;
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

// Phase 33 Plan 02 (PRICE-03): detect a Stripe failure that means the existing
// subscription cannot be charged because there is no usable payment method on
// file. In that case the swap can't proceed silently — the frontend must fall
// back to the customer portal so the user can add a card. We match on the
// payment-method-specific signals only.
//
// CR-02: the generic `missing` / `resource_missing` codes are NOT used here.
// They are Stripe's catch-all "resource not found" codes (deleted customer,
// unknown price, missing subscription) and would mis-route real configuration
// errors to the portal, masking 500s. We match the payment-method-specific
// code plus the canonical "no attached payment source" / "no default payment
// method" messages, which exclusively indicate a missing card.
function isMissingPaymentMethodError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const msg = (err instanceof Error ? err.message : String(err ?? ""))
    .toLowerCase();
  return (
    code === "payment_method_not_set" ||
    msg.includes("no attached payment source") ||
    msg.includes("no default payment method")
  );
}

export async function handleCreateCheckoutSession(
  req: Request,
  deps: CreateCheckoutSessionDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "user" });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Auth — requireAuth throws a Response on failure; propagate it.
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

  // First rate limit — per-tier hourly window guarding the function entry.
  // This applies to both subscription AND payment requests; the payment branch
  // adds a SECOND, stricter shop-specific limit below (SHOP-12).
  const rateLimitFn = deps.checkRateLimit ?? realCheckRateLimit;
  const rl = await rateLimitFn(ctx.userId, ctx.tier, {
    key: "create-checkout-session",
    limits: { free: 10, pro: 30, elite: 60 },
    windowSeconds: 3600,
  });
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, "user");

  // Parse + normalize body to the discriminated union. Any unknown field on
  // the input (incl. `priceId`) is ignored by normalizeBody — the client
  // never gets to pick a Stripe price id directly (STR-12).
  const rawBody = await req.json().catch(() => null);
  const body = normalizeBody(rawBody);
  if (!body) return jsonResponse({ error: "invalid_body" }, 400);

  if (body.mode === "subscription") {
    if (body.tier !== "pro" && body.tier !== "elite") {
      return jsonResponse({ error: "invalid_tier" }, 400);
    }
    if (body.interval !== "monthly" && body.interval !== "annual") {
      return jsonResponse({ error: "invalid_interval" }, 400);
    }
  } else {
    // SHOP-12: second rate limit, scoped to the shop branch only. Same hourly
    // window, but capped at 10/hour across all tiers (free/pro/elite all 10).
    const rlShop = await rateLimitFn(ctx.userId, ctx.tier, {
      key: "create-checkout-session-shop",
      limits: { free: 10, pro: 10, elite: 10 },
      windowSeconds: 3600,
    });
    if (!rlShop.allowed) {
      return createRateLimitResponse(rlShop.retryAfterSeconds, "user");
    }

    if (!isPackSize(body.pack_size)) {
      return jsonResponse({ error: "invalid_pack_size" }, 400);
    }
  }

  const supabase = deps.supabase ?? getServiceClient();
  const stripe = deps.stripe ?? getStripeClient();

  // Lazy customer creation (D-21): read existing id, otherwise create + write
  // back. Runs BEFORE the mode branch so both subscription and payment sessions
  // share the same customer record.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email, stripe_subscription_id")
    .eq("id", ctx.userId)
    .single();

  // PGRST116 = no rows (profile not yet materialised for this user); treat as
  // "no customer yet" and fall through to lazy-create. Any other DB error
  // would otherwise surface as a misleading CORS failure, so return 500 with
  // CORS headers intact via jsonResponse.
  if (profileErr && (profileErr as { code?: string }).code !== "PGRST116") {
    log.error("profile-lookup-failed", {
      userId: ctx.userId,
      code: (profileErr as { code?: string }).code,
    });
    return jsonResponse({ error: "profile_lookup_failed" }, 500);
  }

  let customerId: string | null =
    (profile?.stripe_customer_id as string | null) ?? null;

  // PRICE-03: read the caller's OWN existing subscription id from their profile
  // row (keyed on ctx.userId above) — never from the request body. A non-null
  // value means this is an upgrade-in-place, not a net-new checkout (T-33-04).
  const existingSubId: string | null =
    (profile?.stripe_subscription_id as string | null) ?? null;

  // Mirror WR-05 pattern from create-payment-intent: uncaught throws here
  // escape Deno.serve without CORS headers and surface as "failed to fetch"
  // on the client, hiding the real failure behind a misleading toast.
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: ctx.email,
        metadata: { user_id: ctx.userId },
      });
      customerId = customer.id;
      await supabase.from("profiles")
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctx.userId);
    } catch (err) {
      log.error("customer-create-failed", {
        userId: ctx.userId,
        err: err instanceof Error ? err.message : String(err),
      });
      return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
    }
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  let session: Stripe.Checkout.Session;

  if (body.mode === "subscription") {
    const priceId = resolvePriceId(body.tier, body.interval);
    if (!priceId) {
      log.error("price-id-not-configured", {
        tier: body.tier,
        interval: body.interval,
      });
      return jsonResponse({ error: "price_not_configured" }, 500);
    }

    // PRICE-03 swap branch: an EXISTING subscriber upgrading/changing tier must
    // have their current subscription's item swapped to the target price in
    // place — NOT a second active subscription minted via checkout.sessions.create
    // (which double-bills, per Stripe docs). The swap fires
    // customer.subscription.updated, which the existing webhook upgrade-diff
    // branch handles (tier write + grant_upgrade_diff + merit reset) — so we do
    // NOT write tier/merits here. existingSubId comes only from the caller's own
    // ctx.userId-keyed profile row (T-33-04). The target price is always
    // env-resolved (T-33-05); a client-supplied price is ignored by normalizeBody.
    if (existingSubId) {
      try {
        const sub = await stripe.subscriptions.retrieve(existingSubId);
        const itemId = sub.items?.data?.[0]?.id;
        // CR-01: a missing item id must NOT be passed to subscriptions.update.
        // Stripe treats `{ id: undefined, price }` as "add a new item" rather
        // than "replace the existing one", minting a SECOND active item on the
        // subscription — the exact double-billing this swap branch prevents.
        // Fail loudly instead of silently double-charging.
        if (!itemId) {
          log.error("subscription-swap-no-item-id", {
            userId: ctx.userId,
            subscriptionId: existingSubId,
          });
          return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
        }
        await stripe.subscriptions.update(existingSubId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: "create_prorations",
        });
        log.info("subscription-swapped", {
          userId: ctx.userId,
          subscriptionId: existingSubId,
          tier: body.tier,
          interval: body.interval,
        });
        return jsonResponse({ mode: "swap", tier: body.tier }, 200);
      } catch (err) {
        // No usable card on file → tell the frontend to route to the portal so
        // the user can add a payment method, rather than failing silently.
        if (isMissingPaymentMethodError(err)) {
          log.warn("subscription-swap-portal-required", {
            userId: ctx.userId,
            subscriptionId: existingSubId,
          });
          return jsonResponse({ mode: "portal_required" }, 200);
        }
        log.error("subscription-swap-failed", {
          userId: ctx.userId,
          subscriptionId: existingSubId,
          err: err instanceof Error ? err.message : String(err),
        });
        return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
      }
    }

    try {
      if (body.ui_mode === "embedded") {
        // Embedded checkout: return clientSecret instead of redirect URL
        session = await stripe.checkout.sessions.create({
          ui_mode: "embedded",
          mode: "subscription",
          customer: customerId!,
          line_items: [{ price: priceId, quantity: 1 }],
          return_url: `${appUrl}/dashboard?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
          client_reference_id: ctx.userId,
          metadata: {
            user_id: ctx.userId,
            tier: body.tier,
            interval: body.interval,
          },
        });
        log.info("checkout-session-created", {
          userId: ctx.userId,
          mode: "subscription",
          tier: body.tier,
          interval: body.interval,
          sessionId: session.id,
          uiMode: "embedded",
          stripeMode: getStripeMode(),
        });
        // `stripeMode` (NOT `mode` — that key already carries swap/portal_required
        // semantics on this contract) lets the frontend detect a test/live split
        // against its build-time publishable key. See _shared/stripe-client.ts.
        return jsonResponse(
          { clientSecret: session.client_secret, id: session.id, stripeMode: getStripeMode() },
          200,
        );
      }

      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId!,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing?canceled=1`,
        client_reference_id: ctx.userId,
        metadata: {
          user_id: ctx.userId,
          tier: body.tier,
          interval: body.interval,
        },
      });
      log.info("checkout-session-created", {
        userId: ctx.userId,
        mode: "subscription",
        tier: body.tier,
        interval: body.interval,
        sessionId: session.id,
        uiMode: "redirect",
      });
    } catch (err) {
      log.error("checkout-session-create-failed", {
        userId: ctx.userId,
        mode: "subscription",
        tier: body.tier,
        err: err instanceof Error ? err.message : String(err),
      });
      return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
    }
  } else {
    const shopPriceId = resolveShopPriceId(body.pack_size);
    if (!shopPriceId) {
      log.error("shop-price-id-not-configured", { packSize: body.pack_size });
      return jsonResponse({ error: "price_not_configured" }, 500);
    }

    try {
      if (body.ui_mode === "embedded") {
        // Embedded checkout: return clientSecret instead of redirect URL
        session = await stripe.checkout.sessions.create({
          ui_mode: "embedded",
          mode: "payment",
          customer: customerId!,
          line_items: [{ price: shopPriceId, quantity: 1 }],
          return_url: `${appUrl}/pricing?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
          client_reference_id: ctx.userId,
          metadata: {
            user_id: ctx.userId,
            pack_size: String(body.pack_size),
          },
          // Pitfall 9: payment_intent_data.metadata mirrors session.metadata so the
          // webhook can credit Merits via either the checkout.session.completed or
          // payment_intent.succeeded path without losing the user_id correlation.
          payment_intent_data: {
            metadata: {
              user_id: ctx.userId,
              pack_size: String(body.pack_size),
            },
          },
        });
        log.info("checkout-session-created", {
          userId: ctx.userId,
          mode: "payment",
          pack_size: body.pack_size,
          sessionId: session.id,
          uiMode: "embedded",
          stripeMode: getStripeMode(),
        });
        return jsonResponse(
          { clientSecret: session.client_secret, id: session.id, stripeMode: getStripeMode() },
          200,
        );
      }

      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId!,
        line_items: [{ price: shopPriceId, quantity: 1 }],
        success_url: `${appUrl}/pricing?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing?canceled=1`,
        client_reference_id: ctx.userId,
        metadata: {
          user_id: ctx.userId,
          pack_size: String(body.pack_size),
        },
        // Pitfall 9: payment_intent_data.metadata mirrors session.metadata so the
        // webhook can credit Merits via either the checkout.session.completed or
        // payment_intent.succeeded path without losing the user_id correlation.
        payment_intent_data: {
          metadata: {
            user_id: ctx.userId,
            pack_size: String(body.pack_size),
          },
        },
      });
      log.info("checkout-session-created", {
        userId: ctx.userId,
        mode: "payment",
        pack_size: body.pack_size,
        sessionId: session.id,
        uiMode: "redirect",
      });
    } catch (err) {
      log.error("checkout-session-create-failed", {
        userId: ctx.userId,
        mode: "payment",
        packSize: body.pack_size,
        err: err instanceof Error ? err.message : String(err),
      });
      return jsonResponse({ error: "checkout_session_creation_failed" }, 500);
    }
  }

  return jsonResponse({ url: session.url, id: session.id }, 200);
}

// Production entry point — test code imports handleCreateCheckoutSession directly.
// withCors guarantees origin-aware CORS on success, error, and OPTIONS preflight
// (CORS-02, CORS-05); the handler internals are unchanged.
Deno.serve((req) => withCors(req, 'user', () => handleCreateCheckoutSession(req)));
