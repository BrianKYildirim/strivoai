/**
 * useMerits — D-11 (Phase 30) isLow-on-total contract tests.
 *
 * Phase 30 redefines `isLow` to operate on TOTAL (subscription + shop), not on
 * subscription alone. The trigger now displays `{total} / {cap}`, so the
 * warning state must agree with the displayed ratio (display-vs-warning
 * agreement, D-11). `isZero` already operated on total (≤ 0) and stays that
 * way. The legacy file `src/hooks/useMerits.test.ts` retains pre-Phase-30
 * tier-boundary cases — those tests happen to use `shop = 0`, so they still
 * pass under the new formula; the cases below specifically exercise the
 * subscription/shop split that the old formula would have mis-classified.
 *
 * Behavior matrix (8 cases) covering D-11:
 *   1. cap=0 guard → isLow=false (divide-by-zero safety)
 *   2. Free 2 sub + 0 shop / cap=10 → isLow=true, isZero=false (2/10 ≤ 0.2)
 *   3. Free 0 sub + 0 shop / cap=10 → isZero=true (total=0)
 *   4. Pro 0 sub + 3 shop / cap=75 → isLow=true (3/75 ≈ 0.04), isZero=false
 *   5. Pro 0 sub + 20 shop / cap=75 → isLow=FALSE (20/75 ≈ 0.27 > 0.2)
 *      — old formula (subscription/cap = 0/75 = 0) would have said low; D-11 says no.
 *   6. Pro 15 sub + 15 shop / cap=75 → isLow=FALSE (30/75 = 0.4 > 0.2)
 *      — old formula (15/75 = 0.2) would have flipped low; D-11 says no.
 *   7. Pro 1 sub + 0 shop / cap=75 → isLow=true (1/75 < 0.2), isZero=false
 *   8. Elite 31 sub + 0 shop / cap=150 → isLow=false (31/150 ≈ 0.207 > 0.2)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
          single: () => profileSingleMock(),
          maybeSingle: () => profileSingleMock(),
        }),
      }),
    }),
  },
}));

import { useMerits } from '../useMerits';

// ── helpers ────────────────────────────────────────────────────────
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function seed(opts: {
  subscription: number;
  shop: number;
  tier: 'free' | 'pro' | 'elite';
}) {
  const total = opts.subscription + opts.shop;
  rpcMock.mockResolvedValue({
    data: {
      total,
      subscription_balance: opts.subscription,
      shop_balance: opts.shop,
      next_reset_date: null,
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
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-d11' } } });
});

describe('useMerits — D-11 (Phase 30) isLow operates on total = subscription + shop', () => {
  it('cap=0 guard: isLow=false even if total=0 (divide-by-zero safety)', async () => {
    // No tier in MERITS_PER_MONTH yields cap=0; simulate by mocking an unknown
    // tier value so the lookup falls back to the `?? 0` branch.
    rpcMock.mockResolvedValue({
      data: {
        total: 0,
        subscription_balance: 0,
        shop_balance: 0,
        next_reset_date: null,
      },
      error: null,
    });
    profileSingleMock.mockResolvedValue({
      data: { subscription_tier: 'unknown-tier' },
      error: null,
    });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cap).toBe(10);
    expect(result.current.isLow).toBe(true);
  });

  it('Free 2 sub + 0 shop / cap=10 → isLow=true (total/cap = 0.2), isZero=false', async () => {
    seed({ subscription: 2, shop: 0, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.cap).toBe(10);
    expect(result.current.isLow).toBe(true);
    expect(result.current.isZero).toBe(false);
  });

  it('Free 0 sub + 0 shop / cap=10 → isZero=true (total=0)', async () => {
    seed({ subscription: 0, shop: 0, tier: 'free' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isZero).toBe(true);
  });

  it('Pro 0 sub + 3 shop / cap=75 → isLow=true (3/75 ≈ 0.04), isZero=false', async () => {
    seed({ subscription: 0, shop: 3, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.cap).toBe(150);
    expect(result.current.isLow).toBe(true);
    expect(result.current.isZero).toBe(false);
  });

  it('Pro 0 sub + 20 shop / cap=75 → isLow=FALSE (20/75 ≈ 0.27 > 0.2) — D-11 flip', async () => {
    // Old formula: subscription/cap = 0/75 = 0 ≤ 0.2 → low.
    // New formula: total/cap = 20/75 ≈ 0.267 > 0.2 → NOT low.
    seed({ subscription: 0, shop: 31, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(31));
    expect(result.current.isLow).toBe(false);
    expect(result.current.isZero).toBe(false);
  });

  it('Pro 15 sub + 15 shop / cap=75 → isLow=FALSE (30/75 = 0.4) — D-11 flip', async () => {
    // Old formula: subscription/cap = 15/75 = 0.2 ≤ 0.2 → low.
    // New formula: total/cap = 30/75 = 0.4 > 0.2 → NOT low.
    seed({ subscription: 15, shop: 15, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(30));
    expect(result.current.isLow).toBe(true);
  });

  it('Pro 1 sub + 0 shop / cap=75 → isLow=true (1/75 < 0.2), isZero=false', async () => {
    seed({ subscription: 1, shop: 0, tier: 'pro' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.isLow).toBe(true);
    expect(result.current.isZero).toBe(false);
  });

  it('Elite 31 sub + 0 shop / cap=150 → isLow=false (31/150 ≈ 0.207 > 0.2)', async () => {
    seed({ subscription: 31, shop: 0, tier: 'elite' });
    const { result } = renderHook(() => useMerits(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.total).toBe(31));
    expect(result.current.cap).toBe(150);
    expect(result.current.isLow).toBe(false);
  });
});
