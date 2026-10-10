-- DB-05 (Plan 08-05): REVOKE EXECUTE ... FROM PUBLIC, anon on the 30 SECURITY DEFINER public RPCs.
--
-- Symptom (advisor, canonical prod zjpjapgraoxdukdvpjes + preview cimjltzovkahkqecpwgi):
--   get_advisors(type="security") -> `anon_security_definer_function_executable` [WARN] x30:
--   the `anon` role can EXECUTE 30 SECURITY DEFINER RPCs (admin_*, merit, usage, billing,
--   trigger, and cron functions). On a definer function any UNINTENDED anon EXECUTE is a
--   privilege-escalation surface.
--
-- *** EFFECTIVE-GRANT CORRECTION (Rule-1, caught at the preview gate 2026-06-25) ***
--   The advisor uses has_function_privilege (EFFECTIVE executability), NOT the explicit-grant
--   catalog. These 30 functions carry a BLANKET PUBLIC EXECUTE grant in proacl (the `=X/postgres`
--   entry) IN ADDITION to any explicit anon/authenticated grant. `REVOKE ... FROM anon` removes only
--   the EXPLICIT anon grant; the PUBLIC entry remains and anon is a PUBLIC member, so
--   has_function_privilege('anon', fn, 'EXECUTE') STAYS TRUE and the advisor keeps firing. The
--   first form of this file (REVOKE FROM anon only) was an effective no-op proven on preview.
--   FIX: revoke FROM PUBLIC **and** FROM anon, so neither the blanket nor the explicit grant remains.
--   The shape every target must reach is the one run_lifecycle_sweep/run_benchmarks_rollup already
--   have (proacl `{postgres=X, service_role=X}` — no PUBLIC, no anon).
--
-- Read-map (the load-bearing evidence — RUNTIME-RELIABILITY.md "DB-05 Plan 08-05 EXECUTE-grant
-- read-map"): every one of these 30 functions is reached ONLY by (a) the frontend AUTHENTICATED
-- client (auth-gated pages — anon never reaches them: `src/lib/supabaseClient.ts` is the
-- anon/publishable client, but all of these `.rpc()` sites run after the user is signed in, so
-- they execute as `authenticated`, NOT anon), (b) edge functions via `getServiceClient()`
-- (service_role BYPASSES this grant), (c) a trigger (definer-context), or (d) pg_cron inline SQL.
-- `rg "\.rpc\('<fn>'" src supabase/functions` found ZERO anon (non-authenticated, non-service-role)
-- call path for ANY of the 30. The app requires authentication for every page that reaches an RPC.
--
-- Zero-change rationale (why FROM PUBLIC is SAFE):
--   * PUBLIC = all roles, but postgres (owner) and service_role hold EXPLICIT EXECUTE grants in
--     EVERY proacl, so revoking PUBLIC does NOT drop them -> every edge-function (service_role)
--     caller is unaffected; the owner keeps EXECUTE.
--   * authenticated also holds an explicit grant on all 30 at baseline, so FROM PUBLIC alone does
--     NOT drop authenticated here -> live FE callers are unaffected by this file (the companion
--     `..0011` scopes authenticated separately, KEEPING the 11 load-bearing/gated ones incl.
--     can_perform_ai_action).
--   * anon holds an explicit grant on some of the 30, so FROM PUBLIC alone would not drop anon ->
--     we revoke FROM PUBLIC **and** FROM anon to remove BOTH the blanket and the explicit anon grant.
--   * REVOKE of an absent grant succeeds silently -> the whole file is safely re-runnable (NFR-01).
--
-- Roll-forward only (D-08 / NFR-02): each REVOKE has a matching GRANT rollback in the ROLLBACK
-- block below. The rollback re-grants PUBLIC EXECUTE (the faithful inverse — restores anon/authenticated
-- effective executability to the exact prior state).
--
-- preview->prod HARD GATE (D-05): orchestrator applies to preview cimjltzovkahkqecpwgi, confirms
-- has_function_privilege('anon', fn, 'EXECUTE') = false for all 30 + the advisor
-- `anon_security_definer_function_executable` 30 -> 0 + no regression (KEEP grants intact), THEN
-- the operator applies to prod zjpjapgraoxdukdvpjes.

-- ─────────────────────────────────────────────────────────────────────────────
-- FORWARD: revoke PUBLIC + anon EXECUTE on all 30 SECURITY DEFINER RPCs (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.can_perform_ai_action(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_feature_usage(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_recommendations_shown(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_merit_balance(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_upgrade_user(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_merits(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_usage_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_upgrade_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_usage_breakdown(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_record_ai_usage(uuid, ai_action_type, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_billing_period_start(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_owns_version(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.queue_welcome_sequence() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_provision_user_merits() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_benchmarks_rollup() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_lifecycle_sweep() FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (read-only): EFFECTIVE executability — anon can no longer EXECUTE
-- ANY of the 30 RPCs. Uses has_function_privilege (the SAME predicate the advisor
-- uses), NOT information_schema.role_routine_grants — the latter sees only EXPLICIT
-- grants and is BLIND to the blanket PUBLIC grant that made the first form a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_anon_exec integer;
BEGIN
  SELECT count(*) INTO v_anon_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname IN (
      'can_perform_ai_action','has_role','record_feature_usage','record_recommendations_shown',
      'get_merit_balance','admin_upgrade_user','admin_set_user_merits','get_admin_usage_stats',
      'get_pending_upgrade_requests','get_user_usage_breakdown','check_and_deduct_merits',
      'refund_merits','record_ai_usage','check_and_record_ai_usage','credit_shop_merits',
      'grant_upgrade_diff','reset_subscription_merits','get_billing_period_start',
      'get_ai_failure_rate_1h','get_shop_failure_rate_1h','admin_set_user_credits','get_user_usage',
      'reconcile_merit_balance','auth_owns_version','queue_welcome_sequence','handle_new_user',
      'auto_provision_user_merits','run_benchmarks_rollup','run_lifecycle_sweep'
    );
  IF v_anon_exec <> 0 THEN
    RAISE NOTICE 'anon can still EXECUTE % SECURITY DEFINER RPC(s) (PUBLIC grant not fully revoked)', v_anon_exec;
  END IF;
  RAISE NOTICE 'anon EXECUTE fully removed (PUBLIC + explicit) on all 30 RPCs; service_role + authenticated-explicit retained';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (D-06) — restore PUBLIC EXECUTE (the faithful inverse). Re-granting PUBLIC
-- restores anon's (and every PUBLIC member's) effective executability to the exact
-- pre-migration state. postgres + service_role keep their explicit grants throughout;
-- the companion `..0011` rollback re-grants the 19 explicit authenticated grants.
-- ─────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.can_perform_ai_action(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.record_feature_usage(text, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.record_recommendations_shown(uuid[]) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_merit_balance(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.admin_upgrade_user(uuid, text, uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.admin_set_user_merits(uuid, integer) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_admin_usage_stats() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_pending_upgrade_requests() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_user_usage_breakdown(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.check_and_record_ai_usage(uuid, ai_action_type, integer) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.credit_shop_merits(uuid, integer, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.grant_upgrade_diff(uuid, text, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.reset_subscription_merits(uuid, text, timestamptz) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_billing_period_start(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_ai_failure_rate_1h() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_shop_failure_rate_1h() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, integer) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_user_usage(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.reconcile_merit_balance(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.auth_owns_version(uuid, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.queue_welcome_sequence() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.auto_provision_user_merits() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.run_benchmarks_rollup() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.run_lifecycle_sweep() TO PUBLIC;
