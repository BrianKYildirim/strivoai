---
quick_id: 260718-jbd
title: Fix subscription downgrade — "Start Free" redirects home instead of cancelling
status: ready
date: 2026-07-18
---

# Quick Task 260718-jbd: Fix subscription downgrade

## Root Cause

`src/pages/Pricing.tsx:28-31` — the Free-tier CTA handler is:

```ts
if (tier === 'free') {
  navigate('/auth');   // logged-in Elite user → /auth bounces to '/'
  return;
}
```

The "Start free" button was only wired for anonymous visitors (send to sign-up).
For a logged-in Elite subscriber it calls `navigate('/auth')`, which redirects an
already-authenticated user to the homepage. **No downgrade/cancel path exists** —
there is no `cancel-subscription` endpoint and the button never calls one.

The backend is already half-built for this: `stripe-webhook-handler` handles
`customer.subscription.updated` with `cancel_at_period_end === true` →
`pending_downgrade_tier = "free"` (line 702), and `customer.subscription.deleted`
→ `subscription_status = "canceled"` preserving tier until `current_period_end`.
Only the trigger was missing.

## Operator Decisions (locked)

- **Mechanism:** new in-app `cancel-subscription` edge function (confirm dialog →
  success toast → UI refresh). Not the Stripe portal redirect.
- **Timing:** cancel at period end (`cancel_at_period_end = true`). User keeps
  Elite + 150 merits until the billing boundary, then auto-downgrades to Free.
  Matches the existing webhook logic and the "Cancel anytime" copy.

## Tasks

### Task 1 — Backend: `cancel-subscription` edge function
- **Files:** `supabase/functions/cancel-subscription/index.ts` (new),
  `supabase/functions/cancel-subscription/index.test.ts` (new),
  `supabase/config.toml`, `scripts/deploy.ps1`
- **Action:** Model on `create-stripe-portal`. `requireAuth({type:'user'})`,
  look up `profiles.stripe_subscription_id` keyed only by `ctx.userId`. If null →
  `400 no_subscription`. Else `stripe.subscriptions.update(subId,
  {cancel_at_period_end:true})` and return `{ ok:true, current_period_end }`.
  Wrap the Stripe call so failures return CORS-safe `500 cancel_failed`. Register
  in config.toml (`verify_jwt = false`) and deploy.ps1 `$Functions`.
- **Verify:** `deno test` on the new test file passes (auth 401, OPTIONS CORS,
  405, no_subscription 400, happy path, cross-user isolation).
- **Done:** Function cancels at period end; webhook writes `pending_downgrade_tier`.

### Task 2 — Frontend: wire the downgrade flow in Pricing
- **Files:** `src/pages/Pricing.tsx`
- **Action:** In `handleTierCta`, for `tier === 'free'`: check `supabase.auth.getUser()`.
  Anonymous → `navigate('/auth')` (preserved). Authenticated → open an AlertDialog
  confirmation. On confirm, invoke `cancel-subscription`; on `no_subscription`
  treat as already-free (toast + refresh); on success toast the period-end date and
  invalidate the merit-balance query so the UI refreshes; on error show a
  user-visible toast (no silent redirect).
- **Verify:** `npm run lint && npm run type-check`; existing `Pricing.test.tsx` green.
- **Done:** Elite user clicking "Start free" gets a confirmation → cancellation →
  success message, no silent redirect.

## Must-haves
- No code path silently redirects a logged-in subscriber to `/` on downgrade.
- Stripe subscription set to `cancel_at_period_end` (verifiable via webhook write).
- User-visible success + failure feedback.
- New edge function registered in config.toml + deploy.ps1.
