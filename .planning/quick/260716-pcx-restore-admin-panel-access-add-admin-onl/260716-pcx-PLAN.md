---
id: 260716-pcx
slug: restore-admin-panel-access-add-admin-onl
date: 2026-07-17
---

# Quick Task: Restore admin panel access from the dashboard

Re-add an admin-only entry button to the dashboard that links to the existing
`/admin/usage` panel, so the administrator can once again adjust user merits and
subscription tiers.

## Root cause (investigated before planning)

Commit `1868fb25` ("dashboard overhaul") rewrote the dashboard hero. It replaced
the `<Link to="/admin/usage">` admin button with the "View Latest Resume" CTA.
The `isAdmin` query (`src/pages/Dashboard.tsx:207`) survived the rewrite and is
still passed into `CareerHero`, but it now only renders a decorative `Admin`
badge (`src/pages/Dashboard.tsx:724`). Nothing links to the panel anymore.

## Verified intact (no backend work needed)

- Route `/admin/usage` is still registered — `src/App.tsx:72`.
- `src/pages/AdminUsage.tsx` is intact: merit editing (`admin_set_user_merits`),
  tier changes (`admin_upgrade_user`), upgrade requests, usage breakdown.
- Production DB: `strivolife@gmail.com` holds the `admin` role in `user_roles`.
- Production DB: all six RPCs exist (`has_role`, `get_admin_usage_stats`,
  `get_pending_upgrade_requests`, `admin_upgrade_user`, `admin_set_user_merits`,
  `get_user_usage_breakdown`) and every admin RPC is `SECURITY DEFINER` with an
  internal `has_role` check.

So the fix is UI-only. Do NOT add migrations, RPCs, or edge functions.

## Security note

The button visibility is a UX affordance, not the security boundary. Three
layers already exist and must not be weakened:
1. `Dashboard.tsx` hides the button unless the `has_role` RPC returns true.
2. `AdminUsage.tsx` re-checks `has_role` on mount and redirects non-admins.
3. Every admin RPC enforces `has_role` server-side.

## Task 1: Add admin-only button to the dashboard hero

**File:** `src/pages/Dashboard.tsx`

In the `CareerHero` hero action row (currently `src/pages/Dashboard.tsx:754-767`,
the flex row holding "New Analysis" and "View Latest Resume"), append an
admin-only button guarded by the existing `isAdmin` prop:

```tsx
{isAdmin && (
  <Button size="lg" variant="outline" className="gap-2 rounded-xl bg-background/60" asChild>
    <Link to="/admin/usage">
      <Shield className="h-4 w-4" />
      Admin Panel
    </Link>
  </Button>
)}
```

Constraints:
- `isAdmin` is ALREADY a prop on `CareerHero` — do not re-query or re-plumb it.
- `Shield`, `Button`, and `Link` are already imported in this file — verify
  before adding imports; do not add duplicates.
- Use semantic design tokens, matching the sibling buttons. No hardcoded colors
  (the pre-overhaul button used `text-purple-400`; do not reintroduce that).
- Keep the existing `Admin` badge as-is.
- UI only — no other behavior changes.

**Verification:**
- `npm run lint` and `npm run type-check` pass.
- `npm run test` passes (no dashboard test regressions).
- `npm run build` succeeds.

## Out of scope

- Any change to `AdminUsage.tsx`, routes, RPCs, or migrations.
- Any deploy (operator handles deploys).
