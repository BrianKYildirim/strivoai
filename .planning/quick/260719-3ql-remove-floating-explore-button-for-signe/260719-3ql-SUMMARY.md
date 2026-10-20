---
phase: quick-260719-3ql
plan: 01
status: complete
subsystem: frontend-navigation
tags: [auth-gate, explore-button, ux, tests]
requires:
  - src/components/ExploreFeatures.tsx (existing Supabase session wiring)
provides:
  - Auth-gated floating Explore button (signed-out only)
affects:
  - src/components/ExploreFeatures.tsx
  - src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx
tech-stack:
  added: []
  patterns:
    - "Centralized visibility gate inside component via existing auth state (no per-page conditionals)"
    - "Mutable session variable in vi.mock for per-test auth state"
key-files:
  created: []
  modified:
    - src/components/ExploreFeatures.tsx
    - src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx
decisions:
  - "Signed-out visitors keep the floating Explore button; authenticated users never see it (sidebar/navbar already provides navigation)"
  - "sessionResolved flag prevents a flash of the button while the session is still resolving"
  - "Reused the component's existing getSession + onAuthStateChange wiring — no new auth hook/abstraction"
metrics:
  duration: 6min
  completed: 2026-07-19
---

# Phase quick-260719-3ql Plan 01: Remove Floating Explore Button for Signed-In Users Summary

Made the floating "Explore" button visibility auth-aware and centralized inside `ExploreFeatures`: signed-out visitors keep it, authenticated users never see it, and there is no flash during session resolution.

## What Was Built

**Task 1 — Auth gate in ExploreFeatures.tsx:**
- Added a `sessionResolved` boolean state (initialized `false`), set `true` in BOTH the `getSession().then(...)` and `onAuthStateChange` callbacks (alongside the existing `setUser`).
- Added an early return before the popover JSX: `if (!sessionResolved || user) return null;` — renders nothing while the session resolves (no button flash for users who turn out to be authenticated), then renders the unchanged floating button only when `user` is null.
- Left everything else intact: FEATURES array, Interview Prep flag gate (`isInterviewPrepEnabled` / disabled tile / ComingSoonBadge), Popover, motion animation, styling classes, and `handleFeatureClick`. App.tsx's single mount is untouched — no per-page conditionals.

**Task 2 — Reconciled unit tests:**
- Refactored the `@/lib/supabaseClient` mock to read a mutable module-level `currentSession` (default signed-out) so `getSession()` resolves `{ session: currentSession }`. Removed the now-unused `fakeUser` const.
- The existing Interview Prep flag-gate tests now run under a signed-out session (`currentSession = null` in `beforeEach`), keeping the popover reachable.
- Added a new `describe('ExploreFeatures — auth visibility gate', ...)` block with two tests: button hidden when authenticated (`currentSession = { user: { id: 'u1' } }`, asserted via `waitFor`), and button shown when signed out (`findByRole`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale test] Interview Prep "flag on" navigation target changed to `/auth`**
- **Found during:** Task 2
- **Issue:** The plan preserved the Interview Prep "flag on" test, which asserted `navigate('/interview-prep')`. Because the button now renders only for signed-out visitors, `handleFeatureClick` takes the `else` branch (`navigate('/auth')`), so the original assertion failed.
- **Fix:** Updated the assertion to `navigate('/auth')` with a clarifying comment. Intent is preserved: an enabled Interview Prep tile still navigates (is not a no-op); only the signed-out destination changed. This matches the plan's own note that the `if (user)` branch is now effectively always the else path.
- **Files modified:** src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx
- **Commit:** 68c704ac

## Verification

- `npm run type-check` — clean.
- `npm run lint` — 0 errors (149 pre-existing warnings in unrelated files, out of scope).
- `npm run test -- ExploreFeatures` — 4/4 passing (2 Interview Prep flag-gate + 2 auth visibility-gate).

## Commits

- 72875c6c: feat(quick-260719-3ql): gate floating Explore button on auth state
- 68c704ac: test(quick-260719-3ql): reconcile ExploreFeatures tests for auth gate

## Self-Check: PASSED

- FOUND: src/components/ExploreFeatures.tsx
- FOUND: src/components/__tests__/ExploreFeatures.interviewPrep.test.tsx
- FOUND commit: 72875c6c
- FOUND commit: 68c704ac
