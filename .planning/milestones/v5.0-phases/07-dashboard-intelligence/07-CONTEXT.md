# Phase 7: Dashboard Intelligence - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Two dashboard sections are replaced with evidence-backed career intelligence derived ONLY from genuine stored analysis data (no new AI calls on dashboard load): "Live Career Profile" → **Recruiter First Impression** and "Activity Stream" → **Profile Alignment**. The Progress & Achievements section is deleted. Every protected area (Career OS, readiness cards, Next 3 Moves, Readiness Matrix, Every Version Ranked, Saved Jobs, Career Launch Path, navbar/sidebar/Merits, the separate History page, light/dark + responsive behavior) stays functionally and visually unchanged, and the final section order matches DASH-05 exactly.

</domain>

<decisions>
## Implementation Decisions

### Recruiter Response Rules
- **D-01:** The final Likely Recruiter Response state (fixed 5-state set) is driven by a **weighted stored-signal rubric** — deterministic scoring over the stored analysis signals, not a single weakest-link or primary-source rule.
- **D-02:** **Missing data caps confidence** — absent sources limit how strong a response state can be claimed, rather than merely lowering the score. (This is the honesty mechanism; it also handles failed/partial data, see D-08.)
- **D-03:** Thresholds are **conservative by default** — when in doubt, the rubric assigns the more cautious response state.
- **D-04:** The "Strengthen My Positioning" primary action targets the **weakest weighted signal** in the rubric.

### Evidence & Empty States
- **D-05:** Every insight carries an **inline source tag** — a small always-visible badge naming the producing feature (e.g. "Resume Analysis", "LinkedIn Grade"). No unsupported claims; every bullet is auditable at a glance.
- **D-06:** Stale/out-of-sync data is **shown with a staleness note** — always derive from the latest stored data, but flag age or cross-source desync (e.g. "Based on your resume analysis from May 12"). No silent staleness, no hard age cutoff.
- **D-07:** Non-mandated empty states (no data at all, etc.) are **action-first with one CTA**: a short line on what's missing plus a single button to the feature that produces the data. Reuse the existing `EmptyState` component pattern in `src/pages/Dashboard.tsx`. (DASH-03's missing-profile copy for Profile Alignment is locked verbatim by REQUIREMENTS.md.)
- **D-08:** Failed or partial/corrupt prior analyses **degrade to what's valid** — use intact stored signals, drop broken ones, and let the missing-data confidence cap (D-02) communicate reduced certainty. No separate error-state card; a bad source never blocks the section or the dashboard (DASH-04).

### Free vs Elite Depth
- **D-09:** Elite-only depth renders as **locked teasers** for Free users — blurred/lock-icon rows with an upgrade prompt, consistent with the existing MiniMeter/locked patterns already on the dashboard.
- **D-10:** Free-tier insights derive from **Resume + LinkedIn only**; Career Compass, Saved Jobs, and Recruiting Lens enrichment is the Elite differentiator (matching DASH-01's cross-analysis framing).
- **D-11:** **Pro = Elite** for both new sections — the spec's "Elite" depth applies to all paid tiers.
- **D-12:** Tier-depth rules live in a **shared pure-TypeScript derivation module** (e.g. `src/lib/dashboard-intelligence/`) that computes each section's full model and applies tier caps deterministically. Unit-testable; both sections share it; components stay presentational.

### Section Layout & Deletion Boundary
- **D-13:** The two new sections **reuse existing visual patterns** — `SectionHeader`/`EmptyState`/card primitives and current spacing. No distinct "intelligence" styling; lowest regression risk against DASH-05's visually-unchanged bar.
- **D-14:** Progress & Achievements + Activity Stream get **full dead-code removal** — delete the components AND any queries/helpers/types left unused by anything else, verified via type-check plus a shared-usage sweep so Merits/History keep their own data paths intact (DASH-02).
- **D-15:** New section components are **extracted to their own files** (`src/components/dashboard/`) with the derivation module under `src/lib/` — Dashboard.tsx is already ~1,316 lines; new logic stays testable and reviewable in isolation.
- **D-16:** DASH-06 validation runs as **automated + operator smoke**: unit tests on the derivation module (tier caps, rubric states, empty-state selection), Playwright checks for section order/presence, then a manual operator smoke pass for visual polish in light/dark/responsive — same model as Phase 6 verification. Operator smokes are `autonomous: false` checkpoints (never auto-approved).

### Section-Order Conflicts (resolved 2026-07-08, operator-confirmed)
- **D-17:** "Career Launch Path" (DASH-05 slot #6) **does not exist in the codebase and is NOT built this phase** — DASH-05 is interpreted as the relative order of existing sections; the Launch Path slot is simply absent until a future phase builds it. No placeholder section is rendered.
- **D-18:** Saved Jobs + "Every Version Ranked" **keep their existing shared `<Tabs>` control unchanged** — the tabbed block counts as DASH-05 slots #7+#8; "protected areas visually unchanged" wins over the literal sequential list. New sections are inserted around it.

### Claude's Discretion
- Exact rubric weights, signal normalization, and threshold values (within "conservative by default").
- Staleness-note wording and the age/desync heuristics that trigger it.
- Internal structure of the derivation module and component file naming.
- Locked-teaser visuals, as long as they match the existing locked-pattern language.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & scope
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, and the fixed DASH-05 section order; planned plan split (07-01/02/03).
- `.planning/REQUIREMENTS.md` — DASH-01..06 verbatim requirements, including the fixed 5-state recruiter-response set, per-tier item counts, and the locked missing-profile empty-state copy for Profile Alignment.

### Stored-data producers (what the new sections may read)
- `.planning/phases/04-feature-migration-a-recruiting-lens-linkedin-grader/04-CONTEXT.md` — Recruiting Lens + LinkedIn Grader decisions and stored output shapes.
- `.planning/phases/05-feature-migration-b-resume-analysis-onboarding/05-CONTEXT.md` — Resume Analysis migration decisions and stored data.
- `.planning/phases/06-feature-migration-c-career-compass/06-CONTEXT.md` — Career Compass decisions and stored data.

### Code under change
- `src/pages/Dashboard.tsx` — current section implementations: `ProfileIntelligence` ("Live Career Profile", ~line 849), `ProgressAndAchievements` (~line 1174) with nested `CareerTimeline` ("Activity Stream", ~line 1190), and shared `SectionHeader`/`EmptyState`/`MiniMeter` primitives.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SectionHeader`, `EmptyState`, `MiniMeter` (all inline in `src/pages/Dashboard.tsx`): the new sections reuse these primitives per D-13/D-07/D-09; extraction may be needed if the new components move to their own files.
- Existing locked/blurred tier-gating visuals (MiniMeter locked pattern) — template for the Elite locked teasers.
- TanStack React Query patterns already used for dashboard data fetching.

### Established Patterns
- Dashboard sections are currently inline functions inside `Dashboard.tsx` (~1,316 lines); this phase deliberately breaks from that for NEW components only (D-15) — protected sections are not refactored.
- No new AI calls on dashboard load (DASH-04): all intelligence is client-side derivation over stored analysis rows.
- Repo dead-code hygiene: removals verified with lint + `npm run type-check` and the `verify:baseline` gate.

### Integration Points
- New derivation module (`src/lib/dashboard-intelligence/`) consumes stored analysis data produced by the Phase 4/5/6 migrated features (resumes, linkedin_grades, career compass results, recruiting lens results, saved_jobs).
- `ProgressAndAchievements` render site (~line 658 in Dashboard.tsx) is removed; `Recruiter First Impression` and `Profile Alignment` slot into the exact DASH-05 order.
- Merits and the History page must retain their own data paths after the dead-code sweep (D-14).

</code_context>

<specifics>
## Specific Ideas

- Inline source badges styled like small metadata chips per insight bullet — "Resume Analysis" / "LinkedIn Grade" / "Career Compass" etc.
- Staleness note example the user approved: "Based on your resume analysis from May 12".
- Validation model explicitly mirrors Phase 6: automated derivation-module unit tests + Playwright order/presence checks + operator visual smoke.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-dashboard-intelligence*
*Context gathered: 2026-07-08*
