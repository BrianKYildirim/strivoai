---
status: ready
phase: 08-paddle-retirement
source: [08-01-PLAN.md]
updated: 2026-07-09
---

# Phase 8 Paddle Rollback Package

This package documents how to reverse a future clear-gate Paddle retirement.
It is not permission to remove Paddle. Removal still requires
`08-PADDLE-GATE.md` to show `Gate verdict: clear`.

## Scope

Rollback restores Paddle-only schema and, if needed, the retired function/config
surface. It must not overwrite provider-neutral access fields:

- keep `profiles.subscription_tier`
- keep `profiles.subscription_status`
- keep `profiles.current_period_end`
- keep Stripe customer, subscription, price, and webhook structures

## Schema Rollback SQL

Run only if a clear-gate cleanup was applied and must be reversed.

```sql
alter table public.profiles
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_price_id text;

create table if not exists public.paddle_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  event_type text not null,
  processed_at timestamp with time zone not null default now(),
  payload jsonb
);

alter table public.paddle_webhook_events enable row level security;

drop policy if exists "Service role can manage webhook events"
  on public.paddle_webhook_events;

create policy "Service role can manage webhook events"
on public.paddle_webhook_events
for all
using (true)
with check (true);

create index if not exists idx_paddle_webhook_events_event_id
  on public.paddle_webhook_events(event_id);
```

## Function and Config Rollback

Restore the live Paddle function surface only if an in-flight Paddle subscription
is confirmed and the operator decides webhooks must resume.

Files to restore from the commit before Phase 8 cleanup:

- `supabase/functions/paddle-webhook/index.ts`
- `supabase/functions/paddle-webhook/replay-window.test.ts`
- `supabase/config.toml` entry `[functions.paddle-webhook]`
- `scripts/deploy.ps1` function list entry `"paddle-webhook"`
- `supabase/functions/deno.json` replay-window test registration

Secret handling:

- restore `PADDLE_WEBHOOK_SECRET` only in the relevant Supabase environment
- never record the secret value in repo artifacts
- verify the secret by name/status only

Deploy rollback:

1. Restore the function/config files.
2. Run the focused Paddle webhook test if the source is restored.
3. Deploy to preview first with `scripts/deploy.ps1 -Env staging`.
4. Have the operator apply the same restoration to production with
   `scripts/deploy.ps1 -Env production`.
5. Verify production by function name and non-secret secret-name presence only.

## Type Rollback

After schema rollback, regenerate Supabase types from the target schema so
`src/integrations/supabase/types.ts` again reflects:

- `profiles.paddle_customer_id`
- `profiles.paddle_subscription_id`
- `profiles.paddle_price_id`
- `public.paddle_webhook_events`

Do not hand-edit generated type fields except as an emergency local repair that
is immediately replaced by generated output.

## Preview-First and Prod Ceremony

1. Apply the cleanup or rollback migration to preview first.
2. Run the provider-neutral access classification query before and after.
3. Run focused billing tests for Stripe checkout, portal, webhook, and Merit
   behavior.
4. Operator applies production migration or rollback only after preview evidence
   is acceptable.
5. Agent performs production read-only verification after operator completion.

## Read-Only Verification

Use `.planning/phases/08-paddle-retirement/08-PADDLE-GATE-QUERIES.sql` to verify
schema names and access classification. Record counts and status only; do not
record raw customer data, full external IDs, webhook payloads, or secrets.
