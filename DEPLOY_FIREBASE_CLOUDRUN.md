# Despliegue Firebase + Cloud Run (Agente Semantico)

## Objetivo
Desplegar la app web en Firebase Hosting y el stack del agente en Cloud Run, con dos servicios:

1. `valni-semantic-query` (Node): ejecuta DSL segura contra Supabase.
2. `valni-datacopilot-agent` (Klisk/Python): expone chat/widget y llama al servicio semantico.

## Arquitectura objetivo
1. Usuario abre app en Firebase Hosting.
2. Frontend llama al agente (`VITE_KLISK_AGENT_URL`).
3. Agente llama a `semantic-query-service`.
4. `semantic-query-service` consulta Supabase por `DATABASE_URL`.

## Prerrequisitos
- Proyecto GCP/Firebase activo (en este repo: `registroventas-466719`).
- Billing habilitado.
- `gcloud`, `firebase`, `docker` y `npm` instalados.
- APIs habilitadas:
  - Cloud Run Admin API
  - Cloud Build API
  - Artifact Registry API
  - Secret Manager API
- Login:
  - `gcloud auth login`
  - `gcloud auth application-default login`
  - `firebase login`

## Variables recomendadas
Define estas variables en PowerShell antes de ejecutar comandos:

```powershell
$env:GCP_PROJECT="registroventas-466719"
$env:GCP_REGION="us-central1"
$env:AR_REPO="valni-agents"
$env:IMAGE_TAG=(Get-Date -Format "yyyyMMdd-HHmm")
```

## Fase 1: Preparar Artifact Registry
```powershell
gcloud config set project $env:GCP_PROJECT
gcloud artifacts repositories create $env:AR_REPO --repository-format=docker --location=$env:GCP_REGION --description="VALNI agent images"
```

Si ya existe, continua.

## Fase 2: Crear secretos en Secret Manager
Crear secretos (una sola vez):

```powershell
gcloud secrets create database-url --replication-policy="automatic"
gcloud secrets create openrouter-api-key --replication-policy="automatic"
```

Cargar versiones:

```powershell
# Ejemplo interactivo
"<DATABASE_URL_POOLER_SUPABASE>" | gcloud secrets versions add database-url --data-file=-
"<OPENROUTER_API_KEY>" | gcloud secrets versions add openrouter-api-key --data-file=-
```

## Fase 3: Build y deploy de semantic-query-service
### 3.1 Build
```powershell
gcloud builds submit . --tag "$env:GCP_REGION-docker.pkg.dev/$env:GCP_PROJECT/$env:AR_REPO/semantic-query-service:$env:IMAGE_TAG" --file agent/semantic-query-service/Dockerfile
```

### 3.2 Deploy
```powershell
gcloud run deploy valni-semantic-query `
  --image "$env:GCP_REGION-docker.pkg.dev/$env:GCP_PROJECT/$env:AR_REPO/semantic-query-service:$env:IMAGE_TAG" `
  --region $env:GCP_REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8787 `
  --set-secrets DATABASE_URL=database-url:latest `
  --set-env-vars SEMANTIC_QUERY_PORT=8787,SEMANTIC_MAX_LIMIT=500,SEMANTIC_TIMEOUT_MS=5000,SEMANTIC_CACHE_ENABLED=true,SEMANTIC_CACHE_TTL_MS=30000,SEMANTIC_CACHE_MAX_ENTRIES=200,PGSSL_REJECT_UNAUTHORIZED=false
```

Obtener URL:

```powershell
$semanticUrl = gcloud run services describe valni-semantic-query --region $env:GCP_REGION --format="value(status.url)"
$semanticUrl
```

## Fase 4: Build y deploy de Klisk agent
### 4.1 Build
```powershell
gcloud builds submit agent/valni-semantic-agent --tag "$env:GCP_REGION-docker.pkg.dev/$env:GCP_PROJECT/$env:AR_REPO/valni-datacopilot-agent:$env:IMAGE_TAG"
```

### 4.2 Deploy
```powershell
gcloud run deploy valni-datacopilot-agent `
  --image "$env:GCP_REGION-docker.pkg.dev/$env:GCP_PROJECT/$env:AR_REPO/valni-datacopilot-agent:$env:IMAGE_TAG" `
  --region $env:GCP_REGION `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --set-secrets OPENROUTER_API_KEY=openrouter-api-key:latest `
  --set-env-vars AGENT_MODEL=openrouter/google/gemini-2.0-flash-001,SEMANTIC_SERVICE_URL=$semanticUrl/semantic-query,BUSINESS_TIMEZONE=America/Lima
```

Obtener URL:

```powershell
$agentUrl = gcloud run services describe valni-datacopilot-agent --region $env:GCP_REGION --format="value(status.url)"
$agentUrl
```

## Fase 5: Configurar frontend y desplegar en Firebase Hosting
Actualizar `.env.production`:

```dotenv
VITE_KLISK_AGENT_URL=<AGENT_URL_CLOUD_RUN>
VITE_KLISK_API_KEY=
VITE_KLISK_AGENT_NAME=VALNI DataCopilot
VITE_KLISK_TIMEOUT_MS=60000
VITE_SEMANTIC_WIDGET_ENABLED=true
VITE_SEMANTIC_WIDGET_INTERNAL_ONLY=true
VITE_SEMANTIC_WIDGET_ALLOWED_ROLES=admin,store_admin,supervisor,agent
```

Build + deploy:

```powershell
npm ci
npm run build
firebase use registroventas-466719
firebase deploy --only hosting
```

## Checklist de verificacion
- `GET <semantic-url>/health` responde `ok: true` y `hasDatabase: true`.
- `GET <agent-url>/health` responde 200.
- Chat del agente responde consultas reales (DNI, IMEI, inventario).
- El widget aparece solo para roles permitidos.
- No hay mezcla de `company_id` entre empresas.

## Rollout recomendado
1. Staging interno 2-3 dias.
2. Activar en una empresa piloto.
3. Revisar logs (`agent_query_logs`) y latencia p95.
4. Habilitacion gradual por empresa.

## Rollback rapido
1. Frontend: `VITE_SEMANTIC_WIDGET_ENABLED=false` y redeploy hosting.
2. Mantener Cloud Run activo para diagnostico.
3. Si hay fallo severo, redeploy de imagen anterior (`IMAGE_TAG` previo).

## Notas operativas
- Para el `DATABASE_URL` de Supabase usar host pooler (ejemplo `aws-1-us-east-1.pooler.supabase.com:6543`).
- Mantener `BUSINESS_TIMEZONE=America/Lima` para coherencia con reportes.
- Si se quiere cerrar acceso publico del agente, agregar capa de auth antes de quitar `--allow-unauthenticated`.
