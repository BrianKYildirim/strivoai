---
phase: 22
slug: linkedin-grader-ui-overhaul-cross-feature-memory-history
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 22 — Validation Strategy

> Reconstructed retroactively from phase plan + summary artifacts. Every Nyquist gap filled via source-contract tests that assert the plan's structural commitments (classnames, constants, RPC call shapes, useQuery hooks, route dispatchers) against the implemented source. Live-behavior parity (Pro/Elite DOM, browser layouts at 375/768/1280px, cross-account RLS) remains manual per plan design.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (frontend)** | vitest 1.6.1 + jsdom (node `readFileSync` for source-grep) |
| **Framework (edge)** | Deno 2+ native (`Deno.readTextFile` + `assertEquals`) |
| **Frontend config** | `vitest.config.ts` (include: `src/**/*.test.{ts,tsx}`) |
| **Edge config** | `supabase/functions/deno.json` + `scripts/run-edge-tests.ps1` |
| **Quick run (frontend)** | `npx vitest run src/pages/*.phase22.test.ts` |
| **Quick run (edge)** | `deno test supabase/functions/{analyze-career,grade-linkedin,recruiting-lens,interview-prep-analyze}/phase22-contract.test.ts --no-check --allow-env --allow-read` |
| **Full suite (frontend)** | `npm run test` |
| **Full suite (edge)** | `.\scripts\run-edge-tests.ps1` |
| **Estimated runtime** | ~6s frontend + ~2s edge |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command for the file touched
- **After every plan wave:** Run both quick commands
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | SC-1 (container `pt-6 pb-12 max-w-7xl`, no `pt-24`) | — | N/A | source-contract | `npx vitest run src/pages/LinkedInGrader.phase22.test.ts` | ✅ | ✅ green |
| 22-01-02 | 01 | 1 | SC-2 (`LOCKED_FIXES_PLACEHOLDERS` 4 cards + single outer `BlurredLockCard tier="pro"`, free-tier gated) | — | N/A | source-contract | `npx vitest run src/pages/LinkedInGrader.phase22.test.ts` | ✅ | ✅ green |
| 22-01-03 | 01 | 1 | SC-3 (`orderedSections` useMemo, Profile Completeness first, non-mutating, raw array to AnalysisComparisonModal) | — | N/A | source-contract | `npx vitest run src/pages/LinkedInGrader.phase22.test.ts` | ✅ | ✅ green |
| 22-01-04 | 01 | 1 | SC-7 (Pro/Elite DOM byte-identical) | — | N/A | manual | live browser, both tiers | — | manual-only |
| 22-02-01 | 02 | 1 | SC-1 — Results.tsx header-bar ("Resume Screening Report" exactly once + "Analyze New Resume" → `/upload`) | — | N/A | source-contract | `npx vitest run src/pages/Results.phase22.test.ts` | ✅ | ✅ green |
| 22-02-02 | 02 | 1 | SC-1 — CareerCompass.tsx header-bar ("Your Career Compass" + "Start New Analysis" bound to `handleRefreshAnalysis`) | — | N/A | source-contract | `npx vitest run src/pages/CareerCompass.phase22.test.ts` | ✅ | ✅ green |
| 22-02-03 | 02 | 1 | SC-1 — RecruitingLens.tsx header-bar ("Your Recruiting Lens Match" + "Run New Match", `text-2xl font-semibold`) | — | N/A | source-contract | `npx vitest run src/pages/RecruitingLens.phase22.test.ts` | ✅ | ✅ green |
| 22-03-01 | 03 | 1 | SC-4 — `reusedLinkedinGrade` + `linkedinGradeDate` additive response fields + `career.reuse` structured log | — | N/A | source-contract | `deno test supabase/functions/analyze-career/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-03-02 | 03 | 1 | SC-5 — HTTP 412 `linkedin_prior_missing` with `details.{hasResume,hasLinkedin}` BEFORE `withMerits`; `allowResumeOnly` bypass | T-22 (fail-closed credit protection) | 412 fired before merits deducted | source-contract | `deno test supabase/functions/analyze-career/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-03-03 | 03 | 1 | SC-5 — `submit-career-analysis-job` pass-through of `allowResumeOnly` on merit + legacy payloads | — | N/A | source-contract | `deno test supabase/functions/analyze-career/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-03-04 | 03 | 1 | SC-5 — CareerCompass renders memory Badge + D-16 Dialog (`linkedinPriorMissingOpen` + "Add your LinkedIn analysis" + "Continue without") | — | N/A | source-contract | `npx vitest run src/pages/CareerCompass.phase22.test.ts` | ✅ | ✅ green |
| 22-03-05 | 03 | 1 | D-17 — No PDF re-parse on reused path | — | N/A | manual | tail staging function logs during reuse scenario; confirm absence of `pdf.extract`/`scrapeLinkedInProfile` traces | — | manual-only |
| 22-04-01 | 04 | 1 | SC-6 — grade-linkedin: 2 `record_ai_usage` sites (`p_action_type: 'linkedin_grading'` × paid `p_credits: 1` + free-scan `p_credits: 0`) | T-22 Pitfall 3 | free-scan carve-out still written | source-contract | `deno test supabase/functions/grade-linkedin/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-04-02 | 04 | 1 | SC-6 — analyze-career: 2 `record_ai_usage` sites (`p_action_type: 'career_compass'`, short-circuit + full-parse convergence) | — | exactly-once per success path | source-contract | `deno test supabase/functions/analyze-career/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-04-03 | 04 | 1 | SC-6 — recruiting-lens: 1 `record_ai_usage` (`p_action_type: 'recruiting_lens'`) covering Free/Pro/Elite | — | N/A | source-contract | `deno test supabase/functions/recruiting-lens/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-04-04 | 04 | 1 | SC-6 — interview-prep-analyze: exactly 1 `record_ai_usage` (`p_action_type: 'interview_prep'`) | — | no double-write across Elite/Pro split | source-contract | `deno test supabase/functions/interview-prep-analyze/phase22-contract.test.ts --no-check --allow-env --allow-read` | ✅ | ✅ green |
| 22-04-05 | 04 | 1 | SC-6 — AnalysisHistory: `findIdForEntry` ≥5 sites + 4 useQuery hooks + `?id=` routes for 4 features + `No activity yet` preserved | — | RLS-scoped queries | source-contract | `npx vitest run src/pages/AnalysisHistory.phase22.test.ts` | ✅ | ✅ green |
| 22-05-01 | 05 | 1 | SC-6 — LinkedInGrader `?id=` hydration: UUID regex + `from('linkedin_grades')` + `isV3Grade` guard + `setIsFromCache(true)` + `setShowInput(false)` | T-22-10 (RLS cross-user) | no manual `.eq('user_id',...)` — RLS reliance | source-contract | `npx vitest run src/pages/LinkedInGrader.phase22.test.ts` | ✅ | ✅ green |
| 22-05-02 | 05 | 1 | SC-6 — CareerCompass `?id=` hydration: UUID regex + `from('analysis_results')` w/ `analysis_type: 'career_compass'` + pinned `data.raw_response` | T-22-10 | RLS reliance | source-contract | `npx vitest run src/pages/CareerCompass.phase22.test.ts` | ✅ | ✅ green |
| 22-05-03 | 05 | 1 | SC-6 — RecruitingLens `?id=` hydration: `analysis_type: 'recruiting_lens'` + Pitfall 6 `toast.message` on miss (NOT `toast.error`) | T-22-10 | RLS reliance + graceful-degrade on tier persistence gap | source-contract | `npx vitest run src/pages/RecruitingLens.phase22.test.ts` | ✅ | ✅ green |
| 22-05-04 | 05 | 1 | SC-6 — InterviewPrep `?id=` hydration: `from('interview_quizzes')` + `from('interview_quiz_answers')` + new `PastQuizView` rendered BEFORE `result ?` ternary | T-22-10 | RLS reliance | source-contract | `npx vitest run src/pages/InterviewPrep.phase22.test.ts` | ✅ | ✅ green |
| 22-05-05 | 05 | 1 | SC-7 — all 4 pages: default input view unchanged when `?id=` absent | — | N/A | manual | live browser, all 4 feature URLs with no query | — | manual-only |
| 22-05-06 | 05 | 1 | T-22-10 — cross-user deep-link attempt returns zero rows (RLS) | T-22-10 | RLS enforces ownership | manual | staging: open user-A's `?id=` URL as user-B → toast "Analysis not found" | — | manual-only |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/pages/LinkedInGrader.phase22.test.ts` — 22-01 + 22-05 LinkedInGrader assertions
- [x] `src/pages/Results.phase22.test.ts` — 22-02 Results header-bar
- [x] `src/pages/CareerCompass.phase22.test.ts` — 22-02 + 22-03 + 22-05 CareerCompass assertions
- [x] `src/pages/RecruitingLens.phase22.test.ts` — 22-02 + 22-05 RecruitingLens assertions
- [x] `src/pages/InterviewPrep.phase22.test.ts` — 22-05 PastQuizView + hydration
- [x] `src/pages/AnalysisHistory.phase22.test.ts` — 22-04 findIdForEntry + routing
- [x] `supabase/functions/analyze-career/phase22-contract.test.ts` — 22-03 + 22-04 analyze-career
- [x] `supabase/functions/grade-linkedin/phase22-contract.test.ts` — 22-04 record_ai_usage × 2
- [x] `supabase/functions/recruiting-lens/phase22-contract.test.ts` — 22-04 record_ai_usage × 1
- [x] `supabase/functions/interview-prep-analyze/phase22-contract.test.ts` — 22-04 record_ai_usage × 1 exactly-once

Existing infrastructure (vitest + Deno) covered all phase requirements — no framework installs needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pro/Elite DOM byte-identical to pre-phase output across all 4 results pages | 22-01 SC-7, 22-02 SC-7 | Requires live rendering in both tiers at 3 viewports (375 / 768 / 1280px) in both themes — headless DOM snapshots would not catch layout drift | `npm run dev` → sign in as Pro → walk /results /career-compass /linkedin-grader /recruiting-lens → repeat as Elite → confirm no visual regression vs. pre-22 screenshots |
| Live layout parity (LinkedInGrader container matches Results at all breakpoints) | 22-01 D-07 | Per CLAUDE.md reliability rule — UI changes must be browser-verified | `npm run dev` → open LinkedInGrader + Results side by side at 375 / 768 / 1280px in light and dark themes |
| D-17 no PDF re-parse on reused LinkedIn path | 22-03 D-17 | Verifiable only by tailing Supabase edge-function logs during a real Career Compass run with both priors present | `supabase functions logs analyze-career` during reuse scenario → confirm absence of `scrapeLinkedInProfile` / Claude PDF parse lines AND presence of single `career.reuse { reusedLinkedinGrade: true, skippedPdfParse: true }` log |
| End-to-end SC-6 flow: History click → deep-link route → feature page hydrates past analysis | 22-04 + 22-05 SC-6 | Requires cross-page navigation, auth, and real persisted data | Free-tier staging account → run one of each 5 features → `/history` → click each of the 5 rows → confirm each lands on specific past analysis (resume → `/results/{id}`, others → `?id=<uuid>`) |
| T-22-10 RLS enforcement on deep links | 22-05 T-22-10 | Requires two distinct authenticated user sessions | Staging: copy `?id=<uuid>` URL from user A's History → open while signed in as user B → expect toast "Analysis not found" / "This analysis wasn't saved…" and default input view |
| D-16 graceful-fallback Dialog UX | 22-03 SC-5 | Source-contract tests verify wiring; but user-choice flow ("Add LinkedIn analysis" vs "Continue without") must be clicked through | Staging account with resume but no LinkedIn grade → submit Career Compass → expect 412 + Dialog → click "Continue without" → confirm resubmit with `allowResumeOnly: true` succeeds |
| SC-7 `?id=`-absent default view on 4 feature pages | 22-05 SC-7 | Mirror of regression check for Plan 22-05 | Open `/linkedin-grader` / `/career-compass` / `/recruiting-lens` / `/interview-prep` with no query string → each should render its default input/landing view unchanged |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (structural requirements automated; live-behavior + cross-tier parity explicitly routed to Manual-Only)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every plan has ≥1 automated task; manual items are terminal per-plan)
- [x] Wave 0 covers all MISSING references (10 test files created, 22/22 automatable gaps resolved)
- [x] No watch-mode flags (all commands use `vitest run` or `deno test`, not `--watch`)
- [x] Feedback latency < 10s (~6s frontend + ~2s edge)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending operator review

---

## Validation Audit 2026-04-20

| Metric | Count |
|--------|-------|
| Gaps found | 22 automatable + 6 inherently manual = 28 |
| Resolved (automated) | 22 |
| Escalated to manual-only | 6 |
| Test files created | 10 |
| Test cases added | ~80 (62 frontend + 18 edge) |

All Phase 22 structural requirements (class names, constants, RPC shapes, response contracts, route dispatchers, useQuery hooks, component ordering) are now covered by source-contract tests that run offline in under 10 seconds. Live-behavior parity remains under existing operator checkpoint gates (Tasks 3 of plans 22-01 / 22-02 / 22-03 / 22-04 / 22-05 are still PENDING per their summaries).
