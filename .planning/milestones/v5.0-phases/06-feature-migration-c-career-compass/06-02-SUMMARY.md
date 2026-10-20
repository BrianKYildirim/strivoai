---
phase: 06-feature-migration-c-career-compass
plan: 02
subsystem: api
tags: [deno, supabase-edge, career-compass, analysis-lifecycle, idempotency, create-or-recover, two-writer, cors, dormant-flag]

# Dependency graph
requires:
  - phase: 03-shared-analysis-lifecycle-substrate
    provides: create_or_recover_analysis_run + transition_analysis_run RPCs, analysis_jobs_active_idem_unique partial-UNIQUE index, deriveIdempotencyKey, analysis-flags (two-level dormancy)
  - phase: 06-feature-migration-c-career-compass (06-01)
    provides: runAnalysisLifecycle('career_compass') attached at the confirmed-live legacy branch (free tier), buildCareerCacheKey :legacy-main inputIdentity contract, career-validation seam
provides:
  - submit-career-analysis-job on the shared ledger — create_or_recover_analysis_run + derived one-key + {run_id,idempotencyKey,attemptNonce,inputIdentity} payload threading, replacing the WR-04 SELECT-active-then-INSERT TOCTOU + raw insert (flag-ON path)
  - process-career-analysis-job two-writer deferral — flag-ON worker defers status/refund writes to the executor's transition_analysis_run CAS (no double-write/double-refund)
  - analyze-career apex+www CORS-matrix offline guard (200/401/412 echo + evil fail-closed) registered in verify:baseline
affects: [06-03 frontend recovery + scenario matrix + live smokes, 07 dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Submit-side create_or_recover: the queue-entry function derives the ONE idempotency key and calls create_or_recover_analysis_run directly (via supabase.rpc, NOT the executor) so the partial-UNIQUE active index collapses N parallel submits to one run; the executor re-derives the identical key downstream and recovers the same run"
    - "Cross-hop key match at the confirmed-live tier: submit derives inputIdentity+key at tier='free' to match analyze-career's internal-path resolvedTier='free', while the withMerits deduction stays at the user's real tier (byte-identical live money)"
    - "Flag-gated two-writer deferral: the worker keeps every raw status/refund write textually present but wraps each in `if (!deferToExecutor)`, so OFF is byte-identical and ON hands the analysis_jobs row entirely to the executor's CAS"

key-files:
  created:
    - supabase/functions/analyze-career/__tests__/cors-matrix.test.ts
  modified:
    - supabase/functions/submit-career-analysis-job/index.ts
    - supabase/functions/process-career-analysis-job/index.ts
    - supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts
    - supabase/functions/deno.json

key-decisions:
  - "submit derives inputIdentity + idempotency key at tier='free' to MATCH the confirmed-live internal executor (analyze-career async path -> internal-secret auth -> null userContext -> resolvedTier='free', per 06-01-LIVE-PATH-FINDING / R-06-01). The withMerits DEDUCTION stays at the user's real tier (byte-identical to today's live money path); the key is only an idempotency token so amount and key are independent."
  - "buildCareerCacheKey is REPLICATED in submit (helper + CAREER_CACHE_MAX_CONTEXT_CHARS=12000 + variant 'career-overload-patch-2026-02-25:legacy-main') rather than shared-extracted, to stay within files_modified and avoid touching analyze-career/index.ts. A prominent comment pins both sites to stay byte-identical."
  - "The flag-ON create_or_recover sub-branch is inserted at the TOP of the existing `MERIT_SYSTEM_ENABLED && authenticatedUserCtxCareer` block; the legacy WR-04 SELECT+withMerits+raw-insert block is left byte-identical BELOW it, so isAnalysisFeatureEnabled('career_compass')=OFF falls straight through unchanged."
  - "The career queue functions are reconciled in the dormancy guard to a NEW guard (b''): flag-gated (references isAnalysisFeatureEnabled) AND executor-import-absent (the executor lives across the worker -> analyze-career hop). Only the resume job workers remain under guard (b)."

patterns-established:
  - "Submit-side ledger adoption: derive-key -> create_or_recover (idempotent run) -> keyed withMerits (idempotent deduction) -> stamp merit_transaction_id + run_id -> trigger worker -> return jobId===run_id"

requirements-completed: [FEAT-05]

# Metrics
duration: 13min
completed: 2026-07-07
---

# Phase 6 Plan 02: Career Compass Queue Plumbing (submit + worker onto the ledger) Summary

**Plumbed the 3-function async dance so ONE idempotency key + ONE run row span submit -> worker -> analyze-career: submit's create_or_recover_analysis_run replaces the WR-04 status-window TOCTOU + raw insert, the worker defers its status/refund writes to the executor when the flag is ON, and an apex+www CORS-matrix guard is folded into verify:baseline — all byte-identical while ANALYSIS_LIFECYCLE_CAREER_COMPASS is OFF.**

## Performance

- **Duration:** ~13 min (executor working time)
- **Started:** 2026-07-07T06:05:04Z
- **Completed:** 2026-07-07T06:18:02Z
- **Tasks:** 3 (all auto)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- **Task 1 (submit-career-analysis-job):** Added a flag-ON sub-branch at the top of the `MERIT_SYSTEM_ENABLED` block that derives the ONE idempotency key (replicated `buildCareerInputIdentity` at tier='free' + client-supplied `attemptNonce`, fallback-mint only when absent), calls `create_or_recover_analysis_run` (replacing the WR-04 SELECT-active-then-INSERT TOCTOU AND the raw `analysis_jobs.insert`), threads `{run_id, idempotencyKey, attemptNonce, inputIdentity}` into the worker payload, keeps a keyed synchronous `withMerits` (`meritCtx.idempotencyKey`), and returns `jobId === run_id`. The legacy WR-04 path is left byte-identical below for the flag-OFF fall-through.
- **Task 2 (process-career-analysis-job):** Gated the worker's post-fetch status/refund writes on `isAnalysisFeatureEnabled('career_compass')` (`deferToExecutor`) — when ON the completed/retrying/failed writes AND the independent `refundMeritsForJob` are skipped (the executor's `transition_analysis_run` CAS + pre-saving refund own them; Pattern 2, no double-write/double-refund); when OFF every raw write + refund is byte-identical. Preserved the processing-claim + internal-auth surface. Corrected the stale `career_compass_analyses` comment to `analysis_results` (D-10). Reconciled the dormancy guard.
- **Task 3 (CORS matrix):** Created `analyze-career/__tests__/cors-matrix.test.ts` — a deterministic offline guard proving apex + www echo ACAO + `Vary: Origin` on 200/401/412 (incl. thrown-401 Pitfall 7 + the 412 prior/input gate), an evil origin fail-closed, and the entrypoint still routes through `withCors(req,'user')` advertising the internal header. Registered at the end of `deno.json test:ci` (all prior entries byte-preserved).

## Task Commits

1. **Task 1: submit create_or_recover + derived key + payload threading** - `83a87950` (feat)
2. **Task 2: process-career two-writer deferral + stale-comment fix + dormancy reconcile** - `b483c662` (feat)
3. **Task 3: analyze-career CORS-matrix guard + deno.json registration** - `badc5eab` (test)

## Files Created/Modified
- `supabase/functions/submit-career-analysis-job/index.ts` - flag-ON create_or_recover path (derived key + threaded payload + keyed deduction), byte-identical legacy WR-04 fall-through
- `supabase/functions/process-career-analysis-job/index.ts` - flag-gated two-writer deferral, corrected store comment
- `supabase/functions/analyze-career/__tests__/cors-matrix.test.ts` - apex+www CORS status matrix (created)
- `supabase/functions/_shared/analysis-lifecycle.dormancy.test.ts` - career queue functions reconciled to guard (b'')
- `supabase/functions/deno.json` - registered the new cors-matrix suite in test:ci

## Decisions Made
- **Key derived at tier='free' to match the confirmed-live internal executor.** analyze-career on the async/worker path runs under internal-secret auth (null userContext -> `resolvedTier='free'`, per 06-01-LIVE-PATH-FINDING / R-06-01). Deriving submit's `inputIdentity` + key at 'free' makes submit's key EQUAL analyze-career's re-derived key, so the executor's `reserving_merits` replays `already_deducted` (exactly one deduction). The `withMerits` deduction AMOUNT stays at the user's real tier (byte-identical to today's live money path) — the key and the amount are independent.
- **buildCareerCacheKey replicated in submit, not shared-extracted.** To stay within `files_modified` (analyze-career/index.ts is out of scope) the small helper + constants (`CAREER_CACHE_MAX_CONTEXT_CHARS=12000`, variant `career-overload-patch-2026-02-25:legacy-main`) are duplicated in submit behind a prominent "must stay byte-identical to analyze-career" comment. See Deferred Issues for the drift risk.
- **New sub-branch on top, legacy WR-04 untouched below.** Guarantees byte-identical dormancy: `isAnalysisFeatureEnabled('career_compass')=OFF` skips the new block entirely and re-enters the unchanged WR-04 SELECT+withMerits+raw-insert path.
- **Dormancy guard (b'') added.** The career queue functions are now flag-gated but do not import the executor directly (it lives across the worker -> analyze-career hop), so they moved out of the fully-unwired FEATURE_ENTRYPOINTS list into a new guard asserting `isAnalysisFeatureEnabled` present AND `analysis-lifecycle` import absent.

## Deviations from Plan

**None affecting scope.** The plan described threading `inputIdentity` for the executor to consume; 06-01 shipped analyze-career RE-deriving its own `inputIdentity` (via buildCareerCacheKey) rather than reading it from the payload. Since analyze-career/index.ts is out of `files_modified`, this plan makes the keys match by REPLICATING analyze-career's derivation in submit (at the confirmed-live free tier). The threaded `inputIdentity` is carried in the payload as specified (for completeness + debugging + a future executor that consumes it), even though the current executor re-derives. This is a faithful adaptation to the 06-01 wiring, not a scope change.

**Total deviations:** 0 auto-fixed (no Rule 1-4 fixes required).

## Deferred Issues
- **Cross-hop key-match edge cases (flag-ON runtime, validated in 06-03).** Two narrow divergence sources between submit's derived key and analyze-career's re-derived key exist and are NOT closed here (dormant; 06-03 owns the live scenario matrix + smokes):
  1. **DB-persisted-LinkedIn fallback.** When `linkedinPdfContent` is absent from the body, analyze-career fetches persisted LinkedIn text (`readPersistedLinkedInText`) into `acceptedLinkedinPdfContent` before hashing; submit has no extraction pipeline and hashes the (empty) body value. Keys diverge in that case; the executor's own create_or_recover recovers/creates its run on its re-derived key. The common path (LinkedIn content in the submit body, or resume-only) matches.
  2. **Replication drift.** submit's `buildCareerInputIdentity` duplicates analyze-career's `buildCareerCacheKey`; a future change to the analyze-career cache-key inputs must update both sites (comment-pinned, but no static guard enforces it). Candidate for a shared-extraction follow-up.

## Issues Encountered
- **`deno check` reports the pre-existing tsconfig error (TS5095/TS5109 + `Cannot find name 'Deno'`).** Identical to the 06-01-documented environment condition: deno 2.7.1 picks up the root `tsconfig.json` (module `bundler`/`NodeNext` mismatch, no `deno.ns` lib). This is tooling, not a code defect in the edited files. The authoritative gate is `npm run test:edge` (runs `--no-check`), which is GREEN.

## User Setup Required
None. The feature ships DORMANT; enabling requires flipping `ANALYSIS_LIFECYCLE_CAREER_COMPASS` (+ master `ANALYSIS_LIFECYCLE_ENABLED`) in Supabase edge secrets — deferred to the 06-03 wiring + soak.

## Next Phase Readiness
- **06-03 (frontend recovery + scenario matrix + live smokes):** the frontend is the authoritative `attemptNonce` minter (submit already consumes `body.attemptNonce`, fallback-mints only when absent); `careerJobId === run_id` (submit returns `jobId: run_id`) enables `run_id`-keyed recovery. 06-03 owns the idempotency/validation-convergence/byte-preserve scenario matrix + the live prod apex+www CORS re-proof + the flag-flip soak, and should close the two deferred key-match edge cases above.
- **Baseline:** `test:edge` **1087/0/12** green (was 1063; +24 new analyze-career cors-matrix tests). Career job-contract + refund-on-failure suites stay green (OFF-path byte-preserve proof). Flags default OFF -> dormant -> byte-identical submit + worker.

---
*Phase: 06-feature-migration-c-career-compass*
*Completed: 2026-07-07*

## Self-Check: PASSED

- Created files present: analyze-career/__tests__/cors-matrix.test.ts, 06-02-SUMMARY.md
- Commits present: 83a87950 (Task 1), b483c662 (Task 2), badc5eab (Task 3)
- grep: `create_or_recover_analysis_run` ×4 in submit; `isAnalysisFeatureEnabled` gating the worker; no `career_compass_analyses`-as-table comment; `strivoai.net` in cors-matrix; no new migration
- test:edge 1087/0/12 green (was 1063; +24 new career cors-matrix tests)
