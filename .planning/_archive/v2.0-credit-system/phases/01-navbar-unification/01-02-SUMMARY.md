---
phase: 01-navbar-unification
plan: 02
subsystem: frontend-navigation
tags: [navbar, import-migration, cleanup]
dependency_graph:
  requires: [unified-navbar-component]
  provides: [all-pages-unified-navbar]
  affects: [all-pages]
tech_stack:
  added: []
  patterns: [single-navbar-component]
key_files:
  created: []
  modified:
    - src/components/HomepageRouter.tsx
    - src/pages/HowItWorks.tsx
    - src/pages/Pricing.tsx
    - src/pages/Privacy.tsx
    - src/pages/Refund.tsx
    - src/pages/Questions.tsx
    - src/pages/Terms.tsx
  deleted:
    - src/components/MinimalNavbar.tsx
decisions:
  - Removed Upload Resume and Upgrade buttons from desktop navbar to reduce overcrowding
  - Moved Upgrade Plan option into avatar dropdown for both desktop and mobile
  - Removed Profile/Billing/Sign Out from hamburger menu (already in avatar dropdown)
  - Added whitespace-nowrap to nav links to prevent two-line wrapping
metrics:
  completed: "2026-04-11T09:30:00Z"
---

# Phase 01 Plan 02: Page Import Migration Summary

Migrated all 21 pages to unified Navbar, deleted MinimalNavbar.tsx, and refined desktop/mobile layout based on visual verification feedback.

## What Was Done

### Task 1: Update all 21 page imports and delete MinimalNavbar.tsx

Updated 7 files that imported MinimalNavbar to use the unified Navbar component:
- `src/components/HomepageRouter.tsx` — import + JSX tag
- `src/pages/HowItWorks.tsx` — import + JSX tag
- `src/pages/Pricing.tsx` — import + JSX tag
- `src/pages/Privacy.tsx` — import + JSX tag
- `src/pages/Refund.tsx` — import + JSX tag
- `src/pages/Questions.tsx` — import + JSX tag
- `src/pages/Terms.tsx` — import + JSX tag

Confirmed 14 existing Navbar imports already pointed to the correct path (no changes needed).

Deleted `src/components/MinimalNavbar.tsx` (522 lines removed).

Verified: zero references to `MinimalNavbar` remain in `src/`.

### Task 2: Visual verification and refinements

User verified the navbar visually and reported two issues:
1. Desktop nav links wrapped to two lines due to insufficient space
2. Navbar was overcrowded with too many elements

**Fixes applied:**
- Added `whitespace-nowrap` to desktop nav links to prevent text wrapping
- Reduced link padding from `px-4` to `px-3` and gap from `gap-1` to `gap-0`
- Removed "Upload Resume" button from desktop (redundant with "Resume Analysis" link)
- Removed "Upgrade" button from desktop top bar
- Added "Upgrade Plan" option to both desktop and mobile avatar dropdowns
- Removed Profile/Billing/Sign Out from mobile hamburger menu (already accessible via avatar dropdown)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 5e59e01 | feat(01-02): migrate all MinimalNavbar imports to unified Navbar and delete MinimalNavbar.tsx |
| 2 | 8f196ef | feat: move Profile/Billing/Sign Out options to avatar dropdown in Navbar |

## Deviations from Plan

### Visual feedback changes

**1. [Feedback] Navbar overflow — links wrapping to two lines**
- **Found during:** Visual verification checkpoint
- **Issue:** 6 nav links with `px-4` padding exceeded available horizontal space, causing text to wrap
- **Fix:** Added `whitespace-nowrap`, reduced padding to `px-3`, reduced gap to `gap-0`

**2. [Feedback] Desktop navbar overcrowded**
- **Issue:** Upload Resume button, Upgrade button, admin switcher, credits badge, theme toggle, and avatar all competed for space
- **Fix:** Removed Upload Resume and Upgrade buttons from top bar, moved Upgrade to avatar dropdown

**3. [Feedback] Mobile hamburger redundant with avatar dropdown**
- **Issue:** Profile/Billing/Sign Out appeared in both hamburger menu and avatar dropdown
- **Fix:** Removed from hamburger, kept in avatar dropdown only

## Verification Results

- `npm run build`: PASSED (exit 0)
- `npm run lint`: PASSED (pre-existing warnings only)
- No `MinimalNavbar` references in src/: CONFIRMED
- Human visual verification: APPROVED

## Self-Check: PASSED

- [x] MinimalNavbar.tsx deleted
- [x] All 7 MinimalNavbar imports updated to Navbar
- [x] 14 existing Navbar imports confirmed correct
- [x] No MinimalNavbar references remain in src/
- [x] Build passes
- [x] Visual verification approved by user
