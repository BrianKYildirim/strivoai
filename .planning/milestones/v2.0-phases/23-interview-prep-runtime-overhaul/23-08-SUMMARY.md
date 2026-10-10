---
phase: 23-interview-prep-runtime-overhaul
plan: 08
subsystem: testing
tags: [deno-test, promptfoo, cohen-kappa, eval-harness, merit-refund, streak, utc-boundary, prompt-injection]

requires:
  - phase: 23-interview-prep-runtime-overhaul
    provides: "Plan 03 fixture harness + analyze handler, Plan 04 evaluate handler, Plan 05 prompt registry + auto-prepend loader"
provides:
  - "SC-4 monthly elite_taste quota coverage (analyze.elite-taste-quota.test.ts)"
  - "SC-8 streak + daily-cap coverage (analyze.streak-and-cap.test.ts)"
  - "SC-10 honest-scoring regression harness gated by RUN_EVALS=1 (eval.suite.test.ts + weak-fit-30.jsonl)"
  - "MER-01 Merit refund taxonomy coverage (merit-refund.test.ts)"
  - "D-11 no-silent-drops edge-case coverage (no-silent-drops.test.ts)"
  - "Dimension 12 adversarial suite with 13 injection fixtures (promptfooconfig.yaml + fixtures.yaml)"
  - "STRIVO_GLOBAL_AI_PRINCIPLES prepend snapshot/idempotence guarantees (tier-prompts.interview-prepend.test.ts at _tests/)"
affects: [phase-24-linkedin-grader, phase-25-recruiting-lens, future-prompt-changes]

tech-stack:
  added: []
  patterns:
    - "Two-layer test shape: always-run contract assertions + gated live-DB integration (inherits Plan 03 pattern)"
    - "Cohen κ bucket-based honest-scoring regression harness"
    - "promptfoo http-provider adversarial suite with no-leak + no-escalation + valid-JSON defaults"

key-files:
  created:
    - "supabase/functions/interview-prep-analyze/__tests__/analyze.streak-and-cap.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/analyze.elite-taste-quota.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/eval.suite.test.ts"
    - "supabase/functions/interview-prep-analyze/__tests__/fixtures/eval/weak-fit-30.jsonl"
    - "supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml"
    - "supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/fixtures.yaml"
    - "supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/noop.txt"
    - "supabase/functions/_tests/tier-prompts.interview-prepend.test.ts"
  modified:
    - "package.json (added test:adversarial script)"

key-decisions:
  - "Two-layer test shape: every integration test file has always-run contract assertions (error-body shapes, UTC helpers, state-machine math) PLUS gated live-DB blocks. Preserves local-only test speed and CI safety while keeping the gated blocks available for staging validation."
  - "Frozen clock via `Date.now()` subclassing was NOT needed once the plan's streak assertions were decomposed into a state-machine table driven by deterministic ISO timestamps. Keeps the tests hermetic without monkey-patching globals."
  - "Eval harness κ helper is inline (20 lines) instead of an external dependency — avoids a new deno import for a one-use regression canary."
  - "promptfoo config uses javascript-type assertions for variant-escalation + valid-JSON checks because the out-of-the-box not-contains assertions cover only the system-prompt-leak class."
  - "Sub-threshold no-silent-drops test (#6) targets the actual `extractTokens` path (background_context min-4-char threshold) rather than role_title — the helper does NOT apply the min-length filter to role_title / company, which the plan's test wording did not reflect."

patterns-established:
  - "Always-run contract tests pin handler error-body shapes by string constant so a downstream API change is caught in unit tests."
  - "Eval JSONL fixtures balanced 10/10/10 across bucket thresholds — enables κ estimation without distribution skew."
  - "Gated live-DB tests wrap every invocation in try/finally cleanup (T-23-TEST-01) so a failed assertion never leaves seeded rows."

requirements-completed: [SC-4, SC-8, SC-10, MER-01]

duration: 25 min
completed: 2026-04-20
---

# Phase 23 Plan 08: Additional Test Coverage Summary

**Closes the VALIDATION matrix with 39 Deno tests + 13 promptfoo injection fixtures covering SC-4 monthly elite_taste quota, SC-8 streak + daily cap, SC-10 honest-scoring Cohen-κ regression, MER-01 Merit refund taxonomy, D-11 no-silent-drops edge cases, and Dimension 12 adversarial suite.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-20 (session)
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files created:** 9
- **Files modified:** 1 (package.json)

## Accomplishments

- SC-8 + SC-4 coverage via two test files with 15 always-run contract tests and 4 gated live-DB integration blocks
- MER-01 refund taxonomy pinned by 9 Deno tests exercising `isRefundableAnthropicError` + `MeritRefundable` across 5xx/408/529/AbortError/network/400/429
- D-11 no-silent-drops helper covered by 7 edge-case Deno tests (NFC/NFD, word boundary, stopwords, sub-threshold tokens)
- Tier-prompts prepend snapshot + idempotence + precedence guarantees pinned by 6 Deno tests supplementing Plan 05's existing 4
- SC-10 honest-scoring regression: 30-row labeled JSONL + 6 always-run contract tests (fixture shape, distribution, bucket math, κ helper) + 1 gated RUN_EVALS=1 κ-threshold assertion
- Dimension 12 adversarial: 13 prompt-injection fixtures (ignore_instructions, system_leak, variant_override, role_override, json_injection, unicode_confusable, rtl_override, html_injection, prompt_spoofing, delimiter_escape, markdown_injection, repeated_command, encoding_trick) with no-leak + no-escalation + valid-JSON default assertions

## Task Commits

1. **Task 1: Streak + daily-cap + elite_taste quota tests** — `e9c7369` (test)
2. **Task 2: Merit refund + no-silent-drops + tier-prompts snapshot** — `72e6ebb` (test)
3. **Task 3: Eval suite + promptfoo adversarial fixtures** — `299e041` (test)

_No plan-metadata commit: per orchestrator instructions, do not stage `.planning/`._

## Files Created/Modified

### Created

- `supabase/functions/interview-prep-analyze/__tests__/analyze.streak-and-cap.test.ts` — 8 tests (6 always-run, 2 gated)
- `supabase/functions/interview-prep-analyze/__tests__/analyze.elite-taste-quota.test.ts` — 7 tests (5 always-run, 2 gated)
- `supabase/functions/interview-prep-analyze/__tests__/merit-refund.test.ts` — 9 always-run tests
- `supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts` — 7 always-run tests
- `supabase/functions/interview-prep-analyze/__tests__/eval.suite.test.ts` — 6 always-run + 1 RUN_EVALS=1-gated
- `supabase/functions/interview-prep-analyze/__tests__/fixtures/eval/weak-fit-30.jsonl` — 30 labeled rows (10 low / 10 mid / 10 high on role_fit, experience, technical)
- `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/promptfooconfig.yaml` — Dimension 12 http-provider adversarial config
- `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/fixtures.yaml` — 13 injection fixtures
- `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/noop.txt` — placeholder satisfying the promptfoo `prompts` schema
- `supabase/functions/_tests/tier-prompts.interview-prepend.test.ts` — 6 tests (snapshot, precedence, idempotence, free-no-prepend)

### Modified

- `package.json` — added `"test:adversarial": "promptfoo eval --config ..."` script

## Decisions Made

See `key-decisions` in frontmatter. Primary decision: every integration-test file ships always-run contract-level assertions in parallel with gated live-DB blocks. This mirrors the Plan 03 pattern and keeps the suite useful locally without live credentials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] no-silent-drops test #6 re-scoped to match actual helper semantics**
- **Found during:** Task 2 (no-silent-drops.test.ts)
- **Issue:** The plan described test #6 as `role_title='SRE'` (3 chars) returning `[]` because SRE is "below the 4-char threshold". Empirical probe of `findDroppedOptionalFields` shows the 4-char threshold applies ONLY to `background_context` tokenization — `role_title` and `company` use `\b`-bounded regex match of the full normalized string. A 3-char role_title NOT present in the haystack is therefore flagged as dropped (`['role_title']`), not `[]`.
- **Fix:** Kept the plan's intent (exercise the min-length threshold) but moved the test to the branch that actually uses it: `background_context` with only sub-4-char tokens returns `[]`. Documented the scoping rule inline.
- **Files modified:** `supabase/functions/interview-prep-analyze/__tests__/no-silent-drops.test.ts`
- **Verification:** `deno test --allow-all --no-check interview-prep-analyze/__tests__/no-silent-drops.test.ts` — 7/7 pass.
- **Committed in:** `72e6ebb`

**2. [Rule 3 - Blocking] promptfoo `prompts` schema requires a file reference; added `noop.txt`**
- **Found during:** Task 3 (promptfooconfig.yaml)
- **Issue:** promptfoo config schema requires `prompts` as a non-empty list even when the `http` provider uses its own `body` templating instead of a text prompt.
- **Fix:** Added a single-file `noop.txt` containing `{{injection}}` and referenced it as `file://./noop.txt` so the schema is satisfied without affecting the http-provider body substitution.
- **Files modified:** added `supabase/functions/interview-prep-analyze/__tests__/fixtures/injection/noop.txt`
- **Verification:** Config file parses locally; full `promptfoo eval` run gated on staging URL.
- **Committed in:** `299e041`

**3. [Rule 2 - Missing Critical] Frozen clock stubbing dropped in favour of deterministic state-machine table**
- **Found during:** Task 1 (analyze.streak-and-cap.test.ts)
- **Issue:** The plan prescribed `globalThis.Date = class extends Date { ... }` stubbing for frozen-clock tests. Subclassing `Date` globally leaks across the full test process and can interact badly with other tests in the folder that read real `Date.now()` (e.g., quota-query seed timestamps).
- **Fix:** Replaced frozen-clock stubbing with an explicit state-machine case table keyed by ISO timestamps. The helper functions (`midnightUtcOfDate`, gap-hour math) are pure and exercise the same invariants the handler enforces, without monkey-patching `Date`. Live-DB integration blocks (gated) still exercise the real handler end-to-end.
- **Files modified:** `supabase/functions/interview-prep-analyze/__tests__/analyze.streak-and-cap.test.ts`
- **Verification:** 6 state-machine + contract tests + 2 gated live tests; all run clean in isolation and in the full suite.
- **Committed in:** `e9c7369`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocker, 1 missing-critical/test-isolation).
**Impact on plan:** All three adjustments preserve the plan's testing intent. Coverage matches the plan's `must_haves.truths` matrix 1:1.

## Issues Encountered

- `deno.lock` was modified in the working tree before this plan ran and was left unstaged per orchestrator instructions (nothing in this plan touches deno.lock).
- `.claude/settings.local.json` also modified; not part of this plan, left unstaged.

## Self-Check: PASSED

- [x] All 9 new files exist on disk
- [x] `git log --oneline --all --grep="23-08"` returns 3 commits (e9c7369, 72e6ebb, 299e041)
- [x] `deno test` for Task 1 files: 11 passed, 4 ignored
- [x] `deno test` for Task 2 files: 22 passed, 0 ignored
- [x] `deno test` for Task 3 files: 6 passed, 1 ignored
- [x] Combined Plan 08 deno test run: 39 passed, 0 failed, 5 ignored
- [x] `weak-fit-30.jsonl` line count = 30
- [x] `fixtures.yaml` entries ≥ 12 (actual: 13)
- [x] package.json has `test:adversarial` script

## Verification Results

```
cd supabase/functions
deno test --allow-all --no-check \
  interview-prep-analyze/__tests__/analyze.streak-and-cap.test.ts \
  interview-prep-analyze/__tests__/analyze.elite-taste-quota.test.ts \
  interview-prep-analyze/__tests__/merit-refund.test.ts \
  interview-prep-analyze/__tests__/no-silent-drops.test.ts \
  interview-prep-analyze/__tests__/eval.suite.test.ts \
  _tests/tier-prompts.interview-prepend.test.ts

ok | 39 passed | 0 failed | 5 ignored (1s)
```

## Success Criteria

- [x] SC-4 (monthly elite_taste quota): 5 always-run + 2 gated tests in `analyze.elite-taste-quota.test.ts`
- [x] SC-8 (streak + daily cap): 6 always-run + 2 gated tests in `analyze.streak-and-cap.test.ts`
- [x] SC-10 (honest-scoring regression): 6 always-run + 1 RUN_EVALS=1-gated in `eval.suite.test.ts`
- [x] MER-01 (Merit refund taxonomy): 9 always-run tests in `merit-refund.test.ts`
- [x] Dimension 12 (adversarial): 13 injection fixtures in `fixtures.yaml`
- [x] D-11 (no-silent-drops helper): 7 edge-case tests in `no-silent-drops.test.ts`
- [x] STRIVO_GLOBAL_AI_PRINCIPLES prepend: 6 supplemental tests in `_tests/tier-prompts.interview-prepend.test.ts`
- [x] No accidental Anthropic spend in CI (eval.suite.test.ts gated by `RUN_EVALS=1`)
- [x] All tests pass locally via `deno test --allow-all --no-check`

## Next Phase Readiness

- Plans 03-05 (implementation) + Plan 08 (test coverage) close the Wave 2/3 work for interview-prep-analyze.
- The promptfoo adversarial suite runs only against a staging URL (`ANALYZE_URL` + `TEST_JWT` env); wire those into CI to enable automated Dimension 12 regression.
- The κ eval runs only with `RUN_EVALS=1`; schedule a monthly or pre-prompt-change manual invocation.

---
*Phase: 23-interview-prep-runtime-overhaul*
*Completed: 2026-04-20*
