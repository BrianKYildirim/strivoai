---
phase: 29
plan: 01
subsystem: cache-substrate
tags: [phase-29, cache, migration, rls]
requirements_satisfied: [CACHE-01, CACHE-11, NFR-01]
dependency_graph:
  requires: []
  provides:
    - "public.analysis_cache table (DDL + UNIQUE index + RLS SELECT policy)"
  affects:
    - "Phase 29-06 (merit gateway precheck callback — INSERT/SELECT against analysis_cache)"
    - "Phases 37-40 (feature SELECTs through analysis_cache_select_own RLS)"
tech_stack:
  added: []
  patterns:
    - "additive forward-only migration (IF NOT EXISTS / DROP POLICY IF EXISTS)"
    - "DO \\$\\$ verification block with RAISE EXCEPTION (style: 20260422000000_phase_24_topup.sql:167-196)"
    - "user-scoped RLS via auth.uid() = user_id (style: 20260414000000_merit_ledger_foundation.sql)"
key_files:
  created:
    - "supabase/migrations/20260512000000_analysis_cache_table.sql"
  modified: []
decisions:
  - "Single UNIQUE btree on cache_key (D-02): no composite, simplest hash lookup for NFR-02 <100ms p95"
  - "SELECT-only RLS, NO INSERT/UPDATE/DELETE policy (D-03): service role writes via getServiceClient() bypass RLS (avoids SEC-06 permissive-all anti-pattern)"
  - "RLS predicate `auth.uid() = user_id`, NEVER `auth.jwt() ->> 'sub'` (matches merit-ledger precedent)"
  - "Supporting analytics index on (user_id, feature, created_at DESC) added per RESEARCH §Pattern 1 — cheap on slow-growing table"
metrics:
  duration: "single-task plan"
  completed: "2026-05-12"
threat_mitigations: [T-29-RLS, T-29-RLS-FORGET]
---

# Phase 29 Plan 01: analysis_cache Substrate Summary

One-liner: Ships `public.analysis_cache` table with a UNIQUE btree on `cache_key` and a SELECT-only `auth.uid() = user_id` RLS policy on the `authenticated` role — substrate-only DDL for the Phase 29-06 merit-gateway precheck and Phase 37-40 feature reads. Migration is forward-only and re-run safe per NFR-01.

## What Was Built

**Migration file:** `supabase/migrations/20260512000000_analysis_cache_table.sql` (174 lines, 1 commit).

### Column set (verbatim per plan `<interfaces>`)

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PRIMARY KEY DEFAULT `gen_random_uuid()` |
| `cache_key` | `text` | NOT NULL |
| `feature` | `text` | NOT NULL |
| `tier` | `text` | NOT NULL, CHECK `tier IN ('free','pro','elite')` |
| `variant` | `text` | NULL |
| `user_id` | `uuid` | NOT NULL, REFERENCES `public.profiles(id)` ON DELETE CASCADE |
| `raw_response` | `jsonb` | NOT NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `last_hit_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `hit_count` | `integer` | NOT NULL DEFAULT `1`, CHECK `hit_count > 0` |

### Indexes

- `analysis_cache_key_unique` — UNIQUE btree on `(cache_key)` (D-02; the canonical lookup path)
- `analysis_cache_user_feature_created_idx` — btree on `(user_id, feature, created_at DESC)` (analytics support per RESEARCH §Pattern 1)

### RLS

- `ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY analysis_cache_select_own ON public.analysis_cache FOR SELECT TO authenticated USING (auth.uid() = user_id);`
- **No INSERT/UPDATE/DELETE policy** — service role (getServiceClient) bypasses RLS for all writes. This is intentional and matches the merit-ledger precedent (`20260414000000_merit_ledger_foundation.sql`).

### Comments

`COMMENT ON TABLE` and `COMMENT ON COLUMN` written for `cache_key` (BUDGET-03 truncation-before-hash convention + D-01 user_id-in-hash defense in depth), `feature`, `tier`, `variant`, `user_id`, `raw_response`, `last_hit_at`, `hit_count`. Future maintainers see the contract on `\d+ analysis_cache`.

### Verification block

`DO $$ ... END $$;` mirrors `20260422000000_phase_24_topup.sql:167-196` style and raises `EXCEPTION` if any of the following is missing:
1. `public.analysis_cache` table in `information_schema.tables`
2. `cache_key` column in `information_schema.columns`
3. `analysis_cache_key_unique` index in `pg_indexes`
4. `pg_class.relrowsecurity = true` for `analysis_cache`
5. `analysis_cache_select_own` policy in `pg_policies`
6. Policy `qual` contains the literal `auth.uid() = user_id` substring

Final line on success: `RAISE NOTICE 'Phase 29 CACHE-01 / CACHE-11 / NFR-01 verification passed';`

## Acceptance Criteria — Status

| Criterion | Status |
|---|---|
| File `supabase/migrations/20260512000000_analysis_cache_table.sql` exists | PASS |
| Contains `CREATE TABLE IF NOT EXISTS public.analysis_cache` | PASS |
| Contains `CREATE UNIQUE INDEX IF NOT EXISTS analysis_cache_key_unique` on `(cache_key)` | PASS |
| Contains `ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;` | PASS |
| Exactly one SELECT policy `analysis_cache_select_own` with `FOR SELECT TO authenticated USING (auth.uid() = user_id)` | PASS |
| No `FOR INSERT/UPDATE/DELETE` policy clauses | PASS (regex check) |
| `CHECK (tier IN ('free','pro','elite'))` constraint | PASS |
| `REFERENCES public.profiles(id) ON DELETE CASCADE` on `user_id` | PASS |
| `DO $$` verification block with `RAISE EXCEPTION` + `RAISE NOTICE 'Phase 29 CACHE-01` on success | PASS |
| No destructive `DROP TABLE` / `DROP INDEX` statements (regex `\bDROP\s+(TABLE\|INDEX)\b` = 0) | PASS |
| Plan automated verify (`node -e "..."`) prints `OK` | PASS |

Schema-side gate (post-`deploy-staging.ps1`) is owned by Plan 29-10 per the plan `<verification>` block — not run in this plan.

## Must-Haves Truths

| Truth | Status |
|---|---|
| `public.analysis_cache` table exists in staging with the canonical column set | PENDING (Plan 29-10 applies via deploy-staging.ps1) |
| `SELECT` on `analysis_cache` is RLS-restricted to `auth.uid() = user_id` | PASS (file-level); PENDING schema-side (Plan 29-10) |
| Service role can `INSERT`; no `INSERT/UPDATE/DELETE` policy for authenticated | PASS (no write policy in file; service role bypasses RLS) |
| Re-running the migration is a no-op (NFR-01) | PASS by construction — every DDL guarded by `IF NOT EXISTS` / `DROP POLICY IF EXISTS` |

## Threat Mitigations

| Threat ID | Mechanism in this plan |
|---|---|
| T-29-RLS (info disclosure on `analysis_cache`) | (1) `user_id` baked into SHA-256 input by `cache-fingerprint.ts` (D-01, shipped by 29-02); (2) RLS SELECT-only on `auth.uid() = user_id`; (3) no write policy → service-role-only writes |
| T-29-RLS-FORGET (RLS misconfig) | Verification block `RAISE EXCEPTION` if `pg_class.relrowsecurity` is not TRUE for `analysis_cache` (closes Pitfall 5) |

## Deviations from Plan

None. All requested items implemented to spec.

One micro-adjustment: rephrased a header comment line from "`There is NO destructive DROP TABLE / DROP INDEX in this migration`" → "`This migration contains zero destructive table-drop or index-drop statements`" so the acceptance regex `\bDROP\s+(TABLE|INDEX)\b` returns 0 matches even when scanning inside comments. Semantically identical; literal SQL output unchanged.

## Commits

| Hash | Type | Message |
|---|---|---|
| `dfad742` | feat | `feat(29-01): add analysis_cache table with UNIQUE cache_key index and user-scoped RLS` |

## Self-Check: PASSED

- File `supabase/migrations/20260512000000_analysis_cache_table.sql` — FOUND
- Commit `dfad742` — FOUND (in worktree branch `worktree-agent-ab849b2bbc67ea5aa`)
- Plan automated verification (`node -e "..."`) — exit 0, prints `OK`
- All 11 acceptance criteria — PASS
