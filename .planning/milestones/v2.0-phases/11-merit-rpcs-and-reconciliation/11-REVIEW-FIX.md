---
phase: 11-merit-rpcs-and-reconciliation
fixed_at: 2026-04-16T15:00:00Z
review_path: .planning/phases/11-merit-rpcs-and-reconciliation/11-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-04-16T15:00:00Z
**Source review:** .planning/phases/11-merit-rpcs-and-reconciliation/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: credit_shop_merits CASE expression produces NULL for unrecognized pack_size

**Files modified:** `supabase/migrations/20260415000000_merit_rpcs.sql`, `supabase/tests/database/credit_shop_merits.test.sql`
**Commit:** 7d66357
**Applied fix:** Added explicit `IF p_pack_size NOT IN (3, 10, 25, 50)` guard at the top of `credit_shop_merits` (before any lock or mutation) that returns `jsonb_build_object('error', 'invalid_pack_size')`. Updated the test (test 14) to expect the new jsonb error response (`error=invalid_pack_size`) instead of the previous SQLSTATE 23502 NOT NULL constraint violation.

### WR-01: check_and_deduct_merits does not handle missing user_merits row

**Files modified:** `supabase/migrations/20260415000000_merit_rpcs.sql`
**Commit:** 27372c2
**Applied fix:** Added `IF v_sub_balance IS NULL THEN RETURN jsonb_build_object('error', 'user_not_found'); END IF;` after the `SELECT ... INTO ... FOR UPDATE` on `user_merits`. This prevents NULL arithmetic from bypassing the insufficient_merits guard and prevents orphaned merit_transactions rows for users without a user_merits row.

### WR-02: refund_merits does not verify user_merits row exists before proceeding

**Files modified:** `supabase/migrations/20260415000000_merit_rpcs.sql`
**Commit:** f558a64
**Applied fix:** Added `IF NOT FOUND THEN RETURN jsonb_build_object('error', 'user_not_found'); END IF;` immediately after the `PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE` statement. This returns a clear `user_not_found` error instead of falling through to the misleading `unknown_transaction` error when the user does not exist.

### WR-03: get_merit_balance returns NULL for non-existent user_id

**Files modified:** `supabase/migrations/20260415000000_merit_rpcs.sql`
**Commit:** e412c5a
**Applied fix:** Wrapped the existing SELECT in a `COALESCE(...)` that falls back to `jsonb_build_object('error', 'user_not_found')` when the subquery returns NULL (no matching user_merits row). The function remains pure SQL (no conversion to plpgsql needed).

---

_Fixed: 2026-04-16T15:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
