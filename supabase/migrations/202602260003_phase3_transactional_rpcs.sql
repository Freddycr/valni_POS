-- Blueprint Phase 3
-- Date: 2026-02-26
-- Scope: transactional RPCs for POS, void, transfer, adjust, purchase receipt
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_company_date ON purchase_receipts(company_id, received_at DESC);

CREATE OR REPLACE FUNCTION resolve_company_id(
    p_company_id UUID,
    p_store_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
BEGIN
    v_company_id := p_company_id;
    IF v_company_id IS NULL AND p_store_id IS NOT NULL THEN
        SELECT s.company_id INTO v_company_id
        FROM stores s
        WHERE s.id = p_store_id;
    END IF;
    IF v_company_id IS NULL THEN
        SELECT c.id INTO v_company_id
        FROM companies c
        ORDER BY c.created_at ASC
        LIMIT 1;
    END IF;
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'No company found.';
    END IF;
    RETURN v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_warehouse_id(
    p_company_id UUID,
    p_store_id UUID DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_warehouse_id UUID;
BEGIN
    v_warehouse_id := p_warehouse_id;
    IF v_warehouse_id IS NULL AND p_store_id IS NOT NULL THEN
        SELECT w.id INTO v_warehouse_id
        FROM warehouses w
        WHERE w.company_id = p_company_id
          AND w.store_id = p_store_id
          AND w.active = true
        ORDER BY CASE WHEN w.type = 'store_floor' THEN 0 ELSE 1 END, w.created_at ASC
        LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        SELECT w.id INTO v_warehouse_id
        FROM warehouses w
        WHERE w.company_id = p_company_id
          AND w.active = true
        ORDER BY CASE WHEN w.type = 'main' THEN 0 ELSE 1 END, w.created_at ASC
        LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found for company %', p_company_id;
    END IF;

    RETURN v_warehouse_id;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_stock_balance_row(
    p_company_id UUID,
    p_warehouse_id UUID,
    p_variant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stock_balances (company_id, warehouse_id, variant_id, on_hand, reserved, updated_at)
    VALUES (p_company_id, p_warehouse_id, p_variant_id, 0, 0, now())
    ON CONFLICT (company_id, warehouse_id, variant_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_create_sale(
    p_company_id UUID DEFAULT NULL,
    p_store_id UUID DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL,
    p_shift_id UUID DEFAULT NULL,
    p_customer_id UUID DEFAULT NULL,
    p_seller_id UUID DEFAULT NULL,
    p_total_amount NUMERIC DEFAULT 0,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_payments JSONB DEFAULT '[]'::jsonb,
    p_document_type TEXT DEFAULT 'Recibo de Venta',
    p_document_series TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
    v_store_id UUID;
    v_warehouse_id UUID;
    v_shift_id UUID;
    v_sale_id UUID;
    v_movement_id UUID;
    v_item JSONB;
    v_payment JSONB;
    v_variant_id UUID;
    v_product_id UUID;
    v_qty INTEGER;
    v_unit_price NUMERIC;
    v_line_total NUMERIC;
    v_stock_on_hand INTEGER;
    v_serialized_item_id UUID;
    v_payment_method TEXT;
    v_document_type TEXT;
    v_document_series TEXT;
    v_document_number BIGINT;
    v_effective_total NUMERIC;
BEGIN
    v_store_id := p_store_id;
    IF v_store_id IS NULL THEN
        SELECT s.id INTO v_store_id
        FROM stores s
        WHERE s.is_active = true
        ORDER BY s.is_default DESC, s.created_at ASC
        LIMIT 1;
    END IF;

    v_company_id := resolve_company_id(p_company_id, v_store_id);
    v_warehouse_id := resolve_warehouse_id(v_company_id, v_store_id, p_warehouse_id);

    v_shift_id := p_shift_id;
    IF v_shift_id IS NULL THEN
        SELECT ps.id INTO v_shift_id
        FROM pos_shifts ps
        WHERE ps.company_id = v_company_id
          AND ps.store_id = v_store_id
          AND ps.status = 'open'
        ORDER BY ps.opened_at DESC
        LIMIT 1;
    END IF;

    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'No open shift found for store %', v_store_id;
    END IF;

    v_document_type := COALESCE(NULLIF(trim(COALESCE(p_document_type, '')), ''), 'Recibo de Venta');
    v_document_series := COALESCE(NULLIF(trim(COALESCE(p_document_series, '')), ''), default_document_series(v_document_type));
    v_effective_total := COALESCE(p_total_amount, 0);

    INSERT INTO sales (
        company_id,
        store_id,
        warehouse_id,
        shift_id,
        customer_id,
        seller_id,
        total_amount,
        status,
        document_type,
        document_series,
        created_at
    )
    VALUES (
        v_company_id,
        v_store_id,
        v_warehouse_id,
        v_shift_id,
        p_customer_id,
        p_seller_id,
        v_effective_total,
        'completed',
        v_document_type,
        v_document_series,
        now()
    )
    RETURNING id INTO v_sale_id;

    IF to_regprocedure('get_next_document_number(uuid,text,text)') IS NOT NULL THEN
        SELECT get_next_document_number(v_store_id, v_document_type, v_document_series) INTO v_document_number;
        UPDATE sales
        SET
            document_number = v_document_number,
            invoice_number = CONCAT(v_document_series, '-', LPAD(v_document_number::TEXT, 8, '0'))
        WHERE id = v_sale_id;
    END IF;

    INSERT INTO inventory_movements (
        company_id,
        occurred_at,
        movement_type,
        warehouse_id,
        store_id,
        ref_table,
        ref_id,
        notes,
        created_by,
        created_at
    )
    VALUES (
        v_company_id,
        now(),
        'sale',
        v_warehouse_id,
        v_store_id,
        'sales',
        v_sale_id,
        'Venta POS',
        p_seller_id,
        now()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;

        IF v_variant_id IS NULL THEN
            SELECT pv.id INTO v_variant_id
            FROM product_variants pv
            WHERE pv.product_id = v_product_id
            ORDER BY pv.active DESC, pv.created_at ASC
            LIMIT 1;
        END IF;

        IF v_variant_id IS NULL THEN
            RAISE EXCEPTION 'No variant found for product %', v_product_id;
        END IF;

        IF v_product_id IS NULL THEN
            SELECT pv.product_id INTO v_product_id
            FROM product_variants pv
            WHERE pv.id = v_variant_id;
        END IF;

        v_qty := GREATEST(COALESCE((v_item->>'quantity')::INTEGER, 1), 1);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'price')::NUMERIC, 0);
        v_line_total := v_qty * v_unit_price;

        PERFORM ensure_stock_balance_row(v_company_id, v_warehouse_id, v_variant_id);

        SELECT sb.on_hand INTO v_stock_on_hand
        FROM stock_balances sb
        WHERE sb.company_id = v_company_id
          AND sb.warehouse_id = v_warehouse_id
          AND sb.variant_id = v_variant_id
        FOR UPDATE;

        IF COALESCE(v_stock_on_hand, 0) < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for variant % in warehouse %', v_variant_id, v_warehouse_id;
        END IF;

        UPDATE stock_balances
        SET on_hand = on_hand - v_qty,
            updated_at = now()
        WHERE company_id = v_company_id
          AND warehouse_id = v_warehouse_id
          AND variant_id = v_variant_id;

        INSERT INTO sale_items (
            company_id,
            sale_id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            total_price,
            captured_imei,
            captured_serial,
            created_at
        )
        VALUES (
            v_company_id,
            v_sale_id,
            v_product_id,
            v_variant_id,
            v_qty,
            v_unit_price,
            v_line_total,
            NULLIF(v_item->>'captured_imei', ''),
            NULLIF(v_item->>'captured_serial', ''),
            now()
        );

        v_serialized_item_id := NULLIF(v_item->>'serialized_item_id', '')::UUID;

        IF v_serialized_item_id IS NULL AND NULLIF(v_item->>'serial', '') IS NOT NULL THEN
            SELECT si.id INTO v_serialized_item_id
            FROM serialized_items si
            WHERE si.company_id = v_company_id
              AND si.serial = NULLIF(v_item->>'serial', '')
            ORDER BY si.created_at DESC
            LIMIT 1;
        END IF;

        IF v_serialized_item_id IS NOT NULL THEN
            UPDATE serialized_items
            SET status = 'sold',
                sold_sale_id = v_sale_id,
                updated_at = now()
            WHERE id = v_serialized_item_id
              AND company_id = v_company_id
              AND warehouse_id = v_warehouse_id
              AND status IN ('in_stock', 'reserved');
        END IF;

        INSERT INTO inventory_movement_items (
            company_id,
            movement_id,
            variant_id,
            qty,
            unit_cost,
            serialized_item_id,
            created_at
        )
        VALUES (
            v_company_id,
            v_movement_id,
            v_variant_id,
            -v_qty,
            0,
            v_serialized_item_id,
            now()
        );
    END LOOP;

    IF jsonb_array_length(COALESCE(p_payments, '[]'::jsonb)) = 0 THEN
        INSERT INTO sale_payments (
            company_id,
            sale_id,
            payment_method,
            amount,
            payment_store_id,
            payment_date
        )
        VALUES (
            v_company_id,
            v_sale_id,
            'cash',
            v_effective_total,
            v_store_id,
            now()
        );
    ELSE
        FOR v_payment IN
            SELECT value
            FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb))
        LOOP
            v_payment_method := lower(COALESCE(v_payment->>'payment_method', 'cash'));
            IF v_payment_method NOT IN ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'credit_installment', 'yape', 'plin') THEN
                v_payment_method := 'cash';
            END IF;

            INSERT INTO sale_payments (
                company_id,
                sale_id,
                payment_method,
                amount,
                reference_number,
                payment_store_id,
                payment_date
            )
            VALUES (
                v_company_id,
                v_sale_id,
                v_payment_method::payment_method_type,
                COALESCE((v_payment->>'amount')::NUMERIC, 0),
                NULLIF(v_payment->>'reference_number', ''),
                v_store_id,
                now()
            );
        END LOOP;
    END IF;

    RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_void_sale(
    p_sale_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_movement_id UUID;
BEGIN
    SELECT s.*
    INTO v_sale
    FROM sales s
    WHERE s.id = p_sale_id
    FOR UPDATE;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'Sale % not found', p_sale_id;
    END IF;

    IF v_sale.status <> 'completed' THEN
        RETURN false;
    END IF;

    INSERT INTO inventory_movements (
        company_id,
        occurred_at,
        movement_type,
        warehouse_id,
        store_id,
        ref_table,
        ref_id,
        notes,
        created_by,
        created_at
    )
    VALUES (
        v_sale.company_id,
        now(),
        'sale_void',
        v_sale.warehouse_id,
        v_sale.store_id,
        'sales',
        v_sale.id,
        COALESCE(p_reason, 'Anulación de venta'),
        p_user_id,
        now()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN
        SELECT si.id, si.variant_id, si.quantity
        FROM sale_items si
        WHERE si.sale_id = v_sale.id
    LOOP
        PERFORM ensure_stock_balance_row(v_sale.company_id, v_sale.warehouse_id, v_item.variant_id);

        UPDATE stock_balances
        SET on_hand = on_hand + v_item.quantity,
            updated_at = now()
        WHERE company_id = v_sale.company_id
          AND warehouse_id = v_sale.warehouse_id
          AND variant_id = v_item.variant_id;

        INSERT INTO inventory_movement_items (
            company_id,
            movement_id,
            variant_id,
            qty,
            unit_cost,
            created_at
        )
        VALUES (
            v_sale.company_id,
            v_movement_id,
            v_item.variant_id,
            v_item.quantity,
            0,
            now()
        );
    END LOOP;

    UPDATE serialized_items
    SET status = 'in_stock',
        sold_sale_id = NULL,
        updated_at = now()
    WHERE sold_sale_id = v_sale.id;

    UPDATE sales
    SET
        status = 'voided',
        notes = trim(concat(COALESCE(notes, ''), ' ', COALESCE(p_reason, 'Anulada'))),
        created_at = created_at
    WHERE id = v_sale.id;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_transfer_stock(
    p_company_id UUID,
    p_from_warehouse_id UUID,
    p_to_warehouse_id UUID,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
    v_out_movement_id UUID;
    v_in_movement_id UUID;
    v_item JSONB;
    v_variant_id UUID;
    v_qty INTEGER;
    v_stock_on_hand INTEGER;
    v_serialized_item_id UUID;
BEGIN
    v_company_id := resolve_company_id(p_company_id, NULL);

    IF p_from_warehouse_id = p_to_warehouse_id THEN
        RAISE EXCEPTION 'Source and destination warehouses must be different';
    END IF;

    INSERT INTO inventory_movements (
        company_id, occurred_at, movement_type, warehouse_id, ref_table, notes, created_by, created_at
    )
    VALUES (
        v_company_id, now(), 'transfer_out', p_from_warehouse_id, 'warehouses',
        COALESCE(p_notes, 'Transferencia de stock salida'), p_user_id, now()
    )
    RETURNING id INTO v_out_movement_id;

    INSERT INTO inventory_movements (
        company_id, occurred_at, movement_type, warehouse_id, ref_table, notes, created_by, created_at
    )
    VALUES (
        v_company_id, now(), 'transfer_in', p_to_warehouse_id, 'warehouses',
        COALESCE(p_notes, 'Transferencia de stock ingreso'), p_user_id, now()
    )
    RETURNING id INTO v_in_movement_id;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := GREATEST(COALESCE((v_item->>'qty')::INTEGER, 0), 0);
        v_serialized_item_id := NULLIF(v_item->>'serialized_item_id', '')::UUID;

        IF v_variant_id IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid transfer item payload';
        END IF;

        PERFORM ensure_stock_balance_row(v_company_id, p_from_warehouse_id, v_variant_id);
        PERFORM ensure_stock_balance_row(v_company_id, p_to_warehouse_id, v_variant_id);

        SELECT sb.on_hand INTO v_stock_on_hand
        FROM stock_balances sb
        WHERE sb.company_id = v_company_id
          AND sb.warehouse_id = p_from_warehouse_id
          AND sb.variant_id = v_variant_id
        FOR UPDATE;

        IF COALESCE(v_stock_on_hand, 0) < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for transfer variant %', v_variant_id;
        END IF;

        UPDATE stock_balances
        SET on_hand = on_hand - v_qty,
            updated_at = now()
        WHERE company_id = v_company_id
          AND warehouse_id = p_from_warehouse_id
          AND variant_id = v_variant_id;

        UPDATE stock_balances
        SET on_hand = on_hand + v_qty,
            updated_at = now()
        WHERE company_id = v_company_id
          AND warehouse_id = p_to_warehouse_id
          AND variant_id = v_variant_id;

        INSERT INTO inventory_movement_items (company_id, movement_id, variant_id, qty, unit_cost, serialized_item_id, created_at)
        VALUES (v_company_id, v_out_movement_id, v_variant_id, -v_qty, 0, v_serialized_item_id, now());

        INSERT INTO inventory_movement_items (company_id, movement_id, variant_id, qty, unit_cost, serialized_item_id, created_at)
        VALUES (v_company_id, v_in_movement_id, v_variant_id, v_qty, 0, v_serialized_item_id, now());

        IF v_serialized_item_id IS NOT NULL THEN
            UPDATE serialized_items
            SET warehouse_id = p_to_warehouse_id,
                updated_at = now()
            WHERE id = v_serialized_item_id
              AND company_id = v_company_id;
        END IF;
    END LOOP;

    RETURN v_out_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_adjust_stock(
    p_company_id UUID,
    p_warehouse_id UUID,
    p_variant_id UUID,
    p_qty_delta INTEGER,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL,
    p_serialized_item_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
    v_movement_id UUID;
    v_stock_on_hand INTEGER;
BEGIN
    IF trim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'Adjustment reason is required';
    END IF;

    v_company_id := resolve_company_id(p_company_id, NULL);
    PERFORM ensure_stock_balance_row(v_company_id, p_warehouse_id, p_variant_id);

    SELECT sb.on_hand INTO v_stock_on_hand
    FROM stock_balances sb
    WHERE sb.company_id = v_company_id
      AND sb.warehouse_id = p_warehouse_id
      AND sb.variant_id = p_variant_id
    FOR UPDATE;

    IF p_qty_delta < 0 AND COALESCE(v_stock_on_hand, 0) < ABS(p_qty_delta) THEN
        RAISE EXCEPTION 'Insufficient stock for adjustment';
    END IF;

    UPDATE stock_balances
    SET on_hand = on_hand + p_qty_delta,
        updated_at = now()
    WHERE company_id = v_company_id
      AND warehouse_id = p_warehouse_id
      AND variant_id = p_variant_id;

    INSERT INTO inventory_movements (
        company_id, occurred_at, movement_type, warehouse_id, ref_table, notes, created_by, created_at
    )
    VALUES (
        v_company_id, now(), 'adjustment', p_warehouse_id, 'stock_balances', p_reason, p_user_id, now()
    )
    RETURNING id INTO v_movement_id;

    INSERT INTO inventory_movement_items (
        company_id, movement_id, variant_id, qty, unit_cost, serialized_item_id, created_at
    )
    VALUES (
        v_company_id, v_movement_id, p_variant_id, p_qty_delta, 0, p_serialized_item_id, now()
    );

    IF p_serialized_item_id IS NOT NULL THEN
        UPDATE serialized_items
        SET
            status = CASE WHEN p_qty_delta < 0 THEN 'damaged' ELSE 'in_stock' END,
            warehouse_id = p_warehouse_id,
            updated_at = now()
        WHERE id = p_serialized_item_id
          AND company_id = v_company_id;
    END IF;

    RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_receive_purchase(
    p_company_id UUID,
    p_purchase_order_id UUID DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id UUID;
    v_warehouse_id UUID;
    v_receipt_id UUID;
    v_movement_id UUID;
    v_item JSONB;
    v_variant_id UUID;
    v_qty INTEGER;
    v_unit_cost NUMERIC;
    v_serial TEXT;
BEGIN
    v_company_id := resolve_company_id(p_company_id, NULL);
    v_warehouse_id := resolve_warehouse_id(v_company_id, NULL, p_warehouse_id);

    INSERT INTO purchase_receipts (
        company_id,
        purchase_order_id,
        warehouse_id,
        received_at,
        received_by,
        notes,
        created_at
    )
    VALUES (
        v_company_id,
        p_purchase_order_id,
        v_warehouse_id,
        now(),
        p_user_id,
        p_notes,
        now()
    )
    RETURNING id INTO v_receipt_id;

    INSERT INTO inventory_movements (
        company_id,
        occurred_at,
        movement_type,
        warehouse_id,
        ref_table,
        ref_id,
        notes,
        created_by,
        created_at
    )
    VALUES (
        v_company_id,
        now(),
        'purchase_receipt',
        v_warehouse_id,
        'purchase_receipts',
        v_receipt_id,
        COALESCE(p_notes, 'Ingreso por recepción de compra'),
        p_user_id,
        now()
    )
    RETURNING id INTO v_movement_id;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := GREATEST(COALESCE((v_item->>'qty')::INTEGER, 0), 0);
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

        IF v_variant_id IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid purchase receipt item payload';
        END IF;

        PERFORM ensure_stock_balance_row(v_company_id, v_warehouse_id, v_variant_id);

        UPDATE stock_balances
        SET on_hand = on_hand + v_qty,
            updated_at = now()
        WHERE company_id = v_company_id
          AND warehouse_id = v_warehouse_id
          AND variant_id = v_variant_id;

        INSERT INTO inventory_movement_items (
            company_id, movement_id, variant_id, qty, unit_cost, created_at
        )
        VALUES (
            v_company_id, v_movement_id, v_variant_id, v_qty, v_unit_cost, now()
        );

        IF jsonb_typeof(v_item->'serials') = 'array' THEN
            FOR v_serial IN
                SELECT value::text
                FROM jsonb_array_elements_text(v_item->'serials')
            LOOP
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
                VALUES (
                    v_company_id,
                    v_variant_id,
                    v_warehouse_id,
                    trim(BOTH '"' FROM v_serial),
                    'in_stock',
                    v_unit_cost,
                    now(),
                    now(),
                    now()
                )
                ON CONFLICT (company_id, serial)
                DO UPDATE SET
                    warehouse_id = EXCLUDED.warehouse_id,
                    status = 'in_stock',
                    cost = EXCLUDED.cost,
                    updated_at = now();
            END LOOP;
        END IF;
    END LOOP;

    IF p_purchase_order_id IS NOT NULL THEN
        UPDATE purchase_orders
        SET status = 'received'
        WHERE id = p_purchase_order_id;
    END IF;

    RETURN v_receipt_id;
END;
$$;

-- Backward compatibility wrappers expected by current app
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
BEGIN
    RETURN rpc_create_sale(
        NULL,
        p_store_id,
        NULL,
        NULL,
        p_customer_id,
        p_seller_id,
        p_total_amount,
        p_items,
        p_payments,
        p_document_type,
        p_document_series
    );
END;
$$;

CREATE OR REPLACE FUNCTION process_sale_atomic(
    p_customer_id UUID,
    p_seller_id UUID,
    p_total_amount NUMERIC,
    p_items JSONB,
    p_payments JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN process_sale_atomic(
        p_customer_id,
        p_seller_id,
        p_total_amount,
        p_items,
        p_payments,
        NULL::UUID,
        'Recibo de Venta',
        NULL::TEXT
    );
END;
$$;
