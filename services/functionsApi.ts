import { User, Product, Customer, Sale, SaleDetail, PaymentDetail, Role, PaymentMethod, PaymentMethodAdmin, Brand, Model } from '../types';
import { FUNCTIONS_BASE_URL } from '../config';

import { PurchaseOrder } from '../types';

// Helper function to make API calls to Firebase Functions
const callFunction = async (functionName: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
  const url = `${FUNCTIONS_BASE_URL}/${functionName}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (method === 'POST' && body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`Error calling function ${functionName}: ${response.statusText}`);
  }
  
  return await response.json();
};

// Authentication functions
export const authenticateUser = async (email: string, password: string): Promise<User | null> => {
  try {
    const response = await callFunction('authenticateUser', 'POST', { email, password });
    return response.user || null;
  } catch (err) {
    console.error("Authentication error:", err);
    throw new Error("Error al autenticar usuario");
  }
};

// User functions
export const getUsers = async (): Promise<User[]> => {
  const response = await callFunction('getUsers');
  return response.users || [];
};

export const saveUser = async (user: Omit<User, 'id'>): Promise<User> => {
  const response = await callFunction('saveUser', 'POST', { user });
  return response;
};

export const updateUser = async (user: User): Promise<User> => {
  // For updating a user (including password reset), we'll use the same saveUser function
  // but pass the full user object with id
  const response = await callFunction('saveUser', 'POST', { user });
  return response;
};

// Product functions
export const getProducts = async (): Promise<Product[]> => {
  const response = await callFunction('getProducts');
  return response.products || [];
};

export const saveProduct = async (product: Partial<Product>): Promise<Product> => {
  const response = await callFunction('saveProduct', 'POST', { product });
  return response;
};

export const updateProduct = async (product: Product): Promise<Product> => {
  // For updating a product, we'll use the same saveProduct function
  // but ensure the full product object with id is passed
  const response = await callFunction('saveProduct', 'POST', { product });
  return response;
};

// Bulk update products
export const updateProductsBulk = async (products: Product[]): Promise<Product[]> => {
  const response = await callFunction('updateProductsBulk', 'POST', { products });
  return response.products || [];
};

// Customer functions
export const getCustomers = async (): Promise<Customer[]> => {
  const response = await callFunction('getCustomers');
  return response.customers || [];
};

export const saveCustomer = async (customer: Omit<Customer, 'id'>): Promise<Customer> => {
  const response = await callFunction('saveCustomer', 'POST', { customer });
  return response;
};

// Payment method functions
export const getPaymentMethods = async (): Promise<PaymentMethodAdmin[]> => {
  try {
    const response = await callFunction('getPaymentMethods');
    return response.paymentMethods || [];
  } catch (err) {
    console.error("Error fetching payment methods", err);
    // Return a default list if the function fails
    return [{id: 1, name: 'Efectivo'}, {id: 2, name: 'Tarjeta de Crédito'}, {id: 3, name: 'Transferencia'}];
  }
};

export const savePaymentMethod = async (paymentMethod: Omit<PaymentMethodAdmin, 'id'>): Promise<PaymentMethodAdmin> => {
  const response = await callFunction('savePaymentMethod', 'POST', { paymentMethod });
  return response;
};

// Brand functions
export const getBrands = async (): Promise<Brand[]> => {
  const response = await callFunction('getBrands');
  return response.brands || [];
};

export const saveBrand = async (brand: Omit<Brand, 'id'>): Promise<Brand> => {
  const response = await callFunction('saveBrand', 'POST', { brand });
  return response;
};

// Model functions
export const getModels = async (): Promise<Model[]> => {
  const response = await callFunction('getModels');
  return response.models || [];
};

export const saveModel = async (model: Omit<Model, 'id'>): Promise<Model> => {
  const response = await callFunction('saveModel', 'POST', { model });
  return response;
};

// Receipt functions
export const getReceiptHeader = async (): Promise<{ headerText: string; logoBase64: string | null }> => {
  try {
    const response = await callFunction('getReceiptHeader');
    
    // Handle both old string format and new object format
    if (typeof response === 'string') {
      return { headerText: response, logoBase64: null };
    }
    
    return {
      headerText: response.headerText || 'ENCABEZADO DEL RECIBO',
      logoBase64: response.logoBase64 || null
    };
  } catch (err) {
    console.error("Error fetching receipt header:", err);
    return { headerText: 'ENCABEZADO DEL RECIBO', logoBase64: null };
  }
};

export const saveReceiptHeader = async (headerText: string, logoBase64: string | null = null): Promise<void> => {
  await callFunction('saveReceiptHeader', 'POST', { headerText, logoBase64 });
};

// Sale functions
interface SalePayload {
  sellerId: number;
  customerId: number;
  total: number;
  items: { productId: number; quantity: number; salePrice: number; imei1?: string; imei2?: string; serialNumber?: string }[];
  payments: { paymentMethod: PaymentMethod; amount: number }[];
}

export const saveSale = async (payload: SalePayload): Promise<{ saleId: string }> => {
  try {
    const response = await callFunction('saveSale', 'POST', { payload });
    // The Firebase function returns { saleId }, but we need to make sure we return the correct structure
    return { saleId: response.saleId || `SALE-${Date.now()}` };
  } catch (error) {
    console.error("Error saving sale:", error);
    throw new Error("Failed to save sale");
  }
};

// Sales data functions
export const getSalesData = async (): Promise<{ sales: Sale[], details: SaleDetail[], payments: PaymentDetail[], customers: Customer[] }> => {
  try {
    const response = await callFunction('getSalesData');
    return response;
  } catch (error) {
    console.error("Error fetching sales data:", error);
    return {
      sales: [],
      details: [],
      payments: [],
      customers: []
    };
  }
};

export const getSalesByDateRange = async (startDate: Date, endDate: Date): Promise<Sale[]> => {
  try {
    const response = await callFunction('getSalesByDateRange', 'POST', { startDate, endDate });
    return response.sales || [];
  } catch (error) {
    console.error("Error fetching sales by date range:", error);
    return [];
  }
};

export const getDailyReportData = async (date: string, timezoneOffset: number): Promise<{ sales: Sale[], products: Product[], users: User[], details: SaleDetail[], payments: PaymentDetail[], customers: Customer[] }> => {
  try {
    const response = await callFunction('getDailyReportData', 'POST', { date, timezoneOffset });
    return response;
  } catch (error) {
    console.error("Error fetching daily report data:", error);
    return {
      sales: [],
      products: [],
      users: [],
      details: [],
      payments: [],
      customers: [],
    };
  }
};

// Purchase Order functions
export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
  try {
    const response = await callFunction('getPurchaseOrders');
    return response.purchaseOrders || [];
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return [];
  }
};

export const savePurchaseOrder = async (order: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
  try {
    const response = await callFunction('savePurchaseOrder', 'POST', { order });
    return response.order;
  } catch (error) {
    console.error("Error saving purchase order:", error);
    throw new Error("Failed to save purchase order");
  }
};
