-- Add subscription tracking columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active',
ADD COLUMN IF NOT EXISTS paddle_customer_id text,
ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
ADD COLUMN IF NOT EXISTS paddle_price_id text,
ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone;

-- Create table to track processed webhook events (idempotency)
CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb
);

-- Enable RLS
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service role can manage webhook events"
ON public.paddle_webhook_events
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_event_id ON public.paddle_webhook_events(event_id);