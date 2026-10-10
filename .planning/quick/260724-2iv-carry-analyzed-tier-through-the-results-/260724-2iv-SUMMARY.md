---
quick_id: 260724-2iv
type: execute
status: complete
completed: 2026-07-24
duration: ~12min
tasks: 2
files_changed: 2
commits:
  - 87f2bdbc: "test(260724-2iv): add failing guard for stale analyzed_tier after stream completion"
  - 57e60698: "fix(260724-2iv): carry the server-written analyzed_tier through stream completion"
key-files:
  created:
    - src/pages/__tests__/Results.stream-tier-carry.test.tsx
  modified:
    - src/pages/Results.tsx
---

# Quick 260724-2iv: Carry analyzed_tier through the Results stream-completion merge — Summary

Fresh streaming resume analyses now pick up the server-written `resumes.analyzed_tier` via a
one-shot authoritative re-read after the `complete` event, so an Elite user no longer sees the
D-4 "pre-upgrade record" line over a brand-new Elite result without reloading the page.

## What Changed

**`src/pages/Results.tsx`** (+29 lines, two edits, no deletions):

1. Exported pure helper `applyAuthoritativeTier(prev, read)` at module scope (after
   `resultsResumeSteps`). It returns `prev` untouched when `prev` is falsy, when the read
   errored, or when no row came back — so a failed/invisible read can never fabricate a tier.
   Otherwise it merges `read.data.analyzed_tier ?? null` over `prev`. It takes exactly two
   arguments; there is no `userTier` / subscription fallback anywhere in it.
2. Wired a one-shot re-read into the existing stream-completion effect, fired AFTER the
   existing `setResume` / `setLoading(false)` / `sessionStorage.removeItem` calls so the
   streamed result body renders immediately and is neither delayed nor clobbered:
   `supabase.from('resumes').select('analyzed_tier').eq('id', id).maybeSingle()` — only the one
   column, never `*`. Guarded with the file's established `cancelled`-flag pattern; the effect
   gained a `return () => { cancelled = true; };` cleanup (the only structural change).

No retry loop was added — the server writes `analyzed_tier` before it emits the `complete`
event, and the realtime subscription plus the 90s stuck-safeguard remain as backstops.

**`src/pages/__tests__/Results.stream-tier-carry.test.tsx`** (new, 10 tests, 3 groups): Group A
pins the helper's merge contract, Group B renders `EliteRerunCta` on the helper's own output for
both the fresh-Elite and the honest-NULL case, Group C source-pins the wiring so a future
refactor that drops the authoritative re-read fails loudly.

## RED → GREEN Proof

**RED (at HEAD, before the fix)** — `npx vitest run src/pages/__tests__/Results.stream-tier-carry.test.tsx`:

```
 Test Files  1 failed (1)
      Tests  10 failed (10)
```

Failure modes observed, all for the right reason:

- 7 × `TypeError: applyAuthoritativeTier is not a function` (the export does not exist yet)
- 1 × `TypeError: Cannot read properties of undefined (reading 'length')` (the arity assertion)
- 2 × Group C source-pin misses — `expect(resultsSource).toContain("select('analyzed_tier')")`
  and `expect(resultsSource).toContain('applyAuthoritativeTier(')`

The import graph collected cleanly (`@/pages/Results` resolved under jsdom without any extra
`vi.mock` stubs beyond the sibling test's three), so the RED is the missing fix — not a broken
import or a typo.

**GREEN (after the fix)** — same command:

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

**Sibling suites still green** — `Results.tier-reconciliation.test.tsx`,
`Results.priority-output.test.tsx`, `Results.phase22.test.ts`:

```
 Test Files  3 passed (3)
      Tests  17 passed (17)
```

## Verification Gates (actual observed output)

| Gate | Result |
|------|--------|
| `npm run lint` | **PASS** — `✖ 155 problems (0 errors, 155 warnings)` |
| `npm run type-check` | **PASS** — `tsc -p tsconfig.app.json --noEmit`, no output |
| `npm run test` | **PASS** — `Test Files 117 passed (117)` / `Tests 829 passed (829)` |
| `npm run build` | **PASS** — `✓ built in 12.21s` |

**Test counts vs. HEAD:** 829 passed after the change; the new file contributes exactly 10 tests
(observed in isolation), so the pre-change baseline was 819. The change adds tests and removes
none — no count regression.

**Lint honesty note:** the baseline was measured directly by stashing `src/pages/Results.tsx` and
re-running lint: `✖ 152 problems (0 errors, 152 warnings)`. The change therefore adds 3
warnings, 0 errors:

- `react-refresh/only-export-components` at the new export — an inherent consequence of the
  plan's "one small exported pure helper inside the existing `Results.tsx` module, no new lib
  file" constraint.
- 2 × `@typescript-eslint/no-explicit-any` on `prev: any` in the helper signature and in the new
  `setResume` callback — the plan mandates this exact signature (the file is `any`-typed around
  `resume`, and `applyAuthoritativeTier.length === 2` depends on it).

No lint rule was disabled, suppressed, or weakened, and no test was weakened to go green.

## D-4 Preservation (explicit statement)

**D-4's honest-NULL branch is still exercised and passing.** Two independent guards cover it:

1. `Results.stream-tier-carry.test.tsx` Group A — a read returning
   `{ data: { analyzed_tier: null }, error: null }` yields `analyzed_tier === null`; Group B then
   renders `EliteRerunCta` on that exact object with `userTier='elite'` and asserts
   `screen.getByText(/Tier of this analysis isn't recorded/)` is present while
   `/Rerun with Elite —/` is absent.
2. The pre-existing `Results.tier-reconciliation.test.tsx` tier matrix (unchanged, still green).

The fix removes only the **stale** NULL, never the **honest** one. The rendered tier originates
solely from `resumes.analyzed_tier`; no path derives it from `userTier`, and no literal `'elite'`
default was introduced.

## Scope Compliance

- `git diff --stat -- supabase/` → **empty**. Zero edge-function, migration, RLS, or
  Merit/charging-path changes. Frontend-only, no deploy coupling.
- Only two files changed: `src/pages/Results.tsx` and the new test file.
- `.gitignore` untouched. All staging done by explicit filename — no `git add -A` / `.` / `-f`.
- Docs artifacts (SUMMARY.md, STATE.md) intentionally left uncommitted for the orchestrator.

## Deviations from Plan

None — the plan was executed exactly as written.

## Self-Check: PASSED

- `src/pages/Results.tsx` — FOUND, contains `applyAuthoritativeTier` and `select('analyzed_tier')`
- `src/pages/__tests__/Results.stream-tier-carry.test.tsx` — FOUND
- Commit `87f2bdbc` (RED) — FOUND
- Commit `57e60698` (GREEN) — FOUND

## Production Verification — CONFIRMED 2026-07-24

Operator deployed the frontend and re-ran the flow on **production**: the stale
"Tier of this analysis isn't recorded (pre-upgrade record)" banner no longer appears on a fresh
Elite streaming resume analysis. Reported verbatim as "green on prod".

This closes the one gate the executor could not discharge itself. The static gates
(RED->GREEN, lint/type-check/829 vitest/build) proved the logic; this closes the live
click-through that had been recorded as pending because the Vercel Git link is disconnected
(see quick 260723-adm) and the build had to be produced by hand.

Not re-verified by Claude — this is an operator field observation, recorded as reported.
The complementary D-4 case (a genuinely NULL pre-upgrade row still showing the neutral
non-charging line) remains proven by test, not by a production sighting.
