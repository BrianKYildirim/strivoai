---
phase: quick-260719-plu
plan: 01
subsystem: user-deletion-lifecycle
tags: [supabase, migrations, cascade-fk, storage-trigger, edge-function, gdpr, deletion]
requires:
  - auth.users (Supabase Auth)
  - storage.objects (buckets: resumes, ai-archives)
provides:
  - ON DELETE CASCADE user_id FKs on all user-owned public tables
  - SECURITY DEFINER BEFORE DELETE trigger on auth.users purging Storage metadata
  - single converged admin-delete-user deletion flow
affects:
  - supabase/functions/admin-delete-user/index.ts
  - direct Supabase-Auth-dashboard user deletion (now complete)
tech-stack:
  added: []
  patterns: [idempotent-DO-loop-migration, dynamic-FK-rediscovery, security-definer-storage-trigger, pin-search-path]
key-files:
  created:
    - supabase/migrations/20260719120000_user_deletion_cascade_fks.sql
    - supabase/migrations/rollback/20260719120000_user_deletion_cascade_fks.rollback.sql
    - supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql
    - supabase/migrations/rollback/20260719120001_auth_user_delete_cleanup_trigger.rollback.sql
  modified:
    - supabase/functions/admin-delete-user/index.ts
decisions:
  - Dynamic FK re-discovery (drop ANY existing user_id->auth.users FK by introspection, then re-add canonical cascade) instead of hardcoding constraint names — safe when live names differ from static assumptions.
  - Storage trigger is BEFORE DELETE so object rows go before the auth row (avoids storage.objects.owner FK ordering block); scoped by owner OR folder path, never email.
  - admin-delete-user keeps ONLY a best-effort physical byte sweep; DB cascade + trigger own correctness for BOTH deletion paths.
status: complete
metrics:
  duration: ~45min (authoring + preview apply + two-path E2E proof)
  completed: 2026-07-19
---

# Quick Task 260719-plu: User-Deletion Lifecycle — Cascade FKs + Storage Trigger Summary

Convergence of Strivo user deletion onto DB-level truth: ON DELETE CASCADE FKs on every
user-owned table plus a SECURITY DEFINER `auth.users` BEFORE DELETE trigger that purges
Storage metadata, so deleting a user from EITHER the admin panel OR the Supabase Auth
dashboard performs one identical, complete cleanup — and the admin edge function is reduced
to validate → best-effort byte reclaim → `auth.admin.deleteUser`.

## What shipped (code — done, committed)

- **`20260719120000_user_deletion_cascade_fks.sql`** (+ rollback) — idempotent DO-loop over
  the 7 statically-identified gap tables (`linkedin_grades`, `scheduled_emails`,
  `user_achievements`, `upgrade_requests`, `analysis_jobs`, `resume_score_history`,
  `improvement_checklist`). Per table: table/column guards → purge **only** already-orphaned
  rows (non-null `user_id` with no `auth.users` match; NULLs left alone) → drop **any**
  existing single-column `user_id → auth.users` FK (any name/deltype, incl. its own canonical
  one on re-run) → add `<t>_user_id_fkey … ON DELETE CASCADE` → assert `confdeltype='c'`.
  Re-runnable; scoped strictly by id, never email.
- **`20260719120001_auth_user_delete_cleanup_trigger.sql`** (+ rollback) — `SECURITY DEFINER`
  `public.handle_auth_user_deleted()` with `search_path=''` (fully-qualified) that runs
  `DELETE FROM storage.objects WHERE bucket_id IN ('resumes','ai-archives') AND (owner = OLD.id
  OR (storage.foldername(name))[1] = OLD.id::text)`, plus a `BEFORE DELETE ON auth.users FOR
  EACH ROW` trigger `on_auth_user_deleted`. `GET DIAGNOSTICS` count for observability;
  end-of-migration asserts `prosecdef=true` and the trigger exists. No RLS altered.
- **`admin-delete-user/index.ts`** — removed the hand-maintained per-table `.delete()` block
  and the `resumes`/`profiles` row deletes. Kept: auth+admin validation, self-delete guard,
  a best-effort physical Storage byte sweep (resumes by `{uid}/` path + paginated ai-archives
  list/remove, both log-and-continue), then `auth.admin.deleteUser` — the single convergence
  point that fires the cascade + trigger. CORS/`withCors`, logging prefixes, error contracts
  and the `{ ok: true }` response shape preserved. Frontend `AdminUsage.tsx` call site
  unchanged.

## Deviations from Plan

One real defect found and fixed during the preview E2E (commit `ee2794c1`): current Supabase
Storage installs a `protect_objects_delete` trigger on `storage.objects` that rejects direct
SQL DELETEs with SQLSTATE 42501 unless the transaction-local GUC
`storage.allow_delete_query` is `'true'` (the same switch the Storage API uses). The original
trigger therefore **aborted every auth.users delete** — both paths 500'd
("Database error deleting user" in auth logs). `handle_auth_user_deleted()` now sets the GUC
transaction-locally immediately before its DELETE and resets it right after. Migration
`20260719120001` was amended in place (it had not reached production) and re-applied to
preview via `migration repair --status reverted` + `db push`.

Also: preview migration history had drift (remote-only `20260719084502` duplicating local
`20260719000000` from an earlier MCP apply) — repaired with
`migration repair --status reverted 20260719084502` + `--status applied 20260719000000`
(bookkeeping only, no schema change).

## Verification — PREVIEW apply + two-path E2E proof (DONE, PASS)

Static checks: `deno check` on admin-delete-user exit 0; `npm run type-check` clean; zero
per-table deletes / zero email-based deletion in the edge fn; all 4 migration/rollback files
present.

**Live FK audit (preview, pre-apply):** confirmed exactly the 7 static gap tables; the 4
suspected extras (`analysis_cache`, `merit_shop_purchases`, `merit_transactions`,
`user_merits`) all cascade via `profiles` (`profiles.id → auth.users ON DELETE CASCADE`), so
the migration list was correct as-authored.

**Preview apply:** both migrations applied via `supabase db push` — cascade migration purged
243 orphaned `scheduled_emails` + 25 orphaned `analysis_jobs` rows and asserted
`confdeltype='c'` on all 7 tables; post-apply audit shows **0** non-cascading user-owned
tables. Trigger + `prosecdef=true` asserted in-migration. `admin-delete-user` deployed to
preview via `supabase functions deploy`.

**E2E deletion proof (scripted, service-role, preview):** seeded 3 users (victimA, victimB,
control) each with 12 rows across the gap + cascading tables plus `resumes` and `ai-archives`
Storage uploads (19 residue checks per user: 15 tables + profiles + 2 Storage prefixes +
auth.users). Results:
- **RUN A (admin path):** real admin JWT → `admin-delete-user` → HTTP 200 `{ok:true}` →
  **zero residue** across all 19 checks.
- **RUN B (Auth-dashboard-equivalent):** direct GoTrue admin DELETE (no edge fn) →
  **zero residue** across all 19 checks.
- **Requirement 6:** control user's 16 rows/files byte-identical before/after both runs.
- **Same-email recreate:** new distinct uuid; only bootstrap rows (profile + welcome merits
  from `on_auth_user_created`); old uuid has zero residue. No errors or delays.
- Cleanup deletions (3 more users incl. one with `user_roles.admin`) → zero residue each.

## AWAITING OPERATOR — PRODUCTION apply

Preview has fully passed; production still runs the old code. Apply in this order:
1. `20260719120000_user_deletion_cascade_fks.sql` (purges prod orphans — irreversible)
2. `20260719120001_auth_user_delete_cleanup_trigger.sql` (must be the amended version with
   the `storage.allow_delete_query` GUC — the pre-fix version breaks all user deletion)
3. deploy `admin-delete-user`

Rollbacks (reverse order) live at `supabase/migrations/rollback/`.

## Self-Check: PASSED
- FOUND: supabase/migrations/20260719120000_user_deletion_cascade_fks.sql
- FOUND: supabase/migrations/rollback/20260719120000_user_deletion_cascade_fks.rollback.sql
- FOUND: supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql
- FOUND: supabase/migrations/rollback/20260719120001_auth_user_delete_cleanup_trigger.rollback.sql
- FOUND commit 81fa201f (Task 1), bfde2e41 (Task 2)
- admin-delete-user: deno check exit 0; no per-table deletes; no email deletion
