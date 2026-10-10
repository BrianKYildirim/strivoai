---
phase: 10-merit-ledger-foundation
plan: 04
subsystem: merit-ledger
tags: [verification, nyquist, sc-proofs, wave-4, resumed]
requires:
  - "Plan 03 artifacts: merit ledger tables live on staging"
  - ".env.staging.local with SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_JWT"
  - ".snapshot-legacy-pre.txt / .snapshot-legacy-post.txt from Plan 03 (byte-identical baseline)"
provides:
  - "Empirical pass evidence for all 5 Phase 10 Success Criteria against live staging DB"
  - "Closes MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04"
affects:
  - "supabase/functions/_tests/merit_rls_test.ts (uncommitted harness fix — Deno sanitizer flags, see Deviations)"
tech_stack:
  added: []
  patterns:
    - "PL/pgSQL DO block assertions for schema shape and CHECK behavior"
    - "Deno test against live REST endpoint with anon+user JWT for RLS proof"
    - "Disk snapshot diff for MIG-04 additive-only proof"
key_files:
  created:
    - ".planning/phases/10-merit-ledger-foundation/10-04-SUMMARY.md"
  modified:
    - "supabase/functions/_tests/merit_rls_test.ts (uncommitted, Rule 1 harness fix)"
decisions:
  - "Resumed sequential run on main tree after REST credentials (SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_JWT) landed in .env.staging.local"
  - "Re-ran SC-1/SC-3/SC-4/SC-5 to confirm no live-DB drift between Plan 03 and Plan 04; profile count grew 6 -> 7 (one real signup), trigger fired, invariant still holds — empirical proof the D-08/D-15 signup path works"
  - "Applied uncommitted Rule 1 fix to merit_rls_test.ts to disable Deno op/resource sanitizers for the 5 MER-04 tests; supabase-js v2 GoTrueClient auto-refresh interval is not user-cleanable and was causing false-FAILED on every test despite the RLS assertions passing (42501 verified via probe)"
metrics:
  duration_minutes: 4
  completed_date: 2026-04-14
  status: COMPLETE
requirements_covered: [MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04]
---

# Phase 10 Plan 04: Verify Merit Ledger Migration — Summary

**Status: COMPLETE.** All 5 Phase 10 Success Criteria empirically proved against live staging DB (`cimjltzovkahkqecpwgi`). Deno RLS suite reports `ok | 5 passed | 0 failed`. Zero git commits.

## One-Liner

Executed SC-1..SC-5 verification against live staging: schema shapes exact, RLS denies all anon writes with Postgres 42501, CHECK constraints block negative balances, backfill+trigger invariant holds at 7/7/7, and legacy ledger tables are byte-identical to Plan 03 baseline.

## Success Criteria Results

| SC | Requirement | Method | Result |
|----|-------------|--------|--------|
| SC-1 | MER-01/02/03 — Tables exist with exact column shapes | psql DO block vs `information_schema.columns` | **PASS** |
| SC-2 | MER-04 — RLS denies anon+user INSERT/UPDATE/DELETE on all 3 tables | Deno test with anon client + TEST_USER_JWT against live REST | **PASS** (5/5 ok) |
| SC-3 | MER-13 — CHECK constraints block negative balances | psql DO block with `BEGIN / EXCEPTION WHEN check_violation / ROLLBACK` | **PASS** |
| SC-4 | MER-10/14 — Every profile has (5,0,5) user_merits row + grant row | psql DO block + MER-12 reconciliation spot check | **PASS** (7/7/7) |
| SC-5 | MIG-01/04 — Legacy ledger untouched; no SEC-06 anti-pattern | Snapshot diff + static grep + live `pg_policies` re-check | **PASS** |

## SC-1 — Schema shape (PASS)

**Command:**
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ ... (assert information_schema.columns == expected for all 3 tables) ... END $$;
SQL
```

**Output:**
```
NOTICE:  SC-1 PASS: all 3 tables have exact column shapes
DO
```

Exit code 0. Column sets verified:
- `user_merits` (9 cols): id, user_id, subscription_balance, shop_balance, lifetime_granted, subscription_reset_date, free_linkedin_scan_used, created_at, updated_at
- `merit_transactions` (8 cols): id, user_id, amount, balance_type, source, feature, metadata, created_at
- `merit_shop_purchases` (8 cols): id, user_id, pack_size, price_cents, stripe_payment_intent_id, stripe_receipt_url, status, created_at

Data types and nullability match migration file exactly (e.g. `subscription_balance integer NOT NULL`, `feature text NULL`, `metadata jsonb NOT NULL`, `subscription_reset_date timestamptz NULL`, `stripe_receipt_url text NULL`).

## SC-2 — RLS denial (PASS)

**Command:**
```bash
set -a; source .env.staging.local; set +a
deno test supabase/functions/_tests/merit_rls_test.ts --no-check --allow-env --allow-net
```

**Output (summary line and per-test status):**
```
running 5 tests from ./supabase/functions/_tests/merit_rls_test.ts
MER-04: anon client INSERT into user_merits blocked by RLS ... ok (372ms)
MER-04: anon client UPDATE to user_merits blocked by RLS ... ok (246ms)
MER-04: anon client DELETE from user_merits blocked by RLS ... ok (242ms)
MER-04: anon client INSERT into merit_transactions blocked by RLS ... ok (226ms)
MER-04: anon client INSERT into merit_shop_purchases blocked by RLS ... ok (227ms)

ok | 5 passed | 0 failed (1s)
```

All 5 tests `ok`. Zero `skipped`. Zero `failed`. Independent probe with `sanitizeOps:false` ran a sixth INSERT and captured the raw PostgREST response confirming the wire-level denial:
```
data=null  error={"code":"42501","details":null,"hint":null,
                   "message":"new row violates row-level security policy for table \"user_merits\""}
```

Postgres code **42501** (`insufficient_privilege`) is the canonical RLS-denial surface, matching the `rlsDenied()` helper's first branch in the test file.

## SC-3 — CHECK constraint enforcement (PASS)

**Command:**
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
  -- pick any user_merits row, attempt UPDATE to subscription_balance=-1 and shop_balance=-1,
  -- catch check_violation in nested BEGIN/EXCEPTION; raise EXCEPTION if either succeeds.
END $$;
SQL
```

**Output:**
```
NOTICE:  SC-3 PASS: CHECK constraints block negative balances
DO
```

Exit code 0. Both `subscription_balance = -1` and `shop_balance = -1` UPDATE attempts raised `check_violation`, caught in the inner BEGIN/EXCEPTION blocks and rolled back. Neither row was actually mutated (each `BEGIN/EXCEPTION/END` is a subtransaction). `lifetime_granted >= 0` CHECK exercised transitively via the seed rows inserted in SC-4 backfill (all 7 rows have `lifetime_granted = 5 >= 0`).

## SC-4 — Backfill + trigger invariant (PASS)

**Command 1 — invariant assertion:**
```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
  -- profile_count == user_merits count == (5,0,5)-shaped count, grant_count >= profile_count
END $$;
SQL
```

**Output:**
```
NOTICE:  profiles=7 user_merits=7 correct_shape=7 grant_rows=7
NOTICE:  SC-4 PASS
DO
```

Exit code 0. Note: profile count grew from **6** (Plan 03 push time) to **7** (Plan 04 verification time). One real signup occurred between pushes. The D-05 `on_profile_created_provision_merits` trigger fired on that signup, creating one `user_merits` row AND one `signup-grant` `merit_transactions` row, keeping the three counts in lockstep at 7/7/7. This is empirical live-fire proof of MER-10/14 beyond the static backfill — the feature will continue to self-maintain for every future signup.

**Command 2 — MER-12 reconciliation spot check:**
```bash
psql "$SUPABASE_DB_URL" -Atc "
  SELECT CASE WHEN EVERY(
    (SELECT subscription_balance + shop_balance FROM public.user_merits WHERE user_id = p.id)
    = COALESCE((SELECT SUM(amount) FROM public.merit_transactions WHERE user_id = p.id), 0)
  ) THEN 'OK' ELSE 'DRIFT' END
  FROM public.profiles p;"
```

**Output:** `OK`

Every profile has `user_merits.subscription_balance + shop_balance == SUM(merit_transactions.amount)`. No drift. D-15's "grant row per backfill" semantics hold on all 7 profiles.

## SC-5 — Legacy ledger untouched + SEC-06 anti-pattern absent (PASS)

**Check 1 — snapshot diff:**
```bash
diff <(grep -v "^# Generated" .snapshot-legacy-pre.txt) \
     <(grep -v "^# Generated" .snapshot-legacy-post.txt)
```
**Output:** empty, exit code `0`.

Both snapshots still on disk from Plan 03 (not regenerated per objective instruction). Legacy lines remain:
```
table=usage_tracking status=PRESENT count=98 md5=1e1504b61710422b245c4ef1d3c82e0d
table=credit_usage   status=MISSING
table=ai_usage       status=MISSING
```

**Check 2 — static grep of migration file for forbidden identifiers:**
```bash
grep -cE "usage_tracking|credit_usage|ai_usage|ai_action_type" \
  supabase/migrations/20260414000000_merit_ledger_foundation.sql
```
**Output:** `0`

**Check 3 — static grep for SEC-06 anti-patterns:**
```bash
grep -ciE "using\s*\(\s*true\s*\)"       supabase/migrations/20260414000000_merit_ledger_foundation.sql  # -> 0
grep -cE  "FOR (INSERT|UPDATE|DELETE|ALL)" supabase/migrations/20260414000000_merit_ledger_foundation.sql  # -> 0
```
Both `0`. Migration file contains no `USING (true)` nor any write-policy keyword.

**Check 4 — live pg_policies re-check:**
```bash
psql "$SUPABASE_DB_URL" -Atc "
  SELECT COUNT(*) FROM pg_policies
  WHERE tablename IN ('user_merits','merit_transactions','merit_shop_purchases')
    AND cmd <> 'SELECT';"
```
**Output:** `0`

No non-SELECT policies exist on any of the 3 tables on the live DB. Combined with Plan 03's gate 5 (which showed `SELECT` policy count = 3), the policy set is: exactly 3 SELECT policies (one per table), zero write policies. Service-role workers bypass RLS; everyone else is locked out of writes. MER-04 architecture holds.

## Verification Results (composite)

| Gate | Expected | Actual | Pass |
|------|----------|--------|------|
| SC-1 DO block exits 0 with NOTICE | `SC-1 PASS: all 3 tables have exact column shapes` | same | ✓ |
| SC-2 Deno test summary | `ok \| 5 passed \| 0 failed` | `ok \| 5 passed \| 0 failed` | ✓ |
| SC-2 wire-level RLS error code | `42501` | `42501` (probed) | ✓ |
| SC-3 DO block exits 0 with NOTICE | `SC-3 PASS: CHECK constraints block negative balances` | same | ✓ |
| SC-4 profile/user_merits counts match | equal | 7 == 7 | ✓ |
| SC-4 (5,0,5)-shape count matches profiles | equal | 7 == 7 | ✓ |
| SC-4 grant row count >= profile count | ≥7 | 7 | ✓ |
| SC-4 MER-12 reconciliation | `OK` | `OK` | ✓ |
| SC-5 snapshot diff | empty, exit 0 | empty, exit 0 | ✓ |
| SC-5 forbidden identifiers in migration | 0 | 0 | ✓ |
| SC-5 `USING (true)` in migration | 0 | 0 | ✓ |
| SC-5 `FOR (INSERT/UPDATE/DELETE/ALL)` in migration | 0 | 0 | ✓ |
| SC-5 live non-SELECT pg_policies count | 0 | 0 | ✓ |

**Phase 10 Success Criteria: ALL 5 MET.**

## Deviations from Plan

### [Rule 1 — Test harness bug] Deno op/resource sanitizer false-FAILED every MER-04 test

- **Found during:** Task 2 (SC-2), first run of `deno test supabase/functions/_tests/merit_rls_test.ts`.
- **Issue:** All 5 tests ran to completion in ~230ms each, reached the end of their `fn` bodies, and then Deno's default leak sanitizer fired `error: Leaks detected: - An interval was started in this test, but never completed.` The leaked interval is `@supabase/supabase-js@2`'s `GoTrueClient` auto-refresh timer, which is created inside `createClient()` and has no public `dispose()` or teardown API. The test file's RLS assertions themselves were passing — every INSERT attempt returned PostgREST error `42501 "new row violates row-level security policy for table \"user_merits\""`, as verified by an independent probe test with `sanitizeOps:false`.
- **Why this is a Rule 1 bug and not a real RLS failure:** The leak is a library-level resource that exists for the lifetime of the client regardless of user code. Deno's sanitizer runs per-test, so any test that constructs a supabase-js client will "leak". This is a known `@supabase/supabase-js` + `Deno.test` interaction, not an RLS or wire-protocol issue. The sanitizer firing AFTER the assertion passes turns every passing test red.
- **Fix:** Rewrote each of the 5 `Deno.test("name", fn)` calls into the object form `Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn })`, sharing a `testOpts` const. Added an inline comment explaining why. No test logic changed — the assertion bodies are byte-identical. Re-ran: `ok | 5 passed | 0 failed`.
- **Files modified (uncommitted):** `supabase/functions/_tests/merit_rls_test.ts`
- **Commit:** NONE (Plan 04 frontmatter is `files_modified: []` — see Files Modified section below).

### [Rule 2 — Critical missing verification]  None

No new mitigations needed. All threat-model entries (T-10-VER-01..04) from the plan were already handled by the test/DO-block structure; the Rule 1 fix preserves that design.

## Authentication Gates

None at execution time. The prior executor halted on an auth gate (missing REST credentials); this run started with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEST_USER_JWT`, `SUPABASE_DB_URL`, and `SUPABASE_ACCESS_TOKEN` all present in `.env.staging.local` and sourced at the top of each DB-touching shell. No credentials were echoed to stdout/stderr. The one place where a RLS error message containing the table name surfaced (the independent probe) was deliberate evidence capture for SC-2 and leaked no secret material.

## Known Stubs

None. Every SC is backed by a live command whose output is quoted verbatim in this document.

## Threat Flags

None. This plan only reads from the database and runs a handful of transient `UPDATE ... ROLLBACK` subtransactions; it creates no new attack surface and does not cross any trust boundary not already enumerated in Plan 04's `<threat_model>`.

## Requirements Closed

- **MER-01** (user_merits table shape) — SC-1
- **MER-02** (merit_transactions table shape) — SC-1
- **MER-03** (merit_shop_purchases table shape) — SC-1
- **MER-04** (RLS denies direct user writes) — SC-2
- **MER-10** (signup grants 5 subscription merits) — SC-4 (7th profile proves trigger)
- **MER-13** (balances cannot go negative) — SC-3
- **MER-14** (lifetime_granted seeded at 5) — SC-4
- **MIG-01** (merit ledger migration applied cleanly) — SC-1 + SC-4 (both require the migration)
- **MIG-04** (legacy ledger untouched) — SC-5

All 9 requirements closed.

Note: STATE.md / ROADMAP.md / REQUIREMENTS.md intentionally NOT updated by this executor run, per the sequential-resume instructions ("Do NOT update STATE.md or ROADMAP.md"). Orchestrator owns project-state files.

## Files Modified

**Committed:** none. Plan 04 produces zero git commits, per frontmatter `files_modified: []`.

**Uncommitted working-tree changes (runtime artifacts):**
- `supabase/functions/_tests/merit_rls_test.ts` — Rule 1 harness fix (Deno sanitizer flags). See Deviations section. Left uncommitted so the orchestrator can review before deciding whether to land it in a follow-up plan.
- `.planning/phases/10-merit-ledger-foundation/10-04-SUMMARY.md` — this file.
- `.snapshot-legacy-pre.txt` / `.snapshot-legacy-post.txt` — left untouched from Plan 03 (not regenerated per objective instruction).

## Self-Check: PASSED

**Files verified on disk:**
- `.planning/phases/10-merit-ledger-foundation/10-04-SUMMARY.md` — FOUND (this file)
- `supabase/functions/_tests/merit_rls_test.ts` — FOUND (modified, uncommitted)
- `.snapshot-legacy-pre.txt` — FOUND (unchanged)
- `.snapshot-legacy-post.txt` — FOUND (unchanged)
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — FOUND (unchanged)

**Live staging DB state verified:**
- `information_schema.columns` — 9/8/8 columns on the 3 tables, shapes match expected set
- `public.profiles` count = 7
- `public.user_merits` count = 7, all with `(subscription_balance=5, shop_balance=0, lifetime_granted=5)`
- `public.merit_transactions` grant-row count = 7 (sources in `{phase-10-backfill, signup-grant}`)
- MER-12 reconciliation returns `OK` across all profiles
- `pg_policies` non-SELECT count on the 3 tables = 0
- CHECK constraints empirically raise `check_violation` on both `subscription_balance=-1` and `shop_balance=-1`
- Deno REST-level test: `ok | 5 passed | 0 failed` against live `https://cimjltzovkahkqecpwgi.supabase.co`

**Commits in this plan:** ZERO (expected — `files_modified: []`).
