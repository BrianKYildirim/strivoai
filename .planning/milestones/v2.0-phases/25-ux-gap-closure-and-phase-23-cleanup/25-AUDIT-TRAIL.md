---
phase: 25-ux-gap-closure-and-phase-23-cleanup
purpose: REQ-ID → evidence map for the 7 UX-* IDs Phase 25 closes
authored: 2026-04-28
schema_locked_by: D-21
---

# Phase 25 Audit Trail

Each row back-registers a v2.0 UX REQ-ID against the file evidence shipped in
Phase 25. Two rows (UX-09, UX-10) are pure back-registration of Phase 23 work
surfaced by the v2.0 milestone audit; no new code in Phase 25.

| REQ-ID | Closed by plan | Evidence file:line | Note |
|--------|----------------|--------------------|------|
| UX-01  | 25-01          | `src/components/topup/MeritBalanceHeaderV2.tsx:36-47` (triggerStateClass derivation + className wiring at line 47); `src/components/TopBar.tsx:9,149` (V2 import + mount); `src/components/MeritBalanceBadge.tsx` DELETED | Header badge wired in Phase 24; Phase 25 adds isLow/isZero color states + deletes orphan v1 badge (SC-7). |
| UX-02  | 25-01          | `src/pages/CareerCompass.tsx:25-26` (LowBalanceWarning + MeritCostPreview imports); `src/pages/CareerCompass.tsx:932-933` (`<LowBalanceWarning />` + `<MeritCostPreview ... />` above Analyze CTA) | CareerCompass was the only missing of 6 feature pages; SC-1 closed. |
| UX-03  | 25-01          | `src/components/LowBalanceWarning.tsx:25` (cheapestApplicableCost), `:21,26` (MERIT_COST_PER_FEATURE consumed); mounted in `src/components/TopBar.tsx:238`, `src/pages/Upload.tsx:439`, `src/pages/RecruitingLens.tsx:677`, `src/pages/InterviewPrep.tsx:425`, `src/pages/LinkedInGrader.tsx:648`, `src/pages/SkillsGapAnalysis.tsx:601,690`, `src/pages/CareerCompass.tsx:932` | 2× cheapest-applicable-cost threshold computed inline (NOT via `useMerits.isLow` — different signal). SC-2 closed. |
| UX-04  | 25-01          | `src/hooks/useOutOfMeritsModal.ts` (Phase 24); `src/pages/Upload.tsx:18` (OutOfMeritsModalV2 import), `:34` (openModal pulled from usePaywallGuard), `:316-317` (402 path → openModal), `:492` (modal mount); `src/hooks/usePaywallGuard.ts:4,18,27` (useOutOfMeritsModal wired); `src/pages/RecruitingLens.tsx:25,378,720`; `src/pages/InterviewPrep.tsx:23,190,544`; `src/components/UpgradeModal.tsx` DELETED | UpgradeModal removed; generic CTAs in TopBar/Navbar route via `<Link to="/pricing">` (TopBar.tsx:199,210; Navbar.tsx:507,587,596). SC-3 closed. |
| UX-09  | 25-03 (back-reg only) | `src/pages/InterviewPrep.tsx:427-433` (Elite quiz UI region: `tier={state.tier === "elite" ? "elite" : "pro"}` + Elite-only StreakDisplay mount at :433-434); `src/pages/InterviewPrep.tsx:473,481` (quiz-active StreakDisplay) | Elite quiz UI shipped in Phase 23 SC-* (no new code in Phase 25). SC-5 closed via back-registration. |
| UX-10  | 25-03 (back-reg only) | `src/components/InterviewStreakDisplay.tsx:15-20` (component definition: streakDays / state / quizzesToday / maxQuizzesPerDay props) | Streak component shipped in Phase 23 SC-* (no new code in Phase 25). SC-5 closed via back-registration. |
| UX-11  | 25-02          | `src/hooks/useMerits.test.ts:174` (UX-11 (a) reactivity: `it('UX-11: canAfford(cost) reactively flips false after balance drop via invalidation', ...)`); `src/hooks/useMerits.test.ts:195` (UX-11 (b) staleTime: `it('UX-11: post-deduction balance consistent within 5s (staleTime invariant)', ...)`); 5s window assertion at `:214` (advanceTimersByTime(5_000)) + invalidate at `:215` | `canAfford(cost)` reactivity + 5 s staleTime invariant covered by automated unit tests. SC-6 closed. |

## Phase 23 cleanup back-references (SC-7, SC-8a, SC-8b, SC-9)

| Item | Plan | Evidence | Note |
|------|------|----------|------|
| SC-7 (orphan badge delete) | 25-01 | `git ls-files src/components/MeritBalanceBadge*` returns ∅; `git ls-files src/components/UpgradeModal.tsx` returns ∅ | Both MeritBalanceBadge.tsx and .test.tsx removed; UpgradeModal.tsx removed (commits 3a2e2e6 + Plan 25-01 commit chain). |
| SC-8a (validator stubs) | 25-03 | `grep -rn "validateFlashcards\|validateQuizQuestions" supabase src` returns only the historical mention at `supabase/functions/_shared/interview-prep-validation.ts:3` (file-header comment) — no live exports remain (commit 4a207fb) | Throwing stubs deleted (lines 185-198 of pre-edit file); `validateInterviewPrepPayload` (line 100) is sole canonical export. |
| SC-8b (test hangs documented) | 25-03 | `src/pages/InterviewPrep.test.tsx:10` + `:188` (TODO(IPC-JSDOM-001) comment refs); `docs/tech-debt/IPC-JSDOM-001.md:1-50` (backlog ticket file with frontmatter id IPC-JSDOM-001 + 5 sections: Summary, Root cause hypothesis, Reproduction, Candidate fixes, Closing criteria) | No `it.skip` added — RESEARCH Drift Finding 3: the 5 form-submission tests were never written. Comment block extended to cite IPC-JSDOM-001 backlog ticket (commit 4bd0937). |
| SC-9 (runbook reminder) | 25-03 | `scripts/phase21-runbook.ps1:775` (SC-9 sentinel comment: `# SC-9: interview-prep-coach delete reminder (idempotency sentinel)`); `:776-781` (Write-Step + 5 × Write-Note text-only block citing `supabase functions delete interview-prep-coach`) | Idempotent `Stage-D4-Finalize` reminder for `supabase functions delete interview-prep-coach`. Operator runs the command (script does NOT execute it). Pre-existing Phase 27 SC-4 coordination block at `:789-794` retained (commit 0870f73). |
