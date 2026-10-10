-- Per-call Anthropic token telemetry: public.ai_call_telemetry
--
-- CONTEXT: Phase 02 (AI Token & Cost Optimization) right-sizes per-feature/per-tier
-- maxTokens budgets. Two truncation regressions (LinkedIn 2026-07-09, Career Compass
-- 2026-07-17) were only discovered AFTER they broke a paying user's analysis, because
-- nothing recorded how close each Anthropic call came to its output cap.
--
-- This table is PERMANENT PRODUCTION INSTRUMENTATION, not measurement scaffolding for
-- this phase. It stays after the phase closes so "output approaching max_tokens" is
-- visible as a trend, before it becomes a 422 + Merit refund.
--
-- PRIVACY / SCOPE GUARD: counts and identifiers ONLY. No prompt text, no response text.
-- `output_chars` is a character COUNT, never the output itself. This table must never
-- hold resume, LinkedIn profile, or any other user content. Additive: no existing table,
-- policy, or grant is modified.

-- 1. The table.
--    Design constraints (each load-bearing, do not "tidy" them away):
--    * `user_id` carries NO foreign key. The repo added user_deletion_cascade_fks
--      (20260719120000) plus an auth-delete cleanup trigger (20260719120001); an FK here
--      would either cascade-delete measurement history or block user deletion.
--    * `stop_reason` is plain text, NOT an enum and NOT CHECK-constrained. The
--      constrained-output (outputSchema) path may report a different stop vocabulary and
--      we must record whatever the API actually said rather than reject the row.
--    * `max_tokens` stores the CLAMPED effective value (anthropic.ts clampedMaxTokens),
--      not the caller's raw request — otherwise every headroom figure would be wrong.
CREATE TABLE IF NOT EXISTS public.ai_call_telemetry (
  id                          bigserial   PRIMARY KEY,
  created_at                  timestamptz NOT NULL DEFAULT now(),

  -- context (threaded from the calling edge function)
  feature                     text        NOT NULL,
  tier                        text        NOT NULL,
  call_name                   text        NOT NULL,
  attempt                     smallint    NOT NULL DEFAULT 1,
  req_id                      text        NULL,
  user_id                     uuid        NULL,

  -- model + budget
  model                       text        NOT NULL,
  max_tokens                  integer     NOT NULL,

  -- usage (nullable: absent on HTTP failure)
  input_tokens                integer     NULL,
  output_tokens               integer     NULL,
  cache_creation_input_tokens integer     NULL,
  cache_read_input_tokens     integer     NULL,
  stop_reason                 text        NULL,

  -- outcome + timing
  ok                          boolean     NOT NULL,
  http_status                 integer     NULL,
  duration_ms                 integer     NOT NULL,
  ttfb_ms                     integer     NULL,
  output_chars                integer     NULL,

  -- derived, generated so report SQL and near-cap alerting never recompute
  headroom_pct                numeric     GENERATED ALWAYS AS (
    CASE WHEN output_tokens IS NULL OR max_tokens = 0 THEN NULL
         ELSE round(100.0 * (1.0 - output_tokens::numeric / max_tokens), 2) END
  ) STORED,
  truncated                   boolean     GENERATED ALWAYS AS (stop_reason = 'max_tokens') STORED
);

COMMENT ON TABLE public.ai_call_telemetry IS
  'Phase 02 permanent instrument: one row per completed Anthropic call. Counts and identifiers only - never prompt or response text.';

-- 2. Indexes: recency scan, the per-cell (feature x tier x call) report, request
--    correlation, and the truncation watchlist.
CREATE INDEX IF NOT EXISTS ai_call_telemetry_created_at_idx
  ON public.ai_call_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_telemetry_cell_idx
  ON public.ai_call_telemetry (feature, tier, call_name, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_telemetry_req_id_idx
  ON public.ai_call_telemetry (req_id) WHERE req_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_call_telemetry_truncated_idx
  ON public.ai_call_telemetry (created_at DESC) WHERE truncated;

-- 3. RLS: service role only. Service role bypasses RLS, so edge inserts still work.
ALTER TABLE public.ai_call_telemetry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Service role only - no anon/authenticated access"
    ON public.ai_call_telemetry FOR ALL TO authenticated
    USING (false) WITH CHECK (false);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Belt and braces: no PostgREST-reachable grant at all.
REVOKE ALL ON public.ai_call_telemetry FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ai_call_telemetry_id_seq FROM anon, authenticated;

-- 5. Verify: table, generated columns, RLS, and the deny-all policy all landed.
DO $$
DECLARE
  v_rls      boolean;
  v_policies integer;
  v_generated integer;
BEGIN
  IF to_regclass('public.ai_call_telemetry') IS NULL THEN
    RAISE EXCEPTION 'public.ai_call_telemetry was not created';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.ai_call_telemetry'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is not enabled on public.ai_call_telemetry';
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'ai_call_telemetry';
  IF v_policies < 1 THEN
    RAISE EXCEPTION 'deny-all policy missing on public.ai_call_telemetry';
  END IF;

  SELECT count(*) INTO v_generated
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ai_call_telemetry'
    AND is_generated = 'ALWAYS'
    AND column_name IN ('headroom_pct', 'truncated');
  IF v_generated <> 2 THEN
    RAISE EXCEPTION 'expected 2 generated columns (headroom_pct, truncated), found %', v_generated;
  END IF;

  RAISE NOTICE 'public.ai_call_telemetry active; RLS on, % policy/policies, 2 generated columns', v_policies;
END $$;

-- 6. RETENTION POLICY (OPERATOR-RUN, intentionally NOT automated).
--    Keep 180 days. At ~14 rows per analysis and current traffic this table grows by
--    hundreds of rows/month, so no pg_cron job is warranted; building pruning
--    infrastructure would be scope creep for this phase. Run manually when needed:
--
--    DELETE FROM public.ai_call_telemetry WHERE created_at < now() - interval '180 days';
