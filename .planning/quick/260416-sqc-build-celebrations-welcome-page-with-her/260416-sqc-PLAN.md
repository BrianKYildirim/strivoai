---
phase: quick
plan: 260416-sqc
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pages/Celebrations.tsx
  - src/App.tsx
  - src/components/AppSidebar.tsx
  - src/components/Navbar.tsx
autonomous: false
requirements: []
must_haves:
  truths:
    - "Navigating to /celebrations renders the full celebrations page for authenticated users"
    - "Hero section displays animated headline with gradient text, ambient glows, and bouncing arrow"
    - "Audio player plays/pauses the MP3, triggers confetti on first play, shows animated visualizer bars while playing"
    - "Letter section appears after 3s delay with personalized first name, scroll-triggered blur-to-clear reveal paragraphs"
    - "Animated user count ticks up to target number with counting animation"
    - "What's Next section appears after 4.2s with 3 action cards linking to /upload, /linkedin-grader, /career-compass"
    - "Sidebar Celebrations link is enabled and navigates to /celebrations"
    - "Public navbar includes Celebrations link"
  artifacts:
    - path: "src/pages/Celebrations.tsx"
      provides: "Full celebrations welcome page component"
      min_lines: 200
    - path: "src/App.tsx"
      provides: "Route registration for /celebrations"
      contains: "celebrations"
    - path: "src/components/AppSidebar.tsx"
      provides: "Enabled sidebar link"
    - path: "src/components/Navbar.tsx"
      provides: "Public nav link for Celebrations"
  key_links:
    - from: "src/App.tsx"
      to: "src/pages/Celebrations.tsx"
      via: "React Router Route + lazy import"
      pattern: "Celebrations.*celebrations"
    - from: "src/components/AppSidebar.tsx"
      to: "/celebrations"
      via: "NavItem to prop"
      pattern: 'to:.*"/celebrations"'
---

<objective>
Build a Celebrations welcome/onboarding page at /celebrations with a full-screen dark theme, glassmorphic design, and rich framer-motion animations.

Purpose: Create an emotionally engaging onboarding experience that celebrates new users joining Strivo, drives them to take their first actions (resume upload, LinkedIn grading, Career Compass), and reinforces platform value.

Output: A complete `Celebrations.tsx` page, registered route, and enabled navigation links in sidebar and public navbar.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/components/AppSidebar.tsx
@src/components/Navbar.tsx
@src/components/DashboardHome.tsx (profile fetch pattern reference)
@public/adventureofalifetime.mp3

<interfaces>
<!-- Profile fetching pattern from DashboardHome.tsx -->
From src/components/DashboardHome.tsx:
```typescript
// Fetch user + profile
const { data: { user } } = await supabase.auth.getUser();
const profileResult = await supabase
  .from("profiles")
  .select("full_name, subscription_tier, email")
  .eq("id", user.id)
  .single();

// Extract first name
const getFirstName = () => {
  if (profile?.full_name) {
    return profile.full_name.split(" ")[0];
  }
  if (userMetaName) {
    return userMetaName.split(" ")[0];
  }
  return user?.email?.split("@")[0] || "friend";
};
```

From src/integrations/supabase/types.ts:
```typescript
// profiles table row
full_name: string | null
```

From src/App.tsx (route pattern):
```typescript
// Protected route with DashboardLayout pattern
<Route path="/celebrations" element={<ProtectedRoute><DashboardLayout><Celebrations /></DashboardLayout></ProtectedRoute>} />
```

From src/components/AppSidebar.tsx (line 38 - to be modified):
```typescript
{ label: "Celebrations", to: "#", icon: <PartyPopper className="w-5 h-5" />, disabled: true },
// Change to:
{ label: "Celebrations", to: "/celebrations", icon: <PartyPopper className="w-5 h-5" /> },
```

From src/components/Navbar.tsx (publicLinks array, line 139-145):
```typescript
const publicLinks = useMemo(
  () => [
    { to: "/", label: "Home" },
    { to: "/how-it-works", label: "How it works" },
    { to: "/pricing", label: "Pricing" },
    { to: "/questions", label: "Questions" },
  ], []
);
// Add { to: "/celebrations", label: "Celebrations" } before Questions
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Celebrations page component</name>
  <files>src/pages/Celebrations.tsx</files>
  <action>
Create `src/pages/Celebrations.tsx` as a single self-contained page component. The page uses a full-screen dark theme (NOT the app's existing theme -- override with inline bg-black text-white on the outermost wrapper, min-h-screen). All sections use glassmorphic styling (bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl).

**Animation constants** (use throughout):
- Easing: `[0.22, 1, 0.36, 1]`
- All viewport-triggered animations: `viewport={{ once: true, amount: 0.3 }}`
- Glassy reveal variant: `initial={{ opacity: 0, y: 30, filter: "blur(14px)" }}` -> `whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}` with `transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}`

**State and data fetching:**
- Use `useState` + `useEffect` to fetch user profile from Supabase (same pattern as DashboardHome.tsx -- see interfaces block above)
- Extract first name with fallback chain: `profile.full_name.split(" ")[0]` -> `user.user_metadata?.full_name` -> `user.email?.split("@")[0]` -> `"friend"`
- Import supabase client from `@/integrations/supabase/client`

**Section 1 -- Hero** (visible immediately):
- Two ambient glow divs: one indigo (`bg-indigo-500/20 blur-[120px]`) positioned top-left, one amber (`bg-amber-500/15 blur-[100px]`) positioned bottom-right, both absolute, pointer-events-none
- Pill badge: `<motion.div>` with bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm text-white/80. Text: "welcome aboard". Fade in from y: -10
- Headline: Large text (text-5xl md:text-7xl font-bold), gradient text using `bg-gradient-to-r from-white via-indigo-200 to-amber-200 bg-clip-text text-transparent`. Text: "your career journey starts now." (all lowercase). Staggered fade, delay 0.2s
- Subcopy: text-lg md:text-xl text-white/60 max-w-2xl mx-auto. Text: "We built Strivo to help ambitious professionals like you stand out, get noticed, and land the roles you deserve." Delay 0.4s
- Bouncing chevron-down arrow at bottom of hero: use `motion.div` with `animate={{ y: [0, 10, 0] }}` `transition={{ repeat: Infinity, duration: 1.5 }}`. Use ChevronDown from lucide-react

**Section 2 -- Audio Player** (delay 1s):
- Glassmorphic card (bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6)
- Row layout: play/pause button (circle, bg-white/10 hover:bg-white/20, 56x56px) with Play/Pause icons from lucide-react
- Track info column: title "Adventure of a Lifetime" (text-white font-medium), artist "Coldplay" (text-white/50 text-sm)
- 4-bar audio visualizer: 4 divs (w-1 rounded-full bg-indigo-400), each with different `animate={{ height: ["12px", "28px", "12px"] }}` durations (0.4s, 0.6s, 0.5s, 0.7s) and delays. Only animate when `isPlaying` is true; when paused, set all to fixed height 12px
- HTML5 `<audio>` element ref with src="/adventureofalifetime.mp3"
- On play button click: toggle play/pause. On FIRST play only, fire `confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })` from canvas-confetti. Track "has played" with a useRef boolean
- Handle audio end event: set isPlaying to false

**Section 3 -- Letter** (appears after 3s, use `useState` + `useEffect` with `setTimeout`):
- Wrap entire section in `<AnimatePresence>` + conditional render based on `showLetter` state
- Glassmorphic card, max-w-2xl mx-auto
- Header row: left side "a note from strivo" (text-white/50 uppercase tracking-widest text-xs), right side current date formatted as "Month Day, Year" (use `new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })`)
- Separator: `<div className="h-px bg-white/10 my-4" />`
- Greeting: `Dear {firstName},` (text-xl text-white font-medium mb-4)
- 3 paragraphs, each wrapped in `<motion.p>` with the glassy blur-to-clear reveal animation (blur 14px -> 0, y: 20 -> 0), staggered delays (0s, 0.3s, 0.6s relative to parent), viewport-triggered:
  1. "We're genuinely excited to have you here. Strivo wasn't built for everyone -- it was built for people who refuse to settle, who know their career deserves more than a generic template and a prayer."
  2. "Every tool on this platform exists because we asked one question: what would actually help someone land their dream role? Not what looks good in a demo. Not what's easy to build. What actually moves the needle."
  3. "So explore. Upload your resume. Grade your LinkedIn. Map your career path. We built all of this for people exactly like you -- and we can't wait to see where you go."
- Signature block: "With ambition," on one line, then "The Strivo Team" with a Heart icon (lucide-react, inline, text-red-400, w-4 h-4) next to it
- All text in the letter body: text-white/70 leading-relaxed

**Section 4 -- User Count** (delay 2s, counting animation):
- Centered text block
- "you're user #" then an animated counter that counts from 0 to 12847, then " to take their career seriously this month"
- Counter animation: use `useEffect` + `requestAnimationFrame` loop over ~2 seconds. Start counting when the element enters the viewport (use a ref + IntersectionObserver, or trigger from the delay state). Format number with `toLocaleString()` for comma separation
- Text styling: text-2xl md:text-3xl font-bold text-white, the number itself highlighted with text-indigo-300

**Section 5 -- What's Next** (appears after 4.2s, same AnimatePresence pattern):
- Heading: "what's next" (text-3xl md:text-4xl font-bold text-white mb-2), subcopy "three things you can do right now" (text-white/50)
- 3 action cards in a grid (grid grid-cols-1 md:grid-cols-3 gap-6):
  - Card 1: Upload icon (lucide), "Upload Your Resume", "Get an AI-powered analysis with actionable feedback", link to "/upload"
  - Card 2: Linkedin icon (lucide), "Grade Your LinkedIn", "See how recruiters view your profile", link to "/linkedin-grader"  
  - Card 3: Compass icon (lucide), "Career Compass", "Map your next career moves with AI guidance", link to "/career-compass"
- Each card: glassmorphic styling, hover:bg-white/10 transition, p-6, flex flex-col items-center text-center gap-3. Icon in a circle (bg-indigo-500/20 p-3 rounded-full). Title text-white font-semibold, description text-white/50 text-sm. Entire card is a Link (react-router-dom)
- Cards stagger in with glassy reveal, 0.15s delay between each
- Final CTA below cards: `<Link to="/upload">` styled as a button (bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-full transition-all). Text: "Let's get started"

**Imports needed:**
- `{ useState, useEffect, useRef }` from "react"
- `{ motion, AnimatePresence }` from "framer-motion"
- `{ Link }` from "react-router-dom"
- `confetti` from "canvas-confetti"
- `{ ChevronDown, Play, Pause, Heart, Upload, Linkedin, Compass }` from "lucide-react"
- `{ supabase }` from "@/integrations/supabase/client"

**Component structure:** Single default export `Celebrations`. No sub-files. All sections in one component since they share state (user name, delay timers).
  </action>
  <verify>
    <automated>cd C:/Projects/strive-ai-hired && npx tsc --noEmit src/pages/Celebrations.tsx 2>&1 | head -20</automated>
  </verify>
  <done>Celebrations.tsx compiles without TypeScript errors, contains all 5 sections (hero, audio player, letter, user count, what's next), fetches user profile for personalization, uses framer-motion for all animations including glassy blur-to-clear reveals, and fires canvas-confetti on first audio play.</done>
</task>

<task type="auto">
  <name>Task 2: Register route and enable navigation links</name>
  <files>src/App.tsx, src/components/AppSidebar.tsx, src/components/Navbar.tsx</files>
  <action>
**src/App.tsx:**
1. Add import at line 38 (after ExploreFeatures import): `import Celebrations from "./pages/Celebrations";`
2. Add route at line 71 (before the /profile route): `<Route path="/celebrations" element={<ProtectedRoute><DashboardLayout><Celebrations /></DashboardLayout></ProtectedRoute>} />`

**src/components/AppSidebar.tsx:**
1. Line 38: Change `{ label: "Celebrations", to: "#", icon: <PartyPopper className="w-5 h-5" />, disabled: true }` to `{ label: "Celebrations", to: "/celebrations", icon: <PartyPopper className="w-5 h-5" /> }` (remove `disabled: true` and change `to` from "#" to "/celebrations")

**src/components/Navbar.tsx:**
1. In the `publicLinks` array (around line 139-145), add `{ to: "/celebrations", label: "Celebrations" }` before the Questions entry, so the order is: Home, How it works, Pricing, Celebrations, Questions
  </action>
  <verify>
    <automated>cd C:/Projects/strive-ai-hired && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Production build succeeds. /celebrations route is registered. Sidebar shows enabled Celebrations link pointing to /celebrations. Public navbar includes Celebrations in the link list.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Full Celebrations welcome page with hero, audio player with confetti, personalized letter, animated user count, and What's Next action cards. Glassmorphic dark theme design with framer-motion animations.</what-built>
  <how-to-verify>
    1. Run `npm run dev` and navigate to http://localhost:8080/celebrations (you must be logged in)
    2. Verify hero section: ambient glows visible, "welcome aboard" pill fades in, headline has gradient text, bouncing arrow at bottom
    3. Click the play button on the audio player: confirm confetti fires on first click, music plays, 4 bars animate. Click pause, bars stop. Click play again -- no confetti this time
    4. Wait 3 seconds: letter section should appear with your first name in the greeting, paragraphs reveal with blur-to-clear as you scroll
    5. Scroll to user count: number should animate from 0 up to 12,847 with comma formatting
    6. Wait 4.2 seconds from page load: What's Next section appears with 3 cards. Click each card to verify they navigate to /upload, /linkedin-grader, /career-compass
    7. Check sidebar: Celebrations link should be active (not grayed out), click it to navigate to /celebrations
    8. Log out and check public navbar at / -- Celebrations should appear in the top nav links
  </how-to-verify>
  <resume-signal>Type "approved" or describe any visual/functional issues to fix</resume-signal>
</task>

</tasks>

<verification>
- `npm run build` succeeds with no errors
- TypeScript compilation passes for all modified files
- /celebrations route renders inside ProtectedRoute + DashboardLayout
- Audio plays and pauses correctly with visualizer responding to state
- Confetti fires exactly once (first play only)
- Letter section personalizes with logged-in user's first name
- All 3 action cards navigate to correct routes
- Sidebar link enabled and functional
- Public navbar includes Celebrations link
</verification>

<success_criteria>
- Celebrations page is accessible at /celebrations for authenticated users
- All 5 sections render with correct framer-motion animations (staggered fades, glassy blur reveals, counting animation)
- Audio player works end-to-end with confetti on first play
- Page is personalized with user's first name
- Navigation updated in both sidebar and public navbar
- Production build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260416-sqc-build-celebrations-welcome-page-with-her/260416-sqc-SUMMARY.md`
</output>
