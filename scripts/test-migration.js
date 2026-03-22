
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // Requiere npm install node-fetch si la versión de node es < 18

const FIREBASE_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';
const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY; // Requerido para saltar RLS

const COMPANY_ID = '3ea44287-b052-4271-82db-8444a7d5e8a1'; // VALNI
const STORE_ID = '82753e2e-c957-46d8-983c-29e2d7198234'; // Tienda_1 (Testing)
const LIMA_UTC_OFFSET = '-05:00';

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
        const [, datePart, hour, minute, second, fraction = ''] = match;
        return `${datePart}T${hour.padStart(2, '0')}:${minute}:${second}${fraction}${LIMA_UTC_OFFSET}`;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function fetchFromFirebase(endpoint) {
    console.log(`Fetching ${endpoint}...`);
    const resp = await fetch(`${FIREBASE_BASE_URL}/${endpoint}`);
    if (!resp.ok) throw new Error(`Error fetching ${endpoint}: ${resp.statusText}`);
    return await resp.json();
}

async function startMigration() {
    try {
        if (!SUPABASE_SERVICE_ROLE) {
            console.error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
            return;
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // 1. Obtener datos de Firebase (Google Sheets via Cloud Functions)
        console.log("--- Extrayendo datos de Firebase ---");
        const productsData = await fetchFromFirebase('getProducts');
        const salesPackage = await fetchFromFirebase('getSalesData'); // { sales, details, payments, customers }

        const firebaseProducts = productsData.products || [];
        const firebaseCustomers = salesPackage.customers || [];
        const firebaseSales = salesPackage.sales || [];
        const firebaseDetails = salesPackage.details || [];
        const firebasePayments = salesPackage.payments || [];

        console.log(`Resumen capturado: ${firebaseProducts.length} productos, ${firebaseCustomers.length} clientes, ${firebaseSales.length} ventas.`);

        // 2. Deduplicar Clientes por DNI
        console.log("--- Procesando Deduplicación de Clientes ---");
        const customerDniMap = new Map(); // dni -> { uuid, original_id }
        const uniqueCustomers = [];
        const clientRedirectionMap = new Map(); // old_id -> new_uuid

        firebaseCustomers.forEach(c => {
            const dni = String(c.dni || c.docNumber || "").trim();
            if (!dni) return;

            if (!customerDniMap.has(dni)) {
                const newUuid = crypto.randomUUID();
                customerDniMap.set(dni, { uuid: newUuid, original_id: c.id });
                uniqueCustomers.push({
                    id: newUuid,
                    company_id: COMPANY_ID,
                    doc_type: 'DNI',
                    doc_number: dni,
                    full_name: c.fullName || c.name || 'Desconocido',
                    email: c.email || null,
                    phone: c.phone || null,
                    address: c.address || null
                });
            }
            clientRedirectionMap.set(c.id, customerDniMap.get(dni).uuid);
        });

        console.log(`Clientes únicos: ${uniqueCustomers.length} de ${firebaseCustomers.length} originales.`);

        // 3. Cargar Clientes
        console.log("Cargando clientes en Supabase...");
        const { error: custErr } = await supabase.from('customers').upsert(uniqueCustomers, { onConflict: 'doc_number' });
        if (custErr) throw custErr;

        // 4. Procesar Ventas y Relacionar
        console.log("--- Procesando Ventas ---");
        const salesBatch = [];
        const saleIdMap = new Map(); // old_id -> new_uuid

        firebaseSales.forEach(s => {
            const newSaleId = crypto.randomUUID();
            saleIdMap.set(s.id, newSaleId);

            salesBatch.push({
                id: newSaleId,
                company_id: COMPANY_ID,
                store_id: STORE_ID,
                invoice_number: `MIG-${s.id}`, // Prefijo para identificar migración
                customer_id: clientRedirectionMap.get(s.customerId) || null,
                total_amount: s.total || 0,
                status: 'completed',
                created_at: toPeruIsoTimestamp(s.date)
            });
        });

        console.log("Cargando ventas en Supabase...");
        const { error: saleErr } = await supabase.from('sales').upsert(salesBatch);
        if (saleErr) throw saleErr;

        // 5. Detalles y Pagos (Opcional en Test, pero hagamos una muestra)
        console.log("Migración de prueba completada para Clientes y Ventas.");

    } catch (err) {
        console.error("Error crítico en la migración:", err);
    }
}

startMigration();
