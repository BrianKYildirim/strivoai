---
phase: 11-merit-rpcs-and-reconciliation
plan: 05
subsystem: database-tests
tags: [pgTAP, idempotent-cleanup, test-isolation]
dependency_graph:
  requires: []
  provides: [idempotent-pgtap-tests]
  affects: [supabase/tests/database/]
tech_stack:
  added: []
  patterns: [idempotent-test-cleanup, FK-safe-delete-order]
key_files:
  created: []
  modified:
    - supabase/tests/database/check_and_deduct_merits.test.sql
    - supabase/tests/database/credit_shop_merits.test.sql
    - supabase/tests/database/get_merit_balance.test.sql
    - supabase/tests/database/reconciliation.test.sql
    - supabase/tests/database/refund_merits.test.sql
    - supabase/tests/database/reset_subscription_merits.test.sql
decisions:
  - DELETE order must be children-before-parents to respect FK constraints
  - Single-UUID files use equality syntax; multi-UUID files use IN() syntax
metrics:
  duration: 113s
  completed: "2026-04-16T12:52:55Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 11 Plan 05: Idempotent Test Cleanup Summary

Idempotent DELETE cleanup blocks added to all 6 pgTAP test files so consecutive runs no longer hit duplicate-key constraint violations on hardcoded fixture UUIDs.

## What Changed

Added a cleanup block between `BEGIN;` and `SELECT plan(N)` in each of 6 test files. Each block DELETEs from 5 tables in FK-safe child-before-parent order: `merit_shop_purchases`, `merit_transactions`, `user_merits`, `profiles`, `auth.users`. The exact fixture UUIDs from each file are targeted -- no cross-contamination between files.

## Task Results

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Add idempotent cleanup blocks to all 6 pgTAP test files | 44a3fd3 | 6 test SQL files |
| 2 | Verify cleanup blocks are syntactically valid SQL | (verification only) | None |

## Structural Validation Results

| File | Plan Count | DELETE Statements | UUIDs |
|------|-----------|-------------------|-------|
| check_and_deduct_merits.test.sql | 17 | 5 | 7 |
| credit_shop_merits.test.sql | 14 | 5 | 1 |
| get_merit_balance.test.sql | 4 | 5 | 1 |
| reconciliation.test.sql | 11 | 5 | 1 |
| refund_merits.test.sql | 8 | 5 | 1 |
| reset_subscription_merits.test.sql | 15 | 5 | 3 |
| **Total** | **69** | **30** | **14** |

All checks passed:
- BEGIN; is first non-comment line in all files
- Cleanup DELETEs appear after BEGIN; and before SELECT plan()
- Plan counts unchanged (17 + 14 + 4 + 11 + 8 + 15 = 69)
- All files end with SELECT * FROM finish(); and ROLLBACK;
- DELETE order is children-before-parents in every file
- No cross-contamination of UUIDs between files

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
