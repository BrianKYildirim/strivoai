---
phase: 10-merit-ledger-foundation
plan: 03
subsystem: merit-ledger
tags: [db-push, staging, migration, mig-04, wave-3, resumed]
requires:
  - supabase/migrations/20260414000000_merit_ledger_foundation.sql (from 10-02)
  - .env.staging.local credentials for staging project cimjltzovkahkqecpwgi
provides:
  - "Live user_merits / merit_transactions / merit_shop_purchases tables on staging"
  - "Deploy-time D-16 verification proof (NOTICE fired: 6 profiles / 6 user_merits / 6 grant rows)"
  - "Empirical MIG-04 evidence: .snapshot-legacy-pre.txt ≡ .snapshot-legacy-post.txt on data lines"
affects:
  - .snapshot-legacy-pre.txt (uncommitted runtime artifact at repo root, reused from prior run)
  - .snapshot-legacy-post.txt (uncommitted runtime artifact at repo root, new)
tech_stack:
  added: []
  patterns:
    - "Pre/post snapshot diff as MIG-04 empirical proof"
    - "Transactional migration gated by trailing DO $$ verification block"
key_files:
  created: []
  modified: []
decisions:
  - "Resumed on MAIN working tree after orchestrator pre-resolved the 20260411 migration drift (commit 82e0a4c deleted the duplicate file; supabase migration repair --status reverted 20260411 was run against staging)"
  - "Trusted existing .snapshot-legacy-pre.txt from prior run — orchestrator's intervening actions (file deletion + schema_migrations repair) cannot mutate legacy ledger data, so the baseline remains valid. Task 3 diff empirically confirms this."
  - "Skipped Task 1 snapshot regeneration per objective instruction ('pre-snapshot is STILL VALID ... do NOT regenerate it')"
metrics:
  duration_minutes: 3
  completed_date: 2026-04-15
  status: COMPLETE
requirements_covered: [MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04]
---

# Phase 10 Plan 03: Push Merit Ledger Migration to Staging — Summary

**Status: COMPLETE.** Phase 10 migration applied to staging. D-16 deploy-time verification fired NOTICE (not EXCEPTION). All 7 Task 2 psql acceptance gates pass. MIG-04 proved empirically by byte-identical legacy-ledger snapshot diff.

## One-Liner

Applied `20260414000000_merit_ledger_foundation.sql` to staging Supabase (`cimjltzovkahkqecpwgi`); all 3 merit tables live with RLS enabled, exactly 3 SELECT policies and 0 write policies, D-16 assertion passed at 6/6/6, and legacy ledger tables are byte-identical pre vs post.

## Tasks Completed

| # | Task | Status | Commit | Files |
|---|------|--------|--------|-------|
| 1 | Capture pre-push legacy ledger snapshot | REUSED from prior run | (n/a — uncommitted runtime artifact) | `.snapshot-legacy-pre.txt` |
| 2 | Run `supabase db push` | DONE | (n/a — `files_modified: []`) | — |
| 3 | Capture post-push legacy ledger snapshot + diff | DONE | (n/a — uncommitted runtime artifact) | `.snapshot-legacy-post.txt` |

## Task 1 — Pre-push snapshot (reused)

Per objective instructions, the existing `.snapshot-legacy-pre.txt` from the prior (blocked) executor run was kept verbatim. Orchestrator's only intervening actions were:

1. Deleted duplicate `supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql` — commit `82e0a4c` on `by/env-fixes`.
2. `supabase migration repair --status reverted 20260411` against staging to drop the orphan `schema_migrations` row.

Neither action writes to `usage_tracking` / `credit_usage` / `ai_usage`, so the pre-snapshot remains a valid MIG-04 baseline. Task 3's diff (below) empirically confirms this.

Pre-snapshot data lines:

```
table=usage_tracking status=PRESENT count=98 md5=1e1504b61710422b245c4ef1d3c82e0d
table=credit_usage   status=MISSING
table=ai_usage       status=MISSING
```

## Task 2 — supabase db push (DONE)

Sourced `.env.staging.local`, then ran `supabase db push`. The CLI identified exactly one pending migration and applied it cleanly:

```
Applying migration 20260414000000_merit_ledger_foundation.sql...
NOTICE (00000): trigger "update_user_merits_updated_at" for relation "public.user_merits" does not exist, skipping
NOTICE (00000): trigger "on_profile_created_provision_merits" for relation "public.profiles" does not exist, skipping
NOTICE (00000): Phase 10 verification passed: 6 profiles, 6 user_merits, 6 grant rows
Finished supabase db push.
```

The `Phase 10 verification passed` NOTICE is the D-16 DO-block proof: the migration transaction ran to completion, the backfill wrote one `user_merits` row per profile, and one grant row per profile was inserted into `merit_transactions`. No EXCEPTION raised → no rollback → migration fully committed.

### Task 2 acceptance gates — all 7 pass

```
supabase migration list | grep 20260414000000
  20260414000000 | 20260414000000 | 2026-04-14 00:00:00          ✓ (Remote column populated)

psql gates (staging):
  gate 1 — all 3 tables exist (to_regclass IS NOT NULL AND ...)  = t    ✓
  gate 2 — RLS on user_merits          (relrowsecurity)          = t    ✓
  gate 3 — RLS on merit_transactions   (relrowsecurity)          = t    ✓
  gate 4 — RLS on merit_shop_purchases (relrowsecurity)          = t    ✓
  gate 5 — SELECT policy count across 3 tables                   = 3    ✓
  gate 6 — non-SELECT (write) policy count across 3 tables       = 0    ✓ (SEC-06 anti-pattern absent)
```

All columns match the migration file (user_merits: id, user_id, subscription_balance, shop_balance, lifetime_granted, subscription_reset_date, free_linkedin_scan_used, created_at, updated_at; merit_transactions: id, user_id, amount, balance_type, source, feature, metadata, created_at; merit_shop_purchases: id, user_id, pack_size, price_cents, stripe_payment_intent_id, stripe_receipt_url, status, created_at).

## Task 3 — Post-push snapshot (DONE)

Ran `powershell.exe -File scripts/snapshot-legacy-tables.ps1 -OutputFile .snapshot-legacy-post.txt` with `/c/Program Files/PostgreSQL/17/bin` added to PATH for the child `psql` calls, and `SUPABASE_DB_URL` sourced from `.env.staging.local`.

Post-snapshot data lines (identical to pre on every data field):

```
table=usage_tracking status=PRESENT count=98 md5=1e1504b61710422b245c4ef1d3c82e0d
table=credit_usage   status=MISSING
table=ai_usage       status=MISSING
```

Programmatic diff excluding the `# Generated` timestamp header:

```
diff <(grep -v "^# Generated" .snapshot-legacy-pre.txt) <(grep -v "^# Generated" .snapshot-legacy-post.txt)
# exit code: 0  (empty output)
```

**MIG-04 empirically proved at push time.** Phase 10 did not mutate any legacy ledger table.

## Verification Results

| Gate | Expected | Actual | Pass |
|---|---|---|---|
| `.snapshot-legacy-pre.txt` exists with 3 legacy tables | yes | yes | ✓ |
| `supabase migration list` shows `20260414000000_merit_ledger_foundation` applied | yes | yes | ✓ |
| `to_regclass('public.user_merits')` returns `t` | t | t | ✓ |
| `to_regclass('public.merit_transactions')` returns `t` | t | t | ✓ |
| `to_regclass('public.merit_shop_purchases')` returns `t` | t | t | ✓ |
| RLS enabled on user_merits | t | t | ✓ |
| RLS enabled on merit_transactions | t | t | ✓ |
| RLS enabled on merit_shop_purchases | t | t | ✓ |
| SELECT policy count across 3 new tables | 3 | 3 | ✓ |
| Non-SELECT policy count across 3 new tables | 0 | 0 | ✓ |
| D-16 verification NOTICE fired (not EXCEPTION) | yes | yes | ✓ |
| `.snapshot-legacy-post.txt` matches pre on data lines | match | match (exit 0) | ✓ |

**Plan 03 success criteria: ALL MET.**

## Deviations from Plan

### [Rule 3 — Blocker, orchestrator-resolved] Pre-existing migration drift on 20260411

- **Found during:** Prior executor run (not this one).
- **Issue:** A duplicate `supabase/migrations/20260411_linkedin_grades_drop_unique_identifier.sql` existed on disk and a matching orphan row was present in staging's `supabase_migrations.schema_migrations`. Supabase CLI's `db push` refused to proceed because it saw the 8-digit version as drift against the 14-digit siblings.
- **Fix (applied by orchestrator before this executor resumed, NOT by this executor):**
  1. Deleted the duplicate file — commit `82e0a4c`.
  2. Ran `supabase migration repair --status reverted 20260411` against staging.
- **Scope note:** This fix is OUT OF SCOPE for Plan 10-03's `files_modified: []` contract. It is recorded here solely for audit traceability. No commit in this plan's execution range is attributable to the drift resolution.

### [Rule 3 — Environment] PowerShell 7 (`pwsh`) not installed on host

- **Issue:** Plan calls for `pwsh -File scripts/snapshot-legacy-tables.ps1` but the host only has Windows PowerShell 5.1.
- **Fix:** Used `powershell.exe -File ...` instead. The snapshot script uses only 5.1-compatible features, so output is identical. Verified by inspecting the resulting file format and byte content.

### [Rule 3 — Convention] SUMMARY.md written to `.planning/` but NOT committed

- **Issue:** Plan `<output>` block requires creating `.planning/phases/10-merit-ledger-foundation/10-03-SUMMARY.md`, but CLAUDE.md prohibits committing anything under `.planning/`, and the objective explicitly instructs zero commits.
- **Fix:** Wrote SUMMARY to the correct path, did NOT `git add` or commit. Matches Plan 01 / Plan 02 precedent.

## Authentication Gates

None. `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_URL` were sourced from `.env.staging.local` (gitignored) at the start of each DB-touching command. No credentials were echoed to output.

## Known Stubs

None. Every new table is created with real columns, real constraints, real RLS, real indexes, real triggers, and a real row per existing profile.

## Threat Flags

None. Additive-only schema change within the `<threat_model>` boundaries already enumerated in the plan. SEC-06 anti-pattern verified absent at push time (0 write policies).

## Requirements Closed

MER-01, MER-02, MER-03, MER-04, MER-10, MER-13, MER-14, MIG-01, MIG-04 — all backed by live staging schema and the D-16 deploy-time proof.

Note: STATE.md / ROADMAP.md / REQUIREMENTS.md intentionally NOT updated by this executor run, per the sequential-resume instructions ("Do NOT update STATE.md or ROADMAP.md"). Orchestrator owns project-state files.

## Files Modified

None. This plan produces zero git commits (`files_modified: []` per frontmatter).

Runtime artifacts left in the working tree (uncommitted, for Plan 04 consumption):
- `.snapshot-legacy-pre.txt`
- `.snapshot-legacy-post.txt`
- `.planning/phases/10-merit-ledger-foundation/10-03-SUMMARY.md` (this file)

## Self-Check: PASSED

**Files verified on disk:**
- `.snapshot-legacy-pre.txt` — FOUND
- `.snapshot-legacy-post.txt` — FOUND
- `supabase/migrations/20260414000000_merit_ledger_foundation.sql` — FOUND (unchanged)
- `.planning/phases/10-merit-ledger-foundation/10-03-SUMMARY.md` — FOUND (this file)

**Staging DB state verified via psql:**
- `to_regclass('public.user_merits')` = non-null → table exists
- `to_regclass('public.merit_transactions')` = non-null → table exists
- `to_regclass('public.merit_shop_purchases')` = non-null → table exists
- `supabase_migrations.schema_migrations` — row for `20260414000000` present (applied 2026-04-14)
- All 6 existing profiles have matching `user_merits` rows and signup-grant `merit_transactions` rows (D-16 asserted this at push time)

**Commits in this plan:** ZERO (expected — `files_modified: []`).
