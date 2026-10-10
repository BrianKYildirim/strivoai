-- ═════════════════════════════════════════════════════════════════════════════
-- 260723-2b0 · Task 7b (D-7, LOCKED) — make check_and_deduct_merits REFUND-AWARE
--
-- MONEY PATH. This changes charging behavior for EVERY feature routed through
-- `_shared/merit-gateway.ts` (`withMerits`), not just resume analysis.
--
-- ─── BUG 1: the refund/replay hole (the reason this migration exists) ────────
--
-- Verified against live Postgres on the preview project before this was written:
--
--   deduct(K)          -> {success, transaction_id: T}          balance 30 -> 27
--   refund_merits(T)   -> {success, refunded_to:{subscription:3}} balance 27 -> 30
--   deduct(K) AGAIN    -> {success, transaction_id: T, already_deducted: true}
--                                                                 balance 30 -> 30
--
-- That last line is a FREE RUN. The chain, verified in source:
--   * `merit-gateway.ts:299-309` refunds on a refundable throw when !alreadyDeducted.
--   * `refund_merits` (20260415000000:165-209) writes a SEPARATE balance_type='refund'
--     row and leaves the original source='feature-deduct' row — INCLUDING its
--     idempotency_key — intact.
--   * The entry-time pre-check (20260512000003:118-133) looks up ONLY
--     `idempotency_key + source='feature-deduct'` and NEVER consults refund state.
--
-- So a refunded attempt whose key is replayed returns already_deducted and charges
-- zero, indefinitely repeatable. It is reachable BY ACCIDENT: any transient
-- Anthropic failure where the user refreshes before the error settles.
--
-- ─── BUG 2: the split-deduction collision (D-7b) ─────────────────────────────
--
-- Independent of refunds, and characterized against live Postgres by
-- `_shared/__tests__/merit-idempotency.remote.test.ts` case 5 before this fix:
--
--   20260512000003:179-195 writes TWO feature-deduct rows (one 'subscription', one
--   'shop') sharing ONE idempotency_key whenever cost splits across buckets. The OLD
--   index is unique on idempotency_key ALONE, so the second leg raises 23505.
--
-- What happens next is counter-intuitive and WILL be re-derived wrongly. Both INSERTs
-- sit inside `BEGIN ... EXCEPTION WHEN unique_violation ... END` (:178-213), and a
-- plpgsql block with an EXCEPTION clause IS A SUBTRANSACTION. The second leg's 23505
-- rolls it back and takes the FIRST leg's already-executed INSERT with it. ZERO rows
-- survive — not one. The recovery SELECT then finds nothing, v_prior_id stays NULL,
-- and the function returns {success:true, transaction_id:null, already_deducted:true}
-- without ever reaching the user_merits UPDATE. `merit-gateway.ts:256-263`'s WR-03
-- null guard turns that into `500 merit_system_error` and the wrapped callback — the
-- actual analysis — never runs.
--
-- Net: NOT a free analysis. A hard 500 that BLOCKS the feature, permanently
-- repeatable, for any user whose subscription_balance sits between 1 and cost-1 while
-- shop_balance covers the remainder — i.e. a paying customer who topped up cannot run
-- an analysis AT ALL. `analyze-resume`'s withMerits is unconditional in production
-- (Phase 30 removed the flag), so this is reachable by real users today.
--
-- ─── THE FIX: a REFUNDED deduction is RETIRED from the idempotency namespace ──
--
-- Three coordinated changes that MUST land together:
--   1. `refund_merits` stamps `metadata.refunded_at` onto the deduction legs it
--      reverses. Nothing is deleted — the audit row survives verbatim plus one key.
--   2. The partial unique index is replaced with one that (a) EXCLUDES stamped rows
--      and (b) is keyed on (idempotency_key, balance_type) so the two legs of a split
--      deduction stop colliding.
--   3. Both lookup sites in `check_and_deduct_merits` gain the SAME
--      `metadata->>'refunded_at' IS NULL` filter — byte-identical to the index
--      predicate, so index and pre-check cannot drift into disagreeing about what
--      "a live deduction" means.
--
-- WHY MARKING RATHER THAN THE ALTERNATIVES:
--   * Deleting the refunded row destroys the audit trail, and `refund_merits`'s own
--     `already_refunded` guard plus every balance-reconstruction query read those rows.
--   * Keying on an extra client-supplied attempt counter leaks the fix into every
--     `withMerits` caller and every client. The RPC must fix this for all features
--     with NO caller change.
--   * Narrowing only the index, or only the pre-check, is inert — see below.
--
-- WHY THE OLD INDEX MUST BE DROPPED, NOT MERELY SUPPLEMENTED: while it survives, IT
-- ALONE rejects the post-refund replay insert (it is unique on idempotency_key with no
-- refunded_at filter), and the entire fix is inert.
--
-- `->>` and `||` on jsonb are both IMMUTABLE, so `metadata->>'refunded_at' IS NULL` is
-- legal in an index predicate. If Postgres rejects the predicate, STOP AND REPORT —
-- do NOT fall back to a trigger.
--
-- THE LEGITIMATE REPLAY CASE IS PRESERVED EXACTLY. Same key, no refund -> the row is
-- unmarked -> the pre-check hits -> already_deducted:true, zero charge, no user_merits
-- touch. Byte-identical to today. The ONLY behavior that changes is for keys whose
-- deduction has since been refunded.
--
-- THE RACE ABSORBER STILL WORKS, unchanged in shape. Two concurrent callers with the
-- same key both see an unmarked namespace, both attempt the insert, one wins, the
-- loser takes 23505 and returns the winner's deduction_id. Adding balance_type to the
-- key does not weaken this: a genuine duplicate replay writes the same legs with the
-- same key, so it still collides.
--
-- `merit-gateway.ts:319-330` is NOT touched and NOT reversed — an idempotent replay
-- still deliberately does not refund. There are NO TypeScript changes in this task.
--
-- Re-runnable: every statement is idempotent (IF NOT EXISTS / IF EXISTS / CREATE OR
-- REPLACE, and the backfill is guarded on `refunded_at IS NULL`). A second apply
-- backfills 0 rows.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — GATED PROCEDURE, NOT SYMMETRIC WITH THE FORWARD MIGRATION.
-- DO NOT RUN THESE STATEMENTS BLIND. Read R0 first; it decides which path applies.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ─── Step R0 — MANDATORY pre-flight duplicate check. Run this FIRST, ALWAYS ───
--
--   SELECT idempotency_key, count(*)
--     FROM public.merit_transactions
--    WHERE source = 'feature-deduct'
--      AND idempotency_key IS NOT NULL
--    GROUP BY 1
--   HAVING count(*) > 1;
--
-- This migration DELIBERATELY produces multiple feature-deduct rows per key in two
-- NORMAL situations: a legitimate split deduction (a 'subscription' leg + a 'shop'
-- leg), and a post-refund replay (one stamped row + one live row). If R0 returns ANY
-- rows, the original single-column UNIQUE (idempotency_key) index CANNOT be recreated
-- — CREATE UNIQUE INDEX aborts with a duplicate-key error.
--
-- THE ASYMMETRY IS THE DANGEROUS PART, so it is stated plainly: if an operator runs
-- these statements individually and the index creation fails AFTER the new index has
-- been dropped and the old function bodies restored, the system is left with the old
-- permissive pre-check and NO UNIQUENESS PROTECTION AT ALL. The unique_violation race
-- absorber can then never fire, so concurrent same-key calls DOUBLE-CHARGE — strictly
-- worse than either the pre-migration or the post-migration state.
--
-- IF R0 RETURNS ROWS, the operator must explicitly CHOOSE one of two paths:
--
--   (a) SAFE PARTIAL ROLLBACK (RECOMMENDED). Restore ONLY the two function bodies
--       (R1) and KEEP merit_transactions_idempotency_key_live_unique. Skip R2/R3
--       entirely. The composite (idempotency_key, balance_type) index still blocks
--       concurrent double-charge, so NO protection is lost; only the refund-awareness
--       of the pre-check goes away.
--
--   (b) FULL ROLLBACK. First null out idempotency_key on the surplus rows (keep the
--       oldest row per key, null the rest), then proceed through R1-R3.
--       AUDIT CONSEQUENCE, STATED PLAINLY: those rows can no longer be correlated to
--       the request that produced them, and any future idempotency-key-based
--       reconciliation will under-count them. IRREVERSIBLE.
--
-- ─── Step R1 — restore the function bodies ───────────────────────────────────
--
-- Restore verbatim from 20260415000000_merit_rpcs.sql (`refund_merits`, i.e. the body
-- below minus its Section-3 stamping UPDATE) and from
-- 20260512000003_merit_transactions_idempotency.sql:93-236 (the 4-arg
-- `check_and_deduct_merits`, i.e. the body below with both lookup sites'
-- `AND metadata->>'refunded_at' IS NULL` / `ORDER BY created_at DESC` removed and the
-- EXCEPTION arm's unfiltered fallback + RAISE removed). Then re-apply for each:
--
--   REVOKE ALL ON FUNCTION public.refund_merits(uuid, uuid) FROM public;
--   GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid)
--     TO authenticated, service_role;
--   REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
--   GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
--     TO authenticated, service_role;
--
-- ─── Step R2 — recreate the OLD index, and CONFIRM IT SUCCEEDED ──────────────
--
--   CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_unique
--     ON public.merit_transactions (idempotency_key)
--     WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL;
--
-- ─── Step R3 — ONLY AFTER R2 SUCCEEDS, drop the new index ────────────────────
--
--   DROP INDEX IF EXISTS public.merit_transactions_idempotency_key_live_unique;
--
-- The create-then-drop ordering mirrors Section 2's own rule below, for the same
-- reason: there must NEVER be a window in which the table has no uniqueness
-- protection. IF R2 FAILS, STOP — DO NOT RUN R3. The system is still protected by the
-- composite index; you are then in path (a).
--
-- ─── Step R4 (optional, safe to skip) ────────────────────────────────────────
--
--   UPDATE public.merit_transactions SET metadata = metadata - 'refunded_at'
--    WHERE metadata ? 'refunded_at';
--
-- ─── ACCEPTED ROLLBACK DEBT ──────────────────────────────────────────────────
--
-- After a FULL rollback, a key that owns BOTH a retired (refunded) row and a live row
-- is read by the RESTORED pre-check, which is unordered and unfiltered (LIMIT 1, no
-- ORDER BY, no refunded_at filter). It may therefore hand back the REFUNDED
-- deduction_id as the refund handle. This is known, accepted rollback debt.
--
-- ROLLING BACK RE-OPENS THE REPLAY HOLE BY DESIGN. The D-3b client-side lease
-- (grading_data IS NULL + 15-minute TTL + max 3 reuses) is what bounds it in the
-- interim — it is defense-in-depth, never the guarantee. The RPC is the guarantee.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill historical refunds (D-7c).
--
--    Deductions refunded BEFORE this migration carry no `refunded_at` stamp, so their
--    keys would stay un-retired and remain replayable-for-free. Stamp every
--    feature-deduct row whose deduction_id already has a matching balance_type='refund'
--    row.
--
--    Correlation key verified against a live preview ledger: `refund_merits` writes
--    `metadata.deduction_id = p_transaction_id` on the refund row and the deduction
--    legs carry the SAME `metadata.deduction_id`, so joining on that key is correct.
--    (`metadata.refund_of` on the refund row points at the leg's `id`, not the
--    deduction_id — do not join on it.)
--
--    Idempotent by the `refunded_at IS NULL` guard: a second apply stamps 0 rows.
--
--    Runs BEFORE the new index is created. This is a PREFERENCE, not a load-bearing
--    constraint — the OLD single-column index already guarantees at most one
--    feature-deduct row per non-NULL key, so no duplicate (idempotency_key,
--    balance_type) pair can exist at migration time and the index build cannot fail in
--    either order.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_backfilled bigint;
BEGIN
  UPDATE public.merit_transactions d
     SET metadata = d.metadata || jsonb_build_object('refunded_at', to_jsonb(now()))
   WHERE d.source = 'feature-deduct'
     AND d.metadata->>'refunded_at' IS NULL
     AND EXISTS (
       SELECT 1 FROM public.merit_transactions r
        WHERE r.user_id = d.user_id
          AND r.balance_type = 'refund'
          AND (r.metadata->>'deduction_id') = (d.metadata->>'deduction_id')
     );

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RAISE NOTICE '260723-2b0 Task 7b: backfilled refunded_at onto % historical feature-deduct row(s)', v_backfilled;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace the partial unique index (D-7a).
--
--    OLD: UNIQUE (idempotency_key)
--         WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL
--    NEW: UNIQUE (idempotency_key, balance_type)
--         WHERE source = 'feature-deduct' AND idempotency_key IS NOT NULL
--           AND metadata->>'refunded_at' IS NULL
--
--    CREATE THEN DROP, in that order and in the same transaction, so there is NEVER a
--    window without uniqueness protection.
--
--    The `balance_type` component fixes BUG 2 (the split-deduction collision): the two
--    legs no longer collide, the subtransaction never aborts, both rows commit, and
--    user_merits is updated once for the full cost.
--    The `refunded_at` predicate fixes BUG 1: a retired row no longer occupies the key.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS merit_transactions_idempotency_key_live_unique
  ON public.merit_transactions (idempotency_key, balance_type)
  WHERE source = 'feature-deduct'
    AND idempotency_key IS NOT NULL
    AND metadata->>'refunded_at' IS NULL;

DROP INDEX IF EXISTS public.merit_transactions_idempotency_key_unique;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. refund_merits — stamp the deduction it reverses.
--
--    Body copied VERBATIM from 20260415000000_merit_rpcs.sql:165-209 with exactly ONE
--    statement added after the leg-walking FOR loop (marked below). The
--    already_refunded guard, the balance restoration and the return shape are
--    unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_merits(p_user_id uuid, p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row          RECORD;
  v_sub_restore  integer := 0;
  v_shop_restore integer := 0;
BEGIN
  -- 1. Row lock on user_merits (D-19).
  PERFORM 1 FROM public.user_merits WHERE user_id = p_user_id FOR UPDATE;

  -- 1b. Missing user_merits row guard (WR-02).
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- 2. Idempotency: any existing refund row for this deduction_id?
  IF EXISTS (
    SELECT 1
    FROM public.merit_transactions r
    WHERE r.user_id = p_user_id
      AND r.balance_type = 'refund'
      AND (r.metadata->>'deduction_id') = p_transaction_id::text
  ) THEN
    RETURN jsonb_build_object('error', 'already_refunded');
  END IF;

  -- 3. Walk original deduction rows (1 or 2, split by bucket).
  FOR v_row IN
    SELECT id, amount, balance_type
    FROM public.merit_transactions
    WHERE user_id = p_user_id
      AND (metadata->>'deduction_id') = p_transaction_id::text
      AND balance_type IN ('subscription','shop')
  LOOP
    -- Write mirroring refund row: balance_type='refund' per D-09 / Pitfall 4.
    INSERT INTO public.merit_transactions
      (user_id, amount, balance_type, source, feature, metadata)
    VALUES
      (p_user_id, -v_row.amount, 'refund', 'feature-refund', NULL,
       jsonb_build_object(
         'refund_of',    v_row.id,
         'deduction_id', p_transaction_id
       ));

    -- Accumulate per-bucket restore amount (positive because original was negative).
    IF v_row.balance_type = 'subscription' THEN
      v_sub_restore := v_sub_restore + (-v_row.amount);
    ELSIF v_row.balance_type = 'shop' THEN
      v_shop_restore := v_shop_restore + (-v_row.amount);
    END IF;
  END LOOP;

  -- ── 260723-2b0 Task 7b (D-7): THE ONE ADDED STATEMENT ─────────────────────
  -- RETIRE this deduction from the idempotency namespace. Nothing is deleted; the
  -- audit rows survive verbatim plus one metadata key. This is what makes a replay of
  -- the same idempotency key charge again instead of returning already_deducted.
  -- The predicate is byte-identical to the index predicate in Section 2 and to the
  -- lookup filters in Section 4 — one definition of "a live deduction".
  UPDATE public.merit_transactions
     SET metadata = metadata || jsonb_build_object('refunded_at', to_jsonb(now()))
   WHERE user_id = p_user_id
     AND (metadata->>'deduction_id') = p_transaction_id::text
     AND balance_type IN ('subscription','shop');
  -- ──────────────────────────────────────────────────────────────────────────

  -- 4. No matching deduction rows → unknown transaction.
  IF (v_sub_restore + v_shop_restore) = 0 THEN
    RETURN jsonb_build_object('error', 'unknown_transaction');
  END IF;

  -- 5. Restore exact original buckets on user_merits (D-09).
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance + v_sub_restore,
        shop_balance         = shop_balance         + v_shop_restore,
        updated_at           = now()
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',     true,
    'refunded_to', jsonb_build_object(
      'subscription', v_sub_restore,
      'shop',         v_shop_restore
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_merits(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_merits(uuid, uuid) TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. check_and_deduct_merits (4-arg) — refund-aware lookups.
--
--    Body copied VERBATIM from 20260512000003:93-236. ONLY the two lookup sites change:
--      * the entry-time pre-check (:118-133), and
--      * the EXCEPTION WHEN unique_violation arm (:196-212).
--
--    Each gains `AND metadata->>'refunded_at' IS NULL` and `ORDER BY created_at DESC`
--    before LIMIT 1. The ORDER BY is load-bearing: a key may now legitimately own MORE
--    THAN ONE feature-deduct row over its lifetime (one retired, one live), and an
--    unordered LIMIT 1 could return the retired one.
--
--    The 3-arg overload is NOT touched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_and_deduct_merits(
  p_user_id          uuid,
  p_feature          text,
  p_tier             text,
  p_idempotency_key  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cost            integer;
  v_sub_balance     integer;
  v_shop_balance    integer;
  v_sub_take        integer;
  v_shop_take       integer;
  v_deduction_id    uuid := gen_random_uuid();
  v_prior_id        uuid;
BEGIN
  -- 0. MER-04: Idempotency pre-check (entry-time short-circuit).
  --    If a LIVE (non-refunded) feature-deduct row already exists for this
  --    idempotency_key, return its deduction_id without touching user_merits.
  --
  --    260723-2b0 Task 7b (D-7): a REFUNDED deduction is retired from the namespace —
  --    `metadata->>'refunded_at' IS NULL` skips it, so the replay falls through to the
  --    normal deduct path and charges again. A miss here is CORRECT and safe: it simply
  --    proceeds to deduct.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT (metadata->>'deduction_id')::uuid
      INTO v_prior_id
      FROM public.merit_transactions
      WHERE idempotency_key = p_idempotency_key
        AND source = 'feature-deduct'
        AND metadata->>'refunded_at' IS NULL
      ORDER BY created_at DESC
      LIMIT 1;

    IF v_prior_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success',          true,
        'transaction_id',   v_prior_id,
        'already_deducted', true
      );
    END IF;
  END IF;

  -- 1. Tier-gated cost lookup (D-02): missing row = tier_locked BEFORE any
  --    balance op. Identical to 3-arg body.
  SELECT cost INTO v_cost
  FROM public.merit_feature_costs
  WHERE feature = p_feature AND tier = p_tier;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'tier_locked',
      'upgrade_required', true
    );
  END IF;

  -- 2. Row lock on user_merits (D-19). Identical to 3-arg body.
  SELECT subscription_balance, shop_balance
    INTO v_sub_balance, v_shop_balance
    FROM public.user_merits
    WHERE user_id = p_user_id
    FOR UPDATE;

  -- 2b. Missing user_merits row guard (WR-01).
  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- 3. Pre-check (happy path). CHECK constraint is the safety net (D-20).
  IF (v_sub_balance + v_shop_balance) < v_cost THEN
    RETURN jsonb_build_object(
      'error', 'insufficient_merits',
      'upgrade_required', true
    );
  END IF;

  -- 4. Split: subscription first, shop covers remainder (SHOP-10).
  v_sub_take  := LEAST(v_sub_balance, v_cost);
  v_shop_take := v_cost - v_sub_take;

  -- 5. MER-04 / NFR-07: Write 1 or 2 merit_transactions rows sharing
  --    deduction_id (D-06), inside an inner BEGIN...EXCEPTION block so a
  --    racing concurrent caller (same p_idempotency_key, fired between
  --    our pre-check and our INSERT) raises unique_violation and is
  --    absorbed — the loser returns the winner's deduction_id with
  --    already_deducted=true, the winner commits normally.
  --
  --    260723-2b0 Task 7b (D-7b): the index is now keyed on
  --    (idempotency_key, balance_type), so the two legs of a SPLIT deduction no longer
  --    collide with each other. Before this change the second leg's 23505 aborted this
  --    whole SUBTRANSACTION — discarding the first leg too — and the caller got a
  --    success-with-null-handle that merit-gateway turned into a 500.
  BEGIN
    IF v_sub_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_sub_take, 'subscription', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;

    IF v_shop_take > 0 THEN
      INSERT INTO public.merit_transactions
        (user_id, amount, balance_type, source, feature, metadata, idempotency_key)
      VALUES
        (p_user_id, -v_shop_take, 'shop', 'feature-deduct', p_feature,
         jsonb_build_object('deduction_id', v_deduction_id, 'tier', p_tier),
         p_idempotency_key);
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      -- Race storm: a concurrent caller using the same idempotency_key
      -- inserted first. Look up its deduction_id and return the same
      -- already_deducted shape as the entry-time pre-check.
      --
      -- 260723-2b0 Task 7b: THIS ARM MUST NEVER RETURN A NULL HANDLE. Narrowing the
      -- lookup to live rows creates a NEW way for it to miss: a concurrent
      -- refund_merits can stamp the winner's legs in the window between our 23505 and
      -- our recovery SELECT. Returning {success:true, transaction_id:null} would then
      -- hit merit-gateway.ts:256-263 and become a 500 — the exact failure shape this
      -- migration exists to eliminate. So: filtered lookup, then UNFILTERED fallback,
      -- then RAISE. A raised error is a legible failure; a success-with-null is a
      -- corrupt contract that has already bitten this codebase once.
      SELECT (metadata->>'deduction_id')::uuid
        INTO v_prior_id
        FROM public.merit_transactions
        WHERE idempotency_key = p_idempotency_key
          AND source = 'feature-deduct'
          AND metadata->>'refunded_at' IS NULL
        ORDER BY created_at DESC
        LIMIT 1;

      IF v_prior_id IS NULL THEN
        -- Fallback: the winner's legs were refunded (stamped) between our collision
        -- and this lookup. The row still exists — find it without the live filter.
        SELECT (metadata->>'deduction_id')::uuid
          INTO v_prior_id
          FROM public.merit_transactions
          WHERE idempotency_key = p_idempotency_key
            AND source = 'feature-deduct'
          ORDER BY created_at DESC
          LIMIT 1;
      END IF;

      IF v_prior_id IS NULL THEN
        RAISE EXCEPTION
          'check_and_deduct_merits: unique_violation on idempotency_key % but no feature-deduct row could be recovered; refusing to return success with a null transaction_id',
          p_idempotency_key;
      END IF;

      RETURN jsonb_build_object(
        'success',          true,
        'transaction_id',   v_prior_id,
        'already_deducted', true
      );
  END;

  -- 6. Update user_merits (CHECK constraint is the negative-balance safety
  --    net). Reached only on the winner path — the loser returned inside
  --    the EXCEPTION arm above without touching user_merits.
  UPDATE public.user_merits
    SET subscription_balance = subscription_balance - v_sub_take,
        shop_balance         = shop_balance         - v_shop_take,
        updated_at           = now()
    WHERE user_id = p_user_id;

  -- 7. Happy-path response — verbatim from the 3-arg body. deduction_id is
  --    the refund handle.
  RETURN jsonb_build_object(
    'success',            true,
    'transaction_id',     v_deduction_id,
    'remaining_balance',  (v_sub_balance - v_sub_take) + (v_shop_balance - v_shop_take),
    'deducted_from',      jsonb_build_object(
      'subscription', v_sub_take,
      'shop',         v_shop_take
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_and_deduct_merits(uuid, text, text, text)
  TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verification (read-only, idempotent). Retains the convention of
--    20260512000003:261-277 and 20260415000000_merit_rpcs.sql.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_indexdef   text;
  v_prosecdef  boolean;
  v_prosrc     text;
BEGIN
  -- (a) The new index exists, and its predicate carries BOTH refunded_at and
  --     balance_type. Either one missing means only half the fix landed.
  SELECT indexdef INTO v_indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname  = 'merit_transactions_idempotency_key_live_unique';

  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: index merit_transactions_idempotency_key_live_unique is missing';
  END IF;

  IF position('refunded_at' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: the live-unique index has no refunded_at predicate (the refund/replay hole stays open): %',
      v_indexdef;
  END IF;

  IF position('balance_type' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: the live-unique index is not keyed on balance_type (split deductions still collide): %',
      v_indexdef;
  END IF;

  -- (b) The OLD index is GONE. While it survives it alone rejects the post-refund
  --     replay insert and the entire fix is inert.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'merit_transactions_idempotency_key_unique'
  ) THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: the old index merit_transactions_idempotency_key_unique still exists; the fix is inert while it does';
  END IF;

  -- (c) The 4-arg check_and_deduct_merits is still present and still SECURITY DEFINER.
  SELECT p.prosecdef, p.prosrc INTO v_prosecdef, v_prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'check_and_deduct_merits'
     AND p.pronargs = 4;

  IF v_prosrc IS NULL THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: the 4-arg check_and_deduct_merits is missing';
  END IF;

  IF NOT v_prosecdef THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: the 4-arg check_and_deduct_merits is no longer SECURITY DEFINER';
  END IF;

  -- (d) ...and its body actually consults refund state.
  IF position('refunded_at' IN v_prosrc) = 0 THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: check_and_deduct_merits does not reference refunded_at; the pre-check is still refund-blind';
  END IF;

  -- (e) refund_merits actually stamps. Without this the index predicate never matches
  --     anything and (d) is cosmetic.
  SELECT p.prosrc INTO v_prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'refund_merits'
     AND p.pronargs = 2;

  IF v_prosrc IS NULL THEN
    RAISE EXCEPTION '260723-2b0 Task 7b failed: refund_merits(uuid, uuid) is missing';
  END IF;

  IF position('refunded_at' IN v_prosrc) = 0 THEN
    RAISE EXCEPTION
      '260723-2b0 Task 7b failed: refund_merits does not stamp refunded_at; nothing ever retires a deduction';
  END IF;

  RAISE NOTICE '260723-2b0 Task 7b verified: live-unique index (idempotency_key, balance_type) WHERE refunded_at IS NULL is in place, the old single-column index is gone, and both RPCs are refund-aware.';
END;
$$;
