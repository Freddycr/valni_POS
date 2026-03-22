import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { User, Product, Customer, Brand, Model, PaymentMethodAdmin } from '../types';

const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ji7xqwRoXGiIv02v-j_Ofg_SYqgBwfu';

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- AUTENTICACIÓN ---
export const authenticateUser = async (email: string, password: string): Promise<User | null> => {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) throw authError;
  if (!authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError) throw profileError;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    username: profile.username,
    role: profile.role,
    isActive: profile.is_active
  };
};


export const saveUser = async (userData: any): Promise<User> => {
  // Usar un cliente temporal para crear el usuario sin cerrar la sesión actual del administrador
  // IMPORTANTE: Deshabilitar persistencia para evitar conflicto con la sesión principal en el mismo navegador
  const tempClient = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data, error } = await tempClient.auth.signUp({
    email: userData.email,
    password: userData.password,
    options: {
      data: {
        full_name: userData.fullName,
        role: userData.role
      }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error("No se pudo crear el usuario");

  // El trigger 'on_auth_user_created' se encarga de crear el perfil en la tabla 'profiles'

  return {
    id: data.user.id,
    email: data.user.email || '',
    fullName: userData.fullName,
    role: userData.role,
    isActive: true
  };
};

export const updateUser = async (user: any): Promise<User> => {
  // Nota: Cambiar la contraseña de otro usuario requiere Service Role Key o Edge Function.
  // Aquí solo actualizamos los datos del perfil si es posible.
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: user.fullName,
      role: user.role,
      is_active: user.isActive
    })
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    username: data.username,
    role: data.role,
    isActive: data.is_active
  };
};

// --- PRODUCTOS ---
export const getProducts = async (): Promise<Product[]> => {
  const { data, error } = await supabase
    .from('products')
    .select(`
            *,
            models (
                name,
                brands (
                    name
                )
            )
        `)
    .order('name');

  if (error) throw error;
  return (data || []).map((p: any) => ({
    ...p,
    stock: p.stock_quantity,    // Compatibilidad UI
    price: p.sell_price,        // Compatibilidad UI
    sellPrice: p.sell_price,
    minPrice: p.min_sell_price, // Compatibilidad UI
    minSellPrice: p.min_sell_price,
    stockQuantity: p.stock_quantity,
    // Mapeo de campos snake_case a camelCase para la UI
    imei1: p.imei_1,
    imei2: p.imei_2,
    serialNumber: p.serial_number,
    location: p.location || p.location_bin || 'Tienda', // Mapear location_bin a location
    status: p.status === 'available' ? 'Registrado' : (p.status || 'Registrado'),
    // Mapping Relations
    model: p.models?.name || '',
    brand: p.models?.brands?.name || ''
  })) as any;
};

// --- CLIENTES ---
export const getCustomers = async (): Promise<Customer[]> => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('full_name');

  if (error) throw error;
  return (data || []).map(c => ({
    ...c,
    dni: c.doc_number,    // Compatibilidad UI
    docNumber: c.doc_number,
    fullName: c.full_name
  })) as any;
};

export const saveCustomer = async (customer: any): Promise<Customer> => {
  // Map UI fields to DB fields if necessary
  const dbCustomer = {
    full_name: customer.fullName || customer.full_name,
    doc_type: customer.docType || customer.doc_type || 'DNI',
    doc_number: customer.dni || customer.docNumber || customer.doc_number,
    address: customer.address,
    phone: customer.phone
  };

  const { data, error } = await supabase
    .from('customers')
    .insert([dbCustomer])
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    dni: data.doc_number,
    docNumber: data.doc_number,
    fullName: data.full_name
  } as any;
};

// --- VENTAS (Motor del POS) ---
export const saveSale = async (payload: any): Promise<{ saleId: string }> => {
  // 1. Crear la cabecera de la venta
  const { data: saleData, error: saleError } = await supabase
    .from('sales')
    .insert([{
      customer_id: payload.customerId,
      // Si es el usuario de prueba (Bypass), enviar NULL para evitar error de FK
      seller_id: (payload.sellerId && payload.sellerId.startsWith('00000000')) ? null : payload.sellerId,
      total_amount: payload.total,
      status: 'completed'
    }])
    .select()
    .single();

  if (saleError) throw saleError;

  // 2. Insertar los ítems
  const saleItems = payload.items.map((item: any) => ({
    sale_id: saleData.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.salePrice,
    total_price: item.quantity * item.salePrice,
    captured_imei: item.imei1 || null,
    captured_serial: item.serialNumber || null
  }));

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems);

  if (itemsError) throw itemsError;

  // 3. Registrar los pagos
  // Mapeo de nombres de UI a claves ENUM de DB
  const methodMapping: { [key: string]: string } = {
    'Efectivo': 'cash',
    'Tarjeta de Crédito': 'credit_card',
    'Tarjeta de Débito': 'debit_card',
    'Transferencia Bancaria': 'transfer',
    'Yape': 'yape',
    'Plin': 'plin'
  };

  const salePayments = payload.payments.map((p: any) => ({
    sale_id: saleData.id,
    payment_method: methodMapping[p.paymentMethod] || 'cash',
    amount: p.amount
  }));

  const { error: paymentsError } = await supabase
    .from('sale_payments')
    .insert(salePayments);

  if (paymentsError) throw paymentsError;

  return { saleId: saleData.id };
};

// --- MAESTROS ---
export const getBrands = async (): Promise<Brand[]> => {
  const { data, error } = await supabase.from('brands').select('*').order('name');
  if (error) throw error;
  return (data || []) as any;
};

export const getModels = async (): Promise<Model[]> => {
  const { data, error } = await supabase.from('models').select('*').order('name');
  if (error) throw error;
  return (data || []) as any;
};

export const getPaymentMethods = async (): Promise<PaymentMethodAdmin[]> => {
  return [
    { id: 1, name: 'Efectivo' },
    { id: 2, name: 'Tarjeta de Crédito' },
    { id: 3, name: 'Tarjeta de Débito' },
    { id: 4, name: 'Transferencia Bancaria' },
    { id: 5, name: 'Yape' },
    { id: 6, name: 'Plin' }
  ];
};

export const getReceiptHeader = async () => {
  return { headerText: 'VALNI PERU - Supabase ERP', logoBase64: null };
};

// --- REPORTES ---
// Helper para mapear métodos de pago DB -> UI
const mapPaymentMethodFromDB = (method: string): string => {
  const mapping: { [key: string]: string } = {
    'cash': 'Efectivo',
    'credit_card': 'Tarjeta de Crédito',
    'debit_card': 'Tarjeta de Débito',
    'transfer': 'Transferencia Bancaria',
    'yape': 'Yape',
    'plin': 'Plin'
  };
  return mapping[method] || method;
};

// Helper interno para obtener todos los datos relacionados de ventas
const fetchSalesRelatedData = async (salesQuery: any) => {
  const { data: salesData, error: salesError } = await salesQuery
    .select('*')
    .order('created_at', { ascending: false });

  if (salesError) throw salesError;

  const sales = (salesData || []).map((s: any) => ({
    id: s.id,
    date: s.created_at,
    customerId: s.customer_id,
    sellerId: s.seller_id, // UUID if profiles use UUID, or int if legacy
    total: s.total_amount,
    status: s.status
  }));

  if (sales.length === 0) {
    return { sales: [], details: [], payments: [], products: [], users: [], customers: [] };
  }

  const saleIds = sales.map((s: any) => s.id);

  // Fetch details
  const { data: itemsData, error: itemsError } = await supabase
    .from('sale_items')
    .select('*')
    .in('sale_id', saleIds);

  if (itemsError) throw itemsError;

  const details = (itemsData || []).map((i: any) => ({
    id: i.id,
    saleId: i.sale_id,
    productId: i.product_id,
    quantity: i.quantity,
    salePrice: i.unit_price,
    imei1: i.captured_imei,
    serialNumber: i.captured_serial
  }));

  // Fetch payments
  const { data: paymentsData, error: paymentsError } = await supabase
    .from('sale_payments')
    .select('*')
    .in('sale_id', saleIds);

  if (paymentsError) throw paymentsError;

  const payments = (paymentsData || []).map((p: any) => ({
    id: p.id,
    saleId: p.sale_id,
    paymentMethod: mapPaymentMethodFromDB(p.payment_method),
    amount: p.amount
  }));

  // Fetch related entities to populate UI
  // 1. Customers
  const customerIds = [...new Set(sales.map((s: any) => s.customerId))];
  const { data: customersData } = await supabase.from('customers').select('*').in('id', customerIds);
  const customers = (customersData || []).map((c: any) => ({
    ...c,
    dni: c.doc_number,
    docNumber: c.doc_number,
    fullName: c.full_name
  }));

  // 2. Users (Sellers)
  const sellerIds = [...new Set(sales.map((s: any) => s.sellerId))];
  const { data: profilesData } = await supabase.from('profiles').select('*').in('id', sellerIds);
  const users = (profilesData || []).map((p: any) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    username: p.username,
    role: p.role,
    isActive: p.is_active
  }));

  // 3. Products
  const productIds = [...new Set(details.map((d: any) => d.productId))];
  const { data: productsData } = await supabase.from('products').select('*').in('id', productIds);
  const products = (productsData || []).map((p: any) => ({
    ...p,
    stock: p.stock_quantity,
    price: p.sell_price,
    sellPrice: p.sell_price,
    minPrice: p.min_sell_price,
    minSellPrice: p.min_sell_price,
    stockQuantity: p.stock_quantity,
    status: p.status || 'Registrado'
  }));

  return { sales, details, payments, customers, users, products };
};

export const getSalesData = async (): Promise<any> => {
  // Fetch all sales
  return await fetchSalesRelatedData(supabase.from('sales'));
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');

    if (error) {
      console.error("Error fetching users:", error);
      return [];
    }

    return (data || []).map(p => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      username: p.username,
      role: p.role,
      isActive: p.is_active
    })) as any;
  } catch (err) {
    console.error("Exception in getUsers:", err);
    return [];
  }
};

export const getDailyReportData = async (date: string): Promise<any> => {
  // Calculate start and end of day in UTC roughly or rely on local time stored?
  // Supabase stores timestamptz.
  // If we assume the user provides 'YYYY-MM-DD' in local time (e.g. Lima),
  // and we want to query that full day.

  // Simplest approach: Query by text comparison if created_at was stored as text, 
  // but likely it's native timestamp.

  // Let's filter by range. 
  // UTC-5: 00:00 -> 05:00 next day UTC
  // Start: YYYY-MM-DD 00:00:00 -05:00 -> ISO
  // End: YYYY-MM-DD 23:59:59 -05:00 -> ISO

  const start = new Date(`${date}T00:00:00-05:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999-05:00`).toISOString();

  const query = supabase.from('sales')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });

  return await fetchSalesRelatedData(query);
};
