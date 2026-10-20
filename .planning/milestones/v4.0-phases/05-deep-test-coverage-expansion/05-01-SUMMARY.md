---
phase: 05-deep-test-coverage-expansion
plan: 01
subsystem: testing
tags: [deno, deno-test, test:ci, allowlist, regression-baseline, merit-gateway, usage-tracking, grade-linkedin, recruiting-lens, analyze-career, characterization-test]

# Dependency graph
requires:
  - phase: 01-testing-strategy-regression-baseline
    provides: "verify:baseline gate (vitest+deno-offline+Playwright), deno.json test:ci allowlist, v4.0-baseline tag, TESTING-STRATEGY.md, tier-config reconciliation pattern"
  - phase: 04-dead-code-refactor-cleanup
    provides: "post-cleanup source surface (the drift the off-gate tests assert against)"
provides:
  - "Grown deno test:ci offline allowlist: 35 -> 64 files, 284 -> 566 passed | 0 failed"
  - "24 previously-green off-gate deno tests harvested onto the gate"
  - "5 drifted-RED off-gate files reconciled (none retired) and registered"
  - "05-SUSPECTED-BEHAVIOR.md (D-08 pin-and-log register) standing up for later plans"
  - "TESTING-STRATEGY.md drifted-test reconciliation record + register location"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, dependency-hygiene, database-cleanup, performance-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Harvest-then-register: run each off-gate candidate in isolation (DENO_TEST_SUPABASE_REMOTE=0 deno test --allow-all --no-check <file>) BEFORE appending to test:ci"
    - "Drift reconciliation = assert CURRENT behavior, product source byte-identical (Phase-1 tier-config style)"
    - "Service-client mock seam = patch the live singleton's mutable .rpc method (NOT the immutable exported getServiceClient binding)"
    - "D-08 pin-and-log register: characterize current behavior + log; escalate only on business-critical/security drift"

key-files:
  created:
    - ".planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md"
  modified:
    - "supabase/functions/deno.json"
    - "supabase/functions/grade-linkedin/phase22-contract.test.ts"
    - "supabase/functions/recruiting-lens/phase22-contract.test.ts"
    - "supabase/functions/analyze-career/phase22-contract.test.ts"
    - "supabase/functions/grade-linkedin/entitlement.test.ts"
    - "supabase/functions/_shared/merit-gateway.spend-ordering.test.ts"
    - "TESTING-STRATEGY.md"

key-decisions:
  - "Skipped _shared/tier-validation.test.ts from the harvest: it is a cost-gated live-Anthropic harness (RUN_TIER_VALIDATION=1), 4 tests all ignored offline — adding it registers 0 effective cases and risks real Anthropic calls."
  - "All 5 drifted files RECONCILED, none retired — every drift was a stale assertion / immutable-binding mechanism issue, not a removed contract; git diff v4.0-baseline of each underlying source is empty."
  - "No D-08 escalation raised: the record_ai_usage RPC + merit gateway are present and unchanged vs baseline (T-05-02 control verification clean); 2 minor observations pinned-and-logged only."

patterns-established:
  - "Harvest-then-register loop with mandatory per-file isolation pass before allowlist append (D-03a)"
  - "Source-drift reconciliation that pins the CURRENT helper-call form (recordUsageWithAnalysis seam) rather than the stale inline-RPC form"
  - "Singleton .rpc-method patch as the canonical offline service-client mock seam"

requirements-completed: [TEST-03, TEST-05]

# Metrics
duration: 18min
completed: 2026-06-19
---

# Phase 05 Plan 01: Off-Gate Test Harvest & Drift Reconciliation Summary

**Grew the offline deno gate from 284 to 566 passed (0 failed) by harvesting 24 confirmed-green off-gate tests and reconciling the 5 drifted-RED files to assert current behavior, with zero product-source change and a new D-08 suspected-behavior register.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-19T10:26Z
- **Completed:** 2026-06-19T10:41Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- **Harvest (Task 1):** registered 24 isolation-verified green off-gate deno tests onto `test:ci` (+254 cases: 284 -> 538).
- **Reconcile (Task 2):** fixed all 5 drifted-RED off-gate files the Phase-1 way (assert current behavior, source byte-identical) and registered them (+28 cases: 538 -> 566).
- **D-08 register:** created `05-SUSPECTED-BEHAVIOR.md` with the locked schema; logged 2 minor pinned observations, 0 escalations.
- **Docs:** recorded the drifted-test reconciliations + register location in `TESTING-STRATEGY.md`.
- `verify:baseline` green throughout (deno 566/0, vitest passed, Playwright 5 passed + 1 quarantine-skip).

## Task Commits

Each task was committed atomically:

1. **Task 1: Harvest 24 confirmed-green off-gate tests into test:ci** - `1d6495b` (test)
2. **Task 2: Reconcile 5 drifted-RED files + stand up D-08 register** - `8d38780` (test)

**Plan metadata:** see final docs commit (SUMMARY + STATE + ROADMAP).

## Files Created/Modified
- `supabase/functions/deno.json` - test:ci allowlist grown by 29 files (24 harvested + 5 reconciled); 35 -> 64 files.
- `.planning/phases/05-deep-test-coverage-expansion/05-SUSPECTED-BEHAVIOR.md` - NEW D-08 pin-and-log register (2 rows logged).
- `supabase/functions/grade-linkedin/phase22-contract.test.ts` - reconciled to the recordUsageWithAnalysis helper-call form (5/5 green).
- `supabase/functions/recruiting-lens/phase22-contract.test.ts` - reconciled (2/2 green).
- `supabase/functions/analyze-career/phase22-contract.test.ts` - reconciled SC-6 trio; pinned the single canonical usage call site (8/8 green).
- `supabase/functions/grade-linkedin/entitlement.test.ts` - reconciled the paid-branch assertion to the LIG-11 split checkEntitlement gate + post-success record (9/9 green).
- `supabase/functions/_shared/merit-gateway.spend-ordering.test.ts` - reconciled the injection seam to patch the live singleton .rpc method (4/4 green).
- `TESTING-STRATEGY.md` - added the Phase-05 drifted-test reconciliation record + the D-08 register location.

### Harvested files (24, all isolation-verified green)
**Shared utils (14):** result-merger, recruiting-lens-merger, document-extraction, prompt-sanitizer, rate-limiter, auth, cors, document-persistence, document-quality, price-resolver, mistral-ocr-client, textract-client, resume-prompts-builders, plus analyze-resume/prompts.
**grade-linkedin (5):** handler-config, strip, validation, free-scan, prompts.
**Other (5):** ocr-pdf/index, create-payment-intent/index, lifecycle-archive-writer, process-resume-analysis-job/refund-on-failure, process-career-analysis-job/refund-on-failure.

### Skipped from harvest (with reason)
- `_shared/tier-validation.test.ts` — cost-gated live-Anthropic harness (`RUN_TIER_VALIDATION=1`); all 4 tests `ignored` offline (0 effective cases) and would risk real Anthropic spend if the env flag were ever set on the gate. Left off-gate intentionally.

## Decisions Made
- **Skip the live-AI tier-validation harness** rather than register a 0-case file (avoids a silent no-op + a latent cost footgun on the gate).
- **Reconcile all 5, retire none.** `git diff v4.0-baseline` evidence: the inline `rpc('record_ai_usage'`/`p_action_type` call form the phase22-contract tests asserted was **0 at both baseline AND HEAD** — these were stale-from-authoring (which is precisely why they were never on the offline gate), not Phase-4 removals. Usage recording flows through the shared `recordUsageWithAnalysis(...)` helper. No accounting loss → reconcile, not escalate.
- **No D-08 escalation.** T-05-02 control-verification (`git diff v4.0-baseline -- **/index.ts` empty; merit gateway + `record_ai_usage` intact) showed every drift was an assertion/mechanism mismatch, not a merit/usage-accounting regression.

## Deviations from Plan

None - plan executed exactly as written. The two tasks, their per-file isolation discipline, the reconcile-vs-retire decision procedure (`git diff v4.0-baseline`), the D-08 register schema, and the allowlist-append-on-reconcile rule were all followed as specified.

The one judgement call within the plan's stated bounds: the plan's second-batch candidate list included `_shared/tier-validation.test.ts` for "isolation re-confirm" — isolation showed it is a 0-case live-AI harness, so it was correctly excluded per the plan's own "Do NOT append any file flagged live-Supabase/live-AI" instruction.

## Issues Encountered
- **`analyze-career` "≥ 2 usage call sites" stale assertion:** the original SC-6 test claimed two `record_ai_usage` sites (short-circuit + full parse), but both baseline and HEAD have exactly **one** `recordUsageWithAnalysis` call site. Reconciled to pin the actual count of one and logged the convergence as SB-05-01 (minor) — the short-circuit and full-parse success paths appear to share the single post-success record call.
- **`merit-gateway.spend-ordering` immutable-binding TypeError:** the test reassigned the exported `getServiceClient` binding, which the current Deno runtime rejects (`Cannot assign to read only property`). Resolved by switching to the project-canonical seam (patch the live singleton's `.rpc` method), also stubbing `increment_rate_limit` to fail-open so the rate-limiter (which runs first inside `withMerits`) lets the deduct path execute.

## User Setup Required
None - no external service configuration required. This is a test-only, zero-functional-change plan.

## Next Phase Readiness
- The offline gate now covers the shared-util / grade-linkedin / worker-refund / usage-recording surfaces that Plans 05-02..05-07 (and Phases 6/8/9) will deepen and lean on.
- `05-SUSPECTED-BEHAVIOR.md` is ready as the pin-and-log home for surprises surfaced by the deepening plans.
- 2 minor observations (SB-05-01 career single usage call site; SB-05-02 LIG-11 free-scan bounded TOCTOU) are logged for a future `/gsd-debug` confirmation pass; neither blocks subsequent plans.
- No blockers.

## Self-Check: PASSED

- All 9 claimed files verified present on disk (SUMMARY, register, deno.json, 5 reconciled test files, TESTING-STRATEGY.md).
- Both task commits verified in git history: `1d6495b` (harvest), `8d38780` (reconcile).
- Final gate re-run: `deno task test:ci` -> 566 passed | 0 failed; `verify:baseline` green (vitest + deno + Playwright 5 passed + 1 quarantine-skip).
- Zero product-source change: `git diff v4.0-baseline -- supabase/functions/**/index.ts` empty.

---
*Phase: 05-deep-test-coverage-expansion*
*Completed: 2026-06-19*
