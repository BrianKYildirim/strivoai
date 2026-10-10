---
phase: 31-optimistic-ui-refund-verification
plan: 02
subsystem: edge-functions/_shared
tags: [fault-injection, refund-verification, staging-gate, anthropic]
requires:
  - "_shared/anthropic.ts invokeAnthropicText/streamAnthropicText chokepoints"
provides:
  - "Staging-gated MERIT_TEST_FORCE_REFUNDABLE_ERROR fault-injection seam (sync + stream)"
  - "A4 confirmation: all 4 non-resume sync functions route through the chokepoint"
affects:
  - "Plan 31-04 refund verification suite (single toggle across 7 paths)"
tech-stack:
  added: []
  patterns:
    - "Module-scope env-read helper (merit-gateway.ts:27-28 convention)"
    - "Belt-and-suspenders staging host gate (ref substring OR STRIVO_ENV sentinel)"
key-files:
  created: []
  modified:
    - "supabase/functions/_shared/anthropic.ts"
decisions:
  - "Configurable status via 3-digit regex parse; non-numeric (e.g. 'true') defaults to 529"
  - "Production ships the path inert (returns null) — defense-in-depth against a left-set flag"
metrics:
  duration: "~10 min"
  completed: 2026-05-19
requirements: [MER-05]
---

# Phase 31 Plan 02: Staging-Gated Refund Fault-Injection Seam Summary

Added a staging-gated `MERIT_TEST_FORCE_REFUNDABLE_ERROR` fault-injection branch to `_shared/anthropic.ts` at both the sync (`invokeAnthropicText`) and streaming (`streamAnthropicText`) chokepoints, and confirmed the A4 assumption that all 4 non-resume sync edge functions route through this single seam — the one toggle Plan 31-04 drives across all 7 refund paths.

## What Was Built

- **`refundableErrorOverride()` module helper** (D-12/D-13): reads `MERIT_TEST_FORCE_REFUNDABLE_ERROR`; returns `null` when unset. Staging gate reads `SUPABASE_URL` and tests `url.includes('cimjltzovkahkqecpwgi') || STRIVO_ENV === 'staging'` — returns `null` on any non-staging host so the path is inert in production. Status parsed from a 3-digit value, defaulting to `529` for non-numeric flags like `true`. Returns `{ status, error: 'forced-refundable-error' }`.
- **Two call-sites**: top of `invokeAnthropicText` (returns `{ ok: false, status, error }`) and top of `streamAnthropicText` (yields `{ type: 'error', status, message }` then returns). Stream twin is required because resume analysis streams (Pitfall 2).
- **`STAGING_HOST` module const** = `'cimjltzovkahkqecpwgi'`.
- Code comment distinguishes the two fault-injection flags. The existing `AI_FORCE_FAILURE` two-key branch (referenced by `anthropic.test.ts`) is left entirely untouched.

## A4 Confirmation (Task 1)

All 4 non-resume sync functions route through the Anthropic chokepoint AND use `withMerits(`:

| Function | Chokepoint | withMerits |
|----------|-----------|------------|
| analyze-career | CHOKEPOINT-OK | OK |
| grade-linkedin | CHOKEPOINT-OK | OK |
| recruiting-lens | CHOKEPOINT-OK | OK |
| interview-prep-analyze | CHOKEPOINT-OK | OK |

**Result: A4 CONFIRMED — no divergence.** The single toggle covers all 5 sync + 2 async paths (analyze-resume already confirmed via merit-branch.test.ts per RESEARCH). Plan 31-04's per-path smoke tests will fire on every endpoint.

## Verification

- Task 1 A4 grep: `CHOKEPOINT-OK` for all 4 functions, exit 0.
- Task 2 grep assertion: `callsites 3` (1 def + 2 call-sites), `stagingGate true`, `aiForceFailureIntact true`, exit 0.
- `deno check supabase/functions/_shared/anthropic.ts`: no type errors.

## Threat Model Coverage

- **T-31-03** (prod DoS via left-set flag): mitigated — host gate returns `null` off-staging.
- **T-31-04** (vacuous-pass on URL rotation): mitigated — belt-and-suspenders gate (ref substring OR `STRIVO_ENV` sentinel); Plan 31-04 additionally asserts the forced error returns before asserting refund.
- **T-31-05** (flag left set on staging): accepted — operational UNSET step in `user_setup` / 31-04 playbook; staging-only blast radius.

## Deviations from Plan

None - plan executed exactly as written.

Note: `deno check` regenerated `supabase/functions/deno.lock` (modified, not committed — out of scope for this plan and a generated lockfile).

## Self-Check: PASSED

- FOUND: supabase/functions/_shared/anthropic.ts (modified, callsites/gate assertion passes)
- FOUND commit e0ff4af (Task 2)
- A4 verification recorded above (Task 1 read-only, no commit)
