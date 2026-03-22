-- Cutover Preflight
-- Date: 2026-02-28
-- Purpose: inspect current schema/rpc state before applying normalization scripts.
-- This script is read-only.

SELECT
    now() AS executed_at_utc,
    current_database() AS db_name,
    current_user AS db_user,
    current_setting('server_version') AS pg_version;

WITH expected_tables(table_name) AS (
    VALUES
        ('companies'),
        ('stores'),
        ('profiles'),
        ('user_store_assignments'),
        ('sales'),
        ('sale_items'),
        ('sale_payments'),
        ('pos_shifts'),
        ('shifts'),
        ('credits'),
        ('credit_installments')
)
SELECT
    table_name,
    to_regclass(format('public.%s', table_name)) IS NOT NULL AS exists_in_public
FROM expected_tables
ORDER BY table_name;

WITH expected_company_columns(table_name) AS (
    VALUES
        ('profiles'),
        ('stores'),
        ('user_store_assignments'),
        ('products'),
        ('customers'),
        ('sales'),
        ('sale_items'),
        ('sale_payments'),
        ('advances'),
        ('advance_movements'),
        ('credits'),
        ('credit_installments'),
        ('pos_shifts')
)
SELECT
    e.table_name,
    EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = e.table_name
          AND c.column_name = 'company_id'
    ) AS has_company_id
FROM expected_company_columns e
ORDER BY e.table_name;

SELECT
    p.proname AS function_name,
    p.oid::regprocedure::text AS signature
FROM pg_proc p
JOIN pg_namespace n
    ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('rpc_create_sale', 'process_sale_atomic')
ORDER BY p.proname, p.oid::regprocedure::text;

SELECT
    to_regprocedure('public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text)') IS NOT NULL
    AS has_canonical_rpc_create_sale;

SELECT
    COUNT(*) AS process_sale_atomic_overloads
FROM pg_proc p
JOIN pg_namespace n
    ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'process_sale_atomic';

SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_class c
JOIN pg_namespace n
    ON n.oid = c.relnamespace
JOIN pg_attribute a
    ON a.attrelid = c.oid
LEFT JOIN pg_attrdef d
    ON d.adrelid = c.oid
   AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname = 'sales'
  AND a.attname = 'id';
