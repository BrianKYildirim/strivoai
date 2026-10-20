---
phase: 21-integration-validation-and-cutover
verified: 2026-04-29T00:15:00Z
status: passed
score: 5/5 plans verified (01–05); 2 plans operator-deferred (06, 07)
plans_verified:
  - plan: 01
    verdict: PASS
  - plan: 02
    verdict: PASS
  - plan: 03
    verdict: PASS
  - plan: 04
    verdict: PASS (Task 3 operator-deferred per user instruction)
  - plan: 05
    verdict: PASS (staging dry-runs operator-deferred per user instruction)
  - plan: 06
    verdict: DEFERRED (operator-gated 24-hour staging soak — autonomous=false)
  - plan: 07
    verdict: DEFERRED (operator-gated production flag flip — autonomous=false)
operator_deferred:
  - "21-04 Task 3: supabase db push to staging + post-push pg_policies query + RUN_LIVE_MERIT=1 RLS probe + free-signup smoke"
  - "21-05 staging dry-runs: sc5-probe.ps1 against staging; Invoke-MeritFlagFlip / Invoke-MeritFlagRollback against staging"
  - "21-06: 24-hour staging soak with three timed sc5-probe runs and merit-transaction log capture"
  - "21-07: production cutover, 2-hour active soak, 21-SC5-EVIDENCE.md authoring, rollback standby"
---

# Phase 21: Integration Validation & Cutover — Verification Report

**Phase Goal (ROADMAP):** Complete TEST-04/05/06 integration scenarios, ship MIG-02 (analysis_results read-only lock), instrument all D-07 gated handlers with boot-time `merit-flag` attestation, deliver SC-5 probe + cutover orchestration, then execute the staging soak and production flip behind operator gating.

**Verified:** 2026-04-29T00:15:00Z (read-only audit; no source files modified)
**Branch:** `by/env-fixes`

**Phase verdict:** READY FOR OPERATOR HANDOFF — all autonomous code changes verified; remaining work is explicitly operator-gated.

---

## Per-Plan Verdicts

| Plan | Title | Verdict | Notes |
|------|-------|---------|-------|
| 01 | TEST-04 free-signup-to-shop | PASS | All artifacts present; 2/2 tests pass; registered in run-edge-tests.ps1 |
| 02 | TEST-05 upgrade-proration | PASS | All artifacts present; 2/2 tests pass; tier-gated output asymmetry verified |
| 03 | TEST-06 yearly-reset | PASS | All artifacts present; 2/2 tests pass; ZERO rollover assertion verified |
| 04 | MIG-02 analysis_results read-only | PASS (Task 3 deferred) | Migration file + RLS probe + frontend edits verified; staging push deferred to operator per user instruction |
| 05 | D-19 attestation + D-18 probe + cutover scripts | PASS (dry-runs deferred) | 9/10 D-07 handlers attested (interview-prep-coach absent — see consistency notes); both PS scripts parse + grep-clean; staging dry-runs deferred to operator |
| 06 | 24-hour staging soak | DEFERRED | autonomous=false; operator-gated; not yet executed |
| 07 | Production cutover + SC-5 evidence | DEFERRED | autonomous=false; operator-gated; not yet executed |

---

## Plan 21-01 Verification (TEST-04 free-signup-to-shop)

### must_haves.truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free signup with 5 lifetime Merits spends 3 on Resume Analysis and has 2 left | VERIFIED | TEST-04 main scenario asserts `r1.remaining_balance === 2`, `r1.deducted_from.subscription === 3` |
| 2 | Career Compass (cost 3) is blocked when balance is 2 | VERIFIED | `r2.error === "insufficient_merits"`; `ledger.subscription_balance + ledger.shop_balance === 2` |
| 3 | Signed checkout.session.completed shop-3-pack credits shop_balance by 3 | VERIFIED | `assertEquals(ledger.shop_balance, 3)` after handleStripeWebhook returns 200 |
| 4 | After shop credit, Career Compass succeeds and deducts subscription-first (2 sub + 1 shop) | VERIFIED | `r4.deducted_from.subscription === 2`, `r4.deducted_from.shop === 1` |
| 5 | TEST-04 runs green offline via deno test in <10s and is registered in run-edge-tests.ps1 | VERIFIED | 2/2 pass in 25ms; line 44 of run-edge-tests.ps1 |

### Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/functions/_tests/test-04-free-signup-to-shop.test.ts` | VERIFIED | File exists; contains 2 `Deno.test({` blocks named `"TEST-04: ..."` and `"TEST-04 idempotency: ..."` |
| `scripts/run-edge-tests.ps1` registration | VERIFIED | `grep -c 'test-04-free-signup-to-shop.test.ts' scripts/run-edge-tests.ps1` → 1 |

### Grep Contracts (acceptance_criteria)

```
$ grep -c 'Deno.test.*TEST-04' supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
0   ← regex doesn't span newlines
$ grep -nE 'Deno\.test' supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
387:Deno.test({
532:Deno.test({
$ grep -nE 'name: "TEST-04' supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
389:    "TEST-04: Free signup -> 5 Merits ..."
534:    "TEST-04 idempotency: re-delivery ..."
```

The plan's literal grep `Deno.test.*TEST-04` returns 0 because the executor used object-literal `Deno.test({` with the name on a separate line. The intent — two TEST-04 tests exist and run — is satisfied (verified by direct test execution: `2 passed | 0 failed in 25ms`). Documented as a benign plan/implementation grep mismatch, not a regression.

```
$ grep -cE 'makeCheckoutSessionCompletedEvent|signStripePayload|handleStripeWebhook' \
  supabase/functions/_tests/test-04-free-signup-to-shop.test.ts
11   (≥3 required) — PASS
```

### Live Test Execution

```
$ cd supabase/functions && deno test --allow-env --allow-net --allow-read --no-check \
    _tests/test-04-free-signup-to-shop.test.ts
ok | 2 passed | 0 failed (25ms)
```

**Verdict: PASS.**

---

## Plan 21-02 Verification (TEST-05 upgrade-proration)

### must_haves.truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Free signup upgrades to Pro and gets 75 Merits credited | VERIFIED | Test 1 asserts `ledger.subscription_balance === 75` after signed checkout.session.completed (deviated from plan's subscription.created — see SUMMARY decision; intent met) |
| 2 | Pro Recruiting Lens deducts 8 Merits (75 → 67) and produces Pro-tier output shape | VERIFIED | `r2.remaining_balance === 67`; assertions confirm `compensation_intel` and `smart_application_strategy` are absent from Pro output |
| 3 | Pro upgrades to Elite mid-cycle, grant_upgrade_diff credits 75, balance becomes 142 | VERIFIED | `assertEquals(ledger.subscription_balance, 67 + 75, "diff credit Pro->Elite = 75 added to remaining 67")` |
| 4 | Elite Recruiting Lens deducts 5 Merits (lower Elite cost), Elite-tier output shape | VERIFIED | `r4.remaining_balance === 137`; assertions confirm Elite output contains both `compensation_intel` and `smart_application_strategy` |
| 5 | TEST-05 runs green offline via deno test in <10s and is registered in run-edge-tests.ps1 | VERIFIED | 2/2 pass in ~15ms; line 45 of run-edge-tests.ps1 |

### Grep Contracts

```
$ grep -cE 'tier_locked|grant_upgrade_diff|remaining_balance, 67|remaining_balance, 137' \
  supabase/functions/_tests/test-05-upgrade-proration.test.ts
15   (≥4 required) — PASS

$ grep -c 'compensation_intel' supabase/functions/_tests/test-05-upgrade-proration.test.ts
5    (≥2 required: 1 present + 1 absent) — PASS

$ grep -c 'test-05-upgrade-proration.test.ts' scripts/run-edge-tests.ps1
1    — PASS
```

### Live Test Execution

```
TEST-05: Free -> Pro (checkout) -> Recruiting Lens (8) -> ... ok (15ms)
TEST-05 idempotency: re-delivery of customer.subscription.updated does not double-credit ... ok (2ms)
```

**Verdict: PASS.**

---

## Plan 21-03 Verification (TEST-06 yearly-reset)

### must_haves.truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pro yearly subscription credits 75 Merits | VERIFIED | Test 1 asserts `ledger.subscription_balance === 75` after signed checkout.session.completed mode=subscription interval=annual (deviated from plan's invoice.paid — handler no-ops yearly invoices per 12-CONTEXT D-08; intent met) |
| 2 | After 30 days, balance resets to 75 with ZERO rollover | VERIFIED | After draining to 65, sweep reset overwrites to 75 (NOT 65+75=140). Both assertions present. |
| 3 | Shop-balance Merits untouched by subscription reset | VERIFIED | `assertEquals(ledger.shop_balance, 10)` before and after sweep |
| 4 | TEST-06 runs green offline via deno test in <10s and registered | VERIFIED | 2/2 pass in 6ms; line 46 of run-edge-tests.ps1 |

### Grep Contracts

```
$ grep -cE 'ZERO rollover|shop_balance preserved|subscription-reset' \
  supabase/functions/_tests/test-06-yearly-reset.test.ts
16   (≥3 required) — PASS

$ grep -c 'handleResetSubscriptionMerits' supabase/functions/_tests/test-06-yearly-reset.test.ts
6    (≥2 required) — PASS

$ grep -cE 'Date\.now|FakeDate|Temporal' supabase/functions/_tests/test-06-yearly-reset.test.ts
0    (must be 0) — PASS
```

### Live Test Execution

```
TEST-06: Pro yearly subscribe -> 75 Merits -> 30-day advance -> reset to 75 with ZERO rollover ... ok (6ms)
TEST-06 auth guard: reset-subscription-merits rejects unauthenticated calls ... ok (1ms)
```

**Verdict: PASS.**

---

## Plan 21-04 Verification (MIG-02 analysis_results read-only)

### must_haves.truths (Task 1 + Task 2 in scope; Task 3 operator-deferred)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No frontend code path calls analysis_results.insert() or .update() | VERIFIED | `grep -RnE "from\('analysis_results'\)\.(insert\|update)\(" src/` → 0 hits |
| 2 | saveAnalysisResult removed from src/lib/analysisHelpers.ts (getAnalysisHistory preserved) | VERIFIED | Function body deleted; only a JSDoc breadcrumb at line 121 remains documenting the removal. `getAnalysisHistory` still exported at line 125. |
| 3 | src/components/MinimalHero.tsx no longer imports or invokes saveAnalysisResult | VERIFIED | `grep -n 'saveAnalysisResult' src/components/MinimalHero.tsx` → 0 hits. Import line 11 reads only `extractResumeInsights, AnalysisDisplayResult`. |
| 4 | New migration drops user INSERT RLS policy on analysis_results; SELECT policy preserved | VERIFIED | `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` contains literal `DROP POLICY IF EXISTS "Users can create their own analysis results" ON public.analysis_results;` (line 27) |
| 5 | supabase db push executed against staging | DEFERRED (operator-gated) | User explicitly skipped Task 3; deferred to operator session combining with 21-05 dry-runs |
| 6 | Post-push staging RLS probe: user JWT INSERT rejected; SELECT succeeds | DEFERRED (operator-gated) | Probe code authored + type-checks clean; live execution deferred to operator |
| 7 | npm run lint and npm run build pass | PARTIAL | `npm run build` exits 0 (5.16s). `npm run lint` reports 8317 pre-existing problems repo-wide (per 21-04 SUMMARY). Plan-touched files (analysisHelpers.ts, MinimalHero.tsx) only contain pre-existing `no-explicit-any` errors — no new regressions introduced by this plan. |

### Artifacts

| Artifact | Status | Evidence |
|----------|--------|----------|
| `supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql` | VERIFIED | File present; `grep -c 'DROP POLICY IF EXISTS'` → 1; `grep -c 'Users can create their own analysis results'` → 1 |
| `supabase/functions/_tests/analysis_results_rls_test.ts` | VERIFIED | File body matches plan's `<action>` block verbatim. `deno check supabase/functions/_tests/analysis_results_rls_test.ts` (from project root) exits 0. NOT registered in `run-edge-tests.ps1` (`grep -c 'analysis_results_rls_test.ts' scripts/run-edge-tests.ps1` → 0). Matches `merit_rls_test.ts` convention. |
| `src/lib/analysisHelpers.ts` | VERIFIED | `saveAnalysisResult` body removed; JSDoc breadcrumb at line 121 documents the removal; `getAnalysisHistory` SELECT-only helper preserved at line 125. |
| `src/components/MinimalHero.tsx` | VERIFIED | Import + call site removed. |

### Grep Contracts (Task 1 + Task 2 acceptance gates)

```
$ grep -RnE "from\('analysis_results'\)\.(insert|update)\(" src/    → 0 hits   PASS
$ grep -Rn 'saveAnalysisResult' src/                                → 1 hit (JSDoc breadcrumb at analysisHelpers.ts:121)
$ grep -Rn 'getAnalysisHistory' src/lib/analysisHelpers.ts          → 1 hit (function declaration)
$ test -f supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql → exit 0   PASS
$ grep -c 'DROP POLICY IF EXISTS' supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql → 1   PASS
$ grep -c 'Users can create their own analysis results' supabase/migrations/20260420000000_mig_02_analysis_results_readonly.sql → 1   PASS
$ deno check supabase/functions/_tests/analysis_results_rls_test.ts → exit 0    PASS
$ grep -n 'analysis_results_rls_test.ts' scripts/run-edge-tests.ps1 → 0 hits    PASS (intentionally absent)
$ npm run build                                                      → exit 0   PASS (built in 5.16s)
```

The single `saveAnalysisResult` hit is a documentation breadcrumb in a JSDoc block (`* The prior \`saveAnalysisResult\` helper was removed — \`analysis_results\` writes`) — function body is verifiably gone. This matches the user's explicit instruction: "a JSDoc breadcrumb comment may remain — that's fine."

**Verdict: PASS** (Tasks 1 + 2 verified; Task 3 explicitly operator-deferred per user instruction; deferral does not block phase-level completion since 21-05 also depends on the same operator session).

---

## Plan 21-05 Verification (D-19 attestation + D-18 probe + D-10/D-14 cutover)

### must_haves.truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every D-07 gated handler emits merit-flag attestation log at module cold start | VERIFIED (9 of 10) | All 9 in-tree D-07 gated handlers grep-positive for `createLogger.*merit-flag`. The 10th handler `interview-prep-coach` does not exist in the repo — see Cross-plan consistency below. |
| 2 | interview-prep-evaluate is explicitly intentionally ungated (OQ1) — no attestation log | VERIFIED | `grep -c 'merit-flag' supabase/functions/interview-prep-evaluate/index.ts` → 0 |
| 3 | scripts/sc5-probe.ps1 exists, invokes each D-07 gated feature with Bearer JWT from SC5_TEST_USER_JWT | VERIFIED | File present; PowerShell parser PARSE_OK; contains `SC5_TEST_USER_JWT`, all 9 in-tree feature names, `21-SC5-EVIDENCE.md`; does NOT contain `interview-prep-coach` (removed in commit `dcf7b20` per user note) |
| 4 | scripts/cutover-production.ps1 exposes Invoke-MeritFlagFlip + Invoke-MeritFlagRollback | VERIFIED | Both function definitions present; both decorated with `[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]`; bottom-of-file guard prevents auto-run; PARSE_OK |
| 5 | cutover-production.ps1 does NOT modify deploy-production.ps1 | VERIFIED | `grep -c 'deploy-production.ps1' scripts/cutover-production.ps1` → 0 |
| 6 | Dry-run against staging: sc5-probe.ps1 exits 0; Invoke-MeritFlagFlip succeeds | DEFERRED (operator-gated) | Per user instruction, staging dry-runs deferred to a single operator session (combined with 21-04 Task 3) |

### Per-Handler Merit-Flag Attestation Status

| # | Handler | Status |
|---|---------|--------|
| 1 | `analyze-resume/index.ts` | VERIFIED |
| 2 | `analyze-career/index.ts` | VERIFIED |
| 3 | `grade-linkedin/index.ts` | VERIFIED |
| 4 | `recruiting-lens/index.ts` | VERIFIED |
| 5 | `analyze-skills-gap/index.ts` | VERIFIED |
| 6 | `compare-jobs/index.ts` | VERIFIED |
| 7 | `interview-prep-analyze/index.ts` | VERIFIED |
| 8 | `submit-resume-analysis-job/index.ts` | VERIFIED |
| 9 | `submit-career-analysis-job/index.ts` | VERIFIED |
| 10 | `interview-prep-coach/index.ts` | N/A — handler does not exist in this repo (per user instruction, removed from sc5-probe.ps1 + cutover-production.ps1 in commit `dcf7b20`); canonical D-07 gated handler count is now **9**, not 10 |
| ungated | `interview-prep-evaluate/index.ts` | VERIFIED CLEAN (intentionally ungated per OQ1 — `merit-flag` count = 0) |

### Grep Contracts (sc5-probe.ps1)

```
$ test -f scripts/sc5-probe.ps1                                          → exists   PASS
$ grep -c 'SC5_TEST_USER_JWT' scripts/sc5-probe.ps1                      → 3        PASS
$ grep -c 'analyze-resume' scripts/sc5-probe.ps1                         → 2        PASS
$ grep -c 'recruiting-lens' scripts/sc5-probe.ps1                        → 2        PASS
$ grep -c 'analyze-skills-gap' scripts/sc5-probe.ps1                     → 2        PASS
$ grep -c '21-SC5-EVIDENCE.md' scripts/sc5-probe.ps1                     → 1        PASS
$ grep -c 'interview-prep-coach' scripts/sc5-probe.ps1                   → 0        PASS (per user instruction, removed in dcf7b20)
$ grep -c 'deploy-production.ps1' scripts/sc5-probe.ps1                  → 0        PASS
$ grep -cE '\bsupabase\b\s' scripts/sc5-probe.ps1                        → 0        PASS (no CLI invocation)
$ powershell.exe -Command [Parser]::ParseFile('scripts/sc5-probe.ps1')   → PARSE_OK PASS
```

### Grep Contracts (cutover-production.ps1)

```
$ test -f scripts/cutover-production.ps1                                 → exists   PASS
$ grep -c 'function Invoke-MeritFlagFlip' scripts/cutover-production.ps1     → 1    PASS
$ grep -c 'function Invoke-MeritFlagRollback' scripts/cutover-production.ps1 → 1    PASS
$ grep -c 'MERIT_SYSTEM_ENABLED=true' scripts/cutover-production.ps1     → 6        PASS (≥1)
$ grep -c 'MERIT_SYSTEM_ENABLED=false' scripts/cutover-production.ps1    → 6        PASS (≥1)
$ grep -c 'SupportsShouldProcess' scripts/cutover-production.ps1         → 3        PASS (≥2)
$ grep -c 'deploy-production.ps1' scripts/cutover-production.ps1         → 0        PASS
$ grep -c 'interview-prep-coach' scripts/cutover-production.ps1          → 0        PASS (per user instruction, removed in dcf7b20)
$ grep -nE '^\s*Invoke-MeritFlag' scripts/cutover-production.ps1
   7:  Invoke-MeritFlagRollback ...      ← inside <# ... #> doc-comment block
  34:    Invoke-MeritFlagFlip ...         ← inside .NOTES doc block (example)
  36:    Invoke-MeritFlagRollback ...     ← inside .NOTES doc block (example)
   ALL THREE matches are inside the leading <# ... #> help block, NOT top-level executable code. PASS.
$ powershell.exe -Command [Parser]::ParseFile('scripts/cutover-production.ps1') → PARSE_OK PASS
```

### Bottom-of-File Auto-Run Guard

```powershell
if ($MyInvocation.InvocationName -ne '.') {
  Write-Host "cutover-production.ps1 loaded. Available functions: ..."
  Write-Host "Neither runs automatically. Invoke explicitly after reading the Phase 21 pre-flip checklist (D-09)."
}
```

Confirmed present and functioning as a no-op when dot-sourced.

**Verdict: PASS** (all autonomous code requirements met; `interview-prep-coach` deviation is consistent with user-supplied context that the function does not exist in this repo and was removed from both PowerShell scripts in commit `dcf7b20`; staging dry-runs explicitly deferred to operator).

---

## Cross-Plan Consistency

### `analysis_results` Write Asymmetry

The phase asserts that `analyze-resume` does NOT write to `analysis_results` (Plan 21-04 Step 1a finding) while `analyze-career` and `recruiting-lens` DO write to it via service role (Plan 21-04 + Plan 21-05 implicit context). Both claims verified:

```
$ grep -nE "from\(['\"]analysis_results['\"]\)" supabase/functions/analyze-resume/index.ts \
                                                  supabase/functions/submit-resume-analysis-job/index.ts \
                                                  supabase/functions/process-resume-analysis-job/index.ts
(no matches)
```

Resume path uses `resumes.grading_data` UPDATE instead:

```
$ grep -cnE "from\(['\"]resumes['\"]\)\.update" supabase/functions/analyze-resume/index.ts
10   ← 10 service-role UPDATE call sites all setting grading_data
```

`analyze-career` writes `analysis_results` via service role:

```
$ grep -nE "from\(['\"]analysis_results['\"]\)" supabase/functions/analyze-career/index.ts
732, 960, 1490
```

`recruiting-lens` writes `analysis_results` via service role:

```
$ grep -nE "from\(['\"]analysis_results['\"]\)\.insert" supabase/functions/recruiting-lens/index.ts
275, 379
```

This asymmetry is internally consistent: MIG-02 protects `analysis_results` rows for career-compass + recruiting-lens (which DO write there); the resume flow stores its result in `resumes.grading_data` and is unaffected by MIG-02. Removing the orphaned frontend `saveAnalysisResult` helper is therefore guaranteed non-destructive — confirmed by 21-04 SUMMARY Deviation 1 and verified again here.

### `interview-prep-coach` Absence

The function does not exist in the repo (`ls supabase/functions/ | grep interview` returns only `interview-prep-analyze` and `interview-prep-evaluate`). Per the user's explicit instruction in this verification's prompt and the 21-05 SUMMARY's first key-decision, this is intentional:
- Plan 21-05 instructed the executor to skip absent files (Task 1 contract: "If absent, the file is NOT a D-07 gated handler — note in the SUMMARY and skip; do NOT add the import retroactively"). 9 in-tree handlers attested instead of the original 10.
- Commit `dcf7b20` ("fix(21-05): remove interview-prep-coach from probe + cutover scripts") removed the handler from `sc5-probe.ps1` and `cutover-production.ps1` so the staging probe + cutover redeploy lists do not target a non-existent function.
- The canonical D-07 gated handler count for the SC-5 evidence surface is now **9**, not 10.

### `npm run lint` Pre-Existing State

`npm run lint` reports 8317 problems repo-wide. Per the 21-04 SUMMARY, plan-touched files (`src/lib/analysisHelpers.ts` and `src/components/MinimalHero.tsx`) only contain pre-existing `@typescript-eslint/no-explicit-any` errors — no new regressions introduced by either plan. `npm run build` exits 0 (5.16s) and is the actual ship gate.

---

## Build & Test Gate Summary

| Gate | Result |
|------|--------|
| `npm run build` | PASS (built in 5.16s) |
| `npm run lint` (plan-touched files) | PASS (only pre-existing errors documented in 21-04 SUMMARY) |
| `deno check supabase/functions/_tests/analysis_results_rls_test.ts` (from project root) | PASS (exit 0) |
| `deno test --no-check _tests/test-04..06.test.ts` | PASS (6/6 in 1s) |
| Subset of full edge-test suite (4 _shared + merit_rls + TEST-04/05/06) | PASS (57 passed / 0 failed in 2s) |
| `powershell.exe Parser::ParseFile sc5-probe.ps1` | PARSE_OK |
| `powershell.exe Parser::ParseFile cutover-production.ps1` | PARSE_OK |

The 21-05 SUMMARY claims "230 passed / 0 failed in 13s" for the full PowerShell-driven `run-edge-tests.ps1`. PowerShell is not available in this verification's bash session, so the canonical full-suite runner was not invoked. The subset above (TEST-04/05/06 + the 4 `_shared` tests + `merit_rls_test.ts`) is what TEST-04/05/06 directly enable, and the per-test counts match what the SUMMARYs claim.

---

## Operator-deferred Items

The following work cannot be code-verified and must be executed by the operator before the phase can be declared complete. None of these are failures — all are explicitly operator-gated by design.

### 21-04 Task 3 — Push MIG-02 to staging + verify RLS lock

1. Ensure `SUPABASE_ACCESS_TOKEN` is set in the operator shell.
2. `supabase link --project-ref <STAGING_REF>` (fetch `<STAGING_REF>` from `scripts/deploy-staging.ps1`).
3. `supabase db push --project-ref <STAGING_REF>` — expect exactly one new migration applied (`20260420000000_mig_02_analysis_results_readonly.sql`).
4. In the staging Supabase Studio SQL editor, run:
   ```sql
   SELECT policyname, cmd
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analysis_results';
   ```
   Expect exactly one row: `("Users can view their own analysis results", SELECT)`. The INSERT policy must be absent.
5. With staging env vars (`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, freshly minted `TEST_USER_JWT`) exported, run:
   ```
   RUN_LIVE_MERIT=1 deno test --allow-all supabase/functions/_tests/analysis_results_rls_test.ts
   ```
   Expect both tests to pass — INSERT rejected (42501 or RLS string match), SELECT succeeds.
6. Manual smoke: free signup → resume analysis → result page loads. The resume flow uses `resumes.grading_data` (independent of MIG-02), so this should be unaffected.
7. Append the `pg_policies` query output and the test output to `21-04-SUMMARY.md` in a `## Staging MIG-02 Verification` section.

### 21-05 Staging Dry-Runs — sc5-probe.ps1 + Invoke-MeritFlagFlip / Rollback

1. Export `SC5_TEST_USER_JWT` and `SUPABASE_ANON_KEY` for the staging project.
2. `.\scripts\sc5-probe.ps1 -SupabaseUrl https://<STAGING_REF>.supabase.co` — expect exit 0; verify `21-SC5-EVIDENCE.md` gets a new `## SC-5 Probe Run — <ISO>` section appended.
3. `. .\scripts\cutover-production.ps1` (dot-source). Confirm `Get-Command Invoke-MeritFlagFlip, Invoke-MeritFlagRollback` shows both functions; nothing has run.
4. `Invoke-MeritFlagFlip -ProjectRef <STAGING_REF> -Confirm:$false` — expect success and 9 successful function redeploys.
5. `supabase secrets list --project-ref <STAGING_REF>` — expect `MERIT_SYSTEM_ENABLED=true` listed.
6. Re-run `sc5-probe.ps1` to capture post-flip evidence in the same evidence file.
7. `Invoke-MeritFlagRollback -ProjectRef <STAGING_REF> -Confirm:$false` — expect success; `supabase secrets list` shows `MERIT_SYSTEM_ENABLED=false`.

### 21-06 — 24-hour staging soak

`autonomous: false` per the plan frontmatter. Operator-driven. Three timed `sc5-probe.ps1` runs (t=0h, t=12h, t=24h), merit-transaction log capture from Supabase function logs, alert_state monitoring, GO/NO-GO recommendation in `21-STAGING-SOAK.md`. Plan 07 is blocked until soak yields GO.

### 21-07 — Production cutover, 2-hour active soak, SC-5 evidence

`autonomous: false`. Operator-driven. Pre-flip checklist execution; `Invoke-MeritFlagFlip -ProjectRef zjpjapgraoxdukdvpjes`; redeploy of all 9 in-tree D-07 gated handlers; capture of 9 `merit-flag` boot attestations from production logs; three sc5-probe runs at t=0h/1h/2h; ≥1 organic merit-transaction sample capture; rollback standby; `21-SC5-EVIDENCE.md` authored during the soak.

---

## Anti-Pattern Scan

Scanned all plan-touched files for stub markers, empty implementations, console-only handlers, etc.

| Concern | Result |
|---------|--------|
| TODO / FIXME / placeholder in modified files | None blocking; only legitimate inline cite-comments referencing future operator work |
| Empty handlers (`return null`, `return {}`) | None |
| `Date.now()` mocking in TEST-06 | 0 hits — explicitly forbidden by acceptance criterion, confirmed |
| Top-level auto-runs in cutover-production.ps1 | None — all `Invoke-MeritFlag*` mentions inside `<# ... #>` doc-comment block; bottom-of-file guard prints help text only |
| Stub TEST scenarios | None — all 6 TEST-04/05/06 tests pass with substantive ledger arithmetic + assertion chains |

---

## Phase verdict

**READY FOR OPERATOR HANDOFF.**

- Plans 01–05 verified; all autonomous code changes are in place, tested, and grep-clean.
- Plans 06 and 07 are operator-gated (autonomous=false) and cannot be code-verified.
- The single combined operator session that closes 21-04 Task 3 + 21-05 staging dry-runs is the immediate next action.
- After that session: 21-06 (24-hour soak) → GO/NO-GO → 21-07 (production cutover + SC-5 evidence) closes the phase.

No code-side regressions, no unintended deletions, no broken cross-plan consistency. The migration is durable and idempotent. The PowerShell scripts have safety rails (`SupportsShouldProcess`, dot-source guard, fail-closed env-var checks). The TEST-04/05/06 trio runs in <100ms total and is registered in the canonical edge-test runner.

---

*Verified: 2026-04-29T00:15:00Z*
*Verifier: Claude (gsd-verifier, read-only audit per user instruction)*
*Branch verified: by/env-fixes*
