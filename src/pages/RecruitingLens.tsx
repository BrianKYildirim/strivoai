import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFeatureUsage } from "@/hooks/useFeatureUsage";
import RecommendationActions, { type Recommendation } from "@/components/recommendations/RecommendationActions";
import { useMerits } from "@/hooks/useMerits";
import { useFeatureCosts, getCostForFeature } from "@/hooks/useFeatureCosts";
import { getMeritErrorMessage } from "@/lib/merit-error-messages";
import { MeritCostPreview } from "@/components/MeritCostPreview";
import { LowBalanceWarning } from "@/components/LowBalanceWarning";
import { PriorAnalysisSelector, type ResumePriorAnalysis } from "@/components/PriorAnalysisSelector";
import { PriorLinkedInSelector, type LinkedInPriorSource } from "@/components/PriorLinkedInSelector";
import { PriorSelectorEmptyState } from "@/components/PriorSelectorEmptyState";
import { RecruitingLensTutorialModal } from "@/components/RecruitingLensTutorialModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";
import { LINKEDIN_PDF_ACCEPT, extractDocumentFromPdf, isPdfFile } from "@/lib/document-extraction";
import {
  MSG_JD_TOO_LONG,
  RECRUITING_LENS_JD_MAX_CHARS,
  RECRUITING_LENS_JD_WARN_CHARS,
} from "@/config/document-limits";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { BlurredLockCard } from "@/components/BlurredLockCard";
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import { usePaywallGuard } from "@/hooks/usePaywallGuard";
import { OutOfMeritsModalV2 } from "@/components/topup/OutOfMeritsModalV2";
import { useAnalysisGuard } from "@/hooks/useAnalysisGuard";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import {
  readRecruitingLensResult,
  removeRecruitingLensResult,
  writeRecruitingLensResult,
} from "@/lib/recruiting-lens-result-storage";
import { Badge } from "@/components/ui/badge";
import { BlockedAiEntryPoint } from "@/components/platform/CapabilityGate";
import { isAiBlocked } from "@/lib/platform/capabilities";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Linkedin,
  Upload,
  ChevronDown,
  ChevronUp,
  Route,
  Lightbulb,
  RefreshCw,
  TrendingUp,
  XCircle,
  Copy,
  Lock,
  Crown,
  Briefcase,
  CalendarDays,
} from "lucide-react";

// ── Result types ────────────────────────────────────────────────
interface RecruitingLensSubScore {
  score: number;
  rationale: string;
}

interface RecruitingLensResult {
  preAnalysis: {
    jdKeywords: string[];
    dealBreakers: string[];
    industry: string;
    culture: string;
  };
  overallMatch: {
    score: number;
    label: string;
    summary: string;
  };
  subScores: {
    experienceAlignment: RecruitingLensSubScore;
    skillAlignment: RecruitingLensSubScore;
    impactStrength: RecruitingLensSubScore;
    keywordAndLanguageMatch: RecruitingLensSubScore;
    credibilityAndSeniorityFit: RecruitingLensSubScore;
  };
  recruiterVerdict: string;
  scoreRationale: Array<{
    category: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  topGaps: Array<{
    title: string;
    severity: string;
    whyItMatters: string;
    howItShowsUp: string;
    fixPriority: string;
  }>;
  roadmap: Array<{
    stage: string;
    action: string;
    why: string;
    expectedImpact: string;
  }>;
  resumeEdits: Array<{
    original?: string | null;
    rewritten: string;
    qualityGates?: Record<string, boolean>;
  }>;
  linkedinImprovements?: Array<{
    area: string;
    suggestion: string;
  }>;
  strategicAdvice: {
    applyNow: boolean;
    summary: string;
    biggestScoreMover: string;
  };
  keywords: {
    matched: string[];
    missing: string[];
  };
  quickFixes: string[];
  analysisId?: string;
}

interface SavedRecruitingLensJob {
  id: string;
  role_applied: string;
  company_applied: string;
  created_at: string;
  jd_id: string | null;
  location: string | null;
}

const TUTORIAL_STORAGE_KEY = 'recruiting-lens-tutorial-dismissed';

const SUB_SCORE_LABELS: Record<keyof RecruitingLensResult['subScores'], string> = {
  experienceAlignment: 'Experience Alignment',
  skillAlignment: 'Skill Alignment',
  impactStrength: 'Impact Strength',
  keywordAndLanguageMatch: 'Keyword & Language Match',
  credibilityAndSeniorityFit: 'Credibility & Seniority Fit',
};

const STAGE_LABELS: Record<string, string> = {
  immediate: 'Immediate',
  'short-term': 'Short-Term',
  'medium-term': 'Medium-Term',
  'long-term': 'Long-Term',
};

const scoreColor = (score: number) =>
  score >= 75 ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 55 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

const scoreStroke = (score: number) =>
  score >= 75 ? 'hsl(142, 71%, 45%)'
    : score >= 55 ? 'hsl(38, 92%, 50%)'
    : 'hsl(0, 72%, 51%)';

const severityColor = (severity: string) => {
  const s = severity.toLowerCase();
  if (s === 'high' || s === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'medium' || s === 'moderate') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

// ── Resume summary builder ──────────────────────────────────────
// Extracts a structured text summary from raw_response for the edge function.
// Uses actual analysis_results raw_response fields (NOT hardSkills/softSkills).
function buildResumeSummary(rawResponse: Record<string, unknown>): string {
  const parts: string[] = [];

  const executiveSummary = asRecord(rawResponse.executiveSummary);
  if (executiveSummary) {
    const keyStrengths = asStringArray(executiveSummary.keyStrengths);
    const keyGaps = asStringArray(executiveSummary.keyGaps);
    if (keyStrengths.length) parts.push(`Key Strengths: ${keyStrengths.join('; ')}`);
    if (keyGaps.length) parts.push(`Key Gaps: ${keyGaps.join('; ')}`);
    if (typeof executiveSummary.highImpactFix === 'string') parts.push(`Highest Impact Fix: ${executiveSummary.highImpactFix}`);
  }

  const strengths = asStringArray(rawResponse.strengths);
  if (strengths.length) {
    parts.push(`Strengths: ${strengths.join('; ')}`);
  }

  if (typeof rawResponse.industryGuess === 'string') {
    parts.push(`Industry: ${rawResponse.industryGuess}`);
  }

  const suggestedTargetRoles = asStringArray(rawResponse.suggestedTargetRoles);
  if (suggestedTargetRoles.length) {
    parts.push(`Target Roles: ${suggestedTargetRoles.join(', ')}`);
  }

  const recommendedKeywords = asStringArray(rawResponse.recommendedKeywords);
  if (recommendedKeywords.length) {
    parts.push(`Key Skills/Keywords: ${recommendedKeywords.slice(0, 15).join(', ')}`);
  }

  if (Array.isArray(rawResponse.criterionFeedback)) {
    const topScores = rawResponse.criterionFeedback
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
      .slice(0, 5)
      .map((c) => `${String(c.label ?? 'Criterion')}: ${Number(c.score) || 0}/100`)
      .join(', ');
    if (topScores) parts.push(`Top Criteria Scores: ${topScores}`);
  }

  if (typeof rawResponse.overallScore === 'number') {
    parts.push(`Overall Resume Score: ${rawResponse.overallScore}/100`);
  }

  // Fallback: if structured extraction yields < 50 chars, use full JSON
  const result = parts.join('\n\n');
  return result.length >= 50 ? result : JSON.stringify(rawResponse).slice(0, 5000);
}

// The `stageLabels` ladder for the analyzing overlay. Module level is load-bearing:
// UniversalAnalyzing keys its timed step advance off the label count, and an array
// rebuilt every render would restart that timer.
const RECRUITING_LENS_STAGE_LABELS: readonly string[] = [
  'Analyzing job description',
  'Reading your professional profile',
  'Evaluating match and gaps',
  'Building your action roadmap',
  'Generating strategic insights',
] as const;

// ── Component ───────────────────────────────────────────────────
const RecruitingLensPage = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getEffectiveTier } = useAdminTierTest();

  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>('free');
  const [hasAnalyzedResume, setHasAnalyzedResume] = useState(false);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeSummary, setResumeSummary] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [isLinkedinExpanded, setIsLinkedinExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showTryAgain, setShowTryAgain] = useState(false);
  const [savedJobs, setSavedJobs] = useState<SavedRecruitingLensJob[]>([]);
  const [isLoadingSavedJobs, setIsLoadingSavedJobs] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [pendingTutorialSubmit, setPendingTutorialSubmit] = useState(false);
  const [hasDismissedTutorial, setHasDismissedTutorial] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
  });
  const [result, setResult] = useState<RecruitingLensResult | null>(() => {
    return readRecruitingLensResult<RecruitingLensResult>(userId);
  });
  const linkedinFileRef = useRef<HTMLInputElement>(null);
  const jobDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const submitGuard = useSubmitGuard({
    feature: 'recruiting-lens',
    inputIdentity: `${companyName.trim()}:${roleTitle.trim()}:${jobDescription.trim()}:${resumeSummary}`,
  });

  // L3 telemetry + recommendations
  const { recordEvent } = useFeatureUsage('recruiting_lens');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const recShownFiredRef = useRef(false);

  const isFormReady =
    hasAnalyzedResume &&
    !!companyName.trim() &&
    !!roleTitle.trim() &&
    !!jobDescription.trim();

  const markTutorialDismissed = useCallback(() => {
    setHasDismissedTutorial(true);
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    } catch {
      // localStorage can be unavailable in private or embedded contexts.
    }
  }, []);

  const fetchSavedJobs = useCallback(async (userId?: string) => {
    setIsLoadingSavedJobs(true);
    try {
      const resolvedUserId = userId ?? (await supabase.auth.getUser()).data.user?.id;
      if (!resolvedUserId) {
        setSavedJobs([]);
        return;
      }
      // Phase 42 Plan 42-10: canonical filter shifted to application_source='recruiting_lens'.
      // Legacy rows (backfilled from 42-08) had application_source='other' + location='Recruiting Lens';
      // they will not appear here until a future migration backfills application_source.
      const { data, error } = await supabase
        .from('applications')
        .select('id, role_applied, company_applied, created_at, jd_id, location')
        .eq('user_id', resolvedUserId)
        .eq('application_source', 'recruiting_lens')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      setSavedJobs((data ?? []) as SavedRecruitingLensJob[]);
    } catch (err) {
      console.error('[RecruitingLens] saved jobs load failed:', err);
      setSavedJobs([]);
    } finally {
      setIsLoadingSavedJobs(false);
    }
  }, []);

  const handleSavedJobOpen = useCallback((job: SavedRecruitingLensJob) => {
    if (!job.jd_id) return;
    setSearchParams({ id: job.jd_id });
  }, [setSearchParams]);

  // ── Data fetch on mount ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Parallel: profile + primary resume (independent)
      const [profileResult, primaryResumeResult] = await Promise.all([
        supabase.from('profiles')
          .select('subscription_tier')
          .eq('id', userId).single(),
        supabase.from('resumes')
          .select('file_name, grading_data')
          .eq('user_id', userId)
          .not('grading_data', 'is', null)
          .order('analyzed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setTier(getEffectiveTier(profileResult.data?.subscription_tier || 'free'));

      let rawResp: Record<string, unknown> | null = null;
      let filename: string | null = null;

      if (primaryResumeResult.data?.grading_data) {
        rawResp = primaryResumeResult.data.grading_data as Record<string, unknown>;
        filename = primaryResumeResult.data.file_name ?? null;
      } else {
        // Fallback: legacy MinimalHero users (analysis_results only)
        const { data: fallbackAnalysis } = await supabase
          .from('analysis_results')
          .select('raw_response, source_reference')
          .eq('user_id', userId)
          .eq('analysis_type', 'resume_analysis')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackAnalysis?.raw_response && typeof fallbackAnalysis.raw_response === 'object') {
          rawResp = fallbackAnalysis.raw_response as Record<string, unknown>;
          console.log('[RecruitingLens] Using analysis_results fallback path');

          // Filename lookup via source_reference (resume_id) with defense-in-depth user_id check
          if (fallbackAnalysis.source_reference) {
            const { data: resumeRow } = await supabase
              .from('resumes')
              .select('file_name')
              .eq('id', fallbackAnalysis.source_reference)
              .eq('user_id', userId)
              .maybeSingle();
            filename = resumeRow?.file_name ?? null;
          }
        }
      }

      const hasAnalysis = !!rawResp;
      setHasAnalyzedResume(hasAnalysis);
      setResumeFilename(filename);
      setResumeSummary(hasAnalysis ? buildResumeSummary(rawResp!) : '');
      await fetchSavedJobs(userId);
      setLoading(false);
    };
    init();
    // Re-run for admin tier changes and for the authenticated-user seam. The outer
    // user-id key remounts every local state owner before this account's reads begin.
  }, [userId, getEffectiveTier, fetchSavedJobs]);

  // 22-05 D-22: Deep-link hydration from AnalysisHistory (?id=<run_id>).
  // Queries analysis_results filtered by analysis_type='recruiting_lens'.
  // Pitfall 6: Free/Pro tiers have no persisted row (Elite-only) — silent degrade
  // to input view with informational toast, NOT an "Analysis not found" error.
  const idFromUrl = searchParams.get('id');

  useEffect(() => {
    if (!idFromUrl) return;
    if (!/^[0-9a-f-]{36}$/i.test(idFromUrl)) {
      toast.error('Analysis not found');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('id', idFromUrl)
        .eq('user_id', userId)
        .eq('analysis_type', 'recruiting_lens')
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        // Pitfall 6: Pro/Free runs have no row; silent-degrade to input view.
        toast.message("This analysis wasn't saved — run a fresh match to regenerate.");
        return;
      }
      // Payload column: analysis_results.raw_response (jsonb) — pinned.
      // WR-06 fix: minimal structural guard so truncated or drifted rows
      // don't crash the renderer when required top-level keys are missing.
      const raw = data.raw_response as unknown;
      const isValidShape =
        !!raw &&
        typeof raw === 'object' &&
        typeof (raw as { preAnalysis?: unknown }).preAnalysis === 'object' &&
        typeof (raw as { overallMatch?: unknown }).overallMatch === 'object' &&
        typeof (raw as { subScores?: unknown }).subScores === 'object' &&
        typeof (raw as { recruiterVerdict?: unknown }).recruiterVerdict === 'string';
      if (!isValidShape) {
        console.error('[RecruitingLens] hydration: raw_response failed shape check', { id: idFromUrl });
        toast.error("Couldn't load this analysis");
        return;
      }
      setResult(raw as RecruitingLensResult);
    })();
    return () => { cancelled = true; };
  }, [idFromUrl, userId]);

  // ── LinkedIn PDF upload handler ────────────────────────────────
  const handleLinkedinPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPdfFile(file)) {
      toast.error('Please upload a LinkedIn PDF file.');
      if (linkedinFileRef.current) linkedinFileRef.current.value = '';
      return;
    }

    try {
      const extraction = await extractDocumentFromPdf({
        file,
        documentType: 'linkedin_profile',
      });
      const text = extraction.text;
      setLinkedinText(text);
      toast.success(`Extracted text from ${file.name}`);
    } catch (err) {
      toast.error('We could not read this LinkedIn PDF reliably. Please upload a text-based PDF.');
    }
    // Reset the input so the same file can be re-selected
    if (linkedinFileRef.current) linkedinFileRef.current.value = '';
  };

  const handleResumePriorSelect = useCallback((prior: ResumePriorAnalysis) => {
    setHasAnalyzedResume(true);
    setResumeFilename(prior.fileName);
    setResumeSummary(buildResumeSummary(prior.gradingData));
  }, []);

  const handleLinkedInPriorSelect = useCallback((source: LinkedInPriorSource) => {
    if (source.content) {
      setLinkedinText(source.content);
      setIsLinkedinExpanded(true);
    }
  }, []);

  const { canAnalyze, triggerPaywall, modalProps, openModal, refresh: refreshPaywall } = usePaywallGuard();
  const { startAnalysis, cancelAnalysis } = useAnalysisGuard();
  // D-06 refresh recovery — DORMANT unless VITE_FEATURE_ANALYSIS_LIFECYCLE is on
  // (startRun is an inert no-op while off, so no behavior change today). When the edge
  // response carries run_id, tracking it lets a refresh/navigation recover the run.
  const { startRun } = useAnalysisRun();
  const { isZero, canAfford, optimisticDeduct } = useMerits();
  const { data: featureCosts } = useFeatureCosts();

  // ── Cleanup on unmount — cancel any in-flight analysis ─────────
  useEffect(() => {
    return () => {
      cancelAnalysis();
    };
  }, [cancelAnalysis]);

  // L3: fire 'open' on mount
  useEffect(() => {
    recordEvent('open');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fire 'view_results' once when result sub-tree becomes visible
  useEffect(() => {
    if (result) {
      recordEvent('view_results');
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fetch recommendations + mark shown once when result is ready
  useEffect(() => {
    if (!result?.analysisId || recShownFiredRef.current) return;
    recShownFiredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('recommendations')
          .select('*')
          .eq('feature', 'recruiting_lens')
          .eq('source_version_id', result.analysisId!);
        if (cancelled || error || !data || data.length === 0) return;
        setRecommendations(data as Recommendation[]);
        const recIds = data.map((r: Recommendation) => r.id);
        await supabase.rpc('record_recommendations_shown', { rec_ids: recIds });
      } catch (err) {
        console.error('[RecruitingLens] recommendations fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [result?.analysisId]);

  // ── Analyze handler ────────────────────────────────────────────
  // reuseNonce=true is the "Try Again" retry path (same input → same nonce → dedup);
  // the default (false) is a deliberate NEW analyze and mints a fresh nonce (FEAT-04).
  const executeAnalyze = async (reuseNonce = false) => {
    const submitToken = submitGuard.beginSubmit();
    if (!submitToken) return;
    let completed = false;
    try {
    // Credits check
    if (!canAnalyze) {
      triggerPaywall();
      return;
    }

    setIsAnalyzing(true);
    setShowTryAgain(false);
    recordEvent('submit');

    // D-03: optimistic decrement before the network call; one settle closure.
    const cost = getCostForFeature(featureCosts, 'recruiting_lens', tier) ?? 0;
    const settle = optimisticDeduct(cost);

    const result = await startAnalysis(async (_signal) => {
      const { data, error } = await invokeWithTimeout('recruiting-lens', {
        body: {
          resumeSummary: resumeSummary,
          company: companyName.trim(),
          roleTitle: roleTitle.trim(),
          jobDescription: jobDescription.trim(),
          linkedinText: linkedinText.trim() || undefined,
          attemptNonce: submitToken.attemptNonce,
        },
      }, 160000); // 160s covers Elite tier timeout (155s) + buffer

      if (error) {
        // Check for structured error responses in data
        if (data && typeof data === 'object' && 'error' in data) {
          const errorData = data as { error?: string; retryAfter?: number; message?: string };
          const errCode = errorData.error;
          if (errCode === 'rate_limit_exceeded') {
            const retryAfter = errorData.retryAfter ?? 60;
            throw new Error(`Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.`);
          }
          if (errCode === 'usage_limit_reached') {
            throw new Error(errorData.message || 'Usage limit reached. Upgrade to continue.');
          }
          if (errCode === 'invalid_input') {
            jobDescriptionRef.current?.focus();
            throw new Error(errorData.message || 'Invalid input. Please check your job description.');
          }
        }
        // Check for timeout
        if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
          throw new Error('Analysis timed out. Please try again.');
        }
        throw new Error(error.message || 'Analysis failed. Please try again.');
      }

      return data;
    });

    setIsAnalyzing(false);

    if (result.success && result.data) {
      const analysis = result.data as RecruitingLensResult;
      setResult(analysis);
      // D-06 additive recovery: when the lifecycle path returns a run_id, track it so a
      // refresh/navigation recovers the run (inert while the VITE flag is off). The
      // inline setResult above remains the source of truth for the synchronous result.
      const runId = (result.data as { run_id?: string }).run_id;
      if (runId) startRun(runId);
      settle.commit();
      writeRecruitingLensResult(userId, analysis);
      toast.success('Analysis complete!');
      completed = true;
      refreshPaywall();
      await fetchSavedJobs(userId);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (result.error) {
      console.error('[RecruitingLens] analysis error:', result.error);
      // D-02 / NFR-04: rollback + error-class-keyed copy. The wrapper surfaces
      // result.error as a string; derive a status from it when an HTTP code is
      // embedded, otherwise fall back to the refundable 5xx class.
      settle.rollback();
      const status =
        (result as { status?: number }).status ??
        (/\b(4\d\d|5\d\d)\b/.test(result.error)
          ? Number((result.error.match(/\b(4\d\d|5\d\d)\b/) ?? [])[0])
          : 500);
      const { title, description } = getMeritErrorMessage(status);
      toast.error(title, description ? { description } : undefined);
      setShowTryAgain(true);
      // jobDescription and linkedinText state are NOT reset — D-10 requirement
    }
    } finally {
      setIsAnalyzing(false);
      submitGuard.endSubmit(submitToken, { resetAttempt: completed });
    }
  };

  // XDEV-01 / D-07 — see the note in `src/pages/Upload.tsx`. In `degraded` tier the
  // live CTA below is REPLACED by BlockedAiEntryPoint, so `handleAnalyze` is never
  // reachable and no run, Merit reservation or request can be created.
  const aiBlocked = isAiBlocked();

  const handleAnalyze = async () => {
    if (
      isAnalyzing
      || isZero
      || !canAfford(getCostForFeature(featureCosts, 'recruiting_lens', tier) ?? 0)
    ) {
      return;
    }
    if (!isFormReady) {
      toast.error('Company name, role title, job description, and resume context are required.');
      return;
    }

    if (!hasDismissedTutorial) {
      setPendingTutorialSubmit(true);
      setShowTutorial(true);
      return;
    }

    await executeAnalyze();
  };

  const handleTutorialStart = async () => {
    markTutorialDismissed();
    setShowTutorial(false);
    if (pendingTutorialSubmit) {
      setPendingTutorialSubmit(false);
      await executeAnalyze();
    }
  };

  const handleTutorialSkip = () => {
    markTutorialDismissed();
    setPendingTutorialSubmit(false);
    setShowTutorial(false);
  };

  // ── Loading state ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-viewport bg-background">
        <div className="container mx-auto px-4 pt-6 pb-16 max-w-7xl">
          <div className="mb-8">
            <Skeleton className="h-10 w-64 max-w-full mb-2" />
            {/* w-80 is a fixed 320px; inside the container's px-4 padding that pushed the
                page to a 408px scrollWidth at a 390px viewport, scrolling the whole document
                sideways while the page loaded. max-w-full lets it shrink on narrow screens
                and is a no-op anywhere it already fits. */}
            <Skeleton className="h-5 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8">
            <div>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="min-h-[280px] w-full" />
            </div>
            <div>
              <Skeleton className="h-24 w-full mb-4" />
              <Button className="w-full" disabled>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing...
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Free-tier gate ─────────────────────────────────────────────
  if (tier === 'free') {
    return (
      <div className="min-h-viewport bg-background">
        <div className="container mx-auto px-4 pt-6 pb-16 max-w-7xl">
          <ProFeatureGate
            featureName="Recruiting Lens"
            featureIcon={<Target className="h-8 w-8" />}
            featureColor="hsl(var(--primary))"
            description="See how recruiters evaluate your profile against any job posting."
            benefits={[
              "Recruiter-grade match score",
              "Gap analysis with fix priority",
              "Ready-to-paste resume bullet rewrites",
              "Strategic action roadmap",
            ]}
          />
        </div>
      </div>
    );
  }

  // ── Ready / Blocker state (Pro/Elite) ──────────────────────────
  return (
    <div className="min-h-viewport bg-background">

      {/* UniversalAnalyzing overlay — wired in Plan 02 */}
      <UniversalAnalyzing
        isAnalyzing={isAnalyzing}
        title="Analyzing Your Match"
        icon={<Target className="w-8 h-8 text-primary" />}
        stageLabels={RECRUITING_LENS_STAGE_LABELS}
      />

      <div className="container mx-auto px-4 pt-24 pb-16 max-w-7xl">
        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              Recruiting Lens
            </h1>
            <p className="text-muted-foreground mt-2">
              See how a recruiter evaluates your profile against this specific role.
            </p>
          </div>
        </motion.div>

        {result ? (
          <RecruitingLensResultsView
            result={result}
            tier={tier}
            roleTitle={roleTitle}
            companyName={companyName}
            recommendations={recommendations}
            onAnalyzeAnother={() => {
              setResult(null);
              setCompanyName('');
              setRoleTitle('');
              setJobDescription('');
              setLinkedinText('');
              setShowTryAgain(false);
              recShownFiredRef.current = false;
              setRecommendations([]);
              removeRecruitingLensResult(userId);
            }}
          />
        ) : (
        <>
        {/* Two-column layout */}
        <div
          className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8"
          aria-busy={submitGuard.isSubmitting}
        >

          {/* Left column — inputs */}
          <div className="space-y-6">
            <PriorAnalysisSelector
              onSelect={handleResumePriorSelect}
              emptyState={null}
            />
            <PriorLinkedInSelector
              onSelect={handleLinkedInPriorSelect}
              emptyState={
                <PriorSelectorEmptyState
                  headingText="No LinkedIn source yet"
                  bodyText="Add your LinkedIn for a sharper match - optional."
                  ctaLabel="Add LinkedIn"
                  ctaHref="/linkedin-grader"
                  blocking={false}
                />
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company-name" className="mb-2 block">
                  Company name <span className="text-xs text-muted-foreground">(required)</span>
                </Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Acme"
                  maxLength={120}
                  aria-describedby="company-name-help"
                />
                <p id="company-name-help" className="mt-1 text-xs text-muted-foreground">
                  Used to label saved reports and anchor the recruiter context.
                </p>
              </div>
              <div>
                <Label htmlFor="role-title" className="mb-2 block">
                  Role title <span className="text-xs text-muted-foreground">(required)</span>
                </Label>
                <Input
                  id="role-title"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g., Product Manager"
                  maxLength={160}
                  aria-describedby="role-title-help"
                />
                <p id="role-title-help" className="mt-1 text-xs text-muted-foreground">
                  Shown on saved tiles and included in the match analysis.
                </p>
              </div>
            </div>
            {/* Job Description */}
            <div>
              <Label htmlFor="job-description" className="block text-sm font-medium text-foreground mb-1">
                Job Description{' '}
                <span className="text-xs text-muted-foreground">(required)</span>
              </Label>
              <Textarea
                ref={jobDescriptionRef}
                id="job-description"
                placeholder="Paste the job description here..."
                maxLength={RECRUITING_LENS_JD_MAX_CHARS}
                className="min-h-[200px] md:min-h-[280px] resize-y"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                aria-describedby="job-description-help job-description-count"
              />
              <p
                id="job-description-help"
                className="mt-1 text-xs text-muted-foreground"
              >
                {MSG_JD_TOO_LONG}
              </p>
              <p
                id="job-description-count"
                className="text-right text-xs text-muted-foreground tabular-nums mt-1"
              >
                <span className={jobDescription.length > RECRUITING_LENS_JD_WARN_CHARS ? 'text-destructive' : ''}>
                  {jobDescription.length}/{RECRUITING_LENS_JD_MAX_CHARS.toLocaleString()}
                </span>
              </p>
            </div>

            {/* LinkedIn collapsible */}
            <Collapsible
              open={isLinkedinExpanded}
              onOpenChange={setIsLinkedinExpanded}
              className="mt-6"
            >
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                  <Linkedin className="w-4 h-4" />
                  <span>Add LinkedIn profile (optional)</span>
                  {isLinkedinExpanded
                    ? <ChevronUp className="w-4 h-4 ml-auto" />
                    : <ChevronDown className="w-4 h-4 ml-auto" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => linkedinFileRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {linkedinText ? 'Replace LinkedIn PDF' : 'Upload LinkedIn PDF'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    LinkedIn Profile &gt; Resources &gt; Save to PDF. Paste input is no longer supported.
                  </p>
                  {linkedinText && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      LinkedIn PDF text loaded
                    </p>
                  )}
                  <input
                    ref={linkedinFileRef}
                    type="file"
                    accept={LINKEDIN_PDF_ACCEPT}
                    className="hidden"
                    onChange={handleLinkedinPdfUpload}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Right column — resume context + CTA */}
          <div>
            {hasAnalyzedResume ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <Card className="bg-secondary/50 border border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium text-foreground truncate"
                        title={resumeFilename || ''}
                      >
                        Using:{' '}
                        {resumeFilename && resumeFilename.length > 32
                          ? resumeFilename.slice(0, 32) + '...'
                          : resumeFilename}
                      </p>
                      <p className="text-xs text-muted-foreground">Resume analysis detected</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <PriorSelectorEmptyState
                  headingText="No resume analysis found"
                  bodyText="Analyze your resume first to unlock Recruiting Lens."
                  ctaLabel="Analyze My Resume"
                  ctaHref="/upload"
                  blocking
                />
              </motion.div>
            )}

            {/* Analyze Match button */}
            <LowBalanceWarning />
            <MeritCostPreview featureCost={getCostForFeature(featureCosts, 'recruiting_lens', tier) ?? 0} />
            {aiBlocked ? (
              <BlockedAiEntryPoint label="Analyze Job" className="w-full mt-4" />
            ) : (
            <Button
              className="w-full mt-4"
              aria-disabled={!isFormReady || submitGuard.isSubmitting || isZero || !canAfford(getCostForFeature(featureCosts, 'recruiting_lens', tier) ?? 0)}
              onClick={handleAnalyze}
            >
              {isAnalyzing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing...</>
              ) : (
                <><Target className="w-4 h-4 mr-2" /> Analyze Job</>
              )}
            </Button>
            )}
            {!isFormReady && (
              <p className="mt-2 text-xs text-muted-foreground">
                Add a resume analysis, company name, role title, and job description to continue.
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setShowTutorial(true)}
            >
              View tutorial
            </Button>

            {/* Try Again button — shown after error (fully wired in Plan 02) */}
            <AnimatePresence>
              {showTryAgain && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => { setShowTryAgain(false); void executeAnalyze(true); }}
                  >
                    Try Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hidden: resumeSummary is populated for edge function use in Plan 02 */}
            <input type="hidden" value={resumeSummary} />
          </div>
        </div>
        <section className="mt-10" aria-labelledby="saved-recruiting-lens-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="saved-recruiting-lens-heading" className="text-xl font-semibold text-foreground">
                Saved analyses
              </h2>
              <p className="text-sm text-muted-foreground">
                Saved job match reports will appear after you analyze a company, role, and job description.
              </p>
            </div>
          </div>
          {isLoadingSavedJobs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : savedJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => handleSavedJobOpen(job)}
                  className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`Open ${job.company_applied} ${job.role_applied} match report`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{job.company_applied}</p>
                      <p className="text-sm text-muted-foreground truncate">{job.role_applied}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(job.created_at).toLocaleDateString()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      Recruiting Lens
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Briefcase className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium text-foreground">No saved analyses yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Run an analysis to see saved work here. Prior selectors appear automatically when resume or LinkedIn sources are available.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
        </>
        )}
      </div>

      {/* UX-04: Out-of-merits modal driven by usePaywallGuard */}
      <RecruitingLensTutorialModal
        open={showTutorial}
        onOpenChange={(open) => {
          if (!open) handleTutorialSkip();
          else setShowTutorial(true);
        }}
        onStart={handleTutorialStart}
        onSkip={handleTutorialSkip}
      />
      <OutOfMeritsModalV2 {...modalProps} />
    </div>
  );
};

// ── Results view ────────────────────────────────────────────────
interface ResultsViewProps {
  result: RecruitingLensResult;
  tier: string;
  roleTitle?: string;
  companyName?: string;
  onAnalyzeAnother: () => void;
  recommendations?: Recommendation[];
}

const RecruitingLensResultsView = ({
  result,
  tier,
  roleTitle,
  companyName,
  onAnalyzeAnother,
  recommendations = [],
}: ResultsViewProps) => {
  const navigate = useNavigate();
  const isElite = tier === 'elite';
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [expandedScores, setExpandedScores] = useState<Set<string>>(() => new Set());
  const copyToClipboard = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Copy failed');
    }
  };

  const score = result.overallMatch?.score ?? 0;
  const circumference = 2 * Math.PI * 52;
  const visibleGaps = isElite
    ? (showAllGaps ? result.topGaps : result.topGaps?.slice(0, 3))
    : result.topGaps?.slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Your Recruiting Lens Match
        </h2>
      </div>

      {/* Match summary */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.08] shadow-2xl shadow-primary/[0.07] before:absolute before:-right-20 before:-top-24 before:h-64 before:w-64 before:rounded-full before:bg-primary/10 before:blur-3xl">
        <CardContent className="p-0">
          <div className="relative grid items-center md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex flex-col items-center justify-center border-b border-border/40 p-6 md:border-b-0 md:border-r md:p-8">
              <div className="relative shrink-0">
                <svg className="h-36 w-36" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
                  <motion.circle
                    cx="60" cy="60" r="52" fill="none"
                    strokeWidth="7" strokeLinecap="round"
                    stroke={scoreStroke(score)}
                    strokeDasharray={`${circumference}`}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - score / 100) }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    className={`text-4xl font-black ${scoreColor(score)}`}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, type: "spring" }}
                  >
                    {score}
                  </motion.span>
                  <span className="text-xs font-medium text-muted-foreground">/ 100</span>
                </div>
              </div>
              <p className="mt-4 text-base font-semibold text-foreground">{result.overallMatch?.label}</p>
            </div>

            <div className="p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.overallMatch?.label}</Badge>
                <Badge className={result.strategicAdvice?.applyNow
                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                  : "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"}
                >
                  {result.strategicAdvice?.applyNow ? (
                    <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Likely proceed</>
                  ) : (
                    <><AlertCircle className="mr-1 h-3.5 w-3.5" /> Strengthen First</>
                  )}
                </Badge>
                {(roleTitle || companyName) && (
                  <span className="text-sm text-muted-foreground">
                    {[roleTitle, companyName].filter(Boolean).join(' at ')}
                  </span>
                )}
              </div>
              <p className="mt-5 max-w-3xl text-lg font-medium leading-7 text-foreground md:text-xl md:leading-8">
                {result.overallMatch?.summary || result.recruiterVerdict}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full recruiter verdict */}
      {result.recruiterVerdict && (
        <Card className="border-border/60 bg-card/70 shadow-sm backdrop-blur">
          <CardContent className="p-6 md:p-8">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">Recruiter Verdict</h3>
            <p className="mt-4 max-w-4xl whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
              {result.recruiterVerdict}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sub-scores */}
      {result.subScores && (
        <section id="score" className="scroll-mt-24">
          <h3 className="mb-4 text-xl font-semibold text-foreground">Score Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(SUB_SCORE_LABELS) as Array<keyof typeof SUB_SCORE_LABELS>).map((key) => {
              const sub = result.subScores[key];
              if (!sub) return null;
              return (
                <Card key={key} className="border border-border/70 bg-card/80 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{SUB_SCORE_LABELS[key]}</span>
                      <span className={`text-lg font-bold ${scoreColor(sub.score)}`}>{sub.score}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: scoreStroke(sub.score) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${sub.score}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                    {!expandedScores.has(key) && (
                      <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
                        {sub.rationale.split(/(?<=[.!?])\s+/)[0]}
                      </p>
                    )}
                    <Collapsible
                      open={expandedScores.has(key)}
                      onOpenChange={(open) => setExpandedScores((current) => {
                        const next = new Set(current);
                        if (open) next.add(key); else next.delete(key);
                        return next;
                      })}
                    >
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="mt-2 h-7 w-full justify-between px-0 text-xs">
                          Full reasoning <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <p className="mt-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                          {sub.rationale}
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Upgrade divider for Pro users */}
      {!isElite && (
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 border-t border-border" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Upgrade to Elite for full recruiter analysis</span>
          </div>
          <div className="flex-1 border-t border-border" />
        </div>
      )}

      {/* Top gaps */}
      {result.topGaps && result.topGaps.length > 0 && (
        <section id="gaps" className="scroll-mt-24">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Top Gaps to Address
              </h3>
            </div>
            <Badge variant="outline">{result.topGaps.length} identified</Badge>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur">
            {visibleGaps.map((gap, i) => (
              <div key={i} className="border-b border-border/50 p-4 last:border-b-0 md:p-5">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-700 dark:text-amber-400">{i + 1}</span>
                      <h4 className="font-semibold text-foreground">{gap.title}</h4>
                    </div>
                    <Badge className={severityColor(gap.severity)}>{gap.severity}</Badge>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Why it matters: </span>
                      {gap.whyItMatters}
                    </p>
                    {isElite ? (
                      <>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">How it shows up: </span>
                          {gap.howItShowsUp}
                        </p>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Fix priority: </span>
                          {gap.fixPriority}
                        </p>
                        <Button variant="ghost" size="sm" asChild className="mt-1 h-8 px-0 text-primary">
                          <a href="#fixes">See fix</a>
                        </Button>
                      </>
                    ) : (
                      <p className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                        Elite reveals how this gap appears and its recommended fix priority.
                      </p>
                    )}
                  </div>
              </div>
            ))}
            {isElite && result.topGaps.length > 3 && (
              <Button variant="ghost" onClick={() => setShowAllGaps((current) => !current)} className="w-full rounded-none border-t border-border/50">
                {showAllGaps ? 'Show top 3 gaps' : `Show ${result.topGaps.length - 3} more gaps`}
                {showAllGaps ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Quick fixes */}
      {result.quickFixes && result.quickFixes.length > 0 && (
        isElite ? (
          <section id="fixes" className="scroll-mt-24">
              <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                Quick Fixes
              </h3>
              <ol className="grid overflow-hidden rounded-2xl border border-border/60 bg-card/60 md:grid-cols-2">
                {result.quickFixes.map((fix, i) => (
                  <li key={i} className="flex items-start gap-3 border-b border-border/50 p-4 text-sm last:border-b-0 md:border-r md:[&:nth-child(even)]:border-r-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                    <span className="leading-relaxed text-foreground">{fix}</span>
                  </li>
                ))}
              </ol>
          </section>
        ) : (
          <BlurredLockCard className="scroll-mt-24" tier="elite">
            <div id="fixes" className="p-5 text-center">
              <Lightbulb className="mx-auto h-5 w-5 text-primary" />
              <h4 className="mt-2 font-semibold">Quick fixes are available with Elite</h4>
            </div>
          </BlurredLockCard>
        )
      )}

      {/* Resume edits */}
      {result.resumeEdits && result.resumeEdits.length > 0 && (
        <section id="rewrites" className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Paste-Ready Resume Rewrites
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(
                (isElite ? result.resumeEdits : result.resumeEdits.slice(0, 2)).map((edit) => edit.rewritten).join('\n\n'),
                'Strongest rewrites copied',
              )}
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Copy strongest rewrites
            </Button>
          </div>
          <div className="space-y-3">
            {(isElite ? result.resumeEdits : result.resumeEdits.slice(0, 2)).map((edit, i) => (
              <Card key={i} className="overflow-hidden border border-border/60 bg-card/70 shadow-sm transition-colors hover:border-primary/20">
                <CardContent className="grid gap-0 p-0 md:grid-cols-2">
                  {edit.original && (
                    <div className="border-b border-border/60 bg-muted/20 p-5 md:border-b-0 md:border-r">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Original</p>
                      <p className="text-sm leading-relaxed text-muted-foreground line-through decoration-muted-foreground/50">{edit.original}</p>
                    </div>
                  )}
                  <div className={`p-5 ${edit.original ? '' : 'md:col-span-2'}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-primary">Recruiter-ready</p>
                        <Badge variant="secondary" className="text-[10px]">Role fit</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(edit.rewritten, 'Rewrite copied')}
                        className="h-7 px-2 text-xs"
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-foreground">{edit.rewritten}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!isElite && result.resumeEdits.length > 2 && (
              <BlurredLockCard tier="elite">
                <div className="p-5 text-center text-sm text-muted-foreground">
                  {result.resumeEdits.length - 2} additional generated rewrites are available with Elite.
                </div>
              </BlurredLockCard>
            )}
          </div>
        </section>
      )}

      {/* Action roadmap */}
      {result.roadmap && result.roadmap.length > 0 && (
        isElite ? (
          <section id="roadmap" className="scroll-mt-24">
            <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
              <Route className="w-5 h-5 text-primary" />
              Action Roadmap
            </h3>
            <div className="relative space-y-1 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-px before:bg-border">
              {result.roadmap.map((step, i) => (
                <div key={i} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-4 py-2">
                  <span className="z-10 mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-primary/25 bg-background text-xs font-bold text-primary">{i + 1}</span>
                  <div className="rounded-xl border border-border/50 bg-card/50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">{STAGE_LABELS[step.stage] ?? step.stage}</Badge>
                        <h4 className="font-semibold text-foreground">{step.action}</h4>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{step.expectedImpact}</p>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="mt-2 h-7 px-0 text-xs">Why this matters <ChevronDown className="ml-2 h-3.5 w-3.5" /></Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <p className="border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">{step.why}</p>
                        </CollapsibleContent>
                      </Collapsible>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <BlurredLockCard className="scroll-mt-24" tier="elite">
            <div id="roadmap" className="p-5 text-center">
              <Route className="mx-auto h-5 w-5 text-primary" />
              <h4 className="mt-2 font-semibold">Your generated action roadmap is available with Elite</h4>
            </div>
          </BlurredLockCard>
        )
      )}

      {/* Keywords */}
      {result.keywords && (
        isElite ? (
          <section id="keywords" className="scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-foreground">Keyword Coverage</h3>
              </div>
              {result.keywords.missing?.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.keywords.missing.join(', '), 'Missing keywords copied')}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy missing keywords
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border border-emerald-500/15 bg-emerald-500/[0.03]">
              <CardContent className="p-5">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Matched Keywords
                </h4>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {result.keywords.matched?.length ? (
                    result.keywords.matched.map((k, i) => (
                      <Badge key={i} variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {k}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">None detected</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="border border-amber-500/15 bg-amber-500/[0.03]">
              <CardContent className="p-5">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-amber-500" />
                  Missing Keywords
                </h4>
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {result.keywords.missing?.length ? (
                    result.keywords.missing.map((k, i) => (
                      <Badge key={i} variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        {k}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">None — great coverage!</p>
                  )}
                </div>
              </CardContent>
            </Card>
            </div>
          </section>
        ) : (
          <BlurredLockCard className="scroll-mt-24" tier="elite">
            <div id="keywords" className="p-5 text-center">
              <Target className="mx-auto h-5 w-5 text-primary" />
              <h4 className="mt-2 font-semibold">Keyword strategy is available with Elite</h4>
            </div>
          </BlurredLockCard>
        )
      )}

      {/* LinkedIn improvements (optional) */}
      {result.linkedinImprovements && result.linkedinImprovements.length > 0 && (
        isElite ? (
          <section id="linkedin" className="scroll-mt-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Profile alignment</p>
            <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
              <Linkedin className="w-5 h-5 text-primary" />
              LinkedIn Improvements
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {result.linkedinImprovements.map((imp, i) => (
                <Card key={i} className="border border-border/70 bg-card/80 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{imp.area}</p>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(imp.suggestion, `${imp.area} improvement copied`)} className="h-7 px-2 text-xs">
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{imp.suggestion}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : (
          <BlurredLockCard className="scroll-mt-24" tier="elite">
            <div id="linkedin" className="p-5 text-center">
              <Linkedin className="mx-auto h-5 w-5 text-primary" />
              <h4 className="mt-2 font-semibold">LinkedIn improvements are available with Elite</h4>
            </div>
          </BlurredLockCard>
        )
      )}
      {isElite && (!result.linkedinImprovements || result.linkedinImprovements.length === 0) && (
        <Card id="linkedin" className="scroll-mt-24 border-dashed border-border bg-card/50">
          <CardContent className="p-6 text-center">
            <Linkedin className="mx-auto h-5 w-5 text-muted-foreground" />
            <h3 className="mt-2 font-semibold text-foreground">No LinkedIn improvements provided</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This match did not include LinkedIn-specific guidance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Strategic advice */}
      {result.strategicAdvice && (
        isElite ? (
          <section className="rounded-2xl border border-primary/15 bg-gradient-to-r from-card to-primary/[0.06] p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Strategic Advice
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {result.strategicAdvice.summary}
                </p>
                {result.strategicAdvice.biggestScoreMover && (
                  <p className="mt-3 text-sm text-foreground">
                    <span className="font-semibold">Biggest score mover: </span>
                    {result.strategicAdvice.biggestScoreMover}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 md:flex-col md:items-end">
                <span className="text-xs text-muted-foreground">Apply now?</span>
                <Badge className={result.strategicAdvice.applyNow ? "bg-emerald-600 text-white" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}>
                  {result.strategicAdvice.applyNow ? 'Yes' : 'Only after fixes'}
                </Badge>
              </div>
            </div>
          </section>
        ) : (
          <BlurredLockCard tier="elite">
            <div className="p-5 text-center">
              <TrendingUp className="mx-auto h-5 w-5 text-primary" />
              <h4 className="mt-2 font-semibold">Strategic advice is available with Elite</h4>
            </div>
          </BlurredLockCard>
        )
      )}

      {/* Upgrade CTA for Pro users */}
      {!isElite && (
        <Button variant="outline" onClick={() => navigate('/pricing')} className="w-full mt-2">
          <Crown className="h-4 w-4 mr-2" />
          Upgrade to Elite for full Recruiting Lens
        </Button>
      )}

      {/* L3: recommendation actions for this analysis */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            AI Suggestions
          </h3>
          {recommendations.map((rec) => (
            <div key={rec.id} className="p-3 border rounded-lg bg-card text-sm text-foreground/80">
              <p>{rec.suggestion_text}</p>
              <RecommendationActions recommendation={rec} />
            </div>
          ))}
        </div>
      )}

      {/* Bottom action */}
      <div className="flex justify-center pt-4">
        <Button variant="outline" onClick={onAnalyzeAnother} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Analyze Another Job
        </Button>
      </div>
    </motion.div>
  );
};

const RecruitingLens = () => {
  const { userId } = useAuthUserId();
  if (!userId) return null;

  // A user-id key makes every in-memory input, selector, and result state account-bound.
  return <RecruitingLensPage key={userId} userId={userId} />;
};

export default RecruitingLens;
