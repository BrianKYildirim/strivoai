/**
 * usePaywallGuard — Phase 30 Plan 04 (D-13, MER-12) migration tests.
 *
 * The hook used to call `supabase.rpc('can_perform_ai_action', { p_user_id })`
 * on mount and mirror that result into local state. Phase 30 rewires the hook
 * to consume `useMerits()` instead so the merit gateway is the single decision
 * point for the paywall on the frontend.
 *
 * The public return shape is preserved verbatim — 14+ call-sites destructure
 * `{ canAnalyze, tier, analysisCount, limit, resetDate, isLifetimeLimit,
 * loading, modalProps, openModal, triggerPaywall, refresh }` and must not need
 * any edits.
 *
 * Test matrix (10 cases) covering plan 30-04 acceptance criteria:
 *   1. Healthy free user → canAnalyze=true, limit=cap.
 *   2. Zero balance → canAnalyze=false.
 *   3. isLoading=true propagates to `loading`.
 *   4. Pro user with shop-funded balance → canAnalyze=true.
 *   5. analysisCount proxy = Math.max(0, cap - subscription).
 *   6. isLifetimeLimit is always false (post-MER-01 invariant).
 *   7. Negative assertion — never calls supabase.rpc('can_perform_ai_action').
 *   8. Admin testTier override → effective tier from getEffectiveTier.
 *   9. triggerPaywall(args) forwards to useOutOfMeritsModal.openModal.
 *  10. Anonymous degradation (useMerits returns isLoading=false, total=0) →
 *      canAnalyze=false, loading=false, no throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { makeSupabaseMock } from '@/test/supabaseMock';

// ── Mocks ────────────────────────────────────────────────────────────

// vi.mock factories are hoisted above all top-level code, so any variable
// they reference must be declared via vi.hoisted (which itself runs first).
const mocks = vi.hoisted(() => {
  const modalPropsFixture = {
    open: false,
    onOpenChange: () => {},
    feature: '',
    cost: 0,
    balance: 0,
  };
  return {
    useMeritsMock: vi.fn(),
    getEffectiveTierMock: vi.fn((realTier: string) => realTier),
    useAdminTierTestMock: vi.fn(),
    openModalMock: vi.fn(),
    useOutOfMeritsModalMock: vi.fn(),
    rpcSpy: vi.fn((...args: unknown[]) => Promise.resolve({ data: null, error: null })),
    modalPropsFixture,
  };
});

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => mocks.useMeritsMock(),
}));

vi.mock('@/contexts/AdminTierTestContext', () => ({
  useAdminTierTest: () => mocks.useAdminTierTestMock(),
}));

vi.mock('@/hooks/useOutOfMeritsModal', () => ({
  useOutOfMeritsModal: () => mocks.useOutOfMeritsModalMock(),
}));

// Complete chainable mock (via makeSupabaseMock) so any transitively-issued
// query chain is inert; `auth.getUser` and `rpc` are overridden to preserve the
// guard-user fixture and the rpcSpy that test 7 inspects.
vi.mock('@/lib/supabaseClient', () => {
  const supabase = makeSupabaseMock({ user: { id: 'guard-user' } });
  supabase.rpc = (...args: unknown[]) => mocks.rpcSpy(...args);
  return { supabase };
});

const {
  useMeritsMock,
  getEffectiveTierMock,
  useAdminTierTestMock,
  openModalMock,
  useOutOfMeritsModalMock,
  rpcSpy,
  modalPropsFixture,
} = mocks;

import { usePaywallGuard } from '../usePaywallGuard';

// ── Helpers ──────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function seedMerits(partial: {
  total?: number;
  subscription?: number;
  shop?: number;
  cap?: number;
  tier?: 'free' | 'pro' | 'elite';
  resetDate?: string | null;
  isLoading?: boolean;
}) {
  useMeritsMock.mockReturnValue({
    total: partial.total ?? 0,
    subscription: partial.subscription ?? 0,
    shop: partial.shop ?? 0,
    cap: partial.cap ?? 0,
    tier: partial.tier ?? 'free',
    resetDate: partial.resetDate ?? null,
    isLow: false,
    isZero: (partial.total ?? 0) <= 0,
    isLoading: partial.isLoading ?? false,
    canAfford: (cost: number) => (partial.total ?? 0) >= cost,
  });
}

beforeEach(() => {
  useMeritsMock.mockReset();
  getEffectiveTierMock.mockReset();
  getEffectiveTierMock.mockImplementation((realTier: string) => realTier);
  useAdminTierTestMock.mockReset();
  useAdminTierTestMock.mockReturnValue({
    isAdmin: false,
    testTier: null,
    getEffectiveTier: getEffectiveTierMock,
  });
  openModalMock.mockReset();
  useOutOfMeritsModalMock.mockReset();
  useOutOfMeritsModalMock.mockReturnValue({
    isOpen: false,
    openModal: openModalMock,
    closeModal: () => {},
    modalProps: modalPropsFixture,
  });
  rpcSpy.mockClear();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('usePaywallGuard — Phase 30 useMerits migration', () => {
  it('1. healthy free user (total=10, cap=10, tier=free) → canAnalyze=true, limit=10', () => {
    seedMerits({
      total: 10,
      subscription: 10,
      shop: 0,
      cap: 10,
      tier: 'free',
      resetDate: '2026-06-15T00:00:00Z',
      isLoading: false,
    });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.canAnalyze).toBe(true);
    expect(result.current.tier).toBe('free');
    expect(result.current.limit).toBe(10);
    expect(result.current.resetDate).toBe('2026-06-15T00:00:00Z');
    expect(result.current.isLifetimeLimit).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('2. zero balance (total=0, cap=10) → canAnalyze=false, limit=10', () => {
    seedMerits({ total: 0, subscription: 0, shop: 0, cap: 10, tier: 'free' });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.canAnalyze).toBe(false);
    expect(result.current.limit).toBe(10);
    expect(result.current.isLifetimeLimit).toBe(false);
  });

  it('3. isLoading=true propagates to loading', () => {
    seedMerits({ isLoading: true, total: 0, cap: 0 });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.loading).toBe(true);
  });

  it('4. Pro user with shop-funded balance (total=3, subscription=0, shop=3, cap=75) → canAnalyze=true', () => {
    seedMerits({
      total: 3,
      subscription: 0,
      shop: 3,
      cap: 75,
      tier: 'pro',
    });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.canAnalyze).toBe(true);
    expect(result.current.tier).toBe('elite');
  });

  it('5. analysisCount proxy = Math.max(0, cap - subscription) — cap=10, subscription=8 → 2', () => {
    seedMerits({
      total: 2,
      subscription: 8,
      shop: 0,
      cap: 10,
      tier: 'free',
    });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.analysisCount).toBe(2);
  });

  it('5b. analysisCount clamps to 0 when subscription > cap (shop top-up scenario)', () => {
    seedMerits({
      total: 15,
      subscription: 12,
      shop: 3,
      cap: 10,
      tier: 'free',
    });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.analysisCount).toBe(0);
  });

  it('6. isLifetimeLimit is permanently false across all tiers', () => {
    for (const tier of ['free', 'pro', 'elite'] as const) {
      seedMerits({ total: 1, cap: 10, tier });
      const { result } = renderHook(() => usePaywallGuard(), {
        wrapper: makeWrapper(),
      });
      expect(result.current.isLifetimeLimit).toBe(false);
    }
  });

  it('7. NEGATIVE: hook never invokes supabase.rpc(\'can_perform_ai_action\', ...)', () => {
    seedMerits({ total: 5, cap: 10, tier: 'free' });
    renderHook(() => usePaywallGuard(), { wrapper: makeWrapper() });
    // Scan all rpc calls; none may target the legacy gate function.
    for (const call of rpcSpy.mock.calls) {
      expect(call[0]).not.toBe('can_perform_ai_action');
    }
  });

  it('8. admin testTier=elite override → tier=elite via getEffectiveTier', () => {
    getEffectiveTierMock.mockImplementation(() => 'elite');
    useAdminTierTestMock.mockReturnValue({
      isAdmin: true,
      testTier: 'elite',
      getEffectiveTier: getEffectiveTierMock,
    });
    seedMerits({ total: 5, cap: 10, tier: 'free' });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.tier).toBe('elite');
    expect(getEffectiveTierMock).toHaveBeenCalledWith('free');
  });

  it('9. triggerPaywall(args) forwards to useOutOfMeritsModal.openModal', () => {
    seedMerits({ total: 0, cap: 10, tier: 'free' });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.triggerPaywall({
        feature: 'Resume Analysis',
        cost: 3,
        balance: 0,
      });
    });
    expect(openModalMock).toHaveBeenCalledWith({
      feature: 'Resume Analysis',
      cost: 3,
      balance: 0,
    });
  });

  it('9b. triggerPaywall() without args falls back to default Analysis payload', () => {
    seedMerits({ total: 0, cap: 10, tier: 'free' });
    const { result } = renderHook(() => usePaywallGuard(), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.triggerPaywall();
    });
    expect(openModalMock).toHaveBeenCalledWith({
      feature: 'Analysis',
      cost: 0,
      balance: 0,
    });
  });

  it('10. anonymous degradation — useMerits returns isLoading=false, total=0 → canAnalyze=false, loading=false, no throws', () => {
    seedMerits({
      total: 0,
      subscription: 0,
      shop: 0,
      cap: 0,
      tier: 'free',
      resetDate: null,
      isLoading: false,
    });
    expect(() => {
      const { result } = renderHook(() => usePaywallGuard(), {
        wrapper: makeWrapper(),
      });
      expect(result.current.canAnalyze).toBe(false);
      expect(result.current.loading).toBe(false);
    }).not.toThrow();
  });
});
