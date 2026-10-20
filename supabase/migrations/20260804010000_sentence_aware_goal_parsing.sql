-- Quick task 260804-50q · Sentence-aware deterministic goal parsing
--
-- PURPOSE
--   Onboarding Step 4 now accepts one-to-two natural sentences as well as the short
--   em-dash phrase it was originally tuned for. This replaces the body of
--   public.parse_professional_goal(text) with a SENTENCE-AWARE parser that returns the
--   FIVE EXISTING KEYS WITH UNCHANGED SEMANTICS plus six additive nullable keys:
--   timeframe, seniority, company_type, long_term_direction, normalized_summary,
--   keywords.
--
--   It also fixes a real misfire: the old location regex captured the capitalized span
--   after "in" with nothing excluding taxonomy terms, so "experience in Private Equity"
--   was persisted as location = 'Private Equity'. Goal Readiness then scored against a
--   goal it had half-misread. The new location rule skips any candidate that is itself a
--   goal_taxonomy term, and NEVER guesses: no match means NULL.
--
-- ZERO AI, STRUCTURALLY
--   No pg_net, no http, no external call of any kind. This is plpgsql over already
--   persisted text. SQL cannot reach Anthropic, so this adds ZERO incremental AI calls
--   and ZERO incremental token cost by construction rather than by discipline.
--   The user's professional_goal is NEVER read by any edge function and therefore never
--   enters an LLM prompt at all. _shared/goal-readiness-guard.test.ts fail-closes on any
--   reintroduction of a call surface here.
--
-- ADDITIVE
--   ONE statement: CREATE OR REPLACE FUNCTION. The signature, LANGUAGE, volatility and
--   search_path are byte-identical to 20260712000002, so public.compute_goal_readiness
--   needs no edit, the trigger graph is untouched, and the existing ACL (EXECUTE revoked
--   from public/anon/authenticated) is preserved by CREATE OR REPLACE. No table, column,
--   constraint, policy, trigger or privilege is touched. No row is written.
--
--   The scorer reads only ->>'role' and ->>'industry' from this object. Those two values
--   are produced by the same longest-match-wins rule with the same deterministic
--   tie-break as before, so the rubric, the weights and the renormalization are unmoved
--   and NO EXISTING USER'S SCORE CHANGES.
--
-- LATENCY
--   The previous body scanned public.goal_taxonomy TWICE (once for role, once for
--   industry). This body scans it ONCE and derives both from the single ordered result,
--   so it is strictly faster. That matters: this runs inside an AFTER trigger on the
--   analyze-resume save tail, and statement_timeout is NOT caught by EXCEPTION WHEN OTHERS.
--
-- ROLLBACK
--   supabase/migrations/rollback/20260804010000_sentence_aware_goal_parsing.rollback.sql


CREATE OR REPLACE FUNCTION public.parse_professional_goal(p_goal text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_norm        text;
  v_flat        text;
  v_sentences   text[];
  v_kinds       text[];
  v_terms       text[];
  v_tax_terms   text[];
  v_role        text;
  v_industry    text;
  v_year        text;
  v_opportunity text;
  v_location    text;
  v_timeframe   text;
  v_seniority   text;
  v_company     text;
  v_direction   text;
  v_keywords    text[];
  v_summary     text;
  v_kw          text;
  v_cand        text;
  v_match       text[];
  v_idx         int;
  v_pos         int;

  -- Candidates that look like a place but never are. The 12 month names are included
  -- because "... in March 2027" would otherwise persist March as the user's location.
  c_place_stopwords constant text[] := ARRAY[
    'i', 'strivo', 'ideally', 'my', 'the',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  -- Cue phrases that mark a LATER ambition rather than the immediate goal.
  c_direction_cue constant text :=
    '\y(later|eventually|long[- ]term|longer[- ]term|down the line|ultimately|in the future|move into|transition into|pivot into|progress to|work towards|work toward)\y';
BEGIN
  IF p_goal IS NULL OR btrim(p_goal) = '' THEN
    RETURN NULL;
  END IF;

  -- v_norm is the legacy matching surface and stays EXACTLY as it was: lower(p_goal),
  -- newlines and all. v_flat is a whitespace-normalized COPY used only by the span
  -- regexes below, so a goal typed across two lines parses like one typed on one.
  -- Neither is ever written back: p_goal itself is never modified.
  v_norm := lower(p_goal);
  v_flat := regexp_replace(btrim(p_goal), '\s+', ' ', 'g');

  -- ── sentences (at most the first 4 — this bounds every loop below) ───────────
  SELECT COALESCE(array_agg(q.s ORDER BY q.ord), ARRAY[]::text[])
    INTO v_sentences
    FROM (
      SELECT btrim(t.x) AS s, t.ord
        FROM unnest(regexp_split_to_array(v_flat, '[.;!?]+(\s+|$)')) WITH ORDINALITY AS t(x, ord)
       WHERE btrim(t.x) <> ''
       ORDER BY t.ord
       LIMIT 4
    ) AS q;

  -- ── ONE taxonomy scan (was two) ─────────────────────────────────────────────
  -- Both aggregates carry the SAME ORDER BY, so the two arrays are index-aligned and
  -- "first element whose kind = X" is exactly the old
  -- "WHERE kind = X ORDER BY length(term) DESC, term ASC LIMIT 1".
  -- role and industry are therefore byte-identical to the previous parser.
  SELECT
    COALESCE(array_agg(t.kind ORDER BY length(t.term) DESC, t.term ASC), ARRAY[]::text[]),
    COALESCE(array_agg(t.term ORDER BY length(t.term) DESC, t.term ASC), ARRAY[]::text[])
    INTO v_kinds, v_terms
    FROM public.goal_taxonomy t
   WHERE position(lower(t.term) IN v_norm) > 0;

  FOR v_idx IN 1 .. COALESCE(array_length(v_terms, 1), 0) LOOP
    IF v_role IS NULL AND v_kinds[v_idx] = 'role' THEN
      v_role := v_terms[v_idx];
    END IF;
    IF v_industry IS NULL AND v_kinds[v_idx] = 'industry' THEN
      v_industry := v_terms[v_idx];
    END IF;
    EXIT WHEN v_role IS NOT NULL AND v_industry IS NOT NULL;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT lower(x) ORDER BY lower(x)), ARRAY[]::text[])
    INTO v_tax_terms
    FROM unnest(v_terms) AS x;

  -- ── year: first 4-digit 20xx (unchanged) ────────────────────────────────────
  v_year := substring(p_goal FROM '(20[0-9]{2})');

  -- ── opportunity type ────────────────────────────────────────────────────────
  -- The original 9 terms keep their original ORDER and their original position. The new
  -- terms are APPENDED, never inserted before — so every input that resolved to a value
  -- before this migration resolves to the SAME value after it.
  FOREACH v_kw IN ARRAY ARRAY[
    'internship', 'co-op', 'full-time', 'graduate', 'apprenticeship',
    'fellowship', 'analyst', 'associate', 'placement',
    'summer analyst', 'off-cycle', 'spring week', 'insight',
    'residency', 'traineeship', 'part-time', 'contract'
  ]
  LOOP
    IF position(v_kw IN v_norm) > 0 THEN
      v_opportunity := v_kw;
      EXIT;
    END IF;
  END LOOP;

  -- ── location ────────────────────────────────────────────────────────────────
  -- Preposition-anchored capitalized spans, in document order, capped at the first 5.
  -- The FIRST candidate that is not blank, not a goal_taxonomy term, and not a known
  -- non-place wins. Everything else is NULL: this NEVER guesses.
  --
  -- The taxonomy exclusion is the actual bug fix. "...the experience needed for a role
  -- in Private Equity" used to persist location = 'Private Equity'.
  FOR v_match IN
    SELECT m.m
      FROM regexp_matches(
             v_flat,
             '(?:\ybased in\y|\ymoving to\y|\yrelocating to\y|\ymove to\y|\yin\y|\yat\y|\ynear\y)\s+([A-Z][A-Za-z.''-]*(?:\s+[A-Z][A-Za-z.''-]*){0,2})',
             'g'
           ) AS m(m)
     LIMIT 5
  LOOP
    v_cand := btrim(v_match[1]);
    IF v_cand = '' THEN
      CONTINUE;
    END IF;
    IF lower(v_cand) = ANY (v_tax_terms) THEN
      CONTINUE;
    END IF;
    IF lower(v_cand) = ANY (c_place_stopwords) THEN
      CONTINUE;
    END IF;
    v_location := v_cand;
    EXIT;
  END LOOP;

  -- ── timeframe (distinct from `year`: WHEN, not just which year) ─────────────
  -- Every group below is NON-CAPTURING on purpose: `substring(text FROM pattern)`
  -- returns capture group 1 when one exists, so a capturing group here would store
  -- 'summer' instead of 'summer 2027'.
  FOREACH v_kw IN ARRAY ARRAY[
    '(?:summer|fall|autumn|winter|spring)\s+20[0-9]{2}',
    'q[1-4]\s*20[0-9]{2}',
    'by (?:the )?end of 20[0-9]{2}',
    'by 20[0-9]{2}',
    '(?:with)?in (?:the )?next [0-9]{1,2} (?:months?|years?)',
    'next (?:summer|year|semester|term)',
    'this (?:summer|year|semester)',
    'after graduation',
    'post[- ]graduation',
    'long[- ]term'
  ]
  LOOP
    v_cand := substring(v_norm FROM v_kw);
    IF v_cand IS NOT NULL THEN
      v_timeframe := btrim(v_cand);
      EXIT;
    END IF;
  END LOOP;

  -- A bare year is still a timeframe. Only used when no explicit phrase matched.
  IF v_timeframe IS NULL AND v_year IS NOT NULL THEN
    v_timeframe := v_year;
  END IF;

  -- ── seniority: FIXED list, most specific first ──────────────────────────────
  FOREACH v_kw IN ARRAY ARRAY[
    'vice president', 'head of', 'c-suite', 'entry-level', 'mid-level',
    'intern', 'graduate', 'junior', 'senior', 'analyst', 'associate',
    'manager', 'director', 'principal', 'partner', 'lead', 'vp'
  ]
  LOOP
    IF position(v_kw IN v_norm) > 0 THEN
      v_seniority := v_kw;
      EXIT;
    END IF;
  END LOOP;

  -- ── company_type: FIXED list, longest first ─────────────────────────────────
  FOREACH v_kw IN ARRAY ARRAY[
    'leading global bank', 'bulge bracket', 'bulge-bracket', 'elite boutique',
    'middle market', 'hedge fund', 'asset manager', 'investment bank',
    'research lab', 'public sector', 'big tech', 'fortune 500', 'big four',
    'big 4', 'mbb', 'faang', 'boutique', 'startup', 'start-up', 'scale-up',
    'unicorn', 'consultancy', 'agency', 'nonprofit', 'ngo', 'government',
    'academia', 'global bank', 'bank'
  ]
  LOOP
    IF position(v_kw IN v_norm) > 0 THEN
      v_company := v_kw;
      EXIT;
    END IF;
  END LOOP;

  -- ── long_term_direction ─────────────────────────────────────────────────────
  -- The user's own later-ambition clause, captured VERBATIM (their casing, their words).
  -- Preferred source is a sentence AFTER the first one; a single-sentence goal falls back
  -- to the tail of sentence 1 from the cue onwards.
  FOR v_idx IN 2 .. COALESCE(array_length(v_sentences, 1), 0) LOOP
    IF v_sentences[v_idx] ~* c_direction_cue THEN
      v_direction := left(btrim(v_sentences[v_idx]), 200);
      EXIT;
    END IF;
  END LOOP;

  IF v_direction IS NULL AND COALESCE(array_length(v_sentences, 1), 0) >= 1 THEN
    v_cand := (regexp_match(v_sentences[1], c_direction_cue, 'i'))[1];
    IF v_cand IS NOT NULL THEN
      v_pos := position(lower(v_cand) IN lower(v_sentences[1]));
      IF v_pos > 0 THEN
        v_direction := left(btrim(substr(v_sentences[1], v_pos)), 200);
      END IF;
    END IF;
  END IF;

  -- ── keywords ────────────────────────────────────────────────────────────────
  -- ALL matched taxonomy terms (not just the longest) plus the derived signals.
  -- Deliberately NOT fed into compute_goal_readiness — widening the scorer's term set
  -- would move existing users' scores, which this task forbids.
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), ARRAY[]::text[])
    INTO v_keywords
    FROM unnest(
           v_tax_terms || ARRAY[
             lower(v_location), lower(v_opportunity), lower(v_seniority),
             lower(v_company), lower(v_timeframe), lower(v_year)
           ]
         ) AS x
   WHERE x IS NOT NULL
     AND length(btrim(x)) >= 3;

  v_keywords := v_keywords[1:12];

  -- ── normalized_summary ──────────────────────────────────────────────────────
  -- A DERIVED display label, in a FIXED order. It is never written back to
  -- professional_goal and is never a substitute for the user's own wording.
  --
  -- Two REDUNDANCY suppressions, both display-only — the `industry` and `company_type`
  -- KEYS themselves are unaffected, and so are `keywords`:
  --   * industry is dropped when it equals the role ("Investment Banking" twice);
  --   * company_type is dropped when it is contained in the role or the industry.
  --     'investment bank' is a substring of 'investment banking', so the single most
  --     common existing goal ("Investment Banking Internship — NYC 2027") would
  --     otherwise render as "Investment Banking • Internship • Investment Bank • ...".
  SELECT string_agg(t.x, ' • ' ORDER BY t.ord)
    INTO v_summary
    FROM unnest(ARRAY[
           v_role,
           initcap(v_opportunity),
           CASE WHEN v_industry IS DISTINCT FROM v_role THEN v_industry END,
           CASE
             WHEN v_company IS NULL THEN NULL
             WHEN position(v_company IN lower(COALESCE(v_role, ''))) > 0 THEN NULL
             WHEN position(v_company IN lower(COALESCE(v_industry, ''))) > 0 THEN NULL
             ELSE initcap(v_company)
           END,
           v_location,
           COALESCE(v_timeframe, v_year)
         ]) WITH ORDINALITY AS t(x, ord)
   WHERE t.x IS NOT NULL
     AND btrim(t.x) <> '';

  v_summary := left(v_summary, 160);

  -- The 5 legacy keys come FIRST and in their original order.
  RETURN jsonb_build_object(
    'role',                v_role,
    'industry',            v_industry,
    'location',            v_location,
    'opportunity_type',    v_opportunity,
    'year',                v_year,
    'timeframe',           v_timeframe,
    'seniority',           v_seniority,
    'company_type',        v_company,
    'long_term_direction', v_direction,
    'normalized_summary',  v_summary,
    'keywords',            to_jsonb(v_keywords)
  );
END;
$$;

COMMENT ON FUNCTION public.parse_professional_goal(text) IS
  'Deterministic, zero-AI parse of the user''s raw professional goal. Returns 11 keys: '
  'role, industry, location, opportunity_type, year (the original five, semantics '
  'unchanged) plus timeframe, seniority, company_type, long_term_direction, '
  'normalized_summary, keywords. ADDITIVE — readers must tolerate absent keys on rows '
  'parsed before 20260804010000. The raw professional_goal is never modified, and '
  'normalized_summary is a display label only.';
