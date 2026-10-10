---
phase: 36-history-persistence-parity-audit-repair
plan: 04
subsystem: recruiting-lens-history-worker
tags: [recruiting-lens, async-worker, analysis-history, hist-03, hist-06, hist-07, test-05]
status: complete
requires:
  - "36-01 shared post-success usage ledger helpers"
  - "analysis_jobs async queue table"
  - "send-strivo-email email scaffold"
provides:
  - "Recruiting Lens Pro and Elite success paths write analysis_results rows"
  - "Recruiting Lens usage rows link to analysis_results.id after persistence"
  - "process-recruiting-lens-job drains recruiting_lens queued jobs"
  - "Recruiting Lens completion email uses /recruiting-lens?id=<analysisId>"
affects:
  - "supabase/functions/recruiting-lens/index.ts"
  - "supabase/functions/process-recruiting-lens-job/index.ts"
  - "supabase/functions/send-strivo-email/index.ts"
tech-stack:
  added: []
  patterns:
    - "Internal worker claims analysis_jobs rows, invokes target function, retries queued/transient responses, refunds on terminal failure"
    - "Target 202 queued responses are never marked completed"
key-files:
  created:
    - "supabase/functions/process-recruiting-lens-job/index.ts"
    - "supabase/functions/process-recruiting-lens-job/__tests__/worker-contract.test.ts"
    - "supabase/functions/recruiting-lens/history-persistence.test.ts"
  modified:
    - "supabase/functions/recruiting-lens/index.ts"
    - "supabase/functions/send-strivo-email/index.ts"
key-decisions:
  - "D-02: existing all-overloaded queued response shape is preserved"
  - "D-03: worker sends recruiting_lens completion email with the analysis id deep-link"
  - "D-04: frontend polling remains out of scope"
requirements-completed: [HIST-03, HIST-06, HIST-07, TEST-05]
metrics:
  duration: "~1 session (verification plus worker chaining patch)"
  tasks: 4
  files: 5
  completed: "2026-05-30"
---

# Phase 36 Plan 04: Recruiting Lens History and Worker Summary

Recruiting Lens now persists successful Pro and Elite analyses into canonical history, links usage after persistence, and has a real internal worker for queued overload jobs.

## What Shipped

- `persistRecruitingLensResult(...)` inserts `analysis_results` with `analysis_type: 'recruiting_lens'`, `primary_score: merged.overallMatch?.score`, and tier stored inside `raw_response.metadata.tier`.
- The old Elite-only persistence gate is absent; Pro and Elite share the same persistence helper.
- Successful fresh runs call `recordUsageWithAnalysis(params.userId, 'recruiting_lens', 1, data.id)` only after the inserted `analysis_results.id` exists.
- The all-overloaded sync path still returns `{ jobId, status: 'queued', message: ... }` with HTTP 202.
- `process-recruiting-lens-job` requires internal auth, claims `analysis_jobs` rows where `job_type='recruiting_lens'`, invokes `recruiting-lens`, retries target 202 queued responses instead of completing them, refunds terminal failures with `feature: 'recruiting_lens'`, and sends completion email when an `analysisId` is returned.
- Worker chaining was added in this run so ready remaining `recruiting_lens` jobs trigger a follow-on `process-recruiting-lens-job` invocation, matching the existing resume worker pattern.
- `send-strivo-email` includes `emailType: 'recruiting_lens'` and content with a `/recruiting-lens?id=<analysis_results.id>` target supplied by the worker.

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Persist Recruiting Lens for Pro and Elite | Complete | No `resolvedTier === 'elite'` gate; shared helper inserts `analysis_results` and records linked usage |
| 2 | Add process-recruiting-lens-job worker | Complete | Worker filters `JOB_TYPE`, requires internal auth, handles retries/failures/refunds, and chains remaining ready jobs |
| 3 | Extend completion email | Complete | `EmailType` includes `recruiting_lens`; worker sends `resultsUrl: /recruiting-lens?id=<analysisId>` |
| 4 | Add persistence and worker contract tests | Complete | Source-contract tests cover Pro/Elite helper, queued response shape, internal auth, 202 loop guard, refunds, and chaining |

## Verification

- PowerShell source assertions -> PASS. Confirmed no Elite-only gate, Recruiting Lens insert shape, linked usage with inserted id, 202 queued response shape, worker internal auth, 202 retry guard, refund tag, chain invocation, and email type/content.
- `deno.cmd check supabase/functions/recruiting-lens/index.ts supabase/functions/process-recruiting-lens-job/index.ts supabase/functions/send-strivo-email/index.ts` -> PASS.
- `git diff --check -- supabase/functions/process-recruiting-lens-job/index.ts supabase/functions/process-recruiting-lens-job/__tests__/worker-contract.test.ts` -> PASS, no whitespace errors. Git warned LF will be replaced by CRLF when touched.
- `deno.cmd test --allow-read supabase/functions/recruiting-lens/history-persistence.test.ts supabase/functions/process-recruiting-lens-job/__tests__/worker-contract.test.ts` -> BLOCKED by Deno 2.7.1 Windows test runner pipe panic before assertions ran.

## Acceptance Criteria

**Task 1: Persist Recruiting Lens for Pro and Elite**
- Pro success path inserts `analysis_results` - PASS; no Elite-only gate remains.
- Elite insert behavior is unchanged except for linked usage - PASS; same helper shape for Pro/Elite.
- Failed or partial failure paths do not write usage before durable persistence - PASS; usage write lives inside the post-insert helper.

**Task 2: Add worker**
- Worker does not accept browser user auth - PASS (`requireAuth(req, { type: 'internal' })`).
- Worker does not silently complete failed target responses or 202 queued responses - PASS; 202/queued branch calls `markRetry` and contains no completed status update.
- Worker has a loop guard preventing unbounded child queued jobs - PASS; target queued responses retry current job and never mark it completed.
- Worker uses `feature: 'recruiting_lens'` in refund logs - PASS.
- Worker chains when eligible work remains - PASS; added `chainDepth < 2` follow-on invocation.

**Task 3: Email**
- Email type union includes `recruiting_lens` - PASS.
- Worker supplies score and resultsUrl when available - PASS.

**Task 4: Tests**
- Source-contract tests exist and cover required behavior - PASS by source inspection.
- Deno runner execution - BLOCKED by environment runtime panic.

## Deviations from Plan

**Phase 42 extension present:** Current code also calls `upsertSavedRecruitingLensJob(...)` from the Recruiting Lens persistence helper. Phase 36 originally scoped saved jobs out, but this checkout has later Phase 42 work that extends Recruiting Lens persistence. This run preserved that newer behavior rather than reverting it.

**Worker chaining gap fixed:** The pre-existing worker lacked follow-on chaining even though it parsed `chainDepth`. This run added the missing chain block and test assertion.

**Verification limitation:** Deno source tests could not execute because Deno 2.7.1 panicked on Windows pipe handling. Deno type checks for the modified runtime files passed.

## Self-Check: PASSED WITH ENVIRONMENT-BOUNDED TEST LIMITATION

- `supabase/functions/recruiting-lens/index.ts` - verified.
- `supabase/functions/process-recruiting-lens-job/index.ts` - modified and Deno-checked.
- `supabase/functions/send-strivo-email/index.ts` - verified.
- Source assertions - PASS.
- Deno check - PASS.
- Deno test runner - BLOCKED by runtime panic.
