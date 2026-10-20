import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthUserId } from '@/hooks/useAuthUserId';
import { MERITS_PER_MONTH, normalizeActiveTier, type ActiveTier, type Tier } from '@/config/pricing-config';

export interface MeritBalance {
  total: number;
  subscription: number;
  shop: number;
  cap: number;
  tier: ActiveTier;
  resetDate: string | null;
  isLow: boolean;
  isZero: boolean;
  isLoading: boolean;
  canAfford: (cost: number) => boolean;
  optimisticDeduct: (cost: number) => { rollback: () => void; commit: () => void };
  reconcileShopCredit: (snapshot: number) => Promise<void>;
  reconcileTierUpgrade: (expectedTier?: Tier) => Promise<void>;
}

// MER-07 / MER-08 (Phase 32): reconciliation poll bounds. The Stripe top-up
// webhook credits shop merits via credit_shop_merits, but that write often
// lands AFTER stripe.confirmPayment returns succeeded/processing. A single
// fire-and-forget invalidate re-reads the stale pre-purchase balance, so the
// user never sees their new merits. The poll re-reads the authoritative
// ['merit-balance', userId] cache on an interval until shop_balance exceeds
// the at-submit snapshot, or until the 10s ceiling elapses (silent — no toast,
// no error; staleTime + refetchOnWindowFocus provide eventual consistency).
const POLL_INTERVAL_MS = 1500;
const POLL_CEILING_MS = 10000;

type MeritQueryShape = { balance: Record<string, number | string | null> | null; tier: ActiveTier };

export function useMerits(): MeritBalance {
  // The shared auth-id seam. This hook is mounted twice on the dashboard (directly and
  // via useTierAccess); sourcing the id from one cached query means those two instances
  // share a single auth resolution instead of issuing a getUser() round-trip each.
  const { userId } = useAuthUserId();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['merit-balance', userId],
    queryFn: async () => {
      // Fetch balance and tier in parallel (cache-coalesced, one round-trip window).
      // WR-02: Use .maybeSingle() so a freshly signed-up user whose profiles row
      // has not yet been inserted (race between auth trigger and profiles row)
      // returns data:null instead of throwing a PostgREST error that would leave
      // React Query stuck in an unrecoverable error state. Default to 'free'
      // tier when the row is missing.
      const [balanceRes, profileRes] = await Promise.all([
        supabase.rpc('get_merit_balance', { p_user_id: userId! }),
        supabase.from('profiles').select('subscription_tier').eq('id', userId!).maybeSingle(),
      ]);
      if (balanceRes.error) throw balanceRes.error;
      // profileRes.error only fires on transport errors; missing row → data:null.
      if (profileRes.error) throw profileRes.error;
      return {
        balance: balanceRes.data,
        tier: normalizeActiveTier((profileRes.data as { subscription_tier?: string } | null)?.subscription_tier),
      };
    },
    enabled: !!userId,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const balance = (data as { balance?: Record<string, number | string | null> } | undefined)?.balance ?? null;
  const tier = normalizeActiveTier((data as { tier?: string } | undefined)?.tier);
  const total = (balance?.total as number | undefined) ?? 0;
  const subscription = (balance?.subscription_balance as number | undefined) ?? 0;
  const shop = (balance?.shop_balance as number | undefined) ?? 0;
  const resetDate = (balance?.next_reset_date as string | null | undefined) ?? null;
  const cap = MERITS_PER_MONTH[tier] ?? 0;

  // D-11 (Phase 30): low when TOTAL (subscription + shop) is at or under 20%
  // of cap. Reasoning: MeritBalanceHeaderV2 displays total/cap, so the warning
  // state must match the displayed ratio (display-vs-warning agreement).
  // Pre-Phase-30 this used `subscription / cap` (D-08/WR-03), which could
  // disagree with the displayed number when shop top-ups were present.
  // isZero (below) already operates on total — unchanged.
  const isLow = cap > 0 && total / cap <= 0.2;

  // D-01: Per-submit optimistic deduction. Snapshot is captured in a closure at
  // call time (NOT a hook-level ref), so concurrent submits each own their own
  // rollback target. The cache write preserves the nested { balance, tier } shape
  // (Pitfall 1) — a flat { total } write would make the displayed total read 0,
  // since the derived read above pulls from balance.total.
  const optimisticDeduct = (cost: number): { rollback: () => void; commit: () => void } => {
    const key = ['merit-balance', userId] as const;
    const previous = queryClient.getQueryData<MeritQueryShape>(key);
    const prevTotal = previous?.balance?.total;

    if (previous && typeof prevTotal === 'number') {
      queryClient.setQueryData<MeritQueryShape>(key, {
        ...previous,
        balance: { ...previous.balance, total: prevTotal - cost },
      });
    }

    return {
      // NFR-03: synchronous restore — no DB round-trip — then reconcile.
      rollback: () => {
        if (previous !== undefined) {
          queryClient.setQueryData<MeritQueryShape>(key, previous);
        }
        queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
      },
      // D-02 / D-05 / D-07: authoritative refetch overwrites the optimistic value.
      commit: () => {
        queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
      },
    };
  };

  // MER-07 / MER-08 (Phase 32): poll the authoritative balance after a Stripe
  // top-up until the webhook's credit_shop_merits write lands. Read-only — the
  // poll owns the EXACT key ['merit-balance', userId] (userId is in scope here
  // but NOT exported, so the modal cannot read it back via getQueryData; that
  // is why the poll lives in this hook rather than the component). It never
  // calls setQueryData (invalidate triggers the existing queryFn refetch, which
  // preserves the nested { balance, tier } shape — see optimisticDeduct above).
  const reconcileShopCredit = async (snapshot: number): Promise<void> => {
    if (!userId) return;
    const key = ['merit-balance', userId] as const;

    const cachedShopExceeds = (): boolean => {
      const current = queryClient.getQueryData<MeritQueryShape>(key);
      const shopBalance = current?.balance?.shop_balance;
      return typeof shopBalance === 'number' && shopBalance > snapshot;
    };

    // D-03: immediate first check — a credit that already landed resolves with
    // zero wait, before the first interval delay.
    if (cachedShopExceeds()) return;

    const start = Date.now();
    while (Date.now() - start < POLL_CEILING_MS) {
      await queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
      if (cachedShopExceeds()) return; // D-03 stop condition
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    // D-04 / D-05: ceiling reached — resolve silently. No toast, no error.
  };

  // PRICE-03 (Phase 33): tier-upgrade sibling of reconcileShopCredit. After a
  // Stripe subscription checkout/swap the customer.subscription.updated webhook
  // writes the new tier + resets merits, but that write often lands AFTER the
  // redirect back to /dashboard. Mirror the shop poll exactly — same key, same
  // bounds, immediate first check, silent on timeout — but stop on a TIER change
  // (the query already selects subscription_tier, exposed as `tier`) rather than
  // a shop_balance increase. If `expectedTier` is given, stop when the cached
  // tier equals it; otherwise capture the at-call tier and stop when it changes.
  const reconcileTierUpgrade = async (expectedTier?: Tier): Promise<void> => {
    if (!userId) return;
    const key = ['merit-balance', userId] as const;

    const expectedActiveTier = expectedTier ? normalizeActiveTier(expectedTier) : undefined;
    const readCachedTier = (): ActiveTier | undefined =>
      queryClient.getQueryData<MeritQueryShape>(key)?.tier;

    const snapshotTier = readCachedTier();
    const tierReconciled = (): boolean => {
      const current = readCachedTier();
      if (current === undefined) return false;
      return expectedActiveTier !== undefined
        ? current === expectedActiveTier
        : current !== snapshotTier;
    };

    // D-03: immediate first check — a tier that already landed resolves with
    // zero wait, before the first interval delay.
    if (tierReconciled()) return;

    const start = Date.now();
    while (Date.now() - start < POLL_CEILING_MS) {
      await queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
      if (tierReconciled()) return;
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    // Ceiling reached — resolve silently. No toast, no error.
  };

  return {
    total,
    subscription,
    shop,
    cap,
    tier,
    resetDate,
    isLow,
    isZero: total <= 0,
    isLoading: isLoading || userId === null,
    canAfford: (cost: number) => total >= cost,
    optimisticDeduct,
    reconcileShopCredit,
    reconcileTierUpgrade,
  };
}

export function useInvalidateMerits() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['merit-balance'] });
}
