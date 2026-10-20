# Phase 23: interview-prep-runtime-overhaul - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end rebuild of Interview Prep against `APIcontextdocuments/interviewprep/STRIVO_Interview_Prep_Runtime.pdf`. Delivers: tier-aware `interview-prep-analyze` returning the Runtime §10 nine-section payload (Pro flashcards / Elite 5–7 quiz questions / Pro monthly Elite-taste quiz), `interview-prep-evaluate` (Elite-only STAR scoring — architecture from Phase 19 carries forward), server-side resume auto-fetch, expanded 9-field intake, Duolingo-style streak + 3/day cap + 1 Pro-monthly Elite-taste quiz, 500-char answer limit, `claude-haiku-4-5-20251001` with 5K/10K token budgets, and the full frontend rewrite of `src/pages/InterviewPrep.tsx` (currently a UI-only mock).

Scope anchored by ROADMAP Phase 23 Success Criteria 1–14. This discussion clarified HOW to implement; WHAT is locked by Runtime doc + 14 SC + Phase 19 D-01..D-14.

</domain>

<decisions>
## Implementation Decisions

### Schema Migration

- **D-01:** Amend the existing Phase 19 migration `supabase/migrations/20260418000000_interview_prep_tables.sql` in place (no new timestamped migration). Adds the Runtime §3/§8/§9 columns and expands the `interview_quizzes.tier` CHECK. User confirmed this path is safe for current deployment state; planner/executor must verify no environments have data that a drop/recreate would lose before applying.
- **D-02:** Expand `interview_quizzes.tier` CHECK to `('pro','elite','elite_taste')`. Pro flashcards → `'pro'`, Elite quizzes → `'elite'`, Pro monthly Elite-style taste quiz → `'elite_taste'`. Pro-monthly-quota query: `COUNT(*) WHERE user_id=$1 AND tier='elite_taste' AND created_at >= first_of_calendar_month_utc`.
- **D-03:** Add to `interview_quizzes`: `interview_type text NOT NULL` (CHECK behavioral/technical/mixed_panel/executive), `question_categories text[] NOT NULL` (CHECK array_length >= 1), `difficulty text NOT NULL` (CHECK entry/mid/senior/staff_plus), `duration smallint NOT NULL` (CHECK 15/30/45/60), `format text NOT NULL` (CHECK written/voice_style/mixed), `background_context text NULLABLE` (CHECK length <= 1500), `role_title text NULLABLE`, `company text NULLABLE`, `readiness_score smallint NULLABLE CHECK (readiness_score BETWEEN 0 AND 100)`.
- **D-04:** Add to `interview_streaks`: `longest_streak int NOT NULL DEFAULT 0`, `quizzes_today smallint NOT NULL DEFAULT 0`. `quizzes_today` is recomputed on write based on `COUNT(*) FROM interview_quizzes WHERE user_id = $1 AND tier IN ('elite') AND created_at >= today_midnight_utc` (elite_taste does NOT count toward daily cap — it has its own monthly quota).
- **D-05:** `question_categories` is Postgres `text[]` (native array), not jsonb or comma-joined. Simpler queries, readable in SQL editor, fixed controlled vocabulary.

### 9-Section Output Generation

- **D-06:** `interview-prep-analyze` makes a **single Anthropic call** per session that returns all 9 Runtime §10 sections in one JSON response. One refund path (Phase 13 D-02 semantics). Pro budget 5,000 tokens, Elite budget 10,000 tokens.
- **D-07:** Elite quiz generation returns **questions only** in the Practice Questions section of the 9-section payload; per-answer STAR scoring stays in `interview-prep-evaluate` as a separate 10K-budget call after batch submit. Preserves Phase 19 D-03 (batch submit) and D-05 (evaluate input shape). No additional Merits charged on evaluate (Phase 19 D-14).
- **D-08:** Pro flashcards — the Practice Questions section contains 3 flashcard objects each with full Situation / Task / Action / Result + coach note (<20 words). Target 180–260 words per STAR block per Runtime §6.
- **D-09:** JSON truncation risk is handled by **reusing `supabase/functions/_shared/json-repair.ts`** (same utility proven in resume-analysis streaming) plus a strict Zod schema that enumerates every required §10 key. Flow: parse → if fail, `repairTruncatedJSON` → if repair fails or validator reports missing/empty required sections, return **502 + Merit refund** (Phase 13 D-02). No graceful partial render.
- **D-10:** Prompts are organized as a **shared base + tier branches** in `supabase/functions/_shared/interview-prep-prompts.ts`. One shared system prompt defines the 9 sections, Runtime §11 AI behavior principles, and the honest-scoring rules. Tier-specific user-prompt builders handle Pro / Elite / Elite-taste divergence. All three are registered via Phase 14 `loadPromptVariant` as `interview-prep-analyze-pro`, `interview-prep-analyze-elite`, `interview-prep-analyze-elite-taste` so Global AI Principles (Phase 14 D-03) auto-prepend.
- **D-11:** "No silent drops" (Runtime §3) enforced by **prompt-level instruction + post-generation server-side validator**. Prompt explicitly lists which optional fields (`role_title`, `company`, `background_context`) were filled and instructs the model to reference each at least once. After JSON parse + repair, validator does a case-insensitive substring scan across `coach_verdict`, `focus_areas`, `coaching_advice` for each filled optional field. Miss → one retry with a stricter prompt; second miss → log warn + ship (planner to refine retry policy, but shipping beats refunding a nearly-good payload).

### Intake Form UX

- **D-12:** Single-page form with grouped sections: "Role" (role_title, company), "What you're prepping for" (job_description, background_context), "Session shape" (interview_type, question_categories, difficulty, duration, format). One Generate CTA at the bottom. Matches Strivo's Resume Analysis / Career Compass one-page patterns.
- **D-13:** Required fields that gate the Generate CTA client-side: `job_description` (>= 40 chars), `interview_type`, `difficulty`, `duration`, `format`, `question_categories` (>= 1 selected). `role_title`, `company`, `background_context` remain optional (first-class when filled per §3).
- **D-14:** Required enum fields ship with sensible defaults pre-selected: `interview_type='behavioral'`, `difficulty='mid'`, `duration=30`, `format='written'`. User can hit Generate on a one-click path after pasting the JD. Selected values always go to the server — "no silent drops" is preserved because defaults are explicit selections, not nulls.
- **D-15:** 500-char per-answer limit (SC-6, Runtime §7) uses a **live counter + color shift + server reject**. Textarea shows `{count}/500`: muted 0–499, accent at exactly 500, destructive above 500. Submit disabled when any answer > 500. Server also rejects > 500 with HTTP 400. Copy format matches Runtime §13.4 exactly.

### Frontend Rewrite

- **D-16:** `src/pages/InterviewPrep.tsx` is **fully rewritten** (not surgically wired). The existing 1028-line file is a UI-only mock with `MOCK_RESULT` — the backend shape is fundamentally different so no renderer is salvageable. Rewrite preserves the Institutional Intelligence visual design tokens, card shells, and typography, and rebuilds around real hooks (`useAuth`, `useAiCredits`, `useTierAccess`, `ProFeatureGate`) + real edge-function calls to `interview-prep-analyze` / `interview-prep-evaluate`.
- **D-17:** Type definitions for the 9-section payload live in `src/types/interviewPrep.ts` and are **shared** between frontend and edge functions (Deno imports via relative path from `supabase/functions/_shared/` barrel re-export; frontend imports via `@/types/interviewPrep`). A colocated Zod schema drives server-side runtime validation AND frontend typing — single source of truth for the Runtime §10 contract.
- **D-18:** Page state is modeled with `useReducer` and an explicit status union: `'loading' | 'free-gate' | 'input-form' | 'generating' | 'flashcard-results' | 'quiz-active' | 'quiz-submitting' | 'quiz-results' | 'error'`. Transitions are explicit `dispatch` calls — matches Runtime §13 state diagram 1:1 and eliminates impossible-state combinations.
- **D-19:** `<StreakDisplay>` is a **standalone component** at `src/components/interviewPrep/StreakDisplay.tsx` with props `{ lastQuizAt, currentStreak, longestStreak, quizzesToday, dailyCap }`. InterviewPrep page renders it above the Generate CTA; the dashboard embeds it as a card (supports Phase 20 D-08 dashboard integration). Visual states per Runtime §8: active / cold (24h) / expired (48h) / first-time / cap-reached. Copy matches §13.4 exactly.

### Claude's Discretion (planner decides)

- Exact retry/refund policy when the post-generation "no silent drops" validator fails on the retry attempt (D-11). Current guidance: ship + warn rather than refund, but planner may promote to 502 + refund if data shows high miss rate.
- Whether `elite_taste` quizzes consume any other quota (they already don't count toward Elite daily cap — see D-04). Planner confirms with Runtime §2 wording.
- Exact Zod schema field names for each of the 9 Runtime §10 sections (snake_case vs camelCase).
- Temperature setting for the Anthropic calls (Runtime §11 honesty suggests low temp; planner picks concrete value).
- RLS policy adjustments for the new columns — follow Phase 19's service-role-only-write / user-read-own pattern.
- Partial indexes (e.g., `(user_id, created_at) WHERE tier='elite'` for daily-cap count, `(user_id, created_at) WHERE tier='elite_taste'` for monthly quota) — planner decides based on expected query volume.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (Source of Truth)

- `APIcontextdocuments/interviewprep/STRIVO_Interview_Prep_Runtime.pdf` — §2 tiers, §3 intake, §4 inputs, §5 resume grounding, §6 Pro experience, §7 Elite experience, §7.2 duration→question count, §8 streaks + daily limits, §9 readiness score bands, §10 nine-section output payload, §11 AI behavior principles, §12 technical runtime, §12.5 error states, §13 UI contract + state machine, §13.4 exact copy strings, §14 quality bar, §15 out-of-scope.
- `APIcontextdocuments/globalAIprinciples/STRIVO_Global_AI_Principles.docx` — auto-prepended for Pro/Elite via Phase 14 loader (D-10).

### Requirements

- `.planning/ROADMAP.md` §"Phase 23: interview-prep-runtime-overhaul" — 14 Success Criteria the VERIFICATION.md must prove TRUE.
- `.planning/REQUIREMENTS.md` — REQ-IDs mapped to Phase 23.

### Prior Phase Context (MUST read — decisions carry forward)

- `.planning/phases/19-interview-prep-flashcards-and-quiz/19-CONTEXT.md` — **D-01..D-14 carry forward**: auto-fetch resume + 400 no-resume (D-01/D-02), batch submit + quiz_id (D-03/D-04/D-05), question_order int joins never UUID (implicit across evaluate), MERIT_SYSTEM_ENABLED branching (D-06), `interview-prep-coach` removed in Phase 21 cutover, streak + daily-cap inside `interview-prep-analyze` (D-11), streak applies to Elite quiz only (D-12), single edge function with tier-conditional behavior (D-13), no additional Merits on evaluate (D-14).
- `.planning/phases/14-tier-prompts-and-locked-section-primitive/14-CONTEXT.md` — D-01/D-02 loader is the only prompt import point, D-03 auto-prepend GLOBAL_AI_PRINCIPLES, D-11..D-13 `tier-config.ts` with Quiz 80s timeout, `getModel`/`getTimeout`.
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — D-01 `withMerits` in merit-gateway.ts, D-02 refund only on Anthropic 5xx, D-05/D-06 MERIT_SYSTEM_ENABLED flag branching.
- `.planning/phases/15-resume-analysis-gating/15-CONTEXT.md` — tier resolved server-side from subscriptions table, missing → default free.

### Existing Code to Modify or Reuse

- `supabase/migrations/20260418000000_interview_prep_tables.sql` — **Amend in place** per D-01: add 9 intake/score columns, expand `tier` CHECK to include `'elite_taste'`, add `longest_streak` + `quizzes_today` to `interview_streaks`.
- `supabase/functions/interview-prep-analyze/index.ts` (539 lines) — currently returns only `flashcards[]` or `questions[]`; must be rebuilt to return Runtime §10 nine-section payload (D-06..D-11).
- `supabase/functions/interview-prep-evaluate/index.ts` (329 lines) — Elite-only, preserves Phase 19 D-05 shape; `parseInt(scoreEntry.question_id, 10) → question_order` integer join stays (SC-7).
- `supabase/functions/_shared/interview-prep-prompts.ts` (204 lines) — rewritten as shared base + 3 tier branches registered via `loadPromptVariant` (D-10).
- `supabase/functions/_shared/json-repair.ts` — reused as-is for §10 truncation recovery (D-09).
- `supabase/functions/_shared/tier-config.ts` (Phase 14) — Quiz 80s timeout + model already defined; import `getTimeout(tier, 'quiz')`.
- `supabase/functions/_shared/tier-prompts.ts` (Phase 14) — register new variants.
- `supabase/functions/_shared/merit-gateway.ts` (Phase 13) — `withMerits`, `MERIT_SYSTEM_ENABLED`, `MeritRefundable`; refund only on Anthropic 5xx (D-09).
- `supabase/functions/_shared/anthropic.ts` — `invokeAnthropicText` for AI calls.
- `src/pages/InterviewPrep.tsx` (1028 lines, UI-only mock) — **full rewrite** per D-16. Mock scaffolding deleted.
- `src/components/ProFeatureGate.tsx` — wraps Interview Prep for Free users (SC-1).
- `src/contexts/AiCreditsContext.tsx` — Merit balance + depletion handling.

### New Files (to be created)

- `src/types/interviewPrep.ts` — shared 9-section TypeScript types + Zod schema (D-17).
- `src/components/interviewPrep/StreakDisplay.tsx` — standalone streak display (D-19).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `supabase/functions/_shared/json-repair.ts` — proven truncation repair utility from resume-analysis; wrap the §10 parse in it (D-09).
- `supabase/functions/_shared/merit-gateway.ts` `withMerits` — Phase 13 wrapper handles deduct + refund-on-502 automatically; reuse unchanged.
- `supabase/functions/_shared/tier-prompts.ts` `loadPromptVariant` — Phase 14 loader is the only prompt import point; registers all three new variants (pro / elite / elite_taste).
- `supabase/functions/_shared/tier-config.ts` `getTimeout(tier, 'quiz')` — already defines 80,000 ms Quiz timeout; no new config needed.
- `src/components/ProFeatureGate.tsx` — wraps the page for Free users (SC-1).
- `src/contexts/AiCreditsContext.tsx` + `useAiCredits` hook — Merit balance, depletion, upgrade modal triggering.
- Institutional Intelligence design tokens + card shells in existing InterviewPrep.tsx — salvaged as visual references during rewrite (D-16).

### Established Patterns

- Server-side resume auto-fetch from `resumes` table via service-role client (Phase 19 D-01, also Recruiting Lens RCL-06) — Interview Prep does the same; frontend never sends resume text.
- Batch submit + `quiz_id` (Phase 19 D-03/D-04/D-05) — Elite quiz persists on generation, evaluate receives `{ quiz_id, answers[] }` + ownership check.
- `question_order` integer join (Phase 19 SC-7) — never UUID. `parseInt(scoreEntry.question_id, 10) → question_order`.
- Merit refund only on Anthropic 5xx (Phase 13 D-02) — preserved for every failure mode; non-502 errors (400/403/429) deduct nothing.
- Phase 14 `loadPromptVariant` registration — every new prompt must be registered here to get `GLOBAL_AI_PRINCIPLES` auto-prepend.
- Colocated TS + Zod types for edge-function payloads (e.g., `analyze-career` shared types) — D-17 follows this pattern.
- Live character counter color states (muted → accent → destructive) — Runtime §13.4 is explicit; no existing implementation to reuse.

### Integration Points

- `interview-prep-analyze` edge function HTTP endpoint — called by the rewritten `InterviewPrep.tsx` `'generating'` state.
- `interview-prep-evaluate` edge function HTTP endpoint — called from `'quiz-submitting'` state with `{ quiz_id, answers[] }`.
- Dashboard widgets (Phase 20) — embed `<StreakDisplay>` standalone component.
- `ProFeatureGate` route wrapper — gates the whole page for Free users.
- Phase 20 Merit UX — Balance badge, depletion modal, and upgrade CTA already in place; Interview Prep page consumes them via `useAiCredits`.

</code_context>

<specifics>
## Specific Ideas

- Pro monthly Elite-taste quiz is a distinct `tier='elite_taste'` row in `interview_quizzes` — the third CHECK value (D-02). This lets a single `COUNT` query answer both "was the Pro user's monthly taste quiz used?" (WHERE tier='elite_taste' AND created_at >= first_of_month_utc) and "how many Elite quizzes today?" (WHERE tier='elite' AND created_at >= midnight_utc) without a separate boolean.
- Intake defaults (D-14): interview_type='behavioral', difficulty='mid', duration=30, format='written'. One-click path from paste-JD → Generate is a core UX value.
- "No silent drops" validator (D-11) is a case-insensitive substring/lemma scan — not a semantic check. Fast, deterministic, pairs well with explicit prompt instruction.
- Character counter color copy per Runtime §13.4: muted below 500, accent at exactly 500, destructive above 500 (D-15). Counter format is `{count}/500`.

</specifics>

<deferred>
## Deferred Ideas

- Voice-audio capture for quiz answers — Runtime §15 v1 out-of-scope.
- Dedicated quiz history page — Runtime §15 v1 out-of-scope; current flow returns only the most recent result.
- Flashcard spaced repetition — Runtime §15 v1 out-of-scope.
- Resume-incomplete quiz UI — Runtime §15 v1 out-of-scope; current flow is 400 no-resume + "Upload first" message.
- LinkedIn profile input — Runtime §15 v1 out-of-scope; resume is the only grounding source.
- Auto-save draft of intake form on field change — not required by Runtime; can revisit after v1.
- Word counter (vs character counter) on JD textarea — not required by Runtime §13.4.
- "Clear form" affordance on the intake page — not required by Runtime; ships without it.
- Progressive-disclosure / multi-step stepper variant of the intake form — rejected in favor of single-page grouped (D-12).
- Surgical wiring of the existing 1028-line `InterviewPrep.tsx` — rejected in favor of full rewrite (D-16) because the mock's data shape is too far from Runtime §10.

</deferred>

---

*Phase: 23-interview-prep-runtime-overhaul*
*Context gathered: 2026-04-20*
