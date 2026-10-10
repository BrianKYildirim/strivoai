-- Phase 26 · Plan 01 — async-job-merit-refund-wiring (MER-11).
--
-- Adds the deduction handle that workers (process-resume-analysis-job,
-- process-career-analysis-job) need to call `refund_merits` on terminal
-- failure. Nullable to remain backward-compatible with rows queued before
-- this migration (D-09 worker short-circuit handles those gracefully).
--
-- Re-runnability:
--   * ADD COLUMN IF NOT EXISTS — safe to re-apply.
--   * COMMENT ON COLUMN — idempotent.
-- Roll-forward only: no DROP, no destructive ALTER. If a rollback is
-- required, write a new forward migration.

ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS merit_transaction_id uuid NULL;

COMMENT ON COLUMN public.analysis_jobs.merit_transaction_id IS
  'Phase 26 MER-11: deduction_id returned by check_and_deduct_merits RPC '
  'and persisted by submit-{resume,career}-analysis-job. Read by '
  'process-{resume,career}-analysis-job to call refund_merits on terminal '
  'failure. NULL for rows queued before migration 20260429000000 — workers '
  'short-circuit on NULL (D-09). No FK to merit_transactions: txid is the '
  'shared deduction_id stored in metadata->>"deduction_id" (1-2 rows per '
  'deduction, see migration 20260415000000:79,122-131).';

-- Post-apply verification (run in Supabase SQL editor or via psql):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'analysis_jobs'
--     AND column_name = 'merit_transaction_id';
-- Expected: ('merit_transaction_id', 'uuid', 'YES')
