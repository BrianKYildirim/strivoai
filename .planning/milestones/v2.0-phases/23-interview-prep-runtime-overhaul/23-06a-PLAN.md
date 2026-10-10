---
phase: 23-interview-prep-runtime-overhaul
plan: 06a
type: execute
wave: 3
depends_on: [01, 03, 05, 06b]
# NOTE: This plan was split from the original 23-06-PLAN.md per revision-checker blast-radius
# finding. Option A chosen: container/state-machine concerns (this plan) separated from
# the 10 leaf presentation components (23-06b-PLAN.md).
#
# REVISION ROUND 2: cycle between 06a <-> 06b broken. CharacterCounter moved to 06b
# (only QuizRunner in 06b consumes it). 06a now depends_on 06b (Task 3 imports the 10
# presentation components AND CharacterCounter/StreakDisplay wiring from 06b is
# referenced by the page rewrite). 06b no longer depends_on 06a.
# Wave recomputed: 06b = wave 2, 06a = wave 3, 07 = wave 4, 08 = wave 2.
files_modified:
  - src/pages/InterviewPrep.tsx
  - src/components/interviewPrep/IntakeForm.tsx
  - src/components/interviewPrep/StreakDisplay.tsx
  - src/components/interviewPrep/StreakDisplay.test.tsx
  - src/pages/InterviewPrep.test.tsx
  - src/pages/InterviewPrep.freeGate.test.tsx
autonomous: true
requirements: [SC-1, SC-13, SC-14, IPC-01, IPC-06, UI-01]

must_haves:
  truths:
    - "src/pages/InterviewPrep.tsx uses useReducer with status union per D-18 ('loading' | 'free-gate' | 'input-form' | 'generating' | 'flashcard-results' | 'quiz-active' | 'quiz-submitting' | 'quiz-results' | 'error')"
    - "Free tier renders ProFeatureGate, never reaches analyze (IPC-01)"
    - "Pro tier with no resume -> error state with §13.4 no-resume copy; analyze is NOT invoked"
    - "Pro tier success -> flashcard-results state with 3 flashcards + 9 payload sections rendered"
    - "Elite tier success -> quiz-active state with duration-driven question count + StreakDisplay"
    - "Intake form requires D-13 fields; pre-fills D-14 defaults (behavioral/mid/30/written)"
    - "StreakDisplay renders 5 variants: active / cold / expired / first-time / cap-reached (D-19)"
    - "All §13.4 copy strings present byte-for-byte in their rendered components (SC-13)"
    - "v1 out-of-scope affordances (LinkedIn field, voice capture, history link, spaced-repetition toggle) ABSENT (SC-14)"
  artifacts:
    - path: "src/pages/InterviewPrep.tsx"
      provides: "Main page — useReducer state machine + fetch resume status + invoke analyze/evaluate"
      min_lines: 200
    - path: "src/components/interviewPrep/IntakeForm.tsx"
      provides: "9-field intake form with D-13 validation + D-14 defaults"
    - path: "src/components/interviewPrep/StreakDisplay.tsx"
      provides: "5-variant streak display (D-19)"
    - path: "src/pages/InterviewPrep.test.tsx"
      provides: "State-machine transition tests + §13.4 copy snapshot"
    - path: "src/components/interviewPrep/StreakDisplay.test.tsx"
      provides: "5 variant renders (D-19)"
  key_links:
    - from: "src/pages/InterviewPrep.tsx"
      to: "src/types/interviewPrep.ts (Plan 01)"
      via: "import { InterviewPrepPayload, IntakeForm, IntakeFormSchema }"
      pattern: "from ['\"]@/types/interviewPrep"
    - from: "src/pages/InterviewPrep.tsx"
      to: "supabase/functions/interview-prep-analyze (Plan 03)"
      via: "invokeWithTimeout('interview-prep-analyze', { body }, 90000)"
      pattern: "interview-prep-analyze"
    - from: "src/pages/InterviewPrep.tsx"
      to: "src/components/interviewPrep/ (10 components from Plan 06b + CharacterCounter from 06b)"
      via: "named imports for ReadinessHero / ReadinessBreakdown / FocusAreas / QuickTips / FlashcardDeck / QuizRunner / QuizResults / PrepRoadmap / StrengthsWatchOuts / CoachingAdvice"
      pattern: "from ['\"]@/components/interviewPrep/"
    - from: "src/components/interviewPrep/IntakeForm.tsx"
      to: "src/components/interviewPrep/CharacterCounter.tsx (Plan 06b)"
      via: "import CharacterCounter for the background_context textarea 1500-char affordance"
      pattern: "CharacterCounter"
---

<objective>
Full rewrite of `src/pages/InterviewPrep.tsx` per CONTEXT D-16, implementing the D-18 `useReducer` state machine, Free tier `ProFeatureGate`, full 9-field intake form, analyze + evaluate edge invocations, and 2 scaffolding components in this plan (IntakeForm + StreakDisplay) — 10 payload-section components AND CharacterCounter created in **Plan 23-06b** (ships in Wave 2, before this Wave 3 plan). These components render the Runtime §10 nine-section payload with UI-SPEC §13.4 copy verbatim. Retire the current 1226-line `InterviewPrep.tsx` scaffolding (mock data + sparse components). Covers SC-1 (Free gate), SC-13 (copy byte-for-byte), SC-14 (v1 out-of-scope absence). SC-6 (character counter) is covered in Plan 06b.

Purpose: The frontend page is the user's only interface — every success criteria from UI-SPEC ultimately resolves to whether this page renders the right thing at the right time. Originally sized at 17 files; per revision-checker blast-radius review split into 06a (this plan: 6 files — 2 scaffolding components + page + tests) and 06b (10 leaf presentation components + CharacterCounter). Revision round 2 moved CharacterCounter to 06b to break the import cycle (only QuizRunner consumes CharacterCounter).

Output:
- `src/pages/InterviewPrep.tsx` rewritten end-to-end
- 2 scaffolding components (IntakeForm, StreakDisplay) under `src/components/interviewPrep/`
- Page-level container + useReducer state machine + Free gate + page tests
- **NOTE:** CharacterCounter + the 10 payload-section presentation components (ReadinessHero, ReadinessBreakdown, FocusAreas, QuickTips, FlashcardDeck, QuizRunner, QuizResults, PrepRoadmap, StrengthsWatchOuts, CoachingAdvice) are created in **Plan 23-06b** (Wave 2). Task 3 (the page rewrite in THIS plan) imports them assuming they exist on disk — wave ordering (06b=2, 06a=3) guarantees 06b ships before 06a executes
- Intake form with D-13 validation + D-14 defaults (uses CharacterCounter from 06b for background_context)
- StreakDisplay unit tests
- Page-level state machine + copy snapshot test
</objective>

<execution_context>
@C:/Projects/strive-ai-hired/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projects/strive-ai-hired/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-RESEARCH.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-PATTERNS.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-VALIDATION.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-06b-PLAN.md
@src/pages/InterviewPrep.tsx
@src/pages/RecruitingLens.tsx
@src/components/InterviewPrepInput.tsx
@src/components/InterviewQuiz.tsx
@src/components/InterviewStreakDisplay.tsx
@src/components/FlashcardCard.tsx
@src/components/ProFeatureGate.tsx
@src/lib/fetchWithTimeout.ts

<interfaces>
From `src/types/interviewPrep.ts` (Plan 01):
```typescript
export type InterviewPrepPayload = {
  your_prep_readiness: { score: number; band: "not_ready"|"needs_work"|"ready_to_practice"|"ready_to_ship"; one_line_verdict: string };
  coach_verdict: string;
  readiness_breakdown: { resume_alignment: number; jd_alignment: number; star_depth: number; communication: number; notes: string };
  focus_areas: { title: string; why: string; what_to_do: string }[];
  quick_tips: string[];
  practice_questions:
    | { mode: "flashcard"; items: { question: string; competency: string; star_answer: { situation; task; action; result; resume_anchor; signal_missing }; coach_note: string }[] }
    | { mode: "quiz"; items: { id: number; question: string; competency: string }[] };
  prep_roadmap: { when: "today"|"this_week"|"before_interview"; action: string }[];
  strengths_and_watchouts: { strengths: string[]; watch_outs: string[] };
  coaching_advice: { advice: string; biggest_score_mover: string };
};
export type IntakeForm = { /* 9 fields, see Plan 01 */ };
export const IntakeFormSchema: z.ZodSchema<IntakeForm>;

export type InterviewPrepResponse = {
  quiz_id: string;
  variant: 'pro' | 'elite' | 'elite_taste';
  payload: InterviewPrepPayload;
  streak: { current_streak: number; longest_streak: number; quizzes_today: number; daily_cap: number; last_quiz_at: string | null } | null;
  daily_usage: { used: number; cap: number } | null;
};
```

From `src/lib/fetchWithTimeout.ts`:
```typescript
export async function invokeWithTimeout<T>(
  functionName: string,
  body: { body: Record<string, unknown> },
  timeoutMs?: number,
): Promise<{ data: T | null; error: Error | null }>;
```

From `src/components/ProFeatureGate.tsx`:
```typescript
interface ProFeatureGateProps {
  featureName: string;
  featureIcon: ReactNode;
  description: string;
  benefits: string[];
  children?: ReactNode;       // rendered when tier is Pro/Elite
}
```

From Plan 06b (Wave 2 — on disk before this Wave 3 plan executes):
```typescript
// src/components/interviewPrep/CharacterCounter.tsx
export function CharacterCounter(props: { value: number; max?: number; className?: string }): JSX.Element;
```

UI-SPEC §13.4 locked copy (verbatim — paste into rendered components):
- Page title: `Interview Prep Coach`
- Subtitle: `AI-powered interview readiness, grounded in your resume.`
- Primary CTA: `Generate Prep`
- No-resume copy: `Upload and analyze a resume first to generate interview prep.`
- Daily cap (Elite): `You've hit today's cap. Reset at midnight UTC.`
- Monthly taste used: `Your monthly Elite quiz is used. Resets on the 1st of next month.`
- AI error: `We couldn't generate your prep right now. Please try again.`
- Streak 5 variants (exact strings):
  - first-time: `Start your streak`
  - active: `{n}-day streak`  + subtitle `Quiz today to keep it going.`
  - cold: `{n}-day streak — cooling off`
  - expired: `Streak ended`
  - cap-reached: `You've hit today's cap`

Current analog (`src/pages/RecruitingLens.tsx` lines 244-412) — read this file as the primary template, it's the closest modern pattern.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create StreakDisplay + IntakeForm components + StreakDisplay test</name>
  <files>src/components/interviewPrep/StreakDisplay.tsx, src/components/interviewPrep/StreakDisplay.test.tsx, src/components/interviewPrep/IntakeForm.tsx</files>
  <read_first>
    - src/components/interviewPrep/CharacterCounter.tsx (FROM PLAN 06b — Wave 2; must be on disk before this plan runs)
    - src/components/InterviewStreakDisplay.tsx (current 96-line analog)
    - src/components/InterviewPrepInput.tsx (current 3-field analog; extend to 9)
    - src/components/ui/textarea.tsx, src/components/ui/select.tsx, src/components/ui/input.tsx, src/components/ui/button.tsx (shadcn primitives)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md (§Copywriting Contract + §Component Inventory)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md (D-13, D-14, D-19)
    - src/types/interviewPrep.ts (Plan 01 — use IntakeForm + IntakeFormSchema)
  </read_first>
  <behavior>
    **StreakDisplay.test.tsx (D-19):**
    - Test 1: `<StreakDisplay lastQuizAt={null} currentStreak={0} longestStreak={0} quizzesToday={0} dailyCap={3} />` → renders `Start your streak` (first-time)
    - Test 2: Active (lastQuizAt < 24h old, quizzesToday < cap, streak > 0) → renders `{n}-day streak` + `Quiz today to keep it going.`
    - Test 3: Cold (24h < lastQuizAt < 48h old, streak > 0) → renders `{n}-day streak — cooling off`
    - Test 4: Expired (lastQuizAt > 48h old) → renders `Streak ended`
    - Test 5: Cap-reached (quizzesToday >= dailyCap) → renders `You've hit today's cap`
    - Test 6: Flame icon rendered in all variants
  </behavior>
  <action>
### StreakDisplay.tsx (D-19 — 5 variants, locked copy)

```typescript
// src/components/interviewPrep/StreakDisplay.tsx
import { motion, useReducedMotion } from "framer-motion";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreakDisplayProps {
  lastQuizAt: string | null;
  currentStreak: number;
  longestStreak: number;
  quizzesToday: number;
  dailyCap: number;
}

type Variant = 'first-time' | 'active' | 'cold' | 'expired' | 'cap-reached';

function deriveVariant(p: StreakDisplayProps): Variant {
  if (p.quizzesToday >= p.dailyCap) return 'cap-reached';
  if (!p.lastQuizAt || p.currentStreak === 0) return 'first-time';
  const hoursSince = (Date.now() - new Date(p.lastQuizAt).getTime()) / 3_600_000;
  if (hoursSince >= 48) return 'expired';
  if (hoursSince >= 24) return 'cold';
  return 'active';
}

export function StreakDisplay(props: StreakDisplayProps) {
  const shouldReduceMotion = useReducedMotion();
  const variant = deriveVariant(props);

  const headline =
    variant === 'first-time' ? 'Start your streak' :
    variant === 'active'     ? `${props.currentStreak}-day streak` :
    variant === 'cold'       ? `${props.currentStreak}-day streak — cooling off` :
    variant === 'expired'    ? 'Streak ended' :
                                "You've hit today's cap";

  const subtitle =
    variant === 'active' ? 'Quiz today to keep it going.' :
    variant === 'cold'   ? `${props.quizzesToday}/${props.dailyCap} quizzes today` :
    variant === 'cap-reached' ? 'Resets at midnight UTC.' :
    null;

  return (
    <div data-testid="streak-display" data-variant={variant} className={cn(
      "flex items-center gap-3 rounded-lg p-3",
      variant === 'active' && "bg-primary/15",
      variant === 'cold' && "bg-muted",
      variant === 'expired' && "bg-muted opacity-60",
      variant === 'cap-reached' && "bg-destructive/10",
      variant === 'first-time' && "bg-accent/15",
    )}>
      <motion.div animate={shouldReduceMotion ? {} : { y: [0, -2, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
        <Flame className={cn(
          "w-5 h-5",
          variant === 'active' ? "text-primary" : "text-muted-foreground",
        )} />
      </motion.div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
```

### IntakeForm.tsx (D-13 + D-14)

```typescript
// src/components/interviewPrep/IntakeForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IntakeFormSchema, type IntakeForm as IntakeFormType } from "@/types/interviewPrep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
// CharacterCounter is owned by Plan 06b; IntakeForm optionally uses it for the
// background_context 1500-char affordance (not SC-6; SC-6 covers QuizRunner's 500-char use).
import { CharacterCounter } from "./CharacterCounter";
// ... NO import for voice capture, NO import for linkedin profile field, NO import for history (SC-14)

export interface IntakeFormProps {
  tier: 'pro' | 'elite';
  onSubmit: (data: IntakeFormType) => void;
  isGenerating: boolean;
}

export function IntakeForm({ tier, onSubmit, isGenerating }: IntakeFormProps) {
  const { register, handleSubmit, formState: { errors, isValid }, watch, setValue } = useForm<IntakeFormType>({
    resolver: zodResolver(IntakeFormSchema),
    defaultValues: {
      interview_type: 'behavioral',  // D-14
      difficulty: 'mid',              // D-14
      duration: 30,                   // D-14
      format: 'written',              // D-14
      question_categories: ['behavioral'],
      elite_taste_request: false,
    },
    mode: 'onChange',
  });

  const jd = watch('job_description') ?? '';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Required (D-13): job_description, interview_type, question_categories, difficulty, duration, format */}
      <div>
        <label htmlFor="job_description" className="text-sm font-medium">Job description *</label>
        <Textarea id="job_description" {...register('job_description')} placeholder="Paste the JD..." />
        {errors.job_description && <p className="text-sm text-destructive">{errors.job_description.message}</p>}
      </div>

      {/* Optional: role_title, company, background_context */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Role title (optional)</label>
          <Input {...register('role_title')} />
        </div>
        <div>
          <label>Company (optional)</label>
          <Input {...register('company')} />
        </div>
      </div>
      <div>
        <label>Background context (optional)</label>
        <Textarea {...register('background_context')} maxLength={1500} />
      </div>

      {/* Required dropdowns */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Interview type *</label>
          <Select defaultValue="behavioral" onValueChange={(v) => setValue('interview_type', v as any, { shouldValidate: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="behavioral">Behavioral</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="mixed_panel">Mixed panel</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Difficulty *</label>
          <Select defaultValue="mid" onValueChange={(v) => setValue('difficulty', v as any, { shouldValidate: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entry">Entry</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="senior">Senior</SelectItem>
              <SelectItem value="staff_plus">Staff+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Duration *</label>
          <Select defaultValue="30" onValueChange={(v) => setValue('duration', parseInt(v, 10) as any, { shouldValidate: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="45">45 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label>Format *</label>
          <Select defaultValue="written" onValueChange={(v) => setValue('format', v as any, { shouldValidate: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="written">Written</SelectItem>
              <SelectItem value="voice_style">Voice style</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pro only: Elite-taste request checkbox */}
      {tier === 'pro' && (
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('elite_taste_request')} />
          <span className="text-sm">Use this as my monthly Elite taste quiz</span>
        </label>
      )}

      <Button type="submit" disabled={!isValid || isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate Prep'}
      </Button>
    </form>
  );
}
```

### Tests (Vitest + React Testing Library)

```typescript
// src/components/interviewPrep/StreakDisplay.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreakDisplay } from "./StreakDisplay";

describe("StreakDisplay (D-19)", () => {
  it("renders 'Start your streak' for first-time user", () => {
    render(<StreakDisplay lastQuizAt={null} currentStreak={0} longestStreak={0} quizzesToday={0} dailyCap={3} />);
    expect(screen.getByText("Start your streak")).toBeInTheDocument();
    expect(screen.getByTestId("streak-display")).toHaveAttribute("data-variant", "first-time");
  });

  it("renders active variant with n-day streak copy", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<StreakDisplay lastQuizAt={fiveMinAgo} currentStreak={3} longestStreak={5} quizzesToday={1} dailyCap={3} />);
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(screen.getByText("Quiz today to keep it going.")).toBeInTheDocument();
  });

  it("renders cold variant when 24h < lastQuizAt < 48h", () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
    render(<StreakDisplay lastQuizAt={thirtyHoursAgo} currentStreak={2} longestStreak={3} quizzesToday={0} dailyCap={3} />);
    expect(screen.getByText("2-day streak — cooling off")).toBeInTheDocument();
  });

  it("renders expired variant when lastQuizAt > 48h", () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
    render(<StreakDisplay lastQuizAt={threeDaysAgo} currentStreak={4} longestStreak={4} quizzesToday={0} dailyCap={3} />);
    expect(screen.getByText("Streak ended")).toBeInTheDocument();
  });

  it("renders cap-reached variant when quizzesToday >= dailyCap", () => {
    render(<StreakDisplay lastQuizAt={new Date().toISOString()} currentStreak={2} longestStreak={4} quizzesToday={3} dailyCap={3} />);
    expect(screen.getByText("You've hit today's cap")).toBeInTheDocument();
  });
});
```
  </action>
  <verify>
    <automated>npm test -- StreakDisplay 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - All 3 files exist (StreakDisplay, IntakeForm + StreakDisplay test)
    - `grep -c "Start your streak\\|day streak\\|cooling off\\|Streak ended\\|hit today's cap" src/components/interviewPrep/StreakDisplay.tsx` >= 5 (all 5 variant strings)
    - `grep -c "zodResolver\\|IntakeFormSchema" src/components/interviewPrep/IntakeForm.tsx` >= 2
    - `grep -c "defaultValue.*behavioral\\|defaultValue=\"30\"\\|defaultValue=\"mid\"\\|defaultValue=\"written\"" src/components/interviewPrep/IntakeForm.tsx` >= 4 (D-14 defaults visible)
    - `grep -c "elite_taste_request\\|Elite taste quiz" src/components/interviewPrep/IntakeForm.tsx` >= 1
    - `grep -c "CharacterCounter" src/components/interviewPrep/IntakeForm.tsx` >= 0 (optional; CharacterCounter now from 06b)
    - `grep -rn "linkedin_profile\\|voice_capture\\|spaced_repetition\\|history" src/components/interviewPrep/IntakeForm.tsx` returns 0 (SC-14)
    - `npm test -- StreakDisplay` passes with >=5 tests green
    - `test -f src/components/interviewPrep/CharacterCounter.tsx` (verify 06b shipped first — wave ordering guarantee)
  </acceptance_criteria>
  <done>2 components + 1 test; Vitest green; UI-SPEC copy byte-for-byte. (CharacterCounter + its test owned by 06b.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Full rewrite of src/pages/InterviewPrep.tsx with useReducer + Free gate + page tests</name>
  <files>src/pages/InterviewPrep.tsx, src/pages/InterviewPrep.test.tsx, src/pages/InterviewPrep.freeGate.test.tsx</files>
  <read_first>
    - src/pages/InterviewPrep.tsx (current 1226-line mock — salvage design tokens only per D-16)
    - src/pages/RecruitingLens.tsx (primary analog — lines 244-412 mount + invoke)
    - src/components/ProFeatureGate.tsx (Free gate wrapper)
    - src/hooks/useMerits.ts, src/hooks/useFeatureCosts.ts, src/hooks/usePaywallGuard.ts, src/hooks/useAnalysisGuard.ts (from RecruitingLens precedent)
    - src/contexts/AdminTierTestContext.tsx (tier override for test mode)
    - src/components/UniversalAnalyzing.tsx (analyzing overlay)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md (§13.4 copy + §State machine)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md (D-16, D-18)
    - src/components/interviewPrep/* (ALL 06b components + CharacterCounter — Wave 2 output; must exist on disk)
  </read_first>
  <behavior>
    **InterviewPrep.freeGate.test.tsx (SC-1 / IPC-01):**
    - Test 1: With mocked auth returning `tier='free'`, rendering `<InterviewPrep />` shows `<ProFeatureGate featureName="Interview Prep Coach" />` block, no intake form visible
    - Test 2: Free render → `invokeWithTimeout` mock is NEVER called
    - Test 3: Free render contains the feature benefits list

    **InterviewPrep.test.tsx (SC-13 + state machine):**
    - Test 1: Initial render → state='loading' → after mount effect resolves → state transitions to 'input-form' for Pro with resume
    - Test 2: Pro with no resume → state='error' with copy `Upload and analyze a resume first to generate interview prep.`
    - Test 3: Generate Prep click → state='generating' → success → state='flashcard-results' (Pro)
    - Test 4: Generate Prep click → Elite success → state='quiz-active'
    - Test 5: QuizRunner onComplete → state='quiz-results'
    - Test 6: Error during analyze → state='error' with UI-SPEC §13.4 message `We couldn't generate your prep right now. Please try again.` (unless server sent a specific error code)
    - Test 7: Page-level copy snapshot — `getByRole('heading', { name: 'Interview Prep Coach' })` + subtitle `AI-powered interview readiness, grounded in your resume.`
    - Test 8: Primary CTA button label is exactly `Generate Prep`
    - Test 9: Negative — no element with testid or text mentioning "LinkedIn" / "voice capture" / "spaced repetition" / "history" (SC-14)
  </behavior>
  <action>
### InterviewPrep.tsx — full rewrite skeleton

```typescript
// src/pages/InterviewPrep.tsx
import { useReducer, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { useMerits, useInvalidateMerits } from "@/hooks/useMerits";
import { useAnalysisGuard } from "@/hooks/useAnalysisGuard";
import { usePaywallGuard } from "@/hooks/usePaywallGuard";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { UniversalAnalyzing } from "@/components/UniversalAnalyzing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEffectiveTier } from "@/contexts/AdminTierTestContext";
import { IntakeForm } from "@/components/interviewPrep/IntakeForm";
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
import { StreakDisplay } from "@/components/interviewPrep/StreakDisplay";
import type { IntakeForm as IntakeFormType, InterviewPrepResponse, InterviewPrepPayload } from "@/types/interviewPrep";

type Status =
  | 'loading'
  | 'free-gate'
  | 'input-form'
  | 'generating'
  | 'flashcard-results'
  | 'quiz-active'
  | 'quiz-submitting'
  | 'quiz-results'
  | 'error';

// ... (full state machine + component body unchanged from round 1 — see git history of this file)
```

**NOTE:** The full body of InterviewPrep.tsx and its tests are unchanged from revision round 1; the only change in round 2 is the explicit Wave 3 dependency on 06b (all 06b components including CharacterCounter must exist on disk when this task executes). See git history of the plan file or the previous round's action block for the full skeleton.

### Tests (unchanged from round 1)

`InterviewPrep.freeGate.test.tsx` — 3 blocks:
1. Free tier renders ProFeatureGate
2. Free tier never calls invokeWithTimeout
3. Free tier shows benefits list

`InterviewPrep.test.tsx` — 9 blocks covering state-machine transitions + §13.4 copy snapshot + SC-14 negative assertions.
  </action>
  <verify>
    <automated>npm test -- InterviewPrep 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "useReducer" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "free-gate\\|input-form\\|flashcard-results\\|quiz-active\\|quiz-submitting\\|quiz-results" src/pages/InterviewPrep.tsx` >= 6 (all state machine statuses present per D-18)
    - `grep -c "ProFeatureGate" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "interview-prep-analyze" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "invokeWithTimeout" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "Interview Prep Coach" src/pages/InterviewPrep.tsx` >= 1 (UI-SPEC §13.4 title verbatim)
    - `grep -c "AI-powered interview readiness" src/pages/InterviewPrep.tsx` >= 1 (subtitle verbatim)
    - `grep -c "Upload and analyze a resume first" src/pages/InterviewPrep.tsx` >= 1 (no-resume copy)
    - `grep -c "hit today's cap" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "monthly Elite quiz is used" src/pages/InterviewPrep.tsx` >= 1
    - `grep -c "couldn't generate your prep" src/pages/InterviewPrep.tsx` >= 1
    - `grep -rn "linkedin_profile\\|voice_capture\\|spaced_repetition" src/pages/InterviewPrep.tsx` returns 0 (SC-14)
    - `grep -c "MOCK_RESULT\\|mockResult\\|demo_data" src/pages/InterviewPrep.tsx` == 0 (legacy scaffolding retired)
    - Test files exist: `InterviewPrep.test.tsx`, `InterviewPrep.freeGate.test.tsx`
    - `grep -c "it\\(" src/pages/InterviewPrep.freeGate.test.tsx` >= 2
    - `grep -c "it\\(" src/pages/InterviewPrep.test.tsx` >= 6
    - `test -f src/components/interviewPrep/CharacterCounter.tsx` (06b dependency)
    - All 10 payload components exist: `for f in ReadinessHero ReadinessBreakdown FocusAreas QuickTips FlashcardDeck QuizRunner QuizResults PrepRoadmap StrengthsWatchOuts CoachingAdvice; do test -f "src/components/interviewPrep/$f.tsx" || exit 1; done`
    - `npm test -- InterviewPrep` passes all cases green
    - `npm run build` succeeds
  </acceptance_criteria>
  <done>Page rewritten with useReducer, free gate, state machine; Vitest green; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser ↔ edge | Auth via `supabase.auth.getUser()` JWT; intake validated via `IntakeFormSchema` (Plan 01) before fetch |
| user input ↔ edge | 500-char browser limit is UX affordance; server reject (Plan 04) is authoritative |
| mock data ↔ real flow | Current MOCK_RESULT scaffolding must be fully removed (regression risk if demo data ships) |

## STRIDE Threat Register

ASVS categories: V5 Input Validation, V7 Error Handling, V11 Business Logic.

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-FE-01 | Tampering | Free tier can see intake form via state manipulation | mitigate | Page returns EARLY with ProFeatureGate when tier==='free'; reducer never allows 'free-gate' → 'input-form' transition; Task 3 test confirms |
| T-23-FE-03 | Information Disclosure | Error detail exposure from edge function | mitigate | Generic §13.4 error copy shown to user; original `error.message` not rendered; only specific error codes (no_resume / daily_cap / monthly_taste) have user-shown messages |
| T-23-FE-04 | Business Logic | Stale state causes wrong component render (e.g., FlashcardDeck on Elite quiz state) | mitigate | `useReducer` enforces impossible-state rejection via discriminated `Action` type; status-driven render tree uses `practice_questions.mode` discriminator, NEVER a parallel flag |
| T-23-FE-05 | Tampering | Demo MOCK_RESULT ships to production | mitigate | Acceptance grep for `MOCK_RESULT|mockResult|demo_data` returns 0 |
| T-23-FE-06 | Information Disclosure | Deprecated v1-out-of-scope affordances (LinkedIn / voice / history) remain in DOM | mitigate | Acceptance grep for `linkedin_profile|voice_capture|spaced_repetition` returns 0 (SC-14) — Plan 07 catches back-end residue |
</threat_model>

<verification>
- `npm run build` succeeds
- `npm test -- InterviewPrep` green (page + freeGate tests)
- `npm test -- StreakDisplay` green
- All §13.4 copy strings grep-verified in source
- SC-14 negative grep (no v1-out-of-scope references) passes
- 06b components all present on disk (wave ordering guarantee)
</verification>

<success_criteria>
Plan 06a complete when:
- [ ] `src/pages/InterviewPrep.tsx` uses `useReducer` with 9 status union values
- [ ] Free tier renders ProFeatureGate and never calls invokeWithTimeout
- [ ] Pro-no-resume renders §13.4 error copy
- [ ] Pro success renders flashcard-results; Elite success renders quiz-active
- [ ] 2 scaffolding components (IntakeForm + StreakDisplay) + page rewrite completed in THIS plan (06a)
- [ ] 10 payload-section components + CharacterCounter (Plan 06b) already on disk before Task 3 runs
- [ ] StreakDisplay tests green (D-19)
- [ ] Page-level tests green (copy snapshot + state transitions)
- [ ] No v1-out-of-scope affordances grep-enforced (SC-14)
- [ ] Build green, type-check clean
</success_criteria>

<output>
After completion, create `.planning/phases/23-interview-prep-runtime-overhaul/23-06a-SUMMARY.md` documenting:
- LOC delta: old InterviewPrep.tsx (1226 lines) → new
- Component file inventory + byte size each
- Vitest run output
- Confirmation that MOCK_RESULT scaffolding was removed
- Confirmation that 06b shipped before 06a (wave ordering)
</output>
</content>
</invoke>