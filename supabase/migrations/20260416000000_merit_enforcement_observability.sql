-- Phase 13: Merit enforcement observability
-- Adds: 4 aggregation views, alert_state debounce table, 2 helper RPCs
-- Non-destructive; no data migration.
--
-- Schema notes (verified against Phase 10 + 11 migrations):
--   merit_transactions: id, user_id, amount, balance_type, source, feature, metadata, created_at
--   merit_shop_purchases: id, user_id, pack_size, price_cents, stripe_payment_intent_id, stripe_receipt_url, status, created_at
--   user_merits: id, user_id, subscription_balance, shop_balance, lifetime_granted, ...
--   No merit_exhaustion_events or shop_purchases_failed tables exist yet.

begin;

-- View 1: Merits in circulation
-- Tier-bucketed sum of net merit flow (deductions vs refunds) over trailing 30d.
-- Deductions are negative amounts with source='feature-deduct'.
-- Refunds are positive amounts with balance_type='refund'.
create or replace view public.v_merits_in_circulation as
select
  coalesce(p.subscription_tier, 'free')::text as tier,
  count(distinct mt.user_id)                  as user_count,
  coalesce(sum(mt.amount), 0)                 as net_impulses_30d
from public.merit_transactions mt
left join public.profiles p on p.id = mt.user_id
where mt.created_at >= now() - interval '30 days'
group by coalesce(p.subscription_tier, 'free');

-- View 2: Feature consumption daily
-- Daily breakdown of deductions and refunds per feature.
create or replace view public.v_feature_consumption_daily as
select
  date_trunc('day', mt.created_at)::date as day,
  mt.feature::text                       as feature,
  count(*) filter (where mt.source = 'feature-deduct')  as deductions,
  count(*) filter (where mt.balance_type = 'refund')     as refunds,
  coalesce(sum(-mt.amount) filter (where mt.source = 'feature-deduct'), 0) as impulses_spent
from public.merit_transactions mt
where mt.created_at >= now() - interval '30 days'
  and mt.feature is not null
group by 1, 2
order by 1 desc, 2;

-- View 3: Shop purchases daily
-- Uses merit_shop_purchases (the actual Phase 10 table).
create or replace view public.v_shop_purchases_daily as
select
  date_trunc('day', sp.created_at)::date as day,
  sp.status::text                        as status,
  count(*)                               as purchase_count,
  coalesce(sum(sp.price_cents), 0)       as total_price_cents,
  coalesce(sum(sp.pack_size), 0)         as total_impulses_granted
from public.merit_shop_purchases sp
where sp.created_at >= now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;

-- View 4: Conversion funnel (PROVISIONAL)
-- merit_exhaustion_events table does not exist yet. Shipping as a stub view
-- returning zero rows so the admin endpoint can safely query it. A future
-- phase will replace this with real data once the exhaustion-event table ships.
create or replace view public.v_conversion_funnel as
  select null::date as day,
         0::bigint as depleted_users,
         0::bigint as shop_viewers,
         0::bigint as purchasers
  where false;

-- alert_state debounce table
create table if not exists public.alert_state (
  alert_key    text primary key,
  last_fired_at timestamptz not null default now(),
  last_value   jsonb
);

alter table public.alert_state enable row level security;
-- No policies: service role only (matches Phase 10 helper-table pattern).

-- Helper RPC: AI failure rate over trailing hour
-- Computed from merit_transactions: deductions that were later refunded vs total deductions.
-- A refund row has balance_type='refund' and metadata->>'deduction_id' linking to the original.
create or replace function public.get_ai_failure_rate_1h()
returns numeric
language sql stable security definer
set search_path = public
as $$
  with recent_deductions as (
    select
      (metadata->>'deduction_id')::text as deduction_id
    from public.merit_transactions
    where created_at >= now() - interval '1 hour'
      and source = 'feature-deduct'
      and feature in (
        'resume_analysis','career_compass','linkedin_grading',
        'recruiting_lens','skills_gap_analysis','job_comparison','interview_prep'
      )
  ),
  recent_refunds as (
    select
      (metadata->>'deduction_id')::text as deduction_id
    from public.merit_transactions
    where created_at >= now() - interval '1 hour'
      and balance_type = 'refund'
  )
  select case
    when (select count(*) from recent_deductions) = 0 then 0::numeric
    else (
      (select count(distinct rd.deduction_id)
       from recent_deductions rd
       where exists (select 1 from recent_refunds rr where rr.deduction_id = rd.deduction_id))::numeric
      / nullif((select count(distinct deduction_id) from recent_deductions), 0)
    )
  end;
$$;

revoke all on function public.get_ai_failure_rate_1h() from public;
grant execute on function public.get_ai_failure_rate_1h() to service_role;

-- Helper RPC: Shop purchase failure rate over trailing hour
-- Uses merit_shop_purchases.status: 'succeeded' vs 'failed'.
create or replace function public.get_shop_failure_rate_1h()
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case
    when count(*) = 0 then 0::numeric
    else (
      count(*) filter (where status = 'failed')::numeric
      / nullif(count(*), 0)
    )
  end
  from public.merit_shop_purchases
  where created_at >= now() - interval '1 hour';
$$;

revoke all on function public.get_shop_failure_rate_1h() from public;
grant execute on function public.get_shop_failure_rate_1h() to service_role;

-- Analytics index (only if not already present from Phase 10)
create index if not exists idx_merit_transactions_created_at
  on public.merit_transactions (created_at desc);

commit;
