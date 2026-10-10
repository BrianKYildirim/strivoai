---
phase: 26-async-job-merit-refund-wiring
plan: 02
subsystem: payments
tags: [merit, supabase, deno, edge-functions, async-jobs, refund, mer-11]

requires:
  - phase: 26-async-job-merit-refund-wiring
    plan: 01
    provides: analysis_jobs.merit_transaction_id column (live in target DB), refundMeritsForJob discriminated-union, both submitters persist txId
provides:
  - process-resume-analysis-job calls refundMeritsForJob on every terminal-failure branch BEFORE status='failed' UPDATE (D-03, D-06, D-07, D-09)
  - process-career-analysis-job mirror with feature: 'career_analysis'
  - SC #5 (a)-(d) source-grep tests covering completed-no-refund, response-path refund, worker-catch refund (D-07), already_refunded acknowledgement, NULL txid warn-skip
  - MER-11 async-path leak closed
affects:
  - none (terminal phase for MER-11)

tech-stack:
  added: []
  patterns:
    - "Refund block guarded by `if (!txId)` short-circuit with console.warn('refund-skip', { reason: 'pre_migration_null_txid' }) for D-09 invariant"
    - "Reason-string taxonomy: retry_exhausted | non_retryable_error | worker_exception (pre_migration_null_txid reserved for log only, NEVER passed to refundMeritsForJob)"
    - "Best-effort refund — failure logged but does not block the status='failed' UPDATE (D-05)"

key-files:
  created:
    - supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts
    - supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts
    - .planning/phases/26-async-job-merit-refund-wiring/26-02-SUMMARY.md
  modified:
    - supabase/functions/process-resume-analysis-job/index.ts
    - supabase/functions/process-career-analysis-job/index.ts

key-decisions:
  - "Hoist `userId` derivation at the top of the career worker's for-loop body (not lazily inside the catch) to ensure single binding visible at both refund call sites — mirrors how the resume worker already derives userId at line 187"
  - "Apply the refund block as a scoped block ({ ... }) immediately above each status='failed' UPDATE rather than a top-level helper function — keeps the call site auditable, preserves D-04/D-05/D-06/D-09 invariants in one visible unit, and avoids a cross-file refactor that would obscure the order-of-operations contract"
  - "Use raw `console.warn/error/info` with object payloads (not the structured `_shared/logger.ts createLogger`) to match the workers' existing logging style — switching loggers would be unrelated cleanup outside plan scope"
  - "Tests are source-grep (not fetch-stub) — workers' for-loop is too entangled with fetch + supabase.from chains to stub cleanly; the dominant in-folder pattern (analyze-resume/merit-branch.test.ts, _shared/__tests__/merit-gateway-already-refunded.test.ts) is also source-grep"

patterns-established:
  - "Worker terminal-failure refund block: read `job.merit_transaction_id` → `if (!txId)` warn-skip → otherwise call refundMeritsForJob and log refund-failed/refund-already-refunded — pattern reused identically in resume + career workers"
  - "Drift-resistant sibling-edit: maintain a structural mirror between process-resume-analysis-job and process-career-analysis-job; differences MUST be feature/job_type strings only — verified via diff <(grep ...) <(grep ...) output limited to feature key"

requirements-completed: [MER-11]

duration: ~22 min
completed: 2026-04-28
---

# Phase 26 Plan 02: async-job-merit-refund-wiring Summary

**Both async workers (`process-resume-analysis-job` and `process-career-analysis-job`) now call `refundMeritsForJob` on every terminal-failure branch BEFORE writing `status='failed'`, with NULL-txid short-circuit (D-09), reason-string taxonomy (retry_exhausted / non_retryable_error / worker_exception), and 17 SC #5 (a)-(d) tests green — closing the MER-11 async-path leak end-to-end (combined with Plan 01).**

## Performance

- **Duration:** ~22 min (3 tasks committed atomically)
- **Started:** 2026-04-28 (continuation right after Plan 01)
- **Completed:** 2026-04-28
- **Tasks:** 3 (all `type="auto"`, all autonomous)
- **Files created:** 3 (2 test files + this SUMMARY); **Files modified:** 2 (both async workers)

## Accomplishments

- Resume worker now calls `refundMeritsForJob(userId, txId, reason)` at TWO sites — response-path (`reason = retryable ? 'retry_exhausted' : 'non_retryable_error'`) and worker-catch maxedOut (D-07) (`reason = 'worker_exception'`) — each immediately BEFORE the existing `status='failed'` UPDATE (D-06)
- Career worker mirrors structurally with `feature: 'career_analysis'`; drift check vs resume worker shows only the feature key differs
- Both workers' `AnalysisJobRow` types now declare `merit_transaction_id: string | null;` and BOTH SELECT projections (initial candidate fetch + claim re-fetch) include the column
- KNOWN GAP / REQUIRED FOLLOW-UP comment block deleted from both workers' RESILIENCE CONTRACT JSDoc and replaced with a one-line MER-11 note
- `if (!txId)` short-circuit (D-09) with `console.warn('refund-skip', { job_id, reason: 'pre_migration_null_txid' })` covers pre-migration rows
- Refund failures are logged via `console.error('refund-failed', { user_id, merit_transaction_id, job_id, feature, reason })` and DO NOT block the `status='failed'` UPDATE (D-05)
- `r.alreadyRefunded` (idempotent RPC short-circuit, surfaced by Plan 01's typed return) is acknowledged via `console.info('refund-already-refunded', ...)`
- 17 source-grep Deno tests across both workers all pass: 8 for resume + 9 for career (career has an extra `feature: 'career_analysis'` assertion + drift guard)
- D-04 negative invariant preserved: no `refundMeritsForJob` call appears inside any `status='retrying'` or `status='completed'` branch in either worker (manually verified via grep line numbers)

## Task Commits

1. **Task 1: Wire refunds into process-resume-analysis-job** — `fdb8f51` (feat)
2. **Task 2: Mirror refund wiring into process-career-analysis-job** — `0e366bc` (feat)
3. **Task 3: Add SC #5 (a)-(d) tests for both workers** — `d6e0fd4` (test)

## Files Created/Modified

- `supabase/functions/process-resume-analysis-job/index.ts` (modified, Task 1) — 6 edits: (1) added `import { refundMeritsForJob } from '../_shared/merit-gateway.ts';`, (2) added `merit_transaction_id: string | null;` field to `AnalysisJobRow`, (3) replaced both `.select(...)` projections (lines ~120 and ~153 pre-edit) to include `merit_transaction_id`, (4) deleted the KNOWN GAP / REQUIRED FOLLOW-UP paragraph in the RESILIENCE CONTRACT JSDoc and replaced with a one-line note, (5) inserted the refund block at the response-path failed branch (immediately above `update analysis_jobs set status='failed'`) with `reason = retryable ? 'retry_exhausted' : 'non_retryable_error'` and `feature: 'resume_analysis'`, (6) inserted the same block (with `reason = 'worker_exception'`) inside the catch's `else` arm immediately above its own `status='failed'` UPDATE. `userId` was already derived at line 187 (top of for-loop body) and is in scope at both sites.
- `supabase/functions/process-career-analysis-job/index.ts` (modified, Task 2) — byte-for-byte mirror of Task 1 against `feature: 'career_analysis'`. One additional structural change unique to career: `userId` was NOT pre-derived in the worker's for-loop body, so it is hoisted as `const userId = String((payload as { userId?: unknown }).userId || job.user_id || "");` at the top of the for-loop body (along with `const payload = job.payload || {};`) so it is in scope at both refund call sites. The downstream `body: JSON.stringify(job.payload || {})` was updated to `body: JSON.stringify(payload)` for consistency. Existing `error.retryReason: 'worker_exception'` jsonb field on the catch-path UPDATE is intentionally preserved (independent of refund call). Drift-check `diff <(grep -E "refundMeritsForJob|pre_migration_null_txid|refund-failed|refund-already-refunded|feature:" resume.ts) <(... career.ts)` shows only the two `feature: 'resume_analysis'` vs `feature: 'career_analysis'` lines differ.
- `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` (created, Task 3) — 8 Deno.test cases: SC#5(a) completed-no-refund, SC#5(b) response-path refundMeritsForJob(userId, txId, ...) with retry_exhausted|non_retryable_error reason, SC#5(b)bis worker-catch maxedOut refund (D-07) with worker_exception reason, SC#5(c) import + alreadyRefunded/already_refunded acknowledgement, SC#5(d) console.warn pre_migration_null_txid + negative check (NEVER passed to refundMeritsForJob), D-09 `if (!txId)` short-circuit, SC#2-mirror SELECT projection includes merit_transaction_id, CONTEXT-specifics REQUIRED FOLLOW-UP comment removed.
- `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` (created, Task 3) — same 8 cases as resume + 1 career-specific drift guard ("feature key is NOT 'resume_analysis'") = 9 cases total. SC#5(b) additionally asserts `feature: 'career_analysis'` literal. Catch-block regex matches both `catch (processError)` and `catch (err)` to handle the syntactic variance between workers.

## Decisions Made

- **Refund-block placement:** scoped `{ ... }` block inline above each `status='failed'` UPDATE rather than extracting a helper. Keeps the order-of-operations contract (refund-then-fail, D-06) auditable in one visible unit and avoids cross-file refactor scope creep.
- **userId hoist (career only):** lifted to top of for-loop body rather than inside the catch. Single binding visible at both refund sites; mirrors resume worker's existing line-187 derivation.
- **Logging style:** kept the workers' existing raw `console.warn/error/info` with object payloads. The structured `_shared/logger.ts createLogger` would be a separate cleanup; out of scope.
- **Test style:** source-grep over fetch-stub — workers' for-loop tightly couples fetch + supabase.from + status mutations; stubbing would be invasive. Source-grep matches the dominant in-folder pattern (analyze-resume/merit-branch.test.ts, merit-gateway-already-refunded.test.ts).

## Verification Results

Plan-level `<verification>` checks:

1. **Resume worker wired** — `grep -c "refundMeritsForJob(userId, txId" .../process-resume-analysis-job/index.ts` = 2 ✓; `grep -c "pre_migration_null_txid"` = 2 ✓; `grep -c "REQUIRED FOLLOW-UP\|KNOWN GAP"` = 0 ✓. PASS.
2. **Career worker wired** — `grep -c "refundMeritsForJob(userId, txId" .../process-career-analysis-job/index.ts` = 2 ✓; `grep -c "pre_migration_null_txid"` = 2 ✓; `grep -c "feature: 'career_analysis'"` = 2 ✓; `grep -c "feature: 'resume_analysis'"` = 0 ✓ (no copy-paste leak). PASS.
3. **Tests pass for both workers** — `deno test --no-check --allow-env --allow-read supabase/functions/process-resume-analysis-job/__tests__/ supabase/functions/process-career-analysis-job/__tests__/` → 17 passed, 0 failed (8 resume + 9 career). PASS.
4. **Full edge test suite** — `.\scripts\run-edge-tests.ps1` → 215 passed, 0 failed. PASS.
5. **D-04 negative invariant (manual)** — grepped both workers for `refundMeritsForJob`, `status: "retrying"`, `status: "completed"` and confirmed refund call sites are only the two terminal-failure branches in each worker. PASS.
   - Resume: refundMeritsForJob at lines 284 + 349 (terminal-failure). status='completed' at line 203, status='retrying' at lines 248 + 332 — all clean of refund calls.
   - Career: refundMeritsForJob at lines 194 + 242 (terminal-failure). status='completed' at line 145, status='retrying' at lines 175 + 226 — all clean of refund calls.
6. **Lint scope-boundary** — `npm run lint` shows 8249 pre-existing errors (Plan 01 baseline); zero errors in `process-resume-analysis-job/index.ts`, `process-career-analysis-job/index.ts`, or the two new test files. PASS for files in scope. Pre-existing baseline tracked under CLAUDE.md scope-boundary; not introduced by this plan.
7. **Type checks** — `deno check supabase/functions/process-resume-analysis-job/index.ts` and `deno check supabase/functions/process-career-analysis-job/index.ts` both succeed. PASS.

## Confirmation: MER-11 closed end-to-end

Plan 01 added the schema column + helper return type + submitter persistence; Plan 02 wires the refund into both workers' terminal-failure paths. Combined effect:

- New jobs persist `merit_transaction_id` on insert (Plan 01 / Tasks 4 + 5)
- Workers read the persisted txId and call `refundMeritsForJob` before the row flips to `status='failed'` (Plan 02 / Tasks 1 + 2)
- Pre-migration rows (NULL `merit_transaction_id`) short-circuit gracefully via D-09 warn-skip (no refund attempt, no error)
- Re-processing of an already-refunded job is idempotent via the RPC's `already_refunded` return → `r.alreadyRefunded === true` → info-level log (Plan 01 / Task 3 + Plan 02 / both workers)

The MER-11 async-path leak (job exhausts retries → user charged Merits but no refund) is closed.

## Deviations from Plan

**1. [Rule 2 - Critical correctness] Hoisted `userId` and `payload` in the career worker's for-loop body**
- **Found during:** Task 2
- **Issue:** Career worker did not pre-derive `userId` anywhere in the for-loop body (unlike resume worker line 187). Without hoisting, the refund block at the response-path site would have no `userId` in scope, and the catch-block site would have to redo the derivation.
- **Fix:** Added `const payload = job.payload || {}; const userId = String((payload as { userId?: unknown }).userId || job.user_id || "");` at the top of the for-loop body. Updated the existing `body: JSON.stringify(job.payload || {})` line to use the now-hoisted `payload` for consistency.
- **Files modified:** `supabase/functions/process-career-analysis-job/index.ts`
- **Commit:** `0e366bc`
- **Plan reference:** Plan body Task 2 §action item 5 anticipated this: "Ensure `userId` is in scope before this block. If not, hoist."

**2. [Rule 1 - Bug] Career worker test catch-block regex broadened to match `catch (err)`**
- **Found during:** Task 3 test authoring
- **Issue:** The plan body specified the regex `catch \(processError\)[\s\S]*?status:\s*["']failed["']` for SC#5(b)bis. But career worker uses `catch (err)`, not `catch (processError)`. As-written, the regex would have matched no segment and the test would fail.
- **Fix:** Career test uses `catch \((?:processError|err)\)[\s\S]*?status:\s*["']failed["']` to match both syntactic variants. Resume test keeps the narrower `catch (processError)` since that's exactly what the resume worker uses.
- **Files modified:** `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts`
- **Commit:** `d6e0fd4`

**3. [Note - environmental] Concurrent agent activity on this branch produced an unrelated commit attribution muddle**
- **Found during:** Task 2 commit-time post-deletion check
- **Issue:** My `git add supabase/functions/process-career-analysis-job/index.ts` plus `git commit` produced a commit (`0e366bc`) that ALSO included pre-staged deletions of `src/components/MeritBalanceBadge.tsx`, `src/components/MeritBalanceBadge.test.tsx`, `src/components/UpgradeModal.tsx` (left in the index by a prior session/concurrent agent).
- **Investigation:** Subsequent commit `3a2e2e6 feat(25-01): delete orphan MeritBalanceBadge + UpgradeModal files` (by a different concurrent process) confirms those deletions were intentional under Phase 25-01's design. My Task 2 commit did not destroy work — it inadvertently included a deletion that another concurrent agent was about to commit anyway. Net effect on disk: identical to the planned final state. Net effect on commit attribution: those three deletions are dual-claimed across `0e366bc` and `3a2e2e6`. The actual phase-25-01 commit is `3a2e2e6`.
- **Fix attempted:** I tried to restore the files via `git checkout 0e366bc^ -- ...` (and again via `fdb8f51 -- ...`); both attempts were neutralized by the concurrent agent's own commits landing on the branch within seconds.
- **Outcome:** Files correctly absent from current HEAD per the actual phase-25-01 design. No work lost. No remediation needed.
- **Impact:** Cosmetic — none on the MER-11 plan, the schema, the workers, or the test suite.

**Total deviations:** 3 (1 anticipated by plan body, 1 minor regex broadening, 1 environmental note with no impact)
**Impact on plan:** None. All success criteria met.

## TDD Gate Compliance

The plan declares `tdd="true"` on all three tasks. The verification methodology (per the plan body's `<verify>` blocks) is grep-based for Tasks 1 + 2 and `deno test`-based for Task 3 — there is no fetch-stub harness for the workers, and the plan body explicitly directs source-grep tests rather than RED/GREEN integration tests.

Tasks 1 and 2 modify production code that is verified by the Task 3 source-grep tests. Task 3 was authored AFTER Tasks 1 and 2 landed (it grep-asserts against the worker source). This is structurally a "GREEN-first then test-as-drift-guard" cadence — the same pattern Plan 01 used for Tasks 4 and 5. The test file passes immediately on first run because the implementation it grep-asserts against was committed first.

A strict TDD reading would have authored Task 3 first as RED (against pre-edit workers, all tests fail) then committed Tasks 1 + 2 as GREEN. The plan body's task ordering inverts this. Followed plan body verbatim.

## Issues Encountered

- **Concurrent agent collision on by/env-fixes branch:** described in Deviation #3 above. No work lost; cosmetic commit-attribution muddle only. The branch is clearly being driven by multiple parallel processes during this session window — future runs on this branch should consider a worktree or a feature branch to avoid the same surface.

## User Setup Required

None — no external service configuration required. Plan 01's `supabase db push` already shipped the schema change. Plan 02 is pure code + tests.

## Authentication Gates

None during Plan 02 execution.

## Self-Check: PASSED

Files created on disk:
- `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` — FOUND
- `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` — FOUND
- `.planning/phases/26-async-job-merit-refund-wiring/26-02-SUMMARY.md` — FOUND (this file)

Commits in git log:
- `fdb8f51` (Task 1) — FOUND
- `0e366bc` (Task 2) — FOUND
- `d6e0fd4` (Task 3) — FOUND

All acceptance criteria from each task's `<acceptance_criteria>` block re-verified: PASSED.

## Next Phase Readiness

Phase 26 is complete. MER-11 is fully closed (sync path was already covered by Phase 13's `withMerits` refund branch; async path is now covered by Plan 02). No follow-up phases pending against the merit-refund subsystem.

---
*Phase: 26-async-job-merit-refund-wiring*
*Completed: 2026-04-28*
