import { useCallback, useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { getLatestResume } from "@/lib/latestResume";
import { toast } from "sonner";
import { useMerits, useInvalidateMerits } from '@/hooks/useMerits';
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { getMeritErrorMessage } from '@/lib/merit-error-messages';
import { MeritCostPreview } from '@/components/MeritCostPreview';
import { LowBalanceWarning } from '@/components/LowBalanceWarning';
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import { normalizeActiveTier } from "@/config/pricing-config";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from "@/lib/feature-run-correlation";
import { perf } from "@/lib/perf";
import {
  Compass,
  Target,
  BookOpen,
  Briefcase,
  DollarSign,
  Sparkles,
  CheckCircle2,
  Zap,
  Upload,
  HelpCircle,
  Linkedin,
  FileText,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Lock,
  Crown,
} from "lucide-react";
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  extractDocumentFromPdf,
  isAcceptedResumeDocument,
  serializeDocumentExtractionMetadata,
  type DocumentExtractionMetadata,
  precheckResumeDocument,
} from "@/lib/document-extraction";
import { MSG_VALIDATION_UNAVAILABLE } from "@/config/document-limits";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useAnalysisLock } from "@/contexts/AnalysisLockContext";
import { isAnalysisLifecycleEnabled } from "@/config/feature-flags";
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";
import { CompensationIntelligence } from "@/components/CompensationIntelligence";
import { SmartApplicationStrategy } from "@/components/SmartApplicationStrategy";
import { PriorAnalysisSelector, type ResumePriorAnalysis } from "@/components/PriorAnalysisSelector";
import { PriorLinkedInSelector, type LinkedInPriorSource } from "@/components/PriorLinkedInSelector";
import { PriorSelectorEmptyState } from "@/components/PriorSelectorEmptyState";
import { useUserTargets } from "@/hooks/useUserTargets";
import { useFeatureUsage } from "@/hooks/useFeatureUsage";
import RecommendationActions, { type Recommendation } from "@/components/recommendations/RecommendationActions";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";

import {
  CachedResultsBanner,
  CareerDNACard,
  BestFitRoles,
  SurpriseFits,
  ReadinessTab,
  FieldsTab,
  RolesTab,
  RoadmapTab,
  PartialSectionFallback,
} from "@/components/career-compass";
import { BlockedAiEntryPoint } from "@/components/platform/CapabilityGate";
import { isAiBlocked } from "@/lib/platform/capabilities";
import type { AnalysisResult } from "@/components/career-compass/types";

// The `stageLabels` ladder for the analysis overlay. Module level is load-bearing:
// UniversalAnalyzing keys its timed step advance off the label count, and an array
// rebuilt every render would restart that timer.
const CAREER_COMPASS_STAGE_LABELS: readonly string[] = [
  'Reading your resume & LinkedIn',
  'Detecting your career domain',
  'Analyzing career fields',
  'Matching suitable roles',
  'Building your career roadmap',
] as const;

type CareerSectionKey = 'bestFitRoles' | 'surpriseFits' | 'fields' | 'roles' | 'readiness' | 'roadmap';

interface CareerFunctionResponse extends Partial<AnalysisResult> {
  error?: string;
}

interface CareerSubmitResponse {
  jobId?: string;
  status?: string;
  pollAfterMs?: number;
  error?: string;
  message?: string;
  retryAfter?: number;
}

interface CareerJobStatusResponse {
  status?: string;
  result?: AnalysisResult;
  error?: unknown;
  pollAfterMs?: number;
  isInfrastructureFailure?: boolean;
  // Top-level retryable flag surfaced by get-analysis-job-status on a terminal `failed`
  // (mirrors the taxonomy retryable partition: MODEL_TIMEOUT / MODEL_RATE_LIMITED). Drives
  // the auto-retry-once seam (first-attempt-reliability, direction 3).
  retryable?: boolean;
}

interface CompensationIntelligenceData {
  salaryBands?: Parameters<typeof CompensationIntelligence>[0]['salaryData'];
  roleTransitionROI?: Parameters<typeof CompensationIntelligence>[0]['roleTransitions'];
  applicationStrategy?: Parameters<typeof SmartApplicationStrategy>[0]['recommendations'];
}

interface AnalysisWithCompensation extends AnalysisResult {
  compensationIntelligence?: CompensationIntelligenceData;
}

/**
 * The three Elite-only Career Compass tabs, in display order (260713-hrd).
 *
 * Free sees these tabs too — locked — so the value of upgrading is visible rather than hidden.
 * Fields and Roles are NOT here: they are available at every tier.
 *
 * Skills Gap and Strategy are deliberately absent and must stay absent (operator decision).
 */
const CAREER_ELITE_TABS = [
  { value: 'readiness', label: 'Career Comparison', Icon: Zap },
  { value: 'roadmap', label: '12-Month Roadmap', Icon: BookOpen },
  { value: 'compensation', label: 'Salary', Icon: DollarSign },
] as const;

const CAREER_ELITE_TAB_VALUES: readonly string[] = CAREER_ELITE_TABS.map((t) => t.value);

/**
 * Is this tab locked for the given tier? Presentation only — the real boundary is server-side
 * tier shaping, which never sends Elite data to a Free user in the first place. `tier` is the
 * already-normalized tier (pro collapses onto elite), so a legacy `pro` row is NOT locked out.
 */
const isTabLockedForTier = (tab: string, tier: string): boolean =>
  tier !== 'elite' && CAREER_ELITE_TAB_VALUES.includes(tab);

const hasItems = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

const getStringField = (value: unknown, field: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : undefined;
};

const getMissingCareerSections = (
  result: Partial<AnalysisResult> | null,
  subscriptionTier: string,
): Set<CareerSectionKey> => {
  const missing = new Set<CareerSectionKey>();
  if (!result) return missing;

  if (!hasItems(result.careerFields)) {
    missing.add('bestFitRoles');
    missing.add('fields');
  }
  // Surprise Fits floor. Must track the SERVER's CAREER_SURPRISE_FITS_MIN exactly, or the
  // client rejects a report the server persisted (or vice versa). The audit (2026-07-15,
  // operator decision) lowered the floor from 2 to 1: a complete report with 1 genuine
  // cross-domain fit is a success, not a partial. Still require presence (>= 1) so a truly
  // empty section reads as missing.
  if (!Array.isArray(result.surpriseFits) || result.surpriseFits.length < 1) missing.add('surpriseFits');
  if (!hasItems(result.roles)) missing.add('roles');
  if (!result.roleReadinessBreakdown) missing.add('readiness');
  if (subscriptionTier !== 'free' && !hasItems(result.roadmap) && !hasItems(result.roleRoadmaps)) {
    missing.add('roadmap');
  }

  return missing;
};

const canHydrateCareerPartial = (raw: unknown): raw is Partial<AnalysisResult> => {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Partial<AnalysisResult>;
  return Boolean(
    typeof candidate.careerDNA === 'string' ||
    typeof candidate.detectedDomain === 'string' ||
    hasItems(candidate.careerFields) ||
    hasItems(candidate.surpriseFits) ||
    hasItems(candidate.roles) ||
    hasItems(candidate.roadmap) ||
    hasItems(candidate.roleRoadmaps) ||
    candidate.roleReadinessBreakdown,
  );
};

export default function CareerCompass() {
  const careerAnalyzeFunctionPrimary = String(import.meta.env.VITE_ANALYZE_CAREER_FUNCTION || "analyze-career").trim() || "analyze-career";
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isValidatingResume, setIsValidatingResume] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [linkedinPdfFile, setLinkedinPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { isZero, optimisticDeduct } = useMerits();
  const invalidateMerits = useInvalidateMerits();
  const { data: featureCosts } = useFeatureCosts();

  // Controlled so a Free user selecting a locked Elite tab can be intercepted BEFORE the tab
  // changes — the upgrade flow opens and no Elite panel ever mounts.
  const [activeTab, setActiveTab] = useState<string>('fields');
  const [selectedRoadmapRole, setSelectedRoadmapRole] = useState("__general__");

  // Tier gating - use admin test tier if available
  const [realSubscriptionTier, setRealSubscriptionTier] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [savedLinkedinContent, setSavedLinkedinContent] = useState<string | null>(null);
  const [savedLinkedinFilename, setSavedLinkedinFilename] = useState<string | null>(null);
  const [savedResumeFilePath, setSavedResumeFilePath] = useState<string | null>(null);
  const [savedResumeFilename, setSavedResumeFilename] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState<string | null>(null);
  const [savedResumeText, setSavedResumeText] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Career Professional");
  const navigate = useNavigate();
  const { getEffectiveTier } = useAdminTierTest();
  const { targets: userTargets } = useUserTargets();

  // FEAT-05 (06-03 · D-04): additive lifecycle-run tracking + submit-lock.
  // Both are INERT while VITE_FEATURE_ANALYSIS_LIFECYCLE is off — useAnalysisRun
  // early-returns isActive:false and startRun no-ops (no channel/poll/storage), and
  // every consumer below is gated on isAnalysisLifecycleEnabled() — so the Career
  // Compass page stays byte-identical to today until the flag is flipped (dormancy).
  // Multi-role compare + ?id= hydration deliberately stay OUTSIDE this hook (D-06).
  const analysisRun = useAnalysisRun();
  const { isLocked } = useAnalysisLock();

  // L3 telemetry + recommendations
  const { recordEvent } = useFeatureUsage('career_compass');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const recShownFiredRef = useRef(false);

  const submitGuard = useSubmitGuard({
    feature: 'career-compass',
    inputIdentity: resumeFile
      ? `${resumeFile.name}:${resumeFile.size}:${resumeFile.lastModified}:${linkedinUrl.trim()}`
      : `${savedResumeFilePath ?? 'no-resume'}:${linkedinUrl.trim()}`,
  });

  // Get effective tier (real or admin test tier)
  // 260713-hrd: There is no Pro. Only Free and Elite exist, and `normalizeActiveTier`
  // collapses a saved `pro` row onto Elite — as it already does everywhere else in the app.
  // This page used to gate on the LITERAL `subscriptionTier === "elite"`, so the 9 users
  // sitting on a legacy `pro` row paid for Elite and were shown the 2-tab Free UI.
  const subscriptionTier = normalizeActiveTier(getEffectiveTier(realSubscriptionTier || "free"));

  // Load profile data and check access on mount
  useEffect(() => {
    // WR-05 fix: if a `?id=` is present in the URL, the deep-link hydration
    // effect below is authoritative for `analysis`. Reading the query param
    // directly from location (instead of via useSearchParams state) keeps
    // this inside the existing single-run mount effect without introducing a
    // new dep that would cause re-runs. We still load profile + saved-resume
    // metadata, but SKIP the most-recent-analysis cache restore so it cannot
    // race the `?id=` branch and overwrite the pinned analysis.
    const urlIdForMount = new URLSearchParams(window.location.search).get("id");
    const skipCacheRestore = !!urlIdForMount;

    const checkAccessAndLoadProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          navigate("/auth");
          return;
        }

        setUserId(user.id);

        // Fetch profile, latest resume, and cached career compass results in parallel.
        // When `?id=` is present, skip the analysis_results fetch entirely — the
        // dedicated `?id=` effect owns the analysis state.
        const [profileResult, resumeResult, cachedAnalysisResult] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "linkedin_url, preferred_locations, job_type_preference, experience_level, subscription_tier, linkedin_pdf_content, linkedin_pdf_filename, full_name",
            )
            .eq("id", user.id)
            .single(),
          // `id` + `extracted_text` are read so the saved-resume submit path can tell a
          // resume that HAS durable text from one whose text was never persisted, and
          // self-heal the latter (see `resolveSavedResumeText`).
          getLatestResume({ userId: user.id, columns: "id, file_path, file_name, extracted_text", terminal: "single" }),
          skipCacheRestore
            ? Promise.resolve({ data: null })
            : supabase
                .from("analysis_results")
                .select("*")
                .eq("user_id", user.id)
                .eq("analysis_type", "career_compass")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);

        const profile = profileResult.data;
        const latestResume = resumeResult.data;
        const cachedAnalysis = cachedAnalysisResult.data;

        if (profile) {
          setRealSubscriptionTier(profile.subscription_tier || "free");
          if (profile.linkedin_url) setLinkedinUrl(profile.linkedin_url);
          if (profile.linkedin_pdf_content) setSavedLinkedinContent(profile.linkedin_pdf_content);
          if (profile.linkedin_pdf_filename) setSavedLinkedinFilename(profile.linkedin_pdf_filename);
          if (profile.full_name) setUserName(profile.full_name);
        } else {
          setRealSubscriptionTier("free");
        }

        // Set saved resume info if available
        if (latestResume?.file_path) {
          setSavedResumeFilePath(latestResume.file_path);
          setSavedResumeFilename(latestResume.file_name);
          setSavedResumeId(latestResume.id ?? null);
          setSavedResumeText(
            typeof latestResume.extracted_text === 'string' && latestResume.extracted_text.trim()
              ? latestResume.extracted_text
              : null,
          );
        }

        // Load cached career compass results ONLY when not hydrating from `?id=`.
        if (!skipCacheRestore && cachedAnalysis?.raw_response) {
          try {
            const rawResponse = cachedAnalysis.raw_response as Record<string, unknown>;
            setAnalysis(rawResponse as unknown as AnalysisResult);
            setIsFromCache(true);
            console.log("Loaded cached Career Compass results from:", cachedAnalysis.created_at);
          } catch (e) {
            console.error("Failed to parse cached analysis:", e);
          }
        }
      } catch (error) {
        console.error("Error loading profile data:", error);
        setRealSubscriptionTier("free");
      } finally {
        setCheckingAccess(false);
      }
    };

    checkAccessAndLoadProfile();
  }, [navigate]);

  // 22-05 D-22: Deep-link hydration from AnalysisHistory (?id=<analysis_id>).
  // Queries analysis_results filtered by analysis_type='career_compass'.
  // RLS auto-scopes to auth.uid() = user_id. Invalid/not-found → toast fallback.
  const [searchParams] = useSearchParams();
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
        .eq('analysis_type', 'career_compass')
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error('Analysis not found');
        return;
      }
      // Payload column: `analysis_results.raw_response` (jsonb). Pinned — no fallback chain.
      // Phase 37: historical rows may pre-date the full report schema. Hydrate
      // recognizable partial payloads so the results view can show recovery UI.
      const raw = data.raw_response as unknown;
      if (!canHydrateCareerPartial(raw)) {
        console.error('[CareerCompass] hydration: raw_response failed shape check', { id: idFromUrl });
        toast.error("Couldn't load this analysis");
        return;
      }
      setAnalysis(raw as AnalysisResult);
      setIsFromCache(true);
    })();
    return () => { cancelled = true; };
  }, [idFromUrl]);

  // Extract text from LinkedIn PDF
  const extractLinkedInPdfText = async (
    file: File,
    featureRunToken?: string,
  ): Promise<{ text: string; metadata?: DocumentExtractionMetadata }> => {
    try {
      const extraction = await extractDocumentFromPdf({
        file,
        documentType: 'linkedin_profile',
        featureRunToken,
      });
      return {
        text: extraction.text,
        metadata: extraction.metadata,
      };
    } catch (error) {
      console.error("LinkedIn PDF extraction error:", error);
      throw new Error("Failed to read LinkedIn PDF");
    }
  };

  const handleResumePriorSelect = useCallback((prior: ResumePriorAnalysis) => {
    setSavedResumeFilename(prior.fileName);
    if (prior.filePath) {
      setSavedResumeFilePath(prior.filePath);
    }
  }, []);

  const handleLinkedInPriorSelect = useCallback((source: LinkedInPriorSource) => {
    if (source.content) {
      setSavedLinkedinContent(source.content);
      setSavedLinkedinFilename(source.identifier);
    }
  }, []);

  const invokeCareerAnalysisDirectWithFailover = async (payload: Record<string, unknown>) => {
    return invokeWithTimeout<CareerFunctionResponse>(careerAnalyzeFunctionPrimary, { body: payload }, 160000);
  };

  // FEAT-05 (06-03 · D-09) large-result safety: rehydrate a COMPLETED lifecycle run's
  // full multi-structure payload from the AUTHORITATIVE analysis_results.raw_response
  // — the SAME pinned read the `?id=` deep-link path uses (no fallback chain) — rather
  // than the transient job-status envelope, so Career DNA, careerFields, gaps,
  // surpriseFits, roleRoadmaps (3x5 phases) + compensationIntelligence all round-trip
  // intact. Reads the latest career_compass row (the run that just completed); RLS
  // auto-scopes to auth.uid().
  const hydrateLatestCareerResult = useCallback(async (uid: string): Promise<AnalysisResult | null> => {
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', uid)
      .eq('analysis_type', 'career_compass')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Pinned column: analysis_results.raw_response (jsonb). No speculative fallback chain.
    const raw = data.raw_response as unknown;
    if (!canHydrateCareerPartial(raw)) return null;
    return raw as AnalysisResult;
  }, []);

  // L3: fire 'open' on mount
  useEffect(() => {
    recordEvent('open');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fire 'view_results' once analysis sub-tree becomes visible
  useEffect(() => {
    if (analysis) {
      recordEvent('view_results');
    }
  }, [analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fetch recommendations + mark shown once when analysis is ready
  useEffect(() => {
    if (!analysis || !userId || recShownFiredRef.current) return;
    recShownFiredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('recommendations')
          .select('*')
          .eq('feature', 'career_compass')
          .eq('user_id', userId);
        if (cancelled || error || !data || data.length === 0) return;
        setRecommendations(data as Recommendation[]);
        const recIds = data.map((r: Recommendation) => r.id);
        await supabase.rpc('record_recommendations_shown', { rec_ids: recIds });
      } catch (err) {
        console.error('[CareerCompass] recommendations fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [analysis, userId]);

  // 260713-hrd: no `allowResumeOnly` opt-in any more. Resume-only IS the supported path — it
  // does not need to be opted into, because the gate that made it an exception is gone.
  const clearResumeSelection = () => {
    setResumeFile(null);
    if (resumeInputRef.current) resumeInputRef.current.value = '';
    requestAnimationFrame(() => resumeInputRef.current?.focus());
  };

  const handleResumeSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isValidatingResume) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setIsValidatingResume(true);
    const result = await precheckResumeDocument(file, 'resume');
    if (!result.ok) {
      toast.error(result.message);
      clearResumeSelection();
    } else {
      setResumeFile(file);
    }
    setIsValidatingResume(false);
  };

  // XDEV-01 / D-07 — see the note in `src/pages/Upload.tsx`. In `degraded` tier the
  // live CTA below is REPLACED by BlockedAiEntryPoint, so `handleAnalyze` is never
  // reachable and no run, Merit reservation or request can be created.
  const aiBlocked = isAiBlocked();

  /**
   * Resume text for the saved-resume path, healing the row when it has none.
   *
   * Returns "" if the text cannot be recovered — the caller then submits exactly as it did
   * before, and the server's own validation still owns the outcome. This never fabricates
   * text and never suppresses a real extraction failure.
   */
  const resolveSavedResumeText = async (featureRunToken?: string): Promise<string> => {
    if (savedResumeText?.trim()) return savedResumeText;
    if (!savedResumeFilePath) return "";

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from("resumes")
        .download(savedResumeFilePath);
      if (downloadError || !blob) {
        console.warn("[CareerCompass] saved resume download failed", downloadError);
        return "";
      }

      const filename = savedResumeFilename ?? savedResumeFilePath.split("/").pop() ?? "resume.pdf";
      const file = new File([blob], filename, {
        type: blob.type || "application/pdf",
      });
      if (!isAcceptedResumeDocument(file)) return "";

      const extraction = await extractDocumentFromFile({
        file,
        documentType: 'resume',
        // Threading the id is what makes this a one-time heal: the extractor persists the
        // accepted text back onto the row.
        ...(savedResumeId ? { resumeId: savedResumeId } : {}),
        featureRunToken,
      });
      if (extraction.text?.trim()) {
        setSavedResumeText(extraction.text);
        console.log("[CareerCompass] saved resume text recovered, length:", extraction.text.length);
        return extraction.text;
      }
      return "";
    } catch (error) {
      console.warn("[CareerCompass] saved resume text recovery failed", error);
      return "";
    }
  };

  const handleAnalyze = async () => {
    const submitToken = submitGuard.beginSubmit();
    if (!submitToken) return;
    // Resume is required - either new file or saved file
    if (!resumeFile && !savedResumeFilePath) {
      toast.error("Please upload your resume");
      submitGuard.endSubmit(submitToken);
      return;
    }

    // LinkedIn inputs are encouraged but optional
    if (linkedinUrl && !linkedinUrl.includes("linkedin.com/in/")) {
      toast.error("Please provide a valid LinkedIn profile URL");
      submitGuard.endSubmit(submitToken);
      return;
    }

    // FEAT-05 (06-03 · D-04 / T-06-12) submit-lock: block a duplicate CONCURRENT
    // submit while a lifecycle run is already active (double-click / two tabs). The
    // derived idempotency key + create_or_recover active index are the server-side
    // backstop; this is the client guard. Inert while the flag is off (byte-identical).
    const lifecycleOn = isAnalysisLifecycleEnabled();
    if (lifecycleOn && (isLocked || analysisRun.isActive)) {
      submitGuard.endSubmit(submitToken);
      return;
    }
    if (isZero) {
      submitGuard.endSubmit(submitToken);
      return;
    }

    setLoading(true);
    recordEvent('submit');
    const _pt = perf.start('Career Compass');

    // Held in the outer scope so the outer catch (a throw mid-poll, after the
    // optimistic deduct fired) can still roll the snapshot back (D-04).
    let settle: { rollback: () => void; commit: () => void } | null = null;

    // Costing correlation only — assigned once the deliberate action begins and
    // released on the terminal branch. Never stored outside this closure.
    let correlationEnvelope: FeatureRunCorrelationEnvelope | null = null;

    try {
      // 260713-hrd: the bespoke progress interval is gone along with the inline step-list it
      // drove. `UniversalAnalyzing` is now the SINGLE loading surface and owns its own
      // animation — the page used to render BOTH at once, telling the user "about a minute"
      // and "about 20 seconds" simultaneously.
      {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Determine which resume to use - new upload or saved
        let filePath: string;
        if (resumeFile) {
          setIsValidatingResume(true);
          const { data: validationData, error: validationError } = await invokeWithTimeout<{
            ok?: boolean;
            message?: string;
          }>('validate-document', {
            body: resumeFile,
            headers: {
              'x-document-type': 'resume',
              'x-file-name': encodeURIComponent(resumeFile.name),
            },
          }, 30000);
          setIsValidatingResume(false);
          if (validationError || validationData?.ok !== true) {
            toast.error(validationData?.message || MSG_VALIDATION_UNAVAILABLE);
            clearResumeSelection();
            return;
          }

          // Upload new resume to storage
          filePath = `${user.id}/${Date.now()}_${resumeFile.name}`;
          const { error: uploadError } = await supabase.storage.from("resumes").upload(filePath, resumeFile);
          if (uploadError) throw uploadError;
        } else {
          // Use saved resume path
          filePath = savedResumeFilePath!;
        }

        // Costing correlation only (memory-only, never stored). Begun before browser
        // extraction so parser/OCR spend and the queued analysis share one server run.
        // A failure changes nothing — the backend creates the run at its own boundary.
        correlationEnvelope = {
          feature: 'career_compass',
          runVariant: 'standard',
          inputType: linkedinPdfFile ? 'mixed' : 'pdf',
          documentCount: linkedinPdfFile ? 2 : 1,
          serverActionNonce: submitToken.attemptNonce,
        };
        let featureRunToken: string | undefined;
        try {
          featureRunToken = await getFeatureRunToken(correlationEnvelope);
        } catch {
          featureRunToken = undefined;
        }

        // Extract LinkedIn PDF content if provided, otherwise use saved (optional)
        let linkedinPdfContent = "";
        let linkedinPdfMetadata: DocumentExtractionMetadata | undefined;
        if (linkedinPdfFile) {
          try {
            const linkedinExtraction = await extractLinkedInPdfText(linkedinPdfFile, featureRunToken);
            linkedinPdfContent = linkedinExtraction.text;
            linkedinPdfMetadata = linkedinExtraction.metadata;

            // Save to profile for future use
            if (userId && linkedinPdfContent.length > 100) {
              await supabase
                .from("profiles")
                .update({
                  linkedin_pdf_content: linkedinPdfContent,
                  linkedin_pdf_filename: linkedinPdfFile.name,
                  linkedin_pdf_updated_at: new Date().toISOString(),
                  ...(linkedinPdfMetadata ? {
                    linkedin_pdf_text_hash: linkedinPdfMetadata.textHash,
                    linkedin_pdf_extraction_metadata: serializeDocumentExtractionMetadata(linkedinPdfMetadata),
                  } : {}),
                })
                .eq("id", userId);
              setSavedLinkedinContent(linkedinPdfContent);
              setSavedLinkedinFilename(linkedinPdfFile.name);
            }
          } catch (e) {
            console.error("Failed to extract LinkedIn PDF:", e);
            if (savedLinkedinContent) {
              linkedinPdfContent = savedLinkedinContent;
            } else {
              toast.error("We could not read this LinkedIn PDF reliably. Please upload a text-based PDF.");
            }
          }
        } else if (savedLinkedinContent) {
          linkedinPdfContent = savedLinkedinContent;
        }

        // Extract resume text client-side for Career Compass when a new file is uploaded.
        let resumeTextContent = "";
        if (resumeFile && isAcceptedResumeDocument(resumeFile)) {
          try {
            const resumeExtraction = await extractDocumentFromFile({
              file: resumeFile,
              documentType: 'resume',
              featureRunToken,
            });
            resumeTextContent = resumeExtraction.text;
            console.log("Client resume text extracted for Career Compass, length:", resumeTextContent.length);
          } catch (resumeTextError) {
            console.warn("Client resume text extraction failed, will rely on server parsing/OCR:", resumeTextError);
          }
        } else if (savedResumeFilePath) {
          // SAVED-RESUME PATH — the common case for a freshly-onboarded user, and the one
          // that produced the production INPUT_MISSING failures. No new file means no
          // client extraction, and the server cannot recover on its own: backend raw-byte
          // PDF parsing is intentionally a no-op (_shared/pdf-parser.ts), so
          // `resumes.extracted_text` is the ONLY source. When onboarding could not persist
          // it, every source is empty and analyze-career fails closed at index.ts:1876.
          //
          // Prefer the durable text; otherwise re-derive it from the stored file with the
          // same browser parser that produced it originally and let extractDocumentFromFile
          // persist it (resumeId is threaded through), so this heals the row permanently
          // rather than re-paying the download on every run.
          resumeTextContent = await resolveSavedResumeText(featureRunToken);
        }

        // D-04 / Pitfall 4: capture the optimistic snapshot ONCE here, before
        // submit, and hold it across all ~60 poll iterations. NEVER call
        // optimisticDeduct inside the loop. Every terminal branch below settles
        // through this single `settle`: completed → commit; failed / timeout /
        // catch / pre-submit error → rollback.
        const cost = getCostForFeature(featureCosts, 'career_compass', subscriptionTier ?? 'free') ?? 0;
        settle = optimisticDeduct(cost);

        // Submit body hoisted so the transient-failure auto-retry (direction 3, below) can
        // re-submit the SAME intent with the SAME attemptNonce -> create_or_recover replays
        // the idempotency key -> already_deducted -> charged exactly once.
        const careerSubmitBody = {
          linkedinUrl: linkedinUrl || undefined,
          resumeFilePath: filePath,
          resumeTextContent: resumeTextContent || undefined,
          linkedinPdfContent: linkedinPdfContent || undefined,
          careerTargets: userTargets
            ? {
                target_roles: userTargets.target_roles,
                target_industries: userTargets.target_industries,
              }
            : undefined,
          tier: subscriptionTier,
          userId: user.id,
          // 260713-hrd: sent UNCONDITIONALLY and held stable across a resubmit of the
          // same intent. This is what makes one run = one charge (see submitGuard).
          attemptNonce: submitToken.attemptNonce,
          ...(featureRunToken ? { featureRunToken } : {}),
        };

        // Submit job to async queue (returns immediately with a jobId)
        const { data: submitData, error: submitError } = await invokeWithTimeout<CareerSubmitResponse>(
          'submit-career-analysis-job',
          { body: careerSubmitBody },
          15000,
        );

        if (submitError || submitData?.error) {
          const errorMessage = submitData?.error || submitError?.message || "Failed to queue analysis";
          console.error("Career job submission failed:", errorMessage);
          // Submit failed before the server deducted — restore the optimistic
          // decrement on every early return below.
          settle?.rollback();
          // 260713-hrd: the 412 `missing_prior_analyses` / `linkedin_prior_missing` handlers are
          // GONE. Career Compass Free is standalone — a resume is the only requirement, LinkedIn
          // is optional, and a prior Resume Analysis / LinkedIn Grade is optional ENRICHMENT that
          // is reused when present. The server no longer emits those codes, so handling them here
          // would only be dead code that lies to the user about what the feature needs.
          // Check for rate limit (distinct from credits exhaustion per D-11)
          if (errorMessage === "rate_limit_exceeded" || submitData?.error === "rate_limit_exceeded") {
            const retryAfter = submitData?.retryAfter ?? 60;
            const waitMinutes = Math.ceil(retryAfter / 60);
            toast.error(`Too many requests. Try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`);
            return;
          }
          // 260713-hrd: `usage_limit_reached` handling removed — Merits are the only paywall for
          // Career Compass, and the legacy entitlement gate that produced that code is gone.
          // Insufficient-Merit (402) and every other submit failure route through the shared taxonomy.
          {
            const { title, description } = getMeritErrorMessage(500);
            toast.error(title, description ? { description } : undefined);
          }
          return;
        }

        const careerJobId = submitData?.jobId;
        if (!careerJobId) {
          settle?.rollback();
          toast.error("Career Compass could not start. Please try again.");
          return;
        }
        // FEAT-05 (06-03 · D-04): the careerJobId IS the lifecycle run_id (submit
        // returns jobId === run_id). Persist it via startRun BEFORE the progress screen
        // renders so a refresh/navigation re-attaches to the LIVE run (URL+localStorage
        // recovery) instead of abandoning it. no-ops while the flag is off.
        if (lifecycleOn) {
          analysisRun.startRun(careerJobId);
        }
        // The run currently being polled. Reassigned once by the direction-3 auto-retry so
        // the poll loop follows the re-submitted (create_or_recover) run.
        let currentJobId = careerJobId;
        // Direction 3: allow exactly ONE automatic same-nonce retry on a transient failure.
        let autoRetried = false;
        let pollAfterMs: number = submitData.pollAfterMs ?? 2000;
        const pollStart = Date.now();
        perf.mark(_pt, 'job submitted', { jobId: careerJobId });
        // The 180s cap arms ONLY the legacy flag-OFF path. When the lifecycle owns the
        // run (flag ON), deadness is bounded by the lifecycle terminal states + the
        // Phase-3 reaper — NOT a 3-minute frontend clock (D-04 / Pitfall 4): a
        // slow-but-alive run is never abandoned. The `lifecycleOn ||` short-circuit
        // keeps the flag-OFF loop condition byte-identical to today.
        const MAX_POLL_MS = 180000; // 3 minutes (legacy flag-OFF cap only)

        while (lifecycleOn || Date.now() - pollStart < MAX_POLL_MS) {
          await new Promise<void>((resolve) => setTimeout(resolve, pollAfterMs));

          const { data: statusData } = await invokeWithTimeout<CareerJobStatusResponse>(
            'get-analysis-job-status',
            { body: { jobId: currentJobId } },
            10000,
          );

          // A terminal FAILED response legitimately carries an `error` payload
          // ALONGSIDE status:'failed' (get-analysis-job-status:148). The old
          // `|| statusData.error` guard swallowed that terminal state before the
          // status==='failed' handler below could run, and — under lifecycleOn's
          // unbounded loop — spun at 95% forever with no toast. Only skip on a
          // real transport miss (null body / no actionable status).
          if (!statusData || (!statusData.status && statusData.error)) {
            pollAfterMs = 3000;
            continue;
          }

          if (statusData.status === 'completed') {
            perf.end(_pt, { pollDuration: `${((Date.now() - pollStart) / 1000).toFixed(2)}s`, score: statusData.result?.roleReadinessScore });
            // Terminal: the next submit is a genuinely NEW run and should charge again.
            submitGuard.endSubmit(submitToken, { resetAttempt: true });
            // commit() is the authoritative refetch; it subsumes the prior
            // invalidateMerits() call here (folded into commit, D-04).
            settle?.commit();
            window.dispatchEvent(new CustomEvent('strivo:profile-updated'));
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            // D-09 large-result safety: hydrate from the AUTHORITATIVE pinned
            // analysis_results.raw_response read rather than the transient job envelope, so the
            // full payload (Career DNA, careerFields, roleRoadmaps, compensationIntelligence)
            // round-trips intact. Falls back to the envelope if the read misses.
            const hydrated = await hydrateLatestCareerResult(user.id);
            setAnalysis((hydrated ?? statusData.result) as AnalysisResult);
            if (lifecycleOn) analysisRun.clear();
            setIsFromCache(false);
            toast.success("Career Compass analysis complete");
            return;
          }

          if (statusData.status === 'failed') {
            const errorPayload = statusData.error;
            const errorMessage =
              typeof errorPayload === 'object'
                ? (getStringField(errorPayload, 'error') || getStringField(errorPayload, 'message') || "Analysis failed")
                : String(errorPayload || "Analysis failed");

            // ── Direction 3 (first-attempt-reliability): auto-retry ONCE, same nonce ──────
            // Before surfacing ANY terminal toast, retry a TRANSIENT (retryable) failure a
            // single time. The retryable flag is the taxonomy partition (MODEL_TIMEOUT /
            // MODEL_RATE_LIMITED) surfaced by get-analysis-job-status; a re-submit replays the
            // SAME idempotency key (the submit-guard nonce is stable) -> create_or_recover ->
            // already_deducted -> charged exactly once, NO rollback, NO nonce reset. A GENUINE
            // permanent failure (truncation / mixed-format / schema / entitlement) is NOT
            // retryable, so it is never retried here — it still fails+refunds and is surfaced
            // immediately (hard constraint: never mask or auto-retry a terminal failure).
            const failureRetryable =
              statusData.retryable === true ||
              (isRecord(errorPayload) && errorPayload.retryable === true);
            if (failureRetryable && !autoRetried) {
              autoRetried = true;
              const { data: retryData } = await invokeWithTimeout<CareerSubmitResponse>(
                'submit-career-analysis-job',
                { body: careerSubmitBody },
                15000,
              );
              const retryJobId = retryData?.jobId;
              if (retryJobId && !retryData?.error) {
                currentJobId = retryJobId;
                if (lifecycleOn) analysisRun.startRun(retryJobId);
                pollAfterMs = retryData.pollAfterMs ?? 2000;
                continue; // re-enter the poll loop against the recovered run (same charge)
              }
              // The re-submit itself failed → fall through to terminal handling below.
            }

            // Terminal failure — restore the optimistic decrement on every branch
            // below (D-04). A refundable failure is refunded server-side; the
            // synchronous rollback keeps the displayed balance accurate meanwhile.
            settle?.rollback();
            // Terminal: the next submit is a genuinely NEW run.
            submitGuard.endSubmit(submitToken, { resetAttempt: true });

            // FEAT-05 (06-03 · D-04) preserve-previous-success: a later failed run must
            // NEVER clear the last successful analysis. In-page we leave `analysis`
            // intact (no setAnalysis(null) on failure); the hook mirrors this by
            // latching analysisRun.previousResult across the failure. Release the
            // terminal run_id so a refresh does not re-attach to a dead run.
            if (lifecycleOn) {
              if (analysisRun.previousResult) {
                console.debug('[CareerCompass] preserving prior successful run', analysisRun.previousResult);
              }
              analysisRun.clear();
            }

            // Check for rate limit (distinct from credits exhaustion per D-11)
            if (errorMessage === "rate_limit_exceeded" || getStringField(errorPayload, 'error') === "rate_limit_exceeded") {
              const retryAfterValue = isRecord(errorPayload) ? errorPayload.retryAfter : undefined;
              const retryAfter = typeof retryAfterValue === 'number' ? retryAfterValue : 60;
              const waitMinutes = Math.ceil(retryAfter / 60);
              toast.error(`Too many requests. Try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`);
              return;
            }

            // 260713-hrd: the analysis came back truncated or incomplete. The server refused to
            // persist it (it used to repair-and-save the stub as a billed success) and refunded
            // the charge. Say so plainly — and only because the server really did refund.
            const errorCode = getStringField(errorPayload, 'error') ?? errorMessage;
            if (errorCode === "output_truncated" || errorCode === "incomplete_output") {
              toast.error("The analysis came back incomplete", {
                description: "Your Merits were refunded. Please try again.",
              });
              return;
            }

            // NOTE: `usage_limit_reached` is deliberately NOT handled here any more. Merits are
            // the only paywall for Career Compass — the legacy entitlement gate that produced it
            // is gone, so this code can no longer be reached.

            if (statusData.isInfrastructureFailure) {
              toast.error("Temporary service interruption", {
                description: "Career Compass encountered an infrastructure issue. Please retry in 1-2 minutes.",
              });
            } else {
              // NFR-04: generic terminal failure routes through the shared taxonomy.
              const { title, description } = getMeritErrorMessage(500);
              toast.error(title, description ? { description } : undefined);
            }
            return;
          }

          pollAfterMs = statusData.pollAfterMs ?? 2500;
        }

        // ── Deadline reached: DO NOT fabricate a failure (260713-hrd, RC-6) ──────────
        // This used to `settle.rollback()` and toast a 408. Both were lies:
        //   • the run may still be ALIVE server-side (the client deadline is 180s; the server
        //     works to 165s and the worker can still be finishing the save), and
        //   • rollback() restores the balance on screen, which READS as "you were refunded" —
        //     but nothing was refunded. The charge was real.
        //
        // So: first check whether the result actually LANDED while we were giving up (this
        // mirrors the "recover a landed grade" fix shipped for LinkedIn Grader in 260713-2ay).
        const landed = await hydrateLatestCareerResult(user.id);
        if (landed) {
          submitGuard.endSubmit(submitToken, { resetAttempt: true });
          settle?.commit();
          window.dispatchEvent(new CustomEvent('strivo:profile-updated'));
          setAnalysis(landed);
          setIsFromCache(false);
          if (lifecycleOn) analysisRun.clear();
          toast.success("Career Compass analysis complete");
          return;
        }

        // Nothing landed. The run may still be in flight — say that honestly, and re-read the
        // real balance from the server instead of pretending we know what it is.
        invalidateMerits();
        toast("Still running", {
          description: "This is taking longer than usual. We'll email you when it's ready — you can also check History.",
        });
      } finally {
        // (no interval to clear — UniversalAnalyzing owns the animation)
        // Terminal for this deliberate action — drop the in-memory correlation.
        if (correlationEnvelope) clearFeatureRunToken(correlationEnvelope);
      }
      }
    } catch (error: unknown) {
      console.error("Career Compass error:", error);
      // Outer catch: the settle closure is scoped inside the try, so a throw
      // before submit means no deduct fired; a throw after submit is handled by
      // the inner branches. Surface a class-keyed toast regardless (NFR-04).
      const { title, description } = getMeritErrorMessage('network');
      toast.error(title, description ? { description } : undefined);
    } finally {
      setLoading(false);
      submitGuard.endSubmit(submitToken);
    }
  };

  // Handler to start fresh analysis (clear cache view)
  const handleRefreshAnalysis = () => {
    setAnalysis(null);
    setIsFromCache(false);
  };

  const handlePartialReportRerun = () => {
    setAnalysis(null);
    setIsFromCache(false);
    navigate('/career-compass', { replace: true });
  };

  const missingSections = getMissingCareerSections(analysis, subscriptionTier);
  const isPartialAnalysis = analysis ? missingSections.size > 0 : false;

  // Loading state
  if (checkingAccess) {
    return (
      <div className="container mx-auto px-4 pt-6 text-center">
        <div className="animate-pulse">
          <Compass className="h-12 w-12 mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Note: Free tier users can use Career Compass (2 runs included in free plan)
  // The backend usage-checker handles credit limits

  return (
    <>
      {/* 260713-hrd: the SINGLE loading surface. The page used to render this overlay AND an
          inline step-list simultaneously, one claiming "about a minute" and the other "about
          20 seconds". 260803-fxz: the ladder is now fed through `stageLabels`; the surface
          makes no duration claim at all. */}
      <UniversalAnalyzing
        isAnalyzing={loading}
        title="Analyzing your career profile"
        icon={<Compass className="w-8 h-8" />}
        stageLabels={CAREER_COMPASS_STAGE_LABELS}
      />
      <div className={`container mx-auto px-4 pt-6 pb-12 ${analysis ? "max-w-7xl" : "max-w-6xl"}`}>
        {!analysis ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
                <Compass className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl font-bold mb-3">CareerCompass</h1>
              <p className="text-lg text-muted-foreground">AI-powered career guidance based on your career DNA</p>
            </div>

            <Card className="p-4 sm:p-6 md:p-8" aria-busy={isValidatingResume || loading}>
              <div className="space-y-6">
                {/* 260713-hrd: NOT blocking any more. A prior Resume Analysis is optional
                    ENRICHMENT (reused when present), never a prerequisite — Career Compass
                    runs from the uploaded resume alone. */}
                <PriorAnalysisSelector
                  onSelect={handleResumePriorSelect}
                  emptyState={
                    <PriorSelectorEmptyState
                      headingText="No resume analysis found"
                      bodyText="Optional — Career Compass will use a past Resume Analysis if you have one."
                      ctaLabel="Analyze My Resume"
                      ctaHref="/upload"
                      blocking={false}
                    />
                  }
                />
                <PriorLinkedInSelector
                  onSelect={handleLinkedInPriorSelect}
                  emptyState={
                    <PriorSelectorEmptyState
                      headingText="No LinkedIn source yet"
                      bodyText="Add your LinkedIn for richer Career Compass output - optional."
                      ctaLabel="Add LinkedIn"
                      ctaHref="/linkedin-grader"
                      blocking={false}
                    />
                  }
                />
                {/* 1. Resume Upload - Required */}
                <div>
                  <Label htmlFor="resume" className="text-base font-semibold mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      1
                    </span>
                    Upload Your Resume <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      ref={resumeInputRef}
                      id="resume"
                      type="file"
                      accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT}
                      aria-describedby="career-compass-resume-help"
                      onChange={handleResumeSelect}
                      disabled={isValidatingResume || loading}
                      className="sr-only"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (!isValidatingResume) resumeInputRef.current?.click();
                      }}
                      disabled={isValidatingResume || loading}
                      className="w-full min-h-11 h-12 justify-start text-left font-normal"
                    >
                      <Upload className="mr-2 h-5 w-5" />
                      {isValidatingResume
                        ? "Validating..."
                        : resumeFile
                        ? resumeFile.name
                        : savedResumeFilename
                          ? savedResumeFilename
                          : "Choose file..."}
                    </Button>
                  </div>
                  <p id="career-compass-resume-help" className="text-xs text-muted-foreground mt-2 break-words">
                    PDF or DOCX files supported. Maximum 2 pages.
                  </p>
                  {resumeFile ? (
                    <p className="text-sm text-muted-foreground mt-2 flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-1" style={{ color: "#FF6B6B" }} />
                      Ready to analyze
                    </p>
                  ) : savedResumeFilename ? (
                    <p className="text-sm text-muted-foreground mt-2 flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
                      Using saved resume (upload new to update)
                    </p>
                  ) : null}
                </div>

                {/* 2. LinkedIn PDF Upload */}
                <div>
                  <Label htmlFor="linkedin-pdf" className="text-base font-semibold mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      2
                    </span>
                    <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                    Upload LinkedIn Profile (PDF) <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="p-4 border rounded-lg bg-[#0A66C2]/5 border-[#0A66C2]/20">
                    <p className="text-muted-foreground text-xs mb-2">
                      LinkedIn → Profile → <span className="font-medium">Resources</span> → Save to PDF
                    </p>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[#0A66C2] hover:underline text-xs cursor-pointer mb-3"
                          >
                            <HelpCircle className="h-3 w-3" />
                            Why PDF?
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="max-w-xs z-50 bg-popover text-popover-foreground border"
                        >
                          <p>
                            LinkedIn blocks automated reading. Uploading the PDF gives the most accurate results with
                            your real headline, experience, and skills.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="relative">
                      <Input
                        id="linkedin-pdf"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setLinkedinPdfFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("linkedin-pdf")?.click()}
                        className="w-full h-10 justify-start text-left font-normal border-[#0A66C2]/30 hover:border-[#0A66C2]/50"
                      >
                        <FileText className="mr-2 h-4 w-4 text-[#0A66C2]" />
                        {linkedinPdfFile
                          ? linkedinPdfFile.name
                          : savedLinkedinFilename
                            ? savedLinkedinFilename
                            : savedLinkedinContent
                              ? "Update LinkedIn PDF..."
                              : "Choose LinkedIn PDF..."}
                      </Button>
                    </div>
                    {linkedinPdfFile ? (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-[#0A66C2]" />
                        LinkedIn PDF ready
                      </p>
                    ) : savedLinkedinContent ? (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                        Using saved LinkedIn profile (upload new to update)
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 3. LinkedIn URL */}
                <div>
                  <Label htmlFor="linkedin" className="text-base font-semibold mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      3
                    </span>
                    LinkedIn URL <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="linkedin"
                    type="url"
                    placeholder="https://linkedin.com/in/your-profile"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div className="mt-6">
                  <LowBalanceWarning />
                  <MeritCostPreview
                    featureCost={
                      getCostForFeature(
                        featureCosts,
                        'career_compass',
                        subscriptionTier ?? 'free',
                      ) ?? 0
                    }
                  />
                </div>

                {aiBlocked ? (
                  <BlockedAiEntryPoint
                    label="Discover My Career Path"
                    className="w-full h-12 text-base font-semibold"
                  />
                ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full" aria-busy={submitGuard.isSubmitting}>
                        <Button
                          onClick={() => handleAnalyze()}
                          aria-disabled={isValidatingResume || submitGuard.isSubmitting || (!resumeFile && !savedResumeFilePath) || isZero || (isAnalysisLifecycleEnabled() && (isLocked || analysisRun.isActive))}
                          className="w-full h-12 text-base font-semibold"
                          style={{ backgroundColor: "#FF6B6B" }}
                        >
                          {loading ? (
                            <>Analyzing...</>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-5 w-5" />
                              Discover My Career Path
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {isZero && (
                      <TooltipContent>
                        <p>Out of Merits. Please upgrade your plan.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Scan-New header-bar (D-10 parity with LinkedInGrader) */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">Your Career Compass</h2>
                {/* 22-03 D-14: Cross-feature memory badge. Renders only when
                    analyze-career signaled it reused a prior LinkedIn Grader
                    analysis instead of re-parsing a LinkedIn PDF. Neutral
                    `secondary` variant per UI-SPEC Color rule 4. */}
                {analysis?.reusedLinkedinGrade && analysis?.linkedinGradeDate && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Linkedin className="h-3 w-3" />
                    Used your LinkedIn analysis from {format(new Date(analysis.linkedinGradeDate), 'MMM d, yyyy')}
                  </Badge>
                )}
              </div>
              <Button variant="outline" onClick={handleRefreshAnalysis} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Start New Analysis
              </Button>
            </div>

            {isFromCache && <CachedResultsBanner onRefresh={handleRefreshAnalysis} />}

            <CareerDNACard
              careerDNA={analysis.careerDNA || "This saved analysis is missing its Career DNA summary. Re-run for the full report."}
              detectedDomain={analysis.detectedDomain}
              domainEvidence={analysis.domainEvidence}
            />

            {missingSections.has('bestFitRoles') ? (
              <PartialSectionFallback sectionName="Best-Fit Roles" onRerun={handlePartialReportRerun} />
            ) : (
              <BestFitRoles careerFields={analysis.careerFields || []} subscriptionTier={subscriptionTier} />
            )}

            {missingSections.has('surpriseFits') ? (
              <PartialSectionFallback sectionName="Surprise Fits" onRerun={handlePartialReportRerun} />
            ) : (
              <SurpriseFits surpriseFits={analysis.surpriseFits || []} subscriptionTier={subscriptionTier} />
            )}

            {isPartialAnalysis && (
              <Card className="border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-medium">
                    This analysis is partial. Some sections were created before the full report format was available.
                  </p>
                </div>
              </Card>
            )}

            {/* 260713-hrd: Free now sees the SAME 5-tab structure Elite does, so the value of
                upgrading is visible instead of invisible. Fields and Roles work; Career
                Comparison, 12-Month Roadmap and Salary render a lock + "Elite" badge and route
                into the existing upgrade flow on click.

                The lock is presentation ONLY. It is not the security boundary and must never be
                treated as one: the server tier-shapes the payload (applyCareerTierShape), so a
                Free analysis never CONTAINS roadmap / roleRoadmaps / compensationIntelligence in
                the first place. The Elite TabsContent blocks below stay gated on
                `subscriptionTier === "elite"`, so there is nothing for a Free user to reveal by
                poking at the DOM — and selecting a locked tab is intercepted before it can
                change tabs, so no Elite panel ever mounts. Clicking a lock navigates; it does
                not analyze, so it cannot spend Merits.

                Skills Gap and Strategy remain withdrawn (operator decision) — not re-added. */}
            <Tabs
              value={activeTab}
              onValueChange={(next) => {
                if (isTabLockedForTier(next, subscriptionTier)) {
                  // The existing upgrade flow — the same destination BlurredLockCard uses.
                  navigate('/pricing');
                  return; // stay on the current tab; never mount an Elite panel for Free
                }
                setActiveTab(next);
              }}
              className="w-full"
            >
              {/* UI-SPEC F3/F4 (XD-07, XD-12): five `whitespace-nowrap` triggers
                  — two of which carry an "Elite" pill — cannot fit the content
                  box below `md`, and as a 5-column grid they also sat 0px apart.
                  This is F3's sanctioned opt-in horizontal scroller: it is
                  operable by touch drag and by keyboard (Radix's roving tabindex
                  scrolls the focused trigger into view). At `md`+ the original
                  five-column grid is restored unchanged. */}
              <div
                className="w-full overflow-x-auto md:overflow-visible"
                data-allow-overflow-x="true"
              >
              <TabsList className="h-auto w-max min-w-full gap-2 md:grid md:w-full md:grid-cols-5">
                <TabsTrigger value="fields" className="text-base py-3">
                  <Target className="mr-2 h-4 w-4" />Fields
                </TabsTrigger>
                <TabsTrigger value="roles" className="text-base py-3">
                  <Briefcase className="mr-2 h-4 w-4" />Roles
                </TabsTrigger>
                {CAREER_ELITE_TABS.map(({ value, label, Icon }) => {
                  const locked = isTabLockedForTier(value, subscriptionTier);
                  return (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="text-base py-3"
                      data-locked={locked ? 'true' : undefined}
                      aria-label={locked ? `${label} — Elite feature, upgrade to unlock` : undefined}
                      title={locked ? `${label} is part of Elite. Upgrade to unlock it.` : undefined}
                    >
                      {locked ? (
                        <Lock className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Icon className="mr-2 h-4 w-4" />
                      )}
                      <span className={locked ? 'text-muted-foreground' : undefined}>{label}</span>
                      {locked && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          <Crown className="h-3 w-3" aria-hidden="true" />
                          Elite
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              </div>

              <TabsContent value="fields" className="space-y-6 mt-6">
                {missingSections.has('fields') ? (
                  <PartialSectionFallback sectionName="Fields" onRerun={handlePartialReportRerun} />
                ) : (
                  <FieldsTab careerFields={analysis.careerFields || []} subscriptionTier={subscriptionTier} />
                )}
              </TabsContent>

              <TabsContent value="roles" className="space-y-6 mt-6">
                {missingSections.has('roles') ? (
                  <PartialSectionFallback sectionName="Roles" onRerun={handlePartialReportRerun} />
                ) : (
                  <RolesTab roles={analysis.roles || []} subscriptionTier={subscriptionTier} />
                )}
              </TabsContent>

            {subscriptionTier === "elite" && (
              <TabsContent value="readiness" className="space-y-6 mt-6">
                {missingSections.has('readiness') ? (
                  <PartialSectionFallback sectionName="Career Comparison" onRerun={handlePartialReportRerun} />
                ) : (
                  <ReadinessTab
                    roleReadinessBreakdown={analysis.roleReadinessBreakdown}
                    subscriptionTier={subscriptionTier}
                  />
                )}
              </TabsContent>
            )}

            {subscriptionTier === "elite" && (
              <TabsContent value="roadmap" className="space-y-6 mt-6">
                {missingSections.has('roadmap') ? (
                  <PartialSectionFallback sectionName="12-Month Roadmap" onRerun={handlePartialReportRerun} />
                ) : (
                  <RoadmapTab
                    roadmap={analysis.roadmap || []}
                    roleRoadmaps={analysis.roleRoadmaps}
                    subscriptionTier={subscriptionTier}
                    selectedRoadmapRole={selectedRoadmapRole}
                    onSelectedRoadmapRoleChange={setSelectedRoadmapRole}
                  />
                )}
              </TabsContent>
            )}

            {subscriptionTier === "elite" && (
              <TabsContent value="compensation" className="mt-6">
                {(() => {
                  const compensationIntelligence = (analysis as AnalysisWithCompensation).compensationIntelligence;
                  return (
                  <CompensationIntelligence
                    tier={subscriptionTier}
                    targetRole={analysis.roleReadinessBreakdown?.targetRole || analysis.targetRole}
                    salaryData={compensationIntelligence?.salaryBands}
                    roleTransitions={compensationIntelligence?.roleTransitionROI}
                    detectedDomain={analysis.detectedDomain}
                  />
                  );
                })()}
              </TabsContent>
            )}

            {/* 260713-hrd: the "strategy" TabsContent lived here and is withdrawn with its
                trigger. `compensationIntelligence.applicationStrategy` is still produced and
                persisted; re-adding <SmartApplicationStrategy tier={subscriptionTier}
                recommendations={compensationIntelligence?.applicationStrategy}
                detectedDomain={analysis.detectedDomain} /> restores it. */}
            </Tabs>

            {/* L3: render recommendation actions for any available recommendations */}
            {recommendations.length > 0 && (
              <div className="space-y-3 mt-6">
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
          </div>
        )}
      </div>
    </>
  );
}
