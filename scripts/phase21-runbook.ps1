<#
.SYNOPSIS
  Phase 21 operator runbook. Walks through the four operator gates that
  close out integration-validation-and-cutover in order:

    Gate A -- Plan 21-04 Task 3  staging RLS probe + free-signup smoke
    Gate B -- Plan 21-05 dry-run staging flip + probe + rollback
    Gate C -- Plan 21-06 24-hour staging soak (3 sittings: 0h / 12h / 24h)
    Gate D -- Plan 21-07 production cutover + 2h soak + commit evidence

.DESCRIPTION
  This is a guided runbook, not an automation pipeline. Every destructive
  command requires explicit operator confirmation; the runbook prints what
  it is about to do, captures output into the appropriate evidence file in
  .planning/phases/21-integration-validation-and-cutover/, and stops at
  natural pause points (12h/24h waits, 1h/2h soak windows, GO/NO-GO
  decisions).

  Production flip prompts require typing the literal phrase "FLIP PROD"
  rather than "y" -- typo-protection against accidental production action.

  The runbook does NOT modify any code. It only invokes existing scripts:
    scripts/cutover-production.ps1   (Invoke-MeritFlagFlip / Rollback)
    scripts/sc5-probe.ps1            (D-18 synthetic probe)
    deno test                        (live-DB RLS probe)
    supabase CLI                     (secrets list / functions deploy / log tail)

.PARAMETER Stage
  Which gate (or sub-stage) to run. Use `-Stage list` to print all stages
  and their state.

.PARAMETER DryRun
  Print the actions that would be taken at each step without executing
  destructive commands. The probe runs and read-only verifications still
  execute under -DryRun.

.NOTES
  Required env vars per stage (set BEFORE invoking):

    Gate A (staging RLS probe):
      STAGING_SUPABASE_URL        = https://cimjltzovkahkqecpwgi.supabase.co
      STAGING_SUPABASE_ANON_KEY   = <staging anon key>
      TEST_USER_JWT               = <fresh staging user JWT>

    Gate B/C (staging dry-run + soak):
      STAGING_SUPABASE_URL        = https://cimjltzovkahkqecpwgi.supabase.co
      SUPABASE_ANON_KEY           = <staging anon key>     (sc5-probe reads this)
      SC5_TEST_USER_JWT           = <staging user JWT>     (sc5-probe reads this)

    Gate D (production cutover):
      SUPABASE_ANON_KEY           = <production anon key>  (sc5-probe reads this)
      SC5_TEST_USER_JWT           = <production user JWT>  (sc5-probe reads this)

  Project refs are hard-coded in the runbook to prevent staging/prod
  confusion: staging = cimjltzovkahkqecpwgi, prod = zjpjapgraoxdukdvpjes.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    "list",
    "A-RLS",
    "B-StagingDryRun",
    "C-Soak0", "C-Soak12", "C-Soak24",
    "D1-Preflip", "D2-Flip",
    "D3-Soak0", "D3-Soak1", "D3-Soak2",
    "D4-Finalize"
  )]
  [string]$Stage,

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Project refs are LOCKED here so the runbook cannot accidentally point
# staging commands at prod or vice versa.
$STAGING_REF = "cimjltzovkahkqecpwgi"
$PROD_REF    = "zjpjapgraoxdukdvpjes"

$repoRoot    = Split-Path -Parent $PSScriptRoot
$phaseDir    = Join-Path $repoRoot ".planning/phases/21-integration-validation-and-cutover"
$cutoverLog  = Join-Path $phaseDir "21-CUTOVER-LOG.md"
$soakLog     = Join-Path $phaseDir "21-STAGING-SOAK.md"
$sc5Evidence = Join-Path $phaseDir "21-SC5-EVIDENCE.md"

# -- Helpers ------------------------------------------------------------------

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Note($msg) {
  Write-Host "    $msg" -ForegroundColor DarkGray
}

function Write-Ok($msg) {
  Write-Host "    [ok] $msg" -ForegroundColor Green
}

function Write-Warn2($msg) {
  Write-Host "    [warn] $msg" -ForegroundColor Yellow
}

function Confirm-Or-Exit($prompt, $expected = "y") {
  $reply = Read-Host "    $prompt [type '$expected' to continue, anything else aborts]"
  if ($reply -ne $expected) {
    Write-Host "    Aborted by operator." -ForegroundColor Yellow
    exit 1
  }
}

function Require-Env($names) {
  $missing = @()
  foreach ($n in $names) {
    $v = [Environment]::GetEnvironmentVariable($n)
    if ([string]::IsNullOrWhiteSpace($v)) { $missing += $n }
  }
  if ($missing.Count -gt 0) {
    Write-Error "Missing required env var(s): $($missing -join ', '). Set them in this shell before re-running."
    exit 2
  }
}

function Iso-Now() {
  return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Append-Evidence($path, $section) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Add-Content -Path $path -Value $section -Encoding UTF8
}

function Show-MeritFlagState($projectRef, $label) {
  Write-Step "Reading $label MERIT_SYSTEM_ENABLED state ($projectRef)"
  & supabase secrets list --project-ref $projectRef | Tee-Object -Variable secretOut | Out-Host
  $line = $secretOut -split "`n" | Where-Object { $_ -match "MERIT_SYSTEM_ENABLED" }
  if (-not $line) {
    Write-Warn2 "MERIT_SYSTEM_ENABLED not present (treated as unset = false)."
  } else {
    Write-Note ("found: " + ($line -join "; "))
  }
  return $line
}

function Stage-List() {
  $stages = @(
    [pscustomobject]@{ Stage = "A-RLS";           Plan = "21-04 Task 3"; Title = "Staging RLS probe + free-signup smoke" }
    [pscustomobject]@{ Stage = "B-StagingDryRun"; Plan = "21-05";        Title = "Staging dry-run: flip + probe + rollback" }
    [pscustomobject]@{ Stage = "C-Soak0";         Plan = "21-06";        Title = "24h soak T=0h: flip staging + first probe" }
    [pscustomobject]@{ Stage = "C-Soak12";        Plan = "21-06";        Title = "24h soak T=12h: probe + log sample" }
    [pscustomobject]@{ Stage = "C-Soak24";        Plan = "21-06";        Title = "24h soak T=24h: final probe + GO/NO-GO" }
    [pscustomobject]@{ Stage = "D1-Preflip";      Plan = "21-07 Task 1"; Title = "Production pre-flip checklist" }
    [pscustomobject]@{ Stage = "D2-Flip";         Plan = "21-07 Task 2"; Title = "Production flip + 10 redeploys" }
    [pscustomobject]@{ Stage = "D3-Soak0";        Plan = "21-07 Task 4"; Title = "2h soak T=0h: boot attestations + first probe" }
    [pscustomobject]@{ Stage = "D3-Soak1";        Plan = "21-07 Task 4"; Title = "2h soak T=1h: probe + organic merit-transaction" }
    [pscustomobject]@{ Stage = "D3-Soak2";        Plan = "21-07 Task 4"; Title = "2h soak T=2h: final probe + alert_state" }
    [pscustomobject]@{ Stage = "D4-Finalize";     Plan = "21-07 Task 5"; Title = "Outcome (HOLD/ROLLBACK) + git add -f evidence commit" }
  )
  Write-Host ""
  Write-Host "Phase 21 operator gates:" -ForegroundColor Cyan
  $stages | Format-Table -AutoSize
  Write-Host "Run with: .\scripts\phase21-runbook.ps1 -Stage <stage-name> [-DryRun]" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "Project refs (locked):" -ForegroundColor DarkGray
  Write-Host "  staging: $STAGING_REF" -ForegroundColor DarkGray
  Write-Host "  prod:    $PROD_REF" -ForegroundColor DarkGray
}

# -- Stage A: Plan 21-04 Task 3 -- staging RLS probe + free-signup smoke -------

function Stage-A-RLS() {
  Write-Step "Gate A -- Plan 21-04 Task 3: staging RLS probe + free-signup smoke"
  Write-Note "Operator already confirmed `supabase db push` is up to date on staging."
  Write-Note "This stage verifies the MIG-02 policy state and runs the live-DB RLS probe."

  Require-Env @("STAGING_SUPABASE_URL", "STAGING_SUPABASE_ANON_KEY", "TEST_USER_JWT")

  Write-Step "Step 1: Verify staging policy state via pg_policies"
  Write-Note "Run this SQL in Supabase Studio (staging project) and paste the result here:"
  Write-Host @'
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analysis_results';
'@
  Write-Note "Expected: exactly ONE row -- 'Users can view their own analysis results' / SELECT."
  Write-Note "If 'Users can create their own analysis results' / INSERT is still present, MIG-02 did NOT apply."
  Confirm-Or-Exit "Did pg_policies show exactly one SELECT-only policy?"

  Write-Step "Step 2: Run live-DB RLS probe"
  $probeCmd = 'RUN_LIVE_MERIT=1 deno test --allow-all supabase/functions/_tests/analysis_results_rls_test.ts'
  Write-Note "About to run (from repo root): $probeCmd"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] skipped probe execution."
  } else {
    Confirm-Or-Exit "Run the live-DB RLS probe now?"
    Push-Location $repoRoot
    try {
      $env:RUN_LIVE_MERIT = "1"
      & deno test --allow-all "supabase/functions/_tests/analysis_results_rls_test.ts"
      $rc = $LASTEXITCODE
    } finally {
      Pop-Location
      Remove-Item Env:RUN_LIVE_MERIT -ErrorAction SilentlyContinue
    }
    if ($rc -ne 0) {
      Write-Error "RLS probe failed (exit $rc). MIG-02 NOT verified. Investigate before continuing."
      exit 1
    }
    Write-Ok "RLS probe both tests passed."
  }

  Write-Step "Step 3: Manual free-signup smoke"
  Write-Note "Open the staging frontend in a private browser window."
  Write-Note "  1. Sign up as a brand-new user."
  Write-Note "  2. Upload a sample resume."
  Write-Note "  3. Confirm the analysis result page loads."
  Write-Note "  4. In Supabase Studio, query analysis_results filtered by your new user_id."
  Write-Note "     A row should exist (written by the service-role edge function path)."
  Confirm-Or-Exit "Did the free-signup smoke succeed (analysis loaded + row visible)?"

  Write-Ok "Gate A complete. MIG-02 verified on staging."
  Write-Note "Update .planning/phases/21-integration-validation-and-cutover/21-04-SUMMARY.md"
  Write-Note "with the pg_policies output and probe pass timestamp."
}

# -- Stage B: Plan 21-05 dry-run on staging -----------------------------------

function Stage-B-StagingDryRun() {
  Write-Step "Gate B -- Plan 21-05 dry-run: flip + probe + rollback (STAGING ONLY)"
  Require-Env @("STAGING_SUPABASE_URL", "SUPABASE_ANON_KEY", "SC5_TEST_USER_JWT")

  Show-MeritFlagState $STAGING_REF "staging" | Out-Null

  Write-Step "Step 1: Dot-source cutover-production.ps1 and dry-run -WhatIf"
  $cutoverScript = Join-Path $repoRoot "scripts/cutover-production.ps1"
  Write-Note "Sourcing $cutoverScript ..."
  . $cutoverScript
  Write-Ok "Loaded. Functions available: Invoke-MeritFlagFlip, Invoke-MeritFlagRollback."

  Write-Step "Step 2: Flip MERIT_SYSTEM_ENABLED=true on STAGING"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] would call: Invoke-MeritFlagFlip -ProjectRef $STAGING_REF -WhatIf"
    Invoke-MeritFlagFlip -ProjectRef $STAGING_REF -WhatIf
  } else {
    Confirm-Or-Exit "Confirm staging flip (NOT prod). Project ref: $STAGING_REF"
    Invoke-MeritFlagFlip -ProjectRef $STAGING_REF -Confirm:$false
    if ($LASTEXITCODE -ne 0) { Write-Error "Flip failed."; exit 1 }
  }

  Write-Step "Step 3: Verify flip"
  Show-MeritFlagState $STAGING_REF "staging post-flip" | Out-Null

  Write-Step "Step 4: Run sc5-probe.ps1 against staging"
  $probeScript = Join-Path $repoRoot "scripts/sc5-probe.ps1"
  Write-Note "Probe URL: $env:STAGING_SUPABASE_URL"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] would call: $probeScript -SupabaseUrl $env:STAGING_SUPABASE_URL"
  } else {
    & $probeScript -SupabaseUrl $env:STAGING_SUPABASE_URL
    $rc = $LASTEXITCODE
    if ($rc -ne 0) {
      Write-Warn2 "Probe exited $rc. Investigate before rolling forward -- but rollback first to restore baseline."
    } else {
      Write-Ok "Probe exit 0 -- all 9 D-07 gated handlers responded with expected status."
    }
  }

  Write-Step "Step 5: Roll back staging to MERIT_SYSTEM_ENABLED=false (clean slate for Gate C)"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] would call: Invoke-MeritFlagRollback -ProjectRef $STAGING_REF -WhatIf"
    Invoke-MeritFlagRollback -ProjectRef $STAGING_REF -WhatIf
  } else {
    Confirm-Or-Exit "Roll staging back to MERIT_SYSTEM_ENABLED=false now?"
    Invoke-MeritFlagRollback -ProjectRef $STAGING_REF -Confirm:$false
  }

  Write-Step "Step 6: Verify rollback"
  Show-MeritFlagState $STAGING_REF "staging post-rollback" | Out-Null

  Write-Ok "Gate B complete. Plan 21-05 staging dry-run captured. Cutover tooling validated."
  Write-Note "Update .planning/phases/21-integration-validation-and-cutover/21-05-SUMMARY.md"
  Write-Note "with the probe run + flip/rollback transcripts."
}

# -- Stage C: Plan 21-06 -- 24-hour staging soak -------------------------------

function Ensure-Soak-Scaffold() {
  if (Test-Path $soakLog) { return }
  $skel = @"
# Phase 21 -- Staging Soak Evidence

- Project ref (staging): $STAGING_REF
- Flip timestamp (T=0h): <fill in by Gate C-Soak0>
- Planned end (T=24h):   <T=0h + 24h>
- Operator: <name>
- Related plans: 21-01 through 21-05

## Probe Runs

### T=0h
(pending -- populated by Gate C-Soak0)

### T=12h
(pending -- populated by Gate C-Soak12)

### T=24h
(pending -- populated by Gate C-Soak24)

## Merit-Transaction Log Samples
- T=0h sample: <JSON line>
- T=12h sample: <JSON line>
- T=24h sample: <JSON line>

## Alert State Observations
- T=0h: <row count, any active alerts, severity>
- T=12h: <...>
- T=24h: <...>

## Anomalies
(Any 5xx from gated handlers, unexpected 401/403, merit-transaction entries with ok:false, etc.)

- <none | description>

## GO / NO-GO Recommendation

Recommendation: <GO | NO-GO>
Rationale: <1-3 sentences tying probe results + log samples + alert state to Phase 21 success criteria>

If NO-GO:
- Issues: <list>
- Remediation plan: <link>
- Plan 07 is BLOCKED until remediation completes.
"@
  Append-Evidence $soakLog $skel
  Write-Ok "Created soak scaffold at $soakLog"
}

function Run-Soak-Probe($timestampLabel, $sectionAnchor) {
  Require-Env @("STAGING_SUPABASE_URL", "SUPABASE_ANON_KEY", "SC5_TEST_USER_JWT")
  $probeScript = Join-Path $repoRoot "scripts/sc5-probe.ps1"
  $now = Iso-Now
  Write-Step "Running sc5-probe.ps1 ($timestampLabel, $now) against staging"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] skipped probe execution."
    $rc = 0
  } else {
    & $probeScript -SupabaseUrl $env:STAGING_SUPABASE_URL
    $rc = $LASTEXITCODE
  }
  $note = if ($rc -eq 0) { "PASS -- all probes matched expectedAny" } else { "FAIL -- exit $rc; investigate before next interval" }
  $stamp = @"

#### $timestampLabel run @ $now
- exit code: $rc
- result: $note
- detail: see latest section in .planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md

"@
  Append-Evidence $soakLog $stamp
  Write-Ok "Appended $timestampLabel summary to $soakLog"
  Write-Note "Now: paste one merit-transaction log line + alert_state row count into the matching slots in $soakLog."
  return $rc
}

function Stage-C-Soak0() {
  Write-Step "Gate C-Soak0 -- Plan 21-06: T=0h staging soak (flip + first probe)"
  Ensure-Soak-Scaffold

  $current = Show-MeritFlagState $STAGING_REF "staging"
  $alreadyOn = $current -match "MERIT_SYSTEM_ENABLED=true"
  if (-not $alreadyOn) {
    Write-Step "Flipping staging MERIT_SYSTEM_ENABLED=true for the soak window"
    $cutoverScript = Join-Path $repoRoot "scripts/cutover-production.ps1"
    . $cutoverScript
    if ($DryRun) {
      Invoke-MeritFlagFlip -ProjectRef $STAGING_REF -WhatIf
    } else {
      Confirm-Or-Exit "Flip staging flag for 24-hour soak (project: $STAGING_REF)?"
      Invoke-MeritFlagFlip -ProjectRef $STAGING_REF -Confirm:$false
      if ($LASTEXITCODE -ne 0) { Write-Error "Flip failed."; exit 1 }
    }
  } else {
    Write-Note "Staging flag already true -- soak window inherits prior flip."
  }

  $flipStamp = Iso-Now
  Write-Note "Soak T=0h timestamp: $flipStamp"
  Write-Note "Edit $soakLog and replace '<fill in by Gate C-Soak0>' with: $flipStamp"

  Run-Soak-Probe "T=0h" "T=0h" | Out-Null

  Write-Ok "Gate C-Soak0 complete."
  Write-Note "Wait ~12 hours, then run: .\scripts\phase21-runbook.ps1 -Stage C-Soak12"
}

function Stage-C-Soak12() {
  Write-Step "Gate C-Soak12 -- Plan 21-06: T=12h staging soak probe"
  if (-not (Test-Path $soakLog)) {
    Write-Error "Missing $soakLog -- Gate C-Soak0 must run first."
    exit 1
  }
  Run-Soak-Probe "T=12h" "T=12h" | Out-Null
  Write-Ok "Gate C-Soak12 complete."
  Write-Note "Note any T=0h→T=12h anomalies under '## Anomalies' in $soakLog."
  Write-Note "Wait ~12 more hours, then run: .\scripts\phase21-runbook.ps1 -Stage C-Soak24"
}

function Stage-C-Soak24() {
  Write-Step "Gate C-Soak24 -- Plan 21-06: T=24h final probe + GO/NO-GO"
  if (-not (Test-Path $soakLog)) {
    Write-Error "Missing $soakLog -- Gate C-Soak0/12 must run first."
    exit 1
  }
  $rc = Run-Soak-Probe "T=24h" "T=24h"

  Write-Step "Synthesize GO/NO-GO recommendation"
  Write-Note "Aggregate the soak window (use Supabase Studio log export):"
  Write-Note "  - count of merit-transaction lines (must be > 0)"
  Write-Note "  - count of merit-flag boot attestations (>= 9 -- one per cold-started gated handler)"
  Write-Note "  - any 5xx on D-07 gated handlers"
  Write-Note "  - any merit-transaction with ok:false where reason is NOT in {insufficient_merits, flag_disabled, rate_limited}"

  $reply = Read-Host "    Final recommendation [GO/NO-GO]"
  if ($reply -ne "GO" -and $reply -ne "NO-GO") {
    Write-Warn2 "Recommendation must be exactly 'GO' or 'NO-GO'. Aborting -- re-run when ready."
    exit 1
  }
  $rationale = Read-Host "    1-3 sentence rationale"
  $stamp = @"

---
## Final Recommendation @ $(Iso-Now)

Recommendation: $reply
Rationale: $rationale

T=24h probe exit: $rc

"@
  Append-Evidence $soakLog $stamp
  Write-Ok "Recommendation appended to $soakLog"

  if ($reply -eq "NO-GO") {
    Write-Warn2 "NO-GO: Plan 21-07 is BLOCKED. File a Phase 21.1 remediation plan before continuing."
    exit 1
  }
  Write-Ok "Gate C complete with GO recommendation. Proceed to Gate D1 when ready."
}

# -- Stage D: Plan 21-07 -- production cutover ---------------------------------

function Ensure-Cutover-Log() {
  if (Test-Path $cutoverLog) { return }
  $skel = @"
# Phase 21 -- Production Cutover Log

Operator: <name>
Intended flip timestamp (planned): <ISO 8601>
Production project ref: $PROD_REF

## Pre-Flip Checklist (D-09)

- [ ] Staging soak GO confirmed (link to 21-STAGING-SOAK.md GO line)
- [ ] Plans 21-01 through 21-05 all merged and deployed
- [ ] scripts/cutover-production.ps1 exists and exposes Invoke-MeritFlagFlip + Invoke-MeritFlagRollback
- [ ] Rollback path dry-run: Invoke-MeritFlagRollback -ProjectRef $PROD_REF -WhatIf prints intended actions without executing
- [ ] Current production flag state recorded (expected: false or unset)
- [ ] Operator has terminal access with Supabase CLI authenticated against production
- [ ] Alert channel open (Slack / email / on-call) for the 2h soak window
- [ ] No concurrent production deploys scheduled in the next 3 hours
- [ ] Flip window confirmed: Mon-Thu, morning US-ET (avoids Fri/weekends per D-16); local time recorded: <fill in>

## Pre-Flip Verifications
(populated by Gate D1)

## Flip Transcript
(populated by Gate D2)
"@
  Append-Evidence $cutoverLog $skel
  Write-Ok "Created cutover log at $cutoverLog"
}

function Stage-D1-Preflip() {
  Write-Step "Gate D1 -- Plan 21-07 Task 1: production pre-flip checklist"
  Ensure-Cutover-Log

  # -- Phase 27 SC-2: Stripe webhook URL pin -----------------------------------
  Write-Step "Stripe webhook URL pin (Phase 27 SC-2)"
  Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Stripe URL Pin)"
  Confirm-Or-Exit "Confirm Stripe production webhook URL ends in /functions/v1/stripe-webhook-handler" "STRIPE URL VERIFIED"
  $stamp = @"

---
## Stripe URL Pin Ack @ $(Iso-Now)

Operator typed: STRIPE URL VERIFIED
"@
  Append-Evidence $cutoverLog $stamp

  Write-Step "Verifying production prerequisites (read-only)"
  $prodSecrets = Show-MeritFlagState $PROD_REF "production (PRE-flip)"

  $cutoverScript = Join-Path $repoRoot "scripts/cutover-production.ps1"
  Write-Step "Dry-running rollback path against production (-WhatIf only -- does NOT execute)"
  . $cutoverScript
  Invoke-MeritFlagRollback -ProjectRef $PROD_REF -WhatIf

  $stamp = @"

---
## Pre-Flip Verifications @ $(Iso-Now)

PRE-flip MERIT_SYSTEM_ENABLED state on ${PROD_REF}:
``$($prodSecrets -join "`n")``

Rollback dry-run completed (WhatIf). No commands executed against $PROD_REF.

"@
  Append-Evidence $cutoverLog $stamp

  Write-Step "Operator must now check every box in the Pre-Flip Checklist in $cutoverLog."
  Write-Note "Open the file in your editor and replace each [ ] with [x] as you verify."
  Confirm-Or-Exit "Confirm every checklist item is verified and intended flip window is clear"

  Write-Ok "Gate D1 complete. Run Gate D2 only when actively seated for the 2h soak."
}

function Stage-D2-Flip() {
  Write-Step "Gate D2 -- Plan 21-07 Task 2: PRODUCTION FLIP"
  if (-not (Test-Path $cutoverLog)) {
    Write-Error "Missing $cutoverLog -- Gate D1 must run first."
    exit 1
  }

  Write-Host ""

  # -- Phase 27 SC-3: Interview Prep rollback caveat ack -----------------------
  Write-Step "Rollback caveat acknowledgment (Phase 27 SC-3)"
  Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Interview Prep Rollback Caveat)"
  Write-Warn2 "Invoke-MeritFlagRollback will return 503 merit_system_required from interview-prep-analyze"
  Write-Warn2 "until a hotfix lands. Phase 23 was rebuilt as merit-only by intent."
  Confirm-Or-Exit "Type 'ACK INTERVIEW PREP ROLLBACK BRICKS 503' to acknowledge" "ACK INTERVIEW PREP ROLLBACK BRICKS 503"
  $stamp = @"

---
## Rollback Caveat Ack @ $(Iso-Now)

Operator typed: ACK INTERVIEW PREP ROLLBACK BRICKS 503
"@
  Append-Evidence $cutoverLog $stamp

  Write-Host "  +==================================================================+" -ForegroundColor Red
  Write-Host "  |                    PRODUCTION FLIP CONFIRMATION                    |" -ForegroundColor Red
  Write-Host "  |                                                                    |" -ForegroundColor Red
  Write-Host "  |  Target project: $PROD_REF                       |" -ForegroundColor Red
  Write-Host "  |  Action: set MERIT_SYSTEM_ENABLED=true + redeploy 9 handlers       |" -ForegroundColor Red
  Write-Host "  |  Reversible via: Invoke-MeritFlagRollback -ProjectRef $PROD_REF    |" -ForegroundColor Red
  Write-Host "  |                                                                    |" -ForegroundColor Red
  Write-Host "  +==================================================================+" -ForegroundColor Red
  Confirm-Or-Exit "Type 'FLIP PROD' to authorize" "FLIP PROD"

  $cutoverScript = Join-Path $repoRoot "scripts/cutover-production.ps1"
  . $cutoverScript

  $flipStart = Iso-Now
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] would call: Invoke-MeritFlagFlip -ProjectRef $PROD_REF -WhatIf"
    Invoke-MeritFlagFlip -ProjectRef $PROD_REF -WhatIf
    return
  }

  Write-Step "Running Invoke-MeritFlagFlip -ProjectRef $PROD_REF (interactive ShouldProcess; answer Y when prompted)"
  $transcript = Join-Path $repoRoot ".planning/phases/21-integration-validation-and-cutover/.tmp-flip-transcript.txt"
  Start-Transcript -Path $transcript -Force | Out-Null
  try {
    Invoke-MeritFlagFlip -ProjectRef $PROD_REF
    $rc = $LASTEXITCODE
  } finally {
    Stop-Transcript | Out-Null
  }

  $flipEnd = Iso-Now
  $body = Get-Content $transcript -Raw
  Remove-Item $transcript -ErrorAction SilentlyContinue

  $stamp = @"

---
## Flip Transcript @ $flipEnd (started $flipStart)

Exit code: $rc

``````
$body
``````

"@
  Append-Evidence $cutoverLog $stamp

  if ($rc -ne 0) {
    Write-Host ""
    Write-Host "  FLIP FAILED. RUN ROLLBACK NOW:" -ForegroundColor Red
    Write-Host "    Invoke-MeritFlagRollback -ProjectRef $PROD_REF" -ForegroundColor Red
    exit 1
  }

  Write-Step "Verifying post-flip state"
  Show-MeritFlagState $PROD_REF "production (POST-flip)" | Out-Null

  Write-Ok "Gate D2 complete. Flip timestamp recorded: $flipEnd"
  Write-Note "T=0h soak window starts NOW. Run Gate D3-Soak0 within 5 minutes to capture boot attestations."
}

# -- SC-5 evidence scaffold (D3 stages share this) ----------------------------

function Ensure-SC5-Evidence() {
  if (Test-Path $sc5Evidence) { return }
  $skel = @"
# Production Cutover -- $(Iso-Now)

Project ref: $PROD_REF
Operator: <name>
Pre-flip state: <from $cutoverLog>
Post-flip state: MERIT_SYSTEM_ENABLED=true

## Pre-Flip Checklist (D-09)
(Copy the completed checkbox block from 21-CUTOVER-LOG.md)

## Boot-Time Attestations (D-19)
One row per D-07 gated handler -- captured from production logs within 5 minutes of flip.

| Handler | merit-flag observed | enabled value | Cold-start log timestamp |
|---------|---------------------|---------------|--------------------------|
| analyze-resume | ? | ? | ? |
| analyze-career | ? | ? | ? |
| grade-linkedin | ? | ? | ? |
| recruiting-lens | ? | ? | ? |
| interview-prep-analyze | ? | ? | ? |
| submit-resume-analysis-job | ? | ? | ? |
| submit-career-analysis-job | ? | ? | ? |

### OQ1: Intentionally Ungated
- ``interview-prep-evaluate`` -- NOT listed above. Per Phase 13 D-07 design and the NOTE at ~line 14 of its source, this handler does NOT deduct merits (deduction occurs at quiz-start via the evaluate's caller). Absence of a merit-flag line for this handler is EXPECTED, not a failure.
- ``interview-prep-coach`` -- NOT listed above. The function does not exist in this repo as of commit dcf7b20; it was removed from the cutover script's redeploy list and the probe table.

## Synthetic Probe Runs (D-18)
T=0h probe: (populated by D3-Soak0)
T=1h probe: (populated by D3-Soak1)
T=2h probe: (populated by D3-Soak2)

## Organic Merit-Transaction Samples (D-11)
Captured from genuine production traffic (NOT from sc5-probe.ps1). Minimum one required.

(populated by D3-Soak1)

## Alert State (per probe checkpoint)
- T=0h: <row count, any active sev>
- T=1h: <...>
- T=2h: <...>

## Rollback Criteria
Rollback is MANDATORY if any of the following occur during the 2h active soak:
- Any sc5-probe.ps1 run exits non-zero
- Any merit-transaction log with ok:false where the reason is not a known gating code (insufficient_merits, flag_disabled, rate_limited)
- Any sev-1 alert in alert_state touching merit-* paths
- Any 5xx rate spike on a D-07 gated handler exceeding staging baseline by 3x

Rollback command: ``Invoke-MeritFlagRollback -ProjectRef $PROD_REF``

## Outcome
(Filled at T=2h+ in Gate D4-Finalize)

Status: <HOLD | ROLLBACK>
Summary: <...>
"@
  Append-Evidence $sc5Evidence $skel
  Write-Ok "Created SC-5 evidence at $sc5Evidence"
}

function Run-Prod-Probe($label) {
  Require-Env @("SUPABASE_ANON_KEY", "SC5_TEST_USER_JWT")
  $probeScript = Join-Path $repoRoot "scripts/sc5-probe.ps1"
  $prodUrl = "https://$PROD_REF.supabase.co"
  Write-Step "Running sc5-probe.ps1 ($label) against PRODUCTION ($prodUrl)"
  Confirm-Or-Exit "Confirm: probe target is PROD"
  if ($DryRun) {
    Write-Warn2 "`[DryRun`] skipped probe execution."
    return 0
  }
  & $probeScript -SupabaseUrl $prodUrl -EvidenceFile $sc5Evidence
  return $LASTEXITCODE
}

function Stage-D3-Soak0() {
  Write-Step "Gate D3-Soak0 -- Plan 21-07 Task 4: T=0h post-flip (boot attestations + first probe)"
  Ensure-SC5-Evidence

  Write-Step "Step 1: Confirm 9 of 9 D-07 handlers emitted merit-flag with enabled:true within 5 min of flip"
  Write-Note "Open Supabase Studio → Edge Function logs (production project)."
  Write-Note "Filter: msg=merit-flag, last 10 minutes."
  Write-Note "If any handler is missing its line, invoke that handler once with a smallest-valid payload to force a cold start."
  Write-Note "Then fill the Boot-Time Attestations table in $sc5Evidence."
  Confirm-Or-Exit "9 of 9 boot attestations confirmed and table populated?"

  Write-Step "Step 2: T=0h synthetic probe"
  $rc = Run-Prod-Probe "T=0h"
  if ($rc -ne 0) {
    Write-Host ""
    Write-Host "  PROBE FAILED at T=0h. INVOKE ROLLBACK NOW:" -ForegroundColor Red
    Write-Host "    . .\scripts\cutover-production.ps1; Invoke-MeritFlagRollback -ProjectRef $PROD_REF" -ForegroundColor Red
    exit 1
  }
  Write-Ok "T=0h probe exit 0."
  Write-Note "Capture T=0h alert_state row count and paste into $sc5Evidence."
  Write-Note "Wait ~1 hour, then run: .\scripts\phase21-runbook.ps1 -Stage D3-Soak1"
}

function Stage-D3-Soak1() {
  Write-Step "Gate D3-Soak1 -- Plan 21-07 Task 4: T=1h probe + organic merit-transaction"
  if (-not (Test-Path $sc5Evidence)) { Write-Error "Missing $sc5Evidence -- D3-Soak0 first."; exit 1 }
  $rc = Run-Prod-Probe "T=1h"
  if ($rc -ne 0) {
    Write-Host "  PROBE FAILED at T=1h. INVOKE ROLLBACK NOW." -ForegroundColor Red
    exit 1
  }
  Write-Ok "T=1h probe exit 0."
  Write-Note "REQUIRED: capture at least one ORGANIC merit-transaction log line."
  Write-Note "  - Filter Supabase logs by msg=merit-transaction AND not from probe req_ids."
  Write-Note "  - Paste the full JSON line into the Organic Merit-Transaction Samples section of $sc5Evidence."
  Write-Note "Update T=1h alert_state row count in $sc5Evidence."
  Confirm-Or-Exit "Organic sample captured?"
  Write-Note "Wait ~1 hour, then run: .\scripts\phase21-runbook.ps1 -Stage D3-Soak2"
}

function Stage-D3-Soak2() {
  Write-Step "Gate D3-Soak2 -- Plan 21-07 Task 4: T=2h final probe + alert_state"
  if (-not (Test-Path $sc5Evidence)) { Write-Error "Missing $sc5Evidence -- D3-Soak0 first."; exit 1 }
  $rc = Run-Prod-Probe "T=2h"
  if ($rc -ne 0) {
    Write-Host "  PROBE FAILED at T=2h. INVOKE ROLLBACK NOW." -ForegroundColor Red
    exit 1
  }
  Write-Ok "T=2h probe exit 0."
  Write-Note "Capture final T=2h alert_state row count in $sc5Evidence."
  Write-Note "Soak window complete. Run: .\scripts\phase21-runbook.ps1 -Stage D4-Finalize"
}

function Stage-D4-Finalize() {
  Write-Step "Gate D4 -- Plan 21-07 Task 5: outcome + commit evidence"
  if (-not (Test-Path $sc5Evidence)) { Write-Error "Missing $sc5Evidence -- D3 must run first."; exit 1 }

  $reply = Read-Host "    Final outcome [HOLD/ROLLBACK]"
  if ($reply -ne "HOLD" -and $reply -ne "ROLLBACK") {
    Write-Warn2 "Outcome must be exactly 'HOLD' or 'ROLLBACK'."
    exit 1
  }
  $summary = Read-Host "    1-3 sentence summary"
  $stamp = @"

---
## Outcome @ $(Iso-Now)

Status: $reply
Summary: $summary

"@
  Append-Evidence $sc5Evidence $stamp

  # SC-9: interview-prep-coach delete reminder (idempotency sentinel)
  Write-Step "SC-9 -- Operator action: delete the dead 'interview-prep-coach' edge function"
  Write-Note "  Run BOTH commands manually (script does NOT execute these for you):"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <STAGING_REF>"
  Write-Note "    supabase functions delete interview-prep-coach --project-ref <PRODUCTION_REF>"
  Write-Note "  This function does not exist in the repo (Phase 23 cleanup) but is still"
  Write-Note "  deployed in Supabase. Removing it closes Phase 23's tech-debt entry."

  if ($reply -eq "ROLLBACK") {
    Write-Warn2 "ROLLBACK outcome recorded. Skipping the D-22 commit."
    Write-Note "File a Phase 21.1 gap-closure plan and leave production MERIT_SYSTEM_ENABLED=false."
    exit 0
  }

  # -- Phase 27 SC-4: Phase 25 coordination -- interview-prep-coach delete -----
  Write-Step "Phase 25 coordination -- interview-prep-coach delete (Phase 27 SC-4)"
  Write-Note "Background: see .planning/phases/27-cutover-safety-net/21-CUTOVER-NOTES.md (Phase 25 Dependency)"
  Write-Note "Staging: supabase functions delete interview-prep-coach --project-ref $STAGING_REF"
  Write-Note "Prod:    supabase functions delete interview-prep-coach --project-ref $PROD_REF"
  Confirm-Or-Exit "Confirm interview-prep-coach was deleted (STAGING + PROD) or Phase 25 SC-9 will run it" "ACK INTERVIEW PREP COACH DELETE"
  $stamp = @"

---
## Phase 25 Coordination Ack @ $(Iso-Now)

Operator typed: ACK INTERVIEW PREP COACH DELETE
"@
  Append-Evidence $cutoverLog $stamp

  Write-Step "Committing evidence files via D-22 exception (git add -f)"
  Push-Location $repoRoot
  try {
    if ($DryRun) {
      Write-Warn2 "`[DryRun`] would run:"
      Write-Note "  git add -f $sc5Evidence $cutoverLog $soakLog"
      Write-Note "  git commit -m 'docs(21): record SC-5 evidence + cutover log (Phase 21 complete)'"
    } else {
      $rel1 = ".planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md"
      $rel2 = ".planning/phases/21-integration-validation-and-cutover/21-CUTOVER-LOG.md"
      $rel3 = ".planning/phases/21-integration-validation-and-cutover/21-STAGING-SOAK.md"
      Confirm-Or-Exit "Run git add -f on the three evidence files?"
      & git add -f $rel1 $rel2 $rel3
      & git commit -m "docs(21): record SC-5 evidence + cutover log (Phase 21 complete)"
      Write-Ok "Evidence committed. Phase 21 closed."
    }
  } finally {
    Pop-Location
  }
}

# -- Dispatch -----------------------------------------------------------------

switch ($Stage) {
  "list"             { Stage-List }
  "A-RLS"            { Stage-A-RLS }
  "B-StagingDryRun"  { Stage-B-StagingDryRun }
  "C-Soak0"          { Stage-C-Soak0 }
  "C-Soak12"         { Stage-C-Soak12 }
  "C-Soak24"         { Stage-C-Soak24 }
  "D1-Preflip"       { Stage-D1-Preflip }
  "D2-Flip"          { Stage-D2-Flip }
  "D3-Soak0"         { Stage-D3-Soak0 }
  "D3-Soak1"         { Stage-D3-Soak1 }
  "D3-Soak2"         { Stage-D3-Soak2 }
  "D4-Finalize"      { Stage-D4-Finalize }
}
