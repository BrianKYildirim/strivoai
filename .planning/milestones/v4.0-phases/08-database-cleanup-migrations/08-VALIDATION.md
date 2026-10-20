---
phase: 8
slug: database-cleanup-migrations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Special note (DB phase):** the offline `verify:baseline` suite NEVER exercises the live database, so it
> cannot by itself prove DB-05's "no access-behavior regression." Zero-access-regression is proven by the
> **read-only MCP instrument set** (before/after `get_advisors` + `pg_policies`/`pg_proc` shape + targeted
> no-regression reads + per-grant code read-maps), sampled at every state transition
> (preview-apply → operator-applies-prod → re-verify). See `08-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (frontend) + Deno test (edge) + Playwright (E2E) — offline `verify:baseline`; PLUS read-only Supabase MCP (`supabase-prod-readonly`, `supabasepreview`) for live-DB verification |
| **Config file** | `package.json` scripts (`verify:baseline`); `.mcp.json` (MCP servers); `supabase/migrations/` (forward+rollback SQL) |
| **Quick run command** | `npm run test` (frontend vitest) — for any task that touches `src/` (none planned: D-06 keeps FE byte-identical) |
| **Full suite command** | `npm run verify:baseline` (vitest + offline-deno + Playwright) — the zero-functional-change gate |
| **Estimated runtime** | verify:baseline ~several min; MCP read-only checks ~seconds each |

**Live-DB verification instruments (read-only, MCP — the real DB-05 proof):**
- `get_advisors(type="security")` / `get_advisors(type="performance")` — before/after advisory still-fires / cleared check.
- `pg_policies` read on the touched table(s) — policy name/cmd/roles/qual shape before vs after.
- `pg_proc` / function-definition read — `search_path`/SECURITY-mode shape for function/view changes.
- Targeted no-regression SELECT-as-role checks — confirm the intended caller can still read; an unintended caller cannot.
- Per-grant **code read-map** (`rg`) — proves no live caller depends on a grant before a VERIFY-THEN-APPLY change (D-03).

---

## Sampling Rate

- **Before authoring ANY migration:** D-01 blocking re-pull complete (canonical prod ref confirmed + `db-introspection.sql` re-run read-only against `zjpjapgraoxdukdvpjes` + DB-02 re-classified).
- **After each migration authored:** forward + rollback both present (DB-06); SQL reviewed read-only against live prod schema via MCP.
- **On preview (after un-pause + sync):** apply migration to preview → read-only verify (advisory cleared + `pg_policies` shape + no-regression read).
- **After operator applies to prod:** re-run the same read-only MCP verification against `zjpjapgraoxdukdvpjes` (advisory cleared + shape + targeted reads).
- **Before phase close:** offline `verify:baseline` green (zero-functional-change on the code surface — expected byte-identical since D-06 touches no `src/`).
- **Max feedback latency:** verify:baseline minutes; per-migration MCP read-only checks seconds.

---

## Per-Task Verification Map

> Tasks are authored by the planner (this is a draft written before PLAN.md exists). The Nyquist auditor / planner
> fills concrete Task IDs. Each grant-altering migration task MUST carry a read-only before/after MCP verification
> and (for VERIFY-THEN-APPLY items) a code read-map acceptance criterion. Prod-application + preview-un-pause tasks
> are `autonomous: false`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 (TBD) | 01 | 1 | DB-01/D-01 | — | Canonical prod ref confirmed; introspection re-pulled read-only; DB-02 re-classified | manual (MCP read-only) | `get_advisors` + `db-introspection.sql` via `supabase-prod-readonly` | ❌ W0 | ⬜ pending |
| 08-0X-0Y (TBD) | 0X | N | DB-05 | T-08-0X | linkedin_grades SELECT scoped owner-only; "Anyone can view" advisory cleared; owner can read, non-owner cannot | manual (MCP read-only before/after) | `pg_policies` + `get_advisors(security)` + targeted SELECT-as-role | ❌ W0 | ⬜ pending |
| 08-0X-0Z (TBD) | 0X | N | DB-06 | — | Every migration has forward + rollback; rollback restores prior shape exactly | source assertion | `rg "DROP POLICY\|CREATE POLICY\|-- ROLLBACK" supabase/migrations/<file>` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] D-01 read-only re-pull executed against canonical prod (`zjpjapgraoxdukdvpjes`) — the evidence precondition for every later task (gates DB-02 re-classification, the linkedin_grades no-op question, saved_jobs existence, the x60 EXECUTE-grant subset).
- [ ] Preview (`cimjltzovkahkqecpwgi`) un-paused + synced to current migration state + structurally confirmed vs prod (operator action — `autonomous: false`).

*Existing infrastructure (`verify:baseline`, `.mcp.json` servers, the `db-introspection.sql` pack, the RUN-06 pre-authored linkedin_grades forward+rollback) covers the tooling; no new test framework is installed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canonical prod ref confirmation + read-only introspection re-pull | DB-01 / D-01 | Live prod is read-only via MCP; operator-supplied connection; no offline proxy | Run `db-introspection.sql` Section 0-8 read-only via `supabase-prod-readonly`; record results names-not-values |
| Migration applied to prod | DB-03/DB-05/DB-06 | Prod is read-only to Claude; operator manually applies all prod migrations (CLAUDE.md MCP rule 8) | Operator applies the forward migration; Claude re-runs read-only MCP verification post-apply |
| Preview un-pause + schema sync | D-04 / D-05 | Un-pausing a paused Supabase project + applying migrations to it is an operator action | Operator un-pauses `cimjltzovkahkqecpwgi`, runs migration apply; Claude validates read-only |
| No-access-regression after RLS change | DB-05 | `verify:baseline` never touches the live DB; only a live SELECT-as-role read proves it | Read-only `pg_policies` + targeted SELECT-as-role (intended caller reads; unintended caller blocked) before/after |

---

## Validation Sign-Off

- [x] Every grant-altering migration task has a read-only before/after MCP verification (advisory + pg_policies shape + targeted read)
- [x] Every VERIFY-THEN-APPLY (D-03) task has a code read-map acceptance criterion proving no live caller depends on the grant
- [x] Every migration ships forward + rollback (DB-06)
- [x] Preview-un-pause + prod-apply tasks are `autonomous: false`
- [x] D-01 re-pull gates all migration authoring (Wave 0)
- [x] Offline `verify:baseline` green at phase close (code surface byte-identical — `git diff -- src supabase/functions` EMPTY across 08-01..08-05)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** satisfied (Plan 08-05 close, 2026-06-24) — all per-migration before/after MCP evidence (08-03/08-04/08-05 resolution-evidence sections in `RUNTIME-RELIABILITY.md`) + the per-grant code read-maps are recorded; DB-05 security advisor 73 -> 15 (every remaining lint dispositioned RESOLVED/GATED/needs-operator).
