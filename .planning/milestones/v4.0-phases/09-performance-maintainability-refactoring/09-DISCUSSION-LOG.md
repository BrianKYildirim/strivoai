# Phase 9: Performance & Maintainability Refactoring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 9-performance-maintainability-refactoring
**Areas discussed:** Refactor appetite, Measurement (PERF-04), DB perf-class scope, Clarity scope (PERF-03)

---

## Refactor appetite (PERF-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Safe wins only | Apply H4 (merge dedup) + H5 (shared accessor) + DB perf-class; measure Resume Analysis + Career Compass to prove no regression; leave H1/H2/H3 documented + deferred (no code change to business-critical AI-input/balance/legacy paths). Mirrors Phase 8's security-only stance. | ✓ |
| Safe + measurement-gated H1/H3 | Also attempt H1/H3 only where measurement proves real cost AND change is provably behavior-neutral, each behind rollback. | |
| You decide per-hotspot | Investigate all 5 at plan time; apply each only where measured evidence shows cost worth removing and zero behavior change is provable. | |

**User's choice:** Safe wins only (recommended).
**Notes:** Operator interrupted the single-question turn to say "go with the one you recommended," confirming the conservative stance consistent with every prior v4.0 phase. PERF-04 measurement on Resume Analysis + Career Compass happens regardless of whether those flows are refactored.

---

## Measurement (PERF-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Staging + reuse/extend harness + isolate deterministic path + median/p95 over runs | Measure on staging (not prod); reuse `validate-performance.mjs` for Resume Analysis, extend/sibling for Career Compass; measure cache-hit/deterministic path separately as the clean regression signal; median + p95 over >=5 runs/flow/tier with warmup + cooldown. No-regression = end-to-end median within run-to-run variance AND deterministic path no-regression. | ✓ |

**User's choice:** Locked as recommended (single consolidated confirm gate).
**Notes:** Prod is read-only and near-empty (1 user) — end-to-end measurement there is both off-limits and meaningless. AI-call latency dominates and is noisy, so the cache-hit/deterministic path is the real regression signal for the deterministic code being changed (H4 merge, H5 query, DB RLS).

---

## DB perf-class scope (PERF-02, Phase-8 handoff)

| Option | Description | Selected |
|--------|-------------|----------|
| Apply zero-observable + additive; gate consolidations; defer drops | APPLY `auth_rls_initplan` ×62 (scalar-subselect rewrite) + `unindexed_foreign_keys` ×8 (additive indexes); APPLY `multiple_permissive_policies` ×48 only where provably semantics-preserving (OR of originals) behind SELECT-as-role no-regression checks; DEFER `unused_index` ×41 drops (near-empty-prod stats unreliable, Phase 8 D-11). All preview->prod gated, rollback each. | ✓ |

**User's choice:** Locked as recommended (single consolidated confirm gate).
**Notes:** Inherits Phase 8's MCP operating model (prod read-only, operator applies, preview-first, rollback per migration) and the D-11 "0-count != disuse" rule. `public_bucket_allows_listing` routed to operator/defer (not a perf item).

---

## Clarity scope (PERF-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Zero-behavior-change consolidations only; no rewrites | IN: H5 shared latest-row accessor (reconcile columns first). IN conditional: `_shared/errors.ts` taxonomy helper as pure DRY of existing inline `const ERR` maps — verify landed at HEAD first (Phase 7.1 plans 07.1-03/05 still open), else defer. OUT: H1 cap/slice dedup (too close to AI-input/cache-key path); any structural rewrite or new abstraction beyond a single helper. | ✓ |

**User's choice:** Locked as recommended (single consolidated confirm gate).
**Notes:** Bounded by CLAUDE.md's "single helper over new abstraction" rule. The `_shared/errors.ts` helper is conditional on verifying Phase 7.1's inline taxonomy actually landed, to avoid coupling Phase 9 to unfinished 7.1 code work.

---

## Claude's Discretion

- Plan/wave slicing; whether DB perf-class is its own plan/wave or folded into code-refactor plans.
- Migration-file timestamps + naming (`YYYYMMDDHHMMSS_description.sql`).
- Extend `validate-performance.mjs` in place vs add a parallel `analyze-career` probe.
- The precise per-policy SQL for the `multiple_permissive_policies` subset that passes the "provably OR of originals" bar.
- Home for the before/after measurement report (`.planning/audit/` vs phase dir).

## Deferred Ideas

- H1 (analyze-career cap/slice) code + clarity changes — too close to AI-input/cache-key path; measured, not refactored.
- H2 (`usage_tracking` dual-write + table-drop) — gated/backlog (Phase 8 D-06).
- H3 (merit-balance refetch tuning) — affects post-purchase balance UX; measured, not refactored.
- `unused_index` ×41 drops — observation-window deferral (Phase 8 D-11).
- `multiple_permissive_policies` consolidations that aren't provably semantics-preserving.
- Storage `public_bucket_allows_listing` — operator/defer.
- Structural/architecture rewrites or new abstractions beyond a single helper.

## Cross-cutting note

This is the first phase since the Phase-1 baseline to intentionally edit product code, so the zero-functional-change proof model shifts from "git diff empty" to "behavior preserved despite code changes" — proven by `verify:baseline` green + PERF-04 before/after + per-DB-change preview->prod no-regression, each change individually validated with a rollback path (NFR-02 carried forward).

## Working-preference note

Operator prefers Claude to lead with a recommendation per gray area and use a single consolidated confirm gate, rather than one-question-at-a-time interrogation (recorded to memory `feedback_recommend_dont_interrogate`).
