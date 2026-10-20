import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthUserId } from '@/hooks/useAuthUserId';
import { supabase } from '@/lib/supabaseClient';
import { isInterviewPrepEnabled } from '@/config/feature-flags';
import { MERIT_COST_PER_FEATURE } from '@/config/pricing-config';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  FileText,
  Linkedin,
  Briefcase,
  Compass,
  Eye,
  GraduationCap,
  History,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

// ── Type config for all 8 action types ──────────────────────────

interface ActionTypeConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

const typeConfig: Record<string, ActionTypeConfig> = {
  resume_analysis: {
    label: 'Resume Analysis',
    icon: FileText,
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  job_matching: {
    label: 'Job Matching',
    icon: Briefcase,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  career_compass: {
    label: 'Career Compass',
    icon: Compass,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
  },
  linkedin_grading: {
    label: 'LinkedIn Grading',
    icon: Linkedin,
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
  },
  recruiting_lens: {
    label: 'Recruiting Lens',
    icon: Eye,
    color: 'text-rose-400',
    bg: 'bg-rose-400/10',
  },
  interview_prep: {
    label: 'Interview Prep',
    icon: GraduationCap,
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
  },
};

const defaultConfig: ActionTypeConfig = {
  label: 'Activity',
  icon: History,
  color: 'text-muted-foreground',
  bg: 'bg-muted/50',
};

const toolRoutes: Record<string, string> = {
  linkedin_grading: '/linkedin-grader',
  career_compass: '/career-compass',
  recruiting_lens: '/recruiting-lens',
  interview_prep: '/interview-prep',
  job_matching: '/dashboard',
};

// Canonical Merit costs per action type. Legacy usage_tracking rows carry
// stale credits_consumed values, so display maps to pricing-config instead.
// Elite column is canonical: these four costs are identical across active
// tiers (recruitingLens has no free-tier cell).
const CANONICAL_MERIT_COST: Record<string, number | null | undefined> = {
  resume_analysis: MERIT_COST_PER_FEATURE.resumeAnalysis.elite,
  career_compass: MERIT_COST_PER_FEATURE.careerCompass.elite,
  linkedin_grading: MERIT_COST_PER_FEATURE.linkedinGrader.elite,
  recruiting_lens: MERIT_COST_PER_FEATURE.recruitingLens.elite,
};

// ── Usage tracking row shape ────────────────────────────────────

interface UsageTrackingRow {
  id: string;
  user_id: string;
  action_type: string;
  credits_consumed: number;
  billing_period_start: string;
  analysis_id: string | null;
  created_at: string;
}

const RETIRED_ACTION_TYPES = new Set([
  ['skills', 'gap', 'analysis'].join('_'),
  ['job', 'comparison'].join('_'),
]);

// ── Date grouping helpers ───────────────────────────────────────

interface DateGroup {
  label: string;
  entries: UsageTrackingRow[];
}

const getDateGroupLabel = (date: Date): string => {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
};

const groupByDate = (rows: UsageTrackingRow[]): DateGroup[] => {
  const groups: Map<string, DateGroup> = new Map();

  for (const row of rows) {
    const date = new Date(row.created_at);
    const key = format(date, 'yyyy-MM-dd');

    if (!groups.has(key)) {
      groups.set(key, { label: getDateGroupLabel(date), entries: [] });
    }
    groups.get(key)!.entries.push(row);
  }

  return Array.from(groups.values());
};

// ── Component ───────────────────────────────────────────────────

const AnalysisHistory = () => {
  const navigate = useNavigate();
  // Phase 47 D-05: Single read of the IP flag. Drives both the candidate-table
  // query `enabled` gate and the render-side filter below.
  const interviewPrepEnabled = isInterviewPrepEnabled();

  const { userId, isLoading: isLoadingUser } = useAuthUserId();

  // Redirect unauthenticated users
  useEffect(() => {
    if (!isLoadingUser && userId === null) navigate('/auth');
  }, [userId, isLoadingUser, navigate]);

  const {
    data: usageRows = [],
    isLoading: isLoadingUsage,
    error: usageError,
    refetch,
  } = useQuery({
    queryKey: ['activityHistory', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return ((data || []) as UsageTrackingRow[]).filter(
        (row) => !RETIRED_ACTION_TYPES.has(row.action_type),
      );
    },
    enabled: !!userId,
  });

  const { data: resumes = [] } = useQuery({
    queryKey: ['userResumes', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('resumes')
        .select('id, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string }[];
    },
    enabled: !!userId,
  });

  const { data: resumeAnalysisResults = [] } = useQuery({
    queryKey: ['userResumeAnalysisResults', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, created_at, source_reference')
        .eq('user_id', userId!)
        .eq('analysis_type', 'resume_analysis')
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string; source_reference: string | null }[];
    },
    enabled: !!userId,
  });

  // 22-04 D-20: Per-feature candidate tables for timestamp-proximity ID resolution.
  // RLS on each table enforces auth.uid() = user_id; the explicit .eq('user_id', userId!)
  // is defense-in-depth and mirrors the userResumes query above.
  const { data: linkedinGrades = [] } = useQuery({
    queryKey: ['userLinkedinGrades', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('linkedin_grades')
        .select('id, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string }[];
    },
    enabled: !!userId,
  });

  const { data: careerCompassResults = [] } = useQuery({
    queryKey: ['userCareerCompassResults', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, created_at')
        .eq('user_id', userId!)
        .eq('analysis_type', 'career_compass')
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string }[];
    },
    enabled: !!userId,
  });

  const { data: recruitingLensResults = [] } = useQuery({
    queryKey: ['userRecruitingLensResults', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('analysis_results')
        .select('id, created_at')
        .eq('user_id', userId!)
        .eq('analysis_type', 'recruiting_lens')
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string }[];
    },
    enabled: !!userId,
  });

  const { data: interviewQuizzes = [] } = useQuery({
    queryKey: ['userInterviewQuizzes', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('interview_quizzes')
        .select('id, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      return (data || []) as { id: string; created_at: string }[];
    },
    // Phase 47 D-05: skip the IP candidate-table query on production (flag off).
    // RLS-safe either way; this avoids pointless network traffic when no IP rows
    // can be rendered.
    enabled: !!userId && interviewPrepEnabled,
  });

  // 22-04 D-20: Generalized ±5min timestamp-proximity matcher. Resolves a
  // usage_tracking row to its corresponding feature-table id when the two rows
  // are written within 5 minutes of each other.
  const findIdForEntry = (
    entry: UsageTrackingRow,
    candidates: { id: string; created_at: string }[],
  ): string | null => {
    if (candidates.length === 0) return null;
    const entryTime = new Date(entry.created_at).getTime();
    let best: { id: string; diff: number } | null = null;
    for (const c of candidates) {
      const diff = Math.abs(new Date(c.created_at).getTime() - entryTime);
      if (diff < 5 * 60 * 1000 && (!best || diff < best.diff)) {
        best = { id: c.id, diff };
      }
    }
    return best?.id ?? null;
  };

  const getEntryRoute = (entry: UsageTrackingRow): string | null => {
    // Phase 36 D-20: future work may backfill legacy usage_tracking.analysis_id
    // values using this same five-minute matcher, then remove the fallback.
    // No backfill or migration is executed in this phase.
    switch (entry.action_type) {
      case 'resume_analysis': {
        if (entry.analysis_id) {
          const direct = resumeAnalysisResults.find((r) => r.id === entry.analysis_id);
          return direct?.source_reference ? `/results/${direct.source_reference}` : null;
        }
        const directLegacy = findIdForEntry(entry, resumeAnalysisResults);
        const resumeId = directLegacy
          ? resumeAnalysisResults.find((r) => r.id === directLegacy)?.source_reference
          : findIdForEntry(entry, resumes);
        return resumeId ? `/results/${resumeId}` : null;
      }
      case 'linkedin_grading': {
        if (entry.analysis_id) {
          const direct = linkedinGrades.find((r) => r.id === entry.analysis_id);
          return direct ? `/linkedin-grader?id=${direct.id}` : null;
        }
        const id = findIdForEntry(entry, linkedinGrades);
        return id ? `/linkedin-grader?id=${id}` : (toolRoutes['linkedin_grading'] ?? null);
      }
      case 'career_compass': {
        if (entry.analysis_id) {
          const direct = careerCompassResults.find((r) => r.id === entry.analysis_id);
          return direct ? `/career-compass?id=${direct.id}` : null;
        }
        const id = findIdForEntry(entry, careerCompassResults);
        return id ? `/career-compass?id=${id}` : (toolRoutes['career_compass'] ?? null);
      }
      case 'recruiting_lens': {
        if (entry.analysis_id) {
          const direct = recruitingLensResults.find((r) => r.id === entry.analysis_id);
          return direct ? `/recruiting-lens?id=${direct.id}` : null;
        }
        const id = findIdForEntry(entry, recruitingLensResults);
        return id ? `/recruiting-lens?id=${id}` : (toolRoutes['recruiting_lens'] ?? null);
      }
      case 'interview_prep': {
        if (entry.analysis_id) {
          const direct = interviewQuizzes.find((r) => r.id === entry.analysis_id);
          return direct ? `/interview-prep?id=${direct.id}` : null;
        }
        const id = findIdForEntry(entry, interviewQuizzes);
        return id ? `/interview-prep?id=${id}` : (toolRoutes['interview_prep'] ?? null);
      }
      default:
        return toolRoutes[entry.action_type] ?? null;
    }
  };

  // Phase 47 D-05: hide interview_prep rows from the history listing when the
  // flag is off. DB rows are NOT mutated — this is a read-side filter only.
  // The SQL query above is unchanged so observability is identical across both
  // flag states; re-enabling is a flag flip, not a query change.
  const visibleUsageRows = useMemo(
    () =>
      interviewPrepEnabled
        ? usageRows
        : usageRows.filter((r) => r.action_type !== 'interview_prep'),
    [usageRows, interviewPrepEnabled],
  );

  const isLoading = isLoadingUser || (!!userId && isLoadingUsage);
  const dateGroups = groupByDate(visibleUsageRows);

  // ── Loading state ──

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 pt-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Error state ──

  if (usageError) {
    return (
      <div className="container mx-auto px-4 pt-8 pb-12 max-w-4xl">
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Failed to load activity history
          </h2>
          <p className="text-muted-foreground mb-6">
            {usageError instanceof Error ? usageError.message : 'An unexpected error occurred.'}
          </p>
          <Button onClick={() => refetch()}>Try Again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-8 pb-12 max-w-4xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Activity History</h1>
        <p className="text-muted-foreground mt-1">Your complete Strivo usage timeline</p>
      </div>

      {/* Empty state — Phase 47 D-05: also empty when the only rows were
          interview_prep and the flag is off (visibleUsageRows is the rendered list). */}
      {visibleUsageRows.length === 0 ? (
        <Card className="p-12 text-center">
          <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">No activity yet</h2>
          <p className="text-muted-foreground mb-6">
            Start using Strivo tools and your history will appear here.
          </p>
          <Button onClick={() => navigate('/dashboard')}>Get Started</Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {dateGroups.map((group) => (
            <div key={group.label}>
              {/* Date group heading */}
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.entries.map((entry) => {
                  const config = typeConfig[entry.action_type] || defaultConfig;
                  const Icon = config.icon;
                  const meritCost = CANONICAL_MERIT_COST[entry.action_type] ?? entry.credits_consumed;
                  const meritLabel = meritCost === 1 ? '1 Merit' : `${meritCost} Merits`;
                  const route = getEntryRoute(entry);
                  const isClickable = !!route;

                  return (
                    <Card
                      key={entry.id}
                      className={`p-4 hover:border-primary/30 transition-colors ${isClickable ? 'cursor-pointer' : ''}`}
                      onClick={isClickable ? () => navigate(route!) : undefined}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${config.bg} ${config.color} shrink-0`}>
                          <Icon className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">
                            {config.label}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(entry.created_at), 'h:mm a')}
                          </p>
                        </div>

                        <Badge variant="outline" className="shrink-0 text-xs">
                          {meritLabel}
                        </Badge>

                        {isClickable && (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnalysisHistory;
