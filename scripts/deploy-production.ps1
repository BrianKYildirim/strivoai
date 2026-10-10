# Backward-compatible shim -> deploy.ps1 -Env production
param(
  [string[]]$Functions
)

$ErrorActionPreference = "Stop"

if ($PSBoundParameters.ContainsKey("Functions")) {
  & "$PSScriptRoot/deploy.ps1" -Env production -Functions $Functions
} else {
  & "$PSScriptRoot/deploy.ps1" -Env production
}
