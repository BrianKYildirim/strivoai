# Phase 31 — Operator Staging Verification (Plan 31-04, Task 4)

**Date:** 2026-05-20
**Target:** Supabase **staging** project (ref `cimjltzovkahkqecpwgi`)
**Plan:** 31-04 (`autonomous: false`) — gated refund-proof + idempotency suite (MER-05, MER-06)
**Operator:** strivolife@gmail.com

## Method

Ran the full edge-test suite via `scripts/run-edge-tests.ps1` with the gated staging
path enabled:

```powershell
# staging Edge Function env: MERIT_TEST_FORCE_REFUNDABLE_ERROR=529
$env:DENO_TEST_SUPABASE_REMOTE = 1
$env:SUPABASE_URL = "<staging URL — ref cimjltzovkahkqecpwgi>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<staging service-role key>"
.\scripts\run-edge-tests.ps1
```

## Result — PASS

```
ok | 244 passed | 0 failed (5s)
Skipping tier-validation harness (set RUN_TIER_VALIDATION=1 to run)
All edge function tests passed.
```

- The refund tests **executed against staging** (operator-confirmed real execution,
  not the `SKIP` guard path) and passed.
- **MER-05** — gateway exhaustive refund-on-failure across every refundable class
  + 7 per-path smoke tests (5 sync + 2 async): each forced-error path restored the
  balance to seed.
- **MER-06** — `refund_merits` double-call replay: first call refunds + restores
  balance; second call returns `already_refunded` with zero balance mutation.

## First attempt (superseded) — environmental, not a refund defect

An earlier run reported `229 passed | 15 failed`, including the refund tests. Two
unrelated environmental causes, both since resolved:

1. **Stale runner reference.** `scripts/run-edge-tests.ps1` referenced
   `analyze-resume/legacy-unchanged.test.ts`, deleted in `604646d` (phase 30-05),
   which aborted the suite with a not-found import. Fixed in `ece7e54` — dead line
   removed; suite runs clean. (Also a `RUN_TIER_VALIDATION=1` shell var triggered
   the live Anthropic harness, failing on a missing `ANTHROPIC_API_KEY` — unrelated
   to refunds; unset for the verifying run.)
2. **Force-flag propagation.** On the first attempt the staging function had not yet
   picked up `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, so refundable paths did not force
   the expected error. Once propagated, the gated run passed clean (244/0).

No changes were made to `merit-gateway.ts` or
`migrations/20260415000000_merit_rpcs.sql` — Plan 31-04 is verify-only (D-15/D-16).
The tests prove the existing shipped refund behavior.

## T-31-11 closeout (CRITICAL)

`MERIT_TEST_FORCE_REFUNDABLE_ERROR` was **removed** from the staging Edge Function
env (Supabase dashboard → Edge Functions secrets) after the verifying run.
Confirmed by operator. Staging analyses are no longer force-failed.

## Requirements verified

- **MER-05** — refund-on-failure across all refundable classes + every endpoint path ✅
- **MER-06** — `refund_merits` idempotency (replay returns `already_refunded`, no mutation) ✅
