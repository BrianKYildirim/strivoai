import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
      // useAuthUserId reads the LOCAL session instead of calling getUser(). Derive the
      // session from the same getUserMock so "who is signed in" stays single-sourced —
      // the signed-out case below flips getUserMock and must flip this with it.
      getSession: async () => {
        const { data } = await getUserMock();
        return { data: { session: data?.user ? { user: data.user } : null }, error: null };
      },
    },
    from: () => ({
      select: (columns: string) => {
        selectMock(columns);
        return {
          eq: (column: string, value: string) => {
            eqMock(column, value);
            return { maybeSingle: () => maybeSingleMock() };
          },
        };
      },
    }),
  },
}));

import { subscriptionStateQueryKey, useSubscriptionState } from './useSubscriptionState';

const future = '2099-01-15T08:00:00.000Z';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    subscription_tier: 'elite',
    subscription_status: 'active',
    pending_downgrade_tier: 'free',
    current_period_end: future,
    ...overrides,
  };
}

function makeWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-a' } } });
  maybeSingleMock.mockReset().mockResolvedValue({ data: profile(), error: null });
  selectMock.mockReset();
  eqMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSubscriptionState', () => {
  it('disables the profile query while signed out', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(result.current.isPendingDowngrade).toBe(false);
  });

  it('selects only authoritative billing columns for the authenticated user', async () => {
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));
    expect(selectMock).toHaveBeenCalledWith(
      'subscription_tier, subscription_status, pending_downgrade_tier, current_period_end',
    );
    expect(eqMock).toHaveBeenCalledWith('id', 'user-a');
  });

  it.each(['active', 'trialing'])('allows real Elite pending Free for live status %s', async (status) => {
    maybeSingleMock.mockResolvedValue({ data: profile({ subscription_status: status }), error: null });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));
  });

  it.each(['past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused', null, 'unknown']) (
    'suppresses stale pending fields for non-live status %s',
    async (status) => {
      maybeSingleMock.mockResolvedValue({ data: profile({ subscription_status: status }), error: null });
      const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isPendingDowngrade).toBe(false);
    },
  );

  it('requires real Elite and pending Free while preserving an undated pending state', async () => {
    for (const overrides of [
      { subscription_tier: 'pro' },
      { pending_downgrade_tier: null },
    ]) {
      maybeSingleMock.mockResolvedValueOnce({ data: profile(overrides), error: null });
      const { result, unmount } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isPendingDowngrade).toBe(false);
      unmount();
    }

    maybeSingleMock.mockResolvedValue({ data: profile({ current_period_end: null }), error: null });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));
    expect(result.current.currentPeriodEnd).toBeNull();
  });

  it('suppresses an expired stale pending period', async () => {
    maybeSingleMock.mockResolvedValue({ data: profile({ current_period_end: '2000-01-01T00:00:00.000Z' }), error: null });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPendingDowngrade).toBe(false);
  });

  it('reconciles after the authoritative pending field clears', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: profile(), error: null })
      .mockResolvedValueOnce({ data: profile({ pending_downgrade_tier: null }), error: null });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));
    await expect(result.current.reconcilePendingDowngrade()).resolves.toBe('reconciled');
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(false));
  });

  it('times out without inventing profile reconciliation', async () => {
    maybeSingleMock.mockResolvedValue({ data: profile(), error: null });
    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));

    const reconciliation = result.current.reconcilePendingDowngrade();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await expect(reconciliation).resolves.toBe('timed_out');
    expect(result.current.isPendingDowngrade).toBe(true);
  });

  it('cancels reconciliation when the consumer unmounts', async () => {
    maybeSingleMock.mockResolvedValue({ data: profile(), error: null });
    const { result, unmount } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });
    await waitFor(() => expect(result.current.isPendingDowngrade).toBe(true));

    vi.useFakeTimers();
    const reconciliation = result.current.reconcilePendingDowngrade();
    await act(async () => { await Promise.resolve(); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await expect(reconciliation).resolves.toBe('timed_out');
  });

  it('flips pending to false at the exact period-end instant for a mounted consumer', async () => {
    // Period end two hours after the mounted clock, so getSafeTimerDelay is unclamped
    // and the one-shot timer fires exactly at the boundary.
    const HOUR_MS = 60 * 60 * 1000;
    const periodEnd = '2099-01-15T09:00:00.000Z';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-15T07:00:00.000Z'));
    maybeSingleMock.mockResolvedValue({ data: profile({ current_period_end: periodEnd }), error: null });

    const { result } = renderHook(() => useSubscriptionState(), { wrapper: makeWrapper().wrapper });

    // Flush the two chained queries (getUser -> subscription) without advancing the clock,
    // so the boundary timer is armed against the exact mounted instant.
    for (let i = 0; i < 6 && !result.current.isPendingDowngrade; i += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    }
    expect(result.current.isPendingDowngrade).toBe(true);

    // No early flip: advancing an hour (still well before the boundary) keeps pending true.
    await act(async () => { await vi.advanceTimersByTimeAsync(HOUR_MS); });
    expect(result.current.isPendingDowngrade).toBe(true);

    // Crossing the exact instant fires the one-shot timer; the invalidation re-derives
    // with a fresh now (expired) and flips pending to false with no user action.
    await act(async () => { await vi.advanceTimersByTimeAsync(HOUR_MS); });
    await vi.waitFor(() => expect(result.current.isPendingDowngrade).toBe(false));
  });

  it('separates query caches by authenticated user', () => {
    expect(subscriptionStateQueryKey('user-a')).not.toEqual(subscriptionStateQueryKey('user-b'));
    expect(subscriptionStateQueryKey('user-a')).toEqual(['subscription-state', 'user-a']);
  });
});
