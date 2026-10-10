-- Phase 11 Plan 02 / Task 2: refund_merits pgTAP coverage.
-- Exercises SC #2 (refund idempotency) + D-06 split-bucket restoration.
-- State passed between pl/pgSQL DO block and pgTAP SELECTs via TEMP TABLE
-- to avoid fragile set_config / current_setting GUC round-tripping.
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
DELETE FROM public.merit_shop_purchases WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid;
DELETE FROM public.merit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid;
DELETE FROM public.user_merits WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid;
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000011'::uuid;
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000011'::uuid;

SELECT plan(8);

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- auto_provision_user_merits trigger on public.profiles inserts user_merits
-- + a signup-grant row automatically. profiles.id FKs to auth.users(id) so
-- we must seed auth.users first.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000011'::uuid, 'refund-test@example.test');

-- profiles row created automatically by handle_new_user trigger on auth.users INSERT

-- Overwrite trigger-seeded balance (5 sub / 0 shop) with the 2/1 split that
-- forces a split deduction on a 3-cost feature (career_compass/free).
UPDATE public.user_merits
   SET subscription_balance = 2,
       shop_balance         = 1
 WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid;

-- ── 1. Deduct 3 (career_compass/free) — triggers split ─────────────────────
SELECT isnt(
  (public.check_and_deduct_merits(
     '00000000-0000-0000-0000-000000000011'::uuid,
     'career_compass',
     'free'
   )->>'transaction_id')::uuid,
  NULL::uuid,
  'check_and_deduct_merits returns transaction_id on success'
);

-- ── 2. Split deduction writes exactly 2 rows ───────────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid
       AND source  = 'feature-deduct'),
  2,
  'split deduction writes exactly 2 merit_transactions rows'
);

-- ── 3. Total balance is zero after full deduct ─────────────────────────────
SELECT is(
  (SELECT subscription_balance + shop_balance
     FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid),
  0,
  'balance drops to zero after full deduct'
);

-- ── 4. State passing: capture deduction_id + both refund results ───────────
CREATE TEMP TABLE IF NOT EXISTS _t_state (k text PRIMARY KEY, v text);

DO $$
DECLARE
  v_dedup_id uuid;
  v_refund_1 jsonb;
  v_refund_2 jsonb;
BEGIN
  SELECT DISTINCT (metadata->>'deduction_id')::uuid
    INTO v_dedup_id
    FROM public.merit_transactions
    WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid
      AND source  = 'feature-deduct';

  -- First refund (expected: success).
  v_refund_1 := public.refund_merits(
    '00000000-0000-0000-0000-000000000011'::uuid,
    v_dedup_id
  );

  -- Second refund with SAME deduction_id (expected: already_refunded, no mutation).
  v_refund_2 := public.refund_merits(
    '00000000-0000-0000-0000-000000000011'::uuid,
    v_dedup_id
  );

  INSERT INTO _t_state(k, v) VALUES
    ('dedup_id', v_dedup_id::text),
    ('refund_1', v_refund_1::text),
    ('refund_2', v_refund_2::text)
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END $$;

-- ── 4. First refund returns success ────────────────────────────────────────
SELECT is(
  (((SELECT v FROM _t_state WHERE k = 'refund_1')::jsonb)->>'success')::boolean,
  true,
  'first refund returns success'
);

-- ── 5. Subscription bucket restored to original 2 ──────────────────────────
SELECT is(
  (SELECT subscription_balance
     FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid),
  2,
  'subscription_balance restored to original 2 after refund (unchanged by second refund)'
);

-- ── 6. Shop bucket restored to original 1 ──────────────────────────────────
SELECT is(
  (SELECT shop_balance
     FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000011'::uuid),
  1,
  'shop_balance restored to original 1 after refund (unchanged by second refund)'
);

-- ── 7. Refund rows use balance_type='refund' AND second refund added none ──
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id      = '00000000-0000-0000-0000-000000000011'::uuid
       AND source       = 'feature-refund'
       AND balance_type = 'refund'),
  2,
  'refund rows use balance_type=refund and second refund inserted no rows'
);

-- ── 8. Second refund call is idempotent no-op (SC #2) ──────────────────────
SELECT is(
  ((SELECT v FROM _t_state WHERE k = 'refund_2')::jsonb)->>'error',
  'already_refunded',
  'second refund call is idempotent no-op'
);

SELECT * FROM finish();
ROLLBACK;
