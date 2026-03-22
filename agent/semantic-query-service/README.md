# Semantic Query Service (Phase 2 + Phase 5)

Servicio backend para consultas semánticas seguras sobre vistas `reporting.*`.

## Qué resuelve

- Parser de DSL (`parseQueryDsl`)
- Validador con whitelist por dataset (`validateQueryDsl`)
- Compilador DSL -> SQL parametrizado (`compileQueryDsl`)
- Ejecutor con timeout y manejo de errores (`executeCompiledQuery`)
- Cache con TTL + deduplicación de requests concurrentes

## Datasets soportados

- `sales` -> `reporting.v_sales_fact`
- `sale_items` -> `reporting.v_sale_items_fact`
- `payments` -> `reporting.v_payments_fact`
- `inventory` -> `reporting.v_inventory_snapshot`
- `sales_operations` -> `reporting.v_sales_operations_detail` (detalle por venta/item con DNI, IMEI/SN y metodos de pago)

## Seguridad

- Fuerza `company_id` en cada query compilada.
- Solo usa columnas/metricas/dimensiones predefinidas.
- Bloquea campos y filtros fuera de catálogo.
- Bloquea marcadores comunes de inyección SQL en filtros de texto (`;`, `--`, `/*`).
- No ejecuta SQL libre de usuario.

## Ejemplo de uso

```js
import { createSemanticQueryService, createPgQueryFn } from "./index.js";

const queryFn = await createPgQueryFn(process.env.DATABASE_URL);
const service = createSemanticQueryService({
  queryFn,
  timeoutMs: 5000,
  maxLimit: 500,
});

const response = await service.run(
  {
    dataset: "sales",
    metrics: ["net_sales", "orders"],
    dimensions: ["day", "store_name"],
    filters: { date_from: "2026-03-01", date_to: "2026-03-04" },
    limit: 100,
  },
  { companyId: "d02b20da-41de-4123-ace8-9c5528b334e1" }
);

console.log(response.result.rows);
```

## Pruebas

```bash
node --test agent/semantic-query-service/__tests__/semantic-query-service.test.js
node --test agent/semantic-query-service/__tests__
```

## Servidor HTTP (backend)

Variables:

- `DATABASE_URL` (obligatoria para ejecutar queries reales)
- `PGSSL_REJECT_UNAUTHORIZED` (`true`/`false`, opcional; por defecto auto con fallback TLS si falla certificado)
- `SEMANTIC_QUERY_PORT` (default `8787`)
- `SEMANTIC_MAX_LIMIT` (default `500`)
- `SEMANTIC_TIMEOUT_MS` (default `5000`)
- `SEMANTIC_CACHE_ENABLED` (default `true`)
- `SEMANTIC_CACHE_TTL_MS` (default `30000`)
- `SEMANTIC_CACHE_MAX_ENTRIES` (default `200`)

Run:

```bash
npm run semantic:server
```

Endpoint:

`POST /semantic-query`

`GET /cache/stats`

```json
{
  "companyId": "d02b20da-41de-4123-ace8-9c5528b334e1",
  "userId": "00000000-0000-0000-0000-000000000001",
  "question": "ventas de hoy por tienda",
  "dsl": {
    "dataset": "sales",
    "metrics": ["net_sales", "orders"],
    "dimensions": ["day"],
    "filters": { "date_from": "2026-03-01", "date_to": "2026-03-04" },
    "limit": 100
  }
}
```

Notas:
- El endpoint registra auditoria en `public.agent_query_logs` cuando la tabla existe.
- Si el insert de log falla, no rompe la respuesta de la consulta semantica.
