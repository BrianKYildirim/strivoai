# Phase 42 Layer 5 — Retention Policy (DB-RET-01)

**REQ-ID:** DB-RET-01
**Layer:** 5 of 5 (Lifecycle: Storage Refs + Archival)
**Implemented by:** `supabase/migrations/20260525000007_phase42_layer5_lifecycle_archive.sql`
**Sweep function:** `public.run_lifecycle_sweep()` (SECURITY DEFINER)
**Cron job:** `lifecycle_sweep_nightly` at 04:00 UTC

---

## 1. Policy Table

The following retention windows govern every inline-blob column in the database. The sweep function (`run_lifecycle_sweep()`) applies these rules idempotently: re-running on identical data produces zero new actions.

| Data class | Archive at | Delete at | Conditions |
|---|---|---|---|
| `analysis_results.raw_response` | 30 days | 90 days | iff matching `resume_versions` OR `linkedin_versions` row exists (Layer 2 structured signals extracted) |
| `resumes.grading_data` | 30 days | 90 days | iff matching `resume_versions` row exists (post-Layer-2 superseded inline path) |
| `linkedin_grades.grading_data` | 30 days | 90 days | iff ≥1 `linkedin_versions` row references this `linkedin_grades.id` via `linkedin_grade_id` FK (operator reconciliation #2 — see footnote) |
| `profiles.linkedin_pdf_content` | 30 days post-upload | 180 days | Always — raw LinkedIn PDF text is high-cost, low-recovery-value; no version-row condition required |
| `analysis_cache.raw_response` | TTL guard: `created_at < now() - 30d` AND `last_hit_at < now() - 7d` | 90 days | Respects Phase 29 cache hit-rate KPIs — sweep skips any cache row still within either TTL window |
| `interview_quizzes.star_answer`, `interview_quiz_answers.scoring_breakdown` | N/A (no archive; direct drop) | 7 days | Drop unless `interview_streaks.last_quiz_date > now() - interval '7 days'` (active user guard); IPC paused on prod per Phase 47 — aggressive retention is safe |

**Archive path scheme:** `ai-archives/{user_id}/{table_name}/{row_id}.json.gz`
**Archive format:** Gzipped JSON per row (gzip level 6 default).

---

## 2. Explicitly-Skipped Tables

The following table is **intentionally excluded** from the lifecycle sweep and will never be archived or deleted by `run_lifecycle_sweep()`:

| Table | Reason |
|---|---|
| `job_descriptions` | Load-bearing for Layer 4 prediction queries (DB-APP-01, DB-OUT-01, DB-BMK-01). Deleting or archiving `job_descriptions` rows would sever the FK chain from `applications.jd_id` and break benchmark cohort queries. Exclusion is documented in the function body and emitted in the sweep summary log. |

This exclusion is SPEC-locked (CONTEXT.md §Layer 5 `job_descriptions` skip) and verified in the migration's DO $$ verification block.

---

## 3. Restoration Runbook (high-level)

**Archived rows (within archive window):** Archived rows can be restored via the `_shared/archive-reader.ts` fall-through reader (Plan 42-13). When an edge function reads an inline-blob column that is NULL with a non-NULL `archive_path`, the reader automatically downloads the gzipped payload from `ai-archives/{user_id}/{table}/{row_id}.json.gz`, decompresses it, and returns the original payload. No manual intervention required for read-path restoration.

**Deleted rows (beyond delete threshold):** Rows that have passed their delete-at window and have been permanently removed from the database are **terminal — no restoration path exists.** The `archive_path` value may still be present in Supabase Storage until the Storage object is also deleted; however, the DB row is gone and referential integrity is lost.

**Manual operator restoration (emergency):**
1. Identify the `archive_path` from a backup, audit log, or partner system.
2. Download the object from `ai-archives/{user_id}/{table}/{row_id}.json.gz`.
3. Decompress and re-insert the row manually via service-role SQL — **verify FK constraints and RLS posture before re-inserting.**
4. Null out `archive_path` to signal the row is back inline.

---

## 4. Cost-Regression Gate

The following constraint is SPEC-locked (T-42-PHASE37) and must not be violated by any sweep invocation:

> **Phase 29/37 cache hit-rate must not regress more than 5% absolute** after the lifecycle sweep runs against `analysis_cache.raw_response`.

The TTL guard (`created_at < now() - interval '30 days' AND last_hit_at < now() - interval '7 days'`) is the mechanism that enforces this gate in the sweep function. Any cache row with `last_hit_at > now() - 7d` is unconditionally skipped regardless of age.

Plan 42-13 includes a cache hit-rate regression rerun task that asserts ≤5% absolute drop post-backfill. If the regression test fails, the sweep operator gate is: STOP → revert the backfill → file a blocker before re-enabling the cron.

---

## 5. PII Tier Note

Archived objects stored in `ai-archives/` inherit the **user-PII tier** of their source column. This means:

- All archived blobs are private to the owning user via per-user-folder RLS (`auth.uid()::text = (storage.foldername(name))[1]`).
- User account deletion (DELETE from `auth.users`) cascades to DB rows via FK ON DELETE CASCADE, AND triggers a Storage cleanup step via the Plan 42-13 extension to `admin-delete-user`: enumerate `ai-archives/{user_id}/` recursively, bulk `.remove(paths)` before the `auth.users` delete completes.
- GDPR export flows (existing `admin-delete-user` path) include `archive_path` references and resolve them on export — the archived payload is included in any user data export.
- No cross-user access is possible: Storage RLS denies listing, reading, or deleting another user's objects in `ai-archives/`.

---

## 6. Operator Reconciliation #2 — `linkedin_grades.grading_data` Retention Condition

**What changed and why:**

The original SPEC (DB-RET-01) described the `linkedin_grades.grading_data` retention condition as "iff ≥1 `linkedin_versions` row references this `linkedin_grades.id`" — written under the assumption that `linkedin_grades` is a global cross-user cache (one row per `profile_identifier`, shared across users).

**Live schema reality (verified via committed migrations):**

- `20251223075804_2c3ce05b-7a49-468b-9ef0-ca4272ced5ed.sql` added `user_id UUID REFERENCES auth.users(id)` to `linkedin_grades`.
- `20260410235959_linkedin_grades_drop_unique_identifier.sql` dropped the original `UNIQUE INDEX idx_linkedin_grades_identifier` and created a composite `idx_linkedin_grades_user_profile (user_id, profile_identifier)` — explicitly enabling multi-user grading of the same LinkedIn URL.
- `admin-delete-user/index.ts` performs `.from("linkedin_grades").delete().eq("user_id", targetUserId)` — confirming user-scoped rows.

**Under the per-user model:** every `linkedin_grades` row has exactly one `user_id`. The retention condition from SPEC — "iff ≥1 `linkedin_versions` row references this `linkedin_grades.id` via `linkedin_grade_id`" — still gates archival correctly: the FK chain `linkedin_versions.linkedin_grade_id → linkedin_grades.id` is per-user, and the condition "at least one `linkedin_versions` row exists for this grade row" correctly identifies that Layer 2 structured signals have been extracted and the inline grading blob is safe to archive.

**The wording is unchanged; the interpretation is clarified:** The retention condition is identical to the original SPEC, but interpreted under the per-user `linkedin_grades` shape (not the "global cache" framing). No migration change is required relative to SPEC — the condition works correctly in both interpretations.

**Operator sign-off:** This reconciliation was reviewed and locked during the Plan 42-12 design pass (see `42-PLAN.md` frontmatter `operator reconciliation #2`).
