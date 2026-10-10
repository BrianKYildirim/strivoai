-- Phase 9 (Plan 09-03) PERF-02 / advisor: auth_rls_initplan.
-- Wrap every per-row auth.uid() call in public RLS policies as (select auth.uid()) so
-- Postgres evaluates it ONCE per query (initPlan) instead of once per row. This is the
-- exact Supabase-recommended rewrite; it changes ONLY the evaluation plan, NOT the truth
-- value of any USING/WITH CHECK predicate -> identical row visibility, zero-observable.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- LIVE-CATALOG FACT (re-confirmed read-only on preview 2026-06-25):
--   71 public RLS policies; EXACTLY 62 reference auth.uid(); ZERO reference auth.role(),
--   auth.jwt(), auth.email(), or current_setting(); ZERO are already wrapped. So the rewrite
--   is uniform: auth.uid() -> (select auth.uid()) everywhere it appears (including inside
--   has_role(auth.uid(), 'admin'::app_role), which becomes has_role((select auth.uid()), ...)).
--   This runs AFTER 20260608000012 dropped 6 exact-duplicate policies, so 56 survivors wrap.
--
-- Method (catalog-driven, idempotent). A DO-block selects every public policy that still has
--   a BARE auth.uid() and rewrites it in place with ALTER POLICY -- which preserves the policy's
--   cmd, roles (TO), and PERMISSIVE/RESTRICTIVE exactly; only the USING/WITH CHECK expression
--   text changes (no window where the policy is absent).
--
-- "BARE" detection (rendering-robust): Postgres re-renders a stored (select auth.uid()) as
--   ( SELECT auth.uid() AS uid). So "wrapped" is matched case-insensitively as
--   'select\s+auth\.uid\(\)', and a policy is BARE iff its total count of 'auth.uid()' exceeds
--   its count of the wrapped form. This makes the FORWARD selection idempotent (already-wrapped
--   policies are not re-selected -> no double-wrap) and the assertion correct.

-- == FORWARD ====================================================================
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND ( regexp_count(coalesce(qual,''),       'auth\.uid\(\)') > regexp_count(coalesce(qual,''),       'select\s+auth\.uid\(\)', 1, 'i')
          OR regexp_count(coalesce(with_check,''), 'auth\.uid\(\)') > regexp_count(coalesce(with_check,''), 'select\s+auth\.uid\(\)', 1, 'i') )
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I%s%s',
      r.policyname, r.tablename,
      CASE WHEN r.qual       IS NOT NULL THEN format(' USING (%s)',      regexp_replace(r.qual,       'auth\.uid\(\)', '(select auth.uid())', 'g')) ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g')) ELSE '' END
    );
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'auth_rls_initplan: wrapped auth.uid() in (select ...) for % policies', n;
END $$;

-- == VERIFICATION (read-only assertion: no bare auth.uid() remains) =============
DO $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v
    FROM pg_policies
   WHERE schemaname = 'public'
     AND ( regexp_count(coalesce(qual,''),       'auth\.uid\(\)') > regexp_count(coalesce(qual,''),       'select\s+auth\.uid\(\)', 1, 'i')
        OR regexp_count(coalesce(with_check,''), 'auth\.uid\(\)') > regexp_count(coalesce(with_check,''), 'select\s+auth\.uid\(\)', 1, 'i') );
  IF v <> 0 THEN
    RAISE EXCEPTION 'auth_rls_initplan: % public policy/policies still have an unwrapped auth.uid()', v;
  END IF;
  RAISE NOTICE 'auth_rls_initplan: every public policy wraps auth.uid() in (select ...)';
END $$;

-- == ROLLBACK (DB-06) ==========================================================
-- Symmetric un-wrap: turn the rendered wrapped form ( SELECT auth.uid() AS uid) back into a
-- bare auth.uid() on every public policy that carries it, via ALTER POLICY (cmd/roles/permissive
-- preserved). Restores the exact pre-migration expression text (the baseline had ZERO wrapped).
--   DO $$
--   DECLARE r record;
--   BEGIN
--     FOR r IN
--       SELECT policyname, tablename, qual, with_check
--         FROM pg_policies
--        WHERE schemaname = 'public'
--          AND ( regexp_count(coalesce(qual,''),       'select\s+auth\.uid\(\)', 1, 'i') > 0
--             OR regexp_count(coalesce(with_check,''), 'select\s+auth\.uid\(\)', 1, 'i') > 0 )
--     LOOP
--       EXECUTE format(
--         'ALTER POLICY %I ON public.%I%s%s',
--         r.policyname, r.tablename,
--         CASE WHEN r.qual       IS NOT NULL THEN format(' USING (%s)',      regexp_replace(r.qual,       '\(\s*select\s+auth\.uid\(\)\s+as\s+\w+\s*\)', 'auth.uid()', 'gi')) ELSE '' END,
--         CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', regexp_replace(r.with_check, '\(\s*select\s+auth\.uid\(\)\s+as\s+\w+\s*\)', 'auth.uid()', 'gi')) ELSE '' END
--       );
--     END LOOP;
--   END $$;
