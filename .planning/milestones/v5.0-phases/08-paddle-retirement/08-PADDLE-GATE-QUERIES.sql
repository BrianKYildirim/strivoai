-- Phase 8 Paddle retirement gate query pack.
-- Purpose: read-only prod app-state evidence for PADL-01.
--
-- OPERATOR SAFETY:
-- - Run against production only after confirming the target project is
--   zjpjapgraoxdukdvpjes.
-- - Do not paste raw result rows into committed artifacts if they contain
--   emails, full Paddle IDs, webhook payloads, or other customer PII.
-- - Record counts, timestamps, query provenance, and the redacted identifier
--   forms produced below only.
-- - Every statement in this file is SELECT-only.

-- 1. Paddle identifier presence in profiles.
select
  now() as observed_at,
  count(*) filter (
    where paddle_customer_id is not null
       or paddle_subscription_id is not null
       or paddle_price_id is not null
  ) as profiles_with_any_paddle_identifier,
  count(*) filter (where paddle_customer_id is not null) as profiles_with_paddle_customer_id,
  count(*) filter (where paddle_subscription_id is not null) as profiles_with_paddle_subscription_id,
  count(*) filter (where paddle_price_id is not null) as profiles_with_paddle_price_id
from public.profiles;

-- 2. Future-dated access rows among profiles carrying any Paddle identifier.
select
  now() as observed_at,
  count(*) as future_dated_paddle_backed_profiles,
  min(current_period_end) as earliest_future_current_period_end,
  max(current_period_end) as latest_future_current_period_end
from public.profiles
where current_period_end > now()
  and (
    paddle_customer_id is not null
    or paddle_subscription_id is not null
    or paddle_price_id is not null
  );

-- 3. Provider-neutral access classification. Re-run before and after any
-- cleanup migration and compare the rows exactly.
select
  coalesce(subscription_tier, '<null>') as subscription_tier,
  coalesce(subscription_status, '<null>') as subscription_status,
  case
    when current_period_end is null then 'no_period'
    when current_period_end > now() then 'future_period'
    else 'expired_period'
  end as period_state,
  count(*) as profile_count
from public.profiles
group by 1, 2, 3
order by 1, 2, 3;

-- 4. Redaction-safe listing for rows with Paddle identifiers.
-- `profile_ref` is intentionally a non-reversible short hash of the profile id.
-- Paddle values are represented only by short suffixes and presence flags.
select
  left(md5(id::text), 12) as profile_ref,
  subscription_tier,
  subscription_status,
  current_period_end,
  paddle_customer_id is not null as has_paddle_customer_id,
  case when paddle_customer_id is null then null else right(paddle_customer_id, 6) end as paddle_customer_suffix,
  paddle_subscription_id is not null as has_paddle_subscription_id,
  case when paddle_subscription_id is null then null else right(paddle_subscription_id, 6) end as paddle_subscription_suffix,
  paddle_price_id is not null as has_paddle_price_id,
  case when paddle_price_id is null then null else right(paddle_price_id, 6) end as paddle_price_suffix
from public.profiles
where paddle_customer_id is not null
   or paddle_subscription_id is not null
   or paddle_price_id is not null
order by current_period_end desc nulls last, profile_ref;

-- 5. Optional schema-shape check after preview migration and, after operator
-- application, production migration. This checks names only.
select
  table_schema,
  table_name,
  column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'profiles' and column_name in (
      'paddle_customer_id',
      'paddle_subscription_id',
      'paddle_price_id',
      'subscription_tier',
      'subscription_status',
      'current_period_end'
    ))
    or table_name = 'paddle_webhook_events'
  )
order by table_name, column_name;
