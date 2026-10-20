-- Phase 11 Plan 03 / Task 2A: credit_shop_merits pgTAP coverage (TEST-03).
-- Exercises SC #3 (Stripe webhook idempotency), all four pack sizes, and the
-- merit_shop_purchases.pack_size CHECK constraint as the invalid-pack safety net.
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
DELETE FROM public.merit_shop_purchases WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid;
DELETE FROM public.merit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid;
DELETE FROM public.user_merits WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid;
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000031'::uuid;
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000031'::uuid;

SELECT plan(14);

-- ── Fixture ─────────────────────────────────────────────────────────────────
-- auto_provision_user_merits trigger seeds user_merits (5 sub / 0 shop) and
-- a signup-grant merit_transactions row automatically.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000031'::uuid, 'credit-shop-test@example.test');

-- profiles row created automatically by handle_new_user trigger on auth.users INSERT

-- ── 1. Credit 3-pack returns success=true ──────────────────────────────────
SELECT is(
  (public.credit_shop_merits(
     '00000000-0000-0000-0000-000000000031'::uuid, 3, 'stripe_test_1'
   )->>'success')::boolean,
  true,
  'credit_shop_merits(3-pack) returns success=true'
);

-- ── 2. shop_balance incremented by 3 ───────────────────────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  3,
  'shop_balance = 3 after 3-pack credit'
);

-- ── 3. One purchase row inserted for stripe_test_1 ─────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_shop_purchases
     WHERE stripe_payment_intent_id = 'stripe_test_1'),
  1,
  'one merit_shop_purchases row for stripe_test_1'
);

-- ── 4. One shop-credit ledger row for stripe_test_1 ────────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid
       AND source  = 'shop-credit'
       AND balance_type = 'shop'
       AND amount = 3
       AND (metadata->>'stripe_payment_id') = 'stripe_test_1'),
  1,
  'one shop-credit merit_transactions row for stripe_test_1 (amount=3)'
);

-- ── 5. Duplicate call returns duplicate=true ───────────────────────────────
SELECT is(
  (public.credit_shop_merits(
     '00000000-0000-0000-0000-000000000031'::uuid, 3, 'stripe_test_1'
   )->>'duplicate')::boolean,
  true,
  'duplicate stripe_payment_id returns duplicate=true'
);

-- ── 6. shop_balance unchanged after duplicate call ─────────────────────────
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  3,
  'shop_balance unchanged (still 3) after duplicate call'
);

-- ── 7. Still only one purchase row for stripe_test_1 ───────────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_shop_purchases
     WHERE stripe_payment_intent_id = 'stripe_test_1'),
  1,
  'still only one merit_shop_purchases row after duplicate call'
);

-- ── 8. Still only one ledger row tagged with stripe_test_1 ─────────────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid
       AND (metadata->>'stripe_payment_id') = 'stripe_test_1'),
  1,
  'still only one ledger row for stripe_test_1 after duplicate call'
);

-- ── 9. Credit 10-pack (different payment_id) → shop_balance = 13 ───────────
SELECT public.credit_shop_merits(
  '00000000-0000-0000-0000-000000000031'::uuid, 10, 'stripe_test_2'
);
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  13,
  'shop_balance = 13 after 10-pack credit'
);

-- ── 10. Credit 25-pack → shop_balance = 38 ─────────────────────────────────
SELECT public.credit_shop_merits(
  '00000000-0000-0000-0000-000000000031'::uuid, 25, 'stripe_test_3'
);
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  38,
  'shop_balance = 38 after 25-pack credit'
);

-- ── 11. Credit 50-pack → shop_balance = 88 ─────────────────────────────────
SELECT public.credit_shop_merits(
  '00000000-0000-0000-0000-000000000031'::uuid, 50, 'stripe_test_4'
);
SELECT is(
  (SELECT shop_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  88,
  'shop_balance = 88 after 50-pack credit'
);

-- ── 12. Four shop-credit ledger rows total (one per pack credited) ─────────
SELECT is(
  (SELECT COUNT(*)::int FROM public.merit_transactions
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid
       AND source  = 'shop-credit'),
  4,
  'four distinct shop-credit ledger rows for four distinct payment_ids'
);

-- ── 13. subscription_balance UNTOUCHED (signup 5) ──────────────────────────
SELECT is(
  (SELECT subscription_balance FROM public.user_merits
     WHERE user_id = '00000000-0000-0000-0000-000000000031'::uuid),
  5,
  'subscription_balance unchanged by any shop credit'
);

-- ── 14. Invalid pack_size (7) returns error=invalid_pack_size ───────────────
-- Explicit guard at the top of credit_shop_merits rejects unrecognized pack
-- sizes with a jsonb error response before any lock or mutation (CR-01).
SELECT is(
  (public.credit_shop_merits(
     '00000000-0000-0000-0000-000000000031'::uuid, 7, 'stripe_bad'
   )->>'error'),
  'invalid_pack_size',
  'invalid pack_size returns error=invalid_pack_size'
);

SELECT * FROM finish();
ROLLBACK;
