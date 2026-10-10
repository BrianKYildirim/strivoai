---
phase: 06-dependency-hygiene
plan: 02
subsystem: infra
tags: [dependencies, npm, recharts, date-fns, major-bump, semver, verify-baseline]

# Dependency graph
requires:
  - phase: 06-01
    provides: "NFR-02 bump ledger (06-DEP-CHANGES.md) + RESIDUAL-REGISTER defer flips + DEP-02 removals at HEAD 77ca5410"
  - phase: 03
    provides: "DEPENDENCIES.md (DEP-01) inventory that classified recharts/date-fns as behavioral-surface contained majors"
  - phase: 05
    provides: "verify:baseline HARD gate (vitest + deno test:ci 699 + Playwright) as the zero-functional-change net"
provides:
  - "recharts ^2.15.4 -> ^3.8.1 taken as its own atomic, revertable commit (DEP-03 behavioral major)"
  - "date-fns ^3.6.0 -> ^4.4.0 taken as its own atomic, revertable commit (DEP-03 behavioral major)"
  - "Two NFR-02 ledger rows (from->to, baseline evidence, operator-PASS smoke note, revert SHA, status=taken)"
  - "Operator-confirmed D-02 manual smoke of both consumer surfaces (charts + date formatting) = PASS"
affects: [06-03, 06-05, 06-06, dependency-hygiene]

# Tech tracking
tech-stack:
  added: ["recharts@3.8.1 (major bump from 2.x)", "date-fns@4.4.0 (major bump from 3.x)"]
  patterns:
    - "Atomic-per-major bump (D-07/NFR-02): one major == one commit == one git-revert rollback unit"
    - "D-02 blocking operator smoke ON TOP of verify:baseline for production-runtime visual majors (pixel/label drift is invisible to the offline + E2E net)"

key-files:
  created:
    - ".planning/phases/06-dependency-hygiene/06-02-SUMMARY.md"
  modified:
    - "package.json (recharts ^3.8.1 + date-fns ^4.4.0)"
    - "package-lock.json (integrity hashes for the two majors + their resolved subtrees)"
    - ".planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md (2 Wave-2 ledger rows; smoke notes flipped PENDING -> PASS)"

key-decisions:
  - "recharts 2->3 taken: re-grep of the 3 live consumers (ScoreProgressChart, EliteScoreHistory, ui/chart.tsx) confirmed ZERO removed v3 internals (activeIndex/alwaysShow/isFront/recharts-scale/react-smooth/.current.current) — public API only, so the major is safe to take."
  - "date-fns 3->4 taken: all 9 consumers use top-level named imports ONLY (format/isToday/isYesterday/differenceInDays) — zero date-fns/fp, date-fns-tz, or subpath imports anywhere in src, so v4's ESM-first + TZ-generic surface is not exercised."
  - "Each major is its OWN atomic commit (the documented git-revert rollback unit), gated on verify:baseline PLUS a targeted operator smoke (D-02) — not folded into a single combined bump."

patterns-established:
  - "Atomic-per-major with a recorded revert SHA: a failing smoke reverts exactly one major (bounded blast radius), never the pair."
  - "Behavioral-major smoke is a BLOCKING checkpoint recorded in the ledger; the plan stays autonomous:false until the operator confirms."

requirements-completed: [DEP-03, NFR-02]

# Metrics
duration: ~40min (incl. blocking operator smoke wait)
completed: 2026-06-20
---

# Phase 6 Plan 02: Behavioral Majors (recharts@3 + date-fns@4) Summary

**Took the two contained behavioral-surface majors — recharts ^2.15.4 -> ^3.8.1 and date-fns ^3.6.0 -> ^4.4.0 — each as its own atomic, git-revertable commit gated on green verify:baseline PLUS an operator-confirmed D-02 smoke of its consumer surface (Dashboard charts + date formatting), zero functional change.**

## Performance

- **Duration:** ~40 min (including the blocking operator-smoke pause)
- **Started:** 2026-06-20T04:13Z (Task 1 recharts bump)
- **Completed:** 2026-06-20 (operator approved Task 3 smoke; closeout)
- **Tasks:** 3 (2 auto bumps + 1 blocking operator smoke)
- **Files modified:** 3 (`package.json`, `package-lock.json`, `06-DEP-CHANGES.md`)

## Accomplishments

- **recharts ^2.15.4 -> ^3.8.1** taken as atomic commit `7c4fca0b` — re-grep of the 3 live consumers (`ScoreProgressChart.tsx`, `EliteScoreHistory.tsx`, `ui/chart.tsx`) returned ZERO removed v3 internals (`activeIndex`/`alwaysShow`/`isFront`/`recharts-scale`/`react-smooth`/`.current.current`); they use the public API only (AreaChart/LineChart/XAxis/YAxis/Tooltip/ResponsiveContainer/CartesianGrid/ReferenceLine/Area/Line/Legend).
- **date-fns ^3.6.0 -> ^4.4.0** taken as atomic commit `6199439b` — re-grep of all 9 consumers confirmed top-level named imports ONLY (`format`/`isToday`/`isYesterday`/`differenceInDays`); ZERO `date-fns/fp`, `date-fns-tz`, or subpath imports anywhere in `src`, so v4's ESM-first + TZ-generic surface is never exercised.
- **verify:baseline green after EACH bump** at the current-HEAD baseline: vitest **457** / deno **699/0/11** / Playwright **5 passed + 1 skip**; `npm run build` exit 0 both times.
- **Operator D-02 smoke = PASS for both surfaces** — recharts (Dashboard `ScoreProgressChart` + `EliteScoreHistory` render with axes / line-area / tooltip / `ReferenceLine`, no console errors) and date-fns (AnalysisHistory / CareerCompass / AdminUsage dates + Today/Yesterday labels correct, no `Invalid Date`).
- **Two NFR-02 ledger rows** appended to `06-DEP-CHANGES.md`, each carrying from->to + baseline evidence + the operator-PASS smoke note + the revert SHA + status=taken.

## Task Commits

Each task was committed atomically:

1. **Task 1: Take recharts 2->3 (atomic, no removed-internal usage)** - `7c4fca0b` (chore) + ledger row `6a30986d` (docs)
2. **Task 2: Take date-fns 3->4 (atomic, top-level-only usage)** - `6199439b` (chore) + ledger row `c0897bcf` (docs)
3. **Task 3: Operator smoke (D-02, blocking checkpoint)** - no code commit; outcome = PASS recorded in the ledger as part of the closeout commit

**In-progress STATE record (pause at Task 3):** `7a177a06` (docs)
**Plan metadata / closeout (ledger smoke-note flip + SUMMARY + STATE advance):** this commit (docs)

_Note: each behavioral major is its OWN commit so it is a self-contained git-revert rollback unit (NFR-02/D-07)._

## Files Created/Modified

- `package.json` - recharts `^2.15.4 -> ^3.8.1`; date-fns `^3.6.0 -> ^4.4.0` (two separate atomic commits)
- `package-lock.json` - integrity hashes for the two resolved majors + their dependency subtrees
- `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md` - 2 Wave-2 ledger rows (recharts + date-fns); both smoke notes flipped `PENDING-Task-3 -> PASS` at closeout
- `.planning/phases/06-dependency-hygiene/06-02-SUMMARY.md` - this file

## Decisions Made

- **recharts 2->3 is safe to take:** the v3 removals (`recharts-scale`/`react-smooth` internals, `activeIndex`/`alwaysShow`/`isFront`, `ResponsiveContainer ref.current.current`) are not referenced by any of the 3 live consumers — re-grep returned nothing, matching the 06-RESEARCH consumer sweep.
- **date-fns 3->4 is safe to take:** v4 is ESM-first + adds TZ support but has NO runtime breaking change for standard top-level usage; the repo's 9 consumers only use top-level named functions (no `/fp`, no TZ subpath), so the breaking surface is untouched.
- **Atomic-per-major (D-07/NFR-02):** kept each bump in its own commit so a failed smoke reverts exactly one major (bounded blast radius), never the pair.

## Deviations from Plan

None - plan executed exactly as written. Both majors bumped to their RESEARCH-recorded targets (recharts 3.8.1, date-fns 4.4.0), each as its own atomic verify:baseline-green commit; the blocking operator smoke (Task 3) was awaited and returned PASS for both surfaces.

## Issues Encountered

- **Baseline-number drift (informational, not a deviation):** the plan text cites deno `698`, but the current-HEAD baseline is `699/0/11`. The `+1` is the documented pre-existing Phase-5 code-review drift (WR-04 `fa78d30e`, WR-05 `197689d5`, WR-06 `e307f4e6`) that landed after the 698 snapshot — NOT caused by this npm-only change (zero `supabase/` files touched). vitest 457 + Playwright 5+1skip unchanged; zero functional change holds. Recorded in the ledger baseline note and STATE.

## User Setup Required

None - no external service configuration required. The only manual step was the Task 3 operator smoke (visual eyeball of Dashboard charts + date surfaces), which is complete and PASSED.

## Next Phase Readiness

- Wave 2 behavioral majors done (recharts@3 + date-fns@4 taken, validated, smoke-PASS, revert SHAs recorded). Plan 06-02 complete.
- **Next:** Plan 06-03 (Wave 2 continued — mechanical / devDep majors + `@hookform/resolvers` 3->5 which zod-3.25 satisfies, plus grouped minor/patch batches).
- **Carry-forward (unchanged):** Wave 3 (06-05) must re-measure the npm-audit vuln surface at execute time (re-run `npm run audit:deps`; re-confirm vite / react-router-dom / ws-override / promptfoo). Wave 4 (06-06) DEP-05 lockfile reconcile (package-lock + deno.lock + `npm ci` proof) runs strictly last and flips the DEP-05 placeholder ledger row to taken.

## Self-Check: PASSED

- Files exist: `06-02-SUMMARY.md`, `06-DEP-CHANGES.md` (both FOUND)
- Commits exist: `7c4fca0b`, `6199439b`, `6a30986d`, `c0897bcf`, `7a177a06` (all FOUND)
- Ledger smoke notes: 2 operator-PASS, 0 PENDING-Task-3 remaining
- No `package.json`/`package-lock.json` change introduced by this closeout (empty `git diff HEAD`)

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
