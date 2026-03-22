param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot = ".",

  [Parameter(Mandatory = $false)]
  [switch]$DisableWidget
)

$ErrorActionPreference = "Stop"

Write-Host "=== F7 Rollback rapido ===" -ForegroundColor Yellow
Write-Host "1) Frontend: desactivar widget semantico." -ForegroundColor Cyan

$envProdPath = Join-Path $ProjectRoot ".env.production"
if ($DisableWidget -and (Test-Path $envProdPath)) {
  $content = Get-Content $envProdPath -Raw
  if ($content -match "VITE_SEMANTIC_WIDGET_ENABLED=") {
    $content = [regex]::Replace($content, "VITE_SEMANTIC_WIDGET_ENABLED=.*", "VITE_SEMANTIC_WIDGET_ENABLED=false")
  } else {
    $content = $content.TrimEnd() + "`nVITE_SEMANTIC_WIDGET_ENABLED=false`n"
  }
  Set-Content -Path $envProdPath -Value $content -Encoding UTF8
  Write-Host "- .env.production actualizado: VITE_SEMANTIC_WIDGET_ENABLED=false" -ForegroundColor Green
}

Write-Host "2) Redeploy Hosting (si aplica):" -ForegroundColor Cyan
Write-Host "   npm run build"
Write-Host "   firebase deploy --only hosting"

Write-Host "3) Mantener Cloud Run activo para diagnostico." -ForegroundColor Cyan
Write-Host "4) Si impacto severo: restaurar snapshot de Supabase y redeploy de version estable." -ForegroundColor Cyan
Write-Host "5) Revisar tabla public.agent_query_logs para causa raiz." -ForegroundColor Cyan

Write-Host "Rollback checklist completado." -ForegroundColor Green
