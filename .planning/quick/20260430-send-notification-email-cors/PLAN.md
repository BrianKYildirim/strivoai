---
slug: send-notification-email-cors
status: in-progress
created: 2026-04-30
---

# Fix CORS on send-notification-email

## Bug
Browser call to `send-notification-email` fails preflight: `No 'Access-Control-Allow-Origin' header`. Triggered when admin updates a user's tier in the dashboard.

## Root cause
`supabase/functions/send-notification-email/index.ts` uses:
- `handleOptionsRequest({ type: 'internal' })` → returns `{}` (no CORS headers)
- `requireAuth(req, { type: 'internal' })` → requires `x-internal-job-secret` header

But the function is invoked from the browser via `supabase.functions.invoke()` at three sites:
- `src/pages/AdminUsage.tsx:122` (tier change → `user_pro_granted` / `user_elite_granted`)
- `src/pages/Auth.tsx:206` (`user_welcome`)
- `src/pages/Auth.tsx:214` (`admin_new_signup`)

None of these are internal job-worker calls. The function was misconfigured at creation.

## Fix
Convert to `type: 'user'`:
1. `handleOptionsRequest({ type: 'user' })` for the OPTIONS branch.
2. `requireAuth(req, { type: 'user' })` for JWT validation.
3. Spread `corsHeaders({ type: 'user' })` into every response (success + error).

Pattern matches `admin-delete-user/index.ts` and `notify-upgrade-request/index.ts`.

## Out of scope
- No frontend changes; call sites already pass user JWT via `supabase.functions.invoke`.
- Profile-on-signup trigger already exists (`handle_new_user`), so `requireUserAuth`'s profile lookup will succeed for the welcome-email path.

## Deploy
User will deploy via `.\scripts\deploy-staging.ps1` / `.\scripts\deploy-production.ps1`.
