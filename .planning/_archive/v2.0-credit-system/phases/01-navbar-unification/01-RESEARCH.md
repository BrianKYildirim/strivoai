# Phase 1: Navbar Unification - Research

**Researched:** 2026-04-11
**Domain:** React component refactoring, responsive navigation, dark mode
**Confidence:** HIGH

## Summary

This phase replaces two navbar components (`Navbar.tsx` and `MinimalNavbar.tsx`) with a single unified `Navbar.tsx` that serves both logged-in and logged-out users. The `MinimalNavbar.tsx` is the stronger foundation -- it already has the hamburger menu, `ThemeToggle`, avatar dropdown with profile/billing links, scroll-aware glass blur effects, and theme-aware logo. The old `Navbar.tsx` is a flat row of buttons with no responsive behavior, no hamburger menu, and hardcoded inline styles.

The main work is: (1) extend MinimalNavbar with missing features from old Navbar (admin tier switcher, AI credits badge, Interview Prep Coach link), (2) update the logged-in link set to include all 5 features, (3) change the hamburger breakpoint from `md` (768px) to `lg` (1024px), (4) switch active state from pill highlight to underline + text color shift, and (5) update all 21 page imports.

**Primary recommendation:** Copy MinimalNavbar.tsx to Navbar.tsx, add the missing old Navbar features (admin tier switcher, credits badge), update link lists, adjust breakpoint, update all imports, then delete old files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extend `MinimalNavbar.tsx` as the base -- it already has the hamburger menu, `ThemeToggle`, profile dropdown with avatar, and scroll-aware styling
- **D-02:** Rename the unified component to `Navbar.tsx` -- the old `Navbar.tsx` is deleted and replaced entirely. All 19+ page imports update to the new component
- **D-03:** Port the admin tier switcher from the old `Navbar.tsx` into the unified component, positioned near the profile dropdown area
- **D-04:** Logged-in users see a flat link row with all 5 feature links: Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach -- plus Dashboard
- **D-05:** Logo click navigates to Home (no separate Home link needed in the link row)
- **D-06:** Profile, Billing/Membership, and Sign Out live inside the avatar dropdown (existing MinimalNavbar pattern)
- **D-07:** Logged-out users see the existing MinimalNavbar public links: Home, How it works, Pricing, Questions + Sign In / Get Started CTA
- **D-08:** Active page indicated with underline + text color shift -- works in both light and dark mode
- **D-09:** Keep MinimalNavbar's scroll-aware glass blur effect (transparent at top, stronger blur/opacity on scroll)
- **D-10:** Admin tier switcher (purple badge + select dropdown) ports over as-is, visible only to admin users
- **D-11:** Hamburger menu is a full mirror of desktop links -- all 5 feature links + Dashboard, dark mode toggle, profile/billing/sign out
- **D-12:** Navbar collapses to hamburger at `lg` breakpoint (1024px) -- the flat link row with 5 features + Dashboard needs this wider breakpoint

### Claude's Discretion
- Implementation details: how to structure the component internally (e.g., separate `NavLinks` sub-component vs inline)
- Exact transition animations for hamburger menu and scroll effects
- How to handle the "AI Credits Depleted" badge from old Navbar (carry forward if straightforward)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | User sees consistent navbar on every page | All 21 page files identified; unified component replaces both old navbars |
| NAV-02 | Navbar includes links to all 5 features | MinimalNavbar `authedPrimaryLinks` array needs Resume Analysis and Interview Prep Coach added |
| NAV-03 | Navbar includes Home button and Dashboard button | Logo click = Home (D-05); Dashboard is in link row (D-04) |
| NAV-04 | Dark mode toggle in navbar | Already present in MinimalNavbar via `<ThemeToggle />` component |
| NAV-05 | Profile icon dropdown with Billing/Membership and Profile links | Already present in MinimalNavbar avatar dropdown |
| NAV-06 | Responsive hamburger menu on mobile | Already present in MinimalNavbar; breakpoint changes from `md` to `lg` |
| NAV-07 | Legacy Navbar.tsx retired; all pages use unified navbar | 14 old Navbar imports + 7 MinimalNavbar imports = 21 files to update |
</phase_requirements>

## Standard Stack

### Core
No new libraries needed. This phase uses only existing project dependencies.

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| React | 18.3.1 | Component framework | Yes |
| React Router | 6.30.1 | `useLocation`, `Link`, `useNavigate` | Yes |
| Radix UI (NavigationMenu, DropdownMenu, Popover) | Various | Nav structure, avatar dropdown, hamburger popover | Yes |
| Tailwind CSS | 3.4.17 | Responsive classes, dark mode | Yes |
| Lucide React | 0.462.0 | Icons (Upload, User, CreditCard, LogOut, Zap, Crown, Shield) | Yes |
| shadcn/ui | N/A | Button, Badge, Select, Avatar, Tooltip components | Yes |

[VERIFIED: package.json in project root]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | 0.7.1 | Component variant classes | If creating variant-based sub-components |
| clsx + tailwind-merge (via `cn()`) | 2.1.1 / 2.6.0 | Conditional class composition | All className logic |

[VERIFIED: package.json in project root]

## Architecture Patterns

### Component Structure Recommendation

The unified Navbar should be a single file with extracted sub-sections for readability, not separate files. This matches the existing MinimalNavbar pattern and keeps the change minimal.

```
src/
  components/
    Navbar.tsx          # NEW unified component (replaces both old files)
    MinimalNavbar.tsx    # DELETE after migration
    ThemeToggle.tsx      # KEEP unchanged
    UpgradeModal.tsx     # KEEP unchanged
```

[ASSUMED]

### Pattern: Unified Navbar with Auth-Conditional Rendering

**What:** Single component that renders different link sets based on auth state, using MinimalNavbar's existing `user ? authedPrimaryLinks : publicLinks` pattern.

**When to use:** Always -- this is the core pattern.

**Existing pattern from MinimalNavbar (lines 241-242):**
```typescript
const activeLinks = user ? authedPrimaryLinks : publicLinks;
```

[VERIFIED: MinimalNavbar.tsx source code]

### Pattern: Admin Tier Switcher Integration

**What:** Port the admin tier switcher from old Navbar (lines 118-159) into the unified component. Uses `useAdminTierTest()` context hook. The switcher is a `Select` dropdown with Shield icon, styled in violet, visible only when `isAdmin` is true.

**Key dependencies to import:**
```typescript
import { useAdminTierTest } from '@/contexts/AdminTierTestContext';
import { useAiCredits } from '@/contexts/AiCreditsContext';
import { Shield, Crown, Zap, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
```

[VERIFIED: Navbar.tsx and AdminTierTestContext.tsx source code]

### Pattern: Active Link Indicator -- Underline + Color Shift

**What:** Replace MinimalNavbar's pill-style active state (`bg-primary/10 text-primary rounded-full`) with underline + text color shift per D-08.

**Example implementation:**
```typescript
// Desktop link active state
className={cn(
  "px-3 py-1.5 text-sm font-medium transition-colors duration-200 border-b-2",
  isActive(l.to)
    ? "border-primary text-primary"
    : "border-transparent text-muted-foreground hover:text-foreground"
)}
```

[ASSUMED -- design approach for underline active state]

### Pattern: Breakpoint Change (md -> lg)

**What:** MinimalNavbar currently uses `md:hidden` / `hidden md:flex` for hamburger toggle at 768px. This needs to change to `lg:hidden` / `hidden lg:flex` for the wider breakpoint at 1024px, since the 6-link row (Dashboard + 5 features) needs more space.

**Tailwind `lg` breakpoint:** 1024px [VERIFIED: Tailwind CSS default breakpoints]

### Anti-Patterns to Avoid
- **Hardcoded inline styles:** Old Navbar uses `style={{ color: "#FF6B6B" }}` and `style={{ backgroundColor: "#FF6B6B" }}`. Do NOT carry these forward. Use Tailwind classes or CSS variables. [VERIFIED: old Navbar.tsx lines 184, 207]
- **Duplicate auth state management:** Old Navbar manages its own auth state separately from MinimalNavbar. The unified component should use one auth pattern (MinimalNavbar's is cleaner). [VERIFIED: both Navbar.tsx source files]
- **Logo visibility conditional:** Old Navbar conditionally hides the logo on non-home pages (line 111-113: `<div className="w-16 md:w-[72px]" />`). The unified navbar should always show the logo. [VERIFIED: old Navbar.tsx source]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode toggle | Custom toggle component | Existing `ThemeToggle.tsx` | Already works, uses localStorage, MutationObserver for logo |
| Avatar dropdown | Custom dropdown | Existing Radix `DropdownMenu` pattern from MinimalNavbar | Accessibility, focus management, z-indexing |
| Hamburger menu | Custom mobile menu | Existing `Popover` + `HamburgerIcon` pattern from MinimalNavbar | Animated icon, accessibility attributes, auto-close on route change |
| Admin tier detection | Custom admin check | Existing `useAdminTierTest()` context | Already handles localStorage, auth state changes |
| Credits depletion badge | New credits system | Existing `useAiCredits()` context | Already tracks credits state across app |

## Common Pitfalls

### Pitfall 1: Missing Import Updates
**What goes wrong:** After creating the unified Navbar, forgetting to update some page imports, leaving some pages with the old component or broken imports.
**Why it happens:** 21 files need updating across `src/pages/` and `src/components/`.
**How to avoid:** Use the exact file list from research. After updating, run `npm run build` -- TypeScript will catch any remaining references to deleted files.
**Warning signs:** Build errors mentioning `MinimalNavbar` or the old `Navbar` path.

### Pitfall 2: Logo Navigation Regression
**What goes wrong:** Logo click behavior changes unexpectedly. MinimalNavbar currently sends logged-in users to `/dashboard` on logo click, but D-05 says logo should go to Home.
**Why it happens:** MinimalNavbar line 349: `to={user ? "/dashboard" : "/"}`.
**How to avoid:** Change logo link to always navigate to `/` per D-05. Dashboard is already in the link row.
**Warning signs:** Logo click going to dashboard instead of home.

### Pitfall 3: Hamburger Menu Missing Links
**What goes wrong:** Mobile hamburger menu shows different links than desktop, violating NAV-01 consistency and D-11.
**Why it happens:** Desktop and mobile link arrays managed separately. MinimalNavbar's `mobileNavMeta` object (icon map) needs entries for all new routes.
**How to avoid:** Use the same `activeLinks` array for both desktop NavigationMenu and mobile Popover. Add `mobileNavMeta` entries for `/upload`, `/interview-prep-coach`, and `/skills-gap-analysis` if icons are needed.
**Warning signs:** Counting links in hamburger vs desktop and finding a mismatch.

### Pitfall 4: Context Provider Missing
**What goes wrong:** `useAdminTierTest()` or `useAiCredits()` throws "must be used within Provider" error on pages that previously used MinimalNavbar (which didn't use these contexts).
**Why it happens:** The unified Navbar uses contexts that weren't needed by MinimalNavbar pages.
**How to avoid:** Verify both `AdminTierTestProvider` and `AiCreditsProvider` wrap the entire app in `App.tsx` or `main.tsx`. If they do (likely since old Navbar pages work), this is a non-issue.
**Warning signs:** Runtime error on public pages (Pricing, How It Works, etc.)

### Pitfall 5: z-index Conflicts with Admin Tier Switcher Dropdown
**What goes wrong:** Admin Select dropdown renders behind the navbar's backdrop-blur or behind page content.
**Why it happens:** Old Navbar uses `z-[100]` on SelectContent. The unified navbar's glass blur and `z-50` positioning may interfere.
**How to avoid:** Keep `z-[100]` on SelectContent as in old Navbar. Test with admin user.
**Warning signs:** Dropdown opens but options are not clickable or visually clipped.

## Code Examples

### Authenticated Link Array (updated per D-04)
```typescript
const authedPrimaryLinks = useMemo(
  () => [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/upload", label: "Resume Analysis" },
    { to: "/career-compass", label: "Career Compass" },
    { to: "/linkedin-grader", label: "LinkedIn Grader" },
    { to: "/recruiting-lens", label: "Recruiting Lens" },
    { to: "/interview-prep-coach", label: "Interview Prep Coach" },
  ],
  []
);
```
[ASSUMED -- route for Resume Analysis may be `/upload` or another path; verify actual route]

### Admin Tier Switcher Block (port from old Navbar)
```typescript
{isAdmin && (
  <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-lg">
    <Shield className="h-4 w-4 text-violet-400" />
    <Select
      value={testTier || 'admin'}
      onValueChange={(value) => setTestTier(value === 'admin' ? null : value)}
    >
      <SelectTrigger className="h-7 w-28 text-xs bg-background/50 border-violet-500/30">
        <SelectValue placeholder="View as..." />
      </SelectTrigger>
      <SelectContent className="bg-background border-border z-[100]">
        <SelectItem value="free">Free</SelectItem>
        <SelectItem value="pro">
          <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400" />Pro</span>
        </SelectItem>
        <SelectItem value="elite">
          <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-purple-400" />Elite</span>
        </SelectItem>
        <SelectItem value="admin">
          <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-violet-400" />Admin View</span>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
)}
```
[VERIFIED: old Navbar.tsx lines 118-159]

### Credits Depleted Badge (port from old Navbar)
```typescript
{!creditsAvailable && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className="flex items-center gap-1 cursor-help">
          <AlertCircle className="w-3 h-3" />
          AI Credits Depleted
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>AI features are unavailable. Credits reset on your billing cycle anniversary.</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```
[VERIFIED: old Navbar.tsx lines 162-176]

### Import Update Pattern (all 21 files)
```typescript
// Before (14 files):
import { Navbar } from '@/components/Navbar';
// After -- same import path, new component

// Before (7 files):
import { MinimalNavbar } from '@/components/MinimalNavbar';
// After:
import { Navbar } from '@/components/Navbar';
// Also update JSX: <MinimalNavbar /> -> <Navbar />
```

## File Inventory

### Files to Modify (21 total)

**14 files currently importing old `Navbar` (import path stays same, component is new):**
1. `src/pages/AdminUsage.tsx`
2. `src/pages/AnalysisHistory.tsx`
3. `src/pages/CareerCompass.tsx`
4. `src/pages/Dashboard.tsx`
5. `src/pages/Improvements.tsx`
6. `src/pages/InterviewPrepCoach.tsx`
7. `src/pages/Jobs.tsx`
8. `src/pages/LinkedInGrader.tsx`
9. `src/pages/Profile.tsx`
10. `src/pages/RecruitingLens.tsx`
11. `src/pages/Results.tsx`
12. `src/pages/ResumeBuilder.tsx`
13. `src/pages/SkillsGapAnalysis.tsx`
14. `src/pages/Upload.tsx`

**7 files currently importing `MinimalNavbar` (import + JSX both change):**
1. `src/components/HomepageRouter.tsx`
2. `src/pages/HowItWorks.tsx`
3. `src/pages/Pricing.tsx`
4. `src/pages/Privacy.tsx`
5. `src/pages/Refund.tsx`
6. `src/pages/Questions.tsx`
7. `src/pages/Terms.tsx`

**Files to create:**
- `src/components/Navbar.tsx` (new unified component, replaces old file)

**Files to delete:**
- `src/components/MinimalNavbar.tsx`
- `src/components/Navbar.tsx` (old version, overwritten by new)

[VERIFIED: grep search across src/ directory]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | No frontend test framework installed (no Jest, Vitest, or React Testing Library in package.json) |
| Config file | None |
| Quick run command | `npm run lint` (ESLint only) |
| Full suite command | `npm run build` (TypeScript compilation catches type errors and broken imports) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Consistent navbar on every page | manual-only | Visual inspection across pages | N/A |
| NAV-02 | All 5 feature links present | manual-only | Visual inspection of link row | N/A |
| NAV-03 | Home + Dashboard buttons | manual-only | Visual inspection | N/A |
| NAV-04 | Dark mode toggle works | manual-only | Click toggle, verify theme changes | N/A |
| NAV-05 | Profile dropdown with Billing/Profile links | manual-only | Click avatar, verify dropdown | N/A |
| NAV-06 | Hamburger menu on mobile | manual-only | Resize to <1024px, verify hamburger | N/A |
| NAV-07 | Legacy Navbar retired | build | `npm run build` -- fails if old imports remain | N/A |

**Justification for manual-only:** No frontend test framework is installed. Adding Vitest + React Testing Library is out of scope for this phase. `npm run build` validates TypeScript compilation and import correctness, which catches NAV-07 automatically.

### Sampling Rate
- **Per task commit:** `npm run lint && npm run build`
- **Per wave merge:** `npm run lint && npm run build`
- **Phase gate:** Build green + manual visual inspection of 3+ pages (one public, one authenticated, one mobile viewport)

### Wave 0 Gaps
None -- no frontend test framework to set up for this phase. Build + lint provide sufficient automated validation for a component refactor.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Resume Analysis link should point to `/upload` route | Code Examples | Wrong route would lead to 404 or incorrect page; verify actual route path |
| A2 | Component structured as single file with inline sub-sections (no separate files) | Architecture Patterns | Low risk -- just organizational preference |
| A3 | Underline active state uses `border-b-2 border-primary` approach | Code Examples | Low risk -- alternative CSS approaches work fine |
| A4 | `AdminTierTestProvider` and `AiCreditsProvider` already wrap entire app | Pitfalls | If not, public pages will crash with context errors when using unified Navbar |

## Open Questions

1. **Resume Analysis route path**
   - What we know: Old Navbar links to `/upload` for "Upload Resume". CareerCompass, LinkedIn Grader, Recruiting Lens all have dedicated routes.
   - What's unclear: Should the "Resume Analysis" link in the navbar go to `/upload`, `/dashboard`, or a dedicated `/resume-analysis` route?
   - Recommendation: Use `/upload` since that's the entry point for resume analysis. Implementer should verify by checking `App.tsx` routes.

2. **AI Credits Depleted badge placement**
   - What we know: Old Navbar shows it inline with other nav buttons. Context says "carry forward if straightforward" (Claude's discretion).
   - What's unclear: Where exactly to position it in the unified navbar layout (before links? near avatar? desktop only?).
   - Recommendation: Place it near the right side, before the avatar dropdown on desktop. Hide on mobile (it will be visible in the hamburger menu as a status indicator).

## Project Constraints (from CLAUDE.md)

- Use `cn()` utility for conditional class composition
- Follow existing TypeScript and React patterns
- Use semantic design tokens (CSS variables), not hardcoded colors
- Do NOT commit anything in `.planning/` directory
- Prefer `apply_patch` for focused edits
- `npm run lint` and `npm run build` are the validation commands
- 2-space indentation, semicolons required, trailing commas in multiline structures
- Named exports for utilities, components use named exports (both navbars use `export const`)
- Bracket prefix logging: `console.log('[Navbar] message')`

## Sources

### Primary (HIGH confidence)
- `src/components/MinimalNavbar.tsx` -- Full source code read, foundation component
- `src/components/Navbar.tsx` -- Full source code read, legacy component to retire
- `src/components/ThemeToggle.tsx` -- Full source code read
- `src/contexts/AdminTierTestContext.tsx` -- Full source code read
- `src/contexts/AiCreditsContext.tsx` -- Interface read
- `src/hooks/useThemeLogo.ts` -- Full source code read
- `package.json` -- All dependency versions verified
- `tailwind.config.ts` -- Breakpoint and theme configuration verified

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions D-01 through D-12
- REQUIREMENTS.md NAV-01 through NAV-07

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing dependencies verified
- Architecture: HIGH -- extending an existing working component with well-understood additions
- Pitfalls: HIGH -- all identified from direct source code analysis
- File inventory: HIGH -- verified via grep across entire src/ directory

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no external dependencies or rapidly changing APIs)
