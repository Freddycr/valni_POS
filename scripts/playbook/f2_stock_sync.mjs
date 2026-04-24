import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { nowStamp, parseArgs, printSection, toBool, writeJson } from "./lib.mjs";

const args = parseArgs();

const runDir = String(args["run-dir"] || "").trim();
if (!runDir) {
  console.error("Uso: node scripts/playbook/f2_stock_sync.mjs --run-dir <path> --company-id <uuid>");
  process.exit(1);
}

const supabaseUrl = String(
  args["supabase-url"] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ypeolvspffwxjtqxphzr.supabase.co"
).trim();

function parseDotEnvLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;

  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadDotEnvFile(filePath) {
  const env = {};
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return env;
  const content = fs.readFileSync(resolved, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) continue;
    if (!(parsed.key in env)) env[parsed.key] = parsed.value;
  }
  return env;
}

const envFileArg = String(args["env-file"] || "").trim();
const candidateEnvFiles = envFileArg ? [envFileArg] : [".env.local", ".env.production", ".env"];
let fileEnv = {};
for (const candidate of candidateEnvFiles) {
  try {
    fileEnv = { ...fileEnv, ...loadDotEnvFile(candidate) };
  } catch {
    // ignore env file parse errors; prefer explicit args/env vars
  }
}

const serviceRoleKey = String(
  args["service-role-key"] ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    ""
).trim();
if (!serviceRoleKey) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (env, --service-role-key, o --env-file)");
  process.exit(1);
}

const companyIdArg = String(args["company-id"] || "").trim();
const companyNameArg = String(args["company-name"] || "").trim();

const storeNameArg = String(args["store-name"] || "TIENDA PRINCIPAL").trim();
const warehouseNameArg = String(args["warehouse-name"] || "ALMACEN PRINCIPAL").trim();

const dryRun = toBool(args["dry-run"], false);

const reportPath = String(
  args["report-path"] || path.join(runDir, `stock_sync_report_${nowStamp()}.json`)
).trim();

const supabase = createClient(supabaseUrl, serviceRoleKey);

function normalizeLocation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("almacen") || raw.includes("alamcen")) return "ALMACEN PRINCIPAL";
  if (raw.includes("tienda") || raw.includes("teinda")) return "TIENDA PRINCIPAL";
  return "TIENDA PRINCIPAL";
}

function isMissingColumnError(error, columnName) {
  const content = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return content.includes(String(columnName || "").toLowerCase());
}

function loadSnapshotProducts(productsJsonPath) {
  const raw = fs.readFileSync(productsJsonPath, "utf8");
  const payload = JSON.parse(raw);
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.products)) return payload.data.products;
  return [];
}

async function resolveCompanyId() {
  if (companyIdArg) return companyIdArg;
  if (companyNameArg) {
    const { data, error } = await supabase
      .from("companies")
      .select("id,name")
      .eq("name", companyNameArg)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error(`No se encontró company con name='${companyNameArg}'`);
    return data.id;
  }

  // Convenience: if no company identifier was provided, pick the oldest company.
  // This is intended for single-company deployments.
  const { data: firstCompany, error: firstCompanyError } = await supabase
    .from("companies")
    .select("id,name,created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstCompanyError) throw firstCompanyError;
  if (!firstCompany?.id) throw new Error("No se encontró ninguna company en Supabase.");
  return firstCompany.id;
}

async function resolveStoreIds(companyId) {
  const { data: stores, error } = await supabase
    .from("stores")
    .select("id,name,type,is_active,is_default,company_id")
    .eq("company_id", companyId);

  if (error) {
    if (isMissingColumnError(error, "company_id")) {
      const { data: storesFallback, error: fallbackError } = await supabase
        .from("stores")
        .select("id,name,type,is_active,is_default");
      if (fallbackError) throw fallbackError;

      const all = storesFallback || [];
      const store = all.find((s) => String(s.name || "").trim().toLowerCase() === storeNameArg.toLowerCase()) ||
        all.find((s) => (s.is_default || false) && (s.is_active ?? true)) ||
        all[0];

      const wh = all.find((s) => String(s.name || "").trim().toLowerCase() === warehouseNameArg.toLowerCase()) ||
        all.find((s) => String(s.type || "").toLowerCase() === "warehouse") ||
        store;

      return { storeId: store?.id || null, warehouseStoreId: wh?.id || store?.id || null };
    }

    throw error;
  }

  const all = stores || [];
  const store = all.find((s) => String(s.name || "").trim().toLowerCase() === storeNameArg.toLowerCase()) ||
    all.find((s) => (s.is_default || false) && (s.is_active ?? true)) ||
    all[0];

  const wh = all.find((s) => String(s.name || "").trim().toLowerCase() === warehouseNameArg.toLowerCase()) ||
    all.find((s) => String(s.type || "").toLowerCase() === "warehouse") ||
    store;

  return { storeId: store?.id || null, warehouseStoreId: wh?.id || store?.id || null };
}

async function fetchProductKeyMap(companyId, columnName, values) {
  const keyToId = new Map();
  const BATCH_SIZE = 200;
  const filtered = [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];

  for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
    const batch = filtered.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,imei_1,imei_2,serial_number")
      .eq("company_id", companyId)
      .in(columnName, batch);

    if (error) throw error;
    for (const row of data || []) {
      const key = String(row?.[columnName] || "").trim();
      if (key) keyToId.set(key, row.id);
    }
  }

  return keyToId;
}

async function updateStockQuantityById(productId, stockQuantity) {
  const { error } = await supabase
    .from("products")
    .update({ stock_quantity: stockQuantity, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw error;
}

async function upsertInventoryBalances(rows) {
  if (!rows.length) return;

  let { error } = await supabase
    .from("inventory_balances")
    .upsert(rows, { onConflict: "product_id,store_id" });

  if (error && isMissingColumnError(error, "company_id")) {
    const fallbackRows = rows.map((row) => {
      const { company_id, ...rest } = row;
      return rest;
    });
    ({ error } = await supabase
      .from("inventory_balances")
      .upsert(fallbackRows, { onConflict: "product_id,store_id" }));
  }

  if (error) throw error;
}

async function main() {
  printSection("F2 - Sync SOLO STOCK desde Sheet snapshot");

  const companyId = await resolveCompanyId();
  const { storeId, warehouseStoreId } = await resolveStoreIds(companyId);

  if (!storeId) throw new Error("No se pudo resolver storeId (tienda). Revisa stores y --store-name.");
  if (!warehouseStoreId) throw new Error("No se pudo resolver warehouseStoreId (almacen). Revisa stores y --warehouse-name.");

  const productsJsonPath = path.join(path.resolve(runDir), "products.json");
  if (!fs.existsSync(productsJsonPath)) {
    throw new Error(`No existe ${productsJsonPath}. Ejecuta antes F1 (extract snapshot) o apunta a un run-dir correcto.`);
  }

  const products = loadSnapshotProducts(productsJsonPath);
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Snapshot no contiene productos (products). Verifica el contenido de products.json.");
  }

  const sourceSkus = [];
  const sourceImei1 = [];
  const sourceImei2 = [];
  const sourceSerials = [];

  for (const p of products) {
    const legacyId = String(p?.id || "").trim();
    const explicitSku = String(p?.sku || "").trim();
    if (explicitSku) sourceSkus.push(explicitSku);
    if (legacyId) sourceSkus.push(`MIGSKU-${legacyId}`);

    const imei1 = String(p?.imei1 || p?.imei_1 || "").trim();
    const imei2 = String(p?.imei2 || p?.imei_2 || "").trim();
    const serial = String(p?.serialNumber || p?.serial_number || "").trim();

    if (imei1) sourceImei1.push(imei1);
    if (imei2) sourceImei2.push(imei2);
    if (serial) sourceSerials.push(serial);
  }

  printSection("Resolviendo IDs de productos por claves (sku/imei/serial)");
  const [skuToId, imei1ToId, imei2ToId, serialToId] = await Promise.all([
    fetchProductKeyMap(companyId, "sku", sourceSkus),
    fetchProductKeyMap(companyId, "imei_1", sourceImei1),
    fetchProductKeyMap(companyId, "imei_2", sourceImei2),
    fetchProductKeyMap(companyId, "serial_number", sourceSerials),
  ]);

  const counters = {
    products_input: products.length,
    products_matched: 0,
    products_unmatched: 0,
    products_updated: 0,
    balances_upserted: 0,
  };

  const unmatched = [];
  const balanceRowMap = new Map();

  printSection(dryRun ? "DRY RUN - Calculando cambios" : "Aplicando updates de stock_quantity");

  // Concurrency-limited updates
  const CONCURRENCY = 20;
  const pending = [];

  const schedule = async (fn) => {
    pending.push(fn());
    if (pending.length >= CONCURRENCY) {
      await Promise.allSettled(pending.splice(0, pending.length));
    }
  };

  for (const p of products) {
    const legacyId = String(p?.id || "").trim();
    const explicitSku = String(p?.sku || "").trim();
    const migSku = legacyId ? `MIGSKU-${legacyId}` : "";

    const imei1 = String(p?.imei1 || p?.imei_1 || "").trim();
    const imei2 = String(p?.imei2 || p?.imei_2 || "").trim();
    const serial = String(p?.serialNumber || p?.serial_number || "").trim();

    const productId =
      (explicitSku && skuToId.get(explicitSku)) ||
      (migSku && skuToId.get(migSku)) ||
      (imei1 && imei1ToId.get(imei1)) ||
      (imei2 && imei2ToId.get(imei2)) ||
      (serial && serialToId.get(serial)) ||
      null;

    const stock = Math.max(0, Number(p?.stock ?? p?.stock_quantity ?? 0));

    if (!productId) {
      counters.products_unmatched += 1;
      unmatched.push({
        legacy_id: legacyId || null,
        sku: explicitSku || migSku || null,
        imei_1: imei1 || null,
        imei_2: imei2 || null,
        serial_number: serial || null,
        name: String(p?.name || p?.model || "").trim() || null,
        stock,
      });
      continue;
    }

    counters.products_matched += 1;

    if (!dryRun) {
      await schedule(async () => {
        await updateStockQuantityById(productId, stock);
      });
      counters.products_updated += 1;
    }

    const location = normalizeLocation(p?.location || p?.location_bin);
    const assignedStoreId = location === "ALMACEN PRINCIPAL" ? warehouseStoreId : storeId;
    const balanceKey = `${productId}::${assignedStoreId}`;
    const existing = balanceRowMap.get(balanceKey);

    if (existing) {
      existing.on_hand = Math.max(existing.on_hand, stock);
    } else {
      balanceRowMap.set(balanceKey, {
        company_id: companyId,
        product_id: productId,
        store_id: assignedStoreId,
        on_hand: stock,
        reserved: 0,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (pending.length) {
    await Promise.allSettled(pending);
  }

  const balanceRows = [...balanceRowMap.values()];
  if (!dryRun) {
    printSection("Upsert inventory_balances");
    const BATCH_SIZE = 200;
    for (let i = 0; i < balanceRows.length; i += BATCH_SIZE) {
      const batch = balanceRows.slice(i, i + BATCH_SIZE);
      await upsertInventoryBalances(batch);
      counters.balances_upserted += batch.length;
    }
  }

  const report = {
    company_id: companyId,
    store_id: storeId,
    warehouse_store_id: warehouseStoreId,
    run_dir: path.resolve(runDir),
    dry_run: dryRun,
    executed_at: new Date().toISOString(),
    counters,
    unmatched_preview: unmatched.slice(0, 50),
    unmatched_count: unmatched.length,
  };

  writeJson(reportPath, report);

  console.log("\n--- RESULTADO ---");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Reporte: ${reportPath}`);

  if (unmatched.length) {
    console.log(`\n[WARN] ${unmatched.length} productos del snapshot no se pudieron matchear por sku/imei/serial.`);
    console.log("Revisa el reporte para decidir mapeo manual o estrategia adicional.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
