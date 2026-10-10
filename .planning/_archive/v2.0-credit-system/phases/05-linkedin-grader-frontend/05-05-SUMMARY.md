---
phase: 05-linkedin-grader-frontend
plan: 05
subsystem: linkedin-grader-backend
tags: [linkedin-grader, backend, entitlement, free-scan, nyquist, wave-0, LIG-11]
requires:
  - get_billing_period_start Postgres RPC (migration 20251222220418)
  - check_and_record_ai_usage Postgres RPC (migration 20260411000002, Phase 4 CR-01)
  - supabase/functions/_shared/usage-checker.ts (unchanged)
  - supabase/functions/_shared/supabase-client.ts
  - supabase/functions/_shared/logger.ts
provides:
  - getBillingPeriodStart(userId) helper in supabase/functions/_shared/billing-period.ts
  - isFreeScan(cycleGradeCount) pure helper in supabase/functions/grade-linkedin/entitlement.ts
  - Free-scan bypass branch in grade-linkedin/index.ts step 6
affects:
  - supabase/functions/grade-linkedin/index.ts
tech-stack:
  added: []
  patterns:
    - pure-helper-extraction (entitlement.ts so unit tests can import without serve())
    - safer-default-on-error (null count → paid path)
key-files:
  created:
    - supabase/functions/_shared/billing-period.ts
    - supabase/functions/grade-linkedin/entitlement.ts
    - supabase/functions/grade-linkedin/entitlement.test.ts
  modified:
    - supabase/functions/grade-linkedin/index.ts
decisions:
  - isFreeScan extracted to its own entitlement.ts module (not inlined in index.ts) so Deno unit tests can import it without the top-level serve() call demanding --allow-net.
  - Test fixture framework chosen = static source analysis + direct helper import, matching existing handler-config.test.ts pattern. No new mock framework introduced.
  - _shared/usage-checker.ts intentionally NOT modified — Phase 4 CR-01 atomic advisory-lock semantics preserved unchanged on the paid path.
  - Any error (billing RPC null, count query error) falls through to the paid path. Free scan is NEVER granted on an error path — safer default than risking revenue leaks.
metrics:
  duration: ~15min
  completed: 2026-04-12
---

# Phase 05 Plan 05: Backend free-scan enforcement (LIG-11) Summary

Free-scan carve-out is now authoritatively enforced at the grade-linkedin edge function: on the user's first scan of the billing cycle, both the entitlement check AND the atomic usage decrement are bypassed; every subsequent scan in the cycle goes through the unchanged Phase 4 atomic `checkAndRecordUsage` path.

## What shipped

1. **`supabase/functions/_shared/billing-period.ts`** (new, 31 lines) — thin wrapper around the existing `get_billing_period_start(p_user_id)` RPC. Returns ISO date string on success, `null` on any error. Does not throw; does not touch usage accounting.

2. **`supabase/functions/grade-linkedin/entitlement.ts`** (new, 22 lines) — pure `isFreeScan(cycleGradeCount: number | null): boolean` helper. `null` and negative counts → `false` (paid path), `0` → `true` (free scan), `>=1` → `false`. Extracted to its own module so the unit tests can import it without triggering `index.ts`'s top-level `serve()` call (which requires `--allow-net`).

3. **`supabase/functions/grade-linkedin/index.ts` step 6** — replaced the unconditional `checkAndRecordUsage` with a branch:
   - Fetch `cycleStart` via `getBillingPeriodStart(userId)`.
   - If non-null, count `linkedin_grades` where `user_id = userId AND created_at >= cycleStart` (uses the existing `(user_id, created_at DESC)` index — cheap).
   - `freeScan = isFreeScan(cycleGradeCount)` — `null` flows through as `false`.
   - Log `usage-branch` with the computed state for observability.
   - If `freeScan`: log `linkedin-free-scan-bypass` and skip BOTH the entitlement check and the usage record.
   - Otherwise: call `checkAndRecordUsage(userId, 'linkedin_grading')` and return `createUsageLimitResponse` on 429 — exactly the existing CR-01 atomic path.

4. **`supabase/functions/grade-linkedin/entitlement.test.ts`** (new, 9 tests, all green) —
   - 3 unit tests for `isFreeScan(0 / 1 / 5 / null)`.
   - 3 source-analysis tests for the index.ts branch: `getBillingPeriodStart` import + path, `linkedin-free-scan-bypass` log marker, `isFreeScan` branch + `checkAndRecordUsage(userId, 'linkedin_grading')` still called on paid path, `createUsageLimitResponse` still reachable.
   - 3 sanity tests: `checkAiUsageAllowed` is NOT introduced, `_shared/usage-checker.ts` still exports `checkAndRecordUsage` + `check_and_record_ai_usage`, `_shared/billing-period.ts` exports `getBillingPeriodStart`.

## Deviations from Plan

### Structural

**1. [Rule 3 - Blocking] Extracted `isFreeScan` to `grade-linkedin/entitlement.ts` rather than exporting from `index.ts`**
- **Found during:** Task 1 (first `deno test` run)
- **Issue:** `import('./index.ts')` executes the top-level `serve(async (req) => {...})` which calls `Deno.listen` and fails without `--allow-net`. The plan allowed either inlining in index.ts or a separate helper; the separate helper is required for unit testability.
- **Fix:** New `supabase/functions/grade-linkedin/entitlement.ts` exporting just `isFreeScan`. `index.ts` imports from it. Tests import from `./entitlement.ts`.
- **Files modified:** supabase/functions/grade-linkedin/entitlement.ts (new), supabase/functions/grade-linkedin/entitlement.test.ts (loader helper)
- **Commit:** c1e3e25

No bugs auto-fixed, no architectural changes. No Rule 4 checkpoints hit.

## Test Output Snapshot

```
deno test --allow-read supabase/functions/grade-linkedin/entitlement.test.ts
running 9 tests from ./supabase/functions/grade-linkedin/entitlement.test.ts
entitlement: isFreeScan(0) returns true — zero cycle rows is a free scan ... ok (3ms)
entitlement: isFreeScan(1) and isFreeScan(5) return false — any prior scan is paid ... ok (0ms)
entitlement: isFreeScan(null) returns false — null count safely defaults to paid ... ok (0ms)
entitlement: index.ts imports getBillingPeriodStart from _shared/billing-period.ts ... ok (0ms)
entitlement: zero cycle rows branch skips checkAndRecordUsage (full bypass log marker) ... ok (0ms)
entitlement: non-zero cycle rows branch calls checkAndRecordUsage (paid path preserved) ... ok (10ms)
entitlement: no checkAiUsageAllowed helper used (free scan is full bypass, not check-without-record) ... ok (0ms)
entitlement: _shared/usage-checker.ts still exports checkAndRecordUsage (CR-01 atomic path preserved) ... ok (0ms)
entitlement: _shared/billing-period.ts exports getBillingPeriodStart ... ok (0ms)
ok | 9 passed | 0 failed (26ms)
```

Full grade-linkedin suite (no regression):

```
deno test --allow-read supabase/functions/grade-linkedin/
ok | 53 passed | 0 failed (402ms)
```

Type check:

```
deno check supabase/functions/grade-linkedin/index.ts
Check supabase/functions/grade-linkedin/index.ts
(no errors)
```

## Commits

| Commit | Task | Message |
|--------|------|---------|
| 2ef0005 | Task 1 (RED) | test(05-05): add failing tests for free-scan entitlement bypass |
| d5bc97a | Task 2 | feat(05-05): add getBillingPeriodStart RPC wrapper |
| c1e3e25 | Task 3 (GREEN) | feat(05-05): branch grade-linkedin step 6 on cycle count for LIG-11 free scan |

## Success Criteria Check

- [x] `getBillingPeriodStart` helper added to new file `_shared/billing-period.ts`
- [x] `_shared/usage-checker.ts` UNCHANGED (Phase 4 CR-01 preserved, verified by test)
- [x] `grade-linkedin/index.ts` step 6 branches on cycle count with FULL bypass on free scan
- [x] `entitlement.test.ts` added with all tests green (both branches asserted)
- [x] No regression in existing grade-linkedin tests (53/53 pass)
- [x] T-05-01 accept-the-race rationale explicit in code comments (both entitlement.ts and index.ts step 6)
- [x] LIG-11 backend enforcement complete

## Self-Check: PASSED

Files verified to exist on disk:
- FOUND: supabase/functions/_shared/billing-period.ts
- FOUND: supabase/functions/grade-linkedin/entitlement.ts
- FOUND: supabase/functions/grade-linkedin/entitlement.test.ts
- FOUND: supabase/functions/grade-linkedin/index.ts (modified)

Commits verified via git log:
- FOUND: 2ef0005
- FOUND: d5bc97a
- FOUND: c1e3e25
