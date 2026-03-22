import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function resolveDatabaseUrl(args) {
  return args["database-url"] || process.env.DATABASE_URL || "";
}

export function getSslConfig() {
  const raw = String(process.env.PGSSL_REJECT_UNAUTHORIZED || "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "true") return { rejectUnauthorized: true };
  if (raw === "false") return { rejectUnauthorized: false };
  return undefined;
}

export async function createPgClient(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL es obligatorio (o --database-url).");
  }
  const client = new Client({
    connectionString: databaseUrl,
    ssl: getSslConfig(),
  });
  await client.connect();
  return client;
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function nowStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

export function toBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "si"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;
  return defaultValue;
}
