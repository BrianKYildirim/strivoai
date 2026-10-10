# Phase 1: Navbar Unification - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Retire the legacy `Navbar.tsx` and ship a single, consistent navbar component used across all pages. The unified navbar must support both logged-in (feature links, profile dropdown) and logged-out (public links, auth CTA) states, with full dark mode support and responsive hamburger menu.

</domain>

<decisions>
## Implementation Decisions

### Foundation Strategy

* **D-01:** Extend `MinimalNavbar.tsx` as the base — it already has the hamburger menu, `ThemeToggle`, profile dropdown with avatar, and scroll-aware styling
* **D-02:** Rename the unified component to `Navbar.tsx` — the old `Navbar.tsx` is deleted and replaced entirely. All 19+ page imports update to the new component
* **D-03:** Port the admin tier switcher from the old `Navbar.tsx` into the unified component, positioned near the profile dropdown area

### Link Structure

* **D-04:** Logged-in users see a flat link row with all 5 feature links: Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach — plus Dashboard
* **D-05:** Logo click navigates to Home (no separate Home link needed in the link row)
* **D-06:** Profile, Billing/Membership, and Sign Out live inside the avatar dropdown (existing MinimalNavbar pattern)
* **D-07:** Logged-out users see the existing MinimalNavbar public links: Home, How it works, Pricing, Questions + Sign In / Get Started CTA

### Visual Treatment

* **D-08:** Active page indicated with underline + text color shift — works in both light and dark mode
* **D-09:** Keep MinimalNavbar's scroll-aware glass blur effect (transparent at top, stronger blur/opacity on scroll)
* **D-10:** Admin tier switcher (purple badge + select dropdown) ports over as-is, visible only to admin users

### Mobile Experience

* **D-11:** Hamburger menu is a full mirror of desktop links — all 5 feature links + Dashboard, dark mode toggle, profile/billing/sign out
* **D-12:** Navbar collapses to hamburger at `lg` breakpoint (1024px) — the flat link row with 5 features + Dashboard needs this wider breakpoint

### Claude's Discretion

* Implementation details: how to structure the component internally (e.g., separate `NavLinks` sub-component vs inline)
* Exact transition animations for hamburger menu and scroll effects
* How to handle the "AI Credits Depleted" badge from old Navbar (carry forward if straightforward)

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Navbar Components

* `src/components/MinimalNavbar.tsx` — Foundation component to extend. Has hamburger, ThemeToggle, profile dropdown, scroll effects
* `src/components/Navbar.tsx` — Legacy navbar to retire. Has admin tier switcher, feature links, credits badge
* `src/components/ThemeToggle.tsx` — Dark mode toggle component already used by MinimalNavbar

### Key Integration Points

* `src/components/UpgradeModal.tsx` — Used by both navbars for upgrade CTA
* `src/contexts/AiCreditsContext.tsx` — Credits tracking used by old Navbar
* `src/contexts/AdminTierTestContext.tsx` — Admin tier testing used by old Navbar
* `src/hooks/useThemeLogo.tsx` — Theme-aware logo used by both navbars

### Pages to Update (imports)

* 13 pages currently importing `Navbar`: Dashboard, Results, Upload, CareerCompass, SkillsGapAnalysis, LinkedInGrader, RecruitingLens, InterviewPrepCoach, Jobs, Improvements, Profile, AnalysisHistory, AdminUsage
* 6 pages currently importing `MinimalNavbar`: HomepageRouter, HowItWorks, Pricing, Privacy, Refund, Questions

### Requirements

* `.planning/REQUIREMENTS.md` — NAV-01 through NAV-07 define acceptance criteria

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* `MinimalNavbar.tsx` — Base component with hamburger, ThemeToggle, avatar dropdown, scroll effects, public/auth link switching
* `ThemeToggle.tsx` — Standalone dark mode toggle component
* `UpgradeModal.tsx` — Upgrade flow triggered from navbar
* `useThemeLogo` hook — Theme-aware logo selection
* `HamburgerIcon` component — Animated 3-bar to X transition (inside MinimalNavbar)
* Radix UI `NavigationMenu`, `DropdownMenu`, `Popover` — Already imported in MinimalNavbar
* `AdminTierTestContext` — Admin tier switcher logic ready to port

### Established Patterns

* `cn()` utility for conditional class composition
* `isActive(path)` helper for route matching
* `supabase.auth.onAuthStateChange` for reactive auth state
* `window.addEventListener('strivo:profile-updated')` for profile refresh
* Fixed position `z-50` navbar with `backdrop-blur-lg`

### Integration Points

* Every page component renders `<Navbar />` or `<MinimalNavbar />` at the top of its JSX
* `ProtectedRoute.tsx` wraps authenticated pages but does NOT include the navbar — each page adds it individually
* `App.tsx` defines routes but does not include a layout-level navbar

\</code\_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

***

*Phase: 01-navbar-unification*
*Context gathered: 2026-04-11*
