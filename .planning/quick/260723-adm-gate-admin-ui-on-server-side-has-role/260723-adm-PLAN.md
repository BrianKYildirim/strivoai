---
quick_id: 260723-adm
slug: gate-admin-ui-on-server-side-has-role
description: Fix Admin Panel visibility & authorization — gate admin UI on server-side has_role, decouple from tier/email
date: 2026-07-23
---

# Quick Task 260723-adm: Fix Admin Panel visibility & authorization

## Task Boundary

The Admin Panel must only be available to the main `strivolife@gmail.com` admin
account. Upgrading a user to Elite must never grant admin access or show the
Admin badge/button. Admin status must not be derived from membership tier, and
must be stored server-side against the main account's Supabase Auth user ID —
not through a client-side email check alone. All admin UI hidden for non-admins;
admin routes/actions protected server-side so direct URL access is blocked.
Elite access and admin access kept completely separate.

## Findings (verified against the codebase + PROD, not assumed)

The server side was **already correct** and role-based:
- `user_roles` table (enum `app_role`) + `has_role(_user_id, _role)` SECURITY DEFINER RPC.
- `strivolife@gmail.com` seeded as `admin` via `20260304000000_ensure_admin_role.sql`.
- Every admin action gated server-side on `has_role(auth.uid(),'admin')`:
  `get_admin_usage_stats`, `admin_upgrade_user`, `admin_set_user_merits`,
  `admin_set_user_credits`, and the `admin-delete-user` edge function
  (server-side `user_roles` lookup).
- Admin badge/button (Dashboard) and the AdminUsage page gate both call the
  `has_role` RPC. Admin is never derived from tier.

The **single gap**: `src/contexts/AdminTierTestContext.tsx` set `isAdmin` from a
pure client-side email comparison (`user.email === 'strivolife@gmail.com'`).
This drove the "Admin View" tier switcher in `Navbar`/`TopBar` and the admin
feature-access override in `useTierAccess` — i.e. admin UI shown on a client-side
email check alone.

Out of scope (left as-is, benign): backend `_shared/auth.ts` `isAdminEmail`→Elite
maps the admin's *own* account to Elite feature access. It never grants admin
authorization to Elite users; the admin-panel security boundary is `has_role`.

## Tasks

1. **Replace the client-side email check with the server-side `has_role` RPC** in
   `AdminTierTestContext.checkAdminStatus`.
   - files: `src/contexts/AdminTierTestContext.tsx`
   - action: remove `ADMIN_EMAIL` constant + email equality; call
     `supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })`; fail closed
     on no-user / RPC error.
   - verify: `tsc` + `eslint` clean on the file; `npm run build` green.
   - done: `isAdmin` derives solely from `user_roles` via `has_role`; no email/tier
     derivation remains in the frontend.
