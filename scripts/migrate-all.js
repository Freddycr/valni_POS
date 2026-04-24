import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuration
const FIREBASE_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';
const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE) {
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// --- Migration Constants & Maps ---
const MIGRATION_PREFIX = 'MIG-';
const DEFAULT_COMPANY_NAME = 'VALNI_TEST_MIG';
const DEFAULT_STORE_NAME = 'TIENDA PRINCIPAL TEST';
const DEFAULT_LOCATION_NAME = 'TIENDA PRINCIPAL';
const DEFAULT_WAREHOUSE_LOCATION_NAME = 'ALMACEN PRINCIPAL';

// Maps
const brandMap = new Map();
const categoryMap = new Map();
const modelMap = new Map();
const productMap = new Map();
const customerMap = new Map();
const customerRedirection = new Map();
const saleMap = new Map();

let companyId, storeId;

function toPeruIsoTimestamp(input) {
    if (!input) return new Date().toISOString();
    if (input instanceof Date) return input.toISOString();
    const raw = String(input).trim();
    if (!raw) return new Date().toISOString();
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw).toISOString();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})$/);
    if (match) return `${match[1]}T${match[2].padStart(2, '0')}:${match[3]}:${match[4]}-05:00`;
    return new Date(raw).toISOString();
}

function normalizeLocationName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw.includes('almacen')) return DEFAULT_WAREHOUSE_LOCATION_NAME;
    return DEFAULT_LOCATION_NAME;
}

async function fetchFromFirebase(endpoint) {
    console.log(`[Firebase] Fetching ${endpoint}...`);
    const resp = await fetch(`${FIREBASE_BASE_URL}/${endpoint}`);
    if (!resp.ok) throw new Error(`[Firebase] Error fetching ${endpoint}`);
    return await resp.json();
}

async function ensureFoundation() {
    console.log('--- Step 0: Ensuring Foundation Data (VALNI) ---');
    const { data: companies } = await supabase.from('companies').select('id').eq('name', DEFAULT_COMPANY_NAME);
    if (companies && companies.length > 0) {
        companyId = companies[0].id;
    } else {
        const { data: newComp, error: compErr } = await supabase.from('companies').insert({ name: DEFAULT_COMPANY_NAME }).select('id').single();
        if (compErr) {
            const { data: c2 } = await supabase.from('companies').select('id').eq('name', DEFAULT_COMPANY_NAME).single();
            companyId = c2.id;
        } else {
            companyId = newComp.id;
        }
    }
    const { data: stores } = await supabase.from('stores').select('id, name').eq('company_id', companyId);
    const existingStore = stores?.find(s => s.name.toUpperCase() === DEFAULT_STORE_NAME) || stores?.[0];
    if (existingStore) {
        storeId = existingStore.id;
        console.log(`Using store: ${storeId}`);
    } else {
        const { data: newStore } = await supabase.from('stores').insert({ company_id: companyId, name: DEFAULT_STORE_NAME, code: `T-${companyId.slice(0,4)}` }).select('id').single();
        storeId = newStore?.id || stores?.[0]?.id;
    }
}

async function migrateProducts(firebaseProducts) {
    console.log(`--- Step 1: Migrating ${firebaseProducts.length} Products ---`);

    // 1. Brands
    const brandNames = [...new Set(firebaseProducts.map(p => p.brand).filter(Boolean))];
    const brandBatch = brandNames.map(name => ({ company_id: companyId, name }));
    await supabase.from('brands').upsert(brandBatch, { onConflict: 'company_id, name' });
    const { data: allBrands } = await supabase.from('brands').select('id, name').eq('company_id', companyId);
    allBrands?.forEach(b => brandMap.set(b.name, b.id));

    // 2. Categories
    const categories = ['Smartphone', 'Tablet', 'Accessory', 'Part', 'Service'];
    await supabase.from('categories').upsert(categories.map(name => ({ company_id: companyId, name })), { onConflict: 'company_id, name' });
    const { data: allCats } = await supabase.from('categories').select('id, name').eq('company_id', companyId);
    allCats?.forEach(c => categoryMap.set(c.name, c.id));

    // 3. Models (Batch Process)
    console.log('Gathering unique models...');
    const modelPairs = new Map(); // modelName -> { brandId, categoryId }
    firebaseProducts.forEach(p => {
        if (!p.model) return;
        const brandId = brandMap.get(p.brand) || null;
        const categoryId = categoryMap.get(p.type === 'individual' ? 'Smartphone' : 'Accessory') || null;
        modelPairs.set(`${brandId}_${p.model}`, { brand_id: brandId, category_id: categoryId, name: p.model, company_id: companyId });
    });

    const modelsToInsert = [...modelPairs.values()];
    console.log(`Upserting ${modelsToInsert.length} models...`);
    for (let i = 0; i < modelsToInsert.length; i += 100) {
        await supabase.from('models').upsert(modelsToInsert.slice(i, i + 100), { onConflict: 'company_id, brand_id, name' });
    }
    const { data: allModels } = await supabase.from('models').select('id, brand_id, name').eq('company_id', companyId);
    allModels?.forEach(m => modelMap.set(`${m.brand_id}_${m.name}`, m.id));

    // 4. Products
    console.log('Batch upserting products...');
    const fbImeiMap = new Map();
    const productsBatch = firebaseProducts.map(p => {
        const brandId = brandMap.get(p.brand) || null;
        const modelId = modelMap.get(`${brandId}_${p.model}`) || null;
        const imei = p.imei1 || p.imei_1 || null;
        if(imei) fbImeiMap.set(imei, p.id);
        return {
            company_id: companyId,
            name: p.name || p.model || 'Unknown',
            description: p.description || '',
            type: p.type === 'individual' ? 'smartphone' : 'accessory',
            model_id: modelId,
            sell_price: p.price || 0,
            min_sell_price: p.minPrice || 0,
            stock_quantity: p.stock || 0,
            status: p.status === 'Vendido' ? 'sold' : 'available',
            location_bin: normalizeLocationName(p.location),
            imei_1: imei,
            serial_number: p.serialNumber || p.serial_number || null
        };
    });

    for (let i = 0; i < productsBatch.length; i += 100) {
        const { data } = await supabase.from('products').upsert(productsBatch.slice(i, i + 100), { onConflict: 'company_id, imei_1' }).select('id, imei_1');
        data?.forEach(pResult => {
            if (pResult.imei_1) productMap.set(fbImeiMap.get(pResult.imei_1), pResult.id);
        });
    }
}

async function migrateCustomers(firebaseCustomers) {
    console.log(`--- Step 2: Migrating ${firebaseCustomers.length} Customers ---`);
    const customerBatch = firebaseCustomers.map(c => {
        const dni = String(c.dni || c.docNumber || "").trim();
        if (!dni) return null;
        return {
            company_id: companyId,
            doc_type: 'DNI',
            doc_number: dni,
            full_name: c.fullName || c.name || 'Desconocido',
            email: c.email || null,
            phone: c.phone || null,
            address: c.address || null
        };
    }).filter(Boolean);

    for (let i = 0; i < customerBatch.length; i += 100) {
        const { data } = await supabase.from('customers').upsert(customerBatch.slice(i, i + 100), { onConflict: 'company_id, doc_number' }).select('id, doc_number');
        data?.forEach(c => customerMap.set(c.doc_number, c.id));
    }
    firebaseCustomers.forEach(c => {
        const dni = String(c.dni || c.docNumber || "").trim();
        if (dni && customerMap.has(dni)) customerRedirection.set(c.id, customerMap.get(dni));
    });
}

async function migrateSales(firebaseSales, firebaseDetails) {
    console.log(`--- Step 3: Migrating ${firebaseSales.length} Sales ---`);
    const salesBatch = firebaseSales.map(s => {
        const newSaleId = crypto.randomUUID();
        saleMap.set(s.id, newSaleId);
        return {
            id: newSaleId,
            company_id: companyId,
            store_id: storeId,
            invoice_number: `${MIGRATION_PREFIX}${s.id}`,
            customer_id: customerRedirection.get(s.customerId) || null,
            total_amount: s.total || 0,
            status: 'completed',
            created_at: toPeruIsoTimestamp(s.date)
        };
    });

    for (let i = 0; i < salesBatch.length; i += 100) {
        await supabase.from('sales').upsert(salesBatch.slice(i, i + 100), { onConflict: 'company_id, invoice_number' });
    }

    const itemsBatch = [];
    firebaseSales.forEach(s => {
        const newSaleId = saleMap.get(s.id);
        const details = (s.items || []).concat(firebaseDetails.filter(d => d.saleId === s.id));
        details.forEach(item => {
            const prodId = productMap.get(item.productId);
            if (prodId) {
                itemsBatch.push({
                    sale_id: newSaleId,
                    product_id: prodId,
                    company_id: companyId,
                    quantity: item.quantity || 1,
                    unit_price: item.salePrice || 0,
                    total_price: (item.quantity || 1) * (item.salePrice || 0),
                    captured_imei: item.imei1 || null
                });
            }
        });
    });

    for (let i = 0; i < itemsBatch.length; i += 100) {
        await supabase.from('sale_items').insert(itemsBatch.slice(i, i + 100));
    }
}

async function start() {
    try {
        console.log('--- STARTING MIGRATION ---');
        await ensureFoundation();
        const pData = await fetchFromFirebase('getProducts');
        const sPackage = await fetchFromFirebase('getSalesData');
        await migrateProducts(pData.products || []);
        await migrateCustomers(sPackage.customers || []);
        await migrateSales(sPackage.sales || [], sPackage.details || []);
        console.log('\n--- Migration SUCCESSFUL ---');
    } catch (err) {
        console.error('\n--- Migration FAILED ---', err);
        process.exit(1);
    }
}
start();
