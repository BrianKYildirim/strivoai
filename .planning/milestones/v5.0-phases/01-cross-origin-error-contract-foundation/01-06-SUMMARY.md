---
phase: 01-cross-origin-error-contract-foundation
plan: 06
subsystem: payments
tags: [cors, deno, edge-functions, stripe, withCors, origin-reflection, testing]

# Dependency graph
requires:
  - phase: 01-01
    provides: "withCors(req, type, handler) + origin-reflection ALLOWED_ORIGINS allowlist; for an allowlisted Origin ACAO === that exact Origin"
provides:
  - "create-checkout-session, create-payment-intent, create-stripe-portal Deno.serve entrypoints wrapped in withCors(req, 'user', …) — origin-aware CORS on success, error, and OPTIONS preflight (CORS-02, CORS-05)"
  - "The only function-level ACAO test reconciliation in Phase 01: six ACAO assertions across the three Stripe test files now exercise the real prod wrapper (withCors) with an allowlisted Origin instead of the bare handler, so verify:baseline stays green under the origin-reflection contract"
affects: [wave-3-cors-audit, phase-2-security-audit, phase-8-paddle-retirement, stripe-billing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stripe billing serve sites wrap the bare handler in withCors(req, 'user', () => handler(req)) — identical to the Wave-2 rollout pattern (18 other functions), handler internals untouched"
    - "ACAO test reconciliation: route the existing bare-handler invocation through withCors with an allowlisted Origin header (testing the real prod path) rather than relaxing the exact-origin assertion"

key-files:
  created: []
  modified:
    - supabase/functions/create-checkout-session/index.ts
    - supabase/functions/create-checkout-session/index.test.ts
    - supabase/functions/create-payment-intent/index.ts
    - supabase/functions/create-payment-intent/index.test.ts
    - supabase/functions/create-stripe-portal/index.ts
    - supabase/functions/create-stripe-portal/index.test.ts

key-decisions:
  - "Serve-level wrap only — withCors supplies origin-aware CORS in prod; handler internals' req-less corsHeaders calls left untouched (no req threading across many response sites), matching why_these_differ"
  - "ACAO assertions PRESERVED (still assert exact-origin equality); only the invocation routes through the real prod wrapper with an allowlisted Origin — no coverage weakened (T-01-06-03)"
  - "Introduced an APP_URL constant in create-payment-intent/index.test.ts (it previously inlined 'http://localhost:8080') so ALLOWED_ORIGINS reuses the same single allowlisted origin, mirroring the other two files"

patterns-established:
  - "Stripe serve entrypoint = Deno.serve((req) => withCors(req, 'user', () => handler(req)))"
  - "Test ACAO reconciliation = set ALLOWED_ORIGINS=APP_URL in the env helper + add Origin:APP_URL to the request + wrap the bare-handler call in withCors(req, 'user', () => handler(req, deps))"

requirements-completed: [CORS-02, CORS-05]

# Metrics
duration: 6min
completed: 2026-06-27
---

# Phase 1 Plan 06: Stripe Edge Functions CORS Wrap + ACAO Test Reconciliation Summary

**The three Stripe user Edge Functions (create-checkout-session, create-payment-intent, create-stripe-portal) now route their `Deno.serve` entrypoints through `withCors(req, 'user', …)` for origin-aware CORS on success/error/preflight, and the six ACAO assertions in their unit tests are reconciled to the post-01-01 origin-reflection contract by driving the bare handler through the real prod wrapper with an allowlisted Origin — closing the only function-level test reconciliation in the phase and restoring a fully green offline edge suite (727 passed).**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-27T12:17:56Z
- **Completed:** 2026-06-27T12:24:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Wrapped all three Stripe `Deno.serve` entrypoints in `withCors(req, 'user', () => handler(req))` so success, error (`return r`), and OPTIONS preflight responses all carry origin-aware CORS in production (CORS-02, CORS-05) — without touching any handler internals.
- Reconciled the six ACAO assertions (checkout OPTIONS + 3 PRICE-03 cases, portal OPTIONS, payment-intent OPTIONS) to origin reflection: each now sets `ALLOWED_ORIGINS=APP_URL`, sends an allowlisted `Origin` header, and routes the bare-handler invocation through `withCors` — so `ACAO === APP_URL` (exact-origin equality) without relaxing the assertion.
- Restored the full offline edge suite to green: the 6 pre-identified failures from Wave 1's origin-reflection rewrite are gone; `deno task test:ci` = 727 passed / 0 failed / 11 ignored.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap the three Stripe Deno.serve entrypoints with withCors** - `1c0c8eda` (feat)
2. **Task 2: Reconcile the three Stripe test files' ACAO assertions to origin reflection** - `9fcf7221` (test)

**Plan metadata:** (final docs commit — this SUMMARY + STATE)

## Files Created/Modified
- `supabase/functions/create-checkout-session/index.ts` - Added `withCors` import; serve site now `Deno.serve((req) => withCors(req, 'user', () => handleCreateCheckoutSession(req)))`.
- `supabase/functions/create-checkout-session/index.test.ts` - Imported `withCors`; `setTestEnv`/`clearEnv` manage `ALLOWED_ORIGINS`; `makeReq` gained an `origin?` option; OPTIONS + 3 PRICE-03 ACAO cases route through `withCors` with `Origin: APP_URL`.
- `supabase/functions/create-payment-intent/index.ts` - Added `withCors` import; serve site wrapped.
- `supabase/functions/create-payment-intent/index.test.ts` - Imported `withCors`; added an `APP_URL` constant; env helpers manage `ALLOWED_ORIGINS`; `buildRequest` gained an `origin?` option; OPTIONS `assertExists` case routes through `withCors`.
- `supabase/functions/create-stripe-portal/index.ts` - Added `withCors` import; serve site wrapped.
- `supabase/functions/create-stripe-portal/index.test.ts` - Imported `withCors`; env helpers manage `ALLOWED_ORIGINS`; OPTIONS ACAO case routes through `withCors` with `Origin: APP_URL`.

## Decisions Made
- **Serve-level wrap only** (per `why_these_differ`): the handlers' inline `corsHeaders({type:"user"})` calls are intentionally left req-less; the outer `withCors` overlays origin-aware CORS in prod. Avoids churn across many response sites.
- **Single-quoted `'user'` in the call** to match both this plan's `must_haves` contract (`contains: "withCors(req, 'user'"`) and the established Wave-2 pattern (all 18 prior wraps use single quotes); imports keep the file's double-quote style. No `deno fmt --check` is in the `verify:baseline` gate, so this is style-stable.
- **Coverage preserved, not relaxed** (T-01-06-03): every ACAO assertion still asserts exact-origin equality; only the invocation path changed to the real prod wrapper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran Task-2 verification with `--allow-all` instead of the plan's `--allow-env --allow-read`**
- **Found during:** Task 2 (test verification)
- **Issue:** The plan's automated verify command (`deno test … --no-check --allow-env --allow-read`) omits `--allow-net`. All three `index.ts` files call `Deno.serve()` at module scope (the production entry point, pre-existing), which requires net access — so that exact command aborts with `NotCapable: Requires net access` before any assertion runs, for both the old and new code.
- **Fix:** Verified with `--allow-all`, the canonical permission set used by `supabase/functions` `deno task test:ci` (the command `verify:baseline` actually runs). No code/scope change — only the verification flags.
- **Files modified:** none (verification-command adjustment only)
- **Verification:** Three-file run = 41 passed / 0 failed; full `deno task test:ci` = 727 passed / 0 failed / 11 ignored.
- **Committed in:** n/a (no file change)

**2. [Rule 3 - Blocking] Added an `APP_URL` constant to create-payment-intent/index.test.ts**
- **Found during:** Task 2 (env-helper reconciliation)
- **Issue:** The plan says to "reuse the existing `APP_URL` constant as the single allowlisted origin", but unlike the other two Stripe test files, create-payment-intent had no `APP_URL` constant — it inlined `"http://localhost:8080"` in `setTestEnv`.
- **Fix:** Introduced `const APP_URL = "http://localhost:8080";` and referenced it from `setTestEnv` (`APP_URL` + `ALLOWED_ORIGINS`) and the OPTIONS case's `Origin` header — preserving the original value, just named.
- **Files modified:** supabase/functions/create-payment-intent/index.test.ts
- **Verification:** payment-intent suite green; OPTIONS `assertExists(ACAO)` passes (Origin allowlisted).
- **Committed in:** `9fcf7221` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both are mechanical reconciliations required to execute the plan against the actual suite/files; no behavioral change and no scope creep. ACAO assertions preserved exactly.

## Issues Encountered
- The three test files emit expected `console.error` lines (`subscription-swap-failed`, `payment-intent-creation-failed`) during the deliberate failure-path cases; these are the handlers' internal structured logging, not test failures — all assertions pass.

## User Setup Required
None - no new external service configuration. (The `ALLOWED_ORIGINS` operator-config + redeploy requirement was already raised in 01-01's USER-SETUP and is unchanged here.)

## Next Phase Readiness
- All three Stripe billing functions now emit origin-aware CORS end-to-end (success/error/preflight); the Wave-3 CORS audit can treat them as compliant.
- This was the only place in the phase where function-level unit tests asserted ACAO; no further test reconciliation is expected for the remaining Wave-2/3 work.
- No blockers. Effective prod CORS still depends on the operator setting `ALLOWED_ORIGINS` per environment and redeploying (01-01 carryover, not a regression).

## Self-Check: PASSED

- Files verified on disk: all 6 source/test files + 01-06-SUMMARY.md present.
- Commits verified: `1c0c8eda` (Task 1), `9fcf7221` (Task 2), `d80b3324` (docs) all in git log.
- Invariant: `withCors(req, 'user'` = 1 in each of the three Stripe `index.ts` (>=1 each).
- Tests: three-file run 41 passed / 0 failed; full `deno task test:ci` = 727 passed / 0 failed / 11 ignored (the 6 pre-identified ACAO failures resolved).

---
*Phase: 01-cross-origin-error-contract-foundation*
*Completed: 2026-06-27*
