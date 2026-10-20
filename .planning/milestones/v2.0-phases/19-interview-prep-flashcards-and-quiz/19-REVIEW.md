---
phase: 19-interview-prep-flashcards-and-quiz
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/components/FlashcardCard.tsx
  - src/components/InterviewFlashcards.tsx
  - src/components/InterviewPrepInput.tsx
  - src/components/InterviewQuiz.tsx
  - src/components/InterviewQuizResults.tsx
  - src/components/InterviewStreakDisplay.tsx
  - src/components/QuizProgressIndicator.tsx
  - src/components/QuizQuestionCard.tsx
  - src/components/QuizResultsCard.tsx
  - src/components/ReadinessScoreRing.tsx
  - src/pages/InterviewPrep.tsx
  - supabase/functions/_shared/interview-prep-prompts.ts
  - supabase/functions/_shared/interview-prep-validation.ts
  - supabase/functions/interview-prep-analyze/index.ts
  - supabase/functions/interview-prep-evaluate/index.ts
  - supabase/migrations/20260418000000_interview_prep_tables.sql
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

This phase introduces the Interview Prep feature: Pro-tier STAR flashcards, Elite-tier quiz flow, answer evaluation, streak tracking, and associated DB schema. The overall architecture is solid — tier gating, Merit integration, ownership checks, and RLS-only-read policies follow established project patterns. Two critical issues require fixing before shipping: a question-ID mismatch that will silently corrupt all DB score writes in `interview-prep-evaluate`, and a missing `tier` column value in the `interview-prep-analyze` INSERT that will fail at the DB constraint. Five warnings cover logic bugs and silent-error paths that affect reliability of the quiz and streak flows.

---

## Critical Issues

### CR-01: `interview-prep-evaluate` writes scores by `scoreEntry.question_id` (AI string "1", "2"…) but the DB column is the row UUID

**File:** `supabase/functions/interview-prep-evaluate/index.ts:272`

**Issue:** The evaluation loop matches AI-returned `scoreEntry.question_id` (the string `"1"`, `"2"`, etc. produced by the evaluation prompt) against `answers[].question_id` (also the AI string, as submitted by the client). It then fires:

```ts
.update({ ... })
.eq('id', scoreEntry.question_id)   // <-- "1", "2", etc.
.eq('quiz_id', quizId)
```

But `interview_quiz_answers.id` is a UUID (e.g. `"d3e4f5a6-…"`). Matching a UUID column against the string `"1"` will never find a row. All 5-7 `UPDATE` calls silently return 0 rows (Supabase does not error on zero-row updates), so no answer scores are ever written to the database. The quiz's `evaluated_at` and `overall_score` _are_ written, so the function returns 200 with correct scores in the response body — but the DB record stays empty.

The correct key to match is `question_order` (which was set to `q.id` — the numeric AI id — during insert) or the stored `question_id` text column (which was also set to `String(q.id)`). The interview_quiz_answers table does not have an explicit `question_id` text column in the schema, but the insert in `interview-prep-analyze` uses `question_id: String(q.id)`. Looking at the schema: the answers table has no `question_id` column either — it uses `question_order integer`. The insert in analyze maps `question_id: String(q.id)` but the column is `question_order integer`. This is a secondary mismatch (see WR-01).

The safest fix: match on `question_order` cast from the AI's numeric id:

```ts
// In the score-write loop (line ~268):
for (const scoreEntry of evalResult.scores) {
  const questionOrder = parseInt(scoreEntry.question_id, 10);
  const answerRow = answers.find((a) => a.question_id === scoreEntry.question_id);
  if (!answerRow) continue;

  const { error: updateErr } = await supabase
    .from('interview_quiz_answers')
    .update({
      user_answer: answerRow.answer_text,
      score: scoreEntry.score,
      scoring_breakdown: scoreEntry.breakdown,
      suggestions: scoreEntry.suggestions,
    })
    .eq('quiz_id', quizId)
    .eq('question_order', questionOrder);   // match on the integer order column
  ...
}
```

---

### CR-02: `interview-prep-analyze` inserts into `interview_quizzes` without the required `tier` column — will throw a DB constraint violation

**File:** `supabase/functions/interview-prep-analyze/index.ts:317-327` (Elite path) and `459-469` (Pro path)

**Issue:** The `interview_quizzes` schema declares `tier text NOT NULL CHECK (tier IN ('pro', 'elite'))` (migration line 23). Both INSERT calls omit the `tier` field:

```ts
// Elite path (line 317):
await supabase.from('interview_quizzes').insert({
  user_id: userId,
  mode: 'quiz',
  job_description: sanitizedJD.slice(0, 12000),
  job_title: jobTitle ?? null,
  company: company ?? null,
  question_count: questions.length,   // also not a DB column — see WR-01
  // tier: tier  <-- MISSING
})
```

The NOT NULL constraint will cause Postgres to reject the insert with a constraint violation error. The error is caught and causes a `MeritRefundable` throw (line 329-331), which refunds the Merit correctly but returns a 500 to the user on every single quiz/flashcard generation attempt. The feature is effectively non-functional.

**Fix:** Add `tier` to both INSERT objects:

```ts
// Elite path, line ~317:
await supabase.from('interview_quizzes').insert({
  user_id: userId,
  mode: 'quiz',
  tier: tier,                          // required NOT NULL column
  job_description: sanitizedJD.slice(0, 12000),
  job_title: jobTitle ?? null,
  company: company ?? null,
})

// Pro path, line ~459:
await supabase.from('interview_quizzes').insert({
  user_id: userId,
  mode: 'flashcard',
  tier: tier,                          // required NOT NULL column
  job_description: sanitizedJD.slice(0, 12000),
  job_title: jobTitle ?? null,
  company: company ?? null,
})
```

Also remove `question_count` from both inserts — there is no such column in the schema (see WR-01 for the separate note on this).

---

## Warnings

### WR-01: `interview-prep-analyze` inserts `question_count` and `question_id` columns that do not exist in the schema — will produce Supabase column errors

**File:** `supabase/functions/interview-prep-analyze/index.ts:322, 338, 466, 478`

**Issue:** Both INSERT paths include `question_count: questions.length` (lines 322, 466). The `interview_quizzes` table has no `question_count` column. Supabase with `service_role` will reject this with a "column does not exist" error.

Similarly, the `interview_quiz_answers` inserts include `question_id: String(q.id)` (line 339) and `question_id: String(i + 1)` (line 479). The `interview_quiz_answers` table has no `question_id` column — the correct column is `question_order integer`. This means every answer insert will also fail.

**Fix:**
- Remove `question_count` from both quiz inserts.
- Replace `question_id: String(q.id)` with `question_order: q.id` (numeric, not string) in both answer insert arrays.

```ts
// Elite answers insert (line ~337):
const answerRows = questions.map((q) => ({
  quiz_id: quizId,
  question_order: q.id,          // integer column, not question_id
  question_text: q.question,
  competency: q.competency ?? null,
}));

// Pro answers insert (line ~477):
const answerRows = flashcards.map((fc, i) => ({
  quiz_id: quizRow.id,
  question_order: i + 1,         // integer column, not question_id
  question_text: fc.question,
  competency: fc.competency ?? null,
  star_answer: fc.star_answer,   // jsonb column (not answer_text)
}));
```

Note: the Pro path also uses `answer_text: JSON.stringify(fc.star_answer)` (line 483) but the schema has `star_answer jsonb` for STAR content — use `star_answer` column instead.

---

### WR-02: `interview-prep-evaluate` answer completeness check uses DB row UUIDs but client submits AI string IDs — will always report all questions as missing

**File:** `supabase/functions/interview-prep-evaluate/index.ts:184-195`

**Issue:** The completeness check at line 184:

```ts
const answeredIds = new Set(answers.map((a) => a.question_id));
const missingQuestions = questions.filter((q) => !answeredIds.has(q.id));
```

`questions[].id` is the UUID of the `interview_quiz_answers` row. The client sends `question_id` values that are the AI-generated string IDs (`"1"`, `"2"`, etc., matching the `question_order`). These two ID spaces never overlap, so `answeredIds` will never contain any UUID, and `missingQuestions` will always equal the full question list. Every evaluation request will be rejected with a 400 "Missing answers for N question(s)" response.

**Fix:** Compare using `question_order` (the integer stored in the DB) against the parsed numeric client IDs:

```ts
const answeredOrders = new Set(answers.map((a) => parseInt(a.question_id, 10)));
const missingQuestions = questions.filter((q) => !answeredOrders.has(q.question_order));
```

---

### WR-03: `InterviewPrep` passes `streakUpdated={!!streakInfo}` which is always `true` once a streak row exists — streak celebration fires on every quiz result, not only when streak actually advanced

**File:** `src/pages/InterviewPrep.tsx:285`

**Issue:** The expression `streakUpdated={!!streakInfo}` coerces the existing `streakInfo` state (fetched once on load) to boolean. This is `true` for any Elite user who already has a streak row. On repeat quizzes taken on the same calendar day the streak does not actually increment (the backend's `same-calendar-day` branch keeps `newStreak === streakRow.current_streak`), but the UI will still display the "Streak updated! N-day streak" banner.

The backend returns updated streak data in the quiz response (`data.streak`), which is already applied to `streakInfo` via `setStreakInfo(data.streak)`. The UI has no way to distinguish whether the streak advanced or stayed the same.

**Fix:** Track whether the streak actually changed by comparing before and after:

```tsx
// Before the handleGenerate call, capture prior streak count:
const prevStreak = streakInfo?.current_streak ?? 0;

// After setStreakInfo(data.streak):
const didAdvance = (data.streak?.current_streak ?? 0) > prevStreak;
setStreakAdvanced(didAdvance); // new boolean state

// In JSX:
streakUpdated={streakAdvanced}
```

---

### WR-04: `buildEvaluationPrompt` maps answers by index position (`String(i + 1)`) but the client submits answers keyed by AI string IDs — answer text will be mismatched when questions are answered out of order

**File:** `supabase/functions/_shared/interview-prep-prompts.ts:152-156`

**Issue:** The evaluation prompt builder matches each question to an answer with:

```ts
const answer = answers.find((a) => a.question_id === String(i + 1));
```

This assumes answers are keyed `"1"`, `"2"`, … in a 1-based sequence matching the loop index. The quiz question IDs are set by the AI (`q.id` in the quiz prompt response) which does start from 1, but the client's `InterviewQuiz` component uses the DB row UUID as the `question.id` (as returned by the analyze function's response). At line 431 in `interview-prep-analyze`, the response maps `id: q.id` — which is the AI numeric id. So `answers[].question_id` in the evaluate call will be the AI string ID (e.g. `"3"`). The index-based `String(i + 1)` lookup is correct **only** if the DB question order matches the original AI order, which it does today because `question_order` is set to `q.id`. However this is a fragile assumption: if questions are stored or fetched in a different order, the answer-question pairing silently breaks.

The `questions` array passed to `buildEvaluationPrompt` comes from `ORDER BY question_order ASC`, so `i + 1` will match `question_order`. The fragility is that `question_order` must equal the AI-issued numeric id for this to work. Consider using explicit ID matching:

```ts
const answer = answers.find((a) => a.question_id === String(questions[i].question_order ?? i + 1));
```

---

### WR-05: `InterviewStreakDisplay` "expired" state renders a `<p>` as a clickable affordance but has no `onClick` handler — clicking does nothing

**File:** `src/components/InterviewStreakDisplay.tsx:71-73`

**Issue:**

```tsx
<p className="text-xs text-primary cursor-pointer hover:underline">
  Start New Streak
</p>
```

The element is styled as a clickable link with `cursor-pointer` and `hover:underline` but has no `onClick` handler. Clicking it does nothing, which is confusing UX. In addition, using a `<p>` for an interactive element is not accessible — it has no keyboard focus or role.

**Fix:** Either wire up the click to the parent's `onStartNew`-equivalent prop (accepting one from `InterviewPrepInput`'s parent), or remove the interactive styling and make it plain text until the handler is ready. If it should navigate to start a new session, add:

```tsx
<button
  className="text-xs text-primary hover:underline bg-transparent border-0 p-0 cursor-pointer"
  onClick={onStartNew}    // prop to add to InterviewStreakDisplayProps
>
  Start New Streak
</button>
```

---

## Info

### IN-01: `InterviewQuiz` uses `any` for `onResults` parameter type — results type should match `InterviewQuizResults`' `EvaluationResult`

**File:** `src/components/InterviewQuiz.tsx:25`

**Issue:** `onResults: (results: any) => void` accepts untyped data. The parent passes this directly to `InterviewQuizResults`, which expects a typed `EvaluationResult`. A shared type would eliminate the `as any` cast at line 83 and the spread at line 88 in `InterviewPrep.tsx`.

**Fix:** Export the `EvaluationResult` interface from `InterviewQuizResults.tsx` and import it in `InterviewQuiz.tsx`:

```ts
onResults: (results: EvaluationResult & { clientAnswers: Record<string, string> }) => void;
```

---

### IN-02: `InterviewPrep.tsx` uses an IIFE pattern in JSX to destructure `quizResults` — non-idiomatic React, harder to read

**File:** `src/pages/InterviewPrep.tsx:278-293`

**Issue:**

```tsx
{pageState === 'quiz-results' && quizResults && (() => {
  const { clientAnswers, ...evalResults } = quizResults;
  return <InterviewQuizResults ... />;
})()}
```

The immediately-invoked function expression inside JSX is non-standard in this codebase and adds cognitive overhead. A `useMemo` or derived variables outside the return statement are cleaner.

**Fix:** Compute outside the return:

```tsx
const evalResults = quizResults ? (() => {
  const { clientAnswers, ...rest } = quizResults;
  return { evalData: rest, clientAnswers };
})() : null;
```

Or simply move it into a helper or use a separate `<QuizResultsWrapper>` component.

---

### IN-03: `parseAiResponse` in `interview-prep-evaluate` returns `null` on double-parse failure instead of throwing — downstream `validateEvaluationScores(null, n)` returns a validation error rather than propagating a meaningful error message

**File:** `supabase/functions/interview-prep-evaluate/index.ts:51-55`

**Issue:**

```ts
try {
  const repaired = repairTruncatedJSON(text);
  return JSON.parse(repaired);
} catch {
  return null;   // silent null
}
```

When both parse attempts fail, `parseAiResponse` returns `null`. `validateEvaluationScores(null, n)` then returns `{ valid: false, error: 'Response is not an object' }`. The log message at the retry path will say "evaluation-validation-failed" with error "Response is not an object", hiding the real problem (unparseable JSON). The analyze function's equivalent `parseAiResponse` throws a `MeritRefundable` on failure, which is more explicit.

**Fix:** Throw instead of returning null so the error propagates with a clear message:

```ts
} catch {
  throw new Error('Failed to parse AI evaluation response as JSON');
}
```

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
