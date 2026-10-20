import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, FileText, Loader2, AlertCircle, Zap, CheckCircle2, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { useMerits, useInvalidateMerits } from '@/hooks/useMerits';
import { useFeatureCosts, getCostForFeature } from '@/hooks/useFeatureCosts';
import { MeritCostPreview } from '@/components/MeritCostPreview';
import { LowBalanceWarning } from '@/components/LowBalanceWarning';
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  precheckResumeDocument,
} from '@/lib/document-extraction';
import { MSG_VALIDATION_UNAVAILABLE } from '@/config/document-limits';
import { invokeWithTimeout } from '@/lib/fetchWithTimeout';
import { calculateFileHash } from '@/lib/fileHash';
import { normalizeActiveTier } from '@/config/pricing-config';
import { usePaywallGuard } from '@/hooks/usePaywallGuard';
import { OutOfMeritsModalV2 } from '@/components/topup/OutOfMeritsModalV2';
import { getMeritErrorMessage } from '@/lib/merit-error-messages';
import { isAnalysisLifecycleEnabled } from '@/config/feature-flags';
import { useAnalysisLock } from '@/contexts/AnalysisLockContext';
import { PERMITTED_STREAM_STAGE_LABELS } from '@/lib/analysis-stage-copy';
import { useAnalysisRun } from '@/hooks/useAnalysisRun';
import { BlockedAiEntryPoint } from '@/components/platform/CapabilityGate';
import { isAiBlocked } from '@/lib/platform/capabilities';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from '@/lib/feature-run-correlation';

const UploadPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitGuard = useSubmitGuard({
    feature: 'resume-analysis',
    inputIdentity: file ? `${file.name}:${file.size}:${file.lastModified}` : 'no-resume',
  });
  const { total, isZero, canAfford } = useMerits();
  const invalidateMerits = useInvalidateMerits();
  // 05-02 (D-11) frontend submit-lock: disable a NEW submit while an analysis run
  // is active. isLocked = the global UniversalAnalyzing lock (Navbar consumes it too);
  // isActive = a tracked lifecycle run that has not reached a stop state. Both are
  // inert while VITE_FEATURE_ANALYSIS_LIFECYCLE is off (useAnalysisRun early-returns
  // isActive:false, and we gate the lock into the disabled expr on the same flag).
  const {
    isLocked,
    showWaitingSurface,
    hideWaitingSurface,
  } = useAnalysisLock();
  const { isActive: isAnalysisRunActive } = useAnalysisRun();
  const { data: featureCosts } = useFeatureCosts();
  const {
    canAnalyze,
    tier,
    loading: paywallLoading,
    modalProps,
    openModal,
    triggerPaywall,
    refresh: refreshPaywall,
    resetDate,
    analysisCount,
    limit,
  } = usePaywallGuard();

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const clearResumeSelection = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    requestAnimationFrame(() => fileInputRef.current?.focus());
  };

  const selectResumeFile = async (selectedFile: File) => {
    if (isValidating) return;
    setIsValidating(true);
    const result = await precheckResumeDocument(selectedFile, 'resume');
    if (!result.ok) {
      toast.error(result.message);
      clearResumeSelection();
    } else {
      setFile(selectedFile);
    }
    setIsDragging(false);
    setIsValidating(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isValidating) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) await selectResumeFile(droppedFile);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) await selectResumeFile(selectedFile);
  };


  const handleUpload = async () => {
    const submitToken = submitGuard.beginSubmit();
    if (!submitToken) return;
    if (!file) {
      submitGuard.endSubmit(submitToken);
      return;
    }
    if (
      isValidating
      || isZero
      || !canAfford(meritCost)
      || paywallLoading
      || (isAnalysisLifecycleEnabled() && (isLocked || isAnalysisRunActive))
    ) {
      submitGuard.endSubmit(submitToken);
      return;
    }

    setIsUploading(true);
    showWaitingSurface({
      key: 'resume-analysis',
      title: 'Analyzing your resume',
      streamStageLabel: 'Sending your resume for analysis...',
      // The resume ladder emits a REAL per-stage signal, so the index is always
      // supplied (never timed). Results adopts this same surface and advances it
      // from `streamState.stageLabel`.
      stageLabels: PERMITTED_STREAM_STAGE_LABELS,
      activeStageIndex: 0,
    });

    const stopWaiting = () => {
      setIsUploading(false);
      hideWaitingSurface('resume-analysis');
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to upload');
        stopWaiting();
        return;
      }

      // Always re-check paywall at click-time (prevents stale state)
      const latest = await refreshPaywall();
      const latestTier = latest?.tier ?? tier;
      const latestCanAnalyze = latest?.canAnalyze ?? canAnalyze;

      if (latestTier === 'free' && !latestCanAnalyze) {
        triggerPaywall();
        stopWaiting();
        return;
      }

      // Calculate file hash
      const fileHash = await calculateFileHash(file);

      // If user already analyzed this exact file AT THE SAME TIER, reuse it instead of
      // re-running AI (260723-2b0 D-1/D-4/D-6). The tier predicate is what keeps a Free and
      // an Elite analysis of the same file from sharing this client-side short-circuit — the
      // Elite rerun clones the resumes row so file_hash is duplicated across the two rows by
      // design, and without this predicate .limit(1) would non-deterministically serve
      // whichever analyzed last.
      //
      // The normalization is LOAD-BEARING, not hygiene (D-6): latestTier is the raw
      // click-time tier from refreshPaywall() and can be 'pro'. The column only ever carries
      // free/elite (Task 1 CHECK + Task 4 normalized write), so interpolating a raw 'pro'
      // would produce `analyzed_tier.eq.pro` — a predicate that matches NOTHING, a permanent
      // cache MISS, and merits charged for duplicate uploads that are free today. Never
      // interpolate latestTier directly. normalizeActiveTier already fails closed to 'free'.
      //
      // D-4 (asymmetric NULL): NULL matches ANY tier here, so a legacy row is still reused
      // free of charge exactly as today; the Results rerun CTA (Task 9) instead requires an
      // explicit 'free', so unknown never triggers a charge prompt.
      const cacheTier = normalizeActiveTier(latestTier); // 'free' | 'elite' — collapses 'pro'
      const { data: existingResume, error: existingResumeError } = await supabase
        .from('resumes')
        .select('id, analyzed_at, analyzed_tier')
        .eq('user_id', user.id)
        .eq('file_hash', fileHash)
        .not('grading_data', 'is', null)
        .or(`analyzed_tier.eq.${cacheTier},analyzed_tier.is.null`)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingResumeError && existingResume?.id) {
        stopWaiting();
        const reusedTier = (existingResume as { analyzed_tier?: string | null }).analyzed_tier;
        toast.message(
          reusedTier
            ? `Using your previous ${reusedTier === 'elite' ? 'Elite' : 'Free'} analysis for this resume.`
            : 'Using your previous analysis for this resume.',
        );
        navigate(`/results/${existingResume.id}`);
        return;
      }

      const { data: validationData, error: validationError } = await invokeWithTimeout<{
        ok?: boolean;
        message?: string;
      }>('validate-document', {
        body: file,
        headers: {
          'x-document-type': 'resume',
          'x-file-name': encodeURIComponent(file.name),
        },
      }, 30000);
      if (validationError || validationData?.ok !== true) {
        toast.error(validationData?.message || MSG_VALIDATION_UNAVAILABLE);
        clearResumeSelection();
        stopWaiting();
        return;
      }

      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('resumes').upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        toast.error('Failed to upload file');
        stopWaiting();
        return;
      }

      // Use signed URL for private bucket - expires in 1 year (31536000 seconds)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage.from('resumes').createSignedUrl(fileName, 31536000);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Failed to create signed URL:', signedUrlError);
        toast.error('Failed to generate file access URL');
        stopWaiting();
        return;
      }

      const fileUrl = signedUrlData.signedUrl;

      const { data: resume, error: insertError } = await supabase.from('resumes').insert({
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
        file_url: fileUrl,
        file_path: fileName,
        file_hash: fileHash
      }).select().single();

      if (insertError || !resume) {
        console.error('Database insert error:', insertError);
        toast.error('Failed to save resume record');
        stopWaiting();
        return;
      }

      // Costing correlation only (memory-only, never stored). Begin the deliberate
      // action BEFORE browser extraction so any parser/OCR spend joins the same server
      // run the analysis request later resumes. A failure here changes nothing: the
      // backend still creates the run at its own trusted boundary.
      const correlationEnvelope: FeatureRunCorrelationEnvelope = {
        feature: 'resume_analysis',
        runVariant: 'standard',
        inputType: 'pdf',
        documentCount: 1,
        serverActionNonce: submitToken.attemptNonce,
      };
      let featureRunToken: string | undefined;
      try {
        featureRunToken = await getFeatureRunToken(correlationEnvelope);
      } catch {
        featureRunToken = undefined;
      }

      let resumeText = '';
      try {
        const extraction = await extractDocumentFromFile({
          file,
          documentType: 'resume',
          resumeId: resume.id,
          featureRunToken,
        });
        resumeText = extraction.text;
        console.log('Extracted resume text length:', resumeText.length);
      } catch (extractError) {
        console.error('Document text extraction failed:', extractError);
        toast.error('We could not read this file reliably.', {
          description: `Please upload a ${RESUME_DOCUMENT_TYPE_LABEL} file with selectable text.`
        });
        clearFeatureRunToken(correlationEnvelope);
        stopWaiting();
        return;
      }

      // Fetch the user's most recent analysis for improvement tracking
      let previousSuggestions: any[] = [];
      let previousScore: number | null = null;

      const { data: previousResume } = await supabase
        .from('resumes')
        .select('overall_score, grading_data')
        .eq('user_id', user.id)
        .not('grading_data', 'is', null)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousResume?.grading_data && previousResume?.overall_score) {
        previousSuggestions = (previousResume.grading_data as any).suggestions || [];
        previousScore = previousResume.overall_score;
        console.log('Found previous analysis for improvement tracking:', {
          previousScore,
          suggestionsCount: previousSuggestions.length
        });
      }

      // 05-02 (D-03): mint a FRESH attemptNonce per deliberate submit — the
      // deliberate-new-run signal. Threaded into the stream params so the edge derives
      // a STABLE idempotencyKey (same content + same nonce → exactly one charge/run on
      // a retry of THIS attempt; a deliberate re-run mints a new nonce → a fresh run).
      // We do NOT deduct here on Upload (the single optimistic deduction stays in
      // useResumeStream at stream start, T-31-07 double-deduct guard). Inert on the
      // server while the flag is off; harmless additive field otherwise.
      const attemptNonce = submitToken.attemptNonce;

      // Store params for streaming on the Results page. meritCost rides along so
      // useResumeStream can fire the single optimistic deduction at stream start
      // (D-03 / Open Q2) — we deliberately do NOT deduct here on Upload, to avoid
      // a double-deduct across the Upload→Results navigation (T-31-07).
      sessionStorage.setItem(
        `stream_params_${resume.id}`,
        JSON.stringify({
          resumeId: resume.id,
          resumeText,
          userId: user.id,
          tier: latestTier,
          previousSuggestions,
          previousScore,
          meritCost,
          attemptNonce,
        })
      );

      // Keep the application-owned waiting host alive across navigation.
      // Results adopts this same surface and owns terminal cleanup.
      setIsUploading(false);
      navigate(`/results/${resume.id}?stream=true`);
    } catch (error: any) {
      console.error('Upload handler error:', error);

      try {
        invalidateMerits();
      } catch (e) {
        console.error('Failed to invalidate merit balance:', e);
      }

      const errorMsg = error?.message || String(error || 'Failed to upload resume');
      const lowerError = errorMsg.toLowerCase();
      const isCreditsError = lowerError.includes('payment') ||
                             lowerError.includes('402') ||
                             lowerError.includes('credit');

      const isNetworkError = lowerError.includes('network') ||
                            lowerError.includes('connection') ||
                            lowerError.includes('timeout') ||
                            lowerError.includes('500');

      if (isCreditsError) {
        // UX-04 / D-03: route 402 'insufficient_merits' through OutOfMeritsModalV2.
        openModal({
          feature: 'Resume Analysis',
          cost: meritCost,
          balance: total,
        });
      } else if (isNetworkError) {
        // NFR-04: error-class-keyed copy from the shared taxonomy (no generic string).
        const { title, description } = getMeritErrorMessage('network');
        toast.error(title, description ? { description } : undefined);
      } else {
        const { title, description } = getMeritErrorMessage(500);
        toast.error(title, description ? { description } : undefined);
      }

      stopWaiting();
    } finally {
      submitGuard.endSubmit(submitToken, { resetAttempt: true });
    }
  };

  const meritCost = getCostForFeature(featureCosts, 'resume_analysis', tier) ?? 0;

  // XDEV-01 / D-07. Capability is a property of the browser, resolved once per page
  // session and memoized, so this is a plain call rather than a hook. In `degraded`
  // tier the live CTA is REPLACED (not merely disabled) so there is no handler left
  // to fire: no run is created, no Merit reserved, no request issued.
  const aiBlocked = isAiBlocked();

  return (
    <>
      <div className="container mx-auto px-4 pt-6 pb-12 max-w-3xl">
        <h1 className="mb-2 text-center text-3xl font-bold sm:text-4xl">Upload your resume to activate Recruiting Lens™</h1>
        <p className="text-muted-foreground text-center mb-8 max-w-xl mx-auto">We analyze your profile through recruiter scanning patterns, ATS logic, and industry-specific expectations — then show you how to move up a tier.</p>

        {/* Why Strivo Section */}
        <Card className="p-6 mb-8 bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/30">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" style={{ color: "#FF6B6B" }} />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold mb-3 text-foreground">Why You Need Strivo</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                  <span><strong className="text-foreground">70% of resumes are rejected by ATS</strong> before a human ever sees them</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                  <span><strong className="text-foreground">Our AI-powered system</strong> analyzes your resume like top recruiters do, using Harvard/UPenn career center standards</span>
                </li>
                <li className="flex items-start gap-2">
                  <Star className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#FF6B6B" }} />
                  <span><strong className="text-foreground">Trusted by candidates</strong> across Fortune 500 companies and high-growth startups.</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Show upgrade banner for free users who've used their monthly merits */}
        {tier === 'free' && !canAnalyze && !paywallLoading && (
          <Card className="p-6 border-2 border-destructive/50 bg-destructive/10 mb-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-2 text-foreground">You've Used Your Free Merits</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Your credits will reset {resetDate ? (
                    <strong>on {new Date(resetDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                  ) : (
                    <strong>in about 1 month</strong>
                  )}. Upgrade to Elite for <strong>150 Merits/month</strong> and unlock the richest outputs.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => triggerPaywall()}>
                    <Zap className="mr-2 h-4 w-4" />
                    Upgrade to Elite
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Used {analysisCount}/{limit} this period
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4 sm:p-8">
          <div onDragOver={handleDragOver} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
            aria-busy={isValidating || submitGuard.isSubmitting}
            className={`border-2 border-dashed rounded-lg p-6 sm:p-8 md:p-12 text-center transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
            {file ? (
              <div className="space-y-4">
                <FileText className="h-16 w-16 mx-auto text-primary" />
                <p className="font-medium text-lg min-w-0 truncate" title={file.name}>{file.name}</p>
                <Button className="w-full min-h-11 sm:w-full md:w-auto" variant="outline" disabled={isValidating || isUploading} onClick={clearResumeSelection}>Choose Different File</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-16 w-16 mx-auto text-muted-foreground" />
                <p className="text-lg font-medium">Drag and drop your resume here</p>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT} aria-describedby="upload-resume-help" onChange={handleFileSelect} disabled={isValidating || isUploading} className="sr-only" id="file-input" />
                <label htmlFor="file-input" className="block w-full md:inline-block md:w-auto"><Button className="w-full min-h-11 md:w-auto" variant="outline" disabled={isValidating || isUploading} asChild><span>{isValidating ? 'Validating...' : 'Browse Files'}</span></Button></label>
                <p id="upload-resume-help" className="text-sm text-muted-foreground break-words">PDF or DOCX files supported. Maximum 2 pages.</p>
              </div>
            )}
          </div>
{aiBlocked ? (
  // Rendered without waiting for a file: in `degraded` tier picking one cannot lead
  // anywhere, and telling the user that up front is more honest than letting them
  // choose a file and only then explaining. The dropzone above is untouched.
  <div className="mt-6">
    <BlockedAiEntryPoint label="Analyze Resume" className="w-full" size="lg" />
  </div>
) : file && (
  <div>
    <div className="mt-6">
      <LowBalanceWarning />
      <MeritCostPreview featureCost={meritCost} />
    </div>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">
            <Button
              className="w-full"
              size="lg"
              onClick={handleUpload}
              aria-disabled={isValidating || submitGuard.isSubmitting || isZero || !canAfford(meritCost) || paywallLoading || (isAnalysisLifecycleEnabled() && (isLocked || isAnalysisRunActive))}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : tier === 'free' && !canAnalyze ? (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Upgrade to Analyze
                </>
              ) : (
                'Analyze Resume'
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
    <p className="text-sm text-muted-foreground mt-2 text-center">
      {isUploading ? 'Sending your resume for analysis - this only takes a moment.' : tier === 'free' && !canAnalyze ? 'Upgrade to unlock unlimited resume analyses.' : `We will parse your ${RESUME_DOCUMENT_TYPE_LABEL} file and grade it against our rubric.`}
    </p>
  </div>
)}
        </Card>

        <OutOfMeritsModalV2 {...modalProps} />
      </div>
    </>
  );
};

export default UploadPage;
