---
phase: 02-ai-token-cost-optimization
plan: 04
subsystem: edge-functions
tags: [telemetry, tokens, observability, drift-guard, tok-02]
requires:
  - "_shared/anthropic.ts :: AnthropicInvokeParams.telemetry (02-02)"
  - "_shared/ai-telemetry.ts :: recordAiCall (02-02)"
  - "public.ai_call_telemetry applied to preview cimjltzovkahkqecpwgi (D02-02-A, resolved)"
provides:
  - "telemetry labels on all 5 grade-linkedin Anthropic call sites"
  - "telemetry labels on the recruiting-lens 3-call fan-out + its retry (attempt 1 / 2)"
  - "telemetry labels on all 4 Interview Prep call sites (analyze + evaluate)"
  - "_shared/telemetry-coverage.test.ts — static drift guard, registered in test:ci"
affects:
  - "supabase/functions/deno.json test:ci"
  - "02-05/02-06 report SQL joins on call_name == the CALL_CONFIGS key"
tech-stack:
  added: []
  patterns:
    - "telemetry callName IS the config key, so the recommendation table joins cap to measurement"
    - "static source-count drift guard (an unlabelled call site is invisible at runtime)"
key-files:
  created:
    - supabase/functions/_shared/telemetry-coverage.test.ts
  modified:
    - supabase/functions/grade-linkedin/index.ts
    - supabase/functions/recruiting-lens/index.ts
    - supabase/functions/interview-prep-analyze/index.ts
    - supabase/functions/interview-prep-evaluate/index.ts
    - supabase/functions/deno.json
decisions:
  - "invokeWithRetry counts as a labellable call site (it spreads AnthropicInvokeParams straight into the seam), so the guard counts invokeAnthropicText( AND invokeWithRetry("
  - "attempt distinguishes only the EXPLICIT retry call sites; invokeWithRetry's own internal 3-attempt loop reports one attempt number (ai-retry.ts was out of scope)"
  - "interview-prep-evaluate labels tier 'elite' — the budget getMaxOutput was asked for, not the caller's subscription (a Pro user evaluating an elite_taste quiz still spends the elite cap)"
  - "interview-prep-analyze callName carries the variant (interview-prep-generate:pro|elite|elite_taste) because the variant is what selects the cap"
  - "the guard collects every file's delta before asserting, so one drifting function does not hide the others behind an early abort"
metrics:
  duration: 21min
  tasks: 3
  files: 6
  completed: 2026-07-21
---

# Phase 02 Plan 04: Telemetry Coverage — LinkedIn, Recruiting Lens, Interview Prep — Summary

Every live Anthropic call in the repo now carries a server-derived `{ feature, tier,
callName, reqId, userId, attempt }` label, and a static source-count guard inside
`verify:baseline` fails the build the moment a call site is added without one.

## What Was Built

### Task 1 — grade-linkedin + recruiting-lens (`d67fb8b2`)

**grade-linkedin has FIVE call sites, not the four the plan's stale RESEARCH line numbers
predicted** (three of them go through `_shared/ai-retry.ts::invokeWithRetry`, which was
extracted after the research pass):

| Site | Path | attempt |
| --- | --- | --- |
| `runTieredAiCall` main loop | LIVE (merit + free-scan) | 1 |
| `runTieredAiCall` validation-retry | LIVE | 2 |
| lifecycle `generate()` closure | dormant (`ANALYSIS_LIFECYCLE_LINKEDIN`) | 1 |
| legacy `MERIT_SYSTEM_ENABLED=false` main | legacy | 1 |
| legacy validation-retry | legacy | 2 |

`runTieredAiCall` gained a `reqId` parameter (both call sites updated) because the request
id lives only inside the logger closure. The validation-retry reuses the shared `aiParams`
via `{ ...aiParams, telemetry: { ...aiParams.telemetry, attempt: 2 } }` — which preserves
`cache.test.ts`'s verbatim `invokeWithRetry(aiParams, log, { deadlineAt })` assertion on
the first site and `retry-deadline.test.ts`'s "both loops are deadline-bounded" regex on
both. The dormant lifecycle closure is labelled in lockstep with the live path so flipping
the flag cannot silently drop telemetry.

**recruiting-lens** has one physical `invokeAnthropicText` inside `makeCall`, which serves
four logical calls (3-call fan-out + a per-call retry). `makeCall` gained an `attempt`
parameter (1 from the fan-out, 2 from the retry loop) and `executeParallelCalls` gained
optional `reqId` / `userId`, threaded from all three of its call sites (lifecycle,
`withMerits`, and the non-merit legacy path). `callName` is `callType` itself — i.e. the
literal `CALL_CONFIGS` key `rl-call-1|2|3` — so 02-05's recommendation table joins the
measured headroom straight onto the cap it is judging, with no mapping layer to get wrong.

`tier` on every site is the server-resolved tier already driving `LINKEDIN_MAX_TOKENS` /
`RCL_MAX_TOKENS` (T-02-11). No request body field and no direct `profiles` column read is
involved anywhere, so the operator's admin account cannot be mislabelled as free.

### Task 2 — Interview Prep (`7d8e6fc9`)

Four sites: `interview-prep-analyze` first attempt (temp 0.4) + validation/silent-drop
retry (temp 0.2), and `interview-prep-evaluate` first attempt + validation retry. The
analyse callName carries the variant (`interview-prep-generate:pro|elite|elite_taste`)
because `variant === 'pro' ? Math.min(5000, cap) : cap` means the variant *is* the cap
selector; evaluate uses a distinct `interview-prep-evaluate` so generation and evaluation
rows can never merge in the report.

**Scope note (operator decision):** Interview Prep cap TUNING is explicitly deferred out of
this phase. This task instruments only — the 5000 pro / 12000 elite values are untouched,
and Interview Prep is NOT added to the measurement matrix or the recommendation table. The
telemetry is permanent, so data accumulates for whenever that mini-milestone reopens.

### Task 3 — the drift guard (`82d99be1`)

`_shared/telemetry-coverage.test.ts` mirrors `_shared/sanitizer-coverage.test.ts`: an
enrolled list of 6 AI functions with an exact `=== 6` length assertion, plus a per-file
count comparison of Anthropic call sites against `telemetry: {` blocks. Comments are
stripped before counting (the same `readIndexCode` shape `retry-deadline.test.ts` uses) so
prose cannot inflate either side. A third test pins that `_shared/anthropic.ts` is excluded
by design — it defines the seam and performs the write; enrolling it would assert a
tautology — while still asserting the seam calls `recordAiCall(`.

Two design points worth keeping:

- **`invokeWithRetry(` counts as a call site.** It takes `AnthropicInvokeParams` and
  spreads them into `invokeAnthropicText`, so it is labellable — and 3 of grade-linkedin's
  5 sites use it. Counting only the raw seam would have declared grade-linkedin fully
  covered while 60% of its calls wrote nothing.
- **All deltas are collected before asserting.** An early abort on the first drifting file
  hides the rest; the failure message is the whole work order.

**Fail-before demonstrated:** with one `telemetry:` block removed from
`grade-linkedin/index.ts`, the guard failed with
`grade-linkedin/index.ts: 5 Anthropic call site(s) but 4 telemetry block(s) (delta 1)`.
The block was restored (`git diff --stat` clean against the Task-1 commit) and the guard
returned green.

Registered at the end of `deno.json` `test:ci` (existing list preserved byte-for-byte), so
it rides inside `verify:baseline`.

## Verification

| Check | Result |
| --- | --- |
| `deno check` on all 4 modified `index.ts` | clean |
| `deno test grade-linkedin/ recruiting-lens/` | **294 passed / 0 failed** (byte-preserve, retry-deadline, cache, history-wiring all green) |
| `deno test _shared/telemetry-coverage.test.ts` | 3 passed / 0 failed |
| `deno task test:ci` (full offline suite) | **1368 passed / 0 failed / 12 ignored** |
| `git diff` cap audit on the Task-1 commit | **0** changed lines matching `maxTokens:` / `temperature:` / `timeoutMs:` — label-only, as required |

## Deviations from Plan

**1. [Rule 3 — Blocking] The plan's call-site line numbers were stale; grade-linkedin has 5
sites, not 4.** The RESEARCH pass predated the `_shared/ai-retry.ts` extraction, so it
listed only `invokeAnthropicText` occurrences. All 5 real sites were located by grep and
labelled. This also forced the coverage guard to count `invokeWithRetry(` — a strictly
stronger guard than the plan specified.

**2. [Rule 3 — Blocking] `runTieredAiCall` / `executeParallelCalls` needed new parameters.**
Neither had `reqId` in scope (recruiting-lens also lacked `userId`). Both signatures were
widened with the context they need; every call site was updated. No control flow changed
and no test asserted either signature.

**3. Guard shape upgraded to collect-then-assert.** The plan described a per-file
assertion. During the parallel run with 02-03, an early abort on `analyze-career` masked
the state of the four files this plan owns — so the guard now reports every drifting file
at once. Strictly more diagnosable; the assertion is not weakened.

### Out of scope (logged, not fixed)

- **`interview-prep-analyze/phase22-contract.test.ts` is RED at HEAD (3 failures) —
  pre-existing.** Verified by stashing this plan's changes and re-running: still 0 passed /
  3 failed. It is not in `deno.json` `test:ci` and therefore not in `verify:baseline`.
  Logged as D02-04-A.
- **`scripts/check-edge-boot.mjs` still cannot spawn `deno` on this machine** (D02-02-B,
  pre-existing). Equivalent coverage obtained via `deno check` on every modified
  `index.ts`, which is the same check the script wraps.
- **`invokeWithRetry`'s internal retry loop reports a single `attempt` value.** A transport
  retry inside `ai-retry.ts` writes a row with the caller's attempt number. Labelling those
  distinctly requires editing `_shared/ai-retry.ts`, which is outside this plan's declared
  files. Every row still carries true usage and `max_tokens`, so headroom analysis is
  unaffected; only the retry *count* per attempt label is coarse. Logged as D02-04-B.

## Parallel-execution note

This plan ran concurrently with 02-03 (analyze-resume / analyze-career). The coverage guard
was written to enumerate all six functions including those two, and was transiently RED on
`analyze-career` (9 sites / 8 blocks) while 02-03 was mid-flight. The assertion was NOT
weakened; 02-03 landed (`cf2e9381`) and the guard is green at HEAD. No file outside this
plan's declared list was modified.

## No Authentication Gates

None occurred. No migration or SQL was owed by this plan — `ai_call_telemetry` was already
applied and probed on preview (D02-02-A, resolved).

## Commits

| Commit | Type | Description |
| --- | --- | --- |
| `d67fb8b2` | feat | grade-linkedin (5 sites) + recruiting-lens (fan-out + retry) telemetry |
| `7d8e6fc9` | feat | Interview Prep analyse + evaluate telemetry |
| `82d99be1` | test | telemetry-coverage drift guard + `deno.json` test:ci registration |

## Follow-ups for Later Plans

- **02-05** reads these rows: `call_name` for Recruiting Lens equals the `CALL_CONFIGS` key
  verbatim, and `attempt > 1` rows must be excluded from (or reported separately in) the
  first-attempt peak.
- **02-06** owns the operator-executed production application of the migration; until then
  production calls warn `telemetry-insert-failed` and succeed normally.
- Interview Prep rows accumulate but are deliberately outside the matrix/recommendation
  table for this phase.

## Self-Check: PASSED

All 5 claimed files exist on disk and all 3 claimed commits exist in git. The three
`must_haves` artifacts verified by content: `grade-linkedin/index.ts` contains
`linkedin_grader` (4 occurrences, one per telemetry block + the shared `aiParams` block),
`recruiting-lens/index.ts` contains `recruiting_lens` in its telemetry block, and
`_shared/telemetry-coverage.test.ts` scans `invokeAnthropicText` across `*/index.ts`.
Both `must_haves` truths hold: all LinkedIn / Recruiting Lens / Interview Prep Anthropic
calls are labelled with feature + server-resolved tier + callName + attempt, and a call
site added without a telemetry context fails the offline suite (fail-before demonstrated,
delta reported by file name).
