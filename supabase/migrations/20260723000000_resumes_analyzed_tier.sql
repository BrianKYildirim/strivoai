-- ═════════════════════════════════════════════════════════════════════════════
-- 260723-2b0 · Task 1 — resumes.analyzed_tier column + column-level GRANT tamper boundary
--
-- THE BUG THIS PREVENTS (tier is not yet recorded, and a naive column would be forgeable)
--   Resume Analysis has no durable record of WHICH membership tier produced a given
--   analysis. `analysis_results.raw_response.metadata.tier` is a best-effort mirror that
--   nothing in src/ reads and that can be NULL. Without a queryable tier on the row the UI
--   reads (`public.resumes`), an upgraded (Elite) user is silently shown their old FREE
--   analysis under the paid layout — a product AND trust defect (see 260723-2b0 objective).
--
--   Adding a plain `analyzed_tier` column is NOT enough. `public.resumes` today has NO
--   column-level grants, so `authenticated` holds the Supabase DEFAULT table-wide
--   UPDATE/INSERT on every column. RLS gates ROWS, not COLUMNS — a table-wide grant lets
--   ANY authenticated user forge `analyzed_tier` (and grading_data, overall_score, …) on
--   their OWN row over PostgREST, permanently suppressing the paid rerun CTA. This is the
--   exact class of defect already suffered + repaired for career_targets in
--   20260712000001 / 20260712000003 — this migration applies the same column-level
--   GRANT/REVOKE pattern to resumes.
--
-- THE FIX
--   1. ADD COLUMN analyzed_tier text NULL (additive, idempotent).
--   2. CHECK (analyzed_tier IS NULL OR analyzed_tier IN ('free','elite')) — 'pro' is
--      DELIBERATELY excluded (see D-6 below).
--   3. Column-scoped GRANT UPDATE / GRANT INSERT for `authenticated` that EXCLUDE
--      analyzed_tier (and every other analysis-owned column), after REVOKEing the
--      table-wide grants that make the exclusion meaningful.
--
-- WHY 'pro' IS NOT IN THE ALLOWED SET (D-6)
--   `normalizeActiveTier` collapses pro -> elite everywhere in this codebase
--   (src/config/pricing-config.ts, supabase/functions/_shared/tier-config.ts:184), and
--   BOTH server tier-resolution paths already run it — the JWT path (_shared/auth.ts:158)
--   and the internal/worker path via resolveTierForUserId (auth.ts:258, wired at
--   analyze-resume/index.ts). So a correct write can never emit 'pro'. Rejecting it at the
--   database means a future regression that bypasses normalization fails LOUDLY, instead of
--   silently writing a row that the client cache predicate (`analyzed_tier.eq.elite`, Task
--   6) will never match — which would start charging merits for duplicate uploads that are
--   free today (the exact outcome D-1 exists to prevent).
--
-- NULL SEMANTICS (D-4) — NULL means UNKNOWN, never "free"
--   The Upload cache short-circuit treats NULL as matching any tier (legacy rows still
--   reused free of charge), while the Results CTA requires an explicit 'free' to appear
--   (unknown never triggers a charge prompt). Documented on the column COMMENT below.
--
-- WHY `anon` IS NOT REVOKED (deliberate, not an oversight)
--   `anon` retains the Supabase default table-wide grants, which LOOKS like an equivalent
--   hole but is not: every RLS policy on resumes keys on auth.uid()
--   (20251129_create_all_tables.sql:107-129), which is NULL for anon, so every anon row is
--   filtered out before column privileges are ever consulted. Revoking anon would be
--   defense-in-depth with a non-zero risk of breaking an unaudited pre-auth path
--   (e.g. MinimalHero.tsx), so it is out of scope by decision.
--
-- TWO TRAPS THIS NAVIGATES (both proven empirically by Task 2's authenticated-JWT test)
--   (a) A `session_user <> 'authenticated'` guard trigger ALWAYS passes under PostgREST
--       (PostgREST connects AS a role and SETs the request role) and is NOT a valid
--       defense. Column-level GRANT is the only thing that gates columns.
--   (b) PostgREST upsert requires column-level UPDATE on the ON CONFLICT column or every
--       write 403s — inserts included. None of the five resume writers use `.upsert()`
--       (Upload.tsx:154, Profile.tsx:177 + :200, Auth.tsx:55 all use plain `.insert()` /
--       `.update().eq('id')`), which is why `id` is safely ABSENT from the UPDATE list.
--
-- ADDITIVE / IDEMPOTENT GUARANTEE
--   * ADD COLUMN IF NOT EXISTS + guarded CHECK add + idempotent GRANT/REVOKE. Re-runnable.
--   * No RLS policy is touched. No index is added — n_user_hash on (user_id, file_hash)
--     (20251116105037_...) already covers D-1's cache query.
--
-- ROLLBACK  (copy-paste inverse DDL — run top to bottom)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   -- Restore the table-wide grants (reopens the forgeable-tier hole — roll back only if
--   -- you are also reverting the feature that depends on the boundary).
--   GRANT UPDATE ON public.resumes TO authenticated;
--   GRANT INSERT ON public.resumes TO authenticated;
--   -- Drop the tamper column and its constraint.
--   ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_analyzed_tier_check;
--   ALTER TABLE public.resumes DROP COLUMN IF EXISTS analyzed_tier;
--   COMMIT;
-- ---------------------------------------------------------------------------

-- 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS analyzed_tier text NULL;

-- 2. CHECK constraint (idempotent add) ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.resumes
    ADD CONSTRAINT resumes_analyzed_tier_check
    CHECK (analyzed_tier IS NULL OR analyzed_tier IN ('free','elite'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Documentation ──────────────────────────────────────────────────────────
COMMENT ON COLUMN public.resumes.analyzed_tier IS
  'Membership tier that produced this analysis. Written ONLY by the service-role '
  'analyze-resume save (completeAndRecordSuccess). Values are the NORMALIZED active tiers '
  'free/elite (pro collapsed via normalizeActiveTier — see D-6). NULL means UNKNOWN, never '
  '"free": the Upload cache short-circuit treats NULL as matching any tier (legacy rows '
  'still reused, no charge) while the Results rerun CTA requires an explicit ''free'' to '
  'render (unknown never prompts a charge) — the asymmetric D-4 semantics. Not writable by '
  'authenticated (excluded from the column-level GRANT below).';

-- 4. The tamper boundary ────────────────────────────────────────────────────
--    Column-level grants only take effect once the table-wide grant is revoked. The
--    EXCLUSIONS are the point: analyzed_tier, grading_data, overall_score, analyzed_at,
--    email_sent_at, archive_path, id, created_at, updated_at are analysis-/system-owned
--    and must NEVER appear in either list. The UPDATE list is exactly the columns the
--    client writers touch (Profile.tsx:200-206 extraction fields + the file identity
--    columns); the INSERT list is exactly what Upload.tsx:154-161 / Profile.tsx:177-184 /
--    Auth.tsx:55-62 insert, PLUS extracted_text/text_hash which Task 8's clone insert needs.
--
--    DO NOT "simplify" this back to a blanket `GRANT UPDATE ON public.resumes` — that
--    reopens the forgeable-tier hole this design exists to close. Widen ONE column at a
--    time, deliberately.
REVOKE UPDATE ON public.resumes FROM authenticated;
GRANT UPDATE (file_name, file_url, file_path, file_hash, file_size,
              extracted_text, text_hash, document_hash, extraction_version,
              extraction_metadata)
  ON public.resumes TO authenticated;

REVOKE INSERT ON public.resumes FROM authenticated;
GRANT INSERT (user_id, file_name, file_url, file_path, file_hash, file_size,
              extracted_text, text_hash, document_hash, extraction_version,
              extraction_metadata)
  ON public.resumes TO authenticated;
