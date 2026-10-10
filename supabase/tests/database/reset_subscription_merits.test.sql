-- Phase 11 Plan 03 / Task 2B: reset_subscription_merits pgTAP coverage (TEST-02).
-- Phase 30 updates Free from no-op to monthly reset-to-cap.
-- Exercises SC #4 (pro=75, elite=150, shop_balance untouched), Free=10
-- reset semantics, and yearly cadence (multiple sequential pro resets all land
-- on 75, no rollover).
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
DELETE FROM public.merit_shop_purchases WHERE user_id IN (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000043'::uuid
);
DELETE FROM public.merit_transactions WHERE user_id IN (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000043'::uuid
);
DELETE FROM public.user_merits WHERE user_id IN (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000043'::uuid
);
DELETE FROM public.profiles WHERE id IN (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000043'::uuid
);
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-000000000041'::uuid,
  '00000000-0000-0000-0000-000000000042'::uuid,
  '00000000-0000-0000-0000-000000000043'::uuid
);

SELECT plan(15);

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- Three users (pro, elite, free). Overwrite auto-provisioned Pro/Elite balances
-- with subscription_balance=12, shop_balance=99 so we can detect accidental
-- shop_balance mutation AND verify the grant delta is (target - 12). Free is
-- set at cap (10) to verify MER-09: reset-to-cap grants no additional merits.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000041'::uuid, 'reset-pro@example.test'),
  ('00000000-0000-0000-0000-000000000042'::uuid, 'reset-elite@example.test'),
  ('00000000-0000-0000-0000-000000000043'::uuid, 'reset-free@example.test');

-- profiles rows created automatically by handle_new_user trigger on auth.users INSERT

UPDATE public.user_merits
   SET subscription_balance    = 12,
       shop_balance            = 99,
       subscription_reset_date = '2026-04-15 00:00:00+00'::timestamptz
 WHERE user_id IN (
   '00000000-0000-0000-0000-000000000041'::uuid,
   '00000000-0000-0000-0000-000000000042'::uuid,
   '00000000-0000-0000-0000-000000000043'::uuid
 );

UPDATE public.user_merits
   SET subscription_balance = 10
 WHERE user_id = '00000000-0000-0000-0000-000000000043'::uuid;

-- ── 1. Pro reset returns success=true ──────────────────────────────────────
SELECT is(
  (public.reset_subscription_merits(
     '00000000-0000-0000-0000-000000000041'::uuid,
     'pro',
     '2026-05-15 00:00:00+00'::timestamptz
   )->>'success')::boolean,
  true,
  'reset_subscription_merits(pro) returns success=true'
);

-- ── 2. Pro subscription_balance = 75 ───────────────────────────────────────
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid),
  75,
  'pro user subscription_balance = 75 after reset'
);

-- ── 3. Pro shop_balance = 99 (D-15: untouched) ─────────────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid),
  99,
  'pro user shop_balance = 99 (UNTOUCHED by reset, D-15)'
);

-- ── 4. Pro subscription_reset_date advanced ────────────────────────────────
SELECT is(
  (SELECT subscription_reset_date FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid),
  '2026-05-15 00:00:00+00'::timestamptz,
  'pro user subscription_reset_date advanced to next cycle'
);

-- ── 5. Pro grant ledger row has amount = 75 - 12 = 63 ──────────────────────
SELECT is(
  (SELECT amount FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid
       AND source  = 'subscription-reset'
       AND balance_type = 'grant'
     ORDER BY created_at DESC LIMIT 1),
  63,
  'pro grant ledger row amount = 75 - 12 = 63'
);

-- ── 6. Elite reset → subscription_balance = 150 ────────────────────────────
SELECT public.reset_subscription_merits(
  '00000000-0000-0000-0000-000000000042'::uuid,
  'elite',
  '2026-05-15 00:00:00+00'::timestamptz
);
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000042'::uuid),
  150,
  'elite user subscription_balance = 150 after reset'
);

-- ── 7. Elite shop_balance = 99 (UNTOUCHED) ─────────────────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000042'::uuid),
  99,
  'elite user shop_balance = 99 (UNTOUCHED by reset, D-15)'
);

-- ── 8. Elite grant ledger row has amount = 150 - 12 = 138 ──────────────────
SELECT is(
  (SELECT amount FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000042'::uuid
       AND source  = 'subscription-reset'
       AND balance_type = 'grant'
     ORDER BY created_at DESC LIMIT 1),
  138,
  'elite grant ledger row amount = 150 - 12 = 138'
);

-- ── 9. Free reset returns success=true ─────────────────────────────────────
SELECT is(
  (public.reset_subscription_merits(
     '00000000-0000-0000-0000-000000000043'::uuid,
     'free',
     '2026-05-15 00:00:00+00'::timestamptz
   )->>'success')::boolean,
  true,
  'free tier reset returns success=true'
);

-- ── 10. Free user subscription_balance resets to cap 10 ────────────────────
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000043'::uuid),
  10,
  'free user subscription_balance = 10 after monthly reset'
);

-- ── 11. Free user shop_balance = 99 (UNTOUCHED) ────────────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000043'::uuid),
  99,
  'free user shop_balance = 99 (UNTOUCHED)'
);

-- ── 12. Free grant ledger row records zero delta at cap ────────────────────
SELECT is(
  (SELECT amount FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000043'::uuid
       AND source  = 'subscription-reset'
       AND balance_type = 'grant'
     ORDER BY created_at DESC LIMIT 1),
  0,
  'free user at cap receives zero additional merits'
);

-- ── 13. Free subscription_reset_date advanced ──────────────────────────────
SELECT is(
  (SELECT subscription_reset_date FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000043'::uuid),
  '2026-05-15 00:00:00+00'::timestamptz,
  'free user subscription_reset_date advanced to next cycle'
);

-- ── 14. Yearly cadence: two more Pro resets → still 75 (no rollover) ───────
SELECT public.reset_subscription_merits(
  '00000000-0000-0000-0000-000000000041'::uuid,
  'pro',
  '2026-06-15 00:00:00+00'::timestamptz
);
SELECT public.reset_subscription_merits(
  '00000000-0000-0000-0000-000000000041'::uuid,
  'pro',
  '2026-07-15 00:00:00+00'::timestamptz
);
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid),
  75,
  'pro user subscription_balance = 75 after three sequential resets (no rollover)'
);

-- ── 15. Three subscription-reset grant rows for pro user ───────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000041'::uuid
       AND source  = 'subscription-reset'
       AND balance_type = 'grant'),
  3,
  'three subscription-reset grant rows after three pro resets'
);

SELECT * FROM finish();
ROLLBACK;
