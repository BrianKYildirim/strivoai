# Phase 37: Feature Output Parity, UX & Cache - Resume + LinkedIn + Career Compass + Recruiting Lens - Context

**Gathered:** 2026-05-22T13:23:17-07:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 37 ships per-feature output parity, UX fixes, and v3.0 cache integration across the four non-Interview-Prep AI features: Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens.

This is a brownfield reliability and parity phase, not a feature-expansion phase. It must preserve existing architecture while fixing paid-user broken output, removing obsolete sections, wiring exact-input cache hits after correctness is proven, and making Recruiting Lens persistence/deep-link behavior reliable.

The roadmap explicitly consolidated former Phases 37-40 into this single phase for release speed. Planning should decompose it into four feature waves - Resume, LinkedIn, Career Compass, Recruiting Lens - while keeping each feature's acceptance bar intact.

</domain>

<decisions>
## Implementation Decisions

### Career Compass partial-result UX

- **D-01:** Old or partial cached/persisted Career Compass analyses must render with both a top-level warning and per-tab fallback cards for affected sections. The global warning explains the report is partial; the tab-level fallback prevents blank tabs from looking broken.
- **D-02:** Fallback cards use a "Re-run for full report" recovery path. The copy should be specific enough for users to understand the analysis is incomplete and repairable.
- **D-03:** The re-run CTA sends users back to the Career Compass form with available inputs prefilled, requiring review before running. Do not immediately spend merits or call AI from the fallback card.
- **D-04:** Pro and Elite Career Compass validation is strict after the fix: all six core sections are required before the paid result is considered successful - Best-Fit Roles, Surprise Fits, Fields, Roles, Readiness, and Roadmap. Missing paid sections should fail validation rather than be normalized as acceptable partial output.

### Recruiting Lens saved-work surface

- **D-05:** Past Recruiting Lens analyses / Saved Jobs tiles appear below the new-analysis form on `/recruiting-lens`. The primary page flow remains "analyze a job," with saved work available after the form rather than competing above it.
- **D-06:** Each saved tile should show company + role plus status details, including score, date, and relevant context/status metadata where it remains readable. The tile should stay scannable; do not turn it into a full report preview.
- **D-07:** Cached Recruiting Lens hits update/refresh the existing saved tile timestamp/details instead of creating duplicate tiles for the same company/role/JD cache key. Activity History still records the cache-hit interaction per cache/history requirements.
- **D-08:** Clicking a saved tile hydrates the existing deep-link route, `/recruiting-lens?id=<run_id>`, and shows the cached result view in place. No separate read-only route is needed.

### Recruiting Lens tutorial timing

- **D-09:** The tutorial appears before the first analysis attempt, triggered when the user starts the JD analysis flow rather than immediately on page load.
- **D-10:** Tutorial tone is an operational walkthrough: concise, work-focused steps covering company, role, JD, resume/LinkedIn context, and analyze. Avoid a marketing-style or overly expressive coaching modal.
- **D-11:** Tutorial dismissal persists via localStorage. A manual "View tutorial" affordance remains available after dismissal.
- **D-12:** The tutorial is skippable. It should be shown before the first submission opportunity, but it must not hard-gate first submission if the user dismisses or skips it.

### Feature-wave sequencing

- **D-13:** Phase 37 planning optimizes for business-critical bugs first, especially broken paid output and persistence. Do not prioritize cache parity ahead of known incorrect or incomplete outputs.
- **D-14:** Decompose the phase into four feature waves: Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens. This follows the roadmap note that the four areas are independent and parallelizable.
- **D-15:** Within each feature wave, add cache after output correctness is proven. This prevents broken or partial results from being cached and reused.
- **D-16:** Every feature wave needs both code tests and one manual QA path before it is considered done. Cache-sensitive and user-facing behavior should not rely on automated source assertions alone.

### Carry-forward decisions

- **D-17:** Carry forward Phase 35 selector behavior: prior selectors are always-visible dropdowns when priors exist, default to most-recent, repopulate form input for this submission only, and do not persist a per-feature last-used preference.
- **D-18:** Carry forward Phase 35 LinkedIn source precedence: onboarding PDF and prior LinkedIn grades are peers; the default source is most-recent by timestamp.
- **D-19:** Carry forward Phase 36 history persistence: Recruiting Lens Pro and Elite successful runs write `analysis_results`; usage rows should carry `analysis_id`; async Recruiting Lens fallback is serviced by a worker rather than left orphaned.
- **D-20:** Carry forward Phase 29 cache substrate: use the existing `analysis_cache` table, cache fingerprint helper, and `withMerits` precheck-cache contract. Phase 37 wires feature-specific keys and writes; it does not redesign cache infrastructure.

### Claude's Discretion

- Exact component names and file placement for Career Compass fallback cards and Recruiting Lens saved tiles are left to the planner, as long as they follow existing component structure and shadcn/Tailwind patterns.
- Exact copy for warnings, fallback cards, tile metadata labels, and tutorial text is left to the planner. Keep wording specific and operationally useful.
- Exact test layout is left to the planner. Minimum bar: targeted code tests plus one manual QA path per feature wave.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap

- `.planning/ROADMAP.md` - Phase 37 scope, consolidation note, dependencies, success criteria, and plan decomposition guidance.
- `.planning/REQUIREMENTS.md` - RES-01..04, LIG-01..09, CC-01..13, RCL-01..07, CACHE-04..07, TEST-06 full requirement text.
- `.planning/PROJECT.md` - v3.0 milestone goals and target feature bullets for Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens.
- `.planning/STATE.md` - current v3.0 execution state, consolidation history, and carried-forward milestone context.

### Carry-forward context

- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` - cache substrate decisions, `analysis_cache`, cache-hit semantics, `withMerits` precheck-cache contract, and cache-write timing.
- `.planning/phases/35-cross-feature-input-context-selectors-linkedin-auto-pull/35-CONTEXT.md` - prior selector behavior, LinkedIn source precedence, LinkedIn Grader auto-pull/replacement behavior, and cross-feature empty-state decisions.
- `.planning/phases/36-history-persistence-parity-audit-repair/36-CONTEXT.md` - history persistence parity, `usage_tracking.analysis_id`, Recruiting Lens Pro persistence, and async worker decisions.
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-CONTEXT.md` - production Interview Prep gating context; relevant only to avoid dragging IPC back into Phase 37 scope.

### Codebase maps

- `.planning/codebase/ARCHITECTURE.md` - per-feature analyze entry points, persistence paths, cache gaps, history read paths, and known v3.0 bugs.
- `.planning/codebase/STRUCTURE.md` - frontend route map, output sections, selector placement candidates, and Recruiting Lens form structure.
- `.planning/codebase/INTEGRATIONS.md` - merit gateway, Stripe/merit context, and cache/withMerits integration concerns.

### Primary implementation touchpoints

- `src/pages/Results.tsx` - Resume Analysis "Priority Actions" removal and old `priorityActions` defensive rendering.
- `supabase/functions/analyze-resume/index.ts` - Resume prompt/output cleanup and CACHE-04 integration.
- `src/pages/LinkedInGrader.tsx` - LinkedIn PDF auto-pull state, "What's Working For You" removal, Ready-to-Paste gating, and cache-hit display.
- `supabase/functions/grade-linkedin/index.ts` - LinkedIn prompt output trim, prior-grade-aware cache key, and CACHE-05 integration.
- `src/pages/CareerCompass.tsx` - partial-result warning/fallback UX, form-prefill re-run path, and strict paid-output rendering.
- `src/components/career-compass/BestFitRoles.tsx` - Career Compass section fallback behavior.
- `src/components/career-compass/SurpriseFits.tsx` - Free 2+2 skeleton parity and missing-data fallback behavior.
- `src/components/career-compass/FieldsTab.tsx` - missing-data fallback behavior.
- `src/components/career-compass/RolesTab.tsx` - missing-data fallback behavior.
- `src/components/career-compass/ReadinessTab.tsx` - missing-data fallback behavior.
- `src/components/career-compass/RoadmapTab.tsx` - Free fake roadmap skeleton and missing-data fallback behavior.
- `supabase/functions/analyze-career/index.ts` - Career Compass Pro/Elite schema diagnosis, strict six-section validation, Free roadmap omission, and CACHE-06 integration.
- `src/pages/RecruitingLens.tsx` - company/role/JD form requirements, tutorial trigger, saved-tile surface below form, and `/recruiting-lens?id=<run_id>` hydration.
- `supabase/functions/recruiting-lens/index.ts` - company/role validation, `saved_jobs` persistence, cache-hit saved-tile refresh, and CACHE-07 integration.
- `supabase/functions/process-recruiting-lens-job/index.ts` - async fallback worker extension for `saved_jobs` and cache/history parity if present after Phase 36.
- `supabase/functions/_shared/merit-gateway.ts` - `withMerits` precheck-cache contract and merit deduction/refund boundary.
- `supabase/functions/_shared/cache-fingerprint.ts` - deterministic feature cache keys.
- `supabase/functions/_shared/usage-checker.ts` - `recordUsageWithAnalysis` / post-success usage history linkage.
- `supabase/migrations/20260512000000_analysis_cache_table.sql` - `analysis_cache` schema and RLS.
- `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql` - explicit usage-to-analysis linkage.
- `src/components/PriorAnalysisSelector.tsx` - reusable resume prior selector from Phase 35.
- `src/components/PriorLinkedInSelector.tsx` - reusable LinkedIn prior selector from Phase 35.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `PriorAnalysisSelector` and `PriorLinkedInSelector` already exist and are mounted in current source scans. Phase 37 should consume and preserve their Phase 35 semantics rather than re-inventing selector behavior.
- `BlurredLockCard` is the canonical locked-section primitive for Career Compass and LinkedIn locked content. Use it where a locked/skeleton teaser is appropriate; do not revive deprecated `LockedSection` or `ProFeatureBlur`.
- `withMerits` already supports an optional precheck-cache contract. Feature cache integration should plug into that path so cache hits avoid Anthropic calls and merit deduction.
- `recordUsageWithAnalysis` exists in `_shared/usage-checker.ts` and should be used for history rows linked to persisted result IDs.
- `analysis_cache` infrastructure exists from Phase 29. Feature work should compute keys, read before deduction, and write after successful persistence.
- `saved_jobs` table already exists and is read by dashboard/jobs surfaces. Recruiting Lens should add service-side writes/updates for analysis-originated saved jobs.

### Established Patterns

- User-facing pages are Vite React/TypeScript with shadcn/ui and Tailwind semantic tokens. New UI should use the existing dashboard/form density, not marketing-style hero layouts.
- Edge functions resolve tier server-side and should not trust frontend tier input.
- Cache hits should look like normal successful results from the user's perspective; do not add a prominent "cached" badge unless required for operational clarity.
- Failed or partial AI results should not write cache entries. Cache writes happen only after successful validation and persistence.
- Cross-feature priors default to most-recent but remain replaceable through visible selectors.
- Defensive rendering is required for old persisted/cache payloads, but Pro/Elite generation after the fix should still validate strictly.

### Integration Points

- Resume wave connects `Results.tsx` and `analyze-resume/index.ts`: remove obsolete UI/prompt fields, preserve Priority Improvements, and wire CACHE-04 after output cleanup.
- LinkedIn wave connects `LinkedInGrader.tsx` and `grade-linkedin/index.ts`: remove `profileInsights` rendering/generation, enforce Ready-to-Paste tier counts, preserve auto-pull/replacement, and wire CACHE-05 with `prior_grade_id`.
- Career Compass wave connects `CareerCompass.tsx`, career-compass tab components, and `analyze-career/index.ts`: diagnose paid empty-output root cause before fixing, add strict Pro/Elite validation, add defensive fallback UX, and wire CACHE-06 after correctness.
- Recruiting Lens wave connects `RecruitingLens.tsx`, `recruiting-lens/index.ts`, `process-recruiting-lens-job`, `saved_jobs`, `analysis_results`, and cache: require company/role/JD, add tutorial, persist/update saved tiles, hydrate result deep-links, and wire CACHE-07 after persistence correctness.

</code_context>

<specifics>
## Specific Ideas

- Career Compass fallback copy should communicate: "This analysis is partial - re-run for the full report." The recovery path should feel like repairing an old report, but still send the user to the form for review before spending merits.
- Saved Recruiting Lens tiles live below the form, not above it, because the page's first job remains creating a new match report.
- Recruiting Lens saved tiles should include company, role, score, date, and compact status/context details. Keep the tile readable; planner decides exact fields based on available metadata.
- Recruiting Lens tutorial is first-run and pre-submit, but skippable. It should explain what company, role, JD, resume context, and LinkedIn context do in the analysis.
- Cache comes after correctness in every feature wave. This is a hard sequencing guard for planner/executor.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 37-feature-output-parity-ux-cache-resume-linkedin-career-compas*
*Context gathered: 2026-05-22T13:23:17-07:00*
