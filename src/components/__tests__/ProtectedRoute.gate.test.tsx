/**
 * ProtectedRoute — redirect matrix + onboarding-gate cache asymmetry.
 *
 * ProtectedRoute had no test anywhere in the repo, and quick 260729-02a rewrites its
 * gate to read from a React Query cache. These tests pin the behaviour that must NOT
 * change (the three redirects, the fail-open posture) and the one behaviour that is
 * new: a PASSING verdict is served from cache, a redirecting one never is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { makeSupabaseMock } from '@/test/supabaseMock';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// Both gate lookups are distinguishable by their terminal method: the resumes probe
// ends in .limit(1), the career_targets probe in .maybeSingle().
const resumeLookup = vi.fn();
const goalLookup = vi.fn();
const authListeners: Array<(event: string, session: unknown) => void> = [];
let sessionUser: { id: string } | null = { id: 'user-1' };

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    ...makeSupabaseMock(),
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: sessionUser ? { user: sessionUser } : null },
          error: null,
        }),
      getUser: () => Promise.resolve({ data: { user: sessionUser }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => resumeLookup(),
          maybeSingle: () => goalLookup(),
        }),
      }),
    }),
  },
}));

import { ProtectedRoute } from '../ProtectedRoute';

function seedGate(opts: { hasResume: boolean; hasGoal: boolean; goalError?: unknown }) {
  resumeLookup.mockResolvedValue({ data: opts.hasResume ? [{ id: 'r1' }] : [], error: null });
  goalLookup.mockResolvedValue({
    data: opts.hasGoal ? { professional_goal: 'Staff Engineer in 2027' } : null,
    error: opts.goalError ?? null,
  });
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function renderGuard(
  queryClient: QueryClient,
  props: { skipOnboardingCheck?: boolean } = {},
  pathname = '/dashboard',
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pathname]}>
        <ProtectedRoute {...props}>
          <div>protected content</div>
        </ProtectedRoute>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  resumeLookup.mockReset();
  goalLookup.mockReset();
  authListeners.length = 0;
  sessionUser = { id: 'user-1' };
  seedGate({ hasResume: true, hasGoal: true });
});

describe('ProtectedRoute — redirect matrix', () => {
  it('sends a visitor with no session to /auth and renders no children', async () => {
    sessionUser = null;
    renderGuard(makeClient());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/auth'));
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(resumeLookup).not.toHaveBeenCalled();
  });

  it('sends an explicit sign-out to the public homepage, not the auth gate', async () => {
    renderGuard(makeClient());
    await waitFor(() => expect(authListeners.length).toBeGreaterThan(0));

    authListeners.forEach((cb) => cb('SIGNED_OUT', null));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
    expect(navigateMock).not.toHaveBeenCalledWith('/auth');
  });

  it('sends a user with no resume to /onboarding', async () => {
    seedGate({ hasResume: false, hasGoal: false });
    renderGuard(makeClient());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/onboarding'));
  });

  it('sends a user with a resume but no professional goal to /onboarding', async () => {
    seedGate({ hasResume: true, hasGoal: false });
    renderGuard(makeClient());

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/onboarding'));
  });

  it('FAILS OPEN when the goal lookup itself errors — renders children, never redirects', async () => {
    seedGate({ hasResume: true, hasGoal: false, goalError: { message: 'boom' } });
    renderGuard(makeClient());

    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding');
  });

  it('renders children for a fully onboarded user', async () => {
    renderGuard(makeClient());

    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('skipOnboardingCheck renders children without issuing either gate lookup', async () => {
    renderGuard(makeClient(), { skipOnboardingCheck: true }, '/onboarding');

    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(resumeLookup).not.toHaveBeenCalled();
    expect(goalLookup).not.toHaveBeenCalled();
  });
});

describe('ProtectedRoute — onboarding gate cache asymmetry (DD-4)', () => {
  it('serves a PASSING verdict from cache: no second lookup, no loading pass', async () => {
    const queryClient = makeClient();
    const first = renderGuard(queryClient);
    expect(await screen.findByText('protected content')).toBeInTheDocument();
    first.unmount();

    resumeLookup.mockClear();
    goalLookup.mockClear();

    renderGuard(queryClient);
    // Synchronous: a warm passing verdict must render children on the FIRST paint.
    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(resumeLookup).not.toHaveBeenCalled();
    expect(goalLookup).not.toHaveBeenCalled();
  });

  it('never serves a REDIRECTING verdict from cache: the lookups are re-issued', async () => {
    seedGate({ hasResume: false, hasGoal: false });
    const queryClient = makeClient();
    const first = renderGuard(queryClient);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/onboarding'));
    first.unmount();

    resumeLookup.mockClear();
    goalLookup.mockClear();
    navigateMock.mockReset();
    // The user completed onboarding in between — the refetch must see the new truth
    // and must NOT bounce them back on the cached failure.
    seedGate({ hasResume: true, hasGoal: true });

    renderGuard(queryClient);

    await waitFor(() => expect(resumeLookup).toHaveBeenCalled());
    expect(goalLookup).toHaveBeenCalled();
    expect(await screen.findByText('protected content')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/onboarding');
  });
});
