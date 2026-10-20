import type { ReactNode } from 'react';
import { CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react';

import {
  formatSubscriptionPeriodEnd,
  type SubscriptionPeriodEnd,
} from '@/lib/subscription-downgrade';

export type SubscriptionStatusPanelState = 'pending' | 'syncing' | 'confirmed';

interface SubscriptionStatusPanelProps {
  state: SubscriptionStatusPanelState;
  periodEnd?: SubscriptionPeriodEnd;
  action?: ReactNode;
}

export function SubscriptionStatusPanel({
  state,
  periodEnd,
  action,
}: SubscriptionStatusPanelProps) {
  const displayDate = formatSubscriptionPeriodEnd(periodEnd);
  const isPending = state === 'pending';
  const Icon = state === 'confirmed'
    ? CheckCircle2
    : state === 'syncing'
      ? RefreshCw
      : CalendarClock;
  const heading = state === 'confirmed'
    ? 'Automatic renewal is on.'
    : state === 'syncing'
      ? 'Renewal restored — syncing your membership status.'
      : displayDate
        ? `Your Elite access ends on ${displayDate}.`
        : 'Downgrade scheduled';
  const body = state === 'confirmed'
    ? 'Your Elite access will continue without interruption.'
    : state === 'syncing'
      ? 'Stripe confirmed automatic renewal. We’re updating your membership details now.'
      : displayDate
        ? 'Elite stays active through this date. Then your account moves to Free. Automatic renewal is currently off.'
        : 'We’re confirming your exact Elite end date. Elite remains active while your membership status syncs.';

  return (
    <section
      aria-labelledby="subscription-status-heading"
      className="max-w-4xl mx-auto px-4 mb-6"
    >
      <div className="flex flex-col gap-6 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0" aria-live={isPending ? undefined : 'polite'}>
            <h2 id="subscription-status-heading" className="text-lg font-semibold leading-snug">
              {heading}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        </div>
        {action ? <div className="w-full shrink-0 sm:ml-auto sm:w-auto">{action}</div> : null}
      </div>
    </section>
  );
}
