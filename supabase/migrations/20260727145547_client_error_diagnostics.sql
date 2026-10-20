-- Privacy-safe CLIENT device diagnostics: public.client_error_diagnostics
--
-- CONTEXT: Phase 03 (Cross-Device Reliability and Compatibility), requirements
-- XLOG-01 / XLOG-02. The operative question this table exists to answer is
-- "which browser/OS/device combinations fail, at which lifecycle stage, on which
-- app version" - a question console logs structurally cannot answer, because the
-- console lives on the failing device and never comes back to us (D-11).
--
-- DISTINCT FROM public.ai_call_telemetry (D-12). That table is Phase 02's and is
-- deliberately NOT extended here:
--   * different actor      - ai_call_telemetry records the SERVER's Anthropic calls;
--                            this table records the BROWSER's own failures.
--   * different lifecycle  - one row per completed model call vs. one row per
--                            client-side failure (failures only, never successes).
--   * different retention  - 180 days there, 90 days here.
-- Phase 02 is in flight under separate ownership; this migration is additive and
-- modifies no existing object, policy or grant.
--
-- PRIVACY GUARD (D-13 / XLOG-02): failures only. Identifiers, enums and counts.
-- This table must NEVER hold resume or LinkedIn content, a document, an uploaded
-- filename, a stack trace, a raw error string, or a raw IP address. The ingest
-- edge function's allowlist is the runtime enforcement point; THIS SCHEMA IS THE
-- STRUCTURAL BACKSTOP - there is simply no column such a value could land in.
-- `error_name` is the error constructor name only (e.g. 'TypeError'). `user_agent`
-- is the single high-cardinality string and is bounded server-side. The client
-- address is stored only as `ip_hash`: a date-salted, truncated hash written
-- server-side. There is no `ip` column at all, so an ingest-side mistake cannot
-- persist an address.

-- 1. The table.
--    Design constraints (each load-bearing, do not "tidy" them away):
--    * `user_id` and `run_id` carry NO foreign key, mirroring ai_call_telemetry's
--      rationale: the repo added user_deletion_cascade_fks (20260719120000) plus an
--      auth-delete cleanup trigger (20260719120001), so an FK here would either
--      cascade-delete the failure history we are trying to study or - far worse -
--      block a user deletion outright.
--    * Only the fields the client can ALWAYS supply are NOT NULL. Every optional
--      device signal is nullable so a fire-and-forget insert (D-11) can never fail
--      merely because a browser withheld a capability (e.g. connection_type is
--      Chromium-only). A diagnostics write must never be able to raise.
--    * `error_category` is plain text, not an enum and not CHECK-constrained: the
--      taxonomy is coerced to a closed set server-side, and a schema-level
--      constraint would reject - and therefore lose - the very novel failure a new
--      device class is telling us about.
CREATE TABLE IF NOT EXISTS public.client_error_diagnostics (
  id               bigserial   PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  event_id         uuid        NULL,             -- client-generated; dedup aid

  -- what failed (always supplied by the client seam)
  app_version      text        NOT NULL,         -- build stamp (D-18)
  surface          text        NOT NULL,         -- one of the 11 audit surfaces
  lifecycle_stage  text        NOT NULL,
  error_category   text        NOT NULL,         -- closed set, coerced server-side
  error_name       text        NULL,             -- constructor name only
  script_origin    text        NULL,             -- first-party | browser-extension | third-party | unknown
  is_extension     boolean     NULL,
  capability_tier  text        NULL,             -- supported | degraded

  -- where it failed (all nullable by design; see note above)
  browser          text        NULL,
  browser_version  text        NULL,
  engine           text        NULL,             -- blink | gecko | webkit
  os               text        NULL,
  os_version       text        NULL,
  device_type      text        NULL,             -- desktop | tablet | mobile
  viewport_w       integer     NULL,
  viewport_h       integer     NULL,
  dpr              numeric     NULL,
  user_agent       text        NULL,             -- bounded server-side
  online           boolean     NULL,
  connection_type  text        NULL,             -- Chromium-only; nullable by design

  -- correlation (no FK, see note above)
  user_id          uuid        NULL,
  run_id           uuid        NULL,
  ip_hash          text        NULL              -- salted + truncated hash, NEVER an address
);

COMMENT ON TABLE public.client_error_diagnostics IS
  'Phase 03 client device diagnostics: one row per CLIENT-SIDE FAILURE. Enums, counts and identifiers only - never user documents, never PII, never a raw address or stack.';

-- 2. Indexes: recency scan, the per-cell (browser x os x device_type) report that
--    makes the "which device cells fail" question answerable, the category/stage
--    triage view, and the per-release regression view.
CREATE INDEX IF NOT EXISTS ced_created_at_idx
  ON public.client_error_diagnostics (created_at DESC);
CREATE INDEX IF NOT EXISTS ced_cell_idx
  ON public.client_error_diagnostics (browser, os, device_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ced_category_idx
  ON public.client_error_diagnostics (error_category, lifecycle_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS ced_version_idx
  ON public.client_error_diagnostics (app_version, created_at DESC);

-- 3. RLS: service role only. Writes arrive ONLY through the ingest edge function's
--    service client, which bypasses RLS. The browser never touches this table via
--    PostgREST, authenticated or not - the fleet's failure map is not user-readable.
ALTER TABLE public.client_error_diagnostics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.client_error_diagnostics FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Belt and braces: no PostgREST-reachable grant at all.
--    Revoking from `public` alone is NOT sufficient in this project - Supabase's
--    default grants leave `anon` and `authenticated` holding privileges on a newly
--    created object, so both roles must be named explicitly, on the table AND on
--    the bigserial's sequence.
REVOKE ALL ON public.client_error_diagnostics FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.client_error_diagnostics_id_seq FROM anon, authenticated;

-- 5. Verify: table, RLS and the deny-all policy all landed. If any assertion fails
--    the migration aborts rather than leaving a browser-readable diagnostics table.
DO $$
DECLARE
  v_rls      boolean;
  v_policies integer;
BEGIN
  IF to_regclass('public.client_error_diagnostics') IS NULL THEN
    RAISE EXCEPTION 'public.client_error_diagnostics was not created';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.client_error_diagnostics'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is not enabled on public.client_error_diagnostics';
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'client_error_diagnostics';
  IF v_policies < 1 THEN
    RAISE EXCEPTION 'deny-all policy missing on public.client_error_diagnostics';
  END IF;

  RAISE NOTICE 'public.client_error_diagnostics active; RLS on, % policy/policies', v_policies;
END $$;

-- 6. RETENTION POLICY (OPERATOR-RUN, intentionally NOT automated).
--    Keep 90 days. Because only FAILURES are recorded (D-13), volume scales with
--    breakage rather than traffic, so no pg_cron job is warranted; building pruning
--    infrastructure would be scope creep. Mirrors ai_call_telemetry. Run manually:
--
--    DELETE FROM public.client_error_diagnostics WHERE created_at < now() - interval '90 days';
