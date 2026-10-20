# Phase 19: interview-prep-flashcards-and-quiz - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing Interview Prep backend with a tier-aware two-function system, ship three new database tables, and deliver the complete frontend experience:

1. **`interview-prep-analyze`** **edge function** (BACK-06, IPC-02, IPC-03, IPC-08) — Pro: generates 3 read-only STAR flashcards from the user's most recent resume + pasted JD. Elite: generates 5–7 quiz questions from the same inputs. Tier-conditional output, Merit deduction (8 Pro / 5 Elite), server-side resume auto-fetch.
2. **`interview-prep-evaluate`** **edge function** (BACK-07, IPC-04, IPC-09) — Elite only: receives all quiz answers in a single batch, scores each against STAR framework, returns per-answer scoring + suggestions + overall readiness score. No additional Merit charge (quiz generation already charged 5).
3. **Database schema** (IPC-07) — `interview_quizzes`, `interview_quiz_answers`, `interview_streaks` tables with RLS, foreign keys, and constraints.
4. **Streak system** (IPC-05) — Rolling 24h cold / 48h expire from `last_quiz_at`. Streak increments on first quiz after midnight UTC. Checked and updated inside `interview-prep-analyze`.
5. **Daily cap** (IPC-06) — Max 3 quizzes per UTC day, server-side enforcement inside `interview-prep-analyze`.
6. **Full frontend** (UX-09, UX-10) — Pro flashcard cards, Elite quiz card UI with 500-char textarea + live counter, post-quiz STAR results screen, streak display with flame/cold/expired states, daily counter.
7. **Legacy handling** — `interview-prep-coach` kept behind `MERIT_SYSTEM_ENABLED=false` as legacy fallback. New functions are the Merit path.

Closes: IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, IPC-06, IPC-07, IPC-08, IPC-09, IPC-10, BACK-06, BACK-07, UX-09, UX-10.

**Out of scope for this phase:**

* Tier gating for any other feature — Phases 15–18 handle resume, linkedin, career, recruiting lens.
* Merit balance badge, cost previews, low/zero states — Phase 20 (UX-01..04).
* `/pricing` page — Phase 20 (UX-08).
* Merit Shop — Phase 20 (UX-05..07).
* Modifying Phase 14's loader, tier-config, or LockedSection primitives — consumed, not modified.
* Modifying Phase 13's `withMerits` gateway — consumed, not modified.
* Integration tests across all flows — Phase 21.

</domain>

<decisions>
## Implementation Decisions

### Resume Input Source

* **D-01:** The edge function **auto-fetches the user's most recent analyzed resume** from the `resumes` table, server-side, using the service-role Supabase client. No resume text in the request body — just JD text + optional job title/company. Matches the Recruiting Lens auto-detect pattern (RCL-06 / Phase 18). More secure (no client-supplied resume text), simpler frontend payload.
* **D-02:** If the user has **no resume on file**, the edge function returns HTTP 400 with a clear error message like "Upload and analyze a resume first to generate interview prep." No Merit deduction occurs. This matches the existing upload-first flow for Resume Analysis.

### Quiz Submission Architecture

* **D-03:** The Elite quiz uses **batch submission**. The frontend displays questions one at a time locally (state management), collects all answers in component state, then sends all answers in a single request to `interview-prep-evaluate`. One AI evaluation call, one 5-Merit deduction at quiz generation time (via `interview-prep-analyze`), zero additional Merit charge on `interview-prep-evaluate`. Matches IPC-04's "AI scores all answers" language.
* **D-04:** Quiz questions are **persisted to the database on generation**. `interview-prep-analyze` writes the quiz row + questions to `interview_quizzes` immediately on generation, returning a `quiz_id`. If the user closes the tab mid-quiz, questions are saved. `interview-prep-evaluate` receives the `quiz_id` + answers, updates the existing quiz row with scores. Enables potential "resume quiz" feature later.
* **D-05:** `interview-prep-evaluate` receives `{ quiz_id, answers: [{ question_id, answer_text }] }`. It reads the original questions from `interview_quizzes`/`interview_quiz_answers`, sends all Q+A pairs to the AI for STAR scoring, writes scores back, and returns the full results. The quiz must belong to the authenticated user (ownership check).

### Legacy Function Handling

* **D-06:** `interview-prep-coach` is **kept deployed behind** **`MERIT_SYSTEM_ENABLED=false`** as the legacy fallback. The existing Phase 13 branch (lines 49–127 of `interview-prep-coach/index.ts`) stays intact. When `MERIT_SYSTEM_ENABLED=true`, the frontend routes to the new `interview-prep-analyze` / `interview-prep-evaluate` functions instead. `interview-prep-coach` is removed in Phase 21 cutover. Matches Phase 13 D-06 pattern.
* **D-07:** The frontend's `InterviewPrep.tsx` is **rewritten** to call the new edge functions. The existing v1.0 page (which had a complex multi-option UI with interview types, categories, difficulty, duration, format) is replaced with the spec's simpler flow: paste JD + optional title/company → generate flashcards (Pro) or quiz (Elite). `ProFeatureGate` wraps the page for Free users (IPC-01).

### Frontend Scope (Full in Phase 19)

* **D-08:** Phase 19 ships the **complete Interview Prep frontend experience**, pulling UX-09 and UX-10 from Phase 20's roadmap. This includes:
  * Pro: read-only STAR flashcard cards (question + STAR-framework answer)
  * Elite: quiz card interface with one-question-at-a-time flow, 500-char textarea with live character counter, submit button advancing to next question
  * Elite results screen: per-question STAR breakdown + score + improvement suggestions + overall readiness score
  * Streak display: flame icon + day count, dimmed flame at 24h cold, broken streak with "Start new streak" CTA at 48h, daily quiz counter "1/3 used today"
* **D-09:** Phase 20 does **not** need to touch Interview Prep. The feature ships complete in Phase 19.

### Streak & Daily Cap Mechanics

* **D-10:** Streak timing uses **rolling hours from** **`last_quiz_at`** combined with UTC day boundaries:
  * Streak goes cold (warning) 24h after `last_quiz_at` timestamp.
  * Streak expires (resets to 0) 48h after `last_quiz_at` timestamp.
  * "First quiz of a day" means first quiz after midnight UTC — this is what increments the streak counter.
  * Daily cap (3/day) resets at midnight UTC.
  * No user timezone tracking.
* **D-11:** Streak and daily cap enforcement lives **inside** **`interview-prep-analyze`**. The edge function checks the `interview_streaks` table and counts today's quizzes before generating. Streak update happens after successful quiz/flashcard generation. Daily cap is a `COUNT(*)` query filtered to `created_at >= today_midnight_utc`. No separate streak RPC.
* **D-12:** Streak applies to **Elite quiz only** (not Pro flashcards). Pro flashcard generation does not increment the streak or count toward the daily cap, since the spec (IPC-05) ties streaks to "quiz" activity specifically.

### Tier-Conditional Output

* **D-13:** `interview-prep-analyze` is a **single edge function with tier-conditional behavior**:
  * Pro: returns 3 STAR flashcards (read-only), each with a behavioral question + full STAR-framework answer specific to the user's resume + target JD. Deducts 8 Merits.
  * Elite: returns 5–7 quiz questions (no answers — user must answer them). Deducts 5 Merits.
  * Free: blocked by `ProFeatureGate` on the frontend; if somehow called, returns 403 "Interview Prep requires Pro or Elite."
* **D-14:** `interview-prep-evaluate` is **Elite-only**. If a Pro user somehow calls it, return 403. No Merit deduction on evaluate — the 5-Merit charge was at generation time.

### Claude's Discretion

* Exact column definitions for `interview_quizzes`, `interview_quiz_answers`, `interview_streaks` — researcher/planner derives from the spec and decisions above.
* RLS policy design for the three new tables — follow the service-role-only write / user-read-own pattern from Phase 10.
* Whether `interview-prep-analyze` and `interview-prep-evaluate` share a `_shared/interview-prep-prompts.ts` or each have their own prompt module — planner decides based on prompt complexity.
* Exact flashcard output JSON shape — planner derives from IPC-02's "question + STAR-framework answer" spec.
* Whether the streak display is a standalone component or embedded in the InterviewPrep page — planner decides based on Phase 20 dashboard integration needs.
* Animation and visual design of flashcard/quiz cards — follow existing "Institutional Intelligence" design system patterns.

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

* `APIcontextdocuments/STRIVO_GSD_Milestone_Merit_System.docx` §4.5 (Interview Prep tier output maps — Pro flashcards, Elite quiz, streak, daily cap), §7.6 (Interview Prep Elite UI — quiz card interface, streak display), §8.1 (new edge functions interview-prep-analyze, interview-prep-evaluate), §8.4 (Quiz timeout 80,000ms), §11.3 (TEST-09/10 tier validation)
* `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — auto-prepended for Pro/Elite via Phase 14 loader

### Requirements

* `.planning/REQUIREMENTS.md` — IPC-01..10, BACK-06, BACK-07, UX-09, UX-10 (the 14 REQ-IDs Phase 19 closes)
* `.planning/ROADMAP.md` §"Phase 19: interview-prep-flashcards-and-quiz" — 7 Success Criteria that VERIFICATION.md must prove TRUE

### Prior Phase Context (MUST read)

* `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 (loader is the only prompt import point), D-03 (auto-prepend GLOBAL\_AI\_PRINCIPLES), D-11..D-13 (tier-config.ts with Quiz 80s timeout, `getModel`/`getTimeout`)
* `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 (`withMerits` in merit-gateway.ts), D-02 (refund only on Anthropic upstream failure), D-05/D-06 (MERIT\_SYSTEM\_ENABLED flag branching)
* `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — D-01..D-04 (tier resolved server-side from subscriptions table, missing → default free)

### Existing Code to Modify or Reuse

* `supabase/functions/interview-prep-coach/index.ts` — existing v1.0 function with Phase 13 Merit wiring. Stays as legacy fallback (D-06). Reference for patterns but NOT the basis for new functions.
* `supabase/functions/interview-prep-coach/validation.ts` — existing question validation utility. May be reusable or adapted for the new output shapes.
* `src/pages/InterviewPrep.tsx` — existing v1.0 frontend page. Will be rewritten (D-07) to call new edge functions with the simpler input flow.
* `src/pages/InterviewPrepCoach.tsx` — additional v1.0 page. Check if still used in routing.
* `supabase/functions/_shared/tier-config.ts` (Phase 14) — Quiz timeout 80,000ms already defined. Import `getTimeout(tier, 'quiz')`.
* `supabase/functions/_shared/tier-prompts.ts` (Phase 14) — Register interview prep prompts via `loadPromptVariant`.
* `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — Import `withMerits`, `MERIT_SYSTEM_ENABLED`, `MeritRefundable`.
* `supabase/functions/_shared/anthropic.ts` — `invokeAnthropicText` for AI calls.
* `src/components/ProFeatureGate.tsx` — Wraps the page for Free users (IPC-01).

### Design System

* `CLAUDE.md` § Technology Stack — Radix UI, Tailwind CSS, shadcn/ui, Framer Motion, HSL CSS variables, semantic tokens. Quiz cards, flashcards, and streak display must follow "Institutional Intelligence" design system.

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* **`interview-prep-coach/index.ts`** — patterns for JD input handling, AI invocation, JSON repair, validation retry. Phase 19 functions follow similar structure but with different prompts and output shapes.
* **`ProFeatureGate.tsx`** (305 lines) — wraps the page for Free users. Directly usable for IPC-01.
* **`_shared/merit-gateway.ts`** — `withMerits` wrapper. Phase 19 uses it identically to Phase 15's pattern.
* **`_shared/tier-config.ts`** — `getTimeout(tier, 'quiz')` returns 80,000ms. `getModel(tier)` returns Haiku for Free (not applicable since Free is gated), appropriate model for Pro/Elite.
* **`_shared/tier-prompts.ts`** — `loadPromptVariant` registry. Phase 19 registers `'interview_prep'` as a new feature key.
* **`_shared/json-repair.ts`** — `repairTruncatedJSON` for handling truncated AI responses.
* **`_shared/auth.ts`** — `requireInternalOrUserAuth` for authentication.
* **`_shared/rate-limiter.ts`** — rate limit checking.
* **`UniversalAnalyzing.tsx`** — loading state component, reusable for quiz generation loading.

### Established Patterns

* **Service-role Supabase client for server-side reads** — Phase 10/15 pattern. Used for resume auto-fetch and subscriptions lookup.
* **Merit gateway wrapping** — `withMerits(ctx, feature, async () => { ... })` pattern from Phase 13.
* **MERIT\_SYSTEM\_ENABLED flag branching** — legacy path stays below the Merit branch, as in Phase 13 D-06.
* **Validation with retry** — existing `interview-prep-coach` validates AI output and retries once on failure. Same pattern applies.
* **Structured logging** — `createLogger('function-name', reqId)` with bracket-prefixed messages.

### Integration Points

* **Phase 20** was originally going to handle UX-09 and UX-10 but those are now pulled into Phase 19 (D-08/D-09). Phase 20 does not touch Interview Prep.
* **Phase 21** removes `interview-prep-coach` during cutover and tests the E2E interview prep flow.
* **Dashboard** — streak display needs to appear on the user dashboard. Phase 19 ships the streak component; Phase 20 may integrate it into the dashboard layout if not already done.

\</code\_context>

<specifics>
## Specific Ideas

* The existing `InterviewPrep.tsx` has an overly complex input form (interview type, categories, difficulty, duration, format selectors) that the spec doesn't call for. The rewrite simplifies to: JD textarea + optional job title/company → Generate. The resume is auto-fetched server-side.
* `interview-prep-analyze` should use `loadPromptVariant('interview_prep', tier, params)` where params include both `resumeText` (auto-fetched) and `jobDescription`. The prompt variant for Pro generates 3 flashcards; the variant for Elite generates 5–7 questions without answers.
* The batch evaluation pattern (`interview-prep-evaluate` receives quiz\_id + all answers) means exactly ONE AI call for scoring, keeping Elite quiz cost at 5 Merits total (generation) + 0 (evaluation). The evaluate function's AI cost is absorbed — this is a product decision to keep the quiz accessible.
* Streak display should work even when the user is on the InterviewPrep page (not just dashboard), showing their current streak status and daily usage counter above the quiz input area.
* The "1/3 used today" counter and streak flame are the gamification hook — they should be visually prominent, not hidden in a corner.

</specifics>

<deferred>
## Deferred Ideas

* **"Resume quiz" feature** — D-04 enables persisting quiz questions on generation, which would allow users to return to an incomplete quiz later. The DB schema supports it but the frontend flow (resume mid-quiz) is not in scope.
* **Quiz history/review** — showing past quiz results on the dashboard or a dedicated history page. The data will be in `interview_quizzes` but the review UI is not specified.
* **Flashcard spaced repetition** — using streak data to resurface old flashcards for review. Future feature, not in spec.
* **Voice-style interview mode** — the v1.0 UI had a "Voice-style" format option. Not in the v2.0 spec.
* **LinkedIn input for interview prep** — IPC-02 explicitly says "NO LinkedIn input." Deferred or out of scope.
* **Running interview prep tier validation in CI** — follows Phase 14 D-15 pattern (env-gated, manual only).

</deferred>

***

*Phase: 19-interview-prep-flashcards-and-quiz*
*Context gathered: 2026-04-16*
