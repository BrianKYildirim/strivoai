***

phase: 31-optimistic-ui-refund-verification
verified: 2026-05-20T00:00:00Z
status: passed
score: 14/14 must-haves verified
overrides\_applied: 0
---------------------

# Phase 31: Optimistic UI Refund Verification — Verification Report

**Phase Goal:** Make the merit balance feel responsive on click (optimistic deduct) and prove that refund-on-failure works end-to-end across all 5 sync paths AND both async workers post-Phase-26 merge.
**Verified:** 2026-05-20
**Status:** passed
**Re-verification:** No — initial verification

***

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                                               | Status   | Evidence                                                                                                                                                                                                    |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | useMerits() exposes optimisticDeduct(cost) returning { rollback, commit }                                                                                           | VERIFIED | `src/hooks/useMerits.ts` line 17 (interface), line 83 (implementation), line 121 (returned object)                                                                                                          |
| 2  | optimisticDeduct writes the decremented total into the nested { balance, tier } shape                                                                               | VERIFIED | `useMerits.ts` lines 89–91: `setQueryData(key, { ...previous, balance: { ...previous.balance, total: prevTotal - cost } })` — not a flat write                                                              |
| 3  | rollback() restores the captured snapshot synchronously then invalidates merit-balance                                                                              | VERIFIED | Lines 97–102: `setQueryData(key, previous)` then `invalidateQueries`                                                                                                                                        |
| 4  | commit() invalidates merit-balance to trigger an authoritative refetch                                                                                              | VERIFIED | Lines 104–105: calls only `invalidateQueries({ queryKey: ['merit-balance'] })`                                                                                                                              |
| 5  | getMeritErrorMessage returns { title, description } per error class, never "Something went wrong"                                                                   | VERIFIED | `src/lib/merit-error-messages.ts` — 7-class lookup table; 11 Vitest cases including the no-generic rule                                                                                                     |
| 6  | Refundable AI-error rows mention refund status; 4xx/validation rows do NOT mention merits                                                                           | VERIFIED | Test file confirms 5xx/529/408/network descriptions say "Merits were refunded"; 400 description passes `/merit\|refund\|charge/i` absence test                                                              |
| 7  | invokeAnthropicText short-circuits to { ok: false, status, error } when MERIT\_TEST\_FORCE\_REFUNDABLE\_ERROR is set AND the host is staging                        | VERIFIED | `anthropic.ts` line 544: `const forcedRefundable = refundableErrorOverride()` at top of invokeAnthropicText with early return                                                                               |
| 8  | streamAnthropicText yields { type: 'error', status, message } under the same staging-gated condition                                                                | VERIFIED | `anthropic.ts` line 724: `refundableErrorOverride()` at top of streamAnthropicText with early yield                                                                                                         |
| 9  | On production hosts the flag is ignored — the override returns null regardless of the flag value                                                                    | VERIFIED | `anthropic.ts` lines 532–541: `isStaging = url.includes('cimjltzovkahkqecpwgi') \|\| STRIVO_ENV === 'staging'`; returns null if not staging                                                                 |
| 10 | Each of the 5 submit paths calls optimisticDeduct(cost) before the network call                                                                                     | VERIFIED | useResumeStream.ts:117, CareerCompass.tsx:493, LinkedInGrader.tsx:391, RecruitingLens.tsx:404, InterviewPrep.tsx:264                                                                                        |
| 11 | On success each path calls commit(); on refundable failure each path calls rollback()                                                                               | VERIFIED | All 5 files: commit() on success, rollback() on error confirmed by grep                                                                                                                                     |
| 12 | No path renders "Something went wrong"                                                                                                                              | VERIFIED | Grep across all 5 modified frontend files returns no matches                                                                                                                                                |
| 13 | Gateway-level test exhaustively covers refund-on-failure across every refundable class; each test asserts the forced error was returned BEFORE asserting the refund | VERIFIED | `merit-gateway.refund.test.ts` lines 317–338: forced-error assertion precedes balance assertion per Pitfall 3 guard; 5 refundable classes (500, 529, 408, AbortError→408, network) + 7 per-path smoke tests |
| 14 | MER-06 replay test calls refund\_merits twice: first -> refunded + balance restored; second -> already\_refunded + balance UNCHANGED                                | VERIFIED | `merit-refund-idempotency.test.ts` lines 158–207: two-call pattern with exact assertEquals equality on both balance states                                                                                  |

**Score:** 14/14 truths verified

***

### Required Artifacts

| Artifact                                                      | Expected                                                                                | Status   | Details                                                                                                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useMerits.ts`                                      | optimisticDeduct closure-captured snapshot API                                          | VERIFIED | Contains `optimisticDeduct` in interface (line 17), implementation (line 83), and return (line 121); nested cache shape preserved                                                                       |
| `src/lib/merit-error-messages.ts`                             | Single shared error-class toast taxonomy                                                | VERIFIED | Exports `getMeritErrorMessage` as sole named export; flat function + lookup table (no class, no hook)                                                                                                   |
| `src/lib/merit-error-messages.test.ts`                        | Vitest coverage of every error class + refund-mention rule                              | VERIFIED | 11 test cases; covers all 7 error classes, refund-mention rule, NFR-04 no-generic-copy rule                                                                                                             |
| `supabase/functions/_shared/anthropic.ts`                     | Staging-gated MERIT\_TEST\_FORCE\_REFUNDABLE\_ERROR fault-injection at both chokepoints | VERIFIED | `refundableErrorOverride()` defined (line 533) + called at both `invokeAnthropicText` (line 544) and `streamAnthropicText` (line 724); `AI_FORCE_FAILURE` branch untouched                              |
| `src/hooks/useResumeStream.ts`                                | optimisticDeduct fired on stream start; commit on complete, rollback on error           | VERIFIED | Lines 97, 117–350: single settle per stream start with `settled` flag guard; commit on complete/recovered; rollback on every failure branch                                                             |
| `src/pages/CareerCompass.tsx`                                 | async poll-loop optimistic settle (held closure)                                        | VERIFIED | Lines 82, 489–664: outer-scoped nullable `let settle` before submit; commit on `completed`; rollback on failed/timeout/catch; `getMeritErrorMessage` imported and used                                  |
| `src/pages/LinkedInGrader.tsx`                                | sync optimistic settle + getMeritErrorMessage                                           | VERIFIED | Lines 19, 129, 391–444: settle before network call; commit on success; rollback + getMeritErrorMessage on error                                                                                         |
| `src/pages/RecruitingLens.tsx`                                | result-wrapper optimistic settle + getMeritErrorMessage                                 | VERIFIED | Lines 5, 381, 404–465: settle before network call; commit on success; rollback + getMeritErrorMessage on error                                                                                          |
| `src/pages/InterviewPrep.tsx`                                 | result-wrapper optimistic settle + getMeritErrorMessage (replaces mapServerError)       | VERIFIED | Lines 23, 192, 264–303: `mapServerError` removed; `mapBespokeGateError` retains 3 feature-specific gates; generic errors → getMeritErrorMessage; JSX heading no longer hardcodes "Something went wrong" |
| `supabase/functions/_shared/merit-gateway.refund.test.ts`     | Exhaustive gateway refund coverage + 7 per-path smoke tests (MER-05)                    | VERIFIED | File exists; exhaustive class coverage + 7 per-path smoke tests; GATED pattern; vacuous-pass guard; teardownTestUser in finally                                                                         |
| `supabase/functions/_shared/merit-refund-idempotency.test.ts` | MER-06 refund\_merits double-call replay test                                           | VERIFIED | File exists; two-call replay pattern with `assertEquals` exact equality on both calls                                                                                                                   |
| `scripts/run-edge-tests.ps1`                                  | Registration of both new test files in the explicit runner list                         | VERIFIED | Lines 34–35 confirm both `merit-gateway.refund.test.ts` and `merit-refund-idempotency.test.ts` appear in the backtick-continued file list                                                               |

***

### Key Link Verification

| From                                     | To                                                                  | Via                                                                     | Status | Details                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `useMerits.optimisticDeduct`             | queryClient cache key `['merit-balance', userId]`                   | `getQueryData` snapshot + `setQueryData` nested shape                   | WIRED  | Lines 85–91 in useMerits.ts confirm snapshot captured and written back with `balance:` key                |
| `getMeritErrorMessage`                   | sonner `toast.error(title, { description })` callers                | `{ title, description }` return shape                                   | WIRED  | All 5 wiring sites destructure `{ title, description }` from getMeritErrorMessage and pass to toast.error |
| `refundableErrorOverride()`              | `invokeAnthropicText` + `streamAnthropicText`                       | early-return / early-yield before any Anthropic network call            | WIRED  | anthropic.ts lines 544, 724 — top of both functions                                                       |
| `refundableErrorOverride()` staging gate | `SUPABASE_URL` / `STRIVO_ENV`                                       | substring match on staging project-ref OR STRIVO\_ENV sentinel          | WIRED  | anthropic.ts lines 532–541 — `cimjltzovkahkqecpwgi` substring OR `STRIVO_ENV === 'staging'`               |
| `merit-gateway.refund.test.ts`           | MERIT\_TEST\_FORCE\_REFUNDABLE\_ERROR + endpoint call + readBalance | set flag → call → assert forced error → assert balance restored to seed | WIRED  | Tests assert forced error before balance; `assertEquals` exact equality                                   |
| `merit-refund-idempotency.test.ts`       | `refund_merits` RPC                                                 | two RPC calls on one seeded merit\_transactions row                     | WIRED  | `client.rpc('refund_merits', ...)` called twice; second asserts `already_refunded` + unchanged balance    |
| `scripts/run-edge-tests.ps1`             | both new test files                                                 | appended to explicit backtick-continued file list                       | WIRED  | Lines 34–35 confirmed                                                                                     |

***

### Data-Flow Trace (Level 4)

This phase delivers client-side optimistic UI and backend test infrastructure, not data-rendering components. The optimistic deduct flow is display-only (never sent to the server as truth); the authoritative balance is always refetched from `get_merit_balance` RPC on `commit()` or `rollback()`. No hollow-prop or disconnected data risk applies.

***

### Behavioral Spot-Checks

The phase's behavioral correctness for MER-05/MER-06 was proven by the operator-gated staging run rather than local spot-checks (by design — the tests require a live Supabase staging environment). See Probe Execution below.

***

### Probe Execution

| Probe                                                       | Command                                                                                                   | Result                                                                                                                                                                                                                                         | Status |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `scripts/run-edge-tests.ps1` (gated staging, MER-05/MER-06) | `DENO_TEST_SUPABASE_REMOTE=1` + staging creds + `MERIT_TEST_FORCE_REFUNDABLE_ERROR=529` on staging fn env | **244 passed / 0 failed** — refund tests executed against staging (not SKIP path); balance restored to seed on every refundable class; MER-06 replay returned `already_refunded` with zero mutation. Evidence in `31-STAGING-VERIFICATION.md`. | PASS   |

**Note on non-gated local run:** The refund test files SKIP cleanly in non-gated/local runs (no `DENO_TEST_SUPABASE_REMOTE=1` + staging creds). This is the intended design per the GATED pattern. The SKIP behavior is itself verified by the always-on self-check test at the bottom of each file. The authoritative evidence for MER-05/MER-06 is the gated staging run recorded in `31-STAGING-VERIFICATION.md` (operator-confirmed, 2026-05-20).

***

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                   | Status    | Evidence                                                                                                          |
| ----------- | ------------ | ----------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| MER-03      | 31-01, 31-03 | Optimistic merit balance UI decrement immediately on click                    | SATISFIED | `optimisticDeduct` in useMerits + wired in all 5 submit paths                                                     |
| MER-05      | 31-02, 31-04 | Refund-on-failure across all 5 sync paths AND both async workers              | SATISFIED | Staging-gated suite passed 244/0; gated by operator evidence in 31-STAGING-VERIFICATION.md                        |
| MER-06      | 31-04        | Second refund\_merits call returns already\_refunded with no balance mutation | SATISFIED | `merit-refund-idempotency.test.ts` + staging run confirmed                                                        |
| NFR-03      | 31-01, 31-03 | Optimistic restore within 2s of error (refetch fires on error path)           | SATISFIED | `rollback()` calls `setQueryData` synchronously (no DB round-trip) then `invalidateQueries`; restore is immediate |
| NFR-04      | 31-01, 31-03 | Specific failure-mode toasts, never "Something went wrong"                    | SATISFIED | `getMeritErrorMessage` 7-class taxonomy; grep confirms absence of "Something went wrong" in all 5 wired files     |

***

### Anti-Patterns Found

No TBD, FIXME, or XXX markers found in any file modified by this phase. No stub implementations, no hardcoded empty returns, no generic error copy in the modified frontend paths.

***

### Human Verification Required

None. All automated checks pass and MER-05/MER-06 behavioral proof was provided via the operator-gated staging run (not a human-visual check — a deterministic test suite against a live backend). The visual "balance digit drops on click" behavior is the only item that strictly requires a browser session; it is covered by the manual phase gate in `31-VALIDATION.md` and is a cosmetic timing concern, not a correctness blocker given that the optimistic deduct implementation is fully verified structurally.

***

### Gaps Summary

No gaps. All 14 must-have truths verified against actual codebase files. All referenced commits (b82044d, 5dacbaf, 9b819dd, e0ff4af, a434e45, 3b33453, 273ff08, 53775da, 2832b36, 1601861, ece7e54) confirmed present in git log. The operator staging evidence (31-STAGING-VERIFICATION.md) is the authoritative proof for MER-05/MER-06; the verify-only nature of Plan 31-04 (no production code changes to merit-gateway.ts or the migration) is correct by design — the tests prove existing shipped behavior.

***

_Verified: 2026-05-20_
_Verifier: Claude (gsd-verifier)_
