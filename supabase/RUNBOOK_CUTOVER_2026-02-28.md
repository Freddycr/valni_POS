# Runbook Cutover (Minima Caida)

Objetivo: normalizar `companies/company_id`, estandarizar `pos_shifts` y dejar `rpc_create_sale` como contrato canonico sin interrumpir operacion mas de lo necesario.

## 1) Preparacion (sin caida)

1. Respaldar:
   - Snapshot de DB en Supabase.
   - Export de funciones `rpc_create_sale` y `process_sale_atomic` actuales.
2. Desplegar frontend con flag de compatibilidad:
   - `VITE_SALES_RPC_MODE=compat`
3. Ejecutar preflight:
   - `supabase/migrations/202602280001_cutover_preflight.sql`
4. Validar resultados esperados:
   - Existe `public.sales`.
   - Hay al menos una de estas funciones: `rpc_create_sale(...)` o `process_sale_atomic(...)`.
   - No hay errores de permisos para `authenticated`.

## 2) Ejecucion (ventana corta recomendada)

Orden exacto:

1. `supabase/migrations/202602280002_cutover_schema_hardening.sql`
2. `supabase/migrations/202602280003_cutover_shifts_and_sales_rpcs.sql`
3. `supabase/migrations/202602280004_cutover_constraints_validate.sql`
4. `supabase/migrations/202602280005_cutover_postgrest_reload_and_smoke.sql`

Notas operativas:

- Si `202602280004...` falla por `lock_timeout`, esperar baja actividad y reintentar.
- Mantener `VITE_SALES_RPC_MODE=compat` durante este bloque.

## 3) Verificacion post-cutover (5-10 min)

Pruebas funcionales:

1. Login de usuario operativo.
2. Crear usuario desde modulo usuarios.
3. Resetear contrasena (Edge Function admin-reset-user-password).
4. Registrar una venta en POS.
5. Validar que sale `sale_id` y que `sale_items/sale_payments` se crean.

Pruebas tecnicas:

1. `process_sale_atomic_overloads`:
   - ideal: `1` (solo wrapper canonico).
2. `rows_with_null_company_id`:
   - ideal: `0` en tablas criticas.
3. Sin errores `PGRST202` o `function is not unique`.

## 4) Cambio a modo canonico

Cuando las pruebas anteriores esten estables:

1. Cambiar frontend a:
   - `VITE_SALES_RPC_MODE=canonical`
2. Desplegar frontend.
3. Repetir prueba de venta en POS.

## 5) Rollback rapido

Si hay incidente:

1. Frontend inmediato a:
   - `VITE_SALES_RPC_MODE=compat`
2. Si se rompio solo path canonico:
   - mantener wrappers legacy y reintentar validacion.
3. Si hay corrupcion o impacto mayor:
   - restaurar snapshot DB y redeploy frontend previo.

## 6) Checklist de cierre

1. Confirmar sin errores en consola para:
   - `rpc_create_sale`
   - `process_sale_atomic`
   - `company_id`
2. Congelar contratos:
   - mantener solo `rpc_create_sale` + wrapper unico `process_sale_atomic`.
3. Documentar fecha/hora real del cutover y resultados.
