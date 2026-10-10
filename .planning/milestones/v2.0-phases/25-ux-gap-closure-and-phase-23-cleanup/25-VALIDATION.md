---
phase: 25
slug: ux-gap-closure-and-phase-23-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6.1 + @testing-library/react 14.3.1 + jsdom 24.1.3 (frontend); Deno test stdlib (edge utilities) |
| **Config file** | `package.json` scripts (no dedicated `vitest.config.*`); `supabase/functions/deno.json` for edge |
| **Quick run command** | `npm run test -- <changed-file-test>` |
| **Full suite command** | `npm run test` (frontend) + `.\scripts\run-edge-tests.ps1` (edge) |
| **Estimated runtime** | ~30–60s frontend; ~10–20s edge |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- <changed-file-test>` + `npm run lint`
- **After every plan wave:** Run `npm run test` + `.\scripts\run-edge-tests.ps1`
- **Before `/gsd-verify-work`:** Full suite must be green AND `npm run build` clean
- **Max feedback latency:** ~60 seconds (frontend full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-CC-MCP | 01 | 1 | UX-02 / SC-1 | — | N/A | smoke | `npm run dev` + visit `/career-compass`; `grep -n "MeritCostPreview" src/pages/CareerCompass.tsx` returns ≥1 | ✅ existing | ⬜ pending |
| 25-01-LBW-NEW | 01 | 1 | UX-03 / SC-2 | — | N/A | unit | `npm run test -- src/components/LowBalanceWarning.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 25-01-V2-COLOR | 01 | 1 | UX-01 / SC-4, SC-7 | — | N/A | unit | `npm run test -- src/components/topup/MeritBalanceHeaderV2.test.tsx` | ✅ extend | ⬜ pending |
| 25-01-OOMM-WIRE | 01 | 2 | UX-04 / SC-3 | — | N/A | smoke | `npm run lint`; `grep -rn "UpgradeModal" src` returns ∅ | n/a | ⬜ pending |
| 25-01-ORPHAN-DEL | 01 | 2 | SC-7 | — | N/A | smoke | `git ls-files src/components/MeritBalanceBadge*` returns ∅ | n/a | ⬜ pending |
| 25-02-USEMERITS-TEST | 02 | 1 | UX-11 / SC-6 | — | N/A | unit | `npm run test -- src/hooks/useMerits.test.ts` | ❌ Wave 0 | ⬜ pending |
| 25-03-VALIDATOR-DEL | 03 | 1 | SC-8a | — | N/A | smoke | `grep -rn "validateFlashcards\|validateQuizQuestions" supabase src` returns ∅ | n/a | ⬜ pending |
| 25-03-IPC-COMMENT | 03 | 1 | SC-8b | — | N/A | manual | Read `src/pages/InterviewPrep.test.tsx` diff; backlog ID present in comment | ✅ existing | ⬜ pending |
| 25-03-RUNBOOK-D4 | 03 | 1 | SC-9 | — | N/A | smoke | `Select-String "interview-prep-coach" scripts/phase21-runbook.ps1` shows ≥2 matches | ✅ existing | ⬜ pending |
| 25-03-AUDIT-TRAIL | 03 | 2 | SC-4, SC-5 (UX-09, UX-10 back-reg) | — | N/A | manual | `test -f .planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/LowBalanceWarning.test.tsx` — NEW unit test for amber/zero render + threshold derivation. Plan 25-01 owns.
- [ ] `src/hooks/useMerits.test.ts` — NEW unit test for `canAfford(cost)` reactivity + 5s consistency. Plan 25-02 owns.
- [ ] Extend `src/components/topup/MeritBalanceHeaderV2.test.tsx` — assert amber/red trigger className for `isLow` / `isZero`. Plan 25-01 owns.
- [ ] `docs/tech-debt/IPC-JSDOM-001.md` (or chosen path) — NEW backlog ticket capturing root-cause hypothesis + repro for the InterviewPrep.test.tsx form-submission hang. Plan 25-03 owns.
- [ ] `.planning/phases/25-ux-gap-closure-and-phase-23-cleanup/25-AUDIT-TRAIL.md` — NEW REQ-ID → evidence table for UX-01/02/03/04/09/10/11. Plan 25-03 owns.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CareerCompass MeritCostPreview renders above Analyze CTA matching the other 5 feature pages | UX-02 / SC-1 | Visual layout / pattern match — automated DOM render only proves presence, not "matches existing pattern" | `npm run dev`; visit `/career-compass`; confirm `<MeritCostPreview featureCost={meritCost} />` mounts directly above the Analyze button with the same wrapper spacing as Upload page |
| LowBalanceWarning visual treatment matches Phase 20 amber tokens | UX-03 / SC-2 | Tailwind class names alone don't guarantee visual fidelity | `npm run dev`; manipulate `useMerits` mock to force `total < 2× cheapestApplicable`; confirm amber banner + dual CTAs render |
| UX-09 / UX-10 back-registration evidence | SC-5 | Documentation-only — no code surface to assert | Read `25-AUDIT-TRAIL.md`; verify rows for UX-09 (InterviewStreakDisplay) and UX-10 (Interview Prep Elite UI) cite evidence files |
| Stage-D4-Finalize runbook reminder reads naturally to operator | SC-9 | Voice / readability — Write-Note phrasing must match existing function | `pwsh -Command ". scripts/phase21-runbook.ps1; Stage-D4-Finalize"` (dry-run); confirm reminder block surfaces with same Write-Note style as adjacent steps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies declared above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new artifacts identified)
- [ ] No watch-mode flags (always `vitest run`, never `vitest`)
- [ ] Feedback latency < 60s per task
- [ ] `nyquist_compliant: true` set in frontmatter (planner flips this after final plan-checker pass)

**Approval:** pending
