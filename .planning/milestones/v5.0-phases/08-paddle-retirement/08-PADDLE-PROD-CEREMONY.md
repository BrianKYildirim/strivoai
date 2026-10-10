---
status: awaiting-operator
phase: 08-paddle-retirement
source: [08-05-PLAN.md, 08-PADDLE-PROD-MIGRATION.sql]
updated: 2026-07-09
---

# Phase 8 Production Paddle Retirement — Operator Ceremony

Claude has NOT applied anything to production. Per `CLAUDE.md`, production
migrations and Edge Function deploy/removal require your explicit action. This
document is the exact hand-off: everything below has already been proven safe on
preview (`cimjltzovkahkqecpwgi`) — see `08-PADDLE-PREVIEW-MIGRATION-EVIDENCE.md`.

## Before you start

Confirm the target project ref is **`zjpjapgraoxdukdvpjes`** (canonical prod, per
`STATE.md`) before running anything below.

## Step 1 — Apply the production migration

The file `.planning/phases/08-paddle-retirement/08-PADDLE-PROD-MIGRATION.sql`
contains the exact SQL already applied to and proven safe on preview: it drops
`public.paddle_webhook_events` and the three `profiles.paddle_*` columns, and
leaves `subscription_tier`/`subscription_status`/`current_period_end` and all
Stripe structures untouched. Rollback SQL is included as a comment block in the
same file.

Either:

**Option A — Supabase Dashboard SQL Editor**
1. Open the SQL Editor for the `zjpjapgraoxdukdvpjes` project.
2. Paste the contents of `08-PADDLE-PROD-MIGRATION.sql` (the active statements
   only — leave the commented ROLLBACK block as reference, don't run it).
3. Run it.

**Option B — Supabase CLI**
```
supabase link --project-ref zjpjapgraoxdukdvpjes
supabase migration up
```
(This applies `supabase/migrations/20260709000001_retire_paddle_columns_and_table.sql`,
which is byte-identical to `08-PADDLE-PROD-MIGRATION.sql`.)

## Step 2 — Remove the deployed paddle-webhook function

`paddle-webhook` has already been removed from `scripts/deploy.ps1`'s `$Functions`
list and from `supabase/config.toml` (Phase 8 plan 08-04). A normal production
redeploy will not redeploy it — but if it's still live from a prior deploy, it
needs to be explicitly deleted since redeploying doesn't remove already-deployed
functions.

Either:

**Option A — full redeploy (also picks up any other pending changes)**
```
scripts/deploy.ps1 -Env production
```

**Option B — targeted removal only**
```
supabase functions delete paddle-webhook --project-ref zjpjapgraoxdukdvpjes
```

## Step 3 — Confirm back

Reply "prod migration applied" (or describe any deviation/issue) once both the
migration and the function removal/redeploy are done. Claude will then run a
read-only production verification pass and close out `08-VERIFICATION.md`.

## What NOT to do

- Do not run the commented ROLLBACK block in `08-PADDLE-PROD-MIGRATION.sql` unless
  you are intentionally reversing this migration.
- Do not touch `profiles.subscription_tier`, `profiles.subscription_status`,
  `profiles.current_period_end`, or any Stripe-related table/column — none of
  those are part of this migration.
