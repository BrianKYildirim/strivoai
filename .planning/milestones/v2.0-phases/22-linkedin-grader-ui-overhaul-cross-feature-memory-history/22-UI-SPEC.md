---
phase: 22
slug: linkedin-grader-ui-overhaul-cross-feature-memory-history
status: draft
shadcn_initialized: true
preset: existing (components.json — slate baseColor, CSS vars, "default" style)
created: 2026-04-19
---

# Phase 22 — UI Design Contract

> Visual and interaction contract for the LinkedIn Grader UI overhaul, Career Compass cross-feature memory badge, cross-page "Scan New" header parity, and AnalysisHistory routing fixes. This phase **reuses the existing design system** (shadcn/ui + Tailwind + CSS vars declared in `src/index.css` and `tailwind.config.ts`). No new tokens, no new primitives. Every decision below was pre-populated from CONTEXT.md (D-01 through D-25) or detected from the existing codebase.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (already initialized — `components.json` present) |
| Preset | Existing project preset — style: `default`, baseColor: `slate`, cssVariables: `true`, prefix: none |
| Component library | Radix UI primitives wrapped by shadcn/ui in `src/components/ui/*` |
| Icon library | `lucide-react` (already in use across all 5 feature pages) |
| Font | `Inter` + system fallbacks (declared in `tailwind.config.ts` fontFamily.sans) |

**No additions.** Any new visual element in this phase must compose existing primitives (`Card`, `Badge`, `Button`, `BlurredLockCard`) and existing utility classes. No new npm packages, no new CSS variables, no new registry blocks.

---

## Spacing Scale

The project uses Tailwind's default 4px-based scale. This phase's **new** slots map to the standard {4, 8, 16, 24, 32, 48, 64} set:

| Token | Tailwind class | Value | Usage in this phase (new work) |
|-------|----------------|-------|--------------------------------|
| xs | `gap-1`, `mb-1` | 4px | Icon+label gaps inside badges and +X pts pills; compact label-to-value gap |
| sm | `gap-2`, `mb-2`, `p-2`, `space-y-2` | 8px | Inline chip spacing, compact card internals, rescan button row gap, Current/Suggested grid gaps in any **new** markup |
| md | `gap-4`, `p-4`, `mb-4`, `space-y-4` | 16px | Default card padding for any **new** card composition, locked skeleton stack spacing, header-bar `mb-4` vertical separation |
| lg | `mb-6`, `pt-6` | 24px | **Top padding for all 4 results containers (D-06)**, header-bar to results-body separation |
| xl | `mb-8`, `space-y-8`, `pb-12` | 32–48px | Page bottom padding, section separation |

**Locked container rule (D-06):**
`LinkedInGrader.tsx:386` currently `pt-24` → change to **`pt-6`**. Keep `container mx-auto px-4 pt-6 pb-12 max-w-5xl` as the canonical results-page container (already used by `Results.tsx:706` and `CareerCompass.tsx:572`). `RecruitingLens.tsx:465` currently uses `pt-24 pb-16` — D-10 applies the header-bar pattern here; executor should align top padding to `pt-6` during D-10 implementation to match the parity goal, but this is a D-10-scoped change (not D-06).

### Exceptions (inherited, not changed in this phase)

Per **D-24** (byte-identical Pro/Elite DOM) and **D-07** (verified side-by-side parity with `Results.tsx`), the locked-skeleton cards reuse the existing real-topFix card markup verbatim so the DOM tree is identical between Free (blurred wrapper) and Pro (unblurred) for that region. The inner card already uses non-standard-scale spacing that must be preserved exactly:

| Class | Value | File:line | Rationale |
|-------|-------|-----------|-----------|
| `p-5` | 20px | `LinkedInGrader.tsx:976` | Inherited card interior padding on the real topFix card; locked skeletons must mirror it (D-24) |
| `p-3` | 12px | `LinkedInGrader.tsx:987,994` | Inherited Current/Suggested cell padding on the real topFix card; locked skeletons must mirror it (D-24) |
| `gap-3`, `mb-3` | 12px | `LinkedInGrader.tsx:977,985` | Inherited Current/Suggested grid gap and internal row spacing on the real topFix card; locked skeletons must mirror them (D-24) |

All three are direct inheritance from pre-existing code. **No new occurrences of 6px, 12px, or 20px values are introduced by this phase.** The `mb-1.5` (6px) slot that appeared in an earlier draft of this spec is withdrawn — any badge internal label-to-value spacing in **new** markup (e.g. the cross-feature memory badge) uses `mb-1` (4px) or no margin. If the executor needs spacing inside a newly-authored badge beyond the icon gap, use `gap-1` (4px) on a flex container rather than a vertical margin.

---

## Typography

Uses `Inter` (declared globally). This phase declares a strict **four-size / two-weight** ladder. Every text role in this phase's new work maps to one of the four size slots below; eyebrow/uppercase labels are rendered by combining `text-xs` with `uppercase tracking-wider`, not by introducing a separate 10px size.

| Role | Tailwind class | Size | Weight | Usage in this phase |
|------|----------------|------|--------|---------------------|
| Caption | `text-xs` (with `uppercase tracking-wider` when used as an eyebrow) | 12px | 400 regular / 600 semibold (eyebrow) | Fine print, "Why this works" body, badge timestamps, locked skeleton whyItWorks line, cross-feature memory badge copy, eyebrow labels ("Current", "Suggested fix", "Top Priority", "Pro plan required") — eyebrows use `text-xs uppercase tracking-wider font-semibold` |
| Body | `text-sm` | 14px | 400 regular / 600 semibold | Card body text, locked skeleton Current/Suggested placeholder text, "Used your LinkedIn analysis from {date}" pill inner text, Scan-New button label |
| Subheading | `text-base` | 16px | 600 semibold | Fix card titles (`fix.title`), locked skeleton titles, Section Breakdown item labels |
| Heading | `text-2xl` | 24px | 600 semibold | Page headings — "Your LinkedIn Analysis", "Resume Screening Report", "Your Career Compass", "Your Recruiting Lens Match" AND section headings — "Ready-to-Paste Improvements", "Section-by-Section Breakdown" (promoted from `text-xl` to `text-2xl` so the ladder stays at four sizes; section headings render identically to page headings within a results document) |

**Declared weights (two only):** `font-normal` (400) and `font-semibold` (600). Any pre-existing `font-bold` (700) in inherited code (e.g. `text-2xl font-bold` in existing header rows) is treated as a visual variant rendered via `font-semibold` going forward in any **new** markup authored in this phase. Per the checker note, 600/700 are already used interchangeably in existing code; this phase standardizes new work on 600. Inherited `font-bold` class tokens on pre-existing lines are not retroactively changed — they are out of scope for this phase's visual authoring (same principle as the spacing Exceptions row: don't mutate pre-existing DOM classes on unrelated lines, only normalize **new** markup).

Line heights: Tailwind defaults (`leading-relaxed` = 1.625 for long paragraphs; default 1.5 for body; `leading-none` for score numbers — inherited from existing pages, unchanged).

---

## Color

**No new colors.** This phase consumes the existing theme tokens. The accent (coral / primary 357) is already the site's established accent per `tailwind.config.ts` and `index.css` (lines 22, 69). The 60/30/10 split is documented below using the actual current semantic tokens.

| Role | Token / class | Usage |
|------|---------------|-------|
| Dominant (60%) | `bg-background` (`hsl(var(--background))`) | Page background, primary surface |
| Secondary (30%) | `bg-card` / `bg-muted` / `bg-muted/50` | Card surfaces, Current-text preview box, progress-bar track |
| Accent (10%) — coral/rose primary | `text-primary`, `bg-primary/5`, `bg-primary/10`, `border-primary/20`, `ring-primary` | **See reserved-for list below** |
| Destructive | `text-destructive` / `bg-red-500` (used in existing score bars) | Score bars for sections scoring <55% (unchanged from current) |

**Accent reserved for (explicit list — do not broaden):**
1. The "Top Priority" banner gradient on topFix #1 (`bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400`) — unchanged, inherited from `LinkedInGrader.tsx:966`.
2. The `BlurredLockCard` CTA button (coral linear gradient at `BlurredLockCard.tsx:66-70`) — unchanged, inherited.
3. The `BlurredLockCard` centered lock icon glow (coral 357° HSL) — unchanged, inherited.
4. The "Used your LinkedIn analysis from {date}" cross-feature memory badge (D-14) — **styled as a neutral/secondary badge, NOT coral.** Rationale: coral is reserved for upgrade gravity; an informational data-reuse signal must read as neutral trust, not as an upsell. See Copywriting Contract row "Cross-feature memory badge" for exact classes.
5. Section-header icons (`text-primary` on `Target`, `Sparkles`) — unchanged, inherited.
6. "Upgrade to Pro" CTA divider and button at `LinkedInGrader.tsx:929-944` — unchanged, inherited.

Semantic color tokens used as-is (no redefinitions): `bg-emerald-50`, `dark:bg-emerald-950/20`, `border-emerald-200`, `text-emerald-600` for the Suggested-fix treatment; `bg-amber-500`, `bg-red-500` for progress-bar severity steps; `text-muted-foreground` for secondary body copy.

---

## Copywriting Contract

All copy is pre-specified so the executor does not improvise. Planner may tune the 4 locked-skeleton placeholder strings per D-02 Discretion but **must** stay within the section-labeled, non-misleading constraint.

| Element | Copy | Source |
|---------|------|--------|
| LinkedIn Grader — section heading above locked fixes | `Ready-to-Paste Improvements` | Existing at `LinkedInGrader.tsx:953` — unchanged |
| LinkedIn Grader — locked skeleton #1 title (after top-priority) | `Experience Improvement` | D-02 |
| LinkedIn Grader — locked skeleton #2 title | `Skills Improvement` | D-02 |
| LinkedIn Grader — locked skeleton #3 title | `About Section Refinement` | D-02 |
| LinkedIn Grader — locked skeleton #4 title | `Headline Refinement #2` | D-02 |
| Locked skeleton +X pts badge (each) | `+5 pts`, `+4 pts`, `+3 pts`, `+3 pts` (descending values; planner may tune within 2–8 range, must stay plausible and non-misleading per D-02) | Discretion |
| Locked skeleton "Current" placeholder | `Your current section copy will appear here after upgrade.` | Discretion — section-labeled generic, not Claude-generated |
| Locked skeleton "Suggested fix" placeholder | `A recruiter-grade rewrite tailored to your profile will appear here.` | Discretion — generic, teaser |
| Locked skeleton "Why this works" line | `Unlock to see the full rationale and impact this edit has on recruiters.` | Discretion — generic, teaser |
| Locked skeleton CTA (from `BlurredLockCard` overlay) | `Upgrade to unlock your full potential` | Existing default in `BlurredLockCard.tsx:18` — unchanged |
| Locked skeleton tier hint (small uppercase under lock icon) | `Pro plan required` | Existing `BlurredLockCard` `tier="pro"` branch — pass `tier="pro"` prop |
| Locked skeleton — click target behavior | Clicking any part of the card navigates to `/pricing` | D-04 |
| Scan-New header-bar — LinkedIn Grader (existing) | Title `Your LinkedIn Analysis` + button `Scan New Profile` with `RefreshCw` icon | Unchanged from `LinkedInGrader.tsx:632-653` |
| Scan-New header-bar — Results.tsx (D-10 new) | Title `Resume Screening Report` + button `Analyze New Resume` with `RefreshCw` icon | D-10 parity; title is existing (`Results.tsx:726`), button is new — verb+noun, present tense |
| Scan-New header-bar — CareerCompass (D-10 new) | Title `Your Career Compass` + button `Start New Analysis` with `RefreshCw` icon | D-10 parity |
| Scan-New header-bar — RecruitingLens (D-10 new) | Title `Your Recruiting Lens Match` + button `Run New Match` with `RefreshCw` icon | D-10 parity |
| Scan-New button variant (all 4 pages) | `<Button variant="outline" className="gap-2">` with `<RefreshCw className="h-4 w-4" />` preceding label | Mirrors `LinkedInGrader.tsx:639-653` |
| Cross-feature memory badge (D-14) | `Used your LinkedIn analysis from {MMM d, yyyy}` — e.g. `Used your LinkedIn analysis from Apr 12, 2026` | D-14; date format via `date-fns` `format(new Date(linkedinGradeDate), 'MMM d, yyyy')` (library already in `package.json`) |
| Cross-feature memory badge — render condition | Render only when `reusedLinkedinGrade === true` in the `analyze-career` response body (D-15). Do NOT render when the response omits the flag. | D-14, D-15 |
| Cross-feature memory badge — placement | In the CareerCompass results header row, same horizontal band as the page title (left-aligned next to the `h2`, same pattern as `isFromCache` Badge at `LinkedInGrader.tsx:634-637`) | Inferred from existing `isFromCache` badge pattern |
| Cross-feature memory badge — interaction | None. Informational only. No click handler, no tooltip, no hover state beyond Tailwind default. | D-14 |
| Missing-prior fallback — resume present, LinkedIn absent (D-16) | Heading `Add your LinkedIn analysis?` / Body `We have your resume analysis but no LinkedIn analysis yet — add LinkedIn now or continue without?` / Primary CTA `Add LinkedIn analysis` → route to `/linkedin-grader` / Secondary CTA `Continue without` → proceed with existing resume-only flow | D-16; reuse the existing `missingPrior` Card pattern at `CareerCompass.tsx:575-595` styling |
| AnalysisHistory — empty state | `No activity yet` (heading) + existing body copy at `AnalysisHistory.tsx:257-265` — **unchanged** | D-23 |
| AnalysisHistory — click routing (D-21) — no visible copy change | Behavior contract only: entries route to `/results/{resume_id}`, `/linkedin-grader?id={id}`, `/career-compass?id={id}`, `/recruiting-lens?id={id}`, `/interview-prep?id={id}` | D-21 |
| Upgrade divider between Section Breakdown and locked Pro sections | `Upgrade to unlock 3 more section analyses` + `Upgrade to Pro for full LinkedIn analysis` button | Existing at `LinkedInGrader.tsx:929-944` — unchanged |

**Destructive confirmations:** none in this phase. No delete actions, no data-loss operations.

**Error state copy:** this phase introduces no new error surfaces. Existing toast patterns (via `sonner`) and existing error banners (e.g. `missingPrior` card on CareerCompass) are reused verbatim.

---

## Interaction Contract (phase-specific)

Beyond copywriting, these interaction details are locked so the executor has no ambiguity:

1. **Locked skeleton cards (D-01, D-02, D-04)**
   - Quantity: exactly 4, rendered unconditionally on `subscriptionTier === 'free'` regardless of `topFixes` length.
   - DOM order within Ready-to-Paste Improvements: `[real topFix #0 (unlocked)] → [locked #1 Experience] → [locked #2 Skills] → [locked #3 About] → [locked #4 Headline #2]`.
   - Each locked card wraps the same inner `Card` markup used by real topFix cards (header with title+pts badge, Current/Suggested grid, "Why this works" line) inside `<BlurredLockCard tier="pro">…</BlurredLockCard>`. The inner card's inherited spacing (`p-5`, `p-3`, `gap-3`, `mb-3`) is preserved verbatim per the Spacing Exceptions row.
   - Framer Motion reveal: preserve the existing `initial={{ opacity: 0, x: -15 }}, animate={{ opacity: 1, x: 0 }}, transition={{ delay: 0.4 + i * 0.1 }}` cadence from `LinkedInGrader.tsx:957-961` so locked cards animate in as siblings of the unlocked one.
   - Click target: anywhere on the blurred region → navigate to `/pricing` (delegated to `BlurredLockCard` default). The existing bottom "Upgrade to Pro" CTA at `LinkedInGrader.tsx:929-944` stays as the primary explicit CTA.

2. **Section Breakdown reorder (D-08, D-09)**
   - At render time, reorder `result.sectionBreakdown` so the section whose name matches `/profile completeness/i` is first. Stable-keep the relative order of the remaining sections. If zero matches, render as-is. If multiple match, take the first.
   - Do NOT mutate `result.sectionBreakdown`; build a new array inline for the `.map()`.

3. **Scan-New header-bar pattern (D-10) — canonical structure**
   Reference: `LinkedInGrader.tsx:629-654`. Apply identically to `Results.tsx`, `CareerCompass.tsx`, `RecruitingLens.tsx`:
   ```
   <div className="flex items-center justify-between mb-6">
     <div className="flex items-center gap-2">
       <h2 className="text-2xl font-semibold">{TITLE}</h2>
       {isFromCache && created_at && (
         <Badge variant="secondary" className="text-xs">
           {formatDate(created_at)}
         </Badge>
       )}
     </div>
     <Button variant="outline" onClick={onReset} className="gap-2">
       <RefreshCw className="h-4 w-4" />
       {BUTTON_LABEL}
     </Button>
   </div>
   ```
   On mobile (`<768px`), the row may wrap — no special stacking rules required beyond Tailwind defaults. `gap-2` (8px) and `mb-6` (24px) both land on the standard scale; the `h2` uses `text-2xl font-semibold` per the two-weight typography rule for new markup.

4. **Cross-feature memory badge (D-14) — concrete markup**
   ```tsx
   {analysis.reusedLinkedinGrade && analysis.linkedinGradeDate && (
     <Badge variant="secondary" className="text-xs gap-1">
       <Linkedin className="h-3 w-3" />
       Used your LinkedIn analysis from {format(new Date(analysis.linkedinGradeDate), 'MMM d, yyyy')}
     </Badge>
   )}
   ```
   Placement: inside the CareerCompass results header row (same `flex items-center gap-2` container as the title), immediately after the `h2`. No tooltip. Icon-to-label gap uses `gap-1` (4px) on the standard scale.

5. **Responsive verification (D-07)** — mandatory per CONTEXT.md. The executor runs `npm run dev`, opens both Free-tier and Pro-tier sessions, and visually compares LinkedInGrader against `Results.tsx` at 375px / 768px / 1280px viewports in both light and dark themes. Acceptance: container max-width, top padding, card gutters, and typographic rhythm are indistinguishable across the two pages.

6. **Pro/Elite byte-identical rendering (D-24)** — every new conditional must be gated on `subscriptionTier === 'free'`. Paid-tier DOM output for the topFixes and Section Breakdown regions must be bit-for-bit identical to pre-phase output (locked cards and reorder must not render for Pro/Elite; the existing Profile-Completeness-first reorder is rendered universally — it is data-side reordering, not visual gating, and therefore applies to all tiers). This is also the operational rationale for the Spacing Exceptions row: inherited card-interior spacing (`p-5`, `p-3`, `gap-3`, `mb-3`) is preserved verbatim so the locked-skeleton DOM matches the real topFix DOM structurally.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `card`, `badge`, `button`, `skeleton`, `tooltip` — all already installed in `src/components/ui/*`. No new installs in this phase. | not required |
| Project-internal primitive | `BlurredLockCard` (`src/components/BlurredLockCard.tsx`) — reused as-is, no modifications | not required (first-party) |
| Third-party registries | none declared | not applicable |

**Declared by user:** no third-party blocks. No `npx shadcn view` vetting required. If the executor discovers a missing UI primitive mid-implementation, they must stop and escalate rather than pull from a new registry.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS — every locked skeleton string, header-bar button label, and cross-feature badge string is specified verbatim above
- [ ] Dimension 2 Visuals: PASS — composes existing `Card`, `Badge`, `Button`, `BlurredLockCard` only; no new primitives
- [ ] Dimension 3 Color: PASS — reuses existing CSS-var tokens; accent reserved list is explicit; memory badge is `variant="secondary"` (neutral)
- [ ] Dimension 4 Typography: PASS — exactly four size slots (12 / 14 / 16 / 24) and exactly two weights (400 / 600); eyebrows rendered via `text-xs uppercase tracking-wider font-semibold` rather than a separate 10px size
- [ ] Dimension 5 Spacing: PASS — all **new** spacing values are multiples of 4 from the standard set {4, 8, 16, 24, 32, 48, 64}; `pt-6` locked as the results-container top padding (D-06); inherited `p-5` / `p-3` / `gap-3` / `mb-3` declared explicitly in the Exceptions row with file:line rationale tied to D-24 DOM parity
- [ ] Dimension 6 Registry Safety: PASS — no third-party registries, no new installs

**Approval:** pending
