# Quick Task 260713-2ay — Root Cause: LinkedIn Grader first-attempt failure

**Investigated:** 2026-07-13
**Status:** Root cause CONFIRMED against production data (not a hypothesis)

## TL;DR

The first attempt genuinely **fails on the server** — it is not a frontend display bug and not a
lost-response race. The free-tier Anthropic call is given a **50s timeout** but the LinkedIn grade
legitimately takes **~45–70s** to generate. The abort fires, and the resulting `408` is then
**misclassified as a non-retryable client error**, so `invokeWithRetry` returns immediately with
**zero retries**. The merit is refunded (correctly), a 500 goes to the client, and the user sees
the server-error toast.

The user's "second click works" is simply the coin-flip landing the other way. **The user is
manually performing the retry the server should have performed itself.**

## Production evidence (decisive)

Deduct → refund latency, joined on `metadata->>'deduction_id'` in `merit_transactions`:

| tier  | seconds to refund              | n | interpretation |
|-------|--------------------------------|---|----------------|
| free  | **50.3, 50.5, 50.6, 50.7, 50.8** | 8 | pinned to the 50 000 ms `free.core` timeout wall |
| free  | 42.0                           | 1 | near-wall failure |
| elite | 2.6 – 5.4                      | 7 | Anthropic 5xx/529 overload; 3 fast retries + 1s/2s backoff ≈ 4s |
| elite | 51.9 – 56.4                    | 5 | (other features / other call types) |

Eight free-tier refunds clustered within **half a second of the exact timeout value** is not
coincidence — that *is* the `AbortController` firing.

## The code path, precisely

1. **`supabase/functions/_shared/tier-config.ts:27-31`** — `TIER_TIMEOUTS.free.core = 50_000`.
   `grade-linkedin/index.ts:257` passes `timeoutMs: getTimeout(tier)` → **50s for free**.

2. **`src/config/pricing-config.ts:104`** — `linkedinGrader.free = 12000` max output tokens.
   Real observed outputs are **3765 / 3877 / 4322 / 4720 … up to 7000** tokens (per the tuning
   note at `pricing-config.ts:82-88`). Haiku 4.5 emitting ~5–7k tokens takes **~45–70s**.
   **The generation time straddles the 50s wall — hence "majority of the time".**

3. **`supabase/functions/_shared/anthropic.ts:731`** — on abort the invoke returns
   `{ ok: false, status: isAbort ? 408 : 500 }`. A timeout is reported as **408**.

4. **`supabase/functions/grade-linkedin/index.ts:50-53`** — THE BUG:
   ```ts
   // Don't retry client errors (4xx except 429/529)
   if (!lastResult.ok && lastResult.status >= 400 && lastResult.status < 500 && lastResult.status !== 429) {
     return lastResult;   // ← 408 lands HERE. Returns immediately. NO RETRY.
   }
   ```
   `408` satisfies `>= 400 && < 500 && !== 429`, so the timeout is treated as a permanent client
   error. The 3-attempt retry loop is skipped entirely on the one failure mode that is *most*
   transient.

5. `runTieredAiCall` (`index.ts:259`) throws `MeritRefundable(408, …)` →
   `withMerits` (`merit-gateway.ts:279-293`) sees `isRefundableAnthropicError(408) === true`
   (`merit-gateway.ts:53`) → fires `refund_merits` → re-throws → **500** to the client →
   "Analysis hit a server error … your Merits were refunded".

The refund and the error are **honest** here. The server really did fail.

## Secondary defects (real; required by the acceptance criteria)

- **S1 — No idempotency on the live paid path.** `withMerits` is called at `index.ts:639` with
  `ctx = { userId, tier, corsType }` and **no `idempotencyKey`**, so `p_idempotency_key` is `NULL`
  (`merit-gateway.ts:217`). `check_and_deduct_merits` only dedupes when the key is non-NULL
  (`20260512000003_merit_transactions_idempotency.sql:118-133`). **Two clicks = two charges, two
  model calls, two `linkedin_grades` rows.** `attemptNonce` is already minted per-click on the
  client (`LinkedInGrader.tsx:522`) and already sent — it is simply never used on the live path
  (only the dormant lifecycle branch reads it).

- **S2 — Client can abandon a run the server completes.** `invokeWithTimeout(…, 120000)`
  (`LinkedInGrader.tsx:547`) is a `Promise.race` with **no AbortController**
  (`fetchWithTimeout.ts:30-42`). Pro/Elite per-call server timeouts are **125s / 155s** — longer
  than the client's 120s budget. When the client bails, the server still completes, charges the
  merit, inserts the grade and writes the cache; the user sees "refunded" (false) and the result
  is never displayed. The live response carries **no `run_id` and no `recordId`**
  (`index.ts:585-588`), so there is nothing to recover with.

- **S3 — Every error is reported as a 500.** `LinkedInGrader.tsx:631-635` derives the status by
  regex-scraping a 3-digit number out of `error.message`; `parseSupabaseFunctionError` never sets
  `.status` (`fetchWithTimeout.ts:62-65`) and no server message contains a bare status code. So
  timeouts, 429s, 402s and 400s **all** fall back to `500` → the same "server error, Merits
  refunded" toast. The `TIMED_OUT` (408) copy at `merit-error-messages.ts:40-43` is unreachable.

- **S4 — `rollback()` claims a refund it cannot make.** `useMerits.ts:110-115` only restores the
  React-Query cache and refetches. Whenever the server did NOT refund (S2), the toast lies.

## Explicitly NOT the cause (ruled out)

- **pdf.js worker init race.** `pdf-worker.ts:5,13-15` sets `workerSrc` at module load; the lazy
  worker in `extract-pdf-text.ts:27-51` has a main-thread fallback (`:91-108`). All extraction
  failures are caught at `LinkedInGrader.tsx:510-514` and produce a *different* toast **before**
  any merit is deducted. An extraction race can never yield "server error + refund".
- **`analysis_cache` masking a first-run success.** `writeLinkedInGradeCache` only runs *after*
  `storeAndNotify` succeeds (`index.ts:660-666`). A refunded run writes no cache — so the
  second-click success is a fresh model call, not a cache hit.
- **The analysis-lifecycle / `run_id` path.** It is **dormant** (`ANALYSIS_LIFECYCLE_ENABLED`
  unset) *and* **broken**: it passes `jobType: 'linkedin_grading'` (`index.ts:379`), which violates
  the live `analysis_jobs_job_type_check` CHECK constraint (only `resume_analysis`,
  `career_compass_analysis`, `recruiting_lens` are allowed). Turning the flag on would 500 **100%**
  of LinkedIn requests. **Do not enable it as part of this fix.**

## Required fix (three axes)

1. **Make the timeout survivable (fixes the headline bug).**
   - Treat `408`/abort as **retryable** in `invokeWithRetry` — a timeout is the most transient
     error there is.
   - Bound the total retry budget with a **deadline** so the retries cannot outrun the client's
     budget (naive 3×50s + the validation-retry's second `invokeWithRetry` = up to 300s).
   - Right-size the LinkedIn per-call timeout to the real p95 of the workload.

2. **Make one click = one charge (preserves the merit/idempotency guarantees).**
   - Thread the existing `attemptNonce` into `withMerits` as `ctx.idempotencyKey` on the live paid
     path so a repeat submit of the same logical analysis cannot double-charge, double-call the
     model, or double-insert.

3. **Make the client honest and recoverable.**
   - Client budget must exceed the server's *total* budget (it currently does not for pro/elite).
   - Before showing an error + rolling back, **re-check for a grade that landed anyway** and render
     it instead of toasting.
   - Only claim "Merits refunded" when a refund actually occurred; map timeouts to the timeout copy
     rather than the generic server-error copy.

## Acceptance mapping

| Acceptance criterion | Addressed by |
|---|---|
| Analysis completes on first click | Axis 1 (retry the 408 + right-size the budget) |
| No server-error toast | Axis 1 + Axis 3 (recovery check before toasting) |
| Merits charged exactly once | Axis 2 (idempotency key) |
| Only one analysis run created | Axis 2 (idempotency key) |
| No duplicate model calls | Axis 2 + bounded retry in Axis 1 |
| Refund only on genuine failure | Axis 3 (honest refund reporting) |
| No second click required | Axis 1 |
