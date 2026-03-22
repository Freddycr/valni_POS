-- Blueprint Phase 1 foundations
-- Date: 2026-02-26
-- Scope: companies + warehouses + product_variants + company_id propagation
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO companies (name)
SELECT 'VALNI'
WHERE NOT EXISTS (SELECT 1 FROM companies);

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

CREATE INDEX IF NOT EXISTS idx_warehouses_company_store ON warehouses(company_id, store_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_active ON warehouses(company_id, active);

DO $$
DECLARE
    v_default_company UUID;
BEGIN
    SELECT id INTO v_default_company
    FROM companies
    ORDER BY created_at ASC
    LIMIT 1;

    -- Add company_id to business tables (when present)
    IF to_regclass('public.profiles') IS NOT NULL THEN
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.stores') IS NOT NULL THEN
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.user_store_assignments') IS NOT NULL THEN
        ALTER TABLE user_store_assignments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.inventory_balances') IS NOT NULL THEN
        ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.store_document_series') IS NOT NULL THEN
        ALTER TABLE store_document_series ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.brands') IS NOT NULL THEN
        ALTER TABLE brands ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.models') IS NOT NULL THEN
        ALTER TABLE models ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.categories') IS NOT NULL THEN
        ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.products') IS NOT NULL THEN
        ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.customers') IS NOT NULL THEN
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.sales') IS NOT NULL THEN
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
    END IF;
    IF to_regclass('public.sale_items') IS NOT NULL THEN
        ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.sale_payments') IS NOT NULL THEN
        ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.suppliers') IS NOT NULL THEN
        ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.purchase_orders') IS NOT NULL THEN
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
    END IF;
    IF to_regclass('public.purchase_order_items') IS NOT NULL THEN
        ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.advances') IS NOT NULL THEN
        ALTER TABLE advances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.advance_movements') IS NOT NULL THEN
        ALTER TABLE advance_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.credits') IS NOT NULL THEN
        ALTER TABLE credits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.credit_installments') IS NOT NULL THEN
        ALTER TABLE credit_installments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
    END IF;
    IF to_regclass('public.cash_sessions') IS NOT NULL THEN
        ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
        ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
    END IF;

    -- Backfill company_id with default company
    IF to_regclass('public.profiles') IS NOT NULL THEN UPDATE profiles SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.stores') IS NOT NULL THEN UPDATE stores SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.user_store_assignments') IS NOT NULL THEN UPDATE user_store_assignments SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.inventory_balances') IS NOT NULL THEN UPDATE inventory_balances SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.store_document_series') IS NOT NULL THEN UPDATE store_document_series SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.brands') IS NOT NULL THEN UPDATE brands SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.models') IS NOT NULL THEN UPDATE models SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.categories') IS NOT NULL THEN UPDATE categories SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.products') IS NOT NULL THEN UPDATE products SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.customers') IS NOT NULL THEN UPDATE customers SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.sales') IS NOT NULL THEN UPDATE sales SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.sale_items') IS NOT NULL THEN UPDATE sale_items SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.sale_payments') IS NOT NULL THEN UPDATE sale_payments SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.suppliers') IS NOT NULL THEN UPDATE suppliers SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.purchase_orders') IS NOT NULL THEN UPDATE purchase_orders SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.purchase_order_items') IS NOT NULL THEN UPDATE purchase_order_items SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.advances') IS NOT NULL THEN UPDATE advances SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.advance_movements') IS NOT NULL THEN UPDATE advance_movements SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.credits') IS NOT NULL THEN UPDATE credits SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.credit_installments') IS NOT NULL THEN UPDATE credit_installments SET company_id = v_default_company WHERE company_id IS NULL; END IF;
    IF to_regclass('public.cash_sessions') IS NOT NULL THEN UPDATE cash_sessions SET company_id = v_default_company WHERE company_id IS NULL; END IF;
END $$;

-- Seed warehouses from stores if warehouses are empty
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM warehouses;
    IF v_count = 0 AND to_regclass('public.stores') IS NOT NULL THEN
        INSERT INTO warehouses (company_id, store_id, code, name, type, active)
        SELECT
            COALESCE(s.company_id, (SELECT id FROM companies ORDER BY created_at ASC LIMIT 1)),
            s.id,
            CASE WHEN s.type = 'warehouse' THEN CONCAT('WH_', upper(regexp_replace(s.code, '[^A-Z0-9]+', '_', 'g')))
                 ELSE CONCAT('SF_', upper(regexp_replace(s.code, '[^A-Z0-9]+', '_', 'g')))
            END,
            CASE WHEN s.type = 'warehouse' THEN CONCAT('Almacen ', s.name)
                 ELSE CONCAT('Piso de Venta ', s.name)
            END,
            CASE WHEN s.type = 'warehouse' THEN 'main' ELSE 'store_floor' END,
            COALESCE(s.is_active, true)
        FROM stores s
        ON CONFLICT (company_id, code) DO NOTHING;
    END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_product_variants_company_product ON product_variants(company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(company_id, active);

INSERT INTO product_variants (company_id, product_id, variant_code, attributes, active)
SELECT
    COALESCE(p.company_id, (SELECT id FROM companies ORDER BY created_at ASC LIMIT 1)),
    p.id,
    COALESCE(NULLIF(p.sku, ''), NULLIF(p.imei_1, ''), CONCAT('BASE-', substring(p.id::text, 1, 8))),
    jsonb_strip_nulls(jsonb_build_object(
        'color', p.color,
        'ram', p.ram,
        'rom', p.rom,
        'imei1', p.imei_1,
        'imei2', p.imei_2
    )),
    true
FROM products p
ON CONFLICT (company_id, product_id, variant_code) DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.inventory_balances') IS NOT NULL THEN
        ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
    END IF;
    IF to_regclass('public.sale_items') IS NOT NULL THEN
        ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
    END IF;
    IF to_regclass('public.purchase_order_items') IS NOT NULL THEN
        ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
    END IF;
END $$;

-- Backfill variant_id by picking the first active variant for each product
DO $$
BEGIN
    IF to_regclass('public.inventory_balances') IS NOT NULL THEN
        UPDATE inventory_balances ib
        SET variant_id = pv.id
        FROM LATERAL (
            SELECT id
            FROM product_variants
            WHERE product_id = ib.product_id
            ORDER BY active DESC, created_at ASC
            LIMIT 1
        ) pv
        WHERE ib.variant_id IS NULL;
    END IF;

    IF to_regclass('public.sale_items') IS NOT NULL THEN
        UPDATE sale_items si
        SET variant_id = pv.id
        FROM LATERAL (
            SELECT id
            FROM product_variants
            WHERE product_id = si.product_id
            ORDER BY active DESC, created_at ASC
            LIMIT 1
        ) pv
        WHERE si.variant_id IS NULL;
    END IF;

    IF to_regclass('public.purchase_order_items') IS NOT NULL THEN
        UPDATE purchase_order_items poi
        SET variant_id = pv.id
        FROM LATERAL (
            SELECT id
            FROM product_variants
            WHERE product_id = poi.product_id
            ORDER BY active DESC, created_at ASC
            LIMIT 1
        ) pv
        WHERE poi.variant_id IS NULL;
    END IF;
END $$;

-- Core indexes aligned with blueprint (without breaking current schema)
CREATE INDEX IF NOT EXISTS idx_sales_company_store_date ON sales(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_company_store_product ON inventory_balances(company_id, store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id, name);
