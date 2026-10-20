---
status: blocked
phase: 08-paddle-retirement
source: [08-PADDLE-GATE.md, 08-02-PLAN.md]
updated: 2026-07-09
---

# Phase 8 Paddle Blocker

Gate blocked: fresh two-source evidence is missing.

## Blocking Evidence Gap

The expiration gate does not have:

- fresh production app-state query output from `zjpjapgraoxdukdvpjes`
- fresh authoritative Paddle dashboard/export evidence from the operator

Prior Phase 2 evidence that `PADDLE_WEBHOOK_SECRET` was unset and no in-flight
Paddle subscriptions were observed is useful context, but Phase 8 requires the
prod app-state read to be re-run during execution.

## Safe-Prep Completed

- Created `08-PADDLE-GATE-QUERIES.sql` with SELECT-only, redaction-safe queries.
- Created `08-PADDLE-GATE.md` with the blocked verdict and exact evidence needed.
- Created `08-PADDLE-ROLLBACK.md` with schema, function/config, deploy, and type
  rollback steps.
- Updated current user/admin-facing copy so active surfaces no longer present
  Paddle as the current payment processor.
- Removed unused Paddle ID state reads from `src/pages/Profile.tsx`.

## Destructive Cleanup Not Performed

These live surfaces remain intentionally unchanged until the gate clears:

- `supabase/functions/paddle-webhook/`
- `[functions.paddle-webhook]` in `supabase/config.toml`
- `"paddle-webhook"` in `scripts/deploy.ps1`
- `profiles.paddle_customer_id`
- `profiles.paddle_subscription_id`
- `profiles.paddle_price_id`
- `public.paddle_webhook_events`
- generated Paddle fields in `src/integrations/supabase/types.ts`

## Next Operator Action

Run `.planning/phases/08-paddle-retirement/08-PADDLE-GATE-QUERIES.sql` against
production and provide a redacted Paddle dashboard/export summary. Re-run Phase 8
cleanup only after both sources are available and agree.
