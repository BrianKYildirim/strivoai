# Phase 3: Cross-Domain Inventory & Audit - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase produces a **complete, evidence-backed catalog of everything potentially removable or improvable** across five domains — with safe/unsafe classification — so the later destructive phases (4, 6, 7, 8, 9) act only on confirmed-dead items (**audit-before-action**). It delivers six outcomes (CLEAN-01, DEP-01, ENV-01, DB-01, DB-02, PERF-01):

1. **Dead-code / unused-export audit** (CLEAN-01) — knip/ts-prune for the React app + reachability analysis for Deno edge functions; each finding classified safe / unsafe / needs-investigation.
2. **Dependency inventory** (DEP-01) — frontend npm + Deno edge imports, with current/latest version, consumers, and risk classification per dependency.
3. **Environment-variable inventory** (ENV-01) — every `VITE_*` flag + Supabase secret with consumer, environment, and required/optional status.
4. **Database inventory** (DB-01) + **obsolete-structure flagging** (DB-02) — schemas, tables, functions, policies, triggers, cron jobs, with evidence of disuse.
5. **Inefficiency-hotspot catalog** (PERF-01) — N+1 / repeated data access, recomputation, oversized payloads, redundant work (suspected hotspots, documented).

**Governing constraint:** **zero functional change** — this phase is **non-destructive and read-only**. **No removals, no migrations, no dependency changes, no env changes happen here.** It only catalogs and classifies.

**NOT in this phase:** dead-code removal (Phase 4), dependency bumps/pruning (Phase 6), env consolidation (Phase 7), DB removals/RLS changes (Phase 8), performance refactors + before/after measurement (Phase 9). The catalogs are the deliverable; acting on them is downstream.

</domain>

<decisions>
## Implementation Decisions

### Audit tooling policy (CLEAN-01 / DEP-01)
- **D-01:** **npx + committed config/scripts — no new devDependencies.** Run audit tools (knip/ts-prune, depcheck, etc.) via `npx` so nothing is added to `package.json`, BUT commit lightweight config (e.g. `knip.json`) and `npm run audit:*` script(s) so Phases 4/6/8 re-run the exact same audit. Keeps the dependency surface clean (preserves the milestone's zero-new-deps posture — consistent with Phase 2 D-14 deferring husky/commitlint) while making the audit reproducible-by-command (mirrors the Phase 1 `verify:baseline` command-set pattern). Exact tool selection (e.g. knip can cover dead files/exports AND unused deps in one pass; ts-prune may be redundant) is left to research/planning.
- **D-02:** **Online registry lookup is allowed for the inventory.** DEP-01's "current/latest version" may use `npm outdated` / the npm registry online to record current-vs-latest and major-bump candidates. This is a one-time read for an inventory — the Phase 1 offline-determinism rule applied to the per-PR **test gate**, not to a one-off audit, so network use here is fine. (Deno remote-import "latest" handled analogously where feasible.)

### Catalog structure, location & taxonomy
- **D-03:** **Per-domain evidence docs + a short index.** One doc per domain (proposed: `DEAD-CODE.md`, `DEPENDENCIES.md`, `ENV-INVENTORY.md`, `DATABASE.md`, `PERF-HOTSPOTS.md`) plus an `INDEX.md`/`README.md`. Matches Phase 2's per-concern evidence pattern (`02-SECRET-SCAN.md`) and the five distinct downstream consumers (Phases 4/6/7/8/9) — each reads only its domain doc. (Exact filenames left to planning.)
- **D-04:** **Durable `.planning/audit/` location** — catalogs are milestone-level living reference consumed by later phases via a fixed path, not phase-local artifacts. They survive independent of the phase-3 dir so Phases 4/6/7/8/9 reference one canonical location. (`.planning/` is tracked — commit normally with specific file paths; see canonical refs note.)
- **D-05:** **Three-tier classification: `safe` / `unsafe` / `needs-investigation`.** Downstream phases act only on `safe`; `needs-investigation` must be resolved before any removal. Honestly marks ambiguous findings (dynamic imports, possible external callers) instead of forcing a wrong binary call — the right fit for audit-before-action.

### Confidence bar & false-positive keep-list (the audit-before-action guardrail)
- **D-06:** **Conservative confidence bar.** Classify a finding `safe` **only when multiple independent signals agree** — static tool flags it AND grep/search finds no dynamic/string reference AND no external-caller/entrypoint path exists AND it isn't feature-flag/gated. Anything short of full agreement → `needs-investigation`. Rationale: under zero-functional-change, a false positive here becomes a broken production path in Phase 4/8.
- **D-07:** **First-class, enumerated keep-list** — a dedicated section every domain catalog cross-references, documenting the classes static analysis WILL wrongly flag dead, so nothing gated-but-live is ever classed `safe`. Known classes:
  - **Feature-flagged Interview Prep** behind `VITE_FEATURE_INTERVIEW_PREP` ("Coming Soon" on prod, live on staging/preview) — code/prompts/edge functions stay.
  - **Paddle-gated remnants** (`paddle_*` columns, `paddle-webhook` function) — gated on the last in-flight Paddle subscription expiring; document as gated, never `safe`.
  - **Edge functions invoked by name / external callers** (Stripe webhooks, internal job workers, pg_cron) — not statically reachable from the frontend, but live.
  - **Dynamic / string-keyed imports** and **deprecated-but-still-imported components** (e.g. `LockedSection`, `LockedListItem`, `ProFeatureBlur`) — only `safe` once all call sites confirmed gone.
- **D-08:** **Re-verify already-named cleanup targets now + record evidence** (don't just carry them forward as rumors). For each, verify current routing/usage in this phase and record evidence + gating status:
  - **Obsolete Phase 50 Ollama extraction path** — confirm against current (Phase 51 parser-first) routing.
  - **Retired `interview-prep-coach`** — no repo source; reportedly still deployed on staging+prod (confirm via `supabase functions list`); distinct from the gated-but-live `interview-prep-analyze`.
  - **`usage_tracking`** — record the current dual read/write reality (writers: every merit-path `record_ai_usage`; readers: `AnalysisHistory.tsx`, `useAchievements`, `usePaywallGuard`/`useTierAccess` via `can_perform_ai_action`) so Phase 8 (DB-04) has a confirmed dependency map, not "retained read-only".
  - **Paddle remnants** — record columns/functions + gating.
  These produce confirmed, evidence-backed starting points for Phases 4 (CLEAN-03) and 8 (DB-04).

### DB inventory source & environment (DB-01 / DB-02)
- **D-09:** **Triangulate from three sources:** `supabase/migrations/` (declared intent) + code references (call sites / who uses what) + **live read-only catalog introspection** (what's actually in the DB now). Migrations-only would be blind to drift (dashboard-made objects, policies/triggers/cron not in migration files); live introspection catches it and gives the strongest DB-02 "unused" evidence.
- **D-10:** **Production is the source of truth for live introspection, strictly read-only.** Prod is the only environment whose "unused" evidence means unused-in-production (the TEST project `cimjltzovkahkqecpwgi` is schema-drifted/synthetically-seeded — useful only as a structural cross-check). Restricted to read-only catalog/stat queries (`information_schema`, `pg_catalog`, `pg_stat_*`); **zero writes**. **Operator-gated:** requires operator-run queries or read credentials against prod — the plan must treat the live-prod queries as an operator step, not an autonomous write path.
- **D-11:** **Include runtime stats where available.** Use `pg_stat_user_tables` / row counts / `pg_stat_statements` (where enabled) to evidence tables/functions never read or written, on top of structural + code-reference analysis. Record caveats explicitly (stat counters reset on restart; `pg_stat_statements` may be disabled) so a low/zero-usage signal is read correctly.

### Performance-hotspot audit depth (PERF-01)
- **D-12:** **Static / code-review catalog only.** Phase 3 identifies and documents **suspected** hotspots from code review (e.g. `analyze-career` repeated `resumeText` slices, `usage_tracking` dual-write, merit-balance refetch races, oversized payloads). **Actual before/after measurement stays in Phase 9 (PERF-04)** — keeps the Phase 3 ↔ Phase 9 boundary clean (no measurement-harness work pulled forward into the audit).

### Claude's Discretion
- Exact tool selection per domain (knip vs ts-prune vs both; depcheck vs knip's dep coverage; the Deno reachability technique), the precise catalog filenames and internal schema/columns, the `npm run audit:*` script names/shape, the exact set of read-only catalog queries, and the finding-record format inside each domain doc are left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 3: Cross-Domain Inventory & Audit" — phase goal, depends-on (Phase 1), 5 success criteria; plus the Phase 4/6/7/8/9 entries that CONSUME these catalogs (each later phase's "from the Phase 3 inventory/catalog" wording).
- `.planning/REQUIREMENTS.md` §"Dead Code & Refactor Cleanup (CLEAN-01)", §"Dependency Hygiene (DEP-01)", §"Environment Variable Audit (ENV-01)", §"Database Cleanup (DB-01, DB-02)", §"Performance & Maintainability (PERF-01)" — the six requirements + the governing zero-functional-change constraint.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — hard constraint (zero functional change), audit-before-action sequencing, risk appetite, the carried-forward cleanup-target list.
- `.planning/STATE.md` §"Carried-Forward Cleanup Targets", §"Deferred Items", §"Blockers/Concerns" — the named targets to re-verify (D-08), the gated-but-live preservation rules, and the v4.0-baseline / branch facts.

### Codebase maps (grounding — verify before trusting; dated 2026-04-28, v3.0-era)
- `.planning/codebase/CONCERNS.md` — pre-mapped audit landscape: `usage_tracking` dual read/write (§5), legacy `interview-prep-coach` deployed-no-source (§4), Phase 27 unmerged history (§2), idempotency surfaces. Strong PERF-01 + DB-02 seed.
- `.planning/codebase/STRUCTURE.md` — dead-code candidates: deprecated lock primitives (`LockedSection`/`LockedListItem`/`ProFeatureBlur`), `PricingTable.tsx` (only referenced by its own test), `InterviewPrepInput.tsx` (unused), DEV-only sandbox route.
- `.planning/codebase/INTEGRATIONS.md` — env-var surface (§8: Stripe price IDs, `MERIT_SYSTEM_ENABLED`, `INTERNAL_JOB_SECRET`, `APP_URL`, etc.), Paddle remnants (§7), edge-function call graph (input for Deno reachability + the keep-list).
- ⚠ **`.planning/codebase/TESTING.md` is badly out of date** (per Phase 1) — do not trust for current state. Other maps predate v4.0; treat as leads to verify, not ground truth.

### Prior-phase context (decision patterns to stay consistent with)
- `.planning/phases/02-repository-hygiene-state-reconciliation/02-CONTEXT.md` — the evidence-doc pattern (D-01..D-03 there), `.planning/`-is-tracked staging rule, the secret-scan precedent this phase's catalogs mirror.
- `.planning/phases/01-testing-strategy-regression-baseline/01-CONTEXT.md` — `verify:baseline` command-set pattern (basis for D-01's re-runnable `audit:*` scripts), offline-vs-online rationale (basis for D-02).

### Repo conventions & policy
- `CONTRIBUTING.md` (repo root) — commit-message + branch conventions (Phase 2 REPO-04).
- `CLAUDE.md` — git rules, reliability priorities; pointer to `CONTRIBUTING.md`.

### ⚠ Stale instruction — reconcile, don't obey blindly
- **`.planning/` IS tracked now** (changed 2026-05-11, commit `a0bf4f5`). Some older docs/CLAUDE.md text still say "do not commit `.planning/`" — that is stale. Commit `.planning/` (including the new `.planning/audit/` catalogs) normally with **specific file paths**; never `git add -f`, never `git add -A`/`.`. (User memory: `feedback_no_planning_commits`.)

**No external ADRs/specs govern this phase** — all decisions are captured in `<decisions>` above; canonical inputs are the four `.planning/` docs + the codebase maps + prior CONTEXT files.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets / Existing structure
- **Edge-function shared layer** (`supabase/functions/_shared/`) — central call-graph hub (`anthropic.ts`, `merit-gateway.ts`, `usage-checker.ts`, `tier-config.ts`, `auth.ts`, `cors.ts`, `logger.ts`). Reachability analysis for Deno should root from the deployed function `index.ts` entrypoints + external callers, not from frontend imports.
- **`supabase/migrations/`** — declarative DB history (merit ledger `20260414…`, RPCs `20260415…`, topup `20260422…`, analysis_results readonly `20260420…`, etc.) — the declared-intent leg of D-09's triangulation.
- **`package.json` scripts** + `scripts/run-edge-tests.ps1` — existing command-set conventions the `npm run audit:*` scripts (D-01) should match in style.
- **Phase 2 evidence docs** (`.planning/phases/02-*/02-SECRET-SCAN.md`, `02-WORKTREE-DISPOSITION.md`) — format template for the per-domain catalogs.

### Established Patterns
- **Evidence files record classifications/counts/SHAs/call-sites, never raw secret values** (Phase 2 REPO-05 pattern) — applies to `ENV-INVENTORY.md` especially: list var names + consumers + required/optional, never values.
- **Fallible ops as discriminated unions**, structured logging, `requireAuth`/`requireInternalOrUserAuth` on every endpoint — context for mapping edge-function entrypoints and external callers.

### Integration Points / known audit seeds (verify in-phase)
- **Dead-code seeds:** deprecated lock primitives, `PricingTable.tsx` (test-only ref), `InterviewPrepInput.tsx` (unused), `/dev/locked-sections` sandbox (DEV-gated).
- **DB seeds:** `usage_tracking` (dual read/write — full call map in CONCERNS §5), Paddle columns/function, `can_perform_ai_action` vestigial gates (`usePaywallGuard`/`useTierAccess`).
- **Env seeds:** `VITE_*` (frontend flags incl. `VITE_FEATURE_INTERVIEW_PREP`, `VITE_ANALYZE_CAREER_FUNCTION`, `VITE_DEBUG_PERF`) + ~15 edge secrets (Stripe price IDs, Anthropic, Resend, Firecrawl, internal job secret, `APP_URL`, `MERIT_SYSTEM_ENABLED`).
- **PERF seeds:** `analyze-career` repeated input slicing, `usage_tracking` dual-write, merit-balance refetch races, parallel-call merge paths.

</code_context>

<specifics>
## Specific Ideas

- Proposed catalog set under `.planning/audit/`: `DEAD-CODE.md`, `DEPENDENCIES.md`, `ENV-INVENTORY.md`, `DATABASE.md`, `PERF-HOTSPOTS.md`, `KEEP-LIST.md` (or a shared keep-list section), `INDEX.md` (names final at planning).
- Re-runnable audit invoked via `npm run audit:*` (e.g. `audit:deadcode`, `audit:deps`) backed by committed config like `knip.json` — `npx`-driven, zero new devDeps.
- Live DB introspection = a recorded set of read-only catalog/stat queries an operator runs against prod and pastes/exports into `DATABASE.md`; the plan should treat this as an operator step.
- Every "safe to remove" classification must cite its concurring signals (tool + grep + no-external-caller + no-gate) inline, so Phase 4/8 can trust it without re-deriving.

</specifics>

<deferred>
## Deferred Ideas

- **Lightweight performance measurement / hotspot ranking** — considered for PERF-01 but deferred: actual before/after measurement is Phase 9 (PERF-04). Phase 3 is a static catalog only (D-12).
- **Acting on any finding** (removing dead code, pruning/bumping deps, consolidating env, dropping DB structures, applying perf refactors) — explicitly out of scope; that is Phases 4/6/7/8/9. This phase only catalogs + classifies.
- **Mechanical/CI enforcement of the audit** (e.g. failing CI on new dead code) — not in scope; the `audit:*` scripts are re-runnable on demand, CI wiring is a later/optional concern.
- **Dead CSS / asset / static-file audit** and **public-vs-internal export policy nuance** — surfaced as possible additional gray areas; not separately scoped this round. Can be folded into `DEAD-CODE.md` at planner discretion if cheap, otherwise a future pass.

None of the above is scope creep — discussion stayed within Phase 3's non-destructive-audit boundary.

</deferred>

---

*Phase: 3-cross-domain-inventory-audit*
*Context gathered: 2026-06-13*
