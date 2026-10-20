import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  Upload,
  ChevronRight,
  TrendingUp,
  Trophy,
  Target,
  Sparkles,
  ArrowRight,
  Crown
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import FeatureCards from "@/components/FeatureCards";
import { useMerits } from "@/hooks/useMerits";
import { getTierDisplayName, normalizeActiveTier } from "@/config/pricing-config";

const DashboardHome = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ full_name?: string | null; subscription_tier?: string; email?: string } | null>(null);
  const [recentResumes, setRecentResumes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userMetaName, setUserMetaName] = useState<string | null>(null);
  const { total, isLoading: meritsLoading } = useMerits();

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const metaName = user.user_metadata?.full_name || user.user_metadata?.name || null;
      if (metaName) setUserMetaName(metaName);

      const [profileResult, resumesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, subscription_tier, email")
          .eq("id", user.id)
          .single(),
        supabase
          .from("resumes")
          .select("id, file_name, overall_score, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(4)
      ]);

      if (profileResult.data) setProfile(profileResult.data);
      if (resumesResult.data) setRecentResumes(resumesResult.data);

      setIsLoading(false);
    };

    fetchData();
  }, []);

  const getFirstName = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ")[0];
    }
    if (userMetaName) {
      return userMetaName.split(" ")[0];
    }
    if (profile?.email) {
      const emailPrefix = profile.email.split("@")[0];
      const cleanName = emailPrefix.replace(/[0-9._-]/g, " ").trim().split(" ")[0];
      if (cleanName.length > 1) {
        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
      }
    }
    return null;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Needs Work";
    return "Poor";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const getTierIcon = (tier: string) => {
    if (tier === 'elite') return <Crown className="w-3.5 h-3.5" />;
    return null;
  };

  const getTierStyle = (tier: string) => {
    if (tier === 'elite') return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const tier = normalizeActiveTier(profile?.subscription_tier);

  return (
    <div className="min-h-viewport bg-background">
      {/* Premium background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/[0.02] rounded-full blur-[100px]" />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24 max-w-6xl">
        {/* Hero Welcome Section */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
                {getFirstName() ? (
                  <>Welcome back, <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">{getFirstName()}</span></>
                ) : (
                  <>Welcome back</>
                )}
              </h1>
              <p className="text-muted-foreground mt-2 text-base sm:text-lg">
                Your career intelligence dashboard
              </p>
            </div>

            {/* Tier & Merits Badge */}
            <div className="flex items-center gap-3">
              {isLoading || meritsLoading ? (
                <div className="h-10 w-48 rounded-xl bg-secondary/60 animate-pulse" />
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/60 border border-border/50 backdrop-blur-sm">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${getTierStyle(tier)}`}>
                    {getTierIcon(tier)}
                    {getTierDisplayName(tier)}
                  </div>
                  <div className="w-px h-5 bg-border/50" />
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm">
                      <span className="font-bold text-foreground">{total}</span>
                      <span className="text-muted-foreground"> Merits</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Primary CTA Card */}
        <div className="relative mb-12 group">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="relative p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-primary/20 backdrop-blur-sm overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
                    Analyze Your Resume
                  </h2>
                  <p className="text-muted-foreground text-sm sm:text-base max-w-md">
                    Get instant, recruiter-grade feedback powered by AI trained on Fortune 500 hiring patterns
                  </p>
                </div>
              </div>
              <Button 
                asChild 
                size="lg" 
                className="gap-2 shadow-lg shadow-primary/25 text-base px-6 py-6 rounded-xl group/btn w-full sm:w-auto"
              >
                <Link to="/upload">
                  Start Analysis
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Feature Cards Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Career Tools</h2>
              <p className="text-muted-foreground text-sm mt-1">Powerful AI-driven insights for every stage of your job search</p>
            </div>
          </div>
          <FeatureCards />
        </div>

        {/* Recent Analyses Section */}
        {recentResumes.length > 0 && (
          <div className="animate-fade-in">
            {/* UI-SPEC F3 (XD-04): this row's two groups exceeded the 320px
                content box on Gecko/WebKit — flex items do not shrink below
                min-content, so the row overflowed the document. Wrapping is the
                fix; no width was changed. */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">Recent Analyses</h2>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">{recentResumes.length} analyzed</span>
                </div>
              </div>
              {/* UI-SPEC F4: hit area padded to the 44px floor without growing
                  the visual label (the link has no background). */}
              <Link
                to="/history"
                className="text-sm text-primary hover:text-primary/80 inline-flex min-h-11 items-center gap-1 py-2 font-medium transition-colors [touch-action:manipulation]"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recentResumes.map((resume) => (
                <Link
                  key={resume.id}
                  to={`/results/${resume.id}`}
                  className="group p-5 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 hover:bg-secondary/50 transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-foreground truncate mb-0.5">
                            {resume.file_name}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(resume.created_at).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                        
                        {resume.overall_score && (
                          <div className="text-right flex-shrink-0">
                            <span className={`text-2xl font-bold tabular-nums ${getScoreColor(resume.overall_score)}`}>
                              {resume.overall_score}
                            </span>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                              {getScoreLabel(resume.overall_score)}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {resume.overall_score && (
                        <div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${getProgressColor(resume.overall_score)}`}
                              style={{ width: `${resume.overall_score}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              Interview ready at 75+
                            </span>
                            {resume.overall_score < 75 ? (
                              <span className="text-[10px] text-primary flex items-center gap-1 font-medium">
                                <TrendingUp className="w-3 h-3" />
                                +{75 - resume.overall_score} to goal
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                                <Trophy className="w-3 h-3" />
                                Goal reached!
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State for No Resumes */}
        {!isLoading && recentResumes.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No analyses yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upload your resume to get AI-powered feedback and start optimizing your career trajectory
            </p>
            <Button asChild size="lg" className="gap-2">
              <Link to="/upload">
                <Upload className="w-4 h-4" />
                Upload Your First Resume
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
