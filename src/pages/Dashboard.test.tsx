/**
 * Dashboard — ?checkout=complete reconciliation contract tests (PRICE-03, Plan 03).
 *
 * Wave 0 (Task 1): authored BEFORE the implementation (Task 4) so the mount
 * effect has a failing target to turn green (Nyquist ordering).
 *
 * Behaviors asserted (from Task 4 <behavior>):
 *  - Rendering at /dashboard?checkout=complete fires the "Upgrade processing…"
 *    toast once on mount.
 *  - The mount effect calls reconcileTierUpgrade exactly once.
 *  - The checkout query param is removed via setSearchParams(..., { replace:true });
 *    when absent, neither the toast nor reconcileTierUpgrade fire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── router mock: control searchParams + capture setSearchParams ─────
const setSearchParamsMock = vi.fn();
let searchString = '?checkout=complete';
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(searchString), setSearchParamsMock],
  };
});

// ── hooks ───────────────────────────────────────────────────────────
const reconcileTierUpgradeMock = vi.fn().mockResolvedValue(undefined);
const reconcilePendingDowngradeMock = vi.fn().mockResolvedValue('reconciled');
const subscriptionState = {
  userId: 'u1' as string | null,
  isPendingDowngrade: false,
  currentPeriodEnd: null as Date | null,
  reconcilePendingDowngrade: reconcilePendingDowngradeMock,
};
vi.mock('@/hooks/useMerits', () => ({
  useMerits: () => ({
    isZero: false,
    reconcileTierUpgrade: reconcileTierUpgradeMock,
  }),
}));

vi.mock('@/hooks/useTierAccess', () => ({
  useTierAccess: () => ({ tier: 'free', loading: false }),
}));

vi.mock('@/hooks/useSubscriptionState', () => ({
  useSubscriptionState: () => subscriptionState,
}));

// ── sonner ──────────────────────────────────────────────────────────
const toastMock = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastMock(...a), {
    success: (...a: unknown[]) => toastMock(...a),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

// ── supabase: keep the dashboard queries inert ──────────────────────
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
      // useAuthUserId resolves the id from the LOCAL session (no /auth/v1/user hop),
      // so the mock surface needs getSession + onAuthStateChange alongside getUser.
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          lt: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          // useProfessionalGoal reads career_targets via .maybeSingle(). No goal and no
          // persisted readiness in this fixture -> the hero renders '--', which is exactly
          // the un-evidenced path we want the removed-surface assertions to run against.
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ remove: vi.fn() }) },
  },
}));

// Heavy child components — labeled stubs keep order assertions deterministic.
vi.mock('@/components/topup/RunningLowCard', () => ({
  RunningLowCard: () => <div data-testid="running-low-banner" />,
}));
vi.mock('@/components/applications/OutcomeOverdueBanner', () => ({
  default: () => <div data-testid="outcome-overdue-banner" />,
}));
vi.mock('@/components/dashboard/CohortBackfillBanner', () => ({
  default: () => <div data-testid="cohort-backfill-banner" />,
}));

import Dashboard from './Dashboard';

function renderDashboard(seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard${searchString}`]}>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setSearchParamsMock.mockReset();
  reconcileTierUpgradeMock.mockClear();
  reconcilePendingDowngradeMock.mockClear();
  toastMock.mockReset();
  subscriptionState.userId = 'u1';
  subscriptionState.isPendingDowngrade = false;
  subscriptionState.currentPeriodEnd = null;
  searchString = '?checkout=complete';
});

describe('Dashboard ?checkout=complete reconciliation (PRICE-03)', () => {
  it('fires the "Upgrade processing…" toast once on mount', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(toastMock.mock.calls.some((c) => /upgrade processing/i.test(String(c[0])))).toBe(true),
    );
  });

  it('calls reconcileTierUpgrade exactly once on mount', async () => {
    renderDashboard();
    await waitFor(() => expect(reconcileTierUpgradeMock).toHaveBeenCalledTimes(1));
  });

  it('cleans the checkout param with { replace: true } on mount', async () => {
    renderDashboard();
    await waitFor(() => expect(setSearchParamsMock).toHaveBeenCalled());
    const call = setSearchParamsMock.mock.calls[0];
    const params = call[0] as URLSearchParams;
    expect(params.get('checkout')).toBeNull();
    expect(call[1]).toEqual({ replace: true });
  });

  it('does NOT toast or reconcile when checkout param is absent', async () => {
    searchString = '';
    renderDashboard();
    await new Promise((r) => setTimeout(r, 50));
    expect(reconcileTierUpgradeMock).not.toHaveBeenCalled();
    expect(toastMock.mock.calls.some((c) => /upgrade processing/i.test(String(c[0])))).toBe(false);
  });

  it('renders Profile Alignment and keeps removed dashboard surfaces absent', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Profile Alignment' })).toBeInTheDocument();
    expect(screen.queryByText('Progress and Achievements')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity Stream')).not.toBeInTheDocument();
  });

  it('renders the final dashboard intelligence sections without the retired Live Career Profile', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Recruiter First Impression' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Profile Alignment' })).toBeInTheDocument();
    expect(screen.queryByText('Live Career Profile')).not.toBeInTheDocument();
  });

  it('retires the resume-vault section and the tab shell (UI-only removal)', async () => {
    // Quick 260712-msh: "Every Version, Ranked" and the 2-tab wrapper are gone from the
    // dashboard UI; SavedJobsDashboard renders directly, so there is no "Saved Jobs" TAB.
    // These two assertions previously encoded the OLD contract (toBeInTheDocument) — this
    // is a Rule-1 stale-test reconciliation, NOT a weakening.
    //
    // The removal is UI-ONLY: resume versions, analyses, comparison, /results/*,
    // /improvements/* and /history are all untouched.
    renderDashboard();
    await screen.findByRole('heading', { name: 'Profile Alignment' });

    expect(screen.queryByRole('heading', { name: 'Every Version, Ranked' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Saved Jobs' })).not.toBeInTheDocument();
  });

  it('renders the real Goal Readiness surface in place of the decorative readiness number', async () => {
    // The positive half of the contract: the decorative "Live readiness" number is gone
    // and Goal Readiness (hero panel, command card, Readiness Matrix headline) took its
    // place — all reading the SAME persisted value.
    renderDashboard();
    await screen.findByRole('heading', { name: 'Profile Alignment' });

    expect(screen.getAllByText('Goal Readiness').length).toBeGreaterThan(0);
    expect(screen.queryByText('Live readiness')).not.toBeInTheDocument();
  });

  it('renders an eligible real subscription warning before every existing dashboard banner', async () => {
    subscriptionState.isPendingDowngrade = true;
    subscriptionState.currentPeriodEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    renderDashboard();

    const warning = await screen.findByRole('heading', { name: 'Elite expiration reminder' });
    const alert = warning.closest('[role="alert"]');
    expect(alert).not.toBeNull();

    for (const testId of [
      'running-low-banner',
      'outcome-overdue-banner',
      'cohort-backfill-banner',
    ]) {
      const banner = screen.getByTestId(testId);
      expect(alert!.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('paints cached numbers on the first render of a warm navigation, with no loading gate', async () => {
    // The warm path the cold-load gate must never fire on: every query the gate reads
    // already has a cache entry, so `isLoading` is false on the very first render.
    renderDashboard((queryClient) => {
      queryClient.setQueryData(['auth', 'userId'], 'u1');
      queryClient.setQueryData(['resumes', 'u1'], {
        pages: [[{ id: 'r1', file_name: 'cv.pdf', created_at: new Date().toISOString(), overall_score: 87 }]],
        pageParams: [null],
      });
      queryClient.setQueryData(['savedJobs', 'u1'], { pages: [[]], pageParams: [null] });
      // tier is part of these keys so an Elite user refetches with the elite row limit.
      queryClient.setQueryData(['dashboardLinkedInGrades', 'u1', 'free'], []);
      queryClient.setQueryData(['dashboardAnalysisHistory', 'u1', 'free'], []);
      queryClient.setQueryData(['professionalGoal', 'u1'], {
        professionalGoal: null,
        structured: null,
        goalSetAt: null,
        goalReadinessScore: null,
        goalReadinessComponents: null,
        goalReadinessComputedAt: null,
      });
    });

    // Synchronous, deliberately: no findBy*, no waitFor. A real value from the cache
    // must be on screen on the first paint, and the gate must never have appeared.
    // 87 is the cached resume score — it reaches the Resume Strength card and the
    // derived intelligence sections, so assert on the set rather than a single node.
    expect(screen.getAllByText('87%').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Profile Alignment' })).toBeInTheDocument();
  });

  it('does not render the warning outside the final week or without pending state', async () => {
    subscriptionState.isPendingDowngrade = true;
    subscriptionState.currentPeriodEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const first = renderDashboard();
    await screen.findByRole('heading', { name: 'Profile Alignment' });
    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();

    first.unmount();
    subscriptionState.isPendingDowngrade = false;
    subscriptionState.currentPeriodEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    renderDashboard();
    await screen.findByRole('heading', { name: 'Profile Alignment' });
    expect(screen.queryByRole('heading', { name: 'Elite expiration reminder' })).not.toBeInTheDocument();
  });
});
