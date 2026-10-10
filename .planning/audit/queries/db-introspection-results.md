# DB Introspection — Live Results (Source C')

> **Read-only PROD introspection** re-pulled for Phase 8 plan 08-01 (DB-01/DB-02/DB-03/DB-04/DB-05).
> Catalog metadata ONLY (object names / counts / signatures / policy names / advisor
> categories / index names). **No secret values, no row data, no connection strings, no
> decrypted_secrets.** Names-not-values / REPO-05 discipline holds throughout. Project refs
> are public identifiers (this doc's prior 2026-06-13 capture already recorded
> `cimjltzovkahkqecpwgi` openly), NOT secrets.

**Run date:** 2026-06-24
**Source:** canonical PROD `zjpjapgraoxdukdvpjes` via the `supabase-prod-readonly` MCP server,
pinned `project_ref=zjpjapgraoxdukdvpjes&read_only=true&features=database,debugging,docs`.
**ZERO writes** — every statement is a read-only `pg_catalog` / `information_schema` / `pg_stat_*`
/ `pg_policies` / `cron.job` SELECT plus `list_tables` / `get_advisors` / `list_migrations`
(no INSERT/UPDATE/DELETE/DDL/GRANT/REVOKE anywhere). Operator-authorized 2026-06-24.
**Canonical prod ref:** `zjpjapgraoxdukdvpjes` — **OPERATOR RE-CONFIRMED 2026-06-24** (the formal
Phase-8 re-confirmation the project memo owed). Corroborated THREE ways: (1) `.mcp.json` pins
`supabase-prod-readonly -> project_ref=zjpjapgraoxdukdvpjes&read_only=true`; (2) `scripts/deploy.ps1`
L73-75 (`production -> zjpjapgraoxdukdvpjes`; `staging`/`test -> cimjltzovkahkqecpwgi`); (3) the
Section-6 `cron.job` host check below.
**`pg_stat_statements`:** ENABLED (v1.11). Section 8 not captured here (Phase-9 perf cross-signal;
not needed for the 08-01 verdicts).
**`stats_reset` (pg_stat_database, postgres):** `null` on true prod — counters span since
provisioning / last restart with no manual reset. Record alongside any count (D-11 caveat).

---

## RESOLVED: the project-ref discrepancy (Open Question 1 — the reason 08-01 exists)

The prior **2026-06-13** capture in this file (now superseded — see the dated block at the bottom)
recorded `Project ref observed (cron URLs + functions list): cimjltzovkahkqecpwgi`, with
real-user-scale data (17 profiles, 118 resumes, 76 merit_transactions, 22 auth users) and a
`Discrepancy to reconcile` caveat. **That caveat is now RESOLVED:** the operator has confirmed
`cimjltzovkahkqecpwgi` (strivoaipreview) is the **preview / test / staging** project (matching
`scripts/deploy.ps1` `staging`/`test -> cimjltzovkahkqecpwgi`), **NOT** canonical prod. The
2026-06-13 capture was therefore the **PREVIEW** project, not prod. Canonical prod
`zjpjapgraoxdukdvpjes` is **near-empty real-user data**:

| Table | TRUE prod `zjpjapgraoxdukdvpjes` (2026-06-24) | Prior mislabeled capture `cimjltzovkahkqecpwgi` / preview (2026-06-13) |
|-------|---------|---------|
| profiles | 1 | 17 |
| resumes | 3 | 118 |
| merit_transactions | 4 | 76 |
| auth.users | 1 | 22 |
| usage_tracking | 4 (n_tup_ins 4, idx_scan 54 — still actively written) | 294 |
| feature_usage | 237 (n_tup_ins 76) | 161 |

**Implication for DB-02 / DB-04 (re-derived in DATABASE.md):** the Phase-3 disuse verdicts were
computed against the WRONG DB (preview). On true prod, total traffic is so low that pg_stat
zero/low counts reflect **low total traffic, not feature-specific disuse** — they are NOT reliable
disuse evidence (D-11: corroborating, never sole; here not even corroborating). The conservative
gated/keep verdicts therefore **HOLD or strengthen**; nothing crosses the DB-03/DB-04 removal-on-disuse
bar. `usage_tracking` stays GATED (still actively written; DB-04 gated).

---

## SECOND DISCREPANCY (NEW — needs-operator, NOT a Phase-8 DDL target)

True prod `zjpjapgraoxdukdvpjes` `cron.job` `net.http_post` URLs are hardcoded to the **PREVIEW**
project's functions host `https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/...` for jobs
`keep-warm-ping` and `extract_catchup_nightly` (Section 6). Job `reset-subscription-merits-sweep`
uses the `current_setting('app.functions_base_url', true)` GUC instead. This is a **prod-config**
finding (prod cron invoking PREVIEW edge functions) routed to the operator — recorded as
`needs-operator` in `RESIDUAL-REGISTER.md`. **No migration is authored for it in this phase**
(it is a cron/config fix, not a DB-03..06 DDL target — CONTEXT Claude's-Discretion document-and-route).

> **Cross-check confirmation (Section-6 host check, Task 1(a).3):** these PREVIEW-host cron URLs on
> the prod project are exactly the artifact that proves the 2026-06-13 capture (whose cron URLs were
> `cimjltzovkahkqecpwgi`) was run against the preview project — the load-bearing discrepancy 08-01
> was created to settle.

---

## Section 0 — Extensions (installed)

| extname | version | schema |
|---------|---------|--------|
| pg_cron | 1.6.4 | pg_catalog |
| pg_net | 0.19.5 | extensions |
| pg_stat_statements | 1.11 (ENABLED) | extensions |
| pgcrypto | 1.3 | extensions |
| pgsodium | (default) | — |
| uuid-ossp | 1.1 | extensions |
| supabase_vault | 0.3.1 | vault |
| plpgsql | 1.0 | pg_catalog |

(Section 8 `pg_stat_statements` is available; not captured here — Phase-9 perf cross-signal.)

## Section 1 — Tables & views (public schema; DB-01 inventory; drift vs Source A)

**public — BASE TABLES (37):** alert_state, analysis_cache, analysis_jobs, analysis_results,
applications, benchmarks, career_targets, feature_usage, improvement_checklist,
interview_quiz_answers, interview_quizzes, interview_streaks, job_descriptions, linkedin_grades,
linkedin_versions, merit_feature_costs, merit_shop_purchases, merit_transactions, outcomes,
paddle_webhook_events, profiles, rate_limit_counters, recommendations, resume_bullets,
resume_score_history, resume_sections, resume_versions, resumes, scheduled_emails, scores,
stripe_webhook_events, upgrade_requests, usage_tracking, user_achievements, user_edits,
user_merits, user_roles.

**public — VIEWS (5):** cohort_peers, v_conversion_funnel, v_feature_consumption_daily,
v_merits_in_circulation, v_shop_purchases_daily.

**`saved_jobs` ABSENT on prod** — confirms Open Question 2 / D-07 (declared in bootstrap
`20251129_create_all_tables.sql` as `CREATE TABLE IF NOT EXISTS`, but NOT present on canonical prod).
Reconcile by documentation/repair, NEVER a destructive drop (see DATABASE.md reconciliation block).

**`paddle_webhook_events` still present** (legacy Paddle idempotency table; KEEP-LIST Class 2,
gated on the last in-flight Paddle subscription expiring — never a Phase-8 drop).

**Drift note:** Source A (migrations) declares `saved_jobs`; prod does NOT have it (declared-but-absent
drift). `analysis_cache` EXISTS on prod (CONCERNS.md §8 "no cache" is STALE — confirmed v3.0).

## Section 2a — Per-table row counts + activity (DB-02 stats — read against `stats_reset = null`)

Non-zero public tables on true prod (n_live_tup): feature_usage 237 (n_tup_ins 76),
merit_transactions 4, analysis_results 4, usage_tracking 4 (n_tup_ins 4, idx_scan 54 — actively
written), resumes 3, scheduled_emails 3, scores 3, linkedin_grades 2 (seq_scan 104), analysis_jobs 2,
linkedin_versions 2, analysis_cache 2, user_achievements 2, profiles 1, user_merits 1,
career_targets 1, resume_sections 1, resume_versions 1, applications 1, resume_score_history 1.

**ALL OTHER public tables n_live_tup = 0** (incl. interview_quizzes/_answers/_streaks, outcomes,
benchmarks, job_descriptions, paddle_webhook_events, stripe_webhook_events, recommendations,
resume_bullets, user_edits, user_roles, upgrade_requests, merit_shop_purchases, merit_feature_costs,
rate_limit_counters, alert_state).

> **D-11 caveat (load-bearing for this re-pull):** a 0-count here is **LOW TOTAL TRAFFIC** (a 1-user
> prod), **NOT feature disuse**. Do NOT treat any 0/low count as DB-03/DB-04 removal evidence. This is
> the core correction vs the preview-sourced 2026-06-13 reading, where higher counts came from
> 17-profile / 22-user preview traffic.

## Section 2b — stats_reset

`postgres` -> `null` (no manual reset; counters span since provisioning/last restart).

## Section 3 — Functions / RPCs (public, 34; DB-04 + DB-05 EXECUTE input)

**SECURITY DEFINER = false (INVOKER):**
- `increment_rate_limit(p_key text, p_window_start bigint)` — **proconfig = null** (search_path
  UNPINNED). DB-05 `function_search_path_mutable` target. Its body writes UNQUALIFIED
  `rate_limit_counters` (INSERT + ON CONFLICT) as invoker -> **pin `SET search_path = public`, NOT
  `= ''`** (Pitfall 3; `= ''` would break the unqualified reference -> 500 on a live rate-limit path).
  Routed to 08-04.
- `ts_to_utc_date(ts timestamptz)` — **proconfig = null** (search_path UNPINNED). DB-05 target.
  Pure tz expression, NO table/object access -> safe with `SET search_path = ''`. Backs UNIQUE INDEX
  `idx_benchmarks_unique_per_day` -> use `ALTER FUNCTION` (not `CREATE OR REPLACE`). Routed to 08-03.
- `get_usage_limit` (search_path = public, already pinned); `update_updated_at_column`
  (search_path = public, trigger fn).

**SECURITY DEFINER = true (x30 distinct functions; proconfig already pinned `search_path = public` or
`public, pg_temp`)** — these carry the `anon_/authenticated_security_definer_function_executable` x60
advisory set (08-05 EXECUTE-grant read-map):
admin_set_user_credits, admin_set_user_merits, admin_upgrade_user, auth_owns_version,
auto_provision_user_merits, can_perform_ai_action **[legacy gate — still live FE consumers
Navbar.tsx:109 + SkillsGapAnalysis.tsx:108; authenticated EXECUTE is load-bearing -> STAYS GATED]**,
check_and_deduct_merits, check_and_record_ai_usage, credit_shop_merits, get_admin_usage_stats,
get_ai_failure_rate_1h, get_billing_period_start, get_merit_balance, get_pending_upgrade_requests,
get_shop_failure_rate_1h, get_user_usage, get_user_usage_breakdown, grant_upgrade_diff,
handle_new_user, has_role, queue_welcome_sequence, reconcile_merit_balance,
record_ai_usage (**TWO overloads** — 4-arg incl `p_analysis_id`, and 3-arg), record_feature_usage,
record_recommendations_shown, refund_merits, reset_subscription_merits, run_benchmarks_rollup
**[cron]**, run_lifecycle_sweep **[cron]**.

> Note vs Source A: the legacy 3-arg `check_and_deduct_merits` overload was dropped by
> `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` — prod confirms the surviving surface.

## Section 4 — RLS policies (DB-05 input; full set captured)

**OVER-PERMISSIVE (DB-05 / RUN-06 target -> 08-04):** `linkedin_grades` policy
**"Anyone can view linkedin grades"** = cmd SELECT, roles `{public}`, **qual `true`** — **CONFIRMED
PRESENT on canonical prod.** It COEXISTS with the correct owner-scoped
`"Users can view their own LinkedIn grades"` (SELECT, qual `auth.uid() = user_id`). RESOLVES Open
Question 1 (linkedin_grades): the over-permissive policy IS live on prod -> **Plan 08-04 applies the
fix** = DROP the over-permissive `"Anyone can view linkedin grades"` (the owner-scoped SELECT already
exists, so the forward is just the DROP; operator re-confirms the live name/qual before applying, D-08).

**`rls_policy_always_true` [WARN] x2 (service-role management, by design — NOT user-facing leaks):**
- `paddle_webhook_events` — "Service role can manage webhook events" (ALL, role public, true/true).
- `scheduled_emails` — "Service role can manage all scheduled emails" (ALL, role public, true/true).
Both are system-managed service-role tables; documented, deferred (D-02 perf/always-true class).

**`rls_enabled_no_policy` [INFO] x3 (RLS enabled, zero policies => implicit deny-all for
anon/authenticated; 08-03 explicit-deny):** `alert_state`, `rate_limit_counters`,
`stripe_webhook_events` (all service-role-only by design; service_role bypasses RLS).

All other public tables: correct owner-scope (`auth.uid() = user_id`), admin `has_role(...)`, or
intentional read-all reference tables (`benchmarks_select_aggregate` true authenticated;
`merit_feature_costs_select_all` true authenticated).

## Section 5 — Triggers (public, via information_schema.triggers)

EMPTY result set under the querying role. Trigger FUNCTIONS exist (`auto_provision_user_merits`,
`handle_new_user`, `update_updated_at_column` — see Section 3) but their triggers are on
`auth.users` / not visible to `information_schema` for this role. Record: "no public.* triggers
visible via information_schema; trigger fns present." Not a DB-03/05 target.

## Section 6 — pg_cron jobs (6 active; KEEP-LIST Class 3)

| jobid | jobname | schedule | command (host check) |
|------:|---------|----------|----------------------|
| 1 | keep-warm-ping | */5 * * * * | net.http_post -> **cimjltzovkahkqecpwgi**.supabase.co/functions/v1/keep-warm (PREVIEW host — see discrepancy #2) |
| 4 | cleanup-rate-limit-counters | 0 * * * * | DELETE rate_limit_counters older than 2h (pure SQL) |
| 5 | reset-subscription-merits-sweep | */15 * * * * | net.http_post -> current_setting('app.functions_base_url', true) (GUC) |
| 6 | extract_catchup_nightly | */15 * * * * | net.http_post -> **cimjltzovkahkqecpwgi**.supabase.co/functions/v1/extract-analysis-structure (PREVIEW host — see discrepancy #2) |
| 7 | benchmarks_nightly | 0 3 * * * | run_benchmarks_rollup() (pure SQL) |
| 8 | lifecycle_sweep_nightly | 0 4 * * * | run_lifecycle_sweep() (pure SQL) |

(6 jobs matches Source A. Jobs 1 & 6 hardcoded to the PREVIEW functions host -> the
prod-cron-invokes-preview finding, routed needs-operator.)

## Section 7 — Indexes (PERF-class; Phase 9, NOT this phase)

Not enumerated in full. The performance advisor flags `unused_index` x41 (idx_scan = 0 on public
indexes) and `unindexed_foreign_keys` x8 — both PERF-class -> Phase 9. **D-11 caveat: idx_scan = 0 on
a 1-user prod is low traffic, NOT disuse** -> NOT a Phase-8 removal target.

## Section 8 — pg_stat_statements

ENABLED (not captured here; Phase-9 perf cross-signal).

---

## DB-05 advisor sets (canonical prod `get_advisors`) — maps EXACTLY to the plan waves

**SECURITY (73 lints):**
- `security_definer_view` [ERROR] **x4** -> **08-03**: v_merits_in_circulation,
  v_feature_consumption_daily, v_shop_purchases_daily, v_conversion_funnel. (`cohort_peers` NOT flagged.)
- `function_search_path_mutable` [WARN] **x2**: `ts_to_utc_date` (`= ''`, 08-03) +
  `increment_rate_limit` (`= public`, 08-04 — Pitfall 3).
- `rls_enabled_no_policy` [INFO] **x3** -> **08-03** explicit-deny: alert_state, rate_limit_counters,
  stripe_webhook_events.
- `anon_security_definer_function_executable` [WARN] **x30** +
  `authenticated_security_definer_function_executable` [WARN] **x30** -> **08-05** x60 EXECUTE-grant
  read-map -> revoke-provably-unused-or-gate (`can_perform_ai_action` authenticated EXECUTE STAYS
  gated — live FE RPC).
- `rls_policy_always_true` [WARN] **x2** (paddle_webhook_events, scheduled_emails) — service-role by
  design; document.
- `auth_leaked_password_protection` [WARN] **x1** — Supabase Auth setting, **needs-operator**, not a
  migration.
- `public_bucket_allows_listing` [WARN] **x1** (storage public-assets) — storage config,
  **needs-operator**, not a public-schema migration.

**PERFORMANCE (159 lints) -> ALL Phase 9 (perf-class; 08-05 routes out):**
- `auth_rls_initplan` [WARN] **x62** (29 tables; wrap `auth.uid()` in a scalar subselect).
- `multiple_permissive_policies` [WARN] **x48** (improvement_checklist, linkedin_grades, resumes,
  upgrade_requests, user_roles).
- `unindexed_foreign_keys` [INFO] **x8**; `unused_index` [INFO] **x41**.

## Migrations applied on prod (`list_migrations`): 76 total

Latest applied = `20260607050000_allow_resume_document_mime_types` — identical to the repo
`supabase/migrations/` HEAD. This is the prod migration baseline for the **08-02 preview->prod
parity gate** (the preview project, now unpaused, is brought up to this state and read-only-confirmed
against prod before any test-first migration).

---

## Preview parity confirmation (Plan 08-02 — preview `cimjltzovkahkqecpwgi`, 2026-06-24)

> **Read-only PREVIEW + read-only PROD parity capture** for Phase 8 plan 08-02 (D-04 / D-05).
> Source: preview `cimjltzovkahkqecpwgi` via the `supabasepreview` MCP (operator-authorized,
> read-only here) compared against canonical prod `zjpjapgraoxdukdvpjes` via `supabase-prod-readonly`.
> Catalog metadata ONLY (object names / counts / policy names / advisor categories). **No secret
> values, no row data, no connection strings.** Names-not-values / REPO-05 holds throughout. Project
> refs are public identifiers, NOT secrets. **ZERO writes to preview or prod** — no `db push`,
> no `apply_migration`, no DDL/GRANT/REVOKE anywhere. The executor authored this from the
> orchestrator's read-only evidence handoff and opened no DB connection.

### Task 1 — preview un-paused + synced to repo HEAD: VERIFIED NO-OP (drift quantum = 0)

- Preview `cimjltzovkahkqecpwgi` is **UNPAUSED + ACTIVE** (operator 2026-06-24; the `supabasepreview`
  MCP is connected and answering).
- `supabasepreview list_migrations`: **76 migrations applied**, latest =
  `20260607050000_allow_resume_document_mime_types` — **== repo HEAD == prod HEAD**.
- **Drift quantum = 0 (none — already at HEAD).** Preview was ALREADY at repo HEAD; NO
  `supabase db push` / `apply_migration` was needed or performed, and there was no conflict (nothing
  to push). Task-1 sync is a **verified no-op** — ZERO writes to preview. This QUANTIFIES RESEARCH
  Open Question 5 ("is preview reconcilable / how drifted?"): the answer is **zero drift on the
  migration axis** — preview tracks the same 76-migration endpoint as prod and repo.

> Implication: test-first on preview is meaningful with no reconciliation needed — preview did not
> drift on the applied-migration axis since Phase 3 introspected it. (The Phase-3 `linkedin_grades` +
> `saved_jobs` anomalies that suggested divergence were the project-ref mislabel resolved in 08-01,
> not a migration drift.)

### Task 2 — read-only preview-vs-prod structural parity (all DB-05 targets): ALL MATCH

Per-object-class verdicts (preview `cimjltzovkahkqecpwgi` vs canonical prod `zjpjapgraoxdukdvpjes`,
both read-only):

| Object class | Preview vs prod | Verdict |
|--------------|-----------------|---------|
| **Migrations** (`list_migrations`) | 76 == 76; identical version endpoints (latest `20260607050000_allow_resume_document_mime_types`) | **MATCH** |
| **Table inventory** (`list_tables` / information_schema public) | identical public object set (36 base tables + 5 views); `saved_jobs` ABSENT on both; `paddle_webhook_events` PRESENT on both; views identical (cohort_peers, v_conversion_funnel, v_feature_consumption_daily, v_merits_in_circulation, v_shop_purchases_daily) | **MATCH** |
| **RLS — `linkedin_grades`** (pg_policies) | preview has the SAME 5 policies as prod, INCLUDING the over-permissive **"Anyone can view linkedin grades"** (SELECT, roles `{public}`, qual `true`) alongside the owner-scoped "Users can view their own LinkedIn grades" (SELECT, `auth.uid() = user_id`) | **MATCH** |
| **RLS — `alert_state` / `rate_limit_counters` / `stripe_webhook_events`** (pg_policies) | ZERO policies on BOTH (the `rls_enabled_no_policy` x3 set — RLS enabled, implicit deny-all) | **MATCH** |
| **Function shape — `increment_rate_limit(p_key text, p_window_start bigint)`** (pg_proc) | `security_definer = false`, `proconfig = null` on BOTH (08-04 pins `= public`, Pitfall 3) | **MATCH** |
| **Function shape — `ts_to_utc_date(ts timestamptz)`** (pg_proc) | `security_definer = false`, `proconfig = null` on BOTH (08-03 pins `= ''`) | **MATCH** |
| **Security advisor set** (`get_advisors(type="security")`) | preview **73 lints == prod 73 lints**, EXACT match by category AND affected-object set: `security_definer_view` x4 (same 4 `v_*` views), `function_search_path_mutable` x2 (same 2 fns), `rls_enabled_no_policy` x3 (same 3 tables), `anon_` + `authenticated_security_definer_function_executable` x30 + x30 (= x60 EXECUTE set), `rls_policy_always_true` x2 (paddle_webhook_events, scheduled_emails), `public_bucket_allows_listing` x1, `auth_leaked_password_protection` x1 | **MATCH** |

**No DIVERGENCE found in any object class.** Preview faithfully mirrors prod for EVERY DB-05 target
object (views, the 2 search_path-mutable functions, the 4 RLS target tables, the x60 EXECUTE-grant
set). The `linkedin_grades` "Anyone can view" over-permissive SELECT is present on BOTH sides, so the
08-04 RUN-06 DROP is a real fix that preview-first faithfully validates; `alert_state` /
`rate_limit_counters` / `stripe_webhook_events` carry zero policies on both, so the 08-03 explicit-deny
is identically applicable. Because parity is exact, NO object has a weakened test-first guarantee — no
object needs to lean on prod-only before/after verification.

### The preview -> prod HARD GATE (D-05 — now in force for Plans 08-03/08-04/08-05)

Every Phase 8 migration (08-03, 08-04, 08-05) MUST pass this 4-step gate; **no migration skips
preview**:

1. **Apply to PREVIEW** — orchestrator applies the forward migration to `cimjltzovkahkqecpwgi` via the
   `supabasepreview` MCP `apply_migration` (operator-gated; the executor never writes).
2. **VERIFY on preview** — re-run `get_advisors(type="security")`: the targeted advisory CLEARS; run
   the plan's `pg_policies` / `pg_proc` shape check + the SELECT-as-role / code read-map no-regression
   checks.
3. **Apply to PROD** — ONLY THEN does the operator apply the SAME migration to canonical prod
   `zjpjapgraoxdukdvpjes` (prod is read-only to Claude; the operator applies every prod change —
   CLAUDE.md MCP rule 8).
4. **RE-VERIFY on prod** — read-only `get_advisors(type="security")` + `pg_policies` / `pg_proc` shape
   + targeted no-regression reads confirm the fix landed and no access regressed.

A DIVERGENCE at ANY step is a **STOP-and-operator-decision** — never force-resolved. This gate is the
test-first spine of Plans 08-03..05.

---

## SUPERSEDED — 2026-06-13 capture (PREVIEW project `cimjltzovkahkqecpwgi`, retained for context)

> The block below describes the original 2026-06-13 capture. It is **NOT canonical prod** — it was
> run against the **preview/test project `cimjltzovkahkqecpwgi`** (resolved above). It is retained as
> the historical preview snapshot. **Do NOT use its counts as prod truth.**

**Run date (superseded):** 2026-06-13.
**Source (corrected):** PREVIEW project `cimjltzovkahkqecpwgi` (the operator believed it was prod at
the time; the data was real-user-scale preview data: 17 profiles, 118 resumes, 76 merit_transactions,
22 auth users).
**`pg_stat_statements` (preview):** ENABLED v1.11. **`stats_reset` (preview):** `2025-12-08T11:03:29Z`.

- Preview tables (40 base + 5 views), 35 functions, 6 cron jobs, 41 deployed edge functions.
- Preview over-permissive `linkedin_grades` "Anyone can view linkedin grades" (SELECT, public, true)
  — same finding now CONFIRMED on prod above.
- Preview `usage_tracking` 294 rows / 3295 idx_scan / 304 ins — **preview traffic, not prod**; prod is
  4 rows (still actively written -> DB-04 gated either way).
- D-08 finding preserved: `interview-prep-coach` ABSENT from the deploy list (already retired);
  `interview-prep-analyze` (v52) + `interview-prep-evaluate` (v52) live + UI-gated (KEEP-LIST Class 1).
- Deploy-drift orphan candidates `analyze-career-v2` (stale v9) + `chat-agent` — Phase-4 CLEAN-03
  scope (edge fns, not DB structures).

The full 2026-06-13 preview result tables are preserved in this file's git history (pre-08-01) for the
audit trail; the canonical Source-C' truth for all Phase-8 verdicts is the 2026-06-24 prod re-pull above.
