---
task: Fix queue/worker 401 (analyze-resume) + replay-fragile migration guards & service_role grants
slug: 260726-fix-queue-worker-401-and-replay-guards
status: in-progress
date: 2026-07-26
branch: staging
constraints: no real AI, no prod traffic/config/data, no broad refactor, secrets never committed
---

# Finding 1 — Queue/worker 401 in analyze-resume

## Root cause
`analyze-resume:1383` `if (!userContext) return 401 unauthorized` rejects the internal
worker path (`process-resume-analysis-job` calls with `x-internal-job-secret`, so
`requireInternalOrUserAuth` returns null). The queue path therefore deducts at submit,
then the worker call 401s → non-retryable → refund → job `failed`. Never completes.

## Architecture (verified)
- `submit-resume-analysis-job` deducts the Merit (`withMerits`) and stores
  `merit_transaction_id` on the job.
- `process-resume-analysis-job` (worker) calls `analyze-resume` (internal, NO stream),
  expects **200 JSON**; on non-retryable/exhausted failure it **refunds** via the job's
  `merit_transaction_id`.
- So the worker call must run analysis + persist with **NO deduction** (queue owns the
  Merit lifecycle). This mirrors analyze-career's internal legacy path.

## Fix (targeted, reuses existing factored helpers)
Replace the 401 guard with an internal-worker branch (only reached when `userContext` is
null, which `requireInternalOrUserAuth` proves is a TRUSTED internal caller — it throws on
a bad/absent secret):
- Keep a hard 401 only when there is ALSO no payload `userId` (unidentifiable).
- Otherwise: `buildResumePromptContext` → `assembleResumeResult` (per-tier: free single /
  elite 3-call+merge) → `completeAndRecordSuccess` (authoritative persist + mirror + usage)
  → `triggerExtractWebhook`; return **200 JSON**. No `withMerits`, no deduction, no refund.
- On failure: return status + `retryable` flag so the worker retries transient / refunds
  on permanent/exhausted (worker refund path unchanged).
Security: public JWT path unchanged (userContext present → withMerits path); no
unauthenticated external request can reach the branch; tier still server-resolved
(`resolveTierForUserId`), never client-supplied.

## Verify (local, mocked AI): a queued analysis
creates exactly one job · deducts once · completes · stores & retrievable · polling/refresh
recovery · no duplicate jobs/charges · refunds on permanent failure.

# Finding 2 — Fresh-environment DB replay

## Root cause
1. Three no-regression guards (`20260608000010/11`, `20260625021209`) `RAISE EXCEPTION` on a
   clean sequential replay (assert grant state that only holds on the historical DB).
2. `service_role` lacks table grants on a clean replay (`42501 permission denied`) → every
   edge function 403s (service client).

## Fix (permanent, no temp edits, no prod data/config change)
1. Edit the 3 guard migrations: fatal `RAISE EXCEPTION` no-regression asserts →
   `RAISE NOTICE` (keep the REVOKE/GRANT logic + diagnostics). Already-applied on
   preview/prod (won't re-run); only affects fresh replays.
2. New idempotent migration granting `service_role` standard access on `public`
   (tables/sequences/functions + default privileges), per-object exception-safe. No-op
   where already granted (prod), so safe; NOT deployed to prod here.

## Verify
- Clean `supabase db reset` from scratch succeeds with NO migration edits at run time.
- Rerun full local correctness validation (success + failure) → all PASS, including the
  now-completing QUEUE path.
- Run ONE tiny 5-concurrent mocked analysis rung (no real AI).

# Out of scope
No broad refactor; no real-provider calls; production untouched. Commit only code +
migrations (not `.planning/`).
