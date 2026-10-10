import { useState, useEffect, useRef } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabaseClient";
import { getLatestResume } from "@/lib/latestResume";
import { toast } from "sonner";
import { User, MapPin, Briefcase, Target, Plus, X, Crown, Zap, Linkedin, FileText, Sparkles, HelpCircle, Upload, Loader2, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import {
  ACCEPTED_RESUME_DOCUMENT_ACCEPT,
  RESUME_DOCUMENT_TYPE_LABEL,
  extractDocumentFromFile,
  extractDocumentFromPdf,
  isAcceptedResumeDocument,
  isPdfFile,
  LINKEDIN_PDF_ACCEPT,
  serializeDocumentExtractionMetadata,
  precheckResumeDocument,
} from "@/lib/document-extraction";
import { MSG_VALIDATION_UNAVAILABLE } from "@/config/document-limits";
import { calculateFileHash } from "@/lib/fileHash";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import {
  clearFeatureRunToken,
  createFeatureRunActionNonce,
  getFeatureRunToken,
  type FeatureRunCorrelationEnvelope,
} from "@/lib/feature-run-correlation";
import EducationTargetsSection, { type EducationTargetsValue } from "@/components/profile/EducationTargetsSection";
import { useUserTargets } from "@/hooks/useUserTargets";
import { useProfessionalGoal } from "@/hooks/useProfessionalGoal";
import { GoalEditDialog } from "@/components/dashboard/GoalEditDialog";
import { getTierDisplayName, normalizeActiveTier } from "@/config/pricing-config";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { profile: targetProfile, targets, loading: targetsLoading, refresh: refreshTargets } = useUserTargets();
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    linkedin_url: "",
    preferred_locations: [] as string[],
    job_type_preference: "full-time",
    experience_level: "mid",
    school: "",
    major: "",
    year: "",
    graduation_year: null as number | null,
    location_preference: "",
    target_industries: [] as string[],
    target_roles: [] as string[],
    target_companies: [] as string[],
    career_goals: "",
    subscription_tier: "free",
    subscription_status: null as string | null,
    current_period_end: null as string | null,
  });

  const [newLocation, setNewLocation] = useState("");

  // Document upload states
  const [currentResumeName, setCurrentResumeName] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [linkedinPdfFile, setLinkedinPdfFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [isValidatingResume, setIsValidatingResume] = useState(false);
  const [uploadingLinkedIn, setUploadingLinkedIn] = useState(false);
  const [hasLinkedInPdf, setHasLinkedInPdf] = useState(false);
  const [linkedinPdfFilename, setLinkedinPdfFilename] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const linkedinInputRef = useRef<HTMLInputElement>(null);

  const { profileStrength, hasResume, hasLinkedIn, refresh: refreshOnboarding } = useOnboardingStatus();

  // The product's anchor. Raw wording is the source of truth for display AND editing.
  const { professionalGoal, goalSetAt } = useProfessionalGoal();
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (targetsLoading) return;

    setProfile((prev) => ({
      ...prev,
      school: targetProfile?.school || "",
      major: targetProfile?.major || "",
      year: targetProfile?.year || "",
      graduation_year: targetProfile?.graduation_year || null,
      location_preference: targetProfile?.location_preference || "",
      target_industries: targets?.target_industries || [],
      target_roles: targets?.target_roles || [],
      target_companies: targets?.target_companies || [],
      career_goals: targets?.career_goals || "",
    }));
  }, [targetProfile, targets, targetsLoading]);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to view your profile");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          linkedin_url: data.linkedin_url || "",
          preferred_locations: data.preferred_locations || [],
          job_type_preference: data.job_type_preference || "full-time",
          experience_level: data.experience_level || "mid",
          school: data.school || "",
          major: data.major || "",
          year: data.year || "",
          graduation_year: data.graduation_year || null,
          location_preference: data.location_preference || "",
          target_industries: targets?.target_industries || [],
          target_roles: targets?.target_roles || [],
          target_companies: targets?.target_companies || [],
          career_goals: targets?.career_goals || "",
          subscription_tier: data.subscription_tier || "free",
          subscription_status: data.subscription_status || null,
          current_period_end: data.current_period_end || null,
        });
        setHasLinkedInPdf(!!data.linkedin_pdf_content);
        setLinkedinPdfFilename(data.linkedin_pdf_filename || null);
      }

      // Fetch current resume name
      const { data: resumes } = await getLatestResume({ userId: user.id, columns: "file_name" });

      if (resumes && resumes.length > 0) {
        setCurrentResumeName(resumes[0].file_name);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;

    setUploadingResume(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileHash = await calculateFileHash(resumeFile);
      const filePath = `${user.id}/${fileHash}-${resumeFile.name}`;

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
        return;
      }

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, resumeFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      // Insert new resume record
      const { data: resumeData, error: resumeError } = await supabase
        .from("resumes")
        .insert({
          user_id: user.id,
          file_name: resumeFile.name,
          file_url: urlData.publicUrl,
          file_path: filePath,
          file_size: resumeFile.size,
          file_hash: fileHash,
        })
        .select()
        .single();

      if (resumeError) throw resumeError;

      // Costing correlation only (memory-only, never stored). Begun before browser
      // extraction so parser/OCR spend and the background analysis share one run.
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
        // The backend still creates the run at its own trusted boundary.
        featureRunToken = undefined;
      }

      const resumeExtraction = await extractDocumentFromFile({
        file: resumeFile,
        documentType: 'resume',
        resumeId: resumeData.id,
        featureRunToken,
      });
      const resumeText = resumeExtraction.text;

      if (resumeExtraction.metadata) {
        const { error: metadataError } = await supabase
          .from("resumes")
          .update({
            extracted_text: resumeText,
            text_hash: resumeExtraction.metadata.textHash,
            document_hash: resumeExtraction.metadata.documentHash,
            extraction_version: resumeExtraction.metadata.extractionVersion,
            extraction_metadata: serializeDocumentExtractionMetadata(resumeExtraction.metadata),
          })
          .eq("id", resumeData.id);

        if (metadataError) {
          console.warn("[Profile] resume extraction metadata update failed", metadataError);
        }
      }

      // Trigger background analysis with the extracted text; analyze-resume requires resumeText.
      void supabase.functions.invoke("analyze-resume", {
        body: {
          resumeId: resumeData.id,
          resumeText,
          userId: user.id,
          tier: normalizeActiveTier(profile.subscription_tier),
          ...(featureRunToken ? { featureRunToken } : {}),
          stream: false,
        },
      });
      clearFeatureRunToken(correlationEnvelope);

      setCurrentResumeName(resumeFile.name);
      setResumeFile(null);
      refreshOnboarding();
      toast.success("Resume updated successfully! Analysis running in background.");
    } catch (error) {
      console.error("Error uploading resume:", error);
      toast.error("Failed to upload resume");
    } finally {
      setUploadingResume(false);
    }
  };

  const clearResumeSelection = () => {
    setResumeFile(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
    requestAnimationFrame(() => resumeInputRef.current?.focus());
  };

  const handleResumeSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isValidatingResume) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setIsValidatingResume(true);
    const result = await precheckResumeDocument(file, "resume");
    if (!result.ok) {
      toast.error(result.message);
      clearResumeSelection();
    } else {
      setResumeFile(file);
    }
    setIsValidatingResume(false);
  };

  const handleLinkedInUpload = async () => {
    if (!linkedinPdfFile) return;

    setUploadingLinkedIn(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const linkedinExtraction = await extractDocumentFromPdf({
        file: linkedinPdfFile,
        documentType: 'linkedin_profile',
      });
      const linkedinPdfContent = linkedinExtraction.text;

      const { error } = await supabase
        .from("profiles")
        .update({
          linkedin_pdf_content: linkedinPdfContent,
          linkedin_pdf_filename: linkedinPdfFile.name,
          linkedin_pdf_updated_at: new Date().toISOString(),
          ...(linkedinExtraction.metadata ? {
            linkedin_pdf_text_hash: linkedinExtraction.metadata.textHash,
            linkedin_pdf_extraction_metadata: serializeDocumentExtractionMetadata(linkedinExtraction.metadata),
          } : {}),
        })
        .eq("id", user.id);

      if (error) throw error;

      setHasLinkedInPdf(true);
      setLinkedinPdfFilename(linkedinPdfFile.name);
      setLinkedinPdfFile(null);
      refreshOnboarding();
      toast.success("LinkedIn PDF updated successfully!");
    } catch (error) {
      console.error("Error uploading LinkedIn PDF:", error);
      toast.error("Failed to upload LinkedIn PDF");
    } finally {
      setUploadingLinkedIn(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const profileUpdate = supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          linkedin_url: profile.linkedin_url,
          preferred_locations: profile.preferred_locations,
          job_type_preference: profile.job_type_preference,
          experience_level: profile.experience_level,
          school: profile.school || null,
          major: profile.major || null,
          year: profile.year || null,
          graduation_year: profile.graduation_year,
          location_preference: profile.location_preference || null,
        })
        .eq("id", user.id);

      const targetsUpsert = supabase
        .from("career_targets")
        .upsert({
          user_id: user.id,
          target_industries: profile.target_industries,
          target_roles: profile.target_roles,
          target_companies: profile.target_companies,
          location_preference: profile.location_preference || null,
          career_goals: profile.career_goals || null,
        }, { onConflict: "user_id" });

      const [profileResult, targetsResult] = await Promise.all([profileUpdate, targetsUpsert]);

      if (profileResult.error && targetsResult.error) {
        throw new Error("Failed to update profile and career targets");
      }
      if (profileResult.error) {
        toast.error("Career targets saved, but profile details failed to update");
        return;
      }
      if (targetsResult.error) {
        toast.error("Profile details saved, but career targets failed to update");
        return;
      }

      toast.success("Profile updated successfully!");
      refreshTargets();
      refreshOnboarding();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const addLocation = () => {
    if (newLocation.trim() && !profile.preferred_locations.includes(newLocation.trim())) {
      setProfile(prev => ({
        ...prev,
        preferred_locations: [...prev.preferred_locations, newLocation.trim()]
      }));
      setNewLocation("");
    }
  };

  const removeLocation = (location: string) => {
    setProfile(prev => ({
      ...prev,
      preferred_locations: prev.preferred_locations.filter(l => l !== location)
    }));
  };

  const getStrengthColor = (strength: number) => {
    if (strength >= 80) return "text-green-500";
    if (strength >= 50) return "text-amber-500";
    return "text-red-500";
  };

  const getStrengthBg = (strength: number) => {
    if (strength >= 80) return "from-green-500 to-green-600";
    if (strength >= 50) return "from-amber-500 to-amber-600";
    return "from-red-500 to-red-600";
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 pt-6">
        <p className="text-center">Loading profile...</p>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 pt-6 pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-primary sm:text-4xl">
              Your Career Baseline
            </h1>
            <p className="text-muted-foreground">
              This is the baseline recruiters and ATS systems evaluate you against.
            </p>
          </div>

          {/* Profile Strength Indicator */}
          <Card className="p-6 mb-6 bg-gradient-to-r from-secondary/50 to-secondary/30 border-border">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Sparkles className={`h-6 w-6 ${getStrengthColor(profileStrength)}`} />
                <div>
                  <h3 className="font-semibold">Profile Strength</h3>
                  <p className="text-sm text-muted-foreground">
                    Higher profile strength = more accurate recruiter simulations
                  </p>
                </div>
              </div>
              <div className={`text-3xl font-bold ${getStrengthColor(profileStrength)}`}>
                {profileStrength}%
              </div>
            </div>
            <Progress
              value={profileStrength}
              className="h-3"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {hasResume ? (
                <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30">
                  <FileText className="h-3 w-3 mr-1" />
                  Resume uploaded
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-red-500/20 text-red-500 border-red-500/30">
                  <FileText className="h-3 w-3 mr-1" />
                  No resume
                </Badge>
              )}
              {hasLinkedIn ? (
                <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30">
                  <Linkedin className="h-3 w-3 mr-1" />
                  LinkedIn connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                  <Linkedin className="h-3 w-3 mr-1" />
                  Add LinkedIn
                </Badge>
              )}
              {profile.target_roles.length > 0 ? (
                <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30">
                  <Target className="h-3 w-3 mr-1" />
                  Roles defined
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                  <Target className="h-3 w-3 mr-1" />
                  Add target roles
                </Badge>
              )}
            </div>
          </Card>

          {/* Documents Section */}
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="h-6 w-6" style={{ color: "#FF5F67" }} />
              <div>
                <h2 className="text-2xl font-bold">
                  Your Documents
                </h2>
                <p className="text-sm text-muted-foreground">
                  Update your resume or LinkedIn PDF anytime to improve analysis accuracy
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Resume Upload */}
              <div className="min-w-0 p-4 border border-border rounded-lg bg-secondary/30" aria-busy={isValidatingResume || uploadingResume}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">Resume</Label>
                </div>

                {currentResumeName && (
                  <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded-md">
                    {/* UI-SPEC F3 (XD-09): the filename is user-supplied, so it
                        must break rather than set the column's min-content width. */}
                    <p className="text-sm text-green-500 flex min-w-0 items-center gap-2 break-all">
                      <FileText className="h-4 w-4" />
                      Current: {currentResumeName}
                    </p>
                  </div>
                )}

                <input
                  type="file"
                  ref={resumeInputRef}
                  accept={ACCEPTED_RESUME_DOCUMENT_ACCEPT}
                  aria-describedby="profile-resume-help"
                  disabled={isValidatingResume || uploadingResume}
                  className="sr-only"
                  onChange={handleResumeSelect}
                />

                {resumeFile ? (
                  <div className="space-y-2">
                    <div className="p-2 bg-muted rounded-md flex items-center justify-between">
                      <span className="text-sm min-w-0 truncate" title={resumeFile.name}>{resumeFile.name}</span>
                      <X
                        className="h-4 w-4 cursor-pointer hover:text-red-500"
                        onClick={clearResumeSelection}
                      />
                    </div>
                    <Button
                      onClick={handleResumeUpload}
                      disabled={isValidatingResume || uploadingResume}
                      className="w-full min-h-11"
                      style={{ backgroundColor: "#FF5F67" }}
                    >
                      {isValidatingResume ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Validating...
                        </>
                      ) : uploadingResume ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Update Resume
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!isValidatingResume) resumeInputRef.current?.click();
                    }}
                    disabled={isValidatingResume || uploadingResume}
                    className="w-full min-h-11"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {currentResumeName ? "Replace Resume" : "Upload Resume"}
                  </Button>
                )}
                <p id="profile-resume-help" className="mt-2 text-sm text-muted-foreground break-words">
                  PDF or DOCX files supported. Maximum 2 pages.
                </p>
              </div>

              {/* LinkedIn PDF Upload */}
              <div className="min-w-0 p-4 border border-border rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Linkedin className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">LinkedIn PDF</Label>
                </div>

                {hasLinkedInPdf && linkedinPdfFilename && (
                  <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded-md">
                    {/* UI-SPEC F3 (XD-09): the filename is user-supplied, so it
                        must break rather than set the column's min-content width. */}
                    <p className="text-sm text-green-500 flex min-w-0 items-center gap-2 break-all">
                      <Linkedin className="h-4 w-4" />
                      Current: {linkedinPdfFilename}
                    </p>
                  </div>
                )}

                <input
                  type="file"
                  ref={linkedinInputRef}
                  accept={LINKEDIN_PDF_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file && !isPdfFile(file)) {
                      toast.error("Please upload a LinkedIn PDF file");
                      e.target.value = "";
                      return;
                    }
                    setLinkedinPdfFile(file);
                  }}
                />

                {linkedinPdfFile ? (
                  <div className="space-y-2">
                    <div className="p-2 bg-muted rounded-md flex items-center justify-between">
                      <span className="text-sm truncate">{linkedinPdfFile.name}</span>
                      <X
                        className="h-4 w-4 cursor-pointer hover:text-red-500"
                        onClick={() => setLinkedinPdfFile(null)}
                      />
                    </div>
                    <Button
                      onClick={handleLinkedInUpload}
                      disabled={uploadingLinkedIn}
                      className="w-full"
                      style={{ backgroundColor: "#FF5F67" }}
                    >
                      {uploadingLinkedIn ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Update LinkedIn PDF
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => linkedinInputRef.current?.click()}
                    className="w-full"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {hasLinkedInPdf ? "Replace LinkedIn PDF" : "Upload LinkedIn PDF"}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Save your LinkedIn profile as PDF to upload
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            {/* Basic Information */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="h-6 w-6" style={{ color: "#FF5F67" }} />
                <h2 className="text-2xl font-bold">
                  Basic Information
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="full_name" className="text-base font-semibold mb-2 block">
                    Full Name
                  </Label>
                  <Input
                    id="full_name"
                    value={profile.full_name}
                    onChange={(e) => setProfile(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="John Doe"
                    className="h-12"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-base font-semibold mb-2 block">
                    Email
                  </Label>
                  <Input
                    id="email"
                    value={profile.email}
                    disabled
                    className="h-12 opacity-60"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="linkedin_url" className="text-base font-semibold">
                      LinkedIn Profile URL
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">
                            Used to extract recruiter-facing language, career trajectory, and seniority signals.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="linkedin_url"
                    value={profile.linkedin_url}
                    onChange={(e) => setProfile(prev => ({ ...prev, linkedin_url: e.target.value }))}
                    placeholder="https://linkedin.com/in/your-profile"
                    className="h-12"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enhances Career Compass and Recruiting Lens accuracy
                  </p>
                </div>

              </div>
            </Card>

            {/* Professional Goal — the product's anchor, so it sits above billing. */}
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Target className="h-6 w-6 text-primary" />
                  <div>
                    <h2 className="text-2xl font-bold">Professional Goal</h2>
                    <p className="text-sm text-muted-foreground">
                      The one outcome Strivo is helping you work towards
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setGoalDialogOpen(true)}>
                  Edit
                </Button>
              </div>

              {professionalGoal?.trim() ? (
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  {/*
                    The RAW wording, verbatim — never the derived/structured form.
                    `whitespace-pre-line` so a goal typed across two lines is not collapsed
                    onto one now that the edit surfaces are textareas.
                  */}
                  <p className="whitespace-pre-line font-medium text-foreground">{professionalGoal}</p>
                  {goalSetAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last updated{" "}
                      {new Date(goalSetAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm text-muted-foreground">
                    No goal set yet. Add one so Strivo can measure how strongly your profile supports it.
                  </p>
                </div>
              )}
            </Card>

            <GoalEditDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} />

            {/* Subscription & Billing */}
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Zap className="h-6 w-6" style={{ color: "#FF5F67" }} />
                  <div>
                    <h2 className="text-2xl font-bold">Subscription & Billing</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage your plan and billing details
                    </p>
                  </div>
                </div>
                <Badge className={
                  normalizeActiveTier(profile.subscription_tier) === 'elite'
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    : 'bg-muted text-muted-foreground border-border'
                }>
                  {getTierDisplayName(profile.subscription_tier)}
                </Badge>
              </div>
              <Button variant="outline" asChild>
                <a href="/pricing">Manage Billing</a>
              </Button>
            </Card>

            {/* Preferred Locations */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="h-6 w-6" style={{ color: "#FF5F67" }} />
                <h2 className="text-2xl font-bold">
                  Preferred Locations
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Helps recruiters assess role availability and relocation expectations.
              </p>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addLocation()}
                    placeholder="e.g., New York, San Francisco, Remote"
                    className="h-12"
                  />
                  <Button
                    onClick={addLocation}
                    style={{ backgroundColor: "#FF5F67" }}
                    className="h-12 px-6"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {profile.preferred_locations.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {profile.preferred_locations.map((location, idx) => (
                      <Badge key={idx} variant="secondary" className="text-sm px-3 py-1.5 flex items-center gap-2">
                        {location}
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-red-500"
                          onClick={() => removeLocation(location)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Job Preferences */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Briefcase className="h-6 w-6" style={{ color: "#FF5F67" }} />
                <h2 className="text-2xl font-bold">
                  Job Preferences
                </h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="job_type" className="text-base font-semibold mb-2 block">
                    Preferred Job Type
                  </Label>
                  <select
                    id="job_type"
                    value={profile.job_type_preference}
                    onChange={(e) => setProfile(prev => ({ ...prev, job_type_preference: e.target.value }))}
                    className="w-full h-12 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="experience" className="text-base font-semibold mb-2 block">
                    Experience Level
                  </Label>
                  <select
                    id="experience"
                    value={profile.experience_level}
                    onChange={(e) => setProfile(prev => ({ ...prev, experience_level: e.target.value }))}
                    className="w-full h-12 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="entry">Entry Level</option>
                    <option value="mid">Mid Level</option>
                    <option value="senior">Senior</option>
                    <option value="lead">Lead/Principal</option>
                  </select>
                </div>
              </div>
            </Card>

            <EducationTargetsSection
              value={profile as EducationTargetsValue}
              onChange={(value) => setProfile((prev) => ({ ...prev, ...value }))}
            />

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                style={{ backgroundColor: "#FF5F67" }}
                className="h-12 px-8 text-base"
              >
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
