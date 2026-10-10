-- Rollback for 20260719000000_add_applications_analysis_id.sql
-- Dropping the column also drops applications_analysis_id_fkey and clears all
-- backfilled links. Fully reversible; no other table is touched.

DROP INDEX IF EXISTS public.applications_analysis_id_idx;

ALTER TABLE public.applications
  DROP COLUMN IF EXISTS analysis_id;
