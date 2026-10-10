---
phase: 03-cross-device-reliability-and-compatibility
plan: 17
subsystem: one-click-integrity
tags: [playwright, idempotency, rerun, cross-device]
requires: [03-15, 03-16]
provides:
  - five-engine rapid-submit collapse proof
  - five-engine deliberate Elite rerun proof
  - honest Preview versus production Merit boundary
requirements-completed: [XRUN-01, XRUN-02, XTEST-03]
completed: 2026-07-30
---

# Phase 03 Plan 17: Five-Engine One-Click Integrity Summary

Plan 03-17 extends the two existing ownership specs without changing feature code.
Rapid double/triple activation, in-flight activation, and rapid Enter/Space activation
all create exactly one analysis request, one waiting-surface mount and no duplicate
toast. Normal completion releases that same surface.

The Elite rerun spec uses a deterministic local fixture and one consolidated scenario
per project. A held start proves rapid and disabled mid-start activation create no
analysis request. After terminal completion, the explicit rerun creates exactly one
new attempt; rapid double-click still collapses, and the second nonce differs from the
first. Nonces remain in test memory and are never logged or attached.

Preview cannot prove the actual Merit debit because its Merit system is disabled.
That ledger assertion remains operator production pass P-1; the automated lane proves
the browser-owned job/request/attempt boundary without making a vacuous money claim.

## Validation

| Gate | Result |
| --- | --- |
| Focused 03-17 five-engine matrix | 26 passed in 39.49 s |
| OT-8 five-engine gate | 6 passed |
| Stale-bundle gate | 21 passed |
| Complete Playwright gate | 297 passed, 36 intentional skips, 0 failed in 557.51 s |
| Complete Vitest suite | 146 files, 1,159 tests passed |
| Type-check | exit 0 |
| ESLint | exit 0; 0 errors, 153 existing warnings |
| Production build | exit 0 |
| `git diff --check` | exit 0 |

The focused addition is 140.51 seconds below the documented +180-second cap, and the
full lane did not increase from the immediately preceding 9.8-minute validated run.
No case or project was cut. `waiting-surface.spec.ts` and
`playwright.prod.config.ts` remain unchanged.

AI prompts, models, payload contents, response schemas, scoring, feature outputs,
Merit pricing/refunds, tier rules, Supabase, migrations and Phase 2 remain untouched.
