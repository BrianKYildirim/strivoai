import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthUserId } from '@/hooks/useAuthUserId';
import { supabase } from '@/lib/supabaseClient';
import { getSafeTimerDelay, normalizeSubscriptionPeriodEnd } from '@/lib/subscription-downgrade';

const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const RECONCILE_INTERVAL_MS = 500;
const RECONCILE_CEILING_MS = 10_000;

export type SubscriptionReconciliationResult = 'reconciled' | 'timed_out';

export interface SubscriptionStateRecord {
  subscriptionTier: string;
  subscriptionStatus: string | null;
  pendingDowngradeTier: string | null;
  currentPeriodEnd: Date | null;
  isPendingDowngrade: boolean;
}

interface SubscriptionProfileRow {
  subscription_tier: string;
  subscription_status: string | null;
  pending_downgrade_tier: string | null;
  current_period_end: string | null;
}

const EMPTY_SUBSCRIPTION_STATE: SubscriptionStateRecord = {
  subscriptionTier: 'free',
  subscriptionStatus: null,
  pendingDowngradeTier: null,
  currentPeriodEnd: null,
  isPendingDowngrade: false,
};

export const subscriptionStateQueryKey = (userId?: string | null) =>
  ['subscription-state', userId ?? null] as const;

function deriveSubscriptionState(
  row: SubscriptionProfileRow | null,
  now: Date = new Date(),
): SubscriptionStateRecord {
  if (!row) return EMPTY_SUBSCRIPTION_STATE;

  const currentPeriodEnd = normalizeSubscriptionPeriodEnd(row.current_period_end);
  const isLive = LIVE_SUBSCRIPTION_STATUSES.has(row.subscription_status ?? '');
  const isExpired = currentPeriodEnd !== null && currentPeriodEnd.getTime() <= now.getTime();

  return {
    subscriptionTier: row.subscription_tier,
    subscriptionStatus: row.subscription_status,
    pendingDowngradeTier: row.pending_downgrade_tier,
    currentPeriodEnd,
    isPendingDowngrade:
      row.subscription_tier === 'elite' &&
      isLive &&
      row.pending_downgrade_tier === 'free' &&
      !isExpired,
  };
}

async function fetchSubscriptionState(userId: string): Promise<SubscriptionStateRecord> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_status, pending_downgrade_tier, current_period_end')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[useSubscriptionState] load error:', error);
    throw error;
  }

  return deriveSubscriptionState(data);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSubscriptionState() {
  const queryClient = useQueryClient();
  const reconciliationGenerationRef = useRef(0);

  const { userId, isLoading: isUserLoading } = useAuthUserId();

  const queryKey = useMemo(() => subscriptionStateQueryKey(userId), [userId]);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSubscriptionState(userId!),
    enabled: !!userId,
    // Billing/downgrade UI must not go stale behind the app-wide defaults: this row is
    // rewritten by Stripe webhooks out-of-band, so opt back into focus refetching.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    reconciliationGenerationRef.current += 1;
    return () => {
      reconciliationGenerationRef.current += 1;
    };
  }, [userId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey, exact: true });
  }, [queryClient, queryKey, userId]);

  const reconcilePendingDowngrade = useCallback(async (): Promise<SubscriptionReconciliationResult> => {
    if (!userId) return 'timed_out';

    const generation = reconciliationGenerationRef.current;
    const deadline = Date.now() + RECONCILE_CEILING_MS;

    while (reconciliationGenerationRef.current === generation) {
      await queryClient.refetchQueries({ queryKey, exact: true, type: 'active' });
      if (reconciliationGenerationRef.current !== generation) return 'timed_out';

      const latest = queryClient.getQueryData<SubscriptionStateRecord>(queryKey);
      if (latest && !latest.isPendingDowngrade) return 'reconciled';
      if (Date.now() >= deadline) return 'timed_out';

      await wait(Math.min(RECONCILE_INTERVAL_MS, deadline - Date.now()));
    }

    return 'timed_out';
  }, [queryClient, queryKey, userId]);

  const state = query.data ?? EMPTY_SUBSCRIPTION_STATE;

  // Exact-boundary expiry: deriveSubscriptionState only samples `now` at fetch time,
  // so a tab mounted before period end keeps a stale pending presentation past expiry.
  // Schedule a single clamped one-shot timer at the exact currentPeriodEnd instant that
  // re-runs the derivation (via query invalidation) with a fresh `now`, flipping
  // isPendingDowngrade to false for every consumer without any new user action.
  const isPendingDowngrade = state.isPendingDowngrade;
  const periodEndMs = state.currentPeriodEnd ? state.currentPeriodEnd.getTime() : null;

  useEffect(() => {
    // Only arm while the derived state is pending with a valid future period end.
    if (!isPendingDowngrade || periodEndMs === null) return;

    // getSafeTimerDelay is non-negative and clamped to MAX_TIMER_DELAY_MS so a
    // far-future period end (e.g. 2099 fixtures) cannot overflow setTimeout's 32-bit delay.
    const delay = getSafeTimerDelay(new Date(periodEndMs), new Date());
    if (delay === null) return;

    const timeoutId = window.setTimeout(() => {
      // Same invalidation as `refresh`: refetch re-derives with a fresh `now`.
      void queryClient.invalidateQueries({ queryKey, exact: true });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [isPendingDowngrade, periodEndMs, userId, queryClient, queryKey]);

  return {
    ...state,
    userId,
    isLoading: isUserLoading || (!!userId && query.isLoading),
    error: query.error as Error | null,
    refresh,
    reconcilePendingDowngrade,
  };
}
