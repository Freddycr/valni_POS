// scripts/verify-source.mjs
const FIREBASE_BASE_URL = 'https://us-central1-registroventas-466719.cloudfunctions.net';

async function fetchFromFirebase(endpoint) {
    console.log(`[Firebase] Intentando conectar con ${endpoint}...`);
    try {
        const resp = await fetch(`${FIREBASE_BASE_URL}/${endpoint}`);
        if (!resp.ok) {
            console.error(`[Error] Fallo en ${endpoint}: ${resp.status} ${resp.statusText}`);
            return null;
        }
        const data = await resp.json();
        return data;
    } catch (err) {
        console.error(`[Error] Excepción al conectar con ${endpoint}:`, err.message);
        return null;
    }
}

async function verify() {
    console.log('--- VERIFICACIÓN DE ORIGEN (GOOGLE SHEETS / FIREBASE) ---');
    
    const productsData = await fetchFromFirebase('getProducts');
    if (productsData && productsData.products) {
        console.log(`[OK] getProducts: Se encontraron ${productsData.products.length} productos.`);
        // Muestra una muestra del primer producto si existe
        if (productsData.products.length > 0) {
            console.log('Ejemplo de datos (Producto):', JSON.stringify(productsData.products[0], null, 2));
        }
    } else {
        console.warn('[FAIL] No se obtuvieron datos de productos.');
    }

    console.log('\n-----------------------------------');
    
    const salesData = await fetchFromFirebase('getSalesData');
    if (salesData) {
        const salesCount = (salesData.sales || []).length;
        const detailsCount = (salesData.details || []).length;
        const customersCount = (salesData.customers || []).length;
        console.log(`[OK] getSalesData:`);
        console.log(` - Ventas: ${salesCount}`);
        console.log(` - Detalles: ${detailsCount}`);
        console.log(` - Clientes: ${customersCount}`);
        
        if (salesCount > 0) {
            console.log('Ejemplo de datos (Venta):', JSON.stringify(salesData.sales[0], null, 2));
        }
    } else {
        console.warn('[FAIL] No se obtuvieron datos de ventas/clientes.');
    }
}

verify();
