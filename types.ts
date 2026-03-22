export type Role =
  | 'admin'
  | 'supervisor'
  | 'seller'
  | 'inventory_manager'
  | 'store_admin'
  | 'cashier'
  | 'warehouse'
  | 'auditor'
  | 'agent';

export type View = 'login' | 'sales' | 'reports' | 'dailyReport' | 'users' | 'whatsapp' | 'paymentMethods' | 'products' | 'brands' | 'models' | 'configuration' | 'purchaseOrders' | 'inventory' | 'lifecycle' | 'credits' | 'advances';

export type StoreType = 'store' | 'warehouse';
export type WarehouseType = 'store_floor' | 'main' | 'service' | 'virtual';

export interface Company {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Store {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  type: StoreType;
  isActive: boolean;
  isDefault: boolean;
}

export interface Warehouse {
  id: string;
  companyId: string;
  storeId?: string | null;
  storeName?: string;
  code: string;
  name: string;
  type: WarehouseType;
  active: boolean;
}

export interface UserStoreAssignment {
  id: string;
  companyId?: string;
  userId: string;
  storeId: string;
  isDefault: boolean;
  canSell: boolean;
  canManageInventory: boolean;
  store?: Store;
}

export interface User {
  id: string; // UUID de Supabase Auth
  companyId?: string;
  email: string;
  fullName: string;
  username?: string;
  role: Role;
  isActive: boolean;
  stores?: Store[];
  storeIds?: string[];
  activeStoreId?: string;
}

export interface Product {
  id: string; // UUID
  companyId?: string;
  createdAt?: string;
  updatedAt?: string;
  supplierId?: string;
  supplierName?: string;
  variantId?: string;
  variantCode?: string;
  sku?: string;
  modelId?: string;
  type: 'smartphone' | 'tablet' | 'accessory' | 'part' | 'service' | 'individual' | 'generic';
  name: string;
  description?: string;
  color?: string;
  ram?: string;
  rom?: string;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  buyPrice: number;
  sellPrice: number;
  minSellPrice?: number;
  stockQuantity: number;
  minStockAlert: number;
  status: string;
  location?: string;
  locationBin?: string;
  storeId?: string;
  storeName?: string;
  // Propiedades Virtuales/Mapeadas
  brand?: string;
  model?: string;
  price?: number;
  stock?: number;
  minPrice?: number;
}

export interface ProductVariant {
  id: string;
  companyId: string;
  productId: string;
  variantCode: string;
  attributes?: Record<string, any>;
  active: boolean;
}

export interface Customer {
  id: string; // UUID
  companyId?: string;
  docType: 'DNI' | 'CE' | 'RUC' | 'PASAPORTE';
  docNumber: string;
  dni: string; // Mapped field for UI
  fullName: string;
  email?: string;
  address?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}

export interface Sale {
  id: string;
  companyId?: string;
  warehouseId?: string;
  warehouseName?: string;
  date: string;
  sellerId: string;
  customerId: string;
  total: number;
  storeId?: string;
  storeName?: string;
  documentType?: string;
  documentSeries?: string;
  documentNumber?: number;
  // New fields
  customer?: Customer; // Make it optional for now, will be populated by getSalesData
  items?: Array<{
    name: string;
    quantity: number;
    salePrice: number;
    imei1?: string;
    imei2?: string;
    serialNumber?: string;
    status?: string;
  }>;
  payments?: Array<{
    paymentMethod: PaymentMethod;
    amount: number;
  }>;
  hasUnregisteredProduct?: boolean;
}

export interface SaleDetail {
  saleId: string;
  companyId?: string;
  variantId?: string;
  productId: string;
  quantity: number;
  salePrice: number;
  imei1?: string;
  serialNumber?: string;
}

export type PaymentMethod = string;

export interface PaymentMethodAdmin {
  id: number;
  name: string;
}

export interface PaymentDetail {
  saleId: string;
  companyId?: string;
  paymentMethod: PaymentMethod;
  amount: number;
  isInstallment?: boolean;
  paymentStoreId?: string;
  paymentStoreName?: string;
  saleInvoice?: string;
  customerName?: string;
}

export interface AuditLog {
  id: string;
  companyId?: string;
  occurredAt: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  notes?: string | null;
}

export interface Brand {
  id: string;
  companyId?: string;
  name: string;
}

export interface Model {
  id: string;
  companyId?: string;
  brandId: string; // Relaciona el modelo con una marca
  name: string;
}

export interface InventoryLocation {
  id: string;
  name: string;
  isSalePoint?: boolean;
  isDefault?: boolean;
}

export interface CartItem {
  tempId: number;
  productId: string;
  name: string;
  description?: string; // Added description property
  brand?: string;
  model?: string;
  quantity: number;
  price: number;
  stock: number;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  hasError?: boolean;
}

export interface ReportData {
  totalSales: number;
  salesByProduct: { [key: string]: number };
  salesBySeller: { [key: string]: number };
  salesByPaymentMethod: { [key: string]: number };
}

// Interfaces para el nuevo módulo de pedidos
export interface PurchaseOrderItem {
  variantId?: string;
  productId: string;
  productName: string;
  brand: string;
  model: string;
  currentStock: number;
  minStock: number;
  suggestedOrder: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: string; // Colores, potencias, etc.
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  companyId?: string;
  warehouseId?: string;
  warehouseName?: string;
  date: string;
  status: 'draft' | 'pending' | 'approved' | 'ordered' | 'received' | 'cancelled';
  storeId?: string;
  storeName?: string;
  supplierId?: string;
  supplierName?: string;
  expectedDeliveryDate?: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  createdBy: string; // UUID de usuario
  notes?: string;
}

export interface Supplier {
  id: number;
  companyId?: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  total_debt?: number; // Added for compatibility if used
}

export interface Credit {
  id: string;
  companyId?: string;
  saleId: string;
  customerId: string;
  totalCredit: number;
  balance: number;
  interestRate?: number;
  numberOfInstallments: number;
  periodicity: 'weekly' | 'biweekly' | 'monthly' | 'manual';
  status: 'active' | 'paid' | 'overdue' | 'cancelled';
  startDate: string;
  nextDueDate?: string;
  notes?: string;
  createdAt: string;
  // Virtual
  customerName?: string;
  saleNumber?: string;
}

export interface CreditInstallment {
  id: string;
  companyId?: string;
  creditId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paymentDate?: string;
  notes?: string;
}

export interface ProductLifecycleEvent {
  eventId: string;
  companyId?: string;
  occurredAt: string;
  movementType: string;
  movementLabel: string;
  productId?: string;
  variantId?: string;
  productName?: string;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  serializedSerial?: string;
  qty: number;
  unitCost: number;
  lineAmount: number;
  warehouseId?: string;
  warehouseName?: string;
  storeId?: string;
  storeName?: string;
  refTable?: string;
  refId?: string;
  purchaseReceiptId?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  supplierName?: string;
  saleId?: string;
  customerId?: string;
  customerName?: string;
  saleTotalAmount?: number;
  saleUnitPrice?: number;
  paymentSummary?: string;
  notes?: string;
}

export interface OverdueInstallmentAlert {
  installmentId: string;
  creditId: string;
  customerName: string;
  dueDate: string;
  amountDue: number;
  overdueDays: number;
  saleNumber?: string;
  storeId?: string;
}

export type SerialItemStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'damaged';
export type InventoryMovementType =
  | 'purchase_receipt'
  | 'sale'
  | 'sale_void'
  | 'refund'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment'
  | 'opening_balance';

export interface StockBalance {
  id: string;
  companyId: string;
  warehouseId: string;
  warehouseName?: string;
  variantId: string;
  variantCode?: string;
  onHand: number;
  reserved: number;
  updatedAt?: string;
}

export interface SerializedItem {
  id: string;
  companyId: string;
  variantId: string;
  variantCode?: string;
  warehouseId: string;
  warehouseName?: string;
  serial: string;
  status: SerialItemStatus;
  cost?: number;
  receivedAt?: string;
  soldSaleId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: string;
  companyId: string;
  occurredAt: string;
  movementType: InventoryMovementType;
  warehouseId?: string;
  warehouseName?: string;
  storeId?: string;
  storeName?: string;
  refTable?: string;
  refId?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface InventoryMovementItem {
  id: string;
  companyId: string;
  movementId: string;
  variantId: string;
  variantCode?: string;
  qty: number;
  unitCost?: number;
  serializedItemId?: string;
  serial?: string;
  createdAt?: string;
}

export interface PosShift {
  id: string;
  companyId: string;
  storeId: string;
  storeName?: string;
  openedBy?: string;
  openedAt: string;
  openingCash: number;
  closedBy?: string;
  closedAt?: string;
  closingCash?: number;
  status: 'open' | 'closed';
  createdAt?: string;
  updatedAt?: string;
}

export type AdvanceStatus = 'open' | 'applied' | 'cancelled' | 'refunded';
export type AdvanceKind = 'reserva_stock' | 'pedido_especial' | 'a_cuenta';
export type AdvanceMovementType = 'payment' | 'application' | 'refund' | 'adjustment';

export interface Advance {
  id: string;
  companyId?: string;
  customerId: string;
  customerName?: string;
  sellerId?: string;
  sellerName?: string;
  storeId?: string;
  storeName?: string;
  kind: AdvanceKind;
  targetProductId?: string;
  targetProductName?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  totalAmount: number;
  appliedAmount: number;
  refundedAmount: number;
  balance: number;
  status: AdvanceStatus;
  createdAt: string;
}

export interface AdvanceMovement {
  id: string;
  companyId?: string;
  advanceId: string;
  movementType: AdvanceMovementType;
  amount: number;
  paymentMethod?: string;
  movementStoreId?: string;
  movementStoreName?: string;
  customerName?: string;
  sellerId?: string;
  sellerName?: string;
  referenceNumber?: string;
  notes?: string;
  saleId?: string;
  createdAt: string;
}
