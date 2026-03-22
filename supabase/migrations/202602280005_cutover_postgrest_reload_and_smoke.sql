-- Cutover PostgREST Reload + Smoke Checks
-- Date: 2026-02-28
-- Purpose: refresh schema cache and verify critical paths.

NOTIFY pgrst, 'reload schema';

SELECT
    now() AS verified_at_utc,
    to_regprocedure('public.rpc_create_sale(uuid,uuid,uuid,uuid,uuid,uuid,numeric,jsonb,jsonb,text,text)') IS NOT NULL
        AS has_canonical_rpc_create_sale,
    to_regclass('public.companies') IS NOT NULL AS has_companies_table,
    to_regclass('public.pos_shifts') IS NOT NULL AS has_pos_shifts_table;

SELECT
    COUNT(*) AS process_sale_atomic_overloads
FROM pg_proc p
JOIN pg_namespace n
    ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'process_sale_atomic';

CREATE OR REPLACE FUNCTION public._cutover_null_company_count(p_table TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_table REGCLASS;
    v_has_column BOOLEAN;
    v_count BIGINT;
BEGIN
    v_table := to_regclass(format('public.%I', p_table));
    IF v_table IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = v_table
          AND attname = 'company_id'
          AND NOT attisdropped
    )
    INTO v_has_column;

    IF NOT v_has_column THEN
        RETURN NULL;
    END IF;

    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE company_id IS NULL', p_table)
    INTO v_count;

    RETURN v_count;
END;
$$;

SELECT
    t.table_name,
    public._cutover_null_company_count(t.table_name) AS rows_with_null_company_id
FROM (
    VALUES
        ('profiles'),
        ('stores'),
        ('sales'),
        ('sale_items'),
        ('sale_payments')
) AS t(table_name)
ORDER BY t.table_name;

DROP FUNCTION IF EXISTS public._cutover_null_company_count(TEXT);
