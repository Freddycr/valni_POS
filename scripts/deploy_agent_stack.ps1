param(
  [string]$EnvFile = "deploy/agent-stack.staging.env",
  [switch]$Detach
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EnvFile)) {
  throw "No existe archivo de entorno: $EnvFile"
}

$composeFile = "deploy/docker-compose.agent-stack.yml"
if (!(Test-Path $composeFile)) {
  throw "No existe compose file: $composeFile"
}

$cmd = @(
  "compose",
  "--env-file", $EnvFile,
  "-f", $composeFile,
  "up",
  "--build"
)

if ($Detach) {
  $cmd += "-d"
}

Write-Host "Ejecutando: docker $($cmd -join ' ')"
docker @cmd
if ($LASTEXITCODE -ne 0) {
  throw "docker compose up fallo con codigo $LASTEXITCODE"
}
