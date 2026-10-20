-- DB-05 (Plan 08-05): REVOKE EXECUTE ... FROM authenticated on the 19 SECURITY DEFINER public
-- RPCs that have NO live frontend (authenticated) caller — service-role / trigger / cron only.
--
-- Symptom (advisor): get_advisors(type="security") ->
--   `authenticated_security_definer_function_executable` [WARN] x30. This migration scopes the
--   PROVABLY-UNUSED subset (19 of the 30) to least-privilege; the other 11 are KEPT and gated.
--
-- Read-map (RUNTIME-RELIABILITY.md "DB-05 Plan 08-05 EXECUTE-grant read-map"): the 19 functions
-- below have ZERO `src/**` `.rpc()` call site (no frontend/authenticated caller). They are reached
-- ONLY by edge functions via `getServiceClient()` (service_role BYPASSES this grant), by a TRIGGER
-- (definer-context, not a role EXECUTE grant), or by pg_cron inline SQL. Revoking authenticated
-- EXECUTE therefore changes NOTHING for any live caller.
--
-- ── KEPT (NOT in this migration — authenticated EXECUTE is LOAD-BEARING or RLS-context; GATED) ──
--   can_perform_ai_action      -- live FE RPC: Navbar.tsx:109, SkillsGapAnalysis.tsx:108  (NEVER revoke)
--   has_role                   -- live FE RPC: AdminUsage.tsx:78, Dashboard.tsx:220
--   record_feature_usage       -- live FE RPC: useFeatureUsage.ts:31
--   record_recommendations_shown -- live FE RPC: CareerCompass/LinkedInGrader/RecruitingLens/Results
--   get_merit_balance          -- live FE RPC: useMerits.ts:59
--   admin_upgrade_user         -- live FE RPC: AdminUsage.tsx:112  (self-guarded on has_role)
--   admin_set_user_merits      -- live FE RPC: AdminUsage.tsx:222  (self-guarded on has_role)
--   get_admin_usage_stats      -- live FE RPC: AdminUsage.tsx:101  (self-guarded on has_role)
--   get_pending_upgrade_requests -- live FE RPC: AdminUsage.tsx:102 (self-guarded on has_role)
--   get_user_usage_breakdown   -- live FE RPC: AdminUsage.tsx:193  (self-guarded on has_role)
--   auth_owns_version          -- evaluated in the authenticated caller's RLS USING() context (conservative KEEP)
-- These 11 stay GATED (RESIDUAL-REGISTER R-DB-05). See the companion `..0010` for the anon revoke.
--
-- Zero-change rationale: service_role bypasses EXECUTE grants; trigger/cron invocation does not
-- consult a role's EXECUTE grant. Many of these 19 already carry `REVOKE ALL ... FROM public` +
-- `GRANT TO authenticated, service_role` (so they DO hold a live authenticated grant that drops
-- here); the rest hold only the default PUBLIC grant. REVOKE of an absent grant is a silent no-op
-- -> the file is re-runnable (NFR-01).
--
-- Roll-forward only (D-08 / NFR-02): each REVOKE has a matching GRANT rollback below restoring the
-- exact prior authenticated grant.
--
-- preview->prod HARD GATE (D-05): orchestrator applies to preview, confirms the live proacl + the
-- advisor `authenticated_security_definer_function_executable` count drop + the no-regression check
-- (the 11 KEPT functions STILL have authenticated EXECUTE; a representative KEPT fn —
-- can_perform_ai_action — still runs as authenticated), THEN the operator applies to prod.

-- ─────────────────────────────────────────────────────────────────────────────
-- FORWARD: revoke authenticated EXECUTE on the 19 provably-unused RPCs (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (read-only): EFFECTIVE executability via has_function_privilege (the
-- SAME predicate the advisor uses) — NOT information_schema.role_routine_grants (which
-- sees only explicit grants and is blind to the PUBLIC grant; see `..0010` for the
-- effective-grant correction). The 19 must be NON-executable by authenticated; the 11
-- KEEP set (10 live FE RPCs + auth_owns_version's RLS-context grant) MUST stay executable.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_19_auth integer;
  v_11_auth integer;
BEGIN
  -- the 19 provably-unused must NOT be executable by authenticated.
  -- NOTE: record_ai_usage has TWO overloads, both in the 19; matching pg_proc by name
  -- covers both oids — has_function_privilege is checked per-oid.
  SELECT count(*) INTO v_19_auth
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname IN (
      'check_and_deduct_merits','refund_merits','record_ai_usage','check_and_record_ai_usage',
      'credit_shop_merits','grant_upgrade_diff','reset_subscription_merits','get_billing_period_start',
      'get_ai_failure_rate_1h','get_shop_failure_rate_1h','admin_set_user_credits','get_user_usage',
      'reconcile_merit_balance','queue_welcome_sequence','handle_new_user','auto_provision_user_merits',
      'run_benchmarks_rollup','run_lifecycle_sweep'
    );
  IF v_19_auth <> 0 THEN
    RAISE NOTICE 'authenticated can still EXECUTE % of the 19 unused RPC(s)', v_19_auth;
  END IF;

  -- no-regression: the 11 KEEP functions MUST remain executable by authenticated.
  -- All 11 are single-overload, so the per-oid count equals 11.
  SELECT count(*) INTO v_11_auth
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.proname IN (
      'can_perform_ai_action','has_role','record_feature_usage','record_recommendations_shown',
      'get_merit_balance','admin_upgrade_user','admin_set_user_merits','get_admin_usage_stats',
      'get_pending_upgrade_requests','get_user_usage_breakdown','auth_owns_version'
    );
  IF v_11_auth <> 11 THEN
    RAISE NOTICE 'no-regression FAILED: expected 11 KEEP RPCs executable by authenticated, found %', v_11_auth;
  END IF;
  RAISE NOTICE 'authenticated EXECUTE removed on the 19 unused RPCs; the 11 gated KEEP retain it (can_perform_ai_action + auth_owns_version intact)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (D-06) — restore authenticated EXECUTE on the 19 to the exact prior state.
-- ─────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.check_and_record_ai_usage(uuid, ai_action_type, integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_billing_period_start(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.get_user_usage(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.queue_welcome_sequence() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.auto_provision_user_merits() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.run_benchmarks_rollup() TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.run_lifecycle_sweep() TO authenticated;
