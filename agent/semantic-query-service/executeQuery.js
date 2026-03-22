import { SemanticQueryExecutionError } from "./errors.js";

async function runWithTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new SemanticQueryExecutionError(`Timeout ejecutando consulta (${timeoutMs}ms).`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function executeCompiledQuery(compiledQuery, options) {
  const timeoutMs = Number(options?.timeoutMs || 5000);
  const queryFn = options?.queryFn;
  const expectedLimit = Number(compiledQuery?.meta?.limit || 0);

  if (typeof queryFn !== "function") {
    throw new SemanticQueryExecutionError("No se proporciono queryFn para ejecutar la consulta.");
  }

  const startedAt = Date.now();
  try {
    const rawResult = await runWithTimeout(
      Promise.resolve(queryFn(compiledQuery.sql, compiledQuery.params)),
      timeoutMs
    );

    const rawRows = Array.isArray(rawResult?.rows) ? rawResult.rows : [];
    const rows =
      Number.isInteger(expectedLimit) && expectedLimit > 0
        ? rawRows.slice(0, expectedLimit)
        : rawRows;
    const rowCount =
      Number.isInteger(rawResult?.rowCount) && rawResult.rowCount >= 0
        ? Math.min(rawResult.rowCount, rows.length)
        : rows.length;

    return {
      rows,
      rowCount,
      durationMs: Date.now() - startedAt,
      sql: compiledQuery.sql,
      params: compiledQuery.params,
      meta: compiledQuery.meta,
    };
  } catch (error) {
    if (error instanceof SemanticQueryExecutionError) throw error;
    throw new SemanticQueryExecutionError("Fallo ejecutando consulta semantica.", {
      cause: String(error?.message || error),
    });
  }
}

// Optional helper for Node backends using pg.
// Requires `pg` package in runtime.
export async function createPgQueryFn(connectionString, options = {}) {
  if (!connectionString) {
    throw new SemanticQueryExecutionError("connectionString es obligatorio para crear queryFn de pg.");
  }

  let Client;
  try {
    ({ Client } = await import("pg"));
  } catch (error) {
    throw new SemanticQueryExecutionError(
      'No se pudo cargar el paquete "pg". Instala la dependencia para usar createPgQueryFn.',
      { cause: String(error?.message || error) }
    );
  }

  const sslRejectUnauthorized =
    typeof options?.sslRejectUnauthorized === "boolean"
      ? options.sslRejectUnauthorized
      : undefined;

  let usingInsecureTlsFallback = sslRejectUnauthorized === false;
  let warnedInsecureFallback = false;

  const isTlsCertificateError = (error) => {
    const message = String(error?.message || error).toLowerCase();
    return (
      message.includes("self signed certificate") ||
      message.includes("self-signed certificate") ||
      message.includes("self signed certificate in certificate chain") ||
      message.includes("unable to verify the first certificate") ||
      message.includes("unable to get local issuer certificate") ||
      message.includes("certificate has expired") ||
      (message.includes("certificate") && (message.includes("tls") || message.includes("ssl")))
    );
  };

  const stripStrictSslParams = (rawConnectionString) => {
    try {
      const url = new URL(rawConnectionString);
      const paramsToDelete = [
        "sslmode",
        "ssl",
        "sslcert",
        "sslkey",
        "sslrootcert",
        "sslcrl",
        "sslsni",
        "uselibpqcompat",
      ];
      for (const param of paramsToDelete) {
        url.searchParams.delete(param);
      }
      return url.toString();
    } catch {
      return rawConnectionString;
    }
  };

  const buildClient = (useInsecureTls) => {
    const shouldControlSsl = typeof sslRejectUnauthorized === "boolean" || useInsecureTls;
    const config = {
      connectionString: shouldControlSsl ? stripStrictSslParams(connectionString) : connectionString,
    };
    if (typeof sslRejectUnauthorized === "boolean") {
      config.ssl = { rejectUnauthorized: sslRejectUnauthorized };
    } else if (useInsecureTls) {
      config.ssl = { rejectUnauthorized: false };
    }
    return new Client(config);
  };

  return async (sql, params) => {
    const runQuery = async (useInsecureTls) => {
      const client = buildClient(useInsecureTls);
      try {
        await client.connect();
        const result = await client.query(sql, params);
        return {
          rows: result.rows || [],
          rowCount: result.rowCount ?? 0,
        };
      } finally {
        try {
          await client.end();
        } catch {
          // ignore close errors
        }
      }
    };

    try {
      return await runQuery(usingInsecureTlsFallback);
    } catch (error) {
      const canAutoFallback = sslRejectUnauthorized === undefined && !usingInsecureTlsFallback;
      if (!canAutoFallback || !isTlsCertificateError(error)) {
        throw error;
      }

      usingInsecureTlsFallback = true;
      if (!warnedInsecureFallback) {
        // eslint-disable-next-line no-console
        console.warn(
          "TLS certificate validation failed for PostgreSQL. Retrying with rejectUnauthorized=false."
        );
        warnedInsecureFallback = true;
      }

      return runQuery(true);
    }
  };
}
