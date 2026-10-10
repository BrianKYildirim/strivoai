---
phase: 01-testing-strategy-regression-baseline
plan: 01
subsystem: testing

tags: [vitest, deno, supabase-mock, react, unhandled-rejection, tier-config, test-determinism]

# Dependency graph
requires:
  - phase: 01 (planning)
    provides: "RED-baseline findings (tier-config Pro-timeout drift) + TEST-02 unhandled-rejection root cause"
provides:
  - "Deterministic vitest suite (identical failure set across 3 consecutive runs) — TEST-02"
  - "src/test/supabaseMock.ts — reusable fully-chainable Supabase query-builder mock factory"
  - "test-setup.ts unhandledRejection re-throw hook (surfaces, does not suppress)"
  - "OutcomeOverdueBanner async-effect try/catch guard (no cross-worker rejection)"
  - "Green deno tier-config suite — reconciled Pro→Elite-collapse assertions (TEST-06 prerequisite)"
affects: [01-02, 01-03, 01-04, 01-05, regression-baseline, testing-strategy-doc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async-effect guard: wrap useEffect Supabase queries in try/catch with benign no-op fallback + [Component] log prefix"
    - "Reusable makeSupabaseMock() factory replaces ~20 hand-rolled partial mocks"
    - "process.on('unhandledRejection') re-throw in test-setup to surface (not suppress) escaped rejections"

key-files:
  created:
    - "src/test/supabaseMock.ts"
    - ".planning/phases/01-testing-strategy-regression-baseline/deferred-items.md"
  modified:
    - "src/components/applications/OutcomeOverdueBanner.tsx"
    - "src/test-setup.ts"
    - "src/components/PricingTable.test.tsx"
    - "src/hooks/__tests__/usePaywallGuard.test.tsx"
    - "supabase/functions/_shared/tier-config.test.ts"

key-decisions:
  - "tier-config RED drift is a STALE TEST, not a source bug — reconciled the 3 Pro-timeout assertions to the deployed Pro→Elite collapse; tier-config.ts source left byte-identical (zero product behavior change, T-01-01 mitigation)."
  - "Rejection-surfacing test-setup hook RE-THROWS escaped rejections (fails own test loudly); deliberately NOT dangerouslyIgnoreUnhandledErrors (would weaken the blocking gate, D-07)."
  - "7 pre-existing deterministic vitest failures are OUT OF SCOPE for this plan (content/source drift, not TEST-02 flakiness) — logged to deferred-items.md, not fixed here."

patterns-established:
  - "Async-effect guard pattern for all useEffect-issued Supabase queries (also applicable to ReportOutcomeDialog.fetchExisting)"
  - "Single complete chainable Supabase mock factory as the default vi.mock body"

requirements-completed: [TEST-02, TEST-06]

# Metrics
duration: ~9min
completed: 2026-06-09
---

# Phase 01 Plan 01: Test-Suite Determinism (TEST-02 + TEST-06 prerequisite) Summary

**Made the vitest + deno suites deterministic — guarded the OutcomeOverdueBanner async effect, shipped a reusable chainable Supabase mock factory + an unhandled-rejection-surfacing test-setup hook, and reconciled 3 stale tier-config Pro-timeout assertions to the deployed Pro→Elite collapse with zero source change.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-09 (baseline run captured first)
- **Completed:** 2026-06-09T22:05Z
- **Tasks:** 3
- **Files modified:** 5 (+1 created factory, +1 deferred-items log)

## Accomplishments
- TEST-02 root cause killed at source: the unguarded `fetchOverdue` async IIFE in `OutcomeOverdueBanner.tsx` can no longer escape a thrown query chain as an unhandled rejection that crashes a neighboring vitest worker.
- Reusable `makeSupabaseMock()` / `makeQueryBuilder()` factory replaces the brittle hand-rolled partial mocks (refactored `PricingTable.test.tsx` and `usePaywallGuard.test.tsx` as the first two consumers).
- `test-setup.ts` now re-throws escaped rejections so any FUTURE leak fails its own test loudly (belt-and-suspenders; no gate weakening).
- TEST-06 prerequisite met: the deno `tier-config.test.ts` suite now exits 0 (21 passed) by reconciling 3 stale Pro-specific assertions — `tier-config.ts` source untouched.
- Verified determinism: 3 consecutive `npm test` runs produced a byte-identical 7-failure set.

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard the OutcomeOverdueBanner async effect** - `18a8582` (fix)
2. **Task 2: Add reusable Supabase mock factory + surface escaped rejections** - `5d9886a` (test)
3. **Task 3: Reconcile the RED tier-config.test.ts drift** - `7de18b8` (test)

**Plan metadata:** (docs commit — STATE.md / ROADMAP.md / this SUMMARY)

## Files Created/Modified
- `src/test/supabaseMock.ts` (NEW) - `makeSupabaseMock()` + `makeQueryBuilder()`; chainable `select/insert/update/upsert/delete/eq/neq/lt/lte/gt/gte/in/is/match/order/limit/range` (all resolve `{ data: [], error: null }`), thenable for un-terminated chains, `maybeSingle`/`single` → `{ data: null, error: null }`, plus `auth`/`rpc`/`storage`/`functions` stubs.
- `src/components/applications/OutcomeOverdueBanner.tsx` - wrapped `fetchOverdue` body in try/catch; catch logs `[OutcomeOverdueBanner]` and sets count 0 when `!cancelled`. No query/threshold/filter/self-hide logic changed.
- `src/test-setup.ts` - added `process.on('unhandledRejection', re-throw)` hook.
- `src/components/PricingTable.test.tsx` - refactored to `makeSupabaseMock()`; `auth.getUser` still overridden by the per-test `getUserMock`.
- `src/hooks/__tests__/usePaywallGuard.test.tsx` - refactored to `makeSupabaseMock({ user: { id: 'guard-user' } })`; `rpc` still wired to the hoisted `rpcSpy` that test 7 inspects.
- `supabase/functions/_shared/tier-config.test.ts` - reconciled 3 Pro-timeout assertions (see below).
- `.planning/phases/01-testing-strategy-regression-baseline/deferred-items.md` (NEW) - logged 7 out-of-scope pre-existing deterministic failures.

## Tier-config reconciliation (exact before/after — Plan 04 cites this)

Root cause: `getTimeout(tier)` calls `normalizeActiveTier(tier)` (src/config/pricing-config.ts), which collapses `'pro' → 'elite'` (deployed merit-milestone behavior: the active product treats saved Pro users as Elite so no path falls into an inactive middle tier). So every `'pro'` timeout lookup resolves the **Elite** `TIER_TIMEOUTS` row (`{ core: 155000, quiz: 80000 }`, NO `elite-preview`). The 3 failing tests were stale pre-collapse Pro-specific expectations. The SOURCE is correct (reflects deployed behavior); the TEST was stale. `git diff supabase/functions/_shared/tier-config.ts` is empty.

| Assertion | Before (stale, pre-collapse) | After (reconciled, Pro→Elite) | Why |
|-----------|------------------------------|-------------------------------|-----|
| `getTimeout('pro','core')` | `assertEquals(... , 125_000)` | `assertEquals(... , 155_000)` | Resolves `TIER_TIMEOUTS['elite']['core']` = 155000 |
| `getTimeout('pro','elite-preview')` | `assertEquals(... , 65_000)` | `assertThrows(... , 'tier-config: no timeout for tier=pro callType=elite-preview')` | Elite row lacks `elite-preview` → throws (mirrors the elite + elite-preview throw); error template interpolates the original `tier` arg ('pro') |
| `getTimeout('pro','quiz')` | `assertThrows(...)` | `assertEquals(... , 80_000)` | Resolves `TIER_TIMEOUTS['elite']['quiz']` = 80000 → no longer throws |

A comment above the reconciled block references `normalizeActiveTier` and the Pro→Elite collapse. The `TIER_TIMEOUTS contains exactly the spec-defined values` test (reads the raw constant, not via `getTimeout`) still passes unchanged. Deno result: `21 passed | 0 failed`.

## OutcomeOverdueBanner guard diff (summary)

Only change: the existing `fetchOverdue` body (from `supabase.auth.getUser()` through `setOverdueCount(overdue.length)`) is now inside `try { ... }`, plus a new `catch (error) { console.error('[OutcomeOverdueBanner] overdue fetch failed:', error); if (!cancelled) setOverdueCount(0); }`. The `OVERDUE_THRESHOLD_DAYS = 14` constant, cutoff-date computation, `.lt('application_date', cutoffDate)` query, `outcomes.length === 0` filter, and the `overdueCount === null || overdueCount === 0` self-hide guard are all byte-identical. A thrown chain now produces the same self-hidden state as the existing resolved-error path (benign no-op) — defensive only.

## Determinism confirmation

3 consecutive `npm test` runs produced the **identical** failure set each time:
`4 failed | 78 passed (82 files)` / `7 failed | 464 passed (471 tests)`. No cross-worker non-determinism observed. The 7 failures are deterministic content/source drift (see Deviations), NOT the TEST-02 flakiness this plan fixed.

## Decisions Made
- **Reconcile the test, not the source (T-01-01 mitigation):** the tier-config RED was a stale test; editing the source would have silently changed live per-tier timeouts. Confirmed `git diff tier-config.ts` empty.
- **Surface, don't suppress (D-07):** test-setup re-throws escaped rejections; explicitly avoided `dangerouslyIgnoreUnhandledErrors`.
- **Scope discipline:** the 7 pre-existing deterministic failures were logged to `deferred-items.md` and left untouched (not caused by this plan's changes).

## Deviations from Plan

None — plan executed exactly as written. (Two minor path reconciliations, not behavioral deviations: the plan's `files_modified` listed `src/hooks/usePaywallGuard.test.tsx`; the actual file is `src/hooks/__tests__/usePaywallGuard.test.tsx`. No `OutcomeOverdueBanner`-specific test file exists — the crash is transitive via Dashboard mounting the banner, consistent with the plan's root-cause description.)

## Issues Encountered
- The plan's auth-gate / authentication concerns did not apply (no network/secrets surface). No fix-attempt-limit was hit; all three tasks passed on first verification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Deterministic gate ready:** vitest failure set is stable run-to-run and the deno tier-config suite is green — the hard prerequisite for a trustworthy blocking gate (D-06) and the `v4.0-baseline` tag (Plan 05) is met.
- **Plan 01-02 unblocked:** it depends on this TEST-02 fix landing first and inherits the exact, stable 7-failure set documented in `deferred-items.md`.
- **Known deterministic RED (not flaky):** 7 pre-existing failures in `BlurredLockCard.test.tsx` (2), `req-coverage.test.ts` (2), `LinkedInGrader.linkedin-pdf-source.test.ts` (2), `cost-map-invariant.test.ts` (1) — for reconciliation in later plans / the strategy doc, not this plan.

## Self-Check: PASSED

- FOUND: src/test/supabaseMock.ts
- FOUND: src/components/applications/OutcomeOverdueBanner.tsx
- FOUND: supabase/functions/_shared/tier-config.test.ts
- FOUND: .planning/phases/01-testing-strategy-regression-baseline/01-01-SUMMARY.md
- FOUND: .planning/phases/01-testing-strategy-regression-baseline/deferred-items.md
- FOUND commit: 18a8582 (Task 1) / 5d9886a (Task 2) / 7de18b8 (Task 3)

---
*Phase: 01-testing-strategy-regression-baseline*
*Completed: 2026-06-09*
