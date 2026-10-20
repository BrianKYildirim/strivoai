---
phase: 11-merit-rpcs-and-reconciliation
reviewed: 2026-04-16T14:30:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - scripts/run-db-tests.ps1
  - supabase/migrations/20260415000000_merit_rpcs.sql
  - supabase/tests/database/00_pgtap_bootstrap.sql
  - supabase/tests/database/check_and_deduct_merits.test.sql
  - supabase/tests/database/credit_shop_merits.test.sql
  - supabase/tests/database/get_merit_balance.test.sql
  - supabase/tests/database/reconciliation.test.sql
  - supabase/tests/database/refund_merits.test.sql
  - supabase/tests/database/reset_subscription_merits.test.sql
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-16T14:30:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 11 introduces six SECURITY DEFINER RPCs for the merit ledger system (`check_and_deduct_merits`, `refund_merits`, `get_merit_balance`, `credit_shop_merits`, `reset_subscription_merits`, `reconcile_merit_balance`), a `merit_feature_costs` lookup table with 13 seed rows, a partial expression index, and a deployment verification block. Test coverage is comprehensive with pgTAP suites covering subscription-first deduction, split buckets, idempotent refunds, shop credits, subscription resets, and a randomized-sequence reconciliation invariant test.

The SQL is well-structured, follows existing conventions (SECURITY DEFINER + SET search_path, REVOKE/GRANT patterns, RLS), and the verification block provides deploy-time safety. One critical bug exists in `credit_shop_merits` where an unrecognized pack size silently inserts NULL into `price_cents`, bypassing the application-level CASE and relying solely on a CHECK constraint on a different table to catch it. Three warnings address missing NULL handling and a potential authorization gap.

## Critical Issues

### CR-01: credit_shop_merits CASE expression produces NULL for unrecognized pack_size, relying on downstream CHECK for safety

**File:** `supabase/migrations/20260415000000_merit_rpcs.sql:308-309`
**Issue:** The `credit_shop_merits` RPC uses a CASE expression to map `p_pack_size` to `price_cents`. If `p_pack_size` is not one of (3, 10, 25, 50), the CASE has no ELSE clause and produces NULL. The INSERT then attempts to write NULL into `merit_shop_purchases.price_cents`, which has a `CHECK (price_cents > 0)` constraint (from Phase 10 foundation). While the CHECK constraint does prevent the bad row from persisting, the error message is a cryptic PostgreSQL constraint violation (SQLSTATE 23514) rather than a clear application-level error. More importantly, the function credits `shop_balance` and writes a ledger row AFTER the purchase insert (lines 313-327), so in this specific case the CHECK stops it. However, the function lacks explicit validation of `p_pack_size` at the top, meaning the function body depends entirely on the DDL constraint for correctness. If the table constraint were ever relaxed or if the column were changed to allow NULLs, this would silently corrupt data.

The test at `credit_shop_merits.test.sql:146-151` confirms the CHECK catches it, but the defense should be in the RPC itself.

**Fix:**
Add an explicit guard at the top of `credit_shop_merits`, before any lock is taken:
```sql
-- Add after line 283 (BEGIN), before the FOR UPDATE lock:
IF p_pack_size NOT IN (3, 10, 25, 50) THEN
  RETURN jsonb_build_object('error', 'invalid_pack_size');
END IF;
```

## Warnings

### WR-01: check_and_deduct_merits does not handle missing user_merits row

**File:** `supabase/migrations/20260415000000_merit_rpcs.sql:94-98`
**Issue:** If `p_user_id` has no row in `user_merits` (e.g., a race condition where the profile was created but the auto-provision trigger has not yet committed, or a manually crafted UUID), the `SELECT ... INTO v_sub_balance, v_shop_balance ... FOR UPDATE` returns NULL for both variables. The subsequent arithmetic `(v_sub_balance + v_shop_balance) < v_cost` evaluates to NULL (not true), so the insufficient-merits guard is bypassed. The function then proceeds to the UPDATE on line 130 which updates zero rows (silently), but the INSERT on lines 114-127 still writes transaction rows for a user with no `user_merits` row. The response reports `success: true` with `remaining_balance` computed from NULL values (returning NULL).

This could leave orphaned `merit_transactions` rows and return a misleading success response.

**Fix:**
Add a NULL check after the SELECT ... FOR UPDATE:
```sql
IF v_sub_balance IS NULL THEN
  RETURN jsonb_build_object('error', 'user_not_found');
END IF;
```

### WR-02: refund_merits does not verify user_merits row exists before proceeding

**File:** `supabase/migrations/20260415000000_merit_rpcs.sql:172`
**Issue:** `PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE` silently does nothing if the user does not exist. The function then proceeds to check for existing refund rows (which also returns nothing) and loops over original deduction rows (which also returns nothing). It falls through to the `(v_sub_restore + v_shop_restore) = 0` check on line 212 and returns `unknown_transaction`. While the end result is not catastrophic (no data corruption), the error message is misleading -- the real problem is the user does not exist, not that the transaction is unknown.

**Fix:**
After the `PERFORM` on line 172, add:
```sql
IF NOT FOUND THEN
  RETURN jsonb_build_object('error', 'user_not_found');
END IF;
```

### WR-03: get_merit_balance returns NULL (empty result set) for non-existent user_id

**File:** `supabase/migrations/20260415000000_merit_rpcs.sql:246-253`
**Issue:** `get_merit_balance` is a pure SQL function that returns NULL when `p_user_id` has no `user_merits` row. The caller (edge function or frontend) would receive `null` from Supabase RPC with no indication whether the user does not exist or there was another issue. This is a usability issue that could cause confusing frontend behavior (e.g., displaying "0 merits" vs "user not found").

**Fix:**
Convert to plpgsql to handle the missing-row case, or document the NULL-return contract in a comment and handle it in the calling edge function. The simplest SQL-only approach:
```sql
SELECT COALESCE(
  (SELECT jsonb_build_object(
    'subscription_balance', um.subscription_balance,
    'shop_balance',         um.shop_balance,
    'total',                um.subscription_balance + um.shop_balance,
    'next_reset_date',      um.subscription_reset_date
  )
  FROM public.user_merits um
  WHERE um.user_id = p_user_id),
  jsonb_build_object('error', 'user_not_found')
);
```

## Info

### IN-01: Section ordering in migration file is non-sequential

**File:** `supabase/migrations/20260415000000_merit_rpcs.sql:259`
**Issue:** The index creation (labeled section 8) appears between sections 4 and 5. The table of contents in the header lists sections in order (1-9), but the actual code has them as: 1, 2, 3, 4, 8, 5, 6, 7, 9. While this does not affect correctness (the index must exist before `refund_merits` is used, and all CREATE IF NOT EXISTS / CREATE OR REPLACE are order-independent at migration time), it makes the file harder to navigate.

**Fix:** Consider reordering the index creation to after section 7 (where section 8 logically belongs per the header), or update the header comment to reflect the actual order.

### IN-02: Test file check_and_deduct_merits.test.sql fixture user 27 is not fully set up

**File:** `supabase/tests/database/check_and_deduct_merits.test.sql:90`
**Issue:** User `...000027` is created in `auth.users` and `profiles` (lines 66, 75) and is used in test 17 (the CHECK constraint test on line 254), but there is no explicit `UPDATE public.user_merits SET ...` for this user (unlike users 21-26 which all get explicit balance overrides on lines 78-89). The test relies on the auto-provision trigger giving `...000027` the default `subscription_balance=5, shop_balance=0`. This is fragile -- if the trigger default ever changes, the test still works because the CHECK constraint test only sets `subscription_balance = -1`, but the intent would be clearer with an explicit fixture.

**Fix:** Add an explicit UPDATE for user 27 after line 89 for documentation clarity:
```sql
-- User 27 uses trigger defaults (sub=5, shop=0); only used for CHECK constraint test.
```

---

_Reviewed: 2026-04-16T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
