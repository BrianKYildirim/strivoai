// Plan 23-06a Task 3 — InterviewPrep page rewrite.
// D-16: retires the 1226-line legacy scaffolding; design tokens preserved.
// D-18: useReducer with 9-value status union.
// SC-1 / IPC-01: Free tier -> paid feature gate (never invokes analyze).
// SC-13: UI-SPEC §13.4 copy rendered byte-for-byte.
// SC-14: v1 out-of-scope affordances (LinkedIn / voice / spaced-rep / history) absent.
import { useCallback, useEffect, useReducer } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

import { supabase } from "@/lib/supabaseClient";
import { isInterviewPrepEnabled } from "@/config/feature-flags";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminTierTest } from "@/contexts/AdminTierTestContext";
import { useMerits, useInvalidateMerits } from "@/hooks/useMerits";
import { useFeatureCosts, getCostForFeature } from "@/hooks/useFeatureCosts";
import { getMeritErrorMessage } from "@/lib/merit-error-messages";
import { usePaywallGuard } from "@/hooks/usePaywallGuard";
import { OutOfMeritsModalV2 } from "@/components/topup/OutOfMeritsModalV2";
import { useAnalysisGuard } from "@/hooks/useAnalysisGuard";
import { PriorAnalysisSelector, type ResumePriorAnalysis } from "@/components/PriorAnalysisSelector";
import { PriorSelectorEmptyState } from "@/components/PriorSelectorEmptyState";

import { LowBalanceWarning } from "@/components/LowBalanceWarning";
import { IntakeForm } from "@/components/interviewPrep/IntakeForm";
import { StreakDisplay } from "@/components/interviewPrep/StreakDisplay";
import { ReadinessHero } from "@/components/interviewPrep/ReadinessHero";
import { ReadinessBreakdown } from "@/components/interviewPrep/ReadinessBreakdown";
import { FocusAreas } from "@/components/interviewPrep/FocusAreas";
import { QuickTips } from "@/components/interviewPrep/QuickTips";
import { FlashcardDeck } from "@/components/interviewPrep/FlashcardDeck";
import { QuizRunner } from "@/components/interviewPrep/QuizRunner";
import { QuizResults } from "@/components/interviewPrep/QuizResults";
import { PrepRoadmap } from "@/components/interviewPrep/PrepRoadmap";
import { StrengthsWatchOuts } from "@/components/interviewPrep/StrengthsWatchOuts";
import { CoachingAdvice } from "@/components/interviewPrep/CoachingAdvice";
import { BlockedAiEntryPoint } from "@/components/platform/CapabilityGate";
import { isAiBlocked } from "@/lib/platform/capabilities";

import type {
  IntakeForm as IntakeFormType,
  InterviewPrepResponse,
} from "@/types/interviewPrep";

// ── State machine (D-18) ───────────────────────────────────────────────
type Status =
  | "loading"
  | "free-gate"
  | "input-form"
  | "generating"
  | "flashcard-results"
  | "quiz-active"
  | "quiz-submitting"
  | "quiz-results"
  | "error";

type StreakInfo = NonNullable<InterviewPrepResponse["streak"]>;
type DailyUsage = NonNullable<InterviewPrepResponse["daily_usage"]>;

interface State {
  status: Status;
  tier: "free" | "elite" | "admin";
  hasResume: boolean;
  response: InterviewPrepResponse | null;
  quizResult: unknown | null;
  errorMessage: string | null;
}

type Action =
  | {
      type: "bootstrap-complete";
      tier: State["tier"];
      hasResume: boolean;
    }
  | { type: "start-generate" }
  | { type: "generate-success"; response: InterviewPrepResponse }
  | { type: "generate-error"; message: string }
  | { type: "start-quiz-submit" }
  | { type: "quiz-submit-success"; result: unknown }
  | { type: "quiz-submit-error"; message: string }
  | { type: "resume-selected" }
  | { type: "reset-to-input" };

const initialState: State = {
  status: "loading",
  tier: "free",
  hasResume: false,
  response: null,
  quizResult: null,
  errorMessage: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "bootstrap-complete": {
      // SC-1 / IPC-01: Free tier short-circuits to free-gate; Pro/Elite without
      // a resume lands on error state with §13.4 copy.
      if (action.tier === "free") {
        return { ...state, status: "free-gate", tier: action.tier };
      }
      if (!action.hasResume) {
        return {
          ...state,
          status: "error",
          tier: action.tier,
          hasResume: false,
          errorMessage:
            "Upload and analyze a resume first to generate interview prep.",
        };
      }
      return {
        ...state,
        status: "input-form",
        tier: action.tier,
        hasResume: true,
      };
    }
    case "start-generate":
      return { ...state, status: "generating", errorMessage: null };
    case "generate-success": {
      // Discriminated-union driven render (T-23-FE-04): NEVER use a parallel flag.
      const mode = action.response.payload.practice_questions.mode;
      return {
        ...state,
        response: action.response,
        status: mode === "flashcard" ? "flashcard-results" : "quiz-active",
      };
    }
    case "generate-error":
      return { ...state, status: "error", errorMessage: action.message };
    case "start-quiz-submit":
      return { ...state, status: "quiz-submitting" };
    case "quiz-submit-success":
      return { ...state, status: "quiz-results", quizResult: action.result };
    case "quiz-submit-error":
      return { ...state, status: "error", errorMessage: action.message };
    case "resume-selected":
      return {
        ...state,
        status: state.tier === "free" ? "free-gate" : "input-form",
        hasResume: true,
        errorMessage: null,
      };
    case "reset-to-input":
      return {
        ...state,
        status: "input-form",
        response: null,
        quizResult: null,
        errorMessage: null,
      };
    default:
      return state;
  }
}

// ── UI-SPEC §13.4 locked copy (do not edit without spec update) ────────
const COPY = {
  pageTitle: "Interview Prep Coach",
  subtitle: "AI-powered interview readiness, grounded in your resume.",
  primaryCta: "Generate Prep",
  noResume: "Upload and analyze a resume first to generate interview prep.",
  dailyCap: "You've hit today's cap. Reset at midnight UTC.",
  monthlyTasteUsed:
    "Your monthly Elite quiz is used. Resets on the 1st of next month.",
  aiError: "We couldn't generate your prep right now. Please try again.",
};

// ── Bespoke gate-error-code mapping (T-23-FE-03: no detail leakage) ────
// Returns the feature-specific COPY string for the three non-merit gate codes
// (no_resume, daily_cap, monthly_taste_used) or null when the failure is not a
// bespoke gate — in which case the caller routes it through the shared merit
// error taxonomy (getMeritErrorMessage) instead (NFR-04).
function mapBespokeGateError(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const code = (data as { error?: string }).error;
    if (code === "no_resume") return COPY.noResume;
    if (code === "daily_cap") return COPY.dailyCap;
    if (code === "monthly_taste_used") return COPY.monthlyTasteUsed;
  }
  return null;
}

// The `stageLabels` ladder for the analyzing overlay. Module level is load-bearing:
// UniversalAnalyzing keys its timed step advance off the label count, and an array
// rebuilt every render would restart that timer.
const INTERVIEW_PREP_STAGE_LABELS: readonly string[] = [
  "Analyzing job description",
  "Reading your resume",
  "Drafting likely questions",
  "Preparing your talking points",
  "Building your prep plan",
] as const;

// ── Component ──────────────────────────────────────────────────────────
export default function InterviewPrep() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hydratedQuizId = searchParams.get("id");
  const interviewPrepEnabled = isInterviewPrepEnabled();
  const { getEffectiveTier } = useAdminTierTest();
  const { invalidate: _i } = { invalidate: useInvalidateMerits() } as {
    invalidate: () => void;
  };
  const invalidateMerits = useInvalidateMerits();
  const { optimisticDeduct } = useMerits(); // subscribe for paywall-relevant credit changes
  const { data: featureCosts } = useFeatureCosts();
  const { canAnalyze, triggerPaywall, modalProps, refresh: refreshPaywall } =
    usePaywallGuard();
  const { startAnalysis, cancelAnalysis } = useAnalysisGuard();

  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    if (!hydratedQuizId || !interviewPrepEnabled) return;
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: quiz, error: quizError } = await supabase
        .from("interview_quizzes")
        .select("id, mode, tier, job_description, role_title, company, readiness_score, created_at")
        .eq("id", hydratedQuizId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (quizError || !quiz) {
        dispatch({
          type: "generate-error",
          message: "We couldn't load that interview prep session.",
        });
        return;
      }

      const answersResult = quiz.mode === "quiz"
        ? await supabase
          .from("interview_quiz_answers")
          .select("question_order, question_text, competency, score, scoring_breakdown, suggestions")
          .eq("quiz_id", hydratedQuizId)
          .order("question_order", { ascending: true })
        : { data: [], error: null };

      if (cancelled) return;
      if (quiz.mode === "quiz" && (answersResult.error || !answersResult.data || answersResult.data.length === 0)) {
        dispatch({
          type: "generate-error",
          message: "This saved quiz is missing its question history.",
        });
        return;
      }

      const answers = answersResult.data ?? [];
      const savedRole = quiz.role_title || "this role";
      const savedCompany = quiz.company || "the target company";
      const flashcards = [
        {
          question: `Tell me about your strongest fit for ${savedRole}.`,
          competency: "Role fit",
          star_answer: {
            situation: `Use the original ${savedCompany} job context from this saved prep session.`,
            task: "Connect your resume evidence to the role requirements that mattered most.",
            action: "Choose one concrete project, explain your contribution, and name the skills you used.",
            result: "Close with the measurable outcome or learning that proves readiness for the role.",
            resume_anchor: null,
            signal_missing: true,
          },
          coach_note: "Historical flashcard details are summarized from saved session context.",
        },
        {
          question: "Walk me through a challenge you would highlight in this interview.",
          competency: "Problem solving",
          star_answer: {
            situation: "Pick a challenge similar to the responsibilities in the saved job description.",
            task: "State the goal, constraints, and what success required.",
            action: "Describe the specific decisions you made and how you communicated tradeoffs.",
            result: "End with the outcome and how it prepares you for this interview.",
            resume_anchor: null,
            signal_missing: true,
          },
          coach_note: "Use this as a replay scaffold, then generate a fresh prep for exact cards.",
        },
        {
          question: "Why are you a strong candidate for this opportunity?",
          competency: "Positioning",
          star_answer: {
            situation: `Frame your answer around ${savedRole} at ${savedCompany}.`,
            task: "Show that you understand the role's needs and can prioritize the right strengths.",
            action: "Name two resume-backed strengths and tie each to the job description.",
            result: "Finish with the value you can deliver in the first months.",
            resume_anchor: null,
            signal_missing: true,
          },
          coach_note: "Refresh the session when you need the original AI-generated flashcards.",
        },
      ];

      const response: InterviewPrepResponse = {
        quiz_id: quiz.id,
        variant: quiz.tier === "elite_taste" ? "elite_taste" : "elite",
        payload: {
          your_prep_readiness: {
            score: quiz.readiness_score ?? 0,
            band: "ready_to_practice",
            one_line_verdict: "Saved interview prep session loaded from history.",
          },
          coach_verdict: "This is a saved Interview Prep quiz. Review the questions and your prior results from this history view.",
          readiness_breakdown: {
            resume_alignment: quiz.readiness_score ?? 0,
            jd_alignment: quiz.readiness_score ?? 0,
            star_depth: quiz.readiness_score ?? 0,
            communication: quiz.readiness_score ?? 0,
            notes: "Detailed readiness notes are not stored for historical quiz replay yet.",
          },
          focus_areas: [
            { title: "Review prior answers", why: "Your saved quiz is available for review.", what_to_do: "Use the question list and scoring results to practice again." },
            { title: "Refresh before interview", why: "Interview context changes by role.", what_to_do: "Generate a new prep session for the latest job description." },
          ],
          quick_tips: [
            "Review each question before practicing aloud.",
            "Use STAR structure for behavioral answers.",
            "Regenerate prep when the job description changes.",
          ],
          practice_questions: quiz.mode === "flashcard"
            ? { mode: "flashcard", items: flashcards }
            : {
              mode: "quiz",
              items: answers.map((answer, index) => ({
                id: index + 1,
                question: String(answer.question_text),
                competency: String(answer.competency || "Interview readiness"),
              })),
            },
          prep_roadmap: [
            { when: "today", action: "Replay the saved questions and identify weak answers." },
            { when: "this_week", action: "Draft stronger STAR examples for the lowest-scoring competencies." },
            { when: "before_interview", action: "Run a fresh prep session against the final job description." },
          ],
          strengths_and_watchouts: {
            strengths: ["Saved quiz history is available for targeted practice.", "Questions remain tied to the original job context."],
            watch_outs: ["Some detailed coaching fields were not stored with this historical quiz.", "Generate a fresh session for updated role requirements."],
          },
          coaching_advice: {
            advice: "Use this saved quiz as a review artifact, then generate a fresh prep session when you are preparing for a specific interview.",
            biggest_score_mover: "Practice the lowest-scoring competency with a concise STAR answer.",
          },
        },
        streak: null,
        daily_usage: null,
      };

      dispatch({ type: "generate-success", response });
      const scoredAnswers = answers.filter((answer) => typeof answer.score === "number");
      if (scoredAnswers.length > 0) {
        dispatch({
          type: "quiz-submit-success",
          result: {
            scores: scoredAnswers.map((answer, index) => ({
              question_id: String(index + 1),
              score: Number(answer.score),
              breakdown: (answer.scoring_breakdown as Record<string, number> | null) ?? undefined,
              suggestions: Array.isArray(answer.suggestions) ? answer.suggestions : [],
            })),
          },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydratedQuizId, interviewPrepEnabled, navigate]);

  // Bootstrap: fetch tier + resume presence ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      const [profileRes, resumeRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("subscription_tier")
          .eq("id", user.id)
          .single(),
        supabase
          .from("resumes")
          .select("file_name, grading_data")
          .eq("user_id", user.id)
          .not("grading_data", "is", null)
          .order("analyzed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const rawTier =
        (profileRes.data?.subscription_tier as string | undefined) ?? "free";
      const effective = getEffectiveTier(rawTier);
      const normalizedTier: State["tier"] =
        effective === "free" ? "free" : effective === "admin" ? "admin" : "elite";

      const hasResume = Boolean(resumeRes.data?.grading_data);
      dispatch({
        type: "bootstrap-complete",
        tier: normalizedTier,
        hasResume,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, getEffectiveTier]);

  // Cleanup any in-flight request on unmount
  useEffect(() => () => cancelAnalysis(), [cancelAnalysis]);

  // ── Generate handler ─────────────────────────────────────────────────
  // XDEV-01 / D-07 — see the note in `src/pages/Upload.tsx`.
  const aiBlocked = isAiBlocked();

  const handleGenerate = async (data: IntakeFormType) => {
    if (!canAnalyze) {
      triggerPaywall();
      return;
    }
    dispatch({ type: "start-generate" });
    // D-03: optimistic decrement before the network call; one settle closure.
    const cost = getCostForFeature(featureCosts, 'interview_prep', state.tier ?? 'free') ?? 0;
    const settle = optimisticDeduct(cost);
    const result = await startAnalysis(async () => {
      const { data: resp, error } = await invokeWithTimeout<
        InterviewPrepResponse
      >(
        "interview-prep-analyze",
        { body: data },
        90000,
      );
      if (error) {
        throw Object.assign(new Error(error.message || "analyze_failed"), {
          serverData: resp,
        });
      }
      if (!resp) throw new Error("empty_response");
      return resp;
    });
    if (result.success && result.data) {
      dispatch({ type: "generate-success", response: result.data });
      settle.commit();
      refreshPaywall();
      return;
    }
    // D-02 / NFR-04: rollback the optimistic decrement, then surface copy.
    settle.rollback();
    // Keep the bespoke feature-specific codes (no_resume, daily_cap,
    // monthly_taste_used) — these are non-generic gate messages, not merit
    // errors. Anything else routes through the shared merit taxonomy.
    const serverData = (result as { data?: unknown }).data ?? null;
    const bespoke = mapBespokeGateError(serverData);
    let message: string;
    if (bespoke) {
      message = bespoke;
    } else {
      const status =
        (result as { status?: number }).status ??
        (/\b(4\d\d|5\d\d)\b/.test(result.error ?? "")
          ? Number(((result.error ?? "").match(/\b(4\d\d|5\d\d)\b/) ?? [])[0])
          : 500);
      const { title, description } = getMeritErrorMessage(status);
      message = description ? `${title} — ${description}` : title;
      dispatch({ type: "generate-error", message });
      toast.error(title, description ? { description } : undefined);
      return;
    }
    dispatch({ type: "generate-error", message });
    toast.error(message);
  };

  // ── Quiz completion handler ──────────────────────────────────────────
  const handleQuizComplete = (quizResult: unknown) => {
    dispatch({ type: "quiz-submit-success", result: quizResult });
    invalidateMerits();
  };

  const handleQuizError = (err: string) => {
    dispatch({
      type: "quiz-submit-error",
      message: err || COPY.aiError,
    });
    toast.error(err || COPY.aiError);
  };

  const handleResumePriorSelect = useCallback((_prior: ResumePriorAnalysis) => {
    dispatch({ type: "resume-selected" });
  }, []);

  // ── Render helpers ───────────────────────────────────────────────────
  const renderHeader = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-8"
    >
      <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-3">
        <MessageSquare className="h-8 w-8 text-primary" />
        {COPY.pageTitle}
      </h1>
      <p className="text-muted-foreground mt-2">{COPY.subtitle}</p>
    </motion.div>
  );

  const renderPayloadSections = () => {
    const payload = state.response?.payload;
    if (!payload) return null;
    return (
      <div className="space-y-6">
        <ReadinessHero data={payload.your_prep_readiness} />
        <Card>
          <CardContent className="p-6 space-y-2">
            <h3 className="text-lg font-semibold">Coach verdict</h3>
            <p className="text-sm text-muted-foreground">
              {payload.coach_verdict}
            </p>
          </CardContent>
        </Card>
        <ReadinessBreakdown data={payload.readiness_breakdown} />
        <FocusAreas data={payload.focus_areas} />
        <QuickTips tips={payload.quick_tips} />
        <PrepRoadmap steps={payload.prep_roadmap} />
        <StrengthsWatchOuts data={payload.strengths_and_watchouts} />
        <CoachingAdvice data={payload.coaching_advice} />
      </div>
    );
  };

  const streak: StreakInfo | null = state.response?.streak ?? null;
  const dailyUsage: DailyUsage | null = state.response?.daily_usage ?? null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-background"
      data-testid="interview-prep-root"
      data-status={state.status}
    >
      <UniversalAnalyzing
        isAnalyzing={state.status === "generating"}
        title="Building your prep"
        icon={<MessageSquare className="w-8 h-8 text-primary" />}
        stageLabels={INTERVIEW_PREP_STAGE_LABELS}
      />

      {state.status === "free-gate" ? (
        <div className="container mx-auto px-4 pt-6 pb-16 max-w-7xl">
          <ProFeatureGate
            featureName={COPY.pageTitle}
            featureIcon={<MessageSquare className="h-8 w-8" />}
            featureColor="hsl(var(--primary))"
            description={COPY.subtitle}
            benefits={[
              "Coach-grade readiness score grounded in your resume",
              "STAR-structured flashcards tied to your strongest stories",
              "Focus areas with concrete next actions",
              "Elite: live quiz with per-question scoring and streaks",
            ]}
          />
        </div>
      ) : (
        <div className="container mx-auto px-4 pt-24 pb-16 max-w-7xl">
          {renderHeader()}

          {state.status === "loading" && (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}

          {state.status === "error" && (
            state.errorMessage === COPY.noResume ? (
              <PriorAnalysisSelector
                onSelect={handleResumePriorSelect}
                emptyState={
                  <PriorSelectorEmptyState
                    headingText="No resume analysis found"
                    bodyText="Analyze a resume first to start Interview Prep."
                    ctaLabel="Analyze My Resume"
                    ctaHref="/upload"
                    blocking
                  />
                }
              />
            ) : (
              <Card>
                <CardContent className="p-6 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    {/* NFR-04 / T-31-06: surface the error-class-keyed copy as the
                        heading instead of a generic "something went wrong" string. */}
                    <p className="text-sm font-semibold text-foreground">
                      {state.errorMessage ?? COPY.aiError}
                    </p>
                    {state.hasResume && (
                      <Button
                        className="mt-3 ml-2"
                        variant="ghost"
                        onClick={() => dispatch({ type: "reset-to-input" })}
                      >
                        Try again
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          )}

          {(state.status === "input-form" || state.status === "generating") &&
            state.tier !== "free" && (
              <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-8">
                <div>
                  <LowBalanceWarning />
                  <div className="mb-6">
                    <PriorAnalysisSelector
                      onSelect={handleResumePriorSelect}
                      emptyState={null}
                    />
                  </div>
                  {aiBlocked ? (
                    // The gate lands at the PAGE's render site, not inside the shared
                    // IntakeForm: replacing the form here means its submit path is
                    // never mounted, so `handleGenerate` cannot run and the shared
                    // component stays untouched for every other caller.
                    <BlockedAiEntryPoint label="Generate Prep" className="w-full" />
                  ) : (
                  <IntakeForm
                    tier="elite"
                    onSubmit={handleGenerate}
                    isGenerating={state.status === "generating"}
                  />
                  )}
                </div>
                <div className="space-y-4">
                  {(state.tier === "elite" || state.tier === "admin") && streak && (
                    <StreakDisplay
                      lastQuizAt={streak.last_quiz_at}
                      currentStreak={streak.current_streak}
                      longestStreak={streak.longest_streak}
                      quizzesToday={streak.quizzes_today}
                      dailyCap={streak.daily_cap}
                    />
                  )}
                </div>
              </div>
            )}

          {state.status === "flashcard-results" && state.response && (
            <div className="space-y-6">
              {renderPayloadSections()}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Flashcards</h3>
                  <FlashcardDeck
                    flashcards={
                      state.response.payload.practice_questions.mode ===
                      "flashcard"
                        ? state.response.payload.practice_questions.items
                        : []
                    }
                  />
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => dispatch({ type: "reset-to-input" })}
                >
                  Generate another
                </Button>
              </div>
            </div>
          )}

          {(state.status === "quiz-active" ||
            state.status === "quiz-submitting") &&
            state.response && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
                  <div>{renderPayloadSections()}</div>
                  <div className="space-y-4">
                    {streak && (
                      <StreakDisplay
                        lastQuizAt={streak.last_quiz_at}
                        currentStreak={streak.current_streak}
                        longestStreak={streak.longest_streak}
                        quizzesToday={streak.quizzes_today}
                        dailyCap={streak.daily_cap}
                      />
                    )}
                    {dailyUsage && (
                      <p className="text-xs text-muted-foreground">
                        {dailyUsage.used}/{dailyUsage.cap} quizzes today
                      </p>
                    )}
                  </div>
                </div>
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Quiz</h3>
                    <QuizRunner
                      quizId={state.response.quiz_id}
                      questions={
                        state.response.payload.practice_questions.mode ===
                        "quiz"
                          ? state.response.payload.practice_questions.items
                          : []
                      }
                      onComplete={handleQuizComplete}
                      onError={handleQuizError}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

          {state.status === "quiz-results" && state.quizResult != null && (
            <div className="space-y-6">
              {renderPayloadSections()}
              <QuizResults
                result={
                  state.quizResult as {
                    scores: {
                      question_id: string;
                      score: number;
                      breakdown?: Record<string, number>;
                      suggestions: string[];
                    }[];
                  }
                }
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => dispatch({ type: "reset-to-input" })}
                >
                  Take another quiz
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UX-04: Out-of-merits modal driven by usePaywallGuard */}
      <OutOfMeritsModalV2 {...modalProps} />
    </div>
  );
}
