-- ============================================================================
-- ai_call_telemetry_report.sql
-- ----------------------------------------------------------------------------
-- Re-runnable report queries for the AI token / cost measurement study
-- (Phase 02 — ai-token-cost-optimization). This file regenerates the entire
-- 02-MEASUREMENT-REPORT.md analysis directly from public.ai_call_telemetry, so
-- a future tuning pass RE-RUNS a query instead of RE-DERIVING an analysis.
--
-- Source of truth: public.ai_call_telemetry (migration 20260721000000).
-- One row per Anthropic call (NOT per analysis). req_id groups the calls of a
-- single analysis without exposing the production user_id or any input text.
--
-- WINDOW PARAMETER
-- ----------------------------------------------------------------------------
-- Every block filters on :window_start. Substitute it with the epoch cutoff you
-- are reporting on. For the Phase 02 report that is the Epoch 2 cutoff:
--
--   psql:   \set window_start '2026-07-24T13:46:58Z'
--   Supabase SQL editor / ad-hoc: replace every :window_start literal below with
--                                 timestamptz '2026-07-24T13:46:58Z'
--
-- The Epoch 2 cutoff is MANDATORY for the Phase 02 dataset: the prod table still
-- holds the 88 Epoch 1 rows (a contaminated earlier pass) and epochs must never
-- be mixed in one statistic (02-MEASUREMENT-LOG "MEASUREMENT RESTART — Epoch 2").
--
-- READ-ONLY. These are SELECTs plus one operator-run retention DELETE at the
-- very bottom (clearly fenced). Nothing here mutates data when run as-is.
--
-- ASSUMPTION A1 — RESOLVED (02-06, re-confirmed): input_tokens EXCLUDES cache
-- tokens. Evidence: LinkedIn elite rows report input_tokens 1,323/1,450 ALONGSIDE
-- cache_creation_input_tokens 4,647 on the SAME row — impossible if input_tokens
-- were inclusive. Therefore Block 3 prices input as the SUM of the three token
-- columns (input + cache_creation + cache_read); summing is additive, NOT double
-- counting. Had A1 gone the other way, the formula below would double-count the
-- cached prefix and overstate cost.
--
-- ASSUMPTION A4 — RESOLVED (02-06): every measured row uses model
-- 'claude-haiku-4-5-20251001' (no ANTHROPIC_MODEL_TEXT override), so the Haiku
-- 4.5 rates below apply to every cell.
--
-- Anthropic Claude Haiku 4.5 rates (official docs, 2026-07-21). The repo sends
-- 'anthropic-beta: prompt-caching-2024-07-31' with ephemeral cache_control, i.e.
-- a 5-MINUTE cache — so the cache WRITE rate is the 5-min write rate:
--   base input          $1.00 / MTok
--   5-min cache write   $1.25 / MTok
--   cache read (hit)    $0.10 / MTok
--   output              $5.00 / MTok
-- ============================================================================


-- ============================================================================
-- BLOCK 1 — RAW ROWS
-- Every call in the measurement window, one row per Anthropic call. This is the
-- audit trail behind every statistic in the report; an outlier in Block 2 can be
-- traced back to its exact raw row here and then to a run # in 02-MEASUREMENT-LOG
-- via req_id.
-- ============================================================================
SELECT
  created_at,
  created_at AT TIME ZONE 'America/Los_Angeles' AS created_at_pt,
  req_id,
  feature,
  tier,
  call_name,
  attempt,
  input_tokens,
  output_tokens,
  cache_creation_input_tokens,
  cache_read_input_tokens,
  max_tokens,
  stop_reason,
  truncated,
  headroom_pct,
  duration_ms,
  ttfb_ms,
  output_chars,
  ok,
  http_status
FROM public.ai_call_telemetry
WHERE created_at >= :window_start
ORDER BY created_at, req_id, call_name, attempt;


-- ============================================================================
-- BLOCK 2 — PER-CELL STATS
-- Grouped by (feature, tier, call_name). first-attempt clean rows only.
--
-- EXCLUSION 1 — attempt = 1 ONLY.
--   Rationale: the validation-aware retry runs at a DOUBLED effective cap
--   (analyze-resume/index.ts uses retryMaxTokens = min(baseMaxTokens * 2, 12000)),
--   so attempt-2 rows would skew BOTH the observed peak (they can emit more) and
--   headroom (they measure against a different cap). All report statistics are
--   scoped to attempt = 1, per 02-MEASUREMENT-LOG anomaly rule 4.
--
-- EXCLUSION 2 — utility extraction call names are dropped.
--   docx-extract / ocr-extract / docx-extract-legacy / ocr-extract-legacy are
--   DOCX/OCR text-extraction calls, NOT analysis calls. Including them would drag
--   the Career Compass per-cell means down and pollute the peak stats. (02-03
--   established these labels; the two "-legacy" variants are the "two others" the
--   plan refers to.) legacy-fallback-* and base-prior-analyses are likewise not
--   primary analysis cells and are excluded here.
--
-- NOTE on `cap`: the observed max_tokens in the window is the TEMP diagnostic
-- value, NOT the production cap. headroom_pct_at_peak below is therefore headroom
-- against the DIAGNOSTIC ceiling. The report recomputes headroom against the
-- pre-TEMP production caps (see 02-MEASUREMENT-REPORT.md §2).
--
-- NOTE on truncated cells: a truncated first-attempt row (stop_reason
-- 'max_tokens') means appetite >= cap; the cell's TRUE peak is UNKNOWN and
-- out_peak below is a LOWER BOUND, not the real peak (anomaly rule 2).
-- ============================================================================
SELECT
  feature,
  tier,
  call_name,
  count(*)                                          AS runs,
  min(output_tokens)                                AS out_min,
  round(avg(output_tokens))                         AS out_mean,
  max(output_tokens)                                AS out_peak,
  max(max_tokens)                                   AS cap,
  round(100.0 * (1 - max(output_tokens)::numeric / max(max_tokens)), 1)
                                                    AS headroom_pct_at_peak,
  ceil(max(output_tokens) * 1.4)                    AS suggested_cap_raw,
  count(*) FILTER (WHERE truncated)                 AS truncated_runs
FROM public.ai_call_telemetry
WHERE created_at >= :window_start
  AND attempt = 1
  AND ok
  AND call_name NOT IN (
    'docx-extract', 'ocr-extract', 'docx-extract-legacy', 'ocr-extract-legacy',
    'legacy-fallback-assemble', 'legacy-fallback-stream-lifecycle',
    'legacy-fallback-stream-merit', 'legacy-fallback-merit', 'base-prior-analyses'
  )
GROUP BY feature, tier, call_name
ORDER BY feature, tier, call_name;


-- ============================================================================
-- BLOCK 3 — COST IN DOLLARS
-- Measured input + cache + output priced at the Haiku 4.5 rates above.
-- input priced as the SUM of the three token columns (assumption A1 RESOLVED —
-- input_tokens excludes cache tokens, so summing is additive not double-counting).
--
-- 3a. Per analysis (grouped by req_id).
-- ============================================================================
SELECT
  feature,
  tier,
  req_id,
  count(*) AS calls,
  round(
    sum(
        coalesce(input_tokens, 0)                * 1.00
      + coalesce(cache_creation_input_tokens, 0) * 1.25
      + coalesce(cache_read_input_tokens, 0)     * 0.10
      + coalesce(output_tokens, 0)               * 5.00
    ) / 1000000.0
  , 6) AS usd_per_analysis
FROM public.ai_call_telemetry
WHERE created_at >= :window_start
  AND ok
  AND attempt = 1
GROUP BY feature, tier, req_id
ORDER BY feature, tier, usd_per_analysis DESC;

-- 3b. Per tier (mean $/analysis across that cell's req_ids) + projection / 1000.
SELECT
  feature,
  tier,
  count(DISTINCT req_id)                       AS analyses,
  round(avg(per_analysis.usd_per_analysis), 6) AS usd_mean_per_analysis,
  round(avg(per_analysis.usd_per_analysis) * 1000, 2) AS usd_per_1000_analyses
FROM (
  SELECT
    feature,
    tier,
    req_id,
    sum(
        coalesce(input_tokens, 0)                * 1.00
      + coalesce(cache_creation_input_tokens, 0) * 1.25
      + coalesce(cache_read_input_tokens, 0)     * 0.10
      + coalesce(output_tokens, 0)               * 5.00
    ) / 1000000.0 AS usd_per_analysis
  FROM public.ai_call_telemetry
  WHERE created_at >= :window_start
    AND ok
    AND attempt = 1
  GROUP BY feature, tier, req_id
) AS per_analysis
GROUP BY feature, tier
ORDER BY feature, tier;


-- ============================================================================
-- BLOCK 4 — STANDING NEAR-CAP WATCH
-- What makes this telemetry PERMANENTLY useful rather than a one-off study: it
-- surfaces the next truncation regression BEFORE a paying user hits it. Both
-- prior regressions (LinkedIn 2026-07-09, Career Compass 2026-07-17) were only
-- found after they broke a user's analysis.
--
-- Trailing window (independent of :window_start — this is an ongoing monitor).
-- Flags any first-attempt row that either truncated OR ran with less than the
-- HEADROOM_FLOOR_PCT headroom against its own cap. Tune the two literals below.
--
-- (Automated ALERTING on this is a deferred idea — this is the QUERY, not an
-- alerting system. Run it on a cadence and eyeball the result.)
-- ============================================================================
SELECT
  created_at,
  req_id,
  feature,
  tier,
  call_name,
  output_tokens,
  max_tokens,
  headroom_pct,
  truncated,
  stop_reason,
  duration_ms
FROM public.ai_call_telemetry
WHERE created_at >= now() - interval '30 days'   -- trailing monitor window
  AND attempt = 1
  AND ok
  AND (
        truncated IS TRUE
     OR headroom_pct < 15        -- HEADROOM_FLOOR_PCT: below this, right-sizing was too aggressive
      )
ORDER BY truncated DESC, headroom_pct ASC, created_at DESC;


-- ============================================================================
-- RETENTION SNIPPET (OPERATOR-RUN — NOT read-only)
-- ----------------------------------------------------------------------------
-- The telemetry table is permanent, but rows older than ~180 days have no
-- analytical value. Run this DELETE manually on a cadence. This is intentionally
-- a snippet, not pruning infrastructure — do NOT build a cron/trigger for it.
--
--   DELETE FROM public.ai_call_telemetry WHERE created_at < now() - interval '180 days';
-- ============================================================================
