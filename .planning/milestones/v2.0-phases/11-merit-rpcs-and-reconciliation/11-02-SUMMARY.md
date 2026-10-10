---
phase: 11
plan: 02
subsystem: merit-ledger
tags: [rpc, security-definer, idempotency, pgtap, test-01, refund, deduction]
one_liner: "check_and_deduct_merits + refund_merits + get_merit_balance RPCs with 29 pgTAP assertions covering SHOP-10 subscription-first split, refund idempotency (SC #2), tier_locked gating, and D-20 CHECK constraint safety net"
requires:
  - Phase 10 user_merits / merit_transactions / auto_provision_user_merits trigger
  - Plan 11-01 merit_feature_costs 13-row seed + pgTAP bootstrap + test stubs
provides:
  - check_and_deduct_merits(uuid, text, text) RPC - subscription-first split deduction (SHOP-10)
  - refund_merits(uuid, uuid) RPC - idempotent AI-failure compensation (SC #2)
  - get_merit_balance(uuid) RPC - cheap frontend read for dashboards/balance endpoints
  - idx_merit_transactions_deduction_id partial expression index (refund lookup path)
  - 8-assertion refund_merits.test.sql (split restoration + double-refund idempotency)
  - 4-assertion get_merit_balance.test.sql (JSON shape smoke test)
  - 17-assertion check_and_deduct_merits.test.sql (TEST-01 coverage)
affects:
  - downstream: Plan 11-03 (credit_shop/reset/reconcile RPCs append §5..§7); Plan 11-04 (DO $$ verification block §9)
  - Phase 13: edge functions MUST pass auth.uid() for p_user_id to close T-11-11 IDOR
tech_stack:
  added: []
  patterns:
    - SECURITY DEFINER + SET search_path = public, pg_temp (ASVS V4 / T-11-10)
    - FOR UPDATE row lock on user_merits serializes concurrent callers (D-19)
    - REVOKE ALL + GRANT EXECUTE authenticated, service_role (T-11-15)
    - Tier_locked pre-check BEFORE any lock (D-02 fail-fast)
    - Split deduction writes 1 or 2 merit_transactions rows sharing deduction_id UUID (D-06)
    - Idempotent refund via EXISTS on metadata->>deduction_id (T-11-12)
    - Refund rows use balance_type='refund' (Pitfall 4) while user_merits restores original buckets (D-09)
    - TEMP TABLE _t_state for pgTAP-to-DO-block state passing (no GUC round-tripping)
key_files:
  created:
    - supabase/tests/database/check_and_deduct_merits.test.sql (populated from stub)
    - supabase/tests/database/refund_merits.test.sql (populated from stub)
    - supabase/tests/database/get_merit_balance.test.sql (populated from stub)
  modified:
    - supabase/migrations/20260415000000_merit_rpcs.sql (appended §2, §3, §4, §8)
decisions:
  - "check_and_deduct_merits returns 'tier_locked' BEFORE taking any lock when (feature, tier) cost row is absent (D-02 fail-fast)"
  - "Split deductions always share a single deduction_id UUID generated inside the RPC — callers never forge it, and the response's transaction_id is that UUID (D-06)"
  - "refund_merits writes rows with balance_type='refund' (Pitfall 4) even though user_merits is restored to the ORIGINAL subscription/shop bucket — reconciliation relies on SUM(amount) not balance_type"
  - "Idempotency check runs AFTER FOR UPDATE lock on user_merits so concurrent double-refund attempts serialize"
  - "pgTAP state passing uses TEMP TABLE _t_state rather than set_config/current_setting GUC round-tripping (plan explicitly rejects GUC pattern)"
  - "CHECK constraint on user_merits.subscription_balance/shop_balance (Phase 10 D-20) is asserted as a safety net via throws_ok, not relied upon as the primary defense"
metrics:
  tasks_completed: 3
  files_created: 0
  files_modified: 4
  requirements_touched: [MER-05, MER-06, MER-07, SHOP-10, TEST-01]
  duration_minutes: ~20
  completed_date: 2026-04-14
---

# Phase 11 Plan 02: Merit Deduct/Refund/Read RPCs Summary

## Summary

Ships the read + deduct + refund half of the Phase 11 RPC surface. Three SECURITY DEFINER RPCs are appended to the migration scaffold created in Plan 11-01, plus one partial expression index powering the refund lookup path. All three corresponding pgTAP test files (previously single-assertion stubs from Plan 11-01) are replaced with 29 total assertions that exercise every branch the RPCs expose:

1. `check_and_deduct_merits(uuid, text, text)` — single write path every Phase 13 edge function will call. Looks up cost in `merit_feature_costs`, returns `tier_locked` fail-fast when row absent, takes a `FOR UPDATE` lock on `user_merits`, splits deduction subscription-first (SHOP-10), writes 1 or 2 `merit_transactions` rows sharing a single `deduction_id` UUID, and updates `user_merits`. Returns `{ success, transaction_id, remaining_balance, deducted_from: { subscription, shop } }` on the happy path.
2. `refund_merits(uuid, uuid)` — idempotent compensation RPC for AI-call failures. Locks `user_merits`, checks for an existing refund row via `EXISTS` on `metadata->>deduction_id`, walks the original deduction rows by `deduction_id`, writes mirroring refund rows with `balance_type='refund'`, and restores the exact original subscription/shop buckets on `user_merits`. Double calls with the same `deduction_id` return `{ error: 'already_refunded' }` with zero mutations (SC #2). Unknown `transaction_id` returns `{ error: 'unknown_transaction' }`.
3. `get_merit_balance(uuid)` — pure read, no lock. Returns `{ subscription_balance, shop_balance, total, next_reset_date }` in a single `SELECT jsonb_build_object(...)` LANGUAGE sql function.
4. `idx_merit_transactions_deduction_id` — partial expression index on `(metadata->>'deduction_id') WHERE metadata ? 'deduction_id'`. Mirrors the shape of Phase 10's `idx_merit_transactions_refund_of`.

Plan executed as written with zero deviations. All structural acceptance criteria (grep/count) verified locally against the worktree file. The `supabase db reset --local` + `supabase db test` runtime gates are dev-local / CI verification gates and were NOT executed in this worktree (same constraint Plan 11-01's executor documented — no local Supabase stack available inside agent worktree). The `DO $$` verification block added in Plan 11-04 will exercise the full deploy path, and CI runs `scripts/run-db-tests.ps1` against the pgTAP suite.

## Tasks Completed

| # | Task                                                                                     | Commit   |
| - | ---------------------------------------------------------------------------------------- | -------- |
| 1 | Append check_and_deduct_merits + get_merit_balance + idx_merit_transactions_deduction_id | 2e8d6b6  |
| 2 | Append refund_merits + populate refund_merits.test.sql + get_merit_balance.test.sql      | 3bcfeb3  |
| 3 | Populate check_and_deduct_merits.test.sql (TEST-01 coverage, 17 assertions)              | 88ba225  |

## Files Modified

- `supabase/migrations/20260415000000_merit_rpcs.sql` — appended §2 check_and_deduct_merits, §3 refund_merits, §4 get_merit_balance, §8 idx_merit_transactions_deduction_id. File grew from 60 to 268 lines.
- `supabase/tests/database/check_and_deduct_merits.test.sql` — 17 pgTAP assertions across 10 scenarios (stub → full TEST-01 coverage)
- `supabase/tests/database/refund_merits.test.sql` — 8 pgTAP assertions covering split deduction + double-refund idempotency (stub → SC #2 coverage)
- `supabase/tests/database/get_merit_balance.test.sql` — 4 pgTAP assertions verifying all four JSON keys (stub → smoke test)

## pgTAP Assertion Inventory

**check_and_deduct_merits.test.sql (plan(17))**

| # | Assertion | Purpose |
|---|-----------|---------|
| 1 | subscription_balance 10 → 7 | SHOP-10 subscription-first |
| 2 | shop_balance untouched at 10 | SHOP-10 no overflow when sub covers cost |
| 3 | Exactly 1 subscription row written | D-06 no spurious rows |
| 4 | subscription_balance drained 2 → 0 | Split: sub bucket fully consumed |
| 5 | shop_balance 10 → 9 | Split: shop covers overflow of 1 |
| 6 | Single deduction_id across 2 rows | D-06 shared UUID |
| 7 | shop_balance 10 → 7 (sub=0) | Pure-shop deduction |
| 8 | Exactly 1 shop row written | Pure-shop correctness |
| 9 | Response error = 'insufficient_merits' | Insufficient detection |
| 10 | subscription_balance unchanged at 1 | Insufficient: zero mutation |
| 11 | Zero feature-deduct rows written | Insufficient: no transaction log pollution |
| 12 | Response error = 'tier_locked' (recruiting_lens) | D-02 / RCL-01 |
| 13 | Balance unchanged at 200 | Tier_locked: zero mutation |
| 14 | Response error = 'tier_locked' (interview_prep) | D-02 / IPC-01 |
| 15 | metadata->>'tier' = 'free' | Tier propagation to ledger |
| 16 | response.transaction_id = metadata.deduction_id | UUID echo contract |
| 17 | throws_ok on manual -1 UPDATE (SQLSTATE 23514) | D-20 CHECK constraint safety net |

**refund_merits.test.sql (plan(8))**

| # | Assertion | Purpose |
|---|-----------|---------|
| 1 | check_and_deduct returns non-null transaction_id | Precondition for refund |
| 2 | Split deduction writes exactly 2 rows | Precondition shape |
| 3 | Balance drops to 0 after full deduct | Precondition state |
| 4 | First refund success = true | Happy path |
| 5 | subscription_balance restored to 2 | D-09 exact-bucket restore |
| 6 | shop_balance restored to 1 | D-09 exact-bucket restore |
| 7 | Exactly 2 refund rows (second refund added 0) | T-11-12 idempotency proof |
| 8 | Second refund returns error = 'already_refunded' | SC #2 explicit assertion |

**get_merit_balance.test.sql (plan(4))**

| # | Assertion | Purpose |
|---|-----------|---------|
| 1 | subscription_balance key = 7 | Key shape |
| 2 | shop_balance key = 4 | Key shape |
| 3 | total key = 11 | Computed field |
| 4 | next_reset_date key not null | Timestamptz serialized |

**Total assertions: 29 across 3 files.**

## Verification

All acceptance criteria from the plan are verified structurally (file content via grep and line counts):

**§2 / §4 / §8 (Task 1) — migration content:**
- `CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(p_user_id uuid, p_feature text, p_tier text)` (single-line signature matches the plan's grep)
- `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `FOR UPDATE`, `LEAST(v_sub_balance, v_cost)`, `gen_random_uuid()`
- `'tier_locked'`, `'insufficient_merits'`, `'deduction_id'`, `'feature-deduct'`
- `REVOKE ALL ON FUNCTION public.check_and_deduct_merits` + `GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text)`
- `CREATE OR REPLACE FUNCTION public.get_merit_balance(p_user_id uuid)` + corresponding REVOKE/GRANT
- `idx_merit_transactions_deduction_id` + `WHERE metadata ? 'deduction_id'`

**§3 (Task 2) — refund_merits content:**
- `CREATE OR REPLACE FUNCTION public.refund_merits(p_user_id uuid, p_transaction_id uuid)` (single-line)
- `'already_refunded'`, `'unknown_transaction'`, `balance_type = 'refund'`, `'refund_of'`, `'feature-refund'`
- `REVOKE ALL ON FUNCTION public.refund_merits` + `GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid)`

**Task 2 test files:**
- `SELECT plan(8)` in refund_merits.test.sql with 8 descriptive assertions
- `CREATE TEMP TABLE IF NOT EXISTS _t_state` state-passing pattern (no `set_config('tests.` GUC usage — plan's negative grep passes)
- `'already_refunded'` assertion string present
- `split deduction writes exactly 2` + `second refund call is idempotent no-op` test labels present

**Task 3 test file:**
- `SELECT plan(17)` with all TEST-01 scenarios covered
- `'insufficient_merits'`, `'tier_locked'`, `'recruiting_lens'`, `'interview_prep'`, `throws_ok`, `COUNT(DISTINCT metadata`, `BEGIN;`, `ROLLBACK;` all present

**Runtime gates NOT executed in this worktree (same as Plan 11-01):**
- `supabase db reset --local` requires a local Supabase stack (not available inside an agent worktree)
- `supabase db test --file ...` is exercised by `scripts/run-db-tests.ps1` in CI and developer-local runs
- Plan 11-04's `DO $$` verification block will fail the migration at deploy time if any of the three RPC definitions regress between now and deploy

## Deviations from Plan

None — plan executed exactly as written.

The only implementation-level note worth recording is that Task 1's plan grep acceptance criteria literally asserts the function signature on a single line (`grep -q "CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(p_user_id uuid, p_feature text, p_tier text)"`). The first draft wrote the signature across 5 lines following the `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` template style. The final file collapses the signature onto one line so the plan's grep passes, while keeping the function body's parameter layout unchanged. This is not a behavioral deviation — both forms compile and execute identically; it's purely a formatting choice to satisfy the exact acceptance gate.

## Threat Model Mitigations Applied

- **T-11-10 (Elevation of Privilege / search_path hijack):** All three new RPCs include `SET search_path = public, pg_temp`. Grep acceptance criterion confirmed.
- **T-11-11 (Spoofing / IDOR on p_user_id):** RPCs grant EXECUTE to `authenticated`, so the Phase 13 caller contract (MUST pass `auth.uid()`) is documented in the plan's `<interfaces>` block. Phase 11 owns the definition; Phase 13 owns the caller-side enforcement.
- **T-11-12 (Tampering / double-refund replay):** `refund_merits` idempotency check via `EXISTS (SELECT 1 FROM merit_transactions WHERE balance_type='refund' AND metadata->>'deduction_id' = p_transaction_id::text)`. Asserted by refund_merits.test.sql assertion #8.
- **T-11-13 (Tampering / TOCTOU negative balance):** `FOR UPDATE` row lock serializes concurrent calls (D-19). Phase 10 `CHECK (>= 0)` constraint is the safety net (D-20) — asserted by check_and_deduct_merits.test.sql throws_ok test.
- **T-11-15 (Elevation / public EXECUTE leak):** `REVOKE ALL ... FROM public` + explicit `GRANT EXECUTE ... TO authenticated, service_role` on every new RPC. Grep acceptance criteria confirmed.
- **T-11-16 (Information Disclosure via get_merit_balance):** Same IDOR concern as T-11-11; Phase 13 MUST pass `auth.uid()`. Documented in the plan's interfaces block.

## Known Stubs

None. All three test files previously stubbed by Plan 11-01 are now populated with real assertions. The remaining three pgTAP files (credit_shop_merits.test.sql, reset_subscription_merits.test.sql, reconciliation.test.sql) are still stubs and are explicitly reserved for Plan 11-03 — that's the contract Plan 11-01's SUMMARY.md "Known Stubs" section established.

## Threat Flags

None — no new trust boundaries or attack surface beyond what the plan's threat model already covered.

## Self-Check: PASSED

File content verified (worktree paths):

- FOUND: supabase/migrations/20260415000000_merit_rpcs.sql (268 lines, up from 60)
- FOUND: supabase/tests/database/check_and_deduct_merits.test.sql (217 lines, up from 6)
- FOUND: supabase/tests/database/refund_merits.test.sql (131 lines, up from 6)
- FOUND: supabase/tests/database/get_merit_balance.test.sql (49 lines, up from 6)

Commits verified in worktree branch `worktree-agent-a94e2b45` (parented on f836bd4 = Wave 1's merged HEAD):

- FOUND: 2e8d6b6 feat(11-02): add check_and_deduct_merits + get_merit_balance RPCs
- FOUND: 3bcfeb3 feat(11-02): add refund_merits RPC with pgTAP idempotency coverage
- FOUND: 88ba225 test(11-02): populate check_and_deduct_merits pgTAP coverage (TEST-01)

All 15 Task 1 grep acceptance checks pass. All 14 Task 2 grep acceptance checks pass (including the negative `! grep set_config('tests.` check). All 9 Task 3 grep acceptance checks pass.
