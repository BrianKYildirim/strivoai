-- Phase 29 · 29-03 · HIST-01 / CACHE-10 / NFR-01 — usage_tracking.analysis_id + record_ai_usage extension.
--
-- Sections:
--   §1  ADD COLUMN  public.usage_tracking.analysis_id uuid NULL  (no FK — D-16)
--   §2  COMMENT ON COLUMN  documents loose-link semantics
--   §3  CREATE OR REPLACE FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid)
--   §4  REVOKE ALL / GRANT EXECUTE on the new 4-arg overload
--   §5  Verification DO-block (column shape + 4-arg overload + SECURITY DEFINER hardening)
--
-- Re-runnability (NFR-01):
--   * `ADD COLUMN IF NOT EXISTS` is idempotent.
--   * `CREATE OR REPLACE FUNCTION` with a NEW signature (4 args) creates a
--     separate overload — Postgres dispatches by arg count, so the existing
--     3-arg `record_ai_usage` remains callable until a future migration
--     explicitly drops it.
--   * No destructive removals or cascades. Roll-forward only.

-- §1 ─────────────────────────────────────────────────────────────────────────
-- Additive nullable column. NO foreign key per D-16: the referenced row lives
-- in a different table depending on `action_type` (resumes / analysis_results
-- / linkedin_grades / saved_jobs / interview_quizzes), so a single-target FK
-- cannot model the relationship. Phase 36 filters orphans at query time via
-- LEFT JOIN with NULL check.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS analysis_id uuid NULL;

-- §2 ─────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.usage_tracking.analysis_id IS
  'Phase 29 HIST-01 / CACHE-10: loose link to the per-feature analysis row '
  'whose creation or cache-hit produced this usage_tracking entry. The '
  'referenced row lives in one of `resumes`, `analysis_results`, '
  '`linkedin_grades`, `saved_jobs`, or `interview_quizzes` depending on '
  '`action_type`. There is intentionally NO FK constraint (D-16) because a '
  'single-target FK cannot model the polymorphic relationship; Phase 36 '
  'filters orphans at query time via LEFT JOIN with NULL check. Plan 29-06 '
  'populates this on every cache-hit write in the `withMerits` precheck-hit '
  'path (CACHE-10 / D-13). Migrations apply additively only — roll-forward.';

-- §3 ─────────────────────────────────────────────────────────────────────────
-- New 4-arg overload of record_ai_usage. Body mirrors the original 3-arg
-- function (20251222220418:148-169) verbatim, with two additions:
--   * Accepts `p_analysis_id uuid DEFAULT NULL` (4th positional param).
--   * INSERT column list and VALUES tuple include `analysis_id` (= p_analysis_id).
-- Returns BOOLEAN — identical to the 3-arg signature.
-- search_path form is preserved (`SET search_path = public`) to match the
-- existing function's hardening style (per plan: do not change it).
-- The existing 3-arg `record_ai_usage(p_user_id, p_action_type, p_credits)`
-- is left in place — Postgres dispatches by arg count, so existing 3-arg
-- callers (every current edge function) continue to compile and run
-- unchanged across the migration window (mitigates T-29-RPC-BCOMPAT). A
-- future migration may remove the 3-arg signature once all callers move
-- to the 4-arg form; this migration does not perform that removal.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_user_id uuid,
  p_action_type ai_action_type,
  p_credits integer DEFAULT 1,
  p_analysis_id uuid DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  billing_start DATE;
BEGIN
  billing_start := public.get_billing_period_start(p_user_id);

  INSERT INTO public.usage_tracking (user_id, action_type, credits_consumed, billing_period_start, analysis_id)
  VALUES (p_user_id, p_action_type, p_credits, billing_start, p_analysis_id);

  RETURN TRUE;
END;
$$;

-- §4 ─────────────────────────────────────────────────────────────────────────
-- Lock the new 4-arg overload down to authenticated + service_role only
-- (mitigates T-29-RPC-PRIV; mirrors Phase 11 anti-search-path-injection
-- pattern from 20260415000000_merit_rpcs.sql:461-462).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(uuid, ai_action_type, integer, uuid) TO authenticated, service_role;

-- §5 ─────────────────────────────────────────────────────────────────────────
-- Apply-time verification (D-21 style). Any mismatch RAISES EXCEPTION and
-- rolls back the whole migration so we never ship a half-applied schema.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_column_nullable text;
  v_overload_count  integer;
  v_secdef_count    integer;
BEGIN
  -- (a) analysis_id column exists on public.usage_tracking and is NULLABLE.
  SELECT is_nullable
    INTO v_column_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'usage_tracking'
     AND column_name  = 'analysis_id';

  IF v_column_nullable IS NULL THEN
    RAISE EXCEPTION
      'Phase 29 HIST-01 verification failed: column public.usage_tracking.analysis_id missing';
  END IF;

  IF v_column_nullable <> 'YES' THEN
    RAISE EXCEPTION
      'Phase 29 HIST-01 verification failed: public.usage_tracking.analysis_id is not nullable (is_nullable=%)',
      v_column_nullable;
  END IF;

  -- (b) The 4-arg record_ai_usage overload exists in public.
  SELECT COUNT(*)
    INTO v_overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'record_ai_usage'
     AND p.pronargs = 4;

  IF v_overload_count < 1 THEN
    RAISE EXCEPTION
      'Phase 29 CACHE-10 verification failed: 4-arg public.record_ai_usage overload missing (found %)',
      v_overload_count;
  END IF;

  -- (c) The 4-arg overload is SECURITY DEFINER (ASVS V4 / mitigates T-29-RPC-PRIV).
  SELECT COUNT(*)
    INTO v_secdef_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'record_ai_usage'
     AND p.pronargs = 4
     AND p.prosecdef = true;

  IF v_secdef_count < 1 THEN
    RAISE EXCEPTION
      'Phase 29 CACHE-10 verification failed: 4-arg public.record_ai_usage overload is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Phase 29 HIST-01 / CACHE-10 verification passed';
END $$;
