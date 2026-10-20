import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * The professional-goal gate (quick 260712-msh, Task 5).
 *
 * `hasCompletedOnboarding` used to mean "has a resume". It now means
 * "has a resume AND has typed a professional goal". The load-bearing case is the
 * LEGACY user — resume present, professional_goal NULL — who must NOT be treated as
 * onboarded, because ProtectedRoute routes exactly that user to onboarding Step 4.
 */

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resumesMock: vi.fn(),
  profileMock: vi.fn(),
  targetsMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () => mocks.getUserMock(),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          // resumes: .limit(1) — thenable so `await` resolves it
          limit: () => mocks.resumesMock(),
          single: () => mocks.profileMock(),
          maybeSingle: () => mocks.targetsMock(),
        }),
      }),
      _table: table,
    }),
  },
}));

import { useOnboardingStatus } from '../useOnboardingStatus';

const PROFILE = {
  data: {
    linkedin_pdf_content: null,
    linkedin_url: 'https://linkedin.com/in/e2e',
    preferred_locations: ['New York'],
    full_name: 'Test User',
  },
  error: null,
};

beforeEach(() => {
  mocks.getUserMock.mockReset();
  mocks.resumesMock.mockReset();
  mocks.profileMock.mockReset();
  mocks.targetsMock.mockReset();

  mocks.getUserMock.mockResolvedValue({ data: { user: { id: 'user-42' } }, error: null });
  mocks.resumesMock.mockResolvedValue({ data: [{ id: 'resume-1' }], error: null });
  mocks.profileMock.mockResolvedValue(PROFILE);
  mocks.targetsMock.mockResolvedValue({
    data: {
      target_roles: ['Investment Banking'],
      target_industries: ['Finance'],
      professional_goal: 'Investment Banking Internship in New York — 2027',
    },
    error: null,
  });
});

describe('useOnboardingStatus — professional goal gate', () => {
  it('resume + goal -> onboarding complete', async () => {
    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasResume).toBe(true);
    expect(result.current.hasProfessionalGoal).toBe(true);
    expect(result.current.professionalGoal).toBe('Investment Banking Internship in New York — 2027');
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('LEGACY USER: resume, NO goal -> NOT onboarded (routed to Step 4)', async () => {
    mocks.targetsMock.mockResolvedValue({
      data: {
        target_roles: ['Investment Banking'],
        target_industries: ['Finance'],
        professional_goal: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasResume).toBe(true);
    expect(result.current.hasProfessionalGoal).toBe(false);
    expect(result.current.professionalGoal).toBeNull();
    // The whole point of the gate.
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('whitespace-only goal does NOT satisfy the gate', async () => {
    mocks.targetsMock.mockResolvedValue({
      data: {
        target_roles: [],
        target_industries: [],
        professional_goal: '   ',
      },
      error: null,
    });

    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasProfessionalGoal).toBe(false);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('no career_targets row at all -> NOT onboarded', async () => {
    mocks.targetsMock.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasProfessionalGoal).toBe(false);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('no resume -> NOT onboarded even with a goal', async () => {
    mocks.resumesMock.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useOnboardingStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasResume).toBe(false);
    expect(result.current.hasProfessionalGoal).toBe(true);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });
});
