import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useFeatureUsage } from '@/hooks/useFeatureUsage';
import RecommendationActions, { type Recommendation } from '@/components/recommendations/RecommendationActions';
import { invokeWithTimeout } from '@/lib/fetchWithTimeout';
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from '@/lib/feature-run-correlation';
import { useAnalysisRun } from '@/hooks/useAnalysisRun';
import { perf } from '@/lib/perf';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Linkedin, CheckCircle, AlertTriangle, Zap, ArrowRight, Target, TrendingUp, Copy, Info, Star, Upload, FileText, HelpCircle, Sparkles, GitCompare, RefreshCw } from 'lucide-react';
import { AnalysisComparisonModal } from '@/components/AnalysisComparisonModal';
import { toast } from 'sonner';
import { useMerits } from '@/hooks/useMerits';
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { getMeritErrorMessage } from '@/lib/merit-error-messages';
import { MeritCostPreview } from '@/components/MeritCostPreview';
import { LowBalanceWarning } from '@/components/LowBalanceWarning';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  extractDocumentFromPdf,
  isPdfFile,
  LINKEDIN_PDF_ACCEPT,
  serializeDocumentExtractionMetadata,
  type DocumentExtractionMetadata,
} from '@/lib/document-extraction';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UniversalAnalyzing } from '@/components/UniversalAnalyzing';
import { BlockedAiEntryPoint } from '@/components/platform/CapabilityGate';
import { isAiBlocked } from '@/lib/platform/capabilities';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

// The `stageLabels` ladder for the analyzing overlay. Module level is load-bearing:
// UniversalAnalyzing keys its timed step advance off the label count, and an array
// rebuilt every render would restart that timer.
const LINKEDIN_STAGE_LABELS: readonly string[] = [
  'Reading your LinkedIn profile',
  'Analyzing headline strength',
  'Evaluating your About section',
  'Evaluating experience quality',
  'Checking search alignment & credentials',
  'Generating personalized fixes',
] as const;

export interface LinkedInSection {
  // Evidence-anchored grades (Phase-4 v4 11-section and both later 4-section shapes)
  // return canonical section names; legacy v3 used a fixed union. Kept as `string`
  // so all shapes render through one path.
  name: string;
  score: number;
  // v3 used a literal union (20|30|25); evidence-anchored sections each carry their
  // own maxScore (Experience 18 · Headline/About 11 · Education 4 for the new
  // 4-section shape). Typed `number` — the render computes bars from
  // `score / maxScore`, never a hardcoded denominator.
  maxScore: number;
  // ── evidence-anchored fields (Phase-4 v4 + Phase-08.1 new 4-section) ─────────
  // `applicable === false` → the section is excluded from the total and rendered
  // as an honest N/A (D-01). Absent on legacy v3 rows (treated as applicable).
  applicable?: boolean;
  evidence?: string;
  strengths?: string[];
  weaknesses?: string[];
  improvements?: string[];
  // ── v3 (legacy 4-section) fields — optional so a v4 section type-checks ──
  status?: 'excellent' | 'good' | 'needs-improvement';
  feedback?: string[];
}

export interface LinkedInTopFix {
  title: string;
  currentText: string;
  suggestedFix: string;
  whyItWorks: string;
  pointsGain: string;
  priority: number;
}

export interface LinkedInNextBestAction {
  action: string;
  reason: string;
  expectedImpact: string;
}

export interface LinkedInResult {
  rawScore: number;
  scoreJustification: string;
  profileInsights?: string[]; // legacy payloads may still contain this; UI intentionally ignores it.
  nextBestAction: LinkedInNextBestAction;
  sectionBreakdown: LinkedInSection[]; // dynamic length (v4 = 11, later shapes = 4, legacy v3 = 4)
  topFixes: LinkedInTopFix[];
  keyStrengths: string[];
  // frontend-only augmentations (preserved from existing file)
  recordId?: string | null;
  created_at?: string;
}

type LinkedInGradeResponse = LinkedInResult & { error?: string; run_id?: string };
type PersistedLinkedInPdfInput = {
  content: string;
  filename: string;
};

// A legacy v3 grade: a rawScore + a sectionBreakdown array (loose — the older
// 4-section shape). A v4 grade also satisfies this, so it is used only as the
// "renderable grade" gate; isV4Grade below distinguishes the 11-section shape.
function isV3Grade(grading_data: unknown): boolean {
  if (!grading_data || typeof grading_data !== 'object') return false;
  const g = grading_data as Record<string, unknown>;
  return typeof g.rawScore === 'number' && Array.isArray(g.sectionBreakdown);
}

// A v4 (11-section, Phase-4) grade: sectionBreakdown whose entries carry the
// per-section `applicable` + `evidence` fields introduced by the 04-02 rubric.
// Used to recognize the evidence-anchored shape at the History/hydration
// boundary; the render itself is field-driven so a v3 row renders its
// `feedback[]` and a v4/new-4-section row renders its evidence/strengths/
// weaknesses/improvements — never back-filling the other's fields
// (RESEARCH Open-Question 3: never fabricate sections onto a legacy row).
// NOTE: four grade shapes coexist in `linkedin_grades.grading_data` and each
// renders in its ORIGINAL shape — no backfill/recompute (D-05):
//   • v3  — legacy pre-Phase-4 4-section (feedback[]/status, no applicable/evidence)
//   • v4  — Phase-4 11-section evidence-anchored (renders 11 cards, as stored)
//   • new — Phase-08.1 4-section evidence-anchored (Headline/About/Experience/
//           Education; renders 4 cards). Structurally a subset of v4.
function isV4Grade(grading_data: unknown): boolean {
  if (!grading_data || typeof grading_data !== 'object') return false;
  const g = grading_data as Record<string, unknown>;
  if (!Array.isArray(g.sectionBreakdown) || g.sectionBreakdown.length === 0) return false;
  const first = g.sectionBreakdown[0] as Record<string, unknown> | undefined;
  return !!first && typeof first.applicable === 'boolean' && typeof first.evidence === 'string';
}

// The Phase-08.1 new 4-section shape (D-05): EXACTLY 4 evidence-anchored sections
// named {Headline, About, Experience, Education} (case-sensitive, mirroring the
// grade-linkedin/schema.ts LINKEDIN_SECTIONS catalogue). This shape structurally
// OVERLAPS `isV4Grade` — a new 4-section grade also satisfies isV4Grade — and that
// is expected: isV5Grade is the explicit, future-proof detector for the new shape
// (e.g. future History filtering), NOT a mutually-exclusive gate. Legacy v4
// 11-section records deliberately do NOT match (length !== 4), so they keep
// rendering their original 11 cards with no collapse/backfill.
const NEW_LINKEDIN_SECTION_NAMES = ['Headline', 'About', 'Experience', 'Education'] as const;
function isV5Grade(grading_data: unknown): boolean {
  if (!grading_data || typeof grading_data !== 'object') return false;
  const g = grading_data as Record<string, unknown>;
  if (!Array.isArray(g.sectionBreakdown) || g.sectionBreakdown.length !== 4) return false;
  const names = new Set(
    (g.sectionBreakdown as Array<Record<string, unknown>>).map((s) => s?.name),
  );
  const namesMatch =
    names.size === NEW_LINKEDIN_SECTION_NAMES.length &&
    NEW_LINKEDIN_SECTION_NAMES.every((n) => names.has(n));
  if (!namesMatch) return false;
  const first = g.sectionBreakdown[0] as Record<string, unknown> | undefined;
  return !!first && typeof first.applicable === 'boolean' && typeof first.evidence === 'string';
}

// The Phase-08.3 direct-100 shape: exactly four evidence-anchored sections in
// the new catalogue. This explicit detector protects future hydration/filtering
// changes while the field-driven renderer continues to preserve every legacy
// record's stored names, maximums, and total without migration or recomputation.
const NEW_08_3_LINKEDIN_SECTION_NAMES = [
  'Headline',
  'About',
  'Experience',
  'Search Alignment, Skills & Credentials',
] as const;
function isV6Grade(grading_data: unknown): boolean {
  if (!grading_data || typeof grading_data !== 'object') return false;
  const g = grading_data as Record<string, unknown>;
  if (!Array.isArray(g.sectionBreakdown) || g.sectionBreakdown.length !== 4) return false;
  const sections = g.sectionBreakdown as Array<Record<string, unknown>>;
  const names = new Set(sections.map((section) => section?.name));
  const namesMatch =
    names.size === NEW_08_3_LINKEDIN_SECTION_NAMES.length &&
    NEW_08_3_LINKEDIN_SECTION_NAMES.every((name) => names.has(name));
  return namesMatch && sections.every(
    (section) => typeof section.applicable === 'boolean' && typeof section.evidence === 'string',
  );
}

/** A grade the results view can render, including all legacy and current shapes. */
function isRenderableGrade(grading_data: unknown): boolean {
  return isV3Grade(grading_data) || isV4Grade(grading_data) || isV5Grade(grading_data) || isV6Grade(grading_data);
}

// Recalibrated LinkedIn score bands (D-03). MIRROR of the source of truth in
// `supabase/functions/grade-linkedin/schema.ts` (LINKEDIN_SCORE_BANDS) — keep in
// sync. Edge code is Deno; we copy the constant rather than import across runtimes.
const LINKEDIN_SCORE_BANDS = [
  { band: 'weak', min: 0, max: 49, label: 'Needs Work' },
  { band: 'average', min: 50, max: 69, label: 'Average' },
  { band: 'strong', min: 70, max: 84, label: 'Strong' },
  { band: 'exceptional', min: 85, max: 100, label: 'Exceptional' },
] as const;

/** Maps a normalized 0-100 total to its recalibrated band label (D-03). */
function scoreBandLabel(total: number): string {
  for (const b of LINKEDIN_SCORE_BANDS) {
    if (total >= b.min && total <= b.max) return b.label;
  }
  return total < LINKEDIN_SCORE_BANDS[0].min ? LINKEDIN_SCORE_BANDS[0].label : 'Exceptional';
}

const LinkedInGraderPage = () => {
  const [profileUrl, setProfileUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LinkedInResult | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const navigate = useNavigate();

  // FEAT-04: additive lifecycle-state recovery. Inert while
  // VITE_FEATURE_ANALYSIS_LIFECYCLE is off (startRun no-ops, no channel/poll/storage)
  // — no behavior change until the flag is flipped in a later phase.
  const analysisRun = useAnalysisRun();

  // PDF upload state
  const [file, setFile] = useState<File | null>(null);
  const [persistedLinkedInPdf, setPersistedLinkedInPdf] = useState<PersistedLinkedInPdfInput | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitGuard = useSubmitGuard({
    feature: 'linkedin-grader',
    inputIdentity: file
      ? `${file.name}:${file.size}:${file.lastModified}:${profileUrl.trim()}`
      : persistedLinkedInPdf
        ? `persisted-linkedin-pdf:${persistedLinkedInPdf.filename}:${persistedLinkedInPdf.content.length}:${profileUrl.trim()}`
        : `no-pdf:${profileUrl.trim()}`,
  });
  
  // Tier gating
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // L3 telemetry + recommendations
  const { recordEvent } = useFeatureUsage('linkedin_grading');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const recShownFiredRef = useRef(false);

  // Merit system
  const { isZero, canAfford, optimisticDeduct } = useMerits();
  const { data: featureCosts } = useFeatureCosts();

  const analysisSteps = [
    'Reading your LinkedIn profile...',
    'Analyzing headline strength...',
    'Evaluating your About section...',
    'Evaluating experience quality...',
    'Checking search alignment & credentials...',
    'Generating personalized fixes...'
  ];

  // D-08/D-09: Render-time reorder — Profile Completeness always first.
  // Does NOT mutate result.sectionBreakdown (AnalysisComparisonModal relies on backend order).
  const orderedSections = useMemo(() => {
    if (!result?.sectionBreakdown) return [];
    const pc = result.sectionBreakdown.find(
      (s) => s.name?.toLowerCase().includes('profile completeness')
    );
    if (!pc) return result.sectionBreakdown;
    const rest = result.sectionBreakdown.filter((s) => s !== pc);
    return [pc, ...rest];
  }, [result?.sectionBreakdown]);

  // L3: fire 'open' on mount
  useEffect(() => {
    recordEvent('open');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fire 'view_results' when results sub-tree becomes visible
  useEffect(() => {
    if (result && !showInput) {
      recordEvent('view_results');
    }
  }, [result, showInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // L3: fetch recommendations + mark shown once when result is ready
  useEffect(() => {
    if (!result?.recordId || recShownFiredRef.current) return;
    recShownFiredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('recommendations')
          .select('*')
          .eq('feature', 'linkedin_grading')
          .eq('source_version_id', result.recordId!);
        if (cancelled || error || !data || data.length === 0) return;
        setRecommendations(data as Recommendation[]);
        const recIds = data.map((r: Recommendation) => r.id);
        await supabase.rpc('record_recommendations_shown', { rec_ids: recIds });
      } catch (err) {
        console.error('[LinkedInGrader] recommendations fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [result?.recordId]);

  // 22-05 D-22: Deep-link hydration from AnalysisHistory (?id=<linkedin_grade_id>).
  // Queries linkedin_grades by id — RLS auto-scopes to auth.uid() = user_id.
  // Invalid/not-found/RLS-blocked id → toast + fall back to default view.
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
        .from('linkedin_grades')
        .select('*')
        .eq('id', idFromUrl)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error('Analysis not found');
        return;
      }
      if (!isRenderableGrade(data.grading_data)) {
        toast.error('Analysis not found');
        return;
      }
      const hydrated = data.grading_data as LinkedInResult;
      hydrated.recordId = data.id;
      hydrated.created_at = data.created_at || undefined;
      setResult(hydrated);
      setIsFromCache(true);
      setShowInput(false);
    })();
    return () => { cancelled = true; };
  }, [idFromUrl]);

  useEffect(() => {
    // WR-05 fix: when a `?id=` is present the dedicated hydration effect
    // above owns `result` and `showInput`. We still need to resolve auth +
    // subscription_tier so gated UI renders correctly, but we SKIP cache-load
    // so it cannot race the
    // `?id=` branch and overwrite the pinned grade with the most-recent one.
    const urlIdForMount = new URLSearchParams(window.location.search).get('id');
    const skipCacheRestore = !!urlIdForMount;

    const checkAccessAndLoadCache = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/auth');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_tier, linkedin_pdf_content, linkedin_pdf_filename')
          .eq('id', user.id)
          .single();

        const tier = profile?.subscription_tier || 'free';
        setSubscriptionTier(tier);
        if (profile?.linkedin_pdf_content) {
          setPersistedLinkedInPdf({
            content: profile.linkedin_pdf_content,
            filename: profile.linkedin_pdf_filename || 'LinkedIn profile.pdf',
          });
        } else {
          setPersistedLinkedInPdf(null);
        }

        if (skipCacheRestore) {
          // Deep-link hydration owns the result. Release the checking-access
          // gate so the page renders, then return.
          return;
        }

        // Cache-load the latest renderable grade for every tier. Billing-cycle
        // state no longer affects eligibility; every new run uses normal Merits.
        const { data: recentRows, error: recentRowsError } = await supabase
          .from('linkedin_grades')
          .select('id, overall_score, grading_data, created_at, profile_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentRowsError) {
          console.error('[LinkedInGrader] recent-grade query failed', recentRowsError);
        }

        const candidate = recentRows?.[0];
        if (candidate && isRenderableGrade(candidate.grading_data)) {
          const cached = candidate.grading_data as LinkedInResult;
          cached.recordId = candidate.id;
          cached.created_at = candidate.created_at || undefined;
          setResult(cached);
          setIsFromCache(true);
          setShowInput(false);
        } else {
          // Legacy row or no row — leave input form visible per D-03
          setResult(null);
        }
      } catch (error) {
        console.error('[LinkedInGrader] Error checking access:', error);
        setSubscriptionTier('free');
      } finally {
        setCheckingAccess(false);
      }
    };

    checkAccessAndLoadCache();
  }, [navigate]);

  // PDF text extraction

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && isPdfFile(droppedFile)) {
      setFile(droppedFile);
    } else {
      toast.error('Please upload a LinkedIn PDF file');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && isPdfFile(selectedFile)) {
      setFile(selectedFile);
    } else {
      toast.error('Please upload a LinkedIn PDF file');
    }
  };

  // XDEV-01 / D-07 — see the note in `src/pages/Upload.tsx`. In `degraded` tier the
  // live CTA below is REPLACED by BlockedAiEntryPoint, so `handleAnalyze` is not
  // reachable at all and no grade, Merit reservation or request can be created.
  const aiBlocked = isAiBlocked();

  const handleAnalyze = async () => {
    const submitToken = submitGuard.beginSubmit();
    if (!submitToken) return;
    if (isZero || !canAfford(linkedInMeritCost)) {
      submitGuard.endSubmit(submitToken);
      return;
    }
    const _pt = perf.start('LinkedIn Grader');
    let contentToAnalyze = '';
    let replacementLinkedInPdf: {
      content: string;
      filename: string;
      metadata?: DocumentExtractionMetadata;
    } | null = null;

    if (!file && !persistedLinkedInPdf) {
      toast.error('Please upload your LinkedIn PDF');
      submitGuard.endSubmit(submitToken);
      return;
    }

    setLoading(true);
    setAnalysisStep(0);

    // Costing correlation only (memory-only, never stored or logged). Begun before
    // browser extraction so parser/OCR spend and the grade join one server run.
    const correlationEnvelope: FeatureRunCorrelationEnvelope = {
      feature: 'linkedin_grader',
      runVariant: 'standard',
      inputType: 'pdf',
      documentCount: 1,
      serverActionNonce: submitToken.attemptNonce,
    };
    let featureRunToken: string | undefined;
    try {
      featureRunToken = await getFeatureRunToken(correlationEnvelope);
    } catch {
      // The backend still creates the run at its own trusted boundary.
      featureRunToken = undefined;
    }

    if (file) {
      try {
        const extraction = await extractDocumentFromPdf({
          file,
          documentType: 'linkedin_profile',
          featureRunToken,
        });
        contentToAnalyze = extraction.text;
        perf.mark(_pt, 'PDF extracted');

        if (contentToAnalyze.length < 100) {
          toast.error('We could not read this LinkedIn PDF reliably. Please upload a text-based PDF.');
          clearFeatureRunToken(correlationEnvelope);
          setLoading(false);
          submitGuard.endSubmit(submitToken);
          return;
        }
        replacementLinkedInPdf = {
          content: contentToAnalyze,
          filename: file.name,
          metadata: extraction.metadata,
        };
      } catch (error) {
        toast.error('We could not read this LinkedIn PDF reliably. Please upload a text-based PDF.');
        clearFeatureRunToken(correlationEnvelope);
        setLoading(false);
        submitGuard.endSubmit(submitToken);
        return;
      }
    } else {
      contentToAnalyze = persistedLinkedInPdf!.content;
    }

    // L3 telemetry
    recordEvent('submit');

    // FEAT-04: mint a fresh attemptNonce for this deliberate grade. Each click is a
    // new-analysis-identifier; the edge derives the idempotency key from it so a
    // resubmit of the SAME action (same nonce) dedups, while a new grade re-runs.
    const attemptNonce = submitToken.attemptNonce;

    // Animate through steps
    const stepInterval = setInterval(() => {
      setAnalysisStep(prev => Math.min(prev + 1, analysisSteps.length - 1));
    }, 700);

    // D-03: optimistic decrement before the network call; one settle closure.
    const cost = linkedInMeritCost;
    const settle = optimisticDeduct(cost);

    // ── Pre-submit watermark (quick task 260713-2ay) ──────────────────────────────
    // The id of the user's newest EXISTING grade, captured before we submit. If the request
    // later fails in an ambiguous way (timeout / 5xx / dropped connection) the server may
    // still have completed and saved the grade. Any newest-row id that differs from this
    // watermark is therefore a grade that landed for THIS run, and we render it instead of
    // showing an error. An id beats a timestamp here: it is immune to client/DB clock skew.
    // RLS already scopes linkedin_grades to auth.uid(), same as the ?id= hydration path.
    let watermarkId: string | null = null;
    try {
      const { data: wm } = await supabase
        .from('linkedin_grades')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      watermarkId = wm?.id ?? null;
    } catch {
      // A failed watermark read must never block the analysis. watermarkId stays null, which
      // only makes recovery more conservative (any newest row would look "new").
    }

    /** Look for a grade that landed despite a client-visible error. */
    const fetchLandedGrade = async (): Promise<LinkedInResult | null> => {
      const { data: row } = await supabase
        .from('linkedin_grades')
        .select('id, grading_data, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row || row.id === watermarkId) return null;
      if (!isRenderableGrade(row.grading_data)) return null;
      const hydrated = row.grading_data as LinkedInResult;
      hydrated.recordId = row.id;
      hydrated.created_at = row.created_at || undefined;
      return hydrated;
    };

    /** Point the URL at a rendered grade so a refresh re-hydrates it via the ?id= path. */
    const pinGradeToUrl = (recordId: string): void => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('id', recordId);
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        /* ignore history failures — inline result is already rendered */
      }
    };

    // Hoisted so the catch can read the server's error BODY, which carries `merits_refunded`
    // (the only honest source for whether a refund actually fired).
    let serverBody: (LinkedInGradeResponse & { merits_refunded?: boolean }) | null = null;

    try {
      const { data, error } = await invokeWithTimeout<LinkedInGradeResponse>(
        'grade-linkedin',
        {
          body: {
            profileData: {
              profileUrl: profileUrl || 'uploaded-pdf',
              profileContent: contentToAnalyze,
            },
            // FEAT-04: new-run signal — the edge computes the idempotency key from it.
            attemptNonce,
            ...(featureRunToken ? { featureRunToken } : {}),
          },
        },
        // Budget invariant: client 180s > server total deadline 165s > per-call 90s.
        // The client must NEVER give up first, or it abandons a run the server completes —
        // charging the user for a grade they never see (quick task 260713-2ay).
        180000,
      );

      serverBody = data as (LinkedInGradeResponse & { merits_refunded?: boolean }) | null;

      clearInterval(stepInterval);
      perf.mark(_pt, 'API responded');

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const normalized = data as LinkedInResult;
      setResult(normalized);
      setIsFromCache(false);
      setShowInput(false);
      settle.commit();
      perf.end(_pt, { score: normalized.rawScore });

      // FEAT-04 recovery wiring (additive; inert while the lifecycle flag is off):
      //  1. Track the run's lifecycle via run_id so refresh/navigation recovers state
      //     (useAnalysisRun persists run_id to URL + localStorage). startRun no-ops
      //     when the flag is off.
      //  2. RE-HYDRATION: persist the saved grade's recordId (linkedin_grades.id,
      //     carried in the edge response body — 04-04) to the URL as `?id=` so a
      //     refresh re-fetches the grade through the EXISTING `?id=` hydration path.
      //     We do NOT rely on useAnalysisRun.previousResult/result_ref for the payload
      //     (analysis_jobs has no result-pointer column; result_ref is always null).
      const runId = (data as LinkedInGradeResponse)?.run_id;
      if (runId) analysisRun.startRun(runId);
      if (normalized.recordId) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('id', normalized.recordId);
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        } catch {
          /* ignore history failures — inline result is already rendered */
        }
      }

      if (replacementLinkedInPdf) {
        setPersistedLinkedInPdf({
          content: replacementLinkedInPdf.content,
          filename: replacementLinkedInPdf.filename,
        });
        void supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return null;
          const updatePayload: Record<string, unknown> = {
            linkedin_pdf_content: replacementLinkedInPdf.content,
            linkedin_pdf_filename: replacementLinkedInPdf.filename,
            linkedin_pdf_updated_at: new Date().toISOString(),
          };

          if (replacementLinkedInPdf.metadata) {
            updatePayload.linkedin_pdf_text_hash = replacementLinkedInPdf.metadata.textHash;
            updatePayload.linkedin_pdf_extraction_metadata = serializeDocumentExtractionMetadata(
              replacementLinkedInPdf.metadata,
            );
          }

          return supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', user.id)
            .then(({ error }) => {
              if (error) {
                console.warn('[LinkedInGrader] linkedin_pdf replacement UPDATE failed', error);
              }
            });
        });
      }

      // Trigger confetti
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#F97316', '#10B981', '#F59E0B'],
        });
      }, 300);

      toast.success('Profile analyzed with personalized insights!');
    } catch (error) {
      // FIRST, unconditionally — a recovery `return` below must not leak the step animation.
      clearInterval(stepInterval);
      console.error('Analysis error:', error);

      // The REAL status, straight off the error (fetchWithTimeout now attaches it).
      // The old code regex-scraped `/\b(4\d\d|5\d\d)\b/` out of error.message; no server
      // message ever contains a bare status code, so it ALWAYS fell through to 500 — which is
      // why every failure, including timeouts, showed the generic "server error" toast.
      const status = (error as { status?: number })?.status ?? 500;

      // AMBIGUOUS failures — the server may have completed and saved the grade anyway:
      // 408 (timeout, either side), 5xx/529, and network/abort errors (no status → 500).
      // 400 / 402 / 403 / 429 are immediate, unambiguous, never-landed failures: surface them
      // instantly rather than making the user wait through a pointless recovery poll.
      const isAmbiguousFailure = status === 408 || status >= 500;

      if (isAmbiguousFailure) {
        // Bounded ~6s: 3 attempts, 2s apart. The grade row may land slightly after the client
        // gave up, so poll rather than checking once.
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const landed = await fetchLandedGrade().catch(() => null);
          if (!landed) continue;

          // The server DID the work and DID charge. Render it, keep the charge (commit
          // refetches the authoritative balance — a rollback here would show a phantom
          // refund), and show NO error toast. This is "one click = one grade = one charge".
          setResult(landed);
          setIsFromCache(false);
          setShowInput(false);
          if (landed.recordId) pinGradeToUrl(landed.recordId);
          settle.commit();
          perf.end(_pt, { score: landed.rawScore });
          return;
        }
      }

      // Nothing landed. Restore the optimistic balance (a CACHE restore — NOT a refund; only
      // the server can refund) and surface honest, error-class-keyed copy. `merits_refunded`
      // comes from the server body; when there is no body at all (client timeout / network)
      // it is false, so the copy makes no refund claim it cannot back up.
      settle.rollback();
      const meritsRefunded = serverBody?.merits_refunded === true;
      const { title, description } = getMeritErrorMessage(status, { meritsRefunded });
      toast.error(title, description ? { description } : undefined);
    } finally {
      setLoading(false);
      // The deliberate action is over on every terminal branch — drop the in-memory
      // correlation so it can never be replayed by a later action.
      clearFeatureRunToken(correlationEnvelope);
      submitGuard.endSubmit(submitToken, { resetAttempt: true });
    }
  };

  // Section-status icon. v3 sections carry a `status`; v4 sections do not, so we
  // derive the icon from the section's own percentage (score / maxScore).
  const getSectionIcon = (pct: number) => {
    if (pct >= 75) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (pct >= 55) return <TrendingUp className="h-5 w-5 text-yellow-500" />;
    return <AlertTriangle className="h-5 w-5 text-primary" />;
  };

  // Score color aligned to the recalibrated D-03 bands (mirrors LINKEDIN_SCORE_BANDS):
  // Red weak (<50), Yellow average (50-69), Orange strong (70-84), Green exceptional (85+).
  // Applies to both the 0-100 overall total and per-section percentages.
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-[#22C55E]';
    if (score >= 70) return 'text-[#F59E0B]';
    if (score >= 50) return 'text-[#FACC15]';
    return 'text-[#E5484D]';
  };

  const canSubmit = !!file || !!persistedLinkedInPdf;
  const linkedInMeritCost = getCostForFeature(featureCosts, 'linkedin_grading', subscriptionTier ?? 'free') ?? 0;

  // D-05: LinkedIn has NO depth gating — Free and Elite both see the full
  // section output (new 4-section, or legacy 11 for stored v4 records) and the
  // complete prioritized fix list. The paid
  // differentiator is Merit budget (runs), not output depth. (The former
  // effective-tier `isFreeGated` blur/locked-section gate was removed here.)

  // Loading state
  if (checkingAccess) {
    return (
      <div className="min-h-viewport bg-background">
        <div className="container mx-auto px-4 pt-6 text-center">
          <div className="animate-pulse">
            <Linkedin className="h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // D-05: Free users flow through the SAME full results display as Elite — every
  // applicable section and the complete fix list, no locked/blurred content.

  return (
    <div className="min-h-viewport bg-background">
      <UniversalAnalyzing
        isAnalyzing={loading}
        title="Analyzing your LinkedIn profile"
        icon={<Linkedin className="w-8 h-8" />}
        stageLabels={LINKEDIN_STAGE_LABELS}
      />
      <div className="container mx-auto px-4 pt-6 pb-12 max-w-7xl">
        <AnimatePresence mode="wait">
          {showInput && !result ? (
            <motion.div
              key="input"
              aria-busy={submitGuard.isSubmitting}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Hero Section */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Linkedin className="h-4 w-4" />
                  Elite LinkedIn Profile Grader
                </div>
                <h1 className="text-4xl md:text-5xl font-bold mb-4">
                  Get <span className="text-primary">Personalized</span> LinkedIn Feedback
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Upload your LinkedIn PDF for the most accurate, personalized analysis with actionable improvements.
                </p>
              </div>

              {/* Input Card */}
              <Card className="p-8 border-2 border-border/50 max-w-2xl mx-auto">
                <div className="space-y-6">
                  {/* Instructions */}
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Linkedin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-semibold text-foreground mb-2">Upload your LinkedIn profile (PDF)</p>
                        <p className="text-muted-foreground mb-2">
                          LinkedIn → Profile → <span className="font-medium">Resources</span> → Save to PDF
                        </p>
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline text-xs cursor-pointer">
                                <HelpCircle className="h-3 w-3" />
                                Why PDF?
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs z-50 bg-popover text-popover-foreground border">
                              <p>LinkedIn doesn't allow automated reading of profiles. Uploading the PDF gives the most accurate results with your real headline, experience, and skills.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>

                  <div className="w-full">
                      <div 
                        onDragOver={handleDragOver} 
                        onDragLeave={handleDragLeave} 
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                          isDragging ? 'border-primary bg-primary/10' : file || persistedLinkedInPdf ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <input 
                          ref={fileInputRef}
                          type="file" 
                          accept={LINKEDIN_PDF_ACCEPT} 
                          onChange={handleFileSelect} 
                          className="hidden" 
                        />
                        {file || persistedLinkedInPdf ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center gap-3">
                              <CheckCircle className="h-8 w-8 text-green-500" />
                              <FileText className="h-12 w-12 text-primary" />
                            </div>
                            <p className="font-medium text-lg">{file?.name || persistedLinkedInPdf?.filename}</p>
                            <p className="text-sm text-muted-foreground">Click to choose a different PDF</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                            <p className="text-lg font-medium">Drag and drop your LinkedIn PDF here</p>
                            <p className="text-sm text-muted-foreground">Paste input is no longer supported.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="hidden">
                      <textarea
                        placeholder="Paste your LinkedIn profile text here...

Include your headline, about section, experience, and skills for the most accurate analysis."
                        value=""
                        readOnly
                        className="min-h-[180px] resize-y"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Paste input disabled</span>
                        <span>PDF required</span>
                      </div>
                    </div>

                  {/* Optional URL */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      LinkedIn URL <span className="text-muted-foreground">(optional, for reference)</span>
                    </label>
                    <Input
                      placeholder="https://linkedin.com/in/yourprofile"
                      value={profileUrl}
                      onChange={(e) => setProfileUrl(e.target.value)}
                      className="h-11"
                    />
                    <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">💡 Customize your LinkedIn URL</p>
                          <p className="mb-1">A clean URL looks more professional on resumes and business cards. Change it to something simple like your name:</p>
                          <p className="font-mono text-foreground bg-background/80 px-2 py-1 rounded inline-block">linkedin.com/in/john-smith</p>
                          <p className="mt-1.5">
                            <span className="font-medium text-foreground">How:</span> LinkedIn → Settings → Public profile → Edit your custom URL
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <LowBalanceWarning />
                  <MeritCostPreview featureCost={linkedInMeritCost} />
                  {aiBlocked ? (
                    <BlockedAiEntryPoint
                      label="Get Personalized Analysis"
                      size="lg"
                      className="w-full h-14 text-lg"
                    />
                  ) : (
                  <Button
                    onClick={handleAnalyze}
                    aria-disabled={loading || submitGuard.isSubmitting || !canSubmit || isZero || !canAfford(linkedInMeritCost)}
                    size="lg"
                    className="w-full h-14 text-lg bg-primary hover:bg-primary/90"
                  >
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>{analysisSteps[analysisStep]}</span>
                      </div>
                    ) : (
                      <>
                        <Zap className="mr-2 h-5 w-5" />
                        Get Personalized Analysis
                      </>
                    )}
                  </Button>
                  )}

                  <div className="mt-2 text-center min-h-[20px]">
                    <span className="text-xs text-muted-foreground">
                      This will use {linkedInMeritCost} Merits
                    </span>
                  </div>
                </div>
              </Card>

              {/* Loading Animation */}
              {loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-8 max-w-2xl mx-auto"
                >
                  <div className="space-y-3">
                    {analysisSteps.map((step, i) => (
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ 
                          opacity: i <= analysisStep ? 1 : 0.3,
                          x: 0
                        }}
                        transition={{ delay: i * 0.1 }}
                        className={`flex items-center gap-3 text-sm ${
                          i <= analysisStep ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {i < analysisStep ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : i === analysisStep ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                        )}
                        {step}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : result ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Scan New Profile button + cache indicator */}
              {/* UI-SPEC F3 (XD-06): heading + CTA exceeded the 216px content
                  box the 72px rail leaves at 320px, and neither group could
                  shrink. Wrapping is the fix; no width was changed. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold">Your LinkedIn Analysis</h2>
                  {isFromCache && result.created_at && (
                    <Badge variant="secondary" className="text-xs">
                      {new Date(result.created_at).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowInput(true);
                    setResult(null);
                    setFile(null);
                    setProfileUrl('');
                    setIsFromCache(false);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Scan New Profile
                </Button>
              </div>
              {/* Score Hero - Clean institutional design */}
              <Card className="relative overflow-hidden border border-border bg-card">
                {/* Compare button */}
                {result.recordId && (
                  <div className="absolute top-4 right-4 z-10">
                    <AnalysisComparisonModal
                      analysisType="linkedin"
                      currentAnalysis={{
                        id: result.recordId,
                        rawScore: result.rawScore,
                        sectionBreakdown: result.sectionBreakdown,
                        topFixes: result.topFixes,
                        keyStrengths: result.keyStrengths,
                        profileInsights: result.profileInsights ?? [],
                        created_at: result.created_at || new Date().toISOString(),
                      }}
                    />
                  </div>
                )}
                
                <div className="p-8 md:p-10">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    {/* Score Circle */}
                    <div className="relative shrink-0">
                      <svg className="w-36 h-36" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                        <motion.circle
                          cx="60" cy="60" r="52" fill="none"
                          strokeWidth="8" strokeLinecap="round"
                          stroke={result.rawScore >= 70 ? 'hsl(142, 71%, 45%)' : result.rawScore >= 50 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 72%, 51%)'}
                          strokeDasharray={`${2 * Math.PI * 52}`}
                          initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - result.rawScore / 100) }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          transform="rotate(-90 60 60)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <motion.span 
                          className={`text-4xl font-black ${getScoreColor(result.rawScore)}`}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5, type: "spring" }}
                        >
                          {result.rawScore}
                        </motion.span>
                        <span className="text-xs text-muted-foreground font-medium">/ 100</span>
                      </div>
                    </div>

                    {/* Score Context */}
                    <div className="flex-1 text-center md:text-left">
                      <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                        <Linkedin className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold text-foreground">LinkedIn Profile Score</h2>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          result.rawScore >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          result.rawScore >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {/* Recalibrated D-03 band label (mirrors LINKEDIN_SCORE_BANDS). */}
                          {scoreBandLabel(result.rawScore)}
                        </span>
                      </div>
                      <p className="text-base font-medium text-foreground mb-3">
                        {result.rawScore >= 85 ? "Exceptional — your profile stands out to recruiters." :
                         result.rawScore >= 70 ? "Strong — a few targeted tweaks will sharpen your edge." :
                         result.rawScore >= 50 ? "Average — focus on the priority fixes below to stand out." :
                         "Needs work — the fixes below will move the needle most."}
                      </p>
                      {result.scoreJustification && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {result.scoreJustification}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Key Strengths */}
              {result.keyStrengths?.length > 0 && (
                <Card className="p-6 border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10">
                  <h3 className="font-semibold text-base mb-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    Your Key Strengths
                  </h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    {result.keyStrengths.map((strength, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="p-3 bg-white dark:bg-card rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm leading-relaxed"
                      >
                        {strength}
                      </motion.div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Next Best Action */}
              {result.nextBestAction && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="p-6 border border-[#F59E0B]/30 bg-[#F59E0B]/5">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="p-2.5 rounded-lg bg-[#F59E0B]/15 shrink-0">
                        <Zap className="h-5 w-5 text-[#F59E0B]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B] mb-1">Next Best Action</p>
                        <p className="font-semibold text-foreground mb-2">{result.nextBestAction.action}</p>
                        <p className="text-sm text-muted-foreground mb-3">{result.nextBestAction.reason}</p>
                        <Badge className="bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30 font-semibold">
                          {result.nextBestAction.expectedImpact}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Section Breakdown */}
              <div>
                <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Section-by-Section Breakdown
                </h2>
                {/* D-05: everything to everyone — no depth gating. Every applicable
                    section renders in full for all tiers; the paid differentiator is
                    Merit budget, not output depth. Sections render dynamically from
                    sectionBreakdown (v4 = 11, later shapes = 4, legacy v3 = 4) —
                    no fixed 4-section / maxScore:20|30|25 assumption. */}
                <div className="grid md:grid-cols-2 gap-4">
                  {orderedSections.map((section, i) => {
                    // D-01: a non-applicable section is excluded from the total and
                    // shown honestly as N/A — never a fabricated bar or filler score.
                    // Legacy v3 sections have no `applicable` field → treated applicable.
                    const isNotApplicable = section.applicable === false;
                    const maxScore = section.maxScore || 0;
                    const pct = !isNotApplicable && maxScore > 0
                      ? Math.max(0, Math.min(100, (section.score / maxScore) * 100))
                      : 0;
                    const barColor = pct >= 75 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-500' : 'bg-red-500';
                    const borderColor = isNotApplicable
                      ? 'border-l-muted border-border'
                      : pct >= 75 ? 'border-l-emerald-500 border-border'
                      : pct >= 55 ? 'border-l-amber-400 border-border'
                      : 'border-l-red-400 border-border';

                    // v4 detail fields (present only on the 11-section shape).
                    const hasV4Detail = !!section.evidence
                      || (section.strengths?.length ?? 0) > 0
                      || (section.weaknesses?.length ?? 0) > 0
                      || (section.improvements?.length ?? 0) > 0;

                    return (
                      <motion.div
                        key={`${section.name}-${i}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.08 }}
                      >
                        <Card className={`h-full border overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 ${borderColor} ${isNotApplicable ? 'opacity-75' : ''}`}>
                          {/* Card header with score */}
                          <div className="px-5 pt-5 pb-3">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2.5">
                                {isNotApplicable
                                  ? <Info className="h-5 w-5 text-muted-foreground" />
                                  : getSectionIcon(pct)}
                                <h3 className="font-semibold text-sm">{section.name}</h3>
                              </div>
                              <div className="text-right">
                                {isNotApplicable ? (
                                  <Badge variant="secondary" className="text-[10px] font-medium">Not applicable</Badge>
                                ) : (
                                  <>
                                    <span className={`text-xl font-black ${getScoreColor(pct)}`}>
                                      {section.score}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-normal">/{section.maxScore}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Progress bar — muted & empty for N/A (excluded from total) */}
                            <div className="w-full h-2 bg-muted rounded-full mb-3">
                              {!isNotApplicable && (
                                <motion.div
                                  className={`h-full rounded-full ${barColor}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.8, delay: 0.3 + i * 0.08 }}
                                />
                              )}
                            </div>
                          </div>

                          {isNotApplicable ? (
                            <div className="px-5 pb-5 border-t border-border pt-3">
                              <p className="text-sm text-muted-foreground">
                                N/A — not scored for this profile. This section doesn't apply to your
                                career stage or role, so it's excluded from your total (no penalty).
                              </p>
                              {section.evidence && (
                                <p className="text-xs text-muted-foreground/80 mt-2 italic">{section.evidence}</p>
                              )}
                            </div>
                          ) : hasV4Detail ? (
                            /* v4: evidence + strengths / weaknesses / improvements. An applicable
                               but absent section shows its honest low score + what's missing
                               (D-04) — never fabricated content. */
                            <div className="px-5 pb-5 space-y-3 border-t border-border pt-3">
                              {section.evidence && (
                                <p className="text-xs text-muted-foreground italic leading-relaxed">
                                  {section.evidence}
                                </p>
                              )}
                              {(section.strengths?.length ?? 0) > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Strengths</p>
                                  {section.strengths!.map((point, idx) => (
                                    <div key={`s-${idx}`} className="flex items-start gap-2">
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(section.weaknesses?.length ?? 0) > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">What's missing</p>
                                  {section.weaknesses!.map((point, idx) => (
                                    <div key={`w-${idx}`} className="flex items-start gap-2">
                                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                                      <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(section.improvements?.length ?? 0) > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">How to improve</p>
                                  {section.improvements!.map((point, idx) => (
                                    <div key={`i-${idx}`} className="flex items-start gap-2">
                                      <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                      <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Legacy v3: render its own feedback bullets — no back-filling
                               of the v4 evidence/strengths/etc. fields it never had. */
                            (section.feedback?.length ?? 0) > 0 && (
                              <div className="px-5 pb-5 space-y-2.5 border-t border-border pt-3">
                                {section.feedback!.slice(0, 4).map((point, idx) => (
                                  <div key={idx} className="flex items-start gap-2.5">
                                    <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                      <span className="text-[9px] font-bold text-primary">{idx + 1}</span>
                                    </div>
                                    <p className="text-xs text-foreground/80 leading-relaxed">{point}</p>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Impact-Based Fixes - Headline first with emphasis */}
              {result.topFixes?.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Ready-to-Paste Improvements
                  </h2>
                  {/* D-05: Free sees the FULL prioritized fix list — no slice, no
                      locked teaser cards. The paid differentiator is Merit budget. */}
                  <div className="space-y-4">
                    {result.topFixes.map((fix, i) => (
                      <motion.div
                        key={fix.title}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                      >
                        <Card className={`overflow-hidden border ${i === 0 ? 'border-transparent shadow-lg ring-1 ring-rose-300/50 dark:ring-rose-500/30' : 'border-border'}`}>
                          {/* Priority banner for first fix */}
                          {i === 0 && (
                            <div className="relative bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between overflow-hidden">
                              <div className="flex items-center gap-1.5 z-10">
                                <Star className="h-3.5 w-3.5 fill-white" />
                                <span className="tracking-wide uppercase text-[11px]">Top Priority</span>
                              </div>
                              <span className="z-10 text-white/90 text-[10px] font-medium">Headline Improvement</span>
                              {/* Shimmer overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            </div>
                          )}
                          <div className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <h4 className="font-semibold text-base">{fix.title}</h4>
                              <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0 ml-2">
                                {fix.pointsGain}
                              </Badge>
                            </div>
                            
                            {/* Current → Suggested side by side on desktop */}
                            <div className="grid md:grid-cols-2 gap-3 mb-3">
                              {fix.currentText && (
                                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current</p>
                                  <p className="text-sm text-muted-foreground italic leading-relaxed">"{fix.currentText}"</p>
                                </div>
                              )}
                              
                              {fix.suggestedFix && (
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Suggested fix:</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => {
                                        navigator.clipboard.writeText(fix.suggestedFix);
                                        toast.success('Copied to clipboard!');
                                      }}
                                    >
                                      <Copy className="h-2.5 w-2.5 mr-0.5" />
                                      Copy
                                    </Button>
                                  </div>
                                  <p className="text-sm font-medium leading-relaxed">{fix.suggestedFix}</p>
                                </div>
                              )}
                            </div>
                            
                            {fix.whyItWorks && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Why this works:</span> {fix.whyItWorks}
                              </p>
                            )}
                            {/* L3: recommendation actions for this fix */}
                            <RecommendationActions
                              recommendation={recommendations.find(
                                (r) => r.suggestion_text === fix.suggestedFix || r.suggestion_text === fix.currentText,
                              )}
                            />
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button 
                  onClick={() => {
                    setResult(null);
                    setFile(null);
                  }} 
                  variant="outline" 
                  size="lg"
                  // UI-SPEC F4: `flex-1` in a COLUMN flex container sets
                  // flex-basis:0 on the MAIN (vertical) axis, collapsing the
                  // 44px CTA to 22px. Scoped to the row direction.
                  className="sm:flex-1"
                >
                  Analyze Another Profile
                </Button>
                <Button 
                  onClick={() => navigate('/upload')} 
                  size="lg"
                  className="sm:flex-1"
                >
                  Grade My Resume Too
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LinkedInGraderPage;
