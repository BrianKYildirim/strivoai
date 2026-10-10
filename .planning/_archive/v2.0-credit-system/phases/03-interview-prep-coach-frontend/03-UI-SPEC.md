---
phase: 3
slug: interview-prep-coach-frontend
status: draft
shadcn_initialized: true
preset: default (slate base, CSS variables, no prefix)
created: 2026-04-11
revised: 2026-04-11
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for the Interview Prep Coach frontend overhaul. This phase modifies a single file (`src/pages/InterviewPrepCoach.tsx`) — CSS class changes only, no logic changes.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (default style, CSS variables) |
| Preset | default — slate base color, 0.75rem radius |
| Component library | Radix UI (via shadcn Card, Badge, Button) |
| Icon library | Lucide React 0.462.0 |
| Font | Inter (via `fontFamily.sans` in tailwind.config.ts) |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px (`p-1`) | Icon gaps, inline badge padding |
| sm | 8px (`p-2`) | Badge internal padding, compact gaps |
| md | 16px (`p-4`) | Card padding, element spacing |
| lg | 24px (`p-6`) | Card body padding, section gaps |
| xl | 32px (`p-8`) | Bottom page padding (`pb-8`) |
| 2xl | 48px (`p-12`) | Not used in this phase |
| 3xl | 96px (`pt-24`) | Navbar clearance padding |

Exceptions: `pt-24` (96px) for navbar clearance — matches codebase convention across 15+ pages. See Override Acknowledgment below.

### Override Acknowledgment: Navbar Spacing (D-05)

CONTEXT.md decision D-05 specifies `pt-16` (64px) for navbar clearance. This UI-SPEC overrides that decision to `pt-24` (96px) based on the following codebase evidence:

| Evidence | Detail |
|----------|--------|
| Navbar actual height | `h-16` inner (64px) + `py-3` padding = ~88px total occupied space |
| Codebase convention | 15+ pages use `pt-24`: Dashboard, LinkedInGrader, CareerCompass, Profile, Jobs, AnalysisHistory, and others |
| Risk of `pt-16` | Content would be partially hidden under the navbar in its default (non-scrolled) state, since 64px < 88px actual navbar height |
| Source | RESEARCH.md Pitfall 1, verified via codebase grep for `pt-24` across all page components |

**User action required:** If the original `pt-16` intent was deliberate (e.g., a planned navbar height reduction), reject this override and the executor will use `pt-16`. Otherwise, `pt-24` applies as the codebase-consistent default.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px (`text-sm`) | 400 (regular) | 1.5 (`leading-relaxed` or default) |
| Label | 12px (`text-xs`) | 400 (regular) | 1.5 |
| Heading | 20px (`text-xl`) | 600 (semibold) | 1.2 |
| Display | 28px (`text-2xl`) | 600 (semibold) | 1.2 |

Source: Existing component uses `text-sm` for body, `text-xs` for badges/labels, `text-xl` for card titles, `text-2xl` for page heading. No changes to typography in this phase — document for contract completeness. Weights consolidated to 2: 400 (regular) for body and label text, 600 (semibold) for headings and display. Previous medium (500) on labels consolidated to regular (400); previous bold (700) on display consolidated to semibold (600).

---

## Color

### Phase-Specific Color System (Indigo Override)

This phase uses a feature-specific indigo color scheme per IPC-05, NOT the global coral/primary theme. The indigo palette applies only within `InterviewPrepCoach.tsx`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `bg-background` (CSS var — black in dark, white in light) | Page background |
| Secondary (30%) | `bg-indigo-500/5` (light) / `dark:bg-indigo-500/10` (dark) | Card backgrounds, input area, STAR framework boxes |
| Accent (10%) | `text-indigo-600` (light) / `dark:text-indigo-400` (dark) | Filter buttons active state, copy button text, "New Analysis" button text |
| Destructive | `hsl(var(--destructive))` | Not used in this phase |

### Indigo Variant Map

Every element in this component uses one of these exact class combinations:

| Element Type | Light Mode Classes | Dark Mode Classes |
|-------------|-------------------|-------------------|
| Badge (category + difficulty) | `bg-indigo-500/10 text-indigo-700 border-indigo-500/20` | `dark:text-indigo-300` |
| Card border | `border-indigo-500/20` | (opacity-based, works both modes) |
| Card header hover | `hover:bg-indigo-500/5` | (opacity-based, works both modes) |
| Input area background | `bg-indigo-500/5` | (opacity-based, works both modes) |
| Input border | `border-indigo-500/20` | (opacity-based, works both modes) |
| Button text (secondary) | `text-indigo-600 hover:text-indigo-700` | `dark:text-indigo-400 dark:hover:text-indigo-300` |
| Filter button (active) | `bg-indigo-600 text-white` | (solid color, works both modes) |
| Filter button (inactive) | `hover:bg-indigo-100` | `dark:hover:bg-indigo-500/20` |
| STAR box background | `bg-indigo-50` | `dark:bg-indigo-500/10` |
| STAR title text | `text-indigo-800` | `dark:text-indigo-200` |
| Page heading text | `text-indigo-700` | `dark:text-indigo-300` |

### Semantic Colors (Retained, NOT converted to indigo)

| Color | Usage | Rationale |
|-------|-------|-----------|
| `text-green-500` | Tips section icon (CheckCircle2) | Semantic "success/positive" meaning |
| `text-red-500` | Red Flags section icon (XCircle) | Semantic "warning/danger" meaning |
| `text-muted-foreground` | Secondary text, descriptions | Theme-aware via CSS variable |
| `bg-background` / `text-foreground` | Base page colors | Theme-aware via CSS variable |

Accent reserved for: active filter button fill, copy button icon+text, "New Analysis" button text, page title text, STAR section title text.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | "Generate Questions" (existing — no change) |
| Empty state heading | Not applicable — component requires input form submission first |
| Empty state body | Not applicable — results only appear after successful generation |
| Error state | Handled by existing `sonner` toast via `invokeWithTimeout` error path (no change) |
| Loading state | Handled by `UniversalAnalyzing` overlay component (no change) |
| Copy success feedback | "Copied!" toast via `sonner` (existing — no change) |
| Tier gate heading | "Interview Prep Coach is a Pro feature" (existing — no change) |
| Tier gate body | "Upgrade to Pro or Elite to access AI-powered interview preparation" (existing — no change) |

No copywriting changes in this phase. All copy is pre-existing and functional. Documented for contract completeness.

---

## Component Inventory

Single file modification: `src/pages/InterviewPrepCoach.tsx`

| Component | Source | Changes |
|-----------|--------|---------|
| Page wrapper `<div>` | Inline | Add `pt-24` to all 3 render paths (loading, upgrade gate, main) |
| `CATEGORY_COLORS` constant | Lines 62-68 | Replace with unified `BADGE_CLASSES` or inline indigo classes |
| `DIFFICULTY_COLORS` constant | Lines 70-74 | Replace with unified `BADGE_CLASSES` or inline indigo classes |
| Category badge `<span>` | Line 381 | Use indigo classes with `dark:` variants |
| Difficulty badge `<span>` | Line 386 | Use indigo classes with `dark:` variants |
| Copy button | Lines 418-419 | Add `dark:text-indigo-400 dark:hover:text-indigo-300` |
| New Analysis button | Line 327 | Add `dark:text-indigo-400` |
| All remaining elements | See RESEARCH.md audit table | Verify `dark:` variants present |

No new components. No new files. No new dependencies.

---

## Interaction Contracts

| Interaction | Behavior | Visual Feedback |
|-------------|----------|-----------------|
| Filter by category | Click filter button to show only matching questions | Active button: solid `bg-indigo-600 text-white`. Inactive: transparent with indigo hover. |
| Expand/collapse card | Click card header to toggle detail visibility | Chevron icon rotates. Card body animates open/closed via existing accordion behavior. Hover state: `bg-indigo-500/5`. |
| Copy STAR outline | Click copy button on expanded card | Button text briefly changes or toast appears ("Copied!"). Button color: `text-indigo-600 dark:text-indigo-400`. |
| Dark mode toggle | User toggles via navbar control | All elements transition between light/dark indigo variants. No flash of unstyled content. |

All interactions are already implemented. This phase only changes the visual classes applied during these interactions.

---

## Dark Mode Audit Checklist

Every element must pass: "Does this element look correct in BOTH light and dark mode?"

| Element | Light | Dark | Strategy |
|---------|-------|------|----------|
| Page background | `bg-background` | auto | CSS variable (no `dark:` needed) |
| Card backgrounds | `bg-indigo-500/5` | auto | Opacity-based (works both modes) |
| Card borders | `border-indigo-500/20` | auto | Opacity-based (works both modes) |
| Category badges | `bg-indigo-500/10 text-indigo-700` | `dark:text-indigo-300` | Explicit dark variant for text |
| Difficulty badges | `bg-indigo-500/10 text-indigo-700` | `dark:text-indigo-300` | Explicit dark variant for text |
| Copy button | `text-indigo-600` | `dark:text-indigo-400` | Explicit dark variant |
| New Analysis button | `text-indigo-600` | `dark:text-indigo-400` | Explicit dark variant |
| Tips icon | `text-green-500` | auto | Mid-range value (sufficient contrast both modes) |
| Red flags icon | `text-red-500` | auto | Mid-range value (sufficient contrast both modes) |
| Body text | `text-foreground` | auto | CSS variable |
| Secondary text | `text-muted-foreground` | auto | CSS variable |
| STAR box bg | `bg-indigo-50` | `dark:bg-indigo-500/10` | Explicit dark variant |
| STAR title | `text-indigo-800` | `dark:text-indigo-200` | Explicit dark variant |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Card, Badge, Button (pre-installed) | not required |

No third-party registries. No new shadcn components to install.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
