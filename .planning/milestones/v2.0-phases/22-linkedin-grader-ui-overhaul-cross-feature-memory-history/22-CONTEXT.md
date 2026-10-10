# Phase 22: LinkedIn Grader UI Overhaul + Cross-Feature Memory/History - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Three independent fixes shipped under one phase:

1. **LinkedIn Grader results UI (free tier)** — visual/interaction parity with `Results.tsx` / `CareerCompass.tsx` / `RecruitingLens.tsx`: container width/padding match, 4 locked ready-to-paste skeletons beneath the single unlocked top-priority fix, Profile Completeness promoted to position #1 in the Section Breakdown grid.
2. **Career Compass cross-feature memory** — `analyze-career` hydrates from the latest `linkedin_grades` row alongside the latest resume analysis on the main (fresh) request path, no token-wasting re-scrape when both exist; graceful fallback when only one exists.
3. **History page (`AnalysisHistory.tsx`)** — audit-and-fix so a signed-in user sees every analysis they've actually run across all 5 features (Resume, LinkedIn Grader, Career Compass, Recruiting Lens, Interview Prep). Clicking an entry opens the specific past analysis.

Scope is strictly the 7 numbered success criteria from ROADMAP.md §Phase 22. No new AI features, no prompt overhauls beyond what's needed to keep Pro sections rendering, no schema migrations unless diagnosis proves missing columns are the root cause.

</domain>

<decisions>
## Implementation Decisions

### LinkedIn Grader — Locked UI coverage (Defect #2)

- **D-01:** Render exactly **5 ready-to-paste improvements** on free tier: **1 real top-priority fix** (the existing unlocked card) + **4 fake locked skeletons** underneath it. The 4 locked skeletons never trigger an Anthropic call — they are hardcoded placeholder cards wrapped in `BlurredLockCard`.
- **D-02:** Locked skeletons use **section-labeled generic teasers** matching the Pro card layout exactly (Current → Suggested grid, +X pts badge, "Why this works" line). Suggested titles: "Experience Improvement", "Skills Improvement", "About Section Refinement", "Headline Refinement #2" (planner finalizes copy). Placeholder Current/Suggested text is generic/teaser, not Claude-generated.
- **D-03:** Placeholder teaser strings live as a **hardcoded constant array at the top of `src/pages/LinkedInGrader.tsx`** — same pattern Phase 15.2 used inline at lines 864-866. No new shared file.
- **D-04:** Locked cards are **clickable → `/pricing`** (consistent with existing `BlurredLockCard` usage in Phase 15.2 D-11/D-12). The existing "Upgrade to Pro" button at the bottom stays as the primary CTA; clicking anywhere on a blurred card also routes to `/pricing`.
- **D-05:** The Pro-only supporting sections (`profileInsights`, `keyStrengths`, `nextBestAction`) were **NOT selected for locked skeletons** — they should render as real content if the grade-linkedin prompt returns them on free tier. **⚠ Researcher must verify** whether the current free-tier prompt actually returns these fields. If not, planner must decide: update the prompt to return them for free OR wrap them in `BlurredLockCard` skeletons. Operator brief explicitly says "render all sections a Pro user would see" — interpret as "must appear on the page", locked or unlocked.

### LinkedIn Grader — Layout parity (Defect #1)

- **D-06:** Root cause of "overly vertical" laptop view is **top padding mismatch**: `LinkedInGrader.tsx:386` uses `pt-24`; `Results.tsx:706` uses `pt-6`. Change LinkedInGrader to `pt-6` (keep `pb-12 max-w-5xl`). Do NOT change `max-w-5xl`.
- **D-07:** Responsive + theme parity is **verified live in the browser** (dev server). Executor runs `npm run dev` and compares LinkedInGrader (free tier + Pro) side-by-side against `Results.tsx` at mobile 375px / tablet 768px / laptop 1280px in both light and dark themes. This is mandatory per CLAUDE.md guidance for UI changes.

### LinkedIn Grader — Profile Completeness ordering (Defect #3)

- **D-08:** Reorder the Section Breakdown grid **at render time** inside `LinkedInGrader.tsx:829`: map over `[profileCompletenessSection, ...otherSections]` so Profile Completeness is the first child in DOM order. No backend/prompt change — keeps cached/older records rendering correctly and preserves raw ordering for the compare modal.
- **D-09:** If multiple sections match `name?.toLowerCase().includes('profile completeness')` (shouldn't, but defensive), take the first match; if none match, render as-is (no-op fallback).

### Cross-page polish (operator extension — beyond original 3 defects)

- **D-10:** Apply the "Scan New Profile" header-bar pattern (title + rescan button row above the main result card) to `Results.tsx`, `CareerCompass.tsx`, and `RecruitingLens.tsx` in the same fashion as LinkedInGrader. This is a scope extension; planner should size it as its own plan file so it can be deferred/descoped if needed without blocking the 3 core defects.

### Career Compass cross-feature memory

- **D-11:** **Backend auto-fetch is the canonical path**: extend `analyze-career`'s MAIN (fresh) request path to auto-fetch the latest `linkedin_grades` row for the user (mirroring the existing auto-fetch of latest resume). The existing `existingAnalysis` branch at `supabase/functions/analyze-career/index.ts:525` is the reference implementation — lift its `linkedin_grades` lookup into the main path.
- **D-12:** Frontend does NOT pass a `priorLinkedinGrading` field. `CareerCompass.tsx` remains unaware of `linkedin_grades` — single source of truth is server-side.
- **D-13:** **No staleness check** — reuse whatever latest `linkedin_grades` row exists, regardless of age. Matches the existing "always latest" resume auto-fetch behavior. User can re-run LinkedIn Grader anytime to refresh.
- **D-14:** **Show a small badge** on Career Compass results: "Used your LinkedIn analysis from {date}" (date from `linkedin_grades.created_at`). Informational pill near the results header; no interaction. Render only when the server reused a prior LinkedIn grade.
- **D-15:** **Response contract must signal reuse**: `analyze-career` response body includes a new boolean `reusedLinkedinGrade` and `linkedinGradeDate` (ISO string) so the frontend can render D-14 without a second query. Additive field; does not break existing callers.
- **D-16:** **Graceful fallback when only one prior analysis exists** — when resume exists but no `linkedin_grades` row: the frontend **prompts the user to choose** ("We have your resume analysis but no LinkedIn analysis yet — add LinkedIn now or continue without?"). When LinkedIn exists but no resume analysis: current behavior (require resume input) is preserved. Either path must still produce a valid Career Compass analysis per success criteria #5.
- **D-17:** **Token conservation is mandatory** — when both prior analyses exist, the PDF/profile re-parse step MUST be skipped. Verify via request trace / function log that no `scrapeLinkedInProfile` or Claude PDF parse is invoked on the reused path.

### History page audit + fix

- **D-18:** **Diagnose before redesigning.** Researcher/executor must answer three questions *before* changing the data source:
  1. Is `usage_tracking` being written on LinkedIn Grader / Career Compass / Recruiting Lens / Interview Prep completions? (Likely the primary defect — LinkedIn Grader may skip the `usage_tracking` INSERT.)
  2. Is the RLS policy or client-side filter in `AnalysisHistory.tsx` (query at line 169-174) hiding rows from free-tier users?
  3. Do all 5 feature functions use consistent `action_type` values matching `typeConfig` keys in `AnalysisHistory.tsx:34-83`?
- **D-19:** **Minimal fix first.** If missing INSERTs are the root cause, fix the INSERTs in the offending edge functions. Do NOT change the frontend data source. Keep `usage_tracking` as the timeline index.
- **D-20:** **Enrich for View routing.** To support D-21 (open specific past analysis), add a timestamp-proximity lookup (the ±5min trick already at `AnalysisHistory.tsx:195-205` for resumes) for the other 4 feature tables. Each row type gets a matching feature-table ID resolved at render time. If per-feature IDs cannot be reliably matched, fall back to feature-page route (D-22 mix option).
- **D-21:** **Clicking a history entry opens the specific past analysis:**
  - `resume_analysis` → `/results/{resume_id}` (already works).
  - `linkedin_grading` → `/linkedin-grader?id={linkedin_grade_id}`.
  - `career_compass` → `/career-compass?id={analysis_id}`.
  - `recruiting_lens` → `/recruiting-lens?id={run_id}`.
  - `interview_prep` → `/interview-prep?id={quiz_id}`.
- **D-22:** **All 5 feature pages must hydrate from `?id=` URL param.** Researcher verifies current support; planner scopes per-page work for whichever pages don't yet support specific-ID loading. "Just ensure they all work as intended" — user is explicit that every feature page must honor the param.
- **D-23:** **Empty state unchanged.** Keep the existing "No activity yet" empty state (`AnalysisHistory.tsx:257-265`). Don't regress it.

### Cross-cutting

- **D-24:** **No regression in Pro/Elite views** is non-negotiable (success criterion #7). Any change gated on `subscriptionTier === 'free'` must leave the Pro/Elite rendering paths byte-identical. Executor runs both tiers in the browser during verification.
- **D-25:** **No migrations** unless D-18 diagnosis proves a schema gap. Default assumption: all required columns exist.

### Claude's Discretion

- Exact copy for the 4 locked ready-to-paste skeleton cards (titles, placeholder Current/Suggested text, +X pts numbers) — planner picks values that feel plausible without being misleading.
- Exact copy and styling of the "Used your LinkedIn analysis from {date}" badge (D-14) — follow existing badge/pill patterns on the Career Compass results header.
- Exact ordering of the 4 locked skeletons (which section hint comes first).
- Tailwind class choice for any minor spacing tweaks during browser verification (D-07).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase history (lock primitive + gating lineage)
- `.planning/phases/15.2-resume-analysis-priority-improvements-fix-and-sitewide-locke/15.2-CONTEXT.md` — BlurredLockCard sitewide unification + locked priority-fix primitive (the pattern this phase extends)
- `.planning/phases/16-linkedin-grader-gating/16-CONTEXT.md` — original LinkedIn Grader gating decisions
- `.planning/phases/17-career-compass-gating/17-CONTEXT.md` — original Career Compass gating decisions
- `.planning/phases/17.1-career-compass-results-ui-design-specification/17.1-CONTEXT.md` — Career Compass results UI design

### Roadmap and requirements
- `.planning/ROADMAP.md` §Phase 22 (lines 358-381) — phase scope, success criteria 1-7
- `.planning/REQUIREMENTS.md` — master REQ-ID table (check for any Phase 22 REQ mappings)

### Source files the planner/executor must read
- `src/pages/LinkedInGrader.tsx` — full results page; locked section breakdown already in place (D-12 from Phase 15.2), topFixes render at lines 948-1026
- `src/pages/Results.tsx` (lines 566-706) — reference container pattern (`container mx-auto px-4 pt-6 pb-12 max-w-5xl`)
- `src/pages/CareerCompass.tsx` (lines 542-572) — reference container + Career Compass result render path
- `src/pages/RecruitingLens.tsx` (lines 407-465) — reference container pattern
- `src/pages/AnalysisHistory.tsx` — current History page; usage_tracking query, typeConfig map, resume ID proximity lookup at lines 195-205
- `src/components/BlurredLockCard.tsx` — lock primitive
- `supabase/functions/analyze-career/index.ts` lines 480-610 — existingAnalysis branch that already reads `linkedin_grades` (line 525) — reference for D-11 main-path hydration
- `supabase/functions/analyze-career/index.ts` lines 700-960 — MAIN request path that currently scrapes/parses LinkedIn fresh (the code that needs D-11/D-17 rework)

### External references
- None. This phase is internal UI + data-flow work only.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`BlurredLockCard` (`src/components/BlurredLockCard.tsx`)** — wraps any Pro-only content with the site-standard blurred lock + click-through to /pricing. Already used in `LinkedInGrader.tsx:844` for locked Section Breakdown cards. Extend usage to topFixes #2-5 and (if D-05 requires) to the supporting Pro sections.
- **`typeConfig` map in `AnalysisHistory.tsx:34-83`** — already covers all 8 action types including all 5 features in scope. No type additions needed; fix should be on the data side.
- **Timestamp-proximity matcher (`AnalysisHistory.tsx:195-205`)** — the ±5min trick used to bind `resume_analysis` rows to `resumes.id`. Reuse pattern for D-20 to bind other feature rows to their source tables.
- **`existingAnalysis` branch in `analyze-career/index.ts` (line 480-610)** — already reads `linkedin_grades` via `Promise.all`. Lift this pattern into the main request path for D-11.

### Established Patterns
- **Container width for results pages:** `container mx-auto px-4 pt-6 pb-12 max-w-5xl`. LinkedInGrader diverges with `pt-24` (D-06 fix).
- **Free-tier locked cards:** Conditional render via `isFreeUser = subscriptionTier === 'free'` + `BlurredLockCard` wrap + generic teaser paragraphs (`LinkedInGrader.tsx:836-872` is the template).
- **Upgrade CTA divider:** `LinkedInGrader.tsx:929-945` — visual divider + "Upgrade to Pro" button below locked cards. Reuse for the locked topFixes block.
- **Server-side data auto-fetch:** `analyze-career` already auto-detects latest resume on main path. D-11 extends the same pattern to LinkedIn.
- **Framer Motion reveal on result cards:** `initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}` with staggered `delay: 0.2 + i * 0.08`. Preserve for locked cards so they animate in with the rest.

### Integration Points
- **LinkedIn Grader → BlurredLockCard:** new usage point at the Ready-to-Paste Improvements section (`LinkedInGrader.tsx:948-1026`).
- **Career Compass frontend → analyze-career response:** new `reusedLinkedinGrade` / `linkedinGradeDate` fields (D-15) rendered as a badge near the results header.
- **All feature pages → URL search params:** each page's initial-load hook must read `?id=` and bypass input state when present (D-22).
- **Edge functions → usage_tracking INSERTs:** LinkedIn Grader / Career Compass / Recruiting Lens / Interview Prep completion handlers must each write a row with the correct `action_type` matching `typeConfig` keys.

</code_context>

<specifics>
## Specific Ideas

- **Exact wording from operator:** "Make sure that only one fix is generated, the top-priority fix. Display 4 fake locked ready-to-paste improvements underneath it. They currently do not show at all." → the 4 locked cards must render unconditionally for free tier (no gating on Pro data presence).
- **Exact wording from operator:** "Put profile completeness at the number 1 spot of the section-by-section breakdown area" → reinforces D-08.
- **Exact wording from operator:** "The Scan New Profile is useful, apply it to the other feature pages in the same fashion as LinkedIn Grader" → D-10 scope extension; size as a separate plan file so it can be descoped without blocking the 3 core defects.
- **Exact wording from operator:** "Just ensure they all work as intended" (re: `?id=` hydration on all 4 non-resume feature pages) → D-22 applies to ALL 4, no exclusions.

</specifics>

<deferred>
## Deferred Ideas

- History page empty-state redesign — scope allows current empty state to remain; redesign is a future UI polish phase.
- Staleness cap on reused LinkedIn analyses (30-day / 7-day options) — explicitly not adopted; revisit if user feedback shows stale-data issues.
- Lorem-only placeholder text for locked fixes (rejected in favor of section-labeled teasers).
- Moving Scan button to a floating corner position on RecruitingLens — D-10 specifies "same fashion as LinkedIn Grader" (header-bar row), not a floating variant.
- Schema migrations to unify analysis tables under a single view — defer unless D-18 diagnosis proves it's the only viable fix.

</deferred>

---

*Phase: 22-linkedin-grader-ui-overhaul-cross-feature-memory-history*
*Context gathered: 2026-04-19*
