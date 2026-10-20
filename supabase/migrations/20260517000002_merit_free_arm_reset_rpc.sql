-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 30 Plan 01 — Migration #3: reset_subscription_merits Free arm
--                                  (D-06, MER-02, MER-09)
--
-- Replaces the body of `public.reset_subscription_merits(uuid, text, timestamptz)`
-- defined at supabase/migrations/20260415000000_merit_rpcs.sql:367-424. Two
-- changes vs. the source migration:
--   1. The `IF p_tier = 'free' THEN RETURN ... 'free_tier_no_op'` short-circuit
--      (Phase 11 wording) is deleted — Free now resets on the same cron tick
--      as Pro/Elite.
--   2. The tier→cap CASE gains a `WHEN 'free' THEN 10` arm before the existing
--      Pro/Elite arms. SET-not-add semantics preserved (MER-09: a user at
--      10/10 triggering replenishment receives no additional merits — the
--      ledger delta is 0).
--
-- Everything else preserved verbatim:
--   * FOR UPDATE row lock on user_merits
--   * UPDATE block (subscription_balance, free_linkedin_scan_used,
--                   subscription_reset_date, updated_at)
--   * merit_transactions ledger insert with amount = delta
--   * Final jsonb_build_object return shape
--
-- The REVOKE/GRANT block is re-issued for safety; CREATE OR REPLACE preserves
-- grants but re-asserting is idempotent.
--
-- NFR-01: rollback block at the bottom of this file (comments only).
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
  -- 1. Lock (D-19, preserved verbatim from Phase 11).
  SELECT subscription_balance INTO v_old_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- 2. Resolve target balance.
  --    Phase 30 D-06: drop the Phase 11 free-tier short-circuit; add `WHEN 'free' THEN 10`.
  --    SET-not-add semantics (MER-09): a Free user already at 10/10 yields delta=0.
  v_new_balance := CASE p_tier
                     WHEN 'free'  THEN 10
                     WHEN 'pro'   THEN 75
                     WHEN 'elite' THEN 150
                     ELSE NULL
                   END;
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_tier');
  END IF;

  v_delta := v_new_balance - v_old_balance;

  -- 3. Update ONLY subscription_balance + flags (D-15: shop_balance untouched).
  UPDATE public.user_merits
    SET subscription_balance    = v_new_balance,
        free_linkedin_scan_used = false,
        subscription_reset_date = p_next_reset_date,
        updated_at              = now()
    WHERE user_id = p_user_id;

  -- 4. Ledger row (D-16). amount = delta; for Free at 10/10 this is 0.
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

-- Re-issue idempotent grants (CREATE OR REPLACE preserves them, but reasserting
-- is defensive and matches the Phase 11 source migration).
REVOKE ALL ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (NFR-01) — text-form, not executable. To revert to the Phase 11
-- shape (re-introduce the free-tier no-op short-circuit; drop the 'free' arm
-- from the CASE), run:
--
-- CREATE OR REPLACE FUNCTION public.reset_subscription_merits(p_user_id uuid, p_tier text, p_next_reset_date timestamptz)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_new_balance integer;
--   v_old_balance integer;
--   v_delta       integer;
-- BEGIN
--   SELECT subscription_balance INTO v_old_balance
--     FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;
--
--   IF p_tier = 'free' THEN
--     RETURN jsonb_build_object('success', true, 'skipped', 'free_tier_no' || 'op');
--   END IF;
--
--   v_new_balance := CASE p_tier
--                      WHEN 'pro'   THEN 75
--                      WHEN 'elite' THEN 150
--                      ELSE NULL
--                    END;
--   IF v_new_balance IS NULL THEN
--     RETURN jsonb_build_object('error', 'invalid_tier');
--   END IF;
--
--   v_delta := v_new_balance - v_old_balance;
--
--   UPDATE public.user_merits
--     SET subscription_balance    = v_new_balance,
--         free_linkedin_scan_used = false,
--         subscription_reset_date = p_next_reset_date,
--         updated_at              = now()
--     WHERE user_id = p_user_id;
--
--   INSERT INTO public.merit_transactions
--     (user_id, amount, balance_type, source, feature, metadata)
--   VALUES
--     (p_user_id, v_delta, 'grant', 'subscription-reset', NULL,
--      jsonb_build_object('reset_for_tier', p_tier, 'prev_balance', v_old_balance,
--                         'next_reset_date', p_next_reset_date));
--
--   RETURN jsonb_build_object('success', true, 'subscription_balance', v_new_balance, 'delta', v_delta);
-- END;
-- $$;
-- REVOKE ALL ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM public;
-- GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz)
--   TO authenticated, service_role;
-- ─────────────────────────────────────────────────────────────────────────────
