# Phase 42: Database Foundation — Lean Intelligence Layer (5 Layers) — Research

**Researched:** 2026-05-25
**Domain:** Supabase Postgres schema design, RLS contracts, pg_cron + pg_net scheduled jobs, Supabase Storage buckets, Deno edge-function workers, React/TypeScript frontend cutover
**Confidence:** HIGH (codebase-grounded; every precedent verified against committed migrations and source)

## Summary

Phase 42 is a 5-layer additive database foundation that follows extraordinarily well-established precedents in this repo. **Every architectural pattern the planner needs already exists in committed migrations:** atomic-migration-with-DO-$$-verification (Phase 29), service-role-write + SELECT-own RLS contract (`analysis_cache`), per-user-folder Storage RLS (`resumes/` bucket), pg_cron + pg_net HTTP webhooks with GUC-stored secrets (Phase 12 reset-merits sweep), idempotent ALTER + CHECK guards (`interview_quizzes` Phase 19/23), and internal-worker auth via `INTERNAL_JOB_SECRET` (`process-resume-analysis-job`). pg_cron + pg_net extensions are already enabled (since migration `20260116215237`). The major investigation finding: **two SPEC assumptions are stale and need planner attention** — (1) `linkedin_grades` is NOT a global cross-user cache anymore (per `20251223075804` + `20260410235959` it gained a `user_id` column and the unique constraint was changed to `(user_id, profile_identifier)`); (2) the SPEC's enumeration of Results pages (`ResumeAnalysisResults`, `LinkedInGradeResults`, `CareerCompassResults`, `RecruitingLensResults`) does not match the filesystem — there is only `Results.tsx` for resume; LinkedIn/CareerCompass/RecruitingLens render results inside their own pages.

`saved_jobs` is touched in exactly 6 source sites (Dashboard reads/deletes, Jobs inserts, RecruitingLens reads, recruiting-lens edge function upserts, admin-delete-user deletes) — the atomic L4 cutover is genuinely tractable.

**Primary recommendation:** Follow the Phase 29 migration shape verbatim for all 5 layers (atomic ADD + COMMENT + idempotent guards + DO $$ verification). Use the Phase 12 stripe-products-webhook cron pattern verbatim for all 3 pg_cron jobs (per-environment ALTER DATABASE GUCs for `functions_base_url` + `internal_job_secret`). Treat the Storage bucket creation in `20251113102013` as the literal template for `ai-archives`. The single biggest planner decision is **reconciling `linkedin_grades`'s actual user-scoped shape with the SPEC's "global cache" framing** — this affects DB-VER-02 idempotency, `linkedin_versions.linkedin_grade_id` semantics, and the L5 `linkedin_grades.grading_data` retention condition.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layer 1 — Users + Career Targets (carried forward from 2026-05-24; unchanged):**
- **Migration file structure:** Single atomic file: ADD profile columns → CREATE `career_targets` + RLS + trigger → INSERT backfill with `ON CONFLICT (user_id) DO NOTHING` → DROP legacy `profiles.target_roles` + `profiles.career_interests` → CREATE indexes + `cohort_peers` view. Verification `DO $$` block mirrors Phase 29 pattern. Down-migration as fenced comment block at top of forward file.
- **Ships in same PR as frontend cutover** (atomicity constraint, no zombie state).
- **TypeScript types regen:** `supabase gen types typescript --linked > src/integrations/supabase/types.ts`, committed in same PR.
- **Profile.tsx save:** Sequential `Promise.all([updateProfiles, upsertCareerTargets])` with partial-failure toast. `career_targets` uses `.upsert({...}, { onConflict: 'user_id' })`.
- **Reader pattern:** Shared `useUserTargets()` hook in `src/hooks/useUserTargets.ts` returning `{ profile, targets, loading, error, refresh }` from `Promise.all`. Reused by Onboarding/CareerCompass/Profile. `cohort_peers` view is NOT the general reader (filters `WHERE school IS NOT NULL`; reserved for L2–5).
- **Backfill banner:** Mounted at top of `Dashboard.tsx` only. shadcn `<Alert>` + icon + SPEC copy verbatim. Primary CTA "Add details" → `/profile#education-targets`. Dismiss key: `cohort_backfill_banner_dismissed_v1` (locked).
- **Deep-link:** URL hash `#education-targets` + `scrollIntoView` + focus first input on mount.
- **Onboarding write:** `Onboarding.tsx` UI unchanged; save upserts into `career_targets` instead of `profiles`.
- **Cutover safety:** `grep -rn "target_roles\|career_interests" src/ supabase/functions/` to find every reference; plan-level pre-deploy check.

**Layer 2 — Resume + LinkedIn Structured Versioning:**
- **Async parser trigger:** Webhook from `analyze-resume` / `grade-linkedin` after response returns to client (preserves Phase 37 latency). Fires fire-and-forget `fetch` to `extract-analysis-structure` edge function with `{ analysis_results_id, feature }` payload. Auth via `INTERNAL_JOB_SECRET`. Lag target ≤5s happy / ≤60s SLA.
- **Catchup:** `extract_catchup_nightly` pg_cron every 15 minutes scans `analysis_results` rows older than 5 minutes without matching `resume_versions`/`linkedin_versions` row and re-fires webhook. Uses `net.http_post` with same `INTERNAL_JOB_SECRET` header.
- **Single edge function:** `extract-analysis-structure` routes on `feature` payload — `resume_analysis` → resume fan-out; `linkedin_grading` → linkedin fan-out.
- **Idempotency:** Worker uses `INSERT … ON CONFLICT (user_id, source_analysis_results_id) DO NOTHING`. Add `source_analysis_results_id uuid REFERENCES analysis_results(id)` to `resume_versions` and `linkedin_versions`.
- **`supersedes_id`:** On insert: `(SELECT id FROM resume_versions WHERE user_id = $user AND resume_id = $resume ORDER BY created_at DESC LIMIT 1)`.
- **LinkedIn dual-write:** Worker writes to BOTH `linkedin_grades` (cross-user cache, unchanged) AND new `linkedin_versions` (user-scoped) with `linkedin_grade_id` FK.
- **`scores` polymorphic FK:** No DB FK; worker enforces validity. RLS via SECURITY-DEFINER `auth_owns_version(version_id uuid, version_type text)`.
- **Improvement-over-time query:** Lives at `.planning/phases/42-…/queries/improvement-over-time.sql`. Operator-runnable; no UI this phase.
- **Failure isolation:** Worker errors logged via `_shared/logger.ts`; never propagate to caller.

**Layer 3 — Behavior + Improvement Tracking:**
- **`<RecommendationActions>` component:** `src/components/recommendations/RecommendationActions.tsx`. Props `{ recommendation, onAction }`. Three lucide-react buttons + shadcn `<Button variant="ghost" size="sm">`. Edit opens inline `<Textarea>` + Save/Cancel.
- **Mounted on 4 features** (Resume, LinkedIn, Career Compass, Recruiting Lens) — Interview Prep Results page does NOT import this (gated per Phase 47).
- **`recommendations` write:** Same worker as Layer 2 (`extract-analysis-structure`). One batch INSERT per analyze run (typically 3–15 rows). `target_ref_id` resolves to just-created bullet/section/version id.
- **`shown_at` RPC:** SECURITY-DEFINER `record_recommendations_shown(rec_ids uuid[])`. Idempotent (`WHERE shown_at IS NULL`). Called once on first paint via `useEffect`.
- **`user_edits` writes:** Frontend `<RecommendationActions>` writes directly via Supabase client — RLS chain on parent `recommendations.user_id`. Failures: console error + sonner toast. `score_before`/`score_after` from `resume_bullets.bullet_score` at action time.
- **`feature_usage` writes:** SECURITY-DEFINER RPC `record_feature_usage(feature text, action text)` called immediately on every event. ~4 events × 4 features = ~16 writes per analyze flow (acceptable; no batching).
- **`useFeatureUsage(feature)` hook:** `src/hooks/useFeatureUsage.ts` exposes `recordEvent('open'|'submit'|'view_results'|'export')`.
- **Privacy:** `original_text`/`suggested_text`/`final_user_text` documented as user-PII tier in migration COMMENT. CASCADE: `auth.users → recommendations → user_edits`. No purge UI this phase.

**Layer 4 — Outcomes + Predictions Foundation:**
- **`saved_jobs` → `applications` cutover:** Atomic in single migration mirroring L1 DB-USR-02. Sequence: CREATE applications + RLS + indexes → INSERT FROM saved_jobs (status='saved', preserve created_at) → DROP TABLE saved_jobs → verification DO $$. Frontend cutover ships in same PR. Down-migration fenced as comment at top.
- **Recruiting Lens auto-create:** `applications` row inserted synchronously inside `recruiting-lens` edge function right after response is computed (before returning to client). Dedup `INSERT … ON CONFLICT (user_id, jd_id) DO NOTHING`.
- **`job_descriptions` write:** Written by Layer 2 async worker when `feature=recruiting_lens`. Recruiting Lens inserts `applications` row with `jd_id = NULL`; worker backfills (or worker creates both atomically — planner picks).
- **`benchmarks` rollup:** SECURITY-DEFINER pl/pgsql `run_benchmarks_rollup()`. Filters `sample_size >= 5`. UNIQUE on `(cohort_key, metric, computed_at::date)`. Called nightly by `benchmarks_nightly` pg_cron (~03:00 UTC).
- **`/applications` page:** New route `src/pages/Applications.tsx`. shadcn `<Table>` + `<TableRow>`. Columns: Company | Role | Status (dropdown) | Application date | Source | Outcome (CTA → modal). Add/Outcome dialogs via shadcn `<Dialog>` + react-hook-form + zod.
- **Dashboard outcome-banner:** Client-side LEFT JOIN against `applications` + `outcomes` filtered to `application_date < now() - interval '14 days'` AND `outcomes.id IS NULL`. Planner may convert to VIEW/RPC if perf demands.
- **`outcomes.application_id UNIQUE`:** Frontend `upsert({ ... }, { onConflict: 'application_id' })`.
- **`benchmarks` RLS exception:** SELECT allowed for any authenticated user (`USING (true) TO authenticated`). No write policy. Documented in migration COMMENT (sample_size ≥ 5 protects against de-anonymization).

**Layer 5 — Lifecycle: Storage Refs + Archival:**
- **Fall-through reader:** Service-side `_shared/archive-reader.ts`. Signature: `readWithArchiveFallback(client, table, rowId, inlineColumn, archivePathColumn) → Promise<jsonb | string>`. If `archive_path` NULL or inline non-NULL → return inline. Else download from Storage, gunzip, parse, return.
- **Edge functions touched:** `analyze-resume` (cache reuse), `recruiting-lens` (raw_response), `get-analysis-job-status` (analysis_cache.raw_response), `admin-delete-user` (GDPR export). Frontend reads via these functions — no signed URL exposure.
- **Archive format:** Gzipped JSON per row. Path: `ai-archives/{user_id}/{table}/{row_id}.json.gz`.
- **Storage cascade on delete:** Extend `admin-delete-user`. Before `auth.users` delete, enumerate `supabase.storage.from('ai-archives').list('{user_id}/', ...)` recursively and bulk `.remove(paths)`. Synchronous.
- **`analysis_cache.raw_response` TTL guard:** Sweep checks `created_at < now() - interval '30 days' AND last_hit_at < now() - interval '7 days'`. Phase 29 cache hit-rate KPI is regression gate.
- **Backfill:** Runs inside same migration as `run_lifecycle_sweep()` creation. Chunked `LIMIT 1000` if >10K rows. Cost-regression: capture `pg_database_size()` + per-table `pg_total_relation_size()` BEFORE and AFTER; output via NOTICE log to `.planning/phases/42-…/storage-cost-regression.md`.
- **`archive_path` columns:** Additive `archive_path text NULL` on `resumes`, `linkedin_grades`, `analysis_results`, `analysis_cache`, `interview_quizzes`, `interview_quiz_answers`, `profiles`. Idempotent `ADD COLUMN IF NOT EXISTS`.
- **`ai-archives` bucket:** Private. Created via `INSERT INTO storage.buckets`. Per-user-folder RLS: `auth.uid()::text = (storage.foldername(name))[1]`.
- **`job_descriptions` skip:** `run_lifecycle_sweep()` explicitly skips this table (load-bearing for predictions).

### Claude's Discretion

- **L2:** Exact pg_cron schedule slot for `extract_catchup_nightly`; internal helper organization within `extract-analysis-structure/index.ts`; specific indexes beyond SPEC minimum; SECURITY-DEFINER vs. inline RLS predicate for `scores`.
- **L3:** Exact button visuals/icons for `<RecommendationActions>`; whether `useFeatureUsage` hook batches internally; column placement for `target_ref_type` enum widening.
- **L4:** Exact mount point of dashboard outcome-banner relative to L1 backfill banner; dashboard banner data source (client-side JOIN vs. VIEW vs. RPC); cohort_key delimiter/canonicalization; whether `application_source` enum gets `'manual'` or stays open-ended.
- **L5:** Exact pg_cron schedule for `lifecycle_sweep_nightly` (~04:00 UTC after benchmarks); monolithic function vs. per-class helpers; backfill in migration transaction vs. separate operator step; gzip level (~6 default); optional `ai_archive_metadata` summary table.

### Deferred Ideas (OUT OF SCOPE)

User-facing version-history UI · Behavior dashboards / score-delta charts · Email-based outcome nudges · Verified/imported outcome sources · Cross-user data sharing / leaderboards · The prediction model / inference layer (Phase 47.1 may pull "outcome-prediction beta access" forward) · Interview Prep instrumentation (paused per Phase 47) · Cross-user dedup of stored blobs · CDN tuning for `ai-archives/` · User-facing "view archived response" UI · User-initiated "delete my behavior trail" UI · Migrating `experience_level`, `job_type_preference`, `linkedin_url`, `preferred_locations[]` off `profiles` · A/B testing infrastructure.

---

## ⚠️ Landmines & SPEC/Live Mismatches (HIGH-priority planner reading)

### 1. `linkedin_grades` is NOT a global cross-user cache (SPEC assumption is stale)

**SPEC (DB-VER-02) and CONTEXT both describe `linkedin_grades` as:**
> "GLOBAL — anyone-can-read by `profile_identifier`; no user_id column"
> "Second user grading the same `profile_identifier` reuses the existing `linkedin_grades.id` (cache hit) but gets their own `linkedin_versions` row"

**Live database (verified via committed migrations):**
- `20251223075804_2c3ce05b-…sql`: `ALTER TABLE public.linkedin_grades ADD COLUMN user_id UUID REFERENCES auth.users(id);`
- `20260410235959_linkedin_grades_drop_unique_identifier.sql`: dropped the original `UNIQUE INDEX idx_linkedin_grades_identifier`; created composite `idx_linkedin_grades_user_profile (user_id, profile_identifier)` — **explicitly stated as "Phase 4: Fix profile_identifier constraint for multi-user LinkedIn grading. The original UNIQUE index on profile_identifier prevents two users from grading the same LinkedIn profile."**
- `20251218042310_…sql`: dropped "Anyone can read cached LinkedIn grades" policy; replaced with "Authenticated users can read cached LinkedIn grades" (`TO authenticated USING (true)`).
- `admin-delete-user/index.ts` line 69: `.from("linkedin_grades").delete().eq("user_id", targetUserId)` — confirms user-scoping is live.

**Implication for Layer 2 (DB-VER-02):**
- The "two users grading same profile reuse the same row" assumption is **wrong**. Each user already gets their own `linkedin_grades` row.
- This collapses the conceptual difference between `linkedin_grades` and the proposed `linkedin_versions`. The planner needs to decide:
  - **Option A (recommended):** Treat `linkedin_versions` as a thin per-analyze-run delta layer (multiple `linkedin_versions` per `linkedin_grades.id` — one per re-grade), with `linkedin_grade_id` FK pointing to the user's existing row.
  - **Option B:** Skip `linkedin_versions` entirely and use the existing `linkedin_grades` rows as the "version" record (add `parsed_summary`, `supersedes_id` columns directly).
- The SPEC acceptance "A second user grading the same LinkedIn `profile_identifier` reuses the existing `linkedin_grades` row" **cannot be satisfied as written** — the live schema rejects this. Planner should clarify with operator before locking the L2 migration shape.

**Layer 5 ripple:** DB-RET-01's `linkedin_grades.grading_data` retention condition reads "iff ≥1 `linkedin_versions` row references this `linkedin_grades.id`." Under live semantics, every `linkedin_grades` row is per-user — so the condition simplifies (or `linkedin_versions` becomes a redundant layer). Planner should reconcile.

### 2. SPEC's enumeration of "Results pages" does not match the filesystem

**SPEC (DB-EDT-02 / L3) references:**
- `ResumeAnalysisResults` — exists as `src/pages/Results.tsx` (single shared route `/results/:id`)
- `LinkedInGradeResults` — **does not exist as a separate file**; grade results render inline in `src/pages/LinkedInGrader.tsx`
- `CareerCompassResults` — **does not exist as a separate file**; results render inline in `src/pages/CareerCompass.tsx`
- `RecruitingLensResults` — **does not exist as a separate file**; results render inline in `src/pages/RecruitingLens.tsx`

**Implication for Layer 3 (`<RecommendationActions>` mounting):**
- The planner must mount the component inside the 4 listed page files directly (`Results.tsx`, `LinkedInGrader.tsx`, `CareerCompass.tsx`, `RecruitingLens.tsx`), not separate "*Results.tsx" wrappers.
- `useFeatureUsage` `view_results` event needs to fire wherever the results sub-tree mounts inside each of these pages (likely a `useEffect` keyed on results presence).

### 3. `saved_jobs` is **also** used by the non-Recruiting-Lens Jobs page (Phase 4 / discovery-style flow)

**Touch sites (full audit):**
- `src/pages/Dashboard.tsx:125, 160` — infinite query `useInfiniteQuery(['savedJobs', userId])` + delete handler (Tab "Saved Jobs")
- `src/pages/Jobs.tsx:136` — INSERT on swipe-save (job-discovery UI)
- `src/pages/RecruitingLens.tsx:317` — SELECT filtered by `location='Recruiting Lens'` (Recruiting Lens dashboard cache)
- `src/pages/__tests__/RecruitingLens.saved-jobs-tutorial.test.tsx` — test asserting `.from('saved_jobs')`
- `supabase/functions/recruiting-lens/index.ts:146, 162, 163` — `upsertSavedRecruitingLensJob` (existing-row lookup + update vs. insert)
- `supabase/functions/admin-delete-user/index.ts:67` — `delete().eq("user_id", ...)`

**Implication for Layer 4:**
- The cutover is genuinely atomic-tractable (6 sites + 1 test).
- BUT: `Jobs.tsx` swipes save rows with `posted`, `salary`, `url`, `location` populated from the job-discovery API — these fields don't exist on the SPEC'd `applications` table. The planner must either (a) include them as nullable columns on `applications`, (b) move them into `job_descriptions`, or (c) document them as dropped (with operator sign-off).
- `RecruitingLens.tsx` reads `saved_jobs` filtered by `location='Recruiting Lens'` as a sentinel value — the cutover query becomes `applications WHERE source='recruiting_lens'` (planner needs to populate `application_source` correctly during backfill).
- The test file (`RecruitingLens.saved-jobs-tutorial.test.tsx`) **asserts the literal string `.from('saved_jobs')` exists in page source** — the test will fail post-cutover; planner must update the assertion atomically.

### 4. pg_cron `cron.schedule()` uses GUC-based secrets (per Phase 12 precedent), not direct values

**Precedent (`20260415000001_phase_12_stripe_products_webhook.sql:100-139`):**
```sql
PERFORM cron.schedule(
    'reset-subscription-merits-sweep',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url     := current_setting('app.functions_base_url', true) || '/reset-subscription-merits',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', current_setting('app.internal_job_secret', true)
      ),
      body    := '{"invocation_source": "pg_cron"}'::jsonb
    );
    $job$
  );
```

GUCs MUST be set per-environment via `ALTER DATABASE postgres SET app.functions_base_url = '...'` and `ALTER DATABASE postgres SET app.internal_job_secret = '...'` (see migration's deploy runbook header).

**Implication:** Layers 2, 4, 5 all add cron jobs. Planner must ensure the deploy runbook reminds operator the GUCs are already set in staging/prod (they should be — Phase 12 shipped) but verify before deploy. If a fresh environment is provisioned, the cron tick produces invalid HTTP posts until GUCs are set — non-fatal but log-noisy.

**Note:** `20260310000000_add_keep_warm_cron.sql` (the SPEC-referenced precedent) uses a hard-coded URL and no auth — this is the **simpler but environment-specific** pattern. Phase 42's catchup + nightly jobs all hit internal-auth-protected endpoints, so the Phase 12 GUC pattern is mandatory.

### 5. `useFeatureUsage` write volume: ~16 events per analyze flow is acceptable, but watch latency

**Math from CONTEXT:** 4 events × 4 features = ~16 writes per full analyze flow.

**Reality:** A single user analyze flow touches only ONE feature (e.g., resume_analysis). So per analyze flow: 4 events (open / submit / view_results / export) = 4 writes per RPC call. Across the 4 instrumented features, daily aggregate is bounded by user count × ~4 active features × ~4 events. For a Pro-tier user doing 100 analyses/month, this is ~1600 writes/month. Well within Postgres write budget.

**Recommended index** (planner adds if not already in SPEC): `(user_id, feature, occurred_at DESC)` — SPEC DB-USE-01 already calls for this.

**Risk:** The `record_feature_usage` RPC is called from frontend with no debouncing. If a user hits "Submit" twice in quick succession (double-click), two `submit` rows land. Planner can add a 1-second-window dedup in the hook (`useFeatureUsage`) or accept the duplicates as analytics noise.

### 6. `analysis_results.raw_response` has variable shape across features

The Layer 2 worker reads `analysis_results.raw_response` and fans out to structured rows. The shape is **per-feature**:
- `resume_analysis` (`analyze-resume/index.ts:44-51`): full Anthropic response merged + tier shape applied, with `metadata.tier`, `metadata.analysisDate`, `overallScore`, `suggestions[]`, `improvements[]`, sections/categories.
- `linkedin_grading` (`grade-linkedin/index.ts`): full Anthropic response with `overall_score`, category-level scores.
- `recruiting_lens` (`recruiting-lens/index.ts`): merged response with `overallMatch.score`, `overallMatch.summary`, `recruiterVerdict`, structured criteria. Saved to `analysis_results` AND `analysis_cache.raw_response` AND `saved_jobs`.

**Implication for L2 worker:**
- Per-feature extractor modules (`extract-resume.ts`, `extract-linkedin.ts`, `extract-recruiting-lens.ts`) are highly recommended over a single monolithic extractor.
- Each extractor must be tolerant of schema drift (Phase 37 made tier-specific output variants — the parser must handle missing sub-keys gracefully and log structured warnings rather than throw).
- The worker's failure-isolation contract (SPEC DB-VER-03) means extraction errors stay silent to the user — but planner should add a `extract_failures` summary log line per analyze run so operators can spot schema drift.

### 7. `recruiting-lens` already does dual-write to `analysis_results` + `analysis_cache` + `saved_jobs` — adding `applications` insert is a 4-write critical section

`recruiting-lens/index.ts` `writeRecruitingLensCache` + `upsertSavedRecruitingLensJob` already runs serial DB writes. L4's `applications` synchronous insert + L5's eventual `job_descriptions` write extend the critical section.

**Implication:** Failure mode matters. If the `applications` insert fails AFTER the cache write succeeds, user sees results but no `/applications` row appears. SPEC DB-APP-02 requires `applications` row visible "after one page reload" — this implies acceptable eventual consistency. Planner should:
- Wrap `applications` insert in try/catch (don't throw to user — log via `_shared/logger.ts`).
- Allow Layer 2 worker (or catchup cron) to be the safety net that backfills missing `applications` rows from `analysis_results` where `analysis_type='recruiting_lens'`.

### 8. Profile.tsx is monolithic — Layer 1's Education & Targets section needs careful grafting

`src/pages/Profile.tsx` is a single ~600-line file with:
- One `profile` state object holding 13 fields
- One `handleSave` that updates `profiles` (lines 207–236)
- Resume upload + LinkedIn PDF upload handlers in the same file
- Existing chip inputs for `target_roles[]` and `career_interests[]` that need to be re-wired to `career_targets` (not deleted; SPEC says "existing chip input continues to render but writes to `career_targets.target_roles`")

**Implication:** L1 Profile.tsx changes are non-trivial. The planner should consider extracting Education & Targets into a sub-component (`<EducationTargetsSection>`) under `src/components/profile/` to keep Profile.tsx legible. Save-coordination still happens at the Profile.tsx level (parent owns `handleSave`).

### 9. The `update_updated_at_column` trigger function exists — planner can reuse it

From `20251113100645_*.sql:93`: `CREATE OR REPLACE FUNCTION public.update_updated_at_column()` exists. Layer 1's `career_targets`, Layer 4's `applications`, and any other table needing an `updated_at` trigger can `CREATE TRIGGER update_xxx_updated_at BEFORE UPDATE ON public.xxx FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` — no need to re-create the function.

### 10. Dashboard banner stacking precedent: `RunningLowCard` mounted at top

`src/pages/Dashboard.tsx:200` mounts `<RunningLowCard />` at the very top of the dashboard render (self-hides when not low). Layer 1's backfill banner and Layer 4's outcome banner follow this same pattern — both should be self-hiding components mounted above `<div className="flex items-start justify-between mb-8">`. Stacking order is planner's discretion; recommend L4 outcome banner ABOVE L1 backfill banner (urgency: pending outcomes > cosmetic backfill).

---

## Standard Stack

### Migrations & SQL
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| PostgreSQL (Supabase) | managed | Schema + RLS | Existing platform |
| `pg_cron` | bundled | Scheduled jobs | Already enabled (`20260116215237`) |
| `pg_net` (`net.http_post`) | bundled | HTTP webhooks from cron | Already enabled (`20260116215237`) |
| Supabase Storage | managed | `ai-archives` bucket | Mirrors `resumes/` bucket precedent |
| `gen_random_uuid()` | pgcrypto | Default PK generator | Used in every existing table |
| `update_updated_at_column()` | existing trigger fn | `updated_at` maintenance | Defined in `20251113100645_*` |

### Edge Functions (Deno)
| Library | Source | Purpose | Reuse |
|---------|--------|---------|-------|
| `npm:@supabase/supabase-js@2` | npm | Postgres + Storage client | `_shared/supabase-client.ts` singleton |
| `https://deno.land/std@0.168.0/http/server.ts` | Deno stdlib | HTTP server | Every edge fn |
| `_shared/auth.ts` | existing | `requireAuth`, `requireInternalOrUserAuth` | New `extract-analysis-structure` uses `requireAuth({type:'internal'})` |
| `_shared/logger.ts` | existing | Structured JSON logging | Every new fn |
| `_shared/supabase-client.ts` | existing | `getServiceClient()`, `getSupabaseUrl()`, `getServiceRoleKey()` | Worker + cron-target functions |
| `_shared/cors.ts` | existing | `corsHeaders`, `handleOptionsRequest` | All HTTP fns |
| `https://deno.land/std@0.168.0/io/streams.ts` + `gzip` (custom or `https://deno.land/x/compress`) | TBD | Gzip for archive payloads | **NEW dependency for L5** — see Open Questions |

### Frontend (React/Vite)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | 2.81.1 | Client | Existing singleton `@/lib/supabaseClient` |
| `@tanstack/react-query` | 5.83.0 | Server state caching | Used in Dashboard |
| `react-hook-form` | 7.61.1 | Form state | Existing (Onboarding, Profile) |
| `zod` | 3.25.76 | Schema validation | Existing |
| `@hookform/resolvers` | 3.10.0 | RHF + Zod integration | Existing |
| `sonner` | 1.7.4 | Toast notifications | Existing |
| `lucide-react` | 0.462.0 | Icons | Existing (Check, X, Edit3, etc.) |
| shadcn `<Alert>` | bundled | L1 backfill banner | Existing pattern |
| shadcn `<Dialog>` | bundled | L4 Add/Outcome modals | Existing |
| shadcn `<Table>` | bundled | L4 Applications table | Existing |
| shadcn `<Textarea>`, `<Button>`, `<Select>` | bundled | L3 `<RecommendationActions>` inline edit | Existing |

### Type Generation
| Tool | Purpose |
|------|---------|
| `supabase gen types typescript --linked > src/integrations/supabase/types.ts` | Regenerate types after each layer's migration (run locally against staging-linked project, commit in same PR) |

---

## Architecture Patterns

### Recommended Structure for Phase 42 Artifacts

```
supabase/migrations/
├── 2026MMDDHHMMSS_phase42_layer1_users_career_targets.sql       # Atomic; ships with src/ cutover
├── 2026MMDDHHMMSS_phase42_layer2_versioning_tables.sql           # Tables only
├── 2026MMDDHHMMSS_phase42_layer2_extract_catchup_cron.sql        # pg_cron (per-env GUCs assumed set)
├── 2026MMDDHHMMSS_phase42_layer3_behavior_tracking.sql           # Tables + RPCs
├── 2026MMDDHHMMSS_phase42_layer4_applications_outcomes.sql       # Atomic saved_jobs cutover
├── 2026MMDDHHMMSS_phase42_layer4_benchmarks_cron.sql             # benchmarks_nightly cron
└── 2026MMDDHHMMSS_phase42_layer5_lifecycle_archive.sql           # Storage bucket + columns + sweep fn + cron + backfill

supabase/functions/
└── extract-analysis-structure/
    ├── index.ts              # Dispatcher; auth via INTERNAL_JOB_SECRET
    ├── extract-resume.ts     # resume_analysis → resume_versions/sections/bullets/scores/recommendations
    ├── extract-linkedin.ts   # linkedin_grading → linkedin_versions/scores/recommendations
    └── extract-recruiting-lens.ts  # recruiting_lens → job_descriptions/recommendations + backfill applications.jd_id

supabase/functions/_shared/
└── archive-reader.ts         # L5 fall-through reader

src/components/
├── recommendations/
│   └── RecommendationActions.tsx     # L3 shared UI primitive
└── profile/
    └── EducationTargetsSection.tsx   # L1 sub-component (extracted from Profile.tsx)

src/hooks/
├── useUserTargets.ts                  # L1 shared reader
└── useFeatureUsage.ts                 # L3 telemetry hook

src/pages/
└── Applications.tsx                   # L4 new route

.planning/phases/42-database-foundation-users-career-targets/
├── queries/
│   ├── improvement-over-time.sql     # L2
│   └── prediction-readiness.sql      # L4
├── retention-policy.md                # L5
└── storage-cost-regression.md         # L5 (populated by operator from migration NOTICE output)
```

### Pattern 1: Atomic Migration with DO $$ Verification (Phase 29 template)

**What:** Every layer ships a single SQL file containing: header comment with sections, COMMENTed down-migration, idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `DO $$` policy guards), `COMMENT ON COLUMN/TABLE` for documentation, and a final `DO $$ ... $$` verification block that raises EXCEPTION on missing artifacts.

**Source:** `supabase/migrations/20260512000001_resumes_extracted_text.sql` and `20260512000000_analysis_cache_table.sql`.

**Example skeleton:**
```sql
-- Phase 42 · Layer N · DB-XXX-01..NN
-- Sections: 1. CREATE TABLE  2. INDEXES  3. RLS  4. COMMENTS  5. VERIFICATION
--
-- Down-migration (for reference only — forward-only deploy):
--   DROP TABLE IF EXISTS public.xxx CASCADE;
--
-- Re-runnability: every DDL is guarded; DO $$ blocks are read-only.

CREATE TABLE IF NOT EXISTS public.xxx ( ... );
CREATE INDEX IF NOT EXISTS idx_xxx_yyy ON public.xxx (...);
ALTER TABLE public.xxx ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xxx_select_own ON public.xxx;
CREATE POLICY xxx_select_own ON public.xxx FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.xxx IS '...';
COMMENT ON COLUMN public.xxx.yyy IS '...';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='xxx') THEN
    RAISE EXCEPTION 'Phase 42 Layer N verification failed: public.xxx missing';
  END IF;
  -- ...further assertions...
  RAISE NOTICE 'Phase 42 Layer N DB-XXX verification passed';
END $$;
```

### Pattern 2: Service-Role-Writes-Only RLS (Phase 29 `analysis_cache` template)

**What:** All user-scoped tables enable RLS, add a SELECT-own policy (`USING (auth.uid() = user_id)`), and **add NO INSERT/UPDATE/DELETE policies**. Service role bypasses RLS for all writes via `getServiceClient()`. Adding a permissive write policy is explicitly flagged as the SEC-06 anti-pattern in `analysis_cache` migration.

**Source:** `20260512000000_analysis_cache_table.sql:82-87`. Also `interview_quizzes` (`20260418000000_*.sql:174-195`).

**Apply to:** All Layer 2, 3 (`recommendations`, `user_edits`, `feature_usage`), 4 (`applications` is EXCEPTION — needs full user CRUD per SPEC; `outcomes`, `job_descriptions` are service-role-writes; `benchmarks` is the aggregate-read exception), 5 user-scoped tables.

**RLS chain via parent join (interview_quiz_answers precedent):**
```sql
CREATE POLICY xxx_select_own ON public.xxx FOR SELECT
  USING (parent_id IN (SELECT id FROM public.parent_table WHERE user_id = auth.uid()));
```
Used for `resume_sections`, `resume_bullets`, `user_edits` (chain to `recommendations`), `outcomes` (chain to `applications`).

### Pattern 3: pg_cron + pg_net Webhook with GUC Secrets (Phase 12 template)

**Source:** `20260415000001_phase_12_stripe_products_webhook.sql:88-139`.

**Skeleton for Layer 2/4/5 cron jobs:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extract-catchup-nightly') THEN
    PERFORM cron.unschedule('extract-catchup-nightly');
  END IF;
  PERFORM cron.schedule(
    'extract-catchup-nightly',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url     := current_setting('app.functions_base_url', true) || '/extract-analysis-structure',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-job-secret', current_setting('app.internal_job_secret', true)
      ),
      body    := '{"invocation_source": "pg_cron_catchup"}'::jsonb
    );
    $job$
  );
END $cron$;
```

Per-environment GUCs (set once per env via SQL editor):
```sql
ALTER DATABASE postgres SET app.functions_base_url = 'https://<project-ref>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.internal_job_secret = '<INTERNAL_JOB_SECRET-value>';
```

**Already-set status (per Phase 12 deploy):** Should be set in both staging (`cimjltzovkahkqecpwgi`) and prod (`zjpjapgraoxdukdvpjes`) — verify before deploy.

**Alternative (simpler, for in-DB-only sweeps):** `20260330000000_add_rate_limit_counters.sql:48-56` does an inline `DELETE` instead of an HTTP post. Use this pattern for sweeps that don't need to call an edge function (e.g., parts of `run_lifecycle_sweep()` that do pure SQL deletes).

### Pattern 4: Storage Bucket with Per-User-Folder RLS

**Source:** `20251113102013_aa07c3f5-…sql` (verbatim model for `ai-archives`):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-archives', 'ai-archives', false, NULL, NULL);
-- file_size_limit NULL (no cap; gzipped jsonb expected ~3-10KB but can be larger)
-- allowed_mime_types NULL (private bucket; contents are .json.gz)

CREATE POLICY "Users can insert their own ai-archives"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ai-archives' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own ai-archives"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ai-archives' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own ai-archives"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ai-archives' AND auth.uid()::text = (storage.foldername(name))[1]);
```

**Notes:**
- Service role bypasses these policies — the sweep function and the `archive-reader.ts` helper (called from edge functions with service role) won't be blocked.
- The authenticated SELECT policy is defense-in-depth in case a future frontend reads directly (currently planned to read via service-side resolver only).

### Pattern 5: Internal Worker Edge Function (process-resume-analysis-job template)

**Source:** `supabase/functions/process-resume-analysis-job/index.ts:73-104`.

**Skeleton for `extract-analysis-structure`:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from '../_shared/supabase-client.ts';
import { requireAuth } from '../_shared/auth.ts';
import { handleOptionsRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { extractResume } from './extract-resume.ts';
import { extractLinkedIn } from './extract-linkedin.ts';
import { extractRecruitingLens } from './extract-recruiting-lens.ts';

const log = createLogger('extract-analysis-structure');

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptionsRequest({ type: 'internal' });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  try {
    await requireAuth(req, { type: 'internal' });
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { analysis_results_id, feature, invocation_source = 'webhook' } = body;

    if (invocation_source === 'pg_cron_catchup') {
      // Scan for unprocessed analysis_results rows older than 5 minutes
      // and dispatch per-row extraction
      return await runCatchup(supabase, log);
    }

    if (!analysis_results_id || !feature) return badRequest('missing analysis_results_id or feature');

    const row = await supabase.from('analysis_results').select('*').eq('id', analysis_results_id).single();
    if (row.error) throw row.error;

    switch (feature) {
      case 'resume_analysis':   return await extractResume(supabase, row.data, log);
      case 'linkedin_grading':  return await extractLinkedIn(supabase, row.data, log);
      case 'recruiting_lens':   return await extractRecruitingLens(supabase, row.data, log);
      default: return badRequest(`unknown feature: ${feature}`);
    }
  } catch (err) {
    log.error('worker-fatal', { error: String(err) });
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
});
```

### Pattern 6: Fire-and-Forget Webhook from Caller (analyze-resume + Layer 2)

**What:** After `analyze-resume` / `grade-linkedin` / `recruiting-lens` writes its response and the user-facing response is sent, fire a non-awaited `fetch()` to `extract-analysis-structure`. Failure is logged but never propagates.

**Skeleton:**
```typescript
// At end of analyze-resume, after response is returned to client:
const url = `${getSupabaseUrl()}/functions/v1/extract-analysis-structure`;
const internalSecret = Deno.env.get('INTERNAL_JOB_SECRET') ?? '';

// Fire-and-forget — do NOT await. Wrap in try so worker can't crash parent.
try {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-job-secret': internalSecret },
    body: JSON.stringify({ analysis_results_id: analysisId, feature: 'resume_analysis' }),
  }).catch(err => console.warn('[analyze-resume] extract webhook failed:', err));
} catch (e) {
  console.warn('[analyze-resume] extract webhook fetch threw:', e);
}
```

**Note:** Deno's fetch in edge functions completes even after the response is sent (the V8 isolate stays warm briefly). This is the well-established Supabase pattern for "fire-and-forget enqueue."

### Pattern 7: Sequential Promise.all with Partial-Failure Toast (Profile.tsx template)

**Source:** `src/pages/Profile.tsx:207-236`. Layer 1 + Layer 4 Add/Outcome modals use this.

```typescript
const handleSave = async () => {
  setSaving(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const [profileRes, targetsRes] = await Promise.all([
      supabase.from('profiles').update({ ...educationFields }).eq('id', user.id),
      supabase.from('career_targets').upsert({ user_id: user.id, ...targetFields }, { onConflict: 'user_id' }),
    ]);

    if (profileRes.error && targetsRes.error) {
      toast.error('Failed to save profile and targets');
    } else if (profileRes.error) {
      toast.error('Profile saved partially — targets updated, profile failed');
    } else if (targetsRes.error) {
      toast.error('Profile saved partially — profile updated, targets failed');
    } else {
      toast.success('Profile updated successfully');
    }
  } catch (e) {
    console.error('[Profile.handleSave]', e);
    toast.error('Failed to save profile');
  } finally {
    setSaving(false);
  }
};
```

### Anti-Patterns to Avoid

- **Permissive write RLS:** Adding `FOR INSERT/UPDATE/DELETE TO authenticated USING (...)` to user-scoped tables is the SEC-06 anti-pattern explicitly flagged in `analysis_cache` migration. Use service role only.
- **Cron `DELETE` without WHERE:** Always scope sweep deletes by a time window; idempotent re-run safety depends on it.
- **Awaiting the fan-out webhook:** Latency-fatal. Fire-and-forget only.
- **FK on polymorphic `scores.version_id`:** Don't try. Use SECURITY-DEFINER RLS helper instead.
- **Single 1500-line migration:** Split per layer; each layer's migration is its own atomic unit. Layer 4 has TWO migrations (tables + cron) because cron failures shouldn't roll back the table creation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Updated-at maintenance | New trigger function per table | Existing `public.update_updated_at_column()` (in `20251113100645_*`) | Already exists, tested |
| Internal-secret comparison | `secret === expected` | `_shared/auth.ts` `requireAuth({type:'internal'})` (uses `timingSafeEqual`) | Timing-attack defense |
| Structured logging | `console.log({...})` | `_shared/logger.ts` `createLogger('fn-name')` | Reqid tracking, levels, JSON shape |
| Postgres client init | Per-request `createClient(...)` | `_shared/supabase-client.ts` `getServiceClient()` | Module-level singleton; PgBouncer pool |
| Storage bucket RLS | Hand-rolled policy SQL | Copy `20251113102013_*.sql` (resumes bucket) verbatim with `'ai-archives'` substituted | Already battle-tested pattern |
| pg_cron HTTP webhook | Inline `net.http_post(...)` | Copy `20260415000001_*.sql:120-138` GUC pattern | Per-env secrets, idempotent reschedule |
| CORS preflight | Per-fn CORS headers | `_shared/cors.ts` `corsHeaders({type})` + `handleOptionsRequest` | One source of truth |
| Form validation | Manual checks | `react-hook-form` + `zod` + `@hookform/resolvers` | Already in use |
| Toast notifications | Custom UI | `sonner` `toast.success/error` | Project convention |
| Result page Q&A | Custom queries | `@tanstack/react-query` `useQuery` / `useInfiniteQuery` | Used in Dashboard, Profile |
| Storage cascade-delete enumeration | Recursive client-side `list()` calls | `supabase.storage.from('ai-archives').list('{user_id}/', { limit: 1000 })` + per-batch `.remove(paths)` | Standard SDK pattern (`admin-delete-user` already uses for `resumes` bucket lines 75-89) |

---

## Common Pitfalls

### Pitfall 1: `linkedin_grades` Live Shape ≠ SPEC Assumption
**What goes wrong:** Planner ships `linkedin_versions` design assuming `linkedin_grades` is a global cross-user cache; migration verification passes but the "cache reuse" acceptance criterion (DB-VER-02 line 286 of SPEC) is structurally unsatisfiable.
**Why it happens:** SPEC was written from an older snapshot of the schema; live migrations have moved on.
**How to avoid:** Planner must surface this in PLAN.md (with the live-schema citations from §Landmines #1) and ask operator for reconciliation before locking the L2 migration shape.
**Warning signs:** Reading the SPEC's "GLOBAL — anyone-can-read" line and not checking `\d linkedin_grades` on staging first.

### Pitfall 2: Forgetting Frontend Cutover in Same PR as Migration
**What goes wrong:** Layer 1 or Layer 4 migration ships first; frontend deploys later. Users hit `target_roles` (gone) or `saved_jobs` (dropped) → 500 errors.
**Why it happens:** Treating SQL and TS as separable PRs.
**How to avoid:** PLAN.md must explicitly bundle migration + all frontend cutover sites + types regen + test updates into one PR (per CONTEXT.md atomicity constraint).
**Warning signs:** Plan slicing that separates "migration" from "frontend wiring" into different waves.

### Pitfall 3: `pg_cron` Job Created Before GUCs Set in a New Environment
**What goes wrong:** Cron tick fires `net.http_post` with `current_setting('app.functions_base_url', true) → NULL`, producing invalid HTTP calls that log noise indefinitely.
**Why it happens:** New environment provisioned without the Phase 12 ALTER DATABASE setup.
**How to avoid:** Pre-deploy check (in plan): verify `current_setting('app.functions_base_url', true) IS NOT NULL` before cron creation. Migration's `current_setting(..., true)` argument prevents the migration apply itself from erroring — just log-noisy.
**Warning signs:** Fresh staging/prod environment + cron deploy without GUC verification.

### Pitfall 4: `extract-analysis-structure` Parsing Drift
**What goes wrong:** Anthropic response shape varies across tiers/features (Phase 37 introduced tier-specific variants). Extractor throws → row never gets structured signals → catchup cron re-fires forever.
**Why it happens:** Treating `analysis_results.raw_response` as a stable schema.
**How to avoid:** Defensive parsing per extractor: optional chaining everywhere; emit `extract_warning` log lines for missing fields; commit per-feature **fixture files** under `supabase/functions/extract-analysis-structure/__tests__/fixtures/` snapshotted from real staging responses; Deno unit tests run via the existing `run-edge-tests.ps1` shape.
**Warning signs:** No test fixtures; extractor wraps everything in `try { JSON.parse(...) } catch`.

### Pitfall 5: Storage Cascade Delete Race
**What goes wrong:** `admin-delete-user` deletes `auth.users` before Storage enumeration completes; orphaned `ai-archives/{user_id}/**` objects remain because the user_id-folder access policy now denies the service-role enumeration (it shouldn't — service role bypasses RLS — but `.list()` is paginated and incomplete enumeration leaves objects).
**Why it happens:** Treating `.list()` as returning everything in one call; default `limit: 100`.
**How to avoid:** Paginate explicitly. Pattern:
```typescript
let offset = 0;
const pageSize = 1000;
const allPaths: string[] = [];
while (true) {
  const { data, error } = await supabase.storage.from('ai-archives').list(`${userId}/`, { limit: pageSize, offset });
  if (error || !data || data.length === 0) break;
  allPaths.push(...data.map(f => `${userId}/${f.name}`));
  if (data.length < pageSize) break;
  offset += pageSize;
}
if (allPaths.length) await supabase.storage.from('ai-archives').remove(allPaths);
```
Also recurses through subfolders (`{table}/` levels) — Storage `.list()` is NOT recursive; planner must walk subfolders or use a flat path scheme.
**Warning signs:** Single `.list()` call without pagination, or single-call with no offset.

### Pitfall 6: `record_feature_usage` RPC Hit on Every Re-Render
**What goes wrong:** `useFeatureUsage` `recordEvent('view_results')` fires inside a `useEffect` with no proper dependencies → re-fires on every state change → telemetry noise + write pressure.
**Why it happens:** Forgetting to gate on a "fired once" ref.
**How to avoid:** Pattern (planner enforces in `useFeatureUsage`):
```typescript
const firedRef = useRef<Set<string>>(new Set());
const recordEvent = useCallback((action: string) => {
  const key = `${feature}:${action}`;
  if (firedRef.current.has(key)) return;
  firedRef.current.add(key);
  supabase.rpc('record_feature_usage', { feature, action }).catch(err => console.warn(err));
}, [feature]);
```
For `submit` / `export` (actions that can legitimately repeat), reset the firedRef per-session or use a coarser dedup window.

### Pitfall 7: `cohort_peers` View Performance Drift
**What goes wrong:** L1's `EXPLAIN ANALYZE … < 50ms on ≥1000 rows` SC passes at migration time, but L4's `run_benchmarks_rollup()` joins `cohort_peers` × `scores` × `outcomes` and degrades to >5s as data grows.
**Why it happens:** View inlines the LEFT JOIN at query-plan time; without composite indexes on the JOIN keys it can sequence-scan.
**How to avoid:** L4 planner adds supporting indexes on `(school, year, major, target_industries)`, `(user_id, computed_at)` on `scores`, `(application_id)` on `outcomes` — measure with `EXPLAIN ANALYZE` against a synthetic dataset before declaring SC met.
**Warning signs:** L4 SC validates on <50 rows; production has 5000+.

### Pitfall 8: Backfill Transaction Time Exceeds Statement Timeout
**What goes wrong:** L5 backfill (DB-LIF-02) tries to archive 10K+ rows in a single transaction; hits Postgres statement timeout (default 30s in many Supabase tiers).
**Why it happens:** Naïve `INSERT INTO ai-archives ... SELECT FROM analysis_results WHERE ...` or unbounded loop in `run_lifecycle_sweep()`.
**How to avoid:** Chunked loop per CONTEXT (`LIMIT 1000` outer loop). For VERY large initial backfills, document an operator-step path: migration creates `run_lifecycle_sweep()` + cron only, operator runs `SELECT run_lifecycle_sweep()` manually in 1000-row chunks via SQL editor.
**Warning signs:** L5 plan assumes single-transaction backfill regardless of row count.

### Pitfall 9: `recruiting-lens` Auto-Create Adds Latency to a Critical Path
**What goes wrong:** L4 SPEC says "applications row inserted synchronously inside `recruiting-lens` edge function right after the response is computed, before returning to the client." A failed insert blocks the user response.
**Why it happens:** Synchronous insert in a critical path.
**How to avoid:** Insert is synchronous (per SPEC) BUT wrapped in `try/catch` with logged-warning-only failure. Layer 2 worker / catchup cron is the safety net (it can backfill `applications` from `analysis_results` where missing).
**Warning signs:** Recruiting-lens `applications` insert error throws and triggers `MeritRefundable` (would be a regression).

### Pitfall 10: `<RecommendationActions>` Mounted on a Page That Doesn't Have `recommendations` Rows
**What goes wrong:** L3 ships `<RecommendationActions>` mounted on all 4 Results pages, but for analyses that pre-date L2/L3 deploy there are no `recommendations` rows — the component renders without any controls visible (no buttons), and `record_recommendations_shown` is called with `[]`.
**Why it happens:** Forgetting that backfill of `recommendations` (via L2 catchup cron) takes ~15 minutes; pre-existing analyses never get backfilled at all.
**How to avoid:** Component guards on `recommendations.length === 0` and renders nothing (no empty container). Documented behavior: "Recommendations are extracted post-analysis; pre-Phase-42 analyses don't get the new UI." Operator runs one-shot backfill if desired.
**Warning signs:** Component renders empty action bar for legacy analyses.

---

## Code Examples

### Example 1: Layer 1 Migration Sketch

```sql
-- Phase 42 · Layer 1 · DB-USR-01..06 / DB-TGT-01..02
-- Sections:
--   1. ADD COLUMNs on profiles
--   2. CREATE TABLE career_targets + RLS + trigger
--   3. BACKFILL from profiles.target_roles + .career_interests
--   4. DROP legacy profiles.target_roles + .career_interests
--   5. INDEXES + cohort_peers VIEW
--   6. COMMENTS
--   7. VERIFICATION DO $$ block

-- Down-migration (forward-only deploy; reference only):
--   ALTER TABLE public.profiles
--     ADD COLUMN IF NOT EXISTS target_roles text[] DEFAULT '{}',
--     ADD COLUMN IF NOT EXISTS career_interests text[] DEFAULT '{}';
--   UPDATE public.profiles p SET target_roles = ct.target_roles,
--     career_interests = ct.target_industries
--     FROM public.career_targets ct WHERE ct.user_id = p.id;
--   DROP VIEW public.cohort_peers; DROP TABLE public.career_targets;
--   ALTER TABLE public.profiles DROP COLUMN school, DROP COLUMN major, ...;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school              text NULL,
  ADD COLUMN IF NOT EXISTS major               text NULL,
  ADD COLUMN IF NOT EXISTS year                text NULL,
  ADD COLUMN IF NOT EXISTS graduation_year     integer NULL,
  ADD COLUMN IF NOT EXISTS location_preference text NULL;

CREATE TABLE IF NOT EXISTS public.career_targets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  target_industries   text[] DEFAULT '{}',
  target_roles        text[] DEFAULT '{}',
  target_companies    text[] DEFAULT '{}',
  location_preference text,
  career_goals        text CHECK (career_goals IS NULL OR length(career_goals) <= 500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.career_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_targets_select_own ON public.career_targets;
CREATE POLICY career_targets_select_own ON public.career_targets FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS career_targets_insert_own ON public.career_targets;
CREATE POLICY career_targets_insert_own ON public.career_targets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS career_targets_update_own ON public.career_targets;
CREATE POLICY career_targets_update_own ON public.career_targets FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_career_targets_updated_at ON public.career_targets;
CREATE TRIGGER update_career_targets_updated_at
  BEFORE UPDATE ON public.career_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill (idempotent; ON CONFLICT skips already-migrated users)
INSERT INTO public.career_targets (user_id, target_roles, target_industries)
SELECT id,
       COALESCE(target_roles, '{}'),
       COALESCE(career_interests, '{}')
FROM public.profiles
WHERE (target_roles IS NOT NULL AND array_length(target_roles, 1) > 0)
   OR (career_interests IS NOT NULL AND array_length(career_interests, 1) > 0)
ON CONFLICT (user_id) DO NOTHING;

-- Drop legacy columns (after backfill; frontend cutover ships in same PR)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS target_roles,
  DROP COLUMN IF EXISTS career_interests;

-- Indexes + view
CREATE INDEX IF NOT EXISTS idx_profiles_cohort_key
  ON public.profiles (school, year, major) WHERE school IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_career_targets_industries_gin
  ON public.career_targets USING GIN (target_industries);
CREATE INDEX IF NOT EXISTS idx_career_targets_roles_gin
  ON public.career_targets USING GIN (target_roles);

DROP VIEW IF EXISTS public.cohort_peers;
CREATE VIEW public.cohort_peers AS
  SELECT p.id AS user_id, p.school, p.major, p.year, p.graduation_year,
         ct.target_industries, ct.target_roles, ct.target_companies,
         ct.location_preference
    FROM public.profiles p
    LEFT JOIN public.career_targets ct ON ct.user_id = p.id
   WHERE p.school IS NOT NULL;

-- Comments + verification DO $$ block (omitted for brevity — mirror Phase 29 shape)
```

### Example 2: `extract-analysis-structure` Idempotent Insert

```typescript
// supabase/functions/extract-analysis-structure/extract-resume.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function extractResume(
  supabase: SupabaseClient,
  analysisResult: { id: string; user_id: string; source_reference: string; raw_response: any },
  log: ReturnType<typeof createLogger>,
): Promise<Response> {
  const { id: analysisId, user_id, source_reference: resumeId, raw_response: raw } = analysisResult;

  // Idempotent: dedup by (user_id, source_analysis_results_id)
  const existing = await supabase.from('resume_versions')
    .select('id').eq('user_id', user_id).eq('source_analysis_results_id', analysisId).maybeSingle();
  if (existing.data?.id) {
    log.info('skip-already-extracted', { analysisId, versionId: existing.data.id });
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // supersedes_id = most recent version for this user+resume
  const prev = await supabase.from('resume_versions')
    .select('id').eq('user_id', user_id).eq('resume_id', resumeId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const versionInsert = await supabase.from('resume_versions').insert({
    user_id,
    resume_id: resumeId,
    source_analysis_results_id: analysisId,
    parsed_summary: { /* defensive extraction from raw */ },
    overall_score: raw?.overallScore ?? null,
    supersedes_id: prev.data?.id ?? null,
  }).select('id').single();

  if (versionInsert.error) {
    log.error('version-insert-failed', { error: versionInsert.error.message });
    return new Response(JSON.stringify({ error: 'version insert failed' }), { status: 500 });
  }

  const versionId = versionInsert.data.id;
  // ... fan out to resume_sections, resume_bullets, scores, recommendations ...
  // ... emit per-fan-out structured logs ...

  log.info('extract-resume-success', { analysisId, versionId });
  return new Response(JSON.stringify({ ok: true, versionId }), { status: 200 });
}
```

### Example 3: SECURITY-DEFINER RLS Helper for Polymorphic `scores.version_id`

```sql
CREATE OR REPLACE FUNCTION public.auth_owns_version(p_version_id uuid, p_version_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_version_type
    WHEN 'resume' THEN EXISTS (
      SELECT 1 FROM public.resume_versions WHERE id = p_version_id AND user_id = auth.uid()
    )
    WHEN 'linkedin' THEN EXISTS (
      SELECT 1 FROM public.linkedin_versions WHERE id = p_version_id AND user_id = auth.uid()
    )
    ELSE FALSE
  END;
$$;

CREATE POLICY scores_select_own ON public.scores FOR SELECT TO authenticated
  USING (public.auth_owns_version(version_id, version_type));
```

### Example 4: SECURITY-DEFINER RPC for `record_recommendations_shown`

```sql
CREATE OR REPLACE FUNCTION public.record_recommendations_shown(rec_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.recommendations
    SET shown_at = now()
   WHERE shown_at IS NULL
     AND user_id = auth.uid()
     AND id = ANY(rec_ids);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.record_recommendations_shown(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_recommendations_shown(uuid[]) TO authenticated;
```

### Example 5: `archive-reader.ts` Fall-Through Helper

```typescript
// supabase/functions/_shared/archive-reader.ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { gunzip } from 'https://deno.land/x/compress@v0.4.5/mod.ts'; // see Open Question

/**
 * Reads an inline-blob column with Storage fall-through.
 * Returns the inline value if present; otherwise downloads + gunzips the archive.
 * Returns null if both are missing.
 */
export async function readWithArchiveFallback<T = unknown>(
  client: SupabaseClient,
  table: string,
  rowId: string,
  inlineColumn: string,
  archivePathColumn: string,
): Promise<T | null> {
  const { data, error } = await client.from(table)
    .select(`${inlineColumn}, ${archivePathColumn}`)
    .eq('id', rowId)
    .single();
  if (error || !data) return null;

  const inline = (data as any)[inlineColumn];
  if (inline !== null && inline !== undefined) return inline as T;

  const archivePath = (data as any)[archivePathColumn] as string | null;
  if (!archivePath) return null;

  const { data: blob, error: dlError } = await client.storage.from('ai-archives').download(archivePath);
  if (dlError || !blob) {
    console.warn(`[archive-reader] download failed for ${archivePath}:`, dlError);
    return null;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decompressed = gunzip(bytes);
  const text = new TextDecoder().decode(decompressed);
  return JSON.parse(text) as T;
}
```

---

## Validation Architecture (Nyquist)

Because the SPEC's 32 REQ-IDs map across 5 sequential layers, validation MUST happen layer-by-layer (no Big-Bang validation at the end of the phase).

### Validation Levels

| Level | Mechanism | When | Source |
|-------|-----------|------|--------|
| L0 (compile/lint) | `npm run lint` + `npm run build` after each layer's frontend cutover | Per-layer post-deploy | Existing `eslint.config.js` + Vite |
| L1 (unit) | `vitest run` for frontend hooks/components; Deno tests for `_shared/archive-reader.ts` and `extract-analysis-structure/extract-*.ts` extractors with fixture JSON | Pre-deploy per layer | Existing `vitest` config + `scripts/run-edge-tests.ps1` extended |
| L2 (migration verification) | Embedded `DO $$ ... $$` block in each migration file (Phase 29 pattern) | Migration apply time | Phase 29 precedent |
| L3 (SQL integration) | Hand-runnable SQL queries on staging post-migration (one per Acceptance Criterion in SPEC); each layer has ~10–17 ACs to validate | Post-deploy staging | Manual SQL session per ACC |
| L4 (frontend smoke) | Manual smoke tests per layer: L1 = fill Profile → reload → see saved; L4 = analyze JD in Recruiting Lens → see row at `/applications`; etc. | Post-deploy staging | Operator smoke session |
| L5 (cross-layer integration) | After all 5 layers ship: end-to-end "user signs up → fills profile → uploads resume → analyzes → accepts a recommendation → reports outcome → benchmark rollup runs overnight → user sees percentile rank" | After L5 deploys | New E2E checklist (planner authors) |

### Validation Sampling Strategy (Nyquist)

For each layer, sample 4 dimensions:
- **Happy-path SQL** (table/RPC works as designed)
- **RLS cross-user** (user A cannot read/write user B's row)
- **Idempotency** (re-running migration or re-firing worker is no-op)
- **Failure isolation** (worker error doesn't propagate to parent flow)

Per-layer SC test count:
| Layer | SPEC AC count | Recommended sample size |
|-------|---------------|-------------------------|
| L1 | 13 | All 13 (small; trivial to validate) |
| L2 | 11 | All 11 + 3 worker-failure simulations |
| L3 | 14 | All 14 + 1 IPC-page negative-assertion |
| L4 | 17 | All 17 + 1 saved_jobs-pre/post count check + 1 cron idempotency rerun |
| L5 | 17 | All 17 + 1 cache-hit-rate regression (Phase 29/37 cache suite re-run) |

### Validation Artifacts Per Layer

Each layer's `XX-VERIFICATION.md` must capture:
- Pre-migration `pg_database_size()` (L5 only) and `\d` of affected tables
- Migration apply timestamps + verification block NOTICE output
- SQL queries used to validate each AC + actual results
- Frontend smoke test results (passes/fails with screenshots if UX touched)
- Cross-user RLS test results (manual SQL session as user A then user B)
- Any AC waivers + operator sign-off

### Out-of-Band Validation

- **Phase 37 cache hit-rate suite** (Phase 29/37 KPI) — must be re-run after L5 sweep ships; ≤5% absolute drop is the SPEC-locked gate.
- **No Anthropic API costs** during validation (no prompt changes; structured extraction reads existing `analysis_results.raw_response`).

---

## State of the Art

| Area | Pattern | Status |
|------|---------|--------|
| Atomic migrations | DO $$ verification + idempotent guards | Established Phase 29 |
| RLS contract | Service-role-writes + SELECT-own | Established Phase 29 |
| pg_cron HTTP webhooks | GUC-stored secrets + `current_setting(..., true)` | Established Phase 12 |
| Internal worker auth | `INTERNAL_JOB_SECRET` via `_shared/auth.ts` | Established Phase ~25 |
| Storage per-user folders | `auth.uid()::text = (storage.foldername(name))[1]` | Established initial migration (`20251113102013`) |
| Type regen workflow | Manual `supabase gen types --linked` + commit | Stable |
| Edge function tests | `deno test` via `scripts/run-edge-tests.ps1` | Established; extend for new extractors |
| Frontend tests | `vitest` for unit; manual smoke for integration | Stable |

**Deprecated/outdated:**
- The "global `linkedin_grades` cache" mental model — superseded by per-user-scoped semantics as of Phase 4 (`20260410235959`). SPEC needs reconciliation.

---

## Open Questions

1. **`linkedin_grades` live shape vs. SPEC assumption**
   - What we know: Live `linkedin_grades` has `user_id` + composite `(user_id, profile_identifier)` index; per-user, not global.
   - What's unclear: Whether L2 DB-VER-02 should redesign `linkedin_versions` (recommended) or whether SPEC should be amended to absorb `linkedin_versions` into `linkedin_grades`.
   - Recommendation: Surface in PLAN.md; ask operator. Probable resolution: keep `linkedin_versions` as a thin re-grade-history table (1 `linkedin_grades` row : N `linkedin_versions` rows over time).

2. **Gzip library for L5 archive uploads**
   - What we know: Deno does not bundle a gzip module in `std@0.168.0` (used elsewhere in this repo). `https://deno.land/x/compress@v0.4.5/mod.ts` is the typical third-party. Newer Deno stdlib has `std/io/streams` with native compression streams.
   - What's unclear: Whether to introduce a new external dependency or use the Web Streams `CompressionStream('gzip')` (available in modern Deno; ~2.0+).
   - Recommendation: Prefer `CompressionStream` (native, no new dep). Planner verifies availability in Supabase's Deno runtime (likely yes — Supabase uses Deno 1.40+).

3. **L4 `/applications` data-source pattern for overdue-banner**
   - What we know: SPEC defers to planner discretion; CONTEXT suggests client-side LEFT JOIN.
   - What's unclear: At ~50+ applications per user, client-side LEFT JOIN through Supabase REST is OK; at 500+ a dedicated VIEW or RPC scales better.
   - Recommendation: Ship client-side LEFT JOIN as MVP; add VIEW `applications_overdue` (or RPC `count_overdue_applications()`) in L4 plan if EXPLAIN reveals >100ms at expected scale.

4. **`Jobs.tsx` non-recruiting-lens swipe-save flow — fit with `applications`**
   - What we know: `Jobs.tsx:136` inserts to `saved_jobs` from job-discovery swipes (with `posted`, `salary`, `url` populated). These columns don't exist on the SPEC'd `applications` table.
   - What's unclear: Whether the swipe-save flow should be dropped, repointed at `applications` with extra columns, or routed via `job_descriptions`.
   - Recommendation: Add `application_source = 'job_discovery'`, drop `posted`/`salary`/`url` (not load-bearing for predictions), document with operator. Alternative: include them as nullable columns on `applications` for backward compatibility.

5. **`extract-analysis-structure` deployment relationship to existing `analyze-*` functions**
   - What we know: Existing `analyze-resume` adds fire-and-forget webhook AFTER user response. Worker is a sibling edge function.
   - What's unclear: How tightly coupled should the worker be? Should it share `_shared/` modules (yes per CONTEXT) or eventually use Postgres triggers / Realtime?
   - Recommendation: Out of scope for v1; webhook + catchup cron is sufficient. Future-proof by keeping the worker stateless and idempotent — switching to Postgres triggers later is a backend-only change.

6. **`feature_usage` deduplication window**
   - What we know: SPEC says no batching; CONTEXT allows hook-level dedup at planner discretion.
   - What's unclear: Whether `view_results` should fire once per page mount, once per analysis viewing, or once per (analysis, user, day).
   - Recommendation: Per-mount dedup via `useRef` (Pitfall 6 pattern). Documented as such in the hook.

---

## Sources

### Primary (HIGH confidence — codebase-verified)

**Migrations (precedent / live state):**
- `supabase/migrations/20260512000001_resumes_extracted_text.sql` — Atomic migration + DO $$ verification model
- `supabase/migrations/20260512000000_analysis_cache_table.sql` — Service-role-writes + SELECT-own RLS template; CRITICAL flags on SEC-06 anti-pattern
- `supabase/migrations/20251113102013_aa07c3f5-c7ff-4492-9a5b-6867ce76d3a7.sql` — Storage bucket + per-user-folder RLS template
- `supabase/migrations/20260310000000_add_keep_warm_cron.sql` — Simple pg_cron HTTP-post (hard-coded URL, no auth)
- `supabase/migrations/20260415000001_phase_12_stripe_products_webhook.sql` — Production pg_cron + pg_net + GUC-stored secrets (Layer 2/4/5 model)
- `supabase/migrations/20260116215237_b1059be4-642c-4a99-99ce-370193135ef2.sql` — `CREATE EXTENSION pg_cron + pg_net` (already enabled)
- `supabase/migrations/20260418000000_interview_prep_tables.sql` — Idempotent ALTER + CHECK guards + RLS-via-parent-join precedent
- `supabase/migrations/20260330000000_add_rate_limit_counters.sql` — pg_cron pure-SQL DELETE pattern (alternative to webhook)
- `supabase/migrations/20251114012619_41005e57-…sql` — Original `saved_jobs` schema (Layer 4 backfill source)
- `supabase/migrations/20251126120525_…sql` — Original `linkedin_grades` (global) schema
- `supabase/migrations/20251223075804_…sql` — **`linkedin_grades` ADD COLUMN user_id** (landmine §1)
- `supabase/migrations/20260410235959_linkedin_grades_drop_unique_identifier.sql` — **Composite `(user_id, profile_identifier)` index** (landmine §1)
- `supabase/migrations/20251218042310_…sql` — `linkedin_grades` policy tightened to authenticated-only

**Edge functions:**
- `supabase/functions/_shared/auth.ts` — `requireAuth`, `requireInternalOrUserAuth`, `timingSafeEqual` secret comparison
- `supabase/functions/_shared/logger.ts` — `createLogger(fn, reqId?)` structured JSON
- `supabase/functions/_shared/supabase-client.ts` — Singleton `getServiceClient`, `getSupabaseUrl`, `getServiceRoleKey`
- `supabase/functions/process-resume-analysis-job/index.ts` — Internal worker pattern (Layer 2 model)
- `supabase/functions/analyze-resume/index.ts` — `persistResumeAnalysis`, `completeAndRecordSuccess` (Layer 2 webhook insertion site)
- `supabase/functions/recruiting-lens/index.ts` — Existing `saved_jobs` upsert + cache write (Layer 4 cutover site)
- `supabase/functions/grade-linkedin/index.ts` — Existing `linkedin_grades.grading_data` write + `analysis_cache.raw_response` write
- `supabase/functions/admin-delete-user/index.ts` — Account deletion flow (Layer 5 extension site)

**Frontend:**
- `src/pages/Profile.tsx` (lines 207–236) — `handleSave` partial-failure toast pattern (Layer 1 + 4 model)
- `src/pages/Dashboard.tsx` (lines 125, 160, 200+) — `saved_jobs` reads/deletes + banner mount point (`RunningLowCard` precedent)
- `src/pages/RecruitingLens.tsx` (line 317) — `saved_jobs` read filtered by `location='Recruiting Lens'`
- `src/pages/Jobs.tsx` (line 136) — `saved_jobs` insert from swipe-save flow
- `src/pages/Onboarding.tsx` (lines 170–180, 302–317) — Profile read/write of `target_roles` + `career_interests` (Layer 1 cutover site)
- `src/App.tsx` (lines 49–105) — Route registration pattern (Layer 4 `/applications` model)
- `src/integrations/supabase/types.ts` — Generated types mirror (regenerated per layer)

**Planning artifacts:**
- `.planning/phases/42-database-foundation-users-career-targets/42-CONTEXT.md` — Locked decisions for all 5 layers
- `.planning/phases/42-database-foundation-users-career-targets/42-SPEC.md` — 32 locked REQ-IDs + acceptance criteria
- `.planning/STATE.md` — Phase 42 consolidation rationale (2026-05-21 entry) + open milestone-graduation question
- `.planning/ROADMAP.md` — Per-layer Goal / Success Criteria / Out-of-Scope

### Secondary (MEDIUM confidence — convention-based)

- Phase 12 deploy runbook (referenced in `20260415000001_*.sql` header) — confirms staging + prod GUCs should already be set
- Phase 29 verification audit (referenced in `42-CONTEXT.md`) — confirms cache hit-rate KPI is the L5 regression gate
- Existing `vitest` and `deno test` test infrastructure — extensions for L2/L5 follow established shape

### Tertiary (LOW confidence — flagged for validation)

- Exact Deno stdlib version available in current Supabase edge runtime (`CompressionStream('gzip')` support) — planner should verify against a deployed function before locking L5 dependency choice (Open Question #2)
- Exact GUC state in current staging/prod databases (`SHOW app.functions_base_url`) — should be set per Phase 12 but operator should verify pre-deploy

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library/tool already in use in this repo
- Architecture patterns: HIGH — every pattern has a committed-migration or committed-edge-function precedent
- Pitfalls: HIGH — all 10 derived from code inspection (not speculation)
- Landmines: HIGH — verified by reading the relevant migrations + source files
- Open questions: MEDIUM — flagged as such with concrete recommendations

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (30 days — stable Supabase/Deno/React ecosystem)

**What might I have missed?** (Self-audit)
- Did NOT exhaustively read every Results-page-rendering site for L3 mount points; planner should grep for "suggestion" / "recommendation" rendering during plan-out to confirm 4 mount points.
- Did NOT verify Anthropic response schema stability across the last 3 months of `analyze-resume` deploys (Phase 37 introduced tier variants); planner should `git log -p supabase/functions/_shared/resume-prompts.ts` for the latest output shape before locking the L2 extractor schema.
- Did NOT measure `analysis_results` row count on production; the L2 catchup cron's "scan rows older than 5 minutes" cost depends on this. Likely small (low thousands) but operator should confirm.
- Did NOT investigate whether Vercel Speed Insights / Analytics surface a `view_results` event already — L3 `feature_usage` might be redundant with existing telemetry. Planner reviews if cost/benefit warrants.

---

*Phase: 42-database-foundation-users-career-targets (5-layer consolidated)*
*Research complete: 2026-05-25*
*Next step: `/gsd-plan-phase 42` — decompose into 5 sequential layer plans (within each layer, parallelism possible for migration + frontend cutover + types regen)*
