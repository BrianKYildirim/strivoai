<#
.SYNOPSIS
  Run Deno unit tests for Supabase Edge Function shared utilities.
  Requires Deno: https://deno.land/manual/getting_started/installation

.EXAMPLE
  .\scripts\run-edge-tests.ps1
#>

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$fnDir = Join-Path $repoRoot "supabase\functions"

Write-Host "Running edge function tests in $fnDir"
Set-Location $fnDir

function Invoke-DenoTest {
  param([string[]]$TestArgs)
  & deno.cmd @TestArgs
  if ($LASTEXITCODE -ne 0) {
    throw "deno.cmd failed with exit code $LASTEXITCODE"
  }
}

$remoteRequested = $env:DENO_TEST_SUPABASE_REMOTE
$baseTests = @(
  "test",
  "--allow-all",
  "_shared/cache-fingerprint.test.ts",
  "_shared/json-repair.test.ts",
  "_shared/tier-config.test.ts",
  "_shared/logger.test.ts",
  "_shared/stripe-client.test.ts",
  "_shared/shop-pack-resolver.test.ts",
  "_shared/date-utils.test.ts",
  "_shared/anthropic.test.ts",
  "_shared/tier-prompts.test.ts",
  "_shared/resume-prompts-variants.test.ts",
  "_shared/merit-gateway.test.ts",
  "_shared/merit-gateway.perf.test.ts",
  "_shared/merit-gateway.rate.test.ts",
  "_shared/merit-gateway.raw.test.ts",
  "_shared/merit-idempotency.test.ts",
  "_shared/merit-gateway.refund.test.ts",
  "_shared/merit-refund-idempotency.test.ts",
  "stripe-webhook/index.test.ts",
  "create-checkout-session/index.test.ts",
  "create-stripe-portal/index.test.ts",
  "stripe-webhook-handler/index.test.ts",
  "reset-subscription-merits/index.test.ts",
  "admin-merit-metrics/index.test.ts",
  "check-merit-alerts/index.test.ts",
  "analyze-resume/test-07.test.ts",
  "analyze-resume/merit-branch.test.ts",
  "_tests/merit_rls_test.ts",
  "_tests/test-04-free-signup-to-shop.test.ts",
  "_tests/test-05-upgrade-proration.test.ts",
  "_tests/test-06-yearly-reset.test.ts",
  "_shared/career-shape.test.ts",
  "analyze-career/index.test.ts",
  "--no-check"
)

try {
  $env:DENO_TEST_SUPABASE_REMOTE = "0"
  Invoke-DenoTest -TestArgs $baseTests
} finally {
  $env:DENO_TEST_SUPABASE_REMOTE = $remoteRequested
}

if ($remoteRequested -eq '1') {
  Write-Host "DENO_TEST_SUPABASE_REMOTE=1 -- running Phase 36 TEST-05 remote history persistence suite"
  Invoke-DenoTest -TestArgs @(
    "test",
    "--allow-all",
    "analyze-resume/__tests__/history-persistence.test.ts",
    "analyze-career/__tests__/history-persistence.test.ts",
    "grade-linkedin/__tests__/history-persistence.test.ts",
    "recruiting-lens/__tests__/history-persistence.test.ts",
    "interview-prep-analyze/__tests__/history-persistence.test.ts",
    "--no-check"
  )
} else {
  Write-Host "Skipping Phase 36 TEST-05 remote history persistence suite (set DENO_TEST_SUPABASE_REMOTE=1 to run)"
}

if ($env:RUN_TIER_VALIDATION -eq '1') {
  Write-Host "RUN_TIER_VALIDATION=1 -- running live tier-validation harness (will call Anthropic, ~0.05 dollars/run)"
  Invoke-DenoTest -TestArgs @("test", "--allow-all", "_shared/tier-validation.test.ts", "--no-check")
  Write-Host "Tier validation complete. Snapshot written to _shared/tier-validation-fixtures/resume.json"
} else {
  Write-Host "Skipping tier-validation harness (set RUN_TIER_VALIDATION=1 to run)"
}

Write-Host "All edge function tests passed."
