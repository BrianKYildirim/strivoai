---
phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/components/career-compass/types.ts
  - src/pages/AnalysisHistory.tsx
  - src/pages/CareerCompass.tsx
  - src/pages/InterviewPrep.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/Results.tsx
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/grade-linkedin/index.ts
  - supabase/functions/interview-prep-analyze/index.ts
  - supabase/functions/recruiting-lens/index.ts
  - supabase/functions/submit-career-analysis-job/index.ts
findings:
  critical: 1
  warning: 7
  info: 5
  total: 13
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-04-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 22 ships LinkedIn Grader UI gating, cross-feature memory (Career Compass reusing prior LinkedIn grade), AnalysisHistory per-feature routing with `?id=` deep-links, hydration on four feature pages, and `record_ai_usage` on the merit path for four edge functions. The cross-feature memory flow and the 412 gating in `analyze-career` are well-structured and correctly placed *before* `withMerits` so there is no merit deduction on a gate rejection. The per-feature routing in `AnalysisHistory` is defensive about missing feature rows and degrades gracefully.

The most serious finding is that `InterviewPrep.handleStart` is still a local UI mock that calls `invalidateMerits()` even though no backend call or merit deduction occurs — this is a user-facing correctness regression on a production page. Several medium-severity issues cluster around (a) `record_ai_usage` ordering relative to state mutations that can partially fail, (b) a 412 gate that does not account for a fresh LinkedIn PDF already present in the request body, (c) hydration effects that race the page's mount-time initialization effect without coordination, and (d) casting DB `raw_response`/`grading_data` payloads to typed shapes without runtime validation on the `?id=` path.

## Critical Issues

### CR-01: InterviewPrep.handleStart is a UI-only mock but invalidates merit balance

**File:** `src/pages/InterviewPrep.tsx:244-257`
**Issue:** `handleStart` still runs the legacy mock path — `await new Promise((r) => setTimeout(r, 900)); setResult(MOCK_RESULT); invalidateMerits();` — it does not call `supabase.functions.invoke('interview-prep-analyze', …)`, so no merit is actually spent, no quiz row is persisted, and the user is shown `MOCK_RESULT` (fixed canned content) as if it were a real analysis. Calling `invalidateMerits()` on a no-op path is misleading: the cache is refetched and shows the balance unchanged, which can mask the fact that nothing happened and also confuse users who have usage budgets. The edge function (`interview-prep-analyze`) is fully wired with `withMerits`, validation, and `record_ai_usage`, so the regression is purely on the client submit.
**Fix:** Replace the mock body of `handleStart` with a real invocation, hoist merit/tier gates, and only invalidate on success:
```ts
const { data, error } = await supabase.functions.invoke('interview-prep-analyze', {
  body: { role: roleTitle, seniority, questionCount, topics, resumeText },
});
if (error) {
  toast.error(error.message ?? 'Interview prep failed.');
  return;
}
setResult(data as InterviewPrepResult);
invalidateMerits();
```
If the real call path is blocked on other phase work, gate the mock behind a dev-only flag and do **not** call `invalidateMerits()` on the mock branch.

## Warnings

### WR-01: analyze-career `linkedin_prior_missing` 412 ignores fresh `linkedinPdfContent` in request body

**File:** `supabase/functions/analyze-career/index.ts:578-596`
**Issue:** The Pro/Elite 412 fires whenever `reusedResume === true && reusedLinkedinGrade === false && !allowResumeOnly`. The gate only inspects prior `linkedin_grades` rows; it does not check `body.linkedinPdfContent`. A Pro/Elite user who uploads a fresh LinkedIn PDF in the Career Compass form — which the downstream parallel fan-out branch is perfectly capable of processing — is rejected with `linkedin_prior_missing`, forcing them through the D-16 "resume-only" dialog or a detour to grade their LinkedIn first. This is a correctness + UX bug that affects the common "I have a past resume analysis, now I'm uploading a new LinkedIn" case.
**Fix:** Short-circuit the 412 when the body contains a usable LinkedIn payload:
```ts
const hasFreshLinkedin = typeof body.linkedinPdfContent === 'string' && body.linkedinPdfContent.trim().length > 0;
if (reusedResume && !reusedLinkedinGrade && !allowResumeOnly && !hasFreshLinkedin) {
  return jsonResponse(412, { error: 'linkedin_prior_missing', ... });
}
```

### WR-02: interview-prep-analyze records usage before quiz persistence can fail

**File:** `supabase/functions/interview-prep-analyze/index.ts:312-320` (and insert at lines 333-368)
**Issue:** On the Elite path, `record_ai_usage` is invoked immediately after model validation, *before* the `interview_quizzes` insert + `interview_quiz_answers` insert. If either insert throws (including via `MeritRefundable` → 500), `withMerits` will refund the merit deduction, but the `usage_tracking` row written by `record_ai_usage` remains. The audit log then shows a successful interview_prep usage that produced no quiz row, which breaks `AnalysisHistory` matching (no sibling feature row within ±5min for the timestamp) and inflates AI-usage analytics.
**Fix:** Move the `record_ai_usage` call to *after* the Elite quiz+answers persistence step, co-located with the success response path. For free/pro (no persistence), keep the existing placement — but gate it on action outcome being "ok".

### WR-03: grade-linkedin flips free-scan flag before audit insert

**File:** `supabase/functions/grade-linkedin/index.ts:305-331`
**Issue:** Free-tier scan path updates `profiles.free_linkedin_scan_used = true` *before* calling `record_ai_usage`. If the flag update succeeds and the `record_ai_usage` RPC (or any subsequent step in the same block) fails, the user loses their one free scan with no audit row and no resulting grade visible in History. The inverse ordering (audit first, flag second) is only marginally better, but the correct pattern is to wrap both in the DB transaction that also persists the grade, or to treat the flag flip as the final success-side effect (after the grade row is committed and audit is written).
**Fix:** Sequence as: (1) persist `linkedin_grades` row, (2) `record_ai_usage`, (3) flip `free_linkedin_scan_used`. On any failure in step 1 or 2, do not flip the flag. If a transaction wrapper is not feasible with the current RPC, add a single reconciliation query at start ("if flag is true but no grade exists in the last N minutes, allow the scan") as a safety net.

### WR-04: Results.tsx 90-second stream-stuck safeguard performs setState without mounted guard

**File:** `src/pages/Results.tsx:270-286`
**Issue:** The 90-second safeguard timer fires `supabase.from('analyses').select(...)` and then `setAnalysis(...)` / `setLoading(false)` without checking a mounted flag or an `AbortController`. If the user navigates away between the DB round-trip and the `await` resolving, React logs a setState-on-unmounted-component warning and a stale result may be pushed into a freshly mounted instance if the same page is re-entered quickly. Every other async effect in the file uses a `cancelled` flag; this one should match the pattern.
**Fix:**
```ts
let cancelled = false;
const timer = setTimeout(async () => {
  const { data } = await supabase.from('analyses').select(...).single();
  if (cancelled) return;
  if (data) { setAnalysis(data); setLoading(false); }
}, 90_000);
return () => { cancelled = true; clearTimeout(timer); };
```

### WR-05: CareerCompass and LinkedInGrader `?id=` hydration races the mount-time init effect

**File:** `src/pages/CareerCompass.tsx:162-273`, `src/pages/LinkedInGrader.tsx:158-288`
**Issue:** Both pages have two independent `useEffect`s that can write to the same state slice:
1. A mount-time initializer that loads cached result from `sessionStorage` / most-recent row and sets `entitlementState` + `analysis` / `grade`.
2. A `?id=`-watching hydration effect that fetches the specific row and sets `analysis` / `hydrated`.
They use their own `cancelled` flags but do not coordinate. If the mount effect resolves *after* the `?id=` hydration effect (e.g. when sessionStorage read is slow or a network fetch intervenes), the URL-pinned analysis is overwritten by the most-recent one. On LinkedInGrader the `?id=` branch also does not set `entitlementState`, so helper text can remain "Checking eligibility…" while a grade is already rendered.
**Fix:** Make the `?id=` branch authoritative: when a valid UUID is present in the URL, short-circuit the mount initializer (early-return before cache restore / most-recent fetch), and explicitly set `entitlementState` to the appropriate value after successful hydration so dependent UI is in sync. Alternatively, merge both effects into a single effect keyed on `[idFromUrl, userId]`.

### WR-06: `?id=` hydration casts DB JSON to typed shapes without runtime validation

**Files:**
- `src/pages/CareerCompass.tsx:249-273` — `data.raw_response as AnalysisResult`
- `src/pages/InterviewPrep.tsx:210-234` — `setPastQuiz({ quiz, answers: answers ?? [] })` with no schema check
- `src/pages/RecruitingLens.tsx:315-339` — cast of persisted row to typed result

**Issue:** On all three hydration paths the JSON loaded from Postgres is coerced directly to the TypeScript result type. Any schema drift (old rows missing new fields added this phase, e.g. `reusedLinkedinGrade`, `linkedinGradeDate`), truncated JSON from historical queue failures, or column-type mismatches will surface as runtime render errors (accessing `.map` on `undefined`, missing nested keys) rather than a controlled fallback. This is a defense-in-depth gap — no SQL injection / security risk, but reliability of the History-driven deep-link flow depends on no row ever being malformed.
**Fix:** Add a minimal runtime guard per page — either a Zod schema (already a dep), or a hand-rolled `isAnalysisResult(x): x is AnalysisResult` that checks the two or three required top-level keys. On failure, toast "Couldn't load this analysis" and navigate back to the base route.

### WR-07: RecruitingLens mount useEffect has empty dep array despite closure over `navigate` and `getEffectiveTier`

**File:** `src/pages/RecruitingLens.tsx:306` (useEffect with `[]`)
**Issue:** The effect reads `navigate`, `getEffectiveTier()`, and other values from render scope but declares `[]`. If `getEffectiveTier` ever changes identity (e.g. AdminTierTest override flips), the effect will not re-run and the page will operate on a stale tier decision. ESLint react-hooks/exhaustive-deps would flag this (rule is enabled via `react-hooks.configs.recommended`). Because the closure is captured once on first render, the stale value can silently affect `?id=` hydration behavior for admins switching tiers mid-session.
**Fix:** Either add the real dependencies (`[navigate, getEffectiveTier]`) or, if the intent is strictly mount-once, extract the callback into a ref and update the ref in a secondary effect — but prefer the former.

## Info

### IN-01: UUID regex is lax across four hydration pages

**Files:** `src/pages/CareerCompass.tsx`, `src/pages/InterviewPrep.tsx`, `src/pages/LinkedInGrader.tsx`, `src/pages/RecruitingLens.tsx`
**Issue:** All four use `/^[0-9a-f-]{36}$/i` or equivalent to validate `?id=` UUIDs. This accepts `------------------------------------` and many other 36-char garbage strings that are not real UUIDs. Supabase will reject them at the query layer so there is no security impact, but error UX and log noise suffer.
**Fix:** Use a stricter pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, or extract a shared `isUuid` helper in `src/lib/`.

### IN-02: Naive `linkedin.com/in/` substring check

**File:** `src/pages/LinkedInGrader.tsx` (URL validation block)
**Issue:** Substring-match on `linkedin.com/in/` accepts `evil.com?x=linkedin.com/in/foo` and rejects valid national subdomains (`uk.linkedin.com/in/...`). Low risk since the value is only passed to the edge function (which performs its own validation), but the UX signal is imprecise.
**Fix:** Use `new URL(value)` inside a try/catch, then check `parsed.hostname.endsWith('linkedin.com')` and `parsed.pathname.startsWith('/in/')`.

### IN-03: `as any` casts in hydration paths bypass TS safety

**Files:** `src/pages/LinkedInGrader.tsx:158-188` (mutation of `hydrated.recordId`), `src/pages/CareerCompass.tsx` hydration cast
**Issue:** Several casts to `any` or `unknown as T` sidestep the strict-mode checking that the rest of the codebase relies on.
**Fix:** Introduce a narrow interface for the DB row (`LinkedinGradeRow`), select exactly those columns, and assemble the in-memory shape without `as any`.

### IN-04: sessionStorage cache restore without shape validation

**File:** `src/pages/RecruitingLens.tsx:233-240`
**Issue:** `JSON.parse(sessionStorage.getItem(...))` is coerced to the result type without guard. Corrupted entries (e.g. from a prior build with different shape) render as a broken view until the user clears storage.
**Fix:** Wrap in try/catch and run a minimal shape check; on failure, delete the key and fall through to the network path.

### IN-05: Silent catch on LinkedIn PDF upload in LinkedInGrader

**File:** `src/pages/LinkedInGrader.tsx` (handleLinkedinPdfUpload try/catch)
**Issue:** The catch swallows the error with only a toast and no `console.error`, which hampers debugging of production PDF-parsing regressions.
**Fix:** Add `console.error('[LinkedInGrader] pdf upload failed', err)` before the toast, matching the repo's logging convention.

---

_Reviewed: 2026-04-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
