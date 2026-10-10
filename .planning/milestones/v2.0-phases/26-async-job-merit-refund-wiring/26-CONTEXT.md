# Phase 26: async-job-merit-refund-wiring - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Close MER-11's async-path gap so terminal failures in the queued resume/career analysis path refund merits instead of consuming them silently.

Today, `submit-resume-analysis-job` and `submit-career-analysis-job` deduct merits via `withMerits()` and discard the returned txn id (`async (_txId) => …`). The `analysis_jobs` row carries no `merit_transaction_id`, so the workers (`process-resume-analysis-job`, `process-career-analysis-job`) cannot call `refundMeritsForJob()` on terminal failure. This phase plumbs the txn id through the queue and wires the refund call into every terminal-failure branch of both workers.

**In scope:** schema migration adding `merit_transaction_id uuid NULL` to `analysis_jobs`; submit-side persistence; worker-side refund calls on terminal failure; idempotency contract; Deno tests covering the SC #5 matrix.

**Out of scope:** any change to `refund_merits` RPC or `refundMeritsForJob` signature (Phase 11 / 13 contracts are LOCKED); changes to streaming-path refund logic (already handled by `withMerits` in `analyze-resume`); other async job types (interview-prep, recruiting-lens — none currently use `analysis_jobs` queue with merit deduction).

</domain>

<decisions>
## Implementation Decisions

### Idempotency mechanism
- **D-01:** Rely on the `refund_merits` RPC's existing `already_refunded` guarantee — no new column, no worker-side state. Worker always calls `refundMeritsForJob()`; if already refunded, RPC returns `{"error":"already_refunded"}` with zero mutations (verified at `supabase/migrations/20260415000000_merit_rpcs.sql:184-193`). Trade-off accepted: one no-op RPC roundtrip per re-process.
- **D-02:** Treat `{"error":"already_refunded"}` from `refundMeritsForJob` as a success-equivalent outcome (log at `info` level, NOT `error`). The function currently returns `{ ok: false, error: error.message }` for any RPC error including this string; planning must decide whether to (a) extend `refundMeritsForJob` to recognize this string and return `{ ok: true, alreadyRefunded: true }`, or (b) handle the string at the call site. **Preference: extend the helper** so callers stay simple.

### Refund scope
- **D-03:** Refund on EVERY transition to `status='failed'`. Invariant: "merit was deducted AND no value was delivered → refund." Covers retry-exhausted refundable errors, immediate non-retryable errors (e.g. 400 from analyze-resume on bad payload), and worker-thrown errors. No branch in either processor that sets `status='failed'` may skip the refund.
- **D-04:** `status='completed'` does NOT refund. `status='retrying'` does NOT refund (the merit stays held until the job either completes or terminally fails).

### Refund-failure handling
- **D-05:** Best-effort refund. If `refundMeritsForJob()` returns `{ ok: false }`, log a structured `error`-level entry that includes `user_id`, `merit_transaction_id`, `job_id`, `feature` (`resume_analysis` or `career_analysis`), and `reason`, then proceed to write `status='failed'`. Do NOT block the status update. Rationale: leaving the job in `retrying` risks unbounded retries on persistent refund failures, frontend hangs, and double-processing risk; the RPC is idempotent so an operator/future fix can retry the refund safely.
- **D-06:** Order of operations: call `refundMeritsForJob()` BEFORE the `update analysis_jobs set status='failed'` SQL. This matches the pattern documented in the worker's existing comment (`process-resume-analysis-job/index.ts:38-39`): "call refundMeritsForJob with the persisted transaction_id BEFORE setting status='failed'."

### Worker-error catch path
- **D-07:** The `catch (processError)` block (`process-resume-analysis-job/index.ts:313-343`, mirror at `process-career-analysis-job/index.ts`) MUST also call `refundMeritsForJob()` when `maxedOut === true` and the resulting `update` writes `status='failed'`. Same invariant as D-03.

### Submit-side persistence
- **D-08:** In both `submit-resume-analysis-job` and `submit-career-analysis-job`, change `async (_txId) =>` to `async (txId) =>` and include `merit_transaction_id: txId` in the `analysis_jobs` insert payload. The insert MUST happen inside the `withMerits` callback (current structure) so a failed insert refunds at submission time.
- **D-08a (resolved 2026-04-28 from RESEARCH.md Open Q #1):** Current code at the insert-failure site throws plain `new Error('job insert failed: ...')`, which `withMerits` classifies as `merit-non-refundable-error` and re-throws WITHOUT refunding. This is a real but narrow leak (rare path: insert rejected by RLS/constraints AFTER merit deduction succeeds). **Fix:** wrap the insert error in `MeritRefundable` (`throw new MeritRefundable(503, 'job insert failed: ...')`) at both submit sites so `withMerits` refunds the deduction before re-throwing. One-line change per function; in scope for Phase 26 to make D-08's stated contract actually hold.
- **D-09:** Pre-migration jobs (rows where `merit_transaction_id IS NULL`) — worker MUST short-circuit BEFORE calling `refundMeritsForJob()`. Path: log at `warn` level with `{ job_id, reason: 'pre_migration_null_txid' }` and skip the refund call. Do NOT pass null/empty string to `refundMeritsForJob` and rely on RPC error-handling. This is SC #5 case (d).

### Migration shape
- **D-10:** `ALTER TABLE public.analysis_jobs ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL`. No FK constraint to `merit_transactions` (the txn id is the shared `deduction_id` in `metadata`, not a row PK; FK would be wrong). No index needed (column is read by single-row update on the worker hot path, always under primary-key lookup). RLS inherits from existing `analysis_jobs` policies — no new policy required (Phase 21-04 MIG-02 stays intact).

### Tests (SC #5)
- **D-11:** Deno tests live in `supabase/functions/process-resume-analysis-job/__tests__/` and `supabase/functions/process-career-analysis-job/__tests__/` following the existing pattern. Use the same mocking style as the existing worker tests (mock `getServiceClient` + the worker invocation of analyze-resume/analyze-career via fetch). The four required cases:
  - (a) success path → assert `refundMeritsForJob` NOT called
  - (b) terminal failure → assert `refundMeritsForJob` called exactly once with the persisted `merit_transaction_id` and a non-empty `reason`
  - (c) re-process of already-failed job → assert zero additional refund calls (covered by D-01: RPC `already_refunded` is the canonical guard)
  - (d) pre-migration row (`merit_transaction_id` is `NULL`) → assert `refundMeritsForJob` NOT called and a `warn`-level log line is emitted with `reason: 'pre_migration_null_txid'`
- **D-12:** Submit-side tests are NOT required by SC #5 but planning may add a unit test that verifies the txn id is persisted in the insert payload — recommended but optional.

### Claude's Discretion
- Plan boundary: roadmap suggests "likely 2 plans (migration + submit-side persist; processor-side refund + tests)." Planner may keep that split or merge into a single plan if the migration is trivial enough to batch with the submit-side change. Both halves must ship in the same phase regardless.
- `reason` string format passed to `refundMeritsForJob`: planner picks specific reason codes (e.g., `'retry_exhausted'`, `'non_retryable_error'`, `'worker_exception'`, `'pre_migration_null_txid'` is reserved for the warn-skip path) — keep them snake_case and ≤32 chars for log greppability.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & success criteria
- `.planning/ROADMAP.md` § Phase 26 — full Goal, Depends-on, Success Criteria 1–6, Plans hint
- `.planning/REQUIREMENTS.md` § MER-11 — root requirement being closed (PARTIAL → satisfied for async path)

### Locked contracts (DO NOT REGRESS)
- `supabase/migrations/20260415000000_merit_rpcs.sql:159-244` — `refund_merits` RPC contract; idempotent via `already_refunded` return
- `supabase/functions/_shared/merit-gateway.ts:200-225` — `refundMeritsForJob(userId, transactionId, reason)` signature (the only worker-side refund surface)
- `supabase/functions/_shared/merit-gateway.ts` (full file) — `withMerits` and `MeritRefundable` semantics; D-07 forbids workers calling `withMerits`
- `.planning/phases/11-merit-rpcs-and-reconciliation/11-CONTEXT.md` — RPC design decisions (idempotency, deduction_id semantics)
- `.planning/phases/13-merit-enforcement-and-feature-flag/13-CONTEXT.md` — gateway design decisions
- `.planning/phases/21-integration-validation-and-cutover/` (esp. MIG-02 RLS notes) — must not regress

### Code being modified
- `supabase/functions/submit-resume-analysis-job/index.ts:107-161` — `withMerits` block + insert (rename `_txId` → `txId`, add column to insert)
- `supabase/functions/submit-career-analysis-job/index.ts:96+` — mirror site
- `supabase/functions/process-resume-analysis-job/index.ts:28-43` — REQUIRED FOLLOW-UP comment to remove
- `supabase/functions/process-resume-analysis-job/index.ts:289-312` — response-path terminal-failure branch (D-03, D-06)
- `supabase/functions/process-resume-analysis-job/index.ts:313-343` — worker-error catch path (D-07)
- `supabase/functions/process-career-analysis-job/index.ts` — mirror sites for both branches
- `supabase/migrations/20260225160000_add_analysis_jobs_queue.sql` — base table schema (the column targeted by the new migration)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `refundMeritsForJob(userId, transactionId, reason)` (`_shared/merit-gateway.ts:209-225`) — already exists, already idempotent at the RPC layer, already logs structured `merit-refund` events. The worker's only required new dependency.
- `withMerits` callback already returns the `txId` as its first arg — submit-side change is a one-line rename + one-field-in-insert.
- `analysis_jobs.error` jsonb column — already used to record failure metadata; planner can stash `refund_status` here if a richer audit trail is wanted (optional, not required by SC).

### Established Patterns
- Both processors share near-identical structure (resume vs career). Plans should mirror the change in lockstep — drift between the two is the most likely defect class.
- Migration naming convention: `supabase/migrations/<UTC-timestamp>_<snake_case_description>.sql`. Use `_add_merit_transaction_id_to_analysis_jobs.sql` or equivalent.
- Existing worker tests (if any) use mocked Supabase service client + mocked fetch for the analyze-* invocation. Follow that style.
- Structured logging: workers use `console.error/warn/log` with object payloads (NOT the `_shared/logger.ts` createLogger pattern in some other functions). Stay consistent within these files.

### Integration Points
- Frontend (`useResumeStream.ts`) polls `analysis_jobs.status` and reacts to `status='failed'`. Refund happens server-side BEFORE the status flips to `failed`, so by the time the frontend sees `failed` and the `AiCreditsContext` refreshes (e.g., on next page load or API call), the merit balance reflects the refund. No frontend change required for this phase.
- `AiCreditsContext` reads merit balance from `user_merits` (or equivalent) — refunded merits are visible on next refresh; no contract change.

</code_context>

<specifics>
## Specific Ideas

- "REQUIRED FOLLOW-UP" comment block at `process-resume-analysis-job/index.ts:28-43` (and the mirror in process-career-analysis-job) describes exactly the work this phase performs. Planner should DELETE the entire comment block (the `KNOWN GAP` section) once the wiring is in — it's no longer accurate. Replace with a short note that the refund path exists and points at `refundMeritsForJob`.
- Keep `reason` strings short and snake_case for log greppability: `retry_exhausted`, `non_retryable_error`, `worker_exception`, `pre_migration_null_txid` (reserved for the warn-skip path, no actual refund call).

</specifics>

<deferred>
## Deferred Ideas

- **Audit/operator-attention surface for failed refunds.** Considered as a third option for D-05 but rejected as out-of-scope here. If repeated refund failures become a problem in production, a dedicated `merit_refund_failures` table + admin dashboard surface would be its own phase.
- **Submit-side test that verifies txn id is persisted in the insert payload.** Recommended but not required by SC #5; planner may include if scope allows.
- **Retroactive refund for in-flight jobs queued before the migration.** Out of scope — D-09 specifies graceful no-op + warn log. Any backfill would be a one-shot operator script, not part of this phase.

</deferred>

---

*Phase: 26-async-job-merit-refund-wiring*
*Context gathered: 2026-04-28*
