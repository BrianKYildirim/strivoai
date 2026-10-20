-- Phase 24 · Plan 02 — top-up pack additive schema + credit_shop_merits rewrite.
--
-- Sections:
--   1. TOPUP-01: ADD COLUMN pack_id + stripe_payment_intent_id on merit_transactions
--   2. TOPUP-01: partial unique index on stripe_payment_intent_id (webhook replay-safety)
--   3. TOPUP-02: CREATE OR REPLACE credit_shop_merits — writes source='topup',
--      populates new columns, preserves D-06 lock ordering + existing idempotency path
--   4. Verification block (raises NOTICE on success, EXCEPTION on missing artefact)
--
-- Re-runnability:
--   * Section 1: ADD COLUMN IF NOT EXISTS — safe to re-apply.
--   * Section 2: CREATE UNIQUE INDEX IF NOT EXISTS with partial WHERE clause — safe.
--   * Section 3: CREATE OR REPLACE FUNCTION — safe.
--
-- Roll-forward only (D-22): no DROP, no destructive ALTER. If a rollback is
-- required, write a new forward migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TOPUP-01: Additive columns on merit_transactions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS pack_id text NULL;

ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text NULL;

COMMENT ON COLUMN public.merit_transactions.pack_id IS
  'Phase 24 TOPUP-01: Stripe top-up pack id (pack_3|pack_10|pack_25|pack_50). NULL for non-topup rows.';
COMMENT ON COLUMN public.merit_transactions.stripe_payment_intent_id IS
  'Phase 24 TOPUP-01: Stripe PaymentIntent id for top-up credits; NULL for non-topup rows. Partial UNIQUE index prevents webhook-replay double-credit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TOPUP-01: Partial unique index (webhook replay-safety — SC-6 / NFR-07)
--    Only non-NULL PIs must be unique; we keep legacy NULL rows untouched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_stripe_pi_unique
  ON public.merit_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TOPUP-02: credit_shop_merits — now writes source='topup' AND populates
--    the two new columns atomically.
--
--    Idempotency strategy (D-04 + NFR-07):
--      (a) PRE-lookup: merit_shop_purchases.stripe_payment_intent_id UNIQUE
--          (existing safety net — unchanged).
--      (b) POST-safety net: merit_transactions_stripe_pi_unique (new partial
--          unique) — if (a) ever races, (b) will raise 23505 which is caught
--          and returned as a duplicate success.
--    Lock order (Pitfall 6): user_merits FOR UPDATE -> idempotency lookup.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_shop_merits(
  p_user_id uuid,
  p_pack_size integer,
  p_stripe_payment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id uuid;
  v_new_balance integer;
  v_price_cents integer;
  v_pack_id     text;
BEGIN
  -- 0. Validate pack size (CR-01).
  IF p_pack_size NOT IN (3, 10, 25, 50) THEN
    RETURN jsonb_build_object('error', 'invalid_pack_size');
  END IF;

  v_price_cents := CASE p_pack_size
    WHEN 3  THEN 199
    WHEN 10 THEN 499
    WHEN 25 THEN 999
    WHEN 50 THEN 1799
  END;
  v_pack_id := 'pack_' || p_pack_size::text;

  -- 1. Lock user row first (D-19 Phase 11, Pitfall 6 ordering).
  --
  -- WR-04: A missing user_merits row silently made the UPDATE below a no-op,
  -- returning { success: true, shop_balance: null } with the purchase +
  -- ledger rows inserted but NO balance credit — a silent merit loss.
  -- Backfill a zeroed row if absent so the UPDATE always applies, then lock.
  -- user_merits is expected to exist from signup; this is defense-in-depth.
  INSERT INTO public.user_merits (user_id, subscription_balance, shop_balance)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Should be impossible after the INSERT above, but assert to be loud
    -- rather than silently returning a null balance.
    RAISE EXCEPTION 'credit_shop_merits: no user_merits row for %', p_user_id;
  END IF;

  -- 2. Idempotency check (a): existing purchase row?
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

  -- 3. Insert purchase row (UNIQUE stripe_payment_intent_id is the safety net).
  INSERT INTO public.merit_shop_purchases
    (user_id, pack_size, price_cents, stripe_payment_intent_id, status)
  VALUES
    (p_user_id, p_pack_size, v_price_cents, p_stripe_payment_id, 'succeeded');

  -- 4. Credit shop_balance atomically.
  UPDATE public.user_merits
    SET shop_balance = shop_balance + p_pack_size,
        updated_at   = now()
    WHERE user_id = p_user_id
    RETURNING shop_balance INTO v_new_balance;

  -- 5. Ledger row (D-04 source='topup', new columns populated).
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata,
     pack_id, stripe_payment_intent_id)
  VALUES
    (p_user_id, p_pack_size, 'shop', 'topup', NULL,
     jsonb_build_object(
       'stripe_payment_id', p_stripe_payment_id,
       'pack_size',         p_pack_size,
       'price_cents',       v_price_cents
     ),
     v_pack_id, p_stripe_payment_id);

  RETURN jsonb_build_object(
    'success',      true,
    'shop_balance', v_new_balance,
    'pack_size',    p_pack_size,
    'pack_id',      v_pack_id
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Post-safety net (b): partial unique index on merit_transactions caught a race.
    SELECT shop_balance INTO v_new_balance
      FROM public.user_merits WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'success',      true,
      'shop_balance', v_new_balance,
      'duplicate',    true,
      'via',          'ledger_unique_race'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_shop_merits(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'merit_transactions'
      AND column_name  = 'pack_id'
  ) THEN
    RAISE EXCEPTION 'Phase 24 migration failed: merit_transactions.pack_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'merit_transactions'
      AND column_name  = 'stripe_payment_intent_id'
  ) THEN
    RAISE EXCEPTION 'Phase 24 migration failed: merit_transactions.stripe_payment_intent_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'merit_transactions_stripe_pi_unique'
  ) THEN
    RAISE EXCEPTION 'Phase 24 migration failed: partial unique index missing';
  END IF;

  RAISE NOTICE 'Phase 24 migration verified OK';
END $$;
