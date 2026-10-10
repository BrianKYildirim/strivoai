# Phase 19: interview-prep-flashcards-and-quiz - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 19-interview-prep-flashcards-and-quiz
**Areas discussed:** Resume input source, Quiz submission flow, Legacy function handling, Streak mechanics

***

## Resume Input Source

| Option                               | Description                                                                                                               | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Server-side auto-fetch (Recommended) | Edge function queries the resumes table for the user's most recently analyzed resume. No resume text in the request body. | ✓        |
| Frontend sends resume text           | Frontend reads the resume from its local state, includes resume text in request body alongside JD.                        |          |
| Server-side with frontend override   | Default auto-fetch, optional resume\_id override from frontend.                                                           |          |

**User's choice:** Server-side auto-fetch
**Notes:** Matches Phase 18's recruiting-lens auto-detect pattern (RCL-06).

### Follow-up: No resume on file

| Option                               | Description                                                        | Selected |
| ------------------------------------ | ------------------------------------------------------------------ | -------- |
| Block with clear error (Recommended) | Return 400 with "Upload a resume first." No Merit deduction.       | ✓        |
| Generate from JD only                | Fall back to JD-only generation like current interview-prep-coach. |          |
| You decide                           | Let Claude pick.                                                   |          |

**User's choice:** Block with clear error

***

## Quiz Submission Flow

| Option                                 | Description                                                                                                               | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Batch submit all answers (Recommended) | Frontend collects all answers locally, sends in one call to interview-prep-evaluate. Single 5-Merit charge at generation. | ✓        |
| Submit per answer, evaluate at end     | Each answer saved individually, final evaluate call scores all.                                                           |          |
| Submit per answer with live scoring    | Each answer scored immediately by AI.                                                                                     |          |

**User's choice:** Batch submit all answers

### Follow-up: Quiz persistence timing

| Option                              | Description                                                                                  | Selected |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Persist on generation (Recommended) | interview-prep-analyze writes quiz + questions to DB immediately. Enables resume-quiz later. | ✓        |
| Persist only on submission          | Questions live in frontend state only. DB record created on evaluate call.                   |          |
| You decide                          | Let Claude pick.                                                                             |          |

**User's choice:** Persist on generation

***

## Legacy Function Handling

| Option                                    | Description                                                                                                            | Selected |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Keep behind flag, deprecate (Recommended) | interview-prep-coach stays behind MERIT\_SYSTEM\_ENABLED=false. New functions are the Merit path. Removed in Phase 21. | ✓        |
| Remove immediately                        | Delete interview-prep-coach entirely.                                                                                  |          |
| Refactor in-place                         | Rename/refactor existing into new functions.                                                                           |          |

**User's choice:** Keep behind flag, deprecate

### Follow-up: Frontend scope in Phase 19

| Option                                     | Description                                                                        | Selected |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| Minimal frontend in Phase 19 (Recommended) | Update InterviewPrep.tsx to call new edge functions, no new quiz UI.               |          |
| Backend only, defer all FE                 | Zero frontend changes.                                                             |          |
| Full frontend in Phase 19                  | Ship complete quiz card UI, flashcard rendering, streak display alongside backend. | ✓        |

**User's choice:** Full frontend in Phase 19

### Follow-up: Which Phase 20 items move to Phase 19

| Option                        | Description                                                                   | Selected |
| ----------------------------- | ----------------------------------------------------------------------------- | -------- |
| UX-09: Quiz card UI + results | Quiz mode card interface, 500-char textarea, STAR breakdown, readiness score. | ✓        |
| UX-10: Streak display         | Flame icon, day count, cold/expired states, daily counter.                    | ✓        |
| Pro flashcard rendering       | Read-only STAR flashcard cards for Pro users.                                 | ✓        |

**User's choice:** All three — complete Interview Prep experience in Phase 19.

***

## Streak Mechanics

| Option                                     | Description                                                                      | Selected |
| ------------------------------------------ | -------------------------------------------------------------------------------- | -------- |
| Rolling hours from last quiz (Recommended) | Cold 24h after last\_quiz\_at, expires at 48h. Daily cap resets at midnight UTC. | ✓        |
| User's local midnight                      | Track timezone, use local midnight.                                              |          |
| You decide                                 | Let Claude pick.                                                                 |          |

**User's choice:** Rolling hours from last quiz

### Follow-up: Streak enforcement location

| Option                                      | Description                                                                            | Selected |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Inside interview-prep-analyze (Recommended) | Edge function checks streaks + daily count before generating. All in one request path. | ✓        |
| Separate streak RPC                         | Dedicated SQL SECURITY DEFINER RPC for atomic streak logic.                            |          |
| You decide                                  | Let Claude pick.                                                                       |          |

**User's choice:** Inside interview-prep-analyze

***

## Claude's Discretion

* Exact DB column definitions for interview\_quizzes, interview\_quiz\_answers, interview\_streaks
* RLS policy design for new tables
* Prompt module organization (shared vs. separate)
* Flashcard output JSON shape
* Streak component architecture (standalone vs. embedded)
* Animation and visual design following design system

## Deferred Ideas

* Resume-quiz feature (return to incomplete quiz)
* Quiz history/review page
* Flashcard spaced repetition
* Voice-style interview mode
* LinkedIn input for interview prep

