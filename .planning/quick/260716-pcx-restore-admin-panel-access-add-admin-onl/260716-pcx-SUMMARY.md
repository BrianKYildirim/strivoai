---
id: 260716-pcx
slug: restore-admin-panel-access-add-admin-onl
date: 2026-07-17
status: complete
commit: 30284c7b
---

# Summary: Restore admin panel access from the dashboard

## Outcome

The admin panel was never broken — only its entry point was. Re-added an
`isAdmin`-guarded "Admin Panel" button to the dashboard hero action row linking
to the existing `/admin/usage` panel.

## Root cause

Commit `1868fb25` ("dashboard overhaul", 2026-06-07) rewrote the `CareerHero`
action row and replaced the `<Link to="/admin/usage">` admin button with the
"View Latest Resume" CTA. The `isAdmin` query (`Dashboard.tsx:207`) survived the
rewrite and still fed `CareerHero`, but only rendered a decorative `Admin` badge.
No link to the panel remained.

## Verified intact before planning (no backend work required)

- Route `/admin/usage` still registered — `src/App.tsx:72`.
- `src/pages/AdminUsage.tsx` intact: merit editing, tier changes, upgrade
  requests, per-user usage breakdown, user removal.
- Production DB: `strivolife@gmail.com` holds the `admin` role in `user_roles`.
- Production DB: all six RPCs exist — `has_role`, `get_admin_usage_stats`,
  `get_pending_upgrade_requests`, `admin_upgrade_user`, `admin_set_user_merits`,
  `get_user_usage_breakdown` — and every admin RPC is `SECURITY DEFINER` with an
  internal `has_role` check.

## Change

One file, UI only — `src/pages/Dashboard.tsx` (+8 lines at the hero action row).
Reuses the existing `isAdmin` prop; `Shield`/`Button`/`Link` were already
imported. Semantic tokens matching the sibling outline button; the pre-overhaul
`text-purple-400` was not reintroduced. Existing `Admin` badge left as-is.

## Security posture

Button visibility is a UX affordance, not the boundary. Three layers enforce
admin-only access and none were weakened:
1. Dashboard hides the button unless the `has_role` RPC returns true.
2. `AdminUsage.tsx` re-checks `has_role` on mount and redirects non-admins.
3. Every admin RPC enforces `has_role` server-side as `SECURITY DEFINER`.

## Verification

| Gate | Result |
|---|---|
| `npm run lint` | PASS — 0 errors, 159 warnings (pre-existing baseline) |
| `npm run type-check` | PASS |
| `npm run test` | PASS — 98 files, 659 tests, 0 failures |
| `npm run build` | PASS |

## Operator follow-up

Not deployed. Deploy the frontend, then confirm the button renders for
`strivolife@gmail.com` and that `/admin/usage` loads with merit/tier controls
working. Confirm a non-admin account does not see the button.
