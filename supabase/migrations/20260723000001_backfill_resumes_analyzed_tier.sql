-- ═════════════════════════════════════════════════════════════════════════════
-- 260723-2b0 · Task 3 — backfill resumes.analyzed_tier from the analysis_results mirror
--
-- WHAT / WHY
--   analyze-resume writes best-effort mirror rows into analysis_results with
--   raw_response.metadata.tier (index.ts:52-58) that NOTHING in src/ reads. Task 1 added
--   the queryable resumes.analyzed_tier column; this migration recovers historical tier
--   from that mirror so pre-existing analyzed rows are not all "unknown".
--
-- NORMALIZATION (D-6)  — the column carries ONLY free/elite
--   Historical metadata.tier can be 'pro'. resumes.analyzed_tier's CHECK forbids 'pro'
--   (D-6), and the runtime collapses pro -> elite via normalizeActiveTier, so this backfill
--   collapses 'pro' -> 'elite' in the SELECT. Without the collapse the CHECK would reject
--   those rows and abort the migration.
--
-- IDEMPOTENT / NON-DESTRUCTIVE
--   * `AND r.analyzed_tier IS NULL` — re-runnable, and it can NEVER overwrite a value a live
--     analysis (Task 4) has since stamped.
--   * `AND r.grading_data IS NOT NULL` — only rows that actually carry an analysis.
--   * source_reference is regex-guarded to UUID shape before the ::uuid cast; a non-UUID
--     legacy value would otherwise abort the whole statement.
--
-- COVERAGE IS EXPECTED TO BE < 100%
--   The mirror insert is best-effort and can be NULL (index.ts:142). The residual NULL set
--   is exactly what D-4's asymmetric NULL semantics handle (NULL matches any tier for cache
--   reuse, but never triggers the paid-rerun CTA). The RAISE NOTICE below records the
--   observed numbers.
--
-- ROLLBACK  (copy-paste — the operator MUST substitute the real apply timestamp)
-- ---------------------------------------------------------------------------
--   -- Scoped so it CANNOT erase tiers written by live analyses AFTER this migration ran.
--   -- Substitute <APPLY_TS> with this migration's actual apply time (UTC). Rolling back is
--   -- safe by construction: NULL means "unknown", which every consumer already handles (D-4).
--   BEGIN;
--   UPDATE public.resumes
--      SET analyzed_tier = NULL
--    WHERE analyzed_tier IS NOT NULL
--      AND analyzed_at < '<APPLY_TS>'::timestamptz;
--   COMMIT;
-- ---------------------------------------------------------------------------

WITH latest AS (
  SELECT DISTINCT ON (ar.source_reference)
         ar.source_reference::uuid AS resume_id,
         CASE ar.raw_response->'metadata'->>'tier'
           WHEN 'free' THEN 'free'
           ELSE 'elite'                      -- 'pro' and 'elite' both collapse (D-6)
         END AS tier
  FROM public.analysis_results ar
  WHERE ar.analysis_type = 'resume_analysis'
    AND ar.source_reference IS NOT NULL
    AND ar.source_reference ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND ar.raw_response->'metadata'->>'tier' IN ('free','pro','elite')
  ORDER BY ar.source_reference, ar.created_at DESC
)
UPDATE public.resumes r
   SET analyzed_tier = latest.tier
  FROM latest
 WHERE r.id = latest.resume_id
   AND r.analyzed_tier IS NULL
   AND r.grading_data IS NOT NULL;

-- Coverage report ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total   bigint;
  v_tiered  bigint;
  v_null    bigint;
  v_pro     bigint;
  v_pct     numeric;
BEGIN
  SELECT count(*) INTO v_total  FROM public.resumes WHERE grading_data IS NOT NULL;
  SELECT count(*) INTO v_tiered FROM public.resumes WHERE grading_data IS NOT NULL AND analyzed_tier IS NOT NULL;
  v_null := v_total - v_tiered;
  v_pct  := CASE WHEN v_total > 0 THEN round(100.0 * v_tiered / v_total, 1) ELSE 0 END;
  -- Rows whose historical metadata.tier was 'pro' and were therefore collapsed to 'elite'.
  SELECT count(*) INTO v_pro
    FROM public.analysis_results ar
    JOIN public.resumes r ON r.id::text = ar.source_reference
   WHERE ar.analysis_type = 'resume_analysis'
     AND ar.raw_response->'metadata'->>'tier' = 'pro'
     AND r.grading_data IS NOT NULL;

  RAISE NOTICE '[260723-2b0 backfill] analyzed resumes: %, now tiered: %, still NULL: %, coverage: %%%, pro-collapsed: %',
    v_total, v_tiered, v_null, v_pct, v_pro;
END $$;
