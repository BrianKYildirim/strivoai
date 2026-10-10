-- Rate limit counters table and supporting RPC for fixed-window rate limiting.
--
-- Design decisions:
-- - Fixed-window algorithm: counters are keyed by (rate_key, window_start) so
--   each window bucket is isolated. Windows do not carry over.
-- - Atomic upsert via INSERT ... ON CONFLICT ... DO UPDATE prevents race conditions
--   in concurrent request handling without advisory locks.
-- - Service role only: RLS is enabled but no policies are added — only the
--   service role key bypasses RLS and may access this table.
-- - pg_cron cleanup runs hourly to prevent unbounded table growth. Counters older
--   than 2 hours are safe to delete (all fixed windows are <= 1 hour by default).

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  rate_key     TEXT    NOT NULL,
  window_start BIGINT  NOT NULL,
  counter      INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rate_key, window_start)
);

-- ── RPC ───────────────────────────────────────────────────────────────────────

-- Atomically increments the counter for (p_key, p_window_start) and returns
-- the new counter value. Creates the row if it doesn't exist yet.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key TEXT,
  p_window_start BIGINT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters (rate_key, window_start, counter)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (rate_key, window_start)
  DO UPDATE SET counter = rate_limit_counters.counter + 1
  RETURNING counter INTO v_counter;
  RETURN v_counter;
END;
$$;

-- ── Row-level security ────────────────────────────────────────────────────────

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed — only service_role accesses this table via RPC

-- ── pg_cron cleanup ───────────────────────────────────────────────────────────

-- Delete counters older than 2 hours every hour.
-- Keeps the table from growing unboundedly; all meaningful windows are <= 1 hour.
SELECT cron.schedule(
  'cleanup-rate-limit-counters',
  '0 * * * *',
  $$DELETE FROM public.rate_limit_counters WHERE window_start < EXTRACT(EPOCH FROM NOW() - INTERVAL '2 hours')::BIGINT$$
);
