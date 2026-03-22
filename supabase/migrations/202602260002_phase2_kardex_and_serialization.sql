-- Blueprint Phase 2 foundations
-- Date: 2026-02-26
-- Scope: kardex + serial lifecycle + shifts + stock balances by warehouse/variant
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX IF NOT EXISTS idx_stock_balances_company_wh_variant ON stock_balances(company_id, warehouse_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_serialized_items_company_serial ON serialized_items(company_id, serial);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_wh_date ON inventory_movements(company_id, warehouse_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_items_movement ON inventory_movement_items(movement_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_company_store_status ON pos_shifts(company_id, store_id, status);

-- Extend legacy transaction tables for shift tracking
DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL THEN
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES pos_shifts(id);
    END IF;
END $$;

-- Backfill stock_balances from inventory_balances + warehouse map
DO $$
DECLARE
    v_default_company UUID;
BEGIN
    SELECT id INTO v_default_company
    FROM companies
    ORDER BY created_at ASC
    LIMIT 1;

    IF to_regclass('public.inventory_balances') IS NOT NULL THEN
        INSERT INTO stock_balances (company_id, warehouse_id, variant_id, on_hand, reserved, updated_at)
        SELECT
            COALESCE(ib.company_id, v_default_company) AS company_id,
            COALESCE(wh.id, wh_any.id) AS warehouse_id,
            COALESCE(
                ib.variant_id,
                pv.id
            ) AS variant_id,
            GREATEST(COALESCE(ib.on_hand, 0), 0) AS on_hand,
            GREATEST(COALESCE(ib.reserved, 0), 0) AS reserved,
            now()
        FROM inventory_balances ib
        LEFT JOIN LATERAL (
            SELECT w.id
            FROM warehouses w
            WHERE w.store_id = ib.store_id
            ORDER BY w.created_at ASC
            LIMIT 1
        ) wh ON true
        LEFT JOIN LATERAL (
            SELECT w.id
            FROM warehouses w
            WHERE w.company_id = COALESCE(ib.company_id, v_default_company)
            ORDER BY w.created_at ASC
            LIMIT 1
        ) wh_any ON true
        LEFT JOIN LATERAL (
            SELECT v.id
            FROM product_variants v
            WHERE v.product_id = ib.product_id
            ORDER BY v.active DESC, v.created_at ASC
            LIMIT 1
        ) pv ON true
        WHERE COALESCE(wh.id, wh_any.id) IS NOT NULL
          AND COALESCE(ib.variant_id, pv.id) IS NOT NULL
        ON CONFLICT (company_id, warehouse_id, variant_id)
        DO UPDATE SET
            on_hand = EXCLUDED.on_hand,
            reserved = EXCLUDED.reserved,
            updated_at = now();
    END IF;
END $$;

-- Seed serialized_items from existing product serial/imei data
DO $$
DECLARE
    v_default_company UUID;
BEGIN
    SELECT id INTO v_default_company
    FROM companies
    ORDER BY created_at ASC
    LIMIT 1;

    IF to_regclass('public.products') IS NOT NULL THEN
        INSERT INTO serialized_items (
            company_id,
            variant_id,
            warehouse_id,
            serial,
            status,
            cost,
            received_at,
            created_at,
            updated_at
        )
        SELECT
            COALESCE(p.company_id, v_default_company) AS company_id,
            pv.id AS variant_id,
            COALESCE(wh.id, wh_any.id) AS warehouse_id,
            serial_data.serial_value AS serial,
            CASE WHEN COALESCE(p.stock_quantity, 0) > 0 THEN 'in_stock' ELSE 'sold' END AS status,
            COALESCE(p.buy_price, 0) AS cost,
            p.created_at,
            now(),
            now()
        FROM products p
        JOIN LATERAL (
            SELECT v.id
            FROM product_variants v
            WHERE v.product_id = p.id
            ORDER BY v.active DESC, v.created_at ASC
            LIMIT 1
        ) pv ON true
        LEFT JOIN LATERAL (
            SELECT w.id
            FROM stores s
            JOIN warehouses w ON w.store_id = s.id
            WHERE s.name = COALESCE(p.location_bin, s.name)
            ORDER BY w.created_at ASC
            LIMIT 1
        ) wh ON true
        LEFT JOIN LATERAL (
            SELECT w.id
            FROM warehouses w
            WHERE w.company_id = COALESCE(p.company_id, v_default_company)
            ORDER BY w.created_at ASC
            LIMIT 1
        ) wh_any ON true
        JOIN LATERAL (
            SELECT serial_value
            FROM (
                VALUES
                    (NULLIF(trim(COALESCE(p.imei_1, '')), '')),
                    (NULLIF(trim(COALESCE(p.serial_number, '')), '')),
                    (NULLIF(trim(COALESCE(p.imei_2, '')), ''))
            ) serials(serial_value)
            WHERE serial_value IS NOT NULL
            LIMIT 1
        ) serial_data ON true
        WHERE COALESCE(wh.id, wh_any.id) IS NOT NULL
        ON CONFLICT (company_id, serial) DO NOTHING;
    END IF;
END $$;

-- Seed opening_balance movements from stock_balances
DO $$
BEGIN
    INSERT INTO inventory_movements (
        company_id,
        occurred_at,
        movement_type,
        warehouse_id,
        notes,
        created_at
    )
    SELECT
        sb.company_id,
        now(),
        'opening_balance',
        sb.warehouse_id,
        'Backfill inicial desde stock_balances',
        now()
    FROM (
        SELECT DISTINCT company_id, warehouse_id
        FROM stock_balances
    ) sb
    WHERE NOT EXISTS (
        SELECT 1
        FROM inventory_movements im
        WHERE im.company_id = sb.company_id
          AND im.warehouse_id = sb.warehouse_id
          AND im.movement_type = 'opening_balance'
    );

    INSERT INTO inventory_movement_items (
        company_id,
        movement_id,
        variant_id,
        qty,
        unit_cost,
        created_at
    )
    SELECT
        sb.company_id,
        im.id,
        sb.variant_id,
        sb.on_hand,
        0,
        now()
    FROM stock_balances sb
    JOIN inventory_movements im
      ON im.company_id = sb.company_id
     AND im.warehouse_id = sb.warehouse_id
     AND im.movement_type = 'opening_balance'
    LEFT JOIN inventory_movement_items imi
      ON imi.movement_id = im.id
     AND imi.variant_id = sb.variant_id
    WHERE imi.id IS NULL
      AND sb.on_hand <> 0;
END $$;
