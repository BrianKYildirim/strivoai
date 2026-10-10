# Phase 3: Interview Prep Coach — Frontend - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Interview Prep Coach results page displays with correct indigo branding, full dark mode support, and interactive controls. The functional requirements (filtering, expand/collapse, copy-to-clipboard) are already implemented — this phase is a visual overhaul: enforcing the indigo color scheme, fixing dark mode across every element, and ensuring the navbar does not obscure content.

</domain>

<decisions>
## Implementation Decisions

### Category Badge Colors
- **D-01:** All badges use indigo color variants (`bg-indigo-500/10`, `text-indigo-400`, `border-indigo-500/20`). No per-category colors (blue, purple, amber, green, rose are removed). Categories are distinguished by label text only.
- **D-02:** Difficulty badges also use indigo variants instead of the current green/yellow/red scheme.

### Dark Mode Completeness
- **D-03:** Full audit of every element in the component — no light-mode-only colors left behind. Every background, text, border, and badge must have proper `dark:` variants.
- **D-04:** Since the color system is being overhauled to all-indigo anyway, the dark mode pass covers the entire component in a single sweep rather than targeted fixes.

### Navbar Content Spacing
- **D-05:** Add `pt-24` to the content wrapper to clear the fixed navbar (~88px total height including padding). This applies to all render paths (loading state, upgrade gate, main UI). *(Override from `pt-16` — user approved per codebase evidence: 15+ pages use `pt-24`, navbar is h-16 + py-3 = ~88px)*

### Claude's Discretion
- Exact indigo shade variants for different element types (badges vs backgrounds vs borders) as long as they follow the `indigo-500` family specified in IPC-05
- Transition animations for expand/collapse if improvements are obvious
- Whether to refactor `CATEGORY_COLORS` and `DIFFICULTY_COLORS` constants or inline the unified indigo styles
- Minor layout polish discovered during the dark mode audit

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Component
- `src/pages/InterviewPrepCoach.tsx` — The single file being modified. 507 lines. Contains all UI: input form, results display, category filter bar, expandable question cards, STAR outline copy, loading/upgrade gate states

### Design System
- `src/components/ui/card.tsx` — Card component used for question cards
- `src/components/ui/badge.tsx` — Badge component (may be used for category/difficulty labels)
- `src/components/ui/button.tsx` — Button component used throughout
- `tailwind.config.ts` — Theme configuration with CSS variable-based colors

### Integration Points
- `src/components/Navbar.tsx` — Unified navbar (Phase 1). Fixed position `z-50` — reason for `pt-16` spacing
- `src/components/UniversalAnalyzing.tsx` — Loading overlay used during analysis

### Requirements
- `.planning/REQUIREMENTS.md` — IPC-05 (indigo color scheme), IPC-06 (filter by category), IPC-07 (expand/collapse), IPC-08 (copy STAR outlines), IPC-11 (navbar no overlap)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InterviewPrepCoach.tsx` — Already has all functional requirements implemented: `activeCategory` state + filter bar (IPC-06), `expandedCards` Set + `toggleCard()` (IPC-07), `copyStarOutline()` with clipboard API (IPC-08)
- `CATEGORY_LABELS` constant — Maps category keys to display names, will remain as-is
- `CATEGORY_COUNTS` constant — Expected distribution, used for filter bar rendering
- `cn()` utility — Available for conditional class composition

### Established Patterns
- Indigo already used for primary accents: buttons (`bg-indigo-600`), borders (`border-indigo-500/20`), backgrounds (`bg-indigo-500/10`), text (`text-indigo-400`)
- Dark mode pattern: `dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20` used on filter buttons
- `text-muted-foreground` and `bg-background` semantic tokens used for theme-aware base styles

### Integration Points
- Component renders `<Navbar />` at top of every render path (loading, upgrade gate, main UI)
- `useFeatureGate('interview_prep_coach')` handles tier gating — no changes needed
- `invokeWithTimeout` calls the Phase 2 backend — no changes needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-interview-prep-coach-frontend*
*Context gathered: 2026-04-11*
