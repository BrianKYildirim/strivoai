# Phase 34: Celebrations Light/Dark Polish - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `/celebrations` render correctly in both light and dark themes, pass WCAG AA contrast on all surfaces, and visually conform to Strivo's design system (semantic tokens + `<Card>` primitives) while preserving the page's three intentional emotional moments (cinematic hero gradient, audio player, hand-written letter).

Scope is a single file: `src/pages/Celebrations.tsx`. Tailwind theme tokens and existing `<Card>` primitive are reused — no new design system work.

</domain>

<decisions>
## Implementation Decisions

### Theme strategy

* **D-01:** Light mode matches other Strivo dashboard surfaces — `bg-background` + `text-foreground` + `bg-card` + subtle border. Same visual language as `/pricing`, `/upload`, `/career-compass`. Don't invent a bespoke light aesthetic.
* **D-02:** Dark mode also uses semantic tokens (`bg-background`, `bg-card`) — drop literal `bg-black` so the page evolves with the system. No `dark:bg-black` carve-outs.
* **D-03:** Respect the user's `next-themes` preference. No theme forcing on `/celebrations`. (The page is reachable from elsewhere beyond post-signup, so it must read as a normal dashboard surface in either theme.)
* **D-04:** All literal `text-white`, `text-white/40|50|60|80`, `bg-white/5|10`, `border-white/[0.06]|10` → map to `text-foreground` / `text-muted-foreground` / `bg-card` / `border` / `border-border` per role. Goal: zero `bg-black`, `text-white`, or `bg-white/*` survives in source (CELEB-01 acceptance).

### Brand accent palette

* **D-05:** Keep the three expressive gradient moments — they're the page's reason for existing — but make each one theme-aware:
  * "your **unfair advantage** starts now." headline (currently `from-indigo-400 via-violet-400 to-blue-400`)
  * "**strive for excellence**" phrase (currently `from-yellow-300 via-orange-300 to-amber-400`)
  * user `#count` number (currently `from-indigo-300 via-violet-300 to-blue-300`)
  * Each gets a deliberate light-mode gradient pair (likely `dark:from-indigo-400` style overrides with darker, more saturated stops for light mode) chosen to pass WCAG AA on `bg-background` in both themes.
* **D-06:** CTA button stops using the indigo→purple gradient. Use `bg-primary` + `hover:bg-primary/90` (the standard Strivo button treatment).
* **D-07:** Audio-player visualizer bars → `bg-primary` (was `bg-indigo-400`).
* **D-08:** Action-card icon chip → `bg-primary/10` + `text-primary` (was `bg-indigo-500/20` with `text-white` icons).
* **D-09:** Signature heart SVG (red→pink gradient) stays as-is — small intentional warmth, theme-neutral. Not worth tokenizing.

### Card primitive adoption

* **D-10:** All three card-like surfaces migrate to the shadcn `<Card>` primitive from `src/components/ui/card.tsx`:
  1. Audio player (currently bespoke `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6`)
  2. Letter from Strivo (currently bespoke `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8`)
  3. Three action tiles (currently bespoke `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6`)
* **D-11:** Action tiles are `<Card>` wrapped in a React Router `<Link>` with a hover state (e.g., `hover:bg-accent` or shadow lift). Do NOT convert to `<Button>` — they're navigation, not actions, and they need multi-line title + description layout.
* **D-12:** Letter copy is unchanged. Theme work only — lowercase / hand-written prose stays. Color classes update so the hierarchy (emphasized `text-foreground` vs body `text-muted-foreground`) still reads in both themes.
* **D-13:** Keep current per-section spacing rhythm — `min-h-[80vh]` hero, `py-20`/`pb-16` per section, `max-w-2xl` letter, `max-w-4xl` what's-next, action grid `gap-6`. Do not force a generic dashboard container; the narrow letter width is intentional for the intimate reading experience.

### Ambient effects

* **D-14:** Hero ambient blur glows (`bg-indigo-500/20` and `bg-amber-500/15`, ~~80–96rem blurred 100–120px):~~ **~~keep, but dimmer in light mode.~~** ~~Reduce opacity (~~`/20 → /8` and `/15 → /6`) and pick a tint that still reads as warmth, not a muddy blob, on `bg-background`. Acceptable for WCAG since glows sit behind text, not adjacent.
* **D-15:** `backdrop-blur-xl` on the audio player + letter + tiles: **drop.** Once those surfaces are plain `<Card>` on `bg-background`, there's nothing meaningful behind them to blur — the blur was only meaningful over the prior literal-black glass aesthetic. Cleaner and faster, matches every other Card in Strivo.
* **D-16:** Framer Motion animations are out of scope for this phase — keep blur-to-clear reveals, bouncing arrow, visualizer bar pulses, and the first-play confetti exactly as-is. `prefers-reduced-motion` handling is **not added here** (separate concern, not in CELEB requirements).

### Claude's Discretion

* Exact light-mode gradient color stops for the three hero moments — pick stops that pass WCAG AA on `bg-background` while preserving the indigo/violet/blue and yellow/orange/amber families.
* Exact `border` token choice per Card (`border` vs `border-border` vs the Card primitive's default) — pick what the existing dashboard cards use.
* The `dark:` opacity values for the ambient hero glows — tune visually so they don't feel washed-out vs the current dark-only version.
* Hover affordance for action tiles (`hover:bg-accent` vs subtle shadow lift) — match whatever pattern other dashboard nav tiles use.

</decisions>

\<canonical\_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope

* `.planning/ROADMAP.md` §"Phase 34: Celebrations Light/Dark Polish" — goal, dependencies, success criteria, out-of-scope notes
* `.planning/REQUIREMENTS.md` §"CELEB — Celebrations page" — CELEB-01/02/03 acceptance language (notably: "no literal `bg-black`, `text-white`, or `bg-white/10` survives in source")

### Code under change

* `src/pages/Celebrations.tsx` — the single file being polished

### Design system

* `src/components/ui/card.tsx` — the `<Card>`/`<CardHeader>`/`<CardContent>`/etc. primitives that must be adopted (CELEB-03)
* `tailwind.config.ts` — semantic color tokens (`primary`, `background`, `foreground`, `card`, `card-foreground`, `muted-foreground`, `accent`, `border`)
* `src/index.css` — CSS variable definitions for `:root` (light) and `.dark` (dark) theme tokens that the Tailwind colors resolve against

### Conventions

* `.planning/codebase/CONVENTIONS.md` — file naming, import order, error handling, logging conventions

\</canonical\_refs>

\<code\_context>

## Existing Code Insights

### Reusable Assets

* `<Card>` primitive (`src/components/ui/card.tsx`) — already provides `rounded-lg border bg-card text-card-foreground shadow-sm` with sub-components for header / content / footer. Replaces all three bespoke "frosted glass" containers.
* `next-themes` is already wired up globally (per stack) — no theme-detection code needed in the page itself, just correct use of `dark:` Tailwind variants.
* `framer-motion` (`motion`, `AnimatePresence`) — already imported and configured in `Celebrations.tsx`. Keep usage unchanged.
* `canvas-confetti` — already imported for the first-play audio celebration. Keep.
* Lucide icons (`ChevronDown`, `Play`, `Pause`, `Upload`, `Linkedin`, `Compass`) — already used. They render at the color of their parent; switching parent class to `text-primary` makes them theme-aware automatically.
* `supabase` auth + `profiles.full_name` fetch — keep the existing greeting-name logic verbatim; nothing about user data changes.

### Established Patterns

* Tailwind utility classes with `dark:` variants for theme switching (the project's standard pattern — visible across dashboard pages).
* Semantic design tokens (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `border-border`) — confirmed by CLAUDE.md project memory: "Use semantic design tokens, not hardcoded colors."
* React Router `<Link>` for navigation tiles (existing pattern used by the three action cards today — keep).
* `lowercase` prose tone in this page only — intentional, do not normalize.

### Integration Points

* `/celebrations` route registration is unchanged; just the rendered component changes.
* No backend, edge function, migration, or shared utility changes. Single-file UI patch.

\</code\_context>

<specifics>
## Specific Ideas

* Three explicit "emotional peaks" preserved as gradient text: **unfair advantage**, **strive for excellence**, and the live user **#count**. Each must keep its specific color family (indigo/violet/blue, yellow/orange/amber, indigo/violet/blue) — just with theme-aware variants.
* The audio player's "Adventure of a Lifetime / Coldplay" labeling and visualizer bar behavior (animated when `isPlaying`) are preserved unchanged in look and timing.
* The Strivo signature block: the red→pink heart SVG with its inline `<linearGradient>` is intentionally hand-crafted and stays.
* The page is reachable from nav/settings beyond the immediate post-signup moment — treat it as a returning user might land here too, not just first-timers.

</specifics>

<deferred>
## Deferred Ideas

* `prefers-reduced-motion` handling for the Framer Motion blur reveals, bouncing arrow, and visualizer bars — explicitly out of scope here. Could be a future accessibility pass across all animated pages, not just `/celebrations`.
* Copy / capitalization edits to the letter prose — out of scope. CELEB requirements are theming + style consistency only.
* Aligning `/celebrations` to a strict dashboard container width — rejected; the narrow `max-w-2xl` letter width is intentional for reading intimacy.

</deferred>

***

*Phase: 34-Celebrations Light/Dark Polish*
*Context gathered: 2026-05-16*
