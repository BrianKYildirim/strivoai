import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  publishableKeyMode,
  clientSecretMode,
  isStripeModeMismatch,
  describeStripeMode,
  type StripeMode,
} from '@/lib/stripe-mode';
import {
  CHECKOUT_FAILURE_COPY,
  CHECKOUT_PENDING_TIMEOUT_MS,
} from '@/lib/client-error-taxonomy';
import { reportDiagnostic } from '@/lib/diagnostics/client-diagnostics';

// Build-time inlined by Vite. Changing VITE_STRIPE_PUBLISHABLE_KEY in Vercel has
// NO effect on an already-built bundle — a REDEPLOY is required.
const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Previously `loadStripe(… || '')`. Passing '' silently produced a broken Stripe
// instance that failed deep inside Stripe.js with an unrelated-looking error, so
// a missing key looked like a Stripe outage. Mirror StripePaymentElementModal's
// WR-06 fail-loud contract instead.
if (!PUBLISHABLE_KEY && import.meta.env.DEV) {
  console.error(
    '[StripeCheckoutWrapper] VITE_STRIPE_PUBLISHABLE_KEY is not set — checkout will render a fallback.',
  );
}
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

const FRONTEND_MODE = publishableKeyMode(PUBLISHABLE_KEY);

interface StripeCheckoutWrapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string | null;
  title: string;
}

export function StripeCheckoutWrapper({
  open,
  onOpenChange,
  clientSecret,
  title,
}: StripeCheckoutWrapperProps) {
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

  // A CLOSED wrapper with no secret renders nothing (no premature Stripe init).
  // An OPEN wrapper with no secret renders the pending body below, so the dialog
  // is visible on the same tick as the click while the session is being created.
  if (!open && !clientSecret) return null;

  // Checkout Session secrets self-describe their mode (cs_test_ / cs_live_).
  // If the backend's mode provably contradicts our publishable key, mounting
  // EmbeddedCheckout would "work" visually and then fail at payment time with a
  // misleading 404. Refuse to mount and say exactly what is wrong instead.
  // Only meaningful once a secret exists — clientSecretMode(null) is never called.
  const backendMode: StripeMode = clientSecret ? clientSecretMode(clientSecret) : 'unknown';
  const mismatch = clientSecret ? isStripeModeMismatch(FRONTEND_MODE, backendMode) : false;

  if (mismatch) {
    console.error(describeStripeMode('subscription checkout', FRONTEND_MODE, backendMode));
  }

  const unavailable = !stripePromise || mismatch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-viewport max-w-[560px] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[90vh]"
        data-testid="checkout-modal"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {clientSecret == null ? (
          // Session creation is still in flight. Show an explicit pending body
          // instead of nothing — this is what makes checkout feel instant. It
          // must NOT mount EmbeddedCheckoutProvider: Stripe forbids swapping
          // client_secret on a mounted provider.
          <div
            className="flex flex-col items-center justify-center gap-3 py-10"
            data-testid="checkout-preparing"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>
          </div>
        ) : unavailable ? (
          <p className="py-8 text-center text-sm text-muted-foreground" data-testid="checkout-unavailable">
            Checkout is temporarily unavailable. Please try again later or contact support.
          </p>
        ) : (
          // key={clientSecret}: Stripe forbids swapping client_secret inside a
          // mounted EmbeddedCheckoutProvider ("You cannot change the client_secret
          // after setting it"). Keying on the secret forces a clean unmount+remount
          // whenever a NEW session is created (e.g. the user reopens for a different
          // tier), so a stale secret can never linger in a live provider.
          <div data-testid="embedded-checkout">
            <EmbeddedCheckoutProvider
              key={clientSecret}
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
