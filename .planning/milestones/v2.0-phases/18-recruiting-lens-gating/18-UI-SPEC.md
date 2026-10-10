---
phase: 18
phase_name: recruiting-lens-gating
status: draft
created: 2026-04-17
design_system: shadcn (default preset, slate base, HSL CSS variables)
---

# Phase 18: recruiting-lens-gating — UI Design Contract

> **Consumed by:** gsd-ui-checker, gsd-planner, gsd-executor, gsd-ui-auditor
> **Source decisions:** 18-CONTEXT.md (D-01 through D-17), REQUIREMENTS.md (RCL-01 through RCL-06, BACK-11)

---

## 1. Design System Reference

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui (default style, slate base) | `components.json` |
| CSS Variables | HSL via `src/index.css` `:root` block | Existing |
| Font Family | Inter, system-ui, sans-serif | `tailwind.config.ts` |
| Icon Library | Lucide React 0.462.0 | `package.json` |
| Animation | Framer Motion 12.23.26 | `package.json` |
| Border Radius | `--radius: 0.75rem` (lg), calc -2px (md), calc -4px (sm) | `tailwind.config.ts` |

**Registry**: shadcn official only. No third-party registries.

---

## 2. Spacing

Standard 8-point scale with 2 declared exceptions for pre-existing component padding.

| Token | Value | Usage in This Phase |
|-------|-------|---------------------|
| `p-4` | 16px | Card content padding (`CardContent`), gap card inner padding |
| `p-6` | 24px | LockedSection inner padding, recruiter verdict padding |
| `gap-4` | 16px | Grid gap between sub-score cards, gap card stack, flex gap inside gap cards, locked list items |
| `gap-8` | 32px | Section vertical spacing (`space-y-8` on results container) |
| `mb-2` | 8px | Badge-to-title spacing inside LockedSection |
| `mb-4` | 16px | Section heading to content |
| `mt-4` | 16px | CTA button top margin inside LockedSection |

**Exceptions (pre-existing, not introduced by this phase):**

| Token | Value | Justification |
|-------|-------|---------------|
| `p-5` | 20px | Used in existing `RecruitingLens.tsx` keyword `CardContent` blocks (lines 891, 910). This phase does not modify those layouts; changing padding would be a visual regression in unrelated sections. |
| `gap-3` | 12px | Used in existing `RecruitingLens.tsx` heading row and card content layouts (lines 439, 543, 657, 776). This phase does not modify those layouts; changing gap would be a visual regression in unrelated sections. |

---

## 3. Typography

Uses 4 sizes and 2 weights from the existing design system. No new type styles introduced.

| Role | Size | Weight | Line Height | Class |
|------|------|--------|-------------|-------|
| Page heading | 28px (text-3xl) / 36px (md:text-4xl) | 600 (font-semibold) | 1.2 (leading-tight) | Existing `h1` in RecruitingLens |
| Section heading | 18px (text-lg) | 600 (font-semibold) | 1.4 (leading-tight) | `h3` for "Top Gaps", "Resume Rewrites", etc. |
| Body / teaser text | 14px (text-sm) | 400 (font-normal) | 1.5 (leading-relaxed) | Card content, LockedSection teaser |
| Label / meta | 12px (text-xs) | 400 (font-normal) | 1.4 | Severity badges, "ELITE EXCLUSIVE" badge, field labels |

---

## 4. Color Contract

Follows existing 60/30/10 split. No new colors introduced.

| Role | Percentage | Token | Where Used |
|------|-----------|-------|------------|
| Dominant surface | 60% | `--background` (0 0% 0% dark / 0 0% 100% light) | Page background |
| Secondary surface | 30% | `--card` (0 0% 5% dark / 0 0% 98% light) | All cards, LockedSection background, gap cards |
| Accent | 10% | `--primary` (357 100% 68% dark / 357 100% 55% light) | CTA buttons, Lock icon background pulse, score ring on high scores |

**Accent reserved for:**
- "Upgrade to Elite" CTA button inside LockedSection and LockedListItem
- Lock icon pulsing background (`bg-primary/15`)
- "Analyze Match" primary CTA button
- Score ring stroke (via `scoreStroke()` — emerald/amber/red semantic, not accent)

**Semantic colors used in this phase:**
- `emerald-600` / `emerald-400`: Scores >= 75, "Apply Now" badge, matched keywords
- `amber-600` / `amber-400`: Scores 55-74, gap severity "Medium", "Top Gaps" icon
- `red-600` / `red-400`: Scores < 55, gap severity "High/Critical", missing keywords
- `--destructive`: Character count warning when near limit

---

## 5. Component Inventory

### 5a. Existing Components (consumed, not modified)

| Component | Import Path | Usage |
|-----------|------------|-------|
| `<ProFeatureGate>` | `@/components/ProFeatureGate` | Full-page gate for Free users (RCL-01) |
| `<LockedSection>` | `@/components/LockedSection` | Section-level locks for Pro users viewing Elite content (D-12); field-level locks inside gap cards (D-11) |
| `<LockedListItem>` | `@/components/LockedListItem` | Capped array items for `topGaps` and `resumeEdits` (D-13) |
| `<Card>`, `<CardContent>` | `@/components/ui/card` | All content cards |
| `<Badge>` | `@/components/ui/badge` | Severity badges, score labels, tier badges |
| `<Button>` | `@/components/ui/button` | CTAs, copy buttons |
| `<Skeleton>` | `@/components/ui/skeleton` | Loading state |
| `<Textarea>` | `@/components/ui/textarea` | Job description input |
| `<Collapsible>` | `@/components/ui/collapsible` | LinkedIn optional input |
| `<UniversalAnalyzing>` | `@/components/UniversalAnalyzing` | Full-screen analyzing overlay |

### 5b. No New Components

This phase introduces no new UI components. All rendering is achieved through composition of existing primitives.

---

## 6. View States

### 6a. Free User — Full Gate (RCL-01)

**Trigger:** `tier === 'free'`
**Rendered:** `<ProFeatureGate>` with these exact props:

| Prop | Value |
|------|-------|
| `featureName` | `"Recruiting Lens"` |
| `featureIcon` | `<Target className="h-8 w-8" />` |
| `featureColor` | `"hsl(var(--primary))"` |
| `description` | `"See how recruiters evaluate your profile against any job posting."` |
| `benefits[0]` | `"Recruiter-grade match score"` |
| `benefits[1]` | `"Gap analysis with fix priority"` |
| `benefits[2]` | `"Ready-to-paste resume bullet rewrites"` |
| `benefits[3]` | `"Strategic action roadmap"` |

This is the existing implementation at `RecruitingLens.tsx:393-410`. No changes needed.

### 6b. Pro User — Input Form

**Identical layout to current Elite input form.** Two-column grid (`grid-cols-1 md:grid-cols-[3fr_2fr]`).

- Left column: Job description textarea + collapsible LinkedIn input
- Right column: Resume context card + "Analyze Match" CTA

**Auto-resume detection (RCL-06):** On mount, queries most recent resume analysis and pre-fills. Card shows `"Using: {filename}"` with checkmark or "No resume analysis found" with redirect CTA. Already implemented — no visual change.

### 6c. Pro User — Results (Tier-Shaped Output)

The results view renders the same `<RecruitingLensResultsView>` component but with tier-conditional rendering. The backend strips Elite-only fields (D-01/D-02), so the frontend renders what it receives plus explicit LockedSection placeholders for omitted sections.

**Sections rendered for Pro (in order):**

1. **Score hero** — `overallMatch` score ring + label + summary. Rendered identically to Elite. No change.

2. **Recruiter verdict** — Full text. Rendered identically to Elite. No change.

3. **Score breakdown** — Only `experienceAlignment` and `skillAlignment` sub-scores rendered. Each shows title + score badge + progress bar. **No rationale text** (the `rationale` field is stripped by the server shaper). The other 3 sub-scores (`impactStrength`, `keywordAndLanguageMatch`, `credibilityAndSeniorityFit`) are not rendered (data absent from response).

4. **Top gaps** — First 2 gaps rendered with title, severity badge, and `whyItMatters`. Within each rendered gap card, two inline `<LockedSection>` instances replace `howItShowsUp` and `fixPriority` fields. Remaining gaps (3+) rendered as `<LockedListItem>`.

5. **Resume edits** — First 2 edits rendered with original/rewritten and copy button. Remaining edits rendered as `<LockedListItem>`.

6. **LockedSection placeholders for omitted Elite sections** (6 total, rendered in this order):
   - Quick Strategic Fixes
   - Action Roadmap
   - Matched Keywords
   - Missing Keywords
   - LinkedIn Improvements
   - Strategic Advice (Final Advice)

7. **Bottom CTA** — "Analyze Another Job" button. Same as Elite.

### 6d. Elite User — Results (Full Output)

Renders the existing `<RecruitingLensResultsView>` with all sections. No changes to current Elite rendering. All fields present, all sub-scores show rationale, all gaps show `howItShowsUp` and `fixPriority`, all resume edits rendered.

### 6e. Loading State

Existing skeleton layout. No changes.

### 6f. Analyzing State

Existing `<UniversalAnalyzing>` overlay. No changes.

### 6g. Error State

Existing toast-based error display + "Retry Analysis" button. No changes.

---

## 7. Copywriting Contract

### 7a. LockedSection Placeholders (Pro Users Viewing Elite Content)

Each LockedSection appears as a card with title, blurred placeholder, teaser, and "Upgrade to Elite" CTA.

| Section | `title` prop | `teaser` prop |
|---------|-------------|---------------|
| Quick Strategic Fixes | `"Quick Strategic Fixes"` | `"Elite users get targeted quick wins to boost your match score immediately."` |
| Action Roadmap | `"Action Roadmap"` | `"Elite users get a step-by-step roadmap to close your gaps and land the interview."` |
| Matched Keywords | `"Matched Keywords"` | `"Elite users see exactly which keywords your resume already covers."` |
| Missing Keywords | `"Missing Keywords"` | `"Elite users see the critical keywords missing from your resume."` |
| LinkedIn Improvements | `"LinkedIn Improvements"` | `"Elite users get specific LinkedIn profile changes to strengthen this application."` |
| Strategic Advice | `"Strategic Advice"` | `"Elite users get a personalized apply-or-wait recommendation with the biggest score mover."` |

All LockedSection instances use `requiredTier="elite"` and default `ctaHref="/pricing"`.

### 7b. Inline LockedSection (Within Gap Cards)

For each rendered gap (first 2), the `howItShowsUp` and `fixPriority` fields are replaced:

| Field | `title` prop | `teaser` prop |
|-------|-------------|---------------|
| How It Shows Up | `"How It Shows Up"` | `"Upgrade to Elite for full gap analysis."` |
| Fix Priority | `"Fix Priority"` | `"Upgrade to Elite to see fix priority rankings."` |

Both use `requiredTier="elite"`.

### 7c. LockedListItem (Capped Arrays)

| Array | `label` prop | Visible items | Locked items example |
|-------|-------------|---------------|---------------------|
| `topGaps` | `"Gap"` | Items 1-2 | `"Gap 3 of 5 -- Locked"`, `"Gap 4 of 5 -- Locked"`, etc. |
| `resumeEdits` | `"Edit"` | Items 1-2 | `"Edit 3 of 7 -- Locked"`, `"Edit 4 of 7 -- Locked"`, etc. |

Total count is derived from a `_meta.totalGaps` / `_meta.totalEdits` field in the backend response (planner decides exact implementation), or falls back to visible count + locked count.

All LockedListItem instances use `requiredTier="elite"`.

### 7d. Primary CTA

| Element | Label | Icon |
|---------|-------|------|
| Analyze button | `"Analyze Match"` | `Target` (lucide) |
| Retry button | `"Retry Analysis"` | None |
| New analysis button | `"Analyze Another Job"` | `RefreshCw` (lucide) |

### 7e. Empty State

| Scenario | Copy |
|----------|------|
| No prior resume analysis | Title: `"No resume analysis found"` / Subtitle: `"Analyze your resume first to unlock Recruiting Lens."` / CTA: `"Analyze My Resume"` (navigates to `/onboarding`) |
| No results yet (initial page load) | Input form with placeholder: `"Paste the job description here..."` |

### 7f. Error State

| Error Type | Toast Message |
|------------|---------------|
| Rate limit | `"Too many requests. Try again in {N} min."` |
| Usage limit | `"Usage limit reached. Upgrade to continue."` |
| Invalid input | `"Invalid input. Please check your job description."` |
| Timeout | `"Analysis timed out. Please try again."` |
| Generic | `"Analysis failed. Please try again."` |

All errors use `toast.error()` from Sonner. Existing implementation is sufficient.

### 7g. Destructive Actions

No destructive actions in this phase. "Analyze Another Job" clears results but is non-destructive (no data loss, session-only cache cleared). No confirmation dialog needed.

---

## 8. Interaction Patterns

### 8a. Pro Results — Scroll Order

The results view renders sections in this fixed order. Pro users see gaps interspersed with LockedSection placeholders, creating a natural "preview then gate" rhythm:

1. Score hero (full)
2. Recruiter verdict (full)
3. Score breakdown (2 of 5 sub-scores, score-only)
4. Top gaps (2 real + N locked items) with inline field locks
5. Resume edits (2 real + N locked items)
6. 6x LockedSection placeholders (quick fixes, roadmap, matched keywords, missing keywords, linkedin improvements, strategic advice)
7. "Analyze Another Job" CTA

### 8b. LockedSection Animation

Uses existing LockedSection animation: fade-in on mount (`initial={{ opacity: 0 }} animate={{ opacity: 1 }}`), lock icon pulses with `scale: [1, 1.05, 1]` at 2s interval (respects `prefers-reduced-motion`).

### 8c. Auto-Resume Pre-fill

- On mount, frontend queries `analysis_results` for most recent `resume_analysis`
- If found: resume context card shows green checkmark + truncated filename
- If not found: card shows alert icon + "Analyze My Resume" CTA
- Pre-filled text is editable (D-09)
- No loading spinner for the query — the page-level skeleton covers initial load

### 8d. Score Ring Animation

Existing animated SVG circle. `strokeDashoffset` animates from full circumference to `circumference * (1 - score / 100)` over 1.2s with `easeOut`. No changes.

---

## 9. Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| < 768px (mobile) | Single column. Input form stacks vertically. Results stack vertically. Sub-score cards single column. Gap cards full width. LockedSection full width. |
| >= 768px (md) | Input form: 3fr/2fr grid. Results: sub-scores 2-column, roadmap 2-column. Gap cards full width. LockedSection full width. |
| >= 1024px (lg) | Sub-score cards 3-column grid (`sm:grid-cols-2 lg:grid-cols-3`). Everything else same as md. |

No new responsive breakpoints needed. All responsive behavior is inherited from existing class composition.

---

## 10. Accessibility

| Requirement | Implementation |
|-------------|---------------|
| LockedSection blur region | `aria-hidden="true"` on blurred placeholder div (already implemented) |
| Lock icon | `aria-hidden="true"` (decorative, already implemented) |
| Score ring | SVG with no `role` — decorative. Score value rendered as text `{score} / 100` which is screen-reader accessible |
| LockedListItem | Lock text `"Gap 3 of 5 -- Locked"` is visible and readable by screen readers |
| Color-only indicators | Severity badges include text label ("High", "Medium", "Low"), not color alone |
| Focus management | CTA buttons inside LockedSection and LockedListItem are focusable and keyboard-navigable via standard Button component |
| Reduced motion | LockedSection lock pulse respects `useReducedMotion()` (already implemented) |

---

## 11. Dark Mode

All components use semantic tokens (`--background`, `--foreground`, `--card`, `--border`, `--primary`, `--muted`, `--muted-foreground`) that automatically switch between dark and light modes via the `:root` / `.light` class definitions in `src/index.css`. No hardcoded colors.

Severity colors use Tailwind's dark variant: `dark:bg-red-900/30 dark:text-red-400`, `dark:bg-amber-900/30 dark:text-amber-400`, `dark:bg-emerald-900/30 dark:text-emerald-400`.

---

## 12. Contract Summary

| Dimension | Status |
|-----------|--------|
| Spacing | 8-point scale, 2 exceptions declared (`p-5`, `gap-3` — pre-existing in RecruitingLens.tsx, not introduced by this phase) |
| Typography | 4 sizes (28/36, 18, 14, 12), 2 weights (400, 600) |
| Color | 60/30/10 split using existing HSL tokens. Accent reserved for CTAs and lock icon |
| Copywriting | 6 LockedSection teasers, 2 inline field locks, 2 LockedListItem labels, 6 error messages |
| Components | 0 new, 10 existing consumed |
| States | 7 view states documented (free gate, pro input, pro results, elite results, loading, analyzing, error) |
| Registry | shadcn official only, no third-party |

---

*Phase: 18-recruiting-lens-gating*
*UI-SPEC created: 2026-04-17*
