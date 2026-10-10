---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
plan: 04
subsystem: api, ui
tags: [supabase-edge-functions, deno, react, history, usage-tracking, merit-system, timestamp-proximity, rpc, cross-feature-routing]

# Dependency graph
requires:
  - phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
    plan: 03
    provides: "analyze-career main-path prior-fetch + 412 gate + allowResumeOnly branch — the surface this plan layers record_ai_usage onto"
provides:
  - "Merit-path usage_tracking INSERT on all 4 non-resume feature edge functions: grade-linkedin (2 sites — paid + free-scan carve-out), analyze-career (2 sites — short-circuit + full PDF-parse convergence), recruiting-lens (1 site — Free/Pro/Elite covered), interview-prep-analyze (1 site — Elite quiz + Pro flashcard covered)"
  - "grade-linkedin free-scan-bypass writes credits_consumed=0 so first-scan-of-cycle appears in History (Pitfall 3 fix)"
  - "AnalysisHistory generalized findIdForEntry(entry, candidates) — ±5min timestamp-proximity matcher working across all 5 feature tables"
  - "AnalysisHistory per-feature route dispatch: resume_analysis → /results/{id}; linkedin_grading → /linkedin-grader?id={id}; career_compass → /career-compass?id={id}; recruiting_lens → /recruiting-lens?id={id} with silent-degrade (Pitfall 6); interview_prep → /interview-prep?id={id}"
affects: [linkedin-grader, career-compass, recruiting-lens, interview-prep, analysis-history]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Merit-path usage_tracking INSERT via record_ai_usage RPC (not the atomic check_and_record variant) because entitlement is already enforced by withMerits — single-responsibility audit write"
    - "Non-blocking .then-chained RPC call — failed insert logs usage-tracking-insert-failed but does NOT fail the user's feature request (UX-preserving)"
    - "Convergence-point INSERT placement in analyze-career — short-circuit branch has its own INSERT and returns before reaching the full PDF-parse branch INSERT, so exactly one INSERT fires per successful run (static reading proof)"
    - "Pitfall 3 zero-credit carve-out — grade-linkedin free-scan writes credits_consumed=0; the History UI already tolerates arbitrary credits_consumed values (existing render at line 366)"
    - "Generalized findIdForEntry accepting a candidate-array parameter instead of table-specific resumes closure — 5 call sites, 1 implementation"
    - "Per-feature route dispatch switch pattern with id-resolved vs toolRoutes fallback — preserves unclickable behavior when resume_analysis cannot resolve (parity with original) while allowing silent-degrade for feature routes that have a base URL (Pitfall 6)"

key-files:
  created: []
  modified:
    - "supabase/functions/grade-linkedin/index.ts — 2 new record_ai_usage calls (paid merit path at line ~348; free-scan-bypass at line ~325 with p_credits=0)"
    - "supabase/functions/analyze-career/index.ts — 2 new record_ai_usage calls (Pro/Elite short-circuit at line ~710; full PDF-parse convergence at line ~940)"
    - "supabase/functions/recruiting-lens/index.ts — 1 new record_ai_usage call (line ~262, after mergeRecruitingLensResults and before Elite-only analysis_results persistence)"
    - "supabase/functions/interview-prep-analyze/index.ts — 1 new record_ai_usage call (line ~315, after validation passes and before Elite-vs-Pro persistence split)"
    - "src/pages/AnalysisHistory.tsx — 4 new useQuery hooks + findIdForEntry generalized + getEntryRoute extended to a 5-case switch with ?id= per-feature resolution"

key-decisions:
  - "Placed analyze-career INSERTs at 2 sites (short-circuit + full-parse convergence) with static-reading convergence proof instead of using a usageTracked boolean guard — each branch's terminal `return new Response(...)` guarantees at most one INSERT per path, which is simpler than the boolean and equivalent by construction"
  - "Reused the existing `supabase` client already in scope in analyze-career/interview-prep-analyze instead of instantiating a second service client via getServiceClient() — honors the plan's DRY hint"
  - "Used .then(({ error }) => ...) instead of try/catch on await because the failure mode is 'log and continue' — try/catch would require a dummy catch clause and adds noise"
  - "grade-linkedin free-scan write uses p_credits=0 (not 1) so the History credit badge renders '0 credits' for free scans — semantically correct per Pitfall 3 and RESOLVED Q2"
  - "AnalysisHistory switch uses toolRoutes[key] ?? null for the fallback path so existing dashboard redirect behavior for job_matching/job_comparison is preserved unchanged (D-23 spirit — only extend, don't break)"

patterns-established:
  - "record_ai_usage RPC as the canonical audit-only write on the merit path — pair with withMerits entitlement enforcement"
  - "±5min timestamp-proximity ID resolution works generically across all feature tables (no schema migration needed)"
  - "Silent-degrade routing for features with tiered persistence gaps (Recruiting Lens Pro without analysis_results)"

requirements-completed: [SC-6, SC-7]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 22 Plan 04: History merit-path usage_tracking INSERTs + per-feature ID resolution — Summary

**Closes SC-6 (History shows all 5 feature runs with working View action) by patching 4 merit-path edge functions to write `usage_tracking` rows via `record_ai_usage` RPC, plus Pitfall 3 free-scan carve-out, and generalizes the AnalysisHistory timestamp-proximity matcher + route dispatcher to resolve `?id=` for all 5 feature types.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T08:26:12Z
- **Completed:** 2026-04-20T08:32:52Z (code portion — Task 3 operator checkpoint pending)
- **Tasks:** 2 of 3 (Task 3 = human-verify checkpoint, blocking)
- **Files modified:** 5

## Accomplishments

- All 4 merit-path edge functions now emit a `usage_tracking` row on successful AI completion via `record_ai_usage` RPC inside their `withMerits` callbacks. Non-blocking by design — a failed insert logs `usage-tracking-insert-failed` but does NOT fail the user's feature request.
- grade-linkedin free-scan-bypass path (Pitfall 3 fix): first LinkedIn scan of a billing cycle now writes a `credits_consumed=0` row, restoring History visibility for the LIG-11 additive carve-out.
- analyze-career convergence-point placement: Pro/Elite short-circuit branch and the full PDF-parse branch each have their own INSERT immediately before their respective `return new Response(...)`. Static reading proves zero-or-double is impossible — each branch terminates via an exclusive response return.
- recruiting-lens INSERT placed after `mergeRecruitingLensResults` and before the Elite-only `analysis_results` persistence, so Free + Pro + Elite tiers are all covered uniformly.
- interview-prep-analyze INSERT placed after validation passes and before the Elite-quiz vs Pro-flashcard persistence split, so exactly one INSERT fires per successful run regardless of which sub-branch persists downstream.
- AnalysisHistory extends the proximity matcher to 4 additional feature tables via a generalized `findIdForEntry(entry, candidates)` signature. Route dispatcher is now a 5-case switch that resolves `?id=` when a ±5min match exists and falls back to the plain feature route otherwise.
- Pitfall 6 silent-degrade: Recruiting Lens Pro-tier history clicks route to `/recruiting-lens` (no id) because Pro has no `analysis_results` row to hydrate from. The feature page will render its input view in that case.
- Empty state (D-23) and existing `usage_tracking` query (D-19) untouched. No client-side tier filter added.
- No schema migration. No legacy `checkAndRecordUsage` calls touched. No regression to Pro/Elite DOM (SC-7).

## Task Commits

Each task was committed atomically:

1. **Task 1: record_ai_usage on merit path for 4 edge functions** — `dbe70d1` (feat)
2. **Task 2: generalize History proximity matcher + per-feature routing** — `c21a930` (feat)
3. **Task 3: End-to-end staging verification checkpoint** — PENDING (blocking human-verify gate — see "Task 3 Checkpoint" below)

## Files Created/Modified

- `supabase/functions/grade-linkedin/index.ts` (+26 lines) — added 2 `record_ai_usage` call sites. Site 1: inside the free-scan-bypass branch AFTER the `free_linkedin_scan_used` flag-flip AND BEFORE `storeAndNotify`, with `p_credits: 0` (Pitfall 3). Site 2: inside the `withMerits` callback AFTER `runTieredAiCall` success AND BEFORE `storeAndNotify`, with `p_credits: 1`.
- `supabase/functions/analyze-career/index.ts` (+32 lines) — added 2 `record_ai_usage` call sites. Site 1 (short-circuit): line ~710, AFTER `applyCareerTierShape` + additive-reuse-field injection AND BEFORE the non-blocking `analysis_results` persistence; the branch ends with `return new Response(...)` at line ~770, so fires exactly once. Site 2 (full PDF-parse): line ~940, AFTER `applyCareerTierShape` + additive-reuse-field injection AND BEFORE the non-blocking `analysis_results` persistence; the branch ends with `return new Response(...)` at line ~980. No `usageTracked` boolean needed — convergence proof is structural.
- `supabase/functions/recruiting-lens/index.ts` (+15 lines) — added 1 `record_ai_usage` call at line ~262, AFTER `mergeRecruitingLensResults` returns `merged` AND BEFORE the `resolvedTier === 'elite'` persistence block. Covers Free + Pro + Elite uniformly.
- `supabase/functions/interview-prep-analyze/index.ts` (+16 lines) — added 1 `record_ai_usage` call at line ~315, AFTER the validator passes (either first-attempt or retry) AND BEFORE the `const parsedObj = parsed as Record<string, unknown>` destructure + Elite-vs-Pro split.
- `src/pages/AnalysisHistory.tsx` (+97 / -9 lines) — added 4 new `useQuery` hooks (`userLinkedinGrades`, `userCareerCompassResults`, `userRecruitingLensResults`, `userInterviewQuizzes`), each mirroring the existing `userResumes` shape with an explicit `.eq('user_id', userId!)` defense-in-depth filter on top of RLS. Generalized `findResumeForEntry` into `findIdForEntry(entry, candidates)`. Extended `getEntryRoute` into a 5-case switch with per-feature `?id=` resolution and plain-route fallback.

## Decisions Made

- **Convergence proof by structural termination (analyze-career)** — the plan offered two acceptable patterns: a `usageTracked` boolean guard OR a single convergence point after both branches finish. I adopted a third structural variant: each branch has its own INSERT immediately preceding its own `return new Response(...)`. The branches are mutually exclusive (the short-circuit returns before reaching the full PDF-parse code), so exactly one INSERT fires per successful run. This is simpler than either plan-suggested pattern because it needs no shared state and no new convergence helper function. Verified by static code reading of lines 645-770 (short-circuit) and 763-970 (full parse) — there is no code path that can execute both INSERTs, and no success path that executes zero INSERTs.
- **Service-client reuse (analyze-career, interview-prep-analyze)** — those two functions already have `const supabase = getServiceClient()` in scope; I reused the existing variable instead of calling `getServiceClient()` again, matching the plan's DRY hint ("If the function already has a service-client instance in scope, reuse it — do NOT instantiate a second one").
- **Non-blocking .then chain (not try/catch)** — the acceptable failure mode is "log and continue", which naturally maps to `.then(({ error }) => { if (error) log.error(...) })` without needing a `try/catch` wrapper. This matches the existing non-blocking patterns in these files (e.g., the email-trigger `.catch(err => log.error(...))` calls).
- **grade-linkedin free-scan p_credits=0** — chose zero (not one) because the free-scan is an additive carve-out that intentionally bypasses credit deduction. The History credit badge will render "0 credits" for these rows, which is semantically correct per RESOLVED Open Question 2 in RESEARCH.md.
- **AnalysisHistory switch default clause** — kept `toolRoutes[entry.action_type] ?? null` as the default branch to preserve existing dashboard-redirect behavior for `job_matching` / `job_comparison` action types (they were not in scope for this plan).

## Deviations from Plan

None. Plan executed exactly as written. All acceptance criteria met verbatim.

## Issues Encountered

- **Pre-existing lint errors in analyze-career/index.ts (8 errors)** — lines 148, 149, 371, 781, 896, 1059, 1333, 1408 have `@typescript-eslint/no-explicit-any` and `prefer-const` errors that existed BEFORE this plan's edits (confirmed via `git stash` + `npx eslint` — all 8 errors are on the stash-clean tree). They are not regressions from this plan; they are out of scope per CLAUDE.md "avoid retry loops that create bad UX". Logged for future type-hygiene work.
- **Pre-existing record_ai_action silent-error bug in analyze-resume** — flagged by RESEARCH.md §State of the Art and Pitfall 1: `analyze-resume/index.ts` calls `supabase.rpc('record_ai_action', ...)` at multiple sites, but no migration defines `record_ai_action` — only `record_ai_usage` exists. Silent RPC failures. Explicitly out of scope per the plan (`<acceptance_criteria>`: "Attempt to fix the pre-existing `record_ai_action` silent-error bug in analyze-resume (out of scope per RESEARCH §State of the Art)"). Flagged for a future cleanup plan.

## Acceptance-Criteria Grep Results

**grade-linkedin/index.ts:**
```
record_ai_usage                                    → 4 matches (2 sites × 2 lines each: .rpc + p_action_type)
p_action_type: 'linkedin_grading'                  → 2 matches (paid + free-scan-bypass sites)
p_credits: 0                                       → 1 match (free-scan-bypass site only — acceptance says exactly 1)
p_credits: 1                                       → 1 match (paid merit path site)
```

**analyze-career/index.ts:**
```
record_ai_usage                                    → 4 matches (2 merit-path sites × 2 lines each; legacy checkAndRecordUsage at ~line 987 is a separate function, not this string)
p_action_type: 'career_compass'                    → 2 matches (short-circuit + full PDF-parse convergence)
usageTracked                                       → 0 matches (convergence proof is structural, not boolean — documented above)
```

**recruiting-lens/index.ts:**
```
record_ai_usage                                    → 2 matches (1 site × 2 lines: .rpc + p_action_type)
p_action_type: 'recruiting_lens'                   → 1 match (merit path, after merge, before Elite persist)
```

**interview-prep-analyze/index.ts:**
```
record_ai_usage                                    → 2 matches (exactly 1 site as required)
p_action_type: 'interview_prep'                    → 1 match (merit path, after validation)
```

**AnalysisHistory.tsx:**
```
findIdForEntry                                     → 6 matches (1 declaration at line 255 + 5 call sites in the switch) — acceptance criterion ≥ 5 met
userLinkedinGrades|userCareerCompassResults|      → 4 matches (one per useQuery hook)
userRecruitingLensResults|userInterviewQuizzes
from('linkedin_grades')                            → 1 match
from('analysis_results')                           → 2 matches (career_compass + recruiting_lens queries)
from('interview_quizzes')                          → 1 match
?id=                                               → 4 matches (linkedin-grader, career-compass, recruiting-lens, interview-prep)
No activity yet                                    → 1 match (empty state preserved — D-23)
credits_consumed                                   → 2 matches (interface field + render logic — both unchanged)
```

**No new migrations:**
```
git status --short | grep supabase/migrations     → 0 matches ✓
```

**Build + lint on modified files:**
- `npm run build` → passes (3.50s, 3186 modules)
- `npx eslint src/pages/AnalysisHistory.tsx` → 0 errors
- `npx eslint supabase/functions/grade-linkedin/index.ts` → 0 errors (in modified sections)
- `npx eslint supabase/functions/recruiting-lens/index.ts` → 0 errors
- `npx eslint supabase/functions/interview-prep-analyze/index.ts` → 0 errors
- `npx eslint supabase/functions/analyze-career/index.ts` → 8 pre-existing errors (confirmed via git stash), 0 new errors from this plan

## Task 3 Checkpoint — PENDING

Task 3 is a `checkpoint:human-verify` blocking gate. The code portions of Tasks 1 + 2 are complete and committed. The operator must:

1. Deploy the 4 edge functions to staging:
   ```powershell
   supabase functions deploy grade-linkedin analyze-career recruiting-lens interview-prep-analyze
   ```
   (or run `.\scripts\deploy-staging.ps1`).

2. **SC-6 free-tier full-coverage test** — using a fresh free-tier staging account, run one analysis for each of the 5 features and verify the history page accumulates all 5 rows. For the LinkedIn Grader row, verify the credits badge shows "0 credits" if it was the first scan of the cycle (free-scan carve-out) or "1 credit" otherwise.

3. **D-21 click routing test** — click each of the 5 history rows and verify each navigates to its specific past analysis (note: per-page `?id=` hydration on LinkedIn Grader / Career Compass / Recruiting Lens / Interview Prep lands in PLAN-05; until that ships, the routes may render the default input view — flag to operator).

4. **SC-7 Pro-tier no-regression** — sign in as a Pro-tier account with activity across all 5 features and verify the history page shows ALL rows (no client-side tier filter hiding anything). Row count in History must match the `usage_tracking` row count for that user (query directly via Supabase SQL editor as a sanity check).

5. **SC-7 Elite-tier smoke** — same as step 4 for Elite.

6. **Idempotency / no-double-count** — run 1 fresh analysis for each of the 4 non-resume features; verify exactly 1 new `usage_tracking` row per run (query directly).

7. **Log sanity** — tail Supabase function logs during the test runs and confirm no `usage-tracking-insert-failed` log lines appear.

**Resume signal:** Operator types "approved" to close the gate, or pastes the `usage_tracking` SQL query result showing any missing rows.

No additional code changes are required from this executor — Tasks 1 + 2 are complete and committed. The checkpoint exists to validate production behavior against the staged edge functions.

## Pre-Existing Bugs Flagged (Out of Scope)

1. **analyze-resume `record_ai_action` silent-error** — `supabase/functions/analyze-resume/index.ts` at lines 864, 978, 1060, 1134, 1261, 1350 calls `supabase.rpc('record_ai_action', ...)` but no migration defines such an RPC. The calls silently error (logged via `if (usageErr) console.error(...)` but not propagated). Pre-existing bug outside Phase 22 scope per RESEARCH.md §State of the Art and Pitfall 1. Recommended fix: replace with `record_ai_usage` (with `p_credits` arg) or use the atomic `check_and_record_ai_usage` RPC.

2. **analyze-career pre-existing lint errors** — 8 errors across lines 148, 149, 371, 781, 896, 1059, 1333, 1408 (`@typescript-eslint/no-explicit-any` and `prefer-const`). Confirmed pre-existing via `git stash` + lint. Out of scope per CLAUDE.md "avoid retry loops".

## Next Phase Readiness

- Phase 22 Plans 1, 2, 3 (code portions), and 4 (code portions) complete. All 4 merit-path functions now emit `usage_tracking` rows and AnalysisHistory resolves per-feature IDs for routing.
- **Plan 22-05 dependency satisfied**: `findIdForEntry` + `getEntryRoute` produce deterministic `?id=<uuid>` routes for LinkedIn Grader / Career Compass / Recruiting Lens / Interview Prep pages, so PLAN-05 can implement `?id=` hydration on those pages knowing the History page will route with a consistent contract.
- Task 3 operator checkpoint remains pending for production verification.

---
*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Plan: 04*
*Completed (code): 2026-04-20*
*Checkpoint (operator): PENDING*

## Self-Check: PASSED

**Files verified present:**
- `.planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-04-SUMMARY.md` — FOUND
- `supabase/functions/grade-linkedin/index.ts` — FOUND
- `supabase/functions/analyze-career/index.ts` — FOUND
- `supabase/functions/recruiting-lens/index.ts` — FOUND
- `supabase/functions/interview-prep-analyze/index.ts` — FOUND
- `src/pages/AnalysisHistory.tsx` — FOUND

**Commits verified in git log:**
- `dbe70d1` — feat(22-04): record_ai_usage on merit path for 4 edge functions — FOUND
- `c21a930` — feat(22-04): generalize History proximity matcher + per-feature routing — FOUND

Task 3 (human-verify checkpoint) remains outstanding — operator deployment + 7 verification scenarios pending.
