---
phase: 05-deep-test-coverage-expansion
plan: 04
subsystem: testing
tags: [deno, deno-test, test:ci, pattern-A, pattern-B, source-read, handler-invocation, job-workers, submit-resume, submit-career, get-analysis-job-status, interview-prep-analyze, interview-prep-evaluate, internal-auth, ownership-check, question-order-join, characterization-test, actual-state, D-03a]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest+deno-offline+Playwright), deno.json test:ci allowlist, v4.0-baseline tag, grade-linkedin/handler-config.test.ts Pattern-A analog, process-*-job/refund-on-failure.test.ts Pattern-A worker analog, 05-SUSPECTED-BEHAVIOR.md D-08 register"
  - phase: 05-deep-test-coverage-expansion (plan 03)
    provides: "grown test:ci allowlist (638 passed|0 failed baseline), Pattern-A characterization-correctness discipline (assert ACTUAL wired helper; scope negative assertions past doc-comment substrings to avoid false REDs)"
provides:
  - "submit-resume-analysis-job + submit-career-analysis-job source-read contracts (Pattern A worker variant): requireAuth(type:user) identity, body.userId matched-not-trusted (403 mismatch guard), analysis_jobs enqueue (job_type + status:pending + 202 jobId), withMerits behind legacy MERIT_SYSTEM_ENABLED && userContext + MeritRefundable on insert failure, 401/500 terminal catch (7+8 cases)"
  - "get-analysis-job-status source-read contract (Pattern A worker variant, NEW): authenticateRequest(Bearer->getUser) + user-scoped job lookup (.eq user_id authenticatedUserId), no body.userId for authz, completed/failed/in-progress branches, pollAfterMs cadence, 404 not-found / 400 missing-jobId / 500 query-error (7 cases)"
  - "interview-prep-analyze TRUE Pattern-B handler(new Request(...)) failure branches: malformed JSON->400 invalid_input, bad intake (Zod)->400 invalid_input+issues[], missing auth+valid intake->500 internal_error (thrown 401 swallowed by catch), AI_FORCE_FAILURE inert offline (refund branch behind live-auth gate) (4 cases)"
  - "interview-prep-evaluate handler-config source-read (Pattern A, NEW; inline serve, NOT handler-invocable): requireAuth(type:user)+identity=userContext.userId, NO-merit (scoped past line-14 doc comment), ownership(.eq id+.eq user_id) PRECEDES canEvaluate tier gate (T-23-EVAL-03), widened canEvaluate (elite||pro+elite_taste), integer question_order join parseInt(question_id,10)->.eq question_order (T-23-EVAL-01), re-eval 409/invalid_mode 400, rate-limit+elite model/cap (9 cases)"
  - "D-03a satisfied: three colocated live-DB evaluate.* tests (answer-length, pro-elite-taste-access, question-order-join) confirmed offline-safe (ignore:!hasEnv -> skip) and registered on test:ci"
  - "deno test:ci grown 638 -> 673 passed | 0 failed | 11 ignored (+35 executed across 5 new files; the 3 colocated evaluate.* contribute 9 ignored offline)"
affects: [05-05, 05-07, dependency-hygiene, database-cleanup, performance-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern A worker variant (source-read with the slash-strip path-resolve `new URL('./index.ts', import.meta.url).pathname.replace(/^\\/([A-Z]:)/, \"$1\")`, std@0.224.0 to match the process-*-job refund analog): characterize an inline-serve worker's auth + queue + error-branch wiring as WIRED against index.ts; use the regex-segment-match technique to scope a positive/negative assertion to one branch (the mismatch-guard regex had to extend to `status: 403` because the lazy `[\\s\\S]*?\\}` stopped at the JSON.stringify({...}) brace before reaching the 403 — same care for the get-analysis-job-status `if (!job)` -> `status: 404` not-found block)"
    - "Pattern B exported-handler invocation (interview-prep-analyze ONLY): set IS_TEST=true + AI_TEST_MODE=true + synthetic SUPABASE_*/APP_URL placeholders BEFORE `await import('../index.ts')`, then `await handler(new Request(...))`; assert the ACTUAL status/body of each OFFLINE-reachable branch (verified by probe, never assumed)"
    - "Scope-the-negative-assertion past a doc comment (recurring lesson, 3rd occurrence): interview-prep-evaluate's line-14 `// NOTE: No import of withMerits or MERIT_SYSTEM_ENABLED.` makes the bare substrings present as PROSE; assert the ACTUAL wiring absence (no `merit-gateway.ts` import, no `withMerits(` call, no `if (MERIT_SYSTEM_ENABLED`) instead of a blanket !includes('withMerits') false RED (same class as 05-03 rawBody.userId-in-a-comment, 05-02 rawBody.tier-in-a-comment)"

key-files:
  created:
    - "supabase/functions/submit-resume-analysis-job/job-contract.test.ts"
    - "supabase/functions/submit-career-analysis-job/job-contract.test.ts"
    - "supabase/functions/get-analysis-job-status/job-contract.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/analyze.failure-branches.test.ts"
    - "supabase/functions/interview-prep-evaluate/handler-config.test.ts"
  modified:
    - "supabase/functions/deno.json"
    - ".planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md"

key-decisions:
  - "interview-prep-analyze's AI-failure REFUND branch is NOT reachable offline — proven by probe: requireAuth(type:user) calls a live supabase.auth.getUser(token) which (against a synthetic Bearer / placeholder URL) returns an invalid-token error and throws Response(401) BEFORE the withMerits/AI block. So AI_FORCE_FAILURE stays INERT; the test asserts that (500 internal_error, same as the auth-reject case) and explicitly defers the refund TAXONOMY to the sibling merit-refund.test.ts classifier coverage. Did NOT refactor the handler to make the branch reachable (zero-functional-change)."
  - "SB-05-04 pinned (minor->log, NOT escalated): interview-prep-analyze's terminal catch (index.ts:710) does NOT re-throw a thrown Response the way interview-prep-evaluate's catch does (index.ts:345 `if (err instanceof Response) return err;`). requireAuth throws a Response(401); interview-prep-analyze swallows it into a 500 internal_error, while interview-prep-evaluate surfaces the 401. Pinned via the TRUE handler-invocation test. Not a security hole (auth still FIRES and blocks; only the surfaced status over-reports as 500). IP is gated off prod, so no live client hits it. A future /gsd-debug could align the catch; that's a behavior change, out of v4.0 scope."
  - "interview-prep-evaluate NO-merit assertion scoped past the line-14 documentation comment (`// NOTE: No import of withMerits or MERIT_SYSTEM_ENABLED.`) — asserted the absent merit-gateway import + absent withMerits( call + absent `if (MERIT_SYSTEM_ENABLED` branch instead of a blanket !includes('withMerits') that the comment would false-RED. Third occurrence of the doc-comment-substring lesson (05-02 rawBody.tier, 05-03 rawBody.userId)."
  - "All three colocated evaluate.* tests are live-DB integration tests that skip via `ignore: !hasEnv` offline (confirmed in isolation: each exits 0 with 3 ignored). Two of them `import { createClient } from 'npm:@supabase/supabase-js@2'` only at top level but construct the client INSIDE the env-gated path, so the import alone needs no live DB — confirmed empirically before registering. None judged live-only; all three registered on test:ci (D-03a fully satisfied, nothing dropped)."
  - "No worker or interview-prep-evaluate refactored to export a handler (honored the testability matrix exactly). interview-prep-analyze was already handler-invocable at baseline — used as-is. All five targeted index.ts byte-identical vs v4.0-baseline."

requirements-completed: [TEST-03, TEST-05]

# Metrics
duration: 16min
completed: 2026-06-19
---

# Phase 05 Plan 04: Async Workers + Interview-Prep Handler Coverage Summary

**Covered the three async job workers (submit-resume / submit-career / get-analysis-job-status — inline-serve, NOT handler-invocable) via Pattern-A source-read of their ACTUAL internal-auth + analysis_jobs queue + error-branch contracts; deepened `interview-prep-analyze` — the ONLY function with an exported handler + IS_TEST-guarded serve — via TRUE Pattern-B `handler(new Request(...))` invocation of its OFFLINE-reachable failure branches (malformed JSON / bad-intake Zod / auth-reject); and closed the D-03 gap on `interview-prep-evaluate` (inline serve) with a Pattern-A handler-config source-read of its auth/ownership/tier-gate/question_order-join wiring PLUS harvesting its three offline-safe colocated `evaluate.*` tests onto the gate — growing the offline gate 638 -> 673 passed | 0 failed with zero product-source change.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

### Task 1 — submit/status job-worker source-read contracts (Pattern A worker variant, +22)
- `submit-resume-analysis-job/job-contract.test.ts` (7) — asserts `requireAuth(req, { type: 'user' })` (the ACTUAL helper; these workers do NOT use `requireInternalOrUserAuth` despite the plan's hint), identity from `authenticatedUserCtx.userId` + `user_id: authenticatedUserId` on the insert, the `if (userId && authenticatedUserId !== userId)` 403 mismatch guard (body.userId MATCHED-not-trusted, T-05-07), the `analysis_jobs` enqueue (`job_type: "resume_analysis"` + `status: "pending"` + 202 `jobId`), the legacy `if (MERIT_SYSTEM_ENABLED && authenticatedUserCtx)` gate + `withMerits` + `throw new MeritRefundable` on insert failure, and the 401/500 terminal catch.
- `submit-career-analysis-job/job-contract.test.ts` (8) — same contract for `job_type: "career_compass_analysis"` + the `'career_compass'` merit key + the `authenticatedUserCtxCareer.userId` identity.
- `get-analysis-job-status/job-contract.test.ts` (7) — asserts the local `authenticateRequest(Bearer -> supabase.auth.getUser(token))`, the user-scoped lookup `.eq("user_id", authenticatedUserId)` (cross-user disclosure defense), NO `body.userId` for authz, the `.from("analysis_jobs").eq("id", jobId)` read, the completed (`result: jobResult`) / failed (`isInfrastructureFailure`) / in-progress (`pollAfterMs` 1500-vs-2500) branches, and 404 not-found / 400 missing-jobId / 500 query-error.

### Task 2 — interview-prep-analyze TRUE handler-invocation failure branches (Pattern B, +4)
- `interview-prep-analyze/__tests__/analyze.failure-branches.test.ts` — sets `IS_TEST`/`AI_TEST_MODE` + synthetic `SUPABASE_*`/`APP_URL` BEFORE `await import("../index.ts")`, then invokes `handler(new Request(...))` for each OFFLINE-reachable branch. **Characterized statuses/bodies (probed, not assumed):**
  - **malformed JSON body** -> `400 { error: 'invalid_input', message: 'Invalid JSON body.' }`
  - **bad intake (Zod safeParse fail)** -> `400 { error: 'invalid_input', message: 'Intake form validation failed', issues: [{path, message}, ...] }`
  - **valid intake, missing Authorization** -> `500 { error: 'internal_error' }` (the auth gate FIRES — requireAuth throws Response(401) — but the catch swallows it; **SB-05-04**)
  - **valid intake + `AI_FORCE_FAILURE=true`** -> still `500 internal_error` (auth-gated before the AI call, so the flag is INERT offline; refund taxonomy lives in the sibling `merit-refund.test.ts`)
- Confirmed NO duplication: the existing `analyze.truncated-json-repair.test.ts` exercises `parseAiResponse` only (no handler call) and `merit-refund.test.ts` exercises the refund classifier directly (no handler call) — neither invokes `handler(new Request(...))`.

### Task 3 — interview-prep-evaluate Pattern A coverage + colocated harvest (D-03a, +9 executed / +9 ignored)
- `interview-prep-evaluate/handler-config.test.ts` (9) — Pattern A source-read (slash-strip + std@0.168.0 to match the grade-linkedin analog) asserting: `requireAuth(req, { type: 'user' })` + identity `const userId = userContext.userId` (no `body.userId`/`body['userId']`), **NO-merit** (scoped past the line-14 doc comment to the absent merit-gateway import / `withMerits(` call / `if (MERIT_SYSTEM_ENABLED` branch, D-14), the ownership lookup `.from('interview_quizzes').eq('id', quizId).eq('user_id', userId)` PRECEDING the tier gate (`not_found` index < `canEvaluate` index — T-23-EVAL-03 no cross-user leak), the widened `canEvaluate = elite || (pro && quiz.tier === 'elite_taste')`, the INTEGER `parseInt(scoreEntry.question_id, 10)` -> `.eq('question_order', questionOrder)` join (T-23-EVAL-01, not free-text), the `already_evaluated` 409 / `quiz.mode !== 'quiz'` `invalid_mode` 400 guards, and the `'interview-prep-evaluate'` rate-limit key + `getModel('elite','interview')` / `getMaxOutput('interviewPrepCoach','elite')`.
- **Part 1 — confirm-and-register the three colocated evaluate.* tests:** ran each in isolation offline; all three exit 0 by gracefully SKIPPING via `ignore: !hasEnv` (3 ignored each). All three registered on `test:ci` — none judged live-only, nothing dropped (D-03a fully satisfied).

- **Gate:** all five new files registered on `test:ci` in the SAME change as their creation (per-task); full gate 638 -> 660 -> 664 -> 673 passed | 0 failed | 11 ignored. The two `process-*-job/refund-on-failure.test.ts` suites (from 05-01) remain green. `verify:baseline` green (vitest passed, deno 673/0, Playwright 5 passed + 1 quarantine-skip).

## ACTUAL-State Characterization Matrix

| Function | invocability | auth (ACTUAL) | body.userId role | merit wiring | key contract pinned | cases |
|----------|--------------|---------------|------------------|--------------|---------------------|-------|
| `submit-resume-analysis-job` | inline serve (source-read) | `requireAuth(type:user)` | matched-not-trusted (403 mismatch) | legacy `MERIT_SYSTEM_ENABLED && userContext` + `withMerits('resume_analysis')` + MeritRefundable | analysis_jobs enqueue `pending`/202 | 7 |
| `submit-career-analysis-job` | inline serve (source-read) | `requireAuth(type:user)` | matched-not-trusted (403 mismatch) | legacy gate + `withMerits('career_compass')` + MeritRefundable | analysis_jobs enqueue `pending`/202 | 8 |
| `get-analysis-job-status` | inline serve (source-read) | local `authenticateRequest` (getUser) | NOT used for authz | NONE | user-scoped lookup; completed/failed/in-progress; 404/400/500 | 7 |
| `interview-prep-analyze` | **exported handler (Pattern B)** | `requireAuth(type:user)` | n/a (intake schema) | `withMerits('interview_prep')` (unreachable offline) | 400 invalid_input (x2) + 500 (auth-swallow, SB-05-04) | 4 |
| `interview-prep-evaluate` | inline serve (source-read) | `requireAuth(type:user)` | NOT used for authz | **NONE** (D-14, 0-Merit) | ownership-before-tier-gate; canEvaluate; integer question_order join | 9 |

## Deviations from Plan

The plan executed substantially as written. Three authoring care-points (handled inline, not scope deviations) and one genuine reachability finding:

1. **Worker auth helper differs from the plan's hint.** The plan's `key_links`/threat-model referenced `requireInternalOrUserAuth` / `INTERNAL_JOB_SECRET` for the submit workers. ACTUAL: `submit-resume`/`submit-career` use `requireAuth(req, { type: 'user' })` (user-JWT), and `get-analysis-job-status` uses a LOCAL `authenticateRequest` (Bearer -> `supabase.auth.getUser`); `INTERNAL_JOB_SECRET` is used only to fire-and-forget TRIGGER the downstream `process-*-job` worker, not to auth the inbound request. Asserted the ACTUAL wired helper (same characterization-correctness discipline as 05-02/05-03). `requireInternalOrUserAuth` lives on the `process-*-job` workers (already harvested in 05-01), not the submit/status tier.

2. **Lazy-regex segment match stopped at the wrong brace (fixed first pass).** The `if (userId && authenticatedUserId !== userId)[\s\S]*?\}` form matched up to the `JSON.stringify({...})` closing brace, BEFORE the `status: 403`, so the 403 assertion RED'd. Extended the segment to `...status:\s*403[\s\S]*?\);`. Same fix for the get-analysis-job-status `if (!job)[\s\S]*?status:\s*404` not-found block. No source change — test-authoring only.

3. **NO-merit assertion false-RED on a doc comment (fixed first pass).** interview-prep-evaluate line 14 (`// NOTE: No import of withMerits or MERIT_SYSTEM_ENABLED.`) makes those substrings present as PROSE; the blanket `!source.includes('withMerits')` RED'd. Scoped to the ACTUAL absence (no `merit-gateway.ts` import, no `withMerits(` call, no `if (MERIT_SYSTEM_ENABLED` branch). Third occurrence of this lesson.

4. **The interview-prep-analyze AI-failure refund branch is NOT reachable offline** (probe-confirmed): `requireAuth` performs a live `supabase.auth.getUser` that gates the request before the AI block, so `AI_FORCE_FAILURE` is inert. Rather than refactor the handler to expose the branch (forbidden — zero-functional-change), the test asserts the inert outcome and the plan's acknowledged refund-taxonomy coverage stays in `merit-refund.test.ts`. The plan's `read_first` explicitly anticipated this ("verify the exact status/body... do not assume").

## D-08 Suspected-Behavior Register

**One new row pinned, NO escalation: SB-05-04** (`interview-prep-analyze/index.ts` terminal catch swallows requireAuth's thrown 401 Response into a 500 internal_error, where the sibling interview-prep-evaluate catch re-throws it as 401). Pinned via the TRUE handler-invocation test. Disposition `minor -> log`: the auth gate still FIRES and blocks (no auth-bypass), only the surfaced status over-reports as 500; Interview Prep is gated OFF on prod; no merit/billing impact (the refund branch is unreachable without a live session). A future `/gsd-debug` could add `if (err instanceof Response) return err;` to align the catch — that is a behavior change, out of v4.0 scope. SB-05-01/02 unchanged; SB-05-03 was not used (05-03 logged prose only). All five targeted `index.ts` byte-identical vs `v4.0-baseline`.

## Task Commits

1. **Task 1: submit/status job-worker source-read contracts** - `47f5a2e` (test)
2. **Task 2: interview-prep-analyze handler-invocation failure branches + SB-05-04 pin** - `e6005f5` (test)
3. **Task 3: interview-prep-evaluate Pattern A + colocated evaluate.* harvest** - `41d5a97` (test)

## Issues Encountered

- Two lazy-regex-segment matches and one doc-comment false-RED, all caught + fixed on the first isolation run (well within the fix-attempt limit). No source-side issues; all five `index.ts` untouched.

## Next Phase Readiness

- The async job workers (submit-resume / submit-career / get-analysis-job-status) now have their internal-auth + queue-contract invariants pinned on the offline gate, and BOTH interview-prep handlers (analyze via Pattern B, evaluate via Pattern A) are covered with the D-03 opt-in set fully satisfied — ready for Plans 05-05/05-07 and Phases 8/9 to lean on.
- The interview-prep-analyze 401->500 catch asymmetry (SB-05-04) is documented for a future debug pass; no blockers.

## Self-Check: PASSED

- All five created files verified present on disk (3 worker `job-contract.test.ts`, `analyze.failure-branches.test.ts`, `interview-prep-evaluate/handler-config.test.ts`).
- All three task commits verified in git history: `47f5a2e`, `e6005f5`, `41d5a97`.
- `deno task test:ci` -> 673 passed | 0 failed | 11 ignored (638 + 35 executed; the 3 colocated evaluate.* contribute the 9 ignored offline). All five new files + the 3 registered colocated evaluate.* appear in the allowlist stdout.
- `verify:baseline` green (vitest + deno 673/0 + Playwright 5 passed + 1 quarantine-skip).
- Zero product-source change: `git diff v4.0-baseline -- submit-resume-analysis-job/index.ts submit-career-analysis-job/index.ts get-analysis-job-status/index.ts interview-prep-analyze/index.ts interview-prep-evaluate/index.ts` all EMPTY (no worker or evaluate refactored to export a handler).

---
*Phase: 05-deep-test-coverage-expansion*
*Completed: 2026-06-19*
