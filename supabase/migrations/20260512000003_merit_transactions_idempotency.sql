-- Phase 29 · 29-04 · MER-04 / NFR-01 / NFR-07 — merit_transactions idempotency.
--
-- Purpose: Ship the server-side substrate for sync-path merit idempotency
-- (MER-04). A retried / duplicated user submit (network retry, double-click,
-- AbortController re-fire, refresh) that reuses the same idempotency_key
-- MUST NOT deduct merits twice. Phase 31 (Optimistic UI) wires the frontend;
-- this migration ships the column + partial UNIQUE index + 4-arg RPC overload
-- so the gateway plan (29-06) can wire `withMerits` to forward the key.
--
-- Sections:
--   1. ADD COLUMN IF NOT EXISTS merit_transactions.idempotency_key text NULL
--      + descriptive COMMENT.
--   2. CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_unique
--      — partial index gated on source = 'feature-deduct'
--      AND idempotency_key IS NOT NULL.
--   3. CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
--        p_user_id uuid, p_feature text, p_tier text, p_idempotency_key text DEFAULT NULL
--      ) — 4-arg overload that pre-checks the new column and absorbs concurrent
--      retry-storm races via EXCEPTION WHEN unique_violation (NFR-07).
--      The pre-existing 3-arg overload (uuid, text, text) is NOT modified —
--      Postgres dispatches by arg count, so existing callers compile unchanged.
--   4. REVOKE ALL / GRANT EXECUTE on the new 4-arg signature, mirroring the
--      3-arg grant pattern from 20260415000000_merit_rpcs.sql.
--   5. Verification DO-block: RAISE EXCEPTION if (a) column missing,
--      (b) partial UNIQUE index missing, (c) 4-arg RPC missing or not
--      SECURITY DEFINER; RAISE NOTICE on success.
--
-- Re-runnability (NFR-01):
--   * §1: ADD COLUMN IF NOT EXISTS — safe to re-apply.
--   * §2: CREATE UNIQUE INDEX IF NOT EXISTS — safe to re-apply.
--   * §3: CREATE OR REPLACE FUNCTION — safe to re-apply.
--   * §4: REVOKE / GRANT — idempotent.
--   * §5: Read-only verification — idempotent.
--
-- Roll-forward only (D-22): no destructive removal of columns, indexes, or
-- functions; no destructive ALTER. If a rollback is ever required, write a
-- new forward migration. Both 3-arg and 4-arg `check_and_deduct_merits`
-- signatures remain live across the migration window.
--
-- Anti-pattern (per 29-RESEARCH.md §Pattern 4 / Anti-Patterns): We deliberately
-- do NOT rely on PostgreSQL's partial-index ON-CONFLICT inference here —
-- inference against a partial UNIQUE is fragile. We use a
-- `BEGIN ... EXCEPTION WHEN unique_violation THEN ... END;` block instead,
-- which catches SQLSTATE 23505 reliably whether the conflict is on the
-- partial index or any future unique constraint we add.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MER-04: Additive column on merit_transactions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.merit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

COMMENT ON COLUMN public.merit_transactions.idempotency_key IS
  'Phase 29 MER-04: client-supplied UUID forwarded by check_and_deduct_merits 4-arg overload. Only rows with source=''feature-deduct'' participate in the partial UNIQUE constraint merit_transactions_idempotency_key_unique. Refund (source=''refund''), shop-credit / top-up (source=''topup''), subscription-reset, and admin-adjust rows leave this column NULL by design.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MER-04 / NFR-07: Partial unique index (retry-storm dedup)
--    Mirrors merit_transactions_stripe_pi_unique from 20260422000000:36-38.
--    Only non-NULL feature-deduct rows are unique; all other (NULL key /
--    non feature-deduct) rows are untouched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_unique
  ON public.merit_transactions (idempotency_key)
  WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MER-04 / NFR-07: 4-arg check_and_deduct_merits overload.
--
--    Strategy (D-09..D-12 + 29-RESEARCH.md §Pattern 4):
--      (i)   Pre-check: if p_idempotency_key IS NOT NULL, SELECT the prior
--            deduction_id from merit_transactions where idempotency_key matches
--            AND source = 'feature-deduct'. On hit, short-circuit and return
--            { success: true, transaction_id: <prior>, already_deducted: true }
--            WITHOUT touching user_merits.
--      (ii)  Tier-gated cost lookup (D-02) — identical to the 3-arg body.
--      (iii) Row lock on user_merits (D-19) — identical to the 3-arg body.
--      (iv)  Pre-check insufficient_merits (D-20) — identical to the 3-arg body.
--      (v)   Subscription-first split via LEAST() (SHOP-10).
--      (vi)  Wrap BOTH leg INSERTs in a single inner BEGIN...EXCEPTION
--            WHEN unique_violation block. Each INSERT adds idempotency_key
--            to the column list and passes p_idempotency_key in VALUES.
--            On race-storm collision, the exception arm SELECTs the prior
--            deduction_id and returns the same already_deducted shape as
--            the entry-time pre-check.
--      (vii) Happy-path: UPDATE user_merits, return the existing
--            { success, transaction_id, remaining_balance, deducted_from }
--            shape verbatim from the 3-arg body.
--
--    The 3-arg check_and_deduct_merits(uuid, text, text) from
--    20260415000000_merit_rpcs.sql:67 remains live and callable. Postgres
--    dispatches by arg count — existing callers compile unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id          uuid,
  p_feature          text,
  p_tier             text,
  p_idempotency_key  text DEFAULT NULL
)
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
  v_prior_id        uuid;
BEGIN
  -- 0. MER-04: Idempotency pre-check (entry-time short-circuit).
  --    If a prior feature-deduct row already exists for this idempotency_key,
  --    return its deduction_id without touching user_merits. This handles the
  --    common case (user re-submits after a successful response was lost in
  --    transit) cheaply, before we lock any row.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT (metadata->>'deduction_id')::uuid
      INTO v_prior_id
      FROM public.merit_transactions
      WHERE idempotency_key = p_idempotency_key
        AND source = 'feature-deduct'
      LIMIT 1;

    IF v_prior_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success',          true,
        'transaction_id',   v_prior_id,
        'already_deducted', true
      );
    END IF;
  END IF;

  -- 1. Tier-gated cost lookup (D-02): missing row = tier_locked BEFORE any
  --    balance op. Identical to 3-arg body.
  SELECT cost INTO v_cost
  FROM public.merit_feature_costs
  WHERE feature = p_feature AND tier = p_tier;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'tier_locked',
      'upgrade_required', true
    );
  END IF;

  -- 2. Row lock on user_merits (D-19). Identical to 3-arg body.
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

  -- 5. MER-04 / NFR-07: Write 1 or 2 merit_transactions rows sharing
  --    deduction_id (D-06), inside an inner BEGIN...EXCEPTION block so a
  --    racing concurrent caller (same p_idempotency_key, fired between
  --    our pre-check and our INSERT) raises unique_violation and is
  --    absorbed — the loser returns the winner's deduction_id with
  --    already_deducted=true, the winner commits normally.
  BEGIN
    IF v_sub_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_sub_take, 'subscription', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;

    IF v_shop_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_shop_take, 'shop', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race storm: a concurrent caller using the same idempotency_key
      -- inserted first. Look up its deduction_id and return the same
      -- already_deducted shape as the entry-time pre-check.
      SELECT (metadata->>'deduction_id')::uuid
        INTO v_prior_id
        FROM public.merit_transactions
        WHERE idempotency_key = p_idempotency_key
          AND source = 'feature-deduct'
        LIMIT 1;

      RETURN jsonb_build_object(
        'success',          true,
        'transaction_id',   v_prior_id,
        'already_deducted', true
      );
  END;

  -- 6. Update user_merits (CHECK constraint is the negative-balance safety
  --    net). Reached only on the winner path — the loser returned inside
  --    the EXCEPTION arm above without touching user_merits.
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance - v_sub_take,
        shop_balance         = shop_balance         - v_shop_take,
        updated_at           = now()
    WHERE user_id = p_user_id;

  -- 7. Happy-path response — verbatim from the 3-arg body. deduction_id is
  --    the refund handle.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REVOKE / GRANT on the new 4-arg signature.
--    NOTE: the pre-existing 3-arg check_and_deduct_merits(uuid, text, text)
--    from 20260415000000_merit_rpcs.sql remains live with its own GRANTs —
--    we do not touch it. Postgres dispatches by arg count, so every current
--    3-arg caller continues to work; new callers (Plan 29-06 gateway) pass
--    the 4th arg to opt into idempotency.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verification (NFR-01 evidence: this DO-block is read-only and idempotent).
--    Mirrors the style of 20260415000000_merit_rpcs.sql:468-534 and
--    20260422000000_phase_24_topup.sql:167-196.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pronargs    smallint;
  v_prosecdef   boolean;
  v_indexdef    text;
BEGIN
  -- (a) idempotency_key column present on merit_transactions.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'merit_transactions'
      AND column_name  = 'idempotency_key'
  ) THEN
    RAISE EXCEPTION
      'Phase 29 MER-04 migration failed: merit_transactions.idempotency_key column missing';
  END IF;

  -- (b) Partial UNIQUE index present and is in fact partial (indexdef contains WHERE).
  SELECT indexdef
    INTO v_indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'merit_transactions_idempotency_key_unique';

  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION
      'Phase 29 MER-04 migration failed: partial UNIQUE index merit_transactions_idempotency_key_unique missing';
  END IF;

  IF position('WHERE' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION
      'Phase 29 MER-04 migration failed: index merit_transactions_idempotency_key_unique exists but is not partial (no WHERE clause in indexdef: %)',
      v_indexdef;
  END IF;

  -- (c) 4-arg check_and_deduct_merits is present and SECURITY DEFINER.
  SELECT pronargs, prosecdef
    INTO v_pronargs, v_prosecdef
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname      = 'check_and_deduct_merits'
      AND pronargs     = 4
    LIMIT 1;

  IF v_pronargs IS NULL THEN
    RAISE EXCEPTION
      'Phase 29 NFR-07 migration failed: 4-arg check_and_deduct_merits(uuid, text, text, text) missing';
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION
      'Phase 29 NFR-07 migration failed: 4-arg check_and_deduct_merits is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Phase 29 MER-04 / NFR-07 verification passed: column + partial UNIQUE index + 4-arg RPC in place';
END $$;
