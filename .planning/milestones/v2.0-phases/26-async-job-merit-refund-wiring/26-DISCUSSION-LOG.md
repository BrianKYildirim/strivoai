# Phase 26: async-job-merit-refund-wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 26-async-job-merit-refund-wiring
**Areas discussed:** Idempotency mechanism, Refund scope, Refund-failure handling, Worker-error catch path

---

## Idempotency mechanism

How should the worker prevent double-refund on a re-processed failed job?

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on RPC only (Recommended) | Worker always calls refundMeritsForJob; refund_merits RPC's existing 'already_refunded' contract guarantees zero mutations on second call. No new column, no worker-side state. Costs one no-op RPC roundtrip per re-process. | ✓ |
| Worker NULLs the column post-refund | After successful refund, UPDATE analysis_jobs SET merit_transaction_id = NULL WHERE id = $1. Subsequent passes see null and short-circuit. Saves the no-op RPC, but adds a write and couples worker to txn-id lifecycle. | |
| Add refunded_at timestamp column | Add a separate refunded_at column; worker checks it before calling refund. Cleanest audit trail but requires a second column in the migration and a write per refund. | |

**User's choice:** Rely on RPC only
**Notes:** Recommended option accepted. The `refund_merits` RPC already enforces idempotency at the database layer via `already_refunded` return + zero mutations (`supabase/migrations/20260415000000_merit_rpcs.sql:184-193`). Layering a second guard at the worker level is redundant. Captured as D-01/D-02 in CONTEXT.md, with a follow-up detail that `refundMeritsForJob` should be extended to recognize `already_refunded` as a success-equivalent outcome (log info, not error).

---

## Refund scope

Which transitions to status='failed' should trigger a refund?

| Option | Description | Selected |
|--------|-------------|----------|
| Every terminal 'failed' transition (Recommended) | Any branch that sets status='failed' refunds — retry-exhausted refundable errors, immediate non-retryable errors (e.g., 400 from analyze-resume), and worker-thrown errors. Simple invariant: charged + no value delivered = refund. | ✓ |
| Only retry-exhausted refundable errors | Refund only when retryable=true && maxedOut. Immediate non-retryable failures (bad payload, auth issues) do NOT refund. Stricter but means some 'failed' jobs consume merits without value. | |

**User's choice:** Every terminal 'failed' transition
**Notes:** Recommended option accepted. Establishes a single invariant ("merit deducted + no value delivered = refund") rather than a per-branch policy that's easy to drift from. Captured as D-03 / D-04.

---

## Refund-failure handling

If refundMeritsForJob itself fails (RPC error, transient DB issue), what should the worker do?

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort: log error, still mark 'failed' (Recommended) | Log structured error (level=error, includes user_id + txn_id + reason) and proceed to status='failed'. RPC is idempotent so an operator/future fix can retry safely. Avoids leaving jobs in limbo. | ✓ |
| Block status update, leave job in 'retrying' | If refund fails, do NOT mark 'failed' — let the worker pass retry the whole job (and refund) on next pickup. Stronger guarantee but risks unbounded retries on persistent refund failures and frontend waits longer. | |
| Mark 'failed' but flag for operator queue | Mark job 'failed' AND write to a separate operator-attention table/log surface. Most surface area but most observability. | |

**User's choice:** Best-effort: log error, still mark 'failed'
**Notes:** Recommended option accepted. The third option (operator-attention surface) was deferred to a future phase if production telemetry shows a need. Captured as D-05 / D-06; refund call MUST happen BEFORE the `status='failed'` SQL update.

---

## Worker-error catch path

The catch (processError) block at L313-343 also marks jobs 'failed' when maxedOut. Should it also call refundMeritsForJob, same as the response-path branch?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, refund here too (Recommended) | Apply the same 'charged + no value = refund' rule to errors thrown during worker processing (not from analyze-resume response). Symmetric with the response-path branch. | ✓ |
| No, leave catch path as-is | Only refund on response-path terminal failures. Worker-thrown errors are rare and may indicate worker bugs we want to investigate manually. | |

**User's choice:** Yes, refund here too
**Notes:** Recommended option accepted. Consistent with D-03's "every terminal failed transition" invariant. Captured as D-07.

---

## Claude's Discretion

- Plan boundary (1 vs 2 plans) — left to planner. Roadmap suggests 2 plans (migration + submit-side; processor-side + tests) but a single combined plan is also acceptable if scope is small enough.
- Specific `reason` string codes passed to `refundMeritsForJob` — planner picks. Examples noted in CONTEXT.md: `retry_exhausted`, `non_retryable_error`, `worker_exception`. (`pre_migration_null_txid` is reserved for the warn-skip path, NOT an actual refund reason.)

## Deferred Ideas

- Dedicated operator-attention surface for failed refunds (table + admin dashboard) — out of scope; revisit if production telemetry shows need.
- Submit-side unit test verifying `merit_transaction_id` persists in the insert payload — recommended but not required by SC #5; planner may add if scope allows.
- Retroactive backfill of `merit_transaction_id` for in-flight pre-migration jobs — out of scope; D-09 specifies graceful no-op + warn log instead.
