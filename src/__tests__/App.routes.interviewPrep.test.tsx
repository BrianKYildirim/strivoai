/**
 * Phase 47 — Plan 47-02 route-level test.
 *
 * Asserts that the /interview-prep route branches on `isInterviewPrepEnabled()`:
 *   - flag unset / 'false' → renders <ComingSoon />
 *   - flag 'true'         → renders the real <InterviewPrep /> page
 *
 * The test mirrors the exact conditional shape in src/App.tsx rather than
 * importing App itself, because App's provider tree (QueryClient, Helmet,
 * BrowserRouter, Supabase-backed ProtectedRoute, …) would dwarf the unit
 * under test. If the branching expression in App.tsx drifts away from
 * `isInterviewPrepEnabled() ? <InterviewPrep /> : <ComingSoon />`, keep
 * this fixture identical — that is the contract this test locks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Stub the protected route + layout to pass-through so we don't need auth/Supabase.
vi.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// Stub the real Interview Prep page so we don't drag in its dependency tree.
vi.mock('@/pages/InterviewPrep', () => ({
  default: () => <div data-testid="real-ip-page">REAL</div>,
}));

import { isInterviewPrepEnabled } from '@/config/feature-flags';
import ComingSoon from '@/pages/ComingSoon';
import InterviewPrep from '@/pages/InterviewPrep';

function RouteFixture() {
  return (
    <MemoryRouter initialEntries={['/interview-prep']}>
      <Routes>
        <Route
          path="/interview-prep"
          element={isInterviewPrepEnabled() ? <InterviewPrep /> : <ComingSoon />}
        />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => vi.unstubAllEnvs());

describe('/interview-prep route gate', () => {
  it('renders <ComingSoon /> when VITE_FEATURE_INTERVIEW_PREP is unset', () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', undefined as unknown as string);
    render(<RouteFixture />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/coming soon/i);
    expect(screen.queryByTestId('real-ip-page')).toBeNull();
  });

  it("renders <ComingSoon /> when VITE_FEATURE_INTERVIEW_PREP === 'false'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    render(<RouteFixture />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/coming soon/i);
    expect(screen.queryByTestId('real-ip-page')).toBeNull();
  });

  it("renders the real Interview Prep page when VITE_FEATURE_INTERVIEW_PREP === 'true'", () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    render(<RouteFixture />);
    expect(screen.getByTestId('real-ip-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /coming soon/i })).toBeNull();
  });
});
