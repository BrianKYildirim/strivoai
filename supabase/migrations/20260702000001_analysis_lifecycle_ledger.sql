-- Phase 03 · 03-01 · LIFE-01 / LIFE-02 / LIFE-04 / LIFE-05 —
-- analysis_jobs lifecycle ledger (ADDITIVE, DORMANT).
--
-- Purpose: Evolve the existing `analysis_jobs` queue table ADDITIVELY into the
-- shared analysis-lifecycle ledger every downstream Phase 3/4/5/6 plan adopts by
-- flipping a flag. This migration ships:
--   * an 11-value `state` lifecycle model (text + CHECK, NEVER a native ENUM —
--     additive roll-forward, mirrors the DROP-IF-EXISTS/ADD idiom from
--     20260225222000_extend_analysis_jobs_for_career_queue.sql),
--   * the LIFE-02 operational-metadata columns (feature, tier, idempotency_key,
--     input/prompt/schema/calculation versions, model, retry_count, failure_code,
--     failure_stage, state_updated_at, merit_settled, refunded),
--   * a partial-UNIQUE active-per-intent index (LIFE-05 / Pitfall 5 TOCTOU) —
--     the atomic single-active-per-idempotency-key guarantee, NOT a SELECT window,
--   * the CHECK (NOT (merit_settled AND refunded)) financial invariant (LIFE-04 /
--     Pitfall 3 — double-charge/double-refund impossibility),
--   * two SECURITY DEFINER CAS RPCs — create_or_recover_analysis_run (advisory-lock
--     idempotent create/recover) and transition_analysis_run (monotonic compare-and-
--     swap state move with a legacy `status` dual-write).
--
-- DORMANCY GUARANTEE (byte-identical): every add is nullable/defaulted, no live row
-- needs a backfill, and transition_analysis_run ALWAYS writes the legacy `status`
-- column from the mapping table below so the existing worker
-- (process-resume-analysis-job), poller (get-analysis-job-status), and Results.tsx
-- read `status` completely unchanged. No feature is routed through `state` in Phase 3.
--
-- Legacy status dual-write mapping (state -> status):
--   created                                                        -> 'pending'
--   validating_inputs | reserving_merits | extracting_data |
--     generating | validating_output | saving                     -> 'processing'
--   retryable_failed                                               -> 'retrying'
--   completed                                                      -> 'completed'
--   failed | refunded                                             -> 'failed'
--
-- Re-runnability (NFR-01): all column adds use ADD COLUMN IF NOT EXISTS; the CHECK
-- constraints use the DROP-IF-EXISTS-then-ADD idiom; the index uses CREATE ... IF NOT
-- EXISTS; the RPCs use CREATE OR REPLACE; REVOKE/GRANT and the verification DO-block
-- are idempotent. Safe to re-apply.
--
-- NOTE: `merit_transaction_id uuid` already exists from
-- 20260429000000_add_merit_transaction_id_to_analysis_jobs.sql — it is NOT re-added.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: (copy-paste inverse DDL — roll-forward preferred per CLAUDE.md; run only
-- if this migration must be reversed before any feature dual-writes `state`)
--
--   DROP FUNCTION IF EXISTS public.transition_analysis_run(uuid, text, text, jsonb);
--   DROP FUNCTION IF EXISTS public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb);
--   DROP INDEX IF EXISTS public.analysis_jobs_active_idem_unique;
--   ALTER TABLE public.analysis_jobs DROP CONSTRAINT IF EXISTS analysis_jobs_settle_refund_excl;
--   ALTER TABLE public.analysis_jobs DROP CONSTRAINT IF EXISTS analysis_jobs_state_check;
--   ALTER TABLE public.analysis_jobs
--     DROP COLUMN IF EXISTS state,
--     DROP COLUMN IF EXISTS merit_settled,
--     DROP COLUMN IF EXISTS refunded,
--     DROP COLUMN IF EXISTS feature,
--     DROP COLUMN IF EXISTS tier,
--     DROP COLUMN IF EXISTS idempotency_key,
--     DROP COLUMN IF EXISTS input_fingerprint,
--     DROP COLUMN IF EXISTS input_version,
--     DROP COLUMN IF EXISTS prompt_version,
--     DROP COLUMN IF EXISTS schema_version,
--     DROP COLUMN IF EXISTS calculation_version,
--     DROP COLUMN IF EXISTS model,
--     DROP COLUMN IF EXISTS retry_count,
--     DROP COLUMN IF EXISTS failure_code,
--     DROP COLUMN IF EXISTS failure_stage,
--     DROP COLUMN IF EXISTS state_updated_at;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LIFE-02: Additive lifecycle + operational-metadata columns.
--    All nullable / defaulted so existing live rows need NO backfill.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS state               text,
  ADD COLUMN IF NOT EXISTS merit_settled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refunded            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature             text,
  ADD COLUMN IF NOT EXISTS tier                text,
  ADD COLUMN IF NOT EXISTS idempotency_key     text,
  ADD COLUMN IF NOT EXISTS input_fingerprint   text,
  ADD COLUMN IF NOT EXISTS input_version       text,
  ADD COLUMN IF NOT EXISTS prompt_version      text,
  ADD COLUMN IF NOT EXISTS schema_version      text,
  ADD COLUMN IF NOT EXISTS calculation_version text,
  ADD COLUMN IF NOT EXISTS model               text,
  ADD COLUMN IF NOT EXISTS retry_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_code        text,
  ADD COLUMN IF NOT EXISTS failure_stage       text,
  ADD COLUMN IF NOT EXISTS state_updated_at    timestamptz;

COMMENT ON COLUMN public.analysis_jobs.state IS
  'Phase 03 LIFE-01: 11-value lifecycle state (text + CHECK, never a native ENUM). '
  'NULL until a feature dual-writes it (dormant in Phase 3). Ordered pipeline: '
  'created -> validating_inputs -> reserving_merits -> extracting_data -> generating '
  '-> validating_output -> saving -> completed; retryable_failed (recoverable) and '
  'failed/refunded are terminal off-ramps. transition_analysis_run mirrors each move '
  'to the legacy status column so the existing worker/poller/frontend are unchanged.';

COMMENT ON COLUMN public.analysis_jobs.idempotency_key IS
  'Phase 03 LIFE-05: client-supplied intent key. The partial-UNIQUE index '
  'analysis_jobs_active_idem_unique guarantees at most one ACTIVE (non-terminal) run '
  'per key; create_or_recover_analysis_run takes pg_advisory_xact_lock(hashtext(key)) '
  'to make create-or-recover atomic (replaces the racy WR-04 SELECT-window dedup).';

COMMENT ON COLUMN public.analysis_jobs.merit_settled IS
  'Phase 03 LIFE-04: set true at saving -> completed (point of no return). Mutually '
  'exclusive with refunded via CHECK analysis_jobs_settle_refund_excl.';

COMMENT ON COLUMN public.analysis_jobs.refunded IS
  'Phase 03 LIFE-04: set true when a terminal-failed run''s Merit deduction is refunded. '
  'Mutually exclusive with merit_settled via CHECK analysis_jobs_settle_refund_excl.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LIFE-01: 11-state CHECK (nullable-tolerant). DROP-IF-EXISTS-then-ADD idiom
--    copied verbatim in shape from 20260225222000 (additive roll-forward, no ENUM).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_jobs_state_check'
      AND conrelid = 'public.analysis_jobs'::regclass
  ) THEN
    ALTER TABLE public.analysis_jobs DROP CONSTRAINT analysis_jobs_state_check;
  END IF;
END $$;

ALTER TABLE public.analysis_jobs
  ADD CONSTRAINT analysis_jobs_state_check
  CHECK (
    state IS NULL OR state IN (
      'created',
      'validating_inputs',
      'reserving_merits',
      'extracting_data',
      'generating',
      'validating_output',
      'saving',
      'completed',
      'retryable_failed',
      'failed',
      'refunded'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LIFE-04 / Pitfall 3: financial mutual-exclusion invariant.
--    A row can NEVER be both merit_settled and refunded (double-charge/double-refund
--    impossibility). DROP-IF-EXISTS-then-ADD so re-apply is safe.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_jobs_settle_refund_excl'
      AND conrelid = 'public.analysis_jobs'::regclass
  ) THEN
    ALTER TABLE public.analysis_jobs DROP CONSTRAINT analysis_jobs_settle_refund_excl;
  END IF;
END $$;

ALTER TABLE public.analysis_jobs
  ADD CONSTRAINT analysis_jobs_settle_refund_excl
  CHECK (not (merit_settled and refunded));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LIFE-05 / Pitfall 5 (TOCTOU): partial-UNIQUE active-per-intent index.
--    At most one ACTIVE (non-terminal) run per idempotency_key. Terminal rows
--    (completed/failed/refunded) drop out so a key can be reused after settlement.
--    Models merit_transactions_idempotency_key_unique (20260512000003:62-64).
--    THIS index — not a SELECT window — is the atomic single-active guarantee.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_active_idem_unique
  ON public.analysis_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND state NOT IN ('completed', 'failed', 'refunded');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LIFE-05: create_or_recover_analysis_run — atomic create-or-recover under an
--    advisory lock (replaces the racy WR-04 SELECT-window dedup).
--
--    Under pg_advisory_xact_lock(hashtext(p_idempotency_key)): if an ACTIVE
--    (non-terminal) row already exists for the key, return it (recovered=true);
--    otherwise INSERT a fresh 'created' row (recovered=false). The advisory lock
--    serialises concurrent same-key callers; the partial-UNIQUE index is the
--    belt-and-suspenders backstop (unique_violation -> recover the winner's row).
--
--    Does NOT perform the Merit deduction (RESEARCH Open Question 3 / D-03: the
--    gateway owns all Merit control flow; the executor calls withMerits separately,
--    tied by the same idempotency key).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_or_recover_analysis_run(
  p_user_id         uuid,
  p_feature         text,
  p_tier            text,
  p_idempotency_key text,
  p_job_type        text,
  p_resume_id       uuid  DEFAULT NULL,
  p_payload         jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id    uuid;
  v_existing_state text;
  v_new_id         uuid;
  v_payload        jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'create_or_recover_analysis_run: p_idempotency_key is required';
  END IF;

  -- Serialise concurrent same-key callers for the duration of this transaction.
  PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key));

  -- Recover an already-active run for this intent, if one exists.
  SELECT id, state
    INTO v_existing_id, v_existing_state
    FROM public.analysis_jobs
    WHERE idempotency_key = p_idempotency_key
      AND state IS NOT NULL
      AND state NOT IN ('completed', 'failed', 'refunded')
    LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'run_id',    v_existing_id,
      'state',     v_existing_state,
      'recovered', true
    );
  END IF;

  -- Build payload (merge resumeId so the existing idx_analysis_jobs_resume_id and
  -- worker payload contract keep reading payload->>'resumeId' unchanged).
  v_payload := COALESCE(p_payload, '{}'::jsonb);
  IF p_resume_id IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('resumeId', p_resume_id::text);
  END IF;

  -- Create a fresh 'created' run. Legacy status dual-write: created -> 'pending'.
  BEGIN
    INSERT INTO public.analysis_jobs
      (user_id, job_type, status, payload,
       state, state_updated_at, feature, tier, idempotency_key)
    VALUES
      (p_user_id, p_job_type, 'pending', v_payload,
       'created', now(), p_feature, p_tier, p_idempotency_key)
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- A concurrent same-key caller won the race between our SELECT and INSERT
      -- (the partial-UNIQUE active index fired). Recover their active row.
      SELECT id, state
        INTO v_existing_id, v_existing_state
        FROM public.analysis_jobs
        WHERE idempotency_key = p_idempotency_key
          AND state IS NOT NULL
          AND state NOT IN ('completed', 'failed', 'refunded')
        LIMIT 1;

      RETURN jsonb_build_object(
        'run_id',    v_existing_id,
        'state',     v_existing_state,
        'recovered', true
      );
  END;

  RETURN jsonb_build_object(
    'run_id',    v_new_id,
    'state',     'created',
    'recovered', false
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. LIFE-01: transition_analysis_run — monotonic compare-and-swap state move.
--
--    CAS: UPDATE ... WHERE id = p_run_id AND state = p_from_state.
--      * 0 rows updated  => idempotent no-op (someone else already moved it, or the
--        from-state is stale). NEVER resurrects a terminal row — the WHERE simply
--        does not match. Returns { transitioned: false, noop: true }.
--      * Monotonicity guard: rejects backward moves through the linear pipeline and
--        any terminal -> non-terminal move (only failed -> refunded is a legal
--        terminal transition). retryable_failed may re-enter a running pipeline
--        state (the retry path).
--      * ALWAYS writes the legacy `status` column from the dual-write mapping so the
--        existing worker/poller/Results.tsx read `status` byte-identically.
--      * p_patch applies a WHITELISTED set of metadata fields (COALESCE — only keys
--        present in the patch override). The financial CHECK is the safety net.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_analysis_run(
  p_run_id     uuid,
  p_from_state text,
  p_to_state   text,
  p_patch      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from_pos       integer;
  v_to_pos         integer;
  v_legacy_status  text;
  v_updated        integer;
  v_terminal       constant text[] := ARRAY['completed', 'failed', 'refunded'];
BEGIN
  -- Ordinal positions over the ordered lifecycle (linear pipeline + off-ramps).
  v_from_pos := CASE p_from_state
    WHEN 'created'           THEN 1
    WHEN 'validating_inputs' THEN 2
    WHEN 'reserving_merits'  THEN 3
    WHEN 'extracting_data'   THEN 4
    WHEN 'generating'        THEN 5
    WHEN 'validating_output' THEN 6
    WHEN 'saving'            THEN 7
    WHEN 'completed'         THEN 8
    WHEN 'retryable_failed'  THEN 9
    WHEN 'failed'            THEN 10
    WHEN 'refunded'          THEN 11
    ELSE NULL
  END;
  v_to_pos := CASE p_to_state
    WHEN 'created'           THEN 1
    WHEN 'validating_inputs' THEN 2
    WHEN 'reserving_merits'  THEN 3
    WHEN 'extracting_data'   THEN 4
    WHEN 'generating'        THEN 5
    WHEN 'validating_output' THEN 6
    WHEN 'saving'            THEN 7
    WHEN 'completed'         THEN 8
    WHEN 'retryable_failed'  THEN 9
    WHEN 'failed'            THEN 10
    WHEN 'refunded'          THEN 11
    ELSE NULL
  END;

  IF v_from_pos IS NULL THEN
    RAISE EXCEPTION 'transition_analysis_run: unknown from-state %', p_from_state;
  END IF;
  IF v_to_pos IS NULL THEN
    RAISE EXCEPTION 'transition_analysis_run: unknown to-state %', p_to_state;
  END IF;

  -- Guard 1: terminal rows are final. Never resurrect. The only legal terminal
  -- transition is failed -> refunded (post-refund settlement).
  IF p_from_state = ANY (v_terminal)
     AND NOT (p_from_state = 'failed' AND p_to_state = 'refunded') THEN
    RAISE EXCEPTION
      'transition_analysis_run: illegal move from terminal state % to %',
      p_from_state, p_to_state;
  END IF;

  -- Guard 2: monotonicity through the linear pipeline. Moving into
  -- retryable_failed (a failure branch) is always allowed; retryable_failed may
  -- re-enter any running state (the retry path). Otherwise reject backward moves.
  IF p_from_state <> 'retryable_failed'
     AND p_to_state <> 'retryable_failed'
     AND v_to_pos < v_from_pos THEN
    RAISE EXCEPTION
      'transition_analysis_run: non-monotonic move from % to %',
      p_from_state, p_to_state;
  END IF;

  -- Legacy status dual-write mapping (byte-identical dormancy).
  v_legacy_status := CASE p_to_state
    WHEN 'created'           THEN 'pending'
    WHEN 'validating_inputs' THEN 'processing'
    WHEN 'reserving_merits'  THEN 'processing'
    WHEN 'extracting_data'   THEN 'processing'
    WHEN 'generating'        THEN 'processing'
    WHEN 'validating_output' THEN 'processing'
    WHEN 'saving'            THEN 'processing'
    WHEN 'completed'         THEN 'completed'
    WHEN 'retryable_failed'  THEN 'retrying'
    WHEN 'failed'            THEN 'failed'
    WHEN 'refunded'          THEN 'failed'
  END;

  -- Compare-and-swap. Only the row whose CURRENT state equals p_from_state moves.
  UPDATE public.analysis_jobs
    SET state               = p_to_state,
        status              = v_legacy_status,
        state_updated_at    = now(),
        updated_at          = now(),
        retry_count         = COALESCE((p_patch->>'retry_count')::integer, retry_count),
        failure_code        = COALESCE(p_patch->>'failure_code', failure_code),
        failure_stage       = COALESCE(p_patch->>'failure_stage', failure_stage),
        model               = COALESCE(p_patch->>'model', model),
        input_fingerprint   = COALESCE(p_patch->>'input_fingerprint', input_fingerprint),
        input_version       = COALESCE(p_patch->>'input_version', input_version),
        prompt_version      = COALESCE(p_patch->>'prompt_version', prompt_version),
        schema_version      = COALESCE(p_patch->>'schema_version', schema_version),
        calculation_version = COALESCE(p_patch->>'calculation_version', calculation_version),
        merit_transaction_id = COALESCE((p_patch->>'merit_transaction_id')::uuid, merit_transaction_id),
        merit_settled       = COALESCE((p_patch->>'merit_settled')::boolean, merit_settled),
        refunded            = COALESCE((p_patch->>'refunded')::boolean, refunded),
        completed_at        = CASE WHEN p_to_state = 'completed' THEN now() ELSE completed_at END
    WHERE id = p_run_id AND state = p_from_state;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Stale from-state / already moved by another actor: idempotent no-op.
    -- Never resurrects a terminal row (the WHERE simply did not match).
    RETURN jsonb_build_object(
      'run_id',        p_run_id,
      'transitioned',  false,
      'noop',          true,
      'to_state',      p_to_state
    );
  END IF;

  RETURN jsonb_build_object(
    'run_id',       p_run_id,
    'transitioned', true,
    'noop',         false,
    'to_state',     p_to_state,
    'status',       v_legacy_status
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Pitfall 10: re-state the FULL grant ceremony on BOTH new RPCs so a
--    CREATE OR REPLACE never silently re-opens a v4.0-closed advisor.
--
--    LEAST-PRIVILEGE (03-01 checkpoint decision): EXECUTE is granted to
--    service_role ONLY — NOT `authenticated`. These are backend-orchestration
--    CAS RPCs invoked exclusively by edge functions (executor 03-04, endpoint
--    03-05) under the service role; the frontend recovery surface (useAnalysisRun)
--    uses Realtime + the owner-scoped poll endpoint and NEVER calls these RPCs
--    directly. Granting `authenticated` would expose transition_analysis_run —
--    which has NO owner check and can flip merit_settled/refunded/retry_count via
--    p_patch — as a REST IDOR surface (any signed-in user could mutate another
--    user's run by guessing run_id) and would trip advisor 0029
--    (authenticated_security_definer_function_executable), raising the floor.
--    service_role-only keeps the surface closed and the advisor floor unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_or_recover_analysis_run(uuid, text, text, text, text, uuid, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.transition_analysis_run(uuid, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.transition_analysis_run(uuid, text, text, jsonb)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Verification (read-only, idempotent). Mirrors 20260512000003:255-310.
--    RAISE EXCEPTION on any missing/mis-shaped artifact; RAISE NOTICE on pass.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_indexdef      text;
  v_cor_secdef    boolean;
  v_tar_secdef    boolean;
BEGIN
  -- (a) state column present.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'analysis_jobs'
      AND column_name  = 'state'
  ) THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-01 migration failed: analysis_jobs.state column missing';
  END IF;

  -- (b) financial mutual-exclusion CHECK present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analysis_jobs_settle_refund_excl'
      AND conrelid = 'public.analysis_jobs'::regclass
  ) THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-04 migration failed: analysis_jobs_settle_refund_excl CHECK missing';
  END IF;

  -- (c) partial-UNIQUE active index present AND in fact partial (WHERE in indexdef).
  SELECT indexdef
    INTO v_indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'analysis_jobs_active_idem_unique';

  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-05 migration failed: partial UNIQUE index analysis_jobs_active_idem_unique missing';
  END IF;

  IF position('WHERE' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-05 migration failed: analysis_jobs_active_idem_unique exists but is not partial (no WHERE in indexdef: %)',
      v_indexdef;
  END IF;

  -- (d) create_or_recover_analysis_run present and SECURITY DEFINER.
  SELECT prosecdef
    INTO v_cor_secdef
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname      = 'create_or_recover_analysis_run'
    LIMIT 1;

  IF v_cor_secdef IS NULL THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-05 migration failed: create_or_recover_analysis_run missing';
  END IF;
  IF NOT v_cor_secdef THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-05 migration failed: create_or_recover_analysis_run is not SECURITY DEFINER';
  END IF;

  -- (e) transition_analysis_run present and SECURITY DEFINER.
  SELECT prosecdef
    INTO v_tar_secdef
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname      = 'transition_analysis_run'
    LIMIT 1;

  IF v_tar_secdef IS NULL THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-01 migration failed: transition_analysis_run missing';
  END IF;
  IF NOT v_tar_secdef THEN
    RAISE EXCEPTION
      'Phase 03 LIFE-01 migration failed: transition_analysis_run is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'Phase 03 LIFE-01/02/04/05 verification passed: state column + 11-state CHECK + financial CHECK + partial-UNIQUE active index + both SECURITY DEFINER CAS RPCs in place';
END $$;
