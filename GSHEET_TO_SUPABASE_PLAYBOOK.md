# Playbook Definitivo: Google Sheets -> Supabase

## Objetivo
Definir un proceso estable, idempotente y auditable para migrar datos de Google Sheets a Supabase sin mezclar empresas, con control de calidad y reconciliacion antes de cutover.

## Principios
1. Aislamiento estricto por `company_id`.
2. Migracion idempotente (se puede re-ejecutar sin duplicar).
3. Trazabilidad total (run_id, fuente, timestamp, conteos).
4. Fechas de negocio en zona `America/Lima` (UTC-5 logico).
5. Cutover solo con reconciliacion aprobada.

## Alcance de datos
- Maestros: companias, tiendas, marcas, modelos, categorias, productos, clientes.
- Operaciones: ventas, detalle de ventas, pagos.
- Configuracion por empresa: `company_receipt_settings`.

## Arquitectura de migracion (definitiva)
1. Extraccion (snapshot) desde endpoints legacy:
   - `getProducts`
   - `getSalesData`
2. Landing/staging (raw) en Supabase (`staging.*`) con `run_id`.
3. Normalizacion y dedupe.
4. Upsert a tablas finales en orden de dependencias.
5. Reconciliacion automatica.
6. Aprobacion de negocio y cutover.

## Fase 0: Preflight
Checklist:
- Confirmar `company_id` destino.
- Respaldar DB (snapshot Supabase).
- Congelar cambios funcionales durante ventana de migracion.
- Definir ventana y owner de validacion negocio.
- Verificar migraciones SQL aplicadas (incluyendo reporting):
  - `supabase/migrations/202603040001_reporting_and_agent_logs.sql`
  - `supabase/migrations/202603040002_sales_operations_detail_view.sql`

## Fase 1: Extraccion
Usar el extractor actual como base (`scripts/migrate-all.js`), pero separar extraccion y carga:

1. Descargar snapshot JSON de productos y ventas.
2. Guardar archivo firmado con timestamp (ej: `exports/run_20260306_2200/*.json`).
3. Registrar metadatos del run (`run_id`, fecha, empresa, filas por dataset).

## Fase 2: Reglas de normalizacion (obligatorias)
### 2.1 Fechas y timezone
- Si fecha viene sin zona, interpretar como hora Peru (`-05:00`).
- Convertir a `timestamptz` sin perder instante.
- Mantener consistencia con logica de `toPeruIsoTimestamp`.

### 2.2 Empresa y tienda
- Todo registro debe salir con `company_id` fijo del run.
- No insertar ni actualizar filas fuera de la empresa objetivo.

### 2.3 Productos
- Clave natural recomendada para equipo serializado: `imei_1` (si existe).
- Si no hay IMEI: fallback por combinacion de campos estables (`name+description+company_id`).
- Normalizar `location_bin` a catalogo controlado (`Tienda`, `Almacen`).

### 2.4 Clientes
- Dedupe por `doc_number` (DNI).
- Si cliente sin DNI, enrutar a cola de excepciones (no romper migracion completa).

### 2.5 Ventas / Items / Pagos
- Venta idempotente por `invoice_number = MIG-<legacy_sale_id>`.
- Items vinculados por `sale_id` migrado, nunca por texto libre.
- Pagos con mapeo canonico de metodo (`cash`, `yape`, `plin`, etc).

## Fase 3: Orden de carga (obligatorio)
1. `brands`, `categories`, `models`
2. `products`
3. `customers`
4. `sales`
5. `sale_items`
6. `sale_payments`
7. `company_receipt_settings`

Nota: siempre usar `upsert` con `onConflict` en claves de negocio.

## Fase 4: Reconciliacion automatica
Correr estas validaciones por `company_id` y `run_id`:

1. Conteo total por entidad:
```sql
select 'products' as entity, count(*) from products where company_id = :company_id
union all
select 'customers', count(*) from customers where company_id = :company_id
union all
select 'sales', count(*) from sales where company_id = :company_id;
```

2. Inventario por ubicacion:
```sql
select location_bin, count(*)
from products
where company_id = :company_id
group by location_bin
order by location_bin;
```

3. Ventas por dia (control negocio):
```sql
select (created_at at time zone 'America/Lima')::date as day,
       sum(total_amount) as total
from sales
where company_id = :company_id
group by 1
order by 1;
```

4. Integridad venta vs items:
```sql
select s.id,
       s.total_amount,
       coalesce(sum(si.total_price),0) as items_total,
       s.total_amount - coalesce(sum(si.total_price),0) as diff
from sales s
left join sale_items si on si.sale_id = s.id
where s.company_id = :company_id
group by s.id, s.total_amount
having abs(s.total_amount - coalesce(sum(si.total_price),0)) > 0.01;
```

5. Integridad venta vs pagos:
```sql
select s.id,
       s.total_amount,
       coalesce(sum(sp.amount),0) as paid_total,
       s.total_amount - coalesce(sum(sp.amount),0) as diff
from sales s
left join sale_payments sp on sp.sale_id = s.id
where s.company_id = :company_id
group by s.id, s.total_amount
having abs(s.total_amount - coalesce(sum(sp.amount),0)) > 0.01;
```

## Fase 5: QA funcional
Casos minimos:
1. Busqueda por DNI muestra cliente correcto y compras completas.
2. Busqueda por IMEI devuelve cliente, fecha, precio y metodo de pago.
3. Reporte Diario: total venta = suma real de items por venta.
4. Panel Comercial: mismo total diario que fuente validada.
5. Catalogo/POS: conteos de stock por ubicacion coinciden.

## Fase 6: Cutover
1. Congelar escritura legacy durante ventana corta.
2. Ejecutar ultimo run incremental.
3. Repetir reconciliacion.
4. Habilitar frontend en modo Supabase.
5. Monitorear 24-48h.

## Fase 7: Rollback
- Si falla reconciliacion critica:
  1. volver app a fuente anterior,
  2. restaurar snapshot,
  3. corregir reglas y repetir run.

## Runbook operativo (comandos base)
### 1) Migracion
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
node scripts/migrate-all.js
```

### 2) Test rapido de migracion
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
node scripts/test-migration.js
```

### 3) Provision demo tenant (opcional QA)
```powershell
node scripts/create-demo-tenant.js
```

## Criterios de aceptacion (go/no-go)
1. 0 mezcla de datos entre empresas.
2. 0 ventas huerfanas (sin items) por error de migracion.
3. Diferencia <= 0.5% en totales diarios vs fuente de negocio.
4. Inventario por ubicacion validado por negocio.
5. Evidencia firmada de reconciliacion guardada por run.

## Recomendacion final
Mantener este playbook como proceso oficial. No realizar cargas manuales directas en tablas finales sin `run_id`, reconciliacion y aprobacion de negocio.
