# Phase 35: Cross-Feature Input Context (Selectors + LinkedIn Auto-Pull) - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the existing `profiles.linkedin_pdf_*` onboarding data into LinkedIn Grader (LIG) and Recruiting Lens (RCL), and ship two reusable prior-pickers (`<PriorAnalysisSelector>` for resumes, `<PriorLinkedInSelector>` for LinkedIn) plus consistent empty-states across all cross-feature consumers (RCL, Interview Prep, Career Compass).

**Owns:**
1. **CTX-01** — LinkedInGrader auto-pulls `profiles.linkedin_pdf_content` on mount; PDF replacement inside LIG overwrites all 3 `linkedin_pdf_*` columns on `profiles`.
2. **CTX-02** — RecruitingLens defaults to user's most-recent Resume Analysis AND most-recent LinkedIn source without re-uploading.
3. **CTX-03** — Verification (only) that Career Compass still defaults to most-recent priors post-Phase-25-merge. CC already reads `profiles.linkedin_pdf_content` at `src/pages/CareerCompass.tsx:196,226-227` and pulls latest resume at `:200-206`.
4. **CTX-04** — Verification (only) that Interview Prep auto-fetches most-recent analyzed resume. IP already does this at `src/pages/InterviewPrep.tsx:213-220`. **Verification is staging-only** per Phase 47 (IP is gated off in production). If/when a future Interview Prep milestone re-enables production, CTX-04 production verification rides with that milestone.
5. **CTX-05** — Reusable `<PriorAnalysisSelector>` (resume), mounted in RCL, IP, and CC form areas. Lists `file_name + analyzed_at + overall_score`. Data source: paginated query reused from `src/components/AnalysisComparisonModal.tsx:262-271` (`resumes` rows where `grading_data IS NOT NULL`, ordered desc, `limit(10)`).
6. **CTX-06** — Reusable `<PriorLinkedInSelector>`, mounted in RCL and CC. Lists `identifier + created_at + overall_score`. Data source mirrors `AnalysisComparisonModal.tsx:279-298` (`linkedin_grades` v3 rows) and the `profiles.linkedin_pdf_*` row.
7. **CTX-07** — Empty-state with upstream-flow CTA for every cross-feature consumer when no priors exist.

**Out of scope for Phase 35:** Per-feature output / cache integration (rides in Phases 37–40); LinkedIn Grader UX changes beyond auto-pull (Phase 38); any new persisted "last-used" preference schema (one-shot selection only — see D-07); RCL `analysis_results` Pro-tier persistence (Phase 36 HIST-02); IP production re-enablement (future Interview Prep milestone).

</domain>

<decisions>
## Implementation Decisions

### LinkedIn source precedence (CTX-02)

- **D-01:** When a user has BOTH an onboarding PDF (`profiles.linkedin_pdf_content`) AND prior `linkedin_grades` rows, the default LinkedIn source is **most-recent by timestamp**. Compare `profiles.linkedin_pdf_updated_at` against `MAX(linkedin_grades.created_at)` and pick the newer. The two sources are peers — neither is privileged structurally.
- **D-02:** `<PriorLinkedInSelector>` lists BOTH the onboarding PDF row (if present) and `linkedin_grades` v3 rows in a single chronologically-sorted dropdown. The onboarding PDF row uses `profiles.linkedin_pdf_filename` as its identifier and shows no `overall_score` (it was never graded standalone) — render as `—` or omit the score column for that row, planner's choice.
- **D-03:** The "no LinkedIn source" condition for D-01 / RCL default is: `profiles.linkedin_pdf_content IS NULL` AND `COUNT(linkedin_grades) = 0`.

### Selector UX surface (CTX-05/06)

- **D-04:** Both selectors render as an **always-visible shadcn `<Select>` dropdown** at the top of the form area whenever ≥1 prior exists, defaulting to most-recent. Consistent surface across users; no collapsed/affordance hiding. Matches the modal pattern users already know from `AnalysisComparisonModal`.
- **D-05:** Mount locations:
  - `<PriorAnalysisSelector>` (resume) — RecruitingLens, InterviewPrep, CareerCompass
  - `<PriorLinkedInSelector>` — RecruitingLens, CareerCompass
  - **Not mounted** in LinkedInGrader (LIG owns LinkedIn auto-pull/replacement directly per CTX-01; a prior-picker inside LIG itself is out of scope) or Resume Upload page.
- **D-06:** Selectors are pure form-area controls. They appear ABOVE the manual paste/upload input — not inside a tab or accordion. Visual hierarchy: dropdown (auto-default highlighted) → manual upload/paste as alternative input.
- **D-07:** Selecting a prior **repopulates the form input only (one-shot)**. The selection is NOT persisted as a per-feature "last-used" default. No new schema column (e.g. `last_used_resume_id`) — keep the storage surface flat. Default remains "most-recent" on every page visit. Mental model: the dropdown picks input for THIS submission only.

### Empty-state behavior (CTX-07)

- **D-08:** When the consumer's required prior is missing, **block the form** and render a single empty-state card with a CTA button that navigates to the upstream flow. Wording per consumer:
  - RCL (no resume): "Run Resume Analysis first" → `/upload` (the partial implementation at `src/pages/RecruitingLens.tsx:659` is the template)
  - IP (no resume): "Analyze a resume first" → `/upload` (`InterviewPrep.tsx:404` already has "Analyze my resume" wording)
  - CC (no resume): "Run Resume Analysis first" → `/upload` (verify current CC behavior matches)
  - RCL / CC (no LinkedIn source): "Add your LinkedIn" → LinkedIn Grader (`/linkedin-grader`) so user can upload or paste a profile
- **D-09:** **Open clarification for the planner:** RCL's LinkedIn input is currently OPTIONAL (`RecruitingLens.tsx:407` sends `linkedinText` only if present). D-08 blocks on missing required priors — does the LinkedIn empty-state ALSO block RCL, or render as a non-blocking notice above an otherwise-runnable form? Recommendation: **non-blocking for LinkedIn** in RCL (preserve current optional-input behavior; show "Add your LinkedIn for sharper match" notice + CTA but allow analyze), **blocking for resume** everywhere (resume is the required anchor input for all three consumers). Planner should confirm with operator if this split conflicts with CTX-07's literal "every cross-feature consumer shows a clear empty-state" wording.
- **D-10:** Empty-state CTAs use React Router `<Link>` / `navigate()` to keep SPA navigation; no full-page reloads.

### LinkedIn PDF replacement scope on LIG (CTX-01)

- **D-11:** Replacement persistence to `profiles.linkedin_pdf_*` happens **only after the analyze call succeeds**. Sequence in LinkedInGrader's submit flow:
  1. User picks a new PDF → extract text via `extractPDFText` (local, no DB write yet).
  2. Submit → existing `grade-linkedin` analyze path runs.
  3. **On successful grade response:** UPDATE `profiles SET linkedin_pdf_content = <new>, linkedin_pdf_filename = <new>, linkedin_pdf_updated_at = now() WHERE id = auth.uid()`.
  4. **On grade failure / overload / user cancel:** no `profiles` write. Onboarding PDF remains the source.
- **D-12:** The UPDATE in D-11 is a fire-and-forget write fired AFTER the grade response is returned to the frontend (analogous to Phase 29 D-05 cache-write timing — write must not block the UX). If the UPDATE fails (transient DB), log a warn but do NOT show the user an error — they already got their grade. Their next visit will fall back to the prior source (acceptable degrade).
- **D-13:** Auto-pull behavior on LIG mount (CTX-01 read-side): when `profiles.linkedin_pdf_content` exists AND no `?id=` deep-link is present, pre-fill `profileContent` state (`LinkedInGrader.tsx:106`) with the stored content and set `inputMode='paste'` (`:117`). User sees the textarea pre-filled with their stored profile, can edit/replace, and analyze. The cycle-count / cached-grade load path at `:230-279` runs in parallel and is unaffected.
- **D-14:** No surface change to the existing PDF / paste mode toggle on LIG (`inputMode` at `:117`). Auto-pull respects whichever mode the user lands on: PDF mode = empty file input + offer to replace; paste mode = pre-filled textarea.

### CTX-03 / CTX-04 verification depth

- **D-15:** CTX-03 (CC) and CTX-04 (IP) are **code-reading verification only**, not new implementation. Verification artifact: rows in the eventual `35-VERIFICATION.md` citing the existing code paths (`CareerCompass.tsx:192-227`, `InterviewPrep.tsx:207-236`) plus a one-shot manual smoke-test entry (load the page logged in as a user with priors, confirm auto-pre-fill). No staging deploy gate required for CTX-03; CTX-04 verification staging-only per Phase 47.

### Claude's Discretion

- Selector component file location — `src/components/PriorAnalysisSelector.tsx` and `src/components/PriorLinkedInSelector.tsx` are the natural placements given existing flat structure under `src/components/`. Planner confirms.
- Whether to extract a shared `useUserPriors(kind)` hook for the dropdown's data fetch, or inline the query in each component. Planner picks based on how much pagination/error logic is needed.
- Exact shadcn `<Select>` item layout — score chip on the right vs. inline; date formatting (relative "3d ago" vs. absolute `2026-04-12`). Recommend the same format AnalysisComparisonModal already uses for consistency.
- Loading skeleton vs. spinner vs. disabled dropdown while priors fetch. Pick whatever matches the existing form-area loading idiom in each host page.
- Test surface — selector unit tests in Vitest (`__tests__` alongside component), plus a smoke-style page-level test that the dropdown renders + selection repopulates the form input. CTX-07 empty-state has a render assertion. CTX-01 replacement timing needs a Vitest mock of `grade-linkedin` + spy on the `profiles` UPDATE call to confirm D-11 ordering. CTX-03/04 verification is manual (no new tests, per D-15).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (source of truth)
- `.planning/REQUIREMENTS.md` lines 69–75 — CTX-01..07 full text
- `.planning/REQUIREMENTS.md` lines 103, 136 — LIG-01 / RCL-01 cross-references (these consume CTX-01/02/05/06)
- `.planning/ROADMAP.md` Phase 35 — Goal + Success Criteria (5 SCs); the "CTX-04 narrowed" annotation locking IP verification to staging-only per Phase 47
- `.planning/PROJECT.md` — v3.0 "Cross-feature input context" bullet under Target features

### Prior-phase decisions to carry forward
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-CONTEXT.md` — D-05 (IP filtered out of production AnalysisHistory); informs why CTX-04 is staging-only
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` D-13, D-14 — cache hits look identical to fresh runs (no badge); informs why D-07's one-shot selection should also be visually invisible (no "loaded from prior" badge)
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` D-05 — `EdgeRuntime.waitUntil` pattern for fire-and-forget post-response writes; same shape applies to D-12 `profiles` UPDATE after grade success

### Codebase intel (current state)
- `.planning/codebase/ARCHITECTURE.md` — overall data flow; AnalysisHistory dashboard read path
- `.planning/codebase/STRUCTURE.md` — component / page layout for placing new selector components
- `.planning/codebase/CONVENTIONS.md` — shadcn `<Select>` + Vitest test placement conventions

### Source files referenced as concrete touchpoints
- `src/pages/LinkedInGrader.tsx:106,117,200-279,325-338,346,369-396,533,611` — CTX-01 auto-pull insertion points + existing PDF/paste mode toggle + replacement persistence target
- `src/pages/RecruitingLens.tsx:243-313,375,407,597-613,659` — CTX-02 default + selector mount points + existing optional `linkedinText` path + existing partial empty-state at `:659`
- `src/pages/CareerCompass.tsx:192-227,432-435` — CTX-03 verification target + existing `linkedin_pdf_*` write pattern (relevant for D-11 reference shape)
- `src/pages/InterviewPrep.tsx:196-249,404` — CTX-04 verification target + existing "Analyze my resume" empty-state copy reused for D-08
- `src/components/AnalysisComparisonModal.tsx:244-308` — CTX-05/06 data-source query reused for both selectors (`resumes` paginated select; `linkedin_grades` v3-filtered select)
- `supabase/migrations/20251227213103_*.sql` + `20251229075420_*.sql` — `profiles.linkedin_pdf_content/updated_at/filename` columns shipped (no schema changes needed in Phase 35)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AnalysisComparisonModal.tsx:262-298` queries** — drop-in data source for both selectors. The 10-row `limit` is already the agreed pagination ceiling per CTX-05 spec. The v3-shape filter at `:289-293` for `linkedin_grades` should be reused verbatim in `<PriorLinkedInSelector>` to avoid surfacing legacy pre-v3 grades.
- **`extractPDFText` (`@/lib/extract-pdf-text`)** — used by both LinkedInGrader and CareerCompass for PDF→text; reuse for any replacement flow.
- **shadcn `<Select>`** — already used across the app; matches CTX-05's "shadcn `<Select>`" spec literally.
- **Empty-state pattern at `RecruitingLens.tsx:659`** — "No resume analysis found. Analyze your resume first to unlock Recruiting Lens." is the template wording for D-08 across all consumers.

### Established Patterns
- **Profile + priors parallel fetch on mount** — CC (`:192-217`), RCL (`:252-263`), IP (`:207-221`) all use `Promise.all` to fetch profile + latest prior in one round-trip. New selectors should follow the same pattern: prior-list fetch parallel to profile fetch, not chained.
- **Deep-link `?id=` hydration coexists with default load** — LIG, RCL, CC, IP all have separate `useEffect` for `?id=`. The selector + auto-pull must NOT fire when `?id=` is present (the deep-link owns state). Mirror the `skipCacheRestore` pattern from `LinkedInGrader.tsx:202-203` and `CareerCompass.tsx:207-216`.
- **Tier-aware empty-states are NOT in scope for Phase 35** — empty-states are uniform regardless of tier. Tier-gated locked-content stays where it lives in each feature page.

### Integration Points
- `LinkedInGrader.tsx` — auto-pull pre-fill on mount (CTX-01 read); post-grade `profiles` UPDATE (CTX-01 write per D-11).
- `RecruitingLens.tsx` — replace `useEffect` at `:246-313` to also fetch LinkedIn source (currently doesn't pull `profiles.linkedin_pdf_*` at all); mount both selectors at the top of the form (`:597` area); update empty-state at `:659` to use the D-08/D-09 unified pattern.
- `CareerCompass.tsx` — mount `<PriorAnalysisSelector>` (resume) and `<PriorLinkedInSelector>` in the form area. CC already fetches its own priors at `:192-217`; selectors can receive the existing fetched data via props or independently re-fetch (planner's call).
- `InterviewPrep.tsx` — mount `<PriorAnalysisSelector>` only. Existing fetch at `:207-221` already produces the most-recent resume; selector wraps that with picker UX.
- `analysis_jobs` / `linkedin_grades` / `resumes` tables — read-only consumers; no schema changes.
- `profiles.linkedin_pdf_*` — write target on LIG replacement per D-11/D-12. RLS already in place from existing profile-update paths.

</code_context>

<specifics>
## Specific Ideas

- The existing `AnalysisComparisonModal` data-source queries (resume select at `:262-271`; linkedin_grades select at `:279-287` with v3-shape filter at `:289-293`) are the literal queries to reuse — no new query shapes.
- The `RecruitingLens.tsx:659` empty-state ("No resume analysis found. Analyze your resume first to unlock Recruiting Lens.") is the wording template for D-08 — keep the same imperative-CTA voice across all consumers, just swap the verb/feature.
- The `InterviewPrep.tsx:404` "Analyze my resume" button copy is the canonical CTA verb for the resume empty-state.
- Phase 29 D-13/D-14 ("cache hits look identical to fresh runs") is the philosophical anchor for D-07 (no badge, no "loaded from prior" indicator — selection is invisible to the user once made).

</specifics>

<deferred>
## Deferred Ideas

- **Per-feature "last-used" prior persistence** — explicitly rejected for Phase 35 (D-07). If user demand surfaces later, add a `profiles.last_used_resume_id` / `last_used_linkedin_source` schema in a future phase. Not in v3.0.
- **In-LIG prior LinkedIn grade picker** — out of scope (D-05). LIG already loads its own most-recent grade on mount (`:264-279`); adding a picker inside LIG itself belongs to the Phase 38 LinkedIn Grader UX rework if at all.
- **"Cached" / "Loaded from prior" UI badge in selectors or hydrated forms** — explicitly out (per D-07 + Phase 29 D-14 alignment). If QA needs a debug flag, that's a Phase 36 call.
- **Tier-aware empty-states** — uniform across tiers in Phase 35. Tier-gating of inputs/outputs stays per-feature.
- **Production re-enablement of CTX-04 (IP) verification** — rides with the future Interview Prep milestone that re-enables IP on prod. Phase 35 ships staging-only per Phase 47.

</deferred>

---

*Phase: 35-cross-feature-input-context-selectors-linkedin-auto-pull*
*Context gathered: 2026-05-16*
