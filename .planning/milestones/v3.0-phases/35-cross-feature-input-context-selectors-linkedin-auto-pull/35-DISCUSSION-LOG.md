# Phase 35: Cross-Feature Input Context (Selectors + LinkedIn Auto-Pull) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 35-cross-feature-input-context-selectors-linkedin-auto-pull
**Areas discussed:** LinkedIn source precedence (CTX-02), Selector UX surface (CTX-05/06), Empty-state behavior (CTX-07), LinkedIn replacement scope on LIG (CTX-01)

---

## LinkedIn source precedence (CTX-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Most-recent by timestamp | Compare `profiles.linkedin_pdf_updated_at` vs `MAX(linkedin_grades.created_at)` and pick the newer. Treats the two sources as peers. | ✓ |
| Latest grade always wins | Any `linkedin_grades` row beats the onboarding PDF; PDF is fallback. Implies graded > raw. | |
| Onboarding PDF always wins | `profiles.linkedin_pdf_content` is canonical; grades are fallback. | |

**User's choice:** Most-recent by timestamp.
**Notes:** Captured as D-01. Implies `<PriorLinkedInSelector>` lists both sources in one chronological dropdown (D-02). Onboarding PDF row has no `overall_score` column value (was never graded standalone) — surface as `—`.

---

## Selector UX surface — render treatment (CTX-05/06)

| Option | Description | Selected |
|--------|-------------|----------|
| Always-visible dropdown | Render selector at top of form whenever ≥1 prior exists, defaulting to most-recent. Consistent surface across users. | ✓ |
| Collapsible 'Use a different one' | Static chip + chevron that expands the dropdown on click. Lower visual weight in the steady state. | |
| Only when 2+ priors exist | No selector for 0 or 1 prior; only render when there's an actual choice to make. | |

**User's choice:** Always-visible dropdown.
**Notes:** Captured as D-04. Renders ABOVE the manual paste/upload input (D-06). Mount points D-05: `<PriorAnalysisSelector>` in RCL/IP/CC; `<PriorLinkedInSelector>` in RCL/CC. Not mounted in LinkedInGrader itself (LIG owns its own auto-pull/replacement per CTX-01).

---

## Selector UX surface — what selection does (CTX-05/06)

| Option | Description | Selected |
|--------|-------------|----------|
| Repopulate form only (one-shot) | Pick a prior → form's resume/LinkedIn input is populated from that prior's stored content. Persisted only as part of the next submission. No new state stored. | ✓ |
| Repopulate AND persist as new default | Selection stored per-feature (e.g. `last_used_resume_id`) so next visit auto-loads that pick. Needs schema. | |
| Repopulate + navigate to that result | Same as deep-link from AnalysisHistory: load the cached prior result directly, skipping the form. | |

**User's choice:** Repopulate form only (one-shot).
**Notes:** Captured as D-07. No new "last-used" schema. Default stays "most-recent" on every page visit. Aligned philosophically with Phase 29 D-13/D-14 (cache hits are invisible to users) — no "loaded from prior" badge once selected.

---

## Empty-state behavior (CTX-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Block + CTA to upstream flow | Hide the analyze form entirely; render a single empty-state card with a button that navigates to the right flow. Matches CTX-07 wording literally. | ✓ |
| Inline notice, form still usable | Render the form with a top banner + link to upstream flow; allow direct upload/paste in this feature. | |
| Per-feature judgment | Block for hard dependencies, inline-notice for optional ones (e.g. RCL's optional `linkedinText`). Researcher/planner picks per consumer. | |

**User's choice:** Block + CTA to upstream flow.
**Notes:** Captured as D-08 with per-consumer wording. **Open clarification recorded as D-09:** RCL's LinkedIn is currently optional input. Literal "block for every missing prior" would change RCL behavior (require LinkedIn). Recommendation in D-09: block for resume everywhere, non-blocking notice for LinkedIn in RCL. Planner to confirm split with operator if it conflicts with CTX-07 wording.

---

## LinkedIn PDF replacement scope on LIG (CTX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| On successful grade | Persist `profiles.linkedin_pdf_*` only AFTER analyze call succeeds. Failed grades don't overwrite. | ✓ |
| On successful PDF parse (immediate) | Persist as soon as PDF text extraction succeeds, before submit. Faster mental model. | |
| Opt-in toggle | Default: no persist. Surface a checkbox 'Save as my LinkedIn source'. Most control, more UI. | |

**User's choice:** On successful grade.
**Notes:** Captured as D-11 with explicit ordering (PDF parse → submit → grade success → `profiles` UPDATE). D-12 specifies the UPDATE is fire-and-forget post-response (Phase 29 D-05 `waitUntil` shape). UPDATE failures log warn but don't surface to user.

---

## Claude's Discretion

- Component file location (`src/components/PriorAnalysisSelector.tsx`, `src/components/PriorLinkedInSelector.tsx`).
- Whether to extract a shared `useUserPriors(kind)` hook or inline the queries.
- Dropdown item layout — score chip placement, date formatting (relative vs. absolute) — recommend matching `AnalysisComparisonModal` for consistency.
- Loading skeleton vs. spinner vs. disabled-dropdown while priors fetch.
- Test surface split between Vitest unit + page-level smoke. CTX-01 replacement timing needs an explicit Vitest spy on the `profiles` UPDATE to confirm D-11 ordering.

## Deferred Ideas

- Per-feature "last-used" prior persistence schema (rejected for v3.0 via D-07).
- In-LIG prior LinkedIn grade picker (D-05 explicitly excludes; consider for Phase 38 if at all).
- "Cached" / "Loaded from prior" UI badge (rejected; aligned with Phase 29 D-14).
- Tier-aware empty-states (uniform in Phase 35; tier-gating stays per-feature).
- Production re-enablement of CTX-04 verification (rides with future Interview Prep milestone per Phase 47).
