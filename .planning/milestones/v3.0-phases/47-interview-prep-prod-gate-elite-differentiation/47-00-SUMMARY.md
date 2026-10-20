---
phase: 47-interview-prep-prod-gate-elite-differentiation
plan: 00
subsystem: infra
tags: [feature-flags, vite, vitest, environment-variables, fail-closed]

requires: []
provides:
  - "isInterviewPrepEnabled() helper — single source of truth for Phase 47 IPC gate"
  - "Vitest test matrix locking fail-closed env-coercion semantics"
  - "VITE_FEATURE_* feature-flag convention precedent for the repo"
affects:
  - 47-01-PLAN.md
  - 47-02-PLAN.md
  - 47-03-PLAN.md
  - 47-04-PLAN.md
  - 47-05-PLAN.md
  - 47-06-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Feature flag = pure synchronous helper reading import.meta.env at call site"
    - "Strict string equality (=== 'true') instead of truthy-coercion for env booleans"

key-files:
  created:
    - src/config/feature-flags.ts
    - src/config/__tests__/feature-flags.test.ts
  modified: []

key-decisions:
  - "Single helper at src/config/feature-flags.ts owns all reads of VITE_FEATURE_INTERVIEW_PREP (D-07)"
  - "Strict string equality === 'true' so 'TRUE', '1', 'yes', etc. all fail closed (D-08)"
  - "Helper does not read import.meta.env.MODE or PROD — locked in via dedicated test (D-09)"
  - "Helper does not cache the env value across calls (Vite inlines at build time, no perf cost)"

patterns-established:
  - "Phase 47 VITE_FEATURE_* convention: per-Vercel-environment string '"true"' or '"false"' on the scope"
  - "Feature flag tests use vi.stubEnv + vi.unstubAllEnvs for clean per-test env isolation"

requirements-completed:
  - IPC-PROD-FLAG

duration: ~8min
completed: 2026-05-11
---

# Phase 47 Plan 00: Interview Prep Production Gate — Feature Flag Helper Summary

**Single fail-closed `isInterviewPrepEnabled()` helper plus a 10-case Vitest matrix locking strict-string-equality env-coercion semantics for the Phase 47 production gate.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- Established `src/config/feature-flags.ts` as the single source of truth for the Interview Prep production gate (D-07).
- Implemented `isInterviewPrepEnabled(): boolean` with strict string equality `=== 'true'`, ensuring `'TRUE'`, `'True'`, `'1'`, `'yes'`, `'on'`, `''`, and `undefined` all fail closed (D-06/D-08).
- Locked in via test that the helper does NOT consult `import.meta.env.MODE` or `import.meta.env.PROD` (D-09) — both equal `'production'` for every `vite build`, including preview/staging.
- Established the `VITE_FEATURE_*` convention for the repo (none existed previously; only `import.meta.env.DEV` was in use at 2 sites).
- Wave 2 plans (47-01..47-05) can now import the helper and gate their surfaces with zero additional env-coercion logic.

## Task Commits

1. **Task 1: Create `isInterviewPrepEnabled()` helper** — `a99e78f` (feat)
2. **Task 2: Vitest matrix locking fail-closed env-coercion semantics** — `ab92177` (test)

## Files Created/Modified

- `src/config/feature-flags.ts` — exports `isInterviewPrepEnabled(): boolean`. Reads `import.meta.env.VITE_FEATURE_INTERVIEW_PREP` with strict-equality `=== 'true'`. No other exports; no MODE/PROD branches.
- `src/config/__tests__/feature-flags.test.ts` — 10 explicit Vitest cases covering: `undefined`, `''`, `'false'`, `'TRUE'`, `'True'`, `'1'`, `'yes'`, `'on'`, the only-true case `'true'`, and a D-09 lock-in proving MODE/PROD do not influence the result.

## Verification Results

| Check | Result |
| ----- | ------ |
| `npx eslint src/config/feature-flags.ts` | Pass (clean) |
| `npx eslint src/config/__tests__/feature-flags.test.ts` | Pass (clean) |
| `npx vitest run src/config/__tests__/feature-flags.test.ts` | **10/10 passing** |
| Grep `import.meta.env.VITE_FEATURE_INTERVIEW_PREP` across `src/` | Single hit in `src/config/feature-flags.ts` (single source of truth confirmed) |

## Decisions Made

- **Helper location:** `src/config/feature-flags.ts` — aligns with the existing `@/config/*` convention used by `pricing-config.ts`.
- **No caching:** The helper does not memoize the env value across calls. Vite inlines `import.meta.env.*` at build time so re-reading is free, and avoiding module-level state keeps the helper trivial to test under `vi.stubEnv`.
- **Test matrix is explicit, not table-driven:** Each false-case is a separate `it()` block. Reviewer can scan the matrix at a glance; harder to silently regress than a `.each([...])` loop.
- **No ambient typing change to `vite-env.d.ts`:** Inspected — the project's `vite-env.d.ts` is a single `/// <reference types="vite/client" />` line with no custom `ImportMetaEnv` interface. The bare access works in strict mode because `vite/client` types `import.meta.env` as `Record<string, any>`. Adding a custom interface would require enumerating every `VITE_*` var the repo uses (out of scope for Plan 00).

## Deviations from Plan

### Auto-fixed Issues

**1. [Out-of-scope — logged only] Pre-existing `tsc --noEmit` errors in unrelated files**
- **Found during:** Task 1 verification (`npx tsc --noEmit -p tsconfig.app.json`)
- **Issue:** `tsc --noEmit` reports errors in `src/pages/CareerCompass.tsx`, `src/pages/Dashboard.tsx`, `src/pages/SkillsGapAnalysis.tsx`, and `src/pages/Upload.tsx`. None reference `src/config/feature-flags.ts` or anything Phase 47 Plan 00 touches.
- **Action:** Per SCOPE BOUNDARY rule, these are out-of-scope pre-existing issues. Not fixed by this plan. They should be addressed by the team owning those pages or in a dedicated cleanup plan.
- **Files affected by this plan:** Type-checked successfully — `tsc` produces zero errors when filtered to `feature-flags.ts`.

---

**Total deviations:** 0 to plan; 1 pre-existing repo-wide issue logged.
**Impact on plan:** None. Plan 00 deliverables shipped exactly as specified. Downstream Wave 2/3 plans are unblocked.

## Issues Encountered

None.

## Known Stubs

None. The helper is fully wired to `import.meta.env.VITE_FEATURE_INTERVIEW_PREP` and exercised by Wave 2 plans. No placeholder data or "TODO" markers introduced.

## User Setup Required

None for this plan specifically. **Phase-level setup** (out of scope for Plan 00, addressed in Plan 47-06 per CONTEXT) is to add the Vercel env-var entries:

- Vercel "Production" scope: `VITE_FEATURE_INTERVIEW_PREP=false`
- Vercel "Preview" scope: `VITE_FEATURE_INTERVIEW_PREP=true`

Without those, the helper is a no-op (returns `false` everywhere — i.e. permanently hidden, which is also the fail-closed default).

## Next Phase Readiness

- Wave 2 plans (47-01 through 47-05) can `import { isInterviewPrepEnabled } from '@/config/feature-flags';` and gate every Interview Prep surface (route, navbar, sidebar, ExploreFeatures tile, pricing bullets, AnalysisHistory filter) against this single helper.
- Plan 47-06 (operator/Vercel env-var setup + roadmap update) consumes this helper indirectly via the env-var contract.
- No blockers.

## Self-Check: PASSED

- `src/config/feature-flags.ts` — FOUND
- `src/config/__tests__/feature-flags.test.ts` — FOUND
- Commit `a99e78f` (Task 1) — FOUND
- Commit `ab92177` (Task 2) — FOUND
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-00-SUMMARY.md` — FOUND

---
*Phase: 47-interview-prep-prod-gate-elite-differentiation*
*Plan: 00*
*Completed: 2026-05-11*
