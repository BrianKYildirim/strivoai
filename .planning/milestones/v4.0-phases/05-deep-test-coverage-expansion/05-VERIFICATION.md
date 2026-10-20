---
phase: 05-deep-test-coverage-expansion
verified: 2026-06-19T12:00:00Z
status: passed
score: 4/4 must-haves verified; 2 manual items operator-confirmed 2026-06-19
human_verified: 2026-06-19
human_verification:
  - test: "Deploy-gate abort: temporarily redden one offline deno test, run scripts/deploy.ps1 -Env staging, confirm it exits NON-ZERO and prints the verify:baseline failure BEFORE any supabase link or functions deploy line; restore the test, re-run, confirm proceed."
    expected: "Non-zero exit + verify:baseline failure message printed before supabase link on red; green run proceeds past gate to supabase link."
    why_human: "The deploy gate runs on the operator's local Windows PowerShell host. Claude cannot invoke scripts/deploy.ps1 against a live project. This was explicitly designated MANUAL-ONLY per VALIDATION.md (plan 05-07 Task 2, type=checkpoint:human-verify, gate=blocking)."
  - test: "GitHub branch-protection required-status-check: in GitHub repo Settings -> Branches, confirm the 'gate' job from regression-gate.yml is a Required status check on PRs to both main and staging."
    expected: "The Regression Gate job is a required check; a failed verify:baseline prevents merge on both protected branches."
    why_human: "Branch-protection is a GitHub repo setting, not assertable from the codebase. This was the open item carried from Phase 1 (plan 01-05) and was designated MANUAL-ONLY per VALIDATION.md. The code/docs are committed and correct; only the operator can confirm the setting is enabled."
---

# Phase 05: Deep Test Coverage Expansion — Verification Report

**Phase Goal:** Test coverage is deepened beyond the baseline — edge-function handlers, shared utilities, auth/merit logic, failure/error paths, tier-gating, and adversarial AI cases are covered, and the full suite runs via a documented, repeatable command set wired into deploy gating — so the upcoming risky dependency and database changes have real coverage of the surfaces they touch.

**Verified:** 2026-06-19
**Status:** passed (operator confirmed both manual items 2026-06-19)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Deno edge-function tests cover shared utilities, auth, usage/merit logic, and per-feature analyze handlers including failure and error paths | VERIFIED | `deno.json` test:ci allowlist contains 80 test files including all required coverage: `_shared/auth.test.ts`, `_shared/merit-gateway*.test.ts`, `analyze-resume/failure-branches.test.ts`, `analyze-career/failure-branches.test.ts`, `recruiting-lens/handler-config.test.ts`, `analyze-skills-gap/handler-config.test.ts`, `compare-jobs/handler-config.test.ts`, `chat-agent/handler-config.test.ts`, all worker `job-contract.test.ts` files, and `interview-prep-analyze/__tests__/analyze.failure-branches.test.ts`. Passed count grew 284 → 698. |
| 2 | Tests cover edge cases, failure states, permissions/tier gating, and environment-specific behavior | VERIFIED | `analyze-resume/failure-branches.test.ts` (361 lines, 11 occurrences of `isRefundableAnthropicError`), `analyze-career/failure-branches.test.ts` (398 lines, `assertThrows` over-budget ceiling). `chat-agent/handler-config.test.ts` asserts `source.includes('withMerits') === false` + `checkRateLimit` present. `analyze-skills-gap/handler-config.test.ts` asserts `MERIT_SYSTEM_ENABLED && userContext` legacy gate. `_shared/anthropic.test.ts` has 29 occurrences of `AI_TEST_MODE` characterizing env-specific branches. `interview-prep-evaluate/handler-config.test.ts` asserts ownership, `canEvaluate`, and integer `question_order` join. |
| 3 | Adversarial / prompt-injection coverage (promptfoo) is extended across the active AI features | VERIFIED | Four new promptfoo injection suites exist at: `analyze-resume/__tests__/fixtures/injection/promptfooconfig.yaml`, `analyze-career/__tests__/fixtures/injection/promptfooconfig.yaml`, `grade-linkedin/__tests__/fixtures/injection/promptfooconfig.yaml`, `recruiting-lens/__tests__/fixtures/injection/promptfooconfig.yaml`. Each has `defaultTest` section with the standard 4 leak/JSON contracts. No real secrets: grep for live Supabase URLs or Bearer tokens returns nothing. Negative invariant confirmed: promptfoo is NOT in `verify:baseline` and NOT in `regression-gate.yml`. Four per-feature scripts in `package.json`: `test:adversarial:resume`, `test:adversarial:career`, `test:adversarial:linkedin`, `test:adversarial:recruiting`. |
| 4 | A documented command set runs the full suite repeatably both locally and in CI, wired into deploy gating where feasible | VERIFIED (automated portion) | `scripts/deploy.ps1` contains `npm run verify:baseline` at line 94, positioned after `Set-Location $repoRoot` (line 83) and before `supabase link --project-ref $ref` (line 104). `$LASTEXITCODE -ne 0 -> exit 1` abort is explicit. Shims `deploy-staging.ps1` / `deploy-production.ps1` are byte-identical to v4.0-baseline (0-line diff). `TESTING-STRATEGY.md` documents the grown command set, off-gate promptfoo scripts (clearly marked off-gate), reconciliations, suspected-behavior register location, and branch-protection steps. Deploy abort (human) and GitHub branch-protection check (human) CONFIRMED by operator 2026-06-19: deploy.ps1 aborts before `supabase link` on a red suite and proceeds when green; the `gate` check is a Required status check on both `main` and `staging`. |

**Score:** 4/4 truths verified — all automated checks plus both manual sub-items within Truth #4 operator-confirmed 2026-06-19.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/deno.json` | Grown test:ci allowlist; `result-merger.test.ts` present; no recursion | VERIFIED | 80 `.test.ts` entries in `test:ci`. `result-merger.test.ts` present. `deno test ./` NOT present. All 29 new files from plans 01-05 present. |
| `.planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md` | D-08 register with `suspected issue` column header | VERIFIED | File exists. Column header `suspected issue` present. 4 logged rows (SB-05-01 through SB-05-05, all `minor -> log`, none escalated). |
| `TESTING-STRATEGY.md` | Documents reconciliations + register location + command set | VERIFIED | Contains "reconcil" 15 times, "verify:baseline" 20 times, "branch.protect" 6 times. Phase-05 drifted-test reconciliation record and allowlist-growth ledger (284→566→587→638→673→698) are present. |
| `supabase/functions/analyze-resume/failure-branches.test.ts` | Resume merit refund + AI-failure coverage; min 40 lines | VERIFIED | 361 lines. `isRefundableAnthropicError` appears 11 times. Substantive executed merit-seam coverage. |
| `supabase/functions/analyze-career/failure-branches.test.ts` | Career budget-cap throw + tier-gating coverage; min 40 lines | VERIFIED | 398 lines. `assertThrows` present for over-budget-ceiling case. |
| `supabase/functions/chat-agent/handler-config.test.ts` | NO-merit + rate-limit-only source-read; min 20 lines | VERIFIED | 97 lines. `source.includes('withMerits') === false` asserted. `source.includes('checkRateLimit')` asserted true. |
| `supabase/functions/analyze-skills-gap/handler-config.test.ts` | Legacy-merit-gate + auth source-read; min 20 lines | VERIFIED | Exists. `MERIT_SYSTEM_ENABLED` pattern appears 3 times (asserting legacy gate). |
| `supabase/functions/recruiting-lens/handler-config.test.ts` | Auth + merit-wiring source-read | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/compare-jobs/handler-config.test.ts` | Auth + merit-wiring source-read | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/submit-resume-analysis-job/job-contract.test.ts` | Internal-auth + queue-contract source-read; min 20 lines | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/submit-career-analysis-job/job-contract.test.ts` | Internal-auth + queue-contract source-read | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/get-analysis-job-status/job-contract.test.ts` | Status-poll worker source-read; min 20 lines | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/interview-prep-analyze/__tests__/analyze.failure-branches.test.ts` | TRUE Pattern-B handler invocation; min 30 lines | VERIFIED | 148 lines. `handler(new Request` invocation present. Auth-reject and AI-failure cases included (pinned: 401 swallowed into 500, logged as SB-05-04). |
| `supabase/functions/interview-prep-evaluate/handler-config.test.ts` | Pattern-A source-read with ownership/tier-gate/question_order; min 20 lines | VERIFIED | 120 lines. Ownership assertion, `canEvaluate`, integer `question_order` join assertions all present. |
| `supabase/functions/interview-prep-evaluate/__tests__/evaluate.answer-length.test.ts` | Offline-safe colocated evaluate test | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/interview-prep-evaluate/__tests__/evaluate.pro-elite-taste-access.test.ts` | Offline-safe colocated evaluate test | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/interview-prep-evaluate/__tests__/evaluate.question-order-join.test.ts` | Offline-safe colocated evaluate test | VERIFIED | Exists. Registered in `deno.json`. |
| `supabase/functions/_shared/prompt-sanitizer.test.ts` | Deepened injection corpus + false-positive preservation + `sanitizeMessages` central-seam case | VERIFIED | `sanitizeUserContent` appears 64 times. `sanitizeMessages` appears 12 times. `warnCalls` appears 95 times (the logger-based strip assertions). |
| `supabase/functions/_shared/anthropic.test.ts` | ANTHROPIC_API_KEY-missing fail-closed + AI_TEST_MODE branch | VERIFIED | `AI_TEST_MODE` appears 29 times. `ANTHROPIC_API_KEY` present in file (confirmed by plan 05-05 pattern). |
| `supabase/functions/analyze-resume/__tests__/fixtures/injection/promptfooconfig.yaml` | Off-gate real-AI injection suite with `defaultTest` | VERIFIED | Exists. `defaultTest` present. No real secrets (grep clean). |
| `supabase/functions/analyze-career/__tests__/fixtures/injection/promptfooconfig.yaml` | Off-gate real-AI injection suite | VERIFIED | Exists. No real secrets. |
| `supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.yaml` | Off-gate real-AI injection suite | VERIFIED | Exists. No real secrets. |
| `supabase/functions/recruiting-lens/__tests__/fixtures/injection/promptfooconfig.yaml` | Off-gate real-AI injection suite | VERIFIED | Exists. No real secrets. |
| `package.json` | Four per-feature adversarial scripts; `verify:baseline` NOT referencing promptfoo | VERIFIED | `test:adversarial:resume`, `test:adversarial:career`, `test:adversarial:linkedin`, `test:adversarial:recruiting` all present via `promptfoo eval --config`. `verify:baseline = "npm run test && npm run test:edge && npm run test:e2e"` — no promptfoo. |
| `scripts/deploy.ps1` | `verify:baseline` precondition after `Set-Location`, before `supabase link`; exit 1 on failure | VERIFIED | Line 83: `Set-Location $repoRoot`. Line 94: `npm run verify:baseline`. Line 95-97: `if ($LASTEXITCODE -ne 0) { Write-Error ...; exit 1 }`. Line 104: `supabase link --project-ref $ref`. Ordering confirmed correct. `-SkipVerify` escape hatch is explicit and default OFF. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `deno.json test:ci` | `result-merger.test.ts` | allowlist string | WIRED | Confirmed present in allowlist |
| `deno.json test:ci` | `analyze-resume/failure-branches.test.ts` | allowlist append | WIRED | Confirmed present |
| `deno.json test:ci` | `analyze-career/failure-branches.test.ts` | allowlist append | WIRED | Confirmed present |
| `deno.json test:ci` | `chat-agent/handler-config.test.ts` | allowlist append | WIRED | Confirmed present |
| `deno.json test:ci` | `get-analysis-job-status/job-contract.test.ts` | allowlist append | WIRED | Confirmed present |
| `deno.json test:ci` | `interview-prep-analyze/__tests__/analyze.failure-branches.test.ts` | allowlist append | WIRED | Confirmed present |
| `deno.json test:ci` | `interview-prep-evaluate/handler-config.test.ts` | allowlist append | WIRED | Confirmed present |
| `analyze-resume/failure-branches.test.ts` | `_shared/merit-gateway.ts + _shared/anthropic.ts` | `isRefundableAnthropicError` | WIRED | `isRefundableAnthropicError` appears 11 times in the file |
| `interview-prep-analyze/failure-branches.test.ts` | `interview-prep-analyze/index.ts exported handler` | `handler(new Request(...)` | WIRED | `handler(new Request` confirmed present |
| `interview-prep-evaluate/handler-config.test.ts` | `interview-prep-evaluate/index.ts` | `Deno.readTextFile` source-read | WIRED | `readTextFile` pattern confirmed; ownership + canEvaluate + question_order assertions present |
| `package.json scripts` | each feature's promptfooconfig.yaml | `promptfoo eval --config` | WIRED | Four scripts confirmed present; paths match four existing configs |
| `verify:baseline / regression-gate.yml` | promptfoo | NEGATIVE invariant: must NOT reference | CLEAN | `verify:baseline` does not include promptfoo; `regression-gate.yml` contains no promptfoo/test:adversarial reference |
| `scripts/deploy.ps1` | `npm run verify:baseline` | precondition with `$LASTEXITCODE` check before `supabase link` | WIRED (automated) | Gate block at lines 85-100, `supabase link` at line 104. Shim diff vs v4.0-baseline: 0 lines. |

---

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TEST-03: Edge-function tests cover shared utilities, auth, usage/merit logic, and per-feature analyze handlers including failure/error paths | SATISFIED | 80 test files in `test:ci` allowlist covering all named surfaces. `_shared/auth.test.ts`, `_shared/merit-gateway*.test.ts`, `analyze-resume/failure-branches.test.ts`, `analyze-career/failure-branches.test.ts`, per-feature handler-config tests for recruiting-lens, analyze-skills-gap, compare-jobs, chat-agent, worker job-contract tests for submit/get-status workers, interview-prep-analyze True Pattern-B handler invocation. |
| TEST-05: Tests cover edge cases, failure states, permissions/tier gating, and environment-specific behavior | SATISFIED | Failure/error-path coverage in plans 02, 03, 04. Env-specific branches in `_shared/anthropic.test.ts` (ANTHROPIC_API_KEY missing, AI_TEST_MODE, AI_FORCE_FAILURE two-key safety). Tier-gating: `analyze-career/failure-branches.test.ts` assertThrows over-budget. Permissions: all handler-config tests assert `requireAuth` type user. Legacy gates: `analyze-skills-gap` and `compare-jobs` tests assert the `MERIT_SYSTEM_ENABLED && userContext` actual state. chat-agent negative merit assertion. |
| TEST-08: Tests run via documented command set, repeatable locally/CI, wired into deploy gating where feasible | SATISFIED (automated) + HUMAN-PENDING | `verify:baseline` gates `deploy.ps1` before `supabase link`. `TESTING-STRATEGY.md` documents the full command set. Two manual-only sub-items (deploy-abort confirmation + branch-protection check) are operator-pending per plan 05-07 design. |

---

### Zero Functional Change Verification

| Surface | Status | Evidence |
|---------|--------|----------|
| All `supabase/functions/**/index.ts` files | BYTE-IDENTICAL to v4.0-baseline | `git diff v4.0-baseline -- supabase/functions/**/index.ts` returns empty. Checked explicitly for: analyze-resume, analyze-career, recruiting-lens, analyze-skills-gap, compare-jobs, chat-agent. |
| `_shared/anthropic.ts`, `_shared/prompt-sanitizer.ts` | BYTE-IDENTICAL | `git diff v4.0-baseline` for these files returns empty. |
| `scripts/deploy-staging.ps1`, `scripts/deploy-production.ps1` | BYTE-IDENTICAL | `git diff v4.0-baseline` for shims: 0 lines. |
| No `deno test ./` recursion introduced | CLEAN | `grep "deno test ./"` in `deno.json` returns nothing. |

---

### Anti-Patterns Scanned

No blocker anti-patterns found. The test files are substantive (not placeholder stubs): key files range from 97 to 398 lines and contain executable assertions. All newly created test files are properly wired into the `deno.json` test:ci allowlist.

Notable observations (already logged in `05-SUSPECTED-BEHAVIOR.md`, not phase blockers):
- **SB-05-04** (`interview-prep-analyze`): auth-reject 401 is swallowed into a 500 by the terminal catch. Pinned as characterization — auth still fires, IP is off prod, no merit/billing impact.
- **SB-05-05** (`_shared/prompt-sanitizer.ts`): `ignore_instructions` pattern does not tolerate an interposed article "the". Under-stripping recall gap on one phrasing; `sanitizeMessages` central seam still fires; off-gate promptfoo is the defense-in-depth layer.

Both are `minor -> log`; neither is a blocker for phase completion.

---

### Human Verification Required

#### 1. Deploy-gate abort on a red suite

**Test:** Temporarily redden one offline deno test (e.g. flip one assertion in a harvested test file), then run `scripts\deploy.ps1 -Env staging`. Confirm the script prints the `verify:baseline` failure message and exits NON-ZERO before any `supabase link` or `functions deploy` line executes (no deploy occurs). Then restore the test, re-run, and confirm `verify:baseline` passes and the deploy proceeds to `supabase link`.

**Expected:** Red run: non-zero exit, "verify:baseline FAILED — aborting deploy" message, no Supabase project linked. Green run: "verify:baseline GREEN — proceeding to link + deploy" message, deploy continues.

**Why human:** The deploy gate runs on the operator's local Windows PowerShell host and requires Node + Deno + Playwright installed locally. Claude cannot invoke `scripts/deploy.ps1` against a live project. Explicitly designated MANUAL-ONLY per VALIDATION.md (plan 05-07, Task 2, type=checkpoint:human-verify, gate=blocking). The code change (lines 85-100 of `deploy.ps1`) is in place and correct; only the live abort behavior needs operator confirmation.

#### 2. GitHub branch-protection required-status-check on main and staging

**Test:** In the GitHub repository Settings → Branches, confirm the `gate` job from `.github/workflows/regression-gate.yml` is configured as a Required status check on PRs to both `main` and `staging`.

**Expected:** The Regression Gate required check is enabled on both protected branches. A PR with a failing `verify:baseline` cannot be merged.

**Why human:** Branch-protection is a GitHub repository setting, not assertable from the codebase or any file in the repo. This was the open item carried from Phase 1 (plan 01-05, "branch-protection Required check still owed — only after gate green"). The steps to enable it are documented in `TESTING-STRATEGY.md` § "Branch protection". The operator must confirm/enable it once; it then persists.

---

### Gaps Summary

No automated gaps. All 4 observable truths are verified at the code level. The 2 human-verification items are planned manual steps within the phase design (plan 05-07 is `autonomous: false`, with Task 2 explicitly `type="checkpoint:human-verify" gate="blocking"`). These are NOT failures — the code and documentation are committed and correct. The operator confirmation items are the sole remaining step before the phase is fully closed.

---

*Verified: 2026-06-19*
*Verifier: Claude (gsd-verifier)*
