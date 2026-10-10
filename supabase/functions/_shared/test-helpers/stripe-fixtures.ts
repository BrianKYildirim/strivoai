/**
 * Test-only Stripe event fixture builders for the 4 event types the
 * stripe-webhook handler routes on. Shape mirrors `Stripe.Event` closely
 * enough for routing and field extraction — not a complete mock.
 *
 * Used by stripe-webhook integration tests (Plan 07-03). This file lives
 * under `test-helpers/` and MUST NOT be imported from production code.
 */

export interface SubscriptionEventParams {
  customerId: string;
  subscriptionId: string;
  priceId: string;
  currentPeriodEnd: number; // unix seconds
  email?: string;
  status?: string;
  /** When true, `customer` is expanded to `{ id, email }` instead of a string. */
  expandCustomer?: boolean;
}

export interface InvoicePaymentFailedParams {
  customerId: string;
  subscriptionId: string;
  email?: string;
}

type SubscriptionObject = {
  id: string;
  customer: string | { id: string; email?: string };
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string } }> };
};

function randomEventId(): string {
  return `evt_test_${Math.random().toString(36).slice(2, 12)}`;
}

function buildSubscriptionObject(params: SubscriptionEventParams): SubscriptionObject {
  const {
    customerId,
    subscriptionId,
    priceId,
    currentPeriodEnd,
    email,
    status = 'active',
    expandCustomer = false,
  } = params;

  const customer = expandCustomer
    ? { id: customerId, email }
    : customerId;

  return {
    id: subscriptionId,
    customer,
    status,
    current_period_end: currentPeriodEnd,
    items: { data: [{ price: { id: priceId } }] },
  };
}

export function makeSubscriptionCreatedEvent(params: SubscriptionEventParams) {
  return {
    id: randomEventId(),
    type: 'customer.subscription.created',
    data: { object: buildSubscriptionObject(params) },
  };
}

export function makeSubscriptionUpdatedEvent(params: SubscriptionEventParams) {
  return {
    id: randomEventId(),
    type: 'customer.subscription.updated',
    data: { object: buildSubscriptionObject(params) },
  };
}

export function makeSubscriptionDeletedEvent(params: SubscriptionEventParams) {
  return {
    id: randomEventId(),
    type: 'customer.subscription.deleted',
    data: { object: buildSubscriptionObject({ ...params, status: params.status ?? 'canceled' }) },
  };
}

export function makeInvoicePaymentFailedEvent(params: InvoicePaymentFailedParams) {
  const { customerId, subscriptionId, email } = params;
  return {
    id: randomEventId(),
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: `in_test_${Math.random().toString(36).slice(2, 10)}`,
        customer: customerId,
        subscription: subscriptionId,
        customer_email: email,
      },
    },
  };
}

// ─── Phase 12 fixtures ──────────────────────────────────────────────────────
// The new `stripe-webhook-handler` routes two additional event types that
// the existing Phase 07 handler never saw: `checkout.session.completed`
// (subscription + shop payment modes) and `invoice.payment_succeeded`
// (monthly grant sweep vs. yearly no-op per 12-CONTEXT D-08). These factories
// give the Phase 12 Plans 04/05/06 tests Stripe.Event-shaped objects with the
// full envelope fields the new handler inspects: `id`, `object`, `api_version`,
// `created`, `livemode`, `type`, `data.object`.

const STRIPE_API_VERSION = '2024-11-20.acacia' as const;

function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export type CheckoutSessionMode = 'subscription' | 'payment';

export type CheckoutPackSize = 3 | 10 | 25 | 50;

export interface CheckoutSessionCompletedParams {
  mode: CheckoutSessionMode;
  user_id: string;
  /** Required when mode === 'subscription'. */
  tier?: 'pro' | 'elite';
  /** Required when mode === 'subscription'. */
  interval?: 'monthly' | 'annual';
  /** Required when mode === 'payment'. */
  pack_size?: CheckoutPackSize;
  /** Optional PI id for payment mode; defaulted when omitted. */
  payment_intent?: string;
  /** Optional customer id; defaulted when omitted. */
  customer?: string;
  /** Optional subscription id (subscription mode only); defaulted when omitted. */
  subscription?: string;
}

/**
 * Phase 12 fixture for `checkout.session.completed`.
 *
 * Produces a Stripe.Event-shaped object with envelope fields (id, created,
 * livemode, api_version) and a mode-discriminated `data.object`:
 *  - `mode: 'subscription'` → metadata carries { user_id, tier, interval },
 *    `subscription` is a string id, `payment_intent` is null
 *  - `mode: 'payment'` → metadata carries { user_id, pack_size }, `subscription`
 *    is null, `payment_intent` is a string id (SHOP-09 idempotency key)
 *
 * The `client_reference_id` mirrors `metadata.user_id` to match how
 * `create-checkout-session` sets both fields at session creation time.
 */
export function makeCheckoutSessionCompletedEvent(
  params: CheckoutSessionCompletedParams,
) {
  const {
    mode,
    user_id,
    tier,
    interval,
    pack_size,
    payment_intent,
    customer = `cus_test_${shortId()}`,
    subscription,
  } = params;

  const sessionId = `cs_test_${shortId()}`;

  const metadata: Record<string, string> = { user_id };
  if (mode === 'subscription') {
    if (tier) metadata.tier = tier;
    if (interval) metadata.interval = interval;
  } else {
    // mode === 'payment'
    if (pack_size !== undefined) metadata.pack_size = String(pack_size);
  }

  const resolvedPaymentIntent =
    mode === 'payment' ? (payment_intent ?? `pi_test_${shortId()}`) : null;
  const resolvedSubscription =
    mode === 'subscription' ? (subscription ?? `sub_test_${shortId()}`) : null;

  return {
    id: `evt_test_${shortId()}`,
    object: 'event',
    api_version: STRIPE_API_VERSION,
    created: nowUnix(),
    livemode: false,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode,
        customer,
        client_reference_id: user_id,
        metadata,
        payment_intent: resolvedPaymentIntent,
        subscription: resolvedSubscription,
      },
    },
  };
}

export interface InvoicePaymentSucceededParams {
  subscription: string;
  customer: string;
  /** Stripe-native interval names (month/year), not our tier interval names. */
  interval: 'month' | 'year';
  /** Optional explicit invoice id; defaulted when omitted. */
  invoice?: string;
}

/**
 * Phase 12 fixture for `invoice.payment_succeeded`.
 *
 * Produces a Stripe.Event-shaped object carrying the minimum field set the
 * new `stripe-webhook-handler` needs to route monthly vs. yearly renewals:
 * the `subscription` + `customer` references, and the first line item's
 * `price.recurring.interval` to distinguish `month` from `year`.
 *
 * Per D-08, monthly renewals trigger `reset_subscription_merits`; yearly
 * renewals are a no-op (pg_cron owns monthly refills on yearly plans).
 */
export function makeInvoicePaymentSucceededEvent(
  params: InvoicePaymentSucceededParams,
) {
  const {
    subscription,
    customer,
    interval,
    invoice = `in_test_${shortId()}`,
  } = params;

  return {
    id: `evt_test_${shortId()}`,
    object: 'event',
    api_version: STRIPE_API_VERSION,
    created: nowUnix(),
    livemode: false,
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: invoice,
        object: 'invoice',
        subscription,
        customer,
        lines: {
          data: [
            {
              price: {
                recurring: { interval },
              },
            },
          ],
        },
      },
    },
  };
}

// ─── Phase 24 fixtures ──────────────────────────────────────────────────────
// `payment_intent.succeeded` — the embedded Payment Element top-up signal
// (Phase 24 D-23). Unlike `checkout.session.completed` this carries the
// pack_id in `data.object.metadata.pack_id` (canonical 'pack_3'|'pack_10'|
// 'pack_25'|'pack_50') and uses the PaymentIntent id as the idempotency key.

export interface PaymentIntentSucceededParams {
  /** Required — the webhook handler resolves user via metadata.user_id. */
  user_id?: string;
  /** Required when valid — one of pack_3 / pack_10 / pack_25 / pack_50. */
  pack_id?: string;
  /** Optional explicit event id; defaulted when omitted. */
  eventId?: string;
  /** Optional explicit PI id; defaulted when omitted (SHOP-09 idempotency key). */
  piId?: string;
  /** Optional explicit customer id; defaulted when omitted. */
  customer?: string;
  /** Optional receipt email fallback for profile lookup. */
  receipt_email?: string;
  /** Override metadata entirely (e.g. to test missing/invalid metadata). */
  metadataOverride?: Record<string, string> | null;
}

/**
 * Phase 24 fixture for `payment_intent.succeeded`.
 *
 * Shape mirrors Stripe.PaymentIntent closely enough for the new
 * stripe-webhook-handler branch (Phase 24 Plan 02 Task 3):
 *   - id, amount, currency, status
 *   - metadata.user_id + metadata.pack_id
 *   - customer / receipt_email for fallback lookup
 */
export function makePaymentIntentSucceededEvent(
  params: PaymentIntentSucceededParams = {},
) {
  const {
    user_id,
    pack_id,
    eventId = `evt_test_${shortId()}`,
    piId = `pi_test_${shortId()}`,
    customer = `cus_test_${shortId()}`,
    receipt_email,
    metadataOverride,
  } = params;

  let metadata: Record<string, string>;
  if (metadataOverride === null) {
    metadata = {};
  } else if (metadataOverride !== undefined) {
    metadata = metadataOverride;
  } else {
    metadata = {};
    if (user_id) metadata.user_id = user_id;
    if (pack_id) metadata.pack_id = pack_id;
  }

  return {
    id: eventId,
    object: 'event',
    api_version: STRIPE_API_VERSION,
    created: nowUnix(),
    livemode: false,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: piId,
        object: 'payment_intent',
        amount: 999,
        currency: 'usd',
        status: 'succeeded',
        customer,
        receipt_email: receipt_email ?? null,
        metadata,
      },
    },
  };
}
