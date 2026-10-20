# Phase 8: Database Cleanup & Migrations - Research

**Researched:** 2026-06-24
**Domain:** Supabase Postgres RLS/policy migrations under an MCP read-only-prod / operator-applies model, with a HARD zero-functional-change constraint
**Confidence:** HIGH (the evidence base — Phase 3 DATABASE.md, Phase 7.1 RUNTIME-RELIABILITY.md, the in-repo migration history, the .mcp.json server config, the official Supabase splinter advisory docs — is internally consistent and was cross-checked at HEAD)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

These are LOCKED. Research answers HOW to execute them, never WHETHER. Copy them into every plan.

### Locked Decisions (CONTEXT `<decisions>`)

- **D-01: Full read-only re-pull from canonical prod is the BLOCKING first task.** The Phase 3 Source-C evidence (`DATABASE.md`) came from `cimjltzovkahkqecpwgi` — now known to be the **paused preview/test** project, NOT canonical prod `zjpjapgraoxdukdvpjes`. The advisories (233) WERE pulled from canonical prod in Phase 7.1 and are trusted. Before authoring/applying any migration, Phase 8 Task 1 must: (a) formally confirm the canonical prod project-ref, (b) re-run `.planning/audit/queries/db-introspection.sql` against `zjpjapgraoxdukdvpjes` via `supabase-prod-readonly`, (c) re-classify any `cimjltzovkahkqecpwgi`-sourced Phase 3 reading as preview-sourced, (d) record the corrected evidence. **Watch-for:** the re-pull may CHANGE verdicts (usage_tracking row counts, saved_jobs existence, live linkedin_grades policy name/qual) — re-derive DB-02 before acting.
- **D-02: Apply security-class least-privilege wins only; defer perf-class to Phase 9.** Phase 8 APPLIES only zero-observable-change security items: `linkedin_grades` "Anyone can view" -> owner-scoped SELECT; pin `function_search_path_mutable` x2 (`increment_rate_limit`, `ts_to_utc_date`); `rls_enabled_no_policy` x3 (`alert_state`, `rate_limit_counters`, `stripe_webhook_events` — explicit-deny or confirm service-role-only); `security_definer_view` x4 (analytics views -> `security_invoker` or documented accepted-risk); EXECUTE-grant revokes (x30 anon + x30 authenticated) where unintended. Perf-class (`auth_rls_initplan` x62, `multiple_permissive_policies` x48), `rls_policy_always_true` x2, `public_bucket_allows_listing`, `unused_index`, `unindexed_foreign_keys` = document-and-defer to Phase 9.
- **D-03: Grant-altering fixes are VERIFY-THEN-APPLY.** Any fix that changes a grant (`linkedin_grades` public->owner SELECT; the EXECUTE-from-anon revokes) is applied ONLY after a read-only prod check PLUS a code read-map proves no live caller depends on the current permissive grant. Anything not provably safe ships generated-but-UNAPPLIED + gated.
- **D-04: Un-pause preview and validate test-first.** Operator un-pauses `cimjltzovkahkqecpwgi`; every Phase 8 migration is applied + validated against preview before the operator applies to prod. Un-pausing preview is an operator action -> `autonomous:false` checkpoint.
- **D-05: Sync preview to current schema first; every migration goes through preview.** On un-pause, preview is first brought up to the repo's current migration state and read-only-confirmed to match prod (using the D-01 prod re-pull as reference). Then EVERY Phase 8 migration runs preview -> operator review -> operator applies to prod (hard gate; no migration skips preview). Post-apply on prod, run a read-only MCP verification (advisory re-cleared + `pg_policies` shape + targeted no-regression read).
- **D-06: usage_tracking — document GATED, no live-code surgery.** Leave `src/components/Navbar.tsx:109` + `src/pages/SkillsGapAnalysis.tsx:108` byte-identical; document `usage_tracking` + the `can_perform_ai_action` cluster as gated with the blocking dependency named (two live FE call sites + 7+ live writers). Retirement stays backlog.
- **D-07: DB-03 — evidence-gated removals + documentation reconcile.** Author forward+rollback migrations ONLY for structures the fresh 3-source prod evidence promotes to confirmed-safe (expect few/none). Reconcile `saved_jobs` drift by what TRUE prod shows: if present on `zjpjapgraoxdukdvpjes`, the Phase 3 "absent" was a wrong-project artifact; if genuinely absent, reconcile migration history via documentation/repair, NOT a destructive drop. Paddle remnants stay gated.
- **D-08: DB-06 — forward + rollback for EVERY change.** Rollback fidelity for grant changes must match whatever the LIVE prior policy is (re-confirm via fresh `pg_policies` read before applying — captured name/qual may have drifted).

### Claude's Discretion (CONTEXT `<decisions>` Claude's Discretion)

- Cron/log items routed to Phase 8 by Phase 7.1 but not central to DB-03..06 — the `http_request_queue` NULL-url cron ERROR (LOG-1) and the deploy-drift function orphans (`analyze-career-v2` stale v9 + `chat-agent`) — are **document-and-route** (operator/cron-config fixes; the function orphans were routed to Phase 4 CLEAN-03 and are edge functions, not DB structures). Surface in phase notes; do not treat as DB migrations.
- Plan/wave slicing; the exact migration-file timestamps + naming (follow `YYYYMMDDHHMMSS_description.sql`); register/evidence-doc home for the re-pull results; precise per-policy SQL — left to research + planning, consistent with the decisions above.

### Deferred Ideas (OUT OF SCOPE — CONTEXT `<deferred>`)

- **Perf-class RLS rewrites** — `auth_rls_initplan` x62 + `multiple_permissive_policies` x48 -> Phase 9.
- **`usage_tracking` retirement + `can_perform_ai_action` frontend-gate migration** (removing the two live call sites) -> backlog/future (D-06).
- **Paddle remnant removal** (`paddle_webhook_events`, `profiles.paddle_*` x3, `paddle-webhook` fn) -> gated on last in-flight Paddle subscription expiring (KEEP-LIST Class 2; backlog).
- **`unused_index` x42 / `unindexed_foreign_keys` x8** — index hygiene; document, defer to Phase 9.
- **Storage `public_bucket_allows_listing`** — document + route to operator/Phase 9.
- **`http_request_queue` NULL-url cron ERROR (LOG-1)** + deploy-drift function orphans — non-DB-migration operator/cron-config + edge-function items; document-and-route.
- **Shared `_shared/errors.ts` taxonomy helper** — already deferred to Phase 9 (Phase 7.1 D-04).
</user_constraints>

---

## Summary

Phase 8 is not an open-ended cleanup; it is the **execution arm of a pre-completed audit**, run inside a tight operating envelope. The hardest part is not "what to do" (the four requirements and the locked decisions already say) but "how to PROVE zero functional change when the only tool that can touch prod is read-only and the test-first environment is paused." The phase decomposes into a strict, gated sequence: (1) re-establish ground truth against the canonical prod ref because the Phase 3 catalog evidence was sourced from the wrong project (`cimjltzovkahkqecpwgi`, the preview/test project, observed in cron URLs — NOT prod `zjpjapgraoxdukdvpjes`); (2) un-pause + sync preview so test-first is meaningful; (3) author each security-class migration as forward+rollback files in `supabase/migrations/`, apply on preview, prove the advisory clears and no read regresses, hand to the operator to apply on prod, then re-verify read-only.

The single load-bearing uncertainty is the **project-ref discrepancy**, and it is sharper than the CONTEXT alone conveys: `scripts/deploy.ps1` maps **both `-Env staging` AND `-Env test` to `cimjltzovkahkqecpwgi`**, while `-Env production` maps to `zjpjapgraoxdukdvpjes`. So the Phase 3 introspection — claimed by the operator as "prod" — was almost certainly run against the staging/preview project. This is why D-01 is blocking, and it directly explains the two biggest catalog anomalies: the live `linkedin_grades` policy being the over-permissive bootstrap-era "Anyone can view linkedin grades" (even though timestamped migrations `20251218042310` + `20251223075804` replace it with owner-scoped policies), and `saved_jobs` being "absent" (it is declared in the bootstrap `20251129_create_all_tables.sql` with `CREATE TABLE IF NOT EXISTS`). Both anomalies most likely mean **the preview project's migration state diverged from prod** — which the D-01 re-pull + D-05 preview-sync will settle.

The DB-05 security fixes split cleanly into two risk tiers. **Provably-zero-change (apply freely after preview):** `security_definer_view`->`security_invoker` x4, `ts_to_utc_date` search_path pin, `rls_enabled_no_policy` explicit-deny x3. **Grant-altering / D-03 verify-then-apply (risk a live caller):** `linkedin_grades` SELECT tightening, the x60 EXECUTE revokes, and — a finding this research surfaces — the `increment_rate_limit` search_path pin (its body references an UNQUALIFIED `rate_limit_counters`, so the official `SET search_path = ''` remediation would break it unless the body is re-qualified). The planner must NOT treat the two search_path pins as identical low-risk items.

**Primary recommendation:** Structure the phase as a strict pipeline — Wave 1 = D-01 prod re-pull + DB-02 re-classification + DB-04 gated-disposition doc (no DDL); Wave 2 = D-04/D-05 operator un-pause + preview sync + read-only parity confirm (`autonomous:false`); Wave 3 = author each security-class migration (forward+rollback file), apply preview -> verify -> operator-applies-prod -> re-verify, one migration at a time, grant-altering ones behind a D-03 read-map. Author migrations as `ALTER`-based where possible (not `CREATE OR REPLACE`) to avoid disturbing dependent objects, and prove zero-access-regression with before/after `pg_policies` snapshots + targeted `SELECT`-as-role checks, NOT with `verify:baseline` (which never touches the live DB).

---

## Standard Stack

This phase ships SQL migration files and uses the existing Supabase tooling. No new libraries.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Supabase MCP `supabase-prod-readonly` | hosted (`mcp.supabase.com`) | Read-only inspect prod `zjpjapgraoxdukdvpjes` (`read_only=true&features=database,debugging,docs`) | The ONLY sanctioned prod access; CLAUDE.md rules 3/4/8 forbid prod writes |
| Supabase MCP `supabasepreview` | hosted (`mcp.supabase.com`) | Read-WRITE preview `cimjltzovkahkqecpwgi` (currently PAUSED) | The test-first surface; `apply_migration`/`execute_sql` allowed here once un-paused (D-04) |
| Supabase CLI | 2.107.0+ (`supabase` devDep) | `supabase db push --project-ref <ref>` to apply migration files | Repo's established apply path (`config.toml` registers functions; migrations live in `supabase/migrations/`) |
| `supabase/migrations/*.sql` | n/a | Forward + rollback DDL artifacts | 76 existing files; naming `YYYYMMDDHHMMSS_description.sql` |
| `scripts/deploy.ps1` + `npm run verify:baseline` | n/a | Offline regression gate (vitest + offline-deno + Playwright) | The zero-functional-change proof for any CODE change — but does NOT exercise the live DB (see Validation Architecture) |

### Supporting (read-only verification verbs via `supabase-prod-readonly`)
| MCP tool | Purpose | When to Use |
|----------|---------|-------------|
| `get_advisors(type="security")` / `(type="performance")` | Confirm an advisory is present (before) and cleared (after) | D-05 per-fix before/after; the canonical "did the fix land" check |
| `execute_sql` (read-only on prod) | Run `db-introspection.sql` sections; `pg_policies` reads; `SELECT`-as-context no-regression probes | D-01 re-pull; D-05 policy-shape + access checks; D-08 live-policy re-confirm |
| `list_tables(schemas=["public"])` | Cross-check table inventory vs DATABASE.md Source A | D-01, saved_jobs reconcile (D-07) |
| `get_logs(service="postgres"/"api"/"edge-function")` | Confirm no new error class post-apply | Post-apply sanity (LOG-1 cron error context) |

> On the **writable preview** server (`supabasepreview`, once un-paused) the same read verbs PLUS `apply_migration` are available for test-first application (D-04/D-05).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `supabase db push` (file-based) | MCP `apply_migration` on preview | `apply_migration` is fine for preview test-first; but the canonical artifact MUST be a committed file in `supabase/migrations/` (prod is operator-applied via CLI/dashboard) — author the file regardless |
| `ALTER FUNCTION ... SET search_path` | `CREATE OR REPLACE FUNCTION ...` | `CREATE OR REPLACE` re-defines the body and can be blocked by dependent objects (e.g. `ts_to_utc_date` backs a UNIQUE index); `ALTER` changes only the attribute and is the zero-change move |
| `SET search_path = ''` (Supabase-recommended) | `SET search_path = public` (repo convention) | `= ''` requires every body reference to be schema-qualified (breaks `increment_rate_limit`); the repo's existing pinned functions use `= public` — see Pitfall 3 |

**No `npm install`.** This phase produces `.sql` files and (if any code doc changes) markdown.

---

## Architecture Patterns

### The phase pipeline (the spine — every plan follows it)

```
Wave 1 (no DDL):  D-01 prod re-pull (read-only) -> re-classify DB-02 -> DB-04 gated doc -> DB-03 confirmed-safe set (expect ~0)
Wave 2 (operator): D-04 un-pause preview [autonomous:false] -> D-05 sync preview to repo HEAD -> read-only parity confirm vs prod
Wave 3 (per migration, one at a time):
   author forward+rollback file (supabase/migrations/<ts>_<desc>.sql)
   -> apply on PREVIEW (supabasepreview / supabase db push --project-ref cimjltzovkahkqecpwgi)
   -> VERIFY on preview: advisory clears + pg_policies shape + targeted no-regression read
   -> operator REVIEW [autonomous:false] -> operator APPLIES to prod (zjpjapgraoxdukdvpjes)
   -> RE-VERIFY on prod read-only: get_advisors cleared + pg_policies + no-regression read
   -> commit the file + register row
```

### Recommended migration-file structure
```
supabase/migrations/
└── YYYYMMDDHHMMSS_<short_snake_desc>.sql   # ONE logical change per file
```
Each file body (established by `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` + the RUN-06 handoff):
```
-- 1. WHY block: symptom / root cause / zero-change rationale / re-runnability note
-- 2. FORWARD DDL (idempotent: IF EXISTS / IF NOT EXISTS / OR REPLACE / DO $$ ... duplicate_object guards)
-- 3. (in the SAME file, as a fenced comment OR a sibling rollback file) the ROLLBACK DDL
-- 4. Optional read-only verification DO $$ ... RAISE EXCEPTION block (asserts the post-state)
```

### Pattern 1: Owner-scoped SELECT policy (the linkedin_grades fix template)
**What:** Replace a `USING (true)` / role `public` SELECT policy with an owner-scoped one.
**When to use:** `linkedin_grades` DB-05 fix (D-03 grant-altering).
**Example (the pre-authored Phase 7.1 RUN-06 handoff — already faithful forward+rollback):**
```sql
-- Source: .planning/audit/RUNTIME-RELIABILITY.md "RUN-06 - linkedin_grades RLS Phase-8 handoff"
-- mirrors supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql
-- FORWARD
DROP POLICY IF EXISTS "Anyone can view linkedin grades" ON public.linkedin_grades;
CREATE POLICY "Owners can view their linkedin grades"
ON public.linkedin_grades FOR SELECT TO authenticated
USING (auth.uid() = user_id);
-- ROLLBACK (must match the LIVE prior policy captured fresh, D-08)
DROP POLICY IF EXISTS "Owners can view their linkedin grades" ON public.linkedin_grades;
CREATE POLICY "Anyone can view linkedin grades"
ON public.linkedin_grades FOR SELECT TO public USING (true);
```
> **D-08 caveat:** re-confirm the LIVE policy name/qual via fresh `pg_policies` before applying — the prod re-pull (D-01) may show a DIFFERENT live policy (e.g. the owner-scoped `"Users can view their own LinkedIn grades"` from migration `20251223075804` if those migrations DID reach prod). If the live policy is already owner-scoped, the fix is a **no-op** and the advisory will not fire — DOCUMENT that and ship nothing. The ROLLBACK must restore whatever the live prior policy actually is.

### Pattern 2: `security_invoker` view recreation (the analytics-view fix template)
**What:** Recreate a SECURITY DEFINER view as `security_invoker = true` so it obeys the caller's RLS.
**When to use:** `security_definer_view` x4 (`v_merits_in_circulation`, `v_feature_consumption_daily`, `v_shop_purchases_daily`, `v_conversion_funnel`). Postgres 15+ (Supabase is 15+).
**Example:**
```sql
-- Source: https://supabase.github.io/splinter/0010_security_definer_view/
-- FORWARD (zero-change IF the underlying-table RLS grants the same rows the view already returns to its callers)
ALTER VIEW public.v_merits_in_circulation SET (security_invoker = true);
-- ROLLBACK
ALTER VIEW public.v_merits_in_circulation SET (security_invoker = false);
```
> **Zero-change check (do per view):** `security_invoker` changes WHO the view's row access is evaluated as. If these analytics views are read ONLY by service-role / admin RPCs (which bypass RLS), the flip is invisible. If any authenticated/anon caller reads them and the underlying tables' RLS would now hide rows, that IS a behavior change -> document as accepted-risk and DEFER instead (D-02 allows "documented accepted-risk"). Read-map each view's callers first (these are analytics views — likely admin/service only).

### Pattern 3: Explicit deny / confirm-service-role-only (rls_enabled_no_policy fix)
**What:** A table has RLS enabled but zero policies. Default-deny is ALREADY in effect for anon/authenticated (RLS with no policy = deny all non-service-role). The advisor is INFO-level: it wants the intent made explicit.
**When to use:** `alert_state`, `rate_limit_counters`, `stripe_webhook_events` (all service-role-only by design — see `20260330000000_add_rate_limit_counters.sql:45-46` "No RLS policies needed — only service_role accesses this table via RPC").
**Example (zero-change — makes the existing implicit deny explicit, OR just documents intent):**
```sql
-- Option A (explicit, satisfies the advisor): a permissive deny-nothing policy is NOT needed;
-- the advisor clears when you add a policy. A safe zero-grant comment + leaving deny-all is valid.
-- If a policy is desired purely to silence INFO:
CREATE POLICY "Service role only - no anon/authenticated access"
ON public.rate_limit_counters FOR ALL TO authenticated USING (false) WITH CHECK (false);
-- ROLLBACK
DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.rate_limit_counters;
```
> **Zero-change rationale:** these tables are service-role-only (service_role BYPASSES RLS, so the new `USING (false)` policy for `authenticated` does not affect service-role writes). The new policy only re-states the already-effective deny for authenticated/anon -> no behavior change. This is the SAFEST of the DB-05 fixes (no caller depends on authenticated access to these tables — confirm via read-map: zero `src/**` reads of `alert_state`/`rate_limit_counters`/`stripe_webhook_events`).

### Pattern 4: search_path pin (function_search_path_mutable) — TWO different risk profiles
**What:** Pin the function's `search_path` so an attacker can't shadow an unqualified object reference.
**Use `ALTER FUNCTION`, NOT `CREATE OR REPLACE`** (avoids re-defining a body that a dependent index relies on):
```sql
-- ts_to_utc_date: body is `SELECT ($1 AT TIME ZONE 'UTC')::date` — references NO schema objects.
-- Safe with = '' OR = public. Use ALTER (it backs UNIQUE INDEX idx_benchmarks_unique_per_day).
ALTER FUNCTION public.ts_to_utc_date(timestamptz) SET search_path = '';   -- zero-change
-- ROLLBACK
ALTER FUNCTION public.ts_to_utc_date(timestamptz) RESET search_path;
```
> **increment_rate_limit is DIFFERENT (D-03 / Pitfall 3):** its body references UNQUALIFIED `rate_limit_counters` (INSERT + ON CONFLICT). `SET search_path = ''` would make that reference fail to resolve at runtime -> a 500 on EVERY rate-limit check (a live, business-critical path). For this function pin with `SET search_path = public` (the repo convention, matches the `public.rate_limit_counters` location) — OR `CREATE OR REPLACE` the function with the body re-qualified to `public.rate_limit_counters` and `SET search_path = ''`. The `= public` ALTER is the smaller, zero-change move. NEVER blindly apply `= ''` to `increment_rate_limit`.

### Pattern 5: EXECUTE-grant revoke (anon/authenticated SECURITY DEFINER RPCs) — D-03 verify-then-apply
**What:** REVOKE EXECUTE on SECURITY DEFINER RPCs from `anon`/`authenticated` where the grant was unintended.
**When to use:** `anon_security_definer_function_executable` x30 + `authenticated_security_definer_function_executable` x30 (admin_*, check_and_deduct_merits, can_perform_ai_action, ...).
**Example:**
```sql
-- FORWARD (per-function; ONLY where the read-map proves no live anon/authenticated caller)
REVOKE EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, int) FROM anon;
-- ROLLBACK
GRANT EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, int) TO anon;
```
> **D-03 hard gate:** `can_perform_ai_action` is STILL CALLED via PostgREST RPC by the frontend (161 RPC calls observed; `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108`). Revoking `authenticated` EXECUTE on `can_perform_ai_action` WOULD break those live calls -> NOT safe. Revoking `anon` is likely safe (those pages require auth) but must be proven. The `admin_*` RPCs are SECURITY DEFINER + already guard on `has_role`/admin internally, so revoking anon/authenticated EXECUTE is defense-in-depth — but each must be read-mapped. **Anything not provably safe ships generated-but-UNAPPLIED + gated.** Treat the x60 grants as the LAST and most-scrutinized wave; many will end up documented-deferred.

### Anti-Patterns to Avoid
- **`CREATE OR REPLACE` on a function backing an index/constraint:** can fail or silently change volatility — use `ALTER FUNCTION ... SET` for the search_path pins.
- **Applying a migration to prod via MCP:** FORBIDDEN (`supabase-prod-readonly` is read-only; CLAUDE.md rule 4). Operator applies prod, always.
- **Trusting the Phase 3 catalog values for prod:** they are preview-sourced. Re-pull (D-01) before acting.
- **`SET search_path = ''` as a blanket pin:** breaks functions with unqualified body references (`increment_rate_limit`).
- **Dropping `saved_jobs` because it was "absent":** it is declared in the bootstrap; absence is a preview-drift artifact, not a removal target (D-07 — reconcile by what prod shows, never a destructive drop).
- **Treating `verify:baseline` as the access-regression proof:** it never touches the live DB (offline vitest/deno + 3 Playwright flows). It proves CODE zero-change, not RLS zero-change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirm an advisory cleared | A custom pg_catalog diff script | `get_advisors(type=...)` before/after via MCP | It's the same source the audit used; deterministic; names-only |
| Re-pull live catalog truth | A new bespoke query set | The committed `.planning/audit/queries/db-introspection.sql` pack (run Section 0 first; skip Section 8 if `pg_stat_statements` absent) | Re-runnable verbatim; already the D-01 instrument; zero writes |
| Owner-scoped SELECT policy | New policy wording | Mirror `20260417000000_usage_tracking_user_select_policy.sql` (`FOR SELECT TO authenticated USING (auth.uid() = user_id)`) | The repo's canonical owner-scoping analog; the RUN-06 handoff already uses it |
| The linkedin_grades fix SQL | Re-author from scratch | The pre-authored Phase 7.1 RUN-06 forward+rollback block | Already generated, faithful rollback, re-confirm-name note included |
| security_invoker view fix | Manual `CREATE VIEW` re-definition (risks dropping the security_invoker flag — the May-2025 dashboard bug) | `ALTER VIEW ... SET (security_invoker = true)` | One-line, reversible, doesn't re-define the view body |
| Rollback path | Inventing a reverse | Capture the LIVE prior state via `pg_policies`/`pg_proc` read FIRST, then write the exact restore | D-08; the captured Phase-3 value may have drifted |
| Migration ordering/timestamp | Hand-pick a clashing timestamp | A real `YYYYMMDDHHMMSS` AFTER the latest existing (`20260607050000_*`) | Avoids the T-01 collision the RUN-06 handoff warns about |

**Key insight:** Almost every artifact this phase needs already exists in the audit trail (the SQL pack, the linkedin_grades forward+rollback, the owner-scoping analog, the advisory list, the keep-list gate). Phase 8 is sequencing + verifying + operator-applying pre-derived work, not inventing new SQL. The new work is the **read-maps that prove each grant change is safe** and the **before/after evidence that proves zero regression**.

---

## Common Pitfalls

### Pitfall 1: The project-ref discrepancy (the load-bearing trap)
**What goes wrong:** Acting on the Phase 3 catalog as if it reflects prod. It reflects `cimjltzovkahkqecpwgi` — and `scripts/deploy.ps1` proves that ref is the `staging`/`test` project (`production` = `zjpjapgraoxdukdvpjes`).
**Why it happens:** The operator ran the 2026-06-13 introspection believing `cimjltzovkahkqecpwgi` was prod; the data was real-user-scale so it looked coherent.
**How to avoid:** D-01 BLOCKING re-pull against `zjpjapgraoxdukdvpjes` via `supabase-prod-readonly`. Re-classify every Source-C reading before any DDL.
**Warning signs:** Any verdict that depends on a row count, a policy name, or a table's existence — those are exactly the Source-C readings that may differ on true prod.

### Pitfall 2: The linkedin_grades migration-history paradox
**What goes wrong:** Assuming the over-permissive "Anyone can view" policy is a simple un-fixed bug, or conversely assuming it's already fixed.
**Why it happens:** The in-repo history is contradictory. Timestamped migrations `20251218042310` (-> `TO authenticated USING (true)`) and `20251223075804` (-> owner-scoped `auth.uid() = user_id`) BOTH replace the permissive policy. YET the bootstrap `20251129_create_all_tables.sql:182` re-declares `"Anyone can view linkedin grades" ... USING (TRUE)` (guarded by `EXCEPTION WHEN duplicate_object`), and the live (preview) capture shows exactly that policy. Lexical ordering: `20251129_...` sorts AFTER `20251126120525` but BEFORE the `202512xx` owner-scoping migrations — so on a clean apply the owner-scoping SHOULD win. The live "Anyone can view" therefore implies either (a) the owner-scoping migrations never reached that project, or (b) divergent dashboard edits.
**How to avoid:** This is RESOLVED by D-01 + D-05. Re-pull prod's ACTUAL live `linkedin_grades` policies. Three outcomes: (i) prod shows "Anyone can view" -> apply the RUN-06 fix; (ii) prod already owner-scoped -> no-op, document, ship nothing; (iii) prod shows a third state -> capture it, author the fix + a faithful rollback to THAT state.
**Warning signs:** A DROP POLICY IF EXISTS that's a no-op (name mismatch) — fine, but means your assumed prior state is wrong; re-read before writing the rollback.

### Pitfall 3: `SET search_path = ''` breaks increment_rate_limit
**What goes wrong:** Applying the Supabase-recommended `SET search_path = ''` to BOTH search_path targets uniformly. `increment_rate_limit`'s body references unqualified `rate_limit_counters` -> with empty search_path the name no longer resolves -> the RPC throws -> every rate-limit check fails (500) on a live path.
**Why it happens:** The advisor lists both functions identically; the official remediation page recommends `= ''` and only footnotes the "qualify your references" caveat.
**How to avoid:** Read each function body first. `ts_to_utc_date` (no object refs) -> `= ''` safe. `increment_rate_limit` (refs `rate_limit_counters`) -> use `SET search_path = public` (repo convention; matches the live `public.rate_limit_counters`) OR `CREATE OR REPLACE` with the body re-qualified to `public.rate_limit_counters` + `= ''`. Prefer the `= public` ALTER — smaller, provably zero-change.
**Warning signs:** Any function whose body has a bare table/function name and an empty search_path pin.

### Pitfall 4: security_invoker silently hides analytics rows
**What goes wrong:** Flipping a view to `security_invoker` changes row visibility to the CALLER's RLS. If an authenticated user reads the view and the underlying tables' RLS would now scope rows to them, the view returns fewer rows -> a behavior change for any dashboard reading it.
**Why it happens:** SECURITY DEFINER views run as the (privileged) owner; invoker views run as the caller.
**How to avoid:** Read-map each of the 4 analytics views' callers. If they're read only by service-role / admin RPCs (which bypass RLS regardless), the flip is invisible -> apply. If any non-privileged caller reads them, this is NOT zero-change -> document as accepted-risk and DEFER (D-02 explicitly permits "documented accepted-risk").
**Warning signs:** A `v_*` view referenced anywhere in `src/**` with an authenticated supabase client.

### Pitfall 5: Revoking EXECUTE on a live RPC
**What goes wrong:** Blanket-revoking authenticated/anon EXECUTE on the x60 SECURITY DEFINER RPCs breaks live callers — `can_perform_ai_action` is invoked by the frontend via PostgREST (161 calls observed).
**Why it happens:** The advisor flags ALL definer RPCs with anon/authenticated grants; most are intentional defense-in-depth but a few are load-bearing.
**How to avoid:** D-03 verify-then-apply, per function. Map each RPC's callers (`rg "rpc('<fn>'" src supabase/functions`). Revoke ONLY where zero live caller depends on the grant. Everything else -> generated-but-UNAPPLIED + gated. Expect MANY of the x60 to end up deferred.
**Warning signs:** Any RPC name that appears in a `.rpc('<name>')` call in `src/**` or in an edge function's user-context (non-service-role) client.

### Pitfall 6: Re-running the introspection pack when pg_stat_statements differs
**What goes wrong:** Section 8 of `db-introspection.sql` assumes `pg_stat_statements`; if prod has it disabled the section errors or misleads.
**How to avoid:** Run Section 0 FIRST. If `pg_stat_statements` absent, skip Section 8 and record "disabled" (the pack's own runbook says this). Record the prod `stats_reset` next to any count.
**Warning signs:** A zero count read as "unused" without checking `stats_reset` (D-11 caveat — corroborating, never sole).

### Pitfall 7: Pure-ASCII discipline on any .ps1 touched
**What goes wrong:** Editing `deploy.ps1` (or any `.ps1`) with em-dashes/box-drawing -> Win PowerShell 5.1 reads cp1252 -> "missing terminator" parse break (broke + fixed in Phase 05-07).
**How to avoid:** If a `.ps1` is touched at all, keep it pure ASCII; verify `grep -c $'\xe2'` = 0. (Likely no `.ps1` change is needed this phase — flagged defensively.)

---

## Code Examples

Verified patterns from the repo + official sources.

### Re-run the prod re-pull (D-01) — read-only via MCP
```
# via supabase-prod-readonly MCP (read_only=true, ref zjpjapgraoxdukdvpjes):
execute_sql("<Section 0 of .planning/audit/queries/db-introspection.sql>")   # extensions FIRST
# then Sections 1-7 (and 8 only if pg_stat_statements present)
list_tables(schemas=["public"])                                              # cross-check inventory
get_advisors(type="security")                                                # re-confirm the 73 security findings vs the catalog
# Confirm the canonical prod ref by inspecting cron.job net.http_post URLs (Section 6) — they encode the project ref.
```

### Confirm the canonical prod ref (the D-01 (a) sub-task)
```
# Two independent confirmations, names-only:
# 1. .mcp.json already pins supabase-prod-readonly -> project_ref=zjpjapgraoxdukdvpjes (read_only=true)
# 2. scripts/deploy.ps1: production -> zjpjapgraoxdukdvpjes ; staging/test -> cimjltzovkahkqecpwgi
# 3. cron.job URLs from the re-pull Section 6 should resolve to <prod-ref>.supabase.co — if they say
#    cimjltzovkahkqecpwgi, that confirms the 2026-06-13 capture was the preview/test project.
```

### Owner-scoped SELECT policy (the canonical analog, verbatim from repo)
```sql
-- Source: supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql
CREATE POLICY "Users can view own usage"
ON public.usage_tracking
FOR SELECT TO authenticated
USING (auth.uid() = user_id);
```

### Read-only no-regression probe (prove a SELECT still returns the caller's rows after a policy change)
```sql
-- Run read-only on PREVIEW (and confirm on prod read-only post-apply).
-- Confirms an owner-scoped policy still returns the owning user's rows (not zero, not others').
-- Use set_config to simulate an authenticated request.uid if testing as a specific user:
SELECT count(*) FROM public.linkedin_grades;                 -- as service_role: total (sanity)
-- pg_policies shape before/after:
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies WHERE tablename = 'linkedin_grades' ORDER BY policyname;
```

### Migration verification DO-block (assert the post-state, established repo pattern)
```sql
-- Source pattern: supabase/migrations/20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE tablename = 'linkedin_grades' AND cmd = 'SELECT' AND 'public' = ANY(roles);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'linkedin_grades still has a public SELECT policy after fix (found %)', v_count;
  END IF;
  RAISE NOTICE 'linkedin_grades SELECT is owner-scoped; no public policy remains';
END $$;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SECURITY DEFINER views (default) | `WITH (security_invoker = true)` views | Postgres 15 | The supported fix for `security_definer_view`; one-line `ALTER VIEW ... SET (security_invoker = true)` |
| Unpinned function search_path | `SET search_path = ''` (qualify all refs) | Supabase splinter 0011 guidance | Recommended pin; BUT `= ''` requires schema-qualified bodies — repo precedent uses `= public` |
| `can_perform_ai_action` legacy gate | `usePaywallGuard`/`useTierAccess` (migrated OFF the RPC) | v3.0 (partial) | FE migration is PARTIAL — two call sites remain; this is exactly why DB-04 stays GATED |
| Paddle webhooks/columns | Stripe (`stripe-webhook-handler`, `stripe_webhook_events`) | Phase 12/27 | Paddle remnants gated on last in-flight sub — NOT removed this phase |

**Deprecated/outdated in the catalog (correct via D-01):**
- The 2026-06-13 Source-C readings (row counts, policy names, `saved_jobs` absence) — preview-sourced; re-pull supersedes them.
- CONCERNS.md §8 "no cache table" — STALE (`analysis_cache` exists).
- STATE.md historic "`cimjltzovkahkqecpwgi` = TEST project" label — consistent with `deploy.ps1` (it IS staging/test), which makes the Phase-3 "ran it as prod" a misattribution to settle.

---

## Validation Architecture

This is a zero-functional-change DB phase where the regression baseline **cannot exercise the live DB**. Zero-access-regression must be proven by a different instrument set. This section is tailored to that reality (the orchestrator should generate VALIDATION.md from it).

### The core problem
`npm run verify:baseline` = vitest (frontend, jsdom) + offline-deno (`--no-check`, no live DB) + 3 Playwright flows. **None of these connect to Postgres or evaluate an RLS policy.** It proves CODE zero-change (and this phase's code diff should be EMPTY — no `src/**`, no `supabase/functions/**` edits; only `.sql` files + docs). It does NOT and CANNOT prove an RLS/grant change preserved access behavior. So "zero functional change" for the DB layer needs its own proof, per migration.

### What actually proves zero-access-regression (the Nyquist coverage for this phase)
For EACH applied migration, capture a before/after pair on the live DB (preview first, then prod read-only):

| Signal | Instrument | Proves |
|--------|-----------|--------|
| Advisory presence -> absence | `get_advisors(type="security")` before/after | The intended finding is remediated (and no NEW advisory appeared) |
| Policy SHAPE before/after | `pg_policies` read (name, cmd, roles, qual, permissive) | Exactly the intended policy delta — no collateral policy change |
| Function attribute before/after | `pg_proc` read (proconfig for search_path; proacl for grants) | The pin/revoke landed and nothing else moved |
| Access NO-regression | targeted `SELECT count(*)` / `SELECT`-as-context probes | The owning user still reads their rows; no unintended caller is newly denied/allowed |
| Grant read-map (pre-apply, code side) | `rg "\.rpc\('<fn>'\|from\('<table>'" src supabase/functions` | No live caller depends on the grant being removed (D-03) |
| No new error class post-apply | `get_logs(service="postgres"/"api")` | The change didn't start a new failure (e.g. a 500 on a now-broken RPC) |

### The gate sequence per migration (the "Nyquist sampling" — sample at every state transition)
```
PRE:   capture advisor + pg_policies/pg_proc + targeted read   (preview AND prod read-only)
APPLY: on PREVIEW (supabasepreview / db push --project-ref cimjltzovkahkqecpwgi)
POST-PREVIEW: advisor cleared + shape == intended + read unchanged
GATE:  operator review [autonomous:false]
APPLY-PROD: operator applies to zjpjapgraoxdukdvpjes (Claude never writes prod)
POST-PROD: re-capture advisor + pg_policies + targeted read (read-only) == intended
ROLLBACK READY: the file's rollback restores the captured PRE state exactly (D-08)
```

### What `verify:baseline` IS still used for here
- As the CODE zero-change proof: run it and confirm `git diff -- src supabase/functions` is EMPTY (this phase ships SQL + docs only). A green/expected baseline + empty code diff is the code-side half.
- Honest baseline state to carry forward (from Phase 7.1 RUN-07): vitest has a **pre-existing 2-test flaky red** (`AnalysisHistory.interviewPrep.test.tsx`, R-03) and Playwright has the **`stripe :56` env-red caused by the PAUSED preview** (R-02). Once D-04 un-pauses preview, the Playwright env-red MAY clear and the R-02 deferred live-deploy-smoke for the 7.1-touched functions becomes runnable — note this as a side-benefit, not a Phase-8 requirement.

### autonomous:false checkpoints (operator-gated — never auto-advance)
1. **D-04 un-pause preview** — operator action (un-pausing a Supabase project).
2. **D-05 preview-sync + parity confirm** — operator confirms preview is at repo HEAD and structurally matches prod.
3. **Each prod apply** — operator applies every migration to prod (Claude generates; operator executes). CLAUDE.md rules 3/4/8.
4. **Each D-03 grant-altering decision** — operator confirms the read-map before a grant change is applied (or accepts the gated-deferral).
5. Honor the memory note: PAUSE for `autonomous:false` operator smokes; never auto-approve DB-applies.

### Per-requirement validation map
- **DB-03:** evidence (D-01 re-pull shows a structure clears all 3 sources + KEEP-LIST) -> forward+rollback file -> preview-apply -> verify removed + nothing else changed -> operator prod-apply -> re-verify. Expect ~0 structures qualify.
- **DB-04:** NO DDL. Validation = the gated-disposition DOC is complete: the dual read/write map + the two live `can_perform_ai_action` FE call sites + the 7+ live writers, with the blocking dependency named. Prove `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108` are byte-identical (`git diff` empty).
- **DB-05:** per-advisory before/after advisor + pg_policies/pg_proc shape + no-regression read (the table above), gated through preview, grant-changes behind D-03.
- **DB-06:** every shipped migration has a paired rollback restoring the captured-live PRE state; rollback fidelity re-confirmed against the fresh `pg_policies`/`pg_proc` read (D-08).

---

## Open Questions

1. **Does true prod (`zjpjapgraoxdukdvpjes`) carry the over-permissive `linkedin_grades` "Anyone can view" policy, or the owner-scoped one?**
   - What we know: the preview capture shows "Anyone can view" (USING true, role public); the timestamped migrations `20251218042310` + `20251223075804` replace it with owner-scoped policies; the bootstrap re-declares the permissive one.
   - What's unclear: which actually landed on prod (migration-state divergence between projects is the likely cause).
   - Recommendation: D-01 re-pull resolves it. If owner-scoped on prod -> the RUN-06 fix is a no-op (document, ship nothing). If permissive -> apply the RUN-06 forward+rollback after re-confirming the live name.

2. **Does `saved_jobs` exist on canonical prod?**
   - What we know: declared in bootstrap `20251129_create_all_tables.sql` (`CREATE TABLE IF NOT EXISTS`); "absent" only in the preview capture.
   - What's unclear: present on prod (preview-drift artifact) vs genuinely absent (a never-applied bootstrap on that project).
   - Recommendation: D-07 — `list_tables` on prod. If present, the "absent" was a wrong-project artifact (resolved). If absent on prod too, reconcile migration history via documentation/repair, NEVER a destructive drop.

3. **Are the 4 analytics views (`v_*`) read by any non-service-role caller?**
   - What we know: they're analytics/aggregate views; likely admin/service-role only.
   - What's unclear: whether any authenticated dashboard query reads them (which would make the `security_invoker` flip a behavior change).
   - Recommendation: `rg "v_merits_in_circulation\|v_feature_consumption_daily\|v_shop_purchases_daily\|v_conversion_funnel" src supabase/functions`. If only service-role/admin -> apply. If any authenticated read -> document accepted-risk + defer (D-02 permits).

4. **Which of the x60 EXECUTE grants are genuinely unintended vs load-bearing?**
   - What we know: `can_perform_ai_action` authenticated EXECUTE IS load-bearing (live FE RPC); `admin_*` are internally role-guarded.
   - What's unclear: the exact safe-to-revoke subset.
   - Recommendation: per-function read-map (D-03). Revoke only the provably-unused; gate the rest. Expect this wave to be mostly documented-deferred.

5. **After un-pause, is preview's schema actually reconcilable to prod, or has it drifted too far?**
   - What we know: preview has been paused/possibly drifted since Phase 3; the linkedin_grades + saved_jobs anomalies suggest divergence.
   - What's unclear: how much `supabase db push` reconciliation it needs.
   - Recommendation: D-05 — sync to repo HEAD then read-only-confirm structure matches the D-01 prod reference BEFORE relying on preview test-first. If irreconcilable, surface to operator (it would weaken the test-first guarantee for affected objects).

---

## Sources

### Primary (HIGH confidence)
- `.mcp.json` (repo) — server config: `supabase-prod-readonly` = `project_ref=zjpjapgraoxdukdvpjes&read_only=true&features=database,debugging,docs`; `supabasepreview` = `project_ref=cimjltzovkahkqecpwgi`.
- `scripts/deploy.ps1` (repo) — `production -> zjpjapgraoxdukdvpjes`; `staging`/`test -> cimjltzovkahkqecpwgi`; verify:baseline HARD gate before `supabase link`.
- `supabase/migrations/` (repo) — naming convention; `20251129_create_all_tables.sql:182` (bootstrap "Anyone can view"), `20251126120525_*` (first table+permissive policy), `20251218042310_*` + `20251223075804_*` (owner-scoping replacements), `20260417000000_usage_tracking_user_select_policy.sql` (owner-scoped analog), `20260330000000_add_rate_limit_counters.sql` (increment_rate_limit body + service-role-only RLS note), `20260525000005_*:479` (ts_to_utc_date body + the UNIQUE index dependency), `20260520000000_*` (forward-migration + verification DO-block pattern).
- `.planning/audit/DATABASE.md` — DB-01/DB-02, dual read/write maps, project-ref discrepancy caveat, saved_jobs drift, 0 confirmed-safe.
- `.planning/audit/queries/db-introspection.sql` + `...-results.md` — the re-runnable pack + the 2026-06-13 preview-sourced capture.
- `.planning/audit/RUNTIME-RELIABILITY.md` — the 233-advisory triage, the per-class decision/verification/rollback table, the RUN-06 linkedin_grades forward+rollback handoff + re-confirm-before-apply note.
- `.planning/audit/KEEP-LIST.md` — the never-safe gate (Class 1/2/3).
- `.planning/audit/RESIDUAL-REGISTER.md` — R-02 (deferred preview deploy-smoke), R-03 (pre-existing vitest flaky), prior phase deferral patterns.
- `CLAUDE.md` §Coding Style MCP rules 1-8 — prod-read-only / operator-applies-prod / rollback-for-every-migration / test-preview-first.

### Secondary (HIGH — official Supabase docs)
- https://supabase.github.io/splinter/0010_security_definer_view/ — `ALTER VIEW ... SET (security_invoker = true)` is the supported fix (Postgres 15+).
- https://supabase.github.io/splinter/0011_function_search_path_mutable/ — `SET search_path = ''` recommended; CAVEAT: all body references must be schema-qualified once `= ''`.
- https://supabase.com/docs/guides/database/database-advisors — advisor/lint catalog (accessed via `get_advisors`).

### Tertiary (MEDIUM — community, cross-verified with official)
- GitHub issue supabase/supabase#35823 + Discussion #28464 — the May-2025 dashboard "missing security_invoker" gotcha (verified against the splinter doc) — reinforces using `ALTER VIEW ... SET` over re-`CREATE VIEW`.

---

## Metadata

**Confidence breakdown:**
- Standard stack / tooling: HIGH — `.mcp.json` + `deploy.ps1` + existing migrations are direct repo evidence.
- Migration mechanics & fix templates: HIGH — official splinter docs + verbatim repo analogs + the pre-authored RUN-06 handoff.
- Per-advisory zero-change risk classification: HIGH for the function bodies/views read directly; MEDIUM for the x60 EXECUTE grants (the exact safe-to-revoke subset needs the per-function D-03 read-map at plan time).
- The project-ref / linkedin_grades / saved_jobs verdicts: deliberately HELD as Open Questions — they are RESOLVED ONLY by the D-01 prod re-pull, by design (the whole phase waits on it).
- Validation architecture: HIGH — derived from the constraint that `verify:baseline` cannot reach the live DB, cross-checked against the MCP read verbs and the Phase 7.1 baseline state.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable — Postgres/Supabase advisory semantics are slow-moving; the live-prod verdicts are re-pull-gated so they refresh at execute time regardless).
