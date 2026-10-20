/**
 * Phase 47 Plan 05 — D-05: AnalysisHistory must hide rows whose
 * `action_type === 'interview_prep'` when `isInterviewPrepEnabled()` is false.
 *
 * DB rows are NEVER deleted or mutated — filtering is read-side only.
 * When the flag is on, every row (including interview_prep) renders as today.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnalysisHistory from '@/pages/AnalysisHistory';

// ── Supabase mock ──────────────────────────────────────────────────────────
// A chainable builder whose terminal data depends on the table name.

const usageRowsFixture = [
  {
    id: 'u1',
    user_id: 'me',
    action_type: 'resume_analysis',
    credits_consumed: 3,
    billing_period_start: '2026-05-01',
    created_at: '2026-05-11T10:00:00Z',
  },
  {
    id: 'u2',
    user_id: 'me',
    action_type: 'interview_prep',
    credits_consumed: 8,
    billing_period_start: '2026-05-01',
    created_at: '2026-05-11T11:00:00Z',
  },
  {
    id: 'u3',
    user_id: 'me',
    action_type: 'career_compass',
    credits_consumed: 3,
    billing_period_start: '2026-05-01',
    created_at: '2026-05-11T12:00:00Z',
  },
];

const tableFixtures: Record<string, unknown[]> = {
  usage_tracking: usageRowsFixture,
  resumes: [],
  linkedin_grades: [],
  analysis_results: [],
  interview_quizzes: [],
};

function buildQueryChain(table: string) {
  const data = tableFixtures[table] ?? [];
  // Each terminal awaited node resolves to { data, error: null }.
  // The chain supports .select().eq()*.order().limit() and also being awaited
  // directly after .order() (some queries don't call .limit()).
  const terminal = { data, error: null };
  const thenable: PromiseLike<typeof terminal> = {
    then: (onFulfilled, onRejected) =>
      Promise.resolve(terminal).then(onFulfilled, onRejected),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(terminal),
    then: thenable.then.bind(thenable),
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'me', email: 'a@b' } } }),
      // useAuthUserId resolves the id from the LOCAL session (no /auth/v1/user hop),
      // so the mock surface needs getSession alongside getUser.
      getSession: () =>
        Promise.resolve({
          data: { session: { user: { id: 'me', email: 'a@b' } } },
          error: null,
        }),
    },
    from: (table: string) => buildQueryChain(table),
  },
}));

// Avoid the unauth redirect path in case userId resolves to null in any race.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => () => {},
  };
});

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AnalysisHistory />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AnalysisHistory — Interview Prep gating (D-05)', () => {
  it('filters out interview_prep rows when the flag is OFF', async () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'false');
    renderHistory();

    await waitFor(() =>
      expect(screen.getByText(/resume analysis/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/career compass/i)).toBeInTheDocument();
    expect(screen.queryByText(/interview prep/i)).toBeNull();
  });

  it('renders interview_prep rows when the flag is ON', async () => {
    vi.stubEnv('VITE_FEATURE_INTERVIEW_PREP', 'true');
    renderHistory();

    await waitFor(() =>
      expect(screen.getByText(/resume analysis/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/career compass/i)).toBeInTheDocument();
    expect(screen.getByText(/interview prep/i)).toBeInTheDocument();
  });
});
