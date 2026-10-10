---
phase: 05-feature-migration-b-resume-analysis-onboarding
plan: 02
subsystem: api
tags: [supabase-edge, deno, sse-streaming, idempotency, merit-gateway, analysis-lifecycle, react, feature-flag]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: "create_or_recover_analysis_run + transition_analysis_run RPCs, deriveIdempotencyKey, withMerits idempotency-key seam, refundMeritsForJob, validateModelOutput, classifyFailure, useAnalysisRun (startRun/isActive), isAnalysisLifecycleEnabled"
  - phase: 05-feature-migration-b-resume-analysis-onboarding
    provides: "05-01: resume-validation.ts (resumeAnalysisSchema + resumeSemanticCheck), reconciled triple-write save (resumes.grading_data authoritative), isAnalysisFeatureEnabled('resume')"
provides:
  - "Streaming-aware lifecycle wrapper (runResumeStreamingLifecycle) that orchestrates the lifecycle RPCs directly around the UNTOUCHED SSE TransformStream token path"
  - "Closed idempotency gap at analyze-resume:728 — meritCtx.idempotencyKey set before withMerits for BOTH streaming and non-streaming merit branches"
  - "settle-on-saved (merit_settled only in saving→completed CAS) + pre-saving-only refund + mid-stream-overload→retryable_failed (subsumes the dead 529→queue fallback)"
  - "run_id in the complete SSE event + frontend startRun(run_id) recovery + attemptNonce per deliberate submit + submit-lock while a run is active"
affects: [06-feature-migration-c-career-compass, 07-dashboard-intelligence, 05-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Streaming-aware lifecycle wrapper: a request/response executor cannot wrap an SSE stream, so a thin wrapper mirrors the executor's RPC ordering DIRECTLY (create_or_recover → transitions → validate-final-object → save → settle) while the token path stays byte-identical"
    - "One idempotency key set on the shared meritCtx closes the gap for every merit branch that reuses that closure"

key-files:
  created: []
  modified:
    - supabase/functions/analyze-resume/index.ts
    - src/pages/Upload.tsx
    - src/hooks/useResumeStream.ts

key-decisions:
  - "D-01/D-02: do NOT make runAnalysisLifecycle streaming-aware; a separate runResumeStreamingLifecycle wrapper reuses its RPCs + exact ordering around the untouched TransformStream"
  - "Idempotency key derived once over a stable non-mutating inputIdentity (resumeTextHash + resumeId + targets, never a save-mutated field) + per-submit attemptNonce; set on meritCtx before withMerits — fixes both streaming and non-streaming branches in one line"
  - "merit_settled written ONLY in the saving→completed CAS (point of no return); refundMeritsForJob fires ONLY from pre-saving IIFE branches; validateModelOutput runs on the assembled FINAL object (never raw text/partials)"
  - "A recovered ACTIVE run returns a one-shot SSE with run_id (no second model call); the frontend submit-lock is the primary duplicate-submission guard"
  - "Frontend layering (Open Q5): useResumeStream stays the SSE token/partial + single-optimistic-deduction owner; useAnalysisRun layered only for run_id persistence + recovery + submit-lock"

patterns-established:
  - "Dormancy-capable streaming wrapper: gated by isAnalysisFeatureEnabled('resume') + rawBody.stream===true; flag OFF → 100% traffic falls through to the byte-identical legacy withMerits streaming path"

requirements-completed: [FEAT-02]

# Metrics
duration: 10min
completed: 2026-07-06
---

# Phase 5 Plan 02: Resume Analysis Streaming Lifecycle Summary

**Streaming resume SSE path gains a persistent lifecycle run + idempotent charge (closes analyze-resume:728), settle-on-saved, pre-saving-only refund, mid-stream-overload→retryable_failed, and run_id-backed frontend recovery — all dormant behind flags with the SSE token path + SUCCESS output byte-identical.**

## Performance

- **Duration:** ~10 min this session (Task 1 wrapper largely authored in the prior session interrupted by usage limit; recovered from stash@{0}, wired, and verified here)
- **Started:** 2026-07-06T07:52:00Z (this session)
- **Completed:** 2026-07-06
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **Streaming-aware lifecycle wrapper** (`runResumeStreamingLifecycle`): creates the run via `create_or_recover_analysis_run` before the first SSE byte, drives `transition_analysis_run` (created→validating_inputs→reserving_merits→extracting_data→generating→validating_output→saving→completed) around the UNTOUCHED TransformStream token path, validates the assembled FINAL object via `validateModelOutput`, runs the 05-01 reconciled triple-write save, and settles (`merit_settled:true`) only in the saving→completed CAS.
- **Idempotency gap closed at :728** — one `deriveIdempotencyKey` over a stable non-mutating inputIdentity + per-submit `attemptNonce`, set on the shared `meritCtx` before `withMerits`, so BOTH the streaming and non-streaming merit branches deduct exactly once on a duplicate attempt.
- **Financial safety on the stream**: `refundMeritsForJob` fires ONLY from pre-saving IIFE branches; a mid-stream overload/merge/parse failure lands the run in `retryable_failed`/`failed` with a refund + typed SSE error (subsuming the never-wired 529→queue fallback). No refund/throw past the saving→completed point of no return.
- **Frontend recovery + duplicate-submission defense**: `run_id` rides the complete SSE event → `useResumeStream` calls `useAnalysisRun().startRun(run_id)` for refresh/navigation recovery; `Upload.tsx` mints a fresh `attemptNonce` per deliberate submit into the stream params and disables the submit control while a run is active (`AnalysisLockContext.isLocked` + `useAnalysisRun.isActive`).
- **Dormant by default**: gated by `isAnalysisFeatureEnabled('resume')` (backend) and `isAnalysisLifecycleEnabled()` (frontend); flag OFF → byte-identical legacy streaming path (test:edge 986/0/12, vitest 495/0).

## Task Commits

Each task was committed atomically:

1. **Task 1: Streaming-aware lifecycle wrapper + idempotency key** - `f06b0665` (feat)
2. **Task 2: Frontend streaming recovery + submit-lock (attemptNonce, run_id)** - `175b8fb8` (feat)

**Plan metadata:** _(final docs commit — this SUMMARY + STATE)_

## Files Created/Modified
- `supabase/functions/analyze-resume/index.ts` - Added `runResumeStreamingLifecycle` + helpers (`transitionResumeRun`, `sseOneShotResponse`, `buildResumePromptContext`); set `meritCtx.idempotencyKey` + streaming dispatch before the legacy `withMerits`.
- `src/pages/Upload.tsx` - Mint `attemptNonce` per submit into the stream params; submit-lock via `useAnalysisLock` + `useAnalysisRun().isActive`, flag-gated.
- `src/hooks/useResumeStream.ts` - `startRun(run_id)` on the complete SSE event (via a ref-held handle), flag-gated; token/partial path + single optimistic deduction unchanged.
- `.planning/.../deferred-items.md` - Logged the pre-existing recharts `type-check` errors (out of scope).

## Decisions Made
See `key-decisions` frontmatter. Core: separate streaming wrapper over the LOCKED executor (D-02); one idempotency key on the shared meritCtx closes :728 for all branches; settle-on-saved + pre-saving-only refund; frontend layering keeps useResumeStream the token/deduction owner.

## Deviations from Plan

None - plan executed exactly as written.

The bulk of Task 1 (the `runResumeStreamingLifecycle` wrapper) had been authored in a prior session that was interrupted by a usage limit and stashed as `stash@{0}` (`gsd-05-02-partial-interrupted-session-limit`). This session recovered the stash, verified it matched the plan's design, wired the idempotency-key line + streaming dispatch into the request handler, completed Task 2, and ran all verification. No plan deviations.

## Issues Encountered
- **`deno check` environmental false-failure:** the local editor `supabase/functions/tsconfig.json` (lib: dom/esnext, `moduleResolution: bundler`, no `deno.ns`) is picked up by `deno check`, producing spurious "Cannot find name 'Deno'" errors even on committed known-good files. Confirmed environmental (identical failure on committed `_shared/analysis-lifecycle.ts`). Resolved by temporarily sidelining that tsconfig for the check → `deno check analyze-resume/index.ts` passes cleanly. The authoritative gate `npm run test:edge` (uses `--no-check` + proper Deno resolution) is green regardless.
- **Pre-existing recharts `type-check` errors (out of scope):** `npm run type-check` reports 10 pre-existing `error TS` in recharts chart components — identical count with this plan's two files stashed, so unrelated to this work. My two files are clean. Not part of `verify:baseline`. Logged to `deferred-items.md` (P05-RECHARTS-TSC).

## User Setup Required
None - no external service configuration required. Both flags (`ANALYSIS_LIFECYCLE_RESUME` / `VITE_FEATURE_ANALYSIS_LIFECYCLE`) ship OFF; an operator flips them (a staging first-byte smoke is 05-03's job, Open Q4). No new DB migration.

## Next Phase Readiness
- 05-03 (verification/staging smoke) can now exercise the streaming lifecycle behind the flags: idempotent charge, run_id recovery, mid-stream-overload→retryable_failed, and the first-byte latency delta (only a hash + ~5 service-role RPCs added pre-first-byte; model call unchanged).
- No unmitigated HIGH threats remain (T-05-IDEMP / T-05-MERIT / T-05-VALID / T-05-DUP all mitigated).
- If a staging smoke surfaces a needed index/grant/RLS/realtime touch, route it as an operator-gated preview→prod task with rollback SQL (advisor floor 15 must not increase) — none discovered in this plan.

---
*Phase: 05-feature-migration-b-resume-analysis-onboarding*
*Completed: 2026-07-06*

## Self-Check: PASSED

- Files verified present: analyze-resume/index.ts, Upload.tsx, useResumeStream.ts, 05-02-SUMMARY.md, deferred-items.md
- Commits verified: f06b0665 (Task 1), 175b8fb8 (Task 2)
