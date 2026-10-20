# Phase 8: Database Cleanup & Migrations - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Execute the **database-cleanup leg of v4.0** under the milestone's hard constraint of
**zero functional change** — acting on the Phase 3 evidence-backed inventory
(`.planning/audit/DATABASE.md`) and the Phase 7.1 advisory handoffs
(`.planning/audit/RUNTIME-RELIABILITY.md`). Four requirements:

1. **DB-03** — Execute confirmed-safe DB removals via reversible forward migrations behind validation.
2. **DB-04** — Evaluate the legacy `usage_tracking` retirement; execute **only if fully migrated and unreferenced**, otherwise document as gated with the blocking dependency named.
3. **DB-05** — Audit RLS policies for correctness + least-privilege with **no access-behavior regression**.
4. **DB-06** — Every DB change ships as a forward-migration script with a documented rollback path.

**Operating model (locked by CLAUDE.md MCP rules + Phase 7.1):**
- Canonical **prod** = `zjpjapgraoxdukdvpjes`, accessed **read-only** via the `supabase-prod-readonly` MCP server. Claude inspects + generates SQL; the **operator manually applies** every prod/destructive change (no Claude prod writes, ever).
- **Preview/test** = `cimjltzovkahkqecpwgi` (writable via `supabasepreview` MCP), currently **PAUSED**. This phase un-pauses it for test-first validation (see D-04/D-05).

**NOT in this phase (locked):**
- Perf-class RLS rewrites (`auth_rls_initplan` x62, `multiple_permissive_policies` x48) → **Phase 9**.
- The `usage_tracking` frontend-gate migration (removing the two live `can_perform_ai_action` call sites) → **gated/backlog**, not touched here (D-09).
- Paddle remnant removal → **gated** on the last in-flight Paddle subscription expiring (KEEP-LIST Class 2; roadmap backlog).
- Any new feature / schema redesign / AI-routing / pricing change; any Claude write to production.

</domain>

<decisions>
## Implementation Decisions

### Evidence re-confirmation (DB-03/04/05 precondition)

- **D-01: Full read-only re-pull from canonical prod is the BLOCKING first task.** The Phase 3 Source-C row-count / `pg_policies` evidence in `DATABASE.md` came from `cimjltzovkahkqecpwgi` — now known (Phase 7.1, line 244) to be the **paused preview/test** project, NOT canonical prod `zjpjapgraoxdukdvpjes` (operator-confirmed prod in Phase 04: live Stripe secrets, OLLAMA_BASE_URL unset). The advisories (233) WERE pulled from canonical prod in Phase 7.1 and are trusted. **Before authoring or applying any migration, Phase 8 Task 1 must:** (a) formally confirm the canonical prod project-ref, (b) re-run the committed read-only pack `.planning/audit/queries/db-introspection.sql` against `zjpjapgraoxdukdvpjes` via `supabase-prod-readonly`, (c) re-classify any `cimjltzovkahkqecpwgi`-sourced Phase 3 reading as preview-sourced, and (d) record the corrected evidence. This settles the memo'd "Phase 8 still owes formal re-confirmation" and is needed anyway to sync preview (D-05). Chosen over targeted re-pull and over trust-prod-advisories-only.
  - **Watch-for:** the re-pull may *change* verdicts. If true prod (`zjpjapgraoxdukdvpjes`) shows different data than the preview capture (e.g. `usage_tracking` row counts, `saved_jobs` existence, the live `linkedin_grades` policy name/qual), the DB-02 classifications must be re-derived against the corrected evidence before acting.

### RLS audit appetite (DB-05)

- **D-02: Apply security-class least-privilege wins only; defer perf-class to Phase 9.** The DB-05 audit *documents* every RLS finding regardless, but the migrations Phase 8 **applies** are limited to the zero-observable-change security/least-privilege items: `linkedin_grades` "Anyone can view" → owner-scoped SELECT; pin `function_search_path_mutable` x2 (`increment_rate_limit`, `ts_to_utc_date`); `rls_enabled_no_policy` x3 (`alert_state`, `rate_limit_counters`, `stripe_webhook_events` — explicit-deny or confirm service-role-only intent); `security_definer_view` x4 (analytics views → `security_invoker` or documented accepted-risk); and the EXECUTE-grant revokes (x30 anon + x30 authenticated on SECURITY DEFINER RPCs) where unintended. The `rls_policy_always_true` x2 (`paddle_webhook_events` gated, `scheduled_emails`) and the **perf-class** advisories (`auth_rls_initplan` x62, `multiple_permissive_policies` x48) are documented but **deferred to Phase 9**. The `public_bucket_allows_listing` storage advisory and the `unused_index`/`unindexed_foreign_keys` perf items are likewise document-and-defer. Chosen over "minimal — only linkedin_grades" and over "full — security + perf".

- **D-03: Grant-altering fixes are VERIFY-THEN-APPLY.** Any fix that technically changes a grant — `linkedin_grades` (public→owner-only SELECT) and the EXECUTE-from-anon revokes — is applied **only after** a read-only prod check (`supabase-prod-readonly`) **plus** a code read-map confirms no live caller depends on the current permissive grant. Static evidence already supports this (`linkedin_grades` app reads are service-role: `lifecycle-archive-writer`, `send-feature-email`; frontend reads are owner-scoped; the revokes target unintended anon grants). Anything **not provably safe** ships generated-but-UNAPPLIED + is documented as gated. This keeps zero-observable-change *provable*, not assumed. Chosen over "apply on static evidence" and over "document-only, defer all application".

### Migration validation & application model (DB-06 / NFR-02)

- **D-04: Un-pause preview and validate test-first.** Despite the Phase 7.1 paused-preview precedent (which deferred live smoke), Phase 8 honors CLAUDE.md MCP rule 5 ("test against preview/staging first"): the operator **un-pauses** the preview project `cimjltzovkahkqecpwgi`, and every Phase 8 migration is applied + validated against preview (via `supabasepreview` MCP) **before** the operator applies it to prod. Un-pausing preview is an operator action → an `autonomous:false` checkpoint at execute time. Chosen over the offline-gate + defer-live-smoke default and over the per-migration hybrid.

- **D-05: Sync preview to current schema first; every migration goes through preview.** For test-first to be meaningful, on un-pause preview is **first brought up to the repo's current migration state** and its structure **read-only-confirmed to match prod** (using the D-01 prod re-pull as the reference) — preview has been paused/possibly drifted since Phase 3 introspected it. Then **every** Phase 8 migration runs preview → operator review → operator applies to prod (a hard gate; no migration skips preview). Chosen over "sync + risky-only gate" and over "test preview as-is (no reconcile)".
  - Post-apply on prod, run a **read-only MCP verification** (advisory re-cleared + `pg_policies` shape + a targeted no-regression read) to confirm the change landed as intended.

### usage_tracking (DB-04) & confirmed-safe removals (DB-03)

- **D-06: usage_tracking — document GATED, no live-code surgery.** `usage_tracking` is heavily written (7+ functions via `record_ai_usage`/`check_and_record_ai_usage`) and its legacy gate `can_perform_ai_action` is **still called live** in `src/components/Navbar.tsx:109` + `src/pages/SkillsGapAnalysis.tsx:108` (the paywall hooks `usePaywallGuard`/`useTierAccess` already migrated off it — they carry negative assertions). Per the roadmap ("retire only if fully migrated and unreferenced; otherwise document as gated"), Phase 8 leaves those two call sites **byte-identical** (editing live paywall-gate code is functional-change risk) and documents `usage_tracking` + the `can_perform_ai_action` cluster as **gated**, with the blocking dependency named (two live FE call sites + 7+ live writers). Retirement stays a backlog item. Chosen over "advance retirement (remove the call sites)" and over "decide after re-pull".

- **D-07: DB-03 — evidence-gated removals + documentation reconcile.** Phase 3's DB-02 found **0 confirmed-safe** public structures. After the D-01 re-pull, Phase 8 authors forward+rollback migrations **only** for structures the fresh 3-source prod evidence promotes to confirmed-safe (expect few/none). The `saved_jobs` declared-but-absent drift is reconciled by **what true prod shows**: if it exists on `zjpjapgraoxdukdvpjes`, the Phase 3 "absent" was a wrong-project artifact (resolved by re-pull); if genuinely absent, reconcile the migration history via **documentation/repair**, NOT a destructive drop. Paddle remnants stay gated. Chosen over "pure-documentation DB-03 (forecloses acting)" and over "aggressive cluster removal (against zero-change)".

- **D-08: DB-06 — forward + rollback for every change.** Every migration this phase ships ships with a documented rollback path (the pattern is already established by the Phase 7.1 RUN-06 `linkedin_grades` handoff: a faithful rollback restoring the captured prior policy). Rollback fidelity for grant changes must match whatever the **live** prior policy is (re-confirm via fresh `pg_policies` read before applying — the captured name/qual may have drifted).

### Claude's Discretion
- Cron/log items routed to Phase 8 by Phase 7.1 but not central to DB-03..06 — the `http_request_queue` NULL-url recurring cron ERROR (LOG-1) and the deploy-drift function orphans `analyze-career-v2` (stale v9) + `chat-agent` — are **document-and-route** (operator/cron-config fixes; the function orphans were routed to Phase 4 CLEAN-03 and are edge functions, not DB structures). Surface them in the phase notes; do not treat as DB migrations.
- Plan/wave slicing; the exact migration-file timestamps + naming (follow the existing `YYYYMMDDHHMMSS_description.sql` convention); register/evidence-doc home for the re-pull results; precise per-policy SQL — all left to research + planning, consistent with the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements (locked)
- `.planning/ROADMAP.md` §"Phase 8: Database Cleanup & Migrations" — the goal + the 4 success criteria (DB-03/04/05/06) + the Depends-on (Phase 3, 5, 6). Also §"Backlog / Parking Lot" for the gated Paddle + `usage_tracking` full-deletion items.
- `.planning/REQUIREMENTS.md` §"Database Cleanup (DB)" — DB-03/04/05/06 statements + the governing **zero-functional-change** constraint.
- `.planning/PROJECT.md` §"Current Milestone: v4.0" — the hard constraint + brownfield-maintenance framing + git rules (never `-A`/`.`/`-f`; `.planning/` is tracked).

### The evidence Phase 8 acts on (Phase 3 audit)
- `.planning/audit/DATABASE.md` — DB-01 inventory + DB-02 flagging (0 `safe`). Contains: the `usage_tracking` dual read/write call map, the Paddle remnant map (KEEP-LIST Class 2), the over-permissive `linkedin_grades` RLS finding, the **PROJECT-REF DISCREPANCY caveat** (D-01 driver), the `saved_jobs` declared-but-absent drift, and the Phase-8 consuming-phase notes.
- `.planning/audit/queries/db-introspection.sql` — the committed **read-only** introspection pack to **re-run** against canonical prod (D-01). Section 0 first (skip Section 8 if `pg_stat_statements` absent).
- `.planning/audit/queries/db-introspection-results.md` — the **2026-06-13 capture** (catalog metadata only). NOTE: sourced from `cimjltzovkahkqecpwgi` (preview/test) — re-classify per D-01.
- `.planning/audit/KEEP-LIST.md` — the never-`safe` gate: Class 1 (gated Interview-Prep), Class 2 (Paddle remnants), Class 3 (6 active cron-invoked structures). Governs any "is this safe to drop?" call.

### Phase 7.1 advisory handoffs (the DB-05 input)
- `.planning/audit/RUNTIME-RELIABILITY.md` — the full advisory triage (233 advisories; 232 DB-class `deferred-to-Phase-8`). Key sections:
  - §"Advisory findings (security)" + §"Advisory findings (performance)" — the per-advisory rows (class, affected objects, decision, verification command, rollback note) Phase 8 DB-05 actions/defers.
  - §"RUN-06 - linkedin_grades RLS Phase-8 handoff" (lines ~239-325) — the **AUTHORED-BUT-UNAPPLIED forward+rollback SQL** for the `linkedin_grades` fix (D-03), the read-only verification command, and the operator note to re-confirm the live policy name/qual before applying.
- `.planning/audit/RESIDUAL-REGISTER.md` — the append-only deferral/accepted-risk register; any deferred-to-Phase-9 RLS item or deferred verification lands here.
- `.planning/audit/INDEX.md` — the `.planning/audit/` catalog entry point.

### Prior decisions / patterns (locked upstream — do not re-litigate)
- `.planning/phases/07.1-runtime-reliability-review/07.1-CONTEXT.md` — the **MCP access model** (`supabase-prod-readonly` read-only prod = `zjpjapgraoxdukdvpjes`; `supabasepreview` writable preview = `cimjltzovkahkqecpwgi` PAUSED), the names-not-values discipline, the generated-but-unapplied-migration handoff pattern (Pattern F), and the D-06 deferred-live-smoke convention.
- `.planning/phases/07.1-runtime-reliability-review/07.1-04-SUMMARY.md` — the `linkedin_grades` handoff authoring decisions (faithful rollback, re-confirm-before-apply note).
- `.planning/phases/06-dependency-hygiene/06-CONTEXT.md` + STATE.md `DI-06-05-01` — the per-risky-change validation + rollback path (NFR-02), the paused-preview + deferred-live-smoke precedent, the atomic-commit/ledger conventions.
- `CLAUDE.md` §"Coding Style" MCP rules 1-8 — the prod-read-only / operator-applies-prod / rollback-for-every-migration / test-preview-first access policy that governs this entire phase.

### The act-on code surfaces (RLS read-map + the gated call sites)
- `supabase/migrations/` — the forward migrations live here; follow the `YYYYMMDDHHMMSS_description.sql` convention. Existing `linkedin_grades` policy history: `20251129_create_all_tables.sql:182` ("Anyone can view"), `20251218042310_*.sql` + `20251223075804_*.sql` (owner-scoping attempts), `20260417000000_usage_tracking_user_select_policy.sql` (the owner-scoped analog to mirror).
- `src/components/Navbar.tsx:109` + `src/pages/SkillsGapAnalysis.tsx:108` — the two **live** `can_perform_ai_action` call sites (D-06: leave byte-identical).
- `supabase/functions/lifecycle-archive-writer/index.ts` + `supabase/functions/send-feature-email/index.ts` — service-role `linkedin_grades` readers (evidence the public SELECT policy is unused by app behavior → D-03 safe).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`.planning/audit/queries/db-introspection.sql`** — the committed read-only introspection pack; re-runnable verbatim against canonical prod for D-01 (and the post-apply read-only verification under D-05).
- **Phase 7.1 RUN-06 forward+rollback SQL** (in `RUNTIME-RELIABILITY.md`) — the `linkedin_grades` fix is **pre-authored** with a faithful rollback; Phase 8 sequences it into `supabase/migrations/` with a real timestamp after re-confirming the live policy name.
- **`20260417000000_usage_tracking_user_select_policy.sql`** — the canonical owner-scoped-SELECT policy analog (`FOR SELECT TO authenticated USING (auth.uid() = user_id)`) to mirror for `linkedin_grades` and any similar tightening.
- **`scripts/deploy.ps1` + `verify:baseline`** — the offline regression gate (vitest + offline-deno + Playwright) re-run as this phase's zero-functional-change proof; keep `.ps1` pure-ASCII if touched (project memory).

### Established Patterns
- **MCP prod is READ-ONLY; operator applies all prod/destructive changes** (CLAUDE.md rules 3/4/8) — the spine of D-01/D-04/D-05.
- **Generated-but-unapplied migration handoff embedded in the register row** (Phase 7.1 Pattern F) — Phase 8 owns sequencing these into `supabase/migrations/` at apply time.
- **Names-not-values in every committed doc** (Phase 2 REPO-05) — run the secret-grep guard over any re-pull results doc before commit; never paste a connection string / project-ref-as-secret / row data.
- **Demote-on-doubt KEEP-LIST gate** + `safe`-requires-all-three-sources-agree (Phase 3 D-06) before treating any structure as removable.
- **Pure-ASCII `.ps1`** (project memory: Win PowerShell 5.1 reads cp1252).

### Integration Points
- **MCP servers** — `supabase-prod-readonly` (inspect prod, never write) + `supabasepreview` (writable preview, PAUSED until operator un-pauses for D-04). Planner verifies connectivity + records the access model verbatim.
- **Preview ↔ prod schema parity** — D-05 requires preview synced to the repo's current migration state + structurally confirmed against prod before test-first validation is meaningful.
- **Frontend ↔ RLS** — `linkedin_grades` owner-scoping must not regress any live read; the app's reads are service-role (cron/email) or owner-scoped (frontend), so the tightening is zero-observable-change (confirm via read-map per D-03).

</code_context>

<specifics>
## Specific Ideas

- The operator chose the **thorough, conservative** option in every area: full prod re-pull as a blocking precondition; un-pause + sync preview for true test-first (deviating from the Phase 7.1 defer-live-smoke default *toward* more validation); apply only provably-zero-change security fixes; leave live paywall-gate code untouched. This is the same stance as Phases 7/7.1: act surgically, freeze live behavior, prove zero-change rather than assume it, and never let Claude write prod.
- The single biggest accidental-functional-change risk is an RLS tightening or EXECUTE-revoke that a live caller actually depends on — which is exactly why D-03 hard-gates grant changes behind read-only prod verification + a code read-map, and D-05 routes every migration through synced preview first.
- The project-ref discrepancy is the load-bearing uncertainty: the Phase 3 evidence may not reflect true prod at all (Phase 04 operator-confirmed `zjpjapgraoxdukdvpjes` = prod with live Stripe secrets). Everything downstream waits on the D-01 re-pull.

</specifics>

<deferred>
## Deferred Ideas

- **Perf-class RLS rewrites** — `auth_rls_initplan` x62 (wrap `auth.uid()` in scalar subselect) + `multiple_permissive_policies` x48 (consolidate overlapping policies) → **Phase 9** (Performance & Maintainability). Documented in the DB-05 audit, applied later.
- **`usage_tracking` retirement + the `can_perform_ai_action` frontend-gate migration** — removing the two live `Navbar`/`SkillsGapAnalysis` call sites and retiring the RPC + table → **backlog/future** (D-06); gated on a full FE migration that is itself functional-change work outside zero-change.
- **Paddle remnant removal** (`paddle_webhook_events` table, `profiles.paddle_*` x3 cols, `paddle-webhook` fn) — **gated** on the last in-flight Paddle subscription expiring (KEEP-LIST Class 2; roadmap backlog).
- **`unused_index` x42 / `unindexed_foreign_keys` x8** — index hygiene; document in the audit, defer drops to a longer-observation window / Phase 9 (reversible `CREATE INDEX` rollback).
- **Storage `public_bucket_allows_listing`** (public-assets bucket anon listing) — document + route to operator/Phase 9; confirm intended-public vs. restrict.
- **`http_request_queue` NULL-url recurring cron ERROR (LOG-1)** + **deploy-drift function orphans** (`analyze-career-v2` stale v9, `chat-agent`) — non-DB-migration operator/cron-config + edge-function items; document-and-route, not Phase 8 DB migrations.
- **Shared `_shared/errors.ts` taxonomy helper** — already deferred to a Phase-9 maintainability candidate (Phase 7.1 D-04); not re-opened here.

None of the above is scope creep — discussion stayed inside Phase 8's DB-03..06 boundary; the deferrals are how-far-under-zero-change scoping decisions (perf → Phase 9; gated removals → backlog).

</deferred>

---

*Phase: 8-database-cleanup-migrations*
*Context gathered: 2026-06-24*
