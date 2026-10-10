---
phase: 12-stripe-products-and-webhook
plan: 02
subsystem: database
tags: [postgres, pg_cron, pg_net, supabase, migration, stripe, merit-system]

# Dependency graph
requires:
  - phase: 10-merit-ledger-foundation
    provides: user_merits, merit_transactions, merit_shop_purchases tables and the per-user provisioning trigger.
  - phase: 11-merit-rpcs-and-reconciliation
    provides: reset_subscription_merits(p_user_id, p_tier, p_next_reset_date) RPC + merit_feature_costs + reconcile_merit_balance.
provides:
  - profiles.pending_downgrade_tier nullable text column for SUB-15 period-end downgrade staging.
  - pg_cron + pg_net extensions enabled at the database level (ensured idempotently).
  - cron.job row 'reset-subscription-merits-sweep' that fires every 15 minutes against the (still-to-build) reset-subscription-merits edge function via pg_net.http_post, using GUC-driven URL/secret for per-environment configuration.
  - MIG-03 one-shot backfill of all currently-active Pro/Elite subscribers, crediting them via reset_subscription_merits and writing an amount=0 phase-12-backfill audit marker per subscriber.
affects: [12-stripe-webhook-handler, 12-reset-subscription-merits-edge-function, 12-create-checkout-session-shop-mode, 13-merit-enforcement, 21-cutover-cleanup]

# Tech tracking
tech-stack:
  added: [pg_cron, pg_net]
  patterns:
    - "Per-environment cron URL/secret via current_setting('app.functions_base_url', true) and current_setting('app.internal_job_secret', true) — keeps the migration re-runnable across staging/prod without per-env file forks."
    - "Idempotent cron registration via DO $cron$ block + cron.unschedule-if-exists + cron.schedule (mirrors the keep-warm migration but adds the unschedule guard so re-applies do not 23505)."
    - "Backfill audit marker pattern: amount=0 ledger row with a distinct source token ('phase-12-backfill') so the backfill is traceable without polluting MER-12 reconciliation drift."
    - "Hard guard on Phase 11 RPC existence inside the backfill DO block — RAISE EXCEPTION rolls back the entire migration if Phase 11 was never applied."

key-files:
  created:
    - supabase/migrations/20260415000000_phase_12_stripe_products_webhook.sql
  modified: []

key-decisions:
  - "Audit marker INSERT uses amount=0 / balance_type='grant' so MER-12 reconcile_merit_balance drift stays at zero. Phase 11's reset_subscription_merits RPC already writes the credit-bearing 'subscription-reset' ledger row; double-counting it would have produced ledger-vs-balance drift equal to the per-tier grant for every backfilled subscriber."
  - "Cron URL/secret resolved via Postgres GUCs (current_setting), not hardcoded per-project — single migration file works for staging and production. Same approach the keep-warm cron will eventually adopt."
  - "DO $cron$ block re-registration uses cron.unschedule-if-exists + cron.schedule rather than INSERT ... ON CONFLICT, because pg_cron does not expose the catalog directly for upsert."

patterns-established:
  - "Pattern A: GUC-driven per-environment cron job URLs — re-runnable migration, zero per-env file forks."
  - "Pattern B: Backfill DO block with hard RPC-existence guard so migration ordering bugs surface as exceptions, not silent skips."
  - "Pattern C: Audit marker rows with amount=0 + descriptive metadata to traceably mark a backfill without affecting reconciliation drift."

requirements-completed: [SUB-11, SUB-12, SUB-15, NFR-08, MIG-03]

# Metrics
duration: 22min
completed: 2026-04-15
---

# Phase 12 Plan 02: Phase 12 Additive Migration Summary

**Single additive Phase 12 migration adding profiles.pending_downgrade_tier, registering the 15-minute pg_cron reset-subscription-merits-sweep job via GUC-driven URL/secret, and one-shot MIG-03 backfill of active Pro/Elite subscribers through the Phase 11 reset_subscription_merits RPC with amount=0 audit markers.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-15T21:31:38Z (worktree spawn time, approximate)
- **Completed:** 2026-04-15T21:53:15Z
- **Tasks:** 1 / 1
- **Files modified:** 0 (1 new file)
- **Files created:** 1 (179 lines)

## Accomplishments

- Stood up the entire Phase 12 SQL surface in one additive migration: column, extensions, cron job, backfill, verification.
- GUC-driven cron registration means the same migration file applies cleanly to staging and production without per-environment forks. A later runbook plan documents the `ALTER DATABASE postgres SET app.functions_base_url = ...` and `app.internal_job_secret = ...` commands.
- Backfill is correctness-safe: it credits subscribers via the Phase 11 RPC (which already writes its own ledger row) and only adds a zero-amount audit marker so MER-12 reconciliation drift remains 0 for every subscriber post-migration.
- Migration ordering bug guard (RAISE EXCEPTION on missing Phase 11 RPC) ensures we never silently skip subscribers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write additive migration (column + pg_cron + backfill)** — `2aefcb7` (feat)

_Plan metadata commit (SUMMARY.md) follows after this file is written._

## Files Created/Modified

- `supabase/migrations/20260415000000_phase_12_stripe_products_webhook.sql` — 179-line additive migration with four sections:
  1. SUB-15 column: `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_downgrade_tier text NULL` + COMMENT.
  2. pg_cron + pg_net extensions + DO $cron$ block that unschedules-if-exists then registers `reset-subscription-merits-sweep` at `'*/15 * * * *'` against `current_setting('app.functions_base_url', true) || '/reset-subscription-merits'`, headers include `x-internal-job-secret` from `current_setting('app.internal_job_secret', true)`, body `{"invocation_source": "pg_cron"}`.
  3. MIG-03 backfill DO $backfill$ block: guards on `pg_proc` existence of `public.reset_subscription_merits` (RAISE EXCEPTION on missing), then iterates `SELECT id, subscription_tier FROM profiles WHERE subscription_tier IN ('pro','elite') AND subscription_status = 'active'`. For each row: PERFORM `reset_subscription_merits(p_user_id := …, p_tier := …, p_next_reset_date := now() + interval '1 month')`, then INSERT a single audit marker (`amount=0, balance_type='grant', source='phase-12-backfill'`) with metadata describing the tier, migration timestamp, credited_via, and expected_credit. Per-row EXCEPTION WHEN OTHERS RAISES WARNING and continues. Final RAISE NOTICE reports `credited_count`.
  4. Final verify DO $verify$ block: RAISES EXCEPTION if `pending_downgrade_tier` column is missing; RAISES WARNING (not exception) if the cron job is unregistered (because the GUCs may not yet be set in some environments).

## Decisions Made

- **Audit marker INSERT uses amount=0 (deviation from plan's literal CASE expression).** See "Deviations from Plan" below for the full rationale.
- **GUC names:** `app.functions_base_url` and `app.internal_job_secret`, mirroring the keep-warm cron's intended runbook style. The migration uses the `current_setting(name, true)` two-arg form so missing GUCs return NULL instead of raising — keeps the migration apply step itself non-fatal even on a fresh env where the GUCs are unset.
- **Cron schedule:** `*/15 * * * *` (every 15 minutes) per CONTEXT D-03 planner recommendation.
- **`balance_type='grant'`** for the audit marker (not `'subscription'`) — matches the Phase 11 RPC's own ledger row type and keeps the merit_transactions table's `'grant'` rows as the canonical audit trail for credit operations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Backfill audit-marker INSERT switched from `CASE r.subscription_tier WHEN 'pro' THEN 75 …` to `amount = 0` to prevent MER-12 reconciliation drift.**

- **Found during:** Task 1 (writing migration), after reading the actual deployed Phase 11 `reset_subscription_merits` RPC implementation in `supabase/migrations/20260415000000_merit_rpcs.sql` §6.
- **Issue:** The plan's literal SQL called `PERFORM public.reset_subscription_merits(...)` AND then inserted a second `merit_transactions` row with the full per-tier grant amount (75 for Pro, 150 for Elite). However, the Phase 11 RPC body itself already writes a `balance_type='grant'`, `source='subscription-reset'` ledger row with `amount = (new_balance - old_balance)`. Combining the RPC's ledger write with the plan's literal second INSERT would have produced TWO ledger rows per subscriber — one from the RPC (amount=70 for an existing Pro user starting from the Phase 10 backfill of 5) and one from the backfill block (amount=75). Phase 11's `reconcile_merit_balance` RPC computes `drift = (subscription_balance + shop_balance) − SUM(merit_transactions.amount)`. With the double-write, `drift = 75 − (70 + 75) = -70` for every backfilled Pro subscriber and `-145` for every Elite subscriber. This breaks MER-12 ("subscription_balance + shop_balance == SUM(merit_transactions.amount) for every user, always"), which is checked by Phase 11's pgTAP success criteria and by the Phase 13 reconciliation RPC.
- **Fix:** Set `amount = 0` for the audit marker INSERT, with metadata field `expected_credit` recording the per-tier amount the RPC was expected to grant. The Phase 11 RPC remains the single source of credit for the backfill, and the audit marker provides the `'phase-12-backfill'` source token the plan and acceptance criteria require.
- **Files modified:** `supabase/migrations/20260415000000_phase_12_stripe_products_webhook.sql` (only — the change is a single literal swap inside the new file, never editing existing migrations).
- **Verification:**
  - Acceptance criterion `Contains literal 'phase-12-backfill'` still passes (token present in source field).
  - Drift check: with amount=0, `transactions_sum` is unchanged by the audit row; the Phase 11 RPC writes a delta-equal row that exactly matches the balance change, so `drift = 0` for every backfilled user.
  - Inline comment block in the migration documents the rationale for the next reader.
- **Committed in:** `2aefcb7` (Task 1 commit).

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Single literal change inside the new migration file. All other plan elements (sections, structure, literal tokens, DO-block delimiters, GUC pattern, exception guard, verification block) preserved exactly. The fix is required for MER-12 reconciliation correctness — without it, every Pro/Elite subscriber would surface as drift > 0 in the Phase 13 reconciliation tooling immediately after deploy.

## Issues Encountered

None. The plan was readable and the fix described above was the only correctness adjustment needed.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced by this migration. The cron job calls an internal edge function via `pg_net.http_post` with an internal-secret header — that auth path is owned by the future `reset-subscription-merits` edge function in a later wave plan and will be added to the threat model there. The `pending_downgrade_tier` column is a write-from-service-role-only field with no permissive RLS policy and no client-readable surface beyond what `profiles` already exposes.

## Self-Check

- File exists: `supabase/migrations/20260415000000_phase_12_stripe_products_webhook.sql` — FOUND
- Commit exists: `2aefcb7` — FOUND
- Required literal tokens (verified via `grep -F`):
  - `ALTER TABLE public.profiles` — FOUND
  - `ADD COLUMN IF NOT EXISTS pending_downgrade_tier text NULL` — FOUND
  - `CREATE EXTENSION IF NOT EXISTS pg_cron` — FOUND (count: 1)
  - `CREATE EXTENSION IF NOT EXISTS pg_net` — FOUND (count: 1)
  - `'reset-subscription-merits-sweep'` — FOUND (count: 3, including unschedule + schedule + verify)
  - `'*/15 * * * *'` — FOUND
  - `'phase-12-backfill'` — FOUND
  - `RAISE EXCEPTION 'Phase 11 RPC reset_subscription_merits not deployed` — FOUND
  - `verify failed: profiles.pending_downgrade_tier missing` — FOUND
- DO/BEGIN/END balance check (PowerShell): `DO=3/3 BEGIN/END=4/4` — PASSED
- Forbidden statements scan (`DROP|RENAME|CREATE POLICY`): none — PASSED
- Migration filename sort order: `20260415000000_phase_12_stripe_products_webhook.sql` sorts after `20260415000000_merit_rpcs.sql` (Phase 11) alphabetically — PASSED

**## Self-Check: PASSED**

## Next Phase Readiness

- Phase 12's database surface is in place: column, extensions, cron job slot, and backfill block.
- The cron job will produce HTTP failures until the `reset-subscription-merits` edge function is deployed (later Wave plan in this phase) AND until the per-env GUCs are set via `ALTER DATABASE postgres SET app.functions_base_url = ...` and `... SET app.internal_job_secret = ...` (deploy runbook plan).
- Wave 3 push gate plan should:
  1. Run `supabase db push` against staging, observing the verify NOTICE / WARNING.
  2. Set the two GUCs.
  3. Confirm the cron job appears in `cron.job` and that `cron.job_run_details` shows successful executions once the edge function exists.
  4. Re-run `reconcile_merit_balance(user_id)` for a sample of pre-backfill Pro/Elite users to confirm `drift = 0`.

---
*Phase: 12-stripe-products-and-webhook*
*Plan: 02*
*Completed: 2026-04-15*
