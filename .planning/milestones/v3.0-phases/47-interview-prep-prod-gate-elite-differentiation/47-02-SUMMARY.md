---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: "02"
subsystem: frontend-routing
tags:
  - phase-47
  - interview-prep
  - production-gate
  - routing
  - feature-flag
  - tdd
requirements:
  - IPC-PROD-ROUTE
dependency_graph:
  requires:
    - "src/config/feature-flags.ts (Plan 47-00 — isInterviewPrepEnabled helper)"
    - "src/pages/ComingSoon.tsx (Plan 47-01 — full-page fallback)"
    - "src/pages/InterviewPrep.tsx (existing — untouched)"
    - "src/components/ProtectedRoute.tsx, src/components/DashboardLayout.tsx (existing wrappers)"
  provides:
    - "/interview-prep route conditionally renders ComingSoon (flag off) vs InterviewPrep (flag on)"
    - "Route-level vitest covering both flag branches + unset state"
  affects:
    - 47-03-PLAN.md
    - 47-04-PLAN.md
    - 47-05-PLAN.md
tech_stack:
  added: []
  patterns:
    - "Inline ternary inside Route element keeps auth+chrome wrappers identical across both branches"
    - "Route-level vitest fixture mirrors App.tsx branching expression instead of importing full App tree"
    - "vi.stubEnv / vi.unstubAllEnvs for per-test env isolation"
key_files:
  created:
    - "src/__tests__/App.routes.interviewPrep.test.tsx"
  modified:
    - "src/App.tsx"
decisions:
  - "Use relative-path import style (./config/feature-flags) to match adjacent ./pages/* imports"
  - "Inline ternary inside Route element instead of module-level constant — matches the existing terse JSX style"
  - "Route-level test uses a mirror fixture, not import App — App's provider tree would dwarf the unit under test"
  - "Mock ProtectedRoute, DashboardLayout, and InterviewPrep so the test exercises only the branching logic"
metrics:
  duration_minutes: 6
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  tests_added: 3
---

# Phase 47 Plan 02: Wire /interview-prep route gate Summary

Wired `isInterviewPrepEnabled()` into the `/interview-prep` route so production users see the `<ComingSoon />` page while staging/preview continues to render the real `<InterviewPrep />` page byte-identical to today — auth wrapper and dashboard chrome untouched in both branches, locked by a 3-case route-level vitest.

## One-liner

Single-line ternary inside the existing `/interview-prep` Route element (`{isInterviewPrepEnabled() ? <InterviewPrep /> : <ComingSoon />}`) plus a 3-case route-gate vitest that mocks the auth and layout wrappers and the real page to isolate the branching contract.

## Completed Tasks

| Task | Name                                              | Commit    | Files                                                  |
| ---- | ------------------------------------------------- | --------- | ------------------------------------------------------ |
| 1    | Wire conditional /interview-prep route in App.tsx | `bbc9a0e` | `src/App.tsx`                                          |
| 2    | Route-level tests for both flag states            | `ef40893` | `src/__tests__/App.routes.interviewPrep.test.tsx`      |

## Exact Route Element Committed to App.tsx

```tsx
{/* Phase 47 — Interview Prep production gate (D-01, D-07, D-08).
    Flag off (Production scope) → <ComingSoon />; flag on (Preview scope) → real page. */}
<Route path="/interview-prep" element={<ProtectedRoute><DashboardLayout>{isInterviewPrepEnabled() ? <InterviewPrep /> : <ComingSoon />}</DashboardLayout></ProtectedRoute>} />
```

Imports added (adjacent to existing same-style imports):

```tsx
import ComingSoon from "./pages/ComingSoon";
import { isInterviewPrepEnabled } from "./config/feature-flags";
```

The `import InterviewPrep from "./pages/InterviewPrep";` line at App.tsx:31 is unchanged. The route path stays `/interview-prep`. `<ProtectedRoute>` and `<DashboardLayout>` wrappers are byte-identical to the prior shape. Only the innermost rendered page component switches.

## Test Coverage (3 cases)

| # | Env state                                       | Asserts                                                                                                  |
| - | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1 | `VITE_FEATURE_INTERVIEW_PREP` unset (`undefined`) | h1 matches `/coming soon/i`; `real-ip-page` testid absent                                              |
| 2 | `VITE_FEATURE_INTERVIEW_PREP === 'false'`        | h1 matches `/coming soon/i`; `real-ip-page` testid absent                                               |
| 3 | `VITE_FEATURE_INTERVIEW_PREP === 'true'`         | `real-ip-page` testid present; no "coming soon" h1                                                       |

The test file mocks `@/components/ProtectedRoute`, `@/components/DashboardLayout`, and `@/pages/InterviewPrep` to bypass auth/Supabase and the real IPC dependency tree. The fixture mirrors the `App.tsx` ternary character-for-character — if a future edit drifts the branching expression in App.tsx, this test fails.

## Verification Results

| Gate                                                                                                | Result                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `npx eslint src/App.tsx`                                                                            | Pass (clean)                        |
| `npx eslint src/__tests__/App.routes.interviewPrep.test.tsx`                                        | Pass (clean)                        |
| `npx tsc --noEmit -p tsconfig.app.json` filtered to `src/App.tsx`                                   | Pass (zero errors in App.tsx)       |
| `npx vitest run src/__tests__/App.routes.interviewPrep.test.tsx`                                    | **3/3 passing**                     |
| Combined `vitest run` of route + ComingSoon + feature-flags tests                                   | **17/17 passing**                   |
| `git log -1 --stat src/pages/InterviewPrep.tsx` (most recent touch is commit `4dc15db`, Apr 2026)   | Confirms InterviewPrep.tsx untouched |

## Files Created / Modified

### Created

* `src/__tests__/App.routes.interviewPrep.test.tsx` — 71-line vitest covering three env states. Mocks ProtectedRoute / DashboardLayout / InterviewPrep so the test runs without auth providers or the real IPC dependency tree.

### Modified

* `src/App.tsx` — 5 inserts, 1 delete: added `ComingSoon` import (line 32), added `isInterviewPrepEnabled` import (line 45), expanded the `/interview-prep` Route element (lines 76-78) to a conditional ternary inside the existing `<ProtectedRoute><DashboardLayout>` wrapper.

### Untouched (verified)

* `src/pages/InterviewPrep.tsx` — last modified 2026-04-28 in commit `4dc15db8` ("By/env fixes #426"), well before Phase 47. Not modified by this plan.
* `src/config/feature-flags.ts` — Plan 47-00 artifact, consumed read-only.
* `src/pages/ComingSoon.tsx` — Plan 47-01 artifact, consumed read-only.
* `src/components/ProtectedRoute.tsx`, `src/components/DashboardLayout.tsx` — unchanged.

## Decisions Made

1. **Inline ternary, not module-level constant.** The plan offered both; inline matches the existing terse JSX style throughout App.tsx and keeps the branching shape visible at the route definition rather than buried elsewhere in the module.
2. **Relative-path imports for both new symbols** (`./pages/ComingSoon`, `./config/feature-flags`) — matches every adjacent page/config import in App.tsx (which uses `./pages/*` consistently for all the route components above).
3. **Test fixture mirrors instead of imports App.** Importing `App` directly would force the test to satisfy `QueryClient`, `HelmetProvider`, `BrowserRouter`, and the Supabase-backed `ProtectedRoute` — none of which are the unit under test. The mirror fixture isolates the branching expression and uses identical syntax so a future drift in App.tsx fails this test.
4. **Mock the real `InterviewPrep` page in the test.** Even though the test isolates routing, mounting the real IPC page would pull in `useResumeStream`, Supabase auth context, and PDF.js — slow and noisy. A stub `<div data-testid="real-ip-page">` is sufficient to prove the flag-on branch lands on the right component.

## Deviations from Plan

None. Plan 47-02 executed exactly as specified.

## Authentication Gates

None — no auth surface touched. The route still passes through `<ProtectedRoute>` unchanged; unauthenticated users continue to redirect to `/auth` regardless of flag state.

## Out of Scope (Confirmed Honored)

* `src/pages/InterviewPrep.tsx` not deleted, not moved, not modified (D-13 / CONTEXT line 151).
* `<ProtectedRoute>` and `<DashboardLayout>` untouched.
* No Navbar / AppSidebar / ExploreFeatures changes — plan 47-03.
* No Pricing surface changes — plan 47-04.
* No AnalysisHistory filtering — plan 47-05.
* No Vercel env-var configuration — plan 47-06.
* No backend / edge-function changes (D-13).

## Known Stubs

None. The route gate is fully wired: the ternary reads from the actual `isInterviewPrepEnabled()` helper, and both branches render real components (`ComingSoon` from Plan 47-01, `InterviewPrep` existing).

## Rollback

Trivial: revert commits `ef40893` and `bbc9a0e` (or only `bbc9a0e` to keep the test as a future regression net). The route was made conditional, not removed — rollback restores production behavior to "feature visible to all users."

## Next Phase Readiness

* Wave 3 plans (47-03 / 47-04 / 47-05) can now gate their respective surfaces (Navbar, Sidebar, ExploreFeatures, PricingTable, TierCardV2, AnalysisHistory) against `isInterviewPrepEnabled()` knowing the route itself is already gated.
* Plan 47-06 (Vercel env-var setup + ROADMAP update) consumes this commit indirectly: once the Vercel scopes are configured, the production deploy will pick up the `<ComingSoon />` branch with no further code change.
* No blockers.

## Self-Check: PASSED

* FOUND: `src/App.tsx` (modified, 5 insertions / 1 deletion in commit `bbc9a0e`)
* FOUND: `src/__tests__/App.routes.interviewPrep.test.tsx` (new file in commit `ef40893`)
* FOUND: commit `bbc9a0e` (Task 1 — App.tsx route gating)
* FOUND: commit `ef40893` (Task 2 — route-gate vitest)
* Verified: `src/pages/InterviewPrep.tsx` last touched in commit `4dc15db8` (2026-04-28), untouched by this plan
* Verified: `npx vitest run src/__tests__/App.routes.interviewPrep.test.tsx` → 3/3 pass after final state
* Verified: `npx eslint src/App.tsx src/__tests__/App.routes.interviewPrep.test.tsx` → clean after final state
* Verified: `npx tsc --noEmit -p tsconfig.app.json` filtered to App.tsx → zero errors

---
*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Plan: 02*
*Completed: 2026-05-11*
