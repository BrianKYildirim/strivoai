-- Phase 11 Plan 02 / Task 3: check_and_deduct_merits pgTAP coverage (TEST-01).
-- Covers: subscription-first deduction (SHOP-10), shop fallback, split
-- deduction sharing a deduction_id, pure-shop deduction, insufficient_merits,
-- tier_locked for recruiting_lens/free and interview_prep/free, metadata
-- tier propagation, CHECK constraint safety net, and response shape.
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
-- ── Idempotent cleanup (handles crashed prior runs) ────────────────────────
DELETE FROM public.merit_shop_purchases WHERE user_id IN (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000023'::uuid,
  '00000000-0000-0000-0000-000000000024'::uuid,
  '00000000-0000-0000-0000-000000000025'::uuid,
  '00000000-0000-0000-0000-000000000026'::uuid,
  '00000000-0000-0000-0000-000000000027'::uuid
);
DELETE FROM public.merit_transactions WHERE user_id IN (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000023'::uuid,
  '00000000-0000-0000-0000-000000000024'::uuid,
  '00000000-0000-0000-0000-000000000025'::uuid,
  '00000000-0000-0000-0000-000000000026'::uuid,
  '00000000-0000-0000-0000-000000000027'::uuid
);
DELETE FROM public.user_merits WHERE user_id IN (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000023'::uuid,
  '00000000-0000-0000-0000-000000000024'::uuid,
  '00000000-0000-0000-0000-000000000025'::uuid,
  '00000000-0000-0000-0000-000000000026'::uuid,
  '00000000-0000-0000-0000-000000000027'::uuid
);
DELETE FROM public.profiles WHERE id IN (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000023'::uuid,
  '00000000-0000-0000-0000-000000000024'::uuid,
  '00000000-0000-0000-0000-000000000025'::uuid,
  '00000000-0000-0000-0000-000000000026'::uuid,
  '00000000-0000-0000-0000-000000000027'::uuid
);
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-000000000021'::uuid,
  '00000000-0000-0000-0000-000000000022'::uuid,
  '00000000-0000-0000-0000-000000000023'::uuid,
  '00000000-0000-0000-0000-000000000024'::uuid,
  '00000000-0000-0000-0000-000000000025'::uuid,
  '00000000-0000-0000-0000-000000000026'::uuid,
  '00000000-0000-0000-0000-000000000027'::uuid
);

SELECT plan(17);

-- ── Fixture users ──────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000021'::uuid, 'deduct-sub-first@example.test'),
  ('00000000-0000-0000-0000-000000000022'::uuid, 'deduct-split@example.test'),
  ('00000000-0000-0000-0000-000000000023'::uuid, 'deduct-shop-only@example.test'),
  ('00000000-0000-0000-0000-000000000024'::uuid, 'deduct-insufficient@example.test'),
  ('00000000-0000-0000-0000-000000000025'::uuid, 'deduct-tier-locked-recruiting@example.test'),
  ('00000000-0000-0000-0000-000000000026'::uuid, 'deduct-tier-locked-interview@example.test'),
  ('00000000-0000-0000-0000-000000000027'::uuid, 'deduct-check-constraint@example.test');

-- profiles rows created automatically by handle_new_user trigger on auth.users INSERT

-- Overwrite trigger-seeded balances for each fixture.
UPDATE public.user_merits SET subscription_balance = 10, shop_balance = 10
  WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid;
UPDATE public.user_merits SET subscription_balance = 2,  shop_balance = 10
  WHERE user_id = '00000000-0000-0000-0000-000000000022'::uuid;
UPDATE public.user_merits SET subscription_balance = 0,  shop_balance = 10
  WHERE user_id = '00000000-0000-0000-0000-000000000023'::uuid;
UPDATE public.user_merits SET subscription_balance = 1,  shop_balance = 1
  WHERE user_id = '00000000-0000-0000-0000-000000000024'::uuid;
UPDATE public.user_merits SET subscription_balance = 100, shop_balance = 100
  WHERE user_id = '00000000-0000-0000-0000-000000000025'::uuid;
UPDATE public.user_merits SET subscription_balance = 100, shop_balance = 100
  WHERE user_id = '00000000-0000-0000-0000-000000000026'::uuid;

-- Capture response objects for later shape/metadata assertions via TEMP table.
CREATE TEMP TABLE IF NOT EXISTS _t_state (k text PRIMARY KEY, v text);

DO $$
DECLARE
  v_resp_21 jsonb;
  v_resp_22 jsonb;
  v_resp_23 jsonb;
  v_resp_24 jsonb;
  v_resp_25 jsonb;
  v_resp_26 jsonb;
BEGIN
  v_resp_21 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000021'::uuid, 'resume_analysis', 'free');
  v_resp_22 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000022'::uuid, 'resume_analysis', 'free');
  v_resp_23 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000023'::uuid, 'resume_analysis', 'free');
  v_resp_24 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000024'::uuid, 'resume_analysis', 'free');
  v_resp_25 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000025'::uuid, 'recruiting_lens', 'free');
  v_resp_26 := public.check_and_deduct_merits(
    '00000000-0000-0000-0000-000000000026'::uuid, 'interview_prep', 'free');

  INSERT INTO _t_state(k, v) VALUES
    ('resp_21', v_resp_21::text),
    ('resp_22', v_resp_22::text),
    ('resp_23', v_resp_23::text),
    ('resp_24', v_resp_24::text),
    ('resp_25', v_resp_25::text),
    ('resp_26', v_resp_26::text)
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END $$;

-- ── 1. Subscription-first deduction (SHOP-10): sub=10→7, shop untouched ───
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid),
  7,
  'subscription-first: subscription_balance 10 → 7 after cost=3 deduct'
);

SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid),
  10,
  'subscription-first: shop_balance untouched at 10'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid
       AND source  = 'feature-deduct'
       AND balance_type = 'subscription'),
  1,
  'subscription-first: exactly 1 subscription row written'
);

-- ── 2. Shop fallback split (sub=2, shop=10, cost=3 → sub=0, shop=9) ───────
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000022'::uuid),
  0,
  'split: subscription_balance drained from 2 → 0'
);
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000022'::uuid),
  9,
  'split: shop_balance 10 → 9 (covers overflow of 1)'
);

-- ── 3. Split rows share a single deduction_id (D-06) ──────────────────────
SELECT is(
  (SELECT COUNT(DISTINCT metadata->>'deduction_id')::int
     FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000022'::uuid
       AND source  = 'feature-deduct'),
  1,
  'split: 2 rows share exactly 1 deduction_id'
);

-- ── 4. Pure shop deduction (sub=0, shop=10, cost=3) ───────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000023'::uuid),
  7,
  'pure-shop: shop_balance 10 → 7 when subscription is empty'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000023'::uuid
       AND source  = 'feature-deduct'
       AND balance_type = 'shop'),
  1,
  'pure-shop: exactly 1 row written with balance_type=shop'
);

-- ── 5. Insufficient merits: balance unchanged, no rows written ────────────
SELECT is(
  ((SELECT v FROM _t_state WHERE k = 'resp_24')::jsonb)->>'error',
  'insufficient_merits',
  'insufficient: response carries error=insufficient_merits'
);

SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000024'::uuid),
  1,
  'insufficient: subscription_balance unchanged at 1'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000024'::uuid
       AND source  = 'feature-deduct'),
  0,
  'insufficient: zero feature-deduct rows written'
);

-- ── 6. Tier locked — recruiting_lens/free (RCL-01) ────────────────────────
SELECT is(
  ((SELECT v FROM _t_state WHERE k = 'resp_25')::jsonb)->>'error',
  'tier_locked',
  'tier_locked: recruiting_lens/free returns error=tier_locked'
);

SELECT is(
  (SELECT subscription_balance + shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000025'::uuid),
  200,
  'tier_locked recruiting_lens: balance unchanged at 200 (no rows written)'
);

-- ── 7. Tier locked — interview_prep/free (IPC-01) ─────────────────────────
SELECT is(
  ((SELECT v FROM _t_state WHERE k = 'resp_26')::jsonb)->>'error',
  'tier_locked',
  'tier_locked: interview_prep/free returns error=tier_locked'
);

-- ── 8. Metadata carries tier (any feature-deduct row works) ───────────────
SELECT is(
  (SELECT DISTINCT metadata->>'tier' FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid
       AND source  = 'feature-deduct'),
  'free',
  'metadata: feature-deduct row carries tier=free'
);

-- ── 9. transaction_id returned matches the unique metadata deduction_id ──
SELECT is(
  ((SELECT v FROM _t_state WHERE k = 'resp_21')::jsonb)->>'transaction_id',
  (SELECT DISTINCT (metadata->>'deduction_id')
     FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000021'::uuid
       AND source  = 'feature-deduct'),
  'response.transaction_id matches merit_transactions.metadata.deduction_id'
);

-- ── 10. CHECK constraint safety net: manual UPDATE to -1 must throw ──────
SELECT throws_ok(
  $throw$
    UPDATE public.user_merits
       SET subscription_balance = -1
     WHERE user_id = '00000000-0000-0000-0000-000000000027'::uuid
  $throw$,
  '23514',
  NULL,
  'CHECK constraint rejects negative subscription_balance (D-20 safety net)'
);

SELECT * FROM finish();
ROLLBACK;
