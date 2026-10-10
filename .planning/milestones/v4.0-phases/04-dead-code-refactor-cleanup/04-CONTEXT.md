# Phase 4: Dead Code & Refactor Cleanup - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase **acts on the Phase 3 audit catalog** to remove confirmed-dead code, files, and exports; retire obsolete implementation paths; consolidate duplicate helpers; clear structural clutter; and get `npm run lint` + `npm run type-check` passing clean — all **proven behavior-preserving** by re-running the Phase 1 regression baseline (`npm run verify:baseline`). It delivers five requirements (CLEAN-02..06):

1. **CLEAN-02** — modules/files/exports confirmed dead are removed with no runtime-behavior change.
2. **CLEAN-03** — obsolete implementation paths retired (Phase 50 Ollama extraction leg; the already-retired `interview-prep-coach`), confirmed against current routing.
3. **CLEAN-04** — redundant abstractions and duplicated helpers consolidated into single canonical implementations with all call sites updated.
4. **CLEAN-05** — commented-out code, stale TODOs, and structural clutter not supporting current functionality removed.
5. **CLEAN-06** — `lint` + `type-check` pass clean with **no new suppressions**; the 19 pre-existing type errors from Phase 49 close resolved (or explicitly tracked).

**Governing constraint:** **zero functional change.** No active user-facing or internal behavior may be removed, altered, or degraded. The Phase 1 baseline is the safety net that *proves* preservation — and it is the **only** net during this phase, since the deeper-coverage phase (Phase 5) runs *after* Phase 4.

**The audit gate (carried from Phase 3, binding here):** Phase 4 acts only on `safe` rows; every `needs-investigation` row must have its specific blocking signal independently **cleared** before removal. The audit confirmed **5 `safe`** and **23 `needs-investigation`**. The KEEP-LIST classes (gated-but-live) are **never** removable on a static-dead reading alone.

**NOT in this phase:** dependency bumps/pruning (Phase 6), env consolidation (Phase 7), DB removals / RLS changes / `usage_tracking` retirement / Paddle-column drops (Phase 8 — gated), performance refactors + before/after measurement (Phase 9). Adding any new capability is out of scope (brownfield hardening milestone).

</domain>

<decisions>
## Implementation Decisions

### Cleanup risk posture (CLEAN-02)
- **D-01:** **Investigate-and-clear ALL.** Phase 4 attempts to resolve every one of the 23 `needs-investigation` rows in `DEAD-CODE.md`: clear the row's specific blocking signal, **remove what clears**, and **explicitly document what genuinely cannot be cleared** (with the residual signal). This is the maximal-cleanup posture — the larger diff is the point of the phase. Every removal is still individually gated by `verify:baseline` (green before/after) and the KEEP-LIST. Nothing is removed on a static-dead reading alone; the multi-signal bar (static-dead + no-dynamic-ref + no-external-caller + not-gated) must concur per item, exactly as the audit required for its `safe` rows.
- **D-02:** **5 `safe` rows are the confirmed baseline removals** (no further investigation needed): React `src/components/HowItWorks.tsx`, `src/components/MinimalHero.tsx`, `src/components/NavLink.tsx`; Deno `supabase/functions/_shared/errors.ts`, `supabase/functions/_shared/handler.ts`. (Note the `HowItWorks` disambiguation — the routed page is the DISTINCT `src/pages/HowItWorks.tsx`; do **not** remove the page.)

### Lock-primitive surface (CLEAN-02, KEEP-LIST Class 5)
- **D-03:** **Remove the entire sectional-lock surface.** Sectional locking is treated as abandoned/superseded. Remove: the DEV-gated `/dev/locked-sections` route + its `LockedSectionsSandbox` page (`src/App.tsx` import line ~43 + `<Route>` line ~88), the `LockedSection` / `LockedListItem` primitives, the `@deprecated` `ProFeatureBlur.tsx`, and all co-located tests. After the route is gone these primitives have **zero** reachable references (they were live only via that sandbox), so removal is behavior-preserving. Confirm zero remaining importers (incl. non-DEV pages) before deleting, per the KEEP-LIST Class 5 rule.

### Interview Prep superseded cluster (CLEAN-02, KEEP-LIST Class 1)
- **D-04:** **Remove the superseded Interview Prep UI cluster** (~10 components + co-located tests): `InterviewQuiz.tsx`, `InterviewFlashcards.tsx`, `InterviewQuizResults.tsx`, `InterviewStreakDisplay.tsx`, `InterviewPrepInput.tsx`, and the leaves `QuizProgressIndicator.tsx`, `QuizQuestionCard.tsx`, `QuizResultsCard.tsx`, `ReadinessScoreRing.tsx` (one removal unit). These are the OLD path, superseded by the live `InterviewPrep.tsx → QuizRunner` (`components/interviewPrep/QuizRunner.tsx`).
- **D-05:** **Hard preconditions before any IP removal (must all hold, else demote to deferred):** (a) the live `InterviewPrep → QuizRunner` render path imports/renders **none** of the cluster; (b) **no** `VITE_FEATURE_INTERVIEW_PREP` flag variant re-activates the old `InterviewQuiz` path; (c) co-located tests are removed in the same change. **Never touch** the gated-but-live keepers: `interview-prep-analyze` / `interview-prep-evaluate` edge functions, and the `InterviewPrepPayloadSchema` / `InterviewPrepResponseSchema` zod schemas (`src/types/interviewPrep.ts`). The future Interview Prep re-enable milestone revives the **QuizRunner** feature, not this cluster.

### Obsolete-path retirement (CLEAN-03)
- **D-06:** **`interview-prep-coach` = no-op close.** Already retired — absent from the 41-function live deploy list (Phase 3 Source C, 2026-06-13), absent from repo, absent from `config.toml`. Nothing to delete; CLEAN-03 records it closed (the "still deployed" note was stale). Do **not** confuse with the live `-analyze`/`-evaluate` pair.
- **D-07:** **Ollama extraction leg = operator-confirm-then-remove, with document-and-defer fallback.** `ollama-client.ts` is reachable (it is the first entry of the `cheapProviders` fallback chain in `_shared/document-extraction.ts`, taken only when `pdf_parser` quality-fails AND `OLLAMA_BASE_URL` is set in prod). Plan an **operator step** (mirrors Phase 3 D-10): check prod for `OLLAMA_BASE_URL` presence + extraction logs showing the ollama branch was ever taken. **If confirmed dead/unset** → remove the leg (the `ollama` entry in the fallback chain + `ollama-client.ts` + its env reads + any now-orphaned helpers) behind the baseline. **If not confirmable** → auto-fall back to documenting it as obsolete-but-gated with exact removal criteria, deferring removal. Never remove on unproven-dead evidence.

### Duplicate-helper / abstraction consolidation (CLEAN-04)
- **D-08:** **Consolidate the named duplicates into single canonical implementations, updating all call sites + tests.** Known targets: (1) the tier-resolver **name-collision** — `_shared/resolve-tier.ts` (DB-based `resolveTier`, has its own `resolve-tier.test.ts`, absent from the entrypoint union) vs the LIVE `_shared/price-resolver.ts` `resolveTier()` (used by `stripe-webhook-handler`); resolve the collision (remove the dead DB resolver + its test only after confirming no current/near-future webhook path wires it, or rename to disambiguate). (2) the `AnalysisComparisonModal.tsx` duplicate `default`/named export of the same symbol. Each consolidation is gated by the baseline.
- **D-09:** **Unused-export pruning is conservative-by-signal.** Under the clear-all posture, prune unused exports on LIVE files **only where the multi-signal gate clears** (no ambient/`import type` consumer knip misses, no string/dynamic consumer, no cross-layer edge consumer via `deno info`). **Keep:** public-API / parity exports, shadcn `ui/**` parity primitives, the gated IP zod schemas, and any test-only-consumed seam that is a deliberate test boundary. An unused export removal that cannot clear all signals stays documented, not removed.

### Clutter removal (CLEAN-05)
- **D-10:** **Claude's discretion, behavior-preserving only.** Remove commented-out code, dead TODOs, and structural clutter that does not support current functionality. **Preserve** load-bearing "why"/trade-off comments, intentional section headers, and TODOs that encode a real future obligation (note any such retained TODO rather than deleting it). No reformat-the-world churn — focused removals only.

### Lint + type-check clean (CLEAN-06)
- **D-11:** **Fix all 19 pre-existing type errors → `type-check` fully clean.** Resolve every one; behavior-preserving type corrections (annotations, generics, imports) are the default. **No new suppressions** (`@ts-ignore` / `as any` / `eslint-disable` to mask an error are forbidden — this is a hard success-criterion rule). **Zero-functional-change override:** if a *proper* fix for any error would require a runtime/logic change (i.e. the type error exposes a latent bug), the executor must **surface it as a deviation/checkpoint** — not silently change behavior and not paper over it with a suppression. Such a case is either fixed with explicit acknowledgement or explicitly tracked as a known error with reason. Goal remains all-19-clean; the constraint just governs *how*.
- **D-12:** **`npm run lint` passes clean with no new suppressions**, same rules as D-11.

### Verification & sequencing
- **D-13:** **`verify:baseline` is the per-removal gate.** Re-run the Phase 1 baseline (vitest + offline deno + Playwright) green before and after the cleanup; the proof of CLEAN-02..05 is "the same baseline that passed at Phase 1/2/3 still passes." Prefer small, reversible, domain-grouped commits so any single removal can be reverted in isolation (consistent with the milestone's per-change rollback posture).

### Claude's Discretion
- Exact plan/commit slicing (e.g. one plan per domain: React dead files / Deno `_shared` / IP cluster / lock-primitive surface / consolidation / type-errors), the precise order of removals, the format of the "documented-but-not-removed" residual register, and the CLEAN-05 clutter-removal scope are left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The audit catalog this phase consumes (PRIMARY — read first)
- `.planning/audit/DEAD-CODE.md` — CLEAN-01 catalog: the 5 `safe` rows (act on directly), the 23 `needs-investigation` rows with each one's blocking signal, the unused-export/type table (CLEAN-04 input), the Deno `_shared` reachability findings, and the D-08 re-verification of the Ollama leg + `interview-prep-coach`. **This is the work-list.**
- `.planning/audit/KEEP-LIST.md` — the D-07 gate (5 keep-classes). Apply after every static pass; nothing matching a keep-class is removable on a static-dead reading. Class 1 (IP gated-live `-analyze`/`-evaluate` + schemas), Class 2 (Paddle), Class 3 (webhook/cron/job functions), Class 4 (dynamic/template-literal keys), Class 5 (deprecated-but-imported lock primitives).
- `.planning/audit/INDEX.md` — catalog entry point + the reproducible `npm run audit:deadcode` / `audit:deps` re-run commands (re-run to confirm the catalog still matches HEAD before acting).

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 4: Dead Code & Refactor Cleanup" — goal, depends-on (Phase 1, Phase 3), the 5 success criteria.
- `.planning/REQUIREMENTS.md` — CLEAN-02 (line ~15), CLEAN-03 (~16), CLEAN-04 (~17), CLEAN-05 (~18), CLEAN-06 (~19), plus the governing zero-functional-change constraint.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — hard constraint (zero functional change), conditional-removal rule, risk appetite; §"Key Decisions" — Phase 49 note (the 19 type errors deferred to CLEAN-06; `ignoreDeprecations` "5.0").

### State, gates & prior verdicts
- `.planning/STATE.md` §"Carried-Forward Cleanup Targets" (Ollama leg, retired `interview-prep-coach` already-retired update, Paddle/`usage_tracking` = Phase 8 not here), §"Accumulated Context → Decisions" (Phase 03 03-02/03-05 verdicts), §"Blockers/Concerns" (v4.0-baseline `fa4ccb6` is the regression anchor, ancestor of `staging`).
- `TESTING-STRATEGY.md` (repo root) — the `verify:baseline` blocking gate (D-13) + quarantine register; what "green" means for this phase's proof.

### Source files named in the decisions (verify at current HEAD before acting)
- `supabase/functions/_shared/document-extraction.ts` — Ollama fallback-chain routing (D-07); `supabase/functions/_shared/ollama-client.ts` — the leg + its `OLLAMA_*` env reads.
- `supabase/functions/_shared/resolve-tier.ts` (+ `resolve-tier.test.ts`) vs `supabase/functions/_shared/price-resolver.ts` — the `resolveTier` collision (D-08).
- `src/App.tsx` (`/dev/locked-sections` route), `src/pages/dev/LockedSectionsSandbox.tsx`, the `LockedSection`/`LockedListItem`/`ProFeatureBlur` components (D-03).
- `src/pages/InterviewPrep.tsx` + `src/components/interviewPrep/QuizRunner.tsx` (the live keeper path) vs the superseded cluster in `src/components/` (D-04/D-05); `src/types/interviewPrep.ts` (zod schemas — keep).

### Prior-phase context (decision patterns to stay consistent with)
- `.planning/phases/03-cross-domain-inventory-audit/03-CONTEXT.md` — D-05/D-06 (three-tier + conservative bar), D-07 (keep-list classes), D-08 (re-verified targets), D-10 (operator-gated prod check pattern reused for Ollama).
- `.planning/phases/02-repository-hygiene-state-reconciliation/02-CONTEXT.md` — specific-path commit discipline, evidence-doc precedent.
- `.planning/phases/01-testing-strategy-regression-baseline/01-CONTEXT.md` — the `verify:baseline` gate this phase re-runs as its proof.

### Repo conventions & policy
- `CONTRIBUTING.md` (repo root) — commit-message + branch conventions.
- `CLAUDE.md` — git rules, reliability priorities (Resume Analysis / Career Compass are business-critical — extra care on any shared `_shared/` removal).

### ⚠ Stale instruction — reconcile, don't obey blindly
- **`.planning/` IS tracked now** (commit `a0bf4f5`, 2026-05-11). Some older CLAUDE.md text still says "do not commit `.planning/`" — stale. Commit `.planning/` artifacts normally with **specific file paths**; never `git add -f`, never `git add -A`/`.` (user memory: `feedback_no_planning_commits`).

**No external ADRs/specs govern this phase** — the binding inputs are the four `.planning/audit/` catalogs (DEAD-CODE / KEEP-LIST / INDEX) + the scope docs above; all implementation decisions are captured in `<decisions>`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets / Existing tooling
- **`npm run audit:deadcode` / `audit:deps`** (`scripts/audit/run-deadcode.mjs`, `run-deps.mjs`, `deno-reachability.mjs`, `knip.json`) — the committed, re-runnable audit from Phase 3. Re-run before acting to confirm the catalog still matches HEAD; re-run after removals to confirm the dead-list shrinks as expected.
- **`npm run verify:baseline`** — the regression proof (vitest 468 + offline deno 284 + Playwright 5+1skip green at Phase 02/03 close). The per-removal gate (D-13).
- **`npm run type-check`** (`tsc -p tsconfig.app.json --noEmit`) + **`npm run lint`** — the CLEAN-06 gates.

### Established Patterns
- **Three-tier classification + multi-signal `safe` bar + KEEP-LIST gate** (Phase 3 D-05/D-06/D-07) — the discipline this phase applies before every removal.
- **Operator-gated prod confirmation** (Phase 3 D-10) — reused for the Ollama leg (D-07): autonomous repo-side verdict + a marked operator step for the live-prod fact.
- **Edge functions are reached by HTTP-invoke/webhook/cron, never by `import`** — "not imported" ≠ "dead" for any `index.ts` entrypoint (KEEP-LIST Class 3).
- **Specific-path commits, small & reversible** (Phase 2 / milestone rollback posture).

### Integration Points / removal clusters (verify in-phase)
- **Lock-primitive unit:** `App.tsx` route → `LockedSectionsSandbox` → `LockedSection`/`LockedListItem`; `ProFeatureBlur` independent (zero importers). Remove as one unit (D-03).
- **Interview Prep unit:** the ~10 superseded components form one removal unit; the leaves (`Quiz*Card`, `ReadinessScoreRing`, `QuizProgressIndicator`) are imported only by other dead cluster members (D-04). Live keepers (`QuizRunner`, `-analyze`/`-evaluate`, zod schemas) sit beside them — surgical separation required.
- **`_shared` removals** touch the central edge call-graph hub — re-run the Deno reachability union after each to confirm no reachable function lost an import.
- **Type-error fixes (19)** may span multiple files; each fix verified by `type-check` + `verify:baseline` (D-11).

</code_context>

<specifics>
## Specific Ideas

- The audit's `DEAD-CODE.md` "Consumer — Phase 4" cross-reference is the literal starting checklist: act on the 5 `safe` rows; resolve each `needs-investigation` row's named blocking signal; the IP cluster, `resolve-tier.ts`, `AuthCallback.tsx` (redirect-string trap — check Supabase auth redirect allow-list before removal), `ResumeBuilder.tsx` (orphan page — check for `navigate("/resume-builder")` string/flag route), `database.ts` (generated typegen target — confirm no `import type` consumer + whether it's the typegen output) each have a specific clearance step recorded there.
- Re-run `npm run audit:deadcode` at phase start to re-confirm the catalog against current HEAD (catalog was taken at `staging`@`2c407ca`); HEAD may have advanced.
- "Documented-but-not-removed" residual items get a short register (file + residual signal + why-deferred + what evidence would clear it) so Phase 5+/future passes inherit a clean handoff — same spirit as the Phase 3 catalogs.

</specifics>

<deferred>
## Deferred Ideas

- **`usage_tracking` retirement + Paddle column/function removal** — Phase 8 (DB-04, externally gated on last in-flight Paddle subscription). NOT Phase 4, even though they surface in dead-code/keep-list discussions.
- **Dependency pruning/bumps** (unused deps knip flagged, major-version bumps) — Phase 6 (DEP-02..05).
- **Env-var consolidation** (unused/duplicated `VITE_*` + edge secrets) — Phase 7 (ENV-02..05).
- **Performance refactors + before/after measurement** of the PERF-HOTSPOTS catalog — Phase 9 (PERF-02..04).
- **Dead CSS / static-asset / image audit** — surfaced as a possible extra sweep; not separately scoped this round (planner may fold cheap wins into CLEAN-05, otherwise a future pass).
- **Mechanical/CI enforcement of the audit** (failing CI on new dead code) — not in scope; `audit:*` scripts are re-runnable on demand.
- **Re-fixing latent bugs revealed by the 19 type errors** — if a type-error fix exposes a real logic bug, Phase 4 surfaces/tracks it (D-11); the actual bugfix is a `/gsd-debug` / future-pass concern, not a silent behavior change here.

None of the above is scope creep — discussion stayed within Phase 4's dead-code-removal-and-cleanup boundary.

</deferred>

---

*Phase: 4-dead-code-refactor-cleanup*
*Context gathered: 2026-06-13*
