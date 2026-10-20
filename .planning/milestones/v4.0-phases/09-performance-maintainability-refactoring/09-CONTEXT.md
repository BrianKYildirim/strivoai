# Phase 9: Performance & Maintainability Refactoring - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **performance + maintainability refactoring leg of v4.0** under the
milestone's hard constraint of **zero functional change**. Act on the Phase 3
hotspot catalog (`.planning/audit/PERF-HOTSPOTS.md`, H1-H5) and the perf-class DB
advisories Phase 8 routed forward, land low-risk clarity refactors, and **measure
before/after latency on the two business-critical flows (Resume Analysis + Career
Compass)** to prove no regression and substantiate any claimed improvement. Three
requirements:

1. **PERF-02** — Apply behavior-preserving performance refactors (data-access patterns, parallelization, cache/result reuse) to the Phase 3 hotspots, baseline green.
2. **PERF-03** — Architecture/clarity refactors improve maintainability without altering any external behavior.
3. **PERF-04** — Measure Resume Analysis + Career Compass latency before/after; confirm no regression; substantiate any claimed gain.

**Defining characteristic — this is the FIRST phase since the Phase-1 baseline that
intentionally edits product code (`src/` + `supabase/functions/`).** The
zero-functional-change proof model therefore shifts from "`git diff` empty" (used by
Phases 7/7.1/8) to **"behavior preserved despite code changes"** — proven by
`verify:baseline` green + PERF-04 before/after measurement + per-DB-change
preview->prod no-regression, each change individually validated with a rollback path
(the NFR-02 pattern, carried forward).

**Operating model (locked upstream — carried forward, NOT re-litigated):**
- **DB-change MCP model** (Phase 8 / CLAUDE.md MCP rules): canonical prod
  `zjpjapgraoxdukdvpjes` is **read-only** to Claude via `supabase-prod-readonly`;
  **operator applies every prod migration**; preview `cimjltzovkahkqecpwgi`
  (UNPAUSED as of 2026-06-24) is the test-first surface; **every migration runs
  preview -> operator-review -> operator-applies-prod -> read-only re-verify**, with
  a documented rollback for each (DB-06 pattern).
- **`usage_tracking` table-drop + the two live `can_perform_ai_action` call sites
  (`Navbar.tsx:109`, `SkillsGapAnalysis.tsx:108`) = gated/backlog** (Phase 8 D-06),
  NOT this phase. H2's write path is the only optimizable part; the table stays.
- **Paddle remnants = gated** on the last in-flight subscription expiring.
- **Names-not-values** discipline on every committed doc; **pure-ASCII `.ps1`** if any
  deploy script is touched.

**NOT in this phase (locked):**
- H1 (career-compass slicing / per-tier cap) and H3 (merit-balance refetch) **code
  changes** — too close to the AI-input -> output -> cache-key path (H1) and
  post-purchase balance-correctness UX (H3); documented + deferred (still measured
  under PERF-04, not refactored).
- H2 `usage_tracking` table-drop / FE-gate migration — gated/backlog (Phase 8 D-06).
- `unused_index` ×41 **drops** — near-empty-prod usage stats are unreliable (Phase 8
  D-11); document + observation window, no drop this phase.
- Any new feature / schema redesign / AI-routing / pricing change; any Claude write to
  production; any structural rewrite or new abstraction beyond a single helper.

</domain>

<decisions>
## Implementation Decisions

### Refactor appetite (PERF-02) — "safe wins only"

- **D-01: Apply only the provably-zero-risk hotspots; defer the business-critical ones.**
  Apply **H4** (parallel-merge `repairTruncatedJSON`+`JSON.parse`+validate dedup — the
  only Phase-3 `safe`-classified hotspot) and **H5** (consolidate the duplicated
  latest-row `.order('created_at', desc).limit(1)` fetch into one shared accessor).
  Apply the DB perf-class items per D-04. **Leave H1, H2, H3 as documented + deferred**
  — no code change to the career-compass AI-input path, the merit-balance UX path, or
  the gated legacy `usage_tracking` write path. This mirrors Phase 8's "security-class
  only, defer perf" stance and keeps zero-functional-change *provable*, not assumed.
  Chosen over "safe + measurement-gated H1/H3" and over "you-decide per-hotspot".
  - **H4 guard:** the merge feeds Resume Analysis output — the merged-schema contract
    must stay byte-identical; measure the deterministic merge path to prove neutrality.
  - **H5 guard:** each call site has a slightly different `select(...)` column set and
    filters (PERF-HOTSPOTS H5 note) — **reconcile the per-call column sets BEFORE
    consolidating**; a naive merge that changes what columns a page receives is a
    functional change.

### Measurement methodology (PERF-04)

- **D-02: Measure on staging, reuse + extend the existing harness, isolate the
  deterministic path, report median + p95 over multiple runs.**
  - **Environment = staging** (NOT prod). Prod is read-only and near-empty (1 user) —
    an end-to-end latency measurement there is both off-limits (CLAUDE.md MCP rules) and
    meaningless. The existing harness already targets `--env staging`.
  - **Harness:** reuse `scripts/validate-performance.mjs` for Resume Analysis as-is;
    **extend it (or add a sibling probe) to cover `analyze-career`** so Career Compass
    has measurement parity (it currently has NO harness). Reuse
    `scripts/staging-cache-perf-probe.mjs` for the cache-hit path.
  - **Noise handling:** Anthropic-call latency dominates and is noisy, so report
    **median + p95 over >=5 runs per flow per tier**, warmup run discarded, cooldown
    between runs (the harness already supports `--runs` / `--cooldown` / `--warmup`).
  - **Isolate the signal:** **measure the cache-hit / deterministic path separately**
    from the full AI-call path. The refactors we actually ship (H4 merge, H5 query, DB
    RLS) sit on deterministic code whose delta the AI call would otherwise swamp — the
    cache-hit/deterministic measurement is the clean regression signal; the end-to-end
    measurement satisfies the PERF-04 mandate to prove the user-facing flow didn't
    regress.
  - **No-regression bar:** end-to-end median not worse than the captured baseline beyond
    run-to-run variance, AND the deterministic path shows no regression. Any *claimed
    improvement* must clear the noise band to be claimed.

### DB perf-class scope (PERF-02, Phase-8 handoff)

- **D-03: Apply the zero-observable + additive DB perf wins; gate the consolidations;
  defer the drops.** From the Phase 8 routing
  (`auth_rls_initplan` ×62, `multiple_permissive_policies` ×48,
  `unindexed_foreign_keys` ×8, `unused_index` ×41):
  - **APPLY: `auth_rls_initplan` ×62** — wrap `auth.uid()` / `current_setting(...)` in a
    scalar subselect `(select auth.uid())`; the Supabase-recommended, zero-observable
    rewrite (same row visibility, fewer per-row re-evaluations).
  - **APPLY: `unindexed_foreign_keys` ×8** — additive covering indexes; `DROP INDEX`
    rollback; zero behavior change.
  - **APPLY SELECTIVELY: `multiple_permissive_policies` ×48** — consolidate overlapping
    permissive policies **only where the merged policy is provably the OR of the
    originals** (identical access semantics), each behind a preview SELECT-as-role
    no-regression check (Phase 8 D-03 grant-altering caution). Defer any ambiguous ones.
  - **DEFER: `unused_index` ×41 drops** — same reasoning as Phase 8 D-11: low-traffic /
    near-empty-prod `pg_stat` usage counts are NOT proof of disuse. Document + keep an
    observation window; do not drop on unreliable signal (reversible `CREATE INDEX`
    rollback if ever taken later).
  - **`public_bucket_allows_listing`** (storage) -> operator/defer; not a perf item.
  - All applied DB changes follow the locked preview->prod gated model with a rollback
    each (D-06 / NFR-02 carried forward).

### Clarity / maintainability scope (PERF-03)

- **D-04: Zero-behavior-change consolidations only; no rewrites, no new abstractions
  beyond a single helper.**
  - **IN: H5 shared latest-row accessor** — doubles as the clarity win (DRY the ~10
    duplicated latest-row fetches). Reconcile the differing `select()` column sets first
    (see D-01 H5 guard).
  - **IN (conditional): the deferred `_shared/errors.ts` taxonomy helper** (Phase 7.1
    D-04) — **only** as a pure DRY consolidation of the already-existing inline
    `const ERR` maps (spec'd in `RUNTIME-RELIABILITY.md` §RUN-03), zero behavior change.
    **Caveat / dependency:** Phase 7.1 plans 07.1-03 + 07.1-05 are still open ([ ] in
    ROADMAP) — the inline taxonomy may not be fully landed in code yet. **Verify the
    inline `const ERR` maps actually exist at HEAD before extracting**; if 7.1's code
    work is incomplete, **defer** rather than couple Phase 9 to unfinished 7.1 work.
  - **OUT/DEFER: H1 cap/slice dedup** — even the "pure" dedup of the duplicated per-tier
    cap derivation sits adjacent to the AI-input + cache-key computation; deferred for
    the same reason H1's perf change is deferred (D-01). Consistency over a marginal
    clarity win.
  - **OUT: any structural/architecture rewrite or new abstraction beyond a single
    helper** (CLAUDE.md: "Avoid adding unnecessary abstractions when a single helper
    function is enough").

### Claude's Discretion
- Plan/wave slicing; whether to split the DB perf-class work into its own plan/wave vs
  fold into the code-refactor plans; the exact migration-file timestamps + naming
  (follow `YYYYMMDDHHMMSS_description.sql`); whether to extend `validate-performance.mjs`
  in place vs add a parallel `analyze-career` probe; the precise per-policy consolidated
  SQL for the `multiple_permissive_policies` subset that passes the "provably OR of
  originals" bar; the home for the before/after measurement report (`.planning/audit/`
  vs phase dir). All consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 9: Performance & Maintainability Refactoring" — the goal + the 3 success criteria (PERF-02/03/04) + the Depends-on (Phase 3, Phase 5).
- `.planning/REQUIREMENTS.md` §"Performance & Maintainability Refactoring (PERF)" — PERF-02/03/04 statements + the governing **zero-functional-change** constraint.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — the hard constraint + brownfield-maintenance framing + git rules (never `-A`/`.`/`-f`; `.planning/` is tracked).

### The evidence Phase 9 acts on (Phase 3 audit)
- `.planning/audit/PERF-HOTSPOTS.md` — **the central input.** The 5 classified hotspots (H1-H5) with re-confirmed `file:line` anchors, categories, classifications, and the D-12 STATIC-only / measurement-is-Phase-9 boundary. H4 = `safe`; H1/H2/H3/H5 = `needs-investigation` (business-critical / gated). Includes the reproducible re-assertion `rg` block.
- `.planning/audit/KEEP-LIST.md` — the never-`safe` gate that forced 4/5 hotspots to `needs-investigation`; governs any "is this safe to touch?" call.
- `.planning/audit/INDEX.md` — the `.planning/audit/` catalog entry point.

### The DB perf-class handoff (from Phase 8)
- `.planning/audit/RUNTIME-RELIABILITY.md` §"Advisory findings (performance)" — the per-advisory rows (`auth_rls_initplan` ×62, `multiple_permissive_policies` ×48, `unindexed_foreign_keys` ×8, `unused_index` ×41) with affected objects + verification commands + rollback notes, all marked routed-to-Phase-9.
- `.planning/phases/08-database-cleanup-migrations/08-CONTEXT.md` §"Deferred Ideas" + D-02/D-03 — the explicit perf-class deferral to Phase 9 and the grant-altering verify-then-apply caution this phase inherits.
- `.planning/audit/DATABASE.md` — the table/policy/index inventory + the `usage_tracking` reader/writer map (H2 context; the table-drop stays gated).
- `.planning/audit/RESIDUAL-REGISTER.md` — the append-only deferral/accepted-risk register; any Phase-9 deferral (e.g. `unused_index` drops, deferred consolidations) lands here.

### Measurement assets (PERF-04)
- `scripts/validate-performance.mjs` — the existing analyze-resume SSE wall-clock + cost-estimate harness (`--env staging --runs N --cooldown N --warmup`). Reuse as-is for Resume Analysis; **extend or sibling for `analyze-career`**.
- `scripts/staging-cache-perf-probe.mjs` — the cache-path probe to reuse for the deterministic cache-hit measurement.
- `README.md` §"Testing and Validation" — documents the `validate-performance.mjs` invocation + `scripts/test-resumes/` fixtures.

### Proof model / regression spine (carried forward)
- `TESTING-STRATEGY.md` (repo root) + `npm run verify:baseline` — the vitest + offline-deno + Playwright gate that proves behavior preserved despite code changes (the Phase-9 proof model, replacing "git diff empty").
- `scripts/deploy.ps1` — the deploy path that runs `verify:baseline` as a HARD precondition; keep `.ps1` pure-ASCII if touched (project memory).
- `CLAUDE.md` §"Coding Style" MCP rules 1-8 — the prod-read-only / operator-applies-prod / rollback-for-every-migration / test-preview-first policy governing every DB change in this phase.

### Prior decisions / patterns (locked upstream — do not re-litigate)
- `.planning/phases/08-database-cleanup-migrations/08-CONTEXT.md` — the preview->prod gated migration model, the near-empty-prod "0-count != disuse" rule (D-11), the verify-then-apply grant-change caution (D-03), the generated-but-unapplied-migration handoff pattern.
- `.planning/phases/07.1-runtime-reliability-review/07.1-CONTEXT.md` — the MCP access model, names-not-values discipline, and the D-04 deferral of the `_shared/errors.ts` taxonomy helper to Phase 9.
- `.planning/codebase/CONCERNS.md` §3 (BUDGET-03 / analyze-career slicing), §5 + §9 (`usage_tracking` dual read/write; merit refetch) — the v3.0 LEADS behind H1/H2/H3 (re-confirmed + behavior-drifted in PERF-HOTSPOTS.md; treated as deferred here).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/validate-performance.mjs`** — analyze-resume perf harness (median/cost over runs, warmup, cooldown); the PERF-04 measurement spine for Resume Analysis, extendable to Career Compass.
- **`scripts/staging-cache-perf-probe.mjs`** — cache-path probe; reuse for the deterministic cache-hit regression signal.
- **`src/lib/analysisHelpers.ts:134`** — the *only* already-consolidated latest-resume accessor; the canonical target shape H5 consolidates the ~10 duplicated call sites into.
- **`supabase/functions/_shared/result-merger.ts`** (`parseAndValidateCall` `:290-332`, invoked `:462-468`/`:487`/`:498`) + **`_shared/recruiting-lens-merger.ts:131-132`** — the H4 merge dedup target (pure server-side utility, no external caller).
- **`verify:baseline`** (vitest + offline-deno + Playwright) — the behavior-preserved proof gate, re-run as this phase's zero-functional-change evidence.
- **`RUNTIME-RELIABILITY.md` §RUN-03 inline `const ERR` taxonomy** — the source maps the conditional `_shared/errors.ts` helper would DRY (verify landed first).

### Established Patterns
- **MCP prod is READ-ONLY; operator applies all prod/destructive changes**; **every migration preview->prod gated with a rollback** (CLAUDE.md rules + Phase 8) — governs the DB perf-class work.
- **Demote-on-doubt / near-empty-prod 0-count != disuse** (Phase 8 D-11) — the basis for deferring `unused_index` drops.
- **Per-risky-change validation + rollback path** (NFR-02, Phase 6/8) — each DB migration and each code refactor validated individually.
- **Names-not-values in every committed doc** + **pure-ASCII `.ps1`** (project memory).
- **Single helper over new abstraction** (CLAUDE.md coding style) — bounds the PERF-03 clarity work.

### Integration Points
- **MCP servers** — `supabase-prod-readonly` (inspect prod, never write) + `supabasepreview` (writable preview, UNPAUSED). The DB perf-class migrations flow through preview first.
- **Frontend pages <-> H5 accessor** — `LinkedInGrader.tsx`, `SkillsGapAnalysis.tsx`, `CareerCompass.tsx`, `RecruitingLens.tsx`, `Profile.tsx`, `PriorLinkedInSelector.tsx`, `DashboardHome.tsx`, `AnalysisComparisonModal.tsx` all carry the duplicated latest-row fetch; consolidation must preserve each page's exact column/filter needs.
- **Edge merge <-> Resume Analysis output** — H4 sits in the analyze-resume parallel-merge path; the merged-schema contract is the behavior boundary to hold byte-identical.
- **Staging deploy <-> measurement** — PERF-04 measures the deployed staging functions; before/after captures bracket the refactor deploys.

</code_context>

<specifics>
## Specific Ideas

- The operator chose the **conservative, prove-don't-assume** stance in every area — identical to Phases 7/7.1/8: act surgically on the provably-safe wins, freeze the business-critical AI/merit paths, prove zero behavior change rather than assume it, never let Claude write prod.
- The single biggest accidental-functional-change risk is an H1/H3 edit altering AI input/output/cache-key or balance UX, or a DB policy consolidation that changes access semantics — which is exactly why H1/H3 code changes are deferred and `multiple_permissive_policies` consolidation is hard-gated behind SELECT-as-role no-regression checks.
- The signal-isolation insight drives the measurement design: the refactors live on deterministic code whose delta the noisy AI call would swamp, so the cache-hit/deterministic path is the real regression signal while end-to-end satisfies the PERF-04 mandate.
- Operator wants recommendations led up front, not one-question-at-a-time interrogation (see memory `feedback_recommend_dont_interrogate`).

</specifics>

<deferred>
## Deferred Ideas

- **H1 — analyze-career per-tier cap re-derivation + `resumeText`/`linkedInData` re-slicing** (`analyze-career/index.ts:90`/`:127`/`:1173-1176`/`:1539-1541`) — both the perf change and the clarity dedup deferred; too close to the AI-input -> output -> cache-key path. Still measured under PERF-04, not refactored.
- **H2 — `usage_tracking` dual-write optimization** — the table-drop / FE-gate retirement is gated/backlog (Phase 8 D-06); only the write path could ever be optimized, and even that is deferred this phase to avoid touching the gated legacy cluster.
- **H3 — merit-balance refetch tuning** (`useMerits.ts` `staleTime`/poll bounds) — deferred; directly affects post-purchase balance-correctness UX. Measured, not refactored.
- **`unused_index` ×41 drops** — deferred to a longer-observation window; near-empty-prod usage stats are unreliable (Phase 8 D-11). Reversible `CREATE INDEX` rollback if ever taken.
- **`multiple_permissive_policies` consolidations that are NOT provably semantics-preserving** — the ambiguous subset is documented + deferred rather than risk an access-behavior change.
- **Storage `public_bucket_allows_listing`** — operator/defer; confirm intended-public vs restrict; not a perf item.
- **Architecture/structural rewrites or new abstractions beyond a single helper** — out of scope per the PERF-03 bound (CLAUDE.md single-helper rule).

None of the above is scope creep — discussion stayed inside Phase 9's PERF-02/03/04 boundary; the deferrals are how-far-under-zero-change scoping decisions.

</deferred>

---

*Phase: 9-performance-maintainability-refactoring*
*Context gathered: 2026-06-24*
