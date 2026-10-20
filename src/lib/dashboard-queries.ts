import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabaseClient';

/**
 * ONE definition per query a /dashboard navigation needs.
 *
 * These factories exist so the sidebar's hover prefetch and the Dashboard's own render
 * cannot drift: same key, same select list, same filters, same limits. Two hand-written
 * copies would eventually differ by a column or an ordering and quietly turn the
 * prefetch into a second, wasted request instead of a warm cache hit.
 *
 * This is a MOVE of the query definitions that used to live inline in Dashboard.tsx —
 * nothing about what is fetched has changed.
 */

export const PAGE_SIZE = 20;

export type DashboardResume = {
  id: string;
  file_name: string;
  created_at: string;
  analyzed_at?: string | null;
  overall_score?: number | null;
  grading_data?: Record<string, unknown> | null;
};

export type DashboardJob = {
  id: string;
  role_applied: string;
  company_applied: string;
  created_at: string;
  location?: string | null;
  posted?: string | null;
  salary?: string | null;
  url?: string | null;
  industry?: string | null;
  analysis_id?: string | null;
};

export type LinkedinGrade = {
  id: string;
  overall_score: number;
  grading_data?: Record<string, unknown> | null;
  created_at?: string | null;
  profile_url?: string | null;
};

export type AnalysisHistoryItem = {
  id: string;
  analysis_type: string;
  created_at: string;
  primary_score?: number | null;
  source_reference?: string | null;
  raw_response?: unknown;
};

// One Recruiting Lens analysis row, trimmed to what the saved-job cards need:
// the real score (primary_score) and the id used to deep-link into the result.
// company/role come from raw_response.metadata (the only place they're stored).
export type RecruitingLensScoreRow = {
  id: string;
  primary_score: number | null;
  created_at: string | null;
  rl_company: string | null;
  rl_role: string | null;
};

/** The two facts that decide whether onboarding is complete, plus the goal-check error. */
export type OnboardingGateVerdict = {
  hasResume: boolean;
  hasGoal: boolean;
  /** Present only when the goal lookup itself failed — the fail-OPEN signal. */
  goalError: unknown;
};

/**
 * The ProtectedRoute onboarding gate.
 *
 * The two verdicts are NOT cached symmetrically. A stale PASS is benign: the user is
 * already onboarded and every read is still RLS-scoped on the server. A stale FAIL is
 * harmful — it bounces a just-onboarded user back to /onboarding. So a passing verdict
 * is served from cache for 5 minutes and a redirecting one is always refetched.
 */
export const onboardingGateQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: ['onboardingGate', userId] as const,
    queryFn: async (): Promise<OnboardingGateVerdict> => {
      // Onboarding is complete only when the user has BOTH a resume AND a professional
      // goal (quick 260712-msh). Both lookups run in PARALLEL so the goal gate adds no
      // serial round-trip to a protected navigation.
      const [resumeResult, targetsResult] = await Promise.all([
        supabase
          .from('resumes')
          .select('id')
          .eq('user_id', userId!)
          .limit(1),
        supabase
          .from('career_targets')
          .select('professional_goal')
          .eq('user_id', userId!)
          .maybeSingle(),
      ]);

      const { data: resumes, error } = resumeResult;
      const { data: targets, error: goalError } = targetsResult;

      if (error) {
        // Never allow onboarding check errors to trap users in a loading loop
        console.error('ProtectedRoute onboarding check error:', error);
      }
      if (goalError) {
        // FAIL OPEN, exactly as above: a goal-check ERROR must never trap the user.
        // Only a definitive "no goal" redirects.
        console.error('ProtectedRoute goal check error:', goalError);
      }

      return {
        hasResume: !!(resumes && resumes.length > 0),
        hasGoal: !!targets?.professional_goal?.trim(),
        goalError: goalError ?? null,
      };
    },
    staleTime: (query) =>
      query.state.data?.hasResume && query.state.data?.hasGoal ? 5 * 60_000 : 0,
  });

export const dashboardResumesQueryOptions = (userId: string | null) =>
  infiniteQueryOptions({
    queryKey: ['resumes', userId] as const,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('resumes')
        .select('id, file_name, created_at, analyzed_at, overall_score, grading_data')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) query = query.lt('created_at', pageParam);
      const { data } = await query;
      return (data || []) as DashboardResume[];
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: DashboardResume[]) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].created_at : undefined,
  });

export const dashboardSavedJobsQueryOptions = (userId: string | null) =>
  infiniteQueryOptions({
    queryKey: ['savedJobs', userId] as const,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('applications')
        .select('id, role_applied, company_applied, created_at, location, posted, salary, url, industry, analysis_id')
        .eq('user_id', userId!)
        .eq('status', 'saved')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) query = query.lt('created_at', pageParam);
      const { data } = await query;
      return (data || []) as DashboardJob[];
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: DashboardJob[]) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].created_at : undefined,
  });

// `tier` is part of the key on both of the reads below because it changes the row
// LIMIT. Without it, the query issued before the tier resolved kept its free-tier
// limit forever and an Elite user silently lost rows.
export const dashboardLinkedInGradesQueryOptions = (userId: string | null, tier: string) =>
  queryOptions({
    queryKey: ['dashboardLinkedInGrades', userId, tier] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from('linkedin_grades')
        .select('id, overall_score, grading_data, created_at, profile_url')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(tier === 'elite' ? 5 : 1);
      return (data || []) as LinkedinGrade[];
    },
  });

export const dashboardAnalysisHistoryQueryOptions = (userId: string | null, tier: string) =>
  queryOptions({
    queryKey: ['dashboardAnalysisHistory', userId, tier] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, analysis_type, created_at, primary_score, source_reference, raw_response')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(tier === 'elite' ? 10 : 4);
      return (data || []) as AnalysisHistoryItem[];
    },
  });

/**
 * Real Recruiting Lens scores for the "Application Intelligence" saved-job cards.
 * Selects only the score + deep-link id + the (company, role) needed to match a saved
 * job — not the heavy raw_response payload. Ordered newest-first so the first row per
 * (company, role) is the latest analysis for that job.
 */
export const dashboardRecruitingLensScoresQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: ['dashboardRecruitingLensScores', userId] as const,
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, primary_score, created_at, rl_company:raw_response->metadata->>company, rl_role:raw_response->metadata->>roleTitle')
        .eq('user_id', userId!)
        .eq('analysis_type', 'recruiting_lens')
        .order('created_at', { ascending: false })
        .limit(100);
      return (data || []) as RecruitingLensScoreRow[];
    },
  });
