-- Vista unificada para trazabilidad de productos:
-- proveedor + costo de compra + movimientos + venta (cliente/monto/pagos)
-- Soporta esquema blueprint (inventory_movements/inventory_movement_items/product_variants)
-- y esquema legado (solo sales/sale_items/sale_payments).

DO $$
DECLARE
    has_product_variants BOOLEAN;
    has_inventory_movements BOOLEAN;
    has_inventory_movement_items BOOLEAN;
    has_payment_method_label BOOLEAN;
    has_sales_company_id BOOLEAN;
    has_sales_store_id BOOLEAN;
    has_sales_warehouse_id BOOLEAN;
    has_sales_notes BOOLEAN;
    has_sale_items_captured_serial BOOLEAN;
    has_sale_items_captured_imei BOOLEAN;
    payment_label_expr TEXT;
    sales_company_expr TEXT;
    sales_store_expr TEXT;
    sales_warehouse_expr TEXT;
    sales_notes_expr TEXT;
    item_serial_expr TEXT;
BEGIN
    SELECT to_regclass('public.product_variants') IS NOT NULL INTO has_product_variants;
    SELECT to_regclass('public.inventory_movements') IS NOT NULL INTO has_inventory_movements;
    SELECT to_regclass('public.inventory_movement_items') IS NOT NULL INTO has_inventory_movement_items;

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sale_payments'
          AND column_name = 'payment_method_label'
    ) INTO has_payment_method_label;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'company_id'
    ) INTO has_sales_company_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'store_id'
    ) INTO has_sales_store_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'warehouse_id'
    ) INTO has_sales_warehouse_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'notes'
    ) INTO has_sales_notes;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'captured_serial'
    ) INTO has_sale_items_captured_serial;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'captured_imei'
    ) INTO has_sale_items_captured_imei;

    payment_label_expr := CASE
        WHEN has_payment_method_label THEN 'sp.payment_method_label'
        ELSE 'NULL::text'
    END;

    sales_company_expr := CASE
        WHEN has_sales_company_id THEN 's.company_id'
        ELSE 'NULL::uuid'
    END;

    sales_store_expr := CASE
        WHEN has_sales_store_id THEN 's.store_id'
        ELSE 'NULL::uuid'
    END;

    sales_warehouse_expr := CASE
        WHEN has_sales_warehouse_id THEN 's.warehouse_id'
        ELSE 'NULL::uuid'
    END;

    sales_notes_expr := CASE
        WHEN has_sales_notes THEN 's.notes'
        ELSE 'NULL::text'
    END;

    item_serial_expr := CASE
        WHEN has_sale_items_captured_serial THEN 'si.captured_serial'
        WHEN has_sale_items_captured_imei THEN 'si.captured_imei'
        ELSE 'NULL::text'
    END;

    IF has_inventory_movements AND has_inventory_movement_items THEN
        IF has_product_variants THEN
            EXECUTE format($sql$
CREATE OR REPLACE VIEW public.view_product_lifecycle_events AS
WITH sale_summary AS (
    SELECT
        si.sale_id,
        SUM(COALESCE(si.quantity, 0))::INTEGER AS qty_sold,
        SUM(COALESCE(si.total_price, 0))::NUMERIC(14,2) AS line_total,
        AVG(COALESCE(si.unit_price, 0))::NUMERIC(14,2) AS avg_unit_price,
        (ARRAY_AGG(si.product_id ORDER BY si.product_id))[1] AS sample_product_id
    FROM public.sale_items si
    GROUP BY si.sale_id
),
sale_payments_summary AS (
    SELECT
        sp.sale_id,
        STRING_AGG(
            CONCAT(COALESCE(%s, sp.payment_method::TEXT), ': ', TO_CHAR(COALESCE(sp.amount, 0), 'FM999999990.00')),
            ' | ' ORDER BY sp.payment_date, sp.id
        ) AS payment_summary
    FROM public.sale_payments sp
    GROUP BY sp.sale_id
)
SELECT
    imi.id AS event_id,
    im.company_id,
    im.occurred_at,
    im.movement_type,
    CASE im.movement_type
        WHEN 'purchase_receipt' THEN 'Ingreso por compra'
        WHEN 'sale' THEN 'Venta'
        WHEN 'sale_void' THEN 'Anulación de venta'
        WHEN 'refund' THEN 'Devolución'
        WHEN 'transfer_out' THEN 'Transferencia salida'
        WHEN 'transfer_in' THEN 'Transferencia ingreso'
        WHEN 'adjustment' THEN 'Ajuste'
        WHEN 'opening_balance' THEN 'Saldo inicial'
        ELSE im.movement_type
    END AS movement_label,
    COALESCE(pv.product_id, ss.sample_product_id) AS product_id,
    imi.variant_id,
    p.name AS product_name,
    p.imei_1,
    p.imei_2,
    p.serial_number,
    sitem.serial AS serialized_serial,
    imi.qty,
    COALESCE(imi.unit_cost, 0)::NUMERIC(14,2) AS unit_cost,
    CASE
        WHEN im.movement_type = 'sale' THEN COALESCE(ss.line_total, s.total_amount, 0)
        ELSE ABS(COALESCE(imi.qty, 0)) * COALESCE(imi.unit_cost, 0)
    END::NUMERIC(14,2) AS line_amount,
    im.warehouse_id,
    wh.name AS warehouse_name,
    im.store_id,
    st.name AS store_name,
    im.ref_table,
    im.ref_id,
    pr.id AS purchase_receipt_id,
    po.id AS purchase_order_id,
    po.supplier_id,
    sup.name AS supplier_name,
    s.id AS sale_id,
    s.customer_id,
    c.full_name AS customer_name,
    COALESCE(s.total_amount, 0)::NUMERIC(14,2) AS sale_total_amount,
    COALESCE(ss.avg_unit_price, 0)::NUMERIC(14,2) AS sale_unit_price,
    pay.payment_summary,
    im.notes,
    LOWER(CONCAT_WS(' ',
        p.name,
        p.imei_1,
        p.imei_2,
        p.serial_number,
        sitem.serial,
        sup.name,
        c.full_name,
        st.name,
        wh.name
    )) AS search_blob
FROM public.inventory_movement_items imi
JOIN public.inventory_movements im
    ON im.id = imi.movement_id
LEFT JOIN public.product_variants pv
    ON pv.id = imi.variant_id
LEFT JOIN public.products p
    ON p.id = pv.product_id
LEFT JOIN public.serialized_items sitem
    ON sitem.id = imi.serialized_item_id
LEFT JOIN public.warehouses wh
    ON wh.id = im.warehouse_id
LEFT JOIN public.stores st
    ON st.id = im.store_id
LEFT JOIN public.purchase_receipts pr
    ON im.ref_table = 'purchase_receipts'
   AND pr.id = im.ref_id
LEFT JOIN public.purchase_orders po
    ON po.id = pr.purchase_order_id
LEFT JOIN public.suppliers sup
    ON sup.id = po.supplier_id
LEFT JOIN public.sales s
    ON im.ref_table = 'sales'
   AND s.id = im.ref_id
LEFT JOIN public.customers c
    ON c.id = s.customer_id
LEFT JOIN sale_summary ss
    ON ss.sale_id = s.id
LEFT JOIN sale_payments_summary pay
    ON pay.sale_id = s.id;
$sql$, payment_label_expr);
        ELSE
            EXECUTE format($sql$
CREATE OR REPLACE VIEW public.view_product_lifecycle_events AS
WITH sale_summary AS (
    SELECT
        si.sale_id,
        SUM(COALESCE(si.quantity, 0))::INTEGER AS qty_sold,
        SUM(COALESCE(si.total_price, 0))::NUMERIC(14,2) AS line_total,
        AVG(COALESCE(si.unit_price, 0))::NUMERIC(14,2) AS avg_unit_price,
        (ARRAY_AGG(si.product_id ORDER BY si.product_id))[1] AS sample_product_id
    FROM public.sale_items si
    GROUP BY si.sale_id
),
sale_payments_summary AS (
    SELECT
        sp.sale_id,
        STRING_AGG(
            CONCAT(COALESCE(%s, sp.payment_method::TEXT), ': ', TO_CHAR(COALESCE(sp.amount, 0), 'FM999999990.00')),
            ' | ' ORDER BY sp.payment_date, sp.id
        ) AS payment_summary
    FROM public.sale_payments sp
    GROUP BY sp.sale_id
)
SELECT
    imi.id AS event_id,
    im.company_id,
    im.occurred_at,
    im.movement_type,
    CASE im.movement_type
        WHEN 'purchase_receipt' THEN 'Ingreso por compra'
        WHEN 'sale' THEN 'Venta'
        WHEN 'sale_void' THEN 'Anulación de venta'
        WHEN 'refund' THEN 'Devolución'
        WHEN 'transfer_out' THEN 'Transferencia salida'
        WHEN 'transfer_in' THEN 'Transferencia ingreso'
        WHEN 'adjustment' THEN 'Ajuste'
        WHEN 'opening_balance' THEN 'Saldo inicial'
        ELSE im.movement_type
    END AS movement_label,
    ss.sample_product_id AS product_id,
    NULL::uuid AS variant_id,
    p.name AS product_name,
    p.imei_1,
    p.imei_2,
    p.serial_number,
    NULL::text AS serialized_serial,
    imi.qty,
    COALESCE(imi.unit_cost, 0)::NUMERIC(14,2) AS unit_cost,
    CASE
        WHEN im.movement_type = 'sale' THEN COALESCE(ss.line_total, s.total_amount, 0)
        ELSE ABS(COALESCE(imi.qty, 0)) * COALESCE(imi.unit_cost, 0)
    END::NUMERIC(14,2) AS line_amount,
    im.warehouse_id,
    NULL::text AS warehouse_name,
    im.store_id,
    st.name AS store_name,
    im.ref_table,
    im.ref_id,
    NULL::uuid AS purchase_receipt_id,
    NULL::uuid AS purchase_order_id,
    NULL::uuid AS supplier_id,
    NULL::text AS supplier_name,
    s.id AS sale_id,
    s.customer_id,
    c.full_name AS customer_name,
    COALESCE(s.total_amount, 0)::NUMERIC(14,2) AS sale_total_amount,
    COALESCE(ss.avg_unit_price, 0)::NUMERIC(14,2) AS sale_unit_price,
    pay.payment_summary,
    im.notes,
    LOWER(CONCAT_WS(' ',
        p.name,
        p.imei_1,
        p.imei_2,
        p.serial_number,
        c.full_name,
        st.name
    )) AS search_blob
FROM public.inventory_movement_items imi
JOIN public.inventory_movements im
    ON im.id = imi.movement_id
LEFT JOIN public.sales s
    ON im.ref_table = 'sales'
   AND s.id = im.ref_id
LEFT JOIN sale_summary ss
    ON ss.sale_id = s.id
LEFT JOIN public.products p
    ON p.id = ss.sample_product_id
LEFT JOIN public.stores st
    ON st.id = im.store_id
LEFT JOIN public.customers c
    ON c.id = s.customer_id
LEFT JOIN sale_payments_summary pay
    ON pay.sale_id = s.id;
$sql$, payment_label_expr);
        END IF;
    ELSE
        EXECUTE format($sql$
CREATE OR REPLACE VIEW public.view_product_lifecycle_events AS
WITH sale_payments_summary AS (
    SELECT
        sp.sale_id,
        STRING_AGG(
            CONCAT(COALESCE(%s, sp.payment_method::TEXT), ': ', TO_CHAR(COALESCE(sp.amount, 0), 'FM999999990.00')),
            ' | ' ORDER BY sp.payment_date, sp.id
        ) AS payment_summary
    FROM public.sale_payments sp
    GROUP BY sp.sale_id
),
sale_item_rows AS (
    SELECT
        si.id AS event_id,
        %s AS company_id,
        s.created_at AS occurred_at,
        %s AS store_id,
        %s AS warehouse_id,
        si.product_id,
        COALESCE(si.quantity, 0)::INTEGER AS qty,
        COALESCE(si.unit_price, 0)::NUMERIC(14,2) AS unit_price,
        COALESCE(si.total_price, COALESCE(si.quantity, 0) * COALESCE(si.unit_price, 0), COALESCE(s.total_amount, 0))::NUMERIC(14,2) AS line_amount,
        %s AS item_serial,
        %s AS notes,
        si.sale_id
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
)
SELECT
    sir.event_id,
    sir.company_id,
    sir.occurred_at,
    'sale'::text AS movement_type,
    'Venta'::text AS movement_label,
    sir.product_id,
    NULL::uuid AS variant_id,
    p.name AS product_name,
    p.imei_1,
    p.imei_2,
    p.serial_number,
    sir.item_serial AS serialized_serial,
    sir.qty,
    0::NUMERIC(14,2) AS unit_cost,
    sir.line_amount,
    sir.warehouse_id,
    NULL::text AS warehouse_name,
    sir.store_id,
    st.name AS store_name,
    'sales'::text AS ref_table,
    sir.sale_id AS ref_id,
    NULL::uuid AS purchase_receipt_id,
    NULL::uuid AS purchase_order_id,
    NULL::uuid AS supplier_id,
    NULL::text AS supplier_name,
    sir.sale_id,
    s.customer_id,
    c.full_name AS customer_name,
    COALESCE(s.total_amount, 0)::NUMERIC(14,2) AS sale_total_amount,
    sir.unit_price AS sale_unit_price,
    pay.payment_summary,
    sir.notes,
    LOWER(CONCAT_WS(' ',
        p.name,
        p.imei_1,
        p.imei_2,
        p.serial_number,
        sir.item_serial,
        c.full_name,
        st.name
    )) AS search_blob
FROM sale_item_rows sir
LEFT JOIN public.sales s
    ON s.id = sir.sale_id
LEFT JOIN public.products p
    ON p.id = sir.product_id
LEFT JOIN public.stores st
    ON st.id = sir.store_id
LEFT JOIN public.customers c
    ON c.id = s.customer_id
LEFT JOIN sale_payments_summary pay
    ON pay.sale_id = sir.sale_id;
$sql$, payment_label_expr, sales_company_expr, sales_store_expr, sales_warehouse_expr, item_serial_expr, sales_notes_expr);
    END IF;

    EXECUTE $comment$
    COMMENT ON VIEW public.view_product_lifecycle_events IS
    'Timeline unificada de trazabilidad por producto/serial: compras, transferencias, ajustes y ventas.';
    $comment$;
END $$;
