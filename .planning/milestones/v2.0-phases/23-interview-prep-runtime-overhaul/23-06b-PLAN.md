---
phase: 23-interview-prep-runtime-overhaul
plan: 06b
type: execute
wave: 2
depends_on: [01, 03, 05]
# NOTE: Split from the original 23-06-PLAN.md (Option A) per revision-checker blast-radius
# finding. This plan creates the 10 leaf payload-section presentation components consumed
# by the page rewrite in Plan 06a's Task 3, PLUS CharacterCounter (moved here in revision
# round 2 to break the 06a <-> 06b cycle — only QuizRunner consumes CharacterCounter).
#
# REVISION ROUND 2 changes:
#   - Added CharacterCounter.tsx + CharacterCounter.test.tsx to files_modified
#   - Dropped `06a` from depends_on (CharacterCounter's only consumer is QuizRunner, right here)
#   - requirements gained SC-6 (CharacterCounter is the D-15 color-state carrier)
#   - Plan 06a's page rewrite (wave 3) now depends_on this plan (wave 2)
#
# Scope-sanity note (info-level from checker): single task, 12 files. Accepted because
# each file is <=40 LOC (QuizRunner <=100, CharacterCounter <=35) and the files share
# a single cohesive concern (leaf presentation components under src/components/interviewPrep/).
files_modified:
  - src/components/interviewPrep/CharacterCounter.tsx
  - src/components/interviewPrep/CharacterCounter.test.tsx
  - src/components/interviewPrep/ReadinessHero.tsx
  - src/components/interviewPrep/ReadinessBreakdown.tsx
  - src/components/interviewPrep/FocusAreas.tsx
  - src/components/interviewPrep/QuickTips.tsx
  - src/components/interviewPrep/FlashcardDeck.tsx
  - src/components/interviewPrep/QuizRunner.tsx
  - src/components/interviewPrep/QuizResults.tsx
  - src/components/interviewPrep/PrepRoadmap.tsx
  - src/components/interviewPrep/StrengthsWatchOuts.tsx
  - src/components/interviewPrep/CoachingAdvice.tsx
autonomous: true
requirements: [SC-6, SC-7, SC-9, SC-13, SC-14, UI-01]

must_haves:
  truths:
    - "10 leaf presentation components exist under src/components/interviewPrep/, one per Runtime §10 payload section (9 sections + QuizResults for the evaluate response)"
    - "CharacterCounter.tsx exists under src/components/interviewPrep/ with D-15 color states (muted 0-499, primary =500, destructive >500)"
    - "Each component is a PURE presentation component — no side-effect hooks beyond useState in QuizRunner"
    - "Each non-stateful component file is <= 40 source lines; QuizRunner <= 100 lines"
    - "QuizRunner wires CharacterCounter (this plan) for the 500-char affordance and invokes interview-prep-evaluate"
    - "No component references v1-out-of-scope affordances (voice_capture / linkedin_profile / spaced_repetition) per SC-14"
    - "npx tsc --noEmit is green for all files against the InterviewPrepPayload schema from Plan 01"
  artifacts:
    - path: "src/components/interviewPrep/CharacterCounter.tsx"
      provides: "500-char counter with D-15 color states (muted/primary/destructive) — SC-6"
    - path: "src/components/interviewPrep/CharacterCounter.test.tsx"
      provides: "D-15 color state transitions (muted/primary/destructive)"
    - path: "src/components/interviewPrep/ReadinessHero.tsx"
      provides: "your_prep_readiness renderer (score + band + verdict)"
    - path: "src/components/interviewPrep/ReadinessBreakdown.tsx"
      provides: "4-dimension progress + notes"
    - path: "src/components/interviewPrep/FocusAreas.tsx"
      provides: "focus_areas cards (title / why / what_to_do)"
    - path: "src/components/interviewPrep/QuickTips.tsx"
      provides: "quick_tips bulleted list"
    - path: "src/components/interviewPrep/FlashcardDeck.tsx"
      provides: "Pro flashcard grid wrapping existing FlashcardCard"
    - path: "src/components/interviewPrep/QuizRunner.tsx"
      provides: "Elite quiz answer-capture + submit to interview-prep-evaluate"
    - path: "src/components/interviewPrep/QuizResults.tsx"
      provides: "Per-question score + breakdown + suggestions display"
    - path: "src/components/interviewPrep/PrepRoadmap.tsx"
      provides: "3-bucket roadmap (today / this_week / before_interview)"
    - path: "src/components/interviewPrep/StrengthsWatchOuts.tsx"
      provides: "2-column strengths + watch_outs"
    - path: "src/components/interviewPrep/CoachingAdvice.tsx"
      provides: "advice + biggest_score_mover closing card"
  key_links:
    - from: "src/components/interviewPrep/QuizRunner.tsx"
      to: "supabase/functions/interview-prep-evaluate (Plan 04)"
      via: "invokeWithTimeout('interview-prep-evaluate', { body }, 120000)"
      pattern: "interview-prep-evaluate"
    - from: "src/components/interviewPrep/QuizRunner.tsx"
      to: "src/components/interviewPrep/CharacterCounter.tsx (THIS plan)"
      via: "import CharacterCounter + wire to each answer textarea"
      pattern: "CharacterCounter"
    - from: "src/components/interviewPrep/FlashcardDeck.tsx"
      to: "src/components/FlashcardCard.tsx (existing)"
      via: "wraps FlashcardCard; may extend with optional coachNote prop"
      pattern: "FlashcardCard"
---

<objective>
Create 10 pure presentation components — one per payload section of `InterviewPrepPayload` — plus CharacterCounter under `src/components/interviewPrep/`. These are consumed by the page rewrite in Plan 06a's Task 3 (Wave 3).

Purpose: Split from the original 23-06 per revision-checker blast-radius finding (single 17-file plan -> 06a [now 6 files] + 06b [this plan, 12 files]). Keeps each component small, single-responsibility, and testable, and keeps page-level state-machine concerns separated from leaf rendering. Round 2 of revision moved CharacterCounter here (from 06a) to break the 06a <-> 06b import cycle — QuizRunner is the only consumer.

Output:
- CharacterCounter + its test (SC-6 / D-15)
- 10 presentation component files under `src/components/interviewPrep/`
- Each non-stateful component <= 40 source lines (CharacterCounter ~35, QuizRunner <= 100)
- Strict TypeScript against Plan 01 `InterviewPrepPayload` type
- No v1-out-of-scope affordances (SC-14 grep-enforced)
</objective>

<execution_context>
@C:/Projects/strive-ai-hired/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projects/strive-ai-hired/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md
@.planning/phases/23-interview-prep-runtime-overhaul/23-PATTERNS.md
@src/pages/RecruitingLens.tsx
@src/components/FlashcardCard.tsx
@src/components/InterviewQuiz.tsx
@src/components/ui/card.tsx
@src/components/ui/progress.tsx
@src/lib/fetchWithTimeout.ts
@src/lib/utils.ts

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
```

UI-SPEC §13.4 locked copy (CharacterCounter consumers):
- CharacterCounter format: `{count}/500`
- CharacterCounter over-limit helper: `Keep your answer to 500 characters or fewer.`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create CharacterCounter + test (moved from 06a per round-2 revision)</name>
  <files>src/components/interviewPrep/CharacterCounter.tsx, src/components/interviewPrep/CharacterCounter.test.tsx</files>
  <read_first>
    - .planning/phases/23-interview-prep-runtime-overhaul/23-CONTEXT.md (D-15)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md (§Copywriting Contract — over-limit helper string)
    - src/lib/utils.ts (cn helper)
  </read_first>
  <behavior>
    **CharacterCounter.test.tsx (SC-6 / D-15):**
    - Test 1: `<CharacterCounter value={0} max={500} />` → class includes `text-muted-foreground`, NOT `text-primary` or `text-destructive`; text is `0/500`
    - Test 2: `<CharacterCounter value={499} />` → muted
    - Test 3: `<CharacterCounter value={500} />` → class includes `text-primary`; text is `500/500`
    - Test 4: `<CharacterCounter value={501} />` → class includes `text-destructive`; helper text `Keep your answer to 500 characters or fewer.` rendered
    - Test 5: `<CharacterCounter value={800} />` → `800/500` rendered, destructive class, helper present
  </behavior>
  <action>
```typescript
// src/components/interviewPrep/CharacterCounter.tsx
import { cn } from "@/lib/utils";

export interface CharacterCounterProps {
  value: number;
  max?: number;
  className?: string;
}

export function CharacterCounter({ value, max = 500, className }: CharacterCounterProps) {
  const isExactMax = value === max;
  const isOver = value > max;
  return (
    <div className={cn("text-right", className)}>
      <span
        data-testid="char-counter"
        className={cn(
          "text-xs tabular-nums",
          !isExactMax && !isOver && "text-muted-foreground",
          isExactMax && "text-primary",
          isOver && "text-destructive",
        )}
      >
        {value}/{max}
      </span>
      {isOver && (
        <p className="text-xs text-destructive mt-1">
          Keep your answer to {max} characters or fewer.
        </p>
      )}
    </div>
  );
}
```

```typescript
// src/components/interviewPrep/CharacterCounter.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCounter } from "./CharacterCounter";

describe("CharacterCounter (D-15 / SC-6)", () => {
  it("renders muted color at 0/500", () => {
    render(<CharacterCounter value={0} />);
    const span = screen.getByTestId("char-counter");
    expect(span.className).toContain("text-muted-foreground");
    expect(span.textContent).toBe("0/500");
  });
  it("renders muted color at 499/500", () => {
    render(<CharacterCounter value={499} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-muted-foreground");
  });
  it("renders primary color at exactly 500/500", () => {
    render(<CharacterCounter value={500} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-primary");
  });
  it("renders destructive color + helper at 501/500", () => {
    render(<CharacterCounter value={501} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-destructive");
    expect(screen.getByText(/Keep your answer to 500 characters or fewer\./)).toBeInTheDocument();
  });
  it("renders destructive color + helper at 800/500", () => {
    render(<CharacterCounter value={800} />);
    expect(screen.getByTestId("char-counter").className).toContain("text-destructive");
    expect(screen.getByText(/Keep your answer to 500 characters or fewer\./)).toBeInTheDocument();
    expect(screen.getByTestId("char-counter").textContent).toBe("800/500");
  });
});
```
  </action>
  <verify>
    <automated>npm test -- CharacterCounter 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/interviewPrep/CharacterCounter.tsx` exists and is <= 35 source lines
    - `src/components/interviewPrep/CharacterCounter.test.tsx` exists with >=5 `it(` blocks
    - `grep -c "text-muted-foreground\\|text-primary\\|text-destructive" src/components/interviewPrep/CharacterCounter.tsx` >= 3 (all 3 color states)
    - `grep -c "Keep your answer to" src/components/interviewPrep/CharacterCounter.tsx` >= 1 (UI-SPEC copy verbatim)
    - `npm test -- CharacterCounter` passes with >=5 tests green
  </acceptance_criteria>
  <done>CharacterCounter + test; all 5 D-15 color states green.</done>
</task>

<task type="auto">
  <name>Task 2: Create 10 payload-section presentation components</name>
  <files>src/components/interviewPrep/ReadinessHero.tsx, src/components/interviewPrep/ReadinessBreakdown.tsx, src/components/interviewPrep/FocusAreas.tsx, src/components/interviewPrep/QuickTips.tsx, src/components/interviewPrep/FlashcardDeck.tsx, src/components/interviewPrep/QuizRunner.tsx, src/components/interviewPrep/QuizResults.tsx, src/components/interviewPrep/PrepRoadmap.tsx, src/components/interviewPrep/StrengthsWatchOuts.tsx, src/components/interviewPrep/CoachingAdvice.tsx</files>
  <read_first>
    - src/pages/RecruitingLens.tsx lines 600-1100 (section-block rendering pattern — Card/Progress/Badge composition)
    - src/components/FlashcardCard.tsx (current STAR flashcard analog)
    - src/components/InterviewQuiz.tsx (current quiz flow analog)
    - .planning/phases/23-interview-prep-runtime-overhaul/23-UI-SPEC.md (§Component Inventory for per-section layout guidance)
    - src/types/interviewPrep.ts (the payload type slots each component consumes)
    - src/components/interviewPrep/CharacterCounter.tsx (created in Task 1 — QuizRunner imports it)
  </read_first>
  <action>
Each component is a **pure presentation component** consuming one slot of `InterviewPrepPayload` and rendering via shadcn/Tailwind:

```typescript
// src/components/interviewPrep/ReadinessHero.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InterviewPrepPayload } from "@/types/interviewPrep";

export function ReadinessHero({ data }: { data: InterviewPrepPayload["your_prep_readiness"] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Prep Readiness</h2>
          <span className="text-3xl font-bold">{data.score}/100</span>
        </div>
        <Progress value={data.score} className="mt-4" />
        <p className="mt-2 text-sm font-medium capitalize">{data.band.replace(/_/g, ' ')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{data.one_line_verdict}</p>
      </CardContent>
    </Card>
  );
}
```

```typescript
// src/components/interviewPrep/ReadinessBreakdown.tsx
export function ReadinessBreakdown({ data }: { data: InterviewPrepPayload["readiness_breakdown"] }) {
  const rows = [
    { label: "Resume alignment", value: data.resume_alignment },
    { label: "JD alignment",     value: data.jd_alignment },
    { label: "STAR depth",       value: data.star_depth },
    { label: "Communication",    value: data.communication },
  ];
  return <Card>...render rows with <Progress />... + notes paragraph...</Card>;
}
```

```typescript
// src/components/interviewPrep/FocusAreas.tsx
export function FocusAreas({ data }: { data: InterviewPrepPayload["focus_areas"] }) {
  return <div>data.map((f) => <Card><h3>{f.title}</h3><p>{f.why}</p><p><strong>Do:</strong> {f.what_to_do}</p></Card>)</div>;
}
```

```typescript
// src/components/interviewPrep/QuickTips.tsx
export function QuickTips({ tips }: { tips: string[] }) {
  return <ul>tips.map((t, i) => <li key={i}>{t}</li>)</ul>;
}
```

```typescript
// src/components/interviewPrep/FlashcardDeck.tsx
import { FlashcardCard } from "@/components/FlashcardCard";
export function FlashcardDeck({ flashcards }: { flashcards: Extract<InterviewPrepPayload["practice_questions"], { mode: "flashcard" }>["items"] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {flashcards.map((f, i) => (
        <FlashcardCard
          key={i}
          question={f.question}
          competency={f.competency}
          answer={f.star_answer}
          index={i}
          coachNote={f.coach_note}
        />
      ))}
    </div>
  );
}
```
(NOTE: the existing `FlashcardCard` may need a `coachNote` prop added — either here in this plan or left to the component's authoring session if minimal. If adding the prop, keep it optional for backward compatibility.)

```typescript
// src/components/interviewPrep/QuizRunner.tsx
import { useState } from "react";
import { CharacterCounter } from "./CharacterCounter";  // from Task 1 of THIS plan (no cycle)
import { invokeWithTimeout } from "@/lib/fetchWithTimeout";
import { Button } from "@/components/ui/button";

export interface QuizRunnerProps {
  quizId: string;
  questions: { id: number; question: string; competency: string }[];
  onComplete: (result: any) => void;
  onError: (err: string) => void;
}

export function QuizRunner({ quizId, questions, onComplete, onError }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const anyOver500 = Object.values(answers).some(a => a.length > 500);

  const handleSubmit = async () => {
    if (anyOver500 || submitting) return;
    setSubmitting(true);
    const { data, error } = await invokeWithTimeout('interview-prep-evaluate', {
      body: {
        quiz_id: quizId,
        answers: questions.map(q => ({
          question_id: String(q.id),           // SC-7: string representation of integer
          answer_text: answers[q.id] ?? '',
        })),
      },
    }, 120000);
    setSubmitting(false);
    if (error || !data) { onError(error?.message ?? 'Evaluation failed.'); return; }
    onComplete(data);
  };

  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="font-medium">Q{q.id}: {q.question}</p>
          <textarea
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            className="w-full mt-2"
            rows={6}
          />
          <CharacterCounter value={(answers[q.id] ?? '').length} max={500} />
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={anyOver500 || submitting}>
        {submitting ? 'Submitting...' : 'Submit Answers'}
      </Button>
    </div>
  );
}
```

```typescript
// src/components/interviewPrep/QuizResults.tsx
export function QuizResults({ result }: { result: { scores: { question_id: string; score: number; breakdown: any; suggestions: string[] }[] } }) {
  return <div>result.scores.map((s) => <Card><p>Q{s.question_id}: {s.score}/100</p>...)</div>;
}
```

```typescript
// src/components/interviewPrep/PrepRoadmap.tsx
export function PrepRoadmap({ steps }: { steps: InterviewPrepPayload["prep_roadmap"] }) {
  const labelMap = { today: "Today", this_week: "This week", before_interview: "Before interview" };
  return <ol>steps.map(s => <li><strong>{labelMap[s.when]}:</strong> {s.action}</li>)</ol>;
}
```

```typescript
// src/components/interviewPrep/StrengthsWatchOuts.tsx
export function StrengthsWatchOuts({ data }: { data: InterviewPrepPayload["strengths_and_watchouts"] }) {
  return <div className="grid grid-cols-2 gap-4">
    <Card><h3>Strengths</h3><ul>data.strengths.map(...)</ul></Card>
    <Card><h3>Watch outs</h3><ul>data.watch_outs.map(...)</ul></Card>
  </div>;
}
```

```typescript
// src/components/interviewPrep/CoachingAdvice.tsx
export function CoachingAdvice({ data }: { data: InterviewPrepPayload["coaching_advice"] }) {
  return <Card>
    <p>{data.advice}</p>
    <p className="mt-4"><strong>Biggest score mover:</strong> {data.biggest_score_mover}</p>
  </Card>;
}
```

**Constraint:** Each component file ≤ 100 lines. Keep them pure presentation — no hooks except `useState` in QuizRunner. All styling via shadcn + Tailwind tokens (no hardcoded colors).

**SC-14 negative constraint:** None of these components may reference `voice_capture`, `linkedin_profile`, `spaced_repetition`, `history`. Grep-enforced in acceptance.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "components/interviewPrep" | head -20</automated>
  </verify>
  <acceptance_criteria>
    - All 10 component files exist under `src/components/interviewPrep/`
    - `grep -rn "InterviewPrepPayload\\|practice_questions\\|readiness_breakdown" src/components/interviewPrep/` >= 5 (type usage pervasive)
    - `grep -c "parseInt\\|String(q.id)\\|q\\.id" src/components/interviewPrep/QuizRunner.tsx` >= 1 (integer representation for SC-7)
    - `grep -c "CharacterCounter" src/components/interviewPrep/QuizRunner.tsx` >= 1 (500-char counter wired in per D-15; import is from "./CharacterCounter" — same plan, no cycle)
    - `grep -rn "voice_capture\\|linkedin_profile\\|spaced_repetition" src/components/interviewPrep/` returns 0 (SC-14)
    - `grep -c "interview-prep-evaluate" src/components/interviewPrep/QuizRunner.tsx` >= 1
    - Each of the 9 pure-presentation component files (ReadinessHero, ReadinessBreakdown, FocusAreas, QuickTips, FlashcardDeck, QuizResults, PrepRoadmap, StrengthsWatchOuts, CoachingAdvice) has <= 40 source lines: `for f in ReadinessHero ReadinessBreakdown FocusAreas QuickTips FlashcardDeck QuizResults PrepRoadmap StrengthsWatchOuts CoachingAdvice; do n=$(awk 'END{print NR}' "src/components/interviewPrep/$f.tsx"); [ "$n" -le 40 ] || { echo "$f: $n lines (> 40)"; exit 1; }; done`
    - QuizRunner.tsx (the only stateful component) <= 100 source lines: `awk 'END{exit !(NR<=100)}' src/components/interviewPrep/QuizRunner.tsx`
    - No `dangerouslySetInnerHTML` in any 06b file: `grep -rn "dangerouslySetInnerHTML" src/components/interviewPrep/ReadinessHero.tsx src/components/interviewPrep/ReadinessBreakdown.tsx src/components/interviewPrep/FocusAreas.tsx src/components/interviewPrep/QuickTips.tsx src/components/interviewPrep/FlashcardDeck.tsx src/components/interviewPrep/QuizRunner.tsx src/components/interviewPrep/QuizResults.tsx src/components/interviewPrep/PrepRoadmap.tsx src/components/interviewPrep/StrengthsWatchOuts.tsx src/components/interviewPrep/CoachingAdvice.tsx` returns 0
    - `npm run build` succeeds (TypeScript compilation green)
  </acceptance_criteria>
  <done>10 components created, compile green, no v1-out-of-scope references. QuizRunner imports CharacterCounter from same plan (no cycle with 06a).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser <-> edge (QuizRunner) | invokeWithTimeout('interview-prep-evaluate', ...) — auth-gated edge call, body validated server-side in Plan 04 |
| payload schema <-> leaf components | Each component consumes a typed slot of InterviewPrepPayload; Plan 01 IntakeFormSchema + InterviewPrepPayloadSchema are the trust boundary |
| CharacterCounter client 500-char limit <-> server | UI affordance only; server (Plan 04) is authoritative (`answer_text.slice(0, 500)`) |

## STRIDE Threat Register

ASVS categories: V5 Input Validation, V7 Error Handling, V11 Business Logic.

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-23-FE-02 | Tampering | Browser 500-char limit bypassed via DOM mutation | accept (server is authoritative) | Plan 04 `answer_text.slice(0, 500)` is the source of truth; CharacterCounter + textarea UI is UX only |
| T-23-FE-06 (carried) | Information Disclosure | v1-out-of-scope affordances leak | mitigate | Acceptance grep for `linkedin_profile\|voice_capture\|spaced_repetition` returns 0 — Plan 07 catches any back-end residue |
| T-23-FEB-01 | Injection | QuizRunner renders answers back via React — dangerouslySetInnerHTML? | mitigate | Plan constraint: "pure presentation + shadcn/Tailwind only"; no `dangerouslySetInnerHTML` anywhere in 06b files (grep-enforced in acceptance) |
| T-23-FEB-02 | Business Logic | QuizRunner submits before validation — empty/over-limit answers dispatch to evaluator | mitigate | QuizRunner code guards: `anyOver500` blocks submit; empty answers left to Plan 04 server validation |
</threat_model>

<verification>
- `npm run build` succeeds with zero TypeScript errors scoped to these files
- All 11 components + 1 test exist on disk
- LOC caps enforced via awk in acceptance
- SC-14 grep returns zero matches
- No `dangerouslySetInnerHTML` in any 06b file
- `npm test -- CharacterCounter` green (>=5 D-15 color-state tests)
</verification>

<success_criteria>
Plan 06b complete when:
- [ ] CharacterCounter.tsx + CharacterCounter.test.tsx created (moved from 06a per round-2 revision)
- [ ] 10 pure-presentation component files created under `src/components/interviewPrep/`
- [ ] Each non-stateful component <= 40 source lines; QuizRunner <= 100 lines; CharacterCounter <= 35 lines
- [ ] `npx tsc --noEmit -p tsconfig.app.json` reports zero errors in these files
- [ ] QuizRunner wires CharacterCounter (same plan, relative import — no cycle) + invokes interview-prep-evaluate
- [ ] SC-6 CharacterCounter D-15 color-state tests green
- [ ] SC-14 grep returns zero matches across these files
- [ ] Build green
</success_criteria>

<output>
After completion, create `.planning/phases/23-interview-prep-runtime-overhaul/23-06b-SUMMARY.md` documenting:
- LOC per component file (awk output)
- TypeScript diagnostics (should be 0)
- Confirmation each component consumes only its declared payload slot
- Confirmation Plan 06a's Task 3 imports resolve at build time
- Confirmation CharacterCounter import in QuizRunner uses "./CharacterCounter" (same-plan, no 06a dependency)
</output>
</content>
</invoke>