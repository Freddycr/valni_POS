import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuration
const FIREBASE_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';
const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// --- Migration Constants & Maps ---
const MIGRATION_PREFIX = 'MIG-';
const DEFAULT_COMPANY_NAME = 'VALNI_TEST_MIG';
const DEFAULT_STORE_NAME = 'Tienda Principal Test';
const DEFAULT_WAREHOUSE_NAME = 'Almacén Principal Test';

// Maps to track legacy IDs vs new UUIDs
const brandMap = new Map(); // name -> uuid
const categoryMap = new Map(); // name -> uuid
const modelMap = new Map(); // `${brandId}_${name}` -> uuid
const productMap = new Map(); // firebase_product_id -> { prodId, variantId }
const customerMap = new Map(); // dni -> uuid
const customerRedirection = new Map(); // firebase_customer_id -> uuid
const saleMap = new Map(); // firebase_sale_id -> uuid
const serializedMap = new Map(); // serial -> uuid

let companyId, storeId, warehouseId;
const LIMA_UTC_OFFSET = '-05:00';

function toPeruIsoTimestamp(input) {
    if (!input) return new Date().toISOString();
    if (input instanceof Date) return input.toISOString();

    const raw = String(input).trim();
    if (!raw) return new Date().toISOString();

    // If source already includes timezone info, keep the same instant.
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }

    // Google Sheet source format: "YYYY-MM-DD H:mm:ss" (Peru local time).
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(\.\d+)?$/);
    if (match) {
        const [, datePart, hour, minute, second, fraction = ''] = match;
        return `${datePart}T${hour.padStart(2, '0')}:${minute}:${second}${fraction}${LIMA_UTC_OFFSET}`;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function fetchFromFirebase(endpoint) {
    console.log(`[Firebase] Fetching ${endpoint}...`);
    const resp = await fetch(`${FIREBASE_BASE_URL}/${endpoint}`);
    if (!resp.ok) throw new Error(`[Firebase] Error fetching ${endpoint}: ${resp.statusText}`);
    return await resp.json();
}

async function ensureFoundation() {
    console.log('--- Step 0: Ensuring Foundation Data (VALNI) ---');

    // 1. Company
    const { data: company, error: compErr } = await supabase
        .from('companies')
        .select('id')
        .eq('name', DEFAULT_COMPANY_NAME)
        .single();

    if (compErr && compErr.code !== 'PGRST116') {
        console.error('Error checking company:', compErr);
        throw compErr;
    }

    if (company) {
        companyId = company.id;
        console.log(`Using existing company: ${companyId}`);
    } else {
        const { data: newComp, error: insCompErr } = await supabase
            .from('companies')
            .insert({ name: DEFAULT_COMPANY_NAME })
            .select('id')
            .single();
        if (insCompErr) throw insCompErr;
        companyId = newComp.id;
        console.log(`Created company: ${companyId}`);
    }

    // 2. Store
    const { data: store, error: storeErr } = await supabase
        .from('stores')
        .select('id')
        .eq('company_id', companyId)
        .eq('name', DEFAULT_STORE_NAME)
        .single();

    if (store) {
        storeId = store.id;
        console.log(`Using existing store: ${storeId}`);
    } else {
        const { data: newStore, error: insStoreErr } = await supabase
            .from('stores')
            .insert({
                company_id: companyId,
                name: DEFAULT_STORE_NAME,
                code: 'T01'
            })
            .select('id')
            .single();
        if (insStoreErr) throw insStoreErr;
        storeId = newStore.id;
        console.log(`Created store: ${storeId}`);
    }

    // 3. (Optional) Warehouse - use default store if missing
    warehouseId = null; // Skipping for now as it's not in the server schema
}

async function migrateProducts(firebaseProducts) {
    console.log(`--- Step 1: Migrating ${firebaseProducts.length} Products ---`);

    // ... (Brands, Categories, Models logic remains same but can be batched too)
    const brands = [...new Set(firebaseProducts.map(p => p.brand).filter(Boolean))];
    const categories = ['Smartphone', 'Tablet', 'Accessory', 'Part', 'Service'];

    console.log(`Processing ${brands.length} brands...`);
    for (const bName of brands) {
        const { data, error } = await supabase.from('brands').upsert({ name: bName }, { onConflict: 'name' }).select('id').single();
        if (!error) brandMap.set(bName, data.id);
    }

    console.log(`Processing ${categories.length} categories...`);
    for (const cName of categories) {
        const { data, error } = await supabase.from('categories').upsert({ name: cName }, { onConflict: 'name' }).select('id').single();
        if (error) console.error(`Error with category ${cName}:`, error);
        else categoryMap.set(cName, data.id);
    }

    // Process Models
    console.log('Processing models...');
    for (const p of firebaseProducts) {
        const brandId = brandMap.get(p.brand) || null;
        const categoryId = categoryMap.get(p.type === 'individual' ? 'Smartphone' : 'Accessory') || null;
        const modelKey = `${brandId}_${p.model}`;

        if (p.model && !modelMap.has(modelKey)) {
            const { data, error } = await supabase.from('models').upsert({
                brand_id: brandId,
                category_id: categoryId,
                name: p.model
            }, { onConflict: 'brand_id, name' }).select('id').single();
            if (!error) modelMap.set(modelKey, data.id);
        }
    }

    // Process Products and Variants
    // In legacy, many "products" are actually serialized items of the same model/type.
    // However, to keep it simple and safe for migration, we'll map them carefully.
    console.log('Processing products and variants...');
    // --- Optimized Batch Product Insertion ---
    const productsToInsert = firebaseProducts.map(p => {
        const modelId = modelMap.get(`${brandMap.get(p.brand)}_${p.model}`) || null;
        return {
            company_id: companyId,
            name: p.name,
            description: p.description,
            type: p.type === 'individual' ? 'smartphone' : 'accessory',
            model_id: modelId,
            sell_price: p.price || 0,
            min_sell_price: p.minPrice || 0,
            stock_quantity: p.stock || 0,
            status: p.status === 'Vendido' ? 'sold' : 'available',
            location_bin: p.location,
            imei_1: p.imei1 || null,
            serial_number: p.serialNumber || null
        };
    });

    // Pre-calculate lookup maps for re-mapping
    const fbImeiMap = new Map();
    const fbKeyMap = new Map();
    firebaseProducts.forEach(p => {
        if (p.imei1) fbImeiMap.set(p.imei1, p.id);
        else fbKeyMap.set(`${p.name}_${p.description}`, p.id);
    });

    console.log('Batch upserting products...');
    const BATCH_SIZE = 100;
    const seenImeisInCurrentRun = new Set();

    for (let i = 0; i < productsToInsert.length; i += BATCH_SIZE) {
        let batch = productsToInsert.slice(i, i + BATCH_SIZE);

        // Filter out duplicates within the batch OR already processed in this run
        batch = batch.filter(p => {
            if (p.imei_1) {
                if (seenImeisInCurrentRun.has(p.imei_1)) return false;
                seenImeisInCurrentRun.add(p.imei_1);
            }
            return true;
        });

        if (batch.length === 0) continue;

        const { data, error } = await supabase.from('products').upsert(batch, { onConflict: 'imei_1' }).select('id, imei_1, name, description');
        if (error) {
            console.error(`Batch error at ${i}:`, error);
        } else if (data) {
            data.forEach(p => {
                const fbId = p.imei_1 ? fbImeiMap.get(p.imei_1) : fbKeyMap.get(`${p.name}_${p.description}`);
                if (fbId) productMap.set(fbId, { productId: p.id });
            });
        }
    }
}

async function migrateCustomers(firebaseCustomers) {
    console.log(`--- Step 2: Migrating ${firebaseCustomers.length} Customers ---`);
    const processedDnis = new Set();

    for (const c of firebaseCustomers) {
        const dni = String(c.dni || c.docNumber || "").trim();
        if (!dni) {
            // For customers without DNI, we generate a fake one to keep integrity or handle specially
            // For now, let's just skip if empty but logically we might want to keep them
            console.warn(`Customer ${c.fullName} has no DNI. Skipping or use fallback.`);
            continue;
        }

        if (!processedDnis.has(dni)) {
            const { data, error } = await supabase.from('customers').upsert({
                company_id: companyId,
                doc_type: 'DNI',
                doc_number: dni,
                full_name: c.fullName || c.name || 'Desconocido',
                email: c.email || null,
                phone: c.phone || null,
                address: c.address || null
            }, { onConflict: 'doc_number' }).select('id').single();

            if (error) {
                console.error(`Error with customer ${dni}:`, error);
                continue;
            }
            customerMap.set(dni, data.id);
            processedDnis.add(dni);
        }
        customerRedirection.set(c.id, customerMap.get(dni));
    }
}

async function migrateSales(firebaseSales, firebaseDetails, firebasePayments) {
    console.log(`--- Step 3: Migrating ${firebaseSales.length} Sales ---`);

    const salesToInsert = [];
    const itemsToInsert = [];
    const paymentsToInsert = [];

    firebaseSales.forEach(s => {
        const custId = customerRedirection.get(s.customerId) || null;
        const newSaleId = crypto.randomUUID();
        saleMap.set(s.id, newSaleId);

        salesToInsert.push({
            id: newSaleId,
            company_id: companyId,
            store_id: storeId,
            invoice_number: `${MIGRATION_PREFIX}${s.id}`,
            customer_id: custId,
            total_amount: s.total || 0,
            status: 'completed',
            created_at: toPeruIsoTimestamp(s.date)
        });

        const items = (s.items || []).concat(firebaseDetails.filter(d => d.saleId === s.id));
        items.forEach(item => {
            const mapping = productMap.get(item.productId);
            if (mapping) {
                itemsToInsert.push({
                    sale_id: newSaleId,
                    product_id: mapping.productId,
                    quantity: item.quantity || 1,
                    unit_price: item.salePrice || 0,
                    total_price: (item.quantity || 1) * (item.salePrice || 0),
                    captured_imei: item.imei1 || null,
                    captured_serial: item.serialNumber || null
                });
            }
        });

        const payments = (s.payments || []).concat(firebasePayments.filter(p => p.saleId === s.id));
        payments.forEach(p => {
            const methodMapping = { 'Efectivo': 'cash', 'Tarjeta de Crédito': 'credit_card', 'Tarjeta de Débito': 'debit_card', 'Transferencia Bancaria': 'transfer', 'Yape': 'yape', 'Plin': 'plin' };
            paymentsToInsert.push({
                sale_id: newSaleId,
                payment_method: methodMapping[p.paymentMethod] || 'cash',
                amount: p.amount || 0,
                payment_date: toPeruIsoTimestamp(p.date || s.date)
            });
        });
    });

    console.log(`Inserting ${salesToInsert.length} Sales...`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < salesToInsert.length; i += BATCH_SIZE) {
        await supabase.from('sales').upsert(salesToInsert.slice(i, i + BATCH_SIZE), { onConflict: 'invoice_number' });
    }

    console.log(`Inserting ${itemsToInsert.length} Items...`);
    for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        await supabase.from('sale_items').insert(itemsToInsert.slice(i, i + BATCH_SIZE));
    }

    console.log(`Inserting ${paymentsToInsert.length} Payments...`);
    for (let i = 0; i < paymentsToInsert.length; i += BATCH_SIZE) {
        await supabase.from('sale_payments').insert(paymentsToInsert.slice(i, i + BATCH_SIZE));
    }
}

async function start() {
    try {
        console.log('--- STARTING MIGRATION ---');
        await ensureFoundation();

        console.log('--- FETCHING DATA FROM FIREBASE ---');
        const pData = await fetchFromFirebase('getProducts').catch(e => { console.error('Fetch products fail:', e); throw e; });
        const sPackage = await fetchFromFirebase('getSalesData').catch(e => { console.error('Fetch sales fail:', e); throw e; });

        console.log('--- MIGRATING ENTITIES ---');
        await migrateProducts(pData.products || []);
        await migrateCustomers(sPackage.customers || []);
        await migrateSales(sPackage.sales || [], sPackage.details || [], sPackage.payments || []);

        console.log('\n--- Migration SUCCESSFUL ---');
    } catch (err) {
        console.error('\n--- Migration FAILED ---');
        console.error('Error Details:', err);
        process.exit(1);
    }
}

start();
