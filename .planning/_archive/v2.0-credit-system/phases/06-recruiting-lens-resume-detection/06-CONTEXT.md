# Phase 6: Recruiting Lens — Resume Detection - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Recruiting Lens must auto-detect the user's most recently analyzed resume and use it as the resume context for match analysis, instead of showing "No resume analysis found" when analyses exist. Closes orphaned requirement RCL-01.

Scope is limited to fixing resume detection on `src/pages/RecruitingLens.tsx`. Not in scope: recruiting-lens edge function logic, new upload flows inside Recruiting Lens, or redesign of the right-column CTA card.

</domain>

<decisions>
## Implementation Decisions

### Root Cause (locked)
- **D-01:** `analyze-resume` edge function writes analysis output to `resumes.grading_data` (and `resumes.overall_score`, `resumes.analyzed_at`). See `supabase/functions/analyze-resume/index.ts:671-678` and `:759-766`.
- **D-02:** `analysis_results` is only written by `src/components/MinimalHero.tsx:163-170` via `saveAnalysisResult()` in `src/lib/analysisHelpers.ts:120-150`. Onboarding/Upload flows do not populate it.
- **D-03:** Current `RecruitingLens.tsx:117-123` query filters `analysis_results` by `analysis_type='resume_analysis'` and misses everyone whose analysis went through the normal flow. This is the bug.

### Data Source
- **D-04:** Primary read path is `resumes` table. Query: most recent row for `user_id` where `grading_data IS NOT NULL` ordered by `analyzed_at DESC`, limit 1. Use `grading_data` as the raw analysis shape.
- **D-05:** Fallback read path for legacy MinimalHero users: if no `resumes` row has `grading_data`, query `analysis_results` where `analysis_type='resume_analysis'` ordered by `created_at DESC` limit 1, and use `raw_response`. Same shape as `grading_data` (both come from `analyze-resume` merger output), so `buildResumeSummary` works unchanged.
- **D-06:** Display filename from the matched source: `resumes.file_name` for the primary path; for fallback, look up the resume by `analysis_results.source_reference` (resume_id) if available, else fall back to the most recent `resumes.file_name`.

### Recency Rule
- **D-07:** "Most recently analyzed" means ORDER BY `resumes.analyzed_at DESC` (not `created_at`). A newly uploaded but not-yet-analyzed resume does not override an older but analyzed one. Matches RCL-01 wording.

### Empty-State UX
- **D-08:** When neither primary nor fallback returns a result, keep the existing blocker card unchanged: `AlertCircle` + "No resume analysis found" + "Analyze My Resume" button routing to `/onboarding`. No new component, no copy changes.

### Summary Shape
- **D-09:** Keep `buildResumeSummary(rawResponse)` (RecruitingLens.tsx:41-83) as-is. Both `grading_data` and `analysis_results.raw_response` already expose the same field names (`executiveSummary`, `strengths`, `industryGuess`, `suggestedTargetRoles`, `recommendedKeywords`, `criterionFeedback`, `overallScore`). Only the input plumbing changes.

### Edge Function Enforcement
- **D-10:** Frontend-only gate. The `Analyze Match` button stays `disabled={!hasAnalyzedResume || ...}`. `recruiting-lens` edge function is not modified in this phase — keeps existing `resumeSummary` min-length validation as the backstop.

### Cleanup
- **D-11:** Replace the current `Promise.all` with updated queries: keep `profiles` query, replace the `resumes` filename query and the `analysis_results` query with the combined primary+fallback logic described above. One less round-trip when primary hits.

### Claude's Discretion
- Exact TypeScript shape for the primary/fallback resolver (inline function vs extracted helper in `src/lib/` — planner decides).
- Whether to add a small logger tag like `[RecruitingLens]` on the fallback branch for observability.
- Loading skeleton stays unchanged.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirement
- `.planning/REQUIREMENTS.md` — RCL-01: "Recruiting Lens correctly detects and uses the user's most recently analyzed resume without prompting to analyze first"
- `.planning/ROADMAP.md` §Phase 06 — gap closure entry for RCL-01

### Source files in scope
- `src/pages/RecruitingLens.tsx:102-135` — current (broken) init effect that queries `analysis_results`
- `src/pages/RecruitingLens.tsx:41-83` — `buildResumeSummary` helper (stays as-is)
- `src/pages/RecruitingLens.tsx:390-440` — right-column card rendering (stays as-is)

### Source files providing ground truth
- `supabase/functions/analyze-resume/index.ts:671-678` — where `grading_data` is written in the fallback merge path
- `supabase/functions/analyze-resume/index.ts:759-766` — where `grading_data` is written in the normal parallel-merge path
- `src/lib/analysisHelpers.ts:120-150` — `saveAnalysisResult()` (sole writer of `analysis_results`)
- `src/components/MinimalHero.tsx:163-170` — sole caller of `saveAnalysisResult`
- `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` — `analysis_results` table schema (columns: `user_id`, `analysis_type`, `primary_score`, `key_insights`, `raw_response`, `source_reference`)

No external specs or ADRs referenced for this phase — bug fix is fully specified above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildResumeSummary()` (RecruitingLens.tsx:41-83) — works against both `grading_data` and `raw_response` since they share field names. Do not rewrite.
- `usePaywallGuard`, `useAnalysisGuard`, `UniversalAnalyzing`, `ProFeatureGate` — already wired, not touched.

### Established Patterns
- Parallel init queries via `Promise.all` on mount — keep pattern, swap which tables are queried.
- `supabase.from('resumes').select(...).eq('user_id', user.id).order('analyzed_at', { ascending: false }).limit(1).maybeSingle()` — standard shape.
- Resume grading output shape is set by `analyze-resume`'s `result-merger.ts` → this is the canonical "analysis result" object throughout the app.

### Integration Points
- `resumes` table (RLS-scoped to `user_id = auth.uid()`) — read-only from this page.
- `analysis_results` table (RLS-scoped the same way) — read-only fallback.
- `recruiting-lens` edge function receives `resumeSummary` string in body; contract unchanged.

</code_context>

<specifics>
## Specific Ideas

- The failure mode users see today: blocker card with "Analyze My Resume" CTA even after they finished a full resume analysis. Fix must make the success card appear instead.
- Filename display currently truncates at 32 chars with ellipsis (RecruitingLens.tsx:407-409) — preserve.

</specifics>

<deferred>
## Deferred Ideas

- Adding edge-function-side verification that the caller has an analyzed resume (defense in depth) — deferred to Phase 09 Security Audit if it surfaces as a finding.
- Inline "analyze now" flow inside Recruiting Lens — out of scope, would be its own phase.
- Migration/backfill to populate `analysis_results` from `resumes.grading_data` retroactively — not needed because of the fallback read path.

</deferred>

---

*Phase: 06-recruiting-lens-resume-detection*
*Context gathered: 2026-04-12*
