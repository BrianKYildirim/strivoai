---
phase: 36-history-persistence-parity-audit-repair
plan: 01
subsystem: edge-functions-shared
tags: [usage-tracking, history, hist-06, test-05, entitlement, post-success-ledger]
status: complete
requires:
  - "20260512000002_usage_tracking_analysis_id.sql (Phase 29 HIST-01: usage_tracking.analysis_id column + 4-arg record_ai_usage overload)"
  - "20260411000002_atomic_check_and_record_usage.sql (legacy atomic check_and_record_ai_usage RPC, retained for back-compat)"
  - "can_perform_ai_action RPC (read-only entitlement check)"
provides:
  - "checkEntitlement(userId, actionType): read-only entitlement check that does NOT insert a usage_tracking row"
  - "recordUsageWithAnalysis(userId, actionType, credits, analysisId): post-success ledger write via 4-arg record_ai_usage with p_analysis_id"
  - "checkAndRecordUsage retained (back-compat for un-migrated call sites)"
affects:
  - "Downstream Plans 36-02..36-06 (Resume, Career, LinkedIn, Recruiting Lens, Interview Prep) migrate to checkEntitlement + recordUsageWithAnalysis"
tech-stack:
  added: []
  patterns:
    - "Post-success usage ledger: persist durable per-feature row first, capture id, then recordUsageWithAnalysis(..., p_analysis_id = id)"
    - "Entitlement check decoupled from write: checkEntitlement is read-only; failed analyses leave no usage_tracking (History) row"
    - "Discriminated-union return ({ ok: true } | { ok: false; error }) so callers can branch on write outcome"
key-files:
  created: []
  modified:
    - "supabase/functions/_shared/usage-checker.ts"
    - "supabase/functions/_shared/usage-checker.test.ts"
decisions:
  - "D-13/D-14: usage-checker split into a read-only checkEntitlement and a post-success recordUsageWithAnalysis; checkAndRecordUsage kept until all call sites migrate"
  - "D-17: checkEntitlement uses the read-only can_perform_ai_action RPC and writes nothing to usage_tracking, so it reintroduces no tier-cap accounting against the History ledger"
metrics:
  duration: "~1 session (verification/closure — implementation pre-landed in commit 6aed0ba)"
  tasks: 3
  files: 2
  completed: "2026-05-30"
---

# Phase 36 Plan 01: Shared Post-Success Usage Ledger Helpers Summary

Split the shared usage helper into a read-only entitlement check (`checkEntitlement`) and a post-success ledger writer (`recordUsageWithAnalysis`) that populates `usage_tracking.analysis_id` via the Phase 29 4-arg `record_ai_usage` overload, while preserving `checkAndRecordUsage` for back-compat — giving HIST-06 a reusable foundation for all five features.

## What Shipped

- **`checkEntitlement(userId, actionType): Promise<UsageCheckResult>`** (`usage-checker.ts:67-94`) — read-only entitlement check that calls the `can_perform_ai_action` RPC and returns `{ allowed, resetDate, tier }`. It never inserts a `usage_tracking` row, so a failed analysis (which checks entitlement but never reaches the post-success write) leaves no Activity History row. Fails closed (`allowed: false`, `tier: 'unknown'`) on RPC error.
- **`recordUsageWithAnalysis(userId, actionType, credits, analysisId): Promise<{ ok: true } | { ok: false; error: string }>`** (`usage-checker.ts:100-122`) — thin wrapper over the 4-arg `record_ai_usage` RPC. Payload is `{ p_user_id, p_action_type, p_credits, p_analysis_id }` so the durable per-feature row id is linked into the History ledger. Returns a discriminated union so callers can branch on success/failure; logs only the error object (no secrets / row contents).
- **`checkAndRecordUsage`** is retained unchanged (`usage-checker.ts:19-61`) so older pre-write call sites continue to compile and run until Plans 36-02..36-06 migrate them.
- **Contract tests** (`usage-checker.test.ts`) — three Deno tests using an RPC stub on the singleton service client:
  1. `checkEntitlement` calls `can_perform_ai_action` (and only that) and maps the result to `{ allowed, tier, resetDate }`.
  2. `recordUsageWithAnalysis` calls 4-arg `record_ai_usage` with `p_analysis_id` and returns `{ ok: true }`.
  3. `checkEntitlement` fails closed on RPC error.
  Test 1 also proves `checkEntitlement` does NOT touch the atomic `check_and_record_ai_usage` write path (the stub raises on any unexpected RPC name and the call count is asserted to be exactly 1 against `can_perform_ai_action`).

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Add entitlement-only helper | Complete | `usage-checker.ts:67-94` — `checkEntitlement`, read-only via `can_perform_ai_action`, fail-closed |
| 2 | Add post-success usage writer | Complete | `usage-checker.ts:100-122` — `recordUsageWithAnalysis`, 4-arg RPC with `p_analysis_id`, `{ ok }` union |
| 3 | Cover helper contracts | Complete | `usage-checker.test.ts` — 3 Deno contract tests, all passing |

## Verification

- `deno test --allow-read --allow-env supabase/functions/_shared/usage-checker.test.ts` → **`ok | 3 passed | 0 failed`** (run in this session; deno 2.7.1). Note: `--allow-env` is required in addition to `--allow-read` because the test imports `getServiceClient`, which reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (the test sets stub values).
- `rg -n "check_and_record_ai_usage" supabase/functions/_shared/usage-checker.ts` → matches only inside the back-compat `checkAndRecordUsage` helper (line 28). `checkEntitlement` and `recordUsageWithAnalysis` do not reference the atomic write path.

## Acceptance Criteria

**Task 1 (`checkEntitlement`)**
- Helper name is `checkEntitlement` — PASS (line 67)
- Does not call `record_ai_usage` or `check_and_record_ai_usage` — PASS (only `can_perform_ai_action`; test 1 enforces via call-count assertion + raise-on-unexpected stub)
- Fail-closed with `allowed: false` — PASS (lines 78-81: returns `{ allowed: false, resetDate: '', tier: 'unknown' }` on error)

**Task 2 (`recordUsageWithAnalysis`)**
- RPC payload includes `p_analysis_id: analysisId` — PASS (line 113)
- Caller can distinguish success from failure — PASS (`{ ok: true } | { ok: false; error: string }`)
- No secrets or row contents logged — PASS (logs only the supabase error object on failure)

**Task 3 (tests)**
- Proves `recordUsageWithAnalysis` calls `record_ai_usage` with `p_analysis_id` — PASS (test, lines 64-86)
- Proves `checkEntitlement` does not call the atomic `check_and_record_ai_usage` write path — PASS (test, lines 34-62)

## D-17 Confirmation (tier-cap dependency)

Per D-17, `usage_tracking` may be treated as a post-success History ledger only once the tier-cap paywall no longer depends on `usage_tracking` counts (Phase 30 MER-11/12 moves the cap onto the merit gateway). `checkEntitlement` reads entitlement via `can_perform_ai_action` and writes nothing to `usage_tracking`; it therefore introduces no tier-cap accounting against the ledger and is compatible with the merit-gateway-only target. The split is the correct cutover point and does not re-establish a `usage_tracking`-based cap.

## Deviations from Plan

**Discovery — work pre-landed:** All three tasks were already implemented and committed in HEAD `6aed0ba` ("feat: Implement history persistence for resume analysis and LinkedIn grading"), together with the matching contract tests in `usage-checker.test.ts` (git-tracked). The working tree was clean versus HEAD for both files (`git diff --stat HEAD` empty, `git status --short` empty). No source changes were required for this plan, so no new per-task code commit was produced — the implementation commit already exists in history. This is a verification/closure pass, not a Rule 1-4 deviation; no behavior was changed. The plan-level verification commands were executed in this session and pass (see Verification above).

## Self-Check: PASSED

- `supabase/functions/_shared/usage-checker.ts` — FOUND (tracked, HEAD 6aed0ba)
- `supabase/functions/_shared/usage-checker.test.ts` — FOUND (tracked, HEAD 6aed0ba)
- Implementation commit `6aed0ba` — FOUND in git history
- Deno test run — 3 passed / 0 failed
