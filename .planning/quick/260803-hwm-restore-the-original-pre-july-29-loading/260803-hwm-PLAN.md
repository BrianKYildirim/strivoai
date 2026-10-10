---
quick_id: 260803-hwm
phase: quick/260803-hwm
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/test/utils/framer-motion-mock.tsx
  - src/components/UniversalAnalyzing.test.tsx
  - src/components/AnalysisWaitingHost.test.tsx
  - src/components/UniversalAnalyzing.tsx
  - src/test/platform/universal-analyzing-source-guard.test.ts

must_haves:
  truths:
    - "A user starting any of the six analyses sees the pre-July-29 loader again: three drifting blurred background blobs, a glowing pulsing halo behind the header icon, a rotating conic border, orbiting particles, a spinning ring + pulsing centre on the active step, a spring-scale tick on completed steps, staggered row entrances, and a glow layer behind the progress bar."
    - "The overlay never renders a percentage number and never claims a duration."
    - "Under `prefers-reduced-motion: reduce`, the overlay has ZERO infinite animations and every looping element has a visible static counterpart in the same position."
    - "All six surfaces still drive the ladder from `stageLabels` + `resolvedStageIndex`; no `steps` prop and no index signature returns."
    - "`npm run lint`, `npm run type-check`, `npm run test`, and the two cross-device Playwright specs on chromium all pass."
  artifacts:
    - path: "src/test/utils/framer-motion-mock.tsx"
      provides: "Tag-agnostic framer-motion mock (any motion.* element + AnimatePresence + useReducedMotion)"
    - path: "src/components/UniversalAnalyzing.tsx"
      provides: "Restored original loader visuals rendered from stageLabels"
      contains: "prefersReducedMotion"
    - path: "src/test/platform/universal-analyzing-source-guard.test.ts"
      provides: "Narrowed OT-7 guard: honesty rules intact, visual constraints re-scoped"
  key_links:
    - from: "src/components/UniversalAnalyzing.tsx"
      to: "prefersReducedMotion gate"
      via: "one `!prefersReducedMotion &&` per `repeat: Infinity`"
      pattern: "!prefersReducedMotion &&"
    - from: "src/test/platform/universal-analyzing-source-guard.test.ts"
      to: "src/components/UniversalAnalyzing.tsx"
      via: "source read + per-occurrence gate walk"
      pattern: "repeat:\\\\s\\*Infinity"
---

<objective>
Restore the pre-July-29 loading/analysis animation (commit `0e5de83d`) as the visual
source of truth for `UniversalAnalyzing`, the single overlay behind all six analysis
surfaces — while keeping the two honesty protections that `d06b6f7d` legitimately
introduced (no fabricated percentage, no fabricated duration claim) and keeping the
prop-contract fix that ended the 5-day bare-spinner outage.

Purpose: the operator considers the current 5-step ladder a visual regression. The
deliverable is the ACTUAL OLD LOADER's visual language, not an enrichment of the ladder.
Output: restored motion-rich overlay + a narrowed (not deleted) OT-7 source guard + a
tag-agnostic framer-motion test mock + a full verification sweep.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/260803-fxz-fix-analysis-loading-animation-ui-regres/260803-fxz-SUMMARY.md
@src/components/UniversalAnalyzing.tsx
@src/test/platform/universal-analyzing-source-guard.test.ts
@src/components/UniversalAnalyzing.test.tsx
@src/components/AnalysisWaitingHost.test.tsx
@e2e/cross-device/waiting-surface.spec.ts

Retrieve the restoration reference (do NOT check it out over the working file):
`git show 0e5de83d:src/components/UniversalAnalyzing.tsx`

Project skills: `.claude/skills/playwright-cli/SKILL.md` — use its conventions for the
Playwright run in Task 3. `.agents/skills/*` are GSD command sources, not relevant here.
</context>

<constraints>
**LOCKED operator intent.** Restore the ORIGINAL loader's visual language, not a mild
enrichment of the current ladder.

**Scope fence.** Only the five files in `files_modified`. Do NOT touch `supabase/**`,
AI prompts, analysis logic, merit/credit logic, APIs, routes, DB, `*.sql`, `scripts/`,
`.gitignore`, or the six caller pages. `git status` under `supabase/`, `scripts/`, `*.sql`
must show zero changes at the end (the preceding task held this line — preserve it).

**Do NOT reintroduce, ever:**
- `progressPercent`, `MAX_PROGRESS_PRE_COMPLETE`, `Math.exp`, `Math.round(...progress)`
- `expectedDurationMs`, `'This usually takes about 20 seconds'`, any duration claim
- a rendered `%` character anywhere in the overlay's output
- `[legacyProp: string]: unknown` on the props interface (this deletion is the fix for the
  5-day outage — an unmigrated prop must stay a compile error)
- a `steps: {id,label,icon}[]` prop. The ladder renders from `stageLabels: readonly string[]`
  + `resolvedStageIndex`. Per-step icons are gone with the prop; the completed/active/pending
  INDICATORS carry the restored motion instead.

**Preserve unchanged:**
- `STEP_ADVANCE_MS = 6_000` and both of its unit tests
- the focus trap (`dialogRef`, `trapFocus`, `focusableElements`), scroll lock, return-focus
- `activeWaitStartedAt`, the 45s/120s reassurance/polling thresholds, `dismiss()`
- the degraded / offline blocks, `WAITING_SURFACE_COPY`, `getClientErrorCopy`
- `role="dialog"` + `aria-modal` + `aria-label={title}` + `tabIndex={-1}` on the element that
  carries `ref={dialogRef}` (`e2e/two-tab-concurrency.spec.ts:169` and
  `waiting-surface.spec.ts:122` both locate the surface by that exact role+name)
- `data-testid="analysis-stage-list"` on the ladder container, and the `Progress` bar staying
  OUTSIDE it (OT-8 reads that node's `innerText`)
- the `min-h-viewport` class on the root (mobile dvh fix from Phase 03-10)
- exactly ONE `aria-live` region — the existing `sr-only` `<p>`. Restored decorative copy
  must not add another, and must not be `aria-live`.

**Reduced motion is a HARD constraint (orchestrator decision, non-negotiable).** The
original had no gating. `e2e/cross-device/waiting-surface.spec.ts:235` asserts ZERO infinite
animations inside the dialog subtree under `emulateMedia({ reducedMotion: 'reduce' })`, and
`responsive-source-guard.test.ts` F6/XD-24 requires the source-level gate. Every
infinite/looping animation sits behind `!prefersReducedMotion &&` with a STATIC counterpart
rendered under `prefersReducedMotion &&`. Do not weaken either test.

**Guard discipline.** Every rule you relax is REPLACED with a narrower rule, never deleted,
and carries a comment recording what changed, why, the date `2026-08-03` and the quick id
`260803-hwm` — following the `260803-fxz` precedent already in that file.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Make the framer-motion test mocks tag-agnostic (prerequisite)</name>
  <files>
src/test/utils/framer-motion-mock.tsx (new)
src/components/UniversalAnalyzing.test.tsx
src/components/AnalysisWaitingHost.test.tsx
  </files>
  <action>
Both suites currently mock framer-motion with ONLY `motion.div` + `useReducedMotion`. The
restored loader uses `motion.h2`, `motion.p`, `motion.span` and `AnimatePresence`. Landing
Task 2 first would crash both suites, so this goes first and must be green on its own.

Create `src/test/utils/framer-motion-mock.tsx` exporting a factory (e.g.
`createFramerMotionMock()`) that returns the module shape:
- `motion`: a `Proxy` whose `get(_, tag)` returns a memoised `React.forwardRef` component
  rendering `React.createElement(String(tag), domProps, children)`. Tag-agnostic by
  construction — adding `motion.section` later must not require another test edit. That is
  the point: the previous outage came from a mock that silently only covered one tag.
- Strip framer-motion-only props before spreading to the DOM so React does not warn on
  object-valued attributes: at minimum `initial`, `animate`, `exit`, `transition`,
  `variants`, `whileHover`, `whileTap`, `whileInView`, `layout`, `layoutId`, `drag`,
  `custom`, `onAnimationComplete`. Everything else (`className`, `style`, `role`,
  `aria-*`, `data-*`, `tabIndex`, `onKeyDown`, `ref`, `children`) passes through — the
  focus trap and every locator depend on it.
- `AnimatePresence`: `({ children }) => <>{children}</>`.
- `useReducedMotion`: `() => false`.

Wire both test files to it. `vi.mock` factories are hoisted, so import inside the factory:
`vi.mock('framer-motion', async () => (await import('@/test/utils/framer-motion-mock')).createFramerMotionMock());`
(verify `@/test/...` resolves under the vitest config; if not, use a relative specifier).

Change NOTHING else in either suite — no assertion edits, no new cases.
  </action>
  <verify>
`npx vitest run src/components/UniversalAnalyzing.test.tsx src/components/AnalysisWaitingHost.test.tsx`
— all existing cases pass, count unchanged, and stderr shows no new React
"unknown prop" / "non-boolean attribute" warnings.
  </verify>
  <done>Both suites pass against a mock that supports any `motion.*` tag and `AnimatePresence`, with zero assertion changes.</done>
</task>

<task type="auto">
  <name>Task 2: Restore the original loader visuals and narrow the OT-7 guard</name>
  <files>
src/components/UniversalAnalyzing.tsx
src/test/platform/universal-analyzing-source-guard.test.ts
  </files>
  <action>
Read `git show 0e5de83d:src/components/UniversalAnalyzing.tsx` and port its VISUAL layer
onto the current component's logic layer. Keep every behaviour listed under "Preserve
unchanged" in `<constraints>`; replace only the presentation.

**2a — Restore, each with its `!prefersReducedMotion &&` gate and a static counterpart:**

| Original element | Restore as |
|---|---|
| 3 floating background blobs (8s / 10s / 6s `easeInOut` loops, `blur-3xl`) | same drifts and sizes. The third was `bg-emerald-500/5` — use a semantic token (`bg-primary/5` or `bg-accent/5`), NOT emerald. Static counterpart: same blob, same position/blur, no `animate`. |
| Outer glow halo (`scale [1,1.2,1]`, `opacity [0.3,0.6,0.3]`, 2s) behind the 20x20 icon | same. Static: the halo at a fixed mid opacity. |
| Rotating conic border (`rotate: 360`, 3s linear) | same, including `background: 'conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent)'` — `hsl(var(--primary))` is a semantic token reference, not a hardcoded literal (see 2c). Static: the ring without rotation. |
| Icon scale pulse (`scale [1,1.1,1]`, 2s) | same, wrapping `{icon ?? <Sparkles className="w-8 h-8" />}`. |
| 3 orbiting particles (`rotate: 360`, 4s/5s/6s, `delay: i*0.5`) each with an opacity pulse (1.5s) | same. Static: particles at fixed orbital positions, full opacity, no rotation. |
| `motion.h2` title (`delay: 0.2`) and `motion.p` subtitle slot (`delay: 0.3`) | restore the entrances. **The subtitle must NOT be a duration claim** — there is no `subtitle` prop and none is being added. Use the honest current stage copy or omit the `<p>` entirely; do not invent a new prop. |
| Staggered row entrance `initial={{opacity:0,x:-30}}` / `transition={{delay: index*0.1 + 0.4}}` | apply to `StageRow` via an `index` prop. Finite and self-terminating — no gate required. |
| Active-row treatment: gradient bg + `border-primary/30` + `shadow-lg shadow-primary/5`, plus the pulsing `blur-xl` glow layer (`opacity [0.5,0.8,0.5]`, 2s) | same, semantic tokens only. |
| Active-step indicator: spinning ring (`rotate: 360`, 1.5s linear) + pulsing centre (`scale [1,1.3,1]`, `opacity [0.5,1,0.5]`, 1s) | same. This replaces the current single 1.6s opacity pulse. Static counterpart: the ring + a solid centre dot. |
| Completed tick: spring scale-in (`stiffness: 500, damping: 30`) + `CheckCircle2` + the small "Done" `motion.span` | same, but `text-primary` / `bg-primary/20` — NOT `emerald`. The spring is finite; no gate. |
| Pending indicator | hollow ring, dimmed but never `opacity: 0` (`e2e/elite-rerun-merit.spec.ts:522` asserts five labels simultaneously visible). |
| Progress bar + duplicated `blur-sm` glow layer (`opacity [0.5,1,0.5]`, 1.5s) | restore the glow layer. Both `Progress` elements take the EXISTING honest step-based value `(resolvedStageIndex / stageCount) * 100`. Keep `aria-hidden="true"`. **Do NOT restore the right-hand `{Math.round(progressPercent)}%` span.** A left-hand honest label such as `Processing...` is optional and permitted. |
| Tip line (`Sparkles` + "AI is analyzing your profile with precision", `delay: 1`) | restore. No digits, no `%`, no duration. Must not carry `aria-live`. |
| `AnimatePresence` wrapper + root `motion.div` opacity fade | restore. The root motion.div carries `ref={dialogRef}`, `role="dialog"`, `aria-modal`, `aria-label={title}`, `tabIndex={-1}`, `onKeyDown={trapFocus}`, and `min-h-viewport`. |

The current standalone `data-testid="indeterminate-activity"` ring is made redundant by the
restored header assembly. Run `rg -n "indeterminate-activity" src e2e` first: if it has zero
references outside the component (expected), remove it; if anything references it, keep it,
gated, as-is.

**2b — Gating structure.** Use the conditional-render form, per element:
```
{!prefersReducedMotion && (<motion.div animate={…} transition={{ …, repeat: Infinity }} className="…" />)}
{prefersReducedMotion && (<div className="…" />)}
```
Do NOT use `animate={prefersReducedMotion ? undefined : …}` — it leaves no `!prefersReducedMotion &&`
token for the guard walk. Inside the orbiting-particle `.map`, the outer rotate and the inner
opacity pulse are two separate `repeat: Infinity` occurrences: give each its own adjacent gate
(a redundant nested gate is acceptable and cheap) so both stay within the guard's proximity
window. Expected final count is ~12 — count the actual occurrences and use that exact number
in 2c.

**2c — Narrow the guard** (`universal-analyzing-source-guard.test.ts`). Each change gets a
comment naming the change, the reason, `2026-08-03`, and `260803-hwm`.

| Rule | Action |
|---|---|
| `Math.round(...progress)` / `progressPercent` / `Math.exp` ban | **KEEP verbatim** |
| `expectedDurationMs` / "usually takes" ban | **KEEP verbatim** |
| rendered `%` ban — `/>\s*\{?[^<]*%\s*\}?/` | **KEEP the intent.** Run it against the restored file first. If it stays green, leave it alone. If it false-positives (candidates: `'50%'` / `'100%'` in particle `style`, `i % 2`, a `w-[…%]` class), replace it with a NARROWER rule — e.g. strip string literals (`'…'`, `"…"`, `` `…` ``) from the source, then `expect(stripped).not.toMatch(/[}\d]\s*%/)`, which still catches `{Math.round(x)}%` and `95%` but not a `%` living in a CSS string. Do not delete it. |
| `emerald` ban | **KEEP.** Every emerald usage maps to a semantic token. |
| hardcoded colour-literal ban — `/#[0-9a-f]{3,8}\b\|rgba?\(\|hsla?\(/i` | **NARROW.** The conic gradient uses `hsl(var(--primary))`, which is a design-token reference, exactly what CLAUDE.md mandates — the current rule cannot tell it from a literal. Change to allow only the `var(--…)` form, e.g. `/#[0-9a-f]{3,8}\b\|rgba?\(\|hsla?\((?!\s*var\(--)/i`. A literal `hsl(210 40% 98%)` must still fail. |
| `repeat: Infinity` count `toHaveLength(2)` | **RAISE to the exact restored count** with a comment recording the original-restoration reason and that raising it must stay deliberate. **KEEP the per-occurrence `!prefersReducedMotion &&` walk unchanged** — it is materially stronger than what it replaced. Keep the 600-char proximity window if it passes; only raise it if a legitimate structure genuinely needs more, and comment the measured value. |
| one `aria-live`, no Cancel/Abort | **KEEP verbatim** |
| non-empty-walk fail-closed | **KEEP verbatim** |

**2d — Mutation-check the narrowed rules** (the `260803-fxz` precedent). Temporarily, one
at a time, confirm the guard goes RED for: a rendered `{Math.round(pct)}%`; a literal
`hsl(210 40% 98%)`; an ungated `repeat: Infinity`; a `text-emerald-400`. Revert each. A rule
that cannot fail is decoration.
  </action>
  <verify>
- `npx vitest run src/test/platform/universal-analyzing-source-guard.test.ts src/test/platform/responsive-source-guard.test.ts src/components/UniversalAnalyzing.test.tsx src/components/AnalysisWaitingHost.test.tsx` — all pass.
- `rg -c "repeat: Infinity" src/components/UniversalAnalyzing.tsx` equals the number asserted in the guard.
- `rg -n "progressPercent|expectedDurationMs|usually takes|emerald|legacyProp: string|steps:" src/components/UniversalAnalyzing.tsx` — no hits (a `legacyProp` mention in the explanatory comment is fine; a type declaration is not).
- `npm run type-check` passes.
  </verify>
  <done>The overlay renders the original loader's blobs, halo, conic spin, orbit particles, staggered rows, pulsing indicators, spring ticks and progress glow; every infinite loop is individually gated with a static counterpart; the guard is narrower-but-alive and mutation-checked.</done>
</task>

<task type="auto">
  <name>Task 3: Full verification sweep (operator-mandated "test everything")</name>
  <files>(no source edits unless a check fails)</files>
  <action>
Run, in order, and record each result verbatim in the summary:

1. `npm run lint` — 0 errors. Warning count should track the ~153 pre-existing baseline;
   any NEW warning attributable to these files must be fixed, not accepted.
2. `npm run type-check`
3. `npm run test` — full vitest suite. Baseline is 153 files / 1198 tests; the count must
   not drop.
4. `npx playwright test e2e/cross-device/waiting-surface.spec.ts e2e/cross-device/realtime-fallback.spec.ts --project=chromium`
   The two decisive cases are **OT-8** (stage text byte-identical for 60s on the polling path
   — proves the `isStreamMode` gate in `Results.tsx` still has not leaked) and **"reduced
   motion leaves zero infinite animations on the surface"** (`waiting-surface.spec.ts:235`).
   The pre-existing webkit OT-11 quarantine skips are expected; anything else failing is new.
5. `git status --porcelain supabase scripts '*.sql'` — must be EMPTY.

If step 4's reduced-motion case fails, the cause is an ungated loop that the source guard's
proximity window let through — fix the component, do not touch the spec.

**Known coverage gap, state it plainly in the summary rather than papering over it:** the
reduced-motion e2e case runs against the single-line polling fallback, because
`Results.tsx:296-302` strips `?stream=true` unless `sessionStorage.stream_params_<id>` is
seeded. The blobs / halo / conic spin / orbit particles restored here live OUTSIDE the ladder
branch and therefore ARE covered by that case; the active-step pulse and completed tick are
not. Optionally reach the ladder branch with a throwaway spec that seeds
`sessionStorage.stream_params_<RESUME_ID>` (run it, report the counts, delete it — do not
commit it), as `260803-fxz` did.

Do not run `npm run verify:baseline`: it additionally invokes remote Deno edge tests
(`test:edge:remote`) and the full Playwright matrix, which are out of scope here. Record it
as **owed before deploy**.
  </action>
  <verify>All five commands executed; lint/type-check/vitest green; Playwright reports only the pre-existing webkit OT-11 skips; the `git status` scope check is empty.</verify>
  <done>Every command above has a recorded PASS/FAIL, and any failure is either fixed inside the plan's five files or explicitly reported as a blocker.</done>
</task>

</tasks>

<verification>
- Original visual inventory present: 3 blobs, glow halo, conic rotation, icon pulse, 3 orbit
  particles, staggered row entrances, active spinning ring + pulsing centre, spring tick,
  progress glow layer, `AnimatePresence` fade.
- Zero fabricated percentage: no `%` rendered, no `progressPercent`, no `Math.exp`.
- Zero duration claim: no `expectedDurationMs`, no "usually takes".
- Every `repeat: Infinity` has its own `!prefersReducedMotion &&`; every one has a static
  counterpart; the e2e reduced-motion count is 0.
- Prop contract intact: no index signature, no `steps` prop, `stageLabels` still the source.
- `STEP_ADVANCE_MS` and both timer tests unchanged and passing.
- Scope fence held: nothing under `supabase/`, `scripts/`, `*.sql`, no caller page edited.

**Human browser pass (owed after execution — cannot be self-certified).** Run `npm run dev` and check:
1. All six surfaces (Onboarding, Career Compass, Recruiting Lens, LinkedIn Grader,
   Interview Prep, Resume Analysis via Upload → Results `?stream=true`) show the restored
   rich loader, not a bare spinner and not the flat ladder.
2. Blobs drift, halo pulses, conic border spins, particles orbit, rows stagger in, the
   active step's ring spins and centre pulses, ticks spring in, the bar glows.
3. Dark ↔ light: contrast holds on blobs, glow, pending/active/completed rows.
4. 375px wide: nothing overflows; blobs stay behind content.
5. OS "Reduce motion" ON + reload: everything is STATIC but nothing disappears or collapses;
   the ladder still advances and copy still updates.
6. No `n%` and no "this usually takes …" anywhere on the overlay.
7. An analysis run to completion still redirects / renders results exactly as before.
</verification>

<success_criteria>
- The operator recognises the loader as the actual old one, not an enriched ladder.
- Both honesty protections survive, provable from the guard.
- Reduced motion yields zero infinite animations, provable from e2e.
- `lint` / `type-check` / `test` green; the two cross-device specs green on chromium.
- Five files changed, no more.
</success_criteria>

<output>
Create `.planning/quick/260803-hwm-restore-the-original-pre-july-29-loading/260803-hwm-SUMMARY.md`.

Record: the exact final `repeat: Infinity` count; each guard rule's disposition (kept /
narrowed, with the new regex); the mutation-check results from 2d; verbatim command results
from Task 3; the ladder-branch coverage gap; and that `npm run verify:baseline` is owed
before deploy.

Do NOT advance `.planning/STATE.md` (it tracks Phase 04.2 Plan 5 of 5 — this is a quick task)
and do not touch `ROADMAP.md`.
</output>
</content>
</invoke>
