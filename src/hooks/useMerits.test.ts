/**
 * useMerits — hook contract tests (UX-11 + D-08 tier-aware low-balance).
 *
 * D-08 (post-WR-03): isLow = cap > 0 && subscription / cap <= 0.2.
 * Zero subscription now qualifies as "low" because refill is the strongest
 * signal — isZero-driven UI (e.g. Dashboard "Limit Reached" banner) takes
 * precedence via per-consumer isZero exclusions in RunningLowCard /
 * HeaderTopUpTrigger (IN-01).
 * Boundary values per tier (MERITS_PER_MONTH: free=10, pro=75, elite=150):
 *   free   cap=10  → low at subscription <= 2 (including 0)
 *   pro    cap=75  → low at subscription <= 15 (including 0)
 *   elite  cap=150 → low at subscription <= 30 (including 0)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── supabase mock ──────────────────────────────────────────────────
const rpcMock = vi.fn();
const getUserMock = vi.fn();
const profileSingleMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () => getUserMock(),
      // useAuthUserId reads the LOCAL session instead of calling getUser(). Derive the
      // session from the same getUserMock so "who is signed in" stays single-sourced
      // and per-test overrides of getUserMock keep working.
      getSession: async () => {
        const { data } = await getUserMock();
        return { data: { session: data?.user ? { user: data.user } : null }, error: null };
      },
      onAuthStateChange: (_cb: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          // WR-02: hook now calls .maybeSingle(); keep .single() for back-compat
          // with any legacy mock callers, but route both to the same fixture.
          single: () => profileSingleMock(),
          maybeSingle: () => profileSingleMock(),
        }),
      }),
    }),
  },
}));

import { useMerits } from './useMerits';

// ── helpers ────────────────────────────────────────────────────────
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function seed(opts: {
  total: number;
  subscription: number;
  shop?: number;
  tier: 'free' | 'pro' | 'elite';
  resetDate?: string | null;
}) {
  rpcMock.mockResolvedValue({
    data: {
      total: opts.total,
      subscription_balance: opts.subscription,
      shop_balance: opts.shop ?? 0,
      next_reset_date: opts.resetDate ?? null,
    },
    error: null,
  });
  profileSingleMock.mockResolvedValue({
    data: { subscription_tier: opts.tier },
    error: null,
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  getUserMock.mockReset();
  profileSingleMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-123' } } });
});

describe('useMerits', () => {
  it('canAfford returns true when total >= cost and false otherwise', async () => {
    seed({ total: 10, subscription: 8, shop: 2, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(10));
    expect(result.current.canAfford(5)).toBe(true);
    expect(result.current.canAfford(10)).toBe(true);
    expect(result.current.canAfford(11)).toBe(false);
  });

  it('exposes cap + tier for UI consumers (D-08 surface)', async () => {
    seed({ total: 75, subscription: 75, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(75));
    expect(result.current.cap).toBe(150);
    expect(result.current.tier).toBe('elite');
  });

  it('isZero AND isLow both true when subscription=0 (WR-03/IN-01: consumers exclude isZero separately)', async () => {
    // WR-03 made zero-subscription qualify as "low" because refill is the
    // strongest nudge signal. IN-01: RunningLowCard / HeaderTopUpTrigger add
    // an `if (isZero) return null` guard so they yield to the destructive
    // "Limit Reached" banner on the Dashboard — the hook itself returns BOTH
    // flags as true and lets consumers decide which UI owns the zero state.
    seed({ total: 0, subscription: 0, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isZero).toBe(true);
    expect(result.current.isLow).toBe(true);
  });

  // ── D-08 Free tier (cap=10, low ≤ 2) ───────────────────────────
  it('free: balance=3/10 -> isLow=false (30% > 20%)', async () => {
    seed({ total: 3, subscription: 3, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.cap).toBe(10);
    expect(result.current.isLow).toBe(false);
  });

  it('free: balance=2/10 -> isLow=true (exactly 20%)', async () => {
    seed({ total: 2, subscription: 2, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.isLow).toBe(true);
  });

  it('free: balance=1/10 -> isLow=true (below 20%)', async () => {
    seed({ total: 1, subscription: 1, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.isLow).toBe(true);
  });

  // ── D-08 Pro tier (cap=75, low ≤ 15) ───────────────────────────
  it('pro: balance=16/75 -> isLow=false (above 20%)', async () => {
    seed({ total: 31, subscription: 31, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(31));
    expect(result.current.cap).toBe(150);
    expect(result.current.isLow).toBe(false);
  });

  it('pro: balance=15/75 -> isLow=true (exactly 20% — pro boundary)', async () => {
    seed({ total: 30, subscription: 30, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(30));
    expect(result.current.cap).toBe(150);
    expect(result.current.isLow).toBe(true);
  });

  // ── D-08 Elite tier (cap=150, low ≤ 30) ────────────────────────
  it('elite: balance=30/150 -> isLow=true (exactly 20%)', async () => {
    seed({ total: 30, subscription: 30, tier: 'elite' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(30));
    expect(result.current.cap).toBe(150);
    expect(result.current.isLow).toBe(true);
  });

  it('elite: balance=31/150 -> isLow=false (above 20%)', async () => {
    seed({ total: 31, subscription: 31, tier: 'elite' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(31));
    expect(result.current.isLow).toBe(false);
  });

  // ── UX-11 / SC-6: affordability invariants ─────────────────────
  it('UX-11: canAfford(cost) reactively flips false after balance drop via invalidation', async () => {
    seed({ total: 10, subscription: 10, tier: 'pro' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useMerits(), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(10));
    expect(result.current.canAfford(8)).toBe(true);
    expect(result.current.canAfford(15)).toBe(false);

    // Simulate post-deduction RPC response — next refetch returns 5.
    seed({ total: 5, subscription: 5, tier: 'pro' });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['merit-balance'] });
    });

    await waitFor(() => expect(result.current.total).toBe(5));
    expect(result.current.canAfford(8)).toBe(false);
  });

  it('UX-11: post-deduction balance consistent within 5s (staleTime invariant)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seed({ total: 10, subscription: 10, tier: 'pro' });
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 5_000 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);

      const { result } = renderHook(() => useMerits(), { wrapper });
      await waitFor(() => expect(result.current.total).toBe(10));
      expect(result.current.canAfford(5)).toBe(true);

      // RPC will now return reduced balance on next refetch.
      seed({ total: 3, subscription: 3, tier: 'pro' });

      // Advance past the 5s staleTime window AND invalidate to trigger refetch.
      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await qc.invalidateQueries({ queryKey: ['merit-balance'] });
      });

      await waitFor(() => expect(result.current.total).toBe(3));
      expect(result.current.canAfford(5)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // Phase 31: optimistic Merit balance settlement.
  it('optimisticDeduct writes the nested balance shape and rollback restores the snapshot', async () => {
    seed({ total: 10, subscription: 8, shop: 2, tier: 'pro' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useMerits(), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(10));

    let settle: { rollback: () => void; commit: () => void } | undefined;
    act(() => {
      settle = result.current.optimisticDeduct(3);
    });

    await waitFor(() => expect(result.current.total).toBe(7));
    expect(qc.getQueryData(['merit-balance', 'user-123'])).toMatchObject({
      balance: {
        total: 7,
        subscription_balance: 8,
        shop_balance: 2,
      },
      tier: 'elite',
    });

    await act(async () => {
      settle?.rollback();
    });

    await waitFor(() => expect(result.current.total).toBe(10));
    expect(qc.getQueryData(['merit-balance', 'user-123'])).toMatchObject({
      balance: { total: 10 },
      tier: 'elite',
    });
  });

  it('optimisticDeduct commit invalidates to the authoritative balance', async () => {
    seed({ total: 10, subscription: 10, tier: 'pro' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useMerits(), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(10));

    let settle: { rollback: () => void; commit: () => void } | undefined;
    act(() => {
      settle = result.current.optimisticDeduct(4);
    });
    await waitFor(() => expect(result.current.total).toBe(6));

    seed({ total: 6, subscription: 6, tier: 'pro' });
    await act(async () => {
      settle?.commit();
    });

    await waitFor(() => expect(result.current.total).toBe(6));
    expect(qc.getQueryData(['merit-balance', 'user-123'])).toMatchObject({
      balance: { total: 6 },
      tier: 'elite',
    });
  });

  // ── PRICE-03 (Phase 33): reconcileTierUpgrade poll ─────────────────
  it('reconcileTierUpgrade resolves when the cached tier changes from the at-call snapshot', async () => {
    // Snapshot tier = free. After the webhook lands, the next refetch returns pro.
    seed({ total: 10, subscription: 10, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.tier).toBe('free'));

    // Simulate the webhook write — next refetch (the poll invalidate triggers)
    // returns the new pro tier, so the poll's tier-change stop condition fires.
    seed({ total: 75, subscription: 75, tier: 'pro' });

    await act(async () => {
      await result.current.reconcileTierUpgrade();
    });

    await waitFor(() => expect(result.current.tier).toBe('elite'));
  });

  it('reconcileTierUpgrade resolves silently on timeout when the tier never changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      seed({ total: 10, subscription: 10, tier: 'free' });
      const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.tier).toBe('free'));

      // Tier stays free — the poll must walk to the 10s ceiling and resolve
      // without throwing and without any toast/error (no toast import here).
      let settled = false;
      await act(async () => {
        const p = result.current.reconcileTierUpgrade().then(() => {
          settled = true;
        });
        // Advance past the POLL_CEILING_MS (10000ms) window.
        await vi.advanceTimersByTimeAsync(11_000);
        await p;
      });

      expect(settled).toBe(true);
      expect(result.current.tier).toBe('free');
    } finally {
      vi.useRealTimers();
    }
  });
});
