# Cross-Domain Audit Catalog — INDEX

**Phase:** 03 — Cross-Domain Inventory & Audit
**Foundation plan:** 03-01 (CLEAN-01 tooling + DEP-01 frontend leg + the durable catalog scaffold)
**Audit run-date:** 2026-06-13
**HEAD SHA at foundation:** `1d4051e` (branch `staging`)
**Location (durable, D-04):** `.planning/audit/` — milestone-level living reference. These catalogs are consumed by later phases via this fixed path; they survive independent of the phase-3 dir.
**Tooling (npx-driven, zero new devDeps — D-01):** `npx --yes knip` (React dead files / exports / deps), `node scripts/audit/deno-reachability.mjs` (Deno edge-function `deno info --json` graph-union reachability), `npm outdated --json` + `npm audit --json` (dependency inventory + vuln signal), and the operator-run read-only SQL pack (`.planning/audit/queries/db-introspection.sql`, delivered by a later Wave-2 plan).

---

## Verdict / Status

Audit FOUNDATION stood up (this plan, 03-01): tuned `knip.json`, the cross-platform Deno reachability runner, the `npm run audit:*` scripts, and this catalog scaffold (INDEX + KEEP-LIST) all exist and run. The five per-domain evidence docs are produced by the Wave-2 catalog plans (rows pre-listed below). **No removals, no dependency changes, no env/DB/code changes happen in this phase — it catalogs and classifies only (zero functional change).**

---

## Mandatory Classification Gate

> **Every domain catalog below MUST cross-reference [`KEEP-LIST.md`](./KEEP-LIST.md) and apply it as the `safe`-classification gate.**
> Static analysis (knip's frontend-import view; `deno info` reachability) WILL wrongly flag whole classes of live-but-not-statically-reachable code as dead. A positive keep-signal forces a finding to `unsafe` / never-`safe`. See KEEP-LIST.md for the five enumerated keep-classes and the gate rule.

Three-tier classification (D-05): `safe` / `unsafe` / `needs-investigation`. Downstream phases act only on `safe`; `needs-investigation` must be resolved before any removal. Conservative bar (D-06): classify `safe` ONLY when multiple independent signals agree (static-dead AND no dynamic/string reference AND no external-caller/entrypoint path AND not feature-flag/gated). Each `safe` row inline-cites its concurring signals so Phase 4/8 trust it without re-deriving.

---

## Domain → Doc Map

Each downstream phase reads only its own domain doc. The rows are pre-listed here so the Wave-2 catalog plans each write ONLY their own file and never edit this INDEX (no parallel-write conflict).

| Domain doc | Requirement(s) | Owning Wave-2 plan | Consuming phase | Status |
| ---------- | -------------- | ------------------ | --------------- | ------ |
| [`DEAD-CODE.md`](./DEAD-CODE.md) | CLEAN-01 | 03-02 | Phase 4 (CLEAN-02..06) | pending |
| [`DEPENDENCIES.md`](./DEPENDENCIES.md) | DEP-01 | 03-03 | Phase 6 (DEP-02..05) | pending |
| [`ENV-INVENTORY.md`](./ENV-INVENTORY.md) | ENV-01 | 03-04 | Phase 7 (ENV-02..05) | pending |
| [`DATABASE.md`](./DATABASE.md) | DB-01, DB-02 | 03-05 | Phase 8 (DB-03..06) | pending |
| [`PERF-HOTSPOTS.md`](./PERF-HOTSPOTS.md) | PERF-01 | 03-06 | Phase 9 (PERF-02..04) | complete |
| [`PERF-MEASUREMENT.md`](./PERF-MEASUREMENT.md) | PERF-04 | 09-04 | Phase 9 close-out | complete |
| [`RUNTIME-RELIABILITY.md`](./RUNTIME-RELIABILITY.md) | RUN-01..RUN-07 | 07.1 (this phase) | Phase 8 (DB-class routed) | complete |
| [`KEEP-LIST.md`](./KEEP-LIST.md) | the gate (D-07) | 03-01 (this plan) | ALL of the above cross-reference it | **complete** |

> Plan→doc ownership is the planned mapping; the exact Wave-2 plan numbers follow the phase-3 plan sequence (03-02 … 03-06). What is binding here is that each domain doc is written by exactly one plan and cross-references KEEP-LIST.

---

## How to Re-Run (D-01 reproducible-by-command)

Run from repo root. All npx-driven / built-in — nothing is added to `package.json` dependencies.

```bash
# React dead files / unused exports / unused+unlisted deps (knip) AND
# Deno edge-function _shared reachability (deno info --json graph-union).
npm run audit:deadcode

# Frontend dependency inventory: current/wanted/latest + vulnerability signal.
npm run audit:deps

# Both of the above, in sequence.
npm run audit
```

- `npm run audit:deadcode` → `node scripts/audit/run-deadcode.mjs`, which runs `npx --yes knip --reporter json` (its non-zero exit means "issues found" — a finding, not an error) then `node scripts/audit/deno-reachability.mjs`.
- `npm run audit:deps` → `node scripts/audit/run-deps.mjs` (`npm outdated --json` then `npm audit --json`; both exit non-zero by design — that is the inventory signal, D-02 allows the one-time online lookup).
- These are wired as node orchestrators (not `&&`/`;` chained strings) because npm runs scripts via `cmd.exe` on Windows, where `;` is not a separator and `&&` aborts on the first non-zero exit — both would break the multi-pass audit (RESEARCH Pitfall 6).

**Live DB introspection (DB-01/DB-02) is operator-gated and read-only (D-10):** the read-only catalog/stat pack lives at `.planning/audit/queries/db-introspection.sql` (delivered by plan 03-05). An operator runs it against the PROD Supabase SQL editor (ZERO writes) and pastes results into `DATABASE.md`. It is NOT an autonomous prod connection.

---

## Committed Foundation Artifacts (03-01)

| Artifact | Role |
| -------- | ---- |
| `knip.json` (repo root) | tuned knip config: `project` scoped to `src/**`, all test/e2e/config globs as `entry`, `ignore` `src/components/ui/**` (shadcn). NEVER includes `supabase/functions/**` (knip can't resolve Deno `https://`/`npm:`/`jsr:` imports — RESEARCH Anti-Pattern). |
| `scripts/audit/deno-reachability.mjs` | cross-platform `deno info --json` graph-union runner; unions on forward-slash `modules[].specifier` URLs (not `local` `\` paths); `--no-lock` so it never mutates `deno.lock`. |
| `scripts/audit/run-deadcode.mjs` | node orchestrator: knip pass + Deno pass (continues past knip's issue-exit). |
| `scripts/audit/run-deps.mjs` | node orchestrator: `npm outdated` + `npm audit` (both exit non-zero by design). |
| `package.json` `audit:*` scripts | `audit:deadcode`, `audit:deps`, `audit` — colon-namespaced like the `test:*`/`verify:baseline` family; zero new deps. |
| `.planning/audit/INDEX.md` | this file. |
| `.planning/audit/KEEP-LIST.md` | the D-07 false-positive register / `safe`-classification gate. |

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the mandatory gate every domain catalog applies.
- **`.planning/phases/03-cross-domain-inventory-audit/03-CONTEXT.md`** — locked decisions D-01..D-12.
- **`.planning/phases/03-cross-domain-inventory-audit/03-RESEARCH.md`** — tool internals (knip starter shape, `deno info` union algorithm, env/DB landmines, pitfalls).
- **`.planning/STATE.md`** §"Carried-Forward Cleanup Targets" — the named re-verify targets (D-08) that seed DEAD-CODE / DATABASE.
