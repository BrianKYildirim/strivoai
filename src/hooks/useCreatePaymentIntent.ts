/**
 * useCreatePaymentIntent — Phase 24 Plan 06 (TOPUP-05).
 *
 * Invokes the `create-payment-intent` edge function (Plan 06 Task 1) to request a
 * Stripe PaymentIntent clientSecret for the embedded-PaymentElement top-up flow
 * (D-23 — distinct from the subscription Checkout redirect).
 *
 * Modelled after src/hooks/useStripeCheckout.ts; swaps the invoke target and
 * returns the { clientSecret, paymentIntentId } pair that StripePaymentElementModal
 * needs to render the Stripe <Elements> provider.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import type { PackId } from '@/config/pricing-config';
import {
  publishableKeyMode,
  isStripeModeMismatch,
  describeStripeMode,
  type StripeMode,
} from '@/lib/stripe-mode';

export interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export function useCreatePaymentIntent() {
  const [isLoading, setIsLoading] = useState(false);

  const create = useCallback(
    async (packId: PackId): Promise<CreatePaymentIntentResult | null> => {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in first');
          return null;
        }
        const { data, error } = await supabase.functions.invoke('create-payment-intent', {
          body: { pack_id: packId },
        });
        if (error || !data?.clientSecret || !data?.paymentIntentId) {
          console.error('[useCreatePaymentIntent] invoke error', error);
          toast.error('Could not start top-up purchase. Please try again.');
          return null;
        }
        // Test/live reconciliation (debug: stripe-checkout-key-mismatch).
        // A pi_ client secret cannot reveal the backend's mode, so the edge fn
        // reports it. If it provably contradicts our build-time publishable key,
        // abort HERE: mounting <Elements> would render a working-looking card form
        // that 404s on confirm ("a similar object exists in live mode…").
        // Conservative by design — an absent/unknown stripeMode never blocks.
        const backendMode = (data.stripeMode as StripeMode | undefined) ?? 'unknown';
        const frontendMode = publishableKeyMode(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
        if (isStripeModeMismatch(frontendMode, backendMode)) {
          console.error(describeStripeMode('merit top-up', frontendMode, backendMode));
          toast.error('Payments are temporarily misconfigured. Please contact support.');
          return null;
        }

        return {
          clientSecret: data.clientSecret as string,
          paymentIntentId: data.paymentIntentId as string,
        };
      } catch (err) {
        console.error('[useCreatePaymentIntent] unexpected error', err);
        toast.error('Top-up could not be started. Please try again.');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { isLoading, create };
}
