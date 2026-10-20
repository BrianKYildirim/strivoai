-- Phase 03 · 03-01 · LIFE (D-05) — analysis_jobs Realtime enablement.
--
-- Purpose: Enable Supabase Realtime (postgres_changes) on analysis_jobs so the
-- Phase 3/5 lifecycle hook can subscribe to owner-scoped state transitions instead
-- of polling. Shipped DORMANT — no feature subscribes in Phase 3.
--
-- Two changes:
--   1. REPLICA IDENTITY FULL — so UPDATE payloads carry prior column values, which
--      the hook's diffing needs (A4). Default (primary-key-only) identity would omit
--      the old-row image.
--   2. ALTER PUBLICATION supabase_realtime ADD TABLE analysis_jobs — guarded against
--      re-run via pg_publication_tables (idempotent; skip if already a member).
--
-- Authorization (A3): Realtime postgres_changes authz rides the table's SELECT RLS.
-- The owner-SELECT policy "Users can view their own analysis jobs" already exists
-- (20260225160000:33-37, `auth.uid() = user_id`), so pushes are scoped to the owner —
-- fail-closed. We deliberately do NOT create a new RLS policy here. Whether an explicit
-- realtime policy is ALSO required (vs. the owner-SELECT policy sufficing) is verified
-- EMPIRICALLY on preview cimjltzovkahkqecpwgi in Task 3 (A3 empirical check).
--
-- Re-runnability (NFR-01): REPLICA IDENTITY FULL is idempotent; the publication ADD is
-- guarded; the verification DO-block is read-only. Safe to re-apply.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: (copy-paste inverse DDL — roll-forward preferred per CLAUDE.md)
--
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.analysis_jobs;
--   ALTER TABLE public.analysis_jobs REPLICA IDENTITY DEFAULT;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REPLICA IDENTITY FULL (A4: UPDATE payloads carry prior values for hook diffing).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_jobs REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add analysis_jobs to the supabase_realtime publication (guarded re-run).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'analysis_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_jobs;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification (read-only, idempotent).
--    (a) analysis_jobs is a member of supabase_realtime.
--    (b) the owner-SELECT RLS policy that scopes Realtime pushes is present (A3).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'analysis_jobs'
  ) THEN
    RAISE EXCEPTION
      'Phase 03 D-05 migration failed: analysis_jobs not in supabase_realtime publication';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'analysis_jobs'
      AND policyname = 'Users can view their own analysis jobs'
  ) THEN
    RAISE EXCEPTION
      'Phase 03 D-05 migration failed: owner-SELECT RLS policy "Users can view their own analysis jobs" missing — Realtime pushes would not be owner-scoped (A3 fail-closed)';
  END IF;

  RAISE NOTICE 'Phase 03 D-05 verification passed: analysis_jobs in supabase_realtime with REPLICA IDENTITY FULL and owner-SELECT RLS present';
END $$;
