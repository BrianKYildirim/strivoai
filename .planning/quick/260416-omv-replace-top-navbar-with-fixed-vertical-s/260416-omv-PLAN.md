---
phase: quick
plan: 260416-omv
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/AppSidebar.tsx
  - src/components/DashboardLayout.tsx
  - src/components/TopBar.tsx
  - src/App.tsx
  - src/components/HomepageRouter.tsx
  - src/pages/Dashboard.tsx
  - src/pages/Upload.tsx
  - src/pages/Results.tsx
  - src/pages/Improvements.tsx
  - src/pages/Jobs.tsx
  - src/pages/LinkedInGrader.tsx
  - src/pages/CareerCompass.tsx
  - src/pages/Profile.tsx
  - src/pages/SkillsGapAnalysis.tsx
  - src/pages/AnalysisHistory.tsx
  - src/pages/AdminUsage.tsx
  - src/pages/RecruitingLens.tsx
  - src/pages/InterviewPrepCoach.tsx
  - src/pages/InterviewPrep.tsx
  - src/pages/ResumeBuilder.tsx
autonomous: false
requirements: []
must_haves:
  truths:
    - "Signed-in users see a fixed vertical sidebar on the left edge instead of a top navbar"
    - "Sidebar defaults to collapsed 72px icon-only rail"
    - "Sidebar expands to 220px with labels on toggle click"
    - "Active nav item has inverted colors (bg-foreground text-background shadow-lg)"
    - "Tooltips appear on icon hover when sidebar is collapsed"
    - "Backdrop overlay appears behind sidebar when expanded, clicking it closes sidebar"
    - "Strivo logo, theme toggle, and user avatar remain visible in a top bar"
    - "Main content is offset by pl-[72px] to avoid sidebar overlap"
    - "Public pages (landing, pricing, how-it-works, etc.) still use the original top Navbar"
  artifacts:
    - path: "src/components/AppSidebar.tsx"
      provides: "Fixed vertical sidebar navigation with collapse/expand toggle"
    - path: "src/components/TopBar.tsx"
      provides: "Slim top bar with logo, theme toggle, and user avatar for dashboard layout"
    - path: "src/components/DashboardLayout.tsx"
      provides: "Layout wrapper composing AppSidebar + TopBar + content area"
  key_links:
    - from: "src/App.tsx"
      to: "src/components/DashboardLayout.tsx"
      via: "ProtectedRoute children wrapped in DashboardLayout"
    - from: "src/components/DashboardLayout.tsx"
      to: "src/components/AppSidebar.tsx"
      via: "Renders sidebar as fixed left rail"
    - from: "src/components/DashboardLayout.tsx"
      to: "src/components/TopBar.tsx"
      via: "Renders top bar within the content area (right of sidebar)"
---

<objective>
Replace the top navbar with a fixed vertical sidebar navigation for all signed-in (dashboard) pages. Public pages retain the existing top navbar.

Purpose: Improve navigation ergonomics for signed-in users with a persistent sidebar that provides quick icon-based access to all features, with expand/collapse functionality.

Output: New `AppSidebar`, `TopBar`, and `DashboardLayout` components. All protected pages updated to remove inline `<Navbar />` usage and use the new layout. Public pages unchanged.
</objective>

<execution_context>
@C:/Projects/strive-ai-hired/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projects/strive-ai-hired/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/Navbar.tsx
@src/components/ThemeToggle.tsx
@src/components/ProtectedRoute.tsx
@src/App.tsx
@src/components/HomepageRouter.tsx
@src/hooks/useThemeLogo.ts

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/components/Navbar.tsx — items to preserve/replicate in sidebar:
- Auth state management: supabase.auth.getSession() / onAuthStateChange for user
- Profile fetch: supabase.from("profiles").select("full_name, subscription_tier")
- Credits fetch: supabase.rpc("can_perform_ai_action", { p_user_id })
- getUserInitials(), getTierLabel() — for avatar display
- handleSignOut — for sign out action
- Admin tier switcher via useAdminTierTest context
- AI credits badge via useAiCredits context
- UpgradeModal integration

From src/components/ThemeToggle.tsx:
```typescript
export const ThemeToggle = () => { ... }
// Button variant="ghost" size="icon" with Sun/Moon icons
```

From src/hooks/useThemeLogo.ts:
```typescript
export const useThemeLogo = () => string; // returns logo path based on theme
```

From src/components/ui/tooltip.tsx — shadcn tooltip already available:
- TooltipProvider, Tooltip, TooltipTrigger, TooltipContent

Currently every page does:
```tsx
import { Navbar } from '@/components/Navbar';
// ... inside render:
<div className="min-h-screen bg-background">
  <Navbar />
  <div className="container mx-auto px-4 pt-24 pb-12 max-w-6xl">
    {/* page content */}
  </div>
</div>
```

After this plan, protected pages will simply export their content — the DashboardLayout wrapper in App.tsx handles sidebar + topbar + content offset.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create AppSidebar, TopBar, and DashboardLayout components</name>
  <files>
    src/components/AppSidebar.tsx,
    src/components/TopBar.tsx,
    src/components/DashboardLayout.tsx
  </files>
  <action>
**Create `src/components/AppSidebar.tsx`** — the fixed vertical sidebar:

- Fixed left edge (`fixed top-0 left-0 h-screen z-30`), default width `w-[72px]`, expanded width `w-[220px]`.
- Width transition: `transition-all duration-300` with `cubic-bezier(0.25, 0.1, 0.25, 1)` easing via style prop or Tailwind arbitrary value `ease-[cubic-bezier(0.25,0.1,0.25,1)]`.
- Background: `bg-background border-r border-border/40`.
- Internal state: `const [expanded, setExpanded] = useState(false)`.

**Toggle button** at the top of sidebar:
- When collapsed: show `Menu` icon (hamburger). When expanded: show `X` icon with "Menu" label text.
- Icon morph: Use two icons with opposing `transition-all duration-300`. Collapsed icon: `rotate-0 scale-100 opacity-100`. Expanded icon: `rotate-0 scale-100 opacity-100`. The OTHER icon gets `rotate-90 scale-75 opacity-0 absolute`. Use Lucide `Menu` and `X` icons.
- Button styling: `w-11 h-11 rounded-xl` centered in sidebar.

**Navigation items (top section)**, each as a `NavLink` (from react-router-dom) or `Link`:
```
Home         -> /dashboard    -> LayoutGrid icon
Resume Analysis -> /upload    -> Upload icon
Career Compass  -> /career-compass -> Compass icon
LinkedIn Grader -> /linkedin-grader -> Linkedin icon
Interview Prep  -> /interview-prep  -> GraduationCap icon
Recruiting Lens -> /recruiting-lens -> Eye icon
Celebrations    -> (no link yet, disabled) -> PartyPopper icon (or a blank placeholder)
History         -> /history    -> History icon
```

- Collapsed state: `w-11 h-11 rounded-xl` icon-only button, icon `w-5 h-5`.
- Expanded state: `h-11 px-3 rounded-xl` with icon + label. Labels cascade in with staggered delays: each label has `transition-opacity duration-200` with `delay-[${60 + index * 25}ms]`. When collapsed, labels get `opacity-0 w-0 overflow-hidden`. When expanded, `opacity-100 ml-3`.
- Active state: `bg-foreground text-background shadow-lg`.
- Inactive state: `text-muted-foreground` with `hover:text-foreground hover:bg-muted`.
- Use `useLocation()` to determine active route.
- All icons from `lucide-react`: `LayoutGrid, Upload, Compass, Linkedin, GraduationCap, Eye, PartyPopper, History, Settings, Menu, X`.

**Bottom section** separated by `border-t border-border/60`:
- Settings item: `Settings` (gear icon) linking to `/profile`.
- Same styling rules as top nav items.

**Tooltips** (collapsed only):
- Wrap each nav item in `<Tooltip>` from shadcn. Use `<TooltipProvider delayDuration={0}>` wrapping the entire sidebar nav list.
- `<TooltipContent side="right">` with the label text.
- Only render tooltip trigger/content when `!expanded` (or conditionally disable the tooltip when expanded).

**Backdrop overlay** (expanded only):
- When `expanded === true`, render a `<div className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[2px]" onClick={() => setExpanded(false)} />` OUTSIDE the sidebar (but within the component).
- Sidebar itself is `z-30` so it appears above the backdrop.

Props: `interface AppSidebarProps {}` (no props needed; uses internal state).
Export: `export const AppSidebar`.

**Create `src/components/TopBar.tsx`** — slim top bar for signed-in layout:

- This is NOT fixed-position; it sits at the top of the content area (which already has `pl-[72px]`).
- `<div className="flex items-center justify-between h-16 px-6">`.
- LEFT: Strivo logo using `useThemeLogo()` hook, wrapped in `<Link to="/">`. Logo `h-9 w-auto`.
- RIGHT: flex row with `gap-3`:
  1. Admin tier switcher (if `isAdmin` from `useAdminTierTest()`) — replicate the exact admin switcher from Navbar.tsx (Shield icon, Select with free/pro/elite/admin options, violet styling).
  2. AI Credits Depleted badge (if `!creditsAvailable` from `useAiCredits()`) — replicate from Navbar.tsx.
  3. `<ThemeToggle />` component.
  4. User avatar dropdown — replicate the existing `DropdownMenu` from Navbar.tsx with profile info, tier badge, credits, Profile link, Billing link, Upgrade option, Sign Out.

The TopBar needs the same auth/profile/credits state as the current Navbar. Extract the auth state management (user, profile, credits, getUserInitials, getTierLabel, handleSignOut) into the TopBar component itself (duplicate from Navbar — these are lightweight queries). Import:
- `useThemeLogo` from `@/hooks/useThemeLogo`
- `ThemeToggle` from `@/components/ThemeToggle`
- `useAiCredits` from `@/contexts/AiCreditsContext`
- `useAdminTierTest` from `@/contexts/AdminTierTestContext`
- `UpgradeModal` from `@/components/UpgradeModal`
- All the same UI components the Navbar uses (Avatar, DropdownMenu, Badge, Tooltip, Select, etc.)
- `supabase` from `@/lib/supabaseClient`

Export: `export const TopBar`.

**Create `src/components/DashboardLayout.tsx`** — layout wrapper:

```tsx
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => (
  <div className="min-h-screen bg-background">
    <AppSidebar />
    <div className="pl-[72px]">
      <TopBar />
      {children}
    </div>
  </div>
);
```

This wraps the content area with the sidebar offset. Pages no longer need `min-h-screen bg-background`, `<Navbar />`, or `pt-24`.

**Color system:** Use ONLY semantic tokens — `foreground`, `background`, `muted`, `muted-foreground`, `border`, `primary`. No hardcoded hex/rgb colors.
  </action>
  <verify>
    <automated>cd C:/Projects/strive-ai-hired && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - AppSidebar.tsx exists with collapse/expand toggle, all 9 nav items with correct icons and routes, tooltips, backdrop, active state styling
    - TopBar.tsx exists with logo, theme toggle, admin tier switcher, credits badge, user avatar dropdown
    - DashboardLayout.tsx exists composing AppSidebar + TopBar + children with pl-[72px] offset
    - All three files compile without TypeScript errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Integrate DashboardLayout into App.tsx and remove per-page Navbar imports</name>
  <files>
    src/App.tsx,
    src/components/HomepageRouter.tsx,
    src/pages/Dashboard.tsx,
    src/pages/Upload.tsx,
    src/pages/Results.tsx,
    src/pages/Improvements.tsx,
    src/pages/Jobs.tsx,
    src/pages/LinkedInGrader.tsx,
    src/pages/CareerCompass.tsx,
    src/pages/Profile.tsx,
    src/pages/SkillsGapAnalysis.tsx,
    src/pages/AnalysisHistory.tsx,
    src/pages/AdminUsage.tsx,
    src/pages/RecruitingLens.tsx,
    src/pages/InterviewPrepCoach.tsx,
    src/pages/InterviewPrep.tsx,
    src/pages/ResumeBuilder.tsx
  </files>
  <action>
**Update `src/App.tsx`:**

Import `DashboardLayout` from `@/components/DashboardLayout`.

Wrap ALL `<ProtectedRoute>` children with `<DashboardLayout>`. The pattern:

```tsx
// BEFORE:
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

// AFTER:
<Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
```

Apply this to ALL protected routes: `/upload`, `/results/:id`, `/improvements/:id`, `/dashboard`, `/jobs`, `/linkedin-grader`, `/career-compass`, `/skills-gap-analysis`, `/history`, `/admin/usage`, `/recruiting-lens`, `/interview-prep-coach`, `/interview-prep`, `/profile`, `/onboarding`.

Do NOT wrap public routes (/, /auth, /terms, /privacy, /refund, /pricing, /how-it-works, /questions, *).

**Update `src/components/HomepageRouter.tsx`:**

The HomepageRouter handles the `/` route which shows either a dashboard home (signed-in) or the public landing (signed-out). For the signed-in branch:
- Remove the `<Navbar />` import and usage.
- Instead, import `DashboardLayout` and wrap `<DashboardHome />` in `<DashboardLayout>`.
- For the signed-out branch, keep using `<Navbar />` as-is — public pages retain the top navbar.

So the signed-in branch becomes:
```tsx
if (user) {
  return (
    <DashboardLayout>
      <DashboardHome />
    </DashboardLayout>
  );
}
```

And the signed-out branch keeps:
```tsx
return (
  <div className="min-h-screen bg-background text-foreground">
    <Navbar />
    <ActionFirstHero />
    <BelowFold />
  </div>
);
```

**Update each protected page component** — remove Navbar and adjust layout:

For EVERY protected page listed in files (Dashboard, Upload, Results, Improvements, Jobs, LinkedInGrader, CareerCompass, Profile, SkillsGapAnalysis, AnalysisHistory, AdminUsage, RecruitingLens, InterviewPrepCoach, InterviewPrep, ResumeBuilder):

1. Remove `import { Navbar } from '@/components/Navbar';` line.
2. Remove ALL `<Navbar />` JSX usages (some pages render it in multiple return branches — loading, error, and main).
3. Remove the outer `<div className="min-h-screen bg-background">` wrapper (DashboardLayout provides this).
4. Change `pt-24` to `pt-6` in all content containers (the top navbar offset is no longer needed; a small top padding suffices since TopBar is inline, not fixed).
5. Keep `container mx-auto px-4 pb-12 max-w-*` patterns intact.

For pages with multiple return paths (loading state, error state, main content), ensure ALL paths remove Navbar and the outer min-h-screen wrapper. The page should return just its content — DashboardLayout wraps it.

Example transformation for Dashboard.tsx:
```tsx
// BEFORE (loading/no-resume branch):
if (!loading && !hasResume) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-2xl">
        ...
      </div>
    </div>
  );
}
// AFTER:
if (!loading && !hasResume) {
  return (
    <div className="container mx-auto px-4 pt-6 pb-12 max-w-2xl">
      ...
    </div>
  );
}

// BEFORE (main branch):
return (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="container mx-auto px-4 pt-24 pb-12 max-w-6xl">
      ...
    </div>
  </div>
);
// AFTER:
return (
  <div className="container mx-auto px-4 pt-6 pb-12 max-w-6xl">
    ...
  </div>
);
```

**Important caveats:**
- Do NOT remove Navbar from public pages: HowItWorks.tsx, Pricing.tsx, Questions.tsx, Terms.tsx, Privacy.tsx, Refund.tsx. These are NOT wrapped in ProtectedRoute/DashboardLayout, they still use the top navbar.
- The `HomepageRouter` signed-out branch still uses `<Navbar />`.
- Some pages like Results.tsx have 4-5 return branches — update ALL of them.
- Some pages use `pt-20`, `pt-28` — normalize these to `pt-6` as well for consistency.
  </action>
  <verify>
    <automated>cd C:/Projects/strive-ai-hired && npx tsc --noEmit --pretty 2>&1 | head -40</automated>
  </verify>
  <done>
    - App.tsx wraps all ProtectedRoute children in DashboardLayout
    - HomepageRouter signed-in branch uses DashboardLayout, signed-out branch keeps Navbar
    - All 16 protected page files no longer import or render Navbar
    - All protected pages remove outer min-h-screen wrapper and change pt-24 to pt-6
    - Public pages (HowItWorks, Pricing, Questions, Terms, Privacy, Refund) remain unchanged
    - TypeScript compiles without errors
    - `npm run build` succeeds
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Replaced the top navbar with a fixed vertical sidebar for all signed-in pages. Created three new components:
    - AppSidebar: 72px collapsed icon rail, 220px expanded with labels, toggle animation, tooltips, backdrop
    - TopBar: Strivo logo (top-left), theme toggle and user avatar (top-right)
    - DashboardLayout: Wraps sidebar + top bar + content area with proper offset

    All protected pages now render inside DashboardLayout. Public pages keep the original top navbar.
  </what-built>
  <how-to-verify>
    1. Run `npm run dev` and open http://localhost:8080
    2. **Public page check**: Visit "/" while logged out — should show the original top navbar
    3. **Sign in** and navigate to /dashboard
    4. **Sidebar collapsed state**: Verify a slim 72px sidebar on the left with icon-only buttons. Hover over icons — tooltips should appear immediately (side="right")
    5. **Active state**: The current page icon should have inverted colors (light icon on dark bg or vice versa) with elevation shadow
    6. **Toggle expand**: Click the hamburger/Menu icon at the top of the sidebar. Sidebar should expand to ~220px with labels. Background overlay should appear with slight blur
    7. **Toggle collapse**: Click the X icon OR click the backdrop overlay — sidebar should collapse back to 72px
    8. **Top bar**: Strivo logo should appear top-left (to the right of the sidebar). Theme toggle and user avatar should be top-right
    9. **Navigation**: Click sidebar items (Resume Analysis, Career Compass, LinkedIn Grader, etc.) — should navigate to correct pages
    10. **Content offset**: Page content should not be hidden behind the sidebar — there should be a 72px left padding
    11. **Theme toggle**: Dark/light mode switch should still work from the top bar
    12. **User avatar dropdown**: Click avatar — should show profile info, tier, credits, sign out option
    13. **Public pages**: Visit /pricing, /how-it-works — should still show the original top navbar, NOT the sidebar
  </how-to-verify>
  <resume-signal>Type "approved" or describe specific issues to fix</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | This is a purely cosmetic frontend layout change with no new data flows or API calls |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | TopBar avatar dropdown | accept | Reuses existing Navbar auth patterns; no new data exposure. Profile/credits queries are already user-scoped via Supabase RLS |
</threat_model>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npm run build` completes successfully
- `npm run lint` passes (or has no new warnings)
- Visual inspection confirms sidebar renders on all protected pages
- Visual inspection confirms public pages retain top navbar
</verification>

<success_criteria>
- Signed-in users see a fixed 72px vertical sidebar on the left edge with all nav items as icons
- Sidebar expands to 220px with labels on toggle, with smooth 300ms cubic-bezier animation
- Active nav item displays with inverted bg-foreground/text-background colors and shadow
- Tooltips appear on hover when collapsed (delayDuration=0, side="right")
- Backdrop overlay appears when expanded; clicking it closes the sidebar
- Top bar shows Strivo logo (left), theme toggle + user avatar (right)
- Main content offset by pl-[72px] — no overlap with collapsed sidebar
- Public pages (/pricing, /how-it-works, /questions, /terms, /privacy, /refund) unchanged
- No TypeScript errors, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/260416-omv-replace-top-navbar-with-fixed-vertical-s/260416-omv-SUMMARY.md`
</output>
