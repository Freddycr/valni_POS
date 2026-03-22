import test from "node:test";
import assert from "node:assert/strict";

import {
  createSemanticQueryService,
  parseQueryDsl,
  validateQueryDsl,
  compileQueryDsl,
  executeCompiledQuery,
  SemanticQueryValidationError,
  SemanticQueryExecutionError,
} from "../index.js";

test("parseQueryDsl parses JSON string input", () => {
  const parsed = parseQueryDsl(
    JSON.stringify({
      dataset: "sales",
      metrics: ["net_sales"],
      dimensions: ["day"],
      filters: { date_from: "2026-03-01", date_to: "2026-03-03" },
    })
  );

  assert.equal(parsed.dataset, "sales");
  assert.deepEqual(parsed.metrics, ["net_sales"]);
});

test("validateQueryDsl rejects unsupported dataset metrics", () => {
  assert.throws(
    () =>
      validateQueryDsl({
        dataset: "sales",
        metrics: ["stock_value"],
        dimensions: [],
      }),
    SemanticQueryValidationError
  );
});

test("compileQueryDsl injects company_id guard and date filters", () => {
  const validDsl = validateQueryDsl({
    dataset: "sales",
    metrics: ["net_sales", "orders"],
    dimensions: ["day"],
    filters: {
      date_from: "2026-03-01",
      date_to: "2026-03-03",
      store_id: "store-1",
    },
    limit: 50,
  });

  const compiled = compileQueryDsl(validDsl, { companyId: "company-uuid-1" });
  assert.match(compiled.sql, /FROM reporting\.v_sales_fact/);
  assert.match(compiled.sql, /company_id = \$1::uuid/);
  assert.match(compiled.sql, /created_date_peru >= \$2::date/);
  assert.match(compiled.sql, /created_date_peru <= \$3::date/);
  assert.match(compiled.sql, /store_id = \$4/);
  assert.equal(compiled.params.length, 4);
  assert.equal(compiled.params[0], "company-uuid-1");
});

test("executeCompiledQuery returns rows and duration", async () => {
  const compiledQuery = {
    sql: "SELECT 1 AS ok",
    params: [],
    meta: { dataset: "sales" },
  };

  const result = await executeCompiledQuery(compiledQuery, {
    timeoutMs: 2000,
    queryFn: async () => ({ rows: [{ ok: 1 }], rowCount: 1 }),
  });

  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].ok, 1);
  assert.ok(result.durationMs >= 0);
});

test("executeCompiledQuery raises timeout error", async () => {
  const compiledQuery = {
    sql: "SELECT pg_sleep(10)",
    params: [],
    meta: { dataset: "sales" },
  };

  await assert.rejects(
    () =>
      executeCompiledQuery(compiledQuery, {
        timeoutMs: 30,
        queryFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { rows: [], rowCount: 0 };
        },
      }),
    SemanticQueryExecutionError
  );
});

test("createSemanticQueryService run orchestrates parse/validate/compile/execute", async () => {
  const service = createSemanticQueryService({
    timeoutMs: 2000,
    queryFn: async (sql, params) => ({
      rows: [{ sql, params }],
      rowCount: 1,
    }),
  });

  const runResult = await service.run(
    {
      dataset: "inventory",
      metrics: ["stock_value", "sku_count"],
      dimensions: ["store_name"],
      filters: { location_bin: "Tienda" },
      limit: 10,
    },
    { companyId: "company-2" }
  );

  assert.equal(runResult.dsl.dataset, "inventory");
  assert.equal(runResult.result.rowCount, 1);
  assert.match(runResult.compiled.sql, /reporting\.v_inventory_snapshot/);
  assert.equal(runResult.compiled.params[0], "company-2");
});

test("sales_operations dataset supports DNI/IMEI lookup filters", () => {
  const validDsl = validateQueryDsl({
    dataset: "sales_operations",
    metrics: ["item_total", "lines_count"],
    dimensions: ["sale_id", "customer_doc_number", "product_name", "payment_methods"],
    filters: {
      customer_doc_number: "12345678",
      captured_imei: "354196710049378",
    },
    limit: 30,
  });

  const compiled = compileQueryDsl(validDsl, {
    companyId: "00000000-0000-0000-0000-000000000099",
  });

  assert.match(compiled.sql, /FROM reporting\.v_sales_operations_detail/);
  assert.match(compiled.sql, /customer_doc_number = \$2/);
  assert.match(compiled.sql, /captured_imei = \$3/);
  assert.equal(compiled.params[1], "12345678");
  assert.equal(compiled.params[2], "354196710049378");
});

test("inventory ignores date filters and forces current stock + product scope", () => {
  const validDsl = validateQueryDsl({
    dataset: "inventory",
    metrics: ["on_hand_qty", "stock_value"],
    dimensions: ["store_name", "location_bin"],
    filters: {
      date_from: "2026-02-01",
      date_to: "2026-02-28",
      location_bin: "Almacen",
    },
    limit: 50,
  });

  assert.equal(validDsl.filters.date_from, null);
  assert.equal(validDsl.filters.date_to, null);

  const compiled = compileQueryDsl(validDsl, { companyId: "00000000-0000-0000-0000-000000000123" });
  assert.match(compiled.sql, /FROM reporting\.v_inventory_snapshot/);
  assert.match(compiled.sql, /COALESCE\(on_hand, 0\) > 0/);
  assert.match(compiled.sql, /LOWER\(COALESCE\(product_type::text, ''\)\) IN \('smartphone', 'tablet', 'accessory'\)/);
  assert.doesNotMatch(compiled.sql, />= \$\d+::date/);
  assert.doesNotMatch(compiled.sql, /<= \$\d+::date/);
});
