-- F0: preflight tecnico (ejecutar con psql o Supabase SQL editor)

SELECT
  name AS relation,
  to_regclass(name) IS NOT NULL AS exists
FROM unnest(ARRAY[
  'public.companies',
  'public.stores',
  'public.products',
  'public.customers',
  'public.sales',
  'public.sale_items',
  'public.sale_payments',
  'public.company_receipt_settings',
  'public.inventory_balances',
  'reporting.v_sales_fact',
  'reporting.v_sale_items_fact',
  'reporting.v_payments_fact',
  'reporting.v_inventory_snapshot',
  'reporting.v_sales_operations_detail',
  'public.agent_query_logs'
]) AS t(name)
ORDER BY 1;

SELECT 'products' AS table_name, COUNT(*)::bigint AS null_company_rows FROM public.products WHERE company_id IS NULL
UNION ALL
SELECT 'customers', COUNT(*)::bigint FROM public.customers WHERE company_id IS NULL
UNION ALL
SELECT 'sales', COUNT(*)::bigint FROM public.sales WHERE company_id IS NULL
UNION ALL
SELECT 'sale_items', COUNT(*)::bigint FROM public.sale_items WHERE company_id IS NULL
UNION ALL
SELECT 'sale_payments', COUNT(*)::bigint FROM public.sale_payments WHERE company_id IS NULL
ORDER BY 1;

SELECT
  (SELECT COUNT(*) FROM reporting.v_sales_fact) AS sales_fact_rows,
  (SELECT COUNT(*) FROM reporting.v_sale_items_fact) AS sale_items_fact_rows,
  (SELECT COUNT(*) FROM reporting.v_payments_fact) AS payments_fact_rows,
  (SELECT COUNT(*) FROM reporting.v_inventory_snapshot) AS inventory_snapshot_rows,
  (SELECT COUNT(*) FROM reporting.v_sales_operations_detail) AS sales_operations_rows;
