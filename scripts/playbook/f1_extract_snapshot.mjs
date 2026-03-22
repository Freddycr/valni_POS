import fs from "node:fs";
import path from "node:path";
import { ensureDir, nowStamp, parseArgs, printSection, writeJson } from "./lib.mjs";

const args = parseArgs();
const firebaseBaseUrl = String(
  args["firebase-base-url"] || process.env.FIREBASE_BASE_URL || "https://us-central1-registroventas-466719.cloudfunctions.net"
).replace(/\/$/, "");
const outRoot = String(args["out-root"] || "backups/migration_runs");
const runId = String(args["run-id"] || `run_${nowStamp()}`);
const outDir = path.resolve(outRoot, runId);

async function fetchJson(endpoint) {
  const url = `${firebaseBaseUrl}/${endpoint}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error consultando ${endpoint}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  printSection("F1 - Extraccion snapshot");
  ensureDir(outDir);

  const productsPayload = await fetchJson("getProducts");
  const salesPayload = await fetchJson("getSalesData");

  const products = Array.isArray(productsPayload?.products)
    ? productsPayload.products
    : Array.isArray(productsPayload)
      ? productsPayload
      : [];

  const sales = Array.isArray(salesPayload?.sales) ? salesPayload.sales : [];
  const details = Array.isArray(salesPayload?.details) ? salesPayload.details : [];
  const payments = Array.isArray(salesPayload?.payments) ? salesPayload.payments : [];
  const customers = Array.isArray(salesPayload?.customers) ? salesPayload.customers : [];

  const productsPath = path.join(outDir, "products.json");
  const salesPath = path.join(outDir, "sales_package.json");
  const manifestPath = path.join(outDir, "manifest.json");

  writeJson(productsPath, productsPayload);
  writeJson(salesPath, salesPayload);

  const manifest = {
    run_id: runId,
    extracted_at: new Date().toISOString(),
    source: {
      firebase_base_url: firebaseBaseUrl,
      endpoints: ["getProducts", "getSalesData"],
    },
    counts: {
      products: products.length,
      sales: sales.length,
      sale_details: details.length,
      sale_payments: payments.length,
      customers: customers.length,
    },
    files: {
      products: productsPath,
      sales_package: salesPath,
    },
  };

  writeJson(manifestPath, manifest);

  console.log(`Snapshot generado: ${outDir}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
