-- F5: QA operativo por empresa
-- Reemplazar placeholders segun prueba

-- 1) Por DNI
SELECT
  sale_id,
  day,
  time,
  customer_name,
  customer_doc_number,
  product_name,
  quantity,
  unit_price,
  item_total_amount,
  sale_total_amount,
  payment_methods,
  captured_imei,
  captured_serial,
  store_name,
  seller_name
FROM reporting.v_sales_operations_detail
WHERE company_id = '{{COMPANY_ID}}'::uuid
  AND customer_doc_number = '{{DNI}}'
ORDER BY day DESC, time DESC
LIMIT 200;

-- 2) Por IMEI
SELECT
  sale_id,
  day,
  time,
  customer_name,
  customer_doc_number,
  product_name,
  quantity,
  unit_price,
  item_total_amount,
  sale_total_amount,
  payment_methods,
  captured_imei,
  captured_serial,
  store_name,
  seller_name
FROM reporting.v_sales_operations_detail
WHERE company_id = '{{COMPANY_ID}}'::uuid
  AND (captured_imei = '{{IMEI}}' OR lookup_code = '{{IMEI}}')
ORDER BY day DESC, time DESC
LIMIT 200;
