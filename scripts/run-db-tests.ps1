#Requires -Version 5.1
# pgTAP suite runner for Phase 11 merit RPCs.
# Mirrors scripts/run-edge-tests.ps1 shape for CI parity.
$ErrorActionPreference = 'Stop'

Write-Host "[run-db-tests] Running pgTAP suite under supabase/tests/database/"
supabase db test
if ($LASTEXITCODE -ne 0) {
  throw "pgTAP suite failed with exit code $LASTEXITCODE"
}
Write-Host "[run-db-tests] pgTAP suite passed"
