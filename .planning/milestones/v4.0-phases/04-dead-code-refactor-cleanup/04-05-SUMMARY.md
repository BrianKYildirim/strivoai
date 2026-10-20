---
phase: 04-dead-code-refactor-cleanup
plan: 05
subsystem: testing
tags: [knip, dead-code, react, deno, cleanup, conservative-pruning, auth-redirect]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: "DEAD-CODE.md per-row verdicts, KEEP-LIST.md D-07 gate, the unused-EXPORTS table"
  - phase: 04-dead-code-refactor-cleanup (04-02, 04-03)
    provides: "the prior CLEAN-02 React-cluster removals; RESIDUAL-REGISTER.md (R-01)"
provides:
  - "8 standalone-clear dead frontend files removed (Features, Hero, NextBestAction, PDFHighlighter, PlanComparisonTable, useAuthSync, ResumeBuilder, src/types/database.ts)"
  - "src/pages/AuthCallback.tsx removed (operator-confirmed: no /auth/callback URL in the prod redirect allow-list)"
  - "AnalysisComparisonModal duplicate default+named export collapsed to a single canonical named export"
  - "conservative-by-signal export prune: ZERO exports pruned (every candidate had a blocking signal) — all KEPT-and-documented"
  - "RESIDUAL-REGISTER.md updated with the AuthCallback gate outcome + the kept-by-signal export table"
affects: [04-06, 05-deep-test-coverage, CLEAN-05 sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conservative-by-signal pruning (D-09): an export is removed ONLY when every signal clears; in-file / test-string / cross-layer-edge / barrel-stability consumers all KEEP the export"
    - "cheap-residual re-check before deletion (use-mobile ui/** grep, database.ts read-to-confirm) — a fired check converts a delete into a KEEP-and-document"
    - "operator-gated auth-surface removal: external dashboard allow-list confirmation before removing a redirect-string-trap page"

key-files:
  created:
    - ".planning/phases/04-dead-code-refactor-cleanup/04-05-SUMMARY.md"
  modified:
    - "src/components/AnalysisComparisonModal.tsx (removed redundant export default)"
    - ".planning/audit/RESIDUAL-REGISTER.md (AuthCallback gate outcome + kept-by-signal table)"

key-decisions:
  - "use-mobile.tsx KEPT (not removed): live ui/sidebar.tsx consumer of useIsMobile — the ui/** blind-spot re-check FIRED"
  - "AuthCallback.tsx REMOVED on operator confirmation (no /auth/callback URL in prod project zjpjapgraoxdukdvpjes redirect allow-list)"
  - "AnalysisComparisonModal canonical export = the named `export const` (both importers use the named import); redundant `export default` removed"
  - "ZERO exports pruned — every DEAD-CODE.md unused-export candidate had a blocking signal (in-file / test-string / cross-layer-edge / barrel / R-01 live consumer) → all KEPT-and-documented per D-09"
  - "pricing-config.ts exports KEPT (knip FALSE POSITIVE — cross-layer Deno import via _shared/tier-config.ts); git diff EMPTY"
  - "ZERO clutter removed — all `//` comments in scope are load-bearing why/trade-off notes; zero production TODO/FIXME (D-10 preserve)"

patterns-established:
  - "Pattern: a fired cheap-residual re-check is recorded as a KEEP-and-document, never force-deleted"
  - "Pattern: removing nothing on a static-dead reading alone — the multi-signal gate is the bar, documented residuals capture what cannot clear"

requirements-completed: [CLEAN-02, CLEAN-04, CLEAN-05]

# Metrics
duration: 18min
completed: 2026-06-14
---

# Phase 04 Plan 05: Frontend Dead-File Closeout + Dup-Export Consolidation + Conservative Export Prune Summary

**Removed 9 dead frontend files (8 standalone + AuthCallback) and collapsed the AnalysisComparisonModal duplicate export to one canonical named export, while conservatively KEEPING every unused-export candidate (all had a blocking signal) and KEEPING use-mobile.tsx (live ui/sidebar consumer) — verify:baseline green throughout (vitest 457/457, deno 284/0, Playwright 5+1skip).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-14T10:28:00Z
- **Completed:** 2026-06-14T10:46:00Z
- **Tasks:** 3 (Task 2 was the operator gate, pre-resolved = REMOVE)
- **Files removed:** 9 source files
- **Files modified:** 2 (AnalysisComparisonModal.tsx, RESIDUAL-REGISTER.md)

## Accomplishments
- Removed the 7 standalone-clear dead React files + `src/types/database.ts` (stale hand-rolled duplicate; live `Database` type is `src/integrations/supabase/types.ts`) in one atomic commit.
- Removed `src/pages/AuthCallback.tsx` after the operator confirmed NO `/auth/callback` URL in the prod project `zjpjapgraoxdukdvpjes` Supabase dashboard redirect allow-list.
- Collapsed the `AnalysisComparisonModal` duplicate `default`+named export of the same symbol to a single canonical named export (the form both importers already use).
- Swept every unused-export candidate against the D-09 multi-signal gate: **zero pruned**, all KEPT-and-documented with the firing signal.
- Recorded the kept-by-signal export table + the AuthCallback gate outcome (verbatim) in `RESIDUAL-REGISTER.md`.

## Task Commits

1. **Task 1: Remove 8 standalone-clear dead files (use-mobile KEPT)** — `2f4e0ba` (chore)
2. **Task 2: OPERATOR GATE — AuthCallback redirect allow-list** — pre-resolved = REMOVE (no commit; gate outcome only)
3. **Task 3a: Remove dead AuthCallback page** — `319f385` (chore)
4. **Task 3b: Collapse AnalysisComparisonModal duplicate export** — `bd99053` (refactor)
5. **Task 3c: Export prune + clutter** — no source commit owed (zero exports cleared the D-09 gate; zero non-load-bearing clutter found); the verdicts are recorded in RESIDUAL-REGISTER.md (committed with this SUMMARY).

**Plan metadata:** committed with this SUMMARY + STATE.md.

## Files Created/Modified
- **Removed (commit `2f4e0ba`):** `src/components/Features.tsx`, `src/components/Hero.tsx`, `src/components/NextBestAction.tsx`, `src/components/PDFHighlighter.tsx`, `src/components/PlanComparisonTable.tsx`, `src/hooks/useAuthSync.ts`, `src/pages/ResumeBuilder.tsx`, `src/types/database.ts`
- **Removed (commit `319f385`):** `src/pages/AuthCallback.tsx`
- **Modified (commit `bd99053`):** `src/components/AnalysisComparisonModal.tsx` — removed the redundant `export default AnalysisComparisonModal` (L637); the named `export const AnalysisComparisonModal` is canonical.
- **Modified (this commit):** `.planning/audit/RESIDUAL-REGISTER.md` — AuthCallback gate outcome (Closed/Resolved) + the kept-by-signal export table + clutter outcome.

## Decisions Made

**Task 1 — cheap-residual re-checks:**
- **`use-mobile.tsx` → KEPT (not deleted).** The row-16 re-check `rg "use-mobile|useIsMobile" src/components/ui` returned a hit: `src/components/ui/sidebar.tsx` imports and calls `useIsMobile` from `@/hooks/use-mobile` (L6/L51). The knip-ignored `ui/**` blind spot fired exactly as the audit warned. KEPT-and-documented.
- **`database.ts` → REMOVED (confirmed stale duplicate).** Read confirmed it exports hand-rolled `Profile`/`Resume`/etc. interfaces (NOT the live `Database` type). `rg "types/database|@/types/database" src` (excluding self) = zero; the LIVE `Database` type is `src/integrations/supabase/types.ts` (`export type Database`). Removed.
- The 7 standalone rows each cleared their per-name exact-path importer sweep (only distinct-symbol substring matches like `ExploreFeatures`/`ActionFirstHero`/`ReadinessHero`/`LinkedInNextBestAction`, never an import of the dead module); `ResumeBuilder` had no route/navigate/Link.

**Task 2 — operator gate outcome (verbatim):**
> The operator checked the Supabase production dashboard (Authentication → URL Configuration → Redirect URLs) for the canonical prod project `zjpjapgraoxdukdvpjes` and confirmed there is **NO `/auth/callback` URL in the redirect allow-list**. AuthCallback.tsx is therefore dead (repo-side already clear) and removal is authorized. → **decision = REMOVE.**

Repo-side clearance re-confirmed at execution: `rg "/auth/callback" src` = zero, zero importers, not routed in `App.tsx`; all Supabase auth redirects target `${origin}/` or `${origin}/auth`.

**Task 3 — AnalysisComparisonModal consolidation:** both importers (`src/pages/Results.tsx` L16, `src/pages/LinkedInGrader.tsx` L15) use `import { AnalysisComparisonModal }` (named). The named `export const` is therefore canonical; the redundant `export default AnalysisComparisonModal` (L637) was removed. Rendered component is byte-identical in behavior. `audit:deadcode` no longer lists the `AnalysisComparisonModal.tsx` duplicate-export finding.

**Task 3 — conservative-by-signal export prune (D-09): ZERO pruned.** Every row of the DEAD-CODE.md unused-EXPORTS table had at least one signal that did NOT clear:
- `pricing-config.ts` (getMaxOutput/getMaxInputTokens/getMaxInputChars/getMeritCost +types) → **cross-layer edge consumer FIRES** (`_shared/tier-config.ts` L130–142) — knip FALSE POSITIVE, MANDATORY KEEP. `git diff src/config/pricing-config.ts` EMPTY.
- `supabaseMock.makeQueryBuilder` → in-file consumer + test seam → KEEP.
- `useTierAccess.useFeatureGate/FeatureType` → in-file consumers + "preserved"-by-design header → KEEP.
- `career-compass/index.ts ScoreRing` (barrel re-export) → barrel-stability re-export of a LIVE symbol (ScoreRing consumed via direct `./ScoreRing`) → KEEP.
- `interviewPrep.ts` schemas → gated IP zod (KEEP-LIST Class 1) → MANDATORY KEEP.
- `use-toast.ts reducer/toast` → shadcn ui/** parity → MANDATORY KEEP.
- `document-extraction.ts` constants/types → in-file consumers + `document-extraction-primary.test.ts` string-asserts the `export const` source → KEEP.
- `EducationTargetsSection GRADUATION_YEARS/YEAR_OPTIONS` → in-file consumers → KEEP.
- `analysisHelpers extract*/getAnalysisHistory/AnalysisInsight` → **live consumer `MinimalHero.tsx` (R-01, still in repo)** imports `extractResumeInsights`/`AnalysisDisplayResult` → KEEP (re-evaluate when R-01 clears).
- `career-compass/types`, `useUserTargets`, `LinkedInGrader` types → in-file composers / cross-component type imports → KEEP.

**Task 3 — clutter (D-10): ZERO removed.** The in-scope `src/**` scan found only load-bearing "why"/trade-off comments (PostgREST null semantics, PDF-OCR fallback rationale, 412 `linkedin_prior_missing` semantics, env-var debug note) — all PRESERVED. Zero production TODO/FIXME/XXX markers exist. No clutter commit was made (forcing removals would have deleted load-bearing comments).

## Deviations from Plan

### Documented KEEPs (not removals) — within plan's own conditional logic

**1. [Plan-conditional] `use-mobile.tsx` KEPT instead of removed**
- **Found during:** Task 1
- **Issue:** The plan's row-16 cheap-residual re-check (`rg "use-mobile|useIsMobile" src/components/ui`) was NOT zero — `src/components/ui/sidebar.tsx` is a live consumer.
- **Resolution:** Per the plan's own "if any hit, KEEP and document" branch, kept the file and documented it. This is the expected conservative outcome, not a deviation from intent.
- **Files:** none deleted; `use-mobile.tsx` retained.
- **Verification:** baseline green; audit:deadcode still lists it as a known KEPT residual.

**2. [Plan-conditional] ZERO exports pruned + ZERO clutter removed**
- **Found during:** Task 3
- **Issue:** Under the D-09 multi-signal gate, every unused-export candidate had a blocking consumer; under D-10, no non-load-bearing clutter exists in scope.
- **Resolution:** Removed nothing on a static-dead reading alone — the conservative bar is the intended behavior. All verdicts documented in RESIDUAL-REGISTER.md.

---

**Total deviations:** 0 auto-fixed bugs. 2 plan-conditional KEEP outcomes (both explicitly anticipated by the plan's "KEEP-and-document" branches).
**Impact on plan:** Net removal = 9 files (8 standalone + AuthCallback) + 1 dup-export collapse. The conservative KEEPs are the plan working as designed (zero-functional-change posture).

## Issues Encountered
None. Each commit was gated by a green `verify:baseline` before and after.

## Per-Commit Baseline Results
- **Green-BEFORE (pre-Task-1):** vitest 457/457, deno 284/0, Playwright 5 passed + 1 skipped.
- **After `2f4e0ba` (8 files removed):** vitest 457/457, deno 284/0, Playwright 5+1skip. audit:deadcode delta: 8 files gone from React dead-list; Deno reachable 35/37 unchanged; no new findings.
- **After `319f385` (AuthCallback removed):** vitest 457/457, deno 284/0, Playwright 5+1skip.
- **After `bd99053` (dup-export collapsed):** vitest 457/457, deno 284/0, Playwright 5+1skip. audit:deadcode: AnalysisComparisonModal.tsx no longer in knip findings (duplicate-export finding gone).

## audit:deadcode Delta
- React dead-file list after this plan: only `MinimalHero.tsx` (deferred R-01) + `use-mobile.tsx` (KEPT — known) remain. All 8 standalone files + AuthCallback removed from the list.
- AnalysisComparisonModal duplicate-export finding: **gone.**
- pricing-config.ts exports still flagged by knip (the documented FALSE POSITIVE) — `git diff` EMPTY, cross-layer import in `_shared/tier-config.ts` confirmed present.
- No new findings introduced.

## Residual-Register Updates
- **CLEAN-02-AuthCallback (Closed/Resolved):** operator gate outcome recorded verbatim = REMOVE; commit `319f385`; no deferred residual owed.
- **Kept-by-Signal Exports & Files table (new section):** 11 export-candidate rows documented with the firing signal; clutter outcome recorded (none removed, all load-bearing preserved).
- **Forward cross-reference updated:** the 04-04 AuthCallback forward note now marks the item RESOLVED (removed) by 04-05.
- R-01 (MinimalHero.tsx) unchanged — still deferred; noted as the live consumer keeping analysisHelpers exports.

## Next Phase Readiness
- Frontend dead-file surface is closed (standalone + cleared-residual rows removed; AuthCallback resolved via operator gate). CLEAN-02 frontend remainder + CLEAN-04 frontend + CLEAN-05 satisfied.
- Remaining known residuals: R-01 (MinimalHero.tsx, deferred) and `use-mobile.tsx` (KEPT, live ui/sidebar consumer — not a residual, a permanent keep).
- Plan 04-06 (the next/last plan in the phase) is ready to execute.

## Self-Check: PASSED

- All 9 removed files confirmed ABSENT (8 standalone + AuthCallback.tsx).
- `use-mobile.tsx` confirmed PRESENT (correctly KEPT — live ui/sidebar consumer).
- All commits exist: `2f4e0ba`, `319f385`, `bd99053`, `4122f95`.
- `AnalysisComparisonModal.tsx` has 0 `export default` (single canonical named export).
- `git diff src/config/pricing-config.ts` EMPTY (false-positive exports preserved).

---
*Phase: 04-dead-code-refactor-cleanup*
*Completed: 2026-06-14*
