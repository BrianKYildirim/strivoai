-- ROLLBACK for 20260804010000_sentence_aware_goal_parsing.sql
--
-- Reverts public.parse_professional_goal(text) to the ORIGINAL 5-key parser body from
-- 20260712000002_goal_readiness_scorer_and_triggers.sql (lines 86-155), verbatim.
--
-- SAFE TO RUN AT ANY TIME. Rows whose professional_goal_structured was already persisted
-- with the 11-key shape are harmless: every reader (compute_goal_readiness reads only
-- ->>'role' and ->>'industry'; the client type marks all six new fields optional) ignores
-- the extra keys, and each row re-collapses to 5 keys the next time any evidence trigger
-- fires for that user. No data migration, no backfill, no UPDATE is required.
--
-- CREATE OR REPLACE preserves the existing ACL, so the EXECUTE revokes from
-- public / anon / authenticated set by 20260712000002 survive this rollback.

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

COMMENT ON FUNCTION public.parse_professional_goal(text) IS NULL;
