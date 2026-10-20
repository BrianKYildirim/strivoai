# Phase 36: History Persistence Parity Audit + Repair - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Close every history-write gap so `AnalysisHistory`'s listing, deep-link routing, and per-feature `?id=` hydration work for every successful AI run across all 5 features. Replace the fragile ±5-min proximity matcher with the explicit `usage_tracking.analysis_id` link shipped by Phase 29 (HIST-01). Specifically:

1. **HIST-02** — Resume Analysis writes an `analysis_results` row (`analysis_type='resume_analysis'`) on every successful run, in addition to the existing `resumes.grading_data` UPDATE.
2. **HIST-03** — Recruiting Lens Pro tier writes an `analysis_results` row (`analysis_type='recruiting_lens'`). Currently Elite-only.
3. **HIST-04** — Interview Prep `?id=<quiz_id>` hydration scaffold (staging-verified only per Phase 47 D-05; production filters IPC rows out).
4. **HIST-05** — `AnalysisHistory` lists every successful AI run across the 4 non-IPC features on production (all 5 on staging) with feature label, date, score, and a working deep-link.
5. **HIST-06** — All 5 features write a `usage_tracking` row on success with the new `analysis_id` populated. Failed runs DO NOT appear in History (post-success-only write pattern).
6. **HIST-07** — Build `process-recruiting-lens-job` worker so the orphaned async-fallback path at `recruiting-lens/index.ts:329-340` resolves to a real persisted analysis under Anthropic 529 storms.
7. **TEST-05** — Per-feature regression: Deno integration tests against staging assert `usage_tracking` row + per-feature row + `analysis_id` link populated on every successful analysis.

**Out of scope for Phase 36:** Per-feature output trim / prompt changes / cache integration (Phases 37–41); `saved_jobs` persistence (Phase 40 / RCL-04); per-feature cache wiring (Phases 37–40); merit cap behavioral changes (Phases 30/31); Pricing / Stripe (Phases 32/33).

</domain>

<decisions>
## Implementation Decisions

### Recruiting Lens async fallback (HIST-07)

- **D-01:** Build a new `process-recruiting-lens-job` edge function. Mirrors the proven `process-resume-analysis-job` / `process-career-analysis-job` shape: poll/drain `analysis_jobs` rows where `job_type='recruiting_lens'`, re-run the 3-call parallel analysis, merge, persist the `analysis_results` row, mark `analysis_jobs.status='completed'`. On unrecoverable failure, mark `status='failed'` and refund merits via the existing `MeritRefundable` taxonomy.
- **D-02:** On all-3-calls-529 overload in the sync path (`recruiting-lens/index.ts:325-353`), keep the existing `analysis_jobs` INSERT + 202 response shape (`{ jobId, status: 'queued' }`). The worker picks it up. No frontend contract change to the 202 response.
- **D-03:** Worker fires a completion email via the existing `send-strivo-email` scaffold (new `emailType: 'recruiting_lens'`) with a deep-link to `/recruiting-lens?id=<analysis_results.id>`. Matches the resume/career worker UX so users on overload retries don't feel abandoned.
- **D-04:** Frontend in Phase 36 does NOT add active polling of `get-analysis-job-status` for Recruiting Lens. Email-on-complete is the primary surface; `AnalysisHistory` is the secondary surface (the new `analysis_results` row appears there once written). If the user keeps the tab open, they see no change until they refresh — acceptable trade-off because real-overload-induced async should be rare.
- **D-05:** The worker writes ONLY to `analysis_results` in Phase 36 (HIST-03 scope). Phase 40 (RCL-04) extends BOTH the worker AND the sync path to also write to `saved_jobs`. Phase 36 keeps boundaries clean.

### HIST-02 — Resume Analysis writes analysis_results

- **D-06:** Every successful analyze-resume branch writes an `analysis_results` row (`analysis_type='resume_analysis'`). Four success branches today require the write: parallel-merge success (`analyze-resume/index.ts:~1349-1356`), fallback-single (`:1259-1281`), streaming SSE complete, and any other post-`mergeAndValidateResults` success path. Planner picks helper shape (single shared helper vs. per-branch inline) — recommendation: extract a `persistResumeAnalysis(supabase, { userId, resumeId, result, tier })` helper that returns the inserted `analysis_results.id`, so each branch becomes a single call.
- **D-07:** `analysis_results.source_reference` is set to `resumes.id` (string) for resume_analysis rows. AnalysisHistory routes `resume_analysis` clicks to `/results/{source_reference}` — preserves the existing `/results/:id` page contract. The `usage_tracking.analysis_id` separately points at `analysis_results.id` for the History linkage, and the `/results/:id` page itself continues to read `resumes` directly (no contract change at the page layer).
- **D-08:** `analysis_results.raw_response` for resume rows carries the full merged `grading_data` payload (same shape as `resumes.grading_data`). `primary_score` = `result.overallScore`. `key_insights` = the top 3 of `result.suggestions` titles or equivalent — exact selection is Claude's discretion to match the existing recruiting-lens/career-compass shape.

### HIST-03 — Recruiting Lens Pro persistence

- **D-09:** Drop the `resolvedTier === 'elite'` gate at `recruiting-lens/index.ts:273-285` and `:377-403`. Every successful Pro AND Elite run writes an `analysis_results` row. Free tier is unreachable in this code path (Recruiting Lens is paid-only).
- **D-10:** Insert shape is identical for Pro and Elite — same columns, same `primary_score = merged.overallMatch?.score`, same `raw_response.metadata` carry of `jobDescription` + `tier`. Tier is recorded inside `raw_response.metadata.tier` only, not as a separate column.

### HIST-04 — Interview Prep `?id=` (staging-only)

- **D-11:** Carry forward Phase 47 D-05: Interview Prep `?id=<quiz_id>` hydration is implemented in `src/pages/InterviewPrep.tsx` (currently zero `useSearchParams` matches — true gap). On production, `AnalysisHistory.tsx:315-319` already filters IPC rows out, so the hydration is never reached. On staging (`VITE_FEATURE_INTERVIEW_PREP=true`), hydration must work end-to-end: read `interview_quizzes` by id, plus `interview_quiz_answers` for quiz mode, render past flashcards / quiz content.
- **D-12:** Hydration logic stays in repo permanently — no deletion. Re-enable on production = single Vercel env-var flip (per Phase 47 D-06) + the future Interview Prep milestone. Phase 36 must not introduce any code that requires the flag to be on.

### HIST-06 — usage_tracking.analysis_id population (post-success unification)

- **D-13:** Unify all 5 features on the **post-success** `record_ai_usage(p_user_id, p_action_type, p_credits, p_analysis_id)` 4-arg overload (shipped by `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql`). The pre-write atomic `check_and_record_ai_usage` path (used today by analyze-career:1032, grade-linkedin:444, recruiting-lens:298) is replaced by an entitlement-check-only call + post-success write. Failed runs leave NO usage_tracking row — they do not appear in `AnalysisHistory`.
- **D-14:** Split `_shared/usage-checker.ts:checkAndRecordUsage` into two helpers:
  - `checkEntitlement(userId, actionType): Promise<{ allowed, resetDate, tier }>` — wraps a new RPC OR a read-only path that does NOT INSERT. Held under the existing advisory lock if a lock is still needed to prevent simultaneous-tier-cap-bypass; planner decides.
  - `recordUsageWithAnalysis(userId, actionType, credits, analysisId)` — thin wrapper over the 4-arg `record_ai_usage` RPC. Called by every feature after the per-feature row is persisted.
- **D-15:** Free-tier carve-out paths (analyze-career:712-720, :941-948; grade-linkedin:329, :357-361; recruiting-lens:259-270; interview-prep-analyze:601-603) already use post-success `record_ai_usage` (3-arg). Phase 36 upgrades them to the 4-arg form with `p_analysis_id`. Same write semantics — failed runs already left no row in those paths.
- **D-16:** Sequencing inside each feature on success: (1) Claude returns → (2) merge/validate → (3) INSERT per-feature row (`analysis_results` / `resumes` UPDATE / `linkedin_grades` / `interview_quizzes`) → (4) capture inserted `id` → (5) `recordUsageWithAnalysis(..., p_analysis_id = inserted_id)` → (6) cache write (CACHE-12 / Phase 29 D-05 `EdgeRuntime.waitUntil`) → (7) return JSON. If step (3) fails, abort before step (5) — no usage_tracking row written, merits refund via existing `MeritRefundable`.
- **D-17:** Cap-counter implication acknowledged: by Phase 36 ship date, Phase 30 (MER-11/12) has already removed `can_perform_ai_action()` from the paywall path; merit gateway is the sole credit gate. `usage_tracking` becomes a History-feed ledger, not a tier-cap source. The post-success-only write fits cleanly with that target.

### Proximity matcher sunset (HIST-05)

- **D-18:** Keep the ±5-min proximity matcher in `AnalysisHistory.tsx:259-309` as a **fallback** indefinitely. Route resolution order per `getEntryRoute`: (1) if `usage_tracking.analysis_id` is non-null, look up the per-feature row by id directly and route; (2) if NULL, fall back to the existing proximity logic. No backfill migration in Phase 36 — legacy rows stay routable by the matcher; new rows route via analysis_id.
- **D-19:** Orphan filtering per Phase 29 D-16: when the matcher fails AND `analysis_id` is non-null but the referenced row is deleted, `getEntryRoute` returns `null` and the row renders as un-clickable. No cascade DELETE on the loose FK.
- **D-20:** Phase 36 ships a documented sunset path (NOT executed) for a future cleanup phase: one-time SQL backfill against `usage_tracking` rows older than Phase 36 ship date, populating `analysis_id` via the same ±5-min logic. Out of scope here — captured in Deferred Ideas.

### TEST-05 — History persistence regression

- **D-21:** Per-feature Deno integration tests against staging Supabase. File layout: `supabase/functions/<feature>/__tests__/history-persistence.test.ts` for each of the 5 features (interview-prep test runs and asserts on staging only via env-gated `VITE_FEATURE_INTERVIEW_PREP` mirror). Each test:
  1. Seed a test user (reuse Phase 29 test-user pattern; `MERIT_TEST_USER_ID` env).
  2. Invoke the deployed staging edge function with a known payload.
  3. Assert (a) `usage_tracking` row exists for the user with `action_type=<feature>` and `created_at >= test_start`; (b) the per-feature row exists (`resumes` / `analysis_results` / `linkedin_grades` / `interview_quizzes`); (c) `usage_tracking.analysis_id` matches the per-feature row's `id`.
  4. Cleanup: DELETE the test rows in `afterAll`.
- **D-22:** Runner is `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1` and existing staging env vars (`SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`). Same operator hand-off pattern as Phase 29 TEST-02 — Phase 36 plan must include a "checkpoint:human-action" step for the operator to run the tests on staging after deploy.
- **D-23:** Also add a negative regression test asserting that a FAILED analysis (mocked `mergeAndValidateResults` failure or simulated 500) leaves NO `usage_tracking` row — guards the D-13 post-success-only contract.

### Claude's Discretion (left to planner / researcher)

- Exact `persistResumeAnalysis` helper signature, location (likely `supabase/functions/analyze-resume/persist.ts` or inline at index.ts top), and whether it's shared with the resume async-job worker.
- Whether the new `process-recruiting-lens-job` shares scaffolding with `process-resume-analysis-job` via a common helper or is a clean copy. Recommendation: clean copy first; refactor only if duplication causes pain in Phase 40.
- `checkEntitlement` vs. just calling `can_perform_ai_action()` (which still exists for now) for the entitlement check — planner picks based on what Phase 30 leaves in place.
- The exact `key_insights` selection for `analysis_results` rows across all 5 features — match existing shapes where possible.
- Whether Interview Prep `?id=` hydration adds a new `<InterviewPrepReadOnly>` component or augments the existing `<InterviewPrep>` page with a hydrated initial state.
- pgTAP coverage: skip in Phase 36 unless schema regressions are likely (no new tables/columns shipped here; Phase 29 covered the schema). Planner flags if useful.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (source of truth)
- `.planning/REQUIREMENTS.md` §HIST + §TEST — Phase 36 owns HIST-02, HIST-03, HIST-04, HIST-05, HIST-06, HIST-07, TEST-05.
- `.planning/ROADMAP.md` §"Phase 36: History Persistence Parity Audit + Repair" (lines 241-256) — phase scope + success criteria + dependencies (depends on Phase 29; blocks Phases 37–40).
- `.planning/PROJECT.md` Current Milestone section — v3.0 goals.
- `.planning/STATE.md` lines 60-75 — v3.0 phase ordering, Phase 47 D-05 IPC carry-forward.

### Carry-forward locked decisions (do not re-decide)
- `.planning/phases/29-foundation-infrastructure/29-CONTEXT.md` — HIST-01 column + 4-arg `record_ai_usage` overload; cache-hit `analysis_id` write (D-04, D-07, D-13); orphan filtering at query time (D-16); `EdgeRuntime.waitUntil` cache-write timing (D-05).
- `.planning/phases/47-interview-prep-prod-gate-elite-differentiation/47-CONTEXT.md` — D-05 (IPC rows filtered from `AnalysisHistory` on production); D-06 (`VITE_FEATURE_INTERVIEW_PREP` env-var gate); D-13 (frontend gate only — edge functions stay deployed); D-16 (Phase 41 superseded — no staging-only verification for IPC-01..04).

### Codebase intel (current state)
- `.planning/codebase/ARCHITECTURE.md` §"Master persistence + read map" (lines 16-26) — per-feature persist targets and the bug map: resume "NO `analysis_results` row written"; recruiting-lens "Pro tier has zero persisted history"; interview-prep "No frontend route to view a past quiz".
- `.planning/codebase/ARCHITECTURE.md` §"AnalysisHistory dashboard read path" (lines 28-34) — ±5min proximity matcher description and v3.0 implication.
- `.planning/codebase/ARCHITECTURE.md` §"`analysis_results` table" (lines 292-295) — schema + MIG-02 read-only lock.
- `.planning/codebase/CONCERNS.md` — known fragilities; `resumes.grading_data` is the resume single-source today, NOT `analysis_results`.

### Migrations + schema (no new migrations expected in Phase 36)
- `supabase/migrations/20260512000002_usage_tracking_analysis_id.sql` — Phase 29 HIST-01. Adds `usage_tracking.analysis_id uuid NULL` + 4-arg `record_ai_usage(uuid, ai_action_type, integer, uuid)` overload. The 3-arg signature is preserved for back-compat. Phase 36 standardizes callers on the 4-arg form.
- `supabase/migrations/20251222223116_8abce0df-2f95-472e-a9e5-dca9a6d69c53.sql` — `analysis_results` table schema + `analysis_type` CHECK constraint.
- `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` — RLS posture (service-role write, user JWT SELECT-only). Phase 36 writes via `getServiceClient()` exclusively.
- `supabase/migrations/20260411000002_atomic_check_and_record_usage.sql` — `check_and_record_ai_usage` RPC currently used by 4 of 5 features. Phase 36 splits the entitlement check from the row write.

### Edge function entry points (modified in Phase 36)
- `supabase/functions/analyze-resume/index.ts` — HIST-02: 4 success branches (parallel-merge ~:1349; fallback-single :1259-1281; streaming SSE complete; and the other `record_ai_usage` sites at :978, :1060) all gain an `analysis_results` INSERT and switch to the 4-arg `record_ai_usage`.
- `supabase/functions/analyze-career/index.ts` — HIST-06: paid path :1032 switches from `checkAndRecordUsage` to entitlement-check-only + post-success 4-arg `record_ai_usage`. Free-tier carve-outs :712-720 and :941-948 upgrade to 4-arg.
- `supabase/functions/grade-linkedin/index.ts` — HIST-06: paid path :444 same refactor. Free-tier carve-out :329 and :361 upgrade to 4-arg.
- `supabase/functions/recruiting-lens/index.ts` — HIST-03 + HIST-06 + HIST-07: drop Elite gate at :273-285 and :377-403; switch :298 to entitlement-check-only + post-success 4-arg; orphan path :325-353 stays as-is but is now serviced by a real worker.
- `supabase/functions/interview-prep-analyze/index.ts` — HIST-06: :601-603 upgrades to 4-arg.

### Edge function entry points (created in Phase 36)
- `supabase/functions/process-recruiting-lens-job/index.ts` — NEW. Worker for HIST-07. Use `supabase/functions/process-resume-analysis-job/index.ts` and `supabase/functions/process-career-analysis-job/index.ts` as reference scaffolds (drain pattern, retry semantics, `MeritRefundable` integration, completion-email hook).

### Frontend (modified in Phase 36)
- `src/pages/AnalysisHistory.tsx` — `getEntryRoute` (:278-309) extended: lookup by `usage_tracking.analysis_id` first, fall back to ±5min matcher. `findIdForEntry` stays as the fallback path. The Phase 47 D-05 IPC filter at :315-319 stays untouched.
- `src/pages/InterviewPrep.tsx` — HIST-04 staging-only: add `useSearchParams` hydration path that reads `interview_quizzes` + `interview_quiz_answers` by `?id=<quiz_id>` and renders past flashcards/quiz state. Gated behind `isInterviewPrepEnabled()` (per Phase 47 D-07) so production is unaffected.

### Reusable substrate
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits`, `MeritRefundable`. The new recruiting-lens worker uses the same refund taxonomy on unrecoverable failure.
- `supabase/functions/_shared/usage-checker.ts` — split into `checkEntitlement` + `recordUsageWithAnalysis` per D-14.
- `supabase/functions/_shared/auth.ts` — `requireAuth()` / `requireInternalOrUserAuth()` for the new worker.
- `supabase/functions/_shared/supabase-client.ts` — `getServiceClient()` for all RLS-bypassing writes.
- `supabase/functions/send-strivo-email/index.ts` — completion email scaffold (HIST-07 D-03 adds `emailType: 'recruiting_lens'`).

### Tests + tooling
- `scripts/run-edge-tests.ps1` — Phase 29 TEST-02 pattern. Phase 36 TEST-05 reuses with `DENO_TEST_SUPABASE_REMOTE=1` env-gate.
- `supabase/functions/_shared/merit-gateway.test.ts` lines 114-220 — reference for asserting `record_ai_usage` calls with `p_analysis_id` (already proven in Phase 29 cache-hit tests).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`process-resume-analysis-job` / `process-career-analysis-job`** — proven async worker shape (`analysis_jobs` drain loop, status transitions, `MeritRefundable` refund hook, completion email). The new `process-recruiting-lens-job` clones this shape.
- **`record_ai_usage(p_user_id, p_action_type, p_credits, p_analysis_id)` 4-arg overload** — already exists from Phase 29. No new migration needed; Phase 36 just standardizes callers on it.
- **`AnalysisHistory` ±5min proximity matcher** — `findIdForEntry` at `AnalysisHistory.tsx:262-276` stays as the legacy-row fallback. The primary lookup becomes direct `usage_tracking.analysis_id`.
- **`isInterviewPrepEnabled()` helper** (Phase 47) — gates the new `?id=` hydration so production is untouched.
- **`send-strivo-email` scaffold** — already wired with `emailType: 'resume_analysis'` and `emailType: 'career_compass'`; adding `recruiting_lens` is a copy-paste enum extension.

### Established Patterns
- **Service-role-write, user-SELECT-only RLS** on `analysis_results` (MIG-02). All Phase 36 inserts use `getServiceClient()`.
- **Per-call analysis path** in `recruiting-lens/index.ts`: 3 parallel calls, all-529 → async; otherwise partial-success merge. The async branch already exists — Phase 36 only adds the worker that drains it.
- **`withMerits` gateway** for refund on failure; the new worker uses the same taxonomy.
- **`raw_response.metadata` carry** — established by Career Compass and Recruiting Lens Elite: stash `jobDescription`, `analysisDate`, `tier` for downstream hydration. Phase 36 keeps this shape for Recruiting Lens Pro and adds analogous metadata for Resume Analysis.
- **Atomic check-and-record usage** is moving to entitlement-check-only + post-success write. Phase 36 is the cutover point.

### Integration Points
- **`usage_tracking.analysis_id` column** — already exists from Phase 29 (`20260512000002_usage_tracking_analysis_id.sql`). Loose FK (no constraint); Phase 36 populates it from per-feature INSERT returns.
- **`analysis_results` polymorphic source_reference** — for resume rows, holds `resumes.id` so AnalysisHistory routes to `/results/<source_reference>`. For other features, `source_reference` stays NULL (existing convention preserved).
- **AnalysisHistory route resolver** — new lookup path: if `analysis_id` non-null, fetch the per-feature row directly by id; if NULL, fall through to the existing per-feature timestamp-proximity match.
- **`analysis_jobs.job_type='recruiting_lens'`** — the worker keys off this. No new column.
- **`InterviewPrep.tsx` `useSearchParams`** — net-new addition; reads `interview_quizzes` row by `?id=`, optional `interview_quiz_answers` for quiz mode.

</code_context>

<specifics>
## Specific Ideas

### Phase ordering reminder
- Phase 36 depends on Phase 29 (HIST-01 column shipped). Phase 36 blocks Phases 37–40 (which need parity History before adding cache hits and feature output trims). Exec order per STATE.md: Phase 36 is order #10, runs after Phase 35 (Cross-Feature Input Context).

### Specific behavioral anchors
- **HIST-03 silent-degrade today** — Pro Recruiting Lens users hit "This analysis wasn't saved — run a fresh match" toast at `RecruitingLens.tsx:339`. Phase 36 makes the toast unreachable in normal operation.
- **HIST-07 user-facing today** — under all-3-calls-529, the frontend gets `{ jobId, status: 'queued', message: 'Analysis queued due to high demand. Poll for results.' }` from `recruiting-lens/index.ts:351` but never polls. The user sees a misleading success-shaped 202. Phase 36 makes the queued path actually resolve.
- **Failed-analysis phantom rows today** — atomic pre-write at `analyze-career/index.ts:1032`, `grade-linkedin/index.ts:444`, `recruiting-lens/index.ts:298` leaves orphans in `usage_tracking` when the AI call later fails. After Phase 36, those orphans never get created.

### Cross-phase coordination
- **Phase 30 (MER-11/12)** removes `can_perform_ai_action` from the paywall path. The entitlement-check half of Phase 36's `checkEntitlement` split should slot cleanly into the merit-gateway-only world Phase 30 leaves behind. Coordinate to avoid two refactors of the same call sites.
- **Phase 40 (RCL-04)** extends the new Recruiting Lens worker to ALSO write `saved_jobs`. Phase 36 leaves a clean extension point.

</specifics>

<deferred>
## Deferred Ideas

- **One-time backfill migration** — for the legacy `usage_tracking` rows with `analysis_id = NULL`, run the ±5min match logic in SQL once and populate `analysis_id` so the frontend matcher could be deleted entirely. Risk: a bad match writes the wrong link. Worth doing only after Phase 36 has run in production long enough that the legacy population shrinks to a meaningful tail. **Future cleanup phase.**
- **Frontend polling of `get-analysis-job-status` for Recruiting Lens** — per D-04, Phase 36 ships email-on-complete only. If users complain about the wait without a visible progress indicator, add polling in a future UX-polish phase.
- **Read-only `<InterviewPrepReadOnly>` component** — D-11 leaves the hydration approach to the planner. If the read-only past-quiz view diverges significantly from the live intake form, extracting a separate component could simplify both. Defer to the future Interview Prep milestone if it doesn't fall out cleanly in Phase 36.
- **Cap counter migration** — Phase 30 owns the merit-gateway-only paywall cutover (MER-11/12). Phase 36's `usage_tracking` post-success-only write assumes that cutover is complete or in flight. If Phase 30 slips, Phase 36 may need to keep the atomic write temporarily and switch later.
- **pgTAP coverage** for the new `recordUsageWithAnalysis` RPC shape — flagged in Claude's Discretion. Skip unless Phase 36 introduces new schema (it shouldn't).

</deferred>

---

*Phase: 36-history-persistence-parity-audit-repair*
*Context gathered: 2026-05-16*
