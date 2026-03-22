-- F4: reconciliacion por empresa
-- Reemplazar {{COMPANY_ID}} por el UUID objetivo

SELECT 'products' AS entity, COUNT(*)::bigint AS total FROM products WHERE company_id = '{{COMPANY_ID}}'::uuid
UNION ALL
SELECT 'customers', COUNT(*)::bigint FROM customers WHERE company_id = '{{COMPANY_ID}}'::uuid
UNION ALL
SELECT 'sales', COUNT(*)::bigint FROM sales WHERE company_id = '{{COMPANY_ID}}'::uuid
UNION ALL
SELECT 'sale_items', COUNT(*)::bigint FROM sale_items WHERE company_id = '{{COMPANY_ID}}'::uuid
UNION ALL
SELECT 'sale_payments', COUNT(*)::bigint FROM sale_payments WHERE company_id = '{{COMPANY_ID}}'::uuid
ORDER BY 1;

SELECT COALESCE(location_bin, 'SIN_UBICACION') AS location_bin, COUNT(*)::bigint AS products
FROM products
WHERE company_id = '{{COMPANY_ID}}'::uuid
GROUP BY 1
ORDER BY 1;

SELECT
  (created_at AT TIME ZONE 'America/Lima')::date AS day,
  COUNT(*)::bigint AS sales_count,
  SUM(total_amount)::numeric(14,2) AS total_sales
FROM sales
WHERE company_id = '{{COMPANY_ID}}'::uuid
GROUP BY 1
ORDER BY 1;

SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.total_amount,
  COALESCE(SUM(si.total_price), 0)::numeric(14,2) AS items_total,
  (s.total_amount - COALESCE(SUM(si.total_price), 0))::numeric(14,2) AS diff
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
WHERE s.company_id = '{{COMPANY_ID}}'::uuid
GROUP BY s.id, s.invoice_number, s.total_amount
HAVING ABS(s.total_amount - COALESCE(SUM(si.total_price), 0)) > 0.01
ORDER BY ABS(s.total_amount - COALESCE(SUM(si.total_price), 0)) DESC
LIMIT 200;

SELECT
  s.id AS sale_id,
  s.invoice_number,
  s.total_amount,
  COALESCE(SUM(sp.amount), 0)::numeric(14,2) AS paid_total,
  (s.total_amount - COALESCE(SUM(sp.amount), 0))::numeric(14,2) AS diff
FROM sales s
LEFT JOIN sale_payments sp ON sp.sale_id = s.id
WHERE s.company_id = '{{COMPANY_ID}}'::uuid
GROUP BY s.id, s.invoice_number, s.total_amount
HAVING ABS(s.total_amount - COALESCE(SUM(sp.amount), 0)) > 0.01
ORDER BY ABS(s.total_amount - COALESCE(SUM(sp.amount), 0)) DESC
LIMIT 200;
