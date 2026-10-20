-- Quick task 260712-msh · Migration B · Deterministic ZERO-AI Goal Readiness scorer
--
-- PURPOSE
--   A pure plpgsql scorer that reads ONLY already-persisted Strivo evidence
--   (CONTEXT §9d), renormalizes over EVIDENCED components only (§8d), and PERSISTS
--   the score + full breakdown into career_targets. AFTER triggers on all four
--   evidence tables recompute it on EVERY write path — edge function, worker,
--   client, admin, backfill — so no code path can be missed.
--
-- ZERO AI, STRUCTURALLY (§9a/§9b)
--   There is no pg_net, no http, no net.*, no external call of any kind in this file.
--   SQL cannot call Anthropic. Goal Readiness therefore adds ZERO incremental AI
--   calls and ZERO incremental token cost, by construction rather than by discipline.
--   _shared/goal-readiness-guard.test.ts fail-closes on any reintroduction.
--
-- ADDITIVE
--   CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER.
--   Fully re-runnable; re-applying is a no-op. No table, column, or policy is altered.
--
-- ROLLBACK  (copy-paste inverse DDL — run top to bottom)
-- ---------------------------------------------------------------------------
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_ins  ON public.resumes;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_upd  ON public.resumes;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_ins ON public.linkedin_grades;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_upd ON public.linkedin_grades;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_ins ON public.analysis_results;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_upd ON public.analysis_results;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_targets_ins  ON public.career_targets;
--   DROP TRIGGER IF EXISTS trg_goal_readiness_targets_upd  ON public.career_targets;
--   DROP FUNCTION IF EXISTS public.tg_goal_readiness();
--   DROP FUNCTION IF EXISTS public.compute_goal_readiness(uuid);
--   DROP FUNCTION IF EXISTS public.parse_professional_goal(text);
--   DROP FUNCTION IF EXISTS public.goal_readiness_tokens(text);
--   DROP FUNCTION IF EXISTS public.goal_readiness_flatten(jsonb);
--   DROP FUNCTION IF EXISTS public.goal_readiness_arrlen(jsonb);
--   -- (the persisted values stay in place; Migration A's ROLLBACK drops the columns)
--   COMMIT;
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 0. Deterministic text helpers (pure, IMMUTABLE, no I/O)
-- ===========================================================================

-- Lowercase word tokens of length >= 4, deduped, SORTED (sorting keeps every
-- downstream set operation reproducible — §9f purity).
CREATE OR REPLACE FUNCTION public.goal_readiness_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), ARRAY[]::text[])
    FROM unnest(regexp_split_to_array(lower(COALESCE(p_text, '')), '[^a-z0-9]+')) AS t
   WHERE length(t) >= 4;
$$;

-- Flatten a jsonb ARRAY into a single text blob for tokenizing. Type-guarded: any
-- non-array (incl. NULL / object / scalar) yields '' rather than raising.
CREATE OR REPLACE FUNCTION public.goal_readiness_flatten(p_json jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(v, ' '), '')
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(p_json) = 'array' THEN p_json ELSE '[]'::jsonb END
         ) AS v;
$$;

-- jsonb array length, type-guarded (non-array => 0, never an exception).
CREATE OR REPLACE FUNCTION public.goal_readiness_arrlen(p_json jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p_json) = 'array' THEN jsonb_array_length(p_json) ELSE 0 END;
$$;


-- ===========================================================================
-- A. Deterministic goal parsing (§9e) — NO model call, ever.
-- ===========================================================================
-- The user's RAW professional_goal is NEVER modified. This produces a nullable
-- STRUCTURED view of it, written only to professional_goal_structured.
CREATE OR REPLACE FUNCTION public.parse_professional_goal(p_goal text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_norm        text;
  v_role        text;
  v_industry    text;
  v_year        text;
  v_opportunity text;
  v_location    text;
  v_kw          text;
BEGIN
  IF p_goal IS NULL OR btrim(p_goal) = '' THEN
    RETURN NULL;
  END IF;

  v_norm := lower(p_goal);

  -- role / industry: case-insensitive substring match against the goal_taxonomy
  -- reference list seeded by Migration A from src/lib/taxonomies.ts.
  -- LONGEST MATCH WINS; deterministic tie-break by term length DESC then term ASC.
  SELECT t.term INTO v_role
    FROM public.goal_taxonomy t
   WHERE t.kind = 'role'
     AND position(lower(t.term) IN v_norm) > 0
   ORDER BY length(t.term) DESC, t.term ASC
   LIMIT 1;

  SELECT t.term INTO v_industry
    FROM public.goal_taxonomy t
   WHERE t.kind = 'industry'
     AND position(lower(t.term) IN v_norm) > 0
   ORDER BY length(t.term) DESC, t.term ASC
   LIMIT 1;

  -- year: first 4-digit 20xx.
  v_year := substring(p_goal FROM '(20[0-9]{2})');

  -- opportunity type: small FIXED keyword list, scanned in a fixed order.
  FOREACH v_kw IN ARRAY ARRAY[
    'internship', 'co-op', 'full-time', 'graduate', 'apprenticeship',
    'fellowship', 'analyst', 'associate', 'placement'
  ]
  LOOP
    IF position(v_kw IN v_norm) > 0 THEN
      v_opportunity := v_kw;
      EXIT;
    END IF;
  END LOOP;

  -- location: best-effort only — the capitalized token(s) directly after the word
  -- "in". NEVER guesses: if the pattern does not match, the field stays NULL.
  -- ("Investment Banking Internship in New York — 2027" -> "New York")
  v_location := (regexp_match(p_goal, '\yin\s+([A-Z][A-Za-z.''-]*(?:\s+[A-Z][A-Za-z.''-]*){0,2})'))[1];
  IF v_location IS NOT NULL AND btrim(v_location) = '' THEN
    v_location := NULL;
  END IF;

  RETURN jsonb_build_object(
    'role',             v_role,
    'industry',         v_industry,
    'location',         v_location,
    'opportunity_type', v_opportunity,
    'year',             v_year
  );
END;
$$;


-- ===========================================================================
-- B. compute_goal_readiness — the ONE scoring implementation in the system.
-- ===========================================================================
-- There is NO parallel scorer. src/lib/dashboard-intelligence/goal-readiness.ts is a
-- READ-ONLY PARSER of the breakdown this function persists and contains no scoring
-- math. Keep it that way — dual implementations drift.
CREATE OR REPLACE FUNCTION public.compute_goal_readiness(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal            text;
  v_structured      jsonb;

  v_resume_score    int;
  v_resume_gd       jsonb;
  v_li_score        int;
  v_li_gd           jsonb;
  v_lens            jsonb;
  v_target_roles    text[];
  v_target_inds     text[];

  v_goal_terms      text[];
  v_tmp             text[];
  v_res_align_text  text;
  v_res_tokens      text[];
  v_li_tokens       text[];

  v_hits            int;
  v_overlap         int;
  v_den_t           int;
  v_base            numeric;
  v_lens_matched    int;
  v_lens_missing    int;
  v_kw_gap          int;
  v_strengths_n     int;
  v_prio_n          int;

  v_c_resume int := 0;  v_e_resume boolean := false;
  v_c_align  int := 0;  v_e_align  boolean := false;
  v_c_ats    int := 0;  v_e_ats    boolean := false;
  v_c_li     int := 0;  v_e_li     boolean := false;
  v_c_depth  int := 0;  v_e_depth  boolean := false;
  v_c_cons   int := 0;  v_e_cons   boolean := false;

  v_components    jsonb;
  v_num           numeric;
  v_den           numeric;
  v_score         int;
  v_interp        text;
  v_blockers      jsonb;
  v_payload       jsonb;
BEGIN
  -- =========================================================================
  -- MONEY-PATH EARLY EXIT — DO NOT REMOVE, DO NOT MOVE BELOW THIS POINT.
  -- =========================================================================
  -- This function runs INSIDE the caller's statement. One of its callers is the
  -- AFTER INSERT trigger on `resumes`, which fires on the analyze-resume
  -- refund-boundary save tail (a money path). The EXCEPTION handler at the bottom
  -- catches scorer ERRORS but does NOT catch `statement_timeout` — a slow scorer can
  -- abort the user's resume save itself.
  --
  -- So: one indexed lookup, then out. This is the common case AND it is ALWAYS the
  -- case during onboarding (the resumes INSERT lands BEFORE the goal is saved).
  -- Everything below runs only for users who actually have a goal.
  SELECT ct.professional_goal, ct.target_roles, ct.target_industries
    INTO v_goal, v_target_roles, v_target_inds
    FROM public.career_targets ct
   WHERE ct.user_id = p_user_id;

  IF NOT FOUND OR v_goal IS NULL OR btrim(v_goal) = '' THEN
    RETURN;
  END IF;

  v_structured := public.parse_professional_goal(v_goal);

  -- =========================================================================
  -- Read ONLY already-persisted evidence (§9d).
  -- "Latest" is always ORDER BY created_at DESC, id DESC LIMIT 1 — no ordering
  -- ambiguity, so the function stays a pure function of the persisted rows (§9f).
  -- =========================================================================
  SELECT r.overall_score, r.grading_data
    INTO v_resume_score, v_resume_gd
    FROM public.resumes r
   WHERE r.user_id = p_user_id
     AND r.overall_score IS NOT NULL
   ORDER BY r.created_at DESC, r.id DESC
   LIMIT 1;

  -- linkedin_grades.user_id AND created_at are both NULLABLE (unlike the others).
  SELECT g.overall_score, g.grading_data
    INTO v_li_score, v_li_gd
    FROM public.linkedin_grades g
   WHERE g.user_id = p_user_id
   ORDER BY g.created_at DESC NULLS LAST, g.id DESC
   LIMIT 1;

  SELECT a.raw_response
    INTO v_lens
    FROM public.analysis_results a
   WHERE a.user_id = p_user_id
     AND a.analysis_type = 'recruiting_lens'
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT 1;

  -- ---- goal terms: parsed role/industry + the user's selected targets ----------
  v_goal_terms := ARRAY[]::text[];
  IF v_structured->>'role'     IS NOT NULL THEN v_goal_terms := v_goal_terms || lower(v_structured->>'role');     END IF;
  IF v_structured->>'industry' IS NOT NULL THEN v_goal_terms := v_goal_terms || lower(v_structured->>'industry'); END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(btrim(t)) ORDER BY lower(btrim(t))), ARRAY[]::text[])
    INTO v_tmp
    FROM unnest(COALESCE(v_target_roles, ARRAY[]::text[]) || COALESCE(v_target_inds, ARRAY[]::text[])) AS t
   WHERE btrim(t) <> '';
  v_goal_terms := v_goal_terms || v_tmp;

  SELECT COALESCE(array_agg(DISTINCT g ORDER BY g), ARRAY[]::text[])
    INTO v_goal_terms
    FROM unnest(v_goal_terms) AS g;

  -- =========================================================================
  -- COMPONENT 1 — resume_quality (weight 25)
  -- =========================================================================
  IF v_resume_score IS NOT NULL THEN
    v_c_resume := GREATEST(0, LEAST(100, v_resume_score));
    v_e_resume := true;
  END IF;

  -- =========================================================================
  -- COMPONENT 4 — linkedin_strength (weight 15)
  -- Computed early because component 3 (ATS) and 6 (consistency) reference it.
  -- MISSING LINKEDIN IS *MISSING DATA*, NEVER A ZERO. When no linkedin_grades row
  -- exists, evidenced=false and the component is dropped from BOTH the numerator
  -- AND the denominator below. It must never be scored 0 with its weight kept.
  -- =========================================================================
  IF v_li_score IS NOT NULL THEN
    v_c_li := GREATEST(0, LEAST(100, v_li_score));
    v_e_li := true;
  END IF;

  -- =========================================================================
  -- COMPONENT 3 — goal_keyword_coverage / "ATS Keyword Coverage" (weight 15)
  -- =========================================================================
  v_lens_matched := public.goal_readiness_arrlen(v_lens -> 'keywords' -> 'matched');
  v_lens_missing := public.goal_readiness_arrlen(v_lens -> 'keywords' -> 'missing');

  IF v_lens IS NOT NULL AND (v_lens_matched + v_lens_missing) > 0 THEN
    -- BEST evidence: a persisted Recruiting Lens run carries an explicit
    -- matched/missing keyword split. Real coverage.
    v_c_ats := ROUND(100.0 * v_lens_matched / (v_lens_matched + v_lens_missing))::int;
    v_e_ats := true;

  ELSIF v_e_resume AND jsonb_typeof(v_resume_gd -> 'recommendedKeywords') = 'array' THEN
    -- FALLBACK. NOTE THE DIRECTION: per the resume prompt contract
    -- (_shared/resume-prompts.ts), `recommendedKeywords` is
    -- "15-25 ATS keywords MISSING from resume" — it is a GAP list, NOT a coverage
    -- list. More entries therefore means WORSE coverage, so this term is INVERTED.
    -- (Free-tier analyses omit the field entirely, which is why this is guarded.)
    v_kw_gap := LEAST(public.goal_readiness_arrlen(v_resume_gd -> 'recommendedKeywords'), 25);
    v_c_ats  := GREATEST(0, LEAST(100, 100 - 3 * v_kw_gap));
    v_e_ats  := true;

  ELSE
    -- No keyword evidence at all -> MISSING DATA, renormalized out. Not a zero.
    v_c_ats := 0;
    v_e_ats := false;
  END IF;

  -- =========================================================================
  -- COMPONENT 2 — goal_alignment (weight 25)
  -- Deterministic goal <-> evidence match: how many of the goal's terms (parsed role
  -- + parsed industry + selected target roles/industries) actually appear in what the
  -- resume evidence says the user HAS. Scaled by ATS coverage when that is evidenced.
  -- =========================================================================
  v_res_align_text := lower(
    public.goal_readiness_flatten(v_resume_gd -> 'suggestedTargetRoles') || ' ' ||
    public.goal_readiness_flatten(v_resume_gd -> 'strengths') || ' ' ||
    public.goal_readiness_flatten(v_resume_gd -> 'executiveSummary' -> 'keyStrengths') || ' ' ||
    COALESCE(v_resume_gd ->> 'industryGuess', '')
  );
  -- NB: recommendedKeywords is deliberately EXCLUDED here — it is what the resume is
  -- MISSING, so it is not evidence of alignment.

  IF v_e_resume
     AND COALESCE(array_length(v_goal_terms, 1), 0) > 0
     AND btrim(v_res_align_text) <> ''
  THEN
    SELECT count(*) INTO v_hits
      FROM unnest(v_goal_terms) AS t
     WHERE position(t IN v_res_align_text) > 0;

    v_base := ROUND(100.0 * v_hits / array_length(v_goal_terms, 1));

    IF v_e_ats THEN
      -- Full ATS coverage leaves the base intact; zero coverage scales it to 65%.
      v_c_align := GREATEST(0, LEAST(100, ROUND(v_base * (0.65 + 0.35 * v_c_ats / 100.0))::int));
    ELSE
      v_c_align := GREATEST(0, LEAST(100, v_base::int));
    END IF;
    v_e_align := true;
  ELSE
    -- A goal we cannot deterministically anchor to ANY term (no taxonomy hit, no
    -- selected targets) is MISSING DATA, not a zero.
    v_c_align := 0;
    v_e_align := false;
  END IF;

  -- =========================================================================
  -- COMPONENT 5 — evidence_depth / "Demonstrated Impact" (weight 10)
  -- Monotone INCREASING in the resume's strengths, DECREASING in its priority
  -- improvements. Capped on both ends. Deterministic.
  -- =========================================================================
  IF v_e_resume AND v_resume_gd IS NOT NULL THEN
    v_strengths_n := LEAST(public.goal_readiness_arrlen(v_resume_gd -> 'strengths'), 6);
    v_prio_n      := LEAST(public.goal_readiness_arrlen(v_resume_gd -> 'priorityImprovements'), 6);
    v_c_depth     := GREATEST(0, LEAST(100, 40 + v_strengths_n * 10 - v_prio_n * 5));
    v_e_depth     := true;
  END IF;

  -- =========================================================================
  -- COMPONENT 6 — profile_consistency (weight 10)
  -- Deterministic token overlap between what the RESUME says the user is and what
  -- LINKEDIN says. Requires BOTH; otherwise MISSING DATA.
  -- =========================================================================
  IF v_e_resume AND v_e_li THEN
    v_res_tokens := public.goal_readiness_tokens(
      public.goal_readiness_flatten(v_resume_gd -> 'suggestedTargetRoles') || ' ' ||
      public.goal_readiness_flatten(v_resume_gd -> 'strengths') || ' ' ||
      COALESCE(v_resume_gd ->> 'industryGuess', '')
    );
    v_li_tokens := public.goal_readiness_tokens(
      public.goal_readiness_flatten(v_li_gd -> 'keyStrengths') || ' ' ||
      public.goal_readiness_flatten(v_li_gd -> 'profileInsights') || ' ' ||
      public.goal_readiness_flatten(v_li_gd -> 'sectionBreakdown')
    );

    v_den_t := LEAST(
      COALESCE(array_length(v_res_tokens, 1), 0),
      COALESCE(array_length(v_li_tokens, 1), 0)
    );

    IF v_den_t > 0 THEN
      SELECT count(*) INTO v_overlap
        FROM unnest(v_res_tokens) AS x
       WHERE x = ANY (v_li_tokens);
      v_c_cons := GREATEST(0, LEAST(100, ROUND(100.0 * v_overlap / v_den_t)::int));
      v_e_cons := true;
    END IF;
  END IF;

  -- =========================================================================
  -- THE RUBRIC. Weights sum to 100.
  -- =========================================================================
  v_components := jsonb_build_array(
    jsonb_build_object('id','resume_quality',       'label','Resume Quality',       'weight',25,'score',v_c_resume,'evidenced',v_e_resume),
    jsonb_build_object('id','goal_alignment',       'label','Goal Alignment',       'weight',25,'score',v_c_align, 'evidenced',v_e_align),
    jsonb_build_object('id','goal_keyword_coverage','label','ATS Keyword Coverage', 'weight',15,'score',v_c_ats,   'evidenced',v_e_ats),
    jsonb_build_object('id','linkedin_strength',    'label','LinkedIn Strength',    'weight',15,'score',v_c_li,    'evidenced',v_e_li),
    jsonb_build_object('id','evidence_depth',       'label','Demonstrated Impact',  'weight',10,'score',v_c_depth, 'evidenced',v_e_depth),
    jsonb_build_object('id','profile_consistency',  'label','Profile Consistency',  'weight',10,'score',v_c_cons,  'evidenced',v_e_cons)
  );

  -- =========================================================================
  -- RENORMALIZATION (§8d) — THE LOAD-BEARING FORMULA.
  --
  --   score = round(100 * SUM(score/100 * weight) FILTER (evidenced)
  --                     /  SUM(weight)            FILTER (evidenced))
  --
  -- Un-evidenced components are dropped from BOTH the numerator AND the denominator.
  -- They are NEVER scored 0, and they NEVER lower the achievable ceiling.
  --
  -- DO NOT "simplify" this into a plain sum over all six weights. That is what
  -- normalizeFromSections (grade-linkedin/schema.ts) does, and it is EXACTLY the
  -- silent missing-LinkedIn penalty this design bans. There is no repo precedent for
  -- true renormalization — cite none.
  -- =========================================================================
  SELECT
    SUM(((c->>'score')::numeric / 100.0) * (c->>'weight')::numeric)
      FILTER (WHERE (c->>'evidenced')::boolean),
    SUM((c->>'weight')::numeric)
      FILTER (WHERE (c->>'evidenced')::boolean)
    INTO v_num, v_den
    FROM jsonb_array_elements(v_components) AS c;

  IF v_den IS NULL OR v_den = 0 THEN
    v_score := NULL;
  ELSE
    v_score := ROUND(100.0 * v_num / v_den)::int;
  END IF;

  -- ---- interpretation: how strongly the profile SUPPORTS the goal. --------------
  -- NEVER offer/hire/interview probability language.
  v_interp := CASE
    WHEN v_score IS NULL THEN 'Strivo does not have enough evidence yet to measure how strongly your profile supports this goal.'
    WHEN v_score >= 85   THEN 'On the evidence Strivo can see, your profile strongly supports this goal.'
    WHEN v_score >= 70   THEN 'On the evidence Strivo can see, your profile solidly supports this goal, with clear room to strengthen the areas below.'
    WHEN v_score >= 50   THEN 'On the evidence Strivo can see, your profile partially supports this goal. The items below are what is holding it back.'
    ELSE                      'On the evidence Strivo can see, your profile does not yet support this goal. Start with the items below.'
  END;

  -- ---- blockers: un-evidenced components first (by weight), then the weakest
  --      evidenced ones. Deterministically ordered, capped at 4. --------------
  SELECT COALESCE(jsonb_agg(b.txt ORDER BY b.rank, b.sort_a, b.sort_b), '[]'::jsonb)
    INTO v_blockers
    FROM (
      SELECT 1                                             AS rank,
             -(c->>'weight')::int                          AS sort_a,
             (c->>'id')                                    AS sort_b,
             'Add ' || (c->>'label') || ' — Strivo has no evidence for it yet' AS txt
        FROM jsonb_array_elements(v_components) AS c
       WHERE NOT (c->>'evidenced')::boolean
      UNION ALL
      SELECT 2                                             AS rank,
             (c->>'score')::int                            AS sort_a,
             (c->>'id')                                    AS sort_b,
             (c->>'label') || ' is one of your weakest evidenced signals (' || (c->>'score') || ')' AS txt
        FROM jsonb_array_elements(v_components) AS c
       WHERE (c->>'evidenced')::boolean
         AND (c->>'score')::int < 70
      LIMIT 100
    ) AS b
   WHERE b.rank IS NOT NULL;

  -- keep only the first 4, preserving the deterministic order
  SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
    INTO v_blockers
    FROM (
      SELECT e, ord FROM jsonb_array_elements(v_blockers) WITH ORDINALITY AS x(e, ord)
       ORDER BY ord LIMIT 4
    ) AS lim;

  v_payload := jsonb_build_object(
    'components',       v_components,
    'interpretation',   v_interp,
    -- what the §9f "computed from PARTIAL evidence" UI indicator reads:
    'partial_evidence', (COALESCE(v_den, 0) < 100),
    -- so the UI can honestly say "based on N% of the rubric":
    'evidenced_weight', COALESCE(v_den, 0)::int,
    'blockers',         v_blockers
  );

  -- =========================================================================
  -- PERSIST — *UPDATE*, NEVER an upsert/INSERT.
  --
  -- An `INSERT ... ON CONFLICT` here would re-fire the UNCONDITIONAL AFTER INSERT
  -- trigger on career_targets (which has no WHEN clause and therefore no recursion
  -- guard). The early-return above already guarantees the row exists.
  --
  -- The AFTER UPDATE trigger on career_targets is column-scoped
  -- (professional_goal / target_roles / target_industries). NONE of the four columns
  -- written here appear in that predicate — so this write-back CANNOT re-fire it.
  -- That column-scoped WHEN clause is the recursion guard.
  -- =========================================================================
  -- PURITY (§9f): the SCORE is a pure function of the persisted rows. No random(), no
  -- clock reading anywhere in the math, no ordering ambiguity. clock_timestamp() is
  -- stamped ONLY into computed_at (and deliberately kept OUT of
  -- goal_readiness_components, so "same evidence in -> byte-identical breakdown out"
  -- holds). clock_timestamp() rather than now() because now() is TRANSACTION-start
  -- time: two evidence writes inside one transaction would otherwise stamp an
  -- identical computed_at and the value would not observably advance.
  UPDATE public.career_targets
     SET goal_readiness_score        = v_score,
         goal_readiness_components   = v_payload,
         goal_readiness_computed_at  = clock_timestamp(),
         professional_goal_structured = v_structured
   WHERE user_id = p_user_id;

EXCEPTION WHEN OTHERS THEN
  -- RESILIENCE: a scoring failure must NEVER abort the underlying evidence write.
  -- Losing a user's resume analysis because a readiness recompute blew up is not an
  -- acceptable trade. The score simply stays stale until the next evidence write.
  RAISE WARNING '[goal_readiness] compute_goal_readiness failed for user %: % (%)',
    p_user_id, SQLERRM, SQLSTATE;
  RETURN;
END;
$$;


-- ===========================================================================
-- C. Trigger plumbing
-- ===========================================================================
-- SECURITY DEFINER is REQUIRED here, not optional: compute_goal_readiness has EXECUTE
-- revoked from anon AND authenticated (section D). A SECURITY INVOKER trigger function
-- would run as the invoking role — `authenticated` for a client write — and fail with
-- "permission denied for function compute_goal_readiness", which the scorer's own
-- EXCEPTION handler would then swallow, leaving the score silently never computed.
CREATE OR REPLACE FUNCTION public.tg_goal_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.compute_goal_readiness(NEW.user_id);
  END IF;
  RETURN NULL;  -- AFTER trigger: the return value is ignored
END;
$$;


-- ===========================================================================
-- D. THE TRIGGERS — the unmissable part. INSERT AND UPDATE ARE SPLIT.
-- ===========================================================================
-- A single `AFTER INSERT OR UPDATE ... WHEN (OLD.col IS DISTINCT FROM NEW.col)` DOES
-- NOT COMPILE: Postgres raises "ERROR: OLD cannot be referenced in ON INSERT trigger".
-- And that WHEN clause IS the recursion guard, so it cannot simply be dropped.
-- Every conditional trigger is therefore TWO triggers.
--
-- DO NOT replace the WHEN clause with pg_trigger_depth(). Inside a trigger
-- pg_trigger_depth() is ALREADY >= 1, so a `= 0` condition never fires at all — the
-- score would silently never recompute. The column-scoped WHEN is correct and
-- sufficient.
--
-- Evidence is written from 10+ edge functions AND client code. A DB trigger fires on
-- EVERY write path — edge function, worker, client, admin, backfill — regardless of
-- which code path wrote it, touches zero application code, and disturbs zero money
-- paths. A missed evidence table would mean a permanently stale score;
-- _shared/goal-readiness-guard.test.ts asserts all four tables keep BOTH triggers.

-- ---- resumes -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_ins ON public.resumes;
CREATE TRIGGER trg_goal_readiness_resumes_ins
  AFTER INSERT ON public.resumes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_goal_readiness();

DROP TRIGGER IF EXISTS trg_goal_readiness_resumes_upd ON public.resumes;
CREATE TRIGGER trg_goal_readiness_resumes_upd
  AFTER UPDATE ON public.resumes
  FOR EACH ROW
  WHEN (OLD.overall_score IS DISTINCT FROM NEW.overall_score
     OR OLD.grading_data  IS DISTINCT FROM NEW.grading_data)
  EXECUTE FUNCTION public.tg_goal_readiness();

-- ---- career_targets  (THE RECURSION GUARD) -----------------------------------
-- The scorer writes ONLY goal_readiness_* and professional_goal_structured. NONE of
-- them appear in the UPDATE predicate below, so the scorer's own write-back cannot
-- re-fire this trigger. Combined with "UPDATE, never INSERT" in section B, the
-- unconditional AFTER INSERT trigger is never reached by the scorer either.
DROP TRIGGER IF EXISTS trg_goal_readiness_targets_ins ON public.career_targets;
CREATE TRIGGER trg_goal_readiness_targets_ins
  AFTER INSERT ON public.career_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_goal_readiness();

DROP TRIGGER IF EXISTS trg_goal_readiness_targets_upd ON public.career_targets;
CREATE TRIGGER trg_goal_readiness_targets_upd
  AFTER UPDATE ON public.career_targets
  FOR EACH ROW
  WHEN (OLD.professional_goal IS DISTINCT FROM NEW.professional_goal
     OR OLD.target_roles      IS DISTINCT FROM NEW.target_roles
     OR OLD.target_industries IS DISTINCT FROM NEW.target_industries)
  EXECUTE FUNCTION public.tg_goal_readiness();

-- ---- linkedin_grades  (user_id is NULLABLE here, unlike the other three) -------
DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_ins ON public.linkedin_grades;
CREATE TRIGGER trg_goal_readiness_linkedin_ins
  AFTER INSERT ON public.linkedin_grades
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_goal_readiness();

DROP TRIGGER IF EXISTS trg_goal_readiness_linkedin_upd ON public.linkedin_grades;
CREATE TRIGGER trg_goal_readiness_linkedin_upd
  AFTER UPDATE ON public.linkedin_grades
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_goal_readiness();

-- ---- analysis_results  (insert-only in practice; cover UPDATE too) -------------
DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_ins ON public.analysis_results;
CREATE TRIGGER trg_goal_readiness_analysis_ins
  AFTER INSERT ON public.analysis_results
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_goal_readiness();

DROP TRIGGER IF EXISTS trg_goal_readiness_analysis_upd ON public.analysis_results;
CREATE TRIGGER trg_goal_readiness_analysis_upd
  AFTER UPDATE ON public.analysis_results
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_goal_readiness();


-- ===========================================================================
-- E. GRANTS — these functions are called by TRIGGERS ONLY.
-- ===========================================================================
-- Per project memory: on Supabase, `REVOKE ... FROM public` alone is NOT sufficient —
-- anon and authenticated hold their own default EXECUTE grants and must be revoked
-- EXPLICITLY.
REVOKE ALL ON FUNCTION public.compute_goal_readiness(uuid)    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.parse_professional_goal(text)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_goal_readiness()             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.goal_readiness_tokens(text)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.goal_readiness_flatten(jsonb)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.goal_readiness_arrlen(jsonb)    FROM public, anon, authenticated;
