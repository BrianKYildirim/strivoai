# Phase 34: Celebrations Light/Dark Polish - Research

**Researched:** 2026-05-22
**Domain:** React/Tailwind/shadcn UI theming, WCAG contrast, dashboard surface polish
**Confidence:** HIGH for implementation shape; MEDIUM for strict border-contrast interpretation

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

* `prefers-reduced-motion` handling for the Framer Motion blur reveals, bouncing arrow, and visualizer bars — explicitly out of scope here. Could be a future accessibility pass across all animated pages, not just `/celebrations`.
* Copy / capitalization edits to the letter prose — out of scope. CELEB requirements are theming + style consistency only.
* Aligning `/celebrations` to a strict dashboard container width — rejected; the narrow `max-w-2xl` letter width is intentional for reading intimacy.
</user_constraints>

## Summary

Phase 34 is a narrow single-file UI patch in `src/pages/Celebrations.tsx`. The planner should not create backend, routing, shared design-token, or pricing-page work. The core implementation is replacing the page's hardcoded black/white glass aesthetic with Strivo's existing semantic Tailwind tokens, adopting `Card` for the audio player, letter, and navigation tiles, and preserving the current animation/audio/confetti behavior.

The strongest implementation path is: import `Card` and `Button`; change the root to `bg-background text-foreground`; replace all `text-white/*`, `bg-white/*`, and `border-white/*` with semantic tokens; use theme-aware gradient text stops; wrap the three navigation tiles as `Link > Card`; and add a static Vitest guard like the Phase 33 pricing token guard so forbidden tokens cannot regress.

**Primary recommendation:** Plan one focused code task plus one focused verification task: semantic-token/Card migration in `Celebrations.tsx`, then static token guard + manual light/dark contrast QA.

## Standard Stack

### Core

| Library/Primitive | Version / Source | Purpose | Why Standard |
|---|---:|---|---|
| React | 18.3.1 resolved | Page component and hooks | Existing app stack. |
| React Router `Link` | 6.30.3 resolved | Action-card navigation | Existing `/celebrations` action tiles already use `Link`; D-11 locks this. |
| Tailwind CSS | 3.4.19 resolved, v3 docs checked | Semantic utility classes, `dark:` variants, gradient stops | `tailwind.config.ts` maps CSS variables to `bg-background`, `text-foreground`, `bg-card`, `border-border`, etc. |
| shadcn/ui `Card` | local `src/components/ui/card.tsx` | Card surfaces | Local primitive already provides `rounded-lg border bg-card text-card-foreground shadow-sm`. |
| shadcn/ui `Button` | local `src/components/ui/button.tsx` | CTA treatment | Local default button maps to `bg-primary ... hover:bg-primary/90`; use it with a page-local text color override for AA contrast. |

### Supporting

| Library/Primitive | Version / Source | Purpose | When to Use |
|---|---:|---|---|
| Framer Motion | 12.39.0 resolved | Existing reveal/bounce/visualizer animation | Keep existing `motion` and `AnimatePresence` usage; no new motion behavior. |
| canvas-confetti | 1.9.4 resolved | First-play celebration | Keep import and behavior unchanged. |
| lucide-react | 0.462.0 resolved | Icons | Keep existing icons; let parent `text-*` classes drive icon color. |
| `ThemeToggle` / root classes | local `src/components/ThemeToggle.tsx` | Current dashboard theme switching | The page should remain passive and rely on root `light`/`dark` classes. Do not set theme in `Celebrations.tsx`. |

### Alternatives Considered

No alternatives were researched for locked decisions. The context locks a single-file semantic-token/Card migration and explicitly excludes new design-system work.

**Installation:** None. All needed dependencies and primitives already exist.

## Architecture Patterns

### Recommended Project Structure

```text
src/
  pages/
    Celebrations.tsx                 # only implementation file in scope
    __tests__/
      celebrations-token-guard.test.ts # recommended new static guard
  components/ui/
    card.tsx                         # existing primitive; import only
    button.tsx                       # existing primitive; import only
```

### Pattern 1: Semantic Root And Passive Theme

**What:** The page root should be `min-h-screen bg-background text-foreground overflow-x-hidden`. Theme switching is already controlled outside this page by the root `light`/`dark` class, so `/celebrations` should not call `setTheme`, inspect `localStorage`, or add/remove root classes.

**When to use:** Always for this phase.

**Example:**

```tsx
return (
  <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
    ...
  </div>
);
```

**Evidence:** Tailwind v3 docs state that `dark:` variants respond to an earlier root dark selector/class; shadcn theming docs map CSS variables into utilities like `bg-background`, `text-foreground`, and `border-border`. Local `tailwind.config.ts` and `src/index.css` match that token model.

### Pattern 2: Card Primitive For Surfaces

**What:** Keep Framer Motion as a wrapper and make the actual visual surface a `Card`.

**When to use:** Audio player, letter, and each action tile.

**Example:**

```tsx
<motion.div {...motionProps}>
  <Card className="p-6">
    ...
  </Card>
</motion.div>
```

For action tiles:

```tsx
<Link
  to={card.to}
  className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
>
  <Card className="flex h-full flex-col items-center gap-3 p-6 text-center transition-colors hover:border-primary/30 hover:bg-secondary/50">
    <div className="rounded-full bg-primary/10 p-3 text-primary">
      {card.icon}
    </div>
    <h3 className="font-semibold text-card-foreground">{card.title}</h3>
    <p className="text-sm text-muted-foreground">{card.description}</p>
  </Card>
</Link>
```

**Why this pattern:** It satisfies D-10/D-11 while matching dashboard navigation tiles in `DashboardHome.tsx` and `FeatureCards.tsx`, which use semantic backgrounds, border hover, and icon chips.

### Pattern 3: Use High-Contrast Gradient Stops By Theme

**What:** Set light-mode gradient stops as the base classes and restore the current lighter dark-mode stops with `dark:` variants.

**When to use:** Only the three locked expressive text moments.

**Prescribed stops:**

| Moment | Light-mode classes | Dark-mode classes | Confidence |
|---|---|---|---|
| `unfair advantage` | `from-indigo-700 via-violet-700 to-blue-700` | `dark:from-indigo-400 dark:via-violet-400 dark:to-blue-400` | HIGH |
| `strive for excellence` | `from-yellow-700 via-orange-700 to-amber-700` | `dark:from-yellow-300 dark:via-orange-300 dark:to-amber-400` | HIGH |
| `#count` | `from-indigo-700 via-violet-700 to-blue-700` | `dark:from-indigo-300 dark:via-violet-300 dark:to-blue-300` | HIGH |

**Contrast basis:** Local Tailwind palette contrast checks showed all recommended light stops are at least 4.92:1 on white, and all dark stops are at least 7.04:1 on black for the blue/violet set or 12.45:1 for the warm set. This covers normal text, including the small `#count`.

### Pattern 4: Text Token Mapping

**What:** Use unmodified semantic text tokens for readable hierarchy. Avoid opacity modifiers on text unless verified, because opacity can push otherwise safe colors under AA.

**Mapping:**

| Current Class | Use Instead |
|---|---|
| `text-white`, `text-white/80` for primary labels | `text-foreground` or inherited `text-card-foreground` |
| `text-white/60`, `text-white/50`, `text-white/40` for supporting text | `text-muted-foreground` |
| `bg-white/5`, `bg-white/10` surface | `<Card>` default `bg-card` |
| `border-white/10`, `border-white/[0.06]` | `border-border` or Card default border |
| `bg-indigo-400` visualizer bars | `bg-primary` |
| `bg-indigo-500/20` icon chip | `bg-primary/10 text-primary` |

**Contrast basis:** `text-muted-foreground` passes 4.5:1 on both `bg-background` and `bg-card` in both themes. `text-primary` should be reserved for icons/graphics or large text because in light mode it is 3.71:1 on `bg-card` and 3.87:1 on `bg-background`.

### Pattern 5: CTA Button Contrast Caveat

**What:** Use the standard `bg-primary hover:bg-primary/90` treatment, but do not rely on `text-primary-foreground` for a normal-size label unless the label is large enough for the 3:1 large-text threshold.

**Why:** Current theme tokens make white text on `bg-primary` 3.87:1 in light mode and 3.01:1 in dark mode. That fails WCAG AA for normal text. A page-local override can keep the locked `bg-primary` treatment while making the label pass:

```tsx
<Button
  asChild
  size="lg"
  className="rounded-full px-8 bg-primary hover:bg-primary/90 text-foreground dark:text-background"
>
  <Link to="/upload">Let's get started</Link>
</Button>
```

**Contrast basis:** `text-foreground` on light `bg-primary` is 4.76:1. `dark:text-background` on dark `bg-primary` is 6.97:1. This avoids global token changes.

### Pattern 6: Ambient Glows

**What:** Keep the two blur glows but make light mode dimmer and dark mode close to the current visual.

**Example:**

```tsx
<div className="absolute top-0 left-0 w-96 h-96 rounded-full bg-indigo-500/[0.08] blur-[120px] pointer-events-none dark:bg-indigo-500/20" />
<div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-amber-500/[0.06] blur-[100px] pointer-events-none dark:bg-amber-500/15" />
```

Use arbitrary opacity (`/[0.08]`, `/[0.06]`) because Tailwind's default opacity scale does not include `8` or `6`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Card surfaces | Custom `rounded-2xl bg-white/5 backdrop-blur-xl border-white/10` containers | Existing `Card` primitive | Locked by D-10 and already theme-aware. |
| CTA behavior | Custom gradient link button | Existing `Button asChild` with `bg-primary hover:bg-primary/90` | Matches local button convention and D-06. |
| Theme detection | Page-local `useTheme`, `localStorage`, root class mutation | Passive semantic classes and `dark:` variants | D-03 says no theme forcing. |
| Color system | New Tailwind colors or CSS variables | Existing semantic tokens + Tailwind palette stops | Context says no design-system work. |
| Motion accessibility | New `prefers-reduced-motion` wrappers | Existing animations unchanged | D-16 explicitly defers this. |
| Route/data flow | Route changes, profile fetch rewrites, new backend calls | Keep current route and Supabase name fetch | Phase scope is single-file visual polish. |

**Key insight:** This phase is not a redesign. The correct plan is mostly deletion/replacement of hardcoded visual classes, not new abstractions.

## Common Pitfalls

### Pitfall 1: Replacing `text-white/60` With `text-foreground/60`

**What goes wrong:** The source no longer contains `text-white`, but text still becomes low contrast in light mode due to opacity.

**How to avoid:** Use `text-muted-foreground` for supporting copy and `text-foreground`/`text-card-foreground` for emphasis. Do not use opacity modifiers on text unless contrast is checked.

### Pitfall 2: Default Button Text Fails Normal-Text AA

**What goes wrong:** The local Button default uses `text-primary-foreground`, which is white in both themes. White on the current primary red is below 4.5:1 for normal-size text.

**How to avoid:** Keep `bg-primary hover:bg-primary/90`, but override the CTA label to `text-foreground dark:text-background` or make the label genuinely large text. The safer plan is the explicit text-color override.

### Pitfall 3: Treating Card Borders As Strict 3:1 Boundaries

**What goes wrong:** Current `border-border` is intentionally subtle and measures about 1.32:1 on light `bg-background` and 1.39:1 on dark `bg-background`. A strict "all borders must be 3:1" interpretation conflicts with D-01/D-10's use of the existing Card primitive and subtle border.

**How to avoid:** Use Card default border for style consistency, ensure text/icons/focus rings pass, and call this out in verification. If the verifier literally requires 3:1 card borders, the locked context requires clarification or a design-token exception.

### Pitfall 4: Putting `hover:bg-accent` On Action Tiles

**What goes wrong:** In this project `accent` equals primary red. A whole-card red hover can feel unlike dashboard nav tiles and may reduce text/icon contrast unless every nested color is reviewed.

**How to avoid:** Prefer `hover:bg-secondary/50 hover:border-primary/30` with a `group-hover:bg-primary/15` icon chip. This matches existing dashboard cards more closely.

### Pitfall 5: Leaving Old Glass Classes In Data Constants

**What goes wrong:** It is easy to update JSX surfaces but forget `letterParagraphs` class strings.

**How to avoid:** Include `letterParagraphs` in the static token guard and grep the whole `Celebrations.tsx` source for forbidden classes.

## Code Examples

Verified local patterns the planner can reference.

### Letter Paragraph Mapping

```tsx
const letterParagraphs: { text: string; className?: string }[] = [
  { text: "...", className: "text-muted-foreground leading-[1.8]" },
  { text: "...", className: "text-lg text-foreground font-medium leading-[1.8]" },
];
```

### Audio Player Card

```tsx
<Card className="p-6">
  <div className="flex items-center gap-4">
    <button
      onClick={togglePlay}
      className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-primary text-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-background"
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
    </button>
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-card-foreground">Adventure of a Lifetime</p>
      <p className="text-sm text-muted-foreground">Coldplay</p>
    </div>
  </div>
</Card>
```

### Static Token Guard Test

Follow the existing pattern in `src/pages/__tests__/pricing-token-guard.test.ts`.

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = 'src/pages/Celebrations.tsx';
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'literal bg-black', re: /\bbg-black\b/ },
  { label: 'literal text-white', re: /\btext-white(?:\/\S+)?\b/ },
  { label: 'literal bg-white opacity', re: /\bbg-white\/\S+\b/ },
  { label: 'literal border-white', re: /\bborder-white(?:\/|\[)/ },
  { label: 'old glass blur on cards', re: /\bbackdrop-blur-xl\b/ },
  { label: 'old CTA indigo-purple gradient', re: /\bfrom-indigo-500\b|\bto-purple-600\b/ },
];

describe('CELEB-01 celebrations token guard', () => {
  for (const { label, re } of FORBIDDEN) {
    it(`Celebrations.tsx contains no ${label}`, () => {
      const src = readFileSync(SOURCE, 'utf8');
      expect(re.test(src), `${label} should not remain in ${SOURCE}`).toBe(false);
    });
  }
});
```

## State of the Art

| Old Approach In This Page | Current Project Approach | Impact |
|---|---|---|
| Literal black page shell and white translucent glass | Semantic `bg-background`, `text-foreground`, `bg-card`, `border-border` | Page follows light/dark token system. |
| Bespoke card-like `div`s | shadcn `Card` primitive | Consistent radius, surface, border, and shadow. |
| White text with opacity for hierarchy | `text-foreground` and `text-muted-foreground` | AA contrast remains stable in both themes. |
| Bright gradient stops only tuned for black | Theme-aware `dark:` gradient stop overrides | Expressive moments remain readable in light mode. |
| Indigo/purple CTA gradient | `bg-primary hover:bg-primary/90` | Matches Strivo button treatment and D-06. |

**Deprecated/outdated in this phase:**
- `bg-black`, `text-white`, `bg-white/*`, `border-white/*`: forbidden by CELEB-01/D-04.
- `backdrop-blur-xl` on page cards: forbidden by D-15.
- New motion/accessibility changes: deferred by D-16.

## Verification Guidance

### Automated

1. Add `src/pages/__tests__/celebrations-token-guard.test.ts` using the static guard pattern above.
2. Run `npx vitest run src/pages/__tests__/celebrations-token-guard.test.ts`.
3. Run `npm run lint`.
4. Run `rg -n "bg-black|text-white|bg-white/|border-white|backdrop-blur-xl" src/pages/Celebrations.tsx`; it should return no matches.

### Manual QA

1. Start the app and visit `/celebrations` in an authenticated dashboard session.
2. Toggle light mode from the top bar and verify hero text, badge, audio card, letter, action cards, CTA, icons, and hover/focus states.
3. Toggle dark mode and repeat the same checks.
4. Check computed colors for the CTA label specifically; do not assume `text-primary-foreground` passes for normal text.
5. Confirm the audio play button still plays/pauses and first play still fires confetti.
6. Confirm letter text and lower-case copy are unchanged.

## Open Questions

1. **Does CELEB-02 require Card borders themselves to be 3:1?**
   - What we know: W3C non-text contrast requires 3:1 for visual information required to identify UI components/states. Current `border-border` does not reach 3:1, but shadcn/Card and existing dashboard surfaces use subtle borders.
   - What's unclear: Whether phase verification will interpret "borders pass WCAG AA" literally for decorative Card borders.
   - Recommendation: Plan with Card default `border`/`border-border`, make focus rings and text/icons pass, and document the token limitation in verification.

2. **Theme provider wording drift**
   - What we know: `next-themes` is installed and consumed by `sonner`/dev sandbox, but current production theme toggling is a local `ThemeToggle` that writes `light`/`dark` classes and `localStorage`.
   - What's unclear: Whether a future branch has a global `next-themes` provider.
   - Recommendation: No page-level theme logic either way. Use semantic tokens and `dark:` variants only.

3. **CTA text treatment**
   - What we know: The locked decision requires `bg-primary hover:bg-primary/90`; default `text-primary-foreground` is not AA for normal-size text with current tokens.
   - What's unclear: Whether the product owner will accept `text-foreground dark:text-background` on a primary button.
   - Recommendation: Use the override because it is the only single-file, no-token-change path that keeps the primary background and passes AA.

## Sources

### Primary (HIGH confidence)

- Local `src/pages/Celebrations.tsx` - target source; hardcoded classes identified at lines 152-159, 163, 175, 187-233, 245-264, 311-358, 388-427.
- Local `src/components/ui/card.tsx` - Card primitive defaults to `rounded-lg border bg-card text-card-foreground shadow-sm`.
- Local `src/components/ui/button.tsx` - default Button uses `bg-primary text-primary-foreground hover:bg-primary/90`.
- Local `tailwind.config.ts` and `src/index.css` - semantic token definitions and `darkMode: ["class"]`.
- Local `src/components/ThemeToggle.tsx` and `src/components/TopBar.tsx` - dashboard theme toggle writes root `light`/`dark` classes.
- shadcn/ui theming docs - CSS variables and semantic token pairs: https://ui.shadcn.com/docs/theming
- shadcn/ui Card docs - Card composition and usage: https://ui.shadcn.com/docs/components/radix/card
- Tailwind CSS v3 dark mode docs - manual selector/class behavior: https://v3.tailwindcss.com/docs/dark-mode
- Tailwind CSS v3 gradient color stops docs - gradient stop utilities: https://v3.tailwindcss.com/docs/gradient-color-stops
- W3C WCAG 2.2 Understanding SC 1.4.3 - text contrast thresholds: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C WCAG 2.2 Understanding SC 1.4.11 - non-text contrast thresholds: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

### Secondary (MEDIUM confidence)

- Local contrast calculations using installed `tailwindcss/colors` and `src/index.css` HSL tokens. Findings: recommended gradient stops pass 4.5:1; semantic body text tokens pass 4.5:1; `primary-foreground` on `primary` fails normal-text 4.5:1; `border-border` does not reach 3:1.
- Local `npm ls` package resolution. Resolved versions observed: Tailwind 3.4.19, React 18.3.1, React Router DOM 6.30.3, Framer Motion 12.39.0, canvas-confetti 1.9.4, lucide-react 0.462.0, next-themes 0.3.0.

### Tertiary (LOW confidence)

- None. Context7 MCP tools were unavailable in this Codex environment (`list_mcp_resources` returned no resources), so official docs and local source were used instead.

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Standard stack | HIGH | Verified from local package resolution and source files. |
| Architecture | HIGH | Phase context locks single-file patch; target source and primitives inspected. |
| Gradient/color choices | HIGH | Recommended stops verified against local Tailwind palette contrast. |
| Text contrast | HIGH | Semantic token ratios verified from local CSS variables. |
| Border/non-text interpretation | MEDIUM | W3C threshold is clear, but current Strivo token system intentionally uses subtle Card borders below 3:1. |
| Verification approach | HIGH | Static guard follows existing Phase 33 pricing token guard pattern. |

**Research date:** 2026-05-22
**Valid until:** 2026-06-21 for this codebase snapshot; refresh if global theme tokens or Card/Button primitives change.
