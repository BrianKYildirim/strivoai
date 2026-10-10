import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

const queryFns = vi.hoisted(() => ({
  gate: vi.fn(async () => ({ hasResume: true, hasGoal: true, goalError: null })),
  resumes: vi.fn(async () => []),
  jobs: vi.fn(async () => []),
  recruiting: vi.fn(async () => []),
  linkedIn: vi.fn(async () => []),
  history: vi.fn(async () => []),
  goal: vi.fn(async () => ({ professionalGoal: 'Goal A' })),
}));

vi.mock('@/hooks/useAuthUserId', () => ({
  useAuthUserId: () => ({ userId: 'user-a', isLoading: false }),
}));

vi.mock('@/hooks/useProfessionalGoal', () => ({
  professionalGoalQueryOptions: (userId: string) => ({
    queryKey: ['professionalGoal', userId],
    queryFn: queryFns.goal,
  }),
}));

vi.mock('@/lib/dashboard-queries', () => ({
  onboardingGateQueryOptions: (userId: string) => ({
    queryKey: ['onboardingGate', userId],
    queryFn: queryFns.gate,
  }),
  dashboardResumesQueryOptions: (userId: string) => ({
    queryKey: ['resumes', userId],
    queryFn: queryFns.resumes,
    initialPageParam: null,
    getNextPageParam: () => undefined,
  }),
  dashboardSavedJobsQueryOptions: (userId: string) => ({
    queryKey: ['savedJobs', userId],
    queryFn: queryFns.jobs,
    initialPageParam: null,
    getNextPageParam: () => undefined,
  }),
  dashboardRecruitingLensScoresQueryOptions: (userId: string) => ({
    queryKey: ['dashboardRecruitingLensScores', userId],
    queryFn: queryFns.recruiting,
  }),
  dashboardLinkedInGradesQueryOptions: (userId: string, tier: string) => ({
    queryKey: ['dashboardLinkedInGrades', userId, tier],
    queryFn: queryFns.linkedIn,
  }),
  dashboardAnalysisHistoryQueryOptions: (userId: string, tier: string) => ({
    queryKey: ['dashboardAnalysisHistory', userId, tier],
    queryFn: queryFns.history,
  }),
}));

import { AppSidebar } from '../AppSidebar';

describe('AppSidebar dashboard intent prefetch', () => {
  it('warms professionalGoal and React Query deduplicates hover plus focus', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/upload']}>
          <TooltipProvider delayDuration={0}>
            <AppSidebar />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    act(() => {
      fireEvent.mouseEnter(homeLink);
      fireEvent.focus(homeLink);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['professionalGoal', 'user-a'])).toEqual({
        professionalGoal: 'Goal A',
      });
    });
    expect(queryFns.goal).toHaveBeenCalledOnce();
  });
});
