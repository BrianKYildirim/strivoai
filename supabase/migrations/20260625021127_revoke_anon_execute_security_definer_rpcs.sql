REVOKE EXECUTE ON FUNCTION public.can_perform_ai_action(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_feature_usage(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_recommendations_shown(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_merit_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_upgrade_user(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_merits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_usage_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_upgrade_requests() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_usage_breakdown(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_and_record_ai_usage(uuid, ai_action_type, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_billing_period_start(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auth_owns_version(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_welcome_sequence() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_provision_user_merits() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_benchmarks_rollup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_lifecycle_sweep() FROM anon;

DO $$
DECLARE v_anon_grants integer;
BEGIN
  SELECT count(*) INTO v_anon_grants
  FROM information_schema.role_routine_grants
  WHERE grantee = 'anon' AND specific_schema = 'public'
    AND routine_name IN (
      'can_perform_ai_action','has_role','record_feature_usage','record_recommendations_shown',
      'get_merit_balance','admin_upgrade_user','admin_set_user_merits','get_admin_usage_stats',
      'get_pending_upgrade_requests','get_user_usage_breakdown','check_and_deduct_merits',
      'refund_merits','record_ai_usage','check_and_record_ai_usage','credit_shop_merits',
      'grant_upgrade_diff','reset_subscription_merits','get_billing_period_start',
      'get_ai_failure_rate_1h','get_shop_failure_rate_1h','admin_set_user_credits','get_user_usage',
      'reconcile_merit_balance','auth_owns_version','queue_welcome_sequence','handle_new_user',
      'auto_provision_user_merits','run_benchmarks_rollup','run_lifecycle_sweep'
    );
  IF v_anon_grants <> 0 THEN
    RAISE EXCEPTION 'anon EXECUTE still present on % SECURITY DEFINER RPC(s) after revoke', v_anon_grants;
  END IF;
  RAISE NOTICE 'anon EXECUTE revoked on all targeted SECURITY DEFINER RPCs (authenticated + service_role untouched)';
END $$;;
