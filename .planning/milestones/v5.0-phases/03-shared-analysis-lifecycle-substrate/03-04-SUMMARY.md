---
phase: 03-shared-analysis-lifecycle-substrate
plan: 04
subsystem: infra
tags: [merit-gateway, idempotency, lifecycle-executor, deno, edge-functions, feature-flags, retry, cas]

# Dependency graph
requires:
  - phase: 03-01
    provides: create_or_recover_analysis_run + transition_analysis_run CAS RPCs; 11-state ledger; financial CHECK
  - phase: 03-02
    provides: deriveIdempotencyKey (SHA-256 intent hash)
  - phase: 03-03
    provides: validateModelOutput; AnalysisErrorCode + ANALYSIS_ERROR_TABLE; computeBackoffMs
  - phase: 02-05
    provides: withMerits 4-arg idempotency seam; refundMeritsForJob; isRefundableAnthropicError
provides:
  - runAnalysisLifecycle — ordered executor sequencing created->...->completed via CAS transitions
  - classifyFailure — transient/permanent partition for LIFE-06 retry split
  - ANALYSIS_LIFECYCLE_ENABLED master flag + isAnalysisFeatureEnabled per-feature dormancy gate
  - Single-source idempotency-key threading (run-level + Merit-level dedup on one value)
  - Refund-exactly-once-pre-saving + settle-on-saved financial discipline (static-guarded)
affects: [04-feature-migration-recruiting-linkedin, 05-feature-migration-resume-onboarding, 06-feature-migration-career-compass, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordered lifecycle executor that maps INTO analysis_jobs via CAS (no second state machine, Pitfall 4)"
    - "Single-source idempotency key derived once pre-RPC, threaded to run-level + Merit-level dedup"
    - "Lexical refund boundary: refundMeritsForJob only reachable before saving->completed; static drift guard"
    - "Two-level ascending-blast-radius dormancy flags (master AND per-feature, fail-closed exact-'true')"

key-files:
  created:
    - supabase/functions/_shared/analysis-lifecycle.ts
    - supabase/functions/_shared/analysis-lifecycle.classifier.test.ts
    - supabase/functions/_shared/analysis-lifecycle.refund-boundary.test.ts
    - supabase/functions/_shared/analysis-flags.ts
    - supabase/functions/_shared/analysis-flags.test.ts
  modified: []

key-decisions:
  - "Dormancy flags use STRICT case-sensitive exact-'true' (not merit-gateway's .toLowerCase()) — a fail-closed dormancy switch must reject any non-exact value ('True'/'1'/'yes' -> OFF)"
  - "withMerits fn is trivial (returns txId) so the gateway never auto-refunds; the executor owns the refund boundary explicitly via refundMeritsForJob in pre-saving failure paths"
  - "Save failure rests in retryable_failed WITH a refund (an unsaved result must not be charged) — pre-saving, so refund is still within the allowed boundary"
  - "Retry cap = MAX_TRANSIENT_RETRIES (3); transient exhaustion -> retryable_failed for the frontend Retry / reaper"
  - "classifyFailure fail-closed default is permanent (UNKNOWN_ANALYSIS_ERROR) — an unclassified error is never auto-retried (T-03-12 DoS guard)"

patterns-established:
  - "Static-source drift guards for financial invariants (refund-boundary slice + single-source-key regex)"
  - "Cold-start module-scope flag reads with dynamic-import cache-busting for env-flag unit tests"

requirements-completed: [LIFE-03, LIFE-04, LIFE-06]

# Metrics
duration: 8min
completed: 2026-07-02
---

# Phase 3 Plan 04: Shared Analysis Lifecycle Executor Summary

**`runAnalysisLifecycle` — the dormant ordered executor that sequences the full analysis lifecycle through the 03-01 CAS RPCs, reserves Merits on the single-source 03-02 key, strictly validates via 03-03, settles only on a verified save, refunds exactly once only pre-`saving`, and auto-retries only transient failures with bounded backoff.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-02T13:12:55Z
- **Completed:** 2026-07-02T13:21:12Z
- **Tasks:** 3
- **Files created:** 5

## Accomplishments
- `analysis-lifecycle.ts` executor drives `created -> validating_inputs -> reserving_merits -> extracting_data -> generating -> validating_output -> saving -> completed`, each arrow a `transition_analysis_run` CAS — states map INTO analysis_jobs, no parallel state machine (Pitfall 4).
- Single-source idempotency key: derived exactly ONCE before any RPC, threaded as `p_idempotency_key` to `create_or_recover_analysis_run` AND assigned to `meritCtx.idempotencyKey` for `withMerits` (run-level + Merit-level dedup on the identical value — LIFE-05, statically guarded).
- Financial discipline: `refundMeritsForJob` lexically reachable ONLY from pre-`saving` failure paths (Pitfall 2); `merit_settled=true` set ONLY in the `saving -> completed` CAS patch, gated on a verified durable save (Pitfall 3). Both enforced by a static drift guard.
- `classifyFailure` splits transient (timeout/rate-limit/network/5xx via `isRefundableAnthropicError` + retryable-status) from permanent (missing input/invalid output/auth/schema); transient auto-retries in-process with `computeBackoffMs` up to 3, permanent -> `failed`, exhaustion -> `retryable_failed` (LIFE-06).
- Dormancy: `analysis-flags.ts` two-level gate (master `ANALYSIS_LIFECYCLE_ENABLED` AND per-feature) default OFF; `runAnalysisLifecycle` early-returns a no-op unless enabled. Confirmed no feature edge function imports the module.

## runAnalysisLifecycle signature

```ts
runAnalysisLifecycle<T, E = unknown>(params: AnalysisLifecycleParams<T, E>): Promise<AnalysisLifecycleResult<T>>
```
`params` = { feature, meritFeature, ctx{userId,tier,corsType}, jobType, resumeId?, payload?, inputIdentity, attemptNonce, validateInputs?, extract, generate, schema, validationOpts?, save, maxRetries? }. Result is a discriminated union: `{ok:true; runId; value; transactionId}` | `{ok:false; dormant:true}` | `{ok:false; dormant:false; code; runId; response?}`.

## Refund made lexically post-save-unreachable

There is exactly ONE refund path — the `refundAndFail` closure — invoked only from the extract/generate/validate/save failure branches, all of which appear in source BEFORE the `saving -> completed` transition line. After that line the only code is the settle-CAS-noop log and the `ok:true` return: no `refundMeritsForJob`, no `throw new MeritRefundable`. The Task 3 static guard slices the source from `'saving', 'completed'` to EOF and asserts both tokens are absent, and that `merit_settled` appears only after a `saving` token.

## Retry cap

`MAX_TRANSIENT_RETRIES = 3` (overridable per-call via `params.maxRetries`). Each retry logs a `retry_count` patch and sleeps `computeBackoffMs(attempt)` (the shared 03-03 backoff: base 1000ms doubling, capped 3000ms + 0-400ms jitter).

## Task Commits

1. **Task 1: analysis-flags.ts master + per-feature dormancy flags** - `6f43552e` (feat)
2. **Task 2: analysis-lifecycle.ts executor + classifier + single-source-key test** - `ac7abacf` (feat)
3. **Task 3: static refund-boundary drift guard** - `95fe1808` (test)

## Files Created
- `supabase/functions/_shared/analysis-flags.ts` - master + 5 per-feature dormancy flags, `isAnalysisFeatureEnabled`
- `supabase/functions/_shared/analysis-flags.test.ts` - 8 tests: default OFF, master-overrides-feature, both-required, fail-closed exact-'true'
- `supabase/functions/_shared/analysis-lifecycle.ts` - `runAnalysisLifecycle` executor + `classifyFailure`
- `supabase/functions/_shared/analysis-lifecycle.classifier.test.ts` - 15 tests: transient/permanent partition + static single-source-key
- `supabase/functions/_shared/analysis-lifecycle.refund-boundary.test.ts` - 4 tests: no refund/throw after saving->completed, settle-after-save

## Decisions Made
See key-decisions frontmatter. The notable one: the dormancy flags intentionally use STRICTER semantics than the `MERIT_SYSTEM_ENABLED` precedent (case-sensitive exact `=== 'true'`), because the plan's acceptance criteria require `'True'/'1'/'yes' -> false` and a dormancy safety switch must fail closed on any ambiguous value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dormancy flag semantics reconciled to fail-closed exact-'true'**
- **Found during:** Task 1 (analysis-flags.ts)
- **Issue:** The plan's Task 1 action quoted the `MERIT_SYSTEM_ENABLED` snippet `.toLowerCase() === 'true'` but its own acceptance examples require `'True'/'1'/'yes' -> false`. `.toLowerCase()` maps `'True' -> true`, directly contradicting the stated criteria and the "exact-lowercase-'true' fail-closed" intent.
- **Fix:** Implemented `readBoolFlag` as case-sensitive `=== 'true'` (no `.toLowerCase()`), so only the exact literal `'true'` enables. Kept the module-scope cold-start READ pattern from the merit-gateway precedent. Documented the stricter-than-precedent choice in the module header.
- **Files modified:** supabase/functions/_shared/analysis-flags.ts, supabase/functions/_shared/analysis-flags.test.ts
- **Verification:** analysis-flags.test.ts (8/8) asserts `'True'/'TRUE'/'tRuE'/'1'/'yes'/'on'/'' -> OFF`, only `'true'` -> ON.
- **Committed in:** `6f43552e` (Task 1 commit)

**2. [Process] TDD Task 2 committed as a single feat commit (not RED->GREEN split)**
- **Found during:** Task 2 (tdd="true")
- **Issue:** Task 2's automated verification is a pure-function classifier partition + a STATIC source assertion (single-source-key regex over the module text). A RED-first commit for a static-source guard is artificial — the guard cannot meaningfully "fail then pass" without the module existing.
- **Fix:** Wrote the executor and its classifier/single-source test together and committed once as `feat` with passing tests (15/15).
- **Files modified:** supabase/functions/_shared/analysis-lifecycle.ts, supabase/functions/_shared/analysis-lifecycle.classifier.test.ts
- **Verification:** classifier + single-source-key tests pass.
- **Committed in:** `ac7abacf`

---

**Total deviations:** 2 (1 bug-class reconciliation, 1 process). No scope creep — both keep the substrate within the plan's intent.
**Impact on plan:** The flag-semantics fix is necessary for the acceptance criteria to hold; the TDD process note is a commit-granularity choice, not a behavior change.

## Issues Encountered
- Bare `deno check _shared/analysis-lifecycle.ts` reports "Cannot find name 'Deno'" in dependency files — a missing `deno.ns` lib artifact of invoking `check` outside the project's task config. Not a code defect: the project runs all edge tests with `--no-check`, and no error is specific to the executor module. `deno.json` (test:ci registration) is owned by 03-07 and was NOT modified.

## User Setup Required
None - the substrate ships dormant. Enabling it later requires setting `ANALYSIS_LIFECYCLE_ENABLED=true` plus the relevant per-feature env var (`ANALYSIS_LIFECYCLE_<FEATURE>=true`) in Supabase edge secrets — deferred to the Phase 4/5/6 migrations.

## Next Phase Readiness
- Executor + flags + guards ship DORMANT and unwired: no feature imports `analysis-lifecycle.ts` (verified via grep).
- 03-07 owns registering the three new test files in `deno.json` test:ci / verify:baseline.
- Phase 4/5/6 feature migrations can now wire `runAnalysisLifecycle` behind their per-feature flag, supplying `inputIdentity` (opaque, never save-mutated) + `attemptNonce`, extract/generate/schema/save.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

## Self-Check: PASSED
All 5 created files present; all 3 task commits (6f43552e, ac7abacf, 95fe1808) exist. 27/27 tests pass (8 flags + 15 classifier/single-source + 4 refund-boundary). Dormant confirmed (no feature imports analysis-lifecycle.ts).
