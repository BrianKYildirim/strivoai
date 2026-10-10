-- DB-05 (Plan 08-03): explicit deny-all policy for the service-role-only table stripe_webhook_events.
--
-- Symptom (advisor: rls_enabled_no_policy, INFO):
--   public.stripe_webhook_events has RLS ENABLED but ZERO policies. The advisor wants the
--   intent made explicit (RLS-on-no-policy already denies all non-service-role access,
--   but implicitly).
--
-- Root cause:
--   stripe_webhook_events was created (20260412000000_stripe_migration.sql:29-32) with
--   "RLS enabled with NO permissive policies. Service role bypasses RLS. Anon / authenticated
--   roles have zero access by default." The implicit deny is correct; the advisor only flags
--   the absence of an explicit policy.
--
-- IMPORTANT (SEC-06 distinction):
--   20260412000000:31 warns "DO NOT add any permissive CREATE POLICY here -- that is the
--   SEC-06 Paddle bug." This policy is the OPPOSITE: a RESTRICTIVE deny
--   (USING (false) WITH CHECK (false)) for the authenticated role. It grants NOTHING -- it
--   only re-states the deny. It does NOT re-introduce the SEC-06 over-permissive bug.
--
-- Zero-change rationale:
--   service_role BYPASSES RLS, so the webhook-idempotency writer (stripe-webhook-handler via
--   service_role) is unaffected. Adding an explicit `authenticated USING (false)
--   WITH CHECK (false)` policy only RE-STATES the already-effective deny for authenticated/anon
--   -- no caller depends on authenticated access (read-map: zero src/** runtime reads of
--   stripe_webhook_events; the only src/ hit is the generated src/integrations/supabase/types.ts
--   type declaration). Therefore effective access is identical before and after -> provably
--   zero observable change.
--
-- Re-runnability (NFR-01): wrapped in a duplicate_object guard so re-apply is a no-op.

-- ── FORWARD ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.stripe_webhook_events FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── ROLLBACK (DB-06) ──────────────────────────────────────────────────────────
-- Restores the captured prior state (RLS enabled, zero policies):
--   DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.stripe_webhook_events;
