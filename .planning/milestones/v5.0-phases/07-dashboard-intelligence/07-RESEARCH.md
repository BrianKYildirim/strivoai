# Phase 7: Dashboard Intelligence - Research

**Researched:** 2026-07-08
**Domain:** Client-side derivation of dashboard "career intelligence" over already-stored Supabase analysis rows (no new AI calls). React 18 + TanStack Query + shadcn/ui presentational sections; pure-TS derivation module under `src/lib/`.
**Confidence:** HIGH — this is an internal-codebase phase; every finding is grounded in the actual `src/pages/Dashboard.tsx`, the Phase 4/5/6 producer schemas, and the existing test/Playwright setup I read directly. No external library research was needed (and the milestone Out-of-Scope bars new infra/SDKs).

<user_constraints>
## User Constraints (from 07-CONTEXT.md)

### Locked Decisions (verbatim)

**Recruiter Response Rules**
- **D-01:** The final Likely Recruiter Response state (fixed 5-state set) is driven by a **weighted stored-signal rubric** — deterministic scoring over the stored analysis signals, not a single weakest-link or primary-source rule.
- **D-02:** **Missing data caps confidence** — absent sources limit how strong a response state can be claimed, rather than merely lowering the score. (This is the honesty mechanism; it also handles failed/partial data, see D-08.)
- **D-03:** Thresholds are **conservative by default** — when in doubt, the rubric assigns the more cautious response state.
- **D-04:** The "Strengthen My Positioning" primary action targets the **weakest weighted signal** in the rubric.

**Evidence & Empty States**
- **D-05:** Every insight carries an **inline source tag** — a small always-visible badge naming the producing feature (e.g. "Resume Analysis", "LinkedIn Grade"). No unsupported claims; every bullet is auditable at a glance.
- **D-06:** Stale/out-of-sync data is **shown with a staleness note** — always derive from the latest stored data, but flag age or cross-source desync (e.g. "Based on your resume analysis from May 12"). No silent staleness, no hard age cutoff.
- **D-07:** Non-mandated empty states (no data at all, etc.) are **action-first with one CTA**: a short line on what's missing plus a single button to the feature that produces the data. Reuse the existing `EmptyState` component pattern in `src/pages/Dashboard.tsx`. (DASH-03's missing-profile copy for Profile Alignment is locked verbatim by REQUIREMENTS.md.)
- **D-08:** Failed or partial/corrupt prior analyses **degrade to what's valid** — use intact stored signals, drop broken ones, and let the missing-data confidence cap (D-02) communicate reduced certainty. No separate error-state card; a bad source never blocks the section or the dashboard (DASH-04).

**Free vs Elite Depth**
- **D-09:** Elite-only depth renders as **locked teasers** for Free users — blurred/lock-icon rows with an upgrade prompt, consistent with the existing MiniMeter/locked patterns already on the dashboard.
- **D-10:** Free-tier insights derive from **Resume + LinkedIn only**; Career Compass, Saved Jobs, and Recruiting Lens enrichment is the Elite differentiator (matching DASH-01's cross-analysis framing).
- **D-11:** **Pro = Elite** for both new sections — the spec's "Elite" depth applies to all paid tiers.
- **D-12:** Tier-depth rules live in a **shared pure-TypeScript derivation module** (e.g. `src/lib/dashboard-intelligence/`) that computes each section's full model and applies tier caps deterministically. Unit-testable; both sections share it; components stay presentational.

**Section Layout & Deletion Boundary**
- **D-13:** The two new sections **reuse existing visual patterns** — `SectionHeader`/`EmptyState`/card primitives and current spacing. No distinct "intelligence" styling; lowest regression risk against DASH-05's visually-unchanged bar.
- **D-14:** Progress & Achievements + Activity Stream get **full dead-code removal** — delete the components AND any queries/helpers/types left unused by anything else, verified via type-check plus a shared-usage sweep so Merits/History keep their own data paths intact (DASH-02).
- **D-15:** New section components are **extracted to their own files** (`src/components/dashboard/`) with the derivation module under `src/lib/` — Dashboard.tsx is already ~1,316 lines; new logic stays testable and reviewable in isolation.
- **D-16:** DASH-06 validation runs as **automated + operator smoke**: unit tests on the derivation module (tier caps, rubric states, empty-state selection), Playwright checks for section order/presence, then a manual operator smoke pass for visual polish in light/dark/responsive — same model as Phase 6 verification. Operator smokes are `autonomous: false` checkpoints (never auto-approved).

### Claude's Discretion
- Exact rubric weights, signal normalization, and threshold values (within "conservative by default").
- Staleness-note wording and the age/desync heuristics that trigger it.
- Internal structure of the derivation module and component file naming.
- Locked-teaser visuals, as long as they match the existing locked-pattern language.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Milestone-level deferrals that touch this area, from ROADMAP backlog: Elite cross-analysis depth weight tuning, role/job-specific Profile Alignment layer, longitudinal trend views — all v5.x, not this phase.)
</user_constraints>

## Summary

Phase 7 is a **client-side derivation + presentation** phase, not an AI or infrastructure phase. Two inline dashboard sections in `src/pages/Dashboard.tsx` are replaced (`ProfileIntelligence` "Live Career Profile" → **Recruiter First Impression**; the `CareerTimeline` "Activity Stream" inside `ProgressAndAchievements` → **Profile Alignment**), the `ProgressAndAchievements` wrapper is deleted, and the final section order is forced to match DASH-05. All intelligence is computed by a new pure-TS module (`src/lib/dashboard-intelligence/`) reading the JSON rows the dashboard **already fetches today** — no new AI calls, no new queries strictly required for the core Free path.

The stored-data shapes the module consumes are fully knowable from the Phase 4/5/6 producer code: resume analysis lives in `resumes.grading_data` (jsonb) + `resumes.overall_score`; LinkedIn in `linkedin_grades.grading_data` (11-section `sectionBreakdown`) + `overall_score`; Career Compass + Recruiting Lens in `analysis_results.raw_response` (jsonb, filtered by `analysis_type`); saved jobs in `applications`. The dashboard already queries `resumes`, `applications`, `linkedin_grades`, and `analysis_results` via TanStack Query — the module can reuse these; only Career Compass / Recruiting Lens `raw_response` bodies need to be added to the Elite path (the current `dashboardAnalysisHistory` query selects metadata columns only, not `raw_response`).

**Two structural findings require a planner/operator decision before implementation** (see Open Questions): (1) **"Career Launch Path" (DASH-05 section #6) does not exist anywhere in the current dashboard code** — it cannot be preserved "visually unchanged" if it was never built; and (2) **Saved Jobs + "Every Version Ranked" currently live inside a shared `<Tabs>` control**, but DASH-05 lists them as sequential standalone sections #7 and #8 — un-tabbing them is itself a visual change to two "protected" areas. Both are real tensions between "match the exact order" and "leave protected areas visually unchanged."

**Primary recommendation:** Build one deterministic, unit-tested `src/lib/dashboard-intelligence/` module (pure functions: `deriveRecruiterFirstImpression(inputs, tier)` and `deriveProfileAlignment(inputs, tier)`) that takes already-fetched rows and returns fully-shaped, tier-capped view models with per-insight source tags, confidence caps, and empty-state selectors; keep the two new components in `src/components/dashboard/` purely presentational; resolve the two order/layout Open Questions with the operator before touching section order.

## Standard Stack

This phase adds **no dependencies**. Everything is already vendored and is the established pattern in this repo.

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | Presentational section components | Existing dashboard stack |
| @tanstack/react-query | 5.101.0 | Data fetching/caching for the stored rows | Every dashboard query already uses `useQuery`/`useInfiniteQuery` |
| TypeScript | 5.8.3 (strict) | Pure derivation module + typed view models | Repo-wide; strict mode enforced |
| shadcn/ui + Tailwind | — | `Card`, `Badge`, `Button` + semantic tokens | D-13 mandates reusing existing primitives |
| lucide-react | 0.462.0 | Section icons | Already imported in Dashboard.tsx |
| vitest | 4.1.9 | Unit tests for the derivation module | `src/lib/*.test.ts` is the existing pattern |
| @playwright/test | 1.61.0 | Section order/presence E2E | `e2e/*.spec.ts` is the existing pattern |

### Supporting (already in use)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.4.0 | Staleness-note formatting (D-06) | If a helper beyond the existing `formatDate` is wanted; prefer reusing the inline `formatDate` in Dashboard.tsx first |
| zod | 3.25.76 | (Optional) defensive parse of `grading_data`/`raw_response` jsonb | Only if you want a hardened input boundary; the module can also hand-guard with the existing `asArray`/`pickStrings` helpers. Do NOT migrate zod 3→4 (Out of Scope) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New pure-TS module in `src/lib/` | Inline derivation in the component | Rejected by D-12/D-15 — must be unit-testable and shared; components stay presentational |
| Reusing existing dashboard queries | New dedicated intelligence query | Add a query ONLY for the Elite Career Compass/Recruiting Lens `raw_response` bodies; core Free path needs no new query |
| `<Tabs>` for Resume Vault/Saved Jobs | Sequential sections | Forced by DASH-05 order (#7, #8) — but see Open Question 2 (visual-change tension) |

**Installation:** None. `npm i` already satisfies everything.

## Architecture Patterns

### Recommended Structure (D-12 / D-15)
```
src/lib/dashboard-intelligence/
├── index.ts                    # public API: deriveRecruiterFirstImpression, deriveProfileAlignment
├── types.ts                    # StoredInputs, RecruiterImpressionModel, ProfileAlignmentModel, SourceTag, Confidence
├── inputs.ts                   # normalize already-fetched rows → StoredInputs (safe jsonb access, staleness dates)
├── recruiter-first-impression.ts   # 5-state weighted rubric (D-01..D-04), Free/Elite caps (D-09..D-11)
├── profile-alignment.ts        # overall + 4 categories, ≤3 actions, mandatory no-score empty states (DASH-03)
├── staleness.ts                # D-06 age/desync note heuristics (Claude's discretion)
├── recruiter-first-impression.test.ts
└── profile-alignment.test.ts

src/components/dashboard/
├── RecruiterFirstImpression.tsx    # presentational; renders the model, source badges, locked teasers
├── ProfileAlignment.tsx            # presentational; renders score/categories/actions or locked empty state
└── (reuses SectionHeader/EmptyState/MiniMeter — see Pattern 3)
```

### Pattern 1: Pure derivation, presentational components (D-12)
**What:** The module takes plain data in, returns a fully-shaped, already-tier-capped view model. Components do zero business logic — they map the model to `Card`/`Badge`/`MiniMeter`.
**When to use:** Both new sections.
**Example (contract shape — design intent, not literal code):**
```typescript
// Source: derived from src/pages/Dashboard.tsx patterns + CONTEXT D-01/D-05/D-09
type SourceTag = 'Resume Analysis' | 'LinkedIn Grade' | 'Career Compass' | 'Recruiting Lens' | 'Saved Jobs';
type Confidence = 'low' | 'moderate' | 'high';           // D-02 cap
type RecruiterResponse =
  | 'strong_shortlist' | 'interested_needs_clearer_positioning'
  | 'competitive_undifferentiated' | 'relevant_experience_unclear_direction'
  | 'high_potential_insufficient_proof';                  // fixed 5-state set (DASH-01)

interface Insight { text: string; source: SourceTag; locked?: boolean; }
interface RecruiterImpressionModel {
  currentPositioning: string;
  standouts: Insight[];        // Free ≤2, Elite ≤3
  concerns: Insight[];         // Free 1, Elite ≤2
  response: RecruiterResponse; // deterministic from weighted rubric
  confidence: Confidence;      // capped by missing sources (D-02)
  weakestSignal: string;       // drives "Strengthen My Positioning" target (D-04)
  staleness?: string;          // D-06 note, e.g. "Based on your resume analysis from May 12"
  emptyState?: { message: string; ctaLabel: string; href: string }; // D-07
}
function deriveRecruiterFirstImpression(inputs: StoredInputs, tier: 'free' | 'elite'): RecruiterImpressionModel;
```

### Pattern 2: Deterministic weighted rubric (D-01, D-03)
**What:** Normalize each available stored signal (resume `overallScore`, LinkedIn `overall_score`/section bands, alignment of resume vs LinkedIn, saved-job/lens enrichment for Elite) to a 0–1 scale, apply fixed weights, sum, then map the total onto one of the 5 states via **conservative cutoffs** (D-03). Missing sources **cap the reachable state** (D-02) — e.g. resume-only can never claim "strong shortlist."
**When to use:** Recruiter First Impression response state; keep all weights/cutoffs as named constants for the VER unit tests to assert against.
**Anti-pattern:** Deriving the state from a single field, or from a mutable/random source — it must be a pure function of the inputs (same inputs → same state).

### Pattern 3: Reuse existing dashboard primitives (D-13, D-07, D-09)
**What:** `SectionHeader`, `EmptyState`, `MiniMeter`, and the `dashboardShellClass`/`Card` styling are **inline in `Dashboard.tsx`** today (lines 1241–1314, 168–169). The new components need them.
**When to use:** All new rendering.
**Decision needed:** Either (a) **extract** these three primitives into `src/components/dashboard/` and import them from both `Dashboard.tsx` and the new components (cleaner, but touches the protected file's internals), or (b) pass them down / duplicate minimal markup. Recommend (a) extraction with a byte-identical move so the protected sections render unchanged. The existing locked-teaser language to match for D-09 is the `MiniMeter` `muted` prop + the CareerRadar "Needs data"/"Coming Soon" treatment (Dashboard.tsx:920–924) and the `Lock` icon usage in `NextBestActions` (Dashboard.tsx:829).

### Anti-Patterns to Avoid
- **New AI call on load:** Forbidden by DASH-04 + milestone Out-of-Scope. The module is synchronous over already-fetched rows.
- **Fabricated/hardcoded scores or placeholder-as-personalized:** Forbidden by DASH-04. If a signal is absent, show an honest empty/locked state (D-07/D-08), never a filler number. Note the current `ProfileIntelligence` fallback strings like `'Upload or analyze a resume to map your strongest career signals.'` (Dashboard.tsx:347–350) are borderline placeholders — the new sections must use explicit action-first empty states, not sentinel bullet text.
- **One dead source blocking the section/dashboard:** D-08/DASH-04 — wrap each source read in a safe accessor; a malformed `raw_response` degrades to "drop that signal + cap confidence," never a thrown render.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Safe jsonb field access | Ad-hoc `data?.x as string[]` casts | Existing `asArray` + `pickStrings` helpers (Dashboard.tsx:119–133) | Already handle non-array/empty/whitespace; battle-tested on this exact data |
| Score clamping | New min/max math | Existing `clampScore` (Dashboard.tsx:117) | Consistency with every other dashboard number |
| Date formatting | New date lib wiring | Existing `formatDate` (Dashboard.tsx:135–138) or `date-fns` (already vendored) | Staleness notes (D-06) should match dashboard date style |
| Tier detection | New profile/tier query | `useTierAccess()` → `tier` ('free' \| 'elite' \| 'admin') | Single source of truth; already consumed in Dashboard.tsx:175. Note: no 'pro' — see Pitfall 4 |
| Data fetching | New fetch layer | Existing `useQuery`/`useInfiniteQuery` keys (see table below) | Cache-shared with the rest of the dashboard |
| Empty-state card | New empty component | Existing inline `EmptyState` (Dashboard.tsx:1241) | D-07 mandates reuse |

**Key insight:** Nearly every primitive this phase needs already exists inline in `Dashboard.tsx`. The work is **extract + derive + present**, not build-new.

## Stored Data Shapes (the derivation module's input contract)

This is the answer to research question #1 — verified against the Phase 4/5/6 producer code, not assumed.

### `resumes` (Resume Analysis — producer: Phase 5 `analyze-resume`)
- Columns the dashboard reads: `id, file_name, created_at, analyzed_at, overall_score, grading_data` (Dashboard.tsx:240).
- `overall_score`: int 0–100 (the headline; use this, not a recompute).
- `grading_data` (jsonb) top-level fields (from `_shared/resume-prompts.ts:391–417`):
  - **All tiers:** `overallScore`, `executiveSummary { keyStrengths[], keyGaps[], highImpactFix }`, `resumeSignal`, `strengths[]`, `priorityImprovements[]` (Free = exactly 1), `rewriteSuggestions[]`, `criterionFeedback[]` (11 items: `{id,label,weight,score,feedback}`).
  - **Elite-only (stripped from Free — `resume-prompts.ts:62`):** `industryGuess`, `suggestedTargetRoles[]`, `recommendedKeywords[]`, `eliteInsights`, and the richer set `recruiterFirstImpressions`, `hiddenWeaknesses`, `powerPhrases`, `detailedATSGapAnalysis`, `competitiveRanking`, `interviewLikelihood`.
- **Note:** Elite resume analysis already emits a `recruiterFirstImpressions` field — a directly relevant stored signal for the Recruiter First Impression section's Elite depth. Verify its exact shape at implementation time (it is not in the Free schema).
- Current dashboard already pulls strengths/weaknesses/roles/industries from here via `pickStrings` with fallback key lists (Dashboard.tsx:326–352) — reuse that key-precedence approach.

### `linkedin_grades` (LinkedIn Grader — producer: Phase 4)
- Columns read: `id, overall_score, grading_data, created_at, profile_url` (Dashboard.tsx:285). Query caps to 5 rows for Elite, 1 for Free (Dashboard.tsx:288).
- `overall_score`: int 0–100, **math-from-sections** (server-computed; trustworthy).
- `grading_data` (jsonb) = the `linkedInGradeSchema` shape (`grade-linkedin/schema.ts:144–171`):
  - `rawScore` (== normalized total), `scoreJustification`, `nextBestAction {action, reason, expectedImpact}`,
  - `sectionBreakdown[11]` — each `{ name, applicable, maxScore, score, evidence, strengths[], weaknesses[], improvements[] }`. Section names are the fixed 11 (Experience, Recruiter discoverability, Headline, About, Skills, Career positioning, Completeness, Achievements, Projects, Education, Certifications — `schema.ts:45–57`).
  - `topFixes[]` (`{title,currentText,suggestedFix,whyItWorks,pointsGain,priority}`), `keyStrengths[]`.
  - Score bands: weak <50 / average 50–69 / strong 70–84 / exceptional 85–100 (`schema.ts:93–98`).

### `analysis_results` (Career Compass + Recruiting Lens — producers: Phase 6 / Phase 4)
- The dashboard currently selects **metadata only**: `id, analysis_type, created_at, primary_score, source_reference` (Dashboard.tsx:299) — **it does NOT fetch `raw_response`**. To read Career Compass/Recruiting Lens bodies (Elite enrichment, D-10) you must extend this select to include `raw_response` and filter by `analysis_type`.
- `analysis_type` values: `'career_compass'`, `'recruiting_lens'`, `'resume_analysis'`, `'linkedin_grading'`.
- **Career Compass** `raw_response` (jsonb) = `AnalysisResult` (`src/components/career-compass/types.ts`): `careerDNA` (string), `careerFields[]`, `roles[]`, `roadmap[]`, `roleRoadmaps[]`, `whatYouHave[]`, `skillGaps[]`, `resumeImprovements[]`, `roleReadinessBreakdown {overallScore,targetRole,strengths[],gaps[],skillAssessments[],readinessVerdict}`, `roleReadinessScore`, `surpriseFits[]`, `reusedLinkedinGrade`, `linkedinGradeDate`.
- **Recruiting Lens** `raw_response` (jsonb) = `RecruitingLensOutput` (`_shared/recruiting-lens-merger.ts:24+`): `overallMatch {score,label,summary}`, `subScores {experienceAlignment, skillAlignment, impactStrength, keywordAndLanguageMatch, credibilityAndSeniorityFit}` (each `{score,rationale}`), `recruiterVerdict`, `scoreRationale[]`, `topGaps[]`, `roadmap[]`, `resumeEdits[]`, `keywords {matched[],missing[]}`, `strategicAdvice {applyNow,summary,biggestScoreMover}`, optional `linkedinImprovements[]`.
- `primary_score`: int mirror of each feature's headline (usable without parsing `raw_response`).

### `applications` (Saved Jobs)
- Read via infinite query `status='saved'`: `id, role_applied, company_applied, created_at, location, posted, salary, url, industry` (Dashboard.tsx:265). Elite-only enrichment signal for the rubric (D-10).

## Dashboard Data Fetching (research question #2)

Existing TanStack Query keys in `Dashboard.tsx` — **reuse these; they are already cache-warm on the dashboard**:

| Query key | Source table | Columns | Reuse for new sections? |
|-----------|--------------|---------|-------------------------|
| `['currentUser']` | auth | user id | Yes (gate) |
| `['resumes', userId]` (infinite) | `resumes` | id, file_name, created_at, analyzed_at, overall_score, grading_data | **Yes** — resume signal |
| `['savedJobs', userId]` (infinite) | `applications` | role/company/location/salary/industry… | Yes — Elite enrichment |
| `['dashboardLinkedInGrades', userId]` | `linkedin_grades` | id, overall_score, grading_data, created_at, profile_url | **Yes** — LinkedIn signal + alignment |
| `['dashboardAnalysisHistory', userId]` | `analysis_results` | id, analysis_type, created_at, primary_score, source_reference | Metadata reuse; **add `raw_response` (+ maybe a dedicated key) for Elite Career Compass/Recruiting Lens bodies** |

**Recommendation:** For the Elite Career Compass/Recruiting Lens `raw_response` bodies, add a small dedicated query (e.g. `['dashboardIntelligenceSources', userId, tier]`) that fetches the latest `career_compass` + `recruiting_lens` rows **with `raw_response`**, `enabled: tier !== 'free'` — so Free users never pay for data they can't see (D-10) and the core Free path adds zero queries. The `latestResume`, `latestLinkedIn`, `savedJobs` derived values already exist (Dashboard.tsx:310–313) and can feed the module directly.

## Current Sections: what they render / dead-code map (research question #3)

| Section (title) | Function | Lines | Data deps | Disposition |
|-----------------|----------|-------|-----------|-------------|
| "Live Career Profile" | `ProfileIntelligence` | 849–894 | `profileSignals` memo (326–352) over `latestResume.grading_data` + `latestLinkedIn.grading_data` + `savedJobs` | **REPLACE** with Recruiter First Impression |
| "Progress and Achievements" (wrapper) | `ProgressAndAchievements` | 1174–1188 | renders `EliteScoreHistory` (elite) / `ScoreProgressChart` (free) + `AchievementBadges` | **DELETE** wrapper + render site (658) |
| "Activity Stream" | `CareerTimeline` | 1190–1239 | `timelineItems` memo (501–546) over resumes/linkedinGrades/savedJobs/analysisHistory | **REPLACE** with Profile Alignment |

**Dead-code sweep candidates after removal (verify with `npm run type-check` + usage grep — D-14):**
- `timelineItems` memo (501–546) and `TimelineItem` type (109–115) — only used by `CareerTimeline`. Removable.
- `profileSignals` memo (326–352) — only used by `ProfileIntelligence`. The new module supersedes it; removable once the new section is wired.
- `ProgressAndAchievements`'s children — **CAUTION, these are shared/protected surfaces, NOT dead code by default:**
  - `EliteScoreHistory` (`src/components/EliteScoreHistory.tsx`), `ScoreProgressChart` (`src/components/ScoreProgressChart.tsx`), `AchievementBadges` (`src/components/AchievementBadges.tsx`) — grep shows they are referenced by `Dashboard.tsx` and `Dashboard.test.tsx`. **Confirm each has no other consumer before deleting the component files.** If any is used only inside the deleted wrapper, it becomes deletable; if referenced elsewhere (e.g. a profile/history page), it must stay. DASH-02 requires Merits/History/readiness "not removed or degraded" — `AchievementBadges`/score-history are the highest-risk shared surfaces. Default to deleting only the wrapper + the now-unused imports, and delete the child component files ONLY after a clean cross-repo usage sweep.
- `analysisHistory` query (`['dashboardAnalysisHistory']`) — currently consumed only by `timelineItems`. If Profile Alignment/Recruiter First Impression don't reuse it, it becomes unused after `CareerTimeline` removal. Decide: repurpose it (extend with `raw_response`) or remove it.
- Icons imported solely for the removed sections (e.g. `CalendarDays`, `History`, `Layers3`, `Route` for ProfileIntelligence/timeline) — prune to keep lint clean.

**Protected data paths that must remain intact (DASH-02):** Merits (`useMerits`/`useTierAccess`), the History page (`/history`, `AnalysisHistory.tsx` reads `analysis_results` independently), readiness cards (`commandCards`, `careerReadiness`), Readiness Matrix (`CareerRadar`), Resume Vault, Saved Jobs. None of these depend on the two removed sections' memos.

## Tier detection + locked-teaser pattern (research question #4)

- **Tier source:** `useTierAccess()` returns `tier: 'free' | 'elite' | 'admin'` (Dashboard.tsx:175; hook at `src/hooks/useTierAccess.ts`). There is **no `'pro'`** at runtime — `TIER_LABELS` only maps free/elite (Dashboard.tsx:50), and pricing normalizes Pro→Elite behavior. This satisfies D-11 ("Pro = Elite") automatically: treat any non-free/non-admin as Elite depth. Admin should see Elite depth.
- **Locked-teaser template (D-09):** the existing language is:
  - `MiniMeter` with `muted` prop → greyed bar (Dashboard.tsx:1307), plus "Needs data"/"Coming Soon" labels in `CareerRadar` (920–924).
  - `Lock` icon (lucide) already imported and used in `NextBestActions` (Dashboard.tsx:829) with a `locked?: boolean` on the `NextAction` type (107).
  - Elite upsell banner pattern: the `tier !== 'elite'` primary-tinted note in `CareerRadar` (929–933) and the Elite banner (612–626).
  - Reuse these: Elite-only rows render as `Lock`-iconed, `muted` blurred rows with a short upgrade prompt linking to `/profile` (the existing upgrade destination, e.g. Dashboard.tsx:475).

## Test & Validation Setup (research question #5)

- **Vitest (unit):** config via `vitest` 4.1.9; tests colocate as `src/lib/**/*.test.ts` (e.g. `src/lib/merit-error-messages.test.ts`, `src/lib/fileHash.test.ts`) or `src/lib/__tests__/`. Pattern: `import { describe, it, expect } from 'vitest'` + direct function import. Pure-module tests need no React/mocks — ideal for the derivation module (D-16).
- **Component/contract tests:** `src/pages/Dashboard.test.tsx` shows the established mock harness — `vi.mock` for `react-router-dom`, `useMerits`, `useTierAccess`, `sonner`, `@/lib/supabaseClient` (chainable `.from().select().eq()...`), and heavy children stubbed. Reuse this harness for any component-level assertions and to keep the existing `?checkout=complete` tests green after refactor.
- **Playwright (E2E):** `e2e/*.spec.ts`, config `playwright.config.ts` (drives a local `vite build && preview` on :8080, authed via `.auth/user.json` storageState; AI stubbed server-side via `AI_TEST_MODE`). No dashboard spec exists yet — a new `e2e/dashboard-intelligence.spec.ts` asserting **section order/presence** (DASH-05) fits this harness. Assert on stable headings/roles, not AI wording (see `resume-analysis.spec.ts:43–48`).
- **Baseline gate:** `npm run verify:baseline` = `test` (vitest) + `test:edge` (deno) + `test:e2e` (Playwright); it is a HARD precondition in `deploy.ps1`. New unit + Playwright tests must fold into this gate (VER-01 pattern). This is a **frontend-only** phase — no deno/edge tests expected, but do not break the existing 457 vitest / 698 deno / 5+1skip Playwright baseline.

## Common Pitfalls

### Pitfall 1: Legacy / null stored rows from before Phases 4–6
**What goes wrong:** Older `grading_data`/`raw_response` rows predate the current schemas (e.g. LinkedIn 4-section v3 grades before the Phase-4 11-section rebuild; resume rows without `executiveSummary`).
**Why:** Producers were rebuilt in this milestone; historical rows keep their old shape. The LinkedIn frontend already has an `isV3Grade`/version gate for exactly this (noted in 04-CONTEXT).
**How to avoid:** Feature-detect fields, never assume presence. Use `pickStrings` key-precedence (already handles multiple historical key names) and safe accessors. Missing expected fields → drop that signal + cap confidence (D-02/D-08), never crash.
**Warning signs:** `sectionBreakdown.length !== 11`, absent `overallScore`, `raw_response` shaped as an older schema.

### Pitfall 2: Free vs Elite `grading_data` asymmetry
**What goes wrong:** Assuming `industryGuess`/`suggestedTargetRoles`/`recruiterFirstImpressions` exist for all resumes — they are **stripped from Free** (`resume-prompts.ts:62`).
**How to avoid:** Free-tier derivation must rely only on the Free-present fields (`overallScore`, `strengths`, `priorityImprovements`, `executiveSummary`, `criterionFeedback`) + LinkedIn (D-10). Elite depth may read the richer fields.

### Pitfall 3: Timezone / staleness dates (D-06)
**What goes wrong:** `created_at` is a UTC ISO string; naive `new Date(...).toLocaleDateString()` shifts the day near midnight and can render "May 12" as "May 11" for some users.
**How to avoid:** Use the existing `formatDate` (Dashboard.tsx:135) for consistency, and base staleness on date-only comparison. No hard age cutoff (D-06) — only annotate. Cross-source desync = compare the two `created_at`s (resume vs LinkedIn) and note the older one.

### Pitfall 4: Assuming a `'pro'` tier exists
**What goes wrong:** Branching on `tier === 'pro'` — it never matches at runtime.
**How to avoid:** `tier === 'free'` → Free depth; everything else (`elite`, `admin`) → Elite depth (satisfies D-11).

### Pitfall 5: Non-determinism in the rubric
**What goes wrong:** Using `Date.now()`, array order from network, or unsorted object iteration in the response-state computation → flaky VER tests + DASH-04 "deterministic where appropriate" violation.
**How to avoid:** Pure function of normalized inputs; stable sort any arrays; named constant weights/cutoffs. Same inputs → same state, asserted by unit tests.

### Pitfall 6: One bad source blocking the dashboard (DASH-04/D-08)
**What goes wrong:** A malformed `raw_response` JSON throws during derivation and blanks the whole dashboard.
**How to avoid:** Wrap each source read in try/safe-accessor; a failed source is dropped and caps confidence. The module must never throw to the render tree; return an empty/degraded model instead.

## State of the Art

| Old (current dashboard) | New (Phase 7) | Why |
|-------------------------|---------------|-----|
| `ProfileIntelligence` free-form strengths/weaknesses/roles/industries with sentinel-string fallbacks | Recruiter First Impression: positioning + ≤2/≤3 standouts + concerns + 1 of 5 deterministic states + source tags + confidence cap | DASH-01; no placeholder-as-personalized |
| `CareerTimeline` event log ("Activity Stream") | Profile Alignment: overall resume↔LinkedIn score + 4 categories + ≤3 actions + mandatory no-score empty states | DASH-03 |
| `ProgressAndAchievements` (score chart + badges) | Deleted | DASH-02 |
| Inline sections in one 1,316-line file | Extracted `src/components/dashboard/` + `src/lib/dashboard-intelligence/` | D-15 testability |
| Resume Vault + Saved Jobs in a `<Tabs>` | Sequential sections #7/#8 (order per DASH-05) | DASH-05 — **but see Open Question 2** |

## Validation Architecture

(Nyquist validation enabled — mirrors the Phase 6 model per D-16.)

**Three layers, all folding into `verify:baseline` (VER-01):**

1. **Unit (vitest, pure module) — the primary safety net.**
   - `deriveRecruiterFirstImpression`: for each data state (no-data / resume-only / LinkedIn-only / resume+LinkedIn / partial / failed-prior) × tier (free/elite): assert the response state is one of the 5, is the **conservative** choice under missing data (D-02/D-03), standout/concern counts respect Free ≤2+1 / Elite ≤3+≤2 caps (DASH-01), every insight carries a source tag (D-05), `weakestSignal` drives the CTA target (D-04), and determinism (same input → same output, run twice).
   - `deriveProfileAlignment`: overall score present only when BOTH profiles exist; **mandatory no-score empty states** with the **verbatim locked copy** (resume-only → "Add your LinkedIn profile to compare your professional positioning."; LinkedIn-only → "Upload your resume to compare your experience, skills, and evidence." — DASH-03); four categories; ≤2 (Free) / ≤3 (Elite) actions; evidence-backed mismatch examples.
   - Staleness: date-only note formatting + desync detection (D-06), timezone-safe (Pitfall 3).
   - Legacy/malformed input: feed a pre-Phase-4 v3 LinkedIn grade + a truncated `raw_response`; assert graceful degrade + confidence cap, no throw (Pitfall 1/6).
   - Location: `src/lib/dashboard-intelligence/*.test.ts`.

2. **Component/E2E (Playwright) — order + presence + entitlement.**
   - New `e2e/dashboard-intelligence.spec.ts`: assert the DASH-05 section order by stable headings ("Recruiter First Impression", "Profile Alignment", "Every Version Ranked", "Saved Jobs", etc.), assert Progress & Achievements is **absent**, assert protected sections still present. Authed via existing storageState; AI stubbed (no on-load AI to stub, but data is seeded by the TEST project).
   - Keep `src/pages/Dashboard.test.tsx` green (the `?checkout=complete` contract) after the refactor — update the section stubs/mocks as sections move.
   - Free vs Elite depth: a component test (Dashboard.test harness) toggling `useTierAccess` mock to assert locked-teaser rows appear for Free and real rows for Elite.

3. **Operator smoke (`autonomous: false`, per D-16 + memory "honor operator checkpoints").**
   - Manual visual pass across Free / Elite / no-data / resume-only / LinkedIn-only / resume+LinkedIn / partial / failed-prior, in light + dark, on desktop/tablet/mobile (DASH-06). Confirms polish, source-badge legibility, locked-teaser blur, staleness-note wording, and that the un-tab/reorder (if done) reads coherently. Never auto-approved.

**Gate:** all new unit + Playwright tests enter `verify:baseline`; a green run only proves pre-existing behavior, so the new guards are mandatory (VER-01). Frontend-only phase — expect no new deno/edge tests.

## Open Questions

1. **"Career Launch Path" (DASH-05 section #6) does not exist in the codebase.** A full grep of `src/` finds "Career Launch Path" only in planning docs; the only "Launch" in `Dashboard.tsx` is the `'Launch ready'` trend label (line 370). There is no Career Launch Path section/component today.
   - What we know: DASH-05 lists it at position 6 and calls it a protected area that must "remain functionally and visually unchanged."
   - What's unclear: whether it (a) was never built (roadmap aspirational), (b) maps to an existing section under a different display name (e.g. the Career Compass/roadmap surface, `RoadmapTab.tsx`, which lives on the Career Compass page, not the dashboard), or (c) is expected to be added here (which would be net-new UI, arguably out of scope).
   - **Recommendation:** Operator decision required BEFORE finalizing section order (07-03). Most likely resolution: treat DASH-05's list as the ordering of sections **that exist**, and confirm with the operator that "Career Launch Path" is either an alias for an existing block or simply not present (so the order becomes 1-5, [6 omitted], 7, 8, 9). Do not build a new section to satisfy the name without explicit approval.

2. **Saved Jobs + "Every Version Ranked" are inside a shared `<Tabs>` today; DASH-05 wants them as sequential standalone sections #7/#8.** (Dashboard.tsx:661–689.)
   - What we know: DASH-05 mandates the exact sequential order AND lists both as protected areas that stay "functionally and visually unchanged."
   - What's unclear: un-tabbing them into two stacked sections is itself a visual change to two protected surfaces — a direct tension between the two clauses.
   - **Recommendation:** Operator decision. Options: (a) keep the Tabs and treat "sequential order" as satisfied by DOM/tab order, or (b) un-tab into sequential sections (matches the literal order but changes the protected layout). Flag in 07-03; default to the interpretation the operator confirms during the DASH-05 order plan.

3. **Extraction of `SectionHeader`/`EmptyState`/`MiniMeter` out of `Dashboard.tsx`.** Recommended (Pattern 3a) but touches the protected file. Confirm a byte-identical move is acceptable (it must not alter the protected sections' rendering). Low risk, but note it for the non-regression check.

4. **`AchievementBadges` / `ScoreProgressChart` / `EliteScoreHistory` deletion scope.** These are children of the deleted `ProgressAndAchievements`. Confirm via cross-repo usage sweep whether any is consumed elsewhere before deleting the component files (D-14 vs DASH-02 "don't degrade readiness/Merits/History"). Default: delete the wrapper + unused imports; delete child files only if provably unused.

## Sources

### Primary (HIGH confidence — read directly)
- `src/pages/Dashboard.tsx` (full) — current sections, queries, primitives, tier usage, memos to remove.
- `src/hooks/useTierAccess.ts` — tier values (free/elite/admin, no pro).
- `supabase/functions/grade-linkedin/schema.ts` + `validation.ts` — LinkedIn `grading_data` shape, 11 sections, bands, math-from-sections.
- `supabase/functions/_shared/resume-prompts.ts` (schema block + Free-strip rule) — resume `grading_data` fields, Free/Elite asymmetry.
- `supabase/functions/_shared/recruiting-lens-merger.ts` — `RecruitingLensOutput` shape.
- `src/components/career-compass/types.ts` — Career Compass `AnalysisResult`/`raw_response` shape.
- `src/pages/Dashboard.test.tsx`, `src/lib/merit-error-messages.test.ts` — vitest harness patterns.
- `playwright.config.ts`, `e2e/resume-analysis.spec.ts` — E2E harness/pattern.
- `.planning/phases/07-CONTEXT.md` + `.planning/REQUIREMENTS.md` (DASH-01..06) + `.planning/ROADMAP.md` (Phase 7) — locked scope/copy.
- `.planning/phases/04/05/06-CONTEXT.md` — producer decisions confirming where each feature persists data.

### Secondary
- Grep sweeps for "Career Launch Path" (planning-only) and `EliteScoreHistory|ScoreProgressChart|AchievementBadges` (usage map) — basis for Open Questions 1 and 4.

## Metadata

**Confidence breakdown:**
- Stored data shapes / input contract: **HIGH** — read from producer schemas + the live dashboard queries.
- Dashboard queries / reuse plan: **HIGH** — read directly from Dashboard.tsx.
- Dead-code map: **HIGH** for the two replaced sections' memos; **MEDIUM** for the three shared child components (needs the cross-repo usage sweep in Open Question 4).
- Tier + locked pattern: **HIGH**.
- Test/validation setup: **HIGH**.
- Section-order execution: **MEDIUM** — blocked on Open Questions 1 & 2 (Career Launch Path existence; Tabs vs sequential).

**Research date:** 2026-07-08
**Valid until:** ~2026-08-07 for the stored-data contract (stable post-Phase-6); re-check if any producer schema changes. Open Questions 1 & 2 should be resolved with the operator before 07-03 planning.
