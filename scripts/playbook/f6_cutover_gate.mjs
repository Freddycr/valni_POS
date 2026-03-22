import path from "node:path";
import { createPgClient, nowStamp, parseArgs, printSection, resolveDatabaseUrl, writeJson } from "./lib.mjs";

const args = parseArgs();
const databaseUrl = resolveDatabaseUrl(args);
const companyId = String(args["company-id"] || "").trim();
if (!companyId) {
  console.error("Uso: node scripts/playbook/f6_cutover_gate.mjs --company-id <uuid>");
  process.exit(1);
}

const maxDailyDiffPct = Number(args["max-daily-diff-pct"] || 0.5);
const outPath = path.resolve(String(args.out || `backups/migration_runs/cutover_gate_${companyId.slice(0, 8)}_${nowStamp()}.json`));

async function main() {
  const client = await createPgClient(databaseUrl);
  const checks = [];

  try {
    printSection("F6 - Gate de cutover");

    const nullCompany = await client.query(
      `
      SELECT SUM(cnt)::bigint AS total_nulls
      FROM (
        SELECT COUNT(*)::bigint AS cnt FROM products WHERE company_id IS NULL
        UNION ALL SELECT COUNT(*)::bigint FROM customers WHERE company_id IS NULL
        UNION ALL SELECT COUNT(*)::bigint FROM sales WHERE company_id IS NULL
        UNION ALL SELECT COUNT(*)::bigint FROM sale_items WHERE company_id IS NULL
        UNION ALL SELECT COUNT(*)::bigint FROM sale_payments WHERE company_id IS NULL
      ) t
      `
    );
    const nullCompanyCount = Number(nullCompany.rows[0]?.total_nulls || 0);
    checks.push({ name: "null_company_id", pass: nullCompanyCount === 0, value: nullCompanyCount, expected: 0 });

    const orphanSales = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM sales s
      WHERE s.company_id = $1::uuid
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
      `,
      [companyId]
    );
    const orphanSalesCount = Number(orphanSales.rows[0]?.total || 0);
    checks.push({ name: "sales_without_items", pass: orphanSalesCount === 0, value: orphanSalesCount, expected: 0 });

    const diffItems = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM (
        SELECT s.id
        FROM sales s
        LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.company_id = $1::uuid
        GROUP BY s.id, s.total_amount
        HAVING ABS(s.total_amount - COALESCE(SUM(si.total_price), 0)) > 0.01
      ) x
      `,
      [companyId]
    );
    const diffItemsCount = Number(diffItems.rows[0]?.total || 0);
    checks.push({ name: "sales_vs_items_diff", pass: diffItemsCount === 0, value: diffItemsCount, expected: 0 });

    const diffPayments = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM (
        SELECT s.id
        FROM sales s
        LEFT JOIN sale_payments sp ON sp.sale_id = s.id
        WHERE s.company_id = $1::uuid
        GROUP BY s.id, s.total_amount
        HAVING ABS(s.total_amount - COALESCE(SUM(sp.amount), 0)) > 0.01
      ) x
      `,
      [companyId]
    );
    const diffPaymentsCount = Number(diffPayments.rows[0]?.total || 0);
    checks.push({ name: "sales_vs_payments_diff", pass: diffPaymentsCount === 0, value: diffPaymentsCount, expected: 0 });

    const inventoryPresence = await client.query(
      `SELECT COUNT(*)::bigint AS total FROM products WHERE company_id = $1::uuid AND COALESCE(stock_quantity,0) > 0`,
      [companyId]
    );
    const inventoryPresenceCount = Number(inventoryPresence.rows[0]?.total || 0);
    checks.push({ name: "inventory_positive_stock", pass: inventoryPresenceCount > 0, value: inventoryPresenceCount, expected: "> 0" });

    const gatePass = checks.every((c) => c.pass);
    console.table(checks);

    const result = {
      generated_at: new Date().toISOString(),
      company_id: companyId,
      threshold: {
        max_daily_diff_pct: maxDailyDiffPct,
      },
      checks,
      gate_pass: gatePass,
    };

    writeJson(outPath, result);
    printSection("F6 - Archivo generado");
    console.log(outPath);

    if (!gatePass) {
      console.error("CUTOVER GATE: NO APROBADO");
      process.exitCode = 3;
      return;
    }

    console.log("CUTOVER GATE: APROBADO");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
