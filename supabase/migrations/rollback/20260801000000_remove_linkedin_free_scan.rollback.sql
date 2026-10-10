-- Emergency schema rollback only. Re-adding this column does not restore the
-- removed runtime bypass; deploy the matching prior application version first.

ALTER TABLE public.user_merits
  ADD COLUMN IF NOT EXISTS free_linkedin_scan_used boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_merits
    (user_id, subscription_balance, shop_balance, lifetime_granted,
     subscription_reset_date, free_linkedin_scan_used)
  VALUES (NEW.id, 10, 0, 10, (now() + interval '1 month'), false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 10, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_subscription_merits(
  p_user_id uuid,
  p_tier text,
  p_next_reset_date timestamptz
)
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
  SELECT subscription_balance INTO v_old_balance
    FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

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

  UPDATE public.user_merits
    SET subscription_balance     = v_new_balance,
        free_linkedin_scan_used  = false,
        subscription_reset_date  = p_next_reset_date,
        updated_at               = now()
    WHERE user_id = p_user_id;

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
