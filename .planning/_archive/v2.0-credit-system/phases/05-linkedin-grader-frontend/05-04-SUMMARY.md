---
phase: 05-linkedin-grader-frontend
plan: 04
subsystem: linkedin-grader
tags: [linkedin-grader, frontend, legacy-cache, entitlement, ux]
requires: [05-01, 05-02, 05-03]
provides: [legacy-cache-rejection, entitlement-state, entitlement-helper-text]
affects: [src/pages/LinkedInGrader.tsx]
tech-stack:
  added: []
  patterns: [type-guard, graceful-degrade, aria-live-polite, combined-query]
key-files:
  created: []
  modified:
    - src/pages/LinkedInGrader.tsx
decisions:
  - "AiCreditsContext exposes no remaining-count field — parenthetical ({N} remaining) is omitted per plan guidance"
  - "Free-tier users skip the entitlement query entirely (ProFeatureGate blocks the page per D-13)"
  - "On any RPC/query error, entitlementState degrades to 'will-use-credit' — the safer default"
metrics:
  duration: ~15min
  completed: 2026-04-12
---

# Phase 05 Plan 04: Legacy Cache Rejection + Entitlement UI Summary

Added D-03 (legacy cache type guard) and D-10/D-11 (entitlement state machine + helper text under the Analyze button) to `src/pages/LinkedInGrader.tsx`. Combined the billing-cycle RPC and `linkedin_grades` cycle query into a single round-trip so the mount effect performs one query instead of two.

## What Changed

### Task 1 — Legacy cache detector + combined cycle query

- Added `EntitlementState = 'loading' | 'free-available' | 'will-use-credit' | 'error'` type and `entitlementState` state (initial `'loading'`).
- Added module-local `isV3Grade(grading_data)` type guard that returns `true` only when `rawScore` is a number and `sectionBreakdown` is an array. Any legacy shape is rejected.
- Rewrote `checkAccessAndLoadCache` to:
  1. Gate on `subscription_tier !== 'free'` (free-tier short-circuits to `'will-use-credit'`; ProFeatureGate blocks them anyway per D-13).
  2. Call `supabase.rpc('get_billing_period_start', { p_user_id: user.id })`.
  3. Query `linkedin_grades` for rows in the current cycle (`gte('created_at', billingStart)`) ordered desc — one query serves both cache-load and cycle-count.
  4. Use `cycleRows[0]` as the cache candidate; only hydrate state if `isV3Grade(candidate.grading_data)` returns true. Legacy rows fall through to the input form.
  5. Derive `entitlementState` from `cycleRows.length === 0 ? 'free-available' : 'will-use-credit'`.
- Graceful degrade: every error path sets `entitlementState = 'will-use-credit'` so the UI never sticks in `'loading'`.

### Task 2 — Entitlement helper text

Inserted a `<div className="mt-2 text-center min-h-[20px]" aria-live="polite">` directly below the Analyze button rendering 4 branches:

- `loading` → `Checking eligibility…` (`text-muted-foreground`)
- `free-available` → `Free scan available this billing cycle` (`text-emerald-600 dark:text-emerald-400 font-medium`)
- `will-use-credit` → `This will use 1 AI credit` (`text-muted-foreground`)
- `error` → `This will use 1 AI credit` (`text-muted-foreground`)

Exact UI-SPEC Copywriting Contract strings. No confirmation modal. Analyze button is NOT disabled during loading (backend remains authoritative per D-09).

## AiCreditsContext Field Name

**No remaining-count field exists on `AiCreditsContext`.** The context exposes only:

```
creditsAvailable: boolean
usageLimit: { reached, resetDate, tier }
markCreditsDepletedFromError, markCreditsRestored, checkUsageLimitError
```

Per plan guidance ("If `useAiCredits` does not expose any remaining-count field, simply render `This will use 1 AI credit` without the parenthetical. Do NOT invent a field."), the `({N} remaining)` parenthetical is omitted. When/if a future plan adds `remainingCredits` (or similar) to the context, the JSX can append `{typeof remainingCredits === 'number' ? ` (${remainingCredits} remaining)` : ''}` to the `will-use-credit` branch.

## Graceful-Degrade Log Lines Added

All use bracket-prefixed console.error per repo convention:

- `console.error('[LinkedInGrader] billing-cycle query failed', billingErr);` — RPC failure
- `console.error('[LinkedInGrader] cycle-count query failed', error);` — `linkedin_grades` query failure
- `console.error('[LinkedInGrader] Error checking access:', error);` — outer try/catch (renamed from `'Error checking access:'`)

Every one sets `entitlementState = 'will-use-credit'` so the UI degrades safely.

## Verification

- `npm run build` → exit 0 (vite build succeeded, 11.12s)
- `npx eslint src/pages/LinkedInGrader.tsx` → 4 pre-existing `no-explicit-any` errors at lines 318/335/335/720, all outside this plan's edit range (confirmed by stashing and re-linting the pre-change file — same 4 errors at shifted line numbers). No new lint errors introduced by this plan.
- `npm run lint` (repo-wide) fails with 744 pre-existing errors across multiple files — out of scope per GSD SCOPE BOUNDARY.

### Acceptance Criteria Results

Task 1:
- `isV3Grade` declared: 1 ✓
- `entitlementState` occurrences: 7 ✓ (≥3)
- `get_billing_period_start` occurrences: 1 ✓
- `'free-available'` occurrences: 2 ✓
- `'will-use-credit'` occurrences: 7 ✓ (≥2)
- `rawScore === 'number'`: present inside isV3Grade ✓

Task 2:
- `Free scan available this billing cycle`: 1 ✓
- `This will use 1 AI credit`: 2 ✓ (will-use-credit + error branches)
- `Checking eligibility`: 1 ✓
- `aria-live`: 1 ✓
- `entitlementState === `: 4 ✓ (one per state)
- `remaining`: 0 (documented above — AiCreditsContext exposes no such field)

## Manual Smoke

Manual browser smoke was **not** performed by the executor — the phase's manual smoke is deferred until Plans 05 (backend) and 06 (comparison modal) land so the complete end-to-end flow can be exercised in one session. The frontend-only acceptance criteria (build + lint + code-shape greps) all pass.

## Deviations from Plan

None — plan executed as written. The one documented decision (omit the `({N} remaining)` parenthetical) was explicitly allowed by the plan when `AiCreditsContext` has no remaining-count field.

## Self-Check: PASSED

- `src/pages/LinkedInGrader.tsx` modified and committed ✓
- Commit `614f102` (Task 1) exists ✓
- Commit `04eb588` (Task 2) exists ✓
- Build exits 0 ✓
- No new lint errors introduced ✓
