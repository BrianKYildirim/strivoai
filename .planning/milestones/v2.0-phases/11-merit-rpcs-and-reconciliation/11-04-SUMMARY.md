---
phase: 11
plan: 04
status: partial-complete
completed: 2026-04-14
tasks_complete: 2
tasks_pending: 2
---

# Plan 11-04 Summary

## What was built

- **Task 1 (done):** Appended §9 `DO $$` verification block to `supabase/migrations/20260415000000_merit_rpcs.sql`. Asserts exactly 6 SECURITY DEFINER RPCs with `search_path=public,pg_temp` hardening, 13 `merit_feature_costs` rows, and 1 `idx_merit_transactions_deduction_id` partial index. `RAISE EXCEPTION` on any mismatch rolls back the whole migration.
- **Task 4 (done):** Updated `.planning/phases/11-merit-rpcs-and-reconciliation/11-VALIDATION.md` Per-Task Verification Map with all 12 real task rows (11-01-01 through 11-04-03), flipped `nyquist_compliant: true` and `wave_0_complete: true`, and added sign-off note.

## Pending (user action required)

- **Task 2 (BLOCKING, manual):** `supabase db push` against staging. User does not have local Docker / Supabase CLI-to-Docker link set up — staging is linked in VSCode only. Run this from the VSCode Supabase-linked terminal. If `SUPABASE_ACCESS_TOKEN` is required for non-interactive auth, export it first.
- **Task 3 (deferred):** `supabase db test` full pgTAP suite. Cannot run locally without Docker. Deferred to CI or a future local-stack run. The §9 `DO $$` block runs at push time as the substitute deploy-time gate.

## Commits

- `443e3f1` feat(11-04): append §9 DO $$ verification block to merit RPCs migration

## Key files created/modified

- supabase/migrations/20260415000000_merit_rpcs.sql (+71 lines — §9 block)
- .planning/phases/11-merit-rpcs-and-reconciliation/11-VALIDATION.md (not committed per CLAUDE.md rule)

## Requirements touched

MER-05, MER-06, MER-07, MER-08, MER-09, MER-12, SHOP-10, TEST-01, TEST-02, TEST-03

## Deviations

- Task 3 (local pgTAP suite) deferred instead of executed — no local Docker. The migration's §9 verification block is the substitute gate at push time. Full pgTAP suite must run in CI or a future local setup.
- User must run Task 2 (`supabase db push`) manually from the VSCode terminal.

## Next steps for user

1. From VSCode terminal with staging Supabase linked, run:
   ```bash
   supabase db push
   ```
2. Watch for the notice: `Phase 11 verification passed: 6 RPCs (hardened), 13 cost rows, 1 deduction index`
3. If the push fails due to drift or auth: capture stderr, revert if needed (`supabase migration repair` or drop the migration file), investigate.
4. Once staging is green, run the phase verifier (`/gsd-verify-work 11`) in a fresh session — current session is near context limit.
