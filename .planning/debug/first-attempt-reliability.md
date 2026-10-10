---
slug: first-attempt-reliability
status: resolved
trigger: "First-attempt reliability failure across Career Compass and onboarding analysis: the first analysis request shows a generic 'server error' toast, but a later/retried attempt succeeds. One click must consistently return the result on the first attempt, for both Free and Elite users, in both Career Compass and onboarding."
environment: production (real AI, merit system ON)
observed_error: "Generic 'server error' toast on first attempt; retry succeeds — suggests the original run is still processing or has already completed while the frontend gives up."
created: 2026-07-24T04:40:50Z
updated: 2026-07-29T01:16:49Z
---

# Debug Session: first-attempt-reliability

## Symptoms

- **Expected:** A single click completes the full analysis; the user never needs to press the button again. One click consistently returns the result on the first attempt.
- **Actual:** The first analysis request fails with a generic "server error" toast. A later/retried attempt succeeds.
- **Error shown:** Generic "server error" toast (non-specific). The fact that a retry succeeds strongly implies the backend may still be processing, or has already completed and saved a result, while the frontend has already surfaced an error.
- **Environment:** Production only (real Anthropic calls, merit system ON). NOT reproducible on Preview — Preview uses AI_TEST_MODE fixtures (never calls Anthropic) and has MERIT_SYSTEM_ENABLED=false, so timeout/streaming/merit-charge/refund behavior cannot be exercised pre-prod.
- **Scope:** Both Career Compass AND onboarding analysis; must hold for BOTH Free and Elite tiers.

## Goal (eventual fix requirements — context, not yet implementation)

1. Automatically retry transient failures using the SAME run ID and idempotency key — no duplicate analyses, no duplicate merit charges.
2. Before showing an error, check whether the original run is still processing or already completed, and recover its saved result.
3. Keep the loading state active during legitimate long-running analyses rather than timing out prematurely.
4. Only show a final error after all safe retries and recovery checks fail. Refund merits exactly once on genuine permanent failure.
5. Apply and verify for BOTH Free and Elite, in BOTH Career Compass and onboarding.

## Prior Investigations To Build On (READ THESE — do not re-derive)

These are cross-referenced confirmed/near-confirmed root causes from adjacent sessions. The debugger MUST read them before forming hypotheses:

- `.planning/debug/resolved/` and `.planning/debug/resume-timeout-no-merit-refund.md` (status: investigating) — **CONFIRMED:** the onboarding lifecycle inherited three OUTER transient retries while provider helpers ALSO owned inner retry/fallback; Free could exceed 200s and Elite had a 155s single-call wall — both outliving the 120s browser wait and the 150s Edge ceiling before the pre-save refund branch fired. Directly relevant to "keep loading active vs premature timeout" and "refund exactly once".
- `.planning/debug/career-compass-flag-split-95-hang.md` (resolved) — **submit-career and analyze-career disagreed on the lifecycle flag at runtime, producing a run-identity split.** Directly relevant to the "retry using the SAME run ID / idempotency key" requirement.
- `.planning/debug/cc-elite-output-truncated.md` + `.planning/debug/elite-cc-mixed-format.md` — Elite CC truncation / mixed JSON+Markdown is a TERMINAL failure → 422 + refund (a LEGITIMATE permanent failure). Retry/recovery logic MUST NOT mask or infinitely retry these.
- `.planning/debug/queue-path-tier-downgrade.md` (fix-implemented) + `.planning/debug/queue-path-tier-downgrade-refunds.md` — worker/queue-path tier collapse to Free. Relevant to Free/Elite parity.

## Known Sharp Edges (project memory — treat as established facts)

- Merit charge/refund/idempotency is NEVER exercised on Preview (MERIT_SYSTEM_ENABLED=false) — cannot be QA'd pre-prod; must be reasoned about from code + prod logs.
- Preview never calls Anthropic (AI_TEST_MODE fixtures) — timeout/streaming cannot be reproduced on Preview.
- `invokeWithTimeout` NEVER rejects; it resolves `{ data, error }` for ALL outcomes — any `.catch()`-based recovery on it is dead code. Recovery logic must inspect the resolved value.
- Internal-auth tier collapse to Free is still latent in `analyze-resume` — relevant to the Free/Elite parity requirement.

## Current Focus

- status: RESOLVED — R1b-R7 all returned durable first-attempt results with completed lifecycle rows and exactly one financially correct Merit debit. The R7 token-headroom finding is tracked separately in `02-VERIFICATION.md` and does not reopen the 95% client-state incident.
- reasoning_checkpoint:
    hypothesis: "Onboarding treats a server-reported, already-refunded lifecycle failure as potentially alive, then Results disables its deadline based on the global feature flag rather than whether it is actually tracking an active run; together those conditions create the permanent 95% state."
    confirming_evidence:
      - "The exact production request returned HTTP 500 after merit-refund reason generating:MODEL_TIMEOUT, so it was terminal and not alive."
      - "analyze-resume returns `{ error, code }` without `run_id` after runAnalysisLifecycle.refundAndFail; invokeWithTimeout preserves that body/status."
      - "Onboarding sends every retryable code to Results, but can call startRun only when data.run_id exists."
      - "Results polls grading_data forever and installs its only deadline only when the global lifecycle flag is off, regardless of run.runId/run.isActive."
    falsification_test: "This hypothesis would be wrong if a coded lifecycle 500 could return before refund/terminalization, or if Results installed another terminal deadline/status source when run identity is absent. Complete source plus production logs show neither."
    fix_rationale: "Treat a server-returned taxonomy code as terminal after the landed-result re-read, while retaining ambiguous handoff only for bodyless transport/client timeouts; in Results, suppress the bounded fallback only while run.isActive is true. These guards restore honest exits without invoking a second analysis, creating a job, charging merits, or issuing a refund."
    blind_spots: "A bodyless client 408 still cannot identify the backend run; the bounded Results fallback can only offer a recovery surface, not prove whether the backend later completed or refunded. The completed production matrix shows no recurrence across Resume, LinkedIn, Career Compass, or Recruiting Lens."
- next_action: none for this incident. Continue Phase 02 remediation from the independent R7 `rl-call-3` near-cap finding in `02-VERIFICATION.md`.

## Evidence

- timestamp: 2026-07-24
  checked: Onboarding.tsx handleFinishSetup lifecycle branch (lines 412-447).
  found: onboarding performs ONE synchronous `invokeWithTimeout("analyze-resume", { origin:'onboarding', attemptNonce }, 120000)`. The 120s value is a CLIENT Promise.race (fetchWithTimeout.ts:42-54) that does NOT cancel the Edge request. On `error || !data || data.error` (line 438) it shows the generic toast "We couldn't finish analyzing your resume. Please try again." and `return`s — it does NOT navigate to /results, does NOT poll status, and has NO run_id to recover with (run_id is only in the SUCCESS body at server index.ts:1503; on a client give-up `data` is null).
  implication: a slow-but-alive run is abandoned by the client and never recovered. This is the exact "premature give-up + no recovery-by-run-id" gap from the Current Focus hypothesis.

- timestamp: 2026-07-24
  checked: Onboarding.tsx:421 — attemptNonce minting.
  found: `const attemptNonce = crypto.randomUUID()` is minted FRESH on every handleFinishSetup call (not held in a ref). Contrast CareerCompass.tsx:244-247 `attemptNonceRef` held stable across resubmits and only nulled on a terminal completed/failed.
  implication: a user's manual retry after the first-attempt toast derives a NEW idempotency key server-side (index.ts:1409-1414 hashes inputIdentity + attemptNonce) → the retry CHARGES AGAIN and starts a DUPLICATE analysis. The "retry succeeds" symptom is a second, separately-charged run — not recovery of the first. Also each onboarding retry re-uploads the resume and inserts a NEW resumes row (lines 271-303), so runs are keyed to different resumeIds.

- timestamp: 2026-07-24
  checked: analyze-resume/index.ts onboarding lifecycle (lines 1405-1518) + tier-config.ts:70-73,129.
  found: onboarding is fully SYNCHRONOUS — runAnalysisLifecycle('onboarding') runs extract → generate → validate → save (grading_data + analysis_results mirror + cache write + webhook) before returning the HTTP response (line 1502). Provider wall = `Math.min(getTimeout(resolvedTier), 100_000)`: Elite `getTimeout('elite','core')`=155_000 → capped to 100s; Free 50_000 → 50s. `maxRetries: 0` (bounded, from resume-timeout-no-merit-refund fix 75c25412). The server comment at 1415-1416 explicitly states "The browser waits 120s and the Edge request is killed at 150s."
  implication: Elite onboarding = up to 100s generation + merit reservation + output validation + multi-write save + isolate cold-start. That routinely approaches/exceeds the 120s client Promise.race → the client gives up on a still-alive/just-saved run. Elite is the dominant premature-give-up case. Free (50s wall) rarely crosses 120s but hits genuine Anthropic 408s (prod evidence 77461c33 in resume-timeout-no-merit-refund.md: 50008ms, HTTP 408) → maxRetries:0 → refundAndFail → server 500 (index.ts:1511) → onboarding shows the SAME generic toast; the retry succeeds because the second call gets a completing response. Both tiers therefore exhibit first-attempt failure, via slightly different dominant mechanisms, through the SAME missing recovery seam.

- timestamp: 2026-07-24
  checked: CareerCompass.tsx submit+poll (lines 501-808) vs onboarding.
  found: CC already has the recovery pattern onboarding lacks — (1) submit returns fast (15s) with jobId===run_id, persisted via `analysisRun.startRun(careerJobId)` BEFORE polling (line 663); (2) the poll loop is UNBOUNDED when lifecycleOn ("a slow-but-alive run is never abandoned", line 675); (3) on deadline it does a landed-result recovery via `hydrateLatestCareerResult` (line 790); (4) stable `attemptNonceRef` so a resubmit reuses the idempotency key. CC's residual first-attempt exposure: (a) a genuine transient server-side `status:'failed'` (line 716) is surfaced as a terminal generic toast with NO automatic same-key retry — a transient Anthropic overload on attempt 1 reads as failure, and a manual retry (same nonce → create_or_recover) succeeds; (b) a SUBMIT-call 15s give-up (line 624) returns before `careerJobId`/run_id is captured, so that specific run isn't tracked/recovered (though the stable nonce keeps the retry from double-charging).
  implication: the SHARED root-cause theme across BOTH flows is: transient/in-flight conditions are surfaced as terminal generic errors WITHOUT first (i) recovering the run by run_id / checking whether the result landed, and (ii) auto-retrying a retryable failure using the SAME idempotency key. Onboarding is the severe case (no poll, no recovery, per-retry nonce double-charge); CC needs only the auto-retry-transient-before-terminal-toast improvement.

- timestamp: 2026-07-28T08:58:00Z
  checked: operator production run using scripts/test-docs-new/free_arjun_mehta_resume.pdf plus deployed frontend asset identity.
  found: the first Free-tier onboarding analysis remained on the Results-style 95% "Generating personalized insights" state for almost one hour with no toast, error, result, or redirect. Production served main asset index-MvMEJuN6.js and Onboarding-DBeFQKaq.js; the Onboarding chunk contains the implemented terminal/recovery strings, so the run used the fix-enabled frontend rather than a stale pre-fix bundle.
  implication: the original premature-toast failure was not simply stale deployment. The deployed ambiguous handoff can now enter a loading state that has no observed terminal exit; the open tab must not be retried/refreshed while run/charge/refund truth is unknown.

- timestamp: 2026-07-28T10:02:00Z
  checked: .planning/debug/knowledge-base.md.
  found: no debug knowledge base exists in this checkout.
  implication: there is no resolved-session keyword match to prioritize; the regression must be traced from the current deployed client path and adjacent debug sessions.

- timestamp: 2026-07-28T10:08:00Z
  checked: src/pages/Onboarding.tsx lifecycle-enabled ambiguous invoke branch.
  found: after a 408/5xx/network/unknown result, Onboarding navigates to `/results/${resume.id}` even when `data` is null. It calls `analysisRun.startRun(data.run_id)` only when the response body contains `run_id`; a client Promise.race timeout necessarily has no response body and therefore hands off no current run identity.
  implication: the Results page can receive only the resumeId, with no lifecycle row to classify as alive/completed/failed/refunded. Stable nonce preserves idempotency but cannot make the run observable from this route.

- timestamp: 2026-07-28T10:08:00Z
  checked: src/pages/Results.tsx non-job/non-stream fallback polling and timeout gate.
  found: Results polls `resumes` every five seconds until `grading_data` appears, with no terminal condition when it remains null. Its only `MAX_POLLING_TIME = 120000` exit is installed only when `!isAnalysisLifecycleEnabled()`. The condition does not require `run.runId` or `run.isActive`, so lifecycle-enabled + missing/dead run identity disables the escape permanently. The render branch remains `loading || !resume?.grading_data`, producing the observed 95% overlay.
  implication: this is a deterministic infinite-spinner state, not merely a slow provider call. It preserves no false toast, but it also has no authoritative alive-vs-dead signal and no eventual user recovery surface.

- timestamp: 2026-07-28T10:08:00Z
  checked: src/hooks/useAnalysisRun.ts dead/stale run cleanup.
  found: the hook can clear an authoritative 404, three consecutive empty transport polls, or a legacy run with null lifecycle state. After clearing, `run.runId` becomes null; Results does not react by installing its suppressed timeout because the timeout decision is based only on the global feature flag.
  implication: even the newer stale-run cleanup cannot resolve the 95% screen; it can turn a bad tracked identity into no identity while Results continues unbounded resume-row polling.

- timestamp: 2026-07-28T08:59:36Z
  checked: production Management API function_edge_logs and structured function_logs for the exact operator run.
  found: POST `/functions/v1/analyze-resume` returned HTTP 500 at 08:59:36.293Z, about 51.7 seconds after request start. At 08:59:36.230Z the structured merit-gateway log recorded `merit-refund` with reason `generating:MODEL_TIMEOUT`.
  implication: the backend had already reached a terminal failed/refunded outcome; it was not still processing. The indefinite 95% state is therefore a false-alive client state caused by loss of run identity plus the globally suppressed fallback deadline. Any correction must only change client recovery state and must not issue a second analysis or merit operation.

- timestamp: 2026-07-28T10:24:00Z
  checked: minimal source correction in Onboarding.tsx and Results.tsx.
  found: Onboarding now treats any server-returned lifecycle taxonomy code as terminal after the authoritative landed-result read; bodyless client/transport failures remain ambiguous. Results now suppresses its 120s recovery surface only while `run.isActive` is true, and reacts when that active state changes. Recovery tests pin MODEL_TIMEOUT-as-terminal, bodyless-408-as-ambiguous, the active-run gate, and the absence of any analysis/job re-invocation.
  implication: the exact production 500 exits immediately with leak-free timeout copy after the already-completed refund; a genuinely unknown bodyless handoff may wait for a late result but cannot remain at 95% indefinitely. No second job/charge/refund path was added.

- timestamp: 2026-07-28T10:45:00Z
  checked: focused Vitest, TypeScript, and whitespace verification.
  found: `npx vitest run` across Onboarding.freshness, Onboarding.recovery, Results.recovery, and useAnalysisRun passed 4 files / 46 tests. `npm run type-check` passed cleanly. `git diff --check` reported no whitespace errors (only Windows line-ending notices).
  implication: both behavioral branches and the active-run gate compile and pass their focused regression contracts; broader frontend verification remains before handoff.

- timestamp: 2026-07-28T10:48:00Z
  checked: exact diff plus focused ESLint on all five changed source/test files.
  found: the diff is limited to the two client guards and three regression-test files. Results contains no analysis/job submission path. Focused ESLint completed with 0 errors; its 26 warnings are existing warnings in Onboarding/Results, and the now-unused `isAnalysisLifecycleEnabled` import was removed.
  implication: the patch is bounded and does not add any code path capable of creating a second job, charge, or refund. No broad remote or production suite is needed before handing off the local fix.

- timestamp: 2026-07-28T10:52:00Z
  checked: post-cleanup Results recovery test, TypeScript, diff check, and worktree scope.
  found: Results.recovery passed 6/6 after the unused import removal; `npm run type-check` passed again; `git diff --check` remained clean. The only modified code/test files are Onboarding.tsx, Results.tsx, Onboarding.freshness.test.tsx, Onboarding.recovery.test.tsx, and Results.recovery.test.ts; the debug session file is the only planning change.
  implication: focused self-verification is complete. Production AI/merit truth is the remaining human verification gate; no production write was made during investigation or fix.

- timestamp: 2026-07-29T00:23:38Z
  checked: operator R1b Free onboarding rerun plus read-only production function logs, lifecycle row, durable resume result, AI telemetry, and Merit ledger.
  found: the operator reported the result working around 17:21 PDT. POST `/functions/v1/analyze-resume` returned HTTP 200 at 00:22:51Z. Telemetry request `cea71f17` recorded one successful attempt-1 `free-single` call on the approved 9,000-token cap: 4,710 output tokens, `end_turn`, 47.67% headroom, not truncated, 46,275 ms. Lifecycle run `58852263…` reached `completed` with `merit_settled=true`, `refunded=false`, zero retries, and no failure code; the matching Free resume row held durable `grading_data`. The Merit ledger contained exactly one `feature-deduct` row totaling -3 and zero refund rows.
  implication: the exact permanent-95% regression is cleared in production and the successful Free onboarding money path is correct. R2-R7 may proceed; this broader debug session remains awaiting matrix verification for Career Compass and Elite parity.

## Eliminated

- hypothesis: increasing the 120s client timeout (or the 150s Edge ceiling) is the fix.
  evidence: already ruled out in resume-timeout-no-merit-refund.md (Eliminated) — widening walls preserves long provider calls, worsens UX/cost, and does not create a reliable pre-kill recovery margin. The correct shape is submit-fast + persist run_id + poll/recover the alive-or-saved run, which onboarding does not do and CC does.
  timestamp: 2026-07-24
- hypothesis: the bug is a merit refund defect (as in resume-timeout-no-merit-refund).
  evidence: that session already bounded onboarding retries and fixed refund truth (75c25412). The remaining first-attempt symptom is a FRONTEND recovery/idempotency gap (abandon-on-client-give-up + per-retry nonce), not a server refund-primitive gap. Refund correctness must still be preserved by any fix (retry with the SAME key, do not double-charge).
  timestamp: 2026-07-24

## Resolution

root_cause: |
  A FRONTEND recovery-state gap remained after the stable-idempotency fix. On a coded
  lifecycle failure, `runAnalysisLifecycle` refunded and terminalized the run, then
  `analyze-resume` returned HTTP 500 with `{error, code}` but no `run_id`. Onboarding
  incorrectly classified retryable taxonomy codes such as MODEL_TIMEOUT as potentially
  alive and navigated to Results. Results then disabled its only bounded deadline from
  the global lifecycle feature flag alone, even though no current lifecycle run was
  tracked, while its resumes-row fallback polled only for grading_data. A terminal,
  refunded run with no grading_data was therefore guaranteed to remain at 95% forever.

  The earlier idempotency defect remains fixed: attemptNonce/resume row reuse prevents a
  duplicate same-page job/charge. The new defect is the false-alive handoff plus missing
  no-run deadline, not a refund failure.
  ONBOARDING (Onboarding.tsx): a per-submit `attemptNonce = crypto.randomUUID()` derived a
  NEW server idempotency key on every manual retry (double-charge + duplicate resumes row),
  and the synchronous 120s client Promise.race give-up branch toasted a generic failure with
  NO recovery — no landed-result re-read, no alive-vs-terminal classification — abandoning a
  still-alive/just-saved run. CAREER COMPASS (CareerCompass.tsx): a transient (retryable)
  server-side `status:'failed'` was surfaced as a terminal generic toast with NO automatic
  same-nonce retry.

fix: |
  2026-07-28 production-regression correction (frontend only):
   - Onboarding's authoritative landed-result re-read still runs first. If the server then
     returned ANY lifecycle taxonomy code, the attempt is treated as terminal because that
     response is emitted only after runAnalysisLifecycle's refundAndFail boundary. This
     includes MODEL_TIMEOUT/MODEL_RATE_LIMITED: they are retryable for a new deliberate
     attempt, but the returned attempt is no longer alive. The mapped leak-free message is
     shown and no untracked Results handoff occurs.
   - Only a bodyless client 408/network failure remains ambiguous and hands off to Results.
   - Results suppresses its bounded 120s recovery surface only while `run.isActive` is true,
     not merely because the global lifecycle flag is enabled. Missing/cleared run identity
     therefore cannot poll grading_data at 95% forever. This is UI/recovery state only: no
     second analysis/job, Merit charge, or refund path was added.

  MINIMAL frontend fix (operator-approved directions 1+3, plus the direction-2 pre-toast
  recovery), no server/edge/migration change.

  ONBOARDING (src/pages/Onboarding.tsx):
   - Direction 1: attemptNonce is now held in a STABLE useRef (getAttemptNonce, mirroring
     CareerCompass.attemptNonceRef) and the uploaded resumes row is held in resumeRecordRef —
     both reused across a same-page retry (server create_or_recover -> already_deducted ->
     charged exactly once; recovery-by-resumeId keeps working, no duplicate row). Both refs
     are released ONLY on a terminal outcome (completed on success/landed; failed after
     recovery checks fail), so a genuinely new deliberate run legitimately charges again.
   - Direction 2: on the give-up branch, BEFORE any toast, re-read the authoritative
     resumes.grading_data by resumeId (onboardingResultLanded). landed -> navigate to
     /results/:id (no toast); GENUINE terminal (any server-returned taxonomy code from
     data.code, or an immediate 4xx 400/402/403/429) -> surface the specific mapped
     (leak-free) message and stay; AMBIGUOUS (bodyless 408 / network without a taxonomy
     code) -> keep loading by handing off to Results, NO false failure toast. Classification is
     code-driven (mapAnalysisError on data.code) so a genuine truncation/schema terminal
     (which also arrives as HTTP 500) is NEVER masked by the alive path.

  CAREER COMPASS (src/pages/CareerCompass.tsx):
   - Direction 3: on a `status:'failed'` whose taxonomy retryable flag is true
     (statusData.retryable — the MODEL_TIMEOUT/MODEL_RATE_LIMITED partition), auto-retry ONCE
     with the SAME nonce (hoisted careerSubmitBody + getAttemptNonce) before surfacing any
     terminal toast: re-submit -> create_or_recover replays the idempotency key -> one charge,
     no rollback, no nonce reset. Guarded by `autoRetried` (exactly once) and follows the
     recovered run via `currentJobId`. A non-retryable/permanent failure (truncation /
     mixed-format / schema / entitlement) is NOT retried — it still fails+refunds and is
     surfaced immediately (hard constraint honored).

files_changed:
  - src/pages/Results.tsx: unbounded waiting is now gated by an actually active lifecycle
    run; missing/cleared run identity retains the bounded recovery surface.
  - src/pages/Results.recovery.test.ts: regression guard for active-run-only unbounded wait
    plus the existing no-reinvoke/no-second-job contract.
  - src/pages/Onboarding.tsx: stable attemptNonce ref + resumeRecordRef reuse; single-read
    onboardingResultLanded helper; code-driven pre-toast recovery (landed/terminal/ambiguous);
    mapAnalysisError import.
  - src/pages/CareerCompass.tsx: hoisted careerSubmitBody; currentJobId + autoRetried;
    same-nonce auto-retry-once seam in the failed branch; retryable field on
    CareerJobStatusResponse.
  - src/pages/__tests__/Onboarding.recovery.test.tsx: updated stale nonce assertion + new
    direction-1/2 source-contract guards.
  - src/pages/__tests__/CareerCompass.recovery.test.tsx: new direction-3 source-contract guards.
  - src/pages/__tests__/Onboarding.freshness.test.tsx: scenario 10 updated to a genuine
    terminal code; added 10a (server MODEL_TIMEOUT -> mapped terminal, no navigate), 10b
    (bodyless ambiguous 408 -> navigate, no toast), and 10c (landed -> navigate, no toast);
    resumes mock supports the grading_data read.
  - src/pages/__tests__/Upload.recovery.test.tsx: replaced the stale global-feature-flag
    Results assertion with the active-run-only unbounded-wait contract.
  - src/test/coverage/ver02-matrix.test.ts: updated the ONB_REC DUP_GUARD title reference.

verification: |
  Additional production-regression verification (2026-07-28):
   - Exact production evidence: HTTP 500 at 08:59:36.293Z after structured
     `merit-refund` reason `generating:MODEL_TIMEOUT` at 08:59:36.230Z.
   - Focused Vitest: Onboarding.freshness + Onboarding.recovery + Results.recovery +
     useAnalysisRun -> 4 files / 46 tests PASS.
   - Post-cleanup Results.recovery rerun -> 6/6 PASS.
   - `npm run type-check` -> PASS twice (including final source state).
   - Focused ESLint on all changed code/test files -> 0 errors; 26 pre-existing warnings.
   - `git diff --check` -> clean (Windows line-ending notices only).
   - Production frontend build -> PASS.
   - Full Vitest after updating the stale Upload recovery guard -> 122 files / 873 tests
     PASS. The preceding run was intentionally treated as RED because that guard still
     demanded the old global feature-flag condition that caused this incident.
   - Exact detached `bcffdad2` seven-layer `verify:baseline` -> PASS in 353.6 seconds.
   - Production frontend deployed through Vercel deployment
     `dpl_5axd38jBPnEpx1d2x5NTT1Q8pDSK`, built with the production lifecycle flag and
     production Supabase ref, then promoted without rebuilding.
   - Live `https://www.strivoai.net` serves `index-DXmerinn.js`;
     `Onboarding-ChWQuUKI.js` and `Results-BSmJ4vR7.js` both return 200 and contain
     the terminal-failure and bounded-timeout recovery markers. Apex redirects 308
     to `https://www.strivoai.net/`.

  Commands run and REAL results (2026-07-24):
   - `npm run type-check` (tsc -p tsconfig.app.json --noEmit) -> PASS (clean).
   - `npm run lint` (eslint .) -> exit 0: 0 errors, 152 warnings (all pre-existing; the 2
     Onboarding.tsx warnings — checkExistingOnboarding hoist + exhaustive-deps — predate this
     change and are untouched).
   - `npx vitest run` on the 4 affected files (Onboarding.recovery, CareerCompass.recovery,
     Onboarding.freshness, ver02-matrix) -> 64/64 PASS.
   - `npm run test` (full vitest) -> 114 files, 797 tests, ALL PASS.
   - Red->green confirmed: the pre-existing assertion `const attemptNonce = crypto.randomUUID();`
     and freshness scenario 10 (old generic toast + no recovery) both went RED against the new
     code and were updated to the new behavior; the new direction-1/2/3 guards + behavioral
     scenarios 10b/10c assert literals/behavior that did not exist before.
   - NOT run (correctly): `npm run test:edge` — NO edge/Deno code was touched (frontend-only).
     Merit charge-once + real-timeout recovery CANNOT be exercised on Preview (MERIT_SYSTEM
     off, AI_TEST_MODE) — those hold by construction (same-key reuse -> create_or_recover ->
     already_deducted) and require PROD validation post-deploy.

  R1 production verification (2026-07-28 17:21 PDT):
   - User-visible result rendered successfully.
   - Edge POST -> HTTP 200; lifecycle -> completed; durable Free result present.
   - AI telemetry -> attempt 1, free-single, 4,710 / 9,000, end_turn, 47.67% headroom,
     not truncated, duration 46,275 ms.
   - Merit ledger -> exactly one -3 feature debit, one idempotency key, zero refunds.

  Status awaiting-human-verify (broader matrix, not resolved): the exact onboarding 95% incident
  is production-cleared and R1 is financially clean. R2-R7 are now released; Career Compass and
  Elite-tier parity remain the outstanding verification surfaces before this cross-flow debug
  session can be marked resolved.
