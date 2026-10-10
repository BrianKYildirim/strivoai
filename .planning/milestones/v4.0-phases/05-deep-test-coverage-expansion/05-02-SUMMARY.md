---
phase: 05-deep-test-coverage-expansion
plan: 02
subsystem: testing
tags: [deno, deno-test, test:ci, failure-branches, merit-gateway, refund, isRefundableAnthropicError, analyze-resume, analyze-career, budget-cap, tier-gating, pattern-A, pattern-C, pattern-D, characterization-test]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest+deno-offline+Playwright), deno.json test:ci allowlist, v4.0-baseline tag, AI_TEST_MODE/AI_FORCE_FAILURE compound seam, TEST-07 mock-RPC ledger discipline"
  - phase: 05-deep-test-coverage-expansion (plan 01)
    provides: "grown test:ci allowlist (566 passed|0 failed baseline), 05-SUSPECTED-BEHAVIOR.md D-08 register, harvest-then-register discipline"
provides:
  - "analyze-resume failure-branch coverage: EXECUTED merit refund-on-AI-failure (529->refundable->ledger restored) + idempotency + non-refundable 4xx/parse classification, plus Pattern-A source-read of the inline-serve 402/429/bad-input/auth branches"
  - "analyze-career failure-branch coverage: Pattern-C over-FREE-ceiling assertThrows + FREE_SINGLE_CALL_MAX_TOKENS characterization, EXECUTED merit refund (analyze_career fixtureKey) per-tier cost symmetry, Pattern-A source-read of tier-gating/input-cap/412/auth/429/402 branches"
  - "deno test:ci grown 566 -> 587 passed | 0 failed (+21 cases: +9 resume, +12 career)"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, dependency-hygiene, database-cleanup, performance-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern D (EXECUTED seam): exercise the merit deduct/refund/idempotency + AI-failure->refundable classification the inline-serve handler COMPOSES, via _shared/merit-gateway.ts + _shared/anthropic.ts and an in-memory mock-RPC ledger (TEST-07 discipline) — env-before-import, AI_FORCE_FAILURE compound gate, AI_FORCE_FAILURE restored in test tail, no MERIT_SYSTEM_ENABLED set"
    - "Pattern A (source-read): assert inline-serve 402/429/timeout/bad-input/auth branches as WIRED via regex/segment match against index.ts with the Windows leading-slash strip"
    - "Pattern C (logic-extraction): replicate CAREER_CALL_CONFIGS + the boot-time budget invariant against the REAL getMaxOutput ceiling and drive the over-budget assertThrows branch; COMPLEMENT (do not duplicate) the existing index.test.ts cases"
    - "Pattern-A characterization correctness: assert the ACTUAL wired auth helper (requireInternalOrUserAuth) rather than a plan-wording string (requireAuth(req,{type:'user'})) that belongs to a different handler"

key-files:
  created:
    - "supabase/functions/analyze-resume/failure-branches.test.ts"
    - "supabase/functions/analyze-career/failure-branches.test.ts"
  modified:
    - "supabase/functions/deno.json"

key-decisions:
  - "Assert the ACTUAL auth helper requireInternalOrUserAuth in BOTH source-read suites, not the plan key_links string requireAuth(req,{type:'user'}). That literal belongs to grade-linkedin; analyze-resume + analyze-career both wire requireInternalOrUserAuth (JWT user OR internal worker secret). Pattern A's mandate is to assert CURRENT behavior — using the stale string would have been a false RED. Recorded as a deviation."
  - "Fixed an over-literal career source-read assertion: `!source.includes('rawBody.tier')` was a false RED because the substring appears inside the D-14 SECURITY COMMENT ('never trust rawBody.tier'). Re-pinned to assert the server-side resolvedTier derivation + no value-assignment (`= rawBody.tier`). Characterizes the true current contract (server-side tier, fail-closed to free)."
  - "career file COMPLEMENTS analyze-career/index.test.ts: index.test.ts already drives the per-tier budget SUMS + one over-ELITE-ceiling throw, so this file adds the over-FREE-ceiling throw + the FREE_SINGLE_CALL_MAX_TOKENS-vs-ceiling characterization — no duplicate cases."
  - "No D-08 escalation. The EXECUTED refund path proves no merit-accounting loss: forced 529 -> isRefundableAnthropicError true -> ledger fully restored, refund idempotent. Both index.ts files byte-identical vs v4.0-baseline (T-05-04 control verification clean)."

requirements-completed: [TEST-03, TEST-05]

# Metrics
duration: 22min
completed: 2026-06-19
---

# Phase 05 Plan 02: Resume & Career Failure-Path Coverage Summary

**Deepened failure/error-path coverage for the two business-critical flows — analyze-resume gets the EXECUTED merit deduct/refund-on-AI-failure/idempotency + AI-failure->refundable classification seam, analyze-career gets the Pattern-C over-budget throw + FREE_SINGLE_CALL_MAX_TOKENS characterization + the executed career merit seam — both backed by Pattern-A source-reads of their inline-serve 402/429/bad-input/auth branches, growing the offline gate 566 -> 587 passed | 0 failed with zero product-source change.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Task 1 (analyze-resume, +9 cases):** EXECUTED Pattern-D seam — forced-AI-failure 529 classified refundable by the real `isRefundableAnthropicError`, mock-RPC ledger fully restored, refund idempotency (second refund -> `already_refunded`, no balance change), and NON-refundable classification of 4xx + parse-failure messages (with the 5xx/408/AbortError refundable boundary). Pattern-A source-read of the inline-serve handler: `withMerits('resume_analysis')` unconditional (no `MERIT_SYSTEM_ENABLED` gate), `MeritRefundable` on AI/parse failure, `< 50`-char bad-input 400, `requireInternalOrUserAuth` + 401, 402/429 short-circuit in the parallel-call path, per-tier input cap + timeout.
- **Task 2 (analyze-career, +12 cases):** Pattern-C complementary over-FREE-ceiling `assertThrows` (push the base call past the 12000 free ceiling) + `FREE_SINGLE_CALL_MAX_TOKENS === 4000` within-ceiling characterization (imported directly from `_shared/career-prompts.ts`, not relocated). EXECUTED Pattern-D merit seam for the `analyze_career` fixtureKey (529 refundable -> ledger restored) plus per-tier cost symmetry (free=3 / pro=2 deduct + full refund). Pattern-A source-read: `withMerits('career_compass')` + `MeritRefundable`, the per-tier output-budget throw, `getMaxInputChars('careerCompass')` input cap, server-side `resolvedTier` (no client tier), `requireInternalOrUserAuth`, 412 pre-merit short-circuit + 400 bad-input, 429/402 downstream branches.
- **Gate:** both files registered on `test:ci` in the same change as their creation; full gate 566 -> 587 passed | 0 failed. `verify:baseline` green (vitest passed, deno 587/0, Playwright 5 passed + 1 quarantine-skip).

## Executed-vs-Source-Read Split

| File | EXECUTED (Pattern C/D) | WIRED (Pattern A source-read) | fixtureKey |
|------|------------------------|-------------------------------|------------|
| `analyze-resume/failure-branches.test.ts` | refund-on-AI-failure (529->refundable->ledger restored), refund idempotency, non-refundable 4xx/parse classification + refundable 5xx/408/AbortError boundary (3 cases) | withMerits/resume_analysis unconditional (no MERIT_SYSTEM_ENABLED), MeritRefundable on AI/parse failure, <50 bad-input 400, requireInternalOrUserAuth + 401, 402/429 short-circuit, per-tier input cap + timeout (6 cases) | `analyze_resume` |
| `analyze-career/failure-branches.test.ts` | over-FREE-ceiling assertThrows, current-config no-throw, FREE_SINGLE_CALL_MAX_TOKENS=4000 within ceiling, forced-529 refund->ledger restored, per-tier cost symmetry (free=3/pro=2) (5 cases) | withMerits/career_compass + MeritRefundable + parse-failure, per-tier output-budget throw + getMaxOutput, getMaxInputChars('careerCompass') input cap, server-side resolvedTier, requireInternalOrUserAuth, 412+400, 429/402 (7 cases) | `analyze_career` |

## Deviations from Plan

### 1. [Rule 1 - Bug / characterization-correctness] Plan key_links auth string is for a different handler

- **Found during:** Tasks 1 and 2 (writing the Pattern-A auth-reject assertions).
- **Issue:** The plan's `key_links` / acceptance criteria literally referenced `requireAuth(req, { type: 'user' })`. That exact string is the **grade-linkedin** form (Pattern-A analog source). Both `analyze-resume/index.ts` (L9, L637) and `analyze-career/index.ts` (L9, L793) ACTUALLY wire `requireInternalOrUserAuth(req)` (JWT user OR internal worker secret) — never the bare `requireAuth(req,{type:'user'})`. Asserting the plan's string would have been a false RED.
- **Fix:** Asserted the ACTUAL wired helper `requireInternalOrUserAuth` in both source-read suites (Pattern A's mandate is to assert CURRENT behavior). No product change.
- **Files modified:** both new test files. **Commits:** `b25584d`, `fce80a5`.

### 2. [Rule 1 - Bug] Over-literal `rawBody.tier` negative assertion was a false RED

- **Found during:** Task 2 isolation run (1 failed).
- **Issue:** `!source.includes("rawBody.tier")` failed because the substring lives inside the **D-14 security comment** in `analyze-career/index.ts` L803 (`// D-14: Tier resolved server-side -- never trust rawBody.tier.`) — i.e. the comment that DOCUMENTS the correct behavior, not a violation.
- **Fix:** Re-pinned to assert the true current contract: server-side `const resolvedTier` derivation defaulting to `'free'` (fail-closed), and no value-assignment form (`= rawBody.tier` / `= body.tier`). Now correctly characterizes "tier resolved server-side, never from the client body".
- **Files modified:** `analyze-career/failure-branches.test.ts`. **Commit:** `fce80a5` (fixed before commit).

Otherwise the plan executed as written: env-before-import + AI_FORCE_FAILURE compound gate + AI_FORCE_FAILURE restored in the test tail + no `MERIT_SYSTEM_ENABLED` set (Pitfall 4); synthetic-placeholder env only (T-05-03); allowlist-append in the same change; complement-not-duplicate of `index.test.ts`; no source relocation.

## D-08 Suspected-Behavior Register

No new pin-and-log rows; **no escalation**. The EXECUTED merit-refund path is the business-critical surface (T-05-04 control verification) and it is clean: forced 529 -> `isRefundableAnthropicError` returns true -> mock-RPC ledger balance fully restored -> refund idempotent. Both `analyze-resume/index.ts` and `analyze-career/index.ts` (and `_shared/career-prompts.ts`) are byte-identical vs `v4.0-baseline` — no merit-accounting regression to escalate. SB-05-01 / SB-05-02 from Plan 05-01 remain the only logged observations.

## Task Commits

1. **Task 1: analyze-resume failure/merit-refund branch coverage** - `b25584d` (test)
2. **Task 2: analyze-career budget-cap + tier-gating + failure-path coverage** - `fce80a5` (test)

## Issues Encountered

- The two false-RED source-read assertions above (auth-helper string; `rawBody.tier` in a comment) — both were test-authoring mismatches resolved by pinning ACTUAL current behavior, not product issues. No fix-attempt-limit pressure (resolved on the first correction each).

## Next Phase Readiness

- The business-critical failure surfaces (resume + career merit refund, budget caps, tier gating) are now characterized on the offline gate for Plans 05-03..05-07 and Phases 6/8/9 to lean on.
- No blockers.

## Self-Check: PASSED

- Both created files verified present on disk: `analyze-resume/failure-branches.test.ts`, `analyze-career/failure-branches.test.ts`.
- Both task commits verified in git history: `b25584d`, `fce80a5`.
- `deno task test:ci` -> 587 passed | 0 failed (566 + 21); both new files run on the gate.
- `verify:baseline` green (vitest + deno 587/0 + Playwright 5 passed + 1 quarantine-skip).
- Zero product-source change: `git diff v4.0-baseline -- analyze-resume/index.ts analyze-career/index.ts _shared/career-prompts.ts` all EMPTY.

---
*Phase: 05-deep-test-coverage-expansion*
*Completed: 2026-06-19*
