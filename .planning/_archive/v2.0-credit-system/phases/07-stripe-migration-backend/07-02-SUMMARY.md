---
phase: 07-stripe-migration-backend
plan: 02
subsystem: database
tags: [stripe, billing, migration, rls, postgres]

requires:
  - phase: 07-stripe-migration-backend
    provides: CONTEXT D-04 (additive-only), D-06 (idempotency table), D-07 (fallback indexes)
provides:
  - Additive profile columns (stripe_customer_id, stripe_subscription_id, stripe_price_id)
  - public.stripe_webhook_events idempotency table (PK event_id, RLS enabled, zero permissive policies)
  - Partial indexes on profiles for stripe_customer_id and stripe_subscription_id (webhook fallback chain)
affects: [07-03-stripe-webhook, 07-04-create-checkout-session, 07-05-create-stripe-portal]

tech-stack:
  added: []
  patterns:
    - "Additive migration only (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS) — no drops or renames"
    - "RLS-enabled tables with zero permissive policies; service role bypasses RLS for edge-function writes"

key-files:
  created:
    - supabase/migrations/20260412000000_stripe_migration.sql
  modified:
    - supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql

key-decisions:
  - "STR-07 closed by leaving stripe_webhook_events with ENABLE RLS and no CREATE POLICY — service role bypasses RLS for writes"
  - "Retrofitted IF NOT EXISTS onto the Phase 4 linkedin_grades index migration so the batch push could reach the Stripe migration"

patterns-established:
  - "All CREATE INDEX statements in new migrations use IF NOT EXISTS to keep pushes idempotent across partial-apply states"

requirements-completed: [STR-06, STR-07]

duration: ~10min
completed: 2026-04-13
---

# Phase 07-02: Additive Stripe Migration Summary

**Additive Stripe schema pushed to live DB: three stripe_* columns on profiles, stripe_webhook_events idempotency table with RLS enabled and zero permissive policies, plus partial indexes for the webhook fallback lookup chain.**

## Performance

- **Duration:** ~10 min (file authored previously, push executed this session)
- **Completed:** 2026-04-13
- **Tasks:** 2
- **Files:** 1 migration created, 1 adjacent migration patched for idempotency

## Accomplishments
- `public.profiles` now has `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` (all `text`, all additive)
- `public.stripe_webhook_events(event_id text PRIMARY KEY, event_type text, payload jsonb, created_at timestamptz)` created with `ENABLE ROW LEVEL SECURITY` and **no** CREATE POLICY statements — service role bypasses RLS, anon/authenticated roles have zero access
- Partial indexes `idx_profiles_stripe_customer_id` and `idx_profiles_stripe_subscription_id` created for the webhook lookup fallback chain (D-07)
- Analytics index `idx_stripe_webhook_events_created_at` created
- Fixed blocker: added `IF NOT EXISTS` to two `CREATE INDEX` statements in `20260411_linkedin_grades_drop_unique_identifier.sql` (the index already existed remotely, blocking the batch push)
- `supabase db push` completed successfully against the linked project
- Paddle columns on `profiles` untouched (additive-only sanity holds)

## Task Commits

1. **Task 1: Migration SQL file** — `7352a1b` (feat: additive Stripe migration) — committed in prior session
2. **Task 2: Push to live DB + idempotency fix for linkedin_grades migration** — this session

## Files Created/Modified
- `supabase/migrations/20260412000000_stripe_migration.sql` — Stripe additive migration (STR-06, STR-07)
- `supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql` — Patched `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS` so the batch push could continue past the pre-existing linkedin_grades indexes on remote

## Decisions Made
- **Idempotency retrofit on an out-of-phase migration:** The Phase 4 linkedin_grades migration had bare `CREATE INDEX` statements for indexes that already existed remotely (likely from a prior partial apply). Rather than delete the indexes remotely or skip the migration, the lowest-risk fix was to add `IF NOT EXISTS`. This is compatible with any DB state and unblocked the Stripe push without touching remote data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: Blocking] Fixed non-idempotent CREATE INDEX in adjacent migration**
- **Found during:** Task 2 (`supabase db push`)
- **Issue:** `20260411_linkedin_grades_drop_unique_identifier.sql` used bare `CREATE INDEX`, and the target indexes already existed on remote — push failed with SQLSTATE 42P07 before reaching `20260412000000_stripe_migration.sql`
- **Fix:** Added `IF NOT EXISTS` to both `CREATE INDEX` statements in that migration
- **Files modified:** `supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql`
- **Verification:** Re-ran `supabase db push`; both migrations now apply cleanly (NOTICE 42P07 "already exists, skipping" for both indexes, then Stripe migration applies)
- **Committed in:** pending user commit

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Strictly unblocking. No scope creep — the fix touched only one migration file and preserved original intent (add composite indexes) under any remote state.

## Issues Encountered
- First push attempt failed on `idx_linkedin_grades_user_profile` already existing. Fixed via the auto-fix above on the adjacent migration and pushed successfully on the retry.

## User Setup Required
None in this plan. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_*` env vars will be added as part of the Plan 07-06 deploy runbook.

## Next Phase Readiness
- Wave 2 (plans 07-03, 07-04, 07-05) is now fully unblocked — the schema they write to exists on live DB.
- Idempotency table is ready for the webhook handler's `INSERT` + `ON CONFLICT DO NOTHING` exactly-once pattern.

---
*Phase: 07-stripe-migration-backend*
*Completed: 2026-04-13*
