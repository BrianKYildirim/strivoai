***

phase: 10-merit-ledger-foundation
plan: 01
subsystem: merit-ledger
tags: \[validation-scaffold, rls, migration-proof, wave-0]
requires: \[]
provides:

* supabase/functions/\_tests/merit\_rls\_test.ts
* scripts/snapshot-legacy-tables.ps1
* run-edge-tests.ps1 registers merit\_rls\_test.ts
  affects: \[]
  tech\_stack:
  added: \[]
  patterns:
  * "Deno test scaffold with skip-on-missing-env guard (no false CI failures before Wave 2 migration lands)"
  * "PowerShell md5 + to\_jsonb content-hash snapshot for migration non-interference proof"
    key\_files:
    created:
  * supabase/functions/\_tests/merit\_rls\_test.ts
  * scripts/snapshot-legacy-tables.ps1
    modified:
  * scripts/run-edge-tests.ps1
    decisions:
* "Use std\@0.224.0/assert to match the existing \_shared/\*.test.ts convention instead of pulling in a newer std version"
* "Use createClient from esm.sh (same source as rest of repo's deno-side supabase imports) so the test does not require a deno.json import map entry"
* "Skip tests gracefully when env vars are missing rather than fail — keeps Wave 1 CI green before Wave 2 applies the migration"
* "Hash each legacy table via md5(string\_agg(to\_jsonb(t.\*)::text, '|' ORDER BY t.id)) so every column (including any Phase 10 mistakenly adds) is included in the hash"
  metrics:
  duration\_minutes: \~8
  completed\_date: 2026-04-15
  requirements\_covered: \[MER-04, MIG-04]

***

# Phase 10 Plan 01: Wave 0 Validation Scaffolds Summary

Wave 0 validation infrastructure shipped: a Deno RLS-denial test suite (5 MER-04 blocks against `user_merits`, `merit_transactions`, `merit_shop_purchases`) that skips cleanly before the Phase 10 migration exists, a PowerShell snapshot script that md5-hashes `usage_tracking` / `credit_usage` / `ai_usage` for MIG-04 non-interference proof, and runner registration so CI picks up the new test.

## Objective Recap

Create validation tooling BEFORE the Phase 10 migration so Plan 04's verification commands already exist by the time `supabase db push` runs. Zero database changes — this plan is purely test/script scaffolding.

## Tasks Completed

| # | Task                                            | Commit    | Files                                          |
| - | ----------------------------------------------- | --------- | ---------------------------------------------- |
| 1 | Create Deno RLS test scaffold                   | `ef72327` | supabase/functions/\_tests/merit\_rls\_test.ts |
| 2 | Create legacy-ledger snapshot PowerShell script | `19b6b3d` | scripts/snapshot-legacy-tables.ps1             |
| 3 | Register RLS test in edge-test runner           | `55acae6` | scripts/run-edge-tests.ps1                     |

## Verification Results

**Task 1 — Deno RLS test:**

```
deno test supabase/functions/_tests/merit_rls_test.ts --no-check --allow-env --allow-net
# ok | 5 passed | 0 failed (22ms)
```

All 5 tests skip gracefully and pass with `[SKIP]` warnings because env vars are absent. Acceptance grep checks:

* `grep -c "std@0.224.0/assert"` → 1 ✓
* `grep -c 'Deno.test("MER-04:'` → 5 ✓
* `grep -c "row-level security"` → 1 ✓ (inside `rlsDenied` helper regex)

**Task 2 — PowerShell snapshot script:**

```
powershell -NoProfile -Command "& { $env:SUPABASE_DB_URL = ''; & './scripts/snapshot-legacy-tables.ps1' }"
# Writes error: "DatabaseUrl not set. Pass -DatabaseUrl or set $env:SUPABASE_DB_URL."
```

Fails loudly as required. Grep checks:

* `usage_tracking`, `credit_usage`, `ai_usage`, `md5(string_agg`, `ErrorActionPreference = "Stop"` all present ✓

**Task 3 — Runner registration:**

```
grep -c "_tests/merit_rls_test.ts" scripts/run-edge-tests.ps1  → 1 ✓
powershell -NoProfile -Command "[scriptblock]::Create((Get-Content scripts/run-edge-tests.ps1 -Raw))"  → SYNTAX_OK ✓
```

Runner still passes `--allow-all`, so no per-file flag change needed.

## Deviations from Plan

**\[Rule 2 — Critical convention]** **`.planning/`** **SUMMARY not committed.**

* **Found during:** Final metadata commit.
* **Issue:** Plan `<output>` block instructs writing `.planning/phases/10-merit-ledger-foundation/10-01-SUMMARY.md`, but CLAUDE.md explicitly states "NEVER COMMIT ANYTHING WITHIN THE `.planning/` DIRECTORY" and the repo's `.gitignore` line 31 excludes `.planning/`.
* **Fix:** Wrote SUMMARY.md to `.planning/phases/10-merit-ledger-foundation/10-01-SUMMARY.md` at the main repo so the orchestrator can read it, but did NOT `git add` or commit it. CLAUDE.md takes precedence over the standard executor template.
* **Files modified:** SUMMARY file exists on disk; not in git.
* **Commit:** n/a (intentionally absent).

Otherwise: plan executed exactly as written. No Rule 1 bugs, no Rule 3 blockers, no Rule 4 architectural escalations.

## Authentication Gates

None encountered.

## Key Decisions

1. **Pinned** **`std@0.224.0/assert`** — matches `supabase/functions/_shared/auth.test.ts` and other existing tests. Avoids version-drift noise in deno.lock.
2. **`createClient`** **imported from** **`esm.sh/@supabase/supabase-js@2`** — consistent with the rest of the Deno-side supabase imports and avoids needing a new `deno.json` import map entry for `_tests/`.
3. **Skip-on-missing-env over fail-closed** — Wave 1 runs before Wave 2 creates the tables. A hard failure would block CI for every Wave 1 commit. The skip semantics still turn into real assertions the moment env vars are set in staging.
4. **`to_jsonb(t.*)::text`** **hash column strategy** — captures every column (incl. any Phase 10 might mistakenly add to legacy tables), whereas a hand-picked column list would miss exactly the failure mode MIG-04 is guarding against.

## Known Stubs

None. All files are complete and self-contained. The tests are intentionally "skipped" today, not stubbed — they execute real assertions the moment env vars are present.

## Threat Flags

None. No new security-relevant surface was introduced. The RLS test uses ANON key + user JWT only (no service role), matching the mitigate disposition in the plan's T-10-03.

## Self-Check: PASSED

**Files verified on disk:**

* `supabase/functions/_tests/merit_rls_test.ts` — FOUND
* `scripts/snapshot-legacy-tables.ps1` — FOUND
* `scripts/run-edge-tests.ps1` — FOUND (modified; grep confirms `_tests/merit_rls_test.ts` appears once)

**Commits verified in git log:**

* `ef72327` — test(10-01): add Phase 10 merit ledger RLS denial test scaffold — FOUND
* `19b6b3d` — chore(10-01): add Phase 10 MIG-04 legacy-ledger snapshot script — FOUND
* `55acae6` — chore(10-01): register merit RLS test in edge-test runner — FOUND

