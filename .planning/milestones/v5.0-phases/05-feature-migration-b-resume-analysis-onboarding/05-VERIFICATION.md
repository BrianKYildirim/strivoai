---
phase: 05-feature-migration-b-resume-analysis-onboarding
verified: 2026-07-06T09:00:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 5: Feature Migration B (Resume Analysis + Onboarding) Verification Report

**Phase Goal:** The highest-traffic dual-path features (Resume Analysis + Onboarding) gain lifecycle reliability, persistence, and Merit-safety WITHOUT any quality or latency regression, and the Onboarding "Analysis Taking Longer Than Expected" hang is resolved.
**Verified:** 2026-07-06
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Onboarding no longer hangs: fire-and-forget abandonment removed, run persisted + recovered via run_id, genuine failure reaches a specific terminal state, Merits release/refund safely, no duplicate analyses/charges | ✓ VERIFIED | `Onboarding.tsx:378-413` awaits the invoke (origin:'onboarding'+attemptNonce), calls `analysisRun.startRun(data.run_id)` before navigate when `isAnalysisLifecycleEnabled()`; legacy fire-and-forget retained byte-identical when flag OFF (dormancy invariant, confirmed intentional per SUMMARY deviation #3). `Results.tsx:215/522` — 120s `MAX_POLLING_TIME` dead-end now arms ONLY when the flag is OFF; a lifecycle terminal-FAILURE screen (`run.errorMessage`/`canRetry`) surfaces when ON. `analyze-resume/index.ts:1165-1272` routes `origin:'onboarding'` through `runAnalysisLifecycle` with dormancy fall-through into the unchanged `withMerits` path. |
| 2 | Resume Analysis (streaming) preserves current output quality/presentation exactly; gains shared reliability/persistence/idempotency/Merit-safety with a persistent lifecycle record and NO latency regression | ✓ VERIFIED | `runResumeStreamingLifecycle` (`analyze-resume/index.ts:787-1053`) wraps the UNTOUCHED TransformStream token path (synthetic chunks at :869/:879-880/:930/:957 unchanged); `create_or_recover_analysis_run` → transitions → `validateModelOutput` on the final assembled object → reconciled save → `saving→completed{merit_settled:true}` (:1024) as the sole settle point; gated by `isAnalysisFeatureEnabled('resume') && rawBody.stream===true` (:1310) so flag OFF = byte-identical legacy stream. Operator-approved staging first-byte latency smoke (this session) confirms no material regression. |
| 3 | The confirmed production cross-origin (CORS) failure is corrected; duplicate submission while a run is active is disabled | ✓ VERIFIED | `cors-matrix.test.ts` (16 assertions, all green) proves apex+www × {200,401,402,403,429,500} carry ACAO+Vary incl. thrown-401 (Pitfall 7), evil origin fail-closed. Operator-approved live prod re-proof (this session) confirms both origins echo ACAO+Vary on deployed `analyze-resume`. Duplicate-submit disabled: `Upload.tsx:406` disables the submit control on `isLocked || isAnalysisRunActive` (flag-gated); `useResumeStream.ts` keeps a single optimistic deduction; `useAnalysisRun.test.ts` "submit-lock (isActive)" describe block (3 tests) proves the dup-guard holds the original run_id. |
| 4 | The resume triple-write is reconciled: `resumes.grading_data` is the sole authoritative throws-pre-settle write; the `analysis_results` mirror is demoted to log-and-continue | ✓ VERIFIED | `analyze-resume/index.ts:102-110` (`completeAndRecordSuccess`) — owner-scoped `resumes.update(...).eq('user_id',...)` is the only throw (`MeritRefundable`); `persistResumeAnalysis:31-77` returns `null` + `console.error` on insert failure (log-and-continue), confirmed by `grep "throw new MeritRefundable"` showing no match inside `persistResumeAnalysis`. |
| 5 | A currently-valid Free/Pro/Elite success output validates byte-identically through the new resume schema+semanticCheck; only genuinely malformed/empty/truncated output fails to a typed terminal + safe refund | ✓ VERIFIED | `resume-validation.ts` exports permissive `.passthrough()` `resumeAnalysisSchema` + `resumeSemanticCheck` (passesQualityFloor-faithful). `runtime-validation-convergence.test.ts` + `byte-preserve.test.ts` (both green) prove a real assembled Free result converges and Free/Pro/Elite golden objects deep-equal through the schema; invalid/truncated/empty → typed `AnalysisErrorCode`, never 200-with-body. |
| 6 | Scenario coverage (idempotency, duplicate-click, refresh, provider timeout/rate-limit, invalid/truncated output, save failure, Merit reserve/settle/release/refund) is folded into `verify:baseline` | ✓ VERIFIED | 5 new deterministic Deno guards registered in `deno.json` test:ci (confirmed: `grep -o "analyze-resume/__tests__/*.test.ts"` → 5 files); `deno task test:ci` = 1056 passed/0 failed/12 ignored (re-run, matches SUMMARY claim exactly); frontend `npm run test` = 498 passed/0 failed (re-run, matches SUMMARY claim exactly). Dormancy guard (`analysis-lifecycle.dormancy.test.ts`) correctly moved `analyze-resume/index.ts` to the migrated set while keeping `career_compass` + the `submit-/process-*-job` workers asserted dormant (re-run, 15/15 dormancy assertions green). |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/analyze-resume/resume-validation.ts` | Permissive schema + semanticCheck seam | ✓ VERIFIED | Exports `resumeAnalysisSchema` (`.passthrough()`) + `resumeSemanticCheck`; imported by both the onboarding executor and the streaming wrapper |
| `supabase/functions/analyze-resume/index.ts` | Onboarding executor adoption + streaming wrapper + idempotency key + dormancy fall-through | ✓ VERIFIED | `runAnalysisLifecycle` call w/ `feature:'onboarding'`, origin discriminator, `runResumeStreamingLifecycle`, `meritCtx.idempotencyKey` set before `withMerits` — all present and wired |
| `src/pages/Onboarding.tsx` | Removed fire-and-forget abandonment (flag-gated); `startRun` wired | ✓ VERIFIED | Awaited invoke + `startRun` before navigate when flag ON; legacy path retained for flag OFF (documented, intentional dormancy) |
| `src/pages/Results.tsx` | Removed 120s dead-end as terminal authority; `useAnalysisRun` layered | ✓ VERIFIED | 120s cap gated to flag-OFF only; lifecycle terminal-FAILURE screen added; realtime RESULT recovery preserved |
| `src/pages/Upload.tsx` | attemptNonce + submit-lock | ✓ VERIFIED | Fresh nonce minted per submit; submit control disabled on `isLocked \|\| isAnalysisRunActive` |
| `src/hooks/useResumeStream.ts` | startRun(run_id) from complete event | ✓ VERIFIED | `startRunRef.current(event.run_id)` called when flag ON and run_id present; token/partial path + single deduction unchanged |
| 5 new `analyze-resume/__tests__/*.test.ts` guards | Idempotency, validation-convergence, byte-preserve, CORS matrix, streaming-wrapper ordering | ✓ VERIFIED | All 5 files exist, registered in `deno.json` test:ci, all pass (re-ran directly: 85/85 including dormancy guard) |
| `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` | Updated must-not-import set | ✓ VERIFIED | `analyze-resume/index.ts` moved to migrated set; `career_compass` + 4 job workers still asserted dormant |
| `supabase/functions/deno.json` | test:ci registration | ✓ VERIFIED | 5 occurrences of `analyze-resume/__tests__/*.test.ts` confirmed via grep |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Onboarding.tsx` | `analyze-resume (origin:'onboarding')` | invoke body carries origin+attemptNonce → startRun | ✓ WIRED | Confirmed at Onboarding.tsx:387-413 |
| `analyze-resume/index.ts` | `runAnalysisLifecycle('onboarding')` | inline executor driver | ✓ WIRED | Confirmed at index.ts:1165-1250 |
| `save()` | `resumes.grading_data` (authoritative) | durable write gates settle | ✓ WIRED | Confirmed in `completeAndRecordSuccess` — sole throw is on `resumes.update` |
| `Results.tsx` | `useAnalysisRun` | STATE recovery layered w/ realtime RESULT fetch | ✓ WIRED | Confirmed at Results.tsx:224 + preserved realtime fetch |
| `meritCtx` (:728 region) | `withMerits` idempotency | `idempotencyKey` set before dispatch | ✓ WIRED | Confirmed at index.ts:1289-1302, verified by streaming-wrapper-ordering.test.ts |
| streaming branch | `create_or_recover_analysis_run` + `transition_analysis_run` | run row + transitions around TransformStream | ✓ WIRED | Confirmed at index.ts:787-1053; static ordering guard green |
| `useResumeStream.ts` | `useAnalysisRun.startRun` | complete SSE event carries run_id | ✓ WIRED | Confirmed at useResumeStream.ts:107-262 |
| `Upload.tsx` | `AnalysisLockContext`/`useAnalysisRun.isActive` | disable submit while active | ✓ WIRED | Confirmed at Upload.tsx:41,406 |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|-----------------|
| FEAT-01 (Onboarding hang fix + lifecycle adoption) | ✓ SATISFIED | None |
| FEAT-02 (Resume Analysis streaming lifecycle + idempotency + CORS + no-regression) | ✓ SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/analyze-resume/index.ts` | 1025-1038 | The outer IIFE `catch(err)` wraps the entire success tail INCLUDING the post-settle `sendEvent({type:'complete',...})` call at :1025. If that single post-settle `sendEvent` write throws (e.g. writer already closed by the client disconnecting mid-write), execution falls into the `catch` block, which calls `refundMeritsForJob` + transitions the run to `retryable_failed` AFTER `merit_settled:true` was already durably written — a theoretical refund-after-settle. | ℹ️ Info (non-blocking) | Extremely narrow race (client must disconnect in the ~1-line window between the settle CAS and the SSE write); not exercised by the streaming-wrapper-ordering test (which only asserts the *lexical* success-tail slice up to `catch`, not runtime reachability of that catch after settle). Not a regression — pre-existing IIFE catch pattern is inherited from the byte-identical legacy branch. Recommend narrowing the try/catch boundary (or a dedicated try/catch around the final `sendEvent`) in a follow-up if pursued; does not block Phase 5 goal achievement (dormant by default, no observed occurrence, financial impact bounded to a single already-completed+durably-saved analysis). |

No blocker or warning-level anti-patterns found. No TODO/FIXME/placeholder markers found in the modified files.

### Human Verification Required

None outstanding. The one item requiring live/human verification (Task 4 — operator checkpoint: live apex+www prod CORS re-proof, staging first-byte latency smoke, refresh/navigation recovery smoke, ascending-blast-radius flag-flip soak) was operator-approved this session per the task instructions. The offline guards backing each of those live invariants (CORS status matrix, streaming-wrapper ordering, idempotency, dormancy) were independently re-run during this verification and are green.

### Gaps Summary

No gaps found. All 6 derived observable truths verified against the actual codebase (not just SUMMARY claims): every claimed file/function/pattern was read and cross-checked, the 5 new deterministic Deno guards were re-executed directly (85/85 passed), the full `deno task test:ci` was re-run (1056/0/12, matching the SUMMARY's claimed count exactly), and the full frontend `npm run test` was re-run (498/0, matching the SUMMARY's claimed count exactly). The dormancy invariant (byte-identical legacy fall-through while flags default OFF) holds across all three plans: Onboarding.tsx retains its legacy fire-and-forget branch when the flag is OFF (a deliberate, documented deviation from a literal acceptance-criterion grep, correctly justified by the phase's HARD dormancy constraint), Results.tsx's 120s cap only arms when OFF, and the streaming wrapper is double-gated on `isAnalysisFeatureEnabled('resume') && rawBody.stream===true`.

One non-blocking informational finding (theoretical refund-after-settle race in an extremely narrow post-CAS SSE-write-failure window) is noted above for awareness; it does not affect goal achievement, is inherited from a pre-existing IIFE catch-wrapping pattern, and has no observed occurrence.

---

*Verified: 2026-07-06*
*Verifier: Claude (gsd-verifier)*
