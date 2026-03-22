param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("F0","F1","F23","F4","F5","F6","F7","ALL")]
  [string]$Phase,

  [Parameter(Mandatory = $false)]
  [string]$CompanyId,

  [Parameter(Mandatory = $false)]
  [string]$RunDir,

  [Parameter(Mandatory = $false)]
  [string]$FirebaseBaseUrl = "https://us-central1-registroventas-466719.cloudfunctions.net",

  [Parameter(Mandatory = $false)]
  [string]$Dni,

  [Parameter(Mandatory = $false)]
  [string]$Imei,

  [Parameter(Mandatory = $false)]
  [string]$Day
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param([string]$Command)
  Write-Host "> $Command" -ForegroundColor Yellow
  Invoke-Expression $Command
}

function Require-CompanyId {
  if (-not $CompanyId) {
    throw "CompanyId es obligatorio para esta fase."
  }
}

if ($Phase -eq "F0" -or $Phase -eq "ALL") {
  Invoke-Step "node scripts/playbook/f0_preflight.mjs --company-id $CompanyId"
}

if ($Phase -eq "F1" -or $Phase -eq "ALL") {
  Invoke-Step "node scripts/playbook/f1_extract_snapshot.mjs --firebase-base-url $FirebaseBaseUrl"
  if (-not $RunDir -and $Phase -eq "F1") {
    Write-Host "Tip: usa --RunDir para F23/F4/F5 posteriores." -ForegroundColor Cyan
  }
}

if ($Phase -eq "F23" -or $Phase -eq "ALL") {
  if (-not $RunDir) {
    throw "RunDir es obligatorio para F23 (ruta de snapshot)."
  }
  $cmd = "node scripts/playbook/f2f3_load_snapshot.mjs --run-dir `"$RunDir`""
  if ($CompanyId) { $cmd += " --company-id $CompanyId" }
  Invoke-Step $cmd
}

if ($Phase -eq "F4" -or $Phase -eq "ALL") {
  Require-CompanyId
  Invoke-Step "node scripts/playbook/f4_reconcile.mjs --company-id $CompanyId"
}

if ($Phase -eq "F5" -or $Phase -eq "ALL") {
  Require-CompanyId
  $cmd = "node scripts/playbook/f5_qa_operaciones.mjs --company-id $CompanyId"
  if ($Dni) { $cmd += " --dni $Dni" }
  if ($Imei) { $cmd += " --imei $Imei" }
  if ($Day) { $cmd += " --day $Day" }
  Invoke-Step $cmd
}

if ($Phase -eq "F6" -or $Phase -eq "ALL") {
  Require-CompanyId
  Invoke-Step "node scripts/playbook/f6_cutover_gate.mjs --company-id $CompanyId"
}

if ($Phase -eq "F7" -or $Phase -eq "ALL") {
  Invoke-Step "pwsh -File scripts/playbook/f7_rollback.ps1"
}

Write-Host "Playbook $Phase finalizado." -ForegroundColor Green
