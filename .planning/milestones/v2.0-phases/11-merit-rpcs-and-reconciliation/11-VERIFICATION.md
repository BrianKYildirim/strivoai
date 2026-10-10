---
phase: 11-merit-rpcs-and-reconciliation
verified: 2026-04-16T13:30:00Z
status: human_needed
score: 5/6
overrides_applied: 0
human_verification:
  - test: "Run full pgTAP suite against local Supabase DB"
    expected: "supabase db test exits 0 with 69 passing assertions across 7 test files (including bootstrap), zero failures"
    why_human: "Requires running Supabase local stack with Docker; cannot verify programmatically without a live database"
  - test: "Verify SC #6 specifically: run the test suite twice consecutively"
    expected: "Both runs exit 0 with 69 assertions passing (Plan 05 cleanup blocks ensure idempotency)"
    why_human: "Plan 04 SUMMARY confirms tests were never executed locally due to no Docker; Plan 05 adds cleanup blocks but consecutive-run idempotency was not verified against a live DB"
---

# Phase 11: merit-rpcs-and-reconciliation Verification Report

**Phase Goal:** Ship the atomic SECURITY DEFINER RPCs that are the only legitimate write path to Merit balances, with full unit test coverage.
**Verified:** 2026-04-16T13:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | check_and_deduct_merits deducts from subscription_balance first and only overflows to shop_balance when subscription funds are insufficient | VERIFIED | Migration line 109: `v_sub_take := LEAST(v_sub_balance, v_cost); v_shop_take := v_cost - v_sub_take;`. Test file check_and_deduct_merits.test.sql plan(17) has assertions #1-3 (sub-first), #4-5 (split), #7-8 (pure-shop). SHOP-10 ordering proven. |
| 2 | refund_merits called twice with the same transaction_id only reverses the deduction once | VERIFIED | Migration lines 175-183: EXISTS check on `balance_type='refund'` and `metadata->>'deduction_id'`, returns `already_refunded` on second call. Test file refund_merits.test.sql plan(8): assertion #7 (exactly 2 refund rows after both calls, proving second added none) and #8 (`second refund call is idempotent no-op`). Balances verified unchanged at assertions #5-6. |
| 3 | credit_shop_merits called twice with the same stripe_payment_intent_id only credits the user once | VERIFIED | Migration lines 289-300: pre-lookup on `merit_shop_purchases.stripe_payment_intent_id`, returns `{success:true, duplicate:true}` on match. Test file credit_shop_merits.test.sql plan(14): assertions #5 (duplicate=true), #6 (shop_balance unchanged), #7 (single purchase row), #8 (single ledger row). |
| 4 | reset_subscription_merits(user_id, 'pro') sets subscription_balance=75 and free_linkedin_scan_used=false without touching shop_balance | VERIFIED | Migration lines 370-387: `WHEN 'pro' THEN 75`, `WHEN 'elite' THEN 150`, UPDATE SET clause lists only subscription_balance, free_linkedin_scan_used, subscription_reset_date, updated_at -- shop_balance is NOT in the SET clause. Test file reset_subscription_merits.test.sql plan(15): assertion #2 (pro=75), #3 (shop=99 untouched), #4 (free_linkedin_scan_used=false), #7 (elite=150), #8 (elite shop=99 untouched), #10-12 (free tier no-op), #14 (yearly cadence: three resets all land on 75). |
| 5 | A reconciliation query on any user returns zero drift between (subscription_balance + shop_balance) and the running sum of merit_transactions | VERIFIED | Migration lines 418-441: `reconcile_merit_balance` returns `drift = (sub+shop) - COALESCE(SUM(amount),0)`. Test file reconciliation.test.sql plan(11): 11 sequential drift=0 assertions after baseline, credit, deduct, refund, another deduct, pro reset, another deduct, 10-pack credit, recruiting_lens deduct, elite reset, and tier_locked no-op. All six RPCs exercised in one sequence. |
| 6 | All RPC unit tests (TEST-01..03) pass in CI | ? UNCERTAIN | All 6 test files exist with 69 total assertions (17+14+4+11+8+15). Plan 05 added idempotent cleanup blocks for consecutive-run safety. scripts/run-db-tests.ps1 CI wrapper exists. However, Plan 04 SUMMARY explicitly states pgTAP suite was NOT executed locally due to no Docker. No evidence of any successful test run exists. Tests must be run by human to confirm SC #6. |

**Score:** 5/6 truths verified (1 needs human execution)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260415000000_merit_rpcs.sql` | 6 SECURITY DEFINER RPCs + cost table + index + DO $$ verification | VERIFIED | 517 lines, 6 CREATE OR REPLACE FUNCTION, 6 SECURITY DEFINER, 6 SET search_path, 6 REVOKE ALL, 6 GRANT EXECUTE, 13-row seed, partial index, DO $$ block |
| `supabase/tests/database/00_pgtap_bootstrap.sql` | pgTAP extension bootstrap | VERIFIED | 8 lines, contains `CREATE EXTENSION IF NOT EXISTS pgtap` |
| `supabase/tests/database/check_and_deduct_merits.test.sql` | TEST-01 coverage | VERIFIED | plan(17), covers sub-first, split, pure-shop, insufficient, tier_locked (2 features), metadata, CHECK constraint |
| `supabase/tests/database/refund_merits.test.sql` | SC #2 refund idempotency | VERIFIED | plan(8), covers split deduction, first refund success, bucket restoration, second refund idempotent no-op |
| `supabase/tests/database/get_merit_balance.test.sql` | JSON shape smoke test | VERIFIED | plan(4), verifies all 4 JSON keys present with correct values |
| `supabase/tests/database/credit_shop_merits.test.sql` | TEST-03 coverage | VERIFIED | plan(14), all 4 pack sizes, duplicate idempotency, CHECK constraint for invalid pack |
| `supabase/tests/database/reset_subscription_merits.test.sql` | TEST-02 coverage | VERIFIED | plan(15), pro=75, elite=150, free no-op, shop untouched, yearly cadence, grant delta math |
| `supabase/tests/database/reconciliation.test.sql` | SC #5 drift test | VERIFIED | plan(11), 11 drift=0 assertions across all 6 RPC types in sequence |
| `scripts/run-db-tests.ps1` | CI wrapper | VERIFIED | 11 lines, wraps `supabase db test`, ErrorActionPreference=Stop, LASTEXITCODE check |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| check_and_deduct_merits | merit_feature_costs | `SELECT cost ... FROM public.merit_feature_costs WHERE feature AND tier` | WIRED | Line 83: cost lookup before any lock. Missing row returns tier_locked. |
| refund_merits | merit_transactions via deduction_id | `idx_merit_transactions_deduction_id` partial expression index | WIRED | Lines 180, 190: metadata->>'deduction_id' used for idempotency check and row walk. Index at line 264. |
| credit_shop_merits | merit_shop_purchases.stripe_payment_intent_id | Pre-lookup + UNIQUE constraint | WIRED | Line 291: SELECT by stripe_payment_intent_id for duplicate check. Line 305: INSERT with FK. |
| reconcile_merit_balance | user_merits + merit_transactions | Pure aggregate drift calculation | WIRED | Lines 431-438: `(sub+shop) - COALESCE(SUM(amount),0)` as drift. |
| DO $$ block | pg_proc + merit_feature_costs | Deploy-time assertion checking prosecdef, proconfig, row count | WIRED | Lines 450-516: asserts 6 RPCs, hardened search_path, 13 cost rows, 1 index. RAISE EXCEPTION on mismatch. |

### Data-Flow Trace (Level 4)

Not applicable -- these are SQL RPCs (SECURITY DEFINER functions) and pgTAP tests, not frontend components rendering dynamic data. Data flows are verified through the key link analysis above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration file parses as valid SQL | Structural inspection of 517-line file | 6 RPCs, DO $$ block, all sections present | ? SKIP -- requires running DB to execute |
| pgTAP suite runs green | `supabase db test` | Not executed (no local Docker) | ? SKIP -- human verification item |
| 69 assertions across 6 test files | `grep SELECT plan() across all files` | 17+14+4+11+8+15 = 69 | PASS |

Step 7b: Partially SKIPPED (no runnable entry points without Supabase local stack).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| MER-05 | 11-01, 11-02, 11-04 | RPC check_and_deduct_merits -- atomic, row-locked, subscription-first | SATISFIED | Migration lines 67-151: full RPC with SECURITY DEFINER, FOR UPDATE, LEAST-based split. Test: 17 assertions. |
| MER-06 | 11-02 | RPC refund_merits -- idempotent reversal | SATISFIED | Migration lines 160-234: EXISTS check, loop over deduction rows, `already_refunded` return. Test: 8 assertions. |
| MER-07 | 11-02 | RPC get_merit_balance returns 4-key JSON | SATISFIED | Migration lines 240-257: pure SQL function returning jsonb. Test: 4 assertions verifying all keys. |
| MER-08 | 11-03 | RPC credit_shop_merits -- credits shop_balance, idempotent on stripe_payment_id | SATISFIED | Migration lines 275-339: pre-lookup, INSERT, UPDATE, ledger row. Test: 14 assertions. |
| MER-09 | 11-03 | RPC reset_subscription_merits -- sets subscription_balance to 75/150 | SATISFIED | Migration lines 349-410: pro=75, elite=150, free no-op, shop untouched. Test: 15 assertions. |
| MER-12 | 11-03 | Merit balance reconciliation query -- drift=0 invariant | SATISFIED | Migration lines 418-444: pure aggregate function. Test: 11 drift assertions across all RPCs. |
| SHOP-10 | 11-02 | Subscription balance deducted before shop balance | SATISFIED | Migration line 109: `LEAST(v_sub_balance, v_cost)` ensures sub-first. Test assertions #1-3 (sub-first), #4-5 (split). |
| TEST-01 | 11-02 | Unit tests for check_and_deduct_merits | SATISFIED | check_and_deduct_merits.test.sql: 17 assertions covering insufficient, sub-first, shop fallback, tier access, refund readiness. |
| TEST-02 | 11-03 | Unit tests for reset_subscription_merits | SATISFIED | reset_subscription_merits.test.sql: 15 assertions covering monthly reset, no rollover, yearly cadence. |
| TEST-03 | 11-03 | Unit tests for credit_shop_merits | SATISFIED | credit_shop_merits.test.sql: 14 assertions covering all 4 pack sizes, duplicate rejection, balance update. |

All 10 requirement IDs from ROADMAP.md and PLAN frontmatter are accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | No TODO, FIXME, PLACEHOLDER, HACK, stub, or empty implementation patterns detected across all migration and test files. |

### Human Verification Required

### 1. Execute Full pgTAP Suite Against Live Database

**Test:** Start Supabase local stack (`supabase start`), reset the database (`supabase db reset --local`), then run `supabase db test` (or `pwsh scripts/run-db-tests.ps1`).
**Expected:** All 7 test files execute with 69+1 = 70 total assertions passing (69 from 6 RPC tests + 1 from bootstrap). Zero failures. The migration output should contain the notice: `Phase 11 verification passed: 6 RPCs (hardened), 13 cost rows, 1 deduction index`.
**Why human:** Requires Docker and Supabase CLI connected to a local stack. Cannot be verified without running the actual database. Plan 04 SUMMARY explicitly confirms this was never executed.

### 2. Verify Consecutive Run Idempotency

**Test:** After test #1 passes, run `supabase db test` a second time WITHOUT resetting the database.
**Expected:** All tests pass again (69 assertions). Plan 05 added idempotent DELETE cleanup blocks to handle leftover fixture rows from prior runs.
**Why human:** Same Docker/Supabase dependency. This specifically validates Plan 05's gap closure for the pgTAP idempotency fix.

### Gaps Summary

No code-level gaps found. All 6 RPCs are fully implemented with correct logic, security hardening (SECURITY DEFINER, search_path, REVOKE/GRANT), row locking (FOR UPDATE), and idempotency patterns. The cost table has 13 correctly seeded rows. The DO $$ verification block provides deploy-time safety. All 6 test files contain substantive assertions (69 total) covering every success criterion.

The only open item is **execution verification**: the pgTAP test suite has never been run against a live database. The tests are structurally sound and cover all success criteria, but SC #6 ("All RPC unit tests pass in CI") cannot be marked as verified without evidence of a successful test execution. This requires human action (starting Docker + Supabase local stack).

---

_Verified: 2026-04-16T13:30:00Z_
_Verifier: Claude (gsd-verifier)_
