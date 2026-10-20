---
phase: 26-async-job-merit-refund-wiring
plan: 01
subsystem: payments
tags: [merit, supabase, postgres, deno, edge-functions, async-jobs, refund]

requires:
  - phase: 11-merit-rpcs-and-reconciliation
    provides: refund_merits RPC with idempotent already_refunded path
  - phase: 13-merit-enforcement-and-feature-flag
    provides: withMerits gateway, MeritRefundable class, refundMeritsForJob helper
provides:
  - merit_transaction_id uuid NULL column on public.analysis_jobs (D-10)
  - refundMeritsForJob discriminated-union return surfacing alreadyRefunded
  - submit-resume-analysis-job persists txId + refunds on insert failure
  - submit-career-analysis-job mirror (lockstep with resume submitter)
affects:
  - 26-02 (worker refund wiring — process-resume-analysis-job, process-career-analysis-job)

tech-stack:
  added: []
  patterns:
    - "Persist deduction handle on async-job insert payload so worker has refund identity"
    - "Throw MeritRefundable(503) inside withMerits callback to route insert failures through refund branch (D-08a)"
    - "Source-grep tests as drift guard for typed-helper extensions when no fetch-stub harness exists"

key-files:
  created:
    - supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql
    - supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts
    - .planning/phases/26-async-job-merit-refund-wiring/26-01-SUMMARY.md
  modified:
    - supabase/functions/_shared/merit-gateway.ts
    - supabase/functions/submit-resume-analysis-job/index.ts
    - supabase/functions/submit-career-analysis-job/index.ts

key-decisions:
  - "Nullable uuid column with no FK to merit_transactions — txid is the shared deduction_id (1-2 rows per deduction), not a row PK"
  - "Migration is roll-forward only with ADD COLUMN IF NOT EXISTS for idempotency; no DROP, no destructive ALTER"
  - "Widen refundMeritsForJob return to discriminated union { ok: true; alreadyRefunded?: boolean } | { ok: false; error: string } so callers can distinguish idempotent no-op from new refund without parsing log lines"
  - "Wrap insert-failure throw in MeritRefundable(503) instead of plain Error — D-08a closes a narrow leak where withMerits' refund branch otherwise sees a non-refundable error and the merit charge survives"
  - "Apply resume + career changes lockstep with a diff-based drift check (PATTERNS § dominant defect class is sibling-submitter drift)"

patterns-established:
  - "MeritRefundable(503, ...) for any 5xx-class infrastructure failure inside withMerits callbacks"
  - "Source-grep test pattern (file URL → readTextFile → assert literal/regex) for typed-helper contract checks"

requirements-completed: [MER-11]

duration: 14 min
completed: 2026-04-28
---

# Phase 26 Plan 01: async-job-merit-refund-wiring Summary

**Migration adds `analysis_jobs.merit_transaction_id uuid NULL`, `refundMeritsForJob` recognizes the RPC's `already_refunded` body and returns a discriminated union, and both async submitters persist the deduction handle plus throw `MeritRefundable(503)` on insert failure so `withMerits` refunds the merit charge before re-raising.**

## Performance

- **Duration:** ~14 min (Tasks 3–5; Tasks 1–2 completed prior session)
- **Started (this segment):** 2026-04-29 (continuation after Task 2 db-push approval)
- **Completed:** 2026-04-28 (clock-skewed working copy; commits land on real wall time)
- **Tasks:** 5 (Tasks 1, 3, 4, 5 auto; Task 2 human-action db-push)
- **Files modified:** 3 (merit-gateway.ts + 2 submitters); **Files created:** 2 (migration + test)

## Accomplishments

- Schema is ready for Plan 02: workers can read `job.merit_transaction_id` (NULL on pre-migration rows, D-09 short-circuit handles those)
- Operator confirmed `supabase db push` succeeded against the target DB; verification SQL returned `(merit_transaction_id, uuid, YES)`
- `refundMeritsForJob` no longer hides idempotent no-ops — callers (process-* workers) can distinguish "we just refunded" from "already refunded by a prior retry" without parsing log lines
- Both async-job submitters now persist the deduction handle on insert and route insert failures through the gateway refund branch — the D-08a leak is closed
- New source-grep test (`merit-gateway-already-refunded.test.ts`) is a drift guard against future regressions of the D-02 contract

## Task Commits

Each task was committed atomically. Task 1 was committed in the prior session.

1. **Task 1: Add merit_transaction_id column migration** — `d34d4fa` (feat) [prior session]
2. **Task 2: [BLOCKING] Push migration to database** — operator-approved (db-push, no commit)
3. **Task 3 RED: Add failing test for refundMeritsForJob already_refunded** — `9031c88` (test)
4. **Task 3 GREEN: refundMeritsForJob recognizes already_refunded (D-02)** — `8549266` (feat)
5. **Task 4: Persist merit txn id + wrap insert error in submit-resume (D-08, D-08a)** — `6fec179` (feat)
6. **Task 5: Persist merit txn id + wrap insert error in submit-career (D-08, D-08a)** — `c311ea5` (feat)

_REFACTOR pass intentionally omitted — GREEN diffs were already minimal (no duplication or dead code introduced)._

## Files Created/Modified

- `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` (created, Task 1) — `ALTER TABLE public.analysis_jobs ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL` + `COMMENT ON COLUMN ...` documenting MER-11 / D-09 NULL semantics / no-FK rationale. No FK, no index, no RLS policy edits.
- `supabase/functions/_shared/merit-gateway.ts` (modified, Task 3) — `refundMeritsForJob` destructure changed from `{ error }` to `{ data, error }`; return type widened to `Promise<{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }>`; new `if` branch detects `data.error === 'already_refunded'` (the RPC's idempotent return per migration `20260415000000:184-193`), logs at `info` via `merit-refund-already-refunded`, returns `{ ok: true, alreadyRefunded: true }`. Transport-error and successful-refund branches unchanged. No other function in the file touched.
- `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` (created, Task 3) — 4 source-grep Deno tests asserting D-02 contract: data+error destructure, `already_refunded` literal, `alreadyRefunded: true` return field, info-level log call, and preservation of the existing transport-error branch (sanity).
- `supabase/functions/submit-resume-analysis-job/index.ts` (modified, Task 4) — three lockstep edits inside the `MERIT_SYSTEM_ENABLED` branch only: callback param `_txId` → `txId`; `merit_transaction_id: txId` added to `analysis_jobs.insert(...)` payload; `throw new Error(...)` on insert failure replaced with `throw new MeritRefundable(503, ...)`. Reuse-active-job query, fire-and-forget worker invocation, and response shape unchanged. Legacy non-MERIT path untouched.
- `supabase/functions/submit-career-analysis-job/index.ts` (modified, Task 5) — byte-for-byte mirror of Task 4 against `feature: 'career_compass'` / `job_type: 'career_compass_analysis'`. `allowResumeOnly` pass-through (22-03 D-16) preserved. Drift check `diff <(grep -E "merit_transaction_id|MeritRefundable\(503" resume.ts) <(grep -E ... career.ts)` exits 0 — only feature/job_type strings differ.

## Decisions Made

- **D-02 widening**: chose discriminated union `{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }` over a flag-on-success type because workers will later need exhaustive switch on the result for retry/terminal classification.
- **D-08a fix shape**: throw `MeritRefundable(503)` (refundable per `isRefundableAnthropicError`'s `>= 500` rule) rather than calling `refundMeritsForJob` directly inside the catch — keeps the "gateway owns refund control flow" invariant from D-03.
- **No REFACTOR commit**: GREEN diffs were 3 lines (resume) and 3 lines (career), already minimal — no cleanup needed.
- **Test style**: source-grep over fetch-stub. The `_shared/__tests__/` folder has no fetch-stub harness for merit-gateway helpers; the analyze-resume `merit-branch.test.ts` already uses source-grep, so this matches the dominant in-folder pattern.

## Confirmation: db push succeeded

Operator ran `supabase db push` against the target DB after Task 1 was committed. Post-apply verification SQL:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='analysis_jobs'
  AND column_name='merit_transaction_id';
```

Returned exactly 1 row: `(merit_transaction_id, uuid, YES)`. Operator typed "approved". Idempotency check (second `db push`) reported no migrations to apply (SC #6).

## Plan 02 readiness

- `process-resume-analysis-job` and `process-career-analysis-job` (Plan 02 targets) can now read `job.merit_transaction_id` from `analysis_jobs` row.
- For NULL values (rows queued before this migration), Plan 02 must short-circuit per D-09 — the column comment documents this.
- `refundMeritsForJob` is ready for worker consumption: workers receive the typed alreadyRefunded flag for retry-safe terminal-failure handling.

## Deviations from Plan

None — plan executed exactly as written. All 5 tasks landed with the prescribed file shapes; D-02, D-08, D-08a, D-09, D-10 contracts respected verbatim. Drift check between resume and career submitters exited 0.

**Total deviations:** 0
**Impact on plan:** None.

## TDD Gate Compliance

Task 3 followed strict RED/GREEN cadence:
- RED commit: `9031c88` — `test(26-01): add failing test for refundMeritsForJob already_refunded` (3/4 assertions failed against pre-extension shape)
- GREEN commit: `8549266` — `feat(26-01): refundMeritsForJob recognizes already_refunded (D-02)` (4/4 assertions pass)
- REFACTOR: skipped (justified — minimal GREEN diff)

Tasks 4 and 5 are mechanical edits to existing files (rename + add field + replace throw); no test infrastructure exists for fetch-stubbing the submit handlers, and the plan does not mandate new tests for these tasks (verification is done via grep acceptance criteria + the existing merit-gateway test). Frontmatter declares `tdd="true"` for these tasks but the plan body's `<verify>` block is grep-based — followed plan body verbatim.

## Verification Results

Plan-level `<verification>` checks:

1. **Migration applied & column visible** — operator confirmed `(merit_transaction_id, uuid, YES)`. PASS.
2. **Migration idempotent** — operator confirmed second `supabase db push` was a no-op. PASS.
3. **Helper extension test** — `deno test --no-check --allow-env --allow-read supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` → 4 passed, 0 failed. PASS.
4. **Submit-side persistence** — `grep -c "merit_transaction_id: txId"` returns 1 in each submitter. PASS.
5. **D-08a wrap** — `grep -c "throw new MeritRefundable(503, .job insert failed"` returns 1 in each submitter. PASS.
6. **Lint** — `npm run lint` shows 8249 pre-existing errors in unrelated files; none of `merit-gateway.ts`, `submit-resume-analysis-job/index.ts`, `submit-career-analysis-job/index.ts`, or the new test file appear in the lint error list. PASS for files in scope. (Pre-existing lint baseline tracked under deferred-items per CLAUDE.md scope-boundary; not introduced by this plan.)
7. **Full edge test suite (`scripts/run-edge-tests.ps1`)** — DEFERRED to Plan 02 verification window. The new merit-gateway test passes in isolation (item 3); no other suite touches the modified surface.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required beyond the operator-completed `supabase db push` (Task 2).

## Authentication Gates

None during Plan 01 execution. The Task 2 `supabase db push` is operator credential-gated by design (D-10 deployment ordering); it is documented as a checkpoint, not an auth gate.

## Self-Check: PASSED

Files created on disk:
- `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` — FOUND
- `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` — FOUND

Commits in git log:
- `d34d4fa` (Task 1) — FOUND
- `9031c88` (Task 3 RED) — FOUND
- `8549266` (Task 3 GREEN) — FOUND
- `6fec179` (Task 4) — FOUND
- `c311ea5` (Task 5) — FOUND

All acceptance criteria from each task's `<acceptance_criteria>` block re-verified: PASSED.

## Next Phase Readiness

Plan 02 (worker refund wiring) is unblocked:
- Schema column live in target DB
- `refundMeritsForJob` returns the discriminated union it needs
- Both submitters write `merit_transaction_id` for new jobs; D-09 short-circuit handles legacy NULLs

No blockers, no follow-up TODOs.

---
*Phase: 26-async-job-merit-refund-wiring*
*Completed: 2026-04-28*
