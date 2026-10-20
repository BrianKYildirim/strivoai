***

phase: 30
plan: 02
type: schema-push-log
date: 2026-05-19
operator: brianyildirim
project\_ref: cimjltzovkahkqecpwgi
status: APPROVED
----------------

# Phase 30 Plan 02 — Schema Push Log

## Push environment

* Project ref: `cimjltzovkahkqecpwgi` (linked Supabase project)
* Operator: brianyildirim
* Push date: 2026-05-19
* Supabase CLI: v2.75.0 (advisory v2.100.1 available — not blocking)
* Push command: `supabase db push --linked` (after preflight unblock; see "Preflight" below)

## Preflight unblock — migration ledger mismatch

Initial `supabase db push` attempts halted with:

```
Remote migration versions not found in local migrations directory.
```

Root cause: remote `schema_migrations` ledger had entry `20260411`, but the
8-digit-prefix file `20260411_linkedin_grades_drop_unique_identifier.sql` could
not be paired against 14-digit siblings by Supabase CLI's version matcher. This
is the same regression commit `82e0a4c` (Phase 10 recovery) had previously
removed; it was re-introduced by Preview merge `48ecf87` (#334). The byte-equivalent
successor `20260410235959_linkedin_grades_drop_unique_identifier.sql` was already in
place and the underlying `linkedin_grades` composite indexes were live on the remote
from the original Phase 7 push, so the duplicate file was redundant.

Resolution (two parts):

1. Local code commit `aa54068` — `fix(migrations): re-remove 20260411 linkedin duplicate (re-introduced by #334)` — deleted the duplicate file.
2. Remote ledger repair — `supabase migration repair --status reverted 20260411`. Output:
   ```
   Repaired migration history: [20260411] => reverted
   Finished supabase migration repair.
   ```

After both, `supabase db push` accepted the three Phase 30 migrations.

## Pre-backfill reconciliation — 1 legacy drift row

First `supabase db push` after preflight applied migration #1 (`20260517000000_merit_free_signup_grant.sql`) successfully, then **migration #2 (`20260517000001_merit_free_backfill.sql`) rolled back** with:

```
ERROR: Phase 30 backfill drift detected: 1 users with non-zero drift (SQLSTATE P0001)
```

Diagnosis: 1 Free user carried a historical ledger drift of `-109` originating
from a single admin-adjustment row dated `2026-04-17 10:19:48Z` that under-recorded
its delta (logged `amount=+6` with `previous_balance: 0 / new_balance: 6` while
the actual SET operation reduced `subscription_balance` from a non-zero value).
Every subsequent row was honest; the entire -109 sat in that one bad row.

Pre-existing root-cause bug (admin-adjustment function logging the new-balance as the delta) is **out of Phase 30 scope** and will be tracked as separate tech debt. This phase's responsibility is to neutralise the legacy noise so the new drift gate isn't false-positive on it.

Remedy: one-time reconciliation INSERT, authorised by operator at this checkpoint:

```SQL
INSERT INTO public.merit_transactions
  (user_id, amount, balance_type, source, feature, metadata)
VALUES (
  '<redacted-user-id>',   -- see DB; not logged here per threat model T-30-02-03
  -109,
  'grant',
  'phase-30-pre-backfill-reconcile',
  NULL,
  jsonb_build_object(
    'reason',                                  'admin-adjustment ledger under-record, 2026-04-17 10:19:48Z',
    'observed_subscription_balance',           102,
    'observed_shop_balance',                   0,
    'observed_ledger_sum_before_reconcile',    211,
    'drift_before_reconcile',                  -109,
    'underrecorded_row_created_at',            '2026-04-17 10:19:48.860906+00',
    'underrecorded_row_recorded_amount',       6,
    'underrecorded_row_metadata_prev_balance', 0,
    'underrecorded_row_metadata_new_balance',  6,
    'remedy',                                  'one-time pre-backfill reconciliation INSERT',
    'phase',                                   30,
    'plan',                                    '02',
    'authorized_by',                           'operator via gsd-execute-phase 30 checkpoint'
  )
);
```

After this INSERT, the user's `(subscription_balance + shop_balance) - SUM(amount)` collapsed to `0`. Operator then re-ran `supabase db push`.

## Migrations applied

| Filename                                      | Order | Apply outcome                                                                                                                 |
| --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| `20260517000000_merit_free_signup_grant.sql`  | 1     | Applied on first attempt; idempotent across re-push (already-applied — CLI skipped).                                          |
| `20260517000001_merit_free_backfill.sql`      | 2     | Rolled back on first attempt (drift gate fired, 1 user). Re-applied after pre-backfill reconciliation; transaction committed. |
| `20260517000002_merit_free_arm_reset_rpc.sql` | 3     | Applied during re-push, after #2 committed.                                                                                   |

## Verification output

### Migration #2 NOTICE evidence

The literal `RAISE NOTICE 'Phase 30 Free backfill complete; drift verified zero'`
line was not captured verbatim from the terminal scrollback. Indirect proof that
the NOTICE branch fired (not the EXCEPTION branch) is structural: the
`phase-30-free-backfill` ledger INSERT inside the DO block produced 4 rows
in `merit_transactions` (see spot-check b below). The `RAISE EXCEPTION` branch
rolls back the entire transaction including those INSERTs, so the presence of
committed rows is logically equivalent to "drift verified zero" having
been the path taken.

### Post-push spot-checks

```SQL
SELECT
  pg_get_functiondef('public.auto_provision_user_merits'::regproc) LIKE '%10, 0, 10%' AS trigger_updated,
  pg_get_functiondef('public.reset_subscription_merits'::regproc)  LIKE '%WHEN ''free''%' AS free_arm_present,
  (SELECT COUNT(*) FROM public.merit_transactions WHERE source = 'phase-30-free-backfill') AS phase_30_ledger_rows;
```

| trigger\_updated | free\_arm\_present | phase\_30\_ledger\_rows |
| ---------------- | ------------------ | ----------------------- |
| true             | true               | 4                       |

```SQL
SELECT um.user_id,
       (um.subscription_balance + um.shop_balance)
         - COALESCE((SELECT SUM(mt.amount) FROM public.merit_transactions mt
                     WHERE mt.user_id = um.user_id), 0) AS drift
FROM public.user_merits um
JOIN public.profiles p ON p.id = um.user_id
WHERE p.subscription_tier = 'free'
LIMIT 10;
```

4 Free users sampled, **drift = 0 for every row**. (Only 4 Free users exist on this staging project.)

## Decision

**APPROVED to proceed.** All four acceptance criteria from `30-02-PLAN.md` are satisfied:

* [x] Trigger `auto_provision_user_merits` rewritten to grant 10/0/10 (signup\_grant migration #1 applied).
* [x] Backfill ledger rows present (`phase-30-free-backfill` source, 4 rows — one per Free user).
* [x] Free arm present in `reset_subscription_merits` RPC (migration #3 applied).
* [x] Drift = 0 across every sampled Free user (drift gate satisfied after the one-time pre-backfill reconcile).

Pre-existing admin-adjustment ledger under-record (root cause of the -109 drift) is **out of Phase 30 scope**. Logged here for the audit trail; tracked as separate tech debt for a future phase to harden `admin-adjustment` so it records actual deltas rather than the new-balance value.

Wave 3 (Plans 30-03 / 30-04 / 30-05) unblocked.
