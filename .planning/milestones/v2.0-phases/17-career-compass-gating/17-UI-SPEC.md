---
phase: 17
slug: career-compass-gating
status: approved
reviewed_at: 2026-04-17
shadcn_initialized: true
preset: existing (project-configured shadcn/ui + Radix + Tailwind)
created: 2026-04-17
---

# Phase 17 -- UI Design Contract

> Visual and interaction contract for tier-gating the Career Compass results page. Phase 17 is primarily backend work (prompt extraction, tier-aware `analyze-career`, `applyTierShape` for career). The frontend surface changes are defensive: handle missing/truncated fields gracefully and render `<LockedSection>` / `<LockedListItem>` where the server omits data.

Phase 17 does NOT ship rich Elite presentation (salary charts, application strategy dashboards) -- that belongs to Phase 20. This contract covers only the structural adaptations needed to reflect tier-shaped output in the existing `CareerCompass.tsx` page.

**Primary focal point:** The overall readiness score card stat at the top of results -- this is the first element the user sees after analysis completes and anchors the tier-gated content hierarchy below it.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (already initialized in repo) |
| Preset | not applicable -- reuse existing `tailwind.config.ts` + `src/components/ui/*` |
| Component library | Radix UI primitives via shadcn/ui (`Card`, `Button`, `Badge`, `Tabs`, `Progress`, `Tooltip`) |
| Icon library | lucide-react 0.462.0 (existing icons in CareerCompass: `Compass`, `Target`, `BookOpen`, `Award`, `Briefcase`, `DollarSign`, `Clock`, `Sparkles`, `Zap`, `Lock`, `Star`) |
| Font | Inter (system fallback `-apple-system, system-ui, sans-serif`) -- inherited from `tailwind.config.ts` `fontFamily.sans` |
| Animation | framer-motion 12.23.26 -- only used via `<LockedSection>` mount fade-in and lock-icon pulse (Phase 14 contract) |
| Theme | next-themes light/dark -- all tokens resolve in both themes via HSL CSS variables |

Source of truth: `CLAUDE.md` Technology Stack, `tailwind.config.ts`, `14-UI-SPEC.md`.

---

## Component Inventory (Phase 17 surface area)

| Component | Path | Change Type | Purpose |
|-----------|------|-------------|---------|
| `CareerCompass` | `src/pages/CareerCompass.tsx` | MODIFY | Handle tier-shaped output; insert `<LockedSection>` and `<LockedListItem>` for gated sections; adjust tab visibility by tier |
| `<LockedSection>` | `src/components/LockedSection.tsx` | CONSUME (no changes) | Block-level lock for Pro/Elite-only sections absent from Free/Pro responses |
| `<LockedListItem>` | `src/components/LockedListItem.tsx` | CONSUME (no changes) | Numbered list slot lock for truncated arrays (career fields, surprise fits, roadmap phases) |
| `<EliteFeatureGate>` | `src/components/EliteFeatureGate.tsx` | CONSUME (no changes) | Whole-tab lock for Compensation Intelligence and Smart Application Strategy tabs |
| `<CompensationIntelligence>` | `src/components/CompensationIntelligence.tsx` | NO CHANGE | Rendered inside `<EliteFeatureGate>` (already conditionally rendered for elite) |
| `<SmartApplicationStrategy>` | `src/components/SmartApplicationStrategy.tsx` | NO CHANGE | Rendered inside `<EliteFeatureGate>` (already conditionally rendered for elite) |

No new components are created in Phase 17. All UI primitives were shipped in Phase 14.

---

## Spacing Scale

Inherits Tailwind defaults (4px base unit) and the Phase 14 contract. CareerCompass already uses these tokens:

| Token | Value | Tailwind class | Usage in Phase 17 changes |
|-------|-------|----------------|---------------------------|
| sm | 8px | `gap-2`, `p-2` | `<LockedListItem>` inline spacing |
| md | 16px | `gap-4`, `p-4` | `<LockedSection>` body padding, card padding inside gated sections |
| lg | 24px | `gap-6`, `p-6` | Outer card padding (existing pattern in CareerCompass), `<LockedSection>` outer padding |
| xl | 32px | `gap-8` | Tab content spacing (existing `mt-6` pattern + section gap) |

No new spacing tokens are introduced. All values are multiples of 4.

**Exceptions:** None beyond Phase 14 contract (CTA button minimum 44x44px touch target on mobile).

---

## Typography

Phase 17 reuses the existing CareerCompass typography. No new sizes or weights introduced. This phase declares 2 weights only: 400 (regular) and 700 (bold).

| Role | Size | Weight | Line Height | Tailwind | Usage |
|------|------|--------|-------------|----------|-------|
| Body / teaser | 16px | 400 (regular) | 1.5 | `text-base font-normal leading-normal` | `<LockedSection>` teaser text, section descriptions, `<LockedListItem>` lock labels, CTA button text, badge text |
| Section heading | 20px | 700 (bold) | 1.2 | `text-xl font-bold` | Existing section headings ("Best-Fit Role Families", "Surprise Fits") -- unchanged |
| Card stat | 28px | 700 (bold) | 1.2 | `text-2xl font-bold` | Score display (existing pattern) -- unchanged |

Note: `<LockedSection>`'s own internal heading uses `font-semibold` (600) as governed by the Phase 14 UI-SPEC contract. That weight is not re-declared in this spec -- it is owned by the Phase 14 component contract and remains unchanged here.

---

## Color

Strict semantic tokens only. No hardcoded hex values inside new component code. Inherits the full Phase 14 color contract.

| Role | Token | Tailwind | Usage in Phase 17 |
|------|-------|----------|-------------------|
| Dominant (60%) | `--background` | `bg-background text-foreground` | Page background, tab content areas |
| Secondary (30%) | `--card`, `--muted`, `--secondary` | `bg-card`, `bg-muted/40`, `bg-secondary/30` | Section cards, readiness bars, `<LockedSection>` body container |
| Accent (10%) | `--primary` | `bg-primary text-primary-foreground` | Upgrade CTA buttons inside `<LockedSection>`, lock icon backplate, tier badges |
| Muted text | `--muted-foreground` | `text-muted-foreground` | Teaser sentences, locked-list labels, secondary descriptions |
| Destructive | `--destructive` | (not used in Phase 17) | No destructive actions in this phase |

**Accent (`--primary`) is reserved for these specific elements ONLY:**

1. CTA `<Button>` inside `<LockedSection>` instances
2. Lock-icon backplate (`bg-primary/15` tint) inside `<LockedSection>`
3. Tier badge ("PRO EXCLUSIVE" / "ELITE EXCLUSIVE") inside `<LockedSection>`
4. Existing uses (tab highlights, score indicators) -- unchanged

**Hardcoded color exception (existing, not new):** Score colors (`#10b981` green, `#f59e0b` amber) in readiness progress bars are already hardcoded in the current CareerCompass page. Phase 17 does not introduce or modify these.

---

## Interaction Contract

### Tier-Aware Tab Layout

The tab bar at the bottom of the results summary adapts to the user's tier:

| Tier | Visible Tabs | Tab Count | Grid Class |
|------|-------------|-----------|------------|
| Free | Fields, Roles, Readiness, Roadmap | 4 | `grid-cols-4` |
| Pro | Fields, Roles, Readiness, Roadmap | 4 | `grid-cols-4` |
| Elite | Fields, Roles, Readiness, Roadmap, Salary, Strategy | 6 | `grid-cols-6` |

**Rule:** Compensation and Strategy tabs are rendered ONLY when `subscriptionTier === 'elite'`. This matches the current behavior (lines 1166-1177 of CareerCompass.tsx). For Free/Pro users, these tabs do not exist in the DOM -- there is no locked-tab placeholder. The `<LockedSection>` pattern is used WITHIN visible tabs for section-level gating, not at the tab level.

### Free Tier Result Sections

When the server returns Free-shaped output (CC-01/CC-02), the following sections adapt:

| Section | Free Behavior | Lock Treatment |
|---------|--------------|----------------|
| Career DNA card | Full `careerDNA` text rendered | None -- fully visible |
| Best-Fit Role Families | Only 1 entry from server; render that entry, then show `<LockedListItem>` placeholders for positions 2-5 | `<LockedListItem label="Career Field" index={2..5} total={5} requiredTier="pro" />` |
| Surprise Fits | Only 1 entry from server; render that entry, then show `<LockedListItem>` placeholders for positions 2-4 | `<LockedListItem label="Surprise Fit" index={2..4} total={4} requiredTier="pro" />` |
| Readiness tab (scorebox) | `overallScore`, `targetRole`, `readinessVerdict` rendered | None -- scorebox visible |
| Readiness tab (detail) | `skillAssessments`, `strengths`, `gaps` arrays absent from response | `<LockedSection title="Skill Assessments" teaser="Pro unlocks detailed skill-by-skill breakdown with industry benchmarks." requiredTier="pro" />` |
| Roles tab (detail) | Role entries present but `skillGaps` array absent | `<LockedSection title="Skill Gap Analysis" teaser="Pro unlocks actionable skill gaps for each target role." requiredTier="pro" />` |
| Roadmap tab | Only first 2 phases (Foundation + Build) per role | After rendering available phases, show `<LockedListItem label="Roadmap Phase" index={3..5} total={5} requiredTier="pro" />` for missing phases |
| Fields tab (full detail) | Only 1 career field entry, all detail visible for that one entry | Remaining field slots use `<LockedListItem>` as above |

### Pro Tier Result Sections

| Section | Pro Behavior | Lock Treatment |
|---------|-------------|----------------|
| Career DNA card | Full | None |
| Best-Fit Role Families | All entries from server (no slicing) | None |
| Surprise Fits | All entries from server | None |
| Readiness tab | Full `roleReadinessBreakdown` including `skillAssessments`, `strengths`, `gaps` | None |
| Roles tab | Full detail including `skillGaps` | None |
| Roadmap tab | All 5 phases per role | None |
| Fields tab | All career fields with full detail | None |
| Salary Progression | Rendered inline within Readiness or Roles tab if present | None (data present for Pro) |
| Compensation Intelligence | Data NOT returned by server | Tab not shown (no lock placeholder) |
| Smart Application Strategy | Data NOT returned by server | Tab not shown (no lock placeholder) |

### Elite Tier Result Sections

| Section | Elite Behavior |
|---------|---------------|
| All Pro sections | Fully rendered |
| Compensation Intelligence tab | Rendered via existing `<CompensationIntelligence>` component inside the "Salary" tab |
| Smart Application Strategy tab | Rendered via existing `<SmartApplicationStrategy>` component inside the "Strategy" tab |

### Defensive Rendering Pattern

Every section that renders optional/tier-dependent data MUST use optional chaining and length checks before rendering. The pattern is:

```
{analysis.someField && analysis.someField.length > 0 && (
  <SectionContent ... />
)}
```

When a section's data is absent AND the user's tier is below the required tier for that data, render the corresponding `<LockedSection>` or `<LockedListItem>`. When data is absent but the user IS the correct tier (edge case: API failure or partial response), render nothing -- do not show a lock for content the user should have access to.

**Decision rule for lock vs. empty:**
- `tier === 'free' && !data` --> render `<LockedSection requiredTier="pro">`
- `tier === 'pro' && !data && isEliteOnlyField` --> render `<LockedSection requiredTier="elite">`
- `tier === 'pro' && !data && isProField` --> render nothing (data should be present; defensive silence)
- `tier === 'elite' && !data` --> render nothing (all data should be present)

### Accessibility

- All `<LockedSection>` and `<LockedListItem>` instances inherit the Phase 14 accessibility contract (blurred body `aria-hidden="true"`, lock icon `aria-hidden="true"`, CTA has accessible name, focus order: header -> teaser -> CTA).
- Tab navigation remains keyboard-accessible via Radix `<Tabs>`. The tab count change between tiers does not affect keyboard behavior.
- Score colors (green/amber) already have text labels alongside them ("ready", percentage number) so colorblind users are not impacted.

### Animation

No new animations in Phase 17. `<LockedSection>` uses its Phase 14 mount fade-in (200ms) and lock-icon scale pulse (2s). `<LockedListItem>` is static. `prefers-reduced-motion` respected via `<LockedSection>`'s internal `useReducedMotion()` hook.

---

## Copywriting Contract

### Locked Section Teasers (Free tier viewing Pro-locked content)

| Section | `title` Prop | `teaser` Prop | `requiredTier` |
|---------|-------------|---------------|----------------|
| Skill Assessments (Readiness tab) | `Skill Assessments` | `Pro unlocks detailed skill-by-skill breakdown with industry benchmarks.` | `pro` |
| Skill Gaps (Roles tab) | `Skill Gap Analysis` | `Pro unlocks actionable skill gaps and qualification steps for each role.` | `pro` |
| Resume Improvements (if rendered) | `Resume Improvements` | `Pro unlocks targeted resume changes for your career transition.` | `pro` |
| Salary Progression (if rendered as locked for free) | `Salary Progression` | `Pro unlocks salary growth projections across your career path.` | `pro` |

### Locked List Item Labels (Free tier viewing truncated arrays)

| Array | `label` Prop | Pattern | `requiredTier` |
|-------|-------------|---------|----------------|
| Career Fields (positions 2-5) | `Career Field` | `Career Field 2 of 5 -- Locked` | `pro` |
| Surprise Fits (positions 2-4) | `Surprise Fit` | `Surprise Fit 2 of 4 -- Locked` | `pro` |
| Roadmap Phases (positions 3-5) | `Roadmap Phase` | `Roadmap Phase 3 of 5 -- Locked` | `pro` |

Note: The total counts (5 career fields, 4 surprise fits, 5 roadmap phases) are the expected maximum counts from a full Pro/Elite response. If the server returns fewer, use the actual expected count from the response metadata or fall back to these defaults.

### Existing Copy (unchanged)

| Element | Current Copy | Status |
|---------|-------------|--------|
| Analyze button | `Analyze My Career Path` | Unchanged |
| Multi-role compare CTA | `Compare {N} Roles` | Unchanged |
| Loading state | Managed by `<UniversalAnalyzing>` | Unchanged |
| Error toast | `Failed to analyze career. Please try again.` | Unchanged |
| Cache banner | `Loaded from your previous analysis` | Unchanged |

### Empty State

Career Compass does not have a traditional empty state -- the page starts with the input form. When no analysis has been run, the form is displayed. When an analysis has been cached, it loads automatically. No changes needed.

### Error State

Existing error handling via `toast.error()` is unchanged. Merit-related errors (insufficient balance) are handled by the `withMerits` gateway on the backend, which returns a structured 402 response. The frontend's existing `AiCreditsContext.markCreditsDepletedFromError()` flow handles this -- no new error UI in Phase 17.

### Destructive Actions

None. Phase 17 has zero destructive actions. Re-running an analysis consumes Merits but is not destructive (the old cached result is replaced, which is the expected behavior).

### Voice Rules (inherited from Phase 14)

- Use imperative for CTAs ("Upgrade to Pro", not "Click here to upgrade").
- Teasers name the tier explicitly ("Pro unlocks...", not "Unlock by upgrading...").
- Never use the word "premium" -- say "Pro" or "Elite" by name.
- Never apologize for locked content. Frame as opportunity, not denial.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `Card`, `Button`, `Badge`, `Tabs`, `Progress`, `Tooltip`, `Dialog`, `Checkbox`, `Select`, `Input`, `Label` (all pre-installed in `src/components/ui/`) | not required -- already vetted in repo |
| lucide-react | `Lock` (new import to CareerCompass.tsx), all other icons already imported | not required -- already in `package.json` |
| framer-motion | (consumed transitively via `<LockedSection>`) | not required -- already in `package.json` |
| Third-party shadcn registries | none declared | not applicable |

No new dependencies added in Phase 17. No `npx shadcn add` calls required. The only new import to `CareerCompass.tsx` is `LockedSection` from `@/components/LockedSection` and `LockedListItem` from `@/components/LockedListItem` (both shipped in Phase 14).

---

## Testing Hooks

Phase 17 frontend changes should be verifiable via the existing Phase 14 test selectors on the locked primitives:

| Element | Selector | Assertion |
|---------|----------|-----------|
| `<LockedSection>` for skill assessments | `data-testid="locked-section"` + `data-required-tier="pro"` | Present when `tier === 'free'`, absent when `tier === 'pro'` or `tier === 'elite'` |
| `<LockedListItem>` for career fields | `data-testid="locked-list-item"` + `data-index="2"` | Present when `tier === 'free'` (positions 2-5), absent when `tier === 'pro'` or `tier === 'elite'` |
| Career DNA section | Existing DOM structure (no new test IDs needed) | Always rendered regardless of tier |
| Elite tabs (Salary, Strategy) | Tab trigger text content "Salary" / "Strategy" | Present only when `tier === 'elite'` |

---

## Pre-Population Sources

| Field | Source |
|-------|--------|
| Component inventory | CONTEXT.md domain boundary + deferred section ("Frontend changes beyond defensive shape handling -- Phase 20") |
| Spacing tokens | Tailwind defaults (inherited from Phase 14 contract) |
| Color tokens | `tailwind.config.ts` + `src/index.css` HSL CSS variables |
| Typography | Existing `CareerCompass.tsx` patterns (bold headings, base body text) |
| Locked section placement | CC-01 / CC-02 requirement field lists cross-referenced against current CareerCompass.tsx rendering sections |
| Teaser copy | Authored from CC-01/CC-02/CC-03 requirement descriptions, following Phase 14 voice rules |
| Tab layout rules | Existing `CareerCompass.tsx` lines 1146-1178 (conditional elite tab rendering) |
| Defensive rendering | CONTEXT.md D-07 (defense in depth: prompt + server-side shaping) |
| Lock-vs-empty logic | Inferred from tier hierarchy: show lock only when user's tier is below the required tier for absent data |

No design-contract questions required user input -- every field was answered by upstream artifacts, existing code precedent, or the Phase 14 UI-SPEC.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** APPROVED (2026-04-17)
