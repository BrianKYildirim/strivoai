-- ============================================================================
-- costing_telemetry_report.sql
-- ----------------------------------------------------------------------------
-- Phase 04.2 / Plan 05. The CANONICAL, checked-in, service-role-only SQL that
-- produces the four monthly workbook inputs named in 04.2-BRIEF.md section 14,
-- plus the per-run drill-down and the reconciliation queries that make every
-- printed number traceable back to one feature run.
--
-- This file is the operator-facing companion to the six service-role views
-- created by migration 20260801010001_costing_telemetry_retention_reporting.sql.
-- The views are the stable contract; the blocks below are the workbook inputs,
-- the evidence path, and the "is this number trustworthy?" checks.
--
-- READ-ONLY. Every statement here is a SELECT. Nothing in this file mutates
-- data, and nothing here may be run against production by an automated agent.
--
-- ----------------------------------------------------------------------------
-- RUN AS
-- ----------------------------------------------------------------------------
-- service_role only. `costing_subjects`, `costing_account_classifications`,
-- `provider_pricing`, `feature_runs`, `document_processing_runs`, and the
-- `costing_monthly_*` views are all REVOKEd from anon/authenticated and are
-- deny-all under RLS for authenticated. There is no user-facing dashboard for
-- this data and this phase does not add one (D-14).
--
-- ----------------------------------------------------------------------------
-- THE THREE DEFAULT FILTERS (never remove them from a workbook input)
-- ----------------------------------------------------------------------------
--   environment = 'production'
--       Local, test, QA, and staging activity is a different cost pool and must
--       never be blended into a production unit-economics figure (BRIEF s19).
--   exclude_from_costing_at_time = false
--       The SNAPSHOTTED account classification, taken at run time. Never the
--       account's CURRENT classification, and never derived from an email
--       address or from current admin membership (D-15). Reclassifying an
--       account today does not silently rewrite last month's totals.
--   costing_epoch = 'phase_04_2_complete'
--       Only rows written after the Phase 04.2 production activation carry a
--       complete feature/Merit/document/AI correlation. Pre-04.2 rows are
--       AI-only and are quarantined into Block C (D-05 / D-08).
--
-- ----------------------------------------------------------------------------
-- COST VOCABULARY (used consistently below; do not mix these words)
-- ----------------------------------------------------------------------------
--   incurred            The amount actually charged by the provider, priced at
--                       the rate that was EFFECTIVE WHEN THE CALL HAPPENED and
--                       snapshotted onto the row at write time. This is the only
--                       basis a monthly workbook input may use (D-09).
--   current_rate        A revaluation of historical token/page counts at TODAY's
--                       published price. Comparison only. It never overwrites,
--                       replaces, or is summed with an incurred figure (D-09).
--   known cost          cost_known = true. Provider-reported or independently
--                       calculated from proven usage against a proven price.
--   unknown cost        cost_known is false/NULL. A failed attempt with no
--                       reported tokens, pages, or billed amount has UNKNOWN
--                       cost, NOT zero cost. Unknown rows are COUNTED beside the
--                       known totals and are never coerced to 0 (D-13).
--   verified_zero       The one case where a zero is real (e.g. a route that
--                       provably consumed no billable provider work). Only a
--                       verified_zero row may participate in a COALESCE(..., 0).
--
-- ----------------------------------------------------------------------------
-- NULL / DIVISION DISCIPLINE
-- ----------------------------------------------------------------------------
--   * Every ratio divides by NULLIF(denominator, 0), so an empty month returns
--     NULL rather than raising division_by_zero (BRIEF s14).
--   * COALESCE(x, 0) appears ONLY where a NULL provably means "no rows in this
--     bucket" (a count) or where the row is cost_confidence = 'verified_zero'.
--     It is never used to make an unknown COST look like a measured zero.
--
-- ----------------------------------------------------------------------------
-- CLAUDE OCR IS COUNTED EXACTLY ONCE (D-12)
-- ----------------------------------------------------------------------------
-- When the OCR route is Claude vision, the SPEND lives on the ai_call_telemetry
-- row and document_processing_runs stores only a reference
-- (ai_call_telemetry_id, cost_confidence = 'referenced_ai', all three document
-- cost columns NULL, enforced by CHECK document_cost_excludes_referenced_ai).
-- Therefore:
--     total provider spend = Block A3 (AI) + Block A4 (document, known only)
-- and those two blocks are disjoint by construction. Block E5 proves it.
--
-- ----------------------------------------------------------------------------
-- WINDOW PARAMETER
-- ----------------------------------------------------------------------------
-- Blocks that accept a window filter on :window_start / :window_end.
--
--   psql:  \set window_start '2026-08-01T00:00:00Z'
--          \set window_end   '2026-09-01T00:00:00Z'
--   Supabase SQL editor: replace each :window_start / :window_end with an
--          explicit `timestamptz '....'` literal.
--
-- To report an entire history, substitute '-infinity' / 'infinity'.
-- ============================================================================


-- ============================================================================
-- BLOCK A - MONTHLY WORKBOOK INPUTS
-- The four outputs the costing workbook consumes. Each one is a direct read of
-- the corresponding service-role view, which already carries the three default
-- filters and already UNIONs the post-retention monthly aggregate rows so a
-- month does not silently vanish after the 24-month raw prune (D-16).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A1. MONTHLY PRODUCT MAU  (BRIEF s14 "Monthly product MAU")
--
-- Definition (fixed, do not restate it differently anywhere else):
--   a distinct PRODUCTION costing subject that COMPLETED at least one tracked
--   Strivo feature run during the calendar month.
--
-- This is PRODUCT MAU. It is NOT Supabase billable Auth MAU and must never be
-- labeled as such - the view carries the literal marker
-- 'product_mau_not_supabase_auth_mau' on every row so a copied cell keeps its
-- provenance.
--
-- The distinct subject is `costing_subject_id`, a RANDOM non-derived identifier
-- (D-17). It is deliberately NOT auth.users and NOT profiles: an account
-- deleted after the fact keeps its historical distinct-user contribution while
-- its Auth UUID is severed, so MAU neither drops retroactively nor provides a
-- route back to the deleted person.
--
-- `active_users` is NULL together with subject_count_suppressed = true when a
-- post-retention aggregate cohort had fewer than five distinct subjects
-- (small-cohort privacy). NULL there means SUPPRESSED, not zero.
-- ----------------------------------------------------------------------------
SELECT
  month,
  tier_at_time,
  subscription_period_at_time,
  active_users,
  subject_count_suppressed,
  metric_definition
FROM public.costing_monthly_product_mau
WHERE month >= date_trunc('month', :window_start::timestamptz)
  AND month <  date_trunc('month', :window_end::timestamptz)
ORDER BY month, tier_at_time, subscription_period_at_time NULLS FIRST;


-- ----------------------------------------------------------------------------
-- A2. MONTHLY FEATURE USAGE  (BRIEF s14 "Monthly feature usage")
--
-- merits_charged / merits_refunded sum ONLY the rows whose corresponding
-- known-flag is true (merit_charge_known / merit_refund_known). A run whose
-- Merit settlement could not be observed contributes to the run counts but NOT
-- to the Merit totals, so an unobserved settlement can never masquerade as a
-- zero-Merit run. `merit_unobserved_runs` below makes that gap explicit.
--
-- Refunding Merits never removes provider spend: Block A3 still carries the
-- tokens the failed run burned (BRIEF s9).
-- ----------------------------------------------------------------------------
SELECT
  usage.month,
  usage.feature,
  usage.tier_at_time,
  usage.subscription_period_at_time,
  usage.started_runs,
  usage.completed_runs,
  usage.failed_runs,
  usage.canceled_runs,
  usage.unique_users,
  usage.subject_count_suppressed,
  usage.merits_charged,
  usage.merits_refunded,
  -- Safe division: an empty cohort yields NULL, never a division_by_zero.
  round(
    usage.completed_runs::numeric / NULLIF(usage.started_runs, 0), 6
  ) AS completion_rate,
  round(
    usage.failed_runs::numeric / NULLIF(usage.started_runs, 0), 6
  ) AS failure_rate
FROM public.costing_monthly_feature_usage usage
WHERE usage.month >= date_trunc('month', :window_start::timestamptz)
  AND usage.month <  date_trunc('month', :window_end::timestamptz)
ORDER BY usage.month, usage.feature, usage.tier_at_time,
         usage.subscription_period_at_time NULLS FIRST;


-- ----------------------------------------------------------------------------
-- A3. MONTHLY AI USAGE  (BRIEF s14 "Monthly AI usage")
--
-- One row per PHYSICAL provider attempt feeds this. A multi-call feature
-- produces several attempts under distinct operation_name values; those are
-- REQUIRED STEPS, not retries. is_retry = true marks only an additional attempt
-- at the SAME logical operation (BRIEF s8).
--
-- known_incurred_cost_usd sums only cost_known rows. unknown_cost_attempts is
-- printed ALONGSIDE it and is never folded into the total (D-13). A workbook
-- cell that shows a cost must also show the unknown count next to it, otherwise
-- a month with many unpriced failures reads as cheaper than it was.
-- ----------------------------------------------------------------------------
SELECT
  ai.month,
  ai.feature,
  ai.tier_at_time,
  ai.model,
  ai.total_calls,
  ai.successful_calls,
  ai.failed_calls,
  ai.retry_calls,
  ai.input_tokens,
  ai.output_tokens,
  ai.cache_creation_input_tokens,
  ai.cache_read_input_tokens,
  ai.known_incurred_cost_usd   AS total_ai_incurred_cost_usd,
  ai.retry_incurred_cost_usd   AS retry_ai_incurred_cost_usd,
  ai.failed_incurred_cost_usd  AS failed_ai_call_incurred_cost_usd,
  ai.unknown_cost_attempts,
  -- Coverage is a COUNT ratio, so the numerator is a count and COALESCE is safe.
  round(
    (ai.total_calls - COALESCE(ai.unknown_cost_attempts, 0))::numeric
      / NULLIF(ai.total_calls, 0), 6
  ) AS known_cost_coverage,
  'incurred_effective_date_price'::text AS valuation_basis
FROM public.costing_monthly_ai_usage ai
WHERE ai.month >= date_trunc('month', :window_start::timestamptz)
  AND ai.month <  date_trunc('month', :window_end::timestamptz)
ORDER BY ai.month, ai.feature, ai.tier_at_time, ai.model;


-- ----------------------------------------------------------------------------
-- A4. MONTHLY DOCUMENT AND OCR USAGE  (BRIEF s14 "Monthly document and OCR")
--
-- One row per PDF/DOCX processed inside a tracked feature run.
--
-- ocr_documents counts documents whose ocr_triggered is true - i.e. the file was
-- ACTUALLY sent through an OCR / vision route. Ordinary text extraction is never
-- counted as an OCR attempt (BRIEF s13).
--
-- known_incurred_cost_usd here is DOCUMENT-OWNED spend only (Mistral pages, and
-- Textract where the endpoint/region/billing is attributable). Claude-vision OCR
-- contributes 0 rows to this sum by construction and appears in A3 instead
-- (D-12). Adding A3 + A4 therefore never double-counts.
--
-- unknown_cost_documents counts OCR documents whose cost could not be
-- established: an unattributable Textract endpoint, a provider that reported no
-- billing evidence, or a failed OCR attempt. Those are UNKNOWN, not free.
--
-- ONE CAVEAT, stated here because the number is easy to misread. The view's
-- predicate is `ocr_triggered AND cost_known IS DISTINCT FROM true`, and a
-- Claude-vision document has cost_known = false -- its money lives on the
-- referenced AI row (D-12). So this counter ALSO includes every referenced-AI
-- document and therefore OVERSTATES "spend we could not establish" by exactly
-- that number. No dollar is lost: the Claude spend is fully counted in A3. The
-- label is simply coarser than it looks.
--
-- Block E4 is the REFINED unknown-cost register: it excludes cost_confidence =
-- 'referenced_ai' and so reports only genuinely unpriced work. When the workbook
-- prints "N unpriced OCR documents", publish E4's figure, not this one. The
-- difference between the two is always the referenced_ai count, which A4 returns
-- below so the reconciliation is one subtraction.
-- ----------------------------------------------------------------------------
SELECT
  doc.month,
  doc.feature,
  doc.tier_at_time,
  doc.file_type,
  doc.documents_processed,
  doc.documents_parsed_without_ocr,
  doc.ocr_documents,
  round(doc.ocr_incidence, 6)    AS ocr_incidence,
  doc.total_document_pages,
  doc.total_ocr_pages,
  round(doc.average_ocr_pages, 6) AS average_ocr_pages,
  doc.ocr_retry_documents,
  doc.ocr_failures,
  round(
    doc.ocr_retry_documents::numeric / NULLIF(doc.ocr_documents, 0), 6
  ) AS ocr_retry_rate,
  round(
    doc.ocr_failures::numeric / NULLIF(doc.ocr_documents, 0), 6
  ) AS ocr_failure_rate,
  doc.known_incurred_cost_usd AS ocr_incurred_cost_usd,
  doc.unknown_cost_documents AS unknown_cost_documents_view_definition,
  referenced.referenced_ai_documents,
  -- The refined register (same definition as Block E4). Never negative: every
  -- referenced_ai document is cost_known = false and ocr_triggered, so it is a
  -- strict subset of the view's counter. GREATEST guards the post-retention rows,
  -- where the raw documents behind the aggregate no longer exist.
  GREATEST(
    doc.unknown_cost_documents - COALESCE(referenced.referenced_ai_documents, 0),
    0
  ) AS unknown_cost_documents_genuinely_unpriced,
  'document_owned_spend_excludes_referenced_claude_vision'::text AS cost_scope
FROM public.costing_monthly_document_usage doc
LEFT JOIN LATERAL (
  SELECT count(*) AS referenced_ai_documents
  FROM public.document_processing_runs d
  WHERE date_trunc('month', d.started_at)::date = doc.month
    AND d.feature      IS NOT DISTINCT FROM doc.feature
    AND d.tier_at_time IS NOT DISTINCT FROM doc.tier_at_time
    AND d.file_type    IS NOT DISTINCT FROM doc.file_type
    AND d.environment = 'production'
    AND d.exclude_from_costing_at_time = false
    AND d.costing_epoch = 'phase_04_2_complete'
    AND d.cost_confidence = 'referenced_ai'
) referenced ON true
WHERE doc.month >= date_trunc('month', :window_start::timestamptz)
  AND doc.month <  date_trunc('month', :window_end::timestamptz)
ORDER BY doc.month, doc.feature, doc.tier_at_time, doc.file_type;


-- ----------------------------------------------------------------------------
-- A5. COMBINED MONTHLY PROVIDER SPEND (the single "what did we spend" cell)
--
-- The only place A3 and A4 are added together. They are disjoint (see D-12 note
-- in the header), so the sum is the complete known provider spend for the month.
-- The two unknown counters are carried through UNSUMMED and UNMERGED so the
-- workbook can print "$X known, N unknown AI attempts, M unknown OCR documents"
-- rather than an unqualified dollar figure.
-- ----------------------------------------------------------------------------
WITH ai_month AS (
  SELECT
    month,
    sum(known_incurred_cost_usd) AS ai_known_incurred_cost_usd,
    sum(unknown_cost_attempts)   AS unknown_cost_ai_attempts
  FROM public.costing_monthly_ai_usage
  GROUP BY month
),
doc_month AS (
  SELECT
    month,
    sum(known_incurred_cost_usd) AS document_known_incurred_cost_usd,
    sum(unknown_cost_documents)  AS unknown_cost_documents
  FROM public.costing_monthly_document_usage
  GROUP BY month
),
completed_month AS (
  SELECT month, sum(completed_runs) AS completed_runs
  FROM public.costing_monthly_feature_usage
  GROUP BY month
)
SELECT
  COALESCE(ai_month.month, doc_month.month, completed_month.month) AS month,
  ai_month.ai_known_incurred_cost_usd,
  doc_month.document_known_incurred_cost_usd,
  -- Two NULL-safe adds: a month with AI but no documents (or vice versa) must
  -- still produce a total rather than NULL-poisoning the whole cell. Both
  -- operands are sums of KNOWN cost, so a missing side is a genuine absence of
  -- rows, not an unknown price.
  COALESCE(ai_month.ai_known_incurred_cost_usd, 0)
    + COALESCE(doc_month.document_known_incurred_cost_usd, 0)
      AS total_known_incurred_cost_usd,
  ai_month.unknown_cost_ai_attempts,
  doc_month.unknown_cost_documents,
  completed_month.completed_runs,
  round(
    (COALESCE(ai_month.ai_known_incurred_cost_usd, 0)
      + COALESCE(doc_month.document_known_incurred_cost_usd, 0))
      / NULLIF(completed_month.completed_runs, 0), 8
  ) AS known_incurred_cost_per_completed_run,
  'incurred_effective_date_price'::text AS valuation_basis
FROM ai_month
FULL OUTER JOIN doc_month       ON doc_month.month       = ai_month.month
FULL OUTER JOIN completed_month ON completed_month.month = COALESCE(ai_month.month, doc_month.month)
WHERE COALESCE(ai_month.month, doc_month.month, completed_month.month)
        >= date_trunc('month', :window_start::timestamptz)
  AND COALESCE(ai_month.month, doc_month.month, completed_month.month)
        <  date_trunc('month', :window_end::timestamptz)
ORDER BY 1;


-- ============================================================================
-- BLOCK B - CURRENT-RATE REVALUATION  (COMPARISON ONLY - NOT INCURRED COST)
-- ----------------------------------------------------------------------------
-- D-09. This block answers "what would last month's traffic cost at today's
-- published price?". It is a planning input, NOT a financial record.
--
-- It must NEVER be:
--   * substituted for a Block A figure,
--   * summed with a Block A figure,
--   * written back over any historical row.
--
-- Historical prices are immutable: provider_pricing carries an append-only
-- trigger and an exclusion constraint that forbids overlapping effective ranges
-- for the same provider/SKU/region/variant (D-10). A price change is a NEW row
-- with a new effective_from, never an UPDATE.
--
-- Rows whose token categories are incomplete are absent from the revaluation
-- (they cannot be repriced), which is why the delta column is reported next to
-- the incurred figure only for the SAME cohort.
-- ============================================================================
SELECT
  reval.month,
  reval.feature,
  reval.tier_at_time,
  reval.model,
  incurred.known_incurred_cost_usd     AS incurred_cost_usd,
  reval.current_rate_revaluation_usd,
  reval.current_rate_revaluation_usd - incurred.known_incurred_cost_usd
      AS revaluation_minus_incurred_usd,
  round(
    (reval.current_rate_revaluation_usd - incurred.known_incurred_cost_usd)
      / NULLIF(incurred.known_incurred_cost_usd, 0), 6
  ) AS revaluation_drift_ratio,
  incurred.unknown_cost_attempts,
  reval.valuation_basis
FROM public.costing_monthly_ai_current_rate_revaluation reval
LEFT JOIN public.costing_monthly_ai_usage incurred
  ON  incurred.month        = reval.month
  AND incurred.feature      IS NOT DISTINCT FROM reval.feature
  AND incurred.tier_at_time IS NOT DISTINCT FROM reval.tier_at_time
  AND incurred.model        IS NOT DISTINCT FROM reval.model
WHERE reval.month >= date_trunc('month', :window_start::timestamptz)
  AND reval.month <  date_trunc('month', :window_end::timestamptz)
ORDER BY reval.month, reval.feature, reval.tier_at_time, reval.model;


-- ----------------------------------------------------------------------------
-- B2. PRICE-SOURCE REVIEW (what every incurred number was priced against)
--
-- The operator-facing audit of the pricing catalog. Every row records the exact
-- provider, SKU, billing unit, region/variant, effective window, and the SOURCE
-- URL + reviewed version it was taken from. An unreviewed or guessed price is
-- absent from this table by policy - unresolved SKUs stay unknown rather than
-- being estimated (D-10 / D-13).
--
-- effective_to IS NULL marks the row that is currently in force.
-- ----------------------------------------------------------------------------
SELECT
  provider,
  exact_sku,
  billing_unit,
  region,
  api_variant,
  input_per_million_usd,
  output_per_million_usd,
  cache_write_per_million_usd,
  cache_read_per_million_usd,
  pages_per_1000_usd,
  effective_from,
  effective_to,
  (effective_to IS NULL) AS currently_in_force,
  source_url,
  source_version
FROM public.provider_pricing
ORDER BY provider, exact_sku, effective_from DESC;


-- ============================================================================
-- BLOCK C - LEGACY PRE-04.2 AI-ONLY HISTORY  (EXPLICITLY INCOMPLETE)
-- ----------------------------------------------------------------------------
-- D-05 / D-08. The Phase 02 ai_call_telemetry rows are preserved, queryable, and
-- PERMANENTLY QUARANTINED from every joined costing metric above.
--
-- They pre-date the feature-run correlation, so for these rows there is NO
-- feature run, NO Merit settlement, NO document route, NO snapshotted account
-- classification, NO environment tag, and NO effective-price link. Missing
-- correlations are never inferred and never backfilled.
--
-- Consequences the operator must respect:
--   * These rows may NOT be added to a Block A total.
--   * They may NOT be used to compute a cost-per-run (there is no run count).
--   * They may NOT be used for product MAU (there is no distinct subject).
--   * They are legitimate ONLY as an AI-token trend line, labeled as partial.
--
-- Every row carries completeness = 'partial_ai_only_pre_04_2'.
-- ============================================================================
SELECT
  month,
  feature,
  tier,
  model,
  total_calls,
  input_tokens,
  output_tokens,
  completeness,
  'excluded_from_complete_joined_costing_totals'::text AS usage_restriction
FROM public.costing_monthly_ai_legacy_partial
ORDER BY month, feature, tier, model;


-- ----------------------------------------------------------------------------
-- C2. COSTING EPOCH BOUNDARY (where complete history begins)
--
-- Proves the activation cut without asserting anything about the rows on either
-- side of it. Run this before publishing any month that straddles the Phase 04.2
-- production activation timestamp: a straddling month is PARTIAL and must be
-- labeled so in the workbook.
-- ----------------------------------------------------------------------------
SELECT
  COALESCE(costing_epoch, 'pre_04_2_untagged') AS costing_epoch,
  COALESCE(telemetry_version, 'pre_04_2')      AS telemetry_version,
  count(*)                                     AS ai_attempts,
  min(created_at)                              AS first_attempt_at,
  max(created_at)                              AS last_attempt_at
FROM public.ai_call_telemetry
GROUP BY 1, 2
ORDER BY first_attempt_at;


-- ============================================================================
-- BLOCK D - PER-RUN DRILL-DOWN (THE EVIDENCE PATH)
-- ----------------------------------------------------------------------------
-- Every aggregate above must be reducible to individual runs, and every run must
-- be reconstructable from its own evidence. This block is that path.
--
-- One row per feature run, joining:
--   feature evidence  - feature, variant, tier/period snapshot, input type
--   Merit evidence    - exact charged/refunded amounts and their known-flags
--   document evidence - route, OCR provider/pages/attempts/status, cost basis
--   AI evidence       - physical attempts, retries, tokens, known/unknown cost
--   terminal evidence - status, completed_at, safe error code/category
--
-- PRIVACY: no prompt, no document text, no generated result, no email, no name
-- is stored anywhere in these tables, so none can appear here. user_id is
-- selected as a PRESENCE BOOLEAN only (`identity_attached`) - the costing
-- subject is the analysis key, and after an account deletion user_id is NULL
-- while costing_subject_id survives (D-17).
--
-- Substitute :feature_run_id with an explicit uuid literal to trace one run, or
-- drop that predicate and use the window to sweep a period.
-- ============================================================================
SELECT
  fr.id                                AS feature_run_id,
  fr.costing_subject_id,
  (fr.user_id IS NOT NULL)             AS identity_attached,
  fr.request_id,
  fr.analysis_job_id,

  -- Feature evidence (all snapshotted at run start, never re-derived).
  fr.feature,
  fr.run_variant,
  fr.tier_at_time,
  fr.subscription_period_at_time,
  fr.input_type,
  fr.document_count,
  fr.served_from_cache,
  fr.cache_source,
  fr.environment,
  fr.exclude_from_costing_at_time,
  fr.costing_epoch,
  fr.telemetry_version,

  -- Merit evidence. A NULL amount with a false known-flag means UNOBSERVED,
  -- which is not the same as zero. Both are printed so the difference is visible.
  fr.merits_charged,
  fr.merit_charge_known,
  fr.merits_refunded,
  fr.merit_refund_known,

  -- Terminal evidence.
  fr.status,
  fr.started_at,
  fr.completed_at,
  EXTRACT(EPOCH FROM (fr.completed_at - fr.started_at)) AS wall_seconds,
  fr.error_code,
  fr.error_category,

  -- Document / OCR evidence.
  docs.documents,
  docs.ocr_documents,
  docs.ocr_providers,
  docs.ocr_pages,
  docs.ocr_attempts,
  docs.document_known_incurred_cost_usd,
  docs.document_unknown_cost_documents,
  docs.claude_referenced_documents,

  -- AI evidence.
  ai.ai_attempts,
  ai.ai_operations,
  ai.ai_retry_attempts,
  ai.ai_failed_attempts,
  ai.input_tokens,
  ai.output_tokens,
  ai.cache_creation_input_tokens,
  ai.cache_read_input_tokens,
  ai.ai_known_incurred_cost_usd,
  ai.ai_unknown_cost_attempts,

  -- Whole-run known spend. Disjoint by construction (D-12).
  COALESCE(ai.ai_known_incurred_cost_usd, 0)
    + COALESCE(docs.document_known_incurred_cost_usd, 0)
      AS run_known_incurred_cost_usd,
  COALESCE(ai.ai_unknown_cost_attempts, 0)
    + COALESCE(docs.document_unknown_cost_documents, 0)
      AS run_unknown_cost_items
FROM public.feature_runs fr
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                AS documents,
    count(*) FILTER (WHERE d.ocr_triggered)                 AS ocr_documents,
    array_remove(array_agg(DISTINCT d.ocr_provider), NULL)  AS ocr_providers,
    sum(d.ocr_pages)                                        AS ocr_pages,
    sum(d.ocr_attempt_count)                                AS ocr_attempts,
    sum(d.incurred_cost_usd) FILTER (WHERE d.cost_known)    AS document_known_incurred_cost_usd,
    count(*) FILTER (
      WHERE d.ocr_triggered AND d.cost_known IS DISTINCT FROM true
        AND d.cost_confidence <> 'referenced_ai'
    )                                                       AS document_unknown_cost_documents,
    count(*) FILTER (WHERE d.cost_confidence = 'referenced_ai')
                                                            AS claude_referenced_documents
  FROM public.document_processing_runs d
  WHERE d.feature_run_id = fr.id
) docs ON true
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                   AS ai_attempts,
    array_remove(array_agg(DISTINCT a.operation_name), NULL)    AS ai_operations,
    count(*) FILTER (WHERE a.is_retry IS TRUE)                  AS ai_retry_attempts,
    count(*) FILTER (WHERE NOT a.ok)                            AS ai_failed_attempts,
    sum(a.input_tokens)                                         AS input_tokens,
    sum(a.output_tokens)                                        AS output_tokens,
    sum(a.cache_creation_input_tokens)                          AS cache_creation_input_tokens,
    sum(a.cache_read_input_tokens)                              AS cache_read_input_tokens,
    sum(a.incurred_cost_usd) FILTER (WHERE a.cost_known IS TRUE) AS ai_known_incurred_cost_usd,
    count(*) FILTER (WHERE a.cost_known IS DISTINCT FROM true)   AS ai_unknown_cost_attempts
  FROM public.ai_call_telemetry a
  WHERE a.feature_run_id = fr.id
) ai ON true
WHERE (:feature_run_id::uuid IS NULL OR fr.id = :feature_run_id::uuid)
  AND fr.started_at >= :window_start::timestamptz
  AND fr.started_at <  :window_end::timestamptz
ORDER BY fr.started_at DESC;


-- ----------------------------------------------------------------------------
-- D2. PER-ATTEMPT AI EVIDENCE FOR ONE RUN
--
-- The lowest level of the trace: every PHYSICAL provider attempt in one run, in
-- order. Distinct operation_name values are REQUIRED STEPS; a repeated
-- operation_name with a higher attempt_number is a RETRY (BRIEF s8). The unique
-- index (feature_run_id, operation_name, attempt_number) makes duplicate rows
-- for one physical attempt structurally impossible.
--
-- No prompt and no response body is stored, so none can be selected. error_code
-- and error_category are controlled vocabularies, never raw provider text.
-- ----------------------------------------------------------------------------
SELECT
  a.feature_run_id,
  a.operation_name,
  a.attempt_number,
  a.is_retry,
  a.provider,
  a.model,
  a.started_at,
  a.completed_at,
  a.ok,
  a.status,
  a.http_status,
  a.error_code,
  a.error_category,
  a.input_tokens,
  a.output_tokens,
  a.cache_creation_input_tokens,
  a.cache_read_input_tokens,
  a.pricing_id,
  a.incurred_cost_usd,
  a.cost_known,
  a.cost_confidence
FROM public.ai_call_telemetry a
WHERE a.feature_run_id = :feature_run_id::uuid
ORDER BY a.operation_name, a.attempt_number;


-- ----------------------------------------------------------------------------
-- D3. PER-DOCUMENT ROUTE EVIDENCE FOR ONE RUN
--
-- The actual extraction route each document took. cost_confidence explains WHY a
-- cost is what it is:
--   'reported'      provider gave a final attributable amount (preferred, D-11)
--   'calculated'    derived from proven pages/tokens against a proven price
--   'referenced_ai' Claude vision - the cost lives on ai_call_telemetry_id (D-12)
--   'verified_zero' provably no billable provider work
--   'unknown'       not establishable; NOT zero (D-13)
-- ----------------------------------------------------------------------------
SELECT
  d.feature_run_id,
  d.document_ordinal,
  d.file_type,
  d.page_count,
  d.file_size_bytes,
  d.initial_extractor,
  d.final_extractor,
  d.extraction_status,
  d.extracted_character_count,
  d.ocr_triggered,
  d.ocr_trigger_reason,
  d.ocr_provider,
  d.ocr_model,
  d.ocr_pages,
  d.ocr_attempt_count,
  d.ocr_status,
  (d.provider_request_id IS NOT NULL) AS provider_request_recorded,
  d.provider_reported_cost_usd,
  d.calculated_cost_usd,
  d.incurred_cost_usd,
  d.cost_variance_usd,
  d.cost_known,
  d.cost_confidence,
  d.ai_call_telemetry_id,
  d.error_code,
  d.error_category,
  d.started_at,
  d.completed_at
FROM public.document_processing_runs d
WHERE d.feature_run_id = :feature_run_id::uuid
ORDER BY d.document_ordinal;


-- ----------------------------------------------------------------------------
-- D4. PROVIDER-REPORTED vs CALCULATED VARIANCE  (D-11)
--
-- Where a provider supplies a final attributable per-request cost, BOTH values
-- are preserved. The reported value is what incurred reporting uses; the
-- calculated value is the independent check. This block surfaces the variance so
-- a pricing-model drift (a rate change we have not ingested, a billing unit we
-- misread) is visible rather than silently absorbed.
--
-- A large or growing |variance_ratio| is the signal to re-review provider_pricing
-- and append a corrected effective row - never to edit an existing one.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('month', d.started_at)::date AS month,
  d.ocr_provider,
  d.ocr_model,
  count(*)                                          AS documents_with_both_values,
  sum(d.provider_reported_cost_usd)                 AS reported_total_usd,
  sum(d.calculated_cost_usd)                        AS calculated_total_usd,
  sum(d.cost_variance_usd)                          AS variance_total_usd,
  round(
    sum(d.cost_variance_usd) / NULLIF(sum(d.provider_reported_cost_usd), 0), 6
  ) AS variance_ratio,
  max(abs(d.cost_variance_usd))                     AS worst_single_variance_usd
FROM public.document_processing_runs d
WHERE d.environment = 'production'
  AND d.exclude_from_costing_at_time = false
  AND d.costing_epoch = 'phase_04_2_complete'
  AND d.provider_reported_cost_usd IS NOT NULL
  AND d.calculated_cost_usd IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- ============================================================================
-- BLOCK E - RECONCILIATION (RUN THESE BEFORE PUBLISHING A MONTH)
-- ----------------------------------------------------------------------------
-- Each query below should return ZERO rows in a healthy month. A non-zero result
-- is not necessarily a bug, but it IS a number the workbook must not print
-- without an explanation. These are the "can I trust Block A?" checks.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- E1. ORPHANED PROVIDER SPEND
-- Complete-epoch AI attempts or document rows that carry no feature run. In the
-- complete epoch every physical attempt is created inside a run, so an orphan
-- means correlation broke and that spend is invisible to per-run and per-feature
-- costing. Legacy pre-04.2 rows are excluded here - they are orphaned BY DESIGN
-- and are handled by Block C.
-- ----------------------------------------------------------------------------
SELECT
  'ai_attempt_without_feature_run'::text AS finding,
  date_trunc('month', a.created_at)::date AS month,
  a.feature,
  count(*)                                AS rows_affected,
  sum(a.incurred_cost_usd) FILTER (WHERE a.cost_known IS TRUE)
                                          AS unattributed_known_cost_usd,
  count(*) FILTER (WHERE a.cost_known IS DISTINCT FROM true)
                                          AS unknown_cost_rows
FROM public.ai_call_telemetry a
WHERE a.costing_epoch = 'phase_04_2_complete'
  AND a.feature_run_id IS NULL
GROUP BY 1, 2, 3

UNION ALL

SELECT
  'document_run_without_resolvable_feature_run'::text,
  date_trunc('month', d.started_at)::date,
  d.feature,
  count(*),
  sum(d.incurred_cost_usd) FILTER (WHERE d.cost_known),
  count(*) FILTER (WHERE d.cost_known IS DISTINCT FROM true)
FROM public.document_processing_runs d
LEFT JOIN public.feature_runs fr ON fr.id = d.feature_run_id
WHERE d.costing_epoch = 'phase_04_2_complete'
  AND fr.id IS NULL
GROUP BY 1, 2, 3
ORDER BY 2, 1, 3;


-- ----------------------------------------------------------------------------
-- E2. NON-TERMINAL RUNS
-- Runs still marked 'started' well after they began. The BRIEF is explicit that
-- normal finished requests must not sit permanently in 'started' (s4): such a run
-- contributes to started_runs but to no completed/failed/canceled bucket, so
-- completion and failure rates in A2 both understate.
--
-- The 6-hour floor is deliberately far beyond any real analysis wall time, so a
-- hit here is a terminalization defect, not a slow request.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('month', fr.started_at)::date AS month,
  fr.feature,
  fr.run_variant,
  fr.tier_at_time,
  count(*)                                 AS nonterminal_runs,
  min(fr.started_at)                       AS oldest_started_at
FROM public.feature_runs fr
WHERE fr.status = 'started'
  AND fr.started_at < now() - interval '6 hours'
  AND fr.environment = 'production'
  AND fr.exclude_from_costing_at_time = false
  AND fr.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;


-- ----------------------------------------------------------------------------
-- E3. SUSPECTED DUPLICATE SERVER ACTIONS
-- One deliberate user action must produce exactly ONE feature run (BRIEF s16).
-- Duplicate submissions are collapsed by the unique index on
-- server_action_key_hash, so this query looks for the residual case: several
-- runs for the SAME subject/feature/variant inside one minute where the
-- idempotency key was absent.
--
-- A hit inflates started_runs and unique-action counts. It does NOT inflate
-- provider spend (each run owns its own attempts), so A3/A4 remain sound.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('minute', fr.started_at)  AS started_minute,
  fr.costing_subject_id,
  fr.feature,
  fr.run_variant,
  count(*)                             AS runs_in_same_minute,
  count(*) FILTER (WHERE fr.server_action_key_hash IS NULL)
                                       AS runs_without_action_key
FROM public.feature_runs fr
WHERE fr.environment = 'production'
  AND fr.exclude_from_costing_at_time = false
  AND fr.costing_epoch = 'phase_04_2_complete'
  AND fr.started_at >= :window_start::timestamptz
  AND fr.started_at <  :window_end::timestamptz
GROUP BY 1, 2, 3, 4
HAVING count(*) > 1
ORDER BY 1 DESC;


-- ----------------------------------------------------------------------------
-- E4. UNKNOWN-COST INVENTORY
-- The explicit "what we could not price" register, per month and per reason.
-- Publish this NEXT TO the Block A cost cells. It is the difference between
-- "we spent $X" and "we spent at least $X, plus N unpriced attempts" (D-13).
-- ----------------------------------------------------------------------------
SELECT
  'ai_attempt'::text                        AS subject,
  date_trunc('month', a.created_at)::date   AS month,
  a.feature,
  COALESCE(a.cost_confidence, 'unset')      AS cost_confidence,
  a.ok                                      AS attempt_succeeded,
  count(*)                                  AS unknown_cost_rows
FROM public.ai_call_telemetry a
WHERE a.environment = 'production'
  AND a.exclude_from_costing_at_time = false
  AND a.costing_epoch = 'phase_04_2_complete'
  AND a.cost_known IS DISTINCT FROM true
GROUP BY 1, 2, 3, 4, 5

UNION ALL

SELECT
  'document'::text,
  date_trunc('month', d.started_at)::date,
  d.feature,
  d.cost_confidence,
  (d.ocr_status = 'completed'),
  count(*)
FROM public.document_processing_runs d
WHERE d.environment = 'production'
  AND d.exclude_from_costing_at_time = false
  AND d.costing_epoch = 'phase_04_2_complete'
  AND d.ocr_triggered
  AND d.cost_known IS DISTINCT FROM true
  -- referenced_ai is NOT unknown: its cost is fully known on the AI row (D-12).
  AND d.cost_confidence <> 'referenced_ai'
GROUP BY 1, 2, 3, 4, 5
ORDER BY 2, 1, 3, 4;


-- ----------------------------------------------------------------------------
-- E5. CLAUDE OCR NO-DOUBLE-COUNT PROOF  (D-12)
-- Must return zero rows. Any Claude-vision document row that carries its own
-- cost columns would be counting the same provider spend twice - once in A4 and
-- once again in A3 through the referenced AI attempt.
--
-- The CHECK constraint document_cost_excludes_referenced_ai already forbids
-- this at write time; this query is the independent read-side confirmation that
-- the constraint is actually present on the LIVE database, not merely in the
-- migration file.
-- ----------------------------------------------------------------------------
SELECT
  d.feature_run_id,
  d.document_ordinal,
  d.ocr_provider,
  d.cost_confidence,
  d.ai_call_telemetry_id,
  d.provider_reported_cost_usd,
  d.calculated_cost_usd,
  d.incurred_cost_usd
FROM public.document_processing_runs d
WHERE d.ai_call_telemetry_id IS NOT NULL
  AND (
    d.provider_reported_cost_usd IS NOT NULL
    OR d.calculated_cost_usd IS NOT NULL
    OR d.incurred_cost_usd IS NOT NULL
    OR d.cost_confidence <> 'referenced_ai'
  );


-- ----------------------------------------------------------------------------
-- E6. MERIT OBSERVATION GAPS
-- Terminal runs whose Merit settlement was never observed. Telemetry only WATCHES
-- the Merit gateway - it is never the financial authority (04.2-02) - so an
-- unobserved settlement is a measurement gap, not a billing defect. These runs
-- are excluded from the A2 Merit sums, and this query is how large that exclusion
-- is made visible.
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('month', fr.started_at)::date AS month,
  fr.feature,
  fr.status,
  count(*)                                              AS terminal_runs,
  count(*) FILTER (WHERE NOT fr.merit_charge_known)     AS charge_unobserved,
  count(*) FILTER (WHERE fr.status = 'failed' AND NOT fr.merit_refund_known)
                                                        AS refund_unobserved_on_failure,
  round(
    count(*) FILTER (WHERE NOT fr.merit_charge_known)::numeric
      / NULLIF(count(*), 0), 6
  ) AS charge_unobserved_rate
FROM public.feature_runs fr
WHERE fr.status IN ('completed', 'failed', 'canceled')
  AND fr.environment = 'production'
  AND fr.exclude_from_costing_at_time = false
  AND fr.costing_epoch = 'phase_04_2_complete'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- ----------------------------------------------------------------------------
-- E7. EXCLUSION AND ENVIRONMENT SEPARATION AUDIT
-- What the three default filters actually removed. Print this alongside any
-- month so the size of the excluded pool is known rather than assumed, and so a
-- misconfigured STRIVO_RUNTIME_ENV (which would dump production traffic into a
-- non-production bucket) is caught immediately.
--
-- The exclusion is the SNAPSHOT taken at run time, so an account reclassified
-- today does not move historical rows between these buckets (D-15).
-- ----------------------------------------------------------------------------
SELECT
  date_trunc('month', fr.started_at)::date AS month,
  fr.environment,
  fr.exclude_from_costing_at_time,
  fr.costing_epoch,
  count(*)                                 AS runs,
  count(DISTINCT fr.costing_subject_id)    AS distinct_subjects
FROM public.feature_runs fr
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;


-- ----------------------------------------------------------------------------
-- E8. RETENTION AND DELETION POSTURE
-- Proves the two retention windows and the identity-detachment guarantee are
-- actually in force on the live database (D-16 / D-17), without exposing a
-- single identifier.
--
--   raw telemetry            retained 24 months, then rolled up and pruned
--   monthly aggregates       retained 5 years
--   detached subjects        auth_user_id severed, costing_subject_id survives
--
-- oldest_raw_* older than the 24-month boundary means the scheduled job
-- (cron: costing_telemetry_retention_monthly) has not run or has failed.
-- ----------------------------------------------------------------------------
SELECT
  (SELECT min(started_at) FROM public.feature_runs)               AS oldest_raw_feature_run,
  (SELECT min(created_at) FROM public.ai_call_telemetry)          AS oldest_raw_ai_attempt,
  (SELECT min(started_at) FROM public.document_processing_runs)   AS oldest_raw_document_run,
  date_trunc('month', now() - interval '24 months')::date         AS raw_retention_boundary,
  (SELECT min(month) FROM public.costing_monthly_aggregates)      AS oldest_aggregate_month,
  date_trunc('month', now() - interval '5 years')::date           AS aggregate_retention_boundary,
  (SELECT count(*) FROM public.costing_subjects)                  AS costing_subjects_total,
  (SELECT count(*) FROM public.costing_subjects WHERE detached_at IS NOT NULL)
                                                                  AS costing_subjects_detached,
  (SELECT count(*) FROM public.costing_subjects
     WHERE detached_at IS NOT NULL AND auth_user_id IS NOT NULL)  AS detached_but_identity_remaining,
  (SELECT count(*) FROM public.costing_monthly_aggregates
     WHERE subject_count_suppressed)                              AS small_cohort_suppressed_aggregates;
