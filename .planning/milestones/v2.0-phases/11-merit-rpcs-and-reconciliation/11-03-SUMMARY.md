---
phase: 11
plan: 03
subsystem: merit-rpcs-and-reconciliation
tags: [merits, shop, stripe, reconciliation, pgtap, wave-3]
dependency-graph:
  requires:
    - 11-01 (migration scaffolding, §5/§6/§7 slots, test stubs)
    - 11-02 (§2/§3/§4 RPCs + partial expression index in same migration file)
    - Phase 10 (merit_shop_purchases UNIQUE stripe_payment_intent_id, user_merits columns, auto_provision trigger)
  provides:
    - credit_shop_merits RPC (MER-09, SHOP-10)
    - reset_subscription_merits RPC (MER-08)
    - reconcile_merit_balance RPC (MER-12)
    - TEST-02 (reset_subscription_merits pgTAP coverage)
    - TEST-03 (credit_shop_merits pgTAP coverage)
    - SC #5 reconciliation randomized-sequence test
  affects:
    - Phase 12 Stripe webhook handler (will consume credit_shop_merits)
    - Phase 12 subscription-reset cron / webhook (will consume reset_subscription_merits)
    - Ops / admin tooling (will consume reconcile_merit_balance)
tech-stack:
  added: []
  patterns:
    - Pitfall 6 lock ordering: FOR UPDATE user row FIRST, then idempotency pre-lookup
    - Pure aggregate drift calculator (language sql, no lock — read-path only)
    - pgTAP throws_ok for SQLSTATE CHECK violations (23514)
key-files:
  created: []
  modified:
    - supabase/migrations/20260415000000_merit_rpcs.sql (appended §5/§6/§7, +179 lines)
    - supabase/tests/database/credit_shop_merits.test.sql (stub → plan(14), +160 lines net)
    - supabase/tests/database/reset_subscription_merits.test.sql (stub → plan(15), +166 lines net)
    - supabase/tests/database/reconciliation.test.sql (stub → plan(11), +148 lines net)
decisions:
  - Kept function signatures on a single line (matching §2 check_and_deduct_merits style from 11-02) so the plan's single-line `grep -q "CREATE OR REPLACE FUNCTION ..."` acceptance criteria match verbatim
  - Used DO block + DISTINCT lookup to retrieve deduction_id inside the reconciliation test (matches the pattern established by 11-02's refund_merits.test.sql)
  - Seeded fixture balances via UPDATE (not by bypassing the auto_provision trigger) to stay consistent with Phase 10's "trigger-first" posture
metrics:
  duration: ~25 min
  tasks: 3
  files-modified: 4
  commits: 3
  completed: 2026-04-14
---

# Phase 11 Plan 03: Shop Credit, Subscription Reset, Reconciliation Summary

Appended the three write-and-audit RPCs (`credit_shop_merits`, `reset_subscription_merits`, `reconcile_merit_balance`) to the Phase 11 migration file and populated the three pgTAP test files (TEST-02, TEST-03, SC #5) with full coverage of the subscription-reset and Stripe-shop-credit paths plus a randomized sequence proving MER-12's drift=0 invariant holds across every RPC combination.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Append §5/§6/§7 RPCs to migration | `6d70883` | supabase/migrations/20260415000000_merit_rpcs.sql |
| 2 | Populate credit_shop_merits + reset_subscription_merits pgTAP (TEST-02/03) | `f3b7860` | supabase/tests/database/credit_shop_merits.test.sql, reset_subscription_merits.test.sql |
| 3 | Populate reconciliation randomized-sequence pgTAP (SC #5) | `65f61ca` | supabase/tests/database/reconciliation.test.sql |

## Key Changes

### §5 `credit_shop_merits(p_user_id, p_pack_size, p_stripe_payment_id)`
- Lock user_merits row FIRST (Pitfall 6), then idempotency pre-lookup on `merit_shop_purchases.stripe_payment_intent_id`
- On duplicate: returns `{success:true, shop_balance, duplicate:true}` with zero side effects
- On first-seen payment: inserts purchase row (price via `CASE pack_size`), increments `shop_balance`, writes `source='shop-credit'` ledger row with `stripe_payment_id` in metadata
- `SECURITY DEFINER SET search_path = public, pg_temp`; REVOKE public + GRANT authenticated, service_role

### §6 `reset_subscription_merits(p_user_id, p_tier, p_next_reset_date)`
- Lock user_merits row via `FOR UPDATE` on SELECT of `subscription_balance`
- Free tier → early return with `skipped='free_tier_noop'` (D-14 / Phase 10 D-01)
- Pro → 75, Elite → 150, other → `{error:'invalid_tier'}`
- UPDATE statement explicitly lists ONLY `subscription_balance`, `free_linkedin_scan_used`, `subscription_reset_date`, `updated_at` — `shop_balance` is never named on the SET clause, preventing accidental reset (D-15 / T-11-22)
- Writes `balance_type='grant'`, `source='subscription-reset'` ledger row with `amount = (target - old_balance)` so reconciliation invariant holds (D-16)

### §7 `reconcile_merit_balance(p_user_id)`
- Pure `LANGUAGE sql` aggregate — no lock, no mutation
- Returns `(user_id, balance_sum, transactions_sum, drift)` where `drift = (subscription_balance + shop_balance) - SUM(merit_transactions.amount)`
- Invariant: `drift = 0` at all times. Any RPC that forgets to write its ledger row breaks this invariant and is caught by the Task 3 pgTAP sequence

### pgTAP coverage
- **credit_shop_merits.test.sql** (plan(14)): all four pack sizes (3/10/25/50), duplicate idempotency (SC #3) verified for `{success, duplicate, shop_balance, purchase row count, ledger row count}`, `subscription_balance` untouched, invalid pack_size raises 23514 via `throws_ok`
- **reset_subscription_merits.test.sql** (plan(15)): pro=75 and elite=150 with `shop_balance=99` UNTOUCHED across all three tier paths (D-15 proof), free tier returns `free_tier_noop` with zero mutations, grant delta math (75-12=63, 150-12=138) verified, yearly cadence test runs three sequential pro resets all landing on 75 with three distinct grant ledger rows
- **reconciliation.test.sql** (plan(11)): 11-step mixed sequence (baseline → credit 3 → deduct resume_analysis/free → refund → deduct career_compass/pro → reset pro → deduct resume_analysis/pro → credit 10 → deduct recruiting_lens/pro → reset elite → tier_locked no-op), drift=0 asserted after every step

## Verification

### Structural (grep / count) — all PASS

- `grep -c "CREATE OR REPLACE FUNCTION public"` → 6 (three from 11-02 plus three from this plan)
- `grep -c "SET search_path = public, pg_temp"` → 6
- `grep -c "REVOKE ALL ON FUNCTION"` → 6
- `grep -q "CREATE OR REPLACE FUNCTION public.credit_shop_merits(p_user_id uuid, p_pack_size integer, p_stripe_payment_id text)"` → OK
- `grep -q "CREATE OR REPLACE FUNCTION public.reset_subscription_merits(p_user_id uuid, p_tier text, p_next_reset_date timestamptz)"` → OK
- `grep -q "CREATE OR REPLACE FUNCTION public.reconcile_merit_balance(p_user_id uuid)"` → OK
- `grep -q "'shop-credit'"`, `"'subscription-reset'"`, `"free_tier_noop"`, `"WHEN 'pro'   THEN 75"`, `"WHEN 'elite' THEN 150"` → all OK
- `credit_shop_merits.test.sql`: `plan(`, `'duplicate'`, `throws_ok`, `'23514'` → all OK
- `reset_subscription_merits.test.sql`: `plan(`, `free_tier_noop`, `shop_balance = 99`, `subscription_balance = 75`, `subscription_balance = 150`, `free_linkedin_scan_used = false` → all OK
- `reconciliation.test.sql`: `plan(`, `credit_shop_merits`, `check_and_deduct_merits`, `refund_merits`, `reset_subscription_merits`, `tier_locked no-op`, `BEGIN;`, `ROLLBACK;` → all OK
- `reconciliation.test.sql`: `drift FROM public.reconcile_merit_balance` count = **11** (meets ≥11)
- `reset_subscription_merits` body inspection: `UPDATE public.user_merits` SET clause does NOT contain `shop_balance = ...` (only `credit_shop_merits`'s `shop_balance = shop_balance + p_pack_size` exists in the file, and that's the correct increment path)

### Runtime gates (deferred — same constraint as Plan 11-02)

- `supabase db reset --local` requires a local Supabase stack; Docker Desktop is not available inside this worktree (same condition documented in `11-02-SUMMARY.md`)
- `supabase db test --file supabase/tests/database/{credit_shop_merits,reset_subscription_merits,reconciliation}.test.sql` is exercised by the repo's `scripts/run-db-tests.ps1` / CI pgTAP runner
- Plan 11-04's `DO $$` verification block will fail migration deploy if any of the six RPC definitions regress before deploy time

## Success Criteria Alignment

- **SC #3** (shop credit idempotency): proved via credit_shop_merits.test.sql assertions 5-8 (duplicate returns `duplicate=true`, balance unchanged, single purchase row, single ledger row)
- **SC #4** (pro=75, elite=150, shop_balance untouched): proved via reset_subscription_merits.test.sql assertions 2-3, 7-8, 12
- **SC #5** (reconciliation drift=0 under mixed sequence): proved via reconciliation.test.sql 11 assertions across every RPC combination

## Requirements Mapped

- **MER-08**: `reset_subscription_merits` RPC exists with pro/elite balance targets — DONE
- **MER-09**: `credit_shop_merits` RPC exists with Stripe idempotency contract — DONE
- **MER-12**: `reconcile_merit_balance` returns drift=0 invariant proved under randomized sequence — DONE
- **SHOP-10**: subscription-first deduction is already enforced in §2 (11-02); §5 credits `shop_balance` only — DONE
- **TEST-02**: `reset_subscription_merits.test.sql` populated with 15-assertion coverage — DONE
- **TEST-03**: `credit_shop_merits.test.sql` populated with 14-assertion coverage including all four pack sizes + idempotency + CHECK violation — DONE

## Deviations from Plan

None. Plan executed as written.

The plan's acceptance criteria used single-line `grep -q "CREATE OR REPLACE FUNCTION public.X(sig)"` patterns, and the existing §2 RPC in the migration was also written on one line — so function signatures were kept on single lines to match both the existing file style and the plan's structural acceptance criteria verbatim. This was a stylistic inference, not a deviation from the plan's code content.

## Known Stubs

None. All three test files were stubs before this plan and are now fully populated.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes beyond those explicitly covered in the plan's `<threat_model>`. The three new RPCs inherit the Phase 11 search_path + REVOKE/GRANT posture and rely on caller-side `auth.uid()` enforcement documented in T-11-24 / T-11-25 (deferred to Phase 12 / Phase 13 caller code review).

## Self-Check: PASSED

- `supabase/migrations/20260415000000_merit_rpcs.sql` modified — FOUND
- `supabase/tests/database/credit_shop_merits.test.sql` populated — FOUND
- `supabase/tests/database/reset_subscription_merits.test.sql` populated — FOUND
- `supabase/tests/database/reconciliation.test.sql` populated — FOUND
- Commit `6d70883` (Task 1) — FOUND in worktree branch
- Commit `f3b7860` (Task 2) — FOUND in worktree branch
- Commit `65f61ca` (Task 3) — FOUND in worktree branch
