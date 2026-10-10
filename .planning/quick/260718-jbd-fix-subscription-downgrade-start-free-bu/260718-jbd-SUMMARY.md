---
quick_id: 260718-jbd
title: Fix subscription downgrade — "Start Free" redirects home instead of cancelling
status: complete
date: 2026-07-18
---

# Quick Task 260718-jbd — Summary

## Root cause

`src/pages/Pricing.tsx` — the Free-tier CTA handler ran `navigate('/auth')`
unconditionally for `tier === 'free'`. That branch was only ever meant for
anonymous visitors (send them to sign-up). For a logged-in Elite subscriber,
`/auth` redirects an already-authenticated user to the homepage `/` — exactly the
reported "clicking Start free just goes home, nothing cancels" behavior. **No
downgrade/cancel path existed**: there was no `cancel-subscription` endpoint and
the button never invoked one.

The backend was already half-built for this: `stripe-webhook-handler` handles
`customer.subscription.updated` with `cancel_at_period_end === true` →
`pending_downgrade_tier = "free"`, and `customer.subscription.deleted` → status
`canceled` (tier preserved until `current_period_end`). Only the trigger was
missing.

## Changes

**Backend — new `cancel-subscription` edge function** (`supabase/functions/cancel-subscription/index.ts`)
- `requireAuth({type:'user'})`; looks up `profiles.stripe_subscription_id` keyed
  only by `ctx.userId` (cross-user cancellation structurally impossible).
- `null` subscription → `400 no_subscription`; otherwise
  `stripe.subscriptions.update(subId, { cancel_at_period_end: true })` and returns
  `{ ok: true, current_period_end }`.
- Stripe/DB errors return CORS-safe JSON (`cancel_failed` / `profile_lookup_failed`).
- Deliberately defers tier/merit DB writes to the existing webhook (single source
  of truth — mirrors the create-checkout-session swap branch).
- Registered in `supabase/config.toml` (`verify_jwt = false`) and
  `scripts/deploy.ps1` `$Functions`.
- 6 Deno unit tests (`index.test.ts`): 401, OPTIONS/CORS, 405, no_subscription,
  happy path (asserts `cancel_at_period_end: true`), cross-user isolation.

**Frontend — downgrade flow** (`src/pages/Pricing.tsx`)
- `handleTierCta` free branch now checks `supabase.auth.getUser()`: anonymous →
  `navigate('/auth')` (preserved); authenticated → opens an AlertDialog
  confirmation ("Downgrade to Free?" — keeps Elite until period end).
- On confirm: invokes `cancel-subscription`; `no_subscription` treated as benign
  "already free"; success shows a toast with the period-end date and invalidates
  the merit-balance query; any failure shows a user-visible `toast.error` (no
  silent redirect).
- Updated `Pricing.test.tsx`: split the old regression into anonymous (→ /auth)
  vs. logged-in (→ confirmation dialog) and added confirm-success + failure tests.

## Behavior after fix

Elite user clicks "Start free" → confirmation dialog → subscription set to cancel
at period end → success toast ("Elite stays active until <date>, then your account
moves to Free"). Stripe fires `customer.subscription.updated`, webhook writes
`pending_downgrade_tier = "free"`; access + merits persist until the billing
boundary, then `customer.subscription.deleted` returns the account to Free.

## Verification

- `deno test supabase/functions/cancel-subscription/index.test.ts` — 6/6 pass.
- `npm run lint` (Pricing.tsx, Pricing.test.tsx, cancel-subscription) — clean.
- `npm run type-check` (tsc -p tsconfig.app.json) — clean.
- `vitest run src/pages/Pricing.test.tsx` — 15/15 pass.
- Runtime click-through (real Stripe cancel end-to-end) pending deploy to staging.

## Notes / follow-ups

- The webhook already writes `pending_downgrade_tier`, but no consumer flips
  `subscription_tier` → `free` at `customer.subscription.deleted` (D-14 preserves
  tier and relies on `current_period_end` for access enforcement). Whether the
  Pricing card should surface a "cancellation scheduled" badge (reading
  `pending_downgrade_tier`) is a possible UX enhancement, intentionally out of
  scope for this fix.
- Needs `supabase functions deploy cancel-subscription` (staging → prod) before
  the flow is live; the function is wired into deploy.ps1.
