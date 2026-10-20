---
phase: quick-260718-j2x
plan: 01
subsystem: onboarding / entitlement-freshness
tags: [onboarding, stripe, entitlement, tier-authority, spinner, re-entrancy, pure-frontend]
requires:
  - src/hooks/useMerits.ts (reconcileTierUpgrade / useInvalidateMerits — reused, unchanged)
  - supabase/functions/analyze-resume/index.ts (server-side resolvedTier authority — unchanged)
provides:
  - Onboarding awaits an entitlement-freshness refresh before dispatching analyze-resume
  - Continuous Finish spinner + duplicate-submit re-entrancy guard
  - Removal of the misleading client tier:'free'
affects:
  - src/pages/Onboarding.tsx
  - src/pages/__tests__/Onboarding.recovery.test.tsx
  - src/pages/__tests__/Onboarding.freshness.test.tsx
tech-stack:
  added: []
  patterns:
    - Reuse the existing useMerits freshness primitive (no new abstraction)
    - Gate the bounded 10s poll behind a ?checkout=complete signal; else one awaited invalidate+refetch
key-files:
  created:
    - src/pages/__tests__/Onboarding.freshness.test.tsx
  modified:
    - src/pages/Onboarding.tsx
    - src/pages/__tests__/Onboarding.recovery.test.tsx
decisions:
  - Root cause is entitlement FRESHNESS, not client tier plumbing (backend already discards rawBody.tier)
  - Bounded reconcileTierUpgrade() only on ?checkout=complete; else single awaited invalidateMerits() to avoid the 10s poll trap for non-upgraders
  - Re-entrancy armed only on the committed FULL path (submittingRef true at setLoading(true), reset in the FULL-path finally)
metrics:
  duration: ~15min
  completed: 2026-07-18
---

# Quick Task 260718-j2x: Onboarding Resume Analysis — Authoritative Current Tier + Restore Spinner Summary

Pre-invoke entitlement freshness (reusing `useMerits().reconcileTierUpgrade()` / `useInvalidateMerits()`) so onboarding's first resume analysis runs against the user's authoritative current `profiles.subscription_tier`, plus a continuous Finish spinner and a `submittingRef` duplicate-submit guard — a pure-frontend fix, no edge change, no `supabase functions deploy`.

## What Changed

### Task 1 — `src/pages/Onboarding.tsx` (commit 75584a6d)
- Imported `useSearchParams` and `useMerits` / `useInvalidateMerits`; added `const [searchParams]`, `reconcileTierUpgrade`, `invalidateMerits`, and a `submittingRef` re-entrancy guard.
- `handleFinishSetup`: first statement is `if (submittingRef.current) return;`. The ref is armed (`= true`) only at the committed FULL path (right at `setLoading(true)`, after the goal / goal-only / resumeFile early-return guards) and reset (`= false`) in the FULL-path `finally` alongside `setLoading(false)` — so an early return can never leave it stuck.
- Inserted the entitlement-freshness step just before the "Setup complete!" toast (spinner already up): when `searchParams.get('checkout') === 'complete'`, a `toast('Confirming your plan...')` + `await reconcileTierUpgrade()` (bounded 1.5s/10s poll, silent on ceiling); otherwise `await invalidateMerits()` — one round-trip, no 10s poll for the common non-upgrader case.
- Removed the misleading hardcoded `tier: 'free'` from BOTH invoke bodies (lifecycle + dormant). The backend resolves tier authoritatively and discards `rawBody.tier`, so this is a cleanup with no tier-selection behavior change.
- Spinner held continuously through the freshness wait to navigate; dormant gate `if (isAnalysisLifecycleEnabled())` preserved.

### Task 2 — tests (commit c9b95db3)
- `Onboarding.recovery.test.tsx` (reconciled): added a source-contract assertion that `reconcileTierUpgrade` appears BEFORE the dormant call site — anchored to `const analysisPromise =` (NOT a bare `indexOf('invokeWithTimeout')`, which would match the top-of-file import and be vacuously false) — plus `not.toContain("tier: 'free'")` and the `submittingRef` set/reset pins. All prior assertions (origin, attemptNonce, startRun-before-navigate, `disabled={loading…}`, dormancy gate) still pass unchanged.
- `Onboarding.freshness.test.tsx` (new, behavioral): renders `<Onboarding />`, drives the FULL Finish path, and covers the 11 scenarios — backend tier-authority (1-4) mapped to the existing analyze-resume Deno suite and asserted here only as "client invoke body has no `tier`"; frontend (5-11): reconcile-awaited-before-invoke on `?checkout=complete`, invoke gated on the freshness resolve, immediate "Setting up..." disabled spinner, rapid-double-click submits at most once, terminal-failure toast without navigate (lifecycle branch), and no-checkout fast path (no reconcile, single awaited `invalidateMerits`, dormant navigate).

## Deviations from Plan

**1. [Rule 1 - Bug] Recovery-test ordering anchor corrected**
- **Found during:** Task 2 verify (test run went red).
- **Issue:** The plan's suggested `onboarding.indexOf('invokeWithTimeout(', …)` returns `-1` because the dormant call site is `invokeWithTimeout<{ error?: string }>(` (generic before the paren), making the ordering assertion `X < -1` fail. The plan itself flagged this class of pitfall.
- **Fix:** Anchored `dormantInvokeIdx` to `onboarding.indexOf('const analysisPromise =')` (the plan-listed equivalent), added a `> -1` sanity assertion.
- **Files modified:** `src/pages/__tests__/Onboarding.recovery.test.tsx`
- **Commit:** c9b95db3

## Verification

- `npm run lint` — 0 errors (149 pre-existing warnings, out of scope).
- `npm run type-check` — clean.
- `npm run test` (full vitest) — 99 files / 654 tests passed, no regressions.
- Manual greps: freshness wiring present, `tier: 'free'` absent in `Onboarding.tsx`, `submittingRef` set+reset, dormancy gate intact.

Pure-frontend change — ships via Vercel. NO edge/deno source changes and NO `supabase functions deploy`; the deno/edge and Playwright suites are not the relevant gate for this change (per task constraints). The existing analyze-resume "never trust rawBody.tier" Deno contract remains valid now that the client stops sending `tier:'free'`. Staging is the current branch.

## Self-Check: PASSED
- FOUND: src/pages/Onboarding.tsx
- FOUND: src/pages/__tests__/Onboarding.recovery.test.tsx
- FOUND: src/pages/__tests__/Onboarding.freshness.test.tsx
- FOUND commit: 75584a6d (Task 1)
- FOUND commit: c9b95db3 (Task 2)
