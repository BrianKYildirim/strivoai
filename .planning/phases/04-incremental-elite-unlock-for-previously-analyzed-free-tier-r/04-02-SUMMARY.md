---
phase: 04-incremental-elite-unlock-for-previously-analyzed-free-tier-resumes
plan: 02
subsystem: database
tags: [postgres, supabase, rpc, idempotency, preview]

requires:
  - phase: 04-01
    provides: Validated immutable Elite delta and merged-result contract
provides:
  - Service-role-only same-row Elite unlock transaction
  - Immutable Free mirror plus one idempotent merged mirror
  - Atomic usage linkage and lifecycle settlement
  - Preview-applied migration with remote ownership, CAS, replay, and concurrency proof
affects: [04-03, 04-04, analyze-resume, usage-tracking]

tech-stack:
  added: []
  patterns: [advisory-lock idempotency, row-lock compare-and-swap, service-role-only RPC]

key-files:
  created:
    - supabase/migrations/20260730010000_resume_elite_unlock.sql
  modified:
    - supabase/functions/_shared/database.types.ts
    - src/integrations/supabase/types.ts
    - supabase/functions/analyze-resume/__tests__/history-persistence.test.ts

key-decisions:
  - "The exact stored grading_data is the CAS value; the stable base fingerprint binds base analysis ID to text hash."
  - "Completed replay returns the durable mirror, usage, and lifecycle identities without another write."
  - "The RPC is revoked from PUBLIC, anon, and authenticated and granted only to service_role."

patterns-established:
  - "Resume update, merged mirror insertion, usage linkage, and lifecycle completion succeed or roll back as one transaction."

requirements-completed: [AC-03, AC-04, AC-06, AC-07, AC-09]

duration: 46min
completed: 2026-07-31
---

# Phase 04 Plan 02: Atomic Elite Unlock Persistence Summary

**Preview now has a service-role-only transaction that upgrades one eligible Free resume in place while preserving its original mirror and converging duplicate requests on one result and charge.**

## Performance

- **Duration:** 46 min
- **Completed:** 2026-07-31
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added an advisory-locked, owner-scoped, hash/base-checked same-row persistence RPC.
- Kept the original Free `analysis_results` row immutable while inserting exactly one incremental mirror.
- Linked the accepted usage row and completed lifecycle state in the same transaction.
- Applied migration `20260730010000` to preview `cimjltzovkahkqecpwgi` only.
- Proved ownership rejection, stale identity/CAS rollback, concurrency, replay, grant isolation, and accounting linkage remotely.

## Task Commits

1. **Task 1: Atomic persistence migration and type surfaces** - `7f976d72`
2. **Task 2: Remote transaction and replay coverage** - `61df794a`
3. **Task 3 correction: Preview assertion fixes** - `43837e15`

Planning metadata remains local and uncommitted per repository policy.

## Preview Evidence

- Operator linked project ref `cimjltzovkahkqecpwgi`.
- Before push, only local migration `20260730010000` was pending.
- `supabase db push --include-all --yes` applied only `20260730010000_resume_elite_unlock.sql` and exited successfully.
- After push, migration list showed local and remote `20260730010000` aligned.
- Focused resume remote lane: 5 passed, 0 failed.
- Complete `npm run test:edge:remote`: 25 passed, 0 failed.
- Production ref `zjpjapgraoxdukdvpjes` was not linked or mutated.

## Deviations from Plan

### Auto-fixed test harness defects

- The first preview run used `analyzed_tier='pro'` for a negative case, but the live schema intentionally permits only `free`, `elite`, or null. The setup update failed and was unchecked. The case now sets and confirms `elite` before asserting RPC rejection.
- The authenticated grant probe now cancels its response body before asserting status, satisfying Deno leak detection.

The migration itself required no post-deployment correction.

## Verification

- `npm run type-check` - passed.
- `npm run test:edge` - 1,485 passed, 0 failed, 12 ignored.
- `npm run test:edge:remote` - 25 passed, 0 failed.

## Next Plan Readiness

Plan 04-03 can wire server-side eligibility, conditional generation, telemetry, lifecycle, and queue transport to the proven transaction.

---
*Phase: 04-incremental-elite-unlock-for-previously-analyzed-free-tier-resumes*
*Completed: 2026-07-31*
