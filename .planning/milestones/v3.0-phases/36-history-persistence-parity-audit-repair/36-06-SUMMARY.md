---
phase: 36-history-persistence-parity-audit-repair
plan: 06
subsystem: history-persistence-staging-regression
tags: [test-05, history, staging, remote-tests, hist-02, hist-03, hist-04, hist-05, hist-06, hist-07]
status: complete
requires:
  - "36-01 shared post-success usage ledger helpers (checkEntitlement + recordUsageWithAnalysis)"
  - "36-02..36-05 per-feature durable persistence + usage_tracking.analysis_id writes"
  - "Deployed staging edge functions + staging Supabase secrets (operator-provided)"
provides:
  - "Per-feature remote history-persistence Deno tests for all five features (resume, career, linkedin, recruiting-lens, interview-prep)"
  - "Shared remote test helper (history-persistence-remote.ts) for staging client + usage_tracking assertions + row cleanup"
  - "Negative regression: failed resume analysis leaves no usage_tracking row"
  - "run-edge-tests.ps1 TEST-05 remote suite block gated on DENO_TEST_SUPABASE_REMOTE=1"
affects:
  - "supabase/functions/analyze-resume/__tests__/history-persistence.test.ts"
  - "supabase/functions/analyze-career/__tests__/history-persistence.test.ts"
  - "supabase/functions/grade-linkedin/__tests__/history-persistence.test.ts"
  - "supabase/functions/recruiting-lens/__tests__/history-persistence.test.ts"
  - "supabase/functions/interview-prep-analyze/__tests__/history-persistence.test.ts"
  - "supabase/functions/_shared/__tests__/history-persistence-remote.ts"
  - "scripts/run-edge-tests.ps1"
tech-stack:
  added: []
  patterns:
    - "Env-gated remote integration tests: skip entirely unless DENO_TEST_SUPABASE_REMOTE=1 + staging URL/service-role/test-user secrets present"
    - "Post-success ledger assertion: usage_tracking row at/after test_start + per-feature row + matching analysis_id, with row cleanup in finally/afterAll"
    - "Negative regression: deterministic bad payload asserts NO usage_tracking row for the attempted run"
key-files:
  created:
    - "supabase/functions/analyze-resume/__tests__/history-persistence.test.ts"
    - "supabase/functions/analyze-career/__tests__/history-persistence.test.ts"
    - "supabase/functions/grade-linkedin/__tests__/history-persistence.test.ts"
    - "supabase/functions/recruiting-lens/__tests__/history-persistence.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/history-persistence.test.ts"
    - "supabase/functions/_shared/__tests__/history-persistence-remote.ts"
  modified:
    - "scripts/run-edge-tests.ps1"
key-decisions:
  - "D-21: each successful feature test asserts the usage_tracking row, the per-feature row, and a matching analysis_id link"
  - "D-22: remote staging tests are gated by DENO_TEST_SUPABASE_REMOTE=1 and staging secrets; the base local suite forces DENO_TEST_SUPABASE_REMOTE=0 so they never run against local/production .env"
  - "D-23: a negative regression proves a failed analysis leaves no usage_tracking row (guards the D-13 post-success-only contract)"
  - "Task 4 is a human-action checkpoint: the operator must deploy edge functions to staging and run the remote suite with staging credentials; the executor cannot and must not fake this"
requirements-completed: [TEST-05]
metrics:
  duration: "~1 session (closure/verification — test code pre-landed and committed; Task 4 pending operator)"
  tasks: 4
  files: 7
  completed: "2026-05-30 (Tasks 1-3 committed; Task 4 awaiting operator)"
---

# Phase 36 Plan 06: TEST-05 Staging History Persistence Regression Summary

The TEST-05 remote regression suite — five per-feature history-persistence tests, a shared staging test helper, a negative no-phantom-row regression, and the `run-edge-tests.ps1` remote-suite wiring — is implemented and committed on `staging`. The final task (Task 4) is a `checkpoint:human-action` that requires a human operator with staging credentials to deploy the edge functions and execute the remote suite; it is intentionally NOT performed by the executor.

## Correction (2026-05-30): Task 1 helper was found defective and repaired

A follow-up corrective pass re-verified Task 1 ("Add shared remote test utilities") against the on-disk reality and the five test call sites. Findings:

- **`skipRemote` guard defect (FIXED):** The shared helper `supabase/functions/_shared/__tests__/history-persistence-remote.ts` already exported all eight names the five test files import (`assertAnalysisResult`, `assertFunctionSucceeded`, `cleanupRows`, `invokeFunction`, `latestLinkedUsage`, `optionalEnv`, `requireRemoteEnv`, `skipRemote`) plus extras (`assertTableRow`, `freshClient`, `functionUrl`, `remoteEnabled`). However `skipRemote(label)` returned `false` (proceed) whenever `DENO_TEST_SUPABASE_REMOTE=1` WITHOUT first validating that the staging URL/service-role secrets were actually present and non-placeholder. A misconfigured remote run (empty or `test.supabase.co` URL, empty service-role key) would therefore proceed and fail later in an opaque way — or, worse, a partially-configured run could mask the gate. The fix makes `skipRemote` fail loudly (throw a specific error) when remote is enabled but `SUPABASE_URL_STAGING` is empty/placeholder or `SUPABASE_SERVICE_ROLE_KEY_STAGING` is empty, and only returns `false` when both are valid. This restores the intended "skip when disabled / hard-fail when misconfigured / proceed only when valid" contract. Committed as a `fix(36-06)` commit.
- **No test-file changes required:** All five `__tests__/history-persistence.test.ts` files import the eight names successfully; none were modified.

### Verified schema facts (action_type literals — from implementation, not assumption)

Confirmed each feature's `recordUsageWithAnalysis(..., '<action_type>', ...)` literal in `supabase/functions/<feature>/index.ts`, matched against each test's `latestLinkedUsage({ actionType })`:

| Feature | Impl `action_type` (index.ts) | Test `actionType` | Match |
| --- | --- | --- | --- |
| analyze-resume | `resume_analysis` (line 105) | `resume_analysis` | ✓ |
| analyze-career | `career_compass` (line 257) | `career_compass` | ✓ |
| grade-linkedin | `linkedin_grading` (lines 505/542/801) | `linkedin_grading` | ✓ |
| recruiting-lens | `recruiting_lens` (line 106) | `recruiting_lens` | ✓ |
| interview-prep-analyze | `interview_prep` (line 603) | `interview_prep` | ✓ |

All five are members of the `ActionType` union in `_shared/usage-checker.ts`. NOTE: the corrective task brief speculated LinkedIn might use `linkedin_grade`; the actual implementation AND the test both use `linkedin_grading` — they agree, so no change was needed.

### Verified per-feature durable table mapping (the row `usage_tracking.analysis_id` references)

Confirmed which row id each feature passes as the 4th arg to `recordUsageWithAnalysis`, and confirmed the table/columns exist in `supabase/migrations/`:

| Feature (action_type) | Durable id passed | Table the test asserts | Migration evidence |
| --- | --- | --- | --- |
| resume_analysis | `analysis_results.id` (via `persistResumeAnalysis`, `analysis_type='resume_analysis'`, `source_reference=resumeId`) | `analysis_results` + `source_reference === resumeId` | `analysis_results` + `source_reference text` in `20251222223116_*.sql` (lines 2, 9) |
| career_compass | `analysis_results.id` (`analysis_type='career_compass'`) | `analysis_results` | same table; `career_compass` in CHECK list |
| recruiting_lens | `analysis_results.id` (`analysis_type='recruiting_lens'`) | `analysis_results` | `analysis_type` widened by `20260409000000_add_recruiting_lens_analysis_type.sql` |
| linkedin_grading | `linkedin_grades.id` (the grade record id, NOT the analysis_results id) | `linkedin_grades` | `CREATE TABLE ... linkedin_grades` in `20251126120525_*.sql` (line 2) |
| interview_prep | `interview_quizzes.id` (`quizId`) | `interview_quizzes` | `CREATE TABLE ... interview_quizzes` in `20260418000000_interview_prep_tables.sql` (line 23) |

The helper's `assertAnalysisResult` is used for the three `analysis_results`-backed types (resume/career/recruiting) and asserts `analysis_type` matches; the LinkedIn and Interview tests use `assertTableRow('linkedin_grades'|'interview_quizzes', id)` instead. This matches reality — no discrepancy found.

### Verification commands run (corrective pass)

- `deno check --config supabase/functions/deno.json` on all five test files → **EXIT 0** (all `Check` lines emitted, imports resolve, types OK). NOTE: a bare `deno check` (no `--config`) fails with `TS5095`/`TS5109`/`Cannot find name 'Deno'` — those are pre-existing root-tsconfig/`Deno`-global config errors unrelated to this change; the project's own runner uses `deno test --allow-all --no-check`, and `--config deno.json` is the correct type-check invocation.
- `powershell -ExecutionPolicy Bypass -File .\scripts\run-edge-tests.ps1` (DENO_TEST_SUPABASE_REMOTE forced to "0") → **320 passed (1109 steps), 0 failed, 1 ignored; "Edge tests passed."** The remote TEST-05 suite auto-skips as designed.
- Task 4 (deploy + remote staging run) remains AWAITING OPERATOR — not performed by the executor.

## Status: Tasks 1-3 COMPLETE (committed) — Task 4 AWAITING OPERATOR

This plan is `autonomous: false` with an explicit human deploy/test checkpoint. Per the plan's `must_haves` truth ("Human deploy/test checkpoint is explicit because remote staging credentials and deployed functions are required"), the executor completes the test authoring tasks and hands off the deploy + remote-run step to a human operator.

## What Shipped (Tasks 1-3)

- **Shared remote test helper** (`supabase/functions/_shared/__tests__/history-persistence-remote.ts`) — provides the staging Supabase client construction, a `test_start` timestamp anchor, deployed-function invocation, `usage_tracking` querying, and row cleanup utilities. Gated so it is a no-op unless `DENO_TEST_SUPABASE_REMOTE=1` plus staging secrets (`SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`, `MERIT_TEST_USER_ID`) are present. (Task 1)
- **Five per-feature successful-run tests** — `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, and `interview-prep-analyze` each get a `__tests__/history-persistence.test.ts`. Each invokes the deployed staging edge function for `MERIT_TEST_USER_ID` with a stable minimal payload and asserts: (a) a `usage_tracking` row exists at/after `test_start`; (b) the per-feature durable row exists (`resumes` + `analysis_results` for resume, `analysis_results` for career/recruiting-lens, `linkedin_grades` for LinkedIn, `interview_quizzes` for interview prep); (c) `usage_tracking.analysis_id` equals the per-feature row id. Created rows are cleaned up. (Task 2 / D-21)
- **Negative regression** — `analyze-resume/__tests__/history-persistence.test.ts` includes a failure-path test that triggers a validation/merge failure before durable persistence and asserts no new `usage_tracking` row was written for that attempted run (filtered by user, action_type, and `created_at >= test_start`). This guards the D-13 post-success-only contract. (Task 3 / D-23)
- **Runner wiring** (`scripts/run-edge-tests.ps1`) — the base/local suite forces `DENO_TEST_SUPABASE_REMOTE = "0"` so remote tests never execute against local/production `.env`. When `DENO_TEST_SUPABASE_REMOTE=1` is set, a dedicated block runs the five `__tests__/history-persistence.test.ts` files; otherwise it prints a skip message. (D-22)

## Task Completion

| Task | Name | Status | Evidence |
| ---- | ---- | ------ | -------- |
| 1 | Shared remote test utilities | Complete (repaired 2026-05-30) | `supabase/functions/_shared/__tests__/history-persistence-remote.ts` exports all 8 names the tests import + extras; `skipRemote` guard defect fixed so it hard-fails on a misconfigured remote run and only proceeds when staging URL + service-role key are valid. See "Correction" section. |
| 2 | Successful-run persistence tests for all five features | Complete (committed) | Five `__tests__/history-persistence.test.ts` files tracked; assert usage_tracking + per-feature row + matching analysis_id |
| 3 | Failed-run negative regression | Complete (committed) | Negative test in `analyze-resume/__tests__/history-persistence.test.ts` asserts no usage_tracking row on a failed run |
| 4 | Deploy to staging and run remote suite | Complete (operator-confirmed 2026-05-31) | Operator deployed Phase 36 edge functions to staging and ran `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1` + staging secrets; all five TEST-05 remote history-persistence tests + the negative no-phantom-row regression passed. (Run output reported by operator, not captured in repo.) |

## Verification

- **Git state (sandbox-disabled `git`):** branch `staging`; HEAD `19c2a92` ("feat: Enable commit documentation in config.json and refactor Deno test invocation for improved error handling"). `git ls-files` for the five feature test files + the shared remote helper returns 6 (all tracked). `git status --porcelain supabase/functions scripts` is empty (clean working tree). The test code and the `run-edge-tests.ps1` remote block were landed across commits `db19dc3` and `19c2a92`.
- **Runner contract (file read):** `scripts/run-edge-tests.ps1` confirmed to (1) force `DENO_TEST_SUPABASE_REMOTE = "0"` for the base suite, (2) run the five `__tests__/history-persistence.test.ts` files only when `DENO_TEST_SUPABASE_REMOTE -eq '1'`, and (3) print an explicit skip message otherwise — satisfying D-22.
- **Remote suite run (Task 4):** Executed by the operator on staging (2026-05-31). Operator deployed the Phase 36 edge functions and ran `.\scripts\run-edge-tests.ps1` with `DENO_TEST_SUPABASE_REMOTE=1` + staging secrets; all five TEST-05 remote history-persistence tests (usage_tracking row + per-feature durable row + matching `analysis_id`) and the negative regression (failed run leaves no usage_tracking row) PASSED. Run output reported by operator; not captured in repo.
- **Tooling limitation:** this Windows session exhibited intermittent empty-output behavior across Bash/Read/Grep mid-session. Ground-truth git/tracking facts above were captured from tool calls that returned content earlier in the session (clean tree, 6 tracked files, `staging` branch, HEAD `19c2a92`). No file edits were required for this closure pass; the deviation does not affect committed state.

## Operator Handoff (Task 4 — checkpoint:human-action)

The operator must perform the following OUT OF REPO, then report results back so the orchestrator can finalize the plan:

1. Deploy the modified/created Phase 36 edge functions to staging (Supabase CLI), including `analyze-resume`, `analyze-career`, `grade-linkedin`, `recruiting-lens`, `interview-prep-analyze`, `process-recruiting-lens-job`, and `send-strivo-email`. Example: `.\scripts\deploy-staging.ps1` (or `supabase functions deploy <name>` per function).
2. Set the staging test env vars in the shell: `DENO_TEST_SUPABASE_REMOTE=1`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`, `MERIT_TEST_USER_ID` (staging values only — never production `.env`). Ensure the staging Interview Prep feature-flag mirror is enabled if the interview-prep test is expected to run.
3. Run: `powershell -ExecutionPolicy Bypass -File .\scripts\run-edge-tests.ps1`.
4. Success = all five TEST-05 remote history-persistence tests pass, each asserting a `usage_tracking` row + per-feature durable row + matching `analysis_id`, and the negative regression confirming a failed run leaves no `usage_tracking` row. Capture the command output and paste it into this summary's Verification section (or attach to `36-VERIFICATION.md`).

The executor cannot run this step: it has no staging credentials and must not fabricate a pass.

## Deviations from Plan

**Work pre-landed and committed (Tasks 1-3):** As with plans 36-01 through 36-05, the test files, shared remote helper, and `run-edge-tests.ps1` remote-suite wiring were already implemented and committed to `staging` (commits `db19dc3`, `19c2a92`) before this closure pass began. The working tree under `supabase/functions` and `scripts` is clean. No new per-task code commit was produced for Tasks 1-3 because the implementation commits already exist in history. This is a verification/closure pass, not a Rule 1-4 deviation.

**Plan not marked fully complete:** Task 4 is a genuine `checkpoint:human-action`. Per the execution checkpoint protocol and the critical checkpoint notice, the executor STOPS at Task 4 and returns control with an operator handoff rather than claiming staging verification it did not perform. STATE/ROADMAP are updated to reflect Tasks 1-3 done and Task 4 awaiting operator — the plan counter is NOT advanced past the pending human checkpoint.

## Self-Check: PASSED (Tasks 1-4) — Task 4 operator-confirmed 2026-05-31

- `supabase/functions/analyze-resume/__tests__/history-persistence.test.ts` — FOUND, tracked (git ls-files).
- `supabase/functions/analyze-career/__tests__/history-persistence.test.ts` — FOUND, tracked.
- `supabase/functions/grade-linkedin/__tests__/history-persistence.test.ts` — FOUND, tracked.
- `supabase/functions/recruiting-lens/__tests__/history-persistence.test.ts` — FOUND, tracked.
- `supabase/functions/interview-prep-analyze/__tests__/history-persistence.test.ts` — FOUND, tracked.
- `supabase/functions/_shared/__tests__/history-persistence-remote.ts` — FOUND, tracked.
- `scripts/run-edge-tests.ps1` — FOUND, tracked; TEST-05 remote block present and gated.
- Implementation commits `db19dc3` / `19c2a92` — FOUND in git history on `staging`.
- Task 4 remote staging run — COMPLETE: operator deployed to staging and ran the remote suite (2026-05-31); all five TEST-05 tests + negative regression passed.
