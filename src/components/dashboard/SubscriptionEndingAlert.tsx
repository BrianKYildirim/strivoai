import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';

import { RenewEliteDialog } from '@/components/billing/RenewEliteDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { SubscriptionReconciliationResult } from '@/hooks/useSubscriptionState';
import {
  buildSubscriptionDismissalKey,
  getFinalWeekCountdown,
  getNextLocalMidnight,
  getSafeTimerDelay,
  normalizeSubscriptionPeriodEnd,
  type SubscriptionPeriodEnd,
} from '@/lib/subscription-downgrade';
import { cn } from '@/lib/utils';

export interface SubscriptionEndingAlertProps {
  userId: string | null;
  isPendingDowngrade: boolean;
  periodEnd: SubscriptionPeriodEnd;
  reconcilePendingDowngrade: () => Promise<SubscriptionReconciliationResult>;
}

function readDismissed(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.sessionStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string | null): void {
  if (!key) return;
  try {
    window.sessionStorage?.setItem(key, '1');
  } catch {
    // Component state still dismisses the reminder in restricted browser contexts.
  }
}

export function SubscriptionEndingAlert({
  userId,
  isPendingDowngrade,
  periodEnd,
  reconcilePendingDowngrade,
}: SubscriptionEndingAlertProps) {
  const periodEndKey = normalizeSubscriptionPeriodEnd(periodEnd)?.toISOString() ?? null;
  const boundaryKey = `${userId ?? 'signed-out'}:${periodEndKey ?? 'missing'}:${isPendingDowngrade}`;

  return (
    <SubscriptionEndingAlertBoundary
      key={boundaryKey}
      userId={userId}
      isPendingDowngrade={isPendingDowngrade}
      periodEndKey={periodEndKey}
      reconcilePendingDowngrade={reconcilePendingDowngrade}
    />
  );
}

interface SubscriptionEndingAlertBoundaryProps {
  userId: string | null;
  isPendingDowngrade: boolean;
  periodEndKey: string | null;
  reconcilePendingDowngrade: () => Promise<SubscriptionReconciliationResult>;
}

function SubscriptionEndingAlertBoundary({
  userId,
  isPendingDowngrade,
  periodEndKey,
  reconcilePendingDowngrade,
}: SubscriptionEndingAlertBoundaryProps) {
  const normalizedPeriodEnd = useMemo(
    () => normalizeSubscriptionPeriodEnd(periodEndKey),
    [periodEndKey],
  );
  const dismissalKey = useMemo(
    () => buildSubscriptionDismissalKey(userId, normalizedPeriodEnd),
    [normalizedPeriodEnd, userId],
  );
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissalKey));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stripeConfirmed, setStripeConfirmed] = useState(false);

  useEffect(() => {
    if (!isPendingDowngrade || stripeConfirmed || !normalizedPeriodEnd) return;

    const refreshClock = () => setNow(new Date());
    const midnight = getNextLocalMidnight(now);
    const midnightDelay = getSafeTimerDelay(midnight, now);
    const expiryDelay = getSafeTimerDelay(normalizedPeriodEnd, now);
    const timeoutIds: number[] = [];

    if (midnightDelay !== null && midnightDelay > 0) {
      timeoutIds.push(window.setTimeout(refreshClock, midnightDelay));
    }
    if (expiryDelay !== null && expiryDelay > 0) {
      timeoutIds.push(window.setTimeout(refreshClock, expiryDelay));
    }

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [isPendingDowngrade, normalizedPeriodEnd, now, stripeConfirmed, userId, periodEndKey]);

  const countdown = isPendingDowngrade && !stripeConfirmed
    ? getFinalWeekCountdown(normalizedPeriodEnd, now)
    : null;
  const showAlert = !!countdown && !dismissed;

  const renewalDialog = (showAlert || dialogOpen) ? (
    <RenewEliteDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      periodEnd={normalizedPeriodEnd}
      onStripeConfirmed={() => setStripeConfirmed(true)}
      reconcilePendingDowngrade={reconcilePendingDowngrade}
      disabled={!showAlert}
      triggerClassName={showAlert ? 'w-full sm:w-fit sm:shrink-0' : 'hidden'}
    />
  ) : null;

  if (!showAlert && !dialogOpen) return null;

  return (
    <Alert className={cn('mb-6 border-primary/40 bg-primary/10', !showAlert && 'hidden')}>
      <CalendarClock aria-hidden="true" className="h-5 w-5 text-primary" />
      <AlertTitle>Elite expiration reminder</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-center sm:justify-between">
          {showAlert ? <p className="font-semibold text-foreground">{countdown}</p> : null}
          {renewalDialog}
        </div>
        {showAlert ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss Elite expiration reminder for this session"
            className="absolute right-1 top-1 h-10 w-10 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              writeDismissed(dismissalKey);
              setDismissed(true);
            }}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
