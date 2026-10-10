---
phase: 05-deep-test-coverage-expansion
reviewed: 2026-06-19T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - TESTING-STRATEGY.md
  - package.json
  - scripts/deploy.ps1
  - supabase/functions/deno.json
  - supabase/functions/_shared/anthropic.test.ts
  - supabase/functions/_shared/merit-gateway.spend-ordering.test.ts
  - supabase/functions/_shared/prompt-sanitizer.test.ts
  - supabase/functions/analyze-career/__tests__/fixtures/injection/fixtures.yaml
  - supabase/functions/analyze-career/__tests__/fixtures/injection/noop.txt
  - supabase/functions/analyze-career/__tests__/fixtures/injection/promptfooconfig.yaml
  - supabase/functions/analyze-career/failure-branches.test.ts
  - supabase/functions/analyze-career/phase22-contract.test.ts
  - supabase/functions/analyze-resume/__tests__/fixtures/injection/fixtures.yaml
  - supabase/functions/analyze-resume/__tests__/fixtures/injection/noop.txt
  - supabase/functions/analyze-resume/__tests__/fixtures/injection/promptfooconfig.yaml
  - supabase/functions/analyze-resume/failure-branches.test.ts
  - supabase/functions/analyze-skills-gap/handler-config.test.ts
  - supabase/functions/chat-agent/handler-config.test.ts
  - supabase/functions/compare-jobs/handler-config.test.ts
  - supabase/functions/get-analysis-job-status/job-contract.test.ts
  - supabase/functions/grade-linkedin/__tests__/fixtures/injection/fixtures.yaml
  - supabase/functions/grade-linkedin/__tests__/fixtures/injection/noop.txt
  - supabase/functions/grade-linkedin/__tests__/fixtures/injection/promptfooconfig.yaml
  - supabase/functions/grade-linkedin/entitlement.test.ts
  - supabase/functions/grade-linkedin/phase22-contract.test.ts
  - supabase/functions/interview-prep-analyze/__tests__/analyze.failure-branches.test.ts
  - supabase/functions/interview-prep-evaluate/handler-config.test.ts
  - supabase/functions/recruiting-lens/__tests__/fixtures/injection/fixtures.yaml
  - supabase/functions/recruiting-lens/__tests__/fixtures/injection/noop.txt
  - supabase/functions/recruiting-lens/__tests__/fixtures/injection/promptfooconfig.yaml
  - supabase/functions/recruiting-lens/handler-config.test.ts
  - supabase/functions/recruiting-lens/phase22-contract.test.ts
  - supabase/functions/submit-career-analysis-job/job-contract.test.ts
  - supabase/functions/submit-resume-analysis-job/job-contract.test.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: fixed
fix_applied: 2026-06-19
fix_scope: critical+warning
warnings_resolved: 6
info_deferred: 5
---

> **Resolution (`/gsd:code-review 05 --fix`, 2026-06-19):** All 6 warnings (WR-01..WR-06) fixed and committed atomically on `staging` — `619b9502` (WR-01), `77d371ce` (WR-02), `3c09e6bd` (WR-03), `fa78d30e` (WR-04), `197689d5` (WR-05), `e307f4e6` (WR-06). Plus `cf654246` had already fixed the deploy.ps1 non-ASCII parse break the operator hit. Zero production-source change; `scripts/deploy.ps1` re-verified pure ASCII + parses; deno `test:ci` green at 699 passed / 0 failed / 11 ignored. The 5 Info items (IN-01..IN-05) are left as advisory by design — IN-03 (SB-05-04 auth→500) and IN-04 (SB-05-05 sanitizer recall gap) are behavior-change fixes out of the zero-functional-change scope; IN-01/IN-02/IN-05 are optional refactors.

# Phase 05: Code Review Report

**Reviewed:** 2026-06-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

This is a test-coverage-expansion phase under a strict zero-functional-change constraint. I reviewed all 35 listed files plus cross-referenced the production source they characterize (`grade-linkedin/index.ts`, `analyze-resume/index.ts`, `compare-jobs/index.ts`, `analyze-skills-gap/index.ts`, `recruiting-lens/index.ts`, `interview-prep-analyze/index.ts`, `get-analysis-job-status/index.ts`, `merit-gateway.ts`, `grade-linkedin/entitlement.ts`) and the `deno.json` allowlist.

**Headline assessment of the load-bearing items requested:**

- **`scripts/deploy.ps1` deploy gate — CORRECT.** `verify:baseline` runs as a hard precondition strictly between `Set-Location $repoRoot` and `supabase link`. `npm` is a native command, so it does not trip `$ErrorActionPreference = "Stop"`; the explicit `$LASTEXITCODE -ne 0 → Write-Error + exit 1` is the right mechanism and genuinely aborts before any link/deploy. `-SkipVerify` is `[switch]` (default OFF), scoped only to wrap the gate block, and the two shims (`deploy-staging.ps1` / `deploy-production.ps1`) forward without `-SkipVerify`, so they inherit the gate. One residual gap is noted (WR-01).
- **Pattern A source-grep assertions — VERIFIED, not false-passing.** I spot-checked the substring claims against current source: `grade-linkedin/index.ts` has exactly 3 `recordUsageWithAnalysis(... 'linkedin_grading', ...)` sites (the `>= 2` assertions hold; `freeScan ? 0 : 1` at L822 confirmed); `analyze-resume/index.ts` has `requireInternalOrUserAuth`, `resumeText.length < 50`, `throw new MeritRefundable`, `JSON parse failed`; `compare-jobs` uses `rawBody.userId` (not `body.userId`), `analyze-skills-gap` has the legacy `MERIT_SYSTEM_ENABLED && userContext` gate and `checkAndRecordUsage(userId, 'skills_gap_analysis')`; `recruiting-lens` has the asserted `getTimeout(tier as Tier)`, `getModel(resolvedTier as Tier, 'recruiting')`, free-tier 403 gate. These are real characterizations, not always-true assertions.
- **Pattern D executed assertions — VERIFIED.** `isRefundableAnthropicError` returns the exact taxonomy the failure-branches tests assert (5xx/408 true; 400/401/403/422 false; parse-failure-without-keyword false; AbortError keyword true). The AI_FORCE_FAILURE two-key compound gate behaves as the `anthropic.test.ts` tests assert.
- **Fixture secret hygiene — CLEAN.** No `pk_test_`, `sk_`, service-role JWT, password literal, or real URL in any `fixtures.yaml` / `promptfooconfig.yaml` / `noop.txt`. All secrets are `${ANALYZE_URL}` / `${TEST_JWT}` placeholders injected at run time. The base64 string in the `encoding_trick` fixture decodes to a benign synthetic injection directive, not a secret.
- **promptfoo off-gate invariant — HOLDS.** Neither `verify:baseline`, `test:edge`, `test:e2e`, nor the deno `test:ci` allowlist references `promptfoo` / `test:adversarial*`. The five `test:adversarial*` scripts in `package.json` are the only references.

No BLOCKER-class defects (no security vuln, no data-loss path, no always-true/swallowed-error false-pass). The findings below are robustness, brittleness, and hygiene issues in the test code itself, plus one deploy-gate observation.

## Warnings

### WR-01: deploy.ps1 gate gives no protection against a stale/never-installed local toolchain — silent fail-open class

**File:** `scripts/deploy.ps1:90-100`
**Issue:** The gate proves zero functional change only if `npm run verify:baseline` actually runs the three layers. `verify:baseline` chains `test && test:edge && test:e2e`. If Deno or the Playwright browser is missing on the operator host (the doc itself flags "Requires Node + Deno + Playwright present locally"), the corresponding layer exits non-zero and the gate correctly aborts — that case is fine. The real gap: there is no positive assertion that all three layers were attempted. If a future edit to the `verify:baseline` npm script (or a local npm alias) silently shortens the chain, `deploy.ps1` cannot detect it — it only inspects `$LASTEXITCODE` of whatever `verify:baseline` happens to be. The gate trusts the script name, not its composition.
**Fix:** This is acceptable for v4.0 but worth hardening: have `deploy.ps1` echo and assert the resolved `verify:baseline` script body (or run the three layers explicitly) so a silently-weakened chain is caught at deploy time. At minimum, add a comment pinning the expected three-layer composition next to the gate so a reviewer of a future edit notices drift.

### WR-02: Phase-13 anthropic.test.ts cases leak env on assertion failure (no try/finally) — cross-test contamination risk on the shared gate

**File:** `supabase/functions/_shared/anthropic.test.ts:8-46`
**Issue:** The three pre-existing Phase-13 tests mutate process-global env (`AI_TEST_MODE`, `AI_FORCE_FAILURE`) and clean up with bare `Deno.env.delete(...)` calls placed *after* the assertions, with no `try/finally`. If any `assertEquals` throws, the trailing `delete` lines never run, leaking `AI_TEST_MODE=true` / `AI_FORCE_FAILURE=true` into every subsequent test in the same `deno task test:ci` process. Because `test:ci` runs the whole allowlist in one process, a leaked `AI_TEST_MODE` could silently flip sibling files onto the mock path and mask a regression. The newer TEST-05 cases (L62+) in the same file do this correctly with save-and-restore `try/finally`; the Phase-13 trio does not. Also note these tests `delete` rather than restore the pre-test value, so they discard any value an outer harness had set.
**Fix:** Wrap each Phase-13 test body in `try { ... } finally { ... }` and save/restore the prior values, matching the TEST-05 pattern already present at lines 62-138:
```ts
const origTestMode = Deno.env.get("AI_TEST_MODE");
const origForce = Deno.env.get("AI_FORCE_FAILURE");
try { /* ... */ } finally {
  if (origTestMode !== undefined) Deno.env.set("AI_TEST_MODE", origTestMode); else Deno.env.delete("AI_TEST_MODE");
  if (origForce !== undefined) Deno.env.set("AI_FORCE_FAILURE", origForce); else Deno.env.delete("AI_FORCE_FAILURE");
}
```

### WR-03: merit-gateway.spend-ordering.test.ts sets module-scope env that is never restored — process-global leak

**File:** `supabase/functions/_shared/merit-gateway.spend-ordering.test.ts:31-33`
**Issue:** `APP_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are set at module scope (top of file) and never reset. In the single-process `test:ci` run these values persist for every file imported after this one. The reconciliation comment explains the `.rpc`-patch seam choice, but the env mutation is undocumented and unbounded. If a sibling file relies on the *absence* of `SUPABASE_URL` (e.g. to exercise a fail-closed branch), this file silently poisons it depending on allowlist ordering. The `.rpc` method is restored in `finally` (good), but the env is not.
**Fix:** Either (a) document that these are intentionally process-wide placeholders required before the singleton constructs (consistent with the failure-branches files), or (b) snapshot and restore them. Given multiple files set the same trio, the safest path is a shared test-env helper so the values are uniform and ordering-independent rather than each file racing to set them.

### WR-04: interview-prep-analyze case 4 depends on a real network failure to a placeholder host — non-deterministic / slow on the gate

**File:** `supabase/functions/interview-prep-analyze/__tests__/analyze.failure-branches.test.ts:129-148`
**Issue:** Case 4 ("AI_FORCE_FAILURE stays inert offline") asserts 500 because the synthetic Bearer "cannot pass requireAuth's live `supabase.auth.getUser` offline." Reaching the 500 requires `supabase.auth.getUser` to fail against `https://placeholder.supabase.co`. That is a real outbound DNS/TLS attempt (the test runs `--allow-all`). On a sandboxed/offline CI runner it fails fast; on a network-connected runner it may hang until a socket/HTTP timeout, and a hostile DNS wildcard could in theory resolve placeholder.supabase.co and change the failure mode. The assertion is robust to *which* error fires (any throw → 500 via the catch), but the latency and external dependency are undesirable on a per-PR gate. Case 3 (L112-124) has the same shape.
**Fix:** Prefer a stubbed/injected Supabase client or a guaranteed-unroutable host (e.g. `http://127.0.0.1:0` or an RFC-5737 `192.0.2.0/24` address) so the auth failure is local and instantaneous, eliminating the live network dependency while preserving the SB-05-04 characterization.

### WR-05: Brittle ordering/segment regexes silently degrade to whole-source matches on refactor

**File:** `supabase/functions/get-analysis-job-status/job-contract.test.ts:83,92`; `supabase/functions/submit-resume-analysis-job/job-contract.test.ts:49,96`; `supabase/functions/submit-career-analysis-job/job-contract.test.ts:43,91`; `supabase/functions/interview-prep-evaluate/handler-config.test.ts:71-82`
**Issue:** Several worker-contract tests slice the source with a regex and fall back to the *entire source* when the regex misses: e.g. `src.match(/if \(!job\)[\s\S]*?status:\s*404/)?.[0] ?? ""` and `src.match(/catch \(error\)[\s\S]*$/)?.[0] ?? src`. The `?? src` fallback means a refactor that moves or renames the targeted block makes the regex miss, the assertion then runs against the whole file, and `.includes("401")`/`.includes("500")` still passes because those strings appear *somewhere* — so the test silently stops verifying the intended association (401/500 in the catch) while staying green. This is a false-pass-on-refactor hazard, exactly the regression the gate is supposed to catch. The `submit-*` 403-guard regex (`?? ""`) is safer because the empty-string fallback forces a fail, but the `?? src` fallbacks are not.
**Fix:** Replace `?? src` with `?? ""` so a regex miss fails the test instead of widening the search to the whole file. Then the proximity assertion (401 AND 500 inside the catch) actually means what it claims.

### WR-06: compare-jobs negative auth assertion is too narrow to prove "no body-sourced identity"

**File:** `supabase/functions/compare-jobs/handler-config.test.ts:44-47`
**Issue:** The test asserts identity is `userContext.userId` and that `body.userId` / `body['userId']` are absent — but the actual source uses `const userId = rawBody.userId` at `index.ts:150` and feeds it to the legacy `checkAndRecordUsage(userId, 'job_comparison')`. The test's own comment acknowledges this is "NOT an auth bypass" because `rawBody.userId` only drives the legacy usage counter. However, the negative assertions chosen (`body.userId === false`) pass *trivially* — the substring `body.userId` was never going to appear because the variable is named `rawBody.userId`. So the negative guard does not actually defend the property it claims ("identity is never sourced from the body"); a future change that wired `rawBody.userId` into the rate-limiter or `withMerits` owner would NOT be caught by these assertions. This is a weak/illusory security assertion.
**Fix:** Add a positive scoping assertion that the legacy `rawBody.userId` value is used *only* as the `checkAndRecordUsage` argument and never as the `checkRateLimit` first arg or the `withMerits` `userId` field — e.g. assert `checkRateLimit(userContext.userId` and `userId: userContext.userId` are present (already done) AND assert the absence of `checkRateLimit(userId` / `userId: userId` / `userId: rawBody.userId`. Otherwise the "no body identity" claim is unverified.

## Info

### IN-01: anthropic.test.ts Phase-13 cases use control-flow-via-thrown-Error for assertions

**File:** `supabase/functions/_shared/anthropic.test.ts:14-22,42-44`
**Issue:** Cases 1 and 3 implement their assertion as `if (badShape) throw new Error("compound gate leaked: ...")` inside a `try/catch` that then re-throws only if the message includes a sentinel. This is harder to read than a direct `assert`/`assertEquals` and risks masking a genuine thrown error if the sentinel string is ever edited. The intent (a non-assertion error from the real fetch path is acceptable) is legitimate, but the hand-rolled sentinel is fragile.
**Fix:** Use an explicit boolean check with `assertEquals(isForcedFailureShape, false, "...")` (as the TEST-05 case at L123 already does) instead of throw-and-catch-by-message.

### IN-02: `--no-check` on the deno gate means test-file type errors never block

**File:** `supabase/functions/deno.json:4-5`
**Issue:** Both `test` and `test:ci` run with `--no-check`, so TypeScript errors in the test files (including misuse of the `as any` casts that are pervasive in `anthropic.test.ts` and the failure-branches files) never fail the suite. This is consistent with project convention and keeps the gate fast, but it means a test could reference a renamed export or a wrong field shape and still "pass" as long as runtime values line up. Pattern A source-reads are unaffected (they read text), but the Pattern D executed tests lose compile-time protection.
**Fix:** Optional — add a separate non-blocking `deno check` lane for the test files, or drop `--no-check` on the executed-seam files specifically. Not required for v4.0.

### IN-03: interview-prep-analyze auth-failure→500 (SB-05-04) is a latent bug, correctly pinned

**File:** `supabase/functions/interview-prep-analyze/index.ts:710-718` (characterized by `__tests__/analyze.failure-branches.test.ts:112-124`)
**Issue:** The terminal catch returns 500 `internal_error` for *any* thrown error, including the `Response(401)` thrown by `requireAuth`, so an unauthenticated request gets a 500 instead of a 401. The test correctly pins this as current behavior (SB-05-04) rather than asserting it as desired, which is the right call for a zero-functional-change phase. Flagging it here so it is not lost: it over-reports (500 instead of 401) and never under-reports, and the function is gated off prod — but it is a real defect for a future security/`gsd-debug` pass.
**Fix:** Future phase — re-throw `if (err instanceof Response) return err;` at the top of the catch (the sibling interview-prep-evaluate handler already does this), so auth rejections surface as 401. Do NOT change in this phase (behavior change).

### IN-04: prompt-sanitizer SB-05-05 under-stripping gap ("ignore the above instruction") pinned but unprotected by the on-gate layer at runtime

**File:** `supabase/functions/_shared/prompt-sanitizer.test.ts:304-311`
**Issue:** The characterization test pins that `ignore the above instruction` (interposed article "the") is NOT stripped at baseline, while the sibling `ignore_system_prompt` pattern does allow `(the\s+)?`. This is a real recall gap in the deterministic sanitizer. The test correctly documents it as current behavior. The central `sanitizeMessages` seam and the off-gate promptfoo layer are the compensating controls. Flagged so the gap is visible — the test itself is sound (it asserts the phrase survives, which is the true current behavior).
**Fix:** Future security pass — broaden the `ignore_instructions` pattern to `(the\s+)?` parity with `ignore_system_prompt`. Behavior change; out of scope here.

### IN-05: Duplicated in-memory merit-ledger mock across failure-branches files (drift risk)

**File:** `supabase/functions/analyze-resume/failure-branches.test.ts:35-142`; `supabase/functions/analyze-career/failure-branches.test.ts:87-194`
**Issue:** `MockLedger` + `mockCheckAndDeductMerits` + `mockRefundMerits` are copy-pasted near-verbatim across both failure-branches files (and reference `test-07.test.ts` as the original). The two copies must stay in sync with the real SQL `check_and_deduct_merits` / `refund_merits` contracts; divergence in one copy would make a test characterize a fiction. This is a maintainability/duplication smell, not a current bug — both copies presently match.
**Fix:** Optional — extract the ledger mock to a shared `_shared/__tests__/merit-ledger-mock.ts` so the spend-ordering contract has one source of truth. Low priority given the explicit "kept in sync with the real SQL body" discipline already noted in the files.

---

_Reviewed: 2026-06-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
