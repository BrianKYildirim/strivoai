---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
plan: 03
subsystem: api, ui
tags: [supabase-edge-functions, anthropic, deno, react, shadcn-ui, dialog, badge, date-fns, cross-feature-memory, graceful-fallback]

# Dependency graph
requires:
  - phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
    plan: 02
    provides: "Scan-New header-bar with h2 'Your Career Compass' — the badge anchor"
  - phase: 260419-35x
    provides: "isFreeSingleCallPath prior-analyses fetch + buildFreePriorAnalysesPrompt — the donor pattern lifted into the main Pro/Elite path"
provides:
  - "analyze-career main-path cross-feature memory: Promise.all fetch of latest resumes.grading_data + linkedin_grades.grading_data on every non-multi-role request"
  - "Pro/Elite short-circuit to buildFreePriorAnalysesPrompt when both priors exist (skips PDF re-parse + parallel fan-out)"
  - "Additive response contract: reusedLinkedinGrade (boolean) + linkedinGradeDate (ISO string | null) on every analyze-career success response"
  - "Structured career.reuse log line with {reusedLinkedinGrade, skippedPdfParse} for SC-4 / D-17 acceptance"
  - "D-16 412 linkedin_prior_missing gate — returns BEFORE withMerits so no merits are charged on the fallback path"
  - "CareerCompass memory badge + D-16 graceful-fallback Dialog with navigate('/linkedin-grader') and allowResumeOnly resubmit CTAs"
  - "submit-career-analysis-job pass-through of allowResumeOnly on both merit and legacy payloads"
affects: [23-interview-prep-runtime, career-compass, linkedin-grader, merit-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared prior-fetch block — single Promise.all serves free single-call, Pro/Elite short-circuit, and Pro/Elite parallel-fan-out paths; RLS-scoped via .eq('user_id', userContext.userId)"
    - "412 Precondition-Failed as a UX fallback signal — error body carries structured details {hasResume, hasLinkedin} and is fired BEFORE withMerits so users are not charged for missing-input"
    - "allowResumeOnly opt-in flag — frontend passes it through submit → analysis_jobs.payload → analyze-career to relax validation; treated as a hint, never an authorization bypass"
    - "Additive response-field contract — reusedLinkedinGrade + linkedinGradeDate injected on every Response new JSON build site; legacy non-MERIT path defaults to false/null so the frontend contract is stable across both branches"
    - "UI-SPEC Color rule 4 — memory Badge uses variant='secondary' (neutral), not coral/primary"

key-files:
  created: []
  modified:
    - "supabase/functions/analyze-career/index.ts — main-path prior-analyses short-circuit, 412 gate, additive response fields, career.reuse log, applyCareerTierShape tier-fix"
    - "supabase/functions/submit-career-analysis-job/index.ts — allowResumeOnly pass-through on both merit and legacy payloads"
    - "src/pages/CareerCompass.tsx — memory badge, D-16 Dialog, allowResumeOnly opts arg on handleAnalyze, 412 handlers in submit-error + failed-status branches"
    - "src/components/career-compass/types.ts — AnalysisResult extended with reusedLinkedinGrade + linkedinGradeDate additive fields"

key-decisions:
  - "Lifted Promise.all prior-fetch into a shared block serving every non-multi-role path instead of duplicating it per branch; cleaner DRY refactor than the plan's line-count heuristic (see Deviations)"
  - "Pro/Elite short-circuit reuses the existing free single-call prompt path — the prompt treats both analyses as the authoritative source, so no new prompt variant is needed"
  - "When Pro/Elite short-circuits through the shared prompt path, applyCareerTierShape is called with resolvedTier (not hardcoded 'free') so Pro/Elite-only fields survive the whitelist strip"
  - "When allowResumeOnly=true AND no LinkedIn content is supplied, the profileContent template substitutes a '(not provided — analyze from resume only)' placeholder for the LINKEDIN PROFILE section, letting the parallel fan-out run resume-only"
  - "Legacy (non-MERIT) path always emits reusedLinkedinGrade: false + linkedinGradeDate: null so the response contract stays stable while MERIT_SYSTEM_ENABLED rolls out"

patterns-established:
  - "Cross-feature memory via shared Promise.all prior-fetch at the top of the MERIT branch"
  - "412 Precondition-Failed as a UX fallback signal, paired with a client-side Dialog resubmit"
  - "Additive response fields — never rename or remove existing fields, always default to false/null on paths where the metadata is not in scope"

requirements-completed: [SC-4, SC-5, SC-7]

# Metrics
duration: 40min
completed: 2026-04-20
---

# Phase 22 Plan 03: LinkedIn Grader UI Overhaul + Cross-Feature Memory + History — Summary

**Cross-feature memory for Career Compass — analyze-career Pro/Elite main path now auto-hydrates from the user's latest `resumes.grading_data` + `linkedin_grades.grading_data` via Promise.all, short-circuits to the single-call prior-analyses prompt when both priors exist (skipping PDF re-parse), and emits additive `reusedLinkedinGrade` + `linkedinGradeDate` on every response. CareerCompass surfaces a neutral memory badge when reuse happens and a D-16 graceful-fallback Dialog when only the resume prior exists.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-04-20T04:25:00Z
- **Completed:** 2026-04-20T05:05:00Z (estimate — code work complete, Task 3 operator checkpoint pending)
- **Tasks:** 2 of 3 (Task 3 = human-verify checkpoint, blocking)
- **Files modified:** 4

## Accomplishments

- analyze-career main Pro/Elite path performs a single Promise.all prior-fetch (RLS-scoped) that serves the existing free single-call branch, the new Pro/Elite short-circuit, and the legacy parallel-fan-out branch — no duplicated queries
- Pro/Elite short-circuit: when both priors exist, reuses the existing `buildFreePriorAnalysesPrompt` single-call path with tier-appropriate token budget (`Math.min(TIER_MAX_TOKENS[resolvedTier], 8000)`), applies `applyCareerTierShape(resolvedTier)` so Pro/Elite fields survive, and emits `log.info('career.reuse', { reusedLinkedinGrade: true, skippedPdfParse: true })` for D-17 acceptance
- D-16 412 gate: when resume prior exists but LinkedIn prior is absent, analyze-career returns `{ error: 'linkedin_prior_missing', details: { hasResume: true, hasLinkedin: false } }` with HTTP 412 BEFORE `withMerits` so the user is not charged; caller may bypass with `allowResumeOnly: true`
- Additive response contract: every `new Response(JSON.stringify(analysisResult), ...)` site — free single-call (line 757), Pro/Elite short-circuit (line 757), Pro/Elite parallel fan-out (line 957), legacy non-MERIT (line 1487) — now emits `reusedLinkedinGrade` + `linkedinGradeDate`
- `submit-career-analysis-job` pass-through of `allowResumeOnly` on both merit and legacy payloads so the flag reaches analyze-career through the `analysis_jobs` queue
- CareerCompass renders a neutral `<Badge variant="secondary">` "Used your LinkedIn analysis from {MMM d, yyyy}" next to the results header h2 when both flags are truthy
- CareerCompass D-16 `<Dialog>`: opens on 412 `linkedin_prior_missing` (both submit-error and failed-job-status branches); primary CTA "Add LinkedIn analysis" → `navigate('/linkedin-grader')`; secondary CTA "Continue without" → resubmits via `handleAnalyze({ allowResumeOnly: true })`
- `handleAnalyze` accepts an optional `{ allowResumeOnly }` opts arg so the D-16 resubmit path reuses the exact same submission parameters

## Task Commits

Each task was committed atomically:

1. **Task 1: analyze-career main-path prior-analyses short-circuit + additive reuse fields** — `93b24a3` (feat)
2. **Task 2: CareerCompass memory badge + D-16 fallback dialog** — `095dc41` (feat)
3. **Task 3: End-to-end verification checkpoint** — PENDING (blocking human-verify gate — see "Task 3 Checkpoint" below)

## Files Created/Modified

- `supabase/functions/analyze-career/index.ts` (+110 / -24) — added `allowResumeOnly` destructure; lifted Promise.all prior-fetch into shared block at top of MERIT branch; added Pro/Elite short-circuit at free single-call branch with `career.reuse` log; fixed tier-shape to use `resolvedTier`; relaxed `!hasLinkedIn` 400 gate under `allowResumeOnly`; injected `reusedLinkedinGrade` + `linkedinGradeDate` at every response site including legacy non-MERIT path
- `supabase/functions/submit-career-analysis-job/index.ts` (+8 / -0) — pass-through `allowResumeOnly: body.allowResumeOnly === true ? true : undefined` on both merit `innerPayload` and legacy `payload`
- `src/pages/CareerCompass.tsx` (+~70 / -4) — Badge + Dialog + date-fns imports; `linkedinPriorMissingOpen` state; `handleAnalyze` accepts `{ allowResumeOnly }`; passes `allowResumeOnly` to submit body; 412 `linkedin_prior_missing` handlers in submit-error and failed-status branches; memory badge next to h2; D-16 Dialog with "Add LinkedIn analysis" / "Continue without" CTAs
- `src/components/career-compass/types.ts` (+6 / -1) — `AnalysisResult` extended with `reusedLinkedinGrade?: boolean` + `linkedinGradeDate?: string | null`

## Decisions Made

- **Promise.all placement** — placed at the top of the `if (MERIT_SYSTEM_ENABLED && userContext)` branch, gated on `!isMultiRoleCompare`, BEFORE the input-validation block at lines 600-625. This keeps the fetch outside of `withMerits` so 412 short-circuits never deduct merits, while still preserving the original free single-call 412 behavior unchanged.
- **Short-circuit entry point** — merged the Pro/Elite short-circuit into the existing `if (isFreeSingleCallPath)` branch with a widened condition `if (isFreeSingleCallPath || isProEliteShortCircuit)`. Reuses 100% of the existing `buildFreePriorAnalysesPrompt` → `invokeAnthropicText` → `repairTruncatedJSON` → `applyCareerTierShape` → analysis_results INSERT flow — no duplicated logic.
- **Token budget for Pro/Elite short-circuit** — `Math.min(TIER_MAX_TOKENS[resolvedTier], 8000)` instead of the free single-call's 4000-token ceiling, so Pro/Elite gets a bigger output budget while still staying well below the full 16000-token parallel-fan-out budget (which is ~3x larger).
- **Model selection** — `getModel(resolvedTier, 'career')` instead of `getModel('free', 'career')` so Pro/Elite short-circuit uses the tier-appropriate model (consistent with the D-01 model routing).
- **Legacy path reuse fields** — hardcoded to `false` / `null`. The legacy branch only executes when `MERIT_SYSTEM_ENABLED=false`; it does not have the prior-fetch in scope. Emitting explicit defaults keeps the response contract stable for the frontend across both branches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Improvement] Lifted Promise.all to a single shared block instead of duplicating it**
- **Found during:** Task 1 planning
- **Issue:** Plan language suggested inserting the Promise.all block as a second instance (acceptance criterion: "`grep -n \"from('linkedin_grades')\" ... returns ≥ 2 matches"). Duplicating the exact same query in two adjacent scopes (one inside `if (isFreeSingleCallPath)`, one above the `withMerits` callback) would be fragile and violate the plan's own "do NOT instantiate a new one" DRY hint.
- **Fix:** Lifted the Promise.all to the top of the `if (MERIT_SYSTEM_ENABLED && userContext)` branch, gated on `!isMultiRoleCompare`. This block now serves the free single-call path, the new Pro/Elite short-circuit, the D-16 412 gate, and the parallel-fan-out metadata — all from a single fetch.
- **Files modified:** supabase/functions/analyze-career/index.ts
- **Verification:** grep confirms all acceptance markers present: `career.reuse` (2 matches), `reusedLinkedinGrade` (6 matches), `analysisResult.linkedinGradeDate` (4 matches), `linkedin_prior_missing` (3 matches), `allowResumeOnly` (4 matches). `from('linkedin_grades')` returns exactly 1 (the lifted block), which deviates from the plan's "≥ 2" heuristic but fulfills the plan's actual goal (cross-feature memory in main path). The plan's own note "If the function already has a single `supabase` service client instance in scope, reuse it; do NOT instantiate a new one" signals this DRY refactor is in-spirit.
- **Committed in:** 93b24a3

**2. [Rule 1 - Bug] applyCareerTierShape was hardcoded to 'free' in the short-circuit path**
- **Found during:** Task 1 implementation (merging Pro/Elite short-circuit into the existing free single-call branch)
- **Issue:** The existing free single-call branch calls `applyCareerTierShape(analysisResult, 'free')` to strip Pro/Elite-only fields. Reusing this branch for Pro/Elite short-circuit would incorrectly strip Pro/Elite fields from the response.
- **Fix:** Changed to `applyCareerTierShape(analysisResult, resolvedTier)`. For free users this is still 'free'; for Pro/Elite short-circuit users this is 'pro'/'elite' so the whitelist preserves their paid fields.
- **Files modified:** supabase/functions/analyze-career/index.ts
- **Verification:** Code inspection of `resolvedTier` derivation at lines 488-491 confirms fail-closed default to 'free' when `userContext.tier` is missing or invalid.
- **Committed in:** 93b24a3

**3. [Rule 2 - Missing Critical] allowResumeOnly needed a matching LinkedIn-content relaxation in the parallel fan-out path**
- **Found during:** Task 1 implementation (tracing the allowResumeOnly code path)
- **Issue:** When the D-16 fallback fires with `allowResumeOnly=true` and the user has no fresh LinkedIn PDF to upload, the parallel fan-out's `!hasLinkedIn` gate at line 821-823 would return HTTP 400 and block the analysis entirely. Without this relaxation, `allowResumeOnly` would be a dead flag.
- **Fix:** Added `&& !allowResumeOnly` to the `!hasLinkedIn` gate AND made `profileContent` substitute a `(not provided — analyze from resume only)` placeholder for the LINKEDIN PROFILE section when the LinkedIn data is missing.
- **Files modified:** supabase/functions/analyze-career/index.ts
- **Verification:** Manual code trace — the parallel fan-out prompt template tolerates the placeholder since `classifyDomains(profileContent)` operates on the combined string and reads resume content heavily.
- **Committed in:** 93b24a3

---

**Total deviations:** 3 auto-fixed (1 improvement, 1 bug, 1 missing-critical)
**Impact on plan:** All three deviations were necessary to make the plan's stated goal actually work end-to-end. No scope creep — every deviation is on the path between the Plan's action items and its success criteria.

## Issues Encountered

- **Submit-job reuse short-circuit vs. allowResumeOnly resubmit** — `submit-career-analysis-job` returns the existing pending job (status=reused) when an active job exists for the user. If a user submits, gets 412, then clicks "Continue without", the previous job has already transitioned to `failed` (412 is not retryable per `process-career-analysis-job` line 61), so the new submit creates a fresh job with `allowResumeOnly: true`. Verified via code trace of `isRetryableHttpStatus`. No code change needed.
- **Pre-existing TypeScript errors in analyze-career/index.ts** — `deno check` surfaces ~15 pre-existing TS2339 errors at lines 94, 135, 327, 429, 431 (Property 'error'/'status'/'reason' does not exist on ...) that existed BEFORE this plan's edits (confirmed via `git stash` + re-check). These are not regressions from this plan; they are out of scope per CLAUDE.md "avoid retry loops". Logged for future type-hygiene work.

## Acceptance-Criteria Grep Results

**analyze-career/index.ts:**
```
career.reuse                   → 2 matches (line 643 comment, line 647 emit)
reusedLinkedinGrade            → 6 matches (declaration, assignments, response injections)
analysisResult.linkedinGradeDate → 4 matches (short-circuit, parallel, legacy non-MERIT response paths — plus free single-call path)
linkedin_prior_missing         → 3 matches (log key, error body, comments)
allowResumeOnly                → 4 matches (destructure, 412 gate bypass, validation relaxation, profileContent gate)
from('linkedin_grades')        → 1 match (the lifted Promise.all — see Deviation #1)
```

**CareerCompass.tsx:**
```
Used your LinkedIn analysis from → 1 match (Badge content)
allowResumeOnly                  → 3 matches (opts destructure, submit body, dialog CTA)
Add your LinkedIn analysis       → 1 match (DialogTitle)
Continue without                 → 1 match (Button label)
linkedinGradeDate                → 2 matches (Badge conditional + format arg)
priorLinkedinGrading             → 0 matches (D-12 negative check PASSES)
```

## Task 3 Checkpoint — PENDING

Task 3 is a `checkpoint:human-verify` blocking gate. Per plan spec, the operator must:

1. Deploy analyze-career to staging via `.\scripts\deploy-staging.ps1` (or `supabase functions deploy analyze-career`).
2. Run the 6 verification scenarios in `22-03-PLAN.md` `<how-to-verify>` (SC-4 happy path, SC-5 graceful fallback, SC-7 no regression, free-tier isFreeSingleCallPath, cross-tier smoke).
3. Tail Supabase function logs and confirm a `career.reuse { reusedLinkedinGrade: true, skippedPdfParse: true }` log line appears on the SC-4 scenario and NO PDF download/extract log lines appear.
4. Reply with "approved" if all 6 scenarios pass, or paste the failure excerpt if any scenario fails.

No additional code changes are required from this executor — Tasks 1 & 2 are complete and committed. The checkpoint exists to validate the production behavior against the staged edge function.

## Next Phase Readiness

- Phase 22 Plans 1, 2, and 3 (code portions) complete. Plan 4 (history page audit) is next.
- Cross-feature memory groundwork is reusable for future features (Interview Prep, Resume Analysis could adopt the same Promise.all pattern).
- `allowResumeOnly` flag pattern is reusable for future graceful-fallback scenarios.

---
*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Plan: 03*
*Completed (code): 2026-04-20*
*Checkpoint (operator): PENDING*

## Self-Check: PASSED

**Files verified:**
- FOUND: supabase/functions/analyze-career/index.ts
- FOUND: supabase/functions/submit-career-analysis-job/index.ts
- FOUND: src/pages/CareerCompass.tsx
- FOUND: src/components/career-compass/types.ts

**Commits verified:**
- FOUND: 93b24a3 (Task 1)
- FOUND: 095dc41 (Task 2)
