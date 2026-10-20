---
phase: 09-final-verification-milestone-report
plan: 07
subsystem: testing / remote database lane
tags: [ver-01, ver-02, d-06, s-22, remote-lane, fail-loud, test-seam]
requires:
  - 09-01 (the VER-02 executable matrix; its gap cells are this plan's work order)
provides:
  - "supabase/functions/_tests/remote-preflight.test.ts — the fail-loud gate for the remote DB lane"
  - "remoteTestFixture() / requireRemoteConfig() in _shared/__tests__/history-persistence-remote.ts"
  - "Five PROVEN history-persistence tests (S-22 x resume/onboarding/linkedin/recruiting_lens/career_compass)"
  - "Five __tests__/history-wiring.test.ts static guards (13 assertions rescued from deletion)"
affects:
  - "09-08 (owns deno.json: must register the new files + the test:remote task)"
  - "09-09 (owns gate composition: package.json test:edge:remote, deploy.ps1 -SkipRemoteDbLane, regression-gate.yml)"
  - "VER-05 report item 14 (two findings below)"
tech-stack:
  added: []
  patterns:
    - "Fail-loud lane: the preflight THROWS when DENO_TEST_SUPABASE_REMOTE !== '1' (a NEGATIVE assertion), so the lane cannot silently degrade to the offline lane"
    - "Prod-safety by construction: requireRemoteConfig() rejects the production project ref, so a row-writing suite is structurally unable to reach production"
    - "Mint-per-run fixtures: a Supabase JWT expires in ~1h and can never be a stored CI secret"
key-files:
  created:
    - supabase/functions/_tests/remote-preflight.test.ts
    - supabase/functions/analyze-resume/__tests__/history-wiring.test.ts
    - supabase/functions/analyze-career/__tests__/history-wiring.test.ts
    - supabase/functions/grade-linkedin/__tests__/history-wiring.test.ts
    - supabase/functions/recruiting-lens/__tests__/history-wiring.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/history-wiring.test.ts
  modified:
    - supabase/functions/_shared/__tests__/history-persistence-remote.ts
    - supabase/functions/_shared/anthropic.ts
    - supabase/functions/analyze-resume/__tests__/history-persistence.test.ts
    - supabase/functions/analyze-career/__tests__/history-persistence.test.ts
    - supabase/functions/grade-linkedin/__tests__/history-persistence.test.ts
    - supabase/functions/recruiting-lens/__tests__/history-persistence.test.ts
    - supabase/functions/interview-prep-analyze/__tests__/history-persistence.test.ts
  deleted:
    - "supabase/functions/{5 features}/history-persistence.test.ts (RENAMED, not dropped — see Deviation 1)"
decisions:
  - "The five bare history-persistence.test.ts copies were NOT duplicates — they were static wiring guards. Renamed to history-wiring.test.ts rather than deleted, preserving 13 assertions."
  - "The remote lane provisions a UNIQUE fixture user per test FILE, because deno runs files in parallel workers and a shared user's password reset revokes concurrently-minted JWTs."
  - "Interview Prep is held OUT of test:remote with a documented reason (not a silent skip): the interview_prep AI_TEST_MODE fixture does not exist. It maps to NO matrix cell (D-10)."
metrics:
  duration: ~75 min
  tasks: 3
  files: 13
  completed: 2026-07-11
---

# Phase 09 Plan 07: Remote Database Lane (D-06) Summary

Built the D-06 remote database lane and made it structurally incapable of passing vacuously; resurrected the five history-persistence tests that had never executed in any lane, and proved all five VER-02 matrix features against a real database (8 passed, 0 ignored, stable across two runs).

## What Shipped

**The fail-loud preflight** (`supabase/functions/_tests/remote-preflight.test.ts`) — four assertions, in order:

1. **The negative assertion.** THROWS when `DENO_TEST_SUPABASE_REMOTE !== "1"`. This is the one that forecloses the silent-degrade path: even if `test:remote` is wired without the env var, the lane FAILS rather than reporting green on zero executed assertions. The message names the sanctioned loud escape hatch (`deploy.ps1 -SkipRemoteDbLane`, which 09-09 creates).
2. **Config assertions**, reusing the existing `skipRemote()` seam (empty URL / `https://test.supabase.co` placeholder / empty key). No key value is ever echoed.
3. **The prod-safety assertion (T-09-07-C).** THROWS if the URL resolves to the production ref `zjpjapgraoxdukdvpjes`; positively requires the preview ref `cimjltzovkahkqecpwgi`. This lane INSERTS and DELETES rows and is now structurally unable to do that to production.
4. **Reachability.** `fetch(/rest/v1/)` with a 10s `AbortSignal.timeout`. A paused or unreachable preview project fails loudly; network errors and timeouts produce the same actionable message class, never a raw stack trace.

`requireRemoteConfig()` was extracted into `history-persistence-remote.ts` as the SINGLE validation seam, so `skipRemote()` and the preflight share exactly one definition of "correctly configured" — and the prod-ref rejection protects every remote test, not just the preflight.

### Verified fail-loud matrix (no secret value in any output; `grep eyJ` = 0 hits)

| Configuration | Result |
|---|---|
| `DENO_TEST_SUPABASE_REMOTE` unset | exit 1 — "must never silently degrade" |
| `REMOTE=1` + **production** ref | exit 1 — "REMOTE LANE POINTED AT PRODUCTION" |
| `REMOTE=1` + placeholder URL | exit 1 — "still the placeholder" |
| `REMOTE=1` + real preview creds | **exit 0**, 3 passed |

## The Dead Lane Is Alive

**Executed count: 8 passed, 0 failed, 0 ignored — exit 0, stable across two consecutive runs.**
(preflight x3 + resume x2 + career + linkedin + recruiting_lens.) Explicitly NOT `0 passed; N ignored` — that vacuous-green shape is the exact failure this lane exists to prevent.

All five S-22 matrix features (resume, onboarding, linkedin, recruiting_lens, career_compass) are now proven against a real database. Onboarding is `analyze-resume` with `origin: 'onboarding'`, so the resume evidence carries its column.

**Root cause of the dead lane** (the plan assumed the tests merely needed running; the truth was structural): they were written against `MERIT_TEST_USER_ID` / `MERIT_TEST_USER_JWT` / `MERIT_TEST_RESUME_ID` — three env vars provisioned by **nothing**: not `.env.test.local`, not `.env.test.local.example`, not `docs/ENVIRONMENT.md`, not any script, not any workflow. And `MERIT_TEST_USER_JWT` could never have worked as a stored CI secret in the first place: a Supabase access token expires in ~1 hour. The fixture must be **minted per run**. `remoteTestFixture()` now does that (fail-loud on every path; honors an injected `MERIT_TEST_*` triple so CI can still supply its own).

## Findings (route to VER-05 report item 14)

**FINDING 1 — `grade_linkedin` AI_TEST_MODE mock was stale. FIXED.** `_shared/anthropic.ts` still emitted the retired pre-08.1/08.3 shape (`overall_score` + `categories[]`, `suggestedRewrite`), while `grade-linkedin/schema.ts` now hard-rejects it (`sectionBreakdown`, exactly 4 sections, positional names, catalogue-pinned `maxScore`, `suggestedFix`). **Every AI_TEST_MODE run of grade-linkedin returned 500.** This is precisely the "11-section → 4-section LinkedIn schema change" drift the plan predicted — but it had landed in the TEST SEAM, not the test. Rewritten to the live contract. Inert in production (AI_TEST_MODE only).

**FINDING 2 — `interview_prep` has NO AI_TEST_MODE mock fixture at all. NOT FIXED (deferred).** `getMockFixtureText()` has no `case 'interview_prep'`, so it falls through to the plain-text default (`"Mock Claude response for test mode."`), which is not JSON — `interview-prep-analyze` therefore 500s (`internal_error`) under AI_TEST_MODE. Interview Prep maps to **NO** VER-02 registry cell (D-10 — Coming Soon, excluded), so this blocks no matrix cell. Left as a real, loud failure rather than skipped or bent.

## Deviations from Plan

**1. [Rule 1 — Bug] The five "duplicate" History contracts were not duplicates.**
- **Found during:** Task 1.
- **Issue:** The plan's premise (Pitfall 6) was that `{feature}/history-persistence.test.ts` was a dead divergent copy of `{feature}/__tests__/history-persistence.test.ts`, to be deleted. Diffing all five pairs showed they are **complementary, not duplicate**: the bare copies are static source-grep WIRING guards (13 assertions, 12 of which passed); the `__tests__/` copies are remote integration tests. Deleting the bare copies would have silently dropped 13 live assertions — the exact "do not lose coverage in a cleanup" trap the plan warned against.
- **Fix:** RENAMED them to `{feature}/__tests__/history-wiring.test.ts` instead of deleting. One History contract per feature, no name collision, zero coverage loss.
- **Commit:** `44095ae5`

**2. [Rule 1 — Bug] Stale assertion reconciled (Phase-4 Rule-1 precedent).**
- `grade-linkedin`'s `storeAndNotify` return type gained a third field (`analysisId`) when the `analysis_results` linkage landed. The assertion pinned the old 2-field shape `{ response, recordId }` verbatim and was RED. Reconciled to the current contract; the contract being guarded (the helper hands the `linkedin_grades` row id back so usage can be linked to it) is unchanged.
- **Commit:** `44095ae5`

**3. [Rule 2 — Missing critical functionality] The fixture bootstrap.**
- The remote lane could not run at all without minted fixtures (see root cause above). Added `remoteTestFixture()`.
- **Commit:** `dbd24815`

**4. [Rule 1 — Bug] Parallel-worker JWT race, introduced then fixed.**
- The first bootstrap reused one fixture user and reset its password per call. `deno test` runs test files in **parallel workers**, so a concurrently-starting file's password reset revoked JWTs another file had already minted (observed: resume flipped green→red while linkedin went red→green). Fixed by provisioning a **unique fixture user per test file** (memoized per module), plus a best-effort prune of >2h-old fixture users so the lane does not pollute preview indefinitely (T-09-07-D). Two consecutive runs: 8/8, 8/8.
- **Commit:** `dbd24815`

**5. [Rule 1 — Bug] `grade_linkedin` mock fixture rewrite** — see Finding 1. Required a **preview-only** deploy of `grade-linkedin` (sanctioned by the CLAUDE.md preview access policy: "Preview/test: Claude can inspect, query, apply migrations, deploy edge functions, and test"). Production was not touched.
- **Commit:** `dbd24815`

## Deferred Issues

- **Finding 2** (`interview_prep` AI_TEST_MODE fixture missing). Fix-attempt budget for Task 3 was reached; Interview Prep maps to no matrix cell, so it is not on the critical path. **Handoff to 09-08: do NOT register `interview-prep-analyze/__tests__/history-persistence.test.ts` in `test:remote` until that fixture exists** — registering it would make the gate red for a Coming-Soon feature. Hold it out with a documented reason, never a silent skip.

## Secrets Hygiene

- No Supabase service-role key value appears in any error message, log, artifact, or commit (`grep eyJ` on all captured output and changed files = **0 hits**).
- `AI_TEST_MODE` was **already** `true` on preview (secret digest = `sha256("true")`). **No preview secret was set, changed, or unset** — the plan's transient-secret step was a verified no-op. Nothing was ever set on production.
- Fixture passwords are generated per run, never logged, never persisted.

## Scope Discipline (verified empty diffs)

`git diff --stat -- supabase/functions/deno.json package.json scripts/deploy.ps1 .github/workflows/regression-gate.yml` → **EMPTY**. 09-08 owns registration; 09-09 owns gate composition.

## Handoff to 09-08 (registration)

Register in the new `test:remote` task, **preflight FIRST**:
```
_tests/remote-preflight.test.ts
analyze-resume/__tests__/history-persistence.test.ts
analyze-career/__tests__/history-persistence.test.ts
grade-linkedin/__tests__/history-persistence.test.ts
recruiting-lens/__tests__/history-persistence.test.ts
```
Register in the offline `test:ci` allowlist (5 new static guards, 13 assertions):
```
{analyze-resume,analyze-career,grade-linkedin,recruiting-lens,interview-prep-analyze}/__tests__/history-wiring.test.ts
```
The remote lane additionally needs a preview anon key (`SUPABASE_ANON_KEY_STAGING`, falling back to `SUPABASE_TEST_ANON_KEY`) to mint the JWT — a new name for `docs/ENVIRONMENT.md`.

The five S-22 gap cells can now be closed with real, passing tests.

## Verification

- [x] Preflight FAILS LOUDLY: no `REMOTE=1`; placeholder URL; production ref.
- [x] Preflight + history files exit 0 against preview with a NON-ZERO executed count (8, not "0 passed; N ignored"), twice.
- [x] Exactly one History contract per feature.
- [x] `deno task test:ci` (offline lane) still green: **1133 passed, 0 failed** — after the `anthropic.ts` change.
- [x] `deno.json` / `package.json` / `deploy.ps1` / `regression-gate.yml` untouched.

## Self-Check: PASSED

All created files exist on disk; all three commits (`44095ae5`, `d4cacaac`, `dbd24815`) are present in `git log`.
