-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 30 Plan 01 — Migration #2: Free backfill (D-02, D-03, D-04, D-05)
--
-- One-shot UPDATE + ledger INSERT for existing Free users + drift verification.
-- Brings every existing Free user up to `subscription_balance = 10` via
-- `GREATEST(10, ...)` and writes a per-user `phase-30-free-backfill` ledger
-- row whose `amount = (new_balance - old_balance)`. Users already at 10 land
-- with delta=0 — same audit-marker convention as `phase-12-backfill` at
-- supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql:198.
--
-- `subscription_reset_date` is set to the next occurrence of
-- `profile.created_at`'s day-of-month, with day-of-month overflow clamped to
-- the last day of the target month (D-05 — Feb 28/29 for created-on-29/30/31).
--
-- The final DO-block computes reconciliation drift
-- `(subscription_balance + shop_balance) − SUM(merit_transactions.amount)`
-- per user (mirrors `reconcile_merit_balance` at merit_rpcs.sql:436-462) and
-- RAISE EXCEPTIONs if any Free user has non-zero drift. The RAISE EXCEPTION
-- rolls the whole migration back.
--
-- Pitfall 4 (RESEARCH.md): single-tx UPDATE is acceptable for Free cohort
-- < ~50K rows. If staging row count exceeds that, switch to a batched UPDATE
-- using `WHERE user_id IN (SELECT id ... LIMIT 5000 OFFSET N)`. The signup
-- trigger (Migration #1) already grants 10 for any signup racing the
-- backfill, so racing rows are not double-credited.
--
-- NFR-01: rollback block at the bottom of this file (comments only).
-- ─────────────────────────────────────────────────────────────────────────────

DO $backfill$
DECLARE
  v_drift_count integer;
  v_backfilled  integer;
BEGIN
  -- (a) Snapshot existing balances for Free users so we can compute per-user
  --     deltas after the bulk UPDATE.
  CREATE TEMP TABLE _phase30_snapshot ON COMMIT DROP AS
  SELECT um.user_id, um.subscription_balance AS old_balance
  FROM public.user_merits um
  JOIN public.profiles p ON p.id = um.user_id
  WHERE p.subscription_tier = 'free';

  -- (b) Bulk UPDATE — single transaction (Pitfall 4 trigger documented above).
  --     `GREATEST(10, ...)` is the set-to-10-if-currently-below semantics from
  --     D-02. `lifetime_granted` grows by the same delta. `subscription_reset_date`
  --     is the next anniversary of `profile.created_at` with day-of-month
  --     clamped per D-05.
  --
  --     Anniversary expression notes:
  --       * `make_date(y, m, d)` builds the candidate date for the current
  --         month's anniversary.
  --       * Day is clamped to LEAST(created_day, days-in-target-month) via
  --         the `date_trunc('month', anchor) + interval '1 month - 1 day'`
  --         idiom to find the last day of the target month.
  --       * If today is already past the current month's clamped anniversary
  --         day, the target month is next month; otherwise it's this month.
  UPDATE public.user_merits um
  SET subscription_balance = GREATEST(10, um.subscription_balance),
      lifetime_granted     = um.lifetime_granted
                             + (GREATEST(10, um.subscription_balance) - um.subscription_balance),
      subscription_reset_date = (
        WITH bounds AS (
          SELECT
            EXTRACT(DAY FROM p.created_at)::int                                AS created_day,
            -- Last day of the current month (this-month candidate):
            EXTRACT(DAY FROM (date_trunc('month', now()) + interval '1 month - 1 day'))::int
              AS this_month_last_day,
            -- Last day of next month (next-month candidate):
            EXTRACT(DAY FROM (date_trunc('month', now() + interval '1 month') + interval '1 month - 1 day'))::int
              AS next_month_last_day
        ),
        this_candidate AS (
          SELECT make_date(
                   EXTRACT(YEAR  FROM now())::int,
                   EXTRACT(MONTH FROM now())::int,
                   LEAST(created_day, this_month_last_day)
                 )::timestamptz AS dt
          FROM bounds
        )
        SELECT CASE
          WHEN now() < (SELECT dt FROM this_candidate)
            THEN (SELECT dt FROM this_candidate)
          ELSE make_date(
                 EXTRACT(YEAR  FROM (now() + interval '1 month'))::int,
                 EXTRACT(MONTH FROM (now() + interval '1 month'))::int,
                 LEAST((SELECT created_day FROM bounds),
                       (SELECT next_month_last_day FROM bounds))
               )::timestamptz
        END
      ),
      updated_at = now()
  FROM public.profiles p
  WHERE p.id = um.user_id
    AND p.subscription_tier = 'free';

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  -- (c) Ledger rows — one per Free user. `amount = (new − old)`. Users where
  --     delta = 0 still get an audit marker so the cohort stays queryable by
  --     `source = 'phase-30-free-backfill'` (mirrors `phase-12-backfill`).
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  SELECT
    um.user_id,
    (um.subscription_balance - s.old_balance) AS amount,
    'grant',
    'phase-30-free-backfill',
    NULL,
    jsonb_build_object(
      'prev_balance',    s.old_balance,
      'new_balance',     um.subscription_balance,
      'migration',       '20260517000001_merit_free_backfill.sql',
      'tier',            'free',
      'expected_credit', (um.subscription_balance - s.old_balance)
    )
  FROM _phase30_snapshot s
  JOIN public.user_merits um ON um.user_id = s.user_id;

  -- (d) Verification: per-user reconciliation drift MUST be zero for every
  --     Free user. Mirrors `reconcile_merit_balance` formula
  --     (merit_rpcs.sql:436-462). Non-zero drift means the ledger and the
  --     balances disagree — RAISE EXCEPTION rolls the whole migration back.
  SELECT COUNT(*) INTO v_drift_count
  FROM public.user_merits um
  JOIN public.profiles p ON p.id = um.user_id
  WHERE p.subscription_tier = 'free'
    AND (um.subscription_balance + um.shop_balance) <> (
      SELECT COALESCE(SUM(mt.amount), 0)
      FROM public.merit_transactions mt
      WHERE mt.user_id = um.user_id
    );

  IF v_drift_count > 0 THEN
    RAISE EXCEPTION 'Phase 30 backfill drift detected: % users with non-zero drift', v_drift_count;
  END IF;

  RAISE NOTICE 'Phase 30 Free backfill complete; drift verified zero (% users updated)', v_backfilled;
END
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (NFR-01) — text-form, not executable. To reverse:
--
-- BEGIN;
--   -- 1. Delete the audit-marker ledger rows written by this migration:
--   DELETE FROM public.merit_transactions
--    WHERE source = 'phase-30-free-backfill';
--
--   -- 2. Restore `subscription_balance` / `lifetime_granted` /
--   --    `subscription_reset_date` from the deleted ledger metadata. This is
--   --    a best-effort reverse — ledger metadata recorded prev_balance, so:
--   --
--   --   WITH undo AS (
--   --     SELECT user_id,
--   --            (metadata->>'prev_balance')::int AS prev_balance,
--   --            amount AS delta
--   --       FROM public.merit_transactions
--   --      WHERE source = 'phase-30-free-backfill'
--   --   )
--   --   UPDATE public.user_merits um
--   --      SET subscription_balance = u.prev_balance,
--   --          lifetime_granted     = um.lifetime_granted - u.delta,
--   --          subscription_reset_date = NULL,
--   --          updated_at = now()
--   --     FROM undo u
--   --    WHERE u.user_id = um.user_id;
--   --
--   --  (Run BEFORE the DELETE so the metadata is still available, or capture
--   --   it into a temp table first.)
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
