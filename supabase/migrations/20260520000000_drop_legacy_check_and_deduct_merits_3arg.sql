-- Hotfix: resolve check_and_deduct_merits overload ambiguity (PostgREST dispatch).
--
-- Symptom (observed 2026-05-20, prod logs):
--   merit-gateway → "check_and_deduct_merits failed: Could not choose the best
--   candidate function between: public.check_and_deduct_merits(uuid, text, text)
--   [and] public.check_and_deduct_merits(uuid, text, text, text)"
--   → resume_analysis (and every Merit-gated feature) fails closed with a 500.
--
-- Root cause:
--   Two overloads of check_and_deduct_merits coexist:
--     (a) 3-arg (uuid, text, text)              — 20260415000000_merit_rpcs.sql:67
--     (b) 4-arg (uuid, text, text, text DEFAULT NULL)
--                                               — 20260512000003_merit_transactions_idempotency.sql:93
--   The gateway (merit-gateway.ts:201) calls the RPC with exactly THREE named
--   args { p_user_id, p_feature, p_tier }. Because overload (b)'s 4th param has
--   DEFAULT NULL, a 3-arg call satisfies BOTH signatures. Postgres treats them as
--   equally-good candidates and refuses to dispatch (SQLSTATE 42725). The Phase 29
--   migration's assumption that "Postgres dispatches by arg count, existing 3-arg
--   callers compile unchanged" does not hold for a DEFAULT-valued overload reached
--   via PostgREST named-argument calls.
--
-- Fix:
--   DROP the legacy 3-arg overload. The 4-arg overload is a strict functional
--   superset: with p_idempotency_key = NULL, its body short-circuits the
--   idempotency pre-check (20260512000003:118-133) and is otherwise byte-identical
--   to the old 3-arg body. After this drop, the gateway's 3-named-arg call binds
--   unambiguously to the 4-arg function with the default. No caller behavior
--   changes; no merits were lost (the ambiguous call errored at dispatch, before
--   any ledger write).
--
-- Roll-forward only (D-22): removal of a superseded function is expressed as this
-- new forward migration, not a destructive edit to an applied migration. The 4-arg
-- overload and its GRANTs (20260512000003:246-248) remain live and untouched.
--
-- Re-runnability (NFR-01): DROP FUNCTION IF EXISTS is safe to re-apply; the
-- verification DO-block is read-only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the legacy 3-arg overload (the ambiguity source).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.check_and_deduct_merits(uuid, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Verification: exactly ONE check_and_deduct_merits overload remains, and it
--    is the 4-arg SECURITY DEFINER signature the gateway now dispatches to.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total      integer;
  v_pronargs   smallint;
  v_prosecdef  boolean;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname      = 'check_and_deduct_merits';

  IF v_total <> 1 THEN
    RAISE EXCEPTION
      'Hotfix failed: expected exactly 1 check_and_deduct_merits overload after drop, found %',
      v_total;
  END IF;

  SELECT pronargs, prosecdef
    INTO v_pronargs, v_prosecdef
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname      = 'check_and_deduct_merits';

  IF v_pronargs <> 4 THEN
    RAISE EXCEPTION
      'Hotfix failed: surviving check_and_deduct_merits has % args, expected the 4-arg overload',
      v_pronargs;
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION
      'Hotfix failed: surviving check_and_deduct_merits is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Hotfix verification passed: single 4-arg SECURITY DEFINER check_and_deduct_merits remains';
END $$;
