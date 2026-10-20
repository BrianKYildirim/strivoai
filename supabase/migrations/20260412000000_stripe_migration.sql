-- Phase 07: Stripe migration — additive only.
-- Closes STR-06 (profiles columns) and STR-07 (stripe_webhook_events with correct RLS).
-- CRITICAL: Do NOT add any permissive policy that matches all rows. The Paddle migration
-- has that bug (SEC-06); do not replicate. Service role bypasses RLS automatically.

-- STR-06: Additive profile columns (D-04) — keep all paddle_* columns untouched
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text;

-- D-07: Indexes for webhook lookup fallback chain
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id
  ON public.profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- STR-07 / D-06: Webhook events idempotency table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- STR-07: RLS enabled with NO permissive policies.
-- Service role bypasses RLS. Anon / authenticated roles have zero access by default.
-- DO NOT add any permissive CREATE POLICY here — that is the SEC-06 Paddle bug.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Analytics index (helper only, not hot path)
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON public.stripe_webhook_events(created_at DESC);
