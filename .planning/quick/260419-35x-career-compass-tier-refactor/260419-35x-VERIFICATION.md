---
phase: 260419-35x-career-compass-tier-refactor
verified: 2026-04-19T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Free-tier success path end-to-end: user with both prior resume analysis + linkedin grade runs Career Compass"
    expected: "Single Anthropic invocation in function logs (not parallel), response has careerFields.length=1, roles.length=1, roleRoadmaps.length=1 with 2 steps, roleReadinessBreakdown = {overallScore, targetRole} only, no surpriseFits/skillGaps/resumeImprovements keys, 3 merits deducted"
    why_human: "Requires running the live Anthropic call; programmatic check only verifies code paths, not actual model output and merit deduction"
  - test: "412 missing-prior-analyses: free user lacking resume row only -> retry; then lacking linkedin only; then lacking both"
    expected: "Each returns HTTP 412, frontend renders MissingPriorAnalysesCTA with the correct button(s), merit balance unchanged in all three cases (verify via Supabase user_merits.balance SQL query)"
    why_human: "Requires authenticated frontend session + live DB state manipulation + balance observation"
  - test: "Per-section visual lock UX on /career-compass with free-tier results (viewport >=1280px)"
    expected: "Career DNA fully visible; Best Fit Roles / Fields / Roles each show 1 visible card + BlurredLockCard below; Readiness shows ScoreRing+target visible + single BlurredLockCard spanning Strengths/Gaps/Assessments/Verdict; Roadmap shows 2 phases visible + 3-phase locked placeholder labeled Months 5-7 / 8-10 / 11-12; Surprise Fits entire section blurred"
    why_human: "Visual appearance and placement cannot be verified programmatically; need human eye on rendered DOM"
  - test: "Results view page width matches Resume Analysis Results"
    expected: "Tabs span from the same left gutter to same right gutter as /results/:id Resume Analysis page; no visible symmetric horizontal whitespace band"
    why_human: "Visual layout comparison requires human side-by-side viewing"
  - test: "Pro tier regression"
    expected: "Full parallel fan-out output (all careerFields / roles / roleRoadmaps / surpriseFits / skillGaps / resumeImprovements); no BlurredLockCard anywhere"
    why_human: "Requires live Pro-tier user + Anthropic call + visual confirmation"
  - test: "Elite tier regression"
    expected: "Full output plus compensationIntelligence + smartApplicationStrategy; parallel-fan-out preserved"
    why_human: "Requires live Elite-tier user + Anthropic call"
  - test: "Boot-time invariant proof on cold start"
    expected: "Function cold-start logs show no `[analyze-career] FREE_SINGLE_CALL_MAX_TOKENS=... exceeds budget` throw"
    why_human: "Requires a deployed function cold-start; local deno test already asserts the static bounds but runtime boot requires deploy"
---

# Quick 260419-35x: Career Compass Tier Refactor — Verification Report

**Goal:** Career Compass free-tier runs as a single Anthropic call (<=4000 maxTokens, no parallel fan-out), requires prior Resume Analysis AND LinkedIn Grader results (412 with missing-flag when absent, no merits deducted), consumes structured analysis outputs (not raw PDFs), produces the free-tier whitelist shape, and the Career Compass UI mirrors the Resume Analysis `BlurredLockCard` pattern with visible content above locked placeholders, plus horizontal-whitespace layout fix.

**Verified:** 2026-04-19
**Status:** human_needed
**Re-verification:** No — initial verification
**Commits:** 183e6c1 (backend), 107b29c (frontend) — both present in `git log`

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free-tier runs as single Anthropic call, never exceeds 4000 maxTokens or TIER_MAX_TOKENS.free | VERIFIED | `analyze-career/index.ts:17` imports `FREE_SINGLE_CALL_MAX_TOKENS`; `:69-71` boot invariant asserts `<=TIER_MAX_TOKENS.free && <=4000`; `:605-613` uses single `invokeAnthropicText` with `maxTokens: FREE_SINGLE_CALL_MAX_TOKENS`; `career-prompts.ts:285` sets constant to `4000`; deno test `35x: FREE_SINGLE_CALL_MAX_TOKENS is <= 4000...` passes |
| 2 | Returns 412 with `{ missing: ['resume' \| 'linkedin' \| 'both'] }` when prior analyses absent | VERIFIED | `analyze-career/index.ts:525-552`: parallel selects on `resumes` + `linkedin_grades` by `user_id` order created_at desc limit 1; builds `missing` array; returns `new Response(..., { status: 412 })` with body `{ error: 'missing_prior_analyses', missing }`; executes BEFORE `withMerits` call at `:586` — verified via code path read |
| 3 | Free-tier inputs are structured prior analyses (resumes.grading_data + linkedin_grades.grading_data), not PDFs | VERIFIED | `:555-556` assigns `priorResumeGrading = resumeRow.grading_data` and `priorLinkedinGrading = linkedinRow.grading_data`; `:599-603` passes them to `buildFreePriorAnalysesPrompt`; `:562-584` input validation for `resumeFilePath`/`linkedinPdfContent` skipped when `isFreeSingleCallPath` |
| 4 | Hardcoded `maxTokens: 2500` line 1076 regression no longer governs free | VERIFIED | Free branch executes at `:597-702` inside `withMerits` and returns before flow ever reaches the legacy non-merit path; production flow uses `MERIT_SYSTEM_ENABLED && userContext` at `:511` |
| 5 | applyCareerTierShape free output: full careerDNA, 1 careerFields, 1 roles, 1 roleRoadmap w/2 steps, scorebox-only readiness (no verdict), no surpriseFits | VERIFIED | `result-merger.ts:372-400` implements all slices/deletes; deno tests CC-01/CC-02 (11 assertions) all pass |
| 6 | Pro and Elite tiers continue via executeCareerParallelCalls with byte-identical behavior | VERIFIED | `executeCareerParallelCalls` defined at `index.ts:73`, invoked unchanged at `:792` inside the non-free branch of `withMerits`; free branch returns early at `:698-701` preventing fall-through; `CAREER_CALL_CONFIGS` and budgets unchanged |
| 7 | Every free-tier section renders visible content at top + BlurredLockCard below using `@/components/BlurredLockCard` | VERIFIED | All 6 components import `BlurredLockCard` from `@/components/BlurredLockCard`: BestFitRoles.tsx:3, FieldsTab.tsx:5, RolesTab.tsx:5, ReadinessTab.tsx:8, RoadmapTab.tsx:4, SurpriseFits.tsx:4 |
| 8 | Per-section free visibility matches CONTEXT.md table | VERIFIED | BestFitRoles has `isFree` slice + single overlay (:19,:76); FieldsTab slices to 1 + overlay (:22-23,:139); RolesTab slices to 1 + overlay (:20-21,:115); ReadinessTab gates `readinessVerdict` behind `!isFree` (:190) + single overlay at :114/:204 spanning Strengths/Gaps/Assessments/Verdict; RoadmapTab renders fixed Months 5-7/8-10/11-12 labels (:103-105); SurpriseFits wraps whole section for free (:35-45) |
| 9 | 412 surfaces as actionable CTA, not toast-then-blank | VERIFIED | CareerCompass.tsx:62 `missingPrior` state; :419 and :483 parse `missing_prior_analyses` from both submit-path and polling-failed-path; :575-611 render Card with two conditional Buttons routing `/upload` and `/linkedin-grader` |
| 10 | Results page tabs span full width (max-w-5xl matching Results.tsx), not max-w-6xl | VERIFIED | CareerCompass.tsx:572 uses `${analysis ? "max-w-5xl" : "max-w-6xl"}` — results view matches Results.tsx:706 exactly (`max-w-5xl`) |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/analyze-career/index.ts` | Free-tier branch, 412 short-circuit, applyCareerTierShape call | VERIFIED | All elements present at expected locations; imports FREE_SINGLE_CALL_MAX_TOKENS |
| `supabase/functions/_shared/career-prompts.ts` | FREE_SINGLE_CALL_MAX_TOKENS + buildFreePriorAnalysesPrompt | VERIFIED | Constant at :285; builder exported; FREE_TIER_SUFFIX tightened per summary |
| `supabase/functions/_shared/result-merger.ts` | Extended applyCareerTierShape with stricter free shape | VERIFIED | :353-405 implements slice-to-1 careerFields/roles, delete surpriseFits, slice roleRoadmaps to 1 with 2-step slice, reduce roleReadinessBreakdown to {overallScore,targetRole} |
| `supabase/functions/_shared/career-shape.test.ts` | Updated assertions + boot invariant test | VERIFIED | 22/22 tests pass including new `35x: FREE_SINGLE_CALL_MAX_TOKENS` assertion |
| `src/pages/CareerCompass.tsx` | Width fix + 412 CTA + BlurredLockCard wiring | VERIFIED | max-w-5xl on results branch, MissingPriorAnalysesCTA inline, SurpriseFits conditional widened to render for free |
| `src/components/career-compass/{BestFitRoles,FieldsTab,RolesTab,ReadinessTab,RoadmapTab,SurpriseFits}.tsx` | Each imports BlurredLockCard and gates on subscriptionTier==='free' | VERIFIED | All 6 files grep-confirmed; slice-to-1 applied in frontend as defense-in-depth |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| analyze-career free branch | resumes + linkedin_grades tables | Two PostgREST SELECTs ordered created_at desc limit 1 | WIRED | :525-541 uses `.from('resumes').select('id, grading_data, created_at').eq('user_id', ...).order('created_at', { ascending: false }).limit(1).maybeSingle()` (same shape for linkedin_grades); executed in `Promise.all` |
| analyze-career free branch | invokeAnthropicText single call | Direct call inside withMerits, not executeCareerParallelCalls | WIRED | :605-613 single invocation with `maxTokens: FREE_SINGLE_CALL_MAX_TOKENS`; `executeCareerParallelCalls` is only referenced at definition (:73) and Pro/Elite path (:792) |
| analyze-career free branch | applyCareerTierShape | Defense-in-depth call after JSON parse before response | WIRED | :640 `applyCareerTierShape(analysisResult, 'free')` runs post-parse, pre-persist, pre-return |
| CareerCompass.tsx | 412 response handling | setMissingPrior + MissingPriorAnalysesCTA render | WIRED | :419 and :483 detect shape; :575-611 conditionally renders CTA with route buttons |
| ReadinessTab.tsx | @/components/BlurredLockCard | import + free-conditional render | WIRED | :8 imports; :114 and :204 wrap Strengths/Gaps/Assessments/Verdict for free |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| analyze-career free branch | priorResumeGrading, priorLinkedinGrading | Supabase DB selects on resumes + linkedin_grades with real user_id | Yes (DB query not static) | FLOWING |
| analyze-career free branch | analysisResult | `invokeAnthropicText` result + `applyCareerTierShape(*, 'free')` | Yes (live API, then shaped) | FLOWING (pending live run — see human verification) |
| CareerCompass.tsx | missingPrior | setMissingPrior from submit + polling 412 responses | Yes (populated from backend error payload) | FLOWING |
| SurpriseFits.tsx (free) | LOCKED_SURPRISE_PLACEHOLDERS | Intentional deterministic placeholder content | N/A by design | STATIC (intentional — CONTEXT.md D decision) |
| RoadmapTab.tsx (locked) | LOCKED_PHASE_PLACEHOLDERS | Intentional deterministic placeholder content | N/A by design | STATIC (intentional) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Deno tier-shape contract tests | `deno test _shared/career-shape.test.ts --allow-read --allow-env --no-check` | 22/22 pass including 35x boot invariant | PASS |
| FREE_SINGLE_CALL_MAX_TOKENS constant resolves to <=4000 | grep + imports | Constant is 4000, imported into analyze-career | PASS |
| executeCareerParallelCalls still invoked for Pro/Elite | grep call sites | Called once at :792 (Pro/Elite branch) | PASS |
| Every career-compass tab component imports BlurredLockCard | grep `@/components/BlurredLockCard` | All 6 source files match | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| QT-260419-35x | 260419-35x-PLAN.md | Career Compass free-tier single-call + tier-gated lock UX | SATISFIED | All 10 must-have truths VERIFIED; 22/22 deno tests pass |

### Anti-Patterns Found

None found in scanned files. No TODO/FIXME/placeholder text, no empty handlers, no console.log-only functions, no hardcoded empty arrays flowing to render without data source. The deterministic lock placeholders (`LOCKED_SURPRISE_PLACEHOLDERS`, `LOCKED_PHASE_PLACEHOLDERS`) are intentional per CONTEXT.md decision (placeholder copy is deterministic, not fetched).

### Human Verification Required

Automated verification cannot exercise:
1. Live Anthropic call + merit deduction observation
2. Live 412 flow + merit-balance preservation
3. Visual lock UX placement and placeholder layout
4. Full-width layout parity with Resume Analysis Results page
5. Pro-tier regression (requires live account + API call)
6. Elite-tier regression (requires live account + API call)
7. Deployed cold-start boot invariant exception check

See `human_verification:` frontmatter for detailed test steps.

### Gaps Summary

No programmatic gaps found. All 10 observable truths verified against the codebase at HEAD. All 22 Deno tier-shape tests pass (including the new 35x boot invariant). All 6 career-compass tab components have been refactored to the canonical `BlurredLockCard` pattern with free-tier conditional rendering, matching the Resume Analysis (`src/pages/Results.tsx`) reference. The Pro/Elite parallel fan-out (`executeCareerParallelCalls`) is structurally untouched.

Status is `human_needed` because goal-achievement claims that require live-runtime behavior (actual single-call execution count, merit deduction, visual lock placement, full-width layout parity, Pro/Elite regression, cold-start invariant throw) cannot be proven without manual verification against the deployed function + live UI.

---

_Verified: 2026-04-19_
_Verifier: Claude (gsd-verifier)_
