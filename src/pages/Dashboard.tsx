import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  ChevronRight,
  Compass,
  Crown,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  Linkedin,
  Lock,
  Pencil,
  Radar,
  Shield,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabaseClient';
import {
  dashboardAnalysisHistoryQueryOptions,
  dashboardLinkedInGradesQueryOptions,
  dashboardRecruitingLensScoresQueryOptions,
  dashboardResumesQueryOptions,
  dashboardSavedJobsQueryOptions,
  type DashboardJob,
  type DashboardResume,
} from '@/lib/dashboard-queries';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RunningLowCard } from '@/components/topup/RunningLowCard';
import { useAuthUserId } from '@/hooks/useAuthUserId';
import { useMerits } from '@/hooks/useMerits';
import { useTierAccess } from '@/hooks/useTierAccess';
import { useProfessionalGoal } from '@/hooks/useProfessionalGoal';
import { useSubscriptionState } from '@/hooks/useSubscriptionState';
import CohortBackfillBanner from '@/components/dashboard/CohortBackfillBanner';
import { SubscriptionEndingAlert } from '@/components/dashboard/SubscriptionEndingAlert';
import { GoalEditDialog } from '@/components/dashboard/GoalEditDialog';
import OutcomeOverdueBanner from '@/components/applications/OutcomeOverdueBanner';
import { dashboardShellClass, EmptyState, MiniMeter, SectionHeader } from '@/components/dashboard/DashboardSectionPrimitives';
import { ProfileAlignment } from '@/components/dashboard/ProfileAlignment';
import { RecruiterFirstImpression } from '@/components/dashboard/RecruiterFirstImpression';
import { deriveProfileAlignment, deriveRecruiterFirstImpression, goalChipLabel, normalizeDashboardIntelligenceInputs, parseGoalReadiness } from '@/lib/dashboard-intelligence';
import type { GoalReadinessModel } from '@/lib/dashboard-intelligence';

const TIER_LABELS: Record<string, string> = { free: 'Free', elite: 'Elite' };

/**
 * Hero meter slot labels used ONLY when there is no persisted breakdown to read yet
 * (no goal, or the scorer has not seen any evidence). They keep the hero at exactly three
 * meter slots so its height never shifts. They are labels, not scores — every slot they
 * fill renders as un-evidenced "Needs data", never as a 0% bar.
 */
const PLACEHOLDER_METER_LABELS = ['Resume Quality', 'Goal Alignment', 'ATS Keyword Coverage'];

type JobScore = { analysisId: string; score: number };

type CommandCard = {
  label: string;
  value: string;
  trend: string;
  insight: string;
  href?: string;
  cta?: string;
  icon: typeof Gauge;
  tone: string;
};

type NextAction = {
  title: string;
  body: string;
  href: string;
  cta: string;
  icon: typeof Target;
  locked?: boolean;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

// NOTE: `asArray`, `pickStrings` and `getScoreTone` were used ONLY by the removed
// resume-vault section and are gone with it. `getScoreStatus` and `formatDate` remain —
// SavedJobsDashboard still uses them. Nothing else was touched: the resumes query, the
// delete handler, /results/:id, /improvements/:id and /history all still work.
const formatDate = (date: string | null | undefined): string => {
  if (!date) return 'Not recorded';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const getScoreStatus = (score: number | null | undefined): string => {
  const normalized = score ?? 0;
  if (normalized >= 85) return 'Best Version';
  if (normalized >= 75) return 'Strong Candidate';
  if (normalized >= 60) return 'Competitive Draft';
  if (normalized > 0) return 'Needs Work';
  return 'Not Analyzed';
};

// Application Intelligence match score = the real Recruiting Lens primary_score.
// Saved-job rows (applications) share no FK with analysis_results, so we match on
// the normalized (company, role) pair that both sides carry. The prior
// getJobMatchScore() fabricated a deterministic number (always ~82 for a given
// resume) instead of reading the analysis — that was the bug.
const jobScoreKey = (company: string | null | undefined, role: string | null | undefined): string =>
  `${(company ?? '').trim().toLowerCase()}||${(role ?? '').trim().toLowerCase()}`;

const getResumeGapLevel = (score: number): string => {
  if (score >= 82) return 'Low';
  if (score >= 68) return 'Medium';
  return 'High';
};


const DashboardPage = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const merits = useMerits();
  const { tier } = useTierAccess();
  const subscriptionState = useSubscriptionState();
  const { isZero, reconcileTierUpgrade } = merits;

  // The professional goal + the PERSISTED Goal Readiness the SQL trigger already
  // computed. This is a plain column read — there is no scoring call of any kind here.
  const {
    professionalGoal,
    structured,
    hasGoal,
    goalReadinessScore,
    goalReadinessComponents,
    isLoading: isLoadingGoal,
  } = useProfessionalGoal();

  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  // PRICE-03 (D-02/D-03): post-checkout return reconciliation. When Stripe
  // redirects back to /dashboard?checkout=complete, the customer.subscription
  // .updated webhook may not have written the new tier + reset merits yet.
  const reconcileFiredRef = useRef(false);
  useEffect(() => {
    if (searchParams.get('checkout') !== 'complete') return;
    if (reconcileFiredRef.current) return;
    reconcileFiredRef.current = true;

    const snapshotTier = tier;
    toast('Upgrade processing...', {
      description: "We're confirming your new plan. This usually takes a few seconds.",
    });

    void reconcileTierUpgrade().then(() => {
      const entries = queryClient.getQueriesData<{ tier?: string }>({ queryKey: ['merit-balance'] });
      const newTier = entries.find(([, v]) => v?.tier)?.[1]?.tier;
      if (newTier && newTier !== snapshotTier) {
        const label = TIER_LABELS[newTier] ?? newTier;
        toast.success(`You're now on ${label}.`, {
          description: 'Your monthly merits have been refreshed.',
        });
      }
    });

    searchParams.delete('checkout');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { userId, isLoading: isLoadingUser } = useAuthUserId();

  const { data: isAdmin = false } = useQuery({
    queryKey: ['isAdmin', userId],
    queryFn: async () => {
      const { data: hasRole } = await supabase.rpc('has_role', {
        _user_id: userId!,
        _role: 'admin',
      });
      return !!hasRole;
    },
    enabled: !!userId,
  });

  const {
    data: resumesData,
    fetchNextPage: loadMoreResumes,
    hasNextPage: hasMoreResumes,
    isFetchingNextPage: loadingMoreResumes,
    isLoading: isLoadingResumes,
  } = useInfiniteQuery({
    ...dashboardResumesQueryOptions(userId),
    enabled: !!userId,
  });

  const {
    data: savedJobsData,
    fetchNextPage: loadMoreJobs,
    hasNextPage: hasMoreJobs,
    isFetchingNextPage: loadingMoreJobs,
    isLoading: isLoadingSavedJobs,
  } = useInfiniteQuery({
    ...dashboardSavedJobsQueryOptions(userId),
    enabled: !!userId,
  });

  const { data: linkedinGrades = [], isLoading: isLoadingLinkedInGrades } = useQuery({
    ...dashboardLinkedInGradesQueryOptions(userId, tier),
    enabled: !!userId,
  });

  const { data: analysisHistory = [], isLoading: isLoadingAnalysisHistory } = useQuery({
    ...dashboardAnalysisHistoryQueryOptions(userId, tier),
    enabled: !!userId,
  });

  const { data: recruitingLensRows = [] } = useQuery({
    ...dashboardRecruitingLensScoresQueryOptions(userId),
    enabled: !!userId,
  });

  // Two lookups from the same rows: exact (applications.analysis_id -> score) is the
  // durable path; the (company, role) key is the fallback for rows not yet linked
  // (legacy applications, or archived analyses the backfill couldn't match).
  const { jobScoreById, jobScoreByKey } = useMemo(() => {
    const byId = new Map<string, JobScore>();
    const byKey = new Map<string, JobScore>();
    for (const row of recruitingLensRows) {
      const scored: JobScore = { analysisId: row.id, score: row.primary_score ?? 0 };
      byId.set(row.id, scored);
      if (!row.rl_company || !row.rl_role) continue;
      const key = jobScoreKey(row.rl_company, row.rl_role);
      // Rows are newest-first — keep the first (latest) analysis per job.
      if (!byKey.has(key)) byKey.set(key, scored);
    }
    return { jobScoreById: byId, jobScoreByKey: byKey };
  }, [recruitingLensRows]);

  const resumes: DashboardResume[] = useMemo(() => resumesData?.pages.flat() ?? [], [resumesData]);
  const savedJobs: DashboardJob[] = useMemo(() => savedJobsData?.pages.flat() ?? [], [savedJobsData]);
  const latestResume = resumes[0];
  const latestLinkedIn = linkedinGrades[0];
  const latestResumeScore = latestResume?.overall_score ?? 0;
  const latestLinkedInScore = latestLinkedIn?.overall_score ?? 0;
  const meritsTotal = Number.isFinite(merits.total) ? merits.total : 0;
  const meritsCap = Number.isFinite(merits.cap) && merits.cap > 0 ? merits.cap : 0;

  const dashboardIntelligenceInputs = useMemo(() => normalizeDashboardIntelligenceInputs({
    resume: latestResume,
    linkedinGrade: latestLinkedIn,
    savedJobs,
    analysisHistory,
  }), [analysisHistory, latestLinkedIn, latestResume, savedJobs]);

  const recruiterFirstImpressionModel = useMemo(
    () => deriveRecruiterFirstImpression(dashboardIntelligenceInputs, tier),
    [dashboardIntelligenceInputs, tier],
  );

  const profileAlignmentModel = useMemo(
    () => deriveProfileAlignment(dashboardIntelligenceInputs, tier),
    [dashboardIntelligenceInputs, tier],
  );

  const stats = useMemo(() => {
    const total = resumes.length;
    const avgScore = total > 0
      ? Math.round(resumes.reduce((sum, r) => sum + (r.overall_score || 0), 0) / total)
      : 0;
    const recent = resumes.filter(r => new Date(r.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
    return { total, avgScore, recent };
  }, [resumes]);

  const jobReadiness = savedJobs.length > 0
    ? clampScore(52 + latestResumeScore * 0.32 + Math.min(savedJobs.length, 5) * 7)
    : clampScore(latestResumeScore ? latestResumeScore - 12 : 0);

  // ── GOAL READINESS ────────────────────────────────────────────────────────────
  // The ENTIRE compute path on load: one column read + a parse. The score was already
  // computed and PERSISTED server-side by the deterministic zero-AI SQL scorer
  // (compute_goal_readiness, migration 20260712000002) at the moment the evidence was
  // written. No scoring round-trip, no edge-function call, no AI, no cost.
  //
  // The decorative composite-readiness formula that used to live here (a weighted blend of
  // resume score, LinkedIn score, job readiness and recency) is DELETED. It was never a
  // real measurement. This value is the ONE source of truth for overall readiness: the
  // hero big number, the hero meters, the Goal Readiness command card, and the Readiness
  // Matrix headline all render THIS, and only this.
  const goalReadiness = useMemo(
    () => parseGoalReadiness(goalReadinessScore, goalReadinessComponents, hasGoal),
    [goalReadinessScore, goalReadinessComponents, hasGoal],
  );

  const goalComponentsById = useMemo(() => {
    const map = new Map(goalReadiness.components.map((component) => [component.id, component]));
    return map;
  }, [goalReadiness]);

  /**
   * The user's goal, shown in the hero: the SQL parser's normalized summary when present,
   * else the parsed role/location/year join (what rows predating migration 20260804010000
   * still produce), else the RAW goal verbatim.
   */
  const goalDisplay = useMemo(
    () => goalChipLabel(structured, professionalGoal),
    [structured, professionalGoal],
  );

  const commandCards: CommandCard[] = [
    {
      label: 'Goal Readiness',
      value: goalReadiness.score != null ? String(goalReadiness.score) : '--',
      trend:
        goalReadiness.status === 'no_goal'
          ? 'No goal set'
          : goalReadiness.status === 'no_evidence'
            ? 'Awaiting evidence'
            : goalReadiness.partialEvidence
              ? `Based on ${goalReadiness.evidencedWeight}% of the rubric`
              : 'Full evidence',
      // How strongly the profile SUPPORTS the goal. Never offer/hire probability — the
      // SQL scorer writes this text and is honest when there is no goal or no evidence.
      insight: goalReadiness.interpretation,
      href: goalReadiness.status === 'no_goal' ? '/onboarding' : '/career-compass',
      cta: goalReadiness.status === 'no_goal' ? 'Set goal' : 'Open Compass',
      icon: Gauge,
      tone: 'from-primary/20 via-primary/5 to-transparent',
    },
    {
      label: 'Resume Strength',
      value: latestResume ? `${latestResumeScore}%` : '--',
      trend: stats.recent > 0 ? `${stats.recent} update${stats.recent === 1 ? '' : 's'} this week` : 'No recent scans',
      insight: latestResume ? getScoreStatus(latestResumeScore) : 'Your resume vault is empty.',
      href: latestResume ? `/results/${latestResume.id}` : '/upload',
      cta: latestResume ? 'View analysis' : 'Analyze resume',
      icon: FileText,
      tone: 'from-emerald-500/15 via-primary/5 to-transparent',
    },
    {
      label: 'LinkedIn Strength',
      value: latestLinkedIn ? `${latestLinkedInScore}%` : '--',
      trend: latestLinkedIn ? 'Profile signal active' : 'Missing signal',
      insight: latestLinkedIn
        ? 'LinkedIn data is contributing to your live profile.'
        : 'Add a LinkedIn grade to sharpen recruiter-facing insights.',
      href: '/linkedin-grader',
      cta: latestLinkedIn ? 'Review grade' : 'Grade LinkedIn',
      icon: Linkedin,
      tone: 'from-sky-500/15 via-primary/5 to-transparent',
    },
    {
      label: 'Job Match Readiness',
      value: savedJobs.length > 0 ? `${jobReadiness}%` : '--',
      trend: savedJobs.length > 0 ? `${savedJobs.length} saved role${savedJobs.length === 1 ? '' : 's'}` : 'No saved jobs',
      insight: savedJobs.length > 0
        ? 'Saved roles are ready for Recruiting Lens comparison.'
        : 'Save jobs to see fit, missing keywords, and resume gaps.',
      href: '/recruiting-lens',
      cta: 'Run lens',
      icon: Target,
      tone: 'from-amber-500/15 via-primary/5 to-transparent',
    },
    {
      label: 'Merit Balance',
      value: merits.isLoading ? '--' : `${meritsTotal}`,
      trend: meritsCap > 0 ? `${meritsTotal}/${meritsCap} this cycle` : 'Balance syncing',
      insight: isZero ? 'Out of merits. Top up to keep improving.' : 'Ready for your next AI action.',
      href: '/profile',
      cta: isZero ? 'Upgrade' : 'Manage',
      icon: Zap,
      tone: 'from-violet-500/15 via-primary/5 to-transparent',
    },
  ];

  const nextActions: NextAction[] = useMemo(() => {
    const actions: NextAction[] = [];
    if (!latestResume) {
      actions.push({
        title: 'Upload your first resume',
        body: 'Create the baseline that powers readiness, radar, resume vault, and role fit.',
        href: '/onboarding',
        cta: 'Upload resume',
        icon: Upload,
      });
    } else if (latestResumeScore < 78) {
      actions.push({
        title: 'Improve quantified resume impact',
        body: 'Your next score jump likely comes from measurable outcomes, stronger scope, and tighter bullets.',
        href: `/improvements/${latestResume.id}`,
        cta: 'View improvements',
        icon: TrendingUp,
      });
    }
    if (!latestLinkedIn) {
      actions.push({
        title: 'Upgrade your LinkedIn headline',
        body: 'Add LinkedIn signal so Strivo can compare your resume story with your recruiter-facing profile.',
        href: '/linkedin-grader',
        cta: 'Grade LinkedIn',
        icon: Linkedin,
      });
    }
    if (savedJobs.length > 0) {
      actions.push({
        title: 'Run Recruiting Lens on saved jobs',
        body: 'Convert saved roles into missing keywords, gap levels, and targeted resume edits.',
        href: '/recruiting-lens',
        cta: 'Run lens',
        icon: Eye,
      });
    } else {
      actions.push({
        title: 'Save target roles for matching',
        body: 'Add a role to unlock job fit, keyword gaps, and application readiness tracking.',
        href: '/jobs',
        cta: 'Explore jobs',
        icon: Briefcase,
      });
    }
    actions.push({
      title: tier === 'elite' ? 'Review advanced score history' : 'Unlock richer intelligence',
      body: tier === 'elite'
        ? 'Use your history to compare versions and choose the strongest resume for each role.'
        : 'Elite adds deeper history, stronger intelligence, and advanced strategy widgets.',
      href: tier === 'elite' ? '/history' : '/profile',
      cta: tier === 'elite' ? 'Open history' : 'See Elite',
      icon: Crown,
    });
    if (actions.length < 3) {
      actions.push({
        title: 'Refresh your Career Compass',
        body: 'Turn your latest resume, LinkedIn, and job signals into a sharper role map.',
        href: '/career-compass',
        cta: 'Open Compass',
        icon: Compass,
      });
    }
    return actions.slice(0, 3);
  }, [latestLinkedIn, latestResume, latestResumeScore, savedJobs.length, tier]);

  // The Readiness Matrix rows. Same 7 rows, same order, same styling — but the numbers
  // are now REAL, sourced from the persisted rubric components instead of the decorative
  // offset fabrications that used to live here (resume score minus 4, resume score plus 3,
  // LinkedIn score minus 8). An un-evidenced component takes the existing `locked` path
  // ("Needs data" + muted meter) — it is MISSING DATA, never a 0% bar.
  const radarRow = (id: string, label: string) => {
    const component = goalComponentsById.get(id);
    const evidenced = !!component?.evidenced;
    return { label, value: evidenced ? component!.score : 0, locked: !evidenced };
  };

  const radarItems = [
    radarRow('resume_quality', 'Resume Quality'),
    radarRow('linkedin_strength', 'LinkedIn Quality'),
    radarRow('goal_keyword_coverage', 'ATS Keywords'),
    radarRow('evidence_depth', 'Experience Strength'),
    // Job Fit + Interview Readiness are UNCHANGED (CONTEXT §8b — jobReadiness stays; it
    // feeds only the Job Match card / this row / per-job match, none of which display
    // OVERALL readiness. It remains a known-fake score; see SUMMARY follow-up).
    { label: 'Job Fit', value: jobReadiness, locked: savedJobs.length === 0 },
    { label: 'Interview Readiness', value: 0, locked: true },
    // §8g RATIFIED relabel: 'Networking Strength' -> 'Profile Consistency'. The old row
    // was fabricated from the LinkedIn score minus 8, with no evidence source; the real
    // rubric measures resume<->LinkedIn consistency, so the new label describes what the
    // number actually measures. Keeping the old label on the new number would be a fresh lie.
    radarRow('profile_consistency', 'Profile Consistency'),
  ];

  // The three highest-weighted rubric components feed the hero meters. Exactly three
  // slots always, so the hero's height and layout never change.
  const heroMeters = useMemo(() => {
    const top = [...goalReadiness.components]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    const slots: Array<{ label: string; value: number; evidenced: boolean }> = [];
    for (let i = 0; i < 3; i++) {
      const component = top[i];
      slots.push(
        component
          ? { label: component.label, value: component.score, evidenced: component.evidenced }
          : { label: PLACEHOLDER_METER_LABELS[i], value: 0, evidenced: false },
      );
    }
    return slots;
  }, [goalReadiness]);


  const loading = isLoadingUser || (!!userId && (isLoadingResumes || isLoadingSavedJobs));

  // The single cold-load gate. It is built from `isLoading` ONLY — React Query sets
  // `isLoading = isPending && isFetching`, i.e. true only when there is NO cached data.
  // That is what makes this expression structurally incapable of firing on a warm
  // navigation: with entries in the cache it is false on the very first render, so the
  // page paints real numbers immediately and refreshes silently underneath.
  // `isFetching` / `isPending` would gate warm loads too and defeat the whole fix.
  const isColdLoad =
    isLoadingUser ||
    (!!userId &&
      (isLoadingResumes ||
        isLoadingSavedJobs ||
        isLoadingLinkedInGrades ||
        isLoadingAnalysisHistory ||
        isLoadingGoal ||
        merits.isLoading));

  const handleDeleteResume = async (id: string, fileName: string) => {
    try {
      const filePath = fileName.split('/').slice(1).join('/');
      await supabase.storage.from('resumes').remove([`${userId!}/${filePath}`]);
      await supabase.from('resumes').delete().eq('id', id);
      toast.success('Resume deleted');
      queryClient.invalidateQueries({ queryKey: ['resumes', userId] });
      // Deleting the last resume is the one in-scope action that can falsify a cached
      // PASSING onboarding verdict. Belt-and-braces: the gate never serves a cached
      // FAIL, so correctness does not depend on this line.
      queryClient.invalidateQueries({ queryKey: ['onboardingGate'] });
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete resume');
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await supabase.from('applications').delete().eq('id', id);
      toast.success('Job removed');
      queryClient.invalidateQueries({ queryKey: ['savedJobs', userId] });
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to remove job');
    }
  };

  const handleMarkApplied = async (id: string) => {
    try {
      await supabase.from('applications').update({ status: 'applied' }).eq('id', id);
      toast.success('Job marked as applied');
      queryClient.invalidateQueries({ queryKey: ['savedJobs', userId] });
    } catch (error) {
      console.error('Mark applied error:', error);
      toast.error('Failed to update job');
    }
  };

  // ONE coherent loading state for a genuine cold load. The shell and both decorative
  // layers stay mounted (same element types in the same positions), so there is no
  // flash and no layout jump when the real content takes their place. Deliberately a
  // spinner and not a skeleton of the dashboard: a skeleton would be a design change,
  // and zeros/placeholders in the number slots would be fabricated data.
  if (isColdLoad) {
    return (
      <div className="relative min-h-viewport overflow-hidden bg-background">
        <DashboardBackdrop />
        <div
          className="relative flex min-h-viewport items-center justify-center"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span className="sr-only">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-viewport overflow-hidden bg-background">
      <DashboardBackdrop />

      <div className="relative container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <SubscriptionEndingAlert
          userId={subscriptionState.userId}
          isPendingDowngrade={subscriptionState.isPendingDowngrade}
          periodEnd={subscriptionState.currentPeriodEnd}
          reconcilePendingDowngrade={subscriptionState.reconcilePendingDowngrade}
        />
        <RunningLowCard />
        <OutcomeOverdueBanner />
        <CohortBackfillBanner />

        <CareerHero
          tier={tier}
          meritsTotal={meritsTotal}
          meritsCap={meritsCap}
          loading={loading || merits.isLoading}
          goalReadiness={goalReadiness}
          goalDisplay={goalDisplay}
          heroMeters={heroMeters}
          onEditGoal={() => setGoalDialogOpen(true)}
          latestResume={latestResume}
          isAdmin={isAdmin}
        />

        <GoalEditDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} />

        {tier === 'elite' && (
          <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 p-4 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Crown className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">Elite intelligence active</p>
                <p className="text-sm text-muted-foreground">
                  Deeper history, stronger career profiling, and advanced readiness widgets are enabled.
                </p>
              </div>
            </div>
          </div>
        )}

        {isZero && (
          <div className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">Limit Reached</p>
                  <p className="text-sm text-muted-foreground">Upgrade or top up merits to continue using AI features.</p>
                </div>
              </div>
              <Button size="sm" variant="destructive" asChild>
                <Link to="/profile">Upgrade</Link>
              </Button>
            </div>
          </div>
        )}

        <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {commandCards.map((card) => (
            <CommandCenterCard key={card.label} card={card} />
          ))}
        </section>

        <div className="mb-10 grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <NextBestActions actions={nextActions} />
          <CareerRadar items={radarItems} tier={tier} goalReadiness={goalReadiness} />
        </div>

        <div className="mb-10">
          <RecruiterFirstImpression model={recruiterFirstImpressionModel} />
        </div>

        {/* The resume-vault section and the 2-tab shell are removed — UI ONLY. No resume
            version, analysis, comparison feature, DB record, or backend logic is deleted:
            /results/:id, /improvements/:id and /history all still work, and the resumes
            query still powers the rest of this page. SavedJobsDashboard now renders
            directly, with the same props and the same mb-10 wrapper spacing. */}
        <div className="mb-10">
          <SavedJobsDashboard
            jobs={savedJobs}
            jobScoresById={jobScoreById}
            jobScoresByKey={jobScoreByKey}
            hasMore={!!hasMoreJobs}
            loadingMore={loadingMoreJobs}
            onLoadMore={() => void loadMoreJobs()}
            onDelete={handleDeleteJob}
            onMarkApplied={handleMarkApplied}
          />
        </div>

        <ProfileAlignment model={profileAlignmentModel} />
      </div>
    </div>
  );
};

/** The two decorative background layers, unchanged — extracted only so the cold-load
 *  gate and the loaded page render the exact same shell. */
function DashboardBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border) / 0.48) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.48) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_34%),linear-gradient(180deg,hsl(var(--background)/0.2),hsl(var(--background))_70%)]" />
    </>
  );
}

function CareerHero({
  tier,
  meritsTotal,
  meritsCap,
  loading,
  goalReadiness,
  goalDisplay,
  heroMeters,
  onEditGoal,
  latestResume,
  isAdmin,
}: {
  tier: string;
  meritsTotal: number;
  meritsCap: number;
  loading: boolean;
  goalReadiness: GoalReadinessModel;
  goalDisplay: string | null;
  heroMeters: Array<{ label: string; value: number; evidenced: boolean }>;
  onEditGoal: () => void;
  latestResume?: DashboardResume;
  isAdmin: boolean;
}) {
  const missingLabels = goalReadiness.unevidenced.map((component) => component.label);
  return (
    <section className={cn(dashboardShellClass, 'mb-8 p-4 sm:p-8 lg:p-10')}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),transparent_42%,hsl(var(--muted)/0.32))]" />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="relative grid min-w-0 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge className="gap-1 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary hover:bg-primary/15">
              {tier === 'elite' ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {TIER_LABELS[tier] ?? tier} plan
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              <Zap className="mr-1 h-3.5 w-3.5 text-primary" />
              {loading ? 'Syncing merits' : `${meritsTotal}${meritsCap ? ` / ${meritsCap}` : ''} merits`}
            </Badge>
            {isAdmin && (
              <Badge variant="outline" className="rounded-full px-3 py-1 text-primary">
                <Shield className="mr-1 h-3.5 w-3.5" />
                Admin
              </Badge>
            )}
          </div>
          <h1 className="mb-3 max-w-3xl text-3xl font-bold tracking-normal text-foreground sm:text-5xl lg:text-6xl">
            Your Career OS
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Track your resume, LinkedIn, job readiness, and next best moves.
          </p>
          {goalDisplay && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">
                Current Goal — <span className="font-medium text-foreground">{goalDisplay}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={onEditGoal}
                aria-label="Edit your professional goal"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="gap-2 rounded-xl" asChild>
              <Link to="/upload">
                <Upload className="h-4 w-4" />
                New Analysis
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2 rounded-xl bg-background/60" asChild>
              <Link to={latestResume ? `/results/${latestResume.id}` : '/onboarding'}>
                <FileText className="h-4 w-4" />
                {latestResume ? 'View Latest Resume' : 'Upload Resume'}
              </Link>
            </Button>
            {isAdmin && (
              <Button size="lg" variant="outline" className="gap-2 rounded-xl bg-background/60" asChild>
                <Link to="/admin/usage">
                  <Shield className="h-4 w-4" />
                  Admin Panel
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-primary/20 bg-background/55 p-4 backdrop-blur-xl sm:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Goal Readiness</p>
              {/* The persisted score. The SAME value the Readiness Matrix headline and the
                  Goal Readiness command card render. One source of truth. */}
              <p className="text-4xl font-bold text-foreground">{goalReadiness.score ?? '--'}</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Radar className="h-7 w-7" />
            </div>
          </div>
          <div className="space-y-3">
            {/* The three highest-weighted rubric components — real labels, real scores.
                The hardcoded 76 / 84 literals are gone. An un-evidenced component reads
                "Needs data" on a muted meter: MISSING DATA, never a 0% bar. */}
            {heroMeters.map((meter) => (
              <div key={meter.label}>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{meter.label}</span>
                  <span>{meter.evidenced ? `${meter.value}%` : 'Needs data'}</span>
                </div>
                <MiniMeter
                  label={meter.label}
                  value={meter.evidenced ? meter.value : 8}
                  hideLabel
                  muted={!meter.evidenced}
                />
              </div>
            ))}
          </div>
          {/* §9f — partial evidence must be surfaced, and §8f — new evidence can move the
              number in EITHER direction. That is honest, not a bug: the score reflects what
              Strivo can actually see, so revealing a weak signal can lower it. */}
          {goalReadiness.status === 'ready' && goalReadiness.partialEvidence && (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Based on {goalReadiness.evidencedWeight}% of your profile
              {missingLabels.length > 0 ? ` — ${missingLabels.join(' and ')} not yet evidenced` : ''}.
              Adding it can move this number either way; it reflects what Strivo can actually see.
            </p>
          )}
          {goalReadiness.status === 'no_evidence' && (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Analyze your resume to start measuring how strongly your profile supports this goal.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CommandCenterCard({ card }: { card: CommandCard }) {
  const Icon = card.icon;
  return (
    <Card className="group relative min-h-[220px] overflow-hidden rounded-3xl border-border/70 bg-card/75 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_50px_hsl(var(--foreground)/0.1)]">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-80', card.tone)} />
      <div className="relative flex h-full flex-col">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/70 text-primary ring-1 ring-border/70">
            <Icon className="h-5 w-5" />
          </div>
          <span className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {card.trend}
          </span>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
        <p className="mt-2 text-4xl font-bold tracking-normal text-foreground">{card.value}</p>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{card.insight}</p>
        {card.href && card.cta && (
          <Button variant="ghost" className="mt-auto w-fit gap-1 px-0 text-primary hover:bg-transparent hover:text-primary" asChild>
            <Link to={card.href}>
              {card.cta}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function NextBestActions({ actions }: { actions: NextAction[] }) {
  return (
    <section>
      <SectionHeader
        eyebrow="Action layer"
        title="Your Next 3 Moves"
        description="Prioritized from the career data Strivo has right now."
      />
      <div className="grid gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <Card key={action.title} className="group overflow-hidden rounded-3xl border-border/70 bg-card/75 p-5 backdrop-blur-xl transition-all hover:border-primary/40">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Move {index + 1}</span>
                    {action.locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{action.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{action.body}</p>
                </div>
                <Button className="shrink-0 gap-2 rounded-xl" variant={index === 0 ? 'default' : 'outline'} asChild>
                  <Link to={action.href}>
                    {action.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function CareerRadar({
  items,
  tier,
  goalReadiness,
}: {
  items: Array<{ label: string; value: number; locked: boolean }>;
  tier: string;
  goalReadiness: GoalReadinessModel;
}) {
  // The local radar-average computation is DELETED (§8a). Shipping it would have put two
  // disagreeing readiness numbers on one dashboard. The headline is now byte-identical to
  // the hero's — the same persisted value, read from the same place.
  return (
    <section>
      <SectionHeader
        eyebrow="Career radar"
        title="Readiness Matrix"
        description="A compact map of the signals that make your profile job-ready."
      />
      <div className={cn(dashboardShellClass, 'p-6')}>
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <div className="mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center rounded-full border border-primary/25 bg-[conic-gradient(from_180deg,hsl(var(--primary)/0.35),hsl(var(--muted)/0.25),hsl(var(--primary)/0.08),hsl(var(--primary)/0.35))] p-5">
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-background/80 bg-background/85 text-center backdrop-blur-xl">
              <Radar className="mb-3 h-8 w-8 text-primary" />
              <span className="text-4xl font-bold">{goalReadiness.score ?? '--'}</span>
              <span className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Goal Readiness</span>
            </div>
          </div>
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/60 bg-background/45 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {item.locked ? (item.label === 'Interview Readiness' ? 'Coming Soon' : 'Needs data') : `${item.value}%`}
                  </span>
                </div>
                <MiniMeter value={item.locked ? 8 : item.value} label={item.label} hideLabel muted={item.locked} />
              </div>
            ))}
          </div>
        </div>
        {tier !== 'elite' && (
          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            Elite unlocks deeper radar history and advanced readiness interpretation.
          </div>
        )}
      </div>
    </section>
  );
}

function SavedJobsDashboard({
  jobs,
  jobScoresById,
  jobScoresByKey,
  hasMore,
  loadingMore,
  onLoadMore,
  onDelete,
  onMarkApplied,
}: {
  jobs: DashboardJob[];
  jobScoresById: Map<string, JobScore>;
  jobScoresByKey: Map<string, JobScore>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDelete: (id: string) => void;
  onMarkApplied: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <section>
      <SectionHeader
        eyebrow="Saved jobs"
        title="Application Intelligence"
        description="Turn saved roles into match scores, keyword gaps, and resume repair work."
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No saved jobs yet"
          body="Save roles or run Recruiting Lens to start measuring job fit and missing keywords."
          cta="Open Recruiting Lens"
          href="/recruiting-lens"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => {
            const scored = (job.analysis_id ? jobScoresById.get(job.analysis_id) : undefined)
              ?? jobScoresByKey.get(jobScoreKey(job.company_applied, job.role_applied));
            const matchScore = scored?.score ?? null;
            const missingKeywords = [job.industry, job.location, 'role-specific metrics']
              .filter((item): item is string => typeof item === 'string' && item.length > 0)
              .slice(0, 3);
            const openAnalysis = scored ? () => navigate(`/recruiting-lens?id=${scored.analysisId}`) : undefined;
            // Inner controls must not trigger the card's navigate — swallow their bubbled clicks.
            const stop = (e: MouseEvent) => e.stopPropagation();
            return (
              <Card
                key={job.id}
                onClick={openAnalysis}
                role={openAnalysis ? 'button' : undefined}
                tabIndex={openAnalysis ? 0 : undefined}
                onKeyDown={openAnalysis ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openAnalysis();
                  }
                } : undefined}
                className={cn(
                  'rounded-3xl border-border/70 bg-card/75 p-5 backdrop-blur-xl transition-all hover:border-primary/40',
                  openAnalysis && 'cursor-pointer hover:border-primary/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                )}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold text-foreground">{job.role_applied}</h3>
                    <p className="mt-1 font-medium text-muted-foreground">{job.company_applied}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {job.location && <span className="rounded-full border border-border/70 px-2.5 py-1">{job.location}</span>}
                      {job.salary && <span className="rounded-full border border-border/70 px-2.5 py-1">{job.salary}</span>}
                      <span className="rounded-full border border-border/70 px-2.5 py-1">Saved {formatDate(job.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {matchScore !== null ? (
                      <>
                        <p className="text-3xl font-bold text-primary">{matchScore}%</p>
                        <p className="text-xs text-muted-foreground">Match score</p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-muted-foreground">&mdash;</p>
                        <p className="text-xs text-muted-foreground">Not analyzed</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Missing keywords</p>
                    <p className="mt-2 text-sm text-foreground">{missingKeywords.join(', ') || 'Run Recruiting Lens to extract gaps'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/45 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Resume gap level</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {matchScore !== null ? getResumeGapLevel(matchScore) : 'Run Recruiting Lens to measure'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-xl" asChild>
                    <Link to="/recruiting-lens" onClick={stop}>Run Recruiting Lens</Link>
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" asChild>
                    <Link to="/upload" onClick={stop}>Improve Resume</Link>
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={(e) => { stop(e); onMarkApplied(job.id); }}>
                    Mark Applied
                  </Button>
                  {job.url && (
                    <Button size="sm" variant="ghost" className="rounded-xl" asChild>
                      <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={stop}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open
                      </a>
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => { stop(e); onDelete(job.id); }}
                    aria-label={`Delete ${job.role_applied}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
          {hasMore && (
            <div className="pt-2 text-center lg:col-span-2">
              <Button variant="outline" className="rounded-xl" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load more jobs'}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default DashboardPage;
