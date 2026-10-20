# Phase 1: Navbar Unification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 1-Navbar Unification
**Areas discussed:** Foundation Strategy, Link Structure, Visual Treatment, Mobile Experience

***

## Foundation Strategy

| Option                             | Description                                                                                                                                                                                           | Selected |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Extend MinimalNavbar (Recommended) | Use MinimalNavbar.tsx as the base — it already has the hamburger, ThemeToggle, profile dropdown with avatar, and scroll effects. Add the missing pieces (feature links, admin tier switcher) into it. | ✓        |
| Build from scratch                 | New component that cherry-picks the best parts of both. Clean slate, but more work and risk of regressions.                                                                                           |          |
| Merge into Navbar.tsx              | Add MinimalNavbar features (hamburger, dark mode toggle, dropdown) into the existing Navbar.tsx. Keeps the legacy file as the base.                                                                   |          |

**User's choice:** Extend MinimalNavbar (Recommended)
**Notes:** None

| Option                         | Description                                                                                                                         | Selected |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Rename to Navbar (Recommended) | Replace the old Navbar.tsx entirely. The unified component becomes the new Navbar.tsx — clean, simple import path across all pages. | ✓        |
| Keep as MinimalNavbar          | Keep the current filename. All pages update their imports to MinimalNavbar. The old Navbar.tsx is deleted.                          |          |
| New name (e.g., AppNavbar)     | Fresh name to signal it's the unified version. Old files are both deleted.                                                          |          |

**User's choice:** Rename to Navbar (Recommended)
**Notes:** None

***

## Link Structure

| Option                      | Description                                                                                                                                           | Selected |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Flat link row (Recommended) | All 5 feature links visible in a row: Resume Analysis, Career Compass, LinkedIn Grader, Recruiting Lens, Interview Prep Coach. Simple, direct access. | ✓        |
| Features dropdown           | A single 'Features' dropdown that expands to show all 5 feature links. Saves horizontal space, but adds a click to reach any feature.                 |          |
| Grouped dropdowns           | Two groups — e.g., 'Analysis' and 'Tools'. More organized but more complex.                                                                           |          |

**User's choice:** Flat link row (Recommended)
**Notes:** None

| Option                                                            | Description                                                                                                                                          | Selected |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Logo = Home, Dashboard as link, Profile in dropdown (Recommended) | Clicking the logo goes to Home. Dashboard sits alongside the 5 feature links. Profile, Billing/Membership, and Sign Out live in the avatar dropdown. | ✓        |
| Home + Dashboard as separate links, Profile as link               | Explicit Home and Dashboard buttons in the link row, plus a Profile text link. No avatar dropdown.                                                   |          |
| You decide                                                        | Claude picks the best layout based on MinimalNavbar patterns                                                                                         |          |

**User's choice:** Logo = Home, Dashboard as link, Profile in dropdown (Recommended)
**Notes:** None

| Option                                          | Description                                                                                                              | Selected |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| Keep MinimalNavbar's public links (Recommended) | Logged-out users see: Home, How it works, Pricing, Questions + a Sign In / Get Started CTA. Same as MinimalNavbar today. | ✓        |
| Simplified — just logo + auth buttons           | Minimal: logo on left, Sign In / Sign Up on right. No navigation links for logged-out users.                             |          |
| Show feature links too                          | Logged-out users also see feature links (which redirect to auth). Gives a preview of what's available.                   |          |

**User's choice:** Keep MinimalNavbar's public links (Recommended)
**Notes:** None

***

## Visual Treatment

| Option                                | Description                                                                                                                    | Selected |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Underline + color shift (Recommended) | Active link gets a bottom border accent and text color change. Clean, standard pattern that works in both light and dark mode. | ✓        |
| Background highlight                  | Active link gets a subtle background fill. More prominent but can look heavy with many links.                                  |          |
| Bold text only                        | Active link text becomes bold/semibold. Minimal but can cause layout shift.                                                    |          |
| You decide                            | Claude picks the active indicator based on existing design system patterns                                                     |          |

**User's choice:** Underline + color shift (Recommended)
**Notes:** None

| Option                                 | Description                                                                                                      | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Yes, keep scroll effects (Recommended) | Navbar starts slightly transparent, gains stronger blur/opacity on scroll. Already implemented in MinimalNavbar. | ✓        |
| Always solid                           | Navbar is always fully opaque with consistent styling regardless of scroll position.                             |          |
| You decide                             | Claude picks based on what looks best with the unified design                                                    |          |

**User's choice:** Yes, keep scroll effects (Recommended)
**Notes:** None

| Option                          | Description                                                                                                                   | Selected |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Yes, port it over (Recommended) | Admin users still need to test as Free/Pro/Elite. The tier switcher moves into the unified navbar, near the profile dropdown. | ✓        |
| Move to profile dropdown        | Put the tier switcher inside the avatar dropdown menu. Less visible but cleaner.                                              |          |
| Skip for now                    | Drop the admin switcher from Phase 1.                                                                                         |          |

**User's choice:** Yes, port it over (Recommended)
**Notes:** None

***

## Mobile Experience

| Option                               | Description                                                                                                 | Selected |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------- |
| Full mirror of desktop (Recommended) | All 5 feature links + Dashboard, dark mode toggle, profile/billing/sign out. Same content, vertical layout. | ✓        |
| Grouped sections                     | Links organized into sections with headers. More structured but more UI work.                               |          |
| You decide                           | Claude picks the mobile layout that works best with MinimalNavbar's existing hamburger pattern              |          |

**User's choice:** Full mirror of desktop (Recommended)
**Notes:** None

| Option                    | Description                                                                                                     | Selected |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| lg (1024px) (Recommended) | With 5 feature links + Dashboard, the link row gets crowded below 1024px. Collapse at Tailwind's lg breakpoint. | ✓        |
| md (768px)                | Keep MinimalNavbar's current breakpoint. Links may get tight.                                                   |          |
| xl (1280px)               | Collapse earlier to give links more room. More users see the hamburger.                                         |          |

**User's choice:** lg (1024px) (Recommended)
**Notes:** None

***

## Claude's Discretion

* Internal component structure (sub-components vs inline)
* Transition animations for hamburger and scroll effects
* Handling of "AI Credits Depleted" badge from old Navbar

## Deferred Ideas

None — discussion stayed within phase scope
