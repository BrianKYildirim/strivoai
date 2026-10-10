# Phase 9: Performance & Maintainability Refactoring - Research

**Researched:** 2026-06-24
**Domain:** Behavior-preserving perf/clarity refactoring of a Supabase-Edge (Deno) + React/TS app, plus zero-observable DB RLS/index migrations, plus before/after latency measurement of two AI flows.
**Confidence:** HIGH (all findings file:line-anchored against `staging` @ `be39c0e3`; DB-pattern guidance verified against Supabase official docs; live advisory counts cross-checked against STATE.md Phase-8 close-out).

> This file is prescriptive. The locked scope (H4 + H5 + the additive/zero-observable DB perf items + PERF-04 measurement) is NOT re-opened here — this answers **HOW to execute it** and flags **two places the locked scope cannot be executed as written** (the conditional `errors.ts` helper, and the `analysisHelpers.ts:134` "canonical accessor" mislabel + a larger-than-stated H5 surface).

---

<user_constraints>
## User Constraints (from 09-CONTEXT.md)

These are LOCKED upstream decisions. The planner MUST honor them verbatim. Do not plan alternatives to locked choices; do not plan code changes for deferred items.

### Locked Decisions (from `## Implementation Decisions`)

- **D-01 (refactor appetite — "safe wins only"):** Apply ONLY **H4** (parallel-merge `repairTruncatedJSON`+`JSON.parse`+validate dedup) and **H5** (consolidate the duplicated latest-row `.order('created_at', desc).limit(1)` fetch into one shared accessor) plus the DB perf items per D-03. **Leave H1, H2, H3 documented + deferred** — no code change to the career-compass AI-input path, the merit-balance UX path, or the gated legacy `usage_tracking` write path.
  - **H4 guard:** the merge feeds Resume Analysis output — the merged-schema contract must stay byte-identical; measure the deterministic merge path to prove neutrality.
  - **H5 guard:** each call site has a slightly different `select(...)` column set + filters — **reconcile the per-call column sets BEFORE consolidating**; a naive merge that changes what columns a page receives is a functional change.
- **D-02 (measurement methodology):** Measure on **staging** (NOT prod). Reuse `scripts/validate-performance.mjs` for Resume Analysis as-is; **extend it OR add a sibling probe to cover `analyze-career`** (Career Compass has NO harness). Reuse `scripts/staging-cache-perf-probe.mjs` for the cache-hit path. Report **median + p95 over >=5 runs per flow per tier**, warmup discarded, cooldown between runs. **Measure the cache-hit / deterministic path SEPARATELY** as the clean regression signal (AI-call latency swamps the delta). No-regression bar: end-to-end median not worse than baseline beyond run-to-run variance AND the deterministic path shows no regression; any claimed improvement must clear the noise band.
- **D-03 (DB perf-class scope):**
  - **APPLY `auth_rls_initplan` x62** — wrap `auth.uid()` / `current_setting(...)` in a scalar subselect `(select auth.uid())`.
  - **APPLY `unindexed_foreign_keys` x8** — additive covering indexes; `DROP INDEX` rollback.
  - **APPLY SELECTIVELY `multiple_permissive_policies` x48** — consolidate overlapping permissive policies ONLY where the merged policy is **provably the OR of the originals** (identical access semantics), each behind a preview SELECT-as-role no-regression check. Defer any ambiguous ones.
  - **DEFER `unused_index` x41 drops** — near-empty-prod `pg_stat` counts are not proof of disuse (Phase-8 D-11). Document + observation window; no drop this phase.
  - `public_bucket_allows_listing` (storage) -> operator/defer; not a perf item.
  - All applied DB changes follow the locked **preview->prod gated model** with a rollback each.
- **D-04 (clarity scope):**
  - **IN:** H5 shared latest-row accessor (doubles as the clarity win). Reconcile the differing `select()` column sets first.
  - **IN (conditional):** the deferred `_shared/errors.ts` taxonomy helper — ONLY as a pure DRY of the already-existing inline `const ERR` maps; **verify the inline `const ERR` maps actually exist at HEAD before extracting; if 7.1's code work is incomplete, DEFER.** *(See `<open_questions>` Q5: the rich taxonomy maps do NOT exist at HEAD — only a single-line `const ERR = 'internal_error'` per fix site. This condition evaluates to **DEFER**.)*
  - **OUT/DEFER:** H1 cap/slice dedup (adjacent to AI-input + cache-key).
  - **OUT:** any structural/architecture rewrite or new abstraction beyond a single helper.

### Claude's Discretion (from `## Claude's Discretion`)
Plan/wave slicing; whether to split the DB perf-class work into its own plan/wave vs fold into the code-refactor plans; the exact migration-file timestamps + naming (follow `YYYYMMDDHHMMSS_description.sql`); whether to extend `validate-performance.mjs` in place vs add a parallel `analyze-career` probe; the precise per-policy consolidated SQL for the `multiple_permissive_policies` subset that passes the "provably OR of originals" bar; the home for the before/after measurement report (`.planning/audit/` vs phase dir).

### Deferred Ideas (OUT OF SCOPE — do not plan code changes)
- **H1** — analyze-career per-tier cap re-derivation + `resumeText`/`linkedInData` re-slicing (`analyze-career/index.ts:90`/`:127`/`:1173-1176`/`:1539-1541`). Measured under PERF-04, NOT refactored.
- **H2** — `usage_tracking` dual-write optimization (table-drop / FE-gate gated/backlog Phase-8 D-06). Measured, not refactored.
- **H3** — merit-balance refetch tuning (`useMerits.ts` `staleTime`/poll bounds). Measured, not refactored.
- **`unused_index` x41 drops** — deferred to a longer-observation window (Phase-8 D-11).
- **`multiple_permissive_policies` consolidations that are NOT provably semantics-preserving** — documented + deferred.
- **Storage `public_bucket_allows_listing`** — operator/defer; not a perf item.
- **Architecture/structural rewrites or new abstractions beyond a single helper.**

### Operating model (locked upstream — carried forward, NOT re-litigated)
- **DB-change MCP model:** canonical prod `zjpjapgraoxdukdvpjes` is **read-only** to Claude via `supabase-prod-readonly`; **operator applies every prod migration**; preview `cimjltzovkahkqecpwgi` (UNPAUSED) is the test-first surface; every migration runs **preview -> operator-review -> operator-applies-prod -> read-only re-verify**, with a documented rollback for each.
- **Proof model:** "behavior preserved despite code changes" = `verify:baseline` green + PERF-04 before/after + per-DB-change preview->prod no-regression, each with a rollback path. NOT "git diff empty" (this is the first phase since the Phase-1 baseline that intentionally edits product code).
- **Names-not-values** on every committed doc; **pure-ASCII `.ps1`** if any deploy script is touched; never `git add -A`/`.`/`-f`.
</user_constraints>

---

## Summary

Phase 9 has three legs and a hard "behavior preserved despite code changes" proof model. The research confirms the locked scope is executable **with two material corrections the planner must absorb up front**:

1. **H4 has GENUINE, narrowly-scoped redundancy — but ONLY in `analyze-resume`, not `recruiting-lens`.** In `analyze-resume`, `executeParallelCalls` runs the full `parseAndValidateCall` (repair + parse + normalize + strip + validate) on every HTTP-successful call at `index.ts:406` purely to decide whether to retry — and **throws away the parsed `data`** (keeps only `validation.ok`). The non-retried call's raw text is then re-fed to `mergeAndValidateResults`, which calls `parseAndValidateCall` **again** on the identical buffer (`result-merger.ts:463`/`:487`/`:498`). So every successful call is parsed twice. `recruiting-lens`'s retry loop (`recruiting-lens/index.ts:418-434`) does NOT parse upstream — it only retries on HTTP failure — so `parseCallResult` runs exactly once there. **H4's only real win is in `analyze-resume`; the recruiting-lens merger is NOT a redundancy and should be left byte-identical** (touching it is risk with no payoff).

2. **The H5 framing in PERF-HOTSPOTS/CONTEXT is partly inaccurate and the surface is larger than stated.** `analysisHelpers.ts:134` is described as "the only consolidated latest-row accessor / the canonical shape H5 consolidates into" — but it is `getAnalysisHistory()`, a **`.limit(limit=10)` LIST query** on `analysis_results`, NOT a latest-row `.limit(1)` accessor. There is no existing canonical single-latest-row accessor to model on. Worse, the duplicated latest-row pattern spans **3 different tables** (`resumes`, `linkedin_grades`, `analysis_results`), **two ordering columns** (`created_at` vs `analyzed_at`), heterogeneous `select()` column sets, divergent filters (`.not('grading_data','is',null)`, `.neq('id', …)`, `.eq('analysis_type', …)`), and divergent limits (`.limit(1)` / `.limit(4)` / `.limit(10)`) — and there are MORE `.limit(1)` sites than the 8-10 the CONTEXT list names (e.g. `ProtectedRoute.tsx:41`, `useScoreHistory.ts:55`, `useOnboardingStatus.ts:39`, `Upload.tsx:106/183`, `Auth.tsx:111`, `InterviewPrep.tsx:397`, `Onboarding.tsx:170`, `PriorAnalysisSelector.tsx:77`). A single naive accessor cannot cover all of them; the realistic, behavior-preserving H5 is a **parameterized per-table accessor (or 2-3 small ones) covering only the genuinely-identical-shape subset**, leaving the divergent sites as-is.

3. **The conditional `errors.ts` helper (D-04) evaluates to DEFER.** The rich 10-key `const ERR = { AUTH, INVALID_INPUT, … }` taxonomy from the RUN-03 spec **does NOT exist at HEAD**. What landed in Phase 7.1-03 is a single-line `const ERR = 'internal_error';` (a string literal) at each of the three swallow-fix sites (`compare-jobs/index.ts:340`, `recruiting-lens/index.ts:767`, `interview-prep-analyze/index.ts:718`). There is no per-function taxonomy map to DRY-extract, so the dependency condition ("verify the inline maps exist… else defer") resolves to **defer**. Extracting a shared module from three identical one-liners would be inventing an abstraction, which D-04 explicitly forbids.

The DB perf leg is the cleanest: Supabase's own advisor + official docs confirm the exact `(select auth.uid())` rewrite and additive-index patterns; the preview->prod gated model with per-migration rollback is already proven 4x in Phase 8 (`20260608000000..11_*.sql`). The measurement leg reuses two existing, battle-tested harnesses; the only new asset is a sibling probe for `analyze-career`, which returns a **plain JSON response** (`new Response(JSON.stringify(analysisResult), …)`), NOT SSE — a key shape difference from `analyze-resume`.

**Primary recommendation:** Slice into 4 plans — (1) H4 `analyze-resume`-only dedup; (2) H5 parameterized accessor over the identical-shape subset only; (3) DB perf migrations (auth_rls_initplan x62 + unindexed_foreign_keys x8 + the provable `multiple_permissive_policies` subset) through the preview->prod gate; (4) PERF-04 measurement (extend validate-performance.mjs + sibling analyze-career probe + reuse cache probe). **DEFER the `errors.ts` helper** with a one-line RESIDUAL-REGISTER note. Each plan re-runs `verify:baseline` as its behavior-preservation proof.

---

## Standard Stack

No new libraries. This phase edits existing code and authors SQL migrations using tooling already in the repo.

### Core (already present)
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.108.2 | Frontend latest-row queries (H5) + measurement-harness auth/SELECT | Already the only DB client |
| Deno + `std@0.168.0` | edge runtime | `result-merger.ts` / `recruiting-lens-merger.ts` (H4) | Existing edge stack |
| Supabase CLI | ^2.107.0 | `db push` for migrations (operator-applied to prod) | Existing deploy path |
| Supabase advisors (MCP `get_advisors`) | n/a | `type="performance"` re-check to prove the advisory delta | Phase-8 proven evidence mechanism |
| vitest 4 + deno test + Playwright 1.61 | per `package.json` | `verify:baseline` — the behavior-preservation gate | The locked proof spine |
| Node 22 `.mjs` harnesses | n/a | `validate-performance.mjs` + `staging-cache-perf-probe.mjs` (PERF-04) | Existing, battle-tested |

### Supporting (measurement)
| Asset | Purpose | When to Use |
|-------|---------|-------------|
| `scripts/validate-performance.mjs` | analyze-resume SSE wall-clock + cost; `--env`/`--runs`/`--cooldown`/`--warmup` | Resume Analysis end-to-end (reuse as-is) |
| `scripts/staging-cache-perf-probe.mjs` | `analysis_cache` single-key SELECT p50/p95 over >=30 runs; appends markdown evidence | The deterministic / cache-hit clean signal (reuse) |
| `scripts/test-resumes/{short,medium,long}.txt`, `Profile.pdf` | fixtures the resume harness loads | analyze-resume + the new career probe input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `validate-performance.mjs` in place for career | A sibling `validate-career-performance.mjs` | **Recommend the sibling** — analyze-career returns JSON not SSE, the harness's SSE reader (`measureRun` :246-301) doesn't fit; a sibling avoids forking the SSE path and keeps the resume harness untouched (cleaner diff, lower regression surface). This is Claude's-discretion per D-02. |
| Re-using `parseAndValidateCall` return in H4 | Plumb the parsed `data` from the retry loop into the merge | Sound but **higher blast radius** — changes `executeParallelCalls`'s return type + the merit/queue callers. A smaller H4 caches the parse inside the merger or has `executeParallelCalls` return parsed results; see `<code_examples>` for the minimal shape. |

**Installation:** none.

---

## Architecture Patterns

### Where the work lives
```
supabase/functions/
├── _shared/result-merger.ts          # H4 target: parseAndValidateCall (:290-332), invoked :462-468/:487/:498
├── _shared/recruiting-lens-merger.ts # H4 NON-target: parseCallResult :130-132 (single parse — leave byte-identical)
├── analyze-resume/index.ts           # H4 redundancy site: parseAndValidateCall at :406 (discards data) + :430 retry
src/
├── lib/                              # H5 NEW home for the shared accessor(s) (NOT analysisHelpers.ts:134 — that's a list query)
├── pages/ + components/ + hooks/     # H5 call sites (3 tables, see Don't-Hand-Roll table below)
supabase/migrations/
└── YYYYMMDDHHMMSS_*.sql              # DB perf migrations (auth_rls_initplan / FK indexes / permissive consolidation)
scripts/
├── validate-performance.mjs          # PERF-04 resume (reuse)
├── staging-cache-perf-probe.mjs      # PERF-04 deterministic (reuse)
└── validate-career-performance.mjs   # PERF-04 career (NEW sibling — recommended)
```

### Pattern 1: DB migration shape (forward + verification + rollback in one file)
**What:** Every Phase-8 migration is a single `.sql` with a `-- FORWARD`, an optional read-only `DO $$ … RAISE EXCEPTION` verification assertion, and a `-- ROLLBACK` block (commented). Idempotent (`IF EXISTS` / `IF NOT EXISTS`).
**When to use:** Every DB perf migration this phase.
**Example:** see `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql` (read in full) — header documents LIVE-CATALOG FACT, the D-03 read-map "why zero-observable", a `DO $$` assertion, and a commented ROLLBACK. Mirror this exact structure.

### Pattern 2: preview->prod 4-step gate (proven 4x in Phase 8)
**What:** apply-preview (`supabasepreview` MCP `apply_migration`) -> verify-preview (`get_advisors` delta + SELECT-as-role no-regression) -> **operator applies to prod via `db push`** -> re-verify-prod read-only (`supabase-prod-readonly` `get_advisors`/`pg_policies`). The executor invokes **NO MCP tool against prod** and **applies nothing to prod**.
**When to use:** Every DB perf migration. The plan's DB tasks should be `autonomous:false` at the operator-applies-prod checkpoint.

### Pattern 3: signal isolation for AI-flow measurement
**What:** Measure the deterministic/cache-hit path (`staging-cache-perf-probe.mjs`, p95 over >=30-100 runs) as the clean regression signal; measure end-to-end (`validate-performance.mjs` median + p95 over >=5 runs/tier, warmup discarded) only to satisfy the "user-facing flow didn't regress" mandate. The AI-call variance band (~35-56s observed by tier/length per README) swamps the few-ms deterministic delta H4/H5/RLS produce.

### Anti-Patterns to Avoid
- **Touching `recruiting-lens-merger.ts` for "H4 parity."** It has no double-parse; editing it is pure risk. Leave byte-identical.
- **A single all-tables H5 accessor.** The 3-table / 2-ordering-column / divergent-filter spread means one signature cannot preserve every page's contract. Reconcile and cover only the identical-shape subset.
- **Re-creating an owner policy when consolidating permissive policies.** Phase 8 caught exactly this (`20260608000008` first form): a redundant CREATE leaves `multiple_permissive_policies` still lit and can trip the verification DO-block. Prefer DROP-of-the-superseded-policy when an equivalent survivor already exists.
- **Inventing `_shared/errors.ts` from three identical `const ERR = 'internal_error'` one-liners.** That is a new abstraction (D-04 OUT), not a DRY of an existing taxonomy.
- **Dropping `unused_index` on near-empty-prod stats.** Locked DEFER (D-03 / Phase-8 D-11).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RLS per-row `auth.uid()` re-eval (x62) | A custom function or trigger | Supabase-recommended `(select auth.uid())` scalar-subselect wrap | Official, zero-observable; planner hoists to a single initPlan (benchmarked ~95% faster). Same row visibility. |
| FK without covering index (x8) | Query rewrites | Additive `CREATE INDEX IF NOT EXISTS … ON <table>(<fk_col>)`; `DROP INDEX` rollback | Purely additive; zero behavior change |
| Measuring AI-flow latency cleanly | A new timing framework | The two existing `.mjs` harnesses + the median/p95 stats helper already in `staging-cache-perf-probe.mjs` (`percentile`/`stats` :150-175) | Proven, reuse the percentile math |
| Career-flow JSON response parsing | Bolting SSE parsing onto the career probe | A sibling probe that reads the JSON body (career returns `new Response(JSON.stringify(...))`) | analyze-career is NOT SSE; the resume harness's SSE reader doesn't apply |

### The H5 call-site map (the data the planner needs to design the accessor)

| # | Site (file:line) | Table | `select()` columns | Filters beyond `eq(user_id)` | Order col | Limit | Terminal |
|---|------------------|-------|--------------------|------------------------------|-----------|-------|----------|
| 1 | `LinkedInGrader.tsx:280-284` | `linkedin_grades` | `id, overall_score, grading_data, created_at, profile_url` | — | created_at | 1 | (array) |
| 2 | `SkillsGapAnalysis.tsx:170-175` | `resumes` | `grading_data` | — | created_at | 1 | (array) |
| 3 | `SkillsGapAnalysis.tsx:288-293` | `resumes` | `grading_data` | — | created_at | 1 | (array) |
| 4 | `CareerCompass.tsx:304-310` | `resumes` | `file_path, file_name` | — | created_at | 1 | `.single()` |
| 5 | `CareerCompass.tsx:313-320` | `analysis_results` | `*` | `eq('analysis_type','career_compass')` | created_at | 1 | `.maybeSingle()` |
| 6 | `RecruitingLens.tsx:359-366` | `resumes` | `file_name, grading_data` | `.not('grading_data','is',null)` | **analyzed_at** | 1 | `.maybeSingle()` |
| 7 | `RecruitingLens.tsx:378-385` | `analysis_results` | `raw_response, source_reference` | `eq('analysis_type','resume_analysis')` | created_at | 1 | `.maybeSingle()` |
| 8 | `Profile.tsx:136-141` | `resumes` | `file_name` | — | created_at | 1 | (array) |
| 9 | `PriorLinkedInSelector.tsx:90-95` | `linkedin_grades` | `id, overall_score, grading_data, created_at, profile_url` | — | created_at | **10 (list)** | (array) |
| 10 | `DashboardHome.tsx:45-51` | `resumes` | `id, file_name, overall_score, created_at` | — | created_at | **4 (list)** | (array) |
| 11 | `AnalysisComparisonModal.tsx:263-270` | `resumes` | `id, overall_score, grading_data, created_at, file_name` | `.not('grading_data','is',null)`, `.neq('id', current)` | created_at | **10 (list)** | (array) |
| 12 | `AnalysisComparisonModal.tsx:280-286` | `linkedin_grades` | `id, overall_score, grading_data, created_at` | `.neq('id', current)` | created_at | **10 (list)** | (array) |

**Plus latest-row sites NOT named in the CONTEXT H5 list (also duplicate the pattern — surface is bigger):** `ProtectedRoute.tsx:41`, `useScoreHistory.ts:55`, `useOnboardingStatus.ts:39`, `Upload.tsx:106` + `:183` (both `analyzed_at`), `Auth.tsx:111`, `InterviewPrep.tsx:397` (`analyzed_at`), `Onboarding.tsx:170`, `PriorAnalysisSelector.tsx:77` (`analyzed_at`, `nullsFirst:false`), `Dashboard.tsx:239/284/298`.

**Realistic H5 design (behavior-preserving):** a small parameterized accessor `getLatestRows({ table, columns, userId, orderBy='created_at', limit=1, extraFilters?, terminal? })` OR (cleaner) **2-3 narrow helpers grouped by genuine identical shape** — e.g. (a) "latest resume row, `created_at` desc, `.limit(1)`" covers #2/#3/#4/#8 (but #4 selects different columns + `.single()` — parameterize columns + terminal), (b) "latest linkedin_grade row" covers #1, (c) the **list** queries (#9/#10/#11/#12) are a DIFFERENT class (`.limit(N>1)`, `.neq`, `.not`) — do NOT fold them into a "latest-row" helper. **The honest clarity win is collapsing the identical resume-`created_at`-`.limit(1)` reads (#2/#3/#8, and #4 if columns/terminal parameterized).** Sites #5/#6/#7 (different table/order/filter) and the list queries stay separate unless the planner proves identical shape. Each consolidated call must return the **exact** columns the page consumes (verify each downstream destructure before changing its `select`).

---

## Common Pitfalls

### Pitfall 1: H4 "fix" that changes the merged-schema contract
**What goes wrong:** The merged `grading_data` (resume) or `RecruitingLensOutput` differs by even a field/order, breaking the SSE `complete` payload the frontend parses.
**Why it happens:** Reordering normalize/strip/validate, or sharing a parse result that skipped a step (e.g. `normalizeAliases` at :306 or `stripUnknownFields` at :309).
**How to avoid:** Keep `parseAndValidateCall` byte-for-byte; only avoid calling it *twice* on the same buffer. The safest shape: have `executeParallelCalls` return the already-parsed validated `data` (it computes it at :406 anyway) and pass that to a merge variant that skips re-parse — OR memoize within the merger. Prove neutrality with `npm run test:edge` (the merger has unit coverage) + the deterministic measurement.
**Warning signs:** `_mergeSource` changes, `verify:baseline` deno leg goes red, or the resume harness's `_mergeSource !== 'parallel-3'` warning fires.

### Pitfall 2: H5 accessor silently changes a page's received columns
**What goes wrong:** A page that did `.select('grading_data')` now gets `.select('*')` (or vice-versa), changing payload bytes / a downstream `data[0].X` read, or a `.single()` site gets an array.
**Why it happens:** Over-generalizing the accessor; ignoring the terminal (`.single()` vs `.maybeSingle()` vs array) and the per-site column set in the table above.
**How to avoid:** Parameterize `columns` + `terminal` + `orderBy`; change ONE call site at a time; re-run `verify:baseline` + the relevant Playwright flow after each. Treat `.limit(N>1)` list queries as out of the "latest-row" accessor.
**Warning signs:** A page renders `undefined`, a `.single()` site throws on 0 rows where it previously used `.maybeSingle()`.

### Pitfall 3: `multiple_permissive_policies` consolidation that alters access
**What goes wrong:** Merging two permissive policies into one whose `USING` is NOT the exact OR of the originals silently broadens or narrows access.
**Why it happens:** Assuming overlap; not running SELECT-as-role.
**How to avoid:** For each candidate, read both policies' `qual` via `pg_policies` on preview; only consolidate when `merged.qual` is provably `(orig1.qual) OR (orig2.qual)` for the same roles+cmd. Run the preview SELECT-as-role no-regression probe (owner sees own rows; non-owner sees 0) — exactly the Phase-8 `20260608000008` proof. **Note the prod caveat:** `supabase-prod-readonly` lacks `SET ROLE` ("permission denied to set role authenticated"), so SELECT-as-role runs on **preview only**; prod is proven by `pg_policies` end-state parity. Defer any policy where the OR-equivalence isn't provable.
**Warning signs:** advisor count doesn't drop by the expected delta, or preview/prod `pg_policies` end-states differ.

### Pitfall 4: measuring on prod, or treating AI variance as signal
**What goes wrong:** Running the resume harness `--env production` (off-limits + near-empty, meaningless), or claiming a "win" inside the ~35-56s AI noise band.
**How to avoid:** `--env staging` only (D-02). Separate the deterministic probe (the real signal). Require any claimed improvement to clear the run-to-run variance band; otherwise report "no regression, no claimable gain."

### Pitfall 5: `.ps1` non-ASCII / broad git-add
**What goes wrong:** If `deploy.ps1` is touched, em-dashes/box-drawing break Win PowerShell 5.1 parsing; broad `git add` sweeps Milkdown-reformatted `.md` or `.gitignore`d files.
**How to avoid:** Keep `.ps1` pure-ASCII (verify `grep -c $'\xe2'` = 0). Stage specific files; never `-A`/`.`/`-f`. (Project memory.)

---

## Code Examples

### H4 — the genuine double-parse (analyze-resume only)
```typescript
// supabase/functions/analyze-resume/index.ts:399-434  (executeParallelCalls retry loop)
// FULL parseAndValidateCall runs here purely to decide retry — parsed `data` is DISCARDED:
const validation = result.ok ? parseAndValidateCall(result.callType, result.text, params.isElite) : null;
const outputInvalid = !!validation && !validation.ok;            // <- only .ok kept
// ... returns { callType, ok, text } (RAW text), data thrown away.

// supabase/functions/analyze-resume/index.ts:879-884  (after retries settle)
const rawResults = Object.fromEntries(
  parallelResults.filter((r): r is ParallelCallResult => r.ok).map(r => [r.callType, r.text]) // RAW text again
) as Record<CallType, string>;
const mergeResult = mergeAndValidateResults(rawResults, resolvedTier);  // <- re-parses each (2nd time)

// supabase/functions/_shared/result-merger.ts:462-468  (inside mergeAndValidateResults)
for (const callType of callTypes) {
  const result = parseAndValidateCall(callType, rawResults[callType], tier === 'elite'); // SAME buffer, parsed AGAIN
  ...
}
```
**Minimal behavior-preserving dedup options (planner picks):**
- **(A) Return parsed results from `executeParallelCalls`** for the non-retried path and add a `mergeValidated(parsed)` entry that skips the per-call `parseAndValidateCall` (re-using the existing concatenate/spread/fold/`fillDefaults`/`applyTierShape` tail unchanged). Largest clarity win; touches the return type + 2 callers (merit path :884, queue path :1017, plus the free-single path).
- **(B) Memoize inside the merger** keyed by the raw string identity (smallest diff; the redundancy across the retry-loop/merge boundary remains since they're separate calls — only helps if the same buffer is parsed twice *within* the merge, which it is not). **(A) is the real win; (B) does not address the cross-boundary double-parse.**
- Either way, **`parseAndValidateCall`'s internal pipeline stays byte-identical**; the contract proof is `npm run test:edge` (merger units) + deterministic measurement.

### H4 — recruiting-lens is NOT redundant (leave alone)
```typescript
// supabase/functions/recruiting-lens/index.ts:418-434  — retry loop only retries on HTTP failure:
const retryPromises = results.map(async (result, i) => {
  if (result.ok) return result;          // <- NO upstream parse; parseCallResult runs once, in the merger.
  ...
});
// => recruiting-lens-merger.ts:130-132 parseCallResult runs exactly once per call. No double-parse. Do not touch.
```

### DB — auth_rls_initplan rewrite (the x62 fix)
```sql
-- Source: Supabase RLS performance docs (verified 2026-06-24).
-- BEFORE (per-row re-eval, advisor auth_rls_initplan fires):
--   USING ( auth.uid() = user_id )
-- AFTER (single initPlan, zero-observable, same visibility):
--   USING ( (select auth.uid()) = user_id )
-- Also applies to current_setting(...) and any auth.* / role() call inside USING/WITH CHECK.
-- Forward: DROP+CREATE (or ALTER) each affected policy with the wrapped form.
-- Rollback: restore the unwrapped form captured read-only from pg_policies.
-- Enumerate the 62 via get_advisors(type="performance") (lint auth_rls_initplan) +
--   SELECT schemaname,tablename,policyname,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public';
-- Affected tables (names only, from RUNTIME-RELIABILITY.md): profiles, resumes, linkedin_grades, analysis_jobs, ...
```

### DB — unindexed_foreign_keys (the x8 fix, additive)
```sql
-- Source: Supabase advisor unindexed_foreign_keys + RLS-index guidance.
-- Affected tables (names only): applications, interview_quizzes, linkedin_versions,
--   resume_score_history, resume_versions (8 FK columns total — enumerate via get_advisors).
CREATE INDEX IF NOT EXISTS idx_<table>_<fk_col> ON public.<table> (<fk_col>);
-- Rollback: DROP INDEX IF EXISTS idx_<table>_<fk_col>;
-- Purely additive: zero behavior change, only plan/perf.
```

### DB — migration file template (mirror Phase-8 shape)
```sql
-- <REQ tag> (<Plan>, <tier>): <one-line intent>. <names-not-values>.
-- LIVE-CATALOG FACT (re-confirmed read-only on preview AND prod): <pg_policies/pg_indexes facts>
-- D-03 read-map (why zero-observable for every live caller): <rg evidence>
-- ── FORWARD ──
<idempotent DDL>
-- ── VERIFICATION (read-only assertion) ──
DO $$ DECLARE v_count int; BEGIN
  SELECT count(*) INTO v_count FROM pg_policies WHERE ...;  -- assert expected end-state
  IF v_count <> <expected> THEN RAISE EXCEPTION '...'; END IF;
END $$;
-- ── ROLLBACK (DB-06) ──  (commented; faithfully restores prior live state)
```

### PERF-04 — career sibling probe (the JSON, not SSE, difference)
```javascript
// analyze-career returns a PLAIN JSON body, NOT SSE:
//   supabase/functions/analyze-career/index.ts:1074-1075  -> new Response(JSON.stringify(analysisResult), ...)
// So the career probe POSTs the JSON contract and reads response.json() (no SSE line parser).
// Request fields (from index.ts:790): { resumeTextContent, userId, linkedinUrl?, resumeFilePath?,
//   linkedinPdfContent?, compareRoles?, existingAnalysis?, allowResumeOnly? }
// resumeTextContent accepts text directly (index.ts:1081) — feed scripts/test-resumes/{short,medium,long}.txt.
// Reuse from validate-performance.mjs: ENV_CONFIGS (:45-56), authenticate() (:170-190),
//   the CLI/--runs/--cooldown/--warmup scaffold, and the percentile/stats helpers from
//   staging-cache-perf-probe.mjs (:150-175) for median + p95.
// A cache-hit (short-circuit) career run exercises the deterministic path (index.ts ~:958 short-circuit branch).
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Proof = `git diff` empty (Phases 7/7.1/8) | Proof = behavior preserved despite edits (`verify:baseline` green + PERF-04 + per-DB no-regression + rollback) | Phase 9 (first product-code-editing phase) | Plans must run `verify:baseline` and capture before/after, not assert an empty diff |
| RLS `auth.uid() = user_id` | `(select auth.uid()) = user_id` | Supabase advisor `auth_rls_initplan` | Zero-observable; single initPlan per query |
| Preview project PAUSED (all of v4.0) | Preview `cimjltzovkahkqecpwgi` UNPAUSED (2026-06-24) | This phase | Enables the preview-first SELECT-as-role + RPC probes the DB leg needs |

**Deprecated/outdated:**
- The PERF-HOTSPOTS/CONTEXT claim that `analysisHelpers.ts:134` is "the only consolidated latest-row accessor" — it is a `.limit(10)` list query (`getAnalysisHistory`), not a latest-row model. Do NOT treat it as the H5 template.
- The RUN-03 spec's 10-key `const ERR` taxonomy — **never landed**; HEAD has only `const ERR = 'internal_error'`.

---

## Open Questions

1. **H4 dedup shape (A vs B).**
   - Known: the double-parse is real and analyze-resume-only; the merger's internal pipeline must stay byte-identical.
   - Unclear: whether to plumb parsed results out of `executeParallelCalls` (option A, real win, touches return type + ~3 callers) or accept that a within-merge memoization (B) does NOT remove the cross-boundary double-parse.
   - Recommendation: **Option A**, scoped to analyze-resume only; prove with `test:edge` + deterministic measurement. If A's blast radius feels too large for "safe wins only," the honest fallback is to document H4 as "redundancy confirmed, minimal-safe dedup applied to the streaming path" or defer — flag for operator at plan time.

2. **H5 accessor granularity.**
   - Known: 3 tables, 2 ordering columns, divergent columns/filters/terminals/limits; >12 sites; no existing latest-row model.
   - Unclear: how many helpers (one parameterized vs 2-3 narrow) and which subset is "provably identical shape."
   - Recommendation: consolidate ONLY the resume-`created_at`-`.limit(1)` identical subset (#2/#3/#8, +#4 with parameterized columns/terminal); leave list queries (#9-#12) and divergent-shape sites (#5/#6/#7, analyzed_at sites) as-is. Per-site `verify:baseline` + Playwright after each swap.

3. **`multiple_permissive_policies` consolidable subset (x48).**
   - Known: affected objects = improvement_checklist, linkedin_grades, resumes, upgrade_requests, user_roles; the rule is "merged = exact OR of originals."
   - Unclear: which of the 48 pass the bar (needs per-policy `pg_policies` read on preview at plan/exec time).
   - Recommendation: enumerate on preview during execution; consolidate only provable ones (likely a minority); defer the rest to RESIDUAL-REGISTER. Note `linkedin_grades`'s permissive entry was already cleared in Phase-8 `20260608000008` (2 SELECT -> 1) — re-check current advisor list so the x48 isn't double-counted.

4. **Advisory count drift (x41 vs x42 for `unused_index`).**
   - Known: STATE.md + CONTEXT say x41; RUNTIME-RELIABILITY.md row says x42.
   - Impact: none — `unused_index` is DEFERRED either way. Re-pull `get_advisors(type="performance")` at plan time for the authoritative live counts (auth_rls_initplan / multiple_permissive / unindexed_fk) before authoring migrations; counts drift only after DDL.

5. **`errors.ts` helper condition — RESOLVED to DEFER.**
   - Verified at HEAD (`be39c0e3`): the rich `const ERR = { AUTH, … }` taxonomy does NOT exist; only `const ERR = 'internal_error';` at `compare-jobs:340` / `recruiting-lens:767` / `interview-prep-analyze:718`. No taxonomy map to DRY.
   - Recommendation: **DEFER** with a one-line RESIDUAL-REGISTER note (the 7.1 D-04 candidate's precondition isn't met; extracting from three one-liners is a new abstraction, D-04 OUT). PERF-03's in-scope clarity win is therefore H5 only.

---

## Sources

### Primary (HIGH confidence)
- Repo code @ `staging` `be39c0e3` (read in full or at anchors): `_shared/result-merger.ts`, `_shared/recruiting-lens-merger.ts`, `analyze-resume/index.ts` (:340-438, :805-894, :951-1020), `recruiting-lens/index.ts` (:418-470, :597-598/:721-722), `analyze-career/index.ts` (:125-149, :789-790, :958, :1020-1075), `src/lib/analysisHelpers.ts`, the 12 H5 call sites + the additional `.limit(1)` sites, `scripts/validate-performance.mjs`, `scripts/staging-cache-perf-probe.mjs`, `supabase/migrations/20260608000008_linkedin_grades_owner_select.sql`.
- `.planning/audit/PERF-HOTSPOTS.md` (H1-H5 anchors + classifications), `.planning/audit/RUNTIME-RELIABILITY.md` (perf-advisory rows + Phase-8 resolution evidence + RUN-03 taxonomy spec), `.planning/phases/09-.../09-CONTEXT.md` (locked decisions), `.planning/REQUIREMENTS.md` (PERF-02/03/04), `.planning/STATE.md` (Phase-8 close-out, perf-class routing, exact counts), `TESTING-STRATEGY.md` (`verify:baseline` gate).
- Supabase official RLS performance docs — `(select auth.uid())` initPlan pattern + RLS-column indexing — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase database advisors (auth_rls_initplan lint) — https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0003_auth_rls_initplan

### Secondary (MEDIUM confidence, verified against official)
- Supabase troubleshooting: RLS Performance & Best Practices — https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv

### Tertiary (LOW — corroboration only)
- DEV community write-up on the auth.uid() init-plan trap (a bulk-rewrite migration example) — https://dev.to/arvavit/76-rls-policies-rewritten-in-one-migration-the-authuid-init-plan-trap-in-supabase-4hg

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all assets read directly.
- H4 (architecture): HIGH — double-parse confirmed by reading the actual call chain in analyze-resume; recruiting-lens confirmed single-parse.
- H5 (architecture): HIGH for the call-site map; MEDIUM for the optimal accessor granularity (a design call left to the planner).
- DB perf migrations: HIGH — pattern verified against Supabase official docs + 4 proven Phase-8 analog migrations; live counts to be re-pulled at plan time.
- Measurement (PERF-04): HIGH — both harnesses read in full; career JSON-vs-SSE shape confirmed.
- Pitfalls: HIGH — drawn from Phase-8 gate-catch evidence + the verified contracts.
- `errors.ts` condition: HIGH — definitively verified absent at HEAD via two ripgrep passes.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 for the code findings (re-anchor line numbers if `staging` advances); re-pull `get_advisors(type="performance")` live counts at plan/exec time (drift only on DDL).
