import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { setPendingUpgrade } from '@/lib/pendingUpgrade';

interface StripeCheckoutParams {
  mode: 'subscription' | 'payment';
  tier?: 'pro' | 'elite';
  interval?: 'monthly' | 'annual';
  pack_size?: number;
}

interface UseStripeCheckoutReturn {
  isLoading: boolean;
  fetchClientSecret: (params: StripeCheckoutParams) => Promise<string | null>;
}

export function useStripeCheckout(): UseStripeCheckoutReturn {
  const [isLoading, setIsLoading] = useState(false);

  const fetchClientSecret = useCallback(async (params: StripeCheckoutParams): Promise<string | null> => {
    setIsLoading(true);
    try {
      // getSession() reads the locally cached session (no network); getUser()
      // hits /auth/v1/user and used to add a full round trip to the critical
      // path before the invoke. This guard exists purely for signed-out UX —
      // the edge function still authenticates independently and returns 401.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error('Please sign in first');
        setIsLoading(false);
        return null;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { ...params, ui_mode: 'embedded' },
      });

      if (error) {
        toast.error('Could not start checkout. Please try again.');
        console.error('[useStripeCheckout] invoke error', error);
        setIsLoading(false);
        return null;
      }

      // H-01 (quick 260718-j2x): record a reachable pending-upgrade signal at subscription
      // checkout initiation. Stripe return_urls never land on /onboarding (only /dashboard
      // or /pricing), so `?checkout=complete` is not observable there. This flag survives the
      // navigation and lets onboarding's Finish gate a real DB-waiting tier poll on genuine
      // upgraders only — free users (no flag) are never slowed.
      if (params.mode === 'subscription' && (params.tier === 'pro' || params.tier === 'elite')) {
        setPendingUpgrade(params.tier);
      }

      setIsLoading(false);
      return data?.clientSecret ?? null;
    } catch (err) {
      console.error('[useStripeCheckout] unexpected error', err);
      toast.error('Payment could not be completed. Please try again.');
      setIsLoading(false);
      return null;
    }
  }, []);

  return { isLoading, fetchClientSecret };
}
