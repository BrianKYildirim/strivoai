/**
 * create-payment-intent edge function — Phase 24 Plan 06 (TOPUP-03, SHOP-11).
 *
 * Creates a Stripe PaymentIntent for an embedded-PaymentElement top-up pack
 * purchase (D-23: distinct from the subscription Checkout redirect flow).
 *
 * Contract:
 *   POST { pack_id: 'pack_3' | 'pack_10' | 'pack_25' | 'pack_50' }
 *   → 200 { clientSecret, paymentIntentId }
 *
 * Invariants:
 * - requireAuth({type:'user'}) gates every request.
 * - pack_id is validated against PACKS_BY_ID (dual-imported from
 *   src/config/pricing-config.ts per D-02) — never trust client-supplied price.
 * - metadata.user_id is set from ctx.userId (the body shape does NOT accept
 *   user_id, so spoofing is impossible — T-24-26).
 * - metadata.pack_id + metadata.pack_size are both written so the Plan 02
 *   stripe-webhook-handler payment_intent.succeeded branch can credit Merits
 *   idempotently via credit_shop_merits(p_user_id, p_pack_size, p_stripe_payment_id).
 * - Lazy Stripe customer creation (D-21): copied from create-checkout-session.
 * - Rate-limited to 10/hr for every tier (matches the SHOP-12 shape used by the
 *   payment branch of create-checkout-session).
 * - automatic_payment_methods: { enabled: true } is required for the embedded
 *   PaymentElement (Stripe picks the payment methods the user is eligible for).
 * - On any Stripe error, log server-side and return bare
 *   { error: 'payment_intent_creation_failed' } — no stack trace or internal
 *   detail in the response body (fail-closed per D-27, T-24-28).
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
  PACKS_BY_ID,
  type PackId,
} from "../../../src/config/pricing-config.ts";

const log = createLogger("create-payment-intent");

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

type PaymentIntentBody = { pack_id: PackId };

function isPackId(v: unknown): v is PackId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PACKS_BY_ID, v);
}

function normalizeBody(raw: unknown): PaymentIntentBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!isPackId(b.pack_id)) return null;
  return { pack_id: b.pack_id };
}

export interface CreatePaymentIntentDeps {
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

export async function handleCreatePaymentIntent(
  req: Request,
  deps: CreatePaymentIntentDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "user" });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // ── Auth — propagate Response on failure ────────────────────────────
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

  // ── Rate limit (SHOP-12 shape: 10/hr across every tier) ─────────────
  const rateLimitFn = deps.checkRateLimit ?? realCheckRateLimit;
  const rl = await rateLimitFn(ctx.userId, ctx.tier, {
    key: "create-payment-intent",
    limits: { free: 10, pro: 10, elite: 10 },
    windowSeconds: 3600,
  });
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfterSeconds, "user");

  // ── Body parse + pack validation ────────────────────────────────────
  const rawBody = await req.json().catch(() => null);
  // Distinguish "missing/invalid body shape" (no pack_id, malformed JSON, etc.)
  // from "body parsed but pack_id references a pack that isn't in PACKS_BY_ID".
  // Tests expect invalid_pack_id when the body supplies a non-catalog string.
  if (!rawBody || typeof rawBody !== "object") {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const rawPackId = (rawBody as Record<string, unknown>).pack_id;
  if (rawPackId === undefined || typeof rawPackId !== "string") {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  if (!isPackId(rawPackId)) {
    return jsonResponse({ error: "invalid_pack_id" }, 400);
  }
  const body = normalizeBody(rawBody);
  if (!body) return jsonResponse({ error: "invalid_body" }, 400);

  const pack = PACKS_BY_ID[body.pack_id];
  if (!pack) return jsonResponse({ error: "invalid_pack_id" }, 400);

  const supabase = deps.supabase ?? getServiceClient();
  const stripe = deps.stripe ?? getStripeClient();

  // ── Lazy customer creation (D-21, copied from create-checkout-session) ──
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", ctx.userId)
    .single();

  let customerId: string | null =
    (profile?.stripe_customer_id as string | null) ?? null;

  // WR-05: wrap the lazy-customer block in its own try/catch mirroring the PI
  // create below. Previously an error from stripe.customers.create or the
  // follow-up profiles UPDATE bubbled out uncaught — the frontend saw a CORS
  // error instead of { error: 'payment_intent_creation_failed' }, hiding the
  // failure behind a misleading toast.
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
      return jsonResponse({ error: "payment_intent_creation_failed" }, 500);
    }
  }

  // ── Create PaymentIntent ────────────────────────────────────────────
  // metadata carries user_id + pack_id + pack_size so the Plan 02 webhook
  // branch on payment_intent.succeeded can credit Merits idempotently via
  // credit_shop_merits(p_user_id, p_pack_size, p_stripe_payment_id).
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: pack.priceCents,
      currency: "usd",
      customer: customerId!,
      automatic_payment_methods: { enabled: true },
      metadata: {
        user_id: ctx.userId,
        pack_id: pack.id,
        pack_size: String(pack.merits),
      },
    });
  } catch (err) {
    log.error("payment-intent-creation-failed", {
      userId: ctx.userId,
      packId: pack.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse({ error: "payment_intent_creation_failed" }, 500);
  }

  log.info("payment-intent-created", {
    userId: ctx.userId,
    packId: pack.id,
    packSize: pack.merits,
    priceCents: pack.priceCents,
    paymentIntentId: pi.id,
  });

  // A PaymentIntent client secret (`pi_…_secret_…`) does NOT encode test/live, so
  // unlike the Checkout Session path the frontend cannot infer our mode from it.
  // Report it explicitly — this is the field that would have caught the
  // 2026-07-17 pk_test-vs-sk_live production mismatch at mount time instead of at
  // payment time. See _shared/stripe-client.ts:getStripeMode.
  return jsonResponse({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    stripeMode: getStripeMode(),
  }, 200);
}

// Production entry point — test code imports handleCreatePaymentIntent directly.
// withCors guarantees origin-aware CORS on success, error, and OPTIONS preflight
// (CORS-02, CORS-05); the handler internals are unchanged.
Deno.serve((req) => withCors(req, 'user', () => handleCreatePaymentIntent(req)));
