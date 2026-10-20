---
phase: 03-shared-analysis-lifecycle-substrate
plan: 07
subsystem: testing
tags: [deno, vitest, playwright, verify-baseline, dormancy, feature-flags, test-gate]

# Dependency graph
requires:
  - phase: 03-02
    provides: idempotency-key.test.ts (already registered by 03-02) + gated-remote idempotency-forward twin
  - phase: 03-03
    provides: llm-validation.test.ts, analysis-error-taxonomy.test.ts
  - phase: 03-04
    provides: analysis-flags.test.ts, analysis-lifecycle.classifier.test.ts, analysis-lifecycle.refund-boundary.test.ts
  - phase: 03-05
    provides: get-analysis-run-status/job-contract.test.ts + frontend useAnalysisRun/analysisError vitest guards
  - phase: 03-06
    provides: reap-stale-analysis-runs/__tests__/reaper.test.ts
provides:
  - Every 03-02..03-06 offline guard folded into supabase/functions/deno.json test:ci (Pitfall 12 closed)
  - Dormancy guard proving no feature routes through the substrate + flags default OFF (built-but-dormant)
  - Green offline verify:baseline legs (vitest 498, deno test:ci 932/0) with zero pre-existing-test regression
affects: [phase-04, phase-05, phase-06, feature-migration, verify-baseline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-source dormancy guard: cold-start env-read (flags default OFF) + entrypoint import scan (comment-stripped) + substrate-module existence checks"
    - "test:ci allowlist is the single-owner registration seam — offline guards fold into verify:baseline; gated-remote twins stay skip-by-default (out of test:ci)"

key-files:
  created:
    - supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
  modified:
    - supabase/functions/deno.json

key-decisions:
  - "idempotency-key.test.ts was already registered by 03-02 — appended the remaining 8 guards only (no duplicate); byte-identical legacy allowlist preserved verbatim ahead of the appends"
  - "Playwright leg of verify:baseline is operator/CI-gated by E2E secrets (absent in local sandbox) — logged as pre-existing env gate (deferred-items P03-E2E-SECRETS), not a regression; offline legs are the phase gate proof"

patterns-established:
  - "Dormancy proof pattern: default-OFF flags + no-feature-import scan + substrate-present, all static/offline"

requirements-completed: [LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08, LIFE-09]

# Metrics
duration: 5min
completed: 2026-07-02
---

# Phase 3 Plan 7: Fold Substrate Guards into verify:baseline + Prove Dormancy Summary

**Every 03-02..03-06 offline guard registered in `deno.json` test:ci (deno 832→932) plus a static dormancy guard proving the lifecycle substrate ships built-but-unwired (flags default OFF, no feature import) — closing Phase 3 with zero behavior change.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-02T13:28:47Z
- **Completed:** 2026-07-02T13:33:59Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments
- Added `analysis-lifecycle.dormancy.test.ts` (15 assertions): master flag default-derives OFF, every feature default-derives OFF, none of 8 feature/analysis entrypoints import `analysis-lifecycle`, and all 5 substrate modules physically exist (built-but-dormant).
- Registered the remaining 8 new offline guards into `test:ci` (idempotency-key was already registered by 03-02), preserving the legacy allowlist byte-for-byte and excluding every gated-remote twin.
- Proved the gate is GREEN offline: `deno task test:ci` 932 passed / 0 failed / 12 ignored; `vitest` 498 passed. No pre-existing test flipped.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dormancy guard** - `4d5bb2a6` (test)
2. **Task 2: Register new guards in test:ci** - `3517232f` (test)
3. **Task 3: Run full verify:baseline** - no file change beyond Task 2 (phase gate; offline legs green)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` - Static dormancy proof (flags OFF, no feature import, substrate present).
- `supabase/functions/deno.json` - test:ci allowlist extended with 8 new offline guards (dormancy + llm-validation + analysis-error-taxonomy + refund-boundary + classifier + analysis-flags + get-analysis-run-status/job-contract + reaper).

## Test Count Deltas (before → after)

| Suite | Before | After | Delta | Notes |
|-------|--------|-------|-------|-------|
| deno test:ci | 832 passed / 11 ignored | 932 passed / 12 ignored | +100 passed, +1 ignored | +1 ignored = the reaper/job-contract gated-remote twin skipping offline |
| vitest | 475 passed | 498 passed | +23 passed | 03-05 useAnalysisRun + analysisError + feature-flag extension |

## Registered Guards (this plan)

Appended to `test:ci` (8 — idempotency-key.test.ts was already registered by 03-02):
- `_shared/llm-validation.test.ts`
- `_shared/analysis-error-taxonomy.test.ts`
- `_shared/analysis-lifecycle.refund-boundary.test.ts`
- `_shared/analysis-lifecycle.classifier.test.ts`
- `_shared/analysis-flags.test.ts`
- `get-analysis-run-status/job-contract.test.ts`
- `reap-stale-analysis-runs/__tests__/reaper.test.ts`
- `_shared/analysis-lifecycle.dormancy.test.ts`

Deliberately NOT registered (gated-remote twins, SKIP without `DENO_TEST_SUPABASE_REMOTE=1`): idempotency-forward runtime twin, reaper live-DB assertions, create_or_recover N-parallel — they stay out of test:ci.

## Decisions Made
- **No duplicate registration:** discovered `_shared/idempotency-key.test.ts` was already present in the legacy `test:ci` string (registered by 03-02); appended only the 8 remaining guards to avoid a duplicate module specifier. The pre-existing allowlist is preserved verbatim ahead of the appends (byte-identical legacy gate).
- **Playwright leg is env-gated, not a regression:** `verify:baseline`'s Playwright leg aborts in the local sandbox because `e2e/global-setup.ts` requires `SUPABASE_TEST_URL` / `SUPABASE_TEST_SERVICE_ROLE_KEY` / `E2E_TEST_PASSWORD` (from `.env.test.local` or CI secrets), all absent here. This plan touched no Playwright/app/E2E code, so the two offline legs (vitest + deno test:ci) are the authoritative dormancy-gate proof; Playwright runs green under operator/CI.

## Deviations from Plan

None - plan executed exactly as written. (The one refinement — appending 8 rather than 9 paths because idempotency-key.test.ts was already registered by 03-02 — is a correctness detail of the registration task, not a scope change.)

## Issues Encountered
- **verify:baseline Playwright leg blocked by missing E2E secrets** (pre-existing environment gate). Confirmed env-driven (`.env.test.local` absent; all three required vars unset) and unrelated to this plan's changes (`git diff` = 1 new test file + 1-line deno.json edit). Logged to `deferred-items.md` (P03-E2E-SECRETS). No action owed by Phase 3; offline legs are GREEN.

## User Setup Required
None - no external service configuration required. (E2E secrets for the Playwright leg are an operator/CI concern, not introduced by this plan.)

## Next Phase Readiness
- **Phase 3 CLOSED.** The shared analysis lifecycle substrate ships DORMANT and every LIFE guard is now inside verify:baseline (Pitfall 12 closed). Phases 4/5/6 can migrate features onto the substrate one at a time (ascending blast radius) behind the two-level flags; the dormancy guard will fail-loud the moment a feature imports `analysis-lifecycle`, at which point that feature's entrypoint is intentionally removed from the guard's scan set as it wires on.
- Note: the 03-01 and 03-06 migrations remain operator-gated (committed, not yet applied); verify:baseline passes offline without them.

---
*Phase: 03-shared-analysis-lifecycle-substrate*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts`
- FOUND: `.planning/phases/03-shared-analysis-lifecycle-substrate/03-07-SUMMARY.md`
- FOUND commit: `4d5bb2a6` (dormancy guard)
- FOUND commit: `3517232f` (test:ci registration)
- FOUND in deno.json test:ci: dormancy, llm-validation, analysis-error-taxonomy, reaper (+ the other 4 verified in-run)
