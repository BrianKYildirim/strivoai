---
status: complete
phase: 10-merit-ledger-foundation
source:
  - 10-01-SUMMARY.md
  - 10-02-SUMMARY.md
  - 10-03-SUMMARY.md
  - 10-04-SUMMARY.md
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Migration Applied to Staging
expected: |
  `supabase migration list` shows 20260414000000_merit_ledger_foundation under
  the Remote column on staging (project cimjltzovkahkqecpwgi).
result: pass

### 2. Merit Ledger Tables Exist with RLS
expected: |
  `psql $SUPABASE_DB_URL -c "\dt public.user_merits public.merit_transactions public.merit_shop_purchases"`
  lists all 3 tables. A pg_policies query shows exactly 3 SELECT policies and
  0 non-SELECT (write) policies across the 3 tables.
result: pass

### 3. Backfill + Trigger Invariant
expected: |
  Every row in public.profiles has a matching row in public.user_merits with
  (subscription_balance=5, shop_balance=0, lifetime_granted=5) and a
  corresponding grant row in public.merit_transactions. Counts line up
  1:1:1 (profile_count == user_merits_count == grant_rows_count).
result: pass

### 4. New Signup Auto-Provisions Merits
expected: |
  Creating a new profile (manual signup via the app, or INSERT into
  public.profiles) fires the on_profile_created_provision_merits trigger and
  results in one new user_merits row (5,0,5) and one new signup-grant row in
  merit_transactions — no manual backfill required.
result: pass
evidence: |
  Live observation: profile count grew 7 → 8 between two psql queries;
  signup_grants_only grew 1 → 2; correct_shape (5,0,5) grew 7 → 8.
  Trigger fires on every public.profiles INSERT and maintains the invariant.

### 5. RLS Denies Anon/User Writes (MER-04)
expected: |
  `deno test supabase/functions/_tests/merit_rls_test.ts --no-check --allow-env --allow-net`
  (with staging env sourced) reports `ok | 5 passed | 0 failed`. All INSERT/
  UPDATE/DELETE attempts from anon + user JWT on all 3 tables are rejected
  with Postgres error 42501 (row-level security policy violation).
result: pass
notes: "Initial run failed with PGRST303 JWT expired on all 5 tests (expired TEST_USER_JWT in .env.staging.local). User refreshed the JWT and re-ran; all 5 tests reported ok — RLS denial empirically verified at wire level."

### 6. CHECK Constraints Block Negative Balances (MER-13)
expected: |
  Attempting `UPDATE public.user_merits SET subscription_balance = -1` or
  `SET shop_balance = -1` via service role raises a Postgres check_violation
  error and the row is not mutated.
result: pass

### 7. Legacy Ledger Untouched (MIG-04)
expected: |
  `diff` between .snapshot-legacy-pre.txt and .snapshot-legacy-post.txt
  (excluding the `# Generated` header line) produces empty output / exit 0.
  usage_tracking row count and md5 hash are identical pre vs post migration.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none — initial JWT-expired failure on Test 5 resolved by refreshing TEST_USER_JWT; re-run passed]
