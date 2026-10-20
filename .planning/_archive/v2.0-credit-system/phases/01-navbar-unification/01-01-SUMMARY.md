---
phase: 01-navbar-unification
plan: 01
subsystem: frontend-navigation
tags: [navbar, responsive, dark-mode, admin, credits]
dependency_graph:
  requires: []
  provides: [unified-navbar-component]
  affects: [all-pages-using-navbar]
tech_stack:
  added: []
  patterns: [underline-active-indicator, lg-breakpoint-hamburger, scroll-aware-glass-blur]
key_files:
  created: []
  modified:
    - src/components/Navbar.tsx
decisions:
  - Kept MinimalNavbar.tsx auth state pattern as foundation instead of old Navbar.tsx pattern
  - Added mobile avatar dropdown for logged-in users since mobile Upload button was removed
  - Used same dropdown menu for both desktop and mobile avatar to maintain consistency
metrics:
  duration_seconds: 231
  completed: "2026-04-11T08:58:02Z"
---

# Phase 01 Plan 01: Unified Navbar Component Summary

Unified Navbar.tsx merging MinimalNavbar scroll-aware glass blur with old Navbar admin tier switcher and credits badge, serving 6 authenticated links with underline active indicator at lg breakpoint.

## What Was Done

### Task 1: Create unified Navbar.tsx component

Overwrote `src/components/Navbar.tsx` with a new unified component built on the MinimalNavbar.tsx foundation. The component merges functionality from both the old Navbar.tsx (admin tier switcher, credits depleted badge) and MinimalNavbar.tsx (scroll-aware styling, hamburger menu, avatar dropdown, responsive layout).

**Key changes from MinimalNavbar.tsx base:**
- Renamed export from `MinimalNavbar` to `Navbar`
- Added `useAiCredits` and `useAdminTierTest` hooks
- Updated authedPrimaryLinks to include all 6 links (Dashboard, Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach)
- Added mobile nav meta entries for `/upload`, `/interview-prep-coach`, and `/questions`
- Changed logo link from conditional `to={user ? "/dashboard" : "/"}` to always `to="/"`
- Changed all breakpoints from `md:` to `lg:` (1024px hamburger breakpoint)
- Replaced pill active state with underline indicator (`border-b-2 border-primary text-primary`)
- Changed mobile active state from `bg-primary/10 text-primary` to just `text-primary`
- Updated hamburger aria-label to full "Open/Close navigation menu"
- Removed mobile-only Upload button
- Added mobile avatar dropdown for logged-in users
- Ported admin tier switcher with violet styling (desktop only)
- Ported AI Credits Depleted badge with tooltip (desktop only)

**Component exports:** `Navbar` (named export)
**Line count:** 643 lines

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | cb12a17 | feat(01-01): create unified Navbar.tsx component |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added mobile avatar dropdown**
- **Found during:** Task 1
- **Issue:** Removing the mobile Upload button left logged-in mobile users without any visible account access in the header bar. The plan specified "Logo + ThemeToggle + Avatar + Hamburger" for mobile but the MinimalNavbar base did not have a mobile avatar.
- **Fix:** Added a separate mobile-only (`lg:hidden`) DropdownMenu with avatar that mirrors the desktop dropdown (Profile, Billing, Sign Out).
- **Files modified:** src/components/Navbar.tsx
- **Commit:** cb12a17

## Verification Results

- `npm run build`: PASSED (exit 0)
- `npm run lint`: Pre-existing `no-explicit-any` error on user state (same as MinimalNavbar.tsx, not introduced by this change)
- No `md:hidden` in Navbar.tsx: CONFIRMED (0 occurrences)
- No `style={{` in Navbar.tsx: CONFIRMED (0 occurrences)
- `export const Navbar`: CONFIRMED
- `border-b-2` + `border-primary text-primary`: CONFIRMED
- `z-[100]` on SelectContent: CONFIRMED
- `isAdmin` conditional rendering: CONFIRMED
- `creditsAvailable` conditional rendering: CONFIRMED

## Self-Check: PASSED

- [x] src/components/Navbar.tsx exists and contains `export const Navbar`
- [x] Commit cb12a17 exists in git log
- [x] All acceptance criteria verified via grep
- [x] Build passes
