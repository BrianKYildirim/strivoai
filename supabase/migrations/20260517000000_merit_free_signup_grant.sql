-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 30 Plan 01 — Migration #1: auto_provision_user_merits Free signup grant
--
-- D-01 / MER-01: New Free signups receive `subscription_balance = 10`,
-- `lifetime_granted = 10`, and a non-NULL `subscription_reset_date` set one
-- month from insert (effectively the next anniversary of created_at since the
-- trigger fires AFTER INSERT ON public.profiles when created_at = now()).
-- Signup-grant ledger row amount is bumped 5 → 10 to match the new constants.
--
-- Replaces the function body defined in
-- supabase/migrations/20260414000000_merit_ledger_foundation.sql:115-133
-- via CREATE OR REPLACE so the existing
-- `on_profile_created_provision_merits` trigger binding survives untouched
-- (no DROP TRIGGER / CREATE TRIGGER issued here).
--
-- NFR-01: rollback block at the bottom of this file (comments only).
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
  VALUES (NEW.id, 10, 0, 10, (now() + interval '1 month'), false)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.merit_transactions
    (user_id, amount, balance_type, source, feature, metadata)
  VALUES (NEW.id, 10, 'grant', 'signup-grant', NULL, '{}'::jsonb);

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (NFR-01) — text-form, not executable. To revert to the Phase 10
-- shape (5 / 0 / 5 / NULL / false; signup-grant amount=5) run this block:
--
-- CREATE OR REPLACE FUNCTION public.auto_provision_user_merits()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER SET search_path = public
-- AS $$
-- BEGIN
--   INSERT INTO public.user_merits
--     (user_id, subscription_balance, shop_balance, lifetime_granted,
--      subscription_reset_date, free_linkedin_scan_used)
--   VALUES (NEW.id, 5, 0, 5, NULL, false)
--   ON CONFLICT (user_id) DO NOTHING;
--
--   INSERT INTO public.merit_transactions
--     (user_id, amount, balance_type, source, feature, metadata)
--   VALUES (NEW.id, 5, 'grant', 'signup-grant', NULL, '{}'::jsonb);
--
--   RETURN NEW;
-- END;
-- $$;
-- ─────────────────────────────────────────────────────────────────────────────
