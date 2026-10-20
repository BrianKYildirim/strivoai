---
status: complete
quick_id: 260416-omv
date: "2026-04-17"
commits:
  - hash: 6168e3d
    message: "feat(quick-260416-omv): create AppSidebar, TopBar, and DashboardLayout components"
  - hash: 01eb819
    message: "feat: integrate DashboardLayout into App.tsx and remove per-page Navbar imports"
  - hash: 27f746d
    message: "fix: remove old Navbar from protected pages to prevent overlap with TopBar"
---

# Quick Task 260416-omv: Replace top navbar with fixed vertical sidebar navigation

## What Changed

Replaced the horizontal top navbar with a fixed vertical sidebar for all signed-in (dashboard) pages. Public pages retain the original top navbar.

### New Components

- **AppSidebar** (`src/components/AppSidebar.tsx`): Fixed 72px collapsed icon rail on the left edge, expanding to 220px with labels on toggle. Features cubic-bezier easing animation (300ms), hamburger/X toggle with rotation transitions, tooltips on hover when collapsed (delayDuration=0, side="right"), backdrop overlay when expanded, and inverted active state styling (bg-foreground text-background shadow-lg).

- **TopBar** (`src/components/TopBar.tsx`): Slim top bar with Strivo logo (left), admin tier switcher, AI credits badge, theme toggle, and user avatar dropdown (right). Replicates all auth/profile functionality from the old Navbar.

- **DashboardLayout** (`src/components/DashboardLayout.tsx`): Wrapper component composing AppSidebar + TopBar + content area with pl-[72px] offset.

### Integration

- All protected routes in `App.tsx` wrapped with `<DashboardLayout>`
- `HomepageRouter` signed-in branch uses DashboardLayout; signed-out branch keeps Navbar
- 16 protected page files updated: removed `<Navbar />` imports/usages, removed outer `min-h-screen bg-background` wrappers, changed `pt-24` to `pt-6`/`pt-8`

### Navigation Items

| Label | Route | Icon |
|-------|-------|------|
| Home | /dashboard | LayoutGrid |
| Resume Analysis | /upload | Upload |
| Career Compass | /career-compass | Compass |
| LinkedIn Grader | /linkedin-grader | Linkedin |
| Interview Prep | /interview-prep | GraduationCap |
| Recruiting Lens | /recruiting-lens | Eye |
| Celebrations | (disabled) | PartyPopper |
| History | /history | History |
| Settings | /profile | Settings |

## Verification

- User visually verified sidebar behavior, toggle animation, tooltips, active states, content offset, and public page preservation
- Fixed overlay issue where 6 pages still rendered old Navbar (commit 27f746d)
