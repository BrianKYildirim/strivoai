---
phase: 31-optimistic-ui-refund-verification
plan: 04
subsystem: merit-refund-verification
tags: [merits, refund, idempotency, edge-tests, staging-gated, verify-only]
requires:
  - "31-02: merit-gateway refund path + refund_merits RPC under test"
provides:
  - "Exhaustive gateway refund-on-failure coverage across every refundable class (MER-05)"
  - "7 per-path refund smoke tests (5 sync + 2 async endpoints wire the gateway)"
  - "MER-06 refund_merits idempotency replay test (already_refunded, zero mutation)"
  - "Both refund test files registered in the edge-test runner"
  - "Operator staging verification recorded in 31-STAGING-VERIFICATION.md (244 passed / 0 failed)"
affects:
  - supabase/functions/_shared/merit-gateway.refund.test.ts
  - supabase/functions/_shared/merit-refund-idempotency.test.ts
  - scripts/run-edge-tests.ps1
tech-stack:
  added: []
  patterns:
    - "Gated staging tests SKIP cleanly without DENO_TEST_SUPABASE_REMOTE + creds; assert forced error BEFORE refund (guards vacuous pass)"
    - "Exact-balance-equality assertions (not deltas); self-clean via teardownTestUser"
    - "Verify-only — tests prove existing shipped behavior; no production code or migration changes (D-15/D-16)"
key-files:
  created:
    - supabase/functions/_shared/merit-gateway.refund.test.ts
    - supabase/functions/_shared/merit-refund-idempotency.test.ts
  modified:
    - scripts/run-edge-tests.ps1
decisions:
  - "Plan is autonomous:false — completion required a gated staging run (D-14); operator ran it against ref cimjltzovkahkqecpwgi with MERIT_TEST_FORCE_REFUNDABLE_ERROR=529 and pasted evidence into 31-STAGING-VERIFICATION.md"
  - "Removed a stale analyze-resume/legacy-unchanged.test.ts reference from the runner (orphaned by 604646d / phase 30-05) that aborted the suite before refund tests ran — fix ece7e54, in-scope runner registration"
  - "No edits to merit-gateway.ts or 20260415000000_merit_rpcs.sql — verify-only (D-15/D-16)"
  - "T-31-11 closed: MERIT_TEST_FORCE_REFUNDABLE_ERROR removed from staging fn env after the run (operator-confirmed)"
metrics:
  duration: ~operator-gated
  completed: 2026-05-20
requirements: [MER-05, MER-06]
---

# Phase 31 Plan 04: Refund-Proof + Idempotency Verification Summary

Added the gated refund-proof test suite (MER-05) and the `refund_merits` idempotency
replay test (MER-06), registered both in the edge-test runner, and verified them
against Supabase **staging** via the operator-gated checkpoint (Task 4, `autonomous:
false`). The suite proves the existing shipped refund behavior — no production code or
migration changes (verify-only, D-15/D-16).

## What Was Built

### Task 1 — Gateway exhaustive refund + 7 per-path smoke tests (MER-05, commit 53775da)
- `merit-gateway.refund.test.ts`: exhaustive refund-on-failure coverage across every
  refundable class (500, 529, 408, AbortError→408, network/timeout). Each test asserts
  the forced error was returned **before** asserting the refund (guards vacuous pass).
- 7 thin per-path smoke tests confirm each endpoint (5 sync + 2 async) wires the gateway,
  one forced-error each, exact-balance-equality back to seed, self-cleaning via
  `teardownTestUser`. Gated on `DENO_TEST_SUPABASE_REMOTE`; SKIPs cleanly otherwise.

### Task 2 — MER-06 refund_merits idempotency replay (commit 2832b36)
- `merit-refund-idempotency.test.ts`: calls `refund_merits` twice on one seeded
  `merit_transactions` row — first → refunded + balance restored; second →
  `already_refunded` + balance UNCHANGED.

### Task 3 — Runner registration (commit 1601861)
- Both new test files appended to the explicit backtick-continued file list in
  `scripts/run-edge-tests.ps1` (otherwise they never run).

### Task 4 — Operator staging verification (gated checkpoint, autonomous:false)
- Operator ran `run-edge-tests.ps1` against staging (ref `cimjltzovkahkqecpwgi`) with
  `MERIT_TEST_FORCE_REFUNDABLE_ERROR=529` on the function env and remote creds set.
- Result: **244 passed / 0 failed**; refund tests executed for real (not SKIP) and
  passed. Evidence recorded in `31-STAGING-VERIFICATION.md`.
- T-31-11 closed: force flag removed from the staging fn env after the run.

## Deviations from Plan

**1. [Rule 1 - Refinement] Stale runner reference removed (ece7e54)**
- **Found during:** Task 4 (first verification attempt aborted on import error).
- **Issue:** `scripts/run-edge-tests.ps1` still referenced
  `analyze-resume/legacy-unchanged.test.ts`, deleted in `604646d` (phase 30-05). The
  not-found import aborted the whole `deno test` block before the refund suite ran.
- **Fix:** Removed the dead line. Suite now runs clean (refund tests SKIP-gated locally;
  244/0 against staging). In-scope: Task 3 owns runner registration. No change to
  merit-gateway.ts or the migration.
- **Files modified:** scripts/run-edge-tests.ps1
- **Commit:** ece7e54

**2. [Environmental] First staging attempt — 15 failures, superseded**
- A first run reported 229 passed / 15 failed (refund tests included) because the
  staging function had not yet propagated `MERIT_TEST_FORCE_REFUNDABLE_ERROR`. The
  re-run after propagation passed clean. No code defect; see 31-STAGING-VERIFICATION.md.

## Verification
- Local non-gated: refund test files run clean and SKIP correctly without staging creds
  (19 passed for the 3 refund files; 0 failed).
- Gated staging (operator, 31-STAGING-VERIFICATION.md): 244 passed / 0 failed; refund tests
  executed against staging — balance restored to seed on every refundable class; MER-06
  replay returns `already_refunded` with zero mutation.

## Threat Flags
- **T-31-11 (force-flag staging outage):** mitigated — `MERIT_TEST_FORCE_REFUNDABLE_ERROR`
  removed from the staging fn env after the verifying run (operator-confirmed).

## Self-Check: PASSED
- FOUND: supabase/functions/_shared/merit-gateway.refund.test.ts (53775da)
- FOUND: supabase/functions/_shared/merit-refund-idempotency.test.ts (2832b36)
- FOUND: scripts/run-edge-tests.ps1 registration (1601861) + stale-ref fix (ece7e54)
- FOUND: 31-STAGING-VERIFICATION.md with passing staging evidence (244/0)
- Commits 53775da, 2832b36, 1601861, ece7e54 present in git log.
