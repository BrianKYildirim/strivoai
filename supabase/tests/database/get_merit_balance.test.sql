-- Phase 11 Plan 02 / Task 2: get_merit_balance smoke test.
-- Verifies JSON shape has all four documented keys.
BEGIN;

-- Idempotent cleanup: remove leftover rows from crashed prior runs
DELETE FROM public.merit_shop_purchases WHERE user_id = '00000000-0000-0000-0000-000000000013'::uuid;
DELETE FROM public.merit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000013'::uuid;
DELETE FROM public.user_merits WHERE user_id = '00000000-0000-0000-0000-000000000013'::uuid;
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000013'::uuid;
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000013'::uuid;

SELECT plan(4);

-- ── Fixture ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000013'::uuid, 'balance-test@example.test');

-- profiles row created automatically by handle_new_user trigger on auth.users INSERT

-- Set known balances so the SELECT queries have deterministic values.
UPDATE public.user_merits
   SET subscription_balance    = 7,
       shop_balance            = 4,
       subscription_reset_date = '2027-01-01T00:00:00Z'::timestamptz
 WHERE user_id = '00000000-0000-0000-0000-000000000013'::uuid;

-- ── 1. subscription_balance key present + correct ─────────────────────────
SELECT is(
  (public.get_merit_balance('00000000-0000-0000-0000-000000000013'::uuid)->>'subscription_balance')::int,
  7,
  'get_merit_balance returns subscription_balance'
);

-- ── 2. shop_balance key present + correct ─────────────────────────────────
SELECT is(
  (public.get_merit_balance('00000000-0000-0000-0000-000000000013'::uuid)->>'shop_balance')::int,
  4,
  'get_merit_balance returns shop_balance'
);

-- ── 3. total key equals subscription + shop ───────────────────────────────
SELECT is(
  (public.get_merit_balance('00000000-0000-0000-0000-000000000013'::uuid)->>'total')::int,
  11,
  'get_merit_balance returns total = subscription + shop'
);

-- ── 4. next_reset_date key present ────────────────────────────────────────
SELECT isnt(
  public.get_merit_balance('00000000-0000-0000-0000-000000000013'::uuid)->>'next_reset_date',
  NULL,
  'get_merit_balance returns next_reset_date'
);

SELECT * FROM finish();
ROLLBACK;
