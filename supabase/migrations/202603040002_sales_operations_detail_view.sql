-- Reporting view for operational lookup queries (DNI/IMEI/SN)
-- Date: 2026-03-04

CREATE OR REPLACE VIEW reporting.v_sales_operations_detail AS
WITH payment_methods_by_sale AS (
    SELECT
        sp.sale_id,
        string_agg(
            DISTINCT COALESCE(NULLIF(sp.payment_method_label, ''), sp.payment_method::text),
            ', ' ORDER BY COALESCE(NULLIF(sp.payment_method_label, ''), sp.payment_method::text)
        ) AS payment_methods
    FROM public.sale_payments sp
    GROUP BY sp.sale_id
)
SELECT
    si.id AS sale_item_id,
    si.sale_id,
    COALESCE(si.company_id, s.company_id, p.company_id, st.company_id, c.company_id, pr.company_id) AS company_id,
    s.store_id,
    st.name AS store_name,
    s.customer_id,
    c.doc_type AS customer_doc_type,
    c.doc_number AS customer_doc_number,
    c.full_name AS customer_name,
    s.seller_id,
    pr.full_name AS seller_name,
    si.product_id,
    p.name AS product_name,
    p.type AS product_type,
    si.quantity,
    si.unit_price,
    si.total_price AS item_total_amount,
    s.total_amount AS sale_total_amount,
    si.captured_imei,
    si.captured_serial,
    COALESCE(
        NULLIF(si.captured_imei, ''),
        NULLIF(si.captured_serial, ''),
        NULLIF(p.imei_1, ''),
        NULLIF(p.serial_number, '')
    ) AS lookup_code,
    COALESCE(pm.payment_methods, '') AS payment_methods,
    s.created_at AS created_at_utc,
    timezone('America/Lima', s.created_at) AS created_at_peru,
    (timezone('America/Lima', s.created_at))::date AS created_date_peru,
    to_char(timezone('America/Lima', s.created_at), 'HH24:MI:SS') AS created_time_peru
FROM public.sale_items si
LEFT JOIN public.sales s ON s.id = si.sale_id
LEFT JOIN public.products p ON p.id = si.product_id
LEFT JOIN public.stores st ON st.id = s.store_id
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.profiles pr ON pr.id = s.seller_id
LEFT JOIN payment_methods_by_sale pm ON pm.sale_id = si.sale_id
WHERE COALESCE(si.company_id, s.company_id, p.company_id, st.company_id, c.company_id, pr.company_id) IS NOT NULL;

GRANT SELECT ON reporting.v_sales_operations_detail TO authenticated, service_role;
