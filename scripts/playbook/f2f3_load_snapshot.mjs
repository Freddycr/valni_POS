import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { nowStamp, parseArgs, printSection, writeJson } from "./lib.mjs";

const args = parseArgs();

const runDir = String(args["run-dir"] || "").trim();
if (!runDir) {
  console.error("Uso: node scripts/playbook/f2f3_load_snapshot.mjs --run-dir <path>");
  process.exit(1);
}

const supabaseUrl = String(
  args["supabase-url"] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ypeolvspffwxjtqxphzr.supabase.co"
).trim();
const serviceRoleKey = String(args["service-role-key"] || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!serviceRoleKey) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (env o --service-role-key)");
  process.exit(1);
}

const companyNameArg = String(args["company-name"] || "VALNI_TEST_MIG").trim();
const companyIdArg = String(args["company-id"] || "").trim();
const storeNameArg = String(args["store-name"] || "Tienda Principal").trim();
const storeCodeArg = String(args["store-code"] || "T01").trim();
const warehouseNameArg = String(args["warehouse-name"] || "Almacen Principal").trim();
const warehouseCodeArg = String(args["warehouse-code"] || "A01").trim();
const reportPathArg = String(args["report-path"] || path.join(runDir, `load_report_${nowStamp()}.json`)).trim();

const supabase = createClient(supabaseUrl, serviceRoleKey);

const LIMA_UTC_OFFSET = "-05:00";

const brandMap = new Map();
const categoryMap = new Map();
const modelMap = new Map();
const productMap = new Map();
const customerMap = new Map();
const saleMap = new Map();

const counters = {
  products_input: 0,
  products_upserted: 0,
  customers_input: 0,
  customers_upserted: 0,
  sales_input: 0,
  sales_upserted: 0,
  sale_items_inserted: 0,
  sale_items_skipped_no_product: 0,
  sale_payments_inserted: 0,
};

let companyId = "";
let storeId = "";
let warehouseStoreId = "";
let salePaymentsSupportsMethodLabel = true;
let productsSupportsSkuUpsert = true;
let companyProductFootprintReset = false;
let customersSupportDocUpsert = true;
let companyCustomerFootprintReset = false;
const sellerMap = new Map();

const LEGACY_SELLER_EMAIL_MAP = {
  "1753251295581": "yeni_mig@valni.com",
  "1756786217501": "thalia@valniperu.com",
  "1757189732109": "kathy@valniperu.com",
};

function toPeruIsoTimestamp(input) {
  if (!input) return new Date().toISOString();
  if (input instanceof Date) return input.toISOString();

  const raw = String(input).trim();
  if (!raw) return new Date().toISOString();

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/);
  if (match) {
    const [, datePart, hour, minute, second, fraction = ""] = match;
    return `${datePart}T${hour.padStart(2, "0")}:${minute}:${second}${fraction}${LIMA_UTC_OFFSET}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeLocation(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("almacen")) return "Almacen";
  return "Tienda";
}

function mapProductType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["smartphone", "tablet", "accessory", "part", "service"].includes(raw)) return raw;
  if (raw === "individual" || raw === "equipo") return "smartphone";
  return "accessory";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function defaultPaymentLabel(method) {
  const labels = {
    cash: "Efectivo",
    credit_card: "Tarjeta de Crédito",
    debit_card: "Tarjeta de Débito",
    bank_transfer: "Transferencia Bancaria",
    credit_installment: "Crédito",
    yape: "Yape",
    plin: "Plin",
  };
  return labels[method] || method;
}

function mapPaymentMethod(rawValue) {
  const original = String(rawValue || "").trim();
  const normalized = normalizeText(rawValue);

  const directMap = {
    cash: "cash",
    efectivo: "cash",
    credit_card: "credit_card",
    "credit card": "credit_card",
    "tarjeta de credito": "credit_card",
    "credito tarjeta": "credit_card",
    debit_card: "debit_card",
    "debit card": "debit_card",
    "tarjeta de debito": "debit_card",
    bank_transfer: "bank_transfer",
    "bank transfer": "bank_transfer",
    transferencia: "bank_transfer",
    "transferencia bancaria": "bank_transfer",
    credit_installment: "credit_installment",
    credito: "credit_installment",
    cuotas: "credit_installment",
    yape: "yape",
    plin: "plin",
  };

  let method = directMap[normalized] || null;
  if (!method) {
    if (normalized.includes("yape")) {
      method = "yape";
    } else if (normalized.includes("plin")) {
      method = "plin";
    } else if (
      normalized.includes("transfer") ||
      normalized.includes("banco") ||
      normalized.includes("bcp") ||
      normalized.includes("bbva") ||
      normalized.includes("interbank") ||
      normalized.includes("scotiabank")
    ) {
      method = "bank_transfer";
    } else if (normalized.includes("debito")) {
      method = "debit_card";
    } else if (normalized.includes("tarjeta") && normalized.includes("credito")) {
      method = "credit_card";
    } else if (normalized.includes("credito")) {
      method = "credit_installment";
    } else if (normalized.includes("efectivo")) {
      method = "cash";
    } else {
      method = "cash";
    }
  }

  return {
    method,
    label: original || defaultPaymentLabel(method),
  };
}

function buildSyntheticDocNumber(customer) {
  const legacyCustomerId = String(customer?.id || "").trim();
  if (legacyCustomerId) {
    return `MIGDOC-${companyId.slice(0, 8)}-${legacyCustomerId}`;
  }

  const fingerprint = [
    String(customer?.fullName || customer?.name || "").trim(),
    String(customer?.email || "").trim(),
    String(customer?.phone || "").trim(),
    String(customer?.address || "").trim(),
  ].join("|");

  const digest = crypto.createHash("sha1").update(fingerprint || "cliente_sin_identidad").digest("hex").slice(0, 12);
  return `MIGDOC-${companyId.slice(0, 8)}-${digest}`;
}

function isMissingColumnError(error, columnName) {
  const content = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return content.includes(String(columnName || "").toLowerCase());
}

function isInvalidOnConflictError(error) {
  return String(error?.code || "").trim() === "42P10";
}

function isUniqueViolationError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key value");
}

async function resetCompanyProductFootprint() {
  if (companyProductFootprintReset) return;

  printSection("F2 - Reset huella previa de productos");

  const BATCH_SIZE = 200;
  const PAGE_SIZE = 1000;
  const saleIds = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data: saleRows, error: salesError } = await supabase
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .range(from, to);

    if (salesError) throw salesError;
    const rows = saleRows || [];
    saleIds.push(...rows.map((row) => row.id).filter(Boolean));
    if (rows.length < PAGE_SIZE) break;
  }

  for (let i = 0; i < saleIds.length; i += BATCH_SIZE) {
    const batch = saleIds.slice(i, i + BATCH_SIZE);
    let error = null;

    ({ error } = await supabase.from("sale_payments").delete().in("sale_id", batch));
    if (error) throw error;

    ({ error } = await supabase.from("sale_items").delete().in("sale_id", batch));
    if (error) throw error;
  }
  console.log(`Eliminados items y pagos previos de ${saleIds.length} ventas para company_id ${companyId}`);

  const productIds = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .range(from, to);

    if (productsError) throw productsError;
    const rows = productRows || [];
    productIds.push(...rows.map((row) => row.id).filter(Boolean));
    if (rows.length < PAGE_SIZE) break;
  }

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    let error = null;

    ({ error } = await supabase.from("sale_items").delete().in("product_id", batch));
    if (error) throw error;

    ({ error } = await supabase.from("purchase_order_items").delete().in("product_id", batch));
    if (error) throw error;

    ({ error } = await supabase.from("advances").delete().in("target_product_id", batch));
    if (error) throw error;

    ({ error } = await supabase.from("product_variants").delete().in("product_id", batch));
    if (error) throw error;
  }
  console.log(`Eliminadas referencias residuales asociadas a ${productIds.length} productos del company target`);

  const deletions = [
    ["inventory_balances", "balances de inventario"],
    ["products", "productos"],
  ];

  for (const [tableName, label] of deletions) {
    const { error } = await supabase.from(tableName).delete().eq("company_id", companyId);
    if (error) throw error;
    console.log(`Eliminado ${label} previos para company_id ${companyId}`);
  }

  companyProductFootprintReset = true;
}

async function resetCompanyCustomerFootprint() {
  if (companyCustomerFootprintReset) return;

  printSection("F2 - Reset huella previa de clientes/ventas");

  const PAGE_SIZE = 1000;
  const BATCH_SIZE = 200;
  const saleIds = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data: saleRows, error: salesError } = await supabase
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .range(from, to);

    if (salesError) throw salesError;
    const rows = saleRows || [];
    saleIds.push(...rows.map((row) => row.id).filter(Boolean));
    if (rows.length < PAGE_SIZE) break;
  }

  for (let i = 0; i < saleIds.length; i += BATCH_SIZE) {
    const batch = saleIds.slice(i, i + BATCH_SIZE);
    let error = null;

    ({ error } = await supabase.from("sale_payments").delete().in("sale_id", batch));
    if (error) throw error;

    ({ error } = await supabase.from("sale_items").delete().in("sale_id", batch));
    if (error) throw error;
  }

  let { error } = await supabase.from("sales").delete().eq("company_id", companyId);
  if (error) throw error;

  ({ error } = await supabase.from("customers").delete().eq("company_id", companyId));
  if (error) throw error;

  console.log(`Eliminadas ventas/clientes previos para company_id ${companyId}`);
  companyCustomerFootprintReset = true;
}

async function insertSalePayments(batch) {
  const buildRows = () =>
    batch.map((row) => {
      if (salePaymentsSupportsMethodLabel) return row;
      const { payment_method_label, ...rest } = row;
      return rest;
    });

  let { error } = await supabase.from("sale_payments").insert(buildRows());
  if (error && salePaymentsSupportsMethodLabel && isMissingColumnError(error, "payment_method_label")) {
    salePaymentsSupportsMethodLabel = false;
    ({ error } = await supabase.from("sale_payments").insert(buildRows()));
  }

  if (error) throw error;
}

async function readSnapshots() {
  const productsPath = path.resolve(runDir, "products.json");
  const salesPath = path.resolve(runDir, "sales_package.json");

  if (!fs.existsSync(productsPath)) {
    throw new Error(`No existe snapshot: ${productsPath}`);
  }
  if (!fs.existsSync(salesPath)) {
    throw new Error(`No existe snapshot: ${salesPath}`);
  }

  const productsRaw = JSON.parse(fs.readFileSync(productsPath, "utf8"));
  const salesRaw = JSON.parse(fs.readFileSync(salesPath, "utf8"));

  const products = Array.isArray(productsRaw?.products)
    ? productsRaw.products
    : Array.isArray(productsRaw)
      ? productsRaw
      : [];

  return {
    products,
    sales: Array.isArray(salesRaw?.sales) ? salesRaw.sales : [],
    details: Array.isArray(salesRaw?.details) ? salesRaw.details : [],
    payments: Array.isArray(salesRaw?.payments) ? salesRaw.payments : [],
    customers: Array.isArray(salesRaw?.customers) ? salesRaw.customers : [],
  };
}

async function upsertCompany() {
  printSection("F2 - Company/Stores");

  if (companyIdArg) {
    const { data, error } = await supabase.from("companies").select("id,name").eq("id", companyIdArg).single();
    if (error || !data) throw new Error(`No existe company_id ${companyIdArg}`);
    companyId = data.id;
  } else {
    const { data: existing } = await supabase.from("companies").select("id,name").eq("name", companyNameArg).maybeSingle();
    if (existing?.id) {
      companyId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("companies")
        .insert({ name: companyNameArg })
        .select("id,name")
        .single();
      if (error || !inserted) throw error || new Error("No se pudo crear company");
      companyId = inserted.id;
    }
  }

  const tCode = `${storeCodeArg}-${companyId.slice(0, 4)}`;
  const wCode = `${warehouseCodeArg}-${companyId.slice(0, 4)}`;

  const { data: storeExisting } = await supabase
    .from("stores")
    .select("id,name,code")
    .eq("company_id", companyId)
    .eq("name", storeNameArg)
    .maybeSingle();

  if (storeExisting?.id) {
    storeId = storeExisting.id;
  } else {
    const { data: storeInserted, error } = await supabase
      .from("stores")
      .insert({
        company_id: companyId,
        name: storeNameArg,
        code: tCode,
        type: "store",
        is_active: true,
        is_default: true,
      })
      .select("id")
      .single();
    if (error || !storeInserted) throw error || new Error("No se pudo crear tienda");
    storeId = storeInserted.id;
  }

  const { data: whStoreExisting } = await supabase
    .from("stores")
    .select("id,name,code")
    .eq("company_id", companyId)
    .eq("name", warehouseNameArg)
    .maybeSingle();

  if (whStoreExisting?.id) {
    warehouseStoreId = whStoreExisting.id;
  } else {
    const { data: whStoreInserted, error } = await supabase
      .from("stores")
      .insert({
        company_id: companyId,
        name: warehouseNameArg,
        code: wCode,
        type: "warehouse",
        is_active: true,
        is_default: false,
      })
      .select("id")
      .single();
    if (error || !whStoreInserted) throw error || new Error("No se pudo crear store almacen");
    warehouseStoreId = whStoreInserted.id;
  }

  await supabase
    .from("company_receipt_settings")
    .upsert(
      [
        {
          company_id: companyId,
          header_text: companyNameArg,
        },
      ],
      { onConflict: "company_id" }
    );

  console.log(`company_id: ${companyId}`);
  console.log(`store_id (tienda): ${storeId}`);
  console.log(`store_id (almacen): ${warehouseStoreId}`);

  const sellerEmails = [...new Set(Object.values(LEGACY_SELLER_EMAIL_MAP).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
  if (sellerEmails.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,company_id")
      .eq("company_id", companyId)
      .in("email", sellerEmails);

    if (profileError) throw profileError;

    const emailToProfileId = new Map(
      (profileRows || []).map((row) => [String(row.email || "").trim().toLowerCase(), row.id])
    );

    sellerMap.clear();
    for (const [legacySellerId, email] of Object.entries(LEGACY_SELLER_EMAIL_MAP)) {
      const profileId = emailToProfileId.get(String(email || "").trim().toLowerCase()) || null;
      if (profileId) sellerMap.set(String(legacySellerId), profileId);
    }
  }
}

async function migrateProducts(products) {
  printSection("F2 - Productos");
  counters.products_input = products.length;

  const brands = [...new Set(products.map((p) => String(p.brand || "").trim()).filter(Boolean))];
  const categories = ["Smartphone", "Tablet", "Accessory", "Part", "Service"];

  for (const bName of brands) {
    const { data, error } = await supabase
      .from("brands")
      .upsert({ name: bName, company_id: companyId }, { onConflict: "name" })
      .select("id,name")
      .single();
    if (!error && data?.id) brandMap.set(bName, data.id);
  }

  for (const cName of categories) {
    const { data, error } = await supabase
      .from("categories")
      .upsert({ name: cName, company_id: companyId }, { onConflict: "name" })
      .select("id,name")
      .single();
    if (!error && data?.id) categoryMap.set(cName, data.id);
  }

  for (const p of products) {
    const brandId = brandMap.get(String(p.brand || "").trim()) || null;
    const modelName = String(p.model || "").trim();
    if (!modelName) continue;

    const categoryName = mapProductType(p.type) === "smartphone" ? "Smartphone" : "Accessory";
    const categoryId = categoryMap.get(categoryName) || null;
    const modelKey = `${brandId || "none"}_${modelName}`;

    if (modelMap.has(modelKey)) continue;

    const { data, error } = await supabase
      .from("models")
      .upsert(
        {
          brand_id: brandId,
          category_id: categoryId,
          company_id: companyId,
          name: modelName,
        },
        { onConflict: "brand_id,name" }
      )
      .select("id")
      .single();

    if (!error && data?.id) modelMap.set(modelKey, data.id);
  }

  const productRows = products.map((p) => {
    const brandName = String(p.brand || "").trim();
    const modelName = String(p.model || "").trim();
    const brandId = brandMap.get(brandName) || null;
    const modelId = modelMap.get(`${brandId || "none"}_${modelName}`) || null;
    const sku = `MIGSKU-${String(p.id || "").trim()}`;

    return {
      company_id: companyId,
      sku,
      model_id: modelId,
      type: mapProductType(p.type),
      name: String(p.name || modelName || "Producto MIG").trim(),
      description: String(p.description || "").trim() || null,
      sell_price: Number(p.price || 0),
      min_sell_price: Number(p.minPrice || p.min_price || 0),
      stock_quantity: Number(p.stock || p.stock_quantity || 0),
      status: String(p.status || "available").toLowerCase() === "vendido" ? "sold" : "available",
      location_bin: normalizeLocation(p.location || p.location_bin),
      imei_1: String(p.imei1 || p.imei_1 || "").trim() || null,
      imei_2: String(p.imei2 || p.imei_2 || "").trim() || null,
      serial_number: String(p.serialNumber || p.serial_number || "").trim() || null,
    };
  });

  const imei1ToSku = new Map();
  const imei2ToSku = new Map();
  const canonicalSkuToRow = new Map();
  const legacyProductSkuMap = new Map();

  for (const [index, row] of productRows.entries()) {
    const legacyId = String(products[index]?.id || "").trim();
    const canonicalSku =
      (row.imei_1 && imei1ToSku.get(row.imei_1)) ||
      (row.imei_2 && imei2ToSku.get(row.imei_2)) ||
      canonicalSkuToRow.get(row.sku)?.sku ||
      row.sku;

    legacyProductSkuMap.set(legacyId, canonicalSku);
    if (canonicalSkuToRow.has(canonicalSku)) continue;

    canonicalSkuToRow.set(canonicalSku, row);
    if (row.imei_1) imei1ToSku.set(row.imei_1, canonicalSku);
    if (row.imei_2) imei2ToSku.set(row.imei_2, canonicalSku);
  }

  const dedupedProductRows = [...canonicalSkuToRow.values()];
  const droppedProducts = productRows.length - dedupedProductRows.length;
  if (droppedProducts > 0) {
    console.log(`Productos deduplicados por IMEI/SKU: ${droppedProducts}`);
  }

  const BATCH_SIZE = 200;
  const skuToProductId = new Map();
  const persistProductBatch = async (batch) => {
    const query = supabase.from("products");
    if (productsSupportsSkuUpsert) {
      return query.upsert(batch, { onConflict: "sku" }).select("id,sku");
    }
    return query.insert(batch).select("id,sku");
  };

  const persistAllProducts = async () => {
    counters.products_upserted = 0;
    productMap.clear();
    skuToProductId.clear();

    for (let i = 0; i < dedupedProductRows.length; i += BATCH_SIZE) {
      const batch = dedupedProductRows.slice(i, i + BATCH_SIZE);
      const { data, error } = await persistProductBatch(batch);
      if (error) throw error;
      counters.products_upserted += data?.length || 0;
      for (const row of data || []) {
        if (row.sku && row.id) {
          skuToProductId.set(String(row.sku), row.id);
        }
      }
    }

    for (const [legacyId, canonicalSku] of legacyProductSkuMap.entries()) {
      const productId = skuToProductId.get(canonicalSku);
      if (legacyId && productId) {
        productMap.set(legacyId, productId);
      }
    }
  };

  try {
    await persistAllProducts();
  } catch (error) {
    if (!productsSupportsSkuUpsert || !isInvalidOnConflictError(error)) {
      throw error;
    }

    productsSupportsSkuUpsert = false;
    await resetCompanyProductFootprint();
    await persistAllProducts();
  }

  const inventoryRowMap = new Map();
  for (const p of products) {
    const legacyId = String(p.id || "");
    const productId = productMap.get(legacyId);
    if (!productId) continue;

    const onHand = Math.max(0, Number(p.stock || p.stock_quantity || 0));
    const location = normalizeLocation(p.location || p.location_bin);
    const assignedStoreId = location === "Almacen" ? warehouseStoreId : storeId;
    const inventoryKey = `${productId}::${assignedStoreId}`;
    const existing = inventoryRowMap.get(inventoryKey);

    if (existing) {
      existing.on_hand = Math.max(existing.on_hand, onHand);
      continue;
    }

    inventoryRowMap.set(inventoryKey, {
      company_id: companyId,
      product_id: productId,
      store_id: assignedStoreId,
      on_hand: onHand,
      reserved: 0,
    });
  }

  const inventoryRows = [...inventoryRowMap.values()];

  for (let i = 0; i < inventoryRows.length; i += BATCH_SIZE) {
    const batch = inventoryRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("inventory_balances").upsert(batch, { onConflict: "product_id,store_id" });
    if (error) throw error;
  }

  console.log(`Productos entrada: ${counters.products_input}`);
  console.log(`Productos upsert: ${counters.products_upserted}`);
}

async function migrateCustomers(customers) {
  printSection("F2 - Clientes");
  counters.customers_input = customers.length;
  const persistCustomers = async () => {
    counters.customers_upserted = 0;
    customerMap.clear();
    const docNumberToCustomerId = new Map();

    for (const c of customers) {
      const legacyCustomerId = String(c.id || "").trim();
      const rawDoc = String(c.dni || c.docNumber || c.doc_number || "").trim();
      const docNumber = rawDoc || buildSyntheticDocNumber(c);

      if (docNumberToCustomerId.has(docNumber)) {
        if (legacyCustomerId) customerMap.set(legacyCustomerId, docNumberToCustomerId.get(docNumber));
        continue;
      }

      const payload = {
        company_id: companyId,
        doc_type: "DNI",
        doc_number: docNumber,
        full_name: String(c.fullName || c.name || "Cliente sin nombre").trim(),
        email: String(c.email || "").trim() || null,
        phone: String(c.phone || "").trim() || null,
        address: String(c.address || "").trim() || null,
      };

      let data = null;
      let error = null;

      if (customersSupportDocUpsert) {
        ({ data, error } = await supabase.from("customers").upsert(payload, { onConflict: "doc_number" }).select("id,doc_number").single());
      } else {
        const { data: existingScoped, error: existingScopedError } = await supabase
          .from("customers")
          .select("id,doc_number")
          .eq("company_id", companyId)
          .eq("doc_number", docNumber)
          .maybeSingle();

        if (existingScopedError) throw existingScopedError;

        if (existingScoped?.id) {
          ({ data, error } = await supabase
            .from("customers")
            .update(payload)
            .eq("id", existingScoped.id)
            .select("id,doc_number")
            .single());
        } else {
          ({ data, error } = await supabase.from("customers").insert(payload).select("id,doc_number").single());
          if (error && isUniqueViolationError(error)) {
            ({ data, error } = await supabase
              .from("customers")
              .select("id,doc_number")
              .eq("doc_number", docNumber)
              .maybeSingle());
          }
        }
      }

      if (error || !data) throw error || new Error("No se pudo persistir customer");
      counters.customers_upserted += 1;
      docNumberToCustomerId.set(docNumber, data.id);

      if (legacyCustomerId) customerMap.set(legacyCustomerId, data.id);
    }
  };

  try {
    await persistCustomers();
  } catch (error) {
    if (!customersSupportDocUpsert || !isInvalidOnConflictError(error)) {
      throw error;
    }

    customersSupportDocUpsert = false;
    await persistCustomers();
  }

  console.log(`Clientes entrada: ${counters.customers_input}`);
  console.log(`Clientes upsert: ${counters.customers_upserted}`);
}

async function migrateSales(sales, details, payments) {
  printSection("F3 - Ventas, items, pagos");
  counters.sales_input = sales.length;

  const salesRows = sales.map((s) => {
    const legacySaleId = String(s.id || "").trim();
    const invoice = `MIG-${legacySaleId}`;
    const total = Number(s.total || s.total_amount || 0);
    const customerId = customerMap.get(String(s.customerId || s.customer_id || "").trim()) || null;
    const sellerId = sellerMap.get(String(s.sellerId || s.seller_id || "").trim()) || null;

    return {
      legacy_sale_id: legacySaleId,
      row: {
        company_id: companyId,
        store_id: storeId,
        invoice_number: invoice,
        customer_id: customerId,
        seller_id: sellerId,
        subtotal: total,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: total,
        status: "completed",
        document_type: "Recibo de Venta",
        created_at: toPeruIsoTimestamp(s.date || s.created_at),
      },
    };
  });

  const BATCH_SIZE = 200;
  for (let i = 0; i < salesRows.length; i += BATCH_SIZE) {
    const batch = salesRows.slice(i, i + BATCH_SIZE).map((x) => x.row);
    const { data, error } = await supabase
      .from("sales")
      .upsert(batch, { onConflict: "invoice_number" })
      .select("id,invoice_number");
    if (error) throw error;
    counters.sales_upserted += data?.length || 0;
  }

  for (let i = 0; i < salesRows.length; i += BATCH_SIZE) {
    const invoiceBatch = salesRows.slice(i, i + BATCH_SIZE).map((x) => x.row.invoice_number);
    const { data, error } = await supabase
      .from("sales")
      .select("id,invoice_number")
      .eq("company_id", companyId)
      .in("invoice_number", invoiceBatch);
    if (error) throw error;

    for (const row of data || []) {
      const legacyId = String(row.invoice_number || "").replace(/^MIG-/, "");
      if (legacyId) saleMap.set(legacyId, row.id);
    }
  }

  const migratedSaleIds = [...saleMap.values()];
  if (migratedSaleIds.length > 0) {
    for (let i = 0; i < migratedSaleIds.length; i += BATCH_SIZE) {
      const idBatch = migratedSaleIds.slice(i, i + BATCH_SIZE);
      const { error: deleteItemsErr } = await supabase.from("sale_items").delete().in("sale_id", idBatch);
      if (deleteItemsErr) throw deleteItemsErr;
      const { error: deletePayErr } = await supabase.from("sale_payments").delete().in("sale_id", idBatch);
      if (deletePayErr) throw deletePayErr;
    }
  }

  const detailRows = [];
  for (const s of sales) {
    const legacySaleId = String(s.id || "").trim();
    const newSaleId = saleMap.get(legacySaleId);
    if (!newSaleId) continue;

    const inlineItems = Array.isArray(s.items) ? s.items : [];
    const externalItems = details.filter((d) => String(d.saleId || d.sale_id || "").trim() === legacySaleId);

    // Evitar la duplicación de items si vienen enbebidos en s.items y aparte en la tabla details
    const finalItems = externalItems.length > 0 ? externalItems : inlineItems;

    for (const item of finalItems) {
      const legacyProductId = String(item.productId || item.product_id || "").trim();
      const productId = productMap.get(legacyProductId);
      if (!productId) {
        counters.sale_items_skipped_no_product += 1;
        continue;
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Number(item.salePrice || item.unit_price || item.price || 0);
      detailRows.push({
        sale_id: newSaleId,
        company_id: companyId,
        product_id: productId,
        quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice,
        captured_imei: String(item.imei1 || item.captured_imei || "").trim() || null,
        captured_serial: String(item.serialNumber || item.captured_serial || "").trim() || null,
      });
    }
  }

  for (let i = 0; i < detailRows.length; i += BATCH_SIZE) {
    const batch = detailRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("sale_items").insert(batch);
    if (error) throw error;
    counters.sale_items_inserted += batch.length;
  }

  const paymentRows = [];
  for (const s of sales) {
    const legacySaleId = String(s.id || "").trim();
    const newSaleId = saleMap.get(legacySaleId);
    if (!newSaleId) continue;

    const inlinePayments = Array.isArray(s.payments) ? s.payments : [];
    const externalPayments = payments.filter((p) => String(p.saleId || p.sale_id || "").trim() === legacySaleId);

    const mergedPayments = [...inlinePayments, ...externalPayments];
    if (mergedPayments.length === 0) {
      paymentRows.push({
        sale_id: newSaleId,
        company_id: companyId,
        payment_store_id: storeId,
        payment_method: "cash",
        payment_method_label: defaultPaymentLabel("cash"),
        amount: Number(s.total || 0),
        payment_date: toPeruIsoTimestamp(s.date || s.created_at),
      });
      continue;
    }

    for (const payment of mergedPayments) {
      const paymentDescriptor = mapPaymentMethod(
        payment.paymentMethod || payment.payment_method || payment.method || payment.bank || payment.bank_name
      );
      paymentRows.push({
        sale_id: newSaleId,
        company_id: companyId,
        payment_store_id: storeId,
        payment_method: paymentDescriptor.method,
        payment_method_label: paymentDescriptor.label,
        amount: Number(payment.amount || 0),
        payment_date: toPeruIsoTimestamp(payment.date || payment.payment_date || s.date || s.created_at),
      });
    }
  }

  for (let i = 0; i < paymentRows.length; i += BATCH_SIZE) {
    const batch = paymentRows.slice(i, i + BATCH_SIZE);
    await insertSalePayments(batch);
    counters.sale_payments_inserted += batch.length;
  }

  console.log(`Ventas entrada: ${counters.sales_input}`);
  console.log(`Ventas upsert: ${counters.sales_upserted}`);
  console.log(`Items insertados: ${counters.sale_items_inserted}`);
  console.log(`Items omitidos por producto no mapeado: ${counters.sale_items_skipped_no_product}`);
  console.log(`Pagos insertados: ${counters.sale_payments_inserted}`);
}

async function main() {
  const snapshots = await readSnapshots();

  await upsertCompany();
  await migrateProducts(snapshots.products);
  await migrateCustomers(snapshots.customers);
  await migrateSales(snapshots.sales, snapshots.details, snapshots.payments);

  const report = {
    run_dir: path.resolve(runDir),
    generated_at: new Date().toISOString(),
    company_id: companyId,
    store_id: storeId,
    warehouse_store_id: warehouseStoreId,
    counters,
  };

  writeJson(path.resolve(reportPathArg), report);
  printSection("Resultado F2/F3");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
