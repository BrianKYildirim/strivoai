---
phase: 06-dependency-hygiene
plan: 01
subsystem: infra
tags: [npm, dependencies, knip, lockfile, dotenv, dep-hygiene, nfr-02]

# Dependency graph
requires:
  - phase: 03-cross-domain-inventory-audit
    provides: DEPENDENCIES.md inventory + KEEP-LIST gate (the DEP-02 unused set + the 15 false-positives)
  - phase: 05-deep-test-coverage-expansion
    provides: the verify:baseline gate (vitest + offline deno test:ci + Playwright) used as the zero-functional-change proof
provides:
  - "DEP-02 removals: html2canvas, jspdf, react-markdown, @tailwindcss/typography gone from package.json + package-lock.json (zero code/config refs, re-confirmed at HEAD)"
  - "dotenv declared in devDependencies (^17.4.2, D-05) — no longer knip-unlisted"
  - "06-DEP-CHANGES.md: the NFR-02 bump ledger (7-col schema) the rest of Phase 6 appends to"
  - "RESIDUAL-REGISTER.md: the 3 DEP-03 DEFER flips + 5 D-01 deferred framework majors (append-only)"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, dependency-hygiene, dep-03, dep-04, dep-05, nfr-02]

# Tech tracking
tech-stack:
  added: ["dotenv ^17.4.2 (devDep, declared — was already transitively resolved via promptfoo)"]
  patterns: ["NFR-02 atomic-per-change commit + bump-ledger (commit SHA = git-revert rollback unit)", "append-only RESIDUAL-REGISTER for deferred majors", "HEAD re-confirm (knip + rg zero-ref sweep) before any removal (D-06)"]

key-files:
  created:
    - ".planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md"
  modified:
    - "package.json"
    - "package-lock.json"
    - ".planning/audit/RESIDUAL-REGISTER.md"

key-decisions:
  - "DEP-02 set re-confirmed at HEAD = NO DRIFT: knip byte-identical (18 unused deps + 2 unused devDeps + 1 unlisted dotenv); the 4 removal candidates re-passed the zero-reference sweep; the 15 KEEP-LIST false-positives unchanged."
  - "dotenv declared at ^17.4.2 (the already-transitively-resolved major via promptfoo) — npm deduped to the existing integrity-hashed 17.4.2, no new download (T-06-02 typosquat mitigation)."
  - "deno.lock deliberately NOT regenerated here — deferred to Plan 06-06 (Wave 4, strictly last; Pitfall 6). Only package-lock.json reconciled via npm install."
  - "verify:baseline deno count is 699/0/11 (not the 698 Phase-5-close baseline) — a pre-existing +1 from Phase-5 code-review commits (WR-04/05/06) that landed after the 698 snapshot, NOT caused by this npm-only change (zero supabase/ files touched). Zero functional change holds."

patterns-established:
  - "Bump ledger 06-DEP-CHANGES.md: Package | From->To | Type | Validation evidence | Smoke | Revert SHA | Status. Append-only across Waves 1-4."
  - "Deferred-majors register: DEP-03 DEFER flips + framework majors land in RESIDUAL-REGISTER.md with from->to + breaking reason + clearance criterion (documented-outdated, not dropped)."

requirements-completed: [DEP-02, NFR-02]

# Metrics
duration: 16min
completed: 2026-06-20
---

# Phase 6 Plan 01: DEP-02 Removals + dotenv Declare + NFR-02 Ledger Scaffolding Summary

**Removed 4 confirmed-unused deps (html2canvas, jspdf, react-markdown, @tailwindcss/typography), declared dotenv in devDependencies, and stood up the NFR-02 bump ledger + the deferred-majors register — verify:baseline green, zero functional change.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-06-20T03:57:19Z
- **Completed:** 2026-06-20T04:13:18Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **DEP-02 removals re-confirmed at HEAD then executed:** ran `npm run audit:deps` + `knip --reporter json` and the explicit `rg` zero-reference sweep over `src`/`supabase`/`scripts`/`e2e`/root-config — the removal set had **NOT drifted** (still exactly `html2canvas`, `jspdf`, `react-markdown` in deps + `@tailwindcss/typography` in devDeps; the 15 KEEP-LIST false-positives unchanged; `dotenv` still unlisted). Then removed all 4 from `package.json`, reconciled `package-lock.json` via `npm install` (97 removed / 155 added-deduped).
- **dotenv declared (D-05):** added `"dotenv": "^17.4.2"` to `devDependencies` (the already-transitively-resolved major via promptfoo). knip post-run confirms `dotenv` no longer "unlisted" and npm deduped to the existing integrity-hashed copy.
- **react-pdf + pdfjs-dist preserved:** both re-confirmed live (consumers `src/lib/pdf-worker.ts` + `pdf-extractor.worker.ts`) and untouched in `package.json`; the 14 shadcn `ui/**` deps + `supabase` CLI (KEEP-LIST false-positives) untouched.
- **NFR-02 bump ledger stood up:** created `06-DEP-CHANGES.md` (7-col schema) seeded with the 4 removal rows + the dotenv-declare row (status=taken, revert SHA `77ca5410`) + the DEP-05 lockfile placeholder (status=pending, Plan 06-06).
- **Deferred-majors registered (append-only):** appended the 3 DEP-03 DEFER flips (lucide-react 0->1, react-day-picker 8->10, tailwind-merge 2->3) + the 5 D-01 deferred framework majors (React 18->19 coupled set, Tailwind 3->4, Zod 3->4, TypeScript 5->6, react-router-dom 6->7) to `RESIDUAL-REGISTER.md`, each with from->to + breaking reason + clearance criterion.
- **Gates green:** `npm run build` exit 0; `npm run verify:baseline` green (vitest 457 / deno 699/0/11 / Playwright 5+1skip).

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-confirm DEP-02 at HEAD, remove 4 unused deps + declare dotenv, gate on build + verify:baseline** - `77ca5410` (chore)
2. **Task 2: Create the NFR-02 bump ledger + append DEP-03/framework DEFER rows to RESIDUAL-REGISTER.md** - `c36a5949` (docs)

**Plan metadata:** (final docs commit — SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

- `package.json` - Removed html2canvas/jspdf/react-markdown (deps) + @tailwindcss/typography (devDep); added dotenv ^17.4.2 (devDep)
- `package-lock.json` - Reconciled via `npm install` (deno.lock deliberately untouched — deferred to 06-06)
- `.planning/phases/06-dependency-hygiene/06-DEP-CHANGES.md` - NEW: the NFR-02 bump ledger (4 removal + dotenv + DEP-05-placeholder rows)
- `.planning/audit/RESIDUAL-REGISTER.md` - APPEND-only: DEP-03 DEFER flips + D-01 deferred framework majors

## Decisions Made

- **DEP-02 set = NO DRIFT at HEAD.** The D-06 re-confirmation (knip + audit:deps + rg sweep) matched the 2026-06-13 inventory exactly; proceeded with the removal with no candidate changes.
- **dotenv pinned to ^17.4.2** (the transitively-resolved major), so `npm install` deduped to the existing integrity-hashed copy rather than downloading an unvetted version.
- **deno.lock left untouched** — its authoritative regen + `npm ci` integrity proof is Plan 06-06 (Wave 4, strictly last; regenerating it mid-stream would produce a lock a later wave invalidates — Pitfall 6).
- **Documentation prose references are not consumers.** The `html2canvas|jspdf|react-markdown` hits in `AGENTS.md` / `CLAUDE.md` / `.planning/codebase/STACK.md` / `.planning/**` / `deno.lock` are prose/generated-mirror, not code/config consumers — the plan's scope sweep targets code/config (`src supabase scripts e2e *.ts *.js *.cjs *.mjs`), which returned zero references. Removal verdict stands.

## Deviations from Plan

None - plan executed exactly as written. No bugs, missing functionality, blocking issues, or architectural decisions arose; no Rule 1-4 deviations triggered.

## Issues Encountered

- **verify:baseline deno count 699 vs the documented 698 baseline.** Investigated before treating as a pass: confirmed the working tree changed **only** `package.json` + `package-lock.json` (zero `supabase/`/Deno files; `deno.lock` untouched), so the +1 cannot originate from this plan. Traced to Phase-5 code-review follow-up commits (`fa78d30e` WR-04 added a case to `analyze.failure-branches.test.ts`; `197689d5` WR-05 + `e307f4e6` WR-06 added assertions) that landed **after** the 698 snapshot was recorded at Phase-5 close. The 699 is the true current-HEAD count; zero functional change holds. Recorded in the bump-ledger baseline note.

## User Setup Required

None - no external service configuration required. (DEP-04 vuln remediation, including the `ws`-override operator decision, is Wave 3 / Plan 06-05 — not this plan.)

## Next Phase Readiness

- **Wave 1 complete.** The dependency surface is slimmer (4 removed), `dotenv` is declared, and the two phase artifacts the rest of Phase 6 appends to are stood up: `06-DEP-CHANGES.md` (the bump ledger) and the DEP-03/framework DEFER section in `RESIDUAL-REGISTER.md`.
- **Ready for Wave 2** (Plans 06-02..06-04 — contained-major bumps): the atomic-per-major + bump-ledger discipline is established; later waves APPEND their rows.
- **Carry-forward for Wave 3 (06-05):** the npm-audit vuln surface has drifted further since research (35 total at this run vs 28 at research time vs 9 at the 06-13 inventory) — Plan 06-05 must re-measure at execute time (re-run `npm run audit:deps`) and re-confirm the `vite` / `react-router-dom` / `ws`-override / `promptfoo` targets before acting.
- **Carry-forward for Wave 4 (06-06):** the DEP-05 lockfile reconcile (`npm install` + `deno install --lockfile-only`) + the `npm ci` reproducibility proof is pending (placeholder row in the ledger); it MUST run strictly last, after all bumps are committed.

## Self-Check: PASSED

- Created file `06-DEP-CHANGES.md`: FOUND
- Commit `77ca5410` (Task 1): in history
- Commit `c36a5949` (Task 2): in history
- `package.json`: no html2canvas/jspdf/react-markdown/@tailwindcss/typography; dotenv present; react-pdf + pdfjs-dist present
- `git grep` over src/supabase/scripts/e2e (excl. package-lock.json): ZERO refs to the 4 removed
- `npm run build` exit 0; `npm run verify:baseline` green (vitest 457 / deno 699/0/11 / Playwright 5+1skip)

---
*Phase: 06-dependency-hygiene*
*Completed: 2026-06-20*
