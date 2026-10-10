# Phase 4: Dead Code & Refactor Cleanup - Research

**Researched:** 2026-06-13
**Domain:** Zero-functional-change code deletion / refactor cleanup (React `src/` + Deno `supabase/functions/`)
**Confidence:** HIGH (every claim verified against current HEAD `4c9abd1` by re-running the audit, type-check, lint, build, and vitest; no reliance on the catalog alone)

<user_constraints>
## User Constraints (from 04-CONTEXT.md)

### Locked Decisions (D-01..D-13 — binding)
- **D-01 — Investigate-and-clear ALL.** Resolve every one of the 23 `needs-investigation` rows: clear the row's specific blocking signal, remove what clears, explicitly document what cannot clear (with residual signal). Maximal-cleanup posture; the larger diff is the point. Every removal gated by `verify:baseline` green-before/after + the KEEP-LIST. Nothing removed on static-dead alone; the multi-signal bar (static-dead + no-dynamic-ref + no-external-caller + not-gated) must concur per item.
- **D-02 — 5 `safe` rows are the confirmed baseline removals** (no further investigation): React `src/components/HowItWorks.tsx`, `MinimalHero.tsx`, `NavLink.tsx`; Deno `_shared/errors.ts`, `_shared/handler.ts`. (HowItWorks disambiguation — the routed page `src/pages/HowItWorks.tsx` STAYS.)
- **D-03 — Remove the entire sectional-lock surface.** The `/dev/locked-sections` route + `LockedSectionsSandbox`, `LockedSection`/`LockedListItem`, the `@deprecated` `ProFeatureBlur.tsx`, all co-located tests. Confirm zero remaining importers (incl. non-DEV pages) before deleting.
- **D-04 — Remove the superseded Interview Prep UI cluster** (~10 components + co-located tests): `InterviewQuiz`, `InterviewFlashcards`, `InterviewQuizResults`, `InterviewStreakDisplay`, `InterviewPrepInput`, and leaves `QuizProgressIndicator`, `QuizQuestionCard`, `QuizResultsCard`, `ReadinessScoreRing` (one unit). OLD path, superseded by live `InterviewPrep.tsx → QuizRunner`.
- **D-05 — Hard preconditions before ANY IP removal** (all must hold else demote to deferred): (a) live `InterviewPrep → QuizRunner` imports/renders NONE of the cluster; (b) NO `VITE_FEATURE_INTERVIEW_PREP` variant re-activates the old `InterviewQuiz` path; (c) co-located tests removed in the same change. **Never touch** keepers: `interview-prep-analyze`/`-evaluate` edge fns, `InterviewPrepPayloadSchema`/`InterviewPrepResponseSchema` (`src/types/interviewPrep.ts`).
- **D-06 — `interview-prep-coach` = no-op close.** Already retired (absent from repo, config.toml, and the 41-fn live deploy list per 03-05 Source C). Nothing to delete; CLEAN-03 records it closed. Do NOT confuse with live `-analyze`/`-evaluate`.
- **D-07 — Ollama leg = operator-confirm-then-remove, with document-and-defer fallback.** `ollama-client.ts` is reachable (first entry of `cheapProviders` fallback in `_shared/document-extraction.ts`, taken only when `pdf_parser` quality-fails AND `OLLAMA_BASE_URL` set). Operator step: check prod `OLLAMA_BASE_URL` presence + extraction logs. If confirmed dead/unset → remove the leg. If not confirmable → document obsolete-but-gated with exact removal criteria, defer. Never remove on unproven-dead evidence.
- **D-08 — Consolidate named duplicates** into single canonical implementations, updating all call sites + tests: (1) tier-resolver name-collision (`_shared/resolve-tier.ts` dead DB resolver + its test vs LIVE `_shared/price-resolver.ts` `resolveTier()`); (2) `AnalysisComparisonModal.tsx` duplicate default/named export. Each gated by baseline.
- **D-09 — Unused-export pruning is conservative-by-signal.** Prune on LIVE files ONLY where the multi-signal gate clears (no ambient/`import type` consumer, no string/dynamic consumer, no cross-layer edge consumer via `deno info`). KEEP: public-API/parity exports, shadcn `ui/**` parity, gated IP zod schemas, deliberate test-only seams. Cannot clear all signals → documented, not removed.
- **D-10 — Clutter removal is Claude's discretion, behavior-preserving only.** Remove commented-out code, dead TODOs, structural clutter. PRESERVE load-bearing "why"/trade-off comments, section headers, real-obligation TODOs. No reformat-the-world churn.
- **D-11 — Fix all 19 pre-existing type errors → `type-check` fully clean.** Behavior-preserving type corrections are the default. **No new suppressions** (`@ts-ignore`/`as any`/`eslint-disable` forbidden — hard success-criterion). **Zero-functional-change override:** if a proper fix requires a runtime/logic change (type error exposes a latent bug), SURFACE AS A DEVIATION/CHECKPOINT — not a silent behavior change, not a suppression. Either fixed with explicit acknowledgement or explicitly tracked as a known error with reason.
- **D-12 — `npm run lint` passes clean with no new suppressions**, same rules as D-11.
- **D-13 — `verify:baseline` is the per-removal gate.** Re-run green before and after cleanup; the proof of CLEAN-02..05 is "the same baseline that passed at Phase 1/2/3 still passes." Prefer small, reversible, domain-grouped commits so any single removal reverts in isolation.

### Claude's Discretion
- Exact plan/commit slicing (one plan per domain: React dead files / Deno `_shared` / IP cluster / lock surface / consolidation / type-errors), the precise order of removals, the format of the "documented-but-not-removed" residual register, and the CLEAN-05 clutter scope.

### Deferred Ideas (OUT OF SCOPE)
- `usage_tracking` retirement + Paddle column/function removal → Phase 8 (DB-04, externally gated).
- Dependency pruning/bumps → Phase 6 (DEP-02..05).
- Env-var consolidation → Phase 7 (ENV-02..05).
- Performance refactors + before/after measurement → Phase 9 (PERF-02..04).
- Dead CSS / static-asset / image audit → not separately scoped (planner may fold cheap wins into CLEAN-05).
- Mechanical/CI enforcement of the audit → not in scope.
- Re-fixing latent bugs revealed by the 19 type errors → Phase 4 surfaces/tracks (D-11); the actual bugfix is a `/gsd-debug`/future-pass concern, not a silent behavior change here.
</user_constraints>

## Summary

This is a code-DELETION phase acting on a frozen audit catalog. The single most important reconciliation finding is **good news for the planner: there is ZERO source drift.** `git diff 2c407ca..HEAD -- src supabase/functions` is **empty** — every commit since the audit (`2c407ca`) up to HEAD (`4c9abd1`) is docs-only (`.planning/` artifacts + the deletion of two `.env.example` files, which touched no source). Re-running `npm run audit:deadcode` at HEAD reproduces the catalog **exactly**: the same 23 React dead-file candidates, the same unused-exports/types, the same 5 Deno `_shared` candidates, 38 entrypoints, 36/41 reachable. All named line anchors (`App.tsx` `LockedSectionsSandbox` import L43 / route L88) are accurate. **The work-list is trustworthy as-is.**

The empirical surprises are NOT in the dead-code list — they are in CLEAN-06. (1) `npm run type-check` at HEAD emits exactly **ONE** error: `TS5103 Invalid value for '--ignoreDeprecations'` (`tsconfig.app.json:5` = `"6.0"`, invalid for the installed TypeScript **5.9.3** — note: not 5.8.3 as package.json declares). This config error **halts compilation before any source file is checked**, which is why the "19 errors" are invisible to a naive `type-check` run. Correcting the value to `"5.0"` surfaces **~14 real source-level type errors** across 8 production files plus **~109 test-file errors** (mostly a `vitest/globals` types gap, not real bugs). (2) `npm run lint` is NOT clean — it reports **294 problems (268 errors, 26 warnings)**, dominated by **248 `@typescript-eslint/no-explicit-any`** errors split across `src/` (108) and `supabase/functions/` (140), plus the ESLint flat config scanning `.claude/` tooling and emitting "Unused eslint-disable directive" parse errors. Getting lint to literal exit-0 is a far larger undertaking than the decisions anticipated and needs a scope decision from the planner.

The dangerous landmine is `src/pages/SkillsGapAnalysis.tsx`: it renders `<Navbar />` in three live branches (including the primary render return, line 516, and the every-mount `checkingAccess` branch, line 405) but **never imports `Navbar`** — `tsc` flags this as TS2304 "Cannot find name 'Navbar'", `vite build` SUCCEEDS anyway (it's a runtime `ReferenceError`, not a build error), so the bug is shipped to production. This is the textbook D-11 "type error exposes a latent runtime bug": the fix (add the import) is a behavior change that MUST be surfaced as a checkpoint, not silently applied.

**Primary recommendation:** Slice into 6 domain-grouped plans (5 safe baseline → lock surface → IP cluster → Deno `_shared` + resolve-tier + Ollama operator-gate → unused-export/consolidation/clutter → type-errors+lint), each gated by `verify:baseline` green-before/after. The vitest layer is confirmed green at HEAD (468/468). Treat CLEAN-06's lint clause as needing an explicit scope decision (it is not currently clean and never was), and treat the `SkillsGapAnalysis` Navbar fix as a mandatory D-11 deviation checkpoint.

---

## Catalog-vs-HEAD Reconciliation

**Verdict: the catalog matches HEAD with ZERO drift. Act on it directly.**

| Check | Audit (`2c407ca`) | HEAD (`4c9abd1`) | Drift? |
|-------|-------------------|------------------|--------|
| `git diff -- src supabase/functions` (audit..HEAD) | — | **empty** | NONE |
| Intervening commits | — | 20 commits, **all docs-only** (`.planning/` + 2 `.env.example` deletions) | NONE to source |
| `audit:deadcode` React dead files | 23 candidates | 23 candidates (identical set) | NONE |
| `audit:deadcode` Deno `_shared` dead | 5 (`errors`, `handler`, `resolve-tier`, 2× `stripe-*` test-helpers) | 5 (identical) | NONE |
| Deno entrypoints / reachable / total | 38 / 36 / 41 | 38 / 36 / 41 | NONE |
| `App.tsx` `LockedSectionsSandbox` import line | ~43 | **43** (exact) | NONE |
| `App.tsx` `/dev/locked-sections` route line | ~88 | **88** (exact) | NONE |
| `App.tsx` `pages/HowItWorks` import / `/how-it-works` route | L37 / L85 | L37 / L85 | NONE |
| v4.0-baseline anchor `fa4ccb6` ancestor of HEAD | yes | confirmed `--is-ancestor` → YES | NONE |
| vitest layer | 468/468 | **468/468 green** (re-run this research) | NONE |

**Why this matters:** the planner can treat the named files, line anchors, and clearance signals in DEAD-CODE.md as current truth. No re-derivation of the dead set is needed. (Confidence: HIGH — directly verified by `git diff`, `npm run audit:deadcode`, and `npx vitest run`.)

**One catalog over-statement, corrected at HEAD:** DEAD-CODE.md §D-08.a says `ollama-client.ts` is imported by "`document-extraction.ts:14-18` + `ocr-pdf/index.ts`". At HEAD, `ocr-pdf/index.ts` only contains the string literal `'ollama_config_missing'` (an error code), NOT an import of `ollama-client`. The **only** importer of `ollama-client.ts` / `invokeOllamaVision` is `_shared/document-extraction.ts`. This narrows the Ollama removal surface (see D-07 section) but changes no verdict.

---

## Plan Slicing (domain-grouped removal clusters → waves)

Six plans, sequenced so each leaves `verify:baseline` green and is individually revertible (D-13). Waves reflect dependency, not just grouping.

> **Sequencing note (user memory):** the type-error/lint plan and any plan that needs a clean install should run **sequential-on-main**, not in an isolated worktree — worktrees start with empty `node_modules`. None of these plans install deps, but `verify:baseline` needs `node_modules`; keep them on the main checkout.

### Wave A — confirmed-safe baseline (lowest risk, no investigation)
**Plan 04-01 — 5 SAFE rows (D-02).** React: delete `src/components/HowItWorks.tsx`, `MinimalHero.tsx`, `NavLink.tsx`. Deno: delete `_shared/handler.ts` then `_shared/errors.ts` (see note — they are a dead pair; `handler.ts` is the only external referencer of `errors.ts`). No co-located tests for any of the 5. The only edit beyond deletions: none (none of the 5 has an importer; `HowItWorks` "importer" in App.tsx is the DISTINCT page). Gate: `verify:baseline` + `audit:deadcode` dead-list shrinks by these 5.

### Wave B — gated-cluster removals (clear preconditions, then delete as units)
**Plan 04-02 — Lock-primitive surface (D-03).** One unit (see "Removal-Cluster Boundaries"). Order: (1) remove the App.tsx import L43 + route L88; (2) delete `src/pages/dev/LockedSectionsSandbox.tsx`; (3) delete `LockedSection.tsx` + `LockedSection.test.tsx`, `LockedListItem.tsx` + `LockedListItem.test.tsx`, `ProFeatureBlur.tsx`. Career-compass test files are comment-only references — DO NOT touch. Gate: `verify:baseline` (deletes 2 vitest test files — confirm suite still green at the reduced count).

**Plan 04-03 — Interview Prep superseded cluster (D-04/D-05).** All 3 hard preconditions are **confirmed clear** (see boundaries section): delete the 9 cluster files as one unit. **No co-located test files exist** for any cluster member, so D-05(c) is a no-op (nothing to remove with them). Surgical-separation discipline: the live `interviewPrep/` subdir contains same-named-but-distinct components — never grep-and-delete by bare name. Gate: `verify:baseline`.

### Wave C — Deno consolidation + operator-gated retirement
**Plan 04-04 — Deno `_shared` consolidation + obsolete-path retirement (CLEAN-03/CLEAN-04 Deno half).**
- `resolve-tier` collision (D-08.1): delete `_shared/resolve-tier.ts` + `_shared/resolve-tier.test.ts` as a pair (zero production importers; live resolver is `price-resolver.ts`, a separate file — no rename needed).
- `interview-prep-coach` (D-06/CLEAN-03): no-op close, record in the residual register. (Confirmed absent from repo + config.toml; 03-05 Source C confirmed absent from live deploy list.)
- Ollama leg (D-07/CLEAN-03): **operator-gated** — see the Ollama section. If operator confirms dead → remove the `ollama` chain entry + `ollama-client.ts` + `ollama-client.test.ts` + the `OllamaVisionParams`/`invokeOllamaVision` imports in `document-extraction.ts`. If not confirmable → document-and-defer.
- Gate: `npm run test:edge` (deno) + re-run `audit:deadcode` Deno leg to confirm reachable-set unchanged for everything else.

### Wave D — frontend consolidation + clutter
**Plan 04-05 — Unused-export pruning + dup-export consolidation + clutter (CLEAN-04 frontend / CLEAN-05).**
- `AnalysisComparisonModal.tsx` (D-08.2): collapse the duplicate `default` + named export of the same symbol (L244 named + L637 `export default`) to a single canonical export, update importers.
- Unused-export pruning (D-09): conservative-by-signal. **KEEP** the items that fail the gate (see "Unused-Export Triage"), prune only the clear ones.
- Clutter (D-10): focused removals only.
- Gate: `verify:baseline`.

### Wave E — lint + type-check clean (CLEAN-06)
**Plan 04-06 — Type-check + lint (D-11/D-12).** Fix the `ignoreDeprecations` config blocker FIRST (it gates everything), then the ~14 real source errors, then the test-globals gap. Surface the `SkillsGapAnalysis` Navbar fix as a D-11 checkpoint. Make the explicit lint-scope decision (see "Lint State" — this is the riskiest CLEAN-06 item). Gate: `type-check` exit 0 + `lint` exit 0 (per the agreed scope) + `verify:baseline` + zero new suppressions.

> **Ordering rationale:** Waves A→B→C→D shrink the dead-code surface first (smaller graph for the type/lint pass to reason over). E runs last because removing dead files first eliminates some of the type/lint noise (e.g. the IP cluster and lock files may carry their own `any`/type issues that simply disappear). The planner may merge D and E if the diffs stay small.

---

## The 23 needs-investigation rows — per-row clearance recipe

Verdict legend: **CLEAR** = repo-side signal cleared, remove (some carry an external residual = operator/dashboard check); **KEEP** = a live signal fires, do not remove; **DEFER** = cannot clear autonomously, document.

### React dead-FILE candidates (18 rows)

| # | File | Clearance command run (HEAD) | Result | Verdict |
|---|------|------------------------------|--------|---------|
| 4 | `InterviewQuiz.tsx` | `rg "InterviewQuiz" src` excl self/cluster | Only hit outside cluster = `userInterviewQuizzes` queryKey string in `AnalysisHistory.tsx` + a test assertion (substring FALSE POSITIVE) | **CLEAR** (IP unit) |
| 5 | `InterviewFlashcards.tsx` | importer sweep | zero importers; live keeper uses distinct `interviewPrep/FlashcardDeck` | **CLEAR** (IP unit) |
| 6 | `InterviewQuizResults.tsx` | importer sweep | zero importers; imports leaves rows 22-23 only | **CLEAR** (IP unit) |
| 7 | `InterviewStreakDisplay.tsx` | importer sweep | zero importers; live keeper uses distinct `interviewPrep/StreakDisplay` | **CLEAR** (IP unit) |
| 8 | `ProFeatureBlur.tsx` | `rg ProFeatureBlur src` excl self | **ZERO importers.** The `LockedSection` mention is a `@deprecated` JSDoc comment only (no import) | **CLEAR** (lock unit) |
| 9 | `InterviewPrepInput.tsx` | importer sweep | zero importers; live intake is `interviewPrep/IntakeForm` | **CLEAR** (IP unit) |
| 10 | `Features.tsx` | importer sweep | zero importers; `Features` hits = config comment / Footer label / aria-label | **CLEAR** |
| 11 | `Hero.tsx` | importer sweep | zero importers; `Hero` hits = JSX section comments | **CLEAR** |
| 13 | `NextBestAction.tsx` | importer sweep | zero importers (the live `LinkedInNextBestAction` is a distinct TYPE in LinkedInGrader.tsx) | **CLEAR** |
| 14 | `PDFHighlighter.tsx` | importer sweep + dynamic-import scan | zero importers; no `import()`/lazy mounts it (production has NO dynamic imports) | **CLEAR** |
| 15 | `PlanComparisonTable.tsx` | importer sweep | zero importers; no Pricing variant mounts it | **CLEAR** |
| 16 | `use-mobile.tsx` | importer sweep (note: `ui/**` is knip-ignored) | zero importers in scanned tree; **residual:** a hidden `ui/**` consumer is possible (knip-ignored) — confirm with `rg "use-mobile\|useIsMobile" src/components/ui` before delete | **CLEAR** (cheap residual check) |
| 17 | `useAuthSync.ts` | importer sweep (auth-adjacent → conservative) | zero importers; no provider/bootstrap wires it | **CLEAR** |
| 18 | `AuthCallback.tsx` | `rg "auth/callback\|AuthCallback\|emailRedirectTo\|redirectTo" src` | **No `/auth/callback` string anywhere.** All Supabase redirects go to `${origin}/` or `${origin}/auth` (Auth.tsx L200/246/302/403). Not routed in App.tsx. **Residual:** Supabase dashboard auth redirect allow-list (external) | **CLEAR repo-side; needs operator/dashboard confirm of the OAuth callback URL allow-list before delete** |
| 19 | `ResumeBuilder.tsx` | `rg "resume-builder\|ResumeBuilder" src` excl self | **No `navigate("/resume-builder")`, no `<Link>`, no route, zero importers, no flag.** No external gate (it is a page, not an auth callback) | **CLEAR** |
| 20 | `QuizProgressIndicator.tsx` | importer sweep | imported ONLY by `InterviewQuiz.tsx` (itself dead) | **CLEAR** (IP unit) |
| 21 | `QuizQuestionCard.tsx` | importer sweep | imported ONLY by `InterviewQuiz.tsx` | **CLEAR** (IP unit) |
| 22 | `QuizResultsCard.tsx` | importer sweep | imported ONLY by `InterviewQuizResults.tsx` | **CLEAR** (IP unit) |
| 23 | `ReadinessScoreRing.tsx` | importer sweep | imported ONLY by `InterviewQuizResults.tsx`; live keeper uses distinct `interviewPrep/ReadinessHero`/`ReadinessBreakdown` | **CLEAR** (IP unit) |
| 24 | `src/types/database.ts` | `rg "types/database\|@/types/database" src` excl self; check typegen target | **ZERO importers.** The LIVE `Database` type is in `src/integrations/supabase/types.ts` (the real typegen output, used by the client). No `supabase gen types` script targets `types/database.ts`. It is a stale orphan duplicate. **Residual:** planner should `Read` the file to confirm it is not a hand-maintained ambient declaration before delete | **CLEAR (read-to-confirm)** |

> Note: row numbering follows the catalog table (rows 1-3 + 12 are the `safe`/disambiguation entries, not investigation rows). The 18 investigation files above + the 5 Deno candidates + the 2 D-08 targets = the "23" needs-investigation total (knip flagged 23 files; the catalog's "23 needs-investigation" tier = 18 React files + 3 Deno + 2 D-08).

**Removal clusters (shared clearance path):**
- **IP unit** (rows 4,5,6,7,9,20,21,22,23) → all clear together once D-05 preconditions hold (confirmed). One commit.
- **Lock unit** (row 8 `ProFeatureBlur` + the non-knip `LockedSection`/`LockedListItem`/`LockedSectionsSandbox`) → one commit after route removal.
- **Standalone landing/orphan** (rows 10,11,13,14,15,17,19,24) → can batch in one "frontend dead files" commit; all repo-side clear with no external gate.
- **Cheap-residual** (row 16 `use-mobile` ui/** check) → trivially clears.
- **External-gate residual** (row 18 `AuthCallback`) → the ONLY React row that needs an operator/dashboard confirmation. If the operator cannot confirm the Supabase auth redirect allow-list excludes `/auth/callback`, this row stays **DOCUMENTED-BUT-DEFERRED**.

**Likely-CLEAR vs likely-DEFER summary:** 17 of 18 React investigation rows clear repo-side. Only `AuthCallback.tsx` (row 18) carries a genuine external residual (auth redirect allow-list). `database.ts` (row 24) and `use-mobile` (row 16) carry cheap repo-side residuals (read-to-confirm / ui-dir grep) that clear in seconds.

### Deno `_shared` candidates (5 rows)

| Module | Clearance | Verdict |
|--------|-----------|---------|
| `errors.ts` | Only external referencer is `handler.ts` (itself dead). The `_shared/errors` string in errors.ts is its own logger name, not a self-import. No co-located test. | **CLEAR** — but remove **as a pair with `handler.ts`** (remove handler first/together; it is what orphans errors) |
| `handler.ts` | **Zero references anywhere** (`rg "_shared/handler"` → 0). No co-located test. | **CLEAR** (safe) |
| `resolve-tier.ts` | Zero production importers (`rg` → only `resolve-tier.test.ts`). Live resolver is the SEPARATE `price-resolver.ts` (used by `create-checkout-session` + `stripe-webhook-handler`). | **CLEAR** — remove `resolve-tier.ts` + `resolve-tier.test.ts` as a pair (D-08.1) |
| `test-helpers/stripe-fixtures.ts` | Imported by `_tests/test-04/05/06` + `stripe-webhook-handler/index.test.ts` — all part of the deno suite. | **KEEP** (live test infra; not dead) |
| `test-helpers/stripe-signature.ts` | `signStripePayload` imported by the same four Stripe deno tests. | **KEEP** (live test infra) |

### D-08 named targets (2 rows)

| Target | Repo-side verdict (autonomous) | Operator step | Verdict |
|--------|-------------------------------|---------------|---------|
| Ollama extraction leg | `ollama-client.ts` reachable ONLY via `cheapProviders[0]` in `document-extraction.ts` (importer set = that one file). Reachable because `ocr-pdf` (deployed, config.toml L58) imports `document-extraction.ts`. | Check prod `OLLAMA_BASE_URL` presence + extraction logs for an `ollama` branch hit | **operator-gated** (D-07) |
| `interview-prep-coach` | Absent: no dir, no config.toml block, `rg` → 0 hits. 03-05 Source C: absent from 41-fn live deploy list. | None needed (already confirmed via Source C) | **CLEAR (no-op close)** |

---

## Removal-Cluster Boundaries (verified at HEAD)

### Lock-primitive unit (D-03) — verified one closed unit
- **Live ONLY via the sandbox route.** `App.tsx:43` imports `LockedSectionsSandbox`; `App.tsx:88` routes `/dev/locked-sections`. `LockedSectionsSandbox.tsx` imports `LockedSection` (L4) + `LockedListItem` (L5).
- **`LockedSection`/`LockedListItem` real importers** (outside sandbox/self): NONE in production. The career-compass `ReadinessTab.test.tsx` / `RolesTab.test.tsx` hits are **code comments** ("the implementation uses `BlurredLockCard` instead of the deprecated `LockedSection`") — no import; they will NOT break.
- **`LockedListItem` does NOT import `LockedSection`** (independent primitives).
- **`ProFeatureBlur.tsx`** has ZERO importers; its `LockedSection` reference is a `@deprecated` JSDoc comment only — fully independent.
- **Co-located tests:** `LockedSection.test.tsx`, `LockedListItem.test.tsx` exist (delete with their components). `LockedSectionsSandbox` has no test.
- **Removal set (one unit):** `App.tsx` (remove L43 import + L88 route) · `pages/dev/LockedSectionsSandbox.tsx` · `components/LockedSection.tsx` + `.test.tsx` · `components/LockedListItem.tsx` + `.test.tsx` · `components/ProFeatureBlur.tsx`. **Do NOT touch** career-compass test files.

### Interview Prep superseded cluster (D-04/D-05) — all 3 preconditions CONFIRMED clear
- **(a) Live path imports NONE of the cluster — CONFIRMED.** `InterviewPrep.tsx` imports exclusively from `@/components/interviewPrep/*` (a DIFFERENT directory): `IntakeForm`, `StreakDisplay`, `ReadinessHero`, `ReadinessBreakdown`, `FocusAreas`, `QuickTips`, `FlashcardDeck`, `QuizRunner`, `QuizResults`, `PrepRoadmap`, `StrengthsWatchOuts`, `CoachingAdvice`. `QuizRunner.tsx` references ZERO dead-cluster members. The dead cluster (`src/components/Interview*`, `Quiz*Card`, `ReadinessScoreRing`, `QuizProgressIndicator`) is a closed graph: 5 top-level have zero importers; 4 leaves are imported only by other dead members.
- **(b) No flag variant re-activates the old path — CONFIRMED.** `feature-flags.ts` has exactly ONE flag read (`isInterviewPrepEnabled()` → `VITE_FEATURE_INTERVIEW_PREP === 'true'`), consumed only by `InterviewPrep.tsx:200`. No code path conditionally mounts the dead `InterviewQuiz`. The only `InterviewQuiz` hits outside the cluster are the `userInterviewQuizzes` queryKey substring in `AnalysisHistory.tsx` + a test assertion — NOT the component.
- **(c) Co-located tests — none exist.** No `.test.tsx` for any cluster member. D-05(c) is a no-op.
- **NAMING LANDMINE:** the live `interviewPrep/` subdir has same-named-but-distinct components (`StreakDisplay`, `ReadinessHero`, `FlashcardDeck`, `QuizResults`). Delete the dead cluster by **full path**, never by bare component name.
- **Keepers (never touch):** `interview-prep-analyze`/`-evaluate` edge fns (config.toml L82/L85), `src/types/interviewPrep.ts` zod schemas, the entire `src/components/interviewPrep/` subdir, `InterviewPrep.tsx`, `QuizRunner.tsx`.

### `resolveTier` name-collision (D-08.1) — verified safe to remove the dead one
- **LIVE:** `_shared/price-resolver.ts` `resolveTier()` → imported by `create-checkout-session/index.ts` + `stripe-webhook-handler/index.ts`. (Also a sibling `shop-pack-resolver.ts` lives there — leave it.)
- **DEAD:** `_shared/resolve-tier.ts` (DB-based, reads `profiles.subscription_tier`) → ZERO production importers; only `resolve-tier.test.ts` references it.
- Different files, no symbol clash at module level (they are imported by path). Remove the dead `resolve-tier.ts` + its test as a pair; no rename needed. **Residual (D-08):** confirm no near-future webhook path wires the DB resolver — none exists at HEAD.

---

## Ollama Leg Operator-Gate (D-07)

**Autonomous repo-side verdict (reachable, but conditionally-invoked):**
- `_shared/document-extraction.ts` attempts `pdf_parser` FIRST (L55-75); only on quality-reject/no-text (L77-84) does it fall through to the `cheapProviders` chain (L87-113): `ollama (L92-97) → mistral (L99) → textract (L106)`, then tier-gated `claude_ocr` last.
- `ollama-client.ts` is imported by **exactly one file** — `document-extraction.ts` (L18). (Catalog's "+ ocr-pdf/index.ts" is wrong: ocr-pdf only has the string `'ollama_config_missing'`.) `document-extraction.ts` IS reachable (imported by `ocr-pdf/index.ts`, a deployed entrypoint, config.toml L58), so the leg is statically live in the graph.
- The `ollama` branch is only TAKEN at runtime when `pdf_parser` quality-fails AND `OLLAMA_BASE_URL` is set in prod. `ollama-client.ts` env reads: `OLLAMA_BASE_URL` (L92), `OLLAMA_AUTH_HEADER_NAME` (L95), `OLLAMA_AUTH_SECRET` (L96), `OLLAMA_MODEL` (L100), `OLLAMA_TIMEOUT_MS` (L101).

**The decision the operator makes (mirrors Phase 3 D-10):**
```
# Operator checks prod (NOT autonomous):
#  1. Is OLLAMA_BASE_URL present in prod edge secrets? (supabase dashboard / secrets list)
#  2. Do extraction logs ever show provider:'ollama' attempted/accepted? (function logs)
```
- **If OLLAMA_BASE_URL is unset in prod AND logs show the ollama branch was NEVER taken → confirmed dead.** Remove set: the `{ provider:'ollama', invoke: ... }` object from the `cheapProviders` array (L92-97, leaving the valid `mistral → textract` chain); the `OllamaVisionParams`/`invokeOllamaVision`/`OllamaVisionResult` imports in `document-extraction.ts` (L14-18) + the `ollamaVision?` param (L43); `_shared/ollama-client.ts`; `_shared/ollama-client.test.ts`. Re-run `npm run test:edge` + `audit:deadcode`.
- **If not confirmable (OLLAMA_BASE_URL present, or logs unavailable) → document-and-defer.** Add to the residual register: "Ollama leg obsolete-but-gated; remove when prod confirms `OLLAMA_BASE_URL` unset + zero `provider:'ollama'` log hits over [window]." Never remove on unproven-dead evidence (zero-functional-change risk to the extraction fallback chain that feeds Resume Analysis).

---

## The 19 Type Errors (CLEAN-06) — enumerated at HEAD

**CRITICAL config blocker (must fix first):** `npm run type-check` at HEAD emits exactly ONE error and stops:
```
tsconfig.app.json(5,27): error TS5103: Invalid value for '--ignoreDeprecations'.
```
`tsconfig.app.json:5` = `"ignoreDeprecations": "6.0"`. Installed TypeScript is **5.9.3** (package.json declares 5.8.3 — drift; the resolved tsc is 5.9.3). For TS 5.9, the valid value to silence the 5.x deprecations is `"5.0"`; `"6.0"` is rejected, which **aborts compilation before any source file is checked** — this is exactly why the "19 errors" appear invisible. Fixing this single value (`"6.0"` → `"5.0"`) is a behavior-preserving config correction (it is NOT a new suppression — it restores the intended pre-6.0 deprecation grace) and is the gate for the rest of CLEAN-06. (PROJECT.md's note said `"5.0"`; the current file has `"6.0"` — the planner should set it to the value the installed tsc accepts, verified by re-running.)

**With `ignoreDeprecations: "5.0"`, `tsc -p tsconfig.app.json --noEmit` surfaces 129 error lines.** They split into three buckets:

### Bucket 1 — Real production source errors (14) — the "19" the planner owns

| # | Location | Code | Classification (D-11) |
|---|----------|------|------------------------|
| 1 | `src/components/PriorAnalysisSelector.tsx:101` | TS2345 `overallScore: {}` not assignable to `number` | **type-correction** (narrow the `{}` to `number`) |
| 2 | `src/components/PriorLinkedInSelector.tsx:127` | TS2322 `{} \| null` not assignable to `number \| null` | **type-correction** |
| 3 | `src/lib/document-extraction.ts:392` | TS2322 `Uint8Array<ArrayBufferLike>` not a `BlobPart` | **type-correction** (lib-dom-iterable narrowing; functionally a no-op — `new Blob([data])` works at runtime) |
| 4 | `src/lib/pdf-extractor.worker.ts:1` | TS2578 Unused `@ts-expect-error` directive | **type-correction** — but careful: removing the directive may re-expose the `?url` import error under a different lib version. Verify the `?url` import still type-resolves before removing. |
| 5 | `src/pages/CareerCompass.tsx:347` | TS2352 `Record<string,unknown>` → `AnalysisResult` cast | **type-correction** (`as unknown as AnalysisResult` or proper type) — Career Compass is business-critical and LIVE, so this is type-noise, not a latent bug |
| 6 | `src/pages/CareerCompass.tsx:631` | TS2345 `string[]` not assignable to `("resume"\|"linkedin")[] \| null` | **type-correction** (literal-union narrowing) |
| 7 | `src/pages/CareerCompass.tsx:717` | TS2345 same as #6 | **type-correction** |
| 8 | `src/pages/CareerCompass.tsx:1127` | TS2322 `(opts?) => Promise<void>` not a `MouseEventHandler` | **type-correction** (wrap handler `onClick={() => fn()}`) |
| 9 | `src/pages/Onboarding.tsx:347` | TS2589 Type instantiation excessively deep | **type-correction** (Supabase `PostgrestFilterBuilder` generic blow-up; cast the builder or break the chain) |
| 10 | `src/pages/Onboarding.tsx:348` | TS2345 `profiles` builder not assignable to `career_targets` builder | **type-correction** (same Supabase-generics root) |
| 11 | `src/pages/SkillsGapAnalysis.tsx:405` | TS2304 **Cannot find name 'Navbar'** | **⚠ LATENT RUNTIME BUG — D-11 CHECKPOINT** |
| 12 | `src/pages/SkillsGapAnalysis.tsx:420` | TS2304 same | **⚠ LATENT RUNTIME BUG — D-11 CHECKPOINT** |
| 13 | `src/pages/SkillsGapAnalysis.tsx:516` | TS2304 same | **⚠ LATENT RUNTIME BUG — D-11 CHECKPOINT** |
| 14 | `src/pages/Upload.tsx:330` | TS2322 `(args?) => void` not a `MouseEventHandler` (`onClick={triggerPaywall}`) | **type-correction** (wrap handler) — but verify `triggerPaywall`'s arg isn't expected to receive the event |

> The "19" in PROJECT.md/REQUIREMENTS is the historical Phase-49 count; at HEAD the real source-error count is **14** (rows 11-13 are three instances of ONE bug). The decision says "resolve every one or explicitly track" — the planner should treat the **14 distinct findings** as the work-list and reconcile the headline number in the SUMMARY.

### The latent-bug checkpoint (D-11 — MANDATORY deviation, do NOT silently fix)
`src/pages/SkillsGapAnalysis.tsx` renders `<Navbar />` at L405 (`if (checkingAccess)` — hit on **every mount**), L420 (`if (subscriptionTier === 'free')`), and L516 (the **primary render return**), but **never imports `Navbar`** (the component exists at `src/components/Navbar.tsx`). The page IS routed and live (`/skills-gap-analysis`, a Pro/Elite feature, App.tsx L71). `vite build` SUCCEEDS despite this (verified — it is a runtime `ReferenceError`, not a build error), so the bug ships. Adding `import Navbar from '@/components/Navbar'` is a **behavior change** (it makes currently-throwing render paths actually render a Navbar). Per D-11 this MUST be surfaced as a deviation/checkpoint — either fixed with explicit operator acknowledgement, or tracked as a known error with reason. It must NOT be silently fixed and must NOT be suppressed.

### Bucket 2 — Test-file type errors (NOT runtime failures; vitest passes)
- **~109 errors** in `src/pages/__tests__/document-extraction-primary.test.ts` (75) + `document-extraction-secondary.test.ts` (34): TS2304/TS2582 "Cannot find name 'describe/it/expect'". Root cause: `vitest.config.ts` sets `globals: true` (runtime), but `tsconfig.app.json` lacks `"types": ["vitest/globals"]`, so `tsc` cannot see the injected globals. **These tests PASS under vitest** (confirmed: 468/468 green). Fix is a config-level `vitest/globals` types addition (or a triple-slash ref), NOT 109 edits — and it is behavior-preserving.
- A handful of real test-type errors: `feature-flags.test.ts:81` (TS2345 string→boolean), `usePaywallGuard.test.tsx:73/243` + `useTierAccess.test.tsx:63/235` (TS2556 spread / TS2493 empty-tuple — mock-typing), `document-extraction-secondary.test.ts:101` (TS2345 string→never), `src/test/supabaseMock.ts:59` (TS2345 readonly-array variance). All **type-correction** in test infra; none changes product behavior.

### Bucket 3 — the `ignoreDeprecations` config error (1) — fix first, gates everything.

**Net for the planner:** the 19-error headline reduces to **14 real source findings (8 files)** + a **config blocker** + a **test-globals config gap** (~109 errors collapsing to one types-config fix) + ~7 small test-type fixes. Of the 14 source findings, **13 are pure type-corrections** and **3 (the SkillsGap Navbar, counted as one bug) are a mandatory D-11 latent-bug checkpoint.**

### Current lint state (CLEAN-06 / D-12) — NOT clean; needs a scope decision
`npm run lint` at HEAD: **294 problems (268 errors, 26 warnings).** This is NOT a clean baseline and never was.

| Rule | Count | Notes |
|------|-------|-------|
| `@typescript-eslint/no-explicit-any` | 248 | 108 in `src/` (27 files), 140 in `supabase/functions/` (47 files) — **error** severity |
| `(parse) / Unused eslint-disable directive` | 10 | incl. `.claude/get-shit-done/**` GSD tooling (3), `src/integrations/supabase/types.ts` "File appears to be binary", and 6 stale `eslint-disable` comments in `Auth`/`CareerCompass`/`LinkedInGrader`/`RecruitingLens`/`Results`/`supabaseClient` |
| `react-refresh/only-export-components` | 9 | warnings |
| `react-hooks/exhaustive-deps` | 8 | warnings |
| `@typescript-eslint/ban-ts-comment` | 7 | existing `@ts-expect-error`/`@ts-ignore` (2 in src, 5 in extract-analysis-structure) |
| `prefer-const` | 6 | auto-fixable |
| `no-empty-object-type` / `no-control-regex` / `no-useless-escape` / `no-require-imports` | 2/2/1/1 | misc |

**Scope decision the planner MUST surface (this is the single biggest CLEAN-06 risk):** "lint passes clean with no new suppressions" at face value means zeroing 268 errors, overwhelmingly `no-explicit-any`. Typing-away 248 `any`s across business-critical edge functions (Stripe webhook handler alone has ~12) is a HIGH-risk behavior-adjacent change, not a cleanup — it contradicts the zero-functional-change posture. Three viable interpretations for the planner to choose among (and record):
1. **Config-scope the lint gate** (recommended): add `ignores` for `.claude/**` and (if intended) `supabase/functions/**` to the flat config, remove the 6 genuinely-stale `eslint-disable` directives + 5 auto-fixable `prefer-const`/misc, and treat `no-explicit-any` as the pre-existing baseline (downgrade to `warn` or accept as tracked) — "no NEW suppressions, no NEW errors" rather than "zero errors." This honors D-12's intent (no new masking) without a 248-edit `any`-purge.
2. **Full `any` purge** — out of scope-spirit; would be its own multi-day effort and risks behavior on typed-as-any external payloads (Stripe events, Anthropic responses).
3. **Tracked-exception register** — fix the cheap wins (parse/prefer-const/stale-disables), document the `no-explicit-any` count as an explicitly-tracked known-state with reason (D-11/D-12 allow "explicitly tracked").

The `.claude/` parse errors and `src/integrations/supabase/types.ts` "binary file" error are NOT project code issues — they are config-coverage artifacts and should be `ignores`-scoped regardless.

---

## Validation Architecture (MANDATORY — Nyquist Dimension 8)

The governing proof is **"the same `verify:baseline` that passed at Phase 1/2/3 still passes."** `verify:baseline` = `npm run test` (vitest) `&& npm run test:edge` (offline deno) `&& npm run test:e2e` (Playwright). Confirmed-green starting state at HEAD: vitest **468/468** (re-run this research); deno **284/0** and Playwright **5+1skip** per Phase-02/03 close. Anchor for apples-to-apples diff: `v4.0-baseline` @ `fa4ccb6` (ancestor of HEAD).

| Requirement | What proves it | Concrete observable signal |
|-------------|----------------|----------------------------|
| **CLEAN-02** (dead files/exports removed, no behavior change) | `verify:baseline` green BEFORE and AFTER each removal cluster; `audit:deadcode` dead-list shrinks by exactly the removed set | `npm run verify:baseline` exit 0 (vitest count drops only by deleted test files — e.g. -2 for the lock unit's `LockedSection.test`/`LockedListItem.test`); `npm run audit:deadcode` React dead-file list 23 → smaller by the removed files, with NO new entries |
| **CLEAN-03** (obsolete paths retired) | Ollama: `test:edge` green after leg removal + `audit:deadcode` Deno reachable-set unchanged for non-ollama modules; `interview-prep-coach`: no-op (already absent) — recorded closed | `npm run test:edge` exit 0; deno reachability "Reachable 36 / Total 41" recomputed (drops by `ollama-client.ts` if removed, all other entrypoints still reachable); residual register entry if deferred |
| **CLEAN-04** (duplicates consolidated) | `verify:baseline` green after `resolveTier`-collision + `AnalysisComparisonModal` consolidation; all updated call sites compile + pass | `npm run verify:baseline` exit 0; `npm run audit:deadcode` `duplicates` entry for `AnalysisComparisonModal` disappears; `resolve-tier.ts` leaves the Deno dead-candidate list (removed) |
| **CLEAN-05** (clutter removed) | `verify:baseline` green after each clutter removal (behavior-preserving only) | `npm run verify:baseline` exit 0; `git diff` shows only comment/dead-code deletions, no logic lines |
| **CLEAN-06** (lint + type-check clean, no new suppressions, 19 errors resolved/tracked) | `type-check` exit 0 (after config blocker + 14 source fixes + test-globals config); `lint` exit 0 per the agreed scope; zero new `@ts-ignore`/`as any`/`eslint-disable`; `verify:baseline` still green | `npm run type-check` exit 0; `npm run lint` exit 0 (or tracked-exception register if scoped); `git diff` shows zero new suppression directives; the SkillsGap Navbar finding recorded as a D-11 checkpoint (fixed-with-ack OR tracked) |
| **Governing NFR (zero functional change)** | `git diff fa4ccb6..HEAD` is removals-and-type-fixes only; `verify:baseline` green throughout | Per-cluster `verify:baseline` exit 0; no source-behavior line added; every removal individually revertible (small specific-path commits, D-13) |

**Per-removal protocol (D-13):** for each cluster — (1) `verify:baseline` green pre; (2) make the removal as a specific-path commit; (3) `verify:baseline` green post; (4) `audit:deadcode` confirms the dead-list shrank as expected with no new findings. If any step fails, revert that single commit (the diff is isolated by design).

---

## Risks / Landmines

1. **`SkillsGapAnalysis.tsx` Navbar — shipped latent runtime bug (HIGHEST).** Three live `<Navbar />` renders with no import; build succeeds; production ships a `ReferenceError`-prone page. The type-error "fix" is a behavior change → **mandatory D-11 checkpoint**, never silent.

2. **`pricing-config.ts` exports are LIVE via cross-layer edge import — knip FALSE POSITIVE (HIGH).** knip flags `getMaxOutput`/`getMaxInputTokens`/`getMaxInputChars`/`getMeritCost` (and types `DocumentType`/`ExtractionProvider` etc.) as unused because it only sees `src/`. But `supabase/functions/_shared/tier-config.ts:142/148/153` imports them **cross-layer** from `../../../src/config/pricing-config.ts` and re-exports to `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `interview-prep-*` — the Resume Analysis / Career Compass business-critical paths. **DO NOT prune these exports** (D-09 "no cross-layer edge consumer" gate fires). Document as a knip false positive.

3. **HowItWorks disambiguation (HIGH — easy to get wrong).** Delete `src/components/HowItWorks.tsx` (dead). KEEP `src/pages/HowItWorks.tsx` (routed at `/how-it-works`, App.tsx L37/L85). The App.tsx import is `from "./pages/HowItWorks"` — a bare-name grep will falsely implicate it.

4. **IP cluster naming collision (HIGH).** The dead `src/components/Interview*`/`Quiz*Card`/`ReadinessScoreRing` share base names with LIVE `src/components/interviewPrep/*` keepers (`StreakDisplay`, `ReadinessHero`, `FlashcardDeck`, `QuizResults`). Delete dead cluster by **full path only**, never by component name.

5. **`errors.ts` + `handler.ts` are a dead PAIR (MEDIUM).** `errors.ts`'s only external referencer is `handler.ts` (also dead). Remove together / handler-first. If only `errors.ts` is removed, `handler.ts` would break (until it too is removed).

6. **`_shared` removals touch the central edge call-graph (MEDIUM).** After ANY `_shared` deletion (errors/handler/resolve-tier/ollama), re-run `audit:deadcode` Deno leg to confirm no reachable entrypoint lost an import (reachable count should drop ONLY by the intentionally-removed modules). Resume Analysis / Career Compass extraction depends on `document-extraction.ts` — extra care on the Ollama edit (leave `mistral → textract` chain intact).

7. **`AuthCallback.tsx` redirect-string trap (MEDIUM — external residual).** Repo-side clear (no `/auth/callback` string anywhere; redirects go to `/` or `/auth`), but the Supabase dashboard auth redirect allow-list is external. Needs operator/dashboard confirmation before delete, else DEFER.

8. **`database.ts` typegen ambiguity (LOW).** Zero importers; the real typegen output is `src/integrations/supabase/types.ts`. `Read` the file to confirm it is not a hand-maintained ambient declaration before deleting (cheap residual).

9. **`use-mobile.tsx` ui/** blind spot (LOW).** knip ignores `src/components/ui/**`; a hidden shadcn consumer there could reference `useIsMobile`. Grep `src/components/ui` for `use-mobile`/`useIsMobile` before delete (cheap residual).

10. **Lint scope explosion (HIGH for CLEAN-06 planning).** 268 lint errors (248 `no-explicit-any`) means "lint exit 0" is NOT a trivial cleanup. Surface the scope decision (config-scope vs full-purge vs tracked-exception) before committing to a literal exit-0 target. Purging 248 `any`s across Stripe/Anthropic-payload handlers risks behavior — out of the zero-functional-change spirit.

11. **`ignoreDeprecations` config blocker (must-fix-first).** `type-check` is currently fully blocked by `TS5103`; nothing downstream in CLEAN-06 can be measured until `tsconfig.app.json:5` is set to a value the installed tsc (5.9.3) accepts. Also note the package.json/installed TS version drift (declared 5.8.3, resolved 5.9.3) — the planner should not assume 5.8.x behavior.

---

## State of the Art

| Old assumption (catalog/PROJECT) | Current reality at HEAD | Impact |
|----------------------------------|-------------------------|--------|
| `ignoreDeprecations: "5.0"` (PROJECT.md note) | file has `"6.0"`, invalid for TS 5.9.3 → `type-check` fully blocked | Must fix config FIRST; the 19 errors are hidden behind it |
| TypeScript 5.8.3 (package.json) | resolved tsc is **5.9.3** | Don't assume 5.8 lib/deprecation behavior |
| "19 type errors" | 14 distinct real source findings (3 are one Navbar bug) + ~109 test-globals-gap + ~7 test-type | Reconcile the headline count in SUMMARY |
| "lint passes clean" (implied baseline) | 294 problems (268 errors) — never clean | CLEAN-06 lint needs an explicit scope decision |
| `ollama-client.ts` imported by document-extraction + ocr-pdf | imported by document-extraction ONLY | Narrower Ollama removal surface |

---

## Open Questions

1. **CLEAN-06 lint target scope.** Is "lint passes clean" literal exit-0 (requires addressing 248 `no-explicit-any`) or "no new errors/suppressions over the pre-existing baseline"? **Recommendation:** config-scope `.claude/**` + `supabase/functions/**` ignores, fix the cheap wins (stale `eslint-disable`, `prefer-const`), and treat `no-explicit-any` as a tracked pre-existing baseline — honoring D-12's "no NEW suppressions" without a behavior-risky `any`-purge. Needs planner/operator ratification.

2. **Ollama prod liveness (D-07 operator gate).** Is `OLLAMA_BASE_URL` set in prod, and do extraction logs ever show `provider:'ollama'`? **Recommendation:** mark as the marked-operator step; auto-defer to the residual register if not confirmable.

3. **`AuthCallback.tsx` Supabase redirect allow-list (external).** Does the Supabase dashboard list any `/auth/callback` redirect URL? **Recommendation:** operator/dashboard check; defer the row if unconfirmable. (Repo-side it is clear.)

4. **`ignoreDeprecations` correct value for TS 5.9.3.** `"5.0"` surfaces the source errors in this research; confirm `"5.0"` (vs needing the directive removed entirely once deprecations are resolved) by re-running `type-check` after the source fixes land. **Recommendation:** set to `"5.0"`, then re-evaluate whether the directive can be dropped once the underlying deprecated APIs are addressed.

---

## Sources

### Primary (HIGH confidence — directly executed at HEAD `4c9abd1`)
- `git diff 2c407ca..HEAD -- src supabase/functions` → empty (zero source drift)
- `npm run audit:deadcode` → 23 React + 5 Deno candidates (catalog reproduced exactly)
- `npx tsc -p tsconfig.app.json --noEmit` (and with `ignoreDeprecations: "5.0"`) → the type-error enumeration
- `npm run lint` + `eslint . -f json` → 294 problems breakdown
- `npm run build` → SUCCEEDS despite SkillsGap Navbar (proves runtime-bug, not build-error)
- `npx vitest run` → 468/468 green (baseline intact)
- `rg` importer/redirect/dynamic-import sweeps across `src/` and `supabase/functions/`
- Direct file reads: `tsconfig.app.json`, `tsconfig.json`, `SkillsGapAnalysis.tsx`, `document-extraction.ts`, `tier-config.ts`, `InterviewPrep.tsx`, `LockedSectionsSandbox.tsx`, `Auth.tsx`

### Catalog/context (consumed, then verified against HEAD)
- `.planning/audit/DEAD-CODE.md`, `KEEP-LIST.md`, `INDEX.md`
- `.planning/phases/04-dead-code-refactor-cleanup/04-CONTEXT.md` (D-01..D-13)
- `.planning/REQUIREMENTS.md` (CLEAN-02..06 + governing constraint), `.planning/STATE.md`

## Metadata

**Confidence breakdown:**
- Catalog-vs-HEAD reconciliation: **HIGH** — `git diff` empty + audit reproduced + vitest green, all directly run
- 23-row clearance recipes: **HIGH** — each signal grep'd at HEAD; only 2 rows carry genuine external residuals (AuthCallback, Ollama)
- Removal-cluster boundaries: **HIGH** — importer graphs traced; IP/lock/resolve-tier all verified closed
- Type-error enumeration: **HIGH** — produced by running tsc with the corrected config; the SkillsGap latent bug confirmed via build
- Lint state: **HIGH** — full JSON breakdown; the scope decision is a judgment call flagged for the planner
- Ollama operator-gate: **HIGH** repo-side / external by design — the live-prod fact is operator-only (correctly gated)

**Research date:** 2026-06-13
**Valid until:** while HEAD stays at `4c9abd1` and no source lands (the catalog and this research go stale the moment `src/` or `supabase/functions/` changes — re-run `npm run audit:deadcode` + `npm run type-check` at phase start to re-confirm).

## RESEARCH COMPLETE
