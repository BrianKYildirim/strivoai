---
phase: 26-async-job-merit-refund-wiring
verified: 2026-04-29T02:33:48Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 26: async-job-merit-refund-wiring Verification Report

**Phase Goal:** Close MER-11's async-path leak so terminal failures in queued resume/career analysis jobs refund merits via `refundMeritsForJob()` instead of consuming them silently. Schema migration adds `merit_transaction_id uuid NULL` to `analysis_jobs`; both submitters persist the txn id; both workers refund on every transition to `status='failed'`; idempotency delegated to RPC `already_refunded`.

**Verified:** 2026-04-29T02:33:48Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP Success Criteria (SC #1-#6) and Plan 01 / Plan 02 frontmatter `must_haves.truths`. SC #5 sub-criteria (a-d) are pinned by the test files; SC #4 idempotency is pinned by RPC delegation + helper extension.

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | After migration, `analysis_jobs` has a nullable `merit_transaction_id uuid` column (SC #1) | VERIFIED | `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql:14-15` contains `ALTER TABLE public.analysis_jobs ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL;`. Plan 01 SUMMARY confirms operator ran `supabase db push` with verification SQL returning `(merit_transaction_id, uuid, YES)`. |
| 2  | Both submitters persist the txn id returned by `withMerits()` into `analysis_jobs.merit_transaction_id` (SC #2) | VERIFIED | `submit-resume-analysis-job/index.ts:110` callback signature is `async (txId) =>`; line 133 has `merit_transaction_id: txId,` on the insert payload. `submit-career-analysis-job/index.ts:99` and 126 mirror the same. |
| 3  | Both submitters refund merits if the `analysis_jobs` insert fails (D-08a closes a narrow leak inside `withMerits`) | VERIFIED | `submit-resume-analysis-job/index.ts:142` throws `MeritRefundable(503, ...)`; `submit-career-analysis-job/index.ts:135` mirrors. `MeritRefundable` is imported on line 6 of both files. `withMerits` refund classification is the documented gateway contract — class is in scope and throw-site is correct. |
| 4  | `refundMeritsForJob` returns `{ ok: true, alreadyRefunded: true }` and logs at info-level when the RPC returns `already_refunded` (D-02) | VERIFIED | `_shared/merit-gateway.ts:209-230`: return type is `Promise<{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }>`; lines 224-227 detect `data.error === 'already_refunded'`, log at `log.info('merit-refund-already-refunded', ...)`, return `{ ok: true, alreadyRefunded: true }`. Transport-error branch unchanged. |
| 5  | Migration is idempotent — re-applying yields no schema change and no error (SC #6) | VERIFIED | Migration uses `ADD COLUMN IF NOT EXISTS` and `COMMENT ON COLUMN` (idempotent by SQL semantics). Plan 01 SUMMARY documents operator ran `supabase db push` twice; second run reported no migrations to apply. |
| 6  | Both workers call `refundMeritsForJob()` BEFORE writing `status='failed'` on every terminal failure path (SC #3, D-03, D-06) | VERIFIED | `process-resume-analysis-job/index.ts:277-297` (response-path) followed by `update analysis_jobs ... status='failed'` at lines 299-310. Worker-catch path: lines 342-362 followed by `status='failed'` at 364-371. `process-career-analysis-job/index.ts` mirrors at lines 187-207 (response) → 209-217 (failed update); 235-255 (catch) → 257-264 (failed update). Order-of-operations preserved (D-06). |
| 7  | Both workers ALSO refund in the worker-catch `maxedOut===true` branch (D-07) | VERIFIED | Resume worker: refund block at lines 342-362, inside `else` arm of `catch (processError)` after `if (!maxedOut)` retry path (line 328). Career worker: refund block at lines 235-255, inside `else` arm of `catch (err)` after `if (!maxedOut)` retry path (line 223). Reason `'worker_exception'` used in both. |
| 8  | Both workers short-circuit (warn log + skip) when `merit_transaction_id IS NULL` (SC #5(d), D-09) | VERIFIED | Resume: `if (!txId) { console.warn('refund-skip', { job_id: job.id, reason: 'pre_migration_null_txid' }); }` at lines 280-281 + 345-346. Career: lines 190-191 + 238-239. `pre_migration_null_txid` is NEVER passed to `refundMeritsForJob` (test SC#5(d) negative-asserts this). |
| 9  | Idempotency on re-process is delegated to the `refund_merits` RPC's `already_refunded` return (SC #4, D-01) | VERIFIED | Workers call `refundMeritsForJob` unconditionally on terminal-failure (no worker-side dedupe state). The helper (`merit-gateway.ts:224-227`) recognizes `already_refunded` from the RPC body and returns `{ ok: true, alreadyRefunded: true }`. Workers acknowledge with `console.info('refund-already-refunded', ...)` (resume:294, career:204; resume catch:359, career catch:252). |
| 10 | The obsolete REQUIRED FOLLOW-UP / KNOWN GAP comment block is removed from both workers | VERIFIED | grep for `REQUIRED FOLLOW-UP\|KNOWN GAP` returns 0 in both worker files (replaced by single-line MER-11 note at resume:29 and career:29). Pinned by `CONTEXT-specifics: REQUIRED FOLLOW-UP comment is removed` test in both test files. |
| 11 | Deno tests cover SC #5 cases (a)–(d) for both workers (SC #5) | VERIFIED | Test files exist at `process-resume-analysis-job/__tests__/refund-on-failure.test.ts` (8 tests) and `process-career-analysis-job/__tests__/refund-on-failure.test.ts` (9 tests). All 17 + 4 helper tests = 21 tests pass. SC#5(a) completed-no-refund, SC#5(b) response-path refund, SC#5(b)bis worker-catch refund (D-07), SC#5(c) idempotency import, SC#5(d) NULL warn-skip — all covered for both workers. |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260429000000_add_merit_transaction_id_to_analysis_jobs.sql` | Schema additive migration adding `merit_transaction_id uuid NULL` | VERIFIED | Exists, 32 lines, contains `ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL` and `COMMENT ON COLUMN`. No FK, no index. |
| `supabase/functions/_shared/merit-gateway.ts` | Extended `refundMeritsForJob` recognizes `already_refunded` and returns typed `alreadyRefunded: true` | VERIFIED | Discriminated union return type at line 213; `already_refunded` literal at line 224; `alreadyRefunded: true` at line 226; `log.info('merit-refund-already-refunded', ...)` at line 225. |
| `supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts` | D-02 helper extension source-grep test | VERIFIED | Exists, 4 Deno tests, all pass. |
| `supabase/functions/submit-resume-analysis-job/index.ts` | Persist txn id on insert + wrap insert error in MeritRefundable | VERIFIED | `merit_transaction_id: txId` at line 133; `throw new MeritRefundable(503, ...)` at line 142; `_txId` underscore not present. |
| `supabase/functions/submit-career-analysis-job/index.ts` | Mirror of resume submitter | VERIFIED | `merit_transaction_id: txId` at line 126; `throw new MeritRefundable(503, ...)` at line 135. |
| `supabase/functions/process-resume-analysis-job/index.ts` | Refund call inserted at response-path failed branch + worker-catch maxedOut branch; SELECT projection includes merit_transaction_id; KNOWN GAP comment removed | VERIFIED | Import at line 5; SELECT projections at lines 108 and 141 include `merit_transaction_id`; AnalysisJobRow type at line 42 includes `merit_transaction_id: string \| null`; refund blocks at 277-297 + 342-362 BEFORE failed UPDATEs at 299-310 + 364-371; KNOWN GAP comment removed. |
| `supabase/functions/process-career-analysis-job/index.ts` | Mirror of resume worker with `feature: 'career_analysis'` | VERIFIED | Import at line 5; SELECT projections at lines 87 and 117 include `merit_transaction_id`; refund blocks at 187-207 + 235-255 BEFORE failed UPDATEs; `feature: 'career_analysis'` at lines 200 and 248; no `feature: 'resume_analysis'` leak. |
| `supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts` | SC #5 (a)-(d) source-grep tests for resume worker | VERIFIED | Exists, 8 tests, all pass. |
| `supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` | SC #5 (a)-(d) source-grep tests for career worker (mirror) | VERIFIED | Exists, 9 tests (one extra drift guard), all pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `submit-resume-analysis-job/index.ts` | `_shared/merit-gateway.ts (withMerits)` | `withMerits` callback receives txId, persisted in insert payload | WIRED | Pattern `merit_transaction_id: txId` matches at line 133 inside withMerits callback (line 107-164). |
| `submit-career-analysis-job/index.ts` | `_shared/merit-gateway.ts (withMerits)` | `withMerits` callback receives txId, persisted in insert payload | WIRED | Pattern `merit_transaction_id: txId` matches at line 126 inside withMerits callback (line 96-163). |
| `_shared/merit-gateway.ts (refundMeritsForJob)` | `20260415000000_merit_rpcs.sql (refund_merits RPC)` | `supabase.rpc('refund_merits', ...)` — reads `data.error === 'already_refunded'` | WIRED | Line 215 calls `supabase.rpc('refund_merits', ...)`; line 224 reads `data.error === 'already_refunded'`. |
| `process-resume-analysis-job/index.ts` | `_shared/merit-gateway.ts (refundMeritsForJob)` | import + call before status='failed' UPDATE | WIRED | Import line 5; calls at line 284 (response-path) and line 349 (worker-catch); both BEFORE status='failed' UPDATEs (lines 299-310 and 364-371). |
| `process-career-analysis-job/index.ts` | `_shared/merit-gateway.ts (refundMeritsForJob)` | import + call before status='failed' UPDATE | WIRED | Import line 5; calls at line 194 (response-path) and line 242 (worker-catch); both BEFORE status='failed' UPDATEs (lines 209-217 and 257-264). |
| `process-{resume,career}-analysis-job/index.ts (SELECT projections)` | `analysis_jobs.merit_transaction_id` | `supabase.from('analysis_jobs').select('..., merit_transaction_id')` | WIRED | Resume: lines 108 + 141 include `merit_transaction_id` in select. Career: lines 87 + 117 include `merit_transaction_id`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Worker refund call site (resume + career) | `txId` (= `job.merit_transaction_id`) | SELECT projection from `analysis_jobs` row populated by submitter `withMerits` callback (`merit_transaction_id: txId`) where `txId` is the deduction handle returned by `check_and_deduct_merits` RPC (Phase 11) | Yes — txId originates from authoritative RPC; persisted on submit; read by worker; passed to `refund_merits` RPC | FLOWING |
| `refundMeritsForJob` RPC call | `data` (RPC body) | `supabase.rpc('refund_merits', { p_user_id, p_transaction_id })` | Yes — RPC self-filters by `user_id` and `metadata->>'deduction_id'`, returns either `{}` (refund executed) or `{"error":"already_refunded"}` (idempotent no-op) per migration `20260415000000:184-193` | FLOWING |
| Submitter insert payload | `txId` (in `merit_transaction_id` column) | `withMerits` callback parameter (typed by gateway contract) | Yes — `withMerits` deducts merits via `check_and_deduct_merits` RPC and passes the resulting deduction_id to the callback | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 26 Deno tests pass | `deno test --no-check --allow-env --allow-read supabase/functions/_shared/__tests__/merit-gateway-already-refunded.test.ts supabase/functions/process-resume-analysis-job/__tests__/refund-on-failure.test.ts supabase/functions/process-career-analysis-job/__tests__/refund-on-failure.test.ts` | `21 passed | 0 failed (288ms)` | PASS |
| `refundMeritsForJob` is exported and callable | grep import / signature check in callers | Imported at submit + worker sites; signature matches discriminated union | PASS |
| Migration column query returns expected row | Operator-run SQL (documented in Plan 01 SUMMARY) | `(merit_transaction_id, uuid, YES)` confirmed by operator | PASS (operator-confirmed) |
| Migration idempotency | Operator-run `supabase db push` twice | Second run = no migrations to apply | PASS (operator-confirmed) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MER-11 | 26-01-PLAN, 26-02-PLAN | "Merit deduction MUST happen BEFORE the AI call; on AI failure the deduction is auto-refunded and logged" (REQUIREMENTS.md:22) | SATISFIED (end-to-end) | **Sync path:** already closed by Phase 13's `withMerits` (gateway refunds on `MeritRefundable` throws from `analyze-resume`/`analyze-career` streaming path). **Async path (this phase):** Plan 01 added schema + helper extension + submitter persistence + D-08a insert-failure refund; Plan 02 wired `refundMeritsForJob` into both workers' two terminal-failure branches with reason taxonomy. Both submitters now persist `merit_transaction_id`; both workers call `refundMeritsForJob(userId, txId, reason)` BEFORE every `status='failed'` UPDATE; pre-migration NULL txids short-circuit gracefully (D-09); re-process idempotency delegated to RPC `already_refunded` (D-01). REQUIREMENTS.md traceability table (line 262) maps MER-11 → Phases 13, 26 — both phases now satisfy. |

**Orphaned check:** REQUIREMENTS.md traceability maps `MER-11 → 13, 26`. Phase 26 plans declared `requirements: [MER-11]` in both Plan 01 and Plan 02 frontmatter. No orphaned requirements for Phase 26.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TODO/FIXME/PLACEHOLDER markers found in modified files. KNOWN GAP comment block was deliberately removed (verified by tests). No empty implementations, no hardcoded empty data, no console-log-only handlers. Refund-block scoped `{ ... }` blocks are intentional design (per Plan 02 key-decisions) for auditable order-of-operations. |

### D-04 Negative Invariant Check

Manual review for forbidden refund calls inside `status='retrying'` or `status='completed'` branches:

- **Resume worker** (`process-resume-analysis-job/index.ts`):
  - `status: "completed"` at line 203 → no `refundMeritsForJob` in surrounding block (lines 199-222). Confirmed by SC#5(a) test.
  - `status: "retrying"` at lines 248 + 332 → no `refundMeritsForJob` in surrounding blocks (lines 242-274 + 328-340). PASS.
- **Career worker** (`process-career-analysis-job/index.ts`):
  - `status: "completed"` at line 145 → no `refundMeritsForJob` in surrounding block (lines 143-156). Confirmed by SC#5(a) test.
  - `status: "retrying"` at lines 175 + 226 → no `refundMeritsForJob` in surrounding blocks (lines 171-185 + 223-233). PASS.

D-04 invariant preserved in both workers.

### Drift Check (Resume vs Career)

Per Plan 02 key-decisions, sibling-worker drift is the dominant defect class. Manual diff of refund-related code between `process-resume-analysis-job/index.ts` and `process-career-analysis-job/index.ts`:

- Both workers import `refundMeritsForJob` from same path: PASS
- Both have identical refund block structure (txId capture → if (!txId) warn → else call+log): PASS
- Only differences: `feature: 'resume_analysis'` vs `feature: 'career_analysis'` (intended); `JOB_TYPE` constant; `TARGET_FUNCTION` constant; catch parameter (`processError` vs `err`).
- Career test file's drift guard (`career drift guard: feature key is NOT 'resume_analysis'`) actively pins this — passes.

### Human Verification Required

None. All verification was achievable programmatically:
- Migration column existence was operator-confirmed during Plan 01 Task 2 (BLOCKING checkpoint) and documented in Plan 01 SUMMARY with verification SQL output.
- All code-level wiring is greppable and source-grep tests pin the contract.
- Behavioral correctness of refund flow is enforced by helper unit tests + worker source-grep tests.
- No UI, real-time behavior, or external service integration in scope for this phase.

### Gaps Summary

No gaps. Phase 26 closes MER-11's async-path leak end-to-end:

1. **Schema** — `analysis_jobs.merit_transaction_id` column live in target DB (operator-confirmed).
2. **Submit-side** — both submitters persist the txId on `analysis_jobs` insert; insert failures throw `MeritRefundable(503)` so `withMerits` refunds before re-raising (D-08a leak closed).
3. **Helper** — `refundMeritsForJob` returns the discriminated union `{ ok: true; alreadyRefunded?: boolean } | { ok: false; error: string }` and recognizes the RPC's `already_refunded` body at info-level (D-02).
4. **Worker-side** — both workers call `refundMeritsForJob(userId, txId, reason)` BEFORE every `status='failed'` UPDATE at both terminal-failure branches (response-path retry-exhausted/non-retryable + worker-catch maxedOut). NULL txid short-circuits with warn log (D-09). Re-process idempotency delegated to RPC `already_refunded` (D-01). D-04 invariant preserved (no refund inside retrying/completed branches).
5. **Tests** — 21 tests across 3 files all pass (4 helper + 8 resume + 9 career), pinning SC #5 (a)-(d) for both workers plus drift guards.

Combined with Phase 13 (which closed the sync path via `withMerits` refund branch), MER-11 is now satisfied across all merit-deduction code paths.

---

*Verified: 2026-04-29T02:33:48Z*
*Verifier: Claude (gsd-verifier)*
