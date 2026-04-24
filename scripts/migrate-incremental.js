import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── Configuration ───
const FIREBASE_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';
const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// ─── Constants ───
const MIGRATION_PREFIX = 'MIG-';
const COMPANY_ID = 'd02b20da-41de-4123-ace8-9c5528b334e1'; // VALNI_TEST_MIG
const LIMA_UTC_OFFSET = '-05:00';
const DEFAULT_LOCATION_NAME = 'TIENDA PRINCIPAL';
const DEFAULT_WAREHOUSE_LOCATION_NAME = 'ALMACEN PRINCIPAL';

// Dates to migrate (Peru timezone: UTC-5)
// Today: 2026-03-22, Yesterday: 2026-03-21, Verify: 2026-03-20
const TARGET_DATES = ['2026-03-20', '2026-03-21', '2026-03-22'];

// Maps
const brandMap = new Map();
const modelMap = new Map();
const productMap = new Map();
const customerMap = new Map();
const customerRedirection = new Map();

let storeId;

function toPeruIsoTimestamp(input) {
    if (!input) return new Date().toISOString();
    if (input instanceof Date) return input.toISOString();

    const raw = String(input).trim();
    if (!raw) return new Date().toISOString();

    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) {
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }

    const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(\.?\d*)$/);
    if (match) {
        const [, datePart, hour, minute, second, fraction = ''] = match;
        return `${datePart}T${hour.padStart(2, '0')}:${minute}:${second}${fraction}${LIMA_UTC_OFFSET}`;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function getPeruDate(dateStr) {
    if (!dateStr) return null;
    const raw = String(dateStr).trim();
    
    // Try to extract just the date part (YYYY-MM-DD)
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    
    // If it's a timestamp, convert to Peru time and extract date
    try {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
            // Subtract 5 hours for UTC-5
            const peruTime = new Date(d.getTime() - 5 * 60 * 60 * 1000);
            return peruTime.toISOString().substring(0, 10);
        }
    } catch (_) {}
    return null;
}

function normalizeLocationName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw.includes('almacen') || raw.includes('alamcen')) return DEFAULT_WAREHOUSE_LOCATION_NAME;
    if (raw.includes('tienda') || raw.includes('teinda')) return DEFAULT_LOCATION_NAME;
    return DEFAULT_LOCATION_NAME;
}

async function fetchFromFirebase(endpoint) {
    console.log(`[Firebase] Fetching ${endpoint}...`);
    const resp = await fetch(`${FIREBASE_BASE_URL}/${endpoint}`);
    if (!resp.ok) throw new Error(`[Firebase] Error fetching ${endpoint}: ${resp.statusText}`);
    return await resp.json();
}

async function loadExistingMaps() {
    console.log('--- Loading existing maps from Supabase ---');

    // Store
    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('company_id', COMPANY_ID)
        .limit(1)
        .single();
    storeId = store?.id;
    console.log(`Store ID: ${storeId}`);

    // Brands
    const { data: brands } = await supabase.from('brands').select('id, name');
    (brands || []).forEach(b => brandMap.set(b.name, b.id));
    console.log(`Loaded ${brandMap.size} brands`);

    // Models
    const { data: models } = await supabase.from('models').select('id, brand_id, name');
    (models || []).forEach(m => modelMap.set(`${m.brand_id}_${m.name}`, m.id));
    console.log(`Loaded ${modelMap.size} models`);

    // Products (with IMEI)
    const { data: products } = await supabase
        .from('products')
        .select('id, imei_1, name, description')
        .eq('company_id', COMPANY_ID);
    (products || []).forEach(p => {
        if (p.imei_1) productMap.set(p.imei_1, { productId: p.id });
    });
    console.log(`Loaded ${productMap.size} products (by IMEI)`);

    // Customers
    const { data: customers } = await supabase
        .from('customers')
        .select('id, doc_number')
        .eq('company_id', COMPANY_ID);
    (customers || []).forEach(c => {
        if (c.doc_number) customerMap.set(c.doc_number, c.id);
    });
    console.log(`Loaded ${customerMap.size} customers`);
}

async function getExistingSaleInvoices() {
    const { data, error } = await supabase
        .from('sales')
        .select('invoice_number')
        .eq('company_id', COMPANY_ID)
        .like('invoice_number', 'MIG-%');
    
    if (error) {
        console.error('Error fetching existing invoices:', error);
        return new Set();
    }
    const set = new Set((data || []).map(s => s.invoice_number));
    console.log(`Found ${set.size} existing migrated sales`);
    return set;
}

async function migrateNewProducts(firebaseProducts, filteredSales) {
    // Get all product IDs referenced by the filtered sales
    const referencedProductIds = new Set();
    filteredSales.forEach(s => {
        (s.items || []).forEach(i => referencedProductIds.add(i.productId));
    });
    
    // Filter to only products used in these sales
    const relevantProducts = firebaseProducts.filter(p => referencedProductIds.has(p.id));
    console.log(`--- Migrating ${relevantProducts.length} products referenced by new sales ---`);

    // Brands
    const newBrands = [...new Set(relevantProducts.map(p => p.brand).filter(b => b && !brandMap.has(b)))];
    for (const bName of newBrands) {
        const { data, error } = await supabase.from('brands').upsert({ name: bName }, { onConflict: 'name' }).select('id').single();
        if (!error) brandMap.set(bName, data.id);
    }
    if (newBrands.length) console.log(`Added ${newBrands.length} new brands`);

    // Models
    for (const p of relevantProducts) {
        const brandId = brandMap.get(p.brand) || null;
        const modelKey = `${brandId}_${p.model}`;
        if (p.model && !modelMap.has(modelKey)) {
            const categoryId = null; // Will be resolved if categories exist
            const { data, error } = await supabase.from('models').upsert({
                brand_id: brandId,
                name: p.model
            }, { onConflict: 'brand_id, name' }).select('id').single();
            if (!error) modelMap.set(modelKey, data.id);
        }
    }

    // Products
    const productsToUpsert = [];
    const fbImeiMap = new Map();
    const fbKeyMap = new Map();

    relevantProducts.forEach(p => {
        if (p.imei1) fbImeiMap.set(p.imei1, p.id);
        else fbKeyMap.set(`${p.name}_${p.description}`, p.id);

        // Skip if already mapped by IMEI
        if (p.imei1 && productMap.has(p.imei1)) {
            return;
        }

        const modelId = modelMap.get(`${brandMap.get(p.brand)}_${p.model}`) || null;
        productsToUpsert.push({
            company_id: COMPANY_ID,
            name: p.name,
            description: p.description,
            type: p.type === 'individual' ? 'smartphone' : 'accessory',
            model_id: modelId,
            sell_price: p.price || 0,
            min_sell_price: p.minPrice || 0,
            stock_quantity: p.stock || 0,
            status: p.status === 'Vendido' ? 'sold' : 'available',
            location_bin: normalizeLocationName(p.location),
            imei_1: p.imei1 || null,
            serial_number: p.serialNumber || null
        });
    });

    if (productsToUpsert.length > 0) {
        console.log(`Upserting ${productsToUpsert.length} new/updated products...`);
        const BATCH_SIZE = 100;
        const seenImeis = new Set();

        for (let i = 0; i < productsToUpsert.length; i += BATCH_SIZE) {
            let batch = productsToUpsert.slice(i, i + BATCH_SIZE);
            batch = batch.filter(p => {
                if (p.imei_1) {
                    if (seenImeis.has(p.imei_1)) return false;
                    seenImeis.add(p.imei_1);
                }
                return true;
            });

            if (batch.length === 0) continue;
            const { data, error } = await supabase.from('products').upsert(batch, { onConflict: 'imei_1' }).select('id, imei_1, name, description');
            if (error) {
                console.error(`Product batch error at ${i}:`, error);
            } else if (data) {
                data.forEach(p => {
                    const fbId = p.imei_1 ? fbImeiMap.get(p.imei_1) : fbKeyMap.get(`${p.name}_${p.description}`);
                    if (fbId) productMap.set(fbId, { productId: p.id });
                    if (p.imei_1) productMap.set(p.imei_1, { productId: p.id });
                });
            }
        }
    }

    // Build direct firebase_id -> product mapping
    relevantProducts.forEach(p => {
        if (p.imei1 && productMap.has(p.imei1)) {
            productMap.set(p.id, productMap.get(p.imei1));
        }
    });
}

async function migrateNewCustomers(firebaseCustomers, filteredSales) {
    const referencedCustomerIds = new Set(filteredSales.map(s => s.customerId).filter(Boolean));
    const relevantCustomers = firebaseCustomers.filter(c => referencedCustomerIds.has(c.id));
    console.log(`--- Migrating ${relevantCustomers.length} customers referenced by new sales ---`);

    let newCount = 0;
    for (const c of relevantCustomers) {
        const dni = String(c.dni || c.docNumber || '').trim();
        if (!dni) continue;

        if (!customerMap.has(dni)) {
            const { data, error } = await supabase.from('customers').upsert({
                company_id: COMPANY_ID,
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
            newCount++;
        }
        customerRedirection.set(c.id, customerMap.get(dni));
    }
    console.log(`Added ${newCount} new customers`);
}

async function migrateNewSales(filteredSales, firebaseDetails, firebasePayments, existingInvoices) {
    // Filter out already migrated sales
    const newSales = filteredSales.filter(s => !existingInvoices.has(`${MIGRATION_PREFIX}${s.id}`));
    console.log(`--- Migrating ${newSales.length} new sales (${filteredSales.length - newSales.length} already exist) ---`);

    if (newSales.length === 0) {
        console.log('No new sales to migrate.');
        return { salesInserted: 0, itemsInserted: 0, paymentsInserted: 0 };
    }

    const salesToInsert = [];
    const itemsToInsert = [];
    const paymentsToInsert = [];

    newSales.forEach(s => {
        const custId = customerRedirection.get(s.customerId) || null;
        const newSaleId = crypto.randomUUID();

        salesToInsert.push({
            id: newSaleId,
            company_id: COMPANY_ID,
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
                    company_id: COMPANY_ID,
                    product_id: mapping.productId,
                    quantity: item.quantity || 1,
                    unit_price: item.salePrice || 0,
                    total_price: (item.quantity || 1) * (item.salePrice || 0),
                    captured_imei: item.imei1 || null,
                    captured_serial: item.serialNumber || null
                });
            } else {
                console.warn(`  ⚠ Product not found for item in sale ${s.id}: productId=${item.productId}`);
            }
        });

        const payments = (s.payments || []).concat(firebasePayments.filter(p => p.saleId === s.id));
        payments.forEach(p => {
            const methodMapping = {
                'Efectivo': 'cash',
                'Tarjeta de Crédito': 'credit_card',
                'Tarjeta de Débito': 'debit_card',
                'Transferencia Bancaria': 'bank_transfer',
                'Yape': 'yape',
                'Plin': 'plin'
            };
            paymentsToInsert.push({
                sale_id: newSaleId,
                company_id: COMPANY_ID,
                payment_method: methodMapping[p.paymentMethod] || 'cash',
                amount: p.amount || 0,
                payment_date: toPeruIsoTimestamp(p.date || s.date),
                payment_method_label: p.paymentMethod || null
            });
        });
    });

    // Insert Sales
    console.log(`Inserting ${salesToInsert.length} sales...`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < salesToInsert.length; i += BATCH_SIZE) {
        const { error } = await supabase.from('sales').upsert(
            salesToInsert.slice(i, i + BATCH_SIZE),
            { onConflict: 'invoice_number' }
        );
        if (error) console.error(`Sales batch error at ${i}:`, error);
    }

    // Insert Items
    console.log(`Inserting ${itemsToInsert.length} sale items...`);
    for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const { error } = await supabase.from('sale_items').insert(
            itemsToInsert.slice(i, i + BATCH_SIZE)
        );
        if (error) console.error(`Items batch error at ${i}:`, error);
    }

    // Insert Payments
    console.log(`Inserting ${paymentsToInsert.length} payments...`);
    for (let i = 0; i < paymentsToInsert.length; i += BATCH_SIZE) {
        const { error } = await supabase.from('sale_payments').insert(
            paymentsToInsert.slice(i, i + BATCH_SIZE)
        );
        if (error) console.error(`Payments batch error at ${i}:`, error);
    }

    return {
        salesInserted: salesToInsert.length,
        itemsInserted: itemsToInsert.length,
        paymentsInserted: paymentsToInsert.length
    };
}

async function reconcile() {
    console.log('\n--- RECONCILIACIÓN ---');

    // Sales by day
    const { data: salesByDay } = await supabase.rpc('', {}).catch(() => ({ data: null }));
    
    // Use raw SQL via a simple query
    const { data: verification } = await supabase
        .from('sales')
        .select('created_at, total_amount, invoice_number')
        .eq('company_id', COMPANY_ID)
        .gte('created_at', '2026-03-20T00:00:00-05:00')
        .order('created_at', { ascending: true });

    if (verification) {
        const byDay = {};
        verification.forEach(s => {
            // Parse date in Peru time
            const d = new Date(s.created_at);
            const peruTime = new Date(d.getTime() - 5 * 60 * 60 * 1000);
            const day = peruTime.toISOString().substring(0, 10);
            if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
            byDay[day].count++;
            byDay[day].total += Number(s.total_amount);
        });

        console.log('\n📊 Ventas por día (zona Perú):');
        console.log('─'.repeat(50));
        for (const [day, info] of Object.entries(byDay).sort()) {
            const label = day === '2026-03-22' ? '(HOY)' : 
                          day === '2026-03-21' ? '(AYER)' : 
                          day === '2026-03-20' ? '(ANTEAYER)' : '';
            console.log(`  ${day} ${label}: ${info.count} ventas, S/ ${info.total.toFixed(2)}`);
        }
        console.log('─'.repeat(50));
    }

    // Total counts
    const counts = {};
    for (const table of ['sales', 'sale_items', 'sale_payments', 'products', 'customers']) {
        const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('company_id', COMPANY_ID);
        counts[table] = count;
    }

    console.log('\n📈 Conteos totales:');
    for (const [table, count] of Object.entries(counts)) {
        console.log(`  ${table}: ${count}`);
    }
}

async function start() {
    try {
        console.log('═══════════════════════════════════════════════════');
        console.log('  MIGRACIÓN INCREMENTAL - Últimas 48h + Verificación');
        console.log(`  Fechas objetivo: ${TARGET_DATES.join(', ')}`);
        console.log(`  Ejecutado: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════\n');

        // Step 1: Load existing maps
        await loadExistingMaps();

        // Step 2: Fetch data from Firebase
        console.log('\n--- FETCHING DATA FROM FIREBASE ---');
        const pData = await fetchFromFirebase('getProducts');
        const sPackage = await fetchFromFirebase('getSalesData');

        const allProducts = pData.products || [];
        const allSales = sPackage.sales || [];
        const allCustomers = sPackage.customers || [];
        const allDetails = sPackage.details || [];
        const allPayments = sPackage.payments || [];

        console.log(`Firebase data: ${allProducts.length} products, ${allSales.length} sales, ${allCustomers.length} customers`);

        // Step 3: Filter sales for target dates
        const filteredSales = allSales.filter(s => {
            const peruDate = getPeruDate(s.date);
            return peruDate && TARGET_DATES.includes(peruDate);
        });

        console.log(`\nFiltered ${filteredSales.length} sales for target dates:`);
        const byDate = {};
        filteredSales.forEach(s => {
            const d = getPeruDate(s.date);
            byDate[d] = (byDate[d] || 0) + 1;
        });
        for (const [d, c] of Object.entries(byDate).sort()) {
            console.log(`  ${d}: ${c} ventas en Firebase`);
        }

        // Step 4: Get existing invoices to avoid duplicates
        const existingInvoices = await getExistingSaleInvoices();

        // Step 5: Migrate products referenced by new sales
        await migrateNewProducts(allProducts, filteredSales);

        // Step 6: Migrate customers referenced by new sales
        await migrateNewCustomers(allCustomers, filteredSales);

        // Step 7: Migrate sales (with dedup)
        const result = await migrateNewSales(filteredSales, allDetails, allPayments, existingInvoices);

        // Step 8: Reconcile
        await reconcile();

        console.log('\n═══════════════════════════════════════════════════');
        console.log('  ✅ MIGRACIÓN INCREMENTAL COMPLETADA');
        console.log(`  Ventas insertadas: ${result.salesInserted}`);
        console.log(`  Items insertados: ${result.itemsInserted}`);
        console.log(`  Pagos insertados: ${result.paymentsInserted}`);
        console.log('═══════════════════════════════════════════════════');

    } catch (err) {
        console.error('\n❌ MIGRACIÓN FALLIDA');
        console.error('Error:', err);
        process.exit(1);
    }
}

start();
