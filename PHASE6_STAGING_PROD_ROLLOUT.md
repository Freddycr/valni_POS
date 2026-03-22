# Fase 6 - Despliegue y Rollout Gradual

## Objetivo
Desplegar el agente y el widget con control de riesgo: primero staging, luego activacion interna, y finalmente habilitacion gradual por empresa.

## 1) Staging (Agent API)

### Preparacion
1. Validar agente:
   - `klisk check` en `agent/valni-semantic-agent`.
2. Configurar variables del agente (staging):
   - `OPENAI_API_KEY`
   - `SEMANTIC_SERVICE_URL` (staging)
   - `DEFAULT_COMPANY_ID` (opcional)

### Arranque
1. Levantar servicio semantico:
   - `npm run semantic:server`
2. Levantar agente Klisk en puerto de staging:
   - `klisk start agent/valni-semantic-agent --port 8081`
3. Verificar:
   - `GET http://localhost:8081/health`
   - `POST http://localhost:8081/api/chat`

### Opcion recomendada (contenedores)
Archivos:
- `deploy/docker-compose.agent-stack.yml`
- `deploy/agent-stack.staging.env.example`
- `scripts/deploy_agent_stack.ps1`
- `scripts/stop_agent_stack.ps1`

Pasos:
1. Copiar `deploy/agent-stack.staging.env.example` a `deploy/agent-stack.staging.env`.
2. Completar credenciales reales (`DATABASE_URL`, `OPENAI_API_KEY`).
   - Si usas OpenRouter, completar `OPENROUTER_API_KEY` y `AGENT_MODEL` (puedes dejar `OPENAI_API_KEY` vacio).
3. Levantar stack:
   - `pwsh -File scripts/deploy_agent_stack.ps1 -EnvFile deploy/agent-stack.staging.env -Detach`
4. Verificar:
   - `GET http://localhost:8787/health`
   - `GET http://localhost:8080/api/info`
5. Detener stack:
   - `pwsh -File scripts/stop_agent_stack.ps1 -EnvFile deploy/agent-stack.staging.env`

Notas operativas:
- Docker Desktop/daemon debe estar en ejecucion antes de usar los scripts.
- Los scripts ahora fallan explicitamente si `docker compose` retorna error.

## 2) Feature flag (widget solo internos)

Se implemento control por entorno/rol/email/empresa en:
- `services/featureFlags.ts`

Variables relevantes:
- `VITE_SEMANTIC_WIDGET_ENABLED`
- `VITE_SEMANTIC_WIDGET_INTERNAL_ONLY`
- `VITE_SEMANTIC_WIDGET_ALLOWED_ROLES`
- `VITE_SEMANTIC_WIDGET_ALLOWED_EMAILS`
- `VITE_SEMANTIC_WIDGET_ALLOWED_COMPANY_IDS`
- `VITE_SEMANTIC_WIDGET_BLOCKED_COMPANY_IDS`

Recomendado:
- Staging: `VITE_SEMANTIC_WIDGET_ENABLED=true`
- Produccion inicial: `VITE_SEMANTIC_WIDGET_ENABLED=false`
- Activacion interna controlada por roles/emails.

## 3) Monitoreo operativo (3-5 dias)

Se habilito logging en `public.agent_query_logs` desde `semantic-query-service`:
- status
- duration_ms
- row_count
- dsl_plan
- compiled_sql
- error_message

Query pack:
- `scripts/agent_rollout_monitoring.sql`

Criterios sugeridos para avanzar:
1. Error rate < 2% por 3 dias consecutivos.
2. p95 < 3000ms en consultas estandar.
3. Sin incidentes de mezcla de empresa (company_id).

## 4) Habilitacion gradual por empresa

Fase recomendada:
1. Internos de QA (roles internos, 1 empresa piloto).
2. Empresa piloto (ej. `VALNI_TEST_MIG`) por 48 horas.
3. 2-3 empresas adicionales.
4. Habilitacion general.

Control por empresa:
- Usar `VITE_SEMANTIC_WIDGET_ALLOWED_COMPANY_IDS` en frontend.
- Mantener `company_id` obligatorio en backend semantico.

## 5) Rollback rapido

Si hay incidencia:
1. Setear `VITE_SEMANTIC_WIDGET_ENABLED=false` y redeploy frontend.
2. Mantener agente activo para diagnostico (sin acceso UI).
3. Revisar `agent_query_logs` y top errores.
