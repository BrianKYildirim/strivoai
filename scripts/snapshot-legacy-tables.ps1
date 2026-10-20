<#
.SYNOPSIS
  Phase 10 / MIG-04 — capture read-only snapshot of legacy credit-ledger tables.
  Run BEFORE and AFTER applying the Phase 10 migration. Diff the two outputs to
  prove that usage_tracking / credit_usage / ai_usage are unmodified.

.DESCRIPTION
  For each legacy table, writes:
    - row count
    - md5 hash of a deterministic string_agg of all rows ordered by id
  into the output file. If a legacy table does not exist in the target DB,
  emits a MISSING marker (which is itself information — diff must match).

.PARAMETER DatabaseUrl
  Postgres connection string. Defaults to `$env:SUPABASE_DB_URL`.

.PARAMETER OutputFile
  Path to write the snapshot to. Defaults to `.snapshot-legacy.txt` at repo root.

.EXAMPLE
  .\scripts\snapshot-legacy-tables.ps1 -OutputFile .snapshot-legacy-pre.txt
  # ... run migration ...
  .\scripts\snapshot-legacy-tables.ps1 -OutputFile .snapshot-legacy-post.txt
  # Then:
  diff .snapshot-legacy-pre.txt .snapshot-legacy-post.txt
#>

param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [string]$OutputFile = ".snapshot-legacy.txt"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  Write-Error "DatabaseUrl not set. Pass -DatabaseUrl or set `$env:SUPABASE_DB_URL."
  exit 1
}

# Legacy ledger tables that MUST remain untouched by Phase 10 (MIG-04).
$legacyTables = @("usage_tracking", "credit_usage", "ai_usage")

$lines = @()
$lines += "# Phase 10 legacy ledger snapshot"
$lines += "# Generated: $(Get-Date -Format 'o')"
$lines += "# DatabaseUrl: (redacted)"
$lines += ""

foreach ($table in $legacyTables) {
  Write-Host "Snapshotting $table ..."

  # Exists check
  $existsSql = "SELECT to_regclass('public.$table') IS NOT NULL AS present;"
  $existsOut = & psql $DatabaseUrl -Atc $existsSql 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Error "psql failed for exists-check on $table : $existsOut"
    exit 2
  }

  if ($existsOut.Trim() -ne "t") {
    $lines += "table=$table status=MISSING"
    continue
  }

  # Row count
  $countSql = "SELECT COUNT(*)::text FROM public.$table;"
  $countOut = & psql $DatabaseUrl -Atc $countSql
  if ($LASTEXITCODE -ne 0) { Write-Error "psql count failed for $table"; exit 3 }

  # Deterministic content hash: md5 of all columns concatenated per row, ordered by id
  # to_jsonb(t.*)::text is stable across psql versions and covers every column.
  $hashSql = @"
SELECT COALESCE(md5(string_agg(to_jsonb(t.*)::text, '|' ORDER BY t.id)), 'EMPTY')
FROM public.$table t;
"@
  $hashOut = & psql $DatabaseUrl -Atc $hashSql
  if ($LASTEXITCODE -ne 0) { Write-Error "psql hash failed for $table"; exit 4 }

  $lines += "table=$table status=PRESENT count=$($countOut.Trim()) md5=$($hashOut.Trim())"
}

$outputPath = Join-Path $repoRoot $OutputFile
$lines | Set-Content -Path $outputPath -Encoding UTF8

Write-Host "`nSnapshot written to: $outputPath"
Write-Host "Contents:"
Get-Content $outputPath | Write-Host
