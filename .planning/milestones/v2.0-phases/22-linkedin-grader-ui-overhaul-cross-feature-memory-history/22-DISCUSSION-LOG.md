# Phase 22: LinkedIn Grader UI Overhaul + Cross-Feature Memory/History - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 22-linkedin-grader-ui-overhaul-cross-feature-memory-history
**Areas discussed:** Locked UI coverage, LinkedIn layout parity, Career Compass hydration, History source + View

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Locked UI coverage | Which Pro sections render as BlurredLockCard skeletons on free tier + what placeholder content sits inside | ✓ |
| LinkedIn layout parity | Width/padding root cause + Profile Completeness reordering + responsive check strategy | ✓ |
| Career Compass hydration | Backend auto-fetch vs explicit frontend pass-through + UX signal + staleness policy + single-analysis fallback | ✓ |
| History source + View | usage_tracking vs per-feature tables + View-action routing + which pages need ?id= hydration + empty state | ✓ |

---

## Locked UI Coverage

### Q: Which sections render as BlurredLockCard skeletons on free tier?

| Option | Description | Selected |
|--------|-------------|----------|
| profileInsights | Render 2 blurred "What's Working For You" placeholder cards | |
| keyStrengths | Render 3 blurred strengths pills | |
| nextBestAction | Render blurred "Next Best Action" card | |
| topFixes 2-5 (locked) | 4 blurred fix cards beneath the 1 real top-priority fix | ✓ |

**User's choice:** topFixes 2-5 only
**Notes:** "Make sure that only one fix is generated, the top-priority fix. Display 4 fake locked ready-to-paste improvements underneath it. They currently do not show at all. Also make sure to put profile completeness at the number 1 spot of the section-by-section breakdown area"

### Q: For the 4 locked ready-to-paste improvement cards, what teaser content should they display?

| Option | Description | Selected |
|--------|-------------|----------|
| Section-labeled generic teasers | Section hint title + generic Current→Suggested placeholder + pts badge | ✓ |
| Lorem-style blur-dominant | Minimal title, illegible lorem body | |
| Real fix titles, lorem body | Claude-generated titles with lorem body (requires prompt change) | |

**User's choice:** Section-labeled generic teasers

### Q: Where does the placeholder teaser text come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in LinkedInGrader.tsx | Small constant array at top of file (matches Phase 15.2 pattern) | ✓ |
| New shared constants file | src/lib/locked-placeholders.ts for cross-page reuse | |
| Feature-phase decides later | Planner/implementer picks during execute | |

**User's choice:** Hardcoded in LinkedInGrader.tsx

### Q: Should the locked cards be clickable or purely visual placeholders?

| Option | Description | Selected |
|--------|-------------|----------|
| Clickable → /pricing | Consistent with existing BlurredLockCard behavior | ✓ |
| Visual only, single CTA | pointer-events-none; upgrade button below drives conversion | |

**User's choice:** Clickable → /pricing

---

## LinkedIn Layout Parity

### Q: Width/padding mismatch root cause — top padding, max-width, or both?

| Option | Description | Selected |
|--------|-------------|----------|
| Top padding only | Change pt-24 → pt-6 to match Results.tsx | ✓ |
| Both padding and max-width | pt-24 → pt-6 AND max-w-5xl → max-w-6xl | |
| Something else — verify in browser | Have executor compare side-by-side and pick visually | |

**User's choice:** Top padding only

### Q: How to put Profile Completeness first in the Section Breakdown grid?

| Option | Description | Selected |
|--------|-------------|----------|
| Reorder array at render | In-component map over reordered copy | ✓ |
| Server-side reorder in prompt/response | Update grade-linkedin prompt to emit PC first | |
| Dedicated top row | Render PC outside the 2-col grid | |

**User's choice:** Reorder array at render

### Q: Responsive + theme parity verification — browser or token-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Browser verification required | Dev server, all breakpoints, both themes, free + Pro | ✓ |
| Token-only audit | Rely on Tailwind responsive classes only | |

**User's choice:** Browser verification required

### Q: "Scan New Profile" header bar — keep, move, or remove?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as-is | Leave LinkedInGrader header untouched | |
| Move Scan button to top-right floating | Match RecruitingLens pattern | |
| Remove — parity only means layout | Only container width needs to match | |

**User's choice:** Free-text extension — "The Scan New Profile is useful, apply it to the other feature pages in the same fashion as LinkedIn Grader."
**Notes:** Scope extension captured as D-10. Apply the header-bar pattern to Results.tsx, CareerCompass.tsx, RecruitingLens.tsx. Planner should size as a separate plan file to allow descoping.

---

## Career Compass Hydration

### Q: Which path hydrates from both analyses on fresh Career Compass run?

| Option | Description | Selected |
|--------|-------------|----------|
| Backend auto-fetch | Extend analyze-career main path to read latest linkedin_grades | ✓ |
| Explicit frontend pass-through | CareerCompass.tsx queries linkedin_grades and passes priorLinkedinGrading | |
| Both — frontend passes, backend fallback | Defensive double-fetch | |

**User's choice:** Backend auto-fetch

### Q: UX signal when Career Compass silently uses a prior LinkedIn analysis?

| Option | Description | Selected |
|--------|-------------|----------|
| Small badge/pill on results | "Used your LinkedIn analysis from {date}" near header | ✓ |
| Silent — no indicator | Fully invisible | |
| Pre-analysis confirmation | Prompt user to continue or scan fresh | |

**User's choice:** Small badge/pill on results

### Q: Staleness cap for reused LinkedIn analysis?

| Option | Description | Selected |
|--------|-------------|----------|
| No staleness check | Reuse whatever is latest | ✓ |
| 30-day cap | Fall back to fresh input if older | |
| 7-day cap | Aggressive refresh requirement | |

**User's choice:** No staleness check

### Q: Graceful fallback when only one prior analysis exists?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current resume-only path | Require fresh LinkedIn input as today | |
| Make LinkedIn optional entirely | Allow resume-only Career Compass run | |
| Prompt user to choose | "Add LinkedIn now or continue without?" | ✓ |

**User's choice:** Prompt user to choose

---

## History Source + View

### Q: Most likely root cause + fix direction for empty History?

| Option | Description | Selected |
|--------|-------------|----------|
| Diagnose first, then fix | Verify usage_tracking INSERTs + RLS + action_type values before changing schema | ✓ |
| Switch to per-feature tables union | UNION across analysis_jobs + linkedin_grades + ... | |
| Hybrid — usage_tracking for timeline, per-feature for detail | Index + per-row enrichment | |

**User's choice:** Diagnose first, then fix

### Q: Clicking a history entry — what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Open the specific past analysis | Route with ?id= to each feature page | ✓ |
| Route to feature page (current behavior) | /dashboard or feature entry page | |
| Mix — specific where possible, feature page otherwise | Incremental path | |

**User's choice:** Open the specific past analysis

### Q: Which feature pages need to hydrate from ?id= URL param?

| Option | Description | Selected |
|--------|-------------|----------|
| LinkedIn Grader | /linkedin-grader?id= loads cached grade | ✓ |
| Career Compass | /career-compass?id= loads specific analysis | ✓ |
| Recruiting Lens | /recruiting-lens?id= loads specific run | ✓ |
| Interview Prep | /interview-prep?id= loads specific quiz | ✓ |

**User's choice:** All four
**Notes:** "Just ensure they all work as intended."

### Q: Empty state handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing empty state | AnalysisHistory.tsx:257-265 unchanged | ✓ |
| Redesign empty state | Defer to future phase | |

**User's choice:** Keep existing empty state

---

## Claude's Discretion

- Exact copy for the 4 locked ready-to-paste skeleton cards.
- Exact copy + styling of the "Used your LinkedIn analysis from {date}" badge.
- Ordering of the 4 locked skeleton sections.
- Tailwind class tweaks during browser verification.

## Deferred Ideas

- History empty-state redesign.
- Staleness caps (30-day / 7-day) on reused LinkedIn analyses.
- Lorem-only placeholder text for locked fixes.
- Floating Scan button variant for RecruitingLens.
- Unified analysis view / schema migration.
