---
phase: 42-database-foundation-users-career-targets
plan: 04
subsystem: edge-functions
tags: [supabase, deno, worker, extraction, webhooks]
requires:
  - plan: 42-03
    provides: Layer 2 versioning schema and generated types
provides:
  - extract-analysis-structure Edge Function
  - Resume, LinkedIn, and Recruiting Lens extractor modules
  - Fixture-driven extractor tests
  - Fire-and-forget extraction webhooks from analyze-resume and grade-linkedin
  - Deployed extract-analysis-structure, analyze-resume, and grade-linkedin functions
affects: [phase-42-layer-2-worker, analyze-resume, grade-linkedin]
tech-stack:
  added: []
  patterns:
    - Internal-secret authenticated worker with service-role writes
    - Idempotent extraction keyed by source_analysis_results_id
    - Fire-and-forget function-to-function webhook
key-files:
  created:
    - supabase/functions/extract-analysis-structure/index.ts
    - supabase/functions/extract-analysis-structure/extract-resume.ts
    - supabase/functions/extract-analysis-structure/extract-linkedin.ts
    - supabase/functions/extract-analysis-structure/extract-recruiting-lens.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-resume.test.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-linkedin.test.ts
    - supabase/functions/extract-analysis-structure/__tests__/extract-recruiting-lens.test.ts
    - supabase/functions/extract-analysis-structure/__tests__/fixtures/resume-analysis.json
    - supabase/functions/extract-analysis-structure/__tests__/fixtures/linkedin-grading.json
    - supabase/functions/extract-analysis-structure/__tests__/fixtures/recruiting-lens.json
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/grade-linkedin/index.ts
    - supabase/config.toml
key-decisions:
  - "Added a lightweight linkedin_grading analysis_results insert so the worker has the same source row contract as resume extraction."
  - "Kept extraction webhook failures non-blocking with unawaited fetch and catch logging."
  - "Configured extract-analysis-structure with verify_jwt=false so INTERNAL_JOB_SECRET auth can run inside the function."
requirements-completed: [DB-VER-03]
duration: 1h 7m
completed: 2026-05-26
---

# Phase 42 Plan 04: Analysis Structure Extraction Worker Summary

**Built and deployed the async worker that fans out completed analyses into Layer 2 structured versioning tables.**

## Accomplishments

- Added `extract-analysis-structure` dispatcher with internal auth, analysis_results loading, feature routing, and catchup stub handling for Plan 42-05.
- Added `extractResume()` to write `resume_versions`, `resume_sections`, `resume_bullets`, and `scores`, with idempotency on `(user_id, source_analysis_results_id)`.
- Added `extractLinkedIn()` to write `linkedin_versions` and `scores`, populate `linkedin_grade_id`, and set `supersedes_id` from the prior user/profile version.
- Added `extractRecruitingLens()` as the Plan 42-08 noop stub.
- Added fixture-driven Deno tests for resume, LinkedIn, and Recruiting Lens extractors.
- Wired `analyze-resume` to trigger extraction after successful `analysis_results` persistence.
- Wired `grade-linkedin` to persist a `linkedin_grading` `analysis_results` row and trigger extraction without changing the user-facing response shape.
- Deployed `extract-analysis-structure`, `analyze-resume`, and `grade-linkedin` to project `cimjltzovkahkqecpwgi`.

## Task Commits

1. **Tasks 1-3: Worker, tests, caller wiring, config, deploy** - `0ac73e1` (`feat(42-04): add analysis structure extraction worker`)

**Plan metadata:** recorded in the follow-up docs close-out commit.

## Verification

- `supabase functions deploy extract-analysis-structure --project-ref cimjltzovkahkqecpwgi` passed.
- `supabase functions deploy analyze-resume --project-ref cimjltzovkahkqecpwgi` passed.
- `supabase functions deploy grade-linkedin --project-ref cimjltzovkahkqecpwgi` passed; sequential redeploy showed version `94` and updated timestamp.
- `supabase functions list --project-ref cimjltzovkahkqecpwgi` showed `extract-analysis-structure`, `analyze-resume`, and `grade-linkedin` ACTIVE.
- `supabase secrets list --project-ref cimjltzovkahkqecpwgi` showed `INTERNAL_JOB_SECRET` is configured.
- Unauthenticated POST to `https://cimjltzovkahkqecpwgi.supabase.co/functions/v1/extract-analysis-structure` returned `401`.
- `npx eslint supabase/functions/extract-analysis-structure` passed.
- `npm run build` passed.
- `rg -n "extract-analysis-structure|triggerExtractWebhook|persistLinkedInAnalysis|analysis_results_id" ...` confirmed worker and caller wiring.

## Verification Gaps

- Direct `deno test ...extract-analysis-structure...` could not run locally because `deno` is not installed on this machine; `scripts/run-edge-tests.ps1` has the same prerequisite. The successful Supabase deploy served as the available compile/deploy check.
- Authenticated curl smoke could not be run because local `INTERNAL_JOB_SECRET` is not present, and secret values are not exposed by `supabase secrets list`.
- Full Edge Function regression script was not run for the same local Deno prerequisite.

## Full-Suite Status

- Full repo lint remains blocked by pre-existing lint debt in caller Edge Functions and other repo areas. Targeted lint on the new worker directory passed.
- Frontend production build passed after the caller edits.
- `gsd-sdk query requirements.mark-complete DB-VER-03` returned the ID as `not_found`; roadmap and state were still advanced.

## Deviations from Plan

- Added `supabase/config.toml` to the modified files so the new internal function can run with platform JWT verification disabled, matching other internally authenticated functions.
- Added `analysis_results` persistence to `grade-linkedin` because the existing code only wrote `linkedin_grades`; without this, the worker would not have an `analysis_results_id` source row to load.

## User Setup Required

None. The functions were deployed and `INTERNAL_JOB_SECRET` is present in the target project.

## Next Phase Readiness

Plan 42-05 can add the catchup cron and improvement-over-time query against the live Layer 2 schema and deployed extraction worker.

---
*Phase: 42-database-foundation-users-career-targets*
*Completed: 2026-05-26*
