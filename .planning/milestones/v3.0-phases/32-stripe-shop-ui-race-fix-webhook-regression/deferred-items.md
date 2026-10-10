# Deferred Items — Phase 32

## Pre-existing whole-app type errors (out of scope, plan 32-01)

`npx tsc --noEmit -p tsconfig.app.json` exits 2 with 14 pre-existing `error TS` lines on the
plan base commit (882fcaa), BEFORE any 32-01 change. None are in this plan's files
(`src/hooks/useMerits.ts`, `src/components/topup/StripePaymentElementModal.tsx`,
`src/components/topup/StripePaymentElementModal.test.tsx`). Verified by stashing 32-01 changes
and re-running tsc: still 14 errors.

Affected files (all unrelated to Phase 32 scope):
- `src/config/__tests__/feature-flags.test.ts`
- `src/hooks/__tests__/usePaywallGuard.test.tsx`
- `src/hooks/__tests__/useTierAccess.test.tsx`
- `src/pages/CareerCompass.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/SkillsGapAnalysis.tsx` (Cannot find name 'Navbar')
- `src/pages/Upload.tsx`

The 32-01 acceptance criterion "`tsc --noEmit` exits 0" cannot pass at the whole-app level due
to these pre-existing errors. The 32-01 changes themselves introduce ZERO new type errors
(grep for `useMerits|topup/Stripe` in tsc output returns NONE). Not fixed per SCOPE BOUNDARY
(only auto-fix issues directly caused by the current task's changes).
