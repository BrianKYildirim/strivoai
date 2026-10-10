# Phase 42: Database — Lean Intelligence Layer — Specification

> **🔀 Scope note (2026-05-21):** Former Phases 42–46 were consolidated into a single Phase 42 (Database — Lean Intelligence Layer). **This spec now covers all 5 layers:** Layer 1 (Users + Career Targets), Layer 2 (Resume + LinkedIn Structured Versioning), Layer 3 (Behavior + Improvement Tracking), Layer 4 (Outcomes + Predictions Foundation), Layer 5 (Lifecycle: Storage Refs + Archival). Layer 1 was specced 2026-05-05 (8 REQ-IDs, ambiguity 0.08, untouched). Layers 2–5 were specced 2026-05-24 via `/gsd-spec-phase 42` append pass (24 additional REQ-IDs). See `.planning/ROADMAP.md` Phase 42 detail (layers grouped) and the 2026-05-21 Roadmap Evolution entry in `STATE.md` for the merge rationale.

**Created:** 2026-05-05 (Layer 1) · 2026-05-24 (Layers 2–5 appended)
**Total scope:** 5 layers, sequential dependency chain (L1 → L2 → L3 → L4 → L5)
**Ambiguity score (per layer):** L1 0.08 · L2 0.16 · L3 0.15 · L4 0.11 · L5 0.15 — all ≤ 0.20 gate
**Requirements:** 32 locked (L1: 8 · L2: 7 · L3: 6 · L4: 7 · L5: 4)
**Provisional REQ-ID buckets:** DB-USR-*, DB-TGT-* (L1) · DB-VER-*, DB-SEC-*, DB-BUL-*, DB-SCR-* (L2) · DB-REC-*, DB-EDT-*, DB-USE-* (L3) · DB-APP-*, DB-OUT-*, DB-JD-*, DB-BMK-* (L4) · DB-LIF-*, DB-RET-*, DB-STO-* (L5)

---

# Layer 1: Users + Career Targets

> **🔀 Scope note (2026-05-21):** Former Phases 42–46 were consolidated into a single Phase 42 (Database — Lean Intelligence Layer). **This spec now covers Layer 1 (Users + Career Targets) of that merged phase** — it remains fully locked and ready to plan. The remaining layers — Layer 2 (Resume + LinkedIn Structured Versioning), Layer 3 (Behavior + Improvement Tracking), Layer 4 (Outcomes + Predictions Foundation), Layer 5 (Lifecycle: Storage Refs + Archival) — are **not yet specced**; append them via additional `/gsd-spec-phase 42` passes before planning those layers. The "Out of scope → Phase 43/44/45/46" references below should now be read as "→ Layer 2/3/4/5 of this phase." See `.planning/ROADMAP.md` Phase 42 detail (layers grouped) and the 2026-05-21 Roadmap Evolution entry in `STATE.md` for the merge rationale.

**Created:** 2026-05-05
**Scope within merged phase:** Layer 1 of 5 (Users + Career Targets)
**Ambiguity score:** 0.08 (gate: ≤ 0.20)
**Requirements:** 8 locked
**Provisional REQ-ID buckets:** DB-USR-*, DB-TGT-*

## Goal

Stand up the identity + targeting layer of Strivo's lean intelligence database: extend `profiles` with education context (school, major, year, graduation\_year), add a per-user `career_targets` table for industries/roles/companies/location/goals (migrating data from the legacy `profiles.target_roles[]` and `profiles.career_interests[]` columns and dropping them in the same migration), surface capture in the existing settings UI with a backfill banner, and ship a `cohort_peers` SQL view + supporting indexes that downstream phases (43–45) will read for benchmarking.

## Background

**Current state of** **`profiles`** (verified by reading `supabase/migrations/`):

* Initial: `id, email, full_name, avatar_url, created_at, updated_at` (`20251113100645_*.sql`)
* Career prefs added 2025-11-20: `linkedin_url, preferred_locations[], job_type_preference, experience_level, career_interests[], target_roles[]` (`20251120103400_*.sql`)
* Subscription/billing fields: `subscription_tier, subscription_status, paddle_*, stripe_*, current_period_end, credit_adjustment`
* LinkedIn-PDF context: `linkedin_pdf_content, linkedin_pdf_updated_at, linkedin_pdf_filename`
* RLS: user-scoped SELECT/UPDATE/INSERT (`auth.uid() = id`)

**Missing for the lean intelligence layer:**

* No `school`, `major`, `year`, `graduation_year`, singular `location_preference` columns
* No `career_targets` table — `target_industries[]`, `target_companies[]`, `career_goals` have no home; `target_roles[]` and `career_interests[]` live on `profiles` but should consolidate
* No cohort/benchmarking helper (no view, no relevant indexes for `(school, year, major)` filters)

**Existing surfaces that touch career data:**

* `src/pages/Onboarding.tsx` — writes `target_roles`, `career_interests` (lines 173, 304)
* `src/pages/Profile.tsx` — full settings UI for `linkedin_url`, `preferred_locations[]`, `job_type_preference`, `experience_level`, `career_interests[]`, `target_roles[]` (lines 22–27, 217–222)
* `src/pages/CareerCompass.tsx` — reads target\_roles / career\_interests
* `src/integrations/supabase/types.ts`, `src/types/database.ts` — generated/typed schema mirrors

**Why this phase exists:** Strivo is pivoting from "resume/LinkedIn grader" to "career outcome prediction engine" (per ROADMAP.md update 2026-05-05). Phases 43–46 build the resume versioning, behavior tracking, outcome capture, and lifecycle layers on top — all of which key off `(school, year, major, target_industries, target_roles)` cohorts. Phase 42 is the lowest-risk foundation: pure schema + migration + UI capture, no AI plumbing changes.

## Requirements

1. **DB-USR-01 — Education columns on profiles**: Extend `profiles` with education context.
   * Current: `profiles` has no `school`, `major`, `year`, `graduation_year`, or singular `location_preference` column
   * Target: `ALTER TABLE public.profiles ADD COLUMN school text, ADD COLUMN major text, ADD COLUMN year text, ADD COLUMN graduation_year integer, ADD COLUMN location_preference text` — all NULL-able, no defaults; existing RLS policies cover them automatically (policies are `auth.uid() = id` table-wide, not column-scoped)
   * Acceptance: SQL inspection on staging shows the 5 columns exist with the expected types and `is_nullable = YES`; existing `profiles` rows show NULL for the new columns; an authenticated user can `UPDATE profiles SET school = 'X' WHERE id = auth.uid()` and read it back; a different user cannot read or update those columns on the first user's row

2. **DB-TGT-01 —** **`career_targets`** **table**: Create the per-user career-targeting table.
   * Current: No `career_targets` table exists; `target_industries[]`, `target_companies[]`, `career_goals` have no storage
   * Target: `CREATE TABLE public.career_targets (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, target_industries text[] default '{}', target_roles text[] default '{}', target_companies text[] default '{}', location_preference text, career_goals text, created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now())` with `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and three policies: SELECT/INSERT/UPDATE all gated on `auth.uid() = user_id`; trigger `update_updated_at_column` on UPDATE
   * Acceptance: SQL inspection shows the table with the 9 columns, the `user_id UNIQUE` constraint (1:1 with user enforced), and 3 RLS policies; an authenticated user can INSERT/SELECT/UPDATE their own row; a second user gets 0 rows on SELECT and 0 rows affected on UPDATE against the first user's row

3. **DB-TGT-02 — Backfill from legacy columns**: Migrate every existing `profiles.target_roles[]` and `profiles.career_interests[]` value into `career_targets` before dropping the source columns.
   * Current: `target_roles[]` and `career_interests[]` data live only on `profiles`; no `career_targets` rows exist
   * Target: Single migration runs `INSERT INTO career_targets (user_id, target_roles, target_industries) SELECT id, target_roles, career_interests FROM profiles WHERE (target_roles IS NOT NULL AND array_length(target_roles, 1) > 0) OR (career_interests IS NOT NULL AND array_length(career_interests, 1) > 0) ON CONFLICT (user_id) DO NOTHING` — `career_interests[]` maps to `target_industries[]` (the new conceptual name)
   * Acceptance: Pre-migration count of profiles with non-empty `target_roles` or `career_interests` equals post-migration count of `career_targets` rows where the corresponding array is non-empty; spot-check 3 users' arrays match across the boundary

4. **DB-USR-02 — Drop legacy columns**: Remove `target_roles` and `career_interests` from `profiles` after the backfill completes.
   * Current: `profiles.target_roles[]` and `profiles.career_interests[]` exist and are read by `Onboarding.tsx`, `Profile.tsx`, `CareerCompass.tsx`
   * Target: After all callers are flipped to `career_targets` (REQ DB-USR-04), the same migration set runs `ALTER TABLE public.profiles DROP COLUMN target_roles, DROP COLUMN career_interests` — atomic with the backfill so no zombie state ships
   * Acceptance: `\d public.profiles` on staging shows neither column; all frontend builds pass; running `Onboarding.tsx` and `Profile.tsx` flows in staging successfully reads/writes `career_targets` instead

5. **DB-USR-03 — Cohort indexes + view**: Add the cohort-key indexes and a `cohort_peers` SQL view that downstream phases consume.
   * Current: No indexes on `(school, year, major)`; no GIN indexes on `target_industries`/`target_roles`; no view joining education + targets
   * Target:
     ```SQL
     CREATE INDEX idx_profiles_cohort_key ON public.profiles (school, year, major) WHERE school IS NOT NULL;
     CREATE INDEX idx_career_targets_industries_gin ON public.career_targets USING GIN (target_industries);
     CREATE INDEX idx_career_targets_roles_gin ON public.career_targets USING GIN (target_roles);
     CREATE VIEW public.cohort_peers AS
       SELECT p.id AS user_id, p.school, p.major, p.year, p.graduation_year,
              ct.target_industries, ct.target_roles, ct.target_companies,
              ct.location_preference
       FROM public.profiles p
       LEFT JOIN public.career_targets ct ON ct.user_id = p.id
       WHERE p.school IS NOT NULL;
     ```
     The view inherits RLS from underlying tables (Postgres standard behavior) so queries return only rows the caller can read.
   * Acceptance: `EXPLAIN ANALYZE SELECT * FROM cohort_peers WHERE school='Test University' AND year='sophomore' AND 'finance'=ANY(target_industries)` against a staging dataset of ≥1000 backfilled rows uses `idx_profiles_cohort_key` and `idx_career_targets_industries_gin` (visible in plan), and total runtime is <50ms; an authenticated user querying the view gets only rows for `school IS NOT NULL` profiles AND only rows their RLS would allow on the underlying tables

6. **DB-USR-04 — Settings UI capture**: Extend `Profile.tsx` so users can capture and edit all new fields.
   * Current: `Profile.tsx` exposes `linkedin_url`, `preferred_locations[]`, `job_type_preference`, `experience_level`, `career_interests[]`, `target_roles[]` — no school/major/year/grad\_year, no industries/companies/goals, no separate `career_targets` row management
   * Target: `Profile.tsx` adds an "Education & Targets" section with: `school` (text input), `major` (text input), `year` (select: freshman / sophomore / junior / senior / graduate / other), `graduation_year` (number/select 2024–2032), `target_industries[]` (chip input), `target_companies[]` (chip input), `career_goals` (textarea, ≤500 chars). Existing `target_roles[]` chip input continues to render but writes to `career_targets.target_roles` instead of `profiles.target_roles`. All fields optional. Save button persists to `profiles` (education columns) AND upserts `career_targets` (targets columns) atomically (or sequentially with toast-aware error handling matching existing Profile.tsx save pattern at lines 217–222)
   * Acceptance: A user fills all new fields, clicks Save, sees a success toast; reloading the page renders all values back; SQL shows the values in the correct table; clearing a field and saving persists NULL/empty array; a user who never touches the section sees no save errors

7. **DB-USR-05 — Onboarding read path migration**: Update `Onboarding.tsx` (and `CareerCompass.tsx` and any other readers) to read `target_roles`/`target_industries` from `career_targets`, not `profiles`.
   * Current: `Onboarding.tsx` reads `profiles.target_roles, profiles.career_interests` (line 173) and writes them on save (line 304); `CareerCompass.tsx` reads them too
   * Target: All readers/writers of `target_roles[]` and `career_interests[]` (now `target_industries[]`) point at `career_targets` via a join or a dedicated query; no code references `profiles.target_roles` or `profiles.career_interests` after the phase
   * Acceptance: `grep -rn "target_roles\|career_interests" src/` shows no references to `profiles.target_roles` or `profiles.career_interests` (only to `career_targets.target_roles` and `career_targets.target_industries`); `Onboarding.tsx` flow saves successfully with the new schema; `CareerCompass.tsx` analyze still works

8. **DB-USR-06 — Backfill banner**: Add a dismissible dashboard banner prompting existing users to fill in education/targets fields.
   * Current: No prompt for existing users to add school/major/etc. data
   * Target: A dismissible banner on the dashboard / main authenticated landing route ("Help us benchmark you — add your school, major, and graduation year") that links to `Profile.tsx#education-targets`. Banner hides when (a) `profiles.school IS NOT NULL` OR (b) user has dismissed it (localStorage key `cohort_backfill_banner_dismissed_v1`). New users created after this phase see the banner only after onboarding completes if they skipped the section.
   * Acceptance: Existing user without `school` set sees the banner on dashboard; clicking dismiss hides it for that browser; filling `school` in `Profile.tsx` and returning to dashboard shows no banner regardless of dismiss state; new signup completing onboarding without filling `school` sees the banner

## Boundaries

**In scope:**

* DB schema: 5 new columns on `profiles`; new `career_targets` table; backfill from legacy columns; drop of legacy columns; cohort-key + GIN indexes; `cohort_peers` view
* RLS policies for `career_targets` (3 policies, user-scoped)
* TypeScript type regeneration (`src/integrations/supabase/types.ts`, `src/types/database.ts`)
* `Profile.tsx` Education & Targets section (capture + edit)
* Read-path migration in `Onboarding.tsx` and `CareerCompass.tsx` (and any other consumer)
* Dismissible dashboard backfill banner
* PII contract documented at user-PII tier (RLS + CASCADE delete + GDPR export inclusion via existing flow)

**Out of scope:**

* Resume / LinkedIn structured versioning (`resume_versions`, `linkedin_versions`, `scores`, etc.) — Phase 43 builds these
* Behavior + improvement tracking (`recommendations`, `user_edits`, `feature_usage`) — Phase 44
* Outcomes + predictions (`applications`, `outcomes`, `job_descriptions`, `benchmarks`) — Phase 45
* Lifecycle / Storage refs / archival policy — Phase 46
* Net-new onboarding step for education/targets — captured in `Profile.tsx` only this phase, with a backfill banner; deferred to a follow-up phase if conversion data warrants it
* Required-field enforcement (DB NOT NULL or form validation) — all new fields stay optional this phase
* Admin-side UI for browsing cohort data — no new admin surface in this phase
* Audit logging on read of education fields — standard user-PII tier, no extra audit infrastructure
* Computing benchmark percentiles / rolling cohort stats — Phase 45 builds the `benchmarks` rollup; this phase ships the read path (`cohort_peers` view) only
* Updating `experience_level`, `job_type_preference`, `linkedin_url`, `preferred_locations[]` — these stay where they are on `profiles` (not migrating to `career_targets`)
* Touching `linkedin_pdf_*` columns — orthogonal to this layer

## Constraints

* **Migration atomicity**: backfill INSERT and column DROP must run in a single migration file (or a single transactional migration set); no intermediate state where `career_targets` exists but legacy columns are still being written by deployed frontend. Frontend code change ships in the same PR as the migration.
* **Rollback story**: migration must include documented down-migration that re-adds `target_roles[]` / `career_interests[]` to `profiles` and copies values back from `career_targets` — even if not auto-run, the SQL is in `.planning/` or in a comment block.
* **RLS inheritance**: `cohort_peers` view inherits underlying-table RLS; do not use `SECURITY DEFINER` here (would defeat per-user scoping).
* **Index cost**: GIN indexes on small empty arrays are cheap; recheck `pg_stat_user_indexes` post-deploy to confirm they're being hit, not just maintained.
* **PII tier — user-PII**: school/major/year/grad\_year/career\_targets are treated at the same sensitivity tier as `linkedin_url` / `full_name`. RLS gates all reads/writes to the owning user. CASCADE delete via existing `profiles.id REFERENCES auth.users ON DELETE CASCADE` covers career\_targets via its own FK. Existing GDPR export (if any) automatically picks up the new columns/table because it queries `profiles` and any user-scoped tables; no new sensitive-fields registry needed in this phase.
* **No AI plumbing changes**: `analyze-resume`, `grade-linkedin`, `analyze-career`, `recruiting-lens`, `interview-prep-analyze` edge functions stay untouched — Phase 43 is when they start emitting structured signals.

## Acceptance Criteria

* [ ] `profiles` has 5 new NULL-able columns: `school text`, `major text`, `year text`, `graduation_year integer`, `location_preference text`
* [ ] `public.career_targets` table exists with 9 columns, `user_id UNIQUE`, FK to `auth.users` with `ON DELETE CASCADE`, and 3 RLS policies (SELECT/INSERT/UPDATE on `auth.uid() = user_id`)
* [ ] Pre/post-migration row count of users with non-empty `target_roles` or `career_interests` matches the count of `career_targets` rows with corresponding non-empty arrays
* [ ] `\d public.profiles` shows neither `target_roles` nor `career_interests`
* [ ] `idx_profiles_cohort_key`, `idx_career_targets_industries_gin`, `idx_career_targets_roles_gin` all exist on staging
* [ ] `EXPLAIN ANALYZE` on `cohort_peers` filtered by `(school, year, target_industries[])` uses both `idx_profiles_cohort_key` and `idx_career_targets_industries_gin` and runs in <50ms on a ≥1000-row dataset
* [ ] `Profile.tsx` Education & Targets section captures + persists all 8 new field types (school, major, year, grad\_year, target\_industries, target\_roles, target\_companies, career\_goals); reload renders saved values
* [ ] `grep -rn "target_roles\|career_interests" src/` shows zero references to `profiles.target_roles` or `profiles.career_interests`
* [ ] `Onboarding.tsx` and `CareerCompass.tsx` flows complete successfully against the new schema
* [ ] Dashboard banner appears for users with `profiles.school IS NULL` who have not dismissed it; hides after dismiss or after `school` is populated
* [ ] User RLS check: user A cannot SELECT or UPDATE user B's `career_targets` row or B's new education columns on `profiles`
* [ ] User account deletion (delete from `auth.users`) cascades to `career_targets` via FK; no orphaned `career_targets` rows remain
* [ ] `src/integrations/supabase/types.ts` regenerated to include new columns + table; frontend `npm run build` and `npm run lint` pass
* [ ] Documented down-migration SQL exists (in migration file comment or `.planning/phases/42-…/`)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                           |
| ------------------- | ----- | ----- | ------ | --------------------------------------------------------------- |
| Goal Clarity        | 0.95  | 0.75  | ✓      | Table shape, column list, drop semantics all locked             |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | UI scope (settings + banner only) and out-of-scope explicit     |
| Constraint Clarity  | 0.90  | 0.65  | ✓      | RLS, indexes, view, atomicity, PII tier all named               |
| Acceptance Criteria | 0.90  | 0.70  | ✓      | 13 falsifiable checkboxes; benchmarking helper has EXPLAIN test |
| **Ambiguity**       | 0.08  | ≤0.20 | ✓      | Well below gate                                                 |

## Interview Log

| Round | Perspective              | Question summary                                                                      | Decision locked                                                                                                                                     |
| ----- | ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Researcher               | How does `career_targets` relate to existing `target_roles[]` / `career_interests[]`? | Migrate + drop legacy columns; `career_targets` is single source of truth                                                                           |
| 1     | Researcher               | Where do school/major/year/grad\_year live?                                           | Extend `profiles` directly (1:1 with user, mirrors `linkedin_url`/`experience_level` pattern)                                                       |
| 2     | Simplifier               | When are legacy `target_roles[]`/`career_interests[]` actually dropped?               | Drop in this phase, atomic with backfill — no zombie state                                                                                          |
| 2     | Simplifier               | UI scope for capture?                                                                 | `Profile.tsx` Education & Targets section + dismissible dashboard backfill banner; no new onboarding step                                           |
| 2     | Simplifier               | Required vs optional?                                                                 | All new fields optional, NULL-able in DB; benchmarking just excludes NULL cohort keys                                                               |
| 3     | Boundary Keeper / Closer | Concrete form of the benchmarking helper (SC #4)?                                     | `cohort_peers` SQL VIEW + `idx_profiles_cohort_key` + GIN indexes on `target_industries`/`target_roles`; verifiable by `EXPLAIN ANALYZE` <50ms      |
| 3     | Boundary Keeper / Closer | PII / retention contract (SC #5)?                                                     | User-PII tier: RLS user-scoped; CASCADE delete via `auth.users` FK; included in existing GDPR export; no new admin UI / no audit logging this phase |

---

# Layer 2: Resume + LinkedIn Structured Versioning

**Created:** 2026-05-24
**Scope within merged phase:** Layer 2 of 5 (Versioning)
**Depends on:** Layer 1 (users + targets foundation)
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 7 locked
**Provisional REQ-ID buckets:** DB-VER-*, DB-SEC-*, DB-BUL-*, DB-SCR-*

**Amendment:** SPEC amended 2026-05-25 per operator reconciliation Option A — see RESEARCH.md §Landmines #1.

## Goal

Replace "store the latest analysis blob on `resumes.grading_data` / `linkedin_grades.grading_data`" with a structured, version-tracked layer alongside the existing tables. For every successful resume or LinkedIn analyze run, an async parser worker emits new rows: `resume_versions` (FK to `resumes`), `resume_sections`, `resume_bullets`, `linkedin_versions` (FK to a user_id; coexists with the global `linkedin_grades` cache), and `scores` — all queryable in SQL so Layer 3 (behavior) and Layer 4 (predictions) can FK into bullet-level + score-level signals. Existing analyze paths and Phase-29/36/37 cache/history flows do not regress.

## Background

**Current state (verified via `supabase/migrations/`):**

* `resumes` (user-scoped, `20251113100645_*.sql`): `id, user_id, file_name, file_url, file_size, overall_score, grading_data jsonb, analyzed_at, created_at, updated_at` + Phase 29 additions `extracted_text, text_hash, file_hash`. Stores the latest analysis blob inline on `grading_data`.
* `linkedin_grades` (GLOBAL — `20251126120525_*.sql`): `id, profile_url, profile_identifier, overall_score, grading_data jsonb` — RLS allows anyone-can-read on the table (caches cross-user for the same LinkedIn URL). No user_id column.
* `resume_score_history` (user-scoped, `20251224161624_*.sql`): `id, user_id, resume_id, score, recorded_at` — primitive score-over-time tracker.
* `analysis_results` (user-scoped, `20251222223116_*.sql`): `analysis_type, primary_score, key_insights jsonb, raw_response jsonb, source_reference` — generic landing for any analyze run.
* `analysis_cache` (user-scoped, `20260512000000_*.sql`): cache substrate from Phase 29; `cache_key, feature, tier, variant, raw_response jsonb`. Hot read/write path for Phase 37.
* Edge functions: `analyze-resume`, `grade-linkedin` write to all of the above on every successful run.

**Missing for Layer 2:**

* No `resume_versions` table — multiple analyses of the same `resumes` row only update `grading_data` in place; no audit trail of how scores or bullets changed across reuploads.
* No structured parse — `grading_data` is opaque jsonb; no SQL access to sections / bullets / scores.
* No user-scoped LinkedIn version record — `linkedin_grades` is global and cross-user-readable.
* No `scores` table — overall + category scores live inline on `resumes.overall_score` and the jsonb blob.

**Why this layer matters:** Layer 3's accept/reject signals FK into `resume_bullets.bullet_id`; Layer 4's prediction queries FK into `scores.overall_score`; Layer 5 can only archive raw payloads once structured signals are durably extracted into Layer 2 tables.

## Requirements

1. **DB-VER-01 — `resume_versions` table**: Per-analyze-run version record alongside (not replacing) `resumes`.
   * Current: No `resume_versions` table; `resumes.grading_data` overwritten on each analyze run.
   * Target: `CREATE TABLE public.resume_versions (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, resume_id uuid NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE, parsed_summary jsonb, overall_score integer, supersedes_id uuid REFERENCES public.resume_versions(id), created_at timestamptz NOT NULL DEFAULT now())` + RLS user-scoped (SELECT-own; service-role writes only — no INSERT/UPDATE/DELETE user policies, mirrors `interview_quizzes` and `analysis_cache` precedent). FK to `resumes.id` carries `file_url` indirectly.
   * Acceptance: Table exists with 7 columns, RLS enabled, SELECT-own policy present; an `analyze-resume` invocation creates a new row (verified by service-role insert in test) with `supersedes_id` set to the user's previous `resume_versions.id` for the same `resume_id` (NULL if first); cross-user SELECT returns 0 rows.

2. **DB-SEC-01 — `resume_sections` table**: Section-level parse per version.
   * Current: No section-level data exists.
   * Target: `CREATE TABLE public.resume_sections (id uuid PK default gen_random_uuid(), resume_version_id uuid NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE, section_type text NOT NULL CHECK (section_type IN ('education','experience','projects','leadership','skills')), section_score integer, section_data jsonb, position smallint, created_at timestamptz NOT NULL DEFAULT now())` + RLS via parent `resume_versions` lookup (`USING (resume_version_id IN (SELECT id FROM resume_versions WHERE user_id = auth.uid()))`).
   * Acceptance: Table exists with the 5 enum'd section_types enforced; RLS chain returns only sections of the calling user's versions; FK CASCADE deletes sections when a version is deleted.

3. **DB-BUL-01 — `resume_bullets` table**: Per-bullet structured rows.
   * Current: Bullets exist only as text inside `resumes.grading_data` blob.
   * Target: `CREATE TABLE public.resume_bullets (id uuid PK default gen_random_uuid(), section_id uuid NOT NULL REFERENCES public.resume_sections(id) ON DELETE CASCADE, original_text text NOT NULL, bullet_score integer, weakness_category text, action_verb_quality text, quantified_impact bool, suggested_improvement text, position smallint, created_at timestamptz NOT NULL DEFAULT now())` + RLS through `resume_sections → resume_versions → user_id`. `bullet_id` is the FK target for Layer 3's `recommendations.target_ref` and `user_edits`.
   * Acceptance: Table exists; RLS chain confirmed via cross-user SELECT returning 0 rows; FK CASCADE through section → version chain deletes bullets when their version is deleted.

4. **DB-VER-02 — `linkedin_versions` table**: Per-user-scoped `linkedin_versions` (Option A reconciliation, 2026-05-25).
   * Current: Live `linkedin_grades` already carries `user_id` + per-user lookup shape per migrations `20251223075804_2c3ce05b-7a49-468b-9ef0-ca4272ced5ed.sql` and `20260410235959_linkedin_grades_drop_unique_identifier.sql`; no separate per-run re-grade history exists.
   * Target: `CREATE TABLE public.linkedin_versions (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, profile_url text NOT NULL, profile_identifier text NOT NULL, source_analysis_results_id uuid REFERENCES public.analysis_results(id) ON DELETE SET NULL, parsed_summary jsonb, overall_score integer, supersedes_id uuid REFERENCES public.linkedin_versions(id), linkedin_grade_id uuid REFERENCES public.linkedin_grades(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now())` + RLS user-scoped (SELECT-own; service-role writes). The `linkedin_versions` table acts as a thin re-grade-history delta layer: multiple `linkedin_versions` rows per `linkedin_grades.id` over time (one per re-grade), with `linkedin_grade_id` FK pointing at the user's existing `linkedin_grades` row. On re-grade by the same user of the same `profile_identifier`: `linkedin_grades` row is upserted in place (per-user, existing); a new `linkedin_versions` row is inserted with `supersedes_id` pointing at the prior `linkedin_versions` row for that user + `profile_identifier`.
   * Acceptance: Table exists with 10 columns + RLS SELECT-own; same user re-grading the same `profile_identifier` produces a new `linkedin_versions` row with `supersedes_id` pointing at the prior row; `linkedin_grades` row is upserted in place (per-user). Cross-user SELECT on `linkedin_versions` returns 0 rows.

5. **DB-SCR-01 — `scores` table**: Per-version multi-dimensional score record.
   * Current: Scores live inline on `resumes.overall_score`, `linkedin_grades.overall_score`, and inside the respective `grading_data` jsonb blobs.
   * Target: `CREATE TABLE public.scores (id uuid PK default gen_random_uuid(), version_id uuid NOT NULL, version_type text NOT NULL CHECK (version_type IN ('resume','linkedin')), overall_score integer, ats_score integer, recruiter_skim_score integer, formatting_score integer, quantified_impact_score integer, keyword_match_score integer, role_relevance_score integer, computed_at timestamptz NOT NULL DEFAULT now())` + RLS via SECURITY-DEFINER helper or explicit predicate that joins through `resume_versions` / `linkedin_versions` to `user_id`. `version_id` is polymorphic (resolved by `version_type`); a unique constraint on `(version_id, version_type)` prevents duplicates.
   * Acceptance: Table exists with the 7 score dimensions + 2 routing columns; RLS denies cross-user reads; inserting a row for a `resume_versions.id` is accepted, inserting for a non-existent version_id is rejected by application code (no DB FK on polymorphic column — enforced by the writer).

6. **DB-VER-03 — Async parser worker**: Edge function (or scheduled worker) extracts structured signals from raw analyze responses into the new tables.
   * Current: `analyze-resume` and `grade-linkedin` write `grading_data` jsonb + `analysis_results.raw_response` + `analysis_cache.raw_response`. No structured extraction occurs.
   * Target: A new edge function (working name `extract-resume-structure` / `extract-linkedin-structure`) or a single `extract-analysis-structure` worker that: (a) reads raw analyze output from `analysis_results.raw_response`, (b) writes the structured fan-out (`resume_versions` + `resume_sections` + `resume_bullets` + `scores`, or `linkedin_versions` + `scores`), (c) is triggered by a row insert on `analysis_results` via a Postgres `NOTIFY` + a polling consumer, or by a webhook dispatched from `analyze-resume` / `grade-linkedin` after they return their response to the client. Trigger mechanism is planner discretion; eventual consistency is acceptable (≤60s lag). Failure is non-fatal: legacy `resumes.grading_data` / `linkedin_grades.grading_data` paths keep working.
   * Acceptance: After an `analyze-resume` run, within 60 seconds a matching `resume_versions` row exists with `resume_id` = the analyzed resume and `overall_score` matching `resumes.overall_score`; sections + bullets rows present; `scores` row present; if the worker fails (simulated by throwing in the extractor), the analyze flow returns success to the user and a structured error log is emitted; no regression in `npm test` or in the Phase 37 cache hit-rate suite.

7. **DB-VER-04 — Improvement-over-time SQL queryable**: The schema supports per-user version history queries.
   * Current: `resume_score_history` is the only existing per-user score-over-time table; bullets/sections/multi-dim scores not queryable.
   * Target: A documented SQL query template returns "last 5 resume versions for user X, with overall + per-section + per-bullet score deltas vs the prior version" using only the new tables (no jsonb extraction). `resume_score_history` is retained for backcompat but the new path supersedes it.
   * Acceptance: The documented query, run on a staging account with ≥2 resume versions, returns a clean result set (one row per (version, section/bullet) pair) with delta columns computed correctly; query plan uses `idx_resume_versions_user_resume_created`; runtime <100ms.

## Boundaries

**In scope:**

* DB schema: `resume_versions`, `resume_sections`, `resume_bullets`, `linkedin_versions`, `scores` tables + RLS + supporting indexes
* Async parser worker (edge function) that fans out from raw analyze output into the structured tables
* Documented improvement-over-time SQL query template
* TypeScript types regeneration (`src/integrations/supabase/types.ts`)

**Out of scope:**

* Replacing or dropping `resumes.grading_data`, `linkedin_grades`, `resume_score_history`, `analysis_results.raw_response`, `analysis_cache.raw_response` — Layer 5 owns the lifecycle/retention sweep
* User-facing version-history UI surface — roadmap calls this "maybe" and a follow-up phase will own it
* Behavior tracking (`recommendations`, `user_edits`, `feature_usage`) — Layer 3
* Outcome data (`applications`, `outcomes`, `job_descriptions`, `benchmarks`) — Layer 4
* Changes to `analyze-resume` / `grade-linkedin` prompts, mergers, or model selection — the worker reads what they already produce
* Cross-version diffing or "what changed" UI — schema supports it (delta query) but no rendered surface

## Constraints

* **Coexistence with existing tables**: `resumes`, `linkedin_grades`, `resume_score_history`, `analysis_results`, `analysis_cache` are untouched this layer. New tables FK into `resumes.id` and `linkedin_grades.id` where applicable.
* **No regression in Phase 37 cache flow**: cache hit-rate, `cache_key` semantics, and `analysis_cache.raw_response` writes remain unchanged. Worker reads after cache writes complete.
* **Async worker eventual consistency**: ≤60s lag from analyze success to structured rows present is acceptable. Frontend Results page continues to read from `resumes.grading_data` (existing path).
* **RLS through joins**: section/bullet/score rows enforce user scope via parent version join. Service role bypasses RLS for writes. SECURITY-DEFINER helpers permitted for performance-critical RLS predicates on `scores` (polymorphic version_id).
* **Worker failure isolation**: extractor errors are logged + observable but never fail the parent analyze flow. Retry mechanism (replay from `analysis_results.raw_response`) acceptable; idempotent inserts required (use `(resume_id, created_at)` natural-key dedup or explicit per-run idempotency_key).
* **No new indexes beyond access pattern**: at minimum `idx_resume_versions_user_resume_created (user_id, resume_id, created_at DESC)`, `idx_linkedin_versions_user_created (user_id, created_at DESC)`, `idx_resume_bullets_section (section_id, position)` — confirmed by EXPLAIN on the SC #7 query.

## Acceptance Criteria

* [ ] `resume_versions`, `resume_sections`, `resume_bullets`, `linkedin_versions`, `scores` tables exist with the column lists in DB-VER-01..DB-SCR-01
* [ ] All 5 tables have RLS enabled; SELECT-own policy present; no permissive write policies (service role writes via getServiceClient)
* [ ] `analyze-resume` invocation on staging produces, within 60s, a matching `resume_versions` row + `resume_sections` (one per parsed section, ≥1) + `resume_bullets` (≥1) + `scores` row
* [ ] `grade-linkedin` invocation on staging produces, within 60s, both a `linkedin_grades` row (existing, unchanged) AND a user-scoped `linkedin_versions` row referencing it via `linkedin_grade_id`, plus a `scores` row
* [ ] Same user re-grading the same LinkedIn `profile_identifier` produces a new `linkedin_versions` row with `supersedes_id` pointing at the prior row; `linkedin_grades` row is upserted in place (per-user)
* [ ] Cross-user SELECT on every new table returns 0 rows
* [ ] Worker failure (simulated thrown error in extractor) leaves the parent `analyze-resume` / `grade-linkedin` response unaffected; structured-error log emitted
* [ ] Documented improvement-over-time SQL query returns a clean per-(version, bullet) result set with correct deltas on a staging account with ≥2 versions
* [ ] `npm test` and Phase 37 cache hit-rate suite pass with no regression
* [ ] `src/integrations/supabase/types.ts` regenerated; `npm run build` and `npm run lint` pass
* [ ] Documented down-migration SQL exists (drops tables in reverse FK order; safe to run idempotently)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                       |
| ------------------- | ----- | ----- | ------ | --------------------------------------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | 5 tables + worker named, FK chain explicit                                  |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | Coexists with existing tables; Layer 5 owns retention                       |
| Constraint Clarity  | 0.80  | 0.65  | ✓      | Eventual consistency budget, RLS pattern, no regression rules               |
| Acceptance Criteria | 0.75  | 0.70  | ✓      | 11 falsifiable checkboxes; worker SLA (≤60s) is testable                    |
| **Ambiguity**       | 0.16  | ≤0.20 | ✓      | Below gate                                                                  |

## Interview Log

| Round | Perspective     | Question summary                                                | Decision locked                                                                                                                                          |
| ----- | --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Researcher      | Relationship of `resume_versions` to existing `resumes` table   | New table alongside `resumes` (FK resume_id); existing `resumes` untouched this layer                                                                    |
| 2     | Simplifier      | Sync vs async parser emission?                                  | Async background parser worker; eventual consistency ≤60s; failure isolated from analyze flow                                                            |
| 2     | Simplifier      | What happens to global `linkedin_grades` cache?                 | Keep `linkedin_grades` as cross-user cache; add `linkedin_versions` as user-scoped record; writes hit both                                               |

---

# Layer 3: Behavior + Improvement Tracking

**Created:** 2026-05-24
**Scope within merged phase:** Layer 3 of 5 (Behavior)
**Depends on:** Layer 2 (bullet_id / version_id FK targets must exist)
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 6 locked
**Provisional REQ-ID buckets:** DB-REC-*, DB-EDT-*, DB-USE-*

## Goal

Capture the "did the user actually improve?" loop across 4 of Strivo's 5 AI features (Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens — Interview Prep excluded because it's paused on prod per Phase 47). Persist every recommendation the AI surfaces (one row per analyze run), every accept/reject/edit action the user takes, and a lightweight per-feature touch counter (open / submit / view_results / export). This is the layer that lets Strivo eventually correlate "users who improved their quantified bullet score by 20+ points" with Layer 4 interview outcomes.

## Background

**Current state:**

* No `recommendations`, `user_edits`, or `feature_usage` tables exist.
* AI suggestions are produced by `analyze-resume`, `grade-linkedin`, `analyze-career`, `recruiting-lens` and surfaced in their respective Results pages, but no accept/reject/edit affordances exist on any feature today — users just read the suggestions, optionally save to `improvement_checklist`, and act offline.
* `improvement_checklist` (user-scoped) stores checklist items per analysis but does not record accept/reject/edit deltas or original-vs-final text.
* Vercel Analytics covers page-mount funnel data at a coarse level but no per-feature event taxonomy.
* Interview Prep edge functions stay deployed on production (per Phase 47 D-13/D-14), but the UI surfaces show "Coming Soon" — no recommendations or user actions visible to prod users. Layer 3 omits IPC instrumentation entirely this phase.

**Why this layer matters:** Layer 4's prediction queries require behavior signals — "did users who accepted the quantification suggestion get more interviews?" can only be answered with `user_edits` data. Without Layer 3, Layer 4's `outcomes` table is correlated only with `scores`, not with user-driven improvements.

## Requirements

1. **DB-REC-01 — `recommendations` table**: One row per (analyze run, suggestion).
   * Current: No suggestion-level persistence; suggestions are returned in raw analyze response and rendered.
   * Target: `CREATE TABLE public.recommendations (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, feature text NOT NULL CHECK (feature IN ('resume_analysis','linkedin_grading','career_compass','recruiting_lens')), suggestion_type text NOT NULL, target_ref_type text CHECK (target_ref_type IN ('bullet','section','version','generic')), target_ref_id uuid, suggestion_text text NOT NULL, source_version_id uuid, shown_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())` + RLS SELECT-own. Service-role writes from the same async worker that emits Layer 2 rows (DB-VER-03) — one INSERT batch per analyze run, all suggestions for that run.
   * Acceptance: Table exists; an `analyze-resume` invocation produces a `recommendations` row per suggestion in the parsed output (typically 3–15 per run) within 60s; `target_ref_id` resolves to a valid `resume_bullets.id` for bullet-level suggestions; cross-user SELECT returns 0; `shown_at` is NULL on insert (frontend updates on first paint per DB-REC-02).

2. **DB-REC-02 — `shown_at` update RPC**: Frontend ping to record first-impression timestamp.
   * Current: No impression tracking.
   * Target: A SECURITY-DEFINER RPC `record_recommendations_shown(rec_ids uuid[])` that updates `shown_at = now() WHERE shown_at IS NULL AND user_id = auth.uid() AND id = ANY(rec_ids)`. Frontend Results page calls it once on first paint with the visible rec IDs. Idempotent (`WHERE shown_at IS NULL` clause).
   * Acceptance: RPC exists; calling it with a rec_id the user owns sets `shown_at`; calling it again is a no-op; calling it for another user's rec_id is rejected (0 rows updated); RPC is callable from the authenticated client (RLS-friendly via SECURITY DEFINER).

3. **DB-EDT-01 — `user_edits` table**: Action record per (recommendation, user action).
   * Current: No action capture.
   * Target: `CREATE TABLE public.user_edits (id uuid PK default gen_random_uuid(), rec_id uuid NOT NULL REFERENCES public.recommendations(id) ON DELETE CASCADE, action text NOT NULL CHECK (action IN ('accepted','rejected','edited','ignored')), original_text text, suggested_text text, final_user_text text, score_before integer, score_after integer, score_delta integer GENERATED ALWAYS AS (score_after - score_before) STORED, edited_at timestamptz NOT NULL DEFAULT now())` + RLS via `recommendations.user_id` join (`USING (rec_id IN (SELECT id FROM recommendations WHERE user_id = auth.uid()))`). `score_before` / `score_after` source from `resume_bullets.bullet_score` (Layer 2) — no ad-hoc recompute.
   * Acceptance: Table exists with action enum enforced and `score_delta` as a generated column; RLS chain returns only edits for the calling user's recommendations; an INSERT with `action='accepted'` + a `rec_id` from another user is rejected by RLS.

4. **DB-EDT-02 — Accept/reject/edit UI affordances**: Per-suggestion controls on results surfaces for 4 features.
   * Current: No accept/reject/edit UI on any feature.
   * Target: Each suggestion rendered on the Results pages of Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens has three controls: ✓ Accept, ✗ Reject, ✎ Edit (opens inline textarea, Save commits). Each action writes a `user_edits` row via service-role-equivalent RPC or RLS-friendly INSERT. Failures degrade silently (toast on console error, no user-blocking modal). Interview Prep surfaces (Coming Soon on prod, functional on staging) are NOT instrumented this phase.
   * Acceptance: On staging, opening the Resume Analysis Results page renders Accept/Reject/Edit controls on every visible suggestion; clicking Accept creates a `user_edits` row with `action='accepted'` and matching `rec_id`; clicking Edit, modifying text, Save creates a row with `action='edited'` and `final_user_text` populated; network failure during action surfaces a console error and a toast but does not block the user; verified on all 4 features; Interview Prep Results page (staging) renders with no Accept/Reject/Edit controls.

5. **DB-USE-01 — `feature_usage` table**: Lightweight 4-event funnel.
   * Current: No structured feature-event log; Vercel Analytics covers page mounts only.
   * Target: `CREATE TABLE public.feature_usage (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, feature text NOT NULL CHECK (feature IN ('resume_analysis','linkedin_grading','career_compass','recruiting_lens')), action text NOT NULL CHECK (action IN ('open','submit','view_results','export')), occurred_at timestamptz NOT NULL DEFAULT now())` + RLS SELECT-own. Writes from frontend via SECURITY-DEFINER RPC `record_feature_usage(feature text, action text)`. Index `(user_id, feature, occurred_at DESC)`.
   * Acceptance: Table exists with 4 enum'd features × 4 actions; on staging, navigating to `/analyze` creates a row with `action='open'`; clicking Analyze button creates `action='submit'`; landing on `/results/:id` creates `action='view_results'`; exporting PDF creates `action='export'`; cross-user SELECT returns 0; verified on all 4 features.

6. **DB-EDT-03 — Privacy / deletion contract**: Documented retention + deletion path.
   * Current: No behavior trail to delete; once Layer 3 ships, original-vs-final text becomes user-PII.
   * Target: `original_text`, `suggested_text`, `final_user_text` columns on `user_edits` are documented as user-PII tier (same as `linkedin_pdf_content`). CASCADE delete chain: `auth.users` → `recommendations.user_id` (CASCADE) → `user_edits.rec_id` (CASCADE) → row gone. A user-initiated "delete my behavior data" path is NOT shipped this phase but the deletion-via-account-delete chain is verifiable.
   * Acceptance: Documented in the migration COMMENT and in `.planning/phases/42-…/` retention notes; deleting a row from `auth.users` cascades to remove all `recommendations` + `user_edits` rows for that user (verified by post-delete count = 0); GDPR export (existing flow) includes the new tables.

## Boundaries

**In scope:**

* DB schema: `recommendations`, `user_edits`, `feature_usage` tables + RLS + indexes
* `record_recommendations_shown` and `record_feature_usage` RPCs
* Accept/Reject/Edit UI controls on Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens Results pages
* Service-role write path for `recommendations` (from Layer 2 async worker)
* TypeScript types regeneration

**Out of scope:**

* Interview Prep instrumentation (paused per Phase 47; Future IPC Milestone re-enables and adds Layer 3 wiring then)
* Analytics dashboards, score-delta charts, recommendation funnel visualizations
* User-initiated "delete my behavior trail" UI surface (cascade via account-delete works; explicit purge UI is a follow-up)
* A/B testing infrastructure or experiment buckets
* Cross-feature recommendation deduplication or ranking

## Constraints

* **No blocking failures**: any `user_edits` or `feature_usage` write failure logs to console and surfaces a toast but never blocks the user flow. Telemetry-grade reliability, not transactional.
* **Score-delta source-of-truth**: `score_before` / `score_after` always sourced from `resume_bullets.bullet_score` (Layer 2). Never recomputed ad-hoc in frontend.
* **Idempotent shown_at**: the `record_recommendations_shown` RPC must be safe to call multiple times — only the first call (`WHERE shown_at IS NULL`) sets the timestamp.
* **Feature enum closed-set**: only the 4 active features ('resume_analysis','linkedin_grading','career_compass','recruiting_lens') are valid. Adding Interview Prep later is a CHECK-constraint widen, separate migration.
* **PII tier**: `original_text` / `final_user_text` are user-PII (resume content). RLS enforced through `recommendations.user_id`. CASCADE deletion via `auth.users` is the deletion path.
* **No regression in 4 feature flows**: existing analyze + Results behavior unchanged; controls are additive.

## Acceptance Criteria

* [ ] `recommendations`, `user_edits`, `feature_usage` tables exist with the column lists in DB-REC-01 / DB-EDT-01 / DB-USE-01
* [ ] All 3 tables have RLS enabled; SELECT-own policy present; no permissive write policies
* [ ] `record_recommendations_shown(rec_ids[])` and `record_feature_usage(feature, action)` RPCs exist and are callable from authenticated client
* [ ] `analyze-resume` invocation (via Layer 2 worker) produces `recommendations` rows for every suggestion in the analyze output, with `target_ref_id` resolving to a valid `resume_bullets.id` for bullet-level suggestions
* [ ] Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens Results pages render Accept/Reject/Edit controls per suggestion on staging
* [ ] Clicking Accept / Reject / Edit (Edit with text change + Save) writes the corresponding `user_edits` row with correct `action`
* [ ] `feature_usage` rows are written on open / submit / view_results / export across all 4 features
* [ ] Interview Prep Results page renders with NO Accept/Reject/Edit controls (paused per Phase 47)
* [ ] Simulated network failure during `user_edits` write surfaces a toast but does not block the user; `feature_usage` failures same behavior
* [ ] Cross-user SELECT on all 3 new tables returns 0 rows
* [ ] User account deletion cascades through `recommendations` and `user_edits` (post-delete row count = 0 for that user)
* [ ] `npm test` and the 4 feature analyze flows pass with no regression in latency or behavior
* [ ] Documented retention/PII contract in migration COMMENT and `.planning/`
* [ ] `src/integrations/supabase/types.ts` regenerated; `npm run build` and `npm run lint` pass
* [ ] Documented down-migration SQL exists (drops in reverse FK order, removes RPCs)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                            |
| ------------------- | ----- | ----- | ------ | -------------------------------------------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | Tables + RPCs + UI controls + 4-feature scope all named                          |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | IPC excluded explicitly; out-of-scope dashboards listed                          |
| Constraint Clarity  | 0.80  | 0.65  | ✓      | Telemetry reliability tier, score-source rule, PII tier, no regression           |
| Acceptance Criteria | 0.80  | 0.70  | ✓      | 14 falsifiable checkboxes including IPC negative assertion                       |
| **Ambiguity**       | 0.15  | ≤0.20 | ✓      | Below gate                                                                       |

## Interview Log

| Round | Perspective     | Question summary                                                | Decision locked                                                                                                |
| ----- | --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | Researcher      | UI MVP scope across the 5 features                              | All 5 except IPC (paused per Phase 47); 4 features get Accept/Reject/Edit affordances                          |
| 2     | Simplifier      | When is a `recommendations` row written?                        | Once per analyze run from edge worker; `shown_at` updated by frontend via SECURITY-DEFINER RPC                 |
| 3     | Boundary Keeper | `feature_usage` event taxonomy                                  | All 4 events (open, submit, view_results, export); enforces enum                                               |

---

# Layer 4: Outcomes + Predictions Foundation

> **(SPEC amended 2026-05-25 per operator reconciliation #1 — see 42-RESEARCH.md §Landmines #3.)** DB-APP-01 column inventory extended with 4 reconciled nullable columns (posted/salary/url/location) that preserve the Jobs.tsx swipe-save field shape from the live `saved_jobs` schema (`20251114012619`). These columns are non-load-bearing for benchmarks/predictions.

**Created:** 2026-05-24
**Scope within merged phase:** Layer 4 of 5 (Outcomes)
**Depends on:** Layer 1 (cohort_key), Layer 2 (resume_version_id / linkedin_version_id), Layer 3 (behavior → outcome correlation)
**Ambiguity score:** 0.11 (gate: ≤ 0.20)
**Requirements:** 7 locked
**Provisional REQ-ID buckets:** DB-APP-*, DB-OUT-*, DB-JD-*, DB-BMK-*

## Goal

Stand up Strivo's most strategically important data layer: the outcome record. Without outcome data Strivo is only a resume tool; with it, Strivo becomes a prediction engine. Subsume the existing `saved_jobs` table into a new unified `applications` table with a `status` field spanning `saved → applied → interviewing → offer → rejected → ghosted`. Add `outcomes` (per-application result detail), `job_descriptions` (lean structured JD signals, no raw text retention), and `benchmarks` (nightly pg_cron percentile rollups). Ship a user-facing `/applications` tracker with manual entry, auto-create from Recruiting Lens analyze, and a dashboard outcome-banner aggregator for 14d/30d overdue nudges. Net-new prediction-readiness queries become answerable in SQL.

## Background

**Current state:**

* `saved_jobs` (user-scoped, `20251114012619_*.sql`): user-saved JD shortlist; no outcome tracking, no application status.
* `recruiting-lens` edge function analyzes JDs and writes results to `analysis_results.raw_response`; no structured JD requirement extraction lands.
* No `applications`, `outcomes`, `job_descriptions`, `benchmarks` tables.
* No `/applications` page. Dashboard shows feature tiles only; no outcome-reporting surface.
* Existing email infra (`scheduled_emails`, Resend integration in `send-*-email` functions) is available but Layer 4 nudges are in-app only this phase.
* Phase 33 pricing/checkout is shipped; no conflict.

**Why this layer matters:** This is the layer that justifies the platform pivot. Phase 47.1 (Elite-vs-Pro differentiator) explicitly lists "outcome-prediction beta access" as a candidate that ties into Layer 4. Re-enabling Interview Prep on production (Future IPC Milestone) depends on Phase 47.1 shipping, which may itself depend on Layer 4.

## Requirements

1. **DB-APP-01 — `applications` table (subsumes `saved_jobs`)**: Unified per-user application record with status lifecycle.
   * Current: `saved_jobs` stores JD shortlist with no outcome field; no `applications` table exists.
   * Target: `CREATE TABLE public.applications (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, company_applied text NOT NULL, role_applied text NOT NULL, industry text, status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','applied','interviewing','offer','rejected','ghosted','withdrawn')), application_date date, application_source text CHECK (application_source IS NULL OR application_source IN ('linkedin','indeed','referral','company_site','other')), referral_used bool DEFAULT false, resume_version_id uuid REFERENCES public.resume_versions(id) ON DELETE SET NULL, linkedin_version_id uuid REFERENCES public.linkedin_versions(id) ON DELETE SET NULL, jd_id uuid REFERENCES public.job_descriptions(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())` + RLS user-scoped (SELECT/INSERT/UPDATE/DELETE on `auth.uid() = user_id`) + `update_updated_at_column` trigger. **Backfill**: every existing `saved_jobs` row migrates to `applications` with `status='saved'` and preserved `created_at`. **Drop** `saved_jobs` after backfill (atomic with the migration, mirroring Layer 1 DB-USR-02 precedent).
   * **Reconciled columns (operator reconciliation #1, 2026-05-25):** The following 4 nullable columns are added beyond the original SPEC column list to preserve the Jobs.tsx swipe-save field shape from the live `saved_jobs` schema (migration `20251114012619`). They are non-load-bearing for benchmarks/predictions; future cleanup may move them into `job_descriptions` if `application_source='job_discovery'` becomes a stable bucket.
     * `posted text NULL` — job posting date/label from job-discovery API
     * `salary text NULL` — salary range string from job-discovery API
     * `url text NULL` — job posting URL
     * `location text NULL` — job location string (was used as a sentinel `'Recruiting Lens'` in the old `saved_jobs` flow; replaced by `application_source='other'` in the applications schema)
   * Acceptance: Table exists with the status CHECK constraint; pre-migration `saved_jobs` count equals post-migration count of `applications` rows with `status='saved'`; spot-check 3 users match; `\d public.saved_jobs` returns "does not exist" after migration; cross-user SELECT returns 0 rows; 4 reconciled nullable columns present (`posted`, `salary`, `url`, `location`).

2. **DB-OUT-01 — `outcomes` table**: Per-application result detail (1:1 with applications).
   * Current: No outcome record.
   * Target: `CREATE TABLE public.outcomes (id uuid PK default gen_random_uuid(), application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE, result text NOT NULL CHECK (result IN ('rejected','interview','offer','withdrawn','ghosted')), rejection_stage text CHECK (rejection_stage IS NULL OR rejection_stage IN ('application_screen','recruiter_screen','technical_screen','onsite','offer_negotiation','other')), interview_rounds smallint, offer_received bool DEFAULT false, final_outcome_date date, outcome_source text NOT NULL DEFAULT 'self_reported' CHECK (outcome_source IN ('self_reported','verified','imported')), outcome_confidence_score smallint CHECK (outcome_confidence_score BETWEEN 0 AND 100), reported_at timestamptz NOT NULL DEFAULT now())` + RLS via `applications.user_id` join. `UNIQUE(application_id)` enforces 1:1.
   * Acceptance: Table exists with enums + UNIQUE; an outcome insert for an application_id owned by another user is rejected by RLS; two outcomes for the same application_id are rejected by the UNIQUE constraint; cross-user SELECT returns 0 rows.

3. **DB-JD-01 — `job_descriptions` table (lean, no raw text)**: Structured JD signals only.
   * Current: Raw JD text lives inside `recruiting-lens` raw responses (`analysis_results.raw_response` jsonb); no structured extraction.
   * Target: `CREATE TABLE public.job_descriptions (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, key_requirements text[] DEFAULT '{}', required_skills text[] DEFAULT '{}', preferred_skills text[] DEFAULT '{}', missing_skills_vs_user text[] DEFAULT '{}', match_score integer, jd_url text, captured_at timestamptz NOT NULL DEFAULT now())` + RLS user-scoped. **Raw JD text is NOT retained in this table** — Layer 5 governs whether the source `analysis_results.raw_response` is archived to Storage or dropped. `applications.jd_id` references this table; `recruiting-lens` worker extracts and writes one row per analyze run via the Layer 2 worker pattern.
   * Acceptance: Table exists with no raw-text column; recruiting-lens analyze creates a `job_descriptions` row within 60s with `key_requirements[]` populated from the parsed output; cross-user SELECT returns 0; an applications row with `jd_id` set joins cleanly.

4. **DB-BMK-01 — `benchmarks` table**: Rolled-up cohort percentiles.
   * Current: No benchmark table; Layer 1 ships the `cohort_peers` view but no rollup.
   * Target: `CREATE TABLE public.benchmarks (id uuid PK default gen_random_uuid(), cohort_key text NOT NULL, metric text NOT NULL CHECK (metric IN ('resume_overall_score','linkedin_overall_score','ats_score','quantified_impact_score','interview_rate','offer_rate')), percentile_25 numeric, percentile_50 numeric, percentile_75 numeric, sample_size integer NOT NULL CHECK (sample_size >= 5), computed_at timestamptz NOT NULL DEFAULT now())` + UNIQUE `(cohort_key, metric, computed_at::date)` to prevent same-day duplicates. RLS: read allowed for any authenticated user (cohort percentiles are aggregate, not individual data); no write policy (service-role only). `cohort_key` is `school|year|major|target_role|industry|location` joined with `|` — derived from Layer 1 `cohort_peers` rows.
   * Acceptance: Table exists with the 6 metric enums and `sample_size >= 5` CHECK; same-day duplicate insert rejected by UNIQUE; an authenticated user can SELECT all rows (aggregate data is non-PII); no INSERT/UPDATE policy exists.

5. **DB-BMK-02 — Nightly benchmark recompute pg_cron job**: Scheduled rollup, all cohorts ≥ sample threshold.
   * Current: No scheduled compute exists for Phase 42 layers; `keep-warm` pg_cron exists but is unrelated.
   * Target: A pg_cron job scheduled nightly (planner-discretion time slot, e.g., 03:00 UTC mirroring `add_keep_warm_cron.sql` precedent) that: (a) computes percentile_25/50/75 of each metric per cohort_key, filtering to cohorts with `sample_size >= 5`, (b) inserts/updates a `benchmarks` row per (cohort_key, metric) for today's date. Uses `pg_cron.schedule()` and a SECURITY-DEFINER pl/pgsql function.
   * Acceptance: pg_cron job exists (verifiable via `SELECT * FROM cron.job WHERE jobname LIKE 'benchmarks_%'`); manually invoking the rollup function on staging populates `benchmarks` rows for all cohorts with ≥5 members; running twice on the same day produces no duplicate rows (UNIQUE constraint); structured log entry per run summarizes cohort + metric counts.

6. **DB-APP-02 — Applications page UI (manual + auto-create + dashboard banner)**: Net-new user surface at `/applications`.
   * Current: No `/applications` route; saved_jobs has no UI surface today either.
   * Target: New route `/applications` rendering a table of the user's `applications` rows with columns: company, role, status, application_date, source. Controls: (a) "Add application" button opens a modal for manual entry; (b) per-row "Report outcome" button opens an outcome modal that writes/upserts `outcomes`; (c) per-row status-change dropdown updates `applications.status`. **Auto-create**: when a user analyzes a JD in Recruiting Lens, a corresponding `applications` row is auto-created in `status='saved'` with `jd_id` set; user can promote to `status='applied'` from the table. **Dashboard banner**: a banner on Dashboard aggregates the count of applications past 14d / 30d without an outcome and CTAs to `/applications` (filtered to the overdue rows).
   * Acceptance: `/applications` route exists and renders the current user's applications; manual Add creates a row with the entered fields; Report Outcome creates/upserts an `outcomes` row; status dropdown updates `applications.status` and bumps `updated_at`; analyzing a JD in Recruiting Lens auto-creates an `applications` row visible on `/applications` within one page reload; Dashboard banner appears when ≥1 application is overdue 14d without an outcome; banner hidden when no overdue applications exist; cross-user check: user A cannot see user B's applications page rows.

7. **DB-OUT-02 — Prediction-readiness SQL query**: Documented query proving the dataset answers the prediction question.
   * Current: No such query exists.
   * Target: A documented SQL query template returns "for cohort X (school+year+major+target_role+industry+location), the median resume `overall_score` and median `quantified_impact_score` among users who got `outcomes.result='interview'` vs `outcomes.result='ghosted'`" using `applications` + `outcomes` + `scores` (Layer 2) + `cohort_peers` (Layer 1). Result set is one row per (metric, outcome bucket).
   * Acceptance: Documented query runs on a staging dataset of ≥50 applications with ≥10 outcomes per outcome bucket, returns a clean median comparison; runtime <500ms with EXPLAIN showing index usage on `applications(user_id)` and `outcomes(application_id)`.

## Boundaries

**In scope:**

* DB schema: `applications` (subsumes `saved_jobs`), `outcomes`, `job_descriptions`, `benchmarks` tables + RLS + indexes
* Atomic backfill of `saved_jobs` into `applications` + drop of `saved_jobs`
* Nightly pg_cron benchmark recompute job + SECURITY-DEFINER rollup function
* New `/applications` page UI: table, manual Add, Report Outcome modal, status dropdown
* Auto-create applications row from Recruiting Lens analyze
* Dashboard outcome-banner aggregator (14d / 30d overdue)
* Recruiting Lens worker extension to write `job_descriptions` rows
* Documented prediction-readiness SQL query
* TypeScript types regeneration

**Out of scope:**

* The prediction model / inference layer — Layer 4 ships the data foundation only; ML/heuristic models are a future milestone
* Email-based outcome nudges — in-app banner only this phase (Resend infra exists but email cost + unsubscribe story deferred)
* Cross-user data sharing UX, leaderboards, peer-comparison surfaces
* Verified/imported outcome sources beyond `self_reported` — `outcome_source` enum allows them but no integrations ship this phase
* Outcome history / change-log audit trail beyond `updated_at`
* Lifecycle / archival of `job_descriptions` rows — Layer 5 owns retention
* Modifications to `recruiting-lens` prompts or model selection — worker reads what it already produces

## Constraints

* **Atomic backfill**: `saved_jobs` → `applications` backfill and DROP run in a single transactional migration. Frontend cutover ships in the same PR (mirrors Layer 1 DB-USR-02 precedent — no zombie state).
* **Aggregate-data RLS exception**: `benchmarks` is the only Layer 1–5 table with permissive SELECT (any authenticated user). Justified because percentile/sample_size rows are aggregate-only — no individual identifiers leak. Service-role-only writes preserve integrity.
* **`sample_size >= 5` threshold**: prevents small-cohort de-anonymization. CHECK constraint enforces it at write time; the rollup function filters cohorts below threshold.
* **No raw JD text retained**: `job_descriptions.jd_url` is the recoverable pointer; raw text lives in `analysis_results.raw_response` and is governed by Layer 5 retention. New rows do not duplicate raw text.
* **In-app banner only**: outcome nudges are visual on Dashboard. No `scheduled_emails` rows or Resend integration this phase.
* **Auto-create idempotency**: analyzing the same JD twice in Recruiting Lens does not duplicate `applications` rows — dedup by `(user_id, jd_id)` natural key or `INSERT … ON CONFLICT DO NOTHING`.
* **Status enum closed-set**: 7 statuses fixed in the CHECK constraint; widening is a separate migration.
* **PII tier**: `applications.company_applied`, `role_applied`, all `outcomes` fields are user-PII (job-search behavior). Standard RLS + CASCADE delete pattern.

## Acceptance Criteria

* [ ] `applications`, `outcomes`, `job_descriptions`, `benchmarks` tables exist with column lists in DB-APP-01 / DB-OUT-01 / DB-JD-01 / DB-BMK-01
* [ ] Pre-migration `saved_jobs` row count equals post-migration `applications` rows with `status='saved'`
* [ ] `\d public.saved_jobs` returns "does not exist" after migration
* [ ] RLS: user-scoped on `applications`, `outcomes`, `job_descriptions`; aggregate-read on `benchmarks` (no write policy)
* [ ] `UNIQUE(application_id)` on `outcomes` rejects double-insert
* [ ] `sample_size >= 5` CHECK on `benchmarks` rejects small-cohort inserts
* [ ] pg_cron `benchmarks_nightly` job exists; manual invocation populates `benchmarks` rows for cohorts with ≥5 members; second-run idempotent
* [ ] `/applications` route renders table of caller's applications; manual Add + Report Outcome + status dropdown all function
* [ ] Analyzing a JD in Recruiting Lens auto-creates an `applications` row (status='saved', jd_id populated) visible after one page reload
* [ ] Re-analyzing the same JD in Recruiting Lens does NOT duplicate `applications` rows
* [ ] Dashboard outcome-banner appears when ≥1 application is overdue 14d without an outcome; hides when none are overdue
* [ ] Cross-user check: user A's `/applications` page does not show user B's rows; user A cannot insert an outcome against user B's application_id
* [ ] Recruiting Lens analyze produces a `job_descriptions` row with `key_requirements[]` populated within 60s
* [ ] Documented prediction-readiness SQL query returns median comparison on a staging dataset of ≥50 applications + ≥10 outcomes per bucket, runtime <500ms
* [ ] User account deletion cascades through `applications` → `outcomes` and `job_descriptions` (post-delete count = 0 for that user)
* [ ] `npm test` and existing Recruiting Lens flow pass with no regression
* [ ] `src/integrations/supabase/types.ts` regenerated; `npm run build` and `npm run lint` pass
* [ ] Documented down-migration SQL exists (drops tables in reverse FK order, removes pg_cron job, re-creates `saved_jobs` from `applications WHERE status='saved'`)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                              |
| ------------------- | ----- | ----- | ------ | ---------------------------------------------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | 4 tables, UI surface, status lifecycle, prediction query all locked                |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | In-app only, no model, no email, raw JD retention deferred to L5                   |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | Atomic backfill, sample_size threshold, aggregate-RLS exception, idempotency       |
| Acceptance Criteria | 0.85  | 0.70  | ✓      | 17 falsifiable checkboxes including cross-user + idempotency negatives             |
| **Ambiguity**       | 0.11  | ≤0.20 | ✓      | Well below gate                                                                    |

## Interview Log

| Round | Perspective     | Question summary                                                  | Decision locked                                                                                                          |
| ----- | --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | Researcher      | Relationship of `applications` to existing `saved_jobs`           | Subsume `saved_jobs` into `applications` with a `status` field; drop `saved_jobs` atomically after backfill              |
| 2     | Simplifier      | Outcome-reporting nudge mechanism                                 | In-app dashboard banner only; no email this phase                                                                        |
| 3     | Boundary Keeper | Applications page MVP UI scope                                    | Manual table + auto-create from Recruiting Lens + dashboard outcome-banner (ships full SC set)                           |
| 3     | Boundary Keeper | Benchmark recompute cadence + scope                               | Nightly pg_cron, all cohorts with sample_size ≥ 5; aligns with Layer 5 sweep schedule                                    |

---

# Layer 5: Lifecycle — Storage Refs + Archival Policy

**Created:** 2026-05-24
**Scope within merged phase:** Layer 5 of 5 (Lifecycle)
**Depends on:** Layer 2 (resume_versions / scores must exist before retention sweeps raw responses), Layer 3 (behavior tracking landed — knows what's load-bearing), Layer 4 (outcomes landed — does not archive data prediction layer needs)
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 4 locked
**Provisional REQ-ID buckets:** DB-LIF-*, DB-RET-*, DB-STO-*

## Goal

Enforce a "store deeply / store lightly / archive or delete" lifecycle across every inline-blob in the database. Move raw AI responses, the LinkedIn PDF text, and (post-Layer-2) `resumes.grading_data` from inline columns to either references (Supabase Storage) or scheduled deletion. Set concrete retention windows: AI responses archive at 30d / delete at 90d; raw PDFs archive immediately once `resume_versions` exists; transcripts drop at 7d unless flagged. Ship a single nightly pg_cron sweep that enforces the policy idempotently and logs every action. Backfill existing rows in scope. Includes `analysis_cache.raw_response` (cache TTL respected first — sweep runs only after Phase 29 cache lifecycle is satisfied).

## Background

**Current state (inline-blob inventory verified via migrations grep):**

* `resumes.grading_data jsonb` — full AI response per resume row (user-scoped, RLS via `resumes.user_id`)
* `linkedin_grades.grading_data jsonb` — full AI response per LinkedIn profile (GLOBAL — anyone-can-read cache)
* `analysis_results.raw_response jsonb` — full raw response per analyze run (user-scoped)
* `analysis_cache.raw_response jsonb` — full raw response cached for replay (user-scoped, Phase 29 cache substrate; has its own hit_count / last_hit_at lifecycle)
* `profiles.linkedin_pdf_content text` — full extracted LinkedIn PDF text inline on `profiles`
* `interview_quizzes.star_answer jsonb`, `interview_quiz_answers.scoring_breakdown jsonb` — interview transcripts (paused on prod per Phase 47)
* Storage buckets: `resumes/` (user-folder RLS, holds uploaded PDFs already) and `public-assets/`
* No retention policy, no pg_cron sweep, no archive tier

**Why this layer matters:** Without retention, the DB grows unbounded with full AI payloads — a Pro-tier user with 100 analyses/month produces hundreds of KB of inline jsonb that becomes redundant once Layer 2 structured signals are extracted. Layer 5 also closes the cost-regression loop for Layer 4's prediction queries (smaller hot tables → faster query plans).

## Requirements

1. **DB-STO-01 — Storage migration for inline blobs**: Move raw AI responses + LinkedIn PDF text to Supabase Storage.
   * Current: Five inline-blob columns (above) hold full payloads in Postgres. Resume PDFs already live in `resumes/` Storage bucket; `resumes.file_url` references them.
   * Target: Create a new Storage bucket `ai-archives/` with per-user folder RLS (mirror `resumes/` bucket policy: `auth.uid()::text = (storage.foldername(name))[1]`). Add nullable `archive_path text` columns to: `resumes`, `linkedin_grades`, `analysis_results`, `analysis_cache`, `interview_quizzes`, `interview_quiz_answers`. Add `archive_path text` column to `profiles` for `linkedin_pdf_content`. When a row is archived (per DB-RET-01), the writer: (a) uploads the jsonb/text payload as a gzipped object to `ai-archives/{user_id}/{table}/{row_id}.json.gz`, (b) sets `archive_path` to the Storage path, (c) NULLs the inline column. Frontend readers fall through: if inline column NULL and `archive_path` set, fetch from Storage on demand.
   * Acceptance: `ai-archives` bucket exists with per-user RLS; `archive_path` column added to all 7 tables (additive, nullable, idempotent); archiving a row uploads the gzipped payload, sets `archive_path`, NULLs the inline column; on-demand re-read from Storage returns the same payload (round-trip verified); cross-user check: user A cannot read user B's `ai-archives/` objects.

2. **DB-RET-01 — Retention windows + sweep behavior**: Concrete N/M day windows per data class, idempotent sweep.
   * Current: No retention policy.
   * Target: Documented policy table:
     | Data class                               | Archive at | Delete at | Conditions                                          |
     |------------------------------------------|------------|-----------|-----------------------------------------------------|
     | `analysis_results.raw_response`          | 30d        | 90d       | iff matching `resume_versions` / `linkedin_versions` row exists (Layer 2 extracted) |
     | `resumes.grading_data`                   | 30d        | 90d       | iff matching `resume_versions` row exists (post-Layer-2 superseded path) |
     | `linkedin_grades.grading_data`           | 30d        | 90d       | iff ≥1 `linkedin_versions` row references this `linkedin_grades.id`     |
     | `profiles.linkedin_pdf_content`          | archive at 30d post-upload, delete at 180d | always — raw PDF text is high-cost, low-recovery-value |
     | `analysis_cache.raw_response`            | sweep only AFTER cache TTL satisfied — `created_at < now() - interval '30 days'` AND `last_hit_at < now() - interval '7 days'`; archive then; delete at 90d | respects Phase 29 cache hit-rate KPIs |
     | `interview_quizzes.star_answer`, `interview_quiz_answers.scoring_breakdown` | drop at 7d unless `interview_streaks.last_quiz_date > now() - interval '7 days'` (active user) | IPC paused on prod; safe to be aggressive |

     Sweep behavior: idempotent (safe to re-run mid-sweep), emits one structured log line per (table, action, row_count, byte_count) per run, never archives or deletes rows that violate the conditions.
   * Acceptance: Policy documented in migration COMMENT and in `.planning/phases/42-…/retention-policy.md`; running the sweep function on staging twice in a row produces identical end state (idempotent verified); on a synthetic dataset of (a) old rows with matching version rows, (b) old rows without version rows, (c) cache rows still within TTL — only (a) is archived; (c) is skipped.

3. **DB-LIF-01 — Nightly pg_cron lifecycle sweep**: Single scheduled job applying the policy.
   * Current: No lifecycle cron exists.
   * Target: A pg_cron job `lifecycle_sweep_nightly` (planner-discretion time slot, e.g., 04:00 UTC after `benchmarks_nightly`) that calls a SECURITY-DEFINER pl/pgsql function `run_lifecycle_sweep()`. The function iterates the policy table in DB-RET-01, archives + deletes per the conditions, emits structured logs via `RAISE NOTICE`. Returns a JSONB summary with per-class action counts.
   * Acceptance: pg_cron job exists (`SELECT * FROM cron.job WHERE jobname = 'lifecycle_sweep_nightly'`); manual `SELECT run_lifecycle_sweep()` returns a JSONB summary; subsequent invocations show 0 actions on the same data (idempotent); structured log lines visible in Supabase function logs.

4. **DB-LIF-02 — Backfill of existing rows + cost regression test**: One-shot migration applies the retention policy to legacy data, byte-size delta measured.
   * Current: All historical inline blobs untouched.
   * Target: Migration runs `SELECT run_lifecycle_sweep()` immediately after DB-RET-01 + DB-LIF-01 land, applying the policy to all historical rows in a single transaction-safe pass. Optionally chunked by `LIMIT 1000` per outer loop if total row count >10K. **Cost regression test**: capture `pg_database_size()` and per-table `pg_total_relation_size()` for the 7 affected tables before and after; document the delta in the migration COMMENT + `.planning/phases/42-…/storage-cost-regression.md`. Storage bucket size (`SELECT sum((metadata->>'size')::bigint) FROM storage.objects WHERE bucket_id='ai-archives'`) captured post-backfill.
   * Acceptance: Backfill completes without error on staging (any duration acceptable); post-backfill `pg_database_size()` is strictly less than pre-backfill (any positive delta acceptable — empty cache hits are excluded by TTL guard); `ai-archives` bucket size > 0; cost-delta document committed under `.planning/`; user-initiated account delete on a backfilled user cascades to remove both DB rows AND `ai-archives/{user_id}/**` objects (Storage CASCADE via signed delete in the deletion handler — verifiable by post-delete `SELECT count(*) FROM storage.objects WHERE name LIKE '{user_id}/%'` = 0); GDPR export (existing flow) includes `archive_path` references and resolves them on export.

## Boundaries

**In scope:**

* `ai-archives/` Storage bucket + per-user RLS policies
* `archive_path` column additions to 7 tables (additive, nullable)
* SECURITY-DEFINER `run_lifecycle_sweep()` function implementing the DB-RET-01 policy
* `lifecycle_sweep_nightly` pg_cron job
* One-shot backfill invocation as part of the Layer 5 migration
* Documented retention policy in COMMENT + `.planning/` storage-cost-regression note
* Frontend fall-through reader update for `archive_path` (when inline is NULL, fetch from Storage)
* Account-delete extension: cascade Storage objects under `ai-archives/{user_id}/**`
* TypeScript types regeneration

**Out of scope:**

* Cross-user de-duplication of stored blobs
* CDN tuning for Storage downloads
* Analytics on what was archived vs deleted (could be a follow-up internal tool)
* User-facing "view archived response" UI (frontend falls through transparently; no special UI surface)
* Migration of `resumes/` bucket contents (already in Storage; out of scope)
* Public-asset bucket modifications
* Restoring deleted (>90d) rows — design accepts deletion as terminal

## Constraints

* **Cache TTL respect**: `analysis_cache` rows are NOT archived until `created_at < now() - interval '30 days'` AND `last_hit_at < now() - interval '7 days'`. Phase 29 cache hit-rate KPIs must not regress measurably (>5% absolute hit-rate drop is a blocker).
* **Layer 2 dependency**: `analysis_results.raw_response` and `resumes.grading_data` only archived if a matching `resume_versions` row exists. Without Layer 2, sweep skips them.
* **Layer 4 dependency**: `job_descriptions` rows (Layer 4) are NEVER archived or deleted — they're load-bearing for prediction queries. Sweep excludes the table explicitly.
* **Idempotency**: every sweep action checks current state before acting. Re-running the sweep on identical data produces zero new actions.
* **Per-row size budget for archive upload**: archived objects are gzipped jsonb/text. Expected median size ~3-10KB compressed. No size cap; pathological rows (>1MB compressed) log a warning but still archive.
* **Fall-through reader**: any frontend or edge function that reads an inline-blob column must handle NULL + `archive_path` fall-through — verify `analyze-resume` cache lookup, Results page render, AnalysisHistory list, GDPR export.
* **Atomic backfill OR resumable**: backfill either completes in the migration transaction or is checkpoint-resumable. Partial-completion state is documented and recoverable.
* **PII contract**: archived objects in Storage inherit the same user-PII tier as the original column. User account deletion CASCADEs to both DB rows AND `ai-archives/{user_id}/**` Storage objects.

## Acceptance Criteria

* [ ] `ai-archives` Storage bucket exists with per-user-folder RLS (INSERT/SELECT/DELETE policies mirror `resumes` bucket pattern)
* [ ] `archive_path text NULL` column added to `resumes`, `linkedin_grades`, `analysis_results`, `analysis_cache`, `interview_quizzes`, `interview_quiz_answers`, `profiles`
* [ ] DB-RET-01 policy table committed to `.planning/phases/42-…/retention-policy.md` and migration COMMENT
* [ ] `run_lifecycle_sweep()` function exists; manual invocation returns a JSONB summary
* [ ] `lifecycle_sweep_nightly` pg_cron job scheduled
* [ ] On a synthetic dataset (old rows with version-row match, old rows without, cache rows in TTL), sweep archives only the eligible class
* [ ] Re-running sweep on the same data produces 0 new actions (idempotent)
* [ ] After backfill, `pg_database_size()` is strictly less than pre-backfill
* [ ] After backfill, `ai-archives` bucket has > 0 objects; storage-cost delta documented under `.planning/`
* [ ] Cross-user Storage check: user A cannot list, read, or delete user B's `ai-archives/` objects
* [ ] Cache hit-rate regression test (Phase 29 / 37 cache suite) shows ≤5% absolute drop
* [ ] Fall-through readers verified on Results page, AnalysisHistory, GDPR export — display works when inline column is NULL + `archive_path` is set
* [ ] User account deletion cascades to both DB rows AND `ai-archives/{user_id}/**` Storage objects (post-delete object count = 0 for that user_id prefix)
* [ ] `job_descriptions` rows (Layer 4) are explicitly skipped by the sweep (verifiable by source code grep + sweep-summary log)
* [ ] `npm test` and Phase 37 cache hit-rate suite pass
* [ ] `src/integrations/supabase/types.ts` regenerated; `npm run build` and `npm run lint` pass
* [ ] Documented down-migration SQL exists (drops cron job, removes `archive_path` columns; archived data restoration is documented as a separate operator runbook)

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                                |
| ------------------- | ----- | ----- | ------ | ------------------------------------------------------------------------------------ |
| Goal Clarity        | 0.92  | 0.75  | ✓      | Storage bucket, archive_path columns, policy table, sweep function all locked        |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | `job_descriptions` excluded; cache TTL respected; no UI surface                      |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | Cache hit-rate budget, Layer 2 / 4 dependencies, idempotency, fall-through readers   |
| Acceptance Criteria | 0.75  | 0.70  | ✓      | 17 falsifiable checkboxes including cost-regression measurement                      |
| **Ambiguity**       | 0.15  | ≤0.20 | ✓      | Below gate                                                                           |

## Interview Log

| Round | Perspective     | Question summary                                                | Decision locked                                                                                                              |
| ----- | --------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | Researcher      | Retention scope: which inline blobs are in scope?               | Everything inline-blob, INCLUDING `analysis_cache` (with cache-TTL guard)                                                    |
| 3     | Boundary Keeper | Concrete retention windows                                      | AI responses: archive 30d / delete 90d. Raw PDFs: archive once `resume_versions` exists. Transcripts: drop 7d unless flagged |

---

*Phase: 42-database-foundation-users-career-targets (consolidated 5-layer)*
*Spec created: 2026-05-05 (Layer 1) · 2026-05-24 (Layers 2–5 appended)*
*Next step: /gsd-discuss-phase 42 — Layer 1 CONTEXT.md already exists; discuss-phase will detect SPEC.md update and gather implementation context for Layers 2–5 (parser worker shape, RPC patterns, sweep function design, applications UI layout, etc.)*
