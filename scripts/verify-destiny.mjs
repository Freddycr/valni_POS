// scripts/verify-destiny.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ji7xqwRoXGiIv02v-j_Ofg_SYqgBwfu';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verify() {
    console.log('--- VERIFICACIÓN DE DESTINO (SUPABASE) ---');
    console.log(`[Supabase] Intentando conectar con ${SUPABASE_URL}...`);

    try {
        // Consultar productos (al menos uno) para validar acceso
        const { data: products, error, count } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: false })
            .limit(1);

        if (error) {
            console.error('[FAIL] Error al consultar tabla "products":', error.message);
            console.log('Nota: Es posible que RLS esté activo y no permita lectura con anon_key.');
        } else {
            console.log(`[OK] Conexión establecida.`);
            console.log(`[OK] La tabla "products" es accesible.`);
            console.log(`[Info] Registros actuales en Supabase: ${count}`);
            if (products.length > 0) {
                console.log('Muestra de producto existente en Supabase:', JSON.stringify(products[0], null, 2));
            }
        }

        // Verificar esquema básico (intentar algunas tablas para confirmar existencia)
        const tables = ['companies', 'stores', 'sales', 'customers'];
        for (const table of tables) {
            const { error: tError } = await supabase.from(table).select('id').limit(1);
            if (tError) {
                console.warn(`[WARN] Tabla "${table}" produjo error (podría ser RLS):`, tError.message);
            } else {
                console.log(`[OK] Tabla "${table}" verificada.`);
            }
        }

    } catch (err) {
        console.error('[CRITICAL] Error fatal conectando a Supabase:', err.message);
    }
}

verify();
