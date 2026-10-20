import { differenceInCalendarDays, format } from 'date-fns';

export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export type SubscriptionPeriodEnd = string | number | Date | null | undefined;

export function normalizeSubscriptionPeriodEnd(value: SubscriptionPeriodEnd): Date | null {
  let date: Date;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    date = new Date(value * 1000);
  } else if (typeof value === 'string' && value.trim()) {
    date = new Date(value);
  } else {
    return null;
  }

  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
}

export function formatSubscriptionPeriodEnd(value: SubscriptionPeriodEnd): string | null {
  const date = normalizeSubscriptionPeriodEnd(value);
  return date ? format(date, 'MMMM d, yyyy') : null;
}

export function getFinalWeekDaysRemaining(
  periodEnd: SubscriptionPeriodEnd,
  now: Date = new Date(),
): number | null {
  const end = normalizeSubscriptionPeriodEnd(periodEnd);
  if (!end || !Number.isFinite(now.getTime()) || end.getTime() <= now.getTime()) return null;

  const days = differenceInCalendarDays(end, now);
  return days >= 0 && days <= 7 ? days : null;
}

export function getFinalWeekCountdown(
  periodEnd: SubscriptionPeriodEnd,
  now: Date = new Date(),
): string | null {
  const end = normalizeSubscriptionPeriodEnd(periodEnd);
  const days = getFinalWeekDaysRemaining(end, now);
  const displayDate = formatSubscriptionPeriodEnd(end);
  if (days === null || !displayDate) return null;

  if (days === 0) {
    return `Elite ends today — your Elite access ends on ${displayDate}.`;
  }
  if (days === 1) {
    return `1 day left — your Elite access ends on ${displayDate}.`;
  }
  return `${days} days left — your Elite access ends on ${displayDate}.`;
}

export function getNextLocalMidnight(now: Date = new Date()): Date | null {
  if (!Number.isFinite(now.getTime())) return null;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight;
}

export function getSafeTimerDelay(
  target: SubscriptionPeriodEnd,
  now: Date = new Date(),
): number | null {
  const targetDate = normalizeSubscriptionPeriodEnd(target);
  if (!targetDate || !Number.isFinite(now.getTime())) return null;
  const delay = targetDate.getTime() - now.getTime();
  if (delay <= 0) return 0;
  return Math.min(delay, MAX_TIMER_DELAY_MS);
}

export function buildSubscriptionDismissalKey(
  userId: string | null | undefined,
  periodEnd: SubscriptionPeriodEnd,
): string | null {
  const normalizedUserId = userId?.trim();
  const end = normalizeSubscriptionPeriodEnd(periodEnd);
  if (!normalizedUserId || !end) return null;

  return `subscription-downgrade-dismissed:${encodeURIComponent(normalizedUserId)}:${end.toISOString()}`;
}
