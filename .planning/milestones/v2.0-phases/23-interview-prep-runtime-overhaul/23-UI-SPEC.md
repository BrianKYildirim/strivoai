---
phase: 23
slug: interview-prep-runtime-overhaul
status: approved
shadcn_initialized: true
preset: slate (baseColor) + cssVariables + default style (existing project preset — components.json)
created: 2026-04-20
reviewed_at: 2026-04-20
---

# Phase 23 — UI Design Contract

> Visual and interaction contract for the Interview Prep runtime overhaul. Canonical source: `APIcontextdocuments/interviewprep/STRIVO_Interview_Prep_Runtime.pdf` §13 UI contract + §13.4 Copy Preview table. All tokens pre-populated from the existing Strivo design system (`tailwind.config.ts`, `src/index.css`, `components.json`) — this phase consumes the established tokens and does NOT introduce new ones.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (already initialized — see `components.json`) |
| Preset | `baseColor: slate`, `style: default`, `cssVariables: true`, `prefix: ""` |
| Component library | Radix UI primitives via shadcn/ui wrappers in `src/components/ui/*` |
| Icon library | `lucide-react` (already in use in current `InterviewPrep.tsx`) |
| Font | `Inter` (system fallback: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) from `tailwind.config.ts` |
| Theming | Dark mode default (`:root, .dark`) + light mode opt-in (`.light` class); all colors HSL via CSS vars |
| Animations | `tailwindcss-animate` + project keyframes (`fade-in`, `scale-in`, `glow-pulse`) from `tailwind.config.ts` |

**Reuse mandate:** Every UI surface in Phase 23 must render with shadcn/ui primitives already present in `src/components/ui/`: `Card`, `CardContent`, `CardHeader`, `Button`, `Input`, `Textarea`, `Label`, `Select`, `Badge`, `Separator`, `Progress`, `Dialog`, `Alert`, `Skeleton`, `RadioGroup`, `Checkbox`, `Tooltip`, `Sonner` (toast). No new primitives are required. Framer Motion (`motion`, `AnimatePresence`) already used in the mock — retain for state transitions per CONTEXT D-18.

---

## Spacing Scale

Declared values (all multiples of 4, Tailwind default scale — no exceptions for this phase):

| Token | Value | Tailwind | Usage in Phase 23 |
|-------|-------|----------|-------------------|
| xs | 4px | `p-1`, `gap-1` | Icon-to-label gap inside badges, pill chips |
| sm | 8px | `p-2`, `gap-2` | Form field inner gap (Label above Input); radio/checkbox row spacing; flashcard STAR-beat sub-label gap |
| md | 16px | `p-4`, `gap-4` | Default card body padding; gap between form rows; gap between STAR beats inside a flashcard |
| lg | 24px | `p-6`, `gap-6` | Card outer padding (`CardContent`); gap between intake form sections ("Role", "What you're prepping for", "Session shape"); quiz question card vertical padding |
| xl | 32px | `py-8`, `gap-8` | Vertical rhythm between payload sections (Coach Verdict → Readiness Breakdown → Focus Areas, etc.); Generate CTA top margin |
| 2xl | 48px | `py-12`, `gap-12` | Between the "Your Prep Readiness" score hero and the first payload section below it; intake form → generated results transition |
| 3xl | 64px | `py-16` | Page-level top padding on the intake screen only |

**Exceptions:** None. Textarea live-counter (`{count}/500`) sits at 4px (`gap-1`) inside the textarea footer — already covered by `xs`.

**Container width:** Results view uses the same outer container as Results.tsx / CareerCompass.tsx / RecruitingLens.tsx — `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (Tailwind `container` preset is 1400px, padding `2rem`). This matches Phase 22 Scan-New header-bar parity rule and the LinkedIn Grader full-width fix.

**Touch targets:** Interactive buttons remain at minimum `h-10` (40px) per shadcn default; primary "Generate" and "Submit Answers" CTAs use `h-11` (44px) per WCAG touch-target guidance. Quiz answer textareas minimum `min-h-32` (128px).

---

## Typography

Four declared sizes, two declared weights. All tokens are Tailwind defaults already in use across Results / CareerCompass / RecruitingLens — Phase 23 does NOT introduce new type tokens.

| Role | Size | Weight | Line Height | Tailwind | Usage in Phase 23 |
|------|------|--------|-------------|----------|-------------------|
| Body | 16px | 400 (regular) | 1.5 | `text-base font-normal leading-relaxed` | All paragraph copy: Coach Verdict, sample answers, coaching advice, STAR Situation/Task/Action/Result blocks, Focus Area "whyItMatters", Prep Roadmap "Why"/"Expected impact", AI error description |
| Label | 14px | 600 (semibold) | 1.4 | `text-sm font-semibold leading-snug` | Form labels ("Job Description", "Interview Type"), category badges on flashcards, sub-score labels in Readiness Breakdown ("Confidence", "Story Structure", etc.), `{count}/500` counter, streak state copy ("1/3 used today"), quiz progress ("Question 3 of 7") |
| Heading | 20px | 600 (semibold) | 1.3 | `text-xl font-semibold leading-snug` | Payload section titles ("Coach Verdict", "Focus Areas", "Practice Questions", "Prep Roadmap", "Strengths & Watch-Outs", "Coaching Advice"); intake section titles ("Role", "What you're prepping for", "Session shape"); flashcard front question |
| Display | 28px | 600 (semibold) | 1.2 | `text-[28px] font-semibold leading-tight` | Page title ("Interview Prep Coach"); "Your Prep Readiness" score number (the numeric 0–100); end-of-quiz overall readiness number; quiz results screen title |

**Weights used in this phase:** exactly 2 — `font-normal` (400) and `font-semibold` (600). No `font-medium`, no `font-bold`. Rationale: the existing Strivo pages render with this two-weight discipline; any third weight would drift from sibling feature pages.

**Line-height targets:** body 1.5 (readability for long STAR blocks), labels 1.4, headings 1.3, display 1.2. Matches Strivo prior-art.

**Numerics:** the readiness score display (0–100) uses tabular figures (`tabular-nums`) so the counter does not jitter between digit widths.

---

## Color

Uses only existing Strivo CSS variables (`src/index.css`). No new colors declared. Both dark (default) and light mode are mandatory per SC-7 parity rule with other feature pages.

| Role | Token / Value | Tailwind | Usage in Phase 23 |
|------|---------------|----------|-------------------|
| Dominant (~60%) | `--background` (dark: `0 0% 0%` / light: `0 0% 100%`) | `bg-background` | Page surface behind all cards |
| Dominant foreground | `--foreground` (dark: `0 0% 100%` / light: `0 0% 8%`) | `text-foreground` | All body and heading copy |
| Secondary (~30%) | `--card` / `--secondary` (dark: `0 0% 5%` / `0 0% 10%`; light: `0 0% 98%` / `0 0% 94%`) | `bg-card`, `bg-secondary` | Intake form card, flashcard card, quiz question card, each of the 9 payload section cards, streak display card |
| Muted surface | `--muted` / `--muted-foreground` | `bg-muted`, `text-muted-foreground` | Sub-labels, helper text, readiness band descriptions when not current band, inactive streak flame when cold, character counter 0–499 |
| Border | `--border` | `border`, `border-border` | Card borders, input borders, textarea borders, section separators |
| Accent (~10%) | `--accent` = `--primary` = coral `hsl(357 100% 68%)` (dark) / `hsl(357 100% 55%)` (light) | `bg-primary`, `text-primary`, `ring-primary` | **Reserved list below — nothing else** |
| Destructive | `--destructive` `hsl(0 84.2% 60.2%)` (dark) / `hsl(0 84.2% 50%)` (light) | `bg-destructive`, `text-destructive` | 500-char counter overflow state; "Daily Limit Reached" banner; "We couldn't generate your prep" error alert; "Not Yet" readiness band badge (<55) |

### Accent is reserved for (explicit list — anything else uses `foreground` / `muted` / `secondary`):

1. **Primary CTAs only**: "Generate Interview Prep" button on the intake form, "Submit Answers" button on quiz-active, "Start new streak" CTA on expired streak, "Upload and analyze a resume first" primary CTA on the no-resume 400 state.
2. **Active focus ring** (`ring-primary`) on the currently focused form field or textarea.
3. **Readiness Breakdown score bar** fills (per sub-score gauge) — `bg-primary` fill only for the percentage filled.
4. **Streak flame** when active (`text-primary` on the flame icon); muted when cold; destructive when expired.
5. **Category badges** on flashcards and quiz questions — `Badge variant="default"` which already maps to primary.
6. **"Ready to Ship" readiness band badge** (85–100) — primary. Other bands: Ready to Practice (70–84) = foreground on secondary, Needs Work (55–69) = foreground on muted, Not Yet (<55) = destructive.
7. **Character counter at exactly 500** per Runtime §13.4 — `text-primary`. 0–499 = `text-muted-foreground`, >500 = `text-destructive`.
8. **Current question indicator** in the quiz progress strip — `bg-primary`, others `bg-muted`.

Accent is **NEVER** used on: card backgrounds, generic borders, body text, helper text, inactive controls, flashcard body text, roadmap stage icons, or decorative glow washes beyond what the existing `glow-pulse` animation already does on the page hero.

### Destructive is reserved for:

- Character counter above 500 chars (per §13.4).
- "Daily Limit Reached" banner heading (after the 3rd Elite quiz in a UTC day).
- AI upstream failure alert ("We couldn't generate your prep right now. Your Merits were refunded.").
- "Not Yet" readiness band badge.
- Expired streak flame icon color (48h inactivity).

No other destructive usage. No confirm-delete flows in Phase 23 (see Destructive actions below).

---

## Copywriting Contract

All copy is **locked verbatim** by Runtime §13.4 Copy Preview. Executor must not paraphrase. Characters including punctuation and capitalization match the PDF exactly.

| Element | Copy |
|---------|------|
| Page title | `Interview Prep Coach` |
| Page subtitle | `Turn your resume and the job description into a rehearsal you can actually use.` |
| Intake — JD label | `Job Description` |
| Intake — JD helper | `Paste the JD you're prepping for. Up to 3,000 characters.` |
| Intake — role label (optional) | `Target Role` |
| Intake — company label (optional) | `Target Company` |
| Intake — background label (optional) | `Anything else your coach should know` (helper: `Up to 1,500 characters. Optional but recommended.`) |
| Intake — interview type label | `Interview Type` (options: `Behavioral`, `Technical`, `Mixed Panel`, `Executive`) |
| Intake — categories label | `What do you want to practice?` (multi-select) |
| Intake — difficulty label | `Difficulty` (options: `Entry`, `Mid`, `Senior`, `Staff+`) |
| Intake — duration label | `Session Length` (options: `15 min`, `30 min`, `45 min`, `60 min`) |
| Intake — format label | `Format` (options: `Written`, `Voice-style`, `Mixed`) |
| **Primary CTA (intake)** | `Generate Interview Prep` |
| CTA subtext (cost preview) | `This session costs {N} Merits. You have {balance} remaining.` (from `<MeritCostPreview>`) |
| Generating status | `Building your rehearsal…` |
| No-resume heading (400) | `Upload a resume first` |
| No-resume body | `Upload and analyze a resume first to generate interview prep.` |
| No-resume CTA | `Go to Resume Analysis` |
| Free gate (ProFeatureGate wrapper) | Uses existing `<ProFeatureGate>` copy — NOT overridden in this phase. |
| Daily cap heading (429) | `Daily Limit Reached` |
| Daily cap body | `You've completed 3 quizzes today. Come back after midnight UTC to keep your streak going.` |
| Pro monthly quiz used (429) | `Your monthly Elite quiz is used. Resets on the 1st.` |
| AI error heading (502) | `We couldn't generate your prep right now` |
| AI error body | `Your Merits were refunded. Please try again in a minute.` |
| AI error CTA | `Try again` |
| Character counter format | `{count}/500` (muted 0–499, primary at 500, destructive above 500) |
| Over-limit helper | `Keep your answer to 500 characters or fewer.` |
| Submit CTA (quiz-active) | `Submit Answers` |
| Submitting status | `Scoring your answers…` |
| Streak active | `{n}-day streak` + subtext `Quiz today to keep it going.` |
| Streak cold (24h) | `{n}-day streak — cooling off` + subtext `Practice a quiz in the next 24 hours.` |
| Streak expired (48h) | `Streak ended` + subtext `Start a new streak today.` |
| Streak first-time | `Start your streak` + subtext `One quiz a day keeps it alive.` |
| Streak cap-reached | `You've hit today's cap` + subtext `3 of 3 used today.` |
| Daily counter | `{k}/3 used today` |
| Empty state — no intake started | `Paste the JD above to start.` (shown under the form when all required fields are still blank) |

### Destructive actions

There are **no destructive actions** in Phase 23. The following are explicitly NOT included:
- No "delete quiz" button.
- No "clear my answers" button (deferred per CONTEXT).
- No "cancel subscription" or "leave" flows (owned by Phase 20).
- The `over-limit` state (>500 chars) is an inline blocker, not a destructive confirmation — the Submit button is disabled until the user trims the answer.

Therefore: no confirmation modals, no `AlertDialog` usage beyond the future error-retry affordance (which is a non-destructive toast + inline alert).

---

## Component Inventory (this phase)

New components (created by Phase 23 plans):

| Component | Location | Built from | Runtime ref |
|-----------|----------|------------|-------------|
| `InterviewPrepPage` (full rewrite) | `src/pages/InterviewPrep.tsx` | `Card`, `Button`, `Input`, `Textarea`, `Label`, `Select`, `RadioGroup`, `Checkbox`, `Badge`, `Separator`, `Alert`, `Progress` | §13 state machine |
| `IntakeForm` | `src/components/interviewPrep/IntakeForm.tsx` | shadcn `Card` + react-hook-form + Zod | §3 intake |
| `ReadinessHero` | `src/components/interviewPrep/ReadinessHero.tsx` | `Card` + display-size score + band `Badge` | §9 + §10 payload slot 1 |
| `ReadinessBreakdown` | `src/components/interviewPrep/ReadinessBreakdown.tsx` | `Progress` bars × 5 | §10 payload slot 3 |
| `FocusAreas` | `src/components/interviewPrep/FocusAreas.tsx` | `Card` grid | §10 payload slot 4 |
| `QuickTips` | `src/components/interviewPrep/QuickTips.tsx` | bulleted list in `Card` | §10 payload slot 5 |
| `FlashcardDeck` (Pro) | `src/components/interviewPrep/FlashcardDeck.tsx` | `Card` × 3 with STAR beats | §6 |
| `QuizRunner` (Elite) | `src/components/interviewPrep/QuizRunner.tsx` | `Card` + `Textarea` + live counter + single batch Submit | §7 |
| `QuizResults` (Elite) | `src/components/interviewPrep/QuizResults.tsx` | per-answer STAR `Card` + end-of-quiz summary `Card` | §7 |
| `PrepRoadmap` | `src/components/interviewPrep/PrepRoadmap.tsx` | timeline `Card` with 4 stages | §10 payload slot 7 |
| `StrengthsWatchOuts` | `src/components/interviewPrep/StrengthsWatchOuts.tsx` | two-column `Card` | §10 payload slot 8 |
| `CoachingAdvice` | `src/components/interviewPrep/CoachingAdvice.tsx` | `Card` | §10 payload slot 9 |
| `StreakDisplay` | `src/components/interviewPrep/StreakDisplay.tsx` | `Card` + `lucide-react` `Flame` icon + state variants | §8 + §13 — standalone (D-19) |
| `CharacterCounter` | `src/components/interviewPrep/CharacterCounter.tsx` | span with state-driven color | §13.4 |

Reused components (no modification):

- `ProFeatureGate` (`src/components/ProFeatureGate.tsx`) — gates the page for Free users (SC-1).
- `MeritCostPreview` (`src/components/MeritCostPreview.tsx`) — cost preview above Generate CTA.
- `BlurredLockCard` (`src/components/BlurredLockCard.tsx`) — NOT used in Phase 23 results (Pro sees real content, Elite sees full). Reserved only if a future "locked preview" section is added; not in scope.
- Toast via `sonner` — errors and successes.

---

## State Machine (UI contract, Runtime §13)

Locked status union (CONTEXT D-18). Executor must implement `useReducer` with this exact union type — no additional states, no removed states:

```
'loading' | 'free-gate' | 'input-form' | 'generating' | 'flashcard-results'
| 'quiz-active' | 'quiz-submitting' | 'quiz-results' | 'error'
```

Transitions:
- `loading` → `free-gate` (Free tier) | `input-form` (Pro/Elite + resume present) | `error` (no resume, show 400 copy with CTA to Resume Analysis).
- `input-form` → `generating` on valid Generate CTA click.
- `generating` → `flashcard-results` (Pro) | `quiz-active` (Elite or Pro-monthly-taste) | `error` (502 with refund copy).
- `quiz-active` → `quiz-submitting` on Submit Answers.
- `quiz-submitting` → `quiz-results` (success) | `error` (502).
- `error` → `input-form` on Try again (retry-safe, no Merit re-charge unless new attempt).

No URL-state coupling required in v1 — page is a single-route page at `/interview-prep`.

---

## Responsive Breakpoints

Matches Strivo project Tailwind defaults. Phase 23 surfaces MUST render correctly at all three:

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | `<640px` (default) | Single-column intake; quiz question card full-width; Submit Answers button full-width (`w-full`); StreakDisplay collapses to horizontal row |
| Tablet | `sm:640–1023px` | Intake: 2-column for short enum selects (interview_type / difficulty / duration / format); flashcard deck 1-column; payload sections stacked |
| Laptop+ | `lg:1024px+` | Intake: preserves grouped two-column within each section where it aids scan; flashcard deck becomes 3-column grid (one per card); Readiness Breakdown becomes 5-column sub-score strip; payload sections gain `max-w-7xl` centered layout matching Results/CareerCompass/RecruitingLens per SC-22 parity |

Both light and dark themes must render identically at each breakpoint (mandatory parity rule carried from Phase 22 D-10).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `card`, `button`, `input`, `textarea`, `label`, `select`, `radio-group`, `checkbox`, `badge`, `separator`, `progress`, `alert`, `skeleton`, `dialog`, `tooltip`, `sonner` (all already installed) | not required |
| third-party registries | **none declared** | not applicable |

No third-party registry entries. No `npx shadcn view` gate runs for this phase. If the planner later adds a third-party block, the gate from `gsd-ui-researcher` must be re-run before it enters this contract.

---

## Accessibility Contract

- All form fields use `<Label htmlFor>` associations (shadcn `Label` already enforces this pattern).
- Quiz `Textarea` announces remaining characters via `aria-describedby` pointing to `CharacterCounter`; counter uses `aria-live="polite"` so screen readers hear overflow warnings without spam.
- Streak state changes use `role="status"` on the `StreakDisplay` container so state transitions (active → cold → expired) are announced.
- Focus ring uses the project `--ring` (coral) token — already WCAG AA on both themes.
- Primary CTA buttons use visible disabled state (`opacity-50` + `pointer-events-none` from shadcn `Button` disabled variant) when required fields are incomplete or answer is over 500 chars.
- Color is never the sole signal for the character counter overflow: at >500 chars the helper text `Keep your answer to 500 characters or fewer.` also appears below the textarea.
- Keyboard: Tab order follows visual order; Enter submits the current form only from the primary CTA, never from within a multi-line Textarea.
- Toast (sonner) errors include an action button (`Try again`) so keyboard-only users can dismiss + retry without a mouse.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Pre-Population Provenance

| Field | Source |
|-------|--------|
| Design System | `components.json` + `tailwind.config.ts` + `src/index.css` (existing project state) |
| Spacing scale | Tailwind defaults already used across Strivo; confirmed by sibling pages |
| Typography | Inter family from `tailwind.config.ts`; sizes/weights from Strivo prior-art — no new type tokens |
| Color tokens | `src/index.css` CSS variables (dark + light) — no new colors |
| Copywriting | Runtime §13.4 Copy Preview table (verbatim) |
| State machine | CONTEXT D-18 + Runtime §13 state diagram |
| Component inventory | CONTEXT D-16/D-17/D-19 + Runtime §10 nine-section payload |
| Character counter colors | CONTEXT D-15 + Runtime §13.4 |
| Streak states | Runtime §8 + §13.4 + CONTEXT D-19 |
| Responsive parity rule | Phase 22 D-10 (Scan-New header-bar cross-page parity) + ROADMAP SC-7 |
| Registry safety | `components.json` scan — no third-party registries declared |
