---
quick_id: 260723-adm
slug: gate-admin-ui-on-server-side-has-role
status: complete
date: 2026-07-23
commit: c83d6777
---

# Quick Task 260723-adm — Summary

## What changed

`src/contexts/AdminTierTestContext.tsx` — replaced the pure client-side email
check (`user.email === 'strivolife@gmail.com'`) that determined `isAdmin` with a
call to the server-authoritative `has_role('admin')` SECURITY DEFINER RPC. The
`ADMIN_EMAIL` constant was removed. `isAdmin` now derives solely from the
`user_roles` table (seeded against the main account's Supabase Auth user ID) and
fails closed on no-user / RPC error. All downstream admin UI (the "Admin View"
tier switcher in `Navbar`/`TopBar` and the admin feature-access override in
`useTierAccess`) is now server-gated by the same source of truth the AdminUsage
page, Dashboard admin badge, and every admin RPC already use.

Single-file change (15 insertions, 3 deletions). Commit `c83d6777`.

## Why this was the whole fix

The server side was already correct and role-based (not tier-based, not
email-based): `has_role` RPC + `user_roles` table gate `get_admin_usage_stats`,
`admin_upgrade_user`, `admin_set_user_merits`, `admin_set_user_credits`, and the
`admin-delete-user` edge function. Direct URL access to `/admin/usage` is already
neutralized because the data comes only from `has_role`-gated RPCs. The lone
client-side email check driving admin *UI visibility* was the only requirement
violation.

## Requirement coverage

- Admin Panel available only to `strivolife@gmail.com` — ✅ (has_role source of truth everywhere).
- Elite upgrade never grants admin / shows badge or button — ✅ (admin decoupled from tier; switcher now role-gated).
- Admin status not derived from membership tier — ✅ (was never; frontend email path removed).
- Stored server-side against main account's Auth user ID, not client email alone — ✅ (`user_roles` + `has_role`).
- Admin UI hidden for non-admins; routes/actions server-authorized against direct URL — ✅ (RPCs + edge fn gated).
- Elite and admin kept completely separate — ✅.

## Verification

**Static (done):** `tsc -p tsconfig.app.json` clean; `eslint` on the file clean
(one pre-existing `checkAdminStatus`-before-declared warning, not introduced by
this change); `npm run build` green.

**Server-side data invariant (done, PROD read-only):**
- Exactly one admin role holder: `strivolife@gmail.com`.
- 6 Elite users → only 1 holds admin (the main account itself); 19 Free → 0 admin.
- Admin role is fully decoupled from tier in live data.

**Live two-account click-through (operator, pending frontend deploy):** Vercel
Git link is disconnected — the frontend must be built/deployed by hand before UI
verification. Then:
1. Sign in as `strivolife@gmail.com` → Admin badge + "Admin Panel" button + "Admin View" tier switcher visible; `/admin/usage` loads.
2. Sign in as an upgraded **Elite** test account → NO admin badge, NO Admin Panel button, NO tier switcher; navigating directly to `/admin/usage` is denied (redirect + all admin RPCs return 403).
