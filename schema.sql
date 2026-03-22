-- ############################################################################
-- PROYECTO: Celullar ERP - Sistema de Gestión Integral
-- DESCRIPCIÓN: Rediseño estructural de alto rendimiento para Supabase (PostgreSQL)
-- ############################################################################

-- 1. EXTENSIONES Y SEGURIDAD INICIAL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPOS PERSONALIZADOS (ENUMS) - Garantizan integridad de datos
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'seller', 'inventory_manager', 'store_admin', 'cashier', 'warehouse', 'auditor');
CREATE TYPE product_type AS ENUM ('smartphone', 'tablet', 'accessory', 'part', 'service');
CREATE TYPE sale_status AS ENUM ('draft', 'completed', 'voided', 'returned');
CREATE TYPE payment_method_type AS ENUM ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'credit_installment');
CREATE TYPE order_status AS ENUM ('draft', 'pending', 'approved', 'received', 'cancelled');
CREATE TYPE document_type AS ENUM ('DNI', 'CE', 'RUC', 'PASAPORTE');

-- 3. ESQUEMA DE AUDITORÍA (Tracking de cambios)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Función genérica para disparar auditoría
CREATE OR REPLACE FUNCTION process_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs(table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, OLD.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs(table_name, record_id, action, old_data, user_id)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. TABLAS DE SEGURIDAD Y PERFILES
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    role user_role DEFAULT 'seller' NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. CATÁLOGOS Y MAESTROS (Normalización)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id),
    name TEXT NOT NULL,
    technical_specs JSONB, -- Flexibilidad para specs variadas
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(brand_id, name)
);

-- 6. GESTIÓN DE PRODUCTOS E INVENTARIO
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT UNIQUE, -- Código SKU para accesorios
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    type product_type NOT NULL,
    name TEXT NOT NULL, -- Nombre comercial para accesorios/repuestos
    description TEXT,
    
    -- Especificaciones de equipos (Nullables para accesorios)
    color TEXT,
    ram TEXT,
    rom TEXT,
    imei_1 TEXT UNIQUE,
    imei_2 TEXT UNIQUE,
    serial_number TEXT, -- No único por lo discutido previamente
    
    -- Precios y Stock
    buy_price NUMERIC(12,2) DEFAULT 0, -- Precio costo
    sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_sell_price NUMERIC(12,2),
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 5,
    
    status TEXT DEFAULT 'available', -- available, sold, in_repair, defective
    location_bin TEXT, -- Ubicación física (Gaveta A, Almacén 1)
    
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_imei ON products(imei_1) WHERE imei_1 IS NOT NULL;
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- 7. CLIENTES
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_type document_type DEFAULT 'DNI',
    doc_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    tags TEXT[], -- ['VIP', 'Mayorista']
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. VENTAS Y FINANZAS
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT UNIQUE, -- Correlativo (BO001-00001)
    customer_id UUID REFERENCES customers(id),
    seller_id UUID REFERENCES profiles(id),
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status sale_status DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL,
    -- Captura estática de specs al momento de venta para historial
    captured_imei TEXT,
    captured_serial TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sale_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    payment_method payment_method_type NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reference_number TEXT, -- Nro de operación/voucher
    payment_date TIMESTAMPTZ DEFAULT now()
);

-- 9. CAJA (Control de sesiones de venta)
CREATE TABLE cash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opened_by UUID REFERENCES profiles(id),
    closed_by UUID REFERENCES profiles(id),
    opening_balance NUMERIC(12,2) DEFAULT 0,
    closing_balance_system NUMERIC(12,2) DEFAULT 0,
    closing_balance_actual NUMERIC(12,2) DEFAULT 0,
    difference NUMERIC(12,2) DEFAULT 0,
    status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    observations TEXT,
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ
);

-- 10. PROVEEDORES Y ABASTECIMIENTO
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    ruc_dni TEXT UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID REFERENCES suppliers(id),
    order_date DATE DEFAULT CURRENT_DATE,
    expected_date DATE,
    total_cost NUMERIC(12,2) DEFAULT 0,
    status order_status DEFAULT 'draft',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. REGISTRO DE INCIDENTES (Alertas WhatsApp)
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    payload JSONB, -- Data para el mensaje de WhatsApp
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. TRIGGERS AUTOMÁTICOS DE NEGOCIO

-- A. Actualizar stock al vender
CREATE OR REPLACE FUNCTION handle_after_sale_item_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET stock_quantity = stock_quantity - NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id;
    
    -- Notificación inmediata de stock bajo
    IF EXISTS (SELECT 1 FROM products WHERE id = NEW.product_id AND stock_quantity <= min_stock_alert AND type = 'accessory') THEN
        INSERT INTO incidents (type, severity, description, payload)
        VALUES ('STOCK_CRITICO', 'high', 'Stock por agotarse en accesorio: ' || (SELECT name FROM products WHERE id = NEW.product_id), to_jsonb(NEW));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_after_sale_item_insert
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION handle_after_sale_item_insert();

-- B. Triggers de Auditoría Automática
CREATE TRIGGER trg_audit_products AFTER UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION process_audit_log();
CREATE TRIGGER trg_audit_sales AFTER UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION process_audit_log();
CREATE TRIGGER trg_audit_cash AFTER UPDATE OR DELETE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION process_audit_log();

-- 13. POLÍTICAS DE SEGURIDAD AVANZADA (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven sus propios perfiles, admins ven todo
CREATE POLICY "Profiles visibility" ON profiles FOR SELECT USING (auth.uid() = id OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Vendedores pueden ver productos, solo admins gestionan
CREATE POLICY "Products viewable by authenticated" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Products managed by admins" ON products FOR ALL TO authenticated 
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'inventory_manager'));

-- Ventas: Vendedores ven sus propias ventas, supervisor/admin ve todo
CREATE POLICY "Sales access" ON sales FOR SELECT TO authenticated 
    USING (seller_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor'));

-- Registro de Auditoría: Solo Admins
CREATE POLICY "Auditing strictly for admins" ON audit_logs FOR SELECT TO authenticated 
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 14. VISTAS DE NEGOCIO (Reporting Simplificado)
CREATE VIEW view_daily_sales_summary AS
SELECT 
    date_trunc('day', created_at) as sale_day,
    COUNT(id) as total_transactions,
    SUM(total_amount) as grand_total,
    SUM(tax_amount) as total_tax
FROM sales
WHERE status = 'completed'
GROUP BY 1;

-- 15. UBICACIONES DE INVENTARIO (Administrables)
CREATE TABLE IF NOT EXISTS inventory_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    is_sale_point BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO inventory_locations (name, is_sale_point, is_default)
VALUES
    ('Tienda', true, true),
    ('Almacen', true, false)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory locations viewable by authenticated" ON inventory_locations
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inventory locations managed by admins" ON inventory_locations
FOR ALL TO authenticated
USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'inventory_manager'));

-- 16. ADELANTOS / PREVENTAS
CREATE TABLE IF NOT EXISTS advances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    seller_id UUID REFERENCES profiles(id),
    kind TEXT NOT NULL DEFAULT 'a_cuenta' CHECK (kind IN ('reserva_stock', 'pedido_especial', 'a_cuenta')),
    target_product_id UUID REFERENCES products(id),
    target_product_name TEXT,
    expected_delivery_date DATE,
    notes TEXT,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    applied_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'cancelled', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS advance_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    advance_id UUID NOT NULL REFERENCES advances(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('payment', 'application', 'refund', 'adjustment')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT,
    reference_number TEXT,
    sale_id UUID REFERENCES sales(id),
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advances_customer ON advances(customer_id);
CREATE INDEX IF NOT EXISTS idx_advances_status ON advances(status);
CREATE INDEX IF NOT EXISTS idx_advance_movements_advance ON advance_movements(advance_id);

ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE advance_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advances viewable by authenticated" ON advances
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advances insertable by authenticated" ON advances
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Advances updatable by admins_or_seller" ON advances
FOR UPDATE TO authenticated
USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'seller', 'inventory_manager'));

CREATE POLICY "Advance movements viewable by authenticated" ON advance_movements
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Advance movements insertable by authenticated" ON advance_movements
FOR INSERT TO authenticated WITH CHECK (true);

-- 17. MULTI-TIENDA (2026-02-25)
-- Nota: la migracion completa esta en migrations/2026-02-25_multistore_and_document_series.sql
-- Este bloque mantiene schema.sql alineado a los cambios de produccion.

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'store' CHECK (type IN ('store', 'warehouse')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_store_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false,
    can_sell BOOLEAN NOT NULL DEFAULT true,
    can_manage_inventory BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, store_id)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(product_id, store_id)
);

CREATE TABLE IF NOT EXISTS store_document_series (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    series TEXT NOT NULL,
    current_number BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(store_id, document_type, series)
);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'Recibo de Venta';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_series TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_number BIGINT;

ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS payment_store_id UUID REFERENCES stores(id);
ALTER TABLE advances ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE advance_movements ADD COLUMN IF NOT EXISTS movement_store_id UUID REFERENCES stores(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

-- 18. BLUEPRINT FASE 1 (2026-02-26): MULTIEMPRESA + ALMACENES + VARIANTES
-- Nota: la migracion completa esta en migrations/2026-02-26_phase1_blueprint_foundations.sql

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'main' CHECK (type IN ('store_floor', 'main', 'service', 'virtual')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_code TEXT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, product_id, variant_code)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE user_store_assignments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE store_document_series ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE models ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE advances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE advance_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE credits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

DO $$
BEGIN
    IF to_regclass('public.credit_installments') IS NOT NULL THEN
        ALTER TABLE credit_installments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.purchase_order_items') IS NOT NULL THEN
        ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
        ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
    END IF;
END $$;

-- 19. BLUEPRINT FASE 2 (2026-02-26): KARDEX + SERIALIZADOS + TURNOS POS
-- Nota: la migracion completa esta en migrations/2026-02-26_phase2_kardex_and_serialization.sql

CREATE TABLE IF NOT EXISTS stock_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, warehouse_id, variant_id)
);

CREATE TABLE IF NOT EXISTS serialized_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    serial TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'sold', 'returned', 'damaged')),
    cost NUMERIC(12,2) DEFAULT 0,
    received_at TIMESTAMPTZ,
    sold_sale_id UUID REFERENCES sales(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, serial)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'purchase_receipt',
        'sale',
        'sale_void',
        'refund',
        'transfer_out',
        'transfer_in',
        'adjustment',
        'opening_balance'
    )),
    warehouse_id UUID REFERENCES warehouses(id),
    store_id UUID REFERENCES stores(id),
    ref_table TEXT,
    ref_id UUID,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movement_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL,
    unit_cost NUMERIC(12,2) DEFAULT 0,
    serialized_item_id UUID REFERENCES serialized_items(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    opened_by UUID REFERENCES profiles(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
    closed_by UUID REFERENCES profiles(id),
    closed_at TIMESTAMPTZ,
    closing_cash NUMERIC(12,2),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES pos_shifts(id);

-- 20. BLUEPRINT FASE 3 (2026-02-26): RPCS TRANSACCIONALES POS/INVENTARIO
-- Nota: la migracion completa esta en migrations/2026-02-26_phase3_transactional_rpcs.sql

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id),
    warehouse_id UUID REFERENCES warehouses(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RPCs blueprint implementados en la migracion:
-- rpc_create_sale(...)
-- rpc_void_sale(...)
-- rpc_transfer_stock(...)
-- rpc_adjust_stock(...)
-- rpc_receive_purchase(...)
-- process_sale_atomic(...) wrappers de compatibilidad

-- 21. BLUEPRINT FASE 4 (2026-02-26): RLS + AUDITORIA + SEGURIDAD RPC
-- Nota: la migracion completa esta en migrations/2026-02-26_phase4_rls_audit_and_security.sql

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    "before" JSONB,
    "after" JSONB,
    notes TEXT
);
