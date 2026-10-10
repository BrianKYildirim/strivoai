# DB-01 / DB-02 — Database Inventory & Obsolete-Structure Flagging

**Phase:** 03 — Cross-Domain Inventory & Audit
**Plan:** 03-05 (DB-01 full inventory + DB-02 obsolete-structure flagging)
**Run date:** 2026-06-13 (Sources A+B) · **Source C live leg run:** 2026-06-13 (operator)
**Branch / HEAD at audit:** `staging` @ `27d9ebc`
**Tooling:** migrations parse (`supabase/migrations/`, 76 files) + `rg` code-reference call-sites + the operator-run read-only SQL pack [`queries/db-introspection.sql`](./queries/db-introspection.sql) (Source C, operator-gated). **Source C live results captured in** [`queries/db-introspection-results.md`](./queries/db-introspection-results.md) and folded in below.
**Connection (Source C):** PROD introspection was run by the OPERATOR in the Supabase SQL Editor; the project-ref / connection string was operator-supplied at run time and is **never committed** — recorded here as **(redacted)** / by env name only (Open Question 2, D-10). The observed project-ref appears in cron-job URLs as `cimjltzovkahkqecpwgi` — **see the Project-Ref Discrepancy caveat in the Verdict block** (STATE.md historically labelled this ref the TEST project; Phase 8 MUST confirm the canonical prod ref before any removal).
**Scope:** Records object names, declared shape, call maps, classifications, counts, and SHAs only — **never a secret value, never a connection string, never row data, never decrypted_secrets.** Non-destructive: no migration added/edited, no DB written.

---

## Verdict / Summary

DB-01 inventory is **COMPLETE (three sources triangulated)** and DB-02 flagging is **FINAL for this phase** (all verdicts gated/needs-investigation; essentially no confirmed-`safe`-to-drop public structure — see below):

- **Source A (migrations declared intent):** COMPLETE — 76 migration files parsed; ~37 tables, ~33 functions/RPCs, 6 pg_cron jobs, RLS + triggers enumerated below.
- **Source B (code-reference call-sites):** COMPLETE — `usage_tracking` reader/writer map and Paddle remnant map re-verified against current HEAD (`27d9ebc`) with recorded drift vs the v3.0 CONCERNS.md leads.
- **Source C (live PROD read-only introspection):** ✅ **COMPLETE (operator-run 2026-06-13).** The committed read-only pack was run against PROD by the operator; full results are in [`queries/db-introspection-results.md`](./queries/db-introspection-results.md) and folded into the "Source C" section below. Live truth: **40 public base tables + 5 views, 35 public functions, 6 active pg_cron jobs, `pg_stat_statements` ENABLED (v1.11), `stats_reset = 2025-12-08`, 41 deployed edge functions** (`interview-prep-coach` ABSENT). No prod write occurred; no connection string was committed.

**DB-02 counts (FINAL, three-way triangulated):**

| Classification | Count | Notes |
| -------------- | ----- | ----- |
| `safe` | **0** | Even with live stats, **no public structure earns `safe` this phase.** The two real removal *candidates* (legacy `usage_tracking` cluster, Paddle remnants) are both still live in PROD; every zero/low-stat table is either a recently-shipped v3.0 lean-intel table, a gated feature (Interview Prep), or cron-/system-managed → KEEP-LIST or needs-investigation. |
| `needs-investigation` | **candidate groups** | legacy `usage_tracking` + its credit/usage RPC cluster (heavily live → **gated**, DB-04); the new v3.0 zero-row tables (applications/outcomes/benchmarks/recommendations/job_descriptions/resume_bullets/user_edits); and the deploy-drift orphan candidates `analyze-career-v2` (stale v9) + `chat-agent` (Phase-4 repo-reference check). |
| `unsafe` (gated, never-safe) | **KEEP-LIST classes confirmed live** | cron-invoked structures (Class 3 — 6 active jobs), Paddle remnants (Class 2 — `paddle_webhook_events` + 3 `profiles.paddle_*` cols + `paddle-webhook` fn), and the gated Interview-Prep tables/fns (Class 1 — `interview_quizzes/_answers/_streaks`, `interview-prep-analyze/-evaluate`). |

> **DB-02 bottom line (final):** there are essentially **NO confirmed-`safe`-to-drop public structures this phase.** The Paddle remnants and the legacy `usage_tracking` credit/usage cluster are the real removal *candidates*, but `usage_tracking` is heavily live in PROD (294 rows / 3 295 idx_scan / 304 inserts) and Paddle is gated on the last in-flight sub → both are **gated / needs-investigation, deferred to Phase 8 with evidence.** Live stats prove what is *used*; they did NOT promote anything to `safe`. Per Pitfall 5 / D-11, a low/zero stat count is corroborating-not-sole evidence and is read against `stats_reset = 2025-12-08` (~6 months).

> ⚠ **D-08 KEY RESOLUTION (`interview-prep-coach`):** the retired function is **NOT in the 41-function PROD deploy list** → it is already gone from this project. STATE.md / CONCERNS.md "still deployed on staging+prod" is **STALE**. With no repo source AND not deployed, `interview-prep-coach` is **already retired** — Phase-4 CLEAN-03 can mark it closed/no-op (nothing to `supabase functions delete`). Do NOT conflate with the live `interview-prep-analyze` + `interview-prep-evaluate` (v52, gated OFF in UI) which ARE deployed and KEEP-LIST Class 1.

> ⚠ **PROJECT-REF DISCREPANCY (Phase 8 must resolve before any removal):** the live data came from project-ref **`cimjltzovkahkqecpwgi`** (observed in the cron-job `net.http_post` URLs and the `supabase functions list`). STATE.md (Phase-1 blocker notes) historically labelled `cimjltzovkahkqecpwgi` (strivoaipreview) the **repurposed TEST project**. The operator ran it as PROD and the data is coherent real-user-scale (17 profiles, 118 live resumes, 76 merit_transactions, 22 auth users). Either the canonical prod ref == this ref, or STATE's "test" label is itself stale. **DB-02 verdicts treat this as PROD per the operator, but Phase 8 MUST confirm the canonical prod project-ref before executing any DB-03 removal / DB-04 retirement.**

---

## Triangulation (D-09 — three sources)

### Source A — migrations (declared intent) ✅ COMPLETE

Parsed all **76** files in `supabase/migrations/` (verified count). Declared objects:

**Tables (~37, public schema unless noted)** — from `CREATE TABLE` statements:
`alert_state`, `analysis_cache`, `analysis_jobs`, `analysis_results`, `applications`, `benchmarks`, `career_targets`, `feature_usage`, `improvement_checklist`, `interview_quiz_answers`, `interview_quizzes`, `interview_streaks`, `job_descriptions`, `linkedin_grades`, `linkedin_versions`, `merit_feature_costs`, `merit_shop_purchases`, `merit_transactions`, `outcomes`, `paddle_webhook_events`, `profiles`, `rate_limit_counters`, `recommendations`, `resume_bullets`, `resume_score_history`, `resume_sections`, `resume_versions`, `resumes`, `saved_jobs`, `scheduled_emails`, `scores`, `stripe_webhook_events`, `upgrade_requests`, `usage_tracking`, `user_achievements`, `user_edits`, `user_merits`, `user_roles`.
*(Plus the earliest `20251129_create_all_tables.sql` bootstrap; the live pg_catalog list from Source C is the authoritative reconciliation — drift expected.)*

**Functions / RPCs (~33)** — from `CREATE [OR REPLACE] FUNCTION`:
`admin_set_user_credits`, `admin_set_user_merits`, `admin_upgrade_user`, `auth_owns_version`, `auto_provision_user_merits`, `can_perform_ai_action`, `check_and_deduct_merits`, `check_and_record_ai_usage`, `credit_shop_merits`, `get_admin_usage_stats`, `get_ai_failure_rate_*`, `get_billing_period_start`, `get_merit_balance`, `get_pending_upgrade_requests`, `get_shop_failure_rate_*`, `get_usage_limit`, `get_user_usage`, `get_user_usage_breakdown`, `grant_upgrade_diff`, `handle_new_user`, `has_role`, `increment_rate_limit`, `queue_welcome_sequence`, `reconcile_merit_balance`, `record_ai_usage`, `record_feature_usage`, `record_recommendations_shown`, `refund_merits`, `reset_subscription_merits`, `run_benchmarks_rollup`, `run_lifecycle_sweep`, `ts_to_utc_date`, `update_updated_at_column`.
*(Note: `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` drops the legacy 3-arg overload — Source C confirms which overloads survive in prod.)*

**pg_cron jobs (6 — scheduled by migrations)** — KEEP-LIST Class 3 (cron-invoked → never `safe`):

| Job name | Schedule | Invokes | Migration |
| -------- | -------- | ------- | --------- |
| `keep-warm-ping` | `*/5 * * * *` | `keep-warm` edge fn (HTTP) | `20260310000000_add_keep_warm_cron.sql` |
| `cleanup-rate-limit-counters` | `0 * * * *` | pure-SQL DELETE on `rate_limit_counters` | `20260330000000_add_rate_limit_counters.sql` |
| `reset-subscription-merits-sweep` | `*/15 * * * *` | `reset-subscription-merits` edge fn (HTTP) | `20260415000001_phase_12_stripe_products_webhook.sql` |
| `extract_catchup_nightly` | `*/15 * * * *` | `extract-analysis-structure` edge fn (HTTP) | `20260525000003_phase42_layer2_extract_catchup_cron.sql` |
| `benchmarks_nightly` | `0 3 * * *` | `run_benchmarks_rollup()` (pure-SQL) | `20260525000006_phase42_layer4_benchmarks_cron.sql` |
| `lifecycle_sweep_nightly` | `0 4 * * *` | `run_lifecycle_sweep()` (pure-SQL) | `20260525000007_phase42_layer5_lifecycle_archive.sql` |

> **Drift vs KEEP-LIST / RESEARCH:** both named only FOUR cron jobs (`keep-warm`, `extract-catchup`, `benchmarks`, `lifecycle-archive`). The current-HEAD migration sweep finds **SIX** — `cleanup-rate-limit-counters` and `reset-subscription-merits-sweep` were missing from the prior count. All six are KEEP-LIST Class 3. Source C `cron.job` (Section 6) confirms which are actually active in prod.

**RLS / triggers:** RLS is enabled on the merit/cache/paddle/analysis tables (e.g. `analysis_cache` SELECT-own policy; `usage_tracking_user_select_policy`; `paddle_webhook_events` RLS). Triggers include `auto_provision_user_merits` (on signup), `update_updated_at_column` (timestamp maintenance), `handle_new_user`. **Full live RLS/trigger enumeration = Source C Sections 4 & 5** (DB-05 input for Phase 8).

**Notable drift from v3.0 CONCERNS.md leads (re-verified at HEAD `27d9ebc`):**
- CONCERNS §8 said "no cache table exists." **Now present:** `20260512000000_analysis_cache_table.sql` ships `public.analysis_cache` (UNIQUE on `cache_key`, SELECT-own RLS). The cache substrate now exists.
- CONCERNS §5 implied `usage_tracking` had no `analysis_id`. **Now present:** `20260512000002_usage_tracking_analysis_id.sql` adds it (the History-linkage column).

### Source B — code-reference call-sites ✅ COMPLETE

`rg` over `src/**` and `supabase/functions/**` at HEAD `27d9ebc`. The two D-08 dependency maps are the "D-08 Confirmed Dependency Maps" section below; the headline is: both `usage_tracking` and the Paddle remnants are **still actively referenced** in production code — neither is orphaned.

### Source C — live PROD read-only introspection ✅ COMPLETE (operator-run 2026-06-13)

> **STATUS: COMPLETE.** The operator ran the committed read-only pack against PROD on 2026-06-13. Full result sets (catalog metadata ONLY — object names, counts, signatures, policy names, index names; no secret values, no row data) are recorded in **[`queries/db-introspection-results.md`](./queries/db-introspection-results.md)**. The salient findings are folded into the DB-01 inventory and DB-02 flagging below. Caveats already recorded in the results file: `stats_reset = 2025-12-08T11:03:29Z` (counters span ~6 months); `pg_stat_statements` ENABLED (v1.11); observed project-ref `cimjltzovkahkqecpwgi` (see Project-Ref Discrepancy caveat).

| Section | Live result (summary — full data in results file) | Status |
| ------- | ------------------------------------------------- | ------ |
| 0 — Extensions | pg_cron 1.6.4, pg_net 0.19.5, **pg_stat_statements 1.11 (ENABLED)**, pgcrypto, plpgsql, supabase_vault, uuid-ossp | ✅ |
| 1 — Tables & schemas | **40 public BASE TABLES + 5 VIEWS** (cohort_peers, v_conversion_funnel, v_feature_consumption_daily, v_merits_in_circulation, v_shop_purchases_daily). Drift: `analysis_cache` EXISTS (14 rows) — CONCERNS §8 "no cache" STALE; `saved_jobs` (declared in Source A) **absent** in live prod | ✅ |
| 2a/2b — Row counts + `stats_reset` | per-table `n_live_tup`/scans captured; **`stats_reset = 2025-12-08T11:03:29Z`** (D-11 anchor). `usage_tracking` 294 live / 3 295 idx_scan / 304 ins — **heavily used** | ✅ |
| 3 — Functions / RPCs | **35 public functions** incl. the legacy credit/usage cluster + the v3.0 merit RPCs; `record_ai_usage` survives as **TWO overloads** (4-arg + analysis_id); the legacy 3-arg `check_and_deduct_merits` is gone (dropped by migration) | ✅ |
| 4 — RLS policies | full `pg_policies` captured. ⚠ **OVER-PERMISSIVE:** `linkedin_grades` "Anyone can view linkedin grades" (SELECT, role `public`); role inconsistency public-vs-authenticated across public-table policies → DB-05 (Phase 8) input | ✅ |
| 5 — Triggers | `handle_new_user`, `auto_provision_user_merits`, `update_*_updated_at` family, `trigger_queue_welcome_sequence` — all alive/expected | ✅ |
| 6 — pg_cron jobs | **6 active** (keep-warm-ping, cleanup-rate-limit-counters, reset-subscription-merits-sweep, extract_catchup_nightly, benchmarks_nightly, lifecycle_sweep_nightly) — confirms the 6 Source-A jobs. KEEP-LIST Class 3 | ✅ |
| 7 — Indexes | `idx_scan = 0` candidates captured (mostly unique/dedup constraints or new-table backers) — **Phase 9 input, NOT DB-02 removals** | ✅ |
| 8 — Top statements | `pg_stat_statements` top-50: dominated by platform/Realtime/pg_cron/pg_net plumbing; **NO anomalous app feature-query cost** (PERF cross-signal: hotspots are app-side, consistent with PERF-HOTSPOTS.md) | ✅ |
| (CLI) — Deployed functions | `supabase functions list` → **41 functions, all ACTIVE.** D-08: **`interview-prep-coach` ABSENT** (already retired). Orphan candidates: `analyze-career-v2` (stale v9, 2026-03-04) and `chat-agent` (v94) for Phase-4 repo check | ✅ |

#### Source C — folded findings (the seven decisions that move DB-02)

1. **D-08 resolved — `interview-prep-coach` is NOT deployed.** Absent from the 41-function live list. With no repo source AND not deployed → **already retired** (Phase-4 CLEAN-03 = close/no-op, nothing to delete). The live `interview-prep-analyze` + `interview-prep-evaluate` (v52) ARE deployed and **KEEP-LIST Class 1** (gated OFF in UI via `VITE_FEATURE_INTERVIEW_PREP`).
2. **`usage_tracking` is heavily live** (294 rows, 3 295 idx_scan, 304 ins, ongoing) → **NOT droppable**; DB-04 stays **gated** with this as the blocking evidence. The legacy credit/usage RPC cluster (`admin_set_user_credits`, `check_and_record_ai_usage`, `can_perform_ai_action`, `get_usage_limit`, `get_user_usage`, `get_user_usage_breakdown`) ties to it → **needs-investigation / gated, never `safe`** this phase.
3. **New deploy-drift orphan candidates (Phase-4 repo-reference check, NOT removed here):** `analyze-career-v2` (v9, stale since 2026-03-04 while `analyze-career` is v138 — strong undeploy candidate) and `chat-agent` (v94 — confirm repo source/routing). Classified **needs-investigation**.
4. **Over-permissive RLS:** `linkedin_grades` "Anyone can view linkedin grades" (SELECT / role `public`) exposes all grades to any caller → **flag for Phase 8 DB-05.** Also the public-vs-authenticated role inconsistency across public-table policies.
5. **Project-ref discrepancy:** live data came from `cimjltzovkahkqecpwgi`, which STATE.md historically labelled the TEST project; the operator ran it as PROD and the data is real-user-scale. **Phase 8 MUST confirm the canonical prod ref before any removal** (see Verdict caveat).
6. **`stats_reset = 2025-12-08` (~6 months).** Zero-row public tables are mostly **NEW v3.0 lean-intel tables** (applications, outcomes, benchmarks, recommendations, job_descriptions, resume_bullets, user_edits) or **GATED** (interview_quizzes/_answers/_streaks) → keep / needs-investigation, **NOT obsolete**. `rate_limit_counters` is 0-live but actively churned (cron-cleaned) → **keep**.
7. **Drift confirmed:** `analysis_cache` EXISTS in prod (CONCERNS §8 "no cache" STALE); all **6 cron jobs active** (KEEP-LIST); `pg_stat_statements` shows **no anomalous app-query cost** (PERF cross-signal). Note: `saved_jobs` is declared in Source A migrations but is **absent** from the live public table list — recorded as migrations-vs-prod drift (needs-investigation; likely a never-applied/rolled-back declaration — Phase 8 reconciles).

---

## DB-01 Inventory + DB-02 Obsolete-Structure Flagging (FINAL — three-way triangulated)

Three-tier classification (D-05). `safe` requires ALL signals to agree (D-06) **including live disuse from Source C**. With Source C now in hand, the verdicts are final for this phase: **0 `safe`** — live stats confirmed the removal candidates are still used (or are gated/new), so nothing crossed the conservative bar. The "C: live stats" column carries the D-11 caveat (read against `stats_reset = 2025-12-08`; zero-usage is corroborating-not-sole; `pg_stat_statements` is ENABLED so Section 8 is populated). Full live data: [`queries/db-introspection-results.md`](./queries/db-introspection-results.md).

| Structure | A: declared? | B: code-referenced? | C: live stats (prod) | Classification | Evidence / signals |
| --------- | ------------ | ------------------- | -------------------- | -------------- | ------------------ |
| `usage_tracking` (table) | yes (bootstrap + `..._analysis_id`, `..._user_select_policy`) | **yes — read AND written (map below)** | **294 live / 615 seq / 3 295 idx_scan / 304 ins / 10 del — HEAVILY USED** | **needs-investigation (gated)** | All three sources concur it is LIVE. Active writers via `record_ai_usage`; readers in `AnalysisHistory`, `useAchievements`; deleter in `admin-delete-user`. Phase 8 DB-04 retirement candidate — **NOT droppable now, NOT "retained read-only".** |
| Legacy credit/usage RPC cluster (`admin_set_user_credits`, `check_and_record_ai_usage`, `can_perform_ai_action`, `get_usage_limit`, `get_user_usage`, `get_user_usage_breakdown`) | yes | **yes** — `can_perform_ai_action` still called FE (`SkillsGapAnalysis.tsx:108`, `Navbar.tsx:109`) + `usage-checker.ts:74`; cluster ties to `usage_tracking` | live in `pg_proc` (35 fns); `can_perform_ai_action` shows **161 PostgREST RPC calls** | **needs-investigation (gated)** | Tied to the heavily-live `usage_tracking`. FE migration off `can_perform_ai_action` is PARTIAL (paywall/tier hooks dropped it; two pages + navbar still call it). DB-04 must remove those call sites first. Never `safe` while live callers + live RPC traffic exist. |
| `paddle_webhook_events` (table) | yes (`20260122225033...`) | **yes — read/written by `paddle-webhook`** (`index.ts:153,167`) | **0 live rows**, table present; `paddle-webhook` fn **deployed (v94)** | **unsafe (gated, never-safe)** | KEEP-LIST Class 2. Idempotency dedupe store for the live deployed `paddle-webhook` fn. Zero rows ≠ droppable (gated on in-flight Paddle subs). |
| `profiles.paddle_customer_id` / `paddle_subscription_id` / `paddle_price_id` (cols) | yes (`20260122225033...`; kept by `stripe_migration` D-04) | **yes** — written by `paddle-webhook` (`:247-249`), read/surfaced by `Profile.tsx:52,53,128,129`; typed in `types.ts` | cols present (`idx_profiles_stripe_*` indexes live; paddle-col indexes idx_scan=0 — insurance) | **unsafe (gated, never-safe)** | KEEP-LIST Class 2. THREE columns (not two as v3.0 named — `paddle_price_id` is a third). Removable only when last Paddle sub expires (Phase 8 DB-04). |
| cron-invoked tables/fns (`rate_limit_counters`, `benchmarks`, `run_lifecycle_sweep`, `run_benchmarks_rollup`, archive targets, etc.) | yes (6 cron migrations) | invoked by `cron.job`, not FE-imported | **6 cron jobs ACTIVE** in `cron.job`; `run_lifecycle_sweep()` 15 calls; `rate_limit_counters` 139 ins/65 upd/139 del (cron-churned) | **unsafe (gated, never-safe)** | KEEP-LIST Class 3. Live `cron.job` schedules confirm all 6. A static "no importer" reading is meaningless for cron targets. |
| Gated Interview-Prep tables (`interview_quizzes`, `interview_quiz_answers`, `interview_streaks`) + fns `interview-prep-analyze`/`-evaluate` | yes | gated behind `VITE_FEATURE_INTERVIEW_PREP` (Coming-Soon on prod) | **0 live rows** (gated off); fns **deployed v52** | **unsafe (gated, never-safe)** | KEEP-LIST Class 1. Zero rows is EXPECTED (feature gated off prod). Never `safe`. |
| Retired `interview-prep-coach` (fn) | no repo source | not referenced | **ABSENT from 41-fn deploy list** | **already retired (no-op)** | D-08 RESOLVED. No source + not deployed → already gone. Phase-4 CLEAN-03 = mark closed/no-op (nothing to delete). STATE/CONCERNS "still deployed" is STALE. |
| Deploy-drift orphans `analyze-career-v2` (v9 stale) + `chat-agent` (v94) | — (`analyze-career-v2` likely has stale repo source; `chat-agent` TBD) | Phase-4 repo-reference check pending | **deployed** (`analyze-career-v2` stale 2026-03-04 while `analyze-career` v138; `chat-agent` in mass redeploy) | **needs-investigation** | New from the live function list. `analyze-career-v2` = strong undeploy candidate (CLEAN-03); `chat-agent` = confirm repo source/routing. NOT removed here. |
| `analysis_cache` (table) | yes (`20260512000000...`) | service-role INSERT via merit-gateway precheck; SELECT-own RLS | **14 live / 75 idx_scan / 14 ins — active (v3.0 cache)** | **needs-investigation → keep** | LIVE. Confirms CONCERNS §8 "no cache" is STALE. Active read/write — not obsolete. |
| New v3.0 lean-intel zero-row tables (`applications`, `outcomes`, `benchmarks`, `recommendations`, `job_descriptions`, `resume_bullets`, `user_edits`) | yes (v3.0 phase-42 migrations) | service-role/cron writers; new-feature readers | **0 live rows** but recently shipped (read against `stats_reset` 2025-12-08) | **needs-investigation (keep)** | Zero rows is NEW-FEATURE-not-yet-exercised, NOT disuse (D-11). `benchmarks` is cron-populated (Class 3 via `run_benchmarks_rollup`). Do NOT class obsolete. |
| Migrations-vs-prod drift — `saved_jobs` declared (Source A) but **absent in live prod** | yes (migration) | — | **absent from live public table list** | **needs-investigation** | Declared-but-not-present drift. Likely never-applied or rolled-back declaration. Phase 8 reconciles; not a removal target this phase. |

> **Stats / D-11 caveat (applies to every row's column C):** All Source-C readings are recorded against `stats_reset = 2025-12-08T11:03:29Z` (counters span ~6 months). `pg_stat_statements` is ENABLED (v1.11) so Section 8 is populated — it shows **no anomalous app feature-query cost** (platform/Realtime/cron plumbing dominates). Zero `n_live_tup` / zero `idx_scan` is corroborating, never sole, evidence (Pitfall 5) — and for the v3.0 tables + gated Interview-Prep tables it reflects new/gated state, NOT disuse.

---

## D-08 Confirmed Dependency Maps (for Phase 8)

These are recorded as **confirmed dependency maps**, not as "safe to drop". Both re-verified against current HEAD `27d9ebc`.

### `usage_tracking` — dual read/write call map (DB-04 input; classed `needs-investigation`)

**Writers (via `record_ai_usage` / `check_and_record_ai_usage` RPC — write a `usage_tracking` row):**
- `supabase/functions/analyze-resume/index.ts` (post-success path)
- `supabase/functions/analyze-career/index.ts:1051-1052, 1258-1259` (merit-path History-visibility restore, sync + async)
- `supabase/functions/grade-linkedin/index.ts:505, 514-515, 550-551` (free-scan zero-credit row + merit path)
- `supabase/functions/recruiting-lens/index.ts:603-606` (merit path)
- `supabase/functions/interview-prep-analyze/index.ts:659` (merit path)
- `supabase/functions/_shared/usage-checker.ts:28` (atomic `check_and_record_ai_usage`), `:109` (4-arg `record_ai_usage`)
- `supabase/functions/_shared/merit-gateway.ts:165` (cache-hit zero-credit row, CACHE-10 / D-13)

**Readers (frontend gates + history):**
- `src/pages/AnalysisHistory.tsx:175` (primary history table read; `:275, :294` analysis_id linkage notes)
- `src/hooks/useAchievements.ts:127`

**Deleter:**
- `supabase/functions/admin-delete-user/index.ts:75` (`from("usage_tracking").delete()` on user deletion — **a writer/deleter not in the v3.0 CONCERNS §5 map**).

**Legacy `can_perform_ai_action` readers (the gate that DB-04 wants to retire):**
- STILL LIVE: `src/pages/SkillsGapAnalysis.tsx:108`, `src/components/Navbar.tsx:109`, `supabase/functions/_shared/usage-checker.ts:74`, `supabase/functions/paddle-webhook/index.ts:254` (comment), `supabase/functions/stripe-webhook-handler/index.ts:314` (comment).

> **DRIFT vs CONCERNS.md §5 (recorded):** v3.0 named `usePaywallGuard`/`useTierAccess` as `can_perform_ai_action` readers. At HEAD `27d9ebc` those hooks have **MIGRATED OFF** it — their tests now assert a NEGATIVE (`usePaywallGuard.test.tsx:243`, `useTierAccess.test.tsx:235`: "never invokes `can_perform_ai_action`"). The MER-12 frontend-gate migration is therefore PARTIAL: the hooks are off it, but `SkillsGapAnalysis.tsx` + `Navbar.tsx` still call it directly. DB-04 must remove those two call sites before the RPC can be retired. CONCERNS §5's "retained read-only" framing is incorrect — `usage_tracking` is actively written by 7+ functions.

### Paddle remnants — gated dependency map (KEEP-LIST Class 2; never `safe`)

| Surface | Path / location | Kind | Status |
| ------- | --------------- | ---- | ------ |
| `paddle-webhook` edge fn | registered `config.toml:79`; `supabase/functions/paddle-webhook/index.ts` | deployed/live | gated — handles in-flight Paddle subs |
| `paddle_webhook_events` table | `paddle-webhook/index.ts:153, 167` (read + insert) | live idempotency store | gated |
| `profiles.paddle_customer_id` | written `paddle-webhook:247`; read `Profile.tsx:128`; typed `types.ts` | live column | gated |
| `profiles.paddle_subscription_id` | written `paddle-webhook:248`; read `Profile.tsx:129`; typed `types.ts` | live column | gated |
| `profiles.paddle_price_id` | written `paddle-webhook:249`; typed `types.ts:958` | live column (**3rd col — beyond v3.0's 2**) | gated |
| auth/CORS Paddle webhook type | `_shared/auth.ts:62,76`; `_shared/cors.ts:25` | live auth-type union | gated |
| Paddle prose / email labels | `Refund.tsx:24-63` (legal copy); `notify-admin-activity:115`, `notify-upgrade-request:88`, `send-notification-email:71,75` | string remnants | gated/cosmetic |

> **DRIFT vs KEEP-LIST / v3.0 research (recorded):** research named `Settings/Billing.tsx`, `Refund.tsx`, `Profile.tsx`, `types.ts` as Paddle surfaces. At HEAD `27d9ebc`: **`Settings/Billing.tsx` does NOT exist** (no `Settings/` dir — confirmed). `Refund.tsx` references Paddle in **prose only** (legal copy, not the columns). `Profile.tsx` + `types.ts` confirmed. Two new surfaces found: the **third column `paddle_price_id`** and the **`paddle_webhook_events` table**. All gated → never `safe`; Phase 8 DB-04 input.

---

## Live-Prod Introspection — ✅ COMPLETED 2026-06-13 (the operator runbook, retained for Phase 8 re-runs)

**This is the operator-gated leg (D-10). It has been COMPLETED:** the operator ran the read-only pack against PROD on 2026-06-13 and the full result sets are recorded in **[`queries/db-introspection-results.md`](./queries/db-introspection-results.md)** and folded into Source C / the DB-02 table above. Claude opened NO prod connection and fabricated NO data — the operator supplied the results. **The runbook below is retained verbatim so Phase 8 can RE-RUN the identical pack** (e.g. to re-confirm `usage_tracking` disuse before DB-04, or to confirm the canonical prod project-ref) before any DB-03 removal / DB-04 retirement:

1. **Open PROD read-only.** Supabase Dashboard → SQL Editor for the **PROD** project, OR `psql "$env:SUPABASE_DB_URL"` with a **read-only** prod role. You supply the prod project-ref / connection string at run time — it is **never committed** and **never pasted back** (record it here only as "(redacted)"). **Phase-8 note:** confirm whether the canonical prod ref == `cimjltzovkahkqecpwgi` (the ref the 2026-06-13 run observed) before acting on any verdict — see the Project-Ref Discrepancy caveat in the Verdict block.
2. **Run [`queries/db-introspection.sql`](./queries/db-introspection.sql)** (all sections are read-only SELECTs — verify before running if desired). Run **Section 0 first**: if `pg_stat_statements` is NOT listed, **skip Section 8** and note "pg_stat_statements: disabled".
3. **Paste each section's result set** into the matching "Source C" table row above (Sections 0–8). Include the **`stats_reset` value** (Section 2b) next to any Section-2 reading (D-11).
4. **Also run the deployed-function drift check** (D-08) and paste both lists into Source C:
   ```
   npx supabase functions list --project-ref <PROD_REF>
   npx supabase functions list --project-ref <STAGING_REF>
   ```
   This confirms whether the retired **`interview-prep-coach`** is still deployed (no repo source) and surfaces any deployed-but-no-source drift.
5. **Paste RESULTS ONLY** — never the connection string or any credential.
6. Once pasted, re-run the DB-02 classification: a structure may move to `safe` only when Source A + Source B + Source C all agree it is unused (with the `stats_reset` caveat satisfied) AND no KEEP-LIST keep-signal fires.

**2026-06-13 outcome:** the operator completed steps 1–5; the results are in [`queries/db-introspection-results.md`](./queries/db-introspection-results.md) and folded above. Re-running step 6 against those results moved **nothing** to `safe` (live stats confirmed the candidates are used / gated / newly-shipped) — DB-02 is **0 `safe`** for this phase.

---

## Re-Assertion / Reproducibility

- **Source A** (declared): re-derivable from `supabase/migrations/` (76 files) — `rg "create (table|or replace function|...)" supabase/migrations`.
- **Source B** (code): re-derivable — `rg "usage_tracking|record_ai_usage|can_perform_ai_action" src supabase/functions` and `rg -i "paddle" src supabase`.
- **Source C** (live): the 2026-06-13 operator run is recorded in [`queries/db-introspection-results.md`](./queries/db-introspection-results.md); re-runnable by any future phase via the committed [`queries/db-introspection.sql`](./queries/db-introspection.sql) (operator-gated, zero writes). Phase 8 re-runs the SAME pack to re-confirm (and to verify the canonical prod project-ref) before any DB-03 removal / DB-04 retirement.

---

## Cross-References

- **[`KEEP-LIST.md`](./KEEP-LIST.md)** — the D-07 gate. Class 1 (gated Interview-Prep tables/fns), Class 2 (Paddle remnants), and Class 3 (cron-invoked structures — all 6 jobs confirmed active in Source C) all fire here → those rows are `unsafe` (gated), never `safe`. D-08: `interview-prep-coach` is NOT a keep — it is **already retired** (absent from the live deploy list).
- **[`queries/db-introspection.sql`](./queries/db-introspection.sql)** — the operator-run read-only pack (Source C, re-runnable).
- **[`queries/db-introspection-results.md`](./queries/db-introspection-results.md)** — the **2026-06-13 live PROD result sets** (catalog metadata only; no secrets/row data) that this file's Source C folds in.
- **[`INDEX.md`](./INDEX.md)** — catalog entry point (DATABASE.md pre-listed there; not edited by this plan).
- **Consuming phase — Phase 8 (DB-03..06):** DB-03 removals (NB: confirm canonical prod project-ref first — see caveat), DB-04 `usage_tracking` retirement (uses the dual read/write map above + the 294-live-rows blocking evidence + the partial `can_perform_ai_action` migration finding), DB-05 RLS audit (uses Source C Section 4 — incl. the over-permissive `linkedin_grades` "Anyone can view" policy), DB-06 rollback paths.
- **Consuming phase — Phase 4 (CLEAN-03):** `interview-prep-coach` already-retired (no-op close); `analyze-career-v2` (stale v9) undeploy candidate; `chat-agent` repo-reference check.
- **`.planning/codebase/CONCERNS.md`** §5 (usage_tracking — drift recorded: hooks migrated off; admin-delete deleter added; **Source C confirms heavily live**), §8 (cache — drift recorded: `analysis_cache` now exists; **Source C confirms 14 live rows**).

*This file records object names, declared shape, call maps, classifications, counts, and SHAs only — no secret value, no connection string, is pasted anywhere in it.*

---

## Phase 8 D-01 re-pull reconciliation (2026-06-24, plan 08-01) — APPENDED, not a rewrite

> **This block is APPEND-ONLY.** The historical Phase-3 Verdict / Source-C record above is
> PRESERVED verbatim (incl. the original "DB-02 counts (FINAL, three-way triangulated)" table and the
> `interview-prep-coach` D-08 resolution). This section re-derives the DB-02 verdicts against the
> CORRECTED ground truth and RESOLVES the PROJECT-REF DISCREPANCY caveat. Source: the 2026-06-24
> read-only prod re-pull in [`queries/db-introspection-results.md`](./queries/db-introspection-results.md)
> (canonical prod `zjpjapgraoxdukdvpjes`). No DDL, no prod write, no `src/**`/`supabase/functions/**` edit.

### PROJECT-REF DISCREPANCY — RESOLVED

The Verdict-block "⚠ PROJECT-REF DISCREPANCY" caveat (which required Phase 8 to confirm the canonical
prod ref before any removal) is now **RESOLVED**:

- **Canonical prod = `zjpjapgraoxdukdvpjes`** — OPERATOR RE-CONFIRMED 2026-06-24 (the formal Phase-8
  re-confirmation owed), corroborated by `.mcp.json` (prod-readonly pin), `scripts/deploy.ps1` L73-75
  (`production -> zjpjapgraoxdukdvpjes`), and the Section-6 cron-host check.
- **The 2026-06-13 Source-C readings were PREVIEW-sourced** (`cimjltzovkahkqecpwgi`, the
  `staging`/`test` project per `deploy.ps1`), NOT prod. Every Source-C row-count / `pg_stat` reading
  above is hereby **re-classified preview-sourced**. The catalog SHAPE (table/fn/policy/cron names) was
  largely the same, but the **COUNTS were preview traffic** (17 profiles / 118 resumes / 22 users) — true
  prod is near-empty (1 profile / 3 resumes / 1 user; `usage_tracking` 4 rows, still actively written).
- **Preview `cimjltzovkahkqecpwgi` is now UNPAUSED** (operator, 2026-06-24) — precondition for plan 08-02.

### DB-02 verdicts re-derived against true prod (only readings that COULD differ)

A verdict could only flip if it depended on a row count, a policy name, or a table's existence. Re-derived:

| Reading (Phase-3 verdict) | Phase-3 (preview-sourced) | True prod `zjpjapgraoxdukdvpjes` (2026-06-24) | Verdict |
| ------------------------- | ------------------------- | --------------------------------------------- | ------- |
| `usage_tracking` "heavily used" (294 rows / 3295 idx_scan) | 294 rows | **4 rows, n_tup_ins 4, idx_scan 54 — still actively written** | **CONFIRMS gated.** Lower count is low total traffic, not disuse; still written -> DB-04 stays GATED. Verdict UNCHANGED. |
| `linkedin_grades` over-permissive "Anyone can view" SELECT (public, true) | present (preview) | **CONFIRMED PRESENT on prod** (coexists with owner-scoped `auth.uid()=user_id`) | **CONFIRMS DB-05 finding.** -> 08-04 DROP the over-permissive policy (owner-scoped already exists). Verdict UNCHANGED/strengthened. |
| `saved_jobs` declared-but-absent | absent (preview) | **ABSENT on prod too** | **CHANGED basis** (now confirmed against TRUE prod, not preview-drift) -> documentation-repair, NEVER a drop (see below). |
| `paddle_webhook_events` Paddle remnant (gated) | present, 0 rows | present, 0 rows (KEEP-LIST Class 2) | CONFIRMS gated. Verdict UNCHANGED. |
| New v3.0 zero-row tables (applications/outcomes/benchmarks/recommendations/job_descriptions/resume_bullets/user_edits) | 0 rows | 0 rows (low traffic) | CONFIRMS needs-investigation/keep. The D-11 caveat is STRONGER on a 1-user prod: 0 rows = low traffic, NOT disuse. Verdict UNCHANGED. |
| Gated Interview-Prep tables (interview_quizzes/_answers/_streaks) | 0 rows (gated) | 0 rows (KEEP-LIST Class 1) | CONFIRMS gated. Verdict UNCHANGED. |
| 6 active pg_cron jobs (Class 3) | 6 | 6 (jobs 1 & 6 hardcoded to PREVIEW host — new needs-operator finding) | CONFIRMS keep (cron-invoked, never `safe`). Verdict UNCHANGED. |

**Net:** the corrected low-traffic prod truth makes the disuse signal WEAKER (a 1-user prod can't prove
feature disuse), so every conservative gated/keep verdict **HOLDS or strengthens**. **Nothing crosses the
DB-03/DB-04 removal-on-disuse bar.** The Phase-3 "0 `safe`" stands — now on CORRECT evidence.

### `saved_jobs` reconciliation (D-07 — documentation-repair, NEVER a destructive drop)

- **True prod shows `saved_jobs` ABSENT** (`list_tables(schemas=["public"])` on `zjpjapgraoxdukdvpjes`,
  2026-06-24). The Phase-3 "absent" was NOT merely a wrong-project artifact — it is **genuinely absent on
  prod too**.
- `saved_jobs` is declared in the bootstrap `20251129_create_all_tables.sql` as `CREATE TABLE IF NOT
  EXISTS` (idempotent). Its absence on prod means either the bootstrap's `saved_jobs` clause never reached
  this project or it was later removed by a dashboard edit. There is **no code consumer** of `saved_jobs`
  in `src/**` or `supabase/functions/**` (the feature was never wired up).
- **Reconcile path = DOCUMENTATION/REPAIR ONLY, never a `DROP TABLE`.** Since the bootstrap uses
  `CREATE TABLE IF NOT EXISTS`, a clean re-apply is harmless (a no-op where present; a create where
  absent) — but Phase 8 authors **no forward migration** for it this phase (no consumer, no behavior to
  preserve or restore; out of the DB-03..06 zero-change scope). It is recorded here as a benign
  declared-but-absent drift, RESOLVED-as-documented. **NO destructive drop is authored.** If a future
  phase wires up the saved-jobs feature, the bootstrap's idempotent create already covers provisioning.

### DB-03 confirmed-safe removal set (derived from the fresh 3-source prod evidence)

A structure is confirmed-safe ONLY if (a) the fresh 3-source prod evidence clears it AND (b) it passes the
KEEP-LIST gate (not Class 1/2/3). Result:

**DB-03 confirmed-safe set = 0 — documentation-reconcile only this phase.**

- No public structure clears all three sources on the CORRECTED evidence. On a 1-user prod the pg_stat
  disuse signal is unreliable (low traffic, not disuse — D-11), so nothing earns `safe` on a disuse basis.
- **Paddle remnants stay GATED** (KEEP-LIST Class 2 — `paddle_webhook_events` table + 3 `profiles.paddle_*`
  columns + `paddle-webhook` fn; gated on the last in-flight Paddle subscription expiring; roadmap backlog).
  Not a Phase-8 drop.
- The legacy `usage_tracking` + `can_perform_ai_action` cluster stays GATED (DB-04 — see the dedicated
  RESIDUAL-REGISTER row; two live FE call sites + 7+ live writers).
- `saved_jobs` = documentation-reconcile (above), never a drop.
- The Phase-3 DB-02 forecast (0 confirmed-safe, expect few/none after re-pull) is CONFIRMED. The migrations
  Phase 8 DOES author (08-03/08-04/08-05) are **DB-05 security/least-privilege** fixes (search_path pins,
  security_invoker views, explicit-deny policies, the linkedin_grades DROP, scrutinized EXECUTE revokes),
  NOT DB-03 structure removals.

### Cited concurring signals (per candidate)

- **`usage_tracking`:** Source A (declared, live) + Source B (7+ live writers via
  `record_ai_usage`/`check_and_record_ai_usage`; two live FE `can_perform_ai_action` call sites
  `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`) + Source C' (4 prod rows, still actively written) -> GATED.
- **`saved_jobs`:** Source A (declared idempotent) + Source B (zero code consumers) + Source C' (absent on
  prod) -> documentation-reconcile, no drop.
- **Paddle remnants:** Source A (declared) + Source B (live `paddle-webhook` reads/writes the table + 3
  columns) + Source C' (table present, 0 rows) + KEEP-LIST Class 2 -> GATED.
- **New v3.0 tables / Interview-Prep / cron structures:** Source C' 0/low rows = low traffic (D-11), +
  KEEP-LIST Class 1/3 where applicable -> needs-investigation/keep, never `safe`.
