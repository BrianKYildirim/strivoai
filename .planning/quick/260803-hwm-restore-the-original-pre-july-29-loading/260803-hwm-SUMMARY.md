---
quick_id: 260803-hwm
phase: quick/260803-hwm
plan: 01
status: complete
completed: 2026-08-03
branch: staging
base_commit: ebf894d328a9a76b7d35e5c5a042ea6e2c968c7b
files_modified:
  - src/test/utils/framer-motion-mock.tsx (new)
  - src/components/UniversalAnalyzing.test.tsx
  - src/components/AnalysisWaitingHost.test.tsx
  - src/components/UniversalAnalyzing.tsx
  - src/test/platform/universal-analyzing-source-guard.test.ts
commits:
  - 025e347e test(quick-260803-hwm): make framer-motion test mock tag-agnostic
  - acf7da3a feat(quick-260803-hwm): restore the pre-July-29 loader visuals
---

# Quick 260803-hwm — Restore the pre-July-29 loading animation

Restored the visual language of the pre-July-29 loader (commit `0e5de83d`) onto the
current `UniversalAnalyzing` logic layer, keeping both honesty protections
(no fabricated percentage, no fabricated duration claim) and the prop-contract fix that
ended the 5-day bare-spinner outage, and adding the reduced-motion gating the original
never had.

## What shipped

### Task 1 — tag-agnostic framer-motion test mock (`025e347e`)

`src/test/utils/framer-motion-mock.tsx` exports `createFramerMotionMock()`:

- `motion` is a `Proxy` whose `get` returns a memoised `React.forwardRef` host element for
  ANY tag, so `motion.h2` / `motion.span` / `motion.p` / a future `motion.section` need no
  further test edits. Symbol keys return `undefined` (module-interop probing).
- framer-only props are stripped before spreading to the DOM (`initial`, `animate`, `exit`,
  `transition`, `variants`, `whileHover/Tap/Focus/Drag/InView`, `viewport`, `layout*`,
  `drag*`, `custom`, `inherit`, `transformTemplate`, `onAnimation*`, `onUpdate`, `onDrag*`).
  Everything else — `className`, `style`, `role`, `aria-*`, `data-*`, `tabIndex`,
  `onKeyDown`, `ref`, `children` — passes through, which the focus trap and every locator
  depend on.
- `AnimatePresence` renders a fragment; `useReducedMotion` returns `false`.

Both suites were rewired via `vi.mock('framer-motion', async () => (await
import('@/test/utils/framer-motion-mock')).createFramerMotionMock())`. `@/test/...`
resolves under `vitest.config.ts`. **Zero assertion changes**; 7 tests before, 7 after.

### Task 2 — restored visuals + narrowed OT-7 guard (`acf7da3a`)

Restored inventory, all rendered from `stageLabels` + `resolvedStageIndex`:

| Element | Notes |
|---|---|
| 3 drifting ambient blobs (8s / 10s / 6s `easeInOut`, `blur-3xl`) | third blob's `bg-emerald-500/5` remapped to `bg-accent/5` |
| Outer glow halo behind the 20x20 icon (`scale [1,1.2,1]`, `opacity [0.3,0.6,0.3]`, 2s) | static counterpart at fixed `opacity-[0.45]` |
| Rotating conic border (`rotate: 360`, 3s linear) | `conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent)` |
| Icon scale pulse (`scale [1,1.1,1]`, 2s) | wraps `{icon ?? <Sparkles className="h-8 w-8" />}` |
| 3 orbiting particles (`rotate: 360`, 4/5/6s, `delay: i*0.5`) + inner opacity pulse (1.5s) | static counterparts at fixed `rotate(0/120/240deg)` so they are distributed, not stacked |
| `motion.h2` title entrance (`delay: 0.2`) | — |
| Staggered row entrance (`opacity:0, x:-30`, `delay: index*0.1 + 0.4`) | `StageRow` gained an `index` prop; finite, no gate needed |
| Active row: gradient bg + `border-primary/30` + `shadow-lg shadow-primary/5` + pulsing `blur-xl` glow (2s) | semantic tokens only |
| Active indicator: spinning ring (1.5s linear) + pulsing centre (`scale [1,1.3,1]`, `opacity [0.5,1,0.5]`, 1s) | replaced the single 1.6s opacity pulse |
| Completed tick: spring scale-in (`stiffness: 500, damping: 30`) + `CheckCircle2` + "Done" span | `text-primary` / `bg-primary/20`, not emerald |
| Pending indicator | hollow ring at row opacity `0.45` — dimmed, never `0` |
| Progress bar + duplicated `blur-sm` glow layer (1.5s) | both bars take the honest `(resolvedStageIndex / stageCount) * 100`; left-hand `Processing...` label only, no `%` |
| Tip line (`Sparkles` + "AI is analyzing your profile with precision", `delay: 1`) | `aria-hidden`, no `aria-live`, no digits |
| `AnimatePresence` + root `motion.div` opacity fade | root carries `ref={dialogRef}`, `role="dialog"`, `aria-modal`, `aria-label={title}`, `tabIndex={-1}`, `onKeyDown={trapFocus}`, `min-h-viewport` |

Removed `data-testid="indeterminate-activity"` — `rg -n "indeterminate-activity" src e2e`
returned exactly one hit (the component itself), so it was redundant against the restored
header assembly.

**Final `repeat: Infinity` count: 12.** `rg -c "repeat: Infinity"
src/components/UniversalAnalyzing.tsx` = 12, and the guard asserts exactly 12. Each sits
behind its own `!prefersReducedMotion &&` **conditional render** (never
`animate={cond ? … : undefined}`) with a static counterpart under
`prefersReducedMotion &&` in the same position.

Breakdown of the 12: 3 blobs, halo, conic border, icon pulse, orbit rotate, orbit opacity
pulse (2 JSX occurrences inside one `.map`, each with its own adjacent gate), active-row
glow, active spinning ring, active pulsing centre, progress glow.

#### Deviation — `blur-3xl` on animated elements (Rule 3, blocking)

The original put `blur-3xl` directly on the animated blob `<motion.div>`.
`src/test/platform/responsive-source-guard.test.ts` F6 ("no `blur-3xl` sits on an animated
element on an audit surface") forbids that, and `MOTION_GATE_EXCLUSIONS` is empty — adding
an entry would have widened a guard hole and touched a sixth file. Resolved by splitting:
the transformed wrapper carries the animation, a **static child** carries
`rounded-full bg-*/… blur-3xl`. Visually identical, and it is the cheaper construction —
the blur layer is rasterised once and then only transform-composited, which is the intent
behind F6's rule. Documented in a code comment on `AmbientBlobs`.

Additional deviation, smaller: banned tokens must not appear even in comments, because the
guard scans raw source. The explanatory header comment was reworded so it does not contain
`emerald`, `expectedDurationMs`, `usually takes`, a literal `%`, or the literal string
`repeat: Infinity` (which would otherwise have counted as a 13th, ungated occurrence).

#### The subtitle `<p>`

**Omitted, deliberately.** The plan permitted either honest stage copy or omission. Using
the current stage copy would have made `getAllByText('Evaluating your resume...')` return 3
where both suites assert 2 — and Task 1 forbids assertion edits. There is no `subtitle`
prop and none was added, so no duration claim can return. The restored tip line carries the
decorative copy that slot used to hold.

#### Guard dispositions (`universal-analyzing-source-guard.test.ts`)

| Rule | Disposition | New form |
|---|---|---|
| `Math.round(...progress)` / `progressPercent` / `Math.exp` | **KEPT verbatim** | `/Math\.round\([^)]*[Pp]rogress\|progressPercent\|Math\.exp/` |
| `expectedDurationMs` / "usually takes" | **KEPT verbatim** | `/expectedDurationMs\|usually takes/i` |
| rendered `%` | **NARROWED** — the old `/>\s*\{?[^<]*%\s*\}?/` false-positived on the orbit dots' CSS lengths (`top: '50%'`) sitting in a style object after a closed JSX tag | `stripLiterals(source)` (removes `'…'`, `"…"`, `` `…` ``) then `not.toMatch(/[}\d]\s*%/)` — still catches `{Math.round(x)}%` and a bare `95%` in markup |
| `emerald` ban | **KEPT verbatim** | `/emerald/i` |
| hardcoded colour literal | **NARROWED** — `hsl(var(--primary))` is a design-token reference, which is what the rule exists to require, but the old pattern matched the `hsl(` prefix | `/#[0-9a-f]{3,8}\b\|rgba?\(\|hsla?\((?!\s*var\(--)/i` — a literal `hsl(210 40% 98%)` still fails |
| `repeat: Infinity` count | **RAISED 2 → 12**, with a comment recording the restoration reason and that it is a CPU budget, not a formality | `expect(infinite).toHaveLength(12)` |
| per-occurrence `!prefersReducedMotion &&` walk + 600-char proximity | **UNCHANGED** (600 window still passes; not widened) | — |
| one `aria-live`, no Cancel/Abort | **KEPT verbatim** | — |
| non-empty-walk fail-closed | **KEPT verbatim** | — |

Every narrowed rule carries an inline comment naming what changed, why, what is still
caught, `2026-08-03` and `260803-hwm`.

#### Mutation checks (Task 2d) — all five went RED, then were reverted

| Mutation | Result |
|---|---|
| `{Math.round(pct)}%` rendered in the tip line | `Tests 1 failed \| 4 passed` — rendered-percentage rule |
| `hsl(210 40% 98%)` in the conic gradient | `Tests 1 failed \| 4 passed` — colour-literal rule |
| extra ungated `<motion.div … repeat: Infinity />` | `Tests 1 failed \| 4 passed` — count rule |
| one gate changed to `{true && (` (count still 12) | `Tests 1 failed \| 4 passed` — **per-occurrence gate walk** specifically |
| `text-emerald-400` on the completed tick | `Tests 1 failed \| 4 passed` — emerald rule |
| control (unmutated) | `Tests 5 passed` |

`git diff --stat` confirmed the file was byte-restored after each.

## Task 3 — verification sweep (verbatim results)

1. **`npm run lint`** — PASS.
   `✖ 153 problems (0 errors, 153 warnings)`. Matches the documented ~153 baseline.
   The only two warnings inside the touched files are in
   `src/components/UniversalAnalyzing.tsx:439` and `:449`
   (`react-hooks/set-state-in-effect`) — both on the pre-existing `STEP_ADVANCE_MS` timer
   effect and the 45s/120s threshold effect shipped by 260803-fxz, neither of which this
   task edited. No new warning is attributable to this change.
   `src/test/utils/framer-motion-mock.tsx`, `AnalysisWaitingHost.test.tsx` and
   `universal-analyzing-source-guard.test.ts` produce zero warnings.

2. **`npm run type-check`** — PASS. `tsc -p tsconfig.app.json --noEmit`, no output.

3. **`npm run test`** — PASS.
   `Test Files  153 passed (153)` / `Tests  1198 passed (1198)` / `Duration 26.62s`.
   Exactly the stated baseline; the count did not drop. (The `SUPER_SECRET_RAW_STACK_TEXT`
   stack noise in the tail is `AnalysisErrorBoundary.test.tsx`'s intentional bomb fixture,
   pre-existing.)

4. **`npx playwright test e2e/cross-device/waiting-surface.spec.ts
   e2e/cross-device/realtime-fallback.spec.ts --project=chromium`** — PASS.
   `2 skipped` / `8 passed (3.8m)`. The two skips are the pre-existing quarantined
   `QUARANTINE: OT-11 …` pair. Nothing else skipped or failed. The two decisive cases:
   - `OT-8: a frozen server cannot advance the visible stage for 60 seconds` ✓ (1.0m) —
     the `isStreamMode` gate in `Results.tsx` was not touched and has not leaked.
   - `reduced motion leaves zero infinite animations on the surface` ✓ (846ms).
   - `OT-9: a 150-second client stall never becomes a failure` ✓ (2.5m), which also
     re-asserts `body.innerText` never matches `/\d+\s*%/`.

5. **`git status --porcelain supabase scripts '*.sql'`** — EMPTY. Scope fence held; the
   only untracked path in the tree is this quick-task's `.planning/` directory.

#### AMENDED 2026-08-03 by the orchestrator — OT-8 is now intermittent

The single clean pass recorded in item 4 above does **not** hold up under repetition.
Independent re-runs of the identical command after execution:

| Run | Result | Wall |
|---|---|---|
| executor's (item 4) | 8 passed / 2 skipped | 3.8m |
| orchestrator #1 | **OT-8 FAILED** — `Test timeout of 140000ms exceeded`; 5 passed, 1 failed, 2 skipped, 2 did not run | 4.9m |
| orchestrator #2 | 8 passed / 2 skipped | 3.7m |
| OT-8 alone, `-g "OT-8"` | passed | 1.2m |

**The failure is a test-level TIMEOUT, not an honesty regression.** In the failing run the
stage-text assertions at lines 143-145 all passed — the ladder did not advance and the
`isStreamMode` gate did not leak. The reported assertion (`[role="alert"]` count) shows
`Received: undefined` because the 140s budget expired mid-assertion, and the captured page
snapshot contains **no** `role="alert"` element at all. `UniversalAnalyzing.tsx` renders
only `role="dialog"` and two `role="status"`.

**Cause is unresolved and should not be assumed benign.** Two candidates:
1. Confound — orchestrator run #1 started seconds after a previous Playwright run was
   killed, with 2 stray processes still alive competing for CPU.
2. Real — 12 concurrent `repeat: Infinity` animations raise main-thread load enough that
   OT-8's 140s budget becomes marginal under 4-worker parallelism. This is precisely the
   cost the raised-budget comment in the guard warns about, and XDEV-09's low-end phone
   target makes it material.

**Deliberately NOT done:** raising OT-8's `test.setTimeout(140_000)`. That would paper over
candidate 2 rather than measure it. Owed follow-up: profile the overlay's main-thread cost
with the restored animation set (and re-check the mobile-webkit / mobile-chromium projects,
which were not run here), then either accept the load or trim the animation count.

### Ladder-branch coverage gap — probed, then closed by measurement

Stated plainly: the committed reduced-motion e2e case runs against the single-line polling
fallback, because `Results.tsx:296-302` strips `?stream=true` unless
`sessionStorage.stream_params_<id>` is seeded. The blobs / halo / conic spin / orbit
particles live OUTSIDE the ladder branch and ARE covered by it; the active-step spinning
ring, pulsing centre and active-row glow are NOT.

A throwaway probe (seeding `sessionStorage.stream_params_<RESUME_ID>` + `?stream=true`,
stalling the `analyze-resume` function so the ladder stays up) was run and then deleted —
**not committed**, per the 260803-fxz precedent. Measured on chromium:

```
[260803-hwm probe] reducedMotion=reduce         ladderRows=5  infiniteAnimations=0
[260803-hwm probe] reducedMotion=no-preference  ladderRows=5  infiniteAnimations=7
3 passed (11.8s)
```

Both runs reached the real 5-row ladder branch. Under `reduce` the ladder subtree has zero
infinite animations; the `no-preference` control sees 7 (only the WAAPI-observable subset —
framer's RAF-driven transforms are invisible to `getAnimations()`, which is exactly why the
source-level per-occurrence gate walk exists and is the primary proof).

### Not run — owed before deploy

`npm run verify:baseline` was **not** run. It additionally invokes
`npm run test:edge` and `npm run test:edge:remote` (remote Deno edge tests against Preview)
plus the full Playwright matrix (webkit, firefox, mobile projects) and `npm run build`.
Those are out of scope for a frontend-only visual restoration but are **owed before any
deploy** — `scripts/deploy.ps1` gates on them anyway.

## Owed follow-up — human browser pass (cannot be self-certified)

A visual restoration is not verifiable by an agent. The operator still owes a `npm run dev`
pass:

1. All six surfaces (Onboarding, Career Compass, Recruiting Lens, LinkedIn Grader,
   Interview Prep, Resume Analysis via Upload → Results `?stream=true`) show the restored
   rich loader — not a bare spinner, not the flat ladder.
2. Blobs drift, halo pulses, conic border spins, particles orbit, rows stagger in, the
   active step's ring spins and centre pulses, ticks spring in, the bar glows.
3. Dark ↔ light: contrast holds on blobs, glow, and pending/active/completed rows.
4. 375px wide: nothing overflows; blobs stay behind content.
5. OS "Reduce motion" ON + reload: everything STATIC but nothing disappears or collapses;
   the ladder still advances and copy still updates.
6. No `n%` and no "this usually takes …" anywhere on the overlay.
7. An analysis run to completion still redirects / renders results exactly as before.

Point 1 in particular is the operator's own acceptance criterion ("recognises the loader as
the actual old one") and is explicitly NOT claimed here.

## Self-check

- `src/test/utils/framer-motion-mock.tsx` — FOUND
- `src/components/UniversalAnalyzing.tsx` — FOUND
- `src/test/platform/universal-analyzing-source-guard.test.ts` — FOUND
- `src/components/UniversalAnalyzing.test.tsx` — FOUND
- `src/components/AnalysisWaitingHost.test.tsx` — FOUND
- commit `025e347e` — FOUND
- commit `acf7da3a` — FOUND
- files changed beyond the plan's five: **none**

## Self-Check: PASSED
