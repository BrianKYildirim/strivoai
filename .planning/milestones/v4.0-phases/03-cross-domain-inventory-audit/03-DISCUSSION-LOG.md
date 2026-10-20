# Phase 3: Cross-Domain Inventory & Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 3-cross-domain-inventory-audit
**Areas discussed:** Audit tooling policy, Catalog structure & location, Confidence bar + keep-list, DB inventory source & environment, PERF-01 audit depth

---

## Audit tooling policy

### Install policy

| Option | Description | Selected |
|--------|-------------|----------|
| npx + committed config/scripts | Run via npx (no devDeps); commit knip.json + `npm run audit:*` scripts for reproducibility. | ✓ |
| Committed devDependencies | Add knip/ts-prune/depcheck to devDependencies normally; grows the dep surface Phase 6 audits. | |
| Pure ephemeral, nothing committed | Run once via npx, capture output, commit nothing executable; not reproducible by command. | |

**User's choice:** npx + committed config/scripts (no new devDeps).
**Notes:** Balances the milestone's zero-new-deps posture against the need for Phases 4/6/8 to re-run the same audit; mirrors the Phase 1 `verify:baseline` command-set pattern. → D-01.

### Latest-version check (online vs offline)

| Option | Description | Selected |
|--------|-------------|----------|
| Online npm registry / npm outdated | One-time registry read to record current vs latest + major-bump candidates. | ✓ |
| Offline only (lockfile/installed) | Record installed versions only; defer "latest available" to Phase 6. | |

**User's choice:** Online registry / npm outdated allowed.
**Notes:** The offline-determinism rule from Phase 1 applied to the per-PR test gate, not a one-off inventory. → D-02.

---

## Catalog structure & location

### Doc layout

| Option | Description | Selected |
|--------|-------------|----------|
| Per-domain evidence docs + index | One doc per domain + a short index; matches Phase 2's per-concern pattern and the 5 downstream consumers. | ✓ |
| One consolidated INVENTORY.md | Single large document, section per domain; every phase loads the whole thing. | |
| Hybrid summary + per-domain detail | Executive summary linking out to per-domain detail files. | |

**User's choice:** Per-domain evidence docs + index. → D-03.

### Location

| Option | Description | Selected |
|--------|-------------|----------|
| Durable .planning/audit/ | Stable milestone-level dir referenced by fixed path; survives independent of the phase-3 dir. | ✓ |
| Ephemeral in the phase dir | Under .planning/phases/03-…/; later phases reach into a sibling phase dir. | |
| Both — phase dir + audit/ pointer | Author in phase dir, thin audit/ index; extra indirection. | |

**User's choice:** Durable `.planning/audit/`. → D-04.

### Taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Three-tier: safe / unsafe / needs-investigation | Marks ambiguous findings honestly; downstream acts only on 'safe'. | ✓ |
| Binary: safe / unsafe | Simpler two-bucket call; forces ambiguous items into one bucket. | |

**User's choice:** Three-tier (safe / unsafe / needs-investigation). → D-05.

---

## Confidence bar + keep-list

### Confidence bar

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative — multiple signals agree | 'Safe' only when static tool + grep + no-external-caller + no-gate concur; else needs-investigation. | ✓ |
| Aggressive — flag broadly, verify in Phase 4 | Mark anything static tools report as 'safe'; push the real check downstream. | |

**User's choice:** Conservative bar. → D-06.

### Keep-list

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — first-class enumerated keep-list | Dedicated section enumerating known false-positive classes; every catalog cross-references it. | ✓ |
| Handle ad hoc per finding | Annotate exceptions inline; protections scattered. | |

**User's choice:** First-class enumerated keep-list (feature-flagged Interview Prep, Paddle-gated, name/webhook/cron-invoked edge fns, dynamic imports, deprecated-but-imported components). → D-07.

### Named targets handling

| Option | Description | Selected |
|--------|-------------|----------|
| Re-verify + record evidence now | Verify current routing/usage for each named target this phase; record evidence + gating. | ✓ |
| Carry forward as known targets only | List as candidates; let Phase 4/8 verify when they act. | |

**User's choice:** Re-verify + record evidence now (Phase 50 Ollama path, interview-prep-coach, usage_tracking, Paddle remnants). → D-08.

---

## DB inventory source & environment

### DB source

| Option | Description | Selected |
|--------|-------------|----------|
| Migrations + code-grep + live read-only introspection | All three; catches drift, strongest 'unused' evidence. | ✓ |
| Migrations + code-grep only (no live) | Offline, zero access risk; blind to drift, weaker evidence. | |
| Live introspection only | Ground-truth structure; loses declared-intent + call-site context. | |

**User's choice:** Triangulate all three. → D-09.

### Environment

| Option | Description | Selected |
|--------|-------------|----------|
| Production, strictly read-only | Real deployed state + real usage; read-only catalog/stat queries; operator-gated. | ✓ |
| TEST project (cimjltzovkahkqecpwgi) | Safer to touch but schema-drifted/synthetic; structural cross-check only. | |

**User's choice:** Production, strictly read-only (operator-run / read creds). → D-10.
**Notes:** Reality check raised in discussion — org has only prod + TEST Supabase projects; no separate live staging DB.

### Usage evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Include runtime stats where available | pg_stat_user_tables / row counts / pg_stat_statements (where enabled) + caveats. | ✓ |
| Structural + code-reference only | No runtime stats; avoids stat-reliability caveats. | |

**User's choice:** Include runtime stats where available, with caveats recorded. → D-11.

---

## PERF-01 audit depth

| Option | Description | Selected |
|--------|-------------|----------|
| Static/code-review catalog only | Document suspected hotspots only; measurement stays in Phase 9 (PERF-04). | ✓ |
| Catalog + lightweight measurement to rank | Add quick measurement to rank candidates; pulls measurement forward. | |

**User's choice:** Static/code-review catalog only. → D-12.

---

## Claude's Discretion

- Exact tool selection per domain (knip vs ts-prune vs both; depcheck vs knip's dep coverage; Deno reachability technique).
- Precise catalog filenames + internal record schema/columns.
- `npm run audit:*` script names/shape.
- The exact set of read-only catalog/stat queries.
- Finding-record format inside each domain doc.

## Deferred Ideas

- Lightweight performance measurement / hotspot ranking → Phase 9 (PERF-04).
- Acting on any finding (removal/prune/bump/consolidate/drop/refactor) → Phases 4/6/7/8/9.
- Mechanical/CI enforcement of the audit (fail CI on new dead code) → later/optional.
- Dead CSS / asset audit + public-vs-internal export policy nuance → fold into DEAD-CODE.md at planner discretion, or a future pass.
