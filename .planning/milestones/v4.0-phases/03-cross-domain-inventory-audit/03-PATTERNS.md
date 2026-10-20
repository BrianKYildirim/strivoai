# Phase 3: Cross-Domain Inventory & Audit - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 11 new/modified artifacts
**Analogs found:** 11 / 11 (all have a format or convention analog; note most are markdown catalogs + config/scripts, not code modules)

> **Read-only phase caveat:** This is a non-destructive audit (zero functional change, D-CONTEXT governing constraint). The "files to create" are evidence catalogs (`.md`), one committed tool config (`knip.json`), `npm run audit:*` script entries, thin runner scripts, and an operator-run read-only SQL pack. **No source module is created or modified.** The patterns below are *format/convention analogs* — copy the shape, headers, and conventions, not business logic.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/audit/INDEX.md` | doc (catalog index) | transform (evidence rollup) | `.planning/phases/02-*/02-SECRET-SCAN.md` (header/verdict shape) | role-match (format) |
| `.planning/audit/KEEP-LIST.md` | doc (evidence catalog) | transform | `02-WORKTREE-DISPOSITION.md` (per-item enumerated disposition) | role-match (format) |
| `.planning/audit/DEAD-CODE.md` | doc (evidence catalog) | transform | `02-SECRET-SCAN.md` (scan-commands + classified-table + re-assertion) | role-match (format) |
| `.planning/audit/DEPENDENCIES.md` | doc (evidence catalog) | transform | `02-SECRET-SCAN.md` (classified-table + counts, never values) | role-match (format) |
| `.planning/audit/ENV-INVENTORY.md` | doc (evidence catalog) | transform | `02-SECRET-SCAN.md` (REPO-05 "names+consumers, never values" rule) | exact (format) |
| `.planning/audit/DATABASE.md` | doc (evidence catalog) | transform | `02-WORKTREE-DISPOSITION.md` (verify-then-record evidence) + SQL header pattern | role-match (format) |
| `.planning/audit/PERF-HOTSPOTS.md` | doc (evidence catalog) | transform | `02-SECRET-SCAN.md` (classified-finding table, static-only) | role-match (format) |
| `.planning/audit/queries/db-introspection.sql` | operator SQL pack | request-response (read-only) | `scripts/snapshot-legacy-tables.ps1` (read-only psql) + `.planning/.../queries/improvement-over-time.sql` (header + catalog SQL) | exact (both legs) |
| `knip.json` | config | n/a (static config) | `vitest.config.ts` / `tsconfig.json` (root config style + `@/*` alias) | role-match |
| `scripts/audit/deno-reachability.mjs` + `.ps1` | utility (runner) | batch (graph-union) | `scripts/diagnose-pdf-text.mjs` (node runner) + `scripts/run-edge-tests.ps1`/`.sh` (twin convention) | role-match |
| `package.json` → `audit:*` scripts | config (npm scripts) | n/a | `package.json` `test:*` / `verify:baseline` block (lines 6-20) | exact |

---

## Pattern Assignments

### `.planning/audit/*.md` — every domain catalog (doc, transform)

**Analog:** `.planning/phases/02-repository-hygiene-state-reconciliation/02-SECRET-SCAN.md`

This is the canonical evidence-doc shape the catalogs mirror (CONTEXT D-03, `<code_context>` "format template"). Copy these five structural elements verbatim:

**1. Header block** (`02-SECRET-SCAN.md` lines 1-8) — title tied to requirement ID, phase, date, branch/HEAD SHA at scan, tooling note, scope statement:
```markdown
# REPO-05 — Dependency-Free Secret / Binary / Artifact Scan Evidence

**Phase:** 02 — Repository Hygiene & State Reconciliation
**Plan:** 02-02 (REPO-05)
**Scan date:** 2026-06-13
**Branch / HEAD at scan:** `staging` @ `95604af`
**Tooling:** Dependency-free native git only ...
**Scope:** *Tracked* content only ...
```
For Phase 3: title each catalog by its requirement (`CLEAN-01`, `DEP-01`, `ENV-01`, `DB-01/DB-02`, `PERF-01`), record the audit run-date + HEAD SHA, and state the tooling (`knip via npx`, `deno info`, etc.) and read-only scope.

**2. Verdict / summary block up top** (`02-SECRET-SCAN.md` lines 12-17) — a one-line verdict before detail, with the guard that did/didn't trigger. For Phase 3, lead each catalog with its headline counts (e.g. "N safe / M needs-investigation / K unsafe").

**3. Commands-run section, each annotated read-only** (`02-SECRET-SCAN.md` lines 20-74) — the exact command in a fenced block, then a classified-results table. This is where Phase 3's `npx knip --reporter json`, `deno info --json` union, `npm outdated --json`, and the `rg` enumerations get recorded so Phase 4/6/8 re-derive identically:
```markdown
### 1. Secret-pattern pass over tracked files ...

```bash
git grep -nIE "sk_live_..." -- ':!.planning/*' ':!*.test.*'
```

**Result:** No matches (`git grep` exit code `1` = no hits). → ... PASS.
```

**4. Classified-findings table** (`02-SECRET-SCAN.md` lines 53-63, 82-89) — every finding gets a row with a classification column. For Phase 3 the classification column is the three-tier `safe` / `unsafe` / `needs-investigation` (D-05) **plus an inline concurring-signals citation** (`<specifics>`: tool + grep + no-external-caller + no-gate):

| KB / Item | Path | Classification |
|----|------|----------------|
| ... | `path` | KEEP / ARTIFACT / safe / needs-investigation (signals: ...) |

**5. Re-Assertion block** (`02-SECRET-SCAN.md` lines 102-126) — a copy-paste reproducible command set (with a PowerShell equivalent for the primary shell) so the audit is re-runnable by Phases 4/6/8. This is the doc-level mirror of D-01's `audit:*` scripts.

**6. Cross-References block** (`02-SECRET-SCAN.md` lines 130-135) — every catalog cross-references `KEEP-LIST.md` (D-07 mandate that "every domain catalog cross-references" the keep-list) and the downstream consumer phase.

**Critical format rule (ENV-INVENTORY.md especially):** `02-SECRET-SCAN.md` records "pattern classifications, counts, paths, and SHAs only — no real secret value is pasted anywhere" (line 137). `<code_context>` makes this binding for `ENV-INVENTORY.md`: **list var names + consumers + required/optional, NEVER values.**

---

### `.planning/audit/KEEP-LIST.md` (doc, transform — the D-07 false-positive register)

**Analog:** `.planning/phases/02-repository-hygiene-state-reconciliation/02-WORKTREE-DISPOSITION.md`

`02-WORKTREE-DISPOSITION.md` is the precedent for an **enumerated, per-item, evidence-before-action register** — exactly KEEP-LIST's job (enumerate the classes static analysis WILL wrongly flag dead, with evidence, so nothing gated-but-live is classed `safe`).

**Per-item disposition pattern** (`02-WORKTREE-DISPOSITION.md` lines 28-36) — each item is a `###` block with location, the unique evidence, and an explicit disposition verdict:
```markdown
### worktree-agent-a0418fbf02382e929 — phase 47-01 (coming-soon-primitives)
- Worktree: `C:/Projects/.../agent-a0418fbf02382e929` (locked)
- Tip: `2b6805e docs(47-01): complete coming-soon-primitives plan` (2026-05-11)
- Unique commits (3):
  - `2b6805e` ...
- ... Feature content **shipped to `origin/main`**.
- Disposition: phase 47 shipped → **force-delete justified**.
```
For KEEP-LIST, each `###` block is a keep-class (D-07): Feature-flagged Interview Prep (`VITE_FEATURE_INTERVIEW_PREP`), Paddle-gated remnants (`paddle_*`, `paddle-webhook`), name/webhook/cron-invoked edge functions, dynamic/string-keyed imports, deprecated-but-imported components (`LockedSection`/`LockedListItem`/`ProFeatureBlur`). Each lists the gating evidence and the verdict **"gated-but-live → never `safe`."**

**"Why force is justified" rationale section** (`02-WORKTREE-DISPOSITION.md` lines 5-22) — the precedent for explaining, with verification, why a naive tool reads this wrong. KEEP-LIST should open with the parallel rationale: why static analysis (knip / `deno info` frontend-import view) wrongly flags each class dead, and what live signal proves it isn't (mirrors Research Pattern 3/4 and Pitfall 7's `interview-prep-analyze` vs `-coach` confusion).

---

### `.planning/audit/queries/db-introspection.sql` (operator SQL pack, read-only request-response)

**Two analogs — copy from both:**

**Analog A (operator/read-only execution model):** `scripts/snapshot-legacy-tables.ps1`

This is the precedent for an **operator-run, read-only, connection-string-driven DB introspection step** (D-10 operator-gated, strictly read-only). Copy:
- The synopsis header documenting that it is read-only and run-before/after-and-diff (`snapshot-legacy-tables.ps1` lines 1-26).
- `DatabaseUrl` defaulting to `$env:SUPABASE_DB_URL` with a fail-if-unset guard (lines 28-41) — directly supports the "operator supplies the prod ref/conn" model (RESEARCH Open Question 2).
- The "(redacted)" connection-string handling (line 49) — never log the conn string, consistent with the ENV/secret no-values rule.
```powershell
param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [string]$OutputFile = ".snapshot-legacy.txt"
)
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DatabaseUrl not set. Pass -DatabaseUrl or set `$env:SUPABASE_DB_URL."
  exit 1
}
```

**Analog B (SQL file shape):** `.planning/milestones/v3.0-phases/42-database-foundation-users-career-targets/queries/improvement-over-time.sql`

This is the precedent for a **committed, header-documented `.sql` query file under a `queries/` dir** — exactly the layout RESEARCH proposes (`.planning/audit/queries/db-introspection.sql`). Copy the header-comment convention (lines 1-17): purpose tied to requirement ID, expected inputs, expected runtime, expected index usage, and a "Returns:" description.
```sql
/*
Phase 42 DB-VER-04: improvement-over-time query template.

Input: ...
Expected runtime: ...
Returns: ...
*/

WITH ranked_versions AS ( ... )
```
For Phase 3 the body is the read-only catalog/stat pack from RESEARCH "Code Examples" (lines 327-366): `information_schema.tables`, `pg_stat_user_tables` + `stats_reset` caveat anchor, `pg_proc`, `pg_policies`, `information_schema.triggers`, `cron.job`, `pg_extension`, and the conditional `pg_stat_statements`. Header must state **ZERO writes** and that the operator pastes results into `DATABASE.md`.

---

### `knip.json` (config, root)

**Analog:** `vitest.config.ts` (root placement + `@/*` alias) and `tsconfig.json` (root config, `@/*` paths)

`knip.json` is a root config file like the existing `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`. Copy the conventions:

**Path-alias awareness** — `vitest.config.ts` lines 7-9 resolve `@` → `./src`; `tsconfig.json` lines 5-7 declare `"@/*": ["./src/*"]`. knip reads this alias automatically from `tsconfig.app.json` (RESEARCH verified), so the config just needs `entry`/`project`/`ignore` scoping.

**Test-include scoping** — `vitest.config.ts` line 15 defines the test glob (`src/**/*.test.{ts,tsx}` + the `_shared/__tests__` set). knip's `entry` must list the SAME test globs as entries (RESEARCH Pitfall 1: tests are entries, not dead code) plus `e2e/**`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`.

**Excludes mirror real boundaries** — `vitest.config.ts` lines 17-24 exclude `node_modules` + the Deno-only `_shared/__tests__` files. knip must `ignore` `src/components/ui/**` (shadcn generated) and **never** include `supabase/functions/**` (RESEARCH Anti-Pattern: knip can't read Deno `https://` imports). Use the verified starter shape in RESEARCH lines 118-141.

```jsonc
// root-level, sibling of vitest.config.ts / tsconfig.json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["src/main.tsx", "index.html", "vite.config.ts", "vitest.config.ts",
            "playwright.config.ts", "e2e/**/*.ts",
            "src/**/*.test.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/components/ui/**"]
}
```

---

### `scripts/audit/deno-reachability.mjs` (+ optional `.ps1` twin) (utility, batch graph-union)

**Two analogs:**

**Analog A (node runner shape):** `scripts/diagnose-pdf-text.mjs`

This is the precedent for a **node `.mjs` diagnostic/analysis runner in `scripts/`** — cross-platform path handling, `node:` imports, usage-string + argv guard, console-reported output. RESEARCH Pitfall 6 specifically recommends a node script (cross-platform `specifier` URL matching) for the Deno graph-union. Copy:
- The leading usage comment + `process.argv` guard (`diagnose-pdf-text.mjs` lines 1-17):
```js
// <one-line purpose>
// Usage:
//   node scripts/audit/deno-reachability.mjs
import { readFile } from 'node:fs/promises';
const target = process.argv[2];
if (!target) { console.error('Usage: ...'); process.exit(1); }
```
- The `node:`-prefixed builtin imports (line 11) and console-reported summary (lines 39-60) style.

For the runner body: glob `supabase/functions/*/index.ts`, shell out to `deno info --json <ep>`, union `modules[].specifier` matching `.../supabase/functions/_shared/...` (match on `specifier` forward-slash URLs, NOT `local` paths — RESEARCH Pitfall 6), subtract from all `_shared/**/*.ts` (minus `*.test.ts`), emit dead candidates. Algorithm spelled out in RESEARCH lines 160-171.

**Analog B (twin-script + thin-runner convention):** `scripts/run-edge-tests.ps1` + `scripts/run-edge-tests.sh`

The repo keeps a `.ps1` (primary Windows shell) and `.sh` (CI) twin of the same runner, and the `.sh` defers to a single-source-of-truth task. Copy two things:
- The `$ErrorActionPreference = "Stop"` + `$repoRoot = Split-Path -Parent $PSScriptRoot` repo-root resolution idiom (`run-edge-tests.ps1` lines 10-13) for any `.ps1` twin.
- The "single source of truth, thin runner defers to it" principle (`run-edge-tests.sh` lines 3-9): the canonical entrypoint list / command lives once; if a `.ps1` twin is added it should mirror, not duplicate logic.

---

### `package.json` → `audit:*` scripts (config, npm scripts)

**Analog:** `package.json` scripts block, lines 6-20 (the `test:*` / `verify:baseline` family)

This is an **exact convention match** — D-01 explicitly says `audit:*` should "match in style" the existing command-set, and the `verify:baseline` aggregator is the named precedent (CONTEXT D-01 cross-refs Phase 1). Copy:

**Domain-namespaced colon convention** (lines 13-19): `test`, `test:watch`, `test:edge`, `test:e2e`, `test:quarantine`. New scripts become `audit`, `audit:deadcode`, `audit:deps`, etc.

**Aggregator-over-`&&` pattern** (line 18): `"verify:baseline": "npm run test && npm run test:edge && npm run test:e2e"`. A top-level `"audit": "npm run audit:deadcode && npm run audit:deps && ..."` aggregator mirrors this exactly.

**`cross-env` + cwd-shift for cross-shell** (line 15): `"test:edge": "cd supabase/functions && cross-env ... deno task test:ci"`. If an `audit:*` script needs an env var or a cwd shift, use the same `cross-env` idiom (already a devDependency — no new dep) rather than bash-isms (RESEARCH Pitfall 6).

**npx-driven, zero new devDeps** (D-01): unlike `test:adversarial` which uses the installed `promptfoo`, audit scripts invoke `npx --yes knip`, `node scripts/audit/deno-reachability.mjs`, `npm outdated --json` — nothing added to `dependencies`/`devDependencies`.

```jsonc
// added to scripts block, same style as test:* family
"audit:deadcode": "npx --yes knip --reporter json && node scripts/audit/deno-reachability.mjs",
"audit:deps": "npm outdated --json; npm audit --json",
"audit": "npm run audit:deadcode && npm run audit:deps"
```

---

## Shared Patterns

### Evidence-doc record discipline (names/counts/SHAs, never values)
**Source:** `02-SECRET-SCAN.md` line 137 ("records pattern classifications, counts, paths, and SHAs only — no real secret value")
**Apply to:** ALL catalog `.md` files, binding for `ENV-INVENTORY.md` (CONTEXT `<code_context>`: "list var names + consumers + required/optional, never values"). Record HEAD SHA + run-date in every catalog header so re-runs are diffable.

### Three-tier classification with inline concurring-signals (D-05/D-06)
**Source:** classification-column pattern in `02-SECRET-SCAN.md` (lines 53-63: KEEP/ARTIFACT) and `02-WORKTREE-DISPOSITION.md` (per-item "Disposition:" verdict)
**Apply to:** every findings table in DEAD-CODE / DEPENDENCIES / ENV-INVENTORY / DATABASE / PERF-HOTSPOTS. The Phase-3 classification column is `safe` / `unsafe` / `needs-investigation`, and each `safe` row MUST inline-cite its four concurring signals (static-dead + no-dynamic-ref + no-external-caller + not-gated) per `<specifics>`, so Phase 4/8 trust it without re-deriving.

### KEEP-LIST cross-reference gate (D-07)
**Source:** the Cross-References block convention (`02-SECRET-SCAN.md` lines 130-135)
**Apply to:** every domain catalog must carry a Cross-References block pointing at `KEEP-LIST.md`; the keep-list gate runs AFTER every static pass (RESEARCH Pattern 3) — a positive keep-signal forces `unsafe`/never-`safe`.

### Reproducible / re-runnable evidence (D-01)
**Source:** `02-SECRET-SCAN.md` "Re-Assertion Block" (lines 102-126, incl. the PowerShell-equivalent for the primary shell) + `package.json` `verify:baseline` aggregator (line 18)
**Apply to:** every catalog ends with (or references) the exact command(s) that regenerate it; those commands are wired as `npm run audit:*`. PowerShell-first with a portable equivalent, per repo shell convention.

### Read-only / operator-gated DB access (D-10)
**Source:** `scripts/snapshot-legacy-tables.ps1` (env-var conn string, fail-if-unset, "(redacted)" logging, read-only psql)
**Apply to:** `queries/db-introspection.sql` + `DATABASE.md` — the plan treats live-prod queries as an operator step (no autonomous prod connection, RESEARCH Anti-Pattern "Auto-running live DB queries"); the prod ref/conn is an operator-supplied input (Open Question 2).

---

## No Analog Found

| File | Role | Data Flow | Reason / Mitigation |
|------|------|-----------|---------------------|
| `knip.json` (knip-specific keys) | config | n/a | No prior knip config in repo (verified: no `knip.json`/`knip.ts`). Root-config *placement/style* analog exists (`vitest.config.ts`, `tsconfig.json`); the knip-specific `entry`/`project`/`ignore` schema comes from RESEARCH lines 118-141 (verified `npx knip@6.16.1` runs against this repo), not from a codebase analog. |
| `scripts/audit/deno-reachability.*` (the `deno info` graph-union logic) | utility | batch | No existing Deno-reachability runner. The runner *shape* (node `.mjs`, twin `.ps1`) is analogous to `diagnose-pdf-text.mjs` + `run-edge-tests.ps1/.sh`, but the graph-union algorithm itself is novel — take it from RESEARCH Pattern 2 (lines 148-173), not from an analog. |
| PERF-HOTSPOTS.md (perf finding schema) | doc | transform | Format follows `02-SECRET-SCAN.md` classified-table, but there is no prior *performance* evidence doc; the suspected-hotspot seeds + static-only discipline (D-12) come from RESEARCH "Domain-Specific Verified Findings → Performance" (lines 396-401). |

> Note: `.planning/audit/` and `scripts/audit/` directories do not yet exist (verified) — both are created new this phase. INDEX.md has no exact prior (no INDEX.md/README.md found in `.planning/` top dirs); use the `02-SECRET-SCAN.md` header/verdict/cross-ref shape as its skeleton and make it a domain→doc map + how-to-re-run + KEEP-LIST pointer.

## Metadata

**Analog search scope:** `.planning/phases/02-*/` (evidence docs), `scripts/` (runners + SQL/psql precedent), repo root (`package.json`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`), `.planning/milestones/v3.0-phases/*/queries/` (SQL file precedent)
**Files scanned:** 9 read in full/part (`02-SECRET-SCAN.md`, `02-WORKTREE-DISPOSITION.md`, `run-edge-tests.ps1`, `run-edge-tests.sh`, `diagnose-pdf-text.mjs`, `snapshot-legacy-tables.ps1`, `improvement-over-time.sql`, `vitest.config.ts`, `tsconfig.json`, `package.json` scripts block); directory enumeration for existence checks (knip config, audit dirs, sql files)
**Pattern extraction date:** 2026-06-13
