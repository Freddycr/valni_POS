# Plan de Arquitectura y Checklist

## Objetivo
Implementar un widget embebible con un agente (Klisk) para consultas semánticas sobre Supabase, con aislamiento estricto por empresa (`company_id`), solo lectura, y resultados confiables para módulos de reportes.

## Arquitectura Objetivo
Flujo propuesto:

1. `Frontend (React/Vite)` renderiza widget y envía pregunta del usuario.
2. `Widget API Client` envía request al `Agent API` junto con `access_token` de Supabase.
3. `Agent API (Klisk)` valida token, resuelve `user_id` y `company_id` desde `profiles`.
4. `Semantic Planner` convierte lenguaje natural a `DSL estructurada` (no SQL libre).
5. `Query Compiler` traduce DSL a SQL parametrizado solo sobre vistas de `reporting`.
6. `Query Executor` ejecuta consulta con límites, timeout y guardrails.
7. `Response Formatter` responde texto + tabla + metadatos de trazabilidad.

## Componentes

### 1) Frontend
Archivos objetivo:

- `components/SemanticAssistantWidget.tsx`
- `services/agentApi.ts`
- `App.tsx` (montaje del widget)

Responsabilidades:

- Capturar pregunta, filtros opcionales y contexto de fecha.
- Mostrar respuesta, detalle tabular y estado de carga/error.
- Enviar token de sesión y no exponer llaves sensibles.

### 2) Agent API con Klisk
Directorio sugerido:

- `agent/valni-semantic-agent/` (proyecto Klisk separado del frontend)

Responsabilidades:

- Orquestación del agente.
- Validación de autenticación/autorización.
- Planeación semántica y ejecución segura.
- Logging técnico y funcional.

### 3) Capa Semántica (DSL)
Formato sugerido de plan de consulta:

```json
{
  "dataset": "sales",
  "metrics": ["net_sales", "orders"],
  "dimensions": ["day"],
  "filters": {
    "date_from": "2026-03-01",
    "date_to": "2026-03-03",
    "store_id": null,
    "location_bin": null
  },
  "limit": 200
}
```

Regla clave:

- El LLM nunca entrega SQL ejecutable.
- El backend compila SQL desde la DSL contra una whitelist.

### 4) Data Layer en Supabase
Crear vistas en esquema `reporting` para desacoplar al agente de tablas transaccionales.

Vistas mínimas:

- `reporting.v_sales_fact`
- `reporting.v_sale_items_fact`
- `reporting.v_inventory_snapshot`
- `reporting.v_payments_fact`

Campos obligatorios en todas:

- `company_id`
- timestamps con manejo explícito de zona horaria (`America/Lima` o UTC normalizado)

### 5) Seguridad
Controles obligatorios:

1. No ejecutar `INSERT/UPDATE/DELETE/DDL`.
2. No permitir SQL libre desde LLM.
3. Forzar filtro `company_id` resuelto del token del usuario.
4. Límite de filas por consulta (ejemplo: 200).
5. Timeout de ejecución (ejemplo: 5s).
6. Rate limit por usuario/empresa.
7. Registro de auditoría de pregunta, plan, SQL compilado y resultado resumido.

### 6) Observabilidad
Tabla sugerida:

- `agent_query_logs`

Campos recomendados:

- `id`, `company_id`, `user_id`, `question`, `dsl_plan`, `compiled_sql`, `duration_ms`, `row_count`, `status`, `error_message`, `created_at`

## Checklist de Implementación

## Fase 0: Definición
1. Definir catálogo de preguntas soportadas para MVP.
2. Definir métricas oficiales y su fórmula de negocio.
3. Acordar timezone única para reportes (`UTC-5` lógico de negocio).
4. Definir límites operativos (filas, timeout, concurrencia).

## Fase 1: Base de datos para analítica segura
1. Crear migración de esquema `reporting` y vistas.
2. Crear migración de `agent_query_logs`.
3. Validar que todas las vistas incluyan `company_id`.
4. Probar queries base con datos de `VALNI` y `VALNI_TEST_MIG`.

## Fase 2: Servicio de consultas semánticas
1. Crear servicio `semantic-query-service` en backend del agente.
2. Implementar parser de DSL y validador de whitelist.
3. Implementar compilador DSL -> SQL parametrizado.
4. Implementar ejecutor con timeout, límite y manejo de errores.
5. Agregar pruebas unitarias para planner/validator/compiler.

## Fase 3: Agente Klisk
1. Crear proyecto Klisk para el agente.
2. Definir prompt de sistema con reglas de negocio y seguridad.
3. Registrar tools necesarias (plan, execute, explain).
4. Agregar manejo de aclaraciones cuando la consulta es ambigua.
5. Agregar respuestas con trazabilidad (métrica, rango, filtros aplicados).

## Fase 4: Widget frontend
1. Crear `SemanticAssistantWidget`.
2. Integrar envío de token de sesión y contexto de empresa.
3. Renderizar texto + tabla + estados.
4. Añadir acciones rápidas: "hoy", "ayer", "últimos 7 días", "por tienda".
5. Agregar manejo UX de errores y reintentos.

## Fase 5: Hardening y QA
1. Pruebas de seguridad de prompt injection.
2. Pruebas de aislamiento de datos entre empresas.
3. Pruebas de consistencia contra `Reporte Diario` y `Panel Comercial`.
4. Pruebas de carga con consultas concurrentes.
5. Ajuste de caching en consultas repetidas.

## Fase 6: Despliegue
1. Desplegar Agent API en entorno de staging.
2. Activar widget por feature flag solo para usuarios internos.
3. Monitorear errores y latencias por 3-5 días.
4. Habilitar gradualmente en producción por empresa.

## Criterios de Aceptación MVP
1. El widget responde al menos 15 consultas de negocio definidas.
2. Ninguna consulta retorna datos de otra empresa.
3. Toda respuesta incluye rango de fechas y filtros aplicados.
4. Latencia p95 menor a 3 segundos para consultas estándar.
5. Coincidencia mínima de 98% con reportes oficiales para casos de prueba.

## Siguiente paso recomendado
Construir primero Fase 1 + Fase 2 en paralelo, porque define la seguridad y evita errores de mezcla de empresas en capas superiores.
