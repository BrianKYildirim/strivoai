-- Quick task 260712-msh · Migration A · "Anchor the product around ONE professional goal"
--
-- PURPOSE
--   Add the user's ONE professional goal (raw, verbatim) to public.career_targets,
--   plus the three TRIGGER-OWNED columns that persist the deterministic, ZERO-AI
--   Goal Readiness score computed by Migration B
--   (20260712000002_goal_readiness_scorer_and_triggers.sql).
--
--   Also creates public.goal_taxonomy — the role/industry reference list the SQL
--   scorer parses the goal against (CONTEXT §9e: deterministic goal parsing only,
--   no model call, ever). It is seeded from the SAME lists that src/lib/taxonomies.ts
--   exports and that Onboarding.tsx renders as Step-3 chips; an offline guard
--   (_shared/goal-readiness-guard.test.ts) asserts the two stay set-equal.
--
-- ADDITIVE GUARANTEE
--   * Every DDL statement is `IF NOT EXISTS` / `OR REPLACE` — the migration is
--     fully re-runnable and re-applying it is a no-op.
--   * NO column is dropped, retyped, or renamed. NO RLS policy is weakened.
--   * NO rows are written. professional_goal is NEVER backfilled from target_roles,
--     career_goals, resume content, or LinkedIn (CONTEXT §2) — the user types it.
--   * goal_readiness_* starts NULL for everyone and populates naturally the first
--     time Migration B's triggers fire on an evidence write.
--   * The pre-existing (legacy, ambiguous) career_goals column is NOT touched.
--
-- ROLLBACK  (copy-paste inverse DDL — run top to bottom)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   -- restore the pre-migration blanket table privileges
--   REVOKE INSERT, UPDATE ON public.career_targets FROM anon, authenticated;
--   GRANT  INSERT, UPDATE ON public.career_targets TO   anon, authenticated;
--
--   DROP INDEX IF EXISTS public.idx_analysis_results_user_type_created;
--   DROP INDEX IF EXISTS public.idx_resumes_user_created;
--
--   DROP TABLE IF EXISTS public.goal_taxonomy;
--
--   ALTER TABLE public.career_targets
--     DROP CONSTRAINT IF EXISTS career_targets_professional_goal_length_check;
--   ALTER TABLE public.career_targets
--     DROP COLUMN IF EXISTS goal_readiness_computed_at,
--     DROP COLUMN IF EXISTS goal_readiness_components,
--     DROP COLUMN IF EXISTS goal_readiness_score,
--     DROP COLUMN IF EXISTS professional_goal_set_at,
--     DROP COLUMN IF EXISTS professional_goal_structured,
--     DROP COLUMN IF EXISTS professional_goal;
--   COMMIT;
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- A. career_targets — the goal + the three trigger-owned readiness columns
-- ===========================================================================
-- Confirmed against the LIVE preview schema before writing this migration.
-- career_targets is one row per user (user_id is UNIQUE) and today carries
-- exactly 9 columns: id, user_id, target_industries, target_roles,
-- target_companies, location_preference, career_goals, created_at, updated_at.

ALTER TABLE public.career_targets
  -- The user's RAW wording. THE source of truth for display. Never overwritten by
  -- any derived form, never inferred, never auto-generated.
  ADD COLUMN IF NOT EXISTS professional_goal text NULL,

  -- Deterministically parsed { role, industry, location, opportunity_type, year }.
  -- Written ONLY by the Migration-B scorer (SECURITY DEFINER). Never by a client.
  ADD COLUMN IF NOT EXISTS professional_goal_structured jsonb NULL,

  ADD COLUMN IF NOT EXISTS professional_goal_set_at timestamptz NULL,

  -- ---- TRIGGER-OWNED (Migration B). Not client-writable — see section C. ----
  ADD COLUMN IF NOT EXISTS goal_readiness_score int NULL,
  ADD COLUMN IF NOT EXISTS goal_readiness_components jsonb NULL,
  ADD COLUMN IF NOT EXISTS goal_readiness_computed_at timestamptz NULL;

-- Bound the free text. This is NOT cosmetic: the scorer substring-matches the goal
-- against every goal_taxonomy term inside a trigger that fires on the analyze-resume
-- save tail (a money path). Unbounded free text there is a latency footgun.
-- 500 matches the sibling career_goals bound (20260525000001, line 55).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.career_targets'::regclass
       AND conname  = 'career_targets_professional_goal_length_check'
  ) THEN
    ALTER TABLE public.career_targets
      ADD CONSTRAINT career_targets_professional_goal_length_check
      CHECK (professional_goal IS NULL OR length(professional_goal) <= 500);
  END IF;
END
$$;

COMMENT ON COLUMN public.career_targets.professional_goal IS
  'The user''s ONE professional goal, in their RAW wording. Source of truth for display. Never inferred, never backfilled, never overwritten by a derived form.';
COMMENT ON COLUMN public.career_targets.professional_goal_structured IS
  'Deterministically parsed goal { role, industry, location, opportunity_type, year }. Written ONLY by compute_goal_readiness(). Zero AI.';
COMMENT ON COLUMN public.career_targets.goal_readiness_score IS
  'TRIGGER-OWNED. Persisted 0-100 renormalized Goal Readiness score. NULL when no component is evidenced. Not client-writable (column-level GRANTs, see 20260712000001 section C).';
COMMENT ON COLUMN public.career_targets.goal_readiness_components IS
  'TRIGGER-OWNED. Full rubric breakdown: components[] + interpretation + partial_evidence + evidenced_weight + blockers[].';
COMMENT ON COLUMN public.career_targets.goal_readiness_computed_at IS
  'TRIGGER-OWNED. When compute_goal_readiness() last wrote the score.';


-- ===========================================================================
-- B. goal_taxonomy — the deterministic goal-parsing reference list (§9e)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.goal_taxonomy (
  kind text NOT NULL CHECK (kind IN ('role', 'industry')),
  term text NOT NULL,
  PRIMARY KEY (kind, term)
);

ALTER TABLE public.goal_taxonomy ENABLE ROW LEVEL SECURITY;

-- A public reference list. No user data. Readable by signed-in users; never
-- writable by a client (no INSERT/UPDATE/DELETE policy exists, and the table
-- privileges below withhold them).
DROP POLICY IF EXISTS goal_taxonomy_select_authenticated ON public.goal_taxonomy;
CREATE POLICY goal_taxonomy_select_authenticated
  ON public.goal_taxonomy
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.goal_taxonomy FROM anon, authenticated;
GRANT SELECT ON public.goal_taxonomy TO authenticated;

-- Seed — MIRRORS src/lib/taxonomies.ts EXACTLY (ROLE_OPTIONS -> kind='role',
-- INTEREST_OPTIONS -> kind='industry'). Idempotent. If you edit one side you MUST
-- edit the other: _shared/goal-readiness-guard.test.ts parses both and fails closed
-- on any drift.
INSERT INTO public.goal_taxonomy (kind, term) VALUES
  ('role', 'Investment Banking'),
  ('role', 'Private Equity'),
  ('role', 'Venture Capital'),
  ('role', 'Management Consulting'),
  ('role', 'Corporate Strategy'),
  ('role', 'Accounting'),
  ('role', 'Financial Analysis'),
  ('role', 'Software Engineering'),
  ('role', 'Data Science'),
  ('role', 'Machine Learning'),
  ('role', 'Product Management'),
  ('role', 'UX/UI Design'),
  ('role', 'DevOps'),
  ('role', 'Cybersecurity'),
  ('role', 'Pre-Med'),
  ('role', 'Clinical Research'),
  ('role', 'Biotech Research'),
  ('role', 'Pharmaceutical'),
  ('role', 'Nursing'),
  ('role', 'Public Health'),
  ('role', 'Research (Academic)'),
  ('role', 'Graduate Studies'),
  ('role', 'Teaching/Education'),
  ('role', 'Lab Research'),
  ('role', 'Marketing'),
  ('role', 'Journalism'),
  ('role', 'Content Creation'),
  ('role', 'Graphic Design'),
  ('role', 'Film/Media Production'),
  ('role', 'Law/Legal'),
  ('role', 'Public Policy'),
  ('role', 'Government'),
  ('role', 'Nonprofit'),
  ('role', 'Operations'),
  ('role', 'Human Resources'),
  ('role', 'Sales'),
  ('role', 'Supply Chain'),
  ('role', 'Real Estate'),
  ('role', 'Entrepreneurship'),
  ('industry', 'Finance'),
  ('industry', 'Investment Banking'),
  ('industry', 'Private Equity'),
  ('industry', 'Venture Capital'),
  ('industry', 'Asset Management'),
  ('industry', 'Insurance'),
  ('industry', 'Consulting'),
  ('industry', 'FinTech'),
  ('industry', 'Technology'),
  ('industry', 'E-commerce'),
  ('industry', 'Startups'),
  ('industry', 'Artificial Intelligence'),
  ('industry', 'Cybersecurity'),
  ('industry', 'Healthcare'),
  ('industry', 'Pharmaceuticals'),
  ('industry', 'Biotechnology'),
  ('industry', 'Life Sciences'),
  ('industry', 'Consumer Goods'),
  ('industry', 'Real Estate'),
  ('industry', 'Energy'),
  ('industry', 'Manufacturing'),
  ('industry', 'Retail'),
  ('industry', 'Automotive'),
  ('industry', 'Aerospace & Defense'),
  ('industry', 'Media & Entertainment'),
  ('industry', 'Advertising'),
  ('industry', 'Gaming'),
  ('industry', 'Sports'),
  ('industry', 'Legal'),
  ('industry', 'Accounting'),
  ('industry', 'Management Consulting'),
  ('industry', 'Professional Services'),
  ('industry', 'Government'),
  ('industry', 'Nonprofit'),
  ('industry', 'Education'),
  ('industry', 'Hospitality'),
  ('industry', 'Transportation'),
  ('industry', 'Logistics'),
  ('industry', 'Agriculture'),
  ('industry', 'Telecommunications')
ON CONFLICT (kind, term) DO NOTHING;


-- ===========================================================================
-- C. TAMPER-RESISTANCE (§9c) — COLUMN-LEVEL PRIVILEGES, not a guard trigger
-- ===========================================================================
-- The three goal_readiness_* columns (and professional_goal_structured) must NOT be
-- client-writable. RLS does NOT do this: RLS gates ROWS, not COLUMNS. A user passing
-- the owner-scoped RLS policy could otherwise `update career_targets set
-- goal_readiness_score = 100` on their own row and forge the number.
--
-- DO NOT "fix" this with a `session_user <> 'authenticated'` guard trigger.
-- PostgREST connects as the LOGIN role `authenticator` and then does
-- `SET LOCAL ROLE authenticated`. session_user therefore stays `authenticator` and is
-- NEVER `authenticated` — such a guard ALWAYS passes, silently leaving the score
-- fully client-writable while every test still goes green. Column-level GRANTs are
-- enforced by the engine itself and cannot be spoofed.
--
-- The Migration-B scorer is SECURITY DEFINER, runs as the table owner, and is
-- therefore unaffected by these grants — it can still write the readiness columns.
--
-- Existing owner-scoped RLS on career_targets is UNCHANGED. These grants are an
-- ADDITIONAL, narrower layer on top. anon keeps no write privilege (it never had a
-- usable one — every career_targets policy is TO authenticated).

REVOKE INSERT, UPDATE ON public.career_targets FROM anon, authenticated;

-- Client-writable columns ONLY. id / created_at / updated_at are defaulted and are
-- not sent by the client's upsert, so they need no grant. Note the EXCLUSIONS:
-- professional_goal_structured, goal_readiness_score, goal_readiness_components,
-- goal_readiness_computed_at.
GRANT INSERT (user_id, target_roles, target_industries, target_companies,
              location_preference, career_goals, professional_goal,
              professional_goal_set_at)
  ON public.career_targets TO authenticated;

GRANT UPDATE (target_roles, target_industries, target_companies,
              location_preference, career_goals, professional_goal,
              professional_goal_set_at)
  ON public.career_targets TO authenticated;


-- ===========================================================================
-- D. Indexes the scorer's "latest row" lookups need (MONEY-PATH LATENCY)
-- ===========================================================================
-- The Migration-B scorer runs INSIDE the caller's statement, and one of its callers
-- is the trigger on `resumes` — which fires on the analyze-resume refund-boundary
-- save tail. `EXCEPTION WHEN OTHERS` catches scorer ERRORS but does NOT catch
-- `statement_timeout`: a seq-scan here could abort a user's resume save. Neither of
-- these indexes exists today (verified against preview).
CREATE INDEX IF NOT EXISTS idx_resumes_user_created
  ON public.resumes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_results_user_type_created
  ON public.analysis_results (user_id, analysis_type, created_at DESC);

-- linkedin_grades already has idx_linkedin_grades_user_created (user_id, created_at DESC).
-- Deliberately NOT re-created.
