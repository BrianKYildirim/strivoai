---
status: applied
phase: 08-paddle-retirement
source: [08-04-PLAN.md, 08-PADDLE-GATE.md]
target: preview (cimjltzovkahkqecpwgi)
updated: 2026-07-09
---

# Phase 8 Preview Paddle Migration Evidence

Migration: `supabase/migrations/20260709000001_retire_paddle_columns_and_table.sql`
Applied via `mcp__supabasepreview__apply_migration` (name: `retire_paddle_columns_and_table`) against
preview project `cimjltzovkahkqecpwgi` only. Production (`zjpjapgraoxdukdvpjes`) was not touched.

## Pre-Migration State (query 3 — provider-neutral access classification)

| subscription_tier | subscription_status | period_state | profile_count |
|---|---|---|---|
| elite | active | no_period | 4 |
| free | active | no_period | 5 |
| pro | active | no_period | 2 |

## Pre-Migration State (query 5 — schema shape)

`profiles`: `current_period_end`, `paddle_customer_id`, `paddle_price_id`, `paddle_subscription_id`,
`subscription_status`, `subscription_tier`
`paddle_webhook_events`: `event_id`, `event_type`, `id`, `payload`, `processed_at`

## Post-Migration State (query 3 — provider-neutral access classification)

| subscription_tier | subscription_status | period_state | profile_count |
|---|---|---|---|
| elite | active | no_period | 4 |
| free | active | no_period | 5 |
| pro | active | no_period | 2 |

**Access classification unchanged: yes.** Row set is byte-identical to the pre-migration snapshot.

## Post-Migration State (query 5 — schema shape)

`profiles`: `current_period_end`, `subscription_status`, `subscription_tier` only.
No `paddle_customer_id`, `paddle_subscription_id`, or `paddle_price_id` columns remain.
No `paddle_webhook_events` table remains (zero rows returned for that table_name).

## Verdict

Preview schema retirement confirmed safe: Paddle-only schema fully removed, provider-neutral
access fields (`subscription_tier`, `subscription_status`, `current_period_end`) untouched, and
no user's tier/status classification changed as a result of the migration.

The identical DROP statements are captured in
`.planning/phases/08-paddle-retirement/08-PADDLE-PROD-MIGRATION.sql` for the operator to apply to
production per `08-PADDLE-PROD-CEREMONY.md` (plan 08-05).
