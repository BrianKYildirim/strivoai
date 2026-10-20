---
task: 260724-4cc-close-the-two-phase-02-money-path-gates-
verified: 2026-07-24T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Quick 260724-4cc: Close the Two Phase 02 Money-Path Gates — Verification Report

**Task Goal:** Close the two Phase 02 money-path gates — (A) persist `merit_transaction_id` in the
streaming lifecycle twin `runResumeStreamingLifecycle` so a dead worker's Merit reservation is
recoverable by the reaper, and (B) make `refundMeritsForJob` fail closed on `refund_merits`
business errors so no caller can persist `refunded=true` without a real ledger refund, plus
operator-confirmed (B2) capturing the actual refund result at the three hardcoded
`refunded: true` sites in analyze-resume's streaming path.

**Verified:** 2026-07-24
**Status:** passed
**Commits checked:** 743cc83d, 6c27b0a0, acae6abc (plus a4e2983d docs commit, not part of the diff)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Streaming twin persists `merit_transaction_id` on `reserving_merits -> extracting_data` | VERIFIED | `analyze-resume/index.ts:1066-1068` — `transitionResumeRun(..., 'reserving_merits', 'extracting_data', { merit_transaction_id: transactionId })`, byte-identical shape to `_shared/analysis-lifecycle.ts:324-326` |
| 2 | Cache-hit and MERIT_RESERVATION_FAILED branches carry NO `merit_transaction_id` | VERIFIED | `index.ts:1045-1048` (`'reserving_merits','failed'` patch is `{failure_code, failure_stage}` only) and `index.ts:1054` (`'reserving_merits','completed'` — no patch argument at all) |
| 3 | `refundMeritsForJob` fails closed on `unknown_transaction`/`user_not_found`/any unrecognized error | VERIFIED | `classifyRefundRpcResult` (`merit-gateway.ts:364-371`) returns `{ok:false, error:err}` for any non-`already_refunded` string; behavioral tests pass (8/8) |
| 4 | Success and `already_refunded` paths behaviorally unchanged | VERIFIED | Same return shapes, same `merit-refund` / `merit-refund-already-refunded` log events (`merit-gateway.ts:400-405`); pre-existing `merit-gateway-already-refunded.test.ts` still passes (4/4) |
| 5 | No `refunded: true` literal remains in the streaming path; 3 sites capture real result | VERIFIED | `rg "refunded: true" analyze-resume/index.ts` → 0 hits; `index.ts:1199-1265` all three sites do `const refund = await refundMeritsForJob(...)` then `refunded: refund.ok` |
| 6 | Both new test files registered in `deno.json` test:ci | VERIFIED | `rg -c` on both names in `test:ci` string returns 1 each |
| 7 | Parity guard genuinely reads BOTH twins | VERIFIED | `analysis-lifecycle.reserve-persist-parity.test.ts:55-58` drives an explicit `TWINS` array over `./analysis-lifecycle.ts` and `../analyze-resume/index.ts`, unlike the pre-existing `refund-boundary.test.ts` which only reads the `_shared` twin |

**Score:** 7/7 truths verified (5 primary must-haves + 2 supporting checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/functions/analyze-resume/index.ts` | Persists `merit_transaction_id`; 3 refund sites capture result | VERIFIED | Confirmed by direct read, lines 1066-1068, 1199-1265 |
| `supabase/functions/_shared/merit-gateway.ts` | Exported `classifyRefundRpcResult`, wired into `refundMeritsForJob` | VERIFIED | Lines 352-406 |
| `supabase/functions/_shared/analysis-lifecycle.reserve-persist-parity.test.ts` | Static parity guard, both twins + 2 negatives | VERIFIED, ran: 4/4 pass |
| `supabase/functions/_shared/__tests__/merit-gateway-refund-business-errors.test.ts` | Behavioral classifier tests + wiring greps | VERIFIED, ran: 8/8 pass |
| `supabase/functions/deno.json` | Both new files in `test:ci` | VERIFIED |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `analyze-resume/index.ts runResumeStreamingLifecycle` | `analysis_jobs.merit_transaction_id` | `transitionResumeRun(..., 'reserving_merits', 'extracting_data', {merit_transaction_id: transactionId})` | WIRED |
| `merit-gateway.ts refundMeritsForJob` | `classifyRefundRpcResult` | `classifyRefundRpcResult(data)` at line 390 | WIRED |
| `analyze-resume/index.ts` 3 refund sites | `refund.ok` | `refunded: refund.ok` at lines 1205, 1243, 1265 | WIRED |

### Regression Checks

Ran directly (not merely trusted from SUMMARY):
- `_shared/analysis-lifecycle.reserve-persist-parity.test.ts` — 4/4 pass
- `_shared/__tests__/merit-gateway-refund-business-errors.test.ts` — 8/8 pass
- `_shared/__tests__/merit-gateway-already-refunded.test.ts` — 4/4 pass (success/already_refunded paths unchanged)
- `_shared/analysis-lifecycle.refund-boundary.test.ts` — 8/8 pass (includes the pre-existing D9-08 executor-twin guard, still green)
- `analyze-resume/__tests__/idempotency-repeated-run.test.ts` — 10/10 pass
- `analyze-resume/refund-after-save.test.ts` — 5/5 pass
- `analyze-resume/__tests__/streaming-wrapper-ordering.test.ts` — 8/8 pass (Pitfall-2 ordering guards intact)

Total ad-hoc run: 47/47 passing across the affected + regression suites.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder markers in the touched code. No stub returns.

### Known and Accepted (not gaps, per task scope)

- Nothing deployed — `deployed: false` confirmed in SUMMARY frontmatter and by design (Task 3 explicitly forbids `supabase functions deploy`). Production behavior unchanged until operator deploy.
- `_shared/terminalize-stuck-run.ts:136` (`if (canRefund) patch.refunded = true;`) has the same REFUND-TRUTH defect but was out of scope; already logged as a deferred item in the SUMMARY and (per task instructions) in STATE.md.

### Human Verification Required

None. All must-haves are statically verifiable in code and via the Deno test suite; no runtime/production behavior claims are made (explicitly not deployed).

### Gaps Summary

No gaps. All five must-have truths hold against the actual HEAD codebase (commits 743cc83d,
6c27b0a0, acae6abc): the streaming twin now persists `merit_transaction_id` identically to the
executor twin, the cache-hit and reservation-failed branches are correctly left unpatched, the
refund classifier fails closed by default with success/already_refunded paths byte-identical,
all three hardcoded `refunded: true` streaming-path sites now capture the real refund result, both
new regression suites are registered inside `test:ci` (verified by direct `deno test` invocation,
not just SUMMARY claims), and the parity guard is a genuine dual-twin check rather than a
single-twin guard in disguise.

---

_Verified: 2026-07-24_
_Verifier: Claude (gsd-verifier)_
