import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { SubscriptionReconciliationResult } from '@/hooks/useSubscriptionState';
import { supabase } from '@/lib/supabaseClient';
import {
  formatSubscriptionPeriodEnd,
  normalizeSubscriptionPeriodEnd,
  type SubscriptionPeriodEnd,
} from '@/lib/subscription-downgrade';
import { cn } from '@/lib/utils';

type DialogState =
  | 'idle'
  | 'previewing'
  | 'ready'
  | 'restoring'
  | 'preview_error'
  | 'restore_error'
  | 'syncing'
  | 'confirmed';

interface RenewalResponse {
  ok?: unknown;
  action?: unknown;
  current_period_end?: unknown;
  cancel_at_period_end?: unknown;
  error?: unknown;
}

export interface RenewEliteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodEnd: SubscriptionPeriodEnd;
  onStripeConfirmed: (periodEnd: Date) => void;
  reconcilePendingDowngrade: () => Promise<SubscriptionReconciliationResult>;
  onProfileReconciled?: () => void;
  disabled?: boolean;
  triggerClassName?: string;
}

const PREVIEW_ERROR = 'We couldn’t confirm your renewal date. Your downgrade is still scheduled. Try again.';
const RESTORE_ERROR = 'We couldn’t restore automatic renewal. Your downgrade is still scheduled. Try again.';
const NO_SUBSCRIPTION_ERROR = 'We couldn’t find an active Elite subscription. Your billing status hasn’t changed. Contact support if this looks wrong.';

async function getErrorCode(error: unknown, data: RenewalResponse | null): Promise<string | null> {
  if (typeof data?.error === 'string') return data.error;

  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      return typeof body.error === 'string' ? body.error : null;
    } catch {
      return null;
    }
  }

  const contextError = (context as { error?: unknown } | null)?.error;
  return typeof contextError === 'string' ? contextError : null;
}

export function RenewEliteDialog({
  open,
  onOpenChange,
  periodEnd,
  onStripeConfirmed,
  reconcilePendingDowngrade,
  onProfileReconciled,
  disabled = false,
  triggerClassName,
}: RenewEliteDialogProps) {
  const [state, setState] = useState<DialogState>('idle');
  const [renewalDate, setRenewalDate] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const notNowRef = useRef<HTMLButtonElement>(null);
  const previewInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const stripeConfirmedRef = useRef(false);
  const generationRef = useRef(0);

  const runPreview = useCallback(async () => {
    if (previewInFlightRef.current) return;
    previewInFlightRef.current = true;
    const generation = generationRef.current;
    setState('previewing');
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke<RenewalResponse>('renew-subscription', {
        body: { action: 'preview' },
      });
      if (generation !== generationRef.current) return;

      const exactDate = normalizeSubscriptionPeriodEnd(data?.current_period_end as SubscriptionPeriodEnd);
      if (error || data?.ok !== true || data.action !== 'preview' || !exactDate) {
        const code = await getErrorCode(error, data);
        setErrorMessage(code === 'no_subscription' ? NO_SUBSCRIPTION_ERROR : PREVIEW_ERROR);
        setState('preview_error');
        return;
      }

      setRenewalDate(exactDate);
      setState('ready');
    } catch {
      if (generation === generationRef.current) {
        setErrorMessage(PREVIEW_ERROR);
        setState('preview_error');
      }
    } finally {
      previewInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      generationRef.current += 1;
      previewInFlightRef.current = false;
      restoreInFlightRef.current = false;
      stripeConfirmedRef.current = false;
      setState('idle');
      setRenewalDate(null);
      setErrorMessage(null);
      return;
    }

    if (restoreInFlightRef.current || stripeConfirmedRef.current) return;

    const exactDate = normalizeSubscriptionPeriodEnd(periodEnd);
    if (exactDate) {
      setRenewalDate(exactDate);
      setErrorMessage(null);
      setState('ready');
      return;
    }

    void runPreview();
  }, [open, periodEnd, runPreview]);

  const runRestore = async () => {
    // Once Stripe has explicitly confirmed the renewal, the restore mutation is
    // irreversible: no second restore invoke may ever be dispatched (CR-03 / T-05).
    if (!renewalDate || restoreInFlightRef.current || stripeConfirmedRef.current) return;
    restoreInFlightRef.current = true;
    const generation = generationRef.current;
    setState('restoring');
    setErrorMessage(null);

    // Provider-mutation boundary: this try/catch ends AT explicit Stripe confirmation.
    // A failure/ambiguous response before confirmation still routes to restore_error (D-20).
    try {
      const { data, error } = await supabase.functions.invoke<RenewalResponse>('renew-subscription', {
        body: { action: 'restore' },
      });
      if (generation !== generationRef.current) return;

      const confirmedDate = normalizeSubscriptionPeriodEnd(data?.current_period_end as SubscriptionPeriodEnd);
      if (
        error ||
        data?.ok !== true ||
        data.action !== 'restore' ||
        data.cancel_at_period_end !== false ||
        !confirmedDate
      ) {
        const code = await getErrorCode(error, data);
        setErrorMessage(code === 'no_subscription' ? NO_SUBSCRIPTION_ERROR : RESTORE_ERROR);
        setState('restore_error');
        return;
      }

      setRenewalDate(confirmedDate);
      stripeConfirmedRef.current = true;
      onStripeConfirmed(confirmedDate);
      toast.success('Automatic renewal is on.', {
        description: `Your Elite subscription is set to renew on ${formatSubscriptionPeriodEnd(confirmedDate)}.`,
      });
      setState('syncing');
    } catch {
      if (generation === generationRef.current) {
        setErrorMessage(RESTORE_ERROR);
        setState('restore_error');
      }
      return;
    } finally {
      restoreInFlightRef.current = false;
    }

    // Reconciliation handling: runs AFTER confirmation, isolated from the restore_error
    // boundary above. A thrown rejection is treated identically to 'timed_out' — the dialog
    // stays in the persistent syncing state, keeps the success toast already shown, and never
    // regresses to a retryable restore_error (CR-03 / T-06). Only 'reconciled' advances.
    try {
      const result = await reconcilePendingDowngrade();
      if (generation !== generationRef.current) return;
      if (result === 'reconciled') {
        setState('confirmed');
        onProfileReconciled?.();
      }
    } catch {
      // Post-confirmation reconciliation rejection: hold syncing; the renewal is already
      // Stripe-confirmed, so this is never surfaced as a failure and never re-exposes Retry.
    }
  };

  const isRestoring = state === 'restoring';
  const displayDate = formatSubscriptionPeriodEnd(renewalDate);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isRestoring) return;
    onOpenChange(nextOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          className={cn('bg-foreground text-background hover:bg-foreground/90', triggerClassName)}
          disabled={disabled || isRestoring}
        >
          Keep Elite and renew
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent
        className="max-w-lg gap-6"
        onEscapeKeyDown={(event) => {
          if (isRestoring) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          notNowRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {state === 'confirmed' ? 'Automatic renewal is on.' : 'Keep Elite and renew?'}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              {state === 'confirmed' ? (
                <span>Your Elite access will continue without interruption.</span>
              ) : displayDate ? (
                <span>
                  Your Elite access will continue without interruption. Automatic renewal will resume,
                  and your saved payment method will be charged on {displayDate} according to your
                  existing Elite subscription.
                </span>
              ) : null}
            </span>

            <span aria-live="polite" className="block min-h-5">
              {state === 'previewing' ? <span>Confirming your renewal date…</span> : null}
              {state === 'restoring' ? (
                <span className="flex items-center gap-2 text-foreground">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Restoring renewal…
                </span>
              ) : null}
              {state === 'syncing' ? <span>Renewal restored — syncing your membership status.</span> : null}
              {errorMessage ? <span className="text-destructive">{errorMessage}</span> : null}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2 sm:gap-0">
          {state === 'confirmed' || state === 'syncing' ? (
            <AlertDialogCancel>Close</AlertDialogCancel>
          ) : (
            <AlertDialogCancel ref={notNowRef} disabled={isRestoring}>
              Not now
            </AlertDialogCancel>
          )}

          {state === 'preview_error' ? (
            <AlertDialogAction
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={(event) => {
                event.preventDefault();
                void runPreview();
              }}
            >
              Retry
            </AlertDialogAction>
          ) : null}

          {state === 'previewing' || state === 'ready' || state === 'restoring' || state === 'restore_error' ? (
            <AlertDialogAction
              className="bg-foreground text-background hover:bg-foreground/90"
              disabled={state === 'previewing' || !renewalDate || isRestoring}
              onClick={(event) => {
                event.preventDefault();
                void runRestore();
              }}
            >
              {state === 'restore_error' ? 'Retry' : 'Keep Elite and renew'}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
