import path from "node:path";
import { createPgClient, nowStamp, parseArgs, printSection, resolveDatabaseUrl, writeJson } from "./lib.mjs";

const args = parseArgs();
const databaseUrl = resolveDatabaseUrl(args);
const companyId = String(args["company-id"] || "").trim();
if (!companyId) {
  console.error("Uso: node scripts/playbook/f4_reconcile.mjs --company-id <uuid>");
  process.exit(1);
}

const outPath = path.resolve(String(args["out"] || `backups/migration_runs/reconcile_${companyId.slice(0, 8)}_${nowStamp()}.json`));

async function main() {
  const client = await createPgClient(databaseUrl);

  try {
    printSection("F4 - Conteos base");
    const baseCounts = await client.query(
      `
      SELECT 'products' AS entity, COUNT(*)::bigint AS total FROM products WHERE company_id = $1::uuid
      UNION ALL
      SELECT 'customers', COUNT(*)::bigint FROM customers WHERE company_id = $1::uuid
      UNION ALL
      SELECT 'sales', COUNT(*)::bigint FROM sales WHERE company_id = $1::uuid
      UNION ALL
      SELECT 'sale_items', COUNT(*)::bigint FROM sale_items WHERE company_id = $1::uuid
      UNION ALL
      SELECT 'sale_payments', COUNT(*)::bigint FROM sale_payments WHERE company_id = $1::uuid
      ORDER BY 1
      `,
      [companyId]
    );
    console.table(baseCounts.rows);

    printSection("F4 - Inventario por ubicacion");
    const inventoryByLocation = await client.query(
      `
      SELECT COALESCE(location_bin, 'SIN_UBICACION') AS location_bin, COUNT(*)::bigint AS products
      FROM products
      WHERE company_id = $1::uuid
      GROUP BY 1
      ORDER BY 1
      `,
      [companyId]
    );
    console.table(inventoryByLocation.rows);

    printSection("F4 - Ventas por dia (America/Lima)");
    const dailySales = await client.query(
      `
      SELECT
        (created_at AT TIME ZONE 'America/Lima')::date AS day,
        COUNT(*)::bigint AS sales_count,
        SUM(total_amount)::numeric(14,2) AS total_sales
      FROM sales
      WHERE company_id = $1::uuid
      GROUP BY 1
      ORDER BY 1
      `,
      [companyId]
    );
    console.table(dailySales.rows);

    printSection("F4 - Consistencia venta vs items");
    const salesVsItems = await client.query(
      `
      SELECT
        s.id AS sale_id,
        s.invoice_number,
        s.total_amount,
        COALESCE(SUM(si.total_price), 0)::numeric(14,2) AS items_total,
        (s.total_amount - COALESCE(SUM(si.total_price), 0))::numeric(14,2) AS diff
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.company_id = $1::uuid
      GROUP BY s.id, s.invoice_number, s.total_amount
      HAVING ABS(s.total_amount - COALESCE(SUM(si.total_price), 0)) > 0.01
      ORDER BY ABS(s.total_amount - COALESCE(SUM(si.total_price), 0)) DESC
      LIMIT 200
      `,
      [companyId]
    );
    console.table(salesVsItems.rows.slice(0, 20));

    printSection("F4 - Consistencia venta vs pagos");
    const salesVsPayments = await client.query(
      `
      SELECT
        s.id AS sale_id,
        s.invoice_number,
        s.total_amount,
        COALESCE(SUM(sp.amount), 0)::numeric(14,2) AS paid_total,
        (s.total_amount - COALESCE(SUM(sp.amount), 0))::numeric(14,2) AS diff
      FROM sales s
      LEFT JOIN sale_payments sp ON sp.sale_id = s.id
      WHERE s.company_id = $1::uuid
      GROUP BY s.id, s.invoice_number, s.total_amount
      HAVING ABS(s.total_amount - COALESCE(SUM(sp.amount), 0)) > 0.01
      ORDER BY ABS(s.total_amount - COALESCE(SUM(sp.amount), 0)) DESC
      LIMIT 200
      `,
      [companyId]
    );
    console.table(salesVsPayments.rows.slice(0, 20));

    const output = {
      generated_at: new Date().toISOString(),
      company_id: companyId,
      base_counts: baseCounts.rows,
      inventory_by_location: inventoryByLocation.rows,
      daily_sales: dailySales.rows,
      inconsistencies: {
        sales_vs_items: {
          count: salesVsItems.rowCount,
          rows: salesVsItems.rows,
        },
        sales_vs_payments: {
          count: salesVsPayments.rowCount,
          rows: salesVsPayments.rows,
        },
      },
    };

    writeJson(outPath, output);
    printSection("F4 - Archivo generado");
    console.log(outPath);

    if (salesVsItems.rowCount > 0 || salesVsPayments.rowCount > 0) {
      console.error("Reconciliacion con observaciones: revisar inconsistencias.");
      process.exitCode = 2;
      return;
    }

    console.log("Reconciliacion OK.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
