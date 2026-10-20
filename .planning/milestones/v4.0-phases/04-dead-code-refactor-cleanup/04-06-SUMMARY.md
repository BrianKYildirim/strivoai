---
phase: 04-dead-code-refactor-cleanup
plan: 06
subsystem: testing
tags: [typescript, eslint, type-check, lint, vitest, tsconfig, ignoreDeprecations, react, supabase, navbar]

# Dependency graph
requires:
  - phase: 04-01..04-05
    provides: "Dead-file/IP-cluster/lock-surface/Deno-_shared/export-consolidation removals that shrank the type/lint graph (some Bucket-1 findings vanished with deleted files)"
  - phase: 03-02
    provides: "DEAD-CODE.md catalog + the 04-RESEARCH.md '19 Type Errors' enumeration this plan acted on"
provides:
  - "npm run type-check exits 0 (fully clean — no tracked exception remains)"
  - "npm run lint exits 0 under a ratified config-scope (0 errors, 122 warnings)"
  - "tsconfig.app.json ignoreDeprecations blocker (TS5103) fixed: 6.0 -> 5.0"
  - "test-globals type-gap closed via ONE tsconfig types addition"
  - "SkillsGapAnalysis shipped-crash (3 stray <Navbar/> renders) removed — D-11 fix-with-acknowledgement"
  - "no-explicit-any tracked baseline (99 frontend) recorded in RESIDUAL-REGISTER.md, not purged"
affects: [phase-05-test-coverage, phase-06-dependency-hygiene, any-future-lint-tightening-pass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-scope lint gate: ignore non-frontend surfaces (.claude/**, supabase/functions/** Deno code, generated types.ts) + downgrade pre-existing failing rules to warn as tracked baselines (D-12-sanctioned, zero new inline suppressions)"
    - "test-globals closed by tsconfig types:[vitest/globals,node,vite/client] — one config edit, not per-file edits"
    - "D-11 latent-bug deviation resolved by fix-with-acknowledgement (remove the stray refs to match sibling pages), never silent, never suppressed"

key-files:
  created:
    - ".planning/phases/04-dead-code-refactor-cleanup/04-06-SUMMARY.md"
  modified:
    - "tsconfig.app.json (ignoreDeprecations 6.0->5.0; types:[vitest/globals,node,vite/client])"
    - "eslint.config.js (config-scope ignores + tracked warn baselines)"
    - "src/pages/SkillsGapAnalysis.tsx (removed 3 stray <Navbar/> lines)"
    - "src/pages/CareerCompass.tsx (4 type-corrections + stale directive removal)"
    - "src/pages/Onboarding.tsx, src/pages/Upload.tsx (handler-wrap / Postgrest-generic type fixes)"
    - "src/components/PriorAnalysisSelector.tsx, src/components/PriorLinkedInSelector.tsx, src/lib/document-extraction.ts, src/lib/pdf-extractor.worker.ts (type-corrections)"
    - ".planning/audit/RESIDUAL-REGISTER.md (lint scope + any-baseline + Navbar D-11 outcome)"

key-decisions:
  - "ignoreDeprecations 6.0->5.0 (config-blocker fix, not a suppression — restores pre-6.0 deprecation grace for installed tsc 5.9.3)"
  - "Lint = CONFIG-SCOPE (Option 1): ignore .claude/**, supabase/functions/**, generated types.ts; track no-explicit-any (99) + 5 other pre-existing rules as warn baselines; no 248-any purge"
  - "Navbar D-11 = FIX-WITH-ACKNOWLEDGEMENT via REMOVING the 3 stray <Navbar/> lines (not adding an import) — SkillsGapAnalysis is a dashboard page; siblings render no Navbar"
  - "test-globals gap closed by ONE tsconfig types addition (not 108 edits); node+vite/client re-added so the explicit types array doesn't drop their ambient types"

patterns-established:
  - "Tracked-baseline lint mechanism: downgrading an already-failing rule to warn at config level is D-12-tracked, NOT a new suppression (git diff adds zero @ts-ignore/as any/eslint-disable)"
  - "Headline reconciliation: the historical '19 type errors' = 14 distinct source findings (3 = one Navbar bug) over the true HEAD error surface"

requirements-completed: [CLEAN-06]

# Metrics
duration: 52min
completed: 2026-06-14
---

# Phase 04 Plan 06: Type-Check + Lint Clean (CLEAN-06) Summary

**`type-check` and `lint` both exit 0 with zero new suppressions: ignoreDeprecations config-blocker fixed, all real source type errors corrected behavior-preservingly, the ~108 test-globals gap closed by one tsconfig types line, lint config-scoped with the no-explicit-any baseline tracked (not purged), and the shipped SkillsGapAnalysis `<Navbar/>` crash removed as a D-11 fix-with-acknowledgement.**

## Performance

- **Duration:** 52 min
- **Started:** 2026-06-14T10:53:47Z
- **Completed:** 2026-06-14T11:46:09Z
- **Tasks:** 3
- **Files modified:** 14 source/config + 1 register (across 3 commits) + this SUMMARY

## Accomplishments
- **CLEAN-06 closed** — the last requirement of Phase 4. `npm run type-check` exits **0** (fully clean, no tracked exception); `npm run lint` exits **0** (0 errors, 122 warnings) under the ratified config-scope; `verify:baseline` green throughout (vitest 457/457, deno 284/0, Playwright 5+1skip).
- **ignoreDeprecations config-blocker (TS5103) resolved first** — `tsconfig.app.json:5` `"6.0"` -> `"5.0"`; re-running `type-check` confirmed TS5103 gone and the real source errors surfaced (the "19" were hidden behind this single config abort).
- **All 10 real Bucket-1 production-source type errors fixed** with behavior-preserving type corrections (zero runtime/logic changes), plus **7 real test-type errors** and the **~108 test-globals gap** closed by one tsconfig `types` addition.
- **SkillsGapAnalysis shipped runtime crash removed** (D-11) — 3 stray `<Navbar/>` renders that referenced an unimported symbol (vite build succeeded, so it shipped a `ReferenceError`) deleted to match its sibling dashboard pages.
- **Zero new suppressions across the entire phase diff**; 7 stale suppression directives REMOVED.

## Task Commits

Each task was committed atomically:

1. **Task 1: ignoreDeprecations blocker + source type errors** - `cc55ee9` (fix)
2. **Task 2: test-globals type-gap + lint config-scope** - `57b73ec` (chore)
3. **Task 3: D-11 SkillsGapAnalysis Navbar fix-with-acknowledgement** - `b1ca32a` (fix)

## The "19 errors" headline reconciliation (vs real HEAD)

At HEAD (phase start), with `ignoreDeprecations` fixed, `tsc` surfaced **129 error lines**:
- **14 distinct Bucket-1 production-source findings** across 8 files — of which **3 are the single SkillsGap `Navbar` bug** (L405/L420/L516). So **11 distinct source type-corrections + 1 latent Navbar bug** = the historical "19" (the PROJECT.md "19" was the Phase-49 count; the true distinct count at HEAD is 14, with 3 collapsing to one bug). None of the 14 had vanished from deletions in 04-02..05 (all 8 files survived), but the smaller post-removal graph kept the surface tidy.
- **108 test-globals errors** (`Cannot find name 'describe/it/expect'`) — collapsed to **one** tsconfig `types` addition.
- **7 real test-type errors** — fixed as test-infra type-corrections.

Final HEAD: `type-check` = **0 errors**.

## Source type-fixes (Task 1) with classification — all behavior-preserving, zero new suppressions

| File:line | Code | Fix | Class |
| --------- | ---- | --- | ----- |
| `PriorAnalysisSelector.tsx:101` | TS2345 `overallScore: {}` | `(... as number \| undefined)` on the `unknown` grading_data field | type-correction |
| `PriorLinkedInSelector.tsx:127` | TS2322 `{}\|null` | same narrowing on `rawScore` | type-correction |
| `lib/document-extraction.ts:392` | TS2322 Uint8Array not BlobPart | `new Blob([data as BlobPart])` (runtime no-op) | type-correction |
| `lib/pdf-extractor.worker.ts:1` | TS2578 unused `@ts-expect-error` | removed the stale directive (`?url` resolves via `vite/client`) | stale-suppression removal |
| `CareerCompass.tsx:347` | TS2352 Record->AnalysisResult | `as unknown as AnalysisResult` | type-correction |
| `CareerCompass.tsx:631`, `:717` | TS2345 `string[]` not literal-union | annotate fallback `const missing: MissingPriorSource[]` | type-correction |
| `CareerCompass.tsx:1127` | TS2322 handler not MouseEventHandler | `onClick={() => handleAnalyze()}` | type-correction (handler wrap) |
| `Onboarding.tsx:347-348` | TS2589/TS2345 Postgrest deep-generic | `const writes: PromiseLike<{error:unknown}>[]` | type-correction |
| `Upload.tsx:330` | TS2322 handler not MouseEventHandler | `onClick={() => triggerPaywall()}` | type-correction (handler wrap) |

## Test-type fixes (Task 2) — test-infra only, no product behavior change
- `feature-flags.test.ts:81` — `vi.stubEnv('PROD', true)` (boolean, not `'true'` string).
- `usePaywallGuard.test.tsx` + `useTierAccess.test.tsx` — `rpcSpy: vi.fn((...args: unknown[]) => ...)` (variadic so `rpcSpy(...args)` and `.mock.calls[][0]` type).
- `supabaseMock.ts:59` — `EMPTY_RESULT: { data: unknown[]; error: null }` (dropped `as const` so `readonly []` no longer fails the mutable `PromiseLike` shape).
- `document-extraction-secondary.test.ts:101` — `new Set<string>([])` (was `Set<never>`).

## test-globals config fix (Task 2)
`tsconfig.app.json` `compilerOptions.types = ["vitest/globals", "node", "vite/client"]`. `vitest/globals` injects describe/it/expect (vitest `globals: true`), closing ~108 errors in one change; `node` + `vite/client` re-added because the explicit array otherwise drops the auto-included `@types/node` (`node:fs`/`process`/`__dirname`/`NodeJS`) and `vite/client` (`?url`). Tests already PASS under vitest — behavior-preserving.

## Lint scope (Task 2 — ratified CONFIG-SCOPE, Option 1)
- **`ignores`:** `dist`, `.claude/**` (GSD tooling), `supabase/functions/**` (Deno code, own deno.json — never the frontend lint surface), `src/integrations/supabase/types.ts` (generated).
- **Tracked warn baselines (pre-existing failures, not new inline suppressions):** `no-explicit-any` = **99** (frontend; the 248-at-HEAD total = 99 frontend + ~140 Deno [now out-of-scope]); `no-empty-object-type` 2 (shadcn ui parity); `ban-ts-comment` 2; `no-control-regex` 1; `no-require-imports` 1 (tailwind.config CJS). The ~248-any purge was NOT undertaken (behavior-risk on Stripe/Anthropic payloads; violates zero-functional-change).
- **Removed** 6 genuinely-stale `eslint-disable` directives via `--fix` (removals only).
- `npm run lint` exit **0** (0 errors, 122 warnings).

## Decisions Made
See `key-decisions` frontmatter. The two operator gates were pre-resolved by the orchestrator: (1) lint = config-scope + tracked any-baseline; (2) Navbar D-11 = fix-with-acknowledgement via REMOVING the 3 stray lines (not adding an import).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a shipped runtime crash in SkillsGapAnalysis.tsx (the D-11 latent bug)**
- **Found during:** Task 3 (the planned D-11 checkpoint)
- **Issue:** `SkillsGapAnalysis.tsx` rendered `<Navbar/>` in 3 live branches (L405/L420/L516) but never imported `Navbar` → a `ReferenceError` on every mount of those branches; `vite build` succeeds, so it shipped to production.
- **Fix:** Deleted the 3 stray `<Navbar/>` JSX lines (operator-resolved fix-with-acknowledgement). Investigation: SkillsGapAnalysis is a dashboard page; sibling dashboard pages (CareerCompass/LinkedInGrader/Upload) render no Navbar (the nav is AppSidebar). Removing the lines makes the page match its siblings. **No import added, no suppression added.** ACKNOWLEDGED behavior change (the page now renders instead of throwing).
- **Files modified:** src/pages/SkillsGapAnalysis.tsx
- **Verification:** type-check 0; the 3 TS2304s gone; verify:baseline green. Manual operator load of `/skills-gap-analysis` owed post-merge (no e2e coverage).
- **Committed in:** `b1ca32a` (Task 3 commit)

**2. [Rule 3 - Blocking] tsconfig explicit `types` array dropped node + vite/client ambient types**
- **Found during:** Task 2 (test-globals config addition)
- **Issue:** Adding `"types": ["vitest/globals"]` replaced TypeScript's default type-acquisition, surfacing ~30 new `node:fs`/`process`/`__dirname`/`NodeJS`/`?url` errors.
- **Fix:** Set `types` to `["vitest/globals", "node", "vite/client"]` to re-include the previously auto-acquired ambient types.
- **Files modified:** tsconfig.app.json
- **Verification:** type-check back to only the 3 Navbar errors after the fix.
- **Committed in:** `57b73ec` (Task 2 commit)

**3. [Rule 1 - Bug] eslint `--fix` left trailing-whitespace artifacts on directive-removal lines**
- **Found during:** Task 2 (removing stale eslint-disable directives)
- **Issue:** `eslint src --fix` removed stale inline directives but left trailing spaces / a stray comment-indent.
- **Fix:** Cleaned the 5 affected lines (supabaseClient, LinkedInGrader, RecruitingLens, Results, CareerCompass) to tidy form.
- **Files modified:** the 5 src files above
- **Verification:** lint still exit 0; git diff shows clean directive removals.
- **Committed in:** `57b73ec` / `b1ca32a`

---

**Total deviations:** 3 auto-fixed (1 latent-bug fix [the planned D-11 checkpoint], 2 blocking config/tooling). **Impact on plan:** All within plan intent. No scope creep; zero new suppressions; behavior preserved (verify:baseline green throughout).

## Issues Encountered
- The `lint` exit-status was masked by a pipe (`| tail`) reporting `tail`'s exit, not eslint's — caught by re-running `npm run lint > file; echo $?` directly. A single residual `no-require-imports` error in `tailwind.config.ts` (CJS build config) was then tracked as a warn baseline to reach true exit-0.

## User Setup Required
None - no external service configuration. **One manual confirmation owed:** the operator should load `/skills-gap-analysis` as a Pro/Elite user post-merge to confirm the page renders (the removed `<Navbar/>` change has no e2e coverage).

## Next Phase Readiness
- CLEAN-06 satisfied → **Phase 4 is complete** (all of CLEAN-02..06 closed across plans 04-01..04-06).
- `type-check` + `lint` are now exit-0 gates that future phases can rely on. A dedicated `no-explicit-any` tightening pass (99 frontend + ~140 Deno) is documented as deferred in RESIDUAL-REGISTER.md if ever scoped.

---

## Self-Check: PASSED

- FOUND: `.planning/phases/04-dead-code-refactor-cleanup/04-06-SUMMARY.md`
- FOUND commits: `cc55ee9` (Task 1), `57b73ec` (Task 2), `b1ca32a` (Task 3)
- FOUND modified: tsconfig.app.json, eslint.config.js, src/pages/SkillsGapAnalysis.tsx, .planning/audit/RESIDUAL-REGISTER.md
- Gates at HEAD: `type-check` exit 0, `lint` exit 0, `verify:baseline` exit 0 (vitest 457/457, deno 284/0, Playwright 5+1skip)
- Phase diff: ZERO new `@ts-ignore`/`as any`/`eslint-disable`; 7 stale suppressions removed

---
*Phase: 04-dead-code-refactor-cleanup*
*Completed: 2026-06-14*
