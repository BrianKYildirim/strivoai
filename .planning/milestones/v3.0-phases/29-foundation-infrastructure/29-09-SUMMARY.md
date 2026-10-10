---
phase: 29
plan: 09
subsystem: merits
tags: [phase-29, merits, idempotency, testing, deno, live-db, TEST-02, NFR-07]
dependency_graph:
  requires:
    - "supabase/migrations/20260512000003_merit_transactions_idempotency.sql (29-04 — merit_transactions.idempotency_key + partial UNIQUE index + 4-arg check_and_deduct_merits RPC)"
    - "supabase/functions/_shared/merit-gateway.raw.test.ts (live-DB test pattern reference — npm:@supabase/supabase-js@2 dynamic import + fresh-client + env-gated)"
    - "supabase/migrations/20260415000000_merit_rpcs.sql (merit_feature_costs seed — resume_analysis/free = 3 merits)"
    - "supabase/migrations/20260414000000_merit_ledger_foundation.sql (user_merits + merit_transactions schema; profiles FK to auth.users)"
  provides:
    - "supabase/functions/_shared/merit-idempotency.test.ts — canonical TEST-02 / NFR-07 behavioral gate authored, registered, not yet executed"
    - "scripts/run-edge-tests.ps1 entry: _shared/merit-idempotency.test.ts (skips by default; opt-in via DENO_TEST_SUPABASE_REMOTE=1)"
  affects:
    - "Plan 29-10 (final blocking wave) — runs this suite with DENO_TEST_SUPABASE_REMOTE=1 against staging and attaches evidence to the phase verification artifact"
    - "Phase 31 (Optimistic UI) — frontend crypto.randomUUID() idempotency_key is end-to-end-proven by this suite before UI work begins"
tech_stack:
  added: []
  patterns:
    - "Env-gated live-DB Deno test (DENO_TEST_SUPABASE_REMOTE=1) — opt-in default-skip pattern that mirrors merit-gateway.raw.test.ts / merit-gateway.rate.test.ts / merit-gateway.perf.test.ts"
    - "Fresh-client per call via dynamic npm:@supabase/supabase-js@2 import — proves writes from one client are visible to other clients with zero sleep / polling"
    - "Service-role Auth Admin createUser → seed user_merits → teardown via auth.admin.deleteUser (auth.users.id CASCADE deletes profiles → user_merits → merit_transactions)"
    - "Random email suffix (crypto.randomUUID().slice(0,8)) on the fixture user so concurrent CI runs do not collide on auth.users.email UNIQUE"
    - "Skip-guard self-check test — always-on assertion that the file is exercised by the unit-test pass even when DENO_TEST_SUPABASE_REMOTE is unset"
key_files:
  created:
    - "supabase/functions/_shared/merit-idempotency.test.ts"
    - ".planning/phases/29-foundation-infrastructure/29-09-SUMMARY.md"
  modified:
    - "scripts/run-edge-tests.ps1 (register new test file in the deno test arg list)"
decisions:
  - "Gating env var: DENO_TEST_SUPABASE_REMOTE=1 (not DENO_TEST_SUPABASE_LOCAL). Plan 29-10 hits the live staging Supabase project — the existing _LOCAL gate is reserved for the local supabase-cli stack used by .raw/.rate/.perf suites. Distinct env var prevents the local suites from accidentally pointing at staging."
  - "Fixture user provisioned via auth.admin.createUser with email_confirm:true and a randomly-suffixed email. Rejected the alternative (fixed UUID 00000000-...-0000000096) because (a) profiles.id REFERENCES auth.users(id) blocks raw inserts, (b) parallel CI runs would clobber each other, (c) a leaked fixture user lingers forever — the random suffix + auth.admin.deleteUser CASCADE leaves zero residue."
  - "Starting balance = 100, parallel fan-out = 10, cost = 3 (resume_analysis/free). 100 ≫ 10 × 3, so even a fully-broken absorber that double-debited every concurrent caller would not hit insufficient_merits — that early-return would otherwise mask the real bug as a `success=false` instead of surfacing as a balance assertion failure."
  - "Sequential test asserts the SAME transaction_id across winner + replay. The RPC returns metadata->>'deduction_id' as transaction_id in both the entry-time pre-check (short-circuit) and the EXCEPTION arm (race absorber) — equality is the load-bearing NFR-07 invariant."
  - "Parallel test asserts exactly 1 winner + (N-1) losers by partitioning on `already_deducted !== true`. The winner-path response has no already_deducted field; both the pre-check short-circuit and the EXCEPTION arm set already_deducted=true."
  - "Plan only AUTHORS the test — execution against staging is deferred to Plan 29-10 per the wave-prerequisites spec. Local deno runs default-skip with a logged hint pointing at the env vars needed to opt in."
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-12
  tasks_completed: 1
  files_changed: 2
---

# Phase 29 Plan 09: merit_transactions Idempotency Behavioral Gate Summary

**One-liner:** Canonical TEST-02 + NFR-07 regression authored — a gated Deno suite that proves the 29-04 4-arg `check_and_deduct_merits` RPC absorbs duplicate `idempotency_key` submissions under both sequential replay and parallel retry-storm conditions. Plan 29-10 executes it against staging.

## What Shipped

One new test file plus a single-line registration in the existing PowerShell runner. No production code was modified; no migrations were applied.

### 1. `supabase/functions/_shared/merit-idempotency.test.ts` (new)

Three Deno tests, all `--allow-all`:

1. **`TEST-02 sequential`** — provisions a fresh auth user via `auth.admin.createUser`, seeds `user_merits` with `subscription_balance = 100`, calls the 4-arg RPC twice with the same `crypto.randomUUID()` idempotency_key. Asserts:
   - First call returns `{ success: true, transaction_id: <uuid>, remaining_balance: 97, deducted_from: { subscription: 3, shop: 0 } }`, no `already_deducted` field.
   - Balance reads back as 97 on a fresh client (zero polling).
   - Exactly one `merit_transactions` row exists with `idempotency_key = <uuid>` and `source = 'feature-deduct'`.
   - Second call returns `{ success: true, transaction_id: <SAME uuid>, already_deducted: true }`.
   - Balance is **still** 97 (no double-debit).
   - Still exactly one feature-deduct ledger row (no shadow entry).

2. **`NFR-07 retry-storm`** — provisions a fresh user, fires `PARALLEL_FAN_OUT = 10` `Promise.all`-coordinated calls with the same idempotency_key. Asserts:
   - Every call returns `success: true` (no `tier_locked`, no `insufficient_merits`).
   - All 10 returned `transaction_id` values collapse to a single distinct UUID.
   - Exactly 1 winner (`already_deducted !== true`) and exactly 9 losers (`already_deducted === true`).
   - Final balance is `STARTING_BALANCE - TEST_COST` (97), proving the inner `BEGIN ... EXCEPTION WHEN unique_violation` block absorbed the race.
   - Exactly 1 `merit_transactions` row exists for the idempotency_key, proving the partial UNIQUE index `merit_transactions_idempotency_key_unique` blocked the duplicate INSERT.

3. **`merit-idempotency: skip-guard self-check`** — always-on test that logs the opt-in instructions and passes. Confirms the file is exercised by `scripts/run-edge-tests.ps1` even when the gating env vars are unset.

### 2. `scripts/run-edge-tests.ps1` (modified)

Added `_shared/merit-idempotency.test.ts` to the `deno test --allow-all` arg list, immediately after `_shared/merit-gateway.raw.test.ts` — keeping all live-DB suites grouped together.

## Gating Contract

```text
DENO_TEST_SUPABASE_REMOTE=1
SUPABASE_URL=https://<staging-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Without `DENO_TEST_SUPABASE_REMOTE=1`, the two behavioral tests log a SKIP hint and return cleanly. The third (skip-guard) test always passes.

## Plan Boundary

Plan 29-09 ends at "test authored + registered + locally skip-clean". The actual run against staging is owned by **Plan 29-10**, which:

1. Sets the three env vars.
2. Runs `.\scripts\run-edge-tests.ps1`.
3. Attaches the test output to the phase verification artifact.
4. Tears down via `auth.admin.deleteUser` (the test handles this in `finally`).

If 29-10 detects double-debit or a missing already_deducted shape, that is a **substrate failure** in 29-04 — not a test bug. The test fixture is fully deterministic.

## RPC Contract Coverage

The 4-arg `check_and_deduct_merits` response shapes asserted here:

| Caller path | Shape |
| --- | --- |
| Winner (first call) | `{ success: true, transaction_id, remaining_balance, deducted_from: { subscription, shop } }` — no `already_deducted` |
| Entry-time pre-check hit | `{ success: true, transaction_id: <prior>, already_deducted: true }` |
| EXCEPTION arm (race absorbed) | `{ success: true, transaction_id: <winner's>, already_deducted: true }` |

Tests 1 and 2 jointly exercise all three paths. The two `already_deducted: true` paths return shapes that are byte-identical from the caller's perspective — the test does not need to distinguish them, and indeed cannot, which is by design (the contract is "one winner, the rest are idempotent replays").

## Deviations from Plan

None — plan executed exactly as written. The test author task closed in a single commit (`5c6edc2`) with both the test file and the runner registration; the plan's "Files to create/modify" list described that grouping.

The plan summary's wave-prerequisites note ("Wave prerequisites already on staging: merit_transactions.idempotency_key + 4-arg check_and_deduct_merits (29-04)") was honoured by reading the 29-04 migration directly from the staging branch in this worktree (via `git show staging:<path>`) to confirm the exact RPC signature and response shapes the test asserts against.

## Self-Check

- File exists at `supabase/functions/_shared/merit-idempotency.test.ts`: **FOUND** (392 insertions in commit `5c6edc2`).
- File exists at `scripts/run-edge-tests.ps1` with new entry: **FOUND** (`+  _shared/merit-idempotency.test.ts \``).
- SUMMARY.md exists at worktree-relative `.planning/phases/29-foundation-infrastructure/29-09-SUMMARY.md`: **FOUND** (this file).
- Commit `5c6edc2` reachable: **FOUND** (`git show --stat HEAD` confirms).

## Self-Check: PASSED

## Commits

- `5c6edc2` — `test(29-09): add merit_transactions idempotency live-DB regression (TEST-02 + NFR-07)`
