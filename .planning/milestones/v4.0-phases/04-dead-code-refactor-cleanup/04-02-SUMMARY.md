---
phase: 04-dead-code-refactor-cleanup
plan: 02
subsystem: ui
tags: [dead-code, knip, verify-baseline, react, lock-primitives, deprecated-component]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: DEAD-CODE.md (ProFeatureBlur row) + KEEP-LIST.md Keep-Class 5 (deprecated-but-imported lock primitives)
  - phase: 04-dead-code-refactor-cleanup
    provides: "04-01 per-removal protocol (verify:baseline green-before/green-after) + RESIDUAL-REGISTER.md"
  - phase: 01-testing-strategy-regression-baseline
    provides: verify:baseline spine gate (the per-removal green-before/green-after protocol)
provides:
  - "Entire sectional-lock surface removed as one closed unit (D-03): /dev/locked-sections route + import, LockedSectionsSandbox page, LockedSection + LockedListItem primitives + their co-located tests, and the @deprecated ProFeatureBlur"
  - "Zero remaining importers proven; only career-compass test-file prose comments mention the names (untouched)"
  - "ProFeatureBlur cleared off the audit:deadcode React dead-list (Keep-Class 5 resolved by removing the route per D-03)"
affects: [04-04, 04-05, dead-code, CLEAN-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Remove-the-only-entry-first: delete the routed entry (the DEV sandbox route) BEFORE deleting the page it mounts, so the whole reachable-only-via-it cluster becomes zero-importer and removable as one atomic commit"
    - "Per-removal baseline gating: verify:baseline green BEFORE and AFTER the removal commit (D-13)"

key-files:
  created:
    - .planning/phases/04-dead-code-refactor-cleanup/04-02-SUMMARY.md
  modified:
    - src/App.tsx
  deleted:
    - src/pages/dev/LockedSectionsSandbox.tsx
    - src/components/LockedSection.tsx
    - src/components/LockedSection.test.tsx
    - src/components/LockedListItem.tsx
    - src/components/LockedListItem.test.tsx
    - src/components/ProFeatureBlur.tsx

key-decisions:
  - "Per D-03, removed the ENTIRE sectional-lock surface as one unit (route + sandbox + LockedSection/LockedListItem primitives + co-located tests + @deprecated ProFeatureBlur). The primitives were reachable ONLY via the DEV-gated /dev/locked-sections route, so deleting the route first made the whole cluster zero-importer and behavior-preserving."
  - "Career-compass test files (ReadinessTab.test.tsx / RolesTab.test.tsx) left UNTOUCHED — their LockedSection mentions are JSDoc/prose comments, not imports."
  - "EliteFeatureGate (imported by the deleted sandbox) was NOT removed and did NOT become a new dead-code finding — its co-located test keeps it referenced; out of scope for this plan."

patterns-established:
  - "Pattern: Keep-Class 5 (deprecated-but-imported) clears only by removing the LIVE entry that imports it. The route deletion (D-03 decision) is what made ProFeatureBlur + the lock primitives genuinely zero-importer, not an assumption."

requirements-completed: [CLEAN-02]

# Metrics
duration: ~5min
completed: 2026-06-14
---

# Phase 04 Plan 02: Sectional-Lock Surface Removal Summary

**The entire sectional-lock UI surface removed as one atomic, behavior-preserving commit (D-03): the DEV-gated `/dev/locked-sections` route + `LockedSectionsSandbox` page, the `LockedSection`/`LockedListItem` primitives and their co-located tests, and the `@deprecated` `ProFeatureBlur` — 6 files deleted + App.tsx edited, baseline green before and after.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-14T08:31:41Z
- **Completed:** 2026-06-14T08:37:24Z
- **Tasks:** 2 (Task 1 + Task 2 committed together as one atomic lock-surface removal)
- **Files removed:** 6; **Files modified:** 1 (App.tsx)

## Accomplishments
- Removed the DEV-gated `/dev/locked-sections` route + its `LockedSectionsSandbox` import from `src/App.tsx` FIRST, so the sandbox page had no live referencer before deletion.
- Deleted the lock-primitive cluster as one unit: `LockedSectionsSandbox.tsx`, `LockedSection.tsx`, `LockedListItem.tsx`, their two co-located tests, and the `@deprecated ProFeatureBlur.tsx` (zero importers; JSDoc-only reference).
- Proved zero remaining importers — the only surviving mentions are prose comments in two career-compass test files, which were left untouched.
- Cleared `ProFeatureBlur` off the `audit:deadcode` React dead-list (Keep-Class 5 resolved by the D-03 route removal); no new dead-code findings introduced (EliteFeatureGate did NOT become a new finding).
- `src/pages/dev/` directory is now empty/gone; `/dev/locked-sections` no longer resolves.

## Task Commits

Task 1 and Task 2 were committed together as one atomic lock-surface removal (per the plan's instruction to commit both as a single reversible unit):

1. **Task 1 + Task 2: Remove sectional-lock surface** — `d0410eb` (chore) — App.tsx route/import removal + 6 cluster files deleted

**Plan metadata:** (this SUMMARY + STATE.md) committed separately as the final docs commit.

## Files Created/Modified
- `src/App.tsx` — MODIFIED (removed the `LockedSectionsSandbox` import line + the DEV `<Route path="/dev/locked-sections" …>` block; 4 deletions, nothing else)
- `src/pages/dev/LockedSectionsSandbox.tsx` — DELETED (the only reachable entry to the cluster; dir now empty)
- `src/components/LockedSection.tsx` — DELETED (primitive)
- `src/components/LockedSection.test.tsx` — DELETED (co-located test, 6 cases — GATE-05)
- `src/components/LockedListItem.tsx` — DELETED (primitive)
- `src/components/LockedListItem.test.tsx` — DELETED (co-located test, 5 cases — GATE-06)
- `src/components/ProFeatureBlur.tsx` — DELETED (`@deprecated`, zero importers, JSDoc-only ref)

## Removal Set + Zero-Importer Proof

**Importer sweep AFTER deletion** (`rg "LockedSection|LockedListItem|ProFeatureBlur" src`):
```
src/components/career-compass/ReadinessTab.test.tsx:13: * LockedSection for the skill-assessments gate; the tests assert that behavior.
src/components/career-compass/RolesTab.test.tsx:6:  *   (the implementation uses BlurredLockCard instead of the deprecated LockedSection)
```
Both surviving hits are JSDoc/prose **comments** (`*`-prefixed), NOT `import` statements — exactly the two career-compass test files the plan flagged DO-NOT-TOUCH. `git status` shows them unchanged. `LockedSectionsSandbox` and `/dev/locked-sections` return **zero** hits across `src`.

**audit:deadcode delta** (`npm run audit:deadcode`):
- `ProFeatureBlur.tsx` — **removed** from the knip React dead-file list (was DEAD-CODE.md row 8). No longer present.
- `LockedSection.tsx` / `LockedListItem.tsx` / `LockedSectionsSandbox.tsx` — gone (deleted).
- `EliteFeatureGate.tsx` — **NOT a new finding** (its co-located test keeps it referenced); deleting the sandbox did not orphan it.
- Deno dead candidates unchanged from the 04-01 baseline: `resolve-tier.ts` + 2 stripe test-helpers. No new entries anywhere.

## Decisions Made
- **Removed the whole surface as one unit (D-03)** — route + sandbox + primitives + co-located tests + `@deprecated ProFeatureBlur` deleted together. The primitives were reachable ONLY via the DEV-gated route, so removing the route first made the cluster genuinely zero-importer (Keep-Class 5 cleared by the live-entry removal, not assumed).
- **Career-compass tests untouched** — their `LockedSection` mentions are prose comments, not imports.
- **EliteFeatureGate kept** — imported by the deleted sandbox, but it is a live component with its own co-located test; out of this plan's scope and confirmed it did not become a new dead-code finding.

## Deviations from Plan

### 1. [Reconciliation — plan-prediction arithmetic, not a functional deviation] vitest landed at 457/457, not the plan's stated "466/466"

- **Found during:** Task 2 (green-AFTER `verify:baseline`)
- **Issue:** The plan predicted vitest would "drop by exactly 2 … → 466/466". The actual result is **457 passed (457)** — a drop of 11 test CASES, not 2.
- **Root cause:** The plan conflated test FILES with test CASES. The drop IS "exactly 2" at the FILE level (Test Files **81 → 79**, the two deleted co-located test files `LockedSection.test.tsx` + `LockedListItem.test.tsx`), which is what "exactly 2" correctly describes. But those two files held **6 + 5 = 11** test cases between them (GATE-05 = 6, GATE-06 = 5), so the case count drops 468 → **457**. The "466" in the plan assumed 1 case per file — an arithmetic mis-statement in the plan, not a missing/broken test.
- **Fix / reconciliation:** No code or test change. Counted the cases in each deleted file (`git show HEAD:…` → 6 and 5) to fully account for the −11. Every disappeared case maps to a deleted co-located lock-primitive test; zero production tests lost.
- **Files modified:** none (reconciliation only)
- **Verification:** `verify:baseline` exit 0 — vitest **79 files / 457 cases**, deno **284 / 0**, Playwright **5 passed + 1 skipped**. The FILE-level "exactly 2" the plan intended is satisfied.
- **Committed in:** n/a (no source change; recorded here + reflected in the removal commit message)

---

**Total deviations:** 1 (reconciliation — plan stated the post-removal vitest count using a files=cases assumption; actual is 457, fully accounted for as the 11 cases in the 2 deleted test files).
**Impact on plan:** None functional. The removal is exactly as designed (the two deleted co-located test files = the "exactly 2" file delta); only the plan's predicted case-count number was off. No scope creep, no production test lost.

## Verification Evidence

**`npm run verify:baseline` — exit 0 (green AFTER, at HEAD `d0410eb`):**
- vitest: **457 passed (457)** across **79** files (was 468/81 → −11 cases / −2 files: the two deleted lock-primitive co-located tests)
- deno (test:edge): **284 passed | 0 failed**
- Playwright (test:e2e): **5 passed, 1 skipped** (the 4242 card-fill quarantine)

**Green-BEFORE gate (D-13)** was confirmed first: vitest 468/468, deno 284/0, Playwright 5+1skip — exit 0 before any edit.

**`npm run build` — exit 0** after the deletions (3239 modules transformed, no dangling `LockedSectionsSandbox` reference).

**`git show --stat HEAD`** = exactly 7 entries: `src/App.tsx` (4 deletions) + the 6 deleted cluster files. No career-compass test files in the commit.

## Issues Encountered
- None beyond the vitest count reconciliation documented under Deviations (a plan-prediction arithmetic mismatch, not a runtime problem).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Wave 2 continues unblocked. The lock-primitive surface is fully retired; `ProFeatureBlur` is off the dead-list, so 04-04/04-05 recomputes start from a cleaner React surface.
- **Carry-forward (unchanged):** MinimalHero (R-01) remains the sole deferred residual from 04-01, still a CLEAN-05 candidate once its `readFileSync` test consumer is reconciled. No new residuals added by this plan.

## Self-Check: PASSED
- `src/pages/dev/LockedSectionsSandbox.tsx` — ABSENT (confirmed gone) ✓
- `src/components/LockedSection.tsx` — ABSENT ✓
- `src/components/LockedSection.test.tsx` — ABSENT ✓
- `src/components/LockedListItem.tsx` — ABSENT ✓
- `src/components/LockedListItem.test.tsx` — ABSENT ✓
- `src/components/ProFeatureBlur.tsx` — ABSENT ✓
- `src/App.tsx` — present, `LockedSectionsSandbox`/`/dev/locked-sections` return zero hits ✓
- Commit `d0410eb` — exists in `git log` ✓
- Career-compass test files — present and unmodified ✓

---
*Phase: 04-dead-code-refactor-cleanup*
*Completed: 2026-06-14*
