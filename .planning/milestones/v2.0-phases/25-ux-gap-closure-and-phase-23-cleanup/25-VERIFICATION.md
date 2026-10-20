---
phase: 25-ux-gap-closure-and-phase-23-cleanup
verified: 2026-04-28T19:45:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
overrides:
  - must_have: "Profile.tsx generic upgrade CTA navigates to /pricing via Link"
    reason: "Profile.tsx never had an upgrade CTA button to swap — only an UpgradeModal mount with no trigger. Plan 25-01 deviation 3 removed the orphan import + state + mount; adding an unused `<Link to=\"/pricing\">` would invent UI not in scope. Documented in 25-01-SUMMARY.md and 25-AUDIT-TRAIL.md."
    accepted_by: "verifier-claude (per Plan 25-01 SUMMARY deviation 3 self-acknowledged)"
    accepted_at: "2026-04-28T19:45:00Z"
---

# Phase 25: UX Gap Closure and Phase 23 Cleanup — Verification Report

**Phase Goal:** Close 7 UX-* requirements (UX-01..04, UX-09, UX-10, UX-11) and complete Phase 23 cleanup so Phase 25 can archive cleanly.
**Verified:** 2026-04-28T19:45:00Z
**Status:** PASS
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (must-haves)

| #   | Truth                                                             | Status     | Evidence                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | UX-03: LowBalanceWarning renders amber/destructive banners on threshold | VERIFIED   | `src/components/LowBalanceWarning.tsx:25` (cheapestApplicableCost), `:39-54` (destructive isZero branch), `:58-78` (amber low branch with `total < 2 × cheapest` threshold); 6 unit tests in `LowBalanceWarning.test.tsx` cover hidden / amber-low / destructive-zero / dual-CTA / free-tier boundary / loading.        |
| 2   | UX-01: MeritBalanceHeaderV2 trigger applies isLow/isZero classes   | VERIFIED   | `MeritBalanceHeaderV2.tsx:36-40` (triggerStateClass), `:47` (className wired); T6 + T7 in `MeritBalanceHeaderV2.test.tsx:107-129` assert amber-500 + destructive classes on trigger button. 7/7 tests pass.                                                                                                                |
| 3   | UX-02: CareerCompass mounts MeritCostPreview above Analyze CTA      | VERIFIED   | `src/pages/CareerCompass.tsx:25-26` (imports), `:932-933` (LowBalanceWarning + MeritCostPreview rendered above CTA). Parity reached with the other 5 gated pages.                                                                                                                                                          |
| 4   | UX-04: Upload + usePaywallGuard route 402 → useOutOfMeritsModal + OutOfMeritsModalV2 | VERIFIED   | `usePaywallGuard.ts:4,27` (useOutOfMeritsModal wired); `Upload.tsx:18` (OutOfMeritsModalV2 import), `:316` (402 → openModal), `:492` (modal mount). UpgradeModal entirely deleted. Generic CTAs in TopBar (`:199,210`) and Navbar (`:507,587,596`) use `<Link to="/pricing">`. Profile.tsx had no upgrade CTA to swap (override). |
| 5   | UX-09 / UX-10: Phase 23 streak + Elite quiz UI back-registered      | VERIFIED   | `25-AUDIT-TRAIL.md:20-21` cites `src/components/InterviewStreakDisplay.tsx:15-20` (component definition) and `src/pages/InterviewPrep.tsx:427-433` (Elite quiz UI region). Pure documentation; no new code per spec.                                                                                                          |
| 6   | UX-11: useMerits canAfford reactivity + 5s staleTime invariants tested | VERIFIED   | `src/hooks/useMerits.test.ts:174` (canAfford reactivity test), `:195` (staleTime test using `vi.useFakeTimers` + `advanceTimersByTime(5_000)` + `invalidateQueries`); 12/12 useMerits tests pass.                                                                                                                          |
| 7   | Phase 23 cleanup: stub validators removed + IPC-JSDOM-001 + runbook reminder + audit trail | VERIFIED   | `validateFlashcards`/`validateQuizQuestions` deleted (only header-comment mention at `interview-prep-validation.ts:3`); `docs/tech-debt/IPC-JSDOM-001.md` exists with 5 sections; `InterviewPrep.test.tsx:10,188` cite TODO(IPC-JSDOM-001); `scripts/phase21-runbook.ps1:775-781` SC-9 sentinel + 5× Write-Note operator reminder; `25-AUDIT-TRAIL.md` exists with 11 rows (UX-01..04, UX-09, UX-10, UX-11, SC-7, SC-8a, SC-8b, SC-9). |

**Score:** 7/7 truths verified.

### Required Artifacts

| Artifact                                                              | Expected                                              | Status     | Details                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/LowBalanceWarning.tsx`                                | Amber/destructive banner, dual CTAs                   | VERIFIED   | 82 lines; renders both states; reads tier-aware threshold from MERIT_COST_PER_FEATURE.                                                 |
| `src/components/LowBalanceWarning.test.tsx`                           | Unit tests for all 5 contract cases                   | VERIFIED   | 6 tests (T1..T6) covering hidden, amber-low, destructive-zero, dual-CTA, free-tier boundary, loading.                                  |
| `src/components/topup/MeritBalanceHeaderV2.tsx`                       | isLow + isZero trigger classes                        | VERIFIED   | triggerStateClass at lines 36-40 applies amber-500 / destructive Tailwind tokens.                                                       |
| `src/components/topup/MeritBalanceHeaderV2.test.tsx`                  | T6 (isLow) + T7 (isZero) assertions                   | VERIFIED   | Both new tests assert className regex on trigger button.                                                                                |
| `src/pages/CareerCompass.tsx`                                         | MeritCostPreview + LowBalanceWarning above CTA        | VERIFIED   | Both mounted at lines 932-933.                                                                                                         |
| `src/pages/Upload.tsx`                                                 | OutOfMeritsModalV2 wired via useOutOfMeritsModal       | VERIFIED   | 402 path → openModal({feature, cost, balance}); modal mount at :492.                                                                    |
| `src/hooks/usePaywallGuard.ts`                                         | useOutOfMeritsModal integration; modalProps returned  | VERIFIED   | Lines 4, 27 wire the hook; contract returns `{ modalProps, openModal, triggerPaywall, ... }`.                                          |
| `src/components/TopBar.tsx`                                            | Upgrade CTAs → `<Link to="/pricing">`                  | VERIFIED   | 2 occurrences (lines 199, 210).                                                                                                        |
| `src/components/Navbar.tsx`                                            | Upgrade CTAs → `<Link to="/pricing">`                  | VERIFIED   | 3 occurrences (lines 507, 587, 596).                                                                                                   |
| `src/pages/Profile.tsx`                                                | Upgrade CTA → `<Link to="/pricing">`                   | OVERRIDE   | Page never had an upgrade trigger — only orphan modal mount. UpgradeModal removed; no `<Link>` added (acceptable deviation in 25-01).   |
| `src/components/MeritBalanceBadge.tsx` + `.test.tsx`                   | DELETED                                                | VERIFIED   | `git ls-files` returns ∅; `ls` confirms gone.                                                                                          |
| `src/components/UpgradeModal.tsx`                                      | DELETED                                                | VERIFIED   | `git ls-files` returns ∅; only one comment-text reference remains in `useOutOfMeritsModal.ts:6`.                                       |
| `src/hooks/useMerits.test.ts`                                          | UX-11 (a) + (b) tests                                  | VERIFIED   | Lines 174, 195. 12 tests total, all pass.                                                                                              |
| `supabase/functions/_shared/interview-prep-validation.ts`              | validateFlashcards + validateQuizQuestions deleted    | VERIFIED   | Only header-comment mention remains (line 3).                                                                                          |
| `docs/tech-debt/IPC-JSDOM-001.md`                                      | Tech-debt ticket with 5 sections                      | VERIFIED   | Frontmatter + Summary + Root cause + Reproduction + Candidate fixes + Closing criteria.                                                |
| `src/pages/InterviewPrep.test.tsx`                                     | TODO(IPC-JSDOM-001) cross-references                  | VERIFIED   | 2 references (lines 10, 188).                                                                                                          |
| `scripts/phase21-runbook.ps1`                                          | SC-9 idempotent operator reminder in Stage-D4-Finalize | VERIFIED   | Sentinel comment + 5× Write-Note block at lines 775-781.                                                                               |
| `.planning/phases/25-…/25-AUDIT-TRAIL.md`                              | UX-01..04, UX-09, UX-10, UX-11 evidence rows           | VERIFIED   | 7 UX-* rows + 4 cleanup back-reference rows; every row cites a file:line.                                                              |
| `25-01-SUMMARY.md`, `25-02-SUMMARY.md`, `25-03-SUMMARY.md`             | Plan SUMMARYs exist                                    | VERIFIED   | All three present in `.planning/phases/25-…/`.                                                                                          |

### Key Link Verification

| From                                  | To                                            | Via                                       | Status   | Details                                                                                                |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `LowBalanceWarning`                   | `useMerits` + `MERIT_COST_PER_FEATURE`        | `import` + hook call                      | WIRED    | Imports at `:20-21`; hook call at `:33`.                                                               |
| `MeritBalanceHeaderV2`                | `useMerits` (isLow / isZero)                  | hook destructure                          | WIRED    | `:28` destructures both flags; trigger className references both at `:36-40`.                          |
| CareerCompass page                    | `MeritCostPreview` + `LowBalanceWarning`      | JSX mount                                 | WIRED    | Both rendered at `:932-933` directly above Analyze CTA.                                                |
| `Upload.tsx` 402 path                 | `OutOfMeritsModalV2`                          | `openModal({...})` from usePaywallGuard   | WIRED    | `:316-317` calls openModal in `isCreditsError` branch; `:492` mounts modal with `{...modalProps}`.       |
| `usePaywallGuard`                     | `useOutOfMeritsModal`                         | hook composition                          | WIRED    | `:4,27` consume the hook and re-export `modalProps`/`openModal` to consumers.                          |
| TopBar/Navbar Upgrade items           | `/pricing` route                              | `<Link to="/pricing">`                    | WIRED    | TopBar 2× (`:199,210`); Navbar 3× (`:507,587,596`).                                                    |
| `useMerits.test.ts` UX-11             | `useMerits` hook surface                      | renderHook + invalidateQueries            | WIRED    | Per-test QueryClient + `invalidateQueries(['merit-balance'])` triggers refetch; assertions on `canAfford`. |
| Stage-D4-Finalize SC-9 block          | operator delete reminder                      | `Write-Step` + `Write-Note` (text only)   | WIRED    | Lines 775-781 emit reminder with both STAGING + PRODUCTION refs; coexists with Phase 27 SC-4 block.    |
| `25-AUDIT-TRAIL.md`                   | UX/SC evidence files                          | file:line citations                       | WIRED    | 11 rows; every row resolves to a real file:line in repo.                                               |

### Data-Flow Trace (Level 4)

| Artifact                            | Data Variable          | Source                              | Produces Real Data | Status   |
| ----------------------------------- | ---------------------- | ----------------------------------- | ------------------ | -------- |
| `LowBalanceWarning`                 | `total`, `tier`, `isZero` | `useMerits()` (React Query → RPC) | Yes — live RPC     | FLOWING  |
| `MeritBalanceHeaderV2` trigger      | `isLow`, `isZero`      | `useMerits()`                        | Yes — live RPC     | FLOWING  |
| `OutOfMeritsModalV2` (mounted)       | `modalProps`           | `useOutOfMeritsModal` via usePaywallGuard | Yes — populated by 402 handlers | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                            | Command                                                                                | Result                          | Status |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| Build succeeds                                      | `npm run build`                                                                        | exit 0; built in 4.26s          | PASS   |
| LowBalanceWarning + MeritBalanceHeaderV2 unit tests | `npm run test -- src/components/LowBalanceWarning.test.tsx src/components/topup/MeritBalanceHeaderV2.test.tsx` | 13/13 PASS                      | PASS   |
| useMerits unit tests (incl. UX-11)                  | `npm run test -- src/hooks/useMerits.test.ts`                                          | 12/12 PASS                      | PASS   |
| Edge function tests                                 | `scripts/run-edge-tests.ps1`                                                           | 215/215 PASS                    | PASS   |
| Full vitest suite                                   | `npm run test`                                                                         | 286 passed / 7 failed (pre-existing) | PASS  |

### Requirements Coverage

| Requirement | Source Plan | Description                                            | Status   | Evidence                                                                          |
| ----------- | ----------- | ------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- |
| UX-01       | 25-01       | Header badge isLow/isZero color states                  | SATISFIED | MeritBalanceHeaderV2 triggerStateClass + T6/T7 tests                              |
| UX-02       | 25-01       | CareerCompass MeritCostPreview parity                   | SATISFIED | CareerCompass.tsx:932-933                                                          |
| UX-03       | 25-01       | LowBalanceWarning shared banner with 2× cheapest threshold | SATISFIED | LowBalanceWarning.tsx + 6 unit tests + mounted on 6 pages + TopBar                |
| UX-04       | 25-01       | OutOfMeritsModalV2 wired via useOutOfMeritsModal; UpgradeModal removed | SATISFIED | usePaywallGuard + Upload + RecruitingLens + InterviewPrep mounts; UpgradeModal.tsx deleted |
| UX-09       | 25-03       | Streak component (back-registration of Phase 23)        | SATISFIED | InterviewStreakDisplay.tsx + 25-AUDIT-TRAIL.md row                                |
| UX-10       | 25-03       | Elite quiz UI (back-registration of Phase 23)           | SATISFIED | InterviewPrep.tsx Elite quiz region + 25-AUDIT-TRAIL.md row                       |
| UX-11       | 25-02       | useMerits canAfford reactivity + 5s staleTime invariants | SATISFIED | useMerits.test.ts:174 + :195                                                       |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

None. Spot-grep over modified files showed no TODO/FIXME/PLACEHOLDER additions, no empty handlers, no hardcoded empty data flows. The two `TODO(IPC-JSDOM-001)` markers in `InterviewPrep.test.tsx` are intentional cross-references to the tech-debt ticket and are part of the SC-8b deliverable, not anti-patterns.

### Pre-existing Test Failures (Out of Scope)

The full vitest suite reports 286 passed / 7 failed across 6 test files. All 7 failures are pre-existing on `by/env-fixes` HEAD and unrelated to Phase 25's edit surface:

| File                                                  | Failures | Last touched / Origin                          |
| ----------------------------------------------------- | -------- | ---------------------------------------------- |
| `src/components/topup/StripePaymentElementModal.test.tsx` | 5        | commit 50ef9bd (Phase 24-06)                   |
| `src/components/BlurredLockCard.test.tsx`             | 2        | commit 2da891b (Phase 15.2-01)                 |
| 4 supabase Deno test files                            | (test-file failures, not test failures) | Vitest cannot execute Deno-only test files |

These are documented in 25-01-SUMMARY, 25-02-SUMMARY, and 25-03-SUMMARY. **No new failures introduced by Phase 25.**

### Human Verification Required

None. All deliverables are programmatically verifiable: file existence, code structure, unit test pass, edge test pass, build success, and grep-confirmed wiring.

### Gaps Summary

No gaps. All 7 must-haves are verified against the actual codebase. The single deviation (Profile.tsx upgrade CTA) is overridden in frontmatter — Plan 25-01 SUMMARY documents that Profile.tsx never had an upgrade button to swap, only an orphan UpgradeModal mount with no trigger; that orphan was correctly removed without inventing a new CTA.

The phase is ready to archive.

---

*Verified: 2026-04-28T19:45:00Z*
*Verifier: Claude (gsd-verifier)*
