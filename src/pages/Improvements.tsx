import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Zap, ArrowRight } from "lucide-react";

import { toast } from "sonner";
import { TextDiffComparison } from "@/components/TextDiffComparison";

const ImprovementsPage = () => {
  const { id } = useParams();
  const [resume, setResume] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  

  useEffect(() => {
    const fetchResults = async () => {
      if (!id) return;
      const { data } = await supabase.from("resumes").select("*").eq("id", id).single();
      setResume(data);
      
      if (data) {
        const { data: checklistData } = await supabase
          .from("improvement_checklist")
          .select("*")
          .eq("resume_id", id);
        
        const checklistMap: Record<string, boolean> = {};
        checklistData?.forEach((item: any) => {
          checklistMap[item.improvement_text] = item.completed;
        });
        setChecklist(checklistMap);
      }
      
      setLoading(false);
    };
    fetchResults();
  }, [id]);

  const toggleImprovement = async (improvementText: string, currentStatus: boolean) => {
    try {
      if (!id) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newStatus = !currentStatus;

      const { data: existing } = await supabase
        .from("improvement_checklist")
        .select("id")
        .eq("resume_id", id)
        .eq("improvement_text", improvementText)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("improvement_checklist")
          .update({ 
            completed: newStatus,
            completed_at: newStatus ? new Date().toISOString() : null
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("improvement_checklist")
          .insert({
            user_id: user.id,
            resume_id: id,
            improvement_text: improvementText,
            completed: newStatus,
            completed_at: newStatus ? new Date().toISOString() : null
          });
      }

      setChecklist(prev => ({ ...prev, [improvementText]: newStatus }));
      toast.success(newStatus ? "Marked as completed!" : "Marked as incomplete");
    } catch (error) {
      console.error("Error toggling improvement:", error);
      toast.error("Failed to update progress");
    }
  };


  if (loading || !resume?.grading_data) {
    return (
      <div className="container mx-auto px-4 pt-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg">Loading improvements...</p>
        </div>
      </div>
    );
  }

  const pointsNeeded = 100 - resume.overall_score;
  
  let improvementSuggestions: any[] = [];
  
  if (resume.grading_data.suggestions && resume.grading_data.suggestions.length > 0) {
    const suggestions = resume.grading_data.suggestions;
    const totalSuggestionScore = suggestions.reduce((sum: number, s: any) => sum + (s.potentialScoreIncrease || 0), 0);
    
    improvementSuggestions = suggestions.map((s: any) => {
      const rawScore = s.potentialScoreIncrease || (pointsNeeded / suggestions.length);
      const normalizedScore = totalSuggestionScore > 0 
        ? Math.round((rawScore / totalSuggestionScore) * pointsNeeded)
        : Math.round(pointsNeeded / suggestions.length);
      
      return {
        original: s.originalText,
        criteriaName: s.title || 'Improvement',
        score: normalizedScore,
        feedback: s.issues || [],
        improved: s.improvedText,
        impact: s.impact,
        color: 'yellow'
      };
    });
  } else {
    const improvementSuggestionsMap = new Map<string, any>();
    
    resume.grading_data.criteria?.forEach((c: any) => {
      const weakPoints = c.highlights?.filter((h: any) => h.color === "yellow" || h.color === "red") || [];
      weakPoints.forEach((h: any) => {
        const key = h.text.trim();
        if (!improvementSuggestionsMap.has(key)) {
          improvementSuggestionsMap.set(key, {
            original: h.text,
            criteriaName: c.name,
            score: c.score,
            feedback: c.feedback,
            color: h.color
          });
        }
      });
    });
    
    improvementSuggestions = Array.from(improvementSuggestionsMap.values());
  }

  const completedCount = improvementSuggestions.filter(item => checklist[item.original?.trim()]).length;
  const progressPercentage = improvementSuggestions.length > 0 
    ? Math.round((completedCount / improvementSuggestions.length) * 100) 
    : 0;

  const potentialScore = 100;

  const criteriaEmojis: Record<string, string> = {
    "Formatting & Structure": "📐",
    "Clarity & Readability": "📖",
    "ATS Compatibility": "🤖",
    "Education Section Quality": "🎓",
    "Experience & Impact": "💼",
    "Keyword & Skill Relevance": "🔑",
    "Leadership/Projects/Activities": "🏆",
    "Consistency & Professionalism": "✨"
  };

  return (
      <div className="container mx-auto px-4 pt-6 pb-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/20 rounded-lg">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-4xl font-bold">
            Ready-to-Paste Fixes
          </h1>
        </div>
        <p className="text-muted-foreground mb-8">{resume.file_name}</p>

        {/* Score Improvement Indicator */}
        <Card className="p-6 text-center mb-8">
          <p className="text-muted-foreground mb-2">Your Score Transformation</p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="text-4xl font-bold text-yellow-500">
              {resume.overall_score}
            </div>
            <ArrowRight className="h-8 w-8 text-muted-foreground" />
            <div className="text-4xl font-bold text-green-500">
              {potentialScore}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Badge className="bg-yellow-500">Current</Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <Badge className="bg-green-500">After Fixes</Badge>
          </div>
          
          {/* Progress Tracker */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">Your Progress</p>
              <p className="text-sm font-bold text-primary">{completedCount}/{improvementSuggestions.length} applied</p>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-primary to-green-500 h-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Copy each fix, paste it into your resume, then mark as done</p>
          </div>
        </Card>

        {/* Ready-to-Paste Rewrites */}
        {improvementSuggestions.length > 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground mb-6">
              Each fix below is specifically written for YOUR resume. Copy the optimized text, paste it into your resume, and watch your ATS score climb.
            </p>
            
            <div className="space-y-6">
              {improvementSuggestions.map((item, idx) => {
                const isCompleted = checklist[item.original?.trim()] || false;
                const hasImprovedText = item.improved && item.improved.trim().length > 0;
                
                return (
                  <div 
                    key={idx} 
                    className={`border-2 rounded-xl overflow-hidden transition-all ${
                      isCompleted 
                        ? 'border-green-500/50 bg-green-500/5' 
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`improvement-${idx}`}
                          checked={isCompleted}
                          onCheckedChange={() => toggleImprovement(item.original?.trim() || '', isCompleted)}
                        />
                        <span className="text-lg">{criteriaEmojis[item.criteriaName] || '📝'}</span>
                        <label 
                          htmlFor={`improvement-${idx}`}
                          className={`font-semibold cursor-pointer ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
                        >
                          {item.criteriaName}
                        </label>
                      </div>
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30 font-bold">
                        +{item.score} pts
                      </Badge>
                    </div>
                    
                    <div className={`p-4 ${isCompleted ? 'opacity-60' : ''}`}>
                      {/* Side-by-side comparison with highlighted changes */}
                      {item.original && hasImprovedText ? (
                        <TextDiffComparison
                          original={item.original}
                          improved={item.improved}
                          feedback={Array.isArray(item.feedback) ? item.feedback : undefined}
                          impact={item.impact}
                        />
                      ) : item.original && !hasImprovedText && item.feedback ? (
                        /* If no improved text, show actionable tips */
                        <div className="p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowRight className="h-4 w-4 text-yellow-600" />
                            <span className="text-yellow-600 font-bold text-sm">How to Fix This</span>
                          </div>
                          <p className="text-sm text-foreground/80 italic mb-3">"{item.original}"</p>
                          <ul className="text-sm text-foreground space-y-2">
                            {(Array.isArray(item.feedback) 
                              ? item.feedback 
                              : item.feedback.split(/[.!]/).filter((s: string) => s.trim().length > 10)
                            ).map((tip: string, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-yellow-500 mt-1">→</span>
                                <span>{tip.trim()}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-xl font-semibold text-green-500 mb-2">🎉 Great work!</p>
            <p className="text-muted-foreground">
              Your resume is already strong. No major improvements needed at this time.
            </p>
          </Card>
        )}
      </div>
  );
};

export default ImprovementsPage;
