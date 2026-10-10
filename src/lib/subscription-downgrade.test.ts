import { describe, expect, it } from 'vitest';

import {
  MAX_TIMER_DELAY_MS,
  buildSubscriptionDismissalKey,
  formatSubscriptionPeriodEnd,
  getFinalWeekCountdown,
  getFinalWeekDaysRemaining,
  getNextLocalMidnight,
  getSafeTimerDelay,
  normalizeSubscriptionPeriodEnd,
} from './subscription-downgrade';

describe('subscription downgrade date helpers', () => {
  it('normalizes authoritative Stripe seconds and profile ISO values', () => {
    expect(normalizeSubscriptionPeriodEnd(1_800_000_000)?.toISOString()).toBe('2027-01-15T08:00:00.000Z');
    expect(normalizeSubscriptionPeriodEnd('2027-01-15T08:00:00.000Z')?.toISOString()).toBe('2027-01-15T08:00:00.000Z');
  });

  it.each([null, undefined, '', 'not-a-date', 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps missing or invalid input null: %s',
    (value) => expect(normalizeSubscriptionPeriodEnd(value)).toBeNull(),
  );

  it('formats a full browser-local calendar date', () => {
    const localDate = new Date(2027, 0, 15, 12);
    expect(formatSubscriptionPeriodEnd(localDate)).toBe('January 15, 2027');
  });

  it('includes seven local calendar days and excludes eight', () => {
    const now = new Date(2027, 0, 1, 23, 30);
    expect(getFinalWeekDaysRemaining(new Date(2027, 0, 8, 0, 30), now)).toBe(7);
    expect(getFinalWeekDaysRemaining(new Date(2027, 0, 9, 0, 30), now)).toBeNull();
  });

  it('returns the locked 2-day, 1-day, and expiration-day copy', () => {
    const end = new Date(2027, 0, 8, 18);
    expect(getFinalWeekCountdown(end, new Date(2027, 0, 6, 9))).toBe(
      '2 days left — your Elite access ends on January 8, 2027.',
    );
    expect(getFinalWeekCountdown(end, new Date(2027, 0, 7, 9))).toBe(
      '1 day left — your Elite access ends on January 8, 2027.',
    );
    expect(getFinalWeekCountdown(end, new Date(2027, 0, 8, 9))).toBe(
      'Elite ends today — your Elite access ends on January 8, 2027.',
    );
  });

  it('hides at the exact authoritative instant', () => {
    const end = new Date(2027, 0, 8, 18);
    expect(getFinalWeekCountdown(end, new Date(end.getTime() - 1))).not.toBeNull();
    expect(getFinalWeekCountdown(end, end)).toBeNull();
  });

  it('calculates the next local midnight and caps long timer delays for re-arming', () => {
    const now = new Date(2027, 0, 1, 21, 15, 30, 50);
    const midnight = getNextLocalMidnight(now);
    expect(midnight).toEqual(new Date(2027, 0, 2, 0, 0, 0, 0));
    expect(getSafeTimerDelay(midnight, now)).toBe(midnight!.getTime() - now.getTime());
    expect(getSafeTimerDelay(new Date(now.getTime() + MAX_TIMER_DELAY_MS + 100_000), now)).toBe(MAX_TIMER_DELAY_MS);
  });

  it('isolates session dismissal keys by both user and period', () => {
    const first = buildSubscriptionDismissalKey('user-a', '2027-01-15T08:00:00.000Z');
    expect(first).not.toBe(buildSubscriptionDismissalKey('user-b', '2027-01-15T08:00:00.000Z'));
    expect(first).not.toBe(buildSubscriptionDismissalKey('user-a', '2027-02-15T08:00:00.000Z'));
    expect(buildSubscriptionDismissalKey(null, '2027-01-15T08:00:00.000Z')).toBeNull();
    expect(buildSubscriptionDismissalKey('user-a', null)).toBeNull();
  });
});
