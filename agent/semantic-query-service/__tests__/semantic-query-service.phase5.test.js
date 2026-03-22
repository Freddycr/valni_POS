import test from "node:test";
import assert from "node:assert/strict";

import {
  createSemanticQueryService,
  validateQueryDsl,
  compileQueryDsl,
  SemanticQueryValidationError,
} from "../index.js";

const BASE_DSL = {
  dataset: "sales",
  metrics: ["net_sales", "orders"],
  dimensions: ["day"],
  filters: {
    date_from: "2026-03-01",
    date_to: "2026-03-03",
  },
  limit: 50,
};

test("security: rejects SQL injection markers in filter values", () => {
  assert.throws(
    () =>
      validateQueryDsl({
        ...BASE_DSL,
        filters: {
          ...BASE_DSL.filters,
          store_id: "tienda'; DROP TABLE sales; --",
        },
      }),
    SemanticQueryValidationError
  );
});

test("security: compiles filters as SQL parameters, never inline values", () => {
  const validDsl = validateQueryDsl({
    ...BASE_DSL,
    filters: {
      ...BASE_DSL.filters,
      store_id: "store-o'hara",
    },
  });
  const compiled = compileQueryDsl(validDsl, {
    companyId: "00000000-0000-0000-0000-000000000001",
  });

  assert.equal(compiled.params[compiled.params.length - 1], "store-o'hara");
  assert.ok(!compiled.sql.includes("store-o'hara"));
  assert.match(compiled.sql, /store_id = \$\d+/);
});

test("cache: repeated query for same company and DSL uses cached response", async () => {
  let calls = 0;
  const service = createSemanticQueryService({
    cacheEnabled: true,
    cacheTtlMs: 60_000,
    queryFn: async () => {
      calls += 1;
      return { rows: [{ seq: calls }], rowCount: 1 };
    },
  });

  const run1 = await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000aa",
  });
  const run2 = await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000aa",
  });

  assert.equal(calls, 1);
  assert.equal(run1.result.rows[0].seq, 1);
  assert.equal(run2.result.rows[0].seq, 1);
  assert.equal(run1.result.meta.cache_hit, false);
  assert.equal(run2.result.meta.cache_hit, true);
});

test("isolation: company A and company B never share cache entries", async () => {
  const seenCompanyIds = [];
  const service = createSemanticQueryService({
    cacheEnabled: true,
    cacheTtlMs: 60_000,
    queryFn: async (_sql, params) => {
      seenCompanyIds.push(params[0]);
      return { rows: [{ companyId: params[0] }], rowCount: 1 };
    },
  });

  const companyA = "00000000-0000-0000-0000-00000000000a";
  const companyB = "00000000-0000-0000-0000-00000000000b";

  const runA = await service.run(BASE_DSL, { companyId: companyA });
  const runB = await service.run(BASE_DSL, { companyId: companyB });

  assert.equal(seenCompanyIds.length, 2);
  assert.deepEqual(seenCompanyIds, [companyA, companyB]);
  assert.equal(runA.result.rows[0].companyId, companyA);
  assert.equal(runB.result.rows[0].companyId, companyB);
});

test("consistency: same DSL yields same report totals (daily vs commercial)", async () => {
  const service = createSemanticQueryService({
    cacheEnabled: false,
    queryFn: async () => ({
      rows: [{ day: "2026-03-01", net_sales: "10741.00", orders: 5 }],
      rowCount: 1,
    }),
  });

  const dailyReport = await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000cc",
  });
  const commercialPanel = await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000cc",
  });

  assert.deepEqual(dailyReport.result.rows, commercialPanel.result.rows);
  assert.equal(dailyReport.result.rows[0].net_sales, "10741.00");
});

test("load: concurrent identical queries are deduplicated in-flight", async () => {
  let calls = 0;
  const service = createSemanticQueryService({
    cacheEnabled: true,
    cacheTtlMs: 60_000,
    queryFn: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { rows: [{ ok: true }], rowCount: 1 };
    },
  });

  const tasks = Array.from({ length: 25 }, () =>
    service.run(BASE_DSL, {
      companyId: "00000000-0000-0000-0000-0000000000dd",
    })
  );
  const results = await Promise.all(tasks);

  assert.equal(calls, 1);
  assert.equal(results.length, 25);
  assert.ok(results.every((row) => row.result.rowCount === 1));
});

test("load+cache: 100 requests with 10 unique keys execute at most 10 queries", async () => {
  let calls = 0;
  const service = createSemanticQueryService({
    cacheEnabled: true,
    cacheTtlMs: 60_000,
    queryFn: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { rows: [{ ok: true }], rowCount: 1 };
    },
  });

  const companies = Array.from({ length: 10 }, (_, i) =>
    `00000000-0000-0000-0000-0000000001${String(i).padStart(2, "0")}`
  );

  const tasks = Array.from({ length: 100 }, (_, i) =>
    service.run(BASE_DSL, {
      companyId: companies[i % companies.length],
    })
  );

  await Promise.all(tasks);
  assert.ok(calls <= 10);
});

test("cache TTL: query expires and executes again after ttl", async () => {
  let calls = 0;
  const service = createSemanticQueryService({
    cacheEnabled: true,
    cacheTtlMs: 20,
    queryFn: async () => {
      calls += 1;
      return { rows: [{ seq: calls }], rowCount: 1 };
    },
  });

  await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000ee",
  });
  await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000ee",
  });
  await new Promise((resolve) => setTimeout(resolve, 35));
  await service.run(BASE_DSL, {
    companyId: "00000000-0000-0000-0000-0000000000ee",
  });

  assert.equal(calls, 2);
});

