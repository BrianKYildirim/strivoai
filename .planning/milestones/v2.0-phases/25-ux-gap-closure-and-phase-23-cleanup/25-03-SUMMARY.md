---
phase: 25-ux-gap-closure-and-phase-23-cleanup
plan: 03
subsystem: cleanup-and-audit
tags: [phase-23-cleanup, runbook, tech-debt, audit-trail, back-registration, ipc-jsdom-001]

# Dependency graph
requires:
  - phase: 25-ux-gap-closure-and-phase-23-cleanup
    plan: 01
    provides: LowBalanceWarning + MeritBalanceHeaderV2 isLow/isZero + CareerCompass MeritCostPreview parity + UpgradeModal/MeritBalanceBadge orphan deletes (UX-01..04, SC-7)
  - phase: 25-ux-gap-closure-and-phase-23-cleanup
    plan: 02
    provides: useMerits.test.ts UX-11 reactivity + staleTime tests (SC-6)
  - phase: 23-interview-prep-runtime-overhaul
    provides: Elite quiz UI + InterviewStreakDisplay (cited by UX-09 / UX-10 back-registration rows)
provides:
  - "Phase 23 cleanup: validateFlashcards / validateQuizQuestions throwing stubs purged (SC-8a)"
  - "IPC-JSDOM-001 backlog ticket capturing the jsdom + framer-motion + rhf form-submission test hang (SC-8b)"
  - "Stage-D4-Finalize SC-9 sentinel-marked operator reminder for `supabase functions delete interview-prep-coach` (SC-9)"
  - "25-AUDIT-TRAIL.md back-registering all 7 UX-* REQ-IDs (UX-01..04, UX-09, UX-10, UX-11) + 4 cleanup IDs (SC-7, SC-8a, SC-8b, SC-9) — planning artifact, never staged"
  - "UX-09 + UX-10 back-registered against Phase 23 evidence (no new code in Phase 25)"
affects: [phase-25 archival, phase-21 D4 cutover runbook, phase-27 SC-4 static-edit pass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinel-marked PowerShell text-only reminder block (Write-Step + Write-Note, no Invoke-Expression) so downstream phases can grep-skip it idempotently."
    - "Tech-debt ticket pattern at docs/tech-debt/<ID>.md with frontmatter (id, opened, phase_origin, phase_documenting, status, severity, component) + 5 sections (Summary, Root cause hypothesis, Reproduction, Candidate fixes, Closing criteria)."
    - "Audit-trail-as-evidence-map: REQ-ID | Closed by plan | Evidence file:line | Note table living under .planning/phases/<phase-dir>/<phase>-AUDIT-TRAIL.md."

key-files:
  created:
    - docs/tech-debt/IPC-JSDOM-001.md
    - .planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md
  modified:
    - supabase/functions/_shared/interview-prep-validation.ts
    - src/pages/InterviewPrep.test.tsx
    - scripts/phase21-runbook.ps1
  deleted: []

key-decisions:
  - "interview-prep-validation.test.ts NOT modified — pre-flight grep confirmed it does not import the deleted exports (already imports only validateInterviewPrepPayload + findDroppedOptionalFields). Acceptance criterion 'no edit needed (acknowledged in done)' satisfied."
  - "No it.skip blocks added to InterviewPrep.test.tsx — RESEARCH Drift Finding 3: the 5 form-submission tests were never written. Existing two comment blocks (file-top + intra-describe) extended with TODO(IPC-JSDOM-001) references."
  - "SC-9 reminder block placed BETWEEN Append-Evidence and the ROLLBACK check (per plan instruction), NOT replacing the existing Phase 27 SC-4 coordination block lower in Stage-D4-Finalize. Both blocks now coexist; the SC-9 sentinel marks the new block for grep-skip; the Phase 27 block remains as the operator confirmation gate."
  - "25-AUDIT-TRAIL.md authored under .planning/ and explicitly NOT staged or committed (CLAUDE.md hard rule). Lives in working tree as a planning-only artifact for archival/reference."

patterns-established:
  - "Pre-flight grep gate before destructive deletes: pre-deletion grep -rn for the symbol name to confirm zero callers outside the file under modification."
  - "Idempotency sentinel comment as the exact literal string downstream phases (Phase 27 SC-4) grep-check before re-running the same insertion."

requirements-completed: [UX-09, UX-10]

# Metrics
duration: 12 min
completed: 2026-04-28
---

# Phase 25 Plan 03: Phase 23 Cleanup + Phase 21 Runbook Reminder + UX-09/10 Back-Registration + 25-AUDIT-TRAIL Authoring

**Closing plan that lets Phase 25 archive cleanly: deleted the deprecated validateFlashcards / validateQuizQuestions throwing stubs from supabase/functions/_shared/interview-prep-validation.ts (zero callers, edge tests still 215/215 green); filed IPC-JSDOM-001 backlog ticket at docs/tech-debt/IPC-JSDOM-001.md and cited it from both existing comment blocks in src/pages/InterviewPrep.test.tsx; appended an idempotent SC-9 sentinel-marked operator reminder to scripts/phase21-runbook.ps1 Stage-D4-Finalize for `supabase functions delete interview-prep-coach`; authored .planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md back-registering all 7 UX-* REQ-IDs (UX-01..04, UX-09, UX-10, UX-11) plus 4 cleanup IDs (SC-7, SC-8a, SC-8b, SC-9) with file:line evidence drawn from Plans 25-01 + 25-02 + Phase 23.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T02:23Z
- **Completed:** 2026-04-29T02:43Z
- **Tasks:** 5 (Tasks 1-4 = work; Task 5 = final verification)
- **Files created:** 2 (1 committed at docs/tech-debt/, 1 working-tree-only at .planning/)
- **Files modified:** 3
- **Files deleted:** 0

## Accomplishments

- Deleted lines 185-198 of `supabase/functions/_shared/interview-prep-validation.ts` (the entire "Deprecated legacy shims" block + both `validateFlashcards` and `validateQuizQuestions` throwing exports). Pre-flight grep confirmed zero live callers; only the historical mention in the file-header comment at line 3 remains.
- Verified `supabase/functions/_shared/__tests__/interview-prep-validation.test.ts` does not reference the deleted exports — no edit required.
- Created `docs/tech-debt/IPC-JSDOM-001.md` with frontmatter + 5 sections (Summary, Root cause hypothesis, Reproduction, Candidate fixes, Closing criteria) capturing the jsdom + framer-motion + react-hook-form form-submission hang.
- Extended both existing comment blocks in `src/pages/InterviewPrep.test.tsx` (lines 4-7 and 180-183) with `TODO(IPC-JSDOM-001)` cross-references to the backlog ticket. No `it.skip` blocks added — the 5 form-submission tests were never written per RESEARCH Drift Finding 3.
- Appended an idempotent `SC-9` sentinel-marked block to `Stage-D4-Finalize()` in `scripts/phase21-runbook.ps1` that emits a Write-Step + 5× Write-Note operator reminder for the manual `supabase functions delete interview-prep-coach` (STAGING + PRODUCTION) commands. Block sits between `Append-Evidence` and the ROLLBACK check; coexists with the existing Phase 27 SC-4 coordination block lower in the function.
- Authored `.planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md` (NOT staged — CLAUDE.md hard rule) with rows for all 7 UX-* REQ-IDs and 4 Phase 23 cleanup IDs, every evidence cell resolved to a real `file:line` citation against Plan 25-01 + Plan 25-02 + Phase 23 shipped code.

## Task Commits

Each work task was committed atomically; the audit trail was deliberately NOT committed.

1. **Task 1: Delete validateFlashcards / validateQuizQuestions stubs (SC-8a)** — `4a207fb` (refactor)
2. **Task 2: Create IPC-JSDOM-001 + extend InterviewPrep.test.tsx comments (SC-8b)** — `4bd0937` (docs)
3. **Task 3: Append SC-9 reminder to Stage-D4-Finalize (SC-9)** — `0870f73` (chore)
4. **Task 4: Author 25-AUDIT-TRAIL.md** — NOT committed (planning artifact under `.planning/`).
5. **Task 5: Final verification** — no commit (read-only suite run).

## Files Created/Modified

### Created (committed)
- `docs/tech-debt/IPC-JSDOM-001.md` — Backlog ticket: id IPC-JSDOM-001, status open, severity low. 5 sections capturing the jsdom hang + closing criteria.

### Created (NOT committed — planning artifact)
- `.planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md` — REQ-ID → evidence map for the 7 UX-* IDs Phase 25 closes + 4 Phase 23 cleanup back-references.

### Modified
- `supabase/functions/_shared/interview-prep-validation.ts` — Deleted 14 lines (Deprecated legacy shims block + both throwing exports). Canonical `validateInterviewPrepPayload` (line 100) preserved.
- `src/pages/InterviewPrep.test.tsx` — Appended `TODO(IPC-JSDOM-001)` reference to file-top comment block (after line 7) and to the intra-describe comment block (after line 183). No code path changes; existing 6/6 tests still pass.
- `scripts/phase21-runbook.ps1` — Inserted 8-line block in `Stage-D4-Finalize()` between Append-Evidence (now line 773) and the ROLLBACK check (now line 783). Includes the `# SC-9: interview-prep-coach delete reminder (idempotency sentinel)` comment for grep-skip.

## Verification Evidence

Acceptance criteria evidence (file:line):

| Criterion | Evidence |
|---|---|
| `validateFlashcards` deleted | `grep -rn "validateFlashcards" supabase src` returns only line 3 of interview-prep-validation.ts (header comment) — no live exports |
| `validateQuizQuestions` deleted | Same as above |
| Canonical export preserved | `grep -n "validateInterviewPrepPayload" supabase/functions/_shared/interview-prep-validation.ts` returns line 100 |
| `Deprecated legacy shims` block removed | `grep -n "Deprecated legacy shims" supabase/functions/_shared/interview-prep-validation.ts` returns ∅ |
| Edge tests green | `scripts/run-edge-tests.ps1` → 215 passed / 0 failed |
| IPC-JSDOM-001 ticket exists | `docs/tech-debt/IPC-JSDOM-001.md` present; contains `IPC-JSDOM-001`, `Closing criteria`, all 5 sections |
| Test file references the ticket | `grep -n "TODO(IPC-JSDOM-001)" src/pages/InterviewPrep.test.tsx` → 2 matches (lines 10 + 188) |
| InterviewPrep.test.tsx still green | `npx vitest run src/pages/InterviewPrep.test.tsx` → 6/6 passed |
| SC-9 sentinel present | `grep -n "SC-9: interview-prep-coach delete reminder" scripts/phase21-runbook.ps1` → exactly 1 match (line 775) |
| `interview-prep-coach` mentions ≥2 | `grep -c "interview-prep-coach" scripts/phase21-runbook.ps1` → 7 matches (line 650 pre-existing + lines 776,778,779,790,792,793,794) |
| `Stage-D4-Finalize` exists | `grep -n "Stage-D4-Finalize" scripts/phase21-runbook.ps1` → lines 754 + 839 (function def + dispatch) |
| PowerShell parses cleanly | `[System.Management.Automation.PSParser]::Tokenize` returns "PARSE OK" |
| 25-AUDIT-TRAIL.md exists | `node -e ...` validation script prints `audit-trail OK` (all 11 IDs present: UX-01..04, UX-09, UX-10, UX-11, SC-7, SC-8a, SC-8b, SC-9) |
| 25-AUDIT-TRAIL.md NOT staged | `git status --porcelain | grep planning` → ∅ (`.planning/` is in `.gitignore`) |

## Build / Lint / Test Results

- **`npm run build`** — exit 0 (built in 5.37s; no new warnings).
- **`npm run lint`** — exit 1 reporting 8924 pre-existing problems (8249 errors / 675 warnings) across the whole repo. Targeted lint of our two TS file edits found only 2 errors (`@typescript-eslint/no-explicit-any` at lines 63 + 67 of `src/pages/InterviewPrep.test.tsx`) — both are pre-existing from commit `d49c0ba` (Phase 23-06a) and not introduced by this plan. PowerShell file is not lintable. Markdown files are not lintable.
- **`npm run test`** (full vitest suite) — 286 passed / 7 failed. The 7 failures are exactly the same set documented as pre-existing in 25-01-SUMMARY and 25-02-SUMMARY: 4 supabase Deno test files that vitest cannot execute (interview-prep-prompts.contract, interview-prep-validation, merit-gateway-already-refunded, tier-prompts.interview-prepend), 2 BlurredLockCard tests (last touched 2da891b / Phase 15.2-01), 5 StripePaymentElementModal tests (last touched 50ef9bd / Phase 24-06). None of the 7 failures are in or downstream of files touched by this plan.
- **`npx vitest run src/pages/InterviewPrep.test.tsx`** — 6/6 passed (1186 ms). Confirms our comment edits did not regress the page-level state-machine + §13.4 copy + SC-14 negative tests.
- **`scripts/run-edge-tests.ps1`** (Deno suite) — 215/215 passed. Confirms the validator delete did not break any edge test (the Deno-side `interview-prep-validation.test.ts` does not import the deleted exports).

End-to-end grep audit (Task 5):
- `grep -rn "UpgradeModal" src` — 1 match (comment-text reference in `src/hooks/useOutOfMeritsModal.ts:6`); no imports / no JSX.
- `grep -rn "MeritBalanceBadge" src` — 1 match (comment-text reference in `src/components/topup/MeritBalanceHeaderV2.tsx:11`); no imports / no JSX.
- `grep -rn "validateFlashcards\|validateQuizQuestions" supabase src` — 1 match (file-header comment in `interview-prep-validation.ts:3`); no live exports.
- `grep -rn "showUpgradeModal" src` — ∅
- `grep -c "to=\"/pricing\"" src/components/TopBar.tsx src/components/Navbar.tsx src/pages/Profile.tsx` — TopBar.tsx:2, Navbar.tsx:3, Profile.tsx:0 (Profile.tsx=0 documented in 25-01 SUMMARY deviation 3 as expected — Profile never had an upgrade CTA).
- `git status --porcelain | grep planning` — ∅ (.planning/ is gitignored).

## Deviations from Plan

None - plan executed exactly as written.

Notes / clarifications (not deviations):
- The plan's idempotency check for the SC-9 sentinel returned ∅ (sentinel absent), so the insertion proceeded as expected. Stage-D4-Finalize already contained a Phase 27 SC-4 coordination block lower in the function (lines 789-794 post-edit) that asks the operator to ACK the same delete; the new SC-9 block inserts higher in the function (immediately after Append-Evidence) and carries the sentinel. Both blocks coexist as designed.
- The plan-level `npm run test exits 0` acceptance criterion in Task 5 is technically not met because of the 7 pre-existing failures documented above; per the executor scope-boundary rule (and consistent with how 25-01 and 25-02 SUMMARYs handled the same situation), pre-existing breakage in unrelated files is not in scope for this plan.

## Authentication Gates

None — plan executed without auth interaction.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Threat Register Outcomes

| Threat ID | Outcome |
|-----------|---------|
| T-25-03-A (Tampering — deleted validators with hidden callers) | Mitigated. Pre-flight `grep -rn` confirmed zero callers outside the file under modification before deletion; `scripts/run-edge-tests.ps1` re-ran post-deletion → 215/215 green. |
| T-25-03-B (Elevation of Privilege — runbook reminder accidentally executes destructive delete) | Mitigated. SC-9 block uses only `Write-Step` + `Write-Note` (text emit). No `Invoke-Expression`, no `& supabase`, no command substitution. Operator must type the command themselves. |
| T-25-03-C (Repudiation — audit trail lacks evidence for closed REQ-IDs) | Mitigated. 25-AUDIT-TRAIL.md cites file:line for each of the 7 UX-* IDs + 4 cleanup IDs; node validation script confirms all 11 IDs present. |

## Known Stubs

None — no rendered components or runtime code added in this plan; only deletes, doc creation, and comment-only edits.

## Phase 25 Closure Status

- SC-1 (UX-02 CareerCompass parity) — closed by Plan 25-01.
- SC-2 (UX-03 LowBalanceWarning) — closed by Plan 25-01.
- SC-3 (UX-04 OutOfMeritsModalV2 wiring) — closed by Plan 25-01.
- SC-5 (UX-09 + UX-10 back-registration) — closed by Plan 25-03 (this plan, via 25-AUDIT-TRAIL.md rows).
- SC-6 (UX-11 affordability invariant tests) — closed by Plan 25-02.
- SC-7 (orphan badge / modal delete) — closed by Plan 25-01.
- SC-8a (validator stubs delete) — closed by Plan 25-03 (this plan).
- SC-8b (test hang documented) — closed by Plan 25-03 (this plan, via IPC-JSDOM-001).
- SC-9 (runbook reminder) — closed by Plan 25-03 (this plan).
- UX-01 — closed by Plan 25-01 (MeritBalanceHeaderV2 isLow/isZero color states).

Phase 25 is ready to archive.

## Self-Check: PASSED

**Files created verified on disk:**
- `[ -f docs/tech-debt/IPC-JSDOM-001.md ]` — FOUND
- `[ -f .planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md ]` — FOUND

**Files modified verified on disk:**
- `supabase/functions/_shared/interview-prep-validation.ts` — `Deprecated legacy shims` grep returns ∅; `validateInterviewPrepPayload` still at line 100.
- `src/pages/InterviewPrep.test.tsx` — `TODO(IPC-JSDOM-001)` grep returns 2 matches (lines 10, 188).
- `scripts/phase21-runbook.ps1` — SC-9 sentinel at line 775; PowerShell parses clean.

**Commits verified in git log:**
- `4a207fb` refactor(25-03): remove deprecated validateFlashcards/QuizQuestions stubs — FOUND
- `4bd0937` docs(25-03): file IPC-JSDOM-001 tech-debt ticket + cite from test — FOUND
- `0870f73` chore(25-03): add SC-9 interview-prep-coach delete reminder to D4-Finalize — FOUND

**Acceptance criteria re-run:** all PASS (table above).

**Plan-level verification:**
- `scripts/run-edge-tests.ps1` → 215 passed / 0 failed.
- `npm run build` → exit 0.
- `npx vitest run src/pages/InterviewPrep.test.tsx` → 6/6 passed.
- `npm run test` (full) → 286/293 passed; 7 pre-existing failures unrelated to this plan's edit surface (out-of-scope per executor rules).
- `npm run lint` → 8924 pre-existing problems whole-repo; 0 net-new from this plan's edits.

**`.planning/` not staged:** `git status --porcelain | grep planning` → ∅ (gitignored).

---
*Phase: 25-ux-gap-closure-and-phase-23-cleanup*
*Completed: 2026-04-28*
