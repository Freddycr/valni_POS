import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { nowStamp, parseArgs, printSection, writeJson } from "./lib.mjs";

const args = parseArgs();

const runDir = String(args["run-dir"] || "").trim();
if (!runDir) {
  console.error("Uso: node scripts/playbook/f7_backfill_sale_details.mjs --run-dir <path> [--dates YYYY-MM-DD,YYYY-MM-DD]");
  process.exit(1);
}

const supabaseUrl = String(
  args["supabase-url"] ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://ypeolvspffwxjtqxphzr.supabase.co"
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
const candidateEnvFiles = envFileArg ? [envFileArg] : [".env.local", ".env.production", ".env"]; // same convention as f2f3
let fileEnv = {};
for (const candidate of candidateEnvFiles) {
  try {
    fileEnv = { ...fileEnv, ...loadDotEnvFile(candidate) };
  } catch {
    // ignore
  }
}

const serviceRoleKey = String(
  args["service-role-key"] || process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
if (!serviceRoleKey) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (env, --service-role-key, o --env-file)");
  process.exit(1);
}

const datesArg = String(args["dates"] || "2026-03-30,2026-03-31").trim();
const targetDates = datesArg
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

const windowSeconds = Math.max(1, Number(args["window-seconds"] || 5));
const reportPathArg = String(args["report-path"] || path.join(runDir, `backfill_report_${nowStamp()}.json`)).trim();

const supabase = createClient(supabaseUrl, serviceRoleKey);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIMA_OFFSET = "-05:00";

function toPeruIsoTimestamp(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/);
  if (match) {
    const [, datePart, hour, minute, second, fraction = ""] = match;
    return `${datePart}T${hour.padStart(2, "0")}:${minute}:${second}${fraction}${LIMA_OFFSET}`;
  }

  // If only date is provided, assume start of day Lima.
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[1]}T00:00:00.000${LIMA_OFFSET}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function limaDay(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // YYYY-MM-DD
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function mapPaymentMethodToEnum(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) return "cash";
  if (normalized.includes("credito") || normalized.includes("cuota") || normalized.includes("install")) return "credit_installment";
  if (normalized.includes("debito")) return "debit_card";
  if (normalized.includes("tarjeta") || normalized.includes("credit")) return "credit_card";
  if (normalized.includes("transfer") || normalized.includes("banco") || normalized.includes("yape") || normalized.includes("plin")) return "bank_transfer";
  if (normalized.includes("cash") || normalized.includes("efectivo")) return "cash";
  return "cash";
}

async function loadSalesPackage(runDirPath) {
  const salesPath = path.resolve(runDirPath, "sales_package.json");
  if (!fs.existsSync(salesPath)) {
    throw new Error(`No existe ${salesPath}. Ejecuta F1 primero o apunta a un run-dir válido.`);
  }
  const raw = JSON.parse(fs.readFileSync(salesPath, "utf8"));
  return {
    sales: Array.isArray(raw?.sales) ? raw.sales : [],
    details: Array.isArray(raw?.details) ? raw.details : [],
    payments: Array.isArray(raw?.payments) ? raw.payments : [],
  };
}

async function fetchCandidateSales(dateList) {
  const minDate = dateList.reduce((min, d) => (min < d ? min : d), dateList[0]);
  const maxDate = dateList.reduce((max, d) => (max > d ? max : d), dateList[0]);
  const start = `${minDate}T00:00:00.000${LIMA_OFFSET}`;
  const end = `${maxDate}T23:59:59.999${LIMA_OFFSET}`;

  const { data, error } = await supabase
    .from("sales")
    .select("id,created_at,total_amount,customer_id,seller_id,store_id,status")
    .gte("created_at", start)
    .lte("created_at", end);

  if (error) throw error;

  const filtered = (data || []).filter((row) => {
    const day = limaDay(row.created_at);
    return day && dateList.includes(day);
  });

  return filtered;
}

async function fetchExistingIds(table, saleIds) {
  if (saleIds.length === 0) return new Set();
  const BATCH = 200;
  const existing = new Set();
  for (let i = 0; i < saleIds.length; i += BATCH) {
    const batch = saleIds.slice(i, i + BATCH);
    const { data, error } = await supabase.from(table).select("sale_id").in("sale_id", batch);
    if (error) throw error;
    for (const row of data || []) {
      if (row?.sale_id) existing.add(row.sale_id);
    }
  }
  return existing;
}

async function seedProductMapByLegacyIds(legacyProductIds) {
  const ids = [...new Set(legacyProductIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const skus = ids.map((id) => `MIGSKU-${id}`);
  const map = new Map();
  const BATCH = 200;
  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const { data, error } = await supabase.from("products").select("id,sku").in("sku", batch);
    if (error) throw error;
    for (const row of data || []) {
      const sku = String(row?.sku || "").trim();
      const legacyId = sku.replace(/^MIGSKU-/, "");
      if (legacyId && row?.id) map.set(legacyId, row.id);
    }
  }
  return map;
}

async function seedProductMapBySerials({ imeis, serials }) {
  const imeiList = [...new Set((imeis || []).map((x) => String(x || "").trim()).filter(Boolean))];
  const serialList = [...new Set((serials || []).map((x) => String(x || "").trim()).filter(Boolean))];
  const map = new Map();
  const BATCH = 200;

  for (let i = 0; i < imeiList.length; i += BATCH) {
    const batch = imeiList.slice(i, i + BATCH);
    const { data, error } = await supabase.from("products").select("id,imei_1").in("imei_1", batch);
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row?.imei_1 || "").trim();
      if (key && row?.id) map.set(`imei:${key}`, row.id);
    }
  }

  for (let i = 0; i < serialList.length; i += BATCH) {
    const batch = serialList.slice(i, i + BATCH);
    const { data, error } = await supabase.from("products").select("id,serial_number").in("serial_number", batch);
    if (error) throw error;
    for (const row of data || []) {
      const key = String(row?.serial_number || "").trim();
      if (key && row?.id) map.set(`serial:${key}`, row.id);
    }
  }

  return map;
}

function bestMatchSale(snapshotSale, candidates) {
  const iso = toPeruIsoTimestamp(snapshotSale?.date || snapshotSale?.created_at || snapshotSale?.createdAt);
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;

  const total = Number(snapshotSale?.total ?? snapshotSale?.total_amount ?? snapshotSale?.totalAmount ?? 0);
  const customerId = snapshotSale?.customerId || snapshotSale?.customer_id || null;
  const sellerId = snapshotSale?.sellerId || snapshotSale?.seller_id || null;
  const storeId = snapshotSale?.storeId || snapshotSale?.store_id || null;

  const windowMs = windowSeconds * 1000;
  const possibles = candidates.filter((row) => {
    const rowTs = new Date(row.created_at).getTime();
    if (Number.isNaN(rowTs)) return false;
    if (Math.abs(rowTs - ts) > windowMs) return false;
    const rowTotal = Number(row.total_amount || 0);
    if (Math.abs(rowTotal - total) > 0.01) return false;
    return true;
  });

  if (possibles.length === 0) return null;
  if (possibles.length === 1) return possibles[0];

  const scored = possibles
    .map((row) => {
      let score = 0;
      if (customerId && row.customer_id === customerId) score += 2;
      if (sellerId && row.seller_id === sellerId) score += 1;
      if (storeId && row.store_id === storeId) score += 1;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0].score === 0) {
    // ambiguous
    return null;
  }

  return scored[0].row;
}

async function main() {
  printSection("F7 - Backfill sale_items/sale_payments desde Sheet snapshot");
  console.log(`Run dir: ${runDir}`);
  console.log(`Dates: ${targetDates.join(", ")}`);

  const snapshot = await loadSalesPackage(runDir);

  const salesSnapshot = snapshot.sales
    .map((s) => ({ ...s }))
    .filter((s) => {
      const iso = toPeruIsoTimestamp(s?.date || s?.created_at || s?.createdAt);
      if (!iso) return false;
      const day = limaDay(iso);
      return !!day && targetDates.includes(day);
    });

  const nestedItemsByLegacySaleId = new Map();
  const nestedPaymentsByLegacySaleId = new Map();
  const snapshotSaleByLegacySaleId = new Map();
  for (const s of salesSnapshot) {
    const legacySaleId = String(s?.id || s?.saleId || s?.sale_id || "").trim();
    if (!legacySaleId) continue;
    snapshotSaleByLegacySaleId.set(legacySaleId, s);
    const items = Array.isArray(s?.items) ? s.items : [];
    const payments = Array.isArray(s?.payments) ? s.payments : [];
    if (items.length) nestedItemsByLegacySaleId.set(legacySaleId, items);
    if (payments.length) nestedPaymentsByLegacySaleId.set(legacySaleId, payments);
  }

  const candidates = await fetchCandidateSales(targetDates);

  const matched = [];
  const unmatched = [];

  for (const s of salesSnapshot) {
    const legacySaleId = String(s?.id || s?.saleId || s?.sale_id || "").trim();
    let resolved = null;

    if (UUID_RE.test(legacySaleId)) {
      const direct = candidates.find((row) => row.id === legacySaleId);
      if (direct) resolved = direct;
    }

    if (!resolved) {
      resolved = bestMatchSale(s, candidates);
    }

    if (!resolved) {
      unmatched.push({ legacySaleId, date: s?.date || s?.created_at || null, total: s?.total || s?.total_amount || null });
      continue;
    }

    matched.push({ legacySaleId, saleId: resolved.id });
  }

  const matchedLegacySaleIdSet = new Set(matched.map((m) => m.legacySaleId));

  const saleIds = [...new Set(matched.map((m) => m.saleId))];
  const existingItems = await fetchExistingIds("sale_items", saleIds);
  const existingPayments = await fetchExistingIds("sale_payments", saleIds);

  // Seed product map from legacy product ids referenced in details.
  const legacyProductIds = [];
  for (const d of snapshot.details || []) {
    const sid = String(d?.saleId || d?.sale_id || "").trim();
    if (!matchedLegacySaleIdSet.has(sid)) continue;
    const pid = String(d?.productId || d?.product_id || "").trim();
    if (pid) legacyProductIds.push(pid);
  }
  for (const [sid, items] of nestedItemsByLegacySaleId.entries()) {
    if (!matchedLegacySaleIdSet.has(sid)) continue;
    for (const it of items || []) {
      const pid = String(it?.productId || it?.product_id || "").trim();
      if (pid) legacyProductIds.push(pid);
    }
  }

  const productMap = await seedProductMapByLegacyIds(legacyProductIds);

  const imeis = [];
  const serials = [];
  for (const d of snapshot.details || []) {
    const sid = String(d?.saleId || d?.sale_id || "").trim();
    if (!matchedLegacySaleIdSet.has(sid)) continue;
    const imei = String(d?.imei1 || d?.captured_imei || "").trim();
    const serial = String(d?.serialNumber || d?.captured_serial || "").trim();
    if (imei) imeis.push(imei);
    if (serial) serials.push(serial);
  }
  for (const [sid, items] of nestedItemsByLegacySaleId.entries()) {
    if (!matchedLegacySaleIdSet.has(sid)) continue;
    for (const it of items || []) {
      const imei = String(it?.imei1 || it?.captured_imei || "").trim();
      const serial = String(it?.serialNumber || it?.captured_serial || "").trim();
      if (imei) imeis.push(imei);
      if (serial) serials.push(serial);
    }
  }
  const serialMap = await seedProductMapBySerials({ imeis, serials });

  const itemRows = [];
  const paymentRows = [];
  const skippedNoProduct = [];

  for (const m of matched) {
    if (!existingItems.has(m.saleId)) {
      const externalItems = [];
      for (const d of snapshot.details || []) {
        if (String(d?.saleId || d?.sale_id || "").trim() === m.legacySaleId) externalItems.push(d);
      }
      externalItems.push(...(nestedItemsByLegacySaleId.get(m.legacySaleId) || []));
      for (const d of externalItems) {
        const legacyProductId = String(d?.productId || d?.product_id || "").trim();
        let productId = productMap.get(legacyProductId);
        if (!productId) {
          const imei = String(d?.imei1 || d?.captured_imei || "").trim();
          const serial = String(d?.serialNumber || d?.captured_serial || "").trim();
          if (imei) productId = serialMap.get(`imei:${imei}`);
          if (!productId && serial) productId = serialMap.get(`serial:${serial}`);
        }
        if (!productId) {
          skippedNoProduct.push({ saleId: m.saleId, legacyProductId });
          continue;
        }
        const qty = Math.max(1, Number(d?.quantity || d?.qty || 1));
        const unitPrice = Number(d?.salePrice || d?.unit_price || d?.price || 0);
        itemRows.push({
          sale_id: m.saleId,
          product_id: productId,
          quantity: qty,
          unit_price: unitPrice,
          total_price: Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100,
          captured_imei: d?.imei1 || d?.captured_imei || null,
          captured_serial: d?.serialNumber || d?.captured_serial || null,
        });
      }
    }

    if (!existingPayments.has(m.saleId)) {
      const externalPayments = [];
      for (const p of snapshot.payments || []) {
        if (String(p?.saleId || p?.sale_id || "").trim() === m.legacySaleId) externalPayments.push(p);
      }
      externalPayments.push(...(nestedPaymentsByLegacySaleId.get(m.legacySaleId) || []));
      const snapshotSale = snapshotSaleByLegacySaleId.get(m.legacySaleId);
      const fallbackPaymentDate = toPeruIsoTimestamp(snapshotSale?.date || snapshotSale?.created_at || snapshotSale?.createdAt) || undefined;
      for (const p of externalPayments) {
        const methodLabel = String(p?.paymentMethod || p?.payment_method_label || p?.payment_method || "").trim();
        paymentRows.push({
          sale_id: m.saleId,
          payment_method: mapPaymentMethodToEnum(methodLabel),
          amount: Number(p?.amount || 0),
          payment_date: toPeruIsoTimestamp(p?.date || p?.payment_date) || fallbackPaymentDate,
        });
      }
    }
  }

  const counters = {
    snapshot_sales_in_dates: salesSnapshot.length,
    matched_sales: matched.length,
    unmatched_sales: unmatched.length,
    sales_missing_items: saleIds.filter((id) => !existingItems.has(id)).length,
    sales_missing_payments: saleIds.filter((id) => !existingPayments.has(id)).length,
    sale_items_to_insert: itemRows.length,
    sale_payments_to_insert: paymentRows.length,
    sale_items_skipped_no_product: skippedNoProduct.length,
  };

  const inserted = { sale_items: 0, sale_payments: 0 };

  const BATCH = 500;
  for (let i = 0; i < itemRows.length; i += BATCH) {
    const batch = itemRows.slice(i, i + BATCH);
    const { error } = await supabase.from("sale_items").insert(batch);
    if (error) throw error;
    inserted.sale_items += batch.length;
  }

  for (let i = 0; i < paymentRows.length; i += BATCH) {
    const batch = paymentRows.slice(i, i + BATCH);
    const { error } = await supabase.from("sale_payments").insert(batch);
    if (error) throw error;
    inserted.sale_payments += batch.length;
  }

  const report = {
    created_at: new Date().toISOString(),
    run_dir: runDir,
    dates: targetDates,
    window_seconds: windowSeconds,
    counters: { ...counters, inserted },
    unmatched_sales: unmatched.slice(0, 200),
    skipped_no_product: skippedNoProduct.slice(0, 200),
  };

  writeJson(reportPathArg, report);
  console.log(`Backfill completado. Reporte: ${reportPathArg}`);
  console.log(JSON.stringify(report.counters, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
