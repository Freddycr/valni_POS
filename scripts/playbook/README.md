# Ejecutables del Playbook (F0-F7)

## Prerrequisitos
- Node 18+
- `DATABASE_URL` (para fases F0/F4/F5/F6)
- `SUPABASE_SERVICE_ROLE_KEY` (para F23)
- Opcional `SUPABASE_URL` (default: proyecto actual)

## Orquestador (PowerShell)
```powershell
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F0 -CompanyId <COMPANY_ID>
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F1
node scripts/playbook/f2_stock_sync.mjs --run-dir backups/migration_runs/run_YYYYMMDD_HHMMSS --company-id <COMPANY_ID>
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F23 -RunDir backups/migration_runs/run_YYYYMMDD_HHMMSS -CompanyId <COMPANY_ID>
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F4 -CompanyId <COMPANY_ID>
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F5 -CompanyId <COMPANY_ID> -Dni 40143407
pwsh -File scripts/playbook/Invoke-GSheetSupabasePlaybook.ps1 -Phase F6 -CompanyId <COMPANY_ID>
```

## Scripts por fase
- `f0_preflight.mjs`: valida objetos y salud base/reporting.
- `f1_extract_snapshot.mjs`: extrae snapshot JSON desde Firebase legacy.
- `f2_stock_sync.mjs`: sincroniza SOLO stock (`products.stock_quantity` + `inventory_balances`) desde `products.json` (no toca ventas/clientes).
- `f2f3_load_snapshot.mjs`: carga snapshot a Supabase (upsert + rebuild items/pagos).
- `f4_reconcile.mjs`: reconciliacion de conteos y consistencia contable.
- `f5_qa_operaciones.mjs`: pruebas operativas por DNI/IMEI/dia.
- `f6_cutover_gate.mjs`: gate final go/no-go.
- `f7_rollback.ps1`: checklist de rollback rapido.

## SQL auxiliares
Carpeta `scripts/playbook/sql` contiene SQL para correr manualmente en Supabase SQL Editor:
- `F0_preflight.sql`
- `F4_reconciliation.sql`
- `F5_qa_operaciones.sql`

## Ejemplos directos (sin orquestador)
```powershell
node scripts/playbook/f0_preflight.mjs --company-id <COMPANY_ID>
node scripts/playbook/f1_extract_snapshot.mjs --firebase-base-url https://us-central1-registroventas-466719.cloudfunctions.net
node scripts/playbook/f2_stock_sync.mjs --run-dir backups/migration_runs/run_YYYYMMDD_HHMMSS --company-id <COMPANY_ID>
# Tip: si solo tienes 1 company, puedes omitir --company-id/--company-name y tomará la primera por created_at.
# Tip: si no quieres exportar secrets en la shell, usa --env-file .env.local (lee SUPABASE_SERVICE_ROLE_KEY desde ahí).
node scripts/playbook/f2f3_load_snapshot.mjs --run-dir backups/migration_runs/run_YYYYMMDD_HHMMSS --company-id <COMPANY_ID>
node scripts/playbook/f4_reconcile.mjs --company-id <COMPANY_ID>
node scripts/playbook/f5_qa_operaciones.mjs --company-id <COMPANY_ID> --imei 354196710049378
node scripts/playbook/f6_cutover_gate.mjs --company-id <COMPANY_ID>
```
