import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import {
  clearFeatureRunToken,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from "@/lib/feature-run-correlation";
import { mapAnalysisError } from "@/lib/analysisError";
import { useAnalysisRun } from "@/hooks/useAnalysisRun";
import { useMerits, useInvalidateMerits } from "@/hooks/useMerits";
import { getPendingUpgrade, clearPendingUpgrade } from "@/lib/pendingUpgrade";
import { useProfessionalGoal } from "@/hooks/useProfessionalGoal";
import { isAnalysisLifecycleEnabled } from "@/config/feature-flags";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Linkedin,
  Target,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Eye,
  Loader2,
  X,
} from "lucide-react";
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  extractDocumentFromPdf,
  isAcceptedResumeDocument,
  isPdfFile,
  LINKEDIN_PDF_ACCEPT,
  serializeDocumentExtractionMetadata,
  type DocumentExtractionMetadata,
  precheckResumeDocument,
} from "@/lib/document-extraction";
import { MSG_VALIDATION_UNAVAILABLE } from "@/config/document-limits";
import { calculateFileHash } from "@/lib/fileHash";
import { useAnalysisLock } from "@/contexts/AnalysisLockContext";
// The `stageLabels` ladder for the onboarding analysis overlay. Shared with
// Results (quick 260803-t6v) so the page that ADOPTS this wait can re-derive the
// exact same array rather than importing it from a sibling page.
import { ONBOARDING_STAGE_LABELS } from "@/lib/analysis-stage-copy";
import { useThemeLogo } from "@/hooks/useThemeLogo";
// Moved VERBATIM to @/lib/taxonomies (quick 260712-msh Task 1E) so the TS chip list
// and the public.goal_taxonomy seed the SQL Goal Readiness scorer parses against have
// ONE authorable source. A static guard asserts the two never drift.
import { ROLE_OPTIONS, INTEREST_OPTIONS } from "@/lib/taxonomies";
import { useSubmitGuard, type SubmitToken } from "@/hooks/useSubmitGuard";

export default function Onboarding() {
  const strivoLogo = useThemeLogo();
  const navigate = useNavigate();
  // FEAT-01 (05-01): additive lifecycle-run tracking. Inert while
  // VITE_FEATURE_ANALYSIS_LIFECYCLE is off (startRun no-ops — no channel/poll/storage),
  // so onboarding stays byte-identical until the flag is flipped.
  const analysisRun = useAnalysisRun();
  // Entitlement freshness (quick 260718-j2x): the analyze-resume edge resolves tier
  // authoritatively server-side from profiles.subscription_tier and discards any client
  // tier. reconcileTierUpgrade / invalidateMerits refresh that read path before dispatch so
  // a mid-onboarding Stripe upgrade can't leave an Elite user on a stale free row.
  const [searchParams] = useSearchParams();
  const { reconcileTierUpgrade } = useMerits();
  const invalidateMerits = useInvalidateMerits();
  // first-attempt-reliability (directions 1+2): the shared attempt nonce and uploaded resume
  // row are HELD across a same-page retry. A
  // re-submit of the SAME intent therefore reuses the server idempotency key
  // (create_or_recover -> already_deducted -> charged exactly once) and recovery-by-resumeId
  // keeps working (no duplicate resumes row). Both are released ONLY on a terminal outcome —
  // completed (success/landed navigate) or terminal-failed (after recovery checks fail) — so
  // a genuinely new deliberate run legitimately charges again.
  const resumeRecordRef = useRef<{ id: string } | null>(null);
  // The ONE goal data seam. saveGoal writes ONLY the raw goal text — the DB trigger
  // computes and persists Goal Readiness in the same transaction. No AI, no invoke.
  const { saveGoal } = useProfessionalGoal();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  /**
   * Terminal analysis failure for the CURRENT attempt (quick task 260810-9vx).
   *
   * Onboarding used to answer a terminal failure with a red toast and nothing else:
   * the user was left on the setup screen with a disappearing error, no explanation of
   * what happened to their upload or their credits, and no affordance to continue.
   * That is the dead end this state removes — it is rendered as a persistent,
   * actionable card next to the submit button. `null` whenever a run is healthy.
   */
  const [analysisFailure, setAnalysisFailure] = useState<
    { message: string; retryable: boolean } | null
  >(null);
  // The full-screen analysis overlay is NOT page state (quick 260803-mqs) — it is owned
  // by the route-independent <AnalysisWaitingHost> mounted above <Routes>. See the seed
  // at the FULL-path commit point below.
  const { showWaitingSurface, hideWaitingSurface } = useAnalysisLock();
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Step 1: Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isValidatingResume, setIsValidatingResume] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Step 2: LinkedIn PDF
  const [linkedinPdfFile, setLinkedinPdfFile] = useState<File | null>(null);
  const linkedinInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Roles & Interests
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);

  // Step 4: The ONE professional goal. Free text — the user's wording is preserved
  // verbatim. Never inferred, never auto-generated, never backfilled (CONTEXT §2).
  const [professionalGoal, setProfessionalGoal] = useState("");
  // A LEGACY user (resume already uploaded, no goal yet) opens directly on Step 4 and
  // must NEVER be made to repeat Steps 1-3.
  const [isGoalOnlyFlow, setIsGoalOnlyFlow] = useState(false);
  const submitGuard = useSubmitGuard({
    feature: "onboarding-resume-analysis",
    inputIdentity: resumeFile
      ? `${resumeFile.name}:${resumeFile.size}:${resumeFile.lastModified}`
      : "no-resume",
  });

  useEffect(() => {
    checkExistingOnboarding();
  }, []);

  const checkExistingOnboarding = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Check if user already has a resume
      const { data: resumes } = await supabase
        .from("resumes")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      // Load any existing target data (now including the professional goal)
      const { data: targets } = await supabase
        .from("career_targets")
        .select("target_roles, target_industries, professional_goal")
        .eq("user_id", user.id)
        .maybeSingle();

      await supabase
        .from("profiles")
        .select("linkedin_pdf_content")
        .eq("id", user.id)
        .single();

      if (targets?.target_roles?.length) {
        setSelectedRoles(targets.target_roles);
      }
      if (targets?.target_industries?.length) {
        setSelectedIndustries(targets.target_industries);
      }

      const hasResume = !!(resumes && resumes.length > 0);
      const hasGoal = !!targets?.professional_goal?.trim();

      if (hasResume && hasGoal) {
        // Fully onboarded under the new 4-step contract.
        navigate("/dashboard");
        return;
      }

      if (hasResume && !hasGoal) {
        // LEGACY USER. They already did Steps 1-3 before Step 4 existed. Drop them
        // straight onto Step 4 — do NOT redirect to /dashboard (the Task-5 route gate
        // would only bounce them back here, an infinite loop) and do NOT make them
        // repeat Steps 1-3.
        setIsGoalOnlyFlow(true);
        setStep(4);
        return;
      }

      // No resume -> the normal flow, from Step 1.
    } catch (error) {
      console.error("Error checking onboarding:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleResumeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const clearResumeSelection = () => {
    setResumeFile(null);
    // The held upload belongs to the file being cleared (260810-9vx). Dropping it here
    // keeps `resumeRecordRef` a cache of "the row for the CURRENTLY selected file"
    // rather than "the last row we ever uploaded" — the failure path below now
    // preserves the ref so a retry does not re-upload, and without this a user who
    // swaps in a different resume after a failure would silently be analyzed against
    // the previous file.
    resumeRecordRef.current = null;
    setAnalysisFailure(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    requestAnimationFrame(() => resumeInputRef.current?.focus());
  };

  const selectResumeFile = async (file: File) => {
    if (isValidatingResume) return;
    setIsValidatingResume(true);
    const result = await precheckResumeDocument(file, "resume");
    if (!result.ok) {
      toast.error(result.message);
      clearResumeSelection();
    } else {
      // A newly chosen file invalidates any previously uploaded row (see above).
      resumeRecordRef.current = null;
      setAnalysisFailure(null);
      setResumeFile(file);
    }
    setIsDragging(false);
    setIsValidatingResume(false);
  };

  const handleResumeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isValidatingResume) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) await selectResumeFile(droppedFile);
  };

  const handleResumeSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) await selectResumeFile(selectedFile);
  };

  const handleLinkedinPdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isPdfFile(file)) {
      setLinkedinPdfFile(file);
    } else {
      toast.error("Please upload a LinkedIn PDF file");
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleIndustry = (industry: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(industry) ? prev.filter((i) => i !== industry) : [...prev, industry]
    );
  };

  // first-attempt-reliability (direction 2): authoritative re-read of resumes.grading_data
  // by resumeId. The synchronous onboarding save writes grading_data regardless of a
  // client-side give-up (the 120s Promise.race does not cancel the Edge run), so a populated
  // row means the run completed and was charged exactly once — recover it instead of toasting
  // a false failure. A single read is sufficient: a result that has NOT landed by the give-up
  // but whose run is still alive is caught by the AMBIGUOUS branch handing off to Results,
  // which polls resumes.grading_data on an interval. RLS scopes this read to the owner.
  const onboardingResultLanded = async (resumeId: string): Promise<boolean> => {
    const { data } = await supabase
      .from("resumes")
      .select("grading_data")
      .eq("id", resumeId)
      .maybeSingle();
    return data?.grading_data != null;
  };

  const handleFinishSetup = async () => {
    let submitToken: SubmitToken | null = null;
    if (loading) return;

    // The goal is REQUIRED under the new 4-step contract. Mirrors the !resumeFile guard.
    if (!professionalGoal.trim()) {
      toast.error("Please set your professional goal first");
      setStep(4);
      return;
    }

    // ── GOAL-ONLY PATH (legacy user) ───────────────────────────────────────────
    // They already have a resume / LinkedIn / targets. Save ONLY the goal, then go to
    // the dashboard. Do NOT re-upload a resume, do NOT re-run analysis, do NOT touch
    // target_roles / target_industries / profiles.
    //
    // The DB trigger computes and persists Goal Readiness INSIDE this same write —
    // no edge-function invoke, no AI call, no second round-trip.
    if (isGoalOnlyFlow) {
      setLoading(true);
      try {
        await saveGoal(professionalGoal);
        toast.success("Goal saved! Building your Goal Readiness...");
        navigate("/dashboard");
      } catch (error: unknown) {
        console.error("Goal save error:", error);
        toast.error(error instanceof Error ? error.message : "Could not save your goal. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── FULL PATH (new user) ───────────────────────────────────────────────────
    if (!resumeFile) {
      toast.error("Please upload your resume first");
      setStep(1);
      return;
    }

    // Committed to the FULL path — arm the re-entrancy guard alongside the spinner. The
    // early-return guards above never reach here, so the ref can only stick true while the
    // FULL-path finally is pending (which always resets it).
    submitToken = submitGuard.beginSubmit();
    if (!submitToken) return;
    // A new attempt supersedes the previous failure card (260810-9vx).
    setAnalysisFailure(null);
    setLoading(true);
    // The onboarding analysis overlay is owned by the route-independent
    // <AnalysisWaitingHost> (App.tsx), NOT by this page — mirrors Upload.tsx:146.
    // The submit path navigates to /results while the run is still in flight, and a
    // page-level overlay is destroyed by that navigation; a host-owned one is not, so
    // the ladder, its step timer and the 45s/120s thresholds all survive the boundary.
    // `activeStageIndex` is deliberately OMITTED — onboarding emits no per-stage signal,
    // so the sanctioned timed step advance in UniversalAnalyzing drives the ladder.
    // `title` MUST stay byte-identical to Results' non-elite title: both the step timer
    // and the elapsed-threshold map are keyed on it.
    showWaitingSurface({
      key: 'resume-analysis',
      title: 'Analyzing your resume',
      stageLabels: ONBOARDING_STAGE_LABELS,
    });

    // Costing correlation only — assigned once the deliberate action begins and
    // released on every terminal branch. Never stored outside this closure.
    let correlationEnvelope: FeatureRunCorrelationEnvelope | null = null;
    // Fail-safe teardown (quick 260803-mqs D4): set immediately before each of the four
    // /results navigations. Every path that does NOT navigate — validation failure,
    // terminal analysis failure, an unexpected throw, or a future branch nobody
    // remembers to update — falls through to the `finally` and drops the overlay.
    let handedOffToResults = false;
    // Durable handoff marker (quick 260803-t6v): the resume id whose
    // `onboarding_wait_<id>` key this attempt wrote, so the `finally` can clear it on
    // any path that never reaches /results. Held out here because `resume` is
    // block-scoped inside the try.
    let onboardingWaitMarkerId: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      setIsValidatingResume(true);
      const { data: validationData, error: validationError } = await invokeWithTimeout<{
        ok?: boolean;
        message?: string;
      }>("validate-document", {
        body: resumeFile,
        headers: {
          "x-document-type": "resume",
          "x-file-name": encodeURIComponent(resumeFile.name),
        },
      }, 30000);
      setIsValidatingResume(false);
      if (validationError || validationData?.ok !== true) {
        toast.error(validationData?.message || MSG_VALIDATION_UNAVAILABLE);
        clearResumeSelection();
        setStep(1);
        return;
      }

      // Costing correlation only (memory-only, never stored). Onboarding submits a resume
      // plus an optional LinkedIn PDF.
      //
      // PERF (quick 260805-8ni): FIRED HERE, NOT AWAITED. `begin-feature-run` cost 4.21s of
      // the measured 11.57s pre-dispatch overhead in prod — 36% of it — while returning 503
      // on 100% of calls. Awaiting it bought nothing and blocked the user outright. The
      // result was ALREADY optional (the old try/catch fell back to `undefined` because the
      // backend re-creates the run at its own trusted boundary), so only the wait was ever
      // load-bearing. Starting it here overlaps the round-trip with the upload → signed URL
      // → insert chain below; it is awaited at its first consumer, by which point it has
      // settled.
      //
      // MUST NOT MOVE EARLIER THAN THE VALIDATION GATE ABOVE: firing before validation would
      // mint costing runs for documents that are then rejected — runs that are never created
      // today. That is a behavior change, not a speedup.
      //
      // The `.catch` is attached AT CREATION so a 503 on a promise nobody is awaiting yet
      // cannot surface as an unhandled rejection. It resolves to `undefined`, which is the
      // exact value the old `catch` block assigned.
      correlationEnvelope = {
        feature: 'resume_analysis',
        runVariant: 'standard',
        inputType: linkedinPdfFile ? 'mixed' : 'pdf',
        documentCount: linkedinPdfFile ? 2 : 1,
        serverActionNonce: submitToken.attemptNonce,
      };
      const featureRunTokenPromise: Promise<string | undefined> =
        getFeatureRunToken(correlationEnvelope).catch(() => undefined);

      // 1-2. Upload + persist the resume row — but ONLY once per logical attempt. On a
      // same-page retry the row already exists; re-uploading would mint a NEW resumes row
      // (a different run identity + a second charge) and break recovery-by-resumeId, so we
      // reuse the held record instead (first-attempt-reliability, direction 1).
      let resume: { id: string };
      if (resumeRecordRef.current) {
        resume = resumeRecordRef.current;
      } else {
        const fileHash = await calculateFileHash(resumeFile);
        const fileName = `${user.id}/${Date.now()}_${resumeFile.name}`;

        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(fileName, resumeFile);

        if (uploadError) throw uploadError;

        // Get signed URL
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("resumes")
          .createSignedUrl(fileName, 31536000);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error("Failed to generate file URL");
        }

        // Save resume record
        const { data: insertedResume, error: resumeError } = await supabase
          .from("resumes")
          .insert({
            user_id: user.id,
            file_name: resumeFile.name,
            file_size: resumeFile.size,
            file_url: signedUrlData.signedUrl,
            file_path: fileName,
            file_hash: fileHash,
          })
          .select()
          .single();

        if (resumeError) throw resumeError;
        resume = insertedResume;
        resumeRecordRef.current = { id: insertedResume.id };
      }

      // DURABLE HANDOFF MARKER (quick 260803-t6v). Written ONCE, here, because this is
      // the first point `resume.id` exists and it precedes all four navigations to
      // /results — so every handoff path is covered by construction rather than by
      // remembering to update each branch. Mirrors how Upload.tsx writes
      // `stream_params_<id>` before navigating.
      //
      // WHY A MARKER AND NOT IN-MEMORY STATE: <StrictMode> double-invokes effects, so
      // Results' unmount cleanup (`hideWaitingSurface('resume-analysis')`) lands BETWEEN
      // its own two effect runs and nulls the live waiting-surface record. Anything that
      // remembers the ladder in memory is destroyed by that hide; a sessionStorage key is
      // not, so Results can RE-DERIVE the ladder on every effect run.
      sessionStorage.setItem(`onboarding_wait_${resume.id}`, '1');
      onboardingWaitMarkerId = resume.id;

      // First consumer of the correlation token. The request was started before the upload
      // chain above, so this await is on an already-settled promise in the common case —
      // the round-trip has been absorbed by the upload → signed URL → insert latency rather
      // than added to it. Still begun before browser extraction, so every parser/OCR route
      // and the onboarding analysis land on one server run. Resolves to `undefined` on
      // failure (the backend still creates the run at its own trusted boundary).
      const featureRunToken: string | undefined = await featureRunTokenPromise;

      // 3. Extract and save LinkedIn PDF content if provided
      let linkedinPdfContent = "";
      let linkedinPdfMetadata: DocumentExtractionMetadata | undefined;
      if (linkedinPdfFile) {
        try {
          const linkedinExtraction = await extractDocumentFromPdf({
            file: linkedinPdfFile,
            documentType: 'linkedin_profile',
            featureRunToken,
          });
          linkedinPdfContent = linkedinExtraction.text;
          linkedinPdfMetadata = linkedinExtraction.metadata;
        } catch (e) {
          console.error("LinkedIn PDF extraction failed:", e);
        }
      }

      // 4. Update career targets and LinkedIn content
      const profileUpdate: {
        linkedin_pdf_content?: string;
        linkedin_pdf_filename?: string;
        linkedin_pdf_updated_at?: string;
        linkedin_pdf_text_hash?: string;
        linkedin_pdf_extraction_metadata?: ReturnType<typeof serializeDocumentExtractionMetadata>;
      } = {};

      if (linkedinPdfContent && linkedinPdfFile) {
        profileUpdate.linkedin_pdf_content = linkedinPdfContent;
        profileUpdate.linkedin_pdf_filename = linkedinPdfFile.name;
        profileUpdate.linkedin_pdf_updated_at = new Date().toISOString();
        if (linkedinPdfMetadata) {
          profileUpdate.linkedin_pdf_text_hash = linkedinPdfMetadata.textHash;
          profileUpdate.linkedin_pdf_extraction_metadata = serializeDocumentExtractionMetadata(linkedinPdfMetadata);
        }
      }

      const writes: PromiseLike<{ error: unknown }>[] = [
        supabase
          .from("career_targets")
          .upsert({
            user_id: user.id,
            target_roles: selectedRoles,
            target_industries: selectedIndustries,
            // Step 4. TWO EXTRA FIELDS ON THE EXISTING WRITE — deliberately not a second
            // write. The career_targets trigger fires on this upsert and persists Goal
            // Readiness immediately; the resumes trigger fires again when the analysis
            // lands. Zero AI calls, zero edge-function invokes.
            professional_goal: professionalGoal.trim(),
            professional_goal_set_at: new Date().toISOString(),
          }, { onConflict: "user_id" }),
      ];

      if (Object.keys(profileUpdate).length > 0) {
        writes.push(
          supabase
            .from("profiles")
            .update(profileUpdate)
            .eq("id", user.id),
        );
      }

      // REVERTED (quick 260805-8ni): the writes, the extraction and the merits refresh were
      // briefly run concurrently as a latency optimization. They are NOT as independent as they
      // look — the `career_targets` upsert fires the Goal Readiness trigger, whose
      // `compute_goal_readiness()` READS `resumes`, while `extractDocumentFromFile` ->
      // `persistAcceptedPdfjsResumeText` WRITES `resumes`. Overlapping them made onboarding
      // intermittently hang at the final waiting stage and never navigate to /results (caught by
      // e2e onboarding-flow + onboarding-analysis-failure). Restored to the exact proven
      // sequential order: writes -> extraction -> merits. DO NOT reorder or parallelize this
      // block again without a DB-level analysis of the career_targets trigger's read set against
      // the resumes write set.
      const writeResults = await Promise.all(writes);
      const writeError = writeResults.find((result) => result.error)?.error;
      if (writeError) throw writeError;

      // 5. Trigger resume analysis and navigate to results
      const resumeExtraction = await extractDocumentFromFile({
        file: resumeFile,
        documentType: 'resume',
        resumeId: resume.id,
        featureRunToken,
      });
      const resumeText = resumeExtraction.text;

      // Entitlement freshness (quick 260718-j2x): the backend resolves tier authoritatively
      // from profiles.subscription_tier and discards any client tier. A mid-onboarding Stripe
      // upgrade may not have propagated yet, so refresh + WAIT before dispatching analysis —
      // otherwise an active Elite user gets a free-depth analysis off a stale row. The spinner
      // is already up (loading held true), so this wait is covered by continuous feedback.
      // H-01: `?checkout=complete` is NOT the reachable signal here — Stripe return_urls land
      // on /dashboard or /pricing, never /onboarding. The reachable signal is the pending-upgrade
      // flag set at subscription checkout initiation (useStripeCheckout), which survives that
      // navigation. Gate the real DB-waiting poll on either signal so a genuine upgrader who
      // returns to onboarding actually waits for the webhook, not just a frontend cache refresh.
      const cameFromCheckout = searchParams.get('checkout') === 'complete';
      const pendingUpgradeTier = getPendingUpgrade(); // 'pro' | 'elite' | null
      if (cameFromCheckout || pendingUpgradeTier) {
        // Bounded poll (1.5s interval, 10s ceiling — useMerits defaults). Passing the expected
        // tier (M-01) stops the poll the instant the cached tier MATCHES the purchase — including
        // immediately when a background refetch already landed it — instead of only when it
        // changes from the at-call snapshot (which never fires if the tier was already fresh, and
        // would burn the full 10s ceiling). Silent on ceiling.
        toast('Confirming your plan...', {
          description: "Making sure your analysis matches your current plan.",
        });
        await reconcileTierUpgrade(pendingUpgradeTier ?? undefined);
        // One-shot signal — clear so a later onboarding pass can't force a pointless poll.
        clearPendingUpgrade();
      } else {
        // Common case: no upgrade signal. A single invalidate + awaited refetch closes the
        // webhook race in one round-trip WITHOUT paying the 10s poll ceiling.
        await invalidateMerits();
      }

      toast.success("Setup complete! Analyzing your resume...");

      // FEAT-01 (05-01): the D-07 awaited upload → signed-URL → resumes insert →
      // extraction (incl. OCR) sequence above is preserved EXACTLY — analysis only
      // starts once the file is accessible and extraction has completed.
      if (isAnalysisLifecycleEnabled()) {
        // MIGRATED PATH — kills the fire-and-forget abandonment. Onboarding is a distinct
        // feature run: send an explicit origin:'onboarding' + a per-attempt nonce so the
        // edge routes it through runAnalysisLifecycle('onboarding') with a stable derived
        // idempotency key (a duplicate onboarding interaction cannot create a second
        // analysis/charge). On the response we persist the returned run_id via
        // useAnalysisRun.startRun BEFORE navigating, so a refresh/navigation on the results
        // screen re-attaches to the live run's STATE (the RESULT is re-read from
        // resumes.grading_data by the existing Results realtime path).
        const attemptNonce = submitToken.attemptNonce;
        const { data, error } = await invokeWithTimeout<{ run_id?: string; error?: string; code?: string }>(
          "analyze-resume",
          {
            body: {
              resumeText,
              resumeId: resume.id,
              userId: user.id,
              origin: 'onboarding',
              attemptNonce,
              ...(featureRunToken ? { featureRunToken } : {}),
            },
          },
          120000,
        );

        if (error || !data || data.error) {
          // The synchronous onboarding invoke gave up. This is NOT proof the run failed:
          // the 120s client Promise.race can fire while the server is still generating/
          // saving, and a 5xx/timeout may still land a result. Recover BEFORE toasting
          // (first-attempt-reliability, direction 2). The taxonomy code (when the server
          // returned a body) rides data.code; the HTTP status rides error.status.
          const status = (error as (Error & { status?: number }) | null)?.status ?? 0;
          const failureCode = (data as { code?: string } | null)?.code ?? null;
          const mapped = mapAnalysisError(failureCode);

          // (a) Did the result already LAND? resumes.grading_data is the authoritative save
          //     (written regardless of the client give-up). A bounded re-read by the SAME
          //     resumeId catches a result that saved around the give-up moment.
          const landed = await onboardingResultLanded(resume.id);
          if (landed) {
            submitGuard.endSubmit(submitToken, { resetAttempt: true });
            resumeRecordRef.current = null;
            if (data?.run_id) analysisRun.startRun(data.run_id);
            handedOffToResults = true;
            navigate(`/results/${resume.id}`);
            return;
          }

          // (b) GENUINE terminal failure — ANY server-returned lifecycle taxonomy code
          //     (including retryable MODEL_TIMEOUT / MODEL_RATE_LIMITED) arrives only after
          //     runAnalysisLifecycle has terminalized the attempt and invoked its refund
          //     boundary. A bodyless client 408 is different: the server may still be alive.
          //     Immediate client-side rejections are terminal too. Surface the specific
          //     reason and stay on setup; never hand an already-refunded failure to Results
          //     as an unobservable "alive" run.
          const isImmediateRejection = status === 400 || status === 402 || status === 403 || status === 429;
          const isServerReportedFailure = failureCode !== null;
          if (isServerReportedFailure || isImmediateRejection) {
            console.error("Onboarding analysis failed (terminal):", failureCode ?? data?.error ?? error);
            // NO DEAD END (quick task 260810-9vx). This used to be a bare `toast.error`
            // plus `resumeRecordRef.current = null`, which left a brand-new user on the
            // setup screen with a vanishing red message and no next step — the exact
            // "Analysis timed out." dead end reported from production. Two changes:
            //
            //  1. The failure is rendered as a PERSISTENT recovery card (see the Step 4
            //     block below) stating what happened, that credits were returned, and
            //     offering one-click Try again. The toast stays as the immediate signal.
            //  2. The uploaded resume row is KEPT. The Merit was already refunded at the
            //     server's pre-save boundary, so a retry is a legitimate new charge — but
            //     re-uploading the same file would mint a second `resumes` row (production
            //     2026-08-08 left exactly one such orphan with `grading_data = null`) and
            //     make recovery-by-resumeId ambiguous. `endSubmit({ resetAttempt: true })`
            //     still rotates the attempt nonce, so the retry derives a FRESH idempotency
            //     key and creates a genuinely new run. That freshness matters: a same-key
            //     retry would hit `create_or_recover_analysis_run`, which treats
            //     `retryable_failed` as an ACTIVE run, recover the dead row, and silently
            //     no-op every CAS transition in the lifecycle.
            toast.error(mapped.message);
            setAnalysisFailure({ message: mapped.message, retryable: mapped.retryable });
            submitGuard.endSubmit(submitToken, { resetAttempt: true });
            return;
          }

          // (c) AMBIGUOUS — a bodyless client give-up (408) or a network/unknown transport
          //     error without a server taxonomy code. The run may still be ALIVE. Do NOT
          //     toast a failure: hand off to the Results page, whose
          //     overlay + resumes.grading_data recovery keep the loading state active and
          //     render the result when it lands. Keep the held nonce + resumeId so a same-page
          //     resubmit reuses the idempotency key (charged exactly once).
          if (data?.run_id) analysisRun.startRun(data.run_id);
          handedOffToResults = true;
          navigate(`/results/${resume.id}`);
          return;
        }

        // Success (terminal: completed). Release the held refs so the next deliberate run is
        // a fresh charge, persist run_id for refresh/navigation recovery, THEN navigate.
        // startRun no-ops if the backend is still dormant (no run_id) or the flag is off.
        submitGuard.endSubmit(submitToken, { resetAttempt: true });
        resumeRecordRef.current = null;
        if (data.run_id) analysisRun.startRun(data.run_id);
        handedOffToResults = true;
        navigate(`/results/${resume.id}`);
      } else {
        // LEGACY FALL-THROUGH — fire the analysis and navigate immediately; the Results
        // page polls/subscribes for the result.
        //
        // NOT the production path (corrected 260810-9vx). This block was commented
        // "DORMANT ... off = 100% of traffic today", which is no longer true and cost
        // real time during the 2026-08-08 investigation. VITE_FEATURE_ANALYSIS_LIFECYCLE
        // is ON in production: the incident run carried `origin: 'onboarding'` and its
        // analysis_jobs row had `state` / `failure_code` / `idempotency_key` /
        // `merit_transaction_id` populated, and only runAnalysisLifecycle — reached only
        // from the branch ABOVE — writes those. Read the branch above when debugging
        // production onboarding; this one is the flag-off path only.
        const analysisPromise = invokeWithTimeout<{ error?: string }>(
          "analyze-resume",
          {
            body: {
              resumeText,
              resumeId: resume.id,
              userId: user.id,
              ...(featureRunToken ? { featureRunToken } : {}),
            },
          },
          120000,
        );
        handedOffToResults = true;
        navigate(`/results/${resume.id}`);
        // 260713-hrd (repaired 260715-onb): this failure toast used to be attached via
        // `.catch()`. But invokeWithTimeout NEVER rejects — it resolves to { data, error } for
        // every server failure (429/402/5xx) and every client timeout — so the handler was DEAD
        // CODE and a failed first analysis was completely silent: the user was navigated to
        // Results (which polls for a grading_data that is never coming), sat on a 120s spinner,
        // and then hit the bare "Taking Longer Than Expected" wall with nothing anywhere telling
        // them it had actually FAILED. Inspect the RESOLVED value so the honest failure toast
        // fires. Fire-and-forget shape preserved (Results still owns the progress UI); we only
        // surface the terminal failure out loud. On success (error null, no data.error) nothing
        // fires — the happy path is byte-for-byte unchanged.
        const notifyBackgroundFailure = (detail: unknown) => {
          console.error("Background analysis failed:", detail);
          toast.error("We couldn't finish analyzing your resume.", {
            description: "Your resume and goal are saved. Open it from your dashboard to retry.",
          });
        };
        analysisPromise
          .then(({ data, error }) => {
            if (error || data?.error) notifyBackgroundFailure(error ?? data?.error);
          })
          .catch(notifyBackgroundFailure);
      }
    } catch (error: unknown) {
      console.error("Onboarding error:", error);
      const message = error instanceof Error ? error.message : "Setup failed. Please try again.";
      toast.error(message);
      // Same no-dead-end contract as the terminal-analysis branch (260810-9vx): an
      // unexpected throw anywhere in setup must still leave the user with a visible
      // explanation and a way forward, not just a toast that fades.
      setAnalysisFailure({ message, retryable: true });
    } finally {
      setLoading(false);
      // Any path that did NOT hand off to Results is still on the setup screen — drop
      // the overlay so it cannot strand (it holds the nav lock while visible). Results
      // owns teardown on the handoff paths.
      if (!handedOffToResults) hideWaitingSurface('resume-analysis');
      // ...and drop the durable marker alongside it (quick 260803-t6v), so a stranded
      // key cannot make a later, unrelated generic wait on this same resume id inherit
      // the onboarding ladder. Same negated condition, same fail-safe shape.
      if (!handedOffToResults && onboardingWaitMarkerId) {
        sessionStorage.removeItem(`onboarding_wait_${onboardingWaitMarkerId}`);
      }
      // Terminal for this deliberate onboarding action — drop the in-memory token.
      if (correlationEnvelope) clearFeatureRunToken(correlationEnvelope);
      if (submitToken) submitGuard.endSubmit(submitToken);
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-viewport bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-viewport bg-background">
      {/* NO page-level analysis overlay here by design (quick 260803-mqs): this page
          navigates to /results while the run is still in flight, and a page-level
          overlay is unmounted by that navigation. The wait is seeded on the
          route-independent <AnalysisWaitingHost> instead, so exactly one overlay node
          stays alive across the boundary. Same shape as Upload.tsx. */}

      {/* Header */}
      <div className="container mx-auto px-4 pt-8">
        <div className="flex justify-center mb-8">
          <img src={strivoLogo} alt="Strivo" className="h-12" />
        </div>
      </div>

      <div className="container mx-auto px-4 pb-12 max-w-2xl">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">Step {step} of 4</span>
            <span className="text-sm text-muted-foreground">{Math.round((step / 4) * 100)}% complete</span>
          </div>
          <Progress value={(step / 4) * 100} className="h-2" />
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Set Your Career Baseline
          </h1>
          <p className="text-muted-foreground">
            This is how recruiters and ATS systems will evaluate you.
          </p>
        </div>

        {/* Step 1: Resume Upload */}
        {step === 1 && (
          <Card className="p-5 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Upload Your Resume</h2>
                <p className="text-sm text-muted-foreground">Required to activate Recruiting Lens™</p>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Eye className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Why this matters</p>
                  <p className="text-sm text-muted-foreground">
                    We evaluate your profile exactly how recruiters and ATS systems do. Your resume is the foundation for all career insights.
                  </p>
                </div>
              </div>
            </div>

            <div
              onDragOver={handleResumeDragOver}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleResumeDrop}
              aria-busy={isValidatingResume}
              className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : resumeFile
                  ? "border-green-500 bg-green-500/10"
                  : "border-border bg-background hover:border-primary/50"
              }`}
              onClick={() => {
                if (!isValidatingResume) resumeInputRef.current?.click();
              }}
            >
              {resumeFile ? (
                <div className="space-y-3">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <p className="font-medium min-w-0 truncate" title={resumeFile.name}>{resumeFile.name}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearResumeSelection();
                    }}
                    disabled={isValidatingResume}
                    className="w-full min-h-11 sm:w-full md:w-auto"
                  >
                    Choose Different File
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="font-medium">Drag and drop your resume here</p>
                  <p className="text-sm text-muted-foreground">{isValidatingResume ? "Validating..." : "or click to browse"}</p>
                  <Badge variant="secondary">PDF or DOCX</Badge>
                </div>
              )}
              <input
                ref={resumeInputRef}
                type="file"
                accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT}
                aria-describedby="onboarding-resume-help"
                onChange={handleResumeSelect}
                disabled={isValidatingResume}
                className="sr-only"
              />
            </div>
            <p id="onboarding-resume-help" className="mt-2 text-sm text-muted-foreground break-words">
              PDF or DOCX files supported. Maximum 2 pages.
            </p>

            <Button
              className="w-full mt-6"
              size="lg"
              onClick={() => setStep(2)}
              disabled={!resumeFile || isValidatingResume}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        )}

        {/* Step 2: LinkedIn PDF */}
        {step === 2 && (
          <Card className="p-5 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#0A66C2]/20 flex items-center justify-center">
                <Linkedin className="h-5 w-5 text-[#0A66C2]" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Upload LinkedIn PDF</h2>
                <p className="text-sm text-muted-foreground">Recommended • Can be skipped</p>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">+18% analysis accuracy</p>
                  <p className="text-sm text-muted-foreground">
                    Adds recruiter-grade context like career trajectory, positioning, and seniority signals.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-lg p-4 mb-6 text-sm">
              <p className="font-medium mb-2">How to download your LinkedIn PDF:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Go to your LinkedIn profile</li>
                <li>Click <span className="font-medium text-foreground">Resources</span></li>
                <li>Select <span className="font-medium text-foreground">Save to PDF</span></li>
                <li>Upload the downloaded file here</li>
              </ol>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                linkedinPdfFile
                  ? "border-green-500 bg-green-500/10"
                  : "border-border hover:border-[#0A66C2]/50"
              }`}
              onClick={() => linkedinInputRef.current?.click()}
            >
              {linkedinPdfFile ? (
                <div className="space-y-3">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <p className="font-medium">{linkedinPdfFile.name}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLinkedinPdfFile(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Linkedin className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="font-medium">Click to upload LinkedIn PDF</p>
                  <Badge variant="secondary">Optional</Badge>
                </div>
              )}
              <input
                ref={linkedinInputRef}
                type="file"
                accept={LINKEDIN_PDF_ACCEPT}
                onChange={handleLinkedinPdfSelect}
                className="hidden"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                size="lg"
                onClick={() => setStep(3)}
              >
                {linkedinPdfFile ? "Continue" : "Skip for now"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Target Roles & Interests */}
        {step === 3 && (
          <Card className="p-5 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Target Roles & Industries</h2>
                <p className="text-sm text-muted-foreground">Help us personalize your experience</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Target Roles */}
              <div>
                <label className="text-sm font-medium mb-3 block">
                  What roles are you targeting?
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Sets ATS keyword thresholds and role-specific resume rewrites.
                </p>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <Badge
                      key={role}
                      variant={selectedRoles.includes(role) ? "default" : "outline"}
                      className={`cursor-pointer transition-all ${
                        selectedRoles.includes(role)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-primary/10"
                      }`}
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                      {selectedRoles.includes(role) && (
                        <X className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Industries */}
              <div>
                <label className="text-sm font-medium mb-3 block">
                  Industries of interest
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Determines which keywords and framing recruiters expect to see.
                </p>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((interest) => (
                    <Badge
                      key={interest}
                      variant={selectedIndustries.includes(interest) ? "default" : "outline"}
                      className={`cursor-pointer transition-all ${
                        selectedIndustries.includes(interest)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-primary/10"
                      }`}
                      onClick={() => toggleIndustry(interest)}
                    >
                      {interest}
                      {selectedIndustries.includes(interest) && (
                        <X className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                className="flex-1"
                size="lg"
                onClick={() => setStep(4)}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Professional Goal — the product's anchor. Required. */}
        {step === 4 && (
          <Card className="p-5 sm:p-8" aria-busy={submitGuard.isSubmitting}>
            {isGoalOnlyFlow && (
              <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Steps 1-3 complete
              </div>
            )}

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Set Your Professional Goal</h2>
                <p className="text-sm text-muted-foreground">Required to complete setup</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Tell Strivo the one professional outcome you are currently working towards. We'll use your resume, LinkedIn, and future improvements to help you get closer to it.
            </p>

            {/*
              A TEXTAREA, not an input: people write goals as sentences, and the
              deterministic SQL parser (20260804010000) is sentence-aware. maxLength stays
              500 to match the DB CHECK from 20260712000001 — without it a long paste is
              rejected by Postgres with an opaque error. The field is still REQUIRED (the
              aria-disabled guard on Finish, below, is unchanged).
            */}
            <div className="space-y-2">
              <Textarea
                value={professionalGoal}
                onChange={(e) => setProfessionalGoal(e.target.value)}
                placeholder="e.g. I want to secure an investment banking internship in New York in 2027, ideally at a leading global bank. I want to build the experience needed to move into private equity later."
                maxLength={500}
                rows={4}
                className="min-h-[110px] resize-y"
                aria-label="Set Your Professional Goal"
              />
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  A phrase or a sentence or two — whatever fits. You can update this goal at any time.
                </p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {professionalGoal.length}/500
                </p>
              </div>
            </div>

            {/* NO DEAD END (quick task 260810-9vx). A terminal analysis failure used to
                be a red toast and nothing more, leaving a brand-new user stranded on this
                screen with no explanation and no next step. This card persists until the
                next attempt: it names what happened, confirms the work already saved and
                the credits returned, and puts retry one click away. Retry reuses the
                already-uploaded resume (no second upload, no orphan row) under a fresh
                attempt nonce. */}
            {analysisFailure && (
              <div
                role="alert"
                className="mt-8 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
              >
                <p className="text-sm font-medium text-foreground">
                  We couldn't finish your first analysis
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{analysisFailure.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your resume and goal are saved and no credits were used. Try again — it
                  usually works on the next attempt.
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={handleFinishSetup}
                  aria-disabled={loading || submitGuard.isSubmitting}
                >
                  Try again
                </Button>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              {!isGoalOnlyFlow && (
                <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                  Back
                </Button>
              )}
              <Button
                className="flex-1 bg-gradient-to-r from-primary to-primary/80"
                size="lg"
                onClick={handleFinishSetup}
                aria-disabled={loading || submitGuard.isSubmitting || professionalGoal.trim().length === 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Finish Setup → Start Using Strivo
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
