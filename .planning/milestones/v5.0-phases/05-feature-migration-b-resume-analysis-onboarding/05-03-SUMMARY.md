---
phase: 05-feature-migration-b-resume-analysis-onboarding
plan: 03
subsystem: testing
tags: [deno, vitest, cors, idempotency, llm-validation, sha256, sse, verify-baseline]

# Dependency graph
requires:
  - phase: 05-01
    provides: resume-validation.ts (resumeAnalysisSchema + resumeSemanticCheck), onboarding executor adoption, dormancy guard update
  - phase: 05-02
    provides: runResumeStreamingLifecycle wrapper, deriveIdempotencyKey seam on meritCtx, useAnalysisRun submit-lock
  - phase: 03
    provides: _shared/idempotency-key.ts, _shared/llm-validation.ts, _shared/analysis-lifecycle.ts (refund boundary), analysis-error-taxonomy
provides:
  - Five deterministic offline Deno guards for FEAT-01/FEAT-02 (idempotency, validation-convergence, byte-preserve, CORS matrix, streaming-wrapper ordering)
  - Frontend vitest submit-lock (isActive) dup-guard + preserve-previous coverage for useAnalysisRun
  - All five new guards registered in deno.json test:ci / verify:baseline (Pitfall 12 closed)
  - Operator-approved live proof of the D-12 CORS invariant + D-01 no-latency-regression invariant + refresh/navigation recovery + ascending-blast-radius flag-flip staging
affects: [06-feature-migration-c-career-compass, 09-final-verification, dashboard-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic offline guard suite per migrated feature (idempotency / validation-convergence / byte-preserve / CORS matrix / streaming-wrapper ordering), mirroring the Phase-4 04-06 precedent"
    - "Success-tail refund-boundary assertion: for a streaming wrapper whose error catch is lexically after the settle CAS, slice [saving->completed, catch(err)) and assert no refund in the success path (vs. the executor's whole-file slice)"

key-files:
  created:
    - supabase/functions/analyze-resume/__tests__/idempotency-repeated-run.test.ts
    - supabase/functions/analyze-resume/__tests__/runtime-validation-convergence.test.ts
    - supabase/functions/analyze-resume/__tests__/byte-preserve.test.ts
    - supabase/functions/analyze-resume/__tests__/cors-matrix.test.ts
    - supabase/functions/analyze-resume/__tests__/streaming-wrapper-ordering.test.ts
  modified:
    - supabase/functions/deno.json
    - src/hooks/__tests__/useAnalysisRun.test.ts

key-decisions:
  - "Task 3 dormancy guard required NO change — 05-01 already moved analyze-resume into MIGRATED_ENTRYPOINTS and kept career_compass + submit-/process- workers dormant; Task 3 was purely the deno.json test:ci registration"
  - "Streaming-wrapper ordering guard asserts no-refund in the SUCCESS TAIL (settle CAS -> catch(err)) rather than a whole-file post-CAS slice, because the wrapper's generating-stage catch refund is lexically after the settle CAS but is the error path, never reached once completed"
  - "Operator-approved live verification (Task 4): apex+www CORS re-proof on prod echoes ACAO+Vary incl. 401, evil fail-closed, ALLOWED_ORIGINS includes both; first-byte latency no material regression; refresh/navigation recovery works; flag-flip soak order (Onboarding then Resume) staged. No DB migration; advisor floor 15 not increased"

patterns-established:
  - "Pattern 1: grep occurrence count (grep -o | wc -l) is the meaningful registration check for the single-line deno.json test:ci allowlist — grep -c reports 1 line, not 5 occurrences"
  - "Pattern 2: validation-convergence guard drives the FINAL ASSEMBLED object (JSON.stringify) through validateModelOutput so needsStructuralRepair can never false-fail a valid success (D-10 collision spot)"

requirements-completed: [FEAT-01, FEAT-02]

# Metrics
duration: 26min
completed: 2026-07-06
---

# Phase 5 Plan 03: Resume Analysis + Onboarding Verification Fold Summary

**Five deterministic FEAT-01/FEAT-02 Deno guards (idempotency, validation-convergence, byte-preserve, CORS status matrix, streaming-wrapper ordering) + frontend submit-lock vitest folded into verify:baseline, with an operator-approved live CORS/latency/recovery/flag-flip re-proof**

## Performance

- **Duration:** 26 min
- **Started:** 2026-07-06T08:09:35Z
- **Completed:** 2026-07-06T08:35:43Z
- **Tasks:** 4 (3 automated + 1 operator-gated checkpoint)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Idempotency guard: same attemptNonce → same key (one deduction), fresh nonce → new key/History, Pitfall-8 stable content identity cannot re-key a delivered analysis, onboarding shares the resume merit namespace, tier is part of the identity; executor refund-boundary asserted (refund pre-`saving`, settle-on-saved, no refund post-CAS)
- Validation-convergence guard: a real assembled Free result converges byte-faithfully through `validateModelOutput(resumeAnalysisSchema + resumeSemanticCheck)`; empty/{}/garbage → MODEL_INVALID_RESPONSE, truncated → MODEL_OUTPUT_TRUNCATED, missing-score/empty-criteria/all-zero/all-identical → SCHEMA_VALIDATION_FAILED (never a 200-with-body)
- Byte-preserve guard: golden Free/Pro/Elite result objects (incl. full eliteInsights + passthrough metadata) deep-equal the input through the permissive `.passthrough()` schema (D-10)
- CORS matrix guard: apex + www × {200,401,402,403,429,500} carry origin-reflected ACAO + `Vary: Origin` across handler-return / jsonError / thrown-401; evil origin fail-closed across the whole matrix; entrypoint still routes through `withCors(req,'user',…)` with the x-internal-job-secret extra header
- Streaming-wrapper ordering guard: create_or_recover → reserve-with-key (`p_idempotency_key: idempotencyKey`) → generating → validateModelOutput → saving → `saving→completed { merit_settled: true }`, settle written exactly once, no refund in the success tail, caller derives ONE key before withMerits and sets it on the shared meritCtx
- Frontend vitest: submit-lock (`isActive`) latch + dup-guard (a second startRun mid-flight holds the original run_id, no new channel) + a deliberate new run permitted once terminal with previousResult preserved
- Registered all five guards in deno.json test:ci; `deno task test:ci` = 1056 passed / 0 failed / 12 ignored; frontend vitest = 498 passed / 0

## Task Commits

1. **Task 1: Idempotency + validation-convergence + byte-preserve guards** - `01393bd7` (test)
2. **Task 2: CORS matrix + streaming-wrapper ordering + frontend submit-lock** - `5ca4db8e` (test)
3. **Task 3: Dormancy guard (already correct) + register in deno.json test:ci** - `b7c76569` (test)
4. **Task 4: Operator checkpoint — live CORS/latency/recovery/flag-flip** - operator-approved, no code change

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `supabase/functions/analyze-resume/__tests__/idempotency-repeated-run.test.ts` - FEAT-01/02 idempotency + refund-boundary proof (same/fresh nonce, Pitfall 8)
- `supabase/functions/analyze-resume/__tests__/runtime-validation-convergence.test.ts` - valid Free converges + invalid/truncated/empty → typed AnalysisErrorCode
- `supabase/functions/analyze-resume/__tests__/byte-preserve.test.ts` - D-10 Free/Pro/Elite deep-equal through resumeAnalysisSchema
- `supabase/functions/analyze-resume/__tests__/cors-matrix.test.ts` - apex+www status matrix (ACAO + Vary) + evil fail-closed
- `supabase/functions/analyze-resume/__tests__/streaming-wrapper-ordering.test.ts` - create_or_recover→reserve-with-key→settle-on-saved ordering, no refund post-settle
- `supabase/functions/deno.json` - registered all five new tests in the test:ci allowlist
- `src/hooks/__tests__/useAnalysisRun.test.ts` - added a submit-lock (isActive) describe block (3 tests)

## Decisions Made
- Task 3's dormancy-guard update was a no-op: 05-01 already migrated analyze-resume and kept career_compass + the resume/career job workers asserted dormant, so Task 3 reduced to the deno.json registration + baseline run.
- The streaming-wrapper no-refund-post-settle assertion targets the SUCCESS TAIL slice (settle CAS → `catch (err)`) instead of the executor-style whole-file post-CAS slice, because the wrapper's generating-stage catch refund is lexically after the settle CAS yet is unreachable once completed (it is the pre-saving error path). Added a complementary assertion that ≥2 pre-settle refund branches precede the CAS.
- Operator-approved live verification (Task 4) recorded as normal flow: prod CORS re-proof (apex+www echo ACAO+Vary incl. 401, evil fail-closed), staging first-byte latency no-regression, refresh/navigation recovery, and ascending-blast-radius flag-flip staging (Onboarding then Resume). Read-only prod; no migration; advisor floor 15 unchanged.

## Deviations from Plan

None - plan executed exactly as written. The only notable observation is that Task 3's dormancy-guard edit was already satisfied by 05-01 (no code change owed there); the registration + baseline steps ran as specified.

## Issues Encountered
- `grep -c "analyze-resume/__tests__" deno.json` returns 1 (the test:ci allowlist is a single line), not 5. Confirmed the intended registration with `grep -o … | wc -l` = 5 occurrences. No code impact — the acceptance intent (all five files registered) is satisfied and `deno task test:ci` exercises all five.

## User Setup Required
None - no external service configuration required. The operator flag-flip soak (ANALYSIS_LIFECYCLE_ONBOARDING then ANALYSIS_LIFECYCLE_RESUME, master kill-switch ANALYSIS_LIFECYCLE_ENABLED) is a deliberate post-approval operator action; the code ships dormant-capable with byte-identical legacy fall-through.

## Next Phase Readiness
- FEAT-01/FEAT-02 verification is folded into the blocking gate and green; the D-12 CORS + D-01 latency invariants are re-proved live. Phase 5 is ready for gsd-verifier phase verification.
- Phase 6 (Career Compass) inherits the same guard pattern; career_compass + the submit-/process- job workers remain asserted dormant in the dormancy guard until their migration lands.

---
*Phase: 05-feature-migration-b-resume-analysis-onboarding*
*Completed: 2026-07-06*

## Self-Check: PASSED
- All 5 created guard files present + 05-03-SUMMARY.md present
- Task commits 01393bd7, 5ca4db8e, b7c76569 all found in git history
- deno task test:ci: 1056 passed / 0 failed / 12 ignored; frontend vitest: 498 passed / 0
- 5 occurrences of analyze-resume/__tests__ registered in deno.json test:ci
