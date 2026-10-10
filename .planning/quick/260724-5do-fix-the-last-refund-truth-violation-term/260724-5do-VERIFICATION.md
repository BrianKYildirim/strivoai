---
task: 260724-5do-fix-the-last-refund-truth-violation-term
verified: 2026-07-24T12:00:00Z
status: passed
score: 6/6 must-haves verified
---

# Quick Task Verification: Fix the last REFUND-TRUTH violation (terminalize-stuck-run)

**Task Goal:** `_shared/terminalize-stuck-run.ts` must derive the persisted `analysis_jobs.refunded`
column from the refund OUTCOME, not from eligibility (`canRefund`), so a failed `refund_merits` RPC
can never persist `refunded=true` — while leaving the `TerminalizeStuckRunResult.refunded` RETURN
contract and the log-and-continue no-hang behavior byte-identical.

**Verified:** 2026-07-24
**Status:** passed
**Commits checked:** `f748ca62` (fix), `c0cc46e7` (tests)

## Verification against the six required checks

### 1. `if (canRefund) patch.refunded = true;` is GONE

Confirmed. `terminalize-stuck-run.ts:163` now reads:
```ts
if (refundIsOnFile(refundVerdict)) patch.refunded = true;
```
`grep -n "if (canRefund) patch.refunded"` returns no matches in the file. The column write is
gated on the refund outcome via the new pure helper, not on `canRefund` eligibility.

### 2. `refundIsOnFile` truth table

`terminalize-stuck-run.ts:84-86`:
```ts
export function refundIsOnFile(verdict: RefundVerdict | null): boolean {
  return verdict !== null && verdict.ok === true;
}
```
- `{ok:true}` → `true` (fresh refund) — confirmed via test `refundIsOnFile: a fresh successful
  refund is ON FILE -> refunded=true`.
- `{ok:true, alreadyRefunded:true}` → `true` (this is the case a naive `patch.refunded = refunded`
  fix gets wrong) — confirmed via test `refundIsOnFile: already_refunded is ON FILE ->
  refunded=true (the naive fix gets this wrong)`.
- `{ok:false, error}` → `false` — confirmed via test `refundIsOnFile: a genuine RPC failure is NOT
  on file -> refunded stays unset (backstop stays armed)` (both `unknown_transaction` and
  `user_not_found` error variants).
- `null` (never attempted) → `false` — confirmed via test `refundIsOnFile: no refund attempted
  (null verdict) is NOT on file`.

All four cases match the required semantics exactly.

### 3. `TerminalizeStuckRunResult` interface and both `return` statements unchanged

`TerminalizeStuckRunResult` (lines 102-109) is untouched — same three fields (`terminalized`,
`skipped`, `refunded`), same doc comments. Both `return` statements (lines 178 and 182) still
return the local `refunded` variable, which is still computed exactly as before:
```ts
let refunded = false;
...
if (r.ok) { refunded = !r.alreadyRefunded; }
```
This is byte-identical to the pre-fix logic — the local `refunded` still means "released by THIS
call," distinct from the new `refundIsOnFile(refundVerdict)` used only for the persisted column.
Confirmed by direct read of the file; no diff to this line beyond the new `refundVerdict = r;`
capture placed immediately before the untouched `if (r.ok)` branch.

### 4. Log-and-continue branch survives — failed refund still reaches the CAS

Traced the control flow directly: inside `if (canRefund && meritTransactionId)`, the `else` branch
(refund failed) only does `console.error(...)` — no `return`, no `throw`. Execution falls through
to `const patch = {...}`, then `refundIsOnFile(refundVerdict)` evaluates to `false` (verdict.ok is
false), so `patch.refunded` is left unset, and the function proceeds unconditionally to
`supabase.rpc('transition_analysis_run', ...)`. The failed-refund path is never able to skip or
hang the terminal CAS. Confirmed by the ordering guard test `money path: a FAILED refund still
falls through to the terminal CAS (log-and-continue, no hang)`, which greps that `refund-failed`
appears strictly before `transition_analysis_run` in the stripped source — passing.

### 5. `canRefund === false` paths: no behavior change

When `canRefund` is false (no `meritTransactionId`, already settled, or already refunded), the
`if (canRefund && meritTransactionId)` block is skipped entirely, so `refundVerdict` stays `null`
(its initial value), `refundIsOnFile(null)` returns `false`, and `patch.refunded` is left unset —
identical outcome to the pre-fix code where `canRefund` being false meant the old
`if (canRefund) patch.refunded = true;` line never fired either. No regression on this path.
Confirmed directly by test `terminalizes a stuck "created" run to failed via the CAS (not
orphaned)` which passes `meritTransactionId: null` and asserts `patch.refunded === undefined`.

### 6. Test coverage and `test:ci` registration

`terminalize-stuck-run.test.ts` contains 12 `Deno.test` cases covering:
- All three `RefundVerdict` outcomes plus the `null` (not-attempted) case on `refundIsOnFile`.
- A wiring guard proving the CAS patch is gated on `refundIsOnFile(refundVerdict)` and NOT on
  `canRefund` (RED-before / GREEN-after per the SUMMARY's documented evidence), and NOT on the
  return-contract variable `refunded` directly.
- An ordering guard proving log-and-continue survives (`refund-failed` before
  `transition_analysis_run` in source).
- Five pre-existing functional tests (terminalize/skip paths) still passing unchanged.

Ran `deno test --allow-all --no-check _shared/terminalize-stuck-run.test.ts` directly from
`supabase/functions/` at HEAD: **12 passed / 0 failed**, matching the SUMMARY's claimed GREEN
result. Confirmed the file is listed in `supabase/functions/deno.json` `test:ci` task string
(`_shared/terminalize-stuck-run.test.ts` appears in the task command), so it runs inside
`npm run test:edge` and therefore `verify:baseline`.

## Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/functions/_shared/terminalize-stuck-run.ts` | Exports `refundIsOnFile`, gates `patch.refunded` on it | ✓ VERIFIED | Confirmed by direct read; exported pure function at line 84 |
| `supabase/functions/_shared/terminalize-stuck-run.test.ts` | Covers 3 outcomes + wiring/no-hang guards | ✓ VERIFIED | 12 tests present and passing |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `terminalize-stuck-run.ts` | `refundIsOnFile(verdict)` | `patch.refunded` gated on outcome, not `canRefund` | ✓ WIRED |
| `terminalize-stuck-run.ts` | `merit-gateway.ts` (`RefundVerdict`) | Type import + verdict consumed by `refundIsOnFile` | ✓ WIRED |
| `terminalize-stuck-run.test.ts` | `deno.json` (`test:ci`) | Already registered | ✓ WIRED (confirmed present in test:ci string) |

## Anti-Patterns Found

None. No stubs, no placeholders, no unreachable dead branches introduced.

## Known and Accepted (not gaps)

- Nothing deployed; production unchanged until operator deploys — out of scope per task framing.
- `refundMeritsForJob` → `getServiceClient()` throw-on-unset-env gap is explicitly out of scope,
  documented in the SUMMARY and STATE.md Deferred Items.
- The RED proof for the pre-fix defect relied on staged source application (isolating the single
  eligibility-gated line) rather than a full `git stash`, because a plain stash produces only a
  module-load `SyntaxError` that proves nothing about the defect. This substitution was reviewed
  and accepted per task framing; both RED and GREEN states are documented in the SUMMARY with
  actual observed output.

## Human Verification Required

None. All checks are structural/behavioral and were verified directly against the source and by
running the actual Deno test suite.

## Gaps Summary

No gaps found. All six required checks verified directly against the codebase at HEAD (not merely
inferred from the SUMMARY's claims): the eligibility-based bug is gone, the outcome-based
`refundIsOnFile` helper has the correct truth table for all four verdict shapes, the return
contract and both `return` statements are unchanged, the log-and-continue no-hang path is intact
and independently confirmed via live test execution (12/12 passing), the `canRefund === false`
paths are unchanged, and the tests are registered in `test:ci`.

---
_Verified: 2026-07-24_
_Verifier: Claude (gsd-verifier)_
