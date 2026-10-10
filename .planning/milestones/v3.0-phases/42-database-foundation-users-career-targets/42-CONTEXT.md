# Phase 42: Database Foundation — Lean Intelligence Layer (5 Layers) — Context

**Gathered:** 2026-05-24 (Layer 1) · 2026-05-25 (Layers 2–5 appended)
**Status:** Ready for planning
**Spec:** `42-SPEC.md` (32 locked REQ-IDs across 5 layers: DB-USR-01..06 / DB-TGT-01..02 / DB-VER-01..04 / DB-SEC-01 / DB-BUL-01 / DB-SCR-01 / DB-REC-01..02 / DB-EDT-01..03 / DB-USE-01 / DB-APP-01..02 / DB-OUT-01..02 / DB-JD-01 / DB-BMK-01..02 / DB-LIF-01..02 / DB-RET-01 / DB-STO-01 — combined ambiguity 0.08–0.16 per layer)

<domain>
## Phase Boundary

Stand up Strivo's lean intelligence database across 5 sequential layers — pivots the platform from "resume/LinkedIn grader" to "career outcome prediction engine."

**Layer 1 — Users + Career Targets (specced + decided 2026-05-24):** `profiles` education columns + `career_targets` table + backfill + drop legacy + cohort indexes + `cohort_peers` view + `Profile.tsx` capture UI + read-path migration + dashboard backfill banner.

**Layer 2 — Resume + LinkedIn Structured Versioning:** `resume_versions / resume_sections / resume_bullets / linkedin_versions / scores` tables (alongside existing `resumes` / `linkedin_grades`) + async parser worker that fans out from `analysis_results.raw_response` to structured rows. No prompt/model changes.

**Layer 3 — Behavior + Improvement Tracking:** `recommendations / user_edits / feature_usage` tables + SECURITY-DEFINER RPCs (`record_recommendations_shown`, `record_feature_usage`) + accept/reject/edit UI on 4 features (Resume, LinkedIn, Career Compass, Recruiting Lens — IPC excluded per Phase 47).

**Layer 4 — Outcomes + Predictions Foundation:** `applications` (subsumes `saved_jobs`) + `outcomes` + `job_descriptions` (lean signals, no raw text) + `benchmarks` (nightly pg_cron percentile rollup, sample_size ≥ 5) + new `/applications` page + dashboard overdue banner. In-app banner nudges only.

**Layer 5 — Lifecycle: Storage Refs + Archival:** new `ai-archives/` Storage bucket + `archive_path` columns on 7 tables + `run_lifecycle_sweep()` SECURITY-DEFINER function + `lifecycle_sweep_nightly` pg_cron + backfill of historical rows. Retention windows: AI responses archive 30d / delete 90d; raw PDFs archive once `resume_versions` exists; transcripts drop 7d. `job_descriptions` explicitly skipped (load-bearing for predictions).

**Layers are sequential** — L1 → L2 → L3 → L4 → L5 — decompose into per-layer plans/waves during `/gsd-plan-phase 42`.

Scope creep belongs in a future v4.0 milestone (prediction model, employer-side, leaderboards) or follow-up phases (version-history UI, behavior dashboards).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**32 requirements are locked.** See `42-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `42-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md, all 5 layers combined):**
- L1: profiles education columns, career_targets table, backfill+drop, cohort indexes, `cohort_peers` view, Profile.tsx Education & Targets section, Onboarding/CareerCompass cutover, dashboard backfill banner
- L2: 5 new tables (resume_versions/sections/bullets, linkedin_versions, scores), async parser worker, improvement-over-time query template
- L3: 3 new tables (recommendations, user_edits, feature_usage), 2 RPCs, accept/reject/edit UI on 4 features
- L4: 4 new tables (applications, outcomes, job_descriptions, benchmarks), atomic saved_jobs→applications cutover, /applications page (manual + auto-create + dashboard banner), nightly benchmarks pg_cron, prediction-readiness SQL
- L5: ai-archives Storage bucket, archive_path columns on 7 tables, run_lifecycle_sweep() + lifecycle_sweep_nightly pg_cron, backfill + cost-regression measurement, Storage cascade on account delete

**Out of scope (from SPEC.md):**
- Prediction model / inference layer (future milestone)
- Net-new onboarding step for education/targets (Profile.tsx + banner only)
- Email-based outcome nudges (in-app only this phase)
- Interview Prep instrumentation (paused per Phase 47)
- Cross-user data sharing UX, leaderboards
- AI prompt/model changes
- User-facing version-history UI, behavior dashboards
- Verified/imported outcome sources beyond `self_reported`
- Cross-user dedup of stored blobs, CDN tuning
- `experience_level`, `job_type_preference`, `linkedin_url`, `preferred_locations[]` migration — stay on `profiles`
- `linkedin_pdf_*` orthogonal columns

</spec_lock>

<decisions>
## Implementation Decisions

### Layer 1 — Users + Career Targets (carried forward from 2026-05-24 discuss-phase pass; unchanged)

#### Migration file structure
- **Single atomic migration file** packaging all SQL: ADD profile columns → CREATE `career_targets` + RLS policies + trigger → INSERT backfill (with `ON CONFLICT (user_id) DO NOTHING`) → DROP legacy `profiles.target_roles` + `profiles.career_interests` → CREATE indexes + `cohort_peers` view.
- **Verification DO `$$` block** at end mirrors the Phase 29 pattern (`20260512000001_resumes_extracted_text.sql`): asserts the 5 new `profiles` columns exist + nullable, `career_targets` exists with 9 cols + `UNIQUE(user_id)` + 3 RLS policies (SELECT/INSERT/UPDATE on `auth.uid() = user_id`), 3 indexes (`idx_profiles_cohort_key`, `idx_career_targets_industries_gin`, `idx_career_targets_roles_gin`), `cohort_peers` view present, legacy columns absent. Raises `EXCEPTION` on mismatch.
- **Down-migration SQL** lives as a clearly-fenced comment block at the top of the same forward `.sql` file. Single source-of-truth, no extra file.
- File ships in the **same PR** as the frontend cutover (per SPEC atomicity constraint — no zombie state).

#### TypeScript types regeneration
- Run `supabase gen types typescript --linked > src/integrations/supabase/types.ts` locally after the migration applies to staging.
- Commit the regenerated `types.ts` + any required updates to `src/types/database.ts` in the same PR.

#### Profile.tsx save coordination
- **Sequential `Promise.all([updateProfiles, upsertCareerTargets])`** with partial-failure toast.
- Matches existing `Profile.tsx` save error-handling style (lines 207–236). No new RPC.
- `career_targets` write uses `supabase.from('career_targets').upsert({...}, { onConflict: 'user_id' })`.

#### Reader pattern for `career_targets`
- Create a shared **`useUserTargets()` hook** (likely `src/hooks/useUserTargets.ts`) returning `{ profile, targets, loading, error, refresh }` from `Promise.all([profiles select, career_targets select])`.
- Reused by `Onboarding.tsx`, `CareerCompass.tsx`, `Profile.tsx`, and any future consumer.
- The `cohort_peers` view is **not** the general reader — it filters `WHERE school IS NOT NULL`. Reserved for downstream Layer 2–5 benchmarking only.

#### Backfill banner mount + visual
- **Mounted at the top of `Dashboard.tsx`** (above the feature grid) only.
- **Visual:** shadcn `<Alert>` with icon, SPEC copy verbatim, primary "Add details" button → `/profile#education-targets`, and an `X` dismiss button.
- **Dismiss key:** `localStorage` key `cohort_backfill_banner_dismissed_v1`.

#### Deep-link from banner → Profile section
- URL hash + `scrollIntoView`: banner CTA links to `/profile#education-targets`. `Profile.tsx` wraps the new section in `<div id="education-targets">`. `useEffect` on mount reads `window.location.hash`; scrolls + focuses first input.

#### Onboarding write path
- `Onboarding.tsx` continues collecting `target_roles[]` + `career_interests[]` (no UI change to the form). At save: **upsert into `career_targets`** instead of writing to `profiles.target_roles` / `profiles.career_interests`.

#### Cutover safety
- After migration: `grep -rn "target_roles\|career_interests" src/ supabase/functions/` to find every reference; migrate each caller.
- Add a one-line grep guard either in the deploy script or as a plan-level pre-deploy check.

---

### Layer 2 — Resume + LinkedIn Structured Versioning (new, 2026-05-25)

#### Async parser worker — trigger mechanism
- **Webhook from `analyze-resume` / `grade-linkedin` after response returns to client.** Edge function awaits the user-facing response (preserves Phase 37 latency budget), then fires a fire-and-forget `fetch` to a new edge function (working name `extract-analysis-structure`) with `{ analysis_results_id, feature }` payload. Worker handles its own auth via `INTERNAL_JOB_SECRET` (mirrors `process-resume-analysis-job` pattern).
- Lag target: ≤5s happy path, ≤60s SLA per SPEC DB-VER-03.

#### Async parser worker — catchup mechanism (caller-crash insurance)
- **`extract_catchup_nightly` pg_cron job every 15 minutes** scans `analysis_results` rows older than 5 minutes that have no matching `resume_versions` / `linkedin_versions` row and re-fires the webhook for each. Worst-case lag bounded to ~15 min. Mirrors `keep-warm` pg_cron precedent (`20260310000000_*.sql`).
- pg_cron HTTP webhook call uses `net.http_post` (Supabase standard) with the same `INTERNAL_JOB_SECRET` header.

#### Async parser worker — one function for both feature paths
- **Single edge function `extract-analysis-structure`** routes on `feature` payload: `resume_analysis` → fan out to `resume_versions / sections / bullets / scores`; `linkedin_grading` → fan out to `linkedin_versions / scores`. Internal helpers split by feature. Single deploy, single observability surface.

#### Idempotency
- Worker uses `INSERT … ON CONFLICT (user_id, source_analysis_results_id) DO NOTHING` semantics — add `source_analysis_results_id uuid REFERENCES analysis_results(id)` to `resume_versions` and `linkedin_versions` to support natural-key dedup. Re-firing the webhook (or pg_cron catchup) on an already-extracted row is a no-op.

#### `supersedes_id` population
- On insert: `supersedes_id = (SELECT id FROM resume_versions WHERE user_id = $user AND resume_id = $resume ORDER BY created_at DESC LIMIT 1)` — set inside the worker before INSERT. NULL on first version.

#### `linkedin_grades` ↔ `linkedin_versions` relationship
- Worker writes to BOTH on every `grade-linkedin` run: existing `linkedin_grades` upsert (cross-user cache, unchanged) AND new `linkedin_versions` row (user-scoped) with `linkedin_grade_id` FK populated. Second user grading the same profile_identifier reuses the existing `linkedin_grades.id` (cache hit) but gets their own `linkedin_versions` row.

#### `scores` table polymorphic FK
- No DB FK on `version_id` (polymorphic). Worker enforces validity at write time (asserts `version_id` resolves in the right table based on `version_type`). RLS policy uses a SECURITY-DEFINER helper `auth_owns_version(version_id uuid, version_type text)` that does the appropriate join.

#### Improvement-over-time SQL query
- Documented query template lives in `.planning/phases/42-…/queries/improvement-over-time.sql`. Operator-runnable on staging; not exposed via UI this phase.

#### Failure isolation
- Worker errors logged via `_shared/logger.ts` structured logger; never propagate to caller. Parent `analyze-resume` / `grade-linkedin` returns success regardless.

#### Claude's Discretion (L2)
- Exact pg_cron schedule slot for `extract_catchup_nightly` (planner picks; aligns with existing cron expressions).
- Internal helper organization within `extract-analysis-structure/index.ts` (`extract-resume.ts`, `extract-linkedin.ts` modules vs. single file).
- Specific indexes beyond SPEC minimum (`idx_resume_versions_user_resume_created`, `idx_linkedin_versions_user_created`, `idx_resume_bullets_section`) — planner adds if EXPLAIN reveals need.
- SECURITY-DEFINER vs. inline RLS predicate for `scores` table — planner picks based on staging EXPLAIN.

---

### Layer 3 — Behavior + Improvement Tracking (new, 2026-05-25)

#### Accept/Reject/Edit UI primitive
- **Shared `<RecommendationActions>` component** at `src/components/recommendations/RecommendationActions.tsx`. Props: `{ recommendation: Recommendation, onAction: (action, finalText?) => void }`. Renders three buttons (✓ Accept / ✗ Reject / ✎ Edit) using lucide-react icons + shadcn `<Button variant="ghost" size="sm">`. ✎ Edit opens an inline `<Textarea>` + Save/Cancel.
- Mounted on every visible suggestion across all 4 Results pages (Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens). Interview Prep Results page does NOT import this component (gated per Phase 47).
- Single styling/behavior surface; reduces drift risk vs. per-feature wrappers.

#### `recommendations` write source
- **Same worker that does Layer 2 fan-out** (`extract-analysis-structure`) also writes `recommendations` rows. One batch INSERT per analyze run (typically 3–15 rows). `target_ref_id` resolves to the just-created `resume_bullets.id` / `resume_sections.id` / `resume_versions.id` based on `target_ref_type`.

#### `shown_at` RPC
- **SECURITY-DEFINER RPC `record_recommendations_shown(rec_ids uuid[])`** updates `shown_at = now() WHERE shown_at IS NULL AND user_id = auth.uid() AND id = ANY(rec_ids)`. Idempotent (`WHERE shown_at IS NULL`). Frontend Results page calls it once on first paint via `useEffect`.

#### `user_edits` write path
- Frontend `<RecommendationActions>` callback writes directly to `user_edits` via Supabase client — RLS-friendly INSERT scoped by `recommendations.user_id` join (table has RLS chain on parent). Failures: console error + sonner toast, no user-blocking modal. `score_before` / `score_after` source from `resume_bullets.bullet_score` (read at action time).

#### `feature_usage` writes
- **SECURITY-DEFINER RPC `record_feature_usage(feature text, action text)`** called immediately on every event (no batching, no debouncing). 4 events × 4 features = ~4 writes per analyze flow. Acceptable volume; simplest path.
- Frontend instrumentation lives in a tiny hook `useFeatureUsage(feature)` that exposes `recordEvent(action)`; each Results page / analyze flow imports it.

#### Privacy / deletion contract
- `original_text` / `suggested_text` / `final_user_text` documented as user-PII tier in migration COMMENT. CASCADE chain: `auth.users` → `recommendations` → `user_edits`. GDPR export picks up automatically. No explicit "purge my behavior trail" UI this phase.

#### Claude's Discretion (L3)
- Exact button visuals / icon choices for `<RecommendationActions>` — match existing shadcn aesthetic; planner picks per UI-SPEC if one materializes, otherwise inline.
- Whether `useFeatureUsage` hook batches its own internal calls (e.g., dedupe rapid double-fires) — planner can add if telemetry noise warrants.
- Exact column placement for `target_ref_type` enum widening if more types emerge (currently `bullet | section | version | generic`).

---

### Layer 4 — Outcomes + Predictions Foundation (new, 2026-05-25)

#### `saved_jobs` → `applications` cutover
- **Atomic backfill + drop in a single migration file**, mirroring Layer 1 DB-USR-02 pattern. Sequence inside the migration: CREATE applications + RLS + indexes → INSERT FROM saved_jobs (status='saved', preserve created_at) → DROP TABLE saved_jobs → verification `DO $$` block.
- Frontend cutover (any reads/writes of `saved_jobs` → `applications`) ships in the **same PR**. Zero zombie state.
- Down-migration SQL re-creates `saved_jobs` from `applications WHERE status='saved'` — fenced comment block at the top of the forward migration.

#### Recruiting Lens auto-create
- **`applications` row inserted synchronously inside `recruiting-lens` edge function** right after the response is computed, before returning to the client. Same edge function also writes the `job_descriptions` row (or hands it to the Layer 2 worker — see below). Dedup: `INSERT … ON CONFLICT (user_id, jd_id) DO NOTHING`.
- `jd_id` populated by either (a) the just-created `job_descriptions.id` if recruiting-lens writes inline, or (b) NULL if Layer 2 worker handles it (then backfilled by the worker on next run).

#### `job_descriptions` write source
- Written by the Layer 2 async worker (`extract-analysis-structure`) when feature=`recruiting_lens`. Same async pattern as resume/linkedin structured rows. Recruiting Lens edge function inserts the `applications` row with `jd_id = NULL`; worker backfills `applications.jd_id` after creating the `job_descriptions` row (or worker creates both atomically and the synchronous insert is a placeholder — planner picks the cleaner path).

#### `benchmarks` rollup function
- **SECURITY-DEFINER pl/pgsql function `run_benchmarks_rollup()`** computes percentiles per (cohort_key, metric) from `cohort_peers` joined with `scores` / `outcomes`. Filters `sample_size >= 5`. Upserts into `benchmarks` with UNIQUE on `(cohort_key, metric, computed_at::date)` to prevent same-day duplicates.
- Called nightly by pg_cron job `benchmarks_nightly` (planner picks time slot — likely 03:00 UTC aligned with `keep-warm` precedent).

#### `/applications` page UI
- New route at `src/pages/Applications.tsx`. Table built on existing shadcn `<Table>` + `<TableRow>` primitives. Columns: Company | Role | Status (dropdown) | Application date | Source | Outcome (CTA → opens modal).
- "Add application" opens a shadcn `<Dialog>` with a form (`react-hook-form` + `zod`). "Report outcome" opens a separate `<Dialog>` with the outcomes-table fields.
- Dashboard outcome-banner: data source is a client-side query against `applications` + `outcomes` LEFT JOIN filtered to `application_date < now() - interval '14 days'` AND `outcomes.id IS NULL`. Planner can convert to a VIEW or RPC if perf demands.
- Status dropdown writes directly to `applications.status` via Supabase client.

#### `outcomes` UNIQUE + upsert
- `outcomes.application_id UNIQUE` enforces 1:1. Frontend uses `upsert({ ... }, { onConflict: 'application_id' })` so re-reporting an outcome updates in place.

#### Aggregate-data RLS exception (`benchmarks`)
- `benchmarks` SELECT policy allows all authenticated users (`USING (true)` scoped to `TO authenticated`). No write policy (service role only via `run_benchmarks_rollup`). Documented in migration COMMENT as a justified exception (aggregate data, sample_size ≥ 5 protects against de-anonymization).

#### Claude's Discretion (L4)
- Exact mount point of the dashboard outcome-banner relative to the Layer 1 backfill banner (likely stacked above the feature grid; planner picks order based on staging UX).
- Dashboard banner data-source pattern: client-side LEFT JOIN vs. dedicated VIEW `applications_overdue` vs. SECURITY-DEFINER count RPC — planner picks based on perf / readability tradeoff.
- Exact cohort_key delimiter / canonicalization rules — planner picks (e.g., lowercase, trim, `|`-joined).
- Whether `application_source` enum gets a `'manual'` value or stays open-ended (`text` with a CHECK list).

---

### Layer 5 — Lifecycle: Storage Refs + Archival (new, 2026-05-25)

#### Fall-through reader pattern
- **Service-side resolver in `_shared/archive-reader.ts`** — shared helper imported by every edge function that reads an inline-blob column. Signature: `readWithArchiveFallback(client, table, rowId, inlineColumn, archivePathColumn) → Promise<jsonb | string>`. If `archive_path` is NULL or inline column is non-NULL → return inline. If inline NULL + archive_path set → `supabase.storage.from('ai-archives').download(path)`, gunzip, parse, return.
- Edge functions touched: `analyze-resume` (resumes.grading_data on cache reuse path), `recruiting-lens` (analysis_results.raw_response), `get-analysis-job-status` (analysis_cache.raw_response), `admin-delete-user` (for GDPR export inclusion). Planner enumerates exhaustively.
- Frontend reads via these edge functions, so frontend code unchanged — no signed URL exposure to clients.

#### Archive object format
- Gzipped JSON per row. Path: `ai-archives/{user_id}/{table}/{row_id}.json.gz`. One file = one row. Predictable, easy to delete on cascade, no batch-extraction needed for fall-through.

#### Storage cascade on account delete
- **Extend existing `admin-delete-user` edge function.** Add a step before `auth.users` delete: enumerate `supabase.storage.from('ai-archives').list('{user_id}/', { limit: 1000, ... })` recursively, then bulk `.remove(paths)`. Synchronous (function already runs to completion); user delete blocks until Storage cleanup succeeds.
- Test: after `admin-delete-user`, `SELECT count(*) FROM storage.objects WHERE bucket_id='ai-archives' AND name LIKE '{user_id}/%'` = 0.

#### `analysis_cache.raw_response` TTL guard
- Sweep checks `created_at < now() - interval '30 days' AND last_hit_at < now() - interval '7 days'` inline within `run_lifecycle_sweep()`. No new tombstone column. Phase 29 cache hit-rate KPI is the regression gate.

#### Backfill timing
- Backfill invocation runs inside the same migration file as `run_lifecycle_sweep()` creation. Chunked by `LIMIT 1000` outer loop if affected row count >10K (detected at migration time via `COUNT(*)`).
- Cost-regression measurement: capture `pg_database_size()` + per-table `pg_total_relation_size()` BEFORE backfill (in the migration), run backfill, capture AFTER. Output to `.planning/phases/42-…/storage-cost-regression.md` via NOTICE log (operator copies from logs into the markdown file).

#### `archive_path` column placement
- Additive `archive_path text NULL` on: `resumes`, `linkedin_grades`, `analysis_results`, `analysis_cache`, `interview_quizzes`, `interview_quiz_answers`, `profiles`. Idempotent `ADD COLUMN IF NOT EXISTS`. No default; NULL means "still inline."

#### `ai-archives` Storage bucket
- New private bucket `ai-archives` created via `INSERT INTO storage.buckets`. RLS policies mirror `resumes/` bucket pattern: per-user folder via `auth.uid()::text = (storage.foldername(name))[1]`. No public access.

#### `job_descriptions` skip
- `run_lifecycle_sweep()` explicitly skips the `job_descriptions` table (load-bearing for predictions per SPEC). Documented in the function body + sweep summary log.

#### Claude's Discretion (L5)
- Exact pg_cron schedule slot for `lifecycle_sweep_nightly` (likely 04:00 UTC after `benchmarks_nightly` to avoid contention).
- Whether `run_lifecycle_sweep()` is one monolithic function or composed of per-class helpers (`sweep_ai_responses()`, `sweep_pdfs()`, etc.) — planner picks based on testability.
- Whether the backfill runs in the same transaction as the migration or as a separate post-deploy operator step for very large legacy datasets.
- Gzip level (1–9) for archive uploads — planner picks (likely 6, default).
- Whether to add a `ai_archive_metadata` summary table for the sweep summary logs (vs. relying on Supabase function logs) — not required by SPEC.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 42 spec + planning
- `.planning/phases/42-database-foundation-users-career-targets/42-SPEC.md` — Locked requirements (32 REQ-IDs across 5 layers) — MUST read before planning
- `.planning/ROADMAP.md` §Phase 42 (lines 345–430) — Per-layer Goal / Success Criteria / Out-of-Scope authoritative reference

### Project-level
- `.planning/STATE.md` — Active milestone state + 2026-05-21 Phase 42 consolidation rationale (former 42–46 merge)
- `.planning/REQUIREMENTS.md` — REQ-ID traceability (Layer 1 mapped; Layers 2–5 use provisional buckets DB-VER/SEC/BUL/SCR/REC/EDT/USE/APP/OUT/JD/BMK/LIF/RET/STO)
- `.planning/PROJECT.md` — Current milestone scope

### Migration precedents to mirror
- `supabase/migrations/20260512000001_resumes_extracted_text.sql` — Phase 29 CACHE-03: section-commented additive ALTER + COMMENT ON COLUMN + verification `DO $$` block pattern. Authoritative model for all 5 layers' atomic migration files.
- `supabase/migrations/20260512000000_analysis_cache_table.sql` — Phase 29 CACHE-01: CREATE TABLE + RLS + indexes + verification pattern; documents the SELECT-own + service-role-writes-only RLS contract (no permissive write policies). Layer 2/3/4/5 tables follow this contract.
- `supabase/migrations/20260418000000_interview_prep_tables.sql` — Phase 19/23: CREATE TABLE IF NOT EXISTS + idempotent ALTER + DO $$ constraint guards pattern. Layer 4 `applications` status enum widening follows this pattern.
- `supabase/migrations/20251113102013_aa07c3f5-c7ff-4492-9a5b-6867ce76d3a7.sql` — `resumes/` Storage bucket precedent: per-user-folder RLS via `auth.uid()::text = (storage.foldername(name))[1]`. Layer 5 `ai-archives/` bucket mirrors this exactly.
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` — Existing pg_cron precedent for HTTP-webhook-on-schedule. Layer 2 `extract_catchup_nightly`, Layer 4 `benchmarks_nightly`, Layer 5 `lifecycle_sweep_nightly` all follow this shape.

### Code precedents to mirror
- `src/pages/Profile.tsx` lines 207–236 — save error-handling style (try/catch + sonner `toast.success` / `toast.error`, `setSaving(false)` in finally). Layer 1 Profile.tsx extension + Layer 4 Applications.tsx Add/Outcome modals follow this.
- `supabase/functions/_shared/logger.ts` — `createLogger(fn, reqId?)` structured-JSON logger. All new edge functions (`extract-analysis-structure`, RPCs) use this.
- `supabase/functions/_shared/auth.ts` — `requireAuth` / `requireInternalOrUserAuth` helpers. New edge functions reuse.
- `supabase/functions/process-resume-analysis-job/index.ts` — Internal job pattern (auth via `INTERNAL_JOB_SECRET`, structured error handling). Layer 2 `extract-analysis-structure` worker follows this pattern.
- `supabase/functions/admin-delete-user/` — Account deletion flow. Layer 5 extends this with `ai-archives/` Storage cascade.
- `src/integrations/supabase/types.ts` — Generated type mirror; regenerated after each layer's migration.

### Cross-phase dependencies
- `.planning/phases/29-foundation-infrastructure/` — Phase 29 cache substrate. Layer 2 worker reads `analysis_results.raw_response` which Phase 29 already established. Layer 5 must preserve Phase 29 cache hit-rate KPIs (≤5% absolute regression).
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-CONTEXT.md` — Phase 47 D-01..D-18: `VITE_FEATURE_INTERVIEW_PREP` gate. Layer 3 explicitly excludes IPC from accept/reject/edit instrumentation; Layer 5 retention windows for transcripts (`interview_quizzes.star_answer`, `interview_quiz_answers.scoring_breakdown`) are aggressive (7d) because IPC is paused on prod.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **shadcn `<Alert>`, `<Button>`, `<Dialog>`, `<Table>`, `<Textarea>`, `<Select>`** (already used across `Profile.tsx`, `Onboarding.tsx`, Results pages) — Layer 3 `<RecommendationActions>` + Layer 4 `<Applications>` page + Add/Outcome modals build on these.
- **`sonner` toast** (already used in `Profile.tsx`) — Layer 3 / 4 / 5 error surfacing.
- **`react-hook-form` + `zod`** (already used in Onboarding/Profile forms) — Layer 4 Add Application + Report Outcome modal validation.
- **`@/lib/supabaseClient`** singleton — every new client-side write/read uses this.
- **`_shared/logger.ts`** — `extract-analysis-structure` worker + Layer 4/5 pg_cron functions emit structured logs.
- **`_shared/auth.ts`** — `requireInternalOrUserAuth` reused for the new internal worker function.
- **`_shared/fetchWithTimeout.ts`** — already used; new fan-out webhook posts (`analyze-resume` → `extract-analysis-structure`) reuse this.
- **`useUserTargets()` hook** (planned in Layer 1 CONTEXT) — Layer 4 Applications.tsx page may use it for `target_industries[]` / `target_roles[]` reads (e.g., default values for "Add Application" form).
- **Layer 1 `cohort_peers` view + `idx_profiles_cohort_key` + GIN indexes** — Layer 4 `run_benchmarks_rollup()` joins through `cohort_peers` to compute cohort percentiles.
- **`linkedin_grades` table (global cache)** — Layer 2 `linkedin_versions.linkedin_grade_id` FK references it; preserves cross-user cache hit rate.

### Established Patterns
- **Atomic migration + verification block** (Phase 29 precedent) — every layer's migration follows this exact shape. Down-migration as fenced comment at top.
- **Service-role writes, SELECT-own RLS** (Phase 29 `analysis_cache` precedent) — Layers 2, 3, 4, 5 follow this for user-scoped tables. `benchmarks` is the documented exception (aggregate read).
- **Same-PR migration + frontend cutover** (Layer 1 DB-USR-02 atomicity) — Layer 4 `saved_jobs` → `applications` cutover follows this.
- **Frontend save: `Promise.all` + partial-failure toast** (Profile.tsx) — Layer 4 Add Application / Report Outcome modals + Layer 1 Education & Targets section.
- **Edge function internal auth via `INTERNAL_JOB_SECRET`** (process-resume-analysis-job) — Layer 2 worker + Layer 5 cron HTTP callers.
- **pg_cron HTTP webhook via `net.http_post`** (keep-warm precedent) — Layer 2 catchup + Layer 4 benchmarks + Layer 5 lifecycle sweep.
- **Idempotent migration semantics** (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT EXISTS`, `DO $$` guards) — every Layer's migration.
- **Localstorage banner-dismiss keys versioned** (`cohort_backfill_banner_dismissed_v1` precedent) — Layer 4 outcome-banner if it needs a dismiss surface follows the same naming.
- **shadcn `<Dialog>` for form-modal pattern** — Layer 4 Add Application + Report Outcome.

### Integration Points
- **`analyze-resume/index.ts`** — adds fire-and-forget webhook to `extract-analysis-structure` after successful response. No latency impact (post-response).
- **`grade-linkedin/index.ts`** — same webhook pattern.
- **`recruiting-lens/index.ts`** — same webhook pattern + synchronous `applications` insert (Layer 4 auto-create).
- **`get-analysis-job-status/index.ts`** + **`process-*-job/index.ts`** — read paths through `_shared/archive-reader.ts` for L5 fall-through.
- **`admin-delete-user/index.ts`** — adds `ai-archives/{user_id}/**` enumerate + bulk-delete step before auth.users delete.
- **`Dashboard.tsx`** — mounts Layer 1 backfill banner + Layer 4 outcome banner (stacked, planner picks order).
- **`Profile.tsx`** — Layer 1 Education & Targets section + `#education-targets` anchor.
- **`Onboarding.tsx`** — Layer 1 read/write cutover to `career_targets`.
- **`CareerCompass.tsx`** — Layer 1 read cutover to `career_targets`.
- **Every Results page** (`ResumeAnalysisResults`, `LinkedInGradeResults`, `CareerCompassResults`, `RecruitingLensResults`) — Layer 3 mounts `<RecommendationActions>` + `useFeatureUsage`.
- **New: `/applications` route** registered in `App.tsx`.
- **`src/integrations/supabase/types.ts`** — regenerated after each layer's migration.

</code_context>

<specifics>
## Specific Ideas

- **Migration filenames** follow the `YYYYMMDDHHMMSS_descriptive_name.sql` pattern: `2026MMDD000000_phase42_layer{N}_*.sql`. Five files, one per layer, applied in order. Each file is fully transactional + idempotent.
- **Layer 1 banner copy is locked verbatim by SPEC:** "Help us benchmark you — add your school, major, and graduation year."
- **Layer 1 dismiss-key is locked verbatim by SPEC:** `cohort_backfill_banner_dismissed_v1`.
- **Layer 1 `year` select options** locked: freshman / sophomore / junior / senior / graduate / other.
- **Layer 1 `graduation_year` select range** locked: 2024–2032.
- **Layer 1 `career_goals` textarea limit** locked: ≤500 chars.
- **Layer 2 worker path:** `supabase/functions/extract-analysis-structure/index.ts` (single function, dispatches on `feature` payload).
- **Layer 2 `linkedin_versions.linkedin_grade_id`** is a soft reference (nullable, FK) so a future global-cache deprecation doesn't break the FK chain.
- **Layer 3 `<RecommendationActions>` component path:** `src/components/recommendations/RecommendationActions.tsx`.
- **Layer 3 `useFeatureUsage` hook path:** `src/hooks/useFeatureUsage.ts` exposes `recordEvent(action: 'open'|'submit'|'view_results'|'export')`.
- **Layer 4 `/applications` route:** new file `src/pages/Applications.tsx`. Add `Applications` lazy-loaded route in `App.tsx`.
- **Layer 4 outcome banner copy:** "{N} application{N>1?s:''} are overdue for an outcome update — [Report now]". Planner refines if UI-SPEC happens.
- **Layer 5 Storage bucket:** `ai-archives` (private, no MIME restriction since contents are `.json.gz`).
- **Layer 5 archive path scheme:** `{user_id}/{table_name}/{row_id}.json.gz`.
- **Layer 5 gzip level:** 6 (default; planner picks).
- **Layer 5 cost-regression doc path:** `.planning/phases/42-database-foundation-users-career-targets/storage-cost-regression.md` (created by operator from migration NOTICE output).
- **Improvement-over-time SQL query path:** `.planning/phases/42-database-foundation-users-career-targets/queries/improvement-over-time.sql`.
- **Prediction-readiness SQL query path:** `.planning/phases/42-database-foundation-users-career-targets/queries/prediction-readiness.sql`.
- **Retention policy doc path:** `.planning/phases/42-database-foundation-users-career-targets/retention-policy.md`.

</specifics>

<deferred>
## Deferred Ideas

- **User-facing version-history UI** (Layer 2) — schema supports it (delta query template) but no rendered surface this phase. Candidate for a v4.x follow-up phase if users ask for "compare my last 3 resumes."
- **Behavior dashboards / score-delta charts** (Layer 3) — `recommendations`, `user_edits`, `feature_usage` are queryable but no rendered analytics surface this phase. Candidate for an internal/admin tool or a future user dashboard.
- **Email-based outcome nudges** (Layer 4) — in-app banner only this phase. Resend infra exists (`send-*-email` functions, `scheduled_emails` table) — adding email at 14d/30d is a small follow-up phase. Defer until in-app conversion data shows the nudge is undermissed.
- **Verified / imported outcome sources** (Layer 4) — `outcome_source` enum allows `verified` / `imported` but no integration ships this phase. Future candidates: LinkedIn integration confirming offers, ATS integration, peer-network verification.
- **Cross-user data sharing UX / leaderboards** (all layers) — explicitly out-of-scope. Future milestone.
- **The prediction model / inference layer** — Layer 4 ships the data foundation only. ML / heuristic prediction is a future v4.x or v5.0 milestone. **Phase 47.1 (Elite-vs-Pro differentiator) may pull this forward as "outcome-prediction beta access."**
- **Interview Prep instrumentation** (Layer 3) — paused per Phase 47. Future IPC Milestone re-enables and adds Layer 3 wiring then. CHECK constraint widen on `recommendations.feature` + `user_edits` chain is a one-line migration.
- **Cross-user dedup of stored blobs** (Layer 5) — out of scope; same response stored multiple times across users stays as multiple Storage objects.
- **CDN tuning for `ai-archives/` downloads** (Layer 5) — Storage CDN works out of the box; tuning is a future ops task if download latency on fall-through reads becomes a problem.
- **User-facing "view archived response" UI** (Layer 5) — fall-through is transparent via service-side resolver; no special UI. If users need to see archived past analyses, that's a separate UX phase.
- **User-initiated "delete my behavior trail" UI** (Layer 3) — cascade via account-delete works; explicit per-row purge is a follow-up.
- **Migrating `experience_level`, `job_type_preference`, `linkedin_url`, `preferred_locations[]`** off `profiles` into `career_targets` — out of scope; they stay on `profiles`.
- **A/B testing infrastructure / experiment buckets** (Layer 3) — out of scope.

</deferred>

---

*Phase: 42-database-foundation-users-career-targets (consolidated 5-layer)*
*Context gathered: 2026-05-24 (Layer 1) · 2026-05-25 (Layers 2–5 appended)*
*Next step: /gsd-plan-phase 42 — decompose into 5 sequential layer plans (or finer-grained waves per layer) with research as appropriate. Layer 1 is fully decided and ready to plan first.*
