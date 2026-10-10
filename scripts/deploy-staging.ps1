# Backward-compatible shim -> deploy.ps1 -Env staging
param(
  [string[]]$Functions
)

$ErrorActionPreference = "Stop"

if ($PSBoundParameters.ContainsKey("Functions")) {
  & "$PSScriptRoot/deploy.ps1" -Env staging -Functions $Functions
} else {
  & "$PSScriptRoot/deploy.ps1" -Env staging
}
