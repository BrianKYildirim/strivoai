---
quick_id: 260724-4cc
type: execute
status: complete
completed: 2026-07-24
commits:
  - 743cc83d  # Task 1 — streaming twin persists merit_transaction_id + parity guard
  - 6c27b0a0  # Task 2 — fail closed on refund_merits business errors + phantom-refund fix
  - acae6abc  # Task 3 — vitest lane exclusion (deviation, Rule 3)
key-files:
  created:
    - supabase/functions/_shared/analysis-lifecycle.reserve-persist-parity.test.ts
    - supabase/functions/_shared/__tests__/merit-gateway-refund-business-errors.test.ts
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/_shared/merit-gateway.ts
    - supabase/functions/deno.json
    - vitest.config.ts
deployed: false
---

# Quick 260724-4cc: Close the Two Phase 02 Money-Path Gates — Summary

Both Phase 02 blocking money-path gates are closed in code: the streaming resume lifecycle now
persists its reserved `merit_transaction_id` (DURABLE MERIT HANDLE), and `refundMeritsForJob` now
fails closed on every `refund_merits` business error (REFUND TRUTH). Not deployed.

## What Changed

### A. DURABLE MERIT HANDLE — streaming twin persists the reservation id

`analyze-resume/index.ts` `runResumeStreamingLifecycle` made the
`reserving_merits -> extracting_data` transition with an **empty patch**, while the canonical twin
`_shared/analysis-lifecycle.ts:324` sent `{ merit_transaction_id: transactionId }`. Streaming is the
path Resume Free actually takes, so the D9-08 money leak was still open on the busiest route.

```
- await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'extracting_data');
+ await transitionResumeRun(supabase, log, runId, 'reserving_merits', 'extracting_data', {
+   merit_transaction_id: transactionId,
+ });
```

No signature change was needed — `transitionResumeRun` already accepted a patch (the
`MERIT_RESERVATION_FAILED` call passes one).

**Deliberately NOT patched**, per the money-path constraint — no reservation exists on either:
- the cache-hit short-circuit (`reserving_merits -> completed`, `gated.transactionId === 'cache-hit'`
  is a sentinel);
- the `MERIT_RESERVATION_FAILED` branch (`reserving_merits -> failed`, no deduction made).

Writing a handle on either would persist a bogus id the reaper would then try to refund. Both are
locked by explicit negative assertions.

### B. REFUND TRUTH — fail closed on business errors

`refundMeritsForJob` special-cased only `already_refunded`; `unknown_transaction` and
`user_not_found` fell through to the SUCCESS log and `return { ok: true }`.

New exported pure classifier `classifyRefundRpcResult` with a **default-deny** shape: any error
string that is not `already_refunded` returns `ok:false`, so a future fourth RPC error code can
never be silently reported as a completed refund.

Success and `already_refunded` paths are observably unchanged — same return shapes, same
`merit-refund` / `merit-refund-already-refunded` event names and fields. `merit-refund-failed` is
new and fires only on a genuinely-failed refund. The transport-error branch is untouched.

### B2. Phantom refunds in the streaming twin (operator-confirmed in scope)

`analyze-resume/index.ts` discarded the refund result at three pre-saving sites and hardcoded
`refunded: true`. Value capture only — no refund call moved, reordered, or added:

```
- await refundMeritsForJob(userId, transactionId, `generating:${c.code}`);
+ const refund = await refundMeritsForJob(userId, transactionId, `generating:${c.code}`);
      ...
-   refunded: true,
+   refunded: refund.ok,
```

Applied identically at the `validating_output`, `saving`, and `generating` sites. All three remain
lexically before `saving -> completed`, so the Pitfall-2 guards pass unchanged. `rg "refunded: true"`
on `analyze-resume/index.ts` now returns **no hits**.

## RED → GREEN Evidence

| Guard | RED (before) | GREEN (after) |
|---|---|---|
| `analysis-lifecycle.reserve-persist-parity.test.ts` | **1 failed / 3 passed** — failed on the `analyze-resume/index.ts` case, passed on the `_shared` case and both negatives | **4 passed / 0 failed** |
| `classifyRefundRpcResult` (behavioral replica of the then-current logic) | **2 failed / 1 passed** — `unknown_transaction` and `user_not_found` both returned `ok:true`; `already_refunded` already correct | **8 passed / 0 failed** in `merit-gateway-refund-business-errors.test.ts` |

The parity guard's RED **discriminated** — it failed only the drifted twin while passing the
correct one, so it is a real drift detector, not a blanket assertion. `rg -c "unknown_transaction"
merit-gateway.ts` returned `0` before the fix.

The parity guard slices the *single transition call* (token → first `);`) rather than a fixed
character window. A naive 200-char window would have spanned from the cache-hit transition into the
following `extracting_data` call and false-passed the negative assertion.

## Call-Site Impact — Completed Table

The plan's `<call_site_impact>` table claimed to be exhaustive but **omitted two real call sites**.
I verified both directly; neither regresses. Full table:

| # | Call site | Uses result? | Impact of the ok:true → ok:false flip |
|---|---|---|---|
| 1 | `_shared/analysis-lifecycle.ts:302` | Yes — `refunded: refund.ok` | The intended fix. No control-flow change. |
| 2 | `analyze-career/index.ts:340-345` | Yes — has an `if (!r.ok)` error branch | Existing error branch starts firing on genuine failures. |
| 3 | `process-resume-analysis-job/index.ts:284`, `:349` | Logging only | No retry/throw/status change. |
| 4 | `process-career-analysis-job/index.ts:285`, `:339` | Logging only | Same. |
| 5 | `analyze-resume/index.ts` ×3 pre-saving sites | Was discarded | Fixed directly (B2 above). |
| 6 | `analyze-resume/index.ts` legacy SSE paths | No | SSE `error` already sent before the refund call. |
| **7** | **`reap-stale-analysis-runs/index.ts:207`** *(omitted by the plan)* | **Yes** — `if (!refund.ok) { log.error('reaper-refund-failed'); skipped++; continue; }` | **No regression.** Already branches correctly: a failed refund is logged and the row is skipped, leaving it eligible for the next idempotent sweep. Strictly better — the branch now fires on real failures instead of being dead code for business errors. |
| **8** | **`_shared/terminalize-stuck-run.ts:122`** *(omitted by the plan)* | **Yes** — `if (r.ok) refunded = !r.alreadyRefunded; else console.error(...)` log-and-continue | **No regression.** Already branches correctly; still terminalizes so the run cannot hang, and the comment explicitly defers to the idempotent reaper backstop. |

No caller can double-refund (`refund_merits` is idempotent by contract) and no caller converts
`!ok` into a throw or an HTTP status. `reap-stale-analysis-runs/__tests__/reaper.test.ts` and
`_shared/terminalize-stuck-run.test.ts` both pass unchanged.

## Gate Results (actually observed)

| Gate | Result |
|---|---|
| `npm run lint` | exit 0 — 155 problems, **0 errors**, 155 warnings (pre-existing) |
| `npm run type-check` | exit 0 — clean |
| `npm run test` (vitest) | exit 0 — **117 files, 829 tests passed** |
| `npm run test:edge` | exit 0 — **1430 passed, 0 failed, 12 ignored**; includes `deno task check` |
| `npm run build` | exit 0 — built in 4.02s |

**Non-vacuity confirmed (Pitfall 12):** both new suites appear in the `test:edge` output —
`running 8 tests from ./_shared/__tests__/merit-gateway-refund-business-errors.test.ts` and
`running 4 tests from ./_shared/analysis-lifecycle.reserve-persist-parity.test.ts`.

## Deviations from Plan

**1. [Rule 3 — Blocking] Vitest collected the new Deno test file**

- **Found during:** Task 3, `npm run test` — a real, observed failure (`Test Files 1 failed | 117
  passed`, `Only URLs with a scheme in: file and data are supported... Received protocol 'https:'`).
- **Cause:** `vitest.config.ts` includes `supabase/functions/_shared/__tests__/*.test.ts`; the new
  file lives there and uses `https://deno.land` imports.
- **Fix:** Added the one-line exclusion following the **existing convention** — every sibling Deno
  guard in that directory is already listed there. No test was weakened and no rule disabled: the
  suite still runs, and is asserted to run, inside `test:edge`.
- **File:** `vitest.config.ts` (not in the plan's `files_modified`) · **Commit:** `acae6abc`

**2. Plan's call-site table was incomplete** — two omitted sites verified and added above.

**3. Plan asked to commit `PLAN.md`;** the execution constraints reserve all docs artifacts for the
orchestrator, so code-only staging was used. Constraints take precedence.

## Deferred Item (out of scope — NOT fixed)

`_shared/terminalize-stuck-run.ts:136` — `if (canRefund) patch.refunded = true;` hardcodes
`refunded = true` even when the refund at `:122` returned `!ok`. This is the *same* REFUND-TRUTH
pattern as B2, in a file outside this quick's approved scope. It is partially mitigated (the failure
is logged, and the idempotent reaper backstop is designed to retry), but the row is marked
`refunded=true`, which is exactly what makes a row **ineligible** for that backstop. **Recommend a
follow-up quick** to change it to `patch.refunded = refunded || alreadyRefundedFlag`.

## Constraint Compliance

- Zero files under `supabase/migrations/` (verified: `git diff --stat HEAD~3 HEAD -- supabase/migrations/` → empty).
- No RLS/GRANT changes. `.gitignore` untouched. No deploy executed.
- All commits staged file-by-file; no `git add -A`, `.`, or `-f`.
- Refund SUCCESS and `already_refunded` paths behaviorally identical; only genuinely-failed refunds changed.
- No-reservation transitions (cache-hit, MERIT_RESERVATION_FAILED) left unpatched and guarded.

## NOT LIVE

The fixes are **committed but NOT deployed**. Production money-path behavior is **unchanged** until
the operator deploys `analyze-resume` **and every function bundling `_shared/merit-gateway.ts`** —
including `analyze-career`, `process-resume-analysis-job`, `process-career-analysis-job`,
`reap-stale-analysis-runs`, `grade-linkedin`, and `recruiting-lens`. Deploying `analyze-resume`
alone would close gate A but leave gate B open everywhere else.

The Phase 02 `.continue-here.md` gates DURABLE MERIT HANDLE and REFUND TRUTH remain **operationally
open** until that deploy plus a fresh lifecycle row confirms a persisted `merit_transaction_id`.

## Self-Check: PASSED

Both created files exist on disk; all three commit SHAs (`743cc83d`, `6c27b0a0`, `acae6abc`) resolve
in `git log`; zero migration files touched.
