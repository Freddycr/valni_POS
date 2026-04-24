import pkg from 'pg';
const { Client } = pkg;

// Trying pooler port 6543 instead of 5432
const DATABASE_URL = "postgresql://postgres:Valni_Maylu_3008%23S1@db.ypeolvspffwxjtqxphzr.supabase.co:6543/postgres?sslmode=require";

async function fixStock() {
    const client = new Client({
        connectionString: DATABASE_URL,
    });

    try {
        console.log('--- Intentando conectar a Supabase (Postgres Pooler) ---');
        await client.connect();
        console.log('Conexión establecida.');
        
        console.log('--- Corrigiendo Stock en la tabla products ---');

        const res1 = await client.query(`
            UPDATE products 
            SET stock_quantity = CASE 
                WHEN status = 'available' THEN 1 
                WHEN status = 'sold' THEN 0 
                ELSE stock_quantity 
            END
            WHERE type = 'smartphone' 
              AND (
                (status = 'available' AND stock_quantity <= 0) 
                OR (status = 'sold' AND stock_quantity != 0)
              )
        `);
        console.log(`Smartphones corregidos: ${res1.rowCount}`);

        const res2 = await client.query(`
            UPDATE products 
            SET stock_quantity = 0 
            WHERE type = 'accessory' AND stock_quantity < 0
        `);
        console.log(`Accesorios con stock negativo corregidos: ${res2.rowCount}`);

        console.log('--- Sincronizando tabla inventory_balances ---');
        const res3 = await client.query(`
            UPDATE inventory_balances ib
            SET on_hand = p.stock_quantity,
                updated_at = NOW()
            FROM products p
            WHERE ib.product_id = p.id
              AND ib.on_hand != p.stock_quantity
        `);
        console.log(`Registros de inventory_balances sincronizados: ${res3.rowCount}`);

        console.log('--- Sincronizando tabla stock_balances ---');
        const res4 = await client.query(`
            UPDATE stock_balances sb
            SET on_hand = p.stock_quantity,
                updated_at = NOW()
            FROM products p
            JOIN product_variants pv ON pv.product_id = p.id
            WHERE sb.variant_id = pv.id
              AND sb.on_hand != p.stock_quantity
        `);
        console.log(`Registros de stock_balances sincronizados: ${res4.rowCount}`);

        console.log('\n--- Reparación completada exitosamente ---');

    } catch (err) {
        console.error('Error durante la reparación:', err);
    } finally {
        await client.end();
    }
}

fixStock();
