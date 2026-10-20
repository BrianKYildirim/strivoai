---
phase: 30
plan: 05
subsystem: edge-function
tags: [edge-function, analyze-resume, merit-gateway, legacy-branch-removal, tests, D-15, MER-12]
requires:
  - 30-02 (merit gateway shipped; readMeritFlag + MERIT_SYSTEM_ENABLED kept exported for the other 9 importers)
provides:
  - analyze-resume runs the merit gateway unconditionally; legacy can_perform_ai_action branch deleted
  - canonical reference shape for the future cross-function legacy-branch sweep (Deferred Idea)
affects:
  - supabase/functions/analyze-resume/index.ts (legacy branch deleted, branch guard collapsed)
  - supabase/functions/analyze-resume/test-07.test.ts (Test 4 rewritten)
  - supabase/functions/analyze-resume/merit-branch.test.ts (rewritten)
  - supabase/functions/analyze-resume/legacy-unchanged.test.ts (deleted)
tech-stack:
  added: []
  patterns:
    - "Unconditional merit gateway call after a `userContext` guard early-return"
    - "Bare block `{ ... }` to preserve verbatim body when collapsing a removed branch wrapper"
key-files:
  created: []
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-resume/test-07.test.ts
    - supabase/functions/analyze-resume/merit-branch.test.ts
  deleted:
    - supabase/functions/analyze-resume/legacy-unchanged.test.ts
decisions:
  - "D-15 implementation: legacy can_perform_ai_action branch removed only from analyze-resume; MERIT_SYSTEM_ENABLED + readMeritFlag stay exported (9 other edge functions still import them — cross-function sweep deferred per quality_gate guidance)."
  - "Used a bare block `{ ... }` instead of dedenting the merit-path body, so the inner ~360 lines preserve verbatim formatting and remain trivially diff-reviewable."
metrics:
  duration_min: 18
  completed_date: 2026-05-19
  tasks_completed: 2
  files_modified: 3
  files_deleted: 1
  net_lines_removed: 732
---

# Phase 30 Plan 05: Free-Tier 10-Month Cap — Rip Legacy can_perform_ai_action Branch from analyze-resume Summary

Removed the `MERIT_SYSTEM_ENABLED` env-var branch guard and the entire legacy `can_perform_ai_action`/`createUsageLimitResponse` path from `supabase/functions/analyze-resume/index.ts`, making the merit gateway the only enforcement path for resume analysis; rewrote/deleted three Deno test files so their assertions match the new unconditional-merit contract.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Rip MERIT_SYSTEM_ENABLED branch + legacy path from analyze-resume | `6d69593` | supabase/functions/analyze-resume/index.ts |
| 2 | Rewrite test-07 Test 4 + merit-branch.test.ts; delete legacy-unchanged.test.ts | `604646d` | test-07.test.ts, merit-branch.test.ts, legacy-unchanged.test.ts (deleted) |

## Exact Edits — `analyze-resume/index.ts`

So a future phase can mirror the pattern across the 9 other importers, here is the precise diff shape:

| Change | Original location (pre-edit line) | Operation |
|--------|-----------------------------------|-----------|
| `import { createUsageLimitResponse } from '../_shared/usage-checker.ts';` | line 3 | deleted (this file's import only — the helper stays exported) |
| `import { MERIT_SYSTEM_ENABLED, withMerits, MeritRefundable, refundMeritsForJob } from '../_shared/merit-gateway.ts';` | line 13 | narrowed to drop `MERIT_SYSTEM_ENABLED` only |
| `// Phase 21 D-19: boot-time merit-flag attestation` + `createLogger("analyze-resume").info("merit-flag", { enabled: MERIT_SYSTEM_ENABLED });` | lines 17–18 | deleted (both lines) |
| `// === Phase 13 branch (D-06) ===` + `// MIG-05: legacy path below is byte-identical until MERIT_SYSTEM_ENABLED flips to true.` + `if (MERIT_SYSTEM_ENABLED && userContext) {` | lines 376–378 | replaced with a `userContext`-required early-401 + a bare block `{` that holds the merit body verbatim |
| Legacy path (entire body): blank line + `// === Legacy path (unchanged — MIG-05 regression test pins this) ===` through the legacy final `return new Response(JSON.stringify(analysisResult), …);` | lines 744–1444 | deleted (700 lines) |

Net: **+10 / −709** in a single file (one commit).

### The new 401 early-return

```ts
if (!userContext) {
  return new Response(
    JSON.stringify({ error: 'unauthorized' }),
    { status: 401, headers: { ...corsHeaders({ type: 'user', extraHeaders: 'x-internal-job-secret' }), 'Content-Type': 'application/json' } }
  );
}
```

This replaces the previous fall-through-to-legacy behavior. The internal-worker path (which used to satisfy `userId || authenticatedUserId` via `userId` from the body) is no longer reachable here — callers without a JWT (i.e., the `process-resume-analysis-job` worker) must continue to use `submit-resume-analysis-job` / `process-resume-analysis-job`, which already run the merit gateway in their own handlers.

## MERIT_SYSTEM_ENABLED Deferral Rationale

`MERIT_SYSTEM_ENABLED` and `readMeritFlag()` remain exported from `supabase/functions/_shared/merit-gateway.ts` because **9 other edge functions still import the flag**:

```text
supabase/functions/analyze-career/index.ts
supabase/functions/analyze-skills-gap/index.ts
supabase/functions/compare-jobs/index.ts
supabase/functions/grade-linkedin/index.ts
supabase/functions/interview-prep-analyze/index.ts
supabase/functions/interview-prep-evaluate/index.ts
supabase/functions/recruiting-lens/index.ts
supabase/functions/submit-career-analysis-job/index.ts
supabase/functions/submit-resume-analysis-job/index.ts
```

Phase 30 (per quality_gate guidance resolving RESEARCH Open Question 1) deliberately narrowed scope: this plan removes only `analyze-resume`'s legacy branch. A future phase will sweep the remaining 9 functions and finally drop the `MERIT_SYSTEM_ENABLED` export. `_shared/merit-gateway.ts` and `_shared/usage-checker.ts` were **not touched** in this plan (verified by `git diff`).

## Test Rewrites

### `test-07.test.ts` — Test 4 before / after

**Before (45 lines):** Title `TEST-07/4: MERIT_SYSTEM_ENABLED=false -> legacy path, zero merit_transactions`. Asserted that the source contained `if (MERIT_SYSTEM_ENABLED && userContext)`, `can_perform_ai_action`, `createUsageLimitResponse`, and that the legacy path appeared **after** the merit branch.

**After (32 lines):** Title `TEST-07/4: analyze-resume runs unconditional merit path`. Five assertions:

1. Positive: `withMerits(` appears.
2. Positive: `'resume_analysis'` appears.
3. Negative: `MERIT_SYSTEM_ENABLED` is absent from the source.
4. Negative: `can_perform_ai_action` is absent.
5. Negative: `createUsageLimitResponse` is absent.

Tests 1, 2, 3 in `test-07.test.ts` were not touched (they exercise the merit-deduction / refund / idempotency contract via mock RPCs and remain valid).

### `merit-branch.test.ts` — first test rewritten

**Before:** `analyze-resume imports MERIT_SYSTEM_ENABLED from merit-gateway.ts` — asserted both `MERIT_SYSTEM_ENABLED` substring and the import path.

**After:** `analyze-resume imports withMerits from merit-gateway.ts (unconditional)` — asserts `withMerits` is imported from the gateway AND that `MERIT_SYSTEM_ENABLED` is absent from the file.

The other two tests in this file (`withMerits` call site, `MeritRefundable` import presence) were preserved.

### `legacy-unchanged.test.ts` — deleted

The file's premise (legacy substrings `can_perform_ai_action`, `createUsageLimitResponse`, `usageUserId` must be present in `analyze-resume/index.ts`) is inverted by D-15. All three of its `Deno.test` cases would now fail. Deleted entirely.

## Verification

```bash
# Negative grep — operative legacy tokens absent
grep -nE "MERIT_SYSTEM_ENABLED|can_perform_ai_action|createUsageLimitResponse" \
  supabase/functions/analyze-resume/index.ts
# → no matches

# Positive grep — merit gateway is wired
grep -nE "withMerits\\(|'resume_analysis'" \
  supabase/functions/analyze-resume/index.ts
# → 382:      const gated = await withMerits(
# → 384:        'resume_analysis',

# Gateway helpers still exported for the other 9 importers
grep -nE "MERIT_SYSTEM_ENABLED|readMeritFlag" supabase/functions/_shared/merit-gateway.ts
# → 27:export const MERIT_SYSTEM_ENABLED = ...
# → 31:export function readMeritFlag(): boolean { ... }

# Deno tests pass
deno test --allow-all --no-check \
  supabase/functions/analyze-resume/test-07.test.ts \
  supabase/functions/analyze-resume/merit-branch.test.ts
# → ok | 7 passed | 0 failed

# legacy-unchanged.test.ts gone
test ! -f supabase/functions/analyze-resume/legacy-unchanged.test.ts
# → true

# No other edge functions modified
git diff --name-only HEAD~2 HEAD -- supabase/functions/
# → supabase/functions/analyze-resume/index.ts
# → supabase/functions/analyze-resume/test-07.test.ts
# → supabase/functions/analyze-resume/merit-branch.test.ts
# → supabase/functions/analyze-resume/legacy-unchanged.test.ts (deleted)
```

### TypeScript health

`deno check --no-lock supabase/functions/analyze-resume/index.ts` reports **8 pre-existing `TS2367` warnings** (all inside the preserved merit-path body, on `resolvedTier === 'free'` comparisons that TS narrows away after the free-tier early `return`). The count went from **16 → 8** because the legacy block contributed 8 of them and was deleted. No new TS errors were introduced by this plan.

## Deviations from Plan

### Auto-fixed: scope of `usageUserId` removal narrowed (Rule 1 — preserve correctness)

- **Found during:** Task 1 (final grep gate)
- **Plan instruction (step 5 + step 8):** simultaneously "PRESERVE VERBATIM" the merit-path body (lines 380–738) **and** assert zero matches for `usageUserId` across `analyze-resume/index.ts`.
- **Conflict:** the merit-path body itself declares and uses `usageUserId` as a local variable (originally line 385, plus ~14 reference sites further down). Deleting it would break the merit path's database writes; literally preserving it means the grep gate has one match.
- **Resolution:** Preserved correctness. The merit body is unchanged (every `usageUserId` site there is functional code). The legacy `usageUserId` declaration and its references (lines 747+) were deleted along with the rest of the legacy block, which was the intent the plan author actually documented in step 5. The operative tokens (`MERIT_SYSTEM_ENABLED`, `can_perform_ai_action`, `createUsageLimitResponse`) all return zero matches as required.
- **Verification:** all functional behavior of the merit path is identical to pre-edit; the 7-test Deno suite passes.

### Reworded the new comment to avoid a false grep positive (Rule 1)

- **Found during:** Task 1 grep gate.
- **Issue:** my initial replacement comment read `// Legacy can_perform_ai_action branch removed; userContext is required.` — the substring `can_perform_ai_action` inside the comment was flagged by the negative grep.
- **Fix:** Reworded to `// Legacy usage-check branch removed; userContext is required.`
- **Commit:** included in `6d69593`.

## Known Stubs

None. The merit path was already production-shipping (Phase 13+); this plan only deletes a dead alternate branch and the env-var that selected between them.

## Deferred Issues

- **Pre-existing TS narrowing warnings (8x `TS2367`):** the merit-path body has `resolvedTier === 'free'` comparisons that TS narrows away after the free-tier early `return` at the top of the parallel section. Out of scope for Phase 30 (preserve-verbatim constraint). Worth a small follow-up to either widen the type or restructure the free-tier short-circuit so TS doesn't complain.
- **Cross-function `MERIT_SYSTEM_ENABLED` sweep:** the 9 other edge functions listed above still import the flag. Future phase will mirror this plan across them, then drop the export from `_shared/merit-gateway.ts`.

## Threat Flags

None — no new attack surface. The 401 early-return tightens the auth posture (legacy path previously allowed `userContext = null` to fall through and run the legacy usage check using `userId` from the request body — now blocked).

## Self-Check: PASSED

- File `supabase/functions/analyze-resume/index.ts` exists and references `withMerits(` and `'resume_analysis'` (verified by grep)
- File `supabase/functions/analyze-resume/test-07.test.ts` exists with the renamed `TEST-07/4: analyze-resume runs unconditional merit path` test
- File `supabase/functions/analyze-resume/merit-branch.test.ts` exists with the rewritten `withMerits` import test
- File `supabase/functions/analyze-resume/legacy-unchanged.test.ts` does NOT exist (verified by `test ! -f`)
- Commit `6d69593` present on `staging` (Task 1)
- Commit `604646d` present on `staging` (Task 2)
- `_shared/merit-gateway.ts` and `_shared/usage-checker.ts` unchanged (verified via `git diff HEAD~2..HEAD --name-only`)
- 9 other edge functions still importing `MERIT_SYSTEM_ENABLED` untouched (verified by `grep -l`)
