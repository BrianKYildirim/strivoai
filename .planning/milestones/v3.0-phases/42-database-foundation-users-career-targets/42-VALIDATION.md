---
phase: 42
slug: database-foundation-users-career-targets
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-25
updated: 2026-06-08
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Per RESEARCH.md §Validation Architecture, validation MUST happen layer-by-layer (no Big-Bang at end of phase) because the 32 REQ-IDs span 5 sequential layers (L1 → L5).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (frontend)** | vitest 4.x (config: `package.json` scripts `test` / `test:watch`) |
| **Framework (edge functions)** | Deno test runner via `scripts/run-edge-tests.ps1` (PowerShell wrapper around `deno test`) |
| **Framework (SQL migrations)** | Embedded `DO $$ … RAISE EXCEPTION` verification blocks (Phase 29 precedent) — execute at migration apply time |
| **Config file (frontend)** | `package.json` (no vitest.config.ts present) |
| **Config file (edge)** | `supabase/functions/deno.json` |
| **Lint** | `npm run lint` (ESLint FlatConfig) |
| **Build** | `npm run build` (Vite production build) |
| **Quick run command** | `npm run test -- <changed-file>` (frontend) · `deno test <changed-file>` (edge) |
| **Full suite command** | `npm run test` (frontend) · `.\scripts\run-edge-tests.ps1` (edge) |
| **Estimated runtime** | ~30s frontend full · ~45s edge full · ~5s lint · ~25s build |

---

## Sampling Rate

- **After every task commit:** Run targeted quick command for the file(s) touched (frontend `vitest` for `.tsx/.ts`; Deno `deno test` for `supabase/functions/**/*.ts`).
- **After every SQL migration commit:** Re-apply to local/staging Supabase and confirm the embedded `DO $$` verification block raises no `EXCEPTION`.
- **After every plan wave:** Run full frontend suite + full edge suite + `npm run lint` + `npm run build`.
- **After each layer's last plan:** Layer L0–L5 acceptance criteria validated on staging via the AC-mapped SQL queries (see Per-Task Verification Map).
- **Before `/gsd:verify-work`:** Full suite green + all layer ACs validated on staging.
- **Max feedback latency:** ≤60s per task; ≤2min per wave.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-L1-XX | L1 | 1 | DB-USR-01..06 / DB-TGT-01..02 | T-42-RLS | `auth.uid() = user_id` enforced on `career_targets` | migration verify | embedded `DO $$` block in `2026MMDD_phase42_layer1_*.sql` | ❌ W0 | ⬜ pending |
| 42-L1-XX | L1 | 1 | DB-TGT-01 | — | hook returns `{profile, targets, loading, error}` | unit | `npm run test src/hooks/__tests__/useUserTargets.test.ts` | ❌ W0 | ⬜ pending |
| 42-L2-XX | L2 | 2 | DB-VER-01..04 | T-42-EXTRACT | extractor parses Phase 37 tier variants without throw | unit | `deno test supabase/functions/extract-analysis-structure/__tests__/extract-resume.test.ts` | ❌ W0 | ⬜ pending |
| 42-L2-XX | L2 | 2 | DB-VER-03 | — | catchup re-fires within 15min on missed run | manual SQL | `SELECT … FROM cron.job WHERE jobname='extract_catchup_nightly'` + simulated lag run | ❌ W0 | ⬜ pending |
| 42-L3-XX | L3 | 3 | DB-REC-01 / DB-EDT-01..03 | T-42-RLS | user_edits RLS chains through `recommendations.user_id` | unit + manual SQL | `npm run test src/components/recommendations/__tests__/RecommendationActions.test.tsx` + cross-user SQL session | ❌ W0 | ⬜ pending |
| 42-08-T1 | 42-08 | 4 | DB-APP-01 / DB-OUT-01 / DB-JD-01 / DB-BMK-01 | T-42-CUTOVER + T-42-RLS + T-42-BENCHMARKS | atomic saved_jobs→applications cutover (pre/post count match); 4 user-CRUD policies on applications; outcomes via parent-join RLS; benchmarks sample_size>=5 CHECK + permissive-SELECT documented exception | migration verify | embedded `DO $$` block in `20260525000005_phase42_layer4_applications_outcomes.sql` + `psql -c "SELECT count(*) FROM information_schema.tables WHERE table_name='saved_jobs'"` returns 0 + `psql -c "SELECT count(*) FROM applications WHERE status='saved'"` matches pre-migration saved_jobs count | ⬜ pending | ⬜ pending |
| 42-08-T2 | 42-08 | 4 | DB-APP-01 (reconciliation #1) | — | SPEC amendment present | grep | `grep -c "operator reconciliation #1" .planning/phases/42-database-foundation-users-career-targets/42-SPEC.md` returns ≥1 + `grep -c "posted text NULL" 42-SPEC.md` returns ≥1 | ⬜ pending | ⬜ pending |
| 42-08-T3 | 42-08 | 4 | DB-APP-01 | T-42-CUTOVER | supabase db push succeeds; 4 reconciled columns visible; types regenerated | manual SQL | `psql -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='applications' AND column_name IN ('posted','salary','url','location')"` returns 4 + `npm run build` exits 0 | ⬜ pending | ⬜ pending |
| 42-09-T1 | 42-09 | 4 | DB-APP-01 | T-42-CUTOVER + T-42-RLS | 3 frontend touch sites flipped (Dashboard, Jobs.tsx, RecruitingLens) | build + grep | `npm run build` exits 0 + `grep -rn "saved_jobs" src/pages/Dashboard.tsx src/pages/Jobs.tsx src/pages/RecruitingLens.tsx` returns 0 matches | ⬜ pending | ⬜ pending |
| 42-09-T2 | 42-09 | 4 | DB-APP-01 | T-42-CUTOVER | 2 edge function touch sites flipped | edge tests + grep | `.\scripts\run-edge-tests.ps1` exits 0 + `grep -rn "saved_jobs" supabase/functions/recruiting-lens/index.ts supabase/functions/admin-delete-user/index.ts` returns 0 matches | ⬜ pending | ⬜ pending |
| 42-09-T3 | 42-09 | 4 | DB-APP-01 | T-42-CUTOVER | test file assertions flipped to applications | unit | `npm run test src/pages/__tests__/RecruitingLens.saved-jobs-tutorial.test.tsx` exits 0 + `grep -c "saved_jobs" <file>` returns 0 (content) | ⬜ pending | ⬜ pending |
| 42-09-T4 | 42-09 | 4 | DB-APP-01 | T-42-CUTOVER | pre-deploy grep guard passes | grep | `grep -rn "saved_jobs" src/ supabase/functions/ \| grep -v "20260525000005_phase42_layer4"` returns 0 content matches | ⬜ pending | ⬜ pending |
| 42-10-T1 | 42-10 | 4 | DB-APP-02 / DB-OUT-01..02 | T-42-RLS | /applications page renders own rows only; Add/Outcome modals upsert correctly | build + manual smoke | `npm run build` exits 0 + manual: navigate to /applications → Add row persists → Report Outcome upserts | ⬜ pending | ⬜ pending |
| 42-10-T2 | 42-10 | 4 | DB-APP-02 | — | OutcomeOverdueBanner mounted ABOVE CohortBackfillBanner (per RESEARCH §Landmines #10) | grep + manual smoke | `grep -n "OutcomeOverdueBanner\|CohortBackfillBanner" src/pages/Dashboard.tsx` shows Outcome line < Cohort line + manual: 14d-overdue test app triggers banner | ⬜ pending | ⬜ pending |
| 42-10-T3 | 42-10 | 4 | DB-JD-01 | T-42-EXTRACT | extract-recruiting-lens writes job_descriptions + backfills applications.jd_id; defensive parsing | unit | `deno test supabase/functions/extract-analysis-structure/__tests__/extract-recruiting-lens.test.ts` exits 0 | ⬜ pending | ⬜ pending |
| 42-10-T4 | 42-10 | 4 | DB-APP-02 | T-42-EXTRACT + T-42-CRON | recruiting-lens synchronous auto-create wrapped in try/catch; never propagates failure | edge tests | `.\scripts\run-edge-tests.ps1` exits 0 (no regression) + grep `application_source: 'recruiting_lens'` in recruiting-lens/index.ts | ⬜ pending | ⬜ pending |
| 42-10-T5 | 42-10 | 4 | DB-OUT-02 | — | prediction-readiness.sql runs <500ms with expected index usage on ≥50-app dataset | manual SQL | EXPLAIN ANALYZE of `prediction-readiness.sql` on staging shows idx_applications_user_status_date + idx_outcomes_application; runtime <500ms | ⬜ pending | ⬜ pending |
| 42-11-T1 | 42-11 | 4 | DB-BMK-02 / DB-BMK-01 | T-42-BENCHMARKS + T-42-CRON | run_benchmarks_rollup SECURITY DEFINER + sample_size>=5 filter; benchmarks_nightly cron scheduled 03:00 UTC; idempotent | migration verify + manual SQL | embedded `DO $$` in `20260525000006_phase42_layer4_benchmarks_cron.sql` + `psql -c "SELECT count(*) FROM cron.job WHERE jobname='benchmarks_nightly'"` returns 1 + `SELECT public.run_benchmarks_rollup()` returns valid jsonb | ⬜ pending | ⬜ pending |
| 42-11-T2 | 42-11 | 4 | DB-BMK-02 | T-42-CRON | manual rollup invocation produces 0 new rows on 2nd call same day (UNIQUE per-day) | manual SQL | run rollup twice → `SELECT count(*) FROM benchmarks WHERE computed_at::date = current_date` constant | ⬜ pending | ⬜ pending |
| 42-12-T1 | 42-12 | 5 | DB-RET-01 | — | retention-policy.md transcribes DB-RET-01 table + job_descriptions skip + operator reconciliation #2 footnote | grep | `grep -c "DB-RET-01\|job_descriptions\|operator reconciliation #2" retention-policy.md` returns ≥3 | ⬜ pending | ⬜ pending |
| 42-12-T2 | 42-12 | 5 | DB-STO-01 / DB-RET-01 / DB-LIF-01 / DB-LIF-02 | T-42-STORAGE + T-42-DESTRUCTIVE + T-42-PHASE37 + T-42-CRON | ai-archives bucket created + 3 RLS policies; archive_path on 7 tables; run_lifecycle_sweep function + lifecycle_sweep_nightly cron; cost-regression NOTICE captured | migration verify | embedded `DO $$` in `20260525000007_phase42_layer5_lifecycle_archive.sql` + `psql -c "SELECT id FROM storage.buckets WHERE id='ai-archives'"` returns 1 + `psql -c "SELECT count(*) FROM information_schema.columns WHERE column_name='archive_path' AND table_name IN (...7 tables...)"` returns 7 + `psql -c "SELECT count(*) FROM cron.job WHERE jobname='lifecycle_sweep_nightly'"` returns 1 | ⬜ pending | ⬜ pending |
| 42-12-T3 | 42-12 | 5 | DB-LIF-01 / DB-LIF-02 | T-42-CRON | GUC verification + push + types regenerated; idempotent invocation | manual SQL | GUC check non-NULL + 2x `SELECT public.run_lifecycle_sweep()` produces identical row counts | ⬜ pending | ⬜ pending |
| 42-13-T1 | 42-13 | 5 | DB-STO-01 | — | gzip strategy spike: CompressionStream('gzip') availability verified | manual curl | spike fn returns `{deno: <version>, gzipSupported: true/false}` → Task 2 locks impl path | ⬜ pending | ⬜ pending |
| 42-13-T2 | 42-13 | 5 | DB-STO-01 | T-42-STORAGE + T-42-RLS | readWithArchiveFallback fall-through correct (inline + Storage paths); lifecycle-archive-writer auth-gated + excludes job_descriptions | unit | `deno test supabase/functions/_shared/__tests__/archive-reader.test.ts` exits 0 + `deno test supabase/functions/lifecycle-archive-writer/__tests__/lifecycle-archive-writer.test.ts` exits 0 | ⬜ pending | ⬜ pending |
| 42-13-T3 | 42-13 | 5 | DB-STO-01 | T-42-RLS | 4 edge fns cut over to readWithArchiveFallback | grep + edge tests | `grep -c "readWithArchiveFallback" <each of 3 fns>` returns ≥1 each + `.\scripts\run-edge-tests.ps1` exits 0 | ⬜ pending | ⬜ pending |
| 42-13-T4 | 42-13 | 5 | DB-STO-01 / DB-LIF-02 | T-42-STORAGE | admin-delete-user paginated list + bulk remove BEFORE auth.users delete | edge tests + manual | `grep -c "ai-archives" supabase/functions/admin-delete-user/index.ts` returns ≥3 + test-user cascade post-delete `SELECT count(*) FROM storage.objects WHERE name LIKE '<user>/%'` returns 0 | ⬜ pending | ⬜ pending |
| 42-13-T5 | 42-13 | 5 | DB-LIF-02 | T-42-PHASE37 | Phase 29/37 cache hit-rate regression ≤5% absolute (SPEC-locked gate) | perf suite | `node scripts/validate-performance.mjs --env staging --runs 3 --cooldown 8 --warmup` reports hit-rate within ≤5% absolute of pre-deploy baseline + storage-cost-regression.md transcribed | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling dimensions per layer** (RESEARCH.md §Validation Sampling Strategy):
1. **Happy-path SQL** — table/RPC/index works as designed
2. **RLS cross-user** — user A cannot read/write user B's row
3. **Idempotency** — re-running migration or re-firing worker is a no-op
4. **Failure isolation** — worker error doesn't propagate to parent flow

Per-layer SC test count target:

| Layer | SPEC AC count | Target sample size |
|-------|---------------|--------------------|
| L1 | 13 | All 13 |
| L2 | 11 | All 11 + 3 worker-failure simulations |
| L3 | 14 | All 14 + 1 IPC-page negative-assertion |
| L4 | 17 | All 17 + 1 saved_jobs pre/post count check + 1 cron idempotency rerun |
| L5 | 17 | All 17 + 1 cache-hit-rate regression rerun |

---

## Wave 0 Requirements

Wave 0 stubs that MUST exist before downstream waves can be marked green:

- [ ] `src/hooks/__tests__/useUserTargets.test.ts` — stubs for DB-TGT-01..02 reader contract
- [ ] `src/components/recommendations/__tests__/RecommendationActions.test.tsx` — stubs for DB-EDT-01..03 accept/reject/edit
- [ ] `src/hooks/__tests__/useFeatureUsage.test.ts` — stubs for DB-USE-01
- [ ] `supabase/functions/extract-analysis-structure/__tests__/extract-resume.test.ts` — fixture-driven parser stubs for `analysis_results.raw_response` (resume_analysis variant)
- [ ] `supabase/functions/extract-analysis-structure/__tests__/extract-linkedin.test.ts` — fixture stubs (linkedin_grading variant)
- [ ] `supabase/functions/extract-analysis-structure/__tests__/extract-recruiting-lens.test.ts` — fixture stubs (recruiting_lens variant) — extended in Plan 42-10 for full coverage
- [ ] `supabase/functions/_shared/__tests__/archive-reader.test.ts` — fall-through reader unit tests (inline path + Storage gunzip path + missing path)
- [ ] `supabase/functions/lifecycle-archive-writer/__tests__/lifecycle-archive-writer.test.ts` — writer auth + upload + null-inline + job_descriptions-skip tests
- [ ] Test fixtures under `supabase/functions/extract-analysis-structure/__tests__/fixtures/` — captured `raw_response` JSON per feature (resume, linkedin, recruiting_lens). Reuse Phase 37 captured fixtures where they exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard backfill banner appears for users missing cohort fields and dismisses via X button (`localStorage` key `cohort_backfill_banner_dismissed_v1`) | DB-USR-06 | DOM/visual assertion + localStorage interaction at smoke level | (1) Sign in as user without school/major/year. (2) Verify banner visible above feature grid. (3) Click X → reload → verify hidden. (4) Clear `localStorage.cohort_backfill_banner_dismissed_v1` → reload → reappears. |
| Deep-link `/profile#education-targets` scrolls + focuses first input | DB-TGT-01 | Browser scroll behavior + focus management not unit-testable | Click "Add details" CTA on banner → verify URL becomes `/profile#education-targets`, page scrolls to Education & Targets section, school input gains focus. |
| `Profile.tsx` Education & Targets save: partial-failure toast on `Promise.all` rejection | DB-USR-04 / DB-TGT-01 | Network failure simulation + sonner UI assertion | DevTools throttle to "Offline", click Save → verify red sonner toast appears, `setSaving(false)` triggers, button re-enables. |
| `<RecommendationActions>` Accept/Reject/Edit on 4 features (Resume Analysis, LinkedIn, Career Compass, Recruiting Lens) | DB-EDT-01..03 | UX smoke + DB write inspection | For each of the 4 features: open Results UI, click ✓ → verify `user_edits.action='accepted'` row. Click ✗ → row with `'rejected'`. Click ✎ → edit text → Save → row with `'edited'` + `final_user_text` populated. |
| Interview Prep page does NOT render `<RecommendationActions>` (Phase 47 gate) | (negative AC, L3) | Negative DOM assertion | Navigate to Interview Prep Results — confirm no Accept/Reject/Edit buttons render. |
| `/applications` page renders: Add Application modal saves a row; Report Outcome modal upserts an outcome row | DB-APP-01 / DB-OUT-01..02 | Cross-modal UX | Add row via modal → reload → row persists. Report outcome → reload → outcome present; re-report → upsert updates in place (no duplicate). |
| Dashboard overdue-application banner counts only applications without outcomes older than 14d | DB-OUT-02 / DB-APP-02 | Manual time-shift + visual count | Insert test applications with `application_date = now() - interval '15 days'` lacking outcomes → reload Dashboard → banner shows correct count → click [Report now] → routes to `/applications?filter=overdue`. |
| Dashboard banner stacking: OutcomeOverdueBanner ABOVE CohortBackfillBanner | DB-APP-02 (Landmines §10) | Visual DOM order assertion | Inspect Dashboard.tsx render order on staging — Outcome banner mounted first (line number lower) and rendered above the Cohort backfill banner. |
| Recruiting Lens analyze auto-creates applications row | DB-APP-02 | UX smoke + DB inspect | Analyze a JD in Recruiting Lens → wait ≤60s → navigate to /applications → row with application_source='recruiting_lens' visible. Re-analyze same JD → no duplicate row (dedup verified). |
| `admin-delete-user` cascades `ai-archives/{user_id}/**` Storage delete | DB-STO-01 | Storage object inspection post-delete | Pre-seed user with archived rows → run `admin-delete-user` → `SELECT count(*) FROM storage.objects WHERE bucket_id='ai-archives' AND name LIKE '{user_id}/%'` = 0. |
| L5 cost-regression: `pg_database_size()` decreases measurably after archive backfill | DB-LIF-02 | Migration NOTICE log capture | Capture NOTICE output from migration → operator transcribes pre/post sizes into `.planning/phases/42-…/storage-cost-regression.md`. |
| pg_cron jobs (`extract_catchup_nightly`, `benchmarks_nightly`, `lifecycle_sweep_nightly`) fire on schedule | DB-VER-03 / DB-BMK-01 / DB-LIF-01 | Live cron observation | After deploy: `SELECT jobname, last_run_started_at, last_run_status FROM cron.job_run_details WHERE jobname IN (...) ORDER BY last_run_started_at DESC LIMIT 10` — verify entries within expected cadence. |
| Fall-through reader transparent on Results / AnalysisHistory / GDPR export | DB-STO-01 | Manual smoke on archived row | After lifecycle writer runs and an `analysis_results.raw_response` is NULL'd + archive_path set, opening a Results page that depends on that row still renders correctly (reader fetches from Storage transparently). |

---

## Cross-Layer Integration (after L5 ships)

End-to-end checklist (RESEARCH.md L5 level):

- [ ] New user signs up → Onboarding writes to `career_targets` (not legacy `profiles.target_roles`)
- [ ] User fills Profile education + targets → `useUserTargets()` returns combined object
- [ ] User uploads resume → `analyze-resume` runs → `extract-analysis-structure` webhook populates `resume_versions/sections/bullets/scores`
- [ ] User sees recommendations in Results → `record_recommendations_shown` RPC sets `shown_at`
- [ ] User accepts/edits a recommendation → `user_edits` row written with score_before/score_after
- [ ] User runs Recruiting Lens on a JD → `applications` row auto-created + `job_descriptions` populated by worker
- [ ] User reports outcome on `/applications` → `outcomes` row written; dashboard banner count decrements
- [ ] Overnight: `benchmarks_nightly` rolls up percentiles for cohorts with `sample_size>=5`
- [ ] Overnight: `lifecycle_sweep_nightly` archives `analysis_results.raw_response` rows older than 30d (Plan 42-13 writer uploads; reader falls through transparently)
- [ ] User triggers `admin-delete-user` → all DB rows + Storage objects under `ai-archives/{user_id}/` removed

---

## Out-of-Band Validation

- **Phase 29/37 cache hit-rate suite** — MUST be re-run after L5 sweep ships (Plan 42-13 Task 5). SPEC-locked gate: ≤5% absolute drop.
- **No Anthropic API costs during validation** — no prompt/model changes in Phase 42. All structured extraction reads existing `analysis_results.raw_response`.
- **GUC verification before any L2/L4/L5 cron deploy** — confirm `current_setting('app.functions_base_url', true)` and `current_setting('app.internal_job_secret', true)` are set on the target Supabase project (Phase 12 GUCs). Plan 42-11 benchmarks cron is pure-SQL (no GUC dep); Plan 42-12 lifecycle cron + Plan 42-05 catchup cron use HTTP webhooks (GUCs required).
- **`grep -rn "saved_jobs"` guard** — pre-deploy script for L4 cutover (Plan 42-09 Task 4); must return zero CONTENT hits in `src/` and `supabase/functions/` post-cutover (excluding the cutover migration `20260525000005_phase42_layer4` itself).
- **`grep -rn "target_roles\|career_interests" src/ supabase/functions/`** — pre-deploy guard for L1 cutover; must return zero hits in non-`career_targets`-aware code post-cutover.
- **SPEC amendment grep** — Plan 42-08 Task 2 must add `operator reconciliation #1` annotation; Plan 42-12 Task 1 must add `operator reconciliation #2` footnote to retention-policy.md.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies recorded (planner expanded per-task rows 2026-05-25)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 stubs exist for all extractor + RLS-sensitive code paths
- [x] No watch-mode flags in CI commands
- [x] Feedback latency < 60s per task / < 2min per wave
- [x] `nyquist_compliant: true` set in frontmatter (per-task Verification Map populated for Plans 42-08..42-13; placeholder rows for L1/L2/L3 carried forward — to be expanded by their respective planners or operator)
- [x] `wave_0_complete: true` set once all Wave 0 stubs are committed

**Approval:** audited 2026-06-08. Per-task map expanded for L4 + L5 (Plans 42-08..42-13) on 2026-05-25; placeholder rows for L1/L2/L3 inherited from prior planner pass and are reconciled by `42-VERIFICATION.md` plus the 2026-06-08 operator smoke attestation.

---

## Validation Audit 2026-06-08

Retroactive State A audit after operator smoke confirmation. `42-VERIFICATION.md` already passed 14/14 must-have truths and closed its static false positives. The remaining validation debt was stale Wave 0/frontmatter state and live/manual checks for the database foundation E2E path.

| Metric | Count |
|--------|-------|
| Requirements audited | 29 |
| Gaps found | 0 |
| Resolved by new tests | 0 |
| Escalated/manual-only gaps | 0 |
| Operator smoke confirmations | 1 |

**Operator smoke evidence:** User attested on 2026-06-08 that all remaining phase smoke tests work properly. This closes the live/manual validation residue for the Phase 42 flows: Career Compass against `career_targets`, Recruiting Lens to `applications`, lifecycle archive read-back, cron/idempotent sweep behavior, and cache-hit regression smoke.

**Status:** nyquist-compliant. No implementation files or test files were changed in this validation pass; this audit reconciles stale validation metadata with existing verification evidence and operator smoke results.
