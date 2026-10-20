---
phase: 01
phase_name: Navbar Unification
status: draft
design_system: shadcn (default style, slate base, CSS variables)
created: 2026-04-11
revised: 2026-04-11
---

# UI Design Contract: Phase 1 — Navbar Unification

## 1. Design System Reference

| Property | Value | Source |
|----------|-------|--------|
| Component library | shadcn/ui (default style) | components.json |
| Base color | slate | components.json `tailwind.baseColor` |
| CSS variables | Yes | components.json `tailwind.cssVariables` |
| Border radius | `--radius: 0.75rem` (12px) | src/index.css |
| Dark mode strategy | Class-based (`darkMode: ["class"]`) | tailwind.config.ts |
| Font family | Inter, system-ui fallback stack | tailwind.config.ts |
| Icon library | Lucide React 0.462.0 | package.json |
| Utility function | `cn()` from `@/lib/utils` | Project convention |

## 2. Spacing

Scale: standard 4px base grid. Only these values are permitted in this phase.

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| `1` | 4px | Icon-to-text gap inside badges |
| `2` | 8px | Gap between nav items, hamburger menu item padding, link vertical padding (`py-2`) |
| `4` | 16px | Link horizontal padding (`px-4`), mobile menu item padding, navbar horizontal padding (mobile), gap between nav sections |
| `6` | 24px | Navbar horizontal padding (desktop), container padding |
| `10` | 40px | Logo width (fixed component dimension) |
| `14` | 56px | Navbar fixed height, mobile (fixed component dimension) |
| `16` | 64px | Navbar fixed height, desktop (fixed component dimension) |

**Navbar height contract:**
- Desktop (>=1024px): 64px total height (`h-16`)
- Mobile (<1024px): 56px total height (`h-14`)
- All pages must apply `pt-16` (desktop) or `pt-14` (mobile) to their first content element to prevent navbar overlap (existing pattern -- verify per page)

## 3. Typography

This phase uses a narrow subset of the project's type scale. Only these are permitted in navbar elements.

| Role | Size | Weight | Line Height | Tailwind Class |
|------|------|--------|-------------|----------------|
| Nav link (desktop) | 14px | 500 (medium) | 1.25 | `text-sm font-medium`, padding `px-4 py-2` |
| Nav link (mobile menu) | 16px | 500 (medium) | 1.5 | `text-base font-medium` |
| Admin badge label | 12px | 500 (medium) | 1.25 | `text-xs font-medium` |
| Credits badge text | 12px | 500 (medium) | 1.25 | `text-xs font-medium` |
| Dropdown menu item | 14px | 400 (normal) | 1.25 | `text-sm` |
| CTA button ("Get Started") | 14px | 500 (medium) | 1.25 | `text-sm font-medium` |

Font: Inter at all sizes. No heading sizes used in navbar.

## 4. Color Contract

All colors use CSS variable tokens. No hardcoded hex or HSL values in navbar component code.

### 60/30/10 Distribution (within navbar scope)

| Split | Role | Token | Dark Value | Light Value |
|-------|------|-------|------------|-------------|
| 60% | Navbar background (at scroll) | `background` | `hsl(0 0% 0%)` | `hsl(0 0% 100%)` |
| 30% | Inactive link text | `muted-foreground` | `hsl(0 0% 60%)` | `hsl(0 0% 40%)` |
| 10% | Active link underline + text, CTA button | `primary` | `hsl(357 100% 68%)` | `hsl(357 100% 55%)` |

### Semantic Color Assignments

| Element | State | Token / Class | Notes |
|---------|-------|---------------|-------|
| Navbar background (top of page) | default | `transparent` | No background when `scrollY <= 50` |
| Navbar background (scrolled) | scrolled | `bg-background/80 backdrop-blur-lg` | Glass blur effect, 80% opacity |
| Navbar border (scrolled) | scrolled | `border-b border-border` | Subtle separator appears on scroll |
| Desktop nav link | inactive | `text-muted-foreground` | 60% white (dark) / 40% black (light) |
| Desktop nav link | hover | `text-foreground` | Full white (dark) / near-black (light) |
| Desktop nav link | active | `text-primary border-b-2 border-primary` | Coral underline + coral text |
| Desktop nav link underline | inactive | `border-transparent` | 2px invisible border to prevent layout shift |
| Mobile menu link | inactive | `text-muted-foreground` | Same as desktop |
| Mobile menu link | active | `text-primary` | Coral text, no underline in mobile |
| CTA "Get Started" button | default | `bg-primary text-primary-foreground` | Coral background, white text |
| CTA "Sign In" link | default | `text-muted-foreground hover:text-foreground` | Ghost style |
| Profile avatar fallback | default | `bg-primary/10 text-primary` | Coral tint circle with coral initial |
| Admin tier badge | default | `bg-violet-500/10 border-violet-500/30 text-violet-400` | Violet color outside design token system -- acceptable for admin-only element |
| Credits depleted badge | default | `variant="destructive"` (shadcn Badge) | Uses `--destructive` token |
| Hamburger icon lines | default | `bg-current` (inherits `text-foreground`) | Three lines inherit parent text color |
| Theme toggle | default | Existing `ThemeToggle.tsx` styling | No changes |

### Accent Reserved-For List

The `primary` / `accent` color (coral, `hsl(357 100% 68%)`) is reserved in this phase for:
1. Active nav link text + underline indicator
2. "Get Started" CTA button background
3. Avatar fallback tint
4. Ring focus indicator (`--ring`)

No other navbar elements use `primary`/`accent`.

## 5. Active Link Indicator

The active page indicator replaces MinimalNavbar's pill highlight with an underline approach per decision D-08.

### Desktop (>=1024px)

```
className={cn(
  "px-4 py-2 text-sm font-medium transition-colors duration-200 border-b-2",
  isActive(link.to)
    ? "border-primary text-primary"
    : "border-transparent text-muted-foreground hover:text-foreground"
)}
```

- Underline: 2px solid, `border-primary` color
- Text: `text-primary` (coral)
- Transition: `duration-200` on color properties
- Invisible 2px border on inactive links prevents layout shift

### Mobile (hamburger menu)

- Active indicator: `text-primary` on the link label (no underline in vertical list)
- Inactive: `text-muted-foreground`
- Optional: left border accent `border-l-2 border-primary` on active item (Claude's discretion)

## 6. Scroll-Aware Styling

Preserve MinimalNavbar's existing scroll behavior. Trigger threshold: `scrollY > 50px`.

| Property | At Top (`scrollY <= 50`) | Scrolled (`scrollY > 50`) |
|----------|--------------------------|---------------------------|
| Background | `transparent` | `bg-background/80` |
| Backdrop filter | none | `backdrop-blur-lg` |
| Border bottom | none | `border-b border-border` |
| Shadow | none | none (border provides separation) |
| Transition | `transition-all duration-300` | `transition-all duration-300` |

## 7. Breakpoint Contract

| Breakpoint | Tailwind | Navbar Layout |
|------------|----------|---------------|
| < 1024px | default (mobile) | Logo + hamburger button + theme toggle + avatar |
| >= 1024px | `lg:` | Logo + flat link row + admin badge (if admin) + credits badge (if depleted) + theme toggle + avatar dropdown |

Decision D-12 mandates `lg` (1024px), not the previous `md` (768px). All responsive visibility classes use `lg:hidden` / `hidden lg:flex`.

## 8. Component Inventory

All components used in this phase. No new shadcn components need to be installed.

| Component | Source | New/Existing | Usage |
|-----------|--------|-------------|-------|
| `NavigationMenu` | `@/components/ui/navigation-menu` | Existing | Desktop link row container |
| `NavigationMenuList` | `@/components/ui/navigation-menu` | Existing | Link list wrapper |
| `NavigationMenuItem` | `@/components/ui/navigation-menu` | Existing | Individual link slot |
| `NavigationMenuLink` | `@/components/ui/navigation-menu` | Existing | Link element |
| `DropdownMenu` | `@/components/ui/dropdown-menu` | Existing | Avatar profile dropdown |
| `DropdownMenuContent` | `@/components/ui/dropdown-menu` | Existing | Dropdown container |
| `DropdownMenuItem` | `@/components/ui/dropdown-menu` | Existing | Dropdown items (Profile, Billing, Sign Out) |
| `DropdownMenuSeparator` | `@/components/ui/dropdown-menu` | Existing | Separator before Sign Out |
| `Popover` | `@/components/ui/popover` | Existing | Mobile hamburger menu container |
| `PopoverTrigger` | `@/components/ui/popover` | Existing | Hamburger button wrapper |
| `PopoverContent` | `@/components/ui/popover` | Existing | Mobile menu panel |
| `Button` | `@/components/ui/button` | Existing | CTA buttons, hamburger trigger |
| `Badge` | `@/components/ui/badge` | Existing | Credits depleted indicator |
| `Avatar` | `@/components/ui/avatar` | Existing | Profile avatar circle |
| `AvatarFallback` | `@/components/ui/avatar` | Existing | Initial letter fallback |
| `Select` | `@/components/ui/select` | Existing | Admin tier switcher dropdown |
| `Tooltip` | `@/components/ui/tooltip` | Existing | Credits badge hover explanation |
| `ThemeToggle` | `@/components/ThemeToggle` | Existing | Dark/light mode switch |
| `UpgradeModal` | `@/components/UpgradeModal` | Existing | Upgrade CTA modal |
| `HamburgerIcon` | Inline in Navbar.tsx | Existing (port) | Animated 3-bar to X icon |

### Registry

| Registry | Status |
|----------|--------|
| shadcn official | No new components needed |
| Third-party registries | None |

## 9. Layout Contract

### Desktop Layout (>=1024px)

```
[Logo] ---- [Dashboard | Resume Analysis | Career Compass | LinkedIn Grader | Recruiting Lens | Interview Prep Coach] ---- [AdminBadge?] [CreditsBadge?] [ThemeToggle] [Avatar]
```

- Logo: left-aligned, fixed width ~40px, links to `/` always (D-05)
- Link row: centered or left-aligned after logo, horizontal `flex gap-1`
- Right section: `flex items-center gap-2`, contains admin badge (if admin), credits badge (if depleted), theme toggle, avatar dropdown
- Full width: `w-full max-w-none` (no container constraint on navbar itself)
- Inner content: `max-w-7xl mx-auto` or equivalent container

### Mobile Layout (<1024px)

```
[Logo] ---- [ThemeToggle] [Avatar] [Hamburger]
```

Hamburger opens a `Popover` panel below the navbar containing:
1. All 6 authenticated links (Dashboard + 5 features) OR 4 public links
2. Dark mode toggle (redundant with header but expected in menu)
3. Profile / Billing / Sign Out (authenticated only)

### Fixed Positioning

```
fixed top-0 left-0 right-0 z-50
```

This is the existing MinimalNavbar pattern. No changes.

## 10. Copywriting

### Navigation Labels (Authenticated)

| Link | Label | Route |
|------|-------|-------|
| 1 | Dashboard | `/dashboard` |
| 2 | Resume Analysis | `/upload` |
| 3 | Career Compass | `/career-compass` |
| 4 | LinkedIn Grader | `/linkedin-grader` |
| 5 | Recruiting Lens | `/recruiting-lens` |
| 6 | Interview Prep Coach | `/interview-prep-coach` |

### Navigation Labels (Public / Logged Out)

| Link | Label | Route |
|------|-------|-------|
| 1 | Home | `/` |
| 2 | How it works | `/how-it-works` |
| 3 | Pricing | `/pricing` |
| 4 | Questions | `/questions` |

### CTA Labels

| Element | Label | Context | Justification |
|---------|-------|---------|---------------|
| Primary CTA (logged out) | Get Started | Right side of navbar, coral button | Verb + noun, primary action |
| Secondary CTA (logged out) | Sign In | Ghost-style text link before Get Started | "Sign In" is a secondary ghost-style CTA where the product context (Strivo AI platform) is implied by its placement in the navbar. As a ghost link styled `text-muted-foreground hover:text-foreground`, it is visually subordinate to the primary "Get Started" CTA and does not require an explicit noun -- the action target is unambiguous from the authentication context. |

### Dropdown Menu Labels

| Item | Label | Icon | Behavior |
|------|-------|------|----------|
| Profile link | Profile | `User` (Lucide) | Navigates to `/profile` |
| Billing link | Billing | `CreditCard` (Lucide) | Navigates to billing page |
| Sign out | Sign Out | `LogOut` (Lucide) | Immediate action -- no confirmation dialog. Signs the user out and redirects to `/`. Rationale: Sign Out is a low-risk, easily reversible action (user can sign back in immediately). A confirmation dialog would add unnecessary friction to a standard auth flow. |

### Status Indicators

| Element | Copy | Tooltip Copy |
|---------|------|-------------|
| Credits depleted badge | AI Credits Depleted | AI features are unavailable. Credits reset on your billing cycle anniversary. |
| Admin tier switcher placeholder | View as... | N/A |

### Empty / Error States

This phase has no empty states or error states. The navbar is always visible with deterministic content based on auth state.

## 11. Interaction Contract

### Transitions & Animations

| Interaction | Animation | Duration | Easing |
|-------------|-----------|----------|--------|
| Nav link hover | Color shift | 200ms | `ease` (default) |
| Nav link active state | Instant on route change | 0ms | N/A |
| Scroll background | Opacity + blur fade in | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Hamburger icon morph | 3 bars to X | 300ms | `ease-in-out` |
| Mobile menu open/close | Popover default animation | Per Radix Popover | Per Radix Popover |
| Dropdown menu open | DropdownMenu default animation | Per Radix DropdownMenu | Per Radix DropdownMenu |
| Admin Select open | Select default animation | Per Radix Select | Per Radix Select |

### Keyboard Accessibility

| Key | Context | Behavior |
|-----|---------|----------|
| Tab | Desktop nav links | Focus moves through all visible links left to right |
| Enter/Space | Any link or button | Activates the element |
| Escape | Hamburger menu open | Closes the popover |
| Escape | Avatar dropdown open | Closes the dropdown |
| Arrow keys | Admin tier Select open | Navigates options |

### Accessibility: Hamburger Button

The hamburger button MUST declare a dynamic `aria-label` that reflects its current state:

| Menu State | `aria-label` Value |
|------------|-------------------|
| Closed | `"Open navigation menu"` |
| Open | `"Close navigation menu"` |

Implementation: `aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}` on the `Button` element wrapping `HamburgerIcon`.

### Focus Indicators

All interactive elements use the default shadcn focus ring: `ring-2 ring-ring ring-offset-2 ring-offset-background`. No custom focus styles in this phase.

## 12. z-index Stack

| Layer | z-index | Element |
|-------|---------|---------|
| Navbar container | `z-50` | Fixed navbar bar |
| Admin Select dropdown | `z-[100]` | SelectContent portal -- must render above navbar backdrop-blur |
| Avatar DropdownMenu | Default Radix portal z-index | Renders above navbar via portal |
| Hamburger Popover | Default Radix portal z-index | Renders below navbar via portal |

## 13. Dark Mode Contract

This phase MUST render correctly in both `dark` (default) and `light` class modes. All color references use CSS variable tokens which automatically switch.

| Element | Dark Mode | Light Mode |
|---------|-----------|------------|
| Navbar bg (scrolled) | Near-black at 80% opacity + blur | White at 80% opacity + blur |
| Link text (inactive) | `hsl(0 0% 60%)` -- gray | `hsl(0 0% 40%)` -- dark gray |
| Link text (active) | `hsl(357 100% 68%)` -- coral | `hsl(357 100% 55%)` -- deeper coral |
| Underline (active) | Same as active text | Same as active text |
| Admin badge bg | `violet-500/10` | `violet-500/10` |
| Logo | No filter | `brightness(0) saturate(100%)` via `--logo-filter` |

The `ThemeToggle` component handles mode switching. The navbar component itself does NOT manage theme state.

## 14. Anti-Patterns

These are explicitly banned in this phase:

1. **No hardcoded colors.** Do not use `style={{ color: "#FF6B6B" }}` or any inline `style` attribute for colors. Use Tailwind classes with CSS variable tokens.
2. **No duplicate auth state.** Use one auth state management pattern (MinimalNavbar's `supabase.auth` pattern). Do not maintain a second `useEffect` for auth.
3. **No conditional logo visibility.** The logo is always visible on all pages. Do not hide it or replace it with a spacer div.
4. **No `md:` breakpoint for hamburger.** Use `lg:` (1024px) exclusively per D-12.
5. **No separate link arrays for desktop/mobile.** Use the same `activeLinks` array for both views to prevent link mismatch (NAV-01 consistency).

## 15. Assumptions

| # | Assumption | Risk if Wrong | Mitigation |
|---|-----------|---------------|------------|
| A1 | Resume Analysis link points to `/upload` | Wrong route leads to unexpected page | Verify in `App.tsx` route definitions during implementation |
| A2 | `AdminTierTestProvider` and `AiCreditsProvider` wrap the entire app | Public pages crash with context errors | Check `App.tsx` or `main.tsx` provider tree; add conditional hooks if needed |
| A3 | All 21 page files render navbar at component top level | Missing navbar on some pages | Build verification catches broken imports |

---

*Phase: 01-navbar-unification*
*Contract created: 2026-04-11*
*Contract revised: 2026-04-11*
*Status: draft -- awaiting checker validation*
