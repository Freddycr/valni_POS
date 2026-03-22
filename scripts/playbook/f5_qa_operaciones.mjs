import path from "node:path";
import { createPgClient, nowStamp, parseArgs, printSection, resolveDatabaseUrl, writeJson } from "./lib.mjs";

const args = parseArgs();
const databaseUrl = resolveDatabaseUrl(args);
const companyId = String(args["company-id"] || "").trim();
if (!companyId) {
  console.error("Uso: node scripts/playbook/f5_qa_operaciones.mjs --company-id <uuid> [--dni <doc>] [--imei <imei>] [--day <YYYY-MM-DD>]");
  process.exit(1);
}

const dni = String(args.dni || "").trim();
const imei = String(args.imei || "").trim();
const day = String(args.day || "").trim();
const outPath = path.resolve(String(args.out || `backups/migration_runs/qa_ops_${companyId.slice(0, 8)}_${nowStamp()}.json`));

async function queryByDni(client, value) {
  return client.query(
    `
    SELECT
      sale_id,
      day,
      time,
      customer_name,
      customer_doc_number,
      product_name,
      quantity,
      unit_price,
      item_total_amount,
      sale_total_amount,
      payment_methods,
      captured_imei,
      captured_serial,
      store_name,
      seller_name
    FROM reporting.v_sales_operations_detail
    WHERE company_id = $1::uuid
      AND customer_doc_number = $2
    ORDER BY day DESC, time DESC
    LIMIT 200
    `,
    [companyId, value]
  );
}

async function queryByImei(client, value) {
  return client.query(
    `
    SELECT
      sale_id,
      day,
      time,
      customer_name,
      customer_doc_number,
      product_name,
      quantity,
      unit_price,
      item_total_amount,
      sale_total_amount,
      payment_methods,
      captured_imei,
      captured_serial,
      store_name,
      seller_name
    FROM reporting.v_sales_operations_detail
    WHERE company_id = $1::uuid
      AND (
        captured_imei = $2
        OR lookup_code = $2
      )
    ORDER BY day DESC, time DESC
    LIMIT 200
    `,
    [companyId, value]
  );
}

async function queryDay(client, value) {
  return client.query(
    `
    SELECT
      day,
      COUNT(DISTINCT sale_id)::bigint AS sales_count,
      SUM(item_total_amount)::numeric(14,2) AS item_total
    FROM reporting.v_sales_operations_detail
    WHERE company_id = $1::uuid
      AND day = $2::date
    GROUP BY day
    `,
    [companyId, value]
  );
}

async function main() {
  const client = await createPgClient(databaseUrl);
  const output = {
    generated_at: new Date().toISOString(),
    company_id: companyId,
    filters: { dni: dni || null, imei: imei || null, day: day || null },
    results: {},
  };

  try {
    printSection("F5 - QA operativo");

    if (dni) {
      const byDni = await queryByDni(client, dni);
      console.log(`Resultados por DNI ${dni}: ${byDni.rowCount}`);
      console.table(byDni.rows.slice(0, 20));
      output.results.by_dni = byDni.rows;
    }

    if (imei) {
      const byImei = await queryByImei(client, imei);
      console.log(`Resultados por IMEI ${imei}: ${byImei.rowCount}`);
      console.table(byImei.rows.slice(0, 20));
      output.results.by_imei = byImei.rows;
    }

    if (day) {
      const byDay = await queryDay(client, day);
      console.log(`Resumen diario ${day}: ${byDay.rowCount}`);
      console.table(byDay.rows);
      output.results.by_day = byDay.rows;
    }

    if (!dni && !imei && !day) {
      const sample = await client.query(
        `
        SELECT
          day,
          customer_name,
          customer_doc_number,
          product_name,
          item_total_amount,
          sale_total_amount,
          payment_methods,
          captured_imei,
          captured_serial
        FROM reporting.v_sales_operations_detail
        WHERE company_id = $1::uuid
        ORDER BY day DESC, time DESC
        LIMIT 50
        `,
        [companyId]
      );
      console.table(sample.rows.slice(0, 20));
      output.results.sample = sample.rows;
    }

    writeJson(outPath, output);
    printSection("F5 - Archivo generado");
    console.log(outPath);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
