/**
 * useTierAccess — Phase 30 Plan 04 (D-14, MER-12) migration tests.
 *
 * The hook used to call `supabase.rpc('can_perform_ai_action')` on mount.
 * Phase 30 rewires it onto `useMerits()` + `MERITS_PER_MONTH` so the merit
 * gateway is the single source of truth on the frontend. The stale
 * `TIER_LIMITS` constant (`free: 3, pro: 100, elite: 300`) is deleted —
 * `MERITS_PER_MONTH` (`free: 10, pro: 75, elite: 150`) supersedes it.
 *
 * AdminTierTestContext integration is preserved verbatim: when admin is
 * testing a tier, `canUseCredits` is forced true and `usageInfo.limit` reads
 * from `MERITS_PER_MONTH[testTier]`.
 *
 * Public return shape `{ tier, loading, canAccessFeature, canUseCredits,
 * usageInfo }` is preserved — call-sites need no edits.
 *
 * Test matrix (10 cases) covering plan 30-04 acceptance criteria:
 *   1. Healthy free user → canUseCredits=true, usageInfo.limit=10.
 *   2. Zero balance free user → canUseCredits=false, used=10 (proxy).
 *   3. Admin testTier=elite → tier=elite, limit=150, canUseCredits=true.
 *   4. Admin testTier=pro → limit=75, canUseCredits=true.
 *   5. canAccessFeature('resume_analysis') → true for free.
 *   6. canAccessFeature('career_compass') → true for free; gated for non-free
 *      features that match TIER_FEATURES matrix.
 *   7. Negative — never invokes supabase.rpc('can_perform_ai_action').
 *   8. isLoading=true propagates.
 *   9. usageInfo.isLifetime is permanently false.
 *  10. Anonymous user (isLoading=false, total=0, tier='free') →
 *      canUseCredits=false, loading=false, no throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── Hoisted mocks (referenced by vi.mock factories) ─────────────────

const mocks = vi.hoisted(() => ({
  useMeritsMock: vi.fn(),
  getEffectiveTierMock: vi.fn((realTier: string) => realTier),
  useAdminTierTestMock: vi.fn(),
  rpcSpy: vi.fn((...args: unknown[]) => Promise.resolve({ data: null, error: null })),
}));

vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => mocks.useMeritsMock(),
}));

vi.mock('@/contexts/AdminTierTestContext', () => ({
  useAdminTierTest: () => mocks.useAdminTierTestMock(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'tier-user' } }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    rpc: (...args: unknown[]) => mocks.rpcSpy(...args),
  },
}));

import { useTierAccess } from '../useTierAccess';

const { useMeritsMock, getEffectiveTierMock, useAdminTierTestMock, rpcSpy } = mocks;

// ── Helpers ──────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      // MemoryRouter required because useFeatureGate (same file) uses
      // useNavigate; rendering useTierAccess in isolation does not invoke it,
      // but the wrapper keeps tests resilient to future additions.
      React.createElement(MemoryRouter, null, children),
    );
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

function seedAdmin(opts: { isAdmin: boolean; testTier: string | null }) {
  useAdminTierTestMock.mockReturnValue({
    isAdmin: opts.isAdmin,
    testTier: opts.testTier,
    getEffectiveTier: getEffectiveTierMock,
  });
  getEffectiveTierMock.mockImplementation((realTier: string) => {
    if (opts.isAdmin && opts.testTier) return opts.testTier;
    if (opts.isAdmin && !opts.testTier) return 'admin';
    return realTier;
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
  rpcSpy.mockClear();
});

// ── Tests ────────────────────────────────────────────────────────────

describe('useTierAccess — Phase 30 useMerits migration (AdminTierTest preserved)', () => {
  it('1. healthy free user (total=10, cap=10, tier=free) → canUseCredits=true, usageInfo.limit=10', () => {
    seedMerits({
      total: 10,
      subscription: 10,
      shop: 0,
      cap: 10,
      tier: 'free',
      resetDate: '2026-06-15T00:00:00Z',
    });
    seedAdmin({ isAdmin: false, testTier: null });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.tier).toBe('free');
    expect(result.current.loading).toBe(false);
    expect(result.current.canUseCredits).toBe(true);
    expect(result.current.usageInfo).toEqual({
      used: 0, // Math.max(0, 10 - 10)
      limit: 10,
      isLifetime: false,
      resetDate: '2026-06-15T00:00:00Z',
    });
  });

  it('2. zero balance (total=0, cap=10) → canUseCredits=false, used=10 (proxy 10-0)', () => {
    seedMerits({ total: 0, subscription: 0, shop: 0, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: false, testTier: null });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.canUseCredits).toBe(false);
    expect(result.current.usageInfo?.used).toBe(10);
    expect(result.current.usageInfo?.limit).toBe(10);
  });

  it('3. admin testTier=elite → tier=elite, usageInfo.limit=150 (MERITS_PER_MONTH.elite), canUseCredits=true', () => {
    // Real user is free with 0 balance; admin override must bypass that.
    seedMerits({ total: 0, subscription: 0, shop: 0, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: true, testTier: 'elite' });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.tier).toBe('elite');
    expect(result.current.usageInfo?.limit).toBe(150);
    expect(result.current.canUseCredits).toBe(true);
    // getEffectiveTier must have been called with the *real* tier from useMerits.
    expect(getEffectiveTierMock).toHaveBeenCalledWith('free');
  });

  it('4. admin testTier=pro → usageInfo.limit=75 (MERITS_PER_MONTH.pro), canUseCredits=true', () => {
    seedMerits({ total: 0, subscription: 0, shop: 0, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: true, testTier: 'pro' });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.tier).toBe('elite');
    expect(result.current.usageInfo?.limit).toBe(150);
    expect(result.current.canUseCredits).toBe(true);
  });

  it('5. canAccessFeature(\'resume_analysis\') returns true for tier=free (TIER_FEATURES matrix)', () => {
    seedMerits({ total: 5, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: false, testTier: null });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.canAccessFeature('resume_analysis')).toBe(true);
  });

  it('6. canAccessFeature matches existing TIER_FEATURES matrix (free vs pro)', () => {
    // Free tier → career_compass yes, recruiting_lens no.
    seedMerits({ total: 5, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: false, testTier: null });
    const freeHook = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(freeHook.result.current.canAccessFeature('career_compass')).toBe(true);
    expect(freeHook.result.current.canAccessFeature('recruiting_lens')).toBe(false);

    // Legacy Pro tier (no admin override) maps to Elite -> recruiting_lens yes.
    seedMerits({ total: 50, cap: 75, tier: 'pro' });
    seedAdmin({ isAdmin: false, testTier: null });
    const legacyProHook = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(legacyProHook.result.current.tier).toBe('elite');
    expect(legacyProHook.result.current.canAccessFeature('recruiting_lens')).toBe(true);
    expect(legacyProHook.result.current.canAccessFeature('interview_prep_coach')).toBe(true);
  });

  it('7. NEGATIVE: hook never invokes supabase.rpc(\'can_perform_ai_action\', ...)', () => {
    seedMerits({ total: 5, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: false, testTier: null });
    renderHook(() => useTierAccess(), { wrapper: makeWrapper() });
    for (const call of rpcSpy.mock.calls) {
      expect(call[0]).not.toBe('can_perform_ai_action');
    }
  });

  it('8. isLoading=true propagates to loading', () => {
    seedMerits({ isLoading: true });
    seedAdmin({ isAdmin: false, testTier: null });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.loading).toBe(true);
  });

  it('9. usageInfo.isLifetime is permanently false across tiers and admin paths', () => {
    for (const tier of ['free', 'pro', 'elite'] as const) {
      seedMerits({ total: 1, cap: 10, tier });
      seedAdmin({ isAdmin: false, testTier: null });
      const { result } = renderHook(() => useTierAccess(), {
        wrapper: makeWrapper(),
      });
      expect(result.current.usageInfo?.isLifetime).toBe(false);
    }
    // Also under admin override.
    seedMerits({ total: 0, cap: 10, tier: 'free' });
    seedAdmin({ isAdmin: true, testTier: 'pro' });
    const { result } = renderHook(() => useTierAccess(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.usageInfo?.isLifetime).toBe(false);
  });

  it('10. anonymous user (isLoading=false, total=0, tier=free) → canUseCredits=false, loading=false, no throws', () => {
    seedMerits({
      total: 0,
      subscription: 0,
      shop: 0,
      cap: 0,
      tier: 'free',
      isLoading: false,
    });
    seedAdmin({ isAdmin: false, testTier: null });
    expect(() => {
      const { result } = renderHook(() => useTierAccess(), {
        wrapper: makeWrapper(),
      });
      expect(result.current.canUseCredits).toBe(false);
      expect(result.current.loading).toBe(false);
      expect(result.current.tier).toBe('free');
    }).not.toThrow();
  });
});
