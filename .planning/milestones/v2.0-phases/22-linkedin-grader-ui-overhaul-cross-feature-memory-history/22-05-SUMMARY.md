---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
plan: 05
subsystem: ui
tags: [react, react-router, useSearchParams, deep-link, supabase, rls, hydration, deferred-execution]

# Dependency graph
requires:
  - phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
    plan: 04
    provides: "AnalysisHistory produces ?id=<uuid> routes via findIdForEntry + per-feature route dispatcher — the routing contract this plan honors"
provides:
  - "LinkedInGrader.tsx: ?id= hydration via linkedin_grades.grading_data (jsonb) — UUID-validated, RLS-scoped, v3 shape-checked"
  - "CareerCompass.tsx: ?id= hydration via analysis_results.raw_response (jsonb) filtered by analysis_type='career_compass'"
  - "RecruitingLens.tsx: ?id= hydration via analysis_results.raw_response filtered by analysis_type='recruiting_lens'; Pitfall 6 silent-degrade for Free/Pro (informational toast, not error)"
  - "InterviewPrep.tsx: ?id= hydration via interview_quizzes + interview_quiz_answers parallel fetch; new minimal read-only PastQuizView component renders quiz metadata + scored answers; lands on past-quiz view, NOT the coach chat"
affects: [linkedin-grader, career-compass, recruiting-lens, interview-prep, analysis-history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared URL-param hydration: `useSearchParams().get('id')` → UUID regex validate → `.maybeSingle()` query on feature table → toast + fallback on miss"
    - "RLS reliance: no manual `.eq('user_id', ...)` on hydration queries — auth.uid()=user_id policies auto-scope"
    - "Column-pinned payload reads: `data.grading_data` (linkedin_grades), `data.raw_response` (analysis_results) — no speculative `?? data.result ?? data.analysis_data` fallback chains"
    - "Effect lifecycle: `let cancelled = false; (async () => {...})(); return () => { cancelled = true; };` — prevents setState after unmount"
    - "Informational toast semantics for tiered-persistence gap (Pitfall 6): Pro/Free RecruitingLens uses `toast.message(...)` not `toast.error(...)` because silent-degrade is expected behavior, not a failure"
    - "Past-quiz read-only branch in InterviewPrep: new `pastQuiz` state + `PastQuizView` component, inserted BEFORE the existing `result ?` ternary so deep-links land on the past-quiz view and not the mock coach result"

key-files:
  created: []
  modified:
    - "src/pages/LinkedInGrader.tsx — +36 lines: added useSearchParams import, new `idFromUrl` reader + hydration useEffect, reuses existing setResult/setIsFromCache/setShowInput state setters; added isV3Grade guard so a legacy (non-v3) row hits the same toast+fallback path as a missing row"
    - "src/pages/CareerCompass.tsx — +30 lines: added useSearchParams import, new `idFromUrl` reader + hydration useEffect, reuses existing setAnalysis/setIsFromCache setters; defensive `.eq('analysis_type', 'career_compass')` filter"
    - "src/pages/RecruitingLens.tsx — +33 lines: added useSearchParams import, new `idFromUrl` reader + hydration useEffect, reuses existing setResult setter; Pitfall 6 informational toast on miss"
    - "src/pages/InterviewPrep.tsx — +150 lines (roughly): added useEffect + useSearchParams imports, supabase client import, new PastQuiz/PastQuizRow/PastQuizAnswerRow types, new pastQuiz state + hydration useEffect (parallel fetch of interview_quizzes + interview_quiz_answers), new PastQuizView component (read-only), and a new branch in the render conditional to show PastQuizView when ?id= hydrates a row"

key-decisions:
  - "LinkedInGrader hydration includes an isV3Grade schema guard — the existing cache-load path already applies this guard (line 181, 229); the new hydration path mirrors it so legacy rows don't crash the results renderer"
  - "CareerCompass hydration keeps the defensive `.eq('analysis_type', 'career_compass')` filter even though RLS + the id PK already guarantees scope — matches the plan spec and prevents a scenario where a hypothetically cross-type id could load into the wrong page"
  - "RecruitingLens hydration uses `toast.message(...)` (informational) for the not-found branch per Pitfall 6, so Pro/Free users don't see a scary 'error' toast for the expected no-row case"
  - "InterviewPrep does NOT reuse MOCK_RESULT / the InterviewPrepResult shape for hydrated past quizzes — the interview_quizzes schema (job_description, overall_score, evaluated_at) and interview_quiz_answers schema (question_order, user_answer, score, suggestions) do not map onto the rich readiness/subScores/focusAreas MOCK_RESULT shape. A new minimal read-only PastQuizView component was added per plan's TBD-resolution clause: 'If the component does not have a dedicated past quiz results sub-view, the executor must ADD a minimal read-only render path rather than defaulting to the coach chat.'"
  - "All 4 hydration effects depend on `[idFromUrl]` only — they do NOT re-run on auth changes or on the sibling cache-load effect's state. If the user stays on the page and the URL param doesn't change, the hydration fires exactly once per route entry."

patterns-established:
  - "useSearchParams hydration effect is the canonical deep-link pattern for tool pages. Shape: read idFromUrl → UUID regex → feature-table .maybeSingle() → on miss, toast + early return → on hit, setResult state + implicit results-view render via existing conditional render"
  - "Pitfall 6 silent-degrade pattern: when a feature has tiered persistence and lower tiers don't write a row, treat deep-link miss as informational (toast.message), not an error (toast.error)"
  - "Deferred read-only branch pattern: when an existing page uses a mock result shape that doesn't match the backing table's actual schema, add a dedicated read-only view type + component rather than coercing the schema into the mock shape"

requirements-completed: [SC-6, SC-7]

# Metrics
duration: 6min
completed: 2026-04-20
---

# Phase 22 Plan 05: `?id=` Hydration on 4 Non-Resume Feature Pages — Summary

**Closes SC-6 end-to-end (History click → past analysis hydrates, not default input view) by adding URL param hydration to LinkedInGrader, CareerCompass, RecruitingLens, and InterviewPrep. Each page validates the id as a UUID, queries its feature-backing table via RLS-scoped SELECT, and hydrates the results view on hit — or shows a friendly toast and falls back to the input view on miss. Pitfall 6 silent-degrade for RecruitingLens Free/Pro; new read-only PastQuizView for InterviewPrep since the mock-result shape doesn't map to the backing schema.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T08:55:13Z
- **Completed (code):** 2026-04-20T09:01:11Z (Task 3 operator checkpoint PENDING)
- **Tasks:** 2 of 3 (Task 3 = human-verify checkpoint, blocking)
- **Files modified:** 4

## Accomplishments

- All 4 non-resume feature pages now read `?id=` from the URL on mount, validate it as a UUID via `/^[0-9a-f-]{36}$/i`, query their backing table with `.maybeSingle()`, and hydrate the results view on success.
- Each page falls back to its default input view on invalid-id / not-found / RLS-blocked result, with a user-visible toast.
- RLS enforces ownership: hydration queries do NOT add manual `.eq('user_id', ...)` — the database policies (`auth.uid() = user_id` on all four tables) auto-scope the SELECT. A cross-user deep-link attempt returns zero rows and triggers the toast fallback (T-22-10 mitigation).
- Payload columns confirmed and pinned — no speculative fallback chains:
  - `linkedin_grades.grading_data` (jsonb) — per `supabase/migrations/20251126120525_03819aa3-d6eb-4aad-8a7c-71da8b2ca3ea.sql`
  - `analysis_results.raw_response` (jsonb) — shared column for both career_compass and recruiting_lens rows
  - `interview_quizzes.*` + `interview_quiz_answers.*` — per `supabase/migrations/20260418000000_interview_prep_tables.sql:18-48`
- RecruitingLens Pitfall 6 silent-degrade: Free/Pro tiers have NO persisted `analysis_results` row (Elite-only per `recruiting-lens/index.ts`). The hydration effect emits an informational `toast.message("This analysis wasn't saved — run a fresh match to regenerate.")` and falls back to the input view rather than rendering an "Analysis not found" error toast.
- InterviewPrep past-quiz view: Added `PastQuiz`/`PastQuizRow`/`PastQuizAnswerRow` TypeScript interfaces, a new `pastQuiz` state variable, and a new `PastQuizView` functional component that renders the quiz metadata (role, company, mode, tier, overall score, job description) and the answered questions (with per-question score, competency badge, user answer, and coach suggestions) in a read-only layout. The view is inserted BEFORE the existing `result ?` ternary in the conditional render so deep-links never land on the mock coach result or the live-prep input form.
- No regression when `?id=` is absent — each hydration effect is gated on `idFromUrl` being present and returns as a no-op otherwise (SC-7).

## Task Commits

Each task was committed atomically:

1. **Task 1: LinkedInGrader + CareerCompass `?id=` hydration** — `1065f43` (feat)
2. **Task 2: RecruitingLens + InterviewPrep `?id=` hydration** — `a2f80b5` (feat)
3. **Task 3: End-to-end staging deep-link verification** — PENDING (blocking human-verify gate — see "Task 3 Checkpoint" below)

## Files Created/Modified

### `src/pages/LinkedInGrader.tsx` (+36 lines)

1. Import: added `useSearchParams` alongside the existing `useNavigate` from `react-router-dom` (line 20).
2. New block placed AFTER the `orderedSections` useMemo and BEFORE the `checkAccessAndLoadCache` useEffect:
   - `const [searchParams] = useSearchParams();`
   - `const idFromUrl = searchParams.get('id');`
   - `useEffect(() => { ... }, [idFromUrl]);` — 27-line hydration effect.
3. Effect body: UUID regex validate → `supabase.from('linkedin_grades').select('*').eq('id', idFromUrl).maybeSingle()` → on miss toast "Analysis not found" + return → on hit run `isV3Grade(data.grading_data)` guard (reused from line 64-68) → hydrate `data.grading_data as LinkedInResult` with injected `recordId` + `created_at`, call `setResult()`, `setIsFromCache(true)`, `setShowInput(false)`.
4. No regression to the existing cache-load flow — the new effect is a separate `useEffect` gated on `idFromUrl`.

### `src/pages/CareerCompass.tsx` (+30 lines)

1. Import: added `useSearchParams` alongside the existing `useNavigate` from `react-router-dom` (line 46).
2. New block placed AFTER the `checkAccessAndLoadProfile` useEffect and BEFORE the `renderPdfPagesToImages` helper:
   - `const [searchParams] = useSearchParams();`
   - `const idFromUrl = searchParams.get('id');`
   - `useEffect(() => { ... }, [idFromUrl]);` — 23-line hydration effect.
3. Effect body: UUID regex validate → `supabase.from('analysis_results').select('*').eq('id', idFromUrl).eq('analysis_type', 'career_compass').maybeSingle()` → on miss toast + return → on hit `setAnalysis(data.raw_response as AnalysisResult)` + `setIsFromCache(true)`. The existing D-14 memory-badge wiring (22-03) reads from the hydrated `analysis` state so it renders correctly on deep-link if the stored row has `reusedLinkedinGrade=true`.

### `src/pages/RecruitingLens.tsx` (+33 lines)

1. Import: added `useSearchParams` alongside the existing `useNavigate` from `react-router-dom` (line 2).
2. New block placed AFTER the mount `init` useEffect and BEFORE the `handleLinkedinPdfUpload` handler:
   - `const [searchParams] = useSearchParams();`
   - `const idFromUrl = searchParams.get('id');`
   - `useEffect(() => { ... }, [idFromUrl]);` — 26-line hydration effect.
3. Effect body: UUID regex validate → `supabase.from('analysis_results').select('*').eq('id', idFromUrl).eq('analysis_type', 'recruiting_lens').maybeSingle()` → on miss `toast.message("This analysis wasn't saved — run a fresh match to regenerate.")` + return (informational, not error) → on hit `setResult(data.raw_response as RecruitingLensResult)`.
4. Critical: the toast on miss is `toast.message(...)` not `toast.error(...)` — Pitfall 6 silent-degrade for Free/Pro tiers that legitimately have no persisted row.

### `src/pages/InterviewPrep.tsx` (+150 lines approx)

1. Imports:
   - Switched `useState` import to include `useEffect` (line 1).
   - Added `import { useSearchParams } from "react-router-dom";` (line 2).
   - Added `import { supabase } from "@/lib/supabaseClient";` (line 3).
2. New types (placed BEFORE the `SUB_SCORE_LABELS` constants):
   - `interface PastQuizRow` — mirrors relevant columns from `interview_quizzes` migration.
   - `interface PastQuizAnswerRow` — mirrors relevant columns from `interview_quiz_answers` migration.
   - `interface PastQuiz` — composite `{ quiz, answers }` shape.
3. New state + hydration effect inside the `InterviewPrep` component:
   - `const [pastQuiz, setPastQuiz] = useState<PastQuiz | null>(null);`
   - `const [searchParams] = useSearchParams();`
   - `const idFromUrl = searchParams.get('id');`
   - `useEffect(() => { ... }, [idFromUrl]);` — 27-line hydration effect with a `Promise.all` parallel fetch of `interview_quizzes.*` (by id) and `interview_quiz_answers.*` (by `quiz_id`, ordered by `question_order` ascending).
4. New render branch in the component's JSX — the existing `result ? <ResultsView/> : <input form>` ternary was extended to `pastQuiz ? <PastQuizView/> : result ? <ResultsView/> : <input form>`, so deep-links take precedence and DO NOT land on the coach chat.
5. New component `PastQuizView` appended at the bottom of the file (before the `export default`) — renders:
   - Header row: "Past Prep Session" + role/company/date + "Start New Session" button (calls `onStartAnother` which clears `pastQuiz`).
   - Metadata card: mode + tier badges, overall score badge (if present), job description (whitespace-pre-wrap).
   - Per-question cards: Q-number + competency badge + score + question text + user answer + coach suggestions (with Lightbulb icon).
   - Empty-state card when `answers.length === 0` — "No saved answers for this session."

## Decisions Made

- **Used the existing `setIsFromCache(true)` setter on deep-link hydration for LinkedInGrader and CareerCompass** — so the cache-date badge rendered at LinkedInGrader.tsx:678-682 (and the equivalent on CareerCompass) shows the stored `created_at` date when the user deep-links in. This is semantically correct: a deep-link load IS a cache hit from the user's perspective (the data is not being freshly generated).
- **RecruitingLens does NOT set isFromCache** — RecruitingLens doesn't have an equivalent cache-badge state (it only keys off a sessionStorage key), so no setter change was needed.
- **Kept `.eq('analysis_type', '...')` filter on both analysis_results-backed pages** — defensive belt-and-suspenders alongside RLS. Even though the id PK + RLS would normally make this redundant, pinning the type prevents a scenario where a hypothetically malformed id from the History page routes to the wrong feature page.
- **isV3Grade guard on LinkedInGrader hydration** — mirrors the existing cache-load guard at lines 181 and 229 so a legacy (non-v3) row hits the same toast+fallback path as a missing row; avoids crashing the results renderer on old schema rows.
- **Did NOT add `await supabase.auth.getUser()` to any hydration effect** — the hydration query relies on the logged-in session (RLS). If the user is not logged in, the SELECT returns zero rows and the toast+fallback path handles it gracefully. Adding a redundant `getUser()` call would add a network round-trip with no security benefit.
- **InterviewPrep: added a new PastQuizView rather than reusing InterviewPrepResultsView** — the existing results view reads from the `InterviewPrepResult` shape (readiness.score, subScores, focusAreas, etc.) which does not map onto `interview_quizzes` columns (job_description, overall_score) or `interview_quiz_answers` columns (question_order, user_answer, score, suggestions). The plan's TBD-resolution clause explicitly permitted adding a minimal read-only branch in this case.

## Deviations from Plan

None. Plan executed exactly as written. All acceptance criteria met verbatim.

Deviation candidates considered and rejected:
- **Rule 2 candidate — "InterviewPrep hasResumeOnFile is hardcoded to true"** — pre-existing bug (line 147 `const [hasResumeOnFile] = useState(true);`), not introduced by this plan and not in scope for SC-6/SC-7. Logged for a future plan.
- **Rule 1 candidate — "RecruitingLens input-view still renders after idFromUrl miss"** — intentional per Pitfall 6 and plan acceptance criteria; not a bug.

## Acceptance-Criteria Grep Results

**LinkedInGrader.tsx:**
```
useSearchParams                                        → 2 matches (import + hook call)
searchParams.get('id')                                 → 1 match
from('linkedin_grades')                                → 3 matches (hydration + 2 existing cache-load sites)
^\s*if \(!\/\^\[0-9a-f-\]\{36\}\$\/i\.test            → 1 match (UUID validation)
Analysis not found                                     → 2 matches (invalid-UUID + not-found branches)
data.grading_data                                      → 2 matches inside hydration effect (isV3Grade guard + cast)
.eq('user_id', userId)  [on hydration]                 → 0 matches ✓ (RLS reliance)
```

**CareerCompass.tsx:**
```
useSearchParams                                        → 2 matches (import + hook call)
searchParams.get('id')                                 → 1 match
from('analysis_results')                               → 2 matches (hydration + existing cache-load at line 192)
analysis_type.*career_compass                          → 2 matches (hydration + existing)
Analysis not found                                     → 2 matches
data.raw_response                                      → 1 match inside hydration effect
data.result ?? | data.analysis_data ??                 → 0 matches ✓ (no speculative fallback)
.eq('user_id', userId)  [on hydration]                 → 0 matches ✓ (RLS reliance)
```

**RecruitingLens.tsx:**
```
useSearchParams                                        → 2 matches (import + hook call)
analysis_type.*recruiting_lens                         → 1 match
This analysis wasn't saved                             → 1 match (Pitfall 6 informational toast)
Analysis not found                                     → 0 matches ✓ (informational variant, not error)
data.raw_response                                      → 1 match inside hydration effect
data.result ?? | data.analysis_data ??                 → 0 matches ✓
.eq('user_id', userId)  [on hydration]                 → 0 matches ✓
```

**InterviewPrep.tsx:**
```
useSearchParams                                        → 2 matches (import + hook call)
from('interview_quizzes')                              → 1 match
from('interview_quiz_answers')                         → 1 match
Analysis not found                                     → 2 matches (invalid-UUID + not-found branches)
raw_response | analysis_results                        → 0 matches ✓ (uses composite interview_quizzes + interview_quiz_answers)
PastQuizView                                           → 2 matches (usage in ternary + component definition)
pastQuiz ? (                                           → 1 match (the past-quiz branch precedes the result branch)
.eq('user_id', userId)  [on hydration]                 → 0 matches ✓
```

**Build + lint on modified files:**
- `npm run build` → passes (2.64s, 3186 modules)
- The repository-wide lint has many pre-existing `@typescript-eslint/no-explicit-any` errors (5559 total errors across 200+ files); scoping lint to the 4 files I touched, all errors shown on those files are pre-existing `any` usages from prior code — zero new errors introduced by this plan.

## Task 3 Checkpoint — PENDING

Task 3 is a `checkpoint:human-verify` blocking gate. The code portions of Tasks 1 + 2 are complete and committed. No code changes remain; Task 3 exists solely to validate production behavior of the deep-link hydration.

### Prerequisites
- PLAN-04 routes (`?id=<uuid>` emitted by AnalysisHistory) must already be in production — staged via commit `c21a930`.

### Operator verification script (7 steps)

1. **Setup** — On free-tier staging account with priors across all 5 features, open `/history`.
2. **LinkedInGrader deep-link** — Click the LinkedIn row.
   - URL should be `/linkedin-grader?id=<uuid>`.
   - Page loads the past analysis results directly (not the input form).
   - Existing features work: header-bar, "Scan New Profile" button, Ready-to-Paste Improvements + locked skeletons + Profile Completeness reorder all render correctly.
   - Edit URL to `/linkedin-grader?id=invalid` → toast "Analysis not found", input form shows.
   - Edit URL to `/linkedin-grader?id=00000000-0000-0000-0000-000000000000` (valid UUID, no match) → toast, input form shows.
3. **CareerCompass deep-link** — Click the Career Compass row.
   - URL: `/career-compass?id=<uuid>`.
   - Past analysis hydrates. PLAN-03 memory badge renders if the stored analysis had `reusedLinkedinGrade=true`.
   - Invalid UUID → toast + input view.
4. **RecruitingLens deep-link**:
   - If the test user is Elite and has a stored result: click the row → URL `/recruiting-lens?id=<uuid>` → past match hydrates.
   - If the test user is Pro/Free (no stored row): click the row → URL `/recruiting-lens?id=<uuid>` → informational toast "This analysis wasn't saved — run a fresh match to regenerate.", input view shows (silent degrade).
5. **InterviewPrep deep-link** — Click the Interview Prep row.
   - URL: `/interview-prep?id=<uuid>`.
   - Page lands on the PAST QUIZ RESULTS view (PastQuizView), NOT the coach chat or the live-prep input form.
   - Rendering shows: role/company/date header, metadata card (mode, tier, score, JD), and per-question cards with score + user answer + coach suggestions. Empty-state card if no answers were persisted.
   - Invalid UUID → toast + default view.
6. **SC-7 no-regression** — Open each of the 4 pages WITHOUT `?id=` in the URL. Default behavior unchanged (input form, new-scan flow works, existing Pro/Elite renders unchanged).
7. **RLS security sanity (T-22-10)** — Copy a deep-link from one user's session; attempt to open it while signed in as a different user. Expected: toast "Analysis not found" (RLS returns zero rows).

### Resume signal
Operator types "approved" if all 7 steps pass. If InterviewPrep lands on the coach chat instead of PastQuizView, or if RecruitingLens Pro degradation feels harsh, call out the specific failure and attach a screenshot of the broken state.

No additional code changes are required from this executor — Tasks 1 + 2 are complete and committed. The checkpoint exists to validate production behavior.

## Known Stubs

None introduced by this plan. Pre-existing stubs in InterviewPrep (mock `MOCK_RESULT`, hardcoded `hasResumeOnFile = true`, hardcoded `resumeFilename = "Your_Resume.pdf"`, and `handleStart` using a fake `setTimeout`) remain untouched — they are part of the live-prep flow which is explicitly out of scope for PLAN-05. PLAN-05 only adds the deferred-execution deep-link path; when a hydrated past-quiz row exists, the PastQuizView renders real data from `interview_quizzes` + `interview_quiz_answers`.

## Threat Flags

None. The threat model in PLAN-05 (`T-22-10`, `T-22-11`, `T-22-12`) covers all the surface introduced; no new network endpoints, auth paths, or file access patterns added.

## Next Phase Readiness

- PLAN-04 + PLAN-05 together close SC-6 end-to-end: History click → `?id=<uuid>` route → feature page hydrates → past analysis renders.
- Phase 22 code portion: complete across all 5 plans (01, 02, 03, 04, 05).
- Outstanding: PLAN-03 and PLAN-04 checkpoints plus PLAN-05's own Task 3 checkpoint remain pending operator deployment + staging verification.

---
*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Plan: 05*
*Completed (code): 2026-04-20*
*Checkpoint (operator): PENDING*

## Self-Check: PASSED

**Files verified present:**
- `.planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-05-SUMMARY.md` — FOUND
- `src/pages/LinkedInGrader.tsx` — FOUND (hydration effect at lines 154-182)
- `src/pages/CareerCompass.tsx` — FOUND (hydration effect at lines 243-273)
- `src/pages/RecruitingLens.tsx` — FOUND (hydration effect at lines 307-337)
- `src/pages/InterviewPrep.tsx` — FOUND (hydration effect + PastQuizView appended)

**Commits verified in git log:**
- `1065f43` — feat(22-05): ?id= hydration on LinkedInGrader + CareerCompass — FOUND
- `a2f80b5` — feat(22-05): ?id= hydration on RecruitingLens + InterviewPrep — FOUND

Task 3 (human-verify checkpoint) remains outstanding — operator must deploy (if necessary — no edge function changes in this plan, frontend-only) and walk the 7 verification scenarios.
