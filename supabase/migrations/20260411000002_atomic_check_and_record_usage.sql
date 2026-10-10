-- Atomic check-and-record usage function.
-- Eliminates TOCTOU race in the two-step can_perform_ai_action + record_ai_usage pattern.
-- The row-level advisory lock serializes concurrent requests per user so that
-- two simultaneous calls cannot both read the pre-increment count and both pass.

CREATE OR REPLACE FUNCTION public.check_and_record_ai_usage(
  p_user_id uuid,
  p_action_type ai_action_type,
  p_credits integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  check_result jsonb;
  is_allowed boolean;
  billing_start DATE;
  record_ok boolean;
BEGIN
  -- Acquire an advisory lock scoped to this user to serialize concurrent requests.
  -- hashtext converts the UUID to an int4 suitable for pg_advisory_xact_lock.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Delegate the check to the existing can_perform_ai_action function,
  -- which handles tier resolution, admin bypass, credit adjustments, etc.
  check_result := public.can_perform_ai_action(p_user_id);
  is_allowed := (check_result->>'allowed')::boolean;

  IF NOT is_allowed THEN
    RETURN check_result;
  END IF;

  -- Record usage atomically within the same transaction/lock scope.
  billing_start := public.get_billing_period_start(p_user_id);

  INSERT INTO public.usage_tracking (user_id, action_type, credits_consumed, billing_period_start)
  VALUES (p_user_id, p_action_type, p_credits, billing_start);

  -- Update the result to reflect the new usage count after recording.
  check_result := jsonb_set(
    check_result,
    '{current_usage}',
    to_jsonb(((check_result->>'current_usage')::integer) + p_credits)
  );

  RETURN check_result;
END;
$$;
