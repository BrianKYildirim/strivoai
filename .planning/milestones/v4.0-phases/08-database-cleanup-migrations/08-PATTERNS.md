# Phase 8: Database Cleanup & Migrations - Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 9 artifact classes (SQL migrations + audit docs; per D-06 no `src/` changes)
**Analogs found:** 9 / 9 (every artifact has a verbatim in-repo or pre-authored analog)

> **Phase-shape note for the planner.** This is a DATABASE phase, not a code phase. The "files
> to create" are (a) new reversible forward-migration `.sql` files under `supabase/migrations/`
> (forward + rollback, one logical change per file) and (b) catalog/disposition updates under
> `.planning/audit/`. Per CONTEXT **D-06** the frontend stays byte-identical — there are **zero**
> `src/**` or `supabase/functions/**` edits. The research's central insight holds: *almost every
> SQL artifact already exists* (the introspection pack, the RUN-06 linkedin_grades forward+rollback,
> the owner-scoping analog, the splinter fix templates). Phase 8 **sequences, verifies, and
> operator-applies** pre-derived work; the genuinely new work is the read-maps that prove each
> grant change is safe and the before/after evidence docs. Treat each migration as one-change-per-file
> with a paired rollback (D-08) and route every one through preview before prod (D-05).

---

## File Classification

| New/Modified File (pattern) | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `supabase/migrations/<ts>_linkedin_grades_owner_select.sql` (D-03 grant-altering) | migration (RLS policy) | transform (DDL) | `.planning/audit/RUNTIME-RELIABILITY.md` RUN-06 block + `20260417000000_usage_tracking_user_select_policy.sql` | exact (pre-authored) |
| `supabase/migrations/<ts>_pin_search_path_ts_to_utc_date.sql` | migration (function attr) | transform (DDL) | `20260525000005_*:479` (`ts_to_utc_date` body) + `20260517000002_*:33` (`SET search_path`) | role+flow match |
| `supabase/migrations/<ts>_pin_search_path_increment_rate_limit.sql` (D-03 risk-tier) | migration (function attr) | transform (DDL) | `20260330000000_add_rate_limit_counters.sql` (the body that breaks under `=''`) | exact (the live body) |
| `supabase/migrations/<ts>_<view>_security_invoker.sql` x≤4 | migration (view attr) | transform (DDL) | `20260525000001_*:168-170` (`WITH (security_invoker = true)`) | role+flow match |
| `supabase/migrations/<ts>_<table>_explicit_deny.sql` x≤3 | migration (RLS policy) | transform (DDL) | `20260330000000_add_rate_limit_counters.sql:43-46` (service-role-only RLS note) | exact (the live tables) |
| `supabase/migrations/<ts>_revoke_execute_<fn>.sql` x≤60 (D-03 verify-then-apply) | migration (grant) | transform (DDL) | `20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` (DROP+verify shape) | role+flow match |
| `.planning/audit/queries/db-introspection-results.md` (D-01 re-pull, corrected) | doc (evidence capture) | event-driven (read-only introspection) | existing `db-introspection-results.md` (2026-06-13 capture) | exact (same file, re-run) |
| `.planning/audit/DATABASE.md` + `RESIDUAL-REGISTER.md` rows (DB-04 gated disposition) | doc (gated register) | transform (documentation) | `RESIDUAL-REGISTER.md` R-01 row + `DATABASE.md` Verdict block | exact (append to same files) |
| `.planning/audit/INDEX.md` row (catalog entry, if a new doc is added) | doc (catalog index) | transform (documentation) | `INDEX.md` Domain → Doc Map table | exact |

> **No new SQL pack is authored** — D-01 re-runs the *committed* `.planning/audit/queries/db-introspection.sql`
> verbatim against canonical prod via `supabase-prod-readonly` (read Section 0 first; skip Section 8 if
> `pg_stat_statements` absent). It is a re-run, not a new file (research "Don't Hand-Roll" row 2).

**Migration timestamp convention:** `YYYYMMDDHHMMSS_<short_snake_desc>.sql`, one logical change per file.
The latest existing file is `20260607050000_allow_resume_document_mime_types.sql` — every Phase 8
timestamp MUST sort strictly **after** it to avoid the T-01 collision the RUN-06 handoff warns about.

---

## Pattern Assignments

### `<ts>_linkedin_grades_owner_select.sql` (migration, RLS policy — D-03 grant-altering)

**Analog (pre-authored, faithful forward+rollback):** `.planning/audit/RUNTIME-RELIABILITY.md`
lines 273-302 (RUN-06 handoff), mirroring the owner-scoping analog
`supabase/migrations/20260417000000_usage_tracking_user_select_policy.sql`.

**Owner-scoped SELECT analog** (`20260417000000_usage_tracking_user_select_policy.sql`, full file):
```sql
CREATE POLICY "Users can view own usage"
ON public.usage_tracking
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

**Pre-authored forward + rollback to sequence** (RUN-06 block, `RUNTIME-RELIABILITY.md:282-301`):
```sql
-- FORWARD: scope linkedin_grades SELECT to owner-only, replacing the over-permissive
-- "Anyone can view linkedin grades" (role public, USING true).
DROP POLICY IF EXISTS "Anyone can view linkedin grades" ON public.linkedin_grades;
CREATE POLICY "Owners can view their linkedin grades"
ON public.linkedin_grades
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ROLLBACK: restore the prior policy EXACTLY as captured live (D-08).
DROP POLICY IF EXISTS "Owners can view their linkedin grades" ON public.linkedin_grades;
CREATE POLICY "Anyone can view linkedin grades"
ON public.linkedin_grades
FOR SELECT
TO public
USING (true);
```

**D-08 operator note (re-confirm before applying)** (`RUNTIME-RELIABILITY.md:304-310`): the captured
name/role/qual come from the 2026-06-13 Source-C `pg_policies` read, which is **preview-sourced**. Before
applying, re-confirm the LIVE policy on prod via a fresh `pg_policies` read. Three outcomes (research Pitfall 2 /
Open Question 1): (i) prod shows "Anyone can view" → apply this forward; (ii) prod already owner-scoped →
**no-op, document, ship nothing**; (iii) prod shows a third state → capture it, author the fix + a faithful
rollback to *that* state. The `DROP POLICY IF EXISTS` is idempotent so a name mismatch is a no-op, but the
ROLLBACK's restore must match whatever the live prior policy actually is.

---

### `<ts>_pin_search_path_ts_to_utc_date.sql` (migration, function attribute)

**Analog (the live function body — references NO schema objects, so `=''` is safe):**
`supabase/migrations/20260525000005_phase42_layer4_applications_outcomes.sql:479-488`:
```sql
CREATE OR REPLACE FUNCTION public.ts_to_utc_date(ts timestamptz)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT ($1 AT TIME ZONE 'UTC')::date $$;

-- DEPENDENCY (why ALTER, not CREATE OR REPLACE): this function backs a UNIQUE INDEX.
CREATE UNIQUE INDEX IF NOT EXISTS idx_benchmarks_unique_per_day
  ON public.benchmarks (cohort_key, metric, public.ts_to_utc_date(computed_at));
```

**Fix pattern (use `ALTER FUNCTION`, NOT `CREATE OR REPLACE` — avoids disturbing the index):**
```sql
-- FORWARD: body has no object refs → = '' is the zero-change pin.
ALTER FUNCTION public.ts_to_utc_date(timestamptz) SET search_path = '';
-- ROLLBACK
ALTER FUNCTION public.ts_to_utc_date(timestamptz) RESET search_path;
```

> `CREATE OR REPLACE` re-defines the body and can be blocked by / silently disturb the dependent
> `idx_benchmarks_unique_per_day` index — `ALTER` changes only the attribute (research Anti-Pattern 1).

---

### `<ts>_pin_search_path_increment_rate_limit.sql` (migration, function attribute — D-03 risk-tier, DO NOT treat as identical to ts_to_utc_date)

**Analog (the live body — references UNQUALIFIED `rate_limit_counters`, so `=''` would BREAK it):**
`supabase/migrations/20260330000000_add_rate_limit_counters.sql:27-46`:
```sql
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key TEXT,
  p_window_start BIGINT
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters (rate_key, window_start, counter)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (rate_key, window_start)
  DO UPDATE SET counter = rate_limit_counters.counter + 1   -- ← UNQUALIFIED ref breaks under = ''
  RETURNING counter INTO v_counter;
  RETURN v_counter;
END;
$$;
-- ...
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed — only service_role accesses this table via RPC
```

**Fix pattern (use `= public`, the repo convention — NOT `= ''`):**
```sql
-- FORWARD: body references unqualified rate_limit_counters; = '' would fail to resolve at
-- runtime → 500 on every rate-limit check (live, business-critical path). Pin to public.
ALTER FUNCTION public.increment_rate_limit(text, bigint) SET search_path = public;
-- ROLLBACK
ALTER FUNCTION public.increment_rate_limit(text, bigint) RESET search_path;
```

> **Pitfall 3 (load-bearing).** The advisor lists `ts_to_utc_date` and `increment_rate_limit`
> identically, but they have DIFFERENT risk profiles. NEVER blindly apply `SET search_path = ''` to
> `increment_rate_limit`. `= public` matches the live `public.rate_limit_counters` location and is the
> smaller, provably-zero-change move. (Alternative: `CREATE OR REPLACE` with the body re-qualified to
> `public.rate_limit_counters` + `= ''` — larger surface, not preferred.) The repo's existing pinned
> functions (e.g. `reset_subscription_merits`) use `SET search_path = public, pg_temp` — see Shared Patterns.

---

### `<ts>_<view>_security_invoker.sql` (migration, view attribute) — x≤4 analytics views

**Analog (a live `security_invoker` view in the repo):**
`supabase/migrations/20260525000001_phase42_layer1_users_career_targets.sql:168-170`:
```sql
DROP VIEW IF EXISTS public.cohort_peers;
CREATE VIEW public.cohort_peers
WITH (security_invoker = true)
AS
SELECT ...
```

**Fix pattern (use `ALTER VIEW ... SET`, NOT re-`CREATE VIEW` — avoids the May-2025 dashboard "missing flag" bug):**
```sql
-- FORWARD: recreate as security_invoker so the view obeys the caller's RLS.
ALTER VIEW public.v_merits_in_circulation SET (security_invoker = true);
-- ROLLBACK
ALTER VIEW public.v_merits_in_circulation SET (security_invoker = false);
```

**Target views** (from `db-introspection-results.md:49-50`): `v_merits_in_circulation`,
`v_feature_consumption_daily`, `v_shop_purchases_daily`, `v_conversion_funnel`
(NOTE: `cohort_peers` is already `security_invoker` — exclude it).

> **Zero-change check per view (Pitfall 4 / Open Question 3).** Flipping to `security_invoker` changes
> WHO row access is evaluated as. If a view is read only by service-role/admin RPCs (which bypass RLS),
> the flip is invisible → apply. If any authenticated/anon caller reads it and the underlying tables'
> RLS would now hide rows, that IS a behavior change → document as accepted-risk and **defer** (D-02
> explicitly permits "documented accepted-risk"). Read-map first:
> `rg "v_merits_in_circulation|v_feature_consumption_daily|v_shop_purchases_daily|v_conversion_funnel" src supabase/functions`.

---

### `<ts>_<table>_explicit_deny.sql` (migration, RLS policy) — x≤3 `rls_enabled_no_policy`

**Analog (the live intent: RLS enabled, no policy, service-role-only by design):**
`supabase/migrations/20260330000000_add_rate_limit_counters.sql:43-46`:
```sql
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
-- No RLS policies needed — only service_role accesses this table via RPC
```

**Fix pattern (zero-change — re-states the already-effective deny for authenticated/anon; service_role bypasses RLS):**
```sql
-- FORWARD: silence the INFO advisor by making the implicit deny explicit.
CREATE POLICY "Service role only - no anon/authenticated access"
ON public.rate_limit_counters FOR ALL TO authenticated USING (false) WITH CHECK (false);
-- ROLLBACK
DROP POLICY IF EXISTS "Service role only - no anon/authenticated access" ON public.rate_limit_counters;
```

**Target tables** (D-02): `alert_state`, `rate_limit_counters`, `stripe_webhook_events`.

> **Zero-change rationale (Pattern 3 — the SAFEST DB-05 fix).** These tables are service-role-only;
> `service_role` BYPASSES RLS, so a new `USING (false)` policy for `authenticated` does not touch
> service-role writes — it only re-states the already-effective deny. Confirm via read-map: zero
> `src/**` reads of `alert_state`/`rate_limit_counters`/`stripe_webhook_events`. (An equally valid
> zero-change option is to leave deny-all and just DOCUMENT the intent — the advisor is INFO-level.)

---

### `<ts>_revoke_execute_<fn>.sql` (migration, EXECUTE grant) — x≤60, D-03 verify-then-apply (LAST + most-scrutinized wave)

**Analog (a forward-migration that removes a privilege + a read-only verification DO-block):**
`supabase/migrations/20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql` — see the WHY-block
header style (lines 1-36), the `DROP FUNCTION IF EXISTS` (line 41), and the verification DO-block (lines 47-82).

**Fix pattern (per-function, ONLY where the read-map proves no live anon/authenticated caller):**
```sql
-- FORWARD
REVOKE EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, int) FROM anon;
-- ROLLBACK
GRANT EXECUTE ON FUNCTION public.admin_set_user_credits(uuid, int) TO anon;
```

> **D-03 hard gate (Pitfall 5).** `can_perform_ai_action` is STILL CALLED via PostgREST RPC by the
> frontend — confirmed live at `src/components/Navbar.tsx:109` and `src/pages/SkillsGapAnalysis.tsx:108`
> (the paywall hooks `usePaywallGuard`/`useTierAccess` carry *negative* assertions that they never call
> it). Revoking `authenticated` EXECUTE on `can_perform_ai_action` WOULD break those live calls → NOT
> safe. Per-function read-map (`rg "\.rpc\('<fn>'" src supabase/functions`); revoke ONLY the
> provably-unused; everything else ships **generated-but-UNAPPLIED + gated** (Pattern F). Expect MANY of
> the x60 to end up documented-deferred.

---

### `.planning/audit/queries/db-introspection-results.md` (D-01 corrected re-pull, evidence doc)

**Analog (same file — re-run against the corrected prod ref):** the existing 2026-06-13 capture, header
at lines 1-23. Mirror its **names-not-values** discipline verbatim:
```markdown
> **Operator-run live-prod read-only introspection** ...
> This is catalog metadata ONLY (object names / counts / signatures / policy names /
> index names). **No secret values, no row data, no decrypted_secrets.**

**Run date:** <new>
**Source:** canonical PROD `zjpjapgraoxdukdvpjes` via supabase-prod-readonly (read_only=true)
**`pg_stat_statements`:** <ENABLED vX | disabled — skip Section 8>
**`stats_reset`:** <ts> — record next to any zero/low count (corroborating-not-sole, D-11)
```

> **D-01 correction (Pitfall 1).** The 2026-06-13 capture's "Project ref observed: `cimjltzovkahkqecpwgi`"
> (line 10) and the ⚠ Discrepancy caveat (lines 11-17) are exactly what this re-pull resolves. The new
> results doc records `zjpjapgraoxdukdvpjes` (the canonical prod ref, confirmed two ways: `.mcp.json` pins
> `supabase-prod-readonly` to it; `scripts/deploy.ps1` maps `production → zjpjapgraoxdukdvpjes` while
> `staging`/`test → cimjltzovkahkqecpwgi`; and cron URLs in Section 6 should resolve to the prod ref).
> **Re-classify every Source-C reading before any DDL.** Run the secret-grep guard before commit.

---

### `.planning/audit/DATABASE.md` + `RESIDUAL-REGISTER.md` (DB-04 gated disposition)

**Analog (the gated-disposition row style):** `RESIDUAL-REGISTER.md` R-01 (lines 26-37) — a field-table row
recording **File / Discovered-by / Audit-verdict / Residual-signal (why it did NOT clear) / Why-deferred /
Clearance-criterion / Status**. Mirror it for the `usage_tracking` + `can_perform_ai_action` cluster:

```markdown
### R-?? — usage_tracking + can_perform_ai_action cluster (GATED, DB-04)

| Field | Value |
| ----- | ----- |
| **Structure** | `public.usage_tracking` table + `can_perform_ai_action` RPC cluster |
| **Audit verdict (origin)** | DATABASE.md DB-02 → `needs-investigation` (heavily live) |
| **Residual signal (why it did NOT clear)** | TWO live FE call sites: `src/components/Navbar.tsx:109`, `src/pages/SkillsGapAnalysis.tsx:108`; + 7+ live writers via `record_ai_usage`/`check_and_record_ai_usage` |
| **Why deferred** | D-06: editing live paywall-gate code is functional-change risk; retire only if fully migrated AND unreferenced |
| **Clearance criterion** | Migrate the two FE call sites off `can_perform_ai_action` (to `usePaywallGuard`/`useTierAccess`) + retire the 7+ writers; then the RPC + table can be dropped (forward+rollback) |
| **Status** | **GATED / backlog** — documented, no live-code surgery this phase |
```

**Also update `DATABASE.md` Verdict block** (lines 13-34) — its DB-02 counts, PROJECT-REF DISCREPANCY caveat
(lines 33), and the `usage_tracking` bottom-line (line 29) are the rows the D-01 re-pull reconciles to true prod.

> **DB-04 validation = NO DDL.** The phase proves DB-04 by (a) the gated-disposition doc being complete
> (dual read/write map + the two live call sites + the 7+ writers + the named blocking dependency), and
> (b) proving `Navbar.tsx:109` + `SkillsGapAnalysis.tsx:108` are byte-identical (`git diff` empty, D-06).

---

## Shared Patterns

### Migration file structure (forward + rollback + WHY block + verification)
**Source:** `supabase/migrations/20260520000000_drop_legacy_check_and_deduct_merits_3arg.sql`
**Apply to:** EVERY Phase 8 migration file.
Each file = (1) a WHY comment block (symptom / root cause / zero-change rationale / re-runnability note,
lines 1-36), (2) idempotent FORWARD DDL (`IF EXISTS`/`IF NOT EXISTS`/`OR REPLACE`/`DO $$ ... duplicate_object`),
(3) the ROLLBACK DDL (fenced comment OR sibling file — D-08), (4) optional read-only verification DO-block:
```sql
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

### `SET search_path = public, pg_temp` (the repo's pinned-function convention)
**Source:** `supabase/migrations/20260517000002_merit_free_arm_reset_rpc.sql:29-34`
**Apply to:** any function pin where the body references public objects (the `increment_rate_limit` tier).
```sql
CREATE OR REPLACE FUNCTION public.reset_subscription_merits(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ ... $$;
```
> This is why the research recommends `= public` (not `= ''`) for `increment_rate_limit`: it matches the
> repo's established convention for functions touching `public.*` objects.

### Names-not-values discipline (every committed audit doc)
**Source:** `.planning/audit/DATABASE.md:9`, `db-introspection-results.md:4-6`
**Apply to:** the D-01 re-pull results doc + every register/disposition update.
Record object names / counts / signatures / policy names / index names ONLY — never a secret value, a
connection string, a project-ref-as-secret, or row data. Run the secret-grep guard before commit (Phase 2 REPO-05).

### MCP read-only-prod / operator-applies / test-preview-first (the phase spine)
**Source:** `CLAUDE.md` §Coding Style MCP rules 1-8; CONTEXT D-01/D-04/D-05.
**Apply to:** every migration's apply sequence.
PRE (capture advisor + `pg_policies`/`pg_proc` + targeted read, preview AND prod read-only) → APPLY on
PREVIEW (`supabasepreview` / `db push --project-ref cimjltzovkahkqecpwgi`) → POST-PREVIEW verify → operator
review [`autonomous:false`] → operator APPLIES prod (`zjpjapgraoxdukdvpjes`; Claude NEVER writes prod) →
POST-PROD re-verify read-only → commit file + register row. `verify:baseline` proves CODE zero-change
(confirm `git diff -- src supabase/functions` EMPTY) but CANNOT prove RLS zero-change — that needs the
per-migration before/after advisor + `pg_policies`/`pg_proc` + no-regression read.

### `autonomous:false` operator checkpoints (never auto-advance)
1. D-04 un-pause preview (operator action). 2. D-05 preview-sync + parity confirm. 3. EACH prod apply.
4. EACH D-03 grant-altering decision (operator confirms the read-map). Honor the memory note: PAUSE for
`autonomous:false` operator smokes; never auto-approve DB-applies.

---

## No Analog Found

None. Every Phase 8 artifact maps to a verbatim in-repo file, a pre-authored handoff block, or an official
Supabase splinter fix template cited in the research. The genuinely new work is not new *SQL shapes* — it is
the **per-grant read-maps** (D-03) and the **before/after evidence** that prove zero-access-regression; those
are validation activities, not files needing a code analog.

---

## Metadata

**Analog search scope:** `supabase/migrations/` (76 files), `.planning/audit/` (DATABASE.md, RUNTIME-RELIABILITY.md,
RESIDUAL-REGISTER.md, INDEX.md, queries/db-introspection*.{sql,md}), `src/` (call-site confirmation only).
**Files scanned:** ~14 (migrations + audit docs + 2 frontend call-site greps).
**Pattern extraction date:** 2026-06-24
**Latest existing migration (timestamp floor for new files):** `20260607050000_allow_resume_document_mime_types.sql`
