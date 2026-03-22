import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
    User,
    Product,
    Customer,
    Brand,
    Model,
    PaymentMethodAdmin,
    Credit,
    PurchaseOrder,
    InventoryLocation,
    Advance,
    AdvanceMovement,
    AdvanceStatus,
    Store,
    UserStoreAssignment,
    Company,
    Warehouse,
    ProductVariant,
    StockBalance,
    SerializedItem,
    InventoryMovement,
    InventoryMovementItem,
    ProductLifecycleEvent,
    PosShift,
    AuditLog,
    PaymentDetail,
    OverdueInstallmentAlert
} from '../types';
import {
    toNullableSentenceCase,
    toNullableTitleCase,
    toSentenceCase,
    toTitleCase
} from '../utils/textNormalization';

const SUPABASE_URL = 'https://ypeolvspffwxjtqxphzr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ji7xqwRoXGiIv02v-j_Ofg_SYqgBwfu';

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_LOCATION_NAMES = ['Tienda', 'Almacen'];
const LOCATION_TABLE = 'inventory_locations';
const COMPANY_TABLE = 'companies';
const STORE_TABLE = 'stores';
const WAREHOUSE_TABLE = 'warehouses';
const USER_STORE_ASSIGNMENT_TABLE = 'user_store_assignments';
const INVENTORY_BALANCE_TABLE = 'inventory_balances';
const PRODUCT_VARIANT_TABLE = 'product_variants';
const STOCK_BALANCE_TABLE = 'stock_balances';
const SERIALIZED_ITEM_TABLE = 'serialized_items';
const INVENTORY_MOVEMENT_TABLE = 'inventory_movements';
const INVENTORY_MOVEMENT_ITEM_TABLE = 'inventory_movement_items';
const COMPANY_RECEIPT_SETTINGS_TABLE = 'company_receipt_settings';
const POS_SHIFT_TABLE = 'pos_shifts';
const AUDIT_LOG_TABLE = 'audit_log';
const ACTIVE_COMPANY_KEY = 'valni_active_company_id';
const ACTIVE_STORE_KEY = 'valni_active_store_id';
const ACTIVE_WAREHOUSE_KEY = 'valni_active_warehouse_id';
type SalesRpcMode = 'canonical' | 'auto' | 'compat';

const resolveSalesRpcMode = (): SalesRpcMode => {
    const rawMode = String((import.meta as any)?.env?.VITE_SALES_RPC_MODE || 'compat')
        .trim()
        .toLowerCase();
    if (rawMode === 'canonical') return 'canonical';
    if (rawMode === 'auto') return 'auto';
    return 'compat';
};

const SALES_RPC_MODE: SalesRpcMode = resolveSalesRpcMode();

const fallbackLocations = (): InventoryLocation[] =>
    DEFAULT_LOCATION_NAMES.map((name, index) => ({
        id: `fallback-${index + 1}`,
        name,
        isSalePoint: true,
        isDefault: index === 0
    }));

const isMissingTableError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        message.includes('does not exist') ||
        message.includes('could not find the table')
    );
};

const isMissingColumnError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42703' ||
        code === 'PGRST204' ||
        (
            message.includes('column') &&
            (
                message.includes('does not exist') ||
                message.includes('could not find') ||
                message.includes('schema cache')
            )
        ) ||
        (
            message.includes('schema cache') &&
            message.includes('could not find')
        )
    );
};

const isUniqueViolationError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '23505' || message.includes('duplicate key value violates unique constraint');
};

const isPermissionDeniedError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42501' ||
        message.includes('permission denied') ||
        message.includes('insufficient permissions') ||
        message.includes('violates row-level security')
    );
};

const isMissingRelationError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === 'PGRST200' ||
        code === 'PGRST201' ||
        message.includes('could not find a relationship') ||
        message.includes('relationship between')
    );
};

const getSupabaseErrorMessage = (error: any): string => {
    const parts = [
        error?.message,
        error?.details,
        error?.hint
    ]
        .map((value: any) => String(value || '').trim())
        .filter(Boolean);

    if (parts.length > 0) {
        return parts.join(' · ');
    }

    return 'Error desconocido de base de datos.';
};

const normalizeText = (value: string | null | undefined): string =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

const mapPaymentMethodToDb = (method: string): string => {
    const normalized = normalizeText(method);

    const dictionary: Record<string, string> = {
        'efectivo': 'cash',
        'cash': 'cash',
        'tarjeta de credito': 'credit_card',
        'credito tarjeta': 'credit_card',
        'credit card': 'credit_card',
        'credit_card': 'credit_card',
        'tarjeta de debito': 'debit_card',
        'debit card': 'debit_card',
        'debit_card': 'debit_card',
        'transferencia bancaria': 'bank_transfer',
        'transferencia': 'bank_transfer',
        'transfer': 'bank_transfer',
        'bank transfer': 'bank_transfer',
        'bank_transfer': 'bank_transfer',
        'yape': 'yape',
        'plin': 'plin',
        'adelanto': 'advance',
        'advance': 'advance',
        'credito': 'credit_installment',
        'credito cuota': 'credit_installment',
        'credit_installment': 'credit_installment'
    };

    if (dictionary[normalized]) {
        return dictionary[normalized];
    }

    // Heurística para catálogos con nombres personalizados.
    if (normalized.includes('yape')) return 'yape';
    if (normalized.includes('plin')) return 'plin';
    if (normalized.includes('transfer')) return 'bank_transfer';
    if (normalized.includes('debito')) return 'debit_card';
    if (normalized.includes('tarjeta') && normalized.includes('credito')) return 'credit_card';
    if (normalized.includes('credito')) return 'credit_installment';
    if (normalized.includes('adelanto')) return 'advance';
    if (normalized.includes('efectivo')) return 'cash';

    return 'cash';
};

const mapProductTypeFromDb = (type: string | null | undefined): Product['type'] => {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'individual' || normalized === 'generic') {
        return normalized;
    }
    if (normalized === 'smartphone' || normalized === 'tablet') {
        return 'individual';
    }
    return 'generic';
};

const mapProductTypeToDb = (type: string | null | undefined): string => {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'individual' || normalized === 'smartphone' || normalized === 'tablet') {
        return 'smartphone';
    }
    return 'accessory';
};

const isCreditPaymentLabel = (label?: string | null): boolean => {
    const normalized = normalizeText(label);
    return normalized === 'credito' || normalized === 'credit_installment';
};

const toDbPaymentMethodSafe = (label?: string | null): string => {
    const mapped = mapPaymentMethodToDb(String(label || ''));
    // El enum histórico no incluye "advance", por eso se persiste como cash.
    if (mapped === 'advance') return 'cash';
    return mapped;
};

const resolvePaymentLabel = (row: { payment_method: string; payment_method_label?: string | null }): string => {
    const explicit = String(row.payment_method_label || '').trim();
    if (explicit) return explicit;
    return mapPaymentMethodFromDB(String(row.payment_method || 'cash'));
};

const paymentAggregationKey = (row: { payment_method: string; payment_method_label?: string | null }): string => {
    const method = normalizeText(row.payment_method || 'cash') || 'cash';
    const label = normalizeText(resolvePaymentLabel(row)) || method;
    return `${method}::${label}`;
};

const aggregatePaymentsByMethod = (rows: Array<{ payment_method: string; payment_method_label?: string | null; amount: number }>) => {
    const bucket = new Map<string, number>();
    rows.forEach(row => {
        const key = paymentAggregationKey(row);
        bucket.set(key, (bucket.get(key) || 0) + Number(row.amount || 0));
    });
    return bucket;
};

const hasPaymentMismatch = (
    existingRows: Array<{ payment_method: string; payment_method_label?: string | null; amount: number }>,
    expectedRows: Array<{ payment_method: string; payment_method_label?: string | null; amount: number }>
): boolean => {
    const existing = aggregatePaymentsByMethod(existingRows);
    const expected = aggregatePaymentsByMethod(expectedRows);
    const keys = new Set([...existing.keys(), ...expected.keys()]);
    for (const key of keys) {
        const left = Number(existing.get(key) || 0);
        const right = Number(expected.get(key) || 0);
        if (Math.abs(left - right) > 0.01) return true;
    }
    return false;
};

const syncSalePayments = async (
    saleId: string,
    expectedPayments: Array<{ payment_method: string; payment_method_label?: string | null; amount: number }>,
    storeId?: string | null,
    companyId?: string | null
): Promise<void> => {
    if (!saleId || expectedPayments.length === 0) return;

    let existingData: any[] | null = null;
    let existingError: any = null;
    ({ data: existingData, error: existingError } = await supabase
        .from('sale_payments')
        .select('id, payment_method, payment_method_label, amount, credit_installment_id')
        .eq('sale_id', saleId));

    if (existingError && isMissingColumnError(existingError, 'payment_method_label')) {
        ({ data: existingData, error: existingError } = await supabase
            .from('sale_payments')
            .select('id, payment_method, amount, credit_installment_id')
            .eq('sale_id', saleId));
    }

    if (existingError) throw existingError;

    const baseRows = (existingData || []).filter((row: any) => !row.credit_installment_id);
    const current = baseRows.map((row: any) => ({
        payment_method: String(row.payment_method || 'cash'),
        payment_method_label: row.payment_method_label || null,
        amount: Number(row.amount || 0)
    }));

    if (!hasPaymentMismatch(current, expectedPayments)) {
        return;
    }

    const baseIds = baseRows.map((row: any) => row.id).filter(Boolean);
    if (baseIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('sale_payments')
            .delete()
            .in('id', baseIds);
        if (deleteError) throw deleteError;
    }

    let includeCompany = !!companyId;
    let includeStore = !!storeId;
    let includeMethodLabel = true;

    const insertRows = () => expectedPayments.map(payment => {
        const row: Record<string, any> = {
            sale_id: saleId,
            payment_method: payment.payment_method,
            amount: Number(payment.amount || 0)
        };
        if (includeCompany && companyId) row.company_id = companyId;
        if (includeStore && storeId) row.payment_store_id = storeId;
        if (includeMethodLabel && payment.payment_method_label) row.payment_method_label = String(payment.payment_method_label);
        return row;
    });

    let { error: insertError } = await supabase
        .from('sale_payments')
        .insert(insertRows());

    if (insertError && isMissingColumnError(insertError, 'company_id')) {
        includeCompany = false;
        ({ error: insertError } = await supabase
            .from('sale_payments')
            .insert(insertRows()));
    }

    if (insertError && isMissingColumnError(insertError, 'payment_store_id')) {
        includeStore = false;
        ({ error: insertError } = await supabase
            .from('sale_payments')
            .insert(insertRows()));
    }

    if (insertError && isMissingColumnError(insertError, 'payment_method_label')) {
        includeMethodLabel = false;
        ({ error: insertError } = await supabase
            .from('sale_payments')
            .insert(insertRows()));
    }

    if (insertError) throw insertError;
};

const isNoOpenShiftError = (error: any): boolean => {
    const content = getSupabaseErrorMessage(error).toLowerCase();
    return content.includes('no open shift found for store');
};

const isMissingRpcCreateSaleError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = getSupabaseErrorMessage(error).toLowerCase();
    return (
        code === 'PGRST202' &&
        message.includes('rpc_create_sale') &&
        message.includes('does not exist')
    );
};

const isMissingProcessSaleAtomicError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = getSupabaseErrorMessage(error).toLowerCase();
    return (
        code === 'PGRST202' &&
        message.includes('process_sale_atomic') &&
        message.includes('does not exist')
    );
};

const fallbackStores = (): Store[] => {
    const baseCodes = ['TIENDA_01', 'ALMACEN_CENTRAL'];
    return DEFAULT_LOCATION_NAMES.map((name, index) => ({
        id: `fallback-store-${index + 1}`,
        code: baseCodes[index] || `TIENDA_${String(index + 1).padStart(2, '0')}`,
        name,
        type: name.toLowerCase().includes('almacen') ? 'warehouse' : 'store',
        isActive: true,
        isDefault: index === 0
    }));
};

const mapStoreRow = (row: any): Store => {
    const name = String(row?.name || 'Tienda');
    return {
        id: row.id,
        companyId: row.company_id || undefined,
        code: row.code || name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'TIENDA',
        name,
        type: row.type === 'warehouse' ? 'warehouse' : 'store',
        isActive: row.is_active ?? true,
        isDefault: row.is_default ?? false
    };
};

const normalizeName = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

const inferLegacyLocationForStore = (storeName: string | null | undefined): string | null => {
    const normalized = normalizeName(storeName);
    if (!normalized) return null;
    return normalized.includes('almacen')
        ? normalizeName(DEFAULT_LOCATION_NAMES[1])
        : normalizeName(DEFAULT_LOCATION_NAMES[0]);
};

const toStoreCode = (name: string): string => {
    const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const base = normalized || 'TIENDA';
    return base.slice(0, 20);
};

const getLegacyLocationRows = async (): Promise<any[]> => {
    const { data, error } = await supabase
        .from(LOCATION_TABLE)
        .select('id, name, is_sale_point, is_default')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }

    return data || [];
};

const mapLegacyLocationToStore = (row: any, index: number): Store => ({
    id: row.id,
    companyId: undefined,
    code: String(row?.name || `TIENDA_${index + 1}`)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20) || `TIENDA_${String(index + 1).padStart(2, '0')}`,
    name: row.name,
    type: row.is_sale_point === false ? 'warehouse' : 'store',
    isActive: true,
    isDefault: row.is_default ?? index === 0
});

const mapCompanyRow = (row: any): Company => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined
});

const mapWarehouseRow = (row: any): Warehouse => ({
    id: row.id,
    companyId: row.company_id,
    storeId: row.store_id || null,
    storeName: row.stores?.name || undefined,
    code: row.code,
    name: row.name,
    type: row.type || 'main',
    active: row.active ?? true
});

const mapVariantRow = (row: any): ProductVariant => ({
    id: row.id,
    companyId: row.company_id,
    productId: row.product_id,
    variantCode: row.variant_code,
    attributes: row.attributes || {},
    active: row.active ?? true
});

const mapStockBalanceRow = (row: any): StockBalance => ({
    id: row.id,
    companyId: row.company_id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouses?.name || undefined,
    variantId: row.variant_id,
    variantCode: row.product_variants?.variant_code || undefined,
    onHand: Number(row.on_hand || 0),
    reserved: Number(row.reserved || 0),
    updatedAt: row.updated_at || undefined
});

const mapSerializedItemRow = (row: any): SerializedItem => ({
    id: row.id,
    companyId: row.company_id,
    variantId: row.variant_id,
    variantCode: row.product_variants?.variant_code || undefined,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouses?.name || undefined,
    serial: row.serial,
    status: row.status,
    cost: Number(row.cost || 0),
    receivedAt: row.received_at || undefined,
    soldSaleId: row.sold_sale_id || undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined
});

const mapInventoryMovementRow = (row: any): InventoryMovement => ({
    id: row.id,
    companyId: row.company_id,
    occurredAt: row.occurred_at,
    movementType: row.movement_type,
    warehouseId: row.warehouse_id || undefined,
    warehouseName: row.warehouses?.name || undefined,
    storeId: row.store_id || undefined,
    storeName: row.stores?.name || undefined,
    refTable: row.ref_table || undefined,
    refId: row.ref_id || undefined,
    notes: row.notes || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || undefined
});

const mapInventoryMovementItemRow = (row: any): InventoryMovementItem => ({
    id: row.id,
    companyId: row.company_id,
    movementId: row.movement_id,
    variantId: row.variant_id,
    variantCode: row.product_variants?.variant_code || undefined,
    qty: Number(row.qty || 0),
    unitCost: Number(row.unit_cost || 0),
    serializedItemId: row.serialized_item_id || undefined,
    serial: row.serialized_items?.serial || undefined,
    createdAt: row.created_at || undefined
});

const mapProductLifecycleEventRow = (row: any): ProductLifecycleEvent => ({
    eventId: row.event_id || row.id,
    companyId: row.company_id || undefined,
    occurredAt: row.occurred_at,
    movementType: row.movement_type,
    movementLabel: row.movement_label || row.movement_type || 'Movimiento',
    productId: row.product_id || undefined,
    variantId: row.variant_id || undefined,
    productName: row.product_name || undefined,
    imei1: row.imei_1 || undefined,
    imei2: row.imei_2 || undefined,
    serialNumber: row.serial_number || undefined,
    serializedSerial: row.serialized_serial || undefined,
    qty: Number(row.qty || 0),
    unitCost: Number(row.unit_cost || 0),
    lineAmount: Number(row.line_amount || 0),
    warehouseId: row.warehouse_id || undefined,
    warehouseName: row.warehouse_name || undefined,
    storeId: row.store_id || undefined,
    storeName: row.store_name || undefined,
    refTable: row.ref_table || undefined,
    refId: row.ref_id || undefined,
    purchaseReceiptId: row.purchase_receipt_id || undefined,
    purchaseOrderId: row.purchase_order_id || undefined,
    supplierId: row.supplier_id || undefined,
    supplierName: row.supplier_name || undefined,
    saleId: row.sale_id || undefined,
    customerId: row.customer_id || undefined,
    customerName: row.customer_name || undefined,
    saleTotalAmount: row.sale_total_amount === null || row.sale_total_amount === undefined ? undefined : Number(row.sale_total_amount),
    saleUnitPrice: row.sale_unit_price === null || row.sale_unit_price === undefined ? undefined : Number(row.sale_unit_price),
    paymentSummary: row.payment_summary || undefined,
    notes: row.notes || undefined
});

const mapPosShiftRow = (row: any): PosShift => ({
    id: row.id,
    companyId: row.company_id,
    storeId: row.store_id,
    storeName: row.stores?.name || undefined,
    openedBy: row.opened_by || undefined,
    openedAt: row.opened_at,
    openingCash: Number(row.opening_cash || 0),
    closedBy: row.closed_by || undefined,
    closedAt: row.closed_at || undefined,
    closingCash: row.closing_cash === null || row.closing_cash === undefined ? undefined : Number(row.closing_cash),
    status: row.status || 'open',
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined
});

const mapAuditLogRow = (row: any): AuditLog => ({
    id: row.id,
    companyId: row.company_id || undefined,
    occurredAt: row.occurred_at,
    userId: row.user_id || undefined,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id || undefined,
    before: row.before || null,
    after: row.after || null,
    notes: row.notes || null
});

const reconcileStoresWithLegacyLocations = (stores: Store[], locationRows: any[]): Store[] => {
    if (stores.length === 0 || locationRows.length === 0) return stores;

    const locationByName = new Map<string, any>();
    locationRows.forEach(row => {
        locationByName.set(normalizeName(row.name), row);
    });

    return stores
        .map((store, index) => {
            const location = locationByName.get(normalizeName(store.name));
            if (!location) return store;
            return {
                ...store,
                type: location.is_sale_point === false ? 'warehouse' : 'store',
                isDefault: location.is_default ?? (store.isDefault || index === 0)
            };
        })
        .sort((a, b) => {
            if (a.isDefault === b.isDefault) return a.name.localeCompare(b.name);
            return a.isDefault ? -1 : 1;
        });
};

const readStoredActiveStoreId = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(ACTIVE_STORE_KEY);
    } catch {
        return null;
    }
};

const readStoredActiveCompanyId = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(ACTIVE_COMPANY_KEY);
    } catch {
        return null;
    }
};

const readStoredActiveWarehouseId = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage.getItem(ACTIVE_WAREHOUSE_KEY);
    } catch {
        return null;
    }
};

const persistActiveStoreId = (storeId: string | null): void => {
    if (typeof window === 'undefined') return;
    try {
        if (storeId) {
            window.localStorage.setItem(ACTIVE_STORE_KEY, storeId);
        } else {
            window.localStorage.removeItem(ACTIVE_STORE_KEY);
        }
    } catch {
        // no-op
    }
};

const persistActiveCompanyId = (companyId: string | null): void => {
    if (typeof window === 'undefined') return;
    try {
        if (companyId) {
            window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
        } else {
            window.localStorage.removeItem(ACTIVE_COMPANY_KEY);
        }
    } catch {
        // no-op
    }
};

const persistActiveWarehouseId = (warehouseId: string | null): void => {
    if (typeof window === 'undefined') return;
    try {
        if (warehouseId) {
            window.localStorage.setItem(ACTIVE_WAREHOUSE_KEY, warehouseId);
        } else {
            window.localStorage.removeItem(ACTIVE_WAREHOUSE_KEY);
        }
    } catch {
        // no-op
    }
};

const mapUserStoreAssignmentRow = (row: any): UserStoreAssignment => ({
    id: row.id,
    companyId: row.company_id || undefined,
    userId: row.user_id,
    storeId: row.store_id,
    isDefault: row.is_default ?? false,
    canSell: row.can_sell ?? true,
    canManageInventory: row.can_manage_inventory ?? false,
    store: row.store ? mapStoreRow(row.store) : undefined
});

const getDefaultStoreIdFromAssignments = (assignments: UserStoreAssignment[]): string | null => {
    if (assignments.length === 0) return null;
    const explicitDefault = assignments.find(a => a.isDefault)?.storeId;
    if (explicitDefault) return explicitDefault;
    return assignments[0].storeId;
};

export const getActiveStoreId = (): string | null => readStoredActiveStoreId();
export const getActiveCompanyId = (): string | null => readStoredActiveCompanyId();
export const getActiveWarehouseId = (): string | null => readStoredActiveWarehouseId();

export const setActiveStoreId = (storeId: string | null): void => {
    persistActiveStoreId(storeId || null);
};

export const setActiveCompanyId = (companyId: string | null): void => {
    persistActiveCompanyId(companyId || null);
};

export const setActiveWarehouseId = (warehouseId: string | null): void => {
    persistActiveWarehouseId(warehouseId || null);
};

export const getCompanies = async (): Promise<Company[]> => {
    const { data, error } = await supabase
        .from(COMPANY_TABLE)
        .select('id, name, created_at, updated_at')
        .order('name', { ascending: true });

    if (error) {
        if (isMissingTableError(error)) {
            return [{ id: 'fallback-company', name: 'VALNI', createdAt: undefined, updatedAt: undefined }];
        }
        throw error;
    }

    const companies = (data || []).map(mapCompanyRow);
    if (companies.length === 0) {
        return [{ id: 'fallback-company', name: 'VALNI', createdAt: undefined, updatedAt: undefined }];
    }
    return companies;
};

export const getStores = async (): Promise<Store[]> => {
    const activeCompanyId = readStoredActiveCompanyId();
    let query = supabase
        .from(STORE_TABLE)
        .select('id, code, name, type, company_id')
        .order('name', { ascending: true });

    if (activeCompanyId) {
        query = query.eq('company_id', activeCompanyId);
    }

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) {
            try {
                const legacyLocations = await getLegacyLocationRows();
                if (legacyLocations.length > 0) {
                    return legacyLocations.map(mapLegacyLocationToStore);
                }
            } catch {
                // fallback below
            }
            return fallbackStores();
        }
        throw error;
    }

    const rows = (data || []).map((row: any, index: number) =>
        mapStoreRow({
            ...row,
            is_active: true,
            is_default: index === 0
        })
    );

    if (rows.length === 0) return fallbackStores();

    try {
        const legacyLocations = await getLegacyLocationRows();
        const reconciled = reconcileStoresWithLegacyLocations(rows, legacyLocations);
        if (reconciled.length > 0) return reconciled;
    } catch {
        // if legacy table is unavailable, keep store list
    }

    return rows;
};

export const getWarehouses = async (options?: {
    companyId?: string | null;
    storeId?: string | null;
    activeOnly?: boolean;
}): Promise<Warehouse[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    let query = supabase
        .from(WAREHOUSE_TABLE)
        .select('id, company_id, store_id, code, name, type, active, stores(name)')
        .order('name', { ascending: true });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (options?.storeId) query = query.eq('store_id', options.storeId);
    if (options?.activeOnly !== false) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) {
            const stores = await getStores();
            return stores.map((store) => ({
                id: `fallback-wh-${store.id}`,
                companyId: scopedCompanyId || store.companyId || 'fallback-company',
                storeId: store.id,
                storeName: store.name,
                code: `WH_${store.code}`,
                name: `Almacen ${store.name}`,
                type: store.type === 'warehouse' ? 'main' : 'store_floor',
                active: true
            }));
        }
        throw error;
    }

    return (data || []).map(mapWarehouseRow);
};

export const getProductVariants = async (options?: {
    companyId?: string | null;
    productId?: string | null;
    activeOnly?: boolean;
}): Promise<ProductVariant[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    let query = supabase
        .from(PRODUCT_VARIANT_TABLE)
        .select('id, company_id, product_id, variant_code, attributes, active')
        .order('variant_code', { ascending: true });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (options?.productId) query = query.eq('product_id', options.productId);
    if (options?.activeOnly !== false) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) {
            return [];
        }
        throw error;
    }

    return (data || []).map(mapVariantRow);
};

export const getStockBalances = async (options?: {
    companyId?: string | null;
    warehouseId?: string | null;
    variantId?: string | null;
}): Promise<StockBalance[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    const scopedWarehouseId = options?.warehouseId ?? getActiveWarehouseId();
    let query = supabase
        .from(STOCK_BALANCE_TABLE)
        .select('id, company_id, warehouse_id, variant_id, on_hand, reserved, updated_at, warehouses(name), product_variants(variant_code)')
        .order('updated_at', { ascending: false });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (scopedWarehouseId) query = query.eq('warehouse_id', scopedWarehouseId);
    if (options?.variantId) query = query.eq('variant_id', options.variantId);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapStockBalanceRow);
};

export const getSerializedItems = async (options?: {
    companyId?: string | null;
    warehouseId?: string | null;
    status?: string | null;
    serialSearch?: string;
    limit?: number;
}): Promise<SerializedItem[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    const scopedWarehouseId = options?.warehouseId ?? getActiveWarehouseId();
    let query = supabase
        .from(SERIALIZED_ITEM_TABLE)
        .select('id, company_id, variant_id, warehouse_id, serial, status, cost, received_at, sold_sale_id, created_at, updated_at, warehouses(name), product_variants(variant_code)')
        .order('updated_at', { ascending: false });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (scopedWarehouseId) query = query.eq('warehouse_id', scopedWarehouseId);
    if (options?.status) query = query.eq('status', options.status);
    if (options?.serialSearch) query = query.ilike('serial', `%${options.serialSearch}%`);
    if (options?.limit && options.limit > 0) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapSerializedItemRow);
};

export const getInventoryMovements = async (options?: {
    companyId?: string | null;
    warehouseId?: string | null;
    storeId?: string | null;
    movementType?: string | null;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}): Promise<InventoryMovement[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    const scopedWarehouseId = options?.warehouseId ?? getActiveWarehouseId();
    let query = supabase
        .from(INVENTORY_MOVEMENT_TABLE)
        .select('id, company_id, occurred_at, movement_type, warehouse_id, store_id, ref_table, ref_id, notes, created_by, created_at, warehouses(name), stores(name)')
        .order('occurred_at', { ascending: false });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (scopedWarehouseId) query = query.eq('warehouse_id', scopedWarehouseId);
    if (options?.storeId) query = query.eq('store_id', options.storeId);
    if (options?.movementType) query = query.eq('movement_type', options.movementType);
    if (options?.dateFrom) query = query.gte('occurred_at', options.dateFrom);
    if (options?.dateTo) query = query.lte('occurred_at', options.dateTo);
    if (options?.limit && options.limit > 0) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapInventoryMovementRow);
};

export const getInventoryMovementItems = async (movementId: string): Promise<InventoryMovementItem[]> => {
    if (!movementId) return [];
    const { data, error } = await supabase
        .from(INVENTORY_MOVEMENT_ITEM_TABLE)
        .select('id, company_id, movement_id, variant_id, qty, unit_cost, serialized_item_id, created_at, product_variants(variant_code), serialized_items(serial)')
        .eq('movement_id', movementId)
        .order('created_at', { ascending: true });

    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapInventoryMovementItemRow);
};

export const getProductLifecycleEvents = async (options?: {
    query?: string;
    companyId?: string | null;
    storeId?: string | null;
    consolidated?: boolean;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}): Promise<ProductLifecycleEvent[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? null);
    const limit = options?.limit && options.limit > 0 ? options.limit : 300;

    let query = supabase
        .from('view_product_lifecycle_events')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(limit);

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (scopedStoreId) query = query.eq('store_id', scopedStoreId);
    if (options?.dateFrom) query = query.gte('occurred_at', options.dateFrom);
    if (options?.dateTo) query = query.lte('occurred_at', options.dateTo);

    const rawSearch = String(options?.query || '').trim().toLowerCase();
    if (rawSearch) {
        const safeSearch = rawSearch.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
        if (safeSearch) {
            query = query.or([
                `search_blob.ilike.%${safeSearch}%`,
                `product_name.ilike.%${safeSearch}%`,
                `imei_1.ilike.%${safeSearch}%`,
                `imei_2.ilike.%${safeSearch}%`,
                `serial_number.ilike.%${safeSearch}%`,
                `serialized_serial.ilike.%${safeSearch}%`,
                `supplier_name.ilike.%${safeSearch}%`,
                `customer_name.ilike.%${safeSearch}%`
            ].join(','));
        }
    }

    const { data, error } = await query;

    if (error) {
        const message = getSupabaseErrorMessage(error).toLowerCase();
        const missingView =
            isMissingTableError(error) ||
            (String(error?.code || '') === 'PGRST200') ||
            message.includes('view_product_lifecycle_events');
        if (missingView) {
            throw new Error('No existe la vista SQL "view_product_lifecycle_events". Ejecuta la migración 2026-03-01_product_lifecycle_view.sql.');
        }
        throw error;
    }

    const movementEvents = (data || []).map(mapProductLifecycleEventRow);
    const creationEvents: ProductLifecycleEvent[] = [];

    // Agrega evento de creación/ingreso del producto para completar la trazabilidad.
    let scopedStoreName: string | null = null;
    if (scopedStoreId) {
        const { data: storeData } = await supabase
            .from(STORE_TABLE)
            .select('name')
            .eq('id', scopedStoreId)
            .maybeSingle();
        scopedStoreName = String(storeData?.name || '').trim() || null;
    }

    let creationQuery = supabase
        .from('products')
        .select('id, company_id, name, imei_1, imei_2, serial_number, buy_price, stock_quantity, created_at, location_bin, supplier_id')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (scopedCompanyId) creationQuery = creationQuery.eq('company_id', scopedCompanyId);
    if (options?.dateFrom) creationQuery = creationQuery.gte('created_at', options.dateFrom);
    if (options?.dateTo) creationQuery = creationQuery.lte('created_at', options.dateTo);
    if (scopedStoreName) creationQuery = creationQuery.ilike('location_bin', scopedStoreName);

    if (rawSearch) {
        const safeSearch = rawSearch.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
        if (safeSearch) {
            creationQuery = creationQuery.or([
                `name.ilike.%${safeSearch}%`,
                `imei_1.ilike.%${safeSearch}%`,
                `imei_2.ilike.%${safeSearch}%`,
                `serial_number.ilike.%${safeSearch}%`,
                `location_bin.ilike.%${safeSearch}%`
            ].join(','));
        }
    }

    const { data: creationRows, error: creationError } = await creationQuery;
    if (creationError && !isMissingTableError(creationError) && !isMissingColumnError(creationError)) {
        throw creationError;
    }

    const supplierNameById = new Map<string, string>();
    const supplierIds = [...new Set((creationRows || [])
        .map((row: any) => String(row?.supplier_id || '').trim())
        .filter(Boolean))];

    if (supplierIds.length > 0) {
        const { data: supplierRows, error: supplierError } = await supabase
            .from('suppliers')
            .select('id, name')
            .in('id', supplierIds);
        if (supplierError && !isMissingTableError(supplierError) && !isMissingColumnError(supplierError)) {
            throw supplierError;
        }
        (supplierRows || []).forEach((supplier: any) => {
            if (!supplier?.id) return;
            supplierNameById.set(String(supplier.id), String(supplier.name || '').trim());
        });
    }

    (creationRows || []).forEach((row: any) => {
        const supplierId = String(row.supplier_id || '').trim() || undefined;
        creationEvents.push({
            eventId: `product-created-${row.id}`,
            companyId: row.company_id || undefined,
            occurredAt: row.created_at,
            movementType: 'product_created',
            movementLabel: 'Creación de producto',
            productId: row.id,
            productName: row.name || undefined,
            imei1: row.imei_1 || undefined,
            imei2: row.imei_2 || undefined,
            serialNumber: row.serial_number || undefined,
            qty: Number(row.stock_quantity || 0),
            unitCost: Number(row.buy_price || 0),
            lineAmount: Number(row.stock_quantity || 0) * Number(row.buy_price || 0),
            supplierId,
            supplierName: supplierId ? supplierNameById.get(supplierId) || undefined : undefined,
            notes: row.location_bin ? `Ubicación inicial: ${row.location_bin}` : undefined
        });
    });

    return [...movementEvents, ...creationEvents]
        .sort((a, b) => {
            const aTs = new Date(a.occurredAt || 0).getTime();
            const bTs = new Date(b.occurredAt || 0).getTime();
            return bTs - aTs;
        })
        .slice(0, limit);
};

export const getPosShifts = async (options?: {
    companyId?: string | null;
    storeId?: string | null;
    status?: 'open' | 'closed' | null;
    limit?: number;
}): Promise<PosShift[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    let query = supabase
        .from(POS_SHIFT_TABLE)
        .select('id, company_id, store_id, opened_by, opened_at, opening_cash, closed_by, closed_at, closing_cash, status, created_at, updated_at, stores(name)')
        .order('opened_at', { ascending: false });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (options?.storeId) query = query.eq('store_id', options.storeId);
    if (options?.status) query = query.eq('status', options.status);
    if (options?.limit && options.limit > 0) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapPosShiftRow);
};

const resolveCompanyIdForStore = async (storeId: string): Promise<string | null> => {
    const activeCompanyId = getActiveCompanyId();
    if (activeCompanyId) return activeCompanyId;

    const { data, error } = await supabase
        .from(STORE_TABLE)
        .select('company_id')
        .eq('id', storeId)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error) || isMissingColumnError(error)) return null;
        throw error;
    }

    return data?.company_id || null;
};

const ensureOpenPosShiftForStore = async (storeId: string, sellerId?: string | null): Promise<void> => {
    if (!storeId) return;

    const { data: currentOpenShift, error: openShiftError } = await supabase
        .from(POS_SHIFT_TABLE)
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

    if (openShiftError) {
        if (isMissingTableError(openShiftError)) return;
        throw openShiftError;
    }

    if (currentOpenShift?.id) return;

    const companyId = await resolveCompanyIdForStore(storeId);
    if (!companyId) {
        throw new Error('No se pudo determinar la empresa para abrir el turno POS.');
    }

    const openedBy = sellerId && sellerId.startsWith('00000000') ? null : (sellerId || null);

    const { error: createShiftError } = await supabase
        .from(POS_SHIFT_TABLE)
        .insert([{
            company_id: companyId,
            store_id: storeId,
            opened_by: openedBy,
            opening_cash: 0,
            status: 'open'
        }]);

    if (createShiftError && !isMissingTableError(createShiftError)) {
        throw createShiftError;
    }
};

export const getAuditLogs = async (options?: {
    companyId?: string | null;
    entity?: string | null;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}): Promise<AuditLog[]> => {
    const scopedCompanyId = options?.companyId ?? getActiveCompanyId();
    let query = supabase
        .from(AUDIT_LOG_TABLE)
        .select('id, company_id, occurred_at, user_id, action, entity, entity_id, before, after, notes')
        .order('occurred_at', { ascending: false });

    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (options?.entity) query = query.eq('entity', options.entity);
    if (options?.dateFrom) query = query.gte('occurred_at', options.dateFrom);
    if (options?.dateTo) query = query.lte('occurred_at', options.dateTo);
    if (options?.limit && options.limit > 0) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
    return (data || []).map(mapAuditLogRow);
};

export const getCurrentUserStoreAssignments = async (): Promise<UserStoreAssignment[]> => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) return [];
    return getUserStoreAssignments(authData.user.id);
};

export const getUserStoreAssignments = async (userId: string): Promise<UserStoreAssignment[]> => {
    const { data, error } = await supabase
        .from(USER_STORE_ASSIGNMENT_TABLE)
        .select(`
            id,
            user_id,
            store_id,
            is_default,
            can_sell,
            can_manage_inventory,
            store:stores (id, code, name, type, is_active, is_default)
        `)
        .eq('user_id', userId)
        .order('is_default', { ascending: false });

    if (error) {
        if (isMissingTableError(error)) {
            const stores = await getStores();
            return stores.map((store, index) => ({
                id: `fallback-assign-${userId}-${store.id}`,
                userId,
                storeId: store.id,
                isDefault: store.isDefault || index === 0,
                canSell: true,
                canManageInventory: true,
                store
            }));
        }
        throw error;
    }

    const assignments = (data || []).map(mapUserStoreAssignmentRow);
    const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    const profileRole = String(profileData?.role || '').toLowerCase();
    const canSeeAllStores = profileRole === 'admin' || profileRole === 'supervisor' || profileRole === 'store_admin';
    const visibleStores = await getStores();
    const visibleStoreMap = new Map(visibleStores.map(store => [store.id, store]));

    const directAssignments = assignments
        .filter(assignment => visibleStoreMap.has(assignment.storeId))
        .map(assignment => ({
            ...assignment,
            store: visibleStoreMap.get(assignment.storeId) || assignment.store
        }));

    if (canSeeAllStores && visibleStores.length > 0) {
        const assignmentMap = new Map(directAssignments.map(assignment => [assignment.storeId, assignment]));
        return visibleStores
            .map((store, index) => {
                const current = assignmentMap.get(store.id);
                if (current) {
                    return {
                        ...current,
                        isDefault: current.isDefault || store.isDefault || index === 0,
                        canSell: current.canSell ?? true,
                        canManageInventory: current.canManageInventory ?? true,
                        store
                    };
                }
                return {
                    id: `auto-assign-${userId}-${store.id}`,
                    userId,
                    storeId: store.id,
                    isDefault: store.isDefault || index === 0,
                    canSell: true,
                    canManageInventory: true,
                    store
                };
            })
            .sort((a, b) => {
                if (a.isDefault === b.isDefault) return (a.store?.name || '').localeCompare(b.store?.name || '');
                return a.isDefault ? -1 : 1;
            });
    }

    if (directAssignments.length > 0) {
        return directAssignments.sort((a, b) => {
            if (a.isDefault === b.isDefault) return (a.store?.name || '').localeCompare(b.store?.name || '');
            return a.isDefault ? -1 : 1;
        });
    }

    const byNameAssignments = assignments
        .map((assignment, index) => {
            const assignmentName = normalizeName(assignment.store?.name);
            if (!assignmentName) return null;
            const matchedStore = visibleStores.find(store => normalizeName(store.name) === assignmentName);
            if (!matchedStore) return null;
            return {
                ...assignment,
                id: assignment.id || `remap-assign-${userId}-${matchedStore.id}-${index}`,
                storeId: matchedStore.id,
                store: matchedStore
            };
        })
        .filter((assignment): assignment is UserStoreAssignment => !!assignment);

    if (byNameAssignments.length > 0) {
        return byNameAssignments.sort((a, b) => {
            if (a.isDefault === b.isDefault) return (a.store?.name || '').localeCompare(b.store?.name || '');
            return a.isDefault ? -1 : 1;
        });
    }

    if (visibleStores.length > 0) {
        return visibleStores.map((store, index) => ({
            id: `default-assign-${userId}-${store.id}`,
            userId,
            storeId: store.id,
            isDefault: store.isDefault || index === 0,
            canSell: true,
            canManageInventory: true,
            store
        }));
    }

    return [];
};

const resolveActiveStoreIdForUser = (userStoreAssignments: UserStoreAssignment[]): string | null => {
    const candidate = readStoredActiveStoreId();
    if (candidate && userStoreAssignments.some(a => a.storeId === candidate)) {
        return candidate;
    }
    return getDefaultStoreIdFromAssignments(userStoreAssignments);
};

const resolveActiveCompanyIdForUser = (profileCompanyId: string | null | undefined, stores: Store[]): string | null => {
    const candidate = readStoredActiveCompanyId();
    if (candidate && stores.some(store => store.companyId === candidate)) {
        return candidate;
    }
    if (profileCompanyId) return profileCompanyId;
    const firstStoreCompanyId = stores.find(store => !!store.companyId)?.companyId;
    if (firstStoreCompanyId) return firstStoreCompanyId;
    return null;
};

const resolveStoreIdByName = async (name?: string | null): Promise<string | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const stores = await getStores();
    const match = stores.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
    return match?.id || null;
};

const upsertInventoryBalance = async (productId: string, storeId: string | null, onHand: number): Promise<void> => {
    if (!productId || !storeId) return;
    const resolvedCompanyId = getActiveCompanyId() || await resolveCompanyIdForStore(storeId);

    const payload: Record<string, any> = {
        product_id: productId,
        store_id: storeId,
        on_hand: Math.max(0, Number(onHand || 0)),
        company_id: resolvedCompanyId || null
    };

    let { error } = await supabase
        .from(INVENTORY_BALANCE_TABLE)
        .upsert(payload, { onConflict: 'product_id,store_id' });

    if (error && isMissingColumnError(error, 'company_id')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.company_id;
        ({ error } = await supabase
            .from(INVENTORY_BALANCE_TABLE)
            .upsert(fallbackPayload, { onConflict: 'product_id,store_id' }));
    }

    if (error && !isMissingTableError(error)) {
        throw error;
    }
};

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

    const assignments = await getUserStoreAssignments(profile.id);
    const stores = assignments
        .map(assignment => assignment.store)
        .filter((store): store is Store => !!store);
    const activeStoreId = resolveActiveStoreIdForUser(assignments);
    const activeCompanyId = resolveActiveCompanyIdForUser(profile.company_id, stores);
    persistActiveStoreId(activeStoreId);
    persistActiveCompanyId(activeCompanyId);

    return {
        id: profile.id,
        companyId: activeCompanyId || undefined,
        email: profile.email,
        fullName: profile.full_name,
        username: profile.username,
        role: profile.role,
        isActive: profile.is_active,
        stores,
        storeIds: assignments.map(assignment => assignment.storeId),
        activeStoreId: activeStoreId || undefined
    };
};

const getSessionAccessToken = async (): Promise<string | null> => {
    let { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData?.session || null;

    const expiresAt = session?.expires_at ? Number(session.expires_at) * 1000 : 0;
    const isExpiredOrNearExpiry = !!expiresAt && expiresAt <= (Date.now() + 30_000);
    if (!session || isExpiredOrNearExpiry) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed?.session || session;
    }

    return session?.access_token || null;
};

const invokeEdgeFunctionJson = async (functionName: string, accessToken: string, body: Record<string, any>) => {
    const endpoint = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });

    let payload: any = null;
    let textPayload = '';
    try {
        payload = await response.json();
    } catch {
        try {
            textPayload = await response.text();
        } catch {
            textPayload = '';
        }
    }

    if (!response.ok) {
        const message =
            String(payload?.error || payload?.message || '').trim() ||
            String(textPayload || '').trim() ||
            `Edge Function ${functionName} falló con status ${response.status}.`;
        return { ok: false, status: response.status, message };
    }

    return { ok: true, status: response.status, data: payload };
};

const invokeAdminPasswordReset = async (userId: string, password: string): Promise<void> => {
    const accessToken = await getSessionAccessToken();
    if (!accessToken) {
        throw new Error('No hay sesión activa para restablecer contraseñas de otros usuarios.');
    }

    const response = await invokeEdgeFunctionJson('admin-reset-user-password', accessToken, {
        userId,
        password
    });

    if (response.ok) return;

    const detailedMessage = response.message || 'Error desconocido al restablecer contraseña.';
    const status = response.status;
    const rawMessage = detailedMessage.toLowerCase();
    if (status === 404 || rawMessage.includes('not found') || rawMessage.includes('does not exist')) {
        throw new Error('La función Edge admin-reset-user-password no está desplegada.');
    }
    if (status === 401 || status === 403 || rawMessage.includes('unauthorized') || rawMessage.includes('forbidden')) {
        throw new Error('No autorizado para restablecer contraseñas. Revisa los permisos de la función Edge.');
    }

    throw new Error(detailedMessage || 'No se pudo restablecer la contraseña del usuario.');
};




export const saveUser = async (userData: any): Promise<User> => {
    const payload = {
        email: userData.email,
        password: userData.password,
        fullName: toTitleCase(userData.fullName),
        role: userData.role || 'seller',
        companyId: userData.companyId || getActiveCompanyId() || null,
        storeId: userData.storeId || getActiveStoreId() || null
    };

    if (!payload.email || !payload.password || !payload.fullName) {
        throw new Error('Email, contraseña y nombre completo son obligatorios.');
    }

    const accessToken = await getSessionAccessToken();
    if (!accessToken) {
        throw new Error('No hay sesión activa para crear usuarios mediante la función create-user.');
    }

    const mapCreateUserError = (error: any): string => {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('already registered') || message.includes('user already registered')) {
            return 'Ese correo ya está registrado.';
        }
        if (message.includes('password')) {
            return 'La contraseña no cumple los requisitos de Supabase.';
        }
        if (message.includes('unauthorized') || message.includes('forbidden')) {
            return 'No autorizado para crear usuarios con create-user. Revisa los permisos de la función.';
        }
        if (message.includes('insufficient permissions')) {
            return 'El usuario actual no tiene permisos de administrador para crear usuarios.';
        }
        if (message.includes('profile not found')) {
            return 'No se encontró el perfil del usuario actual en la tabla profiles.';
        }
        if (message.includes('missing supabase environment variables')) {
            return 'La función create-user no tiene secrets configurados.';
        }
        if (message.includes('profiles_username_key')) {
            return 'Conflicto de nombre de usuario. Usa otro correo.';
        }
        if (message.includes('database error creating new user')) {
            return 'Error de esquema al crear usuario (profiles). Ejecuta la migración 202602280006_create_user_profile_company_guard.sql y reintenta.';
        }
        if (message.includes('missing supabase environment variables')) {
            return 'La función create-user no tiene secrets configurados.';
        }
        if (message.includes('column') && message.includes('profiles')) {
            return `Error de esquema en profiles: ${error?.message}`;
        }
        return error?.message || 'No se pudo crear el usuario.';
    };

    const response = await invokeEdgeFunctionJson('create-user', accessToken, payload);
    if (!response.ok) {
        throw new Error(mapCreateUserError({ message: response.message }));
    }

    if (!response.data) {
        throw new Error('No se pudo crear el usuario.');
    }

    return response.data as User;
};

export const updateUser = async (user: any): Promise<User> => {
    if (!user?.id) {
        throw new Error('ID de usuario inválido.');
    }

    const nextPassword = String(user.password || '').trim();
    if (nextPassword) {
        const { data: currentUserData } = await supabase.auth.getUser();
        const currentUserId = currentUserData?.user?.id || null;
        if (currentUserId && currentUserId === user.id) {
            const { error: selfPasswordError } = await supabase.auth.updateUser({ password: nextPassword });
            if (selfPasswordError) throw selfPasswordError;
        } else {
            await invokeAdminPasswordReset(user.id, nextPassword);
        }
    }

    const profilePayload: Record<string, any> = {};
    if (typeof user.fullName === 'string' && user.fullName.trim()) {
        profilePayload.full_name = toTitleCase(user.fullName);
    }
    if (typeof user.role === 'string' && user.role.trim()) {
        profilePayload.role = user.role;
    }
    if (typeof user.isActive === 'boolean') {
        profilePayload.is_active = user.isActive;
    }

    let data: any = null;
    let error: any = null;
    if (Object.keys(profilePayload).length > 0) {
        ({ data, error } = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('id', user.id)
            .select()
            .single());
    } else {
        ({ data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single());
    }

    if (error) throw error;

    if (user.storeId) {
        await assignUserDefaultStore(user.id, user.storeId);
    }

    return {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        username: data.username,
        role: data.role,
        isActive: data.is_active
    };
};

// --- CREDITOS ---
export const getCredits = async (filters?: any): Promise<Credit[]> => {
    let query = supabase
        .from('credits')
        .select(`
            *,
            customers (full_name),
            sales (invoice_number)
        `)
        .order('created_at', { ascending: false });

    if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
    if (filters?.status) query = query.eq('status', filters.status);

    const scopedStoreId = filters?.consolidated ? null : (filters?.storeId ?? getActiveStoreId());
    if (scopedStoreId) {
        query = query.or(`store_id.eq.${scopedStoreId},store_id.is.null`);
    }

    let data: any[] | null = null;
    let error: any = null;
    ({ data, error } = await query);
    if (error && (scopedStoreId || scopedCompanyId) && isMissingColumnError(error)) {
        const fallbackQuery = supabase
            .from('credits')
            .select(`
                *,
                customers (full_name),
                sales (invoice_number)
            `)
            .order('created_at', { ascending: false });
        if (filters?.customerId) fallbackQuery.eq('customer_id', filters.customerId);
        if (filters?.status) fallbackQuery.eq('status', filters.status);
        if (scopedStoreId) fallbackQuery.or(`store_id.eq.${scopedStoreId},store_id.is.null`);
        ({ data, error } = await fallbackQuery);
    }

    if (error) throw error;

    return (data || []).map(c => ({
        id: c.id,
        saleId: c.sale_id,
        customerId: c.customer_id,
        totalCredit: c.total_credit,
        balance: c.balance,
        interestRate: c.interest_rate,
        numberOfInstallments: c.number_of_installments,
        periodicity: c.periodicity as any,
        status: c.status as any,
        startDate: c.start_date,
        nextDueDate: c.next_due_date,
        createdAt: c.created_at,
        customerName: c.customers?.full_name,
        saleNumber: c.sales?.invoice_number
    }));
};

export const getCreditWithInstallments = async (creditId: string) => {
    const { data: credit, error: cErr } = await supabase
        .from('credits')
        .select(`
            *,
            customers (full_name, phone),
            sales (invoice_number)
        `)
        .eq('id', creditId)
        .single();

    if (cErr) throw cErr;

    const { data: installments, error: iErr } = await supabase
        .from('credit_installments')
        .select('*')
        .eq('credit_id', creditId)
        .order('installment_number');

    if (iErr) throw iErr;

    return {
        ...credit,
        customerName: credit.customers?.full_name,
        customerPhone: credit.customers?.phone,
        saleNumber: credit.sales?.invoice_number,
        installments: installments.map(i => ({
            id: i.id,
            creditId: i.credit_id,
            installmentNumber: i.installment_number,
            dueDate: i.due_date,
            amount: i.amount,
            paidAmount: i.paid_amount,
            status: i.status as any,
            paymentDate: i.payment_date,
            notes: i.notes
        }))
    };
};

export const payInstallment = async (
    installmentId: string,
    amount: number,
    paymentMethod: string,
    saleId: string,
    paymentStoreId?: string | null
) => {
    // 1. Registrar el pago en sale_payments para el reporte diario
    const scopedStoreId = paymentStoreId ?? getActiveStoreId();
    let payErr: any = null;

    ({ error: payErr } = await supabase
        .from('sale_payments')
        .insert([{
            sale_id: saleId,
            payment_method: paymentMethod, // e.g., 'cash', 'yape'
            amount: amount,
            credit_installment_id: installmentId,
            payment_store_id: scopedStoreId || null
        }]));

    if (payErr && isMissingColumnError(payErr)) {
        ({ error: payErr } = await supabase
            .from('sale_payments')
            .insert([{
                sale_id: saleId,
                payment_method: paymentMethod,
                amount: amount,
                credit_installment_id: installmentId
            }]));
    }

    if (payErr) throw payErr;

    // El trigger handle_credit_payment en la DB se encarga de actualizar 
    // el saldo de la cuota y del crédito general.
    return true;
};

export const getOverdueInstallmentAlerts = async (options?: {
    storeId?: string | null;
    consolidated?: boolean;
    limit?: number;
}): Promise<OverdueInstallmentAlert[]> => {
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

    let query = supabase
        .from('credit_installments')
        .select(`
            id,
            credit_id,
            installment_number,
            due_date,
            amount,
            paid_amount,
            status,
            credits (
                store_id,
                customers (full_name),
                sales (invoice_number)
            )
        `)
        .in('status', ['pending', 'overdue'])
        .lt('due_date', today)
        .order('due_date', { ascending: true });

    if (options?.limit && options.limit > 0) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
        if (isMissingTableError(error) || isMissingColumnError(error) || isPermissionDeniedError(error)) {
            return [];
        }
        throw error;
    }

    const toDateOnly = (value: string): Date => {
        const [year, month, day] = String(value || '').split('-').map(Number);
        if (!year || !month || !day) return new Date(NaN);
        return new Date(year, month - 1, day);
    };

    const todayDate = toDateOnly(today);
    const alerts = (data || [])
        .map((row: any) => {
            const credit = row?.credits || {};
            const storeId = credit?.store_id || undefined;
            if (scopedStoreId && storeId && storeId !== scopedStoreId) return null;

            const amount = Number(row?.amount || 0);
            const paidAmount = Number(row?.paid_amount || 0);
            const amountDue = Math.max(0, amount - paidAmount);
            if (amountDue <= 0) return null;

            const dueDate = String(row?.due_date || '');
            const due = toDateOnly(dueDate);
            const msPerDay = 24 * 60 * 60 * 1000;
            const overdueDays = Number.isNaN(due.getTime())
                ? 0
                : Math.max(1, Math.floor((todayDate.getTime() - due.getTime()) / msPerDay));

            return {
                installmentId: row.id,
                creditId: row.credit_id,
                customerName: credit?.customers?.full_name || 'Cliente',
                dueDate,
                amountDue,
                overdueDays,
                saleNumber: credit?.sales?.invoice_number || undefined,
                storeId
            } as OverdueInstallmentAlert;
        })
        .filter((item: OverdueInstallmentAlert | null): item is OverdueInstallmentAlert => !!item);

    if (options?.limit && options.limit > 0) {
        return alerts.slice(0, options.limit);
    }

    return alerts;
};

// --- ADELANTOS / PREVENTAS ---
const mapAdvanceStatus = (status: string | null | undefined): AdvanceStatus => {
    switch (status) {
        case 'applied':
        case 'cancelled':
        case 'refunded':
            return status;
        default:
            return 'open';
    }
};

const mapAdvance = (row: any): Advance => {
    const totalAmount = Number(row.total_amount || 0);
    const appliedAmount = Number(row.applied_amount || 0);
    const refundedAmount = Number(row.refunded_amount || 0);
    const balance = totalAmount - appliedAmount - refundedAmount;

    return {
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customers?.full_name,
        sellerId: row.seller_id || undefined,
        sellerName: row.profiles?.full_name || undefined,
        storeId: row.store_id || undefined,
        storeName: row.store_name || undefined,
        kind: row.kind || 'a_cuenta',
        targetProductId: row.target_product_id || undefined,
        targetProductName: row.target_product_name || undefined,
        expectedDeliveryDate: row.expected_delivery_date || undefined,
        notes: row.notes || undefined,
        totalAmount,
        appliedAmount,
        refundedAmount,
        balance,
        status: mapAdvanceStatus(row.status),
        createdAt: row.created_at
    };
};

export const assignUserDefaultStore = async (userId: string, storeId: string): Promise<void> => {
    const nextUserId = String(userId || '').trim();
    const nextStoreId = String(storeId || '').trim();

    if (!nextUserId) throw new Error('Usuario inválido para asignación de tienda.');
    if (!nextStoreId) throw new Error('Debe seleccionar una tienda válida.');

    const resolvedCompanyId = getActiveCompanyId() || await resolveCompanyIdForStore(nextStoreId);

    let { error: resetDefaultError } = await supabase
        .from(USER_STORE_ASSIGNMENT_TABLE)
        .update({ is_default: false })
        .eq('user_id', nextUserId);

    if (resetDefaultError && isMissingColumnError(resetDefaultError, 'is_default')) {
        resetDefaultError = null;
    }

    if (resetDefaultError && !isMissingTableError(resetDefaultError)) {
        throw resetDefaultError;
    }

    const candidates: Record<string, any>[] = [
        {
            user_id: nextUserId,
            store_id: nextStoreId,
            company_id: resolvedCompanyId || null,
            is_default: true,
            can_sell: true,
            can_manage_inventory: false
        },
        {
            user_id: nextUserId,
            store_id: nextStoreId,
            is_default: true,
            can_sell: true,
            can_manage_inventory: false
        },
        {
            user_id: nextUserId,
            store_id: nextStoreId,
            is_default: true
        },
        {
            user_id: nextUserId,
            store_id: nextStoreId
        }
    ];

    let lastError: any = null;
    for (const payload of candidates) {
        let { error } = await supabase
            .from(USER_STORE_ASSIGNMENT_TABLE)
            .upsert([payload], { onConflict: 'user_id,store_id' });

        if (error && String(error?.message || '').toLowerCase().includes('on conflict')) {
            const { data: existingRow } = await supabase
                .from(USER_STORE_ASSIGNMENT_TABLE)
                .select('id')
                .eq('user_id', nextUserId)
                .eq('store_id', nextStoreId)
                .limit(1)
                .maybeSingle();

            if (existingRow?.id) {
                ({ error } = await supabase
                    .from(USER_STORE_ASSIGNMENT_TABLE)
                    .update(payload)
                    .eq('id', existingRow.id));
            } else {
                ({ error } = await supabase
                    .from(USER_STORE_ASSIGNMENT_TABLE)
                    .insert([payload]));
            }
        }

        if (!error) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('valni:stores-updated'));
            }
            return;
        }

        lastError = error;
        if (!isMissingColumnError(error) && !String(error?.message || '').toLowerCase().includes('on conflict')) {
            break;
        }
    }

    if (lastError && !isMissingTableError(lastError)) {
        throw lastError;
    }
};

const mapAdvanceMovement = (row: any): AdvanceMovement => ({
    id: row.id,
    advanceId: row.advance_id,
    movementType: row.movement_type,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || undefined,
    movementStoreId: row.movement_store_id || undefined,
    movementStoreName: row.movement_store_name || undefined,
    customerName: row.advances?.customers?.full_name || undefined,
    sellerId: row.advances?.seller_id || undefined,
    sellerName: row.advances?.profiles?.full_name || undefined,
    referenceNumber: row.reference_number || undefined,
    notes: row.notes || undefined,
    saleId: row.sale_id || undefined,
    createdAt: row.created_at
});

const loadAdvanceById = async (advanceId: string): Promise<Advance> => {
    const { data, error } = await supabase
        .from('advances')
        .select(`
            *,
            customers (full_name),
            profiles (full_name)
        `)
        .eq('id', advanceId)
        .single();

    if (error) throw error;
    return mapAdvance(data);
};

const getCurrentProfileId = async (): Promise<string | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id || null;
};

const insertAdvanceMovement = async (payload: any): Promise<void> => {
    let resolvedCompanyId = payload.company_id || getActiveCompanyId() || null;
    if (!resolvedCompanyId && payload.advance_id) {
        const { data: advanceCompany, error: advanceCompanyError } = await supabase
            .from('advances')
            .select('company_id')
            .eq('id', payload.advance_id)
            .maybeSingle();

        if (!advanceCompanyError) {
            resolvedCompanyId = advanceCompany?.company_id || null;
        }
    }

    const enrichedPayload: Record<string, any> = {
        ...payload,
        notes: toNullableSentenceCase(payload.notes),
        company_id: resolvedCompanyId
    };

    let { error } = await supabase
        .from('advance_movements')
        .insert([enrichedPayload]);

    if (error && isMissingColumnError(error)) {
        const fallbackPayload = { ...enrichedPayload };
        delete fallbackPayload.movement_store_id;
        delete fallbackPayload.company_id;
        ({ error } = await supabase
            .from('advance_movements')
            .insert([fallbackPayload]));
    }

    if (error) throw error;
};

export const getAdvances = async (options?: { storeId?: string | null; consolidated?: boolean }): Promise<Advance[]> => {
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    let query = supabase
        .from('advances')
        .select(`
            *,
            customers (full_name),
            profiles (full_name)
        `)
        .order('created_at', { ascending: false });

    if (scopedStoreId) {
        query = query.eq('store_id', scopedStoreId);
    }

    let data: any[] | null = null;
    let error: any = null;
    ({ data, error } = await query);

    if (error && scopedStoreId && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('advances')
            .select(`
                *,
                customers (full_name),
                profiles (full_name)
            `)
            .order('created_at', { ascending: false }));
    }

    if (error) throw error;
    return (data || []).map(mapAdvance);
};

export const getAdvanceWithMovements = async (advanceId: string): Promise<{ advance: Advance; movements: AdvanceMovement[] }> => {
    const advance = await loadAdvanceById(advanceId);
    const { data, error } = await supabase
        .from('advance_movements')
        .select(`
            *,
            advances (
                seller_id,
                profiles (full_name),
                customers (full_name)
            )
        `)
        .eq('advance_id', advanceId)
        .order('created_at', { ascending: false });

    if (error) throw error;

    return {
        advance,
        movements: (data || []).map(mapAdvanceMovement)
    };
};

export const getCustomerAdvanceBalance = async (
    customerId: string,
    options?: { storeId?: string | null; consolidated?: boolean }
): Promise<{ balance: number; advances: Advance[] }> => {
    if (!customerId) return { balance: 0, advances: [] };

    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    let query = supabase
        .from('advances')
        .select(`
            *,
            customers (full_name),
            profiles (full_name)
        `)
        .eq('customer_id', customerId)
        .in('status', ['open', 'applied', 'refunded'])
        .order('created_at', { ascending: true });

    if (scopedStoreId) {
        query = query.eq('store_id', scopedStoreId);
    }

    let data: any[] | null = null;
    let error: any = null;
    ({ data, error } = await query);
    if (error && scopedStoreId && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('advances')
            .select(`
                *,
                customers (full_name),
                profiles (full_name)
            `)
            .eq('customer_id', customerId)
            .in('status', ['open', 'applied', 'refunded'])
            .order('created_at', { ascending: true }));
    }

    if (error) throw error;

    const advances = (data || []).map(mapAdvance).filter(advance => advance.balance > 0);
    const balance = advances.reduce((acc, advance) => acc + advance.balance, 0);
    return { balance, advances };
};

export const saveAdvance = async (payload: {
    customerId: string;
    sellerId?: string;
    storeId?: string;
    kind: 'reserva_stock' | 'pedido_especial' | 'a_cuenta';
    targetProductId?: string;
    targetProductName?: string;
    expectedDeliveryDate?: string;
    notes?: string;
    initialAmount: number;
    paymentMethod?: string;
    movementStoreId?: string;
    referenceNumber?: string;
}): Promise<Advance> => {
    const initialAmount = Number(payload.initialAmount || 0);
    const currentUserId = await getCurrentProfileId();
    const sellerId = payload.sellerId || currentUserId;
    const scopedStoreId = payload.storeId ?? getActiveStoreId();
    const scopedCompanyId = getActiveCompanyId() || (scopedStoreId ? await resolveCompanyIdForStore(scopedStoreId) : null);
    const normalizedTargetProductName = toNullableTitleCase(payload.targetProductName);
    const normalizedAdvanceNotes = toNullableSentenceCase(payload.notes);
    let data: any = null;
    let error: any = null;

    ({ data, error } = await supabase
        .from('advances')
        .insert([{
            company_id: scopedCompanyId || null,
            customer_id: payload.customerId,
            seller_id: sellerId || null,
            store_id: scopedStoreId || null,
            kind: payload.kind || 'a_cuenta',
            target_product_id: payload.targetProductId || null,
            target_product_name: normalizedTargetProductName,
            expected_delivery_date: payload.expectedDeliveryDate || null,
            notes: normalizedAdvanceNotes,
            total_amount: initialAmount,
            applied_amount: 0,
            refunded_amount: 0,
            status: 'open'
        }])
        .select('id')
        .single());

    if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('advances')
            .insert([{
                company_id: scopedCompanyId || null,
                customer_id: payload.customerId,
                seller_id: sellerId || null,
                kind: payload.kind || 'a_cuenta',
                target_product_id: payload.targetProductId || null,
                target_product_name: normalizedTargetProductName,
                expected_delivery_date: payload.expectedDeliveryDate || null,
                notes: normalizedAdvanceNotes,
                total_amount: initialAmount,
                applied_amount: 0,
                refunded_amount: 0,
                status: 'open'
            }])
            .select('id')
            .single());
    }

    if (error && isMissingColumnError(error, 'company_id')) {
        ({ data, error } = await supabase
            .from('advances')
            .insert([{
                customer_id: payload.customerId,
                seller_id: sellerId || null,
                store_id: scopedStoreId || null,
                kind: payload.kind || 'a_cuenta',
                target_product_id: payload.targetProductId || null,
                target_product_name: normalizedTargetProductName,
                expected_delivery_date: payload.expectedDeliveryDate || null,
                notes: normalizedAdvanceNotes,
                total_amount: initialAmount,
                applied_amount: 0,
                refunded_amount: 0,
                status: 'open'
            }])
            .select('id')
            .single());
    }

    if (error) throw error;

    if (initialAmount > 0) {
        await insertAdvanceMovement({
            advance_id: data.id,
            company_id: scopedCompanyId || null,
            movement_type: 'payment',
            amount: initialAmount,
            payment_method: payload.paymentMethod || 'cash',
            movement_store_id: payload.movementStoreId || scopedStoreId || null,
            reference_number: payload.referenceNumber || null,
            notes: 'Registro inicial de adelanto',
            created_by: currentUserId || null
        });
    }

    return await loadAdvanceById(data.id);
};

export const addAdvancePayment = async (
    advanceId: string,
    amount: number,
    paymentMethod: string,
    notes?: string,
    referenceNumber?: string,
    movementStoreId?: string | null
): Promise<Advance> => {
    const value = Number(amount || 0);
    if (value <= 0) throw new Error('El monto del abono debe ser mayor a 0.');
    const currentUserId = await getCurrentProfileId();
    const normalizedNotes = toNullableSentenceCase(notes);

    await insertAdvanceMovement({
        advance_id: advanceId,
        movement_type: 'payment',
        amount: value,
        payment_method: paymentMethod || 'cash',
        movement_store_id: movementStoreId || getActiveStoreId() || null,
        notes: normalizedNotes,
        reference_number: referenceNumber || null,
        created_by: currentUserId || null
    });

    const current = await loadAdvanceById(advanceId);
    const { error: updateError } = await supabase
        .from('advances')
        .update({
            total_amount: current.totalAmount + value,
            updated_at: new Date().toISOString(),
            status: current.status === 'cancelled' ? 'open' : current.status
        })
        .eq('id', advanceId);

    if (updateError) throw updateError;
    return await loadAdvanceById(advanceId);
};

export const applyAdvanceAmount = async (
    advanceId: string,
    amount: number,
    saleId?: string,
    notes?: string,
    movementStoreId?: string | null
): Promise<Advance> => {
    const value = Number(amount || 0);
    if (value <= 0) throw new Error('El monto a aplicar debe ser mayor a 0.');
    const currentUserId = await getCurrentProfileId();
    const normalizedNotes = toNullableSentenceCase(notes);

    const current = await loadAdvanceById(advanceId);
    if (current.status === 'cancelled') throw new Error('No se puede aplicar un adelanto cancelado.');
    if (current.balance < value) throw new Error('El monto excede el saldo disponible del adelanto.');

    await insertAdvanceMovement({
        advance_id: advanceId,
        movement_type: 'application',
        amount: value,
        movement_store_id: movementStoreId || getActiveStoreId() || null,
        sale_id: saleId || null,
        notes: normalizedNotes,
        created_by: currentUserId || null
    });

    const nextApplied = current.appliedAmount + value;
    const nextBalance = current.totalAmount - nextApplied - current.refundedAmount;
    const nextStatus: AdvanceStatus = nextBalance <= 0 ? 'applied' : 'open';

    const { error: updateError } = await supabase
        .from('advances')
        .update({
            applied_amount: nextApplied,
            status: nextStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', advanceId);
    if (updateError) throw updateError;

    return await loadAdvanceById(advanceId);
};

export const refundAdvanceAmount = async (
    advanceId: string,
    amount: number,
    paymentMethod: string,
    notes?: string,
    movementStoreId?: string | null
): Promise<Advance> => {
    const value = Number(amount || 0);
    if (value <= 0) throw new Error('El monto a devolver debe ser mayor a 0.');
    const currentUserId = await getCurrentProfileId();
    const normalizedNotes = toNullableSentenceCase(notes);

    const current = await loadAdvanceById(advanceId);
    if (current.status === 'cancelled') throw new Error('No se puede devolver un adelanto cancelado.');
    if (current.balance < value) throw new Error('El monto excede el saldo disponible del adelanto.');

    await insertAdvanceMovement({
        advance_id: advanceId,
        movement_type: 'refund',
        amount: value,
        payment_method: paymentMethod || 'cash',
        movement_store_id: movementStoreId || getActiveStoreId() || null,
        notes: normalizedNotes,
        created_by: currentUserId || null
    });

    const nextRefunded = current.refundedAmount + value;
    const nextBalance = current.totalAmount - current.appliedAmount - nextRefunded;
    const nextStatus: AdvanceStatus = nextBalance <= 0 ? 'refunded' : 'open';

    const { error: updateError } = await supabase
        .from('advances')
        .update({
            refunded_amount: nextRefunded,
            status: nextStatus,
            updated_at: new Date().toISOString()
        })
        .eq('id', advanceId);
    if (updateError) throw updateError;

    return await loadAdvanceById(advanceId);
};

export const cancelAdvance = async (advanceId: string, notes?: string): Promise<Advance> => {
    const normalizedNotes = toNullableSentenceCase(notes);
    const { error: updateError } = await supabase
        .from('advances')
        .update({
            status: 'cancelled',
            notes: normalizedNotes,
            updated_at: new Date().toISOString()
        })
        .eq('id', advanceId);

    if (updateError) throw updateError;
    return await loadAdvanceById(advanceId);
};

export const applyCustomerAdvancesToSale = async (customerId: string, saleId: string, amountToApply: number): Promise<void> => {
    const targetAmount = Number(amountToApply || 0);
    if (!customerId || !saleId || targetAmount <= 0) return;

    const { advances, balance } = await getCustomerAdvanceBalance(customerId, { consolidated: true });
    if (balance < targetAmount) {
        throw new Error('El cliente no tiene saldo suficiente en adelantos para cubrir el monto indicado.');
    }

    let remaining = targetAmount;
    for (const advance of advances) {
        if (remaining <= 0) break;
        const toApply = Math.min(remaining, advance.balance);
        await applyAdvanceAmount(advance.id, toApply, saleId, `Aplicado automáticamente a venta ${saleId}`, getActiveStoreId());
        remaining -= toApply;
    }
};
// --- PRODUCTOS ---
type ProductQueryOptions = {
    storeId?: string | null;
    consolidated?: boolean;
};

export const getProducts = async (options?: ProductQueryOptions): Promise<Product[]> => {
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    let scopedCompanyId = getActiveCompanyId();
    if (!scopedCompanyId && scopedStoreId) {
        scopedCompanyId = await resolveCompanyIdForStore(scopedStoreId);
    }
    const pageSize = 1000;
    const data: any[] = [];
    let from = 0;

    while (true) {
        let pageQuery = supabase
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
            .order('name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

        if (scopedCompanyId) {
            pageQuery = pageQuery.eq('company_id', scopedCompanyId);
        }

        const { data: pageData, error } = await pageQuery;
        if (error) throw error;

        const rows = pageData || [];
        data.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
    }

    const baseProducts = (data || []).map((p: any) => ({
        ...p,
        type: mapProductTypeFromDb(p.type),
        createdAt: p.created_at || undefined,
        updatedAt: p.updated_at || undefined,
        supplierId: p.supplier_id || undefined,
        brand: (p.models as any)?.brands?.name || 'Genérico',
        model: (p.models as any)?.name || 'N/A',
        buyPrice: Number(p.buy_price || 0),
        stock: p.stock_quantity,    // Compatibilidad UI
        price: p.sell_price,        // Compatibilidad UI
        sellPrice: p.sell_price,
        minPrice: p.min_sell_price, // Compatibilidad UI
        minSellPrice: p.min_sell_price,
        stockQuantity: p.stock_quantity,
        imei1: p.imei_1,           // Mapeo imei_1 -> imei1
        imei2: p.imei_2,           // Mapeo imei_2 -> imei2
        location: p.location_bin || DEFAULT_LOCATION_NAMES[0], // Compatibilidad UI legacy
        status: p.status || 'Registrado'
    })) as Product[];

    const stockByProduct = new Map<string, number>();
    const storeByProduct = new Map<string, string>();
    const scopedProductIds = new Set<string>();

    // Primary source for this app flow: inventory_balances.
    let balanceQuery = supabase
        .from(INVENTORY_BALANCE_TABLE)
        .select('product_id, store_id, on_hand');

    if (scopedStoreId) {
        balanceQuery = balanceQuery.eq('store_id', scopedStoreId);
    }

    if (scopedCompanyId) {
        balanceQuery = balanceQuery.eq('company_id', scopedCompanyId);
    }

    let { data: balanceData, error: balanceError } = await balanceQuery;
    if (balanceError && scopedCompanyId && isMissingColumnError(balanceError, 'company_id')) {
        let retryQuery = supabase
            .from(INVENTORY_BALANCE_TABLE)
            .select('product_id, store_id, on_hand');
        if (scopedStoreId) {
            retryQuery = retryQuery.eq('store_id', scopedStoreId);
        }
        ({ data: balanceData, error: balanceError } = await retryQuery);
    }

    if (balanceError) {
        if (!isMissingTableError(balanceError) && !isMissingColumnError(balanceError)) {
            throw balanceError;
        }
    } else {
        (balanceData || []).forEach((row: any) => {
            if (!row?.product_id) return;
            const current = stockByProduct.get(row.product_id) || 0;
            stockByProduct.set(row.product_id, current + Number(row.on_hand || 0));
            if (row.store_id) {
                storeByProduct.set(row.product_id, row.store_id);
                if (!scopedStoreId || row.store_id === scopedStoreId) {
                    scopedProductIds.add(row.product_id);
                }
            }
        });
    }

    // Fallback/compatibilidad: Para datos migrados que no tienen registro en inventory_balances,
    // el mapeo posterior usará el stock_quantity de la tabla de productos (baseProducts).

    let scopedStoreName: string | null = null;
    let normalizedLegacyScopedLocation: string | null = null;
    if (scopedStoreId) {
        const stores = await getStores();
        scopedStoreName = stores.find(s => s.id === scopedStoreId)?.name || null;
        normalizedLegacyScopedLocation = inferLegacyLocationForStore(scopedStoreName);
    }

    const mappedProducts = baseProducts.map((product) => {
        // Use stock balance if available, otherwise fallback to the product row stock_quantity (for migrated data)
        const hasBalance = stockByProduct.has(product.id);
        const rawStock = hasBalance
            ? (stockByProduct.get(product.id) || 0)
            : Number(product.stockQuantity || 0);

        // Clamp stock to 0 for UI display to avoid negative values from migrated data
        const computedStock = Math.max(0, rawStock);

        const resolvedStoreId = storeByProduct.get(product.id) || undefined;
        const normalizedProductLocation = normalizeName(product.location);
        const normalizedScopedStoreName = scopedStoreName ? normalizeName(scopedStoreName) : null;
        const matchedByBalance = scopedProductIds.has(product.id);
        const matchedByStoreName = !!normalizedScopedStoreName && normalizedProductLocation === normalizedScopedStoreName;
        const matchedByLegacyAlias = !!scopedStoreId &&
            scopedProductIds.size === 0 &&
            !!normalizedLegacyScopedLocation &&
            normalizedProductLocation === normalizedLegacyScopedLocation;

        const isInScopedStore = !scopedStoreId
            ? true
            : (matchedByBalance || matchedByStoreName || matchedByLegacyAlias);

        const resolvedLocation = options?.consolidated
            ? (product.location || DEFAULT_LOCATION_NAMES[0])
            : ((matchedByBalance || matchedByStoreName) && scopedStoreName
                ? scopedStoreName
                : (product.location || DEFAULT_LOCATION_NAMES[0]));

        return {
            ...product,
            stock: computedStock,
            stockQuantity: computedStock,
            location: resolvedLocation,
            storeId: resolvedStoreId,
            storeName: scopedStoreName || undefined
        };
    });

    if (scopedStoreId) {
        const normalizedScopedStoreName = scopedStoreName ? normalizeName(scopedStoreName) : null;
        return mappedProducts.filter((product) =>
            scopedProductIds.has(product.id) ||
            (!!normalizedScopedStoreName && normalizeName(product.location) === normalizedScopedStoreName) ||
            (scopedProductIds.size === 0 &&
                !!normalizedLegacyScopedLocation &&
                normalizeName(product.location) === normalizedLegacyScopedLocation)
        );
    }

    return mappedProducts;
};

export const saveProduct = async (product: Partial<Product>): Promise<Product> => {
    // 1. Encuentra model_id si se proporcionan marca y modelo
    let modelId = null;
    const normalizedBrandName = toNullableTitleCase(product.brand);
    const normalizedModelName = toNullableTitleCase(product.model);
    const normalizedProductName = toTitleCase(product.name);
    const normalizedProductDescription = toNullableSentenceCase(product.description);
    const normalizedProductColor = toNullableTitleCase(product.color);
    const normalizedProductLocation = toTitleCase(product.location || DEFAULT_LOCATION_NAMES[0]);
    if (normalizedBrandName && normalizedModelName) {
        const { data: brandData } = await supabase.from('brands').select('id').eq('name', normalizedBrandName).single();
        if (brandData) {
            const { data: modelData } = await supabase.from('models').select('id').eq('brand_id', brandData.id).eq('name', normalizedModelName).single();
            if (modelData) modelId = modelData.id;
        }
    }

    const resolvedPrice = Number(product.price ?? product.sellPrice ?? 0);
    const resolvedMinPrice = Number(product.minPrice ?? product.minSellPrice ?? Math.max(resolvedPrice, 0));
    const resolvedStock = Number(product.stock ?? product.stockQuantity ?? 0);
    const resolvedBuyPrice = Number(product.buyPrice ?? 0);
    const storeIdByLocation = await resolveStoreIdByName(product.location || null);
    const resolvedStoreId = storeIdByLocation || product.storeId || getActiveStoreId() || null;
    let resolvedCompanyId =
        product.companyId ||
        getActiveCompanyId() ||
        (resolvedStoreId ? await resolveCompanyIdForStore(resolvedStoreId) : null);

    if (!resolvedCompanyId) {
        const { data: companyData, error: companyError } = await supabase
            .from(COMPANY_TABLE)
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (companyError && !isMissingTableError(companyError)) {
            throw companyError;
        }
        resolvedCompanyId = companyData?.id || null;
    }

    if (!resolvedCompanyId) {
        throw new Error('No se pudo determinar la empresa activa para guardar el producto. Vuelve a iniciar sesión o valida la tienda activa.');
    }

    const dbPayload = {
        company_id: resolvedCompanyId,
        supplier_id: product.supplierId || null,
        buy_price: Math.max(0, resolvedBuyPrice),
        color: normalizedProductColor,
        ram: product.ram || null,
        rom: product.rom || null,
        name: normalizedProductName,
        description: normalizedProductDescription,
        model_id: modelId,
        type: mapProductTypeToDb(product.type as any),
        sell_price: resolvedPrice,
        min_sell_price: resolvedMinPrice,
        stock_quantity: resolvedStock,
        imei_1: product.imei1,
        imei_2: product.imei2,
        serial_number: product.serialNumber,
        status: product.status || 'available',
        location_bin: normalizedProductLocation
    };

    let { data, error } = await supabase
        .from('products')
        .insert([dbPayload])
        .select()
        .single();

    if (error && isMissingColumnError(error, 'supplier_id')) {
        const fallbackPayload = { ...dbPayload } as any;
        delete fallbackPayload.supplier_id;
        ({ data, error } = await supabase
            .from('products')
            .insert([fallbackPayload])
            .select()
            .single());
    }

    if (error) throw error;

    await upsertInventoryBalance(data.id, resolvedStoreId, resolvedStock);

    return data as any;
};

export const updateProduct = async (product: Product): Promise<Product> => {
    // 1. Encuentra model_id si se proporcionan marca y modelo
    let modelId = null;
    const normalizedBrandName = toNullableTitleCase(product.brand);
    const normalizedModelName = toNullableTitleCase(product.model);
    const normalizedProductName = toTitleCase(product.name);
    const normalizedProductDescription = toNullableSentenceCase(product.description);
    const normalizedProductColor = toNullableTitleCase(product.color);
    const normalizedProductLocation = toTitleCase(product.location || DEFAULT_LOCATION_NAMES[0]);
    if (normalizedBrandName && normalizedModelName) {
        const { data: brandData } = await supabase.from('brands').select('id').eq('name', normalizedBrandName).single();
        if (brandData) {
            const { data: modelData } = await supabase.from('models').select('id').eq('brand_id', brandData.id).eq('name', normalizedModelName).single();
            if (modelData) modelId = modelData.id;
        }
    }

    const resolvedPrice = Number(product.price ?? product.sellPrice ?? 0);
    const resolvedMinPrice = Number(product.minPrice ?? product.minSellPrice ?? Math.max(resolvedPrice, 0));
    const resolvedStock = Number(product.stock ?? product.stockQuantity ?? 0);
    const resolvedBuyPrice = Number(product.buyPrice ?? 0);

    const dbPayload = {
        supplier_id: product.supplierId || null,
        buy_price: Math.max(0, resolvedBuyPrice),
        color: normalizedProductColor,
        ram: product.ram || null,
        rom: product.rom || null,
        name: normalizedProductName,
        description: normalizedProductDescription,
        model_id: modelId,
        type: mapProductTypeToDb(product.type as any),
        sell_price: resolvedPrice,
        min_sell_price: resolvedMinPrice,
        stock_quantity: resolvedStock,
        imei_1: product.imei1,
        imei_2: product.imei2,
        serial_number: product.serialNumber,
        status: product.status,
        location_bin: normalizedProductLocation,
        updated_at: new Date().toISOString()
    };

    let { data, error } = await supabase
        .from('products')
        .update(dbPayload)
        .eq('id', product.id)
        .select()
        .single();

    if (error && isMissingColumnError(error, 'supplier_id')) {
        const fallbackPayload = { ...dbPayload } as any;
        delete fallbackPayload.supplier_id;
        ({ data, error } = await supabase
            .from('products')
            .update(fallbackPayload)
            .eq('id', product.id)
            .select()
            .single());
    }

    if (error) throw error;

    const previousStoreId = product.storeId || null;
    const storeIdByLocation = await resolveStoreIdByName(product.location || null);
    const resolvedStoreId = storeIdByLocation || previousStoreId;
    await upsertInventoryBalance(product.id, resolvedStoreId, resolvedStock);

    // Si la ubicación cambió de tienda, evita duplicar stock entre origen y destino.
    if (previousStoreId && resolvedStoreId && previousStoreId !== resolvedStoreId) {
        await supabase
            .from(INVENTORY_BALANCE_TABLE)
            .update({ on_hand: 0 })
            .eq('product_id', product.id)
            .eq('store_id', previousStoreId);
    }

    return data as any;
};

export const updateProductsBulk = async (products: Product[]): Promise<Product[]> => {
    const results = [];
    for (const prod of products) {
        const res = await updateProduct(prod);
        results.push(res);
    }
    return results;
};

// --- CLIENTES ---
export const getCustomers = async (): Promise<Customer[]> => {
    const activeCompanyId = getActiveCompanyId();
    let allData: any[] = [];
    let hasMore = true;
    let page = 0;
    const limit = 1000;

    while (hasMore) {
        let query = supabase
            .from('customers')
            .select('*')
            .range(page * limit, (page + 1) * limit - 1)
            .order('full_name');

        if (activeCompanyId) {
            query = query.eq('company_id', activeCompanyId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            page++;
            if (data.length < limit) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    return allData.map((c: any) => ({
        ...c,
        dni: c.doc_number,    // Compatibilidad UI
        docNumber: c.doc_number,
        fullName: c.full_name,
        doc_number: c.doc_number, // Ensure redundant fields for search
        full_name: c.full_name
    })) as any;
};

export const saveCustomer = async (customer: any): Promise<Customer> => {
    let resolvedCompanyId: string | null = customer.companyId || getActiveCompanyId() || null;
    if (!resolvedCompanyId) {
        const { data: companyData, error: companyError } = await supabase
            .from(COMPANY_TABLE)
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (!companyError) {
            resolvedCompanyId = companyData?.id || null;
        } else if (!isMissingTableError(companyError)) {
            throw companyError;
        }
    }

    const normalizedFullName = toTitleCase(customer.fullName || customer.full_name);
    const normalizedAddress = toNullableTitleCase(customer.address);

    // Map UI fields to DB fields if necessary
    const dbCustomer: Record<string, any> = {
        full_name: normalizedFullName,
        doc_type: customer.docType || customer.doc_type || 'DNI',
        doc_number: customer.dni || customer.docNumber || customer.doc_number,
        address: normalizedAddress,
        phone: customer.phone
    };

    const candidates: Record<string, any>[] = [];
    if (resolvedCompanyId) {
        candidates.push({ ...dbCustomer, company_id: resolvedCompanyId });
    }
    candidates.push(dbCustomer);

    let data: any = null;
    let error: any = null;
    for (const payload of candidates) {
        ({ data, error } = await supabase
            .from('customers')
            .insert([payload])
            .select()
            .single());

        if (!error) break;
        if (isMissingColumnError(error, 'company_id')) continue;
        break;
    }

    if (error) {
        const message = getSupabaseErrorMessage(error).toLowerCase();
        if (message.includes('company_id') && (message.includes('not null') || message.includes('_nn') || message.includes('check constraint'))) {
            throw new Error('No se pudo resolver company_id para el cliente. Verifica empresa/tienda activa e intenta nuevamente.');
        }
        throw error;
    }

    return {
        ...data,
        dni: data.doc_number,
        docNumber: data.doc_number,
        fullName: data.full_name
    } as any;
};

// --- VENTAS (Motor del POS) ---
export const saveSale = async (payload: any): Promise<{ saleId: string }> => {
    const formattedItems = payload.items.map((item: any) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.price || item.salePrice || 0,
        captured_imei: item.imei1 || null,
        captured_serial: item.serialNumber || null
    }));

    const formattedPayments = payload.payments.map((p: any) => ({
        payment_method: toDbPaymentMethodSafe(p.paymentMethod),
        payment_method_label: toNullableTitleCase(p.paymentMethod),
        amount: Number(p.amount || 0)
    }));

    const scopedStoreId = payload.storeId ?? getActiveStoreId();
    const scopedCompanyId = payload.companyId ?? getActiveCompanyId();

    // Ejecutar la venta como una transacción atómica mediante RPC
    let saleId: string | null = null;
    let error: any = null;

    const invokeProcessSaleAtomic = async (): Promise<{ saleId: string | null; error: any }> => {
        let rpcSaleId: string | null = null;
        let rpcError: any = null;
        let primaryRpcError: any = null;
        const sellerId = (payload.sellerId && payload.sellerId.startsWith('00000000')) ? null : payload.sellerId;
        const documentType = payload.documentType || 'Recibo de Venta';
        const documentSeries = payload.documentSeries || null;

        ({ data: rpcSaleId, error: rpcError } = await supabase.rpc('rpc_create_sale', {
            p_company_id: scopedCompanyId || null,
            p_store_id: scopedStoreId || null,
            p_warehouse_id: null,
            p_shift_id: null,
            p_customer_id: payload.customerId,
            p_seller_id: sellerId,
            p_total_amount: payload.total,
            p_items: formattedItems,
            p_payments: formattedPayments,
            p_document_type: documentType,
            p_document_series: documentSeries
        }));

        primaryRpcError = rpcError;

        const shouldFallbackToLegacy =
            !!rpcError && (
                SALES_RPC_MODE === 'compat' ||
                (SALES_RPC_MODE === 'auto' && isMissingRpcCreateSaleError(rpcError))
            );

        if (shouldFallbackToLegacy) {
            ({ data: rpcSaleId, error: rpcError } = await supabase.rpc('process_sale_atomic', {
                p_customer_id: payload.customerId,
                p_seller_id: sellerId,
                p_total_amount: payload.total,
                p_items: formattedItems,
                p_payments: formattedPayments,
                p_store_id: scopedStoreId || null,
                p_document_type: documentType,
                p_document_series: documentSeries
            }));

            if (rpcError && isMissingProcessSaleAtomicError(rpcError)) {
                rpcError = isMissingRpcCreateSaleError(primaryRpcError)
                    ? new Error(
                        'No existe rpc_create_sale ni process_sale_atomic en Supabase. Ejecuta migraciones de ventas RPC y recarga schema cache.'
                    )
                    : primaryRpcError;
            }
        }

        if (rpcError && SALES_RPC_MODE === 'canonical' && isMissingRpcCreateSaleError(rpcError)) {
            rpcError = new Error(
                'rpc_create_sale no existe en el esquema actual. Cambia temporalmente VITE_SALES_RPC_MODE=compat o ejecuta migraciones de cutover.'
            );
        }

        return { saleId: rpcSaleId, error: rpcError };
    };

    ({ saleId, error } = await invokeProcessSaleAtomic());

    if (error && isNoOpenShiftError(error) && scopedStoreId) {
        try {
            await ensureOpenPosShiftForStore(scopedStoreId, payload.sellerId);
            ({ saleId, error } = await invokeProcessSaleAtomic());
        } catch (shiftError: any) {
            throw new Error(`No se pudo abrir turno POS automáticamente: ${getSupabaseErrorMessage(shiftError)}`);
        }
    }

    if (error) {
        console.error('Error atómico en saveSale:', error);
        throw new Error(getSupabaseErrorMessage(error));
    }

    if (!saleId) {
        throw new Error('No se pudo obtener el identificador de venta.');
    }

    await syncSalePayments(saleId, formattedPayments, scopedStoreId, scopedCompanyId);

    if (scopedStoreId) {
        let paymentStoreError: any = null;
        ({ error: paymentStoreError } = await supabase
            .from('sale_payments')
            .update({ payment_store_id: scopedStoreId })
            .eq('sale_id', saleId));

        if (paymentStoreError && !isMissingColumnError(paymentStoreError)) {
            throw paymentStoreError;
        }
    }

    // Sync legado para vistas basadas en inventory_balances/products.stock_quantity.
    if (scopedStoreId) {
        for (const item of payload.items || []) {
            const productId = item.productId;
            const soldQty = Math.max(0, Number(item.quantity || 0));
            if (!productId || soldQty <= 0) continue;

            const { data: currentBalance, error: balanceReadError } = await supabase
                .from(INVENTORY_BALANCE_TABLE)
                .select('id, on_hand')
                .eq('product_id', productId)
                .eq('store_id', scopedStoreId)
                .maybeSingle();

            if (!balanceReadError && currentBalance) {
                const nextOnHand = Math.max(0, Number(currentBalance.on_hand || 0) - soldQty);
                let { error: balanceWriteError } = await supabase
                    .from(INVENTORY_BALANCE_TABLE)
                    .update({ on_hand: nextOnHand })
                    .eq('id', currentBalance.id);

                if (balanceWriteError && isMissingColumnError(balanceWriteError, 'company_id')) {
                    ({ error: balanceWriteError } = await supabase
                        .from(INVENTORY_BALANCE_TABLE)
                        .update({ on_hand: nextOnHand })
                        .eq('id', currentBalance.id));
                }
                if (balanceWriteError && !isMissingTableError(balanceWriteError)) {
                    throw balanceWriteError;
                }
            }

            const { data: productRow, error: productReadError } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', productId)
                .maybeSingle();

            if (!productReadError && productRow) {
                const nextStock = Math.max(0, Number(productRow.stock_quantity || 0) - soldQty);
                const { error: productWriteError } = await supabase
                    .from('products')
                    .update({ stock_quantity: nextStock })
                    .eq('id', productId);
                if (productWriteError) throw productWriteError;
            }
        }
    }

    // 4. Si hay un componente de crédito en el pago, crear el registro de crédito
    const creditPayment = payload.payments.find((p: any) => isCreditPaymentLabel(p.paymentMethod));
    if (creditPayment && payload.creditDetails) {
        const { installments, ...creditInfo } = payload.creditDetails;
        let resolvedCreditStoreId = scopedStoreId || null;
        let resolvedCreditCompanyId = scopedCompanyId || null;

        if (!resolvedCreditStoreId || !resolvedCreditCompanyId) {
            const { data: saleScopeData, error: saleScopeError } = await supabase
                .from('sales')
                .select('store_id, company_id')
                .eq('id', saleId)
                .maybeSingle();

            if (!saleScopeError && saleScopeData) {
                resolvedCreditStoreId = resolvedCreditStoreId || saleScopeData.store_id || null;
                resolvedCreditCompanyId = resolvedCreditCompanyId || saleScopeData.company_id || null;
            }
        }

        let creditData: any = null;
        let creditError: any = null;
        ({ data: creditData, error: creditError } = await supabase
            .from('credits')
            .insert([{
                sale_id: saleId,
                customer_id: payload.customerId,
                store_id: resolvedCreditStoreId || null,
                company_id: resolvedCreditCompanyId || null,
                total_credit: creditPayment.amount,
                balance: creditPayment.amount,
                interest_rate: creditInfo.interestRate || 0,
                number_of_installments: creditInfo.numberOfInstallments || 1,
                periodicity: creditInfo.periodicity || 'monthly',
                start_date: new Date().toISOString().split('T')[0],
                status: 'active'
            }])
            .select()
            .single());

        if (creditError && isMissingColumnError(creditError)) {
            ({ data: creditData, error: creditError } = await supabase
                .from('credits')
                .insert([{
                    sale_id: saleId,
                    customer_id: payload.customerId,
                    company_id: resolvedCreditCompanyId || null,
                    total_credit: creditPayment.amount,
                    balance: creditPayment.amount,
                    interest_rate: creditInfo.interestRate || 0,
                    number_of_installments: creditInfo.numberOfInstallments || 1,
                    periodicity: creditInfo.periodicity || 'monthly',
                    start_date: new Date().toISOString().split('T')[0],
                    status: 'active'
                }])
                .select()
                .single());
        }

        if (creditError && isMissingColumnError(creditError)) {
            ({ data: creditData, error: creditError } = await supabase
                .from('credits')
                .insert([{
                    sale_id: saleId,
                    customer_id: payload.customerId,
                    total_credit: creditPayment.amount,
                    balance: creditPayment.amount,
                    interest_rate: creditInfo.interestRate || 0,
                    number_of_installments: creditInfo.numberOfInstallments || 1,
                    periodicity: creditInfo.periodicity || 'monthly',
                    start_date: new Date().toISOString().split('T')[0],
                    status: 'active'
                }])
                .select()
                .single());
        }

        if (creditError) {
            throw new Error(`Venta registrada, pero no se pudo crear el crédito: ${getSupabaseErrorMessage(creditError)}`);
        } else if (installments && installments.length > 0) {
            const formattedInstallments = installments.map((inst: any) => ({
                credit_id: creditData.id,
                company_id: resolvedCreditCompanyId || null,
                installment_number: inst.number,
                due_date: inst.dueDate,
                amount: inst.amount,
                status: 'pending'
            }));

            let { error: instError } = await supabase
                .from('credit_installments')
                .insert(formattedInstallments);

            if (instError && isMissingColumnError(instError)) {
                const fallbackInstallments = installments.map((inst: any) => ({
                    credit_id: creditData.id,
                    installment_number: inst.number,
                    due_date: inst.dueDate,
                    amount: inst.amount,
                    status: 'pending'
                }));
                ({ error: instError } = await supabase
                    .from('credit_installments')
                    .insert(fallbackInstallments));
            }

            if (instError) {
                throw new Error(`Venta registrada, pero no se pudieron crear las cuotas: ${getSupabaseErrorMessage(instError)}`);
            }
        }
    }

    return { saleId };
};

// --- MAESTROS ---
export const getLocations = async (): Promise<InventoryLocation[]> => {
    try {
        const stores = await getStores();
        if (stores.length > 0) {
            return stores.map((store, index) => ({
                id: store.id,
                name: store.name,
                isSalePoint: store.type === 'store',
                isDefault: store.isDefault || index === 0
            }));
        }
    } catch {
        // Fallback to legacy inventory_locations table
    }

    const { data, error } = await supabase
        .from(LOCATION_TABLE)
        .select('id, name, is_sale_point, is_default')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

    if (error) {
        if (isMissingTableError(error)) {
            return fallbackLocations();
        }
        throw error;
    }

    return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        isSalePoint: row.is_sale_point ?? true,
        isDefault: row.is_default ?? false
    }));
};

export const saveLocation = async (location: Partial<InventoryLocation>): Promise<InventoryLocation> => {
    const trimmedName = toTitleCase(location.name);
    if (!trimmedName) {
        throw new Error('El nombre de la ubicación es obligatorio.');
    }

    // Source of truth: stores table (dropdown de tienda activa)
    let storeData: any = null;
    let storeError: any = null;

    let resolvedCompanyId = getActiveCompanyId();
    if (!resolvedCompanyId) {
        const { data: companyData } = await supabase
            .from(COMPANY_TABLE)
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        resolvedCompanyId = companyData?.id || null;
    }

    if (location.id) {
        ({ data: storeData, error: storeError } = await supabase
            .from(STORE_TABLE)
            .update({
                name: trimmedName,
                updated_at: new Date().toISOString()
            })
            .eq('id', location.id)
            .select('id, code, name, type, is_active, is_default')
            .single());
    } else {
        let candidateCode = toStoreCode(trimmedName);

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const insertPayload: Record<string, any> = {
                code: candidateCode,
                name: trimmedName,
                type: 'store',
                is_active: true,
                is_default: false
            };
            if (resolvedCompanyId) insertPayload.company_id = resolvedCompanyId;

            ({ data: storeData, error: storeError } = await supabase
                .from(STORE_TABLE)
                .insert([insertPayload])
                .select('id, code, name, type, is_active, is_default')
                .single());

            if (!storeError) break;
            if (isUniqueViolationError(storeError)) {
                if (String(storeError?.message || '').toLowerCase().includes('(name)')) {
                    throw new Error(`La tienda "${trimmedName}" ya existe.`);
                }
                candidateCode = `${toStoreCode(trimmedName).slice(0, 14)}_${Date.now().toString().slice(-4)}`;
                continue;
            }
            break;
        }

        if (!storeError && storeData?.id) {
            const { data: authData } = await supabase.auth.getUser();
            const currentUserId = authData?.user?.id || null;
            if (currentUserId) {
                const assignPayload: Record<string, any> = {
                    user_id: currentUserId,
                    store_id: storeData.id,
                    is_default: false,
                    can_sell: true,
                    can_manage_inventory: true
                };
                if (resolvedCompanyId) assignPayload.company_id = resolvedCompanyId;

                const { error: assignError } = await supabase
                    .from(USER_STORE_ASSIGNMENT_TABLE)
                    .upsert([assignPayload], { onConflict: 'user_id,store_id' });

                if (assignError && !isMissingTableError(assignError)) {
                    throw assignError;
                }
            }
        }
    }

    if (storeError && !isMissingTableError(storeError) && !isMissingColumnError(storeError)) {
        throw storeError;
    }

    // Compatibilidad legacy: sincronizar inventory_locations cuando exista
    try {
        const legacyPayload = { name: trimmedName };
        if (location.id) {
            await supabase
                .from(LOCATION_TABLE)
                .update(legacyPayload)
                .eq('id', location.id);
        } else {
            await supabase
                .from(LOCATION_TABLE)
                .insert([legacyPayload]);
        }
    } catch {
        // no-op: legacy table is optional
    }

    const resolved = storeData || {
        id: location.id || `location-${Date.now()}`,
        name: trimmedName,
        type: 'store',
        is_default: false
    };

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('valni:stores-updated'));
    }

    return {
        id: resolved.id,
        name: resolved.name,
        isSalePoint: resolved.type !== 'warehouse',
        isDefault: resolved.is_default ?? false
    };
};

export const deleteLocation = async (id: string): Promise<void> => {
    let deletedStoreName: string | null = null;

    const { data: storeRow } = await supabase
        .from(STORE_TABLE)
        .select('id, name')
        .eq('id', id)
        .maybeSingle();

    if (storeRow?.id) {
        deletedStoreName = storeRow.name;
        const { error: storeDeleteError } = await supabase
            .from(STORE_TABLE)
            .delete()
            .eq('id', id);

        if (storeDeleteError && !isMissingTableError(storeDeleteError)) {
            throw storeDeleteError;
        }
    }

    const { error } = await supabase.from(LOCATION_TABLE).delete().eq('id', id);
    if (error && !isMissingTableError(error)) {
        throw error;
    }

    if (deletedStoreName) {
        await supabase.from(LOCATION_TABLE).delete().eq('name', deletedStoreName);
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('valni:stores-updated'));
    }
};

export const replaceProductLocation = async (fromLocation: string, toLocation: string): Promise<void> => {
    const normalizedFromLocation = toTitleCase(fromLocation);
    const normalizedToLocation = toTitleCase(toLocation);
    if (!normalizedFromLocation || !normalizedToLocation || normalizedFromLocation === normalizedToLocation) {
        return;
    }

    const fromStoreId = await resolveStoreIdByName(normalizedFromLocation);
    const toStoreId = await resolveStoreIdByName(normalizedToLocation);

    if (fromStoreId && toStoreId) {
        const { data: fromBalances, error: fromError } = await supabase
            .from(INVENTORY_BALANCE_TABLE)
            .select('product_id, on_hand')
            .eq('store_id', fromStoreId)
            .gt('on_hand', 0);

        if (!fromError) {
            const balances = fromBalances || [];
            if (balances.length > 0) {
                const productIds = balances.map(row => row.product_id);
                const { data: toBalances, error: toError } = await supabase
                    .from(INVENTORY_BALANCE_TABLE)
                    .select('product_id, on_hand')
                    .eq('store_id', toStoreId)
                    .in('product_id', productIds);

                if (toError) throw toError;

                const toMap = new Map<string, number>();
                (toBalances || []).forEach(row => {
                    toMap.set(row.product_id, Number(row.on_hand || 0));
                });

                const upsertPayload = balances.map(row => ({
                    product_id: row.product_id,
                    store_id: toStoreId,
                    on_hand: (toMap.get(row.product_id) || 0) + Number(row.on_hand || 0)
                }));

                const { error: upsertError } = await supabase
                    .from(INVENTORY_BALANCE_TABLE)
                    .upsert(upsertPayload, { onConflict: 'product_id,store_id' });
                if (upsertError) throw upsertError;

                const { error: clearError } = await supabase
                    .from(INVENTORY_BALANCE_TABLE)
                    .update({ on_hand: 0 })
                    .eq('store_id', fromStoreId)
                    .in('product_id', productIds);
                if (clearError) throw clearError;
            }

            const { error: legacyLabelError } = await supabase
                .from('products')
                .update({ location_bin: normalizedToLocation })
                .eq('location_bin', normalizedFromLocation);
            if (legacyLabelError && !isMissingColumnError(legacyLabelError)) {
                throw legacyLabelError;
            }
            return;
        }

        if (!isMissingTableError(fromError)) {
            throw fromError;
        }
    }

    const { error } = await supabase
        .from('products')
        .update({ location_bin: normalizedToLocation })
        .eq('location_bin', normalizedFromLocation);

    if (error) throw error;
};

export const getBrands = async (): Promise<Brand[]> => {
    const { data, error } = await supabase.from('brands').select('*').order('name');
    if (error) throw error;
    return (data || []) as any;
};

export const saveBrand = async (brand: Partial<Brand>): Promise<Brand> => {
    const dbPayload = { name: toTitleCase(brand.name) };

    if (brand.id) {
        const { data, error } = await supabase.from('brands').update(dbPayload).eq('id', brand.id).select().single();
        if (error) throw error;
        return data as any;
    } else {
        const { data, error } = await supabase.from('brands').insert([dbPayload]).select().single();
        if (error) throw error;
        return data as any;
    }
};

export const deleteBrand = async (id: string): Promise<void> => {
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) throw error;
};

export const getModels = async (): Promise<Model[]> => {
    const { data, error } = await supabase.from('models').select('*').order('name');
    if (error) throw error;
    return (data || []).map(m => ({
        ...m,
        brandId: m.brand_id // Mapeo para compatibilidad UI
    })) as any;
};

export const saveModel = async (model: Partial<Model>): Promise<Model> => {
    const dbPayload = {
        name: toTitleCase(model.name),
        brand_id: model.brandId
    };

    if (model.id) {
        const { data, error } = await supabase.from('models').update(dbPayload).eq('id', model.id).select().single();
        if (error) throw error;
        return { ...data, brandId: data.brand_id } as any;
    } else {
        const { data, error } = await supabase.from('models').insert([dbPayload]).select().single();
        if (error) throw error;
        return { ...data, brandId: data.brand_id } as any;
    }
};

export const deleteModel = async (id: string): Promise<void> => {
    const { error } = await supabase.from('models').delete().eq('id', id);
    if (error) throw error;
};

export const getPaymentMethods = async (): Promise<PaymentMethodAdmin[]> => {
    const fallbackMethods: PaymentMethodAdmin[] = [
        { id: 1, name: 'Efectivo' },
        { id: 2, name: 'Tarjeta de Crédito' },
        { id: 3, name: 'Tarjeta de Débito' },
        { id: 4, name: 'Transferencia Bancaria' },
        { id: 5, name: 'Yape' },
        { id: 6, name: 'Plin' },
        { id: 7, name: 'Crédito' }
    ];

    let data: any[] | null = null;
    let error: any = null;
    ({ data, error } = await supabase
        .from('payment_methods')
        .select('id, name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }));

    if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('payment_methods')
            .select('id, name, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true }));
    }

    if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('payment_methods')
            .select('id, name')
            .order('name', { ascending: true }));
    }

    if (error) {
        if (isMissingTableError(error)) return fallbackMethods;
        throw error;
    }

    const toNumericId = (value: any, fallbackId: number): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallbackId;
    };

    const dbMethods = (data || [])
        .map((row, index) => ({
            id: toNumericId(row.id, 1000 + index),
            name: String(row.name || '').trim()
        }))
        .filter(method => !!method.name);

    if (dbMethods.length === 0) return fallbackMethods;

    // Cuando existe catálogo real en Supabase, no mezclar con fallback fijo.
    // Mezclar ambos genera colisiones de IDs si la empresa redefinió métodos base
    // (por ejemplo id=3 o id=4 con nombres distintos a los legacy).
    const uniqueDbMethods = new Map<string, PaymentMethodAdmin>();
    dbMethods.forEach(method => {
        const key = `${method.id}:${normalizeText(method.name)}`;
        if (!uniqueDbMethods.has(key)) {
            uniqueDbMethods.set(key, method);
        }
    });

    return Array.from(uniqueDbMethods.values());
};

export const savePaymentMethod = async (method: any): Promise<PaymentMethodAdmin> => {
    const methodName = toTitleCase(method?.name);
    if (!methodName) {
        throw new Error('El nombre del método es obligatorio.');
    }

    let existingData: any[] | null = null;
    let existingError: any = null;
    ({ data: existingData, error: existingError } = await supabase
        .from('payment_methods')
        .select('id, name')
        .ilike('name', methodName)
        .limit(1));

    if (existingError && !isMissingTableError(existingError)) {
        throw existingError;
    }

    if (existingData && existingData.length > 0) {
        const existing = existingData[0];
        return {
            id: Number.isFinite(Number(existing.id)) ? Number(existing.id) : 1000,
            name: String(existing.name || methodName).trim()
        };
    }

    let data: any = null;
    let error: any = null;
    ({ data, error } = await supabase
        .from('payment_methods')
        .insert([{ name: methodName, is_active: true }])
        .select('id, name')
        .single());

    if (error && isMissingColumnError(error)) {
        ({ data, error } = await supabase
            .from('payment_methods')
            .insert([{ name: methodName }])
            .select('id, name')
            .single());
    }

    if (error) {
        if (isMissingTableError(error)) {
            throw new Error('No existe la tabla payment_methods en la base de datos.');
        }
        const rawMessage = String(error?.message || '').toLowerCase();
        if (rawMessage.includes('duplicate') || rawMessage.includes('already exists')) {
            throw new Error('El método de pago ya existe.');
        }
        throw error;
    }

    return {
        id: Number.isFinite(Number(data.id)) ? Number(data.id) : 1000,
        name: String(data.name || methodName).trim()
    };
};

const resolveActiveCompanyIdForReceiptSettings = async (): Promise<string | null> => {
    const activeCompanyId = getActiveCompanyId();
    if (activeCompanyId) return activeCompanyId;

    const activeStoreId = getActiveStoreId();
    if (activeStoreId) {
        const companyIdFromStore = await resolveCompanyIdForStore(activeStoreId);
        if (companyIdFromStore) return companyIdFromStore;
    }

    const { data, error } = await supabase
        .from(COMPANY_TABLE)
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error) || isMissingColumnError(error)) return null;
        throw error;
    }

    return data?.id || null;
};

export const getReceiptHeader = async (): Promise<{ headerText: string; logoBase64: string | null }> => {
    const defaultHeader = 'VALNI PERU - Supabase ERP';

    const scopedCompanyId = await resolveActiveCompanyIdForReceiptSettings();
    if (!scopedCompanyId) {
        return { headerText: defaultHeader, logoBase64: null };
    }

    const { data, error } = await supabase
        .from(COMPANY_RECEIPT_SETTINGS_TABLE)
        .select('header_text, logo_base64')
        .eq('company_id', scopedCompanyId)
        .maybeSingle();

    if (error) {
        if (isMissingTableError(error) || isMissingColumnError(error) || isPermissionDeniedError(error)) {
            return { headerText: defaultHeader, logoBase64: null };
        }
        throw error;
    }

    return {
        headerText: String(data?.header_text || '').trim() || defaultHeader,
        logoBase64: data?.logo_base64 || null
    };
};

export const saveReceiptHeader = async (headerText: string, logoBase64: string | null = null): Promise<void> => {
    const scopedCompanyId = await resolveActiveCompanyIdForReceiptSettings();
    if (!scopedCompanyId) {
        throw new Error('No se pudo identificar la empresa activa para guardar el encabezado.');
    }

    const nextHeaderText = toSentenceCase(headerText) || 'Encabezado del recibo';
    const nextLogo = logoBase64 ? String(logoBase64) : null;

    const { error } = await supabase
        .from(COMPANY_RECEIPT_SETTINGS_TABLE)
        .upsert([{
            company_id: scopedCompanyId,
            header_text: nextHeaderText,
            logo_base64: nextLogo,
            updated_at: new Date().toISOString()
        }], { onConflict: 'company_id' });

    if (error) {
        if (isMissingTableError(error)) {
            throw new Error('Falta la tabla company_receipt_settings en Supabase. Ejecuta la migración correspondiente.');
        }
        throw error;
    }
};

// --- REPORTES ---
type AdvanceMovementQueryOptions = {
    start?: string;
    end?: string;
    storeId?: string | null;
    consolidated?: boolean;
};

const fetchAdvanceMovements = async (options?: AdvanceMovementQueryOptions): Promise<AdvanceMovement[]> => {
    const scopedCompanyId = getActiveCompanyId();
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    let query = supabase
        .from('advance_movements')
        .select(`
            *,
            advances (
                seller_id,
                profiles (full_name),
                customers (full_name)
            )
        `)
        .order('created_at', { ascending: false });

    if (options?.start) query = query.gte('created_at', options.start);
    if (options?.end) query = query.lte('created_at', options.end);
    if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
    if (scopedStoreId) query = query.eq('movement_store_id', scopedStoreId);

    let data: any[] | null = null;
    let error: any = null;
    ({ data, error } = await query);

    if (error && scopedStoreId && isMissingColumnError(error)) {
        let fallbackQuery = supabase
            .from('advance_movements')
            .select(`
                *,
                advances (
                    seller_id,
                    profiles (full_name),
                    customers (full_name)
                )
            `)
            .order('created_at', { ascending: false });
        if (options?.start) fallbackQuery = fallbackQuery.gte('created_at', options.start);
        if (options?.end) fallbackQuery = fallbackQuery.lte('created_at', options.end);
        if (scopedCompanyId) fallbackQuery = fallbackQuery.eq('company_id', scopedCompanyId);
        ({ data, error } = await fallbackQuery);
    }

    if (error) throw error;
    return (data || []).map(mapAdvanceMovement);
};

// Helper para mapear métodos de pago DB -> UI
const mapPaymentMethodFromDB = (method: string): string => {
    const normalized = normalizeText(method);
    const mapping: { [key: string]: string } = {
        'cash': 'Efectivo',
        'efectivo': 'Efectivo',
        'credit_card': 'Tarjeta de Crédito',
        'tarjeta de credito': 'Tarjeta de Crédito',
        'debit_card': 'Tarjeta de Débito',
        'tarjeta de debito': 'Tarjeta de Débito',
        'transfer': 'Transferencia Bancaria',
        'bank_transfer': 'Transferencia Bancaria',
        'transferencia': 'Transferencia Bancaria',
        'transferencia bancaria': 'Transferencia Bancaria',
        'yape': 'Yape',
        'plin': 'Plin',
        'credit_installment': 'Crédito',
        'credito': 'Crédito',
        'advance': 'Adelanto',
        'adelanto': 'Adelanto'
    };
    return mapping[normalized] || method;
};

const isCashPaymentMethod = (value?: string | null): boolean => {
    const normalized = normalizeText(value);
    return normalized === 'cash' || normalized === 'efectivo';
};

const isAdvancePaymentMethod = (value?: string | null): boolean => {
    const normalized = normalizeText(value);
    return normalized === 'adelanto' || normalized === 'advance';
};

const roundMoney = (value: number): number =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const SALE_ID_QUERY_BATCH_SIZE = 100;

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
    const safeChunkSize = Math.max(1, Number(chunkSize || 1));
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += safeChunkSize) {
        result.push(items.slice(index, index + safeChunkSize));
    }
    return result;
};

const selectBySaleIdsInBatches = async (
    table: string,
    selectClause: string,
    saleIds: string[],
    mutateQuery?: (query: any) => any
): Promise<any[]> => {
    const uniqueSaleIds = [...new Set((saleIds || []).filter(Boolean))];
    if (uniqueSaleIds.length === 0) return [];

    const batches = chunkArray(uniqueSaleIds, SALE_ID_QUERY_BATCH_SIZE);
    const rows: any[] = [];

    for (const batch of batches) {
        let query = supabase
            .from(table)
            .select(selectClause)
            .in('sale_id', batch);

        if (mutateQuery) {
            query = mutateQuery(query);
        }

        const { data, error } = await query;
        if (error) throw error;
        rows.push(...(data || []));
    }

    return rows;
};

const dedupeSerializedSaleDetails = <T extends {
    saleId?: string | null;
    productId?: string | null;
    quantity?: number | null;
    salePrice?: number | null;
    imei1?: string | null;
    serialNumber?: string | null;
}>(details: T[]): T[] => {
    const seen = new Set<string>();
    return details.filter((detail) => {
        const imei = String(detail.imei1 || '').trim();
        const serial = String(detail.serialNumber || '').trim();

        // Solo deduplicar líneas serializadas; evita afectar líneas genéricas válidas.
        if (!imei && !serial) return true;

        const key = [
            String(detail.saleId || ''),
            String(detail.productId || ''),
            imei,
            serial,
            String(Number(detail.quantity || 0)),
            String(Number(detail.salePrice || 0))
        ].join('|');

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const normalizePaymentsForReports = async (saleIds: string[], basePayments: PaymentDetail[]): Promise<PaymentDetail[]> => {
    if (saleIds.length === 0) return basePayments;

    const bySale = new Map<string, PaymentDetail[]>();
    const ensureSaleBucket = (saleId: string): PaymentDetail[] => {
        const current = bySale.get(saleId);
        if (current) return current;
        const next: PaymentDetail[] = [];
        bySale.set(saleId, next);
        return next;
    };

    (basePayments || []).forEach(payment => {
        if (!payment.saleId) return;
        ensureSaleBucket(payment.saleId).push({
            ...payment,
            amount: roundMoney(Number(payment.amount || 0))
        });
    });

    const consumeFromNonCreditCashLike = (saleId: string, amountToReclassify: number) => {
        let remaining = roundMoney(amountToReclassify);
        if (remaining <= 0) return;

        const bucket = ensureSaleBucket(saleId);
        const candidates = bucket.filter(payment =>
            !isCreditPaymentLabel(payment.paymentMethod) &&
            !isAdvancePaymentMethod(payment.paymentMethod)
        );

        const ordered = [
            ...candidates.filter(payment => isCashPaymentMethod(payment.paymentMethod)),
            ...candidates.filter(payment => !isCashPaymentMethod(payment.paymentMethod))
        ];

        for (const payment of ordered) {
            if (remaining <= 0) break;
            const current = roundMoney(Number(payment.amount || 0));
            if (current <= 0) continue;
            const consumed = Math.min(current, remaining);
            payment.amount = roundMoney(current - consumed);
            remaining = roundMoney(remaining - consumed);
        }
    };

    const addOrMergeDerivedPayment = (saleId: string, paymentMethod: string, amount: number) => {
        const normalizedMethod = normalizeText(paymentMethod);
        const bucket = ensureSaleBucket(saleId);
        const existing = bucket.find(payment => normalizeText(payment.paymentMethod) === normalizedMethod && !payment.isInstallment);
        if (existing) {
            existing.amount = roundMoney(Number(existing.amount || 0) + amount);
            return;
        }
        bucket.push({
            saleId,
            paymentMethod,
            amount: roundMoney(amount),
            isInstallment: false
        });
    };

    let creditsData: any[] | null = null;
    try {
        creditsData = await selectBySaleIdsInBatches('credits', 'sale_id, total_credit', saleIds);
    } catch (creditsError: any) {
        if (!isMissingTableError(creditsError) && !isMissingColumnError(creditsError) && !isPermissionDeniedError(creditsError)) {
            throw creditsError;
        }
    }

    const creditBySale = new Map<string, number>();
    (creditsData || []).forEach((row: any) => {
        const saleId = row?.sale_id;
        if (!saleId) return;
        const current = creditBySale.get(saleId) || 0;
        creditBySale.set(saleId, roundMoney(current + Number(row.total_credit || 0)));
    });

    creditBySale.forEach((expectedCreditAmount, saleId) => {
        const existingCredit = ensureSaleBucket(saleId)
            .filter(payment => isCreditPaymentLabel(payment.paymentMethod) && !payment.isInstallment)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const missingCredit = roundMoney(expectedCreditAmount - existingCredit);
        if (missingCredit <= 0) return;
        addOrMergeDerivedPayment(saleId, 'Crédito', missingCredit);
        consumeFromNonCreditCashLike(saleId, missingCredit);
    });

    let applicationsData: any[] | null = null;
    try {
        applicationsData = await selectBySaleIdsInBatches(
            'advance_movements',
            'sale_id, amount, movement_type',
            saleIds,
            (query: any) => query.eq('movement_type', 'application')
        );
    } catch (applicationsError: any) {
        if (!isMissingTableError(applicationsError) && !isMissingColumnError(applicationsError) && !isPermissionDeniedError(applicationsError)) {
            throw applicationsError;
        }
    }

    const appliedAdvanceBySale = new Map<string, number>();
    (applicationsData || []).forEach((row: any) => {
        const saleId = row?.sale_id;
        if (!saleId) return;
        const current = appliedAdvanceBySale.get(saleId) || 0;
        appliedAdvanceBySale.set(saleId, roundMoney(current + Number(row.amount || 0)));
    });

    appliedAdvanceBySale.forEach((expectedAdvanceAmount, saleId) => {
        const existingAdvance = ensureSaleBucket(saleId)
            .filter(payment => isAdvancePaymentMethod(payment.paymentMethod))
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const missingAdvance = roundMoney(expectedAdvanceAmount - existingAdvance);
        if (missingAdvance <= 0) return;
        addOrMergeDerivedPayment(saleId, 'Adelanto', missingAdvance);
        consumeFromNonCreditCashLike(saleId, missingAdvance);
    });

    return Array.from(bySale.values())
        .flat()
        .map(payment => ({ ...payment, amount: roundMoney(Number(payment.amount || 0)) }))
        .filter(payment => Number(payment.amount || 0) > 0.004);
};

// Helper interno para obtener todos los datos relacionados de ventas
type SalesQueryOptions = {
    storeId?: string | null;
    consolidated?: boolean;
};

const fetchSalesRelatedData = async (salesQuery: any, options?: SalesQueryOptions) => {
    const fallbackStoreIdForCompany = options?.storeId ?? getActiveStoreId();
    let scopedCompanyId = getActiveCompanyId();
    if (!scopedCompanyId && fallbackStoreIdForCompany) {
        scopedCompanyId = await resolveCompanyIdForStore(fallbackStoreIdForCompany);
    }
    let effectiveCompanyId = scopedCompanyId;
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    let baseSalesQuery = salesQuery
        .select(`
            *,
            customer:customers (id, full_name, doc_number, phone, address),
            seller:profiles!sales_seller_id_fkey (id, full_name, email, username, role, is_active)
        `)
        .order('created_at', { ascending: false });

    if (scopedCompanyId) {
        baseSalesQuery = baseSalesQuery.eq('company_id', scopedCompanyId);
    }

    if (scopedStoreId) {
        baseSalesQuery = baseSalesQuery.eq('store_id', scopedStoreId);
    }

    let salesData: any[] | null = null;
    let salesError: any = null;
    ({ data: salesData, error: salesError } = await baseSalesQuery);

    if (salesError && scopedStoreId && isMissingColumnError(salesError)) {
        let fallbackSalesQuery = salesQuery
            .select(`
                *,
                customer:customers (id, full_name, doc_number, phone, address),
                seller:profiles!sales_seller_id_fkey (id, full_name, email, username, role, is_active)
            `)
            .order('created_at', { ascending: false });

        if (scopedCompanyId) {
            fallbackSalesQuery = fallbackSalesQuery.eq('company_id', scopedCompanyId);
        }

        ({ data: salesData, error: salesError } = await fallbackSalesQuery);
    }

    // If relational join metadata is not available, fallback to plain sales query.
    if (salesError && (isMissingRelationError(salesError) || isMissingColumnError(salesError))) {
        let plainSalesQuery = salesQuery
            .select('*')
            .order('created_at', { ascending: false });

        if (scopedStoreId) {
            plainSalesQuery = plainSalesQuery.eq('store_id', scopedStoreId);
        }

        if (effectiveCompanyId) {
            plainSalesQuery = plainSalesQuery.eq('company_id', effectiveCompanyId);
        }

        ({ data: salesData, error: salesError } = await plainSalesQuery);
    }

    // Resilience: if active company is stale and returns no sales, retry without company filter.
    if (!salesError && scopedCompanyId && (salesData || []).length === 0) {
        let companyAgnosticQuery = salesQuery
            .select(`
                *,
                customers (id, full_name, doc_number, phone, address),
                profiles (id, full_name, email, username, role, is_active)
            `)
            .order('created_at', { ascending: false });

        if (scopedStoreId) {
            companyAgnosticQuery = companyAgnosticQuery.eq('store_id', scopedStoreId);
        }

        const { data: fallbackCompanyData, error: fallbackCompanyError } = await companyAgnosticQuery;
        if (!fallbackCompanyError && (fallbackCompanyData || []).length > 0) {
            salesData = fallbackCompanyData;
            effectiveCompanyId = null;
        }
    }

    if (salesError) throw salesError;

    const sales = (salesData || []).map((s: any) => ({
        id: s.id,
        date: s.created_at,
        customerId: s.customer_id,
        sellerId: s.seller_id,
        storeId: s.store_id || undefined,
        total: s.total_amount,
        status: s.status,
        customer: (s.customer || s.customers) ? {
            id: (s.customer || s.customers).id,
            fullName: (s.customer || s.customers).full_name,
            docNumber: (s.customer || s.customers).doc_number,
            dni: (s.customer || s.customers).doc_number,
            phone: (s.customer || s.customers).phone,
            address: (s.customer || s.customers).address
        } : undefined
    }));

    if (sales.length === 0) {
        return { sales: [], details: [], payments: [], products: [], users: [], customers: [] };
    }

    const saleIds = sales.map((s: any) => s.id);

    // Fetch details
    const itemsData = await selectBySaleIdsInBatches('sale_items', '*', saleIds);

    const details = dedupeSerializedSaleDetails((itemsData || []).map((i: any) => ({
        id: i.id,
        saleId: i.sale_id,
        productId: i.product_id,
        quantity: i.quantity,
        salePrice: i.unit_price,
        imei1: i.captured_imei,
        serialNumber: i.captured_serial
    })));

    // Fetch payments
    const paymentsData = await selectBySaleIdsInBatches('sale_payments', '*', saleIds);

    const rawPayments: PaymentDetail[] = (paymentsData || []).map((p: any) => ({
        saleId: p.sale_id,
        paymentMethod: String(p.payment_method_label || '').trim() || mapPaymentMethodFromDB(p.payment_method),
        amount: p.amount,
        isInstallment: !!p.credit_installment_id
    }));
    const payments = await normalizePaymentsForReports(saleIds, rawPayments);

    // 1. Customers - Extract from joined sales data to maintain compatibility
    let customers = sales.filter((s: any) => !!s.customer).map((s: any) => s.customer!);
    if (customers.length === 0) {
        const customerIds = [...new Set(sales.map((sale: any) => sale.customerId).filter(Boolean))];
        if (customerIds.length > 0) {
            const { data: customerRows, error: customerError } = await supabase
                .from('customers')
                .select('id, full_name, doc_number, phone, address')
                .in('id', customerIds);
            if (!customerError) {
                customers = (customerRows || []).map((row: any) => ({
                    id: row.id,
                    fullName: row.full_name,
                    docNumber: row.doc_number,
                    dni: row.doc_number,
                    phone: row.phone,
                    address: row.address
                }));
            }
        }
    }

    // 2. Users (Sellers) - Fetch all active profiles for filtering
    let profilesQuery = supabase.from('profiles').select('*').eq('is_active', true);
    if (effectiveCompanyId) {
        profilesQuery = profilesQuery.eq('company_id', effectiveCompanyId);
    }
    const { data: profilesData } = await profilesQuery;
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
    const productsData: any[] = [];
    if (productIds.length > 0) {
        const productBatches = chunkArray(productIds, 100);
        for (const batch of productBatches) {
            const { data } = await supabase.from('products').select('*').in('id', batch);
            if (data) productsData.push(...data);
        }
    }
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

    const advanceMovements = await fetchAdvanceMovements({
        storeId: scopedStoreId,
        consolidated: options?.consolidated
    });

    return { sales, details, payments, customers, users, products, advanceMovements };
};

export const getSalesData = async (options?: SalesQueryOptions): Promise<any> => {
    // Fetch all sales
    return await fetchSalesRelatedData(supabase.from('sales'), options);
};

export const getUsers = async (): Promise<User[]> => {
    const activeCompanyId = getActiveCompanyId();

    let profilesData: any[] | null = null;
    let profilesError: any = null;
    let profilesQuery = supabase
        .from('profiles')
        .select('*')
        .order('full_name');

    if (activeCompanyId) {
        profilesQuery = profilesQuery.eq('company_id', activeCompanyId);
    }

    ({ data: profilesData, error: profilesError } = await profilesQuery);

    if (profilesError && activeCompanyId && isMissingColumnError(profilesError)) {
        ({ data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name'));
    }

    if (profilesError) throw profilesError;

    const profileRows = profilesData || [];
    const profileIds = profileRows.map((p: any) => p.id).filter(Boolean);
    const assignmentsByUser = new Map<string, UserStoreAssignment[]>();

    if (profileIds.length > 0) {
        let assignmentData: any[] | null = null;
        let assignmentError: any = null;

        ({ data: assignmentData, error: assignmentError } = await supabase
            .from(USER_STORE_ASSIGNMENT_TABLE)
            .select(`
                id,
                user_id,
                store_id,
                company_id,
                is_default,
                can_sell,
                can_manage_inventory,
                store:stores (id, code, name, type, is_active, is_default)
            `)
            .in('user_id', profileIds)
            .order('is_default', { ascending: false }));

        if (assignmentError && isMissingColumnError(assignmentError)) {
            ({ data: assignmentData, error: assignmentError } = await supabase
                .from(USER_STORE_ASSIGNMENT_TABLE)
                .select(`
                    id,
                    user_id,
                    store_id,
                    is_default,
                    can_sell,
                    can_manage_inventory,
                    store:stores (id, code, name, type, is_active, is_default)
                `)
                .in('user_id', profileIds)
                .order('is_default', { ascending: false }));
        }

        if (assignmentError && !isMissingTableError(assignmentError)) {
            throw assignmentError;
        }

        (assignmentData || []).forEach((row: any) => {
            const mapped = mapUserStoreAssignmentRow(row);
            const current = assignmentsByUser.get(mapped.userId) || [];
            current.push(mapped);
            assignmentsByUser.set(mapped.userId, current);
        });
    }

    return profileRows.map((p: any) => {
        const assignments = assignmentsByUser.get(p.id) || [];
        const stores = assignments
            .map(assignment => assignment.store)
            .filter((store): store is Store => !!store);
        const activeStoreId = assignments.find(assignment => assignment.isDefault)?.storeId || assignments[0]?.storeId;

        return {
            id: p.id,
            email: p.email,
            fullName: p.full_name,
            username: p.username,
            role: p.role,
            isActive: p.is_active,
            stores,
            storeIds: assignments.map(assignment => assignment.storeId),
            activeStoreId
        };
    }) as any;
};

export const getDailyReportData = async (date: string, options?: SalesQueryOptions): Promise<any> => {
    // 1. Definir rango del día en hora local Lima (-05:00)
    const start = `${date}T00:00:00.000-05:00`;
    const end = `${date}T23:59:59.999-05:00`;
    const scopedCompanyId = getActiveCompanyId();
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());

    // 2. Traer VENTAS con JOINs de cliente y vendedor en una sola consulta
    let salesQuery = supabase
        .from('sales')
        .select(`
            *,
            customer:customers (id, full_name, doc_number, phone, address),
            seller:profiles!sales_seller_id_fkey (id, full_name, email, username, role, is_active)
        `)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });

    if (scopedCompanyId) {
        salesQuery = salesQuery.eq('company_id', scopedCompanyId);
    }

    if (scopedStoreId) {
        salesQuery = salesQuery.eq('store_id', scopedStoreId);
    }

    let salesData: any[] | null = null;
    let salesError: any = null;
    ({ data: salesData, error: salesError } = await salesQuery);
    if (salesError && scopedStoreId && isMissingColumnError(salesError)) {
        let fallbackDailySalesQuery = supabase
            .from('sales')
            .select(`
                *,
                customer:customers (id, full_name, doc_number, phone, address),
                seller:profiles!sales_seller_id_fkey (id, full_name, email, username, role, is_active)
            `)
            .gte('created_at', start)
            .lte('created_at', end)
            .order('created_at', { ascending: false });

        if (scopedCompanyId) {
            fallbackDailySalesQuery = fallbackDailySalesQuery.eq('company_id', scopedCompanyId);
        }

        ({ data: salesData, error: salesError } = await fallbackDailySalesQuery);
    }

    if (salesError) throw salesError;

    const sales = (salesData || []).map((s: any) => ({
        id: s.id,
        date: s.created_at,
        customerId: s.customer_id,
        sellerId: s.seller_id,
        storeId: s.store_id || undefined,
        total: s.total_amount,
        status: s.status,
        customer: s.customer ? {
            id: s.customer.id,
            fullName: s.customer.full_name,
            docNumber: s.customer.doc_number,
            dni: s.customer.doc_number,
            phone: s.customer.phone,
            address: s.customer.address
        } : undefined
    }));

    const saleIds = sales.map((s: any) => s.id);

    // 3. Traer DETALLES de todas las ventas del día
    let itemsData: any[] = [];
    if (saleIds.length > 0) {
        itemsData = await selectBySaleIdsInBatches('sale_items', '*', saleIds);
    }

    const details = dedupeSerializedSaleDetails((itemsData || []).map((i: any) => ({
        id: i.id,
        saleId: i.sale_id,
        productId: i.product_id,
        quantity: i.quantity,
        salePrice: i.unit_price,
        imei1: i.captured_imei,
        serialNumber: i.captured_serial
    })));

    // 4. Traer TODOS los pagos realizados en el día (incluyendo cobranza de cuotas)
    let paymentsQuery = supabase
        .from('sale_payments')
        .select(`
            *,
            sales (
                invoice_number,
                customers (full_name)
            )
        `)
        .gte('payment_date', start)
        .lte('payment_date', end);

    if (scopedCompanyId) {
        paymentsQuery = paymentsQuery.eq('company_id', scopedCompanyId);
    }

    if (scopedStoreId) {
        paymentsQuery = paymentsQuery.eq('payment_store_id', scopedStoreId);
    }

    let paymentsData: any[] | null = null;
    let paymentsError: any = null;
    ({ data: paymentsData, error: paymentsError } = await paymentsQuery);
    if (paymentsError && scopedStoreId && isMissingColumnError(paymentsError)) {
        if (saleIds.length > 0) {
            try {
                paymentsData = await selectBySaleIdsInBatches(
                    'sale_payments',
                    `
                        *,
                        sales (
                            invoice_number,
                            customers (full_name)
                        )
                    `,
                    saleIds,
                    (query: any) => query
                        .gte('payment_date', start)
                        .lte('payment_date', end)
                );
                paymentsError = null;
            } catch (fallbackPaymentsError: any) {
                paymentsError = fallbackPaymentsError;
            }
        } else {
            paymentsData = [];
            paymentsError = null;
        }
    }

    if (paymentsError) throw paymentsError;

    const rawDailyPayments: PaymentDetail[] = (paymentsData || []).map((p: any) => ({
        id: p.id,
        saleId: p.sale_id,
        paymentMethod: String(p.payment_method_label || '').trim() || mapPaymentMethodFromDB(p.payment_method),
        amount: p.amount,
        isInstallment: !!p.credit_installment_id,
        paymentStoreId: p.payment_store_id || undefined,
        saleInvoice: p.sales?.invoice_number,
        customerName: p.sales?.customers?.full_name
    }));
    const payments = await normalizePaymentsForReports(saleIds, rawDailyPayments);

    const advanceMovements = await fetchAdvanceMovements({
        start,
        end,
        storeId: scopedStoreId,
        consolidated: options?.consolidated
    });

    // 5. Preparar PRODUCTOS únicos para las descripciones
    const productIds = [...new Set(details.map((d: any) => d.productId))];
    const productsData: any[] = [];
    if (productIds.length > 0) {
        const productBatches = chunkArray(productIds, 100);
        for (const batch of productBatches) {
            const { data } = await supabase.from('products').select('*').in('id', batch);
            if (data) productsData.push(...data);
        }
    }
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

    // 6. Preparar VENDEDORES únicos (vía profiles)
    let dailyProfilesQuery = supabase.from('profiles').select('*').eq('is_active', true);
    if (scopedCompanyId) {
        dailyProfilesQuery = dailyProfilesQuery.eq('company_id', scopedCompanyId);
    }
    const { data: profilesData } = await dailyProfilesQuery;
    const users = (profilesData || []).map((p: any) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        username: p.username,
        role: p.role,
        isActive: p.is_active
    }));

    // 7. Preparar CLIENTES únicos (vía joined data)
    const customers = sales.filter((s: any) => !!s.customer).map((s: any) => s.customer!);

    return { sales, details, payments, customers, users, products, advanceMovements };
};

// --- ÓRDENES DE COMPRA (PEDIDOS) ---
export const receivePurchaseOrder = async (
    orderId: string,
    options?: { notes?: string; userId?: string | null }
): Promise<{ receiptId: string }> => {
    const nextOrderId = String(orderId || '').trim();
    if (!nextOrderId) {
        throw new Error('Pedido inválido para recepción.');
    }

    const { data: orderRow, error: orderError } = await supabase
        .from('purchase_orders')
        .select('id, company_id, supplier_id, warehouse_id, store_id, status')
        .eq('id', nextOrderId)
        .single();

    if (orderError) throw orderError;
    if (!orderRow) throw new Error('No se encontró el pedido.');
    if (orderRow.status === 'cancelled') throw new Error('No se puede recepcionar un pedido cancelado.');
    if (orderRow.status === 'received') throw new Error('El pedido ya fue recepcionado.');
    if (!orderRow.supplier_id) throw new Error('Debes asignar proveedor antes de recepcionar el pedido.');

    let itemRows: any[] | null = null;
    let itemsError: any = null;
    ({ data: itemRows, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, quantity, unit_price, variant_id')
        .eq('purchase_order_id', nextOrderId)
        .order('created_at', { ascending: true }));

    if (itemsError && isMissingColumnError(itemsError, 'variant_id')) {
        ({ data: itemRows, error: itemsError } = await supabase
            .from('purchase_order_items')
            .select('id, product_id, quantity, unit_price')
            .eq('purchase_order_id', nextOrderId)
            .order('created_at', { ascending: true }));
        itemRows = (itemRows || []).map((row: any) => ({ ...row, variant_id: null }));
    }

    if (itemsError) throw itemsError;
    if (!itemRows || itemRows.length === 0) {
        throw new Error('El pedido no tiene líneas para recepcionar.');
    }

    const productIds = [...new Set(itemRows.map((row: any) => row.product_id).filter(Boolean))];
    const variantsByProduct = new Map<string, string>();
    if (productIds.length > 0) {
        const { data: variantsData, error: variantsError } = await supabase
            .from(PRODUCT_VARIANT_TABLE)
            .select('id, product_id, active, created_at')
            .in('product_id', productIds)
            .order('active', { ascending: false })
            .order('created_at', { ascending: true });

        if (variantsError && !isMissingTableError(variantsError)) {
            throw variantsError;
        }

        (variantsData || []).forEach((row: any) => {
            if (!row.product_id || variantsByProduct.has(row.product_id)) return;
            variantsByProduct.set(row.product_id, row.id);
        });
    }

    const rpcItems: Array<Record<string, any>> = [];
    const patchedVariantRows: Array<{ id: string; variant_id: string }> = [];

    for (const row of itemRows) {
        const qty = Math.max(0, Number(row.quantity || 0));
        if (qty <= 0) continue;
        const unitCost = Number(row.unit_price || 0);
        if (unitCost <= 0) {
            throw new Error('Todas las líneas del pedido deben tener precio de compra mayor a 0 antes de recepcionar.');
        }

        const variantId = row.variant_id || variantsByProduct.get(row.product_id) || null;
        if (!variantId) {
            throw new Error(`No se encontró variante para el producto ${row.product_id}.`);
        }

        rpcItems.push({
            variant_id: variantId,
            qty,
            unit_cost: unitCost
        });

        if (!row.variant_id) {
            patchedVariantRows.push({ id: row.id, variant_id: variantId });
        }
    }

    if (rpcItems.length === 0) {
        throw new Error('No hay cantidades válidas para recepcionar.');
    }

    // Guardar variant_id en líneas antiguas para evitar resolverlo cada vez.
    for (const patchRow of patchedVariantRows) {
        const { error: patchError } = await supabase
            .from('purchase_order_items')
            .update({ variant_id: patchRow.variant_id })
            .eq('id', patchRow.id);
        if (patchError && !isMissingColumnError(patchError, 'variant_id')) {
            throw patchError;
        }
    }

    let resolvedCompanyId: string | null =
        orderRow.company_id || getActiveCompanyId() || null;
    if (!resolvedCompanyId && orderRow.store_id) {
        resolvedCompanyId = await resolveCompanyIdForStore(orderRow.store_id);
    }
    if (!resolvedCompanyId) {
        const { data: companyData } = await supabase
            .from(COMPANY_TABLE)
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        resolvedCompanyId = companyData?.id || null;
    }
    if (!resolvedCompanyId) {
        throw new Error('No se pudo resolver company_id para recepcionar el pedido.');
    }

    const resolvedWarehouseId = orderRow.warehouse_id || getActiveWarehouseId() || null;

    let resolvedUserId = options?.userId || null;
    if (!resolvedUserId) {
        const { data: authData } = await supabase.auth.getUser();
        resolvedUserId = authData?.user?.id || null;
    }
    if (resolvedUserId && String(resolvedUserId).startsWith('00000000')) {
        resolvedUserId = null;
    }

    const { data: receiptId, error: rpcError } = await supabase.rpc('rpc_receive_purchase', {
        p_company_id: resolvedCompanyId,
        p_purchase_order_id: nextOrderId,
        p_warehouse_id: resolvedWarehouseId,
        p_items: rpcItems,
        p_user_id: resolvedUserId,
        p_notes: options?.notes || null
    });

    if (rpcError) {
        const message = getSupabaseErrorMessage(rpcError).toLowerCase();
        if (message.includes('rpc_receive_purchase') && message.includes('does not exist')) {
            throw new Error('No existe rpc_receive_purchase en la base de datos. Ejecuta las migraciones de Fase 3/Fase 4.');
        }
        throw rpcError;
    }

    // Refresca costo referencial de producto (buy_price) con el último costo de recepción.
    for (const row of itemRows) {
        const productId = row.product_id;
        const unitCost = Number(row.unit_price || 0);
        if (!productId || unitCost <= 0) continue;
        const { error: buyPriceError } = await supabase
            .from('products')
            .update({ buy_price: unitCost, updated_at: new Date().toISOString() })
            .eq('id', productId);
        if (buyPriceError && !isMissingColumnError(buyPriceError, 'buy_price')) {
            throw buyPriceError;
        }
    }

    return { receiptId: String(receiptId || '') };
};

export const getPurchaseOrders = async (options?: SalesQueryOptions): Promise<PurchaseOrder[]> => {
    const scopedStoreId = options?.consolidated ? null : (options?.storeId ?? getActiveStoreId());
    const scopedWarehouseId = options?.consolidated ? null : getActiveWarehouseId();
    let query = supabase
        .from('purchase_orders')
        .select(`
            *,
            suppliers (name),
            profiles (full_name)
        `)
        .order('created_at', { ascending: false });

    if (scopedStoreId) {
        query = query.eq('store_id', scopedStoreId);
    }
    if (scopedWarehouseId) {
        query = query.eq('warehouse_id', scopedWarehouseId);
    }

    let ordersData: any[] | null = null;
    let ordersError: any = null;
    ({ data: ordersData, error: ordersError } = await query);
    if (ordersError && (scopedStoreId || scopedWarehouseId) && isMissingColumnError(ordersError)) {
        ({ data: ordersData, error: ordersError } = await supabase
            .from('purchase_orders')
            .select(`
                *,
                suppliers (name),
                profiles (full_name)
            `)
            .order('created_at', { ascending: false }));
    }

    if (ordersError) throw ordersError;

    return (ordersData || []).map(o => ({
        id: o.id,
        date: o.order_date,
        status: o.status,
        supplierId: o.supplier_id,
        supplierName: o.suppliers?.name,
        totalAmount: o.total_cost,
        storeId: o.store_id || undefined,
        warehouseId: o.warehouse_id || undefined,
        createdBy: o.profiles?.full_name || 'N/A',
        items: []
    })) as any;
};

export const getSuppliers = async (): Promise<any[]> => {
    const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');

    if (error) throw error;
    return data || [];
};

export const saveSupplier = async (supplier: { name: string }): Promise<{ id: string; name: string }> => {
    const nextName = toTitleCase(supplier?.name);
    if (!nextName) {
        throw new Error('El nombre del proveedor es obligatorio.');
    }

    const companyId = getActiveCompanyId();
    const payload: Record<string, any> = {
        name: nextName
    };
    if (companyId) payload.company_id = companyId;

    let { data, error } = await supabase
        .from('suppliers')
        .insert([payload])
        .select('id, name')
        .single();

    if (error && isMissingColumnError(error)) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.company_id;
        ({ data, error } = await supabase
            .from('suppliers')
            .insert([fallbackPayload])
            .select('id, name')
            .single());
    }

    if (error && isUniqueViolationError(error)) {
        throw new Error(`El proveedor "${nextName}" ya existe.`);
    }
    if (error) throw error;

    return {
        id: String(data.id),
        name: String(data.name || nextName)
    };
};

export const savePurchaseOrder = async (order: Partial<PurchaseOrder>): Promise<any> => {
    const createdBy = (order.createdBy && order.createdBy.startsWith('00000000')) ? null : order.createdBy;
    const scopedStoreId = order.storeId ?? getActiveStoreId();
    const scopedWarehouseId = order.warehouseId ?? getActiveWarehouseId();

    // 1. Insert order header
    let orderData: any = null;
    let orderError: any = null;
    ({ data: orderData, error: orderError } = await supabase
        .from('purchase_orders')
        .insert([{
            supplier_id: order.supplierId || null,
            total_cost: order.totalAmount,
            status: order.status || 'pending',
            store_id: scopedStoreId || null,
            warehouse_id: scopedWarehouseId || null,
            created_by: createdBy // UUID real o null
        }])
        .select()
        .single());

    if (orderError && isMissingColumnError(orderError)) {
        ({ data: orderData, error: orderError } = await supabase
            .from('purchase_orders')
            .insert([{
                supplier_id: order.supplierId || null,
                total_cost: order.totalAmount,
                status: order.status || 'pending',
                warehouse_id: scopedWarehouseId || null,
                created_by: createdBy
            }])
            .select()
            .single());

        if (orderError && isMissingColumnError(orderError, 'warehouse_id')) {
            ({ data: orderData, error: orderError } = await supabase
                .from('purchase_orders')
                .insert([{
                    supplier_id: order.supplierId || null,
                    total_cost: order.totalAmount,
                    status: order.status || 'pending',
                    created_by: createdBy
                }])
                .select()
                .single());
        }
    }

    if (orderError) throw orderError;

    // 2. Insert order items
    if (order.items && order.items.length > 0) {
        const formattedItems = order.items.map(item => ({
            purchase_order_id: orderData.id,
            product_id: item.productId,
            product_name: toTitleCase(item.productName),
            brand: toTitleCase(item.brand),
            model: toTitleCase(item.model),
            quantity: item.suggestedOrder,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            specifications: toNullableSentenceCase(item.specifications),
            notes: toNullableSentenceCase(item.notes)
        }));

        const { error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(formattedItems);

        if (itemsError) throw itemsError;
    }

    return orderData;
};

export const getPurchaseOrderItems = async (orderId: string): Promise<any[]> => {
    const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
            *,
            products (name)
        `)
        .eq('purchase_order_id', orderId);

    if (itemsError) throw itemsError;

    return (itemsData || []).map(i => ({
        id: i.id,
        variantId: i.variant_id || undefined,
        productId: i.product_id,
        productName: i.product_name || i.products?.name,
        brand: i.brand,
        model: i.model,
        currentStock: 0,
        minStock: 0,
        suggestedOrder: i.quantity,
        unitPrice: i.unit_price,
        totalPrice: i.total_price,
        specifications: i.specifications,
        notes: i.notes
    }));
};

export const updatePurchaseOrder = async (orderId: string, updates: any): Promise<any> => {
    const headerPayload: any = {};

    if (updates.status !== undefined) headerPayload.status = updates.status;
    if (updates.supplierId !== undefined) headerPayload.supplier_id = updates.supplierId;
    if (updates.totalAmount !== undefined) headerPayload.total_cost = updates.totalAmount;
    if (updates.storeId !== undefined) headerPayload.store_id = updates.storeId;
    if (updates.warehouseId !== undefined) headerPayload.warehouse_id = updates.warehouseId;

    if (updates.items && Array.isArray(updates.items)) {
        headerPayload.total_cost = updates.items.reduce(
            (sum: number, item: any) => sum + ((Number(item.unitPrice) || 0) * (Number(item.suggestedOrder) || 0)),
            0
        );
    }

    let updatedOrder: any = null;

    if (Object.keys(headerPayload).length > 0) {
        let data: any = null;
        let error: any = null;
        ({ data, error } = await supabase
            .from('purchase_orders')
            .update(headerPayload)
            .eq('id', orderId)
            .select()
            .single());

        if (error && isMissingColumnError(error) && Object.prototype.hasOwnProperty.call(headerPayload, 'store_id')) {
            const fallbackPayload = { ...headerPayload };
            delete fallbackPayload.store_id;
            ({ data, error } = await supabase
                .from('purchase_orders')
                .update(fallbackPayload)
                .eq('id', orderId)
                .select()
                .single());
        }

        if (error && isMissingColumnError(error) && Object.prototype.hasOwnProperty.call(headerPayload, 'warehouse_id')) {
            const fallbackPayload = { ...headerPayload };
            delete fallbackPayload.warehouse_id;
            ({ data, error } = await supabase
                .from('purchase_orders')
                .update(fallbackPayload)
                .eq('id', orderId)
                .select()
                .single());
        }

        if (error) throw error;
        updatedOrder = data;
    }

    if (updates.items && Array.isArray(updates.items)) {
        const { error: deleteError } = await supabase
            .from('purchase_order_items')
            .delete()
            .eq('purchase_order_id', orderId);

        if (deleteError) throw deleteError;

        if (updates.items.length > 0) {
            const formattedItems = updates.items.map((item: any) => ({
                purchase_order_id: orderId,
                product_id: item.productId || null,
                product_name: toTitleCase(item.productName || ''),
                brand: toTitleCase(item.brand || ''),
                model: toTitleCase(item.model || ''),
                quantity: Number(item.suggestedOrder) || 0,
                unit_price: Number(item.unitPrice) || 0,
                total_price: (Number(item.unitPrice) || 0) * (Number(item.suggestedOrder) || 0),
                specifications: toNullableSentenceCase(item.specifications),
                notes: toNullableSentenceCase(item.notes)
            }));

            const { error: insertError } = await supabase
                .from('purchase_order_items')
                .insert(formattedItems);

            if (insertError) throw insertError;
        }
    }

    if (updatedOrder) return updatedOrder;

    const { data: orderData, error: orderError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', orderId)
        .single();

    if (orderError) throw orderError;
    return orderData;
};
