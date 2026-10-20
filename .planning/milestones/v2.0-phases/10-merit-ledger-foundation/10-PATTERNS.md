# Phase 10: merit-ledger-foundation - Pattern Map

**Mapped:** 2026-04-14
**Files analyzed:** 3 new files
**Analogs found:** 3 / 3

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `supabase/migrations/20260414000000_merit_ledger_foundation.sql` | migration (DDL + RLS + trigger + backfill) | batch / schema-mutation | `supabase/migrations/20260412000000_stripe_migration.sql` + `supabase/migrations/20251113100645_eb5d1704-66ae-4c1a-ad99-05bf7363585f.sql` | exact (RLS posture) + exact (trigger+FK+updated_at pattern) |
| `supabase/functions/_tests/phase-10-rls.test.ts` (NEW location — see "Divergence") | test (Deno integration) | request-response (against real Supabase) | `supabase/functions/stripe-webhook/index.test.ts` + `supabase/functions/_shared/auth.test.ts` | role-match (Deno test framework), no exact analog for "anon client against RLS" pattern |
| `scripts/phase-10-legacy-snapshot.sh` (NEW — see "Divergence") | script (validation utility) | batch / IO | `scripts/deploy-staging.ps1` (closest but wrong shell), `scripts/run-edge-tests.ps1` | role-match (repo uses PowerShell, not bash) |

## Divergence From CONTEXT File Paths

The pattern-mapping context specified:

1. **`supabase/functions/_tests/`** — this directory does **not** exist in the repo. The established pattern is **colocated** `*.test.ts` next to the source file (e.g. `stripe-webhook/index.test.ts`, `_shared/auth.test.ts`). Planner should choose either:
   - Colocated at `supabase/functions/_shared/merit-rls.test.ts` (if framed as a shared-layer test), **OR**
   - A new directory `supabase/functions/_tests/phase-10-rls.test.ts` (establishes a new convention — acceptable since Phase 10 has no natural edge-function home)
   - Recommendation: the latter, explicitly noted in the migration header, because the test is not tied to a single function.

2. **`.sh` shell script** — the repo contains **zero** `.sh` files; all scripts are PowerShell (`.ps1`) per `scripts/deploy-staging.ps1`, `scripts/deploy-production.ps1`, `scripts/run-edge-tests.ps1`. Planner should use `scripts/phase-10-legacy-snapshot.ps1` to match repo conventions unless user explicitly wants bash.

## Pattern Assignments

### `supabase/migrations/20260414000000_merit_ledger_foundation.sql`

**Primary analog:** `supabase/migrations/20260412000000_stripe_migration.sql` (entire file, 37 lines)
**Secondary analog:** `supabase/migrations/20251113100645_eb5d1704-66ae-4c1a-ad99-05bf7363585f.sql` (lines 30–52, 93–105)

**Header comment pattern** (stripe migration lines 1–4):
```sql
-- Phase 07: Stripe migration — additive only.
-- Closes STR-06 (profiles columns) and STR-07 (stripe_webhook_events with correct RLS).
-- CRITICAL: Do NOT add any permissive policy that matches all rows. The Paddle migration
-- has that bug (SEC-06); do not replicate. Service role bypasses RLS automatically.
```
Copy this header format verbatim for Phase 10, substituting REQ IDs (MER-01..04, MER-10, MER-13, MER-14, MIG-01, MIG-04) and the same anti-SEC-06 warning.

**RLS-enable-with-zero-permissive-policies pattern** (stripe migration lines 29–32):
```sql
-- STR-07: RLS enabled with NO permissive policies.
-- Service role bypasses RLS. Anon / authenticated roles have zero access by default.
-- DO NOT add any permissive CREATE POLICY here — that is the SEC-06 Paddle bug.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
```
Phase 10 applies this to all three new tables. Phase 10 additionally adds a single `FOR SELECT USING (auth.uid() = user_id)` policy per table (D-17) — this is the **only** deviation from the Stripe template's zero-policy posture, because user_merits needs read access for the frontend balance display.

**Partial index pattern** (stripe migration lines 13–19):
```sql
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
```
Copy this `WHERE NOT NULL` partial index form for `idx_user_merits_subscription_reset_date` (D-01 Free users have NULL; partial index excludes them from cron scans).

**`IF NOT EXISTS` CREATE TABLE pattern** (stripe migration lines 22–27):
```sql
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
Apply `CREATE TABLE IF NOT EXISTS public.user_merits (...)`, same for `merit_transactions` and `merit_shop_purchases`. Repo convention: `text` over `varchar`, `jsonb` over `json`, `timestamptz NOT NULL DEFAULT now()` for audit timestamps.

**SECURITY DEFINER trigger function pattern** (20251113100645 lines 31–46):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
```
Phase 10's `auto_provision_user_merits` is a **structural copy** with these mandatory differences per D-05, D-07, D-08:
- Trigger target: `public.profiles` (NOT `auth.users`) — Pitfall 3 in RESEARCH.md
- Function body inserts into **two** tables: `user_merits` (with `ON CONFLICT (user_id) DO NOTHING`, D-06) AND `merit_transactions` (grant row, D-08)
- `SECURITY DEFINER SET search_path = public` preserved verbatim (ASVS V4 / search_path injection mitigation)

**Trigger binding pattern** (20251113100645 lines 49–52):
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```
Phase 10 analog:
```sql
CREATE TRIGGER on_profile_created_provision_merits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_user_merits();
```

**`update_updated_at_column` reuse pattern** (20251113100645 lines 93–109):
```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```
Phase 10 does **NOT** re-create the function (already exists). It adds one new trigger only:
```sql
CREATE TRIGGER update_user_merits_updated_at
  BEFORE UPDATE ON public.user_merits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```
`merit_transactions` and `merit_shop_purchases` are append-only — no updated_at column, no trigger.

**FK + ON DELETE CASCADE pattern** (20251113100645 line 3, line 57):
```sql
id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
-- and
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
```
Phase 10 deviation: FK targets **`public.profiles(id)`** not `auth.users(id)` (per CONTEXT code_context: "every per-user table in this repo joins on profiles.id"). `resumes` table uses `auth.users` directly, but RESEARCH A1 verified `profiles.id` is the correct modern target. Cascade semantics are identical because `profiles.id` itself cascades from `auth.users`.

**No analog for:** the `DO $$ ... RAISE EXCEPTION ... $$` verification block (D-16). No existing migration contains this pattern. Planner should use the PL/pgSQL template in RESEARCH.md § "Verification block" and cite it as a new pattern that Phase 10 introduces.

**No analog for:** `INSERT ... SELECT ... ON CONFLICT DO NOTHING` backfill — no existing migration runs a cross-table backfill. Use the pattern in RESEARCH.md § "Backfill pattern" verbatim.

---

### `supabase/functions/_tests/phase-10-rls.test.ts` (or colocated equivalent)

**Primary analog:** `supabase/functions/_shared/auth.test.ts` (lines 1–38 — header + assertion style)
**Secondary analog:** `supabase/functions/stripe-webhook/index.test.ts` (lines 1–15, 72–132 — fake supabase client pattern)

**Imports pattern** (auth.test.ts lines 1–6):
```typescript
/**
 * Deno unit tests for the _shared/auth.ts module.
 * Run with: deno test supabase/functions/_shared/auth.test.ts --no-check
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireAuth, requireInternalOrUserAuth } from "./auth.ts";
```
Phase 10 test should open with the same JSDoc header (including the `deno test` run command), use the **same** `std@0.224.0/assert/mod.ts` URL (not a different version — consistency with existing tests so `run-edge-tests.ps1` continues working), and import `createClient` from `https://esm.sh/@supabase/supabase-js@2` for anon-client construction.

**Test block pattern** (auth.test.ts lines 27–38):
```typescript
Deno.test("requireAuth user: missing Authorization header throws Response(401)", async () => {
  const req = new Request("https://example.com", { method: "POST" });
  try {
    await requireAuth(req, { type: "user" });
    assert(false, "Should have thrown");
  } catch (e) {
    assert(e instanceof Response, "Should throw a Response");
    assertEquals(e.status, 401);
    const body = await e.json();
    assertEquals(body.error, "Unauthorized");
  }
});
```
Test-naming convention: `"<REQ-ID>: <behavior>"` (as used throughout stripe-webhook/index.test.ts, e.g. `"STR-03: missing stripe-signature header → 401 invalid_signature"`). Phase 10 uses MER IDs: `"MER-04: anon client INSERT into user_merits blocked by RLS"`, `"MER-04: anon client UPDATE to user_merits blocked by RLS"`, etc.

**Assertion style for expected failure** (stripe-webhook/index.test.ts lines 166–183 analog):
Phase 10 test should pattern-match on `error.code === '42501'` (Postgres `insufficient_privilege` / RLS denial) or the `error.message` containing `"row-level security"`. Unlike stripe-webhook/index.test.ts which uses a **fake** Supabase client, Phase 10's RLS test **must** hit a real Postgres (local `supabase start` or staging) because RLS cannot be faked. This is a meaningful departure and must be called out in the test's header comment.

**No analog for:** real-database integration tests with live auth JWT. All existing tests in the repo use fake supabase clients. Phase 10 introduces this pattern; planner should document the `supabase start` prerequisite in the test header.

---

### `scripts/phase-10-legacy-snapshot.ps1` (recommended — or `.sh` if user insists)

**Primary analog:** `scripts/run-edge-tests.ps1` (entire file, 28 lines)
**Secondary analog:** `scripts/deploy-staging.ps1` (lines 1–46)

**Header + param + error-action pattern** (run-edge-tests.ps1 lines 1–10):
```powershell
<#
.SYNOPSIS
  Run Deno unit tests for Supabase Edge Function shared utilities.
  Requires Deno: https://deno.land/manual/getting_started/installation

.EXAMPLE
  .\scripts\run-edge-tests.ps1
#>

$ErrorActionPreference = "Stop"
```
Phase 10 script uses the same comment-based synopsis and `$ErrorActionPreference = "Stop"`.

**Repo-root resolution pattern** (deploy-staging.ps1 lines 33–34):
```powershell
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot
```
Copy this for any script needing to operate from the repo root.

**`param()` block pattern** (deploy-staging.ps1 lines 1–29):
```powershell
param(
  [string[]]$Functions = @(
    "chat-agent"
    ...
  )
)
```
Phase 10 snapshot script should parameterize the DB connection string, e.g.:
```powershell
param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [string]$OutputFile = "legacy-snapshot.txt"
)
```

**No analog for:** row-level md5 hashing via `psql`. Planner must compose this from scratch — use `psql "$DatabaseUrl" -Atc "SELECT md5(string_agg(...)) FROM usage_tracking"` and redirect output to `$OutputFile`. The script's job is: (1) query md5 of each legacy table, (2) write to snapshot file, (3) exit with the file path so the caller can diff pre/post.

## Shared Patterns

### Additive-only migration discipline
**Source:** CLAUDE.md + `supabase/migrations/20260412000000_stripe_migration.sql` (uses only `CREATE ... IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
**Apply to:** The migration file exclusively
**Rule:** Zero `DROP`, zero `RENAME`, zero writes to legacy tables (`usage_tracking`, `credit_usage`, `ai_usage`). Grep the final file to confirm zero hits on those identifiers (Pitfall 6).

### `SECURITY DEFINER SET search_path = public`
**Source:** `supabase/migrations/20251113100645_...sql` line 34
**Apply to:** `auto_provision_user_merits` function in the migration
**Rule:** Always pair `SECURITY DEFINER` with `SET search_path = public` to mitigate search_path injection (ASVS V4). Every trigger function in the repo follows this; do not deviate.

### Test file naming + runner registration
**Source:** `scripts/run-edge-tests.ps1` lines 18–26
**Apply to:** The new Deno RLS test
**Rule:** If the new test is intended to run in CI, it must be added to the explicit file list in `run-edge-tests.ps1`. The runner does not glob. Planner must include a step: "update `scripts/run-edge-tests.ps1` to append the new test path."

### `std@0.224.0/assert/mod.ts` version pinning
**Source:** Every `.test.ts` in the repo uses this exact URL (auth.test.ts line 5, stripe-webhook/index.test.ts line 12)
**Apply to:** The new RLS test imports
**Rule:** Do not use a newer `std` version. Consistency enables the runner script to work without per-file version shims.

## No Analog Found

| Pattern | Reason | Fallback |
|---------|--------|----------|
| Migration-embedded `DO $$ ... RAISE EXCEPTION ... $$` verification block | No existing migration in the repo contains deploy-time ASSERT / verification | Use the PL/pgSQL snippet in RESEARCH.md § "Verification block" verbatim |
| Cross-table backfill with `INSERT ... SELECT ... ON CONFLICT DO NOTHING` | No existing migration backfills data from one table into a new one | Use the snippet in RESEARCH.md § "Backfill pattern" verbatim |
| Deno test that asserts RLS denial against a real Postgres | All existing tests use fake supabase clients; none hit a live DB | Frame as integration test; document `supabase start` prerequisite in the test header; adapt the auth.test.ts try/catch+assertEquals shape for expected error codes |
| `scripts/*.sh` | Repo has zero `.sh` files; convention is PowerShell `.ps1` | Planner should default to `.ps1`. If user explicitly wants `.sh`, create it with a short justification comment noting the convention break. |
| `supabase/functions/_tests/` directory | Does not exist; tests are colocated next to source | Either colocate (`_shared/merit-rls.test.ts`) or establish the new directory with a README explaining why (test is not tied to one function) |

## Metadata

**Analog search scope:**
- `supabase/migrations/**/*.sql` (all 3 migrations identified; Phase 07 Stripe is primary template)
- `supabase/functions/**/*.test.ts` (18 test files; auth.test.ts and stripe-webhook/index.test.ts are closest analogs)
- `scripts/*` (4 files, all PowerShell or Node ESM)

**Files scanned:** 25

**Pattern extraction date:** 2026-04-14

---

## PATTERN MAPPING COMPLETE

**Phase:** 10 - merit-ledger-foundation
**Files classified:** 3
**Analogs found:** 3 / 3

### Coverage
- Files with exact analog: 1 (migration — two Phase 07 + original profiles migrations combine into a near-verbatim template)
- Files with role-match analog: 2 (Deno test — framework match, integration-DB twist; script — role match, wrong shell)
- Files with no analog: 0 (but 5 sub-patterns have no analog and require fresh composition; see "No Analog Found")

### Key Patterns Identified
- Additive-only DDL with `IF NOT EXISTS`, `text`/`jsonb`/`timestamptz`, inline CHECK constraints, and anti-SEC-06 header comment — exactly mirrors `20260412000000_stripe_migration.sql`
- `SECURITY DEFINER SET search_path = public` trigger function pattern copied from `handle_new_user`, rebound to `public.profiles` (not `auth.users`) per D-05
- Deno test convention: `std@0.224.0/assert/mod.ts`, `"<REQ-ID>: <behavior>"` test names, try/catch with `assertEquals(e.status, ...)` — from `auth.test.ts` and `stripe-webhook/index.test.ts`
- Repo scripts are PowerShell (`.ps1`), not bash — CONTEXT's `.sh` filename should be reconsidered by the planner

### Divergences the planner must resolve
1. `.sh` vs `.ps1` for the legacy snapshot script (recommend `.ps1`)
2. `_tests/` directory vs colocated test (recommend new `_tests/` directory with justification)
3. Two patterns (verification block, cross-table backfill) are novel to this phase and must be composed from RESEARCH.md snippets, not copied from any existing file

### File Created
`.planning/phases/10-merit-ledger-foundation/10-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
