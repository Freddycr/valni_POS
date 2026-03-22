# Bitacora de Implementacion Multi-Tienda
Fecha: 2026-02-25
Estado: Implementado en frontend + servicios + script SQL de migracion

## 1. Objetivo
Habilitar operacion multi-tienda con:
- Tienda activa por usuario.
- Vista por tienda o consolidado en ventas/reportes/inventario/adelantos/pedidos.
- Registro de pagos y movimientos con tienda de origen.
- Soporte de comprobantes con `Recibo de Venta` y numeracion por tienda/serie en DB.

## 2. Cambios de codigo aplicados

### 2.1 Tipos y modelo de dominio
Archivo: `types.ts`
- Nuevos tipos: `StoreType`, `Store`, `UserStoreAssignment`.
- `User` ampliado con `stores`, `storeIds`, `activeStoreId`.
- Entidades con trazabilidad de tienda:
  - `Product`: `storeId`, `storeName`.
  - `Sale`: `storeId`, `storeName`, `documentType`, `documentSeries`, `documentNumber`.
  - `PaymentDetail`: `paymentStoreId`, `paymentStoreName`.
  - `Advance`: `storeId`, `storeName`.
  - `AdvanceMovement`: `movementStoreId`, `movementStoreName`.
  - `PurchaseOrder`: `storeId`, `storeName`.

### 2.2 Capa de datos Supabase
Archivo: `services/supabaseApi.ts`
- Agregadas tablas objetivo y helpers de compatibilidad:
  - `stores`, `user_store_assignments`, `inventory_balances`.
  - fallback cuando columnas/tablas no existen.
- Tienda activa persistida en `localStorage`:
  - `getActiveStoreId`, `setActiveStoreId`.
- Nuevas APIs:
  - `getStores`, `getUserStoreAssignments`, `getCurrentUserStoreAssignments`.
- Autenticacion:
  - `authenticateUser` ahora retorna tiendas asignadas + tienda activa.
- Ventas y creditos:
  - `saveSale` intenta RPC extendido con `p_store_id`, `p_document_type`, `p_document_series` y fallback al RPC antiguo.
  - `payInstallment` registra `payment_store_id` (con fallback).
  - `getCredits` admite filtro por tienda (con fallback).
- Adelantos:
  - `getAdvances`, `getCustomerAdvanceBalance` soportan tienda/consolidado.
  - `saveAdvance`, `addAdvancePayment`, `applyAdvanceAmount`, `refundAdvanceAmount` registran tienda de movimiento.
  - `applyCustomerAdvancesToSale` aplica saldo consolidado (cross-store).
- Inventario/productos:
  - `getProducts` soporta tienda activa o consolidado via `inventory_balances`.
  - `saveProduct`, `updateProduct`, `replaceProductLocation` sincronizan balance por tienda cuando existe tabla.
- Reporteria:
  - `getSalesData`, `getDailyReportData`, `fetchAdvanceMovements` con scope por tienda o consolidado.
- Pedidos:
  - `getPurchaseOrders`, `savePurchaseOrder`, `updatePurchaseOrder` con `storeId` y fallback si falta columna.

### 2.3 App y navegacion
Archivo: `App.tsx`
- Estados globales:
  - `userStores`, `activeStoreId`.
- Login:
  - carga tiendas del usuario y define tienda activa.
- Sidebar:
  - se pasa selector de tienda y callback de cambio.
- Modulos ahora reciben contexto de tienda:
  - `SalesForm`, `ReportsScreen`, `DailyReportScreen`, `InventoryScreen`, `PurchaseOrderManagementScreen`, `CreditManagementScreen`, `AdvanceManagementScreen`.

### 2.4 Sidebar
Archivo: `components/ResponsiveSidebar.tsx`
- Nuevo selector `Tienda Activa` para cambiar contexto operativo.

### 2.5 Modulos funcionales
Archivos:
- `components/SalesForm.tsx`
- `components/InventoryScreen.tsx`
- `components/ReportsScreen.tsx`
- `components/DailyReportScreen.tsx`
- `components/AdvanceManagementScreen.tsx`
- `components/CreditManagementScreen.tsx`
- `components/PurchaseOrderManagementScreen.tsx`

Cambios generales:
- Scope por tienda activa / tienda elegida / consolidado segun modulo.
- Etiquetas visuales de tienda activa.
- Persistencia de pagos/adelantos/cobranzas con tienda.
- En ventas: comprobante enviado como `Recibo de Venta`.
- Ajuste final aplicado en pedidos:
  - `OrderGeneration` ahora recarga catalogo al cambiar `activeStoreId`.

### 2.6 Esquema SQL
Archivos:
- `migrations/2026-02-25_multistore_and_document_series.sql` (nuevo)
- `schema.sql` (actualizado)

La migracion agrega:
- Tablas: `stores`, `user_store_assignments`, `inventory_balances`, `store_document_series`.
- Columnas:
  - `sales`: `store_id`, `document_type`, `document_series`, `document_number`.
  - `sale_payments`: `payment_store_id`.
  - `credits`: `store_id`.
  - `advances`: `store_id`.
  - `advance_movements`: `movement_store_id`.
  - `purchase_orders`: `store_id`.
- Backfill de tienda por defecto para datos historicos.
- Trigger para auto-completar `payment_store_id` desde la venta.
- Overload de `process_sale_atomic(...)` con parametros extendidos y compatibilidad con la version legacy de 5 parametros.
- Soporte de series por tienda y correlativo incremental:
  - `default_document_series(...)`
  - `get_next_document_number(...)`

## 3. Validacion ejecutada
- Se verifico lectura estructural de modulos multi-tienda y coherencia de flujo.
- Se ajusto problema detectado en pedidos (refresco al cambiar tienda).
- Nota de entorno:
  - `npx tsc --noEmit` completo es lento por inclusion de `dist` (config actual).
  - El cierre funcional se completo con validacion de codigo + consistencia de integracion.

## 4. Riesgos conocidos
- El script SQL asume existencia de la funcion legacy:
  - `process_sale_atomic(uuid, uuid, numeric, jsonb, jsonb)`.
- Si esa funcion no existe en una base nueva, se debe crear primero o adaptar el overload para insertar ventas completo sin wrapper.
- `schema.sql` representa una foto consolidada; para produccion, ejecutar primero la migracion del folder `migrations`.

## 5. Rollback recomendado (por bloques)

### 5.1 Rollback de frontend/servicios
- Revertir manualmente archivos listados en seccion 2 (o restaurar copia previa del proyecto).
- Orden sugerido:
  1. `App.tsx` y `components/ResponsiveSidebar.tsx`.
  2. Modulos funcionales.
  3. `services/supabaseApi.ts`.
  4. `types.ts`.

### 5.2 Rollback de DB (controlado)
Ejecutar con cuidado en entorno de prueba antes de produccion:
1. Quitar overload nuevo de `process_sale_atomic` (8 parametros).
2. Eliminar trigger `trg_set_payment_store_id_default`.
3. Eliminar funciones `get_next_document_number` y `default_document_series` si no se usan.
4. Eliminar columnas nuevas (`store_id`, `document_*`, `payment_store_id`, etc.).
5. Eliminar tablas nuevas (`store_document_series`, `inventory_balances`, `user_store_assignments`, `stores`) solo si no contienen datos necesarios.

## 6. Siguiente accion sugerida
- Ejecutar SQL de `migrations/2026-02-25_multistore_and_document_series.sql` en Supabase.
- Probar:
  1. Cambio de tienda por vendedor en el mismo dia.
  2. Reporte diario por tienda y consolidado.
  3. Dashboard con creditos/adelantos por tienda.
  4. Venta con comprobante `Recibo de Venta` y correlativo por tienda/serie.

## 7. Ajuste posterior (2026-02-26)
Archivo: `services/supabaseApi.ts`
- Se corrigio reconciliacion entre `stores` e `inventory_locations`:
  - `getStores` ahora cruza ambos catálogos y prioriza nombres reales de `inventory_locations` cuando existe esa tabla.
  - Se evita mostrar tiendas “semilla” no presentes en ubicaciones operativas (caso: `Tienda` vs `Tienda_1`).
- Se reforzo `getUserStoreAssignments`:
  - Filtra asignaciones a tiendas visibles reconciliadas.
  - Si quedan asignaciones huerfanas, remapea por nombre.
  - Si no hay asignaciones validas, genera fallback operativo con tiendas visibles.
- Resultado esperado:
  - Selector de tienda activa coherente con ubicaciones reales.
  - Filtro de catálogo por tienda activa consistente en el front.

## 8. Ajuste catalogo Productos (2026-02-26)
Archivos:
- `components/ProductManagementScreen.tsx`
- `App.tsx`

Cambios:
- `ProductManagementScreen` ahora recibe `activeStoreId` y `stores`.
- Carga de catálogo con `getProducts({ storeId: activeStoreId || null })`.
- Recarga automática al cambiar tienda activa.
- Al guardar/editar producto, se inyecta `storeId` de tienda activa cuando corresponda.
- Etiqueta visual de tienda activa en el encabezado del módulo.
- `App.tsx` ahora pasa contexto de tienda a `ProductManagementScreen`.

## 9. Fase 1 Blueprint iniciada (2026-02-26)
Archivos:
- `migrations/2026-02-26_phase1_blueprint_foundations.sql`
- `supabase/migrations/202602260001_phase1_blueprint_foundations.sql`
- `schema.sql`
- `types.ts`
- `services/supabaseApi.ts`

Cambios:
- Se agregó migración aditiva para:
  - `companies`
  - `warehouses`
  - `product_variants`
  - propagación/backfill de `company_id` en tablas existentes
  - columnas `warehouse_id`/`variant_id` en tablas operativas
  - índices base por `company_id`.
- `schema.sql` quedó actualizado con el bloque de referencia de la Fase 1.
- Se añadieron tipos TS para nueva capa de dominio:
  - `Company`
  - `Warehouse`
  - `ProductVariant`
  - campos `companyId`/`warehouseId`/`variantId` opcionales en entidades existentes.
- Se añadieron APIs base en `supabaseApi`:
  - `getActiveCompanyId` / `setActiveCompanyId`
  - `getCompanies`
  - `getWarehouses`
  - `getProductVariants`
- `getStores` ahora tolera ausencia temporal de `company_id` (compatibilidad pre-migración).
- `authenticateUser` ahora persiste `activeCompanyId` si está disponible.

Rollback puntual Fase 1:
1. Revertir uso app: eliminar nuevas APIs/tipos (si se requiere rollback frontend).
2. DB: no eliminar en caliente tablas nuevas; deshabilitar consumo app y planificar limpieza controlada en ventana de mantenimiento.

## 10. Fase 2 Blueprint iniciada (2026-02-26)
Archivos:
- `migrations/2026-02-26_phase2_kardex_and_serialization.sql`
- `supabase/migrations/202602260002_phase2_kardex_and_serialization.sql`
- `schema.sql`
- `types.ts`
- `services/supabaseApi.ts`

Cambios:
- Migración aditiva para:
  - `stock_balances`
  - `serialized_items`
  - `inventory_movements`
  - `inventory_movement_items`
  - `pos_shifts`
  - columna `sales.shift_id`
- Backfill inicial:
  - `stock_balances` desde `inventory_balances` + `warehouses`.
  - `serialized_items` desde datos serializados existentes en `products`.
  - movimientos `opening_balance` iniciales desde `stock_balances`.
- `schema.sql` actualizado con bloque de referencia de Fase 2.
- Tipos TS añadidos para nueva capa:
  - `StockBalance`
  - `SerializedItem`
  - `InventoryMovement`
  - `InventoryMovementItem`
  - `PosShift`
- APIs base añadidas en `supabaseApi`:
  - `getStockBalances`
  - `getSerializedItems`
  - `getInventoryMovements`
  - `getInventoryMovementItems`
  - `getPosShifts`

Estado:
- Fase 2 deja estructuras listas y consultables.
- Aún pendiente en próximas fases:
  - RPCs blueprint (`rpc_create_sale`, `rpc_void_sale`, `rpc_transfer_stock`, `rpc_adjust_stock`, `rpc_receive_purchase`).
  - RLS completo por `company_id` y bloqueo de escrituras críticas fuera de RPC.

## 11. Fase 3 Blueprint implementada (2026-02-26)
Archivos:
- `migrations/2026-02-26_phase3_transactional_rpcs.sql`
- `supabase/migrations/202602260003_phase3_transactional_rpcs.sql`
- `schema.sql`

Cambios:
- Se añadió `purchase_receipts`.
- Se implementaron helpers transaccionales:
  - `resolve_company_id(...)`
  - `resolve_warehouse_id(...)`
  - `ensure_stock_balance_row(...)`
- Se implementaron RPCs blueprint:
  - `rpc_create_sale(...)`
  - `rpc_void_sale(...)`
  - `rpc_transfer_stock(...)`
  - `rpc_adjust_stock(...)`
  - `rpc_receive_purchase(...)`
- Compatibilidad app actual:
  - wrappers `process_sale_atomic(...)` (8 y 5 parámetros).
- `schema.sql` quedó con bloque de referencia de Fase 3.

Estado:
- POS e inventario ya tienen núcleo transaccional blueprint en base de datos.
- Pendiente de endurecimiento final de seguridad/RLS para obligar escritura por RPC en tablas sensibles.

## 12. Fase 4 Blueprint implementada (2026-02-26)
Archivos:
- `migrations/2026-02-26_phase4_rls_audit_and_security.sql`
- `supabase/migrations/202602260004_phase4_rls_audit_and_security.sql`
- `schema.sql`
- `types.ts`
- `services/supabaseApi.ts`
- `App.tsx`
- `components/ResponsiveSidebar.tsx`
- `components/PurchaseOrderManagementScreen.tsx`

Cambios DB:
- Se ampliaron roles de `user_role`:
  - `store_admin`, `cashier`, `warehouse`, `auditor`.
- Se agregó auditoría blueprint:
  - tabla `audit_log`.
  - función `write_audit_log(...)`.
  - trigger genérico `trg_audit_entity_changes()` aplicado a tablas sensibles (`sales`, `inventory_movements`, `pos_shifts`, `purchase_orders`, `advances`, `credits`).
- Endurecimiento RPC:
  - RPCs críticos alterados a `SECURITY DEFINER` + `search_path` controlado.
  - `GRANT EXECUTE` explícito a `authenticated`.
- RLS blueprint:
  - funciones helper de contexto (`current_profile_role`, `current_profile_company_id`, `in_company_scope`, `is_store_assigned`, etc.).
  - RLS activado en tablas nuevas blueprint.
  - bloqueo de escritura directa en tablas transaccionales críticas (`stock_balances`, `serialized_items`, `inventory_movements`, `inventory_movement_items`, `sale_items`, `purchase_receipts`, `audit_log`).
  - `sale_payments` se mantiene escribible bajo scope para no romper cobranzas/cuotas/adelantos del app actual.
- Índices blueprint:
  - `sales(company_id, store_id, created_at desc)`.
  - `inventory_movements(company_id, warehouse_id, occurred_at desc)`.

Cambios frontend/TS:
- Nuevos roles aceptados en tipos (`Role`).
- Ajustes de navegación por rol:
  - `warehouse` se trata como perfil orientado a inventario.
  - `store_admin` accede a sección administrativa.
- Gestión de pedidos habilitada para `store_admin`, `warehouse`, `supervisor`.
- API añadida:
  - `getAuditLogs(...)` en `services/supabaseApi.ts`.

Estado:
- Fase 4 deja el stack alineado con blueprint en seguridad y trazabilidad.
- Pendiente próximo sprint:
  - UI de auditoría (`audit_log`) y flujo operativo de turnos POS (`pos_shifts`) end-to-end.
