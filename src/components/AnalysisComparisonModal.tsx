import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { GitCompare, TrendingUp, TrendingDown, Minus, ArrowRight, CheckCircle2, AlertCircle, Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import type { LinkedInSection, LinkedInTopFix } from "@/pages/LinkedInGrader";

interface ResumeAnalysis {
  id: string;
  overall_score: number;
  grading_data: any; // legacy resume shape — unchanged
  created_at: string;
  file_name?: string;
}

interface LinkedInAnalysisData {
  id: string;
  rawScore: number;
  sectionBreakdown: LinkedInSection[];
  topFixes: LinkedInTopFix[];
  keyStrengths: string[];
  profileInsights: string[];
  created_at: string;
}

// Shape of a row fetched from the `linkedin_grades` table for comparison.
interface LinkedInPreviousRow {
  id: string;
  overall_score: number;
  grading_data: {
    rawScore?: number;
    sectionBreakdown?: LinkedInSection[];
    topFixes?: LinkedInTopFix[];
    keyStrengths?: string[];
    profileInsights?: string[];
  } | null;
  created_at: string;
}

type ComparisonProps =
  | { analysisType: "resume"; currentAnalysis: ResumeAnalysis }
  | { analysisType: "linkedin"; currentAnalysis: LinkedInAnalysisData };

const getScoreColor = (score: number) => {
  if (score >= 75) return { text: "text-emerald-600", bg: "bg-emerald-500", muted: "bg-emerald-500/10" };
  if (score >= 55) return { text: "text-amber-600", bg: "bg-amber-500", muted: "bg-amber-500/10" };
  return { text: "text-rose-600", bg: "bg-rose-500", muted: "bg-rose-500/10" };
};

const ScoreChangeIndicator = ({ current, previous }: { current: number; previous: number }) => {
  const diff = current - previous;
  
  if (diff > 0) {
    return (
      <div className="flex items-center gap-1 text-emerald-600">
        <TrendingUp className="h-4 w-4" />
        <span className="font-semibold">+{diff}</span>
      </div>
    );
  } else if (diff < 0) {
    return (
      <div className="flex items-center gap-1 text-rose-600">
        <TrendingDown className="h-4 w-4" />
        <span className="font-semibold">{diff}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span className="font-semibold">0</span>
    </div>
  );
};

const ScoreCard = ({ 
  label, 
  score, 
  isOld 
}: { 
  label: string; 
  score: number; 
  isOld?: boolean;
}) => {
  const colors = getScoreColor(score);
  
  return (
    <div className={`p-4 rounded-lg border ${isOld ? 'bg-muted/50 border-border/50' : 'bg-card border-border'}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {label}
      </p>
      <div className={`text-3xl font-bold ${colors.text}`}>
        {score}
      </div>
      <Progress value={score} className="h-1.5 mt-2" />
    </div>
  );
};

const CriteriaComparison = ({ 
  criteriaName, 
  currentScore, 
  previousScore, 
  weight 
}: { 
  criteriaName: string; 
  currentScore: number; 
  previousScore: number;
  weight: number;
}) => {
  const diff = currentScore - previousScore;
  const currentColors = getScoreColor(currentScore);
  const previousColors = getScoreColor(previousScore);
  
  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{criteriaName}</span>
          <span className="text-xs text-muted-foreground">({weight}%)</span>
        </div>
        <ScoreChangeIndicator current={currentScore} previous={previousScore} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">Before:</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${previousColors.bg} rounded-full`} style={{ width: `${previousScore}%` }} />
          </div>
          <span className={`text-sm font-medium w-8 text-right ${previousColors.text}`}>{previousScore}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12">After:</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className={`h-full ${currentColors.bg} rounded-full`}
              initial={{ width: `${previousScore}%` }}
              animate={{ width: `${currentScore}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <span className={`text-sm font-medium w-8 text-right ${currentColors.text}`}>{currentScore}</span>
        </div>
      </div>
    </div>
  );
};

const FeedbackDiff = ({ 
  title, 
  currentItems, 
  previousItems, 
  type 
}: { 
  title: string;
  currentItems: string[]; 
  previousItems: string[];
  type: "strength" | "improvement";
}) => {
  const newItems = currentItems.filter(item => !previousItems.includes(item));
  const resolvedItems = previousItems.filter(item => !currentItems.includes(item));
  const persistentItems = currentItems.filter(item => previousItems.includes(item));
  
  if (newItems.length === 0 && resolvedItems.length === 0 && persistentItems.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      
      {type === "improvement" && resolvedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolved ({resolvedItems.length})
          </p>
          {resolvedItems.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground line-through opacity-60 pl-5">
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
      
      {type === "strength" && newItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            New Strengths ({newItems.length})
          </p>
          {newItems.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground/80 pl-5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
      
      {type === "improvement" && newItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            New Areas to Improve ({newItems.length})
          </p>
          {newItems.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground/80 pl-5">
              <ArrowRight className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
      
      {persistentItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Minus className="h-3.5 w-3.5" />
            Unchanged ({persistentItems.length})
          </p>
          {persistentItems.slice(0, 2).map((item, i) => (
            <div key={i} className="text-sm text-muted-foreground pl-5 opacity-60">
              {item}
            </div>
          ))}
          {persistentItems.length > 2 && (
            <p className="text-xs text-muted-foreground pl-5">
              +{persistentItems.length - 2} more
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const AnalysisComparisonModal = (props: ComparisonProps) => {
  const { currentAnalysis, analysisType } = props;
  const [previousResumeRows, setPreviousResumeRows] = useState<ResumeAnalysis[]>([]);
  const [selectedPreviousResume, setSelectedPreviousResume] = useState<ResumeAnalysis | null>(null);
  const [previousLinkedInRows, setPreviousLinkedInRows] = useState<LinkedInPreviousRow[]>([]);
  const [selectedPreviousLinkedIn, setSelectedPreviousLinkedIn] = useState<LinkedInPreviousRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchPreviousAnalyses = async () => {
      if (!open) return;

      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (analysisType === "resume") {
          const { data, error } = await supabase
            .from('resumes')
            .select('id, overall_score, grading_data, created_at, file_name')
            .eq('user_id', user.id)
            .not('grading_data', 'is', null)
            .neq('id', currentAnalysis.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (!error && data) {
            const rows = data as ResumeAnalysis[];
            setPreviousResumeRows(rows);
            if (rows.length > 0) {
              setSelectedPreviousResume(rows[0]);
            }
          }
        } else if (analysisType === "linkedin") {
          const { data, error } = await supabase
            .from('linkedin_grades')
            .select('id, overall_score, grading_data, created_at')
            .eq('user_id', user.id)
            .neq('id', currentAnalysis.id)
            .order('created_at', { ascending: false })
            .limit(10);

          if (!error && data) {
            // Silently filter out legacy pre-v3.0 rows that don't have the new shape.
            const v3Rows = (data as LinkedInPreviousRow[]).filter(row => {
              const g = row.grading_data as Record<string, unknown> | null;
              return !!g && typeof g.rawScore === 'number' && Array.isArray(g.sectionBreakdown);
            });
            setPreviousLinkedInRows(v3Rows);
            if (v3Rows.length > 0) {
              setSelectedPreviousLinkedIn(v3Rows[0]);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching previous analyses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPreviousAnalyses();
  }, [open, currentAnalysis.id, analysisType]);

  const previousCount =
    analysisType === "resume" ? previousResumeRows.length : previousLinkedInRows.length;
  const hasPreviousAnalyses = previousCount > 0;

  const hasSelectedPrevious =
    analysisType === "resume" ? !!selectedPreviousResume : !!selectedPreviousLinkedIn;

  const selectedPreviousCreatedAt =
    analysisType === "resume"
      ? selectedPreviousResume?.created_at
      : selectedPreviousLinkedIn?.created_at;

  // Extract criteria for comparison — branches on analysisType.
  const getCurrentCriteria = (): Array<{ name: string; weight: number; score: number }> => {
    if (props.analysisType === "resume") {
      return props.currentAnalysis.grading_data?.criteria || [];
    }
    return props.currentAnalysis.sectionBreakdown.map(s => ({
      name: s.name,
      weight: s.maxScore,
      score: s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0,
    }));
  };

  const getPreviousCriteria = (): Array<{ name: string; weight: number; score: number }> => {
    if (analysisType === "resume") {
      return selectedPreviousResume?.grading_data?.criteria || [];
    }
    const g = selectedPreviousLinkedIn?.grading_data;
    const sections = g?.sectionBreakdown ?? [];
    return sections.map(s => ({
      name: s.name,
      weight: s.maxScore,
      score: s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0,
    }));
  };

  // Match criteria between analyses
  const getMatchedCriteria = () => {
    const current = getCurrentCriteria();
    const previous = getPreviousCriteria();

    return current.map((c) => {
      const match = previous.find((p) => p.name === c.name);
      return {
        name: c.name,
        weight: c.weight,
        currentScore: Math.round(c.score),
        previousScore: Math.round(match?.score || 0),
      };
    }).filter((c) => c.previousScore > 0);
  };

  // Get strengths and improvements
  const getCurrentStrengths = (): string[] => {
    if (props.analysisType === "resume") {
      return props.currentAnalysis.grading_data?.strengths || [];
    }
    return props.currentAnalysis.keyStrengths;
  };

  const getPreviousStrengths = (): string[] => {
    if (analysisType === "resume") {
      return selectedPreviousResume?.grading_data?.strengths || [];
    }
    return selectedPreviousLinkedIn?.grading_data?.keyStrengths ?? [];
  };

  const getCurrentImprovements = (): string[] => {
    if (props.analysisType === "resume") {
      return props.currentAnalysis.grading_data?.improvements || [];
    }
    return props.currentAnalysis.topFixes.map(f => f.title);
  };

  const getPreviousImprovements = (): string[] => {
    if (analysisType === "resume") {
      return selectedPreviousResume?.grading_data?.improvements || [];
    }
    return (selectedPreviousLinkedIn?.grading_data?.topFixes ?? []).map(f => f.title);
  };

  const currentScore =
    props.analysisType === "resume"
      ? props.currentAnalysis.overall_score
      : props.currentAnalysis.rawScore;

  const previousScore =
    analysisType === "resume"
      ? selectedPreviousResume?.overall_score ?? 0
      : selectedPreviousLinkedIn?.grading_data?.rawScore ??
        selectedPreviousLinkedIn?.overall_score ??
        0;

  const scoreDiff = hasSelectedPrevious ? currentScore - previousScore : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <GitCompare className="h-4 w-4" />
          Compare to Previous
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Analysis Comparison
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !hasPreviousAnalyses ? (
            <div className="text-center py-12">
              <GitCompare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Previous Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Complete another {analysisType === "resume" ? "resume analysis" : "LinkedIn grade"} to compare your progress.
              </p>
            </div>
          ) : hasSelectedPrevious ? (
            <div className="space-y-6 py-4">
              {/* Version Selector */}
              {previousCount > 1 && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      analysisType === "resume"
                        ? selectedPreviousResume
                          ? previousResumeRows.indexOf(selectedPreviousResume) === previousResumeRows.length - 1
                          : true
                        : selectedPreviousLinkedIn
                          ? previousLinkedInRows.indexOf(selectedPreviousLinkedIn) === previousLinkedInRows.length - 1
                          : true
                    }
                    onClick={() => {
                      if (analysisType === "resume" && selectedPreviousResume) {
                        const idx = previousResumeRows.indexOf(selectedPreviousResume);
                        if (idx < previousResumeRows.length - 1) {
                          setSelectedPreviousResume(previousResumeRows[idx + 1]);
                        }
                      } else if (analysisType === "linkedin" && selectedPreviousLinkedIn) {
                        const idx = previousLinkedInRows.indexOf(selectedPreviousLinkedIn);
                        if (idx < previousLinkedInRows.length - 1) {
                          setSelectedPreviousLinkedIn(previousLinkedInRows[idx + 1]);
                        }
                      }
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Older
                  </Button>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Comparing to</p>
                    <p className="text-sm font-medium">
                      {selectedPreviousCreatedAt
                        ? format(new Date(selectedPreviousCreatedAt), "MMM d, yyyy")
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={
                      analysisType === "resume"
                        ? selectedPreviousResume
                          ? previousResumeRows.indexOf(selectedPreviousResume) === 0
                          : true
                        : selectedPreviousLinkedIn
                          ? previousLinkedInRows.indexOf(selectedPreviousLinkedIn) === 0
                          : true
                    }
                    onClick={() => {
                      if (analysisType === "resume" && selectedPreviousResume) {
                        const idx = previousResumeRows.indexOf(selectedPreviousResume);
                        if (idx > 0) {
                          setSelectedPreviousResume(previousResumeRows[idx - 1]);
                        }
                      } else if (analysisType === "linkedin" && selectedPreviousLinkedIn) {
                        const idx = previousLinkedInRows.indexOf(selectedPreviousLinkedIn);
                        if (idx > 0) {
                          setSelectedPreviousLinkedIn(previousLinkedInRows[idx - 1]);
                        }
                      }
                    }}
                  >
                    Newer
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Score Summary */}
              <div className="grid grid-cols-2 gap-4">
                <ScoreCard
                  label="Previous Score"
                  score={Math.round(previousScore)}
                  isOld
                />
                <ScoreCard
                  label="Current Score"
                  score={Math.round(currentScore)}
                />
              </div>

              {/* Score Change Hero */}
              <motion.div 
                className={`p-4 rounded-lg border text-center ${
                  scoreDiff > 0 
                    ? 'bg-emerald-500/10 border-emerald-500/20' 
                    : scoreDiff < 0 
                      ? 'bg-rose-500/10 border-rose-500/20'
                      : 'bg-muted border-border'
                }`}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  {scoreDiff > 0 ? (
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  ) : scoreDiff < 0 ? (
                    <TrendingDown className="h-5 w-5 text-rose-600" />
                  ) : (
                    <Minus className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={`text-2xl font-bold ${
                    scoreDiff > 0 
                      ? 'text-emerald-600' 
                      : scoreDiff < 0 
                        ? 'text-rose-600'
                        : 'text-muted-foreground'
                  }`}>
                    {scoreDiff > 0 ? '+' : ''}{scoreDiff} points
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {scoreDiff > 0 
                    ? "Great progress! Your profile is improving." 
                    : scoreDiff < 0 
                      ? "Score decreased — review the changes below."
                      : "No change in overall score."}
                </p>
              </motion.div>

              {/* Criteria Breakdown */}
              {getMatchedCriteria().length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Criteria Breakdown
                    </h3>
                    <div className="space-y-1">
                      {getMatchedCriteria().map((criteria: any, i: number) => (
                        <CriteriaComparison
                          key={i}
                          criteriaName={criteria.name}
                          currentScore={criteria.currentScore}
                          previousScore={criteria.previousScore}
                          weight={criteria.weight}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Feedback Changes */}
              <Separator />
              <div className="space-y-6">
                <h3 className="text-sm font-semibold text-foreground">Feedback Changes</h3>
                
                <FeedbackDiff
                  title="Strengths"
                  currentItems={getCurrentStrengths()}
                  previousItems={getPreviousStrengths()}
                  type="strength"
                />
                
                <FeedbackDiff
                  title="Areas to Improve"
                  currentItems={getCurrentImprovements()}
                  previousItems={getPreviousImprovements()}
                  type="improvement"
                />
              </div>

              {/* Timeline */}
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Analysis Timeline</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-foreground font-medium">Current</span>
                    <span className="text-muted-foreground ml-auto">
                      {format(new Date(currentAnalysis.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span className="text-muted-foreground">Previous</span>
                    <span className="text-muted-foreground ml-auto">
                      {selectedPreviousCreatedAt
                        ? format(new Date(selectedPreviousCreatedAt), "MMM d, yyyy 'at' h:mm a")
                        : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
