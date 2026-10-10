/**
 * Shared Stripe SDK client singleton for Supabase Edge Functions.
 *
 * SDK pin (do not change without updating 07-RESEARCH §Standard Stack):
 *   npm:stripe@14
 * apiVersion pin (do not change without updating 07-RESEARCH §Standard Stack):
 *   '2024-11-20.acacia'
 *
 * Why module-level singleton: matches _shared/supabase-client.ts — one client
 * per warm worker, reused across all requests on that worker. Avoids the cost
 * of re-initialising the SDK (env reads, header setup) on every invocation.
 */
import Stripe from "npm:stripe@14";

// stripe@14's TS literal type lags this pinned API version; runtime accepts it.
const STRIPE_API_VERSION = '2024-11-20.acacia' as unknown as Stripe.StripeConfig['apiVersion'];

let _stripe: Stripe | null = null;
let _cryptoProvider: ReturnType<typeof Stripe.createSubtleCryptoProvider> | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return _stripe;
}

export type StripeMode = 'test' | 'live' | 'unknown';

/**
 * Mode of the configured STRIPE_SECRET_KEY, derived from its prefix.
 *
 * Debug session `stripe-checkout-key-mismatch` (2026-07-17): production shipped a
 * `pk_test_` frontend bundle against this function's `sk_live_` secret. Stripe only
 * warns about that in the browser console and then fails late with a misleading
 * 404, so the backend now REPORTS its mode on every checkout response and the
 * frontend refuses to mount on a proven contradiction.
 *
 * SECURITY: reads the public prefix only. Never returns or logs key material.
 */
export function getStripeMode(): StripeMode {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  return 'unknown';
}

export function getStripeCryptoProvider() {
  if (!_cryptoProvider) {
    _cryptoProvider = Stripe.createSubtleCryptoProvider();
  }
  return _cryptoProvider;
}

// test-only: resets module singletons so unit tests can swap env state
// between Deno.test blocks. Not exported from any public surface.
export function _resetForTests(): void {
  _stripe = null;
  _cryptoProvider = null;
}
