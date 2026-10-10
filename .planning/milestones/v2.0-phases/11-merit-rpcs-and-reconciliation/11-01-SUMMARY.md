---
phase: 11
plan: 01
subsystem: merit-ledger
tags: [pgtap, rls, cost-matrix, test-infra, migration-scaffold]
one_liner: "pgTAP test infrastructure + merit_feature_costs cost table with RLS and 13-row seed"
requires:
  - Phase 10 merit_transactions / user_merits schema (20260414000000_merit_ledger_foundation.sql)
  - supabase CLI + pgTAP local extension
provides:
  - supabase/tests/database/ directory with pgTAP bootstrap + 6 RPC stub files
  - merit_feature_costs table (schema, RLS, 13-row seed) — source of truth for tier gating (D-01, D-02)
  - scripts/run-db-tests.ps1 CI wrapper mirroring run-edge-tests.ps1
affects:
  - downstream: Plans 11-02 (adds check_and_deduct/refund/get_balance RPCs), 11-03 (credit_shop/reset/reconcile RPCs), 11-04 (DO $$ verification block)
  - frontend: future cost-preview UX (UX-02) can read costs via authenticated SELECT policy
tech_stack:
  added:
    - pgTAP (dev-only, never in supabase/migrations/ per D-25)
  patterns:
    - additive migration (no DROP/ALTER/rename)
    - RLS with single SELECT policy, zero writes (service role bypass for seed)
    - BEGIN;...ROLLBACK; wrappers around pgTAP stubs for DB safety
    - ON CONFLICT DO NOTHING seed idempotency
key_files:
  created:
    - supabase/tests/database/00_pgtap_bootstrap.sql
    - supabase/tests/database/check_and_deduct_merits.test.sql
    - supabase/tests/database/refund_merits.test.sql
    - supabase/tests/database/get_merit_balance.test.sql
    - supabase/tests/database/credit_shop_merits.test.sql
    - supabase/tests/database/reset_subscription_merits.test.sql
    - supabase/tests/database/reconciliation.test.sql
    - supabase/migrations/20260415000000_merit_rpcs.sql
    - scripts/run-db-tests.ps1
  modified: []
decisions:
  - "Cost table uses (feature, tier) composite PK; missing row = tier_locked (D-02) rather than an explicit boolean flag"
  - "No active / updated_at columns on merit_feature_costs (D-04) — keep it minimal"
  - "pgTAP bootstrap lives OUTSIDE supabase/migrations/ (D-25) so the pgtap extension never ships to prod"
  - "Seed uses ON CONFLICT DO NOTHING for idempotent re-apply (T-11-06)"
  - "recruiting_lens/free and interview_prep/free rows are intentionally ABSENT to enforce tier_locked via D-02"
metrics:
  tasks_completed: 3
  files_created: 9
  files_modified: 0
  requirements_touched: [MER-05, TEST-01, TEST-02, TEST-03]
---

# Phase 11 Plan 01: Test Infrastructure + Merit Feature Costs Scaffold Summary

## Summary

Ship Wave 0 test infrastructure and the first slice of `supabase/migrations/20260415000000_merit_rpcs.sql`. This plan lands:

1. A new `supabase/tests/database/` directory with a pgTAP bootstrap file and 6 stub test files (one per upcoming RPC plus reconciliation). All stubs pass `plan(1) / pass(...) / finish()` today so Plans 11-02/03 can attach real pgTAP assertions without creating new files.
2. A new migration file with header, section table of contents, and §1 — the `merit_feature_costs` table (composite PK on `(feature, tier)`, CHECK constraints for tier enum and non-negative cost), RLS enabled with a single `FOR SELECT TO authenticated` policy, and a 13-row seed transcribed verbatim from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC. RPC bodies and verification block are explicitly reserved for Plans 11-02, 11-03, 11-04.
3. A thin `scripts/run-db-tests.ps1` wrapper around `supabase db test` for CI parity with `run-edge-tests.ps1`.

Plan executed exactly as written. No deviations.

## Tasks Completed

| # | Task                                                          | Commit  |
| - | ------------------------------------------------------------- | ------- |
| 1 | Create pgTAP test directory + 7 stub files                    | 49fdc7d |
| 2 | Write migration header + merit_feature_costs DDL + RLS + seed | ec3e5f6 |
| 3 | Create scripts/run-db-tests.ps1 CI wrapper                    | f836bd4 |

## Files Created

- `supabase/tests/database/00_pgtap_bootstrap.sql` — loads pgtap extension (dev-only, D-25)
- `supabase/tests/database/check_and_deduct_merits.test.sql` — stub, populated by Plan 02
- `supabase/tests/database/refund_merits.test.sql` — stub, populated by Plan 02
- `supabase/tests/database/get_merit_balance.test.sql` — stub, populated by Plan 02
- `supabase/tests/database/credit_shop_merits.test.sql` — stub, populated by Plan 03
- `supabase/tests/database/reset_subscription_merits.test.sql` — stub, populated by Plan 03
- `supabase/tests/database/reconciliation.test.sql` — stub, populated by Plan 03
- `supabase/migrations/20260415000000_merit_rpcs.sql` — header + §1 merit_feature_costs (RPCs §2..§9 reserved for later plans)
- `scripts/run-db-tests.ps1` — PowerShell wrapper for `supabase db test`

## Verification

All acceptance criteria from the plan confirmed via grep and file existence checks:

- All 7 stub files exist under `supabase/tests/database/`
- Every stub contains `BEGIN;`, `SELECT plan(1);`, `SELECT pass(...)`, `SELECT * FROM finish();`, `ROLLBACK;`
- `00_pgtap_bootstrap.sql` contains `CREATE EXTENSION IF NOT EXISTS pgtap`
- No `CREATE EXTENSION pgtap` anywhere under `supabase/migrations/` (D-25 enforced — only `pg_cron` and `pg_net` are present from earlier migrations)
- `supabase/migrations/20260415000000_merit_rpcs.sql` contains:
  - `CREATE TABLE IF NOT EXISTS public.merit_feature_costs`
  - `CHECK (tier IN ('free','pro','elite'))`
  - `CHECK (cost >= 0)`
  - `ENABLE ROW LEVEL SECURITY`
  - `CREATE POLICY merit_feature_costs_select_all` (single SELECT policy)
  - exactly 1 `INSERT INTO public.merit_feature_costs` statement
  - 3 `('resume_analysis'` rows (free/pro/elite)
  - 3 `('linkedin_grading'` rows
  - 3 `('career_compass'` rows
  - 2 `('recruiting_lens'` rows (pro/elite only — no free, enforcing RCL-01 tier_locked)
  - 2 `('interview_prep'` rows (pro/elite only — no free, enforcing IPC-01 tier_locked)
  - 13 total seed rows
  - No `FOR INSERT / FOR UPDATE / FOR DELETE` policies on merit_feature_costs (T-11-01 mitigation)
  - No `CREATE EXTENSION` statements (D-25)
- `scripts/run-db-tests.ps1` contains `supabase db test`, `$ErrorActionPreference = 'Stop'`, and `LASTEXITCODE` check

The plan's `<automated>` verify commands (`supabase db test --file ...` and `supabase db reset --local`) require a local Supabase stack and were NOT executed in this worktree — they are CI / developer-local verification gates. Static file content checks all pass, and the `supabase db reset --local` gate will be exercised by Plan 11-04's DO $$ verification block.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Mitigations Applied

- **T-11-01 (Tampering of cost rows):** `ENABLE ROW LEVEL SECURITY` + single `FOR SELECT` policy; no write policies. Service role bypass is the only write path (seed INSERT).
- **T-11-03 (pgTAP leakage to prod):** pgtap bootstrap kept under `supabase/tests/database/` per D-25. Grep confirms no `CREATE EXTENSION pgtap` anywhere under `supabase/migrations/`.
- **T-11-05 (Seed drift from REQUIREMENTS.md):** 13 rows transcribed verbatim with inline requirement ID comments (RES-01, LIG-03 + LIG-05, etc.). Plan 11-04 adds a DO $$ block asserting `COUNT(*) >= 13`.
- **T-11-06 (Seed re-apply conflict):** `ON CONFLICT (feature, tier) DO NOTHING` makes the seed idempotent.

## Known Stubs

Six test files are intentional placeholders that pass `plan(1) / pass('...')` without real assertions. They exist so Plans 11-02 and 11-03 can attach implementations without creating new files, and they do NOT prevent Plan 11-01's goal (foundation scaffolding) from being achieved. The plan explicitly calls these out in the Task 1 `<action>` block:

| File                                | Populated By |
| ----------------------------------- | ------------ |
| check_and_deduct_merits.test.sql    | Plan 11-02   |
| refund_merits.test.sql              | Plan 11-02   |
| get_merit_balance.test.sql          | Plan 11-02   |
| credit_shop_merits.test.sql         | Plan 11-03   |
| reset_subscription_merits.test.sql  | Plan 11-03   |
| reconciliation.test.sql             | Plan 11-03   |

Similarly, §2..§9 of `supabase/migrations/20260415000000_merit_rpcs.sql` are marked as reserved for downstream plans — this is intentional and documented in the migration header.

## Threat Flags

None — no new trust boundaries or attack surface introduced beyond what the plan's threat model already covered.

## Self-Check: PASSED

File existence verified:

- FOUND: supabase/tests/database/00_pgtap_bootstrap.sql
- FOUND: supabase/tests/database/check_and_deduct_merits.test.sql
- FOUND: supabase/tests/database/refund_merits.test.sql
- FOUND: supabase/tests/database/get_merit_balance.test.sql
- FOUND: supabase/tests/database/credit_shop_merits.test.sql
- FOUND: supabase/tests/database/reset_subscription_merits.test.sql
- FOUND: supabase/tests/database/reconciliation.test.sql
- FOUND: supabase/migrations/20260415000000_merit_rpcs.sql
- FOUND: scripts/run-db-tests.ps1

Commits verified in worktree `by/env-fixes` branch:

- FOUND: 49fdc7d test(11-01): add pgTAP bootstrap and 6 RPC stub files
- FOUND: ec3e5f6 feat(11-01): add merit_feature_costs table with RLS and 13-row seed
- FOUND: f836bd4 chore(11-01): add run-db-tests.ps1 pgTAP CI wrapper
