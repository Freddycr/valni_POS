import { parseQueryDsl } from "./parseQueryDsl.js";
import { validateQueryDsl } from "./validateQueryDsl.js";
import { compileQueryDsl } from "./compileQueryDsl.js";
import { executeCompiledQuery } from "./executeQuery.js";
import { DEFAULT_MAX_LIMIT } from "./catalog.js";
import {
  createQueryCache,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
} from "./queryCache.js";

function stableStringify(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${pairs.join(",")}}`;
}

function cloneIfPossible(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function markCached(response, cached) {
  return {
    ...response,
    result: {
      ...response.result,
      meta: {
        ...(response.result?.meta || {}),
        cache_hit: Boolean(cached),
      },
    },
  };
}

export function createSemanticQueryService(options = {}) {
  const maxLimit = Number(options.maxLimit || DEFAULT_MAX_LIMIT);
  const timeoutMs = Number(options.timeoutMs || 5000);
  const queryFn = options.queryFn;
  const cacheEnabled = options.cacheEnabled !== false;
  const cacheTtlMs = Number(options.cacheTtlMs || DEFAULT_CACHE_TTL_MS);
  const cacheMaxEntries = Number(options.cacheMaxEntries || DEFAULT_CACHE_MAX_ENTRIES);
  const cache = cacheEnabled
    ? createQueryCache({ ttlMs: cacheTtlMs, maxEntries: cacheMaxEntries })
    : null;

  async function runPipeline(input, context) {
    const rawDsl = parseQueryDsl(input);
    const validDsl = validateQueryDsl(rawDsl, { maxLimit });
    const compiled = compileQueryDsl(validDsl, context);
    const executed = await executeCompiledQuery(compiled, {
      queryFn,
      timeoutMs,
    });

    return {
      dsl: validDsl,
      compiled,
      result: executed,
    };
  }

  return {
    parse(input) {
      return parseQueryDsl(input);
    },

    validate(rawDsl) {
      return validateQueryDsl(rawDsl, { maxLimit });
    },

    compile(validDsl, context) {
      return compileQueryDsl(validDsl, context);
    },

    async execute(compiledQuery) {
      return executeCompiledQuery(compiledQuery, {
        queryFn,
        timeoutMs,
      });
    },

    async run(input, context) {
      if (!cacheEnabled || !cache) {
        return runPipeline(input, context);
      }

      const parsed = parseQueryDsl(input);
      const validated = validateQueryDsl(parsed, { maxLimit });
      const companyId = String(context?.companyId || "").trim();
      const cacheKey = stableStringify({ companyId, dsl: validated });

      const cached = cache.get(cacheKey);
      if (cached) {
        return markCached(cloneIfPossible(cached), true);
      }

      const inFlight = cache.getInFlight(cacheKey);
      if (inFlight) {
        const sharedResult = await inFlight;
        return markCached(cloneIfPossible(sharedResult), true);
      }

      const executionPromise = runPipeline(validated, context).then((fresh) => {
        cache.set(cacheKey, fresh);
        return fresh;
      });
      cache.setInFlight(cacheKey, executionPromise);

      try {
        const freshResult = await executionPromise;
        return markCached(cloneIfPossible(freshResult), false);
      } finally {
        cache.clearInFlight(cacheKey);
      }
    },

    getCacheStats() {
      return cache ? cache.getStats() : null;
    },
  };
}

export { parseQueryDsl } from "./parseQueryDsl.js";
export { validateQueryDsl } from "./validateQueryDsl.js";
export { compileQueryDsl } from "./compileQueryDsl.js";
export { executeCompiledQuery, createPgQueryFn } from "./executeQuery.js";
export { DATASET_CATALOG, DEFAULT_LIMIT, DEFAULT_MAX_LIMIT } from "./catalog.js";
export {
  createQueryCache,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
} from "./queryCache.js";
export {
  SemanticQueryError,
  SemanticQueryExecutionError,
  SemanticQueryValidationError,
} from "./errors.js";
