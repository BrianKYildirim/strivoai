---
phase: 03-cross-domain-inventory-audit
plan: 06
subsystem: testing
tags: [audit, performance, static-analysis, perf-hotspots, ripgrep, supabase-edge, react-query]

# Dependency graph
requires:
  - phase: 03-01
    provides: KEEP-LIST.md (the D-07 false-positive gate) + INDEX.md (pre-listed PERF-HOTSPOTS.md row) + durable .planning/audit/ scaffold
provides:
  - PERF-HOTSPOTS.md — PERF-01 static suspected-inefficiency-hotspot catalog (5 hotspots, file:line anchors re-confirmed against current code, categories, three-tier classification, explicit no-measurement boundary)
affects: [Phase 9 PERF-02 behavior-preserving refactors, Phase 9 PERF-03 clarity, Phase 9 PERF-04 measurement, Phase 8 DB-04 usage_tracking drop decision]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-only PERF catalog: file:line + category + three-tier classification, with a prominent D-12 no-measurement boundary, mirroring the 02-SECRET-SCAN classified-table shape"
    - "Re-confirm-against-current-code discipline: v3.0-map line numbers AND behavior re-verified, drift recorded explicitly (cap is now per-tier; merit race largely remediated)"

key-files:
  created:
    - .planning/audit/PERF-HOTSPOTS.md
  modified: []

key-decisions:
  - "STATIC ONLY (D-12): no profiler / no benchmark / no harness — measurement deferred to Phase 9 (PERF-04); boundary stated prominently in the catalog so no measurement work is pulled forward (threat T-3-13)"
  - "4 of 5 hotspots = needs-investigation (KEEP-LIST gate: business-critical reliability paths + legacy usage_tracking); only H4 (pure server-side merge utility) earned safe-candidate, and even that is gated to Phase-9's measured/behavior-preserving process"
  - "Recorded line+behavior DRIFT from v3.0 seeds: H1 cap is now per-tier getMaxInputChars(...) with 12000 only as a ?? fallback (no longer a flat hardcode); H3 merit refetch race (CONCERNS §9) is now largely remediated by useMerits bounded reconcile polls"

patterns-established:
  - "PERF-HOTSPOTS classification rows inline-cite the four D-06 concurring signals for any safe verdict and inline-cite the KEEP-LIST gate for any needs-investigation verdict"

requirements-completed: [PERF-01]

# Metrics
duration: 4min
completed: 2026-06-14
---

# Phase 03 Plan 06: PERF-01 Inefficiency-Hotspot Catalog Summary

**Static code-review catalog of 5 suspected inefficiency hotspots (redundant work, N+1/repeated access, recomputation, oversized payload) across the business-critical flows — each with a re-confirmed file:line anchor, a category, and a three-tier classification, and an explicit "no measurement; Phase 9 owns it" boundary.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T00:24:23Z
- **Completed:** 2026-06-14T00:28:00Z
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments
- Re-confirmed all 5 PERF-01 seed hotspots against CURRENT code (v3.0-map line numbers had drifted; two seeds had also drifted in *behavior*, which is recorded):
  - H1 — analyze-career repeated `resumeText`/`linkedInData` slicing; the cap is now **per-tier** (`getMaxInputChars('careerCompass', tier)`) with `?? 12000` as a fallback, re-derived at two branches (`index.ts:1173-1176`, `:1539-1541`) plus a separate cache-key constant (`:90`/`:127`) — recomputation/oversized-payload.
  - H2 — `usage_tracking` dual-write surface fully mapped (shared writers `usage-checker.ts:28`/`:109`, `merit-gateway.ts:165`; per-feature call-sites in analyze-resume / analyze-career / recruiting-lens / grade-linkedin / interview-prep-analyze) — redundant-work.
  - H3 — merit-balance refetch (`useMerits.ts:71` `staleTime: 5_000` + the `:130-151`/`:161-189` bounded reconcile polls that re-read `get_merit_balance` + `profiles` each interval) — repeated/ill-timed access; recorded that the v3.0 "invalidate not auto-called" gap is now largely remediated.
  - H4 — parallel-merge per-call `repairTruncatedJSON` + `JSON.parse` + validate (`result-merger.ts:290-332`, invoked 3-5×/run; sibling `recruiting-lens-merger.ts:131-132`) — recomputation.
  - H5 — per-feature latest-row `.order('created_at', desc).limit(1)` duplicated across ~10 pages/components — N+1/repeated-query.
- Produced `.planning/audit/PERF-HOTSPOTS.md` in the 02-SECRET-SCAN six-part shape: header + D-12 boundary banner, verdict/summary (counts by category + classification), read-only review commands, classified-findings table, re-assertion block (bash + PowerShell), cross-references (KEEP-LIST + DATABASE + Phase 9 consumer).
- Held the static-only boundary: NO profiler, NO benchmark, NO harness — measurement explicitly deferred to Phase 9 (PERF-04).

## Task Commits

Each task was committed atomically:

1. **Task 1: Static sweep + re-confirm file:line anchors** - (no standalone commit — read-only static review; evidence captured into the catalog in Task 2, per the plan's `<files>(none)` spec)
2. **Task 2: Write PERF-HOTSPOTS.md + commit** - `17ac642` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) - see final docs commit.

## Files Created/Modified
- `.planning/audit/PERF-HOTSPOTS.md` - PERF-01 static suspected-hotspot catalog: 5 hotspots, re-confirmed file:line anchors, categories, three-tier classification, prominent no-measurement (D-12) boundary, KEEP-LIST + Phase-9 cross-refs.

## Decisions Made
- **Static only, boundary stated prominently (D-12):** the catalog leads with a blockquote banner that measurement/profiling/benchmark is Phase 9 (PERF-04), and even the one `safe`-candidate row inline-caveats that `safe` means "low-risk to triage/measure," not "refactor outside Phase 9's measured/behavior-preserving process." This neutralizes scope-creep threat T-3-13.
- **KEEP-LIST gate forced 4/5 to needs-investigation:** H1 (Career Compass) and H3 (merits/Stripe) are CLAUDE.md business-critical reliability paths; H2 is the legacy `usage_tracking` table gated to Phase 8 (DB-04); H5 spans business-critical pages with per-call column-set differences. Only H4 (a pure, internally-called server-side merge utility) met the four D-06 concurring signals for `safe`-candidate.
- **Drift recorded, not papered over:** the v3.0 leads were treated as leads — H1's flat `MAX_CONTEXT_CHARS=12000` is now a per-tier cap, and H3's race is largely remediated. The catalog records the CURRENT shape so Phase 9 doesn't chase a stale description.

## Deviations from Plan

None - plan executed exactly as written. (Task 1 is read-only by design — its `<files>` is `(none)`; per the plan, the static-review evidence is captured into PERF-HOTSPOTS.md in Task 2, so there is one task commit, not two. No product code was touched and no measurement was run.)

## Issues Encountered
None. All five `rg` sweeps reproduced cleanly; line anchors re-confirmed against current code. The only notable findings were *expected* drift (line numbers + two behavior changes since the v3.0 maps), which were recorded in the catalog rather than treated as errors.

## User Setup Required
None - no external service configuration required (read-only static catalog).

## Next Phase Readiness
- PERF-01 satisfied: Phase 9 (PERF-02/03/04) has a triaged, located, classified suspect list to measure and act on.
- All 5 Wave-2 domain catalogs in `.planning/audit/` are now produced (DEAD-CODE, DEPENDENCIES, ENV-INVENTORY, DATABASE, PERF-HOTSPOTS), completing the cross-domain inventory; Phase 3 (03-01..03-06) audit is complete.
- Zero functional change preserved: `git diff fa4ccb6..HEAD -- src supabase/functions` is empty; `git show --stat HEAD` lists only PERF-HOTSPOTS.md.

## Self-Check: PASSED

- FOUND: `.planning/audit/PERF-HOTSPOTS.md`
- FOUND: `.planning/phases/03-cross-domain-inventory-audit/03-06-SUMMARY.md`
- FOUND: commit `17ac642` (docs(03-06): PERF-HOTSPOTS.md)
- Zero functional change: `git diff fa4ccb6..HEAD -- src supabase/functions` empty; `git show --stat HEAD` lists only PERF-HOTSPOTS.md

---
*Phase: 03-cross-domain-inventory-audit*
*Completed: 2026-06-14*
