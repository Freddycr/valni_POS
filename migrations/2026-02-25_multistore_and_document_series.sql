-- Multi-store rollout + per-store document series
-- Date: 2026-02-25
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
        ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'yape';
        ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'plin';
    END IF;
END $$;

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

INSERT INTO stores (code, name, type, is_active, is_default)
SELECT 'TIENDA_01', 'Tienda', 'store', true, true
WHERE NOT EXISTS (SELECT 1 FROM stores);

INSERT INTO stores (code, name, type, is_active, is_default)
SELECT 'ALMACEN_CENTRAL', 'Almacen', 'warehouse', true, false
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE lower(name) = lower('Almacen'));

DO $$
BEGIN
    IF to_regclass('public.inventory_locations') IS NOT NULL THEN
        INSERT INTO stores (code, name, type, is_active, is_default)
        SELECT
            upper(regexp_replace(il.name, '[^a-zA-Z0-9]+', '_', 'g')),
            il.name,
            CASE WHEN lower(il.name) LIKE '%almacen%' THEN 'warehouse' ELSE 'store' END,
            true,
            COALESCE(il.is_default, false)
        FROM inventory_locations il
        ON CONFLICT (name) DO NOTHING;
    END IF;
END $$;

WITH first_store AS (
    SELECT id FROM stores ORDER BY is_default DESC, created_at ASC LIMIT 1
)
UPDATE stores s
SET is_default = (s.id = fs.id)
FROM first_store fs;

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

CREATE INDEX IF NOT EXISTS idx_user_store_assignments_user ON user_store_assignments(user_id, is_default DESC);
CREATE INDEX IF NOT EXISTS idx_user_store_assignments_store ON user_store_assignments(store_id);

INSERT INTO user_store_assignments (user_id, store_id, is_default, can_sell, can_manage_inventory)
SELECT
    p.id,
    s.id,
    true,
    true,
    (p.role IN ('admin', 'inventory_manager'))
FROM profiles p
CROSS JOIN LATERAL (
    SELECT id
    FROM stores
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
) s
ON CONFLICT (user_id, store_id) DO NOTHING;

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

CREATE INDEX IF NOT EXISTS idx_inventory_balances_store_product ON inventory_balances(store_id, product_id);

INSERT INTO inventory_balances (product_id, store_id, on_hand, reserved)
SELECT
    p.id,
    COALESCE(s_loc.id, s_default.id),
    GREATEST(COALESCE(p.stock_quantity, 0), 0),
    0
FROM products p
CROSS JOIN LATERAL (
    SELECT id
    FROM stores
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
) s_default
LEFT JOIN stores s_loc
    ON lower(s_loc.name) = lower(COALESCE(p.location_bin, ''))
ON CONFLICT (product_id, store_id) DO UPDATE
SET
    on_hand = EXCLUDED.on_hand,
    updated_at = now();

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

INSERT INTO store_document_series (store_id, document_type, series, current_number, is_active)
SELECT s.id, x.document_type, x.series, 0, true
FROM stores s
CROSS JOIN (
    VALUES
        ('Recibo de Venta', 'RV001'),
        ('Boleta', 'B001'),
        ('Factura', 'F001')
) AS x(document_type, series)
ON CONFLICT (store_id, document_type, series) DO NOTHING;

CREATE OR REPLACE FUNCTION default_document_series(p_document_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    CASE lower(trim(COALESCE(p_document_type, '')))
        WHEN 'factura' THEN RETURN 'F001';
        WHEN 'boleta' THEN RETURN 'B001';
        WHEN 'recibo de venta' THEN RETURN 'RV001';
        ELSE RETURN 'DOC001';
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION get_next_document_number(
    p_store_id UUID,
    p_document_type TEXT,
    p_document_series TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_series TEXT;
    v_next BIGINT;
BEGIN
    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'get_next_document_number requires p_store_id';
    END IF;

    v_series := COALESCE(NULLIF(trim(COALESCE(p_document_series, '')), ''), default_document_series(p_document_type));

    INSERT INTO store_document_series (store_id, document_type, series, current_number, is_active)
    VALUES (p_store_id, COALESCE(NULLIF(trim(p_document_type), ''), 'Recibo de Venta'), v_series, 1, true)
    ON CONFLICT (store_id, document_type, series)
    DO UPDATE
    SET
        current_number = store_document_series.current_number + 1,
        updated_at = now()
    RETURNING current_number INTO v_next;

    RETURN v_next;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL THEN
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'Recibo de Venta';
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_series TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_number BIGINT;
        CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_document_per_store
            ON sales(store_id, document_type, document_series, document_number)
            WHERE document_number IS NOT NULL;
    END IF;

    IF to_regclass('public.sale_payments') IS NOT NULL THEN
        ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS payment_store_id UUID REFERENCES stores(id);
        CREATE INDEX IF NOT EXISTS idx_sale_payments_store_date ON sale_payments(payment_store_id, payment_date DESC);
    END IF;

    IF to_regclass('public.credits') IS NOT NULL THEN
        ALTER TABLE credits ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
        CREATE INDEX IF NOT EXISTS idx_credits_store_status ON credits(store_id, status);
    END IF;

    IF to_regclass('public.advances') IS NOT NULL THEN
        ALTER TABLE advances ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
        CREATE INDEX IF NOT EXISTS idx_advances_store_status ON advances(store_id, status);
    END IF;

    IF to_regclass('public.advance_movements') IS NOT NULL THEN
        ALTER TABLE advance_movements ADD COLUMN IF NOT EXISTS movement_store_id UUID REFERENCES stores(id);
        CREATE INDEX IF NOT EXISTS idx_advance_movements_store_date ON advance_movements(movement_store_id, created_at DESC);
    END IF;

    IF to_regclass('public.purchase_orders') IS NOT NULL THEN
        ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_status ON purchase_orders(store_id, status, order_date DESC);
    END IF;
END $$;

DO $$
DECLARE
    v_default_store UUID;
BEGIN
    SELECT id INTO v_default_store
    FROM stores
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    IF to_regclass('public.sales') IS NOT NULL THEN
        UPDATE sales
        SET store_id = v_default_store
        WHERE store_id IS NULL;
    END IF;

    IF to_regclass('public.sale_payments') IS NOT NULL AND to_regclass('public.sales') IS NOT NULL THEN
        UPDATE sale_payments sp
        SET payment_store_id = s.store_id
        FROM sales s
        WHERE sp.sale_id = s.id
          AND sp.payment_store_id IS NULL;
    END IF;

    IF to_regclass('public.credits') IS NOT NULL AND to_regclass('public.sales') IS NOT NULL THEN
        UPDATE credits c
        SET store_id = s.store_id
        FROM sales s
        WHERE c.sale_id = s.id
          AND c.store_id IS NULL;
    END IF;

    IF to_regclass('public.advances') IS NOT NULL THEN
        UPDATE advances
        SET store_id = v_default_store
        WHERE store_id IS NULL;
    END IF;

    IF to_regclass('public.advance_movements') IS NOT NULL AND to_regclass('public.advances') IS NOT NULL THEN
        UPDATE advance_movements am
        SET movement_store_id = a.store_id
        FROM advances a
        WHERE am.advance_id = a.id
          AND am.movement_store_id IS NULL;
    END IF;

    IF to_regclass('public.purchase_orders') IS NOT NULL THEN
        UPDATE purchase_orders
        SET store_id = v_default_store
        WHERE store_id IS NULL;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION set_payment_store_id_default()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.payment_store_id IS NULL AND NEW.sale_id IS NOT NULL THEN
        SELECT s.store_id INTO NEW.payment_store_id
        FROM sales s
        WHERE s.id = NEW.sale_id;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.sale_payments') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_set_payment_store_id_default ON sale_payments';
        EXECUTE 'CREATE TRIGGER trg_set_payment_store_id_default
                 BEFORE INSERT ON sale_payments
                 FOR EACH ROW
                 EXECUTE FUNCTION set_payment_store_id_default()';
    END IF;
END $$;

-- New overload to preserve current app call pattern:
-- process_sale_atomic(customer, seller, total, items, payments, store, document_type, document_series)
CREATE OR REPLACE FUNCTION process_sale_atomic(
    p_customer_id UUID,
    p_seller_id UUID,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_payments JSONB,
    p_store_id UUID DEFAULT NULL,
    p_document_type TEXT DEFAULT 'Recibo de Venta',
    p_document_series TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale_id UUID;
    v_store_id UUID;
    v_document_type TEXT;
    v_document_series TEXT;
    v_document_number BIGINT;
    v_item JSONB;
    v_payment JSONB;
    v_qty INTEGER;
    v_unit_price NUMERIC;
BEGIN
    v_store_id := p_store_id;
    IF v_store_id IS NULL THEN
        SELECT id INTO v_store_id
        FROM stores
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1;
    END IF;

    v_document_type := COALESCE(NULLIF(trim(COALESCE(p_document_type, '')), ''), 'Recibo de Venta');
    v_document_series := COALESCE(NULLIF(trim(COALESCE(p_document_series, '')), ''), default_document_series(v_document_type));

    BEGIN
        EXECUTE 'SELECT process_sale_atomic($1,$2,$3,$4,$5)'
        INTO v_sale_id
        USING p_customer_id, p_seller_id, p_total_amount, p_items, p_payments;
    EXCEPTION
        WHEN undefined_function THEN
            INSERT INTO sales (
                customer_id,
                seller_id,
                total_amount,
                status,
                store_id,
                document_type,
                document_series
            )
            VALUES (
                p_customer_id,
                p_seller_id,
                p_total_amount,
                'completed',
                v_store_id,
                v_document_type,
                v_document_series
            )
            RETURNING id INTO v_sale_id;

            FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
                v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
                v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);

                INSERT INTO sale_items (
                    sale_id,
                    product_id,
                    quantity,
                    unit_price,
                    total_price,
                    captured_imei,
                    captured_serial
                )
                VALUES (
                    v_sale_id,
                    (v_item->>'product_id')::UUID,
                    v_qty,
                    v_unit_price,
                    (v_qty * v_unit_price),
                    NULLIF(v_item->>'captured_imei', ''),
                    NULLIF(v_item->>'captured_serial', '')
                );
            END LOOP;

            FOR v_payment IN SELECT value FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) LOOP
                INSERT INTO sale_payments (
                    sale_id,
                    payment_method,
                    amount,
                    payment_store_id
                )
                VALUES (
                    v_sale_id,
                    (v_payment->>'payment_method'),
                    COALESCE((v_payment->>'amount')::NUMERIC, 0),
                    v_store_id
                );
            END LOOP;
    END;

    IF v_sale_id IS NULL THEN
        RAISE EXCEPTION 'process_sale_atomic could not generate sale id.';
    END IF;

    v_document_number := get_next_document_number(v_store_id, v_document_type, v_document_series);

    UPDATE sales
    SET
        store_id = COALESCE(store_id, v_store_id),
        document_type = v_document_type,
        document_series = v_document_series,
        document_number = v_document_number,
        invoice_number = CONCAT(v_document_series, '-', LPAD(v_document_number::TEXT, 8, '0'))
    WHERE id = v_sale_id;

    UPDATE sale_payments
    SET payment_store_id = COALESCE(payment_store_id, v_store_id)
    WHERE sale_id = v_sale_id;

    RETURN v_sale_id;
END;
$$;
