***

phase: 2
slug: interview-prep-coach-backend
status: draft
nyquist\_compliant: false
wave\_0\_complete: false
created: 2026-04-11
-------------------

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

***

## Test Infrastructure

| Property               | Value                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| **Framework**          | Deno test (built-in)                                                    |
| **Config file**        | `supabase/functions/deno.json`                                          |
| **Quick run command**  | `deno test supabase/functions/_shared/usage-checker.test.ts --no-check` |
| **Full suite command** | `deno test supabase/functions/_shared/ --no-check`                      |
| **Estimated runtime**  | \~5 seconds                                                             |

***

## Sampling Rate

* **After every task commit:** Run `deno test supabase/functions/_shared/ --no-check`
* **After every plan wave:** Run `deno test supabase/functions/_shared/ --no-check`
* **Before** **`/gsd-verify-work`:** Full suite must be green
* **Max feedback latency:** 5 seconds

***

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Threat Ref | Secure Behavior                                | Test Type   | Automated Command                                                                 | File Exists | Status    |
| -------- | ---- | ---- | ----------- | ---------- | ---------------------------------------------- | ----------- | --------------------------------------------------------------------------------- | ----------- | --------- |
| 02-01-01 | 01   | 1    | IPC-02      | —          | 8 questions in correct category distribution   | unit        | `deno test supabase/functions/interview-prep-coach/validation.test.ts --no-check` | ❌ W0        | ⬜ pending |
| 02-01-02 | 01   | 1    | IPC-03      | —          | All required fields present per question       | unit        | `deno test supabase/functions/interview-prep-coach/validation.test.ts --no-check` | ❌ W0        | ⬜ pending |
| 02-01-03 | 01   | 1    | IPC-04      | —          | Uses claude-haiku-4-5-20251001 model           | manual-only | Verify model string in code                                                       | N/A         | ⬜ pending |
| 02-01-04 | 01   | 1    | IPC-09      | T-02-01    | Free tier blocked by rate limiter (free: 0)    | manual-only | Rate limiter already tested in `rate-limiter.test.ts`                             | ✅           | ⬜ pending |
| 02-01-05 | 01   | 1    | IPC-10      | —          | Usage recorded as `interview_prep` action type | manual-only | Verify usage call in code + DB enum migration                                     | N/A         | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

***

## Wave 0 Requirements

* [ ] `supabase/functions/interview-prep-coach/validation.test.ts` — unit tests for response validation function (covers IPC-02, IPC-03)
* [ ] Extract validation logic into a testable pure function (not embedded in handler)

*Existing infrastructure covers rate limiting and shared utility tests.*

***

## Manual-Only Verifications

| Behavior                          | Requirement | Why Manual                                                           | Test Instructions                                                                   |
| --------------------------------- | ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Uses Claude Haiku 4.5 model       | IPC-04      | Static config value — grep sufficient                                | `grep "claude-haiku-4-5-20251001" supabase/functions/interview-prep-coach/index.ts` |
| Free tier blocked                 | IPC-09      | Rate limiter already unit-tested; integration requires live Supabase | Verify `free: 0` in rate limit config via code inspection                           |
| Usage recorded as interview\_prep | IPC-10      | Requires live DB call                                                | Verify `checkAndRecordUsage(userId, 'interview_prep')` in code + migration applied  |

***

## Validation Sign-Off

* [ ] All tasks have `<automated>` verify or Wave 0 dependencies
* [ ] Sampling continuity: no 3 consecutive tasks without automated verify
* [ ] Wave 0 covers all MISSING references
* [ ] No watch-mode flags
* [ ] Feedback latency < 5s
* [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
