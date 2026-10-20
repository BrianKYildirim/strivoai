-- Phase 8 Paddle retirement: drop Paddle-only schema now that the
-- two-source expiration gate (08-PADDLE-GATE.md) is CLEARED.
-- Provider-neutral access fields (profiles.subscription_tier,
-- profiles.subscription_status, profiles.current_period_end) and all
-- Stripe structures are intentionally untouched.
--
-- Rollback: see 08-PADDLE-ROLLBACK.md and the ROLLBACK block below.

drop table if exists public.paddle_webhook_events;

alter table public.profiles
  drop column if exists paddle_customer_id,
  drop column if exists paddle_subscription_id,
  drop column if exists paddle_price_id;

-- ROLLBACK (run manually only if this migration must be reversed):
-- alter table public.profiles
--   add column if not exists paddle_customer_id text,
--   add column if not exists paddle_subscription_id text,
--   add column if not exists paddle_price_id text;
--
-- create table if not exists public.paddle_webhook_events (
--   id uuid primary key default gen_random_uuid(),
--   event_id text unique not null,
--   event_type text not null,
--   processed_at timestamp with time zone not null default now(),
--   payload jsonb
-- );
--
-- alter table public.paddle_webhook_events enable row level security;
--
-- drop policy if exists "Service role can manage webhook events"
--   on public.paddle_webhook_events;
--
-- create policy "Service role can manage webhook events"
-- on public.paddle_webhook_events
-- for all
-- using (true)
-- with check (true);
--
-- create index if not exists idx_paddle_webhook_events_event_id
--   on public.paddle_webhook_events(event_id);
