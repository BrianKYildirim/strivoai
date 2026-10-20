/**
 * Phase 12 stripe-webhook-handler — supersedes Phase 07 stripe-webhook per D-06/D-07.
 *
 * HANDLED_EVENTS (6):
 *   1. customer.subscription.created  — write tier/status/ids/period_end
 *   2. customer.subscription.updated  — same + upgrade differential (grant_upgrade_diff)
 *                                       and downgrade-pending (pending_downgrade_tier)
 *   3. customer.subscription.deleted  — graceful cancel: status only, preserve tier (D-14)
 *   4. invoice.payment_succeeded      — monthly subs: reset_subscription_merits;
 *                                       yearly subs: NO-OP (pg_cron owns monthly refills)
 *   5. invoice.payment_failed         — subscription_status = 'past_due' (D-15)
 *   6. checkout.session.completed     — subscription mode: month-0 Merit grant + tier set;
 *                                       payment mode: shop credit via credit_shop_merits
 *
 * Flow:
 *   1. OPTIONS -> CORS preflight; non-POST -> 405.
 *   2. Read raw body via req.text() BEFORE any parse (STR-03 invariant).
 *   3. Verify via stripe.webhooks.constructEventAsync (SDK only, never hand-rolled — D-18).
 *   4. Short-circuit unknown event types with 200 + ignored:true (D-12).
 *   5. Insert-first idempotency into stripe_webhook_events; catch 23505 -> 200 duplicate (D-13).
 *   6. Extract identifiers + build profile update payload per event type.
 *   7. Profile lookup fallback chain: metadata.user_id (checkout) -> stripe_customer_id
 *      -> stripe_subscription_id -> email (D-11/D-17).
 *   8. Missing profile -> 200 with profileFound:false (avoid Stripe retry storm, NFR-07).
 *   9. Phase 12 router: Merit RPCs for checkout, invoice, upgrade/downgrade routing.
 *
 * Test hooks: handler accepts optional `deps = { supabase, stripe }` so unit tests
 * can inject fakes. Production path uses getServiceClient() + getStripeClient().
 */
import Stripe from "npm:stripe@14";
import { handleOptionsRequest } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  getStripeClient,
  getStripeCryptoProvider,
} from "../_shared/stripe-client.ts";
import { resolveTier } from "../_shared/price-resolver.ts";
import { addOneMonthIso } from "../_shared/date-utils.ts";

// ── Constants ───────────────────────────────────────────────────────────────

const HANDLED_EVENTS = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "checkout.session.completed",
  "payment_intent.succeeded", // Phase 24 TOPUP-02: embedded Payment Element path (D-23).
]);

const VALID_PACK_SIZES = [3, 10, 25, 50] as const;

// Phase 24: accepted pack ids (canonical form from pricing-config PACK_CATALOG).
const VALID_PACK_IDS = new Set<string>([
  "pack_3",
  "pack_10",
  "pack_25",
  "pack_50",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, elite: 2 };
function tierCompare(a: string | null, b: string | null): number {
  return (TIER_RANK[a ?? "free"] ?? 0) - (TIER_RANK[b ?? "free"] ?? 0);
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface StripeWebhookDeps {
  supabase?: SupabaseLike;
  stripe?: Stripe;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Profile lookup types ────────────────────────────────────────────────────

type ResolvedProfile = {
  id: string;
  email: string | null;
  subscription_tier: string | null;
};
type TryUpdateResult = {
  matched: boolean;
  resolved: ResolvedProfile | null;
  dbError?: boolean;
};
const UNIFORM_SELECT = "id, email, subscription_tier";

// ── Main handler ────────────────────────────────────────────────────────────

export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookDeps = {},
): Promise<Response> {
  const log = createLogger("stripe-webhook-handler");

  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "webhook" });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");

  // STR-03: raw body MUST be read before any parse
  const rawBody = await req.text();

  if (!webhookSecret) {
    log.warn("signature-verify-failed", { reason: "secret-missing" });
    return jsonResponse({ error: "invalid_signature" }, 401);
  }
  if (!signature) {
    log.warn("signature-verify-failed", { reason: "header-missing" });
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  const stripe = deps.stripe ?? getStripeClient();
  const cryptoProvider = getStripeCryptoProvider();

  let event: Stripe.Event;
  try {
    // D-18: signature verification via SDK only — never hand-rolled HMAC
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    log.warn("signature-verify-failed", {
      reason: "constructEventAsync-throw",
      message: err instanceof Error ? err.message : "unknown",
    });
    return jsonResponse({ error: "invalid_signature" }, 400);
  }

  // D-12: unknown event types short-circuit BEFORE the idempotency insert so
  // the events table never accumulates rows for events we do not care about.
  if (!HANDLED_EVENTS.has(event.type)) {
    log.info("event-ignored", { eventId: event.id, type: event.type });
    return jsonResponse(
      { received: true, ignored: true, type: event.type },
      200,
    );
  }

  const supabase = deps.supabase ?? getServiceClient();

  // D-13: insert-first idempotency. One round-trip. Catch 23505 for duplicates.
  const { error: insertError } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      log.info("event-duplicate", { eventId: event.id, type: event.type });
      return jsonResponse({ received: true, duplicate: true }, 200);
    }
    log.error("event-persist-failed", { eventId: event.id, code });
    return jsonResponse({ error: "internal_error" }, 500);
  }

  // Wrap the rest of the handler so we can delete the idempotency row on any
  // non-2xx. Without this cleanup, a transient 500 downstream (RPC failure,
  // profile UPDATE error, Stripe API timeout) leaves the row in place; Stripe
  // retries hit the 23505 short-circuit above, return 200 duplicate, and the
  // merit grants / tier writes are silently lost.
  const response = await processEvent();

  if (response.status >= 400) {
    const { error: deleteError } = await supabase
      .from("stripe_webhook_events")
      .delete()
      .eq("event_id", event.id);
    if (deleteError) {
      // Returning 500 here would trigger more retries that hit the same
      // delete failure. Degrade to 200 duplicate ack so Stripe stops
      // retrying; surface via the log for manual reconciliation.
      log.error("idempotency-delete-failed", {
        eventId: event.id,
        code: (deleteError as { code?: string }).code,
      });
      return jsonResponse(
        { received: true, duplicate: true, delete_failed: true },
        200,
      );
    }
  }

  return response;

  // Inner declaration hoisted so the call above resolves. Closes over event,
  // supabase, stripe, log, updateData, etc.
  async function processEvent(): Promise<Response> {

  // ── Extract identifiers and build the profile update payload ────────────

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let customerEmail: string | null = null;
  let metaUserId: string | null = null;

  if (event.type === "invoice.payment_failed") {
    // D-15: past_due only, no tier change
    // deno-lint-ignore no-explicit-any
    const inv = event.data.object as any;
    customerId = typeof inv.customer === "string"
      ? inv.customer
      : inv.customer?.id ?? null;
    subscriptionId = typeof inv.subscription === "string"
      ? inv.subscription
      : inv.subscription?.id ?? null;
    customerEmail = inv.customer_email ?? null;
    updateData.subscription_status = "past_due";
  } else if (event.type === "invoice.payment_succeeded") {
    // Extract identifiers for invoice.payment_succeeded — RPC call happens
    // in the post-match router section below.
    // deno-lint-ignore no-explicit-any
    const inv = event.data.object as any;
    customerId = typeof inv.customer === "string"
      ? inv.customer
      : inv.customer?.id ?? null;
    subscriptionId = typeof inv.subscription === "string"
      ? inv.subscription
      : inv.subscription?.id ?? null;
    customerEmail = inv.customer_email ?? null;
    // No updateData fields set here — the router handles the RPC.
  } else if (event.type === "checkout.session.completed") {
    // deno-lint-ignore no-explicit-any
    const session = event.data.object as any;
    customerId = typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
    subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : null;
    customerEmail = session.customer_details?.email ?? null;
    metaUserId = session.metadata?.user_id ?? null;

    if (session.mode === "subscription") {
      const tier = session.metadata?.tier;
      if (tier === "pro" || tier === "elite") {
        updateData.subscription_tier = tier;
        updateData.subscription_status = "active";
        if (customerId) updateData.stripe_customer_id = customerId;
        if (subscriptionId) updateData.stripe_subscription_id = subscriptionId;
        // current_period_end is set by customer.subscription.created — do NOT null it
        // here because subscription.created may have already arrived (out-of-order).
      }
    }
    // payment mode does NOT update profile fields (shop does not change tier)
  } else if (event.type === "payment_intent.succeeded") {
    // Phase 24 TOPUP-02: embedded Payment Element top-up (D-23).
    // Extract identifiers WITHOUT writing any profile fields — this event
    // is a shop purchase signal; subscription_tier / subscription_status
    // must NOT be touched. updateData stays { updated_at } only.
    // deno-lint-ignore no-explicit-any
    const pi = event.data.object as any;
    customerId = typeof pi.customer === "string"
      ? pi.customer
      : pi.customer?.id ?? null;
    subscriptionId = null; // PI is not a subscription reference
    customerEmail = pi.receipt_email ?? null;
    metaUserId = typeof pi.metadata?.user_id === "string"
      ? pi.metadata.user_id
      : null;
  } else {
    // customer.subscription.{created,updated,deleted}
    // deno-lint-ignore no-explicit-any
    const sub = event.data.object as any;
    customerId = typeof sub.customer === "string"
      ? sub.customer
      : sub.customer?.id ?? null;
    subscriptionId = sub.id ?? null;
    customerEmail = typeof sub.customer === "object"
      ? sub.customer?.email ?? null
      : null;

    const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;

    if (customerId) updateData.stripe_customer_id = customerId;
    if (subscriptionId) updateData.stripe_subscription_id = subscriptionId;

    if (sub.current_period_end) {
      // Pitfall 5: Stripe sends unix seconds, Postgres wants ISO
      updateData.current_period_end = new Date(
        sub.current_period_end * 1000,
      ).toISOString();
    }

    if (event.type === "customer.subscription.deleted") {
      // D-14: graceful cancel — status only, tier stays so the user retains
      // access through current_period_end (can_perform_ai_action enforces).
      updateData.subscription_status = "canceled";
    } else {
      updateData.subscription_status = sub.status ?? "active";
      if (priceId) updateData.stripe_price_id = priceId;
      // For subscription.updated, defer tier write so the lookup chain returns
      // the OLD tier — needed to detect upgrades vs downgrades (CR-01 fix).
      if (event.type !== "customer.subscription.updated") {
        updateData.subscription_tier = resolveTier(priceId);
      }
    }
  }

  // ── Profile lookup fallback chain ───────────────────────────────────────
  // D-17 extended with D-11: metadata.user_id first for checkout events.

  let resolvedUserId: string | null = null;
  let resolvedCurrentTier: string | null = null;

  const tryUpdateById = async (
    userId: string | null,
  ): Promise<TryUpdateResult> => {
    if (!userId) return { matched: false, resolved: null };
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select(UNIFORM_SELECT);
    if (error) {
      log.error("profile-update-db-error", { column: "id", code: (error as { code?: string }).code });
      return { matched: false, resolved: null, dbError: true };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { matched: true, resolved: data[0] as ResolvedProfile };
    }
    return { matched: false, resolved: null };
  };

  const tryUpdateByCustomerId = async (
    cid: string | null,
  ): Promise<TryUpdateResult> => {
    if (!cid) return { matched: false, resolved: null };
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("stripe_customer_id", cid)
      .select(UNIFORM_SELECT);
    if (error) {
      log.error("profile-update-db-error", { column: "stripe_customer_id", code: (error as { code?: string }).code });
      return { matched: false, resolved: null, dbError: true };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { matched: true, resolved: data[0] as ResolvedProfile };
    }
    return { matched: false, resolved: null };
  };

  const tryUpdateBySubscriptionId = async (
    sid: string | null,
  ): Promise<TryUpdateResult> => {
    if (!sid) return { matched: false, resolved: null };
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("stripe_subscription_id", sid)
      .select(UNIFORM_SELECT);
    if (error) {
      log.error("profile-update-db-error", {
        column: "stripe_subscription_id",
        code: (error as { code?: string }).code,
      });
      return { matched: false, resolved: null, dbError: true };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { matched: true, resolved: data[0] as ResolvedProfile };
    }
    return { matched: false, resolved: null };
  };

  const tryUpdateByEmail = async (
    email: string | null,
  ): Promise<TryUpdateResult> => {
    if (!email) return { matched: false, resolved: null };
    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("email", email)
      .select(UNIFORM_SELECT);
    if (error) {
      log.error("profile-update-db-error", { column: "email", code: (error as { code?: string }).code });
      return { matched: false, resolved: null, dbError: true };
    }
    if (Array.isArray(data) && data.length > 0) {
      return { matched: true, resolved: data[0] as ResolvedProfile };
    }
    return { matched: false, resolved: null };
  };

  let matchedBy: string | null = null;
  let dbErrorEncountered = false;

  // For checkout.session.completed (D-11) and payment_intent.succeeded
  // (Phase 24 TOPUP-02 / D-23), try metadata.user_id FIRST.
  if (
    (event.type === "checkout.session.completed" ||
      event.type === "payment_intent.succeeded") &&
    metaUserId
  ) {
    const r = await tryUpdateById(metaUserId);
    if (r.dbError) dbErrorEncountered = true;
    if (r.matched && r.resolved) {
      resolvedUserId = r.resolved.id;
      resolvedCurrentTier = r.resolved.subscription_tier;
      matchedBy = "metadata_user_id";
    }
  }

  if (!matchedBy) {
    const r = await tryUpdateByCustomerId(customerId);
    if (r.dbError) dbErrorEncountered = true;
    if (r.matched && r.resolved) {
      resolvedUserId = r.resolved.id;
      resolvedCurrentTier = r.resolved.subscription_tier;
      matchedBy = "stripe_customer_id";
    }
  }

  if (!matchedBy) {
    const r = await tryUpdateBySubscriptionId(subscriptionId);
    if (r.dbError) dbErrorEncountered = true;
    if (r.matched && r.resolved) {
      resolvedUserId = r.resolved.id;
      resolvedCurrentTier = r.resolved.subscription_tier;
      matchedBy = "stripe_subscription_id";
    }
  }

  if (!matchedBy) {
    const r = await tryUpdateByEmail(customerEmail);
    if (r.dbError) dbErrorEncountered = true;
    if (r.matched && r.resolved) {
      resolvedUserId = r.resolved.id;
      resolvedCurrentTier = r.resolved.subscription_tier;
      matchedBy = "email";
    }
  }

  if (!matchedBy) {
    if (dbErrorEncountered) {
      log.error("profile-lookup-db-error", {
        eventId: event.id,
        type: event.type,
        searched: {
          hasCustomerId: !!customerId,
          hasSubscriptionId: !!subscriptionId,
          hasEmail: !!customerEmail,
          hasMetaUserId: !!metaUserId,
        },
      });
      return jsonResponse({ error: "profile_lookup_failed" }, 500);
    }
    log.info("profile-not-found", {
      eventId: event.id,
      type: event.type,
      searched: {
        hasCustomerId: !!customerId,
        hasSubscriptionId: !!subscriptionId,
        hasEmail: !!customerEmail,
        hasMetaUserId: !!metaUserId,
      },
    });
    // CR-01: For `payment_intent.succeeded` specifically, a missing profile
    // means the user has paid Stripe but we cannot credit their merits. Unlike
    // subscription events (which Stripe continues to re-deliver as tier state
    // evolves), a top-up PI is a single event — if we swallow it with a 200
    // the idempotency row is permanent and any later profile back-fill
    // (stripe_customer_id link, late profiles row, email change) will never
    // retrigger the credit. Delete the idempotency row and force a 500 so
    // Stripe's built-in retry schedule can re-run this branch once the
    // profile becomes reachable. Other event types keep the profileFound:false
    // behavior to avoid retry storms (NFR-07).
    if (event.type === "payment_intent.succeeded") {
      log.warn("payment-intent-no-profile-retry", { eventId: event.id });
      return jsonResponse({ error: "profile_not_found_retry" }, 500);
    }
    return jsonResponse({ received: true, profileFound: false }, 200);
  }

  // ── Phase 12 router — only runs if profile was matched ──────────────────

  try {
    if (event.type === "checkout.session.completed") {
      // deno-lint-ignore no-explicit-any
      const session = event.data.object as any;
      const userId = resolvedUserId;
      if (!userId) throw new Error("checkout-no-user-id-after-match");

      if (session.mode === "subscription") {
        const tier = session.metadata?.tier;
        if (tier !== "pro" && tier !== "elite") {
          log.warn("checkout-invalid-tier", { eventId: event.id, tier });
          return jsonResponse(
            { received: true, matchedBy, warning: "invalid_tier" },
            200,
          );
        }
        // D-20 / SUB-13: Full grant per CONTEXT D-20 (Option A resolved at checkpoint)
        const { error: rpcErr } = await supabase.rpc(
          "reset_subscription_merits",
          {
            p_user_id: userId,
            p_tier: tier,
            p_next_reset_date: addOneMonthIso(new Date()),
          },
        );
        if (rpcErr) {
          log.error("reset-merits-rpc-failed", {
            eventId: event.id,
            code: (rpcErr as { code?: string }).code,
          });
          return jsonResponse({ error: "rpc_failed" }, 500);
        }
        log.info("checkout-subscription-granted", {
          eventId: event.id,
          userId,
          tier,
        });
      } else if (session.mode === "payment") {
        const packSize = parseInt(session.metadata?.pack_size ?? "0", 10);
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        if (
          !(VALID_PACK_SIZES as readonly number[]).includes(packSize) ||
          !paymentIntentId
        ) {
          log.warn("checkout-invalid-shop-metadata", {
            eventId: event.id,
            packSize,
            hasPI: !!paymentIntentId,
          });
          return jsonResponse(
            { received: true, matchedBy, warning: "invalid_shop_metadata" },
            200,
          );
        }
        const { error: rpcErr } = await supabase.rpc("credit_shop_merits", {
          p_user_id: userId,
          p_pack_size: packSize,
          p_stripe_payment_id: paymentIntentId,
        });
        if (rpcErr) {
          log.error("credit-shop-rpc-failed", {
            eventId: event.id,
            code: (rpcErr as { code?: string }).code,
          });
          return jsonResponse({ error: "rpc_failed" }, 500);
        }
        log.info("checkout-shop-credited", {
          eventId: event.id,
          userId,
          packSize,
        });

        // D-19/D-20: fire-and-forget receipt email
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceKey) {
          const { data: receiptProfile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", userId)
            .single();
          if (receiptProfile?.email) {
            fetch(`${supabaseUrl}/functions/v1/send-strivo-email`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: receiptProfile.email,
                userName: receiptProfile.full_name || undefined,
                emailType: "shop_receipt",
                metadata: {
                  packSize: String(packSize),
                  amountPaid: session.amount_total
                    ? (session.amount_total / 100).toFixed(2)
                    : "N/A",
                  purchaseDate: new Date().toISOString(),
                  billingUrl: `${Deno.env.get("APP_URL") || ""}/pricing`,
                },
              }),
            }).catch((err) =>
              log.error("receipt-email-failed", {
                eventId: event.id,
                err: String(err),
              })
            );
          }
        }
      }
    } else if (event.type === "invoice.payment_succeeded") {
      // deno-lint-ignore no-explicit-any
      const inv = event.data.object as any;
      const subId =
        typeof inv.subscription === "string" ? inv.subscription : null;
      if (!subId) {
        return jsonResponse(
          { received: true, matchedBy, noop: "no-subscription" },
          200,
        );
      }

      // Retrieve subscription to determine interval (month vs year).
      // If this Stripe API call fails after the idempotency insert, delete the
      // idempotency record so the next retry can re-execute the merit grant.
      let sub: Stripe.Subscription;
      try {
        sub = await stripe.subscriptions.retrieve(subId);
      } catch (stripeErr) {
        log.error("stripe-retrieve-failed", {
          eventId: event.id,
          subId,
          message: stripeErr instanceof Error ? stripeErr.message : "unknown",
        });
        return jsonResponse({ error: "stripe_api_failed" }, 500);
      }
      const interval = (sub.items?.data?.[0]?.price?.recurring?.interval ??
        // deno-lint-ignore no-explicit-any
        (sub.items?.data?.[0] as any)?.plan?.interval) as string | undefined;

      if (interval === "year") {
        log.info("payment-succeeded-yearly-noop", {
          eventId: event.id,
          subId,
        });
        return jsonResponse(
          { received: true, matchedBy, noop: "yearly-handled-by-cron" },
          200,
        );
      }

      // monthly -> call reset_subscription_merits
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const tier = resolveTier(priceId);
      if (tier !== "pro" && tier !== "elite") {
        log.warn("payment-succeeded-unknown-tier", {
          eventId: event.id,
          priceId,
        });
        return jsonResponse(
          { received: true, matchedBy, warning: "unknown_tier" },
          200,
        );
      }
      const userId = resolvedUserId;
      if (!userId) {
        return jsonResponse(
          { received: true, matchedBy, warning: "no_user_id" },
          200,
        );
      }
      const { error: rpcErr } = await supabase.rpc(
        "reset_subscription_merits",
        {
          p_user_id: userId,
          p_tier: tier,
          p_next_reset_date: addOneMonthIso(new Date()),
        },
      );
      if (rpcErr) {
        log.error("reset-merits-rpc-failed", {
          eventId: event.id,
          code: (rpcErr as { code?: string }).code,
        });
        return jsonResponse({ error: "rpc_failed" }, 500);
      }
      log.info("monthly-grant-applied", { eventId: event.id, userId, tier });
    } else if (event.type === "customer.subscription.updated") {
      // Upgrade-diff / downgrade-pending logic
      // deno-lint-ignore no-explicit-any
      const sub = event.data.object as any;
      const priceId = sub.items?.data?.[0]?.price?.id ?? null;
      const newTier = resolveTier(priceId);
      const prevTier = resolvedCurrentTier ?? "free";

      if (sub.cancel_at_period_end === true) {
        // Cancel at period end -> schedule downgrade to free
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ pending_downgrade_tier: "free" })
          .eq("id", resolvedUserId);
        if (updateErr) {
          log.error("profile-pending-downgrade-write-failed", {
            eventId: event.id,
            code: (updateErr as { code?: string }).code,
          });
          return jsonResponse({ error: "profile_update_failed" }, 500);
        }
        log.info("downgrade-scheduled", {
          eventId: event.id,
          from: prevTier,
          to: "free",
        });
      } else if (tierCompare(newTier, prevTier) > 0) {
        // Upgrade: grant differential Merits + update tier
        const { error: rpcErr } = await supabase.rpc("grant_upgrade_diff", {
          p_user_id: resolvedUserId,
          p_from_tier: prevTier,
          p_to_tier: newTier,
        });
        if (rpcErr) {
          log.error("upgrade-diff-rpc-failed", {
            eventId: event.id,
            code: (rpcErr as { code?: string }).code,
          });
          return jsonResponse({ error: "rpc_failed" }, 500);
        }
        // Write the new tier now that upgrade-diff is granted
        const { error: tierErr } = await supabase
          .from("profiles")
          .update({
            subscription_tier: newTier,
            pending_downgrade_tier: null,
          })
          .eq("id", resolvedUserId);
        if (tierErr) {
          log.error("profile-tier-write-failed", {
            eventId: event.id,
            code: (tierErr as { code?: string }).code,
          });
          return jsonResponse({ error: "profile_update_failed" }, 500);
        }
        log.info("upgrade-diff-applied", {
          eventId: event.id,
          from: prevTier,
          to: newTier,
        });
      } else if (tierCompare(newTier, prevTier) < 0) {
        // Downgrade — keep current tier, set pending for period end
        const { error: downgradeErr } = await supabase
          .from("profiles")
          .update({ pending_downgrade_tier: newTier })
          .eq("id", resolvedUserId);
        if (downgradeErr) {
          log.error("profile-pending-downgrade-write-failed", {
            eventId: event.id,
            code: (downgradeErr as { code?: string }).code,
          });
          return jsonResponse({ error: "profile_update_failed" }, 500);
        }
        log.info("downgrade-scheduled", {
          eventId: event.id,
          from: prevTier,
          to: newTier,
        });
      } else {
        // Same tier (e.g. price change within tier) — write tier to be safe
        const { error: sameTierErr } = await supabase
          .from("profiles")
          .update({
            subscription_tier: newTier,
            pending_downgrade_tier: null,
          })
          .eq("id", resolvedUserId);
        if (sameTierErr) {
          log.error("profile-tier-write-failed", {
            eventId: event.id,
            code: (sameTierErr as { code?: string }).code,
          });
          return jsonResponse({ error: "profile_update_failed" }, 500);
        }
      }
    } else if (event.type === "payment_intent.succeeded") {
      // Phase 24 TOPUP-02 / D-04 / D-23: embedded Payment Element top-up.
      // Idempotency layers:
      //   1. stripe_webhook_events.event_id UNIQUE (already enforced above)
      //   2. merit_shop_purchases.stripe_payment_intent_id UNIQUE (RPC pre-check)
      //   3. merit_transactions_stripe_pi_unique partial (RPC safety net)
      // deno-lint-ignore no-explicit-any
      const pi = event.data.object as any;
      const userId = resolvedUserId;
      if (!userId) {
        log.warn("payment-intent-no-user", { eventId: event.id, piId: pi.id });
        return jsonResponse(
          { received: true, profileFound: false },
          200,
        );
      }

      const packId = typeof pi.metadata?.pack_id === "string"
        ? pi.metadata.pack_id
        : null;
      if (!packId || !VALID_PACK_IDS.has(packId)) {
        log.warn("payment-intent-invalid-pack", {
          eventId: event.id,
          piId: pi.id,
          packId,
        });
        return jsonResponse(
          { received: true, warning: "invalid_shop_metadata" },
          200,
        );
      }

      // Parse pack_size from pack_id (e.g. 'pack_25' -> 25).
      const packSize = parseInt(packId.replace(/^pack_/, ""), 10);
      if (!(VALID_PACK_SIZES as readonly number[]).includes(packSize)) {
        log.warn("payment-intent-invalid-pack-size", {
          eventId: event.id,
          packId,
          packSize,
        });
        return jsonResponse(
          { received: true, warning: "invalid_shop_metadata" },
          200,
        );
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "credit_shop_merits",
        {
          p_user_id: userId,
          p_pack_size: packSize,
          p_stripe_payment_id: pi.id,
        },
      );
      if (rpcErr) {
        log.error("payment-intent-rpc-failed", {
          eventId: event.id,
          piId: pi.id,
          code: (rpcErr as { code?: string }).code,
        });
        return jsonResponse({ error: "rpc_failed" }, 500);
      }

      const duplicate =
        (rpcData as { duplicate?: boolean } | null)?.duplicate === true;
      log.info("payment-intent-credited", {
        eventId: event.id,
        piId: pi.id,
        userId,
        packId,
        packSize,
        duplicate,
      });

      return jsonResponse(
        {
          received: true,
          matchedBy,
          packId,
          duplicate,
        },
        200,
      );
    }
    // customer.subscription.deleted — D-14 graceful cancel: status-only write
    // already applied via updateData above. No additional router logic needed.
    // invoice.payment_failed — past_due status already written via updateData.
    // No additional router logic needed.
  } catch (err) {
    log.error("router-failed", {
      eventId: event.id,
      type: event.type,
      message: err instanceof Error ? err.message : "unknown",
    });
    return jsonResponse({ error: "router_failed" }, 500);
  }

  log.info("event-processed", {
    eventId: event.id,
    type: event.type,
    matchedBy,
  });
  return jsonResponse({ received: true, matchedBy }, 200);
  }
}

// Production entry point — test code imports handleStripeWebhook directly.
Deno.serve((req) => handleStripeWebhook(req));
