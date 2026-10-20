# Phase 37: Feature Output Parity, UX & Cache - Resume + LinkedIn + Career Compass + Recruiting Lens - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-22T13:23:17-07:00
**Phase:** 37-feature-output-parity-ux-cache-resume-linkedin-career-compas
**Areas discussed:** Career Compass partial-result UX, Recruiting Lens saved-work surface, Recruiting Lens tutorial timing, Feature-wave sequencing

---

## Career Compass partial-result UX

| Question | Option | Description | Selected |
|---|---|---|---|
| Missing sections first impression | Global + per-tab | Show one top warning plus fallback cards inside affected tabs; clearest for partial cached data. | yes |
| Missing sections first impression | Per-tab only | Keep the page quieter but users may miss why multiple tabs look incomplete. | |
| Missing sections first impression | Global only | Simple to implement, but blank tab interiors may still feel broken. | |
| Fallback card action | Re-run for full report | Primary CTA runs a fresh Career Compass analysis. | yes |
| Fallback card action | Continue with available sections | No primary CTA; explain what is missing. | |
| Fallback card action | Re-run + keep browsing | CTA is present, but users can still inspect available sections. | |
| Re-run behavior | Preserve inputs and run immediately | Use the same resume/LinkedIn/role context when available. | |
| Re-run behavior | Send user back to form | Prefill the form, but require review before running. | yes |
| Re-run behavior | Ask inline | Show a confirmation with "Use same inputs" vs "Edit inputs." | |
| Pro/Elite validation | All six core sections required | Fail the result if any of the six core sections is missing. | yes |
| Pro/Elite validation | Accept partial with warning | Persist and render whatever comes back. | |
| Pro/Elite validation | Retry once, then partial | Retry missing-section generation once, then save partial if still incomplete. | |

**User's choices:** Global + per-tab warning/fallback; re-run for full report; prefill form for review; all six core paid sections required.
**Notes:** This locks strict paid-output behavior while preserving defensive rendering for old cached/persisted partial data.

---

## Recruiting Lens saved-work surface

| Question | Option | Description | Selected |
|---|---|---|---|
| Saved tile placement | Above the form | Show recent analysis tiles before the JD form. | |
| Saved tile placement | Below the form | Keep the primary "analyze a job" flow first. | yes |
| Saved tile placement | Separate tab | Separate "New Analysis" and "Saved Jobs." | |
| Tile emphasis | Company + role + score | Compact operational tile with match score, date, and quick open. | |
| Tile emphasis | Recruiter verdict first | Foreground the qualitative "why." | |
| Tile emphasis | Company + role + status details | Include score, date, cache/fresh status, and source/context details where readable. | yes |
| Cache-hit saved tile behavior | Always create a visit tile | Every cache hit appears as a new Saved Jobs interaction. | |
| Cache-hit saved tile behavior | Update existing tile timestamp | Refresh the existing tile for same company/role/JD. | yes |
| Cache-hit saved tile behavior | No saved tile on cache hit | History records it, Saved Jobs only shows fresh analyses. | |
| Saved tile click behavior | Cached result view in place | Hydrate `/recruiting-lens?id=<run_id>` and show the result on the same page. | yes |
| Saved tile click behavior | Read-only detail mode | Open a distinct read-only result state. | |
| Saved tile click behavior | Prefilled form + result summary | Reopen the form with fields prefilled and show prior summary. | |

**User's choices:** Tiles below form; rich company/role/status details; cache hits refresh existing saved tile; tile opens `/recruiting-lens?id=<run_id>`.
**Notes:** Saved Jobs should support review and cache parity without displacing the primary new-analysis workflow.

---

## Recruiting Lens tutorial timing

| Question | Option | Description | Selected |
|---|---|---|---|
| Tutorial appearance | Before first analysis attempt | Trigger when the user first starts the JD analysis flow. | yes |
| Tutorial appearance | Immediately on first visit | Modal opens as soon as `/recruiting-lens` loads. | |
| Tutorial appearance | Manual only + subtle prompt | No modal unless user clicks "View tutorial." | |
| Tutorial tone | Operational walkthrough | Concise steps for company, role, JD, resume/LinkedIn context, then analyze. | yes |
| Tutorial tone | Animated coaching moment | More expressive explanation of why each input improves the match. | |
| Tutorial tone | Minimal checklist | Compact checklist with one short animation. | |
| Tutorial dismissal | Persist dismissed forever | localStorage flag prevents repeat auto-show; manual view remains available. | yes |
| Tutorial dismissal | Show once per browser session | Useful reinforcement, but can annoy users. | |
| Tutorial dismissal | Show again after major form changes | Requires versioned tutorial state. | |
| First submission gate | Yes, first submission gates through tutorial | First analyze click opens tutorial, then user confirms and submits. | |
| First submission gate | No, tutorial can be skipped | Show it, but allow the first submit to continue if dismissed. | yes |
| First submission gate | Only gate when fields are incomplete | Tutorial appears as guidance if required fields are missing. | |

**User's choices:** Pre-first-analysis tutorial; operational tone; localStorage dismissal; skippable first submission.
**Notes:** RCL-03 visibility is satisfied without forcing a modal wall.

---

## Feature-wave sequencing

| Question | Option | Description | Selected |
|---|---|---|---|
| Planning priority | Business-critical bug fixes first | Fix broken paid output and persistence before lower-risk cleanup/cache work. | yes |
| Planning priority | Fastest shippable cleanup first | Remove obvious UI/prompt sections first. | |
| Planning priority | Cache parity first | Wire cache across all four features early. | |
| Decomposition | Four feature waves | Resume, LinkedIn, Career Compass, Recruiting Lens. | yes |
| Decomposition | Layer waves | Output cleanup, UX, persistence, cache, tests across all features. | |
| Decomposition | Risk waves | High-risk paid-flow bugs first, then low-risk UI trims, then cache. | |
| Cache timing | After output correctness | Fix/gate/validate output first, then cache. | yes |
| Cache timing | Before output correctness | Cache early to reduce repeated test/API cost. | |
| Cache timing | Feature-dependent | Cache early for low-risk features, after correctness for Career/RCL. | |
| Verification gate | Code tests + one manual QA path | Targeted tests plus short manual smoke checklist. | yes |
| Verification gate | Automated tests only | Faster repeatability, but may miss visual/UX regressions. | |
| Verification gate | Manual QA only for complex flows | Efficient, but uneven quality bar. | |

**User's choices:** Business-critical bugs first; four feature waves; cache after output correctness; tests plus manual QA per wave.
**Notes:** This should guide `/gsd-plan-phase 37` to avoid caching broken output and to keep the consolidated phase decomposable.

---

## Claude's Discretion

- Exact component/file placement for fallback cards, saved tiles, and tutorial component.
- Exact copy for warnings, fallback cards, saved tile labels, and tutorial steps.
- Exact test file layout, provided every feature wave includes code tests plus one manual QA path.

## Deferred Ideas

None.
