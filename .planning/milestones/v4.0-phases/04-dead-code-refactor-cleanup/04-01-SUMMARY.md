---
phase: 04-dead-code-refactor-cleanup
plan: 01
subsystem: testing
tags: [dead-code, knip, deno-reachability, verify-baseline, react, deno]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: DEAD-CODE.md catalog + KEEP-LIST.md gate (the safe/investigate verdicts)
  - phase: 01-testing-strategy-regression-baseline
    provides: verify:baseline spine gate (the per-removal green-before/green-after protocol)
provides:
  - 4 confirmed-dead files removed (2 React landing components + 1 Deno _shared pair)
  - Per-removal protocol established (verify:baseline green pre → specific-path removal → green post → audit:deadcode shrank-by-exactly-this-set)
  - Deno _shared reachability surface shrunk FIRST so 04-04's recompute is unambiguous
  - RESIDUAL-REGISTER.md created (append-only) with R-01 (MinimalHero deferral)
affects: [04-04, 04-05, dead-code, residual-register, CLEAN-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-removal baseline gating: verify:baseline green BEFORE and AFTER each removal commit (D-13)"
    - "Residual register (D-01): document-what-cannot-be-cleared, append-only, with a concrete clearance criterion"

key-files:
  created:
    - .planning/audit/RESIDUAL-REGISTER.md
  modified: []
  deleted:
    - src/components/HowItWorks.tsx
    - src/components/NavLink.tsx
    - supabase/functions/_shared/handler.ts
    - supabase/functions/_shared/errors.ts

key-decisions:
  - "MinimalHero.tsx DEFERRED (not removed): audit mis-classified it `safe`, but it has a live dynamic string-path consumer (readFileSync in src/pages/__tests__/document-extraction-secondary.test.ts). Removing it turns verify:baseline RED. Per approved checkpoint Option A, left in place, no test edited, recorded as R-01."
  - "Deno _shared pair (handler.ts + errors.ts) removed together — handler was the only external referencer of errors; removing as a pair leaves no broken import on any reachable entrypoint."

patterns-established:
  - "Pattern: Multi-signal removability bar (D-09) — a knip `safe` verdict is NOT sufficient; a dynamic/string-path consumer (KEEP-LIST Class 4) blocks removal and routes the item to the residual register."

requirements-completed: [CLEAN-02]

# Metrics
duration: ~1min (execution); closed out + re-verified in resume session
completed: 2026-06-14
---

# Phase 04 Plan 01: Safe-Baseline Dead-Code Removal Summary

**4 of 5 confirmed-`safe` audit rows removed (2 dead React landing components + the dead Deno `_shared` handler/errors pair); MinimalHero deferred to the residual register (R-01) because a live `readFileSync` test consumer blocks it — baseline green before and after.**

## Performance

- **Duration:** ~1 min (original execution commits 01:06:23–01:07:21); SUMMARY + re-verification done in the resume session
- **Started:** 2026-06-14T01:06:23-07:00
- **Completed:** 2026-06-14T01:07:21-07:00
- **Tasks:** 2 (Task 1 with an approved deviation; Task 2 clean)
- **Files removed:** 4 (planned 5; 1 deferred)

## Accomplishments
- Removed the 2 cleanly-dead React landing components: `src/components/HowItWorks.tsx`, `src/components/NavLink.tsx` (the ROUTED `src/pages/HowItWorks.tsx` is intact; `/how-it-works` unaffected).
- Removed the dead Deno `_shared` pair `handler.ts` + `errors.ts` as one unit — no reachable edge function lost an import.
- Shrunk the Deno reachability surface FIRST (36/39 reachable now) so plan 04-04's recompute starts from a clean baseline.
- Created `.planning/audit/RESIDUAL-REGISTER.md` (append-only) recording R-01, the MinimalHero deferral, with a concrete clearance criterion.

## Task Commits

1. **Task 1: Remove safe React dead landing components** — `896df4f` (refactor) — removed HowItWorks + NavLink (MinimalHero deferred; see deviation)
2. **Task 2: Remove dead Deno _shared pair** — `f4def89` (refactor) — removed handler.ts + errors.ts
3. **Residual register (deviation record)** — `a9e659c` (docs) — RESIDUAL-REGISTER.md with R-01

## Files Created/Modified
- `src/components/HowItWorks.tsx` — DELETED (dead landing component; distinct from the routed page)
- `src/components/NavLink.tsx` — DELETED (dead landing component)
- `supabase/functions/_shared/handler.ts` — DELETED (dead; only external referencer of errors.ts)
- `supabase/functions/_shared/errors.ts` — DELETED (dead; consumed only by handler.ts)
- `.planning/audit/RESIDUAL-REGISTER.md` — CREATED (R-01 MinimalHero deferral)

## Decisions Made
- **MinimalHero left in place, no test edited** — per the approved checkpoint (Option A). It is mis-classified `safe` by the audit but is read at runtime by a test via `readFileSync('src/components/MinimalHero.tsx')`, so deleting it would throw ENOENT and turn `verify:baseline` RED. Routed to R-01 with the clearance criterion (reconcile the 4 references in `src/pages/__tests__/document-extraction-secondary.test.ts`).
- **Deno pair removed together** — handler depends on errors; removing only one would break the other.

## Deviations from Plan

### 1. [Approved checkpoint deviation — Missing/Investigate] MinimalHero deferred instead of removed
- **Found during:** Task 1 (Remove safe React dead landing components)
- **Issue:** The plan called for removing 3 React components (HowItWorks, MinimalHero, NavLink). On inspection, `MinimalHero.tsx` has a **live dynamic string-path consumer** — `src/pages/__tests__/document-extraction-secondary.test.ts` reads its source via a `readFileSync`-backed `source('src/components/MinimalHero.tsx')` helper and asserts on its content (refs ~L14/84/94/95, helper ~L108). This is a KEEP-LIST Class 4 (dynamic reference) blind spot the bare-word, test-excluded importer grep missed. Deleting it makes `verify:baseline` RED.
- **Fix:** Left MinimalHero in place; no test edited. Documented as **R-01** in a new `RESIDUAL-REGISTER.md` (per D-01) with a concrete clearance criterion for a follow-up plan (CLEAN-05 sweep or dedicated plan).
- **Files modified:** `.planning/audit/RESIDUAL-REGISTER.md` (created)
- **Verification:** `verify:baseline` green AFTER (would have been RED had MinimalHero been removed); `audit:deadcode` still lists MinimalHero as the known deferred residual.
- **Committed in:** `a9e659c` (docs)

---

**Total deviations:** 1 (approved checkpoint deviation — actual removal delta −4 vs planned −5)
**Impact on plan:** Net-positive — caught a genuine audit mis-classification before it broke the baseline. No scope creep; the deferred item is tracked with a clearance path. CLEAN-02 safe-baseline portion satisfied for the 4 clearable rows; MinimalHero carried forward.

## Verification Evidence

**`npm run verify:baseline` — exit 0 (green AFTER, at HEAD `a9e659c`):**
- vitest: **468 passed (468)** across 81 files — unchanged (none of the removed files had a co-located test)
- deno (test:edge): **284 passed | 0 failed**
- Playwright (test:e2e): **5 passed, 1 skipped** (the 4242 card-fill quarantine)

**`npm run audit:deadcode` — delta consistent with exactly −4:**
- React dead-file list no longer contains `components/HowItWorks.tsx` or `NavLink.tsx`; `MinimalHero.tsx` remains (deferred R-01); no new React findings.
- Deno reachability: dead candidates now `resolve-tier.ts`, `test-helpers/stripe-fixtures.ts`, `test-helpers/stripe-signature.ts` — `handler.ts` + `errors.ts` are gone; reachable `_shared` modules 36/39; every other entrypoint still reachable (recompute explainable as exactly −2, no new dead candidate).

## Issues Encountered
- SUMMARY.md was not written in the original execution session (context ended after the docs commit), which tripped the safe-resume gate on re-entry. Resolved by closing out manually: re-ran `verify:baseline` (green) + `audit:deadcode` (consistent) to ground the evidence, then authored this SUMMARY. No re-execution — the on-disk state matched the commits exactly.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Wave 2 (04-02, 04-03, 04-04) is unblocked: the Deno reachability surface is recomputed and clean, so 04-04's resolve-tier removal recompute is unambiguous.
- **Carry-forward:** MinimalHero (R-01) is a deferred residual — a candidate for the CLEAN-05 sweep (04-05) once its test consumer is reconciled.

---
*Phase: 04-dead-code-refactor-cleanup*
*Completed: 2026-06-14*
