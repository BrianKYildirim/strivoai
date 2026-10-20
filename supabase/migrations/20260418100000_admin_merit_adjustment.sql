-- Admin merit adjustment: rewires admin dashboard RPCs to use the merit system.
-- Adds admin_set_user_merits RPC, replaces get_admin_usage_stats return type
-- to surface merit balances instead of legacy credit_adjustment/remaining_credits.
--
-- Does NOT drop or modify the legacy admin_set_user_credits function (backward compat).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_set_user_merits — set a user's subscription_balance to a specific value
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_merits(p_user_id uuid, p_merits integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_balance integer;
  v_delta       integer;
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  -- Validate p_merits is non-negative
  IF p_merits < 0 THEN
    RAISE EXCEPTION 'Merits must be a non-negative integer.';
  END IF;

  -- Lock the user_merits row and get current subscription_balance
  SELECT subscription_balance INTO v_old_balance
  FROM public.user_merits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_old_balance IS NULL THEN
    RAISE EXCEPTION 'User merit record not found';
  END IF;

  -- Compute the delta for the audit trail
  v_delta := p_merits - v_old_balance;

  -- Update subscription_balance to the target value
  UPDATE public.user_merits
  SET subscription_balance = p_merits,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Write audit trail row in merit_transactions
  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES
    (p_user_id, v_delta, 'grant', 'admin-adjustment', NULL,
     jsonb_build_object(
       'admin_id',         auth.uid(),
       'previous_balance', v_old_balance,
       'new_balance',      p_merits
     ));

  RETURN p_merits;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_merits(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_merits(uuid, integer)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_admin_usage_stats — updated to return merit balances
-- ─────────────────────────────────────────────────────────────────────────────
-- Must DROP first because the return type is changing (removing credit_adjustment
-- and remaining_credits, adding subscription_balance, shop_balance, total_merits).
DROP FUNCTION IF EXISTS public.get_admin_usage_stats();

CREATE OR REPLACE FUNCTION public.get_admin_usage_stats()
RETURNS TABLE (
  user_id              uuid,
  email                text,
  subscription_tier    text,
  total_actions        bigint,
  last_action_at       timestamp with time zone,
  subscription_balance integer,
  shop_balance         integer,
  total_merits         integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only allow admins to call this function
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.subscription_tier,
    COALESCE(COUNT(ut.id), 0)::bigint AS total_actions,
    MAX(ut.created_at) AS last_action_at,
    COALESCE(um.subscription_balance, 0) AS subscription_balance,
    COALESCE(um.shop_balance, 0) AS shop_balance,
    (COALESCE(um.subscription_balance, 0) + COALESCE(um.shop_balance, 0))::integer AS total_merits
  FROM public.profiles p
  LEFT JOIN public.user_merits um ON um.user_id = p.id
  LEFT JOIN public.usage_tracking ut ON ut.user_id = p.id
    AND ut.billing_period_start = public.get_billing_period_start(p.id)
  GROUP BY p.id, p.email, p.subscription_tier, um.subscription_balance, um.shop_balance
  ORDER BY total_merits DESC, total_actions DESC;
END;
$$;
