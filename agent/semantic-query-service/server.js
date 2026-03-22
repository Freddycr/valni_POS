import express from "express";
import { createSemanticQueryService, createPgQueryFn } from "./index.js";
import { SemanticQueryError } from "./errors.js";

const PORT = Number(process.env.SEMANTIC_QUERY_PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL || "";
const PGSSL_REJECT_UNAUTHORIZED_RAW = String(
  process.env.PGSSL_REJECT_UNAUTHORIZED || ""
).trim().toLowerCase();
const PGSSL_REJECT_UNAUTHORIZED =
  PGSSL_REJECT_UNAUTHORIZED_RAW === "true"
    ? true
    : PGSSL_REJECT_UNAUTHORIZED_RAW === "false"
      ? false
      : undefined;
const MAX_LIMIT = Number(process.env.SEMANTIC_MAX_LIMIT || 500);
const TIMEOUT_MS = Number(process.env.SEMANTIC_TIMEOUT_MS || 5000);
const CACHE_ENABLED = String(process.env.SEMANTIC_CACHE_ENABLED || "true").toLowerCase() !== "false";
const CACHE_TTL_MS = Number(process.env.SEMANTIC_CACHE_TTL_MS || 30_000);
const CACHE_MAX_ENTRIES = Number(process.env.SEMANTIC_CACHE_MAX_ENTRIES || 200);

async function logAgentQuery({
  queryFn,
  companyId,
  userId = null,
  question = null,
  dslPlan = null,
  compiledSql = null,
  durationMs = null,
  rowCount = null,
  status = "ok",
  errorMessage = null,
}) {
  if (typeof queryFn !== "function") return;
  if (!companyId) return;

  const sql = `
    INSERT INTO public.agent_query_logs
      (company_id, user_id, question, dsl_plan, compiled_sql, duration_ms, row_count, status, error_message)
    VALUES
      ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6::integer, $7::integer, $8, $9)
  `;

  const params = [
    companyId,
    userId || null,
    question || null,
    dslPlan ? JSON.stringify(dslPlan) : null,
    compiledSql || null,
    Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    Number.isFinite(Number(rowCount)) ? Number(rowCount) : null,
    status,
    errorMessage || null,
  ];

  try {
    await queryFn(sql, params);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("No se pudo registrar agent_query_logs:", String(error?.message || error));
  }
}

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  let queryFn = null;
  if (DATABASE_URL) {
    queryFn = await createPgQueryFn(DATABASE_URL, {
      sslRejectUnauthorized: PGSSL_REJECT_UNAUTHORIZED,
    });
  }

  const semanticService = createSemanticQueryService({
    queryFn,
    maxLimit: MAX_LIMIT,
    timeoutMs: TIMEOUT_MS,
    cacheEnabled: CACHE_ENABLED,
    cacheTtlMs: CACHE_TTL_MS,
    cacheMaxEntries: CACHE_MAX_ENTRIES,
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      hasDatabase: Boolean(queryFn),
      pgsslRejectUnauthorized: PGSSL_REJECT_UNAUTHORIZED,
      maxLimit: MAX_LIMIT,
      timeoutMs: TIMEOUT_MS,
      cache: semanticService.getCacheStats(),
    });
  });

  app.get("/cache/stats", (_req, res) => {
    res.json({
      ok: true,
      cache: semanticService.getCacheStats(),
    });
  });

  app.post("/semantic-query", async (req, res) => {
    const startedAt = Date.now();
    try {
      if (!queryFn) {
        res.status(503).json({
          ok: false,
          error: "Servicio sin conexion a base de datos. Define DATABASE_URL.",
        });
        return;
      }

      const { dsl, companyId, userId, question } = req.body || {};
      if (!companyId) {
        res.status(400).json({
          ok: false,
          error: "companyId es obligatorio.",
        });
        return;
      }

      const response = await semanticService.run(dsl, { companyId });
      await logAgentQuery({
        queryFn,
        companyId,
        userId,
        question,
        dslPlan: response.dsl,
        compiledSql: response.compiled?.sql || null,
        durationMs: Date.now() - startedAt,
        rowCount: response.result.rowCount,
        status: "ok",
      });

      res.json({
        ok: true,
        dsl: response.dsl,
        meta: response.result.meta,
        rowCount: response.result.rowCount,
        durationMs: response.result.durationMs,
        rows: response.result.rows,
      });
    } catch (error) {
      if (error instanceof SemanticQueryError) {
        const safeCompanyId = String(req.body?.companyId || "").trim();
        await logAgentQuery({
          queryFn,
          companyId: safeCompanyId || null,
          userId: req.body?.userId || null,
          question: req.body?.question || null,
          dslPlan: req.body?.dsl || null,
          compiledSql: null,
          durationMs: Date.now() - startedAt,
          rowCount: null,
          status: "error",
          errorMessage: error.message,
        });

        res.status(400).json({
          ok: false,
          code: error.code,
          error: error.message,
          details: error.details || null,
        });
        return;
      }

      const safeCompanyId = String(req.body?.companyId || "").trim();
      await logAgentQuery({
        queryFn,
        companyId: safeCompanyId || null,
        userId: req.body?.userId || null,
        question: req.body?.question || null,
        dslPlan: req.body?.dsl || null,
        compiledSql: null,
        durationMs: Date.now() - startedAt,
        rowCount: null,
        status: "error",
        errorMessage: String(error?.message || error),
      });

      res.status(500).json({
        ok: false,
        code: "UNEXPECTED_ERROR",
        error: "Error inesperado en semantic-query-service.",
        details: String(error?.message || error),
      });
    }
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`semantic-query-service listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
