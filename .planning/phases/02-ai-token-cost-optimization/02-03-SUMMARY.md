---
phase: 02-ai-token-cost-optimization
plan: 03
subsystem: edge-functions
tags: [telemetry, tokens, resume-analysis, career-compass, labelling]
requires:
  - "_shared/anthropic.ts :: AnthropicInvokeParams.telemetry (02-02)"
  - "_shared/ai-telemetry.ts :: recordAiCall (02-02)"
  - "public.ai_call_telemetry applied to preview cimjltzovkahkqecpwgi (D02-02-A, resolved)"
provides:
  - "resume_analysis telemetry labels: criteria-1 / criteria-2 / summary / rewrites / free-single + 4 legacy-* fallbacks"
  - "career_compass telemetry labels: base / growth / elite-extras / base-prior-analyses"
  - "career_compass NON-ANALYSIS utility labels: docx-extract / ocr-extract / docx-extract-legacy / ocr-extract-legacy"
affects:
  - "supabase/functions/analyze-resume/index.ts"
  - "supabase/functions/analyze-career/index.ts"
tech-stack:
  added: []
  patterns:
    - "server-resolved tier is threaded, never read from the request body or profiles.subscription_tier"
    - "one reqId per analysis threaded into every helper so all AI calls of one run group"
    - "attempt=2 on any retry that can run at a different effective cap"
    - "legacy-* / *-extract call names so non-representative rows are excludable in the report SQL"
key-files:
  created: []
  modified:
    - supabase/functions/analyze-resume/index.ts
    - supabase/functions/analyze-career/index.ts
decisions:
  - "The 3 invokeWithRetry calls on the CONFIRMED-LIVE career legacy branch were labelled too — the plan's call-site list missed them, and without them the live Career Compass path would have produced ZERO rows"
  - "The Pro/Elite prior-analyses short-circuit shares a call site with the Free single call but runs at a different budget, so it gets its own call name base-prior-analyses instead of base"
  - "The two legacy-branch utility extraction calls are named docx-extract-legacy / ocr-extract-legacy (same work, different branch) so the 02-07 exclusion list is a simple name-prefix match"
  - "userId is recorded (T-02-10 accept) from the server-side auth context only"
metrics:
  duration: 21min
  tasks: 2
  files: 2
  completed: 2026-07-21
---

# Phase 02 Plan 03: Telemetry Threading — Resume Analysis + Career Compass Summary

Every live Anthropic call in the two business-critical multi-call features now carries a
`telemetry` context — feature, **server-resolved** tier, per-call name, a per-analysis
`reqId`, `userId`, and an `attempt` number — so the 02-07 report can size each
`CALL_CONFIGS` cell individually instead of guessing from an analysis-level total.

## What Was Built

### Task 1 — `analyze-resume` (`8952435b`)

All **7** `invokeAnthropicText` call sites labelled `feature: 'resume_analysis'`:

| Call site | callName | attempt | tier source |
| --- | --- | --- | --- |
| `executeParallelCalls.makeCall` | `callType` (`criteria-1`/`criteria-2`/`summary`/`rewrites`) | 1 | `params.tier` |
| same, validation-aware retry | same | **2** | `params.tier` |
| `executeFreeAnalysis` primary | `free-single` | 1 | `'free'` |
| `executeFreeAnalysis` quality-floor retry | `free-single` | **2** | `'free'` |
| `assembleResumeResult` all-failed fallback | `legacy-fallback-assemble` | 1 | `resolvedTier` |
| streaming-lifecycle all-failed fallback | `legacy-fallback-stream-lifecycle` | 1 | `resolvedTier` |
| streaming-merit all-failed fallback | `legacy-fallback-stream-merit` | 1 | `resolvedTier` |
| non-streaming-merit all-failed fallback | `legacy-fallback-merit` | 1 | `resolvedTier` |

(8 rows, 7 call sites — the parallel `makeCall` is one site reached at two attempt values.)

`attempt` is load-bearing on the parallel retry: it runs at `Math.min(base*2, 12000)`, so
averaging it in with first attempts would inflate both peak and headroom (Pitfall 5).

**reqId threading.** `reqId` existed only in the serve handler (`:1161`). Rather than mint
new ids inside the helpers (which would make the per-analysis grouping impossible), it was
threaded as an optional param through `executeParallelCalls`, `executeFreeAnalysis`,
`assembleResumeResult`, and as a required field on `StreamingLifecycleParams` (the streaming
lifecycle runs in its own function and had no id in scope). Every AI call of one analysis
therefore shares one `req_id`.

**Tier.** `params.tier` / `resolvedTier` — the same value already handed to `getMaxOutput`.
No path reads `profiles.subscription_tier` or a body field, so the `_shared/auth.ts:155`
admin→elite server-side elevation is recorded truthfully (T-02-08, Pitfall 3).

### Task 2 — `analyze-career` (`cf2e9381`)

**9** labelled call sites, `feature: 'career_compass'`:

*Analysis calls (included in per-cell stats):*

| Call site | callName | attempt |
| --- | --- | --- |
| `executeCareerParallelCalls.makeCall` | `callType` (`base`/`growth`/`elite-extras`) | 1 |
| same, failure retry | same | **2** |
| Free single-call prior-analyses path | `base` | 1 |
| Pro/Elite prior-analyses short-circuit (same site) | `base-prior-analyses` | 1 |
| legacy-branch `invokeWithRetry` base | `base` | 1 |
| legacy-branch `invokeWithRetry` growth | `growth` | 1 |
| legacy-branch `invokeWithRetry` elite-extras | `elite-extras` | 1 |

*Utility EXTRACTION calls (must be EXCLUDED from per-cell stats — Pitfall 6):*

| Call site | callName | maxTokens |
| --- | --- | --- |
| merit-branch DOCX raw-content AI extraction | `docx-extract` | 2000 |
| merit-branch OCR image fallback | `ocr-extract` | 4000 |
| legacy-branch DOCX raw-content AI extraction | `docx-extract-legacy` | 2000 |
| legacy-branch OCR image fallback | `ocr-extract-legacy` | 4000 |

**These four names are the exclusion list the 02-07 report SQL must apply.** They share the
`career_compass` feature but are text extraction, not analysis — leaving them unnamed would
have dragged the Career Compass mean down by pooling 2000/4000-token extractions with
5000+-token analysis calls.

## Deviations from Plan

### Auto-fixed

**1. [Rule 2 — Missing critical coverage] The plan's call-site list omitted the three
`invokeWithRetry` calls that ARE the live Career Compass path**

- **Found during:** Task 2.
- **Issue:** the plan enumerated only `invokeAnthropicText` sites. The legacy branch
  (`analyze-career:~2069/2103/2130`) — which 06-01/R-06-01 confirmed is the branch the LIVE
  internal-worker career path executes — calls `_shared/ai-retry.ts::invokeWithRetry`, not
  `invokeAnthropicText` directly. Labelling only the listed sites would have produced
  **zero telemetry rows from the live Career Compass path**, defeating the plan's own truth
  ("every Anthropic call made by Career Compass is labelled").
- **Fix:** labelled all three (`base`, `growth`, `elite-extras`). No change to
  `ai-retry.ts` was needed or made — `invokeWithRetry` does `invoke({ ...params, timeoutMs })`,
  so the telemetry field rides through untouched. This stayed strictly inside the plan's two
  declared files.
- **Known limitation, documented in-source:** `invokeWithRetry`'s own internal retries reuse
  `attempt: 1`. This is safe for cap-sizing because it retries only **failed** (`ok:false`)
  calls, and only successful rows carry usage numbers. Making the attempt counter dynamic
  would require editing `_shared/ai-retry.ts`, which is outside this plan's file list and is
  also being read by the parallel plan 02-04.

**2. [Rule 1 — Correctness] The Free/short-circuit call site needed two distinct names**

- **Found during:** Task 2. `analyze-career:1201` is reached by BOTH the Free single-call
  path (`FREE_SINGLE_CALL_MAX_TOKENS`) and the Pro/Elite prior-analyses short-circuit
  (`min(getMaxOutput('careerCompass', tier), 8000)`). The plan specified `base` for it.
- **Issue:** naming both `base` would pool two different budgets into one report cell, and
  the Pro/Elite rows would additionally pool with the parallel-path `base` cell — sizing one
  cap off three different caps.
- **Fix:** `callName: isProEliteShortCircuit ? 'base-prior-analyses' : 'base'`.

### Re-applied edit

The free-path telemetry edit was silently lost from disk once mid-task (the Edit tool
reported "the file had been modified on disk"); it was caught by a `grep -o` cross-check of
call sites vs. `telemetry: {` occurrences and re-applied. The final counts were verified.

### Out of scope (logged, not fixed)

`node scripts/check-edge-boot.mjs` still reports `could not spawn deno: spawn deno ENOENT`
for **every** function including untouched ones — the pre-existing Windows/npm-shim issue
already logged as **D02-02-B**. Equivalent coverage was obtained with `deno check` on both
modified functions (the same check the script wraps), which is clean.

## Verification

| Check | Result |
| --- | --- |
| `deno check analyze-resume/index.ts` | clean |
| `deno check analyze-career/index.ts` | clean |
| `deno test analyze-resume/ --no-check --allow-all` | **112 passed / 0 failed** |
| `deno test analyze-career/ --no-check --allow-all` (incl. `token-budget`, `truncation-refund`) | **142 passed / 0 failed** |
| `deno task test:ci` (full offline suite) | **1368 passed / 0 failed / 12 ignored** |
| `grep -c "invokeAnthropicText({"` vs `grep -c "telemetry: {"` — analyze-resume | 7 vs 7 |
| analyze-career call sites vs telemetry objects | 6 `invokeAnthropicText` + 3 `invokeWithRetry` = 9 vs 9 |
| No `maxTokens` VALUE changed | `git diff -U0 \| grep maxTokens` shows only signature/arg additions (`attempt = 1`, `, 2`) — every numeric literal byte-identical |
| No prompt / control-flow change | diff is param additions + comments only |

## No Authentication Gates

None occurred.

## Commits

| Commit | Type | Description |
| --- | --- | --- |
| `8952435b` | feat | analyze-resume — telemetry on all 7 call sites + reqId threading |
| `cf2e9381` | feat | analyze-career — telemetry on 9 call sites, utility extraction isolated |

## Follow-ups for Later Plans

- **02-07 report SQL** must exclude call names `docx-extract`, `ocr-extract`,
  `docx-extract-legacy`, `ocr-extract-legacy` from all Career Compass per-cell statistics,
  and should treat any `legacy-fallback-*` row in `resume_analysis` as a red flag (RESEARCH
  expects zero).
- **02-07** should read `base` and `base-prior-analyses` as separate Career Compass cells.
- **02-06** owns the operator-executed production application of
  `20260721000000_ai_call_telemetry.sql`. Until then, production calls will emit a
  `telemetry-insert-failed` warn once (memoised) and the analyses succeed unchanged.

## Self-Check: PASSED

Both modified artifacts exist and contain their required markers
(`resume_analysis` in `analyze-resume/index.ts`, `career_compass` +
`docx-extract`/`ocr-extract` in `analyze-career/index.ts`); both key_links verified by
pattern (`telemetry:\s*\{` present in both files, carrying the server-resolved tier);
both claimed commits (`8952435b`, `cf2e9381`) exist in git.
