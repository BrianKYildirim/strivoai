-- DB-05 (Plan 08-03): explicit deny-all policy for the service-role-only table alert_state.
--
-- Symptom (advisor: rls_enabled_no_policy, INFO):
--   public.alert_state has RLS ENABLED but ZERO policies. The advisor wants the
--   intent made explicit (RLS-on-no-policy already denies all non-service-role access,
--   but implicitly).
--
-- Root cause:
--   alert_state was created (20260416000000_merit_enforcement_observability.sql:68-75)
--   with "alter table ... enable row level security; -- No policies: service role only".
--   The implicit deny is correct; the advisor only flags the absence of an explicit policy.
--
-- Zero-change rationale:
--   service_role BYPASSES RLS, so the only accessor of this table is unaffected by any
--   policy. Adding an explicit `authenticated USING (false) WITH CHECK (false)` policy
--   only RE-STATES the already-effective deny for the authenticated/anon roles -- no caller
--   depends on authenticated access (read-map: zero src/** runtime reads of alert_state;
--   the only src/ hit is the generated src/integrations/supabase/types.ts type declaration).
--   Therefore effective access is identical before and after -> provably zero observable change.
--
-- Re-runnability (NFR-01): wrapped in a duplicate_object guard so re-apply is a no-op.

-- ── FORWARD ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.alert_state FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── ROLLBACK (DB-06) ──────────────────────────────────────────────────────────
-- Restores the captured prior state (RLS enabled, zero policies):
--   DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.alert_state;
