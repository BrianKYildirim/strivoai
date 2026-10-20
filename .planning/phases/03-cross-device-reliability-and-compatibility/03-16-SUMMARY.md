---
phase: 03-cross-device-reliability-and-compatibility
plan: 16
subsystem: submit-integrity
tags: [idempotency, duplicate-submit, merits, accessibility]

requires:
  - phase: 03-11
    provides: capability gates block before money-path handlers
  - phase: 03-14
    provides: terminal and recovery semantics that determine lock release
  - phase: 03-15
    provides: one shared waiting surface during guarded submissions
provides:
  - shared per-feature and per-input in-flight submit guard
  - stable attempt nonce through the existing useIdempotencyKey primitive
  - explicit new-attempt path for paid Elite reruns
  - static prevention of inline page nonce generation
affects: [03-17 rapid-click E2E proof, five AI submit paths, Elite rerun]

requirements-completed: [XRUN-01, XRUN-02, XDEV-03]
completed: 2026-07-29
---

# Phase 03 Plan 16: Shared Submit Integrity Summary

One synchronous guard now owns the client half of “one click, one attempt.” A rapid
second activation returns before UI state, telemetry, optimistic Merit state, storage
writes, or an analysis request can be created. Server-derived idempotency remains the
authoritative cross-tab, refresh, and restored-session protection.

## D-14 audit before migration

| Path | Previous nonce | Previous client guard | Retry / rerun semantics preserved |
| --- | --- | --- | --- |
| Upload | Fresh inline `crypto.randomUUID()` after upload/extraction | `isUploading` UI state plus lifecycle-only lock; the click wrapper awaited entitlement before the handler | Each deliberate upload remains a new attempt; cached same-tier resumes still bypass analysis |
| Onboarding | Lazy nonce held in `attemptNonceRef` | `submittingRef` on the full path plus `loading` | Held resume row, same-page retry, landed-result recovery, ambiguous Results handoff, and goal-only path preserved |
| LinkedIn Grader | Fresh inline UUID per grade | `loading`, set before PDF extraction | A completed handler releases the lock and rolls the next deliberate grade to a new nonce |
| Recruiting Lens | Ref-held UUID; `reuseNonce=true` for Try Again | `useAnalysisGuard` plus `isAnalyzing` | Failed Try Again reuses the same nonce; successful completion rolls the next deliberate analysis |
| Career Compass | Lazy ref-held UUID | Lifecycle lock only when the default-off lifecycle flag was enabled, plus `loading` UI state | Hoisted transient auto-retry body keeps the same nonce; terminal outcomes roll the next attempt |
| Elite resume rerun | Fresh inline UUID for a new clone; persisted lease nonce for recovery | `isStarting` presentation state | Explicit rerun calls `beginRerun(sourceResume.id)`; incomplete leases still reuse their persisted row and nonce |

The audit confirmed D-29’s extraction threshold: the same financially consequential
nonce/lock behavior existed independently across all five AI pages plus Elite rerun.

## Implementation

- Added `useSubmitGuard`, keyed by feature and stable input identity. `beginSubmit`
  acquires synchronously and returns `null` for a duplicate; the token carries the
  stable attempt nonce. Locks release explicitly, on unmount, on terminal-state input,
  and through a bounded 15-minute lease.
- Reused `useIdempotencyKey`; no timestamp, `Math.random`, user-controlled nonce, or
  new server keying concept was introduced.
- Added `beginRerun`, which mints a new nonce only after confirming no same-input lock
  is active. Elite rerun scopes the lock by source resume id and retains its existing
  persisted-lease recovery contract.
- Replaced start-CTA `disabled` attributes with `aria-disabled` and exposed
  `aria-busy` on each submission region. Handler-level checks preserve inert behavior
  for invalid, unaffordable, already-running, or capability-blocked starts.
- Preserved every request payload key and value except that `attemptNonce` now comes
  from the shared token. No response parser, prompt, output, scoring, recommendation,
  Merit calculation, refund, tier, backend, migration, Results, or database code changed.

## Regression proof

- Shared hook: synchronous duplicate collapse; stable nonce; explicit-rerun nonce
  rotation; release on success/error, terminal state, unmount, and lease expiry;
  per-feature/per-input isolation; default CSPRNG polyfill path; no `disabled` prop.
- Existing feature recovery tests were retained and rewired to assert the shared
  guard without renaming coverage-registry test cases.
- Static guard walks production pages, requires all five imports plus Elite
  `beginRerun`, forbids inline `crypto.randomUUID`, and rejects `disabled` on the five
  start CTAs.
- Mutation proof passed: an inline UUID, a `disabled` start CTA, and a removed
  `useSubmitGuard` import each made the guard fail with the exact file/line; all three
  mutations were reverted.

## Validation

| Gate | Result |
| --- | --- |
| 03-16 focused unit/static lane | 13 files, 119 tests passed |
| Complete Vitest suite | 145 files, 1157 tests passed |
| Type-check | exit 0 |
| ESLint | exit 0; 0 errors, 153 existing warnings |
| Production build | exit 0 |
| `git diff --check` | exit 0 |
| Elite rerun + two-tab Playwright, Chromium | 2 passed, 3 pre-existing environment-gated skips |

## Scope and remaining risk

The lifecycle flag remains default-off and was untouched. `Results.tsx`, Phase 2,
Supabase, migrations, prompts, models, request schemas, output logic, scoring, Merit
pricing/refunds, and tier access are untouched.

The client guard intentionally cannot coordinate separate browser tabs or survive a
refresh; the unchanged server idempotency key remains the security boundary for those
cases. Plan 03-17 owns five-engine rapid-click and cross-context browser proof. Preview
still cannot prove a real Merit debit because its Merit system is disabled.
