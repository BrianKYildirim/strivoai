import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle2, ArrowRight, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AnalysisDisplayResult } from '@/lib/analysisHelpers';

interface AnalysisStep {
  id: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface AnalysisExperienceProps {
  isAnalyzing: boolean;
  analysisComplete: boolean;
  result: AnalysisDisplayResult | null;
  onViewFullResults: () => void;
  onUpgrade: () => void;
  isFreeTier?: boolean;
}

const analysisSteps: Omit<AnalysisStep, 'completed' | 'active'>[] = [
  { id: 'extract', label: 'Reading your resume' },
  { id: 'ats', label: 'Checking ATS compatibility' },
  { id: 'keywords', label: 'Analyzing keywords' },
  { id: 'standards', label: 'Comparing to hiring standards' },
  { id: 'insights', label: 'Generating personalized insights' },
];

export function AnalysisExperience({
  isAnalyzing,
  analysisComplete,
  result,
  onViewFullResults,
  onUpgrade,
  isFreeTier = true,
}: AnalysisExperienceProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<AnalysisStep[]>(
    analysisSteps.map((s, i) => ({ ...s, completed: false, active: i === 0 }))
  );
  const [showResult, setShowResult] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Animate through steps during analysis
  useEffect(() => {
    if (!isAnalyzing) return;

    const stepDuration = 4000; // 4 seconds per step
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= analysisSteps.length) {
          clearInterval(interval);
          return prev;
        }
        return next;
      });
    }, stepDuration);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Update steps based on current step
  useEffect(() => {
    setSteps(
      analysisSteps.map((s, i) => ({
        ...s,
        completed: i < currentStep,
        active: i === currentStep,
      }))
    );
  }, [currentStep]);

  // Show result after analysis completes
  useEffect(() => {
    if (analysisComplete && result) {
      const timer = setTimeout(() => setShowResult(true), 500);
      return () => clearTimeout(timer);
    }
  }, [analysisComplete, result]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Needs Work';
    return 'Needs Improvement';
  };

  if (!isAnalyzing && !analysisComplete) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl">
        <AnimatePresence mode="wait">
          {!showResult ? (
            /* Analysis Loading State */
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Header */}
              <div className="text-center space-y-2">
                {/* UI-SPEC F6 / § Accessibility Contract: under
                    `prefers-reduced-motion: reduce` a waiting affordance must be
                    "a static indicator plus the live-region text only". These are
                    framer-motion loops, so the CSS reset in `index.css` cannot
                    reach them — the gate has to live here. */}
                <motion.div
                  animate={shouldReduceMotion ? {} : { rotate: 360 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
                >
                  <Sparkles className="w-8 h-8 text-primary" />
                </motion.div>
                <h2 className="text-2xl font-semibold text-foreground">
                  Analyzing your resume
                </h2>
                <p className="text-muted-foreground">
                  This usually takes about 20 seconds
                </p>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: step.completed || step.active ? 1 : 0.4,
                      x: 0 
                    }}
                    transition={{ delay: index * 0.1 }}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
                      ${step.active ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/30'}
                    `}
                  >
                    <div className="flex-shrink-0">
                      {step.completed ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500 }}
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </motion.div>
                      ) : step.active ? (
                        <motion.div
                          animate={shouldReduceMotion ? {} : { scale: [1, 1.2, 1] }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, repeat: Infinity }}
                          className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-muted-foreground/30" />
                      )}
                    </div>
                    <span className={`text-sm ${step.active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <Progress 
                  value={(currentStep / analysisSteps.length) * 100} 
                  className="h-1 bg-secondary/50" 
                />
                <p className="text-xs text-muted-foreground text-center">
                  {Math.round((currentStep / analysisSteps.length) * 100)}% complete
                </p>
              </div>
            </motion.div>
          ) : (
            /* Results State */
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="space-y-8"
            >
              {/* Score Circle */}
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                  className="relative inline-flex items-center justify-center w-36 h-36 mb-4"
                >
                  {/* Background circle */}
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="hsl(var(--secondary))"
                      strokeWidth="8"
                      fill="none"
                    />
                    <motion.circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="hsl(var(--primary))"
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      initial={{ strokeDasharray: '0 402' }}
                      animate={{ strokeDasharray: `${(result?.score || 0) * 4.02} 402` }}
                      transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                    />
                  </svg>
                  <div className="text-center">
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className={`text-4xl font-bold ${getScoreColor(result?.score || 0)}`}
                    >
                      {result?.score || 0}
                    </motion.span>
                    <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 }}
                >
                  <h2 className="text-2xl font-semibold text-foreground mb-1">
                    {result?.headline || 'Interview Readiness Score'}
                  </h2>
                  <p className={`text-lg font-medium ${getScoreColor(result?.score || 0)}`}>
                    {getScoreLabel(result?.score || 0)}
                  </p>
                </motion.div>
              </div>

              {/* Insights */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="space-y-3"
              >
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Key Insights
                </h3>
                {result?.insights.map((insight, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.6 + index * 0.1 }}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-secondary/40"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {insight.icon === 'positive' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {insight.icon === 'warning' && <Target className="w-4 h-4 text-amber-400" />}
                      {insight.icon === 'info' && <TrendingUp className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-sm text-foreground">
                      {insight.text}
                    </p>
                  </motion.div>
                ))}
              </motion.div>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2 }}
                className="space-y-3 pt-4"
              >
                <Button
                  onClick={onViewFullResults}
                  className="w-full h-12 text-base group"
                >
                  View Full Analysis
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                
                {isFreeTier && (
                  <button
                    onClick={onUpgrade}
                    className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Unlock all insights with Elite
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
