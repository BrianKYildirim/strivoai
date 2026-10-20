---
phase: 04-feature-migration-a-recruiting-lens-linkedin-grader
plan: 01
subsystem: recruiting-lens
tags: [analysis-lifecycle, idempotency, merit-safety, byte-preserve, dormant]
requires:
  - runAnalysisLifecycle (_shared/analysis-lifecycle.ts, Phase 3)
  - deriveIdempotencyKey (_shared/idempotency-key.ts, Phase 3)
  - isAnalysisFeatureEnabled('recruiting_lens') (_shared/analysis-flags.ts, Phase 3)
  - useAnalysisRun (src/hooks/useAnalysisRun.ts, Phase 3)
provides:
  - recruitingLensOutputSchema (zod output validator for the lifecycle executor)
  - recruiting-lens riding runAnalysisLifecycle('recruiting_lens') behind ANALYSIS_LIFECYCLE_RECRUITING_LENS (dormant)
  - threaded edge-derived idempotency identity (closes the null-key double-charge gap for this feature)
  - frontend attemptNonce transport + run_id refresh recovery (dormant-safe)
affects:
  - supabase/functions/recruiting-lens/index.ts
  - src/pages/RecruitingLens.tsx
tech-stack:
  added: []
  patterns:
    - "lifecycle-first / dormant-fall-through: attempt runAnalysisLifecycle; dormant → unchanged withMerits merit path"
    - "generate() returns clean serialized JSON so truncation detection never false-positives"
    - "save() throws on durable insert; usage-write is log-and-continue (settle-on-saved, no refund-after-save)"
key-files:
  created:
    - supabase/functions/recruiting-lens/schema.ts
    - supabase/functions/recruiting-lens/schema.test.ts
  modified:
    - supabase/functions/recruiting-lens/index.ts
    - src/pages/RecruitingLens.tsx
    - supabase/functions/recruiting-lens/history-persistence.test.ts
decisions:
  - "strategicAdvice is schema-optional (Pro tier-shaping strips it) but validated when present — reconciles D-06 byte-preserve with malformed-body rejection"
  - "schema.test.ts registration into deno.json test:ci / verify:baseline deferred to the phase-closing plan (matches Phase-3 03-07 pattern; 04-02/04-03 also did not touch deno.json)"
metrics:
  duration_min: 13
  tasks: 3
  files_changed: 5
  completed: 2026-07-02
---

# Phase 04 Plan 01: Recruiting Lens Lifecycle Migration Summary

Migrated Recruiting Lens onto the shared `runAnalysisLifecycle('recruiting_lens')` executor as a PRESERVE-EXACTLY wiring job (D-06): the 3-call parallel merge, `RecruitingLensOutput` schema, tier shaping, and Elite-only Free-403 gate are byte-preserved, while the migration ADDS shared reliability — a threaded edge-derived idempotency identity (closing the null-key double-charge gap), one lifecycle-driven persistence path with settle-on-saved / refund-exactly-once discipline, and frontend `run_id` refresh recovery. Ships DORMANT behind `ANALYSIS_LIFECYCLE_RECRUITING_LENS` (default OFF → 100% of traffic falls through to today's unchanged `withMerits` merit path).

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 (RED) | Failing zod schema mirror test | 37818ac7 | recruiting-lens/schema.test.ts |
| 1 (GREEN) | zod mirror of RecruitingLensOutput | 1a4a9d08 | recruiting-lens/schema.ts |
| 2 | Lifecycle adapter + collapse dual persistence | f1c3ce5d | recruiting-lens/index.ts |
| 2b | Reconcile stale history-persistence assertion | cc58879f | recruiting-lens/history-persistence.test.ts |
| 3 | Frontend attemptNonce transport + run_id recovery | abc5d9ea | src/pages/RecruitingLens.tsx |

## What Was Built

- **`recruitingLensOutputSchema`** (schema.ts): a lenient/passthrough zod mirror that the executor's `validateModelOutput` uses. Hard-requires only the fields present in BOTH the Elite and Pro tier-shaped outputs (`overallMatch{score 0-100,label,summary}`, `recruiterVerdict`, `topGaps>=1`); everything the Pro shaper can strip is optional. `strategicAdvice` is optional (Pro strips it) but validated when present. Root + nested `.passthrough()` so merger-emitted extras (`analysisId`, `metadata`, `_meta`) are never dropped. 9 unit tests (accept full Elite, accept REAL Pro-shaped subset, accept minimal, passthrough extras; reject missing score/verdict/strategicAdvice.summary, out-of-range score, empty topGaps).
- **Lifecycle adapter** (index.ts): in the `MERIT_SYSTEM_ENABLED` branch, `runAnalysisLifecycle` is attempted FIRST with `inputIdentity: cacheKey` (the order-independent field-hashed `buildRecruitingLensCacheKey` value — never a save-mutated field) and `attemptNonce` from the request body (fail-closed to a fresh UUID). `extract()` returns the sanitized inputs; `generate()` runs the existing 3-call fan-out + all-overloaded/zero-success refundable throws + merge + tier shaping and returns `JSON.stringify(merged)`; `save()` does the durable `analysis_results` insert (throws on failure → executor rests in `retryable_failed` pre-settle), then best-effort application upsert + cache write, then post-save `recordUsageWithAnalysis` as log-and-continue. `ok:true` returns the byte-preserved `{...merged, analysisId}` body PLUS `run_id`; `dormant:false` reuses the gateway's structured response or a generic 500; `dormant:true` falls through to today's UNCHANGED `withMerits` merit path.
- **Frontend** (RecruitingLens.tsx): a per-submit `attemptNonce` ref (fresh on a deliberate analyze, reused on "Try Again") transported in the invoke body; `useAnalysisRun().startRun(run_id)` called when the edge response carries `run_id`. Both are dormant-safe — `startRun` is inert while `VITE_FEATURE_ANALYSIS_LIFECYCLE` is off, and the inline `setResult` remains the synchronous source of truth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reconciled stale `history-persistence.test.ts` queued-shape assertion**
- **Found during:** Task 2 (full-directory test run)
- **Issue:** `recruiting-lens/history-persistence.test.ts:20` asserted a removed async-queue response shape (`JSON.stringify({ jobId: job.id, status: 'queued' })`) — PRE-EXISTING-BROKEN on main (RED), which is why it is not in `deno.json test:ci` and baseline stayed green. The plan invited fix-or-delete since this plan reworks the persistence path.
- **Fix:** Replaced the stale assertion with the current synchronous behavior — asserts the byte-preserved `{ ...merged, analysisId }` body AND the new `run_id: lifecycleResult.runId` lifecycle body. Full `recruiting-lens/` suite now 39/39 green (was 38 pass / 1 fail).
- **Files modified:** supabase/functions/recruiting-lens/history-persistence.test.ts
- **Commit:** cc58879f

### Deferred (out of scope)

- **P04-TSC-RECHARTS** (logged in `deferred-items.md`): `tsc -p tsconfig.app.json` reports 10 pre-existing recharts type errors (`chart.tsx`, `EliteScoreHistory.tsx`, `ScoreProgressChart.tsx`). Identical count (10) with and without the 04-01 changes; zero in the files this plan touched; `npm run lint` clean. Not caused by this task — not fixed.

## Verification

- `deno test recruiting-lens/schema.test.ts` → 9/9 green.
- `deno test recruiting-lens/handler-config.test.ts recruiting-lens/phase22-contract.test.ts` → green (byte-preserve characterization holds: requireAuth/user, Free-403 gate, withMerits, MERIT_SYSTEM_ENABLED gate, merger + parallel fan-out, central caps, rate-limit, RUN-04/05 all intact).
- Full `deno test recruiting-lens/` → 39/39 green.
- Merit branch invokes `runAnalysisLifecycle` (grep, 2 refs) with `inputIdentity: cacheKey`; response carries `run_id: lifecycleResult.runId`; dormant fall-through re-enters the unchanged `withMerits` merit path.
- Frontend `npm run lint` clean (0 errors); `tsc` introduces 0 new errors; invoke body carries `attemptNonce`; `run_id` tracked via `useAnalysisRun`.
- No schema migration added (uses existing analysis_jobs + analysis_results + analysis_cache + applications).

## Notes / Follow-ups

- `schema.test.ts` is NOT yet registered in `deno.json test:ci` / `verify:baseline`. Deferred to the phase-closing plan, matching the Phase-3 pattern (03-07 owned registration) and consistent with 04-02/04-03, which also did not touch `deno.json`. The phase-closing plan should fold `recruiting-lens/schema.test.ts` into the offline gate.
- Behavior is byte-identical TODAY (flags default OFF): the lifecycle returns `dormant:true` without touching Merits/Anthropic/DB, and the existing `withMerits` path serves 100% of traffic. The migration only activates when an operator flips `ANALYSIS_LIFECYCLE_ENABLED` + `ANALYSIS_LIFECYCLE_RECRUITING_LENS`.

## Self-Check: PASSED

All created files exist on disk (schema.ts, schema.test.ts, index.ts, RecruitingLens.tsx, history-persistence.test.ts, 04-01-SUMMARY.md) and all 5 task commits are present in git history (37818ac7, 1a4a9d08, f1c3ce5d, cc58879f, abc5d9ea).
