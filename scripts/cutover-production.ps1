<#
.SYNOPSIS
  Phase 21 D-10 / D-14 cutover orchestration for the Merit system flag flip.

.DESCRIPTION
  Exposes two PowerShell functions — Invoke-MeritFlagFlip and
  Invoke-MeritFlagRollback — that wrap the Supabase CLI commands required
  to flip MERIT_SYSTEM_ENABLED and re-deploy the 10 D-07 gated edge
  functions so the new value is read at module cold start.

  This script is dot-source-friendly and intentionally never auto-runs the
  flip. Operators must invoke the function explicitly after completing the
  D-09 pre-flip checklist.

  This script does NOT import, dot-source, or modify any other deploy
  helper.

.PARAMETER ProjectRef
  Supabase project ref to target. Defaults to the production ref
  documented in 21-CONTEXT.md.

.PARAMETER FunctionsToRedeploy
  Names of functions to re-deploy after toggling the secret. Defaults to
  the 10 D-07 gated handlers ($GatedFunctions).

.NOTES
  Both Invoke-MeritFlagFlip and Invoke-MeritFlagRollback declare
  SupportsShouldProcess=$true with ConfirmImpact='High', so interactive
  operators receive a confirmation prompt by default. Scripted runs can
  override with -Confirm:$false.

  Usage:
    . .\scripts\cutover-production.ps1
    Invoke-MeritFlagFlip -ProjectRef <staging-or-prod-ref>
    # ...verify...
    Invoke-MeritFlagRollback -ProjectRef <staging-or-prod-ref>
#>

[CmdletBinding()]
param(
  [string]$ProjectRef = "zjpjapgraoxdukdvpjes",

  [string[]]$FunctionsToRedeploy = @(
    "analyze-resume"
    "analyze-career"
    "grade-linkedin"
    "recruiting-lens"
    "interview-prep-analyze"
    "submit-resume-analysis-job"
    "submit-career-analysis-job"
  )
)

# Module-private canonical list of D-07 gated handlers (Phase 21 Plan 05 truth source).
$script:GatedFunctions = @(
  "analyze-resume"
  "analyze-career"
  "grade-linkedin"
  "recruiting-lens"
  "interview-prep-analyze"
  "submit-resume-analysis-job"
  "submit-career-analysis-job"
)

function Invoke-MeritFlagFlip {
  <#
  .SYNOPSIS
    Flip MERIT_SYSTEM_ENABLED=true and re-deploy gated functions.

  .DESCRIPTION
    Sets the MERIT_SYSTEM_ENABLED secret to true on the target Supabase
    project, then re-deploys each function in -FunctionsToRedeploy so the
    new flag value is observed at cold start. Returns 0 on full success
    and 1 on any failure.
  #>
  [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
  param(
    [string]$ProjectRef = $script:ProjectRef,
    [string[]]$FunctionsToRedeploy = $script:FunctionsToRedeploy
  )

  if (-not $ProjectRef) { $ProjectRef = "zjpjapgraoxdukdvpjes" }
  if (-not $FunctionsToRedeploy -or $FunctionsToRedeploy.Count -eq 0) {
    $FunctionsToRedeploy = $script:GatedFunctions
  }

  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Write-Host "[$ts] Flipping MERIT_SYSTEM_ENABLED=true for project $ProjectRef"

  if (-not $PSCmdlet.ShouldProcess("Supabase project $ProjectRef", "Set MERIT_SYSTEM_ENABLED=true and redeploy $($FunctionsToRedeploy.Count) function(s)")) {
    Write-Host "[$ts] Skipped (ShouldProcess declined)"
    return 1
  }

  & supabase secrets set MERIT_SYSTEM_ENABLED=true --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    Write-Error "supabase secrets set MERIT_SYSTEM_ENABLED=true failed (exit $LASTEXITCODE)"
    return 1
  }

  $failures = New-Object System.Collections.Generic.List[string]
  foreach ($fn in $FunctionsToRedeploy) {
    Write-Host "[$ts]   redeploying $fn ..."
    & supabase functions deploy $fn --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      Write-Error "supabase functions deploy $fn failed (exit $LASTEXITCODE)"
      $failures.Add($fn) | Out-Null
    }
  }

  $tsEnd = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  if ($failures.Count -gt 0) {
    Write-Error "[$tsEnd] Flip completed with $($failures.Count) deploy failure(s): $($failures -join ', ')"
    return 1
  }

  Write-Host "[$tsEnd] Flip complete. MERIT_SYSTEM_ENABLED=true on $ProjectRef. $($FunctionsToRedeploy.Count) function(s) redeployed."
  return 0
}

function Invoke-MeritFlagRollback {
  <#
  .SYNOPSIS
    Roll back to MERIT_SYSTEM_ENABLED=false and re-deploy gated functions.

  .DESCRIPTION
    Sets the MERIT_SYSTEM_ENABLED secret to false on the target Supabase
    project, then re-deploys each function in -FunctionsToRedeploy so the
    legacy (pre-flag) path is observed at cold start. Returns 0 on full
    success and 1 on any failure.
  #>
  [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
  param(
    [string]$ProjectRef = $script:ProjectRef,
    [string[]]$FunctionsToRedeploy = $script:FunctionsToRedeploy
  )

  if (-not $ProjectRef) { $ProjectRef = "zjpjapgraoxdukdvpjes" }
  if (-not $FunctionsToRedeploy -or $FunctionsToRedeploy.Count -eq 0) {
    $FunctionsToRedeploy = $script:GatedFunctions
  }

  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  Write-Host "ROLLBACK: [$ts] Flipping MERIT_SYSTEM_ENABLED=false for project $ProjectRef"

  if (-not $PSCmdlet.ShouldProcess("Supabase project $ProjectRef", "ROLLBACK: Set MERIT_SYSTEM_ENABLED=false and redeploy $($FunctionsToRedeploy.Count) function(s)")) {
    Write-Host "ROLLBACK: [$ts] Skipped (ShouldProcess declined)"
    return 1
  }

  & supabase secrets set MERIT_SYSTEM_ENABLED=false --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    Write-Error "ROLLBACK: supabase secrets set MERIT_SYSTEM_ENABLED=false failed (exit $LASTEXITCODE)"
    return 1
  }

  $failures = New-Object System.Collections.Generic.List[string]
  foreach ($fn in $FunctionsToRedeploy) {
    Write-Host "ROLLBACK: [$ts]   redeploying $fn ..."
    & supabase functions deploy $fn --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      Write-Error "ROLLBACK: supabase functions deploy $fn failed (exit $LASTEXITCODE)"
      $failures.Add($fn) | Out-Null
    }
  }

  $tsEnd = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  if ($failures.Count -gt 0) {
    Write-Error "ROLLBACK: [$tsEnd] Rollback completed with $($failures.Count) deploy failure(s): $($failures -join ', ')"
    return 1
  }

  Write-Host "ROLLBACK: [$tsEnd] Rollback complete. MERIT_SYSTEM_ENABLED=false on $ProjectRef. $($FunctionsToRedeploy.Count) function(s) redeployed."
  return 0
}

# ── Bottom-of-file guard: never auto-run on dot-source ───────────────────────

if ($MyInvocation.InvocationName -ne '.') {
  Write-Host "cutover-production.ps1 loaded. Available functions: Invoke-MeritFlagFlip, Invoke-MeritFlagRollback."
  Write-Host "Neither runs automatically. Invoke explicitly after reading the Phase 21 pre-flip checklist (D-09)."
}
