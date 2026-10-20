-- Phase 11 Plan 03 / Task 3: reconciliation invariant (SC #5 / MER-12).
-- Randomized-sequence coverage: every mutation (deduct, refund, credit, reset,
-- tier-locked no-op) must leave drift = 0 in reconcile_merit_balance.
-- If any RPC forgets to write its ledger row, the next drift assertion fails.
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
DELETE FROM public.merit_shop_purchases WHERE user_id = '00000000-0000-0000-0000-000000000051'::uuid;
DELETE FROM public.merit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000051'::uuid;
DELETE FROM public.user_merits WHERE user_id = '00000000-0000-0000-0000-000000000051'::uuid;
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000051'::uuid;
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000051'::uuid;

SELECT plan(11);

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- auto_provision_user_merits trigger seeds subscription_balance=5, shop_balance=0
-- and writes a signup-grant merit_transactions row (amount=5). balance_sum=5,
-- transactions_sum=5 → drift=0 at baseline.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000051'::uuid, 'reconcile-test@example.test');

-- profiles row created automatically by handle_new_user trigger on auth.users INSERT

-- ── Step 1: baseline drift=0 (post auto-provision) ─────────────────────────
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 at baseline (post auto-provision)'
);

-- ── Step 2: credit_shop_merits(3-pack) ─────────────────────────────────────
SELECT public.credit_shop_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 3, 'stripe_rec_1');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after credit_shop_merits(3-pack)'
);

-- ── Step 3: deduct resume_analysis/free (cost 3, all from sub) ─────────────
-- State: sub=5, shop=3 → deduct 3 from sub → sub=2, shop=3
SELECT public.check_and_deduct_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 'resume_analysis', 'free');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after deduct resume_analysis/free'
);

-- ── Step 4: refund the resume_analysis deduction ───────────────────────────
-- State: sub=2, shop=3 → refund restores sub=5, shop=3
DO $$
DECLARE v_dedup uuid;
BEGIN
  SELECT DISTINCT (metadata->>'deduction_id')::uuid INTO v_dedup
    FROM public.merit_transactions
    WHERE user_id = '00000000-0000-0000-0000-000000000051'::uuid
      AND source  = 'feature-deduct'
      AND feature = 'resume_analysis'
    LIMIT 1;
  PERFORM public.refund_merits(
    '00000000-0000-0000-0000-000000000051'::uuid, v_dedup);
END $$;
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after refund resume_analysis'
);

-- ── Step 5: deduct career_compass/pro (cost 2, all from sub) ───────────────
-- State: sub=5, shop=3 → sub=3, shop=3
SELECT public.check_and_deduct_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 'career_compass', 'pro');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after deduct career_compass/pro'
);

-- ── Step 6: reset to pro (writes grant delta ledger row) ───────────────────
-- State: sub=3, shop=3 → sub=75, shop=3 (delta=+72 grant row)
SELECT public.reset_subscription_merits(
  '00000000-0000-0000-0000-000000000051'::uuid,
  'pro',
  '2026-05-15 00:00:00+00'::timestamptz
);
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after reset_subscription_merits(pro)'
);

-- ── Step 7: deduct resume_analysis/pro (cost 2) ────────────────────────────
-- State: sub=75, shop=3 → sub=73, shop=3
SELECT public.check_and_deduct_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 'resume_analysis', 'pro');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after deduct resume_analysis/pro'
);

-- ── Step 8: credit_shop_merits(10-pack) ────────────────────────────────────
-- State: sub=73, shop=3 → sub=73, shop=13
SELECT public.credit_shop_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 10, 'stripe_rec_2');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after credit 10-pack'
);

-- ── Step 9: deduct recruiting_lens/pro (cost 8, all from sub) ──────────────
-- State: sub=73, shop=13 → sub=65, shop=13
SELECT public.check_and_deduct_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 'recruiting_lens', 'pro');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after deduct recruiting_lens/pro (may split)'
);

-- ── Step 10: reset to elite ────────────────────────────────────────────────
-- State: sub=65, shop=13 → sub=150, shop=13 (delta=+85 grant row)
SELECT public.reset_subscription_merits(
  '00000000-0000-0000-0000-000000000051'::uuid,
  'elite',
  '2026-06-15 00:00:00+00'::timestamptz
);
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after reset_subscription_merits(elite)'
);

-- ── Step 11: tier_locked call (recruiting_lens/free → no cost row) no-op ──
-- No mutation. drift stays 0.
SELECT public.check_and_deduct_merits(
  '00000000-0000-0000-0000-000000000051'::uuid, 'recruiting_lens', 'free');
SELECT is(
  (SELECT drift FROM public.reconcile_merit_balance(
     '00000000-0000-0000-0000-000000000051'::uuid)),
  0,
  'drift=0 after tier_locked no-op'
);

SELECT * FROM finish();
ROLLBACK;
