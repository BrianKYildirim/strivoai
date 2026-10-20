# Unified env-parameterized Supabase Edge Function deploy.
#
# Usage:
#   scripts/deploy.ps1 -Env production
#   scripts/deploy.ps1 -Env staging
#   scripts/deploy.ps1 -Env test
#   scripts/deploy.ps1 -Env staging -Functions @("analyze-resume","grade-linkedin")
#   scripts/deploy.ps1 -Env staging -SkipVerify        # EMERGENCY ONLY -- bypasses the whole verify:baseline gate
#   scripts/deploy.ps1 -Env staging -SkipRemoteDbLane  # EMERGENCY ONLY -- runs the gate WITHOUT the database lane
#
# Project selection is done HERE by an explicit `supabase link --project-ref <ref>`
# (the single source of truth for which project is targeted). It is NOT driven by
# supabase/config.toml's project_id -- the config-copy footgun was intentionally removed.
#
# Deploy gate (D-06 / TEST-08 / VER-01): this script runs `npm run verify:baseline` as a HARD
# precondition BEFORE `supabase link` -- a red suite aborts the deploy (exit 1) before any
# project is linked or any function is deployed. The two shims (deploy-staging.ps1 /
# deploy-production.ps1) forward here under `$ErrorActionPreference = "Stop"`, so they
# inherit the gate automatically -- the gate lives in ONE place. The shims accept only
# -Functions, so NEITHER escape hatch below is reachable through them: a shim deploy is
# always fully gated.
#
# Requires Node + Deno + Playwright present on the local host, plus reachable PREVIEW
# Supabase credentials for the database lane (.env.test.local -- see TESTING-STRATEGY.md).
#
# The TWO escape hatches are explicit, loud, and default OFF:
#   -SkipVerify        bypasses the ENTIRE gate. Emergency hotfix-deploys only.
#   -SkipRemoteDbLane  runs every other layer but drops the DATABASE lane. For the ONE case
#                      where the preview project is genuinely unreachable and a deploy cannot
#                      wait. The correct fix is to UNPAUSE preview, never to skip the lane.
param(
  [Parameter(Mandatory)]
  [string]$Env,
  [switch]$SkipVerify,
  [switch]$SkipRemoteDbLane,
  [string[]]$Functions = @(
    "process-scheduled-emails"
    "admin-delete-user"
    "ocr-pdf"
    "begin-feature-run"
    "send-feature-email"
    "analyze-resume"
    "send-strivo-email"
    "analyze-career"
    "notify-admin-activity"
    "test-email"
    "notify-upgrade-approved"
    "notify-upgrade-request"
    "send-credits-exhausted-email"
    "grade-linkedin"
    "send-notification-email"
    "send-welcome-email"
    "submit-resume-analysis-job"
    "get-analysis-job-status"
    "process-resume-analysis-job"
    "submit-career-analysis-job"
    "process-career-analysis-job"
    "keep-warm"
    "create-checkout-session"
    "create-payment-intent"
    "create-stripe-portal"
    "cancel-subscription"
    "renew-subscription"
    "extract-analysis-structure"
    "reap-stale-analysis-runs"
    "stripe-webhook"
    "stripe-webhook-handler"
    "reset-subscription-merits"
    "admin-merit-metrics"
    "check-merit-alerts"
    "interview-prep-analyze"
    "interview-prep-evaluate"
    "lifecycle-archive-writer"
    "recruiting-lens"
    "validate-document"
    "log-client-diagnostic"
  )
)

$ErrorActionPreference = "Stop"

# Validate -Env and map to the authoritative project ref.
$envLower = $Env.ToLower()
switch ($envLower) {
  "production" { $ref = "zjpjapgraoxdukdvpjes" }   # strivoai (prod)
  "staging"    { $ref = "cimjltzovkahkqecpwgi" }   # strivoaipreview
  "test"       { $ref = "cimjltzovkahkqecpwgi" }   # test reuses the strivoaipreview project
  default {
    Write-Error "Invalid -Env '$Env'. Valid values: production, staging, test."
    exit 1
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# -- Deploy gate (D-06 / TEST-08): verify:baseline HARD precondition --------------------
# Prove zero functional change BEFORE anything is linked or deployed. A red suite aborts
# here (exit 1) -- no `supabase link`, no `functions deploy`. This is the real teeth behind
# the regression baseline. Skippable only via the explicit, documented `-SkipVerify`
# emergency escape hatch (default OFF).
if ($SkipVerify) {
  Write-Warning "-SkipVerify set -- bypassing the ENTIRE verify:baseline deploy gate."
  Write-Warning "This deploy is NOT gated: no lint, no type-check, no tests, no database lane, no build."
  Write-Warning "Emergency hotfix use ONLY. You are knowingly forgoing the zero-functional-change proof."
} elseif ($SkipRemoteDbLane) {
  # EMERGENCY ONLY. Runs every layer EXCEPT the remote DATABASE lane, by invoking the
  # individual scripts in the same order verify:baseline uses. This exists so that an
  # unreachable/paused preview project cannot leave an operator with only the nuclear
  # -SkipVerify option -- a gate whose sole escape hatch is "skip everything" gets used that
  # way. The DATABASE lane's own preflight FAILS LOUDLY rather than skipping (D-06), so
  # reaching for this switch is always a deliberate, recorded act.
  Write-Warning "-SkipRemoteDbLane set -- the DATABASE lane (test:edge:remote) will be SKIPPED."
  Write-Warning "This deploy is NOT fully gated: VER-01's database-test requirement is NOT proven."
  Write-Warning "The correct fix for an unreachable preview project is to UNPAUSE it, never to skip the lane."

  $lanes = @("lint", "type-check", "test", "test:edge", "test:e2e", "build")
  foreach ($lane in $lanes) {
    Write-Host "Running npm run $lane (gate lane, remote DB lane skipped)..."
    npm run $lane
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Gate lane '$lane' FAILED -- aborting deploy (no functions linked or deployed)."
      exit 1
    }
  }
  Write-Warning "Gate PASSED WITHOUT THE DATABASE LANE. This deploy is not fully gated -- record why."
} else {
  # PINNED COMPOSITION (WR-01 / VER-01): `verify:baseline` MUST remain the SEVEN-layer chain
  #   "npm run lint && npm run type-check && npm run test && npm run test:edge
  #    && npm run test:edge:remote && npm run test:e2e && npm run build"
  # (package.json -> scripts.verify:baseline), i.e. these seven layers:
  #   1. lint             (eslint)
  #   2. type-check       (tsc --noEmit)
  #   3. test             (vitest - frontend unit/integration)
  #   4. test:edge        (deno offline allowlist)
  #   5. test:edge:remote (deno REMOTE DATABASE lane against the preview project - D-06)
  #   6. test:e2e         (Playwright - browser E2E)
  #   7. build            (production vite build)
  # This gate only inspects $LASTEXITCODE of `verify:baseline`, so it trusts the script
  # NAME, not its body. If a future edit silently shortens that chain (drops a layer or
  # swaps in a no-op alias), this gate would still pass while skipping a layer. A reviewer
  # of any change to scripts.verify:baseline MUST confirm all SEVEN layers are still
  # present here -- drift in that script is the silent fail-open this comment guards.
  # (This comment asserted THREE layers until 09-09; it had gone stale. If you are changing
  # the chain, change this comment in the same commit.)
  Write-Host "Running verify:baseline (lint + type-check + vitest + offline-deno + remote-DB + Playwright + build) as a deploy precondition..."
  npm run verify:baseline
  if ($LASTEXITCODE -ne 0) {
    Write-Error "verify:baseline FAILED -- aborting deploy (no functions linked or deployed)."
    exit 1
  }
  Write-Host "verify:baseline GREEN -- proceeding to link + deploy."
}

# Explicit link is the single source of truth for the deploy target (not config.toml).
Write-Host "Deploying env '$envLower' -> Supabase project ref '$ref'..."
supabase link --project-ref $ref

foreach ($fn in $Functions) {
  Write-Host "Deploying $fn to $envLower..."
  # Use server-side bundling to avoid local Docker/Deno lockfile version mismatches.
  supabase functions deploy $fn --no-verify-jwt --use-api
}

Write-Host "$envLower deploy complete."
