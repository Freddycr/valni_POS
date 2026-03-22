import { DATASET_CATALOG } from "./catalog.js";
import { SemanticQueryValidationError } from "./errors.js";

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value) && value !== "";
}

function addFilterClause({ clauses, params, expression, value, cast = "" }) {
  if (value == null) return;

  if (Array.isArray(value)) {
    const cleaned = value.filter((v) => isScalar(v));
    if (cleaned.length === 0) return;
    params.push(cleaned);
    const idx = params.length;
    clauses.push(`${expression} = ANY($${idx}${cast})`);
    return;
  }

  if (isScalar(value)) {
    params.push(value);
    const idx = params.length;
    clauses.push(`${expression} = $${idx}${cast}`);
  }
}

function buildOrderBy(validDsl, metricAliases, dimensionAliases) {
  if (validDsl.order_by.length > 0) {
    return `ORDER BY ${validDsl.order_by.map((o) => `${o.field} ${o.direction.toUpperCase()}`).join(", ")}`;
  }

  if (validDsl.dimensions.length > 0) {
    return `ORDER BY ${validDsl.dimensions.map((d) => `${d} ASC`).join(", ")}`;
  }

  return `ORDER BY ${metricAliases[0]} DESC`;
}

export function compileQueryDsl(validDsl, context) {
  const companyId = String(context?.companyId || "").trim();
  if (!companyId) {
    throw new SemanticQueryValidationError("companyId es obligatorio para compilar consultas.");
  }

  const datasetConfig = DATASET_CATALOG[validDsl.dataset];
  if (!datasetConfig) {
    throw new SemanticQueryValidationError(`Dataset no configurado: ${validDsl.dataset}`);
  }

  const selectParts = [];
  const groupByParts = [];
  const dimensionAliases = [];
  const metricAliases = [];

  for (const dimension of validDsl.dimensions) {
    const expression = datasetConfig.dimensions[dimension];
    selectParts.push(`${expression} AS ${dimension}`);
    groupByParts.push(expression);
    dimensionAliases.push(dimension);
  }

  for (const metric of validDsl.metrics) {
    const expression = datasetConfig.metrics[metric];
    selectParts.push(`${expression} AS ${metric}`);
    metricAliases.push(metric);
  }

  const params = [companyId];
  const whereClauses = ["company_id = $1::uuid"];

  if (validDsl.dataset === "inventory") {
    // Inventory is an "as of now" snapshot: only items with current stock > 0,
    // restricted to equipment + accessories.
    whereClauses.push("COALESCE(on_hand, 0) > 0");
    whereClauses.push("LOWER(COALESCE(product_type::text, '')) IN ('smartphone', 'tablet', 'accessory')");
  } else {
    const dateColumn = datasetConfig.dateColumn;
    if (validDsl.filters.date_from) {
      params.push(validDsl.filters.date_from);
      whereClauses.push(`${dateColumn} >= $${params.length}::date`);
    }
    if (validDsl.filters.date_to) {
      params.push(validDsl.filters.date_to);
      whereClauses.push(`${dateColumn} <= $${params.length}::date`);
    }
  }

  for (const [filterKey, columnExpression] of Object.entries(datasetConfig.filters)) {
    addFilterClause({
      clauses: whereClauses,
      params,
      expression: columnExpression,
      value: validDsl.filters[filterKey],
    });
  }

  const groupBySql = groupByParts.length > 0 ? `GROUP BY ${groupByParts.join(", ")}` : "";
  const orderBySql = buildOrderBy(validDsl, metricAliases, dimensionAliases);
  const limitSql = `LIMIT ${validDsl.limit}`;

  const sql = [
    `SELECT ${selectParts.join(", ")}`,
    `FROM ${datasetConfig.view}`,
    `WHERE ${whereClauses.join(" AND ")}`,
    groupBySql,
    orderBySql,
    limitSql,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    params,
    meta: {
      dataset: validDsl.dataset,
      view: datasetConfig.view,
      metrics: validDsl.metrics,
      dimensions: validDsl.dimensions,
      limit: validDsl.limit,
    },
  };
}
