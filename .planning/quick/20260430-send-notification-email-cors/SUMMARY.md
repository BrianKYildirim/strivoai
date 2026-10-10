---
slug: send-notification-email-cors
status: complete
created: 2026-04-30
completed: 2026-04-30
---

# Summary

Switched `send-notification-email` from `internal` to `user` CORS + auth so the browser-invoked admin tier-change flow stops failing preflight.

## Changes
- `supabase/functions/send-notification-email/index.ts`
  - Imported `corsHeaders` from `_shared/cors.ts`.
  - `handleOptionsRequest({ type: 'user' })` for OPTIONS.
  - `requireAuth(req, { type: 'user' })` for JWT validation.
  - Spread `corsHeaders({ type: 'user' })` into all success and error responses (including the 401 thrown as a Response by `requireAuth`).

## Verification
- Pattern matches existing user-facing functions: `admin-delete-user/index.ts`, `notify-upgrade-request/index.ts`.
- Three call sites all originate from the browser with a user JWT:
  - `src/pages/AdminUsage.tsx:122` (admin tier change)
  - `src/pages/Auth.tsx:206` (welcome email)
  - `src/pages/Auth.tsx:214` (admin signup notification)
- `handle_new_user` trigger creates the `profiles` row at signup, so `requireUserAuth`'s profile lookup succeeds for the welcome-email path.

## Deploy
Run `.\scripts\deploy-staging.ps1` (then production) to push the function.
