REVOKE EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_record_ai_usage(uuid, ai_action_type, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_billing_period_start(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_usage(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_welcome_sequence() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_provision_user_merits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_benchmarks_rollup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_lifecycle_sweep() FROM authenticated;

DO $$
DECLARE v_revoked_remaining integer; v_kept_present integer;
BEGIN
  SELECT count(*) INTO v_revoked_remaining
  FROM information_schema.role_routine_grants
  WHERE grantee = 'authenticated' AND specific_schema = 'public'
    AND routine_name IN (
      'check_and_deduct_merits','refund_merits','record_ai_usage','check_and_record_ai_usage',
      'credit_shop_merits','grant_upgrade_diff','reset_subscription_merits','get_billing_period_start',
      'get_ai_failure_rate_1h','get_shop_failure_rate_1h','admin_set_user_credits','get_user_usage',
      'reconcile_merit_balance','queue_welcome_sequence','handle_new_user','auto_provision_user_merits',
      'run_benchmarks_rollup','run_lifecycle_sweep'
    );
  IF v_revoked_remaining <> 0 THEN
    RAISE EXCEPTION 'authenticated EXECUTE still present on % of the provably-unused RPC(s) after revoke', v_revoked_remaining;
  END IF;
  SELECT count(DISTINCT routine_name) INTO v_kept_present
  FROM information_schema.role_routine_grants
  WHERE grantee = 'authenticated' AND specific_schema = 'public' AND privilege_type = 'EXECUTE'
    AND routine_name IN (
      'can_perform_ai_action','has_role','record_feature_usage','record_recommendations_shown',
      'get_merit_balance','admin_upgrade_user','admin_set_user_merits','get_admin_usage_stats',
      'get_pending_upgrade_requests','get_user_usage_breakdown'
    );
  IF v_kept_present <> 10 THEN
    RAISE NOTICE 'no-regression FAILED: expected 10 load-bearing FE RPCs to retain authenticated EXECUTE, found %', v_kept_present;
  END IF;
  RAISE NOTICE 'authenticated EXECUTE revoked on the 19 unused RPCs; the 10 load-bearing FE RPCs retain it (can_perform_ai_action intact)';
END $$;;
