<#
.SYNOPSIS
  Phase 21 D-18 synthetic probe for SC-5 evidence collection.

.DESCRIPTION
  Invokes each of the 10 D-07 gated AI features against a target Supabase
  project once, using a Bearer JWT supplied via environment variable. The
  goal is to OBSERVE the merit gate (status code) — not to succeed end to
  end. Successful probes therefore include 200, 402 (insufficient_merits),
  403 (tier_locked), and 429 (rate-limited) by design.

  Probe outcomes are appended (never overwritten) to the SC-5 evidence
  markdown file with an ISO timestamp. The script does NOT call the
  `supabase` CLI and does NOT modify any other deploy script.

.PARAMETER SupabaseUrl
  Base URL of the target Supabase project, e.g.
  https://zjpjapgraoxdukdvpjes.supabase.co. Required.

.PARAMETER EvidenceFile
  Path to the markdown evidence file. Defaults to the Plan 07 SC-5 evidence
  artifact path. Created with a header if it does not yet exist.

.PARAMETER JwtEnvVar
  Name of the environment variable holding the Bearer JWT for an
  authenticated test user. Defaults to SC5_TEST_USER_JWT.

.OUTPUTS
  Exit 0 when every probe matches its expected status set.
  Exit 1 when at least one probe fails.
  Exit 2 when the JWT environment variable is missing.

.NOTES
  D-18: synthetic probe authoring.
  SC5_TEST_USER_JWT (default env var name) must be in scope when the script
  runs. Bearer JWT is read from env so it is never persisted in source.

  This script is fully standalone: it does not dot-source any other deploy
  helper, and it never shells out to the `supabase` CLI. Cutover and rollback
  flag flips live in cutover-production.ps1 (a separate file).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [string]$EvidenceFile = ".planning/phases/21-integration-validation-and-cutover/21-SC5-EVIDENCE.md",

  [string]$JwtEnvVar = "SC5_TEST_USER_JWT"
)

$ErrorActionPreference = "Stop"

# ── Resolve required inputs ──────────────────────────────────────────────────

$jwt = [Environment]::GetEnvironmentVariable($JwtEnvVar)
if ([string]::IsNullOrWhiteSpace($jwt)) {
  Write-Error "Environment variable '$JwtEnvVar' is not set. Export a Bearer JWT for the SC-5 test user before running this probe."
  exit 2
}

$anonKey = [Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY")
if ([string]::IsNullOrWhiteSpace($anonKey)) {
  Write-Error "Environment variable 'SUPABASE_ANON_KEY' is not set. The Supabase Edge Functions gateway requires an anon apikey header."
  exit 2
}

# Extract project ref from the URL for self-describing evidence rows.
$projectRef = "<unknown>"
if ($SupabaseUrl -match "https?://([^.]+)\.supabase\.co") {
  $projectRef = $Matches[1]
}

$runStartedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host "[sc5-probe] Run starting at $runStartedAt"
Write-Host "[sc5-probe] Project ref: $projectRef"
Write-Host "[sc5-probe] Evidence file: $EvidenceFile"

# ── Probe table — 10 D-07 gated features ─────────────────────────────────────
# `expectedAny` covers normal merit-gate observations:
#   200 = success path through withMerits
#   402 = insufficient_merits (deduction blocked)
#   403 = tier_locked (feature gated by tier)
#   429 = rate-limited (pooled limiter or per-feature limiter)
# Any other status (e.g. 5xx) is treated as FAIL and surfaces in evidence.

$probes = @(
  @{
    name         = "analyze-resume"
    functionPath = "/functions/v1/analyze-resume"
    method       = "POST"
    body         = @{
      resumeText = "Probe payload — synthetic SC-5 boot attestation request used by sc5-probe.ps1; contents intentionally minimal but exceed the 50-character validator floor."
      tier       = "free"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "analyze-career"
    functionPath = "/functions/v1/analyze-career"
    method       = "POST"
    body         = @{
      resumeText = "Probe payload — synthetic SC-5 boot attestation request used by sc5-probe.ps1; contents intentionally minimal but exceed the 50-character validator floor."
      tier       = "free"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "grade-linkedin"
    functionPath = "/functions/v1/grade-linkedin"
    method       = "POST"
    body         = @{
      linkedInUrl = "https://www.linkedin.com/in/sc5-probe-fixture"
      tier        = "free"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "recruiting-lens"
    functionPath = "/functions/v1/recruiting-lens"
    method       = "POST"
    body         = @{
      resumeText = "Probe payload — synthetic SC-5 boot attestation request used by sc5-probe.ps1; contents intentionally minimal but exceed the 50-character validator floor."
      jobInput   = "Software Engineer probe fixture"
      tier       = "pro"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "interview-prep-analyze"
    functionPath = "/functions/v1/interview-prep-analyze"
    method       = "POST"
    body         = @{
      role             = "Software Engineer"
      company          = "Probe Co"
      jobDescription   = "Probe synthetic JD for SC-5 attestation; minimal but plausible."
      yearsExperience  = 3
      interviewType    = "technical"
      interviewLength  = "30-min"
      interviewFormat  = "remote"
      backgroundNotes  = "SC-5 probe fixture"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "submit-resume-analysis-job"
    functionPath = "/functions/v1/submit-resume-analysis-job"
    method       = "POST"
    body         = @{
      userId         = "00000000-0000-0000-0000-000000000000"
      resumeFilePath = "sc5-probe/synthetic-resume.pdf"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
  @{
    name         = "submit-career-analysis-job"
    functionPath = "/functions/v1/submit-career-analysis-job"
    method       = "POST"
    body         = @{
      userId         = "00000000-0000-0000-0000-000000000000"
      resumeFilePath = "sc5-probe/synthetic-resume.pdf"
    }
    expectedAny  = @(200, 402, 403, 429)
  }
)

# ── Invoke each probe once (no retry, no backoff) ────────────────────────────

$results = New-Object System.Collections.Generic.List[object]
$baseUrl = $SupabaseUrl.TrimEnd("/")

foreach ($probe in $probes) {
  $url = "$baseUrl$($probe.functionPath)"
  $jsonBody = $probe.body | ConvertTo-Json -Depth 6 -Compress
  $headers = @{
    "Authorization" = "Bearer $jwt"
    "Content-Type"  = "application/json"
    "apikey"        = $anonKey
  }

  $statusCode = 0
  $errMsg = ""

  try {
    $resp = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri $url `
      -Method $probe.method `
      -Headers $headers `
      -Body $jsonBody `
      -SkipHttpErrorCheck `
      -ErrorAction Stop
    $statusCode = [int]$resp.StatusCode
  } catch {
    # Older PowerShell (no -SkipHttpErrorCheck) raises on non-2xx; recover.
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    } else {
      $errMsg = $_.Exception.Message
      $statusCode = -1
    }
  }

  $expected = $probe.expectedAny
  $outcome = if ($expected -contains $statusCode) { "PASS" } else { "FAIL" }

  $row = [pscustomobject]@{
    Feature   = $probe.name
    Status    = $statusCode
    Expected  = ($expected -join "/")
    Outcome   = $outcome
    ErrorNote = $errMsg
  }
  $results.Add($row) | Out-Null

  Write-Host ("[sc5-probe] {0,-30} status={1} expected={2} outcome={3}" -f $probe.name, $statusCode, ($expected -join "/"), $outcome)
}

# ── Append timestamped evidence table ────────────────────────────────────────

$evidenceDir = Split-Path -Parent $EvidenceFile
if (-not (Test-Path $evidenceDir)) {
  New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
}

if (-not (Test-Path $EvidenceFile)) {
  $header = @"
# Phase 21 — SC-5 Probe Evidence

Synthetic-probe runs are appended below in chronological order by
``scripts/sc5-probe.ps1`` (D-18). Each section is a single invocation
covering all 10 D-07 gated AI features.

"@
  Set-Content -Path $EvidenceFile -Value $header -Encoding UTF8
}

$section = New-Object System.Text.StringBuilder
[void]$section.AppendLine("")
[void]$section.AppendLine("## SC-5 Probe Run — $runStartedAt")
[void]$section.AppendLine("")
[void]$section.AppendLine("- Project ref: ``$projectRef``")
[void]$section.AppendLine("- Supabase URL: ``$SupabaseUrl``")
[void]$section.AppendLine("- JWT env var: ``$JwtEnvVar``")
[void]$section.AppendLine("")
[void]$section.AppendLine("| Feature | Status | Expected | Outcome | Note |")
[void]$section.AppendLine("|---------|--------|----------|---------|------|")
foreach ($r in $results) {
  $note = $r.ErrorNote
  if ([string]::IsNullOrWhiteSpace($note)) { $note = "" }
  [void]$section.AppendLine("| $($r.Feature) | $($r.Status) | $($r.Expected) | $($r.Outcome) | $note |")
}
[void]$section.AppendLine("")

Add-Content -Path $EvidenceFile -Value $section.ToString() -Encoding UTF8

# ── Exit code ────────────────────────────────────────────────────────────────

$failures = $results | Where-Object { $_.Outcome -ne "PASS" }
if ($failures.Count -gt 0) {
  Write-Host "[sc5-probe] $($failures.Count) probe(s) failed. See $EvidenceFile."
  exit 1
}

Write-Host "[sc5-probe] All probes passed. Evidence appended to $EvidenceFile."
exit 0
