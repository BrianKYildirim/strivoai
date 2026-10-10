---
phase: 03-cross-domain-inventory-audit
verified: 2026-06-13T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 3: Cross-Domain Inventory & Audit Verification Report

**Phase Goal:** A complete, evidence-backed catalog of everything potentially removable or improvable across code, dependencies, environment, and database is produced — with safe/unsafe classification — so the later destructive phases act only on confirmed-dead items (audit-before-action). NO removals happen in this phase (non-destructive, zero functional change).

**Verified:** 2026-06-13
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Reusable audit toolchain exists (knip.json + deno-reachability runner + audit:* scripts, zero new deps, committed) | VERIFIED | `knip.json` scoped to `src/**` only, no `supabase/functions` reference. `scripts/audit/deno-reachability.mjs` contains `deno info` + `specifier` (7 and 5 occurrences respectively). `package.json` contains `audit:deadcode`, `audit:deps`, `audit`. Only scripts-block additions confirmed via `git diff`. |
| 2 | Durable `.planning/audit/` catalog with INDEX.md + KEEP-LIST.md scaffolded and pre-listing all 6 domain docs | VERIFIED | All 7 files confirmed present (`INDEX.md`, `KEEP-LIST.md`, `DEAD-CODE.md`, `DEPENDENCIES.md`, `ENV-INVENTORY.md`, `DATABASE.md`, `PERF-HOTSPOTS.md`). INDEX.md pre-lists all 6 domain docs. KEEP-LIST.md enumerates all 5 keep-classes with "gated-but-live → NEVER safe" verdicts. |
| 3 | DEAD-CODE.md (CLEAN-01) exists: React knip + Deno reachability passes captured, every finding three-tier classified, safe rows inline-cite 4 concurring signals, D-08 targets re-verified | VERIFIED | 5 safe rows all carry `(signals: static-dead + no-dynamic-ref + no-external-caller + not-gated)` inline. D-08 evidence present: `document-extraction` (4×), `supabase functions list` (4×). No gated-but-live class on any safe row (verified: `interview-prep-analyze` and `LockedSection` appear on no safe row). |
| 4 | DEPENDENCIES.md (DEP-01) exists: frontend npm inventory (current/latest/consumers/vuln) + Deno inline imports, three-tier classified, KEEP-LIST-gated | VERIFIED | Both tables present with `Current`/`Latest` columns. 9-vuln npm audit signal (5 moderate / 4 high) recorded. std@0.168.0/0.190.0/0.224.0 drift recorded. 4 safe rows with inline signals. KEEP-LIST referenced 13 times. No secret values. |
| 5 | ENV-INVENTORY.md (ENV-01) exists: every VITE_* + edge secret inventoried with consumer/environment/required-optional, template-literal keys expanded as live, no secret values recorded | VERIFIED | 9 frontend names + 57 literal edge secrets catalogued. STRIPE_PRICE_ appears 20 times (all marked LIVE, not unused). Both-direction `.env.example` gaps documented (~46 code-not-example, 2 example-not-code). Post-write secret-pattern grep returned 1 (the `sk_live_` search term itself matched zero secret values in the file). T-3-07 guard confirmed passed per SUMMARY. |
| 6 | DATABASE.md (DB-01+DB-02) + read-only SQL pack + operator-run live results exist, three-way triangulated, usage_tracking + Paddle maps recorded, stats with D-11 caveat, operator-gated live leg COMPLETED | VERIFIED | `db-introspection.sql` contains `information_schema`, `pg_stat_user_tables`, `stats_reset`, `pg_proc`, `pg_policies`, `cron.job`, `pg_extension`. Zero write statements (grep for INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE → 0 executable writes). `db-introspection-results.md` committed with live PROD data (40 tables, 35 fns, 6 cron jobs, `stats_reset = 2025-12-08`). `usage_tracking` appears 20 times in DATABASE.md with `needs-investigation` (15 occurrences). KEEP-LIST cross-referenced. |
| 7 | PERF-HOTSPOTS.md (PERF-01) exists: static-only catalog, 5 seeded hotspots re-confirmed with file:line anchors, no-measurement boundary stated, three-tier classified, KEEP-LIST-gated | VERIFIED | No-measurement boundary prominently stated (14 occurrences of "static"/"Phase 9"/"PERF-04" terms). All 3 required hotspots present (`analyze-career`, `usage_tracking`, `result-merger` — 20 total occurrences). KEEP-LIST referenced 5 times. No secret values. |
| 8 | Zero functional change: `git diff --stat fa4ccb6..HEAD -- src supabase/functions supabase/migrations` is empty | VERIFIED | Git diff produced no output — empty diff confirmed. Only `.planning/audit/`, `knip.json`, `scripts/audit/`, and `package.json` (scripts block only) were modified across all 8 phase-03 commits. |

**Score:** 8/8 truths verified (6 requirements + 2 cross-cutting constraints)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `knip.json` | Tuned knip config: `project=src/**`, test/e2e globs as entry, `ignore=src/components/ui/**`, no `supabase/functions` reference | VERIFIED | Valid JSON, `project: ["src/**/*.{ts,tsx}"]`, `ignore: ["src/components/ui/**"]`, no `supabase/functions` string in file. |
| `scripts/audit/deno-reachability.mjs` | Cross-platform `deno info --json` graph-union runner, matches on `specifier` URLs | VERIFIED | Contains "deno info" (7×) and "specifier" (5×). `--no-lock` flag present (confirmed in SUMMARY). |
| `scripts/audit/run-deadcode.mjs` | Node orchestrator for audit:deadcode (cross-shell safe) | VERIFIED | Exists. Referenced by `package.json` `audit:deadcode` script. |
| `scripts/audit/run-deps.mjs` | Node orchestrator for audit:deps | VERIFIED | Exists. Referenced by `package.json` `audit:deps` script. |
| `package.json` | `audit:deadcode`, `audit:deps`, `audit` scripts; zero new deps | VERIFIED | All 3 scripts present. `git diff` shows only scripts-block additions plus one unrelated `test:adversarial` script (not a new dep). No dependency/devDependency additions. |
| `.planning/audit/INDEX.md` | Domain→doc map for all 6 docs, how-to-re-run, KEEP-LIST pointer | VERIFIED | All 6 domain doc rows pre-listed. `npm run audit:deadcode` and `.planning/audit/queries/db-introspection.sql` mentioned. KEEP-LIST.md prominently referenced as mandatory gate. |
| `.planning/audit/KEEP-LIST.md` | 5 keep-classes with never-safe verdicts, analyze-vs-coach distinction | VERIFIED | All 5 classes enumerated: `VITE_FEATURE_INTERVIEW_PREP`, Paddle, pg_cron/cron.job (4 occurrences), `STRIPE_PRICE_` (2 occurrences), `LockedSection`. "NEVER safe" gate rule present (5 occurrences). `interview-prep-analyze` (keep) vs `interview-prep-coach` (retired) explicitly distinguished. |
| `.planning/audit/DEAD-CODE.md` | CLEAN-01 catalog: React knip + Deno reachability, three-tier classified | VERIFIED | Contains `needs-investigation` (48×), `KEEP-LIST` (23×), `supabase functions list` (4×), `document-extraction` (4×). 5 safe rows with 4-signal inline citations. |
| `.planning/audit/DEPENDENCIES.md` | DEP-01 catalog: npm + Deno tables, current/latest, vuln signal, KEEP-LIST-gated | VERIFIED | Both tables present. `current` and `latest` columns present (11+ occurrences). std drift and 9-vuln signal recorded. KEEP-LIST referenced 13×. |
| `.planning/audit/ENV-INVENTORY.md` | ENV-01 catalog: VITE_* + edge secrets, template-literal keys expanded, no values | VERIFIED | `STRIPE_PRICE_` present (20×) marked LIVE. `VITE_STRIPE_PUBLISHABLE_KEY` flagged code-not-example. KEEP-LIST referenced 5×. Secret-value grep guard returned zero matches (confirmed in SUMMARY self-check). |
| `.planning/audit/DATABASE.md` | DB-01+DB-02 catalog: three-way triangulated, usage_tracking + Paddle maps, stats with D-11 caveat | VERIFIED | All 3 triangulation sources present (migrations / code call-sites / live PROD). `usage_tracking` present (20×) with `needs-investigation` (15×). `stats_reset = 2025-12-08` caveat recorded. KEEP-LIST referenced. No connection string/secret value. |
| `.planning/audit/queries/db-introspection.sql` | Read-only catalog/stat pack, zero writes, no connection string | VERIFIED | Contains `information_schema` (5×). "ZERO WRITES" and "read-only" stated (3 occurrences). Zero executable write statements (grep for write keywords → 0). No connection string. |
| `.planning/audit/queries/db-introspection-results.md` | Operator-run live PROD result sets (evidence file) | VERIFIED | File exists. Contains PROD evidence: 40 public tables, 35 fns, 6 cron jobs, pg_stat_statements ENABLED, `stats_reset = 2025-12-08`, 41 deployed edge fns. |
| `.planning/audit/PERF-HOTSPOTS.md` | PERF-01 static catalog: 5 hotspots, file:line anchors, no-measurement boundary | VERIFIED | No-measurement boundary stated (14 references to static/Phase 9/PERF-04). `analyze-career`, `usage_tracking`, `result-merger` all present (20 total occurrences). KEEP-LIST referenced (5×). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json audit:deadcode` | `knip.json` + `scripts/audit/deno-reachability.mjs` | `node scripts/audit/run-deadcode.mjs` | WIRED | `audit:deadcode` → `run-deadcode.mjs` → knip + deno-reachability confirmed. |
| Every Wave-2 domain catalog | `KEEP-LIST.md` | Cross-References block | WIRED | All 5 domain catalogs (DEAD-CODE, DEPENDENCIES, ENV-INVENTORY, DATABASE, PERF-HOTSPOTS) contain Cross-References block pointing to `KEEP-LIST.md`. |
| `DATABASE.md` | `.planning/audit/queries/db-introspection.sql` | operator runs the pack against PROD, pastes results back | WIRED | DATABASE.md references `db-introspection.sql` in header and Source C section. Results committed to `db-introspection-results.md`. |
| `DEAD-CODE.md` | knip + deno-reachability raw output | npm run audit:deadcode captured in Commands-Run section | WIRED | Commands-run section in DEAD-CODE.md shows knip JSON and Deno reachability output (`36 reachable / 5 dead candidates`). |
| `DEPENDENCIES.md` | `KEEP-LIST.md` | unused-dep gating (shadcn ui/** false-positive neutralization) | WIRED | KEEP-LIST referenced 13 times in DEPENDENCIES.md; 14 knip-flagged deps demoted to `needs-investigation` because their only consumers are in the knip-ignored tree. |
| `ENV-INVENTORY.md` | `KEEP-LIST.md` | template-literal + feature-flag env keep-classes | WIRED | STRIPE_PRICE_* keys (Class 4) and VITE_FEATURE_INTERVIEW_PREP (Class 1) both cross-referenced via KEEP-LIST gate. |

---

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CLEAN-01: Dead-code/unused-export audit run and catalogued with safe/unsafe classification | SATISFIED | `DEAD-CODE.md` exists: React (knip 6.16.1) + Deno (deno info --json) passes captured. 5 safe / 23 needs-investigation / 0 unsafe. Every safe row inline-cites 4 concurring signals (D-06). |
| DEP-01: Full dependency inventory (frontend npm + Deno edge imports) with current/latest version, consumers, and risk classification | SATISFIED | `DEPENDENCIES.md` exists: 59 outdated npm rows (current/latest columns), 9 vulns (5 mod/4 high), 8 Deno production specifiers. Three-tier classified. KEEP-LIST-gated (14 knip false-positives neutralized). |
| ENV-01: Every env var inventoried with consumer, environment, and required/optional status | SATISFIED | `ENV-INVENTORY.md` exists: 9 frontend + 57 edge literal + 6 template-expanded subscription keys + 4 merit keys. Consumer/bucket/required-optional for each. Template-literal landmine defused. Both-direction `.env.example` gaps flagged. Zero secret values (post-write guard passed). |
| DB-01: Full inventory of schemas, tables, functions, policies, triggers, and cron jobs with usage classification | SATISFIED | `DATABASE.md` exists: 76 migrations parsed (Source A), code call-sites mapped (Source B), live PROD introspection COMPLETED by operator (Source C): 40 tables + 5 views, 35 fns, 6 active cron jobs, policies, triggers. Read-only SQL pack committed and reproducible. |
| DB-02: Unused/obsolete DB structures identified with evidence of disuse | SATISFIED | `DATABASE.md` DB-02 flagging complete with three-way triangulation. 0 safe, candidate groups (usage_tracking/Paddle) are needs-investigation/gated with live-stat evidence. D-11 stats caveat (`stats_reset = 2025-12-08`) recorded. interview-prep-coach resolved (already retired). |
| PERF-01: Inefficiency hotspots identified (redundant work, N+1, recomputation, oversized payloads) | SATISFIED | `PERF-HOTSPOTS.md` exists: 5 hotspots with re-confirmed file:line anchors, categories (redundant-work/N+1/recomputation/oversized-payload), three-tier classification. Static-only boundary stated (D-12). No measurement performed. |

All 6 phase-3 requirements: SATISFIED.

---

### Anti-Patterns Found

No anti-patterns found. This is an audit/documentation phase — the deliverables are `.planning/audit/*.md` files and audit tooling config. No product code was modified. Verified via:

- `git diff --stat fa4ccb6..HEAD -- src supabase/functions supabase/migrations` → empty output (zero product code change)
- No TODO/FIXME/placeholder in any audit catalog (these are evidence documents, not code)
- No stub implementations (the tooling runs end-to-end per SUMMARY self-checks)

---

### Human Verification Required

None. This phase is non-destructive and read-only. All deliverables are `.planning/audit/` markdown catalogs and audit tooling config that can be fully verified programmatically.

The one operator-gated step (DB-05 live PROD introspection) was completed by the operator on 2026-06-13 and the results are committed in `.planning/audit/queries/db-introspection-results.md` — no further human action is required for this phase.

---

### Decisions Honored (D-01 through D-12)

| Decision | Status |
|----------|--------|
| D-01: npx + committed config/scripts, zero new devDependencies | HONORED — only scripts-block additions to package.json; `knip` via `npx --yes`; no new deps. |
| D-02: Online registry lookup allowed for "latest" column | HONORED — `npm outdated --json` used; documented in DEPENDENCIES.md Commands-Run. |
| D-03: Per-domain evidence docs + a short index | HONORED — 5 domain docs + INDEX.md + KEEP-LIST.md in `.planning/audit/`. |
| D-04: Durable `.planning/audit/` location | HONORED — all catalogs at `.planning/audit/` fixed path. |
| D-05: Three-tier classification: safe / unsafe / needs-investigation | HONORED — all 5 domain catalogs use exactly these 3 tiers. |
| D-06: Conservative confidence bar — safe only when 4 signals agree | HONORED — only 5 React+Deno items earned safe (stringent signal bar); 23 demoted to needs-investigation. |
| D-07: First-class, enumerated KEEP-LIST with 5 keep-classes | HONORED — KEEP-LIST.md exists with all 5 classes, never-safe verdicts, analyze-vs-coach distinction. |
| D-08: Re-verify named targets now with recorded evidence | HONORED — Ollama routing recorded with line anchors (needs-investigation); interview-prep-coach confirmed absent from repo and PROD deploy list (already retired); usage_tracking dual read/write map and Paddle remnants re-verified with rg. |
| D-09: Triangulate DB from 3 sources | HONORED — Source A (migrations), Source B (code call-sites), Source C (live PROD) all complete. |
| D-10: Production is source of truth, OPERATOR-gated | HONORED — SQL pack is read-only; operator ran it; no autonomous prod connection; connection string never committed. |
| D-11: Include runtime stats where available with caveats | HONORED — `stats_reset = 2025-12-08` caveat recorded; pg_stat_statements ENABLED confirmed; zero-usage treated as corroborating-not-sole. |
| D-12: Static/code-review catalog only for PERF-01 | HONORED — no profiler, benchmark, or harness; boundary prominently stated; measurement deferred to Phase 9. |

---

### Gaps Summary

None. All 6 requirements are satisfied. All 14 artifact checks passed. All key links are wired. Zero functional change confirmed. All 12 locked decisions honored.

Phase 3 goal achieved: a complete, evidence-backed, three-tier classified audit catalog exists across all five domains (dead code, dependencies, environment, database, performance), with reusable tooling committed for downstream phase re-runs.

---

_Verified: 2026-06-13_
_Verifier: Claude (gsd-verifier)_
