/**
 * StripePaymentElementModal — Phase 24 Plan 06 (D-23 top-up flow).
 *
 * D-23: Top-up purchases use an EMBEDDED PaymentElement (stripe.confirmPayment),
 * NOT the EmbeddedCheckoutProvider used by the subscription path. This is the
 * single place in the app that renders <Elements> + <PaymentElement>.
 *
 * Contract:
 * - Parent (TopUpProvider) supplies { open, packId, clientSecret }.
 * - When clientSecret is null, renders a centered Loader2 (waiting on the
 *   create-payment-intent edge fn response).
 * Phase 32 (MER-07 / MER-08): the webhook's credit_shop_merits write often
 * lands AFTER confirmPayment returns, so a single fire-and-forget invalidate
 * re-reads the stale pre-purchase balance and the user never sees their merits.
 * The form now snapshots shop_balance at "Confirm purchase" click (D-03) and
 * runs a detached reconcileShopCredit(snapshot) poll that re-reads the shared
 * ['merit-balance'] query until the credit lands or 10s elapses (D-04/D-05),
 * which updates MeritBalanceHeaderV2 live without editing that component.
 *
 * - On stripe.confirmPayment { paymentIntent.status === 'succeeded' }:
 *     - toast.success with pack.merits copy
 *     - void reconcileShopCredit(snapshot) (detached poll — see useMerits)
 *     - onOpenChange(false) — modal closes IMMEDIATELY while the poll runs
 * - On stripe.confirmPayment { error }: dialog stays open — Stripe renders the
 *   error inline inside <PaymentElement>, so no extra toast.
 * - On { paymentIntent.status === 'processing' }: async confirmation path —
 *   surface the canonical processing toast + detached poll + close so the user
 *   sees "Merits processing — they'll appear shortly" instead of a stuck spinner.
 * - On the 10s poll timeout: nothing — no error toast, no manual-refresh
 *   affordance (D-05); staleTime + refetchOnWindowFocus reconcile eventually.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMerits } from '@/hooks/useMerits';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PACKS_BY_ID, type PackId } from '@/config/pricing-config';
import {
  CHECKOUT_FAILURE_COPY,
  CHECKOUT_PENDING_TIMEOUT_MS,
} from '@/lib/client-error-taxonomy';
import { reportDiagnostic } from '@/lib/diagnostics/client-diagnostics';

// Module-scope loadStripe — matches StripeCheckoutWrapper so the Stripe.js
// bundle loads once per session (Stripe's own guidance).
//
// WR-06: Fail loud at module load when VITE_STRIPE_PUBLISHABLE_KEY is unset.
// Previously, passing `''` to loadStripe silently produced a broken <Elements>
// mount with an unhelpful "Invalid value for stripe.elements()" thrown deep
// inside Stripe.js — the user saw a stuck modal with no recovery. Now the
// modal renders a graceful "temporarily unavailable" fallback and a dev-mode
// console.error makes the missing env var obvious during local development.
const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY && import.meta.env.DEV) {
  console.error(
    '[StripePaymentElementModal] VITE_STRIPE_PUBLISHABLE_KEY is not set — the top-up modal will render a fallback.',
  );
}
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

export interface StripePaymentElementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: PackId | null;
  clientSecret: string | null;
}

function PaymentForm({
  packId,
  onSuccess,
}: {
  packId: PackId;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const { shop, reconcileShopCredit } = useMerits();
  const pack = PACKS_BY_ID[packId];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    // D-03: snapshot the pre-purchase shop_balance at Confirm-purchase click,
    // BEFORE confirmPayment resolves, so the poll can detect when the webhook's
    // credit lands (shop_balance > snapshot).
    const snapshot = shop;
    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (error) {
      // Stripe renders the error inline inside <PaymentElement>.
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      toast.success(`${pack.merits} Merits added. Enjoy your career momentum.`);
      // D-04: detached poll — onSuccess() closes the modal immediately while
      // reconcileShopCredit runs in the background and updates the shared cache.
      void reconcileShopCredit(snapshot);
      onSuccess();
    } else if (paymentIntent?.status === 'processing') {
      toast.info("Merits processing — they'll appear shortly");
      void reconcileShopCredit(snapshot);
      onSuccess();
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        variant="boxy"
        disabled={!stripe || !elements || submitting}
        className="w-full"
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Confirm purchase
      </Button>
    </form>
  );
}

export function StripePaymentElementModal({
  open,
  onOpenChange,
  packId,
  clientSecret,
}: StripePaymentElementModalProps) {
  const pack = packId ? PACKS_BY_ID[packId] : null;
  const options = useMemo(
    () => (clientSecret ? { clientSecret } : null),
    [clientSecret],
  );

  useEffect(() => {
    if (!open || clientSecret) return;
    const timeoutId = window.setTimeout(() => {
      reportDiagnostic({
        surface: 'checkout',
        stage: 'checkout',
        category: 'checkout_failed',
      });
      onOpenChange(false);
      toast.error(CHECKOUT_FAILURE_COPY.startFailed);
    }, CHECKOUT_PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [clientSecret, onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-viewport max-w-md overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[90vh]"
        data-testid="checkout-modal"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {pack
              ? `Buy ${pack.merits} Merits — $${(pack.priceCents / 100).toFixed(2)}`
              : 'Top-Up Pack'}
          </DialogTitle>
        </DialogHeader>
        {!stripePromise ? (
          <div
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="payment-unavailable"
          >
            Payment is temporarily unavailable. Please try again later.
          </div>
        ) : !clientSecret || !packId || !options ? (
          <div
            className="flex flex-col items-center justify-center gap-3 h-40"
            data-testid="payment-loading"
          >
            <Loader2 className="h-6 w-6 animate-spin text-[--accent-red]" />
            <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>
          </div>
        ) : (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm packId={packId} onSuccess={() => onOpenChange(false)} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
