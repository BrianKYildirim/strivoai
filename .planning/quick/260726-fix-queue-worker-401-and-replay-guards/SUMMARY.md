---
task: Fix queue/worker 401 (analyze-resume) + replay-fragile migration guards & service_role grants
slug: 260726-fix-queue-worker-401-and-replay-guards
status: complete
date: 2026-07-26
branch: staging
commits:
  - d4bb5adf fix(analysis): complete queued resume analyses on the internal worker path
  - d785c5d6 fix(db): make a clean migration replay succeed (guards + service_role grants)
  - d1d54d86 test(load-testing): prove queue completion + a clean 5-concurrent mocked rung
---

# Finding 1 — Queue/worker 401 (analyze-resume)

**Root cause:** `analyze-resume:1383` `if (!userContext) return 401 unauthorized` rejected
the internal worker path (`process-resume-analysis-job` calls with `x-internal-job-secret`
→ `requireInternalOrUserAuth` returns null). Queue deducted at submit, worker call 401'd →
non-retryable → refund → job `failed`. Never completed.

**Architecture (verified):** submit-resume-analysis-job deducts (stores
`merit_transaction_id`); the worker refunds on failure via that id and expects **200 JSON**
(no stream). So the worker call must analyze + persist with **no deduction**.

**Fix (d4bb5adf, mirrors analyze-career, reuses existing helpers):** when `userContext` is
null (proven trusted internal caller — `requireInternalOrUserAuth` throws on a bad secret)
AND a payload `userId` exists → `buildResumePromptContext` → `assembleResumeResult`
(per-tier) → `completeAndRecordSuccess` → `triggerExtractWebhook`, return 200 JSON, NO
withMerits. On failure, return status + `retryable` so the worker retries/refunds. Hard 401
kept only when no userId. Public JWT path unchanged; tier still server-resolved.

# Finding 2 — Fresh-environment DB replay

**Root causes:** (1) three no-regression guards RAISE EXCEPTION on a clean replay; (2)
`service_role` lacked table grants on a clean replay → every Edge Function 403'd (42501).

**Fix (d785c5d6):** downgraded the fatal no-regression asserts to RAISE NOTICE (REVOKE
logic + the positive post-revoke check untouched; already-applied on preview/prod so no
re-run there); new idempotent `20260726120000_service_role_public_grants.sql` (+ rollback)
grants service_role standard public access, no-op where already granted. **Proven:** a
from-scratch `supabase db reset` completes (exit 0) with zero temp edits, and service_role
has full grants afterward.

**Scope note:** anon/authenticated also lack platform-default grants on a clean replay (a
fresh throwaway FRONTEND needs them). Left OUT — the profiles UPDATE policy has no column
restriction and no subscription_tier guard, so a blanket grant risks tier self-upgrade;
needs prod-posture verification. Flagged for follow-up. (For the local 5-concurrent test,
anon/authenticated were granted LOCALLY only — transient, not committed, simulating the
hosted platform default.)

# Verification (local stack, mocked AI, loopback only)

- Clean migration replay: `supabase db reset` exit 0, all migrations applied incl. grants;
  service_role S/I/U = true on every app table post-reset.
- Correctness validation: **success 18/18 + failure 8/8 PASS.** Queued analysis now:
  creates exactly one job ✓ · deducts once (cost 3, 10→7) ✓ · completes (worker,
  overall_score=84) ✓ · stores & retrievable (resumes.grading_data) ✓ · polling/refresh
  recovery ✓ · no duplicate jobs/charges ✓ · queue permanent-failure refund (10→10 + refund
  row) ✓. Streaming completion + refund also PASS.
- 5-concurrent mocked SMOKE rung: **5/5 completed, 100% first-click, 0 failed, 0 duplicate
  jobs, 0 duplicate charges, 0 lost, p95 ~147ms.** (An unbounded 5-VU run additionally
  showed the per-user 5/hr rate limiter correctly capping at 25 completions — working as
  designed.)
- deno check analyze-resume: pass. eslint load-testing: clean. node --check: pass.
- Production untouched: every request → http://127.0.0.1:54321; prod ref never a target;
  no `supabase link` change; read-only prod MCP never used. Synthetic users purged (0
  remain); local stack stopped.

# Not done (deliberate)
- No real-provider calls. No production traffic/config/data change. No broad refactor.
- anon/authenticated grant migration deferred (security nuance above).
