-- Phase 42 Layer 3: Behavior + Improvement Tracking tables + RPCs.
-- REQ-IDs: DB-REC-01, DB-REC-02, DB-EDT-01, DB-EDT-03, DB-USE-01
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN MIGRATION (fenced comment — do not run in production without operator sign-off)
-- ─────────────────────────────────────────────────────────────────────────────
-- REVOKE ALL ON FUNCTION public.record_feature_usage(text, text) FROM PUBLIC;
-- DROP FUNCTION IF EXISTS public.record_feature_usage(text, text);
-- REVOKE ALL ON FUNCTION public.record_recommendations_shown(uuid[]) FROM PUBLIC;
-- DROP FUNCTION IF EXISTS public.record_recommendations_shown(uuid[]);
-- DROP TABLE IF EXISTS public.feature_usage;
-- DROP TABLE IF EXISTS public.user_edits;
-- DROP TABLE IF EXISTS public.recommendations;
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Privacy / PII contract (DB-EDT-03):
--   original_text, suggested_text, final_user_text on public.user_edits are
--   user-PII tier (same sensitivity as linkedin_pdf_content / resume text).
--   CASCADE chain: auth.users → recommendations (user_id FK) → user_edits
--   (rec_id FK) ensures account deletion removes all behavior data atomically.
--   GDPR export must include recommendations + user_edits for each user.
--   A user-initiated "delete my behavior trail" UI is deferred; cascade via
--   account delete is the deletion path for this phase.
--
-- RLS contract:
--   All 3 tables are service-role-write only (no INSERT/UPDATE/DELETE user
--   policies — service role bypasses RLS via getServiceClient(), same pattern
--   as analysis_cache). User-authenticated clients get SELECT access to their
--   own rows only (SELECT-own per auth.uid() = user_id or equivalent join).
--   This is the SEC-06 anti-pattern avoidance.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public.recommendations  (DB-REC-01)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recommendations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature          text        NOT NULL
                                CHECK (feature IN (
                                  'resume_analysis',
                                  'linkedin_grading',
                                  'career_compass',
                                  'recruiting_lens'
                                )),
  suggestion_type  text        NOT NULL,
  target_ref_type  text
                                CHECK (target_ref_type IS NULL OR target_ref_type IN (
                                  'bullet',
                                  'section',
                                  'version',
                                  'generic'
                                )),
  target_ref_id    uuid,
  suggestion_text  text        NOT NULL,
  source_version_id uuid,
  shown_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recommendations IS
  'Phase 42 L3 DB-REC-01: one row per (analyze run, suggestion). Service-role writes only from extract-analysis-structure worker. authenticated SELECTs RLS-scoped to auth.uid() = user_id. shown_at is NULL on insert; updated via record_recommendations_shown() SECURITY DEFINER RPC on first paint (DB-REC-02).';
COMMENT ON COLUMN public.recommendations.user_id IS
  'Recommendation owner. Cascades to user_edits.rec_id on DELETE. RLS predicate is auth.uid() = user_id.';
COMMENT ON COLUMN public.recommendations.target_ref_type IS
  'Enum: bullet | section | version | generic. Resolves target_ref_id to the appropriate Layer 2 table row (resume_bullets.id for bullet, resume_sections.id for section, resume_versions.id / linkedin_versions.id for version).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public.user_edits  (DB-EDT-01)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_edits (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_id           uuid        NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE,
  action           text        NOT NULL
                                CHECK (action IN (
                                  'accepted',
                                  'rejected',
                                  'edited',
                                  'ignored'
                                )),
  original_text    text,
  suggested_text   text,
  final_user_text  text,
  score_before     integer,
  score_after      integer,
  score_delta      integer     GENERATED ALWAYS AS (score_after - score_before) STORED,
  edited_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_edits IS
  'Phase 42 L3 DB-EDT-01: user action per recommendation. RLS via recommendations.user_id parent join (see policy below). score_delta is a generated column: score_after - score_before. Service-role writes from frontend RPC path.';
COMMENT ON COLUMN public.user_edits.original_text IS
  'user-PII tier: resume content. CASCADE delete chain: auth.users → recommendations.user_id → user_edits.rec_id. Never log or expose to non-owning users.';
COMMENT ON COLUMN public.user_edits.suggested_text IS
  'user-PII tier: AI suggestion content verbatim. Same deletion/privacy contract as original_text.';
COMMENT ON COLUMN public.user_edits.final_user_text IS
  'user-PII tier: user-modified text. Same deletion/privacy contract as original_text.';
COMMENT ON COLUMN public.user_edits.score_delta IS
  'Generated column: score_after - score_before. Source of truth for improvement measurement. NULL when either score_before or score_after is NULL.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. public.feature_usage  (DB-USE-01)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_usage (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     text        NOT NULL
                           CHECK (feature IN (
                             'resume_analysis',
                             'linkedin_grading',
                             'career_compass',
                             'recruiting_lens'
                           )),
  action      text        NOT NULL
                           CHECK (action IN (
                             'open',
                             'submit',
                             'view_results',
                             'export'
                           )),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_usage IS
  'Phase 42 L3 DB-USE-01: lightweight 4-event funnel per feature. Writes via record_feature_usage() SECURITY DEFINER RPC (auth.uid() is the user_id — no user-supplied parameter). authenticated SELECTs RLS-scoped to auth.uid() = user_id. 4 features × 4 actions.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ENABLE ROW LEVEL SECURITY on all 3 tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_edits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_usage   ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS policies — SELECT-own only. NO INSERT/UPDATE/DELETE policies.
--    Service role bypasses RLS for all writes (SEC-06 anti-pattern avoidance).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS recommendations_select_own ON public.recommendations;
CREATE POLICY recommendations_select_own
  ON public.recommendations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- user_edits RLS is enforced via the parent recommendations row's user_id.
-- The subquery join inherits the same user-ownership guarantee without
-- duplicating the user_id column on user_edits.
DROP POLICY IF EXISTS user_edits_select_own ON public.user_edits;
CREATE POLICY user_edits_select_own
  ON public.user_edits
  FOR SELECT
  TO authenticated
  USING (
    rec_id IN (
      SELECT id FROM public.recommendations WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS feature_usage_select_own ON public.feature_usage;
CREATE POLICY feature_usage_select_own
  ON public.feature_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recommendations_user_feature_created
  ON public.recommendations (user_id, feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendations_source_version
  ON public.recommendations (source_version_id)
  WHERE source_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_edits_rec
  ON public.user_edits (rec_id);

CREATE INDEX IF NOT EXISTS idx_feature_usage_user_feature_occurred
  ON public.feature_usage (user_id, feature, occurred_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SECURITY DEFINER RPC: record_recommendations_shown  (DB-REC-02)
--    Updates shown_at on first impression. Idempotent: WHERE shown_at IS NULL.
--    User can only update their own rows (user_id = auth.uid() guard).
--    Returns count of rows actually updated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_recommendations_shown(
  rec_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.recommendations
     SET shown_at = now()
   WHERE shown_at IS NULL
     AND user_id  = auth.uid()
     AND id       = ANY(rec_ids);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.record_recommendations_shown(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_recommendations_shown(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.record_recommendations_shown(uuid[]) IS
  'Phase 42 L3 DB-REC-02: SECURITY DEFINER RPC. Sets shown_at=now() on recommendations where shown_at IS NULL AND user_id=auth.uid() AND id=ANY(rec_ids). Idempotent — WHERE shown_at IS NULL means repeat calls are no-ops. Returns count of rows updated. Called from frontend Results page on first paint.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SECURITY DEFINER RPC: record_feature_usage  (DB-USE-01)
--    Inserts a feature_usage row scoped to auth.uid().
--    No user_id parameter — RPC reads auth.uid() itself (prevents spoofing).
--    feature + action validated by the CHECK constraints on the table.
--    Returns the new row id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_feature_usage(
  p_feature text,
  p_action  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id  uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO public.feature_usage (user_id, feature, action)
  VALUES (v_uid, p_feature, p_action)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_feature_usage(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_feature_usage(text, text) TO authenticated;

COMMENT ON FUNCTION public.record_feature_usage(text, text) IS
  'Phase 42 L3 DB-USE-01: SECURITY DEFINER RPC. Inserts a feature_usage row for auth.uid() — no user_id param to prevent spoofing. p_feature must be in the 4-feature enum; p_action must be in the 4-action enum (both enforced by table CHECK constraints). Raises EXCEPTION if called without a valid session.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. DO $$ verification block
--    Raises EXCEPTION and rolls back if any artifact is missing or misconfigured.
--    Mirrors the Phase 29 analysis_cache verification pattern.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls_recs     boolean;
  v_rls_edits    boolean;
  v_rls_usage    boolean;
  v_policy_count integer;
  v_write_policy integer;
  v_rpc_count    integer;
  v_sec_def      boolean;
  v_generated    boolean;
BEGIN
  -- 9.1 All 3 tables exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'recommendations'
  ) THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: public.recommendations table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'user_edits'
  ) THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: public.user_edits table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'feature_usage'
  ) THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: public.feature_usage table missing';
  END IF;

  -- 9.2 RLS enabled on all 3 tables
  SELECT relrowsecurity INTO v_rls_recs
    FROM pg_class
   WHERE relname = 'recommendations' AND relnamespace = 'public'::regnamespace;

  IF v_rls_recs IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: RLS not enabled on recommendations';
  END IF;

  SELECT relrowsecurity INTO v_rls_edits
    FROM pg_class
   WHERE relname = 'user_edits' AND relnamespace = 'public'::regnamespace;

  IF v_rls_edits IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: RLS not enabled on user_edits';
  END IF;

  SELECT relrowsecurity INTO v_rls_usage
    FROM pg_class
   WHERE relname = 'feature_usage' AND relnamespace = 'public'::regnamespace;

  IF v_rls_usage IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: RLS not enabled on feature_usage';
  END IF;

  -- 9.3 Exactly 3 SELECT policies, 1 per table
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('recommendations', 'user_edits', 'feature_usage')
     AND cmd = 'SELECT';

  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: expected 3 SELECT policies, found %', v_policy_count;
  END IF;

  -- 9.4 Zero INSERT/UPDATE/DELETE policies on L3 tables
  SELECT count(*) INTO v_write_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('recommendations', 'user_edits', 'feature_usage')
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  IF v_write_policy <> 0 THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: expected 0 write policies, found % (SEC-06 violation)', v_write_policy;
  END IF;

  -- 9.5 Both SECURITY DEFINER RPCs exist
  SELECT count(*) INTO v_rpc_count
    FROM pg_proc
   WHERE proname IN ('record_recommendations_shown', 'record_feature_usage')
     AND pronamespace = 'public'::regnamespace;

  IF v_rpc_count < 2 THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: expected 2 RPCs, found %', v_rpc_count;
  END IF;

  -- 9.6 Both RPCs are SECURITY DEFINER
  SELECT (count(*) = 2) INTO v_sec_def
    FROM pg_proc
   WHERE proname IN ('record_recommendations_shown', 'record_feature_usage')
     AND pronamespace = 'public'::regnamespace
     AND prosecdef = TRUE;

  IF v_sec_def IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: one or both RPCs are not SECURITY DEFINER';
  END IF;

  -- 9.7 score_delta is a generated column on user_edits
  SELECT (attgenerated <> '') INTO v_generated
    FROM pg_attribute
   WHERE attrelid = 'public.user_edits'::regclass
     AND attname  = 'score_delta'
     AND attgenerated <> '';

  IF v_generated IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Phase 42 L3 verification failed: score_delta is not a GENERATED column on user_edits';
  END IF;

  RAISE NOTICE 'Phase 42 L3 (DB-REC-01/02, DB-EDT-01/03, DB-USE-01) verification passed: 3 tables, 3 SELECT policies, 0 write policies, 2 SECURITY DEFINER RPCs, score_delta generated column confirmed';
END $$;
