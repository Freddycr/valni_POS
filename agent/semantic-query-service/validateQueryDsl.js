import { DATASET_CATALOG, DATASET_KEYS, DEFAULT_LIMIT, DEFAULT_MAX_LIMIT } from "./catalog.js";
import { SemanticQueryValidationError } from "./errors.js";

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new SemanticQueryValidationError(`${fieldName} debe ser un arreglo.`);
  }
  if (value.length === 0) {
    throw new SemanticQueryValidationError(`${fieldName} no puede estar vacio.`);
  }

  const normalized = [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
  if (normalized.length === 0) {
    throw new SemanticQueryValidationError(`${fieldName} no contiene valores validos.`);
  }
  return normalized;
}

function validateDate(dateStr, fieldName) {
  if (dateStr == null) return null;
  const raw = String(dateStr).trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new SemanticQueryValidationError(`${fieldName} debe usar formato YYYY-MM-DD.`);
  }
  return raw;
}

function normalizeScalarFilterValue(value, fieldName) {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      throw new SemanticQueryValidationError(`${fieldName} no puede ser cadena vacia.`);
    }
    if (normalized.length > 120) {
      throw new SemanticQueryValidationError(`${fieldName} excede longitud maxima (120).`);
    }
    // Hardening: block common SQL injection markers in free-text filters.
    if (/[;\u0000]|--|\/\*/.test(normalized)) {
      throw new SemanticQueryValidationError(`${fieldName} contiene caracteres no permitidos.`);
    }
    return normalized;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SemanticQueryValidationError(`${fieldName} debe ser numero finito.`);
    }
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  throw new SemanticQueryValidationError(`${fieldName} debe ser string/number/boolean.`);
}

function normalizeFilterValue(value, fieldName) {
  if (value == null) return null;

  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new SemanticQueryValidationError(`${fieldName} no puede tener mas de 100 elementos.`);
    }
    const normalizedItems = value.map((item, index) =>
      normalizeScalarFilterValue(item, `${fieldName}[${index}]`)
    );
    if (normalizedItems.length === 0) {
      return null;
    }
    return [...new Set(normalizedItems)];
  }

  return normalizeScalarFilterValue(value, fieldName);
}

function normalizeOrderBy(orderBy, selectedAliases) {
  if (orderBy == null) return [];
  if (!Array.isArray(orderBy)) {
    throw new SemanticQueryValidationError("order_by debe ser un arreglo.");
  }

  return orderBy.map((row, index) => {
    if (typeof row !== "object" || row == null) {
      throw new SemanticQueryValidationError(`order_by[${index}] debe ser un objeto.`);
    }
    const field = String(row.field || "").trim();
    if (!field) {
      throw new SemanticQueryValidationError(`order_by[${index}].field es obligatorio.`);
    }
    if (!selectedAliases.has(field)) {
      throw new SemanticQueryValidationError(
        `order_by[${index}].field="${field}" no esta en metrics/dimensions seleccionadas.`
      );
    }
    const direction = String(row.direction || "asc").toLowerCase();
    if (!["asc", "desc"].includes(direction)) {
      throw new SemanticQueryValidationError(`order_by[${index}].direction debe ser asc o desc.`);
    }
    return { field, direction };
  });
}

export function validateQueryDsl(rawDsl, options = {}) {
  const maxLimit = Number(options.maxLimit || DEFAULT_MAX_LIMIT);
  const dataset = String(rawDsl.dataset || "").trim();
  if (!dataset) {
    throw new SemanticQueryValidationError("dataset es obligatorio.");
  }
  if (!DATASET_KEYS.includes(dataset)) {
    throw new SemanticQueryValidationError(
      `dataset no soportado: "${dataset}". Permitidos: ${DATASET_KEYS.join(", ")}.`
    );
  }

  const datasetConfig = DATASET_CATALOG[dataset];
  const metrics = normalizeStringArray(rawDsl.metrics || [], "metrics");

  const dimensions = rawDsl.dimensions == null
    ? []
    : normalizeStringArray(rawDsl.dimensions, "dimensions");

  const invalidMetrics = metrics.filter((m) => !(m in datasetConfig.metrics));
  if (invalidMetrics.length > 0) {
    throw new SemanticQueryValidationError(`metrics no permitidas para dataset "${dataset}": ${invalidMetrics.join(", ")}.`);
  }

  const invalidDimensions = dimensions.filter((d) => !(d in datasetConfig.dimensions));
  if (invalidDimensions.length > 0) {
    throw new SemanticQueryValidationError(
      `dimensions no permitidas para dataset "${dataset}": ${invalidDimensions.join(", ")}.`
    );
  }

  const filters = (typeof rawDsl.filters === "object" && rawDsl.filters != null)
    ? { ...rawDsl.filters }
    : {};

  const allowedFilterKeys = new Set([
    ...Object.keys(datasetConfig.filters),
    "date_from",
    "date_to",
  ]);

  for (const key of Object.keys(filters)) {
    if (!allowedFilterKeys.has(key)) {
      throw new SemanticQueryValidationError(`Filtro no permitido para dataset "${dataset}": ${key}.`);
    }
  }

  let dateFrom = null;
  let dateTo = null;
  if (dataset !== "inventory") {
    dateFrom = validateDate(filters.date_from, "filters.date_from");
    dateTo = validateDate(filters.date_to, "filters.date_to");
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new SemanticQueryValidationError("filters.date_from no puede ser mayor a filters.date_to.");
    }
  }

  for (const filterKey of Object.keys(datasetConfig.filters)) {
    if (!(filterKey in filters)) continue;
    filters[filterKey] = normalizeFilterValue(filters[filterKey], `filters.${filterKey}`);
  }

  const parsedLimit = rawDsl.limit == null ? DEFAULT_LIMIT : Number(rawDsl.limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    throw new SemanticQueryValidationError("limit debe ser un entero positivo.");
  }
  if (parsedLimit > maxLimit) {
    throw new SemanticQueryValidationError(`limit excede el maximo permitido (${maxLimit}).`);
  }

  const selectedAliases = new Set([...metrics, ...dimensions]);
  const orderBy = normalizeOrderBy(rawDsl.order_by, selectedAliases);

  return {
    dataset,
    metrics,
    dimensions,
    filters: {
      ...filters,
      date_from: dateFrom,
      date_to: dateTo,
    },
    limit: parsedLimit,
    order_by: orderBy,
  };
}
