/**
 * Stripe test/live mode reconciliation — debug session `stripe-checkout-key-mismatch`.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-07-17 production checkout failed for BOTH Elite subscriptions and merit
 * packs. The deployed bundle at www.strivoai.net was built with a `pk_test_`
 * VITE_STRIPE_PUBLISHABLE_KEY while calling the PRODUCTION Supabase project, whose
 * STRIPE_SECRET_KEY is `sk_live_`. Stripe.js therefore routed to test mode
 * (x-stripe-routing-context-priority-tier: api-testmode) and 404'd on the live-mode
 * PaymentIntent the backend had just created:
 *
 *   "No such payment_intent: 'pi_…'; a similar object exists in live mode, but a
 *    test mode key was used to make this request."
 *
 * Stripe.js only emits a soft console WARNING for this, then fails much later and
 * far away (an Amazon Pay fetch error, a 404 on verify_challenge). The mismatch was
 * therefore invisible until a user tried to pay. These helpers turn that silent,
 * late, misleading failure into a loud, immediate, correctly-attributed one.
 *
 * SECURITY: mode detection reads ONLY the well-known `pk_test_` / `pk_live_` /
 * `cs_test_` / `cs_live_` prefixes. No key material is returned, logged, or
 * compared. Never log a full key — use `describeStripeMode()` for diagnostics.
 */

export type StripeMode = 'test' | 'live' | 'unknown';

/**
 * Mode of a Stripe PUBLISHABLE key (`pk_test_…` / `pk_live_…`).
 * Anything unrecognised (including '' / undefined) → 'unknown'.
 */
export function publishableKeyMode(key: string | undefined | null): StripeMode {
  if (!key) return 'unknown';
  if (key.startsWith('pk_test_')) return 'test';
  if (key.startsWith('pk_live_')) return 'live';
  return 'unknown';
}

/**
 * Mode of a Stripe CLIENT SECRET as returned by our edge functions.
 *
 * Checkout Session secrets are `cs_test_…` / `cs_live_…` and self-describe their
 * mode. PaymentIntent secrets (`pi_…_secret_…`) do NOT encode the mode, so they
 * resolve to 'unknown' here — that path relies on the explicit `mode` field the
 * create-payment-intent edge function now returns instead.
 */
export function clientSecretMode(secret: string | undefined | null): StripeMode {
  if (!secret) return 'unknown';
  if (secret.startsWith('cs_test_')) return 'test';
  if (secret.startsWith('cs_live_')) return 'live';
  return 'unknown';
}

/**
 * True only when both sides are KNOWN and DISAGREE.
 *
 * Deliberately conservative: an 'unknown' on either side is NOT a mismatch, so a
 * PaymentIntent secret or an unrecognised key prefix can never block a checkout
 * that would otherwise have worked. We fail loud on proven contradiction only —
 * never on absence of evidence.
 */
export function isStripeModeMismatch(a: StripeMode, b: StripeMode): boolean {
  return a !== 'unknown' && b !== 'unknown' && a !== b;
}

/**
 * Secret-free one-line diagnostic for console/telemetry.
 * Emits mode names and key CLASS only — never key material.
 */
export function describeStripeMode(
  context: string,
  frontendMode: StripeMode,
  backendMode: StripeMode,
): string {
  return (
    `[stripe-mode] ${context}: frontend publishable key is ${frontendMode.toUpperCase()} mode ` +
    `but the checkout session was created with a ${backendMode.toUpperCase()} mode secret key. ` +
    `These MUST match. Fix VITE_STRIPE_PUBLISHABLE_KEY for this environment and REDEPLOY ` +
    `(Vite inlines it at build time, so changing the env var alone is not enough).`
  );
}
