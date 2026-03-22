param(
  [string]$EnvFile = "deploy/agent-stack.staging.env"
)

$ErrorActionPreference = "Stop"

$composeFile = "deploy/docker-compose.agent-stack.yml"
if (!(Test-Path $composeFile)) {
  throw "No existe compose file: $composeFile"
}

$cmd = @(
  "compose",
  "--env-file", $EnvFile,
  "-f", $composeFile,
  "down"
)

Write-Host "Ejecutando: docker $($cmd -join ' ')"
docker @cmd
if ($LASTEXITCODE -ne 0) {
  throw "docker compose down fallo con codigo $LASTEXITCODE"
}
