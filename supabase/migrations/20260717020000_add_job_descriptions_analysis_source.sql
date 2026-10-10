-- The Recruiting Lens extractor has always keyed idempotency on the originating
-- analysis_results row, but the Layer 4 table migration omitted that column.
-- Add the nullable source link without changing existing rows or retention.

ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS source_analysis_results_id uuid
  REFERENCES public.analysis_results(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_descriptions_user_source_analysis_uidx
  ON public.job_descriptions (user_id, source_analysis_results_id)
  WHERE source_analysis_results_id IS NOT NULL;
