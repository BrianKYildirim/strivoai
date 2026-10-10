---
phase: 260713-2ay
plan: 01
subsystem: linkedin-grader
tags: [bugfix, reliability, merits, idempotency, retry, timeout]
requires:
  - supabase/functions/_shared/anthropic.ts
  - supabase/functions/_shared/idempotency-key.ts
  - supabase/functions/_shared/merit-gateway.ts
provides:
  - "_shared/ai-retry.ts — deadline-bounded, 408-retrying Anthropic invoke helper (injectable invoke/clock/sleep)"
  - "tier-config 'linkedin' CallType @ 90s"
  - "merit-gateway meritsRefunded signal (refund truth on the re-thrown error)"
  - "grade-linkedin idempotent live paid path"
  - "LinkedInGrader landed-grade recovery"
affects:
  - supabase/functions/grade-linkedin/index.ts
  - src/pages/LinkedInGrader.tsx
  - src/lib/fetchWithTimeout.ts
  - src/lib/merit-error-messages.ts
tech-stack:
  added: []
  patterns:
    - "Deadline-bounded retry: ONE request-scoped absolute deadline threaded through EVERY retry loop in a handler"
    - "Fail-closed idempotency: derive the merit key only from a genuinely client-supplied nonce"
    - "Recover-before-toast: poll for a result that landed despite a client-visible error"
key-files:
  created:
    - supabase/functions/_shared/ai-retry.ts
    - supabase/functions/grade-linkedin/__tests__/retry-deadline.test.ts
    - src/lib/__tests__/merit-error-messages.test.ts
    - src/pages/__tests__/LinkedInGrader.timeout-recovery.test.ts
  modified:
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/_shared/tier-config.ts
    - supabase/functions/_shared/merit-gateway.ts
    - supabase/functions/deno.json
    - supabase/functions/grade-linkedin/handler-config.test.ts
    - supabase/functions/grade-linkedin/cache.test.ts
    - supabase/functions/grade-linkedin/__tests__/idempotency-repeated-run.test.ts
    - src/pages/LinkedInGrader.tsx
    - src/lib/fetchWithTimeout.ts
    - src/lib/merit-error-messages.ts
    - src/pages/__tests__/Onboarding.recovery.test.tsx
decisions:
  - "D1 honored: maxTokensOutput.linkedinGrader and grade-linkedin/prompts.ts UNTOUCHED — grade output is byte-identical. Latency gap closed by widening the budget, not shrinking the output."
  - "D5 honored: the analysis-lifecycle / run_id path stays dormant. Its jobType 'linkedin_grading' violates the live analysis_jobs_job_type_check constraint."
  - "D6 honored: no `pro` cell added to TIER_TIMEOUTS — getTimeout normalizes pro onto elite."
  - "No DB migration. Idempotency reuses the EXISTING p_idempotency_key param; recovery reuses the EXISTING linkedin_grades table + owner-scoped RLS."
metrics:
  tasks: 3
  commits: 3
  duration: ~50m
  completed: 2026-07-13
---

# Quick Task 260713-2ay: Fix LinkedIn Grader First-Attempt Analysis — Summary

Made the LinkedIn grader's first click actually work: the server now **retries the timeout it used to
misclassify as permanent**, inside a bounded 165s deadline; the paid path is idempotent so one click =
one charge; and the client recovers a grade that landed anyway instead of toasting a false "your Merits
were refunded" over the top of it.

## The bug, in one line

`anthropic.ts` reports an AbortController timeout as **408**. The old `invokeWithRetry` guard read
`if (status >= 400 && status < 500 && status !== 429) return lastResult;` — so **408 was classified as a
permanent client error and the retry loop was skipped entirely**, on the single most transient failure
mode there is. Free tier got a **50s** wall for a grade that genuinely takes **45-70s** to generate.
Eight production refunds landed within half a second of the exact 50 000 ms timeout value. The user's
"second click works" was them **manually performing the retry the server should have performed itself**.

## What shipped

### Task 1 — Server (`41bf3965`)

| Change | File |
| --- | --- |
| `invokeWithRetry` extracted into a shared, unit-testable module. **408 is now retryable**; 400/401/403/422 still short-circuit after ONE call. Status-aware jittered backoff (529 rides out overload at 2s/4s; 408 backs off ~0.5s because a 90s wall already ate the budget). | `_shared/ai-retry.ts` (new) |
| New `'linkedin'` CallType at **90s** for free + elite. It was running on `core` — 50s for free, i.e. a wall *inside* the real generation band. | `_shared/tier-config.ts` |
| ONE request-scoped `deadlineAt` (165s) threaded through **both** of `runTieredAiCall`'s retry loops *and* the legacy path. Load-bearing: a per-loop budget would still allow ~540s worst case, because a validation failure fires a **second** retry loop. | `grade-linkedin/index.ts` |
| `ctx.idempotencyKey` on the LIVE `withMerits` call. `p_idempotency_key` was NULL, so `check_and_deduct_merits` deduped nothing. **Fails closed** on a missing nonce — a server-minted random nonce derives a key that can never repeat, guaranteeing nothing while looking like it guaranteed everything. | `grade-linkedin/index.ts` |
| `meritsRefunded` attached to the re-thrown error **only when `refund_merits` actually succeeded**; handler returns the **honest upstream status** (a `MeritRefundable(408)` is a TIMEOUT, not a 500). | `_shared/merit-gateway.ts`, `grade-linkedin/index.ts` |

### Task 2 — Client (`e070d96b`)

- **`fetchWithTimeout.ts`** — propagate the real HTTP status onto the returned Error. It was thrown away, which forced LinkedInGrader to regex-scrape a 3-digit code out of `error.message`; no server message contains one, so **every** failure silently degraded to 500 and the TIMED_OUT copy was literally unreachable.
- **`LinkedInGrader.tsx`** — budget 120s → **180s** (the client could previously abandon a run the server went on to complete, charge and save); pre-submit **watermark** of the newest grade id; on an *ambiguous* failure (408 / 5xx / network) poll ~6s for a grade that **landed anyway**, render it, pin `?id=`, `commit()` the charge, and show **no error toast**. 400/402/403/429 are unambiguous and surface instantly.
- **`merit-error-messages.ts`** — refund claims are now conditional on the server confirming one. `useMerits.rollback()` only restores a React-Query cache — it *cannot* refund. Default (`undefined`) keeps legacy wording byte-identical for every other page.

### Task 3 — Tests folded into the blocking gate (`b850bdda`)

All four suites were demonstrated **RED before GREEN**. A test that was already green did not catch the bug.

| Suite | RED proof (against pre-fix code) |
| --- | --- |
| `retry-deadline.test.ts` (new, 18 assertions) | Pre-fix predicate (408 permanent) → **5 failed**, incl. *"408 is RETRIED"* |
| `idempotency-repeated-run.test.ts` (+3 legs) | Pre-fix `index.ts` → **3 failed**, while the old determinism legs stayed **green** — precisely why S1 shipped |
| `merit-error-messages.test.ts` (new) | Unconditional refund copy → **4 failed**, incl. the *"stop lying"* assertion |
| `LinkedInGrader.timeout-recovery.test.ts` (new) | Pre-fix page → **all 10 failed** |

## Verification — `npm run verify:baseline` GREEN

```
vitest      98 files    635 passed / 635    0 failed
deno        test:edge  1283 passed          0 failed   (12 ignored)
playwright                 7 passed         0 failed   (2 skipped — pre-existing QUARANTINE)
```

Also: `npm run lint` 0 errors · `npm run build` exit 0 · `npx tsc -p tsconfig.app.json --noEmit` → only the
8 known pre-existing recharts errors in `src/components/ui/chart.tsx`.

Budget invariant verified in source: **client 180 000 > server total 165 000 > per-call 90 000**.

## Deviations from Plan

### 1. [Rule 3 — Blocking] `verify:baseline` was ALREADY RED on `staging` before I started

- **Found during:** Task 2 verification.
- **Issue:** `src/pages/__tests__/Onboarding.recovery.test.tsx` grepped `Onboarding.tsx` for the exact literal `disabled={loading}`. Commit `e8fa2e2b` ("anchor product around one professional goal") had tightened that guard to `disabled={loading || professionalGoal.trim().length === 0}` — **strictly stronger** — without updating the source-grep. The assertion went red while the behavior it protects got *better*.
- **Proof it predates this work:** checked out `5d83a4e6` (the branch tip before my first commit) → same single failure. The blocking gate was red on arrival.
- **Fix:** re-pointed the assertion at the real guard via regex (`/disabled=\{loading(\s*\|\|[^}]*)?\}/`), preserving the test's intent (loading gates the button) and making it robust to future legitimate guard additions. **Not weakened, not deleted** — same treatment the plan mandated for the 1c-bis stale tests.
- **Commit:** `e070d96b`
- This is the exact rot the plan flagged as **LIN-DEF-04** (source-grep tests decaying silently), just in a different file.

### 2. [Rule 1 — Bug in my own test harness] The fake `invoke` ignored the `timeoutMs` it was handed

- **Found during:** Task 3, first green run of `retry-deadline.test.ts` (2 assertions failed against the *correct* code).
- **Issue:** My fake burned a fixed 90s of clock regardless of the timeout passed to it. A **real** Anthropic call cannot outlive its timeout — `anthropic.ts` wires an AbortController. The unfaithful fake made attempt 2 run a full 90s and "overrun" the deadline.
- **Why it mattered:** clamping `timeoutMs` to the remaining budget **is the mechanism** that enforces the deadline. A fake that ignores its timeout would have masked a genuine overrun in a real un-clamped implementation.
- **Fix:** the fake now burns `min(work, timeoutMs)`. This made the deadline assertions *stronger*, not weaker.
- **Commit:** `b850bdda`

### 3. [Adjustment] Comment-stripping in the LinkedInGrader source guard

- The new guard asserts the regex status-scrape is gone — but `LinkedInGrader.tsx` *documents* the regex it deleted, so a naive grep saw its own explanatory prose and failed.
- Resolved by stripping comments before asserting, mirroring the established repo idiom in `grade-linkedin/__tests__/fixed-source-guard.test.ts` ("a doc comment naming a forbidden token must never satisfy OR break the guard"). Verified still load-bearing: it fails against the pre-fix page.

### No deviations on the locked constraints

`pricing-config.ts` and `grade-linkedin/prompts.ts` untouched (D1 — grade output byte-identical) · no
`supabase/migrations/` change (no DB migration owed) · `runAnalysisLifecycle` call site untouched and the
flag remains dormant (D5) · no `pro` cell added to `TIER_TIMEOUTS` (D6).

## Acceptance test mapping

| Criterion | Mechanism |
| --- | --- |
| Analysis completes on first click | 408 retried inside the 165s deadline; per-call wall raised to 90s (real workload 45-70s) |
| No server-error toast | Retry + landed-grade recovery before toasting |
| Merits charged exactly once | `ctx.idempotencyKey` → `check_and_deduct_merits` replays `already_deducted` |
| Only one analysis run created | Same idempotency key → one model call, one `linkedin_grades` row |
| Analysis opens automatically | Success path unchanged; recovery path hydrates + pins `?id=` identically |
| No second click required | The server now performs the retry the user was performing by hand |

## Deferred (recorded, explicitly NOT done)

- **LIN-DEF-01** — the analysis-lifecycle path is *broken*, not merely dormant: `jobType: 'linkedin_grading'` violates the live `analysis_jobs_job_type_check` CHECK constraint. Enabling the flag today would 500 **100%** of LinkedIn requests. Needs a migration extending the constraint (production migration = explicit human approval).
- **LIN-DEF-02** — output-token right-sizing (`linkedinGrader.free = 12000` vs 3765-7000 observed). A measured tuning pass with grade-quality risk; deliberately deferred (D1).
- **LIN-DEF-03** — `useMerits.rollback()` is a cache restore, not a refund. The name still invites the false claim at other call sites; a rename is a separate cleanup.
- **LIN-DEF-04** — `grade-linkedin/cache.test.ts` is still not registered in `deno.json`'s `test:ci`, so it can rot silently (it had). Worth auditing which other `supabase/functions/**` tests are likewise unregistered. Deviation 1 above is the same rot, caught in `src/`.

## Self-Check: PASSED

All created files exist on disk; all three commits (`41bf3965`, `e070d96b`, `b850bdda`) verified present in
`git log`.
