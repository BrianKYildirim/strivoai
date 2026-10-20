---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
fixed_at: 2026-04-20T00:00:00Z
review_path: .planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-04-20T00:00:00Z
**Source review:** .planning/phases/22-linkedin-grader-ui-overhaul-cross-feature-memory-history/22-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (1 Critical, 7 Warning — Info skipped for this pass)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: InterviewPrep.handleStart is a UI-only mock but invalidates merit balance

**Files modified:** `src/pages/InterviewPrep.tsx`
**Commit:** e950af3
**Applied fix:** Took the lower-risk path per phase guidance — gated the legacy mock behind `import.meta.env.DEV` and removed the `invalidateMerits()` call. In production builds `handleStart` now surfaces a "not yet available" toast rather than silently showing canned `MOCK_RESULT` content. This preserves the mock for dev-time wiring while preventing misleading merit-refetches and the user-visible regression of canned results in prod. The wire-up to the real `interview-prep-analyze` edge function is deferred to a later phase where the form inputs (role, seniority, topics, resume) can be plumbed to the request body correctly.
**Verification:** Tier 1 (re-read). `handleStart` now returns early via the dev-mock branch or toasts `error` in prod. No syntax tool available that supports TSX without TypeScript project setup, so Tier 1 is authoritative here.

### WR-01: analyze-career `linkedin_prior_missing` 412 ignores fresh `linkedinPdfContent`

**Files modified:** `supabase/functions/analyze-career/index.ts`
**Commit:** d01f587
**Applied fix:** Added `hasFreshLinkedin = typeof linkedinPdfContent === 'string' && linkedinPdfContent.trim().length > 0` check and appended `&& !hasFreshLinkedin` to the D-16 412 gate condition. Pro/Elite users who upload a fresh LinkedIn PDF alongside a prior resume analysis now pass through to the parallel fan-out path directly, instead of being routed through the "resume-only" fallback dialog. `linkedinPdfContent` is already destructured from `requestBody` above (line 480), so no new body parsing was needed.
**Verification:** Tier 1 (re-read). Condition reads cleanly and uses the same destructured `linkedinPdfContent` already consumed by downstream branches at lines 781 and 1059. Deno type-checking is deferred to deploy.

### WR-02: interview-prep-analyze records usage before quiz persistence can fail

**Files modified:** `supabase/functions/interview-prep-analyze/index.ts`
**Commit:** c1f4e3a
**Applied fix:** Extracted the `record_ai_usage` call into a local `recordMeritUsage()` helper and moved the invocation to each branch's success point: (1) Elite path — after the `interview_quizzes` insert completes and after `interview_quiz_answers` insert (answers failure is non-blocking and does not invalidate usage), before the streak upsert. (2) Pro path — immediately before the `flashcards-generated` log, after persistence attempts but before the success response. A `MeritRefundable` throw from the quiz insert now refunds the merit AND does not fire `record_ai_usage`, keeping the audit row and the merit deduction in lockstep.
**Status:** fixed: requires human verification — Elite/Pro branching is logic-heavy, worth manually confirming both success and failure paths behave as expected in staging.
**Verification:** Tier 1 (re-read). Helper is declared before the `isElite` branch so both branches have access; both call sites show `await recordMeritUsage()` at the intended step.

### WR-03: grade-linkedin flips free-scan flag before audit insert

**Files modified:** `supabase/functions/grade-linkedin/index.ts`
**Commit:** aa10e6e
**Applied fix:** Reordered the free-scan path to (1) `storeAndNotify` (persist `linkedin_grades` row + fire email), (2) `record_ai_usage` (zero-credit audit row), (3) flip `free_linkedin_scan_used = true`. The flag flip is now the final success-side effect. If AI succeeds but `storeAndNotify` fails upstream of return, the user's free-scan carve-out is preserved. The response from `storeAndNotify` is captured and returned at the end so CORS headers and status code are identical to before.
**Status:** fixed: requires human verification — reordering side-effects on a payment-adjacent flow is worth confirming on staging with the free-scan entitlement flag forced false.
**Verification:** Tier 1 (re-read). Confirmed response is returned AFTER all three side-effects; `storeAndNotify` result is preserved in `response`. No behavioral change for the paid (`withMerits`) branch — that path was not touched.

### WR-04: Results.tsx 90-second stream-stuck safeguard performs setState without mounted guard

**Files modified:** `src/pages/Results.tsx`
**Commit:** 50b50e9
**Applied fix:** Added `let cancelled = false;` and `if (cancelled) return;` guard after the `supabase.from('resumes')` await. Cleanup returns `() => { cancelled = true; clearTimeout(timer); }` matching the pattern used in the other async effects in this file.
**Verification:** Tier 1 (re-read). Pattern now consistent with surrounding effects.

### WR-05: CareerCompass / LinkedInGrader `?id=` hydration races the mount-time init effect

**Files modified:** `src/pages/CareerCompass.tsx`, `src/pages/LinkedInGrader.tsx`
**Commit:** 46ed6f3
**Applied fix:** Per phase guidance, short-circuited the mount initializer rather than rewriting the pages. Both mount effects now read `?id=` directly from `window.location.search` (staying inside the `[navigate]` dep array and avoiding a re-run loop) and compute `skipCacheRestore = !!urlIdForMount`. When true: (a) `CareerCompass` skips the `analysis_results` fetch in the parallel `Promise.all` by substituting `Promise.resolve({ data: null })`, and also guards the cache-restore setState behind `!skipCacheRestore`; (b) `LinkedInGrader` returns from the init function immediately after resolving `subscription_tier`, leaving `result`/`entitlementState`/`showInput` to the `?id=` effect. Additionally, the `LinkedInGrader` `?id=` branch now sets `setEntitlementState('will-use-credit')` after successful hydration so the helper text does not hang on "Checking eligibility…" while a grade is rendered.
**Verification:** Tier 1 (re-read). Mount effect keeps the `[navigate]` dep; `?id=` effect keeps the `[idFromUrl]` dep. No new dep cycles introduced.

### WR-06: `?id=` hydration casts DB JSON to typed shapes without runtime validation

**Files modified:** `src/pages/CareerCompass.tsx`, `src/pages/InterviewPrep.tsx`, `src/pages/RecruitingLens.tsx`
**Commit:** 90447b3
**Applied fix:** Added minimal hand-rolled structural guards per page (Zod would have been overkill for a few top-level keys). Each guard checks the required top-level keys for its page's result type and, on failure, logs a `console.error` with the row id and surfaces a `toast.error("Couldn't load this analysis")`, then returns early — falling through to the default view. Checks:
- CareerCompass: `careerFields`/`roles`/`roadmap` arrays + `careerDNA` string.
- InterviewPrep: `id`/`mode`/`job_description`/`created_at` strings on the quiz row.
- RecruitingLens: `preAnalysis`/`overallMatch`/`subScores` objects + `recruiterVerdict` string.
**Verification:** Tier 1 (re-read). Each guard runs before the `setResult` / `setPastQuiz` / `setAnalysis` call on its page.

### WR-07: RecruitingLens mount useEffect has empty dep array despite closure over `navigate` and `getEffectiveTier`

**Files modified:** `src/pages/RecruitingLens.tsx`
**Commit:** 578ad52
**Applied fix:** Changed the dep array from `[]` to `[navigate, getEffectiveTier]`. A comment explains that AdminTierTest tier flips will now re-run `init`, preventing stale tier decisions captured on first render.
**Verification:** Tier 1 (re-read). Both deps are referenced inside `init`; `react-hooks/exhaustive-deps` rule should now pass.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-04-20T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
