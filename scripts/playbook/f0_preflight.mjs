import { createPgClient, parseArgs, printSection, resolveDatabaseUrl } from "./lib.mjs";

const args = parseArgs();
const databaseUrl = resolveDatabaseUrl(args);
const companyId = String(args["company-id"] || "").trim() || null;

const requiredRelations = [
  "public.companies",
  "public.stores",
  "public.products",
  "public.customers",
  "public.sales",
  "public.sale_items",
  "public.sale_payments",
  "public.company_receipt_settings",
  "public.inventory_balances",
  "reporting.v_sales_fact",
  "reporting.v_sale_items_fact",
  "reporting.v_payments_fact",
  "reporting.v_inventory_snapshot",
  "reporting.v_sales_operations_detail",
  "public.agent_query_logs",
];

async function main() {
  const client = await createPgClient(databaseUrl);
  const failures = [];

  try {
    printSection("F0 - Objetos requeridos");
    const relCheck = await client.query(
      `
      SELECT
        name AS relation,
        to_regclass(name) IS NOT NULL AS exists
      FROM unnest($1::text[]) AS t(name)
      ORDER BY 1
      `,
      [requiredRelations]
    );

    const missing = relCheck.rows.filter((r) => !r.exists).map((r) => r.relation);
    console.table(relCheck.rows);
    if (missing.length > 0) failures.push(`Faltan relaciones/vistas: ${missing.join(", ")}`);

    printSection("F0 - Integridad company_id");
    const nullCompanyChecks = await client.query(`
      SELECT 'products' AS table_name, COUNT(*)::bigint AS null_company_rows FROM public.products WHERE company_id IS NULL
      UNION ALL
      SELECT 'customers', COUNT(*)::bigint FROM public.customers WHERE company_id IS NULL
      UNION ALL
      SELECT 'sales', COUNT(*)::bigint FROM public.sales WHERE company_id IS NULL
      UNION ALL
      SELECT 'sale_items', COUNT(*)::bigint FROM public.sale_items WHERE company_id IS NULL
      UNION ALL
      SELECT 'sale_payments', COUNT(*)::bigint FROM public.sale_payments WHERE company_id IS NULL
      ORDER BY 1
    `);
    console.table(nullCompanyChecks.rows);

    const nullCompanyProblems = nullCompanyChecks.rows.filter((r) => Number(r.null_company_rows) > 0);
    if (nullCompanyProblems.length > 0) {
      failures.push("Existen filas con company_id NULL en tablas criticas.");
    }

    printSection("F0 - Salud de reporting");
    const reportingSample = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM reporting.v_sales_fact) AS sales_fact_rows,
        (SELECT COUNT(*) FROM reporting.v_sale_items_fact) AS sale_items_fact_rows,
        (SELECT COUNT(*) FROM reporting.v_payments_fact) AS payments_fact_rows,
        (SELECT COUNT(*) FROM reporting.v_inventory_snapshot) AS inventory_snapshot_rows,
        (SELECT COUNT(*) FROM reporting.v_sales_operations_detail) AS sales_operations_rows
    `);
    console.table(reportingSample.rows);

    if (companyId) {
      printSection("F0 - Empresa objetivo");
      const companyCheck = await client.query(
        `SELECT id, name FROM public.companies WHERE id = $1::uuid LIMIT 1`,
        [companyId]
      );
      console.table(companyCheck.rows);
      if (companyCheck.rowCount === 0) failures.push(`No existe company_id objetivo: ${companyId}`);
    }

    printSection("Resultado F0");
    if (failures.length > 0) {
      console.error("Preflight FALLIDO");
      failures.forEach((f) => console.error(`- ${f}`));
      process.exitCode = 1;
      return;
    }

    console.log("Preflight OK");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
