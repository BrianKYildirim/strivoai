-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 11: merit-rpcs-and-reconciliation
-- Additive migration: one new table (merit_feature_costs) + six SECURITY DEFINER
-- RPCs + verification block. Zero DROP/ALTER/rename. Mirrors Phase 10 D-13 style.
--
-- Contents:
--   §1  merit_feature_costs DDL + RLS + 13-row seed               [Plan 11-01]
--   §2  check_and_deduct_merits RPC                                [Plan 11-02]
--   §3  refund_merits RPC                                          [Plan 11-02]
--   §4  get_merit_balance RPC                                      [Plan 11-02]
--   §5  credit_shop_merits RPC                                     [Plan 11-03]
--   §6  reset_subscription_merits RPC                              [Plan 11-03]
--   §7  reconcile_merit_balance RPC                                [Plan 11-03]
--   §8  idx_merit_transactions_deduction_id (partial expr index)   [Plan 11-02]
--   §9  DO $$ verification block (asserts 6 RPCs + 13 cost rows)   [Plan 11-04]
-- ─────────────────────────────────────────────────────────────────────────────

-- §1 ─────────────────────────────────────────────────────────────────────────
-- merit_feature_costs: single source of truth for feature cost AND tier gating.
-- Missing (feature, tier) row = tier_locked (D-02). No `active` flag or
-- `updated_at` (D-04). Read-all RLS for authenticated, zero writes (D-01).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merit_feature_costs (
  feature   text    NOT NULL,
  tier      text    NOT NULL CHECK (tier IN ('free','pro','elite')),
  cost      integer NOT NULL CHECK (cost >= 0),
  PRIMARY KEY (feature, tier)
);

ALTER TABLE public.merit_feature_costs ENABLE ROW LEVEL SECURITY;

-- Read-all SELECT policy for authenticated users (frontend cost previews, UX-02).
-- NO write policies — service role bypasses RLS, everything else is locked out.
DROP POLICY IF EXISTS merit_feature_costs_select_all ON public.merit_feature_costs;
CREATE POLICY merit_feature_costs_select_all
  ON public.merit_feature_costs
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed: 13 rows transcribed from REQUIREMENTS.md §RES/LIG/CC/RCL/IPC.
-- Locked tiers (recruiting_lens/free, interview_prep/free) are ABSENT by design
-- (D-02: missing row → RPC returns tier_locked with no side effects).
INSERT INTO public.merit_feature_costs (feature, tier, cost) VALUES
  ('resume_analysis',  'free',  3),   -- RES-01
  ('resume_analysis',  'pro',   2),   -- RES-03
  ('resume_analysis',  'elite', 3),   -- RES-04
  ('linkedin_grading', 'free',  3),   -- LIG-01
  ('linkedin_grading', 'pro',   2),   -- LIG-03 + LIG-05
  ('linkedin_grading', 'elite', 3),   -- LIG-04 + LIG-05
  ('career_compass',   'free',  3),   -- CC-01
  ('career_compass',   'pro',   2),   -- CC-03
  ('career_compass',   'elite', 3),   -- CC-04
  ('recruiting_lens',  'pro',   8),   -- RCL-02 (no free row → RCL-01 tier_locked)
  ('recruiting_lens',  'elite', 5),   -- RCL-04
  ('interview_prep',   'pro',   8),   -- IPC-02 (no free row → IPC-01 tier_locked)
  ('interview_prep',   'elite', 5)    -- IPC-03
ON CONFLICT (feature, tier) DO NOTHING;

-- §2 ─────────────────────────────────────────────────────────────────────────
-- check_and_deduct_merits: atomic feature-cost deduction RPC.
-- Subscription-first deduction (SHOP-10), split across buckets when subscription
-- cannot cover the full cost. Writes 1 or 2 merit_transactions rows sharing a
-- single deduction_id UUID (D-06). Missing (feature, tier) cost row returns
-- tier_locked BEFORE any lock is taken (D-02, T-11-11 mitigation).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(p_user_id uuid, p_feature text, p_tier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cost            integer;
  v_sub_balance     integer;
  v_shop_balance    integer;
  v_sub_take        integer;
  v_shop_take       integer;
  v_deduction_id    uuid := gen_random_uuid();
BEGIN
  -- 1. Tier-gated cost lookup (D-02): missing row = tier_locked BEFORE any balance op.
  SELECT cost INTO v_cost
  FROM public.merit_feature_costs
  WHERE feature = p_feature AND tier = p_tier;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'tier_locked',
      'upgrade_required', true
    );
  END IF;

  -- 2. Row lock on user_merits (D-19).
  SELECT subscription_balance, shop_balance
    INTO v_sub_balance, v_shop_balance
    FROM public.user_merits
    WHERE user_id = p_user_id
    FOR UPDATE;

  -- 2b. Missing user_merits row guard (WR-01).
  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- 3. Pre-check (happy path). CHECK constraint is the safety net (D-20).
  IF (v_sub_balance + v_shop_balance) < v_cost THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_merits',
      'upgrade_required', true
    );
  END IF;

  -- 4. Split: subscription first, shop covers remainder (SHOP-10).
  v_sub_take  := LEAST(v_sub_balance, v_cost);
  v_shop_take := v_cost - v_sub_take;

  -- 5. Write 1 or 2 merit_transactions rows sharing deduction_id (D-06).
  IF v_sub_take > 0 THEN
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_sub_take, 'subscription', 'feature-deduct', p_feature,
       jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier));
  END IF;

  IF v_shop_take > 0 THEN
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_shop_take, 'shop', 'feature-deduct', p_feature,
       jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier));
  END IF;

  -- 6. Update user_merits (CHECK constraint is the negative-balance safety net).
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance - v_sub_take,
        shop_balance         = shop_balance         - v_shop_take,
        updated_at           = now()
    WHERE user_id = p_user_id;

  -- 7. Happy-path response. deduction_id is the refund handle.
  RETURN jsonb_build_object(
    'success',            true,
    'transaction_id',     v_deduction_id,
    'remaining_balance',  (v_sub_balance - v_sub_take) + (v_shop_balance - v_shop_take),
    'deducted_from',      jsonb_build_object(
      'subscription', v_sub_take,
      'shop',         v_shop_take
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text)
  TO authenticated, service_role;

-- §3 ─────────────────────────────────────────────────────────────────────────
-- refund_merits: idempotent compensation RPC for AI-call failures.
-- Looks up original deduction rows by shared deduction_id, writes mirroring
-- refund rows with balance_type='refund' (Pitfall 4), and restores exact
-- original buckets on user_merits. Second call with the same deduction_id
-- returns already_refunded and performs ZERO mutations (SC #2, T-11-12).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_merits(p_user_id uuid, p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row          RECORD;
  v_sub_restore  integer := 0;
  v_shop_restore integer := 0;
BEGIN
  -- 1. Row lock on user_merits (D-19).
  PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- 1b. Missing user_merits row guard (WR-02).
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- 2. Idempotency: any existing refund row for this deduction_id?
  IF EXISTS (
    SELECT 1
    FROM public.merit_transactions r
    WHERE r.user_id = p_user_id
      AND r.balance_type = 'refund'
      AND (r.metadata->>'deduction_id') = p_transaction_id::text
  ) THEN
    RETURN jsonb_build_object('error', 'already_refunded');
  END IF;

  -- 3. Walk original deduction rows (1 or 2, split by bucket).
  FOR v_row IN
    SELECT id, amount, balance_type
    FROM public.merit_transactions
    WHERE user_id = p_user_id
      AND (metadata->>'deduction_id') = p_transaction_id::text
      AND balance_type IN ('subscription','shop')
  LOOP
    -- Write mirroring refund row: balance_type='refund' per D-09 / Pitfall 4.
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_row.amount, 'refund', 'feature-refund', NULL,
       jsonb_build_object(
         'refund_of',    v_row.id,
         'deduction_id', p_transaction_id
       ));

    -- Accumulate per-bucket restore amount (positive because original was negative).
    IF v_row.balance_type = 'subscription' THEN
      v_sub_restore := v_sub_restore + (-v_row.amount);
    ELSIF v_row.balance_type = 'shop' THEN
      v_shop_restore := v_shop_restore + (-v_row.amount);
    END IF;
  END LOOP;

  -- 4. No matching deduction rows → unknown transaction.
  IF (v_sub_restore + v_shop_restore) = 0 THEN
    RETURN jsonb_build_object('error', 'unknown_transaction');
  END IF;

  -- 5. Restore exact original buckets on user_merits (D-09).
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance + v_sub_restore,
        shop_balance         = shop_balance         + v_shop_restore,
        updated_at           = now()
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',     true,
    'refunded_to', jsonb_build_object(
      'subscription', v_sub_restore,
      'shop',         v_shop_restore
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_merits(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) TO authenticated, service_role;

-- §4 ─────────────────────────────────────────────────────────────────────────
-- get_merit_balance: pure read, no lock. Returns the four balance fields used
-- by frontend dashboards and the /merits/balance endpoint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_merit_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_merit_balance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_merit_balance(uuid) TO authenticated, service_role;

-- §8 ─────────────────────────────────────────────────────────────────────────
-- idx_merit_transactions_deduction_id: partial expression index powering the
-- refund_merits lookup path ("find all rows sharing this deduction_id").
-- Partial WHERE clause keeps the index small — only deduction rows carry the key.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_merit_transactions_deduction_id
  ON public.merit_transactions ((metadata->>'deduction_id'))
  WHERE metadata ? 'deduction_id';

-- §5 ─────────────────────────────────────────────────────────────────────────
-- credit_shop_merits: Stripe-webhook callable RPC to credit a shop pack onto
-- shop_balance. Idempotent via pre-lookup on merit_shop_purchases.
-- stripe_payment_intent_id (UNIQUE constraint is the ultimate safety net).
-- Lock order (Pitfall 6): FOR UPDATE the user_merits row FIRST, then do the
-- duplicate check, so concurrent webhook retries serialize cleanly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_shop_merits(p_user_id uuid, p_pack_size integer, p_stripe_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_new_balance integer;
BEGIN
  -- 0. Validate pack size before any lock or mutation (CR-01).
  IF p_pack_size NOT IN (3, 10, 25, 50) THEN
    RETURN jsonb_build_object('error', 'invalid_pack_size');
  END IF;

  -- 1. Lock user row first (D-19, Pitfall 6 ordering).
  PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- 2. Idempotency check: existing purchase row for this stripe_payment_id?
  SELECT id INTO v_existing_id
    FROM public.merit_shop_purchases
    WHERE stripe_payment_intent_id = p_stripe_payment_id;

  IF v_existing_id IS NOT NULL THEN
    SELECT shop_balance INTO v_new_balance
      FROM public.user_merits WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'success',      true,
      'shop_balance', v_new_balance,
      'duplicate',    true
    );
  END IF;

  -- 3. Insert purchase row (UNIQUE constraint is the safety net).
  INSERT INTO public.merit_shop_purchases
    (user_id, pack_size, price_cents, stripe_payment_intent_id, status)
  VALUES
    (p_user_id, p_pack_size,
     CASE p_pack_size WHEN 3 THEN 199 WHEN 10 THEN 499
                      WHEN 25 THEN 999 WHEN 50 THEN 1799 END,
     p_stripe_payment_id, 'succeeded');

  -- 4. Credit shop_balance.
  UPDATE public.user_merits
    SET shop_balance = shop_balance + p_pack_size,
        updated_at   = now()
    WHERE user_id = p_user_id
    RETURNING shop_balance INTO v_new_balance;

  -- 5. Write ledger row.
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES
    (p_user_id, p_pack_size, 'shop', 'shop-credit', NULL,
     jsonb_build_object(
       'stripe_payment_id', p_stripe_payment_id,
       'pack_size',         p_pack_size
     ));

  RETURN jsonb_build_object(
    'success',      true,
    'shop_balance', v_new_balance,
    'pack_size',    p_pack_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_shop_merits(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text)
  TO authenticated, service_role;

-- §6 ─────────────────────────────────────────────────────────────────────────
-- reset_subscription_merits: monthly/yearly cadence reset for Pro/Elite
-- subscribers. Sets subscription_balance to a fixed per-tier target (D-14),
-- clears free_linkedin_scan_used, advances subscription_reset_date. Free tier
-- is a no-op (Phase 10 D-01: Free users have NULL reset_date). shop_balance
-- is NEVER touched (D-15). Writes a single balance_type='grant' ledger row
-- with amount = delta so MER-12 reconciliation invariant holds (D-16).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_subscription_merits(p_user_id uuid, p_tier text, p_next_reset_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance integer;
  v_old_balance integer;
  v_delta       integer;
BEGIN
  -- 1. Lock (D-19).
  SELECT subscription_balance INTO v_old_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- 2. Free no-op (D-14).
  IF p_tier = 'free' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'free_tier_noop');
  END IF;

  -- 3. Resolve target balance (D-14).
  v_new_balance := CASE p_tier
                     WHEN 'pro'   THEN 75
                     WHEN 'elite' THEN 150
                     ELSE NULL
                   END;
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_tier');
  END IF;

  v_delta := v_new_balance - v_old_balance;

  -- 4. Update ONLY subscription_balance + flags (D-15: shop_balance untouched).
  UPDATE public.user_merits
    SET subscription_balance    = v_new_balance,
        free_linkedin_scan_used = false,
        subscription_reset_date = p_next_reset_date,
        updated_at              = now()
    WHERE user_id = p_user_id;

  -- 5. Ledger row (D-16).
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES
    (p_user_id, v_delta, 'grant', 'subscription-reset', NULL,
     jsonb_build_object(
       'reset_for_tier',  p_tier,
       'prev_balance',    v_old_balance,
       'next_reset_date', p_next_reset_date
     ));

  RETURN jsonb_build_object(
    'success',              true,
    'subscription_balance', v_new_balance,
    'delta',                v_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz)
  TO authenticated, service_role;

-- §7 ─────────────────────────────────────────────────────────────────────────
-- reconcile_merit_balance: pure aggregate drift calculator. Used by ops
-- tooling + pgTAP SC #5 randomized sequence test. drift must ALWAYS be 0.
-- If any RPC forgets to write its ledger row, drift goes nonzero and the
-- test fails on the next assertion.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_merit_balance(p_user_id uuid)
RETURNS TABLE (
  user_id          uuid,
  balance_sum      integer,
  transactions_sum integer,
  drift            integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    um.user_id,
    (um.subscription_balance + um.shop_balance)::integer       AS balance_sum,
    COALESCE((SELECT SUM(amount)::integer
                FROM public.merit_transactions mt
                WHERE mt.user_id = um.user_id), 0)             AS transactions_sum,
    ((um.subscription_balance + um.shop_balance)
       - COALESCE((SELECT SUM(amount)::integer
                     FROM public.merit_transactions mt
                     WHERE mt.user_id = um.user_id), 0))::integer AS drift
  FROM public.user_merits um
  WHERE um.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.reconcile_merit_balance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) TO authenticated, service_role;

-- §9 ─────────────────────────────────────────────────────────────────────────
-- Final verification block (D-21). Runs at migration apply time against the
-- target DB. Any mismatch RAISES EXCEPTION and rolls back the whole migration.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rpc_count         integer;
  v_hardened_count    integer;
  v_cost_rows         integer;
  v_deduction_idx     integer;
  v_expected_rpcs     text[] := ARRAY[
    'check_and_deduct_merits',
    'refund_merits',
    'get_merit_balance',
    'credit_shop_merits',
    'reset_subscription_merits',
    'reconcile_merit_balance'
  ];
BEGIN
  -- 1. Six SECURITY DEFINER RPCs in public.
  SELECT COUNT(*) INTO v_rpc_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_expected_rpcs)
    AND p.prosecdef = true;

  IF v_rpc_count <> 6 THEN
    RAISE EXCEPTION
      'Phase 11 RPC deployment failed: expected 6 SECURITY DEFINER RPCs, found %',
      v_rpc_count;
  END IF;

  -- 2. Every RPC has search_path hardened (ASVS V4 — T-11-10 / T-11-20).
  SELECT COUNT(*) INTO v_hardened_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY(v_expected_rpcs)
    AND p.prosecdef = true
    AND p.proconfig IS NOT NULL
    AND p.proconfig::text LIKE '%search_path=public%pg_temp%';

  IF v_hardened_count <> 6 THEN
    RAISE EXCEPTION
      'Phase 11 RPC hardening failed: expected 6 RPCs with SET search_path=public,pg_temp, found %',
      v_hardened_count;
  END IF;

  -- 3. Cost table seed is complete (13 rows, D-02 tier-gating source of truth).
  SELECT COUNT(*) INTO v_cost_rows FROM public.merit_feature_costs;
  IF v_cost_rows <> 13 THEN
    RAISE EXCEPTION
      'Phase 11 cost table seed failed: expected 13 rows, found %',
      v_cost_rows;
  END IF;

  -- 4. Deduction-id partial expression index exists.
  SELECT COUNT(*) INTO v_deduction_idx
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname  = 'idx_merit_transactions_deduction_id';

  IF v_deduction_idx <> 1 THEN
    RAISE EXCEPTION
      'Phase 11 index deployment failed: idx_merit_transactions_deduction_id missing';
  END IF;

  RAISE NOTICE
    'Phase 11 verification passed: 6 RPCs (hardened), 13 cost rows, 1 deduction index';
END $$;
