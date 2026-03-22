# Checklist de Cierre Operativo (POS + Supabase)

Fecha base: 2026-02-28  
Proyecto: `registro_ventas_gs/supabase_version`

## 1. Pre-Deploy

- [ ] Confirmar backup/snapshot reciente de la base.
- [ ] Confirmar Edge Functions desplegadas:
  - [ ] `create-user`
  - [ ] `admin-reset-user-password`
- [ ] Confirmar variable de build:
  - [ ] `VITE_SALES_RPC_MODE=canonical` en `.env.production`
- [ ] Confirmar que no hay sesión SQL abortada:
  - [ ] ejecutar `ROLLBACK;` antes de nuevos scripts.

## 2. Migraciones SQL (orden)

- [ ] `supabase/migrations/202602280001_cutover_preflight.sql`
- [ ] `supabase/migrations/202602280002_cutover_schema_hardening.sql`
- [ ] `supabase/migrations/202602280003_cutover_shifts_and_sales_rpcs.sql`
- [ ] `supabase/migrations/202602280004_cutover_constraints_validate.sql`
- [ ] `supabase/migrations/202602280005_cutover_postgrest_reload_and_smoke.sql`
- [ ] `supabase/migrations/202602280006_create_user_profile_company_guard.sql`
- [ ] `supabase/migrations/202602280007_sales_company_id_guards.sql`
- [ ] `supabase/migrations/202602280008_credits_company_id_guards.sql`

## 3. Build y Deploy Frontend

- [ ] Ejecutar `npm run build`.
- [ ] Desplegar artefacto `dist/`.
- [ ] Recarga dura en navegador (`Ctrl+F5`).

## 4. Smoke Test Funcional (obligatorio)

- [ ] Login exitoso.
- [ ] Crear usuario desde módulo Usuarios.
- [ ] Restablecer contraseña desde módulo Usuarios.
- [ ] Registrar venta POS contado.
- [ ] Registrar venta POS con pago mixto y parte a crédito.
- [ ] Verificar que la venta aparece en reportes.
- [ ] Verificar que el crédito aparece en Gestión de Créditos.
- [ ] Verificar abono de cuota (si aplica).

## 5. Verificación Técnica Rápida (SQL)

- [ ] `rpc_create_sale` canónica existe.
- [ ] `process_sale_atomic` no está duplicada ambiguamente.
- [ ] No hay `company_id` nulo en tablas críticas (`sales`, `sale_items`, `sale_payments`, `credits`, `credit_installments`).
- [ ] `NOTIFY pgrst, 'reload schema';` ejecutado después de cambios de funciones.

## 6. Monitoreo Post-Deploy (30-60 min)

- [ ] Consola frontend sin 400/401/403/404 en flujos críticos.
- [ ] Sin errores `PGRST202`, `function is not unique`, ni constraints de `company_id`.
- [ ] Confirmar 2-3 ventas reales completadas sin incidencia.

## 7. Rollback Rápido (si hay incidente)

- [ ] Cambiar inmediatamente a `VITE_SALES_RPC_MODE=compat`.
- [ ] Rebuild/deploy frontend.
- [ ] Reintentar flujo crítico.
- [ ] Si persiste: restaurar snapshot DB y volver a versión frontend previa estable.

## 8. Cierre Formal

- [ ] Registrar fecha/hora de despliegue.
- [ ] Registrar scripts ejecutados.
- [ ] Registrar resultado de smoke tests.
- [ ] Registrar responsable y observaciones finales.
