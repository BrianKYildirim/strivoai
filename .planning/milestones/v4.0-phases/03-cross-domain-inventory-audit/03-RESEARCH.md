# Phase 3: Cross-Domain Inventory & Audit - Research

**Researched:** 2026-06-13
**Domain:** Read-only multi-domain codebase audit (dead-code, deps, env, DB, perf) — tooling + technique, not measurement
**Confidence:** HIGH (tooling verified in-environment; codebase facts verified by direct inspection; the few MEDIUM/LOW items are flagged inline)

---

<user_constraints>
## User Constraints (from 03-CONTEXT.md)

These are LOCKED by `/gsd:discuss-phase`. The planner MUST honor them verbatim. Research below answers the *HOW*, never relitigates the *WHAT*.

### Locked Decisions (D-01 … D-12)

- **D-01 — npx + committed config/scripts, NO new devDependencies.** Run audit tools (knip/ts-prune/depcheck-equivalent) via `npx` so nothing is added to `package.json`. BUT commit lightweight config (`knip.json`) and `npm run audit:*` scripts so Phases 4/6/8 re-run the *exact same* audit. Exact tool selection (knip can cover dead files/exports AND unused deps in one pass; ts-prune may be redundant) left to research/planning. Strong preference for fewest tools covering the most ground.
- **D-02 — Online registry lookup allowed for the inventory.** `npm outdated` / npm registry online is permitted to record current-vs-latest + major-bump candidates (one-time read, not the per-PR test gate). Deno remote-import "latest" handled analogously where feasible.
- **D-03 — Per-domain evidence docs + a short index.** One doc per domain (`DEAD-CODE.md`, `DEPENDENCIES.md`, `ENV-INVENTORY.md`, `DATABASE.md`, `PERF-HOTSPOTS.md`) + an `INDEX.md`/`README.md`. Mirrors Phase 2's `02-SECRET-SCAN.md` evidence pattern; five distinct downstream consumers (Phases 4/6/7/8/9) each read only their domain doc. Exact filenames final at planning.
- **D-04 — Durable `.planning/audit/` location.** Catalogs are milestone-level living reference at a fixed path, NOT phase-local artifacts. They survive independent of the phase-3 dir. `.planning/` IS tracked — commit normally with specific file paths.
- **D-05 — Three-tier classification: `safe` / `unsafe` / `needs-investigation`.** Downstream phases act only on `safe`; `needs-investigation` must be resolved before any removal.
- **D-06 — Conservative confidence bar.** Classify `safe` ONLY when multiple independent signals agree — static tool flags it AND grep/search finds no dynamic/string reference AND no external-caller/entrypoint path exists AND it isn't feature-flag/gated. Anything short of full agreement → `needs-investigation`. A false positive here becomes a broken prod path in Phase 4/8.
- **D-07 — First-class enumerated keep-list.** A dedicated section every domain catalog cross-references, documenting the classes static analysis WILL wrongly flag dead: feature-flagged Interview Prep (`VITE_FEATURE_INTERVIEW_PREP`), Paddle-gated remnants (`paddle_*` columns, `paddle-webhook`), edge functions invoked by name/webhook/cron, dynamic/string-keyed imports, deprecated-but-still-imported components (`LockedSection`/`LockedListItem`/`ProFeatureBlur`).
- **D-08 — Re-verify already-named cleanup targets NOW + record evidence:** obsolete Phase 50 Ollama extraction path (vs Phase 51 parser-first); retired `interview-prep-coach` (no repo source — confirm deployment via `supabase functions list`); `usage_tracking` dual read/write call map; Paddle remnants + gating.
- **D-09 — Triangulate DB inventory from THREE sources:** `supabase/migrations/` (declared intent) + code references (call sites) + live read-only catalog introspection (what's actually in the DB now). Migrations-only is blind to dashboard-made drift.
- **D-10 — Production is the source of truth for live introspection, strictly read-only, OPERATOR-GATED.** Prod is the only environment whose "unused" evidence means unused-in-production (the TEST project `cimjltzovkahkqecpwgi` is schema-drifted/synthetically-seeded). Restricted to read-only catalog/stat queries (`information_schema`, `pg_catalog`, `pg_stat_*`); ZERO writes. The plan must treat live-prod queries as an operator step, not an autonomous write path.
- **D-11 — Include runtime stats where available** (`pg_stat_user_tables` / row counts / `pg_stat_statements` where enabled) with caveats recorded explicitly (counters reset on restart; `pg_stat_statements` may be disabled).
- **D-12 — PERF-01 is a STATIC / code-review catalog ONLY.** Suspected hotspots documented; no measurement (measurement is Phase 9 / PERF-04).

### Claude's Discretion

Exact tool selection per domain (knip vs ts-prune vs both; depcheck vs knip's dep coverage; the Deno reachability technique), precise catalog filenames + internal schema/columns, the `npm run audit:*` script names/shape, the exact set of read-only catalog queries, and the finding-record format inside each domain doc — all left to research + planning, consistent with the decisions above.

### Deferred Ideas (OUT OF SCOPE)

- Lightweight performance measurement / hotspot ranking — that's Phase 9 (PERF-04). Phase 3 is static catalog only (D-12).
- Acting on ANY finding (removing dead code, pruning/bumping deps, consolidating env, dropping DB structures, applying perf refactors) — that's Phases 4/6/7/8/9. This phase only catalogs + classifies.
- Mechanical/CI enforcement of the audit (failing CI on new dead code) — not in scope; `audit:*` scripts are re-runnable on demand, CI wiring is later/optional.
- Dead CSS / asset / static-file audit, public-vs-internal export policy nuance — possible gray areas; foldable into `DEAD-CODE.md` at planner discretion if cheap, else a future pass.
</user_constraints>

---

## Summary

This is a **tooling-and-technique** research, not a library-stack research: the phase has no runtime stack to choose — it produces five evidence catalogs. Every claim below was verified by running the actual tools and inspecting the actual repo on this machine (Windows + PowerShell, with `deno 2.7.1`, `supabase` CLI `2.100.1` local, `npm`, and `npx knip@6.16.1` all confirmed working).

The single hardest part — and the one the planner should budget most for — is **Deno edge-function reachability** (CLEAN-01's hard half + the keep-list). knip/ts-prune are Node/npm tools and **do not analyze Deno**. The reliable substitute is **`deno info --json <entrypoint>`**, which emits a complete machine-parseable module graph (verified: `modules[].specifier` as `file://` URLs). Union the graphs of all *deployed* function `index.ts` entrypoints; any file under `supabase/functions/_shared/` (or any orphan function dir) **not** in that union is a dead-code candidate. This must be cross-checked against `supabase functions list` (deployed-but-no-source detection, e.g. `interview-prep-coach`) and the keep-list (functions invoked by name/webhook/cron are reachable-but-not-frontend-imported).

The biggest **false-positive landmine**, confirmed live, is the env inventory: literal-string grep of `Deno.env.get("…")` **misses dynamically-constructed keys**. The Stripe *subscription* price IDs (`STRIPE_PRICE_PRO_MONTHLY`, etc.) are read via template literals `STRIPE_PRICE_${tier}_${interval}` in `price-resolver.ts`, so a naive grep finds them **only in test files** and would falsely flag them unused. Any "unused env var" classification must therefore also scan for template-literal key construction, and the actual env surface (~57 distinct `Deno.env.get` names) is far larger and messier than `.env.example` (~15) documents.

**Primary recommendation:** Use **knip (single tool, via `npx`, with a committed `knip.json`)** for the entire React side — it covers dead files, unused exports, AND unused/unlisted dependencies in one pass, replacing the need for ts-prune *and* depcheck. Use **`deno info --json` graph-union** for Deno reachability. Triangulate DB from migrations + `deno info`/grep call-sites + an **operator-run read-only SQL pack** (delivered as a committed `.sql` file the operator pastes into the Supabase prod SQL editor, results pasted back into `DATABASE.md`). Treat the keep-list (D-07) as a *gate applied after every static pass*, never an afterthought.

---

## Standard Stack

"Stack" here = the audit toolchain. All are invoked via `npx` (D-01: zero new devDeps); only config + `npm run audit:*` scripts get committed.

### Core (verified working in-environment)

| Tool | Version | Invocation | Purpose | Why this one |
|------|---------|------------|---------|--------------|
| **knip** | 6.16.1 (latest, ran clean via `npx --yes knip`) | `npx --yes knip` + committed `knip.json` | React/Vite dead files, unused **exports**, unused **deps**, unlisted deps, unused env-ish — one pass | Covers ts-prune's job (unused exports) AND depcheck's job (unused/unlisted deps) simultaneously. Native Vite + path-alias + Vitest plugin support. Fewest-tools-most-ground (D-01). |
| **deno info** | deno 2.7.1 (built-in) | `deno info --json supabase/functions/<fn>/index.ts` | Deno module-graph reachability (the `_shared` dead-code + orphan-function detector) | knip/ts-prune cannot read Deno's `https://`/`npm:`/`jsr:` imports. `deno info` is the only tool that resolves the *actual* Deno graph including std-version drift. JSON output = scriptable union. |
| **supabase CLI** | 2.100.1 local / 2.106.0 latest | `npx supabase functions list --project-ref <ref>` | Deployed-function reality vs repo source (D-08 `interview-prep-coach`) | The only way to detect deployed-but-no-source drift. |
| **npm (built-in)** | npm 10+ | `npm outdated --json`, `npm ls --all --json`, `npm audit --json` | Frontend dependency inventory: current/wanted/latest, dependency tree (consumers), vuln signal | D-02 explicitly allows registry online; `--json` is parse-friendly. (Verified: 9 vulns present — 5 moderate, 4 high — useful DEP-01 risk signal handed to Phase 6.) |
| **ripgrep (`rg`)** | present (project standard) | `rg` patterns below | Call-site / consumer mapping, dynamic-reference detection, env-var enumeration | Project already standardizes on `rg` (CLAUDE.md). The corroborating signal for D-06's multi-signal bar. |

### Supporting

| Tool | Invocation | Purpose | When to use |
|------|------------|---------|-------------|
| **ts-prune** | `npx ts-prune` | Second-opinion on unused exports | OPTIONAL. Only if knip's `exports` results need cross-checking. Likely redundant (D-01 anticipates this) — recommend **skip** unless a specific export class is disputed. |
| **deno check / lint** | `deno check`, `deno lint` | Surfaces unused locals/imports *inside* a reachable Deno file | Complements `deno info` (which is file-granularity); use for intra-file dead exports in `_shared`. |
| **psql** (operator) | `psql "$PROD_CONN" -f audit/queries/db-introspection.sql -o out.txt` | Alternative to SQL-editor for the read-only DB pack (D-10) | Only if the operator prefers CLI over the Supabase dashboard SQL editor. Both are valid; SQL editor is the lower-friction default. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| knip (deps coverage) | **depcheck** | depcheck is deps-only; you'd still need ts-prune for exports and knip for dead files. knip subsumes both → fewer tools (D-01). Keep depcheck name in `DEPENDENCIES.md` as the "equivalent" DEP-02 will run, but don't add it as a tool here. |
| knip (exports) | **ts-prune** | ts-prune is exports-only and is in maintenance mode; knip is actively maintained and does the same + more. |
| `deno info` graph-union | hand-maintained import map | The repo has NO central import map (`deno.json` has `"imports": {}` and `"lock": false`, verified) — imports are inline per-function. A hand map would drift. `deno info` reads ground truth. |
| Live prod introspection | TEST-project introspection | TEST project (`cimjltzovkahkqecpwgi`) is schema-drifted + synthetically seeded (D-10, STATE.md) — its "unused" signal is meaningless. Prod is the only valid source; TEST is at most a structural cross-check. |

**Installation:** None. Everything runs via `npx`/built-ins. The *only* committed artifacts are `knip.json`, the `audit:*` npm scripts, and the operator SQL pack (`.planning/audit/queries/*.sql` or `scripts/audit/*.sql`).

---

## Architecture Patterns

### Recommended catalog layout (`.planning/audit/`, D-03/D-04)

```
.planning/audit/
├── INDEX.md            # entry point: domain→doc map, run-date, how to re-run, KEEP-LIST pointer
├── KEEP-LIST.md        # D-07 enumerated false-positives — every domain doc cross-references this
├── DEAD-CODE.md        # CLEAN-01 (React knip + Deno deno-info reachability)
├── DEPENDENCIES.md     # DEP-01 (npm + Deno imports, current/latest, consumers, risk)
├── ENV-INVENTORY.md    # ENV-01 (VITE_* + edge secrets, consumer/env/required)
├── DATABASE.md         # DB-01 + DB-02 (migrations × code × live-introspection)
├── PERF-HOTSPOTS.md    # PERF-01 (static suspected hotspots, no measurement)
└── queries/
    └── db-introspection.sql   # the operator-run read-only pack (D-09/D-10/D-11)
```

Re-runnable tooling (committed at repo root / in `scripts/`):
```
knip.json                       # committed config (D-01)
scripts/audit/deno-reachability.* # the deno info graph-union runner (PowerShell + node, cross-platform)
package.json → "audit:*" scripts
```

### Pattern 1: knip single-pass for the React side (CLEAN-01 + DEP-01 frontend)

**What:** One `knip.json` + `npx --yes knip` gives dead files, unused exports, unused deps, and unlisted deps. **When:** the entire `src/` audit.

```jsonc
// knip.json — STARTER SHAPE (planner to finalize). Verified: npx knip@6.16.1 runs against this repo.
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/main.tsx",            // Vite SPA entry (verified present)
    "index.html",              // Vite html entry (script-src discovery)
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "e2e/**/*.ts",             // E2E specs are real consumers — keep out of "dead"
    "src/**/*.test.{ts,tsx}",  // vitest specs are entries, NOT dead code
    "src/**/__tests__/**/*.{ts,tsx}"
  ],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": [
    "src/components/ui/**"      // shadcn/ui generated primitives: many exports unused by design — review separately, don't auto-flag
  ],
  "ignoreDependencies": [],
  "vite": { "config": ["vite.config.ts"] },
  "vitest": { "config": ["vitest.config.ts"] }
  // path alias "@/*"→"./src/*" is read automatically from tsconfig.app.json (verified present)
}
```

Key tuning notes grounded in this repo:
- **Tests are entries, not dead code.** This repo has heavy test coverage (468 vitest tests). If specs aren't listed as `entry`, knip flags spec-only components (e.g. `PricingTable.tsx`, verified imported only by its `.interviewPrep.test.tsx` files + a *comment* in `Pricing.tsx`) inconsistently. Decide the policy explicitly: a component whose *only* non-test importer is a test → that's a **`needs-investigation`** finding (test-only = arguably dead, but Phase 4 must confirm the test goes too). Document the policy in `DEAD-CODE.md`.
- **shadcn/ui `src/components/ui/**`** intentionally exports many unused variants. `ignore` them or you'll drown in false positives.
- `noUnusedLocals`/`noUnusedParameters` are **off** in `tsconfig.app.json` (verified) — so TS itself won't help; knip is doing real work.

### Pattern 2: Deno reachability by `deno info --json` graph-union (CLEAN-01 hard half)

**What:** Build the set of every file reachable from any *deployed* edge-function entrypoint. **When:** detecting dead `_shared/*.ts` and orphan function dirs.

**Why entrypoints, not frontend imports:** edge functions are reached by HTTP-invoke / webhook / cron / internal-job-worker — never by frontend `import`. Verified entrypoint shapes: `serve(async (req)=>…)` (`analyze-resume`, `keep-warm`) and `Deno.serve(…)` (`paddle-webhook`, `stripe-webhook-handler`). Entrypoint = `supabase/functions/<fn>/index.ts`.

Verified behavior of `deno info`:
- `deno info supabase/functions/keep-warm/index.ts` resolved **22 unique deps**, including cross-imports into `_shared/auth.ts`, `_shared/supabase-client.ts`, AND **`src/config/pricing-config.ts`** (edge code imports frontend config — a real cross-layer edge the audit must record).
- It exposed **std-version drift**: the same graph pulls `deno.land/std@0.168.0` *and* `deno.land/std@0.224.0` — a DEP-01 finding for the Deno side.
- `deno info --json` returns `{ version, roots, modules:[{ kind, specifier, local, … }] }`. `specifier` is a `file://`/`https://`/`npm:` URL — directly unionable.

Technique (the committed `scripts/audit/deno-reachability` runner does this):
```
1. entrypoints = all supabase/functions/*/index.ts   (verified: glob works; ~40 dirs)
2. reachable = ∅
   for each entrypoint: deno info --json <ep> → collect modules[].specifier where it starts file://…/supabase/functions/
       add to reachable
3. all_shared = all supabase/functions/_shared/**/*.ts  (excluding *.test.ts and __tests__/)
4. dead_candidates = all_shared − reachable
5. orphan_functions = function dirs whose index.ts is itself never an entrypoint AND never imported
   (an index.ts is always an entrypoint by definition, so "orphan" = a function dir that exists in repo
    but is NOT in config.toml / NOT deployed — cross-check with supabase functions list)
6. EVERY dead_candidate then runs the keep-list gate (D-07) before it can be `safe`.
```

**CRITICAL caveat (verified):** `deno info` needs network on first run to fetch `https://` deps into the Deno cache (or `--cached-only` after a warm cache). The audit runner should warm the cache once. This is fine for a one-time inventory (consistent with D-02 allowing online lookups for the inventory).

### Pattern 3: Multi-signal classification gate (D-05/D-06)

**What:** A finding becomes `safe` ONLY when ALL of these agree; otherwise `needs-investigation` (or `unsafe` if a positive keep-signal fires).

| Signal | How to produce it | Tool |
|--------|-------------------|------|
| Static-dead | knip flags it (React) OR not in `deno info` union (Deno) | knip / deno info |
| No dynamic ref | `rg` finds no string/template-literal reference (see Pattern 4) | rg |
| No external caller | not an edge entrypoint, not in `config.toml`, not a webhook/cron/job target, not deployed-only | config.toml + supabase functions list + migrations grep |
| Not gated | not behind a feature flag, not a documented-gated remnant (Paddle, Interview Prep) | KEEP-LIST cross-ref |

Record the concurring signals **inline** next to each `safe` verdict (per the `<specifics>` requirement) so Phase 4/8 trust it without re-deriving.

### Pattern 4: Dynamic / string-reference detection (defeats the #1 false positive)

**What:** find references a static tool can't see. **Why it matters (verified landmine):** `price-resolver.ts` reads `Deno.env.get(\`STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}\`)` — a literal grep for `STRIPE_PRICE_PRO_MONTHLY` finds **only test files**, so it would be wrongly flagged unused.

```
# env keys built by template literal (catch the price-resolver class)
rg -n "env\.get\(\s*[\`'\"]" supabase/functions          # then read each call's interpolation
rg -n "STRIPE_PRICE_\$\{|env\.get\(\`" supabase/functions

# string-keyed / dynamic imports in React (verified: none found, but re-run)
rg -n "import\(|React\.lazy|lazy\(|import\.meta\.glob" src

# component/function referenced by string name (rare but real)
rg -n "<NameUnderTest|['\"]NameUnderTest['\"]" src
```

### Anti-Patterns to Avoid

- **Treating knip/ts-prune output as ground truth for Deno.** They silently ignore `supabase/functions/` (non-resolvable `https://` imports) → everything there looks "unreferenced." Never run knip over edge functions for dead-code; use `deno info`.
- **Literal-grep env inventory.** Misses template-literal keys (proven). Always pair with Pattern-4 dynamic scan.
- **Migrations-only DB inventory.** Blind to dashboard-made objects, drift, and `pg_cron` jobs scheduled outside migration files. D-09 triangulation is mandatory.
- **Trusting the TEST project for "unused" evidence.** It's drifted/synthetic (D-10). Prod-only for the live leg.
- **Auto-running live DB queries.** D-10 is operator-gated; the plan delivers a `.sql` pack, the operator runs it, results get pasted back. No autonomous prod connection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deno import-graph reachability | A custom TS-import regex walker | `deno info --json` | Must resolve `https://`, `npm:`, `jsr:`, re-exports, std-version drift, and cross-layer `src/` imports — a regex walker gets all of these wrong. Verified `deno info` gets them right. |
| React dead-files/exports/deps | Three separate tools wired together | `knip` (one pass) | knip already unifies dead-files + unused-exports + unused-deps + unlisted-deps with native Vite/Vitest/alias support. |
| "latest version" lookup | Manual registry scraping | `npm outdated --json` | Gives current/wanted/latest in one parse-friendly call (D-02 permits online). |
| Vuln signal | Manual CVE cross-ref | `npm audit --json` | One call; hand the result to Phase 6 (DEP-04). |
| DB catalog introspection | Bespoke per-object SQL written ad hoc | A committed standard query pack against `information_schema`/`pg_catalog`/`pg_stat_*` | Reproducible, reviewable, operator-pasteable, and re-runnable by Phase 8. |

**Key insight:** This phase's value is *reproducibility and trust*, not cleverness. Every catalog must be regenerable by a single committed command/query so Phases 4/6/8 re-derive the same evidence rather than trusting prose.

---

## Common Pitfalls

### Pitfall 1: knip flags edge functions / config / generated UI as dead
**What goes wrong:** Without a tuned `entry`/`project`/`ignore`, knip flags shadcn `ui/**`, test-only components, and (if pointed at it) all of `supabase/functions/`.
**Why:** knip's defaults assume a single Node project; this repo is React + a separate Deno project + heavy tests.
**How to avoid:** Scope `project` to `src/**`; list ALL test globs + e2e as `entry`; `ignore` `src/components/ui/**`; never include `supabase/functions/**`.
**Warning signs:** Hundreds of "unused export" hits, or any `supabase/functions/*` path in knip output.

### Pitfall 2: Template-literal env keys flagged unused (Stripe price IDs)
**What goes wrong:** `STRIPE_PRICE_PRO_MONTHLY/_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY/_ANNUAL`, and the legacy `STRIPE_PRICE_PAID_*` alias family appear only in tests under a literal grep → falsely "unused."
**Why:** `price-resolver.ts` builds the key dynamically (verified).
**How to avoid:** Pattern-4 scan for `env.get(\`…${…}…\`)`; expand every interpolation to its concrete set (tier ∈ {pro, elite, paid}, interval ∈ {monthly, annual}).
**Warning signs:** A `STRIPE_PRICE_*` var with "consumers: tests only."

### Pitfall 3: Deployed-but-no-source functions invisible to a repo-only audit
**What goes wrong:** `interview-prep-coach` has NO source dir (verified absent) but is reportedly live on staging+prod. A repo-only audit never sees it; a frontend-import audit never sees ANY edge function.
**Why:** functions are deployed independently; source can be deleted without `supabase functions delete`.
**How to avoid:** Run `supabase functions list --project-ref <prod>` and `<staging>` (operator step), diff against repo `supabase/functions/*` dirs AND `config.toml [functions.*]` blocks. Mismatches in either direction are findings.
**Warning signs:** A function in `supabase functions list` with no repo dir (deployed-orphan), or a repo dir absent from `config.toml`.

### Pitfall 4: `deno info` cold-cache / network
**What goes wrong:** First `deno info` on a fresh machine stalls or errors fetching `https://deno.land/std@…`.
**Why:** Deno fetches remote deps on demand.
**How to avoid:** Warm the cache once (run `deno info` on one entrypoint, or `deno cache`), then the union loop is fast. Acceptable for a one-time inventory (D-02).
**Warning signs:** "Download" lines or timeouts mid-union.

### Pitfall 5: Reading low/zero `pg_stat_*` as "definitely unused"
**What goes wrong:** A table with 0 reads in `pg_stat_user_tables` looks dead but the counter reset on the last DB restart; or `pg_stat_statements` is disabled and returns nothing.
**Why:** Stat counters are cumulative-since-reset and the extension is optional (D-11).
**How to avoid:** Record `stats_reset` timestamp alongside counts; treat zero-usage as *corroborating*, never *sole*, evidence; if `pg_stat_statements` is absent, say so explicitly rather than implying "no slow queries."
**Warning signs:** A `safe`-to-drop verdict resting only on a stat count.

### Pitfall 6: Cross-platform (Windows/PowerShell) gotchas in `audit:*` scripts
**What goes wrong:** Glob expansion, path separators (`\` vs `/`), and `&&` chaining differ; `npm` scripts run under the OS shell.
**Why:** Primary dev shell is PowerShell (verified env); `deno info` emits Windows `\` paths in `local` but `file:///C:/…/` forward-slash URLs in `specifier` (verified — union on `specifier`, not `local`).
**How to avoid:** Drive the Deno union from a small **node** script (cross-platform path handling) invoked by the npm `audit:deadcode` script, or a PowerShell `.ps1` mirroring `scripts/run-edge-tests.ps1`. Match `specifier` URLs (always forward-slash). Avoid bash-isms in npm scripts.
**Warning signs:** Script works in Git-Bash but fails in `npm run` under PowerShell.

### Pitfall 7: `interview-prep-analyze` (gated-live) vs `interview-prep-coach` (retired) confusion
**What goes wrong:** Classing the wrong one dead.
**Why:** Similar names; one is gated-but-live (keep), one is retired (remove-candidate).
**How to avoid:** KEEP-LIST entry: `interview-prep-analyze` + `interview-prep-evaluate` are gated-live (behind `VITE_FEATURE_INTERVIEW_PREP`, "Coming Soon" on prod, live on staging) — **never `safe`**. `interview-prep-coach` is the retired one (no source, confirm deployment) — Phase 4 (CLEAN-03) target.
**Warning signs:** Any Interview-Prep edge function marked `safe`.

---

## Code Examples

Verified commands and queries. All ran (or are standard read-only catalog SQL) in this environment.

### React dead-code + unused/unlisted deps (one pass)
```bash
# Verified: npx knip@6.16.1 runs against this repo
npx --yes knip                          # human-readable
npx --yes knip --reporter json          # machine-parseable → DEAD-CODE.md + DEPENDENCIES.md (frontend leg)
```

### Deno reachability (graph-union) — conceptual runner
```bash
# Verified: deno info --json emits modules[].specifier as file:// URLs
deno info --json supabase/functions/keep-warm/index.ts   # one entrypoint
# union loop (node/ps1 in scripts/audit/) over: ls supabase/functions/*/index.ts
#   collect modules[].specifier matching .../supabase/functions/_shared/...
#   dead = all _shared/*.ts (minus *.test.ts) NOT in the union
```

### Deployed-vs-source drift (operator)
```bash
npx supabase functions list --project-ref <PROD_REF>      # → compare with repo dirs + config.toml
npx supabase functions list --project-ref <STAGING_REF>   # interview-prep-coach expected here w/ no source
```

### Frontend dependency inventory
```bash
npm outdated --json     # current / wanted / latest (verified working; @hookform/resolvers 3→5, @eslint/js 9→10, etc.)
npm ls --all --json     # dependency tree → "consumers" column
npm audit --json        # vuln signal (verified: 9 vulns — 5 moderate, 4 high) → handed to Phase 6 DEP-04
```

### Deno dependency inventory (no central import map — parse inline imports)
```bash
# Enumerate every remote/npm import + its version pin across edge functions
rg -n "from \"(https://|npm:|jsr:)" supabase/functions -o
# Notable verified pins: deno.land/std@0.168.0 AND @0.224.0 (drift), npm:@supabase/supabase-js@2,
#   npm:stripe@14, https://deno.land/x/xhr@0.1.0
# "latest" for deno.land/std: check https://deno.land/std (or jsr) ; for npm: specs use npm registry (D-02)
```

### Env inventory enumeration
```bash
# Frontend VITE_* consumers (verified output below)
rg -n "import\.meta\.env\.\w+" src -o | sort | uniq -c | sort -rn
# Edge secrets — literal keys
rg -o "Deno\.env\.get\(['\"]([A-Z_0-9]+)['\"]\)" -r '$1' supabase/functions --no-filename | sort -u
# Edge secrets — TEMPLATE-LITERAL keys (the Pitfall-2 catch)
rg -n "Deno\.env\.get\(\`" supabase/functions
```

### DB read-only introspection pack (operator runs against PROD SQL editor; D-09/D-10/D-11)
```sql
-- All strictly read-only. ZERO writes. Operator pastes results into DATABASE.md.

-- Tables + schemas
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog','information_schema')
order by 1,2;

-- Row counts + read/write activity + when counters last reset (D-11 caveat)
select schemaname, relname, n_live_tup,
       seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, last_autovacuum
from pg_stat_user_tables order by n_live_tup desc;
select stats_reset from pg_stat_database where datname = current_database();  -- caveat anchor

-- Functions / RPCs (merit RPCs, can_perform_ai_action, etc.)
select n.nspname as schema, p.proname as fn,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
order by 1,2;

-- RLS policies (DB-05 input even though DB-05 is Phase 8)
select schemaname, tablename, policyname, cmd, roles
from pg_policies order by 1,2,3;

-- Triggers
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers order by 1,2,3;

-- pg_cron jobs (verified the repo schedules cron: keep-warm, extract-catchup, benchmarks, lifecycle-archive)
select jobid, schedule, command, active from cron.job order by jobid;

-- Extensions (is pg_stat_statements enabled? D-11)
select extname, extversion from pg_extension order by 1;

-- Top statements IF pg_stat_statements is enabled (skip/note if extension absent)
select queryid, calls, total_exec_time, rows, left(query, 200) as query
from pg_stat_statements order by total_exec_time desc limit 50;
```

---

## Domain-Specific Verified Findings (seeds the planner can hand straight into tasks)

These were verified on this machine and should be recorded as starting evidence — they are *leads with evidence*, the planner still scopes the full enumeration.

### Dead-code (CLEAN-01)
- **`PricingTable.tsx`** — non-test references = its own definition/export + a *comment* in `Pricing.tsx:22` ("copied verbatim from PricingTable.tsx"). Real importers = its `.interviewPrep.test.tsx` test files only. → `needs-investigation` (test-only; Phase 4 must remove tests too).
- **`LockedSection` / `LockedListItem`** — reachable via `LockedSectionsSandbox` which **IS** imported + routed in `App.tsx:43,88` (`/dev/locked-sections`, DEV-gated by `import.meta.env.DEV`). NOT dead while the sandbox route exists. KEEP-LIST (deprecated-but-imported).
- **`ProFeatureBlur.tsx`** — `@deprecated`; needs full call-site sweep (its own deprecation comment references `LockedSection`). `needs-investigation` until all call sites confirmed gone.
- **`InterviewPrepInput.tsx`** — defines + exports `InterviewPrepInput`; STRUCTURE.md says active form is `<IntakeForm>`. Confirm zero non-test importers (a `InterviewPrep.prior-selector.test.ts` asserts source does NOT contain the flag — tangential). Likely `needs-investigation` → `safe` if no importer.
- **Deno `_shared` std-version drift** — `@0.168.0` and `@0.224.0` co-exist in the reachable graph (DEP-01 Deno finding).

### Dependencies (DEP-01)
- Frontend: `npm outdated --json` works; many majors pending (e.g. `@hookform/resolvers` 3→5, `@eslint/js` 9→10, Radix point bumps). `npm audit`: 9 vulns (5 moderate, 4 high).
- Deno: no central import map / no `deno.lock` (`deno.json` `"lock": false`, `"imports": {}` — verified). Inventory must parse inline imports per function. Pins seen: `std@0.168.0`, `std@0.224.0`, `@supabase/supabase-js@2`, `stripe@14`, `deno.land/x/xhr@0.1.0`.

### Env (ENV-01)
- **VITE_* consumers (verified):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY` (`supabaseClient.ts`, `useResumeStream.ts`); `VITE_ANALYZE_CAREER_FUNCTION` (`CareerCompass.tsx:167`); `VITE_DEBUG_PERF` (not found in `import.meta.env` grep — verify it's read elsewhere or is dead/doc-only); `VITE_FEATURE_INTERVIEW_PREP` (centralized in `src/config/feature-flags.ts` — single prod consumer + tests; good design); **`VITE_STRIPE_PUBLISHABLE_KEY`** (`StripeCheckoutWrapper.tsx`, `StripePaymentElementModal.tsx`) — **NOT in `.env.example`** (a real ENV-01 gap). Also `import.meta.env.PROD/MODE/DEV` (built-ins).
- **Edge secret surface is ~57 distinct `Deno.env.get` names** (verified), far more than `.env.example`'s ~15. Categories: production (Anthropic, Stripe, Resend, Firecrawl, Supabase, `APP_URL`, `INTERNAL_JOB_SECRET`, `MERIT_SYSTEM_ENABLED`, `PADDLE_WEBHOOK_SECRET`); OCR providers not in `.env.example` (`MISTRAL_OCR_*`, `TEXTRACT_OCR_*`, `OLLAMA_*`); test/CI-only (`AI_TEST_MODE`, `AI_FORCE_FAILURE`, `IS_TEST`, `RUN_*`, `DENO_TEST_*`, `TEST_*` JWTs/IDs, `STAGING_SUPABASE_*`, `STRIVO_ENV`, `MERIT_TEST_FORCE_REFUNDABLE_ERROR`, `ADMIN_EMAIL(S)`). The inventory must bucket prod vs test vs optional and flag the `.env.example` ↔ code gaps both directions.
- **Pitfall-2 landmine:** `STRIPE_PRICE_{PRO,ELITE,PAID}_{MONTHLY,ANNUAL}` are template-literal keys (`price-resolver.ts`) — literal grep finds them only in tests. Must be expanded manually.

### Database (DB-01/DB-02)
- 76 migration files (verified count). pg_cron scheduled by migrations: `add_keep_warm_cron`, `phase42_layer2_extract_catchup_cron`, `phase42_layer4_benchmarks_cron`, `phase42_layer5_lifecycle_archive` (verified `cron.`/`pg_cron` refs) — all KEEP-LIST (cron-invoked).
- `usage_tracking` dual read/write call map (D-08) — writers/readers enumerated in CONCERNS.md §5; re-verify against current code (some readers `usePaywallGuard`/`useTierAccess` call legacy `can_perform_ai_action`). Record as confirmed dependency map for Phase 8 DB-04, NOT "retained read-only."
- Paddle remnants: `paddle-webhook` function (in `config.toml [functions.paddle-webhook]`, verified), `profiles.paddle_customer_id/paddle_subscription_id` columns, surfaced in `Settings/Billing.tsx`, `Profile.tsx`, `Refund.tsx`, `types.ts`. KEEP-LIST (gated on last Paddle sub expiring) — never `safe`.
- The live introspection (cron.job, drift, RLS, triggers) is the operator-gated leg (D-10).

### Performance (PERF-01, static only — D-12)
- `analyze-career` repeated `resumeText` slicing + hardcoded `MAX_CONTEXT_CHARS=12000` slice (CONCERNS.md §3, lines ~857) — recomputation/oversized-payload candidate.
- `usage_tracking` dual-write on every merit-path feature (`record_ai_usage` in 6+ functions) — redundant-work candidate.
- Merit-balance refetch race (`useMerits` `staleTime:5_000`, post-call single invalidation, shop-credit webhook race) — repeated/ill-timed data access (INTEGRATIONS.md §4).
- Parallel-call merge paths (`result-merger.ts`, `recruiting-lens-merger.ts`) — review for redundant parse/repair passes.
- Per-feature `.order('created_at',desc).limit(1)` latest-row fetches across 7 pages (STRUCTURE.md §5) — repeated-query pattern. Document; do NOT measure.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ts-prune (unused exports) + depcheck (unused deps) as separate tools | **knip** unifies dead-files + exports + deps in one pass | knip mature since ~2023; v6 current | One tool, one config (D-01 fewest-tools win). ts-prune now effectively maintenance-mode. |
| Hand-maintained Deno import lists | `deno info --json` graph (built into Deno 1.x+, stable in 2.x) | Stable | Ground-truth reachability incl. std-drift + cross-layer imports. |
| `Deno.serve` only on newer Deno | Mixed `serve` (std http) + `Deno.serve` (native) | Both present in repo (verified) | Reachability detection must treat *both* `index.ts` shapes as entrypoints. |

**Deprecated/outdated in *this repo* (audit will catalog, not fix):**
- `deno.land/std@0.168.0` (old) alongside `@0.224.0` — Deno std is migrating to JSR `@std`; out of scope to bump here (Phase 6), but DEP-01 records it.
- `ignoreDeprecations: "6.0"` in `tsconfig.app.json` — note for CLEAN-06 (Phase 4), not this phase.

---

## Open Questions

1. **Does `VITE_DEBUG_PERF` actually have a runtime consumer?**
   - What we know: it's in `.env.example` and CLAUDE.md; the `import.meta.env` grep did NOT surface it in `src/` (verified absence in that scan).
   - What's unclear: whether it's read via a different access form (`perf.ts` may read it), or is doc-only / dead.
   - Recommendation: targeted `rg "DEBUG_PERF"` across `src/` (incl. `perf.ts`); if zero, classify `needs-investigation` for Phase 7 ENV-02.

2. **What is the exact prod vs staging project-ref for `supabase functions list`?**
   - What we know: TEST/preview project is `cimjltzovkahkqecpwgi`; prod is separate (deploy scripts swap config).
   - What's unclear: the prod ref string isn't in the files read.
   - Recommendation: the plan treats this as an operator-supplied input (consistent with D-10 operator-gating); the runbook lists the command, operator fills the ref.

3. **Is `pg_stat_statements` enabled on prod?**
   - What we know: it's optional (D-11 anticipates "may be disabled").
   - What's unclear: actual state (only knowable from the live query `select * from pg_extension`).
   - Recommendation: the query pack includes the extension check first; `DATABASE.md` records enabled/disabled and the statements query is conditional.

4. **Ollama path live-ness (D-08).**
   - What we know: `ollama-client.ts` IS imported by `document-extraction.ts`, but routing is **parser-first** — `pdf_parser` is attempted first (verified at `document-extraction.ts:55-82`), Ollama is a fallback `invoke` (line ~93). Phase 51 (`20260607040000_phase51_document_extraction_identity`) post-dates Phase 50 (`20260605000000_phase50_extraction_metadata`).
   - What's unclear: whether the Ollama fallback branch is *ever taken* in prod (the `OLLAMA_*` secrets exist; need usage evidence) vs effectively dead behind parser-first + Mistral/Textract.
   - Recommendation: classify `needs-investigation` — record the routing order as evidence; Phase 4 CLEAN-03 confirms against live extraction logs / whether `OLLAMA_BASE_URL` is even set in prod.

---

## Sources

### Primary (HIGH confidence — verified in-environment on this machine, 2026-06-13)
- `npx knip@6.16.1 --version` → ran clean; confirms npx-only viability + version.
- `deno info` / `deno info --json` on `supabase/functions/keep-warm/index.ts` → confirmed module-graph shape, `modules[].specifier` file:// URLs, std-version drift, cross-layer `src/config/pricing-config.ts` import.
- `deno --version` → 2.7.1; `npx supabase --version` → 2.100.1 local / 2.106.0 latest.
- `npm outdated --json`, `npm audit --json` → confirmed working + actual results (9 vulns; many majors).
- `rg` enumerations of `import.meta.env.*`, `Deno.env.get(...)` (literal + template), `serve`/`Deno.serve`, dead-code seeds, paddle/ollama refs, migration filenames, `config.toml [functions.*]`, `price-resolver.ts` env-key construction.
- Repo files read directly: `deno.json`, `.env.example`, `tsconfig.app.json`, `vite.config.ts`, `config.toml` (functions section), `document-extraction.ts` (routing).

### Secondary (MEDIUM — planning docs, current)
- `.planning/phases/03-cross-domain-inventory-audit/03-CONTEXT.md` (the locked decisions D-01..D-12).
- `.planning/REQUIREMENTS.md` (CLEAN-01, DEP-01, ENV-01, DB-01, DB-02, PERF-01 + zero-functional-change constraint).
- `.planning/STATE.md` (carried-forward cleanup targets, gated-but-live rules, branch/baseline facts, v4.0 sequencing).

### Tertiary (LOW — v3.0-era codebase maps, dated 2026-04-28; treated as LEADS, several verified above)
- `.planning/codebase/CONCERNS.md` (usage_tracking dual read/write §5, interview-prep-coach §4, idempotency §6, BUDGET-03 §3, perf seeds §3).
- `.planning/codebase/STRUCTURE.md` (dead-code candidates: lock primitives, PricingTable, InterviewPrepInput, dev sandbox).
- `.planning/codebase/INTEGRATIONS.md` (env surface §8, Paddle remnants §7, Stripe/merit call graph, perf seeds §2/§4).
- ⚠ `.planning/codebase/TESTING.md` — known badly stale (per Phase 1); not used.

---

## Metadata

**Confidence breakdown:**
- Audit toolchain (knip/deno-info/supabase/npm): **HIGH** — every tool run on this machine against this repo.
- Deno reachability technique: **HIGH** — `deno info --json` graph shape + cross-imports verified directly.
- Env inventory technique + landmines: **HIGH** — template-literal Stripe-price landmine + ~57-name surface verified directly.
- DB introspection query pack: **MEDIUM-HIGH** — queries are standard read-only PG catalog SQL (not run against prod here — D-10 operator-gated by design); cron-job presence corroborated from migrations.
- Named-target re-verification (D-08): **MEDIUM** — Ollama routing + interview-prep-coach absence + Paddle/usage_tracking refs verified in repo; the *live* legs (deployed-function list, prod env presence, prod usage) are operator steps not yet run.
- PERF-01 hotspot seeds: **MEDIUM** — sourced from v3.0 maps + code locations; line numbers may have drifted (static catalog, planner re-confirms locations).

**Research date:** 2026-06-13
**Valid until:** ~2026-07-13 (30 days; stable — toolchain + repo are slow-moving, but `npm outdated`/`npm audit` numbers and any new commits to `src`/`supabase/functions` will shift specifics).
