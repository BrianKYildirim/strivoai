import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import confetti from 'canvas-confetti';
import { supabase } from "@/lib/supabaseClient";
import { useResumeStream, type StreamParams } from "@/hooks/useResumeStream";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useFeatureUsage } from "@/hooks/useFeatureUsage";
import RecommendationActions, { type Recommendation } from "@/components/recommendations/RecommendationActions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, RefreshCw, AlertTriangle, Lock, Crown, FileText, TrendingUp, BarChart3, Target, Sparkles, ChevronRight, Copy, Check, GitCompare, Brain, WifiOff } from "lucide-react";
import { AnalysisComparisonModal } from "@/components/AnalysisComparisonModal";
import { BlurredLockCard } from '@/components/BlurredLockCard';
import { EliteRerunCta } from '@/components/EliteRerunCta';
import { clearEliteRerunLeaseByNewResumeId } from '@/hooks/useEliteRerun';
import { normalizeActiveTier } from '@/config/pricing-config';
import { getSafeStreamErrorMessage } from '@/lib/analysisError';
import { logAnalysisError } from '@/lib/analysis-error-log';
import { reportDiagnostic } from '@/lib/diagnostics/client-diagnostics';
import { getClientErrorCopy } from '@/lib/client-error-taxonomy';
import { getNetworkStatus, subscribeNetworkStatus } from '@/lib/platform/network-status';
import { useAnalysisLock } from '@/contexts/AnalysisLockContext';
import {
  ELITE_UNLOCK_STAGE_COPY,
  ONBOARDING_STAGE_LABELS,
  PERMITTED_STREAM_STAGE_LABELS,
} from '@/lib/analysis-stage-copy';

import { toast } from "sonner";
import { TextDiffComparison } from "@/components/TextDiffComparison";
import { motion } from "framer-motion";

// Professional score color system - muted tones
// Criteria scores are 0-10; overall scores are 0-100. Normalize to 0-100 for thresholds.
const getScoreColor = (score: number) => {
  const normalized = score <= 10 ? score * 10 : score;
  if (normalized >= 75) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500", muted: "bg-emerald-500/10", border: "border-emerald-500/20" };
  if (normalized >= 55) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500", muted: "bg-amber-500/10", border: "border-amber-500/20" };
  return { text: "text-red-600 dark:text-red-400", bg: "bg-red-500", muted: "bg-red-500/10", border: "border-red-500/20" };
};

const getReadinessLabel = (score: number) => {
  if (score >= 85) return "Highly Competitive";
  if (score >= 75) return "Interview Ready";
  if (score >= 65) return "Solid Foundation";
  if (score >= 55) return "Needs Refinement";
  return "Significant Gaps";
};

const getInterpretation = (score: number) => {
  if (score >= 85) return "Your resume demonstrates strong hiring signals and is well-positioned for competitive roles.";
  if (score >= 75) return "Your resume meets key recruiter criteria but has room for optimization.";
  if (score >= 65) return "Your resume is solid but missing key signals for top-tier screening.";
  if (score >= 55) return "Your resume needs targeted improvements to pass initial screening.";
  return "Your resume has significant gaps that may prevent it from reaching recruiters.";
};

// Signal Score Bar Component
const SignalBar = ({ label, score, weight }: { label: string; score: number; weight: number }) => {
  const colors = getScoreColor(score);
  // Criteria scores are 0-10; normalize to percentage for bar width
  const barPct = score <= 10 ? score * 10 : score;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="w-44 flex-shrink-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-2">({weight}%)</span>
      </div>
      <div className="flex-1">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${colors.bg} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${barPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      <div className={`w-12 text-right font-semibold ${colors.text}`}>
        {score}
      </div>
    </div>
  );
};

// Strength Item
const StrengthItem = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
      <Check className="h-3 w-3 text-emerald-600" />
    </div>
    <span className="text-sm text-foreground/80 leading-relaxed">{text}</span>
  </div>
);


// Priority Improvement Card
const PriorityCard = ({ 
  title, 
  impact, 
  isCompleted, 
  onToggle, 
  original, 
  improved, 
  feedback,
  impactText 
}: { 
  title: string; 
  impact: number; 
  isCompleted: boolean; 
  onToggle: () => void;
  original?: string;
  improved?: string;
  feedback?: string[];
  impactText?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = original || improved || (feedback && feedback.length > 0);
  
  return (
    <div className={`border rounded-lg transition-all ${isCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card border-border hover:border-primary/20'}`}>
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle()}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-5"
        />
        <div className="flex-1">
          <span className={`font-medium ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {title}
          </span>
        </div>
        <Badge variant="outline" className={`${isCompleted ? 'opacity-50' : ''}`}>
          +{impact} pts
        </Badge>
        {hasDetails && (
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </div>
      
      {isExpanded && hasDetails && !isCompleted && (
        <div className="px-4 pb-4 border-t border-border/50 mt-0 pt-4">
          {original && improved ? (
            <TextDiffComparison
              original={original}
              improved={improved}
              feedback={feedback}
              impact={impactText}
            />
          ) : feedback && feedback.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">How to improve</p>
              {feedback.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                  <ArrowRight className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// ── Free-tier placeholder content (hardcoded, zero backend token cost) ──────
const LOCKED_IMPROVEMENT_PLACEHOLDERS = [
  { title: 'Experience Section Restructure', description: 'Reorganize your experience section to lead with quantified achievements that match target role requirements.' },
  { title: 'Skills Section Optimization', description: 'Align your skills section with ATS keyword requirements and industry-standard terminology for maximum parseability.' },
  { title: 'Achievement Quantification', description: 'Add specific metrics and measurable outcomes to your bullet points to demonstrate concrete business impact.' },
  { title: 'Career Narrative Strengthening', description: 'Build a cohesive story across your experience entries that shows clear professional growth and direction.' },
];

const LOCKED_CRITERIA_PLACEHOLDERS = [
  { label: 'Visual Clarity & Layout', weight: 6, fakeScore: 72, bullets: ['Header hierarchy creates clear visual flow for 6-second recruiter scan.', 'Section spacing allows quick navigation between experience entries.', 'Consider adding a subtle horizontal rule between major sections.'] },
  { label: 'Formatting Consistency', weight: 4, fakeScore: 68, bullets: ['Date formatting is consistent across all role entries.', 'Bullet point style varies between sections — standardize.', 'Font sizing follows a clear hierarchy from headers to body.'] },
  { label: 'ATS Parseability', weight: 8, fakeScore: 75, bullets: ['Standard section headers improve automated parsing accuracy.', 'Contact information is properly structured for extraction.', 'Consider removing graphics that may confuse ATS systems.'] },
  { label: 'Professional Tone & Grammar', weight: 5, fakeScore: 82, bullets: ['Active voice used consistently in achievement descriptions.', 'No grammatical errors detected in sampled bullet points.', 'Tone matches expected register for target industry level.'] },
  { label: 'Conciseness & Value Density', weight: 7, fakeScore: 64, bullets: ['Several bullets exceed optimal 1.5-line length for scanning.', 'Leading with action verbs improves information density.', 'Remove filler phrases to increase value per word ratio.'] },
  { label: 'Relevance & Role Alignment', weight: 10, fakeScore: 70, bullets: ['Experience entries partially align with target role requirements.', 'Skills section covers core competencies for the target field.', 'Consider reordering bullets to lead with most relevant experience.'] },
  { label: 'Skills Section Quality', weight: 10, fakeScore: 66, bullets: ['Technical skills are present but could be better categorized.', 'Missing industry-standard certifications for target roles.', 'Add proficiency levels to differentiate skill depth.'] },
  { label: 'Projects & Extracurriculars', weight: 7, fakeScore: 58, bullets: ['Project descriptions lack measurable outcomes and metrics.', 'Include technologies used and team size for context.', 'Leadership roles in extracurriculars strengthen the narrative.'] },
  { label: 'Education Strength', weight: 5, fakeScore: 78, bullets: ['Degree relevance to target role is clearly established.', 'GPA inclusion is appropriate for experience level.', 'Relevant coursework could strengthen technical credibility.'] },
  { label: 'Career Narrative & Keywords', weight: 18, fakeScore: 61, bullets: ['Career progression shows growth but lacks a unifying theme.', 'Industry keywords are present but not optimally distributed.', 'Summary section could better frame the career trajectory.'] },
];

/**
 * UI-SPEC D6 R4 (03-14 / XRUN-03) — the reconnect banner, transcribed verbatim.
 *
 * Deliberately NOT a member of the frozen client error taxonomy: R4 is a STATUS
 * ("we noticed you're back, we're re-checking"), not a failure, and the taxonomy
 * is the one source of user-facing FAILURE strings. The offline half of the pair
 * IS a taxonomy code (`CLIENT_OFFLINE`), and this file reads it from there.
 */
const RECONNECT_STATUS_COPY = 'Back online. Checking your analysis…';

/**
 * 03-14 — the minimum gap between two forced catch-up polls on this surface.
 *
 * The seam already coalesces `online` + `visibilitychange`; this is the second,
 * independent guard for the OTHER trigger — a realtime channel that fails
 * repeatedly while `realtime-js` retries unboundedly in the background.
 */
const CATCH_UP_MIN_INTERVAL_MS = 1000;

// 260724-2iv — carry the SERVER-WRITTEN analyzed_tier through stream completion.
//
// The row is read on mount BEFORE the analysis finishes writing analyzed_tier, so the local
// copy holds a STALE null that survives the completion merge and makes EliteRerunCta render
// the D-4 "pre-upgrade record" line over a brand-new Elite result.
//
// D-4 is PRESERVED: an honest NULL from the DB stays NULL (the neutral, non-charging line is
// still correct for real pre-upgrade rows). The tier is only ever taken from what the server
// wrote — never from the viewing account's subscription tier.
export function applyAuthoritativeTier(
  prev: any,
  read: { data: { analyzed_tier?: 'free' | 'elite' | null } | null; error: unknown },
) {
  if (!prev) return prev;
  // Read failed or the row is not visible -> never guess. Leave the local value untouched.
  if (read.error || !read.data) return prev;
  return { ...prev, analyzed_tier: read.data.analyzed_tier ?? null };
}

/**
 * ONBOARDING HANDOFF KEY (quick 260803-t6v). Written once by Onboarding.tsx before it
 * navigates here; cleared by this page once the analysis is genuinely done.
 */
export const onboardingWaitKey = (id: string) => `onboarding_wait_${id}`;

/**
 * The fourth waiting-surface branch: re-derive the onboarding ladder from the durable
 * marker, or `null` when this page was not reached from onboarding.
 *
 * WHY THIS IS STRICTMODE-PROOF, AND THE IN-MEMORY CARRY-FORWARD IS NOT.
 * `src/main.tsx` wraps the app in <StrictMode>, so React 18 double-invokes effects:
 * mount -> cleanup -> mount. This page's unmount cleanup calls
 * `hideWaitingSurface('resume-analysis')`, which sets the live waiting-surface record to
 * null — and on the double-invoke that hide lands BETWEEN Onboarding's seed and this
 * page's own adopting write. Any mechanism that REMEMBERS the ladder in memory (including
 * AnalysisLockContext's carry-forward, which reads the LIVE record) has nothing left to
 * inherit at that moment, so a label-less record is stored and the user drops to the
 * single-row 'Working on your analysis' surface mid-analysis.
 *
 * Reading sessionStorage instead means the labels are RE-DERIVED on every effect run.
 * There is no in-memory state for a hide to destroy, so the ordering stops mattering.
 *
 * Returns null for every surface that did not come from onboarding — including the
 * polling / job-status route that `e2e/cross-device/waiting-surface.spec.ts` OT-8 and
 * `realtime-fallback.spec.ts` exercise, which never write the marker. Branch 3 still
 * yields `{}` for them and their single-row copy is byte-identical to today.
 */
export function resolveOnboardingLadder(
  id: string | undefined,
): { stageLabels: readonly string[] } | null {
  if (!id) return null;
  try {
    return sessionStorage.getItem(onboardingWaitKey(id)) !== null
      ? { stageLabels: ONBOARDING_STAGE_LABELS }
      : null;
  } catch {
    // Storage disabled/partitioned — degrade to the existing label-less behaviour.
    return null;
  }
}

const ResultsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');
  const isStreamMode = searchParams.get('stream') === 'true';
  const unlockAttempt = searchParams.get('unlock');
  const [streamParams, setStreamParams] = useState<StreamParams | null>(null);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const [unlockBackgrounded, setUnlockBackgrounded] = useState(false);
  const streamCompletedRef = useRef(false);
  const [resume, setResume] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const [analysisTimedOut, setAnalysisTimedOut] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(25);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const { showWaitingSurface, hideWaitingSurface } = useAnalysisLock();
  const MAX_POLLING_TIME = 120000;

  // ── 03-14 · XRUN-03 / XRUN-04 — connectivity + realtime observability ──────
  // All three are INFORMATIONAL. None of them is an error state, none blocks the
  // waiting surface, and none may fire a toast (taxonomy rule 4 / UI-SPEC D5):
  // a transient socket drop on mobile is common and the server is still running
  // the analysis, so turning one into a visible failure would manufacture
  // exactly the "false failure on slow networks" this phase exists to remove.
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);
  // Seeded LAZILY from the platform rather than assumed false: a user who
  // navigates within the SPA while already offline gets the honest note on the
  // first paint, without a cascading setState in the effect body.
  const [isOffline, setIsOffline] = useState(() => !getNetworkStatus().online);
  const [showBackOnline, setShowBackOnline] = useState(false);

  // FEAT-01 (05-01): additive lifecycle STATE recovery. Inert while
  // VITE_FEATURE_ANALYSIS_LIFECYCLE is off (enabled:false, no channel/poll/storage).
  // It TRACKS the run (progress stage / terminal error / canRetry) via run_id
  // recovered from URL+localStorage; the RESULT body is still re-read from
  // resumes.grading_data by the existing realtime path below (Pitfall F). When the
  // flag is ON, the run's own terminal states + the Phase-3 reaper own "is this run
  // dead" — replacing the hard 120s timeout dead-end (never a silent timeout).
  const run = useAnalysisRun();

  // L3 telemetry + recommendations
  const { recordEvent } = useFeatureUsage('resume_analysis');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const recShownFiredRef = useRef(false);

  // Load streaming params from sessionStorage when in stream mode
  useEffect(() => {
    if (!isStreamMode || !id) return;
    const stored = sessionStorage.getItem(`stream_params_${id}`);
    if (stored) {
      try {
        setStreamParams({ ...JSON.parse(stored), _retryKey: 0 });
        setStreamRetryKey(Number(unlockAttempt) || 0);
        setUnlockBackgrounded(false);
        streamCompletedRef.current = false;
      } catch { /* ignore */ }
    } else {
      // sessionStorage lost (e.g. page refresh) — strip stream param and fall back to DB polling
      setSearchParams(prev => {
        prev.delete('stream');
        return prev;
      }, { replace: true });
    }
  }, [isStreamMode, id, unlockAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamState = useResumeStream(
    isStreamMode ? (streamParams ? { ...streamParams, _retryKey: streamRetryKey } : null) : null
  );

  // When streaming completes, update resume state and show results
  useEffect(() => {
    if (!isStreamMode) return;
    let cancelled = false;
    if (streamState.stage === 'complete' && streamState.result && !streamCompletedRef.current) {
      streamCompletedRef.current = true;
      setResume((prev: any) => ({
        ...prev,
        overall_score: streamState.result.overallScore,
        grading_data: streamState.result,
      }));
      setLoading(false);
      sessionStorage.removeItem(`stream_params_${id}`);
      const completedUnlock = streamParams?.mode === 'elite_unlock';
      (async () => {
        if (!id) return;
        const read = await supabase
          .from('resumes')
          .select('analyzed_tier, grading_data, overall_score')
          .eq('id', id)
          .maybeSingle();
        if (cancelled) return;
        setResume((prev: any) => read.error || !read.data ? prev : { ...prev, ...read.data });
        if (completedUnlock) {
          clearEliteRerunLeaseByNewResumeId(id);
          toast.success('Elite insights unlocked.');
          setUnlockBackgrounded(false);
          setSearchParams((prev) => {
            prev.delete('stream');
            prev.delete('unlock');
            return prev;
          }, { replace: true });
        }
      })();
      if (!completedUnlock) {
        setTimeout(() => {
          confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 }, colors: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'] });
        }, 400);
      }
    }
    if (streamState.stage === 'error') {
      // Before showing the error UI, check if DB already has results (realtime may have populated resume)
      // We delay the loading=false to give the realtime subscription a moment to fire
      setTimeout(() => {
        setLoading(false);
      }, 500);
    }
    return () => { cancelled = true; };
  }, [streamState.stage, streamState.result, isStreamMode, id, setSearchParams, streamParams?.mode]);

  // Streaming-stuck safeguard: if stream stays non-terminal for 90 seconds, check DB
  useEffect(() => {
    if (!isStreamMode || !id) return;
    const STREAM_TIMEOUT_MS = 90000;
    // WR-04 fix: guard setState with a cancelled flag so navigating away
    // between the DB round-trip and the await resolving does not log a
    // setState-on-unmounted warning or push stale results into a freshly
    // mounted instance (matches the cancelled-flag pattern used elsewhere
    // in this file).
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (streamCompletedRef.current) return; // already resolved
      const { data } = await supabase.from('resumes').select('*').eq('id', id).single();
      if (cancelled) return;
      if (data?.grading_data) {
        streamCompletedRef.current = true;
        setResume(data);
        setLoading(false);
      } else {
        // No DB result either — let the error state surface
        setLoading(false);
      }
    }, STREAM_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isStreamMode, id]);

  // L3: fire 'open' once on mount
  useEffect(() => {
    recordEvent('open');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fire 'view_results' once when results sub-tree becomes available
  useEffect(() => {
    if (resume?.grading_data && !loading) {
      recordEvent('view_results');
      // The analysis is GENUINELY done (grading_data landed), so the onboarding handoff
      // is over — retire the durable marker (quick 260803-t6v) on the existing
      // completion-side effect rather than inventing a new lifecycle. Without this, a
      // later generic wait on this same resume id would inherit the onboarding ladder.
      if (id) {
        try {
          sessionStorage.removeItem(onboardingWaitKey(id));
        } catch { /* storage disabled — nothing to retire */ }
      }
    }
  }, [resume?.grading_data, loading, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fetch recommendations for this analysis version and mark shown once
  useEffect(() => {
    if (!id || !resume?.grading_data || recShownFiredRef.current) return;
    recShownFiredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('recommendations')
          .select('*')
          .eq('feature', 'resume_analysis')
          .eq('source_version_id', id);
        if (cancelled || error || !data || data.length === 0) return;
        setRecommendations(data as Recommendation[]);
        const recIds = data.map((r: Recommendation) => r.id);
        await supabase.rpc('record_recommendations_shown', { rec_ids: recIds });
      } catch (err) {
        console.error('[Results] recommendations fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [id, resume?.grading_data]);

  const { data: userStatus } = useQuery({
    queryKey: ['resultUserStatus', id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { userTier: 'free' };

      const profileResult = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();

      const tier = profileResult.data?.subscription_tier || 'free';
      return { userTier: tier };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
  });

  const userTier = userStatus?.userTier ?? 'free';

  const isEliteUnlockStream = isStreamMode && streamParams?.mode === 'elite_unlock';
  const eliteUnlockRunning = isEliteUnlockStream &&
    streamState.stage !== 'complete' && streamState.stage !== 'error';
  const streamFailed = isStreamMode && streamState.stage === 'error';
  const jobFailed = jobStatus === 'failed' && !!jobError && !resume?.grading_data;
  const lifecycleFailed = run.enabled && run.isFailed && !resume?.grading_data;
  const shouldShowWaiting =
    (eliteUnlockRunning || loading || !resume?.grading_data) &&
    !streamFailed &&
    !jobFailed &&
    !lifecycleFailed &&
    !analysisTimedOut;
  const waitingStage = isStreamMode ? streamState.stageLabel : null;
  const waitingLifecycleState = run.enabled && !isStreamMode
    ? jobStatus === 'processing' ? 'generating'
    : jobStatus === 'pending' || jobStatus === 'retrying' ? 'created'
    : null
    : null;

  useEffect(() => {
    if (shouldShowWaiting) {
      // Re-derived on EVERY run of this effect — see resolveOnboardingLadder for why
      // that (and not a remembered value) is what survives the StrictMode double-invoke.
      const adoptedOnboardingLadder = resolveOnboardingLadder(id);
      showWaitingSurface({
        key: 'resume-analysis',
        title: isEliteUnlockStream ? 'Unlocking Elite insights' : 'Analyzing your resume',
        streamStageLabel: waitingStage,
        lifecycleState: waitingLifecycleState,
        // CRITICAL — this must NOT be widened past `isStreamMode`. The polling /
        // job-status path deliberately falls through to the single-line
        // 'Working on your analysis' branch with no ladder and no timer:
        // `e2e/cross-device/waiting-surface.spec.ts` OT-8 asserts that text is
        // byte-identical for 60 seconds and `realtime-fallback.spec.ts` asserts
        // it four times. Neither route sets `?stream=true`.
        //
        // 2026-08-03 (quick 260803-mqs): branch 3 stays `{}` and the gate stays where it
        // is. What changed is one level down — AnalysisLockContext now CARRIES FORWARD a
        // ladder that is already live on this key rather than erasing it, so an onboarding
        // wait that navigated here keeps its 5-step ladder. Nothing is carried when nobody
        // seeded one, which is every case these two specs exercise.
        ...(isEliteUnlockStream
          ? {
              stageLabels: ELITE_UNLOCK_STAGE_COPY,
              // activeStageIndex omitted on purpose: the surface now advances itself.
              onContinueInBackground: () => setUnlockBackgrounded(true),
            }
          : isStreamMode
            ? {
                stageLabels: PERMITTED_STREAM_STAGE_LABELS,
                // Real signal, never a timer: the resume stream emits genuine stages.
                activeStageIndex: Math.max(
                  0,
                  PERMITTED_STREAM_STAGE_LABELS.indexOf(waitingStage ?? ''),
                ),
              }
            // FOURTH BRANCH (quick 260803-t6v): this page was reached from onboarding,
            // whose run is still in flight. `activeStageIndex` is deliberately OMITTED —
            // onboarding emits no per-stage signal, so the sanctioned timer in
            // UniversalAnalyzing drives the ladder, exactly as it did on the seed.
            : adoptedOnboardingLadder
              ? adoptedOnboardingLadder
              : {}),
      });
    } else {
      hideWaitingSurface('resume-analysis');
    }
  }, [
    hideWaitingSurface,
    shouldShowWaiting,
    showWaitingSurface,
    waitingLifecycleState,
    waitingStage,
    isEliteUnlockStream,
    isStreamMode,
    id,
  ]);

  useEffect(
    () => () => hideWaitingSurface('resume-analysis'),
    [hideWaitingSurface],
  );

  // 260723-2b0 Task 9(d) / D-3c step 4: once the (cloned) row this page shows has a completed
  // analysis, retire any Elite-rerun lease pointing at it so the next CTA click starts a
  // clean, correctly-priced run rather than replaying a settled attempt.
  useEffect(() => {
    const r = resume as { id?: string; analyzed_tier?: string | null } | null;
    if (r?.id && r.analyzed_tier === 'elite') {
      clearEliteRerunLeaseByNewResumeId(r.id);
    }
  }, [resume]);

  useEffect(() => {
    if (loading && !resume?.grading_data) {
      const countdownInterval = setInterval(() => {
        setEstimatedTimeRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(countdownInterval);
    }
  }, [loading, resume?.grading_data]);

  useEffect(() => {
    if (!id) return;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let mounted = true;

    const handleAnalysisComplete = async (data: any) => {
      if (!mounted) return;

      const { data: checklistData } = await supabase
        .from("improvement_checklist")
        .select("*")
        .eq("resume_id", id);

      const checklistMap: Record<string, boolean> = {};
      checklistData?.forEach((item: any) => {
        checklistMap[item.improvement_text] = item.completed;
      });
      setChecklist(checklistMap);

      if (data.overall_score) {
        setTimeout(() => {
          const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];
          confetti({
            particleCount: 60,
            spread: 50,
            origin: { y: 0.7 },
            colors,
          });
        }, 400);
      }

      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      setLoading(false);
      setAnalysisTimedOut(false);
    };

    // One-time fetch on mount — picks up data that's already ready before the
    // realtime subscription activates (avoids a blank screen on page refresh).
    const fetchOnce = async () => {
      if (!mounted) return;
      const { data, error } = await supabase.from("resumes").select("*").eq("id", id).single();
      if (error || !mounted) return;
      setResume(data);
      if (data?.grading_data) {
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
        await handleAnalysisComplete(data);
      }
    };

    // Job-status polling — runs when a jobId is present in the URL (async queue path).
    // Complements the realtime subscription: provides detailed status and catches failures.
    const pollJobStatus = async () => {
      if (!mounted) return;

      const { data: statusData } = await invokeWithTimeout<any>(
        'get-analysis-job-status',
        { body: { jobId } },
        10000,
      );

      if (!mounted) return;

      if (!statusData || statusData.error) {
        // Couldn't reach status function — retry shortly
        pollTimer = setTimeout(pollJobStatus, 3000);
        return;
      }

      setJobStatus(statusData.status);

      if (statusData.status === 'completed') {
        // Worker has finished — grading_data may already be set via realtime.
        // Force-fetch to cover the case where the realtime event was missed.
        const { data: freshResume } = await supabase.from("resumes").select("*").eq("id", id).single();
        if (!mounted) return;
        if (freshResume?.grading_data) {
          setResume(freshResume);
          if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
          await handleAnalysisComplete(freshResume);
        } else {
          // grading_data not yet visible (replication lag) — retry once
          pollTimer = setTimeout(pollJobStatus, 1500);
        }
        return;
      }

      if (statusData.status === 'failed') {
        const errorPayload = statusData.error;
        const msg =
          typeof errorPayload === 'object'
            ? (errorPayload?.error || errorPayload?.message || 'Analysis failed')
            : String(errorPayload || 'Analysis failed');
        logAnalysisError(new Error(msg), {
          stage: 'job-poll',
          resumeId: id,
          runId: jobId,
          tags: { path: 'job-status-failed' },
        });
        setJobError(msg);
        setLoading(false);
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
        return;
      }

      // pending / processing / retrying — keep polling
      const delay = statusData.pollAfterMs ?? 2500;
      pollTimer = setTimeout(pollJobStatus, delay);
    };

    // ── 03-14 · the forced catch-up (XRUN-03) ───────────────────────────────
    // The ONE thing every recovery trigger funnels through: a severed socket, a
    // tab returning from the iOS background/bfcache freeze, and a reconnect all
    // need the same answer — "ask the server what actually happened".
    let lastCatchUpAt = 0;
    const catchUp = async () => {
      if (!mounted) return;
      // NEVER poll while offline. The request cannot succeed, and burning the
      // coalescing window on a guaranteed failure delays the real catch-up that
      // the `online` event is about to ask for. (Same rule 03-13 follows for the
      // stale-bundle reload: offline is never a moment to retry into.)
      if (!getNetworkStatus().online) return;
      const now = Date.now();
      if (now - lastCatchUpAt < CATCH_UP_MIN_INTERVAL_MS) return;
      lastCatchUpAt = now;

      await fetchOnce();
      if (!mounted) return;
      if (jobId) {
        // Re-arm the SINGLE poll chain rather than starting a second one:
        // overwriting `pollTimer` without clearing it is precisely how one tab
        // ends up with two chains hitting `get-analysis-job-status` forever.
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        await pollJobStatus();
      }
      // UI-SPEC D6 R4 — the reconnect banner auto-clears on resolution.
      if (mounted) setShowBackOnline(false);
    };

    // ── 03-14 · realtime status observation (XRUN-04, defect XD-18) ─────────
    // At HEAD this was a BARE `.subscribe()`. `realtime-js` v2 has no long-poll
    // transport and reconnects unboundedly, so a blocked-WebSocket environment
    // produced an INVISIBLE infinite loop: the UI could never say polling was in
    // use and the cadence never adapted. The identical callback shape is applied
    // to the dormant `useAnalysisRun` site so the two cannot drift.
    let degradedReported = false;
    const onRealtimeStatus = (status: string) => {
      if (!mounted) return;
      if (status === 'SUBSCRIBED') {
        degradedReported = false;
        setRealtimeDegraded(false);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeDegraded(true);
        // ONE catch-up and ONE diagnostic per TRANSITION into degraded — not one
        // per event. realtime-js keeps retrying in the background, and a poll per
        // retry from every affected tab is a self-inflicted request storm.
        if (degradedReported) return;
        degradedReported = true;
        // Only the closed `realtime_degraded` CATEGORY is reported. The status
        // string and the error object carry transport detail (socket URLs, close
        // codes) and neither is passed here, stored, or rendered (XRUN-06).
        reportDiagnostic({
          surface: 'resume-analysis',
          stage: 'job-poll',
          category: 'realtime_degraded',
          runId: jobId,
        });
        void catchUp();
      }
    };

    const channel = supabase
      .channel(`resume-updates-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "resumes", filter: `id=eq.${id}` },
        async (payload) => {
          if (!mounted) return;
          const newData = payload.new as any;
          setResume(newData);
          if (newData?.grading_data) {
            if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
            await handleAnalysisComplete(newData);
          }
        },
      )
      .subscribe(onRealtimeStatus);

    // ── 03-14 · the connectivity + visibility seam (XRUN-03, defect XD-19) ──
    // iOS Safari freezes a backgrounded tab and severs its WebSocket; Chrome's
    // bfcache does the same. Nothing in `src/` used to notice, so a user who
    // switched apps mid-analysis came back to a dead socket and a throttled
    // timer. The seam turns `online` and `visibilitychange -> visible` into ONE
    // coalesced `onCatchUp`, so a laptop waking from sleep (which fires both in
    // the same tick) forces a single immediate status poll, not two.
    const unsubscribeNetwork = subscribeNetworkStatus({
      onOffline: () => {
        if (!mounted) return;
        setIsOffline(true);
        setShowBackOnline(false);
      },
      onOnline: () => {
        if (!mounted) return;
        setIsOffline(false);
        setShowBackOnline(true);
      },
      onCatchUp: () => { void catchUp(); },
    });

    fetchOnce();

    if (jobId) {
      // Start polling after a brief delay to let the worker begin
      pollTimer = setTimeout(pollJobStatus, 1500);
    }

    // Fallback DB polling for non-stream, non-job paths (e.g. onboarding).
    // Realtime subscriptions can miss events — poll every 5s as a safety net.
    let fallbackPollTimer: NodeJS.Timeout | null = null;
    if (!jobId && !isStreamMode) {
      const fallbackPoll = async () => {
        if (!mounted) return;
        const { data } = await supabase.from("resumes").select("*").eq("id", id).single();
        if (data?.grading_data) {
          setResume(data);
          if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
          await handleAnalysisComplete(data);
          return; // stop polling
        }
        if (mounted) {
          fallbackPollTimer = setTimeout(fallbackPoll, 5000);
        }
      };
      fallbackPollTimer = setTimeout(fallbackPoll, 5000);
    }

    // A slow-but-alive lifecycle run is never killed at 120s: its authoritative state +
    // the reaper own terminalization. But the feature flag alone is not proof that THIS
    // page has a trackable run. Onboarding can lose the response before receiving run_id;
    // a dead/stale persisted id can also be cleared by useAnalysisRun. In either case the
    // resume-row poll has no failure signal, so retain the bounded recovery surface unless
    // a concrete lifecycle run is actively tracked. This changes UI state only — it never
    // submits a second analysis/job or touches Merit settlement.
    if (!run.enabled || !run.isActive) {
      timeoutTimer = setTimeout(() => {
        if (mounted) {
          setAnalysisTimedOut(true);
          setLoading(false);
        }
      }, MAX_POLLING_TIME);
    }

    return () => {
      mounted = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (pollTimer) clearTimeout(pollTimer);
      if (fallbackPollTimer) clearTimeout(fallbackPollTimer);
      unsubscribeNetwork();
      supabase.removeChannel(channel);
    };
  }, [id, jobId, retryToken, run.enabled, run.isActive]);

  // 260723-2b0 Task 9(a): reconcile the RENDERING tier with the DATA tier. Reading only the
  // ACCOUNT tier (userTier) renders the paid layout over Free-shaped grading_data from which
  // applyTierShape deleted the Elite fields (requirement 3's defect). Prefer the data tier;
  // fall back to today's account-tier behavior when the data tier is unknown/NULL (D-4 — no
  // normalization needed on the read side, the column carries only free/elite per D-6).
  const analyzedTier = (resume as { analyzed_tier?: 'free' | 'elite' | null } | null)?.analyzed_tier;
  const showFullResults = analyzedTier ? analyzedTier !== 'free' : userTier !== 'free';
  // 260723-2b0 Task 9(e): an Elite account viewing a Free-tier analysis is NOT told to
  // "Upgrade" (they already are Elite) — the honest action is to rerun. The CTA above owns
  // the primary prompt; the gated-section label just reads honestly for these users.
  const accountIsElite = normalizeActiveTier(userTier) === 'elite';
  const unlockMoreLabel = accountIsElite
    ? 'Rerun with Elite to unlock 4 more improvements'
    : 'Upgrade to unlock 4 more improvements';

  const toggleImprovement = async (improvementText: string, currentStatus: boolean) => {
    try {
      if (!id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newStatus = !currentStatus;

      const { data: existing } = await supabase
        .from("improvement_checklist")
        .select("id")
        .eq("resume_id", id)
        .eq("improvement_text", improvementText)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("improvement_checklist")
          .update({ 
            completed: newStatus,
            completed_at: newStatus ? new Date().toISOString() : null
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("improvement_checklist")
          .insert({
            user_id: user.id,
            resume_id: id,
            improvement_text: improvementText,
            completed: newStatus,
            completed_at: newStatus ? new Date().toISOString() : null
          });
      }

      setChecklist(prev => ({ ...prev, [improvementText]: newStatus }));
      toast.success(newStatus ? "Marked as complete" : "Marked as incomplete");
    } catch (error) {
      console.error("Error toggling improvement:", error);
      toast.error("Failed to update progress");
    }
  };

  const handleRetryAnalysis = () => {
    setAnalysisTimedOut(false);
    setLoading(true);
    setEstimatedTimeRemaining(25);
    setRetryToken(t => t + 1);
  };

  // Job hard failure (worker exhausted retries)
  if (jobStatus === 'failed' && jobError && !resume?.grading_data) {
    const isUsageLimit = jobError.includes('usage_limit') || jobError.toLowerCase().includes('usage limit');
    return (
      <div className="container mx-auto px-4 pt-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">
            {isUsageLimit ? "Credit Limit Reached" : "Analysis Failed"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {isUsageLimit
              ? "You've used all available credits. Upgrade to analyze more resumes."
              : "The analysis job encountered an error. Please upload your resume again to retry."}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate('/upload')} variant="default">
              Upload Again
            </Button>
            {isUsageLimit && (
              <Button onClick={() => navigate('/pricing')} variant="outline">
                Upgrade
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 05-01 (FEAT-01): lifecycle terminal-FAILURE screen. A genuinely dead run surfaces a
  // SPECIFIC error (from the analysisError taxonomy via run.errorMessage), never the old
  // silent 120s timeout. Only when the run truly failed AND no result landed in
  // resumes.grading_data (Pitfall F: the RESULT recovers separately via the realtime path
  // above). Inert while the flag is off (run.enabled=false). Retry is offered only when
  // the run is retryable (canRetry); Upload New is always available.
  if (run.enabled && run.isFailed && !resume?.grading_data) {
    return (
      <div className="container mx-auto px-4 pt-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Analysis Failed</h2>
          <p className="text-muted-foreground mb-6">
            {run.errorMessage || 'The analysis could not be completed. Please try again.'}
          </p>
          <div className="flex gap-3 justify-center">
            {run.canRetry && (
              <Button
                onClick={() => { run.retry(); setLoading(true); }}
                variant="default"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
            <Button onClick={() => navigate('/upload')} variant={run.canRetry ? 'outline' : 'default'}>
              Upload New Resume
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (analysisTimedOut && !resume?.grading_data) {
    return (
      <div className="container mx-auto px-4 pt-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Analysis Taking Longer Than Expected</h2>
            <p className="text-muted-foreground mb-6">
              Your analysis is still processing and will appear here when it lands — this page
              keeps checking. You can wait, or head to your dashboard and come back to it.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handleRetryAnalysis} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
              {/* 260713-hrd: this screen is the FIRST thing a user can hit after onboarding, and
                  it used to offer only "check again" (which re-polls but cannot revive a run that
                  failed server-side) and "upload another resume". A user whose first analysis
                  stalled was therefore boxed out of the product at the front door. Onboarding has
                  already persisted their resume, profile and goal by this point, so entering the
                  app is always safe — never leave them with no way in. The background poll above
                  keeps running, so a result that lands later still renders. */}
              <Button onClick={() => navigate('/dashboard')} variant="outline">
                Go to Dashboard
              </Button>
              <Button onClick={() => navigate('/upload')} variant="ghost">
                Upload New Resume
              </Button>
            </div>
          </div>
        </div>
    );
  }

  if (loading || !resume?.grading_data) {
    // Stream-mode error: surface dedicated retry CTA (UniversalAnalyzing only renders progress).
    if (isStreamMode && streamState.stage === 'error') {
      return (
        <div className="container mx-auto px-4 pt-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Analysis Interrupted</h2>
            <p className="text-muted-foreground mb-6">
              {getSafeStreamErrorMessage(streamState.error)}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="default"
                onClick={() => {
                  streamCompletedRef.current = false;
                  setLoading(true);
                  setStreamRetryKey(k => k + 1);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => navigate('/upload')} variant="outline">
                Upload New Resume
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // ── 03-14 · UI-SPEC D5 + D6 R4 — ONE connectivity note, beneath the stage
    // list. Copy comes ONLY from the frozen 03-12 taxonomy (plus D6 R4's status
    // sentence); the realtime status string, the error object and every socket
    // URL stay out of the DOM (XRUN-06). Offline outranks the reconnect banner,
    // which outranks the degraded line — never two at once.
    //
    // The route-independent AnalysisWaitingHost owns the fixed overlay, so this
    // route renders only its connectivity note above that persistent surface.
    const offlineCopy = getClientErrorCopy('CLIENT_OFFLINE');
    const degradedCopy = getClientErrorCopy('CLIENT_REALTIME_DEGRADED');
    const connectivityNote = isOffline
      ? {
          testId: 'offline-note',
          icon: <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />,
          text: `${offlineCopy.heading}. ${offlineCopy.body}`,
        }
      : showBackOnline
      ? {
          testId: 'back-online-note',
          icon: <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />,
          text: RECONNECT_STATUS_COPY,
        }
      : realtimeDegraded
      ? {
          testId: 'realtime-degraded-note',
          icon: <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />,
          text: `${degradedCopy.heading}. ${degradedCopy.body}`,
        }
      : null;

    return (
      <>
        {connectivityNote && (
          <div className="fixed inset-x-0 bottom-6 z-[61] flex justify-center px-4 pointer-events-none">
            <p
              role="status"
              aria-live="polite"
              data-testid={connectivityNote.testId}
              className="flex max-w-md items-center justify-center gap-2 text-center text-sm leading-5 text-muted-foreground"
            >
              {connectivityNote.icon}
              <span>{connectivityNote.text}</span>
            </p>
          </div>
        )}
      </>
    );
  }

  // Support both new field names (Runtime Brief v2) and legacy field names
  const gradingData = resume.grading_data;
  const criteriaRaw: any[] = gradingData.criterionFeedback || gradingData.criteria || [];
  const criteria = [...criteriaRaw].sort((a, b) => b.weight - a.weight);
  const scoreColors = getScoreColor(resume.overall_score);

  const compellingPoints: string[] = gradingData.strengths || [];
  const areasToImprove: string[] = gradingData.priorityImprovements || gradingData.improvements || [];

  const legacyCompellingPoints = criteriaRaw
    ?.flatMap((c: any) => c.highlights?.filter((h: any) => h.color === "green").map((h: any) => h.text) || [])
    .slice(0, 5) || [];

  const finalCompellingPoints = compellingPoints.length > 0 ? compellingPoints : legacyCompellingPoints;

  const pointsNeeded = 100 - resume.overall_score;
  
  let improvementSuggestions: any[] = [];
  
  // Support both new field name (rewriteSuggestions) and legacy (suggestions)
  const rawSuggestions: any[] = gradingData.rewriteSuggestions || gradingData.suggestions || [];
  if (rawSuggestions.length > 0) {
    const suggestions = rawSuggestions.slice(0, 7);
    const totalSuggestionScore = suggestions.reduce((sum: number, s: any) => sum + (s.potentialScoreIncrease || 0), 0);

    improvementSuggestions = suggestions.map((s: any) => {
      const rawScore = s.potentialScoreIncrease || (pointsNeeded / suggestions.length);
      const normalizedScore = totalSuggestionScore > 0
        ? Math.round((rawScore / totalSuggestionScore) * pointsNeeded)
        : Math.round(pointsNeeded / suggestions.length);

      return {
        original: s.originalText || '',
        criteriaName: s.title || 'Improvement',
        score: normalizedScore,
        feedback: s.issues || s.issuesIdentified || [],
        improved: s.improvedText || s.improvedVersion || '',
        impact: s.impact || s.whyItWorks || '',
      };
    });
  } else {
    const improvementSuggestionsMap = new Map<string, any>();

    criteriaRaw?.forEach((c: any) => {
      const weakPoints = c.highlights?.filter((h: any) => h.color === "yellow" || h.color === "red") || [];
      weakPoints.forEach((h: any) => {
        const key = h.text.trim();
        if (!improvementSuggestionsMap.has(key)) {
          improvementSuggestionsMap.set(key, {
            original: h.text,
            criteriaName: c.name,
            score: Math.round(pointsNeeded / 5),
            feedback: Array.isArray(c.feedback) ? c.feedback : c.feedback?.split('.').filter((s: string) => s.trim()),
          });
        }
      });
    });

    improvementSuggestions = Array.from(improvementSuggestionsMap.values()).slice(0, 7);
  }

  const completedCount = Object.values(checklist).filter(Boolean).length;

  return (
      <div className="container mx-auto px-4 pt-6 pb-12 max-w-7xl">

        {/* Scan-New header-bar (D-10 parity with LinkedInGrader) */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold">Resume Screening Report</h2>
          </div>
          <Button variant="outline" onClick={() => navigate('/upload')} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Analyze New Resume
          </Button>
        </div>

        {/* Premium Report Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Career Intelligence Report</p>
                  <p className="text-sm text-foreground font-medium">{resume.file_name}</p>
                </div>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                Recruiter-grade analysis powered by hiring intelligence
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AnalysisComparisonModal 
                currentAnalysis={{
                  id: resume.id,
                  overall_score: resume.overall_score,
                  grading_data: resume.grading_data,
                  created_at: resume.created_at,
                  file_name: resume.file_name
                }}
                analysisType="resume"
              />
              <Badge variant="outline" className="text-xs px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                Analysis Complete
              </Badge>
            </div>
          </div>
        </motion.div>

        {/* Hero Section - 2 Column Layout */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid md:grid-cols-2 gap-6 mb-8"
        >
          {/* Left Column - Score & Interpretation */}
          <Card className="p-6">
            <div className="flex items-start gap-6">
              {/* Score Badge */}
              <div className={`flex-shrink-0 w-20 h-20 rounded-2xl ${scoreColors.muted} ${scoreColors.border} border-2 flex flex-col items-center justify-center`}>
                <span className={`text-3xl font-black ${scoreColors.text}`}>{resume.overall_score}</span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
              
              {/* Interpretation */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`${scoreColors.muted} ${scoreColors.text} border ${scoreColors.border}`}>
                    {getReadinessLabel(resume.overall_score)}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {getInterpretation(resume.overall_score)}
                </p>
              </div>
            </div>
            
            {/* Quick Stats Grid */}
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-lg font-bold text-foreground">
                  {criteriaRaw.length || 11}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Criteria</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-lg font-bold text-foreground">
                  {resume.grading_data?.suggestions?.length || 0}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Fixes</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-lg font-bold text-primary">
                  +{100 - resume.overall_score}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">To 100</div>
              </div>
            </div>

            {/* Industry Match */}
            {resume.grading_data?.industryGuess && (
              <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Best Industry Match</span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-1">
                  {resume.grading_data.industryGuess}
                </p>
              </div>
            )}


            {/* Progress indicator */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Recruiter Readiness</span>
                <span className={`font-medium ${scoreColors.text}`}>{resume.overall_score}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${scoreColors.bg} rounded-full`}
                  initial={{ width: 0 }}
                  animate={{ width: `${resume.overall_score}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
          </Card>

          {/* Right Column - Executive Summary */}
          <Card className="p-6 bg-gradient-to-br from-card to-muted/20">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Executive Summary</h3>
            </div>
            {(() => {
              const summary = gradingData.executiveSummary || gradingData.summary;
              if (!summary) {
                return <p className="text-sm text-muted-foreground">Analysis summary will appear here.</p>;
              }
              if (typeof summary === 'string') {
                return <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>;
              }
              // Structured format: { keyStrengths, keyGaps, highImpactFix }
              const strengths: string[] = summary.keyStrengths || [];
              const gaps: string[] = summary.keyGaps || [];
              const fix: string = summary.highImpactFix || '';
              return (
                <div className="space-y-3">
                  {strengths.length > 0 && (
                    <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 p-3">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2.5">Key Strengths</p>
                      <div className="space-y-2">
                        {strengths.map((s, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check className="h-2.5 w-2.5 text-emerald-600" />
                            </div>
                            <span className="text-sm text-foreground/80 leading-relaxed">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {gaps.length > 0 && (
                    <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 p-3">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2.5">Key Gaps</p>
                      <div className="space-y-2">
                        {gaps.map((g, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <div className="w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <AlertTriangle className="h-2.5 w-2.5 text-amber-600" />
                            </div>
                            <span className="text-sm text-foreground/80 leading-relaxed">{g}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {fix && (
                    <div className="rounded-lg bg-primary/8 border border-primary/20 p-3">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2.5">High-Impact Fix</p>
                      <div className="flex items-start gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <ArrowRight className="h-2.5 w-2.5 text-primary" />
                        </div>
                        <span className="text-sm text-foreground/80 leading-relaxed">{fix}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        </motion.div>

        {/* Signal Breakdown Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Resume Signals</h3>
            </div>
            <div>
              {criteria.map((c, i) => (
                <SignalBar 
                  key={i}
                  label={c.label || c.name}
                  score={c.score}
                  weight={c.weight}
                />
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Strengths */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="h-4 w-4 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-foreground">Strengths</h3>
              <Badge variant="outline" className="ml-auto text-xs">{finalCompellingPoints.length}</Badge>
            </div>
            <div className="divide-y divide-border/50">
              {finalCompellingPoints.slice(0, 4).map((point: string, idx: number) => (
                <StrengthItem key={idx} text={point} />
              ))}
              {finalCompellingPoints.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No specific strengths identified yet.</p>
              )}
            </div>
          </Card>
        </motion.div>

        {/* 260723-2b0 Task 9: tier-honest Elite rerun CTA (or the neutral unknown-tier
            affordance). Renders only for an Elite account viewing a Free-tier (or unknown)
            analysis. Mounted above the gated sections so it is seen before the reader hits
            them. The component itself decides CTA vs neutral line vs nothing. */}
        {resume?.id && (
          <EliteRerunCta
            sourceResume={resume}
            userTier={userTier}
            unlockStatus={eliteUnlockRunning ? 'running' : streamFailed ? 'error' : 'idle'}
            unlockError={streamFailed ? streamState.error : null}
            backgrounded={unlockBackgrounded}
          />
        )}

        {/* Priority Improvements Section */}
        {(improvementSuggestions.length > 0 || (!showFullResults && areasToImprove.length > 0)) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-8"
          >
            <Card className="p-6 relative">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Priority Improvements</h3>
                </div>
                {showFullResults && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{completedCount}/{improvementSuggestions.length} complete</span>
                    <Badge variant="outline">+{pointsNeeded} pts available</Badge>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                Complete these fixes to raise your recruiter score. Click each item to see specific recommendations.
              </p>

              {showFullResults ? (
                <div className="space-y-3">
                  {improvementSuggestions.map((item, idx) => {
                    const isCompleted = checklist[item.original?.trim()] || false;
                    const matchingRec = recommendations.find(
                      (r) => r.suggestion_text === item.improved || r.suggestion_text === item.original,
                    );

                    return (
                      <div key={idx}>
                        <PriorityCard
                          title={item.criteriaName}
                          impact={item.score}
                          isCompleted={isCompleted}
                          onToggle={() => toggleImprovement(item.original?.trim() || '', isCompleted)}
                          original={item.original}
                          improved={item.improved}
                          feedback={Array.isArray(item.feedback) ? item.feedback : undefined}
                          impactText={item.impact}
                        />
                        <RecommendationActions recommendation={matchingRec} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Show real improvement from backend */}
                  {improvementSuggestions.length > 0 ? (() => {
                    const item = improvementSuggestions[0];
                    const isCompleted = checklist[item.original?.trim()] || false;
                    return (
                      <PriorityCard
                        key="real-0"
                        title={item.criteriaName}
                        impact={item.score}
                        isCompleted={isCompleted}
                        onToggle={() => toggleImprovement(item.original?.trim() || '', isCompleted)}
                        original={item.original}
                        improved={item.improved}
                        feedback={Array.isArray(item.feedback) ? item.feedback : undefined}
                        impactText={item.impact}
                      />
                    );
                  })() : areasToImprove.length > 0 && (
                    <div className="p-4 border rounded-lg bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">Top Priority</span>
                        <Badge variant="outline" className="text-xs">Impact: High</Badge>
                      </div>
                      <p className="text-sm text-foreground/75">{areasToImprove[0]}</p>
                    </div>
                  )}

                  {/* Upgrade divider */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 border-t border-border" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                      <span>{unlockMoreLabel}</span>
                    </div>
                    <div className="flex-1 border-t border-border" />
                  </div>

                  {/* Section-level locked placeholders (one overlay covers all) */}
                  <BlurredLockCard tier="pro" minHeight="min-h-[420px]">
                    <div className="space-y-3">
                      {LOCKED_IMPROVEMENT_PLACEHOLDERS.map((placeholder, idx) => (
                        <div key={`locked-imp-${idx}`} className="p-4 border rounded-lg bg-card">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{placeholder.title}</span>
                            <Badge variant="outline" className="text-xs">Impact: High</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{placeholder.description}</p>
                        </div>
                      ))}
                    </div>
                  </BlurredLockCard>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* Detailed Criteria Breakdown */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="p-6 relative">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Detailed Criteria Analysis</h3>
            </div>

            {showFullResults ? (
              <div className="space-y-6">
                {criteria.map((c, i) => {
                  const cColors = getScoreColor(c.score);
                  const cBarPct = c.score <= 10 ? c.score * 10 : c.score;

                  return (
                    <div key={i} className="border-b border-border/50 pb-6 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{c.label || c.name}</span>
                          <Badge variant="outline" className="text-xs">{c.weight}% weight</Badge>
                        </div>
                        <div className={`px-3 py-1 rounded-full ${cColors.muted} ${cColors.border} border`}>
                          <span className={`font-semibold ${cColors.text}`}>{c.score}</span>
                        </div>
                      </div>

                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                        <motion.div
                          className={`h-full ${cColors.bg} rounded-full`}
                          initial={{ width: 0 }}
                          animate={{ width: `${cBarPct}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                        />
                      </div>

                      <ul className="space-y-2.5 pl-1">
                        {((() => {
                          const f = c.feedback;
                          if (Array.isArray(f)) return f.filter(Boolean);
                          if (f && typeof f === 'object') {
                            return [f.observation, f.impact, f.fix, f.deeper, f.rewrite].filter(Boolean);
                          }
                          if (typeof f === 'string') return f.split('.').map((s: string) => s.trim()).filter(Boolean);
                          return [];
                        })()).map((point: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-foreground/75">
                            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                              idx === 0 ? 'bg-muted text-muted-foreground' :
                              idx === 1 ? 'bg-amber-500/10 text-amber-600' :
                              'bg-primary/10 text-primary'
                            }`}>{idx + 1}</span>
                            <span className="leading-relaxed">{point.trim()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-6">
                {/* C6 Achievement Orientation — fully unlocked */}
                {(() => {
                  const c6 = criteria.find((c: any) => c.id === 'c6_achievement_orientation');
                  if (!c6) return null;
                  const cColors = getScoreColor(c6.score);
                  const cBarPct = c6.score <= 10 ? c6.score * 10 : c6.score;
                  return (
                    <div className="border-b border-border/50 pb-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{c6.label || c6.name}</span>
                          <Badge variant="outline" className="text-xs">{c6.weight}% weight</Badge>
                        </div>
                        <div className={`px-3 py-1 rounded-full ${cColors.muted} ${cColors.border} border`}>
                          <span className={`font-semibold ${cColors.text}`}>{c6.score}</span>
                        </div>
                      </div>

                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                        <motion.div
                          className={`h-full ${cColors.bg} rounded-full`}
                          initial={{ width: 0 }}
                          animate={{ width: `${cBarPct}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>

                      <ul className="space-y-2.5 pl-1">
                        {((() => {
                          const f = c6.feedback;
                          if (Array.isArray(f)) return f.filter(Boolean);
                          if (f && typeof f === 'object') {
                            return [f.observation, f.impact, f.fix, f.deeper, f.rewrite].filter(Boolean);
                          }
                          if (typeof f === 'string') return f.split('.').map((s: string) => s.trim()).filter(Boolean);
                          return [];
                        })()).map((point: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-foreground/75">
                            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 ${
                              idx === 0 ? 'bg-muted text-muted-foreground' :
                              idx === 1 ? 'bg-amber-500/10 text-amber-600' :
                              'bg-primary/10 text-primary'
                            }`}>{idx + 1}</span>
                            <span className="leading-relaxed">{point.trim()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                {/* Section-level locked criteria (one overlay covers all 10) */}
                <BlurredLockCard tier="pro" minHeight="min-h-[640px]">
                  <div className="space-y-4">
                    {LOCKED_CRITERIA_PLACEHOLDERS.map((placeholder, idx) => (
                      <div key={`locked-crit-${idx}`} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium">{placeholder.label}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{placeholder.weight}%</Badge>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 mb-3">
                          <div className="bg-primary/40 h-2 rounded-full" style={{ width: `${placeholder.fakeScore}%` }} />
                        </div>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {placeholder.bullets.map((bullet, bi) => (
                            <li key={bi} className="flex gap-2"><span className="text-muted-foreground/60">--</span>{bullet}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </BlurredLockCard>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
  );
};

export default ResultsPage;
