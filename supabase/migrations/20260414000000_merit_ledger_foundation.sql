-- Phase 10: merit-ledger-foundation — additive only.
-- Closes MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04.
--
-- CRITICAL: Do NOT add any permissive policy that matches all rows (the SEC-06
-- anti-pattern). The Paddle migration has that bug; do not replicate. Service role
-- bypasses RLS automatically, which is the ONLY legitimate write path to these tables.
--
-- CRITICAL: Do NOT touch the legacy ledger tables (see MIG-04).
-- MIG-04 keeps them read-only. This migration must contain zero references to those names.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_merits  (MER-01, MER-13, MER-14)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_merits (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE
                             REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_balance     integer NOT NULL DEFAULT 0
                             CHECK (subscription_balance >= 0),
  shop_balance             integer NOT NULL DEFAULT 0
                             CHECK (shop_balance >= 0),
  lifetime_granted         integer NOT NULL DEFAULT 0,
  subscription_reset_date  timestamptz NULL,
  free_linkedin_scan_used  boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. merit_transactions  (MER-02)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL
                  REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        integer NOT NULL,
  balance_type  text NOT NULL
                  CHECK (balance_type IN ('subscription','shop','grant','refund')),
  source        text NOT NULL,
  feature       text NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. merit_shop_purchases  (MER-03)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merit_shop_purchases (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL
                               REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_size                  integer NOT NULL
                               CHECK (pack_size IN (3, 10, 25, 50)),
  price_cents                integer NOT NULL CHECK (price_cents > 0),
  stripe_payment_intent_id   text NOT NULL UNIQUE,
  stripe_receipt_url         text NULL,
  status                     text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','succeeded','failed','refunded')),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — enabled, SELECT-only user policy, zero permissive write policies.
--    Service role bypasses RLS automatically. DO NOT add a permissive-all clause (SEC-06).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_merits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merit_transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merit_shop_purchases   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_merits_select_own"
  ON public.user_merits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "merit_transactions_select_own"
  ON public.merit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "merit_shop_purchases_select_own"
  ON public.merit_shop_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_merit_transactions_user_created
  ON public.merit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merit_transactions_refund_of
  ON public.merit_transactions((metadata->>'refund_of'))
  WHERE metadata ? 'refund_of';

CREATE INDEX IF NOT EXISTS idx_merit_shop_purchases_user_created
  ON public.merit_shop_purchases(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_merits_subscription_reset_date
  ON public.user_merits(subscription_reset_date)
  WHERE subscription_reset_date IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. updated_at trigger (reuses existing public.update_updated_at_column()).
--    merit_transactions and merit_shop_purchases are append-only — no trigger.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_user_merits_updated_at ON public.user_merits;
CREATE TRIGGER update_user_merits_updated_at
  BEFORE UPDATE ON public.user_merits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Auto-provision trigger — mirrors handle_new_user posture.
--    Hooks public.profiles (NOT auth.users — Pitfall 3).
--    SECURITY DEFINER SET search_path = public (ASVS V4).
--    Inserts user_merits row AND signup-grant merit_transactions row (D-08).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_merits
    (user_id, subscription_balance, shop_balance, lifetime_granted,
     subscription_reset_date, free_linkedin_scan_used)
  VALUES (NEW.id, 5, 0, 5, NULL, false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 5, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_provision_merits ON public.profiles;
CREATE TRIGGER on_profile_created_provision_merits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_user_merits();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Backfill — trigger is already created above (D-14 ordering); any signup
--    racing the backfill gets its row from the trigger, and ON CONFLICT
--    DO NOTHING here skips them.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.user_merits
  (user_id, subscription_balance, shop_balance, lifetime_granted,
   subscription_reset_date, free_linkedin_scan_used)
SELECT id, 5, 0, 5, NULL, false
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Grant-row backfill — idempotent via WHERE NOT EXISTS (D-15, Pitfall 5).
-- Uses source='phase-10-backfill' to distinguish from signup-grant rows.
INSERT INTO public.merit_transactions
  (user_id, amount, balance_type, source, feature, metadata)
SELECT p.id, 5, 'grant', 'phase-10-backfill', NULL, '{}'::jsonb
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.merit_transactions t
  WHERE t.user_id = p.id
    AND t.source IN ('phase-10-backfill', 'signup-grant')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Verification block (D-16) — asserts Success Criterion #4 at deploy time.
--    If counts mismatch, RAISE EXCEPTION rolls back the entire migration.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  profile_count integer;
  merit_count   integer;
  grant_count   integer;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO merit_count   FROM public.user_merits;
  SELECT COUNT(*) INTO grant_count
    FROM public.merit_transactions
    WHERE source IN ('phase-10-backfill', 'signup-grant');

  IF profile_count <> merit_count THEN
    RAISE EXCEPTION
      'Phase 10 backfill failed: % profiles but % user_merits rows',
      profile_count, merit_count;
  END IF;

  IF grant_count < profile_count THEN
    RAISE EXCEPTION
      'Phase 10 grant backfill failed: % profiles but only % grant rows',
      profile_count, grant_count;
  END IF;

  RAISE NOTICE 'Phase 10 verification passed: % profiles, % user_merits, % grant rows',
    profile_count, merit_count, grant_count;
END $$;
