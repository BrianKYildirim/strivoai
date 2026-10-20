---
phase: quick-260719-plu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260719120000_user_deletion_cascade_fks.sql
  - supabase/migrations/rollback/20260719120000_user_deletion_cascade_fks.rollback.sql
  - supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql
  - supabase/migrations/rollback/20260719120001_auth_user_delete_cleanup_trigger.rollback.sql
  - supabase/functions/admin-delete-user/index.ts
autonomous: false
gap_closure: false

must_haves:
  truths:
    - "Deleting a user via the admin panel permanently removes every user-owned DB row and Storage file"
    - "Deleting a user directly from the Supabase Auth dashboard performs the identical complete cleanup"
    - "No other user's data is affected by a deletion"
    - "Re-creating an account with the same email behaves as a brand-new user with no inherited data or errors"
  artifacts:
    - path: "supabase/migrations/20260719120000_user_deletion_cascade_fks.sql"
      provides: "ON DELETE CASCADE FKs to auth.users on every user-owned table that lacks one"
      contains: "ON DELETE CASCADE"
    - path: "supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql"
      provides: "SECURITY DEFINER BEFORE DELETE trigger on auth.users that purges Storage objects for the user's folders"
      contains: "BEFORE DELETE ON auth.users"
    - path: "supabase/functions/admin-delete-user/index.ts"
      provides: "Single converged deletion flow (admin auth -> auth.admin.deleteUser) relying on DB cascade + trigger"
  key_links:
    - from: "auth.users DELETE"
      to: "all user-owned public tables"
      via: "ON DELETE CASCADE foreign keys"
      pattern: "REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE"
    - from: "auth.users DELETE"
      to: "storage.objects (resumes + ai-archives buckets)"
      via: "SECURITY DEFINER BEFORE DELETE trigger"
      pattern: "on_auth_user_deleted"
    - from: "src/pages/AdminUsage.tsx"
      to: "admin-delete-user edge function"
      via: "supabase.functions.invoke('admin-delete-user')"
      pattern: "admin-delete-user"
---

<objective>
Fix Strivo's user-deletion lifecycle so deleting a user from EITHER the Strivo admin panel OR the Supabase Auth dashboard permanently and completely removes every connected DB record and every uploaded Storage file, affects no other user, and leaves the email fully reusable as a fresh account.

Purpose: Today deletion is a fragile, hand-maintained list of `.delete()` calls in one edge function. Several user-owned tables have NO cascade FK to `auth.users` (`linkedin_grades`, `scheduled_emails`, `user_achievements`, `upgrade_requests`, `analysis_jobs`, `resume_score_history`, `improvement_checklist`), so a direct Auth-dashboard delete orphans those rows, and the admin path can drift from reality. This makes account deletion the single source of truth via DB cascade + a trigger.

Output: Two idempotent migrations (+ rollback SQL) making all user-owned FKs cascade and adding a SECURITY DEFINER Storage-cleanup trigger on `auth.users`; a simplified single-flow `admin-delete-user` edge function; and full end-to-end verification on PREVIEW.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Current deletion logic (the thing being converged)
@supabase/functions/admin-delete-user/index.ts

# Reference patterns for cascade-FK migrations + rollback + orphan purge
@supabase/migrations/20260717010000_analysis_results_user_fk_cascade.sql

# Existing auth.users trigger precedent (AFTER INSERT) — mirror the pattern for delete
@supabase/migrations/20251113100645_eb5d1704-66ae-4c1a-ad99-05bf7363585f.sql
</context>

<constraints>
- PRODUCTION IS OFF-LIMITS for writes. Per CLAUDE.md, Claude MUST NOT apply destructive SQL, alter RLS, or deploy edge functions to production. Apply and test EVERYTHING on the PREVIEW Supabase project (supabasepreview MCP tools). The migration files ARE the production-ready artifacts — the operator applies them to prod after approval.
- Every migration MUST have a matching rollback file under supabase/migrations/rollback/.
- The `auth.users` trigger MUST be SECURITY DEFINER (owned by the migration runner) so it can delete from `storage.objects`.
- Deletion must be scoped strictly by user id / user folder path — NEVER by email. No `WHERE ... = OLD.email`.
- Preview runs AI_TEST_MODE fixtures with the merit system OFF; that is fine for deletion testing (we are verifying row/file removal, not AI content).
- Do NOT commit anything under .planning/ or modify .gitignore.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Audit user-owned FKs on PREVIEW and author the cascade-FK migration</name>
  <files>supabase/migrations/20260719120000_user_deletion_cascade_fks.sql, supabase/migrations/rollback/20260719120000_user_deletion_cascade_fks.rollback.sql</files>
  <action>
    Establish the AUTHORITATIVE gap list from the live PREVIEW schema (grep of migrations is a starting hypothesis, not the truth — cumulative ALTERs can change it). Using the supabasepreview MCP `execute_sql`, run a read-only query against `pg_constraint` / `information_schema` to list, for every table in `public` that has a `user_id` (or `id` that is the user PK, e.g. `profiles`) column:
      - the FK constraint (if any) whose referenced table is `auth.users` (directly) or `public.profiles` (indirect chain), and
      - its `confdeltype` (`c` = CASCADE, `a` = NO ACTION, `n` = SET NULL, or NO FK at all).
    Produce the definitive list of tables that are NOT already covered by an `ON DELETE CASCADE` chain to `auth.users`.

    Expected gaps to confirm/close (from static analysis — verify each against the query, add any the query reveals, drop any the query shows already cascading):
      - `linkedin_grades` (user_id has a plain FK to auth.users WITHOUT cascade — must DROP + re-add with CASCADE)
      - `scheduled_emails` (user_id, no FK)
      - `user_achievements` (user_id, no FK)
      - `upgrade_requests` (user_id, no FK)
      - `analysis_jobs` (user_id, no FK — covers pending/failed/cached job rows)
      - `resume_score_history` (user_id, no FK)
      - `improvement_checklist` (user_id, no FK — currently only indirect via resume_id)
    Tables already confirmed cascading (do NOT touch): profiles, resumes, analysis_results, usage_tracking, user_roles, career_targets, applications, outcomes, job_descriptions, resume_versions, resume_sections, resume_bullets, linkedin_versions, scores, interview_quizzes, interview_quiz_answers, interview_streaks, recommendations, user_edits, feature_usage, analysis_cache, merit_transactions, merit_shop_purchases, user_merits, saved_jobs (verify it still exists on preview — the query decides).

    Write `supabase/migrations/20260719120000_user_deletion_cascade_fks.sql` following the exact pattern of `20260717010000_analysis_results_user_fk_cascade.sql`. For EACH gap table, in an idempotent block:
      1. Guard with `IF EXISTS` on the table (some tables may not exist on every environment).
      2. Purge existing ORPHAN rows only: `DELETE FROM public.<t> t WHERE t.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id);` — this is scoped strictly to already-orphaned rows so NO live user's data is touched (requirement 6). For `linkedin_grades` note user_id is NULLABLE; leave genuinely-null rows alone or delete them per the query findings, but never delete rows whose user_id maps to a live auth.users row.
      3. `ALTER TABLE ... DROP CONSTRAINT IF EXISTS <existing_fk_name>;` (needed for linkedin_grades' non-cascade FK).
      4. `ALTER TABLE public.<t> ADD CONSTRAINT <t>_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;` (use `NOT VALID` + `VALIDATE CONSTRAINT` only if needed for lock safety; on preview a plain add is fine).
      5. End with a `RAISE NOTICE` confirming the constraint is active (mirror the reference migration).
    The migration must be RE-RUNNABLE (all guards `IF EXISTS` / `IF NOT EXISTS` / drop-before-add).

    Write the rollback at `supabase/migrations/rollback/20260719120000_user_deletion_cascade_fks.rollback.sql`: for each table, `DROP CONSTRAINT IF EXISTS <t>_user_id_fkey;` and (for linkedin_grades) re-add the original non-cascade FK. Include a header comment noting that purged orphan rows cannot be restored (same caveat the reference rollback documents).

    Apply the forward migration to PREVIEW via supabasepreview MCP `apply_migration`. Do NOT touch production.
  </action>
  <verify>
    On PREVIEW via supabasepreview MCP `execute_sql`: re-run the FK audit query and confirm EVERY user-owned table now shows `confdeltype = 'c'` (CASCADE) on its auth.users chain, with ZERO gap tables remaining. Confirm `supabase/functions/deno.json`-registered tests and `npm run type-check` are unaffected (SQL-only change). Confirm both migration + rollback files exist.
  </verify>
  <done>
    Preview FK audit returns 0 user-owned tables lacking an ON DELETE CASCADE chain to auth.users; forward migration applied clean and is idempotent on re-run; rollback file present and mirrors the forward changes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add auth.users Storage-cleanup trigger and converge admin-delete-user onto the single flow</name>
  <files>supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql, supabase/migrations/rollback/20260719120001_auth_user_delete_cleanup_trigger.rollback.sql, supabase/functions/admin-delete-user/index.ts</files>
  <action>
    STORAGE CLEANUP TRIGGER (makes direct Supabase-Auth-dashboard deletion complete):
    Write `supabase/migrations/20260719120001_auth_user_delete_cleanup_trigger.sql` creating a `SECURITY DEFINER` function `public.handle_auth_user_deleted()` and a `BEFORE DELETE ON auth.users FOR EACH ROW` trigger `on_auth_user_deleted` (mirror the existing `on_auth_user_created` AFTER INSERT precedent in 20251113100645). BEFORE DELETE (not AFTER) so Storage rows are gone before the auth row, avoiding any `storage.objects.owner` FK block.
    The function body deletes Storage metadata rows scoped strictly by user id / folder — NEVER by email:
      `DELETE FROM storage.objects WHERE bucket_id IN ('resumes','ai-archives') AND ( owner = OLD.id OR (storage.foldername(name))[1] = OLD.id::text );`
    (Both predicates because legacy `resumes` uploads are keyed under `{user_id}/...` folders and `ai-archives` under `{user_id}/{table}/...`; `owner` covers rows where it was set.) Set `search_path = ''` / fully-qualify, per the repo's pin-search-path convention. Add a `RAISE NOTICE`/`GET DIAGNOSTICS` count for observability. Note in a comment that physical object bytes may remain orphaned (acceptable per Supabase cascade-cleanup norm — the metadata row removal is what makes the object unlisted/unreachable); the admin edge path additionally reclaims bytes via the Storage API.
    Grant/ownership: the function is owned by the migration runner (postgres) so it can write `storage.objects`. Do NOT alter any RLS policy.
    Rollback `supabase/migrations/rollback/20260719120001_auth_user_delete_cleanup_trigger.rollback.sql`: `DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;` then `DROP FUNCTION IF EXISTS public.handle_auth_user_deleted();`.
    Apply the forward migration to PREVIEW via supabasepreview MCP. Do NOT touch production.

    CONVERGE admin-delete-user ONTO THE SINGLE FLOW (requirement 4):
    Refactor `supabase/functions/admin-delete-user/index.ts` so it NO LONGER maintains a hand-written list of per-table `.delete()` calls (lines ~69-99). The DB cascade FKs (Task 1) now remove all rows and the trigger removes Storage metadata for BOTH deletion paths. Keep exactly:
      1. Auth + admin-role validation (unchanged, lines ~16-66).
      2. Self-delete guard (unchanged).
      3. A single best-effort physical Storage sweep via the Storage API to reclaim bytes (retain the existing `resumes` file removal by `{user_id}/` path and the paginated `ai-archives` `list`+`remove` loop, lines ~79-133) — this is the ONLY app-side data step and it is byte-reclamation only, not correctness-critical, so it stays log-and-continue.
      4. `await supabase.auth.admin.deleteUser(targetUserId)` — which fires the same trigger + cascade the Auth-dashboard path uses. This is the convergence point: both paths ultimately delete `auth.users`, so they share one cleanup mechanism.
    Remove the now-redundant per-table `.delete()` block and `resumes`/`profiles` row deletes (cascade handles them). Preserve CORS (`withCors`), error contracts, logging prefixes, and response shapes byte-for-byte. Do NOT change the frontend (`src/pages/AdminUsage.tsx` call site stays identical).
  </action>
  <verify>
    Preview SQL check (supabasepreview MCP `execute_sql`): `SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_deleted';` returns the trigger; `SELECT prosecdef FROM pg_proc WHERE proname='handle_auth_user_deleted';` returns `t` (SECURITY DEFINER). `npm run type-check` passes for the edge function change. Deploy admin-delete-user to PREVIEW only (supabasepreview MCP `deploy_edge_function`) and confirm it boots (no SyntaxError) via a trivial invoke returning 401/403 without a valid admin token. Grep the edge function to confirm NO `.from('<table>').delete()` per-table block and NO email-based deletion remain.
  </verify>
  <done>
    on_auth_user_deleted BEFORE DELETE trigger + SECURITY DEFINER function exist on preview; rollback file present; admin-delete-user reduced to validate -> best-effort Storage byte sweep -> auth.admin.deleteUser (single converged flow), boots on preview, frontend untouched.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Complete user-deletion lifecycle on PREVIEW: cascade FKs on all user-owned tables (Task 1), a SECURITY DEFINER Storage-cleanup trigger on auth.users (Task 2), and a single converged admin-delete-user flow. Production-ready migration + rollback SQL are authored and applied to preview only — awaiting your approval to apply to production.
  </what-built>
  <how-to-verify>
    Run the requirement-7 end-to-end proof on the PREVIEW environment (Claude drives the SQL/MCP steps; you confirm the outcome). Do it TWICE — once for each deletion path.

    SETUP (per run): Create a test user on preview (Auth dashboard or signup). Sign in, upload a resume (populates `resumes` + a `resumes/{uid}/...` Storage object), and run at least one analysis (Resume + LinkedIn Grader, using preview AI_TEST_MODE fixtures) so rows land in `analysis_results`, `analysis_jobs`, `linkedin_grades`, `usage_tracking`, `improvement_checklist`, `resume_score_history`, `scheduled_emails`, etc. Record the user's uuid.

    Before deletion, capture a residue baseline via supabasepreview MCP `execute_sql`: for the captured uuid, `SELECT count(*)` across every user-owned table AND `SELECT count(*) FROM storage.objects WHERE (storage.foldername(name))[1] = '<uuid>' OR owner = '<uuid>'`. Expect non-zero.

    RUN A — Admin panel path: delete the user through the Strivo admin UI (AdminUsage page). 
    RUN B — Auth-dashboard path: for a second identical test user, delete directly from the Supabase Auth dashboard (this exercises the trigger + cascade WITHOUT the edge function).

    After EACH deletion, re-run the residue query. PASS = every per-table count is 0 AND the storage.objects count is 0. Then delete a DIFFERENT untouched control user's baseline check to confirm THAT user's rows/files are still intact (requirement 6 — no collateral).

    Finally, RE-CREATE an account with the SAME email as a deleted user. Sign in and confirm it behaves as a brand-new user: empty dashboard, no inherited analyses/resumes/scores, no errors or loading hangs.
  </how-to-verify>
  <resume-signal>
    Type "approved" if both paths leave zero residue, no other user is affected, and the recreated same-email account is clean — and to authorize the operator to apply BOTH migrations (20260719120000 + 20260719120001) and deploy admin-delete-user to PRODUCTION. Otherwise describe which table/bucket still had residue or which path failed.
  </resume-signal>
</task>

</tasks>

<verification>
- Preview FK audit query returns 0 user-owned tables without an ON DELETE CASCADE chain to auth.users.
- `on_auth_user_deleted` BEFORE DELETE trigger exists and its function is SECURITY DEFINER.
- Both deletion paths (admin panel + Auth dashboard) leave zero DB rows and zero Storage objects for the deleted uuid.
- A control user's data is untouched after another user's deletion.
- Same-email re-registration yields a clean new account with no inherited data or errors.
- Both migrations have matching rollback files; all changes applied to PREVIEW only; prod-ready SQL handed to operator for approval.
</verification>

<success_criteria>
- Deleting a user via EITHER path permanently removes every connected record and uploaded file (requirements 1, 2, 3, 5).
- Admin panel and direct-Auth deletion share ONE cleanup mechanism (auth.users delete -> cascade FKs + trigger), no separate hand-maintained logic (requirement 4).
- No other user's data is affected (requirement 6).
- Recreating an account with a deleted user's email behaves as a completely new user (requirement 7).
- Every migration is idempotent, scoped by user id/folder (never email), and ships with rollback SQL; nothing applied to production without operator approval.
</success_criteria>

<output>
After completion, create `.planning/quick/260719-plu-fix-user-deletion-lifecycle-cascade-fks-/260719-plu-SUMMARY.md` documenting: the authoritative preview FK gap list that was closed, the trigger design, the admin-delete-user convergence, both deletion-path verification results, and the exact production apply order (migration 20260719120000 -> 20260719120001 -> deploy admin-delete-user) for operator sign-off.
</output>
