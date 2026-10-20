---
phase: 36-history-persistence-parity-audit-repair
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - scripts/run-edge-tests.ps1
  - src/pages/AnalysisHistory.tsx
  - src/pages/InterviewPrep.tsx
  - src/pages/__tests__/AnalysisHistory.analysis-id.test.tsx
  - src/pages/__tests__/InterviewPrep.hydration.test.tsx
  - supabase/functions/_shared/__tests__/history-persistence-remote.ts
  - supabase/functions/_shared/usage-checker.test.ts
  - supabase/functions/_shared/usage-checker.ts
  - supabase/functions/analyze-career/__tests__/history-persistence.test.ts
  - supabase/functions/analyze-career/history-persistence.test.ts
  - supabase/functions/analyze-career/index.ts
  - supabase/functions/analyze-resume/__tests__/history-persistence.test.ts
  - supabase/functions/analyze-resume/history-persistence.test.ts
  - supabase/functions/analyze-resume/index.ts
  - supabase/functions/grade-linkedin/__tests__/history-persistence.test.ts
  - supabase/functions/grade-linkedin/history-persistence.test.ts
  - supabase/functions/grade-linkedin/index.ts
  - supabase/functions/interview-prep-analyze/__tests__/history-persistence.test.ts
  - supabase/functions/interview-prep-analyze/history-persistence.test.ts
  - supabase/functions/interview-prep-analyze/index.ts
  - supabase/functions/process-recruiting-lens-job/__tests__/worker-contract.test.ts
  - supabase/functions/process-recruiting-lens-job/index.ts
  - supabase/functions/recruiting-lens/__tests__/history-persistence.test.ts
  - supabase/functions/recruiting-lens/history-persistence.test.ts
  - supabase/functions/recruiting-lens/index.ts
  - supabase/functions/send-strivo-email/index.ts
findings:
  critical: 1
  warning: 6
  info: 2
  total: 9
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-05-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 36 splits the usage helper into `checkEntitlement` (read-only) plus `recordUsageWithAnalysis` (post-success ledger write linked to a durable row id), and reorders every feature edge function to persist its durable result row FIRST and only then record usage. The core contract — "a failed analysis leaves NO `usage_tracking` row" and "usage rows carry the correct `analysis_id` per feature" — is implemented correctly across all five features (resume, career, LinkedIn, recruiting-lens, interview-prep), and the cache-hit path writes a credits=0 linked row via `withMerits`. `analysis_id` linkage is consistent with the resolver in `AnalysisHistory.tsx` for all action types.

However, the review surfaced one Critical defect in the recruiting-lens async-overload worker repair (the worker re-invocation cannot authenticate against the target function), several Warnings around stale/unexecuted contract tests that have drifted from source, a dead bespoke-error mapping in the Interview Prep page, and a partial-write inconsistency window in interview-prep persistence.

## Critical Issues

### CR-01: Recruiting Lens async-overload worker re-invocation always fails auth (worker repair is broken)

**File:** `supabase/functions/recruiting-lens/index.ts:481`, `supabase/functions/process-recruiting-lens-job/index.ts:161-170`
**Issue:** The recruiting-lens function authenticates ONLY with `requireAuth(req, { type: 'user' })` (line 481). The overload async fallback (lines 650-682) enqueues an `analysis_jobs` row, and `process-recruiting-lens-job` re-invokes recruiting-lens with `Authorization: Bearer ${SERVICE_ROLE_KEY}` plus `x-internal-job-secret` (lines 161-170). Because recruiting-lens does not accept internal auth, `requireUserAuth` runs `supabase.auth.getUser(serviceRoleKey)` — the service-role key is not a user JWT, so `getUser` returns no user and throws `401 Unauthorized`. In the worker, `401` is not in `isRetryableHttpStatus` and `responseBody.retryable` is false, so the job is immediately marked `failed`. The fallback can therefore never complete: every queued Recruiting Lens job dies on the first attempt. Additionally, the fallback job is enqueued WITHOUT `merit_transaction_id`, so `refundIfNeeded` logs `pre_migration_null_txid` and skips the refund — a user whose Recruiting Lens overflowed to the queue loses the run with no refund and no history row.

Note this fallback block lives in the legacy (`!MERIT_SYSTEM_ENABLED`) branch, so it is dead while the merit flag is on. It is in scope because the "recruiting-lens async worker repair" was an explicit phase goal, and it is a live defect the moment the flag is toggled or the worker is exercised for backlog drain.

**Fix:** Make recruiting-lens accept internal auth on the worker path, mirroring `analyze-resume`:
```ts
// recruiting-lens/index.ts
import { requireInternalOrUserAuth } from '../_shared/auth.ts';
// ...
const userContext = await requireInternalOrUserAuth(req);
// then derive userId from body when userContext is null (worker path),
// and ensure corsHeaders/extraHeaders include 'x-internal-job-secret'.
```
And carry `merit_transaction_id` onto the enqueued `analysis_jobs` row so `refundIfNeeded` can refund on terminal failure. If the async fallback is intended to be permanently dead under the merit system, delete it outright rather than leaving a non-functional path.

## Warnings

### WR-01: grade-linkedin static contract test asserts strings that no longer exist in source

**File:** `supabase/functions/grade-linkedin/history-persistence.test.ts:5-8`
**Issue:** This source-text test asserts `source.includes("Promise<{ response: Response; recordId: string }>")` and `source.includes("return { response, recordId: record.id };")`. The actual `storeAndNotify` signature in `grade-linkedin/index.ts:433` is `Promise<{ response: Response; recordId: string; analysisId: string | null }>` and it returns `return { response, recordId: record.id, analysisId };`. Both assertions would FAIL if the test ran. It does not fail CI only because `run-edge-tests.ps1` wires the `__tests__/history-persistence.test.ts` (remote) files but NOT these root-level `*/history-persistence.test.ts` static-contract files. The test is both stale and unexecuted — false confidence.
**Fix:** Either update the assertions to match the current signature/return, or remove these orphaned root-level static tests and rely on the wired `__tests__/` suite. If they are meant to run, add them to `scripts/run-edge-tests.ps1`.

### WR-02: Root-level `*/history-persistence.test.ts` static tests are never executed by the runner

**File:** `scripts/run-edge-tests.ps1:27-86`, `supabase/functions/analyze-resume/history-persistence.test.ts`, `analyze-career/history-persistence.test.ts`, `grade-linkedin/history-persistence.test.ts`, `interview-prep-analyze/history-persistence.test.ts`, `recruiting-lens/history-persistence.test.ts`
**Issue:** Five root-level source-contract tests exist (e.g. `analyze-resume/history-persistence.test.ts`) but none are listed in `$baseTests` nor in the remote block. Only the `__tests__/history-persistence.test.ts` integration tests are wired. These static tests are the only checks that would catch source-level regressions (e.g. WR-01) without staging credentials, yet they run only via ad-hoc `deno test` invocations that the phase SUMMARY notes were "BLOCKED by Deno 2.7.1 Windows runtime panic" — i.e. they have never been observed to pass. The post-success-only contract is thus effectively unverified in any automated, regularly-run suite (the remote suite is opt-in via `DENO_TEST_SUPABASE_REMOTE=1`).
**Fix:** Add the five root-level static tests to the `$baseTests` array in `run-edge-tests.ps1` so they run locally on every invocation, and resolve the Windows Deno runner issue (or run them in CI on Linux).

### WR-03: Interview Prep bespoke gate-error mapping is dead — gate codes never reach the UI

**File:** `src/pages/InterviewPrep.tsx:471-489`, `src/hooks/useAnalysisGuard.ts:25-33`
**Issue:** `handleGenerate` reads `const serverData = (result as { data?: unknown }).data ?? null;` and passes it to `mapBespokeGateError`. But `useAnalysisGuard.startAnalysis` returns `{ success: false, error: error.message }` on failure — it never sets `data`, and it discards the thrown error's `serverData` field (which `handleGenerate` deliberately attached via `Object.assign(new Error(...), { serverData: resp })`). Therefore `serverData` is always `null` on the error path, `mapBespokeGateError` always returns `null`, and the three bespoke gate codes (`no_resume`, `daily_cap`, `monthly_taste_used`) never map to their UI-SPEC §13.4 copy (`COPY.noResume`, `COPY.dailyCap`, `COPY.monthlyTasteUsed`). Every failure instead routes through the generic `getMeritErrorMessage(status)` taxonomy. This breaks the documented T-23-FE-03 contract and degrades the daily-cap / monthly-quota / no-resume UX.
**Fix:** Propagate the server payload through the guard. Either have `startAnalysis` return the caught error's attached data (`return { success: false, error: error.message, data: error.serverData }`), or stop routing the bespoke check through `result.data` and instead parse the gate code out of the thrown error in `handleGenerate` directly.

### WR-04: interview-prep persists quiz row, answers, and streak BEFORE the usage write — partial-write window

**File:** `supabase/functions/interview-prep-analyze/index.ts:499-607`
**Issue:** The persistence sequence is: insert `interview_quizzes` (499) → insert `interview_quiz_answers` (533) → upsert `interview_streaks` increment (577) → `recordUsageWithAnalysis` (603). If `recordUsageWithAnalysis` fails, it throws `MeritRefundable(500)` which refunds merits — but the quiz row, answer rows, and the incremented streak are already committed and are NOT rolled back. Result: the user gets a durable quiz (reachable by direct `?id=` nav and counting toward the elite daily cap / streak) with refunded merits and NO history row. The post-success-only contract ("no usage row on failure") is honored, but the inverse failure mode produces an inconsistent state (durable artifact + streak bump + refund, no ledger row).
**Fix:** Treat a `recordUsageWithAnalysis` failure as non-fatal for interview-prep (log + warn, return the response) the same way the worker treats applications auto-create as non-fatal — the quiz is already durable and the merit was charged. Alternatively, record usage before the streak increment so a usage failure does not leave a streak bump. Document the chosen ordering as intentional.

### WR-05: Recruiting Lens overload fallback enqueues job without `merit_transaction_id`

**File:** `supabase/functions/recruiting-lens/index.ts:655-668`
**Issue:** The async fallback `insert` into `analysis_jobs` (legacy path) omits `merit_transaction_id`. `process-recruiting-lens-job:refundIfNeeded` (lines 79-83) explicitly bails out with a `pre_migration_null_txid` warning when the txid is null, so any terminal failure of a queued job refunds nothing. Combined with CR-01 this guarantees lost runs with no refund. Even independent of CR-01, a job that exhausts retries will never refund.
**Fix:** Persist the merit transaction id onto the job payload/column at enqueue time and pass it through, so the worker can refund on `retry_exhausted` / `non_retryable_error`.

### WR-06: `send-strivo-email` recruiting_lens path can render `undefined/100` when score is missing

**File:** `supabase/functions/process-recruiting-lens-job/index.ts:211`, `supabase/functions/send-strivo-email/index.ts:327-335`
**Issue:** The worker sends `score: responseBody.overallMatch?.score` (line 211), which is `undefined` when the merged result lacks `overallMatch`. In `send-strivo-email`, `buildEmail` renders the score block only when `score !== undefined`, so a missing score is handled — but the worker only reaches this branch when `responseBody.analysisId` is present, and `overallMatch.score` is not guaranteed to be present alongside it. The recruiting-lens response shape uses `overallMatch?.score` elsewhere with `?? 0` fallback (e.g. `persistRecruitingLensResult` line 69), so the email is the only consumer without a fallback. If `overallMatch` is partially merged, `score` could be a non-number, and `getScoreColor`/`getScoreLabel` would produce `BRAND.error` + "Room to grow" regardless. Low blast radius (email cosmetic) but inconsistent with the `?? 0` convention used at persistence.
**Fix:** Normalize the score in the worker before sending: `score: typeof responseBody.overallMatch?.score === 'number' ? responseBody.overallMatch.score : undefined` (so the block is omitted) and keep the persistence `?? 0` for the stored row, or pass a single consistent value.

## Info

### IN-01: `serializePreviousSuggestions` and resume cache helpers tolerate `any` heavily

**File:** `supabase/functions/analyze-resume/index.ts:117-125, 147-149`
**Issue:** Several helpers (`serializePreviousSuggestions`, `analysisIdFromCachedResult`, `persistResumeAnalysis`) operate on `any` and silently coalesce missing fields. This is consistent with the existing codebase style and not a correctness bug, but the `key_insights` derivation `suggestions.slice(0, 3).map((s: any) => s.title || s.text || '')` will produce `['', '', '']`-style empty insights if suggestions are malformed rather than dropping them before `.filter(Boolean)` (it does filter, so fine). No action required; noting the `any` surface for future typing.

### IN-02: Career legacy multi-role sub-path returns before any usage write (intentional, undocumented)

**File:** `supabase/functions/analyze-career/index.ts:1186-1189`
**Issue:** In the legacy path, `handleMultiRoleComparison` returns before `persistCareerResultAndRecordUsage`, so multi-role comparisons never write a `usage_tracking` row or `analysis_results` row. This appears intentional (multi-role is a lightweight follow-up, not a primary analysis) and mirrors the merit-path multi-role sub-path which also skips persistence. Worth a one-line comment stating multi-role intentionally does not appear in Activity History so a future reader does not "fix" it.

---

_Reviewed: 2026-05-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
