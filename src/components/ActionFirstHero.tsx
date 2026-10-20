import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  extractDocumentFromFile,
  precheckResumeDocument,
} from "@/lib/document-extraction";
import { calculateFileHash } from "@/lib/fileHash";
import { Button } from "@/components/ui/button";
import { useThemeLogo } from "@/hooks/useThemeLogo";
const ActionFirstHero = () => {
  const strivoLogo = useThemeLogo();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearResumeSelection = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => fileInputRef.current?.focus());
  };
  const processResume = async (file: File) => {
    setIsValidating(true);
    try {
      const precheck = await precheckResumeDocument(file, "resume");
      if (!precheck.ok) {
        toast.error(precheck.message);
        clearResumeSelection();
        return;
      }

      const fileHash = await calculateFileHash(file);
      const resumeExtraction = await extractDocumentFromFile({
        file,
        documentType: 'resume',
      });

      // Preserve the validated upload for the authenticated handoff. The Auth
      // flow creates the resume row and invokes analyze-resume with the user's
      // session so normal tier, Merit, and entitlement rules always apply.
      sessionStorage.setItem("pendingResumeText", resumeExtraction.text);
      sessionStorage.setItem("pendingResumeFileName", file.name);
      sessionStorage.setItem("pendingResumeFileSize", file.size.toString());
      sessionStorage.setItem("pendingResumeFileHash", fileHash);

      navigate("/auth", {
        state: {
          returnTo: "/",
          pendingAnalysis: true,
        },
      });
    } catch (error) {
      console.error('[ActionFirstHero] resume handoff failed', error);
      toast.error(error instanceof Error ? error.message : 'Could not prepare your resume. Please try again.');
      clearResumeSelection();
    } finally {
      setIsValidating(false);
    }
  };
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isValidating) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      void processResume(files[0]);
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void processResume(files[0]);
    }
  };
  const handleUploadClick = () => {
    if (isValidating) {
      toast.info("Resume validation already in progress");
      return;
    }
    fileInputRef.current?.click();
  };
  return <>
      <section className="min-h-viewport flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Deep ambient glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,_hsl(357_100%_68%/0.12)_0%,_transparent_50%)]" />

        {/* Single powerful orb behind headline */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px]" />


        {/* Content - generous spacing */}
        <div className="relative z-10 w-full max-w-4xl mx-auto text-center flex flex-col items-center justify-center gap-12">
          {/* Top Badge - Career Intelligence */}
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
              bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10
              dark:from-primary/20 dark:via-primary/10 dark:to-primary/20
              border border-primary/20 dark:border-primary/30
              backdrop-blur-sm
              shadow-[0_0_20px_hsl(var(--primary)/0.1)]
              dark:shadow-[0_0_30px_hsl(var(--primary)/0.15)]
            ">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground/80 dark:text-foreground/90">
                Career intelligence platform for exponential career growth
              </span>
              <span className="text-muted-foreground/60">|</span>
              <span className="text-sm text-muted-foreground">Based in Los Angeles</span>
            </div>
          </div>

          {/* Logo - prominent, lowered closer to headline */}
          <div className="animate-fade-in mb-[-8px]">
            <img
              src={strivoLogo}
              alt="Strivo"
              className="h-12 md:h-14 w-auto object-contain drop-shadow-[0_0_40px_hsl(357_100%_68%/0.4)]"
            />
          </div>

          {/* Headline - premium entrance animation */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight opacity-0 animate-[hero-entrance_0.5s_ease-out_0.1s_forwards]">
            <span className="relative inline-block text-primary animate-[text-glow_2s_ease-in-out_infinite] text-6xl">
              Get hired faster.
            </span>
          </h1>

          {/* Subtitle - better spacing */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in leading-relaxed whitespace-nowrap" style={{
          animationDelay: "0.2s"
        }}>
            AI-powered resume intelligence built for modern hiring systems.
          </p>

          {/* CTA Button - subtle attention animation with premium hover */}
          <div className={`w-full md:w-auto animate-fade-in pt-6 p-4 rounded-lg border border-transparent ${
            isDragging ? "border-primary bg-primary/10" : "bg-transparent"
          }`} style={{
          animationDelay: "0.3s"
        }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <Button onClick={handleUploadClick} disabled={isValidating} aria-busy={isValidating} size="lg" className={`
                relative w-full min-h-11 px-10 py-7 text-lg font-semibold sm:w-full md:w-auto
                bg-primary text-primary-foreground
                rounded-2xl border-0
                animate-[button-glow_6s_ease-in-out_infinite]
                hover:shadow-[0_0_60px_hsl(var(--primary)/0.5),0_0_100px_hsl(var(--primary)/0.3)]
                hover:-translate-y-1 hover:bg-primary/95
                transition-all duration-200 ease-out
                transition-all duration-200 ease-out
                overflow-hidden
                ${isDragging ? "ring-4 ring-primary ring-offset-4 ring-offset-background scale-105" : ""}
              `}>
              <Upload className="w-5 h-5 mr-3" />
              {isValidating ? "Validating..." : "Upload your resume"}
            </Button>

            <input ref={fileInputRef} type="file" accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT} aria-describedby="action-hero-resume-help" onChange={handleFileSelect} disabled={isValidating} className="sr-only" />
          </div>

          {/* Trust line - better spacing, prevent awkward breaks */}
          <p id="action-hero-resume-help" className="text-xs md:text-sm text-muted-foreground/60 max-w-xl mx-auto animate-fade-in mt-4 break-words" style={{
          animationDelay: "0.4s"
        }}>
            PDF or DOCX files supported. Maximum 2 pages. Built on elite university frameworks and recruiter-driven Fortune 500 hiring patterns.
          </p>
        </div>
      </section>

    </>;
};
export default ActionFirstHero;
