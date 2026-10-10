# Phase 3: Interview Prep Coach — Frontend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 03-interview-prep-coach-frontend
**Areas discussed:** Category badge colors, Dark mode completeness, Navbar content spacing

---

## Category Badge Colors

| Option | Description | Selected |
|--------|-------------|----------|
| All indigo | Every badge uses indigo variants. Categories distinguished by label text only. Matches IPC-05 spec. | ✓ |
| Per-category colors with dark mode fix | Keep distinct colors (blue, purple, amber, green, rose) and add dark: variants. More visually rich but deviates from indigo spec. | |
| Indigo base + subtle tint | Indigo primary with slight hue shifts per category. Compromise approach. | |

**User's choice:** All indigo
**Notes:** Clean, consistent with the IPC-05 spec requirement for indigo color scheme.

---

## Dark Mode Completeness

| Option | Description | Selected |
|--------|-------------|----------|
| Full audit | Go through every element in the component, ensure proper dark: variants everywhere. No light-mode-only colors survive. | ✓ |
| Targeted fixes | Only fix elements being changed for indigo plus obviously broken spots. Faster but risks leaving subtle issues. | |

**User's choice:** Full audit
**Notes:** Since the color system is being overhauled to all-indigo anyway, a full audit is the natural choice — most styling is being touched regardless.

---

## Navbar Content Spacing

| Option | Description | Selected |
|--------|-------------|----------|
| pt-16 on content wrapper | Simple, standard fixed-navbar pattern. Navbar is ~64px, pt-16 = 64px. | ✓ |
| Spacer div after Navbar | Explicit <div className="h-16" /> between Navbar and content. More explicit but adds an extra element. | |
| You decide | Let Claude pick the approach most consistent with other pages in the codebase. | |

**User's choice:** pt-16 on content wrapper
**Notes:** Applies to all render paths (loading state, upgrade gate, main UI).

---

## Claude's Discretion

- Exact indigo shade variants for different element types
- Transition animations for expand/collapse
- Whether to refactor color constants or inline unified styles
- Minor layout polish discovered during dark mode audit

## Deferred Ideas

None — discussion stayed within phase scope
