import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import {
  clearFeatureRunToken,
  createFeatureRunActionNonce,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from "@/lib/feature-run-correlation";
import { toast } from "sonner";
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  precheckResumeDocument,
} from "@/lib/document-extraction";
import { MSG_VALIDATION_UNAVAILABLE } from "@/config/document-limits";
import { calculateFileHash } from "@/lib/fileHash";
import { User, Session } from "@supabase/supabase-js";
import { AnalysisExperience } from "@/components/AnalysisExperience";
import { useAnalysisGuard } from "@/hooks/useAnalysisGuard";
import { extractResumeInsights, AnalysisDisplayResult } from "@/lib/analysisHelpers";
import { Button } from "@/components/ui/button";
import { useThemeLogo } from "@/hooks/useThemeLogo";

const MinimalHero = () => {
  const navigate = useNavigate();
  const strivoLogo = useThemeLogo();
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisDisplayResult | null>(null);
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userTier, setUserTier] = useState<string>("free");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const { startAnalysis, isRunning } = useAnalysisGuard();

  const clearResumeSelection = () => {
    pendingFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => fileInputRef.current?.focus());
  };

  // Auth state listener
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user && pendingResumeId) {
        navigate(`/results/${pendingResumeId}`);
      }

      if (session?.user) {
        setTimeout(() => {
          supabase
            .from("profiles")
            .select("subscription_tier")
            .eq("id", session.user.id)
            .single()
            .then(({ data }) => {
              if (data) setUserTier(data.subscription_tier || "free");
            });
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setUserTier(data.subscription_tier || "free");
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [pendingResumeId, navigate]);

  // Process and analyze resume
  const processResume = async (file: File) => {
    if (isRunning()) {
      toast.info("Analysis already in progress");
      return;
    }

    setIsValidating(true);
    const precheck = await precheckResumeDocument(file, "resume");
    if (!precheck.ok) {
      toast.error(precheck.message);
      clearResumeSelection();
      setIsValidating(false);
      return;
    }
    setIsValidating(false);
    pendingFileRef.current = file;
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setAnalysisResult(null);

    const result = await startAnalysis(async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const fileHash = await calculateFileHash(file);

      if (currentUser) {
        setIsValidating(true);
        const { data: validationData, error: validationError } = await invokeWithTimeout<{
          ok?: boolean;
          message?: string;
        }>("validate-document", {
          body: file,
          headers: {
            "x-document-type": "resume",
            "x-file-name": encodeURIComponent(file.name),
          },
        }, 30000);
        setIsValidating(false);
        if (validationError || validationData?.ok !== true) {
          clearResumeSelection();
          throw new Error(validationData?.message || MSG_VALIDATION_UNAVAILABLE);
        }

        const fileName = `${currentUser.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage.from("resumes").upload(fileName, file);
        if (uploadError) {
          throw new Error("Failed to upload file");
        }

        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("resumes")
          .createSignedUrl(fileName, 31536000);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          throw new Error("Failed to generate file access URL");
        }

        const fileUrl = signedUrlData.signedUrl;

        const { data: resume, error: insertError } = await supabase
          .from("resumes")
          .insert({
            user_id: currentUser.id,
            file_name: file.name,
            file_size: file.size,
            file_url: fileUrl,
            file_path: fileName,
            file_hash: fileHash,
          })
          .select()
          .single();

        if (insertError || !resume) {
          throw new Error("Failed to save resume");
        }

        setPendingResumeId(resume.id);

        // Costing correlation only (memory-only, never stored). Begun before browser
        // extraction so parser/OCR spend and the analysis share one server run. A
        // failure changes nothing — the backend creates the run at its own boundary.
        const correlationEnvelope: FeatureRunCorrelationEnvelope = {
          feature: 'resume_analysis',
          runVariant: 'standard',
          inputType: 'pdf',
          documentCount: 1,
          serverActionNonce: createFeatureRunActionNonce(),
        };
        let featureRunToken: string | undefined;
        try {
          featureRunToken = await getFeatureRunToken(correlationEnvelope);
        } catch {
          featureRunToken = undefined;
        }

        const resumeExtraction = await extractDocumentFromFile({
          file,
          documentType: 'resume',
          resumeId: resume.id,
          featureRunToken,
        });
        const resumeText = resumeExtraction.text;

        const { data, error } = await invokeWithTimeout<any>(
          "analyze-resume",
          {
            body: {
              resumeText,
              resumeId: resume.id,
              userId: currentUser.id,
              tier: "free",
              ...(featureRunToken ? { featureRunToken } : {}),
            },
          },
          120000,
        );
        clearFeatureRunToken(correlationEnvelope);

        if (error || (data && typeof data === "object" && "error" in data)) {
          const errorData = data as any;
          if (errorData?.error === "rate_limit_exceeded") {
            const waitMinutes = Math.ceil((errorData.retryAfter ?? 60) / 60);
            toast.error(`Too many requests. Try again in ${waitMinutes} minute${waitMinutes !== 1 ? 's' : ''}.`);
            return { data: null, isFreeTier: true, isDemo: false, _rateLimited: true };
          }
          if (errorData?.error === "usage_limit_reached") {
            throw new Error(errorData.message || "Usage limit reached for this billing cycle");
          }
          throw new Error(errorData?.error || error?.message || "Analysis failed");
        }

        const isFreeTier = userTier === "free";

        // Phase 21 MIG-02 (D-06): `analysis_results` is service-role-only.
        // `analyze-resume` persists via `resumes.grading_data` — no client-side save here.

        return { data, isFreeTier, resumeId: resume.id };
      } else {
        const resumeExtraction = await extractDocumentFromFile({
          file,
          documentType: 'resume',
        });
        const resumeText = resumeExtraction.text;

        // Preserve the validated upload for Auth. The signed-in handoff owns
        // the real analysis so normal tier, Merit, and entitlement rules apply.
        sessionStorage.setItem("pendingResumeText", resumeText);
        sessionStorage.setItem("pendingResumeFileName", file.name);
        sessionStorage.setItem("pendingResumeFileSize", file.size.toString());
        sessionStorage.setItem("pendingResumeFileHash", fileHash);

        navigate("/auth", { state: { returnTo: "/", pendingAnalysis: true } });
        return { data: null, isFreeTier: true, isDemo: false, requiresAuth: true };
      }
    });

    if (!result.success) {
      toast.error(result.error || "Analysis failed");
      setIsAnalyzing(false);
      return;
    }

    const { data, isFreeTier, isDemo, resumeId, _rateLimited, requiresAuth } = result.data as any;

    if (_rateLimited || requiresAuth) {
      setIsAnalyzing(false);
      return;
    }

    if (isDemo) {
      if (data) {
        // Use real AI result
        const displayResult = extractResumeInsights(data, true);
        // Add locked hints for unauthenticated users
        displayResult.insights.push(
          { icon: 'info', text: 'Sign in to see your full personalized analysis', locked: true },
          { icon: 'info', text: 'Get AI-powered improvement suggestions', locked: true }
        );
        setAnalysisResult(displayResult);
      } else {
        // Fallback
        setAnalysisResult({
          score: 52,
          headline: "Interview Readiness Score",
          insights: [
            { icon: "positive", text: "Your resume has a clear professional summary" },
            { icon: "warning", text: "Consider adding more quantified achievements" },
            { icon: "info", text: "Sign in to see your full personalized analysis", locked: true },
            { icon: "info", text: "Get AI-powered improvement suggestions", locked: true },
          ],
        });
      }
    } else {
      const displayResult = extractResumeInsights(data, isFreeTier);
      setAnalysisResult(displayResult);

      const colors = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          (window as any).confetti?.({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors,
          });
        }, i * 150);
      }
    }

    setAnalysisComplete(true);
    setIsAnalyzing(false);
  };

  const handleViewFullResults = () => {
    if (!user && pendingResumeId === null) {
      navigate("/auth", { state: { returnTo: "/", pendingAnalysis: true } });
    } else if (pendingResumeId) {
      navigate(`/results/${pendingResumeId}`);
    }
  };

  const handleUpgrade = () => {
    navigate("/pricing");
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isValidating || isAnalyzing) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void processResume(files[0]);
    }
  }, [isAnalyzing, isValidating]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void processResume(files[0]);
    }
  };

  const handleUploadClick = () => {
    if (isRunning() || isValidating) {
      toast.info("Analysis already in progress");
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <>
      <section className="min-h-[75vh] flex flex-col items-center justify-center px-4 relative pt-24 pb-8">
        {/* Subtle background */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-3xl" />

        <div className="relative z-10 w-full max-w-2xl mx-auto text-center space-y-6">
          {/* Strivo branding */}
          <div className="flex justify-center mb-2 animate-fade-in">
            <img src={strivoLogo} alt="Strivo" className="h-14 md:h-16 w-auto object-contain" />
          </div>

          {/* Main headline */}
          <div className="space-y-4 animate-fade-in" style={{ animationDelay: "0.05s" }}>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight leading-[1.15]">
              Know where you stand. Compete with confidence.
            </h1>
          </div>

          {/* Sub-headline */}
          <p
            className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto animate-fade-in"
            style={{ animationDelay: "0.1s" }}
          >
            AI-powered analysis that shows your readiness, job fit, and exact next steps — instantly.
          </p>

          {/* ATS Credibility */}
          <p
            className="text-sm text-muted-foreground/70 max-w-lg mx-auto animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            Built on elite university frameworks and recruiter-driven Fortune 500 hiring patterns.
          </p>

          {/* Primary CTA */}
          <div
            className={`w-full md:w-auto pt-2 p-4 rounded-lg border border-transparent animate-fade-in ${
              isDragging ? "border-primary bg-primary/10" : "bg-transparent"
            }`}
            style={{ animationDelay: "0.2s" }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Button
              onClick={handleUploadClick}
              disabled={isValidating || isAnalyzing}
              aria-busy={isValidating || isAnalyzing}
              size="lg"
              className={`
                w-full min-h-11 px-10 py-7 text-lg font-semibold sm:w-full md:w-auto
                bg-primary hover:bg-primary/90 text-primary-foreground
                shadow-[0_0_30px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.5)]
                transition-all duration-300 hover:scale-105
                ${isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
              `}
            >
              <Upload className="w-5 h-5 mr-3" />
              {isValidating ? "Validating..." : isAnalyzing ? "Analyzing..." : "Upload resume"}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT}
              aria-describedby="minimal-hero-resume-help"
              onChange={handleFileSelect}
              disabled={isValidating || isAnalyzing}
              className="sr-only"
            />

            <p id="minimal-hero-resume-help" className="mt-4 text-sm text-muted-foreground/70 break-words">PDF or DOCX files supported. Maximum 2 pages. Sign in to analyze.</p>
          </div>
        </div>
      </section>

      {/* Analysis Experience Overlay */}
      <AnalysisExperience
        isAnalyzing={isAnalyzing}
        analysisComplete={analysisComplete}
        result={analysisResult}
        onViewFullResults={handleViewFullResults}
        onUpgrade={handleUpgrade}
        isFreeTier={userTier === "free" || !user}
      />
    </>
  );
};

export default MinimalHero;
