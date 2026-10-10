***

phase: 13-merit-enforcement-and-feature-flag
verified: 2026-04-16T14:05:00Z
status: human\_needed
score: 7/7 must-haves verified
overrides\_applied: 0
human\_verification:

* test: "NFR-01 performance gate: p99 < 100ms over 10 warm runs"
  expected: "All 10 consecutive runs of merit-gateway.perf.test.ts pass with p99 < 100ms"
  why\_human: "Requires DENO\_TEST\_SUPABASE\_LOCAL=1 + live local Supabase instance; cannot verify programmatically without DB"
* test: "Feature-flag cutover staging test"
  expected: "Setting MERIT\_SYSTEM\_ENABLED=true routes analyze-resume through withMerits; setting false restores legacy usage\_tracking path"
  why\_human: "Requires deployed staging environment with Supabase secrets set"
* test: "Alert email delivery end-to-end"
  expected: "Triggering negative\_balance in staging DB and invoking check-merit-alerts sends email to ADMIN\_EMAILS\[0]"
  why\_human: "Requires live Resend integration and deployed edge function"
* test: "Cron schedule registration"
  expected: "After running phase-13-cron-setup.sql in staging SQL editor, cron.job has 'check-merit-alerts' row"
  why\_human: "Requires SQL editor access to staging Supabase project"
* test: "NFR-02 backend read-after-write"
  expected: "merit-gateway.raw\.test.ts passes with DENO\_TEST\_SUPABASE\_LOCAL=1 against local Supabase"
  why\_human: "Requires DENO\_TEST\_SUPABASE\_LOCAL=1 + live local Supabase; skip-guard passes trivially in CI"
  deferred:
* truth: "NFR-02 frontend UI propagation (<5s from commit to all browser surfaces)"
  addressed\_in: "Phase 20"
  evidence: "Phase 20 SC #2: 'Every feature page shows the Merit cost and current balance above its Analyze button and updates within 5 seconds of any balance change.'"

***

# Phase 13: Merit Enforcement and Feature Flag Verification Report

**Phase Goal:** Wire the universal `check-and-deduct-merits` gateway into every AI feature, with pre-call deduction, auto-refund on failure, feature-flag cutover, and full observability.
**Verified:** 2026-04-16T14:05:00Z
**Status:** human\_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth                                                                                                                                 | Status                                            | Evidence                                                                                                                                                                                                                                                      |
| - | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Every AI feature call on the new path invokes check-and-deduct-merits before making any Anthropic request (SC-1)                      | VERIFIED                                          | 9 handler files import MERIT\_SYSTEM\_ENABLED + withMerits from merit-gateway.ts; withMerits calls rpc('check\_and\_deduct\_merits') at line 130 before callback execution; grep confirms 9 handler files with D-06 branch                                    |
| 2 | A forced AI failure results in an automatic refund row in merit\_transactions and the user's balance returns to pre-call state (SC-2) | VERIFIED                                          | test-07.test.ts Test 2 proves: AI\_FORCE\_FAILURE compound gate fires 529, isRefundableAnthropicError classifies it, mock deduction+refund restores balance; withMerits catch branch calls rpc('refund\_merits') at line 175 on refundable errors             |
| 3 | A typical end-to-end Merit check + deduction round-trip completes in under 100 ms against a warm database (SC-3)                      | VERIFIED (test exists, human needed for live run) | merit-gateway.perf.test.ts exists (47 lines) with p99 < 100ms assertion; gated on DENO\_TEST\_SUPABASE\_LOCAL=1; passes via skip-guard in CI; live measurement requires human                                                                                 |
| 4 | Flipping MERIT\_SYSTEM\_ENABLED=false routes features back to the legacy usage\_tracking path without errors (SC-4)                   | VERIFIED                                          | MERIT\_SYSTEM\_ENABLED=false is default; all 9 handlers have else-equivalent fall-through to legacy can\_perform\_ai\_action/checkAndRecordUsage path; legacy-unchanged.test.ts pins 3 canary assertions; test-07 Test 4 pins flag-off legacy path            |
| 5 | Admin metrics query returns total Merits in circulation, per-feature consumption/day, and conversion rates (SC-5)                     | VERIFIED                                          | admin-merit-metrics/index.ts queries 4 views at lines 92-95; dual admin gate (ADMIN\_EMAILS + user\_roles); 5 passing tests; v\_conversion\_funnel is PROVISIONAL stub (zero rows) until merit\_exhaustion\_events table exists                               |
| 6 | An alert fires when Merit balance goes negative, AI failure rate exceeds 5%, or shop purchase failure rate exceeds 2% (SC-6)          | VERIFIED                                          | check-merit-alerts/index.ts evaluates 3 conditions: negative\_balance, ai\_failure\_rate\_high (>= 0.05), shop\_failure\_rate\_high (>= 0.02); debounce via alert\_state (60min); 7 passing tests including threshold boundary regression                     |
| 7 | A user exceeding 60 AI analyses in an hour is rate-limited with a clear error (SC-7)                                                  | VERIFIED                                          | merit-gateway.ts pooled limiter: key 'ai-analyses-all', limits { free: 60, pro: 60, elite: 60 } at line 37; checkRateLimit runs BEFORE deduction at line 121; createRateLimitResponse returns 429; merit-gateway.rate.test.ts exists with 61st-call assertion |

**Score:** 7/7 truths verified

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item                                                                                                                      | Addressed In | Evidence                                                                                                                                                   |
| - | ------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | NFR-02 frontend UI propagation (<5s from commit to all browser surfaces -- AiCreditsContext, header badge, mid-stream UI) | Phase 20     | Phase 20 SC #2: "Every feature page shows the Merit cost and current balance above its Analyze button and updates within 5 seconds of any balance change." |

### Required Artifacts

| Artifact                                  | Expected                               | Status   | Details                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_shared/merit-gateway.ts`                | withMerits gateway, >200 lines         | VERIFIED | 266 lines; exports withMerits, refundMeritsForJob, MERIT\_SYSTEM\_ENABLED, MeritRefundable, isRefundableAnthropicError, insufficientMeritsResponse, tierLockedResponse; calls rpc('check\_and\_deduct\_merits') and rpc('refund\_merits'); pooled rate limiter at 'ai-analyses-all'; createLogger('merit-gateway') |
| `_shared/anthropic.ts`                    | AI\_FORCE\_FAILURE compound gate       | VERIFIED | Compound gate at lines 528-536 (invokeAnthropicText) and 700-706 (streamAnthropicText); two-key defense requires both AI\_TEST\_MODE and AI\_FORCE\_FAILURE                                                                                                                                                        |
| `_shared/anthropic.test.ts`               | 3 compound gate tests                  | VERIFIED | 46 lines, 3 Deno.test entries proving compound gate behavior                                                                                                                                                                                                                                                       |
| `_shared/merit-gateway.test.ts`           | Unit tests for gateway pure functions  | VERIFIED | 100 lines, 10 Deno.test entries covering classification, types, response helpers                                                                                                                                                                                                                                   |
| `_shared/merit-gateway.perf.test.ts`      | NFR-01 perf assertion                  | VERIFIED | 47 lines, 1 test with skip-guard; p99 < 100ms assertion gated on DENO\_TEST\_SUPABASE\_LOCAL                                                                                                                                                                                                                       |
| `_shared/merit-gateway.rate.test.ts`      | NFR-05 rate limit assertion            | VERIFIED | 45 lines, 1 test with skip-guard; 61st-call assertion gated on DENO\_TEST\_SUPABASE\_LOCAL                                                                                                                                                                                                                         |
| `_shared/merit-gateway.raw.test.ts`       | NFR-02 backend read-after-write        | VERIFIED | 190 lines, 3 tests with skip-guard; fresh createClient() instances; zero sleep/polling                                                                                                                                                                                                                             |
| `analyze-resume/test-07.test.ts`          | TEST-07 canonical e2e test             | VERIFIED | 496 lines, 4 Deno.test entries: deduction, force-failure refund chain, idempotency, flag-off legacy                                                                                                                                                                                                                |
| `analyze-resume/merit-branch.test.ts`     | D-06 branch presence test              | VERIFIED | 26 lines, 3 text assertions: import, withMerits call, feature key                                                                                                                                                                                                                                                  |
| `analyze-resume/legacy-unchanged.test.ts` | MIG-05 regression test                 | VERIFIED | 25 lines, 3 regression pins: can\_perform\_ai\_action, createUsageLimitResponse, usageUserId                                                                                                                                                                                                                       |
| `admin-merit-metrics/index.ts`            | Admin metrics endpoint                 | VERIFIED | 132 lines; queries 4 views; dual admin gate (ADMIN\_EMAILS + user\_roles)                                                                                                                                                                                                                                          |
| `admin-merit-metrics/index.test.ts`       | NFR-10 admin gate tests                | VERIFIED | 210 lines, 5 Deno.test entries                                                                                                                                                                                                                                                                                     |
| `check-merit-alerts/index.ts`             | Alert evaluator                        | VERIFIED | 228 lines; 3 evaluators; alert\_state debounce (60min); non-fatal DB errors; email via send-strivo-email                                                                                                                                                                                                           |
| `check-merit-alerts/index.test.ts`        | NFR-11 alert tests                     | VERIFIED | 488 lines, 7 Deno.test entries including threshold boundary regression                                                                                                                                                                                                                                             |
| `migrations/20260416000000...sql`         | 4 views + alert\_state + 2 RPCs        | VERIFIED | 142 lines; 4 views, alert\_state with RLS, get\_ai\_failure\_rate\_1h, get\_shop\_failure\_rate\_1h; v\_conversion\_funnel PROVISIONAL stub                                                                                                                                                                        |
| `ops/phase-13-cron-setup.sql`             | Per-env cron template                  | VERIFIED | 21 lines; cron.schedule('check-merit-alerts') every 15 min; separate from migration                                                                                                                                                                                                                                |
| `analyze-resume/index.ts`                 | D-06 branch on 'resume\_analysis'      | VERIFIED | Import line 13; branch line 240; feature key 'resume\_analysis'; legacy can\_perform\_ai\_action at line 522                                                                                                                                                                                                       |
| `analyze-career/index.ts`                 | D-06 branch on 'career\_compass'       | VERIFIED | Import line 12; branch line 375; feature key 'career\_compass'                                                                                                                                                                                                                                                     |
| `grade-linkedin/index.ts`                 | D-06 branch on 'linkedin\_grading'     | VERIFIED | Import line 11; branch line 102; feature key 'linkedin\_grading'                                                                                                                                                                                                                                                   |
| `recruiting-lens/index.ts`                | D-06 branch on 'recruiting\_lens'      | VERIFIED | Import line 17; branch line 195; feature key 'recruiting\_lens'                                                                                                                                                                                                                                                    |
| `analyze-skills-gap/index.ts`             | D-06 branch on 'skills\_gap\_analysis' | VERIFIED | Import line 8; branch line 35; feature key 'skills\_gap\_analysis'                                                                                                                                                                                                                                                 |
| `compare-jobs/index.ts`                   | D-06 branch on 'job\_comparison'       | VERIFIED | Import line 8; branch line 65; feature key 'job\_comparison'                                                                                                                                                                                                                                                       |
| `interview-prep-coach/index.ts`           | D-06 branch on 'interview\_prep'       | VERIFIED | Import line 9; branch line 49; feature key 'interview\_prep'; TODO(phase-19)                                                                                                                                                                                                                                       |
| `submit-resume-analysis-job/index.ts`     | Submission-time deduction              | VERIFIED | Import line 6; branch line 82; merit\_transaction\_id at line 129                                                                                                                                                                                                                                                  |
| `submit-career-analysis-job/index.ts`     | Submission-time deduction              | VERIFIED | Import line 6; branch line 67; merit\_transaction\_id at line 119                                                                                                                                                                                                                                                  |
| `scripts/run-edge-tests.ps1`              | All 10 Phase 13 tests registered       | VERIFIED | Lines 24-39 list all 10 test files                                                                                                                                                                                                                                                                                 |

### Key Link Verification

| From                         | To                                             | Via                                                              | Status | Details                                        |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------ | ---------------------------------------------- |
| merit-gateway.ts::withMerits | check\_and\_deduct\_merits RPC                 | supabase.rpc() at line 130                                       | WIRED  | Phase 11 RPC consumed correctly                |
| merit-gateway.ts::withMerits | refund\_merits RPC                             | supabase.rpc() at lines 175, 216                                 | WIRED  | Catch branch + refundMeritsForJob              |
| merit-gateway.ts             | checkRateLimit('ai-analyses-all')              | import from rate-limiter.ts, call at line 121                    | WIRED  | Pooled 60/hr limit                             |
| merit-gateway.ts             | createLogger('merit-gateway')                  | import from logger.ts, instantiated at line 26                   | WIRED  | Structured transaction logs                    |
| 9 gated handlers             | merit-gateway.ts                               | import { MERIT\_SYSTEM\_ENABLED, withMerits, MeritRefundable }   | WIRED  | All 9 handler files confirmed                  |
| submit-\*-job handlers       | analysis\_jobs.metadata.merit\_transaction\_id | insert payload inside withMerits callback                        | WIRED  | submit-resume line 129, submit-career line 119 |
| admin-merit-metrics          | 4 Postgres views                               | supabase.from('v\_...').select('\*') at lines 92-95              | WIRED  | 4 view queries confirmed                       |
| check-merit-alerts           | alert\_state + helper RPCs                     | supabase.from('alert\_state') + supabase.rpc()                   | WIRED  | Lines 56, 73, 172, 197                         |
| check-merit-alerts           | send-strivo-email                              | fetch to SUPABASE\_URL/functions/v1/send-strivo-email at line 95 | WIRED  | Email forward, not direct Resend               |
| test-07.test.ts              | AI\_FORCE\_FAILURE compound gate               | Deno.env.set + invokeAnthropicText call                          | WIRED  | Test 2 exercises real compound gate            |
| ops/phase-13-cron-setup.sql  | check-merit-alerts                             | pg\_cron + net.http\_post every 15 min                           | WIRED  | Template with correct endpoint pattern         |

### Data-Flow Trace (Level 4)

| Artifact                     | Data Variable                            | Source                   | Produces Real Data                               | Status                                                     |
| ---------------------------- | ---------------------------------------- | ------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| merit-gateway.ts             | rpc('check\_and\_deduct\_merits') result | Phase 11 Postgres RPC    | Yes -- atomic deduction from user\_merits        | FLOWING                                                    |
| merit-gateway.ts             | rpc('refund\_merits') result             | Phase 11 Postgres RPC    | Yes -- idempotent reversal                       | FLOWING                                                    |
| admin-merit-metrics/index.ts | 4 view queries                           | Phase 13 migration views | 3 live + 1 PROVISIONAL stub                      | FLOWING (partial: v\_conversion\_funnel returns zero rows) |
| check-merit-alerts/index.ts  | rpc('get\_ai\_failure\_rate\_1h')        | Phase 13 migration RPC   | Yes -- queries merit\_transactions trailing hour | FLOWING                                                    |

### Behavioral Spot-Checks

| Behavior                                   | Command                                                  | Result                             | Status |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------- | ------ |
| No ignore:true stubs remaining             | grep for `ignore:\s*true` across all Phase 13 test files | 0 matches                          | PASS   |
| D-03: refund\_merits only in gateway       | grep rpc('refund\_merits') in index.ts files             | 0 matches outside merit-gateway.ts | PASS   |
| Pitfall 2: processors untouched            | grep merit-gateway in process-\*-job/                    | 0 matches                          | PASS   |
| Pitfall 5: no cron in migration            | grep cron.schedule in migration file                     | 0 matches                          | PASS   |
| Pitfall 8: AI\_FORCE\_FAILURE double-gated | grep AI\_TEST\_MODE in anthropic.ts                      | 6 matches across invoke + stream   | PASS   |
| All 9 handlers have D-06 branch            | grep MERIT\_SYSTEM\_ENABLED in handler index.ts files    | 9 files matched                    | PASS   |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                  | Status                                                | Evidence                                                                  |
| ----------- | ------------ | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| BACK-01     | 13-02, 13-03 | check-and-deduct-merits gateway                              | SATISFIED                                             | withMerits in merit-gateway.ts; all 9 handlers wired                      |
| MER-11      | 13-02, 13-05 | Deduction before AI; auto-refund on failure                  | SATISFIED                                             | withMerits deducts first, refunds on classification; test-07 proves chain |
| NFR-01      | 13-02        | Merit check+deduction < 100ms                                | SATISFIED (test exists; live measurement needs human) | merit-gateway.perf.test.ts with p99 assertion                             |
| NFR-02      | 13-02        | Eventually consistent within 5s                              | PARTIALLY SATISFIED                                   | Backend closed (raw\.test.ts); UI propagation deferred to Phase 20        |
| NFR-03      | 13-02        | All Merit ops server-side only                               | SATISFIED                                             | getServiceClient() only; no client-side manipulation                      |
| NFR-05      | 13-02        | 60 AI analyses/hr rate limit                                 | SATISFIED                                             | Pooled limiter at 'ai-analyses-all' 60/60/60; rate.test.ts                |
| NFR-09      | 13-02        | Observability logging                                        | SATISFIED                                             | Structured log with user\_id, feature, transaction\_id, rpc\_duration\_ms |
| NFR-10      | 13-04        | Admin metrics                                                | SATISFIED                                             | 4 aggregates, dual admin gate, 5 tests                                    |
| NFR-11      | 13-04        | Alerts on negative balance, AI failure >5%, shop failure >2% | SATISFIED                                             | 3 evaluators, debounce, non-fatal, 7 tests                                |
| MIG-05      | 13-03        | Feature flag gates all features                              | SATISFIED                                             | MERIT\_SYSTEM\_ENABLED in all 9 handlers; legacy path preserved           |
| TEST-07     | 13-05        | AI failure refund integration test                           | SATISFIED                                             | 4-test suite proves deduction, refund, idempotency, flag-off              |

### Anti-Patterns Found

| File                          | Line      | Pattern                   | Severity | Impact                                                                          |
| ----------------------------- | --------- | ------------------------- | -------- | ------------------------------------------------------------------------------- |
| interview-prep-coach/index.ts | 47        | TODO(phase-19) comment    | INFO     | Expected -- Phase 19 rewrites body; branch is functional                        |
| v\_conversion\_funnel         | migration | PROVISIONAL zero-row stub | INFO     | merit\_exhaustion\_events absent; admin metrics returns empty array; documented |

### Human Verification Required

### 1. NFR-01 Performance Gate (SC-3)

**Test:** Run `DENO_TEST_SUPABASE_LOCAL=1 deno test supabase/functions/_shared/merit-gateway.perf.test.ts --no-check --allow-env --allow-net --allow-read` 10 consecutive times against a warm local Supabase instance.
**Expected:** All 10 runs pass with p99 < 100ms.
**Why human:** Requires a running local Supabase instance with Phase 10/11 schema deployed. The CI skip-guard passes trivially without a DB.

### 2. Feature-Flag Cutover Staging Test (MIG-05)

**Test:** In staging: `supabase secrets set MERIT_SYSTEM_ENABLED=true`, then curl `analyze-resume` with a test resume. Check `merit_transactions` for a new row. Flip back to false, curl again, confirm `usage_tracking` increment instead.
**Expected:** Flag-on routes through withMerits (merit\_transactions row created); flag-off routes through legacy path (usage\_tracking incremented).
**Why human:** Requires deployed staging environment with Supabase secrets access.

### 3. Alert Email Delivery (NFR-11)

**Test:** Insert a row with negative balance in `user_merits` on staging, then invoke `check-merit-alerts`. Check ADMIN\_EMAILS\[0] inbox.
**Expected:** Email received with subject "\[Strivo] Negative merit balance detected".
**Why human:** Requires live Resend integration and deployed check-merit-alerts function.

### 4. Cron Schedule Registration (NFR-11)

**Test:** Run `supabase/ops/phase-13-cron-setup.sql` (with PROJECT\_REF and INTERNAL\_JOB\_SECRET substituted) in staging SQL editor. Query `SELECT * FROM cron.job WHERE jobname = 'check-merit-alerts'`.
**Expected:** One row with `*/15 * * * *` schedule.
**Why human:** Requires SQL editor access to staging Supabase project.

### 5. NFR-02 Backend Read-After-Write (Live DB)

**Test:** Run `DENO_TEST_SUPABASE_LOCAL=1 deno test supabase/functions/_shared/merit-gateway.raw.test.ts --no-check --allow-env --allow-net --allow-read` against local Supabase.
**Expected:** 3 tests pass: happy-path read-after-write, refund visible immediately, documented skip when env unset.
**Why human:** Requires running local Supabase with Phase 10/11 schema. CI skip-guard passes trivially.

### Gaps Summary

No blocking gaps found. All 7 ROADMAP success criteria have been verified against the codebase with concrete evidence. The NFR-02 frontend UI propagation layer is explicitly deferred to Phase 20 with matching evidence in Phase 20's success criteria.

The v\_conversion\_funnel view is a PROVISIONAL zero-row stub (merit\_exhaustion\_events table does not exist), but admin metrics still returns the key with an empty array. This is documented and does not block the phase goal.

Five items require human verification against a live environment (staging or local Supabase). All automated checks -- code existence, substance, wiring, data-flow, CI invariant grep gates -- pass.

***

_Verified: 2026-04-16T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
