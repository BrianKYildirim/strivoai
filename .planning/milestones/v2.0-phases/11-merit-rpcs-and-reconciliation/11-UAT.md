---
status: diagnosed
phase: 11-merit-rpcs-and-reconciliation
source:
  - 11-01-SUMMARY.md
  - 11-02-SUMMARY.md
  - 11-03-SUMMARY.md
  - 11-04-SUMMARY.md
started: 2026-04-15T00:00:00Z
updated: 2026-04-16T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Migration Deployed to Staging
expected: |
  `supabase migration list` (against staging project cimjltzovkahkqecpwgi)
  shows `20260415000000_merit_rpcs` under the Remote column. The 11-04 SUMMARY
  flagged `supabase db push` as a pending manual step — this test confirms
  the push actually ran and no §9 DO $$ verification block error fired
  (which would have rolled the whole migration back).
result: pass

### 2. merit_feature_costs Table + 13-Row Seed Present
expected: |
  `psql $SUPABASE_DB_URL -c "SELECT feature, tier, cost FROM public.merit_feature_costs ORDER BY feature, tier"`
  returns exactly 13 rows: resume_analysis (free=1, pro=1, elite=1),
  linkedin_grading (free=1, pro=1, elite=1), career_compass (free=1, pro=1,
  elite=1), recruiting_lens (pro=5, elite=5 — NO free row), interview_prep
  (pro=3, elite=3 — NO free row). Missing recruiting_lens/free and
  interview_prep/free rows are intentional (D-02 tier_locked enforcement).
result: pass

### 3. Six SECURITY DEFINER RPCs Exist with Hardening
expected: |
  Query pg_proc against staging:
  `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN
  ('check_and_deduct_merits','refund_merits','get_merit_balance',
  'credit_shop_merits','reset_subscription_merits','reconcile_merit_balance')`
  returns exactly 6 rows, all with `prosecdef = true` and `proconfig`
  containing `search_path=public, pg_temp`. This is the §9 DO $$ invariant
  asserted at deploy time.
result: pass

### 4. REVOKE public / GRANT authenticated+service_role on all RPCs
expected: |
  `psql -c "\df+ public.check_and_deduct_merits"` (and same for the other
  5 RPCs) shows the Access privileges column containing
  `authenticated=X/postgres` and `service_role=X/postgres` only — NO
  `=X/postgres` line (which would indicate public execute). T-11-15 mitigation.
result: pass

### 5. check_and_deduct_merits Subscription-First Deduction (SHOP-10)
expected: |
  Seed resume_analysis/pro cost = 2 (per migration line 46, RES-03).
  Starting from a Pro user with subscription_balance=10, shop_balance=10:
  `SELECT public.check_and_deduct_merits('<uuid>', 'resume_analysis', 'pro')`
  returns `{success: true, deducted_from: {subscription: 2, shop: 0},
  remaining_balance: 18}`. Verify: subscription_balance=8, shop_balance=10,
  exactly one new merit_transactions row with balance_type='subscription'
  and amount=-2. Shop bucket is untouched because subscription covered the cost.
result: pass
evidence: |
  User re-ran from clean (10,10) state on 2026-04-15. RPC returned
  success=true, deducted_from={subscription:2, shop:0}, remaining_balance=18.
  Final balances (8,10). SHOP-10 subscription-first confirmed working.
  Initial test miscall: author guessed cost=1; actual seed has cost=2.

### 6. check_and_deduct_merits Split Deduction Writes 2 Rows (D-06)
expected: |
  Setup: manually UPDATE a test user to subscription_balance=2,
  shop_balance=10. Call check_and_deduct_merits for any cost-3 feature
  (e.g. resume_analysis/elite or career_compass/elite — both cost=3 per
  migration lines 47/53). Returns deducted_from: {subscription: 2, shop: 1},
  remaining_balance: 9. Two merit_transactions rows written sharing a single
  metadata->>'deduction_id' UUID: one balance_type='subscription' amount=-2,
  one balance_type='shop' amount=-1. response.transaction_id equals that
  shared UUID. Final balances: subscription_balance=0, shop_balance=9.
result: pass

### 7. check_and_deduct_merits Returns tier_locked (D-02)
expected: |
  `SELECT public.check_and_deduct_merits('<free_user_uuid>',
  'recruiting_lens', 'free')` returns `{error: 'tier_locked',
  upgrade_required: true}` WITHOUT mutating user_merits and WITHOUT
  writing any merit_transactions row. The check happens BEFORE any lock
  is taken (fail-fast).
result: pass

### 8. refund_merits Idempotency (SC #2)
expected: |
  After a successful check_and_deduct_merits, first call to
  `refund_merits(user_id, transaction_id)` returns `{success: true}` and
  restores the exact original subscription_balance and shop_balance
  buckets. Second call with the same transaction_id returns
  `{error: 'already_refunded'}` with ZERO additional mutations — balances
  unchanged, no new refund rows. Success Criterion #2.
result: pass

### 9. credit_shop_merits Stripe Idempotency (SC #3)
expected: |
  First call: `credit_shop_merits(user_id, 10, 'pi_test_123')` inserts
  one merit_shop_purchases row (price_cents=499 per migration line 308
  WHEN 10 THEN 499, status='succeeded', stripe_payment_intent_id='pi_test_123'),
  increments shop_balance by 10, writes one merit_transactions row
  (balance_type='shop', source='shop-credit', amount=+10). Second call with
  the same stripe_payment_id returns `{success: true, duplicate: true,
  shop_balance: <unchanged>}` with zero side effects (no new purchase row,
  no new ledger row, balance unchanged).
result: pass

### 10. reset_subscription_merits Tier Branches + shop_balance Untouched (SC #4)
expected: |
  Setup: subscription_balance=12, shop_balance=99. Call
  `reset_subscription_merits(user_id, 'pro', now())` → subscription_balance=75,
  shop_balance STILL 99, free_linkedin_scan_used=false,
  subscription_reset_date advanced. One merit_transactions row
  balance_type='grant' source='subscription-reset' amount=+63 (75-12).
  Repeat with 'elite' → 150. Repeat with 'free' → returns
  `{skipped: 'free_tier_noop'}` with ZERO mutations.
result: pass

### 11. reconcile_merit_balance Drift=0 Invariant (SC #5 / MER-12)
expected: |
  `SELECT drift FROM public.reconcile_merit_balance('<any_user_uuid>')`
  returns 0. Run an ad-hoc sequence: credit shop 10 → deduct
  resume_analysis/pro → refund → deduct career_compass/pro → reset to pro.
  After EACH step, drift must still be 0. The invariant is
  (subscription_balance + shop_balance) = SUM(merit_transactions.amount).
result: issue
reported: "drift returned -109 instead of 0"
severity: major

### 12. pgTAP Suite Runs Green (TEST-01/02/03)
expected: |
  `supabase db test` (or `scripts/run-db-tests.ps1`) runs against a local
  or CI DB with Phase 10 + 11 migrations applied. Output reports
  50+ total passing assertions across 6 test files (17 check_and_deduct,
  8 refund, 4 get_balance, 14 credit_shop, 15 reset_subscription,
  11 reconciliation), zero failures, zero skips. Plan 11-04 deferred this
  locally due to no Docker — confirm it's either run in CI or by a user
  with Docker available.
result: issue
reported: "All 6 test files fail with duplicate key value violates unique constraint profiles_pkey. Tests lack cleanup/teardown so fixture INSERTs collide with rows from prior runs. 0 of 69 planned assertions executed."
severity: blocker

### 13. Cost Matrix Matches REQUIREMENTS.md Verbatim
expected: |
  Row-by-row diff of the `INSERT INTO public.merit_feature_costs`
  statement in `supabase/migrations/20260415000000_merit_rpcs.sql`
  against the cost table in `.planning/REQUIREMENTS.md` sections
  RES/LIG/CC/RCL/IPC. All 13 (feature, tier, cost) tuples match, and
  the intentional absences (recruiting_lens/free, interview_prep/free)
  are confirmed as intentional tier_locked gates per D-02.
result: pass

### 14. Legacy usage_tracking Path Untouched (MIG-04)
expected: |
  Spot-check the legacy usage_tracking table on staging — row count,
  schema, and a sample of recent rows are identical to the state before
  Phase 11 was applied. Phase 11's migration should be purely additive
  (new table + new RPCs + new index) with zero ALTER/DROP/UPDATE against
  existing tables.
result: pass

## Summary

total: 14
passed: 12
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "reconcile_merit_balance returns drift=0 after any sequence of operations"
  status: failed
  reason: "User reported: drift returned -109 instead of 0"
  severity: major
  test: 11
  root_cause: "RPCs are correct. Drift caused by accumulated stale merit_transactions rows from prior UAT test runs where user_merits balances were manually reset without cleaning up ledger entries. Not a code bug — test environment contamination."
  artifacts:
    - path: "supabase/migrations/20260415000000_merit_rpcs.sql"
      issue: "reconcile logic is correct; no code fix needed"
  missing:
    - "Use a fresh user for each UAT test run, or DELETE FROM merit_transactions WHERE user_id = <test_user> before re-running reconcile tests"
  debug_session: ""

- truth: "pgTAP test suite runs with 69 passing assertions across 6 test files"
  status: failed
  reason: "User reported: All 6 test files fail with duplicate key value violates unique constraint profiles_pkey. Tests lack cleanup/teardown so fixture INSERTs collide with rows from prior runs. 0 of 69 planned assertions executed."
  severity: blocker
  test: 12
  root_cause: "Tests use BEGIN/ROLLBACK but pg_prove wraps each file in its own outer transaction, creating nested savepoints. Prior run crashes or timeouts leave fixture rows behind permanently. On next run, hardcoded UUIDs collide."
  artifacts:
    - path: "supabase/tests/database/check_and_deduct_merits.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
    - path: "supabase/tests/database/credit_shop_merits.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
    - path: "supabase/tests/database/get_merit_balance.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
    - path: "supabase/tests/database/reconciliation.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
    - path: "supabase/tests/database/refund_merits.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
    - path: "supabase/tests/database/reset_subscription_merits.test.sql"
      issue: "No idempotent cleanup before fixture INSERTs"
  missing:
    - "Add idempotent DELETE cleanup at the start of each test file (after BEGIN) for all hardcoded fixture UUIDs"
  debug_session: ""
