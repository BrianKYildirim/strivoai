-- Phase 12: stripe-products-and-webhook — additive only.
-- CRITICAL: Do NOT add any permissive policy that matches all rows (SEC-06 anti-pattern).
-- Service role bypasses RLS automatically — that is the only legitimate write path.
--
-- Sections:
--   0. D-13/SUB-14: grant_upgrade_diff RPC (Phase 11 contract ask — added here)
--   1. SUB-15: profiles.pending_downgrade_tier column                        (additive)
--   2. SUB-11/SUB-12/NFR-08: pg_cron sweep targeting reset-subscription-merits
--   3. MIG-03: one-shot backfill of existing active Pro/Elite subscribers
--   4. Verification block
--
-- Re-runnability:
--   • Section 0 uses CREATE OR REPLACE FUNCTION (safe to re-apply).
--   • Section 1 uses ADD COLUMN IF NOT EXISTS.
--   • Section 2 unschedules the job before re-registering it (safe to re-apply).
--   • Section 3 calls the Phase 11 reset_subscription_merits RPC, which is
--     idempotent on subscription_balance (sets to a fixed per-tier target) but
--     writes a new ledger row each call. Re-running this migration would write
--     duplicate phase-12-backfill audit markers; in practice the migration
--     applies once per environment and the marker rows are amount=0 so they do
--     not affect MER-12 reconciliation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. D-13/SUB-14: grant_upgrade_diff — grants the subscription_balance
--    difference when a user upgrades mid-cycle (e.g. Pro→Elite adds 75).
--    Called by stripe-webhook-handler on customer.subscription.updated with
--    tier upgrade. Uses FOR UPDATE row lock to prevent concurrent upgrade +
--    deduction race (T-12-03). Follows Phase 11 RPC patterns exactly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_upgrade_diff(p_user_id uuid, p_from_tier text, p_to_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from_allowance integer;
  v_to_allowance   integer;
  v_diff           integer;
  v_old_balance    integer;
BEGIN
  v_from_allowance := CASE p_from_tier WHEN 'pro' THEN 75 WHEN 'elite' THEN 150 ELSE 0 END;
  v_to_allowance   := CASE p_to_tier   WHEN 'pro' THEN 75 WHEN 'elite' THEN 150 ELSE 0 END;
  v_diff := v_to_allowance - v_from_allowance;

  IF v_diff <= 0 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'no_positive_diff', 'diff', v_diff);
  END IF;

  SELECT subscription_balance INTO v_old_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  UPDATE public.user_merits
    SET subscription_balance = subscription_balance + v_diff,
        updated_at           = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES
    (p_user_id, v_diff, 'grant', 'upgrade-diff', NULL,
     jsonb_build_object(
       'from_tier',      p_from_tier,
       'to_tier',        p_to_tier,
       'from_allowance', v_from_allowance,
       'to_allowance',   v_to_allowance
     ));

  RETURN jsonb_build_object(
    'success',              true,
    'diff',                 v_diff,
    'subscription_balance', v_old_balance + v_diff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_upgrade_diff(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SUB-15: pending downgrade tier (set on customer.subscription.updated with
--    a downgrade, applied at current_period_end by the next
--    invoice.payment_succeeded / customer.subscription.updated cycle).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_downgrade_tier text NULL;

COMMENT ON COLUMN public.profiles.pending_downgrade_tier IS
  'Phase 12 SUB-15: target tier to downgrade to at current_period_end; NULL = no pending change.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SUB-11/SUB-12/NFR-08: cron sweep for monthly Merit refills (yearly subs
--    + fallback for monthly subs whose webhook event was missed).
--
--    NOTE: This cron.schedule block uses current_setting('app.functions_base_url')
--    and current_setting('app.internal_job_secret'), both of which must be set
--    per-environment via:
--      ALTER DATABASE postgres
--        SET app.functions_base_url = 'https://<project-ref>.supabase.co/functions/v1';
--      ALTER DATABASE postgres
--        SET app.internal_job_secret = '<INTERNAL_JOB_SECRET-secret>';
--    Staging project ref:    cimjltzovkahkqecpwgi
--    Production project ref: zjpjapgraoxdukdvpjes
--    The DEPLOY_RUNBOOK in a later plan documents the exact ALTER DATABASE
--    commands per environment. The current_setting(..., true) form returns NULL
--    when the GUC is missing, so the migration apply itself is non-fatal even
--    if the GUCs have not been set yet — the cron tick will produce a
--    pg_net.http_post against an invalid URL until the GUCs are configured.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-subscription-merits-sweep') THEN
    PERFORM cron.unschedule('reset-subscription-merits-sweep');
  END IF;

  PERFORM cron.schedule(
    'reset-subscription-merits-sweep',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url     := current_setting('app.functions_base_url', true) || '/reset-subscription-merits',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', current_setting('app.internal_job_secret', true)
      ),
      body    := '{"invocation_source": "pg_cron"}'::jsonb
    );
    $job$
  );
END
$cron$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MIG-03: backfill existing active Pro/Elite subscribers. Runs once.
--    Guards on Phase 11 RPC existence — fails loudly if migration ordering is
--    wrong. Phase 11's reset_subscription_merits RPC writes its own
--    balance_type='grant' ledger row with source='subscription-reset' and
--    amount = (new_balance - old_balance) per merit_rpcs.sql §6, so this
--    backfill block ONLY adds an amount=0 audit marker row with
--    source='phase-12-backfill' for traceability. Writing a non-zero second
--    ledger row here would break MER-12 reconciliation (drift = balance_sum
--    − transactions_sum) by double-counting the credit.
-- ─────────────────────────────────────────────────────────────────────────────
DO $backfill$
DECLARE
  r RECORD;
  credited_count integer := 0;
  rpc_exists boolean;
BEGIN
  -- Guard: Phase 11 reset_subscription_merits must exist before we attempt to
  -- credit any subscribers. Surfacing this as a hard error rolls back the
  -- entire Phase 12 migration if Phase 11 has not been applied yet.
  SELECT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'reset_subscription_merits'
  ) INTO rpc_exists;

  IF NOT rpc_exists THEN
    RAISE EXCEPTION 'Phase 11 RPC reset_subscription_merits not deployed — apply Phase 11 migration first';
  END IF;

  FOR r IN
    SELECT id AS user_id, subscription_tier
      FROM public.profiles
     WHERE subscription_tier IN ('pro','elite')
       AND subscription_status = 'active'
  LOOP
    BEGIN
      -- Phase 11 RPC: atomically credits the per-tier target balance
      -- (75 for Pro, 150 for Elite), advances subscription_reset_date by
      -- one month, and writes its OWN balance_type='grant' ledger row with
      -- source='subscription-reset' and amount = delta.
      PERFORM public.reset_subscription_merits(
        p_user_id         := r.user_id,
        p_tier            := r.subscription_tier,
        p_next_reset_date := (now() + interval '1 month')
      );

      -- Audit marker: amount=0 so MER-12 reconciliation stays at drift=0.
      -- Distinguishable from normal subscription-reset rows by the
      -- source='phase-12-backfill' literal (mirrors Phase 10 D-15 convention).
      INSERT INTO public.merit_transactions(user_id, amount, balance_type, source, feature, metadata)
      VALUES (
        r.user_id,
        0,
        'grant',
        'phase-12-backfill',
        NULL,
        jsonb_build_object(
          'tier',                r.subscription_tier,
          'migration',           '20260415000000',
          'credited_via',        'reset_subscription_merits',
          'expected_credit',     CASE r.subscription_tier WHEN 'pro' THEN 75 WHEN 'elite' THEN 150 ELSE 0 END
        )
      );

      credited_count := credited_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'phase-12-backfill skip user_id=%: %', r.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'phase-12-backfill complete: credited % active subscribers', credited_count;
END
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verification block — asserts the SUB-15 column is present and reports
--    on the cron job registration. The cron job presence is a WARNING (not
--    an EXCEPTION) because the GUC-driven URL/secret are per-environment.
-- ─────────────────────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  = 'pending_downgrade_tier'
  ) THEN
    RAISE EXCEPTION 'verify failed: profiles.pending_downgrade_tier missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'grant_upgrade_diff'
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'verify failed: grant_upgrade_diff RPC missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'reset-subscription-merits-sweep'
  ) THEN
    RAISE WARNING 'verify: cron job reset-subscription-merits-sweep not registered (likely per-env)';
  END IF;

  RAISE NOTICE 'phase-12 migration verify OK';
END
$verify$;
