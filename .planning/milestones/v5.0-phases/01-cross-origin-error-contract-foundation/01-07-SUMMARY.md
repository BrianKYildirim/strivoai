---
phase: 01-cross-origin-error-contract-foundation
plan: 07
subsystem: api
tags: [cors, deno, edge-functions, drift-guard, static-source-audit, verify-baseline]

# Dependency graph
requires:
  - phase: 01-01
    provides: "_shared/cors.ts withCors(req, 'user', …) + handleOptionsRequest contract the audit asserts"
  - phase: 01-02..01-06
    provides: "Wave-2 rollout — all 21 active user Edge Functions wrapped in withCors(req, 'user', …)"
provides:
  - "_shared/cors-audit.test.ts: table-driven static-source CORS-05 drift guard over the authoritative 21 user Edge Functions (withCors adoption + OPTIONS-via-shared-helper + zero hardcoded ACAO literal), one Deno.test per function + a 21-length guard"
  - "deno.json test:ci registration of cors-audit.test.ts (inside verify:baseline)"
  - "Proven-green full offline edge suite (deno task test:ci = 791 passed / 0 failed / 11 ignored)"
affects: [phase-01-08-operator-deploy-gate, verify-baseline, security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-source drift guard: read each function index.ts with Deno.readTextFileSync and assert on string contents (no Supabase/Anthropic mocking) — handler-config.test.ts idiom generalized across 21 functions"
    - "Table-driven Deno.test per function so a CI failure names the offending function; explicit length guard fails when a new user function is added without enrollment"

key-files:
  created:
    - supabase/functions/_shared/cors-audit.test.ts
    - .planning/phases/01-cross-origin-error-contract-foundation/deferred-items.md
  modified:
    - supabase/functions/deno.json

key-decisions:
  - "Audit asserts three invariants per function: (1) withCors(req, 'user' adopted, (2) OPTIONS routed via handleOptionsRequest||withCors, (3) NO hardcoded Access-Control-Allow-Origin literal — the only legitimate ACAO emission is _shared/cors.ts"
  - "Authoritative set frozen at exactly 21 user functions (RESEARCH §4); 14 internal + 3 webhook deliberately EXCLUDED so the audit never forces a user wrapper onto internal/webhook ({} CORS preserved)"
  - "Used std@0.168.0/testing/asserts.ts + the Windows leading-slash path fix, matching the grade-linkedin/handler-config.test.ts idiom the plan referenced"

requirements-completed: [CORS-05, CORS-06]

# Metrics
duration: 11min
completed: 2026-06-27
---

# Phase 1 Plan 07: CORS-05 Drift Guard Summary

**A table-driven static-source `_shared/cors-audit.test.ts` that iterates the authoritative 21 active user Edge Functions and fails CI if any one drops `withCors(req, 'user', …)`, stops routing OPTIONS through the shared helper, or hand-rolls an `Access-Control-Allow-Origin` literal — registered in `deno.json` `test:ci` so the single-origin/missing-header regression cannot silently return inside `verify:baseline`.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-27T12:30:33Z
- **Tasks:** 2
- **Files created:** 2 (+1 modified)

## Accomplishments
- Added `_shared/cors-audit.test.ts`: a `USER_FUNCTIONS` array of the authoritative 21 names (RESEARCH §4), each read via `Deno.readTextFileSync('../<fn>/index.ts')` with the Windows leading-slash fix, asserting three CORS-05 invariants per function plus a `USER_FUNCTIONS.length === 21` guard — 64 Deno tests total (1 length guard + 21×3), all green.
- Registered the new file in `deno.json` `test:ci` (it is not auto-discovered; the task lists files explicitly) without reordering or removing any existing entry, folding the drift guard into `verify:baseline` (CORS-06).
- Proved the full offline edge suite green: `deno task test:ci` = **791 passed / 0 failed / 11 ignored** (was 727 pre-plan; +64 from the audit), including the rewritten `_shared/cors.test.ts` + `auth.test.ts` (01-01), the new `cors-audit.test.ts`, the reconciled Stripe tests (01-06), and every wrapped function's existing contract/handler-config tests.
- Confirmed the exclusion is preserved: the 14 internal + 3 webhook functions are absent from the audit list, so their `handleOptionsRequest({ type: 'internal' | 'webhook' }) → {}` (no-CORS) behavior is untouched.

## Task Commits

1. **Task 1: Create cors-audit.test.ts static drift guard + register in deno.json** — `98162bed` (test)
2. **Task 2: Prove the full edge + vitest baseline; log out-of-scope flake** — `456e4679` (chore)

## Files Created/Modified
- `supabase/functions/_shared/cors-audit.test.ts` — Table-driven CORS-05 audit: per-function `withCors(req, 'user'` adoption, OPTIONS-via-`handleOptionsRequest`/`withCors`, and no-hardcoded-ACAO assertions + the 21-length guard.
- `supabase/functions/deno.json` — Appended ` _shared/cors-audit.test.ts` to the `test:ci` file list (`grep -c` = 1).
- `.planning/phases/01-cross-origin-error-contract-foundation/deferred-items.md` — Logged the pre-existing NYQ-02 vitest flake as an out-of-scope discovery (not fixed).

## Decisions Made
- **No-hardcoded-ACAO is the strongest of the three invariants.** RESEARCH §4 + a live grep confirmed zero `Access-Control-Allow-Origin` literals exist in any `index.ts` today; the audit codifies that as a permanent fail-closed guard so a future hand-rolled literal in a function entrypoint is rejected by CI (the only legitimate emitter is `_shared/cors.ts`).
- **Frozen 21-length guard.** A new user function added without enrollment trips the length assertion, forcing a conscious decision rather than silently leaving a function unguarded (the CORS-05 "audit every function, not just the 4 in logs" intent).
- **Mirrored the existing static-source idiom** (`std@0.168.0/testing/asserts.ts`, Windows path fix) rather than introducing a new assert import, keeping the audit consistent with `grade-linkedin/handler-config.test.ts`.

## Deviations from Plan

### Auto-fixed Issues
None — the plan executed exactly as written. The audit invariants held for all 21 functions on the first run (64/64 green), and `deno task test:ci` was green with no function-wrap or test reconciliation required.

### Out-of-Scope Discovery (logged, not fixed)

**1. [Scope boundary] Pre-existing NYQ-02 vitest flake — `AnalysisHistory.interviewPrep.test.tsx`**
- **Found during:** Task 2 (`npm test` baseline characterization).
- **Issue:** 2 of 457 vitest tests fail nondeterministically ("Test timed out in 5000ms" full-suite; "found multiple elements with text /career compass/i" in isolation). Root cause: the file's `afterEach` does not run RTL `cleanup()`, so the second `it` sees the first test's still-mounted DOM.
- **Relationship to this plan:** None — 01-07 changed only `_shared/cors-audit.test.ts` (a Deno edge test) and `deno.json`; neither is importable by vitest, so this frontend failure cannot be caused by the CORS audit. The other 455 vitest tests pass.
- **Disposition:** Out of scope — this is the previously-documented flake **NYQ-02 / R-03** carried in STATE.md Deferred Items from the v4.0 close. Logged to `deferred-items.md`; NOT fixed (scope boundary; it owns a separate remediation track). The edge surface this plan touches is fully green.

**Total deviations:** 0 auto-fixed; 1 out-of-scope discovery logged.
**Impact on plan:** None. The plan's automated verification (`deno task test:ci`) is green; the CORS-05 audit + the table-driven CORS tests run inside `verify:baseline`.

## Issues Encountered
- The vitest flake above is the only red across both layers; it is pre-existing, unrelated, and documented. No CORS/edge regressions surfaced.

## User Setup Required
None new for this plan. (The phase-level operator gate — `ALLOWED_ORIGINS` secrets on preview + prod and a redeploy of all functions, then apex+www verification — is exercised in 01-08 / the operator deploy gate, not here.)

## Next Phase Readiness
- The CORS-05 drift guard is live inside `verify:baseline`, so 01-08's operator deploy gate runs it as a hard precondition; any future function that drops `withCors` or hand-rolls ACAO fails the gate before deploy.
- The full offline edge suite is green at 791/0/11; the only outstanding baseline red is the deferred NYQ-02 vitest flake (frontend, unrelated to CORS).

## Self-Check: PASSED

- File verified on disk: `supabase/functions/_shared/cors-audit.test.ts` (FOUND).
- `deno.json` registration: `grep -c "cors-audit.test.ts"` = 1.
- Commits verified in git log: `98162bed` (Task 1), `456e4679` (Task 2) both present.
- Tests: `deno test _shared/cors-audit.test.ts` = 64 passed / 0 failed; `deno task test:ci` = 791 passed / 0 failed / 11 ignored.
- Exclusion preserved: 14 internal + 3 webhook functions are NOT in the audit list.

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*
