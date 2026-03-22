import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ji7xqwRoXGiIv02v-j_Ofg_SYqgBwfu';

const baseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const now = new Date();
const suffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

const demoConfig = {
  companyName: `VALNI_DEMO_${suffix}`,
  admin: {
    fullName: 'Administrador Demo',
    email: `demo.admin.${suffix}@valni.com`,
    password: `DemoValni#${now.getFullYear()}!`
  }
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeImei(base, index) {
  const n = `${base}${String(index).padStart(8, '0')}`;
  return n.slice(0, 15);
}

async function assertNoError(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

async function main() {
  console.log('Iniciando provision de empresa demo...');

  const createdCompany = await assertNoError(
    await baseClient
      .from('companies')
      .insert({ name: demoConfig.companyName })
      .select('id, name')
      .single(),
    'No se pudo crear la empresa'
  );

  const companyId = createdCompany.id;
  console.log(`Empresa creada: ${createdCompany.name} (${companyId})`);

  const signUpResult = await baseClient.auth.signUp({
    email: demoConfig.admin.email,
    password: demoConfig.admin.password,
    options: {
      data: {
        full_name: demoConfig.admin.fullName,
        role: 'admin'
      }
    }
  });

  if (signUpResult.error || !signUpResult.data.user) {
    throw new Error(`No se pudo crear usuario admin: ${signUpResult.error?.message || 'sin detalle'}`);
  }

  const adminUserId = signUpResult.data.user.id;
  console.log(`Usuario admin creado: ${demoConfig.admin.email} (${adminUserId})`);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const signInResult = await authClient.auth.signInWithPassword({
    email: demoConfig.admin.email,
    password: demoConfig.admin.password
  });

  if (signInResult.error) {
    throw new Error(`No se pudo iniciar sesion con el admin demo: ${signInResult.error.message}`);
  }

  await assertNoError(
    await authClient
      .from('profiles')
      .update({
        full_name: demoConfig.admin.fullName,
        role: 'admin',
        is_active: true,
        company_id: companyId
      })
      .eq('id', adminUserId),
    'No se pudo actualizar el perfil admin'
  );

  const storeCode = `DEMOSTORE_${suffix}`;
  const warehouseStoreCode = `DEMOALM_${suffix}`;

  const tienda = await assertNoError(
    await authClient
      .from('stores')
      .insert({
        company_id: companyId,
        code: storeCode,
        name: 'Tienda Demo',
        type: 'store',
        is_active: true,
        is_default: true
      })
      .select('id, code, name')
      .single(),
    'No se pudo crear tienda demo'
  );

  const almacenStore = await assertNoError(
    await authClient
      .from('stores')
      .insert({
        company_id: companyId,
        code: warehouseStoreCode,
        name: 'Almacen Demo',
        type: 'warehouse',
        is_active: true,
        is_default: false
      })
      .select('id, code, name')
      .single(),
    'No se pudo crear almacen demo'
  );

  await assertNoError(
    await authClient
      .from('warehouses')
      .insert([
        {
          company_id: companyId,
          store_id: tienda.id,
          code: `WH_${storeCode}`,
          name: 'Almacen Tienda Demo',
          type: 'main',
          active: true
        },
        {
          company_id: companyId,
          store_id: almacenStore.id,
          code: `WH_${warehouseStoreCode}`,
          name: 'Almacen Central Demo',
          type: 'main',
          active: true
        }
      ]),
    'No se pudieron crear warehouses demo'
  );

  await assertNoError(
    await authClient
      .from('user_store_assignments')
      .insert([
        {
          user_id: adminUserId,
          store_id: tienda.id,
          company_id: companyId,
          is_default: true,
          can_sell: true,
          can_manage_inventory: true
        },
        {
          user_id: adminUserId,
          store_id: almacenStore.id,
          company_id: companyId,
          is_default: false,
          can_sell: true,
          can_manage_inventory: true
        }
      ]),
    'No se pudo asignar tiendas al admin'
  );

  await assertNoError(
    await authClient
      .from('company_receipt_settings')
      .upsert(
        [
          {
            company_id: companyId,
            header_text: demoConfig.companyName
          }
        ],
        { onConflict: 'company_id' }
      ),
    'No se pudo crear configuracion de recibo'
  );

  const customerNames = [
    'Ana Torres',
    'Luis Paredes',
    'Carmen Rojas',
    'Diego Salas',
    'Mariela Quispe',
    'Jorge Atencio',
    'Paola Ccanto',
    'Renzo Medina'
  ];

  const customersPayload = customerNames.map((fullName, i) => ({
    company_id: companyId,
    doc_type: 'DNI',
    doc_number: `77${String(i + 1).padStart(6, '0')}`,
    full_name: fullName,
    phone: `9${String(10000000 + i).slice(0, 8)}`,
    address: 'Lima'
  }));

  const customers = await assertNoError(
    await authClient
      .from('customers')
      .insert(customersPayload)
      .select('id, full_name, doc_number'),
    'No se pudieron crear clientes demo'
  );

  const smartphoneModels = ['Galaxy A55', 'Redmi Note 13', 'Moto G84', 'iPhone 13', 'Honor X8'];
  const accessoryModels = ['Case Antigolpes', 'Vidrio Templado', 'Cargador 25W', 'Audifonos BT', 'Cable USB-C'];

  const productsPayload = [];
  for (let i = 0; i < 18; i += 1) {
    const model = pick(smartphoneModels);
    const price = randomInt(650, 2200);
    const minPrice = Math.max(500, price - randomInt(30, 120));
    const inStore = i < 12;
    productsPayload.push({
      company_id: companyId,
      type: 'smartphone',
      name: model,
      description: `Demo ${suffix} ${i + 1}`,
      sell_price: price,
      min_sell_price: minPrice,
      buy_price: Math.max(350, minPrice - randomInt(20, 80)),
      stock_quantity: randomInt(1, 6),
      status: 'available',
      location_bin: inStore ? 'Tienda' : 'Almacen',
      imei_1: makeImei('86990', i + Number(suffix.slice(-5))),
      serial_number: `SN-${suffix}-${String(i + 1).padStart(3, '0')}`
    });
  }

  for (let i = 0; i < 12; i += 1) {
    const model = pick(accessoryModels);
    const price = randomInt(25, 180);
    const minPrice = Math.max(15, price - randomInt(3, 20));
    const inStore = i < 8;
    productsPayload.push({
      company_id: companyId,
      type: 'accessory',
      name: model,
      description: `Demo ${suffix} ACC ${i + 1}`,
      sell_price: price,
      min_sell_price: minPrice,
      buy_price: Math.max(8, minPrice - randomInt(1, 10)),
      stock_quantity: randomInt(2, 20),
      status: 'available',
      location_bin: inStore ? 'Tienda' : 'Almacen'
    });
  }

  const products = await assertNoError(
    await authClient
      .from('products')
      .insert(productsPayload)
      .select('id, name, sell_price, stock_quantity, location_bin'),
    'No se pudieron crear productos demo'
  );

  const inventoryBalancesPayload = products.map((p) => ({
    company_id: companyId,
    product_id: p.id,
    store_id: p.location_bin === 'Almacen' ? almacenStore.id : tienda.id,
    on_hand: p.stock_quantity ?? 0,
    reserved: 0
  }));

  await assertNoError(
    await authClient
      .from('inventory_balances')
      .upsert(inventoryBalancesPayload, { onConflict: 'product_id,store_id' }),
    'No se pudieron crear saldos de inventario demo'
  );

  const sellableProducts = products.filter((p) => (p.location_bin || '').toLowerCase() === 'tienda');
  const paymentMethods = ['cash', 'yape', 'plin', 'credit_card', 'bank_transfer'];
  const salesPayload = [];
  const saleItemsPayload = [];
  const salePaymentsPayload = [];

  for (let i = 0; i < 24; i += 1) {
    const saleId = crypto.randomUUID();
    const createdAt = new Date(now.getTime() - randomInt(0, 9) * 24 * 60 * 60 * 1000 - randomInt(0, 10) * 60 * 60 * 1000);
    const itemsInSale = randomInt(1, 3);
    const selected = [...sellableProducts].sort(() => 0.5 - Math.random()).slice(0, itemsInSale);

    let total = 0;
    selected.forEach((product) => {
      const qty = product.name.includes('Case') || product.name.includes('Cable') ? randomInt(1, 2) : 1;
      const unit = Number(product.sell_price || 0);
      const line = unit * qty;
      total += line;
      saleItemsPayload.push({
        sale_id: saleId,
        company_id: companyId,
        product_id: product.id,
        quantity: qty,
        unit_price: unit,
        total_price: line,
        captured_imei: product.name.includes('iPhone') || product.name.includes('Galaxy') || product.name.includes('Redmi') || product.name.includes('Moto') || product.name.includes('Honor')
          ? `IMEI-${product.id.slice(0, 8)}`
          : null,
        captured_serial: `SER-${product.id.slice(0, 8)}`
      });
    });

    salesPayload.push({
      id: saleId,
      company_id: companyId,
      store_id: tienda.id,
      invoice_number: `DEMO-${suffix}-${String(i + 1).padStart(4, '0')}`,
      customer_id: pick(customers).id,
      seller_id: adminUserId,
      subtotal: total,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: total,
      status: 'completed',
      document_type: 'Recibo de Venta',
      created_at: createdAt.toISOString()
    });

    salePaymentsPayload.push({
      sale_id: saleId,
      company_id: companyId,
      payment_store_id: tienda.id,
      payment_method: pick(paymentMethods),
      amount: total,
      payment_date: createdAt.toISOString()
    });
  }

  // En este proyecto, la escritura de ventas puede estar restringida por RLS para sesiones autenticadas.
  // Usamos el cliente base para la siembra de demo (misma clave publishable usada por la app).
  await assertNoError(
    await baseClient.from('sales').insert(salesPayload),
    'No se pudieron crear ventas demo'
  );

  await assertNoError(
    await baseClient.from('sale_items').insert(saleItemsPayload),
    'No se pudieron crear items de venta demo'
  );

  await assertNoError(
    await baseClient.from('sale_payments').insert(salePaymentsPayload),
    'No se pudieron crear pagos demo'
  );

  console.log('\nProvision completada.\n');
  console.log(JSON.stringify({
    company: {
      id: companyId,
      name: demoConfig.companyName
    },
    admin: {
      userId: adminUserId,
      email: demoConfig.admin.email,
      password: demoConfig.admin.password
    },
    stores: {
      tiendaId: tienda.id,
      almacenId: almacenStore.id
    },
    seeded: {
      customers: customers.length,
      products: products.length,
      sales: salesPayload.length,
      saleItems: saleItemsPayload.length,
      payments: salePaymentsPayload.length
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
