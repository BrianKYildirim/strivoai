---
phase: 06-dependency-hygiene
plan: 03
subsystem: infra
tags: [dependencies, npm, eslint, react-hook-form, zod, sonner, vaul, jsdom, vercel-analytics, dependency-majors, NFR-02]

# Dependency graph
requires:
  - phase: 06-02
    provides: "Wave-2 behavioral majors (recharts@3 + date-fns@4) committed + operator-smoked; the root date-fns@4 that creates the react-day-picker@8 peer-conflict this plan shims"
  - phase: 06-01
    provides: "06-DEP-CHANGES.md bump ledger (NFR-02) + RESIDUAL-REGISTER DEP-03 defer rows + the lucide/react-day-picker/tailwind-merge DEFER flips"
  - phase: 04
    provides: "the D-12 lint config-scope + tracked warn-baselines mechanism (no-explicit-any 99) reused for the react-hooks v7 downgrade"
provides:
  - "9 contained UI/runtime + devDep major bumps taken atomically behind verify:baseline (resolvers 3->5, helmet 2->3, sonner 1->2, vaul 0->1, @vercel pair 1->2, jsdom 24->29, @types/node 22->26, eslint-tooling set 9->10)"
  - "an overrides shim (react-day-picker -> date-fns: $date-fns) that unblocks every npm install with 0 lock prune without bumping the deferred react-day-picker@8"
  - "a type-only resolvers-v5 dialog fix (useForm<z.input, unknown, z.output>) preserving runtime behavior across the 3 zodResolver dialogs"
  - "the D-12 react-hooks-v7 tracked warn-baseline (12 newly-enabled React-Compiler rules error->warn, rules-of-hooks kept error, no-any unpurged at 99)"
  - "a 2nd DEP-03 DEFER (react-resizable-panels 2->4) recorded after a taken+reverted breaking-parity attempt"
affects: [06-04, 06-05, 06-06, phase-end-closeout, react-compiler-readiness, recharts-v3-types]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "overrides resolution-shim to satisfy a deferred package's stale peer with the live root version ($date-fns) — install-unblock with zero lock prune, zero runtime change"
    - "D-12 tracked-warn-baseline reused for a plugin-major rule expansion (react-hooks v7): downgrade newly-enabled rules error->warn at config level, edit ZERO source, keep rules-of-hooks error"
    - "atomic-per-major / coupled-set commit + ledger row + revert SHA (NFR-02); a breaking major is taken-then-reverted to a DEFER row rather than hand-rolling a non-canonical parity rewrite"

key-files:
  created: []
  modified:
    - "package.json — 9 major version bumps + overrides shim"
    - "package-lock.json — reconciled per bump (0 critical prune; jsdom/eslint subtree-only churn)"
    - "eslint.config.js — 12 react-hooks v7 rules downgraded error->warn (D-12 mechanism)"
    - ".planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md — 11 ledger rows for this wave + 2 smoke notes flipped to operator PASS"
    - ".planning/audit/RESIDUAL-REGISTER.md — react-resizable-panels 2nd-defer row + the react-hooks v7 NEW tracked warn-baselines"
    - ".planning/phases/06-dependency-hygiene/deferred-items.md — DI-06-03-01/02/03"

key-decisions:
  - "Option A overrides shim (operator-approved Rule-4): pin react-day-picker's date-fns peer to $date-fns to unblock installs with 0 lock prune; react-day-picker stays v8, date-fns stays v4"
  - "resolvers-v5 input/output Resolver split auto-fixed in scope (Rule 3) via useForm<z.input, unknown, z.output> on the 2 dialogs with zod .default() fields — type-only, 0 runtime change"
  - "react-resizable-panels 2->4 DEFERRED after taken+reverted: v4 is a breaking re-vendor of ui/resizable.tsx (zero live consumers => nothing to prove-safe); same class as react-day-picker@10"
  - "eslint react-hooks 5->7 expanded recommended 2->16 rules; 12 newly-enabled React-Compiler rules tracked error->warn (D-12), rules-of-hooks kept error, no-explicit-any stays 99 unpurged"
  - "DI-06-03-03 (10 pre-existing recharts@3 tsc errors from 06-02, invisible to verify:baseline) logged as out-of-scope; deferred to a phase-end/dedicated recharts-v3-types decision"

patterns-established:
  - "Resolution-shim-not-bump: a deferred package's already-shipped peer mismatch is satisfied with an overrides $-alias, not by taking its major"
  - "Take-then-revert-to-DEFER: a contained major that turns out to need a non-mechanical parity rewrite is reverted and recorded as a DEFER row, not forced"

requirements-completed: [DEP-03, NFR-02]

# Metrics
duration: 78min
completed: 2026-06-20
---

# Phase 6 Plan 03: Mechanical / devDep Major Bumps Summary

**9 contained UI/runtime + devDep majors taken atomically (resolvers 3->5, helmet 2->3, sonner 1->2, vaul 0->1, @vercel pair 1->2, jsdom 24->29, @types/node 22->26, eslint-tooling set 9->10) behind a green verify:baseline + an overrides install-unblock shim + a type-only resolvers-v5 dialog fix + a D-12 react-hooks-v7 warn-baseline, with react-resizable-panels 2->4 reverted-to-DEFER and operator form/toast smokes PASS.**

## Performance

- **Duration:** ~78 min (incl. the Rule-4 operator-approval pause)
- **Started:** 2026-06-20T06:21:02-07:00 (Task 0 shim commit)
- **Completed:** 2026-06-20T07:38:56-07:00 (end-of-wave Playwright record); operator smoke approved 2026-06-20
- **Tasks:** 3 (+ Task 0 install-unblock shim from the operator-approved Rule-4 resolution)
- **Files modified:** 3 source/config (package.json, package-lock.json, eslint.config.js) + 3 planning artifacts

## Accomplishments

- **Took 9 contained majors, each atomic/coupled with a recorded revert SHA (NFR-02):** @hookform/resolvers 3->5, react-helmet-async 2->3, sonner 1->2, vaul 0->1, the @vercel/analytics + @vercel/speed-insights coupled pair 1->2, jsdom 24->29, @types/node 22->26, and the eslint-tooling coupled set (eslint 9->10 + react-hooks 5->7 + react-refresh 0.4->0.5 + typescript-eslint 8.61.1 + globals 15->17).
- **Resolved the blocking install conflict (Rule-4, operator Option A):** an `overrides` shim `"react-day-picker": { "date-fns": "$date-fns" }` so every `npm install` reconciles with **0 lock prune** — without bumping the deferred react-day-picker@8 (stays v8) or altering date-fns (stays v4).
- **resolvers peer re-confirmed + the v5 dialog signature break auto-fixed in scope (Rule 3):** `npm view @hookform/resolvers@5.4.0 peerDependencies` = `{ react-hook-form: ^7.55.0 }` only (repo 7.72.1), zod 3.25.76 satisfies the `/zod` Standard-Schema path (no zod-4 leak); the v5 input/output `Resolver<>` split that produced 4 new dialog tsc errors was fixed type-only via `useForm<z.input<schema>, unknown, z.output<schema>>`.
- **eslint set kept `npm run lint` exit 0 with the D-12 scope + baselines intact:** the react-hooks 5->7 `recommended` 2->16 rule expansion was absorbed by downgrading the 12 newly-enabled React-Compiler rules `error`->`warn` (rules-of-hooks kept `error`; **zero source edited** — `git diff src/` empty; `no-explicit-any` stays **99 unpurged**; `ignores` scope intact).
- **react-resizable-panels 2->4 reverted-to-DEFER:** taken (`b1edf22a`), then `npm run type-check` surfaced 5 TS2339 errors in the `ui/resizable.tsx` parity file (a breaking v4 `Group`/`Separator`/`orientation` re-vendor, zero live consumers), so reverted (`5f59ac4f`) and recorded as a 2nd DEP-03 DEFER.
- **Operator smokes PASS:** all 3 zodResolver dialogs validate under resolvers@5 (invalid blocked, valid submits); a sonner toast fires + auto-dismisses and the Toaster mounts under sonner@2. Calendar finding acknowledged (ui/calendar.tsx has zero importers — no live surface).

## Task Commits

Each major (or coupled set) was committed atomically as its own NFR-02 revert unit:

0. **Task 0: react-day-picker date-fns peer overrides shim (Rule-4 Option A unblock)** - `31e92d37` (chore)
1. **Task 1a: @hookform/resolvers 3->5** (+ type-only dialog fix) - `7ded036a` (chore)
2. **Task 1b: react-helmet-async 2->3** - `df323d7a` (chore)
3. **Task 1c: sonner 1->2** - `950dc072` (chore)
4. **Task 1d: vaul 0->1** - `13140a92` (chore)
5. **Task 1e: react-resizable-panels 2->4** - `b1edf22a` (chore) → **reverted** `5f59ac4f` (revert) = DEFERRED
6. **Task 1f: @vercel/analytics + @vercel/speed-insights 1->2 (coupled)** - `8c103d9a` (chore)
7. **Task 2a: jsdom 24->29** - `72851a71` (chore)
8. **Task 2b: @types/node 22->26** - `e5981d45` (chore)
9. **Task 2c: eslint-tooling set 9->10 (coupled, + D-12 react-hooks v7 downgrade)** - `1848f728` (chore)

**Docs / SHA-fill / E2E record:** `c52358ae` (resizable revert SHA), `a0aaa629` (eslint-set SHA), `c5d66e3d` (end-of-wave Playwright confirmation).

**Plan metadata:** this closeout commit (docs: complete plan).

## Files Created/Modified

- `package.json` - 9 major version bumps (deps + devDeps) + the `overrides` resolution shim
- `package-lock.json` - reconciled per bump; jsdom/eslint churn is subtree-internal only, NO critical prune (`@esbuild/*` x26 incl. linux-x64, `react-is`, `@testing-library/dom` all intact: 1423/26/1/1)
- `eslint.config.js` - 12 react-hooks v7 React-Compiler rules downgraded `error`->`warn` (D-12 mechanism; rules-of-hooks kept `error`)
- `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md` - 11 ledger rows for this wave; the resolvers + sonner smoke notes flipped PENDING -> operator PASS 2026-06-20
- `.planning/audit/RESIDUAL-REGISTER.md` - react-resizable-panels 2nd-DEFER row + the react-hooks v7 NEW tracked warn-baselines table
- `.planning/phases/06-dependency-hygiene/deferred-items.md` - DI-06-03-01 (2 pre-existing E2E env-reds), DI-06-03-02 (RESOLVED Rule-4 shim), DI-06-03-03 (pre-existing recharts@3 tsc errors)

## Decisions Made

- **Option A overrides shim (operator-approved Rule-4 architectural):** the deferred react-day-picker@8 peer `date-fns@"^2.28||^3"` conflicts with the root date-fns@4 (from 06-02), making every `npm install` ERESOLVE or (with `--legacy-peer-deps`) destructively prune 31 needed lock packages. Resolved by pinning the peer to `$date-fns` — a pure resolution shim for an already-shipped mismatch; react-day-picker stays v8, date-fns stays v4. Diagnostic-verified 0 lock delta.
- **resolvers-v5 dialog fix scoped as Rule 3 (blocking, bump-caused):** the v5 `Resolver<>` input/output split broke 2 dialogs with zod `.default()` fields; auto-fixed type-only via the v5 3-generic `useForm` form. IntakeForm (no defaults) stayed clean. 0 runtime change.
- **react-resizable-panels DEFERRED (2nd DEP-03 defer):** v4 needs a non-mechanical re-vendor of the shadcn `ui/resizable.tsx` parity file (`PanelGroup`->`Group`, `PanelResizeHandle`->`Separator`, `direction`->`orientation`). Zero live consumers => nothing to prove-safe; reverted rather than hand-rolling a non-canonical parity file.
- **react-hooks v7 tracked-warn (D-12):** the plugin's `recommended` expanded 2->16 rules, firing as 30 errors on pre-existing shipped code (sync setState-in-effect, render-phase impurity, manual memoization). The 12 newly-enabled rules tracked `error`->`warn` (same mechanism as the Phase-4 no-explicit-any baseline); rules-of-hooks kept `error`. Clearance = a dedicated React-Compiler-readiness pass.
- **DI-06-03-03 logged out-of-scope:** 10 pre-existing `tsc` errors in recharts@3 consumers (`ui/chart.tsx` x8, `ScoreProgressChart`/`EliteScoreHistory` tooltip formatters) are a 06-02 artifact that `verify:baseline` never surfaced (type-check is off the gate). Reproduce identically at pristine 06-03 HEAD before any bump => not caused here. Deferred to a phase-end/dedicated recharts-v3-types decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @hookform/resolvers v5 `Resolver<>` input/output split broke 2 zodResolver dialogs**
- **Found during:** Task 1a (@hookform/resolvers 3->5), at the bump's `npm run type-check` gate
- **Issue:** resolvers v5 changed `zodResolver` to the input/output `Resolver<>` form; the 2 dialogs with zod `.default()` fields (`AddApplicationDialog.tsx`, `ReportOutcomeDialog.tsx`) emitted 4 new TS errors (the resolved/output type no longer matched the `useForm` single-generic).
- **Fix:** typed `useForm` with the v5 three-generic form `useForm<z.input<schema>, unknown, z.output<schema>>` (type-only). `IntakeForm.tsx` (no `.default()` fields) needed no change.
- **Files modified:** `src/components/.../AddApplicationDialog.tsx`, `src/components/.../ReportOutcomeDialog.tsx` (type annotations only)
- **Verification:** after the fix `tsc` returns to exactly the 10 pre-existing recharts errors (0 NEW); resolvers@5 adds 0 net type errors; build exit 0; vitest 457; deno 699/0/11; operator dialog smoke PASS.
- **Committed in:** `7ded036a` (Task 1a commit)

**2. [Rule 4 - Architectural] overrides shim for the deferred react-day-picker@8 / date-fns@4 peer conflict (operator-approved)**
- **Found during:** Task 1a, before any commit (every `npm install` ERESOLVE-errored / would prune 31 lock packages)
- **Issue:** 06-02's date-fns 3->4 left the deferred react-day-picker@8 peer unsatisfiable on this host; `npm install` errored, `--legacy-peer-deps` destructively pruned `@esbuild/*` (incl. linux-x64), `react-is`, `@testing-library/dom` — a CI/build-breaking lock.
- **Resolution path:** STOPPED (Rule 4 = architectural; touches a deferred-package boundary + changes resolution structure + affects all 8+ bumps). Returned a checkpoint; **operator approved Option A**. Added `"react-day-picker": { "date-fns": "$date-fns" }` alongside the existing `"ws"` pin.
- **Files modified:** `package.json` (`overrides`), `package-lock.json` (0 delta)
- **Verification:** plain `npm install` reconciled with 0 lock prune (`git diff package-lock.json` EMPTY; 1423/26/1/1 unchanged); `npm install @hookform/resolvers@5 --dry-run` clean (no ERESOLVE, "changed 1 package"); build exit 0; vitest 457; deno 699/0/11.
- **Committed in:** `31e92d37` (Task 0, the operator-approved unblock)

**3. [Rule 4-class - Defer-on-break] react-resizable-panels 2->4 taken then reverted to a DEFER row**
- **Found during:** Task 1e (react-resizable-panels 2->4)
- **Issue:** v4 is a breaking API overhaul; `vite build`/vitest/deno passed (zero live consumers, transpile-only) but `npm run type-check` surfaced 5 TS2339 errors in the shadcn `ui/resizable.tsx` parity surface. A faithful take needs a non-mechanical re-vendor (same class as react-day-picker@10).
- **Fix:** reverted to ^2.1.9 and recorded a 2nd DEP-03 DEFER in the ledger + RESIDUAL-REGISTER (clearance = re-vendor ui/resizable.tsx to the v4 Group/Separator/orientation API once shadcn tracks v4).
- **Files modified:** `package.json`, `package-lock.json` (back to ^2.1.9), ledger + RESIDUAL-REGISTER defer rows
- **Verification:** type-check back to the 10 pre-existing recharts errors (0 resizable); build exit 0; verify:baseline green.
- **Committed in:** taken `b1edf22a`, reverted `5f59ac4f`

---

**Total deviations:** 3 (1 Rule-3 in-scope type fix, 1 Rule-4 operator-approved overrides shim, 1 defer-on-break revert)
**Impact on plan:** All necessary. The resolvers fix preserved zero runtime change; the shim was the only non-destructive install path (operator-ratified); the resizable revert avoided a hand-rolled non-canonical parity file. No scope creep — react-day-picker / date-fns / tailwind-merge / lucide-react untouched at their pinned majors.

## Issues Encountered

- **DI-06-03-01 (pre-existing E2E env-reds):** at pristine HEAD `cb864966`, `npm run verify:baseline` is RED on 2 deterministic Playwright failures (`resume-analysis.spec.ts:25` upload-timeout, `stripe-checkout.spec.ts:56` post-checkout reconcile) — both live-infra-dependent on the shared TEST Supabase project, failing identically before any 06-03 bump. Adopted gate: per-bump build-exit-0 + vitest 457 + deno 699/0/11 + E2E with **NO NEW** reds beyond these 2. End-of-wave single Playwright run = 3 pass / 1 skip / 2 known env-reds, no 3rd red.
- **DI-06-03-03 (pre-existing recharts@3 tsc errors):** 10 `tsc` errors in recharts@3 chart consumers from 06-02, invisible to `verify:baseline` (type-check is off the gate). Out of scope (not caused by this plan); the per-bump type-check gate was read as "no NEW errors beyond these 10." Deferred to a phase-end / dedicated recharts-v3-types decision.

## User Setup Required

None - no external service configuration required. (The operator's role here was the manual form/toast verification smoke + the Rule-4 overrides approval, both completed = PASS.)

## Next Phase Readiness

- Wave 2 (mechanical/devDep majors) complete; 9 majors taken behind a green deterministic gate + operator smokes, each with a revert SHA.
- **Carry-forward to 06-04:** continue the grouped minor/patch batches.
- **Carry-forward to 06-05 (Wave 3):** re-measure the npm-audit vuln surface at execute time (re-run `npm run audit:deps`, re-confirm vite / react-router-dom / ws-override / promptfoo targets).
- **Carry-forward to 06-06 (Wave 4):** DEP-05 lockfile reconcile (package-lock + deno.lock + `npm ci` proof) runs strictly last and flips the DEP-05 placeholder ledger row to taken — and is where the overrides shim's portable lock is integrity-proven on a clean install.
- **Deferred for a future milestone:** react-resizable-panels 2->4 + react-day-picker 8->10 + tailwind-merge 2->3 + lucide-react 0->1 (RESIDUAL-REGISTER); the react-hooks-v7 React-Compiler-readiness pass; the DI-06-03-03 recharts-v3-types follow-up (phase-end decision).

## Self-Check: PASSED

- All 14 cited commits found in `git log` (Task 0/1/2 bumps + revert + 3 docs commits).
- `06-03-SUMMARY.md` + `06-DEP-CHANGES.md` present.
- 2 smoke notes (resolvers + sonner) flipped to operator PASS 2026-06-20; 0 PENDING smoke notes remain (4 PASS total incl. 06-02's recharts + date-fns).
- No package.json / package-lock.json / source / config change introduced by this closeout.

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
