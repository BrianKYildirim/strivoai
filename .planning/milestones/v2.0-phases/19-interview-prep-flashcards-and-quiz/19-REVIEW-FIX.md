---
phase: 19-interview-prep-flashcards-and-quiz
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/19-interview-prep-flashcards-and-quiz/19-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** .planning/phases/19-interview-prep-flashcards-and-quiz/19-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: `interview-prep-evaluate` writes scores by `scoreEntry.question_id` (AI string) but the DB column is the row UUID

**Files modified:** `supabase/functions/interview-prep-evaluate/index.ts`
**Commit:** 040ef39
**Applied fix:** Changed the score-write loop to match on `question_order` (integer parsed from the AI string ID) instead of matching on `id` (UUID). Added `parseInt(scoreEntry.question_id, 10)` to convert the AI string to the integer `question_order` column value.

### CR-02: `interview-prep-analyze` inserts into `interview_quizzes` without the required `tier` column

**Files modified:** `supabase/functions/interview-prep-analyze/index.ts`
**Commit:** 4dbd279
**Applied fix:** Added `tier: tier` to both the Elite quiz INSERT (line ~321) and the Pro flashcard INSERT (line ~463). Also removed the phantom `question_count` column from both inserts (covered jointly with WR-01).

### WR-01: `interview-prep-analyze` inserts `question_count` and `question_id` columns that do not exist in the schema

**Files modified:** `supabase/functions/interview-prep-analyze/index.ts`
**Commit:** 4dbd279 (combined with CR-02)
**Applied fix:** Removed `question_count` from both quiz inserts. Replaced `question_id: String(q.id)` with `question_order: q.id` (integer) in Elite answer inserts. Replaced `question_id: String(i + 1)` with `question_order: i + 1` and `answer_text: JSON.stringify(fc.star_answer)` with `star_answer: fc.star_answer` (jsonb) in Pro flashcard answer inserts.

### WR-02: `interview-prep-evaluate` answer completeness check uses DB row UUIDs but client submits AI string IDs

**Files modified:** `supabase/functions/interview-prep-evaluate/index.ts`
**Commit:** 2dded86
**Applied fix:** Changed `answeredIds` set to parse client `question_id` strings as integers (`answeredOrders`). Changed `missingQuestions` filter to compare against `q.question_order` instead of `q.id` (UUID). Updated `missing_question_ids` in error response to return `question_order` values.

### WR-03: `InterviewPrep` passes `streakUpdated={!!streakInfo}` which is always true once a streak row exists

**Files modified:** `src/pages/InterviewPrep.tsx`
**Commit:** db7999f
**Applied fix:** Added `streakAdvanced` boolean state. Captured `prevStreak` before the generate call. After receiving streak data from the API, computed whether the streak actually advanced by comparing `data.streak.current_streak > prevStreak`. Changed JSX prop from `streakUpdated={!!streakInfo}` to `streakUpdated={streakAdvanced}`.

### WR-04: `buildEvaluationPrompt` maps answers by index position — fragile if questions reordered

**Files modified:** `supabase/functions/_shared/interview-prep-prompts.ts`
**Commit:** 67d2a47
**Applied fix:** Updated the `questions` parameter type to include optional `question_order` field. Changed answer lookup from `String(i + 1)` to `String(q.question_order ?? i + 1)`, using the explicit DB column value with index fallback for safety.

### WR-05: `InterviewStreakDisplay` "expired" state has clickable styling with no onClick handler

**Files modified:** `src/components/InterviewStreakDisplay.tsx`
**Commit:** a159070
**Applied fix:** Removed `cursor-pointer` and `hover:underline` interactive styling from the "Start New Streak" text. Changed to plain instructional text ("Complete a quiz to start a new streak") with `text-muted-foreground` styling, eliminating the misleading clickable affordance.

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
