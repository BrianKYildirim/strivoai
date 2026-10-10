-- Phase 19: interview-prep-flashcards-and-quiz -- additive only.
-- Phase 23 (2026-04-20): amended in place per Phase 23 D-01 to add 9 intake columns,
-- widen the tier CHECK to include 'elite_taste', add longest_streak + quizzes_today
-- to interview_streaks, and two partial indexes for cap queries. All additions are
-- idempotent (IF NOT EXISTS, DO blocks that drop/recreate the tier CHECK constraint).
--
-- Closes IPC-07 (Phase 19) and SC-11 / IPC-04 / IPC-06 (Phase 23).
--
-- Creates three tables for the Interview Prep feature:
--   1. interview_quizzes       — master quiz/flashcard session record
--   2. interview_quiz_answers  — individual questions (+ answers/scores for Elite)
--   3. interview_streaks       — one row per user for streak tracking
--
-- RLS: user-read-own SELECT policies only. All writes go through service-role
-- client in edge functions. No INSERT/UPDATE/DELETE user policies (T-19-02, T-19-03).
--
-- CRITICAL: Do NOT add any permissive policy that matches all rows.
-- Service role bypasses RLS automatically.

-- ---------------------------------------------------------------------------
-- 1. interview_quizzes  (IPC-07, D-04, D-13 — Phase 23 D-02/D-03 additions inline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_quizzes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode                  text NOT NULL CHECK (mode IN ('flashcard', 'quiz')),
  tier                  text NOT NULL CHECK (tier IN ('pro', 'elite', 'elite_taste')),
  job_description       text NOT NULL,
  job_title             text,
  company               text,
  resume_id             uuid REFERENCES public.resumes(id),
  overall_score         integer,
  evaluated_at          timestamptz,
  merit_transaction_id  text,
  -- Phase 23 D-03 additions: 9-field intake + readiness score
  interview_type        text    NOT NULL DEFAULT 'behavioral' CHECK (interview_type IN ('behavioral','technical','mixed_panel','executive')),
  question_categories   text[]  NOT NULL DEFAULT ARRAY['behavioral']::text[] CHECK (array_length(question_categories, 1) >= 1),
  difficulty            text    NOT NULL DEFAULT 'mid' CHECK (difficulty IN ('entry','mid','senior','staff_plus')),
  duration              smallint NOT NULL DEFAULT 30 CHECK (duration IN (15,30,45,60)),
  format                text    NOT NULL DEFAULT 'written' CHECK (format IN ('written','voice_style','mixed')),
  background_context    text             CHECK (background_context IS NULL OR length(background_context) <= 1500),
  role_title            text,
  readiness_score       smallint          CHECK (readiness_score IS NULL OR readiness_score BETWEEN 0 AND 100),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. interview_quiz_answers  (IPC-07, D-04, D-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_quiz_answers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id             uuid NOT NULL REFERENCES public.interview_quizzes(id) ON DELETE CASCADE,
  question_order      integer NOT NULL,
  question_text       text NOT NULL,
  competency          text,
  star_answer         jsonb,
  user_answer         text,
  score               integer,
  scoring_breakdown   jsonb,
  suggestions         text[],
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. interview_streaks  (IPC-07, D-10, D-11)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_streaks (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  integer NOT NULL DEFAULT 0,
  longest_streak  integer NOT NULL DEFAULT 0,
  quizzes_today   smallint NOT NULL DEFAULT 0,
  last_quiz_at    timestamptz,
  last_quiz_date  date,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3b. Phase 23 ALTER TABLE — idempotent re-apply path.
--     CREATE TABLE IF NOT EXISTS above skips everything when table already exists,
--     so we need explicit ADD COLUMN IF NOT EXISTS for live databases that were
--     created under Phase 19. On a fresh db reset these are all no-ops.
-- ---------------------------------------------------------------------------

-- Widen tier CHECK to include 'elite_taste' (D-02). Drop+recreate is safe because
-- existing rows are limited to 'pro' | 'elite' which remain valid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_tier_check') THEN
    ALTER TABLE public.interview_quizzes DROP CONSTRAINT interview_quizzes_tier_check;
  END IF;
  ALTER TABLE public.interview_quizzes
    ADD CONSTRAINT interview_quizzes_tier_check
    CHECK (tier IN ('pro','elite','elite_taste'));
END $$;

ALTER TABLE public.interview_quizzes
  ADD COLUMN IF NOT EXISTS interview_type      text    NOT NULL DEFAULT 'behavioral',
  ADD COLUMN IF NOT EXISTS question_categories text[]  NOT NULL DEFAULT ARRAY['behavioral']::text[],
  ADD COLUMN IF NOT EXISTS difficulty          text    NOT NULL DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS duration            smallint NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS format              text    NOT NULL DEFAULT 'written',
  ADD COLUMN IF NOT EXISTS background_context  text,
  ADD COLUMN IF NOT EXISTS role_title          text,
  ADD COLUMN IF NOT EXISTS readiness_score     smallint;

-- Attach CHECK constraints for the newly-added columns (guarded so re-runs skip).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_interview_type_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_interview_type_check
      CHECK (interview_type IN ('behavioral','technical','mixed_panel','executive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_question_categories_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_question_categories_check
      CHECK (array_length(question_categories, 1) >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_difficulty_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_difficulty_check
      CHECK (difficulty IN ('entry','mid','senior','staff_plus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_duration_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_duration_check
      CHECK (duration IN (15,30,45,60));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_format_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_format_check
      CHECK (format IN ('written','voice_style','mixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_background_context_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_background_context_check
      CHECK (background_context IS NULL OR length(background_context) <= 1500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_quizzes_readiness_score_check') THEN
    ALTER TABLE public.interview_quizzes
      ADD CONSTRAINT interview_quizzes_readiness_score_check
      CHECK (readiness_score IS NULL OR readiness_score BETWEEN 0 AND 100);
  END IF;
END $$;

-- Phase 23 interview_streaks additions (D-04).
ALTER TABLE public.interview_streaks
  ADD COLUMN IF NOT EXISTS longest_streak integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quizzes_today  smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_interview_quizzes_user_created
  ON public.interview_quizzes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_quiz_answers_quiz
  ON public.interview_quiz_answers(quiz_id, question_order);

-- Phase 23 partial indexes: bound daily-cap and monthly-quota COUNT queries.
-- daily: tier='elite' rows per user today; monthly: tier='elite_taste' rows per user this month.
CREATE INDEX IF NOT EXISTS idx_interview_quizzes_elite_daily
  ON public.interview_quizzes(user_id, created_at DESC)
  WHERE tier = 'elite';

CREATE INDEX IF NOT EXISTS idx_interview_quizzes_elite_taste_monthly
  ON public.interview_quizzes(user_id, created_at DESC)
  WHERE tier = 'elite_taste';

-- ---------------------------------------------------------------------------
-- 5. RLS -- enabled, SELECT-only user policy, zero permissive write policies.
--    Service role bypasses RLS automatically. (T-19-01, T-19-02, T-19-03)
-- ---------------------------------------------------------------------------
ALTER TABLE public.interview_quizzes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_quiz_answers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_streaks       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_quizzes' AND policyname='interview_quizzes_select_own') THEN
    CREATE POLICY "interview_quizzes_select_own"
      ON public.interview_quizzes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_quiz_answers' AND policyname='interview_quiz_answers_select_own') THEN
    CREATE POLICY "interview_quiz_answers_select_own"
      ON public.interview_quiz_answers FOR SELECT
      USING (quiz_id IN (SELECT id FROM public.interview_quizzes WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='interview_streaks' AND policyname='interview_streaks_select_own') THEN
    CREATE POLICY "interview_streaks_select_own"
      ON public.interview_streaks FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Verification block
-- ---------------------------------------------------------------------------
DO $$ DECLARE v_count integer; BEGIN
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('interview_quizzes','interview_quiz_answers','interview_streaks');
  IF v_count <> 3 THEN RAISE EXCEPTION 'Expected 3 tables, found %', v_count; END IF;
  RAISE NOTICE 'Phase 19 migration: 3 tables created successfully';
END $$;

-- Phase 23 verification: assert new columns exist on fresh re-applies (db reset path).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='interview_quizzes' AND column_name='interview_type') THEN
    RAISE EXCEPTION 'Phase 23 migration missing interview_quizzes.interview_type column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='interview_quizzes' AND column_name='readiness_score') THEN
    RAISE EXCEPTION 'Phase 23 migration missing interview_quizzes.readiness_score column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='interview_streaks' AND column_name='longest_streak') THEN
    RAISE EXCEPTION 'Phase 23 migration missing interview_streaks.longest_streak column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='interview_streaks' AND column_name='quizzes_today') THEN
    RAISE EXCEPTION 'Phase 23 migration missing interview_streaks.quizzes_today column';
  END IF;
  RAISE NOTICE 'Phase 23 migration: all new columns present';
END $$;
